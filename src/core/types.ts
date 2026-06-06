// src/core/types.ts — gridmapper data model.
//
// Device-agnostic. Everything above the driver works in human-readable values:
// (x, y) cell coordinates and LED intensity 0..15 (varibright). Only the driver
// (io/serialoscDriver.ts) knows the serialosc/OSC wire format.

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
	osc: {
		send: (path: string, ...args: Array<number | string | boolean>) => void
	}
	slot: Slot
	slotLabel: SlotLabel
	/** Request a re-render of this page; if focused, the loop pushes it next frame. */
	setDirty: () => void
}

export interface Page {
	init(ctx: PageContext): void
	onFocus(ctx: PageContext): void
	onBlur(ctx: PageContext): void
	onKey(ev: KeyEvent, ctx: PageContext): void
	onOsc?(path: string, args: any[], ctx: PageContext): void
	render(ctx: PageContext): LedFrame | undefined
	/** Structural config for preset capture; MUST exclude transient runtime state. */
	serialize?(): unknown
	dispose(): void
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

export type OnFrameReason = "key" | "osc" | "dirty" | "focus"
export type OnFrame = (frame: LedFrame | undefined, reason: OnFrameReason) => void
