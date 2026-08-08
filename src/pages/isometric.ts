/* Page: Isometric
 * ------------------------------------------------------------------------------
 * Summary : Isomorphic keyboard on the left 13×8 — a pure integer "step field".
 *           Each key has a step index; we emit the NUMBER, Max owns step→pitch.
 * Input   : press a keyboard key → /grid/out/page/<slot>/note <step> <1|0> <track>.
 *           TAXONOMY — cols 0-12 KEYBOARD; col 13 CHORDS (8 presets); col 14
 *           rows 0-3 TRACKS (outputs); col 15 rows 0-3 LOOPERS, row 4 SUSTAIN
 *           TOGGLE, row 6 SUSTAIN PEDAL (shift 2), row 7 SHIFT (shift 1).
 * Display : out-of-scale 1, in-scale 3, root 8, SOUNDING 12, finger-down 15.
 *           Chords: empty 1, loaded 6, playing 15 (+2/+3 while armed to save).
 *           Loopers: empty 1, blinking while armed, 6 stopped, 15 looping.
 *           Tracks: 3 idle, 12 active, blinking while being routed.
 * Settings: npo · vertical · root · scale · layout · orientation · lane · quant1-4.
 *           Live, two-way over OSC.
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
 * CHORDS (column 13, one slot per row) store PITCHES — a list of steps — so a later change
 * of root/scale/vertical/orientation doesn't move a saved chord. Armed (sustain toggle on),
 * a press saves whatever is ringing; pressing the SAME slot again while that same chord is
 * still ringing RELEASES it, which is the "right, next one" gesture that makes capturing a
 * run of chords one-handed. Saving silence clears the slot, and SHIFT + press clears it
 * outright. Not armed, a press PLAYS, momentarily: the chord sounds while the key is down
 * and keeps ringing if a sustain is active when you let go, which is what lets you latch
 * the pedal and stack chords up.
 * Out: /grid/out/page/<slot>/chords <json> — a dense array, null = empty.
 *
 * LOOPERS (column 15, rows 0-3) are free-time pattern recorders — see util/patternRecorder.
 * One key cycles empty → recording → playing → stopped → playing, shift 1 + press clears,
 * and a take longer than a minute closes itself. Loop length is exactly what you played;
 * the per-track `quant1..4` settings can round that length onto a grid of `lane` clock
 * ticks, but never move the events inside. Out: /grid/out/page/<slot>/patterns <json>.
 *
 * TRACKS (column 14, rows 0-3) are output destinations — one instrument each at the Max
 * end. Exactly one is ACTIVE; live notes always go there. A plain press selects. SHIFT +
 * press LATCHES that track for routing-edit: let go of shift and the LOOPER keys stop
 * recording and start meaning "does this looper feed this track" (bright = yes). Press the
 * latched track to leave, or another to move the edit. A looper routed nowhere follows the
 * active track; routing it anywhere pins it, and it may feed several tracks at once.
 * SHIFT + all four tracks held together wipes every route, back to following.
 * Out: /grid/out/page/<slot>/tracks <json> — { active, routes }.
 *
 * THE NOTE PIPELINE. A note is identified by (TRACK, STEP), not step alone, and reconciled
 * against what Max was last told — because five sources (fingers, held chords, the sustain
 * buffer and four loopers) can claim one note at once:
 *
 *   keys + chords ──> LIVE ──> [record tap] ──┐
 *                                             ├──> INTENT ──> [sustain] ──> reconcile
 *   looper playback ──────────────────────────┘
 *
 * Each step's track is stamped WHEN IT STARTS and held until it ends, so switching the
 * active track lands on the next note-on rather than re-attacking everything ringing.
 * Loopers tap LIVE, so a pattern holds what you PLAYED, not what the pedal did with it.
 * Sustain sits downstream of INTENT, which includes playback — so holding the pedal smears
 * a running loop into a pad exactly as it smears your hands. Three consequences worth
 * knowing:
 *   · pressing a note ALREADY SOUNDING ON THE ACTIVE TRACK (a loop, a chord, another
 *     finger) emits an explicit note-off then note-on, because a bare second note-on is
 *     undefined in MIDI. The same pitch on another track is a different instrument, and
 *     is left alone;
 *   · except when it is ringing purely because sustain parked it — then the press SUBTRACTS
 *     it, which is how you take a note out of a held chord;
 *   · a note stops only when the LAST source lets go, so two unison twins are one note.
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
import { PatternRecorder } from "../util/patternRecorder.js"
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

/** Pattern recorders: the first four buttons of the last column. */
const RECORDER_ROWS = 4
const LVL_REC_EMPTY = 1
const LVL_REC_ARMED = 9 // the bright half of the recording blink
const LVL_REC_STOPPED = 6 // has a pattern, not playing
const BLINK_MS = 220

/** How often the recorder timer wakes. Free time needs finer than a 58fps frame. */
const TIMER_MS = 5

/** Loop-length quantise choices, in ticks of the followed lane. "off" = free time. */
const QUANTA = ["off", "1", "2", "4", "8", "16"] as const

/**
 * The two control columns, counted from the RIGHT edge so they sit correctly on any grid
 * width. TRACKS are second-to-last (beside the loopers), CHORDS third-to-last.
 */
const TRACK_COL_FROM_RIGHT = 2
const CHORD_COL_FROM_RIGHT = 3

/** Output TRACKS: the first four buttons of their column. */
const TRACK_ROWS = 4
const LVL_TRACK_OFF = 3
const LVL_TRACK_ON = 12 // the active track
const LVL_TRACK_EDIT = 15 // bright half of the routing-edit blink
const LVL_TRACK_EDIT_LO = 6

/**
 * Notes are identified by (track, step), so they pack into one number for cheap Set diffs.
 * Steps are bounded far below the stride: 12 columns + 7 rows of a 24-semitone `vertical`
 * tops out around 180.
 */
const NOTE_STRIDE = 4096
const noteKey = (track: number, step: number) => track * NOTE_STRIDE + step
const trackOf = (key: number) => Math.floor(key / NOTE_STRIDE)
const stepOf = (key: number) => key % NOTE_STRIDE

/** Two chords are the same if they hold the same pitches. Both sides arrive sorted. */
const sameChord = (a: readonly number[] | undefined, b: readonly number[]): boolean =>
	!!a && a.length === b.length && a.every((v, i) => v === b[i])

/**
 * Which tracks a looper plays into: the tracks it has been explicitly routed to, or — if it
 * has been routed nowhere — whichever track is currently active. Routing a looper anywhere
 * is what stops it following the active track.
 */
export function tracksForLooper(
	looper: number,
	routes: ReadonlyArray<ReadonlySet<number>>,
	activeTrack: number,
): number[] {
	const pinned: number[] = []
	routes.forEach((set, track) => { if (set.has(looper)) pinned.push(track) })
	return pinned.length ? pinned : [activeTrack]
}

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
	{ key: "lane", label: "clock lane (quantise)", type: "number", min: 0, max: 3, step: 1, default: 0 },
	...Array.from({ length: RECORDER_ROWS }, (_, i): SettingSpec => ({
		key: `quant${i + 1}`,
		label: `rec ${i + 1} quantise`,
		type: "enum",
		options: [...QUANTA],
		default: "off",
	})),
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
	// These four hold PACKED (track, step) keys — see noteKey().
	private lastSounding = new Set<number>() // what Max currently believes is on
	private lastIntent = new Set<number>() // pre-sustain, so we can spot what just let go
	private retrigger = new Set<number>() // notes to articulate again this commit
	private lastLive = new Set<number>() // STEPS only (pre-track): the stream loopers tap

	/**
	 * Per source (index 0 = live, 1..4 = loopers), the tracks each sounding step was given
	 * WHEN IT STARTED. Held rather than recomputed, so switching the active track lands on
	 * the next note-on instead of re-attacking everything currently ringing.
	 */
	private srcTracks: Array<Map<number, number[]>> = []

	/** Output tracks. Exactly one is active; `routes[track]` holds the loopers pinned to it. */
	private activeTrack = 0
	private routes: Array<Set<number>> = Array.from({ length: TRACK_ROWS }, () => new Set<number>())
	/** Latched routing-edit target, or null. Set by SHIFT + a track key. */
	private editingTrack: number | null = null
	/** Track keys physically down — only the all-four-at-once gesture needs this. */
	private tracksDown = new Set<number>()

	/** Four free-time loopers. They keep running when the page loses focus. */
	private recorders = Array.from({ length: RECORDER_ROWS }, () => new PatternRecorder())
	private timer: ReturnType<typeof setInterval> | null = null
	private lastTickMs = 0
	/** The slot's context is created once and reused, so the timer can hold it. */
	private ctx: PageContext | null = null

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
	private lane = SPEC_BY_KEY.get("lane")!.default as number
	/** Per-recorder loop quantum, in lane ticks. 0 = off (the default). */
	private quant = new Array<number>(RECORDER_ROWS).fill(0)

	// Sustain latch: two quick taps on the shift-2 key hold it down until the next tap.
	private lastSustainTapAt = 0
	private sustainLatched = false

	init(ctx: PageContext) {
		this.ctx = ctx
		this.size = ctx.size
		this.keysW = Math.min(KEYS_W, this.size.width)
		this.releaseLive(ctx)
		for (const r of this.recorders) r.clear()
		this.syncTimer()
		this.announce(ctx)
	}

	onFocus(ctx: PageContext) {
		this.announce(ctx)
	}

	onBlur(ctx: PageContext) {
		// Release what your hands were doing, so a page switch can't strand a note. What
		// does NOT stop: the pattern recorders — a running loop has to survive a slot
		// change, exactly like an onTick sequencer (docs/PAGE_PROTOCOL.md §6). Saved
		// chords stay too; they're stored content, not runtime state.
		this.releaseLive(ctx)
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

		const rec = this.recorderIndexAt(ev.x, ev.y)
		if (rec !== null) { this.recorderKey(rec, ev, ctx); return }

		const track = this.trackIndexAt(ev.x, ev.y)
		if (track !== null) { this.trackKey(track, ev, ctx); return }

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
		// A press only ever concerns the ACTIVE track — the same note ringing on some other
		// track belongs to another instrument and is none of this gesture's business.
		const key = noteKey(this.activeTrack, this.stepOfIndex(i))
		// Ringing PURELY because sustain parked it — nothing is actively asking for it.
		// The press subtracts it from the held chord and starts nothing.
		if (this.sustainOn(ctx) && this.lastSounding.has(key) && !this.lastIntent.has(key)) {
			this.sustained.delete(key)
			this.commit(ctx)
			return
		}
		// Something is actively playing it — a loop, a chord, another finger. Articulate
		// over the top rather than silently joining the note already in progress.
		if (this.lastSounding.has(key)) this.retrigger.add(key)
		this.held.add(i)
		this.commit(ctx)
	}

	private releaseKey(i: number, ctx: PageContext) {
		this.held.delete(i)
		this.commit(ctx) // the sustain stage parks it if a sustain is on
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
			if (!this.presetHeld.has(slot)) return
			this.presetHeld.delete(slot)
			this.commit(ctx) // the sustain stage parks the chord if a sustain is on
			return
		}
		if (ctx.modifiers.shift1) {
			// Shift-clear, same gesture as clearing a looper. Beats saving to it.
			this.chords.delete(slot)
			this.emitChords(ctx)
			return
		}
		if (this.sustainToggle) {
			const chord = this.soundingChord()
			// Pressing the slot you JUST saved to, with that chord still ringing, releases
			// it — the "right, next one" gesture. Saving is idempotent, so comparing the
			// chord beats remembering which slot was last written.
			if (chord.length && sameChord(this.chords.get(slot), chord)) {
				this.sustained.clear()
				this.commit(ctx)
				return
			}
			if (chord.length) this.chords.set(slot, chord)
			else this.chords.delete(slot) // saving silence clears the slot
			this.emitChords(ctx)
			return
		}
		const chord = this.chords.get(slot)
		if (!chord) return
		this.presetHeld.set(slot, [...chord])
		this.commit(ctx)
	}

	/**
	 * One recorder key drives the whole state machine:
	 *   empty -> recording -> playing -> stopped -> playing -> ...
	 * and shift 1 + press throws the pattern away from any state. Recording opens on the
	 * arm press, so a leading rest is capturable, and closes itself after MAX_RECORD_MS.
	 */
	private recorderKey(idx: number, ev: KeyEvent, ctx: PageContext) {
		if (!ev.s) return // the whole machine acts on press
		// While a track is latched for routing, these keys mean "does this looper feed it"
		// and nothing else — no recording, no clearing.
		if (this.editingTrack !== null) {
			const set = this.routes[this.editingTrack]
			if (!set.delete(idx)) set.add(idx)
			this.emitTracks(ctx)
			this.commit(ctx)
			return
		}
		const r = this.recorders[idx]
		if (ctx.modifiers.shift1) r.clear()
		else r.press(Date.now(), this.quantumMs(idx))
		this.emitPatterns(ctx)
		this.commit(ctx)
		this.syncTimer()
	}

	/**
	 * A TRACK key — an output, i.e. an instrument at the Max end.
	 *
	 * Plain press selects it. SHIFT latches it for routing-edit (let go of shift; the looper
	 * keys take over until you press a track again). SHIFT with all four held at once wipes
	 * every route, which is the way back to "everything follows the active track".
	 */
	private trackKey(idx: number, ev: KeyEvent, ctx: PageContext) {
		if (!ev.s) {
			this.tracksDown.delete(idx)
			return
		}
		this.tracksDown.add(idx)

		if (ctx.modifiers.shift1) {
			if (this.tracksDown.size >= TRACK_ROWS) {
				for (const set of this.routes) set.clear()
				this.editingTrack = null
			} else {
				this.editingTrack = this.editingTrack === idx ? null : idx
			}
			this.emitTracks(ctx)
			this.commit(ctx)
			return
		}
		if (this.editingTrack !== null) {
			// Same track closes the edit; a different one moves it. You leave edit mode
			// before you can change which track is active — one mode at a time.
			this.editingTrack = this.editingTrack === idx ? null : idx
			this.emitTracks(ctx)
			return
		}
		if (this.activeTrack === idx) return
		this.activeTrack = idx
		this.emitTracks(ctx)
		this.commit(ctx) // sounding notes keep their old track; the next note-on moves
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
		const blinkOn = Date.now() % (BLINK_MS * 2) < BLINK_MS
		// Loopers: blink while armed, full while looping, mid when stopped with content —
		// unless a track is latched, when the whole column switches to showing ITS routing.
		if (this.hasRecorders()) {
			const rx = this.size.width - 1
			const editing = this.editingTrack
			for (let idx = 0; idx < RECORDER_ROWS; idx++) {
				let lvl: number
				if (editing !== null) {
					lvl = this.routes[editing].has(idx) ? LVL_HELD : LVL_NORMAL
				} else {
					const st = this.recorders[idx].state
					lvl =
						st === "recording" ? (blinkOn ? LVL_REC_ARMED : LVL_REC_EMPTY)
						: st === "playing" ? LVL_HELD
						: st === "stopped" ? LVL_REC_STOPPED
						: LVL_REC_EMPTY
				}
				f[ledIndex(this.size, rx, idx)] = lvl
			}
		}
		// Tracks: the active one stands out, and the one being routed blinks.
		if (this.hasTracks()) {
			const tx = this.size.width - TRACK_COL_FROM_RIGHT
			for (let idx = 0; idx < TRACK_ROWS; idx++) {
				const lvl =
					this.editingTrack === idx ? (blinkOn ? LVL_TRACK_EDIT : LVL_TRACK_EDIT_LO)
					: this.activeTrack === idx ? LVL_TRACK_ON
					: LVL_TRACK_OFF
				f[ledIndex(this.size, tx, idx)] = lvl
			}
		}
		// Chord presets: dim when empty, brighter when loaded, brightest while playing,
		// and the whole column lifts while the toggle arms them for saving.
		if (this.hasPresets()) {
			const cx = this.size.width - CHORD_COL_FROM_RIGHT
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
		return {
			...this.settings(),
			chords: this.chordArray(),
			patterns: this.recorders.map((r) => r.snapshot()),
			...this.trackState(),
		}
	}

	dispose(ctx: PageContext) {
		// The slot is going away for good — now the loops really do stop.
		this.releaseLive(ctx)
		for (const r of this.recorders) r.clear()
		this.commit(ctx)
		this.syncTimer()
		this.ctx = null
	}

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

	/**
	 * The note pipeline, in stages:
	 *
	 *   keys + presets ──> LIVE ──> [record tap] ──┐
	 *                                              ├──> INTENT ──> [sustain] ──> reconcile
	 *   recorder playback ─────────────────────────┘
	 *
	 * Two things fall out of that shape. Recorders tap LIVE, so a pattern captures what you
	 * PLAYED rather than what the pedal did with it — sustain is genuinely independent of
	 * recording. And sustain sits downstream of INTENT, which includes recorder playback, so
	 * holding the pedal smears a running loop into a pad exactly like it smears your hands.
	 */
	private commit(ctx: PageContext) {
		const nowMs = Date.now()

		// 1. LIVE — what your hands and the chord presets are asking for, as plain steps.
		const live = new Set<number>()
		for (const i of this.held) live.add(this.stepOfIndex(i))
		for (const steps of this.presetHeld.values()) for (const step of steps) live.add(step)

		// 2. RECORD TAP — the transitions of that stream, before sustain or tracks touch it.
		this.tapRecorders(live, nowMs)

		// 3. INTENT — live plus loop playback, each step stamped with the track(s) it began
		//    on. Loopers never tap each other, so a loop can't record itself into a pile.
		const sources = [live, ...this.recorders.map((r) => r.sounding)]
		const intent = new Set<number>()
		for (let s = 0; s < sources.length; s++) {
			const steps = sources[s]
			const started = (this.srcTracks[s] ??= new Map())
			for (const step of started.keys()) if (!steps.has(step)) started.delete(step)
			for (const step of steps) {
				let tracks = started.get(step)
				if (!tracks) {
					tracks = s === 0 ? [this.activeTrack] : tracksForLooper(s - 1, this.routes, this.activeTrack)
					started.set(step, tracks)
				}
				for (const track of tracks) intent.add(noteKey(track, step))
			}
		}

		// 4. SUSTAIN — park anything that just LEFT the intent, track and all. One rule
		//    covering fingers, chords and loops instead of each source sustaining itself.
		if (this.sustainOn(ctx)) {
			for (const key of this.lastIntent) if (!intent.has(key)) this.sustained.add(key)
		} else this.sustained.clear()
		this.lastIntent = intent

		// 5. RECONCILE against what Max was last told.
		const out = new Set(intent)
		for (const key of this.sustained) out.add(key)
		// A retrigger articulates a note that is staying on, so it needs an explicit off/on
		// pair — a bare second note-on is undefined in MIDI.
		for (const key of this.retrigger) {
			if (this.lastSounding.has(key) && out.has(key)) {
				this.note(ctx, key, false)
				this.note(ctx, key, true)
			}
		}
		this.retrigger.clear()
		for (const key of out) if (!this.lastSounding.has(key)) this.note(ctx, key, true)
		for (const key of this.lastSounding) if (!out.has(key)) this.note(ctx, key, false)
		this.lastSounding = out
	}

	/** The pitches currently sounding, deduped across tracks — what a chord preset saves. */
	private soundingChord(): number[] {
		return [...new Set([...this.lastSounding].map(stepOf))].sort((a, b) => a - b)
	}

	/** Feed the live stream's transitions to every armed recorder. */
	private tapRecorders(live: Set<number>, nowMs: number) {
		if (this.recorders.some((r) => r.state === "recording")) {
			for (const step of this.lastLive) if (!live.has(step)) this.recordAll(step, false, nowMs)
			for (const key of this.retrigger) {
				const step = stepOf(key)
				if (live.has(step) && this.lastLive.has(step)) {
					this.recordAll(step, false, nowMs)
					this.recordAll(step, true, nowMs)
				}
			}
			for (const step of live) if (!this.lastLive.has(step)) this.recordAll(step, true, nowMs)
		}
		this.lastLive = live
	}

	private recordAll(step: number, on: boolean, nowMs: number) {
		for (const r of this.recorders) r.record(step, on, nowMs)
	}

	private note(ctx: PageContext, key: number, on: boolean) {
		ctx.osc.send(`/grid/out/page/${ctx.slotLabel}/note`, stepOf(key), on ? 1 : 0, trackOf(key))
	}

	/** Drop everything the hands own. Recorders are deliberately untouched. */
	private releaseLive(ctx: PageContext) {
		this.held.clear()
		this.sustained.clear()
		this.presetHeld.clear()
		this.retrigger.clear()
		this.sustainToggle = false
		this.commit(ctx)
	}

	// --- the recorder timer ------------------------------------------------------
	//
	// Free time fits neither of the framework's clocks: render() only runs for the FOCUSED
	// page, and onTick is locked to the app transport (which boots stopped). So this page
	// owns one interval. It is cleared in dispose() but deliberately NOT in onBlur — a loop
	// has to keep playing when you switch slots, the same guarantee onTick sequencers get.

	private syncTimer() {
		const needed = this.recorders.some((r) => r.isRunning)
		if (needed && !this.timer) {
			this.lastTickMs = Date.now()
			this.timer = setInterval(() => this.onTimer(), TIMER_MS)
		} else if (!needed && this.timer) {
			clearInterval(this.timer)
			this.timer = null
		}
	}

	private onTimer() {
		const ctx = this.ctx
		if (!ctx) return
		const nowMs = Date.now()
		const dt = nowMs - this.lastTickMs
		this.lastTickMs = nowMs
		for (let i = 0; i < this.recorders.length; i++) {
			this.recorders[i].advance(nowMs, dt, this.quantumMs(i))
		}
		this.commit(ctx)
		this.syncTimer() // a recording may have hit the cap, or a loop been stopped
	}

	/**
	 * The loop-length grid for one recorder, in ms. `off` — the default — and a stopped
	 * transport both mean pure free time, which is the point of a free-time looper.
	 */
	private quantumMs(idx: number): number {
		const q = this.quant[idx] ?? 0
		const clock = this.ctx?.clock
		if (!q || !clock?.rate) return 0
		const lane = clock.lanes?.[this.lane]
		return (q * 1000 * (lane?.div || 1)) / clock.rate
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
		return this.size.width - CHORD_COL_FROM_RIGHT >= this.keysW
	}
	/** The preset slot at (x, y), or null if that isn't a preset key. One slot per row. */
	private presetSlotAt(x: number, y: number): number | null {
		if (!this.hasPresets() || x !== this.size.width - CHORD_COL_FROM_RIGHT) return null
		if (y < 0 || y >= this.size.height) return null
		return y
	}

	/** Recorders need a last column with room above the sustain toggle. */
	private hasRecorders(): boolean {
		return this.hasControls() && this.size.height > RECORDER_ROWS
	}
	private recorderIndexAt(x: number, y: number): number | null {
		if (!this.hasRecorders() || x !== this.size.width - 1) return null
		return y >= 0 && y < RECORDER_ROWS ? y : null
	}

	/** Tracks need a THIRD dead column; a narrower grid simply doesn't get them. */
	private hasTracks(): boolean {
		return this.size.width - TRACK_COL_FROM_RIGHT >= this.keysW && this.size.height >= TRACK_ROWS
	}
	private trackIndexAt(x: number, y: number): number | null {
		if (!this.hasTracks() || x !== this.size.width - TRACK_COL_FROM_RIGHT) return null
		return y >= 0 && y < TRACK_ROWS ? y : null
	}

	/** Chords as a dense array (null = empty slot) — the shape Max and the web UI get. */
	private chordArray(): (number[] | null)[] {
		return Array.from({ length: this.size.height }, (_, slot) => this.chords.get(slot) ?? null)
	}

	private trackState() {
		return { active: this.activeTrack, routes: this.routes.map((set) => [...set].sort((a, b) => a - b)) }
	}

	private emitTracks(ctx: PageContext) {
		ctx.osc.send(`/grid/out/page/${ctx.slotLabel}/tracks`, JSON.stringify(this.trackState()))
	}

	/** Summary only — the full event lists would be a big message on every press. */
	private emitPatterns(ctx: PageContext) {
		const state = this.recorders.map((r) => ({ state: r.state, ms: Math.round(r.loopMs) }))
		ctx.osc.send(`/grid/out/page/${ctx.slotLabel}/patterns`, JSON.stringify(state))
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
		const q = /^quant([1-9]\d*)$/.exec(key)
		if (q) {
			const idx = Number(q[1]) - 1
			if (idx < 0 || idx >= RECORDER_ROWS) return false
			const raw2 = String(raw)
			if (!(QUANTA as readonly string[]).includes(raw2)) return false
			this.quant[idx] = raw2 === "off" ? 0 : Number(raw2)
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
		else if (key === "lane") this.lane = v
		return true
	}

	private announce(ctx: PageContext) {
		ctx.osc.send(`/grid/out/page/${ctx.slotLabel}/type`, "isometric")
		this.emitSettings(ctx)
		this.emitChords(ctx)
		this.emitPatterns(ctx)
		this.emitTracks(ctx)
	}

	private settings() {
		return {
			npo: this.npo,
			vertical: this.vertical,
			root: this.root,
			scale: this.scale,
			layout: this.layout,
			orientation: this.orientation,
			lane: this.lane,
			...Object.fromEntries(
				this.quant.map((v, i) => [`quant${i + 1}`, v === 0 ? "off" : String(v)]),
			),
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
