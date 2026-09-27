# Cells Hot: playing and playback interface

`cells-hot` occupies Hotelier slot **b**. Gridmapper chooses notes and absolute
pitches; Max executes six addressed voices. This release requires the coordinated
Max update in [cells-v2-rollout.md](cells-v2-rollout.md). The live daemon must not
be restarted into this version before that compatibility is installed.

## Playing

The first six rows have three cell choices and a mute button. Tap the selected
cell to mute that voice; tap again to rejoin. Choosing a different cell brings it
in at the current phase. Already sounding notes keep their tails. Phase columns
show the moving cycle and flash on scheduled onsets. Muted/resting selections
are dim; buffered changes have a separate intermediate brightness.

Grid coordinates below are zero-based. Column 0 remains the page selector.

| Control | Position |
| --- | --- |
| Mute (lock in lock-edit mode) / cell choices | x=1 / x=2–4, y=0–5 |
| Cells view (main) / rhythm banks / tuning banks | x=1 / 2 / 3, y=6 |
| Auto-evolve / lock-edit mode | x=4 / 5, y=6 |
| Apply current or pending world's recommendation | x=6, y=6 |
| Damp all six (hold) | x=0, y=6 |
| Shift (hold) | x=0, y=7 |
| Play / stop cells (the transport keeps running) | x=1, y=7 |
| Three ensemble recalls (the live one lit brighter) | x=4–6, y=7 |
| Four gesture loopers | x=12–15, y=7 |

In lock-edit mode, each row's mute button toggles its evolution lock. Cell
buttons remain playable. Tuning-bank view puts five **Included tunings** on
y=0, x=1–5 and nine **Hotelier scales** on y=1, x=1–9. Rhythm-bank choices occupy
x=1–15 in reading order. Bank view and lock-edit mode are temporary.

The web panel names every cell and ensemble, exposes row locks, and shows the
recommended tuning with its basis. **Apply recommendation** is explicit: changing
a rhythm world never retunes automatically. Applying a pending world's
recommendation queues it with that world. Selecting another pending world clears
that queued recommendation. Choosing a tuning manually also cancels it.

The phase bar (x=5–15) glides: its leading cell is interpolated between the empty
and filled levels. A muted or resting row draws its bar dimmer and does not flash.

## Damp

x=0, y=6 is a momentary damp on all six voices. Hold it together with shift (x=0, y=7), in
either order, to toggle **damp mode**: the mute column (x=1, y=0–5) then damps single voices
while held, and pressing damp or shift leaves the mode. Entering the mode lets go of an
all-damp you were holding. Damp is not a new message: cells writes its keys to
`ctx.shared` (`damp/cells`), and **set-hot stays the one sender** of
`/grid/out/page/f/voice <n> damp <1|0>`, ORing cells' request with its own hands and
loopers. set-hot publishes the result (`damp/set-hot`), which lights cells' damp key when all
six are damped. set-hot must be loaded for damp to reach Max. Leaving the page releases a
held damp, and so does letting go of a per-voice key after a bank view has changed
column 1's meaning. Loopers do not record damp.

## Gesture loopers

The four keys at x=12–15, y=7 are **cycle-locked** (`util/cycleLooper.ts`). Press to
arm, press again to close the take and play it, then press to pause or resume. Hold
shift (x=0, y=7) and press to clear. The loopers record **arrangement moves only**: cell
choices, mutes and ensemble recalls, each as an absolute value (`cell/<row>`,
`mute/<row>`, `ensemble`), so replaying a move is idempotent. World, tuning, tempo and
locks are never recorded. Recording comes only from a hand, either the grid or the web
panel. Playback applies moves without recording them, so the latest move wins.

Loops live in cells' own pulses, not wall-clock time. The **world cycle** is the span
where every cell of the world realigns: the LCM of all its cell lengths, 8–16 beats for
the current banks (`worldCyclePulses`). A take anchors on the cycle boundary at or before
its first move, and closing rounds it to the nearest whole number of cycles (at least
one, at most 16); moves past a rounded-down end are dropped. So a loop restates exactly
against the hocket and follows tempo changes. Each move replays at its exact recorded
pulse: its cutoff is that pulse's onset time, so notes before it keep the old cell.

Moves are recorded only while cells plays. Loops play only while cells plays, and a
paused loop resumes at its cycle-aligned position rather than where it paused. Stopping
cells mid-take closes it, keeping every move. A world change does not rescale a loop:
its length stays in pulses. Loops are part of the page state (`patterns`), so a web-panel
preset save captures them; they restore paused. The older wall-clock form is dropped on
restore. Web routes: `/looper/<i>` and `/looper/<i>/clear`.
Out: `/grid/out/page/b/patterns` `[{state, beats}]`.

## Tempo

Cells owns the tempo, shown as **BPM of the performance beat** (three pulses):
`bpm = pulseRate × 20`, so the default `12 / 1.66` Hz is about 144.6 BPM. The stored
field stays `pulseRate`. Both `/setting/bpm` and the legacy `/setting/pulseRate` are
accepted.

**Play gates cells only.** With the transport stopped, Play pushes `pulseRate × lane.div`
and starts it. With the transport already running, cells joins on its next beat (lane
ticks 1, 4, 7...), so it stays in step with the other pages. Stopping silences cells and
leaves the transport running for meadowphysics, iso-hot's arp and anything else that
follows it. A transport start from anywhere else starts cells too, unless its Play key was
last switched off. A transport rate edit
from anywhere else (the web clock field, the app settings) is written back into cells
(internal lanes only). Before this, the next Run put the old 7.23 back, which looked like
the clock resetting.

## Phase and world changes

The saved pulse rate defaults to `12 / 1.66` Hz. Play applies that rate
to the selected clock lane. Existing banks retain their previous speed. One shared
performance beat is three transport pulses; each world separately declares its
source/design pulses per performance beat (three for legacy and Mande banks,
four for Pelayon). Thus source pulse duration is `3 * periodMs / pulsesPerBeat`.
Performance grouping is documented separately from claims about traditional meter.

A whole-world request chooses the first shared beat strictly beyond the 100 ms
playback buffer. On the grid, the rhythm-bank key (x=2, y=6) blinks while a world is
queued (at most about a beat), and every phase bar flashes once as it lands. A newer request replaces the pending choice; selecting the
current world cancels it. All six future schedules change at one cutoff, with the
new world at the corresponding global phase. No phrase restarts, missed-attack
replays, artificial entry strikes, or automatic tuning changes occur. Current
manual mutes and evolution locks survive the transition.

Individual cell choices remain immediate with the short playback-buffer delay.
Page changes do not stop the sequencer. Stopping clears the session and sequencer-owned
notes. Restart establishes phase zero. Restoring a preset stops the session and never
starts it, leaving the transport alone; the Play key shows cells stopped.

**Nothing cells does is written into a saved preset.** Every change refreshes the live
layout (`configs/slots.json`, batched every 400 ms) through an empty `ctx.persist({})`
patch, so a reboot comes back as you left it. A preset changes only when you save it from
the web panel.

## Controlled evolution

Auto-evolve defaults off. A seeded decision stream considers one authored compatible
group every 2–4 performance beats. **Evolution activity** (0–1, default 0.5) is the
chance an opportunity changes anything; the rest leave the arrangement alone. Linked parts change together; authored foundation rows are excluded. A lock
on either member protects its entire linked group. Manual cell and ensemble
choices protect the affected groups for eight beats, even if an ensemble was
already selected. Manual choices remain possible on locked rows.

**Allow silence in evolution** defaults off. When enabled, a non-resting group rests
instead of swapping with probability **Rest chance** (0–1, default 0.25). Its next actual change rejoins a
compatible tuple. These temporary rests are separate from manual mute state;
evolution never unmutes a manually muted voice. Switching worlds, stopping,
disabling silence, or disabling evolution clears temporary rests. Manual cell
choices clear the affected group's temporary rest. Evolution pauses while a world
is pending and starts a fresh 2–4 beat interval on arrival.

Only cell selection and optional temporary rests evolve. Tuning, world, tempo,
manual mutes and note data do not. Preferences/locks save; evolution and temporary
rests restore off. Tests can supply a numeric seed to `new CellsHotPage(seed)`.

## Duration and decay

Each event captures `durationMode: "gate" | "decay"`. In gate mode the original
cell duration governs the score release. In decay mode the controls calculate:

`decayPulses = scale * (min(d, threshold) + stretch * max(0, d - threshold))`

Here `d` and threshold use the world's source/design pulses. **Decay scale** is
0.25–4× (default 1), **Long-note stretch** is 1–8× (default 1), and **Long-note
threshold** is 0.1–4 pulses (default 1). Convert the result with the same source
pulse duration as the note. Stretch leaves short notes unchanged; scale affects
both short and long notes. Gate mode ignores these controls.

`decayMs` controls modal decay only. `durationMs` still releases held bow/roll
excitation at the original deadline. Max captures both per strike and applies
identity protection: an old ending cannot cut off a newer keyboard or score hit.
Turning Respect cell durations off preserves normal Hotelier tails. Stop/watchdog
retain ownership of long decay tails so they can end them safely.

## OSC packets

Output is `/grid/out/page/b/cells`, with one JSON string argument. All packets use
the unique session created at Run. Event IDs are stable for a revision and onset.

- `start`: `{type:"start", session}`
- `sync`: `{type:"sync", session, now, deadlineMs, periodMs, humanizeMs, callbackLateMs, skippedLateEvents, events}`
- `replace`: `{type:"replace", session, voice, cutoffMs, events}`
- `replaceAll`: `{type:"replaceAll", session, cutoffMs, events}`
- `stop`: `{type:"stop", session}`

An event contains `{id, voice, hz, gain, onsetMs, durationMs, durationMode}` and,
in decay mode, `decayMs`. Voice numbers are 1–6. `onsetMs` is a same-host epoch
millisecond deadline; `periodMs = 1000 * lane.div / clock.rate`.

The clock carries its intended deadline through tick dispatch. Onsets anchor to
that deadline plus 100 ms, rather than to callback arrival. Expired events are
skipped, never replayed in a catch-up burst. `callbackLateMs` and per-sync
`skippedLateEvents` report callback timing and skipped attacks; neither measures
audible jitter or dropouts. The current clock still resynchronizes after a long
stall; no shared DSP sample-clock rewrite is included.

`replaceAll` validates the entire packet before cancelling any unsounded event
whose nominal onset is at or after cutoff. Replacement events must also be at or
after cutoff. A transition emits an empty sync heartbeat followed by one atomic
replacement packet, so Max retains fresh clock/humanization/watchdog information.
Existing sounding tails remain. The Max watchdog is `max(2000, 3 * periodMs)`.

The UI receives `/grid/out/page/b/view` on changes and `/action/refreshView`. It is
live state only (about 0.7 KB): selection, mutes, locks, running, and a `phase` anchor
`{pulse, atMs, periodMs}` (the pulse heard at `atMs`, same-host epoch ms; `null` while
cells is silent). The anchor is re-sent on the first pulse, on a tempo change and on any
view change, never per pulse: the web score runs its own playhead from it.

What only changes with the world goes to `/grid/ui/page/b/world` (names, notes, context,
world summaries, `pulsesPerBeat`, `sourceScale`, `cyclePulses`, and `score`: every
cell's `{lengthPulses, events: [{atPulse, durationPulses, gain}]}` in source pulses). It is
sent on init, focus, restore, a world change and `/action/refreshView`. `/grid/ui/...` is
**web-panel only**: the hosts never put it on the UDP wire, so Max doesn't get it.
Controls use `/grid/in/page/b/{cell/<row>/<choice>,mute/<row>,lock/<row>,ensemble/<index>,looper/<i>[/clear]}`
and `/action/{play,evolve,lockMode,applyRecommendation}`; row and choice indices are
zero-based. Existing `/setting/<key>` messages remain supported.

## Material and tuning

The original horn bank remains composed/inferred material. New Manjanin II,
Woloso-dòn and Pelayon banks contain source-derived arrangements and explicitly
labelled excerpts/filters, not verified recordings or universal traditional
models. Ango is omitted pending a defensible transcription. See
[cells-new-bank-sources.md](cells-new-bank-sources.md),
[cells-sources.md](cells-sources.md) and [timing research](cells-microtiming-research.md).

Hotelier tuning tables are independent snapshots of its keyboard scales, not a
live follow-selected-scale mode. They retain the 432 Hz key-69 anchor, Young's
keyboard ordering, and Ranat's 1207-cent period. Live Fine is not copied. Regenerate
with `node scripts/sync-hotelier-tunings.mjs /absolute/path/to/idk.tuning.js`.
