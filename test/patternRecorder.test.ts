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
	/**
	 * Arm at 0, play a note from 100 to 250, close at 500. Recording starts at the FIRST
	 * NOTE, so the loop is 400ms long with events at 0 and 150 — the 100ms spent reaching
	 * the keyboard is not part of it.
	 */
	const recorded = () => {
		const r = new PatternRecorder()
		r.press(0)
		r.record(5, true, 100)
		r.record(5, false, 250)
		r.press(500)
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
		r.press(500)
		expect(r.state).toBe("stopped")
		r.press(600)
		expect(r.state).toBe("playing")
	})

	it("the loop starts at the FIRST NOTE, not at the arm press", () => {
		const r = recorded()
		expect(r.loopMs).toBe(400) // 500 - 100, not 500 - 0
		expect(r.snapshot().events.map((e) => e.atMs)).toEqual([0, 150])
	})

	it("sitting armed forever costs nothing", () => {
		const r = new PatternRecorder()
		r.press(0)
		r.advance(MAX_RECORD_MS * 3, 10) // no note yet — the cap hasn't started
		expect(r.state).toBe("recording")
	})

	it("stopping PAUSES — the playhead stays where it was", () => {
		const r = recorded()
		r.advance(600, 100) // 0 -> 100, past the note-on at 0
		expect(r.sounding).toEqual(new Set([5]))
		r.press(600) // stop
		expect(r.sounding.size).toBe(0) // silenced ...
		r.press(700) // ... and resumed from 100, NOT rewound
		r.advance(740, 40) // 100 -> 140: nothing there
		expect(r.sounding.size).toBe(0) // a rewind would have replayed the note-on at 0
		r.advance(800, 60) // 140 -> 200: the note-off at 150
		expect(r.sounding.size).toBe(0)
	})

	it("only clear rewinds the playhead", () => {
		const r = recorded()
		r.advance(600, 100)
		r.press(600) // stop, playhead at 100
		r.clear()
		expect(r.state).toBe("empty")
		// Re-record and the new loop starts clean at 0.
		r.press(1000)
		r.record(9, true, 1100)
		r.press(1400)
		expect(r.snapshot().events[0].atMs).toBe(0)
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
		r.record(5, true, 100) // the cap counts from HERE
		r.advance(100 + MAX_RECORD_MS - 1, 10)
		expect(r.state).toBe("recording")
		r.advance(100 + MAX_RECORD_MS + 1, 10)
		expect(r.state).toBe("playing")
		expect(r.loopMs).toBeGreaterThanOrEqual(MAX_RECORD_MS)
	})

	it("loops — the same note comes round again", () => {
		const r = recorded() // events at 0 and 150, loop 400
		r.advance(600, 100) // 0 -> 100, note on (offset 0)
		expect(r.sounding).toEqual(new Set([5]))
		r.advance(700, 100) // 100 -> 200, note off at 150
		expect(r.sounding.size).toBe(0)
		r.advance(1000, 250) // 200 -> wraps -> 50, picking up the note-on at 0
		expect(r.sounding).toEqual(new Set([5]))
	})

	it("quantises the loop LENGTH but not the events inside it", () => {
		const r = new PatternRecorder()
		r.press(0)
		r.record(5, true, 137) // loop starts here
		r.record(7, true, 200)
		r.press(437, 100) // raw 300ms, quantum 100ms
		expect(r.loopMs).toBe(300)
		expect(r.snapshot().events.map((e) => e.atMs)).toEqual([0, 63]) // untouched
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
