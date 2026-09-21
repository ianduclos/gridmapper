/* Page: Set Hot  (hotelier concert — voice control for the modal instrument)
 * ------------------------------------------------------------------------------
 * Summary : Per-voice switches for hotelier's six modal voices, in the bottom four rows.
 * Input   : col 0 rows 0-5 = page selector (util/pageSelector.ts). Bottom four rows,
 *           bottom → top: DAMP (row 7, momentary — damped while held), FREEZE (row 6),
 *           ROLL (row 5), BOW (row 4) — the last three latching toggles.
 *           Col 2 = ALL: it sets all six voices in its row (a toggle turns them all ON
 *           unless all six already are, then all OFF; damp-all holds all six down).
 *           Cols 4-9 = voices 1-6. Cols 1 and 3 are gaps.
 *           Col 15 rows 0-3 = 4 LOOPERS (util/patternRecorder.ts, as in isometric): one key
 *           cycles empty → rec → play → stop, SHIFT 1 (col 15 row 7) + press clears. A take
 *           starts at the first gesture. Damp records as momentary notes (step = voice),
 *           the toggles as control events (`<param>/<voice>` → 1|0). Playback drives the
 *           same switches and sends the same OSC; the latest move wins, a hand press holds
 *           until a loop's next move, and a voice is damped while a hand OR a loop holds it.
 *           Only HAND gestures are recorded — loops never tap each other. Loops keep running
 *           when the page loses focus; stop/clear releases whatever damp a loop held.
 * Output  : /grid/out/page/<slot>/voice <n 1-6> <damp|freeze|bow|roll> <1|0>, per voice
 *           and only on a CHANGE — an ALL press sends one message per voice that moved.
 * Input   : (from Max, never echoed back)
 *           /grid/in/page/<slot>/voice/<n>/<damp|freeze|bow|roll> <1|0> — sync a switch
 *           to the instrument's real state (e.g. after its boot reset or a sound recall).
 *           /grid/in/page/<slot>/voice/<n>/state <0 idle|1 triggered|2 ringing> — the
 *           voice activity FEEDBACK, drawn on row 3 above each voice (provisional spot).
 *           Also out: /grid/out/page/<slot>/patterns <json> [{state, ms}] per looper.
 * Display : toggles dim 2 off / 12 on; damp 15 while held; ALL 12 when all six are on,
 *           6 when some are. Feedback: triggered flashes 15 for TRIGGER_MS, ringing 5.
 * Rules   : The SWITCHES are runtime state — not saved, nothing sent at load, so recalling a
 *           preset can never unfreeze a voice. The LOOPS are content and are saved in a
 *           preset (serialize/restore); they come back stopped. Roll starts ARMED on all six,
 *           matching the instrument's own default (`voice N roll` defaults to 1). Damp is
 *           released on blur, since the key-up would otherwise land on another page.
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
import { SELECTOR_KEYS, selectorKey, drawSelector } from "../util/pageSelector.js"
import { PatternRecorder, MAX_RECORD_MS, type PatternEvent } from "../util/patternRecorder.js"
import { isRecord, num, bool, records } from "../util/restoreGuards.js"

export const VOICES = 6
const COL_ALL = 2
const VOICE_COL0 = 4 // voice 1; voices run to col 9
const FEEDBACK_ROW = 3

export const PARAMS = ["damp", "freeze", "bow", "roll"] as const
export type Param = (typeof PARAMS)[number]
const isParam = (v: string): v is Param => (PARAMS as readonly string[]).includes(v)
const ROW_OF: Record<Param, number> = { damp: 7, freeze: 6, roll: 5, bow: 4 }
const PARAM_AT_ROW = new Map<number, Param>(PARAMS.map((p) => [ROW_OF[p], p]))

const LVL_OFF = 2
const LVL_ON = 12
const LVL_HELD = 15
const LVL_SOME = 6
const LVL_TRIGGERED = 15
const LVL_RINGING = 5
/** How long a trigger reads as a flash before falling back to "ringing". */
const TRIGGER_MS = 150

/** Loopers down the last column, and shift 1 at its foot — the isometric positions. */
const RECORDERS = 4
const SHIFT1_ROW = 7
const LVL_REC_EMPTY = 1
const LVL_REC_ARMED = 12 // bright half of the recording blink
const LVL_REC_STOPPED = 5
const LVL_REC_PLAYING = 15
const LVL_SHIFT = 1
const BLINK_MS = 220
const TIMER_MS = 5
const MAX_PATTERN_EVENTS = 20_000

type Toggle = Exclude<Param, "damp">
const TOGGLES: readonly Toggle[] = ["freeze", "roll", "bow"]
const ctlId = (param: Toggle, voice: number) => `${param}/${voice + 1}`
const parseCtl = (id: string): { param: Toggle; voice: number } | null => {
	const m = /^(freeze|roll|bow)\/([1-6])$/.exec(id)
	return m ? { param: m[1] as Toggle, voice: Number(m[2]) - 1 } : null
}

const allOn = (a: readonly boolean[]) => a.every(Boolean)

export class SetHotPage implements Page {
	/** Latching switches, per param, per voice (index 0 = voice 1). */
	private toggles: Record<Toggle, boolean[]> = {
		freeze: new Array(VOICES).fill(false),
		bow: new Array(VOICES).fill(false),
		roll: new Array(VOICES).fill(true),
	}
	/** Damp is momentary: a voice is damped while its own key OR the ALL key is down. */
	private dampHeld = new Set<number>()
	private dampAllHeld = false
	/** What Max was last told about damp, so only changes go out. */
	private dampSent = new Array<boolean>(VOICES).fill(false)
	/** Hand damp as last recorded, so loopers see its transitions. */
	private handDampLast = new Array<boolean>(VOICES).fill(false)

	private recorders = Array.from({ length: RECORDERS }, () => new PatternRecorder())
	private timer: ReturnType<typeof setInterval> | null = null
	private lastTickMs = 0
	/** Kept for the timer, which has no ctx of its own. */
	private ctx: PageContext | null = null
	/** Voice activity from Max: 0 idle, 1 triggered, 2 ringing, plus when it triggered. */
	private activity = new Array<number>(VOICES).fill(0)
	private triggeredAt = new Array<number>(VOICES).fill(0)

	init(ctx: PageContext) {
		this.ctx = ctx
		this.announce(ctx)
	}

	onFocus(ctx: PageContext) {
		this.announce(ctx)
	}

	onBlur(ctx: PageContext) {
		// Your hands let go; the loops keep playing (same rule as isometric).
		this.dampHeld.clear()
		this.dampAllHeld = false
		this.syncDamp(ctx)
		ctx.setShift(1, false)
	}

	onKey(ev: KeyEvent, ctx: PageContext) {
		if (selectorKey(ev, ctx)) return
		const lastCol = ctx.size.width - 1
		if (ev.x === lastCol && ev.y === SHIFT1_ROW) {
			ctx.setShift(1, ev.s === 1)
			return
		}
		if (ev.x === lastCol && ev.y < RECORDERS) {
			if (ev.s) this.recorderKey(ev.y, ctx)
			return
		}
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
		set(lastCol, SHIFT1_ROW, ctx.modifiers.shift1 ? LVL_HELD : LVL_SHIFT)
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
		for (const r of this.recorders) r.clear()
		this.onBlur(ctx)
		this.syncTimer()
	}

	private announce(ctx: PageContext) {
		ctx.osc.send(`/grid/out/page/${ctx.slotLabel}/type`, "set-hot")
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
			(_, v) => this.handDamp(v) || this.recorders.some((r) => r.sounding.has(v)),
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
		for (let v = 0; v < VOICES; v++) {
			if (want[v] === this.dampSent[v]) continue
			this.dampSent[v] = want[v]
			this.emit(ctx, v, "damp", want[v])
		}
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
		const before = this.recorders.map((r) => r.state)
		for (const r of this.recorders) {
			r.advance(nowMs, dt)
			for (const [id, value] of r.takeControls()) {
				const c = parseCtl(id)
				if (c) this.setToggle(c.param, c.voice, value !== 0, ctx, false)
			}
		}
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
	{ x: COL_ALL, y: ROW_OF.bow, h: 4, name: "All voices", help: "Set the whole row for all six voices (damp: hold)." },
	{ x: VOICE_COL0, y: ROW_OF.damp, w: VOICES, name: "Damp", help: "Hold to damp that voice." },
	{ x: VOICE_COL0, y: ROW_OF.freeze, w: VOICES, name: "Freeze", help: "Toggle freeze per voice." },
	{ x: VOICE_COL0, y: ROW_OF.roll, w: VOICES, name: "Roll", help: "Toggle roll per voice." },
	{ x: VOICE_COL0, y: ROW_OF.bow, w: VOICES, name: "Bow", help: "Toggle bow per voice." },
	{ x: VOICE_COL0, y: FEEDBACK_ROW, w: VOICES, name: "Voice activity", help: "From Max: flashes on a trigger, stays dim while ringing." },
	{ x: 15, y: 0, h: RECORDERS, name: "Loopers 1–4", help: "Record damp and switch gestures: arm, play, pause. Shift 1 + press clears." },
	{ x: 15, y: SHIFT1_ROW, name: "Shift 1", help: "Hold, then press a looper to clear it." },
]

export const page: PageModule = {
	name: "set-hot",
	label: "Set Hot",
	keymap,
	create: () => new SetHotPage(),
}
