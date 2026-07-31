// src/core/oscRouter.ts — the ONE control-routing dialect, shared by web + Max + daemon.
//
// Both `cli/sim.ts` (web UI + Max) and `cli/index.ts` (the headless daemon) receive the
// same `/grid/in/...` messages and must react identically — that's the whole point of a
// single vocabulary (see CLAUDE.md's "OSC vocabulary"). Before this module the two files
// duplicated the handler, which is how the daemon quietly ended up missing
// `/grid/in/slot/<a..h>/page` (Max couldn't assign pages to slots headless). Routing
// logic now lives in exactly one place so the two entry points can't drift again.
//
// Callers own transport (WS vs OSC), held-key tracking, and how "emit" reaches the
// outside world; this module owns only the path → action mapping.

import type { KeyEvent } from "./types.js"
import { slotFromLabel, slotLabel } from "./types.js"
import type { PageManager } from "./pageManager.js"
import type { ShiftInput } from "./shiftInput.js"
import type { AppClock } from "./clock.js"
import type { IdleManager } from "./idleManager.js"
import type { SettingsStore } from "./settings.js"
import { isPageType, pageFactory } from "../pages/registry.js"

export interface OscRouterOpts {
	pm: PageManager
	shift: ShiftInput
	/** Force a fresh grid handshake (conn.reconnect). */
	reconnect: () => void | Promise<void>
	/** Caller's key handler — held-tracking + pm.onKey (see sim.ts / index.ts). */
	onKey: (e: KeyEvent) => void
	/** App-out channel: at minimum sends to Max; sim's also broadcasts to the web. */
	emit: (path: string, ...args: Array<number | string | boolean>) => void
	/** Live array of current page-type names per slot, mutated in place on load. */
	slotPages: string[]
	/** The app transport. Omit only in tests that don't exercise /grid/in/clock/*. */
	clock?: AppClock
	/** Sleep policy — every inbound message counts as activity. */
	idle?: IdleManager
	/** Live, persisted app settings (/grid/in/settings/<section>/<key>). */
	settings?: SettingsStore
}

/** Build the `(path, args) => void` router. Unknown paths are ignored, not thrown. */
export function createOscRouter(opts: OscRouterOpts): (path: string, args: any[]) => void {
	const { pm, shift, reconnect, onKey, emit, slotPages, clock, idle, settings } = opts

	const truthy = (v: unknown) => v === true || v === "true" || Number(v) > 0

	return function routeControl(path: string, args: any[]) {
		// Anything arriving here is input: it keeps the app awake / wakes it up.
		idle?.activity()

		if (path === "/grid/in/key") {
			const [x, y, s] = args.map((n: any) => Number(n))
			onKey({ x, y, s: (s ? 1 : 0) as 0 | 1 })
			return
		}
		if (path === "/grid/in/connect") {
			// Manual recovery (indicator click / explicit Max message) → fresh handshake.
			void reconnect()
			return
		}
		// /grid/in/shift <which:1|2> <state:1|0> — external shift buttons (debounced).
		if (path === "/grid/in/shift") {
			shift.set(Number(args[0]), !!Number(args[1]))
			return
		}

		// --- transport (core/clock.ts) ------------------------------------------------
		// The clock boots stopped; nothing ticks until /grid/in/clock/run 1 (or a manual
		// /grid/in/clock/tick, which advances under either source).
		if (path === "/grid/in/clock/run") {
			clock?.setRunning(args.length ? truthy(args[0]) : true)
			return
		}
		if (path === "/grid/in/clock/tick") {
			clock?.step()
			return
		}
		if (path === "/grid/in/clock/reset") {
			clock?.reset()
			return
		}
		if (path === "/grid/in/clock/get") {
			if (clock) emit("/grid/out/clock", JSON.stringify(clock.state))
			return
		}

		// --- idle / render-loop power -------------------------------------------------
		// Waking is implicit above (idle.activity()); these are the explicit overrides.
		if (path === "/grid/in/wake") {
			idle?.wake()
			return
		}
		if (path === "/grid/in/sleep") {
			idle?.sleep()
			return
		}

		// --- live, persisted settings -------------------------------------------------
		// /grid/in/settings/<section>/<key> <value>, e.g. .../clock/rate 30. The store
		// clamps, notifies the host (which applies it to the live clock/idle) and saves.
		if (path === "/grid/in/settings/get") {
			if (settings) emit("/grid/out/settings", settings.json())
			return
		}
		const settingMatch = path.match(/^\/grid\/in\/settings\/(.+)$/)
		if (settingMatch) {
			if (settings?.apply(settingMatch[1], args[0])) emit("/grid/out/settings", settings.json())
			return
		}
		// /grid/in/focus/page <a..h> — one slot dialect everywhere (web + Max + daemon).
		if (path === "/grid/in/focus/page") {
			const slot = typeof args[0] === "string" ? slotFromLabel(args[0]) : undefined
			if (slot !== undefined) {
				pm.focus(slot) // PageManager.focus() fires onFrame(..., "focus") itself
				emit("/grid/out/focus/page", slotLabel(slot))
			}
			return
		}
		const slotPageMatch = path.match(/^\/grid\/in\/slot\/([a-hA-H])\/page$/)
		if (slotPageMatch) {
			const slot = slotFromLabel(slotPageMatch[1])
			const name = args[0]
			const factory = isPageType(name) ? pageFactory(name) : undefined
			if (slot !== undefined && factory) {
				slotPages[slot] = name
				pm.load(slot, factory) // load() into the focused slot also fires onFrame(..., "focus")
				emit("/grid/out/slots", ...slotPages)
			}
			return
		}
		// /grid/in/page/<a..h>/<rest> → page.onOsc. e.g. /grid/in/page/a/setting/npo 7.
		const pageMatch = path.match(/^\/grid\/in\/page\/([a-hA-H])\/(.+)$/)
		if (pageMatch) {
			const slot = slotFromLabel(pageMatch[1])
			if (slot !== undefined) pm.routeOscToPage(slot, `/${pageMatch[2]}`, args)
			return
		}
	}
}
