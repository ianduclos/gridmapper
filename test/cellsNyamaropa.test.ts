import { describe, expect, it } from "vitest"
import {
	nyamaropaKushauraI,
	nyamaropaKushauraIII,
	nyamaropaKutsinhiraI,
	nyamaropaKutsinhiraII,
	nyamaropaKutsinhiraIII,
	nyamaropaPitch,
	nyamaropaWorld as world,
	tabEvents,
	type Part,
	type TabSection,
} from "../src/data/cells-nyamaropa.js"
import { eventHz, tuningNames, type CellEvent } from "../src/data/cells-hot-worlds.js"

const key = (e: CellEvent) => `${e.atPulse}:${e.sourceToken}:${e.pitchStep}`
const sourceKeys = (tab: TabSection[], part: Part) =>
	tabEvents(tab, part).map((e) => `${e.at}:${e.line}${e.key}:${nyamaropaPitch[e.line + e.key]}`).sort()
const rowKeys = (rows: number[], choice: number) =>
	rows.flatMap((r) => world.cells[r][choice].events).map(key).sort()
const gcd = (a: number, b: number): number => (b ? gcd(b, a % b) : a)

describe("mbira-nyamaropa world", () => {
	it("has six rows of three cells, three presets and complete metadata", () => {
		expect(world.id).toBe("mbira-nyamaropa")
		expect(world.cells).toHaveLength(6)
		expect(world.cells.every((row) => row.length === 3)).toBe(true)
		expect(world.presets).toHaveLength(3)
		expect(world.presets.every((p) => p.length === 6)).toBe(true)
		expect(world.presetNames).toHaveLength(3)
		expect(world.ensembleNotes).toHaveLength(3)
		expect(world.roles).toHaveLength(6)
		expect(tuningNames).toContain(world.recommendedTuning)
		expect(world.context!.split(". ")[0].length).toBeGreaterThan(40)
		for (const p of world.presets) p.forEach((c, row) => expect(world.cells[row][c]).toBeDefined())
	})

	it("uses integer lengths and a world cycle of at most 16 beats", () => {
		const lengths = world.cells.flat().map((c) => c.lengthPulses)
		expect(lengths.every(Number.isInteger)).toBe(true)
		const lcm = lengths.reduce((a, b) => (a / gcd(a, b)) * b, 1)
		expect(lcm).toBe(48)
		expect(lcm / (world.pulsesPerBeat ?? 3)).toBeLessThanOrEqual(16)
	})

	it("preserves every printed stroke of each chara, split across the three digit rows", () => {
		expect(rowKeys([0, 1, 2], 0)).toEqual(sourceKeys(nyamaropaKushauraI, "kushaura"))
		expect(rowKeys([0, 1, 2], 1)).toEqual(sourceKeys(nyamaropaKushauraIII, "kushaura"))
		expect(rowKeys([3, 4, 5], 0)).toEqual(sourceKeys(nyamaropaKutsinhiraI, "kutsinhira"))
		expect(rowKeys([3, 4, 5], 1)).toEqual(sourceKeys(nyamaropaKutsinhiraII, "kutsinhira"))
		expect(rowKeys([3, 4, 5], 2)).toEqual(sourceKeys(nyamaropaKutsinhiraIII, "kutsinhira"))
		// Excerpt loop = first 24 pulses of the standard kushaura, nothing added.
		expect(rowKeys([0, 1, 2], 2)).toEqual(
			sourceKeys(nyamaropaKushauraI, "kushaura").filter((k) => Number(k.split(":")[0]) < 24),
		)
	})

	it("keeps the printed tablature strings intact", () => {
		for (const tab of [nyamaropaKushauraI, nyamaropaKushauraIII, nyamaropaKutsinhiraI, nyamaropaKutsinhiraII, nyamaropaKutsinhiraIII]) {
			expect(tab).toHaveLength(4)
			for (const s of tab) for (const line of Object.values(s)) expect(line).toMatch(/^[.1-9]{12}$/)
		}
		expect(nyamaropaKushauraI[0]).toEqual({ RI: "......4.4...", RT: "2.2.2.....3.", UL: "1..1..5..2..", LL: ".1..1..2..4." })
		// The standard kutsinhira prints the same key columns as the standard kushaura...
		expect(nyamaropaKutsinhiraI).toEqual(nyamaropaKushauraI)
		// ...but its columns are labelled 12|1..11, so each stroke lands one pulse earlier.
		const kush = world.cells[2][0].events.map((e) => `${e.atPulse}:${e.sourceToken}`)
		const kuts = world.cells[5][0].events.map((e) => `${(e.atPulse + 1) % 48}:${e.sourceToken}`)
		expect(kuts.sort()).toEqual(kush.sort())
		expect(world.cells[4][0].events.map((e) => e.atPulse)).toContain(47)
	})

	it("fills every pulse of the cycle with the two standard parts together", () => {
		const onsets = new Set(world.cells.flatMap((row) => row[0].events.map((e) => e.atPulse)))
		expect(onsets.size).toBe(48)
		// Each standard part alone leaves pulses 6 and 12 of every section empty.
		const kush = new Set([0, 1, 2].flatMap((r) => world.cells[r][0].events.map((e) => e.atPulse)))
		expect(kush.size).toBe(40)
	})

	it("is monophonic per row, ordered, finite and inside each cell", () => {
		for (const row of world.cells)
			for (const cell of row) {
				const onsets = cell.events.map((e) => e.atPulse)
				expect(onsets).toEqual([...onsets].sort((a, b) => a - b))
				expect(new Set(onsets).size).toBe(onsets.length)
				for (const e of cell.events) {
					expect(Number.isInteger(e.atPulse)).toBe(true)
					expect(e.atPulse).toBeGreaterThanOrEqual(0)
					expect(e.atPulse).toBeLessThan(cell.lengthPulses)
					expect(e.durationPulses).toBeGreaterThan(0)
					expect(e.pitchStep).toBeGreaterThanOrEqual(0)
					expect(e.pitchStep).toBeLessThan(3 * world.degreeCount + 2)
				}
			}
	})

	it("keeps evolution tuples row-compatible and the kushaura as foundation", () => {
		expect(world.foundationRows).toEqual([0, 1, 2])
		for (const group of world.evolutionGroups!) {
			for (const tuple of group.choices) expect(tuple).toHaveLength(group.rows.length)
			expect(group.choices).toContainEqual(Array(group.rows.length).fill(0))
			for (const row of group.rows) expect(world.foundationRows).not.toContain(row)
		}
	})

	it("stays inside Max frequency limits under every tuning and root extreme", () => {
		for (const [voice, row] of world.cells.entries())
			for (const cell of row)
				for (const event of cell.events)
					for (const tuning of tuningNames)
						for (const root of [0.25, 4]) {
							const hz = eventHz(tuning, voice, event, world, root)
							expect(Number.isFinite(hz)).toBe(true)
							expect(hz, `${tuning}/v${voice}/root${root}`).toBeGreaterThanOrEqual(10)
							expect(hz, `${tuning}/v${voice}/root${root}`).toBeLessThanOrEqual(20000)
						}
	})
})
