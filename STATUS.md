---
project: gridmapper
state: active
updated: 2026-09-16
machine: mac
summary: The Max boot handshake is built — ping/pong, a preset layer whose presets restore each page's own state, and OSC echo discipline on settings writes — with presets created from the web panel; 353 tests green but the live agent still runs a dist/ predating all of it.
next:
  - Rebuild and restart the launchd agent — the running daemon predates the handshake, so Max still sees no ping, no presets, and echoing settings
  - Play the isometric surface on the grid — arp accent model, LED contrast, whether column 15 is still readable now every row is lit
  - Build the Max patch side against docs/max-handshake.md and confirm the handshake end to end
  - Decide whether loopers should be swept into the arp (left ungated; see commit 4273bda)
  - Single-instance guard; twistermapper clock bridge (~20 lines now that lane IDs match)
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

**Not deployed.** The launchd agent `com.ianduclos.gridmapper` runs a `dist/`
built before the handshake, so nothing above is live for Max until it is rebuilt
and restarted.
