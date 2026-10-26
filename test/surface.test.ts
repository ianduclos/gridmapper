import { describe, expect, it } from "vitest"
import { PAGE_MODULES, PAGE_TYPES, DEFAULT_PAGE } from "../src/pages/registry.js"
import { CellsSurfacePage } from "../src/pages/cells-surface.js"
import { SetSurfacePage } from "../src/pages/set-surface.js"
import { CellsHotPage } from "../src/pages/cells-hot.js"
import { SetHotPage } from "../src/pages/set-hot.js"
import { SharedStore, DAMP_FROM_CELLS, DAMP_FROM_CELLS_SURFACE, DAMP_STATE, DAMP_STATE_SURFACE } from "../src/core/sharedStore.js"
import { createPresetStore } from "../src/core/presetStore.js"
import { fileURLToPath } from "node:url"
import { selectorKey as surfaceKey, drawSelector as surfaceDraw } from "../src/util/pageSelectorSurface.js"
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
		r.cells.onKey({ x: 0, y: 6, s: 1 }, r.cc)
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

describe("surface selector", () => {
	it("keeps its own twister-held state, independent of the hot selector", () => {
		const sent: any[] = []
		const ctx = { size: SIZE, slot: 0, focus() {}, setDirty() {}, osc: { send: (...a: any[]) => sent.push(a) } } as unknown as PageContext
		const lvl = (draw: typeof hotDraw) => {
			const f = new Uint8Array(SIZE.width * SIZE.height)
			draw(f, ctx)
			return f[ledIndex(SIZE, SELECTOR_COL, TWISTER_ROW)]
		}
		const idle = lvl(hotDraw)
		surfaceKey({ x: SELECTOR_COL, y: TWISTER_ROW, s: 1 }, ctx)
		expect(lvl(surfaceDraw)).toBeGreaterThan(idle)
		expect(lvl(hotDraw)).toBe(idle)
		surfaceKey({ x: SELECTOR_COL, y: TWISTER_ROW, s: 0 }, ctx)
		hotKey({ x: SELECTOR_COL, y: TWISTER_ROW, s: 1 }, ctx)
		expect(lvl(surfaceDraw)).toBe(idle)
		hotKey({ x: SELECTOR_COL, y: TWISTER_ROW, s: 0 }, ctx)
	})
})

describe("idk.surface layout", () => {
	// Reads the real preset file through the store (read-only: construction only reads slots.json).
	it("configs/presets/idk.surface.json loads the surface pages, nothing degrading to the default", () => {
		const page = { a: "iso-surface", b: "cells-surface", c: "blank-surface", d: "blank-surface", e: "blank-surface", f: "set-surface", g: "blank-surface", h: "blank-surface" }
		const store = createPresetStore(fileURLToPath(new URL("../configs", import.meta.url)))
		expect(store.list()).toContain("idk.surface")
		const cfg = store.read("idk.surface")!
		expect(cfg).not.toBeNull()
		for (const [k, v] of Object.entries(page)) expect(cfg.slots[k as keyof typeof cfg.slots].page).toBe(v)
		expect(Object.values(cfg.slots).some((s) => s.page === DEFAULT_PAGE)).toBe(false)
	})
})
