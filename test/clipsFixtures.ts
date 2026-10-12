// Builders for the fork's /clips messages, shaped like a real set. Not a test file.
import { createClipsState, applyLive, COLS, ROWS, SLOT, TRACK, SCENE, type ClipsState } from "../src/util/clipsState.js"

export const T0 = 10_000 // a "now" comfortably past zero

export interface SetShape {
	trackOff?: number
	sceneOff?: number
	nTracks?: number
	nScenes?: number
	/** Slot code by window cell (x 0-14, y 0-5); cells past the set are SLOT.none anyway. */
	fill?: (x: number, y: number) => number
	/** Extra track flag bits by window column; `exists` is added for real tracks. */
	flag?: (x: number) => number
	vol?: (x: number) => number
	master?: number
	/** Scene code by window row. */
	scene?: (y: number) => number
}

const shape = (o: SetShape) => ({
	trackOff: 0, sceneOff: 0, nTracks: 40, nScenes: 20,
	fill: (_x: number, _y: number) => SLOT.stopped as number,
	flag: (_x: number) => 0,
	vol: (_x: number) => 0.85,
	master: 0.85,
	scene: (_y: number) => SCENE.present as number,
	...o,
})

export function windowMsg(o: SetShape = {}): number[] {
	const s = shape(o)
	const slots: number[] = []
	for (let y = 0; y < ROWS; y++)
		for (let x = 0; x < COLS; x++)
			slots.push(s.trackOff + x < s.nTracks && s.sceneOff + y < s.nScenes ? s.fill(x, y) : SLOT.none)
	return [s.trackOff, s.sceneOff, s.nTracks, s.nScenes, ...slots]
}

export function tracksMsg(o: SetShape = {}): number[] {
	const s = shape(o)
	const real = (x: number) => s.trackOff + x < s.nTracks
	return [
		s.trackOff,
		...Array.from({ length: COLS }, (_, x) => (real(x) ? TRACK.exists | s.flag(x) : 0)),
		...Array.from({ length: COLS }, (_, x) => (real(x) ? s.vol(x) : 0)),
		s.master,
	]
}

export function scenesMsg(o: SetShape = {}): number[] {
	const s = shape(o)
	return [s.sceneOff, ...Array.from({ length: ROWS }, (_, y) => (s.sceneOff + y < s.nScenes ? s.scene(y) : SCENE.none))]
}

/** A state that has heard a full snapshot (window, tracks, scenes) from the fork. */
export function linked(o: SetShape = {}, nowMs = T0): ClipsState {
	const st = createClipsState()
	applyLive(st, "/clips/window", windowMsg(o), nowMs)
	applyLive(st, "/clips/tracks", tracksMsg(o), nowMs)
	applyLive(st, "/clips/scenes", scenesMsg(o), nowMs)
	return st
}
