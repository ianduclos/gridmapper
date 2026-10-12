import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"
import { ClipsPage, page } from "../src/pages/clips.js"
import { SharedStore, FOCUS_CLIPS } from "../src/core/sharedStore.js"
import { HELLO_RETRY_MS, LEVEL, PAGES_X, CTRL_ROW } from "../src/util/clipsState.js"
import { ledIndex, type GridSize, type PageContext } from "../src/core/types.js"
import { windowMsg, tracksMsg, scenesMsg, type SetShape } from "./clipsFixtures.js"

const SIZE: GridSize = { width: 16, height: 8 }
type Msg = { path: string; args: any[] }

function rig(opts: { live?: boolean } = {}) {
	const live: Msg[] = []
	const osc: Msg[] = []
	let hear: ((path: string, args: any[]) => void) | null = null
	const shared = new SharedStore()
	const focus = vi.fn()
	const ctx = {
		size: SIZE,
		modifiers: { held: new Set(), shift1: false, shift2: false },
		clock: { running: false, rate: 20, tick: 0, lanes: [] },
		osc: { send: (path: string, ...args: any[]) => osc.push({ path, args }) },
		live: opts.live === false ? undefined : {
			send: (path: string, ...args: any[]) => live.push({ path, args }),
			on: (fn: (path: string, args: any[]) => void) => { hear = fn; return () => { hear = null } },
		},
		slot: 3,
		slotLabel: "d",
		setDirty: () => {},
		setShift: () => {},
		focus,
		persist: () => {},
		shared,
	} as unknown as PageContext
	const p = new ClipsPage()
	p.init(ctx)
	const fromLive = (path: string, args: any[]) => hear?.(path, args)
	const snapshot = (o: SetShape = {}) => {
		fromLive("/clips/window", windowMsg(o))
		fromLive("/clips/tracks", tracksMsg(o))
		fromLive("/clips/scenes", scenesMsg(o))
	}
	const at = (x: number, y: number) => p.render(ctx)![ledIndex(SIZE, x, y)]
	const key = (x: number, y: number, s: 0 | 1) => p.onKey({ x, y, s }, ctx)
	const hellos = () => live.filter((m) => m.path === "/clips/hello").length
	return { p, ctx, live, osc, shared, focus, fromLive, snapshot, at, key, hellos, listening: () => hear !== null }
}

beforeEach(() => vi.useFakeTimers())
afterEach(() => vi.useRealTimers())

describe("clips page", () => {
	it("says hello at init and every 2 s until the fork answers, then stops", () => {
		const r = rig()
		expect(r.hellos()).toBe(1)
		vi.advanceTimersByTime(HELLO_RETRY_MS)
		expect(r.hellos()).toBe(2)
		r.snapshot()
		vi.advanceTimersByTime(HELLO_RETRY_MS * 3)
		expect(r.hellos()).toBe(2)
	})

	it("shows the no-link border until the snapshot, then the window", () => {
		const r = rig()
		expect(r.at(0, 0)).toBe(LEVEL.noLink)
		expect(r.at(5, 3)).toBe(0)
		r.snapshot()
		expect(r.at(5, 3)).toBe(LEVEL.stopped)
	})

	it("a launch goes to Live, publishes focus/clips and tells Max", () => {
		const r = rig()
		r.snapshot({ trackOff: 15 })
		r.key(2, 0, 1)
		expect(r.live.at(-1)).toEqual({ path: "/clips/slot/button", args: [17, 0, 1] })
		expect(r.shared.get(FOCUS_CLIPS)).toBe(17)
		expect(r.osc).toContainEqual({ path: "/grid/out/page/d/focus/track", args: [17] })
	})

	it("Live traffic never reaches Max, and Max traffic never reaches Live", () => {
		const r = rig()
		r.snapshot()
		r.key(0, 0, 1)
		r.key(0, 0, 0)
		r.key(12, 7, 1)
		expect(r.osc.every((m) => m.path.startsWith("/grid/out/"))).toBe(true)
		expect(r.live.every((m) => m.path.startsWith("/clips/"))).toBe(true)
	})

	it("pages key + top-row key focuses that slot", () => {
		const r = rig()
		r.key(PAGES_X, CTRL_ROW, 1)
		r.key(5, 0, 1)
		expect(r.focus).toHaveBeenCalledWith(5)
		expect(r.live.filter((m) => m.path === "/clips/slot/button")).toEqual([])
	})

	it("announces its type and settings, takes a setting over OSC and echoes it", () => {
		const r = rig()
		expect(r.osc).toContainEqual({ path: "/grid/out/page/d/type", args: ["clips"] })
		expect(r.osc).toContainEqual({ path: "/grid/out/page/d/settings", args: [JSON.stringify({ stagedLaunch: false })] })
		r.p.onOsc!("/setting/stagedLaunch", [1], r.ctx)
		expect(r.p.serialize!()).toEqual({ stagedLaunch: true })
		expect(r.osc.at(-1)).toEqual({ path: "/grid/out/page/d/settings", args: [JSON.stringify({ stagedLaunch: true })] })
		r.p.onOsc!("/settings/get", [], r.ctx)
		expect(r.osc.at(-1)!.path).toBe("/grid/out/page/d/settings")
		r.p.onOsc!("/setting/nonsense", [1], r.ctx)
		expect(r.p.serialize!()).toEqual({ stagedLaunch: true })
	})

	it("turning staged launch off drops anything staged", () => {
		const r = rig()
		r.snapshot()
		r.p.onOsc!("/setting/stagedLaunch", [1], r.ctx)
		r.key(15, 7, 1)
		r.key(0, 0, 1)
		r.key(0, 0, 0)
		r.p.onOsc!("/setting/stagedLaunch", [0], r.ctx)
		r.key(15, 7, 0)
		expect(r.live.filter((m) => m.path === "/clips/slot/button")).toEqual([])
	})

	it("round-trips its settings through a fresh page; restore sends nothing to Live and survives junk", () => {
		const a = rig()
		a.p.onOsc!("/setting/stagedLaunch", [1], a.ctx)
		const saved = JSON.parse(JSON.stringify(a.p.serialize!()))
		const b = rig()
		const before = b.live.length
		b.p.restore!(saved, b.ctx)
		expect(b.p.serialize!()).toEqual(saved)
		expect(b.live.length).toBe(before)
		for (const junk of [null, undefined, 7, "x", [], { stagedLaunch: "maybe" }]) b.p.restore!(junk, b.ctx)
		expect(b.p.serialize!()).toEqual(saved)
	})

	it("dispose stops listening and stops the retry timer", () => {
		const r = rig()
		r.p.dispose(r.ctx)
		expect(r.listening()).toBe(false)
		const n = r.live.length
		vi.advanceTimersByTime(10_000)
		expect(r.live.length).toBe(n)
	})

	it("works on a host with no Live link: no-link border, no throw", () => {
		const r = rig({ live: false })
		vi.advanceTimersByTime(5000)
		expect(r.at(0, 0)).toBe(LEVEL.noLink)
		expect(() => r.key(3, 3, 1)).not.toThrow()
	})

	it("is registered as a page with settings and a key map", () => {
		expect(page.name).toBe("clips")
		expect(page.settings?.map((s) => s.key)).toEqual(["stagedLaunch"])
		expect(page.keymap!.length).toBeGreaterThan(8)
	})
})
