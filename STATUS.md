---
project: gridmapper
state: active
updated: 2026-07-04
machine: mac
summary: Working multi-page monome 128 brain — control routing (key/shift/focus/slot-page) now one shared dispatcher used by sim and daemon, closing the daemon's slot/page parity gap; 36 tests green.
next:
  - kickstart the launchd agent to pick up the oscRouter change
  - Max OSC handshake (systemConfig + presetStore), Max→daemon first
  - Single-instance guard
handoff_for: null
---

# gridmapper — status

This frontmatter is the hub/dashboard feed (seeded 2026-06-13). The richer
working doc is **`HANDOFF.md`** — current state, session log, and the
multi-agent protocol shared with Antigravity/Gemini. Read that first when
actually working here; keep updating it per its own ritual. This file only
needs its frontmatter refreshed at session end (the `wrapup` skill does it).
