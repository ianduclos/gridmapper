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
| Cell choices / mute | x=1–3 / x=4, y=0–5 |
| Rhythm banks / tuning banks / cells view | x=1 / 2 / 3, y=6 |
| Auto-evolve / lock-edit mode | x=4 / 5, y=6 |
| Apply current or pending world's recommendation | x=6, y=6 |
| Run / Stop | x=1 / 2, y=7 |
| Three ensemble recalls | x=4–6, y=7 |

In lock-edit mode, each row's mute button toggles its evolution lock. Cell
buttons remain playable. Tuning-bank view puts five **Included tunings** on
y=0, x=1–5 and nine **Hotelier scales** on y=1, x=1–9. Rhythm-bank choices occupy
x=1–15 in reading order. Bank view and lock-edit mode are temporary.

The web panel names every cell and ensemble, exposes row locks, and shows the
recommended tuning with its basis. **Apply recommendation** is explicit: changing
a rhythm world never retunes automatically. Applying a pending world's
recommendation queues it with that world. Selecting another pending world clears
that queued recommendation. Choosing a tuning manually also cancels it.

## Phase and world changes

The transport's saved pulse rate defaults to `12 / 1.66` Hz. Run applies that rate
to the selected clock lane. Existing banks retain their previous speed. One shared
performance beat is three transport pulses; each world separately declares its
source/design pulses per performance beat (three for legacy and Mande banks,
four for Pelayon). Thus source pulse duration is `3 * periodMs / pulsesPerBeat`.
Performance grouping is documented separately from claims about traditional meter.

A whole-world request chooses the first shared beat strictly beyond the 100 ms
playback buffer. A newer request replaces the pending choice; selecting the
current world cancels it. All six future schedules change at one cutoff, with the
new world at the corresponding global phase. No phrase restarts, missed-attack
replays, artificial entry strikes, or automatic tuning changes occur. Current
manual mutes and evolution locks survive the transition.

Individual cell choices remain immediate with the short playback-buffer delay.
Page changes do not stop the sequencer. Stop clears the session and sequencer-owned
notes. Restart establishes phase zero; restoring a preset never starts playback.
Selections, manual mutes, tuning, settings and locks persist.

## Controlled evolution

Auto-evolve defaults off. A seeded decision stream considers one authored compatible
group every 2–4 performance beats, with a 50% chance of leaving the arrangement
alone. Linked parts change together; authored foundation rows are excluded. A lock
on either member protects its entire linked group. Manual cell and ensemble
choices protect the affected groups for eight beats, even if an ensemble was
already selected. Manual choices remain possible on locked rows.

**Allow silence in evolution** defaults off. When enabled, a non-resting group has
a 25% rest choice on a change opportunity. Its next actual change rejoins a
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

The UI receives `/grid/out/page/b/view` on changes and `/action/refreshView`.
Controls use `/grid/in/page/b/{cell/<row>/<choice>,lock/<row>,ensemble/<index>}`
and `/action/{evolve,lockMode,applyRecommendation}`; row and choice indices are
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
