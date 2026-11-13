import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { IsoSurfacePage, recKey, recRaw, recTrack } from "../src/pages/iso-surface.js"
import { SharedStore } from "../src/core/sharedStore.js"
import { OscFloat, ledIndex, type PageContext } from "../src/core/types.js"

// The iso page as four track layers on the app's arp (idk.surface
// docs/specs/2026-11-13-iso-track-layers-design.md). The app is a fake: `app` is what the
// page sent it over ctx.surface, `say` is what it answers.

const SIZE = { width: 16, height: 8 }
// Home (step 0) is x1 y7; a column right is +1 step, a row up +5.
const TRACKS = 14, RIGHT = 15, CHORDS = 13
const LATCH = [RIGHT, 4] as const, PEDAL = [RIGHT, 5] as const

const rig = () => {
	const app: Array<[string, ...any[]]> = []
	const max: Array<[string, ...any[]]> = []
	const modifiers = { held: new Set<number>(), shift1: false, shift2: false }
	let hear: (path: string, args: any[]) => void = () => {}
	const ctx = {
		size: SIZE, modifiers, slot: 0, slotLabel: "a", shared: new SharedStore(),
		clock: { running: false, rate: 20, tick: 0, lanes: [{ div: 1 }, { div: 1 }, { div: 1 }, { div: 1 }] },
		osc: { send: (path: string, ...a: any[]) => max.push([path, ...a]) },
		surface: {
			port: 57133,
			send: (path: string, ...a: any[]) => app.push([path, ...a.map((v) => (v instanceof OscFloat ? v.value : v))]),
			on: (fn: any) => ((hear = fn), () => {}),
		},
		setDirty() {}, focus() {}, persist() {},
		setShift: (w: number, d: boolean) => { if (w === 1) modifiers.shift1 = d; else modifiers.shift2 = d },
	} as unknown as PageContext
	const page = new IsoSurfacePage(() => 0)
	page.init(ctx)
	app.length = 0; max.length = 0
	const key = (x: number, y: number, s: 0 | 1 = 1) => page.onKey({ x, y, s }, ctx)
	const tap = (x: number, y: number) => { key(x, y, 1); key(x, y, 0) }
	const led = (x: number, y: number) => page.render(ctx)![ledIndex(SIZE, x, y)]
	/** Note messages to the app since the last call, without their address. */
	const notes = () => {
		const n = max.filter((m) => m[0].endsWith("/note")).map((m) => m.slice(1))
		max.length = 0
		return n
	}
	/** What the page wrote to the app since the last call: no reads, no subscriptions. */
	const sent = () => app.splice(0).filter((m) => m[0] !== "/surface/get" && m[0] !== "/surface/subscribe")
	const say = (path: string, ...args: any[]) => hear(path, args)
	const track = (n: number) => tap(TRACKS, n - 1)
	/** The app's echo of what a key track holds: /remote <step> <1|0> <track 0-3>. */
	const holds = (step: number, on: 0 | 1, t = 0) => page.onOsc!("/remote", [step, on, t], ctx)
	return { page, ctx, app, max, modifiers, key, tap, led, notes, sent, say, track, holds }
}

beforeEach(() => { vi.useFakeTimers(); vi.setSystemTime(4_000_000) })
afterEach(() => { vi.useRealTimers() })

describe("iso-surface layers: one track in front", () => {
	it("a press goes to the track in front, and a held note keeps the track it began on", () => {
		const r = rig()
		r.key(3, 7) // step 2
		expect(r.notes()).toEqual([[2, 1, 0]])
		r.track(2)
		r.key(4, 7)
		expect(r.notes()).toEqual([[3, 1, 1]])
		r.key(3, 7, 0); r.key(4, 7, 0)
		expect(r.notes()).toEqual([[2, 0, 0], [3, 0, 1]])
	})

	it("shift 2 + a track key selects nothing more: there is always exactly one in front", () => {
		const r = rig()
		r.modifiers.shift2 = true
		r.track(3)
		r.modifiers.shift2 = false
		const tracks = r.max.filter((m) => m[0].endsWith("/tracks")).map((m) => JSON.parse(m[1]))
		expect(tracks.at(-1)).toEqual({ selected: [2], front: 2 })
		expect(r.led(TRACKS, 2)).toBe(11)
		expect(r.led(TRACKS, 0)).toBe(1)
		r.key(3, 7)
		expect(r.notes()).toEqual([[2, 1, 2]])
	})

	it("shift 1 + a track key edits no routes: the looper keys stay loopers", () => {
		const r = rig()
		r.modifiers.shift1 = true
		r.track(2)
		r.modifiers.shift1 = false
		r.tap(RIGHT, 0) // arms looper 1 rather than routing it
		expect((r.page as any).recorders[0].state).toBe("recording")
		r.page.dispose(r.ctx)
	})

	it("the front track's notes are bright; another track's are on the dim plane, lifted on a root", () => {
		const r = rig()
		r.page.onOsc!("/remote", [2, 1, 0], r.ctx) // track 1, in front
		r.page.onOsc!("/remote", [4, 1, 1], r.ctx) // track 2: x5 y7, an in-scale cell
		r.page.onOsc!("/remote", [12, 1, 1], r.ctx) // track 2 on a root: x8 y6 (7 + 5)
		expect(r.led(3, 7)).toBe(12)
		expect(r.led(5, 7)).toBe(6)
		expect(r.led(8, 6)).toBe(10)
		r.track(2) // the planes swap
		expect(r.led(3, 7)).toBe(6)
		expect(r.led(5, 7)).toBe(12)
	})

	it("a key under a finger is at full, and a low key transposed below zero keeps its track", () => {
		const r = rig()
		r.track(2)
		r.tap(0, 7) // the transposer on the bottom row
		r.tap(1, 7) // -7
		r.tap(0, 7)
		r.key(1, 7) // home, 7 steps down
		expect(r.notes()).toEqual([[-7, 1, 1]])
		expect(r.led(1, 7)).toBe(15)
		r.key(1, 7, 0)
		expect(r.notes()).toEqual([[-7, 0, 1]])
	})
})

describe("iso-surface layers: ARP and LATCH are the app's", () => {
	it("no sustain of its own: a release is sent even with LATCH lit, and the note stays lit for as long as the app says it holds it", () => {
		const r = rig()
		r.tap(...LATCH)
		expect(r.sent()).toEqual([["/surface/keys/1/latch", 1]])
		expect(r.led(...LATCH)).toBe(15)
		r.key(3, 7); r.holds(2, 1) // the app echoes the press
		r.key(3, 7, 0)
		expect(r.notes()).toEqual([[2, 1, 0], [2, 0, 0]])
		expect(r.led(3, 7)).toBe(12) // LATCH keeps it: the app has not said off
		r.tap(...LATCH)
		expect(r.sent()).toEqual([["/surface/keys/1/latch", 0]])
		expect(r.led(3, 7)).toBe(12) // the page guesses nothing: it waits for the app
		r.holds(2, 0)
		expect(r.led(3, 7)).toBe(3)
		expect(r.notes()).toEqual([]) // letting go is the app's doing
	})

	it("without the app's echo a released key is simply dark: the page keeps no picture of its own", () => {
		const r = rig()
		r.say("/surface/keys/1/latch", 1)
		r.tap(3, 7)
		expect(r.led(3, 7)).toBe(3)
	})

	it("LATCH is per track and lit from the app, whoever switched it", () => {
		const r = rig()
		r.say("/surface/keys/2/latch", 1)
		expect(r.led(...LATCH)).toBe(1)
		r.track(2)
		expect(r.led(...LATCH)).toBe(15)
		r.tap(...LATCH) // lit: the press puts it out, on track 2
		expect(r.sent()).toEqual([["/surface/keys/2/latch", 0]])
		r.track(1)
		r.say("/surface/arp/latch", 1) // track 1 under its older name
		expect(r.led(...LATCH)).toBe(15)
		r.say("/surface/keys/1/latch", 0)
		expect(r.led(...LATCH)).toBe(1)
	})

	it("what another track holds is on the dim plane, and comes to the front with its track", () => {
		const r = rig()
		r.holds(2, 1, 0); r.holds(4, 1, 1)
		expect(r.led(3, 7)).toBe(12)
		expect(r.led(5, 7)).toBe(6)
		r.track(2)
		expect(r.led(3, 7)).toBe(6)
		expect(r.led(5, 7)).toBe(12)
	})

	it("the step the front track's arp is sounding is the brightest; its chord and the finger step down under it", () => {
		const r = rig()
		r.say("/surface/keys/1/arp", 1)
		r.key(3, 7); r.holds(2, 1); r.holds(4, 1)
		expect(r.led(3, 7)).toBe(12) // under a finger, ARP on
		expect(r.led(5, 7)).toBe(9) // in the chord
		r.say("/surface/keys/1/arp/at", 4)
		expect(r.led(5, 7)).toBe(15)
		r.say("/surface/keys/1/arp/at", -1)
		expect(r.led(5, 7)).toBe(9)
		r.say("/surface/keys/2/arp/at", 4) // another track's step lights nothing here
		expect(r.led(5, 7)).toBe(9)
		r.say("/surface/keys/1/arp", 0)
		r.say("/surface/keys/1/arp/at", 4) // ARP off: no step shown
		expect(r.led(5, 7)).toBe(12)
	})

	it("the pedal is a momentary LATCH on the front track; a double tap keeps it until the next press", () => {
		const r = rig()
		r.key(...PEDAL)
		expect(r.sent()).toEqual([["/surface/keys/1/latch", 1]])
		expect(r.led(...PEDAL)).toBe(15)
		vi.advanceTimersByTime(500)
		r.key(...PEDAL, 0)
		expect(r.sent()).toEqual([["/surface/keys/1/latch", 0]])
		vi.advanceTimersByTime(1000)
		r.key(...PEDAL); vi.advanceTimersByTime(80); r.key(...PEDAL, 0)
		vi.advanceTimersByTime(80)
		r.key(...PEDAL); vi.advanceTimersByTime(80); r.key(...PEDAL, 0) // the second tap: kept
		expect(r.sent().at(-1)).toEqual(["/surface/keys/1/latch", 1])
		expect(r.led(...LATCH)).toBe(15)
		vi.advanceTimersByTime(500)
		r.key(...PEDAL)
		expect(r.sent()).toEqual([["/surface/keys/1/latch", 0]])
	})

	it("an answer to a read sent just before a write does not undo it: the pedal still puts its LATCH out", () => {
		const r = rig()
		r.key(...PEDAL); r.sent()
		r.say("/surface/keys/1/latch", 0) // stale: asked before the press
		expect(r.led(...LATCH)).toBe(15)
		vi.advanceTimersByTime(600)
		r.key(...PEDAL, 0)
		expect(r.sent()).toEqual([["/surface/keys/1/latch", 0]])
		// Later, the app's word counts again: LATCH put out in the app frees a kept pedal.
		vi.advanceTimersByTime(1000)
		r.key(...PEDAL); vi.advanceTimersByTime(80); r.key(...PEDAL, 0); vi.advanceTimersByTime(80)
		r.key(...PEDAL); vi.advanceTimersByTime(80); r.key(...PEDAL, 0); r.sent()
		vi.advanceTimersByTime(600)
		r.say("/surface/keys/1/latch", 0)
		expect(r.led(...PEDAL)).toBe(1)
		r.key(...PEDAL) // a fresh press, not the release of a kept one
		expect(r.sent()).toEqual([["/surface/keys/1/latch", 1]])
	})

	it("the pedal leaves a LATCH lit by the LATCH key alone", () => {
		const r = rig()
		r.tap(...LATCH); r.sent()
		r.key(...PEDAL); vi.advanceTimersByTime(300); r.key(...PEDAL, 0)
		expect(r.sent()).toEqual([])
		expect(r.led(...LATCH)).toBe(15)
	})

	it("an arp key sets the app's order and switches the front track's ARP on; the lit one switches it off", () => {
		const r = rig()
		r.tap(TRACKS, 4)
		expect(r.sent()).toEqual([["/surface/arp/order", "up"], ["/surface/arp/prob-mode", "wait"], ["/surface/keys/1/arp", 1]])
		expect(r.led(TRACKS, 4)).toBe(14)
		r.tap(TRACKS, 6) // another order: ARP stays on
		expect(r.sent()).toEqual([["/surface/arp/order", "up-down"], ["/surface/arp/prob-mode", "wait"], ["/surface/keys/1/arp", 1]])
		r.tap(TRACKS, 6)
		expect(r.sent()).toEqual([["/surface/keys/1/arp", 0]])
		expect(r.led(TRACKS, 6)).toBe(7) // the app's order, ARP off here
		r.track(3)
		r.tap(TRACKS, 7)
		expect(r.sent()).toEqual([["/surface/arp/order", "urn"], ["/surface/arp/prob-mode", "wait"], ["/surface/keys/3/arp", 1]])
	})

	it("the arp keys show the app: its order, and whether the track in front has ARP on", () => {
		const r = rig()
		expect([4, 5, 6, 7].map((y) => r.led(TRACKS, y))).toEqual([1, 2, 3, 4])
		r.say("/surface/arp/order", "down")
		expect(r.led(TRACKS, 5)).toBe(7)
		r.say("/surface/keys/2/arp", 1)
		expect(r.led(TRACKS, 5)).toBe(7)
		r.track(2)
		expect(r.led(TRACKS, 5)).toBe(14)
		r.track(1)
		r.say("/surface/arp", 1) // track 1 under its older name
		expect(r.led(TRACKS, 5)).toBe(14)
		r.say("/surface/arp/order", "as-played") // an order the grid has no key for
		expect([4, 5, 6, 7].map((y) => r.led(TRACKS, y))).toEqual([1, 2, 3, 4])
	})

	it("with ARP on the page still sends plain presses and releases: it runs no arp of its own", () => {
		const r = rig()
		r.tap(TRACKS, 4)
		r.key(3, 7); r.key(4, 7)
		vi.advanceTimersByTime(2000)
		r.key(3, 7, 0); r.key(4, 7, 0)
		expect(r.notes()).toEqual([[2, 1, 0], [3, 1, 0], [2, 0, 0], [3, 0, 0]])
	})

	it("the panel's SPEED is the app's RATE, fastest at the top; PROB is the app's, with PROB MODE on wait", () => {
		const r = rig()
		r.tap(0, 6) // the panel
		r.tap(2, 0); r.tap(2, 1); r.tap(2, 6)
		expect(r.sent()).toEqual([["/surface/arp/rate", "1/16"], ["/surface/arp/rate", "1/16T"], ["/surface/arp/rate", "1/1"]])
		vi.advanceTimersByTime(500)
		r.say("/surface/arp/rate", "1/8T")
		expect([0, 1, 2, 3, 4, 5, 6].map((y) => r.led(2, y))).toEqual([4, 4, 4, 15, 4, 4, 4])
		r.tap(3, 4)
		expect(r.sent()).toEqual([["/surface/arp/prob", 0.5], ["/surface/arp/prob-mode", "wait"]])
		vi.advanceTimersByTime(500)
		r.say("/surface/arp/prob", 0.25)
		expect(r.led(3, 6)).toBe(15)
		expect(r.led(3, 4)).toBe(4)
	})

	it("reads the app while it is in front, and again when the link comes up", () => {
		const r = rig()
		r.page.onFocus(r.ctx); r.app.length = 0
		r.led(0, 0)
		expect(r.app).toContainEqual(["/surface/subscribe", "127.0.0.1", 57133, "values"])
		for (const a of ["/surface/keys/1/arp", "/surface/keys/4/latch", "/surface/arp/order", "/surface/arp/rate", "/surface/arp/prob"])
			expect(r.app).toContainEqual(["/surface/get", a])
		r.app.length = 0
		r.led(0, 0)
		expect(r.app).toEqual([]) // not every frame
		vi.advanceTimersByTime(2100)
		r.led(0, 0)
		expect(r.app).toContainEqual(["/surface/get", "/surface/keys/2/arp"])
		// The app came back: it holds nothing, so what it had lit here goes.
		r.holds(2, 1)
		expect(r.led(3, 7)).toBe(12)
		r.say("/link/up")
		expect(r.led(3, 7)).toBe(3)
	})
})

describe("iso-surface layers: octave and tint per track, transposer global", () => {
	it("each track keeps its own octave; the panel shows and sets the front track's", () => {
		const r = rig()
		r.tap(0, 6) // the panel
		r.tap(4, 5) // octave +1, track 1
		r.key(8, 7) // step 7
		r.track(2)
		r.key(9, 7) // step 8, track 2 at octave 0
		expect(r.notes()).toEqual([[19, 1, 0], [8, 1, 1]])
		expect(r.led(4, 6)).toBe(15) // track 2: octave 0 is current
		r.track(1)
		expect(r.led(4, 5)).toBe(15)
	})

	it("the transposer moves every track", () => {
		const r = rig()
		r.tap(0, 7); r.tap(10, 7); r.tap(0, 7) // +2
		r.key(3, 7)
		r.track(2)
		r.key(4, 7)
		expect(r.notes()).toEqual([[4, 1, 0], [5, 1, 1]])
	})

	it("tint is per track: its switch and its triad", () => {
		const r = rig()
		r.tap(0, 6)
		r.key(1, 0) // hold TINT ...
		r.tap(8, 7) // ... and put step 7's pitch class in track 1's triad
		r.key(1, 0, 0)
		r.tap(1, 0) // tint on, track 1
		r.key(5, 7) // step 4: its T-voice is 7
		expect(r.notes()).toEqual([[4, 1, 0], [7, 1, 0]])
		r.key(5, 7, 0); r.notes()
		r.track(2)
		r.key(5, 7) // track 2 has no tint
		expect(r.notes()).toEqual([[4, 1, 1]])
		expect(r.led(1, 0)).toBe(4) // and the panel says so
	})
})

describe("iso-surface layers: loops record the track in front", () => {
	it("stores a press as one number, track and step, and reads an old bare step as track 1", () => {
		expect(recTrack(recKey(2, -7))).toBe(2)
		expect(recRaw(recKey(2, -7))).toBe(-7)
		expect(recTrack(40)).toBe(0)
		expect(recRaw(40)).toBe(40)
		expect(recTrack(-12)).toBe(0)
		expect(recRaw(-12)).toBe(-12)
	})

	it("one loop spans tracks: each press plays back where it was played, marked as a loop's", () => {
		const r = rig()
		r.tap(RIGHT, 0) // arm
		r.key(3, 7); vi.advanceTimersByTime(100); r.key(3, 7, 0)
		vi.advanceTimersByTime(100)
		r.track(2)
		r.key(4, 7); vi.advanceTimersByTime(100); r.key(4, 7, 0)
		vi.advanceTimersByTime(100)
		r.tap(RIGHT, 0) // close and play
		expect(r.notes()).toEqual([[2, 1, 0], [2, 0, 0], [3, 1, 1], [3, 0, 1]]) // hands: three arguments
		r.track(4) // the front track is no longer either
		vi.advanceTimersByTime(400)
		expect(r.notes()).toEqual([[2, 1, 0, 1], [2, 0, 0, 1], [3, 1, 1, 1], [3, 0, 1, 1]])
		r.page.dispose(r.ctx)
	})

	it("a loop's playback is on the dim plane, the front track's too; a hand joining it is bright and re-struck", () => {
		const r = rig()
		r.tap(RIGHT, 0)
		r.key(3, 7); vi.advanceTimersByTime(400); r.key(3, 7, 0)
		r.tap(RIGHT, 0)
		vi.advanceTimersByTime(100); r.notes()
		expect(r.led(3, 7)).toBe(6)
		r.key(8, 6) // not the same note
		expect(r.led(3, 7)).toBe(6)
		r.key(8, 6, 0); r.notes()
		r.key(3, 7) // the loop's own note, by hand: off and on again, as a hand's
		expect(r.notes()).toEqual([[2, 0, 0, 1], [2, 1, 0]])
		expect(r.led(3, 7)).toBe(15)
		r.page.dispose(r.ctx)
	})

	it("a loop replays an arp key on the track it was pressed for, and an octave on its own track", () => {
		const r = rig()
		r.tap(RIGHT, 0)
		r.key(3, 7) // the first note starts the take
		r.track(2)
		vi.advanceTimersByTime(100)
		r.tap(TRACKS, 5) // ARP down, track 2
		vi.advanceTimersByTime(100)
		r.key(3, 7, 0)
		r.tap(RIGHT, 0)
		r.tap(TRACKS, 5) // off again by hand
		r.track(1); r.sent()
		vi.advanceTimersByTime(150)
		expect(r.sent()).toEqual([["/surface/arp/order", "down"], ["/surface/arp/prob-mode", "wait"], ["/surface/keys/2/arp", 1]])
		r.page.dispose(r.ctx)
	})
})

describe("iso-surface layers: chords, and files from before", () => {
	it("chords play on the front track; with its LATCH lit by the key they save what it rings; the pedal does not arm", () => {
		const r = rig()
		r.tap(...LATCH)
		r.tap(3, 7); r.tap(5, 7)
		r.holds(2, 1); r.holds(4, 1) // the app says its LATCH keeps both
		r.tap(CHORDS, 0) // save
		expect((r.page.serialize() as any).chords[0]).toEqual([2, 4])
		r.sent()
		r.tap(CHORDS, 0) // the same slot again: the app lets go of what LATCH holds, LATCH stays
		expect(r.sent()).toEqual([["/surface/keys/1/release"]])
		expect(r.led(...LATCH)).toBe(15)
		r.holds(2, 0); r.holds(4, 0)
		r.tap(...LATCH); r.notes()
		r.track(3)
		r.key(CHORDS, 0)
		expect(r.notes()).toEqual([[2, 1, 2], [4, 1, 2]])
		r.key(CHORDS, 0, 0)
		expect(r.notes()).toEqual([[2, 0, 2], [4, 0, 2]])
		r.key(...PEDAL) // LATCH by the pedal: chords still play
		r.key(CHORDS, 0)
		expect(r.notes()).toEqual([[2, 1, 2], [4, 1, 2]])
	})

	it("an old file: the selection's first track comes to the front, one octave goes to every track, a routed loop is cleared with a line in the log", () => {
		const r = rig()
		const log = vi.spyOn(console, "log").mockImplementation(() => {})
		const take = { lengthMs: 400, events: [{ atMs: 0, step: 2, on: true }, { atMs: 200, step: 2, on: false }] }
		r.page.restore!({
			selected: [2, 3], routes: [[], [1], [], []], octave: 1, tintOn: true, tintPcs: [0, 4, 7], tintMode: "below",
			arp: "ascending", arpSpeed: "x2", arpProb: 0.5,
			patterns: [take, take, {}, {}],
		}, r.ctx)
		const out = r.page.serialize() as any
		expect(out.front).toBe(2)
		expect(out.selected).toEqual([2])
		expect(out.octaves).toEqual([1, 1, 1, 1])
		expect(out.tintOns).toEqual([true, true, true, true])
		expect(out.tintModes).toEqual(["below", "below", "below", "below"])
		expect(out.tintPcsByTrack).toEqual([[0, 4, 7], [0, 4, 7], [0, 4, 7], [0, 4, 7]])
		expect(out.routes).toBeUndefined()
		expect(out.arp).toBeUndefined()
		expect(out.patterns[0].events).toHaveLength(2) // unrouted: kept, and plays on track 1
		expect(out.patterns[1].events).toHaveLength(0)
		expect(log.mock.calls.some((c) => String(c[0]).includes("loop 2"))).toBe(true)
		log.mockRestore()
		// What it saved comes back as it was.
		const again = rig()
		again.page.restore!(JSON.parse(JSON.stringify(out)), again.ctx)
		expect(JSON.parse(JSON.stringify(again.page.serialize()))).toEqual(JSON.parse(JSON.stringify(out)))
	})

	it("restoring makes no sound and tells the app nothing", () => {
		const r = rig()
		r.page.restore!({ front: 1, octaves: [0, 2, 0, 0] }, r.ctx)
		expect(r.notes()).toEqual([])
		expect(r.sent()).toEqual([])
	})
})
