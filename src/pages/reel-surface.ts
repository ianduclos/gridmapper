/* REEL pads + the step line (idk.surface), slot d.
 * ------------------------------------------------------------------------------
 * Spec: idk.surface docs/specs/2026-11-11-reel-step-line-design.md, section 7; Ian's picks:
 * docs/design/2026-11-11-reel-pads-grid-ideas.md. The app owns the line and its timing;
 * this page edits and shows it, and plays the two lanes' slices by hand.
 *
 * On since the surface session confirmed the names live (2026-11-11): `REEL_PAGE_LIVE` in
 * util/pageSelectorSurface.ts. Off, the page is the left column only and sends nothing.
 * Sheet: docs/reel-surface-cheatsheet.md changes in the same commit as any key or light here.
 *
 * Layout  : x0 the system's column, this page's key at y4.
 *           Steps 1-36 on x2-x13, y0-y2 (twelve a row, step 1 top left).
 *           LEFT block x2-x5 and RIGHT block x10-x13, y4-y7: pads 1-16, 1 at the bottom
 *           left, counting right then up (the same in both blocks).
 *           Each block's keys on its inner side (x6 LEFT, x9 RIGHT): y4 SPEED, y5 ROLL,
 *           y6 CHANCE, y7 BLEND. The value in the centre (x7-x8, y4-y7, bottom = lowest)
 *           while one of them is lit. Play x14 y7. Gesture loops x15 y0-y2.
 *           ARP x14 y4 (free in column 14; Ian, 2026-11-11).
 * Arp     : while ARP is lit a pad press sends /surface/arp/call <id> <lane> slice <pad> instead
 *           of the direct slice, and its release /surface/arp/call/off <id>; the APP times the
 *           arp (spec 2026-11-11-grid-arp-design.md). id = 64 + (pad - 1) * 2 + track (0 LEFT,
 *           1 RIGHT), so 64-95 and rising id is up; both blocks are one chord. Writing steps
 *           (pad held + step tap) is unchanged. Loops record the presses but play direct, never
 *           arpeggiated. Unlighting ARP, or leaving the page, ends every call held. The call whose
 *           step sounds (/surface/arp/call/at) is the brightest pad. Not saved.
 * Pads    : a press fires that slice on the track's lane at x1 and makes that track "yours".
 * Steps   : hold a pad, tap steps: the step takes that slice with the track's four values;
 *           a step already holding that very slice is cleared instead.
 *           Shift 1 + a step: the length.
 * Keys    : SPEED, ROLL, CHANCE, BLEND: hold = for now, tap = stay (tap again to let go).
 *           While one is lit, the centre picks its value for that track (ROLL and BLEND:
 *           press the lit value for none), and a tapped step takes the value showing.
 *           BLEND's centre also moves the lane's live BLEND.
 * Lanes   : hold the page key (pressed while on the page): the top row x4-x11 is lanes 1-8;
 *           the first tap sets LEFT's lane, a second RIGHT's. Tapping the lane a track
 *           already has sets that track to none.
 * Lights  : your track's steps bright, the other's faint, both brightest; steps past the
 *           length dark; the playing step inverts.
 * Loops   : pad presses only (the steps are the app's, never recorded here).
 * Reads   : the whole line as one string (/surface/reel/line/state) on focus and slowly
 *           after; changes and the playing step (line/at, only when it moves) arrive on the
 *           `values` topic.
 */

import { type Page, type PageContext, type KeyEvent, type LedFrame, makeFrame, ledIndex, float } from "../core/types.js"
import type { KeySpec, PageModule, SettingSpec } from "../core/pageModule.js"
import { SELECTOR_KEYS, selectorKey, shiftKey, releaseShifts, drawSelector, REEL_PAGE_LIVE, REEL_ROW } from "../util/pageSelectorSurface.js"
import { PatternRecorder, MAX_RECORD_MS, type PatternEvent } from "../util/patternRecorder.js"
import { isRecord, num, bool, records } from "../util/restoreGuards.js"

export const STEPS = 36
const STEP_X0 = 2
const STEPS_A_ROW = 12
const STEP_ROWS = 3
const BLOCK_X0 = [2, 10] as const
const BLOCK_Y0 = 4
const MOD_X = [6, 9] as const
const CENTRE_X0 = 7
const PLAY_X = 14
const PLAY_Y = 7
const ARP_X = 14
const ARP_Y = 4
const LANE_X0 = 4
const LANES = 8
const RECORDERS = 3
const PADS = 16

export const MODS = ["speed", "roll", "chance", "blend"] as const
export type Mod = (typeof MODS)[number]
/** The centre's four rows, bottom to top. */
export const VALUES: Record<Mod, readonly number[]> = {
	speed: [-1, 0.5, 1, 2],
	roll: [1, 2, 3, 4], // flam, drag, ruff, roll; 0 = none
	chance: [25, 50, 75, 100],
	blend: [1, 2, 3, 4], // A, one third, two thirds, B; 0 = none
}
const NONE_OK: Record<Mod, boolean> = { speed: false, roll: true, chance: false, blend: true }

export interface Step { slice: number; speed: number; roll: number; chance: number; blend: number }
const fresh = (): Step => ({ slice: 0, speed: 1, roll: 0, chance: 100, blend: 0 })
type Track = 0 | 1

const LINE = "/surface/reel/line"
const TRACK_ADDR = [`${LINE}/left`, `${LINE}/right`] as const
const TAP_MS = 350
const TIMER_MS = 5
const SUBSCRIBE_MS = 3000
const POLL_MS = 5000
const FLASH_MS = 110
const BLINK_MS = 220
const MAX_PATTERN_EVENTS = 20_000

const LVL_STEP_EMPTY = 2
const LVL_STEP_OTHER = 4
const LVL_STEP_MINE = 10
const LVL_STEP_BOTH = 15
const LVL_AT_ON_LIT = 5
const LVL_AT_ON_DIM = 12
const LVL_PAD = 4
const LVL_PAD_FLASH = 12
const LVL_PAD_HELD = 15
const LVL_PAD_ARP_HELD = 9 // ARP lit: held but not sounding; the sounding one is LVL_PAD_HELD
const LVL_ARP_ON = 12
const LVL_MOD = 4
const LVL_MOD_ON = 15
const LVL_VALUE = 4
const LVL_VALUE_ON = 15
const LVL_PLAY = 5
const LVL_PLAY_ON = 15
const LVL_LANE = 3
const LVL_LANE_LEFT = 13
const LVL_LANE_RIGHT = 8
const LVL_REC_EMPTY = 1
const LVL_REC_ARMED = 12
const LVL_REC_STOPPED = 5
const LVL_REC_PLAYING = 15

const SPECS: SettingSpec[] = [
	{ key: "mode", label: "A step holds", type: "enum", presentation: "buttons", options: ["one-slice", "one-each"], optionLabels: { "one-slice": "one slice a step", "one-each": "one from each" }, default: "one-slice", help: "One slice a step: writing a track's slice onto a step clears the other track's there. Kept by surface, in the patch." },
]

export interface LineState { length: number; lanes: [number, number]; mode: "one-slice" | "one-each"; steps: [Step[], Step[]] }
const SPEEDS = VALUES.speed

/**
 * surface's /surface/reel/line/state string (format version 1), space-separated:
 * `1 <len> <left 0-8> <right 0-8> <mode 0|1> <spacing> <level> L <36 steps> R <36 steps>`;
 * a step is `-` (all defaults) or `slice:speed:roll:chance:blend` in line/step units.
 * Anything else reads as null and the page keeps what it has.
 */
export function parseLineState(str: string): LineState | null {
	const p = str.trim().split(/\s+/)
	if (p.length !== 9 + 2 * STEPS || p[0] !== "1" || p[7] !== "L" || p[8 + STEPS] !== "R") return null
	const int = (v: string, lo: number, hi: number) => {
		const n = Number(v)
		return Number.isInteger(n) && n >= lo && n <= hi ? n : null
	}
	const length = int(p[1], 1, STEPS), left = int(p[2], 0, LANES), right = int(p[3], 0, LANES), mode = int(p[4], 0, 1)
	if (length === null || left === null || right === null || mode === null) return null
	const track = (from: number): Step[] | null => {
		const out: Step[] = []
		for (let i = 0; i < STEPS; i++) {
			const w = p[from + i]
			if (w === "-") { out.push(fresh()); continue }
			const q = w.split(":")
			if (q.length !== 5) return null
			const slice = int(q[0], 0, 64), roll = int(q[2], 0, 4), chance = int(q[3], 25, 100), blend = int(q[4], 0, 4)
			const speed = Number(q[1])
			if (slice === null || roll === null || chance === null || blend === null || !SPEEDS.includes(speed)) return null
			out.push({ slice, speed, roll, chance, blend })
		}
		return out
	}
	const l = track(8), r = track(9 + STEPS)
	return l && r ? { length, lanes: [left, right], mode: mode ? "one-each" : "one-slice", steps: [l, r] } : null
}

const noteId = (t: Track, pad: number) => t * 64 + pad
/** The arp's id for a pad (1-16) of a track: 64-95, rising id = up. */
export const arpId = (t: Track, pad: number) => 64 + (pad - 1) * 2 + t
const AT_ADDR = "/surface/arp/call/at"

export class ReelSurfacePage implements Page {
	private steps: [Step[], Step[]] = [Array.from({ length: STEPS }, fresh), Array.from({ length: STEPS }, fresh)]
	private length = STEPS
	private lanes: [number, number] = [0, 0]
	/** Slices each track's lane has; -1 = not heard yet (every pad plays). */
	private slices: [number, number] = [-1, -1]
	private playing = false
	private at = 0
	private mode = "one-slice"
	/** The values a newly written step takes, per track. */
	private cur: [Step, Step] = [fresh(), fresh()]
	private touched: Track = 0
	/** Pads now down, oldest first. */
	private held: Array<{ t: Track; pad: number }> = []
	private modHeld: { t: Track; mod: Mod; at: number; used: boolean } | null = null
	private modLatched: { t: Track; mod: Mod } | null = null
	private pageKeyHeld = false
	/** ARP: runtime only. The calls surface holds for this page, by id, with the lane they went to. */
	private arp = false
	private calls = new Map<number, number>()
	private callAt = -1
	private lanePicks = 0
	private flashAt: [number[], number[]] = [new Array(PADS + 1).fill(0), new Array(PADS + 1).fill(0)]
	private recorders = Array.from({ length: RECORDERS }, () => new PatternRecorder())
	private loopHeld = this.recorders.map(() => new Set<number>())
	private timer: ReturnType<typeof setInterval> | null = null
	private lastTickMs = 0
	private ctx: PageContext | null = null
	private focused = false
	private lastPollMs = 0
	private lastSubMs = 0
	private unsurface: (() => void) | null = null

	constructor(private live: boolean = REEL_PAGE_LIVE) {}

	init(ctx: PageContext) {
		this.ctx = ctx
		if (this.live) this.unsurface = ctx.surface?.on((path, args) => this.hear(path, args, ctx)) ?? null
		this.announce(ctx)
	}

	onFocus(ctx: PageContext) {
		this.focused = true
		this.lastPollMs = this.lastSubMs = 0
		this.announce(ctx)
		this.syncTimer()
	}

	onBlur(ctx: PageContext) {
		this.focused = false
		for (const h of this.held) this.recordPad(h.t, h.pad, false)
		this.held = []
		this.callsOff(ctx)
		this.modHeld = null
		this.pageKeyHeld = false
		releaseShifts(ctx)
		this.syncTimer()
	}

	private active(): { t: Track; mod: Mod } | null {
		return this.modHeld ?? this.modLatched
	}

	onKey(ev: KeyEvent, ctx: PageContext) {
		// The page's own key, pressed while already here: held = pick the two lanes.
		if (this.live && ev.x === 0 && ev.y === REEL_ROW) {
			this.pageKeyHeld = ev.s === 1
			if (ev.s) this.lanePicks = 0
			ctx.setDirty()
			return
		}
		if (selectorKey(ev, ctx)) return
		if (shiftKey(ev, ctx)) return
		if (!this.live) return
		const { x, y } = ev
		if (x === ctx.size.width - 1 && y < RECORDERS) {
			if (ev.s) this.recorderKey(y, ctx)
			return
		}
		if (x === PLAY_X && y === PLAY_Y) {
			if (!ev.s) return
			this.playing = !this.playing
			if (!this.playing) this.at = 0
			ctx.surface?.send(`${LINE}/play`, this.playing ? 1 : 0)
			this.syncTimer()
			return
		}
		if (x === ARP_X && y === ARP_Y) {
			if (!ev.s) return
			this.arp = !this.arp
			if (!this.arp) this.callsOff(ctx)
			else for (const h of this.held) this.callOn(h.t, h.pad, ctx) // pads already down join the chord
			ctx.setDirty()
			return
		}
		if (y < STEP_ROWS) {
			if (!ev.s) return
			if (this.pageKeyHeld) {
				if (y === 0 && x >= LANE_X0 && x < LANE_X0 + LANES) this.pickLane(x - LANE_X0 + 1, ctx)
				return
			}
			if (x >= STEP_X0 && x < STEP_X0 + STEPS_A_ROW) this.stepKey(y * STEPS_A_ROW + (x - STEP_X0), ctx)
			return
		}
		if (y < BLOCK_Y0) return
		for (const t of [0, 1] as const) {
			if (x === MOD_X[t]) return this.modKey(t, MODS[y - BLOCK_Y0], ev.s === 1)
			const px = x - BLOCK_X0[t]
			if (px >= 0 && px < 4) return this.padKey(t, (7 - y) * 4 + px + 1, ev.s === 1, ctx)
		}
		if ((x === CENTRE_X0 || x === CENTRE_X0 + 1) && ev.s) this.centreKey(7 - y, ctx)
	}

	private pickLane(lane: number, ctx: PageContext) {
		const t: Track = this.lanePicks === 0 ? 0 : 1
		if (this.lanes[t] === lane) this.setLane(t, 0, ctx)
		else if (this.lanes[1 - t] === lane) return // both may not be the same lane
		else this.setLane(t, lane, ctx)
		this.lanePicks++
	}

	private setLane(t: Track, lane: number, ctx: PageContext) {
		this.lanes[t] = lane
		this.slices[t] = -1
		ctx.surface?.send(TRACK_ADDR[t], lane)
		if (lane) ctx.surface?.send("/surface/get", `/surface/lane/${lane}/reel/slices`)
	}

	private stepKey(i: number, ctx: PageContext) {
		if (ctx.modifiers.shift1) {
			this.length = i + 1
			ctx.surface?.send(`${LINE}/length`, this.length)
			return
		}
		const a = this.active()
		if (a) {
			// A lit key: a written step takes the value showing, for that key's track.
			if (this.modHeld) this.modHeld.used = true
			const s = this.steps[a.t][i]
			if (s.slice) {
				s[a.mod] = this.cur[a.t][a.mod]
				this.touched = a.t
				return this.sendStep(a.t, i, ctx)
			}
			// An empty step with a pad held is written below, as with no key lit.
		}
		const h = this.held[this.held.length - 1]
		if (!h) return
		const s = this.steps[h.t][i]
		if (s.slice === h.pad) {
			this.steps[h.t][i] = fresh()
			ctx.surface?.send(`${LINE}/clear`, h.t + 1, i + 1)
			return
		}
		this.steps[h.t][i] = { ...this.cur[h.t], slice: h.pad }
		if (this.mode === "one-slice") this.steps[1 - h.t][i] = fresh() // surface clears it too
		this.sendStep(h.t, i, ctx)
	}

	private sendStep(t: Track, i: number, ctx: PageContext) {
		const s = this.steps[t][i]
		ctx.surface?.send(`${LINE}/step`, t + 1, i + 1, s.slice, float(s.speed), s.roll, s.chance, s.blend)
	}

	private padKey(t: Track, pad: number, down: boolean, ctx: PageContext) {
		if (!down) {
			const k = this.held.findIndex((h) => h.t === t && h.pad === pad)
			if (k < 0) return
			this.held.splice(k, 1)
			this.callOff(arpId(t, pad), ctx)
			this.recordPad(t, pad, false)
			return
		}
		if (!this.playable(t, pad)) return
		this.touched = t
		this.held.push({ t, pad })
		if (this.arp) this.callOn(t, pad, ctx)
		else this.fire(t, pad, ctx)
		this.recordPad(t, pad, true)
	}

	private playable(t: Track, pad: number) {
		return this.lanes[t] > 0 && (this.slices[t] < 0 || pad <= this.slices[t])
	}

	private fire(t: Track, pad: number, ctx: PageContext) {
		if (!this.lanes[t]) return
		this.flashAt[t][pad] = Date.now()
		ctx.surface?.send(`/surface/lane/${this.lanes[t]}/reel/slice`, pad, float(1))
	}

	/** ARP lit: the pad is a call in the app's arp (a slice, speed left out = 1), not a direct slice. */
	private callOn(t: Track, pad: number, ctx: PageContext) {
		const id = arpId(t, pad)
		this.flashAt[t][pad] = Date.now()
		this.calls.set(id, this.lanes[t])
		ctx.surface?.send("/surface/arp/call", id, this.lanes[t], "slice", pad)
	}

	private callOff(id: number, ctx: PageContext) {
		if (!this.calls.delete(id)) return
		ctx.surface?.send("/surface/arp/call/off", id)
	}

	private callsOff(ctx: PageContext) {
		for (const id of [...this.calls.keys()]) this.callOff(id, ctx)
	}

	private recordPad(t: Track, pad: number, on: boolean) {
		const now = Date.now()
		for (const r of this.recorders) r.record(noteId(t, pad), on, now)
		this.syncTimer()
	}

	private modKey(t: Track, mod: Mod, down: boolean) {
		if (down) {
			const l = this.modLatched
			this.modLatched = null
			this.touched = t
			// Pressing the latched key lets it go; any other press takes over.
			this.modHeld = { t, mod, at: Date.now(), used: !!l && l.t === t && l.mod === mod }
			return
		}
		const h = this.modHeld
		if (!h || h.t !== t || h.mod !== mod) return
		this.modHeld = null
		if (!h.used && Date.now() - h.at < TAP_MS) this.modLatched = { t, mod }
	}

	private centreKey(row: number, ctx: PageContext) {
		const a = this.active()
		if (!a || row < 0 || row > 3) return
		if (this.modHeld) this.modHeld.used = true
		const v = VALUES[a.mod][row]
		const next = NONE_OK[a.mod] && this.cur[a.t][a.mod] === v ? 0 : v
		this.cur[a.t][a.mod] = next
		// BLEND alone is also the track's live BLEND; surface glides it (150 ms).
		if (a.mod === "blend" && next) ctx.surface?.send(`${LINE}/blend`, a.t + 1, next)
	}

	private recorderKey(idx: number, ctx: PageContext) {
		const r = this.recorders[idx]
		if (ctx.modifiers.shift1) r.clear()
		else r.press(Date.now())
		this.emitPatterns(ctx)
		this.syncTimer()
	}

	// ---------------------------------------------------------------- what surface says

	private hear(path: string, args: any[], ctx: PageContext) {
		const v = args[0]
		const n = Math.round(Number(v))
		if (path === `${LINE}/play`) this.playing = Number(v) !== 0
		else if (path === `${LINE}/length`) { if (n >= 1 && n <= STEPS) this.length = n }
		else if (path === AT_ADDR) this.callAt = Number.isFinite(n) ? n : -1
		else if (path === `${LINE}/at`) { if (n >= 0 && n <= STEPS) this.setAt(n) }
		else if (path === `${LINE}/mode`) { if (v === "one-slice" || v === "one-each") { this.mode = v; this.emitSettings(ctx) } }
		else if (path === `${LINE}/state`) {
			const st = parseLineState(String(v ?? ""))
			if (st) {
				this.steps = st.steps
				this.length = st.length
				if (st.mode !== this.mode) { this.mode = st.mode; this.emitSettings(ctx) }
				for (const t of [0, 1] as const) this.heardLane(t, st.lanes[t], ctx)
			}
		} else if (path === TRACK_ADDR[0] || path === TRACK_ADDR[1]) {
			const t: Track = path === TRACK_ADDR[0] ? 0 : 1
			if (n >= 0 && n <= LANES) this.heardLane(t, n, ctx)
		} else {
			const m = /^\/surface\/lane\/([1-8])\/reel\/slices$/.exec(path)
			if (!m || !(n >= 0)) return
			for (const t of [0, 1] as const) if (this.lanes[t] === Number(m[1])) this.slices[t] = n
		}
		this.syncTimer()
		ctx.setDirty()
	}

	private heardLane(t: Track, n: number, ctx: PageContext) {
		if (n === this.lanes[t]) return
		this.lanes[t] = n
		this.slices[t] = -1
		if (n) ctx.surface?.send("/surface/get", `/surface/lane/${n}/reel/slices`)
	}

	/** The playing step moved: flash the pads it fires, so the blocks show the line. */
	private setAt(n: number) {
		if (n === this.at) return
		this.at = n
		if (!n) return
		const now = Date.now()
		for (const t of [0, 1] as const) {
			const s = this.steps[t][n - 1].slice
			if (s >= 1 && s <= PADS) this.flashAt[t][s] = now
		}
	}

	private poll(nowMs: number, ctx: PageContext) {
		const link = ctx.surface
		if (!link) return
		if (nowMs - this.lastSubMs >= SUBSCRIBE_MS) {
			this.lastSubMs = nowMs
			link.send("/surface/subscribe", "127.0.0.1", link.port, "values")
			// Which call's step sounds, to light its pad (a pattern topic, only while ARP is lit).
			if (this.arp) link.send("/surface/subscribe", "127.0.0.1", link.port, "/surface/arp/call/*")
		}
		if (nowMs - this.lastPollMs < POLL_MS) return
		this.lastPollMs = nowMs
		for (const a of ["play", "at", "state"]) link.send("/surface/get", `${LINE}/${a}`)
		for (const t of [0, 1] as const) if (this.lanes[t]) link.send("/surface/get", `/surface/lane/${this.lanes[t]}/reel/slices`)
	}

	// ---------------------------------------------------------------- time

	private syncTimer() {
		const needed = this.live && (this.focused || this.recorders.some((r) => r.isRunning))
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
		this.recorders.forEach((r, k) => {
			r.advance(nowMs, dt)
			// A loop's pad going down fires the slice; its release sends nothing (a slice is one shot).
			const was = this.loopHeld[k]
			for (const id of r.sounding) if (!was.has(id)) this.fire((id >= 64 ? 1 : 0) as Track, id % 64, ctx)
			this.loopHeld[k] = new Set(r.sounding)
		})
		if (this.focused) this.poll(nowMs, ctx)
		if (this.recorders.some((r, i) => r.state !== before[i])) this.emitPatterns(ctx)
		this.syncTimer()
	}

	// ---------------------------------------------------------------- lights

	render(ctx: PageContext): LedFrame {
		const f = makeFrame(ctx.size)
		const set = (x: number, y: number, lvl: number) => {
			if (x < ctx.size.width && y < ctx.size.height) f[ledIndex(ctx.size, x, y)] = lvl
		}
		if (this.live) {
			const now = Date.now()
			const mine = this.touched
			for (let i = 0; i < this.length; i++) {
				const a = this.steps[mine][i].slice > 0
				const b = this.steps[1 - mine][i].slice > 0
				let lvl = a && b ? LVL_STEP_BOTH : a ? LVL_STEP_MINE : b ? LVL_STEP_OTHER : LVL_STEP_EMPTY
				if (this.playing && this.at === i + 1) lvl = lvl >= LVL_STEP_MINE ? LVL_AT_ON_LIT : LVL_AT_ON_DIM
				set(STEP_X0 + (i % STEPS_A_ROW), Math.floor(i / STEPS_A_ROW), lvl)
			}
			if (this.pageKeyHeld) {
				for (let x = STEP_X0; x < STEP_X0 + STEPS_A_ROW; x++) set(x, 0, 0)
				for (let l = 1; l <= LANES; l++)
					set(LANE_X0 + l - 1, 0, this.lanes[0] === l ? LVL_LANE_LEFT : this.lanes[1] === l ? LVL_LANE_RIGHT : LVL_LANE)
			}
			const act = this.active()
			for (const t of [0, 1] as const) {
				for (let pad = 1; pad <= PADS; pad++) {
					if (!this.playable(t, pad)) continue
					const held = this.held.some((h) => h.t === t && h.pad === pad)
					const sounding = this.arp && this.callAt === arpId(t, pad)
					const lvl = this.arp && held ? (sounding ? LVL_PAD_HELD : LVL_PAD_ARP_HELD) : held ? LVL_PAD_HELD : now - this.flashAt[t][pad] < FLASH_MS ? LVL_PAD_FLASH : LVL_PAD
					set(BLOCK_X0[t] + ((pad - 1) % 4), 7 - Math.floor((pad - 1) / 4), lvl)
				}
				MODS.forEach((mod, k) => set(MOD_X[t], BLOCK_Y0 + k, act && act.t === t && act.mod === mod ? LVL_MOD_ON : LVL_MOD))
			}
			if (act) {
				const cur = this.cur[act.t][act.mod]
				for (let row = 0; row < 4; row++) {
					const lvl = VALUES[act.mod][row] === cur ? LVL_VALUE_ON : LVL_VALUE
					set(CENTRE_X0, 7 - row, lvl)
					set(CENTRE_X0 + 1, 7 - row, lvl)
				}
			}
			set(PLAY_X, PLAY_Y, this.playing ? LVL_PLAY_ON : LVL_PLAY)
			set(ARP_X, ARP_Y, this.arp ? LVL_ARP_ON : LVL_PLAY)
			const blinkOn = now % (BLINK_MS * 2) < BLINK_MS
			for (let i = 0; i < RECORDERS; i++) {
				const st = this.recorders[i].state
				set(ctx.size.width - 1, i,
					st === "recording" ? (blinkOn ? LVL_REC_ARMED : LVL_REC_EMPTY)
					: st === "playing" ? LVL_REC_PLAYING
					: st === "stopped" ? LVL_REC_STOPPED
					: LVL_REC_EMPTY)
			}
		}
		drawSelector(f, ctx)
		if (this.live && this.pageKeyHeld) set(0, REEL_ROW, 15)
		return f
	}

	// ---------------------------------------------------------------- settings, saving

	onOsc(path: string, args: any[], ctx: PageContext) {
		const parts = path.split("/").filter(Boolean)
		let i = 0
		if (parts[i] === "setting" || parts[i] === "settings") i++
		const key = parts[i]
		if (key === "get") return this.emitSettings(ctx)
		if (key !== "mode") return
		const raw = String(args.length ? args[0] : parts[i + 1])
		if (raw !== "one-slice" && raw !== "one-each") return
		this.mode = raw
		if (this.live) ctx.surface?.send(`${LINE}/mode`, raw)
		this.emitSettings(ctx)
	}

	/** The line is surface's, saved in its patch. Only the gesture loops are kept here. */
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
					const step = Math.round(Number(e.step))
					if (atMs < 0 || !(step % 64 >= 1 && step % 64 <= PADS && step < 128)) return undefined
					return { atMs, step, on: bool(e.on, false) }
				}),
			})
		}
		this.emitPatterns(ctx)
	}

	dispose(ctx: PageContext) {
		this.unsurface?.()
		this.unsurface = null
		for (const r of this.recorders) r.clear()
		this.onBlur(ctx)
		this.syncTimer()
	}

	private announce(ctx: PageContext) {
		ctx.osc.send(`/grid/out/page/${ctx.slotLabel}/type`, "reel-surface")
		this.emitSettings(ctx)
		this.emitPatterns(ctx)
	}

	private emitSettings(ctx: PageContext) {
		ctx.osc.send(`/grid/out/page/${ctx.slotLabel}/settings`, JSON.stringify({ mode: this.mode }))
	}

	private emitPatterns(ctx: PageContext) {
		const state = this.recorders.map((r) => ({ state: r.state, ms: Math.round(r.loopMs) }))
		ctx.osc.send(`/grid/out/page/${ctx.slotLabel}/patterns`, JSON.stringify(state))
	}
}

export const keymap: KeySpec[] = [
	...SELECTOR_KEYS,
	...(REEL_PAGE_LIVE
		? ([
				{ x: STEP_X0, y: 0, w: STEPS_A_ROW, h: STEP_ROWS, name: "Steps 1-36", short: "Steps", help: "Hold a pad and tap steps to write that slice; the same slice again clears it. Shift 1 + a step: the length. With SPEED, ROLL, CHANCE or BLEND lit, a tapped written step takes the value showing; an empty one is still written while a pad is held.", lit: LVL_STEP_EMPTY },
				{ x: BLOCK_X0[0], y: BLOCK_Y0, w: 4, h: 4, name: "LEFT pads", short: "Left", help: "Fire a slice of LEFT's lane: pad 1 at the bottom left.", lit: LVL_PAD },
				{ x: BLOCK_X0[1], y: BLOCK_Y0, w: 4, h: 4, name: "RIGHT pads", short: "Right", help: "Fire a slice of RIGHT's lane: pad 1 at the bottom left.", lit: LVL_PAD },
				{ x: MOD_X[0], y: BLOCK_Y0, h: 4, name: "LEFT: speed, roll, chance, blend", short: "L keys", help: "Hold (or tap to keep): the centre picks that value for LEFT.", lit: LVL_MOD },
				{ x: MOD_X[1], y: BLOCK_Y0, h: 4, name: "RIGHT: speed, roll, chance, blend", short: "R keys", help: "Hold (or tap to keep): the centre picks that value for RIGHT.", lit: LVL_MOD },
				{ x: CENTRE_X0, y: BLOCK_Y0, w: 2, h: 4, name: "Value", help: "The lit key's four values, lowest at the bottom. ROLL and BLEND: press the lit one for none.", lit: 0 },
				{ x: ARP_X, y: ARP_Y, name: "Arp", help: "Lit: held pads (both blocks, one chord) go to the app's arp and play in turn; the sounding one is brightest. Writing steps works as before. Loops still play direct. Unlighting lets them go.", lit: LVL_PLAY },
				{ x: PLAY_X, y: PLAY_Y, name: "Play", help: "Start or stop the step line.", lit: LVL_PLAY },
				{ x: 15, y: 0, h: RECORDERS, name: "Loopers 1-3", help: "Record and loop pad presses: arm, play, pause. Shift 1 + press clears.", lit: [LVL_REC_PLAYING, LVL_REC_STOPPED, LVL_REC_EMPTY] },
			] as KeySpec[])
		: []),
]

export const page: PageModule = {
	name: "reel-surface",
	label: "Reel Surface",
	keymap,
	settings: SPECS,
	create: () => new ReelSurfacePage(),
}
