import { describe, it, expect } from "vitest"
import { PAGE_TYPES, DEFAULT_PAGE, pageFactory, isPageType } from "../src/pages/registry.js"

describe("page auto-discovery", () => {
	it("discovers the built-in pages", () => {
		expect(PAGE_TYPES).toContain("base")
		expect(PAGE_TYPES).toContain("screensaver")
		expect(PAGE_TYPES).toContain("toggle")
	})

	it("defaults to base", () => {
		expect(DEFAULT_PAGE).toBe("base")
	})

	it("skips the underscore-prefixed template", () => {
		expect(PAGE_TYPES).not.toContain("template")
	})

	it("pageFactory builds a fresh instance with a render()", () => {
		const f = pageFactory("screensaver")
		expect(f).toBeTypeOf("function")
		const p = f!()
		expect(p.render).toBeTypeOf("function")
	})

	it("isPageType guards unknown names", () => {
		expect(isPageType("base")).toBe(true)
		expect(isPageType("nope")).toBe(false)
		expect(isPageType(42)).toBe(false)
	})
})
