# Cells Hot packet contract

`cells-hot` is the Gridmapper page for hotelier slot **b**. Its only performance
output is `/grid/out/page/b/cells` with one JSON string argument. Every packet has a
unique `session` created at explicit Run; event `id`s are stable within that session.

`start` is `{type:"start",session}`. `sync` is
`{type:"sync",session,now,periodMs,humanizeMs,events}` and is emitted once on every
selected clock-lane pulse, even when `events` is empty. Each event is
`{id,voice,hz,gain,onsetMs,durationMs}`; `voice` is 1–6 and `onsetMs` is an absolute
same-host `Date.now()` deadline buffered at least 100 ms ahead.

Cell or phase changes, and mute/unmute, send
`{type:"replace",session,voice,cutoffMs,events}`. `cutoffMs` is `Date.now()+100`;
Max cancels unsounded events for that voice at or after that deadline and installs the
replacement remainder. Muting uses an empty `events` array; unmuting only schedules
future events, so neither operation creates a retroactive attack. `stop` is
`{type:"stop",session}` and clears the session queue and any notes it owns.

The page uses the actual selected app-clock lane rate: `periodMs = 1000 * lane.div /
clock.rate`. Run sets the shared app clock to **12 / 1.66 = 7.22891566 Hz**, one pulse
per tick, then starts it; Stop stops that shared transport. It never changes transport
state on page load or preset restore. The first received lane tick establishes a fresh
phase-zero epoch, so a stopped/restarted session never inherits an old clock counter.
The Max watchdog should treat `max(2000, 3 * periodMs)` without a sync as a timeout.

Rows 0–5 select one of three paired source-bank cells or mute a voice; columns 5–15
show that cell's phase progress, with a bright pending-onset flash. The bottom row has
Run, Stop and the starter bank's `lock`, `hollow`, and `long` ensembles. Tuning is
either the bank's tritave map (root 82 Hz and steps 0/3/7/11/14/18), absolute beating,
or absolute source estimates; `rootMultiplier`, lane and 0–4 ms Max-side humanization
serialize with the page. Gridmapper never applies local timing jitter.
