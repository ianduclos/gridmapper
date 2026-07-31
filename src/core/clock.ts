/* AppClock — the ONE transport for the whole app.
 *
 * Before this, a clocked page (meadowphysics) had to grow its own clock off the render
 * loop, which meant it only advanced while focused: switch slots and the sequencer froze.
 * Now the clock lives above the pages and ticks ALL of them (see PageManager.tick), so
 * eight sequencers can run at once while you look at one.
 *
 * Two sources:
 *   internal — a free-running timer at `rate` Hz. OFF by default; nothing ticks until
 *              /grid/in/clock/run 1.
 *   external — Max (or anything) supplies the steps, one per /grid/in/clock/tick.
 *
 * `step()` always advances, whatever the source — `source: "external"` just means the
 * internal timer never arms. `running` gates the internal timer only.
 *
 * Timing: setInterval accumulates drift, which over an always-on session is real slew, so
 * each tick is scheduled against an absolute deadline instead. If we fall far behind
 * (laptop suspend, a long GC), we resync rather than firing a catch-up burst — a
 * sequencer wants the right tempo now, not a machine-gun of missed steps.
 */

export type ClockSource = "internal" | "external"

export interface ClockState {
	running: boolean
	source: ClockSource
	/** Internal-clock rate in Hz. */
	rate: number
	/** Ticks emitted since boot/reset. The value passed to onTick is this counter. */
	tick: number
}

export const MIN_RATE = 0.1
export const MAX_RATE = 200
export const DEFAULT_RATE = 20 // mp.lua's CLOCKTIME 0.05

/** Resync (rather than catch up) once we're this many periods behind. */
const RESYNC_PERIODS = 2

export interface AppClockOpts {
	rate?: number
	source?: ClockSource
	/** Called once per tick with the running tick count (first tick = 1). */
	onTick: (tick: number) => void
	/** Transport/config changed (start, stop, rate, source, reset) — NOT per tick. */
	onChange?: (state: Readonly<ClockState>) => void
}

export const clampRate = (hz: unknown): number => {
	const n = Number(hz)
	if (!Number.isFinite(n)) return DEFAULT_RATE
	return Math.max(MIN_RATE, Math.min(MAX_RATE, n))
}

export const isClockSource = (v: unknown): v is ClockSource =>
	v === "internal" || v === "external"

export class AppClock {
	private _running = false
	private _source: ClockSource
	private _rate: number
	private _tick = 0
	private timer: ReturnType<typeof setTimeout> | null = null
	private nextAt = 0

	constructor(private readonly opts: AppClockOpts) {
		this._rate = clampRate(opts.rate ?? DEFAULT_RATE)
		this._source = isClockSource(opts.source) ? opts.source : "internal"
	}

	get state(): Readonly<ClockState> {
		return { running: this._running, source: this._source, rate: this._rate, tick: this._tick }
	}
	get running() { return this._running }
	get source() { return this._source }
	get rate() { return this._rate }
	get tick() { return this._tick }

	/** Start the transport (arms the internal timer; a no-op under an external source). */
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

	setSource(source: ClockSource) {
		if (!isClockSource(source) || source === this._source) return
		this._source = source
		if (this._running) this.arm() // internal → arms, external → disarms
		this.changed()
	}

	/** One tick, from any source. This is the /grid/in/clock/tick path. */
	step() {
		this._tick += 1
		this.opts.onTick(this._tick)
	}

	reset() {
		this._tick = 0
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
		if (!this._running || this._source !== "internal") return
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
		if (!this._running || this._source !== "internal") return
		try {
			this.step()
		} catch (err) {
			console.error("[AppClock] tick error:", err)
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
