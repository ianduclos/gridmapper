import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"
import { IdleManager, type IdlePolicy, type IdleState } from "../src/core/idleManager.js"
import type { RenderLoop } from "../src/render/renderLoop.js"

beforeEach(() => vi.useFakeTimers())
afterEach(() => vi.useRealTimers())

/** A RenderLoop stand-in that just records start/stop. */
function fakeLoop() {
	let running = true
	return {
		start() { running = true },
		stop() { running = false },
		get running() { return running },
		get intervalMs() { return 17 },
	} satisfies RenderLoop
}

const MIN = 60_000

function setup(policy: Partial<IdlePolicy> = {}, connected = false) {
	const loop = fakeLoop()
	const changes: IdleState[] = []
	let wakes = 0
	const idle = new IdleManager({
		loop,
		isConnected: () => connected,
		policy: { connectedMs: 240 * MIN, disconnectedMs: 15 * MIN, caffeinate: false, ...policy },
		onWake: () => { wakes++ },
		onChange: (s) => changes.push({ ...s }),
		checkMs: 1000,
	})
	idle.start()
	return { idle, loop, changes, setConnected: (v: boolean) => { connected = v }, wakes: () => wakes }
}

describe("IdleManager", () => {
	it("sleeps after the DISCONNECTED timeout when no grid is attached", () => {
		const { idle, loop } = setup()
		vi.advanceTimersByTime(14 * MIN)
		expect(idle.asleep).toBe(false)
		expect(loop.running).toBe(true)
		vi.advanceTimersByTime(2 * MIN)
		expect(idle.asleep).toBe(true)
		expect(loop.running).toBe(false)
	})

	it("uses the much longer CONNECTED timeout with a grid attached", () => {
		const { idle } = setup({}, true)
		vi.advanceTimersByTime(60 * MIN)
		expect(idle.asleep).toBe(false)
		vi.advanceTimersByTime(181 * MIN)
		expect(idle.asleep).toBe(true)
	})

	it("re-reads the threshold live when the grid comes and goes", () => {
		const { idle, setConnected } = setup()
		vi.advanceTimersByTime(14 * MIN)
		setConnected(true) // now on the 4h timeout
		vi.advanceTimersByTime(10 * MIN)
		expect(idle.asleep).toBe(false)
		setConnected(false) // back to 15min — and we're already well past it
		vi.advanceTimersByTime(1000)
		expect(idle.asleep).toBe(true)
	})

	it("activity() keeps it awake and restarts the countdown", () => {
		const { idle } = setup()
		for (let i = 0; i < 5; i++) {
			vi.advanceTimersByTime(14 * MIN)
			idle.activity()
		}
		expect(idle.asleep).toBe(false)
		vi.advanceTimersByTime(16 * MIN)
		expect(idle.asleep).toBe(true)
	})

	it("activity() wakes it, restarts the loop and forces a repaint", () => {
		const { idle, loop, wakes } = setup()
		vi.advanceTimersByTime(16 * MIN)
		expect(idle.asleep).toBe(true)
		idle.activity()
		expect(idle.asleep).toBe(false)
		expect(loop.running).toBe(true)
		expect(wakes()).toBe(1)
	})

	it("caffeinate never sleeps", () => {
		const { idle } = setup({ caffeinate: true })
		vi.advanceTimersByTime(300 * MIN)
		expect(idle.asleep).toBe(false)
	})

	it("turning caffeinate on wakes a sleeping app", () => {
		const { idle, loop } = setup()
		vi.advanceTimersByTime(16 * MIN)
		expect(idle.asleep).toBe(true)
		idle.setPolicy({ caffeinate: true })
		expect(idle.asleep).toBe(false)
		expect(loop.running).toBe(true)
		vi.advanceTimersByTime(300 * MIN)
		expect(idle.asleep).toBe(false)
	})

	it("a shortened timeout takes effect against time already elapsed", () => {
		const { idle } = setup()
		vi.advanceTimersByTime(5 * MIN)
		idle.setPolicy({ disconnectedMs: 1 * MIN })
		vi.advanceTimersByTime(1000)
		expect(idle.asleep).toBe(true)
	})

	it("clamps a silly-short timeout instead of thrashing", () => {
		const { idle } = setup()
		idle.setPolicy({ disconnectedMs: 5 })
		expect(idle.state.sleepAfterMs).toBe(1000)
	})

	it("explicit sleep()/wake() work regardless of the timer", () => {
		const { idle, loop, changes } = setup()
		idle.sleep()
		expect(idle.asleep).toBe(true)
		expect(loop.running).toBe(false)
		idle.wake()
		expect(idle.asleep).toBe(false)
		expect(loop.running).toBe(true)
		expect(changes.map((c) => c.asleep)).toEqual([true, false])
	})

	it("holds no timer of its own while asleep", () => {
		const { idle } = setup()
		idle.sleep()
		expect(vi.getTimerCount()).toBe(0)
		idle.wake()
		expect(vi.getTimerCount()).toBe(1)
	})

	it("reports the state it echoes over OSC", () => {
		const { idle } = setup({}, true)
		const s = idle.state
		expect(s).toMatchObject({ asleep: false, caffeinated: false, connected: true, sleepAfterMs: 240 * MIN })
	})
})
