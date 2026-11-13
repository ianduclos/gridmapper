# HOME page cheatsheet

The grid's home page for idk.surface (`src/pages/set-surface.ts`, slot f).
Positions are `x y`, x0 at the left, y0 at the top. Last updated 2026-11-13.

> Keep this in step with the page: any change to a key, a gesture or a default in
> `set-surface.ts` changes this file in the same commit.

## The page

```
x:  0     2     4 ........ 11        15
y0  iso         A B C D . S1 S2 M    loop 1
y1  PLAY                             loop 2
y2  REEL                             loop 3
y3  .     all   FOCUS  lane 1 ... 8  Twister a
y4  home  all   MOTION               Twister b
y5  twist all   BOW                  Twister c
y6  sh 2  all   FREEZE               Twister d
y7  sh 1  all   DAMP                 Twister e
```

| Where | Key | What it does |
|---|---|---|
| x0 y0 / y1 / y2 / y4 | iso / PLAY / REEL pads / home | Go to that page. |
| x0 y5 | Twister | Tap: the Twister overlay (scenes, A to B fader, Twister pages) stays open; tap again to shut. Hold: open while held. See the end of this sheet. |
| x0 y6 | shift 2 | Hold, then press a FOCUS key: the way home (below). |
| x0 y7 | shift 1 | Hold, then press: add to the selection, or clear a looper. |
| x4-x11 | lanes 1-8 | One column per lane, rows y3-y7. |
| x2 y3-y7 | all | The same row for all eight lanes. |
| x4-x7 y0 | FX A, B, C, D | Show that track's FX chain in the window. |
| x9 / x10 / x11 y0 | S1 / S2 / Master | Show that chain in the window. |
| x15 y0-y2 | loopers 1-3 | Record and loop what your hands do. |
| x15 y3-y7 | Twister pages a-e | Switch the Twister's page. |

## FX row (y0)

A press brings the FX page to the front in the window, on that track's chain.
The one showing is bright. It follows the window if you change it there.

## FOCUS (y3)

- **Press a lane:** focuses that lane alone, as a click on its header does.
- **Shift 1 + press:** adds that lane to the selection, or drops it. The focused
  lane cannot be dropped.
- **Range:** hold one lane's key, then hold another for about half a second: every
  lane between the two is selected.
- **All (x2 y3):** selects all eight.
- **Shift 2 + press a lane:** that lane goes home: every dial it owns goes back to
  the shared sound. No note is struck.
- **Shift 2 + all (x2 y3):** every lane goes home.
- **Lights:** bright = the focused lane, medium = selected with it, dim = the rest.
  A lane flashes when it sounds; the focused one dips instead.

## MOTION (y4)

- **Press a lane:** that lane's motion (tremolo) on or off.
- **All (x2 y4):** all eight on; if all are on already, all off.
- **Lights:** bright = on, dim = off.

## BOW, FREEZE, DAMP (y5, y6, y7)

| Row | Switch | A lane cell | The all cell (x2) |
|---|---|---|---|
| y5 | BOW | Switches that lane's bow on or off. | All eight on; if all are on already, all off. |
| y6 | FREEZE | Switches that lane's freeze on or off. | The same, for freeze. |
| y7 | DAMP | Damps that lane while the key is down. | Damps all eight while down. |

- **Lights:** dim = off, bright = on; DAMP is full bright while a lane is damped.
  The all cell is medium when some are on, bright when all are.
- The same three rows, in the same order, as PLAY's shift 2.
- The cells page's damp key damps through this page, so the lights agree.

## Loopers (x15 y0-y2)

- **Press:** arm, then close and play, then pause, then play again. Recording
  starts at your first move.
- **Shift 1 + press:** clear.
- **Recorded:** damp, bow, freeze and motion. Not focus, the selection, the FX row
  or the way home.
- Loops keep playing when you leave the page, and are saved with the preset.
- **Lights:** very dim = empty, blinking = recording, bright = playing,
  medium = paused.

## Twister pages (x15 y3-y7)

Press one to put the Twister on its page a, b, c, d or e. The one last pressed
here is bright (the Twister does not report its page back).

## Twister overlay (x0 y5, on every page)

The Twister key opens an overlay over the page. **Tap** it: the overlay stays
until you tap again. **Hold** it: open only while held (and the Twister shows
its own page chooser meanwhile, as before). While it is open the page under it
takes no keys; the left column still works.

| Where | Key | What it does |
|---|---|---|
| x4-x8 y0 | Twister pages a-e | Put that Twister page in front. Lit = the one last chosen here. |
| x4-x11 y2 | scene 1-8 to A | Put that stored scene on the fader's A side. Lit = the scene on A. |
| x4-x11 y3 | scene 1-8 to B | The same for the B side. An empty scene is refused by the app. |
| x4-x11 y2 or y3, held | store | Held about 0.7 s: store Twister page 2 SET's dials into that scene. The key flashes. |
| x4-x11 y5 | A to B fader | Eight positions, A at the left, B at the right. Lit up to where the fader is; it follows the Twister's knob and the app. |

The grid cannot tell which scenes hold something: all eight look alike until
one is on A or B.
