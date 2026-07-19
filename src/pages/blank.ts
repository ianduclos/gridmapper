/* Page: Blank
 * ------------------------------------------------------------------------------
 * Summary : Inert no-op placeholder. For slots not in use yet, so they don't
 *           advertise a real page identity.
 * Input   : Ignored — keys and inbound OSC do nothing.
 * Display : All LEDs off.
 * Settings: none.
 * Rules   : No state, no side effects.
 * ------------------------------------------------------------------------------
 */

import {
	type Page,
	type PageContext,
	type KeyEvent,
	type LedFrame,
	type GridSize,
	makeFrame,
} from "../core/types.js"
import type { PageModule } from "../core/pageModule.js"

export class BlankPage implements Page {
	private size: GridSize = { width: 16, height: 8 }

	init(ctx: PageContext) {
		this.size = ctx.size
	}

	onFocus() {}
	onBlur() {}
	onKey(_ev: KeyEvent) {}
	onOsc(_path: string, _args: any[], _ctx: PageContext) {}

	render(): LedFrame {
		return makeFrame(this.size)
	}

	dispose() {}
}

// The drop-in unit. Auto-discovered by pages/registry.ts.
export const page: PageModule = {
	name: "blank",
	label: "Blank",
	create: () => new BlankPage(),
}
