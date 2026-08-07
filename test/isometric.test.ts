import { describe, it, expect } from "vitest"
import { stepAt, isRootStep, IsometricPage } from "../src/pages/isometric.js"
import { ledIndex, type GridSize, type PageContext } from "../src/core/types.js"

const H = 8 // grid 128 height
const W = 13 // keyboard width (KEYS_W)
const V = 5 // default vertical interval (steps per row)
const SIZE: GridSize = { width: 16, height: 8 }

function makeCtx() {
	const sent: Array<{ path: string; args: any[] }> = []
	const shifts: Array<{ which: number; down: boolean }> = []
	const modifiers = { held: new Set<number>(), shift1: false, shift2: false }
	const ctx = {
		size: SIZE,
		modifiers,
		clock: { running: false, rate: 20, tick: 0, lanes: [] },
		osc: { send: (path: string, ...args: any[]) => sent.push({ path, args }) },
		slot: 0,
		slotLabel: "a",
		setDirty: () => {},
		// Mirror the host: setShift feeds straight back into ctx.modifiers.
		setShift: (which: number, down: boolean) => {
			shifts.push({ which, down })
			if (which === 2) modifiers.shift2 = down
			else modifiers.shift1 = down
		},
	} as unknown as PageContext
	const notes = () => sent.filter((m) => m.path.endsWith("/note"))
	return { ctx, sent, shifts, notes, modifiers }
}

const page = (setup: Record<string, unknown> = {}) => {
	const { ctx, sent, shifts, notes, modifiers } = makeCtx()
	const p = new IsometricPage()
	p.init(ctx)
	for (const [k, v] of Object.entries(setup)) p.onOsc(`/setting/${k}`, [v], ctx)
	return { p, ctx, sent, shifts, notes, modifiers }
}

const at = (f: Uint8Array, x: number, y: number) => f[ledIndex(SIZE, x, y)]

describe("isometric step field", () => {
	it("bottom-left cell is step 0", () => {
		expect(stepAt(0, H - 1, W, H, V)).toBe(0)
	})

	it("one column right = +1 step", () => {
		expect(stepAt(1, H - 1, W, H, V)).toBe(1)
		expect(stepAt(5, H - 1, W, H, V)).toBe(5)
	})

	it("one row up = +vertical steps", () => {
		expect(stepAt(0, H - 2, W, H, V) - stepAt(0, H - 1, W, H, V)).toBe(V)
		expect(stepAt(0, 0, W, H, V)).toBe((H - 1) * V) // top row of column 0
		expect(stepAt(0, H - 2, W, H, 3)).toBe(3) // vertical is configurable
	})

	it("isRootStep wraps at npo (display only)", () => {
		expect(isRootStep(0, 12)).toBe(true)
		expect(isRootStep(12, 12)).toBe(true)
		expect(isRootStep(1, 12)).toBe(false)
		expect(isRootStep(5, 12)).toBe(false)
		expect(isRootStep(7, 7)).toBe(true) // octave at npo=7
		expect(isRootStep(12, 7)).toBe(false)
	})

	it("npo does not change the emitted step (only highlighting)", () => {
		// stepAt has no npo parameter — the number we send is tuning-agnostic.
		expect(stepAt(12, H - 1, W, H, V)).toBe(12)
		expect(isRootStep(stepAt(12, H - 1, W, H, V), 12)).toBe(true) // root at npo=12
		expect(isRootStep(stepAt(12, H - 1, W, H, V), 7)).toBe(false) // not a root at npo=7
	})
})

describe("isometric scales", () => {
	const noteOf = (notes: () => Array<{ args: any[] }>) => notes()[notes().length - 1].args[0]

	it("chromatic layout emits exactly what it always did (regression guard)", () => {
		const { p, ctx, notes } = page({ scale: "pentatonic-major" }) // scale must not move steps
		p.onKey({ x: 3, y: H - 1, s: 1 }, ctx)
		expect(noteOf(notes)).toBe(stepAt(3, H - 1, W, H, V))
		p.onKey({ x: 2, y: H - 3, s: 1 }, ctx)
		expect(noteOf(notes)).toBe(stepAt(2, H - 3, W, H, V))
	})

	it("folded layout emits CHROMATIC steps, not degree indices", () => {
		const { p, ctx, notes } = page({ layout: "folded", scale: "pentatonic-major" })
		// Bottom row: degree 0,1,2,3 → C,D,E,G = 0,2,4,7 semitones.
		for (const x of [0, 1, 2, 3]) p.onKey({ x, y: H - 1, s: 1 }, ctx)
		expect(notes().map((m) => m.args[0])).toEqual([0, 2, 4, 7])
	})

	it("folded layout offsets by the root", () => {
		const { p, ctx, notes } = page({ layout: "folded", scale: "pentatonic-minor", root: 3 })
		p.onKey({ x: 0, y: H - 1, s: 1 }, ctx)
		expect(noteOf(notes)).toBe(3)
	})

	it("out-of-scale keys are dimmer than in-scale ones, and roots brightest", () => {
		const { p, ctx } = page({ scale: "ionian" })
		const f = p.render(ctx)
		const y = H - 1
		expect(at(f, 0, y)).toBeGreaterThan(at(f, 2, y)) // step 0 = root, step 2 = in scale
		expect(at(f, 2, y)).toBeGreaterThan(at(f, 1, y)) // step 1 = out of scale
	})

	it("chromatic scale keeps the original npo-based root marking (microtonal intact)", () => {
		const { p, ctx } = page({ npo: 7 })
		const f = p.render(ctx)
		const y = H - 1
		expect(at(f, 0, y)).toBe(at(f, 7, y)) // both roots at npo 7
		expect(at(f, 0, y)).toBeGreaterThan(at(f, 1, y))
	})

	it("rejects a bogus scale or layout rather than storing it", () => {
		const { p, ctx } = page()
		p.onOsc("/setting/scale", ["klingon"], ctx)
		p.onOsc("/setting/layout", ["sideways"], ctx)
		expect(p.serialize()).toMatchObject({ scale: "chromatic", layout: "chromatic" })
	})

	it("round-trips every setting through serialize()", () => {
		const { p } = page({ npo: 19, vertical: 3, root: 5, scale: "blues", layout: "folded", rotation: 270 })
		expect(p.serialize()).toEqual({
			npo: 19,
			vertical: 3,
			root: 5,
			scale: "blues",
			layout: "folded",
			rotation: 270,
		})
	})
})

describe("isometric rotation", () => {
	// The field turns clockwise in place: the grid stays landscape, the keyboard stays the
	// same 13x8 block, only the two axes swap round. Corners are the readable invariant.
	const corner = (rot: 0 | 90 | 180 | 270) => ({
		tl: stepAt(0, 0, W, H, V, rot),
		tr: stepAt(W - 1, 0, W, H, V, rot),
		bl: stepAt(0, H - 1, W, H, V, rot),
		br: stepAt(W - 1, H - 1, W, H, V, rot),
	})

	it("step 0 walks the corners clockwise", () => {
		expect(corner(0).bl).toBe(0)
		expect(corner(90).tl).toBe(0)
		expect(corner(180).tr).toBe(0)
		expect(corner(270).br).toBe(0)
	})

	it("at 90, one row DOWN = +1 step and one column RIGHT = +vertical", () => {
		expect(stepAt(0, 1, W, H, V, 90) - stepAt(0, 0, W, H, V, 90)).toBe(1)
		expect(stepAt(1, 0, W, H, V, 90) - stepAt(0, 0, W, H, V, 90)).toBe(V)
	})

	it("at 180, one column LEFT = +1 step and one row DOWN = +vertical", () => {
		expect(stepAt(W - 2, 0, W, H, V, 180) - stepAt(W - 1, 0, W, H, V, 180)).toBe(1)
		expect(stepAt(W - 1, 1, W, H, V, 180) - stepAt(W - 1, 0, W, H, V, 180)).toBe(V)
	})

	it("at 270, one row UP = +1 step and one column LEFT = +vertical", () => {
		expect(stepAt(W - 1, H - 2, W, H, V, 270) - stepAt(W - 1, H - 1, W, H, V, 270)).toBe(1)
		expect(stepAt(W - 2, H - 1, W, H, V, 270) - stepAt(W - 1, H - 1, W, H, V, 270)).toBe(V)
	})

	it("every rotation covers the same step range — no negatives, no lost notes", () => {
		for (const rot of [0, 90, 180, 270] as const) {
			const steps = new Set<number>()
			for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) steps.add(stepAt(x, y, W, H, V, rot))
			const all = [...steps]
			expect(Math.min(...all)).toBe(0)
			expect(all.every((s) => s >= 0)).toBe(true)
		}
	})

	it("180 is the point reflection of 0", () => {
		for (let y = 0; y < H; y++)
			for (let x = 0; x < W; x++)
				expect(stepAt(x, y, W, H, V, 180)).toBe(stepAt(W - 1 - x, H - 1 - y, W, H, V, 0))
	})

	it("a rotated press emits the rotated step", () => {
		const { p, ctx, notes } = page({ rotation: 90 })
		p.onKey({ x: 0, y: 0, s: 1 }, ctx) // top-left is now step 0
		expect(notes()[0].args[0]).toBe(0)
		p.onKey({ x: 2, y: 3, s: 1 }, ctx)
		expect(notes()[1].args[0]).toBe(stepAt(2, 3, W, H, V, 90))
	})

	it("rotation composes with the folded layout", () => {
		const { p, ctx, notes } = page({ rotation: 90, layout: "folded", scale: "pentatonic-major" })
		// Going DOWN column 0 now walks scale degrees 0,1,2,3 → C,D,E,G.
		for (const y of [0, 1, 2, 3]) p.onKey({ x: 0, y, s: 1 }, ctx)
		expect(notes().map((m) => m.args[0])).toEqual([0, 2, 4, 7])
	})

	it("accepts the enum as a string (web panel) or an int (Max)", () => {
		const { p, ctx } = page()
		p.onOsc("/setting/rotation", ["180"], ctx)
		expect(p.serialize()).toMatchObject({ rotation: 180 })
		p.onOsc("/setting/rotation", [270], ctx)
		expect(p.serialize()).toMatchObject({ rotation: 270 })
	})

	it("rejects a rotation that isn't a right angle", () => {
		const { p, ctx } = page({ rotation: 90 })
		p.onOsc("/setting/rotation", [45], ctx)
		p.onOsc("/setting/rotation", ["sideways"], ctx)
		expect(p.serialize()).toMatchObject({ rotation: 90 })
	})

	it("control keys do not move when the field rotates", () => {
		const { p, ctx, modifiers } = page({ rotation: 90 })
		p.onKey({ x: SIZE.width - 1, y: H - 2, s: 1 }, ctx)
		expect(modifiers.shift2).toBe(true)
	})
})

describe("isometric unison lighting", () => {
	it("lights every other cell playing the same note", () => {
		const { p, ctx } = page()
		// vertical 5, so (5, bottom) and (0, one row up) are both step 5.
		p.onKey({ x: 5, y: H - 1, s: 1 }, ctx)
		const f = p.render(ctx)
		expect(stepAt(0, H - 2, W, H, V)).toBe(stepAt(5, H - 1, W, H, V)) // same note, two places
		expect(at(f, 5, H - 1)).toBe(13) // the one you're holding
		expect(at(f, 0, H - 2)).toBe(9) // its twin
	})

	it("clears when the note is released", () => {
		const { p, ctx } = page()
		p.onKey({ x: 5, y: H - 1, s: 1 }, ctx)
		p.onKey({ x: 5, y: H - 1, s: 0 }, ctx)
		const f = p.render(ctx)
		expect(at(f, 0, H - 2)).not.toBe(9)
	})
})

describe("isometric sustain latch", () => {
	const SHIFT2 = { x: SIZE.width - 1, y: H - 2 }

	it("a single press is momentary", () => {
		const { p, ctx, modifiers } = page()
		p.onKey({ ...SHIFT2, s: 1 }, ctx)
		expect(modifiers.shift2).toBe(true)
		p.onKey({ ...SHIFT2, s: 0 }, ctx)
		expect(modifiers.shift2).toBe(false)
	})

	it("a double tap latches it on, and the next tap releases", () => {
		const { p, ctx, modifiers } = page()
		p.onKey({ ...SHIFT2, s: 1 }, ctx)
		p.onKey({ ...SHIFT2, s: 0 }, ctx)
		p.onKey({ ...SHIFT2, s: 1 }, ctx) // second tap, well inside the window
		p.onKey({ ...SHIFT2, s: 0 }, ctx)
		expect(modifiers.shift2).toBe(true) // still held after release — latched
		p.onKey({ ...SHIFT2, s: 1 }, ctx)
		expect(modifiers.shift2).toBe(false)
	})

	it("a latched pedal actually sustains notes", () => {
		const { p, ctx, notes } = page()
		p.onKey({ ...SHIFT2, s: 1 }, ctx)
		p.onKey({ ...SHIFT2, s: 0 }, ctx)
		p.onKey({ ...SHIFT2, s: 1 }, ctx)
		p.onKey({ ...SHIFT2, s: 0 }, ctx) // latched on
		p.onKey({ x: 4, y: H - 1, s: 1 }, ctx)
		p.onKey({ x: 4, y: H - 1, s: 0 }, ctx)
		// The release must NOT have sent a note-off — it's parked in `sustained`.
		expect(notes().filter((m) => m.args[1] === 0)).toHaveLength(0)
	})
})
