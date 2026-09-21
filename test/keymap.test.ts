import { describe, expect, it } from "vitest"
import { PAGE_TYPES, pageKeymap } from "../src/pages/registry.js"

describe("page key maps", () => {
	it("stay on the 16×8 grid and never overlap within one view", () => {
		for (const name of PAGE_TYPES) {
			const map = pageKeymap(name)
			const views = [undefined, ...new Set(map.map((k) => k.view).filter(Boolean))]
			for (const view of views) {
				const seen = new Map<number, string>()
				for (const k of map.filter((k) => k.view === view)) {
					for (let y = k.y; y < k.y + (k.h ?? 1); y++)
						for (let x = k.x; x < k.x + (k.w ?? 1); x++) {
							expect(x >= 0 && x < 16 && y >= 0 && y < 8, `${name}: ${k.name} off-grid`).toBe(true)
							const clash = seen.get(y * 16 + x)
							expect(clash, `${name}/${view}: ${k.name} overlaps ${clash} at ${x},${y}`).toBeUndefined()
							seen.set(y * 16 + x, k.name)
						}
				}
			}
		}
	})
	it("covers cells-hot and set-hot", () => {
		expect(pageKeymap("cells-hot").length).toBeGreaterThan(10)
		expect(pageKeymap("set-hot").length).toBeGreaterThan(5)
	})
})
