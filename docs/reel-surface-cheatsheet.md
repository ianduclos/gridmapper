# REEL PADS page cheatsheet

The grid's REEL pads and step line page for idk.surface
(`src/pages/reel-surface.ts`, slot d). Positions are `x y`, x0 at the left, y0 at
the top. Last updated 2026-11-11.

> **Not switched on yet.** The page is built and waits for idk.surface's step line
> to be live (`REEL_PAGE_LIVE` in `src/util/pageSelectorSurface.ts`). Until then
> its key is dark and the page shows only the left column.

> Keep this in step with the page: any change to a key, a gesture or a default in
> `reel-surface.ts` changes this file in the same commit.

## The page

```
x:  0     2 ........................ 13   14    15
y0  iso   steps  1-12                           loop 1
y1  PLAY  steps 13-24                           loop 2
y2  twist steps 25-36                           loop 3
y3  .
y4  REEL  LEFT pads   SPEED  value  SPEED  RIGHT pads
y5  home  (x2-x5)     ROLL   x7-x8  ROLL   (x10-x13)
y6  sh 2              CHANCE        CHANCE
y7  sh 1              BLEND         BLEND        play
                      x6            x9           x14
```

| Where | Key | What it does |
|---|---|---|
| x0 y0 / y1 / y5 | iso / PLAY / home | Go to that page. |
| x0 y2 | Twister | Hold: the Twister shows its page chooser. |
| x0 y4 | REEL | Go to this page. Held while on it: pick the two lanes. |
| x0 y7 | shift 1 | Hold, then press a step: the length. Or a looper: clear. |
| x2-x13 y0-y2 | steps 1-36 | The step line, twelve a row, step 1 top left. |
| x2-x5 y4-y7 | LEFT pads | Sixteen slices of LEFT's lane. |
| x10-x13 y4-y7 | RIGHT pads | Sixteen slices of RIGHT's lane. |
| x6 y4-y7 | LEFT's keys | SPEED, ROLL, CHANCE, BLEND, top to bottom. |
| x9 y4-y7 | RIGHT's keys | The same four, for RIGHT. |
| x7-x8 y4-y7 | value | The lit key's four values, lowest at the bottom. |
| x14 y7 | play | Start or stop the step line. |
| x15 y0-y2 | loopers 1-3 | Record and loop pad presses. |

Shift 2 does nothing on this page.

## Pads

- **Press:** fires that slice on the track's lane, at normal speed. Pad 1 is at
  the bottom left; they count right, then up. Both blocks count the same way.
- The block you touched last is "yours": its steps show bright.
- A track with no lane is dark and silent. So are pads past the number of slices
  the lane has. Only the first sixteen slices can be reached.
- Playing by hand is never limited by the line: both blocks sound together.

## Steps

- **Write:** hold a pad, tap steps. Each takes that slice, with the track's four
  values as they stand.
- **Clear:** hold the pad whose slice the step already holds, tap the step.
  A tap with no pad held does nothing.
- **Length:** shift 1 + a step: the line ends on that step.
- **One slice a step** (the starting setting): writing a track's slice onto a
  step clears the other track's there. The other choice, **one from each**, is in
  the page's settings in the web panel; surface keeps it in the patch.
- **Lights:** bright = your track's, faint = the other's, brightest = both,
  dim = empty, dark = past the length. The playing step inverts: a lit step
  dips, an empty one brightens.

## SPEED, ROLL, CHANCE, BLEND

- **Hold** one for now, or **tap** it to keep it lit; tap it again to let go.
- **While one is lit**, the centre (x7-x8) shows its four values for that track,
  lowest at the bottom:

| Key | Bottom to top | None |
|---|---|---|
| SPEED | x-1 (backwards), x0.5, x1, x2 | no; starts at x1 |
| ROLL | flam, drag, ruff, roll | press the lit one again |
| CHANCE | 25, 50, 75, 100 % | no; starts at 100 % |
| BLEND | A, one third, two thirds, B | press the lit one again |

- **Pick a value:** steps written afterwards take it.
- **Tap a written step while the key is lit:** that step takes the value showing.
- **BLEND alone:** picking a position also moves the lane's BLEND there now, with
  a short glide.

## Lanes

Hold the REEL key (x0 y4) while on the page: the top row x4-x11 becomes lanes
1-8. The first tap sets LEFT's lane, a second sets RIGHT's. The two cannot be the
same lane. Tapping the lane a track already has sets that track to none.
Bright = LEFT's, medium = RIGHT's.

## Play (x14 y7)

Starts or stops the line. It starts at step 1, runs in sixteenths of the app's
tempo, and keeps running whatever page the grid shows. Stopping lets what rings
ring. The line is saved with the surface patch.

## Loopers (x15 y0-y2)

- **Press:** arm, then close and play, then pause, then play again. Recording
  starts at your first pad.
- **Shift 1 + press:** clear.
- **Recorded:** pad presses only. The steps are the app's and stay separate.
- **Lights:** very dim = empty, blinking = recording, bright = playing,
  medium = paused.
