import { describe, expect, it, vi } from "vitest"
import {
	CellsHotPage,
	PULSE_RATE,
	bpmToPulseRate,
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
	return { page, ctx, clock, control, saved, press, tap, patterns, view }
}

describe("cells-hot play toggle", () => {
	it("one key starts then stops", () => {
		const r = rig()
		r.tap(1, 7)
		r.tap(1, 7)
		expect(r.control).toEqual([`rate:${PULSE_RATE * 2}`, "start", "stop"])
		r.tap(2, 7) // the old Stop key does nothing now
		expect(r.control).toHaveLength(3)
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
	it("records hand moves, replays them, and does not re-record playback", () => {
		vi.useFakeTimers()
		vi.setSystemTime(1000)
		const r = rig()
		r.tap(12, 7) // arm looper 1
		expect(r.patterns()[0].state).toBe("recording")
		r.tap(3, 0) // row 0 → choice 2 (loop starts here)
		vi.setSystemTime(1500)
		r.tap(4, 1) // mute row 1
		vi.setSystemTime(2000)
		r.tap(12, 7) // close: 1000 ms loop, now playing
		expect(r.patterns()[0]).toEqual({ state: "playing", ms: 1000 })
		// Undo by hand while looper 1 plays; looper 2 is not recording, so nothing records.
		r.tap(2, 0)
		r.tap(4, 1)
		expect((r.page.serialize() as any).selected[0]).toBe(1)
		r.page.onLooperTimer(2000)
		r.page.onLooperTimer(2600)
		const s = r.page.serialize() as any
		expect(s.selected[0]).toBe(2)
		expect(s.muted[1]).toBe(true)
		expect(s.patterns[0].events).toHaveLength(3) // cell/0, mute/0, mute/1 — no playback copies
		r.page.dispose(r.ctx)
		vi.useRealTimers()
	})
	it("shift at x0 + looper clears; restore brings loops back stopped", () => {
		vi.useFakeTimers()
		vi.setSystemTime(1000)
		const r = rig()
		r.tap(13, 7)
		r.tap(4, 7) // ensemble 0
		vi.setSystemTime(1400)
		r.tap(13, 7)
		const saved = r.page.serialize()
		r.press(0, 7, 1)
		expect(r.page.render(r.ctx)[ledIndex(r.ctx.size, 0, 7)]).toBe(15)
		r.tap(13, 7)
		r.press(0, 7, 0)
		expect(r.patterns()[1].state).toBe("empty")
		r.page.restore!(saved, r.ctx)
		expect(r.patterns()[1]).toEqual({ state: "stopped", ms: 400 })
		r.page.dispose(r.ctx)
		vi.useRealTimers()
	})
	it("drops malformed loop events on restore", () => {
		const r = rig()
		r.page.restore!(
			{
				patterns: [
					{
						lengthMs: 500,
						events: [
							{ atMs: 0, ctl: { id: "cell/9", value: 1 } },
							{ atMs: 10, ctl: { id: "mute/2", value: 5 } },
							{ atMs: 20, ctl: { id: "cell/1", value: 2 } },
						],
					},
				],
			},
			r.ctx,
		)
		expect((r.page.serialize() as any).patterns[0].events).toHaveLength(1)
	})
	it("marks the active ensemble in the view", () => {
		const r = rig()
		r.tap(5, 7)
		expect(r.view().activeEnsemble).toBe(1)
		r.tap(4, 0) // a mute breaks the match
		expect(r.view().activeEnsemble).toBe(-1)
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
