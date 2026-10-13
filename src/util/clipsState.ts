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

import { makeFrame, ledIndex, type GridSize, type LedFrame } from "../core/types.js"

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
 * One message from the fork. Returns true if it was a well-formed /clips message; anything
 * else is ignored, never thrown on. Only a WINDOW brings the link up — a beat or a track
 * update arriving first (Live already playing when we start, or a fork that came back)
 * must not, or the page would believe it is linked with nothing to draw and stop asking
 * for the snapshot. Once linked, every well-formed message counts as hearing from Live.
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
	if (path === "/clips/window") st.linked = true
	if (st.linked) st.lastHeardMs = nowMs
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
		// The probe went unanswered: Live closed, or the fork stopped. Forget the set, so the
		// page can't draw (or press into) a stale window if Live comes back with another one.
		st.linked = false
		st.win = null
		st.tracks = null
		st.scenes = null
		st.want = null
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
/** Live's mixer volume at 0 dB on its 0..1 parameter (confirmed in Live 12, 2026-10-13). */
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

/** Every staged slot as a press then a release, all presses first, so they land together.
 *  (A Gate clip fired this way plays only for that instant.) */
function fireStaged(st: ClipsState): KeyResult {
	const out: KeyResult = { send: [] }
	for (const s of st.staged) out.send.push(slotButton(s.track, s.scene, 1))
	for (const s of st.staged) out.send.push(slotButton(s.track, s.scene, 0))
	const last = [...st.staged].reverse().find((s) => s.launches)
	st.staged = []
	if (last) {
		st.focusTrack = last.track
		out.focus = last.track
	}
	return out
}

function clipPress(st: ClipsState, w: WindowView, x: number, y: number): KeyResult {
	if (x >= COLS || y >= ROWS) return { send: [] }
	const code = w.slots[y * COLS + x]
	if (code === SLOT.none) return { send: [] }
	const track = w.trackOff + x
	const scene = w.sceneOff + y
	if (st.opts.stagedLaunch && st.shift) {
		// Staged launch: collect now, fire on shift release. Nothing goes in `down`, so this
		// key's release sends nothing. A second tap unstages.
		const i = st.staged.findIndex((s) => s.track === track && s.scene === scene)
		if (i >= 0) st.staged.splice(i, 1)
		else st.staged.push({ track, scene, launches: code >= SLOT.emptyArmed })
		return { send: [] }
	}
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
		return s === 0 && st.staged.length ? fireStaged(st) : { send: [] }
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

// --- LEDs ---------------------------------------------------------------------------

/**
 * Every brightness this page draws: the one table to tune (spec "LED brightness"; the
 * spec's values where it gives one, first guesses elsewhere). Pairs are [off-beat, on-beat].
 */
export const LEVEL = {
	emptyArmed: 2,
	stopped: 5,
	playing: 15,
	recording: 15,
	recordingDip: 8,
	queuedPlay: [5, 15],
	queuedStop: [15, 5],
	queuedRec: [2, 15],
	scenePresent: 3,
	sceneTriggered: [3, 15],
	stopPlaying: 8,
	stopIdle: 2,
	toggleOn: 15,
	toggleOff: 3,
	faderFill: 6,
	faderTop: 15,
	layerActive: 15,
	layerOther: 4,
	arrowCan: 8,
	arrowEdge: 2,
	shiftUp: 4,
	shiftDown: 15,
	pagesUp: 2,
	pagesDown: 15,
	slotKey: 6,
	ownSlot: 15,
	staged: [2, 8],
	noLink: 2,
} as const

/** Our own blink period when Live sends no beat (its transport is stopped). */
export const LOCAL_BEAT_MS = 500
/** How long a recording clip dips after each beat. */
export const DIP_MS = 120

const beatFresh = (st: ClipsState, nowMs: number) => st.beat !== null && nowMs - st.beatAtMs < BEAT_STALE_MS

/** The "on" half of a blink: Live's beat parity while it is fresh, else our own clock. */
export function onBeat(st: ClipsState, nowMs: number): boolean {
	if (beatFresh(st, nowMs)) return Math.floor(st.beat!) % 2 === 0
	return Math.floor(nowMs / LOCAL_BEAT_MS) % 2 === 0
}

export function inDip(st: ClipsState, nowMs: number): boolean {
	if (beatFresh(st, nowMs)) return nowMs - st.beatAtMs < DIP_MS
	return nowMs % LOCAL_BEAT_MS < DIP_MS
}

type Pick = (pair: readonly [number, number]) => number

export function slotLevel(code: number, pick: Pick, dip: boolean): number {
	switch (code) {
		case SLOT.emptyArmed: return LEVEL.emptyArmed
		case SLOT.stopped: return LEVEL.stopped
		case SLOT.queuedPlay: return pick(LEVEL.queuedPlay)
		case SLOT.playing: return LEVEL.playing
		case SLOT.queuedStop: return pick(LEVEL.queuedStop)
		case SLOT.queuedRec: return pick(LEVEL.queuedRec)
		case SLOT.recording: return dip ? LEVEL.recordingDip : LEVEL.recording
		default: return 0 // none, empty
	}
}

type Put = (x: number, y: number, v: number) => void

/** The page's whole frame, a pure function of state and time. */
export function clipsFrame(st: ClipsState, size: GridSize, nowMs: number, ownSlot = -1): LedFrame {
	const f = makeFrame(size)
	const put: Put = (x, y, v) => {
		if (x >= 0 && y >= 0 && x < size.width && y < size.height) f[ledIndex(size, x, y)] = v
	}
	const w = st.win
	if (!st.linked || !w) drawNoLink(put, size)
	else {
		const beat = onBeat(st, nowMs)
		const pick: Pick = (pair) => pair[beat ? 1 : 0]
		if (st.layer === "volume") drawFaders(st, put)
		else drawClips(st, w, put, pick, inDip(st, nowMs))
		drawControlRow(st, w, put)
	}
	put(PAGES_X, CTRL_ROW, st.pagesHeld ? LEVEL.pagesDown : LEVEL.pagesUp)
	if (st.pagesHeld)
		for (let x = 0; x < PAGE_SLOTS; x++) put(x, 0, x === ownSlot ? LEVEL.ownSlot : LEVEL.slotKey)
	return f
}

function drawNoLink(put: Put, size: GridSize) {
	for (let x = 0; x < size.width; x++) {
		put(x, 0, LEVEL.noLink)
		put(x, size.height - 1, LEVEL.noLink)
	}
	for (let y = 0; y < size.height; y++) {
		put(0, y, LEVEL.noLink)
		put(size.width - 1, y, LEVEL.noLink)
	}
}

function drawClips(st: ClipsState, w: WindowView, put: Put, pick: Pick, dip: boolean) {
	for (let y = 0; y < ROWS; y++)
		for (let x = 0; x < COLS; x++) put(x, y, slotLevel(w.slots[y * COLS + x], pick, dip))
	for (const s of st.staged) {
		const x = s.track - w.trackOff
		const y = s.scene - w.sceneOff
		if (x >= 0 && x < COLS && y >= 0 && y < ROWS) put(x, y, pick(LEVEL.staged))
	}

	const scenes = st.scenes && st.scenes.sceneOff === w.sceneOff ? st.scenes.codes : null
	for (let y = 0; y < ROWS; y++) {
		const c = scenes?.[y] ?? SCENE.none
		put(SCENE_COL, y, c === SCENE.triggered ? pick(LEVEL.sceneTriggered) : c === SCENE.present ? LEVEL.scenePresent : 0)
	}

	let anyPlaying = false
	for (let x = 0; x < COLS; x++) {
		const fl = viewFlags(st, x)
		if (fl === null) continue
		if (fl & TRACK.playing) anyPlaying = true
		if (st.layer === "clips") put(x, STOP_ROW, fl & TRACK.playing ? LEVEL.stopPlaying : LEVEL.stopIdle)
		else put(x, STOP_ROW, fl & TOGGLE_BIT[st.layer as ToggleLayer] ? LEVEL.toggleOn : LEVEL.toggleOff)
	}
	put(SCENE_COL, STOP_ROW, anyPlaying ? LEVEL.stopPlaying : LEVEL.stopIdle)
}

function drawFaders(st: ClipsState, put: Put) {
	const column = (x: number, v: number) => {
		const top = volumeToStep(v)
		for (let k = 0; k <= top; k++) put(x, STOP_ROW - k, k === top ? LEVEL.faderTop : LEVEL.faderFill)
	}
	for (let x = 0; x < COLS; x++) if (viewFlags(st, x) !== null) column(x, st.tracks!.volumes[x])
	if (st.tracks) column(SCENE_COL, st.tracks.master)
}

function drawControlRow(st: ClipsState, w: WindowView, put: Put) {
	for (const [x, layer] of Object.entries(LAYER_KEYS))
		put(Number(x), CTRL_ROW, layer === st.layer ? LEVEL.layerActive : LEVEL.layerOther)
	const can: Record<Arrow, boolean> = {
		left: w.trackOff > 0,
		right: w.trackOff < maxOffset(w.nTracks, COLS),
		up: w.sceneOff > 0,
		down: w.sceneOff < maxOffset(w.nScenes, ROWS),
	}
	for (const a of Object.keys(ARROWS) as Arrow[]) put(ARROWS[a], CTRL_ROW, can[a] ? LEVEL.arrowCan : LEVEL.arrowEdge)
	put(SHIFT_X, CTRL_ROW, st.shift ? LEVEL.shiftDown : LEVEL.shiftUp)
}
