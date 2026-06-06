/* Page: Isometric
 * ------------------------------------------------------------------------------
 * Summary : Isomorphic keyboard on the left 13×8 — a pure integer "step field".
 *           Each key has a step index; we emit the NUMBER, Max owns step→pitch.
 * Input   : press a key → /grid/out/page/<slot>/note <step> 1; release → … <step> 0.
 *           That cell lights to 13 while held.
 * Display : normal keys = brightness 2, octave-root keys = 8, currently-held = 13.
 *           Columns 13–15 (off the keyboard) stay dark.
 * Settings: npo (notes per octave) · vertical (steps per row). Live, two-way over OSC.
 * Rules   : columns 0..12 are the keyboard; x≥13 ignored. Sends note-offs on blur so
 *           a page switch never leaves a hung note in Max.
 * ------------------------------------------------------------------------------
 * Step field: moving one column right = +1 step; moving one row UP (toward the top,
 * smaller y) = +`vertical` steps. The bottom-left cell is step 0. We send only the
 * step integer + an on/off flag — no pitch, no velocity. Max maps step→pitch using
 * the synth's tuning, and `npo` is shared so both ends agree on octave size.
 *
 * `npo` (notes per octave) does NOT change the step we emit. It only sets the octave
 * size used to highlight "root" keys (step ≡ 0 mod npo) and is exchanged with Max so
 * the grid's display reflects the synth in use. Max can push it in:
 *   /grid/in/page/<slot>/setting/npo <n>   (also tolerated: /grid/in/page/<slot>/npo/<n>)
 * and we echo current settings out:
 *   /grid/out/page/<slot>/settings {"npo":…,"vertical":…}
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

	// Live settings (defaults from SPECS).
	private npo = SPEC_BY_KEY.get("npo")!.default as number
	private vertical = SPEC_BY_KEY.get("vertical")!.default as number

	init(ctx: PageContext) {
		this.size = ctx.size
		this.keysW = Math.min(KEYS_W, this.size.width)
		this.held.clear()
		this.announce(ctx)
	}

	onFocus(ctx: PageContext) {
		this.announce(ctx)
	}

	onBlur(ctx: PageContext) {
		// Release everything held so a page switch doesn't strand a note on in Max.
		for (const i of this.held) {
			const x = i % this.size.width
			const y = Math.floor(i / this.size.width)
			ctx.osc.send(`/grid/out/page/${ctx.slotLabel}/note`, this.step(x, y), 0)
		}
		this.held.clear()
	}

	onKey(ev: KeyEvent, ctx: PageContext) {
		if (ev.x < 0 || ev.x >= this.keysW || ev.y < 0 || ev.y >= this.size.height) return
		const i = ledIndex(this.size, ev.x, ev.y)
		const step = this.step(ev.x, ev.y)
		if (ev.s) {
			this.held.add(i)
			ctx.osc.send(`/grid/out/page/${ctx.slotLabel}/note`, step, 1)
		} else {
			this.held.delete(i)
			ctx.osc.send(`/grid/out/page/${ctx.slotLabel}/note`, step, 0)
		}
	}

	// Settings in from Max / the web panel. Accepts, in order of preference:
	//   /setting/<key> <value> · /<key> <value> · /<key>/<value> · /settings/get
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

	render(): LedFrame {
		const f = makeFrame(this.size)
		for (let y = 0; y < this.size.height; y++) {
			for (let x = 0; x < this.keysW; x++) {
				const i = ledIndex(this.size, x, y)
				let lvl = isRootStep(this.step(x, y), this.npo) ? LVL_ROOT : LVL_NORMAL
				if (this.held.has(i)) lvl = LVL_HELD
				f[i] = lvl
			}
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
