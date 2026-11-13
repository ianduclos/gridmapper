import { describe, expect, it, vi } from "vitest"
import { surfacePresetAutosave, SURFACE_PRESET } from "../src/core/surfaceAutosave.js"

const store = (active: string | null, writes = true) => {
	const written: Array<[string, any]> = []
	const activeSet: Array<[any, string | null]> = []
	return {
		written, activeSet,
		activeName: () => active,
		write: (name: string, cfg: any) => { if (writes) written.push([name, cfg]); return writes },
		setActive: (cfg: any, name: string | null) => { activeSet.push([cfg, name]) },
	}
}

describe("surface preset autosave", () => {
	const cfg = { slots: { a: { page: "iso-surface", config: { front: 2 } } } } as any

	it("writes the live layout into idk.surface, and keeps it the active preset", () => {
		const s = store(SURFACE_PRESET)
		const log = vi.fn()
		expect(surfacePresetAutosave(s as any, () => cfg, log)()).toBe(true)
		expect(s.written).toEqual([[SURFACE_PRESET, cfg]])
		expect(s.activeSet).toEqual([[cfg, SURFACE_PRESET]])
		expect(log).toHaveBeenCalledTimes(1)
	})

	it("does nothing when another preset, or none, is active: nothing is captured or written", () => {
		for (const active of ["hotelier", null]) {
			const s = store(active)
			const capture = vi.fn(() => cfg)
			expect(surfacePresetAutosave(s as any, capture, () => {})()).toBe(false)
			expect(capture).not.toHaveBeenCalled()
			expect(s.written).toEqual([])
		}
	})

	it("a failed write or a throwing capture is not a save, and does not throw", () => {
		const s = store(SURFACE_PRESET, false)
		expect(surfacePresetAutosave(s as any, () => cfg, () => {})()).toBe(false)
		expect(s.activeSet).toEqual([])
		const err = vi.spyOn(console, "error").mockImplementation(() => {})
		expect(surfacePresetAutosave(store(SURFACE_PRESET) as any, () => { throw new Error("x") }, () => {})()).toBe(false)
		err.mockRestore()
	})
})
