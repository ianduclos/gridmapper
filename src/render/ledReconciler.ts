/* LedReconciler: diff the desired LED frame against the last-sent cache and push
 * only what changed, choosing the cheapest wire form per 8×8 quadrant.
 *
 * The grid's LED model is flat: each cell is an intensity 0..15. The interesting
 * decision is batching. serialosc exposes both:
 *   - led/level/set x y l   — one cell, one message
 *   - led/level/map xOff yOff <64 levels> — a whole 8×8 quadrant, one message
 * A 128 has two quadrants (xOff 0 and 8). When many cells in a quadrant changed,
 * one `map` beats spraying dozens of `set`s; when only a few changed, per-cell
 * `set` avoids re-sending 64 values. We pick per quadrant via `mapThreshold`.
 *
 * Cache starts at 0xFF (an impossible level) so the first push repaints everything.
 * beginFullPaint() forces a full repaint next push (use on focus / page change).
 */

import type { GridDriver } from "../io/serialoscDriver.js"
import type { GridSize, LedFrame } from "../core/types.js"

const QUAD = 8 // serialosc quadrant edge
const UNKNOWN = 0xff

export class LedReconciler {
	private readonly grid: GridDriver
	private readonly size: GridSize
	private readonly cache: Uint8Array
	private readonly mapThreshold: number
	private fullPaintPending = false
	private lastSetCount = 0
	private lastMapCount = 0

	constructor(grid: GridDriver, opts?: { mapThreshold?: number }) {
		this.grid = grid
		this.size = grid.size
		this.cache = new Uint8Array(this.size.width * this.size.height).fill(UNKNOWN)
		// Above this many changed cells in a quadrant, one map beats N sets.
		this.mapThreshold = opts?.mapThreshold ?? 8
	}

	/** Force a full repaint (all quadrants) on the next push. */
	beginFullPaint() {
		this.fullPaintPending = true
	}

	/** Diagnostics: messages sent on the last push. */
	get msgsLastPush() {
		return this.lastSetCount + this.lastMapCount
	}

	push(desired: LedFrame | undefined) {
		if (!desired) return
		const { width, height } = this.size
		const full = this.fullPaintPending
		this.fullPaintPending = false
		this.lastSetCount = 0
		this.lastMapCount = 0

		for (let qy = 0; qy < height; qy += QUAD) {
			for (let qx = 0; qx < width; qx += QUAD) {
				// Gather this quadrant's desired levels (row-major, 64 entries) and
				// count how many in-bounds cells differ from the cache.
				const levels = new Array<number>(QUAD * QUAD)
				let changed = 0
				for (let r = 0; r < QUAD; r++) {
					for (let c = 0; c < QUAD; c++) {
						const x = qx + c
						const y = qy + r
						const inBounds = x < width && y < height
						const v = inBounds ? desired[y * width + x] & 0x0f : 0
						levels[r * QUAD + c] = v
						if (inBounds && this.cache[y * width + x] !== v) changed++
					}
				}

				if (!full && changed === 0) continue

				if (full || changed > this.mapThreshold) {
					// One message repaints the quadrant.
					this.grid.ledLevelMap(qx, qy, levels)
					this.lastMapCount++
					for (let r = 0; r < QUAD; r++) {
						for (let c = 0; c < QUAD; c++) {
							const x = qx + c
							const y = qy + r
							if (x < width && y < height) this.cache[y * width + x] = levels[r * QUAD + c]
						}
					}
				} else {
					// Few changes: per-cell set only for what moved.
					for (let r = 0; r < QUAD; r++) {
						for (let c = 0; c < QUAD; c++) {
							const x = qx + c
							const y = qy + r
							if (x >= width || y >= height) continue
							const idx = y * width + x
							const v = levels[r * QUAD + c]
							if (this.cache[idx] !== v) {
								this.grid.ledLevelSet(x, y, v)
								this.cache[idx] = v
								this.lastSetCount++
							}
						}
					}
				}
			}
		}
	}
}
