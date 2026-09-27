import { describe, expect, it } from "vitest"
import {
	HALF,
	tshikonaFigure5,
	tshikonaPipeStep,
	tshikonaReadingA,
	tshikonaReadingB,
	tshikonaRowPipes,
	tshikonaWorld as world,
} from "../src/data/cells-tshikona.js"
import { eventHz, tuningNames, worlds } from "../src/data/cells-hot-worlds.js"

const gcd = (a: number, b: number): number => (b ? gcd(b, a % b) : a)
const pipeOf = (token: string) => Number(token.match(/^pipe(\d)/)![1])

describe("tshikona bank (Tracey & Gumboreshumba 2013)", () => {
	it("preserves fig.5 verbatim: seven paired onsets, each pipe twice, pairs a fourth/fifth apart", () => {
		expect(tshikonaFigure5.map((o) => [o.pulse, o.large, o.small])).toEqual([
			[1, 2, 6], [3, 3, 7], [5, 4, 1], [7, 5, 2], [8, 6, 3], [9.5, 7, 4], [11, 1, 5],
		])
		for (const scale of ["large", "small"] as const)
			expect(tshikonaFigure5.map((o) => o[scale]).sort()).toEqual([1, 2, 3, 4, 5, 6, 7])
		// Paired pipes are always four pipe numbers apart (mod 7): the two parallel scales.
		for (const o of tshikonaFigure5) expect((o.small - o.large + 7) % 7).toBe(4)
	})

	it("matches fig.10's per-pipe positions (spacings sum to 12)", () => {
		const positions = (pipe: number) =>
			tshikonaFigure5.filter((o) => o.large === pipe || o.small === pipe).map((o) => o.pulse)
		expect([1, 2, 3, 4, 5, 6, 7].map(positions)).toEqual([
			[5, 11], [1, 7], [3, 8], [5, 9.5], [7, 11], [1, 8], [3, 9.5],
		])
	})

	it("has 6 rows × 3 integer-length cells, a world cycle ≤ 16 beats, integer onsets", () => {
		expect(world.id).toBe("tshikona")
		expect(world.cells).toHaveLength(6)
		expect(world.cells.every((row) => row.length === 3)).toBe(true)
		const lengths = world.cells.flat().map((c) => c.lengthPulses)
		expect(lengths.every(Number.isInteger)).toBe(true)
		const lcm = lengths.reduce((a, b) => (a / gcd(a, b)) * b, 1)
		expect(lcm / world.pulsesPerBeat!).toBeLessThanOrEqual(16)
		expect(lcm / world.pulsesPerBeat!).toBe(4)
		for (const cell of world.cells.flat()) {
			const onsets = cell.events.map((e) => e.atPulse)
			expect(onsets.every(Number.isInteger)).toBe(true)
			expect(onsets).toEqual([...onsets].sort((a, b) => a - b))
			expect(new Set(onsets).size).toBe(onsets.length) // one voice, no simultaneous attacks
			for (const e of cell.events) {
				expect(e.atPulse).toBeGreaterThanOrEqual(0)
				expect(e.atPulse).toBeLessThan(cell.lengthPulses)
				expect(e.durationPulses).toBeGreaterThan(0)
			}
		}
	})

	it("choice 0: the union of all six rows is exactly the printed fig.5 composite", () => {
		const union = world.cells.flatMap((row) => row[0].events)
		expect(union).toHaveLength(14)
		const expected = tshikonaFigure5.flatMap((o) => [
			`${(o.pulse - 1) * HALF}:pipe${o.large}:large:${tshikonaPipeStep(o.large) + 7}`,
			`${(o.pulse - 1) * HALF}:pipe${o.small}:small:${tshikonaPipeStep(o.small) + 7}`,
		])
		expect(union.map((e) => `${e.atPulse}:${e.sourceToken}:${e.pitchStep}`).sort()).toEqual(expected.sort())
	})

	it("each row sounds only its allocated pipes, each at its own fixed pitch", () => {
		for (const [row, pipes] of tshikonaRowPipes.entries())
			for (const cell of world.cells[row])
				for (const e of cell.events) {
					const pipe = pipeOf(e.sourceToken!)
					expect(pipes).toContain(pipe)
					expect(e.pitchStep).toBe(tshikonaPipeStep(pipe) + 7)
				}
	})

	it("choices 1/2 apply the text's readings A and B and keep every onset paired", () => {
		for (const [choice, reading] of [[1, tshikonaReadingA], [2, tshikonaReadingB]] as const) {
			const union = world.cells.flatMap((row) => row[choice].events)
			expect(union).toHaveLength(14)
			const at = new Map<number, number>()
			for (const e of union) at.set(e.atPulse, (at.get(e.atPulse) ?? 0) + 1)
			expect([...at.values()].every((n) => n === 2)).toBe(true)
			const want = tshikonaFigure5.map((o) => ((reading[o.pulse] ?? o.pulse) - 1) * HALF).sort((a, b) => a - b)
			expect([...at.keys()].sort((a, b) => a - b)).toEqual(want)
		}
		expect(world.cells.flatMap((r) => r[1].events).map((e) => e.atPulse / HALF + 1).filter((p) => p > 6).sort((a, b) => a - b))
			.toEqual([7, 7, 8.5, 8.5, 10, 10, 11.5, 11.5])
		// Pipe 2 has no alternative in fig.10: identical in all readings, hence foundation.
		const p2 = world.cells[1].map((c) => c.events.map((e) => e.atPulse))
		expect(p2[1]).toEqual(p2[0])
		expect(p2[2]).toEqual(p2[0])
		expect(world.foundationRows).toEqual([1])
	})

	it("has complete metadata and is registered", () => {
		expect(world.presets).toEqual([[0, 0, 0, 0, 0, 0], [1, 1, 1, 1, 1, 1], [2, 2, 2, 2, 2, 2]])
		expect(world.presetNames).toHaveLength(3)
		expect(world.ensembleNotes).toHaveLength(3)
		expect(world.roles).toHaveLength(6)
		expect(tuningNames).toContain(world.recommendedTuning)
		expect(world.recommendationBasis!.length).toBeGreaterThan(20)
		expect(world.context!.split(". ")[0].length).toBeGreaterThan(40)
		for (const g of world.evolutionGroups!) {
			for (const t of g.choices) expect(t).toHaveLength(g.rows.length)
			expect(g.rows.some((r) => world.foundationRows!.includes(r))).toBe(false)
		}
		expect(worlds.tshikona).toBe(world)
	})

	it("stays inside Max frequency limits under every tuning and root extreme", () => {
		for (const [voice, row] of world.cells.entries())
			for (const cell of row)
				for (const e of cell.events)
					for (const tuning of tuningNames)
						for (const root of [0.25, 4]) {
							const hz = eventHz(tuning, voice, e, world, root)
							expect(hz).toBeGreaterThanOrEqual(10)
							expect(hz).toBeLessThanOrEqual(20000)
						}
	})
})
