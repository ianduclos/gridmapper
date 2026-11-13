import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { CellsSurfacePage, pulseRateToBpm, bpmToPulseRate } from "../src/pages/cells-surface.js"
import { worlds } from "../src/data/cells-hot-worlds.js"
import { SharedStore } from "../src/core/sharedStore.js"
import { OscFloat, type PageContext } from "../src/core/types.js"

const SIZE = { width: 16, height: 8 }

// Cells' tempo and idk.surface's /surface/tempo are one number: the app's wins when they first
// meet, an edit on either side then goes to the other, and a world landing writes its own.
describe("cells-surface: one tempo with the app", () => {
	const mk = (withSurface = true) => {
		const out: Array<[string, ...any[]]> = []
		const rates: number[] = []
		const modifiers = { held: new Set<number>(), shift1: false, shift2: false }
		let hear: (path: string, args: any[]) => void = () => {}
		let listeners = 0
		const clock = { running: false, rate: 20, tick: 0, lanes: [{ div: 1 }, { div: 1 }, { div: 1 }, { div: 1 }] }
		const ctx = {
			size: SIZE, modifiers, slot: 1, slotLabel: "b", shared: new SharedStore(), clock,
			clockControl: { start() {}, stop() {}, setRate: (r: number) => rates.push(r) },
			osc: { send() {} },
			...(withSurface
				? {
						surface: {
							port: 57133,
							send: (path: string, ...a: any[]) => out.push([path, ...a.map((v) => (v instanceof OscFloat ? v.value : v))]),
							on: (fn: any) => { hear = fn; listeners++; return () => { listeners-- } },
						},
					}
				: {}),
			setDirty() {}, focus() {}, persist() {},
			setShift() {},
		} as unknown as PageContext
		const page = new CellsSurfacePage(3)
		page.init(ctx)
		const bpm = () => pulseRateToBpm((page.serialize() as any).pulseRate)
		const writes = () => out.filter((m) => m[0] === "/surface/tempo").map((m) => m[1])
		const say = (v: number) => hear("/surface/tempo", [v])
		return { page, ctx, out, rates, clock, bpm, writes, say, hear: (p: string, a: any[]) => hear(p, a), listeners: () => listeners }
	}
	beforeEach(() => { vi.useFakeTimers(); vi.setSystemTime(2_000_000) })
	afterEach(() => { vi.useRealTimers() })

	it("asks the app for its tempo when it loads, and again when the link says the app is back", () => {
		const r = mk()
		expect(r.out).toContainEqual(["/surface/get", "/surface/tempo"])
		r.out.length = 0
		r.hear("/link/up", [])
		expect(r.out).toEqual([["/surface/get", "/surface/tempo"]])
	})

	it("takes the app's tempo, converted as a /setting/bpm would, and pushes the transport rate when running", () => {
		const r = mk()
		r.say(97.5)
		expect(r.bpm()).toBeCloseTo(97.5)
		expect(r.rates).toEqual([]) // not running: nothing to push
		r.page.onOsc("/setting/rhythmWorld", ["sikuri"], r.ctx)
		r.page.onOsc("/setting/pulseRate", [bpmToPulseRate(80)], r.ctx)
		;(r.page as any).running = true
		r.rates.length = 0
		vi.advanceTimersByTime(1000)
		r.say(140)
		expect(r.bpm()).toBeCloseTo(140)
		expect(r.rates).toEqual([bpmToPulseRate(140)])
	})

	it("never writes back what it just heard", () => {
		const r = mk()
		r.say(97.5)
		r.say(110)
		expect(r.writes()).toEqual([])
	})

	it("a grid-side change is written to the app, as a float", () => {
		const r = mk()
		r.page.onOsc("/setting/bpm", [133], r.ctx)
		expect(r.writes()).toEqual([133])
		r.page.onOsc("/setting/pulseRate", [bpmToPulseRate(90)], r.ctx)
		expect(r.writes()).toEqual([133, 90])
	})

	it("an adopted transport edit is written too", () => {
		const r = mk()
		const lane = r.clock.lanes[0] as any
		lane.source = "internal"
		r.clock.rate = bpmToPulseRate(111)
		r.page.onClock(r.clock as any, r.ctx)
		expect(r.bpm()).toBeCloseTo(111)
		expect(r.writes()).toEqual([111])
	})

	it("does not ping-pong: the app reporting what was written, or a hair off it, changes nothing", () => {
		const r = mk()
		r.page.onOsc("/setting/bpm", [133], r.ctx)
		vi.advanceTimersByTime(1000)
		r.say(133)
		r.say(133.003)
		expect(r.bpm()).toBeCloseTo(133)
		expect(r.writes()).toEqual([133])
		// and a late answer inside the quiet window cannot undo a fresh write
		r.page.onOsc("/setting/bpm", [100], r.ctx)
		r.say(133)
		expect(r.bpm()).toBeCloseTo(100)
		// a genuinely new value from the app is taken, and not written back
		vi.advanceTimersByTime(1000)
		r.say(120)
		expect(r.bpm()).toBeCloseTo(120)
		expect(r.writes()).toEqual([133, 100])
	})

	it("the app wins when they meet: a link up takes its tempo even if it equals the last known one", () => {
		const r = mk()
		r.page.onOsc("/setting/bpm", [250], r.ctx) // app now holds 250
		vi.advanceTimersByTime(1000)
		r.page.onOsc("/setting/bpm", [140], r.ctx)
		vi.advanceTimersByTime(1000)
		r.hear("/link/up", [])
		r.say(250)
		expect(r.bpm()).toBeCloseTo(250)
	})

	it("clamps for the app: cells' 20..400 become 30..300 on the wire, and cells keeps its own", () => {
		const r = mk()
		r.page.onOsc("/setting/bpm", [25], r.ctx)
		expect(r.bpm()).toBeCloseTo(25)
		expect(r.writes()).toEqual([30])
		vi.advanceTimersByTime(1000)
		r.page.onOsc("/setting/bpm", [380], r.ctx)
		expect(r.bpm()).toBeCloseTo(380)
		expect(r.writes()).toEqual([30, 300])
		vi.advanceTimersByTime(1000)
		r.say(300) // the app repeating what it was given is not news
		expect(r.bpm()).toBeCloseTo(380)
	})

	it("a world landing writes its recommended tempo, after the app's tempo was taken", () => {
		const r = mk()
		r.say(100)
		vi.advanceTimersByTime(1000)
		r.page.onOsc("/setting/rhythmWorld", ["sikuri"], r.ctx)
		expect(r.bpm()).toBeCloseTo(worlds.sikuri.recommendedBpm!)
		expect(r.writes()).toEqual([worlds.sikuri.recommendedBpm])
	})

	it("ignores junk and other addresses", () => {
		const r = mk()
		r.say(NaN)
		r.hear("/surface/arp", [1])
		r.hear("/surface/tempo", [])
		expect(r.bpm()).toBeCloseTo(pulseRateToBpm(12 / 1.66))
	})

	it("stops listening when disposed", () => {
		const r = mk()
		expect(r.listeners()).toBe(1)
		r.page.dispose(r.ctx)
		expect(r.listeners()).toBe(0)
	})

	it("without a surface link nothing changes: no sends, tempo edits work as before", () => {
		const r = mk(false)
		r.page.onOsc("/setting/bpm", [133], r.ctx)
		expect(r.bpm()).toBeCloseTo(133)
		expect(r.out).toEqual([])
	})
})
