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
		expect(a.next([0, 1, 2, 3])).toBeNull()
	})

	it("cycles ascending and wraps", () => {
		const a = new Arpeggiator()
		a.set("ascending")
		const pool = [10, 20, 30]
		expect(Array.from({ length: 5 }, () => a.next(pool))).toEqual([10, 20, 30, 10, 20])
	})

	it("walks a palindrome without doubling the turn", () => {
		const a = new Arpeggiator()
		a.set("palindrome")
		const pool = [0, 1, 2, 3]
		expect(Array.from({ length: 8 }, () => a.next(pool))).toEqual([0, 1, 2, 3, 2, 1, 0, 1])
	})

	it("never plays the same note twice in a row when the chord GROWS", () => {
		// Laying a chord down finger by finger used to replay the lowest note, because the
		// cursor is an index and every index shifts when a note is inserted.
		const a = new Arpeggiator()
		a.set("ascending")
		expect(a.next([0])).toBe(0) // first finger
		expect(a.next([0, 4])).toBe(4) // second — must NOT be 0 again
		expect(a.next([0, 4, 7])).not.toBe(4) // third — must not repeat either
	})

	it("still repeats when there is only one note to play", () => {
		const a = new Arpeggiator()
		a.set("ascending")
		expect([a.next([7]), a.next([7]), a.next([7])]).toEqual([7, 7, 7])
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
		const pool = [0, 1, 2, 3]
		const bag = Array.from({ length: 4 }, () => a.next(pool))
		expect(new Set(bag)).toEqual(new Set(pool)) // a permutation, not a sequence
	})

	it("a changed pool size refills the urn rather than reusing a stale bag", () => {
		const a = new Arpeggiator(seeded([0.5, 0.2, 0.8, 0.3, 0.6]))
		a.set("urn")
		a.next([0, 1, 2, 3])
		const bag = [a.next([10, 20]), a.next([10, 20])]
		expect(new Set(bag)).toEqual(new Set([10, 20])) // only notes from the NEW pool
	})

	it("never returns a note outside a shrinking pool", () => {
		const a = new Arpeggiator()
		a.set("ascending")
		const big = [0, 1, 2, 3, 4]
		for (let i = 0; i < 4; i++) a.next(big) // cursor is deep in a 5-note chord
		for (let i = 0; i < 6; i++) expect([10, 20]).toContain(a.next([10, 20]))
	})
})
