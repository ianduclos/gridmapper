/* Page: Blank Surface  (idk.surface fork of blank-hot)
 * ------------------------------------------------------------------------------
 * Summary : Blank, plus the column-0 page selector — so an unfinished slot in the
 *           idk.surface set is never a dead end you can't get back out of.
 * Input   : column 0 is the system's column (util/pageSelectorSurface.ts); all else ignored.
 * Display : the selector column; everything else off.
 * Settings: none.
 * Rules   : No state, no side effects beyond switching focus.
 * ------------------------------------------------------------------------------
 */

import {
	type Page,
	type PageContext,
	type KeyEvent,
	type LedFrame,
	makeFrame,
} from "../core/types.js"
import type { PageModule } from "../core/pageModule.js"
import { selectorKey, shiftKey, releaseShifts, drawSelector } from "../util/pageSelectorSurface.js"

export class BlankSurfacePage implements Page {
	init(_ctx: PageContext) {}
	onFocus() {}
	onBlur(ctx: PageContext) {
		releaseShifts(ctx)
	}

	onKey(ev: KeyEvent, ctx: PageContext) {
		if (!selectorKey(ev, ctx)) shiftKey(ev, ctx)
	}

	onOsc(_path: string, _args: any[], _ctx: PageContext) {}

	render(ctx: PageContext): LedFrame {
		const f = makeFrame(ctx.size)
		drawSelector(f, ctx)
		return f
	}

	dispose() {}
}

export const page: PageModule = {
	name: "blank-surface",
	label: "Blank Surface",
	create: () => new BlankSurfacePage(),
}
