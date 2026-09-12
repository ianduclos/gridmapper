// src/core/systemConfig.ts — the whole-machine interface layout, as data.
//
// A SystemConfig says which page each slot (a..h) runs, plus that page's structural
// config as returned by `Page.serialize?()`. It is the shape of `configs/slots.json`
// (the live layout) AND of every preset file under `configs/presets/`.
//
// This module is the ONE place that knows how to:
//   - sanitize raw JSON into a clean SystemConfig (tolerate, never throw), and
//   - turn a slot's config into a runnable page factory,
// and it runs at BOTH boot and live apply, so a preset loaded at runtime goes through
// exactly the same validation a file read at startup does. Port of twistermapper's
// module of the same name, over gridmapper's auto-discovery registry: an unknown page
// name degrades to DEFAULT_PAGE rather than throwing, so a preset written against a
// page you later deleted still loads.
//
// No filesystem here — that's presetStore.ts. No emission here — that's oscRouter.ts.
//
// NB: the per-slot `config` is carried through opaquely for now. Pages already
// serialize() their state; the inverse (`Page.restore?()`) is the next pass, and until
// it lands a preset records page config but only replays the slot→page layout.

import {
	type Page,
	type Slot,
	type SlotLabel,
	SLOT_INDICES,
	slotLabel,
} from "./types.js"
import { isPageType, pageFactory, DEFAULT_PAGE } from "../pages/registry.js"

export type SlotConfig = {
	page: string
	/** Whatever that page's serialize() returned. Opaque to this module. */
	config?: unknown
}

export type SystemConfig = {
	version: 1
	slots: Record<SlotLabel, SlotConfig>
	/**
	 * Name of the preset this layout came from, or null if it has been edited since
	 * (or never loaded one). Only meaningful in slots.json — preset files never carry it.
	 */
	activePreset?: string | null
}

export type SlotDefinition = {
	pageName: string
	createPage: () => Page
	config?: unknown
}

const isRecord = (v: unknown): v is Record<string, unknown> =>
	typeof v === "object" && v !== null && !Array.isArray(v)

/** Resolve a raw page name to a registered one, warning when it falls back. */
const resolvePageName = (raw: unknown, slotForLog?: SlotLabel): string => {
	if (isPageType(raw)) return raw
	if (slotForLog !== undefined) {
		console.warn(
			`[Slots] Slot ${slotForLog}: unknown page "${String(raw)}", defaulting to ${DEFAULT_PAGE}`
		)
	}
	return DEFAULT_PAGE
}

/**
 * Sanitize raw parsed JSON (slots.json or a preset file) into a clean SystemConfig.
 * Every slot is always present; anything unrecognizable becomes the default page.
 */
export const sanitizeSystemConfig = (raw: unknown): SystemConfig => {
	const root = isRecord(raw) ? raw : {}
	const slotsNode = isRecord(root.slots) ? root.slots : {}
	const slots = {} as Record<SlotLabel, SlotConfig>

	for (const slot of SLOT_INDICES) {
		const label = slotLabel(slot)
		const entry = isRecord(slotsNode[label]) ? (slotsNode[label] as Record<string, unknown>) : undefined
		const page = resolvePageName(entry?.page, entry === undefined ? undefined : label)
		// Only a plain object survives as page config; a page's restore() still has to be
		// defensive about its contents, but it never has to guard against a string or null.
		slots[label] = isRecord(entry?.config) ? { page, config: entry.config } : { page }
	}

	const activePreset =
		typeof root.activePreset === "string"
			? root.activePreset
			: root.activePreset === null
				? null
				: undefined

	const out: SystemConfig = { version: 1, slots }
	if (activePreset !== undefined) out.activePreset = activePreset
	return out
}

/** A SystemConfig where every slot runs the default page — the safe fallback. */
export const defaultSystemConfig = (): SystemConfig => {
	const slots = {} as Record<SlotLabel, SlotConfig>
	for (const slot of SLOT_INDICES) slots[slotLabel(slot)] = { page: DEFAULT_PAGE }
	return { version: 1, slots }
}

/** Build a runnable factory from one (already sanitized) slot config. */
export const buildSlotDefinition = (slot: SlotConfig): SlotDefinition => {
	const pageName = resolvePageName(slot.page)
	// resolvePageName only ever returns a registered name, so this factory exists.
	const createPage = pageFactory(pageName) ?? pageFactory(DEFAULT_PAGE)!
	return { pageName, createPage, config: slot.config }
}

/** What applySystemConfig / captureSystemConfig need from the host. */
export interface SystemConfigTarget {
	pm: {
		load(slot: Slot, factory: () => Page): void
		serialize(slot: Slot): unknown
	}
	/** Live per-slot page-name array, mutated IN PLACE (the router/UI hold this ref). */
	slotPages: string[]
}

/**
 * Load `config` into the running machine. `slots` narrows which slots are rebuilt —
 * a single-slot edit passes just that one so the other seven keep their live state;
 * a preset load passes them all. Reloaded pages announce themselves from init(), so
 * by the time this returns every page has spoken.
 */
export const applySystemConfig = (
	config: SystemConfig,
	target: SystemConfigTarget,
	slots: readonly Slot[] = SLOT_INDICES
): void => {
	for (const slot of slots) {
		const def = buildSlotDefinition(config.slots[slotLabel(slot)])
		target.slotPages[slot] = def.pageName
		target.pm.load(slot, def.createPage)
	}
}

/**
 * Snapshot the live layout. Structural only: each page's own serialize() decides what
 * is worth keeping, and the protocol says that excludes transient runtime state.
 */
export const captureSystemConfig = (target: SystemConfigTarget): SystemConfig => {
	const slots = {} as Record<SlotLabel, SlotConfig>
	for (const slot of SLOT_INDICES) {
		const page = target.slotPages[slot] ?? DEFAULT_PAGE
		const config = target.pm.serialize(slot)
		slots[slotLabel(slot)] = config !== undefined ? { page, config } : { page }
	}
	return sanitizeSystemConfig({ version: 1, slots })
}

/** A copy of `config` with one slot re-assigned (used by /grid/in/slot/<x>/page). */
export const withSlotPage = (
	config: SystemConfig,
	slot: Slot,
	pageName: string
): SystemConfig => ({
	...config,
	slots: { ...config.slots, [slotLabel(slot)]: { page: pageName } },
})
