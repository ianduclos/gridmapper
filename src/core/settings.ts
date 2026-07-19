// src/core/settings.ts — boot-time settings (configs/settings.json).
//
// Read once at boot; NOT live-hot-swappable (the OSC UDP socket is bound once in
// createOsc() and never rebuilt). Currently just the app OSC ports, moved out of
// the hardcoded defaults in io/osc.ts. Mirrors twistermapper's settings.json,
// scoped to what gridmapper actually uses today.

import { readFileSync } from "node:fs"
import { resolve as resolvePath } from "node:path"
import { clamp } from "../util/scale.js"

const SETTINGS_PATH = resolvePath(process.cwd(), "configs/settings.json")

export type Settings = {
	osc: {
		inPort: number
		outPort: number
	}
}

const DEFAULT_SETTINGS: Settings = {
	osc: { inPort: 57131, outPort: 57130 },
}

const isRecord = (v: unknown): v is Record<string, unknown> =>
	typeof v === "object" && v !== null && !Array.isArray(v)

const cleanPort = (value: unknown, fallback: number) => {
	if (typeof value !== "number" || !Number.isInteger(value)) return fallback
	return clamp(value, 1, 65535)
}

/** Load configs/settings.json, tolerating a missing or malformed file. */
export function loadSettings(): Settings {
	let parsed: unknown
	try {
		parsed = JSON.parse(readFileSync(SETTINGS_PATH, "utf8"))
	} catch (err) {
		const code = (err as NodeJS.ErrnoException)?.code
		if (code && code !== "ENOENT") {
			console.warn("[Settings] Failed to read configs/settings.json:", err)
		}
		return DEFAULT_SETTINGS
	}

	if (!isRecord(parsed)) return DEFAULT_SETTINGS
	const oscNode = isRecord(parsed.osc) ? parsed.osc : {}

	return {
		osc: {
			inPort: cleanPort(oscNode.inPort, DEFAULT_SETTINGS.osc.inPort),
			outPort: cleanPort(oscNode.outPort, DEFAULT_SETTINGS.osc.outPort),
		},
	}
}
