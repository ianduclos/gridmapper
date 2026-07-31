// src/core/settings.ts — configs/settings.json: boot config + live, persisted app settings.
//
// Two tiers, and the difference matters:
//   osc.*    BOOT ONLY. The UDP socket is bound once in createOsc() and never rebuilt, so
//            a port change needs a restart. The web UI shows these read-only.
//   clock.*  LIVE. Changed from the web panel or Max over /grid/in/settings/<sec>/<key>,
//   idle.*   applied to the running AppClock/IdleManager, and written back to disk.
//
// The clock's RUN state is deliberately not persisted — the transport always boots
// stopped ("clock off by default"); only its rate/source/echo survive a restart.

import { readFileSync, writeFileSync, renameSync } from "node:fs"
import { resolve as resolvePath } from "node:path"
import { clamp } from "../util/scale.js"
import {
	type LaneConfig,
	isClockSource,
	clampRate,
	clampDiv,
	sanitizeLanes,
	DEFAULT_LANES,
	LANE_COUNT,
} from "./clock.js"

const SETTINGS_PATH = resolvePath(process.cwd(), "configs/settings.json")
const SAVE_DEBOUNCE_MS = 300 // a slider drag shouldn't thrash the disk

export type Settings = {
	osc: {
		inPort: number
		outPort: number
	}
	clock: {
		/** Master internal rate in Hz. */
		rate: number
		/** Per-lane source + divisor (see core/clock.ts). Always LANE_COUNT entries. */
		lanes: LaneConfig[]
		/** Echo every tick as /grid/out/clock/tick (off by default — it's 20 msg/s). */
		echo: boolean
	}
	idle: {
		/** Sleep after this many minutes of no input, with a grid attached. */
		connectedMin: number
		/** ...and without one. */
		disconnectedMin: number
		/** Never sleep. */
		caffeinate: boolean
	}
}

export const DEFAULT_SETTINGS: Settings = {
	osc: { inPort: 57131, outPort: 57130 },
	clock: { rate: 20, lanes: DEFAULT_LANES.map((l) => ({ ...l })), echo: false },
	idle: { connectedMin: 240, disconnectedMin: 15, caffeinate: false },
}

const MAX_MIN = 60 * 24 * 7 // a week is plenty of rope

const isRecord = (v: unknown): v is Record<string, unknown> =>
	typeof v === "object" && v !== null && !Array.isArray(v)

const cleanPort = (value: unknown, fallback: number) => {
	if (typeof value !== "number" || !Number.isInteger(value)) return fallback
	return clamp(value, 1, 65535)
}

const cleanMinutes = (value: unknown, fallback: number) => {
	const n = Number(value)
	if (!Number.isFinite(n)) return fallback
	return clamp(n, 1, MAX_MIN)
}

const cleanBool = (value: unknown, fallback: boolean) => {
	if (typeof value === "boolean") return value
	if (typeof value === "number") return value !== 0
	if (value === "true" || value === "1") return true
	if (value === "false" || value === "0") return false
	return fallback
}

/**
 * Lanes, tolerating a settings file written before they existed. A pre-lane file has a
 * single `clock.source`; that was the one and only tick stream, so it becomes lane 0's
 * source and the rest fall back to defaults.
 */
const migrateLanes = (clockNode: Record<string, unknown>): LaneConfig[] => {
	const lanes = sanitizeLanes(clockNode.lanes)
	if (!Array.isArray(clockNode.lanes) && isClockSource(clockNode.source)) {
		lanes[0].source = clockNode.source
	}
	return lanes
}

/** Load configs/settings.json, tolerating a missing, partial or malformed file. */
export function loadSettings(path = SETTINGS_PATH): Settings {
	let parsed: unknown
	try {
		parsed = JSON.parse(readFileSync(path, "utf8"))
	} catch (err) {
		const code = (err as NodeJS.ErrnoException)?.code
		if (code && code !== "ENOENT") {
			console.warn("[Settings] Failed to read configs/settings.json:", err)
		}
		return structuredClone(DEFAULT_SETTINGS)
	}

	if (!isRecord(parsed)) return structuredClone(DEFAULT_SETTINGS)
	const oscNode = isRecord(parsed.osc) ? parsed.osc : {}
	const clockNode = isRecord(parsed.clock) ? parsed.clock : {}
	const idleNode = isRecord(parsed.idle) ? parsed.idle : {}

	return {
		osc: {
			inPort: cleanPort(oscNode.inPort, DEFAULT_SETTINGS.osc.inPort),
			outPort: cleanPort(oscNode.outPort, DEFAULT_SETTINGS.osc.outPort),
		},
		clock: {
			rate: clampRate(clockNode.rate ?? DEFAULT_SETTINGS.clock.rate),
			lanes: migrateLanes(clockNode),
			echo: cleanBool(clockNode.echo, DEFAULT_SETTINGS.clock.echo),
		},
		idle: {
			connectedMin: cleanMinutes(idleNode.connectedMin, DEFAULT_SETTINGS.idle.connectedMin),
			disconnectedMin: cleanMinutes(idleNode.disconnectedMin, DEFAULT_SETTINGS.idle.disconnectedMin),
			caffeinate: cleanBool(idleNode.caffeinate, DEFAULT_SETTINGS.idle.caffeinate),
		},
	}
}

/** Write settings atomically (temp + rename) so a crash can't leave a half file. */
export function writeSettings(s: Settings, path = SETTINGS_PATH): void {
	const tmp = `${path}.tmp`
	writeFileSync(tmp, `${JSON.stringify(s, null, "\t")}\n`, "utf8")
	renameSync(tmp, path)
}

export const minToMs = (min: number) => Math.round(min * 60_000)

/**
 * The live settings a host mutates over OSC. Owns clamping, persistence (debounced +
 * atomic) and change notification; the router just hands it `<section>/<key>` and a
 * value, so the web panel and Max share one path into config.
 */
export class SettingsStore {
	private current: Settings
	private saveTimer: ReturnType<typeof setTimeout> | null = null

	constructor(
		initial: Settings = loadSettings(),
		private readonly onChange?: (s: Readonly<Settings>, path: string) => void,
		private readonly path: string = SETTINGS_PATH
	) {
		this.current = structuredClone(initial)
	}

	get(): Readonly<Settings> {
		return this.current
	}

	json(): string {
		return JSON.stringify(this.current)
	}

	/**
	 * Apply one live setting, e.g. apply("clock/rate", 30) or apply("idle/caffeinate", 1).
	 * Returns true if it was a known, live-settable key (osc.* is boot-only and refused).
	 */
	apply(path: string, value: unknown): boolean {
		const [section, key] = path.split("/").filter(Boolean)
		const c = this.current
		let ok = true
		if (section === "clock") {
			if (key === "rate") c.clock.rate = clampRate(value)
			else if (key === "echo") c.clock.echo = cleanBool(value, c.clock.echo)
			else if (key === "lanes") {
				// clock/lanes/<i>/<source|div> — the web panel's four lane rows.
				const [, , idxRaw, laneKey] = path.split("/").filter(Boolean)
				const i = Number(idxRaw)
				if (!Number.isInteger(i) || i < 0 || i >= LANE_COUNT) return false
				if (laneKey === "source") {
					if (!isClockSource(value)) return false
					c.clock.lanes[i].source = value
				} else if (laneKey === "div") {
					c.clock.lanes[i].div = clampDiv(value)
				} else return false
			} else ok = false
		} else if (section === "idle") {
			if (key === "connectedMin") c.idle.connectedMin = cleanMinutes(value, c.idle.connectedMin)
			else if (key === "disconnectedMin") c.idle.disconnectedMin = cleanMinutes(value, c.idle.disconnectedMin)
			else if (key === "caffeinate") c.idle.caffeinate = cleanBool(value, c.idle.caffeinate)
			else ok = false
		} else {
			ok = false // osc.* is boot-only; anything else is unknown
		}
		if (!ok) return false
		this.onChange?.(this.current, `${section}/${key}`)
		this.save()
		return true
	}

	/** Persist (debounced). */
	save() {
		if (this.saveTimer) clearTimeout(this.saveTimer)
		this.saveTimer = setTimeout(() => {
			this.saveTimer = null
			try {
				writeSettings(this.current, this.path)
			} catch (err) {
				console.warn("[Settings] Failed to write configs/settings.json:", err)
			}
		}, SAVE_DEBOUNCE_MS)
		this.saveTimer.unref?.()
	}

	/** Flush any pending write immediately (shutdown). */
	flush() {
		if (!this.saveTimer) return
		clearTimeout(this.saveTimer)
		this.saveTimer = null
		try {
			writeSettings(this.current, this.path)
		} catch {}
	}
}
