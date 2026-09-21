# Cells-hot v2 verification — 2026-09-21

## Gridmapper

`npx tsc --noEmit` passed. `npm test` passed **447 tests in 30 files**.
Coverage includes source arrays, tuning bounds, original banks, clock deadline
propagation, fractional durations, world boundaries with late callbacks, pending
replacement/recommendations, silent restoration, manual cell mute/rejoin, authored
paired evolution, seeded replay, locks, eight-beat protection, optional rests and
unchanged short-note decay under stretch.

An isolated temporary server on localhost:57192 served the real web panel and
CellsHotPage with AppClock, without OSC, hardware or config persistence. Browser
checks covered named banks/cells/ensembles, separate tuning groups, recommendation
state, pending bank feedback, evolution/rest toggles, manual mute on a locked row,
and rejoining through a different cell. No browser warnings/errors were recorded.
The preview was stopped and closed; the user's localhost:57191 daemon was not
restarted.

## Timing measurements and limits

| Quantity | Evidence in this release |
| --- | --- |
| Grid callback timing | 1,346 lane-0 callbacks during isolated UI use; arrival minus intended deadline: min −1.995 ms, p95 +2.030 ms, max +5.390 ms. Early fractional deadlines are reported as measured, not clamped. |
| OSC arrival / Max arming | Offline scheduler/resolver tests passed; new live measurement pending Max installation. |
| Slot capacity | Tests cover fifth-event deferral, the full 10 ms recycle guard, replacement freeing slots, and explicit impossible-deadline drops. |
| Audible onset error | Not newly measured. Grid callback lateness is not audible jitter. |
| Release discontinuity | Staged DSP regression reports −76.4 dB after 120 ms and −1.79 dB splatter; simulated regression, not a new live recording. |
| Audio dropouts | Not newly measured. No audio ran through the isolated preview. |

Do not infer an improvement in audible timing from the callback results alone.
The earlier Max timing measurements remain historical evidence and are identified
as such in Hotelier's playback document.

## Hotelier offline compatibility

Fresh checks passed:

- `node tests/cells-playback.cjs`
- `node tests/score-arm.cjs`
- `node tests/cells-voice-gate.cjs`
- `node tests/poly-voices.cjs`
- `node tests/modal-control.cjs`
- `tests/score-schedule.cjs` against the staged, generated four-input/ten-output DSP

The staged DSP used `--feedback --tremolo`; the active Gen file was not replaced.
The unequal-duration probe measured a 0.900 s modal T60 with 400 ms excitation
release. Slot execution, duration-off, freeze/hold protection and stale identities
pass the DSP tests. Decay ownership remains available for Stop/watchdog after the
original excitation duration, bounded to the latest score owner per voice.

No live Max objects, open patches, DSP reloads or user presets were changed by this
release task. Live installation and real OSC/recorded-audio verification remain
with the other Max agent. See [rollout handoff](cells-v2-rollout.md).
