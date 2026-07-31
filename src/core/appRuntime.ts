/* AppRuntime — the transport + power + settings wiring, in ONE place.
 *
 * cli/sim.ts and cli/index.ts must behave identically; every time that wiring was
 * hand-duplicated the daemon quietly fell behind (that's why core/oscRouter.ts exists).
 * So the clock, the idle policy and the settings store are assembled here and both entry
 * points just consume the result.
 *
 * What this owns:
 *   - AppClock          the one transport, ticking every loaded page (off by default)
 *   - IdleManager       stops the render loop after inactivity; wakes on any event
 *   - SettingsStore     live, persisted config; changes here reach the clock/idle at once
 *   - the /grid/out/{clock,idle,settings} echoes for Max and the web UI
 */

import { AppClock, type ClockState } from "./clock.js"
import { IdleManager } from "./idleManager.js"
import { SettingsStore, minToMs, type Settings } from "./settings.js"
import type { PageManager } from "./pageManager.js"
import type { RenderLoop } from "../render/renderLoop.js"

/** While asleep the discovery watcher backs right off (2s → 30s). */
const POLL_AWAKE_MS = 2000
const POLL_ASLEEP_MS = 30_000

export interface AppRuntimeOpts {
	pm: PageManager
	loop: RenderLoop
	/** The grid connection (only the bits the runtime needs). */
	conn: { isConnected(): boolean; setPollMs(ms: number): void }
	/** Boot settings (core/settings.ts loadSettings()). */
	settings: Settings
	/** App-out channel — Max, plus the web UI in the sim. */
	emit: (path: string, ...args: Array<number | string | boolean>) => void
	/** Woken: the host force-repaints and renders immediately. */
	onWake: () => void
}

export interface AppRuntime {
	clock: AppClock
	idle: IdleManager
	settings: SettingsStore
	/** Live view of the transport for PageContext.clock (getters, never a snapshot). */
	clockView: Readonly<ClockState>
	/** State messages for a newly-connected client (web onConnect / Max hello). */
	snapshot(): Array<{ path: string; args: Array<number | string | boolean> }>
	close(): void
}

export function createAppRuntime(opts: AppRuntimeOpts): AppRuntime {
	const { pm, loop, conn, emit, onWake } = opts

	// Declared first so the callbacks below can close over them.
	let clock: AppClock
	let idle: IdleManager

	// Config changes (web panel or Max) land on the LIVE objects, then persist.
	const settings = new SettingsStore(opts.settings, (s, path) => {
		if (path.startsWith("clock/")) {
			clock.setRate(s.clock.rate)
			clock.setSource(s.clock.source)
		} else if (path.startsWith("idle/")) {
			idle.setPolicy({
				connectedMs: minToMs(s.idle.connectedMin),
				disconnectedMs: minToMs(s.idle.disconnectedMin),
				caffeinate: s.idle.caffeinate,
			})
		}
	})

	clock = new AppClock({
		rate: settings.get().clock.rate,
		source: settings.get().clock.source,
		// A running clock is activity: a live sequencer never gets slept out from under Max.
		onTick: (n) => {
			idle.activity()
			pm.tick(n)
			if (settings.get().clock.echo) emit("/grid/out/clock/tick", n)
		},
		onChange: (state) => {
			pm.clockChanged(state)
			emit("/grid/out/clock", JSON.stringify(state))
		},
	})

	idle = new IdleManager({
		loop,
		isConnected: () => conn.isConnected(),
		policy: {
			connectedMs: minToMs(settings.get().idle.connectedMin),
			disconnectedMs: minToMs(settings.get().idle.disconnectedMin),
			caffeinate: settings.get().idle.caffeinate,
		},
		onWake,
		onChange: (state) => {
			conn.setPollMs(state.asleep ? POLL_ASLEEP_MS : POLL_AWAKE_MS)
			emit("/grid/out/idle", JSON.stringify(state))
		},
	})
	idle.start()

	// The transport always boots stopped — only its rate/source/echo are persisted.
	const clockView: ClockState = {
		get running() { return clock.running },
		get source() { return clock.source },
		get rate() { return clock.rate },
		get tick() { return clock.tick },
	}

	return {
		clock,
		idle,
		settings,
		clockView,
		snapshot: () => [
			{ path: "/grid/out/clock", args: [JSON.stringify(clock.state)] },
			{ path: "/grid/out/idle", args: [JSON.stringify(idle.state)] },
			{ path: "/grid/out/settings", args: [settings.json()] },
		],
		close() {
			clock.close()
			idle.close()
			settings.flush()
		},
	}
}
