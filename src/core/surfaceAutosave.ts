// src/core/surfaceAutosave.ts — keep the idk.surface preset when the app goes away.
//
// Ian, 2026-11-13: "probably good to make gridmapper save the surface preset on surface
// exit". When the surface link stops hearing the app (io/liveLink.ts, SURFACE_AWAY_MS of
// silence), the grid's state for surface is written into the `idk.surface` preset as it
// stands, so closing the app keeps it without a save in the web panel.
//
// This is a deliberate, narrow exception to the rule in core/oscRouter.ts that a preset is
// saved from the web panel only. It stays narrow on purpose:
//   - only while the ACTIVE preset is `idk.surface` (a layout edited since, or another
//     preset, is never written over it);
//   - only that one preset, never a name taken from a message;
//   - once per absence of the app (the link calls this once each time the app goes), and
//     never when the agent itself shuts down.
// What is captured is what a save in the web panel captures: every page's serialize().

import type { PresetStore } from "./presetStore.js"
import type { SystemConfig } from "./systemConfig.js"

export const SURFACE_PRESET = "idk.surface"

/** Returns the function to call when the app goes away; it says whether it saved. */
export function surfacePresetAutosave(
	presets: Pick<PresetStore, "activeName" | "write" | "setActive">,
	capture: () => SystemConfig,
	log: (line: string) => void = (line) => console.log(line),
): () => boolean {
	return () => {
		if (presets.activeName() !== SURFACE_PRESET) return false
		try {
			const cfg = capture()
			if (!presets.write(SURFACE_PRESET, cfg)) return false
			presets.setActive(cfg, SURFACE_PRESET)
			log(`[surface] the app went away: saved the ${SURFACE_PRESET} preset as it stands`)
			return true
		} catch (err) {
			console.error("[surface] could not save the preset on the app's exit:", err)
			return false
		}
	}
}
