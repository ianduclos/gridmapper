# Cells score editor: design (agreed 2026-09-21/22, plan 2026-09-27, not built)

A live mini-score in the web panel for cells-hot, where you can edit your own variants
of cells. These decisions were settled with Ian in a design session. Build from this doc.

## Decisions

1. **Edits make your own variant.** Editing a sourced cell creates a copy, e.g.
   "Cycles 5–8 · mine", saved in the page state and therefore in the preset. The
   sourced original is never changed, and a variant can always be reverted to its
   source. Variants carry a provenance label of `edited from <cell id>` so the
   source-derived and composed/inferred honesty labels survive.
2. **First version edits rhythm: onsets on/off and length.** Hits snap to the
   world's own pulse grid (`atPulse` steps of the source pulse; 3 or 4 per beat, see
   `pulsesPerBeat`).
3. **Pitch is a separate loop per row, as in Kria.** Each row has a rhythm cell (when)
   and a pitch loop (which step). Each hit takes the next step of the pitch loop, so
   loops of different lengths drift against each other. The pitch loop **belongs to the
   row**: switching the row's rhythm cell keeps the melody cycling. Until edited, a row's
   pitch loop is the selected cell's own source pitch sequence (its hits' `pitchStep`s
   in order), so unedited playback is unchanged from today.
4. **Web only for now.** The grid keeps its current role. A grid edit mode, with the
   phase bar as steps and paging for long cells, can come later.
5. **Microtiming has two layers.** Following Polak (2010) and Polak & London (2014), Mande
   feel is systematic per metric position, not random per hit:
   - *Position feel*: the world's measured template, already baked into fractional
     `atPulse` values (e.g. Manjanin 27:33:40). Snapping keeps it: a hit placed at a
     grid position inherits that position's measured offset.
   - *Hit tilt*: a per-hit slider overlay in the score that pushes one hit early or late
     on top of the template (Keil's "participatory discrepancies"). It is bounded so a hit
     never crosses or reaches its neighbours (proposal: at most ±40% of the gap to the
     nearer neighbour) and is stored as a fraction of a pulse on the variant's event.

## Data sketch

- A variant is a `Cell` (`src/data/cells-hot-worlds.ts`) with `events[].tilt?: number`
  (in pulses), stored under `serialize().variants[row][choice]`. It replaces that
  choice while present.
- A row's pitch loop is `serialize().pitchLoops[row]?: number[]`, in the world's
  `pitchStep` degree space (`eventHz` maps `pitchStep / degreeCount` to a rank). An
  absent loop means "use the cell's own sequence".
- The scheduler (`events()` in `pages/cells-hot.ts`) needs a per-row hit counter,
  reset on Play, to index the pitch loop. Onset = `(atPulse + tilt) * sourceScale`.
  Event IDs stay stable per revision and onset, as today.

## Decided 2026-09-27

6. **Pitch-loop entries are a tuning step OR a pinned Hz, per entry.** A step follows
   the tuning; a pinned Hz ignores it (`rootMultiplier` still applies). The strip shows
   every entry's Hz either way, and says which entries are pinned. Horn-relay has no
   degree space (`degreeCount: 0`), so its entries can only be Hz.
7. **An edit to a playing cell lands at the playback-buffer cutoff** (~100 ms), through
   the existing `replace` path, like a cell switch.
8. **Variant lengths are divisors of the world cycle.** The world cycle
   (`worldCyclePulses`, the LCM of every source cell) is what the gesture loopers lock
   to, so a variant may only take a length that divides it (horn: 3, 6, 12, 16, 24, 48...
   in source pulses). Realignment and loop locking stay exact. The cycle is always
   computed from the sourced cells, never from variants.
9. **Pitch loops live per world + row.** Switching world swaps to that world's six loops,
   so a step always means what that world means. Ian wants to try **per row, across
   worlds** later, so the storage is keyed to allow it (see the data shapes below).
10. **Edits persist like everything else in cells now:** live in `configs/slots.json`,
    captured into a preset only by a web-panel save. Nothing merges automatically.

## Build plan

Each phase ships on its own, with tests, and leaves playback unchanged until someone
edits.

### Phase 1: live score view (web, display only)

- Six strips, one per row: the selected cell's hits as blocks on its source-pulse grid
  (onset = `atPulse`, width = `durationPulses`), beat lines every `pulsesPerBeat`, the cell
  length marked against the world cycle.
- **Playhead in the browser, not over OSC.** The view packet gains
  `phase: {pulse, atMs, periodMs}` (sent on start, tempo change and world arrival);
  the page draws `pulse + (now − atMs) / periodMs` itself. Same host, same epoch.
- Onset flash from the `/cells` packets the panel already receives.
- Static world data moves out of `/view` into a new `/grid/out/page/b/world` packet sent
  on world change and on connect. This is review item 5, and it matters here: the score
  adds every cell's events, which would make the per-keypress view packet much bigger
  than today's 3.9 KB.
- Tests: the world packet's shape, and that `/view` stays small.

### Phase 2: rhythm editing (variants)

- Routes (web only): `/edit/<row>/<choice>/hit <slot> <0|1>`,
  `/edit/<row>/<choice>/length <pulses>` (refused unless it divides the cycle),
  `/edit/<row>/<choice>/revert`. Slots are source-pulse grid positions.
- The first edit copies the sourced cell into a variant: `id: "<source id>~mine"`, name
  `"<name> · mine"`, `provenance: "edited from <source id>"`. It stands in for that
  choice everywhere, including ensembles, evolution tuples and looper replays, which all
  refer to choice indices.
- **Position feel:** a new hit at grid slot k takes that slot's measured offset,
  `feelOffset(world, k mod pulsesPerBeat)` = the median fractional part of the source
  hits at that metric position (0 where there are none). That keeps Manjanin's 27:33:40
  template when you add hits.
- New-hit defaults: duration = the gap to the next hit, capped at the nearest source
  hit's duration; gain from the nearest hit; `pitchStep` from the previous hit (until
  phase 3 takes over pitch).
- Shortening a cell drops hits past the new end; lengthening leaves the tail empty.
  Phase continues from the global pulse, as a cell switch does.
- Data: `serialize().variants[worldId][row][choice] = Cell`.
- Tests: copy-on-first-edit, revert, divisor refusal, feel offsets, no change to the
  events of unedited cells, and a restore/serialize round-trip through `restoreGuards`.

### Phase 3: pitch loops

- Entry: `{ step: number } | { hz: number }`. Data: `serialize().pitchLoops[scope][row]`,
  where `scope` is a world id today. The later across-worlds experiment is a
  `pitchScope: "world" | "row"` setting that reads from a shared `"*"` key. Hz entries
  carry over exactly; step entries get reinterpreted.
- Absent loop = the cell's own pitch sequence, so unedited playback is unchanged.
- **Scheduler change (the risky part):** each hit takes `loop[k mod length]`, where k is a
  per-row hit counter that resets on Play. `replace`/`replaceAll` recompute the current
  window, so the counter must be known at the window start: keep `hitsBefore[row]` for
  `lastPulse`, advanced once per tick, never re-derived. Switching cell keeps the
  counter running, because the melody belongs to the row.
- UI: the step strip decided earlier (drag or type, + / −, a pin toggle per entry), with
  the loop length beside the rhythm length.
- Tests: an unedited world is byte-identical to today's packets; loops of different
  lengths drift as expected; the counter survives replace, a cell switch and a world
  change; a pinned Hz ignores tuning but follows the root multiplier.

### Phase 4: hit tilt

- A per-hit slider on the score, stored as `tilt` (in pulses) on the variant's event,
  bounded to ±40% of the gap to the nearer neighbour. Onset =
  `(atPulse + tilt) · sourceScale`. Tilting a sourced hit makes a variant first.
- Tests: the bounds hold at both ends, and hits never reorder.

### Later

- A grid edit mode: the phase bar as steps, paging for long cells.
- The across-worlds pitch-loop scope (decision 9).

## Resolved open items

- Pitch values: decision 6. Pitch-loop UI: the step strip. Edit timing: decision 7.
- The live score view ships first (phase 1).
