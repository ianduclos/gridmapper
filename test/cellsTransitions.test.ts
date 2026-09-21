import { describe, expect, it, vi } from "vitest"
import { CellsHotPage } from "../src/pages/cells-hot.js"
import type { PageContext } from "../src/core/types.js"

const rig = () => {
	const sent: any[] = []
	const state: any = { running: false, rate: 10, tick: 0, lanes: [{ div: 1 }] }
	const c: PageContext = {
		size: { width: 16, height: 8 },
		modifiers: { held: new Set(), shift1: false, shift2: false },
		clock: state,
		slot: 1,
		slotLabel: "b",
		osc: { send: (path, ...args) => sent.push({ path, args }) },
		setDirty() {},
		setShift() {},
		focus() {},
		persist() {},
	}
	const p = new CellsHotPage()
	p.init(c)
	state.running = true
	p.onClock!(state, c)
	return {
		p,
		c,
		sent,
		tick(n: number) {
			vi.setSystemTime(1000 + (n - 1) * 100)
			p.onTick!(n, 0, c, 1000 + (n - 1) * 100)
		},
		view() {
			return JSON.parse(
				sent.filter((x) => x.path.endsWith("/view")).at(-1).args[0],
			)
		},
	}
}
describe("world transitions", () => {
	it("keeps only the latest pending world then replaces at a three-pulse boundary", () => {
		vi.useFakeTimers()
		const r = rig()
		r.tick(1)
		r.p.onOsc("/setting/rhythmWorld", ["manjanin"], r.c)
		r.p.onOsc("/setting/rhythmWorld", ["ngon"], r.c)
		expect(r.view().pendingWorldId).toBe("ngon")
		r.tick(2)
		r.tick(3)
		expect(r.view().worldId).not.toBe("ngon")
		r.tick(4)
		expect(r.view().worldId).toBe("ngon")
		const packets = r.sent
			.filter((x) => x.path.endsWith("/cells"))
			.map((x) => JSON.parse(x.args[0]))
		expect(packets.at(-1).type).toBe("replaceAll")
		vi.useRealTimers()
	})
})
