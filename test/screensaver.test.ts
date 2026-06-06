import { describe, it, expect } from "vitest"
import { triPerCell, perlinField } from "../src/pages/screensaver.js"
import { ledIndex, type GridSize } from "../src/core/types.js"

const SIZE: GridSize = { width: 16, height: 8 } // 128 cells
const N = SIZE.width * SIZE.height

describe("triPerCell screensaver (up and down)", () => {
	it("starts dark and peaks mid-cycle (no sawtooth jump)", () => {
		const at0 = triPerCell(0, SIZE)
		expect(at0[0]).toBe(0)
		// Cell 0 at 0.5 Hz → period 2s. Peak (15) at half period = t 1.0s.
		expect(triPerCell(1.0, SIZE)[0]).toBe(15)
		// Back to 0 at the end of the cycle (t 2.0s) — reached by descending, not a jump.
		expect(triPerCell(2.0, SIZE)[0]).toBe(0)
	})

	it("rises then falls symmetrically", () => {
		const up = triPerCell(0.5, SIZE)[0] // phase .25 → tri .5 → ~8 (rising)
		const peak = triPerCell(1.0, SIZE)[0] // 15
		const down = triPerCell(1.5, SIZE)[0] // phase .75 → tri .5 → ~8 (falling)
		expect(peak).toBe(15)
		expect(up).toBeGreaterThan(0)
		expect(up).toBeLessThan(peak)
		expect(down).toBe(up) // symmetric up/down
	})

	it("first cell is 0.5 Hz, last cell is 1.0 Hz", () => {
		// Last cell at 1.0 Hz peaks at t 0.5s and returns to 0 at t 1.0s.
		expect(triPerCell(0.5, SIZE)[N - 1]).toBe(15)
		expect(triPerCell(1.0, SIZE)[N - 1]).toBe(0)
	})

	it("levels stay within 0..15", () => {
		for (const t of [0, 0.3, 0.7, 1.3, 5.5]) {
			const f = triPerCell(t, SIZE)
			for (let i = 0; i < N; i++) {
				expect(f[i]).toBeGreaterThanOrEqual(0)
				expect(f[i]).toBeLessThanOrEqual(15)
			}
		}
	})
})

describe("perlinField screensaver", () => {
	it("stays within 0..15 and is not flat", () => {
		const f = perlinField(3.2, SIZE)
		let min = 99, max = -1
		for (let i = 0; i < N; i++) {
			expect(f[i]).toBeGreaterThanOrEqual(0)
			expect(f[i]).toBeLessThanOrEqual(15)
			min = Math.min(min, f[i])
			max = Math.max(max, f[i])
		}
		expect(max - min).toBeGreaterThan(2) // there's structure, not a constant field
	})

	it("evolves slowly: nearby times are similar, far apart differ", () => {
		const a = perlinField(0, SIZE)
		const near = perlinField(0.1, SIZE)
		const far = perlinField(10, SIZE)
		const meanAbsDiff = (x: Uint8Array, y: Uint8Array) => {
			let s = 0
			for (let i = 0; i < N; i++) s += Math.abs(x[i] - y[i])
			return s / N
		}
		expect(meanAbsDiff(a, near)).toBeLessThan(meanAbsDiff(a, far))
	})
})
