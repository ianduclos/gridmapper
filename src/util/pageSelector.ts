/* Page selector: column 0 as a slot switcher, shared by the hotelier pages.
 * ------------------------------------------------------------------------------
 * Rows 0..SELECTOR_SLOTS-1 of column 0 focus slots a..f. A press switches; releases
 * and the rows below are ignored (and stay dark). The page you are on is lit bright,
 * the others dim, so the column doubles as a "where am I" readout.
 *
 * A page opts in with two calls: `if (selectorKey(ev, ctx)) return` at the top of
 * onKey, and `drawSelector(frame, ctx)` at the end of render().
 */

import { type KeyEvent, type LedFrame, type PageContext, type Slot, ledIndex } from "../core/types.js"

export const SELECTOR_COL = 0
export const SELECTOR_SLOTS = 6 // a..f

const LVL_SELF = 12
const LVL_OTHER = 2

/** Handle a key if it belongs to the selector column. True = consumed; the page stops. */
export function selectorKey(ev: KeyEvent, ctx: PageContext): boolean {
	if (ev.x !== SELECTOR_COL) return false
	if (ev.s === 1 && ev.y < SELECTOR_SLOTS && ev.y !== ctx.slot) ctx.focus(ev.y as Slot)
	return true
}

/** Paint the selector column over a frame (overwrites whatever was in column 0). */
export function drawSelector(f: LedFrame, ctx: PageContext): void {
	for (let y = 0; y < ctx.size.height; y++) {
		const lvl = y >= SELECTOR_SLOTS ? 0 : y === ctx.slot ? LVL_SELF : LVL_OTHER
		f[ledIndex(ctx.size, SELECTOR_COL, y)] = lvl
	}
}
