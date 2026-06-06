import { describe, it, expect } from "vitest"
import { noteAt, isRoot } from "../src/pages/isometric.js"

const H = 8 // grid 128 height

describe("isometric tuning", () => {
	it("bottom-left cell is the base note (E1 = 28)", () => {
		expect(noteAt(0, H - 1, H)).toBe(28)
		expect(isRoot(noteAt(0, H - 1, H))).toBe(true)
	})

	it("one column right = +1 semitone (chromatic)", () => {
		expect(noteAt(1, H - 1, H)).toBe(29)
		expect(noteAt(5, H - 1, H)).toBe(33)
	})

	it("one row up = a perfect fourth (+5)", () => {
		expect(noteAt(0, H - 2, H) - noteAt(0, H - 1, H)).toBe(5)
		expect(noteAt(0, 0, H)).toBe(28 + (H - 1) * 5) // top row of column 0
	})

	it("roots are every cell sharing the base pitch class", () => {
		expect(isRoot(28)).toBe(true) // E1
		expect(isRoot(40)).toBe(true) // E2 (octave) — column 12 of the bottom row
		expect(isRoot(29)).toBe(false)
		expect(isRoot(33)).toBe(false) // A
		// column 12 of the bottom row is the octave root
		expect(isRoot(noteAt(12, H - 1, H))).toBe(true)
	})
})
