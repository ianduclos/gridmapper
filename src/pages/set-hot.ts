/* Page: Set Hot  (hotelier concert — voice control for the modal instrument)
 * ------------------------------------------------------------------------------
 * Summary : Per-voice switches for hotelier's six modal voices, in the bottom four rows.
 * Input   : col 0 rows 0-5 = page selector (util/pageSelector.ts). Bottom four rows,
 *           bottom → top: DAMP (row 7, momentary — damped while held), FREEZE (row 6),
 *           ROLL (row 5), BOW (row 4) — the last three latching toggles.
 *           Col 2 = ALL: it sets all six voices in its row (a toggle turns them all ON
 *           unless all six already are, then all OFF; damp-all holds all six down).
 *           Cols 4-9 = voices 1-6. Cols 1 and 3 are gaps.
 * Output  : /grid/out/page/<slot>/voice <n 1-6> <damp|freeze|bow|roll> <1|0>, per voice
 *           and only on a CHANGE — an ALL press sends one message per voice that moved.
 * Input   : (from Max, never echoed back)
 *           /grid/in/page/<slot>/voice/<n>/<damp|freeze|bow|roll> <1|0> — sync a switch
 *           to the instrument's real state (e.g. after its boot reset or a sound recall).
 *           /grid/in/page/<slot>/voice/<n>/state <0 idle|1 triggered|2 ringing> — the
 *           voice activity FEEDBACK, drawn on row 3 above each voice (provisional spot).
 * Display : toggles dim 2 off / 12 on; damp 15 while held; ALL 12 when all six are on,
 *           6 when some are. Feedback: triggered flashes 15 for TRIGGER_MS, ringing 5.
 * Rules   : Runtime state only — nothing is saved in a preset and nothing is sent at load,
 *           so recalling a preset can never unfreeze a voice. Roll starts ARMED on all six,
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
import type { PageModule } from "../core/pageModule.js"
import { selectorKey, drawSelector } from "../util/pageSelector.js"

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

const allOn = (a: readonly boolean[]) => a.every(Boolean)

export class SetHotPage implements Page {
	/** Latching switches, per param, per voice (index 0 = voice 1). */
	private toggles: Record<Exclude<Param, "damp">, boolean[]> = {
		freeze: new Array(VOICES).fill(false),
		bow: new Array(VOICES).fill(false),
		roll: new Array(VOICES).fill(true),
	}
	/** Damp is momentary: a voice is damped while its own key OR the ALL key is down. */
	private dampHeld = new Set<number>()
	private dampAllHeld = false
	/** What Max was last told about damp, so only changes go out. */
	private dampSent = new Array<boolean>(VOICES).fill(false)
	/** Voice activity from Max: 0 idle, 1 triggered, 2 ringing, plus when it triggered. */
	private activity = new Array<number>(VOICES).fill(0)
	private triggeredAt = new Array<number>(VOICES).fill(0)

	init(ctx: PageContext) {
		ctx.osc.send(`/grid/out/page/${ctx.slotLabel}/type`, "set-hot")
	}

	onFocus(ctx: PageContext) {
		ctx.osc.send(`/grid/out/page/${ctx.slotLabel}/type`, "set-hot")
	}

	onBlur(ctx: PageContext) {
		this.dampHeld.clear()
		this.dampAllHeld = false
		this.syncDamp(ctx)
	}

	onKey(ev: KeyEvent, ctx: PageContext) {
		if (selectorKey(ev, ctx)) return
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
			for (let v = 0; v < VOICES; v++) this.setToggle(param, v, next, ctx)
		} else this.setToggle(param, voice, !row[voice], ctx)
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
		for (let v = 0; v < VOICES; v++) {
			const s = this.activity[v]
			const flashing = s === 1 && now - this.triggeredAt[v] < TRIGGER_MS
			set(VOICE_COL0 + v, FEEDBACK_ROW, flashing ? LVL_TRIGGERED : s ? LVL_RINGING : 0)
		}
		drawSelector(f, ctx)
		return f
	}

	dispose(ctx: PageContext) {
		this.onBlur(ctx)
	}

	private dampState(): boolean[] {
		return Array.from({ length: VOICES }, (_, v) => this.dampAllHeld || this.dampHeld.has(v))
	}

	private syncDamp(ctx: PageContext) {
		const want = this.dampState()
		for (let v = 0; v < VOICES; v++) {
			if (want[v] === this.dampSent[v]) continue
			this.dampSent[v] = want[v]
			this.emit(ctx, v, "damp", want[v])
		}
	}

	private setToggle(param: Exclude<Param, "damp">, voice: number, on: boolean, ctx: PageContext) {
		if (this.toggles[param][voice] === on) return
		this.toggles[param][voice] = on
		this.emit(ctx, voice, param, on)
	}

	private emit(ctx: PageContext, voice: number, param: Param, on: boolean) {
		ctx.osc.send(`/grid/out/page/${ctx.slotLabel}/voice`, voice + 1, param, on ? 1 : 0)
	}
}

export const page: PageModule = {
	name: "set-hot",
	label: "Set Hot",
	create: () => new SetHotPage(),
}
