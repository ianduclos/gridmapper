/* MirrorGrid — a GridDriver that wraps another driver and taps its LED writes.
 *
 * It forwards everything to the inner driver (real grid or NullGrid) while keeping
 * an in-memory level buffer and calling onLeds() on every write. That lets the sim
 * mirror exactly what the pages render — including on real hardware, where the
 * serialosc driver has no readback of its own.
 *
 * The inner driver is SWAPPABLE at runtime (attach), so the app can start on a
 * NullGrid and hot-swap to the real grid the moment it's plugged in — without
 * rebuilding the render loop, reconciler, or key wiring. MirrorGrid owns the key
 * fan-out so subscribers survive the swap.
 */

import type { GridDriver } from "./serialoscDriver.js"
import type { GridSize, KeyEvent } from "../core/types.js"
import { clamp } from "../util/scale.js"

export class MirrorGrid implements GridDriver {
	private inner: GridDriver
	private readonly onLeds: (levels: Uint8Array) => void
	private readonly buf: Uint8Array
	private readonly size_: GridSize
	private readonly keyCbs: Array<(e: KeyEvent) => void> = []

	constructor(inner: GridDriver, onLeds: (levels: Uint8Array) => void) {
		this.inner = inner
		this.onLeds = onLeds
		this.size_ = inner.size
		this.buf = new Uint8Array(this.size_.width * this.size_.height)
		this.bindInner()
	}

	/** Subscribe the current inner's key events to our stable fan-out. */
	private bindInner() {
		this.inner.onKey((e) => {
			for (const cb of this.keyCbs) cb(e)
		})
	}

	/** Swap the underlying device. Key subscribers persist; LEDs are not auto-reset
	 *  (the caller should request a full repaint to push the current screen). */
	attach(next: GridDriver) {
		this.inner = next
		this.bindInner()
	}

	/** The current underlying driver (e.g. to close it on detach). */
	current(): GridDriver {
		return this.inner
	}

	get id() {
		return this.inner.id
	}
	get size(): GridSize {
		return this.size_
	}

	onKey(cb: (e: KeyEvent) => void) {
		this.keyCbs.push(cb)
	}

	snapshot(): Uint8Array {
		return this.buf.slice()
	}

	ledLevelSet(x: number, y: number, level: number) {
		const { width, height } = this.size_
		if (x >= 0 && y >= 0 && x < width && y < height) {
			this.buf[y * width + x] = clamp(Math.round(level), 0, 15)
		}
		this.inner.ledLevelSet(x, y, level)
		this.onLeds(this.buf)
	}

	ledLevelAll(level: number) {
		this.buf.fill(clamp(Math.round(level), 0, 15))
		this.inner.ledLevelAll(level)
		this.onLeds(this.buf)
	}

	ledLevelMap(xOff: number, yOff: number, levels: number[]) {
		const { width, height } = this.size_
		for (let i = 0; i < 64; i++) {
			const x = xOff + (i % 8)
			const y = yOff + Math.floor(i / 8)
			if (x < width && y < height) this.buf[y * width + x] = clamp(Math.round(levels[i] ?? 0), 0, 15)
		}
		this.inner.ledLevelMap(xOff, yOff, levels)
		this.onLeds(this.buf)
	}

	close() {
		this.inner.close()
	}
}
