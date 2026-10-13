---
project: gridmapper
state: active
updated: 2026-10-13
machine: mac
summary: The clips page (Ableton Live launcher) is merged and talking to idk.clips' new AbletonOSC fork in Live 12; still unseen by Ian on the sim and grid, as are the idk.surface forks and recent cells-hot work.
next:
  - View the clips slot against Live in the web sim, then on the grid (banking + red box, launches, M/S/A/V layers)
  - Load the idk.surface preset on the grid and play the surface pages (plus the unauditioned cells-hot work from 2026-09-27/28)
  - Offer voices 7-8 on the surface pages (VOICES is still 6 in cells-surface/set-surface)
  - Build cells editor phase 2 (rhythm editing, variants) from docs/cells-editor-design.md, in a fresh session
  - Decide on the dirty configs/*.json (cells-drifted slot b in hotelier.json)
handoff_for: claude-gridmapper
---

# gridmapper — status

This frontmatter is the hub/dashboard feed (seeded 2026-06-13). The richer
working doc is **`HANDOFF.md`** — current state, session log, and the
multi-agent protocol. Read that first when actually working here; keep
updating it per its own ritual. This file only needs its frontmatter
refreshed at session end (the `wrapup` skill does it).

Architecture, invariants and the serialosc gotchas live in `CLAUDE.md`; the
page-authoring contract in `docs/PAGE_PROTOCOL.md`.

**Read before touching the OSC boundary:** `/grid/out/page/<slot>/note` carries
a third argument, the track (2026-08-08). As of 2026-09-12 there is also a
documented Max boot contract — **`docs/max-handshake.md`** — plus a preset layer
and echo discipline on settings writes. See both entries in the cross-project
change feed.

**Deployed.** The launchd agent `com.ianduclos.gridmapper` runs `tsx` on source, so
`launchctl kickstart -k gui/$(id -u)/com.ianduclos.gridmapper` picks up changes; it
was restarted 2026-09-21 and serves the `hotelier` preset.

**Concert work (2026-09-21):** `src/pages/iso-hot.ts` (header documents the
selector, transposer, control-lane looping and chord persistence),
`src/pages/blank-hot.ts`, `src/util/pageSelector.ts`, `configs/presets/hotelier.json`.
