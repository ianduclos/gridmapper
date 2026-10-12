/* Page: Clips  (Ableton Live Session-view clip launcher, over the idk.clips fork)
 * ------------------------------------------------------------------------------
 * Summary : Launch clips and scenes in Live's Session view from a 15×6 window that banks
 *           four ways; Live's red box follows. Layers for mute / solo / arm / volume.
 * Input   : x0–14 × y0–5 = clips. Press and release both go to Live (/clips/slot/button),
 *           so Gate, Repeat and legato behave as in Live. x15 y0–5 = scenes.
 *           y6 = track stop (C layer) or that layer's toggle (M/S/A); x15 y6 = stop all.
 *           y7: x0 = pages key (hold, then x0–7 on y0 → slot a–h) · x1–5 = layers C M S A V
 *           (tap latches, hold >300 ms is momentary, tap C to return) · x11–14 = ← → ↑ ↓
 *           bank a whole window · x15 = ⇧ (+ arrow: move by one).
 *           V layer: x0–14 × y0–6 = 7-step faders (y0 = 0 dB, y6 = −∞); x15 = master,
 *           shown but not settable (the contract has no master address yet).
 * Display : one table, util/clipsState.ts LEVEL. Blinks follow /clips/beat, or a local
 *           500 ms clock while Live sends none. No link to Live: a dim border.
 * Settings: stagedLaunch (experiment, off): hold ⇧, tap clips, release ⇧ to fire together.
 * Rules   : Reaches Live ONLY through ctx.live (/clips/..., io/liveLink.ts, 11000/11001),
 *           never ctx.osc; Max hears only /grid/out/page/<slot>/focus/track <n> (+ type,
 *           settings). Absolute track/scene indices: a release goes to the slot its press
 *           hit, even after a bank move or a layer change. The last launched track is
 *           published in SharedStore "focus/clips" (this page is its one writer). Presets
 *           keep the setting only — the window, the link and anything staged are runtime,
 *           and restoring sends nothing to Live. One timer (LINK_TICK_MS) drives the hello
 *           retry and the quiet-link probe; it is cleared in dispose(), not onBlur(), so the
 *           link stays current while another slot is on screen.
 *           Contract: idk.clips' spec (2026-10-12); our readings: docs/clips-contract-notes.md.
 * ------------------------------------------------------------------------------
 */

import type { Page, PageContext, KeyEvent, LedFrame, GridSize, Slot } from "../core/types.js"
import type { KeySpec, PageModule, SettingSpec } from "../core/pageModule.js"
import { FOCUS_CLIPS } from "../core/sharedStore.js"
import { isRecord, bool } from "../util/restoreGuards.js"
import {
	createClipsState, applyLive, linkTick, pressKey, clipsFrame,
	COLS, ROWS, SCENE_COL, STOP_ROW, CTRL_ROW, SHIFT_X, PAGES_X, ARROWS, LAYER_KEYS, LEVEL,
	type ClipsState, type KeyResult,
} from "../util/clipsState.js"

/** How often the link timer runs; linkTick itself paces the hellos (2 s) and probes (10 s). */
export const LINK_TICK_MS = 500

const SPECS: SettingSpec[] = [
	{
		key: "stagedLaunch", label: "staged launch", type: "toggle", default: false,
		help: "Experiment: hold ⇧ (x15 y7), tap clips, release ⇧ to fire them together.",
	},
]
const SPEC_BY_KEY = new Map(SPECS.map((s) => [s.key, s]))

export class ClipsPage implements Page {
	private st: ClipsState = createClipsState()
	private size: GridSize = { width: 16, height: 8 }
	private ownSlot = -1
	private unlisten: (() => void) | null = null
	private timer: ReturnType<typeof setInterval> | null = null

	init(ctx: PageContext) {
		this.size = ctx.size
		this.ownSlot = ctx.slot
		this.unlisten = ctx.live?.on((path, args) => { applyLive(this.st, path, args, Date.now()) }) ?? null
		this.tick(ctx)
		this.timer = setInterval(() => this.tick(ctx), LINK_TICK_MS)
		this.announce(ctx)
	}

	onFocus(ctx: PageContext) {
		this.announce(ctx)
	}

	onBlur() {}

	onKey(ev: KeyEvent, ctx: PageContext) {
		this.apply(pressKey(this.st, ev.x, ev.y, ev.s, Date.now()), ctx)
	}

	// In: /setting/<key> <v> · /<key> <v> · /<key>/<v> · /settings/get.
	onOsc(path: string, args: any[], ctx: PageContext) {
		const parts = path.split("/").filter(Boolean)
		let i = 0
		if (parts[i] === "setting" || parts[i] === "settings") i++
		const key = parts[i]
		if (!key) return
		if (key === "get") {
			this.emitSettings(ctx)
			return
		}
		const raw = args.length ? args[0] : parts[i + 1]
		if (raw === undefined) return
		if (!this.applySetting(key, raw)) return
		this.emitSettings(ctx)
	}

	render(): LedFrame {
		return clipsFrame(this.st, this.size, Date.now(), this.ownSlot)
	}

	/** The setting only: the window, the link and anything staged are runtime. */
	serialize() {
		return { stagedLaunch: this.st.opts.stagedLaunch }
	}

	restore(config: unknown, ctx: PageContext) {
		if (!isRecord(config)) return
		for (const spec of SPECS) if (config[spec.key] !== undefined) this.applySetting(spec.key, config[spec.key])
		this.announce(ctx) // init() announced the defaults; they are stale now
	}

	dispose() {
		this.unlisten?.()
		this.unlisten = null
		if (this.timer) clearInterval(this.timer)
		this.timer = null
	}

	private tick(ctx: PageContext) {
		for (const m of linkTick(this.st, Date.now())) ctx.live?.send(m.path, ...m.args)
	}

	private apply(r: KeyResult, ctx: PageContext) {
		for (const m of r.send) ctx.live?.send(m.path, ...m.args)
		if (r.focus !== undefined) {
			ctx.shared?.set(FOCUS_CLIPS, r.focus)
			ctx.osc.send(`/grid/out/page/${ctx.slotLabel}/focus/track`, r.focus)
		}
		if (r.focusSlot !== undefined) ctx.focus(r.focusSlot as Slot)
	}

	/** Store one setting; returns true if it was a known key. */
	private applySetting(key: string, raw: unknown): boolean {
		if (!SPEC_BY_KEY.has(key)) return false
		if (key === "stagedLaunch") {
			this.st.opts.stagedLaunch = bool(raw, this.st.opts.stagedLaunch)
			if (!this.st.opts.stagedLaunch) this.st.staged = []
		}
		return true
	}

	private announce(ctx: PageContext) {
		ctx.osc.send(`/grid/out/page/${ctx.slotLabel}/type`, "clips")
		this.emitSettings(ctx)
	}

	private emitSettings(ctx: PageContext) {
		ctx.osc.send(`/grid/out/page/${ctx.slotLabel}/settings`, JSON.stringify(this.serialize()))
	}
}

const LAYER_NAMES: Record<string, string> = { clips: "Clips", mute: "Mute", solo: "Solo", arm: "Arm", volume: "Volume" }

const KEYMAP: KeySpec[] = [
	{ x: 0, y: 0, w: COLS, h: ROWS, name: "Clips", help: "Launch a clip; release matters for Gate and Repeat. An empty slot stops its track (or records, if armed). V layer: volume faders.", lit: LEVEL.stopped },
	{ x: SCENE_COL, y: 0, h: ROWS, name: "Scenes", help: "Launch a scene. V layer: master volume, shown only.", lit: LEVEL.scenePresent },
	{ x: 0, y: STOP_ROW, w: COLS, name: "Track stop", help: "Stop a track. M / S / A layers: toggle that track's mute, solo or arm.", lit: LEVEL.stopIdle },
	{ x: SCENE_COL, y: STOP_ROW, name: "Stop all", short: "■", lit: LEVEL.stopIdle },
	{ x: PAGES_X, y: CTRL_ROW, name: "Pages", short: "P", help: "Hold, then press x0–x7 on the top row to jump to slot a–h.", lit: LEVEL.pagesUp },
	...Object.entries(LAYER_KEYS).map(([x, layer]): KeySpec => ({
		x: Number(x), y: CTRL_ROW, name: `${LAYER_NAMES[layer]} layer`, short: layer[0].toUpperCase(),
		help: "Tap to latch, hold for momentary, tap C to return.",
		lit: layer === "clips" ? LEVEL.layerActive : LEVEL.layerOther,
	})),
	{ x: ARROWS.left, y: CTRL_ROW, name: "Bank left", short: "←", lit: LEVEL.arrowCan },
	{ x: ARROWS.right, y: CTRL_ROW, name: "Bank right", short: "→", lit: LEVEL.arrowCan },
	{ x: ARROWS.up, y: CTRL_ROW, name: "Bank up", short: "↑", lit: LEVEL.arrowCan },
	{ x: ARROWS.down, y: CTRL_ROW, name: "Bank down", short: "↓", lit: LEVEL.arrowCan },
	{ x: SHIFT_X, y: CTRL_ROW, name: "Shift", short: "⇧", help: "+ arrow: move by one track or scene. Staged launch: hold, tap clips, release to fire.", lit: LEVEL.shiftUp },
]

export const page: PageModule = {
	name: "clips",
	label: "Clips (Ableton Live)",
	create: () => new ClipsPage(),
	settings: SPECS,
	keymap: KEYMAP,
}
