// src/cli/index.ts — the gridmapper daemon.
//
// Wires the proven driver to the page stack: connect the grid, run one render loop
// (the single output path) through the quadrant-aware reconciler, route key events
// to the focused page, and bridge OSC to/from Max. Minimal for now — one page in
// slot a. Preset/handshake + multi-page routing come next (see CLAUDE.md roadmap).
//
//   npm run dev            (real hardware)
//   npm run dev -- --null  (no hardware; NullGrid)

import { GridConnection } from "../io/gridConnection.js"
import { createOsc } from "../io/osc.js"
import { LedReconciler } from "../render/ledReconciler.js"
import { createRenderLoop } from "../render/renderLoop.js"
import { PageManager } from "../core/pageManager.js"
import { ShiftInput } from "../core/shiftInput.js"
import { createOscRouter } from "../core/oscRouter.js"
import { pageFactory, DEFAULT_PAGE } from "../pages/registry.js"
import {
	type PageContext,
	type Slot,
	type Modifiers,
	type KeyEvent,
	SLOT_INDICES,
} from "../core/types.js"

const useNull = process.argv.includes("--null")
const held = new Set<number>()

// Shared by the physical grid AND the virtual /grid/in/key OSC path (below) — one
// held-tracking implementation, not two.
function handleKey(e: KeyEvent) {
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
	onRepaint: () => { needsFullPaint = true },
})
const grid = conn.grid
const { width: w } = grid.size

// --- 8 page slots, all Base by default (mirrors sim.ts) ---
const slotPages: string[] = Array.from(SLOT_INDICES, () => DEFAULT_PAGE)

console.log(
	`[grid] ${useNull ? "NullGrid (forced)" : "starting on NullGrid — hot-connects when a grid appears"} ${grid.size.width}×${grid.size.height}`
)

// --- OSC to/from Max (5713x block; clear of twistermapper) ---
const osc = createOsc()
const emitOut = (path: string, ...args: Array<number | string | boolean>) => osc.send(path, ...args)
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

const baseCtx: Omit<PageContext, "setDirty" | "slot" | "slotLabel"> = {
	size: grid.size,
	modifiers,
	osc: { send: emitOut },
	setShift: (which, down) => shift.set(which, down),
}

const pm = new PageManager(baseCtx, (_frame, reason) => {
	if (reason === "focus") needsFullPaint = true
})

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

// Load the default page into every slot; focus a.
for (const slot of SLOT_INDICES) pm.load(slot, pageFactory(DEFAULT_PAGE)!)
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
	})
)

console.log("[daemon] up. OSC in 57131 / out 57130. 8 slots (a–h), default Base — press the grid.")

const shutdown = () => {
	renderLoop.stop()
	try { grid.ledLevelAll(0) } catch {}
	setTimeout(() => {
		try { conn.close() } catch {}
		osc.close()
		process.exit(0)
	}, 60)
}
process.on("SIGINT", shutdown)
process.on("SIGTERM", shutdown)
