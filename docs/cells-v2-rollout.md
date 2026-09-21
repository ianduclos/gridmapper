# Cells-hot v2 integration handoff

This release has two independently installed halves. Do not restart the live
Gridmapper daemon until the Max owner has installed and verified the receiver,
resolver and DSP compatibility together. The current Gridmapper process can keep
running its loaded v1 code while these source edits are reviewed.

## Max owner

The Hotelier checkout contains changes to `idk.cells.playback.js`,
`idk.modal.voices.js` and `scripts/build-modal-poly.py`. The playback contract and
installation checks are in Hotelier's `docs/CELLS-PLAYBACK.md`. Use the existing
live-edit workflow and preserve the open patch's unrelated edits. Do not replace
an open patch with a disk copy.

Required capabilities:

1. Atomic `replaceAll` accepted, with validation before cancellation.
2. Optional per-event `decayMs` reaches `scorearm` after its stamp argument.
3. Active Gen exposes `armDecay0` through `armDecay3`. Its I/O configuration must
   match the active instrument (currently four inputs / ten outputs).
4. `durationMs=400, decayMs=900` gives independent excitation release and decay.
5. Four pending slots per voice, with the same 10 ms recycle guard as the sender.

The scheduler now limits its own unsounded arms to the four available slots.
Predictable overflow waits for recycle; impossible deadlines produce an explicit
`score-slots-full` status. There is no resolver acknowledgement: interference
from another direct `scorearm` sender remains outside that capacity model.

## Gridmapper install and listening

After those capabilities are confirmed, restart the existing launchd Gridmapper
service. Restore must remain stopped. Check the new Included tunings / Hotelier
scales groups, named ensembles and cells, recommendation controls, decay controls,
row locks, Auto-evolve and Allow silence.

Record audio and status logs while switching worlds repeatedly, changing cells,
and operating the UI. Test decay with unequal duration and decay values, old-ending
protection after a keyboard hit, duration-off, stop and disconnection. Measure
callback lateness, OSC arrival, arm lead/late counts, capacity drops, audible onset
error, release discontinuities and audio dropouts separately. Software tests and
an isolated UI preview cannot certify live audio timing.

Ango is deliberately absent: source metadata alone did not provide a defensible
attack-level reconstruction. The other new banks are source-derived arrangements;
see `cells-new-bank-sources.md` for exact excerpts and adaptations. Listening
acceptance remains Ian's check.
