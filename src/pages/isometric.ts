/* Page: Isometric
 * ------------------------------------------------------------------------------
 * Summary : Isomorphic keyboard on the left 13×8. Fixed "bass" (fourths) tuning.
 * Input   : press a key → note on (OSC) + that cell lights to 13; release → note off.
 * Display : normal keys = brightness 2, root keys = 8, currently-held = 13.
 *           Columns 13–15 (off the keyboard) stay dark.
 * Settings: rowInterval / baseNote / velocity — declared, fixed for now (wire later).
 * Rules   : columns 0..12 are the keyboard; x≥13 ignored. Sends note-offs on blur so
 *           a page switch never leaves a hung note in Max.
 * ------------------------------------------------------------------------------
 * Tuning: moving one column right = +1 semitone (chromatic, 12 notes/octave);
 * moving one row UP (toward the top, smaller y) = +5 semitones (a perfect fourth).
 * The bottom-left cell is `baseNote` (E1, bass low E). "Root keys" are every cell
 * whose pitch class matches baseNote's, highlighted brighter.
 *
 * OSC out follows the twister convention (prefix /grid/out/page/<slot>/…), with a
 * MIDI-friendly payload since a keyboard emits many dynamic notes:
 *   /grid/out/page/<slot>/note <midiNote> <velocity>   (velocity 0 = note off)
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
import type { PageModule } from "../core/pageModule.js"

const KEYS_W = 13 // keyboard occupies the left 13 columns
const BASE_NOTE = 28 // E1 — bass low E, the bottom-left cell
const HORIZ = 1 // +1 semitone per column (chromatic, 12 notes/octave)
const ROW_INTERVAL = 5 // +5 semitones per row going up (perfect fourth — "bass tuning")
const VELOCITY = 100 // grid keys are binary; fixed on-velocity

const LVL_NORMAL = 2
const LVL_ROOT = 8
const LVL_HELD = 13

const ROOT_PC = ((BASE_NOTE % 12) + 12) % 12

/** MIDI note for cell (x, y). Bottom-left = BASE_NOTE; up a row = +ROW_INTERVAL. */
export function noteAt(x: number, y: number, height: number): number {
	const rowsUp = height - 1 - y
	return BASE_NOTE + x * HORIZ + rowsUp * ROW_INTERVAL
}

/** Is this note a root (same pitch class as the base note)? */
export const isRoot = (note: number): boolean => ((note % 12) + 12) % 12 === ROOT_PC

export class IsometricPage implements Page {
	private size: GridSize = { width: 16, height: 8 }
	private keysW = KEYS_W
	private held = new Set<number>() // ledIndex of currently-held keyboard cells

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
			ctx.osc.send(`/grid/out/page/${ctx.slotLabel}/note`, noteAt(x, y, this.size.height), 0)
		}
		this.held.clear()
	}

	onKey(ev: KeyEvent, ctx: PageContext) {
		if (ev.x < 0 || ev.x >= this.keysW || ev.y < 0 || ev.y >= this.size.height) return
		const i = ledIndex(this.size, ev.x, ev.y)
		const note = noteAt(ev.x, ev.y, this.size.height)
		if (ev.s) {
			this.held.add(i)
			ctx.osc.send(`/grid/out/page/${ctx.slotLabel}/note`, note, VELOCITY)
		} else {
			this.held.delete(i)
			ctx.osc.send(`/grid/out/page/${ctx.slotLabel}/note`, note, 0)
		}
	}

	render(): LedFrame {
		const f = makeFrame(this.size)
		for (let y = 0; y < this.size.height; y++) {
			for (let x = 0; x < this.keysW; x++) {
				const i = ledIndex(this.size, x, y)
				let lvl = isRoot(noteAt(x, y, this.size.height)) ? LVL_ROOT : LVL_NORMAL
				if (this.held.has(i)) lvl = LVL_HELD
				f[i] = lvl
			}
		}
		return f
	}

	dispose() {}

	private announce(ctx: PageContext) {
		ctx.osc.send(`/grid/out/page/${ctx.slotLabel}/type`, "isometric")
	}
}

export const page: PageModule = {
	name: "isometric",
	label: "Isometric",
	create: () => new IsometricPage(),
	// Declared now, wired later. These are the knobs the tuning will expose.
	settings: [
		{ key: "rowInterval", label: "row interval", type: "number", min: 1, max: 12, step: 1, default: ROW_INTERVAL },
		{ key: "baseNote", label: "base note", type: "number", min: 0, max: 127, step: 1, default: BASE_NOTE },
		{ key: "velocity", label: "velocity", type: "number", min: 1, max: 127, step: 1, default: VELOCITY },
	],
}
