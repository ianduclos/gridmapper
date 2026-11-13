---
project: gridmapper
state: active
updated: 2026-11-13
machine: mac
summary: Branch feat/play-surface is what the agent runs since 2026-11-13 - iso as four track layers on the app's own ARP and LATCH, PLAY through the app's OSC 4 with arp order keys, one menu on iso's x0 y6, a Twister overlay on x0 y5, and cells as the fourth page on x0 y3; Ian is playing it but has not given it a full check, and it is not merged to main.
next:
  - Fix what Ian finds while playing (concert 2026-11-14); first thing to confirm on iso is that a key kept by LATCH stays lit, which needs the app's /remote echo
  - Merge feat/play-surface to main once Ian has played it
  - Cells, parked by Ian 2026-11-13 - follow the app's TEMPO, and the app's temperaments as tuning options; app-side asks sent (release on restart, a tuned note in the packet, a reported beat)
  - Tune by hand with Ian - the dim plane's level (6, 10 on a root), the cells key's pulse (2 to 5), the 300 ms tap window, PLAY's shift 2 latch time
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
