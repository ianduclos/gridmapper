# CELLS page cheatsheet

The grid's hocket sequencer page for idk.surface (`src/pages/cells-surface.ts`,
slot b). Positions are `x y`, x0 at the left, y0 at the top.
Last updated 2026-11-11.

> Keep this in step with the page: any change to a key, a gesture or a default in
> `cells-surface.ts` changes this file in the same commit.

The left column has no key for this page: it is loaded and reachable from the web
panel or over OSC only. Its DAMP sits where the other pages have the REEL pads key,
so REEL pads cannot be reached from here.

## The page (main view)

```
x:  0      1     2  3  4    5 ............ 15
y0  iso    mute  cell 1-3   phase            voice 1
y1  PLAY   mute  cell 1-3   phase            voice 2
y2  twist  mute  cell 1-3   phase            voice 3
y3  .      mute  cell 1-3   phase            voice 4
y4  DAMP   mute  cell 1-3   phase            voice 5
y5  home   mute  cell 1-3   phase            voice 6
y6  sh 2   CELLS RHY TUN  EVOLVE LOCKS REC.T (x1-x6)
y7  shift  play        ens 1-3 (x4-x6)       loop 1-4 (x12-x15)
```

| Where | Key | What it does |
|---|---|---|
| x0 y0 / y1 / y5 | iso / PLAY / home | Go to that page. |
| x0 y2 | Twister | Hold: the Twister shows its page chooser. |
| x0 y4 | DAMP | Hold: damps all six voices. |
| x0 y7 | shift | Hold, then press a looper: clear. With DAMP: damp mode. |
| x1 y0-y5 | mute | Mute or rejoin that voice. |
| x2-x4 y0-y5 | cells 1-3 | Choose the voice's cell. |
| x5-x15 y0-y5 | phase | Shows where the voice is in its cycle. |
| x1 / x2 / x3 y6 | CELLS / RHYTHM / TUNING | Choose the view. |
| x4 y6 | EVOLVE | Auto-evolve on or off. |
| x5 y6 | LOCKS | Lock editing on or off. |
| x6 y6 | recommended tuning | Apply the tuning this world recommends. |
| x1 y7 | play | Start or stop cells. |
| x4-x6 y7 | ensembles 1-3 | Recall all six cells at once. |
| x12-x15 y7 | loopers 1-4 | Record and loop your moves. |

Shift 2 (x0 y6) does nothing on this page.

## Voices (y0-y5)

- **Cell key (x2-x4):** the voice takes that cell, coming in at the current
  phase. Tap the lit one to mute the voice.
- **Mute (x1):** mute or rejoin.
- **Phase (x5-x15):** the cycle's progress; the last key flashes on each onset.
  Dim = muted or resting.

## Play (x1 y7)

Starts or stops cells. Cells owns the tempo: if the transport is stopped, play
starts it at this page's tempo. Stopping cells leaves the transport running for
the other pages. Cells joins a running transport on its next beat.

## Damp (x0 y4)

- **Hold:** damps all six voices, through the home page, so both agree.
- **Hold with shift (x0 y7):** switches damp mode on. The mute column (x1) then
  damps single voices while held. Press DAMP or shift to leave.

## Views (y6)

- **CELLS (x1):** the main view above.
- **RHYTHM (x2):** the top rows list the rhythm worlds, fifteen a row from x1.
  Press one: the world changes on the next shared beat.
- **TUNING (x3):** the top two rows list the tunings: included ones on y0,
  the keyboard scales on y1.
- **Recommended tuning (x6):** applies the world's own; lit when it is active.

## Evolve and locks (x4, x5 y6)

- **EVOLVE:** every 2 to 4 beats, one linked group of rows may swap cells.
- **LOCKS:** while lit, the mute keys lock a row against evolve instead of
  muting it.

## Ensembles (x4-x6 y7)

Recall all six cells at once. The live one is brighter.

## Loopers (x12-x15 y7)

- **Press:** arm, close, then play and pause. Only while cells plays.
- **Shift + press:** clear.
- **Recorded:** cell, mute and ensemble moves. Loops lock to whole cycles of the
  world.
- **Lights:** very dim = empty, blinking = recording, bright = playing,
  medium = paused.

Tempo, humanize, rest chance and the decay settings are page settings in the web
panel.
