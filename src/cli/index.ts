// src/cli/index.ts — the gridmapper daemon.
//
// Wires the proven driver to the page stack: connect the grid, run one render loop
// (the single output path) through the quadrant-aware reconciler, route key events
// to the focused page, and bridge OSC to/from Max. Minimal for now — one page in
// slot a. Preset/handshake + multi-page routing come next (see CLAUDE.md roadmap).
//
//   npm run dev            (real hardware)
//   npm run dev -- --null  (no hardware; NullGrid)

import { connectGrid, NullGrid, type GridDriver } from "../io/serialoscDriver.js"
import { createOsc } from "../io/osc.js"
import { LedReconciler } from "../render/ledReconciler.js"
import { createRenderLoop } from "../render/renderLoop.js"
import { PageManager } from "../core/pageManager.js"
import { pageFactory, DEFAULT_PAGE } from "../pages/registry.js"
import {
	type PageContext,
	type Slot,
	type Modifiers,
	SLOT_INDICES,
	slotFromLabel,
	slotLabel,
} from "../core/types.js"

const useNull = process.argv.includes("--null")

const grid: GridDriver = useNull
	? new NullGrid({ width: 16, height: 8 })
	: await connectGrid().catch((err) => {
			console.error(`[grid] ${err.message}`)
			console.error("Tip: run with --null to develop without hardware.")
			process.exit(1)
		})

console.log(`[grid] ${useNull ? "NullGrid" : "connected"} ${grid.size.width}×${grid.size.height}`)

// --- OSC to/from Max (5713x block; clear of twistermapper) ---
const osc = createOsc()
const held = new Set<number>()
const emitOut = (path: string, ...args: Array<number | string | boolean>) => osc.send(path, ...args)
osc.send("/grid/out/hello")

// --- Reconciler + render loop (single output path) ---
const rec = new LedReconciler(grid)
let needsFullPaint = false

// App-defined shift buttons (outside any page). Driven over OSC; a local source can
// call setShift() later for identical behavior. Debounced twister-style: a same-state
// edge inside the window is dropped (state changes always pass through).
const SHIFT_DEBOUNCE_MS = 20
const modifiers: Modifiers = { held, shift1: false, shift2: false }
const shiftLastEdge: Record<1 | 2, number> = { 1: 0, 2: 0 }

function setShift(which: number, down: boolean) {
	if (which !== 1 && which !== 2) return
	const w = which as 1 | 2
	const cur = w === 1 ? modifiers.shift1 : modifiers.shift2
	const now = Date.now()
	if (down === cur && now - shiftLastEdge[w] < SHIFT_DEBOUNCE_MS) return // debounce duplicate
	shiftLastEdge[w] = now
	if (down === cur) return // no change
	if (w === 1) modifiers.shift1 = down
	else modifiers.shift2 = down
	emitOut("/grid/out/shift", w, down ? 1 : 0)
}

const baseCtx: Omit<PageContext, "setDirty" | "slot" | "slotLabel"> = {
	size: grid.size,
	modifiers,
	osc: { send: emitOut },
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

// --- Input: grid keys → focused page (and track held for app-defined modifiers) ---
grid.onKey((e) => {
	const i = e.y * grid.size.width + e.x
	if (e.s) held.add(i)
	else held.delete(i)
	pm.onKey(e)
})

// --- OSC in from Max → routing ---
osc.onMessage((path, args) => {
	// /grid/in/shift <which:1|2> <state:1|0> — external shift buttons (debounced).
	if (path === "/grid/in/shift") {
		setShift(Number(args[0]), !!Number(args[1]))
		return
	}
	// /grid/in/focus/page <a..h>
	if (path === "/grid/in/focus/page") {
		const slot = typeof args[0] === "string" ? slotFromLabel(args[0]) : undefined
		if (slot !== undefined) {
			pm.focus(slot)
			emitOut("/grid/out/focus/page", slotLabel(slot))
		}
		return
	}
	// /grid/in/page/<a..h>/<rest> → page.onOsc(/<rest>)
	const m = path.match(/^\/grid\/in\/page\/([a-hA-H])\/(.+)$/)
	if (m) {
		const slot = slotFromLabel(m[1])
		if (slot !== undefined) pm.routeOscToPage(slot, `/${m[2]}`, args)
	}
})

console.log("[daemon] up. OSC in 57131 / out 57130. Page 'Basic' in slot a — press the grid.")

const shutdown = () => {
	renderLoop.stop()
	try { grid.ledLevelAll(0) } catch {}
	setTimeout(() => {
		try { grid.close() } catch {}
		osc.close()
		process.exit(0)
	}, 60)
}
process.on("SIGINT", shutdown)
process.on("SIGTERM", shutdown)
