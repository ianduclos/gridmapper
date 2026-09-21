# gridmapper

> **Multi-session / multi-agent:** read `HANDOFF.md` first — current state, session
> log, and the handoff protocol shared with Antigravity/Gemini. Update it at session
> end. This file (CLAUDE.md) is the durable architecture + gotchas reference.

A headless Node.js / TypeScript "brain" for the **monome grid** (target: grid 128,
16×8, varibright). It decouples key input from LED feedback, drives the grid through
**serialosc**, and speaks **2-way OSC** to Max so a patch can configure the interface
and exchange values live. No GUI required (an optional web visualizer exists for
hardware-free development).

This is the sibling of `../twistermapper` (the MIDI Fighter Twister version). The
architecture is deliberately the same; the **driver** and the **page semantics** are
what differ. If you know twistermapper, you know this — read its `src/Architecture.md`
for the shared philosophy.

## The core idea (same seam as twistermapper)

- **Only the driver knows the wire.** Everything above `io/serialoscDriver.ts` works
  in human-readable values: `(x, y)` cell coordinates and LED intensity `0..15`.
- **One render loop is the single output path.** Pages keep a desired `LedFrame`
  up to date; a fixed-rate loop diffs (reconciles) and pushes only what changed.
- **Pages are hot-swappable prototypes** (8 slots, `a`..`h`) with a clean lifecycle.
  Only the focused page receives key events.
- **OSC is the app boundary.** Page/value changes go out as OSC; Max can send OSC
  back to configure slots and set values (the handshake).

## serialosc — how we reach the grid

The grid does **not** speak OSC on the wire; it's a USB/FTDI serial device.
`serialoscd` (a background daemon — `brew install serialosc`, already installed:
v1.4.5) bridges serial ↔ OSC. It runs:
1. a **discovery service** on fixed UDP port **12002**, and
2. one **OSC server per connected device**, on its own UDP port.

We get OSC for free — no binary protocol parsing, none of the twister's MIDI
rate-limit gymnastics. The one new wrinkle is a **discovery handshake**, done in
`connectGrid()`:

1. **Discover** — send `/serialosc/list <host> <port>` to **12002**; serialosc
   replies `/serialosc/device <id> <type> <devicePort>` per grid.
2. **Route** — to the device port, send `/sys/host <host>`, `/sys/port <ourPort>`,
   `/sys/prefix /monome`, then `/sys/info`.
3. **Size** — the device replies `/sys/size <w> <h>`, which completes the handshake.
4. **Run**:
   - **Input:**  `/<prefix>/grid/key x y s`  (s = 1 press / 0 release)
   - **Output:** `/<prefix>/grid/led/level/set x y l` (l = 0..15),
     `/<prefix>/grid/led/level/all l`,
     `/<prefix>/grid/led/level/map xOff yOff <64 levels>` (an 8×8 quadrant).

> Two namespaces, don't confuse them: the **device prefix** `/monome/...` talks to
> serialosc; the **app namespace** `/grid/...` talks to Max (below).

Hotplug: `/serialosc/notify` gives one-shot add/remove events (re-subscribe each
time). Not wired yet — see Roadmap.

## Data model (`src/core/types.ts`)

- `GridSize { width, height }` — 128 = `{16, 8}`.
- `KeyEvent { x, y, s }`.
- `LedFrame` = flat row-major `Uint8Array`, length `w*h`, each cell `0..15`.
  Index with `ledIndex(size, x, y) = y*width + x`. (Flat + typed so the reconciler
  diffs cheaply against a cached "last sent" frame.)
- `Page` / `PageContext` — lifecycle `init/onFocus/onBlur/onKey/onOsc/render/dispose`,
  plus optional `serialize()` for preset capture (structural config only, never
  transient runtime state). Modifiers are **app-defined** — the grid has no dedicated
  shift/side buttons, so a page may treat a held key as a modifier.

Difference from twistermapper to keep in mind: the grid LED model is a **flat 2D
field of intensity 0..15** — no RGB, no rings, no pulse precedence. Simpler per cell;
the diff/reconcile idea still pays off (don't blast the whole grid every frame).

## OSC vocabulary (app ↔ Max) — planned, mirrors twistermapper

Namespace `/grid/out/...` (to Max) and `/grid/in/...` (from Max). Shape mirrors the
twister's `/twister/...` vocabulary:
> **Ports:** gridmapper's app OSC defaults to **listen 57131 / send 57130** (the
> `5713x` block). twistermapper runs constantly and holds `57120/57121`, and its web
> UI owns `57190`, so gridmapper's sim UI uses **57191**. Don't collide.

- `/grid/out/hello` on transport ready.
- `/grid/out/focus/page <a..h>`; `/grid/out/page/<slot>/type <name>`.
- Page value broadcasts, e.g. `/grid/out/page/<slot>/...`.
- **Per-page settings (implemented).** A page declares `SettingSpec[]` (one `SPECS`
  const = source of truth). Out: `/grid/out/page/<slot>/settings <json>` (echoed on
  init/focus/change) and, sim→web on connect, `/grid/out/pagespecs <json>`
  (pageName→specs). In: `/grid/in/page/<slot>/setting/<key> <value>` (slot = `a..h`
  from Max or `0..7` from the web panel); the page's `onOsc` also tolerates the terse
  `/<key> <value>` and value-in-path `/<key>/<value>`, plus `/settings/get`. The page
  clamps via its specs, stores, and re-echoes. `serialize()` returns the same values.
  **Echo discipline:** a settings write that arrived over **OSC** does NOT get its
  `/settings` reply on the OSC wire — a patch that both sends and listens would feed back
  on itself. The web UI still sees it (it isn't the sender), and a write FROM the web UI
  still reaches Max. `createOscRouter` takes an `origin: "osc" | "ui"` and the host owns
  the mute (`withOscEchoSuppressed` in both entry points). Only the canonical
  `/setting/<key>` form (plus `/setting/<key>/<value>` and the plural) is treated this
  way — `/settings/get` always replies, and so does the terse `/<key> <value>` form.
  Note the asymmetry with twistermapper, where the suppressed route is a value set.
- **Shifts (implemented, receive-only).** Two app-defined shift buttons live OUTSIDE the
  pages. In: `/grid/in/shift <which:1|2> <state:1|0>`. The grid does **not** echo shift —
  it only alters internal behavior. Debounce = **leading-edge lockout** (`core/shiftInput.ts`,
  `ShiftInput`): first edge takes effect instantly, then ANY edge is ignored for ~10ms,
  swallowing alternating contact chatter without adding press latency. (NB: a same-state
  filter does NOT debounce — chatter is alternating, so it slips through; that was the
  first, broken attempt.) Surfaced to pages as `ctx.modifiers.shift1` / `shift2` (live
  getters over the one `ShiftInput`); "both held" is the page's call (potential third
  shift). Wired in both the sim and the daemon; a future LOCAL source calls `shift.set()`
  for identical behavior.
- `/grid/in/focus/page <a..h>`; `/grid/in/slot/<a..h>/page <PageName>` (rebuilds ONE
  slot; the other seven keep their live state) → `/grid/out/slots <8 names>`.
- **Liveness (implemented).** `/grid/in/ping <token>` → `/grid/out/pong <token>`, echoed
  verbatim. gridmapper announces `/grid/out/hello` + a snapshot once at ITS boot and
  nothing after, so a patch opened later must initiate. Distinct from the inert
  `/grid/in/heartbeat` (below) — that one deliberately answers nothing.
- **Presets (implemented).** `core/systemConfig.ts` (sanitize → page factory, shared by
  boot and live apply, over `pages/registry.ts` — an unknown page name degrades to
  `DEFAULT_PAGE` instead of throwing) + `core/presetStore.ts` (one JSON file per preset
  under `configs/presets/`, names `[A-Za-z0-9 _-]{1,48}`, write+rename like
  `settings.ts`). In: `/grid/in/preset/{list,load,delete} [name]`. Out:
  `/grid/out/preset/list <names…>` · `/grid/out/preset/active <name|"">`.
  **A preset is PAGES: slot→page plus each page's own state**, captured by `serialize()`
  and replayed by `restore()`. Deliberately NOT in it: focus, the transport, the idle
  policy (those are `configs/settings.json`, shared across presets), and anything
  transient — loading a preset never makes a sound.
  **`/grid/in/preset/save <name>` is WEB-PANEL ONLY** — the one route where `origin`
  decides. Capturing the live machine is how a preset gets made (the presets box in the
  web UI: list, load, save/overwrite, arm-then-confirm delete), but an OSC-borne save is
  dropped on the floor: a stray message from a patch must not silently replace the preset
  you were about to recall. Hand-writing a file works too — the shape is `SystemConfig`
  and every field is optional.
  `configs/slots.json` is the LIVE layout + an `activePreset` marker, written on preset
  load and on slot change, and booted into next start (no file → every slot
  `DEFAULT_PAGE`, as before). A slot change clears the marker and emits
  `/grid/out/preset/active ""`.
- **`/grid/out/preset/active` is the boot handshake's COMPLETION SIGNAL** — emitted only
  after every slot's page is built and has announced. `""` = no preset active (a failed
  load, or a layout edited since). See `docs/max-handshake.md` for the phase-by-phase
  contract a Max patch follows.
- **Transport (implemented).** One app clock, **off at boot**, ticking every loaded page
  (not just the focused one) — see `core/clock.ts`.
  In: `/grid/in/clock/run <0|1>` · `/grid/in/clock/tick [lane]` (one manual step; drives an
  external lane, and works as a nudge on an internal one) · `/grid/in/clock/reset` ·
  `/grid/in/clock/get`. Out: `/grid/out/clock <json>` `{running,rate,tick,lanes}` on every
  change + on connect; `/grid/out/clock/tick <lane> <n>` per tick, only while `clock.echo`
  is on (default off). Lanes are configured as persisted settings:
  `/grid/in/settings/clock/lanes/<0..3>/{source,div}`. Pages see it as `ctx.clock` +
  `onTick(tick, lane)`/`onClock` (docs/PAGE_PROTOCOL.md §6).
- **Idle / power (implemented).** The render loop **stops entirely** after inactivity —
  default 4h with a grid attached, 15min without (`core/idleManager.ts`). Activity means
  INPUT (key · any `/grid/in/*` · web connect · device attach · a running clock's ticks),
  deliberately not "the frame changed", or a screensaver on an unplugged grid would spin
  at 58fps forever. Sleeping never blanks the grid (the device holds its own LEDs) and
  waking forces a full repaint. While asleep the discovery watcher backs off 2s → 30s.
  In: `/grid/in/wake` · `/grid/in/sleep` · `/grid/in/heartbeat` (deliberately inert — the
  router's activity stamp already did the work, so a Max `[metro]` has an address it can
  hit forever that can never trigger anything else). Out: `/grid/out/idle <json>`.
- **Live settings (implemented).** `/grid/in/settings/<section>/<key> <value>` — clamped,
  applied to the running clock/idle, and persisted to `configs/settings.json` (debounced,
  atomic). Out: `/grid/out/settings <json>`; `/grid/in/settings/get` re-emits. `clock.*`
  and `idle.*` are live; `osc.*` stays **boot-only** (the UDP socket binds once). The
  clock's RUN state is deliberately not persisted — it always boots stopped.
- The **handshake (implemented)**: at boot the daemon emits `/grid/out/hello` + a
  snapshot (clock, idle, settings, preset list + active); on web connect the sim sends
  the same plus focus, slots, pagetypes/specs and each slot's settings. A patch opened
  later gets none of that and drives the sequence itself: ping → preset load → wait for
  `/grid/out/preset/active` → push settings. Written up in `docs/max-handshake.md`
  (mirrors `../twistermapper/docs/max-handshake.md`).

The web visualizer uses the same `{ path, args }` JSON shape over WebSocket, so the
UI and OSC share one vocabulary (see `io/gridServer.ts`).

## Rate limiting / render loop — planned

serialoscd is far more forgiving than the twister firmware, so we don't need the
64-msgs/5ms gymnastics. What still matters: **batch with `led/level/map`** (one
message repaints an 8×8 quadrant — the 128 has two quadrants) rather than spraying
64 `level/set` messages. Plan: a fixed-rate loop (default ~60fps) + a reconciler that
diffs the desired vs last-sent frame and chooses, per quadrant, `map` (many cells
changed) vs `set` (a few). Not built yet — `grid-led.ts` currently uses naive
`level/set` per cell, which is fine for probing.

## NullGrid + web sim (hardware-free dev)

`NullGrid` (in `serialoscDriver.ts`) implements the same `GridDriver` interface with
an in-memory level buffer: `injectKey()` feeds events in, `onLed()` emits LED writes
out. `src/cli/sim.ts` wires it to the web visualizer (`web/index.html`) so the whole
stack runs with no hardware. Swapping `NullGrid` → `connectGrid()` lights a real grid
unchanged. The current sim "app" is a trivial toggle surface (press a cell → its LED
flips), enough to prove the loop.

## Project layout

```
src/
  core/types.ts          grid data model + page interfaces
  core/pageManager.ts    8 page slots: focus, key routing, desired-frame ownership
  io/osc.ts              app OSC transport (to/from Max); defaults in 57131 / out 57130
  io/serialoscDriver.ts  GridDriver: connectGrid() (real) + NullGrid (sim)  [the device seam]
  io/gridServer.ts       HTTP + WS server for the web visualizer
  io/mirrorGrid.ts       GridDriver wrapper: taps LED writes so the web mirrors real HW
  io/gridConnection.ts   runtime HOTPLUG: stable MirrorGrid facade + swap-on-plug-in;
                         the serialosc gotchas live here. Used by sim AND daemon.
  core/shiftInput.ts     two shift buttons, leading-edge lockout debounce (ctx.modifiers)
  core/oscRouter.ts      the ONE control-routing dialect (key/connect/shift/focus/slot/
                         page-osc/clock/settings/presets/ping/wake), shared by sim.ts and
                         index.ts. Takes an `origin` ("osc" | "ui") — see echo discipline.
  core/systemConfig.ts   the layout as DATA: sanitize raw JSON → SystemConfig, and one
                         slot config → a page factory. Shared by boot and live preset
                         apply, so both validate identically. No I/O, no emission.
  core/presetStore.ts    configs/presets/<name>.json + configs/slots.json (the live
                         layout + activePreset marker). Atomic write+rename, safe names.
  util/restoreGuards.ts  reading an UNTRUSTED preset back: int/num/bool/intArray/
                         intMatrix/intSet/records, each taking the default to land on.
                         Every Page.restore() reads through these — it must never throw.
  core/clock.ts          AppClock — the ONE transport, in FOUR LANES (0-3). Each lane is
                         internal (a divisor of the drift-compensated master timer) or
                         external (one step per OSC message). OFF at boot. Every lane ticks
                         EVERY loaded page via PageManager.tick → Page.onTick(tick, lane);
                         a page follows one lane, which is how "internal or external clock
                         per page" works without a second clock. Lane numbering matches
                         twistermapper's /twister/in/clock <id>.
  core/idleManager.ts    stops the render loop after inactivity (0 CPU), wakes on any event
  core/appRuntime.ts     assembles clock + idle + settings ONCE for both entry points
  render/renderLoop.ts   fixed-rate clock; single output path. FRAME_FPS=58 (just under
                         the grid's 60fps serialosc redraw). Calls focused page.render() each frame.
  render/ledReconciler.ts diff vs last-sent; batch per 8×8 quadrant (map vs set)
  core/pageModule.ts     PageModule + SettingSpec — the descriptor a page file exports
  pages/registry.ts      AUTO-DISCOVERY: scans src/pages/, registers every `page` export
  pages/_template.ts     copy-me skeleton for a new page (underscore = not registered)
  pages/base.ts          BasePage — momentary: press lights a cell, release clears (default)
  pages/screensaver.ts   ScreensaverPage — full-grid animations; press = next screensaver
                         (0: per-cell triangle 0.5→1.0 Hz; 1: slow Perlin field)
  util/perlin.ts         dependency-free 3D Perlin noise (used by the Perlin screensaver)
  pages/isometric.ts     IsometricPage — isomorphic keyboard (left 13×8) as a pure
                         integer STEP FIELD: emits /grid/out/page/<slot>/note <step> <1|0>
                         (Max owns step→pitch). Settings npo · vertical · root · scale ·
                         layout · orientation, two-way over OSC. orientation transposes the
                         STEP FIELD in place — grid stays landscape, keyboard block and
                         control keys never move, only the two axes swap. standard = right
                         is +1 step, up is +vertical (home bottom-left); horizontal = DOWN
                         is +1 step, right is +vertical (home top-left) — the 90° turn
                         mirrored top-to-bottom, which is what keeps a column right worth
                         an INTERVAL (a fourth at the default vertical of 5) instead of
                         the leftward interval axis the raw turn gives. horizontal runs the
                         chromatic axis over 8 cells not 13, so unison twins are inherently
                         sparser there.
                         layout=chromatic highlights the scale;
                         layout=folded makes one key = one SCALE DEGREE but still emits a
                         chromatic step, so Max's map never changes. Unison lighting shows
                         every cell in the sounding CHORD (held + sustained, pooled across
                         ALL tracks — the display works in bare steps, never packed keys);
                         while the arp runs the note it is voicing overlays BRIGHTER, so a
                         sustained chord stays readable and you can see what a chord preset
                         would capture mid-arpeggio. Notes are tracked by STEP and
                         reconciled, so twins send ONE note-on and a note lasts until the
                         last source lets go. Col 15: row 4 = sustain TOGGLE (latching),
                         row 6 = shift 2 = sustain pedal (DOUBLE-TAP to latch), row 7 =
                         shift 1 (still unused). SUSTAIN = toggle OR pedal. Col 14 = 8
                         CHORD PRESETS storing PITCHES: armed (toggle on) a press SAVES the
                         ringing chord (saving silence clears the slot), otherwise it PLAYS
                         momentarily and keeps ringing under sustain — so latch the pedal
                         and presets stack. The two latches differ on purpose: the pedal's
                         double-tap sustains and leaves presets playable, the toggle
                         sustains and arms them for saving. Under any sustain, pressing an
                         already-ringing note SILENCES it everywhere (subtract a note from
                         a chord); a note another finger holds is exempt.
                         Out: /grid/out/page/<slot>/chords <json> (dense array, null=empty).
                         Col 15 rows 0-3 = 4 PATTERN RECORDERS (util/patternRecorder.ts):
                         free-time loopers, one key cycling empty→rec→play→stop, shift 1 +
                         press clears, 60s auto-close. Recording starts at the FIRST NOTE
                         (arming alone doesn't start the clock); STOP PAUSES and keeps the
                         playhead — only clear rewinds. Loop length = what you played;
                         quant1-4 settings round the LENGTH onto `lane` clock ticks only.
                         Notes flow keys+presets → LIVE → [record tap] → +playback → INTENT
                         → [sustain] → reconcile, so a pattern holds what you PLAYED while
                         the pedal still smears playback. Pressing an already-sounding note
                         RETRIGGERS (explicit off+on, MIDI-safe) unless it is ringing purely
                         from sustain, where the press subtracts it.
                         Out: /grid/out/page/<slot>/patterns <json>.
                         TAXONOMY (cols): 0-12 KEYBOARD · 13 CHORDS · 14 rows0-3 TRACKS +
                         rows4-7 ARPS · 15 rows0-3 LOOPERS, row4 SUSTAIN TOGGLE, row5
                         PEDAL (DEBOUNCED — leading-edge lockout + a 60ms floor on the double
                         tap, else contact bounce latches it and it feels stuck), row6
                         SHIFT 2, row7 SHIFT 1. The pedal is NO LONGER shift 2
                         (it owns its state), so /grid/in/shift 2 does not sustain and
                         nothing else does either — sustain is grid-only by choice.
                         TRACKS = 4 outputs (instruments). Notes now carry one:
                         /grid/out/page/<slot>/note <step> <1|0> <track>. Press selects;
                         SHIFT+press LATCHES routing-edit (release shift; LOOPER keys then
                         toggle "feeds this track" and do NOT record/clear; press the track
                         to exit). Unrouted looper follows the active track, routing pins
                         it, and one looper may feed several tracks. SHIFT + all four
                         tracks at once wipes all routes. A note is keyed (TRACK, STEP) and
                         its track is stamped AT NOTE START, so switching tracks lands on
                         the next note-on, never re-attacking what is ringing.
                         Out: /grid/out/page/<slot>/tracks <json> {selected, routes}.
                         SELECTION (not one active track): plain press selects one, SHIFT 2
                         + press adds/drops, never empty. Live notes AND unrouted loopers
                         fan out to every selected track.
                         ARPS (col 14 rows 4-7: ascending/descending/palindrome/urn, one at
                         a time, press the lit one to stop) sit AFTER sustain but GATE only
                         notes from your HANDS that sustain isn't already holding. A
                         SUSTAINED note wins over the arp: the pad keeps ringing and the arp
                         ACCENTS within it (off/on pair), so toggling the arp over a held
                         chord is silent. Looper playback is never gated (a loop keeps its
                         rhythm), and the pool spans ALL tracks — selection deliberately does
                         not scope it, or switching instrument mid-arpeggio would empty the
                         pool and stop the arp.
                         The record tap is upstream, so loopers capture what you PLAYED. The
                         arp never plays the same note twice in a row, so growing a chord
                         doesn't replay the note underneath.
                         Timing is HYBRID: the `lane` clock ÷ arpDiv while the transport
                         runs, free arpRate ms while it is stopped (expect a tempo jump on
                         start/stop). First note of a new chord fires immediately.
                         CHORDS also: re-press the slot you just saved (same chord still
                         ringing) to RELEASE it; SHIFT+press clears the slot.
  pages/iso-hot.ts       HOTELIER (concert) FORK of isometric — free to diverge. Keyboard at
                         cols 1-12 (home col 1); col 0 rows 0-5 = page selector, row 7 =
                         TRANSPOSER toggle (bottom row becomes −7..+4, col 8 = 0; stays in
                         force when hidden; not saved). A note takes the transposition AT
                         NOTE START. Chords move RELATIVE to the transposition they were saved
                         at (chordTranspose). LOOPS store notes UNtransposed and record
                         transposer moves as a parallel control lane (PatternEvent.ctl);
                         playback drives the LIVE transposer (latest move wins, a hand press
                         holds until the next move), which shifts every loop incl. its own
                         notes. Opt-outs: transposeChords / transposeLoops. Chord save/clear calls
                         ctx.persist → slots.json + a chords-only merge into the active preset.
  pages/blank-hot.ts     blank + the selector (placeholder for unbuilt hotelier pages)
  util/pageSelector.ts   col 0 rows 0-5 → ctx.focus(slot a-f). Rows 6-7 of col 0 are
                         PER-PAGE assignable: the selector neither consumes nor draws them.
                         Pages move focus via ctx.focus and save stored content via
                         ctx.persist (PageManager's PageHooks; both hosts wire them).
  util/arpeggiator.ts    arpSequence (pure) + Arpeggiator cursor; urn takes an injected RNG
  util/scales.ts         16 scales as 12-EDO degree sets + isInScale/foldedStep (pure).
                         DEFAULT_SCALE = ionian (chromatic is the identity, not the default)
  util/patternRecorder.ts free-time note looper: eventsInWindow/quantiseLength (pure) +
                         PatternRecorder state machine. Used by isometric; owns the ONE
                         deliberate setInterval in the codebase (see PAGE_PROTOCOL §6).
  pages/basic.ts         BasicGridPage — toggle surface ↔ OSC (registered as "toggle")
  pages/meadowphysics.ts MeadowphysicsPage — faithful port of tehn's iii `grid/mp.lua`:
                         8 cascading counters, rules (inc/dec/min/max/random/pole/stop),
                         trig/tog/reset target matrices, 3 modes (main / hold col 0 =
                         config / +col 1 = rules). Emits /grid/out/page/<slot>/note
                         <row 0..7> <1|0>; Max owns row→pitch. Driven by the APP CLOCK
                         (onTick), so it runs in every slot, focused or not; `lane` picks
                         which clock lane to follow and `div` divides it down per page.
docs/PAGE_PROTOCOL.md    HOW TO WRITE A PAGE — the authoring contract (person or LLM)
  cli/index.ts           the daemon: grid + pages + loop + OSC  (npm run dev [-- --null])
  cli/grid-list.ts       discovery probe                          (npm run grid:list)
  cli/grid-log.ts        connect + log keys + echo LED  [hardware] (npm run grid:log)
  cli/grid-led.ts        LED sweep animation            [hardware] (npm run grid:led)
  cli/sim.ts             live mirror: real grid (or NullGrid) ↔ web, momentary (npm run sim [-- --null])
  util/scale.ts          clamp / toLevel(0..15) / toFixedN
test/ledReconciler.test.ts  quadrant batching / diff / full-paint unit tests
web/index.html           16×8 visualizer (click = key, renders LED frames)
```

## Commands

- `npm run sim` — live app + web mirror at http://localhost:57191. Starts on a
  NullGrid and **hot-connects** to the real grid the moment serialosc reports one
  (a ~2s poll watcher), immediately pushing the current screen; falls back to NullGrid
  if it's unplugged. The header device indicator is **clickable to force a connect**.
  `-- --null` forces the sim grid (no auto-connect). NB: while connected it claims the
  grid's key routing from serialosc, so Max won't get keys meanwhile.
- `npm run grid:list` — what does serialosc see right now?
- `npm run grid:log` — plug in a grid: press buttons, watch keys + LED echo.
- `npm run grid:led` — plug in a grid: run an LED sweep.
- `npm run build` / `npm test` — tsc / vitest.

**Background agent (always-on):** a launchd LaunchAgent `com.ianduclos.gridmapper` runs
the **sim** in the background (OSC ↔ Max + hotplug + web UI on 57191, served but never
auto-opened). Template + management commands in `deploy/`. It holds OSC 57131 and the
grid, so `bootout` it before a manual `npm run sim`. (Mirrors twistermapper's agent.)

## Environment

- Node + TypeScript, NodeNext ESM (note the `.js` import extensions in source).
- macOS; `serialoscd` must be running (`pgrep -fl serialosc`).
- A grid is **not** required for development (sim) but is for `grid:log` / `grid:led`.

## Status & Roadmap

**Built & tested (hardware-verified on monome 128):**
- serialosc discovery, the `connectGrid()` handshake, key/LED I/O (`GridDriver`),
  `NullGrid`, the web visualizer, and the three CLI probes.
- `pageManager` + render loop + quadrant-aware `ledReconciler` (5 unit tests pass:
  per-cell `set` vs quadrant `map`, no-op on unchanged, forced full paint).
- `cli/index.ts` daemon, plus the `cli/sim.ts` live app (real grid or NullGrid, web
  mirror via `MirrorGrid`, **8 page slots a–h** with a slot/page selector in the UI).
- Pages: `BasePage` (momentary, default in all 8 slots), `ScreensaverPage` (full-grid
  animations; press any key → next). Screensavers: (0) per-cell **triangle** 0→15→0,
  0.5 Hz at cell 0 ramping to 1.0 Hz at the last cell; (1) slow evolving **Perlin**
  field. `BasicGridPage` (toggle ↔ OSC) remains as an alternate. `MeadowphysicsPage`
  (the mp.lua port — see the layout above; 40 unit tests, not yet hardware-verified).
- Web UI: slot chips (a–h) + page **dropdown** (populated from auto-discovered page
  types); a **transport strip** (run/stop · step · rate · source · tick pulse); a **presets box** (list, load, save/overwrite, arm-then-confirm delete — the only surface that can CREATE a preset); a
  **page-settings panel under the grid** and a right-hand **app-settings panel** (clock
  rate + echo, the four lane rows, sleep timeouts, caffeinate, live awake/asleep readout,
  read-only OSC ports). The rate field is drag-to-change (shift = fine). The UI is a
  pure OSC client — every control is a `/grid/in/...` message Max could send instead.

**Page authoring (`docs/PAGE_PROTOCOL.md`):** a page exports `page: PageModule`
(name + `create()` + optional `settings`) and is auto-discovered — drop a file in
`src/pages/`, it appears everywhere, no list to edit. Authors write only `onKey` +
`render()` (frame of 0..15); the framework owns rate-limiting, quadrant batching,
diffing, routing, and timing. **Per-frame render model:** the loop calls the focused
page's `render()` every frame, so pages animate by reading a clock — no timers, no
`setDirty`. Visual logic lives in pure functions (unit-tested). `_`-prefixed files
are skipped by the loader. **Sequencers take musical time from the app clock**
(`onTick`/`onClock`), never from frames — that's what lets them run in an unfocused slot.
353 unit tests pass.

**Control routing (implemented).** `core/oscRouter.ts` is the single `/grid/in/...`
dispatcher — key, connect, shift, focus/page, slot/page (load), and page-scoped OSC —
used by both `cli/sim.ts` (web + Max) and `cli/index.ts` (the daemon), so the daemon no
longer lacks slot/page assignment the way it used to when the two entry points
duplicated this logic by hand.

**Known polish (parked):** web-UI button "bounce" = `transform: translateY(.5px)` on
`.cell:active` in `web/index.html` — to be removed system-wide (UI layer, not pages).
- Verified live on hardware: Base momentary lights/clears; switching a slot to
  Screensaver animates the physical grid (≈30fps through the quadrant reconciler);
  device id + slot/page state reflected in the web UI.
- Note: `PageManager.load()` calls `onFocus()` when loading into the focused slot, so
  focus-driven timers (animations) start on a live page swap. (Pages announce from both
  `init()` and `onFocus()`, so a load into the focused slot announces twice — harmless,
  and `docs/max-handshake.md` tells a patch to expect it.)
- Max boot handshake: `/grid/in/ping` → `/grid/out/pong`, the preset layer
  (`core/systemConfig.ts` + `core/presetStore.ts`, `/grid/in/preset/{list,load,delete}`),
  `/grid/out/preset/active` as the completion signal, and OSC-echo suppression on settings
  writes, plus the web UI's presets box (save/overwrite/load/delete; save is UI-only).
  **`serialize()` ↔ `restore()` round-trips**: a hand-authored preset brings
  isometric back with its settings, chords, recorded loops and track routing, and
  meadowphysics with its whole patch — verified end-to-end over real UDP against a
  NullGrid daemon. **Not yet exercised from a Max patch on hardware.**

**Not yet built (continuing toward the full multimodal interface):**
- More page prototypes (grid equivalents of StepSeq / XY / etc.) + a Main-style
  overlay for page focus.
- `restore()` on the other pages. Only `isometric` and `meadowphysics` carry state worth
  keeping; `basic` (its toggle grid) is the obvious next one if it ever matters.
- Single-instance guard. (**Hotplug now lives in `io/gridConnection.ts` and is used by
  BOTH the sim and the daemon** — start on a NullGrid, swap in the real grid via
  `MirrorGrid` when serialosc reports one, poll discovery **only while disconnected**,
  never auto-detach; `reconnect()` forces a fresh handshake for genuine unplug recovery
  (sim's indicator click / `/grid/in/connect`). The daemon no longer connects-or-exits.)

> **Two serialosc gotchas — both about not disturbing a live connection (cost ~2h):**
> 1. Querying discovery (`/serialosc/list`) **while connected breaks that device's key
>    routing** — presses silently stop, LED output keeps working. Poll discovery only
>    while disconnected. **This makes the debugging instinct exactly backwards:
>    `npm run grid:list` is the natural "is the grid there?" reflex and it BREAKS the
>    thing you are testing.** Debug a live agent in this order, safest first:
>      - `ls /dev/cu.* | grep usbserial` — does the OS see it at all? Never touches serialosc.
>      - `tail -f ~/Library/Logs/gridmapper.log` — the agent auto-reconnects within ~2s.
>      - the web UI's `/grid/out/device` — the app's own view.
>    Only run `grid:list` / `grid:led` / `grid:log` once the agent reports DISCONNECTED, or
>    after `launchctl bootout` frees the device. If routing is already broken, an explicit
>    `/grid/in/connect` re-handshakes; a full agent restart is the reliable clean slate.
> 2. On a USB/cable glitch serialosc pushes `/sys/disconnect` then `/sys/connect` but
>    **keeps the same device server + routing — keys resume on their own.** Do NOT tear
>    down and reconnect on `/sys/disconnect`; reconnecting mid-glitch is what loses key
>    routing. Hold the connection; only reconnect on explicit user action.
>    **But the grid clears its own LEDs on that bounce** while the reconciler's last-sent
>    cache still believes every cell is correct — so it would sit dark until something
>    happened to change. The driver surfaces `/sys/connect` as `onReconnect`, and
>    `GridConnection` turns that into a full repaint (never a re-handshake).
- App-defined modifiers (held-key-as-shift) surfaced through `PageContext.modifiers`.

> Don't prematurely extract a shared core lib with twistermapper — only two data
> points. Port the skeleton here, let a third implementation reveal what's truly shared.
