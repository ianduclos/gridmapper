---
project: gridmapper
updated: 2026-07-04
entries: 0
---

# gridmapper — Session Handoff

**Read this first.** Single shared source of truth for *where we are* and *what
changed*, across sessions and across agents — **Claude Code** (main environment) and
**Gemini / Antigravity** (occasional). It lives in the repo so it travels with the
code (unlike any agent's private memory).

## Who does what
- **Claude Code** — primary environment; structural & architectural work (driver,
  render loop, reconciler, page system, connection/hotplug, OSC).
- **Antigravity (Gemini)** — occasional, smaller/contained tasks: UI tweaks, authoring
  a new page (follow `docs/PAGE_PROTOCOL.md`), contained bug fixes, copy/content. If a
  task turns structural, **don't force it** — note it in the Session log and leave it
  for Claude.
- Deep reference: `CLAUDE.md` (architecture, file map, **invariants & gotchas**);
  `docs/PAGE_PROTOCOL.md` (how to author a page).

## Session protocol
**At start:** read *Current state* + the top 2–3 *Session log* entries. For structural
work, also skim `CLAUDE.md`. Don't relearn the serialosc gotchas — they're in
`CLAUDE.md` and have already cost hours.

**During:** keep changes contained. Verify in `npm run sim` when relevant.

**Before finishing:** `npx tsc --noEmit` clean and `npm test` green.

**At end:** (1) update *Current state* if it changed; (2) **prepend** a *Session log*
entry — date · agent · what changed (+ files) · verified? · next · any new gotcha;
(3) if git is in use, commit with a clear message. Keep entries short and factual.

---

## Current state
- **Run:** `npm run sim` → http://localhost:57191 (live grid + web mirror; auto-
  connects to the monome 128 when present). `npm run sim -- --null` = no hardware.
  `npm run dev` = headless daemon. `npm test` · `npx tsc --noEmit` · `npm run grid:list`.
- **Works:** serialosc connect + runtime hotplug; render loop (58fps) + quadrant
  reconciler; 8 page slots with **auto-discovered** pages (`base`, `screensaver`,
  `isometric`, `toggle`); two-color web UI (slot chips + page dropdown + clickable
  connect indicator); physical + web key input, mirrored both ways. **Page-settings
  panel is live** (declared `SettingSpec[]` → controls → page, two-way over OSC). The
  **sim now bridges real OSC to/from Max** (`emitOut` = OSC + web). **Control routing
  (key/connect/shift/focus/slot-page/page-osc) is now a single shared dispatcher,
  `core/oscRouter.ts`, used by both `sim.ts` and the daemon** — this closed the daemon's
  missing slot/page parity (`/grid/in/slot/<a-h>/page` now works headless too).
  `isometric` is a configurable **step field** (`npo` + `vertical`, emits step ints) with
  local shift keys + a sustain pedal. **Runtime hotplug lives in `io/gridConnection.ts`
  and is shared by the sim AND the daemon** (daemon no longer connects-or-exits). 36 tests green.
- **Next / open:** the launchd agent is still running the pre-oscRouter code —
  `kickstart -k` to pick up this session's changes. Then: Max OSC **handshake**
  (`systemConfig` + `presetStore`) — do it calmly, matching the twister protocol;
  prioritize **Max → daemon** (state snapshot on request, not on connect). Plus:
  single-instance guard.
- **Background agent:** launchd `com.ianduclos.gridmapper` runs the **sim** always-on
  (OSC↔Max + hotplug + web UI on 57191, served, not auto-opened). Template + manage cmds
  in `deploy/`. Holds 57131 + the grid → `launchctl bootout gui/$(id -u)/com.ianduclos.gridmapper`
  before a manual `npm run sim`; `kickstart -k …` to pick up edits (runs `tsx` on source).
- **Parked:** web-UI button "bounce" — `transform: translateY(.5px)` on `.cell:active`
  in `web/index.html` (remove system-wide, UI layer, not pages).

---

## Session log (newest first)
### 2026-07-04 — Claude
Extracted the duplicated `/grid/in/...` control-routing handler (previously hand-copied
between `sim.ts` and `cli/index.ts`) into one shared `core/oscRouter.ts`. This fixed a
real drift bug: the daemon had silently lost `/grid/in/slot/<a-h>/page` handling — Max
could focus a slot on the headless daemon but never assign a page into one. Also fixed a
stale log line ("Page 'Basic' in slot a") and removed two now-redundant `needsFullPaint =
true` lines in `sim.ts` (PageManager's `onFrame(..., "focus")` already covers both the
focus and slot-load paths). Files: `src/core/oscRouter.ts` (new), `test/oscRouter.test.ts`
(new, 8 tests), `src/cli/{sim,index}.ts`, `CLAUDE.md`.
- **Verified?** `npm run build` clean; `npm test` 36/36 green. Did NOT run `npm run sim`
  or the daemon directly — the launchd agent holds port 57131 + the grid.
- **Next:** the launchd agent needs a `kickstart -k` to pick up this change (see Current
  state above) before Max can rely on daemon slot/page parity. Then the Max handshake.
- **Also brainstormed** (not started): StepSeq page, scale-mask setting for isometric, a
  system overlay layer above the focused page for a Main-style focus switcher, decay-trail
  frame effect, key-event recorder for page tests, `/serialosc/notify` to replace the
  discovery poll. Chord-latch-on-shift-1 idea parked — shifts are mostly page-specific.

### 2026-06-07 — Claude
Shifts in use + **runtime hotplug shared by sim and daemon**. (1) `isometric`: right-edge
control keys are LOCAL shifts via new `ctx.setShift` (bottom-right = shift 1; above =
shift 2 = **sustain pedal** — releases deferred until the pedal falls; verified live via
WS note events). Visual: sustained notes at press brightness (13), shift markers at 1.
(2) Earlier this session: shift OSC input + **leading-edge lockout debounce** (10ms,
`core/shiftInput.ts`, 7 unit tests) — the first same-state-only attempt was a no-op on
chatter; shift is **receive-only** (no `/grid/out/shift`). (3) **Hotplug extracted** to
`io/gridConnection.ts` (MirrorGrid swap + watcher + the serialosc gotchas, one place);
both `sim.ts` and `cli/index.ts` use it — daemon now starts on a NullGrid and hot-connects
instead of connect-or-exit. Added the missing `dev` npm script. (4) Unified slot dialect
to letters (a–h) across web + sim. (5) Web **favicon** (served by `gridServer` at
`/favicon.png`). (6) Web **click-drag to play**: held cell follows the pointer with a
~90ms release tail (strum); plain click = tap; hold still works. (7) **Background launchd
agent** `com.ianduclos.gridmapper` runs the sim always-on (UI served on 57191, not
auto-opened); template + cmds in `deploy/`. Files: `src/pages/isometric.ts`, `src/core/
{types,shiftInput}.ts`, `src/io/{gridConnection,gridServer}.ts`, `src/cli/{sim,index}.ts`,
`web/{index.html,favicon.png}`, `package.json`, `deploy/`, docs.
- **Verified?** `npx tsc --noEmit` clean; 28 tests green. Live: daemon boots on NullGrid
  then auto-connects to `m1000279`; sim reconnects + sustain + brightnesses confirmed via
  WS. Hotplug **unplug/replug not yet tested on hardware** (auto-connect-on-plug-in is).
  Agent verified: serves UI, connects to `m1000279`, KeepAlive respawns after kill.
- **Next:** Max handshake (calmly), Max→daemon first. Then daemon slot-control parity.
- **Gotcha:** the serialosc rules (don't poll discovery while connected; don't tear down
  on `/sys/disconnect`) now live ONLY in `io/gridConnection.ts` — change them there.

### 2026-06-06 — Claude
Wired the **page-settings panel** + per-page settings OSC round-trip, and reworked
`isometric` into a **step field**. (1) `isometric.ts`: emits `/grid/out/page/<slot>/note
<step> <1|0>` (step ints, Max owns pitch — no MIDI/velocity); live settings `npo` +
`vertical` via a single `SPECS` const; `onOsc` accepts `/setting/<key>`, terse `/<key>`,
value-in-path `/<key>/<value>`, `/settings/get`; echoes `/grid/out/page/<slot>/settings`;
`serialize()`. (2) `sim.ts`: added `createOsc` + `emitOut` (OSC **and** web) and inbound
`osc.onMessage→routeControl`; routeControl now handles `/grid/in/focus/page <a-h>` and
`/grid/in/page/<digit|letter>/<rest>`; connect-snapshot sends `/grid/out/pagespecs` +
per-slot `/settings`. (3) `web/index.html`: panel renders controls from specs+values,
two-way bound. (4) Docs: `PAGE_PROTOCOL.md §8` (settings now wired), `CLAUDE.md` (OSC
vocab + isometric). Files: `src/pages/isometric.ts`, `test/isometric.test.ts`,
`src/cli/sim.ts`, `web/index.html`, `docs/PAGE_PROTOCOL.md`, `CLAUDE.md`.
- **Verified?** `npx tsc --noEmit` clean; 21 tests green. Round-trip checked live on the
  sim (`--null`): web digit dialect + Max letter/value-in-path over UDP both apply and
  echo `/grid/out/page/a/settings` on 57130. Not yet tested on hardware.
- **Next:** Max handshake (systemConfig/presetStore); daemon hotplug + OSC parity.
- **Dialect:** unified on slot **letters** (`a..h`) everywhere — web, Max, daemon. Sim
  in: `/grid/in/focus/page <a-h>`, `/grid/in/slot/<a-h>/page`, `/grid/in/page/<a-h>/<rest>`;
  out: `/grid/out/focus/page <a-h>`. Web keeps a numeric `focusedSlot` for local array
  access only; the wire is letters. (Daemon needed no changes — already letters.)
- **Shifts (OSC input, receive-only):** two shift buttons outside the pages, in via
  `/grid/in/shift <1|2> <1|0>`. **No output** — shift only alters internal behavior.
  Debounce = **leading-edge lockout** (`core/shiftInput.ts`, unit-tested): first edge
  instant, then ~10ms ignore-all to swallow alternating chatter. (A same-state filter
  is NOT a debounce — that was the first, broken try.) Surfaced as `ctx.modifiers.
  shift1/shift2` (live getters over one `ShiftInput`); "both held" is the page's call.
  Shared in sim + daemon. **Local sources** call `ctx.setShift(which, down)` (routes
  through the same ShiftInput) — `isometric` uses its right-edge control keys as local
  shifts: bottom-right = shift 1, the cell above = shift 2 = **sustain pedal** (held
  keyboard releases are deferred until the pedal falls). Verified live via WS note events.

### 2026-06-06 — Gemini
Scanned the codebase to orient and grasp the project state. Created a persistent context artifact to keep notes on the architecture and boundaries. The Page Protocol and separation of concerns are extremely clean. 
- **Verified?** N/A (no code changes)
- **Next:** Wire the right-hand page-settings panel, per Claude's handoff.

### 2026-06-06 — Claude
Built the project from zero to a working multi-page app on real hardware: serialosc
driver + `NullGrid`, render loop + quadrant reconciler, page system with auto-discovery
+ `docs/PAGE_PROTOCOL.md`, pages (base / screensaver / isometric / toggle), two-color
web UI, runtime hotplug (connect-sync + clickable indicator). Fixed two serialosc
gotchas (see `CLAUDE.md`). Verified live on monome 128 (id `m1000279`). 20 tests green.
Set up the cross-agent handoff (this file + `AGENTS.md`/`GEMINI.md`) and **initialized
git** (`main`), pushed to **github.com/ianduclos/gridmapper** (private). Push at the end
of each session. **Next:** wire the settings panel.
