// src/util/restoreGuards.ts — reading back a preset without trusting it.
//
// `Page.restore(config)` is handed whatever is in a JSON file on disk: written by an
// older build, hand-edited, truncated by a crash, or produced by a version of the page
// whose fields have since changed shape. It must never throw and never leave the page
// half-restored — a bad preset should degrade to defaults, not break the slot.
//
// So every restore reads through these: each one takes the raw value AND the fallback it
// should land on, and is guaranteed to return something of exactly the fallback's shape.
// The fallback is normally the freshly-constructed default, which is why a missing field
// costs nothing to handle.
//
// These are shape guards, not semantics: a page still owns its own meaning (clamping a
// setting against its SettingSpec, refusing an unknown scale name). See docs/PAGE_PROTOCOL.md.

export const isRecord = (v: unknown): v is Record<string, unknown> =>
	typeof v === "object" && v !== null && !Array.isArray(v)

/** A finite integer in [min, max], or `fallback` if it isn't one. */
export const int = (raw: unknown, fallback: number, min: number, max: number): number => {
	const n = Number(raw)
	if (!Number.isFinite(n)) return fallback
	return Math.min(max, Math.max(min, Math.round(n)))
}

/** A finite number in [min, max] (no rounding), or `fallback`. */
export const num = (raw: unknown, fallback: number, min: number, max: number): number => {
	const n = Number(raw)
	if (!Number.isFinite(n)) return fallback
	return Math.min(max, Math.max(min, n))
}

export const bool = (raw: unknown, fallback: boolean): boolean => {
	if (typeof raw === "boolean") return raw
	if (typeof raw === "number") return raw !== 0
	if (raw === "true" || raw === "1") return true
	if (raw === "false" || raw === "0") return false
	return fallback
}

/**
 * Integers shaped exactly like `fallback`: same length, each element clamped, each bad or
 * missing element taking that index's default. A longer array is truncated, a shorter one
 * padded from the fallback — which is what makes a preset written when the grid model had
 * fewer rows still load.
 */
export const intArray = (
	raw: unknown,
	fallback: readonly number[],
	min: number,
	max: number
): number[] => {
	const src = Array.isArray(raw) ? raw : []
	return fallback.map((def, i) => int(src[i], def, min, max))
}

/** Same, one dimension up: shaped exactly like `fallback`, row by row. */
export const intMatrix = (
	raw: unknown,
	fallback: readonly (readonly number[])[],
	min: number,
	max: number
): number[][] => {
	const src = Array.isArray(raw) ? raw : []
	return fallback.map((row, i) => intArray(src[i], row, min, max))
}

/**
 * A set of distinct integers drawn from `raw`, each in [min, max]. Out-of-range and
 * duplicate entries are dropped; if nothing survives and `fallback` is given, that is
 * used instead — the way a page keeps an invariant like "always at least one track
 * selected" through a bad file.
 */
export const intSet = (
	raw: unknown,
	min: number,
	max: number,
	fallback?: readonly number[]
): Set<number> => {
	const out = new Set<number>()
	if (Array.isArray(raw)) {
		for (const item of raw) {
			const n = Number(item)
			if (!Number.isFinite(n)) continue
			const v = Math.round(n)
			if (v < min || v > max) continue
			out.add(v)
		}
	}
	if (!out.size && fallback) for (const v of fallback) out.add(v)
	return out
}

/**
 * Map over an array of records, keeping only the entries a reader accepts (it returns
 * undefined to reject one), and never reading more than `limit` of them — a preset file
 * is untrusted input, and an unbounded event list is an unbounded allocation.
 */
export const records = <T>(
	raw: unknown,
	limit: number,
	read: (node: Record<string, unknown>) => T | undefined
): T[] => {
	if (!Array.isArray(raw)) return []
	const out: T[] = []
	for (const item of raw) {
		if (out.length >= limit) break
		if (!isRecord(item)) continue
		const value = read(item)
		if (value !== undefined) out.push(value)
	}
	return out
}
