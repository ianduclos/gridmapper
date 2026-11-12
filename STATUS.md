---
project: gridmapper
state: active
updated: 2026-11-12
machine: mac
summary: Branch feat/play-surface holds the idk.surface work (PLAY page, the new home page switched on, iso lane picker, a REEL pads page switched on 2026-11-11, a cheat sheet per surface page, ARP keys on PLAY and REEL pads, a XEN CHORDS toggle on PLAY added 2026-11-12); none of it has been played by Ian yet and the grid was off USB at session end.
next:
  - Plug the grid in and let Ian play PLAY (incl. the XEN CHORDS toggle at x2 y1, with xen-harmony running), home, iso and REEL pads against idk.surface (cheat sheets in docs/*-surface-cheatsheet.md), then fix what he finds
  - Merge feat/play-surface to main once Ian has played it
  - Tune PLAY's shift 2 latch time (latchMs) with Ian
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
