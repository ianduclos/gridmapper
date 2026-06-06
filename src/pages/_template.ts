/* Page: Template  (copy me to src/pages/<yourname>.ts and fill in)
 * ------------------------------------------------------------------------------
 * Summary : One line — what this page is and the feeling of using it.
 * Input   : What key presses do. (Only the FOCUSED page receives keys.)
 * Display : What the LEDs show. Every cell is an intensity 0..15.
 * Settings: Declared knobs (or "none"). Wired later; declaring now is free.
 * Rules   : Invariants / edge cases you guarantee (e.g. "ignore key releases").
 * ------------------------------------------------------------------------------
 * You implement input + a render() that returns "what the grid looks like NOW".
 * The framework owns everything else: it calls render() every frame (~58fps),
 * diffs your frame against the last one, batches the changes per 8×8 quadrant,
 * rate-limits, routes keys, and force-repaints on page change. You never touch the
 * driver, never send LED OSC, never think about timing. See docs/PAGE_PROTOCOL.md.
 *
 * This template is a working example: a bright dot sweeps left↔right; press a cell
 * to move the dot to that row. Files starting with "_" are NOT auto-registered, so
 * this template ships inert — rename + drop it in and it goes live.
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

const SWEEP_HZ = 0.5 // how fast the dot crosses (replace with your own logic)

export class TemplatePage implements Page {
	private size: GridSize = { width: 16, height: 8 }
	private startMs = Date.now()
	private row = 0

	/** Called once when the page is loaded into a slot. Read ctx.size; init state. */
	init(ctx: PageContext) {
		this.size = ctx.size
		this.startMs = Date.now()
	}

	/** Page became visible. Reset clocks here if you want animations to start fresh. */
	onFocus() {
		this.startMs = Date.now()
	}

	/** Page hidden. Stop/clear anything visual. (No device cleanup needed.) */
	onBlur() {}

	/** A key was pressed (s=1) or released (s=0). Mutate state; do NOT draw here. */
	onKey(ev: KeyEvent) {
		if (ev.s === 1) this.row = ev.y
	}

	/**
	 * Optional: react to inbound app OSC routed to this page. `path` is the remainder
	 * after /grid/in/page/<slot>/ (e.g. "/cell/3/2/set"). Omit if unused.
	 */
	// onOsc(path: string, args: any[], ctx: PageContext) {}

	/** Return the current frame (0..15 per cell). Called every frame — read a clock. */
	render(): LedFrame {
		const f = makeFrame(this.size)
		const tSec = (Date.now() - this.startMs) / 1000
		const phase = ((tSec * SWEEP_HZ) % 1 + 1) % 1
		const tri = phase < 0.5 ? phase * 2 : (1 - phase) * 2 // 0→1→0
		const x = Math.round(tri * (this.size.width - 1))
		f[ledIndex(this.size, x, this.row)] = 15
		return f
	}

	/** Optional: structural config for presets. Transient runtime state must NOT go here. */
	// serialize() { return { /* ... */ } }

	/** Called when the slot is unloaded. Clean up any timers you (rarely) created. */
	dispose() {}
}

// The drop-in unit. Auto-discovered by pages/registry.ts. `name` is the id used in
// messages + the dropdown; keep it lowercase and unique.
export const page: PageModule = {
	name: "template",
	label: "Template",
	create: () => new TemplatePage(),
	// Declared settings are optional and not wired to controls yet (declare-now,
	// wire-later). Delete this block if your page has no settings.
	settings: [
		{ key: "speed", label: "speed", type: "number", min: 0.1, max: 4, step: 0.1, default: SWEEP_HZ },
	],
}
