import { describe, it, expect } from "vitest"
import { PageManager } from "../src/core/pageManager.js"
import { IsoHotPage } from "../src/pages/iso-hot.js"
import { BlankHotPage } from "../src/pages/blank-hot.js"
import { ledIndex, makeFrame, type GridSize, type Modifiers, type Slot } from "../src/core/types.js"

const SIZE: GridSize = { width: 16, height: 8 }
const at = (f: Uint8Array | undefined, x: number, y: number) => f![ledIndex(SIZE, x, y)]

function rig() {
	const sent: Array<{ path: string; args: any[] }> = []
	const announced: Slot[] = []
	const frames: Array<{ frame: Uint8Array | undefined; reason: string }> = []
	const modifiers: Modifiers = { held: new Set(), shift1: false, shift2: false }
	const pm = new PageManager(
		{
			size: SIZE,
			modifiers,
			clock: { running: false, rate: 20, tick: 0, lanes: [] },
			osc: { send: (path, ...args) => sent.push({ path, args }) },
			setShift: () => {},
		},
		(frame, reason) => frames.push({ frame, reason }),
		(slot) => announced.push(slot),
	)
	pm.load(0 as Slot, () => new IsoHotPage())
	for (let s = 1; s < 8; s++) pm.load(s as Slot, () => new BlankHotPage())
	pm.focus(0 as Slot)
	const notes = () => sent.filter((m) => m.path.endsWith("/note"))
	const key = (x: number, y: number, s: 0 | 1) => pm.onKey({ x, y, s })
	return { pm, sent, notes, announced, frames, key }
}

describe("hotelier page selector (column 0)", () => {
	it("a press on rows 0-5 focuses slots a-f and announces it", () => {
		const r = rig()
		r.key(0, 3, 1)
		expect(r.pm.focusedSlot).toBe(3)
		expect(r.announced).toEqual([3])
		r.key(0, 3, 0) // the release lands on the new page and does nothing
		r.key(0, 0, 1) // blank-hot's selector brings us back
		expect(r.pm.focusedSlot).toBe(0)
		expect(r.announced).toEqual([3, 0])
	})

	it("rows 6-7, releases and the current slot are inert", () => {
		const r = rig()
		r.key(0, 6, 1)
		r.key(0, 7, 1)
		r.key(0, 0, 1)
		r.key(0, 2, 0)
		expect(r.pm.focusedSlot).toBe(0)
		expect(r.announced).toEqual([])
	})

	it("switching paints the NEW page, not the old one", () => {
		const r = rig()
		r.key(0, 2, 1)
		const last = r.frames.at(-1)!
		expect(last.reason).toBe("focus")
		expect(at(last.frame, 0, 2)).toBe(12) // blank-hot in slot c lights its own row
		expect(at(last.frame, 5, 5)).toBe(0) // and no keyboard
	})

	it("lights own slot bright, other selectable slots dim, rows 6-7 dark", () => {
		const r = rig()
		const f = r.pm.renderFocused()
		expect(at(f, 0, 0)).toBe(12)
		for (let y = 1; y < 6; y++) expect(at(f, 0, y)).toBe(2)
		expect(at(f, 0, 6)).toBe(0)
		expect(at(f, 0, 7)).toBe(0)
	})
})

describe("iso-hot keyboard", () => {
	it("column 0 never plays; the keyboard's home (step 0) is column 1, bottom row", () => {
		const r = rig()
		r.key(0, 7, 1)
		expect(r.notes()).toEqual([])
		r.key(1, 7, 1)
		expect(r.notes()[0].args.slice(0, 2)).toEqual([0, 1])
		r.key(1, 7, 0)
		r.key(4, 6, 1) // 3 right, 1 up at vertical 5
		expect(r.notes().at(-1)!.args[0]).toBe(8)
	})

	it("control columns 13-15 are untouched by the shift", () => {
		const r = rig()
		r.key(12, 7, 1)
		expect(r.notes()[0].args[0]).toBe(11) // last keyboard column
		r.key(12, 7, 0)
		const before = r.notes().length
		r.key(13, 0, 1) // chord preset slot, empty → no note
		r.key(13, 0, 0)
		expect(r.notes().length).toBe(before)
	})

	it("leaving the page releases held notes", () => {
		const r = rig()
		r.key(5, 7, 1)
		r.key(0, 1, 1)
		const offs = r.notes().filter((m) => m.args[1] === 0)
		expect(offs.map((m) => m.args[0])).toEqual([4])
	})
})

describe("blank-hot", () => {
	it("draws only the selector", () => {
		const f = makeFrame(SIZE)
		const r = rig()
		r.key(0, 4, 1)
		const g = r.pm.renderFocused()!
		for (let i = 0; i < f.length; i++) if (i % 16 !== 0) expect(g[i]).toBe(0)
	})
})
