import { describe, expect, it } from "vitest"
import { CycleLooper, MAX_LOOP_CYCLES } from "../src/util/cycleLooper.js"

const take = (moves: Array<[number, string, number]>, closeAt: number | undefined, cycle = 24) => {
	const l = new CycleLooper()
	l.press(0)
	for (const [pulse, id, value] of moves) l.record(id, value, pulse, cycle)
	l.press(closeAt)
	return l
}

describe("CycleLooper", () => {
	it("anchors on the cycle boundary before the first move and rounds to whole cycles", () => {
		const l = take([[30, "cell/0", 1], [40, "mute/1", 1]], 70)
		expect(l.anchor).toBe(24) // the boundary at or before pulse 30, mod the 48-pulse length
		expect(l.lengthPulses).toBe(48) // (70 - 24) / 24 ≈ 1.9 → 2 cycles
		expect(l.events.map((e) => e.atPulse)).toEqual([6, 16])
	})
	it("never shorter than one cycle; moves past a rounded-down end are dropped", () => {
		expect(take([[1, "cell/0", 1]], 5).lengthPulses).toBe(24)
		const l = take([[1, "cell/0", 1], [26, "cell/0", 2]], 29) // 29/24 → 1 cycle
		expect(l.events).toHaveLength(1)
	})
	it("fires each move at its absolute pulse, every lap, window half-open", () => {
		const l = take([[26.5, "cell/0", 2]], 50)
		expect(l.due(0, 2.5)).toEqual([])
		expect(l.due(2, 3)).toEqual([{ atPulse: 2.5, id: "cell/0", value: 2, pulse: 2.5 }])
		expect(l.due(26, 27).map((e) => e.pulse)).toEqual([26.5])
		expect(l.due(51, 74)).toEqual([])
		expect(l.due(0, 73).map((e) => e.pulse)).toEqual([2.5, 26.5, 50.5])
	})
	it("pause and resume stay cycle-aligned; clear empties", () => {
		const l = take([[5, "ensemble", 1]], 20)
		l.press(undefined)
		expect(l.state).toBe("stopped")
		expect(l.due(0, 100)).toEqual([])
		l.press(undefined)
		expect(l.due(24, 30).map((e) => e.pulse)).toEqual([29])
		l.clear()
		expect(l.state).toBe("empty")
	})
	it("closes itself at the cap", () => {
		const l = new CycleLooper()
		l.press(0)
		l.record("cell/0", 1, 0, 3)
		expect(l.tick(3 * MAX_LOOP_CYCLES - 1)).toBe(false)
		expect(l.tick(3 * MAX_LOOP_CYCLES)).toBe(true)
		expect(l.lengthPulses).toBe(3 * MAX_LOOP_CYCLES)
	})
	it("round-trips a snapshot, restored paused", () => {
		const a = take([[3, "cell/2", 1]], 24)
		const b = new CycleLooper()
		b.restore(a.snapshot())
		expect(b.state).toBe("stopped")
		expect(b.snapshot()).toEqual(a.snapshot())
	})
})
