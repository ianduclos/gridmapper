import { describe, it, expect } from "vitest"
import { worlds, eventHz, tuningNames } from "../src/data/cells-hot-worlds.js"
import { CellsHotPage } from "../src/pages/cells-hot.js"
import type { PageContext } from "../src/core/types.js"
describe("curated rhythm worlds", () => {
	it("preserves published Ndyegulira phase, octave doublings and high C line", () => {
		const w = worlds["amadinda-ndyegulira"],
			parts = w.cells.map((row) => row[0].events)
		expect(parts[0].map((e) => e.atPulse)).toEqual([
			0, 2, 4, 6, 8, 10, 12, 14, 16, 18, 20, 22,
		])
		expect(parts[2].map((e) => e.pitchStep)).toEqual([
			3, 1, 4, 3, 1, 4, 3, 1, 4, 3, 1, 4,
		])
		expect(parts[1].map((e) => e.pitchStep)).toEqual(
			parts[0].map((e) => e.pitchStep! + 5),
		)
		const c = [...parts[4], ...parts[5]].sort((a, b) => a.atPulse - b.atPulse)
		expect(c.map((e) => [e.atPulse, e.pitchStep! - 9])).toEqual([
			[0, 2],
			[2, 1],
			[3, 2],
			[4, 2],
			[6, 2],
			[8, 2],
			[9, 2],
			[12, 2],
			[14, 1],
			[15, 2],
			[16, 1],
			[18, 2],
			[21, 2],
		])
		expect(
			eventHz("pentatonic-model", 0, parts[1][0], w, 1) /
				eventHz("pentatonic-model", 0, parts[0][0], w, 1),
		).toBeCloseTo(2)
	})
	it("preserves the 36-pulse Ssematimba printed A/B sequences", () => {
		const w = worlds["amadinda-ssematimba"]
		expect(w.cells[0][0].lengthPulses).toBe(36)
		expect(w.cells[0][0].events.map((e) => e.pitchStep! + 1)).toEqual([
			4, 5, 2, 3, 3, 5, 2, 1, 2, 5, 2, 2, 1, 4, 4, 2, 1, 1,
		])
		expect(w.cells[2][0].events.map((e) => e.pitchStep! + 1)).toEqual([
			1, 4, 3, 1, 2, 3, 4, 3, 2, 2, 5, 4, 3, 2, 4, 4, 4, 1,
		])
	})
	it("has valid six-voice banks and bounded event times under every tuning", () => {
		for (const w of Object.values(worlds)) {
			expect(w.cells).toHaveLength(6)
			for (const [v, row] of w.cells.entries()) {
				expect(row).toHaveLength(3)
				for (const c of row) {
					expect(new Set(c.events.map((e) => e.atPulse)).size).toBe(
						c.events.length,
					)
					for (const e of c.events) {
						expect(e.atPulse).toBeGreaterThanOrEqual(0)
						expect(e.atPulse).toBeLessThan(c.lengthPulses)
						for (const t of tuningNames) {
							const hz = eventHz(t, v, e, w, 1)
							expect(hz).toBeGreaterThanOrEqual(10)
							expect(hz).toBeLessThanOrEqual(20000)
						}
					}
				}
			}
		}
	})
	it("keeps tuning when switching worlds and prepares decay per event", () => {
		const sent: any[] = []
		const c: PageContext = {
			size: { width: 16, height: 8 },
			slot: 1,
			slotLabel: "b",
			modifiers: { held: new Set(), shift1: false, shift2: false },
			clock: {
				running: false,
				rate: 10,
				tick: 0,
				lanes: [{ source: "internal", div: 1, tick: 0 }],
			},
			osc: { send: (path, ...args) => sent.push({ path, args }) },
			setDirty() {},
			setShift() {},
			focus() {},
			persist() {},
		}
		const p = new CellsHotPage()
		p.init(c)
		p.onOsc("/setting/tuning", ["beating"], c)
		p.onOsc("/setting/rhythmWorld", ["amadinda-ndyegulira"], c)
		p.onOsc("/setting/durationMode", ["decay"], c)
		expect(p.serialize().tuning).toBe("beating")
		p.onClock({ ...c.clock, running: true }, c)
		p.onTick(1, 0, c)
		const q = JSON.parse(
			sent.filter((x) => x.path.endsWith("/cells")).at(-1).args[0],
		)
		expect(q.events.length).toBeGreaterThan(0)
		expect(
			q.events.every(
				(e: any) => e.durationMode === "decay" && e.durationMs === 70,
			),
		).toBe(true)
		const saved = p.serialize()
		p.restore(saved, c)
		expect(p.serialize()).toEqual(saved)
	})
	it("gives every world a performer-facing context and a matching ensembleNotes line per preset", () => {
		for (const w of Object.values(worlds)) {
			expect(typeof w.context).toBe("string")
			expect(w.context!.length).toBeGreaterThan(0)
			expect(w.ensembleNotes).toBeDefined()
			expect(w.ensembleNotes!.length).toBe(w.presetNames.length)
			for (const note of w.ensembleNotes!) {
				expect(typeof note).toBe("string")
				expect(note.length).toBeGreaterThan(0)
			}
		}
	})
})

it("reconstructs all 64 Chakwi attacks and corrected manual pitch mapping", () => {
	const w = worlds["mbira-chakwi"]
	const events = w.cells.flatMap((row) => row[0].events)
	expect(events).toHaveLength(64)
	const tokens = Object.fromEntries(
		events.map((e) => [e.sourceToken, e.pitchStep]),
	)
	expect(tokens).toMatchObject({
		LL3: 3,
		LL7: 8,
		LU3: 10,
		LU2: 11,
		RT2: 14,
		RI4: 16,
		RI5: 17,
		RI6: 18,
	})
	expect(
		events
			.filter((e) => e.atPulse === 1)
			.map((e) => e.sourceToken)
			.sort(),
	).toEqual(["LU3", "RT2"])
	const ri = events
		.filter((e) => e.sourceToken?.startsWith("RI"))
		.sort((a, b) => a.atPulse - b.atPulse)
	expect(ri.map((e) => e.sourceToken)).toEqual([
		"RI5",
		"RI5",
		"RI5",
		"RI5",
		"RI5",
		"RI5",
		"RI5",
		"RI5",
		"RI6",
		"RI6",
		"RI6",
		"RI4",
		"RI6",
		"RI6",
		"RI6",
		"RI6",
	])
	for (let v = 0; v < 6; v++)
		expect([
			...w.cells[v][1].events,
			...w.cells[v][2].events.map((e) => ({ ...e, atPulse: e.atPulse + 24 })),
		]).toEqual(w.cells[v][0].events)
})
