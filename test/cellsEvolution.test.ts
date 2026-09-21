import { describe, expect, it } from "vitest"
import { CellsHotPage } from "../src/pages/cells-hot.js"
import type { PageContext } from "../src/core/types.js"
const setup = () => {
	const sent: any[] = []
	const c: PageContext = {
		size: { width: 16, height: 8 },
		modifiers: { held: new Set(), shift1: false, shift2: false },
		clock: { running: false, rate: 10, tick: 0, lanes: [{ div: 1 }] } as any,
		slot: 1,
		slotLabel: "b",
		osc: { send: (p, ...a) => sent.push({ p, a }) },
		setDirty() {},
		setShift() {},
		focus() {},
		persist() {},
	}
	const p = new CellsHotPage()
	p.init(c)
	p.restore({ rhythmWorld: "manjanin" }, c)
	return { p, c, sent }
}
describe("cells evolution state", () => {
	it("keeps auto evolution off after restore and persists locks", () => {
		const r = setup()
		r.p.onOsc("/lock/2", [], r.c)
		const saved = r.p.serialize()
		const s = setup()
		s.p.restore(saved, s.c)
		const view = JSON.parse(
			s.sent.filter((x) => x.p.endsWith("/view")).at(-1).a[0],
		)
		expect(view.locks[2]).toBe(true)
		expect(view.evolving).toBe(false)
		expect(view.evolvedRest).toEqual([false, false, false, false, false, false])
	})
})
