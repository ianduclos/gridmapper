/* PageManager: owns the 8 page slots, focus, routing, and each page's desired
 * frame. Mirrors twistermapper's PageManager but for grid key events.
 *
 * Only the focused page receives key events. Pages keep their desired LedFrame up
 * to date here; the render loop is the single thing that pushes to the device. The
 * onFrame callback just lets the daemon request a full repaint on focus changes.
 */

import {
	type Page,
	type LedFrame,
	type KeyEvent,
	type PageContext,
	type Slot,
	type OnFrame,
	SLOT_INDICES,
	slotLabel,
} from "./types.js"

export class PageManager {
	private pages: (Page | null)[] = Array.from(SLOT_INDICES, () => null)
	private desired: (LedFrame | undefined)[] = Array.from(SLOT_INDICES, () => undefined)
	private focused: Slot = 0
	private ctxPerSlot: PageContext[] = []
	private onFrame?: OnFrame

	constructor(
		baseCtx: Omit<PageContext, "setDirty" | "slot" | "slotLabel">,
		onFrame?: OnFrame
	) {
		this.onFrame = onFrame
		for (const slot of SLOT_INDICES) {
			this.ctxPerSlot[slot] = {
				...baseCtx,
				slot,
				slotLabel: slotLabel(slot),
				setDirty: () => {
					const p = this.pages[slot]
					if (!p) return
					this.desired[slot] = p.render(this.ctxPerSlot[slot]) ?? this.desired[slot]
					if (slot === this.focused) this.onFrame?.(this.desired[slot], "dirty")
				},
			}
		}
	}

	load(slot: Slot, factory: () => Page) {
		this.pages[slot]?.dispose()
		const p = factory()
		this.pages[slot] = p
		p.init(this.ctxPerSlot[slot])
		// Loading into the focused slot activates the new page (starts focus-driven
		// timers, e.g. animations). The replaced page was disposed above.
		if (slot === this.focused) p.onFocus(this.ctxPerSlot[slot])
		this.desired[slot] = p.render(this.ctxPerSlot[slot])
		if (slot === this.focused) this.onFrame?.(this.desired[slot], "focus")
	}

	focus(slot: Slot) {
		if (slot === this.focused) return
		this.pages[this.focused]?.onBlur(this.ctxPerSlot[this.focused])
		this.focused = slot
		this.pages[slot]?.onFocus(this.ctxPerSlot[slot])
		this.desired[slot] = this.pages[slot]?.render(this.ctxPerSlot[slot])
		this.onFrame?.(this.desired[slot], "focus")
	}

	onKey(ev: KeyEvent) {
		const p = this.pages[this.focused]
		if (!p) return
		p.onKey(ev, this.ctxPerSlot[this.focused])
		this.desired[this.focused] = p.render(this.ctxPerSlot[this.focused]) ?? this.desired[this.focused]
		this.onFrame?.(this.desired[this.focused], "key")
	}

	routeOscToPage(slot: Slot, path: string, args: any[]) {
		const p = this.pages[slot]
		if (!p?.onOsc) return
		p.onOsc(path, args, this.ctxPerSlot[slot])
		this.desired[slot] = p.render(this.ctxPerSlot[slot]) ?? this.desired[slot]
		if (slot === this.focused) this.onFrame?.(this.desired[slot], "osc")
	}

	/**
	 * Render the focused page NOW and return its frame. The render loop calls this
	 * every frame (per-frame model), so pages animate just by reading a clock in
	 * render() — no timers, no setDirty needed.
	 */
	renderFocused(): LedFrame | undefined {
		const p = this.pages[this.focused]
		if (!p) return this.desired[this.focused]
		this.desired[this.focused] = p.render(this.ctxPerSlot[this.focused]) ?? this.desired[this.focused]
		return this.desired[this.focused]
	}

	getDesiredFocused(): LedFrame | undefined {
		return this.desired[this.focused]
	}

	get focusedSlot(): Slot {
		return this.focused
	}

	/** Capture a slot's page config for presets (undefined if the page has none). */
	serialize(slot: Slot): unknown {
		return this.pages[slot]?.serialize?.()
	}
}
