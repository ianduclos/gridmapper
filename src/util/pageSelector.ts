/* Page selector: column 0 as a slot switcher, shared by the hotelier pages.
 * ------------------------------------------------------------------------------
 * Rows 0..SELECTOR_ROWS-1 of column 0 focus a slot each — a b c d f (Ian, 2026-09-22:
 * set-hot moved up from row 5 to row 4; it STAYS in slot f, because Max addresses it as
 * /grid/out/page/f, and blank slot e simply drops off the column). A press switches;
 * releases are ignored. The page you are on is lit bright, the others dim, so the column
 * doubles as a "where am I" readout.
 *
 * Row 5 is the TWISTER key: held, it shows the Twister's page chooser (its Main overlay)
 * — /twister/in/overlay 1 on press, 0 on release, sent straight to twistermapper.
 *
 * Rows 6-7 are not the selector's: they are per-page assignable keys — selectorKey()
 * lets them through and drawSelector() leaves them to the page.
 *
 * A page opts in with two calls: `if (selectorKey(ev, ctx)) return` at the top of
 * onKey, and `drawSelector(frame, ctx)` at the end of render().
 */

import { type KeyEvent, type LedFrame, type PageContext, type Slot, ledIndex } from "../core/types.js"
import type { KeySpec } from "../core/pageModule.js"

export const SELECTOR_COL = 0
/** Row → the slot it focuses. */
export const SELECTOR_SLOTS: readonly Slot[] = [0, 1, 2, 3, 5] as Slot[]
export const TWISTER_ROW = 5
export const TWISTER_OVERLAY_PATH = "/twister/in/overlay"

const LVL_SELF = 12
const LVL_OTHER = 2
const LVL_TWISTER = 5 // apart from the page keys at a glance
const LVL_TWISTER_HELD = 15

/** Shared across pages: the key may be released on a different page than it was pressed on. */
let twisterHeld = false

/** The selector's cheat-sheet entries; pages spread them into their keymap. */
export const SELECTOR_KEYS: KeySpec[] = [
	{ x: 0, y: 0, h: SELECTOR_SLOTS.length, name: "Pages a b c d f", short: "Pages", help: "Jump to a page. The lit key is the page you're on. Row 4 is set-hot (slot f).", lit: [LVL_SELF, LVL_OTHER, LVL_OTHER, LVL_OTHER, LVL_OTHER] },
	{ x: 0, y: TWISTER_ROW, name: "Twister pages", short: "Twister", help: "Hold to show the Twister's page chooser; pick a page on the Twister, let go to close.", lit: LVL_TWISTER },
]

/** Handle a key if it belongs to the selector column. True = consumed; the page stops. */
export function selectorKey(ev: KeyEvent, ctx: PageContext): boolean {
	if (ev.x !== SELECTOR_COL) return false
	if (ev.y === TWISTER_ROW) {
		const held = ev.s === 1
		if (held !== twisterHeld) {
			twisterHeld = held
			ctx.osc.send(TWISTER_OVERLAY_PATH, held ? 1 : 0)
			ctx.setDirty()
		}
		return true
	}
	if (ev.y >= SELECTOR_SLOTS.length) return false
	const slot = SELECTOR_SLOTS[ev.y]
	if (ev.s === 1 && slot !== ctx.slot) ctx.focus(slot)
	return true
}

/** Paint the selector rows of column 0 (the page's own rows below are untouched). */
export function drawSelector(f: LedFrame, ctx: PageContext): void {
	for (let y = 0; y < Math.min(SELECTOR_SLOTS.length, ctx.size.height); y++) {
		f[ledIndex(ctx.size, SELECTOR_COL, y)] = SELECTOR_SLOTS[y] === ctx.slot ? LVL_SELF : LVL_OTHER
	}
	if (TWISTER_ROW < ctx.size.height) {
		f[ledIndex(ctx.size, SELECTOR_COL, TWISTER_ROW)] = twisterHeld ? LVL_TWISTER_HELD : LVL_TWISTER
	}
}
