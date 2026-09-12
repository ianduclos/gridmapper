import { describe, it, expect, vi, afterEach } from "vitest"
import { page as isometricModule } from "../src/pages/isometric.js"
import { page as meadowphysicsModule } from "../src/pages/meadowphysics.js"
import { PatternRecorder } from "../src/util/patternRecorder.js"
import { PageManager } from "../src/core/pageManager.js"
import { applySystemConfig, captureSystemConfig, sanitizeSystemConfig, type SystemConfigTarget } from "../src/core/systemConfig.js"
import { DEFAULT_PAGE } from "../src/pages/registry.js"
import {
	type GridSize,
	type Modifiers,
	type PageContext,
	type Page,
	type KeyEvent,
	type Slot,
	SLOT_INDICES,
	ledIndex,
} from "../src/core/types.js"

const SIZE: GridSize = { width: 16, height: 8 }

function makeCtx(overrides: Partial<PageContext> = {}): PageContext {
	const modifiers: Modifiers = { held: new Set(), shift1: false, shift2: false }
	return {
		size: SIZE,
		modifiers,
		clock: { running: false, rate: 20, tick: 0, lanes: [] },
		osc: { send: () => {} },
		slot: 0,
		slotLabel: "a",
		setDirty: () => {},
		setShift: () => {},
		...overrides,
	}
}

/** serialize → JSON round trip → restore into a FRESH page → serialize. */
function roundTrip(module: { create: () => Page }, played: (p: Page, ctx: PageContext) => void) {
	const ctx = makeCtx()
	const a = module.create()
	a.init(ctx)
	played(a, ctx)
	const captured = JSON.parse(JSON.stringify(a.serialize()))

	const b = module.create()
	b.init(ctx)
	b.restore!(captured, ctx)
	return { captured, restored: JSON.parse(JSON.stringify(b.serialize())), page: b, ctx }
}

const press = (p: Page, ctx: PageContext, x: number, y: number) => {
	const down: KeyEvent = { x, y, s: 1 }
	p.onKey(down, ctx)
	p.onKey({ x, y, s: 0 }, ctx)
}

afterEach(() => vi.restoreAllMocks())

describe("PatternRecorder.restore", () => {
	it("brings a take back stopped, at the top, note-for-note", () => {
		const r = new PatternRecorder()
		r.press(0)
		r.record(60, true, 100)
		r.record(60, false, 300)
		r.press(600) // close the loop
		const snap = r.snapshot()
		expect(snap.events).toHaveLength(2)

		const b = new PatternRecorder()
		b.restore(JSON.parse(JSON.stringify(snap)))
		expect(b.snapshot()).toEqual(snap)
		expect(b.hasContent).toBe(true)
		// Restoring must never start making noise on its own.
		expect(b.state).toBe("stopped")
		expect(b.isRunning).toBe(false)
		expect([...b.sounding]).toEqual([])
	})

	it("restores content-free snapshots as empty", () => {
		for (const snap of [
			{ lengthMs: 0, events: [] },
			{ lengthMs: 500, events: [] },
			{ lengthMs: 0, events: [{ atMs: 0, step: 1, on: true }] },
		]) {
			const r = new PatternRecorder()
			r.restore(snap)
			expect(r.state).toBe("empty")
			expect(r.hasContent).toBe(false)
		}
	})

	it("sorts events by offset, so a hand-edited file still plays in order", () => {
		const r = new PatternRecorder()
		r.restore({ lengthMs: 400, events: [
			{ atMs: 300, step: 3, on: false },
			{ atMs: 0, step: 3, on: true },
		] })
		expect(r.snapshot().events.map((e) => e.atMs)).toEqual([0, 300])
	})

	it("plays a restored loop once resumed", () => {
		const r = new PatternRecorder()
		r.restore({ lengthMs: 400, events: [{ atMs: 0, step: 7, on: true }] })
		r.press(0) // stopped → playing
		r.advance(0, 10, 0)
		expect([...r.sounding]).toEqual([7])
	})
})

describe("isometric restore", () => {
	it("round-trips settings, chords, loops and tracks", () => {
		const { captured, restored } = roundTrip(isometricModule, (p, ctx) => {
			p.onOsc!("/setting/npo", [7], ctx)
			p.onOsc!("/setting/scale", ["dorian"], ctx)
			p.onOsc!("/setting/vertical", [4], ctx)
			p.onOsc!("/setting/orientation", ["horizontal"], ctx)
			p.onOsc!("/setting/arpDiv", [3], ctx)
			// A chord in preset slot 2: hold two keys, arm the bank, save.
			p.onKey({ x: 0, y: 7, s: 1 }, ctx)
			p.onKey({ x: 2, y: 7, s: 1 }, ctx)
			press(p, ctx, 15, 4) // sustain toggle = armed for saving
			press(p, ctx, 13, 2) // chord column: save the ringing chord into slot 2
		})
		expect(restored).toEqual(captured)
		expect(restored.npo).toBe(7)
		expect(restored.scale).toBe("dorian")
		expect(restored.orientation).toBe("horizontal")
		expect(restored.chords[2]).not.toBeNull()
	})

	it("comes back silent — no sustain, no held keys, nothing ringing", () => {
		const notes: any[][] = []
		const ctx = makeCtx({ osc: { send: (path, ...args) => { if (path.endsWith("/note")) notes.push(args) } } })
		const a = isometricModule.create()
		a.init(makeCtx())
		const b = isometricModule.create()
		b.init(ctx)
		notes.length = 0
		b.restore!({ npo: 7, chords: [[0, 4, 7], null, null, null, null, null, null, null] }, ctx)
		expect(notes).toEqual([]) // restoring a chord bank must not play it
		// Nothing is SOUNDING (LVL_UNISON 12) or under a finger (LVL_HELD 15); the keyboard
		// still draws its scale, which is why this isn't "the frame is dark".
		const frame = b.render(ctx)!
		expect(frame.every((lvl) => lvl < 12)).toBe(true)
	})

	it("survives a preset from an older build: missing keys keep defaults", () => {
		const fresh = isometricModule.create()
		const ctx = makeCtx()
		fresh.init(ctx)
		const defaults = fresh.serialize() as Record<string, unknown>

		const b = isometricModule.create()
		b.init(ctx)
		b.restore!({ npo: 5 }, ctx) // a file written before the other settings existed
		const after = b.serialize() as Record<string, unknown>
		expect(after.npo).toBe(5)
		expect(after.scale).toBe(defaults.scale)
		expect(after.arpRate).toBe(defaults.arpRate)
		expect(after.patterns).toEqual(defaults.patterns)
	})

	it("clamps and refuses nonsense instead of throwing", () => {
		const ctx = makeCtx()
		const b = isometricModule.create()
		b.init(ctx)
		const defaults = b.serialize() as Record<string, any> // before restore = the defaults
		expect(() =>
			b.restore!(
				{
					npo: 9999,
					vertical: -40,
					scale: "not-a-scale",
					layout: 42,
					arp: "sideways",
					chords: "nope",
					patterns: { not: "an array" },
					selected: [],
					routes: [[99], "x", null, [1, 1, 2]],
				},
				ctx
			)
		).not.toThrow()
		const after = b.serialize() as Record<string, any>
		expect(after.scale).toBe(defaults.scale) // unknown enum refused
		expect(after.arp).toBe("off")
		expect(after.npo).toBe(48) // clamped to the spec max, not refused
		expect(after.vertical).toBeGreaterThanOrEqual(1)
		expect(after.selected).toEqual([0]) // never empty
		expect(after.routes[0]).toEqual([]) // out-of-range looper dropped
		expect(after.routes[3]).toEqual([1, 2]) // deduped
	})

	it("ignores a config that isn't an object at all", () => {
		const ctx = makeCtx()
		const b = isometricModule.create()
		b.init(ctx)
		const before = b.serialize()
		for (const junk of [null, undefined, 7, "x", []]) b.restore!(junk, ctx)
		expect(b.serialize()).toEqual(before)
	})

	it("re-announces after restoring, so Max sees the real values not the defaults", () => {
		const sent: string[] = []
		const ctx = makeCtx({ osc: { send: (path, ...args) => sent.push(`${path} ${args[0]}`) } })
		const b = isometricModule.create()
		b.init(ctx)
		sent.length = 0
		b.restore!({ npo: 7 }, ctx)
		expect(sent.some((m) => m.includes("/settings") && m.includes('"npo":7'))).toBe(true)
		expect(sent.some((m) => m.includes("/chords"))).toBe(true)
		expect(sent.some((m) => m.includes("/tracks"))).toBe(true)
	})
})

describe("meadowphysics restore", () => {
	it("round-trips the patch and its settings", () => {
		const { captured, restored } = roundTrip(meadowphysicsModule, (p, ctx) => {
			p.onOsc!("/setting/div", [3], ctx)
			p.onOsc!("/setting/lane", [2], ctx)
			// Hold col 0 on row 1 to select it + enter config, set a speed, then release.
			p.onKey({ x: 0, y: 1, s: 1 }, ctx)
			press(p, ctx, 10, 1) // speed
			press(p, ctx, 3, 4) // row 4 becomes a reset target of row 1
			press(p, ctx, 6, 5) // row 5 becomes a trig target of row 1
			p.onKey({ x: 0, y: 1, s: 0 }, ctx)
			press(p, ctx, 5, 2) // main mode: set row 2's count
		})
		expect(restored).toEqual(captured)
		expect(restored.div).toBe(3)
		expect(restored.lane).toBe(2)
	})

	it("comes back as a patch at rest — no sounding notes, position parked on count", () => {
		const notes: any[][] = []
		const ctx = makeCtx({ osc: { send: (path, ...args) => { if (path.endsWith("/note")) notes.push(args) } } })
		const b = meadowphysicsModule.create()
		b.init(ctx)
		notes.length = 0
		b.restore!({ lane: 1, patch: { count: [3, 3, 3, 3, 3, 3, 3, 3], play: 1 } }, ctx)
		expect(notes).toEqual([])
		// It only starts cascading once the transport ticks it.
		expect(() => b.onTick!(1, 1, ctx)).not.toThrow()
	})

	it("takes a partial or malformed patch without throwing", () => {
		const ctx = makeCtx()
		const b = meadowphysicsModule.create()
		b.init(ctx)
		const defaults = b.serialize() as any
		expect(() =>
			b.restore!(
				{
					div: "nonsense",
					patch: {
						count: [999, -5, "x"],
						rule: [99, -1],
						rtype: [0, 9],
						reset: "not a matrix",
						trig: [[1, 1, 1, 1, 1, 1, 1, 1]],
						play: 7,
					},
				},
				ctx
			)
		).not.toThrow()
		const after = b.serialize() as any
		expect(after.div).toBe(defaults.div) // unparseable setting refused
		expect(after.patch.count[0]).toBeLessThanOrEqual(15)
		expect(after.patch.count[1]).toBeGreaterThanOrEqual(0)
		expect(after.patch.count[2]).toBe(defaults.patch.count[2]) // bad element → default
		expect(after.patch.rtype.every((v: number) => v >= 1 && v <= 3)).toBe(true)
		expect(after.patch.rule.every((v: number) => v >= 0 && v <= 7)).toBe(true)
		expect(after.patch.play).toBe(1) // clamped into 0..1
		expect(after.patch.reset).toEqual(defaults.patch.reset)
		expect(after.patch.trig[0]).toEqual([1, 1, 1, 1, 1, 1, 1, 1])
		expect(after.patch.trig[1]).toEqual(defaults.patch.trig[1]) // short matrix padded
	})

	it("ignores a config that isn't an object at all", () => {
		const ctx = makeCtx()
		const b = meadowphysicsModule.create()
		b.init(ctx)
		const before = b.serialize()
		for (const junk of [null, undefined, 7, "x", []]) b.restore!(junk, ctx)
		expect(b.serialize()).toEqual(before)
	})
})

describe("a whole-system round trip", () => {
	function makeTarget() {
		const modifiers: Modifiers = { held: new Set(), shift1: false, shift2: false }
		const pm = new PageManager({
			size: SIZE,
			modifiers,
			clock: { running: false, rate: 20, tick: 0, lanes: [] },
			osc: { send: () => {} },
			setShift: () => {},
		})
		const slotPages: string[] = Array.from(SLOT_INDICES, () => DEFAULT_PAGE)
		const target: SystemConfigTarget = { pm, slotPages }
		return { pm, target, slotPages }
	}

	it("captures eight slots, writes JSON, and loads them back identically", () => {
		const a = makeTarget()
		applySystemConfig(
			sanitizeSystemConfig({
				version: 1,
				slots: { a: { page: "isometric" }, b: { page: "meadowphysics" } },
			}),
			a.target
		)
		// Play something into both pages.
		a.pm.onKey({ x: 0, y: 7, s: 1 })
		a.pm.onKey({ x: 0, y: 7, s: 0 })
		a.pm.routeOscToPage(0 as Slot, "/setting/npo", [7])
		a.pm.routeOscToPage(1 as Slot, "/setting/div", [5])

		const file = JSON.parse(JSON.stringify(captureSystemConfig(a.target)))

		const b = makeTarget()
		applySystemConfig(sanitizeSystemConfig(file), b.target)
		expect(b.slotPages).toEqual(a.slotPages)
		expect(captureSystemConfig(b.target)).toEqual(file)
	})

	it("a preset naming a page that no longer exists still loads that slot", () => {
		vi.spyOn(console, "warn").mockImplementation(() => {})
		const { target, slotPages, pm } = makeTarget()
		applySystemConfig(
			sanitizeSystemConfig({ version: 1, slots: { a: { page: "deleted", config: { npo: 7 } } } }),
			target
		)
		expect(slotPages[0]).toBe(DEFAULT_PAGE)
		expect(() => pm.renderFocused()).not.toThrow()
	})

	it("a page that throws while restoring keeps its slot on defaults", () => {
		vi.spyOn(console, "error").mockImplementation(() => {})
		const { pm } = makeTarget()
		const exploding: Page = {
			init() {},
			onFocus() {},
			onBlur() {},
			onKey() {},
			restore() {
				throw new Error("bad preset")
			},
			render: () => new Uint8Array(SIZE.width * SIZE.height),
			dispose() {},
		}
		expect(() => pm.load(0 as Slot, () => exploding, { any: "thing" })).not.toThrow()
		expect(pm.renderFocused()).toBeDefined()
	})

	it("ignores ledIndex bounds drift — a restored frame is still the right size", () => {
		const { target, pm } = makeTarget()
		applySystemConfig(sanitizeSystemConfig({ version: 1, slots: { a: { page: "isometric" } } }), target)
		const frame = pm.renderFocused()!
		expect(frame).toHaveLength(SIZE.width * SIZE.height)
		expect(ledIndex(SIZE, 15, 7)).toBe(frame.length - 1)
	})
})
