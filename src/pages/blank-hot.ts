/* Page: Blank Hot  (hotelier concert placeholder)
 * ------------------------------------------------------------------------------
 * Summary : Blank, plus the column-0 page selector — so an unfinished slot in the
 *           hotelier set is never a dead end you can't get back out of.
 * Input   : column 0 rows 0-5 focus slots a-f (util/pageSelector.ts); all else ignored.
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
import { selectorKey, drawSelector } from "../util/pageSelector.js"

export class BlankHotPage implements Page {
	init(_ctx: PageContext) {}
	onFocus() {}
	onBlur() {}

	onKey(ev: KeyEvent, ctx: PageContext) {
		selectorKey(ev, ctx)
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
	name: "blank-hot",
	label: "Blank Hot",
	create: () => new BlankHotPage(),
}
