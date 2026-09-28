---
project: gridmapper
state: active
updated: 2026-09-28
machine: mac
summary: cells-hot gained cycle-locked loopers, a transport-safe Play key, evolution knobs, a live web score and four new source-checked banks, and the app has a power off/on switch (/grid/in/power); all live on the restarted agent, 538 tests green, not yet played or heard.
next:
  - Reconnect the grid (after the 2026-09-27 restart macOS showed no usbserial device) and audition the new work — score view, loopers, Play, power toggle, and the four banks (Nyamaropa offset, Sikuri at 61-70 BPM, Tshikona, Kecak)
  - Build cells editor phase 2 (rhythm editing, variants) from docs/cells-editor-design.md, in a fresh session
  - Decide whether to revert the cells-drifted slot b in configs/presets/hotelier.json and commit the dirty configs/*.json
  - Single-instance guard; twistermapper clock bridge; a matching power switch in twistermapper
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
