# PLAY page cheatsheet

The grid's PLAY page for idk.surface (`src/pages/play-surface.ts`, slot c).
Positions are `x y`, x0 at the left, y0 at the top. Last updated 2026-11-11.

> Keep this in step with the page: any change to a key, a gesture or a default in
> `play-surface.ts` changes this file in the same commit.

## The page

```
x:  0     2     4 ........ 11   12    15
y0  iso   KEYS  lane 1 ... 8    all   loop 1
y1  PLAY  .                     all   loop 2
y2  twist .                     all   loop 3
y3  .     .                     all   loop 4
y4  REEL  .                     all   PITCH
y5  home  .                     all   STRIKE
y6  sh 2  .                     all   SLEW
y7  sh 1  PRE                   all   LATCH
```

| Where | Key | What it does |
|---|---|---|
| x0 y0 / y1 / y4 / y5 | iso / PLAY / REEL pads / home | Go to that page. |
| x0 y2 | Twister | Hold: the Twister shows its page chooser. |
| x0 y6 | shift 2 | Hold: BOW, FREEZE, DAMP on the lanes (below). |
| x0 y7 | shift 1 | Hold, then press a thing: store, clear, or strike all. |
| x2 y0 | KEYS | The lanes play notes. |
| x2 y7 | PRESETS | The lanes hold stored sounds. |
| x4-x11 | lanes 1-8 | One column per lane. |
| x12 | all | The same press on all eight lanes (PRESETS only). |
| x15 y0-y3 | loopers 1-4 | Record and loop what your hands do. |
| x15 y4 | PITCH | Lit: a press sets the note. Unlit: it plays the lane's own note. |
| x15 y5 | STRIKE | Lit: recalling a preset also strikes the lane. Starts lit. |
| x15 y6 | SLEW | Tap: glide on or off. Hold: choose the time. |
| x15 y7 | LATCH | Lit: notes stay after you let go. |

x2 y1-y6 are dark and do nothing. There is no arp on this page.

## KEYS (x2 y0)

- **Press a lane cell:** plays that lane and holds the note while the key is down.
  The row is the pitch, lowest at the bottom, in the scale iso is set to.
- **REEL lane in slices:** the row is the pad number, 1 at the bottom.
- **PITCH unlit:** every lane column is lit solid. A press plays the lane on the
  note it already has, held while the key is down, always equally hard. Height
  means nothing, unless the page setting **y** (web panel: "PITCH off: height
  sets") names a family: tone, time, force, move or place. Then the row sets
  that dial for the lane's engine, as the lane's own, before it plays (bottom =
  lowest). HOME or a preset recall hands the dial back. One choice for all lanes.
- **Lights:** the field is even and dim. The cell you last played stays bright and
  fades as the lane dies away. While a key is down, its whole column lights.
- **LATCH lit:** a note stays after you let go, and its column stays lit for as
  long as it is kept. Press the same cell again to end it. Unlighting LATCH ends
  them all, bowed ones too. Works with PITCH lit or unlit. Latched notes outlive
  a page switch.

## PRESETS (x2 y7)

A cell holds a lane's whole sound: every dial the lane has pulled away from the
shared one. Seven rows per engine (y0-y6); the bottom row is HOME.

- **Store:** hold shift 1 (x0 y7), press a lane cell in y0-y6.
- **Recall:** press the cell. Stored dials go to their values; every other dial
  goes back to the shared one. With STRIKE lit the lane is struck too.
- **HOME (y7):** all the lane's dials back to the shared sound.
- **All (x12):** every lane recalls that row for its own engine. With shift 1 held
  it strikes them all as well, whatever STRIKE says.
- **Lights:** dim = empty, medium = stored, bright = the one the lane is on.
- Presets are kept per surface patch name.

## SLEW (x15 y6)

- **Tap:** the glide on or off, at the last time chosen (1 s to begin with).
- **Hold:** the all column (x12) offers eight times, bottom to top:
  0, 0.1, 0.25, 0.5, 1, 2, 4, 8 s. Press one.
- Recalls and the way home travel at that time. Lit when a glide is on.

## Shift 2 (x0 y6)

While it is open, the bottom three rows of the lanes (x4-x11) and of the all
column (x12) stop being notes or presets and become three switches per lane.
The rows above them keep working as before.

| Row | Switch | A lane cell | The all cell (x12) |
|---|---|---|---|
| y5 | BOW | Switches that lane's bow on or off. | All eight on; if all are on already, all off. |
| y6 | FREEZE | Switches that lane's freeze on or off. | The same, for freeze. |
| y7 | DAMP | Damps that lane while the key is down. | Damps all eight while down. |

- **Open it:** hold x0 y6. Let go and it closes.
- **Keep it open:** hold it about a second without pressing anything; it stays
  open and the key blinks. A tap closes it.
- **Lights:** medium = off, bright = on (BOW, FREEZE show what surface says);
  DAMP is full bright while a lane is damped. The all cell is bright when all
  eight are on.
- It works on KEYS and on PRESETS alike, and the loopers record all three.
- The home page (x0 y5) has the same three rows in the same order, always open.

## Loopers (x15 y0-y3)

- **Press:** arm, then close and play, then pause, then play again. Recording
  starts at your first move.
- **Shift 1 + press:** clear.
- **Recorded:** notes, strikes, recalls, bow, freeze and damp, on the lanes and
  the all column. Not chooser changes, shifts or stores.
- Loops keep playing when you leave the page.
- **Lights:** very dim = empty, blinking = recording, bright = playing,
  medium = paused.
