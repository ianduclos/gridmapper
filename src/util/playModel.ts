/* PLAY page: what the page knows about idk.surface, and the pure rules on top of it.
 * ------------------------------------------------------------------------------
 * SurfaceMirror keeps the last value heard for every address the page asked about (replies
 * to /surface/get and the `lanes` / `preset` reports), keyed by the address itself. The
 * page also writes its own sends in here, so a bar moves the moment it is pressed and the
 * next reply only confirms it. No I/O, no timers: the page feeds it and reads it.
 */

import { foldedStep } from "./scales.js"
import {
	ENGINES,
	SLOTS,
	laneAddr,
	ownerAddr,
	partsFor,
	sharedAddr,
	type Part,
} from "./playSlots.js"

export const LANES = 8
/** Rows of a bar or a lane column: 0 at the bottom, 7 at the top. */
export const ROWS = 8
/** A lane that has not played yet sounds here (idk.surface OPERATING.md, "Target"). */
export const DEFAULT_HZ = 216
/** Grid step → surface key, as idk.surface's own grid seam does (kStepOffset). */
export const KEY_OFFSET = 36

export class SurfaceMirror {
	private values = new Map<string, number | string>()
	/** When anything was last heard from surface (0 = never). */
	heardAt = 0

	/** Take one incoming message. True if it changed something worth a repaint. */
	feed(path: string, args: any[], nowMs: number): boolean {
		if (!path.startsWith("/surface/")) return false
		this.heardAt = nowMs
		if (path === "/surface/error" || path === "/surface/subscribed") return false
		const v = args[0]
		if (typeof v !== "number" && typeof v !== "string") return false
		if (this.values.get(path) === v) return false
		this.values.set(path, v)
		return true
	}

	/** The page's own write, so the display is ahead of the next reply rather than behind it. */
	set(path: string, v: number | string): void {
		this.values.set(path, v)
	}

	num(path: string): number | undefined {
		const v = this.values.get(path)
		return typeof v === "number" ? v : undefined
	}

	str(path: string): string | undefined {
		const v = this.values.get(path)
		return typeof v === "string" ? v : undefined
	}

	/** `lane` is 0-7 throughout this class; the wire counts from 1. */
	engine(lane: number): string | undefined {
		return this.str(`/surface/lane/${lane + 1}/engine`)
	}

	/** Is the lane's dial its own (V)? Unknown reads as shared, which is how a lane starts. */
	owned(lane: number, p: Part): boolean {
		return this.str(ownerAddr(lane + 1, p)) === "voice"
	}

	/** The value the lane is actually playing with: its own on V, the shared dial's on F. */
	effective(lane: number, p: Part): number | undefined {
		return this.num(this.owned(lane, p) ? laneAddr(lane + 1, p) : sharedAddr(p))
	}

	/** A REEL lane in SLICES: `sampler` mode with notes picking slices (reelNotes slice). */
	slices(lane: number): boolean {
		const n = lane + 1
		return (
			this.engine(lane) === "reel" &&
			this.str(`/surface/lane/${n}/reel/reelMode`) === "sampler" &&
			this.str(`/surface/lane/${n}/reel/reelNotes`) === "slice"
		)
	}

	/** The key that fires the lane's first slice (REEL's ROOT). */
	sliceRoot(lane: number): number {
		return Math.round(this.num(`/surface/lane/${lane + 1}/reel/reelRoot`) ?? 60)
	}

	/** Does the lane keep its own note (V)? Then a note sent to it does not move its pitch. */
	ownNote(lane: number): boolean {
		return this.str(`/surface/lane/${lane + 1}/owner/voiceNote`) === "voice"
	}

	flag(lane: number, key: "arm" | "freeze" | "trem"): boolean {
		return (this.num(`/surface/lane/${lane + 1}/${key}`) ?? 0) !== 0
	}

	/** The lane's level in dB, −120 when silent or unknown. */
	level(lane: number): number {
		return this.num(`/surface/state/lane/${lane + 1}/level`) ?? -120
	}

	/** The lane's own pitch in Hz, 216 before its first note. */
	pitch(lane: number): number {
		const hz = this.num(`/surface/state/lane/${lane + 1}/pitch`)
		return hz && hz > 0 ? hz : DEFAULT_HZ
	}

	/** The loaded surface patch's name, "" when none is (or it cannot be read). */
	patch(): string {
		return this.str("/surface/state/preset") ?? ""
	}
}

/** What is read once in a while whatever layer is up (wildcards: one reply per lane). */
export const BASE_READS = [
	"/surface/lane/*/engine",
	"/surface/lane/*/reel/reelMode",
	"/surface/lane/*/reel/reelNotes",
	"/surface/lane/*/reel/reelRoot",
	"/surface/lane/*/owner/voiceNote",
	"/surface/lane/*/arm",
	"/surface/lane/*/freeze",
	"/surface/lane/*/trem",
] as const

/**
 * The reads that keep `slots` (0-5) in step for the engines now on the lanes: each dial's
 * own value on every lane, who owns it, and the shared dial.
 */
export function slotReads(mirror: SurfaceMirror, slots: readonly number[]): string[] {
	const engines = new Set<string>()
	for (let l = 0; l < LANES; l++) {
		const e = mirror.engine(l)
		if (e) engines.add(e)
	}
	const out = new Set<string>()
	for (const e of ENGINES) {
		if (!engines.has(e)) continue
		for (const s of slots)
			for (const p of partsFor(e, s)) {
				out.add(laneAddr("*", p))
				out.add(ownerAddr("*", p))
				out.add(sharedAddr(p))
			}
	}
	return [...out]
}

export const ALL_SLOTS = Array.from({ length: SLOTS }, (_, i) => i)

/** A dial's 0-1 value as a bar: which row (0 bottom … 7 top) its tip sits on. */
export const barRow = (v: number, scale = 1): number =>
	Math.max(0, Math.min(ROWS - 1, Math.round((v / scale) * (ROWS - 1))))

/** The 0-1 value a press on `row` asks for. */
export const rowValue = (row: number, scale = 1): number => (row / (ROWS - 1)) * scale

/** How hard a strike on `row` is: soft at the bottom, full at the top. */
export const rowVelocity = (row: number): number => (row + 1) / ROWS

export interface RowScale {
	npo: number
	root: number
	scale: string
	/** The step of the bottom row's octave (24 = the octave of middle C). */
	base: number
}

/**
 * The surface key a row plays: successive notes of the scale from the root upward, lowest
 * at the bottom. Scales are a 12-tone idea; in any other tuning the rows are neighbouring
 * steps. The result is a key number as idk.surface counts them (60 = middle C).
 */
export function rowKey(row: number, s: RowScale): number {
	const step = s.npo === 12 ? foldedStep(row, s.root, s.scale) : s.root + row
	return Math.max(0, Math.min(127, KEY_OFFSET + s.base + step))
}

/** A lane's level (dB) as an LED level between `floor` and 15: −60 dB and under is the floor. */
export function levelLed(db: number, floor = 3): number {
	const t = Math.max(0, Math.min(1, (db + 60) / 60))
	return Math.round(floor + t * (15 - floor))
}

/** One stored state of a lane's six: part suffix → value, plus the lane's TREM switch. */
export type PresetState = Record<string, number>
export const PRESET_TREM = "trem"
