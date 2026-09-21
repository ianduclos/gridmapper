import { describe, expect, it, vi } from "vitest"
import { AppClock } from "../src/core/clock.js"
import { PageManager } from "../src/core/pageManager.js"
import type { Page, PageContext } from "../src/core/types.js"

describe("transport deadlines", () => {
	it("uses the intended timer deadline and forwards it through PageManager", () => {
		vi.useFakeTimers()
		vi.setSystemTime(1000)
		let received = 0
		const base: Omit<
			PageContext,
			"setDirty" | "slot" | "slotLabel" | "focus" | "persist"
		> = {
			size: { width: 16, height: 8 },
			modifiers: { held: new Set(), shift1: false, shift2: false },
			clock: { running: false, rate: 10, tick: 0, lanes: [] },
			osc: { send() {} },
			setShift() {},
		}
		const pm = new PageManager(base)
		const page: Page = {
			init() {},
			onFocus() {},
			onBlur() {},
			onKey() {},
			onTick(_n, _lane, _c, deadline) {
				received = deadline ?? 0
			},
			render() {
				return undefined
			},
			dispose() {},
		}
		pm.load(0, () => page)
		const clock = new AppClock({
			rate: 10,
			onTick(n, lane, deadline) {
				pm.tick(n, lane, deadline)
			},
		})
		clock.start()
		vi.advanceTimersByTime(100)
		expect(received).toBe(1100)
		clock.step(0)
		expect(received).toBe(1100)
		vi.useRealTimers()
	})
})
