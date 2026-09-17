# Sequencer ideas

Brainstorm, 2026-09-17. Aim: complex but coherent music, microtonal where it helps,
built for live play but allowed to be prepared ahead. None of this is built yet.

Most of these fit how gridmapper already works: pages send integer **steps**, Max
turns steps into pitch, and there are four clock lanes, the pattern recorders and the
chord presets to build on.

## Structural (the tuning math makes it hang together)

1. **MOS / Euclid twin.** One gesture picks a generator k-of-n, and that same pattern
   becomes both the rhythm (Euclidean) and the scale (a moment-of-symmetry scale, like
   5-of-12 or 7-of-19). Pitch and rhythm come from one shape, so they fit together
   even when complex. Rows could hold nested scales within the same EDO (equal
   division of the octave).
2. **Lattice walker.** The grid becomes a just-intonation lattice: x = ×3/2, y = ×5/4,
   and a shift key adds a ×7/4 axis. A sequence is a *path of moves*, not a list of
   notes. You steer the walker live, and brightness shows how far pitch has drifted
   from where it started, with a key to snap back.
3. **Harmonic-series columns.** The 16 columns are harmonics 1–16 of a moving
   fundamental. Rows are steps; a separate short sequence moves the fundamental. You
   get microtones for free (the 7th, 11th and 13th harmonics), and everything stays
   related because it's all one overtone series.
4. **Temperament morph.** Degrees stay fixed while you switch 12 → 19 → 31 EDO or to
   adaptive JI (retuning held chords to pure intervals on the fly). The phrase stays
   recognisable while its harmony shifts. Mostly Max-side, since steps are already
   abstract.

## Time and form

5. **Tempo canon (Nancarrow-style).** Record a phrase with a looper, and voices replay
   it at ratios like 3:4 or 5:7, each transposed by a lattice interval. You place the
   convergence point, and the grid shows the voices closing in on it.
6. **Korvai / landing calculator.** You set a landing beat (the "sam") and a phrase,
   and it works out gaps so three repeats land exactly there. It lives as a pattern,
   and you trigger it live.
7. **Rotation arrays.** A tone row and a duration row are drawn as a 16×8 grid of
   rotations. Playing means choosing rows and paths through the grid. Serial music you
   can actually play.

## Performance surfaces

8. **Brightness as probability.** The left 8×8 quadrant is a Markov matrix (which note
   tends to follow which); the right quadrant is density per voice. Prepare the
   weights, then smear them live.
9. **Tension conductor.** One row is a macro tension control. Voices pick notes by
   harmonic complexity (Tenney height) against the tension level, so you perform the
   *form* and the material follows.
10. **Consonance automaton.** A Game-of-Life variant where a cell survives only if it's
    consonant with its neighbours. A Twister knob sets how much dissonance is
    tolerated.
11. **Snapshot morph.** Four prepared sequences sit at the corners, and cells in
    between are probabilistic blends. Builds on chord presets.
12. **Ratchet planes.** x is time, brightness is subdivisions per step, and holding a
    key extends a note into a roll.

## Architecture plays

13. **Cross-slot mod bus.** One page's events modulate another's settings; for example,
    meadowphysics counters transpose the isometric arp. No new sequencer needed, just a
    way to couple pages.
14. **Lane as meter.** Four clock lanes at coprime divisions give built-in polymeter,
    which the other ideas can share.

## First picks

**1**, **2** and **13**: the most original, and the cheapest given the step field.
