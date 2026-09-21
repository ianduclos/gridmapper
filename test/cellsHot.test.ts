import { describe, expect, it } from "vitest"
import { CellsHotPage, PULSE_RATE } from "../src/pages/cells-hot.js"
import type { PageContext } from "../src/core/types.js"

const ctx = (sent: any[], controls: string[] = []): PageContext => ({
	size: { width: 16, height: 8 }, modifiers: { held: new Set(), shift1: false, shift2: false },
	clock: { running: false, rate: 20, tick: 0, lanes: [] }, slot: 1, slotLabel: "b",
	osc: { send: (path, ...args) => sent.push({ path, args }) }, setDirty: () => {}, setShift: () => {}, focus: () => {}, persist: () => {},
	clockControl: { start: () => controls.push("start"), stop: () => controls.push("stop"), setRate: (rate) => controls.push(`rate:${rate}`) },
})
const press = (p: CellsHotPage, c: PageContext, x: number, y: number) => { p.onKey({ x, y, s: 1 }, c); p.onKey({ x, y, s: 0 }, c) }
const packets = (sent: any[]) => sent.filter((m) => m.path === "/grid/out/page/b/cells").map((m) => JSON.parse(m.args[0]))

describe("cells-hot", () => {
	it("announces a session and produces an absolute-deadline sync packet from its chosen lane", () => {
		const sent: any[] = []; const p = new CellsHotPage(); const c = ctx(sent)
		p.init(c); sent.length = 0
		p.onClock!({ ...c.clock, running: true }, c)
		p.onTick!(1, 0, c)
		const out = packets(sent)
		expect(out[0]).toMatchObject({ type: "start" })
		expect(out.at(-1)).toMatchObject({ type: "sync", periodMs: 1000 / PULSE_RATE, humanizeMs: 4 })
		expect(out.at(-1).events[0]).toMatchObject({ voice: 1, hz: 55 })
		expect(out.at(-1).events[0].onsetMs).toBeGreaterThanOrEqual(Date.now() + 90)
	})

	it("keeps phase through a cell selection and replaces only the changed voice future", () => {
		const sent: any[] = []; const p = new CellsHotPage(); const c = ctx(sent)
		p.init(c); sent.length = 0; p.onClock!({ ...c.clock, running: true }, c); p.onTick!(4, 0, c); sent.length = 0
		press(p, c, 2, 0) // second ground cell
		const replace = packets(sent).find((x) => x.type === "replace")
		expect(replace).toMatchObject({ type: "replace", voice: 1 })
		expect(replace.cutoffMs).toBeGreaterThanOrEqual(Date.now() + 90)
		expect(replace.events.every((e: any) => e.onsetMs >= replace.cutoffMs)).toBe(true)
	})

	it("mutes by cancelling future events, restores silently, and persists settings without runtime state", () => {
		const sent: any[] = []; const p = new CellsHotPage(); const c = ctx(sent)
		p.init(c); p.onClock!({ ...c.clock, running: true }, c); sent.length = 0
		press(p, c, 4, 1); press(p, c, 4, 1)
		const out = packets(sent)
		expect(out.map((x) => x.type)).toEqual(["replace", "replace"])
		expect(out[0].events).toEqual([])
		const snapshot = p.serialize() as any
		expect(snapshot.muted).toEqual([false, false, false, false, false, false])
		const restored = new CellsHotPage(); restored.init(c); sent.length = 0; restored.restore!({ rootHz: 110, humanizeMs: 1, muted: [true] }, c)
		expect(packets(sent)).toEqual([])
		expect(restored.serialize()).toMatchObject({ rootHz: 110, humanizeMs: 1, muted: [true, false, false, false, false, false] })
	})

	it("starts the selected pulse rate only on an explicit run key and sends stop", () => {
		const sent: any[] = []; const controls: string[] = []; const p = new CellsHotPage(); const c = ctx(sent, controls)
		p.init(c); sent.length = 0; press(p, c, 1, 7); press(p, c, 2, 7)
		expect(controls).toEqual([`rate:${PULSE_RATE}`, "start", "stop"])
		expect(packets(sent).at(-1)).toMatchObject({ type: "stop" })
	})
})
