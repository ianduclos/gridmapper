/* ScreensaverPage — full-grid animations. Pressing any key advances to the next
 * screensaver. Each animation is a pure function (time, size) → LedFrame, so they're
 * easy to test and to add: just push another onto SCREENSAVERS.
 *
 * The page runs a ~30Hz timer while focused that calls setDirty(); render() samples
 * the current animation at the elapsed time. The reconciler batches the (large) diff
 * per quadrant, so a full-grid animation is just a couple of OSC messages per frame.
 */

import {
	type Page,
	type PageContext,
	type KeyEvent,
	type LedFrame,
	type GridSize,
	makeFrame,
} from "../core/types.js"
import { noise3 } from "../util/perlin.js"
import type { PageModule } from "../core/pageModule.js"

/**
 * Screensaver 0 — per-cell triangle. Every cell rises 0→15 then falls 15→0 (smooth
 * up-and-down, no jump). The first cell (index 0) completes a cycle at 0.5 Hz, the
 * last at 1.0 Hz, linearly interpolated across cell index — a shimmering left→right
 * phase gradient, slower at the top-left, faster toward the bottom-right.
 */
export function triPerCell(tSec: number, size: GridSize): LedFrame {
	const n = size.width * size.height
	const f = makeFrame(size)
	for (let i = 0; i < n; i++) {
		const freq = n > 1 ? 0.5 + 0.5 * (i / (n - 1)) : 0.5 // 0.5 Hz … 1.0 Hz
		const phase = (((tSec * freq) % 1) + 1) % 1 // 0..1
		const tri = phase < 0.5 ? phase * 2 : (1 - phase) * 2 // 0→1→0
		f[i] = Math.round(tri * 15)
	}
	return f
}

/**
 * Screensaver 1 — slow evolving Perlin field. A 2D slice of 3D noise sampled per
 * cell, with the third axis advancing slowly in time so the field drifts and morphs.
 */
const PERLIN_SPACE = 0.28 // spatial frequency (smaller = larger, smoother blobs)
const PERLIN_TIME = 0.06 // temporal frequency (smaller = slower evolution)
export function perlinField(tSec: number, size: GridSize): LedFrame {
	const f = makeFrame(size)
	for (let y = 0; y < size.height; y++) {
		for (let x = 0; x < size.width; x++) {
			const n = noise3(x * PERLIN_SPACE, y * PERLIN_SPACE, tSec * PERLIN_TIME) // ~[-1,1]
			const v = Math.round((n * 1.1 * 0.5 + 0.5) * 15) // → ~0..15, gain to use the range
			f[y * size.width + x] = Math.max(0, Math.min(15, v))
		}
	}
	return f
}

export const SCREENSAVERS: Array<(tSec: number, size: GridSize) => LedFrame> = [
	triPerCell,
	perlinField,
]

export class ScreensaverPage implements Page {
	private size: GridSize = { width: 16, height: 8 }
	private index = 0
	private startMs = Date.now()
	private frame!: LedFrame

	init(ctx: PageContext) {
		this.size = ctx.size
		this.startMs = Date.now()
		this.frame = makeFrame(this.size)
	}

	onFocus() {
		this.startMs = Date.now() // restart the animation clock when shown
	}

	onBlur() {}

	onKey(ev: KeyEvent) {
		if (ev.s !== 1) return // advance on press only
		this.index = (this.index + 1) % SCREENSAVERS.length
		this.startMs = Date.now() // restart phase on each switch
	}

	render(): LedFrame {
		// Sample the current animation at elapsed time. The loop calls this every
		// frame, so no timer is needed — just read the clock.
		const tSec = (Date.now() - this.startMs) / 1000
		this.frame = SCREENSAVERS[this.index](tSec, this.size)
		return this.frame
	}

	dispose() {}
}

export const page: PageModule = {
	name: "screensaver",
	label: "Screensaver",
	create: () => new ScreensaverPage(),
}
