---
project: gridmapper
state: active
updated: 2026-07-31
machine: mac
summary: Multi-page monome 128 brain gained a Meadowphysics port, a 4-lane app clock that ticks every loaded page, idle sleep for the always-on agent, and scales on the isometric keyboard; 164 tests green but nothing since 2026-07-19 is hardware-verified.
next:
  - Replug the monome — serialosc lists no device, so the agent is on NullGrid
  - Eyeball the new transport strip, app-settings panel and isometric scale layout
  - Max OSC handshake / presets, starting with one page's serialize() to restore()
  - Single-instance guard
  - twistermapper clock bridge (~20 lines now that lane IDs match)
handoff_for: null
---

# gridmapper — status

This frontmatter is the hub/dashboard feed (seeded 2026-06-13). The richer
working doc is **`HANDOFF.md`** — current state, session log, and the
multi-agent protocol shared with Codex. Read that first when actually working
here; keep updating it per its own ritual. This file only needs its
frontmatter refreshed at session end (the `wrapup` skill does it).

Architecture, invariants and the serialosc gotchas live in `CLAUDE.md`; the
page-authoring contract in `docs/PAGE_PROTOCOL.md`. The approved plan behind
this session's clock/scales work is checked in at
`docs/plans/2026-07-31-clock-lanes.md`.
