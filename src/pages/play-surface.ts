/* Page: Play Surface  (idk.surface's PLAY page)
 * ------------------------------------------------------------------------------
 * Spec    : idk.surface docs/specs/2026-11-11-grid-play-page-design.md.
 * Sheet   : docs/play-surface-cheatsheet.md, the player's cheatsheet. Change a key, a gesture,
 *           a light or a default here and change the sheet in the same commit.
 * Summary : Eight lanes side by side. A chooser picks what their columns mean: KEYS (play
 *           the lanes) or PRESETS (stored states of a lane's whole sound). It plays
 *           idk.surface DIRECTLY over its own OSC (ctx.surface, UDP 57150), not through
 *           Max's link. The spec's six parameter layers (chooser y1-y6, one dial per lane as
 *           a bar) were taken off on 2026-11-11 (Ian): those six keys are dark and do nothing.
 *
 *   x:  0    1  2    3  4 ........ 11  12   13 14  15
 *   y0  iso  .  KEYS .  lane 1 ... 8   all  .  .   loop 1
 *   y1  PLAY .  .    .                 all  .  .   loop 2
 *   y2  twst .  .    .                 all  .  .   loop 3
 *   y3  .    .  .    .                 all  .  .   loop 4
 *   y4  .    .  .    .                 all  .  .   PITCH
 *   y5  home .  .    .                 all  .  .   STRIKE
 *   y6  sh 2 .  .    .                 all  .  .   SLEW
 *   y7  sh 1 .  PRE  .                 all  .  ARP LATCH
 *
 * KEYS    : a press plays that lane; the row is the pitch, lowest at the bottom, in the
 *           scale iso-surface is set to. The key held is the note held. A REEL lane in
 *           SLICES takes the row as its pad number, 1 at the bottom. PITCH unlit: a press
 *           holds the lane on the note it already has (own/on, own/off) at the one fixed
 *           velocity; the row means nothing unless the `y` setting names a dial family
 *           (tone, time, force, move, place), which the row then sets as the lane's own. The
 *           field is EVEN (no root rows; Ian, 2026-11-11): only the cell last played is
 *           bright, fading with the lane's real level. PITCH unlit, every lane column is
 *           lit solid and equal: one trigger each. Any key held in a lane's column lights
 *           the whole column while it is down, and a latched note keeps it lit. No all column.
 * ARP     : x14 y7 (the spec's "free: arp later" spot, x15 y7, became LATCH, so the key sits
 *           beside it; Ian, 2026-11-11). ONE SWITCH WITH THE APP (Ian, 2026-11-13): the key is
 *           /surface/arp, the app's own ARP (its window button, the computer keys' C). A press
 *           sends the flipped value; the light, and whether held keys are calls or plain notes,
 *           follow the app's value (read every 250 ms while focused). No flag of this page's own.
 *           While lit, a KEYS press is a CALL in idk.surface's one
 *           arp, the app timing it (spec 2026-11-11-grid-arp-design.md): /surface/arp/call <id>
 *           <lane> note <key> <vel> (PITCH lit), own <vel> (PITCH unlit) or slice <n> (a REEL
 *           lane in slices), and its release sends /surface/arp/call/off <id>. id = row * 8 + lane,
 *           row 0 at the bottom (0-63), so rising id is UP. Held keys across lanes are one chord.
 *           LATCH keeps a call held after release (the same cell ends it; unlighting LATCH ends
 *           them); unlighting ARP ends every call this page holds and the notes sound direct
 *           again. LOOPERS still record the presses but play them back as plain direct notes.
 *           The call whose step sounds (/surface/arp/call/at) is the brightest cell.
 * LATCH   : while lit, a played note stays held after the key is let go; pressing the
 *           same cell again ends it (iso's "press a parked note to subtract it");
 *           unlighting LATCH ends every latched note. A loop records a latched note as a
 *           held one. Latched notes outlive a page switch, like iso's sustain.
 * PRESETS : a cell is a lane's WHOLE SOUND, seven rows per engine: every continuous dial
 *           the lane has pulled away from the shared one (V), made on screen or on the
 *           Twister (util/playDials.ts). A press recalls: those dials go to their stored
 *           values and every other one goes back to the shared dial (F). With STRIKE lit it
 *           strikes too. Shift 1 + cell stores what the lane is now. The BOTTOM ROW is
 *           HOME: the lane's dials all back to F, the unified instrument. With SLEW on,
 *           every move travels, the way home too (a dial glides to where the shared one
 *           stands, then hands itself back). All on a row
 *           does every lane's own row; shift 1 + all also strikes them.
 * SLEW    : a tap switches the glide on or off at the last time chosen; hold it and the
 *           all column offers eight times. Recalls and the way home
 *           travel at that time; the page sends the glide itself.
 * SHIFT 2 : while held, the lanes' bottom three rows are BOW, FREEZE and DAMP (damp held
 *           while pressed, the other two switch). Held `latchMs` with nothing pressed, it
 *           stays open; a tap closes it.
 * LOOPERS : four free-length loops of hand gestures (util/patternRecorder.ts): notes,
 *           strikes, recalls and the big three, on the lanes and the all column, whatever
 *           the chooser shows. Not chooser changes, shifts or stores.
 * Reads   : engine and mode per lane, the lanes' levels, the loaded patch's name. Polled
 *           with /surface/get while the page is focused; `lanes` and `preset` come by
 *           subscription. A store or a travelling recall asks for the lane's dials first.
 * Kept    : presets per surface patch name (the grid preset's own bank when no patch is
 *           loaded); loops and settings as iso keeps them. Restoring never makes a sound.
 * ------------------------------------------------------------------------------
 */

import {
	type Page,
	type PageContext,
	type KeyEvent,
	type LedFrame,
	type OscArg,
	makeFrame,
	ledIndex,
	float,
} from "../core/types.js"
import type { KeySpec, PageModule, SettingSpec } from "../core/pageModule.js"
import {
	SELECTOR_KEYS,
	selectorKey,
	shiftAt,
	shiftKey,
	releaseShifts,
	drawSelector,
	SHIFT2_ROW,
} from "../util/pageSelectorSurface.js"
import { PatternRecorder, MAX_RECORD_MS, type PatternEvent } from "../util/patternRecorder.js"
import { isRecord, num, int, bool, records } from "../util/restoreGuards.js"
import { SCALE_SURFACE } from "../core/sharedStore.js"
import { createOscSender } from "../io/osc.js"
import { SCALE_NAMES, DEFAULT_SCALE, isScaleName } from "../util/scales.js"
import {
	ENGINES,
	isEngine,
	laneAddr,
	ownerAddr,
	sharedAddr,
	partSuffix,
	partsFor,
	suffixesFor,
	type Engine,
	type Part,
} from "../util/playSlots.js"
import { dialsFor, partOfSuffix } from "../util/playDials.js"
import {
	BASE_READS,
	LANES,
	PRESET_TREM,
	ROWS,
	SurfaceMirror,
	levelLed,
	rowKey,
	rowVelocity,
	type PresetState,
} from "../util/playModel.js"

// --- Where things are ---------------------------------------------------------------
const CHOOSER_X = 2
const LANE_X0 = 4 // lanes 1-8 are columns x4-x11 on every surface page
const ALL_X = 12
const RIGHT_X = 15
const LOOPERS = 4
const PITCH_Y = 4
const STRIKE_Y = 5
const SLEW_Y = 6
const LATCH_Y = 7
const ARP_X = 14
const ARP_Y = 7
/** XEN CHORDS: a quiet toggle under KEYS. Lit, a lane column calls a chord of xen-harmony. */
const XEN_Y = 1
const LVL_XEN_OFF = 2
const LVL_XEN_ON = 10
/** xen-harmony's control port and its "jump to that chord" address (`uv run xen osc` there). */
const XEN_PORT = 57170
const XEN_GO = "/xen/go"
let xenOsc: { send: (path: string, ...args: any[]) => void } | null = null
/** One send-only socket for the daemon's life, opened at the first chord. */
const sendXenChord = (chord: number) => (xenOsc ??= createOscSender(XEN_PORT)).send(XEN_GO, chord)

/** Chooser rows: 0 KEYS, 7 PRESETS. Rows 1-6 held the six parameter layers; now dark. */
export const LAYER_KEYS = 0
export const LAYER_PRESETS = 7
/** On PRESETS the bottom row is HOME: every dial of the lane back to the shared one. */
export const HOME_ROW = 7

/** Shift 2's rows on the lanes. */
const BOW_Y = 5
const FREEZE_Y = 6
const DAMP_Y = 7

/** SLEW's eight times in seconds, bottom of the all column first. */
export const SLEW_TIMES = [0, 0.1, 0.25, 0.5, 1, 2, 4, 8] as const

// --- Levels -------------------------------------------------------------------------
const LVL_CHOOSER = 5
const LVL_CHOOSER_ON = 15
const LVL_KEY_BASE = 2 // the even field: every cell of a lane the same
const LVL_KEY_TRIGGER = 6 // PITCH unlit: the lane's column is one trigger, lit solid
const LVL_KEY_PLAYED = 5 // the floor the last-played cell fades to
const LVL_KEY_COLUMN = 10 // a key is down in this column
const LVL_KEY_HELD = 15
const LVL_KEY_LATCHED = 12
const LVL_KEY_ARP_HELD = 9 // ARP lit: a call held, until its step sounds (then LVL_KEY_HELD)
const LVL_ALL = 2 // clearly dimmer than the lanes
const LVL_PRE_EMPTY = 1
const LVL_PRE_STORED = 5
const LVL_PRE_CURRENT = 15
const LVL_SW_OFF = 5 // readable at rest
const LVL_SW_ON = 12
const LVL_SW_HELD = 15
const LVL_SLEW_OTHER = 4
const LVL_REC_EMPTY = 2
const LVL_REC_ARMED = 12
const LVL_REC_STOPPED = 6
const LVL_REC_PLAYING = 15
const BLINK_MS = 220

// --- Time ---------------------------------------------------------------------------
const TIMER_MS = 10
const GLIDE_SEND_MS = 30 // how often a travelling level is sent…
const GLIDE_MAX_PER_S = 600 // …slower when many travel at once, so surface is never flooded
const FAST_POLL_MS = 250 // the big three, while they are open
const SLOW_POLL_MS = 2000 // everything else
const SUBSCRIBE_MS = 3000 // a subscription is a lease: 10 s without renewal and it lapses
const LINK_LOST_MS = 5000
const SLEW_TAP_MS = 350 // SLEW let go sooner than this, with no time picked, is a tap
const READ_WAIT_MS = 150 // a store or a travelling recall asks surface first, then acts
const MAX_PATTERN_EVENTS = 20_000
const MAX_PATCHES = 64

// --- What a loop records --------------------------------------------------------------
// Held notes and held damp are NOTES in the recorder (a set of things sounding); everything
// else is a control event, named so playback acts on the same lane whatever the chooser
// shows.
const NOTE_LANE = 512 // note step = lane * 512 + (pad ? 256 : 0) + key
const NOTE_PAD = 256
/** PITCH unlit: the lane held on its OWN note. Step = lane * 512 + 128 + row (what `y` sets). */
const NOTE_OWN = 128
const ownStep = (lane: number, row: number) => lane * NOTE_LANE + NOTE_OWN + row
const isOwn = (step: number) => step < DAMP_STEP && (step & NOTE_PAD) === 0 && (step & NOTE_OWN) !== 0
const DAMP_STEP = 8192 // damp step = DAMP_STEP + lane
const noteStep = (lane: number, key: number, pad: boolean) => lane * NOTE_LANE + (pad ? NOTE_PAD : 0) + key
const CTL_RE = /^(rec)\/([0-7]|all)$|^(strike|bow|frz)\/([0-7])$/
/** The largest value a control event carries (a recall's row, plus 8 when it strikes). */
const CTL_MAX = 15

/** The arp's id for the cell at `row` (0 at the bottom) of `lane` (0-7): rising id = up. */
export const arpId = (row: number, lane: number) => row * LANES + lane

/** One held call in surface's arp: the lane (0-7) and what its step plays. */
interface ArpCall { lane: number; row: number; kind: "note" | "own" | "slice"; key: number }
const AT_ADDR = "/surface/arp/call/at"
/** The app's one ARP switch: its window button, the computer keys' C, and this page's key. */
const ARP_ADDR = "/surface/arp"

/** The dial families height can set with PITCH unlit: the slot table's first five, in order. */
const Y_FAMILIES = ["tone", "time", "force", "move", "place"]

const SPECS: SettingSpec[] = [
	{ key: "velocity", label: "note velocity", type: "number", min: 0.05, max: 1, step: 0.05, default: 0.8, help: "How hard a KEYS note and a preset's strike play." },
	{ key: "followIso", label: "rows follow iso", type: "toggle", default: true, help: "Take the scale, root and tuning size from iso-surface." },
	{ key: "npo", label: "notes / octave", type: "number", min: 1, max: 48, step: 1, default: 12 },
	{ key: "root", label: "root (semitone)", type: "number", min: 0, max: 11, step: 1, default: 0 },
	{ key: "scale", label: "scale", type: "enum", options: SCALE_NAMES, default: DEFAULT_SCALE },
	{ key: "base", label: "bottom row (step)", type: "number", min: 0, max: 84, step: 1, default: 24, help: "Where the bottom row sits: 24 is the octave of middle C." },
	{ key: "slew", label: "slew (s)", type: "enum", options: SLEW_TIMES.map(String), default: "0" },
	{ key: "slewTime", label: "slew time a tap switches on (s)", type: "enum", options: SLEW_TIMES.slice(1).map(String), default: "1" },
	{ key: "latchMs", label: "shift 2 stays open after (ms)", type: "number", min: 200, max: 3000, step: 50, default: 1000 },
	{ key: "pitch", label: "PITCH: presses set the note", type: "toggle", default: true },
	{ key: "y", label: "PITCH off: height sets", type: "enum", options: ["off", ...Y_FAMILIES], default: "off", help: "With PITCH unlit, what the row of a press sets on the lane before it plays: nothing, or that family's dial for the lane's engine (as the lane's own). One choice for all eight lanes." },
	{ key: "strike", label: "STRIKE: a recall also strikes", type: "toggle", default: true },
]
const SPEC_BY_KEY = new Map(SPECS.map((s) => [s.key, s]))

type Bank = Partial<Record<Engine, Array<PresetState | null>>>
interface Glide {
	from: number
	to: number
	t0: number
	durMs: number
	/** Run once it has arrived (a dial travelling home hands itself back to the shared one). */
	after?: () => void
}

export class PlaySurfacePage implements Page {
	private ctx: PageContext | null = null
	private mirror = new SurfaceMirror()
	private unlisten: (() => void) | null = null
	private unshare: (() => void) | null = null
	private focused = false

	private layer = LAYER_KEYS
	private settings: Record<string, number | boolean | string> = Object.fromEntries(SPECS.map((s) => [s.key, s.default]))
	/** The scale iso-surface last published, if any. */
	private isoScale: { npo: number; root: number; scale: string } | null = null

	// Hands.
	/** Cell index → the note step it holds. */
	private held = new Map<number, number>()
	/** LATCH: runtime only, never saved. Cell index → the note step it keeps holding. */
	private latch = false
	private latched = new Map<number, number>()
	/** ARP is the APP's switch (/surface/arp), never a flag of this page: lit, held cells are calls in the app's arp. */
	private get arp() {
		return (this.mirror.num(ARP_ADDR) ?? 0) !== 0
	}
	/** XEN CHORDS toggle (not saved) and the chord last sent, 1-8 (0 = none yet). */
	private xenChords = false
	private xenLast = 0

	constructor(private xenGo: (chord: number) => void = sendXenChord) {}
	/** The calls surface was last told, id → signature, so only changes go out. */
	private callsSent = new Map<number, string>()
	/** Cells whose press ended a latched note: their release does nothing. */
	private ending = new Set<number>()
	private dampHeld = new Set<number>()
	private dampAllHeld = false
	/** The hand's notes as last tapped into the loops, so they see its changes only. */
	private handNotes = new Set<number>()
	private handDampLast = new Array<boolean>(LANES).fill(false)
	private slewHeld = false
	private slewDownAt = 0
	private slewPicked = false
	/** Shift 2: when it went down, whether anything was pressed under it, and the latch. */
	private shift2DownAt = 0
	private shift2Used = false
	private shift2WasLatched = false
	private shift2Latched = false

	// What surface was last told, so only changes go out.
	private notesSent = new Set<number>()
	private dampSent = new Array<boolean>(LANES).fill(false)

	// Display memory.
	private lastRow = new Array<number>(LANES).fill(-1)
	private currentPreset = new Array<number>(LANES).fill(-1)

	/** Patch name → engine → eight states. "" is the bank used when no surface patch is loaded. */
	private presets: Record<string, Bank> = {}
	private glides = new Map<string, Glide>()
	/** Things waiting for surface's answers (a store, a travelling recall). */
	private pending: Array<{ at: number; run: () => void }> = []
	private recorders = Array.from({ length: LOOPERS }, () => new PatternRecorder())

	private timer: ReturnType<typeof setInterval> | null = null
	private lastTickMs = 0
	private lastGlideMs = 0
	private lastFastMs = 0
	private lastSlowMs = 0
	private lastSubMs = 0

	// ---------------------------------------------------------------- lifecycle

	init(ctx: PageContext) {
		this.ctx = ctx
		this.unlisten =
			ctx.surface?.on((path, args) => {
				const arp = this.arp
				if (this.mirror.feed(path, args, Date.now())) ctx.setDirty()
				// ARP flipped in the app: what the hands hold changes between calls and plain notes.
				if (this.arp !== arp) this.commit(ctx)
			}) ?? null
		const take = (v: unknown) => {
			this.isoScale =
				isRecord(v) && isScaleName(v.scale)
					? { npo: int(v.npo, 12, 1, 48), root: int(v.root, 0, 0, 11), scale: v.scale }
					: null
		}
		take(ctx.shared?.get(SCALE_SURFACE))
		this.unshare = ctx.shared?.subscribe(SCALE_SURFACE, take) ?? null
		this.announce(ctx)
	}

	onFocus(ctx: PageContext) {
		this.focused = true
		// Ask at once, so the page is in step by the time the eye has found it.
		this.lastFastMs = this.lastSlowMs = this.lastSubMs = 0
		this.announce(ctx)
		this.syncTimer()
	}

	onBlur(ctx: PageContext) {
		this.focused = false
		// Your hands let go; the loops and the latched notes keep playing.
		this.held.clear()
		this.ending.clear()
		this.dampHeld.clear()
		this.dampAllHeld = false
		this.slewHeld = false
		this.shift2Latched = false
		this.commit(ctx)
		releaseShifts(ctx)
		this.syncTimer()
	}

	dispose(ctx: PageContext) {
		for (const r of this.recorders) r.clear()
		this.pending = []
		this.latched.clear()
		this.glides.clear()
		this.onBlur(ctx)
		this.unlisten?.()
		this.unshare?.()
		this.unlisten = this.unshare = null
		this.syncTimer()
	}

	// ---------------------------------------------------------------- keys

	onKey(ev: KeyEvent, ctx: PageContext) {
		if (selectorKey(ev, ctx)) return
		if (shiftAt(ev) === 2) this.shift2Key(ev.s === 1)
		if (shiftKey(ev, ctx)) return
		const down = ev.s === 1
		if (ev.x === CHOOSER_X) {
			if (down && (ev.y === LAYER_KEYS || ev.y === LAYER_PRESETS)) this.layer = ev.y
			else if (down && ev.y === XEN_Y) this.xenChords = !this.xenChords
			return
		}
		if (ev.x === RIGHT_X) return this.rightKey(ev.y, down, ctx)
		if (ev.x === ARP_X && ev.y === ARP_Y) {
			if (down) {
				// Flip the app's switch; taken at once here, and the app's own value has the last word.
				const on = this.arp ? 0 : 1
				this.send(ctx, ARP_ADDR, on)
				this.mirror.set(ARP_ADDR, on)
				this.commit(ctx)
			}
			return
		}

		const lane = ev.x - LANE_X0
		const isAll = ev.x === ALL_X
		if (!isAll && (lane < 0 || lane >= LANES)) return

		// SLEW held: the all column is the eight times.
		if (this.slewHeld && isAll) {
			if (down) {
				this.slewPicked = true
				this.setSlew(SLEW_TIMES[ROWS - 1 - ev.y], ctx)
			}
			return
		}
		// A release always lets go of what its press took, whatever the layer is by now.
		if (!down) {
			const i = ledIndex(ctx.size, ev.x, ev.y)
			if (this.ending.delete(i)) return
			const step = this.held.get(i)
			if (step !== undefined) {
				this.held.delete(i)
				if (this.latch) this.latched.set(i, step)
				return this.commit(ctx)
			}
			if (ev.y === DAMP_Y && (isAll ? this.dampAllHeld : this.dampHeld.has(lane))) {
				if (isAll) this.dampAllHeld = false
				else this.dampHeld.delete(lane)
				return this.commit(ctx)
			}
			return
		}
		if (this.bigThreeOpen(ctx) && ev.y >= BOW_Y) {
			this.shift2Used = true
			return this.bigThreeKey(ev.y, isAll ? -1 : lane, ctx)
		}
		const row = ROWS - 1 - ev.y // 0 at the bottom
		if (this.layer === LAYER_KEYS) {
			if (isAll) return
			// XEN CHORDS lit: the column calls chord 1-8 of xen-harmony, once per press; no note.
			if (this.xenChords) {
				this.xenLast = lane + 1
				return this.xenGo(this.xenLast)
			}
			this.playKey(ev, lane, row, ctx)
			return
		}
		this.presetKey(isAll ? -1 : lane, ev.y, ctx)
	}

	/** Shift 2's own timing: held long with nothing pressed, the big three stay open. */
	private shift2Key(down: boolean) {
		const now = Date.now()
		if (down) {
			this.shift2DownAt = now
			this.shift2Used = false
			this.shift2WasLatched = this.shift2Latched
			return
		}
		if (this.shift2WasLatched) this.shift2Latched = false // a tap closes it
		else if (!this.shift2Used && now - this.shift2DownAt >= Number(this.settings.latchMs)) this.shift2Latched = true
	}

	private bigThreeOpen(ctx: PageContext): boolean {
		return this.shift2Latched || ctx.modifiers.shift2
	}

	private rightKey(y: number, down: boolean, ctx: PageContext) {
		if (y === SLEW_Y) {
			const now = Date.now()
			// A tap is the switch: on at the last time chosen, or off. A hold shows the times.
			if (!down && this.slewHeld && !this.slewPicked && now - this.slewDownAt < SLEW_TAP_MS)
				this.setSlew(Number(this.settings.slew) > 0 ? 0 : Number(this.settings.slewTime), ctx)
			if (down) {
				this.slewDownAt = now
				this.slewPicked = false
			}
			this.slewHeld = down
			return
		}
		if (!down) return
		if (y < LOOPERS) {
			const r = this.recorders[y]
			if (ctx.modifiers.shift1) r.clear()
			else r.press(Date.now())
			this.commit(ctx) // a stopped or cleared loop lets go of what it held
			this.emitPatterns(ctx)
			this.syncTimer()
		} else if (y === LATCH_Y) {
			this.latch = !this.latch
			// Unlighting it ends every latched note.
			if (!this.latch) this.latched.clear()
			this.commit(ctx)
		} else if (y === PITCH_Y) this.setSetting("pitch", !this.settings.pitch, ctx)
		else if (y === STRIKE_Y) this.setSetting("strike", !this.settings.strike, ctx)
	}

	/** Set the glide time; a time above zero is also what the next tap switches back on. */
	private setSlew(seconds: number, ctx: PageContext) {
		if (seconds > 0) this.setSetting("slewTime", String(seconds), ctx)
		this.setSetting("slew", String(seconds), ctx)
	}

	/** KEYS: a held note, a pad, or (PITCH unlit) a strike on the lane's own note. */
	private playKey(ev: KeyEvent, lane: number, row: number, ctx: PageContext) {
		const i = ledIndex(ctx.size, ev.x, ev.y)
		// A latched cell pressed again ends its note rather than playing another.
		if (this.latched.delete(i)) {
			this.ending.add(i)
			return this.commit(ctx)
		}
		this.lastRow[lane] = row
		const pad = this.mirror.slices(lane)
		if (!pad && !this.settings.pitch) {
			// Held like any note, so LATCH keeps it and letting go ends it (a bowed lane too).
			this.held.set(i, ownStep(lane, row))
			return this.commit(ctx)
		}
		const key = pad ? Math.min(127, this.mirror.sliceRoot(lane) + row) : rowKey(row, this.rowScale())
		this.held.set(i, noteStep(lane, key, pad))
		this.commit(ctx)
	}

	private presetKey(lane: number, y: number, ctx: PageContext) {
		const shift = ctx.modifiers.shift1
		// A store is never recorded. HOME holds nothing to store: shift there is just home.
		if (lane >= 0 && shift && y !== HOME_ROW) return this.store(lane, y, ctx)
		// All: every lane to its own engine's row; with shift 1 it strikes them all too.
		const strike = lane < 0 ? shift || !!this.settings.strike : !!this.settings.strike
		this.tap(`rec/${lane < 0 ? "all" : lane}`, y + (strike ? ROWS : 0))
		this.recallLanes(lane < 0 ? [...Array(LANES).keys()] : [lane], y, strike, ctx)
	}

	private bigThreeKey(y: number, lane: number, ctx: PageContext) {
		if (y === DAMP_Y) {
			if (lane < 0) this.dampAllHeld = true
			else this.dampHeld.add(lane)
			return this.commit(ctx)
		}
		const key = y === BOW_Y ? "arm" : "freeze"
		const id = y === BOW_Y ? "bow" : "frz"
		const lanes = lane < 0 ? [...Array(LANES).keys()] : [lane]
		// All: everything on unless everything already is, then everything off.
		const next = lane < 0 ? !lanes.every((l) => this.mirror.flag(l, key)) : !this.mirror.flag(lane, key)
		for (const l of lanes) {
			this.tap(`${id}/${l}`, next ? 1 : 0)
			this.setFlag(l, key, next, ctx)
		}
	}

	// ---------------------------------------------------------------- what a gesture does
	// These are shared by the hand and by loop playback: a loop never taps another loop.

	private send(ctx: PageContext, path: string, ...args: OscArg[]) {
		ctx.surface?.send(path, ...args)
	}

	/** Record a hand gesture into every armed loop. */
	private tap(id: string, value: number) {
		const now = Date.now()
		for (const r of this.recorders) r.recordControl(id, value, now)
		if (this.recorders.some((r) => r.state === "recording")) this.syncTimer()
	}

	/** One address of a lane to a value, as the lane's own, travelling at SLEW. */
	private setPart(lane: number, p: Part, to: number, ctx: PageContext) {
		const addr = laneAddr(lane + 1, p)
		const from = this.mirror.effective(lane, p)
		if (!this.mirror.owned(lane, p)) {
			// Start the lane's own dial where the shared one is, so taking it over is silent.
			if (from !== undefined) {
				this.send(ctx, addr, float(from))
				this.mirror.set(addr, from)
			}
			this.send(ctx, ownerAddr(lane + 1, p), "voice")
			this.mirror.set(ownerAddr(lane + 1, p), "voice")
		}
		const durMs = Number(this.settings.slew) * 1000
		if (durMs <= 0 || from === undefined || from === to) {
			this.glides.delete(addr)
			this.send(ctx, addr, float(to))
			this.mirror.set(addr, to)
			return
		}
		this.glides.set(addr, { from, to, t0: Date.now(), durMs })
		this.syncTimer()
	}

	/**
	 * One dial of a lane back to the shared one. With SLEW on it TRAVELS there: the lane's
	 * own dial glides to where the shared one stands and only then hands itself back, so a
	 * way home is as smooth as a way out.
	 */
	private sendHome(lane: number, p: Part, ctx: PageContext) {
		const addr = laneAddr(lane + 1, p)
		const owner = ownerAddr(lane + 1, p)
		const follow = () => {
			this.send(ctx, owner, "follow")
			this.mirror.set(owner, "follow")
		}
		const known = this.mirror.str(owner)
		const from = this.mirror.num(addr)
		const to = this.mirror.num(sharedAddr(p))
		const durMs = Number(this.settings.slew) * 1000
		if (known === "voice" && durMs > 0 && from !== undefined && to !== undefined && from !== to) {
			this.glides.set(addr, { from, to, t0: Date.now(), durMs, after: follow })
			this.syncTimer()
			return
		}
		this.glides.delete(addr)
		if (known !== "follow") follow()
	}

	/**
	 * PITCH unlit with `y` chosen: the row sets that family's dial on the lane, as the lane's
	 * own (V), at once and before the note. An engine with no dial there just plays. HOME or
	 * a recall hands the dial back like any other.
	 */
	private setY(lane: number, row: number, ctx: PageContext) {
		const slot = Y_FAMILIES.indexOf(String(this.settings.y))
		if (slot < 0) return
		for (const p of partsFor(this.mirror.engine(lane), slot)) {
			const addr = laneAddr(lane + 1, p)
			const owner = ownerAddr(lane + 1, p)
			const v = (row / (ROWS - 1)) * p.scale
			this.glides.delete(addr)
			// The value first, so taking the dial over never sounds the lane's stale one.
			this.send(ctx, addr, float(v))
			this.mirror.set(addr, v)
			if (this.mirror.str(owner) !== "voice") {
				this.send(ctx, owner, "voice")
				this.mirror.set(owner, "voice")
			}
			this.currentPreset[lane] = -1
		}
	}

	private setFlag(lane: number, key: "arm" | "freeze" | "trem", on: boolean, ctx: PageContext) {
		const addr = `/surface/lane/${lane + 1}/${key}`
		if (this.mirror.num(addr) === (on ? 1 : 0)) return
		this.send(ctx, addr, on ? 1 : 0)
		this.mirror.set(addr, on ? 1 : 0)
	}

	/** Strike a lane on the note it already has. */
	private strikeOwn(lane: number, velocity: number, ctx: PageContext) {
		this.send(ctx, `/surface/lane/${lane + 1}/strike/own`, float(velocity))
	}

	private bank(): Bank {
		return (this.presets[this.mirror.patch()] ??= {})
	}

	private stored(lane: number, row: number): PresetState | null {
		const e = this.mirror.engine(lane)
		return (isEngine(e) && row !== HOME_ROW && this.bank()[e]?.[row]) || null
	}

	/**
	 * Ask surface where these lanes' dials stand (value, owner, the shared dial), then run.
	 * The page does not keep the dials in step while idle; a preset is every dial.
	 */
	private readThen(lanes: number[], ctx: PageContext, run: () => void) {
		const link = ctx.surface
		const asked = new Set<string>()
		const get = (addr: string) => {
			if (asked.has(addr)) return
			asked.add(addr)
			link?.send("/surface/get", addr)
		}
		for (const lane of lanes) {
			const e = this.mirror.engine(lane)
			if (!isEngine(e)) continue
			// One question per lane fetches every dial's 0-1 value (under surface's 64 a reply).
			get(`/surface/lane/${lane + 1}/${e}/*/norm`)
			get(`/surface/lane/${lane + 1}/tremolo/*/norm`)
			// The shared dials one by one: an engine has more than 64 of them with a 0-1 twin.
			for (const p of dialsFor(e)) {
				get(sharedAddr(p))
				get(ownerAddr("*", p))
			}
		}
		get("/surface/lane/*/trem")
		this.pending.push({ at: Date.now() + READ_WAIT_MS, run })
		this.syncTimer()
	}

	/** Store what the lane is now: every dial it has pulled away, and its TREM switch. */
	private store(lane: number, row: number, ctx: PageContext) {
		const e = this.mirror.engine(lane)
		if (!isEngine(e)) return
		const patch = this.mirror.patch()
		this.readThen([lane], ctx, () => {
			const state: PresetState = {}
			for (const p of dialsFor(e)) {
				if (!this.mirror.owned(lane, p)) continue
				const v = this.mirror.num(laneAddr(lane + 1, p))
				if (v !== undefined) state[partSuffix(p)] = v
			}
			state[PRESET_TREM] = this.mirror.flag(lane, "trem") ? 1 : 0
			const rows = ((this.presets[patch] ??= {})[e] ??= new Array(ROWS).fill(null))
			rows[row] = state
			this.currentPreset[lane] = row
			ctx.persist({ presets: this.presets })
			ctx.setDirty()
		})
	}

	/** Recall a row on some lanes. With SLEW on, surface is asked first so the travel starts from the truth. */
	private recallLanes(lanes: number[], row: number, strike: boolean, ctx: PageContext) {
		const go = () => { for (const l of lanes) this.recall(l, row, strike, ctx) }
		if (Number(this.settings.slew) > 0 && lanes.some((l) => row === HOME_ROW || this.stored(l, row))) this.readThen(lanes, ctx, go)
		else go()
	}

	private recall(lane: number, row: number, strike: boolean, ctx: PageContext) {
		const state = this.stored(lane, row)
		if (state || row === HOME_ROW) {
			const e = this.mirror.engine(lane)
			const kept = new Set<string>()
			for (const [suffix, v] of Object.entries(state ?? {})) {
				const p = suffix === PRESET_TREM ? null : partOfSuffix(suffix)
				if (!p) continue
				kept.add(`${p.dial.scope}/${p.dial.key}`)
				this.setPart(lane, p, v, ctx)
			}
			// Everything the preset does not hold goes back to the shared dial.
			for (const p of dialsFor(e)) {
				if (kept.has(`${p.dial.scope}/${p.dial.key}`)) continue
				this.sendHome(lane, p, ctx)
			}
			if (state?.[PRESET_TREM] !== undefined) this.setFlag(lane, "trem", state[PRESET_TREM] !== 0, ctx)
			if (isEngine(e)) this.currentPreset[lane] = row
		}
		// An empty cell changes nothing, but a strike is still a strike.
		if (strike) this.strikeOwn(lane, Number(this.settings.velocity), ctx)
	}

	/** A control event played back by a loop. */
	private replay(id: string, value: number, ctx: PageContext) {
		const m = CTL_RE.exec(id)
		if (!m) return
		const kind = m[1] ?? m[3]
		const who = m[2] ?? m[4]
		const lane = who === "all" ? -1 : Number(who)
		if (kind === "rec") this.recallLanes(lane < 0 ? [...Array(LANES).keys()] : [lane], value % ROWS, value >= ROWS, ctx)
		else if (kind === "strike") this.strikeOwn(lane, rowVelocity(value), ctx)
		else if (kind === "bow") this.setFlag(lane, "arm", value !== 0, ctx)
		else if (kind === "frz") this.setFlag(lane, "freeze", value !== 0, ctx)
	}

	// ---------------------------------------------------------------- notes and damp out

	private handDamp(lane: number): boolean {
		return this.dampAllHeld || this.dampHeld.has(lane)
	}

	/**
	 * Reconcile what should sound against what surface was last told. A note sounds while a
	 * hand OR a playing loop holds it, and stops when the last of them lets go. The hand's
	 * own changes are tapped into armed loops first; a loop's are not.
	 */
	private commit(ctx: PageContext) {
		const now = Date.now()
		const hand = new Set([...this.held.values(), ...this.latched.values()])
		for (const step of hand) if (!this.handNotes.has(step)) for (const r of this.recorders) r.record(step, true, now)
		for (const step of this.handNotes) if (!hand.has(step)) for (const r of this.recorders) r.record(step, false, now)
		this.handNotes = hand
		for (let l = 0; l < LANES; l++) {
			const d = this.handDamp(l)
			if (d === this.handDampLast[l]) continue
			this.handDampLast[l] = d
			for (const r of this.recorders) r.record(DAMP_STEP + l, d, now)
		}
		if (this.recorders.some((r) => r.state === "recording")) this.syncTimer()

		// ARP lit: the hand's keys are calls in the app's arp; only a loop sounds direct.
		const want = new Set(this.arp ? [] : hand)
		this.callsOut(this.arp ? this.arpCalls(ctx) : new Map(), ctx)
		const damp = Array.from({ length: LANES }, (_, l) => this.handDamp(l))
		for (const r of this.recorders)
			for (const step of r.sounding) {
				if (step >= DAMP_STEP) damp[step - DAMP_STEP] = true
				else want.add(step)
			}
		for (const step of this.notesSent) {
			if (want.has(step)) continue
			// A lane has one own note: it is let go only when nothing holds the lane on it.
			if (isOwn(step) && [...want].some((w) => isOwn(w) && Math.floor(w / NOTE_LANE) === Math.floor(step / NOTE_LANE))) continue
			this.noteOut(step, false, ctx)
		}
		for (const step of want) if (!this.notesSent.has(step)) this.noteOut(step, true, ctx)
		this.notesSent = want
		for (let l = 0; l < LANES; l++) {
			if (damp[l] === this.dampSent[l]) continue
			this.dampSent[l] = damp[l]
			this.send(ctx, `/surface/lane/${l + 1}/damp`, damp[l] ? 1 : 0)
		}
		ctx.setDirty()
	}
	/** What the hand holds, as the arp's calls: held and latched cells, by id. */
	private arpCalls(ctx: PageContext): Map<number, ArpCall> {
		const calls = new Map<number, ArpCall>()
		for (const m of [this.held, this.latched]) {
			for (const [i, step] of m) {
				const lane = Math.floor(step / NOTE_LANE)
				const row = ROWS - 1 - Math.floor(i / ctx.size.width)
				const kind = isOwn(step) ? "own" : (step & NOTE_PAD) !== 0 ? "slice" : "note"
				calls.set(arpId(row, lane), { lane, row, kind, key: step & 127 })
			}
		}
		return calls
	}

	/** Reconcile the calls against what surface was last told: new or changed ones go, gone ones leave. */
	private callsOut(want: Map<number, ArpCall>, ctx: PageContext) {
		for (const id of [...this.callsSent.keys()]) {
			if (want.has(id)) continue
			this.callsSent.delete(id)
			this.send(ctx, "/surface/arp/call/off", id)
		}
		for (const [id, c] of want) {
			const sig = `${c.lane}/${c.kind}/${c.kind === "note" ? c.key : c.row}`
			if (this.callsSent.get(id) === sig) continue
			this.callsSent.set(id, sig)
			const n = c.lane + 1
			const vel = float(Number(this.settings.velocity))
			if (c.kind === "own") {
				// Height sets the chosen dial (or nothing), as for a direct own note.
				this.setY(c.lane, c.row, ctx)
				this.send(ctx, "/surface/arp/call", id, n, "own", vel)
			} else if (c.kind === "slice") this.send(ctx, "/surface/arp/call", id, n, "slice", c.row + 1)
			else this.send(ctx, "/surface/arp/call", id, n, "note", c.key, vel)
			this.lastRow[c.lane] = c.row
		}
	}

	private noteOut(step: number, on: boolean, ctx: PageContext) {
		const lane = Math.floor(step / NOTE_LANE)
		const pad = (step & NOTE_PAD) !== 0
		const key = step & 127
		const n = lane + 1
		if (isOwn(step)) {
			if (!on) return this.send(ctx, `/surface/lane/${n}/own/off`)
			// Height is not how hard (Ian, 2026-11-11): it sets the chosen dial, or nothing.
			this.setY(lane, step & 7, ctx)
			this.send(ctx, `/surface/lane/${n}/own/on`, float(Number(this.settings.velocity)))
			this.lastRow[lane] = step & 7
			return
		}
		if (!on) return this.send(ctx, `/surface/lane/${n}/note/off`, key)
		// A lane that keeps its own note (V) ignores the pitch of a note sent to it, so the
		// row would not set it: move its own note first. Pads never touch it.
		if (!pad && this.mirror.ownNote(lane)) this.send(ctx, `/surface/lane/${n}/modal/voiceNote`, float(key))
		this.send(ctx, `/surface/lane/${n}/note/on`, key, float(Number(this.settings.velocity)))
		if (!pad) this.lastRowFromKey(lane, key)
	}

	/** A loop's note lights the row it was played on, when that row still means that key. */
	private lastRowFromKey(lane: number, key: number) {
		const s = this.rowScale()
		for (let row = 0; row < ROWS; row++) if (rowKey(row, s) === key) this.lastRow[lane] = row
	}

	private rowScale() {
		const own = { npo: Number(this.settings.npo), root: Number(this.settings.root), scale: String(this.settings.scale) }
		return { ...(this.settings.followIso && this.isoScale ? this.isoScale : own), base: Number(this.settings.base) }
	}

	// ---------------------------------------------------------------- time

	private syncTimer() {
		const needed = this.focused || this.glides.size > 0 || this.pending.length > 0 || this.recorders.some((r) => r.isRunning)
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
		const now = Date.now()
		const dt = now - this.lastTickMs
		this.lastTickMs = now

		if (this.recorders.some((r) => r.isRunning)) {
			const before = this.recorders.map((r) => r.state)
			for (const r of this.recorders) {
				r.advance(now, dt)
				for (const [id, value] of r.takeControls()) this.replay(id, value, ctx)
			}
			this.commit(ctx)
			if (this.recorders.some((r, i) => r.state !== before[i])) this.emitPatterns(ctx)
		}
		if (this.pending.length) {
			const due = this.pending.filter((p) => p.at <= now)
			this.pending = this.pending.filter((p) => p.at > now)
			for (const p of due) p.run()
		}
		const glideMs = Math.max(GLIDE_SEND_MS, Math.ceil((this.glides.size * 1000) / GLIDE_MAX_PER_S))
		if (this.glides.size && now - this.lastGlideMs >= glideMs) {
			this.lastGlideMs = now
			this.stepGlides(now, ctx)
		}
		if (this.focused) this.poll(now, ctx)
		this.syncTimer()
	}

	private stepGlides(now: number, ctx: PageContext) {
		for (const [addr, g] of this.glides) {
			const t = Math.min(1, (now - g.t0) / g.durMs)
			const v = g.from + (g.to - g.from) * t
			this.send(ctx, addr, float(v))
			this.mirror.set(addr, v)
			if (t >= 1) {
				this.glides.delete(addr)
				g.after?.()
			}
		}
		ctx.setDirty()
	}

	/** Keep the mirror in step with surface: engines and modes slowly, the big three often while open. */
	private poll(now: number, ctx: PageContext) {
		const link = ctx.surface
		if (!link) return
		const get = (addr: string) => link.send("/surface/get", addr)
		if (now - this.lastSubMs >= SUBSCRIBE_MS) {
			this.lastSubMs = now
			link.send("/surface/subscribe", "127.0.0.1", link.port, "lanes")
			link.send("/surface/subscribe", "127.0.0.1", link.port, "preset")
			// Which call's step sounds, to light it (a pattern topic, only while ARP is lit).
			if (this.arp) link.send("/surface/subscribe", "127.0.0.1", link.port, "/surface/arp/call/*")
		}
		if (now - this.lastSlowMs >= SLOW_POLL_MS) {
			this.lastSlowMs = now
			for (const a of BASE_READS) get(a)
			get(ARP_ADDR)
		}
		if (now - this.lastFastMs >= FAST_POLL_MS && now - this.mirror.heardAt < LINK_LOST_MS) {
			this.lastFastMs = now
			get(ARP_ADDR)
			if (this.arp) get(AT_ADDR)
			if (this.bigThreeOpen(ctx)) {
				get("/surface/lane/*/arm")
				get("/surface/lane/*/freeze")
			}
		}
	}

	// ---------------------------------------------------------------- display

	render(ctx: PageContext): LedFrame {
		const f = makeFrame(ctx.size)
		const set = (x: number, y: number, lvl: number) => {
			if (x >= 0 && x < ctx.size.width && y >= 0 && y < ctx.size.height) f[ledIndex(ctx.size, x, y)] = lvl
		}
		const now = Date.now()
		const blinkOn = now % (BLINK_MS * 2) < BLINK_MS

		for (const y of [LAYER_KEYS, LAYER_PRESETS]) set(CHOOSER_X, y, y === this.layer ? LVL_CHOOSER_ON : LVL_CHOOSER)
		set(CHOOSER_X, XEN_Y, this.xenChords ? LVL_XEN_ON : LVL_XEN_OFF)

		for (let lane = 0; lane < LANES; lane++) {
			const x = LANE_X0 + lane
			if (this.layer === LAYER_KEYS && this.xenChords)
				for (let y = 0; y < ROWS; y++) set(x, y, this.xenLast === lane + 1 ? LVL_KEY_COLUMN : LVL_KEY_BASE)
			else if (this.layer === LAYER_KEYS) this.drawKeys(lane, x, set, ctx)
			else {
				const e = this.mirror.engine(lane)
				if (!isEngine(e)) continue
				for (let y = 0; y < ROWS; y++) {
					const there = y === HOME_ROW || !!this.stored(lane, y)
					set(x, y, !there ? LVL_PRE_EMPTY : this.currentPreset[lane] === y ? LVL_PRE_CURRENT : LVL_PRE_STORED)
				}
			}
		}
		if (this.layer !== LAYER_KEYS) for (let y = 0; y < ROWS; y++) set(ALL_X, y, LVL_ALL)

		if (this.bigThreeOpen(ctx)) {
			const damp = Array.from({ length: LANES }, (_, l) => this.dampSent[l])
			const rows: Array<[number, boolean[], number]> = [
				[BOW_Y, damp.map((_, l) => this.mirror.flag(l, "arm")), LVL_SW_ON],
				[FREEZE_Y, damp.map((_, l) => this.mirror.flag(l, "freeze")), LVL_SW_ON],
				[DAMP_Y, damp, LVL_SW_HELD],
			]
			for (const [y, on, hi] of rows) {
				for (let l = 0; l < LANES; l++) set(LANE_X0 + l, y, on[l] ? hi : LVL_SW_OFF)
				set(ALL_X, y, on.every(Boolean) ? hi : LVL_ALL)
			}
		}
		if (this.slewHeld) {
			const cur = SLEW_TIMES.indexOf(Number(this.settings.slew) as (typeof SLEW_TIMES)[number])
			for (let row = 0; row < ROWS; row++) set(ALL_X, ROWS - 1 - row, row === cur ? LVL_SW_HELD : LVL_SLEW_OTHER)
		}

		for (let i = 0; i < LOOPERS; i++) {
			const st = this.recorders[i].state
			set(RIGHT_X, i,
				st === "recording" ? (blinkOn ? LVL_REC_ARMED : LVL_REC_EMPTY)
				: st === "playing" ? LVL_REC_PLAYING
				: st === "stopped" ? LVL_REC_STOPPED
				: LVL_REC_EMPTY)
		}
		set(RIGHT_X, PITCH_Y, this.settings.pitch ? LVL_SW_ON : LVL_SW_OFF)
		set(RIGHT_X, STRIKE_Y, this.settings.strike ? LVL_SW_ON : LVL_SW_OFF)
		set(RIGHT_X, LATCH_Y, this.latch ? LVL_SW_ON : LVL_SW_OFF)
		set(ARP_X, ARP_Y, this.arp ? LVL_SW_ON : LVL_SW_OFF)
		set(RIGHT_X, SLEW_Y, this.slewHeld ? LVL_SW_HELD : Number(this.settings.slew) > 0 ? LVL_SW_ON : LVL_SW_OFF)

		drawSelector(f, ctx)
		// Latched open: shift 2 blinks, so you can see why the bottom rows are the big three.
		if (this.shift2Latched) set(0, SHIFT2_ROW, blinkOn ? LVL_SW_HELD : LVL_SW_OFF)
		return f
	}

	private drawKeys(lane: number, x: number, set: (x: number, y: number, l: number) => void, ctx: PageContext) {
		const e = this.mirror.engine(lane)
		if (e === "blank") return
		const cell = (row: number) => ledIndex(ctx.size, x, ROWS - 1 - row)
		// PITCH unlit, the column is one trigger (a pad lane keeps its pads).
		const trigger = !this.settings.pitch && !this.mirror.slices(lane)
		let columnDown = false
		// A key down or a latched note: the column stays lit for as long as the note is kept.
		// ARP lit: the sounding call is the brightest, the rest of what is held sits below it.
		const at = this.arp ? this.mirror.num(AT_ADDR) : undefined
		for (let row = 0; row < ROWS; row++) if (this.held.has(cell(row)) || this.latched.has(cell(row))) columnDown = !this.arp
		for (let row = 0; row < ROWS; row++) {
			let lvl = trigger ? LVL_KEY_TRIGGER : LVL_KEY_BASE
			// The cell last played stays lit and fades with the lane's real level.
			if (row === this.lastRow[lane]) lvl = Math.max(lvl, levelLed(this.mirror.level(lane), LVL_KEY_PLAYED))
			if (this.latched.has(cell(row))) lvl = this.arp ? LVL_KEY_ARP_HELD : LVL_KEY_LATCHED
			if (columnDown) lvl = Math.max(lvl, LVL_KEY_COLUMN)
			if (this.held.has(cell(row))) lvl = this.arp ? LVL_KEY_ARP_HELD : LVL_KEY_HELD
			if (this.arp && at === arpId(row, lane) && (this.held.has(cell(row)) || this.latched.has(cell(row)))) lvl = LVL_KEY_HELD
			set(x, ROWS - 1 - row, lvl)
		}
	}

	// ---------------------------------------------------------------- settings, saving

	onOsc(path: string, args: any[], ctx: PageContext) {
		const parts = path.split("/").filter(Boolean)
		let i = 0
		if (parts[i] === "setting" || parts[i] === "settings") i++
		const key = parts[i]
		if (!key) return
		if (key === "get") return this.emitSettings(ctx)
		const raw = args.length ? args[0] : parts[i + 1]
		if (raw === undefined) return
		this.setSetting(key, raw, ctx)
	}

	private setSetting(key: string, raw: unknown, ctx: PageContext) {
		const v = this.clean(key, raw)
		if (v === undefined) return
		this.settings[key] = v
		this.emitSettings(ctx)
		ctx.setDirty()
	}

	/** A raw value through its spec, or undefined when it is not one of this page's. */
	private clean(key: string, raw: unknown): number | boolean | string | undefined {
		const spec = SPEC_BY_KEY.get(key)
		if (!spec) return undefined
		if (spec.type === "toggle") return bool(raw, spec.default as boolean)
		if (spec.type === "enum") {
			const s = String(raw)
			const hit = spec.options!.find((o) => o === s || (key === "slew" && Number(o) === Number(s)))
			return hit ?? undefined
		}
		const n = Number(raw)
		if (!Number.isFinite(n)) return undefined
		const c = Math.min(spec.max!, Math.max(spec.min!, n))
		return spec.step && Number.isInteger(spec.step) ? Math.round(c) : c
	}

	serialize() {
		return { ...this.settings, presets: this.presets, patterns: this.recorders.map((r) => r.snapshot()) }
	}

	restore(config: unknown, ctx: PageContext) {
		if (!isRecord(config)) return
		for (const spec of SPECS) {
			if (config[spec.key] === undefined) continue
			const v = this.clean(spec.key, config[spec.key])
			if (v !== undefined) this.settings[spec.key] = v
		}
		if (isRecord(config.presets)) this.presets = readPresets(config.presets)
		if (config.patterns !== undefined) {
			const raw = Array.isArray(config.patterns) ? config.patterns : []
			for (let i = 0; i < LOOPERS; i++) {
				const node = isRecord(raw[i]) ? raw[i] : {}
				this.recorders[i].restore({
					lengthMs: num(node.lengthMs, 0, 0, MAX_RECORD_MS),
					events: records(node.events, MAX_PATTERN_EVENTS, readEvent),
				})
			}
		}
		this.announce(ctx)
	}

	private announce(ctx: PageContext) {
		ctx.osc.send(`/grid/out/page/${ctx.slotLabel}/type`, "play-surface")
		this.emitSettings(ctx)
		this.emitPatterns(ctx)
	}

	private emitSettings(ctx: PageContext) {
		ctx.osc.send(`/grid/out/page/${ctx.slotLabel}/settings`, JSON.stringify(this.settings))
	}

	private emitPatterns(ctx: PageContext) {
		const state = this.recorders.map((r) => ({ state: r.state, ms: Math.round(r.loopMs) }))
		ctx.osc.send(`/grid/out/page/${ctx.slotLabel}/patterns`, JSON.stringify(state))
	}
}

/** Read a preset file's `presets` back: untrusted, so every level is checked. */
export function readPresets(raw: Record<string, unknown>): Record<string, Bank> {
	const out: Record<string, Bank> = {}
	for (const [patch, node] of Object.entries(raw).slice(0, MAX_PATCHES)) {
		if (!isRecord(node)) continue
		const bank: Bank = {}
		for (const e of ENGINES) {
			const rows = node[e]
			if (!Array.isArray(rows)) continue
			// Every dial of the engine, plus the names the first version stored (tremolo depth unscaled).
			const allowed = new Set([...dialsFor(e).map(partSuffix), ...suffixesFor(e), PRESET_TREM])
			bank[e] = Array.from({ length: ROWS }, (_, i) => {
				const cell = rows[i]
				if (!isRecord(cell)) return null
				const state: PresetState = {}
				for (const [k, v] of Object.entries(cell)) if (allowed.has(k) && typeof v === "number" && Number.isFinite(v)) state[k] = Math.max(0, Math.min(1, v))
				return Object.keys(state).length ? state : null
			})
		}
		out[patch.slice(0, 200)] = bank
	}
	return out
}

function readEvent(e: Record<string, unknown>): PatternEvent | undefined {
	const atMs = num(e.atMs, -1, 0, MAX_RECORD_MS)
	if (atMs < 0) return undefined
	if (e.ctl !== undefined) {
		const c = isRecord(e.ctl) ? e.ctl : {}
		if (typeof c.id !== "string" || !CTL_RE.test(c.id)) return undefined
		return { atMs, step: 0, on: false, ctl: { id: c.id, value: int(c.value, 0, 0, CTL_MAX) } }
	}
	const step = Math.round(Number(e.step))
	const ok = (step >= 0 && step < LANES * NOTE_LANE) || (step >= DAMP_STEP && step < DAMP_STEP + LANES)
	return ok ? { atMs, step, on: bool(e.on, false) } : undefined
}

export const keymap: KeySpec[] = [
	...SELECTOR_KEYS,
	{ x: CHOOSER_X, y: 0, name: "Keys", help: "The lanes play: the row is the pitch (or a REEL lane's pad).", lit: LVL_CHOOSER_ON },
	{ x: CHOOSER_X, y: XEN_Y, name: "Xen chords", short: "Xen", help: "Lit: on KEYS, a press in lane column 1-8 plays no note and calls chord 1-8 of xen-harmony's progression (/xen/go, UDP 57170). The column of the chord last called is lit. Not saved.", lit: LVL_XEN_OFF },
	{ x: CHOOSER_X, y: 7, name: "Presets", short: "Pre", help: "A lane's whole sound: every dial it has pulled away. Shift 1 + cell stores; the bottom row is home (all back to the shared dials).", lit: LVL_CHOOSER },
	{ x: LANE_X0, y: 0, w: LANES, h: ROWS, name: "Lanes 1-8", short: "Lane", help: "What the chooser says: notes or presets. Shift 2: the bottom rows are BOW, FREEZE, DAMP.", lit: LVL_KEY_BASE },
	{ x: ALL_X, y: 0, h: ROWS, name: "All lanes", short: "All", help: "On PRESETS: every lane to its own engine's row. Shift 1 + all also strikes them. Nothing on KEYS.", lit: LVL_ALL },
	{ x: RIGHT_X, y: 0, h: LOOPERS, name: "Loopers 1-4", short: "Loop", help: "Record hand gestures: arm, play, pause. Shift 1 + press clears.", lit: [LVL_REC_PLAYING, LVL_REC_STOPPED, LVL_REC_EMPTY, LVL_REC_EMPTY] },
	{ x: RIGHT_X, y: PITCH_Y, name: "Pitch", help: "Lit: a KEYS press sets the note. Unlit: it holds the lane on its own note; the row does nothing unless the y setting names a dial.", lit: LVL_SW_ON },
	{ x: RIGHT_X, y: STRIKE_Y, name: "Strike", help: "Lit: recalling a preset also strikes the lane.", lit: LVL_SW_OFF },
	{ x: RIGHT_X, y: LATCH_Y, name: "Latch", help: "Lit: a played note stays held after you let go; press its cell again to end it. Unlighting ends them all.", lit: LVL_SW_OFF },
	{ x: ARP_X, y: ARP_Y, name: "Arp", help: "Lit: held KEYS go to the app's arp (one chord across the lanes) and play in turn; the sounding one is brightest. Loops still play direct. Unlighting lets them go.", lit: LVL_SW_OFF },
	{ x: RIGHT_X, y: SLEW_Y, name: "Slew", help: "Tap: glide on or off at the last time. Hold: the all column offers 0, 0.1, 0.25, 0.5, 1, 2, 4, 8 s (bottom to top). Recalls and the way home travel at that time.", lit: LVL_SW_OFF },
]

export const page: PageModule = {
	name: "play-surface",
	label: "Play Surface",
	settings: SPECS,
	keymap,
	create: () => new PlaySurfacePage(),
}
