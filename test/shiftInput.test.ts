import { describe, it, expect } from "vitest"
import { ShiftInput } from "../src/core/shiftInput.js"

// Controllable clock so we can test the lockout window without real time.
function atClock() {
	let t = 1000
	const fn = () => t
	return { fn, advance: (ms: number) => { t += ms } }
}

describe("ShiftInput debounce (leading-edge lockout)", () => {
	it("first edge takes effect immediately", () => {
		const c = atClock()
		const s = new ShiftInput(20, c.fn)
		expect(s.set(1, true)).toBe(true)
		expect(s.shift1).toBe(true)
	})

	it("ignores a same-state edge (not an edge at all)", () => {
		const c = atClock()
		const s = new ShiftInput(20, c.fn)
		s.set(1, true)
		c.advance(100)
		expect(s.set(1, true)).toBe(false) // already down
		expect(s.shift1).toBe(true)
	})

	it("swallows ALTERNATING chatter within the window (the real bug)", () => {
		const c = atClock()
		const s = new ShiftInput(20, c.fn)
		expect(s.set(1, true)).toBe(true) // press registers
		c.advance(2); expect(s.set(1, false)).toBe(false) // bounce up — ignored
		c.advance(2); expect(s.set(1, true)).toBe(false)  // bounce down — ignored
		c.advance(2); expect(s.set(1, false)).toBe(false) // bounce up — ignored
		expect(s.shift1).toBe(true) // stayed pressed through the chatter
	})

	it("accepts a genuine release once the window has elapsed", () => {
		const c = atClock()
		const s = new ShiftInput(20, c.fn)
		s.set(1, true)
		c.advance(500) // a human holds shift far longer than the window
		expect(s.set(1, false)).toBe(true)
		expect(s.shift1).toBe(false)
	})

	it("chatter does not extend the lockout (timer anchored to last accept)", () => {
		const c = atClock()
		const s = new ShiftInput(20, c.fn)
		s.set(1, true) // accepted at t=1000
		c.advance(2); expect(s.set(1, false)).toBe(false) // chatter at 1002 — ignored
		c.advance(17) // t=1019: still < 20ms past the accept → genuine release blocked
		expect(s.set(1, false)).toBe(false)
		c.advance(2) // t=1021: 21ms past the ACCEPT (1000), not the chatter (1002)
		// If the ignored chatter had bumped the anchor to 1002, 1021-1002=19<20 would
		// still block. It must be open, proving the timer only moves on an accept.
		expect(s.set(1, false)).toBe(true)
		expect(s.shift1).toBe(false)
	})

	it("tracks the two shifts independently", () => {
		const c = atClock()
		const s = new ShiftInput(20, c.fn)
		expect(s.set(1, true)).toBe(true)
		expect(s.set(2, true)).toBe(true) // shift2 not blocked by shift1's lockout
		expect(s.shift1).toBe(true)
		expect(s.shift2).toBe(true)
	})

	it("ignores out-of-range shift ids", () => {
		const s = new ShiftInput(20)
		expect(s.set(0, true)).toBe(false)
		expect(s.set(3, true)).toBe(false)
	})
})
