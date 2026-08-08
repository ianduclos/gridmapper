import { describe, it, expect } from "vitest"
import {
	SCALES,
	SCALE_NAMES,
	DEFAULT_SCALE,
	OCTAVE,
	degreesOf,
	stepsPerOctave,
	isInScale,
	isRootOf,
	foldedStep,
	isScaleName,
} from "../src/util/scales.js"

describe("the scale table", () => {
	it("ships the modes, the pentatonics and the funkier ones", () => {
		expect(SCALE_NAMES).toContain("ionian")
		expect(SCALE_NAMES).toContain("locrian")
		expect(SCALE_NAMES).toContain("pentatonic-major")
		expect(SCALE_NAMES).toContain("pentatonic-minor")
		expect(SCALE_NAMES).toContain("lydian-b7")
		expect(SCALE_NAMES).toContain("altered")
		expect(SCALE_NAMES).toHaveLength(16)
	})

	it("defaults to ionian, not to the identity scale", () => {
		// A keyboard that highlights nothing is harder to play than one that does.
		expect(DEFAULT_SCALE).toBe("ionian")
		expect(stepsPerOctave(DEFAULT_SCALE)).toBe(7)
		expect(stepsPerOctave("chromatic")).toBe(OCTAVE) // still the identity when chosen
	})

	it("has the expected note counts", () => {
		for (const name of ["ionian", "dorian", "phrygian", "lydian", "mixolydian", "aeolian", "locrian"]) {
			expect(stepsPerOctave(name)).toBe(7)
		}
		expect(stepsPerOctave("pentatonic-major")).toBe(5)
		expect(stepsPerOctave("pentatonic-minor")).toBe(5)
		expect(stepsPerOctave("whole-tone")).toBe(6)
		expect(stepsPerOctave("blues")).toBe(6)
	})

	it("every scale is strictly ascending, starts on 0 and stays inside an octave", () => {
		for (const [name, degrees] of Object.entries(SCALES)) {
			expect(degrees[0], name).toBe(0)
			for (let i = 0; i < degrees.length; i++) {
				expect(degrees[i], name).toBeGreaterThanOrEqual(0)
				expect(degrees[i], name).toBeLessThan(OCTAVE)
				if (i > 0) expect(degrees[i], name).toBeGreaterThan(degrees[i - 1])
			}
		}
	})

	it("the modes really are rotations of one another", () => {
		// Dorian is ionian rotated to start on its second degree.
		const rotate = (deg: readonly number[], n: number) =>
			deg.map((_d, i) => (deg[(i + n) % deg.length] - deg[n] + OCTAVE) % OCTAVE)
		expect(rotate(SCALES.ionian, 1)).toEqual([...SCALES.dorian])
		expect(rotate(SCALES.ionian, 5)).toEqual([...SCALES.aeolian])
	})

	it("degrades unknown names to chromatic instead of throwing", () => {
		expect(degreesOf("not-a-scale")).toEqual([...SCALES.chromatic])
		expect(isScaleName("dorian")).toBe(true)
		expect(isScaleName("bebop-nonsense")).toBe(false)
	})
})

describe("isInScale / isRootOf", () => {
	it("finds the major scale at root 0", () => {
		const inC = [0, 2, 4, 5, 7, 9, 11].every((s) => isInScale(s, 0, "ionian"))
		expect(inC).toBe(true)
		expect(isInScale(1, 0, "ionian")).toBe(false) // C#
		expect(isInScale(6, 0, "ionian")).toBe(false) // F#
	})

	it("moves with the root", () => {
		expect(isInScale(6, 0, "ionian")).toBe(false)
		expect(isInScale(6, 2, "ionian")).toBe(true) // F# is in D major
	})

	it("works octaves up and below zero", () => {
		expect(isInScale(12, 0, "ionian")).toBe(true)
		expect(isInScale(-12, 0, "ionian")).toBe(true)
		expect(isInScale(-1, 0, "ionian")).toBe(true) // B, the 7th below
		expect(isRootOf(-24, 0)).toBe(true)
	})

	it("chromatic contains everything", () => {
		for (let s = -13; s < 13; s++) expect(isInScale(s, 5, "chromatic")).toBe(true)
	})
})

describe("foldedStep", () => {
	it("walks the scale one degree at a time, in semitones", () => {
		const steps = [0, 1, 2, 3, 4, 5, 6, 7].map((i) => foldedStep(i, 0, "ionian"))
		expect(steps).toEqual([0, 2, 4, 5, 7, 9, 11, 12]) // C major up to the octave
	})

	it("crosses the octave correctly for a 5-note scale", () => {
		const steps = [0, 1, 2, 3, 4, 5, 6].map((i) => foldedStep(i, 0, "pentatonic-major"))
		expect(steps).toEqual([0, 2, 4, 7, 9, 12, 14]) // index 5 wraps into the next octave
	})

	it("offsets by the root", () => {
		expect(foldedStep(0, 3, "pentatonic-minor")).toBe(3)
		expect(foldedStep(5, 3, "pentatonic-minor")).toBe(3 + 12)
	})

	it("goes down as well as up", () => {
		expect(foldedStep(-1, 0, "ionian")).toBe(-1) // B below middle C
		expect(foldedStep(-7, 0, "ionian")).toBe(-12)
	})

	it("is the identity on chromatic — folding a chromatic scale changes nothing", () => {
		for (let i = -5; i < 20; i++) expect(foldedStep(i, 0, "chromatic")).toBe(i)
	})

	it("only ever produces steps that are in the scale", () => {
		for (const name of SCALE_NAMES) {
			for (let i = -8; i < 20; i++) {
				expect(isInScale(foldedStep(i, 4, name), 4, name), `${name} @ ${i}`).toBe(true)
			}
		}
	})
})
