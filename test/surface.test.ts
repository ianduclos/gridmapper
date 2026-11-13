import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { PAGE_MODULES, PAGE_TYPES, DEFAULT_PAGE } from "../src/pages/registry.js"
import { CellsSurfacePage } from "../src/pages/cells-surface.js"
import { SetSurfacePage } from "../src/pages/set-surface.js"
import { CellsHotPage } from "../src/pages/cells-hot.js"
import { SetHotPage } from "../src/pages/set-hot.js"
import { IsoSurfacePage } from "../src/pages/iso-surface.js"
import { createOscRouter } from "../src/core/oscRouter.js"
import { PEER_OSC } from "../src/core/sharedStore.js"
import { SharedStore, DAMP_FROM_CELLS, DAMP_FROM_CELLS_SURFACE, DAMP_STATE, DAMP_STATE_SURFACE } from "../src/core/sharedStore.js"
import { createPresetStore } from "../src/core/presetStore.js"
import { fileURLToPath } from "node:url"
import { selectorKey as surfaceKey, shiftKey as surfaceShift, drawSelector as surfaceDraw, TWISTER_ROW as SURFACE_TWISTER_ROW } from "../src/util/pageSelectorSurface.js"
import { selectorKey as hotKey, drawSelector as hotDraw, SELECTOR_COL, TWISTER_ROW } from "../src/util/pageSelector.js"
import { ledIndex, type PageContext } from "../src/core/types.js"

const SIZE = { width: 16, height: 8 }

describe("surface pages register", () => {
	const expected: Array<[string, string]> = [
		["iso-surface", "Iso Surface"],
		["cells-surface", "Cells Surface"],
		["set-surface", "Set Surface"],
		["blank-surface", "Blank Surface"],
	]
	for (const [name, label] of expected) {
		it(`${name} is registered as "${label}"`, () => {
			expect(PAGE_TYPES).toContain(name)
			expect(PAGE_MODULES.get(name)?.label).toBe(label)
			expect(PAGE_MODULES.get(name)!.create().render).toBeTypeOf("function")
		})
	}
})

const rig = (Cells: any, SetPage: any) => {
	const sent: Array<{ path: string; args: any[] }> = []
	const modifiers = { held: new Set<string>(), shift1: false, shift2: false }
	const shared = new SharedStore()
	const ctx = (slot: number, slotLabel: string): PageContext =>
		({
			size: SIZE,
			modifiers,
			clock: { running: false, rate: 20, tick: 0, lanes: [{ div: 1 }, { div: 1 }, { div: 1 }, { div: 1 }] },
			osc: { send: (path: string, ...args: any[]) => sent.push({ path, args }) },
			slot,
			slotLabel,
			setDirty() {},
			setShift: (_w: number, down: boolean) => {
				modifiers.shift1 = down
			},
			focus() {},
			persist() {},
			shared,
		}) as any
	const cc = ctx(1, "b"),
		sc = ctx(5, "f")
	const cells = new Cells(3),
		set = new SetPage()
	set.init(sc)
	cells.init(cc)
	const damp = () => sent.filter((m) => m.path === "/grid/out/page/f/voice" && m.args[1] === "damp").map((m) => m.args)
	return { cells, set, cc, sc, shared, damp, sent }
}

describe("surface damp keys", () => {
	it("cells-surface damps through set-surface via the surface keys", () => {
		const r = rig(CellsSurfacePage, SetSurfacePage)
		r.cells.onKey({ x: 0, y: 3, s: 1 }, r.cc) // damp sits on col 0's free row: 6-7 are the shifts
		expect(r.damp()).toEqual([1, 2, 3, 4, 5, 6].map((v) => [v, "damp", 1]))
		expect(r.shared.get(DAMP_FROM_CELLS_SURFACE)).toBeDefined()
		expect(r.shared.get(DAMP_STATE_SURFACE)).toBeDefined()
		expect(r.shared.get(DAMP_FROM_CELLS)).toBeUndefined()
		expect(r.shared.get(DAMP_STATE)).toBeUndefined()
	})

	it("set-surface ignores the -hot damp keys", () => {
		const r = rig(CellsSurfacePage, SetSurfacePage)
		r.shared.set(DAMP_FROM_CELLS, [true, true, true, true, true, true])
		r.set.render(r.sc)
		expect(r.damp()).toEqual([])
	})

	it("set-hot ignores the surface damp keys, and publishes only its own", () => {
		const r = rig(CellsHotPage, SetHotPage)
		r.shared.set(DAMP_FROM_CELLS_SURFACE, [true, true, true, true, true, true])
		r.set.render(r.sc)
		expect(r.damp()).toEqual([])
		r.cells.onKey({ x: 0, y: 6, s: 1 }, r.cc)
		expect(r.shared.get(DAMP_STATE)).toBeDefined()
		expect(r.shared.get(DAMP_STATE_SURFACE)).toBeUndefined()
	})
})

describe("set-surface voices 7-8", () => {
	it("cols 10-11 drive voices 7 and 8, and ALL covers all eight", () => {
		const r = rig(CellsSurfacePage, SetSurfacePage)
		r.set.onKey({ x: 11, y: 6, s: 1 }, r.sc) // freeze, voice 8
		r.set.onKey({ x: 10, y: 7, s: 1 }, r.sc) // damp, voice 7
		r.set.onKey({ x: 2, y: 5, s: 1 }, r.sc) // bow ALL: top of the three, as on PLAY's shift 2
		r.set.onKey({ x: 4, y: 4, s: 1 }, r.sc) // the row above is voice activity, not a switch
		r.set.onOsc!("/voice/1/roll", [1], r.sc) // roll is gone: ignored
		const voice = r.sent.filter((m) => m.path === "/grid/out/page/f/voice").map((m) => m.args)
		expect(voice).toContainEqual([8, "freeze", 1])
		expect(voice).toContainEqual([7, "damp", 1])
		expect(voice.filter((a) => a[1] === "bow")).toEqual([1, 2, 3, 4, 5, 6, 7, 8].map((v) => [v, "bow", 1]))
		expect(voice.some((a) => a[1] === "roll")).toBe(false)
		const f = r.set.render(r.sc)
		expect(f[ledIndex(SIZE, 11, 6)]).toBe(12)
		expect(f[ledIndex(SIZE, 10, 7)]).toBe(15)
	})
})

describe("surface left column", () => {
	const mk = (slot = 0) => {
		const sent: any[] = [], focused: number[] = []
		const modifiers = { held: new Set<number>(), shift1: false, shift2: false }
		const ctx = {
			size: SIZE, slot, modifiers,
			focus: (s: number) => focused.push(s),
			setDirty() {},
			setShift: (w: number, d: boolean) => { if (w === 1) modifiers.shift1 = d; else modifiers.shift2 = d },
			osc: { send: (...a: any[]) => sent.push(a) },
		} as unknown as PageContext
		const draw = (fn: typeof hotDraw) => { const f = new Uint8Array(SIZE.width * SIZE.height); fn(f, ctx); return f }
		return { ctx, sent, focused, modifiers, draw }
	}

	it("keeps its own twister-held state, independent of the hot selector", () => {
		const r = mk()
		const s = () => r.draw(surfaceDraw)[ledIndex(SIZE, 0, SURFACE_TWISTER_ROW)]
		const h = () => r.draw(hotDraw)[ledIndex(SIZE, SELECTOR_COL, TWISTER_ROW)]
		const sIdle = s(), hIdle = h()
		surfaceKey({ x: 0, y: SURFACE_TWISTER_ROW, s: 1 }, r.ctx)
		expect(s()).toBeGreaterThan(sIdle)
		expect(h()).toBe(hIdle)
		surfaceKey({ x: 0, y: SURFACE_TWISTER_ROW, s: 0 }, r.ctx)
		hotKey({ x: SELECTOR_COL, y: TWISTER_ROW, s: 1 }, r.ctx)
		expect(s()).toBe(sIdle)
		hotKey({ x: SELECTOR_COL, y: TWISTER_ROW, s: 0 }, r.ctx)
	})

	it("iso at the top, PLAY under it, REEL pads on y2, home on y4, the Twister under it", () => {
		const r = mk(5)
		for (let y = 0; y < 8; y++) surfaceKey({ x: 0, y, s: 1 }, r.ctx)
		expect(r.focused).toEqual([0, 2, 3]) // y0 iso (a), y1 PLAY (c), y2 REEL pads (d); y4 is where we already are
		const f = r.draw(surfaceDraw)
		expect(f[ledIndex(SIZE, 0, 4)]).toBe(12)
		expect(f[ledIndex(SIZE, 0, 0)]).toBe(2)
		expect(f[ledIndex(SIZE, 0, 2)]).toBe(2)
		// Cells (slot b) keeps its damp on the free row y3: the column leaves it alone.
		const c = mk(1)
		expect(surfaceKey({ x: 0, y: 3, s: 1 }, c.ctx)).toBe(false)
		expect(c.focused).toEqual([])
		expect(c.draw(surfaceDraw)[ledIndex(SIZE, 0, 3)]).toBe(0)
	})

	it("leaves row 3 to the page and gives rows 6-7 to the shifts", () => {
		const r = mk()
		for (const y of [3, 6, 7]) expect(surfaceKey({ x: 0, y, s: 1 }, r.ctx)).toBe(false)
		expect(surfaceShift({ x: 0, y: 3, s: 1 }, r.ctx)).toBe(false)
		expect(surfaceShift({ x: 0, y: 6, s: 1 }, r.ctx)).toBe(true)
		expect(r.modifiers).toMatchObject({ shift1: false, shift2: true })
		expect(surfaceShift({ x: 0, y: 7, s: 1 }, r.ctx)).toBe(true)
		expect(r.modifiers.shift1).toBe(true)
		const f = r.draw(surfaceDraw)
		expect(f[ledIndex(SIZE, 0, 6)]).toBe(15)
		expect(f[ledIndex(SIZE, 0, 3)]).toBe(0)
	})
})

describe("idk.surface layout", () => {
	// Reads the real preset file through the store (read-only: construction only reads slots.json).
	it("configs/presets/idk.surface.json loads the surface pages, nothing degrading to the default", () => {
		const page = { a: "iso-surface", b: "cells-surface", c: "play-surface", d: "reel-surface", e: "blank-surface", f: "set-surface", g: "blank-surface", h: "blank-surface" }
		const store = createPresetStore(fileURLToPath(new URL("../configs", import.meta.url)))
		expect(store.list()).toContain("idk.surface")
		const cfg = store.read("idk.surface")!
		expect(cfg).not.toBeNull()
		for (const [k, v] of Object.entries(page)) expect(cfg.slots[k as keyof typeof cfg.slots].page).toBe(v)
		expect(Object.values(cfg.slots).some((s) => s.page === DEFAULT_PAGE)).toBe(false)
	})
})

describe("iso-surface: notes played in surface light here", () => {
	const mk = () => {
		const sent: Array<[string, ...any[]]> = []
		const modifiers = { held: new Set<number>(), shift1: false, shift2: false }
		const shared = new SharedStore()
		const ctx = {
			size: SIZE, modifiers, slot: 0, slotLabel: "a", shared,
			clock: { running: false, rate: 20, tick: 0, lanes: [{ div: 1 }, { div: 1 }, { div: 1 }, { div: 1 }] },
			osc: { send: (path: string, ...a: any[]) => sent.push([path, ...a]) },
			setDirty() {}, setShift() {}, focus() {}, persist() {},
		} as unknown as PageContext
		const page = new IsoSurfacePage()
		page.init(ctx)
		sent.length = 0
		// Home (step 0) is x1 y7; a column right is +1 step, a row up +5.
		const led = (x: number, y: number) => page.render(ctx)![ledIndex(SIZE, x, y)]
		return { page, ctx, sent, shared, led }
	}

	it("a remote note lights every cell that plays it, like a played one, and sends nothing back", () => {
		const r = mk()
		const idle = r.led(3, 7) // step 2
		r.page.onOsc!("/remote", [2, 1, 0], r.ctx)
		const lit = r.led(3, 7)
		expect(lit).toBe(12)
		expect(lit).toBeGreaterThan(idle)
		expect(r.sent.filter((m) => m[0].endsWith("/note"))).toEqual([])
		r.page.onOsc!("/remote", [7, 1, 0], r.ctx) // step 7 has twins: x8 y7 and x3 y6
		expect(r.led(8, 7)).toBe(12)
		expect(r.led(3, 6)).toBe(12)
		r.page.onOsc!("/remote", [2, 0, 0], r.ctx)
		expect(r.led(3, 7)).toBe(idle)
		expect(r.led(8, 7)).toBe(12)
		r.page.onOsc!("/remote", [9, 1, 1], r.ctx) // another track's key: the dim plane (x10 y7)
		expect(r.led(10, 7)).toBe(6)
	})

	it("is per track and step: one track's off leaves the other's on", () => {
		const r = mk()
		const idle = r.led(3, 7)
		r.page.onOsc!("/remote", [2, 1, 0], r.ctx)
		r.page.onOsc!("/remote", [2, 1, 3], r.ctx)
		r.page.onOsc!("/remote", [2, 0, 0], r.ctx)
		expect(r.led(3, 7)).toBe(6) // track 4's is still down, on the dim plane
		r.page.onOsc!("/remote", [2, 0, 3], r.ctx)
		expect(r.led(3, 7)).toBe(idle)
		r.page.onOsc!("/remote", [2, 1, 9], r.ctx) // no such track
		r.page.onOsc!("/remote", ["x", 1, 0], r.ctx)
		expect(r.led(3, 7)).toBe(idle)
	})

	it("is display only: not in a saved chord, not held by sustain, not in a loop", () => {
		const r = mk()
		r.page.onOsc!("/remote", [2, 1, 0], r.ctx)
		r.page.onKey({ x: 15, y: 0, s: 1 }, r.ctx) // arm looper 1
		r.page.onKey({ x: 15, y: 4, s: 1 }, r.ctx) // sustain toggle: arms chord saving
		r.page.onKey({ x: 13, y: 0, s: 1 }, r.ctx) // save "what is ringing" to chord 1: silence
		const out = JSON.parse(JSON.stringify(r.page.serialize()))
		expect(JSON.stringify(out.chords ?? [])).not.toContain("2")
		expect((out.patterns ?? []).every((p: any) => !p.events?.length)).toBe(true)
		expect(r.sent.filter((m) => m[0].endsWith("/note"))).toEqual([])
	})

	it("a ping from surface clears them (it has just reconnected); so do heartbeats that stop", () => {
		vi.useFakeTimers(); vi.setSystemTime(5_000_000)
		try {
			const r = mk()
			const route = createOscRouter({
				pm: {} as any, shift: {} as any, reconnect() {}, onKey() {}, emit() {}, slotPages: [],
				onPeer: (kind) => r.shared.set(PEER_OSC, { kind, at: Date.now() }),
			} as any)
			r.page.onOsc!("/remote", [2, 1, 0], r.ctx)
			route("/grid/in/ping", [1], "ui") // the web panel is not the peer
			expect(r.led(3, 7)).toBe(12)
			route("/grid/in/ping", [1], "osc")
			expect(r.led(3, 7)).toBeLessThan(12)
			r.page.onOsc!("/remote", [2, 1, 0], r.ctx)
			vi.advanceTimersByTime(60_000) // no heartbeats ever: nothing to judge by, the light stays
			expect(r.led(3, 7)).toBe(12)
			route("/grid/in/heartbeat", [], "osc")
			vi.advanceTimersByTime(3000)
			expect(r.led(3, 7)).toBe(12)
			vi.advanceTimersByTime(3000)
			expect(r.led(3, 7)).toBeLessThan(12)
		} finally { vi.useRealTimers() }
	})
})

describe("iso-surface: the lane picker", () => {
	const mk = () => {
		const out: Array<[string, ...any[]]> = []
		const notes: Array<[string, ...any[]]> = []
		const modifiers = { held: new Set<number>(), shift1: false, shift2: false }
		let hear: (path: string, args: any[]) => void = () => {}
		const ctx = {
			size: SIZE, modifiers, slot: 0, slotLabel: "a", shared: new SharedStore(),
			clock: { running: false, rate: 20, tick: 0, lanes: [{ div: 1 }, { div: 1 }, { div: 1 }, { div: 1 }] },
			osc: { send: (path: string, ...a: any[]) => notes.push([path, ...a]) },
			surface: { port: 57133, send: (path: string, ...a: any[]) => out.push([path, ...a]), on: (fn: any) => ((hear = fn), () => {}) },
			setDirty() {}, setShift() {}, focus() {}, persist() {},
		} as unknown as PageContext
		const page = new IsoSurfacePage()
		page.init(ctx)
		notes.length = 0
		const key = (x: number, y: number, s: 0 | 1) => page.onKey({ x, y, s }, ctx)
		const shift2 = (on: boolean) => key(0, 6, on ? 1 : 0) // the picker's key: the left column's x0 y6, held
		const pick = (track: number) => { key(14, track, 1); key(14, track, 0) }
		const add = (track: number) => { modifiers.shift2 = true; pick(track); modifiers.shift2 = false }
		const row = () => { const f = page.render(ctx)!; return Array.from({ length: 8 }, (_, l) => f[ledIndex(SIZE, 5 + l, 0)]) }
		const top = () => { const f = page.render(ctx)!; return Array.from({ length: 12 }, (_, l) => f[ledIndex(SIZE, 1 + l, 0)]) }
		const noteMsgs = () => notes.filter((m) => m[0].endsWith("/note"))
		const sets = () => out.filter((m) => /^\/surface\/route\//.test(m[0]))
		return { page, key, shift2, pick, add, row, top, out, sets, noteMsgs, say: (p: string, v: any) => hear(p, [v]) }
	}

	it("x0 y6 opens ONE menu: the panel on x1-x4 and the lanes of the track on x5-x12 of the top row, together", () => {
		const r = mk()
		r.pick(1)
		r.shift2(true)
		expect((r.page as any).panelShown).toBe(true) // at once, on the press
		expect(r.row()).toEqual([0, 0, 0, 0, 0, 0, 0, 0]) // not heard yet
		expect(r.out).toContainEqual(["/surface/get", "/surface/route/keys2/lanes"])
		r.key(5, 0, 1); r.key(5, 0, 0) // unknown: no guess, no note
		expect(r.sets()).toEqual([])
		r.say("/surface/route/keys2/lanes", "31")
		expect(r.row()).toEqual([13, 3, 13, 3, 3, 3, 3, 3])
		// The panel's own top row is not covered: TINT, the first SPEED and PROB rows, STRUM.
		expect(r.top().slice(0, 4).every((l) => l > 0)).toBe(true)
		r.key(6, 0, 1); r.key(6, 0, 0) // add lane 2
		r.key(5, 0, 1); r.key(5, 0, 0) // drop lane 1
		expect(r.sets()).toEqual([
			["/surface/route/keys2/lanes", "123"],
			["/surface/route/keys2/lanes", "23"],
		])
		expect(r.noteMsgs()).toEqual([]) // the lanes play nothing
		r.key(9, 7, 1) // the rows below still play
		expect(r.noteMsgs()).toHaveLength(1)
	})

	it("track 1 is surface's unnumbered KEYS row, and the row is a keyboard again once the menu is shut", () => {
		const r = mk()
		r.shift2(true)
		expect(r.out).toContainEqual(["/surface/get", "/surface/route/keys/lanes"])
		r.say("/surface/route/keys/lanes", "12345678")
		r.key(12, 0, 1); r.key(12, 0, 0)
		expect(r.out).toContainEqual(["/surface/route/keys/lanes", "1234567"])
		r.shift2(false) // used while held: it was a hold, the menu shuts
		expect((r.page as any).panelShown).toBe(false)
		r.key(5, 0, 1)
		expect(r.noteMsgs()).toHaveLength(1)
	})

	it("only the track in front: shift 2 + a track key no longer adds one, and the lanes are that track's alone", () => {
		const r = mk()
		r.add(1) // shift 2 + track 2: it simply comes to the front
		r.shift2(true)
		r.say("/surface/route/keys/lanes", "12")
		r.say("/surface/route/keys2/lanes", "2")
		expect(r.row()).toEqual([3, 13, 3, 3, 3, 3, 3, 3])
		r.key(5, 0, 1); r.key(5, 0, 0)
		expect(r.sets()).toEqual([["/surface/route/keys2/lanes", "12"]])
	})

	it("a short press toggles the menu, a long press shows it only while held", () => {
		vi.useFakeTimers(); vi.setSystemTime(6_000_000)
		try {
			const r = mk()
			const open = () => (r.page as any).panelShown as boolean
			r.shift2(true); vi.advanceTimersByTime(100); r.shift2(false) // tap: open
			expect(open()).toBe(true)
			r.say("/surface/route/keys/lanes", "1")
			expect(r.row()).toEqual([13, 3, 3, 3, 3, 3, 3, 3]) // the lanes are there whenever the panel is
			r.shift2(true); vi.advanceTimersByTime(100); r.shift2(false) // tap again: shut
			expect(open()).toBe(false)
			expect(r.row().some((l) => l === 13)).toBe(false)
			r.shift2(true); vi.advanceTimersByTime(600)
			expect(open()).toBe(true) // held: shown
			r.shift2(false)
			expect(open()).toBe(false) // let go: gone
			r.shift2(true); vi.advanceTimersByTime(100); r.shift2(false) // open by a tap ...
			r.shift2(true); vi.advanceTimersByTime(600); r.shift2(false) // ... a long press shuts it on release
			expect(open()).toBe(false)
		} finally { vi.useRealTimers() }
	})

	it("a quick press used as a shift (a lane or a panel key pressed meanwhile) shuts on release; from open, a tap shuts", () => {
		const r = mk()
		r.shift2(true)
		r.say("/surface/route/keys/lanes", "")
		r.key(5, 0, 1); r.key(5, 0, 0)
		expect(r.sets()).toEqual([["/surface/route/keys/lanes", "1"]])
		r.shift2(false)
		expect((r.page as any).panelShown).toBe(false)
		r.shift2(true); r.shift2(false) // tap: open and stays
		r.key(4, 0, 1); r.key(4, 0, 0) // x4 y0 is the panel's STRUM, not a lane
		expect(r.sets()).toHaveLength(1)
		expect((r.page as any).panelShown).toBe(true)
		r.shift2(true); r.shift2(false)
		expect((r.page as any).panelShown).toBe(false)
	})

	it("opening the menu hides the transposer", () => {
		const r = mk()
		r.key(0, 7, 1); r.key(0, 7, 0)
		expect((r.page as any).transposerShown).toBe(true)
		r.shift2(true)
		expect((r.page as any).transposerShown).toBe(false)
	})
})

describe("iso-surface: the left column's bottom two keys are iso's own", () => {
	it("x0 y6 is the panel and x0 y7 the transposer, not shifts; the shifts are the right column's", () => {
		const shifts: Array<[number, boolean]> = []
		const modifiers = { held: new Set<number>(), shift1: false, shift2: false }
		const ctx = {
			size: SIZE, modifiers, slot: 0, slotLabel: "a", shared: new SharedStore(),
			clock: { running: false, rate: 20, tick: 0, lanes: [{ div: 1 }, { div: 1 }, { div: 1 }, { div: 1 }] },
			osc: { send() {} }, setDirty() {}, focus() {}, persist() {},
			setShift: (w: number, d: boolean) => shifts.push([w, d]),
		} as unknown as PageContext
		const page = new IsoSurfacePage()
		page.init(ctx)
		const led = (x: number, y: number) => page.render(ctx)![ledIndex(SIZE, x, y)]
		const idle7 = led(0, 7), idle6 = led(0, 6), other = led(8, 7)
		page.onKey({ x: 0, y: 7, s: 1 }, ctx); page.onKey({ x: 0, y: 7, s: 0 }, ctx)
		expect(shifts).toEqual([])
		expect(led(0, 7)).toBeGreaterThan(idle7) // transposer shown
		expect(led(8, 7)).not.toBe(other) // the bottom row is the transposer
		page.onKey({ x: 0, y: 6, s: 1 }, ctx); page.onKey({ x: 0, y: 6, s: 0 }, ctx)
		expect(shifts).toEqual([])
		expect(led(0, 6)).toBeGreaterThan(idle6) // panel shown, transposer hidden
		expect(led(0, 7)).toBe(idle7)
		expect(led(0, 3)).toBe(0)
		expect(led(0, 2)).toBe(2) // the REEL pads key, the system's
		page.onKey({ x: 15, y: 7, s: 1 }, ctx)
		page.onKey({ x: 15, y: 6, s: 1 }, ctx)
		expect(shifts).toEqual([[1, true], [2, true]])
	})
})

describe("set-surface: the next home page (view on)", () => {
	const mk = (live = true) => {
		const out: Array<[string, ...any[]]> = []
		const modifiers = { held: new Set<number>(), shift1: false, shift2: false }
		let hear: (path: string, args: any[]) => void = () => {}
		const ctx = {
			size: SIZE, modifiers, slot: 5, slotLabel: "f", shared: new SharedStore(),
			clock: { running: false, rate: 20, tick: 0, lanes: [] },
			osc: { send() {} },
			surface: { port: 57133, send: (path: string, ...a: any[]) => out.push([path, ...a]), on: (fn: any) => ((hear = fn), () => {}) },
			setDirty() {}, focus() {}, persist() {},
			setShift: (w: number, d: boolean) => { if (w === 1) modifiers.shift1 = d; else modifiers.shift2 = d },
		} as unknown as PageContext
		const page = new SetSurfacePage(live)
		page.init(ctx)
		const key = (x: number, y: number, s: 0 | 1) => page.onKey({ x, y, s }, ctx)
		const tap = (x: number, y: number) => { key(x, y, 1); key(x, y, 0) }
		const sent = () => out.splice(0).filter((m) => m[0] !== "/surface/get" && m[0] !== "/surface/subscribe")
		const led = (x: number, y: number) => page.render(ctx)![ledIndex(SIZE, x, y)]
		return { page, ctx, out, key, tap, sent, led, modifiers, say: (p: string, v: any) => hear(p, [v]) }
	}
	beforeEach(() => { vi.useFakeTimers(); vi.setSystemTime(2_000_000) })
	afterEach(() => { vi.useRealTimers() })

	it("off, the page sends idk.surface nothing and the new keys do nothing", () => {
		const r = mk(false)
		r.page.onFocus(r.ctx)
		r.tap(4, 3); r.tap(4, 0); r.tap(2, 3)
		vi.advanceTimersByTime(4000)
		expect(r.out).toEqual([])
		r.page.dispose(r.ctx)
	})

	it("FOCUS: a press focuses a lane alone; shift 1 adds and drops; shift 2 sends it home", () => {
		const r = mk()
		r.tap(6, 3)
		expect(r.sent()).toEqual([["/surface/view/focus", 3], ["/surface/view/linked", ""]])
		expect(r.led(6, 3)).toBe(12)
		r.key(0, 7, 1); r.tap(8, 3); r.tap(4, 3)
		expect(r.sent()).toEqual([["/surface/view/linked", "5"], ["/surface/view/linked", "135"]])
		expect(r.led(8, 3)).toBe(6)
		r.tap(8, 3) // drop lane 5
		r.tap(6, 3) // the focused lane cannot be dropped
		expect(r.sent()).toEqual([["/surface/view/linked", "13"]])
		r.key(0, 7, 0)
		r.key(0, 6, 1); r.tap(9, 3); r.tap(2, 3); r.key(0, 6, 0)
		expect(r.sent()).toEqual([["/surface/lane/6/home"], ["/surface/home"]])
		r.tap(2, 3) // all: select all eight
		expect(r.sent()).toEqual([["/surface/view/linked", "12345678"]])
		// What surface reports wins.
		r.say("/surface/view/focus", 8); r.say("/surface/view/linked", "78")
		expect(r.led(11, 3)).toBe(12)
		expect(r.led(10, 3)).toBe(6)
		expect(r.led(6, 3)).toBe(2)
		r.page.dispose(r.ctx)
	})

	it("hold one FOCUS and long-press another: the range between; a short press is just a press", () => {
		const r = mk()
		r.key(5, 3, 1); r.sent() // lane 2 focused and held
		r.key(8, 3, 1)
		expect(r.sent()).toEqual([])
		vi.advanceTimersByTime(450)
		expect(r.sent()).toEqual([["/surface/view/linked", "2345"]])
		r.key(8, 3, 0); r.key(5, 3, 0)
		expect(r.sent()).toEqual([])
		r.key(5, 3, 1); r.sent()
		r.key(10, 3, 1); vi.advanceTimersByTime(100); r.key(10, 3, 0)
		expect(r.sent()).toEqual([["/surface/view/focus", 7], ["/surface/view/linked", ""]])
		r.key(5, 3, 0)
		r.page.dispose(r.ctx)
	})

	it("MOTION switches a lane's trem; all does all; the FX row shows a track", () => {
		const r = mk()
		r.tap(4, 4)
		expect(r.sent()).toEqual([["/surface/lane/1/trem", 1]])
		expect(r.led(4, 4)).toBe(12)
		r.tap(2, 4)
		expect(r.sent()).toHaveLength(7) // the other seven on
		r.tap(2, 4)
		expect(r.sent().every((m) => m[1] === 0)).toBe(true)
		r.say("/surface/lane/3/trem", 1)
		expect(r.led(6, 4)).toBe(12)
		r.tap(5, 0); r.tap(11, 0); r.tap(8, 0) // B, MASTER, the gap
		expect(r.sent()).toEqual([["/surface/view/fx", "b"], ["/surface/view/fx", "master"]])
		expect(r.led(11, 0)).toBe(12)
		expect(r.led(5, 0)).toBe(3)
		r.page.dispose(r.ctx)
	})

	it("a sound flashes a lane and dips the focused one; the page polls only while focused", () => {
		const r = mk()
		r.tap(4, 3)
		r.say("/surface/state/lane/1/sounding", 1); r.say("/surface/state/lane/2/sounding", 1)
		expect(r.led(4, 3)).toBe(4)
		expect(r.led(5, 3)).toBe(15)
		vi.advanceTimersByTime(200)
		expect(r.led(4, 3)).toBe(12)
		expect(r.led(5, 3)).toBe(2)
		r.out.length = 0
		vi.advanceTimersByTime(2000)
		expect(r.out).toEqual([])
		r.page.onFocus(r.ctx)
		vi.advanceTimersByTime(20)
		expect(r.out).toContainEqual(["/surface/get", "/surface/view/focus"])
		expect(r.out).toContainEqual(["/surface/subscribe", "127.0.0.1", 57133, "lanes"])
		r.page.onBlur(r.ctx); r.out.length = 0
		vi.advanceTimersByTime(3000)
		expect(r.out).toEqual([])
		r.page.dispose(r.ctx)
	})

	it("loopers record MOTION, never focus, FX or the ways home", () => {
		const r = mk()
		r.tap(15, 0) // arm
		r.tap(4, 4); vi.advanceTimersByTime(100)
		r.tap(6, 3); r.tap(5, 0)
		r.key(0, 6, 1); r.tap(4, 3); r.key(0, 6, 0)
		vi.advanceTimersByTime(100)
		r.tap(4, 4); vi.advanceTimersByTime(100)
		r.tap(15, 0) // close: plays
		r.sent()
		vi.advanceTimersByTime(320)
		const m = r.sent()
		expect(m).toContainEqual(["/surface/lane/1/trem", 1])
		expect(m.every((x) => x[0] === "/surface/lane/1/trem")).toBe(true)
		r.page.dispose(r.ctx)
	})
})

describe("surface pages: the link coming up reads the app again", () => {
	const mk = (make: () => any, slot: number) => {
		const out: Array<[string, ...any[]]> = []
		const modifiers = { held: new Set<number>(), shift1: false, shift2: false }
		let hear: (path: string, args: any[]) => void = () => {}
		const ctx = {
			size: SIZE, modifiers, slot, slotLabel: "abcdefgh"[slot], shared: new SharedStore(),
			clock: { running: false, rate: 20, tick: 0, lanes: [{ div: 1 }, { div: 1 }, { div: 1 }, { div: 1 }] },
			osc: { send() {} },
			surface: { port: 57133, send: (path: string, ...a: any[]) => out.push([path, ...a]), on: (fn: any) => ((hear = fn), () => {}) },
			setDirty() {}, setShift() {}, focus() {}, persist() {},
		} as unknown as PageContext
		const page = make()
		page.init(ctx)
		return { page, ctx, out, up: () => hear("/link/up", []) }
	}

	it("iso reads every track's lanes", () => {
		const r = mk(() => new IsoSurfacePage(), 0)
		r.out.length = 0
		r.up()
		for (const k of ["keys", "keys2", "keys3", "keys4"]) expect(r.out).toContainEqual(["/surface/get", `/surface/route/${k}/lanes`])
		for (const a of ["/surface/keys/3/arp", "/surface/keys/4/latch", "/surface/arp/order", "/surface/arp/rate", "/surface/arp/prob"])
			expect(r.out).toContainEqual(["/surface/get", a])
	})

	it("home subscribes and reads the view at once, without waiting for its five seconds", () => {
		vi.useFakeTimers(); vi.setSystemTime(2_000_000)
		const r = mk(() => new SetSurfacePage(true), 5)
		r.page.onFocus(r.ctx)
		vi.advanceTimersByTime(1000); r.out.length = 0
		r.up()
		vi.advanceTimersByTime(100)
		expect(r.out).toContainEqual(["/surface/subscribe", "127.0.0.1", 57133, "values"])
		expect(r.out).toContainEqual(["/surface/get", "/surface/view/focus"])
		r.page.dispose(r.ctx)
		vi.useRealTimers()
	})
})
