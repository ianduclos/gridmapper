---
project: gridmapper
state: active
updated: 2026-11-13
machine: mac
summary: Branch feat/play-surface holds the idk.surface work - iso as four track layers on the app's ARP and LATCH, PLAY through OSC 4, iso's one menu, the Twister overlay, cells as the fourth page; the agent runs it up to 77e1d00, and three later commits (cells worlds landing with their recommended tuning and tempo, the preset saved when the app exits) wait for a restart and a push; none of it has had Ian's full playing check and it is not on main.
next:
  - At Ian's word, restart the agent (and push) so 2f11f1b, 96e7658 and the cells tempos reach the grid; then he corrects the thirteen suggested tempos by ear (src/data/cells-hot-worlds.ts, recommendedBpm)
  - Fix what Ian finds while playing (concert 2026-11-14); on iso, first confirm that a key kept by LATCH stays lit (the app's /remote echo)
  - Merge feat/play-surface to main once Ian has played it
  - Parked by Ian - cells following the app's TEMPO, and the app's temperaments as cells tuning options
  - Tune by hand with Ian - the dim plane (6, 10 on a root), the cells key's pulse (2 to 5), the 300 ms tap window
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
