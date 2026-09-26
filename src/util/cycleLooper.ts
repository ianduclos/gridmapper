/* CycleLooper — a gesture looper locked to a rhythm world's cycle (cells-hot).
 *
 * Moves are recorded at fractional PERFORMANCE PULSES (the page's own pulse count), not
 * wall-clock ms. A take is anchored to the cycle boundary at or before its first move, and
 * closing rounds its length to the nearest whole number of cycles (at least one), so a
 * loop restates exactly against the hocket and follows tempo changes for free. The cycle
 * is the one pulse count at which every cell of the world realigns (see
 * `worldCyclePulses` in pages/cells-hot.ts).
 *
 * Playback position is `(pulse - anchor) mod length`. The anchor and length are both
 * whole cycles, so after a restart (pulse back to 0) the loop is still cycle-aligned.
 * Pausing does not hold a playhead: a resumed loop comes back at its aligned position.
 *
 * Pure state over numbers: the page drives it from onTick; no timers.
 */

export type LoopState = "empty" | "recording" | "playing" | "stopped"

export interface LoopEvent {
	/** Offset from the loop's start, in performance pulses. */
	atPulse: number
	id: string
	value: number
}

/** A take longer than this many cycles closes itself and starts looping. */
export const MAX_LOOP_CYCLES = 16

export class CycleLooper {
	state: LoopState = "empty"
	lengthPulses = 0
	anchor = 0
	events: LoopEvent[] = []
	private cycle = 0

	/** Arm → close → play ⇄ pause. `pulse` is the page's current pulse, if it is playing. */
	press(pulse: number | undefined): void {
		if (this.state === "empty") {
			this.state = "recording"
			this.events = []
		} else if (this.state === "recording") this.close(pulse)
		else this.state = this.state === "playing" ? "stopped" : "playing"
	}

	clear(): void {
		this.state = "empty"
		this.events = []
		this.lengthPulses = 0
		this.anchor = 0
	}

	/** A hand move. The first one anchors the take on its cycle boundary. */
	record(id: string, value: number, pulse: number, cyclePulses: number): void {
		if (this.state !== "recording" || cyclePulses <= 0) return
		if (!this.events.length) {
			this.cycle = cyclePulses
			this.anchor = Math.floor(pulse / cyclePulses) * cyclePulses
		}
		this.events.push({ atPulse: pulse - this.anchor, id, value })
	}

	/** Close at the cap. Returns true when the state changed. */
	tick(pulse: number): boolean {
		if (
			this.state !== "recording" ||
			!this.events.length ||
			pulse - this.anchor < MAX_LOOP_CYCLES * this.cycle
		)
			return false
		this.close(pulse)
		return true
	}

	/**
	 * Close the take at `pulse`: the nearest whole cycle count, at least one; moves past
	 * the rounded end are dropped. Without a pulse (the page stopped mid-take) it keeps
	 * every move: the smallest whole cycle count that holds the last one. A take with no
	 * moves goes back to empty.
	 */
	close(pulse: number | undefined): void {
		if (!this.events.length) {
			this.clear()
			return
		}
		const last = this.events[this.events.length - 1].atPulse
		const cycles =
			pulse === undefined
				? Math.ceil((last + 1e-9) / this.cycle)
				: Math.round((pulse - this.anchor) / this.cycle)
		const n = Math.min(MAX_LOOP_CYCLES, Math.max(1, cycles))
		this.lengthPulses = n * this.cycle
		this.events = this.events.filter((e) => e.atPulse < this.lengthPulses)
		this.anchor = ((this.anchor % this.lengthPulses) + this.lengthPulses) % this.lengthPulses
		this.state = "playing"
	}

	/** Moves due in the pulse window [from, to), with the absolute pulse each lands on. */
	due(from: number, to: number): Array<LoopEvent & { pulse: number }> {
		const L = this.lengthPulses
		if (this.state !== "playing" || L <= 0 || to <= from) return []
		const out: Array<LoopEvent & { pulse: number }> = []
		const base = from - (((from - this.anchor) % L) + L) % L // loop start at or before `from`
		for (let start = base; start < to; start += L)
			for (const e of this.events) {
				const pulse = start + e.atPulse
				if (pulse >= from && pulse < to) out.push({ ...e, pulse })
			}
		return out.sort((a, b) => a.pulse - b.pulse)
	}

	snapshot() {
		return {
			lengthPulses: this.lengthPulses,
			anchor: this.anchor,
			cycle: this.cycle,
			events: this.events.map((e) => ({ ...e })),
		}
	}

	/** Restore a loop (already validated by the page); it comes back paused. */
	restore(s: { lengthPulses: number; anchor: number; cycle: number; events: LoopEvent[] }): void {
		this.clear()
		if (s.lengthPulses <= 0 || !s.events.length) return
		this.lengthPulses = s.lengthPulses
		this.anchor = s.anchor
		this.cycle = s.cycle > 0 ? s.cycle : s.lengthPulses
		this.events = s.events.filter((e) => e.atPulse < s.lengthPulses)
		this.state = this.events.length ? "stopped" : "empty"
	}
}
