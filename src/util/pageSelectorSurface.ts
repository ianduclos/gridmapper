/* Left column (idk.surface): the system's column on every surface page.
 * ------------------------------------------------------------------------------
 * The grammar every surface page shares (idk.surface spec 2026-11-11, section 1):
 *
 *   y0  iso            (slot a)
 *   y1  PLAY           (slot c)
 *   y2  Twister        hold = the Twister's page chooser
 *   y3  free           the page's own
 *   y4  free           the page's own
 *   y5  home           (slot f: set-surface until a home page is built)
 *   y6  shift 2
 *   y7  shift 1
 *
 * Slots keep their letters, because idk.surface names iso, cells and set by slot. The cells
 * page (slot b) has no key for now: it stays loaded and reachable over OSC.
 *
 * The rest of the grammar is the pages' to keep: lanes 1-8 are columns x4-x11, the far
 * right is the page's own, a hold means "for now" and a tap "stay", and shift 1 plus a
 * thing is that thing's way back or its store.
 *
 * A page opts in with three calls: `if (selectorKey(ev, ctx)) return` then
 * `if (shiftKey(ev, ctx)) return` at the top of onKey, and `drawSelector(frame, ctx)` at
 * the end of render(). A page that must see the shift key itself (cells-surface reads its
 * partner before the shift lands; play-surface times shift 2) handles that key before
 * calling shiftKey. `releaseShifts(ctx)` belongs in onBlur.
 *
 * A fork of util/pageSelector.ts (the hotelier one): own twisterHeld, nothing imported
 * from the original, so the Max pages never change with this file.
 */

import { type KeyEvent, type LedFrame, type PageContext, type Slot, ledIndex } from "../core/types.js"
import type { KeySpec } from "../core/pageModule.js"

export const SELECTOR_COL = 0
/** Row → the slot it focuses. */
export const SELECTOR_SLOT_AT_ROW: ReadonlyMap<number, Slot> = new Map<number, Slot>([
	[0, 0], // iso
	[1, 2], // PLAY
	[5, 5], // home
])
export const PLAY_SLOT: Slot = 2
export const TWISTER_ROW = 2
/** The two rows a page may use for itself. */
export const FREE_ROWS = [3, 4] as const
export const SHIFT2_ROW = 6
export const SHIFT1_ROW = 7
export const TWISTER_OVERLAY_PATH = "/twister/in/overlay"
export const TWISTER_FOCUS_PATH = "/twister/in/focus/page"

const LVL_SELF = 12
const LVL_OTHER = 2
const LVL_TWISTER = 5 // apart from the page keys at a glance
const LVL_TWISTER_HELD = 15
export const LVL_SHIFT_IDLE = 6 // findable by eye, apart from the page keys
export const LVL_SHIFT_HELD = 15

/** Shared across pages: the key may be released on a different page than it was pressed on. */
let twisterHeld = false

/** The column's cheat-sheet entries; pages spread them into their keymap. */
export const SELECTOR_KEYS: KeySpec[] = [
	{ x: 0, y: 0, name: "Iso", help: "Jump to the iso keyboard. Lit when you're on it.", lit: LVL_OTHER },
	{ x: 0, y: 1, name: "Play", help: "Jump to the PLAY page. Lit when you're on it.", lit: LVL_OTHER },
	{ x: 0, y: TWISTER_ROW, name: "Twister pages", short: "Twister", help: "Hold to show the Twister's page chooser; pick a page on the Twister, let go to close.", lit: LVL_TWISTER },
	{ x: 0, y: 5, name: "Home", help: "Jump to home (the set page for now). Lit when you're on it.", lit: LVL_OTHER },
	{ x: 0, y: SHIFT2_ROW, name: "Shift 2", short: "Shift 2", help: "The second shift.", lit: LVL_SHIFT_IDLE },
	{ x: 0, y: SHIFT1_ROW, name: "Shift 1", short: "Shift 1", help: "Hold, then press a thing: its way back, or its store.", lit: LVL_SHIFT_IDLE },
]

/** Handle a page or Twister key of the column. True = consumed; the page stops. */
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
	const slot = SELECTOR_SLOT_AT_ROW.get(ev.y)
	if (slot === undefined) return false
	if (ev.s === 1 && slot !== ctx.slot) ctx.focus(slot)
	return true
}

/** Which shift (1 | 2) this key is, or 0. */
export const shiftAt = (ev: KeyEvent): 0 | 1 | 2 =>
	ev.x !== SELECTOR_COL ? 0 : ev.y === SHIFT1_ROW ? 1 : ev.y === SHIFT2_ROW ? 2 : 0

/** Handle the two shift keys. True = it was one of them. */
export function shiftKey(ev: KeyEvent, ctx: PageContext): boolean {
	const which = shiftAt(ev)
	if (!which) return false
	ctx.setShift(which, ev.s === 1)
	return true
}

/** For onBlur: a shift must not linger on the page you left. */
export function releaseShifts(ctx: PageContext): void {
	ctx.setShift(1, false)
	ctx.setShift(2, false)
}

/** Paint the system's keys of column 0 (the free rows are untouched). */
export function drawSelector(f: LedFrame, ctx: PageContext): void {
	const h = ctx.size.height
	for (const [y, slot] of SELECTOR_SLOT_AT_ROW) {
		if (y < h) f[ledIndex(ctx.size, SELECTOR_COL, y)] = slot === ctx.slot ? LVL_SELF : LVL_OTHER
	}
	if (TWISTER_ROW < h) f[ledIndex(ctx.size, SELECTOR_COL, TWISTER_ROW)] = twisterHeld ? LVL_TWISTER_HELD : LVL_TWISTER
	if (SHIFT2_ROW < h) f[ledIndex(ctx.size, SELECTOR_COL, SHIFT2_ROW)] = ctx.modifiers?.shift2 ? LVL_SHIFT_HELD : LVL_SHIFT_IDLE
	if (SHIFT1_ROW < h) f[ledIndex(ctx.size, SELECTOR_COL, SHIFT1_ROW)] = ctx.modifiers?.shift1 ? LVL_SHIFT_HELD : LVL_SHIFT_IDLE
}
