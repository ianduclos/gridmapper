/* SharedStore — a tiny key/value channel between pages.
 * ------------------------------------------------------------------------------
 * Pages are otherwise sealed from each other. When two pages must agree on live state
 * (cells-hot's damp keys and set-hot's damp row drive the same Max voices), one page
 * publishes under a key and the other subscribes. Each key has ONE writer by convention;
 * name keys `<topic>/<writer>` (e.g. "damp/cells") so ownership is visible. Values are
 * transient runtime state — never saved, never sent over OSC by the store itself.
 */
/** Damp: cells-hot writes its keys (boolean[6]); set-hot, the one sender to Max, publishes
 *  the effective damp per voice (boolean[6]) so other pages can light their keys. */
export const DAMP_FROM_CELLS = "damp/cells"
export const DAMP_STATE = "damp/set-hot"

export class SharedStore {
	private values = new Map<string, unknown>()
	private subs = new Map<string, Set<(value: unknown) => void>>()

	get<T>(key: string): T | undefined {
		return this.values.get(key) as T | undefined
	}

	set(key: string, value: unknown): void {
		this.values.set(key, value)
		for (const fn of [...(this.subs.get(key) ?? [])]) fn(value)
	}

	/** Returns the unsubscribe function; call it from the page's dispose(). */
	subscribe(key: string, fn: (value: unknown) => void): () => void {
		let set = this.subs.get(key)
		if (!set) this.subs.set(key, (set = new Set()))
		set.add(fn)
		return () => set!.delete(fn)
	}
}
