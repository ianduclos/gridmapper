/* Page: Meadowphysics
 * ------------------------------------------------------------------------------
 * Summary : Rhizomatic cascading counters — 8 rows of counters that fall right→left
 *           toward column 0; hitting 0 fires an EVENT that can trig/toggle notes,
 *           reset other rows, and run a RULE that rewrites another row's count/speed.
 *           Faithful port of tehn's iii `grid/mp.lua` (monome Meadowphysics).
 * Input   : col 0 (hold) = select row + enter CONFIG; +col 1 (hold) = RULE mode.
 *           MAIN   : tap in a row = set count (and position); hold one + tap another
 *                    = set the count RANGE (rules move the count inside it).
 *           CONFIG : col 2 start/stop · col 3 reset-targets · col 4 play-mode ·
 *                    col 5 toggle-targets · col 6 trig-targets · cols 7..15 speed
 *                    (tap = speed, hold+tap = speed range).
 *           RULE   : cols 3/4/5 pick rule destination row + what it rewrites
 *                    (count / speed / both); right 8×8 picks the rule (row = rule).
 * Display : MAIN   : dim bar = count range, count cell = 2 (6 while its note is on),
 *                    bright 8 = the falling position.
 *           CONFIG : markers at 5 when set / 2 when clear, speed bar + speed at 5,
 *                    position ghosted at 2, selected row lit 15 in col 0.
 *           RULE   : destination row + rtype at 2/7, rule glyph at 9 in the right 8×8.
 * Settings: lane — which app-clock lane to follow (0..3; the lane decides internal vs
 *           external). div — advance one step every Nth tick of that lane (1..16).
 * Rules   : driven by the APP CLOCK (core/clock.ts) via onTick, so it advances in every
 *           slot, focused or not — eight of these can run at once. Sounding notes are
 *           released when the transport stops and when the slot is unloaded, never on
 *           blur (that would kill a background sequencer). Notes go out as
 *           /grid/out/page/<slot>/note <row 0..7> <1|0> — Max owns row→pitch.
 * ------------------------------------------------------------------------------
 * The model (verbatim from mp.lua, translated 1-indexed → 0-indexed):
 *
 *   pos    the falling position, 0..width-1, or STOPPED (-1). mp.lua uses 0 for
 *          "stopped" and 1..16 for the position; we shift both down by one, so the
 *          TRIGGER column is 0 and "stopped" needs its own sentinel.
 *   count  where pos is reloaded to on reset; min/max bound what rules may set it to.
 *   speed  clock divider, 0 (every tick) .. 8; smin/smax bound it the same way.
 *   reset/trig/tog  8×8 target matrices, per SOURCE row: on this row's event, which
 *          rows get re-armed (reset), pulsed for one tick (trig), or flipped (tog).
 *   rule/rdest/rtype  on this row's event, run rule on row rdest, rewriting its
 *          count (rtype&1) and/or speed (rtype&2).
 *
 * Tick order matters and is preserved: (1) release last tick's trigs, (2) advance
 * every row whose divider is due — a row at 0 fires its rule then its targets, and
 * a row with `push` pending (play-mode) fires targets only, (3) emit note edges by
 * diffing against the pre-tick note state.
 *
 * Everything above is pure: `mpTick` / `mpKey` / `mpFrame` operate on a plain
 * MeadowState and are unit-tested in test/meadowphysics.test.ts. The class below is a
 * thin shell over them: it takes ticks from the app clock, emits OSC, and draws.
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
import type { ClockState } from "../core/clock.js"
import { clamp } from "../util/scale.js"
import { isRecord, int, intArray, intMatrix } from "../util/restoreGuards.js"

// --- layout (0-indexed columns; mp.lua's 1-indexed columns minus one) ------------

const X_SEL = 0 // hold: select row + enter CONFIG
const X_RULES = 1 // hold (in CONFIG): enter RULE mode
const X_RUN = 2 // CONFIG: start/stop this row
const X_RESET = 3 // CONFIG: is this row a reset target of sel?
const X_PLAY = 4 // CONFIG: play-mode toggle (global)
const X_TOG = 5 // CONFIG: is this row a toggle target of sel?
const X_TRIG = 6 // CONFIG: is this row a trig target of sel?
const X_SPEED0 = 7 // CONFIG: speed 0 lives here; speed s at X_SPEED0 + s
const X_RTYPE0 = 3 // RULE: cols 3,4,5 → rtype 1 (count), 2 (speed), 3 (both)
const X_GLYPH0 = 8 // RULE: right 8×8 = rule chooser + glyph

const MP_ROWS = 8
const SPEED_MAX = 8
export const STOPPED = -1

// LED levels, verbatim from mp.lua's redraw().
const L_RANGE = 2
const L_COUNT = 2
const L_COUNT_NOTE = 6 // 2 + note*4
const L_POS = 8
const L_MARK_OFF = 2
const L_MARK_ON = 5
const L_SEL = 15
const L_RTYPE = 7
const L_GLYPH = 9

/** Rule names in mp.lua's order (index = the row you press in RULE mode). */
export const RULE_NAMES = [
	"none", "inc", "dec", "min", "max", "random", "pole", "stop",
] as const

/**
 * 8 glyphs × 8 rows of 8-bit masks (bit n → column X_GLYPH0 + n). Verbatim from
 * mp.lua's GLYPH table — these are the little icons that name each rule.
 */
export const RULE_GLYPHS: readonly (readonly number[])[] = [
	[0, 0, 0, 0, 0, 0, 0, 0], // none
	[0, 24, 24, 126, 126, 24, 24, 0], // inc  (+)
	[0, 0, 0, 126, 126, 0, 0, 0], // dec  (−)
	[0, 96, 96, 126, 126, 96, 96, 0], // min
	[0, 6, 6, 126, 126, 6, 6, 0], // max
	[0, 102, 102, 24, 24, 102, 102, 0], // random (×)
	[0, 120, 120, 102, 102, 30, 30, 0], // pole
	[0, 126, 126, 102, 102, 126, 126, 0], // stop
]

// --- state -----------------------------------------------------------------------

/** A note edge produced by a tick: row 0..7 going on or off. */
export interface NoteEdge {
	row: number
	on: boolean
}

export interface MeadowState {
	width: number
	rows: number
	speedMax: number
	/** Falling position per row: 0..width-1, or STOPPED. */
	pos: number[]
	count: number[]
	min: number[]
	max: number[]
	/** Per SOURCE row, an 8-wide target mask. */
	reset: number[][]
	trig: number[][]
	tog: number[][]
	speed: number[]
	smin: number[]
	smax: number[]
	/** Rule index into RULE_NAMES/RULE_GLYPHS, its destination row, and rtype 1..3. */
	rule: number[]
	rdest: number[]
	rtype: number[]
	/** Play mode: choosing a count also fires that row's targets immediately. */
	play: number
	// transient runtime
	note: number[]
	prev: number[]
	off: number[]
	push: number[]
	tickCd: number[]
	// UI
	mode: 0 | 1 | 2
	held: number
	sel: number
	row: number[] // keys currently held per row (1 = set value, 2 = set range)
	/** Injectable RNG so the "random" rule is testable. */
	rng: () => number
}

const zeros = (n: number) => new Array<number>(n).fill(0)

export function createMeadowState(size: GridSize, rng: () => number = Math.random): MeadowState {
	const rows = Math.min(MP_ROWS, size.height)
	const width = size.width
	const countMax = width - 1
	const speedMax = clamp(width - 1 - X_SPEED0, 0, SPEED_MAX)
	const st: MeadowState = {
		width,
		rows,
		speedMax,
		pos: [], count: [], min: [], max: [],
		reset: [], trig: [], tog: [],
		speed: [], smin: [], smax: [],
		rule: [], rdest: [], rtype: [],
		play: 0,
		note: zeros(rows), prev: zeros(rows), off: zeros(rows),
		push: zeros(rows), tickCd: zeros(rows),
		mode: 0, held: 0, sel: 0, row: zeros(rows),
		rng,
	}
	for (let n = 0; n < rows; n++) {
		// mp.lua seeds row n (1-based) at column n+8; the 0-based arithmetic is the same.
		const start = clamp(n + 8, 0, countMax)
		st.pos[n] = start
		st.count[n] = start
		st.min[n] = start
		st.max[n] = start
		st.reset[n] = zeros(rows)
		st.reset[n][n] = 1 // a row re-arms itself by default
		st.trig[n] = zeros(rows)
		st.trig[n][n] = 1 // ...and pulses its own note
		st.tog[n] = zeros(rows)
		st.speed[n] = 1
		st.smin[n] = 1
		st.smax[n] = 1
		st.rule[n] = 1 // "inc" (mp.lua's rule 2)
		st.rdest[n] = n
		st.rtype[n] = 1 // count only
	}
	return st
}

// --- rules -------------------------------------------------------------------------

/** Run row `n`'s rule against its destination row. Mutates state. */
export function mpRule(st: MeadowState, n: number): void {
	const d = st.rdest[n]
	const t = st.rtype[n]
	const doCount = (t & 1) > 0
	const doSpeed = (t & 2) > 0
	switch (st.rule[n]) {
		case 0: // none
			return
		case 1: // inc — step up, wrap at max
			if (doCount) st.count[d] = st.count[d] === st.max[d] ? st.min[d] : st.count[d] + 1
			if (doSpeed) st.speed[d] = st.speed[d] === st.smax[d] ? st.smin[d] : st.speed[d] + 1
			return
		case 2: // dec — step down, wrap at min
			if (doCount) st.count[d] = st.count[d] === st.min[d] ? st.max[d] : st.count[d] - 1
			if (doSpeed) st.speed[d] = st.speed[d] === st.smin[d] ? st.smax[d] : st.speed[d] - 1
			return
		case 3: // min
			if (doCount) st.count[d] = st.min[d]
			if (doSpeed) st.speed[d] = st.smin[d]
			return
		case 4: // max
			if (doCount) st.count[d] = st.max[d]
			if (doSpeed) st.speed[d] = st.smax[d]
			return
		case 5: // random, inside the range
			if (doCount) st.count[d] = st.min[d] + Math.floor(st.rng() * (st.max[d] - st.min[d] + 1))
			if (doSpeed) st.speed[d] = st.smin[d] + Math.floor(st.rng() * (st.smax[d] - st.smin[d] + 1))
			return
		case 6: // pole — jump to whichever end is further away
			if (doCount) {
				st.count[d] =
					Math.abs(st.count[d] - st.min[d]) < Math.abs(st.count[d] - st.max[d])
						? st.max[d]
						: st.min[d]
			}
			if (doSpeed) {
				st.speed[d] =
					Math.abs(st.speed[d] - st.smin[d]) < Math.abs(st.speed[d] - st.smax[d])
						? st.smax[d]
						: st.smin[d]
			}
			return
		case 7: // stop
			st.pos[d] = STOPPED
			return
	}
}

// --- the clock ---------------------------------------------------------------------

/** Fire one clock tick. Mutates state; returns the note edges to send. */
export function mpTick(st: MeadowState): NoteEdge[] {
	const edges: NoteEdge[] = []

	// 1. Release anything that was trig'd last tick (a trig is one tick long).
	for (let i = 0; i < st.rows; i++) {
		st.prev[i] = st.note[i]
		if (st.off[i] > 0) {
			st.note[i] = 0
			st.off[i] = 0
			st.prev[i] = 0
			edges.push({ row: i, on: false })
		}
	}

	// 2. Advance every row whose divider is due.
	for (let i = 0; i < st.rows; i++) {
		if (st.tickCd[i] === 0) {
			if (st.pos[i] === 0) {
				// EVENT: this counter reached the left edge.
				st.pos[i] = STOPPED // ...unless a reset target below re-arms it
				mpRule(st, i)
				for (let n = 0; n < st.rows; n++) {
					if (st.reset[i][n] > 0) st.pos[n] = st.count[n]
					if (st.trig[i][n] > 0) {
						st.note[n] = 1
						st.off[n] = 1 // release on the next tick
					} else if (st.tog[i][n] > 0) {
						st.note[n] = 1 - st.note[n]
					}
				}
			} else if (st.push[i] > 0) {
				// play-mode: fire targets without resetting or ruling.
				st.push[i] = 0
				for (let n = 0; n < st.rows; n++) {
					if (st.trig[i][n] > 0) {
						st.note[n] = 1
						st.off[n] = 1
					} else if (st.tog[i][n] > 0) {
						st.note[n] = 1 - st.note[n]
					}
				}
			} else if (st.pos[i] > 0) {
				st.pos[i] -= 1
			}
			st.tickCd[i] = st.speed[i]
		} else {
			st.tickCd[i] -= 1
		}
	}

	// 3. Emit whatever changed.
	for (let i = 0; i < st.rows; i++) {
		if (st.prev[i] !== st.note[i]) edges.push({ row: i, on: st.note[i] === 1 })
	}
	return edges
}

// --- input ---------------------------------------------------------------------------

/** Apply one key edge. Mutates state. */
export function mpKey(st: MeadowState, x: number, y: number, s: 0 | 1): void {
	if (y < 0 || y >= st.rows || x < 0 || x >= st.width) return
	const down = s === 1
	const delta = down ? 1 : -1

	// Column 0 is the mode key: it selects the row AND holds CONFIG open.
	if (x === X_SEL) {
		if (down) st.sel = y
		st.held = Math.max(0, st.held + delta)
		st.mode = st.held > 0 ? 1 : 0
		return
	}
	// Column 1, while CONFIG is open, holds RULE mode open on top of it.
	if (st.mode > 0 && x === X_RULES) {
		st.mode = down ? 2 : 1
		return
	}

	if (st.mode === 0) {
		st.row[y] = Math.max(0, st.row[y] + delta)
		if (down && st.row[y] === 1) {
			// First key in the row: set the count (and jump the position to it).
			st.pos[y] = x
			st.count[y] = x
			st.min[y] = x
			st.max[y] = x
			if (st.play > 0) st.push[y] = 1
		} else if (down && st.row[y] === 2) {
			// Second key held: the two keys bracket the count range.
			if (x < st.count[y]) {
				st.min[y] = x
				st.max[y] = st.count[y]
			} else {
				st.max[y] = x
				st.min[y] = st.count[y]
			}
		}
		return
	}

	if (st.mode === 1) {
		if (down && x === X_RUN) {
			if (st.pos[y] === STOPPED) {
				st.pos[y] = st.count[y]
			} else {
				st.pos[y] = STOPPED
				st.off[y] = 1 // don't leave a note hanging
			}
		} else if (down && x === X_RESET) {
			st.reset[st.sel][y] = 1 - st.reset[st.sel][y]
		} else if (down && x === X_PLAY) {
			st.play = 1 - st.play
		} else if (down && x === X_TOG) {
			st.tog[st.sel][y] = 1 - st.tog[st.sel][y]
			st.trig[st.sel][y] = 0 // trig and tog are exclusive
		} else if (down && x === X_TRIG) {
			st.trig[st.sel][y] = 1 - st.trig[st.sel][y]
			st.tog[st.sel][y] = 0
		} else if (x >= X_SPEED0) {
			// Same one-key/two-key gesture as the count, on the speed half.
			st.row[y] = Math.max(0, st.row[y] + delta)
			const v = clamp(x - X_SPEED0, 0, st.speedMax)
			if (down && st.row[y] === 1) {
				st.speed[y] = v
				st.smin[y] = v
				st.smax[y] = v
			} else if (down && st.row[y] === 2) {
				if (v < st.speed[y]) {
					st.smin[y] = v
					st.smax[y] = st.speed[y]
				} else {
					st.smax[y] = v
					st.smin[y] = st.speed[y]
				}
			}
		}
		return
	}

	// mode 2 — RULE
	if (down && x >= X_RTYPE0 && x < X_RTYPE0 + 3) {
		st.rdest[st.sel] = y
		st.rtype[st.sel] = x - X_RTYPE0 + 1 // 1 = count, 2 = speed, 3 = both
	} else if (down && x >= X_GLYPH0) {
		st.rule[st.sel] = y
	}
}

// --- display ----------------------------------------------------------------------------

/** The frame for the current state + mode. Pure. */
export function mpFrame(st: MeadowState, size: GridSize): LedFrame {
	const f = makeFrame(size)
	const put = (x: number, y: number, v: number) => {
		if (x < 0 || x >= size.width || y < 0 || y >= size.height) return
		f[ledIndex(size, x, y)] = v
	}

	if (st.mode === 0) {
		for (let n = 0; n < st.rows; n++) {
			for (let i = st.min[n]; i <= st.max[n]; i++) put(i, n, L_RANGE)
			put(st.count[n], n, st.note[n] ? L_COUNT_NOTE : L_COUNT)
			if (st.pos[n] !== STOPPED) put(st.pos[n], n, L_POS)
		}
		return f
	}

	if (st.mode === 1) {
		for (let n = 0; n < st.rows; n++) {
			put(X_RUN, n, st.pos[n] !== STOPPED ? L_MARK_ON : L_MARK_OFF)
			put(X_RESET, n, st.reset[st.sel][n] > 0 ? L_MARK_ON : L_MARK_OFF)
			put(X_TOG, n, st.tog[st.sel][n] > 0 ? L_MARK_ON : L_MARK_OFF)
			put(X_TRIG, n, st.trig[st.sel][n] > 0 ? L_MARK_ON : L_MARK_OFF)
			for (let i = st.smin[n]; i <= st.smax[n]; i++) put(X_SPEED0 + i, n, L_MARK_OFF)
			put(X_SPEED0 + st.speed[n], n, L_MARK_ON)
			// The position ghosts over the controls, then play wins its column.
			if (st.pos[n] !== STOPPED) put(st.pos[n], n, L_MARK_OFF)
			put(X_PLAY, n, st.play > 0 ? L_MARK_OFF : 0)
		}
		put(X_SEL, st.sel, L_SEL)
		return f
	}

	// mode 2 — RULE
	put(X_SEL, st.sel, L_SEL)
	put(X_RULES, st.sel, L_SEL)
	const d = st.rdest[st.sel]
	for (let i = 0; i < 3; i++) put(X_RTYPE0 + i, d, L_MARK_OFF)
	put(X_RTYPE0 + st.rtype[st.sel] - 1, d, L_RTYPE)
	const rule = st.rule[st.sel]
	for (let x = X_GLYPH0; x < size.width; x++) put(x, rule, L_MARK_OFF)
	const glyph = RULE_GLYPHS[rule] ?? RULE_GLYPHS[0]
	for (let row = 0; row < 8; row++) {
		const bits = glyph[row]
		for (let b = 0; b < 8; b++) {
			if (bits & (1 << b)) put(X_GLYPH0 + b, row, L_GLYPH)
		}
	}
	return f
}

// --- the page ------------------------------------------------------------------------------

const SPECS: SettingSpec[] = [
	{ key: "lane", label: "clock lane", type: "number", min: 0, max: 3, step: 1, default: 0 },
	{ key: "div", label: "clock ÷", type: "number", min: 1, max: 16, step: 1, default: 1 },
]
const SPEC_BY_KEY = new Map(SPECS.map((s) => [s.key, s]))

export class MeadowphysicsPage implements Page {
	private size: GridSize = { width: 16, height: 8 }
	private st = createMeadowState(this.size)
	private lane = SPEC_BY_KEY.get("lane")!.default as number
	private div = SPEC_BY_KEY.get("div")!.default as number
	private wasRunning = false

	init(ctx: PageContext) {
		this.size = ctx.size
		this.st = createMeadowState(this.size)
		this.wasRunning = ctx.clock.running
		this.announce(ctx)
	}

	onFocus(ctx: PageContext) {
		this.announce(ctx)
	}

	onBlur() {
		// Notes keep sounding — this page runs in the background (see onTick). Only the
		// transient UI holds are dropped: a column-0 / row hold can't survive a page
		// switch, so clear them or we'd come back stuck in CONFIG.
		this.st.held = 0
		this.st.mode = 0
		this.st.row.fill(0)
	}

	/**
	 * One app-clock tick, delivered whether or not this slot is focused, and on every
	 * lane — so we filter to ours. Choosing a lane is how this page picks an internal or
	 * an external clock (the lane owns that, see core/clock.ts). `div` then divides that
	 * lane down, and the counters divide again per row (mp's own `speed`).
	 */
	onTick(tick: number, lane: number, ctx: PageContext) {
		if (lane !== this.lane) return
		if (tick % this.div !== 0) return
		this.step(ctx)
	}

	/** Transport changed. Stopping releases anything still sounding. */
	onClock(state: Readonly<ClockState>, ctx: PageContext) {
		if (this.wasRunning && !state.running) this.allNotesOff(ctx)
		this.wasRunning = state.running
	}

	onKey(ev: KeyEvent) {
		mpKey(this.st, ev.x, ev.y, ev.s)
	}

	// In: /setting/<key> <v> · /<key> <v> · /<key>/<v> · /settings/get.
	// (The clock is no longer per-page: /grid/in/clock/* drives the whole app.)
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

	/** Purely visual — the counters advance in onTick, not here. */
	render(): LedFrame {
		return mpFrame(this.st, this.size)
	}

	/** Structural config for presets: the declared settings + the whole patch. */
	serialize() {
		const st = this.st
		return {
			lane: this.lane,
			div: this.div,
			patch: {
				count: [...st.count], min: [...st.min], max: [...st.max],
				speed: [...st.speed], smin: [...st.smin], smax: [...st.smax],
				reset: st.reset.map((r) => [...r]),
				trig: st.trig.map((r) => [...r]),
				tog: st.tog.map((r) => [...r]),
				rule: [...st.rule], rdest: [...st.rdest], rtype: [...st.rtype],
				play: st.play,
			},
		}
	}

	/**
	 * The inverse of serialize(). The patch — counters, ranges, speeds, the three target
	 * matrices and the rules — comes back; everything the cascade builds while it runs
	 * (falling positions, sounding notes, tick countdowns, which key you were holding)
	 * does not. A restored page is a patch at rest: it starts cascading on the next tick.
	 *
	 * Every field is read against a freshly-constructed state, so a preset from a build
	 * with different dimensions, or with fields missing entirely, lands on defaults
	 * row by row instead of throwing (see util/restoreGuards.ts).
	 */
	restore(config: unknown, ctx: PageContext) {
		if (!isRecord(config)) return
		for (const spec of SPECS) {
			if (config[spec.key] !== undefined) this.applySetting(spec.key, config[spec.key])
		}
		if (!isRecord(config.patch)) {
			this.announce(ctx)
			return
		}

		const p = config.patch
		const fresh = createMeadowState(this.size)
		const st = this.st
		const countMax = st.width - 1
		const rowMax = st.rows - 1

		st.count = intArray(p.count, fresh.count, 0, countMax)
		st.min = intArray(p.min, fresh.min, 0, countMax)
		st.max = intArray(p.max, fresh.max, 0, countMax)
		st.speed = intArray(p.speed, fresh.speed, 0, st.speedMax)
		st.smin = intArray(p.smin, fresh.smin, 0, st.speedMax)
		st.smax = intArray(p.smax, fresh.smax, 0, st.speedMax)
		st.reset = intMatrix(p.reset, fresh.reset, 0, 1)
		st.trig = intMatrix(p.trig, fresh.trig, 0, 1)
		st.tog = intMatrix(p.tog, fresh.tog, 0, 1)
		st.rule = intArray(p.rule, fresh.rule, 0, RULE_NAMES.length - 1)
		st.rdest = intArray(p.rdest, fresh.rdest, 0, rowMax)
		st.rtype = intArray(p.rtype, fresh.rtype, 1, 3)
		st.play = int(p.play, fresh.play, 0, 1)

		// Runtime, deliberately not restored: park every row where its counter says, which
		// is where a patch that has never ticked sits.
		st.pos = [...st.count]

		this.announce(ctx) // init() announced the defaults; they are stale now
	}

	/** Slot unloaded/replaced — never strand a sounding note in Max. */
	dispose(ctx: PageContext) {
		this.allNotesOff(ctx)
	}

	private step(ctx: PageContext) {
		for (const e of mpTick(this.st)) this.sendNote(ctx, e.row, e.on)
	}

	private sendNote(ctx: PageContext, row: number, on: boolean) {
		ctx.osc.send(`/grid/out/page/${ctx.slotLabel}/note`, row, on ? 1 : 0)
	}

	private allNotesOff(ctx: PageContext) {
		for (let n = 0; n < this.st.rows; n++) {
			if (this.st.note[n]) this.sendNote(ctx, n, false)
			this.st.note[n] = 0
			this.st.prev[n] = 0
			this.st.off[n] = 0
		}
	}

	/** Clamp+store one setting; returns true if it was a known key. */
	private applySetting(key: string, raw: unknown): boolean {
		const spec = SPEC_BY_KEY.get(key)
		if (!spec) return false
		const v = Number(raw)
		if (!Number.isFinite(v)) return false
		const clamped = clamp(Math.round(v), spec.min ?? 0, spec.max ?? v)
		if (key === "div") this.div = clamped
		else if (key === "lane") this.lane = clamped
		return true
	}

	private announce(ctx: PageContext) {
		ctx.osc.send(`/grid/out/page/${ctx.slotLabel}/type`, "meadowphysics")
		this.emitSettings(ctx)
	}

	private emitSettings(ctx: PageContext) {
		ctx.osc.send(
			`/grid/out/page/${ctx.slotLabel}/settings`,
			JSON.stringify({ lane: this.lane, div: this.div })
		)
	}
}

export const page: PageModule = {
	name: "meadowphysics",
	label: "Meadowphysics",
	create: () => new MeadowphysicsPage(),
	settings: SPECS,
}
