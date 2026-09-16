# Max ↔ daemon boot handshake

The contract a Max patch follows to bring the grid up in a known state when the patch
opens: check the daemon is alive, load a named preset, push whatever the patch owns
that the preset doesn't, then run normally.

Written against the daemon as of 2026-09-12. Addresses are the same ones the web UI
uses — both go through `createOscRouter()` in `src/core/oscRouter.ts`, which is why the
sim and the headless daemon behave identically.

The sibling doc is `../twistermapper/docs/max-handshake.md`. The phases are the same;
the differences are called out where they matter.

## Transport

- Daemon **listens** on UDP **57131**, **sends** on UDP **57130**, localhost.
- Both come from `configs/settings.json` → `osc.inPort` / `osc.outPort`, read once at
  boot. Changing them needs a daemon restart (`/grid/in/settings/...` refuses `osc.*`).
- Slots are letters `a`–`h`. Cells are `x` `0..15`, `y` `0..7`; LED levels are `0..15`.
- Page settings are typed per page (`/grid/out/pagespecs` carries the specs); the daemon
  clamps every write against them.

## Phase 0 — is the daemon up?

    Max  → /grid/in/ping <token>
    Max  ← /grid/out/pong <token>

`<token>` is echoed verbatim — any args, any types, in order — so use it to match the
reply to the request. No pong within ~500 ms means the daemon isn't running: the launchd
agent (`com.ianduclos.gridmapper`) is stopped, or a dev `npm run sim` has the ports.

The daemon emits `/grid/out/hello` plus a state snapshot **once, at its own boot**, and
nothing after. A patch opened later missed it, so **the patch must always initiate**;
there is no "daemon came up" broadcast to wait on. Give the patch a manual
"re-handshake" button rather than relying on it noticing a restart.

`/grid/in/heartbeat` is **not** a ping. It is deliberately inert — it answers nothing.
Every inbound message already counts as activity for the idle manager, so a `[metro]`
has an address it can hit forever that is guaranteed never to do anything else.

## Phase 1 — load the preset

In the web UI, click **recall** beside a saved preset in the presets box. Clicking
the preset name does the same thing; recalling the active preset restores its saved
state again. The `active: <name>` line confirms completion.

    Max  → /grid/in/preset/load <name>

The daemon rebuilds all eight slots from `configs/presets/<name>.json` and emits, in
this order:

    Max  ← /grid/out/page/<slot>/type <PageName>      (pages that announce; see below)
    Max  ← /grid/out/page/<slot>/settings <json>      (pages that have settings)
    Max  ← /grid/out/slots <8 page names>             (a..h, in order)
    Max  ← /grid/out/preset/active <name>

**Wait for `/grid/out/preset/active` carrying the name you asked for.** That is the
completion signal: it is emitted only after every slot's page has been constructed and
has announced itself. Send nothing before it arrives.

If it comes back **empty** (`""`), no preset is active — the load failed (bad name, or
no such file), and the previous layout is still running, untouched.

Notes on what you'll see along the way:

- **`/grid/out/slots` is the reliable layout signal.** `/grid/out/page/<slot>/type` is
  emitted by pages that choose to announce (`isometric`, `meadowphysics`, `basic`);
  `base`, `blank` and `screensaver` say nothing. `/grid/out/slots` always lists all
  eight.
- A page may announce **more than once** during a load, and the first burst is its
  DEFAULTS: a page announces from `init()`, again from `restore()` once its state is
  back, and again from `onFocus()` if it is the focused slot. Harmless, but it means you
  must treat the **last** value as current and `/grid/out/preset/active` as the end of the
  burst — latching the first `/settings` you see will latch the wrong one.
- A preset written against a page that no longer exists loads anyway: the unknown name
  degrades to the default page (`base`) with a warning in the log, rather than throwing.

### What a preset does and does not restore

A preset is the **pages**: which page runs in which slot, and that page's own state. It
is replayed in full — `isometric` comes back with its settings, its eight saved chords,
its four recorded loops and its track routing; `meadowphysics` comes back with its whole
patch (counters, ranges, speeds, the three target matrices, the rules).

What a preset does **not** carry, by design:

- **Anything the page is doing right now.** Held keys, sounding notes, the sustain
  pedal, the arpeggiator's current voice, a take mid-record. Loading a preset never makes
  a sound: restored loops come back *stopped* at the top of the loop, one press from
  playing, and a restored chord bank is stored, not ringing.
- **Focus.** Which slot you were looking at is not part of a preset — set it yourself
  with `/grid/in/focus/page` after the load if the patch cares.
- **The transport and the idle policy.** Clock rate, lane config, echo and the sleep
  timeouts live in `configs/settings.json` and are shared across every preset. Set them
  with `/grid/in/settings/...`; the clock always boots stopped regardless.

So phase 2 is now only for what the patch genuinely owns and the preset doesn't — often
nothing at all.

## Phase 2 — push the patch's values in

For each page setting the patch owns:

    Max  → /grid/in/page/<slot>/setting/<key> <value>

The daemon clamps against that page's declared spec, stores it, and repaints.

- **Nothing is echoed back.** A settings write that arrives over OSC deliberately does
  not emit the page's `/settings` reply on the OSC wire, so the patch cannot feed back
  on itself and needs no gate around its receive. The web UI still sees the change — it
  is not the thing that sent it — and a change made *from* the web UI still reaches Max.
- That discipline applies to the **canonical** form above, and to
  `/setting/<key>/<value>` and the plural `/settings/<key>`. Pages also tolerate a terse
  `/grid/in/page/<slot>/<key> <value>`; **that one still echoes**, so send the canonical
  form.
- `/grid/in/page/<slot>/settings/get` always replies — it is a request *for* the reply.
- Anything else a page emits while handling an OSC message (notes, chords, patterns,
  track state) goes out normally. Only the settings echo is suppressed.
- A burst of sets is fine. OSC input is not rate limited, and the LED reconciler diffs
  per 8×8 quadrant, so the grid settles over a frame or two rather than instantly.
  Nothing is dropped.

> Difference from twistermapper: there the echo-suppressed route is a value set
> (`/twister/in/page/<slot>/index/<i>/set`); here it is a settings write. Same principle,
> different path.

## Phase 3 — normal running

Unchanged from what a patch already does. Per-page output, e.g.:

    Max  ← /grid/out/page/<slot>/note <step> <1|0> <track>    isometric
    Max  ← /grid/out/page/<slot>/note <row 0..7> <1|0>        meadowphysics
    Max  ← /grid/out/page/<slot>/chords <json>                isometric
    Max  ← /grid/out/page/<slot>/patterns <json>              isometric
    Max  ← /grid/out/page/<slot>/tracks <json>                isometric
    Max  ← /grid/out/page/<slot>/cell/<x>/<y>/value <0|1>     basic

Pages in **unfocused** slots keep running and keep emitting — the app clock ticks every
loaded page, not just the visible one.

## Also available

### Presets

    /grid/in/preset/list              → /grid/out/preset/list <names…>
                                        + /grid/out/preset/active <name|"">
    /grid/in/preset/delete <name>     remove the file (the running layout is untouched;
                                        the marker clears if it was the active one)

Names must match `[A-Za-z0-9 _-]{1,48}` — no separators, no traversal. An invalid name
is ignored silently on delete; on load it reports `/grid/out/preset/active ""`.

**`/grid/in/preset/save <name>` exists but is refused over OSC.** Presets are made from
the web panel (`http://localhost:57191` → the presets box), which captures the live
machine — every slot's page and that page's own state. A patch loads and deletes; it
deliberately cannot overwrite a preset mid-set, where one stray message would silently
replace the thing you were about to recall. The router decides this by `origin`, so the
same address works from the panel and is dropped from the wire.

A preset file is a plain `SystemConfig` JSON under `configs/presets/` — the shape is in
`src/core/systemConfig.ts` — so hand-writing or generating one is fine too. Every field
is optional; the smallest useful preset is

    { "version": 1, "slots": { "a": { "page": "isometric" } } }

Slots you leave out come up as the default page; a page name that no longer exists falls
back to the default with a warning rather than failing the load.

### Layout

    /grid/in/slot/<a-h>/page <name>   change ONE slot, leaving the other seven's live
                                        state alone → /grid/out/slots
    /grid/in/focus/page <a-h>         switch the focused page → /grid/out/focus/page

A single-slot change means the layout no longer matches the preset it came from, so the
marker clears: you will see **`/grid/out/preset/active ""`** once, unprompted. Only treat
an empty active name as a *failure* when it arrives in reply to a load.

The live layout is persisted to `configs/slots.json` on every preset load, preset save
and slot change, and it is what the daemon boots into next time — so the machine comes
back up in the interface you left it in.

### Re-sync without reloading

If the patch reopens while the daemon keeps running, ask for state instead of re-running
phase 1 — this keeps every page's live runtime state (held notes, recorded patterns,
saved chords):

    /grid/in/preset/list                  → preset list + active name
    /grid/in/settings/get                 → /grid/out/settings <json>
    /grid/in/clock/get                    → /grid/out/clock <json>
    /grid/in/page/<slot>/settings/get     → /grid/out/page/<slot>/settings <json>

### Transport, power, device

    /grid/in/clock/run <0|1>          the one app clock (four lanes). Boots STOPPED.
    /grid/in/clock/tick [lane]        one manual step (drives an external lane)
    /grid/in/clock/reset
    /grid/in/wake · /grid/in/sleep    override the idle manager
    /grid/in/heartbeat                inert by design (see phase 0)
    /grid/in/connect                  force a fresh serialosc handshake
    /grid/in/shift <1|2> <1|0>        the two app-defined shift buttons (receive-only)
    /grid/in/key <x> <y> <0|1>        inject a key press, as if from the grid

## Failure modes worth handling in the patch

| Symptom | Meaning |
|---|---|
| No `/pong` | Daemon down, or the ports are held by a dev `npm run sim` |
| `/preset/active ""` right after a load | Load failed — bad name or missing file; the old layout is still running |
| A preset loads but a page is on its defaults | That page's captured config was unreadable, or the page doesn't implement `restore()` (only `isometric` and `meadowphysics` carry state). Check the daemon log |
| `/preset/active ""` out of nowhere | A slot was re-assigned (from the web UI or your own patch); the layout diverged from the preset |
| Nothing comes back from a settings write | Working as designed — OSC-originated settings writes don't echo. Use `/settings/get` to read back |
| A settings write echoes anyway | You sent the terse `/grid/in/page/<slot>/<key>` form; send `/setting/<key>` |
| `/grid/out/page/<slot>/type` never arrives | That page doesn't announce a type (`base`, `blank`, `screensaver`) — read `/grid/out/slots` instead |
| Keys stop arriving, LEDs still work | serialosc's key routing was disturbed — something queried discovery while connected. Send `/grid/in/connect`, or restart the agent (see CLAUDE.md's serialosc gotchas) |
| Everything stops mid-session | Daemon restarted; re-run phases 0–2 |
