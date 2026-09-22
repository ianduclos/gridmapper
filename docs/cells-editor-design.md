# Cells score editor: design (agreed 2026-09-21/22, not built)

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

## Open items (decide while building)

- **Pitch values: Ian's direction (2026-09-22) is "cells can be frequencies — almost
  makes more sense".** A pitch-loop entry may be an absolute frequency (Hz), which is the
  natural meaning for horn-relay's fixed-pitch voices and possibly for every world. Confirm
  the exact form with Ian before building. Options: Hz only; Hz or tuning step per entry;
  or steps displayed with their Hz. Hz entries bypass `eventHz`'s tuning lookup (but
  `rootMultiplier` should still apply), so a tuning change leaves them alone. Say so
  in the UI.
- **Pitch-loop UI: step strip (decided).** A row of small boxes under each rhythm strip, one
  per entry: drag up or down, or type; + adds and − removes an entry. The loop length stays
  visible next to the rhythm length.
- Whether an edit to a playing cell takes effect at the playback-buffer cutoff (like a
  cell switch) or at the cell's next cycle start. Recommendation: at the cutoff, for
  consistency.
- The live score view (six strips, playhead, onset flash) is the display half, and can
  ship before editing.
