/* Page: Play Surface  (idk.surface's PLAY page, first version)
 * ------------------------------------------------------------------------------
 * Spec    : idk.surface docs/specs/2026-11-11-grid-play-page-design.md.
 * Summary : Eight lanes side by side. A chooser picks what their columns mean: KEYS (play
 *           the lanes), six parameter layers (one dial per lane as a bar) or PRESETS
 *           (stored states of a lane's six). It plays idk.surface DIRECTLY over its own OSC
 *           (ctx.surface, UDP 57150), not through Max's link.
 *
 *   x:  0    1  2    3  4 ........ 11  12   13 14  15
 *   y0  iso  .  KEYS .  lane 1 ... 8   all  .  .   loop 1
 *   y1  PLAY .  1    .                 all  .  .   loop 2
 *   y2  twst .  2    .                 all  .  .   loop 3
 *   y3  .    .  3    .                 all  .  .   loop 4
 *   y4  .    .  4    .                 all  .  .   PITCH
 *   y5  home .  5    .                 all  .  .   STRIKE
 *   y6  sh 2 .  6    .                 all  .  .   SLEW
 *   y7  sh 1 .  PRE  .                 all  .  .   (free)
 *
 * KEYS    : a press plays that lane; the row is the pitch, lowest at the bottom, in the
 *           scale iso-surface is set to. The key held is the note held. A REEL lane in
 *           SLICES takes the row as its pad number, 1 at the bottom. PITCH unlit: a press
 *           strikes the lane on the note it already has, and the row is how hard. The cell
 *           last played stays lit and fades with the lane's real level. No all column.
 * LAYERS  : each lane's column is a bar for one dial (util/playSlots.ts). Dim = still on
 *           the shared dial (F), bright = its own (V). A press pulls the lane there; the
 *           all column pulls all eight; shift 1 + lane sends it back to the shared dial,
 *           shift 1 + all sends every lane back.
 * PRESETS : each cell is one stored state of a lane's six, eight rows per engine. A press
 *           recalls (and strikes, with STRIKE lit); shift 1 + cell stores what the lane is
 *           now. All on a row recalls every lane's own row; shift 1 + all also strikes.
 * SLEW    : hold it and the all column offers eight times. Levels and recalls travel at
 *           that time; the page sends the glide itself.
 * SHIFT 2 : while held, the lanes' bottom three rows are BOW, FREEZE and DAMP (damp held
 *           while pressed, the other two switch). Held `latchMs` with nothing pressed, it
 *           stays open; a tap closes it.
 * LOOPERS : four free-length loops of hand gestures (util/patternRecorder.ts): notes,
 *           strikes, levels, ways back, recalls and the big three, on the lanes and the
 *           all column, whatever layer is showing. Not layer changes, shifts or stores.
 * Reads   : engine and mode per lane, each mapped dial's value and owner, the lanes'
 *           levels and pitches, the loaded patch's name. Polled with /surface/get while the
 *           page is focused; `lanes` and `preset` come by subscription.
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
import { SCALE_NAMES, DEFAULT_SCALE, isScaleName } from "../util/scales.js"
import {
	ENGINES,
	SLOTS,
	TREMOLO_SLOT,
	isEngine,
	laneAddr,
	ownerAddr,
	partSuffix,
	partsFor,
	suffixesFor,
	type Engine,
	type Part,
} from "../util/playSlots.js"
import {
	ALL_SLOTS,
	BASE_READS,
	LANES,
	PRESET_TREM,
	ROWS,
	SurfaceMirror,
	barRow,
	levelLed,
	rowKey,
	rowValue,
	rowVelocity,
	slotReads,
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

/** Chooser rows: 0 KEYS, 1-6 the parameter layers, 7 PRESETS. */
export const LAYER_KEYS = 0
export const LAYER_PRESETS = 7

/** Shift 2's rows on the lanes. */
const BOW_Y = 5
const FREEZE_Y = 6
const DAMP_Y = 7

/** SLEW's eight times in seconds, bottom of the all column first. */
export const SLEW_TIMES = [0, 0.1, 0.25, 0.5, 1, 2, 4, 8] as const

// --- Levels -------------------------------------------------------------------------
const LVL_CHOOSER = 3
const LVL_CHOOSER_ON = 15
const LVL_KEY_BASE = 1
const LVL_KEY_ROOT = 3 // the scale's root rows, so the hand can find the octave
const LVL_KEY_PAD = 2 // a REEL lane in SLICES: pads, not pitches
const LVL_KEY_HELD = 15
const LVL_BAR_F = 3 // on the shared dial
const LVL_TIP_F = 6
const LVL_BAR_V = 10 // pulled away
const LVL_TIP_V = 15
const LVL_ALL = 2 // clearly dimmer than the lanes
const LVL_PRE_EMPTY = 1
const LVL_PRE_STORED = 5
const LVL_PRE_CURRENT = 15
const LVL_SW_OFF = 3
const LVL_SW_ON = 12
const LVL_SW_HELD = 15
const LVL_SLEW_OTHER = 4
const LVL_REC_EMPTY = 1
const LVL_REC_ARMED = 12
const LVL_REC_STOPPED = 5
const LVL_REC_PLAYING = 15
const BLINK_MS = 220

// --- Time ---------------------------------------------------------------------------
const TIMER_MS = 10
const GLIDE_SEND_MS = 30 // how often a travelling level is sent
const FAST_POLL_MS = 250 // the layer on screen
const SLOW_POLL_MS = 2000 // everything else
const SUBSCRIBE_MS = 3000 // a subscription is a lease: 10 s without renewal and it lapses
const LINK_LOST_MS = 5000
const MAX_PATTERN_EVENTS = 20_000
const MAX_PATCHES = 64

// --- What a loop records --------------------------------------------------------------
// Held notes and held damp are NOTES in the recorder (a set of things sounding); everything
// else is a control event, named so playback acts on the same lane and slot whatever layer
// is showing.
const NOTE_LANE = 512 // note step = lane * 512 + (pad ? 256 : 0) + key
const NOTE_PAD = 256
const DAMP_STEP = 8192 // damp step = DAMP_STEP + lane
const noteStep = (lane: number, key: number, pad: boolean) => lane * NOTE_LANE + (pad ? NOTE_PAD : 0) + key
const CTL_RE = /^(lvl|home)\/([0-5])\/([0-7]|all)$|^(rec)\/([0-7]|all)$|^(strike|bow|frz)\/([0-7])$/
/** The largest value a control event carries (a recall's row, plus 8 when it strikes). */
const CTL_MAX = 15

const SPECS: SettingSpec[] = [
	{ key: "velocity", label: "note velocity", type: "number", min: 0.05, max: 1, step: 0.05, default: 0.8, help: "How hard a KEYS note and a preset's strike play." },
	{ key: "followIso", label: "rows follow iso", type: "toggle", default: true, help: "Take the scale, root and tuning size from iso-surface." },
	{ key: "npo", label: "notes / octave", type: "number", min: 1, max: 48, step: 1, default: 12 },
	{ key: "root", label: "root (semitone)", type: "number", min: 0, max: 11, step: 1, default: 0 },
	{ key: "scale", label: "scale", type: "enum", options: SCALE_NAMES, default: DEFAULT_SCALE },
	{ key: "base", label: "bottom row (step)", type: "number", min: 0, max: 84, step: 1, default: 24, help: "Where the bottom row sits: 24 is the octave of middle C." },
	{ key: "slew", label: "slew (s)", type: "enum", options: SLEW_TIMES.map(String), default: "0" },
	{ key: "latchMs", label: "shift 2 stays open after (ms)", type: "number", min: 200, max: 3000, step: 50, default: 1000 },
	{ key: "pitch", label: "PITCH: presses set the note", type: "toggle", default: true },
	{ key: "strike", label: "STRIKE: a recall also strikes", type: "toggle", default: false },
]
const SPEC_BY_KEY = new Map(SPECS.map((s) => [s.key, s]))

type Bank = Partial<Record<Engine, Array<PresetState | null>>>
interface Glide {
	from: number
	to: number
	t0: number
	durMs: number
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
	private dampHeld = new Set<number>()
	private dampAllHeld = false
	/** The hand's notes as last tapped into the loops, so they see its changes only. */
	private handNotes = new Set<number>()
	private handDampLast = new Array<boolean>(LANES).fill(false)
	private slewHeld = false
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
				if (this.mirror.feed(path, args, Date.now())) ctx.setDirty()
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
		// Your hands let go; the loops keep playing.
		this.held.clear()
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
			if (down && ev.y < ROWS) this.layer = ev.y
			return
		}
		if (ev.x === RIGHT_X) return this.rightKey(ev.y, down, ctx)

		const lane = ev.x - LANE_X0
		const isAll = ev.x === ALL_X
		if (!isAll && (lane < 0 || lane >= LANES)) return

		// SLEW held: the all column is the eight times.
		if (this.slewHeld && isAll) {
			if (down) this.setSetting("slew", String(SLEW_TIMES[ROWS - 1 - ev.y]), ctx)
			return
		}
		// A release always lets go of what its press took, whatever the layer is by now.
		if (!down) {
			const i = ledIndex(ctx.size, ev.x, ev.y)
			if (this.held.delete(i)) return this.commit(ctx)
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
			if (!isAll) this.playKey(ev, lane, row, ctx)
			return
		}
		if (this.layer === LAYER_PRESETS) return this.presetKey(isAll ? -1 : lane, ev.y, ctx)
		this.levelKey(this.layer - 1, isAll ? -1 : lane, row, ctx)
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
		} else if (y === PITCH_Y) this.setSetting("pitch", !this.settings.pitch, ctx)
		else if (y === STRIKE_Y) this.setSetting("strike", !this.settings.strike, ctx)
	}

	/** KEYS: a held note, a pad, or (PITCH unlit) a strike on the lane's own note. */
	private playKey(ev: KeyEvent, lane: number, row: number, ctx: PageContext) {
		this.lastRow[lane] = row
		const pad = this.mirror.slices(lane)
		if (!pad && !this.settings.pitch) {
			this.tap(`strike/${lane}`, row)
			this.strikeOwn(lane, rowVelocity(row), ctx)
			return
		}
		const key = pad ? Math.min(127, this.mirror.sliceRoot(lane) + row) : rowKey(row, this.rowScale())
		this.held.set(ledIndex(ctx.size, ev.x, ev.y), noteStep(lane, key, pad))
		this.commit(ctx)
	}

	private levelKey(slot: number, lane: number, row: number, ctx: PageContext) {
		const who = lane < 0 ? "all" : String(lane)
		if (ctx.modifiers.shift1) {
			this.tap(`home/${slot}/${who}`, 1)
			this.forLanes(lane, (l) => this.home(slot, l, ctx))
		} else {
			this.tap(`lvl/${slot}/${who}`, row)
			this.forLanes(lane, (l) => this.level(slot, l, row, ctx))
		}
	}

	private presetKey(lane: number, y: number, ctx: PageContext) {
		const shift = ctx.modifiers.shift1
		if (lane >= 0 && shift) return this.store(lane, y, ctx) // a store is never recorded
		// All: every lane to its own engine's row; with shift 1 it strikes them all too.
		const strike = lane < 0 ? shift || !!this.settings.strike : !!this.settings.strike
		this.tap(`rec/${lane < 0 ? "all" : lane}`, y + (strike ? ROWS : 0))
		this.forLanes(lane, (l) => this.recall(l, y, strike, ctx))
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

	private forLanes(lane: number, fn: (lane: number) => void) {
		if (lane >= 0) return fn(lane)
		for (let l = 0; l < LANES; l++) fn(l)
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

	/** Pull a lane's dial(s) for `slot` to a bar row. */
	private level(slot: number, lane: number, row: number, ctx: PageContext) {
		const parts = partsFor(this.mirror.engine(lane), slot)
		if (!parts.length) return
		for (const p of parts) this.setPart(lane, p, rowValue(row, p.scale), ctx)
		// One bar is the tremolo's rate and depth, and the lane's TREM switch above zero.
		if (slot === TREMOLO_SLOT) this.setFlag(lane, "trem", row > 0, ctx)
		this.currentPreset[lane] = -1
	}

	/** Send a lane back to the shared dial. */
	private home(slot: number, lane: number, ctx: PageContext) {
		for (const p of partsFor(this.mirror.engine(lane), slot)) {
			this.glides.delete(laneAddr(lane + 1, p))
			this.send(ctx, ownerAddr(lane + 1, p), "follow")
			this.mirror.set(ownerAddr(lane + 1, p), "follow")
		}
		this.currentPreset[lane] = -1
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

	private setFlag(lane: number, key: "arm" | "freeze" | "trem", on: boolean, ctx: PageContext) {
		const addr = `/surface/lane/${lane + 1}/${key}`
		if (this.mirror.num(addr) === (on ? 1 : 0)) return
		this.send(ctx, addr, on ? 1 : 0)
		this.mirror.set(addr, on ? 1 : 0)
	}

	/** Strike a lane on the note it already has. */
	private strikeOwn(lane: number, velocity: number, ctx: PageContext) {
		this.send(ctx, `/surface/lane/${lane + 1}/strike/hz`, float(this.mirror.pitch(lane)), float(velocity))
	}

	private bank(): Bank {
		return (this.presets[this.mirror.patch()] ??= {})
	}

	private stored(lane: number, row: number): PresetState | null {
		const e = this.mirror.engine(lane)
		return (isEngine(e) && this.bank()[e]?.[row]) || null
	}

	/** Store what the lane is now into its engine's row. */
	private store(lane: number, row: number, ctx: PageContext) {
		const e = this.mirror.engine(lane)
		if (!isEngine(e)) return
		const state: PresetState = {}
		for (let s = 0; s < SLOTS; s++)
			for (const p of partsFor(e, s)) {
				const v = this.mirror.effective(lane, p)
				if (v !== undefined) state[partSuffix(p)] = v
			}
		state[PRESET_TREM] = this.mirror.flag(lane, "trem") ? 1 : 0
		const rows = (this.bank()[e] ??= new Array(ROWS).fill(null))
		rows[row] = state
		this.currentPreset[lane] = row
		ctx.persist({ presets: this.presets })
	}

	private recall(lane: number, row: number, strike: boolean, ctx: PageContext) {
		const state = this.stored(lane, row)
		if (state) {
			const e = this.mirror.engine(lane)
			for (let s = 0; s < SLOTS; s++)
				for (const p of partsFor(e, s)) {
					const v = state[partSuffix(p)]
					if (v !== undefined) this.setPart(lane, p, v, ctx)
				}
			if (state[PRESET_TREM] !== undefined) this.setFlag(lane, "trem", state[PRESET_TREM] !== 0, ctx)
			this.currentPreset[lane] = row
		}
		// An empty cell changes nothing, but a strike is still a strike.
		if (strike) this.strikeOwn(lane, Number(this.settings.velocity), ctx)
	}

	/** A control event played back by a loop. */
	private replay(id: string, value: number, ctx: PageContext) {
		const m = CTL_RE.exec(id)
		if (!m) return
		const kind = m[1] ?? m[4] ?? m[6]
		const who = m[3] ?? m[5] ?? m[7]
		const lane = who === "all" ? -1 : Number(who)
		const slot = Number(m[2])
		if (kind === "lvl") this.forLanes(lane, (l) => this.level(slot, l, value, ctx))
		else if (kind === "home") this.forLanes(lane, (l) => this.home(slot, l, ctx))
		else if (kind === "rec") this.forLanes(lane, (l) => this.recall(l, value % ROWS, value >= ROWS, ctx))
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
		const hand = new Set(this.held.values())
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

		const want = new Set(hand)
		const damp = Array.from({ length: LANES }, (_, l) => this.handDamp(l))
		for (const r of this.recorders)
			for (const step of r.sounding) {
				if (step >= DAMP_STEP) damp[step - DAMP_STEP] = true
				else want.add(step)
			}
		for (const step of this.notesSent) if (!want.has(step)) this.noteOut(step, false, ctx)
		for (const step of want) if (!this.notesSent.has(step)) this.noteOut(step, true, ctx)
		this.notesSent = want
		for (let l = 0; l < LANES; l++) {
			if (damp[l] === this.dampSent[l]) continue
			this.dampSent[l] = damp[l]
			this.send(ctx, `/surface/lane/${l + 1}/damp`, damp[l] ? 1 : 0)
		}
		ctx.setDirty()
	}
	private noteOut(step: number, on: boolean, ctx: PageContext) {
		const lane = Math.floor(step / NOTE_LANE)
		const pad = (step & NOTE_PAD) !== 0
		const key = step & 127
		const n = lane + 1
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
		const needed = this.focused || this.glides.size > 0 || this.recorders.some((r) => r.isRunning)
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
		if (this.glides.size && now - this.lastGlideMs >= GLIDE_SEND_MS) {
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
			if (t >= 1) this.glides.delete(addr)
		}
		ctx.setDirty()
	}

	/** Keep the mirror in step with surface: the layer on screen often, the rest slowly. */
	private poll(now: number, ctx: PageContext) {
		const link = ctx.surface
		if (!link) return
		const get = (addr: string) => link.send("/surface/get", addr)
		if (now - this.lastSubMs >= SUBSCRIBE_MS) {
			this.lastSubMs = now
			link.send("/surface/subscribe", "127.0.0.1", link.port, "lanes")
			link.send("/surface/subscribe", "127.0.0.1", link.port, "preset")
		}
		if (now - this.lastSlowMs >= SLOW_POLL_MS) {
			this.lastSlowMs = now
			for (const a of BASE_READS) get(a)
			// With nobody answering, one small question every two seconds is enough.
			if (now - this.mirror.heardAt < LINK_LOST_MS) for (const a of slotReads(this.mirror, ALL_SLOTS)) get(a)
		}
		if (now - this.lastFastMs >= FAST_POLL_MS && now - this.mirror.heardAt < LINK_LOST_MS) {
			this.lastFastMs = now
			if (this.layer >= 1 && this.layer <= SLOTS) for (const a of slotReads(this.mirror, [this.layer - 1])) get(a)
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

		for (let y = 0; y < ROWS; y++) set(CHOOSER_X, y, y === this.layer ? LVL_CHOOSER_ON : LVL_CHOOSER)

		for (let lane = 0; lane < LANES; lane++) {
			const x = LANE_X0 + lane
			if (this.layer === LAYER_KEYS) this.drawKeys(lane, x, set, ctx)
			else if (this.layer === LAYER_PRESETS) {
				const e = this.mirror.engine(lane)
				if (!isEngine(e)) continue
				for (let y = 0; y < ROWS; y++)
					set(x, y, !this.stored(lane, y) ? LVL_PRE_EMPTY : this.currentPreset[lane] === y ? LVL_PRE_CURRENT : LVL_PRE_STORED)
			} else this.drawBar(lane, x, this.layer - 1, set)
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
		set(RIGHT_X, SLEW_Y, this.slewHeld ? LVL_SW_HELD : Number(this.settings.slew) > 0 ? LVL_SW_ON : LVL_SW_OFF)

		drawSelector(f, ctx)
		// Latched open: shift 2 blinks, so you can see why the bottom rows are the big three.
		if (this.shift2Latched) set(0, SHIFT2_ROW, blinkOn ? LVL_SW_HELD : LVL_SW_OFF)
		return f
	}

	private drawKeys(lane: number, x: number, set: (x: number, y: number, l: number) => void, ctx: PageContext) {
		const e = this.mirror.engine(lane)
		if (e === "blank") return
		const pad = this.mirror.slices(lane)
		const s = this.rowScale()
		const len = s.npo === 12 ? this.scaleLen(s.scale) : s.npo
		for (let row = 0; row < ROWS; row++) {
			const y = ROWS - 1 - row
			let lvl = pad ? LVL_KEY_PAD : this.settings.pitch && row % len === 0 ? LVL_KEY_ROOT : LVL_KEY_BASE
			// The cell last played stays lit and fades with the lane's real level.
			if (row === this.lastRow[lane]) lvl = Math.max(lvl, levelLed(this.mirror.level(lane), LVL_KEY_ROOT + 1))
			if (this.held.has(ledIndex(ctx.size, x, y))) lvl = LVL_KEY_HELD
			set(x, y, lvl)
		}
	}

	/** How many rows until the scale's root comes round again. */
	private scaleLen(scale: string): number {
		const s = { npo: 12, root: 0, scale, base: 0 }
		for (let n = 1; n <= 12; n++) if (rowKey(n, s) - rowKey(0, s) === 12) return n
		return 12
	}

	private drawBar(lane: number, x: number, slot: number, set: (x: number, y: number, l: number) => void) {
		const parts = partsFor(this.mirror.engine(lane), slot)
		if (!parts.length) return // nothing for this slot on this engine: a dark column
		const p = parts[0]
		const own = this.mirror.owned(lane, p)
		let v = this.mirror.effective(lane, p)
		if (v === undefined) return
		if (slot === TREMOLO_SLOT && !this.mirror.flag(lane, "trem")) v = 0
		const tip = barRow(v, p.scale)
		for (let row = 0; row <= tip; row++)
			set(x, ROWS - 1 - row, row === tip ? (own ? LVL_TIP_V : LVL_TIP_F) : own ? LVL_BAR_V : LVL_BAR_F)
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
			const allowed = new Set([...suffixesFor(e), PRESET_TREM])
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
	{ x: CHOOSER_X, y: 1, h: SLOTS, name: "Layers 1-6", short: "Layer", help: "tone, time, force, move, place, tremolo: each lane's column is a bar for one dial.", lit: LVL_CHOOSER },
	{ x: CHOOSER_X, y: 7, name: "Presets", short: "Pre", help: "Stored states of a lane's six. Shift 1 + cell stores.", lit: LVL_CHOOSER },
	{ x: LANE_X0, y: 0, w: LANES, h: ROWS, name: "Lanes 1-8", short: "Lane", help: "What the chooser says: notes, a bar, or presets. Shift 2: the bottom rows are BOW, FREEZE, DAMP.", lit: LVL_KEY_BASE },
	{ x: ALL_X, y: 0, h: ROWS, name: "All lanes", short: "All", help: "The same press on all eight (not on KEYS). Shift 1 + all: every lane back to the shared dial; on PRESETS, recall and strike all.", lit: LVL_ALL },
	{ x: RIGHT_X, y: 0, h: LOOPERS, name: "Loopers 1-4", short: "Loop", help: "Record hand gestures: arm, play, pause. Shift 1 + press clears.", lit: [LVL_REC_PLAYING, LVL_REC_STOPPED, LVL_REC_EMPTY, LVL_REC_EMPTY] },
	{ x: RIGHT_X, y: PITCH_Y, name: "Pitch", help: "Lit: a KEYS press sets the note. Unlit: it strikes the lane's own note, the row is how hard.", lit: LVL_SW_ON },
	{ x: RIGHT_X, y: STRIKE_Y, name: "Strike", help: "Lit: recalling a preset also strikes the lane.", lit: LVL_SW_OFF },
	{ x: RIGHT_X, y: SLEW_Y, name: "Slew", help: "Hold: the all column offers 0, 0.1, 0.25, 0.5, 1, 2, 4, 8 s (bottom to top). Levels and recalls travel at that time.", lit: LVL_SW_OFF },
]

export const page: PageModule = {
	name: "play-surface",
	label: "Play Surface",
	settings: SPECS,
	keymap,
	create: () => new PlaySurfacePage(),
}
