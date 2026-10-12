import { describe, it, expect } from "vitest"
import {
	applyLive, pressKey, clipsFrame, LEVEL, SLOT, SHIFT_X, CTRL_ROW, ARROWS,
	type ClipsState, type KeyResult,
} from "../src/util/clipsState.js"
import { ledIndex, type GridSize } from "../src/core/types.js"
import { linked, windowMsg, T0 } from "./clipsFixtures.js"

const SIZE: GridSize = { width: 16, height: 8 }
const press = (st: ClipsState, x: number, y: number) => pressKey(st, x, y, 1, T0)
const release = (st: ClipsState, x: number, y: number) => pressKey(st, x, y, 0, T0)
const tap = (st: ClipsState, x: number, y: number) => { press(st, x, y); return release(st, x, y) }
const msgs = (r: KeyResult) => r.send.map((m) => [m.path, ...m.args])
const staging = (o = {}) => {
	const st = linked(o)
	st.opts.stagedLaunch = true
	return st
}

describe("staged launch (experiment)", () => {
	it("off: shift + clip launches as usual", () => {
		const st = linked()
		press(st, SHIFT_X, CTRL_ROW)
		expect(msgs(press(st, 0, 0))).toEqual([["/clips/slot/button", 0, 0, 1]])
	})

	it("on: shift + taps stage silently; releasing shift fires them together, presses first", () => {
		const st = staging()
		press(st, SHIFT_X, CTRL_ROW)
		expect(press(st, 0, 0).send).toEqual([])
		expect(release(st, 0, 0).send).toEqual([])
		tap(st, 4, 2)
		const r = release(st, SHIFT_X, CTRL_ROW)
		expect(msgs(r)).toEqual([
			["/clips/slot/button", 0, 0, 1],
			["/clips/slot/button", 4, 2, 1],
			["/clips/slot/button", 0, 0, 0],
			["/clips/slot/button", 4, 2, 0],
		])
		expect(r.focus).toBe(4)
		expect(st.staged).toEqual([])
	})

	it("tapping a staged clip again unstages it", () => {
		const st = staging()
		press(st, SHIFT_X, CTRL_ROW)
		expect(press(st, 1, 1).send).toEqual([])
		release(st, 1, 1)
		expect(st.staged).toHaveLength(1)
		expect(press(st, 1, 1).send).toEqual([])
		release(st, 1, 1)
		expect(st.staged).toEqual([])
		expect(release(st, SHIFT_X, CTRL_ROW).send).toEqual([])
	})

	it("staging an empty slot fires it but doesn't move the focus", () => {
		const st = staging({ fill: () => SLOT.empty })
		press(st, SHIFT_X, CTRL_ROW)
		tap(st, 2, 0)
		const r = release(st, SHIFT_X, CTRL_ROW)
		expect(r.send).toHaveLength(2)
		expect(r.focus).toBeUndefined()
	})

	it("shift + arrow still steps by one while staging", () => {
		const st = staging()
		press(st, SHIFT_X, CTRL_ROW)
		expect(msgs(press(st, ARROWS.right, CTRL_ROW))).toEqual([["/clips/window/set", 1, 0]])
	})

	it("staged slots survive a bank move and fire at their absolute slot", () => {
		const st = staging()
		press(st, SHIFT_X, CTRL_ROW)
		tap(st, 3, 0)
		applyLive(st, "/clips/window", windowMsg({ trackOff: 15 }), T0)
		expect(msgs(release(st, SHIFT_X, CTRL_ROW))[0]).toEqual(["/clips/slot/button", 3, 0, 1])
	})

	it("staged clips blink dim, and only while in the window", () => {
		const st = staging()
		press(st, SHIFT_X, CTRL_ROW)
		tap(st, 0, 0)
		const lit = clipsFrame(st, SIZE, T0)[ledIndex(SIZE, 0, 0)]
		expect((LEVEL.staged as readonly number[]).includes(lit)).toBe(true)
		applyLive(st, "/clips/window", windowMsg({ trackOff: 15 }), T0)
		expect(clipsFrame(st, SIZE, T0)[ledIndex(SIZE, 0, 0)]).toBe(LEVEL.stopped)
	})
})
