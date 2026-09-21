import { afterEach, describe, expect, it, vi } from "vitest"
import { CellsHotPage } from "../src/pages/cells-hot.js"
import type { PageContext } from "../src/core/types.js"

function rig(world = "manjanin") {
	const sent: any[] = [],
		saved: any[] = []
	const state: any = {
		running: false,
		rate: 10,
		tick: 0,
		lanes: [{ div: 1 }, { div: 1 }, { div: 1 }, { div: 1 }],
	}
	const c: PageContext = {
		size: { width: 16, height: 8 },
		modifiers: { held: new Set(), shift1: false, shift2: false },
		clock: state,
		slot: 1,
		slotLabel: "b",
		setDirty() {},
		setShift() {},
		focus() {},
		persist(state) {
			saved.push(state)
		},
		osc: {
			send(path, ...args) {
				sent.push({ path, args })
			},
		},
	}
	const p = new CellsHotPage()
	p.init(c)
	p.restore({ rhythmWorld: world, humanizeMs: 0 }, c)
	const action = (path: string, args: any[] = []) => p.onOsc(path, args, c)
	const tick = (n: number, now = 1000 + (n - 1) * 100) => {
		vi.setSystemTime(now)
		p.onTick(n, 0, c, 1000 + (n - 1) * 100)
	}
	const packets = () =>
		sent
			.filter((x) => x.path.endsWith("/cells"))
			.map((x) => JSON.parse(x.args[0]))
	const view = () =>
		JSON.parse(sent.filter((x) => x.path.endsWith("/view")).at(-1).args[0])
	return {
		p,
		c,
		action,
		tick,
		packets,
		view,
		saved,
		start() {
			state.running = true
			p.onClock(state, c)
		},
	}
}
afterEach(() => vi.useRealTimers())
describe("Cells v2 independent acceptance", () => {
	it("selected web cell mutes and rejoins without manufacturing an attack", () => {
		vi.useFakeTimers()
		vi.setSystemTime(1000)
		const r = rig()
		r.start()
		r.tick(1)
		r.action("/cell/4/0")
		expect(r.view().muted[4]).toBe(true)
		expect(r.packets().at(-1)).toMatchObject({
			type: "replace",
			voice: 5,
			events: [],
		})
		vi.setSystemTime(1020)
		r.action("/cell/4/0")
		expect(r.view().muted[4]).toBe(false)
		expect(
			r
				.packets()
				.at(-1)
				.events.every((e: any) => e.onsetMs >= 1120),
		).toBe(true)
	})
	it("a different cell overrides mute even on an evolution-locked row", () => {
		vi.useFakeTimers()
		vi.setSystemTime(1000)
		const r = rig()
		r.action("/lock/4")
		r.action("/cell/4/0")
		r.action("/cell/4/1")
		expect(r.view()).toMatchObject({
			selected: [0, 0, 0, 0, 1, 0],
			locks: [false, false, false, false, true, false],
			muted: [false, false, false, false, false, false],
		})
	})
	it("default decay equals duration, stretch leaves short notes unchanged, scale multiplies both", () => {
		vi.useFakeTimers()
		vi.setSystemTime(1000)
		const events = (s: number, k: number) => {
			const r = rig("horn-relay")
			r.action("/setting/durationMode", ["decay"])
			r.action("/setting/decayScale", [s])
			r.action("/setting/decayStretch", [k])
			r.action("/setting/decayThreshold", [1])
			r.start()
			const all: any[] = []
			for (let n = 1; n < 49; n++) {
				r.tick(n)
				all.push(...r.packets().at(-1).events)
			}
			return all
		}
		const basic = events(1, 1),
			stretched = events(1, 4),
			scaled = events(2, 4)
		expect(basic.length).toBeGreaterThan(0)
		basic.forEach((e: any, i: number) => {
			expect(e.decayMs).toBeCloseTo(e.durationMs)
			expect(stretched[i].durationMs).toBe(e.durationMs)
			expect(stretched[i].decayMs).toBeCloseTo(
				Math.min(e.durationMs, 100) + 4 * Math.max(0, e.durationMs - 100),
			)
			expect(scaled[i].decayMs).toBeCloseTo(2 * stretched[i].decayMs)
		})
	})
	it("silence preferences persist, but playback and evolution restore stopped", () => {
		vi.useFakeTimers()
		vi.setSystemTime(1000)
		const r = rig()
		r.action("/setting/allowSilence", [true])
		r.action("/action/evolve")
		r.action("/lock/5")
		const saved = r.p.serialize()
		const s = rig()
		s.p.restore(saved, s.c)
		expect(s.p.serialize()).toMatchObject({
			allowSilence: true,
			locks: [false, false, false, false, false, true],
		})
		expect(s.view().evolving).toBe(false)
		expect(s.packets()).toHaveLength(0)
	})
})

describe("World boundaries and deadline acceptance", () => {
	it("commits despite 1ms callback lateness, persists arrival, and uses one shared cutoff", () => {
		vi.useFakeTimers()
		vi.setSystemTime(1000)
		const r = rig()
		r.start()
		r.tick(1)
		vi.setSystemTime(1050)
		r.action("/setting/rhythmWorld", ["kotekan"])
		r.tick(2, 1101)
		r.tick(3, 1201)
		expect(r.view().worldId).toBe("manjanin")
		r.tick(4, 1301)
		expect(r.view().worldId).toBe("kotekan")
		const q = r.packets().at(-1)
		expect(q.type).toBe("replaceAll")
		expect(q.cutoffMs).toBe(1400)
		expect(q.events.every((e: any) => e.onsetMs >= 1400)).toBe(true)
		expect(q.events.find((e: any) => e.voice === 1).onsetMs).toBe(1400)
		expect(q.events.find((e: any) => e.voice === 1).durationMs).toBeCloseTo(
			52.5,
		)
		expect(r.saved.at(-1).rhythmWorld).toBe("kotekan")
		const ids = r
			.packets()
			.flatMap((q) => q.events ?? [])
			.map((e: any) => e.id)
		expect(new Set(ids).size).toBe(ids.length)
	})
	it("stages tuning with its world, discards superseded recommendation, and never reports an inactive tuning active", () => {
		vi.useFakeTimers()
		vi.setSystemTime(1000)
		const r = rig("woloso")
		expect(r.view().recommendationActive).toBe(false)
		r.start()
		r.tick(1)
		r.action("/setting/rhythmWorld", ["kotekan"])
		r.action("/action/applyRecommendation")
		expect(r.view().recommendationPending).toBe(true)
		expect((r.p.serialize() as any).tuning).toBe("tritave")
		r.action("/setting/rhythmWorld", ["ngon"])
		expect(r.view().recommendationPending).toBe(false)
		for (let n = 2; n <= 4; n++) r.tick(n)
		expect((r.p.serialize() as any).tuning).toBe("tritave")
		r.action("/setting/rhythmWorld", ["kotekan"])
		r.action("/action/applyRecommendation")
		for (let n = 5; n <= 7; n++) r.tick(n)
		expect(r.saved.at(-1)).toMatchObject({
			rhythmWorld: "kotekan",
			tuning: "pentatonic-model",
		})
		expect(r.view().recommendationActive).toBe(true)
	})
	it("explicit stale deadlines skip expired attacks and report the loss, never re-anchor to callback arrival", () => {
		vi.useFakeTimers()
		vi.setSystemTime(1000)
		const r = rig()
		r.start()
		r.tick(1, 1250)
		expect(r.packets().at(-1)).toMatchObject({
			type: "sync",
			deadlineMs: 1000,
			callbackLateMs: 250,
			events: [],
		})
		expect(r.packets().at(-1).skippedLateEvents).toBeGreaterThan(0)
		r.tick(4, 1307)
		const q = r.packets().at(-1)
		expect(q.events.some((e: any) => e.onsetMs === 1400)).toBe(true)
		expect(q.events.every((e: any) => e.onsetMs < 1500)).toBe(true)
	})
	it("maps included tunings to row one and Hotelier scales to row two", () => {
		const r = rig()
		r.p.onKey({ x: 3, y: 6, s: 1 }, r.c)
		r.p.onKey({ x: 6, y: 0, s: 1 }, r.c)
		expect((r.p.serialize() as any).tuning).toBe("tritave")
		r.p.onKey({ x: 1, y: 1, s: 1 }, r.c)
		expect((r.p.serialize() as any).tuning).toBe("hotelier-12edo")
		r.p.onKey({ x: 5, y: 0, s: 1 }, r.c)
		expect((r.p.serialize() as any).tuning).toBe("heptatonic-model")
	})
})
