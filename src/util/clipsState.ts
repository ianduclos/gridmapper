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
