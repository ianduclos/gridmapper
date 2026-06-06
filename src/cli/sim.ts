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
import { connectGrid, listDevices, NullGrid, type GridDriver } from "../io/serialoscDriver.js"
import { MirrorGrid } from "../io/mirrorGrid.js"
import { createGridServer } from "../io/gridServer.js"
import { LedReconciler } from "../render/ledReconciler.js"
import { createRenderLoop } from "../render/renderLoop.js"
import { PageManager } from "../core/pageManager.js"
import { pageFactory, PAGE_TYPES, DEFAULT_PAGE, isPageType } from "../pages/registry.js"
import { type PageContext, type Slot, SLOT_INDICES } from "../core/types.js"

const PORT = Number(process.env.GRID_UI_PORT ?? 57191) // 57190 is twistermapper's UI
const UI_INDEX = resolvePath(process.cwd(), "web/index.html")
const forceNull = process.argv.includes("--null")

// Start on a NullGrid; the watcher / connect button swaps in real hardware later.
const grid = new MirrorGrid(new NullGrid({ width: 16, height: 8 }), (levels) => broadcastLeds(levels))
const { width: w, height: h } = grid.size
const isConnected = () => grid.id !== "null-grid"

// --- 8 page slots, all Base by default ---
const slotPages: string[] = Array.from(SLOT_INDICES, () => DEFAULT_PAGE)

// --- Web server ---
const held = new Set<number>()
let broadcastLeds: (levels: Uint8Array) => void = () => {}
const server = createGridServer({
	port: PORT,
	staticFile: UI_INDEX,
	onMessage: routeControl,
	onConnect: (send) => {
		send("/grid/out/device", [grid.id, w, h])
		send("/grid/out/size", [w, h])
		send("/grid/out/pagetypes", PAGE_TYPES)
		send("/grid/out/focus/slot", [pm.focusedSlot])
		send("/grid/out/slots", slotPages)
		send("/grid/out/leds", [w, h, ...Array.from(grid.snapshot())])
	},
})
broadcastLeds = (levels) => server.broadcast("/grid/out/leds", [w, h, ...Array.from(levels)])
const broadcastDevice = () => server.broadcast("/grid/out/device", [grid.id, w, h])

// --- App stack ---
const rec = new LedReconciler(grid)
let needsFullPaint = false

const baseCtx: Omit<PageContext, "setDirty" | "slot" | "slotLabel"> = {
	size: grid.size,
	modifiers: { held },
	osc: { send: (path, ...a) => server.broadcast(path, a) }, // Max bridge comes later
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

// Physical keys (from whichever device is attached) → focused page.
grid.onKey((e) => {
	const i = e.y * w + e.x
	if (e.s) held.add(i)
	else held.delete(i)
	pm.onKey(e)
})

// --- Connection management (hot-swap the device under the running pipeline) ---
// Two hard-won rules about serialosc, both about NOT disturbing a live connection:
//  1. Do NOT poll discovery (/serialosc/list) while connected — it breaks the device's
//     key routing to us (presses silently stop). Poll only while disconnected.
//  2. Do NOT tear down on a cable glitch. serialosc pushes /sys/disconnect then
//     /sys/connect around a USB hiccup but KEEPS the same device server + routing, so
//     keys resume on their own. Reconnecting mid-glitch is what loses key routing.
// So: auto-connect on plug-in (poll while disconnected), never auto-detach, and let
// the indicator click force a fresh handshake for genuine unplug recovery.
let connecting = false

async function tryConnect(): Promise<void> {
	if (forceNull || connecting || isConnected()) return
	connecting = true
	try {
		const driver = await connectGrid({ timeoutMs: 1500 })
		const previous = grid.current()
		grid.attach(driver)
		if (previous.id !== "null-grid") try { previous.close() } catch {}
		needsFullPaint = true // push the current screen to the freshly connected device
		broadcastDevice()
		console.log(`[sim] grid connected: ${driver.id} → syncing current screen`)
	} catch {
		// no device / handshake failed — stay on NullGrid
	} finally {
		connecting = false
	}
}

function detach() {
	if (!isConnected()) return
	const previous = grid.current()
	grid.attach(new NullGrid({ width: w, height: h }))
	try { previous.close() } catch {}
	needsFullPaint = true
	broadcastDevice()
}

// Hotplug watcher: only runs while DISCONNECTED, to catch a plug-in. Once connected
// it idles — we never auto-detach, so the live connection is left untouched.
async function pollDevices() {
	if (forceNull || connecting || isConnected()) return
	let devices
	try {
		devices = await listDevices({ timeoutMs: 400 })
	} catch {
		return
	}
	if (devices.length) void tryConnect()
}
if (!forceNull) {
	void tryConnect() // try immediately on boot
	setInterval(() => void pollDevices(), 2000)
}

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
		// Indicator click → force a FRESH handshake (manual recovery after a real
		// unplug). Drop any current connection first, then reconnect. Reports the
		// result either way so the UI can stop showing "connecting…".
		if (isConnected()) detach()
		void tryConnect().then(() => broadcastDevice())
		return
	}
	if (path === "/grid/in/focus/slot") {
		const n = Number(args[0])
		if (Number.isInteger(n) && n >= 0 && n < SLOT_INDICES.length) {
			pm.focus(n as Slot)
			needsFullPaint = true
			server.broadcast("/grid/out/focus/slot", [n])
		}
		return
	}
	const m = path.match(/^\/grid\/in\/slot\/(\d)\/page$/)
	if (m) {
		const slot = Number(m[1]) as Slot
		const name = args[0]
		const factory = isPageType(name) ? pageFactory(name) : undefined
		if (slot < SLOT_INDICES.length && factory) {
			slotPages[slot] = name
			pm.load(slot, factory)
			if (slot === pm.focusedSlot) needsFullPaint = true
			server.broadcast("/grid/out/slots", slotPages)
		}
		return
	}
}

console.log(`[sim] http://localhost:${PORT} — 8 slots (a–h), default Base.`)
console.log(forceNull ? "[sim] --null: simulated grid only." : "[sim] auto-connecting to the real grid when present…")

process.on("SIGINT", () => {
	renderLoop.stop()
	try { grid.ledLevelAll(0) } catch {}
	setTimeout(() => {
		try { grid.close() } catch {}
		server.close()
		process.exit(0)
	}, 60)
})
