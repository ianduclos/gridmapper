import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"
import { mkdtempSync, writeFileSync, mkdirSync, readFileSync, existsSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { createPresetStore, isValidPresetName } from "../src/core/presetStore.js"
import { defaultSystemConfig, type SystemConfig } from "../src/core/systemConfig.js"
import { DEFAULT_PAGE } from "../src/pages/registry.js"

const tmpConfigs = () => mkdtempSync(join(tmpdir(), "gridmapper-presets-"))

const layout = (overrides: Partial<Record<string, string>> = {}): SystemConfig => {
	const cfg = defaultSystemConfig()
	for (const [label, page] of Object.entries(overrides)) cfg.slots[label as "a"] = { page: page! }
	return cfg
}

describe("isValidPresetName", () => {
	it("accepts letters, digits, space, underscore and dash", () => {
		expect(isValidPresetName("hotelier")).toBe(true)
		expect(isValidPresetName("Live Set 2 _x-y")).toBe(true)
		expect(isValidPresetName("a".repeat(48))).toBe(true)
	})

	it("rejects anything that could escape the presets directory", () => {
		for (const bad of ["../evil", "a/b", "a\\b", "", "a".repeat(49), ".", "x.json", null, 7]) {
			expect(isValidPresetName(bad)).toBe(false)
		}
	})
})

describe("createPresetStore", () => {
	let dir: string
	beforeEach(() => {
		dir = tmpConfigs()
	})
	afterEach(() => {
		vi.restoreAllMocks()
	})

	it("starts empty and tolerant of a missing presets directory", () => {
		const store = createPresetStore(dir)
		expect(store.list()).toEqual([])
		expect(store.activeName()).toBeNull()
		expect(store.active()).toEqual(defaultSystemConfig())
	})

	it("round-trips a preset through write → list → read", () => {
		const store = createPresetStore(dir)
		expect(store.write("keys", layout({ a: "isometric", b: "meadowphysics" }))).toBe(true)
		expect(store.list()).toEqual(["keys"])
		const read = store.read("keys")
		expect(read?.slots.a).toEqual({ page: "isometric" })
		expect(read?.slots.b).toEqual({ page: "meadowphysics" })
		expect(read?.slots.h).toEqual({ page: DEFAULT_PAGE })
	})

	it("lists presets sorted, ignoring non-JSON and unsafe basenames", () => {
		const store = createPresetStore(dir)
		mkdirSync(join(dir, "presets"), { recursive: true })
		for (const f of ["zeta.json", "alpha.json", "notes.txt", `${"x".repeat(60)}.json`]) {
			writeFileSync(join(dir, "presets", f), "{}")
		}
		expect(store.list()).toEqual(["alpha", "zeta"])
	})

	it("never writes an activePreset marker into a preset file", () => {
		const store = createPresetStore(dir)
		store.write("marked", { ...layout({ a: "isometric" }), activePreset: "somethingelse" })
		const raw = JSON.parse(readFileSync(join(dir, "presets", "marked.json"), "utf8"))
		expect(raw.activePreset).toBeUndefined()
		expect(store.read("marked")?.activePreset).toBeUndefined()
	})

	it("refuses an unsafe name on every operation", () => {
		const store = createPresetStore(dir)
		expect(store.write("../escape", layout())).toBe(false)
		expect(store.read("../escape")).toBeNull()
		expect(store.remove("../escape")).toBe(false)
		expect(existsSync(join(dir, "presets"))).toBe(false)
	})

	it("returns null for a missing preset and for malformed JSON", () => {
		const store = createPresetStore(dir)
		expect(store.read("nope")).toBeNull()
		mkdirSync(join(dir, "presets"), { recursive: true })
		writeFileSync(join(dir, "presets", "broken.json"), "{ not json")
		vi.spyOn(console, "warn").mockImplementation(() => {})
		expect(store.read("broken")).toBeNull()
	})

	it("degrades an unknown page name to the default rather than throwing", () => {
		const store = createPresetStore(dir)
		mkdirSync(join(dir, "presets"), { recursive: true })
		writeFileSync(
			join(dir, "presets", "old.json"),
			JSON.stringify({ version: 1, slots: { a: { page: "deletedPage" } } })
		)
		vi.spyOn(console, "warn").mockImplementation(() => {})
		expect(store.read("old")?.slots.a).toEqual({ page: DEFAULT_PAGE })
	})

	it("deletes a preset and reports whether it was there", () => {
		const store = createPresetStore(dir)
		store.write("gone", layout())
		expect(store.remove("gone")).toBe(true)
		expect(store.list()).toEqual([])
		vi.spyOn(console, "warn").mockImplementation(() => {})
		expect(store.remove("gone")).toBe(false)
	})

	it("persists the live layout + marker to slots.json, and boots back into it", () => {
		const store = createPresetStore(dir)
		expect(store.setActive(layout({ a: "isometric" }), "keys")).toBe(true)
		expect(store.activeName()).toBe("keys")

		const rebooted = createPresetStore(dir)
		expect(rebooted.activeName()).toBe("keys")
		expect(rebooted.active().slots.a).toEqual({ page: "isometric" })
	})

	it("clears the marker when the layout diverges", () => {
		const store = createPresetStore(dir)
		store.setActive(layout({ a: "isometric" }), "keys")
		store.setActive(layout({ a: "meadowphysics" }), null)
		expect(store.activeName()).toBeNull()
		expect(createPresetStore(dir).activeName()).toBeNull()
	})

	it("reports preset state as the two snapshot messages", () => {
		const store = createPresetStore(dir)
		store.write("one", layout())
		store.write("two", layout())
		store.setActive(layout(), "two")
		expect(store.state()).toEqual([
			{ path: "/grid/out/preset/list", args: ["one", "two"] },
			{ path: "/grid/out/preset/active", args: ["two"] },
		])
	})

	it("reports an empty active name when no preset is loaded", () => {
		expect(createPresetStore(dir).state()[1]).toEqual({
			path: "/grid/out/preset/active",
			args: [""],
		})
	})
})
