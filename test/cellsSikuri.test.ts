import { describe, expect, it } from "vitest"
import {
	caballeroA,
	caballeroB,
	caballeroBombo,
	mariateguiA,
	mariateguiBombo,
	pipeIndex,
	sikuLadder,
	sikuriTunes,
	sikuriWorld,
	sikuRow,
	type PrintedNote,
} from "../src/data/cells-sikuri.js"
import { eventHz, tuningNames, type CellEvent } from "../src/data/cells-hot-worlds.js"

const w = sikuriWorld as typeof sikuriWorld & {
	pulsesPerBeat: number
	evolutionGroups: { rows: number[]; choices: number[][] }[]
}
const gcd = (a: number, b: number): number => (b ? gcd(b, a % b) : a)
const key = (at: number, pitch: string) => `${at}:${pitch}`
const printedKeys = (notes: readonly PrintedNote[]) =>
	notes.map((note) => key(note.at, note.pitch)).sort()
const cellKeys = (events: CellEvent[], octave: number) =>
	events.map((e) => key(e.atPulse, sikuLadder[e.pitchStep! - octave].pitch)).sort()

describe("sikuri world (Serrano Finetti 2022, figs.1–3)", () => {
	it("has six rows of three cells, three six-row presets and complete metadata", () => {
		expect(w.id).toBe("sikuri")
		expect(w.cells).toHaveLength(6)
		expect(w.cells.every((row) => row.length === 3)).toBe(true)
		expect(w.presets).toHaveLength(3)
		expect(w.presets.every((preset) => preset.length === 6)).toBe(true)
		expect(w.presetNames).toHaveLength(3)
		expect(w.ensembleNotes).toHaveLength(3)
		expect(w.roles).toHaveLength(6)
		expect(tuningNames).toContain(w.recommendedTuning)
		expect(w.recommendationBasis.length).toBeGreaterThan(20)
		expect(w.context!.split(". ")[0].length).toBeGreaterThan(40)
		for (const group of w.evolutionGroups) {
			for (const tuple of group.choices) expect(tuple).toHaveLength(group.rows.length)
			expect(group.choices).toContainEqual(Array(group.rows.length).fill(0))
		}
	})

	it("uses integer 60-pulse cells, so the world cycle is 15 beats", () => {
		const lengths = w.cells.flat().map((cell) => cell.lengthPulses)
		expect(lengths.every((length) => Number.isInteger(length) && length === 60)).toBe(true)
		const lcm = lengths.reduce((a, b) => (a / gcd(a, b)) * b, 1)
		expect(lcm / w.pulsesPerBeat).toBe(15)
		expect(lcm / w.pulsesPerBeat).toBeLessThanOrEqual(16)
	})

	it("keeps each printed excerpt at 15 beats with no overlapping melody notes", () => {
		for (const tune of sikuriTunes) {
			const notes = [...tune.notes].sort((a, b) => a.at - b.at)
			for (let i = 1; i < notes.length; i++) expect(notes[i].at).toBeGreaterThanOrEqual(notes[i - 1].at + notes[i - 1].dur)
			expect(notes.at(-1)!.at + notes.at(-1)!.dur).toBeLessThanOrEqual(60)
			for (const stroke of tune.bombo) expect(stroke.at).toBeLessThan(60)
		}
		expect(mariateguiA).toHaveLength(38)
		expect(caballeroA).toHaveLength(37)
		expect(caballeroB).toHaveLength(37)
		// B differs from A only in its first 16 pulses (bar 5 prints bar 3).
		expect(caballeroB.filter((n) => n.at >= 16)).toEqual(caballeroA.filter((n) => n.at >= 16))
		expect(mariateguiBombo.map((s) => s.at)).toEqual([0, 2, 4, 6, 8, 10, 12, 16, 18, 20, 22, 24, 28, 30, 32, 34, 36, 38, 40, 44, 46, 48, 50, 52, 54, 56, 58])
		expect(caballeroBombo.filter((s) => s.stroke === "slash").map((s) => s.at)).toEqual([8, 10, 26, 36, 38, 50, 58])
	})

	it("reads fig.1 as one alternating 13-pipe ladder from Eb4", () => {
		expect(sikuLadder).toHaveLength(13)
		expect(sikuLadder.filter((p) => p.row === "arka").map((p) => p.pitch)).toEqual(["Eb4", "G4", "Bb4", "Db5", "F5", "Ab5", "C6"])
		expect(sikuLadder.filter((p) => p.row === "ira").map((p) => p.pitch)).toEqual(["F4", "Ab4", "C5", "Eb5", "G5", "Bb5"])
		// every printed pitch lies inside the instrument's range
		for (const tune of sikuriTunes) for (const note of tune.notes) expect(pipeIndex(note.pitch)).toBeGreaterThanOrEqual(0)
	})

	it("preserves the printed melody: malta ira ∪ arka equals each excerpt", () => {
		sikuriTunes.forEach((tune, choice) => {
			const ira = w.cells[0][choice].events
			const arka = w.cells[1][choice].events
			expect(ira.every((e) => e.sourceToken!.includes(":ira:"))).toBe(true)
			expect(arka.every((e) => e.sourceToken!.includes(":arka:"))).toBe(true)
			expect(cellKeys([...ira, ...arka], 7)).toEqual(printedKeys(tune.notes))
			const onsets = [...ira, ...arka].map((e) => e.atPulse)
			expect(new Set(onsets).size).toBe(onsets.length)
			// sanqa pair is the same split an octave (seven pipes) lower
			expect(cellKeys([...w.cells[2][choice].events, ...w.cells[3][choice].events], 0)).toEqual(printedKeys(tune.notes))
		})
		// choice 0 is the source excerpt itself
		expect(cellKeys([...w.cells[0][0].events, ...w.cells[1][0].events], 7)).toEqual(printedKeys(mariateguiA))
	})

	it("alternates ira and arka on every sixteenth of the repique", () => {
		const repique = mariateguiA.filter((n) => n.at >= 52).map((n) => sikuRow(n.pitch))
		expect(repique).toEqual(["ira", "arka", "ira", "arka", "ira", "arka", "ira", "arka"])
	})

	it("splits the bombo line into accented and remaining strokes without loss", () => {
		sikuriTunes.forEach((tune, choice) => {
			const merged = [...w.cells[4][choice].events, ...w.cells[5][choice].events]
				.map((e) => `${e.atPulse}:${e.sourceToken}`)
				.sort()
			expect(merged).toEqual(tune.bombo.map((s) => `${s.at}:bombo:${s.stroke}`).sort())
		})
	})

	it("keeps every event finite, ordered, single-attack and inside Max limits", () => {
		for (const [voice, row] of w.cells.entries())
			for (const cell of row) {
				const onsets = cell.events.map((e) => e.atPulse)
				expect(onsets).toEqual([...onsets].sort((a, b) => a - b))
				expect(new Set(onsets).size).toBe(onsets.length)
				for (const event of cell.events) {
					expect(Number.isInteger(event.atPulse)).toBe(true)
					expect(event.atPulse).toBeGreaterThanOrEqual(0)
					expect(event.atPulse).toBeLessThan(cell.lengthPulses)
					expect(event.durationPulses).toBeGreaterThan(0)
					for (const tuning of tuningNames)
						for (const root of [0.25, 4]) {
							const hz = eventHz(tuning, voice, event, w, root)
							expect(Number.isFinite(hz)).toBe(true)
							expect(hz, `${tuning}/v${voice}/root${root}`).toBeGreaterThanOrEqual(10)
							expect(hz, `${tuning}/v${voice}/root${root}`).toBeLessThanOrEqual(20000)
						}
				}
			}
	})
})
