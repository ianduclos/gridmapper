import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { PlaySurfacePage, readPresets, SLEW_TIMES } from "../src/pages/play-surface.js"
import { PAGE_MODULES } from "../src/pages/registry.js"
import { SharedStore, SCALE_SURFACE } from "../src/core/sharedStore.js"
import { OscFloat, ledIndex, type PageContext } from "../src/core/types.js"
import { SurfaceMirror, levelLed, rowKey, rowVelocity } from "../src/util/playModel.js"
import { partsFor } from "../src/util/playSlots.js"

const SIZE = { width: 16, height: 8 }
const LANE_X0 = 4, ALL = 12, RIGHT = 15, CHOOSER = 2

const rig = () => {
	const out: Array<[string, ...any[]]> = []
	const max: Array<[string, ...any[]]> = []
	const persisted: any[] = []
	const modifiers = { held: new Set<number>(), shift1: false, shift2: false }
	const shared = new SharedStore()
	let hear: (path: string, args: any[]) => void = () => {}
	const ctx = {
		size: SIZE, modifiers, slot: 2, slotLabel: "c",
		clock: { running: false, rate: 20, tick: 0, lanes: [] },
		osc: { send: (path: string, ...a: any[]) => max.push([path, ...a]) },
		setDirty() {}, focus() {},
		setShift: (w: number, d: boolean) => { if (w === 1) modifiers.shift1 = d; else modifiers.shift2 = d },
		persist: (p: any) => persisted.push(structuredClone(p)),
		shared,
		surface: {
			port: 57133,
			send: (path: string, ...a: any[]) => out.push([path, ...a.map((v) => (v instanceof OscFloat ? Math.round(v.value * 1e4) / 1e4 : v))]),
			on: (fn: any) => { hear = fn; return () => { hear = () => {} } },
		},
	} as unknown as PageContext
	const page = new PlaySurfacePage()
	page.init(ctx)
	page.onFocus(ctx)
	const say = (path: string, ...args: any[]) => hear(path, args)
	/** A surface with lanes 1-6 MODAL, 7 a REEL in SLICES, 8 STRING; everything on the shared dial. */
	const world = () => {
		const eng = ["modal", "modal", "modal", "modal", "modal", "modal", "reel", "string"]
		eng.forEach((e, i) => say(`/surface/lane/${i + 1}/engine`, e))
		say("/surface/lane/7/reel/reelMode", "sampler")
		say("/surface/lane/7/reel/reelNotes", "slice")
		say("/surface/lane/7/reel/reelRoot", 60)
		say("/surface/modal/hardness/norm", 0.5)
		say("/surface/tremolo/tremoloRate/norm", 0.2)
		say("/surface/tremolo/tremoloDepth", 0.3)
		for (let n = 1; n <= 8; n++) say(`/surface/lane/${n}/owner/hardness`, "follow")
	}
	const key = (x: number, y: number, s: 0 | 1 = 1) => page.onKey({ x, y, s }, ctx)
	const tapKey = (x: number, y: number) => { key(x, y, 1); key(x, y, 0) }
	const layer = (n: number) => tapKey(CHOOSER, n)
	/** Messages to surface since the last call, without the polling. */
	const sent = () => out.splice(0).filter((m) => m[0] !== "/surface/get" && m[0] !== "/surface/subscribe")
	const led = (x: number, y: number) => page.render(ctx)![ledIndex(SIZE, x, y)]
	return { page, ctx, out, max, persisted, modifiers, shared, say, world, key, tapKey, layer, sent, led }
}

beforeEach(() => { vi.useFakeTimers(); vi.setSystemTime(1_000_000) })
afterEach(() => { vi.useRealTimers() })

describe("play model", () => {
	it("a strike is soft at the bottom and full at the top", () => {
		expect(rowVelocity(0)).toBeCloseTo(0.125)
		expect(rowVelocity(7)).toBe(1)
	})

	it("rows climb the scale from the root, lowest at the bottom; other tunings go by step", () => {
		const s = { npo: 12, root: 0, scale: "ionian", base: 24 }
		expect([0, 1, 2, 3, 4, 5, 6, 7].map((r) => rowKey(r, s))).toEqual([60, 62, 64, 65, 67, 69, 71, 72])
		expect(rowKey(1, { ...s, root: 2 })).toBe(64)
		expect([0, 1, 2].map((r) => rowKey(r, { ...s, npo: 19 }))).toEqual([60, 61, 62])
	})

	it("a lane's level fades between a floor and full", () => {
		expect(levelLed(-120)).toBe(3)
		expect(levelLed(0)).toBe(15)
		expect(levelLed(-30)).toBe(9)
	})

	it("reads a lane's own value on V and the shared dial's on F", () => {
		const m = new SurfaceMirror()
		const p = partsFor("modal", 0)[0]
		m.feed("/surface/modal/hardness/norm", [0.4], 1)
		m.feed("/surface/lane/2/modal/hardness/norm", [0.9], 1)
		expect(m.effective(1, p)).toBe(0.4)
		m.feed("/surface/lane/2/owner/hardness", ["voice"], 1)
		expect(m.effective(1, p)).toBe(0.9)
	})
})

describe("play-surface: keys", () => {
	it("registers, and opens on KEYS", () => {
		expect(PAGE_MODULES.get("play-surface")?.label).toBe("Play Surface")
		const r = rig()
		expect(r.led(CHOOSER, 0)).toBe(15)
		expect(r.max.some((m) => m[0] === "/grid/out/page/c/type" && m[1] === "play-surface")).toBe(true)
	})

	it("a press plays that lane at the row's pitch and holds it until release", () => {
		const r = rig(); r.world(); r.sent()
		r.key(LANE_X0 + 2, 7) // lane 3, bottom row
		expect(r.sent()).toEqual([["/surface/lane/3/note/on", 60, 0.8]])
		r.key(LANE_X0 + 2, 5) // two rows up: E
		expect(r.sent()).toEqual([["/surface/lane/3/note/on", 64, 0.8]])
		r.key(LANE_X0 + 2, 7, 0)
		expect(r.sent()).toEqual([["/surface/lane/3/note/off", 60]])
		r.key(ALL, 7) // no all column on KEYS
		expect(r.sent()).toEqual([])
	})

	it("follows the scale iso-surface publishes", () => {
		const r = rig(); r.world(); r.sent()
		r.shared.set(SCALE_SURFACE, { npo: 12, root: 2, scale: "dorian" })
		r.key(LANE_X0, 6)
		expect(r.sent()[0]).toEqual(["/surface/lane/1/note/on", 64, 0.8]) // D dorian's second note
	})

	it("a lane that keeps its own note has it moved first, so the row sets it", () => {
		const r = rig(); r.world()
		r.say("/surface/lane/1/owner/voiceNote", "voice"); r.sent()
		r.key(LANE_X0, 6)
		expect(r.sent()).toEqual([["/surface/lane/1/modal/voiceNote", 62], ["/surface/lane/1/note/on", 62, 0.8]])
	})

	it("a REEL lane in SLICES takes the row as its pad, 1 at the bottom, PITCH or not", () => {
		const r = rig(); r.world(); r.sent()
		r.key(LANE_X0 + 6, 7)
		r.key(LANE_X0 + 6, 5)
		expect(r.sent()).toEqual([["/surface/lane/7/note/on", 60, 0.8], ["/surface/lane/7/note/on", 62, 0.8]])
		r.tapKey(RIGHT, 4) // PITCH off
		r.key(LANE_X0 + 6, 4); expect(r.sent()).toContainEqual(["/surface/lane/7/note/on", 63, 0.8])
	})

	it("PITCH unlit: a press strikes the lane's own note, soft at the bottom", () => {
		const r = rig(); r.world()
		r.say("/surface/state/lane/2/pitch", 330); r.sent()
		expect(r.led(RIGHT, 4)).toBe(12)
		r.tapKey(RIGHT, 4)
		expect(r.led(RIGHT, 4)).toBe(3)
		r.key(LANE_X0 + 1, 7); r.key(LANE_X0 + 1, 0)
		r.key(LANE_X0, 0)
		expect(r.sent()).toEqual([
			["/surface/lane/2/strike/own", 0.125],
			["/surface/lane/2/strike/own", 1],
			["/surface/lane/1/strike/own", 1],
		])
	})

	it("the cell last played stays lit and fades with the lane's level", () => {
		const r = rig(); r.world()
		r.tapKey(LANE_X0, 4)
		r.say("/surface/state/lane/1/level", 0)
		expect(r.led(LANE_X0, 4)).toBe(15)
		r.say("/surface/state/lane/1/level", -40)
		const mid = r.led(LANE_X0, 4)
		expect(mid).toBeLessThan(15)
		r.say("/surface/state/lane/1/level", -120)
		expect(r.led(LANE_X0, 4)).toBeLessThan(mid)
		expect(r.led(LANE_X0, 4)).toBeGreaterThan(r.led(LANE_X0, 3))
	})
})

describe("play-surface: latch", () => {
	it("a played note stays held; its cell again ends it; unlighting LATCH ends them all", () => {
		const r = rig(); r.world(); r.sent()
		r.tapKey(RIGHT, 7)
		expect(r.led(RIGHT, 7)).toBe(12)
		r.tapKey(LANE_X0, 7)
		r.tapKey(LANE_X0 + 1, 6)
		expect(r.sent()).toEqual([["/surface/lane/1/note/on", 60, 0.8], ["/surface/lane/2/note/on", 62, 0.8]])
		expect(r.led(LANE_X0, 7)).toBe(12)
		r.tapKey(LANE_X0, 7) // the same cell: subtract it, no new note
		expect(r.sent()).toEqual([["/surface/lane/1/note/off", 60]])
		r.tapKey(LANE_X0 + 6, 7) // a pad latches too
		r.sent()
		r.page.onBlur(r.ctx) // a page switch does not drop them
		expect(r.sent()).toEqual([])
		r.page.onFocus(r.ctx)
		r.tapKey(RIGHT, 7)
		expect(r.sent().map((x) => x[0]).sort()).toEqual(["/surface/lane/2/note/off", "/surface/lane/7/note/off"])
		r.tapKey(LANE_X0, 7) // unlit: momentary again
		expect(r.sent().map((x) => x[0])).toEqual(["/surface/lane/1/note/on", "/surface/lane/1/note/off"])
	})

	it("a loop records a latched note as a held one", () => {
		const r = rig(); r.world()
		r.tapKey(RIGHT, 7)
		r.tapKey(RIGHT, 0) // arm
		r.tapKey(LANE_X0, 7); vi.advanceTimersByTime(400)
		r.tapKey(LANE_X0, 7); vi.advanceTimersByTime(200)
		r.tapKey(RIGHT, 0) // plays
		r.sent()
		vi.advanceTimersByTime(300)
		expect(r.sent()).toEqual([["/surface/lane/1/note/on", 60, 0.8]])
		vi.advanceTimersByTime(200)
		expect(r.sent()).toEqual([["/surface/lane/1/note/off", 60]])
	})
})

describe("play-surface: the chooser and SLEW", () => {
	it("the six layer keys are gone: dark, and a press changes nothing", () => {
		const r = rig(); r.world(); r.sent()
		for (let y = 1; y <= 6; y++) {
			expect(r.led(CHOOSER, y)).toBe(0)
			r.tapKey(CHOOSER, y)
		}
		expect(r.led(CHOOSER, 0)).toBe(15) // still KEYS
		r.tapKey(LANE_X0, 7)
		expect(r.sent()).toEqual([["/surface/lane/1/note/on", 60, 0.8], ["/surface/lane/1/note/off", 60]])
		r.layer(7)
		expect(r.led(CHOOSER, 7)).toBe(15)
		expect(r.led(ALL, 3)).toBe(2)
	})

	it("SLEW: hold it and the all column offers eight times; choosing one moves nothing", () => {
		const r = rig(); r.world(); r.layer(7); r.sent()
		r.key(RIGHT, 6)
		expect(r.led(ALL, 7)).toBe(15) // 0 s, at the bottom
		r.tapKey(ALL, 2) // 2 s
		r.key(RIGHT, 6, 0)
		expect(SLEW_TIMES[5]).toBe(2)
		expect(r.sent()).toEqual([])
		expect(r.led(RIGHT, 6)).toBe(12)
	})
})

describe("play-surface: presets", () => {
	const store = (r: ReturnType<typeof rig>, lane: number, y: number) => {
		r.key(0, 7); r.tapKey(LANE_X0 + lane, y); r.key(0, 7, 0)
		vi.advanceTimersByTime(200) // it asks surface first
	}
	/** Lane 1 (MODAL): row 0 = hardness full and decay pulled away; row 1 = hardness at zero only. */
	const two = () => {
		const r = rig(); r.world()
		r.say("/surface/lane/1/owner/hardness", "voice") // made on screen or on the Twister
		r.say("/surface/lane/1/modal/hardness/norm", 1)
		r.say("/surface/lane/1/owner/decay", "voice")
		r.say("/surface/lane/1/modal/decay/norm", 0.25)
		r.say("/surface/lane/1/modal/coupling/norm", 0.9) // its own value, but still on the shared dial
		r.layer(7)
		store(r, 0, 0)
		r.say("/surface/lane/1/owner/decay", "follow")
		r.say("/surface/lane/1/modal/hardness/norm", 0)
		r.out.length = 0
		store(r, 0, 1)
		expect(r.out).toContainEqual(["/surface/get", "/surface/lane/1/modal/*/norm"])
		expect(r.out).toContainEqual(["/surface/get", "/surface/lane/*/owner/rattleTone"])
		expect(r.out).toContainEqual(["/surface/get", "/surface/modal/rattleTone/norm"])
		r.sent()
		return r
	}

	it("shift 1 then a cell stores every dial the lane has pulled away, and nothing else", () => {
		const r = two()
		expect(r.persisted).toHaveLength(2)
		const bank = r.persisted[1].presets[""].modal
		expect(bank[0]).toEqual({ "modal/hardness/norm": 1, "modal/decay/norm": 0.25, trem: 0 })
		expect(bank[1]).toEqual({ "modal/hardness/norm": 0, trem: 0 })
		expect(r.led(LANE_X0, 0)).toBe(5)
		expect(r.led(LANE_X0, 1)).toBe(15) // the lane's current one
		expect(r.led(LANE_X0, 2)).toBe(1)
		expect(r.led(LANE_X0 + 1, 0)).toBe(5) // lane 2 is MODAL too: same rows
		expect(r.led(LANE_X0 + 7, 0)).toBe(1) // STRING has its own
	})

	it("a press recalls: stored dials to their values, every other dial back to the shared one", () => {
		const r = two()
		r.say("/surface/lane/2/owner/position", "voice") // lane 2 had wandered off elsewhere
		r.tapKey(LANE_X0 + 1, 0) // lane 2 takes MODAL's row 0
		const m = r.sent()
		expect(m).toContainEqual(["/surface/lane/2/owner/hardness", "voice"])
		expect(m).toContainEqual(["/surface/lane/2/modal/hardness/norm", 1])
		expect(m).toContainEqual(["/surface/lane/2/modal/decay/norm", 0.25])
		expect(m).toContainEqual(["/surface/lane/2/owner/position", "follow"])
		expect(m).not.toContainEqual(["/surface/lane/2/owner/hardness", "follow"])
		expect(m.some((x) => x[0].includes("strike"))).toBe(false)
		expect(r.led(LANE_X0 + 1, 0)).toBe(15)
		r.tapKey(RIGHT, 5) // STRIKE
		r.tapKey(LANE_X0, 0)
		expect(r.sent()).toContainEqual(["/surface/lane/1/strike/own", 0.8])
	})

	it("the bottom row is home: the lane's dials all back to the shared ones", () => {
		const r = two()
		expect(r.led(LANE_X0, 7)).toBe(5)
		r.tapKey(LANE_X0, 7)
		const m = r.sent()
		expect(m).toContainEqual(["/surface/lane/1/owner/hardness", "follow"])
		expect(m.every((x) => x[1] === "follow")).toBe(true)
		expect(m.length).toBe(20) // MODAL's 19 dials and the tremolo's two, less decay, already known to be home
		expect(r.led(LANE_X0, 7)).toBe(15)
		r.tapKey(LANE_X0, 7) // already home: nothing more to say
		expect(r.sent()).toEqual([])
		r.tapKey(ALL, 7) // everyone home: a flat line along the bottom
		for (let l = 0; l < 8; l++) expect(r.led(LANE_X0 + l, 7)).toBe(15)
		store(r, 0, 7) // home holds nothing to store
		expect(r.persisted).toHaveLength(2)
	})

	it("all on a row sends every lane to its own engine's row; shift 1 then all strikes them too", () => {
		const r = two()
		r.tapKey(ALL, 0)
		let m = r.sent()
		expect(m.filter((x) => x[0].endsWith("/modal/hardness/norm") && x[1] === 1)).toHaveLength(6)
		expect(m.some((x) => x[0].includes("strike"))).toBe(false)
		for (let l = 0; l < 6; l++) expect(r.led(LANE_X0 + l, 0)).toBe(15) // a flat line
		r.key(0, 7); r.tapKey(ALL, 1); r.key(0, 7, 0)
		m = r.sent()
		expect(m.filter((x) => x[0].endsWith("/strike/own"))).toHaveLength(8)
	})

	it("with SLEW on, a recall asks surface first and then travels", () => {
		const r = two()
		r.key(RIGHT, 6); r.tapKey(ALL, 3); r.key(RIGHT, 6, 0) // 1 s
		r.out.length = 0
		r.tapKey(LANE_X0 + 1, 0)
		expect(r.sent()).toEqual([])
		vi.advanceTimersByTime(700)
		const hard = r.sent().filter((x) => x[0] === "/surface/lane/2/modal/hardness/norm").map((x) => x[1])
		expect(hard[0]).toBe(0.5) // starts where the shared dial is
		expect(hard.at(-1)).toBeGreaterThan(0.6)
		expect(hard.at(-1)).toBeLessThan(1)
		vi.advanceTimersByTime(800)
		expect(r.sent().filter((x) => x[0] === "/surface/lane/2/modal/hardness/norm").at(-1)![1]).toBe(1)
	})

	it("with SLEW on, the way home travels too: the dial glides to the shared one, then hands itself back", () => {
		const r = two()
		r.tapKey(LANE_X0, 0) // hardness full, decay pulled away
		r.say("/surface/modal/decay/norm", 0.75)
		r.key(RIGHT, 6); r.tapKey(ALL, 3); r.key(RIGHT, 6, 0) // 1 s
		r.sent()
		r.tapKey(LANE_X0, 7) // home
		vi.advanceTimersByTime(600)
		let m = r.sent()
		expect(m).not.toContainEqual(["/surface/lane/1/owner/hardness", "follow"]) // not yet
		const hard = m.filter((x) => x[0] === "/surface/lane/1/modal/hardness/norm").map((x) => x[1])
		expect(hard.at(-1)).toBeLessThan(1)
		expect(hard.at(-1)).toBeGreaterThan(0.5)
		vi.advanceTimersByTime(800)
		m = r.sent()
		expect(m).toContainEqual(["/surface/lane/1/modal/hardness/norm", 0.5]) // where the shared dial stands
		expect(m).toContainEqual(["/surface/lane/1/modal/decay/norm", 0.75])
		expect(m).toContainEqual(["/surface/lane/1/owner/hardness", "follow"])
		expect(m).toContainEqual(["/surface/lane/1/owner/decay", "follow"])
	})

	it("keeps presets per surface patch", () => {
		const r = two()
		r.say("/surface/state/preset", "bells-low", 0)
		expect(r.led(LANE_X0, 0)).toBe(1)
		r.say("/surface/state/preset", "", 0)
		expect(r.led(LANE_X0, 0)).toBe(5)
	})

	it("comes back from a preset file, and a bad file cannot break it", () => {
		const r = two()
		const saved = JSON.parse(JSON.stringify(r.page.serialize()))
		const b = rig(); b.world()
		b.page.restore(saved, b.ctx)
		b.layer(7)
		expect(b.led(LANE_X0, 1)).toBe(5)
		expect(b.sent()).toEqual([]) // restoring never makes a sound
		expect(readPresets({ x: { modal: [{ "modal/rattleTone/norm": 7, "tremolo/tremoloDepth": 0.4, "evil/path": 1 }, 3, null] }, y: 4 } as any)).toEqual({
			x: { modal: [{ "modal/rattleTone/norm": 1, "tremolo/tremoloDepth": 0.4 }, null, null, null, null, null, null, null] },
		})
		const c = rig()
		expect(() => c.page.restore({ presets: 3, patterns: [{ events: [{ atMs: 1, ctl: { id: "nope/1" } }, 5] }], slew: "9", velocity: "x" }, c.ctx)).not.toThrow()
	})
})

describe("play-surface: shift 2 and loopers", () => {
	it("shift 2 held: the lanes' bottom three rows are BOW, FREEZE and DAMP, and all does all eight", () => {
		const r = rig(); r.world(); r.sent()
		r.key(0, 6)
		r.tapKey(LANE_X0 + 1, 5)
		expect(r.sent()).toEqual([["/surface/lane/2/arm", 1]])
		expect(r.led(LANE_X0 + 1, 5)).toBe(12)
		r.tapKey(LANE_X0 + 1, 6)
		expect(r.sent()).toEqual([["/surface/lane/2/freeze", 1]])
		r.key(LANE_X0 + 2, 7)
		expect(r.sent()).toEqual([["/surface/lane/3/damp", 1]])
		r.key(LANE_X0 + 2, 7, 0)
		expect(r.sent()).toEqual([["/surface/lane/3/damp", 0]])
		r.tapKey(ALL, 5)
		expect(r.sent().map((x) => x[0])).toEqual([1, 3, 4, 5, 6, 7, 8].map((n) => `/surface/lane/${n}/arm`))
		r.tapKey(ALL, 5)
		expect(r.sent().filter((x) => x[1] === 0)).toHaveLength(8)
		r.key(0, 6, 0)
		r.key(LANE_X0, 7) // closed again: a note
		expect(r.sent()[0][0]).toBe("/surface/lane/1/note/on")
	})

	it("held about a second with nothing pressed it stays open; a tap closes it", () => {
		const r = rig(); r.world()
		r.key(0, 6); vi.advanceTimersByTime(300); r.key(0, 6, 0)
		r.sent()
		r.tapKey(LANE_X0, 6)
		expect(r.sent().map((x) => x[0])).toEqual(["/surface/lane/1/note/on", "/surface/lane/1/note/off"])
		r.key(0, 6); vi.advanceTimersByTime(1100); r.key(0, 6, 0)
		r.sent()
		r.tapKey(LANE_X0, 6)
		expect(r.sent()).toEqual([["/surface/lane/1/freeze", 1]])
		r.tapKey(0, 6)
		r.tapKey(LANE_X0, 6)
		expect(r.sent().map((x) => x[0])).toEqual(["/surface/lane/1/note/on", "/surface/lane/1/note/off"])
		// Used while held: it does not stay open.
		r.key(0, 6); r.tapKey(LANE_X0, 5); vi.advanceTimersByTime(1500); r.key(0, 6, 0)
		r.sent()
		r.key(LANE_X0, 5)
		expect(r.sent()[0][0]).toBe("/surface/lane/1/note/on")
	})

	it("a loop catches notes and recalls, and plays them whatever the chooser shows", () => {
		const r = rig(); r.world(); r.sent()
		r.tapKey(RIGHT, 0) // arm
		expect(r.led(RIGHT, 0)).toBeGreaterThan(0)
		r.key(LANE_X0, 7); vi.advanceTimersByTime(200); r.key(LANE_X0, 7, 0)
		vi.advanceTimersByTime(100)
		r.layer(7)
		r.tapKey(LANE_X0 + 1, 7) // lane 2 home
		vi.advanceTimersByTime(200)
		r.tapKey(RIGHT, 0) // close: plays
		expect(r.led(RIGHT, 0)).toBe(15)
		r.layer(0) // a chooser change is not recorded, and does not move what plays
		r.say("/surface/lane/2/owner/decay", "voice") // someone pulled it away meanwhile
		r.sent()
		vi.advanceTimersByTime(520) // one more turn of the loop
		const m = r.sent()
		expect(m).toContainEqual(["/surface/lane/1/note/on", 60, 0.8])
		expect(m).toContainEqual(["/surface/lane/1/note/off", 60])
		expect(m).toContainEqual(["/surface/lane/2/owner/decay", "follow"])
		r.tapKey(RIGHT, 0) // pause
		r.sent()
		vi.advanceTimersByTime(1200)
		expect(r.sent()).toEqual([])
		r.key(0, 7); r.tapKey(RIGHT, 0); r.key(0, 7, 0) // shift 1 + looper clears
		expect(r.led(RIGHT, 0)).toBe(1)
	})

	it("a loop keeps playing when the page loses focus, and lets go when it is cleared", () => {
		const r = rig(); r.world(); r.sent()
		r.tapKey(RIGHT, 1)
		r.key(LANE_X0, 7); vi.advanceTimersByTime(300); r.key(LANE_X0, 7, 0)
		vi.advanceTimersByTime(300)
		r.tapKey(RIGHT, 1)
		r.page.onBlur(r.ctx)
		r.sent()
		vi.advanceTimersByTime(700)
		expect(r.sent().some((x) => x[0] === "/surface/lane/1/note/on")).toBe(true)
		r.page.dispose(r.ctx)
		r.sent()
		vi.advanceTimersByTime(2000)
		expect(r.sent()).toEqual([])
	})
})

describe("play-surface: reading surface", () => {
	it("subscribes for levels and the patch name, and asks nothing off the page", () => {
		const r = rig()
		vi.advanceTimersByTime(20)
		expect(r.out).toContainEqual(["/surface/subscribe", "127.0.0.1", 57133, "lanes"])
		expect(r.out).toContainEqual(["/surface/subscribe", "127.0.0.1", 57133, "preset"])
		expect(r.out).toContainEqual(["/surface/get", "/surface/lane/*/engine"])
		r.world(); r.out.length = 0
		vi.advanceTimersByTime(2100)
		expect(r.out.some((m) => m[0] === "/surface/get" && /hardness/.test(m[1]))).toBe(false) // no dial is polled
		r.page.onBlur(r.ctx); r.out.length = 0
		vi.advanceTimersByTime(5000)
		expect(r.out).toEqual([]) // asks nothing while you are on another page
	})
})
