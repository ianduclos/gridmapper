import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"
import { ReelSurfacePage, parseLineState } from "../src/pages/reel-surface.js"
import { SharedStore } from "../src/core/sharedStore.js"
import { type PageContext, ledIndex, OscFloat } from "../src/core/types.js"

const SIZE = { width: 16, height: 8 }

describe("reel-surface: REEL pads and the step line", () => {
	const mk = (live = true) => {
		const out: Array<[string, ...any[]]> = []
		const modifiers = { held: new Set<number>(), shift1: false, shift2: false }
		let hear: (path: string, args: any[]) => void = () => {}
		const ctx = {
			size: SIZE, modifiers, slot: 3, slotLabel: "d", shared: new SharedStore(),
			clock: { running: false, rate: 20, tick: 0, lanes: [] },
			osc: { send() {} },
			surface: { port: 57133, send: (path: string, ...a: any[]) => out.push([path, ...a.map((v) => (v instanceof OscFloat ? v.value : v))]), on: (fn: any) => ((hear = fn), () => {}) },
			setDirty() {}, focus() {}, persist() {},
			setShift: (w: number, d: boolean) => { if (w === 1) modifiers.shift1 = d; else modifiers.shift2 = d },
		} as unknown as PageContext
		const page = new ReelSurfacePage(live)
		page.init(ctx)
		const key = (x: number, y: number, s: 0 | 1) => page.onKey({ x, y, s }, ctx)
		const tap = (x: number, y: number) => { key(x, y, 1); key(x, y, 0) }
		const sent = () => out.splice(0).filter((m) => m[0] !== "/surface/get" && m[0] !== "/surface/subscribe")
		const led = (x: number, y: number) => page.render(ctx)![ledIndex(SIZE, x, y)]
		const say = (p: string, v: any) => hear(p, [v])
		/** LEFT on lane 3, RIGHT on lane 5, sixteen slices each. */
		const lanes = () => {
			say("/surface/reel/line/left", 3); say("/surface/reel/line/right", 5)
			say("/surface/lane/3/reel/slices", 16); say("/surface/lane/5/reel/slices", 16)
			out.length = 0
		}
		return { page, ctx, out, key, tap, sent, led, say, lanes }
	}
	beforeEach(() => { vi.useFakeTimers(); vi.setSystemTime(2_000_000) })
	afterEach(() => { vi.useRealTimers() })

	it("off, it sends idk.surface nothing and its keys do nothing", () => {
		const r = mk(false)
		r.page.onFocus(r.ctx)
		r.tap(2, 7); r.tap(14, 7); r.tap(2, 0); r.tap(0, 2)
		vi.advanceTimersByTime(6000)
		expect(r.out).toEqual([])
		expect(r.led(2, 7)).toBe(0)
		r.page.dispose(r.ctx)
	})

	it("a pad fires its slice on the track's lane: pad 1 bottom left, counting right then up", () => {
		const r = mk(); r.lanes()
		r.tap(2, 7); r.tap(5, 7); r.tap(2, 6); r.tap(13, 4)
		expect(r.sent()).toEqual([
			["/surface/lane/3/reel/slice", 1, 1], ["/surface/lane/3/reel/slice", 4, 1],
			["/surface/lane/3/reel/slice", 5, 1], ["/surface/lane/5/reel/slice", 16, 1],
		])
	})

	it("a track with no lane, and pads past the lane's slices, are dark and silent", () => {
		const r = mk()
		r.tap(2, 7)
		expect(r.sent()).toEqual([])
		r.say("/surface/reel/line/left", 3); r.say("/surface/lane/3/reel/slices", 6)
		r.out.length = 0
		r.tap(4, 6) // pad 7
		expect(r.sent()).toEqual([])
		expect(r.led(4, 6)).toBe(0)
		expect(r.led(3, 6)).toBe(4) // pad 6
	})

	it("hold a pad, tap steps: writes the slice; the same slice again clears; one slice a step clears the other track", () => {
		const r = mk(); r.lanes()
		r.key(3, 7, 1); r.sent() // LEFT pad 2
		r.tap(2, 0); r.tap(13, 2)
		expect(r.sent()).toEqual([
			["/surface/reel/line/step", 1, 1, 2, 1, 0, 100, 0],
			["/surface/reel/line/step", 1, 36, 2, 1, 0, 100, 0],
		])
		r.tap(2, 0)
		expect(r.sent()).toEqual([["/surface/reel/line/clear", 1, 1]])
		r.key(3, 7, 0)
		expect(r.led(13, 2)).toBe(10) // mine
		r.key(10, 7, 1); r.sent() // RIGHT pad 1: RIGHT is now mine
		expect(r.led(13, 2)).toBe(4) // the other's
		r.tap(13, 2) // one slice a step: LEFT's goes
		expect(r.sent()).toEqual([["/surface/reel/line/step", 2, 36, 1, 1, 0, 100, 0]])
		r.key(10, 7, 0)
		expect(r.led(13, 2)).toBe(10)
		r.tap(13, 2) // no pad held: nothing
		expect(r.sent()).toEqual([])
	})

	it("one from each: a step holding both is brightest", () => {
		const r = mk(); r.lanes()
		r.page.onOsc("/setting/mode", ["one-each"], r.ctx)
		expect(r.sent()).toEqual([["/surface/reel/line/mode", "one-each"]])
		r.key(2, 7, 1); r.tap(4, 1); r.key(2, 7, 0)
		r.key(10, 7, 1); r.tap(4, 1); r.key(10, 7, 0)
		expect(r.led(4, 1)).toBe(15)
	})

	it("shift 1 + a step sets the length; steps past it are dark", () => {
		const r = mk(); r.lanes()
		r.key(0, 7, 1); r.tap(5, 1); r.key(0, 7, 0)
		expect(r.sent()).toEqual([["/surface/reel/line/length", 16]])
		expect(r.led(5, 1)).toBe(2)
		expect(r.led(6, 1)).toBe(0)
	})

	it("a key held: the centre picks the value, new steps take it, and a tapped step takes it", () => {
		const r = mk(); r.lanes()
		r.key(2, 7, 1); r.tap(2, 0); r.key(2, 7, 0); r.sent()
		r.key(6, 4, 1) // LEFT SPEED
		expect(r.led(7, 5)).toBe(15) // x1 showing
		r.tap(8, 4) // x2, top
		expect(r.led(7, 4)).toBe(15)
		r.tap(2, 0) // the written step takes x2
		r.tap(3, 0) // an empty step takes nothing
		r.key(6, 4, 0)
		expect(r.sent()).toEqual([["/surface/reel/line/step", 1, 1, 1, 2, 0, 100, 0]])
		expect(r.led(7, 4)).toBe(0) // centre dark again
		r.key(2, 7, 1); r.sent(); r.tap(4, 0); r.key(2, 7, 0)
		expect(r.sent()).toEqual([["/surface/reel/line/step", 1, 3, 1, 2, 0, 100, 0]])
	})

	it("a key lit AND a pad held: an empty step is written with the pad's slice and the track's values; one slice clears the other track", () => {
		const r = mk(); r.lanes()
		r.key(10, 7, 1); r.tap(5, 0); r.key(10, 7, 0); r.sent() // RIGHT pad 1 on step 4
		r.key(6, 4, 1); r.tap(8, 4) // LEFT SPEED x2, key still held
		r.key(3, 7, 1); r.sent() // LEFT pad 2 held
		r.tap(5, 0) // RIGHT's step, but empty for LEFT: LEFT writes it (one slice a step clears RIGHT's)
		r.tap(2, 0) // empty step
		expect(r.sent()).toEqual([
			["/surface/reel/line/step", 1, 4, 2, 2, 0, 100, 0],
			["/surface/reel/line/step", 1, 1, 2, 2, 0, 100, 0],
		])
		r.key(3, 7, 0)
		r.tap(4, 0) // key lit, no pad held, empty step: nothing
		expect(r.sent()).toEqual([])
		r.key(6, 4, 0)
	})

	it("a tapped key stays lit; ROLL's lit value pressed again is none; BLEND moves the lane's blend", () => {
		const r = mk(); r.lanes()
		r.tap(9, 5) // RIGHT ROLL, latched
		expect(r.led(9, 5)).toBe(15)
		r.tap(7, 6); r.tap(7, 6) // drag, then none
		r.tap(9, 5) // let go
		expect(r.led(9, 5)).toBe(4)
		expect(r.sent()).toEqual([])
		r.key(9, 7, 1); r.tap(8, 4); r.key(9, 7, 0) // RIGHT BLEND to B
		expect(r.sent()).toEqual([["/surface/reel/line/blend", 2, 4]])
	})

	it("holding the page key: the top row picks LEFT's lane, then RIGHT's; never the same lane", () => {
		const r = mk()
		r.key(0, 2, 1)
		r.tap(5, 0); r.tap(5, 0); r.tap(9, 0)
		r.key(0, 2, 0)
		expect(r.sent()).toEqual([["/surface/reel/line/left", 2], ["/surface/reel/line/right", 6]])
		r.key(0, 2, 1)
		expect(r.led(5, 0)).toBe(13)
		expect(r.led(9, 0)).toBe(8)
		r.tap(5, 0) // LEFT's own lane again: none
		r.key(0, 2, 0)
		expect(r.sent()).toEqual([["/surface/reel/line/left", 0]])
	})

	it("play toggles the line; the playing step inverts", () => {
		const r = mk(); r.lanes()
		r.tap(14, 7)
		expect(r.sent()).toEqual([["/surface/reel/line/play", 1]])
		r.say("/surface/reel/line/at", 3)
		expect(r.led(4, 0)).toBe(12)
		expect(r.led(14, 7)).toBe(15)
		r.tap(14, 7)
		expect(r.sent()).toEqual([["/surface/reel/line/play", 0]])
		expect(r.led(4, 0)).toBe(2)
	})

	it("the whole line as surface reports it: length, lanes, mode and every step", () => {
		const dash = (n: number) => Array(n).fill("-").join(" ")
		const str = `1 16 3 5 1 145 15 L 2:0.5:1:75:4 ${dash(35)} R ${dash(35)} 9:-1:0:100:0`
		const st = parseLineState(str)!
		expect(st.length).toBe(16)
		expect(st.lanes).toEqual([3, 5])
		expect(st.mode).toBe("one-each")
		expect(st.steps[0][0]).toEqual({ slice: 2, speed: 0.5, roll: 1, chance: 75, blend: 4 })
		expect(st.steps[1][35]).toEqual({ slice: 9, speed: -1, roll: 0, chance: 100, blend: 0 })
		expect(parseLineState("2 " + str.slice(2))).toBeNull()
		expect(parseLineState(str + " -")).toBeNull()
		const r = mk()
		r.say("/surface/reel/line/state", str)
		expect(r.led(2, 0)).toBe(10)
		expect(r.led(6, 1)).toBe(0) // past the length
		expect(r.out).toContainEqual(["/surface/get", "/surface/lane/3/reel/slices"])
	})

	it("a looper records pad presses and fires them again", () => {
		const r = mk(); r.lanes()
		r.page.onFocus(r.ctx)
		r.tap(15, 0) // arm
		r.key(2, 7, 1); vi.advanceTimersByTime(100); r.key(2, 7, 0)
		vi.advanceTimersByTime(400)
		r.tap(15, 0) // close and play
		r.sent()
		vi.advanceTimersByTime(450)
		expect(r.sent().filter((m) => m[0] === "/surface/lane/3/reel/slice")).toEqual([["/surface/lane/3/reel/slice", 1, 1]])
		r.page.dispose(r.ctx)
	})
})

describe("reel-surface: arp (x14 y4)", () => {
	// Reuse the file's rig by building the page the same way.
	const mk = () => {
		const out: Array<[string, ...any[]]> = []
		const modifiers = { held: new Set<number>(), shift1: false, shift2: false }
		let hear: (path: string, args: any[]) => void = () => {}
		const ctx = {
			size: SIZE, modifiers, slot: 3, slotLabel: "d", shared: new SharedStore(),
			clock: { running: false, rate: 20, tick: 0, lanes: [] },
			osc: { send() {} },
			surface: { port: 57133, send: (path: string, ...a: any[]) => out.push([path, ...a.map((v) => (v instanceof OscFloat ? v.value : v))]), on: (fn: any) => ((hear = fn), () => {}) },
			setDirty() {}, focus() {}, persist() {},
			setShift: (w: number, d: boolean) => { if (w === 1) modifiers.shift1 = d; else modifiers.shift2 = d },
		} as unknown as PageContext
		const page = new ReelSurfacePage(true)
		page.init(ctx)
		const key = (x: number, y: number, s: 0 | 1) => page.onKey({ x, y, s }, ctx)
		const tap = (x: number, y: number) => { key(x, y, 1); key(x, y, 0) }
		const sent = () => out.splice(0).filter((m) => m[0] !== "/surface/get" && m[0] !== "/surface/subscribe")
		const led = (x: number, y: number) => page.render(ctx)![ledIndex(SIZE, x, y)]
		const say = (p: string, v: any) => hear(p, [v])
		say("/surface/reel/line/left", 3); say("/surface/reel/line/right", 5)
		say("/surface/lane/3/reel/slices", 16); say("/surface/lane/5/reel/slices", 16)
		out.length = 0
		return { page, ctx, out, key, tap, sent, led, say }
	}
	beforeEach(() => { vi.useFakeTimers(); vi.setSystemTime(3_000_000) })
	afterEach(() => { vi.useRealTimers() })

	it("lit, a pad is a slice call (id 64 + (pad-1)*2 + track) and its release is call/off; both blocks, one chord", () => {
		const r = mk()
		r.tap(14, 4); r.sent()
		r.key(2, 7, 1) // LEFT pad 1
		r.key(10, 7, 1) // RIGHT pad 1
		r.key(13, 4, 1) // RIGHT pad 16
		expect(r.sent()).toEqual([
			["/surface/arp/call", 64, 3, "slice", 1],
			["/surface/arp/call", 65, 5, "slice", 1],
			["/surface/arp/call", 95, 5, "slice", 16],
		])
		r.key(2, 7, 0); r.key(10, 7, 0); r.key(13, 4, 0)
		expect(r.sent()).toEqual([["/surface/arp/call/off", 64], ["/surface/arp/call/off", 65], ["/surface/arp/call/off", 95]])
	})

	it("unlit, pads fire direct as before; the key lights and unlights", () => {
		const r = mk()
		expect(r.led(14, 4)).toBe(5)
		r.tap(2, 7)
		expect(r.sent()).toEqual([["/surface/lane/3/reel/slice", 1, 1]])
		r.tap(14, 4)
		expect(r.led(14, 4)).toBe(12)
		r.tap(14, 4)
		expect(r.led(14, 4)).toBe(5)
	})

	it("unlighting ARP, or leaving the page, ends every call held", () => {
		const r = mk()
		r.tap(14, 4)
		r.key(2, 7, 1); r.key(3, 7, 1); r.sent()
		r.tap(14, 4)
		expect(r.sent()).toEqual([["/surface/arp/call/off", 64], ["/surface/arp/call/off", 66]])
		r.tap(14, 4)
		r.key(2, 7, 0); r.key(3, 7, 0); r.sent()
		r.sent()
		r.key(4, 7, 1); r.sent()
		r.page.onBlur(r.ctx)
		expect(r.sent()).toEqual([["/surface/arp/call/off", 68]])
	})

	it("pads already down join the chord when ARP lights", () => {
		const r = mk()
		r.key(2, 7, 1); r.sent()
		r.tap(14, 4)
		expect(r.sent()).toEqual([["/surface/arp/call", 64, 3, "slice", 1]])
	})

	it("writing steps still works with ARP lit", () => {
		const r = mk()
		r.tap(14, 4)
		r.key(3, 7, 1) // LEFT pad 2
		r.sent()
		r.tap(2, 0) // step 1
		expect(r.sent()).toEqual([["/surface/reel/line/step", 1, 1, 2, 1, 0, 100, 0]])
	})

	it("loops play back direct, never as calls", () => {
		const r = mk()
		r.tap(14, 4)
		r.tap(15, 0) // arm
		r.key(2, 7, 1); vi.advanceTimersByTime(200); r.key(2, 7, 0)
		vi.advanceTimersByTime(200)
		r.tap(15, 0) // play
		r.sent()
		vi.advanceTimersByTime(500)
		const m = r.sent()
		expect(m.some((x) => x[0] === "/surface/lane/3/reel/slice")).toBe(true)
		expect(m.some((x) => x[0] === "/surface/arp/call")).toBe(false)
		r.page.dispose(r.ctx)
	})

	it("the sounding call's pad is the brightest, other held pads sit below", () => {
		const r = mk()
		r.tap(14, 4)
		r.key(2, 7, 1); r.key(3, 7, 1)
		r.say("/surface/arp/call/at", 66)
		expect(r.led(3, 7)).toBe(15)
		expect(r.led(2, 7)).toBe(9)
		r.say("/surface/arp/call/at", 64)
		expect(r.led(2, 7)).toBe(15)
		expect(r.led(3, 7)).toBe(9)
	})
})
