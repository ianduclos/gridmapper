// src/cli/index.ts — the gridmapper daemon.
//
// Wires the proven driver to the page stack: connect the grid, run one render loop
// (the single output path) through the quadrant-aware reconciler, route key events
// to the focused page, and bridge OSC to/from Max. All eight slots run; the layout comes
// from configs/slots.json and the Max boot handshake is docs/max-handshake.md.
//
//   npm run dev            (real hardware)
//   npm run dev -- --null  (no hardware; NullGrid)

import { GridConnection } from "../io/gridConnection.js"
import { createOsc } from "../io/osc.js"
import { loadSettings } from "../core/settings.js"
import { LedReconciler } from "../render/ledReconciler.js"
import { createRenderLoop } from "../render/renderLoop.js"
import { PageManager } from "../core/pageManager.js"
import { ShiftInput } from "../core/shiftInput.js"
import { createOscRouter } from "../core/oscRouter.js"
import { createPresetStore } from "../core/presetStore.js"
import { applySystemConfig, captureSystemConfig } from "../core/systemConfig.js"
import { createAppRuntime, type AppRuntime } from "../core/appRuntime.js"
import type { ClockState, LaneState } from "../core/clock.js"
import { DEFAULT_PAGE } from "../pages/registry.js"
import {
	type PageContext,
	type Slot,
	type Modifiers,
	type KeyEvent,
	SLOT_INDICES,
	slotLabel,
} from "../core/types.js"

const useNull = process.argv.includes("--null")
const held = new Set<number>()

// Built once pm + the render loop exist; referenced from callbacks that can fire during
// boot, so it's a `let` with optional reads (same shape as sim.ts).
let rt: AppRuntime | undefined

// Shared by the physical grid AND the virtual /grid/in/key OSC path (below) — one
// held-tracking implementation, not two.
function handleKey(e: KeyEvent) {
	rt?.idle.activity()
	const i = e.y * w + e.x
	if (e.s) held.add(i)
	else held.delete(i)
	pm.onKey(e)
}

// Runtime hotplug: a STABLE grid facade whose inner device swaps live. Starts on a
// NullGrid and hot-connects when serialosc reports a grid — no more connect-or-exit, so
// the daemon can launch before the grid is plugged in and recover from an unplug. All
// the serialosc gotchas live in io/gridConnection.ts.
const conn = new GridConnection({
	size: { width: 16, height: 8 },
	forceNull: useNull,
	onKey: handleKey,
	// A repaint request (device attached, or a cable glitch that cleared the grid's LEDs)
	// must also WAKE us — otherwise a sleeping daemon leaves the grid dark.
	onRepaint: () => { needsFullPaint = true; rt?.idle.wake() },
	onDeviceChange: () => rt?.idle.activity(),
})
const grid = conn.grid
const { width: w } = grid.size

// --- 8 page slots. The layout comes from configs/slots.json (the last preset loaded or
// saved); with no such file every slot is the default page, as before. Mirrors sim.ts. ---
const slotPages: string[] = Array.from(SLOT_INDICES, () => DEFAULT_PAGE)
const presets = createPresetStore()

console.log(
	`[grid] ${useNull ? "NullGrid (forced)" : "starting on NullGrid — hot-connects when a grid appears"} ${grid.size.width}×${grid.size.height}`
)

// --- OSC to/from Max (5713x block; clear of twistermapper) ---
// Ports come from configs/settings.json → osc (read once at boot; see core/settings.ts).
const settings = loadSettings()
const osc = createOsc({ localPort: settings.osc.inPort, remotePort: settings.osc.outPort })
// Echo discipline: while an OSC-originated settings write is dispatched, the page's
// /settings reply is kept off the wire so a patch that sends and listens can't feed back
// on itself. Headless, there is no second listener, so the reply simply goes nowhere —
// the sim keeps its web UI fed (see cli/sim.ts). The router decides when; this is how.
let suppressOscEcho = false
const emitOut = (path: string, ...args: Array<number | string | boolean>) => {
	if (!suppressOscEcho) osc.send(path, ...args)
}
const withOscEchoSuppressed = (fn: () => void) => {
	suppressOscEcho = true
	try { fn() } finally { suppressOscEcho = false }
}
osc.send("/grid/out/hello")

// --- Reconciler + render loop (single output path) ---
const rec = new LedReconciler(grid)
let needsFullPaint = false

// App-defined shift buttons (outside any page). Driven over OSC; a local source calls
// shift.set() later for identical behavior. Receive-only: shift just alters internal
// behavior, nothing is emitted. Debounce = leading-edge lockout (see ShiftInput).
// modifiers exposes live values via getters so it stays the one source of truth.
const shift = new ShiftInput(10)
const modifiers: Modifiers = {
	held,
	get shift1() { return shift.shift1 },
	get shift2() { return shift.shift2 },
}

// Live getter view of the transport for PageContext.clock — see sim.ts for why it's lazy.
const clockView: ClockState = {
	get running() { return rt?.clock.running ?? false },
	get rate() { return rt?.clock.rate ?? settings.clock.rate },
	get tick() { return rt?.clock.tick ?? 0 },
	get lanes() { return (rt?.clock.laneStates ?? []) as LaneState[] },
}

const baseCtx: Omit<PageContext, "setDirty" | "slot" | "slotLabel" | "focus" | "persist"> = {
	size: grid.size,
	modifiers,
	clock: clockView,
	clockControl: {
		start: () => rt?.clock.start(),
		stop: () => rt?.clock.stop(),
		setRate: (rate) => rt?.clock.setRate(rate),
	},
	osc: { send: emitOut },
	setShift: (which, down) => shift.set(which, down),
}

const pm = new PageManager(
	baseCtx,
	(_frame, reason) => {
		if (reason === "focus") needsFullPaint = true
	},
	{
		// A page switched focus itself (the hotelier selector column) — announce it exactly
		// like the router does for /grid/in/focus/page.
		onPageFocus: (slot) => emitOut("/grid/out/focus/page", slotLabel(slot)),
		// A page saved content (iso-hot's chords): live layout + the active preset.
		onPersist: (slot, patch) =>
			presets.persistSlot(captureSystemConfig({ pm, slotPages }), slotLabel(slot), patch),
	},
)

function renderTick() {
	const frame = pm.renderFocused()
	if (!frame) return
	if (needsFullPaint) {
		rec.beginFullPaint()
		needsFullPaint = false
	}
	rec.push(frame)
}

const renderLoop = createRenderLoop({ onFrame: renderTick })

// Transport + idle policy + persisted settings — the SAME wiring the sim uses, so the
// daemon can't drift (see core/appRuntime.ts).
rt = createAppRuntime({
	pm,
	loop: renderLoop,
	conn,
	settings,
	emit: emitOut,
	onWake: () => { needsFullPaint = true; renderTick() },
})

// Boot into the persisted layout through the SAME sanitize→factory path a live preset
// load uses (core/systemConfig.ts), so an unknown page name degrades identically.
applySystemConfig(presets.active(), { pm, slotPages })
pm.focus(0 as Slot)
needsFullPaint = true
renderLoop.start()

// Keys are wired through GridConnection.onKey (survives device swaps). Start the hotplug
// watcher: auto-connect on plug-in, never auto-detach (see gridConnection.ts).
conn.start()

// --- OSC in from Max → routing (same dialect as sim.ts's web + Max routing) ---
osc.onMessage(
	createOscRouter({
		pm,
		shift,
		reconnect: () => conn.reconnect(),
		onKey: handleKey,
		emit: emitOut,
		slotPages,
		clock: rt.clock,
		idle: rt.idle,
		settings: rt.settings,
		presets,
		withOscEchoSuppressed,
	})
)
// Announce transport + power + settings + presets, so a patch that boots after us is in
// sync. A patch opened LATER misses this entirely — that's what /grid/in/ping is for.
for (const m of rt.snapshot()) emitOut(m.path, ...m.args)
for (const m of presets.state()) emitOut(m.path, ...m.args)

console.log(`[daemon] up. OSC in ${settings.osc.inPort} / out ${settings.osc.outPort}. 8 slots (a–h), default Base — press the grid.`)

const shutdown = () => {
	renderLoop.stop()
	try { rt?.close() } catch {} // stops the clock, flushes any pending settings write
	try { grid.ledLevelAll(0) } catch {}
	setTimeout(() => {
		try { conn.close() } catch {}
		osc.close()
		process.exit(0)
	}, 60)
}
process.on("SIGINT", shutdown)
process.on("SIGTERM", shutdown)
