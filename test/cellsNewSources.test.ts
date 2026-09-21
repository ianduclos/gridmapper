import { describe, expect, it } from "vitest"
import { manjanin2Lead, manjanin2Pulse, manjanin2World } from "../src/data/cells-manjanin2.js"
import { wolosoCycle8, wolosoWorld } from "../src/data/cells-woloso.js"
import { kotekanWorld, pelayonComposite } from "../src/data/cells-kotekan.js"
import { eventHz, tuningNames, worlds, type CellEvent, type World } from "../src/data/cells-hot-worlds.js"

const newWorlds = [manjanin2World,wolosoWorld,kotekanWorld]
const eventKey = (event:CellEvent) => `${event.atPulse}:${event.sourceToken}:${event.pitchStep}`
const mergedKeys = (world:World, rows:number[], choice=0) => rows.flatMap(row=>world.cells[row][choice].events).map(eventKey).sort()

describe("new source-grounded rhythm banks", () => {
	it("uses distinct four-cycle Manjanin excerpts and preserves the quartet split", () => {
		expect(manjanin2Lead.flat()).toHaveLength(12)
		expect(manjanin2Lead.flat().every(cycle => cycle.length === 12)).toBe(true)
		expect(manjanin2Lead).toEqual([
		[".S.S.S.S..TS", ".S.S.S.S..TS", ".S.S.S.S..TS", "S..BS..BSSTT"],
		[".S.S.S.S..TS", "S....SB.SB.S", "B.SB.SB.S.TT", "TTS..SB.S.TT"],
		["TTTTTTTT..S.", ".S.S.S.S.S.S", ".S.S.S.S..TS", "S....TTTTSS."],
	])
		for (const row of manjanin2World.cells) expect(row.map(cell => cell.lengthPulses)).toEqual([48,48,48])
		for (let choice=0; choice<3; choice++) expect(manjanin2World.cells[4][choice].events.some(e=>e.sourceToken?.startsWith("J1:"))).toBe(true)
		expect(manjanin2World.cells[2][0].events).toHaveLength(16)
		expect(manjanin2World.cells[3][0].events).toHaveLength(32)
		expect([manjanin2Pulse(0),manjanin2Pulse(1),manjanin2Pulse(2)]).toEqual([0,.81,1.8])
		expect(manjanin2World.cells[3][0].events.slice(0,4).map(e=>e.atPulse)).toEqual([0,1.8,3,4.8])
		expect(manjanin2World.cells[5].flatMap(cell=>cell.events).every(e=>e.pitchStep===12)).toBe(true)
	})

	it("retains Woloso Cycle 8 printed lead, second-jembe and dunun attacks", () => {
		const all = wolosoWorld.cells.flatMap(row => row[0].events)
		expect(all.filter(e=>e.sourceToken?.startsWith("Lead:")).map(e=>e.atPulse).sort((a,b)=>a-b)).toEqual([3,3.75,4.74,6,6.75,7.74,9,9.75,16.74,18,18.75,19.74,21,21.75])
		expect(all.filter(e=>e.sourceToken?.startsWith("J2:")).map(e=>e.atPulse).sort((a,b)=>a-b)).toEqual([0,1.74,3,4.74,6,7.74,9,10.74,12,13.74,15,16.74,18,19.74,21,22.74])
		expect(all.filter(e=>e.sourceToken?.startsWith("Dunun:")).map(e=>e.atPulse).sort((a,b)=>a-b)).toEqual([0,3,4.74,9,10.74,12,13.74,16.74,19.74,22.74])
	})

	it("keeps Pelayon's paired 16-attack interlock and final gong arrival", () => {
		expect(pelayonComposite).toEqual([1,0,1,0,1,1,2,1,2,1,2,1,-1,-1,0,-1,0,-1,0,-1,-2,-2,-1,-2,-1,-2,-1,-2,0,0,1,0])
		expect(kotekanWorld.cells[0][0].events).toHaveLength(16)
		expect(kotekanWorld.cells[1][0].events).toHaveLength(16)
		expect([...kotekanWorld.cells[0][0].events,...kotekanWorld.cells[1][0].events].map(e=>e.atPulse).sort((a,b)=>a-b)).toEqual([...Array(32).keys()])
		expect(kotekanWorld.cells[2][0].events.map(e=>e.pitchStep!-7)).toEqual([2,1,0,-1,0,-2,-1,0])
		expect(kotekanWorld.cells[4][0].events.map(e=>e.atPulse)).toEqual([12,28])
		expect(kotekanWorld.cells[5][0].events.map(e=>[e.sourceToken,e.atPulse])).toEqual([["gong:arrival",28]])
	})

	it("keeps authored evolution tuples row-compatible and leaves foundation out", () => {
		for (const world of newWorlds) {
			const groups = (world as typeof world & { evolutionGroups:{rows:number[];choices:number[][]}[] }).evolutionGroups
			for (const group of groups) for (const tuple of group.choices) {
				expect(tuple).toHaveLength(group.rows.length)
			}
			for(const group of groups) expect(group.choices).toContainEqual(Array(group.rows.length).fill(0))
		}
	})

	it("registers complete metadata, eighteen cells and three six-row presets", () => {
		for(const world of newWorlds) {
			expect(worlds[world.id]).toBe(world)
			expect(world.cells).toHaveLength(6)
			expect(world.cells.flat()).toHaveLength(18)
			expect(world.cells.every(row=>row.length===3)).toBe(true)
			expect(world.presets).toHaveLength(3)
			expect(world.presets.every(preset=>preset.length===6)).toBe(true)
			expect(world.presetNames).toHaveLength(3)
			expect(world.roles).toHaveLength(6)
			expect(world.pulsesPerBeat).toBeGreaterThan(0)
			expect(world.recommendationBasis?.length).toBeGreaterThan(20)
			expect(world.performanceBeatBasis?.length).toBeGreaterThan(20)
			expect(world.foundationRows?.length).toBe(4)
		}
	})

	it("keeps every event finite, ordered, unique and scheduler-safe", () => {
		for(const world of newWorlds) for(const row of world.cells) for(const cell of row) {
			const onsets=cell.events.map(event=>event.atPulse)
			expect(onsets).toEqual([...onsets].sort((a,b)=>a-b))
			expect(new Set(onsets).size).toBe(onsets.length)
			for(const event of cell.events) {
				expect(Number.isFinite(event.atPulse)).toBe(true)
				expect(event.atPulse).toBeGreaterThanOrEqual(0)
				expect(event.atPulse).toBeLessThan(cell.lengthPulses)
				expect(Number.isFinite(event.durationPulses)).toBe(true)
				expect(event.durationPulses).toBeGreaterThan(0)
			}
		}
	})

	it("stays inside Max frequency limits under every tuning and root extreme", () => {
		for(const world of newWorlds) for(const [voice,row] of world.cells.entries()) for(const cell of row) for(const event of cell.events) for(const tuning of tuningNames) for(const root of [.25,4]) {
			const hz=eventHz(tuning,voice,event,world,root)
			expect(Number.isFinite(hz),`${world.id}/${tuning}/v${voice}`).toBe(true)
			expect(hz,`${world.id}/${tuning}/v${voice}/root${root}`).toBeGreaterThanOrEqual(10)
			expect(hz,`${world.id}/${tuning}/v${voice}/root${root}`).toBeLessThanOrEqual(20000)
		}
	})

	it("reconstructs source material from complementary allocations", () => {
		for(const row of [0,1,2,3]) expect([
			...manjanin2World.cells[row][1].events,
			...manjanin2World.cells[row][2].events,
		].map(eventKey).sort()).toEqual(manjanin2World.cells[row][0].events.map(eventKey).sort())
		expect(mergedKeys(kotekanWorld,[0,1])).toEqual(pelayonComposite.map((degree,atPulse)=>`${atPulse}:interlock:${atPulse%2?"B":"A"}:${degree+7}`).sort())
		const strokes = (world:World,rows:number[]) => rows.flatMap(row=>world.cells[row][0].events).sort((a,b)=>a.atPulse-b.atPulse).map(event=>event.sourceToken!.at(-1))
		expect(strokes(wolosoWorld,[0,1])).toEqual(wolosoCycle8.dunun.filter(stroke=>stroke!=="."))
		expect(strokes(wolosoWorld,[2,3])).toEqual(wolosoCycle8.second.filter(stroke=>stroke!=="."))
		expect(strokes(wolosoWorld,[4,5])).toEqual(wolosoCycle8.lead.filter(stroke=>stroke!=="."))
		for(let choice=0;choice<3;choice++) expect(manjanin2World.cells[4][choice].events.length+manjanin2World.cells[5][choice].events.length).toBe(manjanin2Lead[choice].join("").replaceAll(".","").length)
	})

	it("keeps the opening Pelayon gong silence as a documented source rest", () => {
		const opening= kotekanWorld.cells[5][1]
		expect(opening.events).toEqual([])
		expect(opening.provenance).toMatchObject({ note: expect.stringContaining("source-derived structural rest") })
		expect(kotekanWorld.cells[5][2].events.map(e=>e.atPulse)).toEqual([12])
	})
})
