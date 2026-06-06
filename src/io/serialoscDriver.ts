// src/io/serialoscDriver.ts — the ONLY module that knows the grid wire format.
//
// The monome grid does not speak OSC on the wire; it's a USB/FTDI serial device.
// `serialoscd` (a background daemon, `brew install serialosc`) bridges serial<->OSC:
//   1. a discovery service on a fixed UDP port (12002) that lists devices, and
//   2. one OSC server per connected device on its own UDP port.
//
// connectGrid() runs the handshake: discover -> route (/sys/host,/port,/prefix) ->
// query /sys/info for size -> resolve a live GridDriver. NullGrid implements the
// same interface with no hardware, for the sim + tests.

import type { GridSize, KeyEvent } from "../core/types.js"
import { clamp } from "../util/scale.js"

// @ts-ignore — 'osc' ships without TS types
import osc from "osc"

const DISCOVERY_PORT = 12002
const DEFAULT_PREFIX = "/monome"
const DEFAULT_SIZE: GridSize = { width: 16, height: 8 } // grid 128

/** Device-agnostic grid surface. Both the real driver and NullGrid implement it. */
export interface GridDriver {
	/** serialosc device id (e.g. "m1000279"), or "null-grid" for the sim. */
	readonly id: string
	readonly size: GridSize
	/** Subscribe to decoded key events (press/release). */
	onKey(cb: (e: KeyEvent) => void): void
	/** Subscribe to device disconnect (serialosc /sys/disconnect). Optional. */
	onDisconnect?(cb: () => void): void
	/** Set one cell to intensity 0..15. */
	ledLevelSet(x: number, y: number, level: number): void
	/** Set every cell to one intensity 0..15. */
	ledLevelAll(level: number): void
	/**
	 * Set an 8×8 quadrant from 64 row-major levels, top-left at (xOff, yOff).
	 * The batched path — one OSC message repaints a whole quadrant.
	 */
	ledLevelMap(xOff: number, yOff: number, levels: number[]): void
	close(): void
}

export interface DiscoveredDevice {
	id: string
	type: string
	port: number
}

/** One-shot discovery: ask serialosc which grids are connected. */
export function listDevices(opts?: {
	host?: string
	discoveryPort?: number
	timeoutMs?: number
}): Promise<DiscoveredDevice[]> {
	const host = opts?.host ?? "127.0.0.1"
	const discoveryPort = opts?.discoveryPort ?? DISCOVERY_PORT
	const timeoutMs = opts?.timeoutMs ?? 800

	return new Promise((resolve) => {
		const found: DiscoveredDevice[] = []
		const udp = new osc.UDPPort({ localAddress: "127.0.0.1", localPort: 0, metadata: true })
		const done = () => {
			try { udp.close() } catch {}
			resolve(found)
		}
		udp.on("ready", () => {
			const localPort = udp.socket.address().port
			udp.send(
				{ address: "/serialosc/list", args: [
					{ type: "s", value: host },
					{ type: "i", value: localPort },
				] },
				host,
				discoveryPort
			)
		})
		udp.on("message", (m: any) => {
			if (m.address === "/serialosc/device") {
				const [id, type, port] = m.args.map((a: any) => a.value)
				found.push({ id: String(id), type: String(type), port: Number(port) })
			}
		})
		udp.on("error", () => {})
		udp.open()
		setTimeout(done, timeoutMs)
	})
}

export interface ConnectOptions {
	host?: string
	discoveryPort?: number
	/** OSC prefix to claim on the device (default /monome). */
	prefix?: string
	/** Pick a specific device by id; default = first discovered. */
	deviceId?: string
	timeoutMs?: number
}

/** Run the full serialosc handshake and resolve a live GridDriver. */
export async function connectGrid(opts: ConnectOptions = {}): Promise<GridDriver> {
	const host = opts.host ?? "127.0.0.1"
	const prefix = opts.prefix ?? DEFAULT_PREFIX
	const timeoutMs = opts.timeoutMs ?? 1500

	const devices = await listDevices({
		host,
		discoveryPort: opts.discoveryPort ?? DISCOVERY_PORT,
		timeoutMs: Math.min(timeoutMs, 1000),
	})
	if (!devices.length) {
		throw new Error(
			"No monome grid found. Is it plugged in and is serialoscd running? " +
				"(check: `pgrep -fl serialosc`)"
		)
	}
	const device = opts.deviceId
		? devices.find((d) => d.id === opts.deviceId)
		: devices[0]
	if (!device) throw new Error(`Grid '${opts.deviceId}' not found. Available: ${devices.map((d) => d.id).join(", ")}`)

	return new Promise<GridDriver>((resolve, reject) => {
		const keyCbs: Array<(e: KeyEvent) => void> = []
		const disconnectCbs: Array<() => void> = []
		let size: GridSize = { ...DEFAULT_SIZE }
		let settled = false

		const udp = new osc.UDPPort({ localAddress: "127.0.0.1", localPort: 0, metadata: true })

		const sendDev = (address: string, args: Array<{ type: string; value: any }> = []) =>
			udp.send({ address, args }, host, device.port)

		const fail = (err: Error) => {
			if (settled) return
			settled = true
			try { udp.close() } catch {}
			reject(err)
		}

		const timer = setTimeout(
			() => fail(new Error(`Grid handshake timed out after ${timeoutMs}ms (device ${device.id})`)),
			timeoutMs
		)

		udp.on("ready", () => {
			const localPort = udp.socket.address().port
			// Route the device's OSC output back to us and claim our prefix.
			sendDev("/sys/host", [{ type: "s", value: host }])
			sendDev("/sys/port", [{ type: "i", value: localPort }])
			sendDev("/sys/prefix", [{ type: "s", value: prefix }])
			// Ask for size/rotation/etc. The reply (/sys/size ...) completes the handshake.
			sendDev("/sys/info")
		})

		udp.on("message", (m: any) => {
			const addr: string = m.address
			const args = m.args.map((a: any) => a.value)

			if (addr === "/sys/size") {
				size = { width: Number(args[0]), height: Number(args[1]) }
				if (!settled) {
					settled = true
					clearTimeout(timer)
					resolve(driver)
				}
				return
			}
			if (addr === `${prefix}/grid/key`) {
				const [x, y, s] = args
				const ev: KeyEvent = { x: Number(x), y: Number(y), s: (Number(s) ? 1 : 0) as 0 | 1 }
				for (const cb of keyCbs) cb(ev)
				return
			}
			if (addr === "/sys/disconnect") {
				for (const cb of disconnectCbs) cb()
			}
		})

		udp.on("error", (err: any) => fail(err instanceof Error ? err : new Error(String(err))))

		const driver: GridDriver = {
			id: device.id,
			get size() {
				return size
			},
			onKey(cb) {
				keyCbs.push(cb)
			},
			onDisconnect(cb) {
				disconnectCbs.push(cb)
			},
			ledLevelSet(x, y, level) {
				sendDev(`${prefix}/grid/led/level/set`, [
					{ type: "i", value: x | 0 },
					{ type: "i", value: y | 0 },
					{ type: "i", value: clamp(Math.round(level), 0, 15) },
				])
			},
			ledLevelAll(level) {
				sendDev(`${prefix}/grid/led/level/all`, [
					{ type: "i", value: clamp(Math.round(level), 0, 15) },
				])
			},
			ledLevelMap(xOff, yOff, levels) {
				const args = [
					{ type: "i", value: xOff | 0 },
					{ type: "i", value: yOff | 0 },
					...Array.from({ length: 64 }, (_v, i) => ({
						type: "i",
						value: clamp(Math.round(levels[i] ?? 0), 0, 15),
					})),
				]
				sendDev(`${prefix}/grid/led/level/map`, args)
			},
			close() {
				try { udp.close() } catch {}
			},
		}

		udp.open()
	})
}

/**
 * A simulated grid with no hardware. Holds an in-memory level buffer; key events
 * are injected (e.g. from the web visualizer) and LED writes notify a sink so a
 * UI can render them. Drop-in for GridDriver, so app code is identical to real HW.
 */
export class NullGrid implements GridDriver {
	readonly id = "null-grid"
	readonly size: GridSize
	private readonly levels: Uint8Array
	private readonly keyCbs: Array<(e: KeyEvent) => void> = []
	private ledCb?: (levels: Uint8Array) => void

	constructor(size: GridSize = DEFAULT_SIZE) {
		this.size = size
		this.levels = new Uint8Array(size.width * size.height)
	}

	onKey(cb: (e: KeyEvent) => void) {
		this.keyCbs.push(cb)
	}

	/** Feed a key event in (used by the visualizer / tests). */
	injectKey(x: number, y: number, s: 0 | 1) {
		for (const cb of this.keyCbs) cb({ x, y, s })
	}

	/** Subscribe to LED changes; immediately receives the current buffer. */
	onLed(cb: (levels: Uint8Array) => void) {
		this.ledCb = cb
		cb(this.levels)
	}

	/** Current level buffer (copy). */
	snapshot(): Uint8Array {
		return this.levels.slice()
	}

	private emit() {
		this.ledCb?.(this.levels)
	}

	ledLevelSet(x: number, y: number, level: number) {
		if (x < 0 || y < 0 || x >= this.size.width || y >= this.size.height) return
		this.levels[y * this.size.width + x] = clamp(Math.round(level), 0, 15)
		this.emit()
	}

	ledLevelAll(level: number) {
		this.levels.fill(clamp(Math.round(level), 0, 15))
		this.emit()
	}

	ledLevelMap(xOff: number, yOff: number, levels: number[]) {
		for (let i = 0; i < 64; i++) {
			const x = xOff + (i % 8)
			const y = yOff + Math.floor(i / 8)
			if (x >= this.size.width || y >= this.size.height) continue
			this.levels[y * this.size.width + x] = clamp(Math.round(levels[i] ?? 0), 0, 15)
		}
		this.emit()
	}

	close() {}
}
