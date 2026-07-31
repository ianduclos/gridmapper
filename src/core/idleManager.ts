/* IdleManager — stop burning CPU when nothing is happening.
 *
 * The launchd agent runs forever. Without this it holds a 58fps interval for months,
 * calling page.render() every frame whether or not a grid is plugged in, a browser is
 * open, or anything is changing. With no grid attached that work goes precisely nowhere.
 *
 * Policy: after N ms with no INPUT, stop the render loop entirely (0 CPU, not a trickle).
 * N is much shorter with no grid connected (nothing is watching) than with one attached.
 * Any event wakes it instantly — every wake source is a callback we already own, so there
 * is no polling and no perceptible lag.
 *
 * "Activity" is INPUT, deliberately not "the frame changed": otherwise a screensaver on an
 * unplugged grid animates at 58fps forever and never sleeps, which is the exact waste this
 * exists to stop. Consequence, by design: an animated page with nobody touching it does
 * freeze once the timeout expires, and any key press brings it straight back.
 *
 * Sleeping does NOT blank the grid — the device holds its own LED state, so a sleeping app
 * simply leaves the last screen lit. Waking forces a full repaint (onWake) so the device
 * can never be left showing something stale.
 */

import type { RenderLoop } from "../render/renderLoop.js"

export interface IdlePolicy {
	/** Sleep after this long with no input while a grid is attached. */
	connectedMs: number
	/** Sleep after this long with no input while running on the NullGrid. */
	disconnectedMs: number
	/** Never sleep. */
	caffeinate: boolean
}

export interface IdleState {
	asleep: boolean
	caffeinated: boolean
	connected: boolean
	/** The timeout currently in force (ms). */
	sleepAfterMs: number
	/** Ms since the last activity. */
	idleMs: number
}

export const MIN_MS = 1000 // a 1s floor keeps a fat-fingered setting from thrashing

export interface IdleManagerOpts {
	loop: RenderLoop
	isConnected: () => boolean
	policy: IdlePolicy
	/** Woken up — the host force-repaints and renders at once. */
	onWake?: () => void
	/** Asleep/awake or policy changed (host echoes /grid/out/idle). */
	onChange?: (state: Readonly<IdleState>) => void
	/** How often to check for expiry while awake (default 5s). */
	checkMs?: number
}

export class IdleManager {
	private policy: IdlePolicy
	private lastActivity = Date.now()
	private _asleep = false
	private watchdog: ReturnType<typeof setInterval> | null = null

	constructor(private readonly opts: IdleManagerOpts) {
		this.policy = { ...opts.policy }
	}

	get asleep() {
		return this._asleep
	}

	get state(): Readonly<IdleState> {
		return {
			asleep: this._asleep,
			caffeinated: this.policy.caffeinate,
			connected: this.opts.isConnected(),
			sleepAfterMs: this.threshold(),
			idleMs: Date.now() - this.lastActivity,
		}
	}

	/** Begin watching. The loop is assumed already running. */
	start() {
		this.lastActivity = Date.now()
		this.arm()
	}

	/**
	 * Any input happened: a grid key, an inbound /grid/in/* message (OSC or web), a web
	 * client connecting, a device attaching, a clock tick. Cheap — safe to call at tick
	 * rate; it only stamps a timestamp unless we were asleep.
	 */
	activity() {
		this.lastActivity = Date.now()
		if (this._asleep) this.wake()
	}

	wake() {
		this.lastActivity = Date.now()
		if (!this._asleep) return
		this._asleep = false
		this.opts.loop.start()
		this.arm()
		this.opts.onWake?.()
		this.changed()
	}

	/** Sleep now. Explicit (/grid/in/sleep) — ignores `caffeinate`. */
	sleep() {
		if (this._asleep) return
		this._asleep = true
		this.opts.loop.stop()
		this.disarm() // nothing can expire while asleep; zero timers of our own
		this.changed()
	}

	setPolicy(patch: Partial<IdlePolicy>) {
		const next: IdlePolicy = {
			connectedMs: Math.max(MIN_MS, patch.connectedMs ?? this.policy.connectedMs),
			disconnectedMs: Math.max(MIN_MS, patch.disconnectedMs ?? this.policy.disconnectedMs),
			caffeinate: patch.caffeinate ?? this.policy.caffeinate,
		}
		const same =
			next.connectedMs === this.policy.connectedMs &&
			next.disconnectedMs === this.policy.disconnectedMs &&
			next.caffeinate === this.policy.caffeinate
		if (same) return
		this.policy = next
		if (next.caffeinate && this._asleep) this.wake()
		else this.changed()
	}

	close() {
		this.disarm()
	}

	/** The timeout in force right now — grid attached or not. */
	private threshold(): number {
		return this.opts.isConnected() ? this.policy.connectedMs : this.policy.disconnectedMs
	}

	private arm() {
		this.disarm()
		this.watchdog = setInterval(() => this.check(), this.opts.checkMs ?? 5000)
		// Don't let a bookkeeping timer alone hold the process open.
		this.watchdog.unref?.()
	}

	private disarm() {
		if (this.watchdog) clearInterval(this.watchdog)
		this.watchdog = null
	}

	private check() {
		if (this._asleep || this.policy.caffeinate) return
		if (Date.now() - this.lastActivity >= this.threshold()) this.sleep()
	}

	private changed() {
		this.opts.onChange?.(this.state)
	}
}
