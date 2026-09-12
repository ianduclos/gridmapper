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
import { type AppClock, isLane } from "./clock.js"
import type { IdleManager } from "./idleManager.js"
import type { SettingsStore } from "./settings.js"
import type { PresetStore } from "./presetStore.js"
import { isValidPresetName } from "./presetStore.js"
import {
	applySystemConfig,
	captureSystemConfig,
	withSlotPage,
	type SystemConfigTarget,
} from "./systemConfig.js"
import { isPageType } from "../pages/registry.js"

/**
 * Where a control message came from. The two differ in exactly one way: an OSC-originated
 * SETTINGS WRITE has its reply kept off the OSC wire (see withOscEchoSuppressed).
 */
export type ControlOrigin = "osc" | "ui"

/**
 * A page-relative settings WRITE: /setting/<key> <value> or /setting/<key>/<value>
 * (plural tolerated, as the pages themselves do). `/settings/get` is excluded — it is a
 * request FOR a reply, so suppressing that one would break the re-sync path.
 *
 * Deliberately narrow. Pages also tolerate a terse `/<key> <value>`, but blanket-matching
 * one path segment would swallow every other page route a patch might send; the canonical
 * form above is the one with echo discipline, and the handshake doc says so.
 */
const SETTING_WRITE_PATTERN = /^\/settings?\/(?!get$)[^/]+(?:\/[^/]+)?$/

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
	/** Named presets + the persisted live layout. Omit and /grid/in/preset/* is inert. */
	presets?: PresetStore
	/**
	 * Run `fn` with page output kept OFF the OSC wire — the web UI (if any) must still
	 * receive it. Only the caller knows how its transports are wired, so only the caller
	 * can do this; the router just says when. Default: no suppression.
	 */
	withOscEchoSuppressed?: (fn: () => void) => void
}

/**
 * Build the `(path, args, origin?) => void` router. Unknown paths are ignored, not thrown.
 * `origin` defaults to "osc", which is the conservative choice: it is the only origin that
 * gets its settings echo suppressed, so a caller that forgets to pass one can't feed back.
 */
export function createOscRouter(
	opts: OscRouterOpts
): (path: string, args: any[], origin?: ControlOrigin) => void {
	const { pm, shift, reconnect, onKey, emit, slotPages, clock, idle, settings, presets } = opts
	const withOscEchoSuppressed = opts.withOscEchoSuppressed ?? ((fn: () => void) => fn())

	// What systemConfig needs to load pages and read them back. slotPages is shared by
	// reference with the caller (the web UI's slot chips read the same array).
	const target: SystemConfigTarget = { pm, slotPages }

	const emitPresetState = () => {
		if (!presets) return
		for (const m of presets.state()) emit(m.path, ...m.args)
	}

	const truthy = (v: unknown) => v === true || v === "true" || Number(v) > 0

	return function routeControl(path: string, args: any[], origin: ControlOrigin = "osc") {
		// Anything arriving here is input: it keeps the app awake / wakes it up.
		idle?.activity()

		// /grid/in/ping <token> → /grid/out/pong <token>, echoed verbatim. The liveness
		// check a Max patch opens with: gridmapper announces /grid/out/hello once at boot
		// and nothing after, so a patch opened later has no broadcast to wait on and must
		// initiate. Distinct from /grid/in/heartbeat below, which answers nothing.
		if (path === "/grid/in/ping") {
			emit("/grid/out/pong", ...args)
			return
		}

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
		// /grid/in/clock/tick [lane] — one manual step. Advances the lane whatever its
		// source, so it drives an external lane and still works as a nudge on an internal
		// one. No arg → lane 0.
		if (path === "/grid/in/clock/tick") {
			const lane = args.length ? Number(args[0]) : 0
			clock?.step(isLane(lane) ? lane : 0)
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
		//
		// /grid/in/heartbeat is deliberately inert: the activity stamp at the top of this
		// router already did the work, so a Max [metro] has an address it can hit forever
		// that is guaranteed never to do anything else.
		if (path === "/grid/in/heartbeat") return
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
			if (slot !== undefined && isPageType(name)) {
				// Rebuild ONLY this slot, so the other seven keep their live runtime state.
				// load() into the focused slot also fires onFrame(..., "focus").
				applySystemConfig(withSlotPage(captureSystemConfig(target), slot, name), target, [slot])
				emit("/grid/out/slots", ...slotPages)
				// The layout no longer matches any saved preset, so the marker is cleared
				// (and the new layout persisted) — the rule twistermapper follows for a
				// single-slot edit. Only announce the clear if there was a name to lose.
				if (presets) {
					const hadName = presets.activeName() !== null
					presets.setActive(captureSystemConfig(target), null)
					if (hadName) emit("/grid/out/preset/active", "")
				}
			}
			return
		}

		// --- presets (core/presetStore.ts) ---------------------------------------------
		// /grid/out/preset/active is the boot handshake's COMPLETION SIGNAL: it is emitted
		// only after every slot's page has been built and has announced itself, so a patch
		// that waits for it knows the whole interface exists. "" means no preset is active
		// — a failed load, or a layout edited since it was loaded.
		if (path === "/grid/in/preset/list") {
			emitPresetState()
			return
		}
		if (path === "/grid/in/preset/load") {
			if (!presets) return
			const name = args[0]
			const cfg = isValidPresetName(name) ? presets.read(name) : null
			if (!cfg) {
				console.warn(`[Presets] Load failed: "${String(name)}"`)
				emit("/grid/out/preset/active", "")
				return
			}
			applySystemConfig(cfg, target) // every slot; pages announce from init()
			emit("/grid/out/slots", ...slotPages)
			presets.setActive(cfg, name)
			emit("/grid/out/preset/active", name)
			return
		}
		// /grid/in/preset/save <name> — THE WEB PANEL ONLY, by design. Capturing the live
		// machine is how a preset gets made, but a Max patch must not be able to overwrite
		// one mid-set: a stray message would silently replace the thing you were about to
		// recall. So this is the one route where the origin decides, and an OSC-borne save
		// is dropped on the floor rather than answered.
		if (path === "/grid/in/preset/save") {
			if (!presets || origin !== "ui") return
			const name = args[0]
			if (!isValidPresetName(name)) return
			// The LIVE machine, not the last-loaded file: save means "keep what I've got",
			// including every page's own state via serialize().
			const cfg = captureSystemConfig(target)
			if (!presets.write(name, cfg)) return
			presets.setActive(cfg, name)
			emitPresetState()
			return
		}
		if (path === "/grid/in/preset/delete") {
			if (!presets) return
			const name = args[0]
			if (!isValidPresetName(name) || !presets.remove(name)) return
			// Deleting the preset you are running doesn't change the running layout, only
			// where it came from.
			if (presets.activeName() === name) presets.setActive(presets.active(), null)
			emitPresetState()
			return
		}

		// /grid/in/page/<a..h>/<rest> → page.onOsc. e.g. /grid/in/page/a/setting/npo 7.
		const pageMatch = path.match(/^\/grid\/in\/page\/([a-hA-H])\/(.+)$/)
		if (pageMatch) {
			const slot = slotFromLabel(pageMatch[1])
			if (slot === undefined) return
			const sub = `/${pageMatch[2]}`
			// A settings write that arrived over OSC must not echo back to OSC: the page
			// re-emits /grid/out/page/<slot>/settings on every accepted write, and a patch
			// that both sends settings and listens for them would feed back on itself. The
			// web UI still sees it (it isn't what sent the message), and a write from the
			// web UI still reaches Max. Only this one route is treated this way — the
			// notes, chords and patterns a page emits during the same dispatch are real
			// output and go out normally.
			if (origin === "osc" && SETTING_WRITE_PATTERN.test(sub)) {
				withOscEchoSuppressed(() => pm.routeOscToPage(slot, sub, args))
			} else {
				pm.routeOscToPage(slot, sub, args)
			}
			return
		}
	}
}
