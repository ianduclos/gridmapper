/* AppClock — the ONE transport for the whole app, in FOUR LANES.
 *
 * Before this, a clocked page (meadowphysics) had to grow its own clock off the render
 * loop, which meant it only advanced while focused: switch slots and the sequencer froze.
 * The clock now lives above the pages and ticks ALL of them (see PageManager.tick), so
 * eight sequencers can run at once while you look at one.
 *
 * Why lanes: "choose internal or external clock per page" only means something if there is
 * more than one tick stream to choose between. So the master timer is internal plumbing and
 * LANES are the only thing pages ever see — a page picks a lane (Page.onTick's `lane`
 * argument) instead of owning a clock of its own. Each lane is independently:
 *
 *   internal — ticks when the master tick divides evenly by that lane's `div`.
 *   external — never self-ticks; something else supplies the steps, one per
 *              /grid/in/clock/tick <lane>.
 *
 * Lanes are numbered 0..3 to match twistermapper's existing `/twister/in/clock <id>`, so
 * bridging the two daemons later is a send target and a port, not a redesign.
 *
 * `step(lane)` always advances that lane whatever its source — a manual step is always
 * allowed. `running` gates the master timer only, and the whole clock boots STOPPED.
 *
 * Timing: setInterval accumulates drift, which over an always-on session is real slew, so
 * each tick is scheduled against an absolute deadline instead. If we fall far behind
 * (laptop suspend, a long GC), we resync rather than firing a catch-up burst — a
 * sequencer wants the right tempo now, not a machine-gun of missed steps.
 */

export type ClockSource = "internal" | "external"

/** How one lane derives its ticks. */
export interface LaneConfig {
	source: ClockSource
	/** Internal lanes tick every `div` master ticks. Ignored by external lanes. */
	div: number
}

export interface LaneState extends LaneConfig {
	/** This lane's own counter — the number handed to Page.onTick. */
	tick: number
}

export interface ClockState {
	running: boolean
	/** Master internal rate in Hz. Effective page rate = rate ÷ lane.div ÷ any page divider. */
	rate: number
	/** Master tick counter. Plumbing — lanes carry the counters pages actually use. */
	tick: number
	lanes: LaneState[]
}

export const LANE_COUNT = 4
export const MIN_RATE = 0.1
export const MAX_RATE = 200
export const DEFAULT_RATE = 20 // mp.lua's CLOCKTIME 0.05
export const MIN_DIV = 1
export const MAX_DIV = 64

/** Lane 0 is 1:1 with the master (exactly the pre-lane behaviour); the rest divide down. */
export const DEFAULT_LANES: readonly LaneConfig[] = [
	{ source: "internal", div: 1 },
	{ source: "internal", div: 2 },
	{ source: "internal", div: 4 },
	{ source: "internal", div: 8 },
]

/** Resync (rather than catch up) once we're this many periods behind. */
const RESYNC_PERIODS = 2

export interface AppClockOpts {
	rate?: number
	lanes?: readonly LaneConfig[]
	/** Called once per LANE tick, with that lane's running count (first tick = 1). */
	onTick: (tick: number, lane: number, deadlineMs: number) => void
	/** Transport/config changed (start, stop, rate, lane, reset) — NOT per tick. */
	onChange?: (state: Readonly<ClockState>) => void
}

export const clampRate = (hz: unknown): number => {
	const n = Number(hz)
	if (!Number.isFinite(n)) return DEFAULT_RATE
	return Math.max(MIN_RATE, Math.min(MAX_RATE, n))
}

export const clampDiv = (d: unknown): number => {
	const n = Math.round(Number(d))
	if (!Number.isFinite(n)) return MIN_DIV
	return Math.max(MIN_DIV, Math.min(MAX_DIV, n))
}

export const isClockSource = (v: unknown): v is ClockSource =>
	v === "internal" || v === "external"

export const isLane = (n: unknown): boolean => {
	const i = Number(n)
	return Number.isInteger(i) && i >= 0 && i < LANE_COUNT
}

/** Normalize any raw lane list into exactly LANE_COUNT clean configs. */
export const sanitizeLanes = (raw: unknown): LaneConfig[] =>
	Array.from({ length: LANE_COUNT }, (_v, i) => {
		const entry = Array.isArray(raw) ? raw[i] : undefined
		const node = typeof entry === "object" && entry !== null ? (entry as Record<string, unknown>) : {}
		return {
			source: isClockSource(node.source) ? node.source : DEFAULT_LANES[i].source,
			div: node.div === undefined ? DEFAULT_LANES[i].div : clampDiv(node.div),
		}
	})

export class AppClock {
	private _running = false
	private _rate: number
	private _tick = 0
	private lanes: LaneState[]
	private timer: ReturnType<typeof setTimeout> | null = null
	private nextAt = 0

	constructor(private readonly opts: AppClockOpts) {
		this._rate = clampRate(opts.rate ?? DEFAULT_RATE)
		this.lanes = sanitizeLanes(opts.lanes ?? DEFAULT_LANES).map((l) => ({ ...l, tick: 0 }))
	}

	get state(): Readonly<ClockState> {
		return {
			running: this._running,
			rate: this._rate,
			tick: this._tick,
			lanes: this.lanes.map((l) => ({ ...l })),
		}
	}
	get running() { return this._running }
	get rate() { return this._rate }
	get tick() { return this._tick }
	/** Live lane array — read-only by contract; use setLane() to change one. */
	get laneStates(): readonly Readonly<LaneState>[] { return this.lanes }

	lane(i: number): Readonly<LaneState> | undefined {
		return this.lanes[i]
	}

	/** Start the master timer. Lanes set to `external` are unaffected either way. */
	start() {
		if (this._running) return
		this._running = true
		this.arm()
		this.changed()
	}

	stop() {
		if (!this._running) return
		this._running = false
		this.disarm()
		this.changed()
	}

	setRunning(run: boolean) {
		if (run) this.start()
		else this.stop()
	}

	setRate(hz: number) {
		const rate = clampRate(hz)
		if (rate === this._rate) return
		this._rate = rate
		if (this.timer) this.arm() // re-arm from now at the new period
		this.changed()
	}

	/** Reconfigure one lane's source and/or divisor. */
	setLane(i: number, patch: Partial<LaneConfig>) {
		const lane = this.lanes[i]
		if (!lane) return
		const source = isClockSource(patch.source) ? patch.source : lane.source
		const div = patch.div === undefined ? lane.div : clampDiv(patch.div)
		if (source === lane.source && div === lane.div) return
		lane.source = source
		lane.div = div
		this.changed()
	}

	/**
	 * Advance ONE lane. Works regardless of that lane's source — an external lane is
	 * driven entirely by this, and a manual step into an internal lane is still allowed.
	 * This is the /grid/in/clock/tick <lane> path.
	 */
	step(lane = 0) {
		const l = this.lanes[lane]
		if (!l) return
		l.tick += 1
		this.opts.onTick(l.tick, lane, Date.now())
	}

	/** Zero the master and every lane counter. */
	reset() {
		this._tick = 0
		for (const l of this.lanes) l.tick = 0
		this.changed()
	}

	/** Release the timer (shutdown). Does not emit a change. */
	close() {
		this.disarm()
	}

	private get periodMs() {
		return 1000 / this._rate
	}

	private arm() {
		this.disarm()
		if (!this._running) return
		this.nextAt = Date.now() + this.periodMs
		this.schedule()
	}

	private disarm() {
		if (this.timer) clearTimeout(this.timer)
		this.timer = null
	}

	private schedule() {
		const delay = Math.max(0, this.nextAt - Date.now())
		this.timer = setTimeout(() => this.fire(), delay)
	}

	private fire() {
		this.timer = null
		if (!this._running) return
		const deadlineMs = this.nextAt
		this._tick += 1
		// One master tick feeds every INTERNAL lane whose divisor lands on it. External
		// lanes ignore the master entirely and wait for step().
		for (let i = 0; i < this.lanes.length; i++) {
			const l = this.lanes[i]
			if (l.source !== "internal") continue
			if (this._tick % l.div !== 0) continue
			l.tick += 1
			try {
				this.opts.onTick(l.tick, i, deadlineMs)
			} catch (err) {
				console.error(`[AppClock] tick error on lane ${i}:`, err)
			}
		}
		const period = this.periodMs
		this.nextAt += period
		// Suspended / stalled for ages? Don't fire a burst — pick the tempo back up now.
		if (Date.now() - this.nextAt > period * RESYNC_PERIODS) this.nextAt = Date.now() + period
		this.schedule()
	}

	private changed() {
		this.opts.onChange?.(this.state)
	}
}
