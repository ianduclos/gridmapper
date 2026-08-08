/* PatternRecorder — a free-time note looper.
 *
 * Records note on/off events with wall-clock offsets and loops them. Free time, not clock
 * time: the loop is exactly as long as you played, so it works with the transport stopped
 * (which is how it boots). A per-track quantum can round the LOOP LENGTH to a musical
 * grid; the events inside it are never quantised.
 *
 * The page drives this — it owns the timer and calls `advance()`. Everything here is
 * either pure or a plain state machine over numbers, so it unit-tests without timers.
 *
 * One key cycles the whole state machine:
 *   empty --press--> recording --press--> playing --press--> stopped --press--> playing
 * and a shift-press clears from any state.
 *
 * Arming does NOT start the clock: the loop begins at the FIRST NOTE, so there is no dead
 * air at the top from the time it took you to reach the keyboard. Stopping leaves the
 * playhead where it is and pressing again resumes from there — only a clear rewinds.
 */

export type RecorderState = "empty" | "recording" | "playing" | "stopped"

export interface PatternEvent {
	/** Offset from loop start, in ms. */
	atMs: number
	step: number
	on: boolean
}

/** A recording longer than this closes itself and starts looping. */
export const MAX_RECORD_MS = 60_000

/**
 * Which events fire as the playhead moves `dtMs` forward from `from`, and where it lands.
 *
 * Half-open [from, to) so an event at offset 0 fires on the first advance of a loop and
 * never fires twice at the wrap. A jump longer than the loop (laptop suspend, a long GC)
 * is clamped to a single pass rather than machine-gunning every missed repeat — same
 * choice the app clock makes about catch-up.
 */
export function eventsInWindow(
	events: readonly PatternEvent[],
	lengthMs: number,
	from: number,
	dtMs: number,
): { fired: PatternEvent[]; playhead: number } {
	if (lengthMs <= 0 || dtMs <= 0) return { fired: [], playhead: from }
	const fired: PatternEvent[] = []
	let cursor = ((from % lengthMs) + lengthMs) % lengthMs
	let remaining = Math.min(dtMs, lengthMs)
	while (remaining > 0) {
		const span = Math.min(remaining, lengthMs - cursor)
		const end = cursor + span
		for (const e of events) if (e.atMs >= cursor && e.atMs < end) fired.push(e)
		cursor = end >= lengthMs ? 0 : end
		remaining -= span
	}
	return { fired, playhead: cursor }
}

/** Round a recorded length onto a grid, never down to nothing. */
export function quantiseLength(lengthMs: number, quantumMs: number): number {
	if (quantumMs <= 0) return lengthMs
	return Math.max(quantumMs, Math.round(lengthMs / quantumMs) * quantumMs)
}

export class PatternRecorder {
	state: RecorderState = "empty"
	/** Steps this recorder is currently asking to sound. */
	readonly sounding = new Set<number>()

	private events: PatternEvent[] = []
	private lengthMs = 0
	private recStartMs = 0
	/** Arming alone doesn't start the clock — the first recorded note does. */
	private recArmed = false
	private playhead = 0
	/**
	 * Note-offs held over to the next advance. A stab recorded as on-and-off inside one
	 * window would otherwise cancel itself out before anyone downstream saw it — the note
	 * pipeline is level-based (a SET of sounding steps), not event-based, so a note that
	 * goes on and off between two samples simply never existed. Deferring the off gives
	 * every recorded note a floor of one tick.
	 */
	private pendingOff: number[] = []

	/** Recording or playing — i.e. the page's timer needs to be running. */
	get isRunning(): boolean {
		return this.state === "recording" || this.state === "playing"
	}

	get hasContent(): boolean {
		return this.events.length > 0 && this.lengthMs > 0
	}

	get loopMs(): number {
		return this.lengthMs
	}

	/** The one key. Returns true if anything changed that the caller should react to. */
	press(nowMs: number, quantumMs = 0): void {
		switch (this.state) {
			case "empty":
			case "stopped":
				if (this.state === "stopped" && this.hasContent) {
					this.state = "playing" // resume where it was paused
					return
				}
				this.events = []
				this.lengthMs = 0
				this.recStartMs = nowMs
				this.recArmed = true // waiting for the first note to start the clock
				this.state = "recording"
				return
			case "recording":
				this.close(nowMs, quantumMs)
				return
			case "playing":
				// Pause, don't rewind: the playhead is left alone so the next press picks
				// the loop up mid-phrase. Only clear() goes back to the top.
				this.state = "stopped"
				this.sounding.clear()
				this.pendingOff = []
				return
		}
	}

	/** Everything needed to restore this pattern later (preset capture). */
	snapshot(): { lengthMs: number; events: PatternEvent[] } {
		return { lengthMs: this.lengthMs, events: this.events.map((e) => ({ ...e })) }
	}

	/** Shift-press: throw the pattern away. */
	clear(): void {
		this.state = "empty"
		this.events = []
		this.lengthMs = 0
		this.recArmed = false
		this.playhead = 0 // the ONLY thing that rewinds
		this.sounding.clear()
		this.pendingOff = []
	}

	/** Tap the live note stream. Ignored unless recording. */
	record(step: number, on: boolean, nowMs: number): void {
		if (this.state !== "recording") return
		if (this.recArmed) {
			this.recStartMs = nowMs // the loop starts HERE, at the first note
			this.recArmed = false
		}
		this.events.push({ atMs: nowMs - this.recStartMs, step, on })
	}

	/**
	 * Move time forward. Closes an over-long recording, then plays any events that fall in
	 * the window, updating `sounding`. Returns true if `sounding` changed.
	 */
	advance(nowMs: number, dtMs: number, quantumMs = 0): boolean {
		if (this.state === "recording") {
			// The cap measures from the first note, so sitting armed forever is fine.
			if (this.recArmed || nowMs - this.recStartMs < MAX_RECORD_MS) return false
			this.close(nowMs, quantumMs) // hit the cap: close the loop and start playing
			return false
		}
		if (this.state !== "playing") return false
		let changed = false
		for (const step of this.pendingOff) if (this.sounding.delete(step)) changed = true
		this.pendingOff = []

		const { fired, playhead } = eventsInWindow(this.events, this.lengthMs, this.playhead, dtMs)
		this.playhead = playhead
		const onThisWindow = new Set<number>()
		for (const e of fired) {
			if (e.on) {
				onThisWindow.add(e.step)
				if (!this.sounding.has(e.step)) { this.sounding.add(e.step); changed = true }
			} else if (onThisWindow.has(e.step)) {
				this.pendingOff.push(e.step) // hold it one tick so the stab is audible
			} else if (this.sounding.delete(e.step)) changed = true
		}
		return changed
	}

	/** Close a recording into a loop. An empty take just goes back to empty. */
	private close(nowMs: number, quantumMs: number): void {
		const raw = nowMs - this.recStartMs
		if (!this.events.length || raw <= 0) {
			this.clear()
			return
		}
		this.lengthMs = quantiseLength(raw, quantumMs)
		this.recArmed = false
		this.playhead = 0
		this.sounding.clear()
		this.pendingOff = []
		this.state = "playing"
	}
}
