// src/core/types.ts — gridmapper data model.
//
// Device-agnostic. Everything above the driver works in human-readable values:
// (x, y) cell coordinates and LED intensity 0..15 (varibright). Only the driver
// (io/serialoscDriver.ts) knows the serialosc/OSC wire format.

import type { ClockState } from "./clock.js"

/** A monome grid is a W×H field of buttons. grid 128 = 16 wide × 8 tall. */
export interface GridSize {
	width: number
	height: number
}

/** A decoded key event from the grid. s: 1 = press, 0 = release. */
export interface KeyEvent {
	x: number
	y: number
	s: 0 | 1
}

/**
 * An LED frame: a flat, row-major field of intensities, one per cell, each 0..15.
 * Index of (x, y) is `y * width + x` (see `ledIndex`). Uint8Array so the
 * reconciler can diff cheaply against a cached "last sent" frame.
 */
export type LedFrame = Uint8Array

export const ledIndex = (size: GridSize, x: number, y: number): number =>
	y * size.width + x

export const makeFrame = (size: GridSize, fill = 0): LedFrame => {
	const f = new Uint8Array(size.width * size.height)
	if (fill) f.fill(fill & 0x0f)
	return f
}

// --- Page model (device-agnostic, mirrors twistermapper's hot-swappable pages) ---
// Pages are 2D button surfaces. Only the focused page receives key events; it
// owns its desired LedFrame, which the render loop diffs + pushes. Modifiers are
// app-defined (the grid has no dedicated shift/side buttons — a page may treat a
// held key as a modifier and surface that here if it routes globally).

export interface Modifiers {
	/** Cells currently held down, keyed by `ledIndex`. App/page convention. */
	held: ReadonlySet<number>
	/**
	 * Two app-defined shift buttons that live OUTSIDE any page. They may be driven
	 * externally (OSC `/grid/in/shift <1|2> <s>`) or, later, by a local source — both
	 * paths converge here so behavior is identical. A page reads these to modify its
	 * own behavior; "both held" is left to the page to interpret as a third shift.
	 */
	shift1: boolean
	shift2: boolean
}

export interface PageContext {
	size: GridSize
	modifiers: Modifiers
	/**
	 * Live view of the app transport (core/clock.ts). Read it any time — it is the same
	 * object the host mutates, never a copy taken at init.
	 */
	clock: Readonly<ClockState>
	/** Explicit, local requests to the one app clock. Pages never mutate it on load/restore. */
	clockControl?: {
		start: () => void
		stop: () => void
		setRate: (rate: number) => void
	}
	osc: {
		send: (path: string, ...args: Array<number | string | boolean>) => void
	}
	slot: Slot
	slotLabel: SlotLabel
	/** Request a re-render of this page; if focused, the loop pushes it next frame. */
	setDirty: () => void
	/**
	 * Set an app-defined shift (which = 1 | 2) from a page acting as a LOCAL shift
	 * source (e.g. a held cell). Routes through the same debounced ShiftInput as
	 * external OSC, so local + external shifts behave identically and both surface
	 * via `ctx.modifiers.shift1` / `shift2`.
	 */
	setShift: (which: number, down: boolean) => void
	/**
	 * Focus another slot from inside a page (e.g. a page-selector key). Same effect as
	 * `/grid/in/focus/page`: this page is blurred, the target focused and repainted, and
	 * `/grid/out/focus/page` announced. Safe to call from onKey.
	 */
	focus: (slot: Slot) => void
	/**
	 * This page's STORED CONTENT changed (a saved chord, say) and should outlive a restart.
	 * `patch` is the subset of serialize() that changed; the host writes the live layout and
	 * merges `patch` into the active preset. Not for settings or transient state.
	 */
	persist: (patch: Record<string, unknown>) => void
}

export interface Page {
	init(ctx: PageContext): void
	onFocus(ctx: PageContext): void
	onBlur(ctx: PageContext): void
	onKey(ev: KeyEvent, ctx: PageContext): void
	onOsc?(path: string, args: any[], ctx: PageContext): void
	/**
	 * One app-clock tick. Unlike keys, this reaches EVERY loaded page, focused or not —
	 * a sequencer in slot b keeps running (and keeps emitting OSC) while you look at
	 * slot a. It also reaches every page on EVERY lane, so filter: a clocked page
	 * declares which lane it follows and ignores the rest (see pages/meadowphysics.ts).
	 * `tick` is that lane's running count since boot/reset.
	 */
	/** `deadlineMs` is the intended clock instant, not when a delayed callback ran. */
	onTick?(tick: number, lane: number, ctx: PageContext, deadlineMs?: number): void
	/**
	 * The transport changed (start/stop/rate/source/reset). Also reaches every loaded
	 * page. This is where a sequencer releases sounding notes on stop.
	 */
	onClock?(state: Readonly<ClockState>, ctx: PageContext): void
	render(ctx: PageContext): LedFrame | undefined
	/** Structural config for preset capture; MUST exclude transient runtime state. */
	serialize?(): unknown
	/**
	 * The inverse of `serialize()`: put a captured config back. Called once, right after
	 * `init()` and before `onFocus()`, so a restored page is already itself by the time
	 * anyone looks at it.
	 *
	 * The argument is untrusted — it came off disk and may have been written by an older
	 * build, hand-edited, or truncated. It MUST NOT throw: read it through
	 * `util/restoreGuards.ts` and fall back to the constructed defaults field by field.
	 * Whatever `serialize()` leaves out (held keys, sounding notes, a take in progress)
	 * stays out; restoring must never make a sound on its own.
	 *
	 * `ctx` is passed so a page can re-announce its new state — the values it emitted from
	 * `init()` were the defaults, and are now stale.
	 */
	restore?(config: unknown, ctx: PageContext): void
	/**
	 * The slot is being unloaded/replaced. `ctx` is passed so a page that owns external
	 * state (a sequencer with sounding notes) can release it; implementations that don't
	 * need it may keep the zero-arg form.
	 */
	dispose(ctx: PageContext): void
}

// 8 hot-swappable page slots, labelled a..h (mirrors the twister).
export type Slot = 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7
export type SlotLabel = "a" | "b" | "c" | "d" | "e" | "f" | "g" | "h"

export const SLOT_INDICES: readonly Slot[] = [0, 1, 2, 3, 4, 5, 6, 7] as const
export const SLOT_LABELS: readonly SlotLabel[] = [
	"a", "b", "c", "d", "e", "f", "g", "h",
] as const

export const slotLabel = (slot: Slot): SlotLabel => SLOT_LABELS[slot]

export const slotFromLabel = (label: string): Slot | undefined => {
	const idx = SLOT_LABELS.findIndex((entry) => entry === label.toLowerCase())
	return idx === -1 ? undefined : SLOT_INDICES[idx]
}

export type OnFrameReason = "key" | "osc" | "dirty" | "focus" | "tick"
export type OnFrame = (frame: LedFrame | undefined, reason: OnFrameReason) => void
