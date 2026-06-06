# Agent guide — gridmapper

**Read `HANDOFF.md` first** — current state, recent session log, and the session
protocol that every agent (Claude Code or Gemini/Antigravity) follows here.

Then, as needed:
- `CLAUDE.md` — architecture, file map, and **invariants & gotchas** (don't relearn the
  two serialosc gotchas; they've already cost hours).
- `docs/PAGE_PROTOCOL.md` — how to author a grid page (drop a file in `src/pages/`,
  it auto-registers).

Working agreement (full version in `HANDOFF.md`):
- Keep changes contained. Structural work (driver / render loop / reconciler / page
  system / connection logic) is Claude's lane — if a task turns structural, note it in
  `HANDOFF.md` instead of forcing it.
- Before finishing: `npx tsc --noEmit` clean and `npm test` green; verify in
  `npm run sim` when relevant.
- When done: prepend a Session log entry to `HANDOFF.md` (and commit if git is in use).
