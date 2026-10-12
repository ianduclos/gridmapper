# clips page ↔ idk.clips: the /clips contract, read from gridmapper's side

The contract belongs to idk.clips
(`idk.clips/docs/superpowers/specs/2026-10-12-clip-launcher-design.md`); nothing here
changes it. These are Ian's calls of 2026-10-12, and the page's readings of places the
spec is silent. **idk.clips: please confirm or correct the readings (4–11).**

## Decided by Ian (2026-10-12)

1. **Master volume** — the V layer's x15 column *shows* master (from `/clips/tracks`) but
   sends nothing: no address sets it. Wiring one in is a one-line change in
   `src/util/clipsState.ts` (`faderPress`).
2. **Hold-to-cue is out of v1.** It needs what the feed doesn't carry: each track's playing
   scene when that is outside the 6-scene window, and each clip's launch mode (to skip Gate
   clips). Revisit if idk.clips adds them.
3. **x0 y7 is the pages key** (the spec had it reserved): hold, then x0–x7 on y0 focuses
   slot a–h. Page-side only.

## The page's readings

4. **Indices are 0-based** (AbletonOSC's convention): tracks, scenes, and the `n` in
   `/grid/out/page/<slot>/focus/track <n>`.
5. **Offsets clamp to `max(0, n − 15)` tracks / `max(0, n − 6)` scenes**: the box never
   shows past the last track unless the set is smaller than the box. The page clamps what it
   asks for the same way, and always draws the window the fork reports.
6. **`/clips/beat`** is read as a whole beat count, sent once per beat while Live plays and
   not at all while it is stopped. The page blinks on the beat's parity while one has come
   in the last 2 s, otherwise on its own 500 ms clock (so queued clips still blink with the
   transport stopped). A fractional song position sent many times a beat would break the
   recording "dip".
7. **Whole numbers go out as OSC int, fractions as float** (gridmapper's `io/osc.ts` does this
   for every message), so `/clips/track/set volume 18 0` carries int `0`. The fork must accept
   an int wherever it expects a float.
8. **Liveness.** The window feed is silent while nothing changes, so silence can't mean
   "Live quit". After 10 s with no `/clips` message the page sends `/clips/hello` as a probe;
   no answer within 2 s means no link, then a hello every 2 s. It costs one snapshot per quiet
   10 s; a `/clips/ping` → `/clips/pong` pair would do it with less traffic.
9. **Each feed message carries its own offset.** The page only uses a `/clips/tracks` or
   `/clips/scenes` whose offset matches the current `/clips/window`, so a bank move never
   draws (or toggles) the wrong tracks. The fork should send all three after every move.
10. **Volume faders** are 7 steps, linear in Live's 0..1 parameter from 0 (−∞) to 0.85, which
    the page takes to be 0 dB. To confirm in the spike.
11. **Staged launch** fires each staged slot as a press then a release (all presses first),
    so a staged Gate clip plays only for that instant.
