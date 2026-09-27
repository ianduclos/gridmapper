import { describe, expect, it, vi, afterEach } from "vitest"
import { createAppRuntime } from "../src/core/appRuntime.js"
import { createOscRouter } from "../src/core/oscRouter.js"
import { PageManager } from "../src/core/pageManager.js"
import { ShiftInput } from "../src/core/shiftInput.js"
import { DEFAULT_SETTINGS } from "../src/core/settings.js"
import { type Page, type PageContext, SLOT_INDICES } from "../src/core/types.js"

afterEach(() => vi.useRealTimers())

/** A page that records its lifecycle and serializes one number. */
const log: string[] = []
let made = 0
function countingPage(): Page {
	const id = ++made
	let value = 0
	return {
		init() { log.push(`init ${id}`) },
		onFocus() {},
		onBlur() {},
		onKey() { value++ },
		render() { return undefined },
		dispose(c) { log.push(`dispose ${id}`); c.persist({ late: true }) },
		serialize: () => ({ value }),
		restore(raw: any) { value = raw?.value ?? 0 },
	}
}

function rig() {
	vi.useFakeTimers()
	log.length = 0
	made = 0
	const sent: Array<{ path: string; args: any[] }> = []
	const emit = (path: string, ...args: any[]) => sent.push({ path, args })
	const persisted: unknown[] = []
	const baseCtx: Omit<PageContext, "setDirty" | "slot" | "slotLabel" | "focus" | "persist"> = {
		size: { width: 16, height: 8 },
		modifiers: { held: new Set(), shift1: false, shift2: false },
		clock: { running: false, rate: 20, tick: 0, lanes: [] },
		osc: { send: emit },
		setShift: () => {},
	}
	const pm = new PageManager(baseCtx, undefined, { onPersist: (_s, p) => persisted.push(p) })
	// Loaded as stubs; power-on rebuilds by NAME through the registry, so it comes back as
	// real "base" pages.
	const slotPages = SLOT_INDICES.map(() => "base")
	for (const slot of SLOT_INDICES) pm.load(slot, countingPage)
	const loop = { running: true, intervalMs: 17, start() { this.running = true }, stop() { this.running = false } }
	const conn = {
		connected: true,
		polling: true,
		leds: [] as number[],
		isConnected() { return this.connected },
		setPollMs() {},
		start() { this.polling = true },
		stop() { this.polling = false },
		detach() { this.connected = false },
		grid: { ledLevelAll: (l: number) => conn.leds.push(l) },
	}
	const rt = createAppRuntime({ pm, loop, conn, slotPages, settings: structuredClone(DEFAULT_SETTINGS), emit, onWake: () => {} })
	const route = createOscRouter({
		pm, shift: new ShiftInput(), reconnect: () => {}, onKey: (e) => pm.onKey(e), emit, slotPages,
		clock: rt.clock, idle: rt.idle, power: rt.power,
	})
	return { pm, rt, route, sent, loop, conn, persisted }
}

describe("power", () => {
	it("off disposes every page, stops the clock and loop, blanks and releases the grid", () => {
		const r = rig()
		r.rt.clock.start()
		r.route("/grid/in/power", [0])
		expect(r.rt.power.on).toBe(false)
		expect(log.filter((l) => l.startsWith("dispose"))).toHaveLength(8)
		expect(r.persisted).toEqual([]) // late persists from disposing pages are dropped
		expect(r.rt.clock.running).toBe(false)
		expect(r.loop.running).toBe(false)
		expect(r.conn.leds).toEqual([0])
		expect(r.conn.connected).toBe(false)
		expect(r.conn.polling).toBe(false)
		expect(r.sent.at(-1)).toEqual({ path: "/grid/out/power", args: [0] })
		r.rt.close()
	})
	it("drops everything but power and ping while off", () => {
		const r = rig()
		r.route("/grid/in/power", [0])
		r.sent.length = 0
		r.route("/grid/in/clock/run", [1])
		r.route("/grid/in/key", [0, 0, 1])
		r.route("/grid/in/wake", [])
		expect(r.rt.clock.running).toBe(false)
		expect(r.loop.running).toBe(false)
		r.route("/grid/in/ping", ["x"])
		expect(r.sent).toEqual([{ path: "/grid/out/pong", args: ["x"] }])
		r.route("/grid/in/power/get", [])
		expect(r.sent.at(-1)).toEqual({ path: "/grid/out/power", args: [0] })
		r.rt.close()
	})
	it("no argument toggles; on reloads the layout and resumes grid discovery", () => {
		const r = rig()
		r.route("/grid/in/power", [])
		expect(r.rt.power.on).toBe(false)
		expect(r.pm.renderFocused()).toBeUndefined() // no pages at all while off
		r.route("/grid/in/power", [])
		expect(r.rt.power.on).toBe(true)
		expect(r.pm.renderFocused()).toBeDefined()
		expect(r.loop.running).toBe(true)
		expect(r.conn.polling).toBe(true)
		expect(r.rt.snapshot()).toContainEqual({ path: "/grid/out/power", args: [1] })
		r.rt.close()
	})
})
