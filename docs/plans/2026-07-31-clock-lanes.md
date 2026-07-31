# Clock lanes, scales, and the parked-list sweep

## Context

Following the app-clock work (`c71a78a`), this pass builds the backlog Ian greenlit: the
per-page clock choice, scales on the isometric keyboard, three small interaction wins, and
two web-UI layout fixes. Presets and the twistermapper bridge are **explicitly deferred** —
a single-page preset blob is enough when the time comes (measured: 732 bytes, fits one
datagram), and lane numbering here is the spec alignment that makes bridging later a
~20-line job.

**On the "pushback" — we did mean the same thing.** "Choose internal or external clock per
page" only has meaning if there is more than one tick stream to choose between. So: one
clock, **four lanes**, each independently internal (a divisor of the master) or external
(fed by OSC). A page picks its lane. That's the per-page choice, without a second clock
implementation. Lanes are numbered 0–3 to match twistermapper's existing
`/twister/in/clock <id>`.

---

## 1. Clock lanes — `src/core/clock.ts`

`AppClock` grows four lanes; the master timer becomes internal plumbing and **lanes are the
only thing pages ever see**.

```ts
interface LaneConfig { source: "internal" | "external"; div: number }  // div 1..64
interface LaneState extends LaneConfig { tick: number }                // own counter
interface ClockState { running: boolean; rate: number; tick: number; lanes: LaneState[] }
```

- **Internal lane**: ticks when `masterTick % div === 0`, incrementing its own counter.
  Lane 0 defaults to `{internal, div 1}` — byte-identical to today's behaviour.
- **External lane**: only advances on `/grid/in/clock/tick <lane>`.
- A manual `/grid/in/clock/tick <lane>` advances *any* lane regardless of source (keeps the
  current "step always works" rule). No arg → lane 0.
- Echo (when `clock.echo`): `/grid/out/clock/tick <lane> <n>`.

Effective rate for a page = `master rate ÷ lane.div ÷ page.div`. Document that chain once.

**Settings migration** (`src/core/settings.ts`): `clock.lanes: LaneConfig[4]`. An old file
carrying `clock.source` is read as lane 0's source — same tolerant per-field style as the
existing `loadSettings`. `clock.rate` is unchanged (master rate).

## 2. Page-facing change — `types.ts`, `pageManager.ts`

`Page.onTick(tick: number, lane: number, ctx: PageContext)` — all lanes broadcast to all
loaded pages, page filters by lane. Same model as twistermapper's StepSeq, and it keeps the
framework from having to read a page's own settings.

`PageManager.tick(lane, n)` fans out as it does now (guarded per page, focused slot
re-renders, `onFrame(..., "tick")`).

`src/pages/meadowphysics.ts`: add a `lane` SettingSpec (0–3, default 0); `onTick` returns
early unless `lane === this.lane`. Existing `div` stays as the page's own further divider.

## 3. Heartbeat — `src/core/oscRouter.ts`

`/grid/in/heartbeat` → explicit no-op that returns early. Activity is already recorded at
the top of the router, so this changes nothing functionally; it exists so a Max
`[metro 60000]` has an obviously-safe address to hit that can never trigger anything else.
~3 lines + one test.

## 4. Scales on the isometric keyboard

**New `src/util/scales.ts`** (pure, unit-tested) — one table, semitone degrees in 12-EDO:

```
chromatic · ionian · dorian · phrygian · lydian · mixolydian · aeolian · locrian
pentatonic-major · pentatonic-minor · lydian-b7 · altered · harmonic-minor
melodic-minor · whole-tone · blues
```

Helpers: `degreesOf(name)`, `isInScale(step, root, name)`, `foldedStep(degreeIndex, root, name)`.

**Three new settings on `src/pages/isometric.ts`**: `root` (0–11), `scale` (enum above),
`layout` (`chromatic | folded`).

- **`layout: chromatic`** — the step field is untouched (`stepAt` as today); the scale only
  changes brightness. Levels: out-of-scale 1, in-scale 3, root 8, held 13, unison 9.
  With `scale: chromatic` (the default) everything is in-scale, so it looks as it does now.
- **`layout: folded`** — one key right = the next note *in the scale*. The key's index is a
  degree index; the page resolves it and **still emits the chromatic step**:

  ```ts
  foldedStep(i, root, degrees) =
    root + Math.floor(i / degrees.length) * 12 + degrees[mod(i, degrees.length)]
  ```

  This is the important call: Max's existing step→pitch map keeps working untouched, and
  the two layouts are interchangeable at the patch end. `vertical` is then counted in scale
  degrees rather than semitones. Every key is in-scale, so only roots highlight.

**npo interaction (documented rule):** `scale: chromatic` keeps today's `npo`-based root
marking, so microtonal work (npo up to 48) is unaffected. Any other scale assumes 12-EDO —
`npo` is ignored for highlighting. Scales are defined in semitones; that's the premise.

## 5. Two small isometric wins

- **Unison lighting.** In `render()`, collect the emitted step of every held cell; any other
  cell resolving to the same step lights at level 9. Works in both layouts (folded mode
  repeats steps wherever the geometry wraps). ~10 lines.
- **Double-tap shift 2 = latched sustain.** Isometric's own control key already routes
  through `ctx.setShift(2, …)`. Track `lastTapAt`: a second press within ~350 ms latches
  sustain on (release no longer clears it); the next press unlatches. Momentary behaviour is
  unchanged for single taps. The `ShiftInput` 10 ms lockout is far below a human double-tap,
  so it doesn't interfere. `onBlur` already drops both shifts — that clears the latch too.
  Precedent to copy: `twistermapper/src/pages/stepSeq.ts` (`lastShiftTapAt`).

## 6. Web UI — `web/index.html`

- **Click-drag tempo.** Pointer-drag on the transport's rate field adjusts the master rate
  (vertical delta, fine-grained with shift held). Throttle the outbound
  `/grid/in/settings/clock/rate` to ~20/s; the settings store already debounces the disk
  write.
- **Page settings move to the bottom**, under the grid in `.left`, for the real estate.
  App settings stay in the right column where they are.
- **Lanes UI** in the app-settings panel: four compact rows (source select + div number),
  each sending `/grid/in/settings/clock/lanes/<i>/{source,div}`. Transport strip keeps
  run/stop, the draggable rate, the tick pulse, and a `step` chip targeting lane 0.

## Files

New: `src/util/scales.ts`, `test/scales.test.ts`.
Changed: `src/core/{clock,types,pageManager,oscRouter,settings,appRuntime}.ts`,
`src/pages/{meadowphysics,isometric}.ts`, `web/index.html`, `configs/settings.json`,
`docs/PAGE_PROTOCOL.md` (§6 gains lanes + the `onTick` signature), `CLAUDE.md`.
Tests extended: `clock`, `pageManager`, `oscRouter`, `meadowphysics`, `isometric`.

## Verification

**Automated** (`npx tsc --noEmit && npm test` — 124 green today):
- `clock`: per-lane counters and divisors; an external lane never self-ticks while the
  master runs; a manual tick advances any lane; `clock.source` in an old settings file
  migrates to lane 0.
- `scales`: every table entry's degree count (7 modes, 5 pentatonics, 6 blues, …), degrees
  strictly ascending and inside 0–11; `foldedStep` crosses octaves correctly at the wrap;
  `isInScale` respects the root offset.
- `isometric`: chromatic layout emits the same steps as today (regression guard); folded
  layout emits chromatic steps, not degree indices; unison set; double-tap latch on/off.
- `meadowphysics`: only its own lane advances it.
- `oscRouter`: `/grid/in/clock/tick <lane>`; `/grid/in/heartbeat` is inert but counts as
  activity.

**By hand (sim, no hardware):** bootout the agent, `npm run sim -- --null`, then at
http://localhost:57191 — set lane 1 to `external ÷1`, put meadowphysics on lane 1, run the
transport and confirm it does *not* advance; step it with `/grid/in/clock/tick 1`. Switch
isometric to `pentatonic-major` + `folded` and check the step readout crosses octaves.
Drag the tempo field.

**Hardware (yours — I can't verify):** scale highlighting legibility at these levels, the
folded layout under the hands, and whether double-tap sustain feels right at 350 ms.

## Deferred (not this pass)

- **Presets.** Single-page blob via `serialize()` ⇄ `restore()`, one datagram. ~1 line out,
  ~60 lines in, plus a named store ported from twistermapper. Do it when it's wanted.
- **twistermapper bridge.** Lane numbering here matches `/twister/in/clock <id>`, so it's a
  send target plus a port toggle whenever you want it — nothing structural.
