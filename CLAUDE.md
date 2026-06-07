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
- `/grid/in/focus/page <a..h>`; `/grid/in/slot/<a..h>/page <PageName>`;
  preset save/load/list/delete; `/grid/in/settings/...`.
- The **handshake**: on connect the daemon emits a state snapshot (focus, each
  slot's page type, presets, settings); Max sends a SystemConfig to set the
  interface per patch. (This is the twister's `systemConfig`/`presetStore` channel,
  ported.)

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
                         (Max owns step→pitch). Live settings npo + vertical, two-way over
                         OSC. Right-edge control keys are LOCAL shifts via ctx.setShift
                         (bottom-right = shift 1; above it = shift 2 = sustain pedal).
  pages/basic.ts         BasicGridPage — toggle surface ↔ OSC (registered as "toggle")
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
  field. `BasicGridPage` (toggle ↔ OSC) remains as an alternate. 11 unit tests pass.
- Web UI: slot chips (a–h) + page **dropdown** (populated from auto-discovered page
  types); a right-hand **page-settings panel** is reserved (placeholder).

**Page authoring (`docs/PAGE_PROTOCOL.md`):** a page exports `page: PageModule`
(name + `create()` + optional `settings`) and is auto-discovered — drop a file in
`src/pages/`, it appears everywhere, no list to edit. Authors write only `onKey` +
`render()` (frame of 0..15); the framework owns rate-limiting, quadrant batching,
diffing, routing, and timing. **Per-frame render model:** the loop calls the focused
page's `render()` every frame, so pages animate by reading a clock — no timers, no
`setDirty`. Visual logic lives in pure functions (unit-tested). `_`-prefixed files
are skipped by the loader. 16 unit tests pass.

**Known polish (parked):** web-UI button "bounce" = `transform: translateY(.5px)` on
`.cell:active` in `web/index.html` — to be removed system-wide (UI layer, not pages).
- Verified live on hardware: Base momentary lights/clears; switching a slot to
  Screensaver animates the physical grid (≈30fps through the quadrant reconciler);
  device id + slot/page state reflected in the web UI.
- Note: `PageManager.load()` calls `onFocus()` when loading into the focused slot, so
  focus-driven timers (animations) start on a live page swap.

**Not yet built (continuing toward the full multimodal interface):**
- More page prototypes (grid equivalents of StepSeq / XY / etc.) + a Main-style
  overlay for page focus.
- `systemConfig` + `presetStore` and the full `/grid/in` ↔ `/grid/out` Max handshake
  (state snapshot on connect, per-patch interface config).
- Single-instance guard. (Hotplug is done in the **sim**: `MirrorGrid` makes the
  device swappable at runtime; the watcher polls serialosc **only while disconnected**
  to catch a plug-in, and pushes the current screen on connect. It never auto-detaches;
  the indicator click forces a fresh handshake for genuine unplug recovery. The
  **daemon** still does single connect-or-exit.)

> **Two serialosc gotchas — both about not disturbing a live connection (cost ~2h):**
> 1. Querying discovery (`/serialosc/list`) **while connected breaks that device's key
>    routing** — presses silently stop, LED output keeps working. Poll discovery only
>    while disconnected.
> 2. On a USB/cable glitch serialosc pushes `/sys/disconnect` then `/sys/connect` but
>    **keeps the same device server + routing — keys resume on their own.** Do NOT tear
>    down and reconnect on `/sys/disconnect`; reconnecting mid-glitch is what loses key
>    routing. Hold the connection; only reconnect on explicit user action.
- App-defined modifiers (held-key-as-shift) surfaced through `PageContext.modifiers`.

> Don't prematurely extract a shared core lib with twistermapper — only two data
> points. Port the skeleton here, let a third implementation reveal what's truly shared.
