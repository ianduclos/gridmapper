import { describe, it, expect } from "vitest"
import { Arpeggiator, arpSequence, ARP_BUTTONS, isArpMode } from "../src/util/arpeggiator.js"

/** Deterministic RNG for the urn: cycles a fixed list of [0,1) values. */
const seeded = (vals: number[]) => {
	let i = 0
	return () => vals[i++ % vals.length]
}

describe("arpSequence", () => {
	it("ascends and descends", () => {
		expect(arpSequence("ascending", 4)).toEqual([0, 1, 2, 3])
		expect(arpSequence("descending", 4)).toEqual([3, 2, 1, 0])
	})

	it("reflects without doubling the endpoints", () => {
		// 0 1 2 3 2 1, NOT 0 1 2 3 3 2 1 0 — the turnaround must not sit twice as long.
		expect(arpSequence("palindrome", 4)).toEqual([0, 1, 2, 3, 2, 1])
		expect(arpSequence("palindrome", 3)).toEqual([0, 1, 2, 1])
	})

	it("collapses for tiny pools", () => {
		expect(arpSequence("palindrome", 1)).toEqual([0])
		expect(arpSequence("palindrome", 2)).toEqual([0, 1])
		expect(arpSequence("ascending", 0)).toEqual([])
		expect(arpSequence("off", 4)).toEqual([])
	})

	it("recognises its own mode names", () => {
		expect(ARP_BUTTONS).toEqual(["ascending", "descending", "palindrome", "urn"])
		expect(isArpMode("urn")).toBe(true)
		expect(isArpMode("sideways")).toBe(false)
	})
})

describe("Arpeggiator", () => {
	it("is off until told otherwise, and yields nothing", () => {
		const a = new Arpeggiator()
		expect(a.isOn).toBe(false)
		expect(a.next(4)).toBeNull()
	})

	it("cycles ascending and wraps", () => {
		const a = new Arpeggiator()
		a.set("ascending")
		expect([0, 1, 2, 0, 1].map(() => a.next(3))).toEqual([0, 1, 2, 0, 1])
	})

	it("walks a palindrome without doubling the turn", () => {
		const a = new Arpeggiator()
		a.set("palindrome")
		expect(Array.from({ length: 8 }, () => a.next(4))).toEqual([0, 1, 2, 3, 2, 1, 0, 1])
	})

	it("pressing the lit mode turns it off", () => {
		const a = new Arpeggiator()
		a.toggle("urn")
		expect(a.mode).toBe("urn")
		a.toggle("urn")
		expect(a.mode).toBe("off")
		a.toggle("ascending")
		a.toggle("descending") // a DIFFERENT mode just switches
		expect(a.mode).toBe("descending")
	})

	it("urn plays every note once before repeating any", () => {
		const a = new Arpeggiator(seeded([0.1, 0.9, 0.4, 0.7, 0.2, 0.5]))
		a.set("urn")
		const bag = [a.next(4), a.next(4), a.next(4), a.next(4)]
		expect(new Set(bag)).toEqual(new Set([0, 1, 2, 3])) // a permutation, not a sequence
		const next = [a.next(4), a.next(4), a.next(4), a.next(4)]
		expect(new Set(next)).toEqual(new Set([0, 1, 2, 3])) // fresh bag
	})

	it("a changed pool size refills the urn rather than reusing a stale bag", () => {
		const a = new Arpeggiator(seeded([0.5, 0.2, 0.8, 0.3, 0.6]))
		a.set("urn")
		a.next(4)
		const bag = [a.next(2), a.next(2)]
		expect(new Set(bag)).toEqual(new Set([0, 1])) // only valid indices for the new size
	})

	it("never returns an index outside a shrinking pool", () => {
		const a = new Arpeggiator()
		a.set("ascending")
		a.next(5); a.next(5); a.next(5); a.next(5) // cursor is deep in a 5-note chord
		for (let i = 0; i < 6; i++) {
			const idx = a.next(2)!
			expect(idx).toBeGreaterThanOrEqual(0)
			expect(idx).toBeLessThan(2)
		}
	})

	it("a one-note pool just repeats that note", () => {
		const a = new Arpeggiator()
		a.set("ascending")
		expect([a.next(1), a.next(1), a.next(1)]).toEqual([0, 0, 0])
	})
})
