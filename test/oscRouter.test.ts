import { describe, it, expect, vi } from "vitest"
import { createOscRouter } from "../src/core/oscRouter.js"
import { PageManager } from "../src/core/pageManager.js"
import { ShiftInput } from "../src/core/shiftInput.js"
import { DEFAULT_PAGE } from "../src/pages/registry.js"
import {
	type GridSize,
	type Modifiers,
	type PageContext,
	type Page,
	type Slot,
	SLOT_INDICES,
} from "../src/core/types.js"

const SIZE: GridSize = { width: 16, height: 8 }

function makePm() {
	const modifiers: Modifiers = { held: new Set(), shift1: false, shift2: false }
	const baseCtx: Omit<PageContext, "setDirty" | "slot" | "slotLabel"> = {
		size: SIZE,
		modifiers,
		osc: { send: () => {} },
		setShift: () => {},
	}
	return new PageManager(baseCtx)
}

// A minimal stub page — enough to satisfy PageManager.load/onOsc without depending on
// a real registered page's own OSC vocabulary.
function stubPage(): Page & { onOscCalls: Array<{ path: string; args: any[] }> } {
	const onOscCalls: Array<{ path: string; args: any[] }> = []
	return {
		onOscCalls,
		init() {},
		onFocus() {},
		onBlur() {},
		onKey() {},
		onOsc(path, args) {
			onOscCalls.push({ path, args })
		},
		render() {
			return undefined
		},
		dispose() {},
	}
}

function loadStubs(pm: PageManager) {
	for (const slot of SLOT_INDICES) pm.load(slot, () => stubPage())
}

describe("createOscRouter", () => {
	it("routes /grid/in/key with numeric coercion + press/release", () => {
		const onKey = vi.fn()
		const router = createOscRouter({
			pm: makePm(),
			shift: new ShiftInput(),
			reconnect: () => {},
			onKey,
			emit: () => {},
			slotPages: Array.from(SLOT_INDICES, () => DEFAULT_PAGE),
		})
		router("/grid/in/key", ["3", "5", "1"])
		expect(onKey).toHaveBeenCalledWith({ x: 3, y: 5, s: 1 })
		router("/grid/in/key", [3, 5, 0])
		expect(onKey).toHaveBeenLastCalledWith({ x: 3, y: 5, s: 0 })
	})

	it("routes /grid/in/connect to reconnect", () => {
		const reconnect = vi.fn()
		const router = createOscRouter({
			pm: makePm(),
			shift: new ShiftInput(),
			reconnect,
			onKey: () => {},
			emit: () => {},
			slotPages: [],
		})
		router("/grid/in/connect", [])
		expect(reconnect).toHaveBeenCalledTimes(1)
	})

	it("routes /grid/in/shift to shift.set", () => {
		const shift = new ShiftInput()
		const router = createOscRouter({
			pm: makePm(),
			shift,
			reconnect: () => {},
			onKey: () => {},
			emit: () => {},
			slotPages: [],
		})
		router("/grid/in/shift", [1, 1])
		expect(shift.shift1).toBe(true)
		expect(shift.shift2).toBe(false)
	})

	it("routes /grid/in/focus/page, focuses the slot, and acks via emit", () => {
		const pm = makePm()
		loadStubs(pm)
		const emit = vi.fn()
		const router = createOscRouter({
			pm,
			shift: new ShiftInput(),
			reconnect: () => {},
			onKey: () => {},
			emit,
			slotPages: Array.from(SLOT_INDICES, () => DEFAULT_PAGE),
		})
		router("/grid/in/focus/page", ["c"])
		expect(pm.focusedSlot).toBe(2)
		expect(emit).toHaveBeenCalledWith("/grid/out/focus/page", "c")
	})

	it("loads a valid page into a slot, updates slotPages, and acks via emit", () => {
		const pm = makePm()
		loadStubs(pm)
		const emit = vi.fn()
		const slotPages = Array.from(SLOT_INDICES, () => DEFAULT_PAGE)
		const router = createOscRouter({
			pm,
			shift: new ShiftInput(),
			reconnect: () => {},
			onKey: () => {},
			emit,
			slotPages,
		})
		router("/grid/in/slot/c/page", ["toggle"])
		expect(slotPages[2]).toBe("toggle")
		expect(emit).toHaveBeenCalledWith("/grid/out/slots", ...slotPages)
	})

	it("ignores an unknown page name — slotPages unchanged, no ack", () => {
		const pm = makePm()
		loadStubs(pm)
		const emit = vi.fn()
		const slotPages = Array.from(SLOT_INDICES, () => DEFAULT_PAGE)
		const router = createOscRouter({
			pm,
			shift: new ShiftInput(),
			reconnect: () => {},
			onKey: () => {},
			emit,
			slotPages,
		})
		router("/grid/in/slot/c/page", ["not-a-real-page"])
		expect(slotPages[2]).toBe(DEFAULT_PAGE)
		expect(emit).not.toHaveBeenCalled()
	})

	it("rewrites /grid/in/page/<slot>/<rest> to routeOscToPage(slot, /<rest>, args)", () => {
		const pm = makePm()
		loadStubs(pm)
		const c = stubPage()
		pm.load(2 as Slot, () => c)
		const router = createOscRouter({
			pm,
			shift: new ShiftInput(),
			reconnect: () => {},
			onKey: () => {},
			emit: () => {},
			slotPages: Array.from(SLOT_INDICES, () => DEFAULT_PAGE),
		})
		router("/grid/in/page/c/setting/npo", [7])
		expect(c.onOscCalls).toEqual([{ path: "/setting/npo", args: [7] }])
	})

	it("ignores unknown paths without throwing", () => {
		const router = createOscRouter({
			pm: makePm(),
			shift: new ShiftInput(),
			reconnect: () => {},
			onKey: () => {},
			emit: () => {},
			slotPages: [],
		})
		expect(() => router("/grid/in/nonsense", [1, 2, 3])).not.toThrow()
		expect(() => router("/totally/unrelated", [])).not.toThrow()
	})
})
