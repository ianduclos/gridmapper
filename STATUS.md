---
project: gridmapper
state: active
updated: 2026-09-22
machine: mac
summary: Hotelier concert set live on the agent; cells-hot now has a play toggle, gesture loopers, BPM tempo it owns, damp synced through set-hot, a tabbed settings panel and an on-grid key legend in the web UI; 464 tests green, none of it yet played on hardware.
next:
  - Play cells-hot on the grid before the concert (2026-09-23) — play toggle, loopers, damp + damp mode, tempo, key legend on a hardware press
  - Build the cells score editor from docs/cells-editor-design.md (fresh session; confirm the Hz pitch-loop form with Ian first)
  - Listening/timing pass on cells v2 per docs/cells-v2-rollout.md
  - Decide whether to commit the dirty configs/slots.json, configs/settings.json and configs/presets/hotelier.json
  - Single-instance guard; twistermapper clock bridge
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
