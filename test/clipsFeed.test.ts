import { describe, it, expect } from "vitest"
import {
	createClipsState, applyLive, linkTick, nextOffset, maxOffset,
	SLOT, TRACK, SCENE, COLS, ROWS, HELLO_RETRY_MS, QUIET_PROBE_MS,
} from "../src/util/clipsState.js"
import { windowMsg, tracksMsg, scenesMsg, T0 } from "./clipsFixtures.js"

const hellos = (sends: { path: string }[]) => sends.filter((m) => m.path === "/clips/hello").length

describe("clips feed", () => {
	it("reads a window: offsets, set size and 90 slot codes, row-major", () => {
		const st = createClipsState()
		const msg = windowMsg({ trackOff: 15, sceneOff: 6, fill: (x, y) => (x === 2 && y === 1 ? SLOT.playing : SLOT.stopped) })
		expect(applyLive(st, "/clips/window", msg, T0)).toBe(true)
		expect(st.win).toMatchObject({ trackOff: 15, sceneOff: 6, nTracks: 40, nScenes: 20 })
		expect(st.win!.slots).toHaveLength(COLS * ROWS)
		expect(st.win!.slots[1 * COLS + 2]).toBe(SLOT.playing)
		expect(st.linked).toBe(true)
		expect(st.lastHeardMs).toBe(T0)
	})

	it("reads tracks (flags, volumes, master) and scenes", () => {
		const st = createClipsState()
		applyLive(st, "/clips/tracks", tracksMsg({ trackOff: 15, flag: (x) => (x === 0 ? TRACK.mute | TRACK.playing : 0), vol: () => 0.5, master: 0.7 }), T0)
		applyLive(st, "/clips/scenes", scenesMsg({ sceneOff: 6, scene: (y) => (y === 2 ? SCENE.triggered : SCENE.present) }), T0)
		expect(st.tracks!.trackOff).toBe(15)
		expect(st.tracks!.flags[0]).toBe(TRACK.exists | TRACK.mute | TRACK.playing)
		expect(st.tracks!.volumes[3]).toBe(0.5)
		expect(st.tracks!.master).toBe(0.7)
		expect(st.scenes).toEqual({ sceneOff: 6, codes: [1, 1, 2, 1, 1, 1] })
	})

	it("remembers the beat and when it came", () => {
		const st = createClipsState()
		applyLive(st, "/clips/beat", [12], T0 + 5)
		expect(st.beat).toBe(12)
		expect(st.beatAtMs).toBe(T0 + 5)
	})

	it("ignores short, non-numeric or unknown messages without throwing, and they don't count as a link", () => {
		const st = createClipsState()
		const junk: Array<[string, unknown[]]> = [
			["/clips/window", [0, 0, 4]],
			["/clips/window", ["a", ...windowMsg().slice(1)]],
			["/clips/tracks", [0, 1]],
			["/clips/scenes", [0, NaN, 1, 1, 1, 1, 1]],
			["/clips/beat", []],
			["/clips/beat", ["one"]],
			["/live/song/get/tempo", [120]],
		]
		for (const [p, a] of junk) expect(applyLive(st, p, a, T0)).toBe(false)
		expect(st.linked).toBe(false)
		expect(st.win).toBeNull()
		expect(st.tracks).toBeNull()
		expect(st.scenes).toBeNull()
	})

	it("an out-of-range code reads as 'nothing there'; volumes clamp into 0..1", () => {
		const st = createClipsState()
		applyLive(st, "/clips/window", windowMsg({ fill: (x) => (x === 0 ? 99 : x === 1 ? -1 : 2.5) }), T0)
		expect(st.win!.slots.slice(0, 3)).toEqual([0, 0, 0])
		applyLive(st, "/clips/tracks", tracksMsg({ vol: (x) => (x === 0 ? 3 : -1) }), T0)
		expect(st.tracks!.volumes.slice(0, 2)).toEqual([1, 0])
	})

	it("a new window clears the offsets we were waiting for", () => {
		const st = createClipsState()
		st.want = { trackOff: 15, sceneOff: 0 }
		applyLive(st, "/clips/window", windowMsg({ trackOff: 15 }), T0)
		expect(st.want).toBeNull()
	})
})

describe("offsets", () => {
	it("steps and clamps so the window stays inside the set", () => {
		expect(nextOffset(0, 40, COLS, 1, COLS)).toBe(15)
		expect(nextOffset(15, 40, COLS, 1, COLS)).toBe(25) // max(0, 40 - 15)
		expect(nextOffset(25, 40, COLS, 1, COLS)).toBe(25)
		expect(nextOffset(3, 40, COLS, -1, COLS)).toBe(0)
		expect(nextOffset(7, 40, COLS, 1, 1)).toBe(8)
	})

	it("a set smaller than the window, or empty, pins the offset at 0", () => {
		expect(maxOffset(3, COLS)).toBe(0)
		expect(maxOffset(0, ROWS)).toBe(0)
		expect(nextOffset(0, 3, COLS, 1, COLS)).toBe(0)
		expect(nextOffset(0, 0, ROWS, 1, 1)).toBe(0)
	})
})

describe("link liveness", () => {
	it("says hello at once, then every 2 s until the fork answers", () => {
		const st = createClipsState()
		expect(hellos(linkTick(st, T0))).toBe(1)
		expect(hellos(linkTick(st, T0 + HELLO_RETRY_MS - 1))).toBe(0)
		expect(hellos(linkTick(st, T0 + HELLO_RETRY_MS))).toBe(1)
		applyLive(st, "/clips/window", windowMsg(), T0 + HELLO_RETRY_MS + 50)
		expect(linkTick(st, T0 + 3 * HELLO_RETRY_MS)).toEqual([])
	})

	it("Live quitting is noticed: a quiet link is probed, and an unanswered probe drops it", () => {
		const st = createClipsState()
		linkTick(st, T0)
		applyLive(st, "/clips/window", windowMsg(), T0 + 100) // linked, last heard T0+100
		const heard = T0 + 100
		expect(linkTick(st, heard + QUIET_PROBE_MS - 1)).toEqual([])
		expect(hellos(linkTick(st, heard + QUIET_PROBE_MS))).toBe(1) // the probe
		expect(st.linked).toBe(true)
		expect(linkTick(st, heard + QUIET_PROBE_MS + HELLO_RETRY_MS - 1)).toEqual([])
		expect(hellos(linkTick(st, heard + QUIET_PROBE_MS + HELLO_RETRY_MS))).toBe(1) // unanswered → retry
		expect(st.linked).toBe(false)
	})

	it("an answered probe keeps the link", () => {
		const st = createClipsState()
		applyLive(st, "/clips/window", windowMsg(), T0)
		linkTick(st, T0 + QUIET_PROBE_MS) // probe
		applyLive(st, "/clips/window", windowMsg(), T0 + QUIET_PROBE_MS + 80)
		expect(linkTick(st, T0 + QUIET_PROBE_MS + HELLO_RETRY_MS)).toEqual([])
		expect(st.linked).toBe(true)
	})
})
