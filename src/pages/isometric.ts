/* Page: Isometric
 * ------------------------------------------------------------------------------
 * Summary : Isomorphic keyboard on the left 13×8 — a pure integer "step field".
 *           Each key has a step index; we emit the NUMBER, Max owns step→pitch.
 * Input   : press a keyboard key → /grid/out/page/<slot>/note <step> 1; release → 0.
 *           Right-edge control keys (test): bottom-right = shift 1, the cell above
 *           it = shift 2 (sustain pedal). Both route through ctx.setShift, so a
 *           local shift behaves exactly like one sent over OSC.
 * Display : out-of-scale 1, in-scale 3, root 8, unison 9, held/sustained 13.
 *           Control keys: faint markers. Columns 13–14 stay dark.
 * Settings: npo · vertical · root · scale · layout · rotation. Live, two-way over OSC.
 * Rules   : keyboard = columns 0..(keysW-1); right-edge controls only exist when
 *           there's a dead zone. Releases everything (held + sustained) on blur so a
 *           page switch never strands a note in Max.
 * ------------------------------------------------------------------------------
 * Step field: one column right = +1 step; one row UP = +`vertical` steps. Bottom-left
 * is step 0. We send only the step integer + an on/off flag — no pitch, no velocity.
 * `npo` does NOT change the step we emit; it sets the octave size for root highlighting
 * and is shared with Max (in: /grid/in/page/<slot>/setting/npo <n>; out: /settings).
 *
 * Sustain (shift 2): while held, a keyboard release does NOT send a note-off — the
 * note is parked in `sustained`. When sustain falls, every parked note is released.
 * Re-pressing a sustained note re-arms it as held. Sustain reads ctx.modifiers.shift2,
 * so it works whether the pedal is the local control key OR an external OSC shift.
 * DOUBLE-TAP the local key to latch it on hands-free; the next tap releases.
 *
 * Scales are a 12-EDO idea, so they apply only as a display/layout overlay:
 *   layout chromatic — the step field is untouched; the scale only changes brightness.
 *                      `scale: chromatic` keeps the original npo-based octave marking,
 *                      so microtonal layouts (npo up to 48) are unaffected.
 *   layout folded    — one key right = the next note IN the scale. The page resolves the
 *                      degree back to a chromatic step before emitting, so Max's
 *                      step→pitch map never has to know which scale is selected, and the
 *                      two layouts are interchangeable at the patch end.
 *
 * `rotation` (0/90/180/270) turns the STEP FIELD in place — the grid stays landscape, the
 * keyboard stays the same left-hand block and the control keys never move. Only the two
 * axes rotate, clockwise, so at 90 one row DOWN = +1 step and one column RIGHT =
 * +`vertical`, with step 0 in the top-left. This is the setting for playing the same
 * layout with the short axis as the chromatic run (8 steps across, 13 rows of `vertical`)
 * instead of the long one. It composes with everything else: `folded` folds the rotated
 * index, and scale/root highlighting reads the resulting step exactly as before.
 */

import {
	type Page,
	type PageContext,
	type KeyEvent,
	type LedFrame,
	type GridSize,
	makeFrame,
	ledIndex,
} from "../core/types.js"
import type { PageModule, SettingSpec } from "../core/pageModule.js"
import { clamp } from "../util/scale.js"
import {
	SCALE_NAMES,
	DEFAULT_SCALE,
	isScaleName,
	isInScale,
	isRootOf,
	foldedStep,
	type ScaleName,
} from "../util/scales.js"

const KEYS_W = 13 // keyboard occupies the left 13 columns
const BASE_STEP = 0 // bottom-left cell = step 0

const LVL_OUT = 1 // out of scale — still playable, just recessive
const LVL_NORMAL = 3 // in scale
const LVL_ROOT = 8
const LVL_UNISON = 9 // same note as something you're holding, elsewhere on the grid
const LVL_HELD = 13
const LVL_SUSTAIN = LVL_HELD // sustained notes look the same as a press
const LVL_SHIFT = 1 // control keys are faint markers

/** Two taps inside this window on the shift-2 key latch sustain on. */
const DOUBLE_TAP_MS = 350

/** Clockwise turns of the step field, in degrees. */
export type Rotation = 0 | 90 | 180 | 270
const ROTATIONS = [0, 90, 180, 270] as const
export const isRotation = (v: unknown): v is Rotation =>
	(ROTATIONS as readonly number[]).includes(v as number)

// Single source of truth: drives both runtime clamping and the page descriptor.
const SPECS: SettingSpec[] = [
	{ key: "npo", label: "notes / octave", type: "number", min: 1, max: 48, step: 1, default: 12 },
	{ key: "vertical", label: "vertical interval", type: "number", min: 1, max: 24, step: 1, default: 5 },
	{ key: "root", label: "root (semitone)", type: "number", min: 0, max: 11, step: 1, default: 0 },
	{ key: "scale", label: "scale", type: "enum", options: SCALE_NAMES, default: DEFAULT_SCALE },
	{ key: "layout", label: "layout", type: "enum", options: ["chromatic", "folded"], default: "chromatic" },
	{ key: "rotation", label: "rotation (° CW)", type: "enum", options: ROTATIONS.map(String), default: "0" },
]
const SPEC_BY_KEY = new Map(SPECS.map((s) => [s.key, s]))

/**
 * Step index for cell (x, y) inside a `keysW` × `height` keyboard block.
 *
 * Two axes define the field: the +1-step axis and the +`vertical` axis, at right angles.
 * `rotation` turns that pair clockwise, which is why each case below reads as
 * "<the +1 direction> + <the +vertical direction> × vertical". The origin follows the
 * rotation to whichever corner keeps every step in the block non-negative:
 *   0 → bottom-left · 90 → top-left · 180 → top-right · 270 → bottom-right.
 */
export function stepAt(
	x: number,
	y: number,
	keysW: number,
	height: number,
	vertical: number,
	rotation: Rotation = 0,
	baseStep = BASE_STEP,
): number {
	const right = x
	const left = keysW - 1 - x
	const down = y
	const up = height - 1 - y
	switch (rotation) {
		case 90:
			return baseStep + down + right * vertical
		case 180:
			return baseStep + left + down * vertical
		case 270:
			return baseStep + up + left * vertical
		default:
			return baseStep + right + up * vertical
	}
}

/** Is this step an octave root (step ≡ 0 mod npo)? Display-only. */
export const isRootStep = (step: number, npo: number): boolean => ((step % npo) + npo) % npo === 0

export class IsometricPage implements Page {
	private size: GridSize = { width: 16, height: 8 }
	private keysW = KEYS_W
	private held = new Set<number>() // ledIndex of currently-held keyboard cells
	private sustained = new Set<number>() // released-but-held by the sustain pedal
	private prevSustain = false

	// Live settings (defaults from SPECS).
	private npo = SPEC_BY_KEY.get("npo")!.default as number
	private vertical = SPEC_BY_KEY.get("vertical")!.default as number
	private root = SPEC_BY_KEY.get("root")!.default as number
	private scale = SPEC_BY_KEY.get("scale")!.default as ScaleName
	private layout = SPEC_BY_KEY.get("layout")!.default as "chromatic" | "folded"
	private rotation = Number(SPEC_BY_KEY.get("rotation")!.default) as Rotation

	// Sustain latch: two quick taps on the shift-2 key hold it down until the next tap.
	private lastSustainTapAt = 0
	private sustainLatched = false

	init(ctx: PageContext) {
		this.size = ctx.size
		this.keysW = Math.min(KEYS_W, this.size.width)
		this.held.clear()
		this.sustained.clear()
		this.prevSustain = false
		this.announce(ctx)
	}

	onFocus(ctx: PageContext) {
		this.announce(ctx)
	}

	onBlur(ctx: PageContext) {
		// Release everything (held + sustained) so a page switch can't strand a note.
		for (const i of this.held) this.sendNote(ctx, i, false)
		for (const i of this.sustained) this.sendNote(ctx, i, false)
		this.held.clear()
		this.sustained.clear()
		this.prevSustain = false
		this.sustainLatched = false
		this.lastSustainTapAt = 0
		// Drop our shifts so they don't linger after we leave the page.
		ctx.setShift(1, false)
		ctx.setShift(2, false)
	}

	onKey(ev: KeyEvent, ctx: PageContext) {
		// Right-edge control keys → local shifts (route through the shared ShiftInput).
		if (this.isShift1(ev.x, ev.y)) { ctx.setShift(1, !!ev.s); return }
		if (this.isShift2(ev.x, ev.y)) { this.sustainKey(ev, ctx); return }

		if (ev.x < 0 || ev.x >= this.keysW || ev.y < 0 || ev.y >= this.size.height) return
		const i = ledIndex(this.size, ev.x, ev.y)
		if (ev.s) {
			this.sustained.delete(i) // re-pressing a sustained note re-arms it as held
			this.held.add(i)
			this.sendNote(ctx, i, true)
		} else {
			this.held.delete(i)
			if (ctx.modifiers.shift2) this.sustained.add(i) // sustain: defer the note-off
			else this.sendNote(ctx, i, false)
		}
	}

	// Settings in from Max / the web panel. Accepts, in order of preference:
	//   /setting/<key> <v> · /<key> <v> · /<key>/<v> · /settings/get
	onOsc(path: string, args: any[], ctx: PageContext) {
		const parts = path.split("/").filter(Boolean)
		let i = 0
		if (parts[i] === "setting" || parts[i] === "settings") i++
		const key = parts[i]
		if (!key) return
		if (key === "get") {
			this.emitSettings(ctx)
			return
		}
		const raw = args.length ? args[0] : parts[i + 1]
		if (raw === undefined) return
		if (!this.applySetting(key, raw)) return
		this.emitSettings(ctx)
	}

	render(ctx: PageContext): LedFrame {
		// Sustain pedal (shift 2): on its falling edge, release everything sustained.
		const sustain = ctx.modifiers.shift2
		if (this.prevSustain && !sustain) {
			for (const i of this.sustained) this.sendNote(ctx, i, false)
			this.sustained.clear()
		}
		this.prevSustain = sustain

		// Every step currently sounding — the same note appears at several places on an
		// isomorphic layout, and lighting all of them shows you the shape you're playing.
		const sounding = new Set<number>()
		for (const i of this.held) sounding.add(this.stepOfIndex(i))
		for (const i of this.sustained) sounding.add(this.stepOfIndex(i))

		const f = makeFrame(this.size)
		for (let y = 0; y < this.size.height; y++) {
			for (let x = 0; x < this.keysW; x++) {
				const i = ledIndex(this.size, x, y)
				let lvl = this.baseLevel(this.step(x, y))
				if (sounding.has(this.step(x, y))) lvl = LVL_UNISON
				if (this.sustained.has(i)) lvl = LVL_SUSTAIN
				if (this.held.has(i)) lvl = LVL_HELD
				f[i] = lvl
			}
		}
		// Control keys on the right edge (only when a dead zone exists): faint markers.
		if (this.hasControls()) {
			const w = this.size.width, h = this.size.height
			f[ledIndex(this.size, w - 1, h - 1)] = LVL_SHIFT
			f[ledIndex(this.size, w - 1, h - 2)] = LVL_SHIFT
		}
		return f
	}

	serialize() {
		return this.settings()
	}

	dispose() {}

	/**
	 * The sustain pedal key. A single press is momentary as always; two presses inside
	 * DOUBLE_TAP_MS latch it on so you can let go, and the next press releases. The
	 * ShiftInput debounce is a 10 ms lockout — nowhere near a human double tap, so it
	 * never eats one.
	 */
	private sustainKey(ev: KeyEvent, ctx: PageContext) {
		if (!ev.s) {
			if (!this.sustainLatched) ctx.setShift(2, false) // plain momentary release
			return
		}
		const now = Date.now()
		if (this.sustainLatched) {
			this.sustainLatched = false
			this.lastSustainTapAt = 0
			ctx.setShift(2, false)
			return
		}
		if (now - this.lastSustainTapAt < DOUBLE_TAP_MS) this.sustainLatched = true
		this.lastSustainTapAt = now
		ctx.setShift(2, true)
	}

	/**
	 * The step a cell plays. In `chromatic` the field is the plain isomorphic layout; in
	 * `folded` the same coordinates index SCALE DEGREES instead, which we resolve back to
	 * a chromatic step here — so what leaves this page is always an ordinary step and
	 * Max's step→pitch map never has to know which scale is selected.
	 */
	private step(x: number, y: number): number {
		const i = stepAt(x, y, this.keysW, this.size.height, this.vertical, this.rotation)
		return this.layout === "folded" ? foldedStep(i, this.root, this.scale) : i
	}

	/** Display level for a cell's step, before held/sustain/unison override it. */
	private baseLevel(step: number): number {
		// A scale is a 12-EDO idea. Under `chromatic` we keep the original npo-based
		// octave marking, so microtonal layouts (npo up to 48) still read correctly.
		if (this.scale === "chromatic") return isRootStep(step, this.npo) ? LVL_ROOT : LVL_NORMAL
		if (isRootOf(step, this.root)) return LVL_ROOT
		return isInScale(step, this.root, this.scale) ? LVL_NORMAL : LVL_OUT
	}

	private stepOfIndex(i: number): number {
		return this.step(i % this.size.width, Math.floor(i / this.size.width))
	}

	private sendNote(ctx: PageContext, i: number, on: boolean) {
		ctx.osc.send(`/grid/out/page/${ctx.slotLabel}/note`, this.stepOfIndex(i), on ? 1 : 0)
	}

	// Control keys live on the right edge, but only when there's a dead zone right of
	// the keyboard (so we never steal a playing cell on a narrow grid).
	private hasControls(): boolean {
		return this.size.width - 1 >= this.keysW
	}
	private isShift1(x: number, y: number): boolean {
		return this.hasControls() && x === this.size.width - 1 && y === this.size.height - 1
	}
	private isShift2(x: number, y: number): boolean {
		return this.hasControls() && x === this.size.width - 1 && y === this.size.height - 2
	}

	/** Clamp+store one setting; returns true if it was a known key. */
	private applySetting(key: string, raw: unknown): boolean {
		const spec = SPEC_BY_KEY.get(key)
		if (!spec) return false
		if (key === "scale") {
			if (!isScaleName(raw)) return false
			this.scale = raw
			return true
		}
		if (key === "layout") {
			if (raw !== "chromatic" && raw !== "folded") return false
			this.layout = raw
			return true
		}
		if (key === "rotation") {
			// The web panel sends the enum as a string, Max will send an int — take either.
			const deg = Number(raw)
			if (!isRotation(deg)) return false
			this.rotation = deg
			return true
		}
		const value = Number(raw)
		if (!Number.isFinite(value)) return false
		const v = clamp(Math.round(value), spec.min ?? 0, spec.max ?? value)
		if (key === "npo") this.npo = v
		else if (key === "vertical") this.vertical = v
		else if (key === "root") this.root = v
		return true
	}

	private announce(ctx: PageContext) {
		ctx.osc.send(`/grid/out/page/${ctx.slotLabel}/type`, "isometric")
		this.emitSettings(ctx)
	}

	private settings() {
		return {
			npo: this.npo,
			vertical: this.vertical,
			root: this.root,
			scale: this.scale,
			layout: this.layout,
			rotation: this.rotation,
		}
	}

	private emitSettings(ctx: PageContext) {
		ctx.osc.send(`/grid/out/page/${ctx.slotLabel}/settings`, JSON.stringify(this.settings()))
	}
}

export const page: PageModule = {
	name: "isometric",
	label: "Isometric",
	create: () => new IsometricPage(),
	settings: SPECS,
}
