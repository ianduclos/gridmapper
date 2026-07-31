/* GridConnection — runtime device hotplug, in one place.
 *
 * Owns a MirrorGrid (a STABLE GridDriver facade) whose inner device is swapped at
 * runtime: start on a NullGrid, attach the real grid the moment serialosc reports
 * one, and survive unplug/replug — all without rebuilding the render loop, reconciler
 * or key wiring above it. Both entry points use this so the serialosc gotchas live in
 * exactly one file:
 *
 *   1. Do NOT poll discovery (/serialosc/list) while connected — it breaks the
 *      device's key routing to us. Poll only while DISCONNECTED.
 *   2. Do NOT tear down on a cable glitch. serialosc emits /sys/disconnect then
 *      /sys/connect around a USB hiccup but keeps the same device server + routing, so
 *      keys resume on their own. We never auto-detach; only an explicit reconnect()
 *      (e.g. a UI button) forces a fresh handshake for genuine unplug recovery.
 *
 * The sim taps LED writes (onLeds) to mirror to the web; the headless daemon omits it.
 */

import { connectGrid, listDevices, NullGrid, type GridDriver } from "./serialoscDriver.js"
import { MirrorGrid } from "./mirrorGrid.js"
import type { GridSize, KeyEvent } from "../core/types.js"

export interface GridConnectionOpts {
	size: GridSize
	/** Force the simulated grid (no auto-connect / watcher). */
	forceNull?: boolean
	/** Tap LED writes (sim → web). Omit for the headless daemon. */
	onLeds?: (levels: Uint8Array) => void
	/** Key events from whichever device is attached (survives swaps). */
	onKey: (e: KeyEvent) => void
	/** A device just attached/detached — request a full repaint to push the screen. */
	onRepaint?: () => void
	/** The attached device id changed — host may broadcast it. */
	onDeviceChange?: (id: string) => void
	pollMs?: number // discovery watcher interval (default 2000)
	connectTimeoutMs?: number // handshake timeout (default 1500)
	discoverTimeoutMs?: number // /serialosc/list timeout (default 400)
}

export class GridConnection {
	/** Stable facade the app renders/keys through; inner device swaps underneath. */
	readonly grid: MirrorGrid
	private connecting = false
	private timer: ReturnType<typeof setInterval> | undefined
	private pollMs: number

	constructor(private readonly opts: GridConnectionOpts) {
		this.grid = new MirrorGrid(new NullGrid({ ...opts.size }), opts.onLeds ?? (() => {}))
		this.grid.onKey(opts.onKey)
		this.pollMs = opts.pollMs ?? 2000
	}

	get id(): string {
		return this.grid.id
	}
	isConnected(): boolean {
		return this.grid.id !== "null-grid"
	}

	/** Begin auto-connect + the disconnected-only watcher (no-op when forceNull). */
	start() {
		if (this.opts.forceNull) return
		void this.tryConnect() // try immediately on boot
		this.arm()
	}

	stop() {
		if (this.timer) clearInterval(this.timer)
		this.timer = undefined
	}

	/**
	 * Change the discovery-watcher interval. The host backs this right off while the app
	 * is asleep (2s → 30s): a grid appearing still gets picked up, and plugging one in is
	 * itself an activity event, so nothing is lost but the idle wakeups.
	 */
	setPollMs(ms: number) {
		const next = Math.max(250, Math.round(ms))
		if (next === this.pollMs) return
		this.pollMs = next
		if (this.timer) this.arm()
	}

	private arm() {
		if (this.timer) clearInterval(this.timer)
		this.timer = setInterval(() => void this.pollDevices(), this.pollMs)
	}

	/** Attach the real grid if one is reachable. No-op if already connected/forced null. */
	async tryConnect(): Promise<void> {
		if (this.opts.forceNull || this.connecting || this.isConnected()) return
		this.connecting = true
		try {
			const driver = await connectGrid({ timeoutMs: this.opts.connectTimeoutMs ?? 1500 })
			// Cable glitch: serialosc keeps the same server + key routing (gotcha 2), so we
			// hold the connection — but the device's LEDs are cleared, and the reconciler
			// thinks it already sent them. Repaint, don't reconnect.
			driver.onReconnect?.(() => {
				console.log(`[grid] ${driver.id} re-connected → repainting current screen`)
				this.opts.onRepaint?.()
			})
			const previous = this.grid.current()
			this.grid.attach(driver)
			if (previous.id !== "null-grid") try { previous.close() } catch {}
			this.opts.onRepaint?.() // push the current screen to the freshly connected device
			this.opts.onDeviceChange?.(this.grid.id)
			console.log(`[grid] connected: ${driver.id} → syncing current screen`)
		} catch {
			// no device / handshake failed — stay on NullGrid
		} finally {
			this.connecting = false
		}
	}

	/** Drop the real grid back to a NullGrid (manual recovery only — see gotcha 2). */
	detach() {
		if (!this.isConnected()) return
		const previous = this.grid.current()
		this.grid.attach(new NullGrid({ ...this.opts.size }))
		try { previous.close() } catch {}
		this.opts.onRepaint?.()
		this.opts.onDeviceChange?.(this.grid.id)
	}

	/** Force a FRESH handshake: drop any current connection, then reconnect. */
	async reconnect(): Promise<void> {
		if (this.isConnected()) this.detach()
		await this.tryConnect()
		this.opts.onDeviceChange?.(this.grid.id) // report final state even if it failed
	}

	// Watcher body: only acts while DISCONNECTED, to catch a plug-in (gotcha 1).
	private async pollDevices(): Promise<void> {
		if (this.opts.forceNull || this.connecting || this.isConnected()) return
		let devices
		try {
			devices = await listDevices({ timeoutMs: this.opts.discoverTimeoutMs ?? 400 })
		} catch {
			return
		}
		if (devices.length) void this.tryConnect()
	}

	close() {
		this.stop()
		try { this.grid.close() } catch {}
	}
}
