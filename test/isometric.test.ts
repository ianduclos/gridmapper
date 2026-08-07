import { describe, it, expect } from "vitest"
import { stepAt, isRootStep, IsometricPage } from "../src/pages/isometric.js"
import { ledIndex, type GridSize, type PageContext } from "../src/core/types.js"

const H = 8 // grid 128 height
const KEYS_W = 13 // keyboard block width
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
		expect(stepAt(0, H - 1, H, V)).toBe(0)
	})

	it("one column right = +1 step", () => {
		expect(stepAt(1, H - 1, H, V)).toBe(1)
		expect(stepAt(5, H - 1, H, V)).toBe(5)
	})

	it("one row up = +vertical steps", () => {
		expect(stepAt(0, H - 2, H, V) - stepAt(0, H - 1, H, V)).toBe(V)
		expect(stepAt(0, 0, H, V)).toBe((H - 1) * V) // top row of column 0
		expect(stepAt(0, H - 2, H, 3)).toBe(3) // vertical is configurable
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
		expect(stepAt(12, H - 1, H, V)).toBe(12)
		expect(isRootStep(stepAt(12, H - 1, H, V), 12)).toBe(true) // root at npo=12
		expect(isRootStep(stepAt(12, H - 1, H, V), 7)).toBe(false) // not a root at npo=7
	})
})

describe("isometric scales", () => {
	const noteOf = (notes: () => Array<{ args: any[] }>) => notes()[notes().length - 1].args[0]

	it("chromatic layout emits exactly what it always did (regression guard)", () => {
		const { p, ctx, notes } = page({ scale: "pentatonic-major" }) // scale must not move steps
		p.onKey({ x: 3, y: H - 1, s: 1 }, ctx)
		expect(noteOf(notes)).toBe(stepAt(3, H - 1, H, V))
		p.onKey({ x: 2, y: H - 3, s: 1 }, ctx)
		expect(noteOf(notes)).toBe(stepAt(2, H - 3, H, V))
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
		const { p } = page({ npo: 19, vertical: 3, root: 5, scale: "blues", layout: "folded", orientation: "horizontal" })
		expect(p.serialize()).toEqual({
			npo: 19,
			vertical: 3,
			root: 5,
			scale: "blues",
			layout: "folded",
			orientation: "horizontal",
			chords: Array(H).fill(null), // saved chords ride along; none saved here
		})
	})
})

describe("isometric orientation", () => {
	// Two modes only. `horizontal` is the 90 turn mirrored: the interval axis still runs
	// RIGHTWARD, the chromatic run moves to the short axis and descends from the top-left.
	// The keyboard block and the control keys never move.
	it("home is bottom-left in standard, top-left in horizontal", () => {
		expect(stepAt(0, H - 1, H, V, "standard")).toBe(0)
		expect(stepAt(0, 0, H, V, "horizontal")).toBe(0)
	})

	it("standard: right = +1 step, up = +vertical", () => {
		expect(stepAt(1, H - 1, H, V, "standard") - stepAt(0, H - 1, H, V, "standard")).toBe(1)
		expect(stepAt(0, H - 2, H, V, "standard") - stepAt(0, H - 1, H, V, "standard")).toBe(V)
	})

	it("horizontal: down = +1 step, right = +vertical", () => {
		expect(stepAt(0, 1, H, V, "horizontal") - stepAt(0, 0, H, V, "horizontal")).toBe(1)
		expect(stepAt(1, 0, H, V, "horizontal") - stepAt(0, 0, H, V, "horizontal")).toBe(V)
	})

	it("horizontal moves RIGHT by an interval, never left", () => {
		// The whole point of mirroring the 90 turn instead of taking it raw: the raw turn
		// would put the interval axis on the LEFT, so a column right would go DOWN a fourth.
		for (let y = 0; y < H; y++) expect(stepAt(1, y, H, V, "horizontal") - stepAt(0, y, H, V, "horizontal")).toBe(V)
	})

	it("horizontal is the 90 turn mirrored top-to-bottom", () => {
		// Raw 90 turn = down + left*V (home top-right). Mirroring x sends the interval
		// axis rightward and gives exactly what `horizontal` produces.
		const raw90Mirrored = (x: number, y: number) => y + x * V
		for (let y = 0; y < H; y++)
			for (let x = 0; x < KEYS_W; x++)
				expect(stepAt(x, y, H, V, "horizontal")).toBe(raw90Mirrored(x, y))
	})

	it("neither mode can produce a negative step", () => {
		for (const o of ["standard", "horizontal"] as const)
			for (let y = 0; y < H; y++)
				for (let x = 0; x < KEYS_W; x++) expect(stepAt(x, y, H, V, o)).toBeGreaterThanOrEqual(0)
	})

	it("standard is the default, so existing patches are untouched", () => {
		expect(stepAt(4, 2, H, V)).toBe(stepAt(4, 2, H, V, "standard"))
		expect(page().p.serialize()).toMatchObject({ orientation: "standard" })
	})

	it("a horizontal press emits the mirrored step", () => {
		const { p, ctx, notes } = page({ orientation: "horizontal" })
		p.onKey({ x: 0, y: 0, s: 1 }, ctx) // home is the top-left now
		expect(notes()[0].args[0]).toBe(0)
		p.onKey({ x: 2, y: 3, s: 1 }, ctx)
		expect(notes()[1].args[0]).toBe(stepAt(2, 3, H, V, "horizontal"))
	})

	it("orientation composes with the folded layout", () => {
		const { p, ctx, notes } = page({ orientation: "horizontal", layout: "folded", scale: "pentatonic-major" })
		// Going DOWN column 0 now walks scale degrees 0,1,2,3 -> C,D,E,G.
		for (const y of [0, 1, 2, 3]) p.onKey({ x: 0, y, s: 1 }, ctx)
		expect(notes().map((m) => m.args[0])).toEqual([0, 2, 4, 7])
	})

	it("rejects anything that is not one of the two modes", () => {
		const { p, ctx } = page({ orientation: "horizontal" })
		p.onOsc("/setting/orientation", [270], ctx)
		p.onOsc("/setting/orientation", ["sideways"], ctx)
		expect(p.serialize()).toMatchObject({ orientation: "horizontal" })
	})

	it("control keys do not move when the field transposes", () => {
		const { p, ctx, modifiers } = page({ orientation: "horizontal" })
		p.onKey({ x: SIZE.width - 1, y: H - 2, s: 1 }, ctx)
		expect(modifiers.shift2).toBe(true)
	})

	it("horizontal still has unisons, just fewer than standard", () => {
		const twins = (o: "standard" | "horizontal") => {
			const counts = new Map<number, number>()
			for (let y = 0; y < H; y++)
				for (let x = 0; x < KEYS_W; x++) {
					const s = stepAt(x, y, H, V, o)
					counts.set(s, (counts.get(s) ?? 0) + 1)
				}
			return [...counts.values()].filter((n) => n > 1).reduce((a, n) => a + n, 0)
		}
		expect(twins("horizontal")).toBeGreaterThan(0)
		expect(twins("standard")).toBeGreaterThan(twins("horizontal"))
	})
})

describe("isometric unison lighting", () => {
	it("lights every other cell playing the same note", () => {
		const { p, ctx } = page()
		// vertical 5, so (5, bottom) and (0, one row up) are both step 5.
		p.onKey({ x: 5, y: H - 1, s: 1 }, ctx)
		const f = p.render(ctx)
		expect(stepAt(0, H - 2, H, V)).toBe(stepAt(5, H - 1, H, V)) // same note, two places
		expect(at(f, 5, H - 1)).toBe(15) // the one you're holding
		expect(at(f, 0, H - 2)).toBe(12) // its twin
	})

	it("clears when the note is released", () => {
		const { p, ctx } = page()
		p.onKey({ x: 5, y: H - 1, s: 1 }, ctx)
		p.onKey({ x: 5, y: H - 1, s: 0 }, ctx)
		const f = p.render(ctx)
		expect(at(f, 0, H - 2)).not.toBe(12)
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

// ---------------------------------------------------------------------------------
// Sustain toggle + chord presets
// ---------------------------------------------------------------------------------
const TOGGLE = { x: SIZE.width - 1, y: 4 } // 5th button down the last column
const PEDAL = { x: SIZE.width - 1, y: H - 2 } // the momentary shift-2 pedal
const preset = (slot: number) => ({ x: SIZE.width - 2, y: slot })

/** Steps Max currently believes are sounding, from the note stream. */
const soundingFrom = (notes: () => Array<{ args: any[] }>) => {
	const on = new Set<number>()
	for (const m of notes()) (m.args[1] === 1 ? on.add(m.args[0]) : on.delete(m.args[0]))
	return on
}

const tap = (p: IsometricPage, ctx: PageContext, k: { x: number; y: number }) => {
	p.onKey({ ...k, s: 1 }, ctx)
	p.onKey({ ...k, s: 0 }, ctx)
}

/** Play a chord on the bottom row and let go — under sustain it stays ringing. */
const ringing = (p: IsometricPage, ctx: PageContext, xs: number[]) => {
	for (const x of xs) p.onKey({ x, y: H - 1, s: 1 }, ctx)
	for (const x of xs) p.onKey({ x, y: H - 1, s: 0 }, ctx)
}

describe("isometric sustain toggle", () => {
	it("latches on press and stays on after release", () => {
		const { p, ctx, notes } = page()
		tap(p, ctx, TOGGLE)
		p.onKey({ x: 3, y: H - 1, s: 1 }, ctx)
		p.onKey({ x: 3, y: H - 1, s: 0 }, ctx)
		expect(soundingFrom(notes).size).toBe(1) // still ringing after the release
	})

	it("turning it off releases what it was sustaining", () => {
		const { p, ctx, notes } = page()
		tap(p, ctx, TOGGLE)
		tap(p, ctx, { x: 3, y: H - 1 })
		expect(soundingFrom(notes).size).toBe(1)
		tap(p, ctx, TOGGLE) // off
		expect(soundingFrom(notes).size).toBe(0)
	})

	it("is OR'd with the pedal — either one alone sustains", () => {
		const { p, ctx, notes } = page()
		tap(p, ctx, TOGGLE) // toggle ON
		p.onKey({ ...PEDAL, s: 1 }, ctx) // pedal down too
		tap(p, ctx, { x: 3, y: H - 1 })
		p.onKey({ ...PEDAL, s: 0 }, ctx) // pedal up, toggle still holds it
		expect(soundingFrom(notes).size).toBe(1)
		tap(p, ctx, TOGGLE) // now both are off
		expect(soundingFrom(notes).size).toBe(0)
	})

	it("lights up when on", () => {
		const { p, ctx } = page()
		expect(at(p.render(ctx), TOGGLE.x, TOGGLE.y)).toBe(1)
		tap(p, ctx, TOGGLE)
		expect(at(p.render(ctx), TOGGLE.x, TOGGLE.y)).toBe(15)
	})
})

describe("isometric chord presets", () => {
	it("saves the ringing chord while the toggle is armed", () => {
		const { p, ctx, sent } = page()
		tap(p, ctx, TOGGLE)
		ringing(p, ctx, [0, 4, 7])
		tap(p, ctx, preset(2))
		const chords = JSON.parse(sent.filter((m) => m.path.endsWith("/chords")).pop()!.args[0])
		expect(chords[2]).toEqual([0, 4, 7])
	})

	it("saving silence clears the slot", () => {
		const { p, ctx, sent } = page()
		tap(p, ctx, TOGGLE)
		ringing(p, ctx, [0, 4, 7])
		tap(p, ctx, preset(2))
		tap(p, ctx, TOGGLE) // off — releases the chord
		tap(p, ctx, TOGGLE) // armed again, nothing ringing
		tap(p, ctx, preset(2))
		const chords = JSON.parse(sent.filter((m) => m.path.endsWith("/chords")).pop()!.args[0])
		expect(chords[2]).toBeNull()
	})

	it("plays the chord back momentarily when NOT armed", () => {
		const { p, ctx, notes } = page()
		tap(p, ctx, TOGGLE)
		ringing(p, ctx, [0, 4, 7])
		tap(p, ctx, preset(0))
		tap(p, ctx, TOGGLE) // disarm + release everything
		expect(soundingFrom(notes).size).toBe(0)

		p.onKey({ ...preset(0), s: 1 }, ctx)
		expect(soundingFrom(notes)).toEqual(new Set([0, 4, 7]))
		p.onKey({ ...preset(0), s: 0 }, ctx)
		expect(soundingFrom(notes).size).toBe(0) // no sustain, so it stops
	})

	it("a double-tapped pedal sustains preset playback, and chords stack", () => {
		const { p, ctx, notes } = page()
		tap(p, ctx, TOGGLE)
		ringing(p, ctx, [0, 4, 7])
		tap(p, ctx, preset(0))
		ringing(p, ctx, [2, 5, 9])
		tap(p, ctx, preset(1))
		tap(p, ctx, TOGGLE) // disarm, all quiet
		expect(soundingFrom(notes).size).toBe(0)

		tap(p, ctx, PEDAL) // double-tap latches sustain WITHOUT arming save
		tap(p, ctx, PEDAL)
		tap(p, ctx, preset(0))
		expect(soundingFrom(notes)).toEqual(new Set([0, 4, 7])) // rang on after release
		tap(p, ctx, preset(1))
		expect(soundingFrom(notes)).toEqual(new Set([0, 2, 4, 5, 7, 9])) // stacked
		p.onKey({ ...PEDAL, s: 1 }, ctx) // third tap drops the latch
		expect(soundingFrom(notes).size).toBe(0)
	})

	it("stores pitches, so a later layout change does not move the chord", () => {
		const { p, ctx, notes } = page()
		tap(p, ctx, TOGGLE)
		ringing(p, ctx, [0, 4, 7])
		tap(p, ctx, preset(3))
		tap(p, ctx, TOGGLE)
		p.onOsc("/setting/root", [3], ctx)
		p.onOsc("/setting/orientation", ["horizontal"], ctx)
		p.onKey({ ...preset(3), s: 1 }, ctx)
		expect(soundingFrom(notes)).toEqual(new Set([0, 4, 7])) // same pitches
	})

	it("an empty slot does nothing", () => {
		const { p, ctx, notes } = page()
		tap(p, ctx, preset(5))
		expect(notes()).toHaveLength(0)
	})

	it("shows empty, loaded, armed and playing states", () => {
		const { p, ctx } = page()
		expect(at(p.render(ctx), preset(1).x, 1)).toBe(1) // empty
		tap(p, ctx, TOGGLE)
		expect(at(p.render(ctx), preset(1).x, 1)).toBe(3) // empty, armed
		ringing(p, ctx, [0, 4])
		tap(p, ctx, preset(1))
		expect(at(p.render(ctx), preset(1).x, 1)).toBe(9) // loaded, armed
		tap(p, ctx, TOGGLE)
		expect(at(p.render(ctx), preset(1).x, 1)).toBe(6) // loaded
		p.onKey({ ...preset(1), s: 1 }, ctx)
		expect(at(p.render(ctx), preset(1).x, 1)).toBe(15) // playing
	})
})

describe("isometric note reconciliation", () => {
	it("two unison twins produce ONE note-on, and it lasts until both let go", () => {
		const { p, ctx, notes } = page()
		// vertical 5: (5, bottom) and (0, one row up) are both step 5.
		p.onKey({ x: 5, y: H - 1, s: 1 }, ctx)
		p.onKey({ x: 0, y: H - 2, s: 1 }, ctx)
		expect(notes().filter((m) => m.args[1] === 1)).toHaveLength(1)
		p.onKey({ x: 5, y: H - 1, s: 0 }, ctx)
		expect(soundingFrom(notes)).toEqual(new Set([5])) // other finger still down
		p.onKey({ x: 0, y: H - 2, s: 0 }, ctx)
		expect(soundingFrom(notes).size).toBe(0)
	})

	it("pressing a ringing note turns it off everywhere", () => {
		const { p, ctx, notes } = page()
		tap(p, ctx, TOGGLE)
		tap(p, ctx, { x: 5, y: H - 1 }) // step 5, now sustained
		expect(soundingFrom(notes)).toEqual(new Set([5]))
		// Press its TWIN, not the original cell — the note dies all the same.
		tap(p, ctx, { x: 0, y: H - 2 })
		expect(soundingFrom(notes).size).toBe(0)
	})

	it("that kill press does not re-sustain the note on release", () => {
		const { p, ctx, notes } = page()
		tap(p, ctx, TOGGLE)
		p.onKey({ x: 5, y: H - 1, s: 1 }, ctx)
		p.onKey({ x: 5, y: H - 1, s: 0 }, ctx)
		p.onKey({ x: 5, y: H - 1, s: 1 }, ctx) // kill
		p.onKey({ x: 5, y: H - 1, s: 0 }, ctx) // release must stay silent
		expect(soundingFrom(notes).size).toBe(0)
	})

	it("can subtract one note from a sustained chord", () => {
		const { p, ctx, notes } = page()
		tap(p, ctx, TOGGLE)
		for (const x of [0, 4, 7]) tap(p, ctx, { x, y: H - 1 })
		expect(soundingFrom(notes)).toEqual(new Set([0, 4, 7]))
		tap(p, ctx, { x: 4, y: H - 1 })
		expect(soundingFrom(notes)).toEqual(new Set([0, 7]))
	})

	it("takes a note out of a sustained PRESET chord too", () => {
		const { p, ctx, notes } = page()
		tap(p, ctx, TOGGLE)
		for (const x of [0, 4, 7]) tap(p, ctx, { x, y: H - 1 })
		tap(p, ctx, preset(0))
		tap(p, ctx, TOGGLE)
		tap(p, ctx, PEDAL) // latch sustain, presets playable
		tap(p, ctx, PEDAL)
		tap(p, ctx, preset(0))
		expect(soundingFrom(notes)).toEqual(new Set([0, 4, 7]))
		tap(p, ctx, { x: 4, y: H - 1 })
		expect(soundingFrom(notes)).toEqual(new Set([0, 7]))
	})

	it("without sustain, re-pressing a note just re-triggers as before", () => {
		const { p, ctx, notes } = page()
		p.onKey({ x: 3, y: H - 1, s: 1 }, ctx)
		p.onKey({ x: 3, y: H - 1, s: 0 }, ctx)
		p.onKey({ x: 3, y: H - 1, s: 1 }, ctx)
		expect(soundingFrom(notes)).toEqual(new Set([3]))
	})

	it("blur silences everything but keeps the saved chords", () => {
		const { p, ctx, notes, sent } = page()
		tap(p, ctx, TOGGLE)
		ringing(p, ctx, [0, 4, 7])
		tap(p, ctx, preset(0))
		p.onBlur(ctx)
		expect(soundingFrom(notes).size).toBe(0)
		p.onFocus(ctx)
		const chords = JSON.parse(sent.filter((m) => m.path.endsWith("/chords")).pop()!.args[0])
		expect(chords[0]).toEqual([0, 4, 7])
	})
})
