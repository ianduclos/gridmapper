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
y4  home                       chord 5 arp up   LATCH
y5  twist                      chord 6 arp down PEDAL
y6  PANEL                      chord 7 arp u-d  shift 2
y7  TRANSP                     chord 8 arp urn  shift 1
```

| Where | Key | What it does |
|---|---|---|
| x0 y0 / y1 / y2 / y4 | iso / PLAY / REEL pads / home | Go to that page. |
| x0 y5 | Twister | Hold: the Twister shows its page chooser. |
| x0 y6 | PANEL / lanes | Tap: show or hide the performance panel on x1-x4. Hold: the lanes of the track in front on the top row. |
| x0 y7 | TRANSPOSER | Show or hide the transposer on the bottom row. |
| x1-x12 | keyboard | Right = one step up, up a row = a fourth up (5 steps). Home is bottom left. |
| x13 y0-y7 | chords 1-8 | Play, save or clear a chord. |
| x14 y0-y3 | tracks 1-4 | Bring that track's layer to the front. |
| x14 y4-y7 | arps | The app's ARP for the front track: up, down, up-down, urn. |
| x15 y0-y3 | loopers 1-4 | Record and loop what you play. |
| x15 y4 | LATCH | The app's LATCH for the front track; also arms the chords for saving. |
| x15 y5 | PEDAL | LATCH on the front track while held; double-tap to keep it. |
| x15 y6 | shift 2 | Not used on this page. |
| x15 y7 | shift 1 | Hold + looper or chord: clear. |

On this page the shifts are on the right (x15). The left x0 y6 and y7 are the
panel and the transposer; x0 y3 is dark.

## The four tracks are layers (x14 y0-y3)

One track is in front at a time. Press a track key to bring it forward.

- **Everything you do goes to the front track only:** key presses, chords, ARP,
  LATCH and PEDAL, the panel's octave and tint, the lane picker.
- **Bright** on the keyboard: what you hold on the front track, and what its
  LATCH keeps of it.
- **Very dim:** the other tracks' notes, and every loop's playback (the front
  track's loops too). A dim note on a root key is a little brighter, so it shows.
- A key you are still holding when you change track keeps the track it began on.
- There is no selecting several tracks any more, and loopers are not routed to
  tracks (see Loopers).
- Each note-on pulses its track's key.

**Lanes of the front track (hold x0 y6):** the playing area's top row goes dark
and x4-x11 show surface's lanes 1-8 for the track in front: bright = it plays
that lane, dim = it does not. A press switches the lane. Let go and the row is
the keyboard again. It works with the panel open. All eight dark means surface
has not answered (is the app open?). A quick tap of x0 y6 (under a third of a
second, no lane pressed) is still the panel.

## Keyboard (x1-x12)

- A key held is a note held. The same note lives on several keys; all of them
  light while it sounds.
- **Lights:** dim = out of the scale, a little brighter = in the scale, medium =
  the root, a step above the scale = the dim plane, bright = the front track's
  notes, full = under your finger.
- Pressing a note that already sounds on the front track strikes it again.
- The grid sends plain presses and releases. What ARP and LATCH make of them is
  the app's doing, per track.
- Scale, root, steps per octave, the row interval, folded layout and orientation
  are page settings in the web panel.

## Chords (x13)

- **Press:** plays the saved chord on the front track while held; with that
  track's LATCH lit it keeps ringing, so chords stack.
- **Save:** with LATCH (x15 y4) lit by the LATCH key, press a slot: it takes what
  the front track is ringing. Saving silence clears the slot. Press the slot you
  just saved again to let the chord go.
- **Shift 1 + press:** clear the slot.
- A chord remembers the transposition and octave it was saved at and moves from
  there.
- **Lights:** very dim = empty, medium = holds a chord, full = playing; a little
  brighter while armed to save. Chords are saved with the preset at once.

## LATCH and PEDAL (x15 y4, y5)

These are the app's LATCH, one per track, the same switch as in the app's window.

- **LATCH (y4):** the front track's LATCH on or off. Lit = on, whoever switched
  it. Released keys keep sounding (and with ARP on, the arpeggio plays on).
  Putting it out lets go of everything it held. Lit by this key, the chord slots
  save instead of play.
- **PEDAL (y5):** LATCH on the front track while held. Double-tap to keep it;
  the next press puts it out. The chord slots still play. It does nothing on a
  track whose LATCH is already lit.
- Pressing a ringing note no longer takes it out of the chord; it strikes again.
- The notes LATCH keeps stay lit here by the grid's own reckoning; the app does
  not report them. If the two ever differ, put LATCH out and on again.

## Arps (x14 y4-y7)

This is the app's ARP: its timing, its settings. The grid has none of its own.

- **Press one:** the front track's ARP goes on in that order: up, down, up-down,
  or urn (random without repeats). **Press the lit one** to switch that track's
  ARP off.
- The order is one setting for the whole app, so it changes for every track.
- **Lights:** bright = the front track's ARP is on in this order. Medium = this
  is the app's order, but the front track's ARP is off. All dim = the app is on
  an order with no key here, or has not answered.
- Speed and chance are in the panel. Whether a loop's notes go through the arp
  is the app's setting LOOPS THROUGH ARP.

## Transposer (x0 y7)

- **Press:** the bottom row x1-x12 becomes the transposer; press again to give
  the row back to the keyboard. The transposition stays in force when hidden
  (the key glows).
- **The row:** x8 = no transposition; left of it down to -7 steps, right of it
  up to +4.
- One transposition for all four tracks. A note keeps the transposition it
  started with. Chords and loops move with it (two page settings switch that
  off). Not saved: 0 after a load.
- Hidden while the panel is open.

## Performance panel (x0 y6)

Opens over x1-x4; x5-x12 stay playable. It and the transposer hide each other.
The key glows when the front track's octave, its tint or strum is away from
rest while hidden.

| Where | Key | What it does |
|---|---|---|
| x1 y0 | TINT | The front track's. Tap: the second voice on or off. Hold + press keys: choose its three notes. |
| x1 y1-y3 | tint mode | The front track's: the second voice goes above, below, or alternates. |
| x1 y4-y6 | tint octave | The front track's: +1, 0, -1, moves only the second voice. |
| x2 y0-y6 | arp speed | The app's RATE, fastest at the top: 1/16, 1/16T, 1/8, 1/8T, 1/4, 1/2, 1/1. |
| x3 y0-y7 | arp chance | The app's PROB: 100 % at the top down to 12.5 %. A missed step waits; its note plays on the next. |
| x4 y0 | STRUM | All tracks: notes that start together are spread a little apart. |
| x4 y4-y7 | octave | The front track's: +2, +1, 0, -1. |

Octave and tint are kept per track and saved with the preset, with strum. Arp
speed and chance are the app's: lit from it, one setting for all tracks, saved
with the app's patch and not here. Nothing is lit in those two columns until
the app has answered.

## Loopers (x15 y0-y3)

- **Press:** arm, then close and play, then pause, then play again. Recording
  starts at your first note; the loop is as long as what you played.
- **Shift 1 + press:** clear.
- **Each press is recorded with the track that was in front** and plays back on
  that track, whatever is in front later. One loop can span several tracks:
  change track while recording.
- **Recorded too:** transposer, strum, and per track the arp keys, octave and
  tint; arp speed and chance.
- A loop's playback shows on the dim plane.
- A paused loop keeps its place; only clear rewinds. Loops keep playing when you
  leave the page and are saved with the preset.
- A loop saved before 2026-11-13 that was routed to tracks is cleared when it is
  loaded (the log says so); an unrouted one plays on track 1.
- **Lights:** very dim = empty, blinking = recording, full = playing,
  medium = paused.
