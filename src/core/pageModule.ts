// src/core/pageModule.ts — the descriptor every page file exports.
//
// A page module is the drop-in unit: a file in src/pages/ that exports `page` of
// this shape is auto-discovered and registered (see pages/registry.ts). No edits to
// any central list are needed — that's the whole "slide it in" contract.

import type { Page } from "./types.js"

/**
 * Declarative description of one page-level setting. Pages MAY declare these now;
 * the right-hand settings panel that renders + feeds them is wired later. Declaring
 * them today keeps a page forward-compatible and self-describing.
 */
export interface SettingSpec {
	/** Stable key used in messages + serialize(). */
	key: string
	/** Human label for the UI (defaults to key). */
	label?: string
	type: "number" | "toggle" | "enum"
	/** number: range + step. */
	min?: number
	max?: number
	step?: number
	/** enum: allowed values. */
	options?: string[]
	default: number | boolean | string
}

export interface PageModule {
	/** Unique id, lowercase, used in messages + the page dropdown (e.g. "screensaver"). */
	name: string
	/** Display label (defaults to name). */
	label?: string
	/** Construct a fresh page instance. */
	create: () => Page
	/** Optional declared settings (declare-now, wire-later). */
	settings?: SettingSpec[]
}
