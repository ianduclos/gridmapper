# REEL PADS page cheatsheet

The grid's REEL pads and step line page for idk.surface
(`src/pages/reel-surface.ts`, slot d). Positions are `x y`, x0 at the left, y0 at
the top. Last updated 2026-11-13.

> Keep this in step with the page: any change to a key, a gesture or a default in
> `reel-surface.ts` changes this file in the same commit.

## The page

```
x:  0     2 ........................ 13   14    15
y0  iso   steps  1-12                           loop 1
y1  PLAY  steps 13-24                           loop 2
y2  REEL  steps 25-36                           loop 3
y3  cells
y4  home  LEFT pads   SPEED  value  SPEED  RIGHT pads  ARP
y5  twist (x2-x5)     ROLL   x7-x8  ROLL   (x10-x13)
y6  sh 2              CHANCE        CHANCE
y7  sh 1              BLEND         BLEND        play
                      x6            x9           x14
```

| Where | Key | What it does |
|---|---|---|
| x0 y0 / y1 / y3 / y4 | iso / PLAY / cells / home | Go to that page. Cells pulses softly while it is playing. |
| x0 y5 | Twister | Tap: the Twister overlay (scenes, A to B fader, Twister pages) stays open; tap again to shut. Hold: open while held. See the end of this sheet. |
| x0 y2 | REEL | Go to this page. Held while on it: pick the two lanes. |
| x0 y7 | shift 1 | Hold, then press a step: the length. Or a looper: clear. |
| x2-x13 y0-y2 | steps 1-36 | The step line, twelve a row, step 1 top left. |
| x2-x5 y4-y7 | LEFT pads | Sixteen slices of LEFT's lane. |
| x10-x13 y4-y7 | RIGHT pads | Sixteen slices of RIGHT's lane. |
| x6 y4-y7 | LEFT's keys | SPEED, ROLL, CHANCE, BLEND, top to bottom. |
| x9 y4-y7 | RIGHT's keys | The same four, for RIGHT. |
| x7-x8 y4-y7 | value | The lit key's four values, lowest at the bottom. |
| x14 y4 | ARP | Lit: held pads play in turn, timed by the app (below). |
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

## ARP (x14 y4)

- **One switch with the app:** this key is the app's own ARP, the same one as its
  ARP button, the computer keys' C and PLAY's ARP key. Press it here and the
  app's lights; flip it in the app and this key follows, with whatever you hold.
- **Lit:** a pad press no longer fires the slice. The app holds it in one arp and
  steps through everything held, low pad to high, on its own ORDER, RATE and the
  rest. Pads from both blocks are one chord; each step plays on its own track's lane.
- **Let go:** the pad leaves the arp. Unlighting ARP, or leaving the page, lets go
  of every pad held. Pads already down when you light it join the chord.
- **Steps:** writing works as before (hold a pad, tap steps), ARP lit or not.
- **Loopers** still record the presses but play them back as plain slices, never
  arpeggiated.
- **Lights:** a held pad is medium; the one whose step sounds now is the brightest.
- The grid keeps no ARP of its own: on or off is whatever the app says.

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
- **Tap an empty step while the key is lit and a pad is held:** the step is written
  with that pad's slice and the track's values as they stand, as with no key lit
  (one slice a step still clears the other track). With no pad held it does nothing.
- **BLEND alone:** picking a position also moves the lane's BLEND there now, with
  a short glide.

## Lanes

Hold the REEL key (x0 y2) while on the page: the top row x4-x11 becomes lanes
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
