/* Page: Set Surface  (idk.surface fork of set-hot — voice control for the modal instrument)
 * ------------------------------------------------------------------------------
 * Summary : Per-voice switches for the eight voices (idk.surface), in the bottom three rows.
 * Input   : col 0 = the system's column (util/pageSelectorSurface.ts). Bottom three rows,
 *           top → bottom: BOW (row 5), FREEZE (row 6), DAMP (row 7, momentary — damped
 *           while held): the same order as the PLAY page's shift 2. ROLL was taken off
 *           (Ian, 2026-11-11): nothing is sent or taken for it any more.
 *           Col 2 = ALL: it sets all eight voices in its row (a toggle turns them all ON
 *           unless all eight already are, then all OFF; damp-all holds all eight down).
 *           Cols 4-11 = voices 1-8. Cols 1 and 3 are gaps.
 *           Col 15 rows 0-2 = 3 LOOPERS (util/patternRecorder.ts, as in isometric): one key
 *           cycles empty → rec → play → stop, SHIFT 1 (col 0 row 7, the system's) + press clears. A take
 *           starts at the first gesture. Damp records as momentary notes (step = voice),
 *           the toggles as control events (`<param>/<voice>` → 1|0). Playback drives the
 *           same switches and sends the same OSC; the latest move wins, a hand press holds
 *           until a loop's next move, and a voice is damped while a hand OR a loop holds it.
 *           Only HAND gestures are recorded — loops never tap each other. Loops keep running
 *           when the page loses focus; stop/clear releases whatever damp a loop held.
 *           Col 15 rows 3-7 = TWISTER PAGES a-e (ModelHot, TremHot, PanHot, FxHot,
 *           VoicesHot): a press sends /twister/in/focus/page <a-e> straight to twistermapper.
 *           The lit key is the last one pressed here — the Twister's own focus changes are
 *           not reported back to us.
 * Output  : /grid/out/page/<slot>/voice <n 1-8> <damp|freeze|bow> <1|0>, per voice
 *           and only on a CHANGE — an ALL press sends one message per voice that moved.
 * Input   : (from Max, never echoed back)
 *           /grid/in/page/<slot>/voice/<n>/<damp|freeze|bow> <1|0> — sync a switch
 *           to the instrument's real state (e.g. after its boot reset or a sound recall).
 *           /grid/in/page/<slot>/voice/<n>/state <0 idle|1 triggered|2 ringing> — the
 *           voice activity FEEDBACK, drawn on row 4, just above each voice's switches.
 *           Also out: /grid/out/page/<slot>/patterns <json> [{state, ms}] per looper.
 * Display : toggles dim 2 off / 12 on; damp 15 while held; ALL 12 when all eight are on,
 *           6 when some are. Feedback: triggered flashes 15 for TRIGGER_MS, ringing 5.
 * Rules   : The SWITCHES are runtime state — not saved, nothing sent at load, so recalling a
 *           preset can never unfreeze a voice. The LOOPS are content and are saved in a
 *           preset (serialize/restore); they come back stopped. Damp is
 *           released on blur, since the key-up would otherwise land on another page.
 * VIEW    : (the next home page, agreed 2026-11-11; OFF until idk.surface's addresses are
 *           live: HOME_VIEW_LIVE below.) Spoken DIRECTLY to idk.surface over ctx.surface,
 *           read back by /surface/get while the page is focused:
 *           y3 x4-x11 FOCUS, also the activity light (focused bright, linked medium; a
 *             sound flashes a lane, and dips the focused one). Press = focus that lane
 *             alone; shift 1 + press = add it to / drop it from the selection; hold one
 *             FOCUS and long-press another = the range between. Shift 2 + press = that
 *             lane home (all its dials back to the shared ones). x2 y3 = select all
 *             eight; shift 2 + x2 y3 = everyone home.
 *           y4 x4-x11 MOTION on/off (/surface/lane/N/trem); x2 y4 = all.
 *           y0 x4-x7 FX tracks A B C D, x9 x10 S1 S2, x11 MASTER: shows that chain and brings the
 *             FX page to the front in the window (surface does both inside /surface/view/fx).
 *           The loopers record MOTION with the rest; never focus or selection changes,
 *           FX track changes or the ways home.
 * ------------------------------------------------------------------------------
 */

import {
	type Page,
	type PageContext,
	type KeyEvent,
	type LedFrame,
	makeFrame,
	ledIndex,
} from "../core/types.js"
import type { KeySpec, PageModule } from "../core/pageModule.js"
import { SELECTOR_KEYS, selectorKey, shiftKey, releaseShifts, drawSelector, TWISTER_FOCUS_PATH } from "../util/pageSelectorSurface.js"
import { PatternRecorder, MAX_RECORD_MS, type PatternEvent } from "../util/patternRecorder.js"
import { isRecord, num, bool, records } from "../util/restoreGuards.js"
import { DAMP_FROM_CELLS_SURFACE, DAMP_STATE_SURFACE } from "../core/sharedStore.js"

export const VOICES = 8
const COL_ALL = 2
const VOICE_COL0 = 4 // voice 1; voices run to col 11
const FEEDBACK_ROW = 4

/**
 * The next home page (FOCUS, MOTION, FX tracks, lane home) speaks addresses idk.surface is
 * still adding: /surface/view/{focus,linked,fx}, /surface/lane/<n>/home, /surface/home.
 * Off, the page is exactly the old one and sends idk.surface nothing. Switch it on when the
 * surface session confirms they are live in the running app.
 */
export const HOME_VIEW_LIVE = false
const FOCUS_ROW = 3
const MOTION_ROW = 4
const FX_ROW = 0
/** x → the FX track a top-row key shows. */
const FX_AT_X = new Map<number, string>([[4, "a"], [5, "b"], [6, "c"], [7, "d"], [9, "s1"], [10, "s2"], [11, "master"]])
const LONG_PRESS_MS = 400
const VIEW_POLL_MS = 500
const SUBSCRIBE_MS = 3000 // a subscription is a lease: renew well inside its 10 s
const LVL_FOCUS = 12
const LVL_LINKED = 6
const LVL_FOCUS_DIP = 4
const LVL_FX_OFF = 3
/** A selection as surface spells it: lane digits 1-8, each once, in order. */
const cleanLinked = (v: unknown) => [...new Set(String(v ?? "").replace(/[^1-8]/g, ""))].sort().join("")

export const PARAMS = ["damp", "freeze", "bow"] as const
export type Param = (typeof PARAMS)[number]
const isParam = (v: string): v is Param => (PARAMS as readonly string[]).includes(v)
/** Top to bottom BOW, FREEZE, DAMP: the order of the PLAY page's shift 2. */
const ROW_OF: Record<Param, number> = { bow: 5, freeze: 6, damp: 7 }
const PARAM_AT_ROW = new Map<number, Param>(PARAMS.map((p) => [ROW_OF[p], p]))

const LVL_OFF = 2
const LVL_ON = 12
const LVL_HELD = 15
const LVL_SOME = 6
const LVL_TRIGGERED = 15
const LVL_RINGING = 5
/** How long a trigger reads as a flash before falling back to "ringing". */
const TRIGGER_MS = 150

/** Loopers at the top of the last column; shift 1 is the left column's (the system's). */
const RECORDERS = 3
/** Twister page keys under the loopers: row TWISTER_ROW0 + i focuses Twister slot a+i. */
const TWISTER_ROW0 = 3
const TWISTER_PAGES = ["ModelHot", "TremHot", "PanHot", "FxHot", "VoicesHot"] as const
const LVL_TWISTER_OFF = 3
const LVL_TWISTER_ON = 12
const LVL_REC_EMPTY = 1
const LVL_REC_ARMED = 12 // bright half of the recording blink
const LVL_REC_STOPPED = 5
const LVL_REC_PLAYING = 15
const BLINK_MS = 220
const TIMER_MS = 5
const MAX_PATTERN_EVENTS = 20_000

type Toggle = Exclude<Param, "damp">
const TOGGLES: readonly Toggle[] = ["freeze", "bow"]
const ctlId = (param: Toggle, voice: number) => `${param}/${voice + 1}`
const parseCtl = (id: string): { param: Toggle | "motion"; voice: number } | null => {
	const m = /^(freeze|bow|motion)\/([1-8])$/.exec(id)
	return m ? { param: m[1] as Toggle | "motion", voice: Number(m[2]) - 1 } : null
}

const allOn = (a: readonly boolean[]) => a.every(Boolean)

export class SetSurfacePage implements Page {
	/** Latching switches, per param, per voice (index 0 = voice 1). */
	private toggles: Record<Toggle, boolean[]> = {
		freeze: new Array(VOICES).fill(false),
		bow: new Array(VOICES).fill(false),
	}
	/** Damp is momentary: a voice is damped while its own key OR the ALL key is down. */
	private dampHeld = new Set<number>()
	private dampAllHeld = false
	/** What Max was last told about damp, so only changes go out. */
	private dampSent = new Array<boolean>(VOICES).fill(false)
	/** Hand damp as last recorded, so loopers see its transitions. */
	private handDampLast = new Array<boolean>(VOICES).fill(false)

	private recorders = Array.from({ length: RECORDERS }, () => new PatternRecorder())
	/** The Twister page last chosen from here (-1 = none yet). */
	private twisterPage = -1
	private timer: ReturnType<typeof setInterval> | null = null
	private lastTickMs = 0
	/** Kept for the timer, which has no ctx of its own. */
	private ctx: PageContext | null = null
	/** Voice activity from Max: 0 idle, 1 triggered, 2 ringing, plus when it triggered. */
	private activity = new Array<number>(VOICES).fill(0)
	private triggeredAt = new Array<number>(VOICES).fill(0)
	/** Damp requested by other pages (cells-surface's damp keys), via ctx.shared. */
	private remoteDamp = new Array<boolean>(VOICES).fill(false)
	private unsubscribe: (() => void) | null = null

	// The view (only when `live`): what idk.surface last said, plus our own presses.
	private focus = 0 // lane 1-8, 0 = not heard yet
	private linked = ""
	private fx = ""
	private motion = new Array<boolean>(VOICES).fill(false)
	private sounding = new Array<boolean>(VOICES).fill(false)
	/** FOCUS keys now down, in the order they went down. */
	private focusDown: number[] = []
	/** A second FOCUS key held while another is: a range once it has been down long enough. */
	private rangePending: { anchor: number; lane: number; at: number } | null = null
	private focused = false
	private lastPollMs = 0
	private lastSubMs = 0
	private unsurface: (() => void) | null = null

	constructor(private live: boolean = HOME_VIEW_LIVE) {}

	init(ctx: PageContext) {
		this.ctx = ctx
		if (this.live) this.unsurface = ctx.surface?.on((path, args) => this.hear(path, args, ctx)) ?? null
		// Another page's damp keys drive the same voices. This page stays the ONE sender of
		// damp to Max, so both surfaces agree and nothing is sent twice.
		this.unsubscribe =
			ctx.shared?.subscribe(DAMP_FROM_CELLS_SURFACE, (v) => {
				this.remoteDamp = Array.from({ length: VOICES }, (_, i) => Array.isArray(v) && !!v[i])
				this.syncDamp(ctx)
			}) ?? null
		this.announce(ctx)
	}

	onFocus(ctx: PageContext) {
		this.focused = true
		this.lastPollMs = this.lastSubMs = 0 // ask at once
		this.announce(ctx)
		this.syncTimer()
	}

	onBlur(ctx: PageContext) {
		// Your hands let go; the loops keep playing (same rule as isometric).
		this.focused = false
		this.focusDown = []
		this.rangePending = null
		this.dampHeld.clear()
		this.dampAllHeld = false
		this.syncDamp(ctx)
		releaseShifts(ctx)
		this.syncTimer()
	}

	onKey(ev: KeyEvent, ctx: PageContext) {
		if (selectorKey(ev, ctx)) return
		const lastCol = ctx.size.width - 1
		if (shiftKey(ev, ctx)) return
		const tw = ev.y - TWISTER_ROW0
		if (ev.x === lastCol && tw >= 0 && tw < TWISTER_PAGES.length) {
			if (ev.s) {
				this.twisterPage = tw
				ctx.osc.send(TWISTER_FOCUS_PATH, String.fromCharCode(97 + tw))
			}
			return
		}
		if (ev.x === lastCol && ev.y < RECORDERS) {
			if (ev.s) this.recorderKey(ev.y, ctx)
			return
		}
		if (this.live && this.viewKey(ev, ctx)) return
		const param = PARAM_AT_ROW.get(ev.y)
		if (!param) return
		const voice = ev.x - VOICE_COL0
		const isAll = ev.x === COL_ALL
		if (!isAll && (voice < 0 || voice >= VOICES)) return

		if (param === "damp") {
			if (isAll) this.dampAllHeld = ev.s === 1
			else if (ev.s) this.dampHeld.add(voice)
			else this.dampHeld.delete(voice)
			this.syncDamp(ctx)
			return
		}
		if (!ev.s) return // toggles latch on press
		const row = this.toggles[param]
		if (isAll) {
			const next = !allOn(row)
			for (let v = 0; v < VOICES; v++) this.setToggle(param, v, next, ctx, true)
		} else this.setToggle(param, voice, !row[voice], ctx, true)
	}

	// ---------------------------------------------------------------- the view (live only)

	/** FOCUS, MOTION and the FX row. True when the key was one of theirs. */
	private viewKey(ev: KeyEvent, ctx: PageContext): boolean {
		const lane = ev.x - VOICE_COL0 // 0-7
		const isAll = ev.x === COL_ALL
		const isLane = lane >= 0 && lane < VOICES
		if (ev.y === FX_ROW) {
			const track = FX_AT_X.get(ev.x)
			if (!track) return false
			if (ev.s) {
				this.fx = track
				ctx.surface?.send("/surface/view/fx", track)
			}
			return true
		}
		if (ev.y === MOTION_ROW && (isLane || isAll)) {
			if (!ev.s) return true
			if (isAll) {
				const next = !allOn(this.motion)
				for (let v = 0; v < VOICES; v++) this.setMotion(v, next, ctx, true)
			} else this.setMotion(lane, !this.motion[lane], ctx, true)
			return true
		}
		if (ev.y !== FOCUS_ROW || !(isLane || isAll)) return false
		if (isAll) {
			if (!ev.s) return true
			if (ctx.modifiers.shift2) ctx.surface?.send("/surface/home")
			else this.setLinked("12345678", ctx)
			return true
		}
		if (!ev.s) {
			this.focusDown = this.focusDown.filter((l) => l !== lane)
			if (this.rangePending?.lane === lane) {
				// Let go before it became a range: an ordinary press after all.
				this.rangePending = null
				this.focusAlone(lane, ctx)
			} else if (this.rangePending?.anchor === lane) this.rangePending = null
			this.syncTimer()
			return true
		}
		if (ctx.modifiers.shift2) {
			ctx.surface?.send(`/surface/lane/${lane + 1}/home`)
			return true
		}
		if (ctx.modifiers.shift1) {
			// Add or drop; surface always keeps the focused lane in.
			const d = String(lane + 1)
			if (lane + 1 !== this.focus) this.setLinked(this.linked.includes(d) ? this.linked.replace(d, "") : this.linked + d, ctx)
			return true
		}
		if (this.focusDown.length) {
			this.rangePending = { anchor: this.focusDown[0], lane, at: Date.now() }
			this.focusDown.push(lane)
			this.syncTimer()
			return true
		}
		this.focusDown.push(lane)
		this.focusAlone(lane, ctx)
		return true
	}

	private focusAlone(lane: number, ctx: PageContext) {
		this.focus = lane + 1
		ctx.surface?.send("/surface/view/focus", lane + 1)
		this.setLinked("", ctx)
	}

	private setLinked(digits: string, ctx: PageContext) {
		const clean = cleanLinked(digits)
		ctx.surface?.send("/surface/view/linked", clean)
		// As surface will report it: the focused lane is always in, unless nothing else is.
		this.linked = clean && this.focus ? cleanLinked(clean + this.focus) : clean
	}

	/** `byHand` = your press, which armed loopers record; loop playback passes false. */
	private setMotion(voice: number, on: boolean, ctx: PageContext, byHand: boolean) {
		if (this.motion[voice] === on) return
		this.motion[voice] = on
		if (byHand) {
			const nowMs = Date.now()
			for (const r of this.recorders) r.recordControl(`motion/${voice + 1}`, on ? 1 : 0, nowMs)
			if (this.recorders.some((r) => r.state === "recording")) this.syncTimer()
		}
		ctx.surface?.send(`/surface/lane/${voice + 1}/trem`, on ? 1 : 0)
	}

	/** What idk.surface says: replies to our gets, and the `lanes` reports. */
	private hear(path: string, args: any[], ctx: PageContext) {
		const v = args[0]
		if (path === "/surface/view/focus") {
			const n = Math.round(Number(v))
			if (n >= 1 && n <= VOICES) this.focus = n
		} else if (path === "/surface/view/linked") this.linked = cleanLinked(v)
		else if (path === "/surface/view/fx") this.fx = typeof v === "string" ? v : ""
		else {
			const m = /^\/surface\/(state\/)?lane\/([1-8])\/(trem|sounding)$/.exec(path)
			if (!m || !!m[1] !== (m[3] === "sounding")) return
			const i = Number(m[2]) - 1
			const on = Number(v) !== 0
			if (m[3] === "trem") this.motion[i] = on
			else {
				if (on && !this.sounding[i]) this.triggeredAt[i] = Date.now()
				this.sounding[i] = on
			}
		}
		ctx.setDirty()
	}

	private pollView(nowMs: number, ctx: PageContext) {
		const link = ctx.surface
		if (!link) return
		if (nowMs - this.lastSubMs >= SUBSCRIBE_MS) {
			this.lastSubMs = nowMs
			link.send("/surface/subscribe", "127.0.0.1", link.port, "lanes")
		}
		if (nowMs - this.lastPollMs < VIEW_POLL_MS) return
		this.lastPollMs = nowMs
		for (const a of ["/surface/view/focus", "/surface/view/linked", "/surface/view/fx", "/surface/lane/*/trem"]) link.send("/surface/get", a)
	}

	private recorderKey(idx: number, ctx: PageContext) {
		const r = this.recorders[idx]
		if (ctx.modifiers.shift1) r.clear()
		else r.press(Date.now())
		this.syncDamp(ctx) // a stopped or cleared loop lets go of the damp it held
		this.emitPatterns(ctx)
		this.syncTimer()
	}

	/**
	 * From Max. `/voice/<n>/<param> <1|0>` syncs a switch WITHOUT sending it back (the
	 * instrument is the one telling us); `/voice/<n>/state <0|1|2>` is activity feedback.
	 */
	onOsc(path: string, args: any[], _ctx: PageContext) {
		const m = /^\/voice\/(\d+)\/(\w+)$/.exec(path)
		if (!m) return
		const voice = Number(m[1]) - 1
		if (voice < 0 || voice >= VOICES) return
		const value = Number(args[0])
		if (!Number.isFinite(value)) return
		const key = m[2]
		if (key === "state") {
			const s = Math.round(value)
			if (s < 0 || s > 2) return
			if (s === 1) this.triggeredAt[voice] = Date.now()
			this.activity[voice] = s
			return
		}
		if (!isParam(key) || key === "damp") return // damp is the hand's, not the instrument's
		this.toggles[key][voice] = value !== 0
	}

	render(ctx: PageContext): LedFrame {
		const f = makeFrame(ctx.size)
		const set = (x: number, y: number, lvl: number) => {
			if (x < ctx.size.width && y < ctx.size.height) f[ledIndex(ctx.size, x, y)] = lvl
		}
		for (const param of PARAMS) {
			const y = ROW_OF[param]
			const on = param === "damp" ? this.dampState() : this.toggles[param]
			const hi = param === "damp" ? LVL_HELD : LVL_ON
			for (let v = 0; v < VOICES; v++) set(VOICE_COL0 + v, y, on[v] ? hi : LVL_OFF)
			const all = param === "damp" ? this.dampAllHeld : allOn(on)
			set(COL_ALL, y, all ? hi : on.some(Boolean) ? LVL_SOME : LVL_OFF)
		}
		const now = Date.now()
		const lastCol = ctx.size.width - 1
		const blinkOn = now % (BLINK_MS * 2) < BLINK_MS
		for (let i = 0; i < RECORDERS; i++) {
			const st = this.recorders[i].state
			set(lastCol, i,
				st === "recording" ? (blinkOn ? LVL_REC_ARMED : LVL_REC_EMPTY)
				: st === "playing" ? LVL_REC_PLAYING
				: st === "stopped" ? LVL_REC_STOPPED
				: LVL_REC_EMPTY)
		}
		for (let i = 0; i < TWISTER_PAGES.length; i++) {
			set(lastCol, TWISTER_ROW0 + i, i === this.twisterPage ? LVL_TWISTER_ON : LVL_TWISTER_OFF)
		}
		if (this.live) {
			for (let v = 0; v < VOICES; v++) {
				const isFocus = this.focus === v + 1
				const flashing = now - this.triggeredAt[v] < TRIGGER_MS
				// A sound flashes a lane; the focused one is bright already, so it dips instead.
				set(VOICE_COL0 + v, FOCUS_ROW,
					isFocus ? (flashing ? LVL_FOCUS_DIP : LVL_FOCUS)
					: flashing ? LVL_TRIGGERED
					: this.linked.includes(String(v + 1)) ? LVL_LINKED : LVL_OFF)
				set(VOICE_COL0 + v, MOTION_ROW, this.motion[v] ? LVL_ON : LVL_OFF)
			}
			set(COL_ALL, FOCUS_ROW, this.linked.length === VOICES ? LVL_ON : LVL_OFF)
			set(COL_ALL, MOTION_ROW, allOn(this.motion) ? LVL_ON : this.motion.some(Boolean) ? LVL_SOME : LVL_OFF)
			for (const [x, track] of FX_AT_X) set(x, FX_ROW, track === this.fx ? LVL_ON : LVL_FX_OFF)
		} else
			for (let v = 0; v < VOICES; v++) {
				const s = this.activity[v]
				const flashing = s === 1 && now - this.triggeredAt[v] < TRIGGER_MS
				set(VOICE_COL0 + v, FEEDBACK_ROW, flashing ? LVL_TRIGGERED : s ? LVL_RINGING : 0)
			}
		drawSelector(f, ctx)
		return f
	}

	/** Loops are content: saved in a preset, restored stopped. The switches are not. */
	serialize() {
		return { patterns: this.recorders.map((r) => r.snapshot()) }
	}

	restore(config: unknown, ctx: PageContext) {
		if (!isRecord(config) || config.patterns === undefined) return
		const raw = Array.isArray(config.patterns) ? config.patterns : []
		for (let i = 0; i < RECORDERS; i++) {
			const node = isRecord(raw[i]) ? raw[i] : {}
			this.recorders[i].restore({
				lengthMs: num(node.lengthMs, 0, 0, MAX_RECORD_MS),
				events: records(node.events, MAX_PATTERN_EVENTS, (e): PatternEvent | undefined => {
					const atMs = num(e.atMs, -1, 0, MAX_RECORD_MS)
					if (atMs < 0) return undefined
					if (e.ctl !== undefined) {
						const c = isRecord(e.ctl) ? e.ctl : {}
						if (typeof c.id !== "string" || !parseCtl(c.id)) return undefined
						return { atMs, step: 0, on: false, ctl: { id: c.id, value: bool(c.value, false) ? 1 : 0 } }
					}
					const step = Math.round(Number(e.step))
					if (!(step >= 0 && step < VOICES)) return undefined
					return { atMs, step, on: bool(e.on, false) }
				}),
			})
		}
		this.emitPatterns(ctx)
	}

	dispose(ctx: PageContext) {
		this.unsubscribe?.()
		this.unsurface?.()
		this.unsurface = null
		this.remoteDamp.fill(false)
		for (const r of this.recorders) r.clear()
		this.onBlur(ctx)
		this.syncTimer()
	}

	private announce(ctx: PageContext) {
		ctx.osc.send(`/grid/out/page/${ctx.slotLabel}/type`, "set-surface")
		this.emitPatterns(ctx)
	}

	private emitPatterns(ctx: PageContext) {
		const state = this.recorders.map((r) => ({ state: r.state, ms: Math.round(r.loopMs) }))
		ctx.osc.send(`/grid/out/page/${ctx.slotLabel}/patterns`, JSON.stringify(state))
	}

	private handDamp(v: number): boolean {
		return this.dampAllHeld || this.dampHeld.has(v)
	}

	/** A voice is damped while a hand OR any playing loop holds it. */
	private dampState(): boolean[] {
		return Array.from(
			{ length: VOICES },
			(_, v) =>
				this.handDamp(v) ||
				this.remoteDamp[v] ||
				this.recorders.some((r) => r.sounding.has(v)),
		)
	}

	private syncDamp(ctx: PageContext) {
		// Record the HAND's transitions only — never what a loop is holding.
		const nowMs = Date.now()
		for (let v = 0; v < VOICES; v++) {
			const hand = this.handDamp(v)
			if (hand === this.handDampLast[v]) continue
			this.handDampLast[v] = hand
			for (const r of this.recorders) r.record(v, hand, nowMs)
		}
		if (this.recorders.some((r) => r.state === "recording")) this.syncTimer()
		const want = this.dampState()
		let changed = false
		for (let v = 0; v < VOICES; v++) {
			if (want[v] === this.dampSent[v]) continue
			this.dampSent[v] = want[v]
			this.emit(ctx, v, "damp", want[v])
			changed = true
		}
		if (changed) ctx.shared?.set(DAMP_STATE_SURFACE, [...want])
	}

	/** `byHand` = your press, which armed loopers record; loop playback passes false. */
	private setToggle(param: Toggle, voice: number, on: boolean, ctx: PageContext, byHand: boolean) {
		if (this.toggles[param][voice] === on) return
		this.toggles[param][voice] = on
		if (byHand) {
			const nowMs = Date.now()
			for (const r of this.recorders) r.recordControl(ctlId(param, voice), on ? 1 : 0, nowMs)
		}
		this.emit(ctx, voice, param, on)
	}

	private syncTimer() {
		const needed = this.recorders.some((r) => r.isRunning) || (this.live && (this.focused || this.rangePending !== null))
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
		const before = this.recorders.map((r) => r.state)
		for (const r of this.recorders) {
			r.advance(nowMs, dt)
			for (const [id, value] of r.takeControls()) {
				const c = parseCtl(id)
				if (!c) continue
				if (c.param !== "motion") this.setToggle(c.param, c.voice, value !== 0, ctx, false)
				else if (this.live) this.setMotion(c.voice, value !== 0, ctx, false)
			}
		}
		// A second FOCUS key held long enough: the lanes between the two become the selection.
		const rp = this.rangePending
		if (rp && nowMs - rp.at >= LONG_PRESS_MS) {
			this.rangePending = null
			const [lo, hi] = [Math.min(rp.anchor, rp.lane), Math.max(rp.anchor, rp.lane)]
			let digits = ""
			for (let l = lo; l <= hi; l++) digits += String(l + 1)
			this.setLinked(digits, ctx)
		}
		if (this.live && this.focused) this.pollView(nowMs, ctx)
		this.syncDamp(ctx)
		// A take that hit the length cap closes itself into playing.
		if (this.recorders.some((r, i) => r.state !== before[i])) this.emitPatterns(ctx)
		this.syncTimer()
	}

	private emit(ctx: PageContext, voice: number, param: Param, on: boolean) {
		ctx.osc.send(`/grid/out/page/${ctx.slotLabel}/voice`, voice + 1, param, on ? 1 : 0)
	}
}

export const keymap: KeySpec[] = [
	...SELECTOR_KEYS,
	{ x: COL_ALL, y: ROW_OF.bow, h: 3, name: "All voices", short: "All", help: "Set the whole row for all eight voices (damp: hold).", lit: [LVL_SOME, LVL_OFF, LVL_OFF] },
	{ x: VOICE_COL0, y: ROW_OF.damp, w: VOICES, name: "Damp", help: "Hold to damp that voice.", lit: LVL_OFF },
	{ x: VOICE_COL0, y: ROW_OF.freeze, w: VOICES, name: "Freeze", help: "Toggle freeze per voice.", lit: [LVL_ON, LVL_OFF, LVL_OFF, LVL_ON, LVL_OFF, LVL_OFF, LVL_OFF, LVL_OFF] },
	{ x: VOICE_COL0, y: ROW_OF.bow, w: VOICES, name: "Bow", help: "Toggle bow per voice.", lit: [LVL_OFF, LVL_ON, LVL_OFF, LVL_OFF, LVL_OFF, LVL_OFF, LVL_OFF, LVL_OFF] },
	{ x: VOICE_COL0, y: FEEDBACK_ROW, w: VOICES, name: "Voice activity", help: "From Max: flashes on a trigger, stays dim while ringing.", lit: [LVL_TRIGGERED, LVL_RINGING, 0, LVL_RINGING, 0, 0, 0, 0] },
	...(HOME_VIEW_LIVE
		? ([
				{ x: VOICE_COL0, y: FOCUS_ROW, w: VOICES, name: "Focus", help: "Focus that lane alone. Shift 1 + press adds or drops it; hold one and long-press another for the range. Shift 2 + press: that lane home. Flashes on sound.", lit: [LVL_FOCUS, LVL_LINKED, LVL_OFF, LVL_OFF, LVL_OFF, LVL_OFF, LVL_OFF, LVL_OFF] },
				{ x: VOICE_COL0, y: MOTION_ROW, w: VOICES, name: "Motion", help: "Toggle the lane's motion (tremolo).", lit: LVL_OFF },
				{ x: COL_ALL, y: FOCUS_ROW, h: 2, name: "All: select / motion", short: "All", help: "y3 selects all eight (shift 2: everyone home); y4 switches motion for all.", lit: LVL_OFF },
				{ x: 4, y: FX_ROW, w: 4, name: "FX tracks A-D", short: "FX", help: "Bring the FX page to the front in the window, on that track's chain.", lit: LVL_FX_OFF },
				{ x: 9, y: FX_ROW, w: 3, name: "S1, S2, Master", short: "FX", help: "Bring the FX page to the front in the window, on that chain.", lit: LVL_FX_OFF },
			] as KeySpec[])
		: []),
	{ x: 15, y: 0, h: RECORDERS, name: "Loopers 1–3", help: "Record damp and switch gestures: arm, play, pause. Shift 1 + press clears.", lit: [LVL_REC_PLAYING, LVL_REC_STOPPED, LVL_REC_EMPTY] },
	{ x: 15, y: TWISTER_ROW0, h: TWISTER_PAGES.length, name: "Twister pages", short: "Twister", help: `Switch the Twister's page: ${TWISTER_PAGES.join(", ")}.`, lit: [LVL_TWISTER_ON, LVL_TWISTER_OFF, LVL_TWISTER_OFF, LVL_TWISTER_OFF, LVL_TWISTER_OFF] },
]

export const page: PageModule = {
	name: "set-surface",
	label: "Set Surface",
	keymap,
	create: () => new SetSurfacePage(),
}
