import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"
import { mkdtempSync, writeFileSync, readFileSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { SettingsStore, writeSettings, DEFAULT_SETTINGS, minToMs, type Settings } from "../src/core/settings.js"

const tmp = () => join(mkdtempSync(join(tmpdir(), "gridmapper-settings-")), "settings.json")
const clone = (): Settings => structuredClone(DEFAULT_SETTINGS)

describe("settings persistence", () => {
	it("writes atomically and reads back verbatim", () => {
		const path = tmp()
		const s = clone()
		s.clock.rate = 33
		s.idle.connectedMin = 90
		writeSettings(s, path)
		expect(JSON.parse(readFileSync(path, "utf8"))).toEqual(s)
		rmSync(path)
	})

	it("leaves no .tmp file behind", () => {
		const path = tmp()
		writeSettings(clone(), path)
		expect(() => readFileSync(`${path}.tmp`, "utf8")).toThrow()
	})
})

describe("SettingsStore.apply", () => {
	beforeEach(() => vi.useFakeTimers())
	afterEach(() => vi.useRealTimers())

	const store = (onChange?: (s: Readonly<Settings>, p: string) => void) =>
		new SettingsStore(clone(), onChange, tmp())

	it("applies live clock + idle keys and notifies with the path", () => {
		const seen: string[] = []
		const st = store((_s, p) => seen.push(p))
		expect(st.apply("clock/rate", 45)).toBe(true)
		expect(st.apply("clock/source", "external")).toBe(true)
		expect(st.apply("idle/caffeinate", 1)).toBe(true)
		expect(st.get().clock).toMatchObject({ rate: 45, source: "external" })
		expect(st.get().idle.caffeinate).toBe(true)
		expect(seen).toEqual(["clock/rate", "clock/source", "idle/caffeinate"])
	})

	it("clamps out-of-range values rather than storing them", () => {
		const st = store()
		st.apply("clock/rate", 1e6)
		st.apply("idle/disconnectedMin", 0)
		expect(st.get().clock.rate).toBe(200)
		expect(st.get().idle.disconnectedMin).toBe(1)
	})

	it("accepts the web panel's 1/0 for toggles and refuses a bogus enum", () => {
		const st = store()
		expect(st.apply("clock/echo", 1)).toBe(true)
		expect(st.get().clock.echo).toBe(true)
		expect(st.apply("clock/echo", 0)).toBe(true)
		expect(st.get().clock.echo).toBe(false)
		expect(st.apply("clock/source", "wall-clock")).toBe(false)
		expect(st.get().clock.source).toBe("internal")
	})

	it("refuses boot-only and unknown keys", () => {
		const st = store()
		expect(st.apply("osc/inPort", 9999)).toBe(false)
		expect(st.apply("clock/nonsense", 1)).toBe(false)
		expect(st.apply("nothing", 1)).toBe(false)
		expect(st.get().osc.inPort).toBe(DEFAULT_SETTINGS.osc.inPort)
	})

	it("debounces the write, then persists once", () => {
		const path = tmp()
		const st = new SettingsStore(clone(), undefined, path)
		st.apply("clock/rate", 30)
		st.apply("clock/rate", 40)
		expect(() => readFileSync(path, "utf8")).toThrow() // nothing yet
		vi.advanceTimersByTime(400)
		expect(JSON.parse(readFileSync(path, "utf8")).clock.rate).toBe(40)
	})

	it("flush() writes immediately (shutdown path)", () => {
		const path = tmp()
		const st = new SettingsStore(clone(), undefined, path)
		st.apply("idle/connectedMin", 12)
		st.flush()
		expect(JSON.parse(readFileSync(path, "utf8")).idle.connectedMin).toBe(12)
	})
})

describe("defaults", () => {
	it("sleeps after 4h with a grid and 15min without", () => {
		expect(minToMs(DEFAULT_SETTINGS.idle.connectedMin)).toBe(4 * 60 * 60_000)
		expect(minToMs(DEFAULT_SETTINGS.idle.disconnectedMin)).toBe(15 * 60_000)
	})

	it("ships the clock stopped-by-default (no run flag is persisted at all)", () => {
		expect("run" in DEFAULT_SETTINGS.clock).toBe(false)
	})
})
