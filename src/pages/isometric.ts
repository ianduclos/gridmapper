/* Page: Isometric
 * ------------------------------------------------------------------------------
 * Summary : Isomorphic keyboard on the left 13×8 — a pure integer "step field".
 *           Each key has a step index; we emit the NUMBER, Max owns step→pitch.
 * Input   : press a keyboard key → /grid/out/page/<slot>/note <step> 1; release → 0.
 *           Column 15 (top→bottom): row 4 = sustain TOGGLE, row 6 = sustain pedal,
 *           row 7 = shift 1. Column 14 = eight chord presets, one per row.
 * Display : out-of-scale 1, in-scale 3, root 8, SOUNDING 12, finger-down 15.
 *           Presets: empty 1, loaded 6, playing 15 (+2/+3 while armed to save).
 *           Shift keys are faint markers. Column 13 stays dark.
 * Settings: npo · vertical · root · scale · layout · orientation. Live, two-way over OSC.
 * Rules   : keyboard = columns 0..(keysW-1); the control columns only exist when
 *           there's a dead zone. Releases everything on blur so a page switch never
 *           strands a note in Max; SAVED CHORDS survive (stored content, not state).
 * ------------------------------------------------------------------------------
 * Step field: one column right = +1 step; one row UP = +`vertical` steps. Bottom-left
 * is step 0. We send only the step integer + an on/off flag — no pitch, no velocity.
 * `npo` does NOT change the step we emit; it sets the octave size for root highlighting
 * and is shared with Max (in: /grid/in/page/<slot>/setting/npo <n>; out: /settings).
 *
 * SUSTAIN is a two-input OR — the momentary pedal (shift 2) OR the latching toggle —
 * so either alone holds notes. While it's on, a keyboard release parks the note in
 * `sustained` instead of sending a note-off; when sustain falls, every parked note is
 * released. The pedal reads ctx.modifiers.shift2, so it works whether it's the local
 * control key or an external OSC shift, and a DOUBLE-TAP latches it hands-free.
 *
 * The two latches are not the same: the pedal's double-tap latch sustains and leaves the
 * chord presets PLAYABLE, while the toggle sustains and ARMS them for saving. That is the
 * whole reason there are two of them.
 *
 * CHORD PRESETS (column 14, one slot per row) store PITCHES — a list of steps — so a
 * later change of root/scale/vertical/orientation doesn't move a saved chord. Armed, a
 * press saves whatever is ringing (saving silence clears the slot). Not armed, a press
 * PLAYS, momentarily: the chord sounds while the key is down and keeps ringing if a
 * sustain is active when you let go, which is what lets you latch the pedal and stack
 * chords up. Out: /grid/out/page/<slot>/chords <json> — a dense array, null = empty.
 *
 * Notes are tracked by STEP and reconciled against what Max was last told, because three
 * sources (fingers, the sustain buffer, held presets) can claim the same note at once.
 * One consequence worth knowing: two unison twins produce ONE note-on, and the note only
 * stops when the last source lets go. The other is that "turn it off" can mean the note
 * rather than the cell — while any sustain is on, pressing a note that is already ringing
 * SILENCES it wherever it sounds, which is how you subtract a note from a held chord.
 * A note another finger is physically holding is exempt; you stop that by releasing it.
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
 * `orientation` transposes the STEP FIELD in place — the grid stays landscape, the keyboard
 * stays the same left-hand block and the control keys never move. Only the two axes swap:
 *   standard   — right = +1 step, UP    = +`vertical` (chromatic run along the LONG axis,
 *                home bottom-left)
 *   horizontal — DOWN  = +1 step, right = +`vertical` (chromatic run along the SHORT axis,
 *                home top-left) — the 90° turn mirrored top-to-bottom, so a column right
 *                is up an INTERVAL (a fourth at the default `vertical` of 5).
 * It composes with everything else: `folded` folds the transposed index, and scale/root
 * highlighting reads the resulting step exactly as before.
 *
 * Note the side effect on unison lighting: `horizontal` runs the chromatic axis over only
 * 8 cells, so with `vertical` 5 a note repeats far less often than in `standard` (where 13
 * columns give most cells several twins). Fewer lit twins there is the geometry, not a bug.
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

// Four tiers that have to be told apart AT A GLANCE on a varibright grid, so they are
// spread out: unison used to sit at 9 against roots at 8, which is a difference you
// cannot actually see — the twins were lit the whole time and read as ordinary roots.
const LVL_OUT = 1 // out of scale — still playable, just recessive
const LVL_NORMAL = 3 // in scale
const LVL_ROOT = 8 // octave / scale root
const LVL_UNISON = 12 // the note is SOUNDING — lit at every cell that plays it
const LVL_HELD = 15 // this exact cell is under a finger
const LVL_SHIFT = 1 // control keys are faint markers

// Chord preset column. "armed" = the sustain toggle is on, so a press SAVES rather
// than plays; the whole column brightens so you can see which mode you're in.
const LVL_PRESET_EMPTY = 1
const LVL_PRESET_FULL = 6
const LVL_PRESET_EMPTY_ARMED = 3
const LVL_PRESET_FULL_ARMED = 9

/** Two taps inside this window on the shift-2 key latch sustain on. */
const DOUBLE_TAP_MS = 350

/** The sustain TOGGLE: 5th button down the last column. */
const SUSTAIN_TOGGLE_ROW = 4

/**
 * Which way the step field runs. Two modes, not four rotations — the rest read backwards
 * under the hand and aren't worth the setting. `horizontal` is the 90° turn mirrored
 * top-to-bottom: the chromatic run moves to the short axis and DESCENDS from the top-left,
 * while the interval axis points RIGHT (up a fourth per column at the default `vertical`
 * of 5). Without that mirror the raw 90° turn would send the interval axis leftward.
 */
export type Orientation = "standard" | "horizontal"
const ORIENTATIONS = ["standard", "horizontal"] as const
export const isOrientation = (v: unknown): v is Orientation =>
	(ORIENTATIONS as readonly string[]).includes(v as string)

// Single source of truth: drives both runtime clamping and the page descriptor.
const SPECS: SettingSpec[] = [
	{ key: "npo", label: "notes / octave", type: "number", min: 1, max: 48, step: 1, default: 12 },
	{ key: "vertical", label: "vertical interval", type: "number", min: 1, max: 24, step: 1, default: 5 },
	{ key: "root", label: "root (semitone)", type: "number", min: 0, max: 11, step: 1, default: 0 },
	{ key: "scale", label: "scale", type: "enum", options: SCALE_NAMES, default: DEFAULT_SCALE },
	{ key: "layout", label: "layout", type: "enum", options: ["chromatic", "folded"], default: "chromatic" },
	{ key: "orientation", label: "orientation", type: "enum", options: [...ORIENTATIONS], default: "standard" },
]
const SPEC_BY_KEY = new Map(SPECS.map((s) => [s.key, s]))

/**
 * Step index for cell (x, y). Two axes at right angles define the field — the +1-step axis
 * and the +`vertical` axis — and `orientation` says which is which:
 *   standard   — right = +1 step, UP    = +vertical  (long axis chromatic,  home bottom-left)
 *   horizontal — DOWN  = +1 step, right = +vertical  (short axis chromatic, home top-left)
 * `horizontal` is the 90° turn mirrored top-to-bottom, which is what keeps its interval
 * axis pointing RIGHT (up a fourth per column at the default `vertical` of 5) instead of
 * left as the raw turn would have it.
 */
export function stepAt(
	x: number,
	y: number,
	height: number,
	vertical: number,
	orientation: Orientation = "standard",
	baseStep = BASE_STEP,
): number {
	const right = x
	const down = y
	const up = height - 1 - y
	return orientation === "horizontal"
		? baseStep + down + right * vertical
		: baseStep + right + up * vertical
}

/** Is this step an octave root (step ≡ 0 mod npo)? Display-only. */
export const isRootStep = (step: number, npo: number): boolean => ((step % npo) + npo) % npo === 0

export class IsometricPage implements Page {
	private size: GridSize = { width: 16, height: 8 }
	private keysW = KEYS_W
	// Three independent sources can make a note sound, so notes are tracked by STEP and
	// reconciled — a step goes on when the first source claims it and off when the last
	// one lets go. That is what stops two unison twins from double-triggering Max, and
	// what lets "turn that note off" mean the note rather than one cell.
	private held = new Set<number>() // ledIndex of cells physically under a finger
	private sustained = new Set<number>() // STEPS parked by whichever sustain is active
	private presetHeld = new Map<number, number[]>() // preset slot → its steps, while held
	private lastSounding = new Set<number>() // what Max currently believes is on
	private killedByPress = new Set<number>() // cells whose press was a note-OFF gesture
	private prevSustain = false

	/** Chord presets: slot (row) → the steps saved there. Survives focus changes. */
	private chords = new Map<number, number[]>()
	/** The latching half of sustain — OR'd with the momentary pedal. */
	private sustainToggle = false

	// Live settings (defaults from SPECS).
	private npo = SPEC_BY_KEY.get("npo")!.default as number
	private vertical = SPEC_BY_KEY.get("vertical")!.default as number
	private root = SPEC_BY_KEY.get("root")!.default as number
	private scale = SPEC_BY_KEY.get("scale")!.default as ScaleName
	private layout = SPEC_BY_KEY.get("layout")!.default as "chromatic" | "folded"
	private orientation = SPEC_BY_KEY.get("orientation")!.default as Orientation

	// Sustain latch: two quick taps on the shift-2 key hold it down until the next tap.
	private lastSustainTapAt = 0
	private sustainLatched = false

	init(ctx: PageContext) {
		this.size = ctx.size
		this.keysW = Math.min(KEYS_W, this.size.width)
		this.allNotesOff(ctx)
		this.announce(ctx)
	}

	onFocus(ctx: PageContext) {
		this.announce(ctx)
	}

	onBlur(ctx: PageContext) {
		// Release everything so a page switch can't strand a note. Saved chords stay —
		// they're stored content, not runtime state.
		this.allNotesOff(ctx)
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
		if (this.isSustainToggle(ev.x, ev.y)) { this.toggleKey(ev, ctx); return }

		const slot = this.presetSlotAt(ev.x, ev.y)
		if (slot !== null) { this.presetKey(slot, ev, ctx); return }

		if (ev.x < 0 || ev.x >= this.keysW || ev.y < 0 || ev.y >= this.size.height) return
		const i = ledIndex(this.size, ev.x, ev.y)
		if (ev.s) this.pressKey(i, ctx)
		else this.releaseKey(i, ctx)
	}

	/**
	 * A keyboard press. Normally it just claims the cell — but while ANY sustain is on,
	 * pressing a note that is already ringing turns it OFF instead, which is how you
	 * subtract a note from a sustained chord. That kills the note wherever it is sounding
	 * (twins included), not just the cell you hit. A note some other finger is physically
	 * holding is left alone — you stop that by releasing it, same as always.
	 */
	private pressKey(i: number, ctx: PageContext) {
		const step = this.stepOfIndex(i)
		if (this.sustainOn(ctx) && this.lastSounding.has(step) && !this.isPhysicallyHeld(step)) {
			this.silenceStep(step)
			this.killedByPress.add(i) // so this cell's RELEASE doesn't re-sustain it
			this.commit(ctx)
			return
		}
		this.held.add(i)
		this.commit(ctx)
	}

	private releaseKey(i: number, ctx: PageContext) {
		if (this.killedByPress.delete(i)) return // that press was a note-off gesture
		this.held.delete(i)
		if (this.sustainOn(ctx)) this.sustained.add(this.stepOfIndex(i))
		this.commit(ctx)
	}

	/**
	 * The sustain TOGGLE. Latching, and OR'd with the momentary pedal, so either one alone
	 * sustains. It doubles as the SAVE arm for the chord presets: while it's on, a preset
	 * key stores the ringing chord instead of playing one. That's the difference between it
	 * and the pedal's double-tap latch, which sustains but leaves the presets playable.
	 */
	private toggleKey(ev: KeyEvent, ctx: PageContext) {
		if (!ev.s) return // latching: act on press, ignore release
		this.sustainToggle = !this.sustainToggle
		this.commit(ctx)
	}

	/**
	 * A chord preset key. Armed (toggle on) it SAVES whatever is ringing — saving silence
	 * clears the slot. Otherwise it PLAYS, momentarily: the chord sounds while the key is
	 * down and, if a sustain is active when you let go, keeps ringing. That's what makes
	 * "double-tap the pedal, then stab presets" stack chords up.
	 */
	private presetKey(slot: number, ev: KeyEvent, ctx: PageContext) {
		if (!ev.s) {
			const steps = this.presetHeld.get(slot)
			if (!steps) return
			this.presetHeld.delete(slot)
			if (this.sustainOn(ctx)) for (const s of steps) this.sustained.add(s)
			this.commit(ctx)
			return
		}
		if (this.sustainToggle) {
			const chord = [...this.lastSounding].sort((a, b) => a - b)
			if (chord.length) this.chords.set(slot, chord)
			else this.chords.delete(slot)
			this.emitChords(ctx)
			return
		}
		const chord = this.chords.get(slot)
		if (!chord) return
		this.presetHeld.set(slot, [...chord])
		this.commit(ctx)
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
		// Sustain can also fall because an OSC shift dropped, which never reaches onKey.
		this.commit(ctx)

		// A note is lit at EVERY cell that plays it — on an isomorphic layout that shows
		// the shape you're playing — and the cells actually under a finger burn brighter.
		const sounding = this.lastSounding

		const f = makeFrame(this.size)
		for (let y = 0; y < this.size.height; y++) {
			for (let x = 0; x < this.keysW; x++) {
				const i = ledIndex(this.size, x, y)
				const step = this.step(x, y)
				let lvl = this.baseLevel(step)
				if (sounding.has(step)) lvl = LVL_UNISON
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
		if (this.hasSustainToggle()) {
			f[ledIndex(this.size, this.size.width - 1, SUSTAIN_TOGGLE_ROW)] =
				this.sustainToggle ? LVL_HELD : LVL_SHIFT
		}
		// Chord presets: dim when empty, brighter when loaded, brightest while playing,
		// and the whole column lifts while the toggle arms them for saving.
		if (this.hasPresets()) {
			const cx = this.size.width - 2
			for (let slot = 0; slot < this.size.height; slot++) {
				const full = this.chords.has(slot)
				let lvl = this.sustainToggle
					? full ? LVL_PRESET_FULL_ARMED : LVL_PRESET_EMPTY_ARMED
					: full ? LVL_PRESET_FULL : LVL_PRESET_EMPTY
				if (this.presetHeld.has(slot)) lvl = LVL_HELD
				f[ledIndex(this.size, cx, slot)] = lvl
			}
		}
		return f
	}

	serialize() {
		// Saved chords are stored content, so they belong in a preset capture; the sustain
		// state and anything currently sounding deliberately do not.
		return { ...this.settings(), chords: this.chordArray() }
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
			this.commit(ctx)
			return
		}
		const now = Date.now()
		if (this.sustainLatched) {
			this.sustainLatched = false
			this.lastSustainTapAt = 0
			ctx.setShift(2, false)
			this.commit(ctx)
			return
		}
		if (now - this.lastSustainTapAt < DOUBLE_TAP_MS) this.sustainLatched = true
		this.lastSustainTapAt = now
		ctx.setShift(2, true)
		this.commit(ctx)
	}

	/**
	 * The step a cell plays. In `chromatic` the field is the plain isomorphic layout; in
	 * `folded` the same coordinates index SCALE DEGREES instead, which we resolve back to
	 * a chromatic step here — so what leaves this page is always an ordinary step and
	 * Max's step→pitch map never has to know which scale is selected.
	 */
	private step(x: number, y: number): number {
		const i = stepAt(x, y, this.size.height, this.vertical, this.orientation)
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

	/** Sustain is a two-input OR: the latching toggle, or the momentary pedal. */
	private sustainOn(ctx: PageContext): boolean {
		return this.sustainToggle || ctx.modifiers.shift2
	}

	/** Every step any source is currently asking for. */
	private soundingSteps(): Set<number> {
		const s = new Set<number>()
		for (const i of this.held) s.add(this.stepOfIndex(i))
		for (const step of this.sustained) s.add(step)
		for (const steps of this.presetHeld.values()) for (const step of steps) s.add(step)
		return s
	}

	private isPhysicallyHeld(step: number): boolean {
		for (const i of this.held) if (this.stepOfIndex(i) === step) return true
		return false
	}

	/** Drop a step from every hands-off source, so it stops ringing everywhere. */
	private silenceStep(step: number) {
		this.sustained.delete(step)
		for (const [slot, steps] of this.presetHeld) {
			const kept = steps.filter((s) => s !== step)
			if (kept.length) this.presetHeld.set(slot, kept)
			else this.presetHeld.delete(slot)
		}
	}

	/** Settle the sustain edge, then send only the notes that actually changed. */
	private commit(ctx: PageContext) {
		const on = this.sustainOn(ctx)
		if (this.prevSustain && !on) this.sustained.clear() // falling edge drops the pedal
		this.prevSustain = on

		const now = this.soundingSteps()
		for (const step of now) if (!this.lastSounding.has(step)) this.note(ctx, step, true)
		for (const step of this.lastSounding) if (!now.has(step)) this.note(ctx, step, false)
		this.lastSounding = now
	}

	private note(ctx: PageContext, step: number, on: boolean) {
		ctx.osc.send(`/grid/out/page/${ctx.slotLabel}/note`, step, on ? 1 : 0)
	}

	/** Silence everything and forget all runtime state (saved chords survive). */
	private allNotesOff(ctx: PageContext) {
		this.held.clear()
		this.sustained.clear()
		this.presetHeld.clear()
		this.killedByPress.clear()
		this.sustainToggle = false
		this.prevSustain = false
		for (const step of this.lastSounding) this.note(ctx, step, false)
		this.lastSounding = new Set()
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
	/** The toggle needs a last column tall enough to have a 5th row, and no key clash. */
	private hasSustainToggle(): boolean {
		return this.hasControls() && this.size.height > SUSTAIN_TOGGLE_ROW + 2
	}
	private isSustainToggle(x: number, y: number): boolean {
		return this.hasSustainToggle() && x === this.size.width - 1 && y === SUSTAIN_TOGGLE_ROW
	}
	/** Presets need a SECOND dead column, so a narrow grid simply doesn't get them. */
	private hasPresets(): boolean {
		return this.size.width - 2 >= this.keysW
	}
	/** The preset slot at (x, y), or null if that isn't a preset key. One slot per row. */
	private presetSlotAt(x: number, y: number): number | null {
		if (!this.hasPresets() || x !== this.size.width - 2) return null
		if (y < 0 || y >= this.size.height) return null
		return y
	}

	/** Chords as a dense array (null = empty slot) — the shape Max and the web UI get. */
	private chordArray(): (number[] | null)[] {
		return Array.from({ length: this.size.height }, (_, slot) => this.chords.get(slot) ?? null)
	}

	private emitChords(ctx: PageContext) {
		ctx.osc.send(`/grid/out/page/${ctx.slotLabel}/chords`, JSON.stringify(this.chordArray()))
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
		if (key === "orientation") {
			if (!isOrientation(raw)) return false
			this.orientation = raw
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
		this.emitChords(ctx)
	}

	private settings() {
		return {
			npo: this.npo,
			vertical: this.vertical,
			root: this.root,
			scale: this.scale,
			layout: this.layout,
			orientation: this.orientation,
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
