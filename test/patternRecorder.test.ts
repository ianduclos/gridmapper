import { describe, it, expect } from "vitest"
import {
	PatternRecorder,
	eventsInWindow,
	quantiseLength,
	MAX_RECORD_MS,
	type PatternEvent,
} from "../src/util/patternRecorder.js"

const ev = (atMs: number, step: number, on = true): PatternEvent => ({ atMs, step, on })

describe("eventsInWindow", () => {
	const events = [ev(0, 1), ev(100, 2), ev(250, 3)]

	it("fires an event sitting at offset 0 on the first advance", () => {
		expect(eventsInWindow(events, 400, 0, 10).fired).toEqual([ev(0, 1)])
	})

	it("is half-open, so nothing fires twice across two adjacent windows", () => {
		const a = eventsInWindow(events, 400, 0, 100).fired
		const b = eventsInWindow(events, 400, 100, 100).fired
		expect(a).toEqual([ev(0, 1)])
		expect(b).toEqual([ev(100, 2)])
	})

	it("wraps around the loop end", () => {
		const { fired, playhead } = eventsInWindow(events, 400, 350, 100)
		expect(fired).toEqual([ev(0, 1)]) // crossed the seam and picked up offset 0
		expect(playhead).toBe(50)
	})

	it("clamps a jump longer than the loop to a single pass", () => {
		// A suspend/GC stall must not machine-gun every missed repeat.
		const { fired } = eventsInWindow(events, 400, 0, 10_000)
		expect(fired).toHaveLength(events.length)
	})

	it("does nothing for an empty or zero-length loop", () => {
		expect(eventsInWindow([], 400, 0, 100).fired).toEqual([])
		expect(eventsInWindow(events, 0, 0, 100).fired).toEqual([])
		expect(eventsInWindow(events, 400, 0, 0).fired).toEqual([])
	})
})

describe("quantiseLength", () => {
	it("is a no-op when off", () => {
		expect(quantiseLength(437, 0)).toBe(437)
	})

	it("rounds to the nearest multiple", () => {
		expect(quantiseLength(437, 100)).toBe(400)
		expect(quantiseLength(462, 100)).toBe(500)
	})

	it("never rounds a real take down to nothing", () => {
		expect(quantiseLength(10, 100)).toBe(100)
	})
})

describe("PatternRecorder state machine", () => {
	/** Arm, play one note, close — the standard "has a loop now" setup. */
	const recorded = () => {
		const r = new PatternRecorder()
		r.press(0)
		r.record(5, true, 100)
		r.record(5, false, 150)
		r.press(400)
		return r
	}

	it("cycles empty -> recording -> playing -> stopped -> playing", () => {
		const r = new PatternRecorder()
		expect(r.state).toBe("empty")
		r.press(0)
		expect(r.state).toBe("recording")
		r.record(5, true, 100)
		r.press(400)
		expect(r.state).toBe("playing")
		expect(r.loopMs).toBe(400)
		r.press(500)
		expect(r.state).toBe("stopped")
		r.press(600)
		expect(r.state).toBe("playing")
	})

	it("stopping resets the playhead to the start", () => {
		const r = recorded()
		r.advance(520, 120) // playhead past the note-on
		expect(r.sounding).toEqual(new Set([5]))
		r.press(520) // stop
		expect(r.sounding.size).toBe(0)
		r.press(600) // play again — from the top
		r.advance(650, 50)
		expect(r.sounding.size).toBe(0) // note-on is at 100, not yet reached
		r.advance(710, 60)
		expect(r.sounding).toEqual(new Set([5]))
	})

	it("an empty take goes back to empty rather than looping silence", () => {
		const r = new PatternRecorder()
		r.press(0)
		r.press(400) // nothing played
		expect(r.state).toBe("empty")
		expect(r.hasContent).toBe(false)
	})

	it("clear throws the pattern away from any state", () => {
		const r = recorded()
		r.advance(520, 120)
		r.clear()
		expect(r.state).toBe("empty")
		expect(r.hasContent).toBe(false)
		expect(r.sounding.size).toBe(0)
	})

	it("closes itself once the recording passes the cap", () => {
		const r = new PatternRecorder()
		r.press(0)
		r.record(5, true, 100)
		r.advance(MAX_RECORD_MS - 1, 10)
		expect(r.state).toBe("recording")
		r.advance(MAX_RECORD_MS + 1, 10)
		expect(r.state).toBe("playing")
		expect(r.loopMs).toBeGreaterThanOrEqual(MAX_RECORD_MS)
	})

	it("loops — the same note comes round again", () => {
		const r = recorded()
		r.advance(520, 120) // 0 -> 120, note on
		expect(r.sounding).toEqual(new Set([5]))
		r.advance(620, 100) // 120 -> 220, note off at 150
		expect(r.sounding.size).toBe(0)
		r.advance(910, 290) // wraps past 400 and back round to the note-on at 100
		expect(r.sounding).toEqual(new Set([5]))
	})

	it("quantises the loop LENGTH but not the events inside it", () => {
		const r = new PatternRecorder()
		r.press(0)
		r.record(5, true, 137)
		r.press(437, 100) // quantum 100ms
		expect(r.loopMs).toBe(400)
		expect(r.snapshot().events[0].atMs).toBe(137) // untouched
	})

	it("a zero-length stab still sounds, for one tick", () => {
		// A preset stab records on and off at the same instant. The consumer is level-based,
		// so without a floor the note would cancel itself out and never be heard.
		const r = new PatternRecorder()
		r.press(0)
		r.record(7, true, 100)
		r.record(7, false, 100)
		r.press(400)
		r.advance(520, 120)
		expect(r.sounding).toEqual(new Set([7]))
		r.advance(525, 5)
		expect(r.sounding.size).toBe(0)
	})

	it("only records while recording", () => {
		const r = new PatternRecorder()
		r.record(1, true, 0) // ignored — still empty
		expect(r.hasContent).toBe(false)
		r.press(0)
		r.record(1, true, 10)
		r.press(100)
		r.record(2, true, 110) // ignored — playing now
		expect(r.snapshot().events).toHaveLength(1)
	})
})
