import { describe, it, expect } from "vitest"
import {
	createClipsState, applyLive, pressKey, stepToVolume, volumeToStep,
	SLOT, TRACK, SCENE_COL, STOP_ROW, CTRL_ROW, SHIFT_X, PAGES_X, ARROWS, MOMENTARY_MS, FADER_STEPS,
	type ClipsState, type KeyResult,
} from "../src/util/clipsState.js"
import { linked, windowMsg, T0 } from "./clipsFixtures.js"

const press = (st: ClipsState, x: number, y: number, t = T0) => pressKey(st, x, y, 1, t)
const release = (st: ClipsState, x: number, y: number, t = T0) => pressKey(st, x, y, 0, t)
const tap = (st: ClipsState, x: number, y: number, t = T0) => { press(st, x, y, t); return release(st, x, y, t) }
const msgs = (r: KeyResult) => r.send.map((m) => [m.path, ...m.args])

describe("clip keys", () => {
	it("press and release send the ABSOLUTE slot", () => {
		const st = linked({ trackOff: 15, sceneOff: 6 })
		expect(msgs(press(st, 2, 1))).toEqual([["/clips/slot/button", 17, 7, 1]])
		expect(msgs(release(st, 2, 1))).toEqual([["/clips/slot/button", 17, 7, 0]])
	})

	it("a release after a bank move still goes to the slot that was pressed", () => {
		const st = linked()
		press(st, 3, 2)
		press(st, ARROWS.right, CTRL_ROW)
		applyLive(st, "/clips/window", windowMsg({ trackOff: 15 }), T0)
		expect(msgs(release(st, 3, 2))).toEqual([["/clips/slot/button", 3, 2, 0]])
	})

	it("a release after switching layer still releases the clip", () => {
		const st = linked()
		press(st, 0, 0)
		tap(st, 5, CTRL_ROW) // latch V
		expect(st.layer).toBe("volume")
		expect(msgs(release(st, 0, 0))).toEqual([["/clips/slot/button", 0, 0, 0]])
	})

	it("a slot that doesn't exist sends nothing", () => {
		const st = linked({ nTracks: 3, nScenes: 2 })
		expect(press(st, 5, 0).send).toEqual([])
		expect(press(st, 0, 4).send).toEqual([])
		expect(release(st, 5, 0).send).toEqual([])
	})

	it("launching a clip (or recording into an armed empty slot) moves the track focus; an empty slot doesn't", () => {
		const st = linked({ trackOff: 15, fill: (x) => (x === 0 ? SLOT.empty : x === 1 ? SLOT.emptyArmed : SLOT.stopped) })
		expect(press(st, 0, 0).focus).toBeUndefined()
		expect(press(st, 1, 0).focus).toBe(16)
		expect(press(st, 4, 0).focus).toBe(19)
		expect(st.focusTrack).toBe(19)
	})

	it("nothing goes out before the fork has answered", () => {
		const st = createClipsState()
		expect(press(st, 0, 0).send).toEqual([])
		expect(press(st, SCENE_COL, 0).send).toEqual([])
		expect(press(st, 0, STOP_ROW).send).toEqual([])
		expect(press(st, ARROWS.right, CTRL_ROW).send).toEqual([])
	})
})

describe("scene and stop keys", () => {
	it("scene press/release by absolute scene; past the last scene does nothing", () => {
		const st = linked({ sceneOff: 6, nScenes: 9 })
		expect(msgs(press(st, SCENE_COL, 1))).toEqual([["/clips/scene/button", 7, 1]])
		expect(msgs(release(st, SCENE_COL, 1))).toEqual([["/clips/scene/button", 7, 0]])
		expect(press(st, SCENE_COL, 3).send).toEqual([])
	})

	it("the stop row stops a track, x15 stops all; releases send nothing", () => {
		const st = linked({ trackOff: 15 })
		expect(msgs(press(st, 4, STOP_ROW))).toEqual([["/clips/track/stop", 19]])
		expect(msgs(press(st, SCENE_COL, STOP_ROW))).toEqual([["/clips/stop_all"]])
		expect(release(st, 4, STOP_ROW).send).toEqual([])
	})
})

describe("navigation", () => {
	it("arrows bank a whole window, shift steps by one, and a second press builds on the first", () => {
		const st = linked()
		expect(msgs(press(st, ARROWS.right, CTRL_ROW))).toEqual([["/clips/window/set", 15, 0]])
		expect(msgs(press(st, ARROWS.down, CTRL_ROW))).toEqual([["/clips/window/set", 15, 6]])
		press(st, SHIFT_X, CTRL_ROW)
		expect(msgs(press(st, ARROWS.left, CTRL_ROW))).toEqual([["/clips/window/set", 14, 6]])
	})

	it("clamps so the window stays inside the set, and sends nothing at an edge", () => {
		const st = linked({ nTracks: 20, nScenes: 8 })
		expect(msgs(press(st, ARROWS.right, CTRL_ROW))).toEqual([["/clips/window/set", 5, 0]])
		applyLive(st, "/clips/window", windowMsg({ trackOff: 5, nTracks: 20, nScenes: 8 }), T0)
		expect(press(st, ARROWS.right, CTRL_ROW).send).toEqual([])
		expect(msgs(press(st, ARROWS.down, CTRL_ROW))).toEqual([["/clips/window/set", 5, 2]])
	})

	it("a set smaller than the window never moves", () => {
		const st = linked({ nTracks: 3, nScenes: 2 })
		for (const x of Object.values(ARROWS)) expect(press(st, x, CTRL_ROW).send).toEqual([])
	})

	it("an empty set (no tracks, no scenes) is safe", () => {
		const st = linked({ nTracks: 0, nScenes: 0 })
		expect(press(st, 0, 0).send).toEqual([])
		expect(press(st, SCENE_COL, 0).send).toEqual([])
		expect(press(st, 0, STOP_ROW).send).toEqual([])
		expect(press(st, ARROWS.right, CTRL_ROW).send).toEqual([])
	})

	it("pages key + a top-row key asks for slot a–h, and launches nothing while held", () => {
		const st = linked()
		press(st, PAGES_X, CTRL_ROW)
		expect(press(st, 2, 0)).toEqual({ send: [], focusSlot: 2 })
		expect(press(st, 9, 0).send).toEqual([])
		expect(press(st, 3, 3).send).toEqual([])
		release(st, PAGES_X, CTRL_ROW)
		expect(msgs(press(st, 2, 0))).toEqual([["/clips/slot/button", 2, 0, 1]])
	})

	it("the pages key works with no link (you can always leave)", () => {
		const st = createClipsState()
		press(st, PAGES_X, CTRL_ROW)
		expect(press(st, 1, 0).focusSlot).toBe(1)
	})
})

describe("layers", () => {
	it("a tap latches a layer; tap C returns", () => {
		const st = linked()
		press(st, 2, CTRL_ROW, T0)
		release(st, 2, CTRL_ROW, T0 + 100)
		expect(st.layer).toBe("mute")
		press(st, 1, CTRL_ROW, T0 + 200)
		release(st, 1, CTRL_ROW, T0 + 250)
		expect(st.layer).toBe("clips")
	})

	it("a hold is momentary: release goes back to the latched layer", () => {
		const st = linked()
		press(st, 3, CTRL_ROW, T0)
		expect(st.layer).toBe("solo")
		release(st, 3, CTRL_ROW, T0 + MOMENTARY_MS + 1)
		expect(st.layer).toBe("clips")
	})

	it("M/S/A: the stop row toggles that property from the track's flags; clips keep launching; stop-all stays", () => {
		const st = linked({ trackOff: 15, flag: (x) => (x === 1 ? TRACK.mute : 0) })
		tap(st, 2, CTRL_ROW)
		expect(msgs(press(st, 1, STOP_ROW))).toEqual([["/clips/track/set", "mute", 16, 0]])
		expect(msgs(press(st, 2, STOP_ROW))).toEqual([["/clips/track/set", "mute", 17, 1]])
		expect(msgs(press(st, SCENE_COL, STOP_ROW))).toEqual([["/clips/stop_all"]])
		expect(msgs(press(st, 0, 0))).toEqual([["/clips/slot/button", 15, 0, 1]])
	})

	it("toggles nothing while the track feed is for another bank", () => {
		const st = linked()
		applyLive(st, "/clips/window", windowMsg({ trackOff: 15 }), T0) // tracks still say offset 0
		tap(st, 4, CTRL_ROW)
		expect(press(st, 0, STOP_ROW).send).toEqual([])
	})

	it("V: a press sets that track's volume, y0 = 0 dB (0.85), y6 = −∞ (0); the master column sends nothing", () => {
		const st = linked({ trackOff: 15 })
		tap(st, 5, CTRL_ROW)
		expect(msgs(press(st, 3, 0))).toEqual([["/clips/track/set", "volume", 18, 0.85]])
		expect(msgs(press(st, 3, 6))).toEqual([["/clips/track/set", "volume", 18, 0]])
		expect(press(st, SCENE_COL, 0).send).toEqual([])
		expect(press(st, SCENE_COL, STOP_ROW).send).toEqual([]) // not stop-all on this layer
	})

	it("fader steps round-trip through volume", () => {
		for (let k = 0; k < FADER_STEPS; k++) expect(volumeToStep(stepToVolume(k))).toBe(k)
		expect(volumeToStep(1)).toBe(FADER_STEPS - 1) // +6 dB still reads as the top
		expect(volumeToStep(0)).toBe(0)
	})
})
