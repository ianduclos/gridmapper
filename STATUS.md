---
project: gridmapper
state: active
updated: 2026-10-27
machine: mac
summary: set-surface now drives eight voices (cols 4-11) and idk.surface accepts all eight; power-off blanking, the clips page, the idk.surface forks and recent cells-hot work are all still waiting for Ian to check them on the grid.
next:
  - After idk.surface is relaunched (./surface play), press set-surface's voice 7-8 keys (cols 10-11) on the grid and check they reach lanes 7-8
  - Plug the grid in and check power off blanks it and power on brings the screen back (fixed 2026-10-18, not hardware-checked)
  - View the clips slot against Live in the web sim, then on the grid (banking + red box, launches, M/S/A/V layers)
  - Decide whether cells-surface gets voices 7-8 too (still 6; its damp-all reaches voices 1-6 only)
  - Build cells editor phase 2 (rhythm editing, variants) from docs/cells-editor-design.md, in a fresh session
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
