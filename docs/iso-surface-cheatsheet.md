# ISO page cheatsheet

The grid's keyboard page for idk.surface (`src/pages/iso-surface.ts`, slot a).
Positions are `x y`, x0 at the left, y0 at the top. Last updated 2026-11-13.

> Keep this in step with the page: any change to a key, a gesture or a default in
> `iso-surface.ts` changes this file in the same commit.

## The page

```
x:  0      1 ............ 12   13      14       15
y0  iso    keyboard            chord 1 track 1  loop 1
y1  PLAY                       chord 2 track 2  loop 2
y2  REEL                       chord 3 track 3  loop 3
y3  .                          chord 4 track 4  loop 4
y4  home                       chord 5 arp up   SUSTAIN
y5  twist                      chord 6 arp down PEDAL
y6  MENU                       chord 7 arp pal. shift 2
y7  TRANSP                     chord 8 arp urn  shift 1
```

| Where | Key | What it does |
|---|---|---|
| x0 y0 / y1 / y2 / y4 | iso / PLAY / REEL pads / home | Go to that page. |
| x0 y5 | Twister | Tap: the Twister overlay (scenes, A to B fader, Twister pages) stays open; tap again to shut. Hold: open while held. See the end of this sheet. |
| x0 y6 | MENU | One menu: the panel on x1-x4 and the lanes of the selected tracks on the top row x5-x12. Tap: open, tap again: shut. Hold: open only while held. |
| x0 y7 | TRANSPOSER | Show or hide the transposer on the bottom row. |
| x1-x12 | keyboard | Right = one step up, up a row = a fourth up (5 steps). Home is bottom left. |
| x13 y0-y7 | chords 1-8 | Play, save or clear a chord. |
| x14 y0-y3 | tracks 1-4 | Where your notes go. |
| x14 y4-y7 | arps | Up, down, palindrome, urn. |
| x15 y0-y3 | loopers 1-4 | Record and loop what you play. |
| x15 y4 | SUSTAIN | Latching sustain; also arms the chords for saving. |
| x15 y5 | PEDAL | Sustain while held; double-tap to latch. |
| x15 y6 | shift 2 | Hold + track: add or drop a track. |
| x15 y7 | shift 1 | Hold + looper or chord: clear. Hold + track: edit which loopers feed it. |

On this page the shifts are on the right (x15). The left x0 y6 and y7 are the
panel and the transposer; x0 y3 is dark.

## Keyboard (x1-x12)

- A key held is a note held. The same note lives on several keys; all of them
  light while it sounds.
- **Lights:** dim = out of the scale, a little brighter = in the scale, medium =
  the root, bright = in the sounding chord, full = under your finger. While an
  arp runs, the note it is playing is the brightest.
- Pressing a note that already sounds strikes it again. If it only rings because
  of sustain, the press takes it out of the chord instead.
- Scale, root, steps per octave, the row interval, folded layout and orientation
  are page settings in the web panel.

## Tracks (x14 y0-y3)

- **Press:** your notes go to that track alone.
- **Shift 2 + press:** add or drop a track; one always stays.
- **Lanes (in the menu, x0 y6):** whenever the menu is open, x5-x12 of the top
  row show surface's lanes 1-8 for the selected tracks. Bright = every selected
  track plays that lane, medium = only some do, dim = none. A press switches the
  lane on for all of them, or off when all already play it. All eight dark means
  surface has not answered (is the app open?). Shut the menu and the row is the
  keyboard again.
- **Shift 1 + press:** latch that track for editing (let shift go). Then the
  **looper keys** mean "this looper feeds this track" (bright = yes) and do not
  record. Press the latched track to leave, or another track to edit that one.
- **Shift 1 + all four tracks together:** every looper goes back to following
  the selection.
- A looper routed nowhere follows the selected tracks. Each note-on pulses its
  track's key.

## Chords (x13)

- **Press:** plays the saved chord while held; under sustain it keeps ringing, so
  chords stack.
- **Save:** with SUSTAIN (x15 y4) lit, press a slot: it takes what is ringing.
  Saving silence clears the slot. Press the slot you just saved again to release
  the chord.
- **Shift 1 + press:** clear the slot.
- A chord remembers the transposition it was saved at and moves with the
  transposer from there.
- **Lights:** very dim = empty, medium = holds a chord, full = playing; a little
  brighter while armed to save. Chords are saved with the preset at once.

## Sustain (x15 y4, y5)

- **SUSTAIN (y4):** latching. Notes keep ringing; the chord slots save instead
  of play.
- **PEDAL (y5):** sustain while held. Double-tap to latch it; the chord slots
  still play.
- Under either, pressing a ringing note silences it.

## Arps (x14 y4-y7)

- **Press one:** the held chord plays one note at a time: up, down, palindrome,
  or urn (random without repeats). Press the lit one to stop. One at a time.
- A sustained chord keeps ringing and the arp accents inside it. Loops are never
  arpeggiated.
- Speed follows the clock while it runs, a free rate while it is stopped.

## Transposer (x0 y7)

- **Press:** the bottom row x1-x12 becomes the transposer; press again to give
  the row back to the keyboard. The transposition stays in force when hidden
  (the key glows).
- **The row:** x8 = no transposition; left of it down to -7 steps, right of it
  up to +4.
- A note keeps the transposition it started with. Chords and loops move with it
  (two page settings switch that off). Not saved: 0 after a load.
- Hidden while the panel is open.

## The menu (x0 y6): panel and lanes

One overlay. **Tap** x0 y6 (under a third of a second): it opens and stays; tap
again to shut it. **Hold** it: it is open only while held. Only the time
counts, not what you pressed meanwhile. The key is bright while the menu is open.

The panel is on x1-x4; the lanes are on the top row x5-x12 (see Tracks). The
keyboard stays playable on x5-x12 below the top row. It and the transposer hide each other.
The key glows when a value is away from its default while hidden.

| Where | Key | What it does |
|---|---|---|
| x1 y0 | TINT | Tap: the second voice on or off. Hold + press keys: choose its three notes. |
| x1 y1-y3 | tint mode | The second voice goes above, below, or alternates. |
| x1 y4-y6 | tint octave | +1, 0, -1: moves only the second voice. |
| x2 y0-y6 | arp speed | x4, x3, x2, x1, /2, /3, /4. |
| x3 y0-y7 | arp chance | 100 % at the top down to 12.5 %. A missed beat is a rest. |
| x4 y0 | STRUM | Notes that start together are spread a little apart. |
| x4 y4-y7 | octave | +2, +1, 0, -1 for everything you play. |

The panel's values are saved with the preset.

## Loopers (x15 y0-y3)

- **Press:** arm, then close and play, then pause, then play again. Recording
  starts at your first note; the loop is as long as what you played.
- **Shift 1 + press:** clear.
- **Recorded:** notes as played, plus transposer, arp and panel moves. Not what
  sustain did with them.
- A paused loop keeps its place; only clear rewinds. Loops keep playing when you
  leave the page and are saved with the preset.
- **Lights:** very dim = empty, blinking = recording, full = playing,
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
