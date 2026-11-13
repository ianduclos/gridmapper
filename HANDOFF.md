---
project: gridmapper
updated: 2026-11-13
entries: 2
---

### idk.surface pages (PLAY, home, iso lanes, REEL pads) — opened 2026-11-11, owner: claude-gridmapper
- done: branch `feat/play-surface`, not merged; pushed up to 279defc, later commits are local only. PLAY page (slot c), the new home page ON (set-surface: FX row, FOCUS, MOTION, BOW/FREEZE/DAMP), iso's lane picker, REEL pads + step line page ON since 12:30 (slot d, key x0 y4), one cheat sheet per surface page. 708 tests pass (2026-11-12). PLAY has a XEN CHORDS toggle at x2 y1 (e4c6e32): lit, lane column 1-8 sends `/xen/go <1-8>` to xen-harmony on UDP 57170 (send-only socket opened at the first chord; never sent for real yet). Nothing has been played by Ian; the grid was off USB at session end.
- next: THE AGENT RESTART IS OWED AND MUST WAIT (2026-11-13): commits 1e5dacd (ARP = the app's one switch) and the OSC 4 commit after it are not in the running agent. Do not restart until the idk.surface session says its app has `/surface/osc/4/release` and the prefixed own notes (they are refused before that). Then: Ian's playing check of all four pages. Merge to main after it. Any agent restart: only while surface is silent (two silent reads of the `lanes` topic), then one line to `hc send surface-inbox`.
- blockers: none. A second session (2026-11-11 evening, commits 2611ffe, 36c6640, dc21170) added an ARP key on PLAY (x14 y7) and on REEL pads (x14 y4) and a REEL step fix, and restarted the agent at 18:48; its cheat sheets were updated in those commits. Open with Ian: PLAY's shift 2 latch time; my six calls on the REEL page (pad order, clearing a step, key latching, hand speed, lane clearing, playing-step look) are in docs/reel-surface-cheatsheet.md as built.
- context: CLAUDE.md (file map entries for play-surface, set-surface, reel-surface, pageSelectorSurface); docs/{iso,cells,play,home,reel}-surface-cheatsheet.md; idk.surface docs/specs/2026-11-11-grid-play-page-design.md and 2026-11-11-reel-step-line-design.md; idk.surface docs/osc/reference.txt (never guess an address); reports in idk.surface/.superpowers/reports/ (play-page*.md, play-y-axis.md, home-page-now.md).

### Cells score editor — opened 2026-09-22, owner: claude-gridmapper
- done: design settled with Ian; open items resolved 2026-09-27 (step-or-Hz entries, edits land at the cutoff, variant lengths divide the world cycle, pitch loops per world + row); phased build plan written.
- next: phase 2 (rhythm editing, variants). Phase 1 (live score + `/grid/ui` world packet) built 2026-09-27; not yet seen by Ian in the real panel.
- blockers: none.
- context: docs/cells-editor-design.md (Decisions 6–10 + Build plan), docs/cells-hot.md, src/pages/cells-hot.ts (`events()` is the scheduler), web/index.html (`renderCellsView`). Cycle-locked loopers (b14f81f) define the world cycle that variant lengths must divide.

# gridmapper — Session Handoff

**Read this first.** Single shared source of truth for *where we are* and *what
changed*, across sessions and across agents — **Claude Code** (main environment) and
**Codex** (backup bench; Gemini/Antigravity appears in older entries). It lives in
the repo so it travels with the code (unlike any agent's private memory).

## Who does what
- **Claude Code** — primary environment; structural & architectural work (driver,
  render loop, reconciler, page system, connection/hotplug, OSC) and ecosystem
  publishing (`STATUS.md`, the cross-project change feed, pushes).
- **Codex** — backup bench, two modes: (1) **heavy mechanical work under a written
  brief** from Claude (a Session-log "next" item, a `###` entry above, or a spec file)
  — refactor sweeps, test buildout, iterate-until-green loops; (2) **overflow** when
  Claude is at usage limits. Structural changes need a brief that says so; if a task
  outgrows its brief, note it in the Session log and stop rather than improvise. More
  authority (STATUS.md, push, agent restarts) only when Ian explicitly grants it.
- **Ian** — decides direction, plays the grid, grants exceptions.
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
- **idk.surface pages (2026-11-11, branch `feat/play-surface`, unplayed):** PLAY (slot c), new home ON (slot f), iso lane picker, REEL pads built OFF (slot d). A third OSC peer `ctx.surface` (57150 out / 57133 in). Cheat sheets: `docs/*-surface-cheatsheet.md`. Entry at the top of this file.
- **clips page talks to real Live (2026-10-13):** idk.clips' fork serves `/clips` on 11000 and feeds whoever said hello (the clips slot, from 11001). Unseen by Ian on sim/grid yet. Session log 2026-10-13.
- **cells-hot v2 LIVE (2026-09-21, agent restarted after Hotelier 61dd9bf installed the Max half):** richer banks, shared-beat world changes, independent tuning recommendations, shaped decay, optional evolution/rests and selected-cell mute/rejoin. 447 tests and types pass. Max half installed and probed (replaceAll, decayMs→scorearm, armDecay0..3, decay scales; 4-slot guard offline-tested only). Listening/timing pass is Ian's. See `docs/cells-v2-rollout.md` and `docs/cells-v2-verification.md`.
- **cells-hot banks:** web + Grid rhythm/tuning buttons, nine exact Hotelier tuning tables, independent selection. Manjanin and Ngòn study banks installed, 18 choices each; source details in `docs/cells-sources.md` and next-repertoire research in `docs/cells-microtiming-research.md`.
- **Run:** `npm run sim` → http://localhost:57191 (live grid + web mirror; auto-
  connects to the monome 128 when present). `npm run sim -- --null` = no hardware.
  `npm run dev` = headless daemon. `npm test` · `npx tsc --noEmit` · `npm run grid:list`.
- **Works:** serialosc connect + runtime hotplug; render loop (58fps) + quadrant
  reconciler; 8 page slots with **auto-discovered** pages (`base`, `screensaver`,
  `isometric`, `toggle`, `blank`, `meadowphysics`); two-color web UI (slot chips + page
  dropdown + clickable connect indicator + transport strip); physical + web key input,
  mirrored both ways. **Page-settings panel is live** (declared `SettingSpec[]` →
  controls → page, two-way over OSC) and now sits **under the grid**; an **app-settings
  panel** (clock, lanes, sleep, caffeinate) sits right. The **sim bridges real OSC to/from
  Max** (`emitOut` = OSC + web). **Control routing is a single shared dispatcher,
  `core/oscRouter.ts`**, used by both `sim.ts` and the daemon.
  **Runtime hotplug lives in `io/gridConnection.ts`** and is shared by both.
- **Max boot handshake + presets (new):** `docs/max-handshake.md` is the contract a
  patch follows. `/grid/in/ping <token>` → `/grid/out/pong <token>`. A preset layer
  (`core/systemConfig.ts` = layout-as-data + sanitize→factory; `core/presetStore.ts` =
  `configs/presets/<name>.json` + `configs/slots.json`, the live layout + `activePreset`
  marker that both entry points now BOOT into). `/grid/in/preset/{list,load,delete}`;
  **save is web-panel only** (`origin === "ui"`) — a patch must not overwrite a preset
  mid-set. `/grid/out/preset/active` is the completion signal, emitted only after all
  eight slots are built and have announced; `""` = none active.
  **A preset restores page state**, not just the layout: `Page.restore?(config, ctx)` is
  the inverse of `serialize()`, called between `init()` and `onFocus()`. isometric brings
  back settings + 8 chords + 4 recorded loops + track routing; meadowphysics its whole
  patch. Nothing restored makes a sound (loops come back *stopped* at the top).
  `util/restoreGuards.ts` is mandatory reading for any new `restore()` — a preset is
  untrusted input and must never throw.
  **Echo discipline:** an OSC-originated `/setting/<key>` write no longer echoes on the
  OSC wire (the web UI still gets it, and a UI write still reaches Max). The router takes
  an `origin`; the host owns the mute.
  **Web UI:** a presets box (list · load · save/overwrite · arm-then-confirm delete).
- **Transport:** `core/clock.ts` — one app clock, **off at boot**, in **4 lanes**
  (each internal ÷n of the drift-compensated master, or external via
  `/grid/in/clock/tick <lane>`). Every lane ticks **every loaded page**
  (`Page.onTick(tick, lane)`), so sequencers run in slots you aren't looking at, and a
  page picks internal-vs-external simply by choosing a lane. Lane IDs 0–3 deliberately
  match twistermapper's `/twister/in/clock <id>`.
- **Power (new):** `core/idleManager.ts` — the render loop **stops entirely** after
  inactivity (4h with a grid, 15min without; both persisted + OSC-settable). Activity =
  INPUT only, never "the frame changed". `core/appRuntime.ts` assembles clock + idle +
  settings once for BOTH entry points so they can't drift.
- **Isometric is now a performance instrument (2026-08-08).** Beyond the keyboard:
  col 13 = 8 **chord presets** (store pitches; armed by the sustain toggle, re-press to
  release, shift-clear), col 14 = 4 **output tracks** + 4 **arpeggiators**, col 15 = 4
  free-time **loopers** + sustain toggle / pedal / shift 2 / shift 1. The note pipeline is
  the load-bearing part: notes are keyed **(track, step)** and reconciled against what Max
  was last told, through
  `keys+chords → LIVE → [record tap] → +playback → INTENT → [sustain] → [arp] → out`.
  Read the header of `src/pages/isometric.ts` before changing any of it — every rule there
  was paid for by a bug.
- **Next / open:** **play it on the grid** — very little of 2026-08-08 is hardware-verified
  (traces over the WebSocket only). Then Max OSC **handshake** (`systemConfig` +
  `presetStore`) — prioritize **Max → daemon** (state snapshot on request, not on connect);
  a single-page preset blob fits one datagram, so `serialize()` ⇄ `restore()` is the cheap
  first step. Plus: single-instance guard; the twistermapper clock bridge (~20 lines now
  that lane IDs match). 287 tests green.
- **Background agent:** launchd `com.ianduclos.gridmapper` runs the **sim** always-on
  (OSC↔Max + hotplug + web UI on 57191, served, not auto-opened). Template + manage cmds
  in `deploy/`. Holds 57131 + the grid → `launchctl bootout gui/$(id -u)/com.ianduclos.gridmapper`
  before a manual `npm run sim`; `kickstart -k …` to pick up edits (runs `tsx` on source).
- **Parked:** web-UI button "bounce" — `transform: translateY(.5px)` on `.cell:active`
  in `web/index.html` (remove system-wide, UI layer, not pages). BPM display for the
  transport (needs a ticks-per-beat setting; the rate is a raw tick rate today).
- **Broken, needs hands:** the monome is **not visible to serialosc** (`/serialosc/list`
  returns nothing while `serialoscd` runs), so the agent sits on NullGrid. Replug the USB.
  Nothing since 2026-07-19 has been verified on hardware.

---

## Session log

### 2026-11-13 — Claude (from the idk.surface session, at Ian's ask) — left column order; iso's lane picker on shift 2
- **What:** util/pageSelectorSurface.ts: the shared column is now y0 iso, y1 PLAY, y2 REEL pads, y3 the page's own, y4 home, y5 Twister (Ian: "pads mode below play mode and send the twister to the bottom and home right on top of that"). Cells' DAMP moved from x0 y4 to x0 y3 (y4 is home), and cells now shows the REEL key. pages/iso-surface.ts: the lane picker left the shift 1 latch and the bottom row; while x0 y6 is held (Ian: "lshift 2 aka 0 6"; a tap under 300 ms is still PANEL), the playing area's top row goes dark and x4-x11 show lanes 1-8 for every selected track (bright all, medium some, dim none) and a press sets the lane for all of them, or drops it when all have it. It is handled before the panel, which used to swallow x1-x4. Shift 1 + track still latches a track for the looper routing.
- **Verified:** tsc clean, 710 tests; agent restarted (`kickstart -k`) at 00:31. **Not** on hardware. Ian had said the old picker "is not working for some reason": the app answered `/surface/get` for the four KEYS rows correctly (tracks 2-4 hold no lanes: `''`), so the likely causes were the panel swallowing the keys, or tracks 2-4 simply playing nothing.
- **Next:** Ian's hands. The five cheat sheets are updated.

### 2026-11-12 — Claude — PLAY: XEN CHORDS toggle
- **What:** pages/play-surface.ts: a quiet toggle at x2 y1 (dim off, medium on, not saved). Lit and on KEYS, a press in lane column 1-8 plays no note and sends `/xen/go <1-8>` to 127.0.0.1:57170 (xen-harmony; address from `uv run xen osc` there), once per press; the column last called is lit. Cheat sheet updated in the same commit. Agent restarted while surface was silent.
- **Verified:** tsc clean, 708 tests (the send is a spy in tests). NOT verified: no real `/xen/go` was sent, nothing seen on the grid.
- **Next:** Ian tries it with xen-harmony running.

### 2026-11-11 — Claude — idk.surface pages: PLAY, new home, iso lanes, REEL pads (off), cheat sheets
- **What:** on `feat/play-surface`. PLAY (pages/play-surface.ts): layers removed, even field, held own notes with PITCH off, `y` setting, SLEW tap, STRIKE on by default, LATCH lights its column. Home (pages/set-surface.ts): ROLL gone, `HOME_VIEW_LIVE` now true (FX row y0, FOCUS y3, MOTION y4), view heard on surface's `values` topic. Iso: lane picker on the bottom row while a track is latched; x0 y6/y7 are PANEL and TRANSPOSER again. New pages/reel-surface.ts behind `REEL_PAGE_LIVE` (off); slot d of the idk.surface preset and live layout is `reel-surface`. Five cheat sheets in docs/.
- **Verified:** tsc clean, 690 tests. Live reads of surface's view addresses answered. NOT played: the grid was off USB (no usbserial device) from about 10:22.
- **Next:** see the entry at the top.
- **Gotchas:** (1) `git commit -am` sweeps in the daemon-written configs (slots.json, settings.json, presets): fb2cebd did, by mistake; add files by name. (2) A page file created after the agent started is not registered until a restart. (3) Restart only while surface is silent; surface re-links by itself after a restart. (4) Every surface page has a cheat sheet that changes in the same commit as the page.

### 2026-10-27 — Claude — set-surface voices 7-8
- **What:** `pages/set-surface.ts` VOICES 6 → 8; voices 7-8 on cols 10-11, ALL covers eight, loop ctl ids accept `/7`, `/8` (97126cd). `pages/cells-surface.ts` stays 6 voices; its ALL-damp light now checks only voices 1-6 of set-surface's eight-entry `DAMP_STATE_SURFACE`. New test in `test/surface.test.ts`.
- **Other side:** idk.surface dropped voice keys above 6 (`control/GridSeam.h` `kGridVoices`) and sent feedback for six (`control/VoiceLights.h`). Both raised to 8 there, test + spec updated (idk.surface e23149a2, `./surface test -R "grid:"` 20/20).
- **Verified:** tsc clean, 625 tests; agent restarted (`kickstart -k`). **Not** on hardware, and the running idk.surface app is still the old build until Ian relaunches it.
- **Next:** relaunch idk.surface, press the voice 7-8 keys. Decide whether cells-surface goes to 8.
- **Gotcha:** a voice-count change on a surface page needs the matching limit in idk.surface's GridSeam; check the receiving end before calling it done.

### 2026-10-18 — Claude — power-off blank actually reaches the grid
- **Bug:** power OFF never blanked the grid. `ledLevelAll(0)` was queued, then `conn.detach()` closed the driver's UDP socket synchronously, and a dgram send that is still waiting on its (next-tick) address lookup is silently dropped by `close()`. Confirmed with a bare dgram repro (0 packets).
- **Fix** (`io/serialoscDriver.ts`, 259055a): `close()` stops dispatching incoming messages at once and closes the socket 50 ms later (`CLOSE_FLUSH_MS`). Applies to every close, including `reconnect()`. Power ON was already right: reattach → `onRepaint` → full paint of the reloaded layout.
- **Verified:** new `test/serialoscDriver.test.ts` (fake serialosc on loopback) fails without the fix and passes with it; 624 tests, tsc clean; agent restarted (`kickstart -k`). **Not** on hardware: no `/dev/cu.usbserial*` at the time.

### 2026-10-13 — Claude — clips page meets the real Live side
- **What:** `feat/clips` merged to main (ff, dc24025) and the agent restarted onto it. idk.clips' AbletonOSC fork now serves `/clips` (built this session, idk.clips branch `idk` cf43cf8), installed in Live 12 Suite via a symlink in `~/Music/Ableton/User Library/Remote Scripts/AbletonOSC`. The agent's clips slot subscribes on its own (fork log: `clips: feed now goes to 127.0.0.1:11001`).
- **Contract outcomes for this page:** question 12 answered — the fork sends `/clips/*` to whoever last sent hello/window-set, so nothing changed here; readings 4–11 confirmed; 0.85 = 0.0 dB confirmed (`UNITY`); track indices are Live's *visible* tracks; solo/arm honour Live's exclusive prefs fork-side. Notes: `docs/clips-contract-notes.md`; the contract as implemented: idk.clips `docs/clips-contract.md`.
- **Verified:** fork smoke against live Live (hello/window/tracks/scenes, banking + clamping, mute, Gate hold/release, track stop, scene, stop-all, reload); gridmapper 73 clips/liveLink tests + tsc after the doc/comment edits. **Not** verified: the page itself on the web sim or the grid with real Live — Ian's check.
- **Next:** Ian views the clips slot (sim, then grid) against Live. `npm run clips:fake` can't run while Live's AbletonOSC holds 11000.

### 2026-10-12 — Claude — clips page (gridmapper side of idk.clips)
- **New:** `io/liveLink.ts` (a second OSC peer, `ctx.live`, UDP 11000 out / 11001 in, loopback), `util/clipsState.ts` (the pure model + the one LED table), `pages/clips.ts`, `cli/clips-fake-live.ts` (`npm run clips:fake`, a stand-in fork). Plan: `docs/superpowers/plans/2026-10-12-clips-page.md`; spec lives in idk.clips.
- **Ian's calls:** master volume shown only (no contract address), hold-to-cue dropped from v1, x0 y7 = pages key (hold + x0–7 on y0 → slot a–h). The contract readings idk.clips should confirm are in `docs/clips-contract-notes.md`.
- **Verified:** tsc clean, 623 tests; the page against the fake fork over real UDP (snapshot, launch, bank); a taken port retried and recovered on a real socket. **Not** verified in the web sim, in Live (fork unbuilt) or on the grid.
- **Final review fixes:** only a `/clips/window` brings the link up (a beat first used to strand the page on "no link"), and a dropped link forgets the set. The Live socket is lazy (bound only while a clips page is loaded), retries a taken port, and drops sends while unbound. Port 11001 also clashes with idk.clips' own AbletonOSC client: open question 12 in the contract notes.
- **Next:** Ian views it in the sim against `npm run clips:fake`. The launchd agent picks the page up only after `kickstart -k`; it binds 11001 only while a clips page is loaded. Built on branch `feat/clips`.

### 2026-10-02 — Claude — idk.surface page forks + preset
- **Forks** `pages/{iso,cells,set,blank}-surface.ts` of the hotelier -hot pages: the same behavior and wire format, free to diverge. They have their own selector (`util/pageSelectorSurface.ts`, separate `twisterHeld`) and their own damp keys in `core/sharedStore.ts` (`damp/cells-surface`, `damp/set-surface`). They still share read-only world/tuning data with cells-hot. VOICES is 6.
- **Preset** `configs/presets/idk.surface.json`: a iso-surface, b cells-surface, f set-surface, the rest blank-surface. Preset names may now contain `.` (never leading), in `presetStore.ts` and the web panel. The web cells panel recognises cells-surface too.
- **Verified:** tsc clean, 549 tests (`test/surface.test.ts` reads the real preset file); agent restarted (`kickstart -k`), web UI up. **Not** loaded over OSC or played on hardware. Since then idk.surface has gone to eight voices (CHANGES.md 2026-10-03); the surface pages still cap at 6.

### 2026-09-28 — Claude — power switch, agent restarted onto the new work
- **Power** (`core/appRuntime.ts`): `/grid/in/power [0|1]` (no argument toggles), `/grid/in/power/get` → `/grid/out/power`. OFF captures the layout, disposes every page (`PageManager.unloadAll`), stops the clock, blanks and releases the grid, stops discovery, and holds the render loop asleep (`IdleManager.hold`). The router drops everything except power and ping. ON reloads through `applySystemConfig`. The web header has the toggle.
- The web cells panel falls back to an older server's `/view` (no score) instead of "Waiting for the page…".
- Agent restarted twice (kickstart); it runs all of this. **The grid did not reconnect after the last restart: no `/dev/cu.usbserial*` present** (cable or power, not code).
- **Verified:** tsc clean, 538 tests; the power toggle was exercised in an isolated sim copy (off/on, no page errors). Not on hardware.

### 2026-09-27 — Claude — cells-hot review fixes, cycle loopers, score view, four banks
- **Review fixes:** cells persists with an EMPTY patch (live `slots.json` only, batched 400 ms; `presetStore.persistSlot` skips the preset on `{}`), so playing never rewrites a saved preset. A held per-voice damp releases after a view change. Play gates cells only: it starts a stopped transport, joins a running one on its next beat, and never stops it; a preset load stops the session only.
- **Loopers** (`util/cycleLooper.ts`): record in pulses and lock to whole world cycles (the LCM of the world's cell lengths, `worldCyclePulses`); each move replays at its exact pulse. Record only while cells plays. The old ms-format loops are dropped on restore. Out: `/patterns [{state, beats}]`.
- **Evolution** `evolveActivity` and `restChance` settings. World cues: the rhythm-bank key blinks while a world is queued, and the phase bars flash when it lands.
- **Editor phase 1:** the web score canvas. Static world data moves to web-only `/grid/ui/page/<slot>/world` (`UI_ONLY_PREFIX`, never on UDP); `/view` goes from 3.9 KB to 0.7 KB plus a `phase` anchor. Plan and decisions 6–10: `docs/cells-editor-design.md`.
- **Banks:** Nyamaropa, Sikuri, Tshikona and Kecak, drafted by 4 parallel research agents; every source was re-read against the data before registering. Ledger: `docs/cells-sources.md`; dossiers: `docs/cells-research-*.md`.
- **Verified:** tsc clean, 534 tests; score seen in headless Chrome against an isolated sim copy. **Not** restarted onto the agent, played on hardware, or heard.

### 2026-09-22 — Claude — held notes across page switch, set-hot Twister page keys
- **Key-up routing** (`core/pageManager.ts`): a release goes to the slot that got the press, even after focus moved (cleared when a slot is reloaded). iso-hot's `onBlur` no longer drops held notes or a latched sustain; other pages still clean up on blur as before.
- **set-hot col 15:** rows 0-2 = 3 loopers (was 4; no saved loop lost), rows 3-7 = Twister pages a-e (ModelHot…VoicesHot) → `/twister/in/focus/page <a-e>` straight to twistermapper; lit = last pressed here (no feedback from the Twister). Shift 1 moved to col 0 row 7.
- **Verified:** tsc clean, 484 tests; agent restarted (`kickstart -k`), grid reconnected. **Not** played on hardware.

### 2026-09-22 — Claude — iso-hot performance panel, cheatsheet, selector remap
- **Panel (col 0 row 6)** over keyboard cols 1-4, hides/is hidden by the transposer. Col 1: tint on/off (hold + keys edits the triad's pitch classes), tint mode above/below/alternate (rows 1-3), tint octave +1/0/−1 (rows 4-6). Col 2: arp speed ×4…÷4 (sub-tick timers on the clock, arpRate/factor free-running). Col 3: arp probability in eighths (a miss rests without advancing). Col 4: strum (row 0), octave +2…−1 (rows 4-7). T-voices shimmer on the keyboard and start 0..`tintJitterMs` (≤500) late; strum/jitter use a pending-on map so an early release never sends an orphan off. All panel moves are loop gestures (restore guard clamps them). Panel state + triad write through to the active preset (400 ms debounce); triad clears on npo change. New out msgs `/octave`, `/tint`, `/tintset` (Max ignores).
- **Cheatsheet** for iso-hot (views keyboard / transposer / panel). Shifts idle at 6, panel idle 4 / home 8.
- **Selector** (`util/pageSelector.ts`): rows 0-4 → slots a b c d **f** (set-hot keeps Max's `page/f`; e dropped). Row 5 = Twister key: `/twister/in/overlay 1|0` sent straight to twistermapper (`osc.twisterPort`, default 57121; `/twister/in/*` bypasses Max in `emitOut`). twistermapper handles it (see CHANGES.md).
- **Verified:** tsc clean, 481 tests; agent restarted after each step. **Not** played on hardware.
- **Gotchas:** loops record T-voices without the humanize delay; a T-voice whose delay outlasts the note never sounds.

### 2026-09-22 — Claude — cheatsheet popup with fake LEDs
- Web: the key map is a popup again (Ian: the overlay forced switching modes to read them). `cheatsheet` button top-right of page settings, shown only when the page has a keymap; one tab per view, live view marked with a dot; thicker guides. The on-grid overlay is gone.
- `KeySpec.lit` (optional): a level, a pattern over the span, or per view (`"*"` = rest), taken from each page's render(). The replica grid paints it through the LED ramp (damp view shows Damp + Shift held). cells-hot, set-hot and the selector declare it; `test/keymap.test.ts` checks levels and view names. Doc: PAGE_PROTOCOL §8a.
- Verified: types, 465 tests, Playwright screenshots (keymap injected; the running agent still serves the old map until restarted). Not verified: hardware key echo in the popup.
- Next: kickstart the agent when the grid is idle; "equipentatonic" needs a `short` label (overflows its key).

### 2026-09-22 — Claude — cells-hot controls, damp, key legend, tabs
- Grid: mute moved to x1 and cells to x2–4; row 6 is cells view x1, rhythm banks x2, tuning banks x3. Damp at x0 y6 (hold = all six), and damp + shift toggles per-voice damp on col 1. Damp is sent THROUGH set-hot via the new `core/sharedStore.ts` (the one page-to-page channel; set-hot stays the single sender).
- Web: `keymap: KeySpec[]` per page → the **keys** toggle draws a diagram legend over the web grid that follows `keyView`. The sim echoes keys to the web as `/grid/out/keyecho` (web only). Cells panel is now tabbed (Arrangement · Sound · Evolution · World · More, with Tempo pinned) with a readability pass.
- Verified: types, 464 tests, Playwright screenshots against the isolated `--null` sim copy. Not verified: hardware and audio.
- Next: the score editor (open handoff entry above). Playwright is now installed globally (npm + pip) with Chromium.

### 2026-09-21 — Claude — cells-hot: play toggle, loopers, BPM, panel
- Bottom row: x0 shift, x1 play toggle, x12-15 gesture loopers (cell/mute/ensemble moves; shift+press clears; saved in page state). Playhead dims on silent rows, edge glides.
- Clock "resetting to 7": cells pushed its pulseRate on every Run and never learned transport edits. Cells now owns tempo as BPM (3 pulses/beat) and adopts transport edits (internal lanes only).
- Worlds carry `context`/`ensembleNotes` (Sonnet-drafted from the source docs, numbers spot-checked); web panel rebuilt into sections with per-setting `help`.
- Verified: types, 458 tests, Playwright against an isolated `--null` sim copy on 57231/57291 (toggle, BPM both ways, transport edit sticks, looper rec/play/clear, no console errors). Agent restarted. Not verified: physical grid, audio.
- Gotcha: a second sim in the repo shares `configs/` (and so the OSC ports and slots.json); test from a copy with its own `configs/settings.json`.

### 2026-09-21 — Claude — Cells v2 gone live
- Hotelier's Max half landed (61dd9bf there; evidence in its `docs/CELLS-PLAYBACK.md`). Here: types clean, 447 tests, `launchctl kickstart -k` the agent; UI answers on 57191, slot b = cells-hot, transport boots stopped. No code change.
- Not verified: physical grid, audio, the listening/timing checklist in `docs/cells-v2-rollout.md`. Page B needs Start again (the Max reload dropped the running session).

### 2026-09-21 — Codex — Cells v2, prepared for coordinated installation
- Added independently audited Manjanin II, Woloso-dòn and Pelayon banks (18 cells each), explicit source/arrangement metadata, paired evolution rules and tuning recommendations. Ango omitted: accessible metadata did not support an attack-level reconstruction.
- Intended clock deadlines now reach Cells; world requests replace all six future schedules on a shared beat while preserving phase. Added shaped decay, named web controls, separate tuning groups and physical tuning rows, seeded auto-evolve, locks/manual protection, optional temporary rests, and tap-selected-cell mute/rejoin.
- Verified: types; 447 tests; isolated browser controls. 1,346 callback samples under UI use: p95 +2.030 ms, max +5.390 ms. These are callback measurements, not audio jitter. Max scheduler/resolver/staged DSP regressions pass; real OSC/audio rollout awaits the other Max agent.
- No live daemon restart, Max mutation, user preset staging or physical Grid claim. Preserve dirty `configs/slots.json` and `configs/presets/hotelier.json`. Next: follow `docs/cells-v2-rollout.md`; install compatible Max receiver/resolver/Gen first, then restart Gridmapper and record timing/dropouts separately.

### 2026-09-21 — Codex — Manjanin and Ngòn banks
- Added two six-row/three-choice source-derived study banks. Manjanin uses four-cycle lead excerpts 5–8, 9–12, 175–178 and separate measured D1 timing. Ngòn preserves the eight-beat hook and alternating four-beat lead halves, with corpus-mean subdivision and labelled adapted alternatives. Pitch/duration/gain are composed; Ngòn flams collapse to single attacks.
- Verified source notation visually and independently reviewed Manjanin; tests protect lead phase, omission, fractional OSC onsets with humanization zero, and all tuning/range combinations. Types clean, 417 tests pass. Live browser showed and selected both new banks without changing tuning; original Ssematimba upper-stream choices restored, transport stopped. No physical device or new Max audio audition; Max files untouched.
- Research: documented second Banda Linda repertoire, Aka/Baka analytical recordings, Balinese kotekan and byar distinction, and Algerian inṣirāf evidence/limits. No additional source banks claimed installed.
- Files: two data modules, worlds registration, `test/cellsMande.test.ts`, cells source/research docs.
- Next: Ian auditions; named Banda Linda transcription/recording pairing. Max agent's new `durationMode` implementation is recorded in Hotelier's change feed and playback contract; existing pending UI label still awaits end-to-end listening/integration confirmation.

### 2026-09-21 — Codex — World banks and Hotelier tunings
- Added named rhythm/tuning buttons in web settings and physical Grid bank views on row seven. Selection follows existing phase-preserving scheduling; bank view is not persisted.
- Added nine canonical Hotelier tuning snapshots and regeneration script; preserves 432 Hz anchor, Young keyboard order, and stretched Ranat period. Independent choices only; selected-Max-scale following needs future handshake integration.
- Documented measured Manjanin, Ngòn and Bire timing sources and adaptation boundaries. These research candidates are not new playable transcriptions yet.
- Verified: types clean; 412 tests; generated snapshot matches current `idk.tuning.js`; live web Ranat selection round-trip leaves Ndyegulira selected, then restored five-tone model. Gridmapper restarted stopped. Physical device absent; no live Max/audio mutations or new jitter claim.
- Files: `src/data/cells-hot-worlds.ts`, `src/data/hotelier-tunings.json`, `scripts/sync-hotelier-tunings.mjs`, page/settings/web bank controls, two test files, cells docs.
- Next: Max agent duration/decay integration; source-derived multi-part microtiming bank. Preserve dirty configs and the Max agent's live patch edits.

### 2026-09-21 · Codex · cells rhythm worlds and decay interface
- Added three sourced worlds (Ndyegulira, Ssematimba, Chakwi), each with six rows/three choices; source notation verified visually and adapted filters/excerpts labelled. Independent tuning models and source-relative pitch mapping; existing horn outputs unchanged.
- Duration mode is captured in each OSC event; decay is explicitly pending the separately owned Max timing implementation. Handoff: `docs/cells-decay-handoff.md`; provenance: `docs/cells-sources.md`.
- Verification: types and full test suite; focused source sequence/phase/pitch mapping and world independence tests. No Max edits, Gen reloads or audio mutations by this task. 405 tests pass. Launchd daemon restarted; live browser verified four Rhythm worlds, five Tuning worlds, and Gate/Decay selector. Original horn world and user settings retained, transport stopped. No physical Grid connected.
 (newest first)
### 2026-09-21 — Codex
Added `cells-hot` for hotelier slot b: six rows of paired 18-bank cells, per-voice
selection/mute/phase, three ensembles, and explicit bottom-row Run/Stop. It schedules
absolute same-host epoch OSC packets at `/grid/out/page/b/cells`: start/sync/replace/stop
with a 100 ms look-ahead; muting cancels only future events and restores silently.
`PageContext.clockControl` is a small optional seam wired in both entry points; only
explicit Run changes the shared clock to 12/1.66 Hz. Config restores without a session
or attacks. Packet/watchdog contract: `docs/cells-hot.md`.

Files: `src/pages/cells-hot.ts`, `src/core/types.ts`, `src/cli/{sim,index}.ts`,
`configs/{slots,presets/hotelier}.json`, `test/cellsHot.test.ts`.
Verified: `npx tsc --noEmit`; `npm test` (394 tests). Not restarted or hardware/Max
auditioned. Next: Max side consumes the documented packet contract; Ian plays the page.

### 2026-09-21 — Claude
**Hotelier concert set** (concert 2026-09-23). The preset `hotelier` is now `iso-hot` in slot a and
`blank-hot` in b–h (`configs/presets/hotelier.json` + `configs/slots.json`).
- `pages/iso-hot.ts` — deliberate FORK of isometric (diverges freely; isometric untouched).
  Keyboard at cols 1–12, col 0 rows 0–5 = page selector (`util/pageSelector.ts`, shared with
  `pages/blank-hot.ts`), col 0 row 7 = transposer toggle (bottom row → −7..+4, col 8 = 0).
  Notes are stamped with the transposition at note start. Chords move relative to the
  transposition they were saved at and PERSIST on save/clear (live layout + a chords-only
  merge into the active preset). Loops store notes untransposed and record transposer moves
  + arp-button modes as a parallel control lane (`PatternEvent.ctl {id,value}`) that
  replays into the live controls; latest move wins. Opt-outs: `transposeChords`,
  `transposeLoops`. Header of `iso-hot.ts` is the spec.
- Framework: `PageContext.focus(slot)` and `PageContext.persist(patch)`, via PageManager's
  `PageHooks` (wired in both sim and daemon); `PresetStore.persistSlot`. `PageManager.onKey`
  no longer paints the old page's frame when a key moved focus.
- Col 0 rows 6–7 are PER-PAGE keys by convention (recorded in CLAUDE.md).

**Verified:** `npx tsc --noEmit` clean; 374 tests green (`test/hotelier.test.ts` new). Agent
restarted after each change; live WebSocket shows slots `iso-hot, blank-hot×7`, preset active
`hotelier`, and focus changes arriving from the physical grid. **Not played by Ian yet.**
**Next:** Ian plays it; more custom hotelier pages; decide col 0 row 6 in iso-hot.

### 2026-09-16 — Codex
Made preset recall explicit in `web/index.html`: a **recall** button beside each
saved name (name-click still recalls), descriptive accessible label, and a live
status region. Replaced the misleading "edited since load" fallback with "no preset
active". Documented UI recall in `docs/max-handshake.md`.

**Verified:** `npx tsc --noEmit` clean; 353 tests green. Browser against an isolated
NullGrid sim on 57291 (scratch configs, OSC 57931/57930): recall loaded isometric
with vertical interval 7; changing it to 5 then recalling restored 7. Real UDP load
returned `/grid/out/preset/active "Recall demo"`. Ready for Ian to check; no hardware
or Max-patch verification.

**Live state:** installed launchd plist runs `tsx src/cli/sim.ts`, contrary to the
previous dist note. The current process still predates presets: web connection and
explicit preset-list request emit no preset state. It needs `launchctl kickstart -k`
to activate the existing backend. Ian subsequently authorized deployment: restarted
the agent with `kickstart -k`; live ping/pong and preset list/active replies verified
on 57191. No saved presets currently exist. Initial device response after restart was
`null-grid`; physical reconnection remains to be checked by Ian.

**UI suggestions (not implemented):** stronger label/status contrast; real dirty
tracking for page edits (active marker currently survives them); responsive layout.

### 2026-09-12 — Claude
Built the **Max boot handshake**, mirroring twistermapper's (`6ca8d20`) — the brief was
STATUS's third `next` item plus `../twistermapper/docs/gridmapper-handshake-prompt.md`.
Three commits: `6a6172c` handshake + preset layer + echo discipline, `5f71b24`
`serialize()` → `restore()`, `e2fcccd` the web panel's presets box.

**New files:** `core/systemConfig.ts`, `core/presetStore.ts`, `util/restoreGuards.ts`,
`docs/max-handshake.md`, `test/{systemConfig,presetStore,restore}.test.ts`.

**Scope calls Ian made mid-session:** a preset is *pages and their own state* — NOT
focus, NOT the transport, NOT the idle policy (those stay in `settings.json`, shared
across presets). And **no OSC save**: presets are created from the web panel only. The
first pass cut save entirely, which left nothing able to *make* a preset file
(hand-writing a looper's event list isn't real) — so it came back gated on
`origin === "ui"`. That gate is the same `origin` parameter echo discipline uses, which
is why the router takes one at all.

**Gotchas worth keeping:**
- **A page announces its DEFAULTS first.** On a preset load a page emits from `init()`
  (defaults), again from `restore()`, and again from `onFocus()` if focused. A patch that
  latches the first `/settings` latches the wrong one — take the last, with
  `/grid/out/preset/active` as the end of the burst. Documented in the handshake doc.
- **Echo suppression is deliberately narrow** — only `/setting/<key>` (+ value-in-path
  and plural). `/settings/get` must always reply, and blanket-suppressing everything a
  page emits during OSC dispatch would swallow notes and chords.
- Testing the daemon without disturbing the live agent: run it from a **scratch cwd**
  with its own `configs/` on spare ports (57931/57930, UI 57291) and a symlink to `web/`.
  `process.cwd()` is what picks up configs, so this needs no code changes and never
  touches serialosc or port 57131.

**Verified:** `npx tsc --noEmit` clean, **353 tests** green (was 287). End-to-end over
real UDP against a NullGrid daemon: ping/pong, a hand-authored preset loading with every
value restored, an unknown page name degrading to `base`, suppressed echo, `/settings/get`
still replying, failed load reporting `""`. The presets box driven in a real browser
(Chrome via playwright-core) — save → file on disk → change → load → restore, overwrite
hint, invalid name, arm-then-confirm delete, marker clearing on a slot change, no console
errors.

**NOT verified:** anything on hardware, and anything from an actual Max patch. Also
**not deployed** — the launchd agent still runs a `dist/` predating all of this, so the
live daemon has no ping, no presets, and still echoes settings. Rebuild + restart is the
first `next`.

**Next:** deploy (build + `launchctl kickstart -k`); build the Max side against
`docs/max-handshake.md`; `restore()` on `basic` if its toggle grid ever matters.

### 2026-08-08 — Claude
Long session, all on `pages/isometric.ts`, which grew from a keyboard into an
instrument. **Layout** (see the header comment for the taxonomy): col 13 CHORDS,
col 14 TRACKS + ARPS, col 15 LOOPERS + sustain toggle/pedal/shift2/shift1.
**Built:** `orientation` (standard | horizontal); 8 chord presets storing pitches;
4 free-time loopers (`util/patternRecorder.ts`, the ONE deliberate `setInterval` —
cleared in `dispose`, never `onBlur`, so a loop survives a slot switch); 4 output
tracks with per-looper routing and shift-2 multi-select; 4 arpeggiators
(`util/arpeggiator.ts`). `DEFAULT_SCALE` → ionian.

**The through-line was one thing: what a note IS.** It went step → (track, step) →
"chord vs output", and every bug this session was a place still asking the old
question. Lighting compared a bare step against packed keys, so notes only lit on
track 0. Chord-save and the subtract gesture read the post-arp output, so they saw one
note. The arp gated the whole output, so it cut a sustained pad going in and re-attacked
going out. Rule of thumb now: **chord questions use `litSteps`, only the reconciler
touches `lastSounding`.** If a fourth instance appears, rename `lastSounding` →
`lastEmitted`.

**Two LED lessons, same shape, learned twice:** a highlight needs headroom BELOW it, not
more brightness above — 9-vs-8 and 12-vs-15 are both invisible on varibright. The arp now
steps the whole palette down instead.

**Regression I introduced and fixed:** splitting the sustain pedal off shift 2 also took
it off `ShiftInput`'s debounce, so contact bounce read as a double tap and latched sustain
— the "stuck button". Now has its own leading-edge lockout + a 60 ms floor on the double
tap.

**Ops:** a USB dropout (device node vanished, no sleep/wake to explain it) — and I broke
key routing chasing it by running `grid:list` against a *connected* agent, the exact
gotcha `CLAUDE.md` warns about. The note now spells out the safe debug order, because the
obvious move is the destructive one. Also: I restarted the agent ~10× mid-session, which
blanks the grid; batch that.

**Verified:** 287 tests, `tsc` clean, and every feature walked end-to-end over
`ws://localhost:57191` against the live agent. **Not verified: the actual feel on
hardware** — that's the top of `next`. **Open decision:** the arp deliberately does not
gate looper playback (loops keep their recorded rhythm), which is my reading rather than
Ian's stated one — see `4273bda`.

### 2026-07-31 — Claude
Big session, three parts. **(1) Meadowphysics** — faithful port of tehn's iii
`grid/mp.lua` (`src/pages/meadowphysics.ts` + 40 tests): 8 cascading counters, all 8
rules, trig/tog/reset matrices, 3 modes, glyphs verbatim. **(2) App clock + idle**
(`core/clock.ts`, `core/idleManager.ts`, `core/appRuntime.ts`): one transport, off at
boot, ticking every loaded page — this is what stops a sequencer freezing when its slot
loses focus; and the always-on agent now stops its 58fps loop entirely after inactivity.
Live settings persist to `configs/settings.json` (`core/settings.ts` gained a
`SettingsStore` + atomic debounced writes). **(3) Clock lanes + scales**: 4 lanes give
per-page internal/external choice without a second clock; `util/scales.ts` (16 scales)
drives isometric's new `root`/`scale`/`layout`, where `folded` makes one key = one scale
degree but still emits a CHROMATIC step so Max's map is untouched. Plus unison lighting,
double-tap-to-latch sustain, inert `/grid/in/heartbeat`, drag-to-change tempo, page
settings moved under the grid.
Also fixed a **real bug**: on a USB glitch serialosc bounces `/sys/disconnect` →
`/sys/connect` keeping the same routing, but the grid clears its own LEDs while the
reconciler's cache still thinks they're correct — so it sat dark until something changed.
The driver now surfaces `/sys/connect` and `GridConnection` turns it into a full repaint.
Verified: `tsc` clean, **164 tests**, and on the sim — a page on an external lane stayed
put through a second of transport while a page on lane 0 ran, then took 20 steps from 40
manual ticks. **NOT hardware-verified** (see *Broken, needs hands* above).
Gotcha earned the hard way: a scheduled **cloud** routine can't push to the repo, so it
implemented this plan overnight and the work evaporated with the container. Don't schedule
cloud work whose only deliverable is a `git push` without confirming write access first.
Next: Max handshake / presets (`serialize()` ⇄ `restore()` first), single-instance guard,
twistermapper clock bridge.

### 2026-07-19 — Claude
Two small additions, mirroring the pair twistermapper just shipped (see its
2026-07-19 CHANGES.md entry). (1) `pages/blank.ts`: inert `BlankPage` (name
`blank`) — no-op key/OSC, always all-zero frame, no settings — copied from
`_template.ts` per the doc contract; self-registers via `pages/registry.ts`.
(2) OSC ports moved out of hardcoded `createOsc()` defaults into
`configs/settings.json` → `osc.inPort`/`outPort` (default 57131/57130,
unchanged), loaded once at boot by new `core/settings.ts::loadSettings()` and
passed through from both `cli/index.ts` and `cli/sim.ts`. Not live-hot-swappable
by design (UDP socket binds once). Files: `src/pages/blank.ts` (new),
`src/core/settings.ts` (new), `configs/settings.json` (new), `src/cli/{index,sim}.ts`.
- **Verified?** `npx tsc --noEmit` clean; `npm test` 36/36 green. Live: `launchctl
  kickstart -k` the background agent onto this code — log shows `OSC in 57131 /
  out 57130` (read from the new config) and a successful grid reconnect
  (`m1000279`); `blank` confirmed present in `PAGE_TYPES` alongside the other four.
- **Next:** unchanged — Max OSC handshake (see Current state).

### 2026-07-07 — Claude
Updated the agent roster: **Codex** replaces Gemini/Antigravity as the named backup
agent (heavy briefs + overflow lanes — see *Who does what*). Rewrote `AGENTS.md`
accordingly; `GEMINI.md` left in place. No code changes.
- **Verified?** N/A (docs only).
- **Next:** unchanged — `kickstart -k` the launchd agent, then the Max handshake
  (see Current state).

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
