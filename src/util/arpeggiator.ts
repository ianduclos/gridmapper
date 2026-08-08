/* Arpeggiator — turns a held chord into one note at a time.
 *
 * Deliberately knows nothing about pitch, tracks or timing: it walks INDICES into a pool
 * whose size the caller supplies, and the caller decides when a step happens. That keeps
 * every mode a pure function of (mode, size, position) and leaves the musical decisions —
 * which notes are in the pool, which tracks they go to — with the page.
 *
 * The four modes:
 *   ascending   0 1 2 3 · 0 1 2 3 …
 *   descending  3 2 1 0 · 3 2 1 0 …
 *   palindrome  0 1 2 3 2 1 · 0 1 2 3 2 1 …   (endpoints NOT doubled)
 *   urn         a random permutation, no repeats until the bag empties, then reshuffled
 */

export const ARP_MODES = ["off", "ascending", "descending", "palindrome", "urn"] as const
export type ArpMode = (typeof ARP_MODES)[number]

export const isArpMode = (v: unknown): v is ArpMode =>
	(ARP_MODES as readonly string[]).includes(v as string)

/** The four playable modes, in the order they sit on the grid (rows 4-7). */
export const ARP_BUTTONS: ArpMode[] = ["ascending", "descending", "palindrome", "urn"]

/**
 * The index order one cycle of `mode` visits, for a pool of `size`.
 *
 * Palindrome reflects without doubling the ends, so a 4-note chord is 0 1 2 3 2 1 rather
 * than 0 1 2 3 3 2 1 0 — the turnaround should not sit on a note twice as long as the rest.
 * Sizes 0 and 1 collapse to the trivial answers, which is what stops a one-note "chord"
 * from producing a two-step cycle.
 */
export function arpSequence(mode: ArpMode, size: number): number[] {
	if (size <= 0 || mode === "off") return []
	const up = Array.from({ length: size }, (_, i) => i)
	switch (mode) {
		case "descending":
			return up.reverse()
		case "palindrome":
			return size <= 2 ? up : [...up, ...up.slice(1, -1).reverse()]
		default:
			return up // ascending; urn draws its own order
	}
}

/** Injectable so urn tests are deterministic. Returns [0, 1). */
export type Rng = () => number

/** Fisher-Yates over a fresh 0..size-1. */
function shuffled(size: number, rng: Rng): number[] {
	const a = Array.from({ length: size }, (_, i) => i)
	for (let i = a.length - 1; i > 0; i--) {
		const j = Math.floor(rng() * (i + 1))
		;[a[i], a[j]] = [a[j], a[i]]
	}
	return a
}

/**
 * Walks a list of notes in `mode`, one `next()` per musical step.
 *
 * Takes the note list rather than just its length, because the pool changes constantly —
 * you add a finger, a loop lets a note go — and the thing that has to stay true across
 * those changes is "don't play the same note twice in a row". Growing a chord shifts every
 * index, so an index-only cursor happily repeats the note it just played; tracking the last
 * NOTE and skipping a repeat is what makes building a chord finger by finger sound right.
 * Changing size also refills the urn, since a bag drawn for four notes means nothing once
 * there are five.
 */
export class Arpeggiator {
	mode: ArpMode = "off"
	private pos = 0
	private size = 0
	private bag: number[] = []
	private lastNote: number | null = null

	constructor(private rng: Rng = Math.random) {}

	get isOn(): boolean {
		return this.mode !== "off"
	}

	/** Pressing the lit button turns the arp off; any other selects it. */
	toggle(mode: ArpMode): void {
		this.mode = this.mode === mode ? "off" : mode
		this.reset()
	}

	set(mode: ArpMode): void {
		if (mode === this.mode) return
		this.mode = mode
		this.reset()
	}

	reset(): void {
		this.pos = 0
		this.bag = []
		this.lastNote = null
	}

	/**
	 * The next NOTE from `pool`, or null if there is nothing to play. Advances the cursor, so
	 * call it exactly once per step. A repeat of the note just played is skipped — unless
	 * the pool holds only one note, where repeating is the whole point.
	 */
	next(pool: readonly number[]): number | null {
		if (!this.isOn || !pool.length) {
			this.lastNote = null
			return null
		}
		if (pool.length !== this.size) {
			this.size = pool.length
			this.bag = [] // the old bag was drawn for a different chord
			if (this.pos >= pool.length) this.pos = 0
		}
		let note = this.draw(pool)
		if (pool.length > 1 && note === this.lastNote) note = this.draw(pool)
		this.lastNote = note
		return note
	}

	private draw(pool: readonly number[]): number {
		if (this.mode === "urn") {
			if (!this.bag.length) this.bag = shuffled(pool.length, this.rng)
			return pool[this.bag.pop()!]
		}
		const seq = arpSequence(this.mode, pool.length)
		const idx = seq[this.pos % seq.length]
		this.pos = (this.pos + 1) % seq.length
		return pool[idx]
	}
}
