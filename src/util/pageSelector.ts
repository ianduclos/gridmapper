/* Page selector: column 0 as a slot switcher, shared by the hotelier pages.
 * ------------------------------------------------------------------------------
 * Rows 0..SELECTOR_SLOTS-1 of column 0 focus slots a..f. A press switches; releases are
 * ignored. The rows BELOW (6-7) are not the selector's: they are per-page assignable keys
 * — selectorKey() lets them through and drawSelector() leaves them to the page. The page you are on is lit bright,
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
	if (ev.x !== SELECTOR_COL || ev.y >= SELECTOR_SLOTS) return false
	if (ev.s === 1 && ev.y !== ctx.slot) ctx.focus(ev.y as Slot)
	return true
}

/** Paint the selector rows of column 0 (the page's own rows below are untouched). */
export function drawSelector(f: LedFrame, ctx: PageContext): void {
	for (let y = 0; y < Math.min(SELECTOR_SLOTS, ctx.size.height); y++) {
		f[ledIndex(ctx.size, SELECTOR_COL, y)] = y === ctx.slot ? LVL_SELF : LVL_OTHER
	}
}
