# Agent guide — gridmapper

For coding agents that aren't Claude Code — currently **Codex** (backup
bench). Claude Code is the primary architecture/coding environment;
Gemini/Antigravity appears in older session-log entries.

**Read `HANDOFF.md` first** — who does what, current state, recent session
log, and the session protocol every agent follows here.

Then, as needed:
- `CLAUDE.md` — architecture, file map, and **invariants & gotchas** (don't
  relearn the two serialosc gotchas; they've already cost hours).
- `docs/PAGE_PROTOCOL.md` — how to author a grid page (drop a file in
  `src/pages/`, it auto-registers).

Working agreement (full version in `HANDOFF.md`):
- Codex works from a **brief** — a `HANDOFF.md` entry or spec Claude wrote,
  or an explicit prompt from Ian. Heavy mechanical work and overflow (when
  Claude is at usage limits) are its lane. Structural changes (driver /
  render loop / reconciler / page system / connection logic) need a brief
  that says so — if a task drifts structural, log it in `HANDOFF.md`
  instead of improvising.
- Before finishing: `npx tsc --noEmit` clean and `npm test` green; verify in
  `npm run sim` when relevant. Gotcha: the launchd agent
  `com.ianduclos.gridmapper` holds port 57131 + the grid —
  `launchctl bootout gui/$(id -u)/com.ianduclos.gridmapper` before a manual
  sim, and note in your log entry that the agent needs a
  `kickstart -k` to pick up changes.
- When done: prepend a Session log entry to `HANDOFF.md` and commit
  (conventional style: `feat:`/`fix:`/`docs:`). Don't push and don't edit
  `STATUS.md` (Claude publishes ecosystem state) unless Ian explicitly asks.
