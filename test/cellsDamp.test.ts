import { describe, expect, it } from "vitest"
import { CellsHotPage } from "../src/pages/cells-hot.js"
import { SetHotPage } from "../src/pages/set-hot.js"
import { SharedStore } from "../src/core/sharedStore.js"
import { ledIndex, type PageContext } from "../src/core/types.js"

/** cells-hot (slot b) and set-hot (slot f) on one shared store, as in the hosts. */
const rig = () => {
	const sent: Array<{ path: string; args: any[] }> = []
	const modifiers = { held: new Set<string>(), shift1: false, shift2: false }
	const shared = new SharedStore()
	const ctx = (slot: number, slotLabel: string): PageContext =>
		({
			size: { width: 16, height: 8 },
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
	const cells = new CellsHotPage(3),
		set = new SetHotPage()
	set.init(sc)
	cells.init(cc)
	const key = (x: number, y: number, s: number) => cells.onKey({ x, y, s }, cc)
	const damp = () =>
		sent.filter((m) => m.path === "/grid/out/page/f/voice" && m.args[1] === "damp").map((m) => m.args)
	const view = () => JSON.parse(sent.filter((m) => m.path.endsWith("b/view")).at(-1)!.args[0])
	return { cells, set, cc, sc, key, damp, view, sent }
}

describe("cells-hot damp, synced through set-hot", () => {
	it("holding x0 y6 damps all six voices through set-hot, and releases them", () => {
		const r = rig()
		r.key(0, 6, 1)
		expect(r.damp()).toEqual([1, 2, 3, 4, 5, 6].map((v) => [v, "damp", 1]))
		expect(r.cells.render(r.cc)[ledIndex(r.cc.size, 0, 6)]).toBe(15)
		r.key(0, 6, 0)
		expect(r.damp().slice(6)).toEqual([1, 2, 3, 4, 5, 6].map((v) => [v, "damp", 0]))
	})
	it("shift + damp toggles damp mode; column 1 then damps one voice", () => {
		const r = rig()
		r.key(0, 7, 1) // shift first
		r.key(0, 6, 1) // → damp mode, no all-damp
		r.key(0, 6, 0)
		r.key(0, 7, 0)
		expect(r.view().keyView).toBe("damp")
		expect(r.damp()).toEqual([])
		r.key(1, 2, 1)
		expect(r.damp()).toEqual([[3, "damp", 1]])
		expect((r.cells.serialize() as any).muted[2]).toBe(false) // not a mute
		r.key(1, 2, 0)
		expect(r.damp().at(-1)).toEqual([3, "damp", 0])
		r.key(0, 7, 1) // either key leaves
		r.key(0, 7, 0)
		expect(r.view().keyView).toBe("cells")
		r.key(1, 2, 1) // back to muting
		expect((r.cells.serialize() as any).muted[2]).toBe(true)
	})
	it("damp first, then shift: enters the mode and lets go of the all-damp", () => {
		const r = rig()
		r.key(0, 6, 1)
		r.key(0, 7, 1)
		expect(r.view().keyView).toBe("damp")
		expect(r.damp().slice(6)).toEqual([1, 2, 3, 4, 5, 6].map((v) => [v, "damp", 0]))
	})
	it("set-hot's own ALL damp lights cells' damp key", () => {
		const r = rig()
		r.set.onKey({ x: 2, y: 7, s: 1 }, r.sc)
		expect(r.cells.render(r.cc)[ledIndex(r.cc.size, 0, 6)]).toBe(15)
	})
})
