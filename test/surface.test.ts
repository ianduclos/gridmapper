import { describe, expect, it, vi } from "vitest"
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
		r.cells.onKey({ x: 0, y: 4, s: 1 }, r.cc) // damp sits on col 0's free row: 6-7 are the shifts
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
		r.set.onKey({ x: 2, y: 4, s: 1 }, r.sc) // bow ALL
		const voice = r.sent.filter((m) => m.path === "/grid/out/page/f/voice").map((m) => m.args)
		expect(voice).toContainEqual([8, "freeze", 1])
		expect(voice).toContainEqual([7, "damp", 1])
		expect(voice.filter((a) => a[1] === "bow")).toEqual([1, 2, 3, 4, 5, 6, 7, 8].map((v) => [v, "bow", 1]))
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

	it("iso at the top, PLAY under it, home third from the bottom; cells has no key", () => {
		const r = mk(5)
		for (let y = 0; y < 8; y++) surfaceKey({ x: 0, y, s: 1 }, r.ctx)
		expect(r.focused).toEqual([0, 2]) // y0 iso (a), y1 PLAY (c); y5 is where we already are
		const f = r.draw(surfaceDraw)
		expect(f[ledIndex(SIZE, 0, 5)]).toBe(12)
		expect(f[ledIndex(SIZE, 0, 0)]).toBe(2)
	})

	it("leaves rows 3-4 to the page and gives rows 6-7 to the shifts", () => {
		const r = mk()
		for (const y of [3, 4, 6, 7]) expect(surfaceKey({ x: 0, y, s: 1 }, r.ctx)).toBe(false)
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
		const page = { a: "iso-surface", b: "cells-surface", c: "play-surface", d: "blank-surface", e: "blank-surface", f: "set-surface", g: "blank-surface", h: "blank-surface" }
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
		r.page.onOsc!("/remote", [7, 1, 1], r.ctx) // step 7 has twins: x8 y7 and x3 y6
		expect(r.led(8, 7)).toBe(12)
		expect(r.led(3, 6)).toBe(12)
		r.page.onOsc!("/remote", [2, 0, 0], r.ctx)
		expect(r.led(3, 7)).toBe(idle)
		expect(r.led(8, 7)).toBe(12)
	})

	it("is per track and step: one track's off leaves the other's on", () => {
		const r = mk()
		r.page.onOsc!("/remote", [2, 1, 0], r.ctx)
		r.page.onOsc!("/remote", [2, 1, 3], r.ctx)
		r.page.onOsc!("/remote", [2, 0, 0], r.ctx)
		expect(r.led(3, 7)).toBe(12)
		r.page.onOsc!("/remote", [2, 0, 3], r.ctx)
		expect(r.led(3, 7)).toBeLessThan(12)
		r.page.onOsc!("/remote", [2, 1, 9], r.ctx) // no such track
		r.page.onOsc!("/remote", ["x", 1, 0], r.ctx)
		expect(r.led(3, 7)).toBeLessThan(12)
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
