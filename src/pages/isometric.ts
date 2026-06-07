/* Page: Isometric
 * ------------------------------------------------------------------------------
 * Summary : Isomorphic keyboard on the left 13×8 — a pure integer "step field".
 *           Each key has a step index; we emit the NUMBER, Max owns step→pitch.
 * Input   : press a keyboard key → /grid/out/page/<slot>/note <step> 1; release → 0.
 *           Right-edge control keys (test): bottom-right = shift 1, the cell above
 *           it = shift 2 (sustain pedal). Both route through ctx.setShift, so a
 *           local shift behaves exactly like one sent over OSC.
 * Display : keys = brightness 2, octave-root keys = 8, held = 13, sustained = 6.
 *           Control keys: dim when off, bright when on. Columns 13–14 stay dark.
 * Settings: npo (notes per octave) · vertical (steps per row). Live, two-way over OSC.
 * Rules   : keyboard = columns 0..(keysW-1); right-edge controls only exist when
 *           there's a dead zone. Releases everything (held + sustained) on blur so a
 *           page switch never strands a note in Max.
 * ------------------------------------------------------------------------------
 * Step field: one column right = +1 step; one row UP = +`vertical` steps. Bottom-left
 * is step 0. We send only the step integer + an on/off flag — no pitch, no velocity.
 * `npo` does NOT change the step we emit; it sets the octave size for root highlighting
 * and is shared with Max (in: /grid/in/page/<slot>/setting/npo <n>; out: /settings).
 *
 * Sustain (shift 2): while held, a keyboard release does NOT send a note-off — the
 * note is parked in `sustained`. When sustain falls, every parked note is released.
 * Re-pressing a sustained note re-arms it as held. Sustain reads ctx.modifiers.shift2,
 * so it works whether the pedal is the local control key OR an external OSC shift.
 */

import {
	type Page,
	type PageContext,
	type KeyEvent,
	type LedFrame,
	type GridSize,
	makeFrame,
	ledIndex,
} from "../core/types.js"
import type { PageModule, SettingSpec } from "../core/pageModule.js"
import { clamp } from "../util/scale.js"

const KEYS_W = 13 // keyboard occupies the left 13 columns
const BASE_STEP = 0 // bottom-left cell = step 0

const LVL_NORMAL = 2
const LVL_ROOT = 8
const LVL_HELD = 13
const LVL_SUSTAIN = LVL_HELD // sustained notes look the same as a press
const LVL_SHIFT = 1 // control keys are faint markers

// Single source of truth: drives both runtime clamping and the page descriptor.
const SPECS: SettingSpec[] = [
	{ key: "npo", label: "notes / octave", type: "number", min: 1, max: 48, step: 1, default: 12 },
	{ key: "vertical", label: "vertical interval", type: "number", min: 1, max: 24, step: 1, default: 5 },
]
const SPEC_BY_KEY = new Map(SPECS.map((s) => [s.key, s]))

/** Step index for cell (x, y). Bottom-left = baseStep; up a row = +vertical. */
export function stepAt(x: number, y: number, height: number, vertical: number, baseStep = BASE_STEP): number {
	const rowsUp = height - 1 - y
	return baseStep + x + rowsUp * vertical
}

/** Is this step an octave root (step ≡ 0 mod npo)? Display-only. */
export const isRootStep = (step: number, npo: number): boolean => ((step % npo) + npo) % npo === 0

export class IsometricPage implements Page {
	private size: GridSize = { width: 16, height: 8 }
	private keysW = KEYS_W
	private held = new Set<number>() // ledIndex of currently-held keyboard cells
	private sustained = new Set<number>() // released-but-held by the sustain pedal
	private prevSustain = false

	// Live settings (defaults from SPECS).
	private npo = SPEC_BY_KEY.get("npo")!.default as number
	private vertical = SPEC_BY_KEY.get("vertical")!.default as number

	init(ctx: PageContext) {
		this.size = ctx.size
		this.keysW = Math.min(KEYS_W, this.size.width)
		this.held.clear()
		this.sustained.clear()
		this.prevSustain = false
		this.announce(ctx)
	}

	onFocus(ctx: PageContext) {
		this.announce(ctx)
	}

	onBlur(ctx: PageContext) {
		// Release everything (held + sustained) so a page switch can't strand a note.
		for (const i of this.held) this.sendNote(ctx, i, false)
		for (const i of this.sustained) this.sendNote(ctx, i, false)
		this.held.clear()
		this.sustained.clear()
		this.prevSustain = false
		// Drop our shifts so they don't linger after we leave the page.
		ctx.setShift(1, false)
		ctx.setShift(2, false)
	}

	onKey(ev: KeyEvent, ctx: PageContext) {
		// Right-edge control keys → local shifts (route through the shared ShiftInput).
		if (this.isShift1(ev.x, ev.y)) { ctx.setShift(1, !!ev.s); return }
		if (this.isShift2(ev.x, ev.y)) { ctx.setShift(2, !!ev.s); return }

		if (ev.x < 0 || ev.x >= this.keysW || ev.y < 0 || ev.y >= this.size.height) return
		const i = ledIndex(this.size, ev.x, ev.y)
		if (ev.s) {
			this.sustained.delete(i) // re-pressing a sustained note re-arms it as held
			this.held.add(i)
			this.sendNote(ctx, i, true)
		} else {
			this.held.delete(i)
			if (ctx.modifiers.shift2) this.sustained.add(i) // sustain: defer the note-off
			else this.sendNote(ctx, i, false)
		}
	}

	// Settings in from Max / the web panel. Accepts, in order of preference:
	//   /setting/<key> <v> · /<key> <v> · /<key>/<v> · /settings/get
	onOsc(path: string, args: any[], ctx: PageContext) {
		const parts = path.split("/").filter(Boolean)
		let i = 0
		if (parts[i] === "setting" || parts[i] === "settings") i++
		const key = parts[i]
		if (!key) return
		if (key === "get") {
			this.emitSettings(ctx)
			return
		}
		const raw = args.length ? args[0] : parts[i + 1]
		const value = Number(raw)
		if (!Number.isFinite(value)) return
		if (!this.applySetting(key, value)) return
		this.emitSettings(ctx)
	}

	render(ctx: PageContext): LedFrame {
		// Sustain pedal (shift 2): on its falling edge, release everything sustained.
		const sustain = ctx.modifiers.shift2
		if (this.prevSustain && !sustain) {
			for (const i of this.sustained) this.sendNote(ctx, i, false)
			this.sustained.clear()
		}
		this.prevSustain = sustain

		const f = makeFrame(this.size)
		for (let y = 0; y < this.size.height; y++) {
			for (let x = 0; x < this.keysW; x++) {
				const i = ledIndex(this.size, x, y)
				let lvl = isRootStep(this.step(x, y), this.npo) ? LVL_ROOT : LVL_NORMAL
				if (this.sustained.has(i)) lvl = LVL_SUSTAIN
				if (this.held.has(i)) lvl = LVL_HELD
				f[i] = lvl
			}
		}
		// Control keys on the right edge (only when a dead zone exists): faint markers.
		if (this.hasControls()) {
			const w = this.size.width, h = this.size.height
			f[ledIndex(this.size, w - 1, h - 1)] = LVL_SHIFT
			f[ledIndex(this.size, w - 1, h - 2)] = LVL_SHIFT
		}
		return f
	}

	serialize() {
		return { npo: this.npo, vertical: this.vertical }
	}

	dispose() {}

	private step(x: number, y: number): number {
		return stepAt(x, y, this.size.height, this.vertical)
	}

	private sendNote(ctx: PageContext, i: number, on: boolean) {
		const x = i % this.size.width
		const y = Math.floor(i / this.size.width)
		ctx.osc.send(`/grid/out/page/${ctx.slotLabel}/note`, this.step(x, y), on ? 1 : 0)
	}

	// Control keys live on the right edge, but only when there's a dead zone right of
	// the keyboard (so we never steal a playing cell on a narrow grid).
	private hasControls(): boolean {
		return this.size.width - 1 >= this.keysW
	}
	private isShift1(x: number, y: number): boolean {
		return this.hasControls() && x === this.size.width - 1 && y === this.size.height - 1
	}
	private isShift2(x: number, y: number): boolean {
		return this.hasControls() && x === this.size.width - 1 && y === this.size.height - 2
	}

	/** Clamp+store one setting; returns true if it was a known key. */
	private applySetting(key: string, value: number): boolean {
		const spec = SPEC_BY_KEY.get(key)
		if (!spec) return false
		const v = clamp(Math.round(value), spec.min ?? 1, spec.max ?? value)
		if (key === "npo") this.npo = v
		else if (key === "vertical") this.vertical = v
		return true
	}

	private announce(ctx: PageContext) {
		ctx.osc.send(`/grid/out/page/${ctx.slotLabel}/type`, "isometric")
		this.emitSettings(ctx)
	}

	private emitSettings(ctx: PageContext) {
		ctx.osc.send(
			`/grid/out/page/${ctx.slotLabel}/settings`,
			JSON.stringify({ npo: this.npo, vertical: this.vertical })
		)
	}
}

export const page: PageModule = {
	name: "isometric",
	label: "Isometric",
	create: () => new IsometricPage(),
	settings: SPECS,
}
