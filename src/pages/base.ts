/* BasePage — the default page: a momentary light surface.
 *
 * Press a key → that cell lights (15); release → it clears (0). At rest the grid is
 * dark. This is the "base" behavior the live mirror validated, now expressed as a
 * proper Page so it lives in a slot like any other prototype.
 */

import {
	type Page,
	type PageContext,
	type KeyEvent,
	type LedFrame,
	makeFrame,
	ledIndex,
} from "../core/types.js"
import type { PageModule } from "../core/pageModule.js"

const ON = 15

export class BasePage implements Page {
	private size = { width: 16, height: 8 }
	private frame!: LedFrame

	init(ctx: PageContext) {
		this.size = ctx.size
		this.frame = makeFrame(this.size) // dark at rest
	}

	onFocus() {}

	onBlur() {
		// Drop any still-held cells so re-focusing starts clean.
		this.frame.fill(0)
	}

	onKey(ev: KeyEvent) {
		const i = ledIndex(this.size, ev.x, ev.y)
		if (i < 0 || i >= this.frame.length) return
		this.frame[i] = ev.s ? ON : 0
		// No setDirty: the loop re-renders the focused page every frame.
	}

	render(): LedFrame {
		return this.frame
	}

	dispose() {}
}

export const page: PageModule = {
	name: "base",
	label: "Base",
	create: () => new BasePage(),
}
