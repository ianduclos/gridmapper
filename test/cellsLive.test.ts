import { describe, expect, it, vi } from "vitest"
import {
	CellsHotPage,
	PULSE_RATE,
	bpmToPulseRate,
	worldCyclePulses,
	playheadLevel,
	pulseRateToBpm,
} from "../src/pages/cells-hot.js"
import { ledIndex, type PageContext } from "../src/core/types.js"

const rig = () => {
	const sent: any[] = [],
		control: string[] = [],
		saved: any[] = []
	const modifiers = { held: new Set<string>(), shift1: false, shift2: false }
	const clock: any = {
		running: false,
		rate: 20,
		tick: 0,
		lanes: [{ source: "internal", div: 2 }, { div: 1 }, { div: 1 }, { div: 1 }],
	}
	const ctx: PageContext = {
		size: { width: 16, height: 8 },
		slot: 1,
		slotLabel: "b",
		modifiers: modifiers as any,
		clock,
		osc: { send: (path, ...args) => sent.push({ path, args }) },
		setDirty() {},
		setShift: (_which, down) => {
			modifiers.shift1 = down
		},
		focus() {},
		persist: (s) => {
			saved.push(s)
		},
		clockControl: {
			start: () => control.push("start"),
			stop: () => control.push("stop"),
			setRate: (r) => control.push(`rate:${r}`),
		},
	}
	const page = new CellsHotPage(7)
	page.init(ctx)
	const press = (x: number, y: number, s = 1) => page.onKey({ x, y, s }, ctx)
	const tap = (x: number, y: number) => press(x, y, 1)
	const patterns = () =>
		JSON.parse(sent.filter((m) => m.path.endsWith("/patterns")).at(-1).args[0])
	const view = () =>
		JSON.parse(sent.filter((m) => m.path.endsWith("/view")).at(-1).args[0])
	const packets = () =>
		sent.filter((m) => m.path.endsWith("/cells")).map((m) => JSON.parse(m.args[0]))
	return { page, ctx, clock, control, saved, press, tap, patterns, view, packets }
}

describe("cells-hot play toggle", () => {
	it("starts the transport, but stopping silences cells only", () => {
		const r = rig()
		r.tap(1, 7)
		r.tap(1, 7)
		// No "stop": other pages keep following the transport.
		expect(r.control).toEqual([`rate:${PULSE_RATE * 2}`, "start"])
		const types = () => r.packets().map((q: any) => q.type)
		expect(types()).toEqual(["start", "stop"])
		r.tap(2, 7) // the old Stop key does nothing now
		expect(r.control).toHaveLength(2)
	})
	it("joins an already running transport on its next beat", () => {
		const r = rig()
		r.clock.running = true
		r.page.onClock!({ ...r.clock }, r.ctx)
		r.page.onClock!({ ...r.clock, running: false }, r.ctx)
		r.page.onClock!({ ...r.clock, running: true }, r.ctx) // transport on, cells playing
		r.tap(1, 7) // cells off; the transport keeps going
		r.page.onTick!(2, 0, r.ctx)
		r.tap(1, 7) // cells back on mid-beat
		expect(r.control).toEqual([])
		r.page.onTick!(3, 0, r.ctx)
		expect(r.packets().at(-1).type).toBe("start") // waiting for the beat
		r.page.onTick!(4, 0, r.ctx) // ticks 1, 4, 7... are beats
		expect(r.packets().at(-1).type).toBe("sync")
	})
	it("a transport start after a preset load still plays cells", () => {
		const r = rig()
		r.page.onClock!({ ...r.clock, running: true }, r.ctx)
		r.page.restore!(r.page.serialize(), r.ctx)
		expect(r.page.render(r.ctx)[ledIndex(r.ctx.size, 1, 7)]).toBe(5) // stopped
		r.page.onClock!({ ...r.clock, running: false }, r.ctx)
		r.page.onClock!({ ...r.clock, running: true }, r.ctx)
		expect(r.page.render(r.ctx)[ledIndex(r.ctx.size, 1, 7)]).toBe(15)
	})
})

describe("cells-hot tempo", () => {
	it("shows the pulse rate as BPM of a three-pulse beat", () => {
		expect(pulseRateToBpm(PULSE_RATE)).toBeCloseTo(144.578, 2)
		expect(bpmToPulseRate(pulseRateToBpm(5.5))).toBeCloseTo(5.5)
	})
	it("accepts bpm and the legacy pulseRate key", () => {
		const r = rig()
		r.page.onOsc!("/setting/bpm", [120], r.ctx)
		expect((r.page.serialize() as any).pulseRate).toBeCloseTo(6)
		r.page.onOsc!("/setting/pulseRate", [4], r.ctx)
		expect((r.page.serialize() as any).bpm).toBeCloseTo(80)
	})
	it("adopts a transport rate edit so the next Play doesn't snap back", () => {
		const r = rig()
		r.page.onClock!({ ...r.clock, rate: 16 }, r.ctx) // someone edits the transport
		expect((r.page.serialize() as any).pulseRate).toBeCloseTo(8) // lane div 2
		r.control.length = 0
		r.tap(1, 7)
		expect(r.control[0]).toBe("rate:16")
	})
	it("ignores its own push and external lanes", () => {
		const r = rig()
		r.page.onClock!({ ...r.clock, rate: PULSE_RATE * 2 }, r.ctx)
		expect((r.page.serialize() as any).pulseRate).toBe(PULSE_RATE)
		const lanes = [{ source: "external", div: 1 }, ...r.clock.lanes.slice(1)]
		r.page.onClock!({ ...r.clock, rate: 3, lanes }, r.ctx)
		expect((r.page.serialize() as any).pulseRate).toBe(PULSE_RATE)
	})
})

describe("cells-hot gesture loopers", () => {
	/** Play, then tick with each deadline 100 ms apart (rate 20, div 2). Pulse p = tick - 1. */
	const playing = () => {
		vi.useFakeTimers()
		vi.setSystemTime(1000)
		const r = rig()
		r.tap(1, 7)
		const at = (p: number, extraMs = 0) => {
			vi.setSystemTime(1000 + p * 100 + extraMs)
		}
		const tickTo = (p: number) => {
			for (let n = (r as any).last ?? 1; n <= p + 1; n++) {
				vi.setSystemTime(1000 + (n - 1) * 100)
				r.page.onTick!(n, 0, r.ctx, 1000 + (n - 1) * 100)
			}
			;(r as any).last = p + 2
		}
		return { ...r, at, tickTo }
	}
	it("locks to whole world cycles and replays each move at its exact pulse", () => {
		const r = playing()
		expect(worldCyclePulses("horn-relay")).toBe(48) // 16 beats
		r.tap(12, 7) // arm looper 1
		expect(r.patterns()[0].state).toBe("recording")
		r.tickTo(4)
		r.at(4, 50)
		r.tap(4, 0) // row 0 → choice 2, half a pulse after pulse 4
		r.tickTo(20)
		r.tap(1, 1) // mute row 1 at pulse 20
		r.tickTo(50)
		r.tap(12, 7) // close near pulse 50: rounds to one 48-pulse cycle
		expect(r.patterns()[0]).toEqual({ state: "playing", beats: 16 })
		// Undo by hand; nothing is recording now, so nothing records.
		r.tap(3, 0)
		r.tap(1, 1)
		expect((r.page.serialize() as any).selected[0]).toBe(1)
		r.tickTo(52) // pulse 48 + 4.5 falls in the window [52, 53)
		const s = r.page.serialize() as any
		expect(s.selected[0]).toBe(2)
		const move = r.packets().filter((q: any) => q.type === "replace").at(-1)
		expect(move).toMatchObject({ voice: 1, cutoffMs: 1000 + 52 * 100 + 100 + 50 })
		r.tickTo(68)
		expect((r.page.serialize() as any).muted[1]).toBe(true)
		expect((r.page.serialize() as any).patterns[0].events).toHaveLength(3) // cell/0, mute/0, mute/1
		r.page.dispose(r.ctx)
		vi.useRealTimers()
	})
	it("records nothing while cells is stopped", () => {
		const r = rig()
		r.tap(12, 7)
		r.tap(4, 0)
		r.tap(12, 7) // closing an empty take empties it
		expect(r.patterns()[0].state).toBe("empty")
	})
	it("shift at x0 + looper clears; restore brings loops back paused", () => {
		const r = playing()
		r.tap(13, 7)
		r.tickTo(3)
		r.tap(4, 7) // ensemble 0
		r.tickTo(40)
		r.tap(13, 7)
		const saved = r.page.serialize()
		r.press(0, 7, 1)
		expect(r.page.render(r.ctx)[ledIndex(r.ctx.size, 0, 7)]).toBe(15)
		r.tap(13, 7)
		r.press(0, 7, 0)
		expect(r.patterns()[1].state).toBe("empty")
		r.page.restore!(saved, r.ctx)
		expect(r.patterns()[1]).toEqual({ state: "stopped", beats: 16 })
		r.page.dispose(r.ctx)
		vi.useRealTimers()
	})
	it("a take still recording when cells stops keeps every move", () => {
		const r = playing()
		r.tap(12, 7)
		r.tickTo(60)
		r.tap(4, 0) // pulse 60: second cycle
		r.tap(1, 7) // stop cells
		expect(r.patterns()[0]).toEqual({ state: "playing", beats: 16 })
		expect((r.page.serialize() as any).patterns[0]).toMatchObject({ lengthPulses: 48, anchor: 0 })
		vi.useRealTimers()
	})
	it("drops malformed loop events and the old wall-clock form on restore", () => {
		const r = rig()
		r.page.restore!(
			{
				patterns: [
					{
						lengthPulses: 48,
						anchor: 0,
						cycle: 48,
						events: [
							{ atPulse: 0, id: "cell/9", value: 1 },
							{ atPulse: 10, id: "mute/2", value: 5 },
							{ atPulse: 20, id: "cell/1", value: 2 },
							{ atPulse: 60, id: "cell/1", value: 1 },
						],
					},
					{ lengthMs: 500, events: [{ atMs: 20, ctl: { id: "cell/1", value: 2 } }] },
				],
			},
			r.ctx,
		)
		const s = r.page.serialize() as any
		expect(s.patterns[0].events).toHaveLength(1)
		expect(s.patterns[1].events).toHaveLength(0)
		expect(r.patterns()[1].state).toBe("empty")
	})
	it("marks the active ensemble in the view", () => {
		const r = rig()
		r.tap(5, 7)
		expect(r.view().activeEnsemble).toBe(1)
		r.tap(1, 0) // a mute breaks the match
		expect(r.view().activeEnsemble).toBe(-1)
	})
})

describe("cells-hot world change cues", () => {
	it("blinks the rhythm-bank key while a world is queued, then flashes the bars as it lands", () => {
		vi.useFakeTimers()
		vi.setSystemTime(1000)
		const r = rig()
		r.tap(1, 7)
		r.page.onTick!(1, 0, r.ctx, 1000)
		vi.setSystemTime(1050)
		r.page.onOsc!("/setting/rhythmWorld", ["woloso"], r.ctx) // lands on pulse 3
		const key = () => r.page.render(r.ctx)[ledIndex(r.ctx.size, 2, 6)]
		vi.setSystemTime(1320) // 1320 % 440 < 220: on
		expect(key()).toBe(15)
		vi.setSystemTime(1100)
		expect(key()).toBe(5)
		for (let n = 2; n <= 4; n++) {
			vi.setSystemTime(1000 + (n - 1) * 100)
			r.page.onTick!(n, 0, r.ctx, 1000 + (n - 1) * 100)
		}
		expect(r.view().worldId).toBe("woloso")
		vi.setSystemTime(1400) // landed at deadline 1300 + 100 ms buffer
		const bars = () => [5, 9, 14].map((x) => r.page.render(r.ctx)[ledIndex(r.ctx.size, x, 0)])
		expect(bars()).toEqual([10, 10, 10])
		vi.setSystemTime(1560)
		expect(bars()).not.toEqual([10, 10, 10])
		r.page.dispose(r.ctx)
		vi.useRealTimers()
	})
})

describe("cells-hot playhead", () => {
	it("glides the leading edge and dims silent rows", () => {
		expect(playheadLevel(0, 3.5, false)).toBe(5)
		expect(playheadLevel(3, 3.5, false)).toBe(3)
		expect(playheadLevel(4, 3.5, false)).toBe(1)
		expect(playheadLevel(0, 3.5, true)).toBe(2)
		expect(playheadLevel(4, 3.5, true)).toBe(0)
	})
})
