# TWISTER overlay cheatsheet

The grid's overlay for the Twister: its pages, the eight scenes and the A to B
fader (`src/util/pageSelectorSurface.ts`, the Twister key in the left column).
It is not a page of its own: it opens over whatever page is in front.
Positions are `x y`, x0 at the left, y0 at the top. Last updated 2026-11-13.

> Keep this in step with the overlay: any change to a key, a gesture or a light
> of the Twister overlay in `pageSelectorSurface.ts` changes this file in the
> same commit.

## Opening and closing (x0 y5)

- **Tap** the Twister key (under a third of a second): the overlay opens and
  stays. Tap again to shut it.
- **Hold** it: the overlay is open only while the key is down.
- Only the time counts, not what you pressed meanwhile.
- The key is bright while the overlay is open.
- While the key is held, the Twister also shows its own page chooser, as it did
  before the overlay existed. On a tap it flashes it briefly.
- It is one overlay for every page: open it on iso, go to PLAY, and it is still
  open there.

## The overlay

```
x:  0      4    5    6    7    8    9    10   11
y0  iso    pg a pg b pg c pg d pg e .    .    .
y1  PLAY   .
y2  REEL   A 1  A 2  A 3  A 4  A 5  A 6  A 7  A 8
y3  cells  B 1  B 2  B 3  B 4  B 5  B 6  B 7  B 8
y4  home   .
y5  TWIST  fader: A ........................... B
y6  .      .
y7  .      .
```

Everything right of column 0 belongs to the overlay while it is open: the page
under it is hidden and takes no keys. The left column still works, so you can
change page with the overlay open. A key you were already holding on the page
when the overlay opened still lets go on the page.

| Where | Key | What it does |
|---|---|---|
| x0 y5 | Twister | Open or shut the overlay (above). |
| x4-x8 y0 | Twister pages a-e | Put that page in front on the Twister. |
| x4-x11 y2 | scene 1-8 to A | Put that stored scene on the fader's A side. |
| x4-x11 y3 | scene 1-8 to B | Put that stored scene on the fader's B side. |
| x4-x11 y2 or y3, held | store | Store into that scene (below). |
| x4-x11 y5 | fader | Move the A to B fader to that position. |

## Twister pages (y0)

- **Press x4 to x8:** the Twister goes to its page a, b, c, d or e.
- **Lights:** the page last chosen here is bright, the others dim.
- The Twister does not tell the grid which page it is on. If you change page on
  the Twister itself, the light here still shows the last one pressed on the
  grid.

## Scenes (y2 and y3)

The eight scenes are the app's. A scene holds the dials of Twister page 2 SET
as they stood when it was stored.

- **Tap a key on the A row (y2):** that scene goes on the fader's A side.
- **Tap a key on the B row (y3):** that scene goes on the fader's B side.
- **Hold a key on either row for about 0.7 s:** the dials on Twister page 2 SET
  are stored into that scene as they stand now. The key flashes on both rows.
  Letting go afterwards does not also put the scene on a side.
- An empty scene cannot be put on a side: the app refuses it and the key stays
  dim.
- **Lights:** bright = the scene now on that side, dim = the others. With
  nothing on a side, the whole row is dim.
- The grid cannot tell which scenes hold something: all eight look alike until
  one is on A or B.

## The fader (y5)

- **Press x4 to x11:** the fader jumps to that position. x4 is all the way at
  scene A, x11 all the way at scene B, with six steps between.
- Every dial that both scenes hold moves with it, in a straight line from A's
  value to B's.
- **Lights:** the key where the fader is, is full bright; the keys left of it
  are medium; the rest are dim. With the fader at A only x4 is lit bright.
- The row follows the fader wherever it is moved from: the Twister's knob, the
  app's window, or here. Between the eight keys it shows the nearest one.
- All eight dim means the app has not answered yet (is it open?).

## Good to know

- The scenes and the fader are read from the app once a second while the
  overlay is open, so a change made elsewhere shows within a second.
- Nothing here is saved by the grid: scenes live in the app, the page in front
  lives in the Twister.
- The home page still has its own five Twister page keys (x15 y3-y7); they do
  the same as the top row here.
