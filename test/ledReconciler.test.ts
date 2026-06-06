import { describe, it, expect } from "vitest"
import { LedReconciler } from "../src/render/ledReconciler.js"
import { makeFrame, type GridSize } from "../src/core/types.js"
import type { GridDriver } from "../src/io/serialoscDriver.js"

// A fake grid that records driver calls instead of sending OSC.
function fakeGrid(size: GridSize) {
	const sets: Array<{ x: number; y: number; l: number }> = []
	const maps: Array<{ x: number; y: number; levels: number[] }> = []
	const driver: GridDriver = {
		size,
		onKey() {},
		ledLevelSet(x, y, l) {
			sets.push({ x, y, l })
		},
		ledLevelAll() {},
		ledLevelMap(x, y, levels) {
			maps.push({ x, y, levels: levels.slice() })
		},
		close() {},
	}
	return { driver, sets, maps }
}

const SIZE: GridSize = { width: 16, height: 8 } // grid 128: two 8×8 quadrants

describe("LedReconciler", () => {
	it("sends nothing for an all-zero frame on first push when threshold not exceeded? (first push paints changes)", () => {
		const { driver, sets, maps } = fakeGrid(SIZE)
		const rec = new LedReconciler(driver)
		// Cache starts UNKNOWN, so even an all-zero frame differs from cache for every
		// cell → that's 64 changes per quadrant → map wins.
		rec.push(makeFrame(SIZE, 0))
		expect(maps.length).toBe(2)
		expect(sets.length).toBe(0)
	})

	it("uses per-cell set for a few changes", () => {
		const { driver, sets, maps } = fakeGrid(SIZE)
		const rec = new LedReconciler(driver)
		rec.push(makeFrame(SIZE, 0)) // prime cache (2 maps)
		maps.length = 0

		const f = makeFrame(SIZE, 0)
		f[0] = 15 // (0,0)
		f[1] = 7 // (1,0)
		f[16] = 9 // (0,1)
		rec.push(f)

		expect(maps.length).toBe(0)
		expect(sets).toEqual([
			{ x: 0, y: 0, l: 15 },
			{ x: 1, y: 0, l: 7 },
			{ x: 0, y: 1, l: 9 },
		])
	})

	it("batches via map when many cells in a quadrant change", () => {
		const { driver, sets, maps } = fakeGrid(SIZE)
		const rec = new LedReconciler(driver)
		rec.push(makeFrame(SIZE, 0)) // prime
		maps.length = 0
		sets.length = 0

		const f = makeFrame(SIZE, 0)
		// Light a whole row in the left quadrant (16 cells across, but only x<8 are
		// in quadrant 0) — set the left half of two rows = >8 cells in quad 0.
		for (let x = 0; x < 8; x++) {
			f[x] = 12 // row 0
			f[16 + x] = 12 // row 1
		}
		rec.push(f)

		// Left quadrant: 16 changed (> threshold 8) → one map. Right quadrant: 0 → nothing.
		expect(maps.length).toBe(1)
		expect(maps[0]).toMatchObject({ x: 0, y: 0 })
		expect(sets.length).toBe(0)
	})

	it("does nothing when the frame is unchanged", () => {
		const { driver, sets, maps } = fakeGrid(SIZE)
		const rec = new LedReconciler(driver)
		const f = makeFrame(SIZE, 3)
		rec.push(f) // primes (2 maps)
		maps.length = 0
		sets.length = 0
		rec.push(f) // identical
		expect(maps.length).toBe(0)
		expect(sets.length).toBe(0)
	})

	it("beginFullPaint forces both quadrants to repaint", () => {
		const { driver, sets, maps } = fakeGrid(SIZE)
		const rec = new LedReconciler(driver)
		const f = makeFrame(SIZE, 5)
		rec.push(f) // primes
		maps.length = 0
		sets.length = 0
		rec.beginFullPaint()
		rec.push(f) // identical content, but full paint forces map on every quadrant
		expect(maps.length).toBe(2)
		expect(sets.length).toBe(0)
	})
})
