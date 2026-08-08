---
project: gridmapper
state: active
updated: 2026-08-08
machine: mac
summary: The isometric page became a full performance instrument — 4 output tracks with looper routing, 8 chord presets, 4 free-time loopers, 4 arpeggiators — over a note pipeline rekeyed to (track, step); 287 tests green but almost none of it is hardware-verified.
next:
  - Play the new isometric surface on the grid — arp accent model, LED contrast, and whether column 15 is still readable now every row is lit
  - Decide whether loopers should be swept into the arp (left ungated; see commit 4273bda)
  - Max OSC handshake (systemConfig + presetStore), starting with one page's serialize() to restore()
  - Single-instance guard
  - twistermapper clock bridge (~20 lines now that lane IDs match)
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

**Read before touching the OSC boundary:** `/grid/out/page/<slot>/note` now
carries a third argument, the track. See the 2026-08-08 entry in the
cross-project change feed.
