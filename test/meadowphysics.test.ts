import { describe, it, expect } from "vitest"
import {
	createMeadowState,
	mpTick,
	mpRule,
	mpKey,
	mpFrame,
	MeadowphysicsPage,
	STOPPED,
	RULE_GLYPHS,
	type MeadowState,
	type NoteEdge,
} from "../src/pages/meadowphysics.js"
import { ledIndex, type GridSize, type PageContext } from "../src/core/types.js"
import type { ClockState } from "../src/core/clock.js"

const SIZE: GridSize = { width: 16, height: 8 }
const at = (f: Uint8Array, x: number, y: number) => f[ledIndex(SIZE, x, y)]

/** Only row 0 alive, running every tick — isolates one counter for exact counting. */
function soloState(): MeadowState {
	const st = createMeadowState(SIZE)
	for (let n = 1; n < st.rows; n++) st.pos[n] = STOPPED
	st.speed[0] = 0
	st.tickCd[0] = 0
	return st
}

const run = (st: MeadowState, n: number): NoteEdge[][] =>
	Array.from({ length: n }, () => mpTick(st))

describe("meadowphysics counters", () => {
	it("seeds row n at column n+8, self-resetting and self-trigging", () => {
		const st = createMeadowState(SIZE)
		expect(st.pos).toEqual([8, 9, 10, 11, 12, 13, 14, 15])
		expect(st.count).toEqual(st.pos)
		expect(st.reset[3][3]).toBe(1)
		expect(st.trig[3][3]).toBe(1)
		expect(st.reset[3][4]).toBe(0)
	})

	it("falls right→left one column per tick at speed 0", () => {
		const st = soloState()
		run(st, 3)
		expect(st.pos[0]).toBe(5)
	})

	it("triggers at column 0, re-arms to count, and releases one tick later", () => {
		const st = soloState()
		// pos 8 → 0 takes 8 ticks; the 9th tick is the event.
		const ticks = run(st, 9)
		expect(ticks.slice(0, 8).flat()).toEqual([])
		expect(ticks[8]).toEqual([{ row: 0, on: true }])
		expect(st.pos[0]).toBe(8) // self-reset re-armed it
		// A trig is exactly one tick long.
		expect(mpTick(st)).toEqual([{ row: 0, on: false }])
		expect(st.note[0]).toBe(0)
	})

	it("halves the rate for each step of speed", () => {
		const st = soloState()
		st.speed[0] = 1
		run(st, 4) // acts on ticks 1 and 3
		expect(st.pos[0]).toBe(6)
	})

	it("a stopped row never advances or fires", () => {
		const st = soloState()
		st.pos[0] = STOPPED
		expect(run(st, 20).flat()).toEqual([])
		expect(st.pos[0]).toBe(STOPPED)
	})

	it("tog targets latch instead of pulsing", () => {
		const st = soloState()
		st.trig[0][1] = 0
		st.tog[0][1] = 1
		const ticks = run(st, 10)
		expect(ticks[8]).toContainEqual({ row: 1, on: true })
		expect(ticks[9]).not.toContainEqual({ row: 1, on: false }) // still latched on
		expect(st.note[1]).toBe(1)
	})

	it("cascades: row 0's event re-arms a stopped row 1", () => {
		const st = soloState()
		st.pos[1] = STOPPED
		st.reset[0][1] = 1
		run(st, 9)
		// Re-armed to count (9) inside the same tick sweep, then row 1's own divider
		// was due, so it has already taken its first step — the lua does this too.
		expect(st.pos[1]).toBe(st.count[1] - 1)
	})
})

describe("meadowphysics rules", () => {
	const ruled = (rule: number, rtype = 1) => {
		const st = soloState()
		st.rule[0] = rule
		st.rtype[0] = rtype
		st.min[0] = 6
		st.max[0] = 9
		st.count[0] = 8
		return st
	}

	it("inc steps up and wraps at max", () => {
		const st = ruled(1)
		mpRule(st, 0)
		expect(st.count[0]).toBe(9)
		mpRule(st, 0)
		expect(st.count[0]).toBe(6)
	})

	it("dec steps down and wraps at min", () => {
		const st = ruled(2)
		st.count[0] = 6
		mpRule(st, 0)
		expect(st.count[0]).toBe(9)
	})

	it("min / max jump to the ends of the range", () => {
		expect(((s) => (mpRule(s, 0), s.count[0]))(ruled(3))).toBe(6)
		expect(((s) => (mpRule(s, 0), s.count[0]))(ruled(4))).toBe(9)
	})

	it("random stays inside the range", () => {
		const st = ruled(5)
		st.rng = () => 0.99
		mpRule(st, 0)
		expect(st.count[0]).toBe(9)
		st.rng = () => 0
		mpRule(st, 0)
		expect(st.count[0]).toBe(6)
	})

	it("pole jumps to the further end", () => {
		const st = ruled(6)
		st.count[0] = 7 // nearer min → go to max
		mpRule(st, 0)
		expect(st.count[0]).toBe(9)
		mpRule(st, 0) // now at max → go to min
		expect(st.count[0]).toBe(6)
	})

	it("stop halts the destination row regardless of rtype", () => {
		const st = ruled(7, 2)
		mpRule(st, 0)
		expect(st.pos[0]).toBe(STOPPED)
	})

	it("rtype selects count, speed, or both", () => {
		const st = ruled(1, 2)
		st.smin[0] = 1
		st.smax[0] = 4
		st.speed[0] = 1
		mpRule(st, 0)
		expect(st.count[0]).toBe(8) // untouched
		expect(st.speed[0]).toBe(2)
		st.rtype[0] = 3
		mpRule(st, 0)
		expect(st.count[0]).toBe(9)
		expect(st.speed[0]).toBe(3)
	})

	it("runs the rule on the event, against its destination row", () => {
		const st = soloState()
		st.rdest[0] = 4
		st.min[4] = 6
		st.max[4] = 9
		st.count[4] = 8
		run(st, 9)
		expect(st.count[4]).toBe(9)
	})
})

describe("meadowphysics input", () => {
	it("main mode: one key sets the count, position and a zero-width range", () => {
		const st = createMeadowState(SIZE)
		mpKey(st, 5, 2, 1)
		expect([st.count[2], st.pos[2], st.min[2], st.max[2]]).toEqual([5, 5, 5, 5])
		mpKey(st, 5, 2, 0)
	})

	it("main mode: a second held key brackets the range either way round", () => {
		const st = createMeadowState(SIZE)
		mpKey(st, 5, 0, 1)
		mpKey(st, 11, 0, 1) // above the count
		expect([st.min[0], st.max[0]]).toEqual([5, 11])
		mpKey(st, 11, 0, 0)
		mpKey(st, 5, 0, 0)
		mpKey(st, 9, 1, 1)
		mpKey(st, 2, 1, 1) // below the count
		expect([st.min[1], st.max[1]]).toEqual([2, 9])
	})

	it("holding column 0 opens config and selects the row; column 1 opens rules", () => {
		const st = createMeadowState(SIZE)
		mpKey(st, 0, 5, 1)
		expect([st.mode, st.sel]).toEqual([1, 5])
		mpKey(st, 1, 0, 1)
		expect(st.mode).toBe(2)
		mpKey(st, 1, 0, 0)
		expect(st.mode).toBe(1)
		mpKey(st, 0, 5, 0)
		expect(st.mode).toBe(0)
	})

	it("config: start/stop, reset/tog/trig targets (trig and tog exclusive), play", () => {
		const st = createMeadowState(SIZE)
		mpKey(st, 0, 0, 1) // hold col 0 on row 0 → config, sel = 0
		mpKey(st, 2, 3, 1) // stop row 3
		expect(st.pos[3]).toBe(STOPPED)
		expect(st.off[3]).toBe(1)
		mpKey(st, 2, 3, 1) // start it again
		expect(st.pos[3]).toBe(st.count[3])
		mpKey(st, 3, 6, 1)
		expect(st.reset[0][6]).toBe(1)
		mpKey(st, 5, 6, 1) // tog on
		mpKey(st, 6, 6, 1) // trig on → clears tog
		expect([st.tog[0][6], st.trig[0][6]]).toEqual([0, 1])
		mpKey(st, 4, 0, 1)
		expect(st.play).toBe(1)
	})

	it("config: the speed half mirrors the count gesture", () => {
		const st = createMeadowState(SIZE)
		mpKey(st, 0, 0, 1)
		mpKey(st, 10, 2, 1) // speed 3
		expect([st.speed[2], st.smin[2], st.smax[2]]).toEqual([3, 3, 3])
		mpKey(st, 8, 2, 1) // hold + speed 1 → range 1..3
		expect([st.smin[2], st.smax[2]]).toEqual([1, 3])
	})

	it("play mode fires a row's targets when a new count is chosen", () => {
		const st = soloState()
		st.play = 1
		mpKey(st, 12, 0, 1)
		expect(st.push[0]).toBe(1)
		expect(mpTick(st)).toEqual([{ row: 0, on: true }])
		expect(st.pos[0]).toBe(12) // the push tick fires targets instead of advancing
	})

	it("rule mode: picks destination + rtype, and the rule by row", () => {
		const st = createMeadowState(SIZE)
		mpKey(st, 0, 2, 1)
		mpKey(st, 1, 0, 1) // rule mode, sel = 2
		mpKey(st, 4, 6, 1)
		expect([st.rdest[2], st.rtype[2]]).toEqual([6, 2]) // col 4 → speed
		mpKey(st, 12, 5, 1)
		expect(st.rule[2]).toBe(5) // "random"
	})

	it("ignores out-of-bounds keys", () => {
		const st = createMeadowState(SIZE)
		const before = JSON.stringify(st.count)
		mpKey(st, 99, 0, 1)
		mpKey(st, 4, 99, 1)
		expect(JSON.stringify(st.count)).toBe(before)
	})
})

describe("meadowphysics display", () => {
	it("main: dim range bar, count cell, bright falling position", () => {
		const st = createMeadowState(SIZE)
		st.min[0] = 4
		st.max[0] = 8
		st.count[0] = 6
		st.pos[0] = 2
		const f = mpFrame(st, SIZE)
		expect(at(f, 4, 0)).toBe(2)
		expect(at(f, 6, 0)).toBe(2) // count sits inside the bar, same level while silent
		expect(at(f, 2, 0)).toBe(8) // position is the bright one
		expect(at(f, 3, 0)).toBe(0)
		st.note[0] = 1
		expect(at(mpFrame(st, SIZE), 6, 0)).toBe(6) // count brightens while sounding
	})

	it("main: a stopped row shows no position", () => {
		const st = createMeadowState(SIZE)
		st.pos[0] = STOPPED
		const f = mpFrame(st, SIZE)
		for (let x = 0; x < SIZE.width; x++) expect(at(f, x, 0)).not.toBe(8)
	})

	it("config: markers, speed bar and the selected row", () => {
		const st = createMeadowState(SIZE)
		st.mode = 1
		st.sel = 3
		st.pos.fill(STOPPED)
		const f = mpFrame(st, SIZE)
		expect(at(f, 0, 3)).toBe(15) // selection
		expect(at(f, 2, 3)).toBe(2) // stopped
		expect(at(f, 3, 3)).toBe(5) // row 3 resets itself
		expect(at(f, 3, 4)).toBe(2) // ...but not row 4
		expect(at(f, 6, 3)).toBe(5) // trig target
		expect(at(f, 8, 0)).toBe(5) // speed 1 → column 7+1
		expect(at(f, 4, 0)).toBe(0) // play off
	})

	it("rule: destination, rtype and the rule glyph", () => {
		const st = createMeadowState(SIZE)
		st.mode = 2
		st.sel = 0
		st.rule[0] = 2 // "dec" — a horizontal bar on rows 3 and 4
		st.rdest[0] = 5
		st.rtype[0] = 3
		const f = mpFrame(st, SIZE)
		expect(at(f, 0, 0)).toBe(15)
		expect(at(f, 1, 0)).toBe(15)
		expect(at(f, 3, 5)).toBe(2)
		expect(at(f, 5, 5)).toBe(7) // rtype 3 → third column
		expect(at(f, 9, 3)).toBe(9) // glyph
		expect(at(f, 9, 2)).toBe(2) // the rule-row bar shows through
	})

	it("every glyph is 8 rows of 8-bit masks", () => {
		expect(RULE_GLYPHS).toHaveLength(8)
		for (const g of RULE_GLYPHS) {
			expect(g).toHaveLength(8)
			for (const b of g) expect(b).toBeLessThan(256)
		}
	})

	it("levels stay within 0..15 in every mode", () => {
		const st = createMeadowState(SIZE)
		for (const mode of [0, 1, 2] as const) {
			st.mode = mode
			const f = mpFrame(st, SIZE)
			expect(f).toHaveLength(SIZE.width * SIZE.height)
			for (const v of f) {
				expect(v).toBeGreaterThanOrEqual(0)
				expect(v).toBeLessThanOrEqual(15)
			}
		}
	})
})

// --- the page shell: app-clock driven, background-capable -------------------------

function makeCtx() {
	const sent: Array<{ path: string; args: any[] }> = []
	const clock: ClockState = { running: true, source: "internal", rate: 20, tick: 0 }
	const ctx = {
		size: SIZE,
		modifiers: { held: new Set<number>(), shift1: false, shift2: false },
		clock,
		osc: { send: (path: string, ...args: any[]) => sent.push({ path, args }) },
		slot: 0,
		slotLabel: "a",
		setDirty: () => {},
		setShift: () => {},
	} as unknown as PageContext
	const notes = () => sent.filter((m) => m.path.endsWith("/note"))
	return { ctx, sent, notes, clock }
}

/** Ticks a page until it emits its first note, or gives up. */
function tickUntilNote(page: MeadowphysicsPage, ctx: PageContext, notes: () => unknown[], max = 60) {
	for (let n = 1; n <= max && notes().length === 0; n++) page.onTick(n, ctx)
}

describe("MeadowphysicsPage (app clock)", () => {
	it("advances on app ticks, not on render", () => {
		const { ctx, notes } = makeCtx()
		const page = new MeadowphysicsPage()
		page.init(ctx)
		for (let i = 0; i < 40; i++) page.render()
		expect(notes()).toHaveLength(0) // rendering must not move the counters
		tickUntilNote(page, ctx, notes)
		expect(notes().length).toBeGreaterThan(0)
	})

	it("keeps running while unfocused — the whole point of the app clock", () => {
		const { ctx, notes } = makeCtx()
		const page = new MeadowphysicsPage()
		page.init(ctx)
		page.onBlur() // slot is no longer visible
		tickUntilNote(page, ctx, notes)
		expect(notes().length).toBeGreaterThan(0)
	})

	it("blur drops UI holds but never the sounding notes", () => {
		const { ctx, notes } = makeCtx()
		const page = new MeadowphysicsPage()
		page.init(ctx)
		page.onKey({ x: 0, y: 2, s: 1 }, ctx) // hold col 0 → CONFIG mode
		tickUntilNote(page, ctx, notes)
		const before = notes().length
		page.onBlur()
		expect(notes()).toHaveLength(before) // no note-offs fired
		// ...and we didn't come back stuck in CONFIG: a tap now sets a count again.
		page.onKey({ x: 5, y: 2, s: 1 }, ctx)
		expect((page.serialize() as any).patch.count[2]).toBe(5)
	})

	it("div divides the app clock down", () => {
		const { ctx } = makeCtx()
		const page = new MeadowphysicsPage()
		page.init(ctx)
		page.onOsc("/setting/div", [4], ctx)
		expect((page.serialize() as any).div).toBe(4)
		for (let n = 1; n <= 28; n++) page.onTick(n, ctx)

		// 28 ticks at div 4 must land exactly where 7 ticks at div 1 land.
		const plain = new MeadowphysicsPage()
		plain.init(makeCtx().ctx)
		for (let n = 1; n <= 7; n++) plain.onTick(n, ctx)
		expect((page as any).st.pos).toEqual((plain as any).st.pos)
		expect((page as any).st.pos[0]).toBeLessThan(8) // and it did move
	})

	it("clamps div and ignores unknown settings", () => {
		const { ctx } = makeCtx()
		const page = new MeadowphysicsPage()
		page.init(ctx)
		page.onOsc("/setting/div", [999], ctx)
		expect((page.serialize() as any).div).toBe(16)
		page.onOsc("/setting/rate", [50], ctx) // gone — the clock is app-level now
		expect((page.serialize() as any).rate).toBeUndefined()
	})

	it("releases sounding notes when the transport stops", () => {
		const { ctx, notes, clock } = makeCtx()
		const page = new MeadowphysicsPage()
		page.init(ctx)
		// Latch a note ON with a tog target so it stays sounding.
		const st = (page as any).st
		st.trig[0][1] = 0
		st.tog[0][1] = 1
		tickUntilNote(page, ctx, notes)
		expect(st.note[1]).toBe(1)
		clock.running = false
		page.onClock({ ...clock }, ctx)
		expect(notes().some((m: any) => m.args[0] === 1 && m.args[1] === 0)).toBe(true)
		expect(st.note[1]).toBe(0)
	})

	it("does not release on an unrelated transport change (rate/source)", () => {
		const { ctx, notes, clock } = makeCtx()
		const page = new MeadowphysicsPage()
		page.init(ctx)
		const st = (page as any).st
		st.trig[0][1] = 0
		st.tog[0][1] = 1
		tickUntilNote(page, ctx, notes)
		const before = notes().length
		page.onClock({ ...clock, rate: 40 }, ctx) // still running
		expect(notes()).toHaveLength(before)
		expect(st.note[1]).toBe(1)
	})

	it("releases notes when its slot is unloaded", () => {
		const { ctx, notes } = makeCtx()
		const page = new MeadowphysicsPage()
		page.init(ctx)
		const st = (page as any).st
		st.trig[0][1] = 0
		st.tog[0][1] = 1
		tickUntilNote(page, ctx, notes)
		const before = notes().length
		page.dispose(ctx)
		expect(notes().length).toBeGreaterThan(before)
		expect(st.note[1]).toBe(0)
	})

	it("announces its type and settings on init and focus", () => {
		const { ctx, sent } = makeCtx()
		const page = new MeadowphysicsPage()
		page.init(ctx)
		expect(sent[0]).toMatchObject({ path: "/grid/out/page/a/type", args: ["meadowphysics"] })
		expect(sent[1].path).toBe("/grid/out/page/a/settings")
		expect(JSON.parse(sent[1].args[0])).toEqual({ div: 1 })
	})
})

describe("meadowphysics display (levels)", () => {
	it("stays within 0..15 in every mode", () => {
		const st = createMeadowState(SIZE)
		for (const mode of [0, 1, 2] as const) {
			st.mode = mode
			const f = mpFrame(st, SIZE)
			expect(f).toHaveLength(SIZE.width * SIZE.height)
			for (const v of f) {
				expect(v).toBeGreaterThanOrEqual(0)
				expect(v).toBeLessThanOrEqual(15)
			}
		}
	})
})
