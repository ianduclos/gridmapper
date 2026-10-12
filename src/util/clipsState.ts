/* clipsState — the clips page's model, with no I/O.
 * ------------------------------------------------------------------------------
 * pages/clips.ts owns the wiring (ctx.live, the timer, SharedStore, Max). Everything here
 * takes the state plus the time it should believe (`nowMs`) and RETURNS what to send
 * instead of sending it, so tests drive it without Live, a socket or a clock.
 * The /clips contract is idk.clips' (docs/superpowers/specs/2026-10-12-clip-launcher-design.md
 * in that repo), not ours; docs/clips-contract-notes.md lists how this page reads it.
 * Clips and scenes are addressed by ABSOLUTE index everywhere: a key remembers the slot it
 * pressed, so a bank move between press and release can't misfire.
 * ------------------------------------------------------------------------------
 */

export const COLS = 15 // tracks in the window = the width of Live's red box
export const ROWS = 6 // scenes in the window
export const SLOTS = COLS * ROWS

/** Slot codes in /clips/window. */
export const SLOT = {
	none: 0, empty: 1, emptyArmed: 2, stopped: 3, queuedPlay: 4,
	playing: 5, queuedStop: 6, queuedRec: 7, recording: 8,
} as const
/** Track flag bits in /clips/tracks. */
export const TRACK = { exists: 1, arm: 2, mute: 4, solo: 8, playing: 16 } as const
/** Scene codes in /clips/scenes. */
export const SCENE = { none: 0, present: 1, triggered: 2 } as const

/** Unlinked: resend /clips/hello this often (spec, "Failure handling"). */
export const HELLO_RETRY_MS = 2000
/** Linked but silent this long: probe with a hello. The window feed is quiet while nothing
 *  changes, so silence alone can't tell "idle" from "Live quit". */
export const QUIET_PROBE_MS = 10_000
/** No /clips/beat for this long: blink on our own clock (transport stopped). */
export const BEAT_STALE_MS = 2000

export type Layer = "clips" | "mute" | "solo" | "arm" | "volume"
export type Send = { path: string; args: Array<number | string> }

export interface WindowView { trackOff: number; sceneOff: number; nTracks: number; nScenes: number; slots: number[] }
export interface TracksView { trackOff: number; flags: number[]; volumes: number[]; master: number }
export interface ScenesView { sceneOff: number; codes: number[] }
/** A clip key that is down, and the absolute slot its press hit. */
export interface DownKey { track: number; scene: number }
/** A slot staged for a launch on shift release (staged-launch experiment). */
export interface Staged { track: number; scene: number; launches: boolean }

export interface ClipsState {
	win: WindowView | null
	tracks: TracksView | null
	scenes: ScenesView | null
	beat: number | null
	beatAtMs: number
	linked: boolean
	lastHeardMs: number
	lastHelloMs: number
	/** Offsets asked for with /clips/window/set and not yet answered by a /clips/window. */
	want: { trackOff: number; sceneOff: number } | null
	/** What the grid shows now. */
	layer: Layer
	/** Where a momentary layer hold returns to. */
	latched: Layer
	layerDown: { layer: Layer; atMs: number; prev: Layer } | null
	shift: boolean
	/** x0 y7 held: top-row keys x0-7 focus slots a-h. */
	pagesHeld: boolean
	/** Clip keys down, by grid cell (y*16+x). */
	down: Map<number, DownKey>
	/** Scene keys down, by grid row → absolute scene. */
	sceneDown: Map<number, number>
	staged: Staged[]
	focusTrack: number | null
	opts: { stagedLaunch: boolean }
}

export function createClipsState(): ClipsState {
	return {
		win: null, tracks: null, scenes: null,
		beat: null, beatAtMs: -Infinity,
		linked: false, lastHeardMs: -Infinity, lastHelloMs: -Infinity,
		want: null,
		layer: "clips", latched: "clips", layerDown: null,
		shift: false, pagesHeld: false,
		down: new Map(), sceneDown: new Map(), staged: [],
		focusTrack: null,
		opts: { stagedLaunch: false },
	}
}

// --- the feed (Live → page) ---------------------------------------------------------

/** The first n args as finite numbers, or null if any is missing or not a number. */
const nums = (args: unknown[], n: number): number[] | null => {
	if (args.length < n) return null
	const out: number[] = []
	for (let i = 0; i < n; i++) {
		const v = args[i]
		if (typeof v !== "number" || !Number.isFinite(v)) return null
		out.push(v)
	}
	return out
}
const index = (v: number) => Math.max(0, Math.trunc(v))
/** A code the contract defines, else 0: a code we don't know draws as nothing there. */
const code = (v: number, max: number) => (Number.isInteger(v) && v >= 0 && v <= max ? v : 0)
const unit = (v: number) => Math.min(1, Math.max(0, v))

/**
 * One message from the fork. Returns true if it was a well-formed /clips message, which is
 * also what counts as hearing from Live. Anything else is ignored, never thrown on.
 */
export function applyLive(st: ClipsState, path: string, args: unknown[], nowMs: number): boolean {
	switch (path) {
		case "/clips/window": {
			const a = nums(args, 4 + SLOTS)
			if (!a) return false
			st.win = {
				trackOff: index(a[0]), sceneOff: index(a[1]), nTracks: index(a[2]), nScenes: index(a[3]),
				slots: a.slice(4).map((v) => code(v, SLOT.recording)),
			}
			st.want = null
			break
		}
		case "/clips/tracks": {
			const a = nums(args, 2 + 2 * COLS)
			if (!a) return false
			st.tracks = {
				trackOff: index(a[0]),
				flags: a.slice(1, 1 + COLS).map((v) => code(v, 31)),
				volumes: a.slice(1 + COLS, 1 + 2 * COLS).map(unit),
				master: unit(a[1 + 2 * COLS]),
			}
			break
		}
		case "/clips/scenes": {
			const a = nums(args, 1 + ROWS)
			if (!a) return false
			st.scenes = { sceneOff: index(a[0]), codes: a.slice(1).map((v) => code(v, SCENE.triggered)) }
			break
		}
		case "/clips/beat": {
			const a = nums(args, 1)
			if (!a) return false
			st.beat = a[0]
			st.beatAtMs = nowMs
			break
		}
		default:
			return false
	}
	st.linked = true
	st.lastHeardMs = nowMs
	return true
}

// --- offsets ------------------------------------------------------------------------

/** The largest offset that still shows a full window (0 when the set is smaller). */
export const maxOffset = (count: number, size: number) => Math.max(0, count - size)

export function nextOffset(off: number, count: number, size: number, dir: -1 | 1, step: number): number {
	return Math.min(maxOffset(count, size), Math.max(0, off + dir * step))
}

// --- link liveness ------------------------------------------------------------------

const hello = (st: ClipsState, nowMs: number): Send => {
	st.lastHelloMs = nowMs
	return { path: "/clips/hello", args: [] }
}

/**
 * Called by the page's timer (and once at init). Unlinked: a hello every HELLO_RETRY_MS.
 * Linked but silent for QUIET_PROBE_MS: one hello as a probe; if that goes unanswered for
 * HELLO_RETRY_MS, the link is down and the retry starts.
 */
export function linkTick(st: ClipsState, nowMs: number): Send[] {
	if (st.linked) {
		if (nowMs - st.lastHeardMs < QUIET_PROBE_MS) return []
		const probed = st.lastHelloMs > st.lastHeardMs
		if (!probed) return [hello(st, nowMs)]
		if (nowMs - st.lastHelloMs < HELLO_RETRY_MS) return []
		st.linked = false // the probe went unanswered: Live closed, or the fork stopped
	}
	if (nowMs - st.lastHelloMs < HELLO_RETRY_MS) return []
	return [hello(st, nowMs)]
}

// --- the grid layout (spec "Grid layout"; C3 adds the pages key) ---------------------

export const GRID_W = 16
export const SCENE_COL = 15
export const STOP_ROW = 6
export const CTRL_ROW = 7
export const SHIFT_X = 15
/** x0 y7: hold, then x0-7 on y0 focuses slot a-h (Ian, 2026-10-12). */
export const PAGES_X = 0
export const PAGE_SLOTS = 8
export const LAYER_KEYS: Readonly<Record<number, Layer>> = { 1: "clips", 2: "mute", 3: "solo", 4: "arm", 5: "volume" }
export const ARROWS = { left: 11, right: 12, up: 13, down: 14 } as const
export type Arrow = keyof typeof ARROWS
/** A layer key held longer than this is momentary; shorter is a latching tap. */
export const MOMENTARY_MS = 300

// --- volume faders (V layer) --------------------------------------------------------

export const FADER_STEPS = 7 // y6 (bottom, −∞) .. y0 (top, 0 dB)
/** Live's mixer volume at 0 dB on its 0..1 parameter (confirm in the idk.clips spike). */
export const UNITY = 0.85
export const stepToVolume = (step: number) => Number(((UNITY * step) / (FADER_STEPS - 1)).toFixed(4))
export const volumeToStep = (v: number) =>
	Math.min(FADER_STEPS - 1, Math.max(0, Math.round((v / UNITY) * (FADER_STEPS - 1))))

export type ToggleLayer = "mute" | "solo" | "arm"
export const TOGGLE_BIT: Readonly<Record<ToggleLayer, number>> = { mute: TRACK.mute, solo: TRACK.solo, arm: TRACK.arm }

/** The flags of window column x, or null when unknown: no track there, or the track feed
 *  still describes another bank (it carries its own offset). */
export function viewFlags(st: ClipsState, x: number): number | null {
	const t = st.tracks
	if (!t || !st.win || t.trackOff !== st.win.trackOff) return null
	const f = t.flags[x] ?? 0
	return f & TRACK.exists ? f : null
}

// --- keys ---------------------------------------------------------------------------

export interface KeyResult {
	send: Send[]
	/** A launch moved the track focus (absolute track index). */
	focus?: number
	/** The pages key asked for slot a-h (0-7). */
	focusSlot?: number
}

const slotButton = (track: number, scene: number, state: 0 | 1): Send =>
	({ path: "/clips/slot/button", args: [track, scene, state] })
const sceneButton = (scene: number, state: 0 | 1): Send => ({ path: "/clips/scene/button", args: [scene, state] })

export function pressKey(st: ClipsState, x: number, y: number, s: 0 | 1, nowMs: number): KeyResult {
	if (y === CTRL_ROW && x === PAGES_X) {
		st.pagesHeld = s === 1
		return { send: [] }
	}
	if (st.pagesHeld && s === 1 && y !== CTRL_ROW)
		return y === 0 && x < PAGE_SLOTS ? { send: [], focusSlot: x } : { send: [] }
	if (y === CTRL_ROW) return controlKey(st, x, s, nowMs)
	if (s === 0) return release(st, x, y)
	const w = st.win
	if (!st.linked || !w) return { send: [] }
	if (st.layer === "volume") return { send: faderPress(st, w, x, y) }
	if (y === STOP_ROW) return { send: stopRowPress(st, w, x) }
	if (x === SCENE_COL) return { send: scenePress(st, w, y) }
	return clipPress(st, w, x, y)
}

/** A release goes wherever its press went, whatever the window or layer is now. */
function release(st: ClipsState, x: number, y: number): KeyResult {
	const cell = y * GRID_W + x
	const held = st.down.get(cell)
	if (held) {
		st.down.delete(cell)
		return { send: [slotButton(held.track, held.scene, 0)] }
	}
	const scene = x === SCENE_COL ? st.sceneDown.get(y) : undefined
	if (scene !== undefined) {
		st.sceneDown.delete(y)
		return { send: [sceneButton(scene, 0)] }
	}
	return { send: [] }
}

function launched(st: ClipsState, send: Send[], track: number | undefined): KeyResult {
	if (track === undefined) return { send }
	st.focusTrack = track
	return { send, focus: track }
}

function clipPress(st: ClipsState, w: WindowView, x: number, y: number): KeyResult {
	if (x >= COLS || y >= ROWS) return { send: [] }
	const code = w.slots[y * COLS + x]
	if (code === SLOT.none) return { send: [] }
	const track = w.trackOff + x
	const scene = w.sceneOff + y
	st.down.set(y * GRID_W + x, { track, scene })
	// An empty slot's press stops the track in Live: not a launch, so focus stays put.
	return launched(st, [slotButton(track, scene, 1)], code >= SLOT.emptyArmed ? track : undefined)
}

function scenePress(st: ClipsState, w: WindowView, y: number): Send[] {
	const scene = w.sceneOff + y
	if (scene >= w.nScenes) return []
	st.sceneDown.set(y, scene)
	return [sceneButton(scene, 1)]
}

function stopRowPress(st: ClipsState, w: WindowView, x: number): Send[] {
	if (x === SCENE_COL) return [{ path: "/clips/stop_all", args: [] }]
	const track = w.trackOff + x
	if (track >= w.nTracks) return []
	if (st.layer === "clips") return [{ path: "/clips/track/stop", args: [track] }]
	const flags = viewFlags(st, x)
	if (flags === null) return []
	const prop = st.layer as ToggleLayer
	return [{ path: "/clips/track/set", args: [prop, track, flags & TOGGLE_BIT[prop] ? 0 : 1] }]
}

function faderPress(st: ClipsState, w: WindowView, x: number, y: number): Send[] {
	if (y > STOP_ROW) return []
	// Master (x15) is shown, not set: the contract has no master address yet (C1).
	if (x === SCENE_COL) return []
	if (viewFlags(st, x) === null) return []
	return [{ path: "/clips/track/set", args: ["volume", w.trackOff + x, stepToVolume(FADER_STEPS - 1 - y)] }]
}

function controlKey(st: ClipsState, x: number, s: 0 | 1, nowMs: number): KeyResult {
	if (x === SHIFT_X) {
		st.shift = s === 1
		return { send: [] }
	}
	const layer = LAYER_KEYS[x]
	if (layer) {
		layerKey(st, layer, s, nowMs)
		return { send: [] }
	}
	if (s === 0) return { send: [] }
	const arrow = (Object.keys(ARROWS) as Arrow[]).find((a) => ARROWS[a] === x)
	return { send: arrow ? bank(st, arrow) : [] }
}

function layerKey(st: ClipsState, layer: Layer, s: 0 | 1, nowMs: number) {
	if (s === 1) {
		st.layerDown = { layer, atMs: nowMs, prev: st.latched }
		st.layer = layer
		return
	}
	const d = st.layerDown
	if (!d || d.layer !== layer) return
	st.layerDown = null
	if (nowMs - d.atMs > MOMENTARY_MS) st.layer = d.prev // held: momentary, go back
	else st.latched = layer // tapped: it sticks
}

function bank(st: ClipsState, dir: Arrow): Send[] {
	const w = st.win
	if (!st.linked || !w) return []
	// Build on an unanswered move, so two quick presses go two windows, not one.
	const base = st.want ?? { trackOff: w.trackOff, sceneOff: w.sceneOff }
	const sign = dir === "left" || dir === "up" ? -1 : 1
	const next =
		dir === "left" || dir === "right"
			? { trackOff: nextOffset(base.trackOff, w.nTracks, COLS, sign, st.shift ? 1 : COLS), sceneOff: base.sceneOff }
			: { trackOff: base.trackOff, sceneOff: nextOffset(base.sceneOff, w.nScenes, ROWS, sign, st.shift ? 1 : ROWS) }
	if (next.trackOff === base.trackOff && next.sceneOff === base.sceneOff) return []
	st.want = next
	return [{ path: "/clips/window/set", args: [next.trackOff, next.sceneOff] }]
}
