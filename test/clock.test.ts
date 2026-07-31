import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"
import { AppClock, clampRate, isClockSource, type ClockState } from "../src/core/clock.js"

beforeEach(() => vi.useFakeTimers())
afterEach(() => vi.useRealTimers())

const makeClock = (opts: Partial<ConstructorParameters<typeof AppClock>[0]> = {}) => {
	const ticks: number[] = []
	const changes: ClockState[] = []
	const clock = new AppClock({
		onTick: (n) => ticks.push(n),
		onChange: (s) => changes.push({ ...s }),
		...opts,
	})
	return { clock, ticks, changes }
}

describe("AppClock", () => {
	it("boots stopped — nothing ticks until start()", () => {
		const { clock, ticks } = makeClock({ rate: 10 })
		expect(clock.running).toBe(false)
		vi.advanceTimersByTime(5000)
		expect(ticks).toEqual([])
	})

	it("ticks at the rate once started, counting from 1", () => {
		const { clock, ticks } = makeClock({ rate: 10 }) // 100ms
		clock.start()
		vi.advanceTimersByTime(1000)
		expect(ticks).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10])
		expect(clock.tick).toBe(10)
	})

	it("stop() halts it and start() resumes the same counter", () => {
		const { clock, ticks } = makeClock({ rate: 10 })
		clock.start()
		vi.advanceTimersByTime(300)
		clock.stop()
		vi.advanceTimersByTime(1000)
		expect(ticks).toEqual([1, 2, 3])
		clock.start()
		vi.advanceTimersByTime(100)
		expect(ticks).toEqual([1, 2, 3, 4])
	})

	it("a rate change re-arms at the new period", () => {
		const { clock, ticks } = makeClock({ rate: 10 })
		clock.start()
		vi.advanceTimersByTime(200) // 2 ticks @100ms
		clock.setRate(50) // 20ms
		vi.advanceTimersByTime(100) // 5 more
		expect(ticks.length).toBe(7)
	})

	it("source 'external' never self-ticks, but step() always advances", () => {
		const { clock, ticks } = makeClock({ rate: 100, source: "external" })
		clock.start()
		vi.advanceTimersByTime(1000)
		expect(ticks).toEqual([])
		clock.step()
		clock.step()
		expect(ticks).toEqual([1, 2])
	})

	it("switching back to internal while running arms the timer", () => {
		const { clock, ticks } = makeClock({ rate: 10, source: "external" })
		clock.start()
		vi.advanceTimersByTime(500)
		expect(ticks).toEqual([])
		clock.setSource("internal")
		vi.advanceTimersByTime(300)
		expect(ticks).toEqual([1, 2, 3])
	})

	it("does not fire a catch-up burst after a long stall", () => {
		const { clock, ticks } = makeClock({ rate: 20 })
		clock.start()
		// One fake-timer jump of 10s at a 50ms period would be 200 ticks if we caught up.
		vi.advanceTimersByTime(10_000)
		expect(ticks.length).toBeLessThan(220)
		expect(ticks.length).toBeGreaterThan(150)
	})

	it("emits onChange for transport/config, never per tick", () => {
		const { clock, changes } = makeClock({ rate: 10 })
		clock.start()
		vi.advanceTimersByTime(500) // 5 ticks, no changes
		expect(changes.length).toBe(1)
		clock.setRate(20)
		clock.setSource("external")
		clock.reset()
		clock.stop()
		expect(changes.length).toBe(5)
		expect(changes[4]).toMatchObject({ running: false, source: "external", rate: 20, tick: 0 })
	})

	it("ignores no-op changes", () => {
		const { clock, changes } = makeClock({ rate: 10 })
		clock.start()
		clock.start()
		clock.setRate(10)
		clock.setSource("internal")
		expect(changes.length).toBe(1)
	})

	it("reset() zeroes the counter without stopping", () => {
		const { clock, ticks } = makeClock({ rate: 10 })
		clock.start()
		vi.advanceTimersByTime(300)
		clock.reset()
		vi.advanceTimersByTime(100)
		expect(ticks).toEqual([1, 2, 3, 1])
	})

	it("close() releases the timer", () => {
		const { clock, ticks } = makeClock({ rate: 10 })
		clock.start()
		vi.advanceTimersByTime(100)
		clock.close()
		vi.advanceTimersByTime(1000)
		expect(ticks).toEqual([1])
	})

	it("clamps the rate and validates the source", () => {
		expect(clampRate(0)).toBe(0.1)
		expect(clampRate(1e9)).toBe(200)
		expect(clampRate("nonsense")).toBe(20)
		expect(isClockSource("internal")).toBe(true)
		expect(isClockSource("wall")).toBe(false)
	})
})
