// src/core/presetStore.ts — named interface presets on disk, plus the live layout.
//
// Two kinds of file, one shape (SystemConfig, see systemConfig.ts):
//   configs/presets/<name>.json   a named preset. Pure layout; never carries a marker.
//   configs/slots.json            the LIVE layout + `activePreset`, the marker saying
//                                 which preset it came from (null once it's been edited).
//
// slots.json is what the app boots into, so a preset loaded today is still loaded after
// a restart. It is deliberately NOT configs/settings.json: settings.ts owns app config
// (osc/clock/idle) with its own live-settable key scheme, and mixing the interface layout
// into it would blur two very different lifetimes.
//
// Names are restricted to a safe filename charset — no separators, no traversal — so a
// preset name can map straight onto a Max patch name later. Every read goes through
// sanitizeSystemConfig, so a truncated, hand-edited or older-build file degrades to
// something runnable instead of throwing.
//
// Writes are temp-file + rename, the same atomic-ish dance settings.ts does, so a crash
// mid-write can't leave half a layout behind.

import { readFileSync, writeFileSync, renameSync, readdirSync, unlinkSync, mkdirSync } from "node:fs"
import { resolve as resolvePath, join as joinPath } from "node:path"
import {
	sanitizeSystemConfig,
	defaultSystemConfig,
	type SystemConfig,
} from "./systemConfig.js"

const NAME_RE = /^[A-Za-z0-9 _-]{1,48}$/

/** True if `name` is a safe preset name (no path separators, sane length). */
export const isValidPresetName = (name: unknown): name is string =>
	typeof name === "string" && NAME_RE.test(name)

const stringify = (config: SystemConfig) => `${JSON.stringify(config, null, "\t")}\n`

/** Atomic-ish write: temp + rename (mirrors core/settings.ts writeSettings). */
const writeJson = (path: string, config: SystemConfig): void => {
	const tmp = `${path}.tmp`
	writeFileSync(tmp, stringify(config), "utf8")
	renameSync(tmp, path)
}

export interface PresetStore {
	/** Preset names (file basenames), sorted. Tolerant of a missing directory. */
	list(): string[]
	/** Read + sanitize a preset; null if the name is invalid or the file is unreadable. */
	read(name: string): SystemConfig | null
	/** Write a preset file (layout only — any activePreset marker is stripped). */
	write(name: string, config: SystemConfig): boolean
	/** Delete a preset file. False if the name is invalid or the delete failed. */
	remove(name: string): boolean
	/** The live layout, as loaded at construction or last persisted. */
	active(): SystemConfig
	/** The preset the live layout came from, or null once it has diverged. */
	activeName(): string | null
	/** Persist the live layout + marker to slots.json. Returns write success. */
	setActive(config: SystemConfig, name: string | null): boolean
	/** Snapshot messages for a newly-connected client (web onConnect / Max boot). */
	state(): Array<{ path: string; args: Array<number | string | boolean> }>
}

/**
 * Build a store over one configs directory. Reads slots.json once, at construction —
 * nothing else writes that file, so the cached copy stays authoritative for the process.
 * The directory is a parameter purely so tests can point at a tmpdir.
 */
export function createPresetStore(configsDir = resolvePath(process.cwd(), "configs")): PresetStore {
	const presetsDir = joinPath(configsDir, "presets")
	const slotsPath = joinPath(configsDir, "slots.json")
	const presetPath = (name: string) => joinPath(presetsDir, `${name}.json`)

	// ENOENT is the ordinary "nothing saved yet" case and stays quiet; anything else is
	// a real problem worth a line in the log.
	const warnUnlessMissing = (err: unknown, msg: string) => {
		const code = (err as NodeJS.ErrnoException)?.code
		if (code !== "ENOENT") console.warn(`[Presets] ${msg}:`, err)
	}

	const readActiveFile = (): SystemConfig => {
		try {
			return sanitizeSystemConfig(JSON.parse(readFileSync(slotsPath, "utf8")))
		} catch (err) {
			warnUnlessMissing(err, "Failed to read configs/slots.json")
			return defaultSystemConfig()
		}
	}

	let activeConfig = readActiveFile()
	let activePreset = activeConfig.activePreset ?? null

	const list = (): string[] => {
		let entries: string[]
		try {
			entries = readdirSync(presetsDir)
		} catch (err) {
			warnUnlessMissing(err, "Failed to list presets")
			return []
		}
		return entries
			.filter((f) => f.toLowerCase().endsWith(".json"))
			.map((f) => f.slice(0, -5))
			.filter(isValidPresetName)
			.sort((a, b) => a.localeCompare(b))
	}

	return {
		list,

		read(name) {
			if (!isValidPresetName(name)) return null
			try {
				const cfg = sanitizeSystemConfig(JSON.parse(readFileSync(presetPath(name), "utf8")))
				delete cfg.activePreset // preset files are pure layout
				return cfg
			} catch (err) {
				warnUnlessMissing(err, `Failed to read preset "${name}"`)
				return null
			}
		},

		write(name, config) {
			if (!isValidPresetName(name)) return false
			const clean = sanitizeSystemConfig(config)
			delete clean.activePreset
			try {
				mkdirSync(presetsDir, { recursive: true })
				writeJson(presetPath(name), clean)
				return true
			} catch (err) {
				console.warn(`[Presets] Failed to write preset "${name}":`, err)
				return false
			}
		},

		remove(name) {
			if (!isValidPresetName(name)) return false
			try {
				unlinkSync(presetPath(name))
				return true
			} catch (err) {
				warnUnlessMissing(err, `Failed to delete preset "${name}"`)
				return false
			}
		},

		active: () => activeConfig,
		activeName: () => activePreset,

		setActive(config, name) {
			const clean = sanitizeSystemConfig(config)
			clean.activePreset = name
			// The in-memory view updates whether or not the disk write lands: the running
			// machine really is in this layout, and lying about that helps nobody.
			activeConfig = clean
			activePreset = name
			try {
				mkdirSync(configsDir, { recursive: true })
				writeJson(slotsPath, clean)
				return true
			} catch (err) {
				console.warn("[Presets] Failed to write configs/slots.json:", err)
				return false
			}
		},

		state: () => [
			{ path: "/grid/out/preset/list", args: list() },
			{ path: "/grid/out/preset/active", args: [activePreset ?? ""] },
		],
	}
}
