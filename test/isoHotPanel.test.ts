import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"
import { PageManager } from "../src/core/pageManager.js"
import { IsoHotPage } from "../src/pages/iso-hot.js"
import { ledIndex, type GridSize, type Modifiers, type Slot } from "../src/core/types.js"

/* The iso-hot performance panel (col 0 row 6): octave, arp speed / probability, strum,
 * tintinnabuli. Keyboard cell (x, y) plays step (x − 1) + (7 − y)·5 at the defaults. */

const SIZE: GridSize = { width: 16, height: 8 }
const at = (f: Uint8Array | undefined, x: number, y: number) => f![ledIndex(SIZE, x, y)]

function rig(opts: { rng?: () => number; config?: unknown } = {}) {
	const sent: Array<{ path: string; args: any[] }> = []
	const persisted: Array<Record<string, unknown>> = []
	const modifiers: Modifiers = { held: new Set(), shift1: false, shift2: false }
	const clock = { running: false, rate: 20, tick: 0, lanes: [] as any[] }
	const pm = new PageManager(
		{
			size: SIZE,
			modifiers,
			clock,
			osc: { send: (path, ...args) => sent.push({ path, args }) },
			setShift: () => {},
		},
		() => {},
		{ onPersist: (_slot, patch) => persisted.push(patch) },
	)
	pm.load(0 as Slot, () => new IsoHotPage(opts.rng), opts.config)
	pm.focus(0 as Slot)
	const notes = () => sent.filter((m) => m.path.endsWith("/note"))
	const ons = () => notes().filter((m) => m.args[1] === 1).map((m) => m.args[0])
	const offs = () => notes().filter((m) => m.args[1] === 0).map((m) => m.args[0])
	const key = (x: number, y: number, s: 0 | 1) => pm.onKey({ x, y, s })
	const tap = (x: number, y: number) => { key(x, y, 1); key(x, y, 0) }
	const state = () => pm.serialize(0 as Slot) as any
	const clear = () => { sent.length = 0 }
	return { pm, sent, persisted, clock, notes, ons, offs, key, tap, state, clear }
}
type Rig = ReturnType<typeof rig>

const openPanel = (r: Rig) => r.tap(0, 6)
/** Hold the tint key and press keys to add their pitch classes; release doesn't toggle tint. */
const editTriad = (r: Rig, cells: Array<[number, number]>) => {
	r.key(1, 0, 1)
	for (const [x, y] of cells) r.tap(x, y)
	r.key(1, 0, 0)
}

describe("iso-hot performance panel", () => {
	beforeEach(() => { vi.useFakeTimers() })
	afterEach(() => { vi.useRealTimers() })

	it("defaults off: a plain note stream is unchanged and the toggle LED idles", () => {
		const r = rig()
		r.key(5, 7, 1)
		r.key(5, 7, 0)
		expect(r.notes().map((m) => m.args)).toEqual([[4, 1, 0], [4, 0, 0]])
		expect(at(r.pm.renderFocused(), 0, 6)).toBe(2)
		const s = r.state()
		expect([s.arpSpeed, s.arpProb, s.strum, s.tintMode, s.tintPcs]).toEqual(["x1", 1, false, "above", []])
	})

	it("opens over cols 1-4, which stop playing; col 5 still plays; it hides the transposer", () => {
		const r = rig()
		r.tap(0, 7) // transposer shown
		openPanel(r)
		let f = r.pm.renderFocused()
		expect(at(f, 0, 6)).toBe(12)
		expect(at(f, 8, 7)).not.toBe(15) // transposer row gone
		expect(at(f, 1, 6)).toBe(15) // octave 0 current
		expect(at(f, 2, 3)).toBe(15) // speed ×1 current
		expect(at(f, 3, 0)).toBe(15) // 100% current
		r.clear()
		r.tap(2, 5) // a panel key, not a note
		expect(r.notes()).toEqual([])
		r.key(5, 7, 1)
		expect(r.ons()).toEqual([4])
		r.key(5, 7, 0)
		r.tap(0, 7) // transposer back → panel hides
		f = r.pm.renderFocused()
		expect(at(f, 0, 6)).not.toBe(12)
		expect(at(f, 8, 7)).toBe(15)
	})

	it("a key held from before the panel opened still releases", () => {
		const r = rig()
		r.key(2, 7, 1) // step 1
		openPanel(r)
		r.key(2, 7, 0)
		expect(r.offs()).toEqual([1])
	})

	it("octave shifts by npo; a ringing note keeps the octave it began in", () => {
		const r = rig()
		r.key(6, 7, 1) // step 5
		openPanel(r)
		r.tap(1, 5) // +1
		r.key(6, 7, 0)
		expect(r.offs()).toEqual([5])
		r.clear()
		r.key(6, 7, 1)
		expect(r.ons()).toEqual([17])
		r.key(6, 7, 0)
		r.clear()
		r.tap(1, 7) // −1
		expect(r.sent.find((m) => m.path.endsWith("/octave"))?.args).toEqual([-1])
		r.key(6, 7, 1)
		expect(r.ons()).toEqual([-7])
		r.key(6, 7, 0)
		r.tap(1, 6) // back to 0
		openPanel(r) // close: LED shows no offset in force
		expect(at(r.pm.renderFocused(), 0, 6)).toBe(2)
	})

	it("arp speed ×2 doubles the free-running step rate, ÷2 halves it", () => {
		const count = (row: number | null) => {
			const r = rig()
			r.key(6, 7, 1)
			r.key(8, 7, 1)
			r.tap(14, 4) // ascending
			if (row !== null) { openPanel(r); r.tap(2, row) }
			r.clear()
			vi.advanceTimersByTime(1000)
			return r.ons().length
		}
		const x1 = count(null)
		expect(x1).toBeGreaterThanOrEqual(7)
		expect(count(2)).toBeGreaterThanOrEqual(2 * x1 - 1)
		expect(count(4)).toBeLessThanOrEqual(Math.ceil(x1 / 2) + 1)
	})

	it("arp speed ×3 on the clock: one step on the tick and two inside it; ÷3 skips ticks", () => {
		const r = rig()
		r.clock.running = true
		r.key(6, 7, 1)
		r.key(8, 7, 1)
		r.key(10, 7, 1)
		r.tap(14, 4)
		openPanel(r)
		r.tap(2, 1) // ×3
		r.clear()
		r.pm.tick(1, 0)
		expect(r.ons().length).toBe(1)
		vi.advanceTimersByTime(49) // one tick at rate 20 = 50 ms
		expect(r.ons().length).toBe(3)
		r.tap(2, 5) // ÷3
		r.clear()
		for (let t = 1; t <= 6; t++) r.pm.tick(t, 0)
		expect(r.ons().length).toBe(2) // ticks 3 and 6
	})

	it("a missed beat rests without advancing: the due note plays on the next beat", () => {
		const seq = [0.9, 0]
		const r = rig({ rng: () => seq.shift() ?? 0 })
		r.key(6, 7, 1) // 5
		r.key(8, 7, 1) // 7
		r.key(10, 7, 1) // 9
		r.tap(14, 4)
		openPanel(r)
		r.tap(3, 4) // 50%
		expect(r.state().arpProb).toBe(0.5)
		r.clear()
		vi.advanceTimersByTime(130) // beat 1: rng 0.9 → rest, nothing moves
		expect(r.notes()).toEqual([])
		vi.advanceTimersByTime(125) // beat 2: plays
		const on = r.ons()
		expect(on.length).toBe(1)
		expect(on[0]).not.toBe(r.offs()[0]) // it moved on to a new note
	})

	it("strum staggers notes that start together, and a note released early never starts", () => {
		const r = rig()
		openPanel(r)
		editTriad(r, [[5, 7]]) // pitch class 4
		r.tap(1, 0) // tint on
		r.tap(4, 0) // strum on
		r.clear()
		r.key(6, 7, 1) // 5 + T-voice 16
		expect(r.ons()).toEqual([5])
		vi.advanceTimersByTime(30)
		expect(r.ons()).toEqual([5, 16])
		r.key(6, 7, 0)
		r.clear()
		r.key(6, 7, 1)
		r.key(6, 7, 0) // before the second note's turn
		vi.advanceTimersByTime(100)
		expect(r.ons()).toEqual([5])
		expect(r.offs()).toEqual([5])
	})

	it("tint: above, below and alternate, fixed per held note; off removes the T-voice", () => {
		const r = rig()
		openPanel(r)
		editTriad(r, [[5, 7], [8, 7], [11, 7]]) // pitch classes 4, 7, 10
		expect(r.ons()).toEqual([]) // editing plays nothing
		r.tap(1, 0)
		r.clear()
		r.key(6, 7, 1) // 5 → 7 above
		expect(r.ons().sort((a, b) => a - b)).toEqual([5, 7])
		r.key(6, 7, 0)
		r.tap(1, 2) // below
		r.clear()
		r.key(6, 7, 1) // 5 → 4 below
		expect(r.ons().sort((a, b) => a - b)).toEqual([4, 5])
		r.key(6, 7, 0)
		r.tap(1, 3) // alternate
		r.clear()
		r.key(6, 7, 1) // above: 7
		r.key(10, 7, 1) // 9 → below: 7 (already sounding) — same note, one voice
		r.key(12, 7, 1) // 11 → above: 16
		expect(r.ons()).toContain(16)
		r.clear()
		r.tap(1, 0) // tint off: the T-voices go, the fingers stay
		expect(r.offs().sort((a, b) => a - b)).toEqual([7, 16])
	})

	it("the triad persists, restores, and clears when npo changes", () => {
		const r = rig()
		openPanel(r)
		editTriad(r, [[5, 7], [8, 7]])
		expect(r.persisted.at(-1)).toEqual({ tintPcs: [4, 7] })
		const saved = r.state()
		const r2 = rig({ config: saved })
		expect(r2.state().tintPcs).toEqual([4, 7])
		r2.pm.routeOscToPage(0 as Slot, "/setting/npo", [19])
		expect(r2.state().tintPcs).toEqual([])
		expect(r2.persisted.at(-1)).toEqual({ tintPcs: [] })
	})

	it("panel moves are recorded as gestures, replayed, and survive a save/restore", () => {
		const r = rig()
		openPanel(r)
		r.tap(15, 0) // arm looper 0
		r.tap(1, 4) // octave +2 → starts the take
		vi.advanceTimersByTime(100)
		r.tap(2, 0) // ×4
		r.tap(3, 7) // 12.5%
		r.tap(4, 0) // strum on
		r.tap(1, 3) // tint mode alternate
		r.tap(1, 0) // tint on
		vi.advanceTimersByTime(100)
		r.tap(15, 0) // close → playing
		const ctl = r.state().patterns[0].events.map((e: any) => e.ctl)
		expect(ctl).toEqual([
			{ id: "oct", value: 2 },
			{ id: "arpSpeed", value: 0 },
			{ id: "arpProb", value: 7 },
			{ id: "strum", value: 1 },
			{ id: "tintMode", value: 2 },
			{ id: "tint", value: 1 },
		])
		// Put everything back by hand, then let the loop replay it.
		r.tap(1, 6); r.tap(2, 3); r.tap(3, 0); r.tap(4, 0); r.tap(1, 1); r.tap(1, 0)
		vi.advanceTimersByTime(250)
		const s = r.state()
		expect([s.arpSpeed, s.arpProb, s.strum, s.tintMode]).toEqual(["x4", 0.125, true, "alternate"])
		// The restore guard keeps every id (clamped) rather than dropping it.
		const r2 = rig({ config: r.state() })
		expect(r2.state().patterns[0].events.map((e: any) => e.ctl)).toEqual(ctl)
	})
})
