// src/cli/sim.ts — live grid app + web mirror.
//
// Runs the real app stack (PageManager → render loop → quadrant reconciler) and
// mirrors LED output to the web visualizer via MirrorGrid. The device is swappable
// at runtime: it starts on a NullGrid and hot-swaps to the real grid the moment
// serialosc reports one — immediately pushing the current screen. The web indicator
// (top-right) can also force a connection attempt.
//
//   npm run sim            (auto-connect to the real grid when present)
//   npm run sim -- --null  (force the simulated grid; no auto-connect)
import { resolve as resolvePath } from "node:path"
import { GridConnection } from "../io/gridConnection.js"
import { createGridServer } from "../io/gridServer.js"
import { createOsc } from "../io/osc.js"
import { LedReconciler } from "../render/ledReconciler.js"
import { createRenderLoop } from "../render/renderLoop.js"
import { PageManager } from "../core/pageManager.js"
import { ShiftInput } from "../core/shiftInput.js"
import { pageFactory, PAGE_TYPES, DEFAULT_PAGE, isPageType, pageSettings } from "../pages/registry.js"
import { type PageContext, type Slot, type Modifiers, SLOT_INDICES, slotFromLabel, slotLabel } from "../core/types.js"

const PORT = Number(process.env.GRID_UI_PORT ?? 57191) // 57190 is twistermapper's UI
const UI_INDEX = resolvePath(process.cwd(), "web/index.html")
const forceNull = process.argv.includes("--null")

const held = new Set<number>()

// Runtime hotplug: a STABLE grid facade whose inner device swaps live (NullGrid → real
// grid on plug-in). All the serialosc gotchas live in io/gridConnection.ts.
const conn = new GridConnection({
	size: { width: 16, height: 8 },
	forceNull,
	onLeds: (levels) => broadcastLeds(levels),
	onKey: (e) => {
		const i = e.y * w + e.x
		if (e.s) held.add(i)
		else held.delete(i)
		pm.onKey(e)
	},
	onRepaint: () => { needsFullPaint = true },
	onDeviceChange: () => broadcastDevice(),
})
const grid = conn.grid
const { width: w, height: h } = grid.size

// --- 8 page slots, all Base by default ---
const slotPages: string[] = Array.from(SLOT_INDICES, () => DEFAULT_PAGE)

// Static settings specs per page type (for the web panel to render controls).
const SPECS_MAP = Object.fromEntries(PAGE_TYPES.map((n) => [n, pageSettings(n)]))

// --- Web server ---
let broadcastLeds: (levels: Uint8Array) => void = () => {}
const server = createGridServer({
	port: PORT,
	staticFile: UI_INDEX,
	onMessage: routeControl,
	onConnect: (send) => {
		send("/grid/out/device", [grid.id, w, h])
		send("/grid/out/size", [w, h])
		send("/grid/out/pagetypes", PAGE_TYPES)
		send("/grid/out/pagespecs", [JSON.stringify(SPECS_MAP)])
		send("/grid/out/focus/page", [slotLabel(pm.focusedSlot)])
		send("/grid/out/slots", slotPages)
		// Per-slot current settings, so a late-joining panel reflects live state.
		for (const slot of SLOT_INDICES) {
			const s = pm.serialize(slot)
			if (s) send(`/grid/out/page/${slotLabel(slot)}/settings`, [JSON.stringify(s)])
		}
		send("/grid/out/leds", [w, h, ...Array.from(grid.snapshot())])
	},
})
broadcastLeds = (levels) => server.broadcast("/grid/out/leds", [w, h, ...Array.from(levels)])
const broadcastDevice = () => server.broadcast("/grid/out/device", [grid.id, w, h])

// --- OSC to/from Max (5713x block; clear of twistermapper) ---
// emitOut mirrors twistermapper: every app-out message goes to Max AND the web UI, so
// notes/settings reach the patch while the visualizer monitors them live.
const osc = createOsc()
const emitOut = (path: string, ...args: Array<number | string | boolean>) => {
	osc.send(path, ...args)
	server.broadcast(path, args)
}
osc.send("/grid/out/hello")
osc.onMessage((path, args) => routeControl(path, args))

// --- App stack ---
const rec = new LedReconciler(grid)
let needsFullPaint = false

// App-defined shift buttons (outside any page). Driven over OSC for now; a local
// source calls shift.set() later for identical behavior. Receive-only: shift just
// alters internal behavior, nothing is emitted. Debounce = leading-edge lockout
// (see ShiftInput). modifiers exposes live values via getters so it stays the one
// source of truth that pages read through ctx.modifiers.
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

for (const slot of SLOT_INDICES) pm.load(slot, pageFactory(slotPages[slot])!)
pm.focus(0 as Slot)
needsFullPaint = true
renderLoop.start()

// Keys are wired through GridConnection.onKey (survives device swaps). Start the
// hotplug watcher: auto-connect on plug-in, never auto-detach (see gridConnection.ts).
conn.start()

// --- Control + key routing (web → app) ---
function routeControl(path: string, args: any[]) {
	if (path === "/grid/in/key") {
		const [x, y, s] = args.map((n: any) => Number(n))
		const i = y * w + x
		if (s) held.add(i)
		else held.delete(i)
		pm.onKey({ x, y, s: (s ? 1 : 0) as 0 | 1 })
		return
	}
	if (path === "/grid/in/connect") {
		// Indicator click → force a FRESH handshake (manual recovery after a real unplug).
		void conn.reconnect()
		return
	}
	// /grid/in/shift <which:1|2> <state:1|0> — external shift buttons (debounced).
	if (path === "/grid/in/shift") {
		shift.set(Number(args[0]), !!Number(args[1]))
		return
	}
	// /grid/in/focus/page <a..h> — one slot dialect everywhere (web + Max + daemon).
	if (path === "/grid/in/focus/page") {
		const slot = typeof args[0] === "string" ? slotFromLabel(args[0]) : undefined
		if (slot !== undefined) {
			pm.focus(slot)
			needsFullPaint = true
			server.broadcast("/grid/out/focus/page", [slotLabel(slot)])
		}
		return
	}
	const m = path.match(/^\/grid\/in\/slot\/([a-hA-H])\/page$/)
	if (m) {
		const slot = slotFromLabel(m[1])
		const name = args[0]
		const factory = isPageType(name) ? pageFactory(name) : undefined
		if (slot !== undefined && factory) {
			slotPages[slot] = name
			pm.load(slot, factory)
			if (slot === pm.focusedSlot) needsFullPaint = true
			server.broadcast("/grid/out/slots", slotPages)
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

console.log(`[sim] http://localhost:${PORT} — 8 slots (a–h), default Base.`)
console.log(forceNull ? "[sim] --null: simulated grid only." : "[sim] auto-connecting to the real grid when present…")

process.on("SIGINT", () => {
	renderLoop.stop()
	try { grid.ledLevelAll(0) } catch {}
	setTimeout(() => {
		try { conn.close() } catch {}
		try { osc.close() } catch {}
		server.close()
		process.exit(0)
	}, 60)
})
