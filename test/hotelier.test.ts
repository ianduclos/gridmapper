import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"
import { mkdtempSync, readFileSync, writeFileSync, mkdirSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { createPresetStore } from "../src/core/presetStore.js"
import { defaultSystemConfig } from "../src/core/systemConfig.js"
import { PageManager } from "../src/core/pageManager.js"
import { IsoHotPage } from "../src/pages/iso-hot.js"
import { BlankHotPage } from "../src/pages/blank-hot.js"
import { ledIndex, makeFrame, type GridSize, type Modifiers, type Slot } from "../src/core/types.js"

const SIZE: GridSize = { width: 16, height: 8 }
const at = (f: Uint8Array | undefined, x: number, y: number) => f![ledIndex(SIZE, x, y)]

function rig() {
	const sent: Array<{ path: string; args: any[] }> = []
	const announced: Slot[] = []
	const persisted: Array<{ slot: Slot; patch: Record<string, unknown> }> = []
	const frames: Array<{ frame: Uint8Array | undefined; reason: string }> = []
	const modifiers: Modifiers = { held: new Set(), shift1: false, shift2: false }
	const pm = new PageManager(
		{
			size: SIZE,
			modifiers,
			clock: { running: false, rate: 20, tick: 0, lanes: [] },
			osc: { send: (path, ...args) => sent.push({ path, args }) },
			setShift: () => {},
		},
		(frame, reason) => frames.push({ frame, reason }),
		{
			onPageFocus: (slot) => announced.push(slot),
			onPersist: (slot, patch) => persisted.push({ slot, patch }),
		},
	)
	pm.load(0 as Slot, () => new IsoHotPage())
	for (let s = 1; s < 8; s++) pm.load(s as Slot, () => new BlankHotPage())
	pm.focus(0 as Slot)
	const notes = () => sent.filter((m) => m.path.endsWith("/note"))
	const key = (x: number, y: number, s: 0 | 1) => pm.onKey({ x, y, s })
	const tap = (x: number, y: number) => { key(x, y, 1); key(x, y, 0) }
	return { pm, sent, notes, announced, persisted, frames, key, tap }
}

describe("hotelier page selector (column 0)", () => {
	it("a press on rows 0-5 focuses slots a-f and announces it", () => {
		const r = rig()
		r.key(0, 3, 1)
		expect(r.pm.focusedSlot).toBe(3)
		expect(r.announced).toEqual([3])
		r.key(0, 3, 0) // the release lands on the new page and does nothing
		r.key(0, 0, 1) // blank-hot's selector brings us back
		expect(r.pm.focusedSlot).toBe(0)
		expect(r.announced).toEqual([3, 0])
	})

	it("rows 6-7, releases and the current slot never switch pages", () => {
		const r = rig()
		r.key(0, 6, 1)
		r.key(0, 7, 1)
		r.key(0, 0, 1)
		r.key(0, 2, 0)
		expect(r.pm.focusedSlot).toBe(0)
		expect(r.announced).toEqual([])
	})

	it("switching paints the NEW page, not the old one", () => {
		const r = rig()
		r.key(0, 2, 1)
		const last = r.frames.at(-1)!
		expect(last.reason).toBe("focus")
		expect(at(last.frame, 0, 2)).toBe(12) // blank-hot in slot c lights its own row
		expect(at(last.frame, 5, 5)).toBe(0) // and no keyboard
	})

	it("lights own slot bright, other selectable slots dim, rows 6-7 dark", () => {
		const r = rig()
		const f = r.pm.renderFocused()
		expect(at(f, 0, 0)).toBe(12)
		for (let y = 1; y < 6; y++) expect(at(f, 0, y)).toBe(2)
		expect(at(f, 0, 6)).toBe(0) // unassigned in iso-hot
		expect(at(f, 0, 7)).toBe(2) // iso-hot's transposer toggle, idle
	})
})

describe("iso-hot keyboard", () => {
	it("column 0 never plays; the keyboard's home (step 0) is column 1, bottom row", () => {
		const r = rig()
		r.key(0, 6, 1)
		expect(r.notes()).toEqual([])
		r.key(1, 7, 1)
		expect(r.notes()[0].args.slice(0, 2)).toEqual([0, 1])
		r.key(1, 7, 0)
		r.key(4, 6, 1) // 3 right, 1 up at vertical 5
		expect(r.notes().at(-1)!.args[0]).toBe(8)
	})

	it("control columns 13-15 are untouched by the shift", () => {
		const r = rig()
		r.key(12, 7, 1)
		expect(r.notes()[0].args[0]).toBe(11) // last keyboard column
		r.key(12, 7, 0)
		const before = r.notes().length
		r.key(13, 0, 1) // chord preset slot, empty → no note
		r.key(13, 0, 0)
		expect(r.notes().length).toBe(before)
	})

	it("leaving the page releases held notes", () => {
		const r = rig()
		r.key(5, 7, 1)
		r.key(0, 1, 1)
		const offs = r.notes().filter((m) => m.args[1] === 0)
		expect(offs.map((m) => m.args[0])).toEqual([4])
	})
})

describe("blank-hot", () => {
	it("draws only the selector", () => {
		const f = makeFrame(SIZE)
		const r = rig()
		r.key(0, 4, 1)
		const g = r.pm.renderFocused()!
		for (let i = 0; i < f.length; i++) if (i % 16 !== 0) expect(g[i]).toBe(0)
	})
})

describe("iso-hot transposer", () => {
	const noteOns = (r: ReturnType<typeof rig>) => r.notes().filter((m) => m.args[1] === 1).map((m) => m.args[0])
	const transposeTo = (r: ReturnType<typeof rig>, col: number) => {
		r.tap(0, 7) // show
		r.tap(col, 7)
		r.tap(0, 7) // hide again — the transposition stays
	}

	it("shows on the bottom row with col 8 lit; the row stops playing while shown", () => {
		const r = rig()
		r.tap(0, 7)
		const f = r.pm.renderFocused()
		expect(at(f, 8, 7)).toBe(15)
		expect(at(f, 1, 7)).toBe(2)
		expect(at(f, 0, 7)).toBe(12)
		r.tap(3, 7)
		expect(r.notes()).toEqual([])
		expect(r.sent.filter((m) => m.path.endsWith("/transpose")).at(-1)!.args).toEqual([-5])
	})

	it("transposes new key presses, keeps it after hiding, and marks the toggle", () => {
		const r = rig()
		transposeTo(r, 10) // +2
		r.tap(1, 7)
		expect(noteOns(r)).toEqual([2])
		expect(at(r.pm.renderFocused(), 0, 7)).toBe(6)
	})

	it("never re-pitches a note that is already sounding", () => {
		const r = rig()
		r.key(1, 6, 1) // step 5, held
		r.tap(0, 7)
		r.tap(9, 7) // +1 while holding
		r.key(1, 6, 0)
		expect(r.notes().map((m) => m.args.slice(0, 2))).toEqual([[5, 1], [5, 0]])
	})

	it("chords play relative to the transposition they were saved at; opt-out plays as stored", () => {
		const r = rig()
		transposeTo(r, 10) // +2
		r.tap(15, 4) // sustain toggle on = armed
		r.key(1, 6, 1) // sounds 5+2 = 7
		r.key(1, 6, 0)
		r.tap(13, 0) // save → [7] at t=+2
		r.tap(15, 4) // toggle off, releases
		r.sent.length = 0
		r.tap(13, 0) // play at the same +2 → as saved
		expect(noteOns(r)).toEqual([7])
		transposeTo(r, 8) // 0 → two below
		r.sent.length = 0
		r.tap(13, 0)
		expect(noteOns(r)).toEqual([5])
		r.pm.routeOscToPage(0 as Slot, "/setting/transposeChords", [0])
		r.sent.length = 0
		r.tap(13, 0)
		expect(noteOns(r)).toEqual([7])
	})

	it("saving or clearing a chord persists just the chord state", () => {
		const r = rig()
		r.tap(15, 4)
		r.key(2, 7, 1)
		r.key(2, 7, 0)
		r.tap(13, 3)
		expect(r.persisted).toHaveLength(1)
		const patch = r.persisted[0].patch as any
		expect(Object.keys(patch).sort()).toEqual(["chordTranspose", "chords"])
		expect(patch.chords[3]).toEqual([1])
		expect(r.persisted[0].slot).toBe(0)
	})

	it("round-trips chord transpositions through serialize/restore", () => {
		const a = rig()
		transposeTo(a, 10)
		a.tap(15, 4)
		a.key(1, 7, 1)
		a.key(1, 7, 0)
		a.tap(13, 1)
		const cfg = a.pm.serialize(0 as Slot) as any
		expect(cfg.chordTranspose[1]).toBe(2)
		const b = rig()
		b.pm.load(0 as Slot, () => new IsoHotPage(), cfg)
		b.sent.length = 0
		b.tap(13, 1) // b is at 0, chord saved at +2 → shifted down 2
		expect(noteOns(b)).toEqual([0])
	})
})

describe("iso-hot loop transposition", () => {
	beforeEach(() => { vi.useFakeTimers() })
	afterEach(() => { vi.useRealTimers() })

	const onsIn = (r: ReturnType<typeof rig>, ms: number) => {
		r.sent.length = 0
		vi.advanceTimersByTime(ms)
		return r.notes().filter((m) => m.args[1] === 1).map((m) => m.args[0])
	}
	const tr = (r: ReturnType<typeof rig>) => r.sent.filter((m) => m.path.endsWith("/transpose")).map((m) => m.args[0])

	// Looper 0 (col 15 row 0): note, transposer → +3, the same key again. 600ms loop.
	const recordGesture = (r: ReturnType<typeof rig>) => {
		r.tap(0, 7) // show the transposer
		r.tap(15, 0) // arm
		r.key(3, 6, 1) // finger step 7, heard 7
		vi.advanceTimersByTime(50)
		r.key(3, 6, 0)
		vi.advanceTimersByTime(150)
		r.tap(11, 7) // +3, recorded as a gesture at ~200ms
		vi.advanceTimersByTime(100)
		r.key(3, 6, 1) // heard 10
		vi.advanceTimersByTime(50)
		r.key(3, 6, 0)
		vi.advanceTimersByTime(250)
		r.tap(15, 0) // close → playing
	}

	it("stores notes untransposed with the move alongside", () => {
		const r = rig()
		recordGesture(r)
		const take = (r.pm.serialize(0 as Slot) as any).patterns[0].events
		expect(take.filter((e: any) => e.on && e.ctl === undefined).map((e: any) => e.step)).toEqual([7, 7])
		expect(take.filter((e: any) => e.ctl !== undefined).map((e: any) => e.ctl)).toEqual([3])
	})

	it("replays the move into the live transposer, and the transposer shifts the loop's own notes", () => {
		const r = rig()
		recordGesture(r)
		r.tap(8, 7) // back to 0 by hand — holds until the loop's next move
		r.sent.length = 0
		const lap = onsIn(r, 600)
		expect(lap).toEqual([7, 10]) // sounds exactly as played
		expect(tr(r)).toContain(3)
		// Your hands follow what the loop set.
		r.tap(0, 7) // hide so the bottom row plays
		r.sent.length = 0
		r.key(1, 7, 1)
		expect(r.notes()[0].args[0]).toBe(3)
	})

	it("transposeLoops off: the loop still moves the transposer but its notes ignore it", () => {
		const r = rig()
		recordGesture(r)
		r.pm.routeOscToPage(0 as Slot, "/setting/transposeLoops", [0])
		expect(onsIn(r, 600)).toEqual([7, 7])
	})

	it("loop playback is never recorded into another looper", () => {
		const r = rig()
		recordGesture(r)
		r.tap(15, 1) // arm looper 1 while looper 0 plays its move
		vi.advanceTimersByTime(700)
		r.tap(15, 1) // close: nothing was played by hand → back to empty
		const p = (r.pm.serialize(0 as Slot) as any).patterns[1]
		expect(p.events).toEqual([])
	})
})

describe("presetStore.persistSlot", () => {
	it("merges only the patch into the active preset, and writes the live layout", () => {
		const dir = mkdtempSync(join(tmpdir(), "gridmapper-hot-"))
		mkdirSync(join(dir, "presets"))
		const preset = defaultSystemConfig()
		preset.slots.a = { page: "iso-hot", config: { npo: 12, chords: [] } }
		writeFileSync(join(dir, "presets", "hotelier.json"), JSON.stringify(preset))
		const store = createPresetStore(dir)
		store.setActive(preset, "hotelier")

		const live = defaultSystemConfig()
		live.slots.a = { page: "iso-hot", config: { npo: 19, chords: [[1]] } }
		store.persistSlot(live, "a", { chords: [[1]] })

		const saved = JSON.parse(readFileSync(join(dir, "presets", "hotelier.json"), "utf8"))
		expect(saved.slots.a.config).toEqual({ npo: 12, chords: [[1]] }) // npo NOT baked in
		const slots = JSON.parse(readFileSync(join(dir, "slots.json"), "utf8"))
		expect(slots.activePreset).toBe("hotelier")
		expect(slots.slots.a.config.npo).toBe(19)
	})

	it("leaves the preset alone when its slot holds a different page", () => {
		const dir = mkdtempSync(join(tmpdir(), "gridmapper-hot-"))
		mkdirSync(join(dir, "presets"))
		const preset = defaultSystemConfig()
		writeFileSync(join(dir, "presets", "p.json"), JSON.stringify(preset))
		const store = createPresetStore(dir)
		store.setActive(preset, "p")
		const live = defaultSystemConfig()
		live.slots.a = { page: "iso-hot", config: {} }
		store.persistSlot(live, "a", { chords: [[1]] })
		const saved = JSON.parse(readFileSync(join(dir, "presets", "p.json"), "utf8"))
		expect(saved.slots.a.config).toBeUndefined()
	})
})
