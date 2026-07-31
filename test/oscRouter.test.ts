import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"
import { mkdtempSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { createOscRouter } from "../src/core/oscRouter.js"
import { PageManager } from "../src/core/pageManager.js"
import { ShiftInput } from "../src/core/shiftInput.js"
import { AppClock } from "../src/core/clock.js"
import { SettingsStore, DEFAULT_SETTINGS } from "../src/core/settings.js"
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
		clock: { running: false, rate: 20, tick: 0, lanes: [] },
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

	it("counts every inbound message as activity (wakes a sleeping app)", () => {
		const idle = { activity: vi.fn(), wake: vi.fn(), sleep: vi.fn() }
		const router = createOscRouter({
			pm: makePm(),
			shift: new ShiftInput(),
			reconnect: () => {},
			onKey: () => {},
			emit: () => {},
			slotPages: [],
			idle: idle as any,
		})
		router("/grid/in/key", [1, 1, 1])
		router("/grid/in/focus/page", ["a"])
		router("/grid/in/nonsense", [])
		expect(idle.activity).toHaveBeenCalledTimes(3)
	})

	it("routes /grid/in/wake and /grid/in/sleep", () => {
		const idle = { activity: vi.fn(), wake: vi.fn(), sleep: vi.fn() }
		const router = createOscRouter({
			pm: makePm(),
			shift: new ShiftInput(),
			reconnect: () => {},
			onKey: () => {},
			emit: () => {},
			slotPages: [],
			idle: idle as any,
		})
		router("/grid/in/wake", [])
		router("/grid/in/sleep", [])
		expect(idle.wake).toHaveBeenCalledTimes(1)
		expect(idle.sleep).toHaveBeenCalledTimes(1)
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

describe("createOscRouter — transport + settings", () => {
	beforeEach(() => vi.useFakeTimers())
	afterEach(() => vi.useRealTimers())

	function makeRouter() {
		const ticks: number[] = []
		const laneTicks: Array<{ tick: number; lane: number }> = []
		const clock = new AppClock({
			rate: 10,
			onTick: (n, lane) => {
				laneTicks.push({ tick: n, lane })
				if (lane === 0) ticks.push(n)
			},
		})
		// Mirror the host wiring (see core/appRuntime.ts): a settings change reaches the
		// live clock, which is what makes the lane rows in the web panel actually work.
		const settings = new SettingsStore(
			structuredClone(DEFAULT_SETTINGS),
			(s) => s.clock.lanes.forEach((lane, i) => clock.setLane(i, lane)),
			join(mkdtempSync(join(tmpdir(), "gridmapper-router-")), "settings.json")
		)
		const emit = vi.fn()
		const router = createOscRouter({
			pm: makePm(),
			shift: new ShiftInput(),
			reconnect: () => {},
			onKey: () => {},
			emit,
			slotPages: [],
			clock,
			settings,
		})
		return { router, clock, settings, emit, ticks, laneTicks }
	}

	it("starts and stops the transport", () => {
		const { router, clock, ticks } = makeRouter()
		router("/grid/in/clock/run", [1])
		expect(clock.running).toBe(true)
		vi.advanceTimersByTime(300)
		expect(ticks).toEqual([1, 2, 3])
		router("/grid/in/clock/run", [0])
		expect(clock.running).toBe(false)
		vi.advanceTimersByTime(500)
		expect(ticks).toEqual([1, 2, 3])
		clock.close()
	})

	it("steps manually — one tick per /grid/in/clock/tick, no transport needed", () => {
		const { router, ticks } = makeRouter()
		router("/grid/in/clock/tick", [])
		router("/grid/in/clock/tick", [])
		expect(ticks).toEqual([1, 2])
	})

	it("routes a manual tick to the lane in the argument, defaulting to lane 0", () => {
		const { router, laneTicks } = makeRouter()
		router("/grid/in/clock/tick", [2])
		router("/grid/in/clock/tick", [])
		router("/grid/in/clock/tick", [99]) // out of range → lane 0, never a crash
		expect(laneTicks).toEqual([
			{ tick: 1, lane: 2 },
			{ tick: 1, lane: 0 },
			{ tick: 2, lane: 0 },
		])
	})

	it("routes lane settings through to the live clock", () => {
		const { router, clock, settings } = makeRouter()
		router("/grid/in/settings/clock/lanes/1/source", ["external"])
		router("/grid/in/settings/clock/lanes/1/div", [7])
		expect(settings.get().clock.lanes[1]).toEqual({ source: "external", div: 7 })
		expect(clock.lane(1)).toMatchObject({ source: "external", div: 7 })
	})

	it("/grid/in/heartbeat is inert but still counts as activity", () => {
		const idle = { activity: vi.fn(), wake: vi.fn(), sleep: vi.fn() }
		const { clock } = makeRouter()
		const router = createOscRouter({
			pm: makePm(),
			shift: new ShiftInput(),
			reconnect: () => {},
			onKey: () => {},
			emit: () => {},
			slotPages: [],
			clock,
			idle: idle as any,
		})
		router("/grid/in/heartbeat", [])
		expect(idle.activity).toHaveBeenCalledTimes(1)
		expect(clock.tick).toBe(0) // it must never do anything else
		expect(clock.running).toBe(false)
	})

	it("resets the counter and re-emits state on demand", () => {
		const { router, clock, emit } = makeRouter()
		router("/grid/in/clock/tick", [])
		router("/grid/in/clock/reset", [])
		expect(clock.tick).toBe(0)
		emit.mockClear()
		router("/grid/in/clock/get", [])
		expect(emit).toHaveBeenCalledWith("/grid/out/clock", JSON.stringify(clock.state))
	})

	it("applies a live setting and echoes the whole settings object", () => {
		const { router, settings, emit } = makeRouter()
		router("/grid/in/settings/clock/rate", [45])
		expect(settings.get().clock.rate).toBe(45)
		expect(emit).toHaveBeenCalledWith("/grid/out/settings", settings.json())
		router("/grid/in/settings/idle/disconnectedMin", [3])
		expect(settings.get().idle.disconnectedMin).toBe(3)
	})

	it("refuses boot-only osc.* settings — no change, no ack", () => {
		const { router, settings, emit } = makeRouter()
		router("/grid/in/settings/osc/inPort", [9999])
		expect(settings.get().osc.inPort).toBe(DEFAULT_SETTINGS.osc.inPort)
		expect(emit).not.toHaveBeenCalled()
	})

	it("serves /grid/in/settings/get", () => {
		const { router, settings, emit } = makeRouter()
		router("/grid/in/settings/get", [])
		expect(emit).toHaveBeenCalledWith("/grid/out/settings", settings.json())
	})

	it("tolerates clock/settings paths when no transport is wired (test hosts)", () => {
		const router = createOscRouter({
			pm: makePm(),
			shift: new ShiftInput(),
			reconnect: () => {},
			onKey: () => {},
			emit: () => {},
			slotPages: [],
		})
		expect(() => router("/grid/in/clock/run", [1])).not.toThrow()
		expect(() => router("/grid/in/settings/clock/rate", [30])).not.toThrow()
	})
})
