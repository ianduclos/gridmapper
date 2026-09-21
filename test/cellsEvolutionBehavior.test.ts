import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { CellsHotPage } from "../src/pages/cells-hot.js"
import type { PageContext } from "../src/core/types.js"

const BASE = 1_900_000_000_000

type Snapshot = {
	selected: number[]
	muted: boolean[]
	evolvedRest: boolean[]
}

function rig(seed: number, allowSilence = false) {
	const sent: Array<{ path: string; args: any[] }> = []
	const clock: any = {
		running: false,
		rate: 10,
		tick: 0,
		lanes: [{ div: 1 }],
	}
	const c: PageContext = {
		size: { width: 16, height: 8 },
		modifiers: { held: new Set(), shift1: false, shift2: false },
		clock,
		slot: 1,
		slotLabel: "b",
		osc: { send: (path, ...args) => sent.push({ path, args }) },
		setDirty() {},
		setShift() {},
		focus() {},
		persist() {},
	}
	// The numeric constructor argument is the public deterministic-performance seed.
	// The cast lets this suite land independently of the engine change that adds it.
	const page = new (CellsHotPage as any)(seed) as CellsHotPage
	page.init(c)
	page.onOsc("/setting/rhythmWorld", ["kotekan"], c)
	if (allowSilence) page.onOsc("/setting/allowSilence", [true], c)
	clock.running = true
	vi.setSystemTime(BASE)
	page.onClock?.(clock, c)
	page.onOsc("/action/evolve", [], c)

	const tick = (pulse: number, timely = true) => {
		const now = BASE + pulse * 100
		vi.setSystemTime(now)
		page.onTick?.(pulse, 0, c, timely ? now : now - 101)
	}
	const view = () =>
		JSON.parse(sent.filter((x) => x.path.endsWith("/view")).at(-1)!.args[0])
	const snapshot = (): Snapshot => {
		const v = view()
		return {
			selected: [...v.selected],
			muted: [...v.muted],
			evolvedRest: [...v.evolvedRest],
		}
	}
	return { page, c, sent, tick, view, snapshot }
}

function runBeats(r: ReturnType<typeof rig>, throughBeat: number) {
	const history: Snapshot[] = []
	for (let beat = 0; beat <= throughBeat; beat++) {
		r.tick(beat * 3)
		history.push(r.snapshot())
	}
	return history
}

function findRest(r: ReturnType<typeof rig>, maxBeat = 600) {
	for (let beat = 0; beat <= maxBeat; beat++) {
		r.tick(beat * 3)
		if (r.view().evolvedRest.some(Boolean)) return beat
	}
	throw new Error(`seed did not produce an evolution rest within ${maxBeat} beats`)
}

describe("Cells Hot seeded evolution behavior", () => {
	beforeEach(() => vi.useFakeTimers())
	afterEach(() => vi.useRealTimers())

	it("replays the same evolution decisions for the same seed across 100 beats", () => {
		const a = rig(0x5eed)
		const b = rig(0x5eed)
		const other = rig(0x5eee)
		const replay = runBeats(a, 100)
		expect(runBeats(b, 100)).toEqual(replay)
		expect(runBeats(other, 100)).not.toEqual(replay)
	})

	it("offers evolution every 2–4 beats and spends about half the opportunities as no-ops", () => {
		const r = rig(0x51a7)
		const internal = r.page as any
		let prior = r.snapshot()
		let scheduled = internal.nextEvolveBeat as number
		const gaps: number[] = []
		let opportunities = 0
		let noops = 0

		for (let beat = 0; beat <= 360; beat++) {
			r.tick(beat * 3)
			if (beat !== scheduled) continue
			opportunities++
			const next = internal.nextEvolveBeat as number
			gaps.push(next - beat)
			const now = r.snapshot()
			if (JSON.stringify(now) === JSON.stringify(prior)) noops++
			prior = now
			scheduled = next
		}

		expect(opportunities).toBeGreaterThan(100)
		expect(gaps.every((gap) => gap >= 2 && gap <= 4)).toBe(true)
		expect(noops / opportunities).toBeGreaterThan(0.35)
		expect(noops / opportunities).toBeLessThan(0.65)
	})

	it("changes only authored linked tuples and leaves foundation rows unchanged", () => {
		const r = rig(1717)
		const initial = r.snapshot()
		const history = runBeats(r, 180)
		let linkedChanges = 0
		let previous = initial
		for (const state of history) {
			expect(state.selected.slice(2)).toEqual(initial.selected.slice(2))
			expect(state.selected[0]).toBe(state.selected[1])
			if (state.selected[0] !== previous.selected[0]) linkedChanges++
			previous = state
		}
		expect(linkedChanges).toBeGreaterThan(5)
	})

	it("treats one locked row as a lock on its whole linked group", () => {
		const r = rig(222, true)
		const initial = r.snapshot()
		r.page.onOsc("/lock/0", [], r.c)
		for (const state of runBeats(r, 240)) {
			expect(state.selected.slice(0, 2)).toEqual(initial.selected.slice(0, 2))
			expect(state.evolvedRest.slice(0, 2)).toEqual([false, false])
		}
	})

	it("protects a manually chosen linked group for eight beats", () => {
		const r = rig(808)
		r.tick(0)
		r.page.onOsc("/cell/0/1", [], r.c)
		const internal = r.page as any
		expect(internal.protectedUntilBeat.slice(0, 2)).toEqual([8, 8])
		for (let beat = 1; beat < 8; beat++) {
			r.tick(beat * 3)
			expect(r.view().selected.slice(0, 2)).toEqual([1, 0])
		}
	})

	it("protects linked rows even when an ensemble reapplies their current choices", () => {
		const r = rig(909)
		r.tick(0)
		r.page.onOsc("/ensemble/0", [], r.c)
		expect((r.page as any).protectedUntilBeat.slice(0, 2)).toEqual([8, 8])
		for (let beat = 1; beat < 8; beat++) {
			r.tick(beat * 3)
			expect(r.view().selected.slice(0, 2)).toEqual([0, 0])
		}
	})

	it("keeps a manual mute through automatic rest and rejoin", () => {
		const r = rig(31337, true)
		r.page.onOsc("/mute/0", [], r.c)
		const restBeat = findRest(r)
		expect(r.view().evolvedRest.slice(0, 2)).toEqual([true, true])

		for (let beat = restBeat + 1; beat <= restBeat + 300; beat++) {
			r.tick(beat * 3)
			const v = r.view()
			expect(v.muted[0]).toBe(true)
			if (!v.evolvedRest[0]) {
				expect(v.evolvedRest[1]).toBe(false)
				return
			}
		}
		throw new Error("evolution did not rejoin after its temporary rest")
	})

	it("clears transient rests when optional silence is disabled", () => {
		const silenceOff = rig(4444, true)
		findRest(silenceOff)
		silenceOff.page.onOsc("/setting/allowSilence", [false], silenceOff.c)
		expect(silenceOff.view().evolvedRest).toEqual(new Array(6).fill(false))
	})

	it("clears transient rests when evolution is disabled", () => {
		const evolutionOff = rig(5555, true)
		findRest(evolutionOff)
		evolutionOff.page.onOsc("/action/evolve", [], evolutionOff.c)
		expect(evolutionOff.view().evolving).toBe(false)
		expect(evolutionOff.view().evolvedRest).toEqual(new Array(6).fill(false))
	})

	it("does not consume an evolution opportunity while a world change is pending", () => {
		const r = rig(707)
		r.tick(0)
		const scheduled = (r.page as any).nextEvolveBeat as number
		r.page.onOsc("/setting/rhythmWorld", ["ngon"], r.c)
		r.tick(scheduled * 3, false)
		expect(r.view().pendingWorldId).toBe("ngon")
		expect((r.page as any).nextEvolveBeat).toBe(scheduled)

		r.tick((scheduled + 1) * 3)
		expect(r.view().worldId).toBe("ngon")
	})
})
