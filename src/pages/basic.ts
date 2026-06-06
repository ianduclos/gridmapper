/* BasicGridPage — the grid's "BasicPage" equivalent and best first milestone.
 *
 * A generic button→OSC toggle surface: every cell is an independent toggle. Press
 * flips it; the LED shows state (off = dim base, on = full). Each change emits OSC
 * to Max, and Max can set cells back over OSC (2-way). The grid equivalent of the
 * twister's 16 normalized values.
 *
 * OSC out: /grid/out/page/<slot>/cell/<x>/<y>/value <0|1>
 * OSC in:  /grid/in/page/<slot>/cell/<x>/<y>/set <0|1>   (routed here as /cell/<x>/<y>/set)
 *          /grid/in/page/<slot>/dump  (routed here as /dump) → re-broadcast all on cells
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

const OFF_LEVEL = 2 // faint "you can press me" base
const ON_LEVEL = 15

export class BasicGridPage implements Page {
	private size = { width: 16, height: 8 }
	private state!: Uint8Array // 0 = off, 1 = on, per cell
	private frame!: LedFrame

	init(ctx: PageContext) {
		this.size = ctx.size
		this.state = new Uint8Array(this.size.width * this.size.height)
		this.frame = makeFrame(this.size, OFF_LEVEL)
		ctx.osc.send(`/grid/out/page/${ctx.slotLabel}/type`, "Basic")
	}

	onFocus(ctx: PageContext) {
		ctx.osc.send(`/grid/out/page/${ctx.slotLabel}/type`, "Basic")
	}

	onBlur() {}

	onKey(ev: KeyEvent, ctx: PageContext) {
		if (ev.s !== 1) return // act on press
		const i = ledIndex(this.size, ev.x, ev.y)
		if (i < 0 || i >= this.state.length) return
		const next = this.state[i] ? 0 : 1
		this.state[i] = next
		this.frame[i] = next ? ON_LEVEL : OFF_LEVEL
		ctx.osc.send(`/grid/out/page/${ctx.slotLabel}/cell/${ev.x}/${ev.y}/value`, next)
		ctx.setDirty()
	}

	onOsc(path: string, args: any[], ctx: PageContext) {
		// /cell/<x>/<y>/set <0|1>
		const m = path.match(/^\/cell\/(\d{1,2})\/(\d{1,2})\/set$/)
		if (m) {
			const x = Number(m[1])
			const y = Number(m[2])
			if (x >= this.size.width || y >= this.size.height) return
			const on = args[0] ? 1 : 0
			const i = ledIndex(this.size, x, y)
			this.state[i] = on as 0 | 1
			this.frame[i] = on ? ON_LEVEL : OFF_LEVEL
			ctx.osc.send(`/grid/out/page/${ctx.slotLabel}/cell/${x}/${y}/value`, on)
			ctx.setDirty()
			return
		}
		// /dump → re-broadcast every on cell
		if (path === "/dump") {
			for (let y = 0; y < this.size.height; y++) {
				for (let x = 0; x < this.size.width; x++) {
					if (this.state[ledIndex(this.size, x, y)]) {
						ctx.osc.send(`/grid/out/page/${ctx.slotLabel}/cell/${x}/${y}/value`, 1)
					}
				}
			}
		}
	}

	render(): LedFrame {
		return this.frame
	}

	dispose() {}
}

export const page: PageModule = {
	name: "toggle",
	label: "Toggle",
	create: () => new BasicGridPage(),
}
