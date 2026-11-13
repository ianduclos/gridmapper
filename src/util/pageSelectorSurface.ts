/* Left column (idk.surface): the system's column on every surface page.
 * ------------------------------------------------------------------------------
 * The grammar every surface page shares (idk.surface spec 2026-11-11, section 1):
 *
 *   y0  iso            (slot a)
 *   y1  PLAY           (slot c)
 *   y2  REEL pads      (slot d)
 *   y3  free           the page's own
 *   y4  home           (slot f)
 *   y5  Twister        the TWISTER OVERLAY on the grid (tap = stays, hold = for now)
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
 * THE TWISTER OVERLAY (Ian, 2026-11-13: "the twister key can open up an overlay in grid to
 * deal with the presets, A B, and maybe even focus the pages"). The Twister key opens it over
 * whatever page is in front, with x0 y6's rule on iso: it opens on the press; let go within
 * TW_TAP_MS it stays (a tap when open shuts it); held longer, or used while held, it shuts on
 * release. While open everything right of column 0 is the overlay's and the page under it
 * gets no key. On x4-x11:
 *   y0  the Twister's pages a-e (x4-x8)   /twister/in/focus/page <a-e>, lit = last pressed here
 *   y2  scene 1-8 onto the fader's A side  /surface/scene/a <n>, lit = the scene on A
 *   y3  scene 1-8 onto the fader's B side  /surface/scene/b <n>, lit = the scene on B
 *       either row, held TW_STORE_MS: store page 2 SET's dials into that scene (/surface/scene/store)
 *   y5  the A to B fader, eight positions  /surface/scene/fader <0..1>, lit up to where it is
 * Scenes and fader are idk.surface's, read over ctx.surface while open and on `values`. The
 * hold still tells the Twister to show its own chooser, as before. The state is this file's,
 * shared by every page, like twisterHeld.
 *
 * A fork of util/pageSelector.ts (the hotelier one): own twisterHeld, nothing imported
 * from the original, so the Max pages never change with this file.
 */

import { type KeyEvent, type LedFrame, type PageContext, type Slot, type SurfaceLink, float, ledIndex } from "../core/types.js"
import type { KeySpec } from "../core/pageModule.js"

export const SELECTOR_COL = 0
/** Row → the slot it focuses. */
export const SELECTOR_SLOT_AT_ROW: ReadonlyMap<number, Slot> = new Map<number, Slot>([
	[0, 0], // iso
	[1, 2], // PLAY
	[4, 5], // home
])
export const PLAY_SLOT: Slot = 2
/**
 * The REEL pads page (pages/reel-surface.ts, slot d) and its key on row y2. On since
 * the surface session confirmed the step line live in the running app (2026-11-11). Cells
 * (slot b) keeps its damp on that cell, so it shows no key for the page.
 */
export const REEL_PAGE_LIVE = true
export const REEL_SLOT: Slot = 3
export const REEL_ROW = 2
const reelKeyOn = (_ctx: PageContext) => REEL_PAGE_LIVE
export const HOME_ROW = 4
export const TWISTER_ROW = 5
/** The row a page may use for itself. Order since 2026-11-13 (Ian): pads under PLAY, home above the Twister at the foot. */
export const FREE_ROWS = [3] as const
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

// ---- the Twister overlay (see the header)
export const TW_TAP_MS = 300
export const TW_STORE_MS = 700
const TW_POLL_MS = 1000
const TW_SUBSCRIBE_MS = 3000
const TW_FLASH_MS = 300
export const TW_X0 = 4
export const TW_SCENES = 8
export const TW_PAGES = 5 // twistermapper's pages a-e
export const TW_PAGES_Y = 0
export const TW_A_Y = 2
export const TW_B_Y = 3
export const TW_FADER_Y = 5
const SCENE_A = "/surface/scene/a"
const SCENE_B = "/surface/scene/b"
const SCENE_STORE = "/surface/scene/store"
const SCENE_FADER = "/surface/scene/fader"
const LVL_TW_OFF = 3
const LVL_TW_ON = 13
const LVL_TW_FADER_AT = 15
const LVL_TW_FADER_BELOW = 7

const tw = {
	open: false,
	wasOpen: false,
	used: false,
	downAt: 0,
	page: -1, // the Twister page last chosen here; the Twister does not report its own
	a: 0, // the scene on each side, 0 = none or not heard
	b: 0,
	fader: undefined as number | undefined,
	/** Overlay keys now down: cell index → what it is. Their release is the overlay's too. */
	down: new Map<number, { y: number; n: number; at: number; stored: boolean }>(),
	storedAt: new Array<number>(TW_SCENES + 1).fill(0),
	polledAt: 0,
	subscribedAt: 0,
}
const twLinks = new WeakSet<SurfaceLink>()

/** For tests: the overlay's state is the module's, so a rig starts it afresh. */
export function resetTwisterOverlay(): void {
	Object.assign(tw, { open: false, wasOpen: false, used: false, downAt: 0, page: -1, a: 0, b: 0, fader: undefined, polledAt: 0, subscribedAt: 0 })
	tw.down.clear()
	tw.storedAt.fill(0)
	twisterHeld = false
}
export const twisterOverlayOpen = (): boolean => tw.open

function twHear(path: string, args: any[]): void {
	const v = Number(args[0])
	if (!Number.isFinite(v)) return
	if (path === SCENE_A) tw.a = Math.round(v)
	else if (path === SCENE_B) tw.b = Math.round(v)
	else if (path === SCENE_FADER) tw.fader = Math.min(1, Math.max(0, v))
}

/** While open: listen once per link, and keep the scenes and the fader read. */
function twPoll(ctx: PageContext, nowMs: number): void {
	const link = ctx.surface
	if (!link) return
	if (!twLinks.has(link)) {
		twLinks.add(link)
		link.on(twHear)
	}
	if (nowMs - tw.subscribedAt >= TW_SUBSCRIBE_MS) {
		tw.subscribedAt = nowMs
		link.send("/surface/subscribe", "127.0.0.1", link.port, "values")
	}
	if (nowMs - tw.polledAt < TW_POLL_MS) return
	tw.polledAt = nowMs
	for (const a of [SCENE_A, SCENE_B, SCENE_FADER]) link.send("/surface/get", a)
}

/** A key right of column 0 while the overlay is open, or the release of one it took. */
function twKey(ev: KeyEvent, ctx: PageContext): boolean {
	const i = ledIndex(ctx.size, ev.x, ev.y)
	if (!ev.s) {
		const d = tw.down.get(i)
		if (!d) return false // a key the page took before the overlay opened lets go there
		tw.down.delete(i)
		// A scene key let go before the store time: put that scene on its side.
		if (!d.stored && (d.y === TW_A_Y || d.y === TW_B_Y)) {
			ctx.surface?.send(d.y === TW_A_Y ? SCENE_A : SCENE_B, d.n)
			tw.polledAt = 0 // an empty scene is refused: ask what is there now
		}
		ctx.setDirty()
		return true
	}
	if (!tw.open) return false
	tw.used = true
	const n = ev.x - TW_X0 + 1
	tw.down.set(i, { y: ev.y, n, at: Date.now(), stored: false })
	if (n >= 1 && n <= TW_SCENES) {
		if (ev.y === TW_PAGES_Y && n <= TW_PAGES) {
			tw.page = n - 1
			ctx.osc.send(TWISTER_FOCUS_PATH, String.fromCharCode(96 + n))
		} else if (ev.y === TW_FADER_Y) {
			tw.fader = (n - 1) / (TW_SCENES - 1)
			ctx.surface?.send(SCENE_FADER, float(tw.fader))
		}
	}
	ctx.setDirty()
	return true
}

/** A scene key held long enough stores into that scene, once, while it is still down. */
function twStores(ctx: PageContext, nowMs: number): void {
	for (const d of tw.down.values()) {
		if (d.stored || (d.y !== TW_A_Y && d.y !== TW_B_Y) || d.n < 1 || d.n > TW_SCENES || nowMs - d.at < TW_STORE_MS) continue
		d.stored = true
		tw.storedAt[d.n] = nowMs
		ctx.surface?.send(SCENE_STORE, d.n)
	}
}

function twDraw(f: LedFrame, ctx: PageContext): void {
	const now = Date.now()
	twPoll(ctx, now)
	twStores(ctx, now)
	const { width, height } = ctx.size
	for (let y = 0; y < height; y++) for (let x = 1; x < width; x++) f[ledIndex(ctx.size, x, y)] = 0
	const set = (x: number, y: number, lvl: number) => { if (x < width && y < height) f[ledIndex(ctx.size, x, y)] = lvl }
	for (let p = 0; p < TW_PAGES; p++) set(TW_X0 + p, TW_PAGES_Y, p === tw.page ? LVL_TW_ON : LVL_TW_OFF)
	const at = tw.fader === undefined ? -1 : Math.round(tw.fader * (TW_SCENES - 1))
	for (let n = 1; n <= TW_SCENES; n++) {
		const flash = now - tw.storedAt[n] < TW_FLASH_MS
		set(TW_X0 + n - 1, TW_A_Y, flash ? 15 : tw.a === n ? LVL_TW_ON : LVL_TW_OFF)
		set(TW_X0 + n - 1, TW_B_Y, flash ? 15 : tw.b === n ? LVL_TW_ON : LVL_TW_OFF)
		set(TW_X0 + n - 1, TW_FADER_Y, at < 0 ? LVL_TW_OFF : n - 1 === at ? LVL_TW_FADER_AT : n - 1 < at ? LVL_TW_FADER_BELOW : LVL_TW_OFF)
	}
}

/** The column's cheat-sheet entries; pages spread them into their keymap. */
export const SELECTOR_KEYS: KeySpec[] = [
	{ x: 0, y: 0, name: "Iso", help: "Jump to the iso keyboard. Lit when you're on it.", lit: LVL_OTHER },
	{ x: 0, y: 1, name: "Play", help: "Jump to the PLAY page. Lit when you're on it.", lit: LVL_OTHER },
	{ x: 0, y: TWISTER_ROW, name: "Twister overlay", short: "Twister", help: "Tap: open the Twister overlay over the page (tap again shuts it). Hold: open only while held. On x4-x11: y0 the Twister's pages a-e; y2 a scene onto the fader's A side, y3 onto its B side (hold a scene key to store into it); y5 the A to B fader.", lit: LVL_TWISTER },
	...(REEL_PAGE_LIVE ? [{ x: 0, y: REEL_ROW, name: "Reel pads", short: "Reel", help: "Jump to the REEL pads page. Lit when you're on it. Held while on it: the top row picks the two lanes.", lit: 2 }] : []),
	{ x: 0, y: HOME_ROW, name: "Home", help: "Jump to home (the set page for now). Lit when you're on it.", lit: LVL_OTHER },
	{ x: 0, y: SHIFT2_ROW, name: "Shift 2", short: "Shift 2", help: "The second shift.", lit: LVL_SHIFT_IDLE },
	{ x: 0, y: SHIFT1_ROW, name: "Shift 1", short: "Shift 1", help: "Hold, then press a thing: its way back, or its store.", lit: LVL_SHIFT_IDLE },
]

/** Handle a page or Twister key of the column. True = consumed; the page stops. */
export function selectorKey(ev: KeyEvent, ctx: PageContext): boolean {
	if (ev.x !== SELECTOR_COL) return twKey(ev, ctx)
	if (ev.y === TWISTER_ROW) {
		const held = ev.s === 1
		if (held !== twisterHeld) {
			twisterHeld = held
			ctx.osc.send(TWISTER_OVERLAY_PATH, held ? 1 : 0)
			if (held) {
				tw.wasOpen = tw.open
				tw.used = false
				tw.downAt = Date.now()
				tw.open = true
				tw.polledAt = tw.subscribedAt = 0 // read the scenes and the fader at once
			} else if (!(Date.now() - tw.downAt < TW_TAP_MS && !tw.wasOpen && !tw.used)) {
				// Only a tap from shut leaves it open: a tap when open, a hold, or a press
				// used as a shift all shut it.
				tw.open = false
			}
			ctx.setDirty()
		}
		return true
	}
	const slot = ev.y === REEL_ROW && reelKeyOn(ctx) ? REEL_SLOT : SELECTOR_SLOT_AT_ROW.get(ev.y)
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
	if (reelKeyOn(ctx) && REEL_ROW < h) f[ledIndex(ctx.size, SELECTOR_COL, REEL_ROW)] = ctx.slot === REEL_SLOT ? LVL_SELF : LVL_OTHER
	if (tw.open) twDraw(f, ctx)
	if (TWISTER_ROW < h) f[ledIndex(ctx.size, SELECTOR_COL, TWISTER_ROW)] = twisterHeld || tw.open ? LVL_TWISTER_HELD : LVL_TWISTER
	if (SHIFT2_ROW < h) f[ledIndex(ctx.size, SELECTOR_COL, SHIFT2_ROW)] = ctx.modifiers?.shift2 ? LVL_SHIFT_HELD : LVL_SHIFT_IDLE
	if (SHIFT1_ROW < h) f[ledIndex(ctx.size, SELECTOR_COL, SHIFT1_ROW)] = ctx.modifiers?.shift1 ? LVL_SHIFT_HELD : LVL_SHIFT_IDLE
}
