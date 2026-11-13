# CELLS page cheatsheet

The grid's hocket sequencer page for idk.surface (`src/pages/cells-surface.ts`,
slot b). Positions are `x y`, x0 at the left, y0 at the top.
Last updated 2026-11-13.

> Keep this in step with the page: any change to a key, a gesture or a default in
> `cells-surface.ts` changes this file in the same commit.

The other pages reach this one with x0 y3, which pulses softly on them while cells
is playing. On this page x0 y3 is DAMP, and it is lit bright like any page key
to show you are on cells; it goes full while all six voices are damped and
blinks in damp mode.

## The page (main view)

```
x:  0      1     2  3  4    5 ............ 15
y0  iso    mute  cell 1-3   phase            voice 1
y1  PLAY   mute  cell 1-3   phase            voice 2
y2  REEL   mute  cell 1-3   phase            voice 3
y3  DAMP   mute  cell 1-3   phase            voice 4
y4  home   mute  cell 1-3   phase            voice 5
y5  twist  mute  cell 1-3   phase            voice 6
y6  sh 2   CELLS RHY TUN  EVOLVE LOCKS REC.T (x1-x6)
y7  shift  play        ens 1-3 (x4-x6)       loop 1-4 (x12-x15)
```

| Where | Key | What it does |
|---|---|---|
| x0 y0 / y1 / y2 / y4 | iso / PLAY / REEL pads / home | Go to that page. |
| x0 y5 | Twister | Tap: the Twister overlay (scenes, A to B fader, Twister pages) stays open; tap again to shut. Hold: open while held. See the end of this sheet. |
| x0 y3 | DAMP | Hold: damps all six voices. |
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

## Tempo, shared with the app

Cells and the app's TEMPO are one tempo. When the two first meet (the agent
starting, or the app coming back), the app's tempo wins and cells takes it.
After that, a change on either side goes to the other: turn TEMPO in the app and
cells follows, even when cells is not the page in front. Change the tempo from
cells (a setting, the transport, or choosing a world with its suggested tempo)
and the app follows. A world's suggested tempo always goes to the app when the
world arrives.

The app only takes 30 to 300. If cells is set slower or faster than that, the
app is given 30 or 300 and cells keeps its own tempo until the app says
something else. Nothing here lines up the first beat of the app's arpeggio with
cells' first beat: only the speed is shared.

## Damp (x0 y3)

- **Hold:** damps all six voices, through the home page, so both agree.
- **Hold with shift (x0 y7):** switches damp mode on. The mute column (x1) then
  damps single voices while held. Press DAMP or shift to leave.

## Views (y6)

- **CELLS (x1):** the main view above.
- **RHYTHM (x2):** the top rows list the rhythm worlds, fifteen a row from x1.
  Press one: the world changes on the next shared beat, and arrives with its
  own recommended tuning and tempo. You can change either afterwards.

  The tempos are first suggestions for you to correct by ear (BPM of the beat):
  horn relay 120, amadinda Ndyegulira 160, amadinda Ssematimba 150, mbira Chakwi
  100, manjanin 150, manjanin II 160, ngòn 120, woloso 115, kotekan 100, mbira
  Nyamaropa 105, sikuri 65, tshikona 90, kecak 100.
- **TUNING (x3):** the top two rows list the tunings: included ones on y0,
  the keyboard scales on y1.
- **Recommended tuning (x6):** back to the world's own after you chose another;
  lit when it is active.

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
