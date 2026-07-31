import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"
import { AppClock, clampRate, clampDiv, isClockSource, sanitizeLanes, DEFAULT_LANES, LANE_COUNT, type ClockState } from "../src/core/clock.js"

beforeEach(() => vi.useFakeTimers())
afterEach(() => vi.useRealTimers())

const makeClock = (opts: Partial<ConstructorParameters<typeof AppClock>[0]> = {}) => {
	const ticks: number[] = []
	const laneTicks: Array<{ tick: number; lane: number }> = []
	const changes: ClockState[] = []
	const clock = new AppClock({
		// Default lanes divide (1,2,4,8); most tests below watch lane 0, which is 1:1
		// with the master and therefore behaves exactly as the pre-lane clock did.
		onTick: (n, lane) => {
			laneTicks.push({ tick: n, lane })
			if (lane === 0) ticks.push(n)
		},
		onChange: (s) => changes.push({ ...s }),
		...opts,
	})
	return { clock, ticks, laneTicks, changes }
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

	it("an external lane never self-ticks, but step() always advances it", () => {
		const { clock, ticks } = makeClock({ rate: 100, lanes: [{ source: "external", div: 1 }] })
		clock.start()
		vi.advanceTimersByTime(1000)
		expect(ticks).toEqual([])
		clock.step(0)
		clock.step(0)
		expect(ticks).toEqual([1, 2])
	})

	it("switching a lane back to internal while running starts feeding it", () => {
		const { clock, ticks } = makeClock({ rate: 10, lanes: [{ source: "external", div: 1 }] })
		clock.start()
		vi.advanceTimersByTime(500)
		expect(ticks).toEqual([])
		clock.setLane(0, { source: "internal" })
		vi.advanceTimersByTime(300)
		expect(ticks).toEqual([1, 2, 3])
	})

	it("each lane divides the master and keeps its own counter", () => {
		const { clock, laneTicks } = makeClock({ rate: 100 }) // defaults: div 1,2,4,8
		clock.start()
		vi.advanceTimersByTime(80) // 8 master ticks
		const per = (lane: number) => laneTicks.filter((t) => t.lane === lane).map((t) => t.tick)
		expect(per(0)).toEqual([1, 2, 3, 4, 5, 6, 7, 8])
		expect(per(1)).toEqual([1, 2, 3, 4])
		expect(per(2)).toEqual([1, 2])
		expect(per(3)).toEqual([1])
	})

	it("a manual step targets one lane and leaves the others alone", () => {
		const { clock, laneTicks } = makeClock({ rate: 10 })
		clock.step(2)
		expect(laneTicks).toEqual([{ tick: 1, lane: 2 }])
		expect(clock.lane(2)?.tick).toBe(1)
		expect(clock.lane(0)?.tick).toBe(0)
	})

	it("ignores a step to a lane that doesn't exist", () => {
		const { clock, laneTicks } = makeClock({ rate: 10 })
		clock.step(9)
		expect(laneTicks).toEqual([])
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
		clock.setLane(1, { source: "external" })
		clock.reset()
		clock.stop()
		expect(changes.length).toBe(5)
		expect(changes[4]).toMatchObject({ running: false, rate: 20, tick: 0 })
		expect(changes[4].lanes[1]).toMatchObject({ source: "external", tick: 0 })
	})

	it("ignores no-op changes", () => {
		const { clock, changes } = makeClock({ rate: 10 })
		clock.start()
		clock.start()
		clock.setRate(10)
		clock.setLane(0, { source: "internal", div: 1 })
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

	it("clamps divisors and always yields exactly LANE_COUNT lanes", () => {
		expect(clampDiv(0)).toBe(1)
		expect(clampDiv(1e6)).toBe(64)
		expect(clampDiv("nope")).toBe(1)
		expect(sanitizeLanes(undefined)).toEqual(DEFAULT_LANES)
		expect(sanitizeLanes([{ source: "external" }])).toHaveLength(LANE_COUNT)
		expect(sanitizeLanes([{ source: "external" }])[0]).toEqual({ source: "external", div: 1 })
		expect(sanitizeLanes("garbage")).toEqual(DEFAULT_LANES)
	})
})
