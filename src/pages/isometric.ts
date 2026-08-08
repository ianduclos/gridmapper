/* Page: Isometric
 * ------------------------------------------------------------------------------
 * Summary : Isomorphic keyboard on the left 13×8 — a pure integer "step field".
 *           Each key has a step index; we emit the NUMBER, Max owns step→pitch.
 * Input   : press a keyboard key → /grid/out/page/<slot>/note <step> <1|0> <track>.
 *           TAXONOMY — cols 0-12 KEYBOARD; col 13 CHORDS (8 presets); col 14
 *           rows 0-3 TRACKS (outputs) + rows 4-7 ARPS; col 15 rows 0-3 LOOPERS,
 *           row 4 SUSTAIN TOGGLE, row 5 SUSTAIN PEDAL, row 6 SHIFT 2, row 7 SHIFT 1.
 * Display : out-of-scale 1, in-scale 3, root 8, in the CHORD 12, finger-down 15, and —
 *           while the arp runs — the note it is voicing right now 15 on top, so the
 *           sustained chord stays readable underneath it.
 *           Chords: empty 1, loaded 6, playing 15 (+2/+3 while armed to save).
 *           Loopers: empty 1, blinking while armed, 6 stopped, 15 looping.
 *           Tracks + arps: idle levels RAMP down each group (1,2,3,4) so a row of options
 *           is distinguishable at a glance; selected/on are much brighter. Every note-on
 *           pulses its track's LED briefly, so you can see which instrument is being fed.
 *           Shifts and both sustains light while they are holding.
 * Settings: npo · vertical · root · scale · layout · orientation · lane · quant1-4 ·
 *           arp · arpRate · arpDiv. Live, two-way over OSC.
 * Rules   : keyboard = columns 0..(keysW-1); the control columns only exist when
 *           there's a dead zone. Releases everything on blur so a page switch never
 *           strands a note in Max; SAVED CHORDS survive (stored content, not state).
 * ------------------------------------------------------------------------------
 * Step field: one column right = +1 step; one row UP = +`vertical` steps. Bottom-left
 * is step 0. We send only the step integer + an on/off flag — no pitch, no velocity.
 * `npo` does NOT change the step we emit; it sets the octave size for root highlighting
 * and is shared with Max (in: /grid/in/page/<slot>/setting/npo <n>; out: /settings).
 *
 * SUSTAIN is a two-input OR — the momentary pedal OR the latching toggle — so either alone
 * holds notes. The pedal is DEBOUNCED (leading-edge lockout, and a double tap must be at
 * least DOUBLE_TAP_MIN_MS apart): without that, one bouncy press reads as a deliberate
 * double tap, latches sustain on, and the button feels stuck. While it's on, a keyboard release parks the note in `sustained` instead of
 * sending a note-off; when sustain falls, every parked note is released. A DOUBLE-TAP on
 * the pedal latches it hands-free.
 *
 * The pedal used to BE shift 2 and no longer is: it owns its state so shift 2 can be a real
 * modifier (it multi-selects tracks). The cost, deliberately accepted, is that
 * `/grid/in/shift 2` no longer sustains and there is no OSC route to sustain at all.
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
 * and a take longer than a minute closes itself. Arming does NOT start the clock: the loop
 * begins at the FIRST NOTE, so there is no dead air from the time it took to reach the
 * keyboard. Stopping PAUSES — the playhead stays put and the next press resumes mid-phrase;
 * only a clear rewinds. Loop length is exactly what you played;
 * the per-track `quant1..4` settings can round that length onto a grid of `lane` clock
 * ticks, but never move the events inside. Out: /grid/out/page/<slot>/patterns <json>.
 *
 * TRACKS (column 14, rows 0-3) are output destinations — one instrument each at the Max
 * end. The SELECTION is where live notes and unrouted loopers go, and what the arpeggiator
 * acts on: normally one track, never empty. A plain press selects just that one; SHIFT 2 +
 * press adds or drops one, so several instruments can be live together. SHIFT 1 + press
 * LATCHES a track for routing-edit: let go of shift and the LOOPER keys stop recording and
 * start meaning "does this looper feed this track" (bright = yes). Press the latched track
 * to leave, or another to move the edit. A looper routed nowhere follows the selection;
 * routing it anywhere pins it, and it may feed several tracks at once. SHIFT 1 + all four
 * tracks held together wipes every route, back to following.
 * Out: /grid/out/page/<slot>/tracks <json> — { selected, routes }.
 *
 * ARPEGGIATORS (column 14, rows 4-7: ascending · descending · palindrome · urn) turn the
 * held chord into one note at a time — see util/arpeggiator.ts. One at a time; pressing the
 * lit one turns it off; it never plays the same note twice in a row, so building a chord
 * finger by finger doesn't replay the note underneath. It sits AFTER sustain, and acts only
 * on the SELECTED tracks, so a
 * looper routed elsewhere keeps its own rhythm while your hands get arpeggiated. The record
 * tap is upstream of it, so loopers still capture what you PLAYED. Timing is hybrid: the
 * `lane` clock (divided by `arpDiv`) while the transport runs, and a free `arpRate` in ms
 * while it is stopped — so it always makes a sound, at the cost of a tempo jump when you
 * start or stop the clock. The first note of a new chord fires immediately rather than
 * waiting out a step, or starting a chord would be silent for up to a whole arpRate.
 *
 * THE NOTE PIPELINE. A note is identified by (TRACK, STEP), not step alone, and reconciled
 * against what Max was last told — because five sources (fingers, held chords, the sustain
 * buffer and four loopers) can claim one note at once:
 *
 *   keys + chords ──> LIVE ──> [record tap] ──┐
 *                                             ├──> INTENT ──> [sustain] ──> [arp] ──> out
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
import type { ClockState } from "../core/clock.js"
import type { PageModule, SettingSpec } from "../core/pageModule.js"
import { clamp } from "../util/scale.js"
import { PatternRecorder } from "../util/patternRecorder.js"
import { Arpeggiator, ARP_MODES, ARP_BUTTONS, isArpMode, type ArpMode } from "../util/arpeggiator.js"
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
const LVL_ARP_VOICE = 15 // the note the arpeggiator is voicing this step
const LVL_SHIFT = 1 // control keys are faint markers

// Chord preset column. "armed" = the sustain toggle is on, so a press SAVES rather
// than plays; the whole column brightens so you can see which mode you're in.
const LVL_PRESET_EMPTY = 1
const LVL_PRESET_FULL = 7
const LVL_PRESET_EMPTY_ARMED = 4
const LVL_PRESET_FULL_ARMED = 11

/** Two taps inside this window on the sustain pedal latch it on. */
const DOUBLE_TAP_MS = 350
/**
 * A second tap CLOSER than this is contact bounce, not a human double tap, and must not
 * latch. Together with PEDAL_LOCKOUT_MS this replaces the debounce the pedal lost when it
 * stopped going through ShiftInput — without it, one bouncy press latches sustain ON and it
 * reads as a stuck button.
 */
const DOUBLE_TAP_MIN_MS = 60
/** Leading-edge lockout, same idea and same window as core/shiftInput.ts. */
const PEDAL_LOCKOUT_MS = 10

/**
 * The last column is now full, so its rows are absolute (top-down) rather than counted from
 * the bottom edge — see `hasControls()` for the height guard that goes with that.
 *   0-3 loopers · 4 sustain toggle · 5 sustain pedal · 6 shift 2 · 7 shift 1
 */
const SUSTAIN_TOGGLE_ROW = 4
const SUSTAIN_PEDAL_ROW = 5
const SHIFT2_ROW = 6
const SHIFT1_ROW = 7
const CONTROL_ROWS = 8 // the last column needs this many rows to hold everything

/** Pattern recorders: the first four buttons of the last column. */
const RECORDER_ROWS = 4
const LVL_REC_EMPTY = 1
const LVL_REC_ARMED = 12 // the bright half of the recording blink
const LVL_REC_STOPPED = 5 // has a pattern, paused
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

/** Output TRACKS: the first four buttons of their column, ARPEGGIATORS the four below. */
const TRACK_ROWS = 4
const ARP_ROW_START = TRACK_ROWS

/**
 * Idle levels RAMP across each group of options (1,2,3,4) instead of all sitting at one
 * value. A row of four identical dim buttons tells you nothing; a faint gradient tells you
 * which one your finger is on without counting rows.
 */
const rampLevel = (base: number, idx: number) => base + idx

const LVL_TRACK_IDLE = 1 // + idx
const LVL_ARP_IDLE = 1 // + idx
const LVL_ARP_ON = 14

/** A note-on gives its track a brief brightness bump — a glance-level activity light. */
const PULSE_MS = 90
const PULSE_BUMP = 4
const LVL_TRACK_ON = 11 // a selected track
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
 * has been routed nowhere — every currently SELECTED track. Routing a looper anywhere is
 * what stops it following the selection.
 */
export function tracksForLooper(
	looper: number,
	routes: ReadonlyArray<ReadonlySet<number>>,
	selected: ReadonlySet<number>,
): number[] {
	const pinned: number[] = []
	routes.forEach((set, track) => { if (set.has(looper)) pinned.push(track) })
	return pinned.length ? pinned : [...selected].sort((a, b) => a - b)
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
	{ key: "arp", label: "arpeggiator", type: "enum", options: [...ARP_MODES], default: "off" },
	{ key: "arpRate", label: "arp rate (ms, clock off)", type: "number", min: 20, max: 2000, step: 5, default: 125 },
	{ key: "arpDiv", label: "arp divide (clock on)", type: "number", min: 1, max: 16, step: 1, default: 1 },
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

	/**
	 * Output tracks. The SELECTION is where live notes and unrouted loopers go, and what the
	 * arpeggiator acts on — normally one track, several while you shift-2 them together, and
	 * never empty. `routes[track]` holds the loopers pinned to it.
	 */
	private selected = new Set<number>([0])
	private routes: Array<Set<number>> = Array.from({ length: TRACK_ROWS }, () => new Set<number>())
	/** Latched routing-edit target, or null. Set by SHIFT + a track key. */
	private editingTrack: number | null = null
	/** Track keys physically down — only the all-four-at-once gesture needs this. */
	private tracksDown = new Set<number>()

	/** One arpeggiator, applied to the selected tracks. Off at boot. */
	private arp = new Arpeggiator()
	private arpPool: number[] = [] // distinct steps sounding on selected tracks, ascending
	private arpNote: number | null = null // the step it is currently letting through
	private arpAccMs = 0 // free-run accumulator, used only while the transport is stopped
	/**
	 * Display sets, as bare STEPS (not packed keys) and pooled across every track, because
	 * a cell lights if ANY track is playing its note.
	 *   litSteps    — the whole chord: held + sustained, BEFORE the arp thins it.
	 *   voicedSteps — what is actually sounding right now, after the arp.
	 * Keeping both is what lets a sustained chord stay visible while the arp walks it, so
	 * you can still see what a chord preset would capture.
	 */
	private litSteps = new Set<number>()
	private voicedSteps = new Set<number>()
	/** When each track last received a note-on, for the activity pulse in render(). */
	private trackPulseAt = new Array<number>(TRACK_ROWS).fill(0)
	private inArpKick = false // guards the "first note of a new chord" re-entry below

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
	/** The momentary half. Its own state now, not shift 2. */
	private sustainPedal = false
	/** Timestamp of the last ACCEPTED pedal edge — the leading-edge lockout. */
	private lastPedalEdgeAt = 0

	// Live settings (defaults from SPECS).
	private npo = SPEC_BY_KEY.get("npo")!.default as number
	private vertical = SPEC_BY_KEY.get("vertical")!.default as number
	private root = SPEC_BY_KEY.get("root")!.default as number
	private scale = SPEC_BY_KEY.get("scale")!.default as ScaleName
	private layout = SPEC_BY_KEY.get("layout")!.default as "chromatic" | "folded"
	private orientation = SPEC_BY_KEY.get("orientation")!.default as Orientation
	private lane = SPEC_BY_KEY.get("lane")!.default as number
	private arpRate = SPEC_BY_KEY.get("arpRate")!.default as number
	private arpDiv = SPEC_BY_KEY.get("arpDiv")!.default as number
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
		// Right-edge control keys. Both shifts route through the shared ShiftInput, so a
		// local shift behaves exactly like one sent over OSC.
		if (this.isShift1(ev.x, ev.y)) { ctx.setShift(1, !!ev.s); return }
		if (this.isShift2(ev.x, ev.y)) { ctx.setShift(2, !!ev.s); return }
		if (this.isSustainPedal(ev.x, ev.y)) { this.sustainKey(ev, ctx); return }
		if (this.isSustainToggle(ev.x, ev.y)) { this.toggleKey(ev, ctx); return }

		const rec = this.recorderIndexAt(ev.x, ev.y)
		if (rec !== null) { this.recorderKey(rec, ev, ctx); return }

		const track = this.trackIndexAt(ev.x, ev.y)
		if (track !== null) { this.trackKey(track, ev, ctx); return }

		const arp = this.arpIndexAt(ev.x, ev.y)
		if (arp !== null) { this.arpKey(arp, ev, ctx); return }

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
		// A press only concerns the SELECTED tracks — the same note ringing on an unselected
		// one belongs to another instrument and is none of this gesture's business. The rule
		// is applied per selected track, which collapses to the old behaviour when one is
		// selected: subtract it if sustain is merely holding it, else articulate over it.
		const step = this.stepOfIndex(i)
		let subtractedEverywhere = true
		for (const track of this.selected) {
			const key = noteKey(track, step)
			const parkedOnly = this.lastSounding.has(key) && !this.lastIntent.has(key)
			if (this.sustainOn(ctx) && parkedOnly) {
				this.sustained.delete(key)
				continue
			}
			subtractedEverywhere = false
			if (this.lastSounding.has(key)) this.retrigger.add(key)
		}
		if (!subtractedEverywhere) this.held.add(i)
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
			// before you can change the selection — one mode at a time.
			this.editingTrack = this.editingTrack === idx ? null : idx
			this.emitTracks(ctx)
			return
		}
		if (ctx.modifiers.shift2) {
			// Multi-select: add or drop this track. Something must always be selected, so a
			// toggle that would empty the set is simply ignored.
			if (this.selected.has(idx)) {
				if (this.selected.size === 1) return
				this.selected.delete(idx)
			} else this.selected.add(idx)
		} else {
			if (this.selected.size === 1 && this.selected.has(idx)) return
			this.selected = new Set([idx])
		}
		this.emitTracks(ctx)
		this.commit(ctx) // sounding notes keep their old track; the next note-on moves
	}

	/** An ARP key: pick that mode, or turn the arp off by pressing the mode already lit. */
	private arpKey(idx: number, ev: KeyEvent, ctx: PageContext) {
		if (!ev.s) return
		this.arp.toggle(ARP_BUTTONS[idx])
		this.arpNote = null
		this.arpAccMs = 0
		this.commit(ctx) // recompute the pool before taking the first step
		if (this.arp.isOn) this.arpStep(ctx)
		this.emitSettings(ctx) // the button and the setting are the same control
		this.syncTimer()
	}

	/**
	 * One arpeggiator step. Moves the cursor over the pool built by the last commit; when
	 * the same note comes round twice in a row (a one-note "chord", or urn drawing a repeat
	 * across bags) it needs an explicit re-articulation, which the retrigger set provides.
	 */
	private arpStep(ctx: PageContext) {
		if (!this.arp.isOn) return
		const next = this.arp.next(this.arpPool)
		if (next !== null && next === this.arpNote) {
			for (const track of this.selected) this.retrigger.add(noteKey(track, next))
		}
		this.arpNote = next
		this.commit(ctx)
	}

	/** Musical time when the transport is running — the arp follows the same lane setting. */
	onTick(tick: number, lane: number, ctx: PageContext) {
		if (!this.arp.isOn || lane !== this.lane) return
		if (this.arpDiv > 1 && tick % this.arpDiv !== 0) return
		this.arpStep(ctx)
	}

	/** Transport start/stop flips the arp between clock and free-run; reset the phase. */
	onClock(_state: Readonly<ClockState>, _ctx: PageContext) {
		this.arpAccMs = 0
		this.syncTimer()
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

		// A note is lit at EVERY cell that plays it — on an isomorphic layout that shows the
		// shape you're playing. Three tiers: the chord you are holding or sustaining, the
		// cells under a finger, and — while the arp runs — the note it is voicing right now
		// on top. The chord staying visible under the arp is what lets you see what a chord
		// preset would capture while it plays.
		const f = makeFrame(this.size)
		for (let y = 0; y < this.size.height; y++) {
			for (let x = 0; x < this.keysW; x++) {
				const i = ledIndex(this.size, x, y)
				const step = this.step(x, y)
				let lvl = this.baseLevel(step)
				if (this.litSteps.has(step)) lvl = LVL_UNISON
				if (this.held.has(i)) lvl = LVL_HELD
				if (this.arp.isOn && this.voicedSteps.has(step)) lvl = LVL_ARP_VOICE
				f[i] = lvl
			}
		}
		// Control keys down the right edge. Shifts are faint markers that light while held;
		// both halves of sustain light while they are holding notes.
		if (this.hasControls()) {
			const cx = this.size.width - 1
			const mark = (row: number, on: boolean) => {
				f[ledIndex(this.size, cx, row)] = on ? LVL_HELD : LVL_SHIFT
			}
			mark(SHIFT1_ROW, ctx.modifiers.shift1)
			mark(SHIFT2_ROW, ctx.modifiers.shift2)
			mark(SUSTAIN_PEDAL_ROW, this.sustainPedal)
			mark(SUSTAIN_TOGGLE_ROW, this.sustainToggle)
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
			const now = Date.now()
			for (let idx = 0; idx < TRACK_ROWS; idx++) {
				let lvl =
					this.editingTrack === idx ? (blinkOn ? LVL_TRACK_EDIT : LVL_TRACK_EDIT_LO)
					: this.selected.has(idx) ? LVL_TRACK_ON
					: rampLevel(LVL_TRACK_IDLE, idx)
				// Activity pulse: a brief lift on every note-on, so you can see which
				// instrument a loop or an arp is actually feeding.
				if (now - this.trackPulseAt[idx] < PULSE_MS) lvl = Math.min(15, lvl + PULSE_BUMP)
				f[ledIndex(this.size, tx, idx)] = lvl
			}
			// Arpeggiators sit under the tracks: only the running mode is lit.
			for (let idx = 0; idx < ARP_BUTTONS.length; idx++) {
				f[ledIndex(this.size, tx, ARP_ROW_START + idx)] =
					this.arp.mode === ARP_BUTTONS[idx] ? LVL_ARP_ON : rampLevel(LVL_ARP_IDLE, idx)
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
		// Leading-edge lockout: the first edge acts instantly, then ANY edge is swallowed
		// briefly. Chatter is ALTERNATING, so a same-state filter would not catch it — see
		// core/shiftInput.ts, which learned this the hard way.
		const t = Date.now()
		if (t - this.lastPedalEdgeAt < PEDAL_LOCKOUT_MS) return
		this.lastPedalEdgeAt = t

		if (!ev.s) {
			if (!this.sustainLatched) this.sustainPedal = false // plain momentary release
			this.commit(ctx)
			return
		}
		const now = Date.now()
		if (this.sustainLatched) {
			this.sustainLatched = false
			this.lastSustainTapAt = 0
			this.sustainPedal = false
			this.commit(ctx)
			return
		}
		// A deliberate double tap latches; anything faster than a human could manage is
		// bounce and only re-arms the window.
		const gap = now - this.lastSustainTapAt
		if (gap >= DOUBLE_TAP_MIN_MS && gap < DOUBLE_TAP_MS) this.sustainLatched = true
		this.lastSustainTapAt = now
		this.sustainPedal = true
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

	/**
	 * Sustain is a two-input OR: the latching toggle, or the momentary pedal. The pedal used
	 * to BE shift 2; it now has its own state so shift 2 can be a modifier (it selects
	 * multiple tracks). One consequence: `/grid/in/shift 2` no longer sustains.
	 */
	private sustainOn(_ctx: PageContext): boolean {
		return this.sustainToggle || this.sustainPedal
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
					tracks = s === 0 ? [...this.selected] : tracksForLooper(s - 1, this.routes, this.selected)
					started.set(step, tracks)
					// A source newly claiming a note that is ALREADY sounding has to
					// RE-ARTICULATE it. Without this, sustain turns a loop into a drone: the
					// pedal swallows the note-off, so when the loop comes round again the note
					// is still in lastSounding, the diff sees no change, and nothing fires.
					// Same reasoning as pressing a ringing key — a bare repeat is inaudible.
					for (const track of tracks) {
						const key = noteKey(track, step)
						if (this.lastSounding.has(key)) this.retrigger.add(key)
					}
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

		// 5. ARP — on the SELECTED tracks only, let through the one note the arpeggiator is
		//    currently pointing at. Everything on an unselected track passes by untouched,
		//    so a routed looper keeps its own rhythm while your hands get arpeggiated.
		let out = new Set(intent)
		for (const key of this.sustained) out.add(key)
		// Snapshot the chord for the display BEFORE the arp thins it to one note.
		this.litSteps = new Set([...out].map(stepOf))
		if (this.arp.isOn) {
			const pool = new Set<number>()
			for (const key of out) if (this.selected.has(trackOf(key))) pool.add(stepOf(key))
			this.arpPool = [...pool].sort((a, b) => a - b)
			const chosen = this.arpNote
			const kept = new Set<number>()
			for (const key of out) {
				if (!this.selected.has(trackOf(key)) || stepOf(key) === chosen) kept.add(key)
			}
			out = kept
		} else this.arpPool = []
		this.voicedSteps = new Set([...out].map(stepOf))

		// 6. RECONCILE against what Max was last told.
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

		// Starting a chord must not be silent while the arp waits for its next step — up to
		// a whole arpRate of dead air, which reads as a broken keyboard. So the first note
		// of a new pool fires immediately. arpStep() re-enters commit(), hence the guard.
		if (!this.inArpKick && this.arp.isOn && this.arpNote === null && this.arpPool.length) {
			this.inArpKick = true
			try {
				this.arpAccMs = 0
				this.arpStep(ctx)
			} finally {
				this.inArpKick = false
			}
		}
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
		const track = trackOf(key)
		if (on && track < this.trackPulseAt.length) this.trackPulseAt[track] = Date.now()
		ctx.osc.send(`/grid/out/page/${ctx.slotLabel}/note`, stepOf(key), on ? 1 : 0, track)
	}

	/** Drop everything the hands own. Recorders are deliberately untouched. */
	private releaseLive(ctx: PageContext) {
		this.held.clear()
		this.sustained.clear()
		this.presetHeld.clear()
		this.retrigger.clear()
		this.sustainToggle = false
		this.sustainPedal = false
		this.commit(ctx)
	}

	// --- the recorder timer ------------------------------------------------------
	//
	// Free time fits neither of the framework's clocks: render() only runs for the FOCUSED
	// page, and onTick is locked to the app transport (which boots stopped). So this page
	// owns one interval. It is cleared in dispose() but deliberately NOT in onBlur — a loop
	// has to keep playing when you switch slots, the same guarantee onTick sequencers get.

	private syncTimer() {
		// The interval also has to run for a free-running arp, not just for loopers.
		const needed =
			this.recorders.some((r) => r.isRunning) || (this.arp.isOn && !this.ctx?.clock.running)
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
		// Free-run the arp only while the transport is stopped; otherwise onTick owns it.
		if (this.arp.isOn && !ctx.clock.running) {
			this.arpAccMs += dt
			if (this.arpAccMs >= this.arpRate) {
				this.arpAccMs = 0
				this.arpStep(ctx)
			}
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
		return this.size.width - 1 >= this.keysW && this.size.height >= CONTROL_ROWS
	}
	/** Any control key in the last column, by its absolute row. */
	private isControl(x: number, y: number, row: number): boolean {
		return this.hasControls() && x === this.size.width - 1 && y === row
	}
	private isShift1 = (x: number, y: number) => this.isControl(x, y, SHIFT1_ROW)
	private isShift2 = (x: number, y: number) => this.isControl(x, y, SHIFT2_ROW)
	private isSustainPedal = (x: number, y: number) => this.isControl(x, y, SUSTAIN_PEDAL_ROW)
	private isSustainToggle = (x: number, y: number) => this.isControl(x, y, SUSTAIN_TOGGLE_ROW)
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
		return (
			this.size.width - TRACK_COL_FROM_RIGHT >= this.keysW &&
			this.size.height >= ARP_ROW_START + ARP_BUTTONS.length
		)
	}
	private trackIndexAt(x: number, y: number): number | null {
		if (!this.hasTracks() || x !== this.size.width - TRACK_COL_FROM_RIGHT) return null
		return y >= 0 && y < TRACK_ROWS ? y : null
	}

	private arpIndexAt(x: number, y: number): number | null {
		if (!this.hasTracks() || x !== this.size.width - TRACK_COL_FROM_RIGHT) return null
		const row = y - ARP_ROW_START
		return row >= 0 && row < ARP_BUTTONS.length && y < this.size.height ? row : null
	}

	/** Chords as a dense array (null = empty slot) — the shape Max and the web UI get. */
	private chordArray(): (number[] | null)[] {
		return Array.from({ length: this.size.height }, (_, slot) => this.chords.get(slot) ?? null)
	}

	private trackState() {
		return { selected: [...this.selected].sort((a, b) => a - b), routes: this.routes.map((set) => [...set].sort((a, b) => a - b)) }
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
		if (key === "arp") {
			if (!isArpMode(raw)) return false
			this.arp.set(raw)
			this.arpNote = null
			this.syncTimer()
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
		else if (key === "arpRate") this.arpRate = v
		else if (key === "arpDiv") this.arpDiv = v
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
			arp: this.arp.mode as ArpMode,
			arpRate: this.arpRate,
			arpDiv: this.arpDiv,
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
