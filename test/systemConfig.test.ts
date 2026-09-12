import { describe, it, expect, vi, afterEach } from "vitest"
import {
	sanitizeSystemConfig,
	defaultSystemConfig,
	buildSlotDefinition,
	applySystemConfig,
	captureSystemConfig,
	withSlotPage,
	type SystemConfigTarget,
} from "../src/core/systemConfig.js"
import { DEFAULT_PAGE, PAGE_TYPES } from "../src/pages/registry.js"
import { SLOT_INDICES, SLOT_LABELS, type Page, type Slot } from "../src/core/types.js"

// A host stand-in: records what got loaded, and reports a canned serialize() per slot.
function makeTarget(serialized: Record<number, unknown> = {}) {
	const loads: Array<{ slot: Slot; page: Page }> = []
	const slotPages: string[] = Array.from(SLOT_INDICES, () => DEFAULT_PAGE)
	const target: SystemConfigTarget = {
		pm: {
			load: (slot, factory) => loads.push({ slot, page: factory() }),
			serialize: (slot) => serialized[slot],
		},
		slotPages,
	}
	return { target, loads, slotPages }
}

afterEach(() => vi.restoreAllMocks())

describe("sanitizeSystemConfig", () => {
	it("fills every slot from garbage input", () => {
		for (const raw of [undefined, null, 7, "nope", [], {}]) {
			const cfg = sanitizeSystemConfig(raw)
			expect(cfg.version).toBe(1)
			for (const label of SLOT_LABELS) expect(cfg.slots[label]).toEqual({ page: DEFAULT_PAGE })
		}
	})

	it("keeps a registered page name and defaults an unknown one", () => {
		vi.spyOn(console, "warn").mockImplementation(() => {})
		const cfg = sanitizeSystemConfig({
			version: 1,
			slots: { a: { page: "isometric" }, b: { page: "nosuchpage" }, c: { page: 42 } },
		})
		expect(cfg.slots.a).toEqual({ page: "isometric" })
		expect(cfg.slots.b).toEqual({ page: DEFAULT_PAGE })
		expect(cfg.slots.c).toEqual({ page: DEFAULT_PAGE })
	})

	it("keeps an object page config and drops anything else", () => {
		const cfg = sanitizeSystemConfig({
			version: 1,
			slots: {
				a: { page: "isometric", config: { npo: 7 } },
				b: { page: "isometric", config: "junk" },
				c: { page: "isometric", config: null },
			},
		})
		expect(cfg.slots.a).toEqual({ page: "isometric", config: { npo: 7 } })
		expect(cfg.slots.b).toEqual({ page: "isometric" })
		expect(cfg.slots.c).toEqual({ page: "isometric" })
	})

	it("carries the activePreset marker only when it is present", () => {
		expect(sanitizeSystemConfig({}).activePreset).toBeUndefined()
		expect(sanitizeSystemConfig({ activePreset: "keys" }).activePreset).toBe("keys")
		expect(sanitizeSystemConfig({ activePreset: null }).activePreset).toBeNull()
		expect(sanitizeSystemConfig({ activePreset: 7 }).activePreset).toBeUndefined()
	})
})

describe("buildSlotDefinition", () => {
	it("builds a real page for every registered type", () => {
		for (const name of PAGE_TYPES) {
			const def = buildSlotDefinition({ page: name })
			expect(def.pageName).toBe(name)
			expect(typeof def.createPage().render).toBe("function")
		}
	})

	it("falls back to the default page instead of throwing", () => {
		const def = buildSlotDefinition({ page: "nosuchpage" })
		expect(def.pageName).toBe(DEFAULT_PAGE)
		expect(typeof def.createPage().render).toBe("function")
	})

	it("passes the slot's config through for a future restore()", () => {
		expect(buildSlotDefinition({ page: "isometric", config: { npo: 7 } }).config).toEqual({ npo: 7 })
	})
})

describe("applySystemConfig", () => {
	it("loads every slot and updates slotPages in place", () => {
		const { target, loads, slotPages } = makeTarget()
		const cfg = sanitizeSystemConfig({
			version: 1,
			slots: { a: { page: "isometric" }, b: { page: "meadowphysics" } },
		})
		applySystemConfig(cfg, target)
		expect(loads.map((l) => l.slot)).toEqual([...SLOT_INDICES])
		expect(slotPages[0]).toBe("isometric")
		expect(slotPages[1]).toBe("meadowphysics")
		expect(slotPages[7]).toBe(DEFAULT_PAGE)
	})

	it("rebuilds only the slots it is given", () => {
		const { target, loads, slotPages } = makeTarget()
		applySystemConfig(
			sanitizeSystemConfig({ version: 1, slots: { c: { page: "isometric" } } }),
			target,
			[2 as Slot]
		)
		expect(loads).toHaveLength(1)
		expect(loads[0].slot).toBe(2)
		expect(slotPages[2]).toBe("isometric")
	})
})

describe("captureSystemConfig", () => {
	it("snapshots the live layout, including each page's serialize()", () => {
		const { target, slotPages } = makeTarget({ 0: { npo: 7 } })
		slotPages[0] = "isometric"
		const cfg = captureSystemConfig(target)
		expect(cfg.slots.a).toEqual({ page: "isometric", config: { npo: 7 } })
		expect(cfg.slots.b).toEqual({ page: DEFAULT_PAGE }) // no serialize() → no config key
	})

	it("round-trips through sanitize unchanged", () => {
		const { target, slotPages } = makeTarget({ 1: { foo: 1 } })
		slotPages[1] = "meadowphysics"
		const cfg = captureSystemConfig(target)
		expect(sanitizeSystemConfig(cfg)).toEqual(cfg)
	})
})

describe("withSlotPage", () => {
	it("replaces one slot and leaves the rest alone", () => {
		const base = defaultSystemConfig()
		const next = withSlotPage(base, 3 as Slot, "isometric")
		expect(next.slots.d).toEqual({ page: "isometric" })
		expect(next.slots.a).toEqual({ page: DEFAULT_PAGE })
		expect(base.slots.d).toEqual({ page: DEFAULT_PAGE }) // no mutation
	})
})
