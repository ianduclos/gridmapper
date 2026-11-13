/* Page: Iso Surface  (idk.surface fork of iso-hot, itself the hotelier fork of pages/isometric.ts)
 * ------------------------------------------------------------------------------
 * FORK   : a deliberate copy of isometric, free to diverge (iso-hot is the hotelier copy).
 *          The one difference so far: COLUMN 0 is the page selector (util/pageSelectorSurface.ts)
 *          and the keyboard moved one column right to 1-12, with the step field's
 *          origin (step 0, home) at column 1.
 *          TRANSPOSER: col 0 row 4 toggles the bottom row (cols 1-12) into a transposer —
 *          col 8 = 0, left = down, right = up (−7..+4 steps). Turning it off keeps the
 *          transposition. A note takes the transposition in force WHEN IT STARTS, so
 *          nothing already sounding moves. Keys always transpose; chord presets and looper
 *          playback do too unless `transposeChords` / `transposeLoops` are off. A chord
 *          remembers the transposition it was saved at and moves RELATIVE to it.
 *          LOOPS record transposer moves AND arp-button presses as parallel GESTURES (a
 *          control lane; the arp is stored as the mode it was set to) and store
 *          their notes UNtransposed; playback replays the moves into the live transposer
 *          and the transposer then shifts every loop, its own notes included — so a take
 *          sounds as played. Several loops may drive it; the latest move wins, and a
 *          press of yours holds until a loop's next move. Same rules for the arp mode.
 *          Loop playback is never recorded.
 *          Transposition is performance state: not saved, 0 on load.
 *          PERFORMANCE PANEL: col 0 row 3 opens a 4-column panel over keyboard cols 1-4
 *          (cols 5-12 stay playable; the panel and the transposer hide each other):
 *            col 1  row 0 TINT (tap = on/off, HOLD + press keys = edit the T-triad's
 *                   pitch classes) · rows 1-3 tint mode above/below/alternate ·
 *                   rows 4-6 TINT OCTAVE +1/0/−1 (moves only the T-voice)
 *            col 2  ARP SPEED ×4 ×3 ×2 ×1 ÷2 ÷3 ÷4 (rows 0-6)
 *            col 3  ARP PROBABILITY 100% … 12.5% (rows 0-7). A missed beat is a REST
 *                   that doesn't advance the arp: the due note plays on the next beat
 *            col 4  row 0 STRUM: note-ons starting together (a chord preset, a loop's
 *                   chord, a note and its T-voice) are staggered `strumMs` apart ·
 *                   rows 4-7 OCTAVE +2/+1/0/−1 (a coarse transposer in npo steps,
 *                   same rules as the transposer: a note keeps the octave it began in)
 *          T-voices are humanized: each starts 0..`tintJitterMs` late, at random.
 *          Every panel press is recorded into armed loops as a gesture, like the arp.
 *          TINTINNABULI: each live note (fingers + chord presets) gains a T-voice, the
 *          nearest step above/below it whose pitch class is in the triad. The grid only
 *          sends steps, so the triad survives temperament changes; it clears when `npo`
 *          changes. Loops record the T-voice as played. The whole panel (octave and tint
 *          on/off included) and the triad persist to the active preset, like the chords.
 *          Saved chords PERSIST (ctx.persist) on every save/clear.
 *          Everything else is isometric as of the fork.
 * Summary : Isomorphic keyboard on cols 1-12 — a pure integer "step field".
 *           Each key has a step index; we emit the NUMBER, Max owns step→pitch.
 * Input   : press a keyboard key → /grid/out/page/<slot>/note <step> <1|0> <track>.
 *           TAXONOMY — col 0 PAGE SELECTOR; cols 1-12 KEYBOARD; col 13 CHORDS (8 presets); col 14
 *           rows 0-3 TRACKS (outputs) + rows 4-7 ARPS; col 15 rows 0-3 LOOPERS,
 *           row 4 SUSTAIN TOGGLE, row 5 SUSTAIN PEDAL, row 6 SHIFT 2, row 7 SHIFT 1.
 * Display : out-of-scale 1, in-scale 3, root 8, in the CHORD 12, finger-down 15.
 *           While the ARP runs the whole ladder steps DOWN to make room for the voiced
 *           note — in-scale 2, root 5, chord 9, finger 12, voiced 15 — because a
 *           highlight at 15 over a chord at 12 is invisible at the top of varibright.
 *           Chords: empty 1, loaded 6, playing 15 (+2/+3 while armed to save).
 *           Loopers: empty 1, blinking while armed, 6 stopped, 15 looping.
 *           Tracks + arps: idle levels RAMP down each group (1,2,3,4) so a row of options
 *           is distinguishable at a glance; selected/on are much brighter. Every note-on
 *           pulses its track's LED briefly, so you can see which instrument is being fed.
 *           Shifts and both sustains light while they are holding.
 * Settings: npo · vertical · root · scale · layout · orientation · lane · quant1-4 ·
 *           strum · tint. Live, two-way over OSC.
 * Rules   : keyboard = columns KEYS_X0..(keysW-1); the control columns only exist when
 *           there's a dead zone. Releases everything on blur so a page switch never
 *           strands a note in Max; SAVED CHORDS survive (stored content, not state).
 * ------------------------------------------------------------------------------
 * Step field: one column right = +1 step; one row UP = +`vertical` steps. Bottom-left
 * is step 0. We send only the step integer + an on/off flag — no pitch, no velocity.
 * `npo` does NOT change the step we emit; it sets the octave size for root highlighting
 * and is shared with Max (in: /grid/in/page/<slot>/setting/npo <n>; out: /settings).
 *
 * FOUR TRACK LAYERS ON THE APP'S ARP (Ian, 2026-11-13; idk.surface
 * docs/specs/2026-11-13-iso-track-layers-design.md). This replaces the page's own sustain,
 * its own arpeggiator, multi-track selection and loop routes. Where a line above still
 * speaks of those, this section is the truth.
 *
 * TRACKS (column 14, rows 0-3) are LAYERS, one in FRONT at a time. Presses, chord presets,
 * the panel's octave and tint, the ARP and LATCH keys and the lane picker act on the front
 * track only. Its held and latched notes are bright; the other tracks' notes, and every
 * loop's playback, stay visible on a DIM plane.
 * Out: /grid/out/page/<slot>/tracks <json> — { selected: [front], front }.
 *
 * ARP AND LATCH ARE THE APP'S, one pair per key track (/surface/keys/<1-4>/arp, /latch over
 * ctx.surface; /surface/arp and /surface/arp/latch are track 1's older names). The page sends
 * plain presses and releases; the app decides what sounds. The four arp keys (column 14,
 * rows 4-7: up · down · up-down · urn) set the app's shared ORDER and switch the front
 * track's ARP on; the lit one switches it off. The panel's SPEED column is the app's RATE
 * (1/16 at the top to 1/1), its PROB column the app's PROB with PROB MODE set to WAIT.
 * LATCH (column 15 row 4) is the front track's LATCH, and lit by that key it arms the chord
 * presets for saving; the PEDAL (row 5) is a momentary LATCH (double-tap keeps it) that
 * does not. All of it is shown from the app's values, never from a flag kept here.
 * The app does not say what its LATCH holds, so the page keeps a PICTURE of it for the
 * lights and for saving chords: a note let go while its track's LATCH is lit stays shown
 * until that LATCH goes off.
 *
 * TRANSPOSER and STRUM are global; OCTAVE and TINT (on, mode, octave, triad) are per track.
 *
 * CHORDS (column 13, one slot per row) store PITCHES — a list of steps — so a later change
 * of root/scale/vertical/orientation doesn't move a saved chord. They play on the front
 * track and save what the front track is ringing; SHIFT 1 + press clears a slot.
 * Out: /grid/out/page/<slot>/chords <json> — a dense array, null = empty.
 *
 * LOOPERS (column 15, rows 0-3) are free-time pattern recorders — see util/patternRecorder.
 * One key cycles empty → recording → playing → stopped → playing, shift 1 + press clears,
 * and a take longer than a minute closes itself. The loop begins at the FIRST NOTE. A loop
 * has NO ROUTES: each press is recorded with the track that was in front when it was played
 * and replayed there, so one loop may span tracks. A loop's note goes out with a fourth
 * argument 1 (/note <step> <1|0> <track> 1) so the app's LOOPS THROUGH ARP can tell it from
 * a hand's. A loop an older file pinned to tracks is cleared on load, with a line in the log.
 * Out: /grid/out/page/<slot>/patterns <json>.
 *
 * THE NOTE PIPELINE. A note is (TRACK, STEP), reconciled against what the app was last told:
 *
 *   keys + chords + T-voices ──> LIVE ──> [record tap] ──┐
 *                                                        ├──> out ──> reconcile
 *   looper playback (each press on its own track) ───────┘
 *
 * A note's track and offset are stamped WHEN IT STARTS. A note stops when the LAST source
 * lets go; a source claiming a note that is already down sends an explicit off then on.
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

import { SURFACE_LINK_UP } from "../io/liveLink.js"
import {
	type Page,
	type PageContext,
	type KeyEvent,
	type LedFrame,
	type GridSize,
	float,
	makeFrame,
	ledIndex,
} from "../core/types.js"
import type { KeySpec, PageModule, SettingSpec } from "../core/pageModule.js"
import { selectorKey, drawSelector, SELECTOR_KEYS } from "../util/pageSelectorSurface.js"
import { clamp } from "../util/scale.js"
import { SCALE_SURFACE, PEER_OSC } from "../core/sharedStore.js"
import { PatternRecorder, MAX_RECORD_MS } from "../util/patternRecorder.js"
import { isRecord, num, bool, intSet, records } from "../util/restoreGuards.js"
import {
	SCALE_NAMES,
	DEFAULT_SCALE,
	isScaleName,
	isInScale,
	isRootOf,
	foldedStep,
	type ScaleName,
} from "../util/scales.js"

const KEYS_W = 13 // keyboard ends before column 13 (keysW is its exclusive right edge)
/** idk.surface's KEYS rows 1-4, one per track: the first has no number (generated addresses.txt). */
const LANES_ADDRS = ["/surface/route/keys/lanes", "/surface/route/keys2/lanes", "/surface/route/keys3/lanes", "/surface/route/keys4/lanes"]
const PICKER_LANES = 8
const PICKER_X0 = 5 // lanes 1-8 on x5-x12: the rest of the top row, right of the panel's four columns
const MENU_TAP_MS = 300 // x0 y6 let go sooner than this: a tap, which toggles the menu; longer: it was a hold
const PICKER_ASK_MS = 1000
const LVL_PICK_ON = 13
const LVL_PICK_SOME = 8 // only some of the selected tracks play the lane
const LVL_PICK_OFF = 3
/** A lanes string as surface spells it: digits 1-8, each once, in order. */
const cleanLanes = (s: string) => [...new Set(s.replace(/[^1-8]/g, ""))].sort().join("")
const KEYS_X0 = 1 // ... and starts at column 1: column 0 is the page selector

/** Transposer: col 0 row 4 shows it on the bottom row, whose col 8 is "no transpose". */
const TRANSPOSE_TOGGLE_ROW = 7 // col 0's bottom key. Iso keeps y6-y7 for its own two toggles
// (Ian, 2026-11-11): its shifts are the right column's only, the left column's are not drawn here.
const TRANSPOSE_ZERO_COL = 8
const TRANSPOSE_MIN = KEYS_X0 - TRANSPOSE_ZERO_COL // −7
const TRANSPOSE_MAX = KEYS_W - 1 - TRANSPOSE_ZERO_COL // +4
const LVL_TR_CURRENT = 15
const LVL_TR_ZERO = 6 // where "home" is, when you're elsewhere
const LVL_TR_OTHER = 2
const LVL_TR_TOGGLE_SHOWN = 12
const LVL_TR_TOGGLE_OFFSET = 6 // hidden, but a transposition is in force
const LVL_TR_TOGGLE_IDLE = 2

/**
 * Control-lane ids for gestures the loopers record alongside notes. The per-track ones are
 * stored as `<id>/<track 0-3>`; a bare id (an older take) reads as track 0.
 */
const CTL_TRANSPOSE = "transpose"
const CTL_ARP = "arp" // per track; value 0 = off, 1-4 = that ARP_ORDERS entry, on
const CTL_OCTAVE = "oct" // per track
const CTL_ARP_SPEED = "arpSpeed" // value = index into ARP_RATES
const CTL_ARP_PROB = "arpProb" // value = panel row, 0 = 100%
const CTL_STRUM = "strum"
const CTL_TINT = "tint" // per track
const CTL_TINT_MODE = "tintMode" // per track; value = index into TINT_MODES
const CTL_TINT_OCTAVE = "tintOct" // per track
/** Control-lane value bounds, for reading a take back from an untrusted file. */
const CTL_BOUNDS: Record<string, [number, number]> = {
	[CTL_ARP]: [0, 4],
	[CTL_OCTAVE]: [-1, 2],
	[CTL_ARP_SPEED]: [0, 6],
	[CTL_ARP_PROB]: [0, 7],
	[CTL_STRUM]: [0, 1],
	[CTL_TINT]: [0, 1],
	[CTL_TINT_MODE]: [0, 2],
	[CTL_TINT_OCTAVE]: [-1, 1],
}
const PER_TRACK_CTL = new Set([CTL_ARP, CTL_OCTAVE, CTL_TINT, CTL_TINT_MODE, CTL_TINT_OCTAVE])
const ctlId = (base: string, track: number) => `${base}/${track}`
/** A recorded control id back into its base and track (0 when it carries none, or a bad one). */
const parseCtl = (id: string): { base: string; track: number } => {
	const [base, t] = id.split("/")
	const track = Number(t)
	return { base, track: Number.isInteger(track) && track >= 0 && track < 4 ? track : 0 }
}

/** Performance panel: col 0 row 3 shows it over keyboard cols 1-4. */
const PANEL_TOGGLE_ROW = 6
const PANEL_X0 = KEYS_X0
const PANEL_W = 4
const PANEL_TINT_COL = PANEL_X0 // row 0 tint, rows 1-3 tint mode, rows 4-7 octave
const PANEL_SPEED_COL = PANEL_X0 + 1
const PANEL_PROB_COL = PANEL_X0 + 2
const PANEL_STRUM_COL = PANEL_X0 + 3 // row 0 strum, rows 4-7 octave
const OCTAVE_ROW_TOP = 4 // +2 at row 4 … −1 at row 7, in the strum column
const TINT_OCT_ROW_TOP = 4 // tint octave +1 at row 4 … −1 at row 6, in the tint column
const OCTAVE_MAX = 2
const OCTAVE_MIN = -1
/**
 * THE APP'S ARP (Ian, 2026-11-13). The iso runs no arpeggiator and no sustain of its own: it
 * sends plain presses, and idk.surface's ARP and LATCH, one pair per key track, do the rest.
 * ORDER, RATE and PROB are the app's one shared set. Everything here is the app's value, read
 * over ctx.surface and shown; a key press writes it.
 */
/** The four arp keys, top to bottom, as the app's ORDER. */
export const ARP_ORDERS = ["up", "down", "up-down", "urn"] as const
/** The panel's SPEED column, top (fastest) to bottom, as the app's RATE. */
export const ARP_RATES = ["1/16", "1/16T", "1/8", "1/8T", "1/4", "1/2", "1/1"] as const
const ARP_ADDR = (t: number) => `/surface/keys/${t + 1}/arp`
const LATCH_ADDR = (t: number) => `/surface/keys/${t + 1}/latch`
const ORDER_ADDR = "/surface/arp/order"
const RATE_ADDR = "/surface/arp/rate"
const PROB_ADDR = "/surface/arp/prob"
const PROB_MODE_ADDR = "/surface/arp/prob-mode"
const APP_POLL_MS = 2000
const APP_SUBSCRIBE_MS = 3000
/** After writing a value, what the app says of it is ignored this long: an answer to a read
 *  sent just before the write would otherwise undo it for a moment (and drop a pedal's LATCH). */
const WRITE_QUIET_MS = 400
const PROB_ROWS = 8 // row r = (8 − r)/8
export const TINT_MODES = ["above", "below", "alternate"] as const
export type TintMode = (typeof TINT_MODES)[number]
const LVL_PANEL_CURRENT = 15
const LVL_PANEL_DEFAULT = 8 // where "home" is, when you're elsewhere
// Well above the right column's idle shift/sustain markers (1), so the open panel never
// reads as a row of dead control keys.
const LVL_PANEL_OTHER = 4
const LVL_TINT_EDIT = 12 // a triad pitch class, while editing
const PERSIST_DEBOUNCE_MS = 400
/** A peer that sent heartbeats and has been silent this long is gone. */
const PEER_GONE_MS = 5000
/** Settings that belong to the panel, and so are written through when changed over OSC. */
const PANEL_SETTINGS = new Set(["strum", "strumMs", "strumDir", "tintMode", "tintOctave", "tintJitterMs"])
const BASE_STEP = 0 // bottom-left cell = step 0

// Four tiers that have to be told apart AT A GLANCE on a varibright grid, so they are
// spread out: unison used to sit at 9 against roots at 8, which is a difference you
// cannot actually see — the twins were lit the whole time and read as ordinary roots.
const LVL_OUT = 1 // out of scale — still playable, just recessive
const LVL_NORMAL = 3 // in scale
const LVL_ROOT = 8 // octave / scale root
const LVL_UNISON = 12 // the note is SOUNDING — lit at every cell that plays it
const LVL_HELD = 15 // this exact cell is under a finger

// THE DIM PLANE: notes of the tracks that are not in front, and every loop's playback, stay
// visible under the front track's own. Just above the scale map, and lifted on a root cell so
// it still reads there. (How dim is Ian's to judge on the grid.)
const LVL_LAYER_DIM = 6
const LVL_LAYER_DIM_ROOT = 10
const LVL_SHIFT = 1 // control keys are faint markers
const LVL_SHIFT_IDLE = 6 // ... except the two shifts, which stand apart from the column
const LVL_TINT_LO = 4 // the dim half of a T-voice's shimmer

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

/* Bounds used only when reading an untrusted preset back (restore()). A chord holds
 * pitches Max maps as it likes, so the range is generous rather than musical; the caps
 * exist so a corrupt or hostile file can't turn into an unbounded allocation. */
const CHORD_PITCH_LIMIT = 4096
const CHORD_MAX_NOTES = 64
const MAX_PATTERN_EVENTS = 20_000
const ARP_ROW_START = TRACK_ROWS

/**
 * Idle levels RAMP across each group of options (1,2,3,4) instead of all sitting at one
 * value. A row of four identical dim buttons tells you nothing; a faint gradient tells you
 * which one your finger is on without counting rows.
 */
const rampLevel = (base: number, idx: number) => base + idx

const LVL_TRACK_IDLE = 1 // + idx
const LVL_ARP_IDLE = 1 // + idx
const LVL_ARP_ON = 14 // the front track's ARP is on, in this order
const LVL_ARP_ORDER = 7 // the app's order, while the front track's ARP is off
const ARP_KEYS = ARP_ORDERS.length

/** A note-on gives its track a brief brightness bump — a glance-level activity light. */
const PULSE_MS = 90
const PULSE_BUMP = 4
const LVL_TRACK_ON = 11 // the track in front

/**
 * Notes are identified by (track, step), so they pack into one number for cheap Set diffs.
 * Steps are bounded far inside the stride: 12 columns + 7 rows of a 24-semitone `vertical`
 * tops out around 180, and the bias leaves room below zero (a low key transposed down).
 */
const NOTE_STRIDE = 4096
const NOTE_BIAS = 1024
const noteKey = (track: number, step: number) => track * NOTE_STRIDE + step + NOTE_BIAS
const trackOf = (key: number) => Math.floor(key / NOTE_STRIDE)
const stepOf = (key: number) => (key % NOTE_STRIDE) - NOTE_BIAS

/**
 * A LOOP stores each press as one number: the untransposed step plus the track that was in
 * front when it was played. A take from before the tracks were layers has bare steps, which
 * read as track 0.
 */
const REC_STRIDE = 100_000
export const recKey = (track: number, raw: number) => track * REC_STRIDE + raw
export const recTrack = (v: number) => clamp(Math.floor((v + REC_STRIDE / 2) / REC_STRIDE), 0, 3)
export const recRaw = (v: number) => v - Math.floor((v + REC_STRIDE / 2) / REC_STRIDE) * REC_STRIDE

/** Two chords are the same if they hold the same pitches. Both sides arrive sorted. */
const sameChord = (a: readonly number[] | undefined, b: readonly number[]): boolean =>
	!!a && a.length === b.length && a.every((v, i) => v === b[i])

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
	{ key: "strum", label: "strum", type: "toggle", default: false },
	{ key: "strumMs", label: "strum spacing (ms)", type: "number", min: 2, max: 200, step: 1, default: 25 },
	{ key: "strumDir", label: "strum direction", type: "enum", options: ["up", "down"], default: "up" },
	{ key: "tintMode", label: "tintinnabuli mode", type: "enum", options: [...TINT_MODES], default: "above" },
	{ key: "tintOctave", label: "tintinnabuli octave", type: "number", min: -1, max: 1, step: 1, default: 0 },
	{ key: "tintJitterMs", label: "tint humanize (max ms late)", type: "number", min: 0, max: 500, step: 1, default: 20 },
	{ key: "transposeChords", label: "transpose chord presets", type: "toggle", default: true },
	{ key: "transposeLoops", label: "transpose loop playback", type: "toggle", default: true },
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

export class IsoSurfacePage implements Page {
	private size: GridSize = { width: 16, height: 8 }
	private keysW = KEYS_W
	// Three independent sources can make a note sound, so notes are tracked by STEP and
	// reconciled — a step goes on when the first source claims it and off when the last
	// one lets go. That is what stops two unison twins from double-triggering Max, and
	// what lets "turn that note off" mean the note rather than one cell.
	// ledIndex of cells physically under a finger → the packed (track, step) it STARTED as, so
	// neither the transposer nor a change of front track ever moves a held note.
	private held = new Map<number, number>()
	private presetHeld = new Map<number, number[]>() // preset slot → its packed keys, while held
	// All of these hold PACKED (track, step) keys — see noteKey().
	private lastSounding = new Set<number>() // what the app currently believes is down
	private retrigger = new Set<number>() // notes to articulate again this commit
	private lastLive = new Set<number>() // hands + chords + T-voices: the stream loopers tap
	/** Notes last sent as a loop's (the note message's fourth argument), so their off says so too. */
	private sentAsLoop = new Set<number>()

	/**
	 * THE FRONT TRACK. Each of the four tracks is a layer and one is in front: presses, chord
	 * presets, the panel's octave and tint, the ARP and LATCH keys and the lane picker all act
	 * on it and on nothing else. The other tracks' notes stay on the dim plane.
	 */
	private front = 0

	/**
	 * What the app says, per key track (index 0-3) and for its shared arp settings. `undefined`
	 * = not heard yet. Written at once on a press of ours, so the light is ahead of the reply.
	 */
	private appArp: Array<boolean | undefined> = new Array(TRACK_ROWS).fill(undefined)
	private appLatch: Array<boolean | undefined> = new Array(TRACK_ROWS).fill(undefined)
	private appOrder: string | undefined
	private appRate: string | undefined
	private appProb: number | undefined
	private appPolledAt = 0
	/** Address → when this page last wrote it (see WRITE_QUIET_MS). */
	private wroteAt = new Map<string, number>()
	private appSubscribedAt = 0
	/**
	 * A PICTURE of what the app's LATCH holds, since the app does not report it: a note let go
	 * while its track's LATCH was lit stays shown until that LATCH goes off. Hands' notes and
	 * loops' notes apart, because a loop's stay on the dim plane. It is this page's guess at
	 * the app's rule, used for the lights and for saving a chord, never for sound.
	 */
	private latchHand = new Set<number>()
	private latchLoop = new Set<number>()
	/** Tracks whose LATCH the PEDAL lit: that one does not arm the chord presets for saving. */
	private pedalMade = new Set<number>()
	/** The track the pedal is holding LATCH on right now, or null. */
	private pedalTrack: number | null = null
	/**
	 * REMOTE notes: keys played in idk.surface itself (its computer keys), sent here only to
	 * be LIT (/grid/in/page/<slot>/remote <step> <1|0> <track 0-3>). Keyed (track, step). They
	 * are display and nothing else: never sent back as a note (surface would play it twice),
	 * never recorded by a looper, never held by sustain, never part of a saved chord. A
	 * remote note looks exactly like a note you played here, twins included; a finger on the
	 * same cell still reads brighter.
	 */
	private remote = new Set<number>()
	/** When the peer's last heartbeat came (0 = it does not send them). */
	private peerBeatAt = 0
	private unpeer: (() => void) | null = null
	/**
	 * ONE MENU (Ian, 2026-11-13: "it should be part of the same thing. long press temporary,
	 * short press toggles"). x0 y6 opens the PANEL on x1-x4 and, with it, THE LANE PICKER on the
	 * rest of the top row (x5-x12): idk.surface's lanes 1-8 for the track in front. They are
	 * one overlay with one state (`panelShown`); there is no picker without the panel. The key
	 * opens it at once on the press; let go within MENU_TAP_MS it stays (or, if it was open
	 * already, shuts); held longer, or used while held from shut, it shuts on release.
	 * The lanes are surface's KEYS rows (/surface/route/keys<n>/lanes, a string of digits):
	 * read over ctx.surface while the menu is open, written on a press, never stored here. A
	 * track not heard yet is left out; with none heard the eight are dark and take no press.
	 */
	private trackLanes: Array<string | undefined> = new Array(TRACK_ROWS).fill(undefined)
	private lanesAskedAt = 0
	private menuHeld = false
	private menuHeldAt = 0
	private menuWasOpen = false
	private menuUsed = false
	private pickerDown = new Set<number>()
	private unsurface: (() => void) | null = null
	/** When each track last received a note-on, for the activity pulse in render(). */
	private trackPulseAt = new Array<number>(TRACK_ROWS).fill(0)

	/** Four free-time loopers. They keep running when the page loses focus. */
	private recorders = Array.from({ length: RECORDER_ROWS }, () => new PatternRecorder())
	private timer: ReturnType<typeof setInterval> | null = null
	private lastTickMs = 0
	/** The slot's context is created once and reused, so the timer can hold it. */
	private ctx: PageContext | null = null

	/** Chord presets: slot (row) → the steps saved there. Survives focus changes. */
	private chords = new Map<number, number[]>()
	/** slot → the transposition in force when that chord was saved. */
	private chordT = new Map<number, number>()

	/** Current transposition in steps, and whether the bottom row is showing it. */
	private transpose = 0
	private transposerShown = false
	private transposeChords = SPEC_BY_KEY.get("transposeChords")!.default as boolean
	private transposeLoops = SPEC_BY_KEY.get("transposeLoops")!.default as boolean
	/** Live sounding key → the offset (transposer + its track's octave) in force when it started. */
	private liveT = new Map<number, number>()
	/** Per looper: recorded number → the packed key it went out as, stamped at note start. */
	private loopShift: Array<Map<number, number>> = Array.from({ length: RECORDER_ROWS }, () => new Map())
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
	/** Per-recorder loop quantum, in lane ticks. 0 = off (the default). */
	private quant = new Array<number>(RECORDER_ROWS).fill(0)

	// Performance panel (col 0 row 6). All of it persists to the active preset.
	private panelShown = false
	/** Octave and tint are PER TRACK (index 0-3); the panel shows and sets the front track's. */
	private octave = new Array<number>(TRACK_ROWS).fill(0)
	private strum = SPEC_BY_KEY.get("strum")!.default as boolean
	private strumMs = SPEC_BY_KEY.get("strumMs")!.default as number
	private strumDir = SPEC_BY_KEY.get("strumDir")!.default as "up" | "down"
	/** Strummed note-ons not sent yet: packed key → its timer. Max hasn't heard of them. */
	private pendingOn = new Map<number, ReturnType<typeof setTimeout>>()
	private tintOn = new Array<boolean>(TRACK_ROWS).fill(false)
	private tintMode = new Array<TintMode>(TRACK_ROWS).fill(SPEC_BY_KEY.get("tintMode")!.default as TintMode)
	private tintOctave = new Array<number>(TRACK_ROWS).fill(SPEC_BY_KEY.get("tintOctave")!.default as number)
	private tintJitterMs = SPEC_BY_KEY.get("tintJitterMs")!.default as number
	/** Each track's T-triad, as pitch classes (step mod npo). Persisted. */
	private tintPcs: Array<Set<number>> = Array.from({ length: TRACK_ROWS }, () => new Set<number>())
	/** Live M-key → the T-key it was given when it started (same track), so a held note's T-voice never flips. */
	private tintOf = new Map<number, number>()
	private tintAltBelow = new Array<boolean>(TRACK_ROWS).fill(false) // alternate mode: the next new note goes below
	private tintKeyDown = false // the tint key is held: keyboard presses edit the triad
	private persistTimer: ReturnType<typeof setTimeout> | null = null
	private tintEdited = false // ... and did, so its release doesn't also toggle tint

	/** Injectable so probability tests are deterministic. Returns [0, 1). */
	constructor(private rng: () => number = Math.random) {}

	// The pedal's latch: two quick taps hold it down until the next tap.
	private lastSustainTapAt = 0
	private sustainLatched = false

	init(ctx: PageContext) {
		this.ctx = ctx
		this.size = ctx.size
		this.keysW = Math.min(KEYS_W, this.size.width)
		this.releaseLive(ctx)
		this.latchHand.clear()
		this.latchLoop.clear()
		for (const r of this.recorders) r.clear()
		this.syncTimer()
		// A ping means surface has just (re)connected: whatever it had lit before is void.
		// If it also sends heartbeats, their stopping clears the lights too (see render).
		this.unpeer?.()
		this.unpeer =
			ctx.shared?.subscribe(PEER_OSC, (v) => {
				const kind = isRecord(v) ? v.kind : undefined
				if (kind === "ping") this.remote.clear()
				else if (kind === "heartbeat") this.peerBeatAt = Date.now()
				ctx.setDirty()
			}) ?? null
		this.unsurface?.()
		this.unsurface =
			ctx.surface?.on((path, args) => this.hear(path, args, ctx)) ?? null
		this.readApp(ctx)
		this.announce(ctx)
	}

	onFocus(ctx: PageContext) {
		this.appPolledAt = this.appSubscribedAt = 0 // ask the app at once
		this.announce(ctx)
	}

	/** What idk.surface says: the KEYS rows' lanes, each key track's ARP and LATCH, the shared arp settings. */
	private hear(path: string, args: any[], ctx: PageContext) {
		if (path === SURFACE_LINK_UP) {
			// The app is (back) there, holding nothing of ours: the latch picture is void, and
			// everything shown from the app is read again.
			this.latchHand.clear()
			this.latchLoop.clear()
			for (const a of LANES_ADDRS) ctx.surface?.send("/surface/get", a)
			this.readApp(ctx)
			this.appSubscribedAt = 0
			ctx.setDirty()
			return
		}
		const v = args[0]
		// Track 1's ARP and LATCH also come under their older names.
		const addr = path === "/surface/arp" ? ARP_ADDR(0) : path === "/surface/arp/latch" ? LATCH_ADDR(0) : path
		if (Date.now() - (this.wroteAt.get(addr) ?? 0) < WRITE_QUIET_MS) return
		const lanes = LANES_ADDRS.indexOf(path)
		if (lanes >= 0) {
			if (typeof v !== "string" && typeof v !== "number") return
			this.trackLanes[lanes] = cleanLanes(String(v))
		} else if (path === ORDER_ADDR) { if (typeof v === "string") this.appOrder = v }
		else if (path === RATE_ADDR) { if (typeof v === "string") this.appRate = v }
		else if (path === PROB_ADDR) { if (Number.isFinite(Number(v))) this.appProb = Number(v) }
		else {
			const m = /^\/surface\/keys\/([1-4])\/(arp|latch)$/.exec(addr)
			if (!m || !Number.isFinite(Number(v))) return
			const t = Number(m[1]) - 1
			const on = Number(v) !== 0
			if (m[2] === "arp") this.appArp[t] = on
			else this.heardLatch(t, on)
		}
		ctx.setDirty()
	}

	/** Ask the app for everything this page shows of it. */
	private readApp(ctx: PageContext) {
		const link = ctx.surface
		if (!link) return
		this.appPolledAt = Date.now()
		for (let t = 0; t < TRACK_ROWS; t++) {
			link.send("/surface/get", ARP_ADDR(t))
			link.send("/surface/get", LATCH_ADDR(t))
		}
		for (const a of [ORDER_ADDR, RATE_ADDR, PROB_ADDR]) link.send("/surface/get", a)
	}

	/** While the page is in front (render runs): keep the app's values coming. */
	private pollApp(ctx: PageContext, nowMs: number) {
		const link = ctx.surface
		if (!link) return
		if (nowMs - this.appSubscribedAt >= APP_SUBSCRIBE_MS) {
			this.appSubscribedAt = nowMs
			link.send("/surface/subscribe", "127.0.0.1", link.port, "values")
		}
		if (nowMs - this.appPolledAt >= APP_POLL_MS) this.readApp(ctx)
	}

	/** A track's LATCH as the app has it now. Off lets go of everything it held, there and in our picture. */
	private heardLatch(t: number, on: boolean) {
		this.appLatch[t] = on
		if (on) return
		this.pedalMade.delete(t)
		if (this.pedalTrack === t) {
			this.pedalTrack = null
			this.sustainLatched = false
		}
		for (const set of [this.latchHand, this.latchLoop]) for (const key of set) if (trackOf(key) === t) set.delete(key)
	}

	/** Write one of the app's values, and stop listening to it for a moment (WRITE_QUIET_MS). */
	private write(ctx: PageContext, addr: string, v: number | string | ReturnType<typeof float>) {
		this.wroteAt.set(addr, Date.now())
		ctx.surface?.send(addr, v)
	}

	/** Switch a track's LATCH in the app. */
	private setLatch(t: number, on: boolean, ctx: PageContext) {
		this.write(ctx, LATCH_ADDR(t), on ? 1 : 0)
		this.heardLatch(t, on)
		ctx.setDirty()
	}

	/**
	 * A track's ARP in the app: `mode` 0 is off, 1-4 switches it on in that ARP_ORDERS entry
	 * (the order is the app's one shared setting, so it moves for every track). PROB MODE is
	 * set to WAIT with it: a missed step waits for the due note, as the iso's own arp did.
	 */
	private setArp(t: number, mode: number, ctx: PageContext, byHand: boolean) {
		const m = clamp(Math.round(mode), 0, ARP_KEYS)
		if (byHand) this.recordGesture(ctlId(CTL_ARP, t), m)
		if (m > 0) {
			this.appOrder = ARP_ORDERS[m - 1]
			this.write(ctx, ORDER_ADDR, this.appOrder)
			ctx.surface?.send(PROB_MODE_ADDR, "wait")
		}
		this.appArp[t] = m > 0
		this.write(ctx, ARP_ADDR(t), m > 0 ? 1 : 0)
		ctx.setDirty()
	}

	onBlur(ctx: PageContext) {
		// Notes keep sounding across a page switch (Ian, 2026-09-22): a held key's release is
		// routed back here by PageManager, so nothing is stranded, and a latched sustain stays
		// latched until you come back and let it go. Loops keep running too, like an onTick
		// sequencer (docs/PAGE_PROTOCOL.md §6).
		this.lastSustainTapAt = 0
		// Drop our shifts so they don't linger after we leave the page.
		ctx.setShift(1, false)
		ctx.setShift(2, false)
	}

	onKey(ev: KeyEvent, ctx: PageContext) {
		if (selectorKey(ev, ctx)) return
		if (ev.x === 0) {
			if (ev.y === TRANSPOSE_TOGGLE_ROW && ev.s) {
				this.transposerShown = !this.transposerShown
				if (this.transposerShown) this.panelShown = false
				ctx.setDirty()
			} else if (ev.y === PANEL_TOGGLE_ROW) {
				// One menu: the panel and the lane picker together (see trackLanes).
				if (!this.hasPanel()) return
				if (ev.s) {
					this.menuHeld = true
					this.menuHeldAt = Date.now()
					this.menuWasOpen = this.panelShown
					this.menuUsed = false
					this.panelShown = true
					this.transposerShown = false
					this.lanesAskedAt = 0
					this.askLanes(ctx, Date.now())
				} else if (this.menuHeld) {
					this.menuHeld = false
					const tap = Date.now() - this.menuHeldAt < MENU_TAP_MS
					// A tap from shut leaves it open. Anything else shuts it: a tap when it was
					// open, a hold, or a quick press that was used as a shift.
					if (!(tap && !this.menuWasOpen && !this.menuUsed)) {
						this.panelShown = false
						this.tintKeyDown = false
					}
				}
				ctx.setDirty()
			}
			return
		}
		if (this.pickerKey(ev, ctx)) return
		if (this.panelShown && ev.x >= PANEL_X0 && ev.x < PANEL_X0 + PANEL_W) {
			const i = ledIndex(this.size, ev.x, ev.y)
			if (!ev.s && this.held.has(i)) this.releaseKey(i, ctx) // held from before the panel
			else {
				if (ev.s) this.menuUsed = true
				this.panelKey(ev, ctx)
			}
			return
		}
		if (this.transposerShown && ev.y === this.size.height - 1 && ev.x >= KEYS_X0 && ev.x < this.keysW) {
			const i = ledIndex(this.size, ev.x, ev.y)
			if (ev.s) this.setTranspose(ev.x - TRANSPOSE_ZERO_COL, ctx, true)
			else if (this.held.has(i)) this.releaseKey(i, ctx) // held from before the toggle
			return
		}
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

		if (ev.x < KEYS_X0 || ev.x >= this.keysW || ev.y < 0 || ev.y >= this.size.height) return
		const i = ledIndex(this.size, ev.x, ev.y)
		if (this.tintKeyDown && this.panelShown) {
			// Editing the triad: a press toggles that key's pitch class and plays nothing.
			if (ev.s) this.toggleTintPc(this.stepOfIndex(i) + this.offset(), ctx)
			else if (this.held.has(i)) this.releaseKey(i, ctx)
			return
		}
		if (ev.s) this.pressKey(i, ctx)
		else this.releaseKey(i, ctx)
	}

	/** The lane picker's row: true when the key was the picker's (see trackLanes). */
	private pickerKey(ev: KeyEvent, ctx: PageContext): boolean {
		if (ev.y !== 0 || ev.x < PICKER_X0 || ev.x >= PICKER_X0 + PICKER_LANES || ev.x >= this.keysW) return false
		const i = ledIndex(this.size, ev.x, ev.y)
		if (!ev.s) return this.pickerDown.delete(i) // a note held from before still lets go
		if (!this.panelShown || !this.hasPanel()) return false
		this.pickerDown.add(i) // the menu's: no note
		this.menuUsed = true
		const heard = [this.front].filter((t) => this.trackLanes[t] !== undefined)
		if (heard.length === 0) return true // not heard yet: never guess what a toggle means
		const digit = String(ev.x - PICKER_X0 + 1)
		const drop = heard.every((t) => this.trackLanes[t]!.includes(digit))
		for (const t of heard) {
			const now = this.trackLanes[t]!
			const next = cleanLanes(drop ? now.replace(digit, "") : now + digit)
			if (next === now) continue
			this.trackLanes[t] = next
			ctx.surface?.send(LANES_ADDRS[t], next)
		}
		ctx.setDirty()
		return true
	}

	/** Ask surface which lanes the selected tracks play, now and about once a second while shift 2 is held. */
	private askLanes(ctx: PageContext, nowMs: number) {
		if (nowMs - this.lanesAskedAt < PICKER_ASK_MS) return
		this.lanesAskedAt = nowMs
		ctx.surface?.send("/surface/get", LANES_ADDRS[this.front])
	}

	/** Transposer (global) plus the track's octave: the offset a note takes when it starts. */
	private offset(track = this.front): number {
		return this.transpose + this.octave[track] * this.npo
	}

	/** Pitch class of a step in the current octave size. */
	private pc(step: number): number {
		return ((step % this.npo) + this.npo) % this.npo
	}

	// --- the performance panel ------------------------------------------------------

	private hasPanel(): boolean {
		return this.keysW >= PANEL_X0 + PANEL_W + 1 && this.size.height >= PROB_ROWS
	}

	private panelKey(ev: KeyEvent, ctx: PageContext) {
		const { x, y } = ev
		if (x === PANEL_TINT_COL && y === 0) {
			// Tap toggles tint; hold + keys edits the triad (and then the release doesn't toggle).
			if (ev.s) {
				this.tintKeyDown = true
				this.tintEdited = false
			} else if (this.tintKeyDown) {
				this.tintKeyDown = false
				if (!this.tintEdited) this.setTint(!this.tintOn[this.front], ctx, true)
			}
			ctx.setDirty()
			return
		}
		if (!ev.s) return
		if (x === PANEL_TINT_COL && y >= 1 && y <= TINT_MODES.length) {
			this.setTintMode(y - 1, ctx, true)
		} else if (x === PANEL_TINT_COL && y >= TINT_OCT_ROW_TOP && y < TINT_OCT_ROW_TOP + 3) {
			this.setTintOctave(1 - (y - TINT_OCT_ROW_TOP), ctx, true)
		} else if (x === PANEL_STRUM_COL && y >= OCTAVE_ROW_TOP && y < OCTAVE_ROW_TOP + 4) {
			this.setOctave(OCTAVE_MAX - (y - OCTAVE_ROW_TOP), ctx, true)
		} else if (x === PANEL_SPEED_COL && y < ARP_RATES.length) {
			this.setArpSpeed(y, ctx, true)
		} else if (x === PANEL_PROB_COL && y < PROB_ROWS) {
			this.setArpProbRow(y, ctx, true)
		} else if (x === PANEL_STRUM_COL && y === 0) {
			this.setStrum(!this.strum, ctx, true)
		}
	}

	/** Armed loopers take a hand-made panel move as a gesture. Replays are never recorded. */
	private recordGesture(id: string, value: number) {
		const nowMs = Date.now()
		for (const r of this.recorders) r.recordControl(id, value, nowMs)
		this.syncTimer()
	}

	private setOctave(o: number, ctx: PageContext, byHand: boolean, track = this.front) {
		const next = clamp(Math.round(o), OCTAVE_MIN, OCTAVE_MAX)
		if (byHand) this.recordGesture(ctlId(CTL_OCTAVE, track), next)
		if (next === this.octave[track]) return
		this.octave[track] = next
		ctx.osc.send(`/grid/out/page/${ctx.slotLabel}/octave`, next, track)
		ctx.setDirty()
		this.schedulePersist(ctx)
	}

	/** The app's RATE, by the panel's row (0 = fastest). */
	private setArpSpeed(idx: number, ctx: PageContext, byHand: boolean) {
		const next = clamp(Math.round(idx), 0, ARP_RATES.length - 1)
		if (byHand) this.recordGesture(CTL_ARP_SPEED, next)
		this.appRate = ARP_RATES[next]
		this.write(ctx, RATE_ADDR, this.appRate)
		ctx.setDirty()
	}

	/** The app's PROB, by the panel's row (0 = 100 %), with PROB MODE on WAIT. */
	private setArpProbRow(row: number, ctx: PageContext, byHand: boolean) {
		const r = clamp(Math.round(row), 0, PROB_ROWS - 1)
		if (byHand) this.recordGesture(CTL_ARP_PROB, r)
		this.appProb = (PROB_ROWS - r) / PROB_ROWS
		this.write(ctx, PROB_ADDR, float(this.appProb))
		ctx.surface?.send(PROB_MODE_ADDR, "wait")
		ctx.setDirty()
	}

	private setStrum(on: boolean, ctx: PageContext, byHand: boolean) {
		if (byHand) this.recordGesture(CTL_STRUM, on ? 1 : 0)
		if (on === this.strum) return
		this.strum = on
		this.emitSettings(ctx)
		ctx.setDirty()
		this.schedulePersist(ctx)
	}

	private setTint(on: boolean, ctx: PageContext, byHand: boolean, track = this.front) {
		if (byHand) this.recordGesture(ctlId(CTL_TINT, track), on ? 1 : 0)
		if (on === this.tintOn[track]) return
		this.tintOn[track] = on
		ctx.osc.send(`/grid/out/page/${ctx.slotLabel}/tint`, on ? 1 : 0, track)
		this.commit(ctx) // T-voices appear or go now, under the held notes
		this.schedulePersist(ctx)
	}

	private setTintMode(idx: number, ctx: PageContext, byHand: boolean, track = this.front) {
		const next = TINT_MODES[clamp(Math.round(idx), 0, TINT_MODES.length - 1)]
		if (byHand) this.recordGesture(ctlId(CTL_TINT_MODE, track), TINT_MODES.indexOf(next))
		if (next === this.tintMode[track]) return
		this.tintMode[track] = next
		this.emitSettings(ctx)
		ctx.setDirty() // sounding T-voices keep theirs; the next note takes the new mode
		this.schedulePersist(ctx)
	}

	private setTintOctave(o: number, ctx: PageContext, byHand: boolean, track = this.front) {
		const next = clamp(Math.round(o), -1, 1)
		if (byHand) this.recordGesture(ctlId(CTL_TINT_OCTAVE, track), next)
		if (next === this.tintOctave[track]) return
		this.tintOctave[track] = next
		this.emitSettings(ctx)
		ctx.setDirty() // like the mode: sounding T-voices keep theirs
		this.schedulePersist(ctx)
	}

	/**
	 * Panel state is written through to the active preset, so it survives a restart.
	 * Debounced: a loop replaying panel moves must not hit the disk on every gesture.
	 */
	private schedulePersist(ctx: PageContext) {
		if (this.persistTimer) clearTimeout(this.persistTimer)
		this.persistTimer = setTimeout(() => {
			this.persistTimer = null
			ctx.persist(this.panelState())
		}, PERSIST_DEBOUNCE_MS)
	}

	private panelState() {
		return {
			octaves: [...this.octave],
			tintOns: [...this.tintOn],
			tintModes: [...this.tintMode],
			tintOctaves: [...this.tintOctave],
			strum: this.strum,
			strumMs: this.strumMs,
			strumDir: this.strumDir,
			tintJitterMs: this.tintJitterMs,
		}
	}

	private toggleTintPc(step: number, ctx: PageContext) {
		const pc = this.pc(step)
		const set = this.tintPcs[this.front]
		if (!set.delete(pc)) set.add(pc)
		this.tintEdited = true
		this.tintChanged(ctx)
	}

	/** A triad changed: persist it and let sounding notes keep their T-voice. */
	private tintChanged(ctx: PageContext) {
		ctx.persist(this.tintState())
		ctx.osc.send(`/grid/out/page/${ctx.slotLabel}/tintset`, JSON.stringify(this.tintState().tintPcsByTrack))
		this.commit(ctx)
	}

	private tintState() {
		return { tintPcsByTrack: this.tintPcs.map((set) => [...set].sort((a, b) => a - b)) }
	}

	/**
	 * The T-voice for an M-step on a track: the nearest step strictly above (or below) whose
	 * pitch class is in that track's triad. Null when the triad is empty.
	 */
	private tintStep(track: number, m: number): number | null {
		const pcs = this.tintPcs[track]
		if (!pcs.size) return null
		const mode = this.tintMode[track]
		const below = mode === "below" || (mode === "alternate" && this.tintAltBelow[track])
		if (mode === "alternate") this.tintAltBelow[track] = !this.tintAltBelow[track]
		const dir = below ? -1 : 1
		for (let d = 1; d <= this.npo; d++) {
			const s = m + dir * d
			if (pcs.has(this.pc(s))) return s + this.tintOctave[track] * this.npo
		}
		return null
	}

	/** The panel's own values for the front track, at rest. The arp's are the app's and not counted. */
	private isPanelDefault(): boolean {
		return this.octave[this.front] === 0 && !this.strum && !this.tintOn[this.front]
	}

	private renderPanel(f: LedFrame) {
		const set = (x: number, y: number, lvl: number) => { f[ledIndex(this.size, x, y)] = lvl }
		for (let x = PANEL_X0; x < PANEL_X0 + PANEL_W; x++) for (let y = 0; y < this.size.height; y++) set(x, y, 0)
		const pick = (cur: boolean, home: boolean) =>
			cur ? LVL_PANEL_CURRENT : home ? LVL_PANEL_DEFAULT : LVL_PANEL_OTHER
		const t = this.front
		set(PANEL_TINT_COL, 0, this.tintKeyDown || this.tintOn[t] ? LVL_PANEL_CURRENT : this.tintPcs[t].size ? LVL_PANEL_DEFAULT : LVL_PANEL_OTHER)
		TINT_MODES.forEach((m, i) => set(PANEL_TINT_COL, 1 + i, m === this.tintMode[t] ? 11 : rampLevel(LVL_PANEL_OTHER, i)))
		for (let r = 0; r < 3; r++) {
			const o = 1 - r
			set(PANEL_TINT_COL, TINT_OCT_ROW_TOP + r, pick(o === this.tintOctave[t], o === 0))
		}
		for (let r = 0; r < 4; r++) {
			const o = OCTAVE_MAX - r
			set(PANEL_STRUM_COL, OCTAVE_ROW_TOP + r, pick(o === this.octave[t], o === 0))
		}
		// SPEED and PROB are the app's: nothing is marked until it has said what they are.
		const rate = (ARP_RATES as readonly string[]).indexOf(this.appRate ?? "")
		for (let r = 0; r < ARP_RATES.length; r++) set(PANEL_SPEED_COL, r, pick(r === rate, false))
		const probRow = this.appProb === undefined ? -1 : clamp(Math.round(PROB_ROWS - this.appProb * PROB_ROWS), 0, PROB_ROWS - 1)
		for (let r = 0; r < PROB_ROWS; r++) set(PANEL_PROB_COL, r, pick(r === probRow, r === 0))
		set(PANEL_STRUM_COL, 0, this.strum ? LVL_PANEL_CURRENT : LVL_PANEL_OTHER)
	}

	/**
	 * A keyboard press: a plain press on the FRONT track, stamped with it and with the offset
	 * in force, so nothing held moves later. A note already down there (a loop, a chord, a
	 * twin cell) is articulated again with an explicit off and on. What ARP and LATCH make of
	 * the press is the app's business.
	 */
	private pressKey(i: number, ctx: PageContext) {
		const key = noteKey(this.front, this.stepOfIndex(i) + this.offset())
		if (this.lastSounding.has(key)) this.retrigger.add(key)
		this.held.set(i, key)
		this.commit(ctx)
	}

	private releaseKey(i: number, ctx: PageContext) {
		this.held.delete(i)
		this.commit(ctx)
	}

	/**
	 * The LATCH key: the front track's LATCH in the app, lit from the app. Lit this way it
	 * also ARMS the chord presets for saving; the pedal's LATCH does not.
	 */
	private toggleKey(ev: KeyEvent, ctx: PageContext) {
		if (!ev.s) return // latching: act on press, ignore release
		const t = this.front
		const on = this.appLatch[t] !== true
		this.setLatch(t, on, ctx)
		this.pedalMade.delete(t)
	}

	/** Is a chord preset press a SAVE? The front track's LATCH is lit, and not by the pedal. */
	private saveArmed(): boolean {
		return this.appLatch[this.front] === true && !this.pedalMade.has(this.front)
	}

	/**
	 * A chord preset key. Armed (see saveArmed) it SAVES what the front track is ringing;
	 * saving silence clears the slot. Otherwise it PLAYS on the front track, momentarily: the
	 * chord is down while the key is, and the app's LATCH keeps it if that is lit.
	 */
	private presetKey(slot: number, ev: KeyEvent, ctx: PageContext) {
		if (!ev.s) {
			if (!this.presetHeld.has(slot)) return
			this.presetHeld.delete(slot)
			this.commit(ctx)
			return
		}
		if (ctx.modifiers.shift1) {
			// Shift-clear, same gesture as clearing a looper. Beats saving to it.
			this.chords.delete(slot)
			this.chordT.delete(slot)
			this.chordsChanged(ctx)
			return
		}
		if (this.saveArmed()) {
			const chord = this.soundingChord()
			// Pressing the slot you JUST saved to, with that chord still ringing, releases
			// it — the "right, next one" gesture: LATCH off and on again lets the app go of it.
			if (chord.length && sameChord(this.chords.get(slot), chord)) {
				this.setLatch(this.front, false, ctx)
				this.setLatch(this.front, true, ctx)
				return
			}
			if (chord.length) {
				this.chords.set(slot, chord)
				this.chordT.set(slot, this.offset())
			} else {
				this.chords.delete(slot) // saving silence clears the slot
				this.chordT.delete(slot)
			}
			this.chordsChanged(ctx)
			return
		}
		const chord = this.chords.get(slot)
		if (!chord) return
		const off = this.transposeChords ? this.offset() - (this.chordT.get(slot) ?? 0) : 0
		const keys = chord.map((step) => noteKey(this.front, step + off))
		for (const key of keys) if (this.lastSounding.has(key)) this.retrigger.add(key)
		this.presetHeld.set(slot, keys)
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
		const r = this.recorders[idx]
		if (ctx.modifiers.shift1) r.clear()
		else r.press(Date.now(), this.quantumMs(idx))
		this.emitPatterns(ctx)
		this.commit(ctx)
		this.syncTimer()
	}

	/** A TRACK key brings that track's layer to the front. Nothing sounding moves. */
	private trackKey(idx: number, ev: KeyEvent, ctx: PageContext) {
		if (!ev.s || idx === this.front) return
		this.front = idx
		this.lanesAskedAt = 0 // an open picker reads the new track's lanes at once
		this.tintKeyDown = false
		this.emitTracks(ctx)
		this.emitSettings(ctx) // tint mode and octave are the front track's
		ctx.setDirty()
	}

	/** An ARP key: the front track's ARP on in that order, or off by pressing the one that is lit. */
	private arpKey(idx: number, ev: KeyEvent, ctx: PageContext) {
		if (!ev.s) return
		const t = this.front
		const lit = this.appArp[t] === true && this.appOrder === ARP_ORDERS[idx]
		this.setArp(t, lit ? 0 : idx + 1, ctx, true)
	}

	// Settings in from Max / the web panel. Accepts, in order of preference:
	//   /setting/<key> <v> · /<key> <v> · /<key>/<v> · /settings/get
	onOsc(path: string, args: any[], ctx: PageContext) {
		const parts = path.split("/").filter(Boolean)
		let i = 0
		if (parts[i] === "setting" || parts[i] === "settings") i++
		const key = parts[i]
		if (!key) return
		if (i === 0 && key === "remote") return this.remoteNote(args, ctx)
		if (key === "get") {
			this.emitSettings(ctx)
			return
		}
		const raw = args.length ? args[0] : parts[i + 1]
		if (raw === undefined) return
		const npo = this.npo
		if (!this.applySetting(key, raw)) return
		// Pitch classes mean something else in another octave size.
		if (this.npo !== npo && this.tintPcs.some((set) => set.size)) {
			for (const set of this.tintPcs) set.clear()
			this.tintChanged(ctx)
		}
		if (PANEL_SETTINGS.has(key)) this.schedulePersist(ctx)
		this.emitSettings(ctx)
	}

	/** A note played in surface, to light here. Display only: see `remote`. */
	private remoteNote(args: any[], ctx: PageContext) {
		const step = Number(args[0]), track = Number(args[2] ?? 0)
		if (!Number.isInteger(step) || step < -NOTE_BIAS || step >= NOTE_STRIDE - NOTE_BIAS) return
		if (!Number.isInteger(track) || track < 0 || track >= TRACK_ROWS) return
		if (Number(args[1])) this.remote.add(noteKey(track, step))
		else this.remote.delete(noteKey(track, step))
		ctx.setDirty()
	}

	render(ctx: PageContext): LedFrame {
		this.commit(ctx)
		this.pollApp(ctx, Date.now())
		// A peer that sends heartbeats and then stops has gone: its lights go with it.
		if (this.peerBeatAt && Date.now() - this.peerBeatAt > PEER_GONE_MS) {
			this.peerBeatAt = 0
			this.remote.clear()
		}
		// TWO PLANES. Bright: what the hands hold on the FRONT track, what its LATCH keeps of
		// them, and the keys played in the app on that track. Dim: every other track's notes,
		// and every loop's playback, the front track's included. A note is lit at EVERY cell
		// that plays it, placed by the front track's offset (the map under your fingers).
		const front = this.front
		const bright = new Set<number>()
		const dim = new Set<number>()
		const place = (key: number, hand: boolean) => (hand && trackOf(key) === front ? bright : dim).add(stepOf(key))
		for (const key of this.lastSounding) place(key, this.lastLive.has(key))
		for (const key of this.latchHand) place(key, true)
		for (const key of this.latchLoop) place(key, false)
		for (const key of this.remote) place(key, true)

		const f = makeFrame(this.size)
		// T-voices shimmer so they read apart from the notes you played. A T-voice that is
		// also one of your own notes is just a note.
		const tSteps = new Set<number>()
		for (const t of this.tintOf.values()) if (!this.tintOf.has(t) && trackOf(t) === front) tSteps.add(stepOf(t))
		const shimmerLo = Date.now() % (BLINK_MS * 2) >= BLINK_MS
		const editPcs = this.tintPcs[front]
		for (let y = 0; y < this.size.height; y++) {
			for (let x = KEYS_X0; x < this.keysW; x++) {
				const i = ledIndex(this.size, x, y)
				const step = this.step(x, y)
				let lvl = this.baseLevel(step)
				const sounding = step + this.offset()
				if (dim.has(sounding)) lvl = lvl >= LVL_ROOT ? LVL_LAYER_DIM_ROOT : LVL_LAYER_DIM
				if (bright.has(sounding)) lvl = LVL_UNISON
				if (shimmerLo && tSteps.has(sounding) && bright.has(sounding)) lvl = LVL_TINT_LO
				if (this.held.has(i)) lvl = LVL_HELD
				if (this.tintKeyDown && this.panelShown && editPcs.has(this.pc(sounding))) lvl = LVL_TINT_EDIT
				f[i] = lvl
			}
		}
		// Control keys down the right edge. Shifts are faint markers that light while held;
		// LATCH shows the app's LATCH for the front track, the pedal that it is holding one.
		if (this.hasControls()) {
			const cx = this.size.width - 1
			const mark = (row: number, on: boolean) => {
				f[ledIndex(this.size, cx, row)] = on ? LVL_HELD : LVL_SHIFT
			}
			f[ledIndex(this.size, cx, SHIFT1_ROW)] = ctx.modifiers.shift1 ? LVL_HELD : LVL_SHIFT_IDLE
			f[ledIndex(this.size, cx, SHIFT2_ROW)] = ctx.modifiers.shift2 ? LVL_HELD : LVL_SHIFT_IDLE
			mark(SUSTAIN_PEDAL_ROW, this.pedalTrack !== null)
			mark(SUSTAIN_TOGGLE_ROW, this.appLatch[front] === true)
		}
		const blinkOn = Date.now() % (BLINK_MS * 2) < BLINK_MS
		// Loopers: blink while armed, full while looping, mid when stopped with content.
		if (this.hasRecorders()) {
			const rx = this.size.width - 1
			for (let idx = 0; idx < RECORDER_ROWS; idx++) {
				const st = this.recorders[idx].state
				f[ledIndex(this.size, rx, idx)] =
					st === "recording" ? (blinkOn ? LVL_REC_ARMED : LVL_REC_EMPTY)
					: st === "playing" ? LVL_HELD
					: st === "stopped" ? LVL_REC_STOPPED
					: LVL_REC_EMPTY
			}
		}
		// Tracks: the one in front stands out.
		if (this.hasTracks()) {
			const tx = this.size.width - TRACK_COL_FROM_RIGHT
			const now = Date.now()
			for (let idx = 0; idx < TRACK_ROWS; idx++) {
				let lvl = idx === front ? LVL_TRACK_ON : rampLevel(LVL_TRACK_IDLE, idx)
				// Activity pulse: a brief lift on every note-on, so you can see which
				// instrument a loop is feeding.
				if (now - this.trackPulseAt[idx] < PULSE_MS) lvl = Math.min(15, lvl + PULSE_BUMP)
				f[ledIndex(this.size, tx, idx)] = lvl
			}
			// The arp keys under the tracks: the app's order, bright while the front track's ARP is on.
			for (let idx = 0; idx < ARP_KEYS; idx++) {
				f[ledIndex(this.size, tx, ARP_ROW_START + idx)] =
					this.appOrder !== ARP_ORDERS[idx] ? rampLevel(LVL_ARP_IDLE, idx)
					: this.appArp[front] === true ? LVL_ARP_ON : LVL_ARP_ORDER
			}
		}
		// Chord presets: dim when empty, brighter when loaded, brightest while playing,
		// and the whole column lifts while the toggle arms them for saving.
		if (this.hasPresets()) {
			const cx = this.size.width - CHORD_COL_FROM_RIGHT
			for (let slot = 0; slot < this.size.height; slot++) {
				const full = this.chords.has(slot)
				let lvl = this.saveArmed()
					? full ? LVL_PRESET_FULL_ARMED : LVL_PRESET_EMPTY_ARMED
					: full ? LVL_PRESET_FULL : LVL_PRESET_EMPTY
				if (this.presetHeld.has(slot)) lvl = LVL_HELD
				f[ledIndex(this.size, cx, slot)] = lvl
			}
		}
		if (this.transposerShown) {
			const y = this.size.height - 1
			for (let x = KEYS_X0; x < this.keysW; x++) {
				const t = x - TRANSPOSE_ZERO_COL
				f[ledIndex(this.size, x, y)] =
					t === this.transpose ? LVL_TR_CURRENT : t === 0 ? LVL_TR_ZERO : LVL_TR_OTHER
			}
		}
		if (this.hasPanel() && this.panelShown) this.renderPanel(f)
		// ... and, as part of the same menu, the lanes on the rest of the top row.
		if (this.hasPanel() && this.panelShown) {
			this.askLanes(ctx, Date.now())
			const heard = [this.front].map((t) => this.trackLanes[t]).filter((l): l is string => l !== undefined)
			for (let l = 0; l < PICKER_LANES; l++) {
				const n = heard.filter((lanes) => lanes.includes(String(l + 1))).length
				f[ledIndex(this.size, PICKER_X0 + l, 0)] =
					heard.length === 0 ? 0 : n === heard.length ? LVL_PICK_ON : n > 0 ? LVL_PICK_SOME : LVL_PICK_OFF
			}
		}
		drawSelector(f, ctx)
		// Iso's own two toggles sit where the other surface pages have the left shifts.
		f[ledIndex(this.size, 0, PANEL_TOGGLE_ROW)] = !this.hasPanel() ? 0
			: this.panelShown ? LVL_TR_TOGGLE_SHOWN
			: this.isPanelDefault() ? LVL_TR_TOGGLE_IDLE : LVL_TR_TOGGLE_OFFSET
		f[ledIndex(this.size, 0, TRANSPOSE_TOGGLE_ROW)] = this.transposerShown
			? LVL_TR_TOGGLE_SHOWN
			: this.transpose !== 0 ? LVL_TR_TOGGLE_OFFSET : LVL_TR_TOGGLE_IDLE
		return f
	}

	serialize() {
		// Saved chords are stored content, so they belong in a preset capture; anything
		// currently sounding, and everything that is the app's (ARP, LATCH), do not.
		return {
			...this.settings(),
			...this.chordState(),
			patterns: this.recorders.map((r) => r.snapshot()),
			...this.trackState(),
			...this.tintState(),
			...this.panelState(),
		}
	}

	/**
	 * The inverse of serialize(). Everything here is read defensively (see
	 * util/restoreGuards.ts): a preset written by an older build, missing half its keys or
	 * hand-edited into nonsense must leave the page on its constructed defaults, not throw.
	 *
	 * Nothing restored makes a sound. Loops come back STOPPED with the playhead at the top,
	 * the arp's own mode is a setting like any other but its voice starts empty, and
	 * sustain, held keys and the ringing chord are simply not in the file.
	 */
	restore(config: unknown, ctx: PageContext) {
		if (!isRecord(config)) return

		// The track in front, first: the tint settings below are read as that track's. An older
		// file has a selection instead, and its first track comes to the front.
		if (config.front !== undefined) this.front = Math.round(num(config.front, 0, 0, TRACK_ROWS - 1))
		else if (config.selected !== undefined) this.front = Math.min(...intSet(config.selected, 0, TRACK_ROWS - 1, [0]))

		// Settings go back through applySetting, so a preset gets exactly the same clamping
		// and the same refusal of an unknown scale/layout/mode that a live OSC write does.
		for (const spec of SPECS) {
			if (config[spec.key] !== undefined) this.applySetting(spec.key, config[spec.key])
		}

		// Chords: one dense entry per grid row, null (or empty) = an empty slot. The values
		// are whatever Max maps to pitch, so they are kept as-is — deduped, order preserved,
		// and bounded so a corrupt file can't allocate a chord of a million notes.
		if (config.chords !== undefined) {
			const raw = Array.isArray(config.chords) ? config.chords : []
			this.chords.clear()
			for (let slot = 0; slot < this.size.height; slot++) {
				const chord = [...intSet(raw[slot], -CHORD_PITCH_LIMIT, CHORD_PITCH_LIMIT)]
				if (chord.length) this.chords.set(slot, chord.slice(0, CHORD_MAX_NOTES))
			}
		}
		// The transposition each chord / take was made at. Missing = 0 (an older file).
		const rawCT = Array.isArray(config.chordTranspose) ? config.chordTranspose : []
		this.chordT.clear()
		for (const slot of this.chords.keys()) {
			this.chordT.set(slot, Math.round(num(rawCT[slot], 0, -CHORD_PITCH_LIMIT, CHORD_PITCH_LIMIT)))
		}


		// Recorded loops, take by take. An entry that doesn't add up to a loop restores as
		// an empty recorder, which is also what an untouched looper looks like in the file.
		if (config.patterns !== undefined) {
			const raw = Array.isArray(config.patterns) ? config.patterns : []
			for (let i = 0; i < RECORDER_ROWS; i++) {
				const node = isRecord(raw[i]) ? raw[i] : {}
				this.recorders[i].restore({
					lengthMs: num(node.lengthMs, 0, 0, MAX_RECORD_MS),
					events: records(node.events, MAX_PATTERN_EVENTS, (e) => {
						if (e.ctl !== undefined) {
							const ctl = isRecord(e.ctl) ? e.ctl : {}
							const value = Number(ctl.value)
							if (!Number.isFinite(value)) return undefined
							const atMs = num(e.atMs, -1, 0, MAX_RECORD_MS)
							if (ctl.id === CTL_TRANSPOSE) {
								const v = clamp(Math.round(value), TRANSPOSE_MIN, TRANSPOSE_MAX)
								return { atMs, step: 0, on: false, ctl: { id: CTL_TRANSPOSE, value: v } }
							}
							if (typeof ctl.id !== "string") return undefined
							const { base, track } = parseCtl(ctl.id)
							const bounds = CTL_BOUNDS[base]
							if (!bounds) return undefined
							const v = clamp(Math.round(value), bounds[0], bounds[1])
							return { atMs, step: 0, on: false, ctl: { id: PER_TRACK_CTL.has(base) ? ctlId(base, track) : base, value: v } }
						}
						if (typeof e.on !== "boolean" && typeof e.on !== "number") return undefined
						const step = Number(e.step)
						if (!Number.isFinite(step)) return undefined
						return {
							atMs: num(e.atMs, -1, 0, MAX_RECORD_MS),
							step: Math.round(step),
							on: bool(e.on, false),
						}
					}).filter((e) => e.atMs >= 0),
				})
			}
		}

		// LOOPS HAVE NO ROUTES any more (Ian, 2026-11-13): a loop plays each press on the track
		// that was in front when it was played. A loop an older file pinned to tracks cannot be
		// replayed as it was, so it is cleared, and the log says so.
		if (Array.isArray(config.routes)) {
			const pinned = new Set<number>()
			for (const set of config.routes) for (const i of intSet(set, 0, RECORDER_ROWS - 1)) pinned.add(i)
			for (const i of pinned) {
				if (!this.recorders[i].hasContent) continue
				this.recorders[i].clear()
				console.log(`[iso-surface] loop ${i + 1} was recorded with track routes, which are gone: cleared`)
			}
		}

		// Per-track panel values. An older file has one of each: every track takes it.
		const perTrack = <T>(list: unknown, old: T, read: (v: unknown, fallback: T) => T): T[] =>
			Array.from({ length: TRACK_ROWS }, (_, t) => (Array.isArray(list) ? read(list[t], old) : old))
		this.octave = perTrack(config.octaves, Math.round(num(config.octave, 0, OCTAVE_MIN, OCTAVE_MAX)), (v, d) => Math.round(num(v, d, OCTAVE_MIN, OCTAVE_MAX)))
		this.tintOn = perTrack(config.tintOns, bool(config.tintOn, false), (v, d) => bool(v, d))
		this.tintMode = perTrack(config.tintModes, this.tintMode[this.front], (v, d) => ((TINT_MODES as readonly string[]).includes(v as string) ? (v as TintMode) : d))
		this.tintOctave = perTrack(config.tintOctaves, this.tintOctave[this.front], (v, d) => Math.round(num(v, d, -1, 1)))
		// The T-triads, as pitch classes of the (already restored) octave size.
		if (Array.isArray(config.tintPcsByTrack)) {
			this.tintPcs = Array.from({ length: TRACK_ROWS }, (_, t) => intSet((config.tintPcsByTrack as unknown[])[t], 0, this.npo - 1))
		} else if (config.tintPcs !== undefined) {
			this.tintPcs = Array.from({ length: TRACK_ROWS }, () => intSet(config.tintPcs, 0, this.npo - 1))
		}

		this.syncTimer()
		this.announce(ctx) // init() announced the defaults; they are stale now
	}

	dispose(ctx: PageContext) {
		// The slot is going away for good — now the loops really do stop.
		this.unpeer?.()
		this.unpeer = null
		this.unsurface?.()
		this.unsurface = null
		this.remote.clear()
		this.releaseLive(ctx)
		for (const r of this.recorders) r.clear()
		this.commit(ctx)
		this.clearPending()
		if (this.persistTimer) clearTimeout(this.persistTimer) // the slot is going; so is its state
		this.persistTimer = null
		this.syncTimer()
		this.ctx = null
	}

	/**
	 * The PEDAL: a momentary LATCH for the front track. Down lights that track's LATCH in the
	 * app, up puts it out (and the app lets go). Two presses inside DOUBLE_TAP_MS keep it lit
	 * until the next press. It does nothing on a track whose LATCH is lit already by the LATCH
	 * key or in the app, and a LATCH it lit does not arm the chord presets for saving.
	 */
	private sustainKey(ev: KeyEvent, ctx: PageContext) {
		// Leading-edge lockout: the first edge acts instantly, then ANY edge is swallowed
		// briefly. Chatter is ALTERNATING, so a same-state filter would not catch it — see
		// core/shiftInput.ts, which learned this the hard way.
		const now = Date.now()
		if (now - this.lastPedalEdgeAt < PEDAL_LOCKOUT_MS) return
		this.lastPedalEdgeAt = now

		if (!ev.s) {
			if (this.sustainLatched || this.pedalTrack === null) return
			const t = this.pedalTrack
			this.pedalTrack = null
			this.setLatch(t, false, ctx)
			return
		}
		if (this.sustainLatched) {
			this.sustainLatched = false
			this.lastSustainTapAt = 0
			const t = this.pedalTrack
			this.pedalTrack = null
			if (t !== null) this.setLatch(t, false, ctx)
			return
		}
		const t = this.front
		if (this.appLatch[t] === true && !this.pedalMade.has(t)) return // lit by the LATCH key: not the pedal's
		// A deliberate double tap latches; anything faster than a human could manage is
		// bounce and only re-arms the window.
		const gap = now - this.lastSustainTapAt
		if (gap >= DOUBLE_TAP_MIN_MS && gap < DOUBLE_TAP_MS) this.sustainLatched = true
		this.lastSustainTapAt = now
		this.setLatch(t, true, ctx)
		this.pedalMade.add(t)
		this.pedalTrack = t
	}

	/**
	 * The step a cell plays. In `chromatic` the field is the plain isomorphic layout; in
	 * `folded` the same coordinates index SCALE DEGREES instead, which we resolve back to
	 * a chromatic step here — so what leaves this page is always an ordinary step and
	 * Max's step→pitch map never has to know which scale is selected.
	 */
	private step(x: number, y: number): number {
		const i = stepAt(x - KEYS_X0, y, this.size.height, this.vertical, this.orientation)
		return this.layout === "folded" ? foldedStep(i, this.root, this.scale) : i
	}

	/**
	 * Display level for a cell's step, before chord/finger/arp override it. `dim` steps the
	 * scale map down so an arpeggiated note has somewhere to stand out from.
	 */
	private baseLevel(step: number): number {
		const root = LVL_ROOT
		const normal = LVL_NORMAL
		// A scale is a 12-EDO idea. Under `chromatic` we keep the original npo-based
		// octave marking, so microtonal layouts (npo up to 48) still read correctly.
		if (this.scale === "chromatic") return isRootStep(step, this.npo) ? root : normal
		if (isRootOf(step, this.root)) return root
		return isInScale(step, this.root, this.scale) ? normal : LVL_OUT
	}

	private stepOfIndex(i: number): number {
		return this.step(i % this.size.width, Math.floor(i / this.size.width))
	}

	/**
	 * THE NOTE PIPELINE. A note is a packed (track, step), reconciled against what the app was
	 * last told, because hands, chord presets, T-voices and four loops can claim one at once:
	 *
	 *   keys + chords + T-voices ──> LIVE ──> [record tap] ──┐
	 *                                                        ├──> out ──> reconcile
	 *   loop playback (each press on its own track) ─────────┘
	 *
	 * There is no sustain stage and no arp stage here: a release is sent as a release, and
	 * the app's LATCH and ARP for that key track decide what is heard. A note stops when the
	 * LAST source lets go; a source claiming a note that is already down articulates it again.
	 */
	private commit(ctx: PageContext) {
		const nowMs = Date.now()

		// 1. LIVE: what the hands and the chord presets hold, each on the track it began on.
		const live = new Set<number>()
		for (const key of this.held.values()) live.add(key)
		for (const keys of this.presetHeld.values()) for (const key of keys) live.add(key)
		// Tintinnabuli, per track: each live M-note gains its T-voice, fixed when the M-note starts.
		for (const m of this.tintOf.keys()) if (!live.has(m) || !this.tintOn[trackOf(m)]) this.tintOf.delete(m)
		for (const m of [...live].sort((a, b) => a - b)) {
			const track = trackOf(m)
			if (!this.tintOn[track] || !this.tintPcs[track].size) continue
			let t = this.tintOf.get(m)
			if (t === undefined) {
				const s = this.tintStep(track, stepOf(m))
				if (s === null) continue
				t = noteKey(track, s)
				this.tintOf.set(m, t)
			}
			live.add(t)
		}

		// 2. RECORD TAP: the transitions of that stream, with the track of each press.
		this.tapRecorders(live, nowMs)

		// 3. Loop playback joins. Loopers never tap each other, so a loop can't record itself.
		const out = new Set(live)
		this.recorders.forEach((r, i) => {
			for (const key of this.loopOut(i, r.sounding)) out.add(key)
		})

		// 4. RECONCILE against what the app was last told. A retrigger articulates a note that
		// is staying down, so it needs an explicit off/on pair. A strummed note still waiting
		// to start is in lastSounding already; the app hasn't heard of it, so leaving cancels
		// it silently and a retrigger has nothing to articulate.
		for (const key of this.retrigger) {
			if (this.lastSounding.has(key) && out.has(key) && !this.pendingOn.has(key)) {
				this.note(ctx, key, false)
				this.note(ctx, key, true)
			}
		}
		this.retrigger.clear()
		const starting = [...out].filter((key) => !this.lastSounding.has(key))
		for (const key of this.lastSounding) {
			if (out.has(key)) continue
			const pending = this.pendingOn.get(key)
			if (pending !== undefined) {
				clearTimeout(pending)
				this.pendingOn.delete(key)
			} else this.note(ctx, key, false)
		}
		this.startNotes(ctx, starting)
		this.lastSounding = out
	}

	/**
	 * Note-ons that begin in one commit. With strum on, they are staggered `strumMs` apart
	 * in pitch order (low first for `up`); the first goes now. Hands press one key per event,
	 * so a lone finger is never delayed — only chords, loop chords and T-voices spread.
	 */
	private startNotes(ctx: PageContext, keys: number[]) {
		// T-voices (that aren't also a played note) are humanized: 0..tintJitterMs late.
		const tKeys = new Set<number>()
		if (this.tintJitterMs > 0) for (const t of this.tintOf.values()) if (!this.tintOf.has(t)) tKeys.add(t)
		const strum = this.strum && keys.length > 1
		if (strum) {
			const sign = this.strumDir === "down" ? -1 : 1
			keys.sort((a, b) => sign * (stepOf(a) - stepOf(b)) || a - b)
		}
		keys.forEach((key, n) => {
			const late =
				(strum ? n * this.strumMs : 0) +
				(tKeys.has(key) ? Math.round(this.rng() * this.tintJitterMs) : 0)
			if (late <= 0) return this.note(ctx, key, true)
			this.pendingOn.set(key, setTimeout(() => {
				if (!this.pendingOn.delete(key)) return
				this.note(ctx, key, true)
			}, late))
		})
	}

	/** Forget strummed notes that never started — only when Max's picture is reset too. */
	private clearPending() {
		for (const t of this.pendingOn.values()) clearTimeout(t)
		this.pendingOn.clear()
	}

	/**
	 * The pitches the FRONT track is ringing: what is down on it now, and what this page
	 * believes its LATCH keeps. This is what a chord preset saves.
	 */
	private soundingChord(): number[] {
		const steps = new Set<number>()
		for (const set of [this.lastSounding, this.latchHand, this.latchLoop])
			for (const key of set) if (trackOf(key) === this.front) steps.add(stepOf(key))
		return [...steps].sort((a, b) => a - b)
	}

	/** Feed the live stream's transitions to every armed recorder, each press with its track. */
	private tapRecorders(live: Set<number>, nowMs: number) {
		// Loops store UNtransposed steps (sounding minus the offset it started at); the
		// transposer is recorded alongside as a gesture and re-applied on playback.
		const rec = (key: number) => recKey(trackOf(key), stepOf(key) - (this.liveT.get(key) ?? this.offset(trackOf(key))))
		const recording = this.recorders.some((r) => r.state === "recording")
		for (const key of this.lastLive) {
			if (live.has(key)) continue
			if (recording) this.recordAll(rec(key), false, nowMs)
			this.liveT.delete(key)
		}
		if (recording) {
			for (const key of this.retrigger) {
				if (live.has(key) && this.lastLive.has(key)) {
					this.recordAll(rec(key), false, nowMs)
					this.recordAll(rec(key), true, nowMs)
				}
			}
		}
		for (const key of live) {
			if (this.lastLive.has(key)) continue
			this.liveT.set(key, this.offset(trackOf(key)))
			if (recording) this.recordAll(rec(key), true, nowMs)
		}
		this.lastLive = live
	}

	private recordAll(step: number, on: boolean, nowMs: number) {
		for (const r of this.recorders) r.record(step, on, nowMs)
	}

	/**
	 * A looper's sounding presses as they go OUT: each on the track it was played on, its
	 * untransposed step plus the offset now in force, stamped per note at its start so a
	 * ringing note is never re-pitched. A press newly claiming a note that is already down
	 * articulates it again, or a loop over a held key would be a drone.
	 */
	private loopOut(i: number, raw: ReadonlySet<number>): Set<number> {
		const map = this.loopShift[i]
		for (const v of map.keys()) if (!raw.has(v)) map.delete(v)
		for (const v of raw) {
			if (map.has(v)) continue
			const track = recTrack(v)
			const key = noteKey(track, recRaw(v) + (this.transposeLoops ? this.offset(track) : 0))
			map.set(v, key)
			if (this.lastSounding.has(key)) this.retrigger.add(key)
		}
		return new Set(map.values())
	}

	/**
	 * `byHand` = a press of yours, which armed loopers record as a gesture. Moves played back
	 * by a loop are not recorded — loopers never tap each other.
	 */
	private setTranspose(t: number, ctx: PageContext, byHand: boolean) {
		const next = clamp(t, TRANSPOSE_MIN, TRANSPOSE_MAX)
		if (byHand) {
			const nowMs = Date.now()
			for (const r of this.recorders) r.recordControl(CTL_TRANSPOSE, next, nowMs)
			this.syncTimer()
		}
		if (next === this.transpose) return
		this.transpose = next
		this.emitTranspose(ctx)
	}

	private emitTranspose(ctx: PageContext) {
		ctx.osc.send(`/grid/out/page/${ctx.slotLabel}/transpose`, this.transpose)
	}

	/** Saved chords changed: tell Max, and write them through to disk. */
	private chordsChanged(ctx: PageContext) {
		this.emitChords(ctx)
		ctx.persist(this.chordState())
	}

	private chordState() {
		return {
			chords: this.chordArray(),
			chordTranspose: Array.from({ length: this.size.height }, (_, s) => this.chordT.get(s) ?? 0),
		}
	}

	/**
	 * One press or release to the app: /note <step> <1|0> <track>, with a fourth argument 1
	 * when it is a LOOP's (no hand or chord holds the note), so the app's LOOPS THROUGH ARP
	 * can tell them apart. A hand's message is unchanged. A release while its track's LATCH is
	 * lit is remembered in the latch picture (see latchHand).
	 */
	private note(ctx: PageContext, key: number, on: boolean) {
		const track = trackOf(key)
		if (on && track < this.trackPulseAt.length) this.trackPulseAt[track] = Date.now()
		const loop = on ? !this.lastLive.has(key) : this.sentAsLoop.has(key)
		if (on && loop) this.sentAsLoop.add(key)
		else this.sentAsLoop.delete(key)
		if (!on && this.appLatch[track] === true) (loop ? this.latchLoop : this.latchHand).add(key)
		const addr = `/grid/out/page/${ctx.slotLabel}/note`
		if (loop) ctx.osc.send(addr, stepOf(key), on ? 1 : 0, track, 1)
		else ctx.osc.send(addr, stepOf(key), on ? 1 : 0, track)
	}

	/** Drop everything the hands own. Recorders, and the app's LATCH, are deliberately untouched. */
	private releaseLive(ctx: PageContext) {
		this.held.clear()
		this.presetHeld.clear()
		this.retrigger.clear()
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
			// A replayed move lands BEFORE commit, so notes starting in the same window
			// already take it. Latest recorder wins. Per-track moves go to their own track.
			for (const [id, value] of this.recorders[i].takeControls()) {
				const { base, track } = parseCtl(id)
				if (base === CTL_TRANSPOSE) this.setTranspose(value, ctx, false)
				else if (base === CTL_ARP) this.setArp(track, value, ctx, false)
				else if (base === CTL_OCTAVE) this.setOctave(value, ctx, false, track)
				else if (base === CTL_ARP_SPEED) this.setArpSpeed(value, ctx, false)
				else if (base === CTL_ARP_PROB) this.setArpProbRow(value, ctx, false)
				else if (base === CTL_STRUM) this.setStrum(value > 0, ctx, false)
				else if (base === CTL_TINT) this.setTint(value > 0, ctx, false, track)
				else if (base === CTL_TINT_MODE) this.setTintMode(value, ctx, false, track)
				else if (base === CTL_TINT_OCTAVE) this.setTintOctave(value, ctx, false, track)
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
			this.size.height >= ARP_ROW_START + ARP_KEYS
		)
	}
	private trackIndexAt(x: number, y: number): number | null {
		if (!this.hasTracks() || x !== this.size.width - TRACK_COL_FROM_RIGHT) return null
		return y >= 0 && y < TRACK_ROWS ? y : null
	}

	private arpIndexAt(x: number, y: number): number | null {
		if (!this.hasTracks() || x !== this.size.width - TRACK_COL_FROM_RIGHT) return null
		const row = y - ARP_ROW_START
		return row >= 0 && row < ARP_KEYS && y < this.size.height ? row : null
	}

	/** Chords as a dense array (null = empty slot) — the shape Max and the web UI get. */
	private chordArray(): (number[] | null)[] {
		return Array.from({ length: this.size.height }, (_, slot) => this.chords.get(slot) ?? null)
	}

	private trackState() {
		// `selected` is what idk.surface reads (the lit KEYS row); it is always the one track in front.
		return { selected: [this.front], front: this.front }
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
		if (key === "strumDir") {
			if (raw !== "up" && raw !== "down") return false
			this.strumDir = raw
			return true
		}
		if (key === "tintMode") {
			if (!(TINT_MODES as readonly string[]).includes(raw as string)) return false
			this.tintMode[this.front] = raw as TintMode
			return true
		}
		if (spec.type === "toggle") {
			const on = bool(raw, spec.default as boolean)
			if (key === "transposeChords") this.transposeChords = on
			else if (key === "transposeLoops") this.transposeLoops = on
			else if (key === "strum") this.strum = on
			return true
		}
		const value = Number(raw)
		if (!Number.isFinite(value)) return false
		const v = clamp(Math.round(value), spec.min ?? 0, spec.max ?? value)
		if (key === "npo") this.npo = v
		else if (key === "vertical") this.vertical = v
		else if (key === "root") this.root = v
		else if (key === "lane") this.lane = v
		else if (key === "strumMs") this.strumMs = v
		else if (key === "tintOctave") this.tintOctave[this.front] = v
		else if (key === "tintJitterMs") this.tintJitterMs = v
		return true
	}

	private announce(ctx: PageContext) {
		ctx.osc.send(`/grid/out/page/${ctx.slotLabel}/type`, "iso-surface")
		this.emitSettings(ctx)
		this.emitTranspose(ctx)
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
			strum: this.strum,
			strumMs: this.strumMs,
			strumDir: this.strumDir,
			tintMode: this.tintMode[this.front],
			tintOctave: this.tintOctave[this.front],
			tintJitterMs: this.tintJitterMs,
			transposeChords: this.transposeChords,
			transposeLoops: this.transposeLoops,
			...Object.fromEntries(
				this.quant.map((v, i) => [`quant${i + 1}`, v === 0 ? "off" : String(v)]),
			),
		}
	}

	private emitSettings(ctx: PageContext) {
		// The PLAY page's rows follow this scale (core/sharedStore.ts).
		ctx.shared?.set(SCALE_SURFACE, { npo: this.npo, root: this.root, scale: this.scale })
		ctx.osc.send(`/grid/out/page/${ctx.slotLabel}/settings`, JSON.stringify(this.settings()))
	}
}

// Cheat-sheet looks, from render() at the defaults: the scale map of a block of keys.
const keyboardLit = (x0: number, w: number, h: number) =>
	Array.from({ length: h }, (_, y) =>
		Array.from({ length: w }, (_, i) => {
			const step = stepAt(x0 + i - KEYS_X0, y, 8, 5)
			return isRootOf(step, 0) ? LVL_ROOT : isInScale(step, 0, DEFAULT_SCALE) ? LVL_NORMAL : LVL_OUT
		}),
	).flat()
const pick = (n: number, cur: number, home: number) =>
	Array.from({ length: n }, (_, r) => (r === cur ? LVL_PANEL_CURRENT : r === home ? LVL_PANEL_DEFAULT : LVL_PANEL_OTHER))

/** The web cheat-sheet. Views are what cols 1-12 are showing: plain, transposer, or panel. */
export const keymap: KeySpec[] = [
	...SELECTOR_KEYS.filter((k) => k.y !== PANEL_TOGGLE_ROW && k.y !== TRANSPOSE_TOGGLE_ROW), // no left shifts on iso
	{ x: 0, y: PANEL_TOGGLE_ROW, name: "Menu: panel + lanes", short: "Menu", help: "One menu: the panel on cols 1-4 and, on the top row x5-x12, lanes 1-8 for the track in front. Tap: open, tap again: shut. Hold: open only while held. Dim-bright when a panel value is away from rest while shut. Hides the transposer.", lit: { panel: LVL_TR_TOGGLE_SHOWN, "*": LVL_TR_TOGGLE_IDLE } },
	{ x: 0, y: TRANSPOSE_TOGGLE_ROW, name: "Transposer", short: "Transp.", help: "Show the transposer on the bottom row. Dim-bright when a transposition is in force while hidden. Hides the panel.", lit: { transposer: LVL_TR_TOGGLE_SHOWN, "*": LVL_TR_TOGGLE_IDLE } },
	{ x: KEYS_X0, y: 0, w: KEYS_W - KEYS_X0, h: 8, view: "keyboard", name: "Keyboard", help: "Isomorphic: right = +1 step, up = +vertical (5). Home (step 0) is bottom-left.", lit: keyboardLit(KEYS_X0, KEYS_W - KEYS_X0, 8) },
	{ x: KEYS_X0, y: 0, w: KEYS_W - KEYS_X0, h: 7, view: "transposer", name: "Keyboard", help: "Plays as usual above the transposer row.", lit: keyboardLit(KEYS_X0, KEYS_W - KEYS_X0, 7) },
	{ x: KEYS_X0, y: 7, w: KEYS_W - KEYS_X0, view: "transposer", name: "Transpose −7…+4", short: "Transpose", help: "Col 8 = no transpose. A note keeps the transposition it started with. Loops record moves as gestures.", lit: Array.from({ length: KEYS_W - KEYS_X0 }, (_, i) => (i + KEYS_X0 === TRANSPOSE_ZERO_COL ? LVL_TR_CURRENT : LVL_TR_OTHER)) },
	{ x: PANEL_TINT_COL, y: 0, view: "panel", name: "Tintinnabuli", short: "Tint", help: "The front track's. Tap: T-voice on/off (T-voices shimmer on the keyboard, and start up to tintJitterMs late). Hold + press keys: add/remove the triad's pitch classes (lit while held). Each track has its own triad; all clear when npo changes.", lit: LVL_PANEL_OTHER },
	{ x: PANEL_TINT_COL, y: 1, h: 3, view: "panel", name: "Tint mode: above · below · alternate", short: "T mode", help: "The front track's: where each note's T-voice goes, nearest triad note above, below, or alternating.", lit: [11, 5, 6] },
	{ x: PANEL_TINT_COL, y: TINT_OCT_ROW_TOP, h: 3, view: "panel", name: "Tint octave +1 · 0 · −1", short: "T oct", help: "The front track's: moves only the T-voice by an octave, so it can sit away from the melody.", lit: pick(3, 1, 1) },
	{ x: PANEL_STRUM_COL, y: OCTAVE_ROW_TOP, h: 4, view: "panel", name: "Octave +2 · +1 · 0 · −1", short: "Octave", help: "The front track's octave (each track keeps its own). A ringing note keeps the octave it began in.", lit: pick(4, 2, 2) },
	{ x: PANEL_SPEED_COL, y: 0, h: ARP_RATES.length, view: "panel", name: "Arp speed 1/16 · 1/16T · 1/8 · 1/8T · 1/4 · 1/2 · 1/1", short: "Arp speed", help: "The app's arp RATE, fastest at the top. One setting for all tracks; lit from the app.", lit: pick(ARP_RATES.length, 2, -1) },
	{ x: PANEL_PROB_COL, y: 0, h: PROB_ROWS, view: "panel", name: "Arp probability 100% … 12.5%", short: "Arp prob", help: "The app's arp PROB, one setting for all tracks; lit from the app. A missed step waits: the due note plays on the next step.", lit: pick(PROB_ROWS, 0, 0) },
	{ x: PANEL_STRUM_COL, y: 0, view: "panel", name: "Strum", help: "All tracks. Spreads notes that start together (chord presets, loop chords, T-voices) strumMs apart. Spacing and direction in page settings.", lit: LVL_PANEL_OTHER },
	{ x: PICKER_X0, y: 0, w: PICKER_LANES, view: "panel", name: "Lanes 1–8", short: "Lanes", help: "Part of the menu: which idk.surface lanes the track in front plays. Bright = plays it, dim = does not. A press switches it. All dark = the app has not answered.", lit: Array.from({ length: PICKER_LANES }, () => LVL_PICK_OFF) },
	{ x: PANEL_X0 + PANEL_W, y: 1, w: KEYS_W - PANEL_X0 - PANEL_W, h: 7, view: "panel", name: "Keyboard", help: "Still playable beside the panel, below the lanes. While Tint is held, presses edit the triad instead.", lit: keyboardLit(PANEL_X0 + PANEL_W, KEYS_W - PANEL_X0 - PANEL_W, 8).slice(KEYS_W - PANEL_X0 - PANEL_W) },
	{ x: KEYS_W, y: 0, h: 8, name: "Chord presets", short: "Chords", help: "Press: play the saved chord on the track in front. With that track's LATCH lit by the LATCH key: save what it is ringing (same slot again lets it go). Shift 1 + press clears.", lit: [LVL_PRESET_FULL, LVL_PRESET_FULL, LVL_PRESET_EMPTY, LVL_PRESET_EMPTY, LVL_PRESET_EMPTY, LVL_PRESET_EMPTY, LVL_PRESET_EMPTY, LVL_PRESET_EMPTY] },
	{ x: KEYS_W + 1, y: 0, h: TRACK_ROWS, name: "Tracks 1–4", short: "Tracks", help: "Brings that track's layer to the front: presses, chords, ARP, LATCH, octave, tint and the lane picker act on it alone. The other tracks' notes, and loops, stay visible very dim.", lit: [LVL_TRACK_ON, 2, 3, 4] },
	{ x: KEYS_W + 1, y: ARP_ROW_START, h: ARP_KEYS, name: "Arp: up · down · up-down · urn", short: "Arp", help: "The app's ARP for the track in front, in that order; press the lit one to stop. The order is shared by all tracks. Medium = the app's order while this track's ARP is off.", lit: [1, 2, 3, 4] },
	{ x: KEYS_W + 2, y: 0, h: RECORDER_ROWS, name: "Loopers 1–4", help: "Arm, record from the first note, play, pause. Shift 1 + press clears. Each press is recorded with the track in front and played back there; one loop may span tracks. Records transposer, arp and panel moves too.", lit: [LVL_HELD, LVL_REC_STOPPED, LVL_REC_EMPTY, LVL_REC_EMPTY] },
	{ x: KEYS_W + 2, y: SUSTAIN_TOGGLE_ROW, name: "Latch", short: "Latch", help: "The app's LATCH for the track in front, lit from the app. Also arms the chord presets for saving. Off lets go of what it held.", lit: LVL_SHIFT },
	{ x: KEYS_W + 2, y: SUSTAIN_PEDAL_ROW, name: "Latch pedal", short: "Pedal", help: "LATCH on the track in front while held; double-tap to keep it. Does not arm chord saving.", lit: LVL_SHIFT },
	{ x: KEYS_W + 2, y: SHIFT2_ROW, name: "Shift 2", help: "Not used on this page.", lit: LVL_SHIFT_IDLE },
	{ x: KEYS_W + 2, y: SHIFT1_ROW, name: "Shift 1", help: "Hold + looper / chord: clear.", lit: LVL_SHIFT_IDLE },
]

export const page: PageModule = {
	name: "iso-surface",
	label: "Iso Surface",
	create: () => new IsoSurfacePage(),
	settings: SPECS,
	keymap,
}
