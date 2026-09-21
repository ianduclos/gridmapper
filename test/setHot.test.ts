import { describe, it, expect, vi, afterEach } from "vitest"
import { SetHotPage } from "../src/pages/set-hot.js"
import { ledIndex, type GridSize, type PageContext } from "../src/core/types.js"

const SIZE: GridSize = { width: 16, height: 8 }

function rig() {
	const sent: Array<{ path: string; args: any[] }> = []
	const modifiers = { held: new Set(), shift1: false, shift2: false }
	const ctx = {
		size: SIZE,
		modifiers,
		clock: { running: false, rate: 20, tick: 0, lanes: [] },
		osc: { send: (path: string, ...args: any[]) => sent.push({ path, args }) },
		slot: 5,
		slotLabel: "f",
		setDirty: () => {},
		setShift: (which: number, down: boolean) => { if (which === 1) modifiers.shift1 = down },
		focus: () => {},
		persist: () => {},
	} as unknown as PageContext
	const p = new SetHotPage()
	p.init(ctx)
	const voice = () => sent.filter((m) => m.path === "/grid/out/page/f/voice").map((m) => m.args)
	const key = (x: number, y: number, s: 0 | 1) => p.onKey({ x, y, s }, ctx)
	const tap = (x: number, y: number) => { key(x, y, 1); key(x, y, 0) }
	const at = (x: number, y: number) => p.render(ctx)[ledIndex(SIZE, x, y)]
	return { p, ctx, sent, voice, key, tap, at }
}

describe("set-hot layout", () => {
	it("voice keys toggle freeze/roll/bow on rows 6/5/4, voices 1-6 at cols 4-9", () => {
		const r = rig()
		r.tap(4, 6)
		r.tap(9, 4)
		r.tap(6, 5) // roll starts armed → this disarms voice 3
		expect(r.voice()).toEqual([[1, "freeze", 1], [6, "bow", 1], [3, "roll", 0]])
		expect(r.at(4, 6)).toBe(12)
		expect(r.at(5, 6)).toBe(2)
		r.tap(4, 6)
		expect(r.voice().at(-1)).toEqual([1, "freeze", 0])
	})

	it("damp is momentary on row 7", () => {
		const r = rig()
		r.key(5, 7, 1)
		expect(r.at(5, 7)).toBe(15)
		r.key(5, 7, 0)
		expect(r.voice()).toEqual([[2, "damp", 1], [2, "damp", 0]])
	})

	it("gaps and other rows do nothing", () => {
		const r = rig()
		for (const x of [1, 3, 10, 15]) r.tap(x, 6)
		for (const y of [0, 3]) r.tap(5, y)
		expect(r.voice()).toEqual([])
	})
})

describe("set-hot ALL column", () => {
	it("turns every voice on unless all six are, then all off — only changes go out", () => {
		const r = rig()
		r.tap(4, 6) // voice 1 already frozen
		r.sent.length = 0
		r.tap(2, 6)
		expect(r.voice()).toEqual([2, 3, 4, 5, 6].map((v) => [v, "freeze", 1]))
		expect(r.at(2, 6)).toBe(12)
		r.sent.length = 0
		r.tap(2, 6)
		expect(r.voice()).toHaveLength(6)
		expect(r.at(2, 6)).toBe(2)
	})

	it("reads 'some' when partly on; roll starts all armed", () => {
		const r = rig()
		expect(r.at(2, 5)).toBe(12) // roll
		r.tap(4, 4) // bow voice 1
		expect(r.at(2, 4)).toBe(6)
	})

	it("damp-all holds all six; a voice held alongside stays damped after", () => {
		const r = rig()
		r.key(7, 7, 1) // voice 4
		r.key(2, 7, 1)
		expect(r.voice().filter((m) => m[2] === 1)).toHaveLength(6)
		r.key(2, 7, 0)
		const offs = r.voice().filter((m) => m[2] === 0).map((m) => m[0])
		expect(offs).toEqual([1, 2, 3, 5, 6])
	})

	it("blur releases damp", () => {
		const r = rig()
		r.key(2, 7, 1)
		r.sent.length = 0
		r.p.onBlur(r.ctx)
		expect(r.voice()).toHaveLength(6)
	})
})

describe("set-hot from Max", () => {
	afterEach(() => { vi.useRealTimers() })

	it("syncs a switch without echoing it", () => {
		const r = rig()
		r.p.onOsc("/voice/3/freeze", [1], r.ctx)
		expect(r.at(6, 6)).toBe(12)
		expect(r.voice()).toEqual([])
		r.p.onOsc("/voice/3/damp", [1], r.ctx) // damp belongs to the hand
		expect(r.at(6, 7)).toBe(2)
	})

	it("draws triggered as a flash, then ringing, then idle on row 3", () => {
		vi.useFakeTimers()
		const r = rig()
		r.p.onOsc("/voice/2/state", [1], r.ctx)
		expect(r.at(5, 3)).toBe(15)
		vi.advanceTimersByTime(200)
		expect(r.at(5, 3)).toBe(5)
		r.p.onOsc("/voice/2/state", [2], r.ctx)
		expect(r.at(5, 3)).toBe(5)
		r.p.onOsc("/voice/2/state", [0], r.ctx)
		expect(r.at(5, 3)).toBe(0)
	})

	it("ignores out-of-range voices and junk", () => {
		const r = rig()
		r.p.onOsc("/voice/7/freeze", [1], r.ctx)
		r.p.onOsc("/voice/0/state", [1], r.ctx)
		r.p.onOsc("/voice/1/state", [9], r.ctx)
		r.p.onOsc("/voice/1/freeze", ["x"], r.ctx)
		for (let x = 4; x < 10; x++) expect(r.at(x, 3)).toBe(0)
		expect(r.at(4, 6)).toBe(2)
	})
})

describe("set-hot loopers (col 15 rows 0-3)", () => {
	afterEach(() => { vi.useRealTimers() })

	// Looper 0: freeze voice 1 on, hold damp on voice 2 for 100ms, freeze voice 1 off. 500ms.
	const record = (r: ReturnType<typeof rig>, idx = 0) => {
		r.tap(15, idx) // arm
		r.tap(4, 6) // freeze v1 on — starts the take
		vi.advanceTimersByTime(100)
		r.key(5, 7, 1)
		vi.advanceTimersByTime(100)
		r.key(5, 7, 0)
		vi.advanceTimersByTime(100)
		r.tap(4, 6) // freeze v1 off
		vi.advanceTimersByTime(200)
		r.tap(15, idx) // close → playing
	}
	const lap = (r: ReturnType<typeof rig>) => {
		r.sent.length = 0
		vi.advanceTimersByTime(500)
		return r.voice()
	}

	it("replays toggles and momentary damp, sending the same OSC", () => {
		vi.useFakeTimers()
		const r = rig()
		record(r)
		expect(lap(r)).toEqual([
			[1, "freeze", 1],
			[2, "damp", 1],
			[2, "damp", 0],
			[1, "freeze", 0],
		])
		expect(r.at(15, 0)).toBe(15)
	})

	it("a hand damp and a loop damp overlap without cutting each other off", () => {
		vi.useFakeTimers()
		const r = rig()
		record(r)
		r.key(5, 7, 1) // hold voice 2 by hand through the lap
		r.sent.length = 0
		vi.advanceTimersByTime(500)
		expect(r.voice().filter((m) => m[1] === "damp")).toEqual([])
		r.key(5, 7, 0)
		expect(r.voice().at(-1)).toEqual([2, "damp", 0])
	})

	it("stop pauses (releasing a held damp), shift 1 + press clears", () => {
		vi.useFakeTimers()
		const r = rig()
		record(r)
		vi.advanceTimersByTime(150) // inside the damp
		r.sent.length = 0
		r.tap(15, 0) // stop
		expect(r.voice()).toEqual([[2, "damp", 0]])
		expect(r.at(15, 0)).toBe(5)
		r.key(15, 7, 1)
		r.tap(15, 0)
		r.key(15, 7, 0)
		expect(r.at(15, 0)).toBe(1)
		expect(lap(r)).toEqual([])
	})

	it("loop playback is not recorded into another looper", () => {
		vi.useFakeTimers()
		const r = rig()
		record(r)
		r.tap(15, 1)
		vi.advanceTimersByTime(600)
		r.tap(15, 1) // nothing played by hand → back to empty
		expect((r.p.serialize() as any).patterns[1].events).toEqual([])
	})

	it("saves the loops, restores them stopped and silent", () => {
		vi.useFakeTimers()
		const a = rig()
		record(a)
		const cfg = a.p.serialize()
		const b = rig()
		b.p.restore(cfg, b.ctx)
		expect(b.voice()).toEqual([])
		expect(b.at(15, 0)).toBe(5)
		b.tap(15, 0) // play
		expect(lap(b).map((m) => m.slice(1))).toEqual([["freeze", 1], ["damp", 1], ["damp", 0], ["freeze", 0]])
		b.p.dispose(b.ctx)
	})

	it("restore drops junk events", () => {
		const r = rig()
		r.p.restore({ patterns: [{ lengthMs: 400, events: [
			{ atMs: 0, step: 9, on: true },
			{ atMs: 0, step: 0, on: false, ctl: { id: "explode/1", value: 1 } },
			{ atMs: 10, step: 0, on: false, ctl: { id: "bow/3", value: 1 } },
		] }] }, r.ctx)
		const ev = (r.p.serialize() as any).patterns[0].events
		expect(ev).toEqual([{ atMs: 10, step: 0, on: false, ctl: { id: "bow/3", value: 1 } }])
	})
})
