import { describe, it, expect, vi } from "vitest"
import { PageManager } from "../src/core/pageManager.js"
import {
	type GridSize,
	type Modifiers,
	type Page,
	type PageContext,
	type Slot,
	SLOT_INDICES,
} from "../src/core/types.js"
import type { ClockState } from "../src/core/clock.js"

const SIZE: GridSize = { width: 16, height: 8 }
const STOPPED_CLOCK: ClockState = { running: false, source: "internal", rate: 20, tick: 0 }

function makePm(onFrame?: Parameters<typeof PageManager.prototype.constructor>[1]) {
	const modifiers: Modifiers = { held: new Set(), shift1: false, shift2: false }
	const baseCtx: Omit<PageContext, "setDirty" | "slot" | "slotLabel"> = {
		size: SIZE,
		modifiers,
		clock: STOPPED_CLOCK,
		osc: { send: () => {} },
		setShift: () => {},
	}
	return new PageManager(baseCtx, onFrame as any)
}

/** Records which lifecycle calls it received, and from which slot. */
function clockedPage() {
	const ticks: number[] = []
	const clocks: ClockState[] = []
	let slot = -1
	let disposedCtx: PageContext | undefined
	const page: Page = {
		init(ctx) { slot = ctx.slot },
		onFocus() {},
		onBlur() {},
		onKey() {},
		onTick(n) { ticks.push(n) },
		onClock(s) { clocks.push({ ...s }) },
		render() { return undefined },
		dispose(ctx) { disposedCtx = ctx },
	}
	return { page, ticks, clocks, get slot() { return slot }, get disposedCtx() { return disposedCtx } }
}

describe("PageManager transport fan-out", () => {
	it("ticks EVERY loaded page, not just the focused one", () => {
		const pm = makePm()
		const pages = SLOT_INDICES.map(() => clockedPage())
		SLOT_INDICES.forEach((slot, i) => pm.load(slot, () => pages[i].page))
		pm.focus(0 as Slot)

		pm.tick(1)
		pm.tick(2)
		for (const p of pages) expect(p.ticks).toEqual([1, 2])
	})

	it("fans clock changes out to every loaded page", () => {
		const pm = makePm()
		const pages = SLOT_INDICES.map(() => clockedPage())
		SLOT_INDICES.forEach((slot, i) => pm.load(slot, () => pages[i].page))

		pm.clockChanged({ running: true, source: "internal", rate: 20, tick: 5 })
		for (const p of pages) expect(p.clocks).toEqual([{ running: true, source: "internal", rate: 20, tick: 5 }])
	})

	it("skips pages that don't implement the optional hooks", () => {
		const pm = makePm()
		const plain: Page = {
			init() {}, onFocus() {}, onBlur() {}, onKey() {},
			render() { return undefined }, dispose() {},
		}
		pm.load(0 as Slot, () => plain)
		expect(() => { pm.tick(1); pm.clockChanged(STOPPED_CLOCK) }).not.toThrow()
	})

	it("one throwing page cannot stall the transport for the others", () => {
		const err = vi.spyOn(console, "error").mockImplementation(() => {})
		const pm = makePm()
		const bad: Page = {
			init() {}, onFocus() {}, onBlur() {}, onKey() {},
			onTick() { throw new Error("boom") },
			render() { return undefined }, dispose() {},
		}
		const good = clockedPage()
		pm.load(0 as Slot, () => bad)
		pm.load(1 as Slot, () => good.page)
		pm.tick(7)
		expect(good.ticks).toEqual([7])
		expect(err).toHaveBeenCalled()
		err.mockRestore()
	})

	it("re-renders the focused page after a tick and reports the reason", () => {
		const reasons: string[] = []
		const pm = makePm((_f: unknown, reason: string) => reasons.push(reason))
		const p = clockedPage()
		pm.load(0 as Slot, () => p.page)
		reasons.length = 0
		pm.tick(1)
		expect(reasons).toEqual(["tick"])
	})

	it("passes the slot's context to dispose so a page can release external state", () => {
		const pm = makePm()
		const first = clockedPage()
		pm.load(3 as Slot, () => first.page)
		pm.load(3 as Slot, () => clockedPage().page) // replaces it
		expect(first.disposedCtx?.slotLabel).toBe("d")
	})
})
