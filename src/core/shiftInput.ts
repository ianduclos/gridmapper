// src/core/shiftInput.ts — debounced state for the two app-defined shift buttons.
//
// These shifts live OUTSIDE any page (see PageContext.modifiers). They may be driven
// over OSC (`/grid/in/shift <1|2> <s>`) or, later, by a local source — both call set()
// so behavior is identical. The grid never emits on a shift edge; shift only alters
// internal behavior.
//
// Debounce = LEADING-EDGE LOCKOUT. The first real edge takes effect immediately (a
// shift should feel instant); any further edge — in EITHER direction — is ignored
// until `debounceMs` elapses. That swallows contact chatter (the rapid up/down/up
// burst around a single press/release) without delaying the press. A trailing/wait
// debounce would add latency to every press, which is wrong for a modifier.
//
// Why the previous attempt failed: it only dropped edges whose state EQUALED the
// current one, i.e. verbatim duplicates. Chatter is ALTERNATING edges, so every one
// differed from the current state and slipped through — the state flapped.

export class ShiftInput {
	shift1 = false
	shift2 = false
	// Timestamp of the last ACCEPTED (state-changing) edge, per shift. Ignored chatter
	// does NOT reset it — otherwise a continuous burst would extend the lockout forever.
	private last: Record<1 | 2, number> = { 1: 0, 2: 0 }

	constructor(
		private readonly debounceMs = 20,
		private readonly now: () => number = Date.now
	) {}

	/**
	 * Apply a shift edge. `which` is 1 or 2; `down` is the new state. Returns true iff
	 * the state actually changed (so callers can react / request a repaint).
	 */
	set(which: number, down: boolean): boolean {
		if (which !== 1 && which !== 2) return false
		const w = which as 1 | 2
		const cur = w === 1 ? this.shift1 : this.shift2
		if (down === cur) return false // already in this state — no edge at all
		if (this.now() - this.last[w] < this.debounceMs) return false // inside lockout — chatter
		this.last[w] = this.now()
		if (w === 1) this.shift1 = down
		else this.shift2 = down
		return true
	}
}
