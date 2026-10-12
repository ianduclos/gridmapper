import { describe, it, expect } from "vitest"
import {
	createClipsState, applyLive, pressKey, clipsFrame, stepToVolume,
	LEVEL, SLOT, TRACK, SCENE, SCENE_COL, STOP_ROW, CTRL_ROW, SHIFT_X, PAGES_X, ARROWS,
	LOCAL_BEAT_MS, DIP_MS, type ClipsState,
} from "../src/util/clipsState.js"
import { ledIndex, type GridSize, type LedFrame } from "../src/core/types.js"
import { linked, windowMsg, T0 } from "./clipsFixtures.js"

const SIZE: GridSize = { width: 16, height: 8 }
const at = (f: LedFrame, x: number, y: number) => f[ledIndex(SIZE, x, y)]
const tap = (st: ClipsState, x: number, y: number) => { pressKey(st, x, y, 1, T0); pressKey(st, x, y, 0, T0) }

describe("clips frame", () => {
	it("draws each steady slot code at its table level", () => {
		const codes = [SLOT.none, SLOT.empty, SLOT.emptyArmed, SLOT.stopped, SLOT.playing]
		const st = linked({ fill: (x) => codes[x] ?? SLOT.none })
		const f = clipsFrame(st, SIZE, T0)
		expect([0, 1, 2, 3, 4].map((x) => at(f, x, 0))).toEqual([0, 0, LEVEL.emptyArmed, LEVEL.stopped, LEVEL.playing])
	})

	it("queued states blink with Live's beat", () => {
		const st = linked({ fill: (x) => [SLOT.queuedPlay, SLOT.queuedStop, SLOT.queuedRec][x] ?? SLOT.none })
		applyLive(st, "/clips/beat", [4], T0)
		const on = clipsFrame(st, SIZE, T0 + 10)
		applyLive(st, "/clips/beat", [5], T0 + 500)
		const off = clipsFrame(st, SIZE, T0 + 510)
		expect([0, 1, 2].map((x) => at(on, x, 0))).toEqual([LEVEL.queuedPlay[1], LEVEL.queuedStop[1], LEVEL.queuedRec[1]])
		expect([0, 1, 2].map((x) => at(off, x, 0))).toEqual([LEVEL.queuedPlay[0], LEVEL.queuedStop[0], LEVEL.queuedRec[0]])
	})

	it("blinks on its own clock when Live sends no beat (transport stopped)", () => {
		const st = linked({ fill: () => SLOT.queuedPlay })
		const a = at(clipsFrame(st, SIZE, 0), 0, 0)
		const b = at(clipsFrame(st, SIZE, LOCAL_BEAT_MS), 0, 0)
		expect(new Set([a, b])).toEqual(new Set(LEVEL.queuedPlay))
	})

	it("recording dips on each beat", () => {
		const st = linked({ fill: () => SLOT.recording })
		applyLive(st, "/clips/beat", [8], T0)
		expect(at(clipsFrame(st, SIZE, T0 + 10), 0, 0)).toBe(LEVEL.recordingDip)
		expect(at(clipsFrame(st, SIZE, T0 + DIP_MS + 10), 0, 0)).toBe(LEVEL.recording)
	})

	it("scene keys: present steady, triggered blinks, missing dark", () => {
		const st = linked({ nScenes: 3, scene: (y) => (y === 1 ? SCENE.triggered : SCENE.present) })
		applyLive(st, "/clips/beat", [2], T0)
		const f = clipsFrame(st, SIZE, T0 + 10)
		expect([0, 1, 2, 3].map((y) => at(f, SCENE_COL, y))).toEqual([LEVEL.scenePresent, LEVEL.sceneTriggered[1], LEVEL.scenePresent, 0])
	})

	it("stop row: playing vs idle tracks, missing tracks dark; stop-all lit when anything plays", () => {
		const st = linked({ nTracks: 3, flag: (x) => (x === 1 ? TRACK.playing : 0) })
		const f = clipsFrame(st, SIZE, T0)
		expect([0, 1, 2, 3].map((x) => at(f, x, STOP_ROW))).toEqual([LEVEL.stopIdle, LEVEL.stopPlaying, LEVEL.stopIdle, 0])
		expect(at(f, SCENE_COL, STOP_ROW)).toBe(LEVEL.stopPlaying)
	})

	it("M/S/A: the stop row shows that property", () => {
		const st = linked({ flag: (x) => (x === 0 ? TRACK.solo : 0) })
		tap(st, 3, CTRL_ROW)
		const f = clipsFrame(st, SIZE, T0)
		expect([at(f, 0, STOP_ROW), at(f, 1, STOP_ROW)]).toEqual([LEVEL.toggleOn, LEVEL.toggleOff])
	})

	it("track rows stay dark while the track feed is for another bank", () => {
		const st = linked({ flag: () => TRACK.playing })
		applyLive(st, "/clips/window", windowMsg({ trackOff: 15 }), T0)
		const f = clipsFrame(st, SIZE, T0)
		expect(at(f, 0, STOP_ROW)).toBe(0)
	})

	it("V layer: a column per track up to its volume step, master on x15", () => {
		const st = linked({ nTracks: 2, vol: (x) => (x === 0 ? 0.85 : 0), master: stepToVolume(3) })
		tap(st, 5, CTRL_ROW)
		const f = clipsFrame(st, SIZE, T0)
		const col = (x: number) => [0, 1, 2, 3, 4, 5, 6].map((y) => at(f, x, y))
		const T = LEVEL.faderTop
		const F = LEVEL.faderFill
		expect(col(0)).toEqual([T, F, F, F, F, F, F])
		expect(col(1)).toEqual([0, 0, 0, 0, 0, 0, T])
		expect(col(2)).toEqual([0, 0, 0, 0, 0, 0, 0])
		expect(col(SCENE_COL)).toEqual([0, 0, 0, T, F, F, F])
	})

	it("control row: active layer bright, arrows dim at an edge, shift and pages keys", () => {
		const st = linked({ nTracks: 20, nScenes: 6 })
		const f = clipsFrame(st, SIZE, T0)
		expect([1, 2, 3, 4, 5].map((x) => at(f, x, CTRL_ROW))).toEqual([LEVEL.layerActive, LEVEL.layerOther, LEVEL.layerOther, LEVEL.layerOther, LEVEL.layerOther])
		expect([ARROWS.left, ARROWS.right, ARROWS.up, ARROWS.down].map((x) => at(f, x, CTRL_ROW)))
			.toEqual([LEVEL.arrowEdge, LEVEL.arrowCan, LEVEL.arrowEdge, LEVEL.arrowEdge])
		expect(at(f, SHIFT_X, CTRL_ROW)).toBe(LEVEL.shiftUp)
		expect(at(f, PAGES_X, CTRL_ROW)).toBe(LEVEL.pagesUp)
		pressKey(st, SHIFT_X, CTRL_ROW, 1, T0)
		expect(at(clipsFrame(st, SIZE, T0), SHIFT_X, CTRL_ROW)).toBe(LEVEL.shiftDown)
	})

	it("no link: a dim border and nothing else", () => {
		const f = clipsFrame(createClipsState(), SIZE, T0)
		for (let y = 0; y < 8; y++)
			for (let x = 0; x < 16; x++) {
				const edge = x === 0 || y === 0 || x === 15 || y === 7
				expect(at(f, x, y)).toBe(edge ? LEVEL.noLink : 0)
			}
	})

	it("holding the pages key lights slot keys a–h, this page's own brightest", () => {
		const st = linked()
		pressKey(st, PAGES_X, CTRL_ROW, 1, T0)
		const f = clipsFrame(st, SIZE, T0, 2)
		const S = LEVEL.slotKey
		expect([0, 1, 2, 3, 4, 5, 6, 7, 8].map((x) => at(f, x, 0))).toEqual([S, S, LEVEL.ownSlot, S, S, S, S, S, LEVEL.stopped])
		expect(at(f, PAGES_X, CTRL_ROW)).toBe(LEVEL.pagesDown)
	})

	it("every level in the table is a grid level", () => {
		for (const v of Object.values(LEVEL).flat()) expect(Number.isInteger(v) && v >= 0 && v <= 15).toBe(true)
	})
})
