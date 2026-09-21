---
project: gridmapper
state: active
updated: 2026-09-21
machine: mac
summary: The hotelier concert set is live on the agent — iso-hot, set-hot and cells-hot v2 (richer banks, shaped decay, evolution) now running against Hotelier's installed Max half; 447 tests green, cells v2 not yet listened to on the live rig.
next:
  - Listening/timing pass on cells v2 per docs/cells-v2-rollout.md (press Start on page B first)
  - Play hotelier on the grid before the concert (2026-09-23) — selector, transposer, looped moves, chord persistence across a restart
  - Decide whether to commit the dirty configs/slots.json and configs/presets/hotelier.json
  - Build the Max patch side against docs/max-handshake.md, including /grid/out/page/<slot>/transpose
  - Single-instance guard; twistermapper clock bridge
handoff_for: null
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
