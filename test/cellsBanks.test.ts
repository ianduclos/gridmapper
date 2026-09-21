import { describe, expect, it, vi } from "vitest"
import { CellsHotPage, PULSE_RATE } from "../src/pages/cells-hot.js"
import { ledIndex, type PageContext } from "../src/core/types.js"

const makeRig = () => {
	const sent: any[] = [], control: string[] = []
	const ctx: PageContext = {
		size: { width: 16, height: 8 },
		slot: 1, slotLabel: "b",
		modifiers: { held: new Set(), shift1: false, shift2: false },
		clock: { running: false, rate: 20, tick: 0, lanes: [{ div: 2 }, { div: 1 }, { div: 1 }, { div: 1 }] } as any,
		osc: { send: (path, ...args) => sent.push({ path, args }) },
		setDirty() {}, setShift() {}, focus() {}, persist() {},
		clockControl: { start: () => control.push("start"), stop: () => control.push("stop"), setRate: (rate) => control.push(`rate:${rate}`) },
	}
	const page = new CellsHotPage()
	page.init(ctx)
	const tap = (x: number, y: number) => page.onKey({ x, y, s: 1 }, ctx)
	const packets = () => sent.filter((m) => m.path.endsWith("/cells")).map((m) => JSON.parse(m.args[0]))
	return { page, ctx, tap, control, packets }
}

describe("cells-hot choice banks", () => {
	it("selects rhythm and tuning choices from their physical banks", () => {
		const r = makeRig()
		r.tap(1, 6); r.tap(2, 0)
		expect(r.page.serialize()).toMatchObject({ rhythmWorld: "amadinda-ndyegulira" })
		r.tap(2, 6); r.tap(2, 0)
		expect(r.page.serialize()).toMatchObject({ tuning: "beating" })
		const frame = r.page.render(r.ctx)
		expect(frame[ledIndex(r.ctx.size, 2, 0)]).toBe(12)
	})

	it("keeps the scheduled phase alive while a bank is open", () => {
		vi.useFakeTimers(); vi.setSystemTime(1000)
		const r = makeRig()
		r.page.onClock!({ ...r.ctx.clock, running: true }, r.ctx)
		r.page.onTick!(10, 0, r.ctx)
		r.tap(1, 6); r.tap(2, 0)
		// World changes are queued for the next performance-beat boundary; the
		// current prepared pulse remains intact while the bank is open.
		expect(r.packets().at(-1).type).toBe("sync")
		expect(r.packets().some((packet) => packet.type === "stop")).toBe(false)
		r.page.onTick!(11, 0, r.ctx)
		expect(r.packets().at(-1).type).toBe("sync")
		vi.useRealTimers()
	})

	it("keeps the play toggle available in a bank", () => {
		const r = makeRig()
		r.tap(2, 6); r.tap(1, 7); r.tap(1, 7)
		expect(r.control).toEqual([`rate:${PULSE_RATE * 2}`, "start", "stop"])
		expect(r.packets().map((packet) => packet.type)).toEqual(["start", "stop"])
	})

	it("does not save bank mode and restores the cells view", () => {
		const r = makeRig()
		r.tap(1, 6)
		expect(r.page.serialize()).not.toHaveProperty("bankMode")
		r.page.restore!(r.page.serialize(), r.ctx)
		const frame = r.page.render(r.ctx)
		expect(frame[ledIndex(r.ctx.size, 1, 6)]).toBe(5)
		expect(frame[ledIndex(r.ctx.size, 3, 6)]).toBe(8)
	})
})
