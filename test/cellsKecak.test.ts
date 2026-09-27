import { describe, expect, it } from "vitest"
import { kecakCak3, kecakCak6, kecakMelodi, kecakPung, kecakWorld } from "../src/data/cells-kecak.js"
import { eventHz, tuningNames } from "../src/data/cells-hot-worlds.js"

const on = (p: string) => [...p].flatMap((c, i) => (c === "C" ? [i] : []))
const at = (row: number, choice: number) => kecakWorld.cells[row][choice].events.map((e) => e.atPulse)
const gcd = (a: number, b: number): number => (b ? gcd(b, a % b) : a)

describe("kecak world (unregistered draft)", () => {
	it("has six rows of three cells, three presets and full metadata", () => {
		expect(kecakWorld.id).toBe("kecak")
		expect(kecakWorld.cells).toHaveLength(6)
		expect(kecakWorld.cells.every((r) => r.length === 3)).toBe(true)
		expect(kecakWorld.presets).toHaveLength(3)
		expect(kecakWorld.presets.every((p) => p.length === 6 && p.every((c) => c >= 0 && c < 3))).toBe(true)
		expect(kecakWorld.presetNames).toHaveLength(3)
		expect(kecakWorld.ensembleNotes).toHaveLength(3)
		expect(kecakWorld.roles).toHaveLength(6)
		expect(tuningNames).toContain(kecakWorld.recommendedTuning)
		expect(kecakWorld.pulsesPerBeat).toBe(4)
		for (const group of kecakWorld.evolutionGroups!) {
			for (const t of group.choices) expect(t).toHaveLength(group.rows.length)
			for (const r of group.rows) expect(kecakWorld.foundationRows).not.toContain(r)
		}
	})

	it("uses integer lengths and a world cycle of at most 16 beats", () => {
		const lengths = kecakWorld.cells.flat().map((c) => c.lengthPulses)
		expect(lengths.every(Number.isInteger)).toBe(true)
		const cycle = lengths.reduce((a, b) => (a * b) / gcd(a, b))
		expect(cycle).toBe(16)
		expect(cycle / kecakWorld.pulsesPerBeat!).toBeLessThanOrEqual(16)
	})

	it("keeps the printed patterns verbatim", () => {
		expect(kecakCak3).toEqual({ polos: "..C..C.C", sangsih: ".C..C.C.", sanglot: "C..C.C.." })
		expect(kecakCak6).toEqual({ polos: "C..C..C..C.C.C..", sangsih: ".C..C..C..C.C.C.", penyelah: "..C..C..C..C..C." })
		expect(on(kecakCak6.polos)).toHaveLength(6)
		expect(on(kecakCak6.penyelah)).toHaveLength(5)
		expect(kecakPung).toHaveLength(8)
		expect(Object.values(kecakMelodi).map((l) => l.join(""))).toEqual(["BSBS", "YIYUYEYS", "YOYAYEYS", "YEYS", "YEYAYOYS", "YEYOYEYS", "373S"])
	})

	it("preserves the source cak patterns in choices 0 and 1", () => {
		expect(at(0, 0)).toEqual(on(kecakCak3.polos))
		expect(at(1, 0)).toEqual(on(kecakCak3.sangsih))
		expect(at(2, 0)).toEqual(on(kecakCak3.sanglot))
		expect(at(0, 1)).toEqual(on(kecakCak6.polos))
		expect(at(1, 1)).toEqual(on(kecakCak6.sangsih))
		expect(at(2, 1)).toEqual(on(kecakCak6.penyelah))
		expect(at(3, 0)).toEqual([0, 1, 2, 3, 4, 5, 6, 7])
	})

	it("cak 3 parts are one rotation class and together cover every position", () => {
		expect(new Set([0, 1, 2].flatMap((r) => at(r, 0)))).toEqual(new Set([...Array(8).keys()]))
		expect(at(1, 0)).toEqual(at(0, 0).map((p) => p - 1))
		expect(at(2, 0)).toEqual(at(0, 0).map((p) => p - 2))
	})

	it("cak 6/5 union fills positions 0-14 and leaves 15 open, as printed", () => {
		expect([...new Set([0, 1, 2].flatMap((r) => at(r, 1)))].sort((a, b) => a - b)).toEqual([...Array(15).keys()])
	})

	it("closing-half excerpts equal positions 8-15 of the printed block", () => {
		for (const r of [0, 1, 2]) expect(at(r, 2).map((p) => p + 8)).toEqual(at(r, 1).filter((p) => p >= 8))
	})

	it("keeps melody syllable order from the source", () => {
		const toks = (r: number, c: number) => kecakWorld.cells[r][c].events.map((e) => e.sourceToken!.split(":")[1])
		expect(toks(4, 0)).toEqual(["Yang", "Ngir", "Yang", "Ngur", "Yang", "Nger", "Yang", "Sir"])
		expect(toks(5, 0)).toEqual(["Bug", "Sir", "Bug", "Sir"])
	})

	it("is monophonic per cell, ordered, in range and Max-safe", () => {
		for (const [voice, row] of kecakWorld.cells.entries()) for (const cell of row) {
			const o = cell.events.map((e) => e.atPulse)
			expect(o).toEqual([...o].sort((a, b) => a - b))
			expect(new Set(o).size).toBe(o.length)
			for (const e of cell.events) {
				expect(e.atPulse).toBeGreaterThanOrEqual(0)
				expect(e.atPulse).toBeLessThan(cell.lengthPulses)
				expect(e.durationPulses).toBeGreaterThan(0)
				for (const tuning of tuningNames) for (const root of [0.25, 4]) {
					const hz = eventHz(tuning, voice, e, kecakWorld, root)
					expect(hz).toBeGreaterThanOrEqual(10)
					expect(hz).toBeLessThanOrEqual(20000)
				}
			}
		}
	})
})
