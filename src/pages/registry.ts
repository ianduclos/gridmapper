/* Page registry — AUTO-DISCOVERY.
 *
 * Scans this folder at startup and registers every page module. A page file just
 * needs to export `page: PageModule` (name + create()); drop the file in and it
 * shows up — in the daemon, the sim, and the web dropdown. No central list to edit.
 *
 * Convention: files starting with "_" (templates/helpers) and this registry are
 * skipped. Everything else is expected to export `page`.
 */

import { readdirSync } from "node:fs"
import { fileURLToPath, pathToFileURL } from "node:url"
import { dirname, join } from "node:path"
import type { Page } from "../core/types.js"
import type { PageModule } from "../core/pageModule.js"

const here = dirname(fileURLToPath(import.meta.url))

const isPageFile = (f: string) =>
	/\.(ts|js)$/.test(f) &&
	!/\.d\.ts$/.test(f) &&
	!f.startsWith("_") &&
	!f.startsWith("registry.")

const registry = new Map<string, PageModule>()

// Top-level await: the module graph waits until every page is registered, so any
// importer sees a fully-populated registry.
for (const file of readdirSync(here).filter(isPageFile).sort()) {
	const mod = await import(pathToFileURL(join(here, file)).href)
	const desc = mod.page as PageModule | undefined
	if (desc?.name && typeof desc.create === "function") {
		if (registry.has(desc.name)) console.warn(`[pages] duplicate page name "${desc.name}" (${file})`)
		registry.set(desc.name, desc)
	} else {
		console.warn(`[pages] ${file} has no valid \`page\` export — skipped`)
	}
}

/** All registered modules, keyed by name. */
export const PAGE_MODULES = registry

/** Registered page names, in discovery (alphabetical) order. */
export const PAGE_TYPES: string[] = [...registry.keys()]

/** Default page for empty slots (Base if present, else the first discovered). */
export const DEFAULT_PAGE = registry.has("base") ? "base" : PAGE_TYPES[0]

export const isPageType = (n: unknown): n is string =>
	typeof n === "string" && registry.has(n)

/** A factory `() => Page` for the named page, or undefined if unknown. */
export const pageFactory = (name: string): (() => Page) | undefined => {
	const m = registry.get(name)
	return m ? () => m.create() : undefined
}

/** Declared settings for the named page (empty if none / unknown). */
export const pageSettings = (name: string) => registry.get(name)?.settings ?? []
