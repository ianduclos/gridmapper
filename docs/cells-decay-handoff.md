# Max coordination: cell duration as decay

Requested by Ian, 2026-09-21. The Max timing agent owns DSP/scheduler changes;
this Gridmapper change does not edit or reload Max.

Each prepared event adds `durationMode: "gate" | "decay"` to the existing
`id, voice, hz, gain, onsetMs, durationMs` fields. Missing mode means `gate`.
The value is captured per event, including replacement events. Gate remains the
default. Grid's UI labels decay as needing the Max update until integration is
confirmed. Changing the option preserves phase and replaces only future events.

- **gate**: current timed ending and short click-safe release.
- **decay**: derive a per-strike modal decay from `durationMs` (milliseconds,
  not the instrument Tail multiplier). Treat this as a nominal decay-time
  target; preserve the material's relative mode decay relationships. If mapping
  uses an approximate normalization, document that rather than claiming an exact
  whole-output T60. Do not merely add a faster output envelope: that cannot
  lengthen an already shorter resonator decay.
- In decay mode release held excitation at the cell deadline, without closing
  the score output gate there. Natural modal decay provides the ending.
- Saved sound/Tail/damping settings stay unchanged; keyboard and later notes
  regain their normal captured settings. Respect cell durations off bypasses
  both score duration modes. Identity checks protect later hits in both modes.
- Stop, unload, cancellation and disconnection retain existing cleanup. Execute
  attacks and endings in the new deadline-safe path, not a V8 callback fallback.

Verify two equal strikes whose durationMs values differ 4×, under several
materials: audibly/measurably distinct decays, preserved pitch, no discontinuity
at the old gate deadline, no saved Tail mutation, no inheritance by a later
keyboard strike, and old endings unable to cut new notes. Include a live
Gridmapper → OSC → Max check before removing the UI's pending label.

## Optional selected-scale synchronization (not implemented)

Gridmapper now includes all nine Hotelier tables as independent tuning buttons.
Automatic following remains separate future work. The existing Max grid bridge
receives `tuninginfo(id,count,period)` but sends only page-a keyboard settings.
A future follow mode needs `/grid/in/page/b/hotelier/tuning <id> <count> <period>`
on every tuning change and handshake. Agree on Fine/root handling before adding
that mode; Gridmapper currently has no receiver for this proposed message.
