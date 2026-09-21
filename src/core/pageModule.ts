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
	/** enum: compact button bank instead of a select menu. */
	presentation?: "buttons"
	/** number: range + step. */
	min?: number
	max?: number
	step?: number
	/** enum: allowed values. */
	options?: string[]
	/** enum: human-readable names keyed by the wire value. */
	optionLabels?: Record<string, string>
	/** Named sections within a button bank, keyed by option value. */
	optionGroups?: Record<string, string>
	/** One-line explanation shown under the control. */
	help?: string
	default: number | boolean | string
}

/**
 * One entry of a page's key map: the cheat-sheet the web UI shows. A span (w×h) names a
 * block of keys at once. `view` scopes it to one of the page's modes (e.g. a bank view
 * that reuses the voice rows); entries without it apply in every view, and a view's own
 * entries win where they overlap.
 */
export interface KeySpec {
	x: number
	y: number
	w?: number
	h?: number
	name: string
	/** Label drawn on the grid legend when `name` is too long for one key. */
	short?: string
	help?: string
	view?: string
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
	/** Optional key map for the web cheat-sheet. Declare it from the same constants onKey uses. */
	keymap?: KeySpec[]
}
