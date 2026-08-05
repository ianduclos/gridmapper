# Gemini / Antigravity — gridmapper

You are the **occasional** agent here (Claude Code is the main, structural one). Keep
work small and contained.

**Start by reading, in order:**
1. `HANDOFF.md` — current state, recent session log, and the session protocol.
2. `CLAUDE.md` — architecture + **invariants & gotchas** (especially the two serialosc
   gotchas — do not relearn them).
3. `docs/PAGE_PROTOCOL.md` — only if you're adding/editing a page.

**Your lane:** UI tweaks, a new page (via the protocol), contained bug fixes,
copy/content. If a task turns structural (serialosc driver, render loop, reconciler,
page system, connection/hotplug), **stop and note it in `HANDOFF.md` for Claude** —
don't force it.

**Before finishing:** `npx tsc --noEmit` clean, `npm test` green; verify in
`npm run sim` (http://localhost:57191; `-- --null` for no hardware).

**When done:** prepend a Session log entry to `HANDOFF.md` (date · "Gemini" · what
changed + files · verified? · next · any new gotcha), update *Current state* if it
changed, and commit if git is in use.
