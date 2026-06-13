---
project: gridmapper
state: active
updated: 2026-06-13
machine: mac
summary: Working multi-page monome 128 brain — serialosc hotplug shared by sim and daemon, settings round-trip with Max, launchd agent runs the sim always-on; 28 tests green.
next:
  - Max OSC handshake (systemConfig + presetStore), Max→daemon first
  - Daemon slot-control parity (/grid/in/slot/<a-h>/page, state emit)
  - Single-instance guard
handoff_for: null
---

# gridmapper — status

This frontmatter is the hub/dashboard feed (seeded 2026-06-13). The richer
working doc is **`HANDOFF.md`** — current state, session log, and the
multi-agent protocol shared with Antigravity/Gemini. Read that first when
actually working here; keep updating it per its own ritual. This file only
needs its frontmatter refreshed at session end (the `wrapup` skill does it).
