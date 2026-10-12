# Clips page (gridmapper side of idk.clips) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A `clips` page for the monome grid 128 that launches Ableton Live Session-view clips through the idk.clips AbletonOSC fork, over a new second OSC link (`ctx.live`, UDP 11000/11001).

**Architecture:** `src/io/liveLink.ts` is a second OSC peer, kept apart from the Max link and handed to pages as `ctx.live`. All page logic lives in a pure module, `src/util/clipsState.ts`. It takes `(state, input, nowMs)` and returns the messages to send, plus a pure `clipsFrame()` for the LEDs. The page, `src/pages/clips.ts`, is a thin shell: it wires `ctx.live`, one link timer, SharedStore `focus/clips` and Max's `/focus/track` to that module.

**Tech Stack:** Node + TypeScript (NodeNext ESM, `.js` import extensions), the `osc` npm package via `io/osc.ts`, vitest.

**Spec:** `~/_SecondBrain/02_Areas/_Coding/Max MSP/Max for Live/idk.clips/docs/superpowers/specs/2026-10-12-clip-launcher-design.md`. It is the source of truth, owned by idk.clips; nothing here edits it. Read it with this plan. The page contract is `docs/PAGE_PROTOCOL.md`.

**Ian's calls on 2026-10-12, which narrow the spec:**
- **C1:** The V layer's master column (x15) only shows master volume and sends nothing. The contract has no master address yet.
- **C2:** **Hold-to-cue is dropped from v1.** The feed doesn't carry a clip's launch mode, or a track's playing clip when it's outside the window. Staged launch is the only experiment.
- **C3:** x0 y7 becomes the **pages key**: hold it, then press x0–x7 on y0 to focus slot a–h. The page uses the whole grid, so without this you couldn't leave it from the grid.

**Working rules:** commit on `main`, as this repo always has. Stage files by path, never `git add -A`: `configs/*.json` carries uncommitted runtime state that must not ride along. Don't edit anything under idk.clips.

## Global Constraints

- Grid 128 only (16×8). The clip window and Live's red box are **15 tracks × 6 scenes**.
- The Live link sends to **UDP 11000** and listens on **UDP 11001**, loopback only (Live runs on this Mac). It stays separate from the Max link (57131/57130). Live traffic never goes to Max or the web panel.
- The page obeys `docs/PAGE_PROTOCOL.md`: LEDs only through `render()`, and **no `src/io` imports from the page**. It reaches Live only through `ctx.live`.
- Clips and scenes are addressed by **absolute** track/scene index, so banking while a key is held can't misfire.
- Layout `y7`: `x0` pages key (C3) · `x1–5` = layers C M S A V · `x6–10` unassigned · `x11–14` = ← → ↑ ↓ · `x15` = local corner shift ⇧.
- Arrows bank one full window (15 tracks / 6 scenes); ⇧ + arrow steps by one. Offsets clamp to the set size.
- Tap a layer key to latch it; hold it (>~300 ms) for momentary. Tap C to return.
- Experiments sit behind page settings and are **off by default**. Only staged launch remains (C2).
- Brightness values live in **one table** (`LEVEL`) so they can be tuned later. Clip colour is not used.
- Cross-page focus: the track of the last launched clip goes to `SharedStore` under **`focus/clips`** (one writer) and to Max as **`/grid/out/page/<slot>/focus/track <n>`**.
- No reply from the fork → show the no-link pattern and resend **`/clips/hello` every 2 s**.
- Before every commit: `npx tsc --noEmit` clean and `npm test` green. The baseline on 2026-10-12 is 41 files and 549 tests.

## Review Focus

1. **A key held across a bank move or a layer change.** Its release must go to the absolute slot it pressed, not to whatever sits under the finger now. Pinned in Task 3: "a release after a bank move…" and "a release after switching layer…".
2. **Feed messages out of step after a bank move.** A `/clips/tracks` or `/clips/scenes` still describing the old offset must never be drawn or toggled against the new window. Pinned in Task 3 ("toggles nothing while the track feed is for another bank") and Task 4 ("track rows stay dark…").
3. **Malformed or short packets from the fork** (wrong argument count, strings, NaN, an unknown path). They're ignored without throwing and don't count as a live link. Pinned in Task 2.
4. **Live quits after the link was up.** The window feed is silent while nothing changes, so the page must still notice. Within ~12 s it shows no-link and starts the 2 s retry, then recovers when a snapshot arrives. Pinned in Task 2's link tests.
5. **A set smaller than the window, or empty** (3 tracks × 2 scenes; 0 × 0). Code-0 slots send nothing, every arrow sits at its edge, nothing divides by zero. Pinned in Task 3 ("a set smaller…", "an empty set…") and Task 4 (arrow edge levels).

---

## File map

| File | Status | Responsibility |
|---|---|---|
| `src/core/types.ts` | modify | `LiveLink` interface; optional `PageContext.live` |
| `src/io/liveLink.ts` | create | the UDP peer: bind 11001 on loopback, send to 11000, fan messages out to listeners |
| `src/core/settings.ts` | modify | `osc.liveInPort` / `osc.liveOutPort` (boot-only, like `twisterPort`) |
| `src/cli/sim.ts`, `src/cli/index.ts` | modify | open the link, put it on `baseCtx.live`, close on shutdown |
| `src/util/clipsState.ts` | create | the pure model: feed parsing, offsets, link liveness, keys, layers, faders, staging, the LED table and frame |
| `src/core/sharedStore.ts` | modify | `FOCUS_CLIPS = "focus/clips"` |
| `src/pages/clips.ts` | create | the page shell: ctx wiring, timer, settings, keymap |
| `src/cli/clips-fake-live.ts` + `package.json` script | create | a stand-in fork, so Ian can see the page in the web sim before idk.clips exists |
| `test/clipsFixtures.ts` | create | builders for fork messages and a linked state (no tests in it) |
| `test/liveLink.test.ts`, `test/clipsFeed.test.ts`, `test/clipsKeys.test.ts`, `test/clipsFrame.test.ts`, `test/clipsStaged.test.ts`, `test/clipsPage.test.ts` | create | coverage per task |
| `docs/clips-contract-notes.md` | create | the page's readings of the contract, for idk.clips to confirm |
| `CLAUDE.md`, `docs/PAGE_PROTOCOL.md`, `HANDOFF.md` | modify | layout, ports, the `ctx.live` exception, session log |

The pure module stays in `src/util/`. The registry loads every file in `src/pages/` and warns on any file without a `page` export.

---

### Task 1: The Live link (`ctx.live`)

**Files:**
- Modify: `src/core/types.ts` (add the `LiveLink` interface beside `PageContext`; add `live?` to `PageContext` after `shared?`)
- Create: `src/io/liveLink.ts`
- Modify: `src/core/settings.ts` (type at `osc:` ~line 29, `DEFAULT_SETTINGS` ~line 54, loader ~line 115)
- Modify: `src/cli/sim.ts` (after the `twisterOsc` line ~123; `baseCtx` ~line 172; the SIGINT handler ~line 254)
- Modify: `src/cli/index.ts` (after the `twisterOsc` line ~87; `baseCtx` ~line 127; `shutdown` ~line 215)
- Test: `test/liveLink.test.ts`, `test/settings.test.ts` (add one case)

**Interfaces:**
- Produces: `interface LiveLink { send(path: string, ...args: Array<number | string | boolean>): void; on(fn: (path: string, args: any[]) => void): () => void }` in `core/types.ts`, and `PageContext.live?: LiveLink`.
- Produces: `createLiveLink(opts: { inPort: number; outPort: number }, makeOsc?): LiveLink & { close(): void }`.
- Produces: `Settings.osc.liveInPort` (default 11001) and `Settings.osc.liveOutPort` (default 11000).

- [ ] **Step 1: Write the failing tests**

`test/liveLink.test.ts`:

```ts
import { describe, it, expect, vi } from "vitest"
import { createLiveLink } from "../src/io/liveLink.js"

function fakeOsc() {
	const sent: Array<{ path: string; args: any[] }> = []
	let deliver: (path: string, args: any[]) => void = () => {}
	let opened: unknown
	const close = vi.fn()
	const make = (o: any) => {
		opened = o
		return {
			send: (path: string, ...args: any[]) => { sent.push({ path, args }) },
			onMessage: (cb: (path: string, args: any[]) => void) => { deliver = cb },
			close,
		}
	}
	return { make, sent, close, incoming: (p: string, ...a: any[]) => deliver(p, a), opened: () => opened }
}

describe("liveLink", () => {
	it("binds the in-port on loopback and sends to the out-port", () => {
		const f = fakeOsc()
		createLiveLink({ inPort: 11001, outPort: 11000 }, f.make)
		expect(f.opened()).toEqual({ localAddress: "127.0.0.1", localPort: 11001, remotePort: 11000 })
	})

	it("sends straight through", () => {
		const f = fakeOsc()
		const link = createLiveLink({ inPort: 11001, outPort: 11000 }, f.make)
		link.send("/clips/slot/button", 3, 2, 1)
		expect(f.sent).toEqual([{ path: "/clips/slot/button", args: [3, 2, 1] }])
	})

	it("fans every message out to each listener until it unsubscribes", () => {
		const f = fakeOsc()
		const link = createLiveLink({ inPort: 11001, outPort: 11000 }, f.make)
		const a: string[] = []
		const b: string[] = []
		const offA = link.on((p) => a.push(p))
		link.on((p) => b.push(p))
		f.incoming("/clips/beat", 1)
		offA()
		f.incoming("/clips/beat", 2)
		expect(a).toEqual(["/clips/beat"])
		expect(b).toEqual(["/clips/beat", "/clips/beat"])
	})

	it("a listener that throws doesn't stop the others", () => {
		const f = fakeOsc()
		const link = createLiveLink({ inPort: 11001, outPort: 11000 }, f.make)
		const err = vi.spyOn(console, "error").mockImplementation(() => {})
		const got: string[] = []
		link.on(() => { throw new Error("boom") })
		link.on((p) => got.push(p))
		f.incoming("/clips/hello")
		expect(got).toEqual(["/clips/hello"])
		expect(err).toHaveBeenCalled()
		err.mockRestore()
	})

	it("close() closes the socket", () => {
		const f = fakeOsc()
		createLiveLink({ inPort: 11001, outPort: 11000 }, f.make).close()
		expect(f.close).toHaveBeenCalled()
	})

	it("round-trips a real datagram over loopback", async () => {
		const port = 47000 + Math.floor(Math.random() * 1000)
		const link = createLiveLink({ inPort: port, outPort: port }) // talks to itself
		try {
			const got = new Promise<{ path: string; args: any[] }>((resolve) =>
				link.on((path, args) => resolve({ path, args })),
			)
			link.send("/clips/hello")
			const timeout = new Promise((_, reject) => setTimeout(() => reject(new Error("no datagram")), 1000))
			await expect(Promise.race([got, timeout])).resolves.toEqual({ path: "/clips/hello", args: [] })
		} finally {
			link.close()
		}
	})
})
```

Add to `test/settings.test.ts`, inside the `describe("SettingsStore.apply", …)` block, which is where `store()` is defined. The file already imports `writeFileSync`, `loadSettings` and `DEFAULT_SETTINGS`, and has `tmp()` at the top:

```ts
	it("carries the Live link's ports, boot-only", () => {
		expect(DEFAULT_SETTINGS.osc.liveOutPort).toBe(11000)
		expect(DEFAULT_SETTINGS.osc.liveInPort).toBe(11001)
		const path = tmp()
		writeFileSync(path, JSON.stringify({ osc: { liveInPort: 12001, liveOutPort: 12000 } }))
		const s = loadSettings(path)
		expect(s.osc.liveInPort).toBe(12001)
		expect(s.osc.liveOutPort).toBe(12000)
		expect(s.osc.inPort).toBe(DEFAULT_SETTINGS.osc.inPort)
		expect(store().apply("osc/liveInPort", 9999)).toBe(false)
	})
```

- [ ] **Step 2: Run them to make sure they fail**

Run: `npx vitest run test/liveLink.test.ts test/settings.test.ts`
Expected: FAIL. `liveLink.ts` can't be resolved, and `liveOutPort` is undefined.

- [ ] **Step 3: Add the type**

In `src/core/types.ts`, insert just above `export interface PageContext {`:

```ts
/**
 * A second OSC peer beside Max: today the idk.clips AbletonOSC fork inside Ableton Live
 * (io/liveLink.ts, UDP 11000 out / 11001 in). Its traffic never reaches Max or the web.
 */
export interface LiveLink {
	send: (path: string, ...args: Array<number | string | boolean>) => void
	/** Hear every message from Live. Returns the unsubscribe; call it from dispose(). */
	on: (fn: (path: string, args: any[]) => void) => () => void
}

```

Then inside `PageContext`, after the `shared?:` line:

```ts
	/** The Ableton Live link. Absent in bare test rigs; only pages/clips.ts uses it. */
	live?: LiveLink
```

- [ ] **Step 4: Write the link**

`src/io/liveLink.ts`:

```ts
// src/io/liveLink.ts — the OSC link to Ableton Live (the idk.clips AbletonOSC fork).
//
// A second peer beside the Max link (io/osc.ts's main socket), never mixed with it: Live's
// traffic never reaches Max or the web panel, and Max's never reaches Live. The fork listens
// on 11000 and replies to 11001 (AbletonOSC's own defaults). We bind 11001 on loopback only,
// since Live runs on this Mac, and send from that same socket. Pages see it as ctx.live;
// only pages/clips.ts uses it. A port already taken is logged by io/osc.ts and leaves the
// clips page showing "no link"; nothing else in gridmapper depends on it.

import { createOsc, type Osc } from "./osc.js"
import type { LiveLink } from "../core/types.js"

export type LiveLinkHandle = LiveLink & { close: () => void }
type MakeOsc = (opts: { localAddress: string; localPort: number; remotePort: number }) => Osc

export function createLiveLink(
	opts: { inPort: number; outPort: number },
	makeOsc: MakeOsc = (o) => createOsc(o),
): LiveLinkHandle {
	const osc = makeOsc({ localAddress: "127.0.0.1", localPort: opts.inPort, remotePort: opts.outPort })
	const listeners = new Set<(path: string, args: any[]) => void>()
	osc.onMessage((path, args) => {
		for (const fn of [...listeners]) {
			try {
				fn(path, args)
			} catch (err) {
				console.error("[live] listener threw:", err)
			}
		}
	})
	return {
		send: (path, ...args) => osc.send(path, ...args),
		on: (fn) => {
			listeners.add(fn)
			return () => {
				listeners.delete(fn)
			}
		},
		close: () => osc.close(),
	}
}
```

- [ ] **Step 5: Add the ports to settings**

In `src/core/settings.ts`, add to the `osc` type after `twisterPort: number`:

```ts
		/** The Ableton Live link (io/liveLink.ts): the idk.clips fork listens here… */
		liveOutPort: number
		/** …and replies here. Boot-only, like every osc.* port. */
		liveInPort: number
```

Change the default to:

```ts
	osc: { inPort: 57131, outPort: 57130, twisterPort: 57121, liveOutPort: 11000, liveInPort: 11001 },
```

In the loader's `osc:` block, add after the `twisterPort` line:

```ts
			liveOutPort: cleanPort(oscNode.liveOutPort, DEFAULT_SETTINGS.osc.liveOutPort),
			liveInPort: cleanPort(oscNode.liveInPort, DEFAULT_SETTINGS.osc.liveInPort),
```

- [ ] **Step 6: Wire both entry points**

In **both** `src/cli/sim.ts` and `src/cli/index.ts`:

Add to the imports:

```ts
import { createLiveLink } from "../io/liveLink.js"
```

Just below the `const twisterOsc = createOscSender(settings.osc.twisterPort)` line, add:

```ts
// Ableton Live (the idk.clips fork): its own socket, never mixed with Max's. Only the
// clips page uses it; if 11001 is taken the page just shows "no link".
const live = createLiveLink({ inPort: settings.osc.liveInPort, outPort: settings.osc.liveOutPort })
```

In `baseCtx`, after `shared: new SharedStore(),`:

```ts
	live,
```

In `src/cli/index.ts`'s `shutdown`, next to `osc.close()`:

```ts
		try { live.close() } catch {}
```

In `src/cli/sim.ts`'s SIGINT handler, next to `try { osc.close() } catch {}`:

```ts
		try { live.close() } catch {}
```

- [ ] **Step 7: Run the tests and the type check**

Run: `npx vitest run test/liveLink.test.ts test/settings.test.ts && npx tsc --noEmit`
Expected: PASS, with no type errors.

- [ ] **Step 8: Run the whole suite**

Run: `npm test`
Expected: PASS (549 + 7).

- [ ] **Step 9: Commit**

```bash
git add src/core/types.ts src/io/liveLink.ts src/core/settings.ts src/cli/sim.ts src/cli/index.ts test/liveLink.test.ts test/settings.test.ts
git commit -m "feat(live): second OSC peer for Ableton Live (ctx.live, UDP 11000/11001)"
```

---

### Task 2: Clips model — feed, offsets, link liveness

**Files:**
- Create: `src/util/clipsState.ts`
- Create: `test/clipsFixtures.ts` (helpers only; vitest runs `*.test.ts`)
- Test: `test/clipsFeed.test.ts`

**Interfaces:**
- Produces, all exported from `src/util/clipsState.ts`:
  - `COLS = 15`, `ROWS = 6`, `SLOTS = 90`
  - `SLOT`, `TRACK`, `SCENE` code tables
  - `HELLO_RETRY_MS = 2000`, `QUIET_PROBE_MS = 10000`, `BEAT_STALE_MS = 2000`
  - types `Layer`, `Send`, `WindowView`, `TracksView`, `ScenesView`, `DownKey`, `Staged`, `ClipsState`
  - `createClipsState(): ClipsState`
  - `applyLive(st, path: string, args: unknown[], nowMs: number): boolean`
  - `maxOffset(count, size): number`
  - `nextOffset(off, count, size, dir: -1 | 1, step): number`
  - `linkTick(st, nowMs): Send[]`
- Produces from `test/clipsFixtures.ts`: `T0`, `SetShape`, `windowMsg(o?)`, `tracksMsg(o?)`, `scenesMsg(o?)`, `linked(o?, nowMs?)`.

- [ ] **Step 1: Write the fixtures**

`test/clipsFixtures.ts`:

```ts
// Builders for the fork's /clips messages, shaped like a real set. Not a test file.
import { createClipsState, applyLive, COLS, ROWS, SLOT, TRACK, SCENE, type ClipsState } from "../src/util/clipsState.js"

export const T0 = 10_000 // a "now" comfortably past zero

export interface SetShape {
	trackOff?: number
	sceneOff?: number
	nTracks?: number
	nScenes?: number
	/** Slot code by window cell (x 0-14, y 0-5); cells past the set are SLOT.none anyway. */
	fill?: (x: number, y: number) => number
	/** Extra track flag bits by window column; `exists` is added for real tracks. */
	flag?: (x: number) => number
	vol?: (x: number) => number
	master?: number
	/** Scene code by window row. */
	scene?: (y: number) => number
}

const shape = (o: SetShape) => ({
	trackOff: 0, sceneOff: 0, nTracks: 40, nScenes: 20,
	fill: (_x: number, _y: number) => SLOT.stopped as number,
	flag: (_x: number) => 0,
	vol: (_x: number) => 0.85,
	master: 0.85,
	scene: (_y: number) => SCENE.present as number,
	...o,
})

export function windowMsg(o: SetShape = {}): number[] {
	const s = shape(o)
	const slots: number[] = []
	for (let y = 0; y < ROWS; y++)
		for (let x = 0; x < COLS; x++)
			slots.push(s.trackOff + x < s.nTracks && s.sceneOff + y < s.nScenes ? s.fill(x, y) : SLOT.none)
	return [s.trackOff, s.sceneOff, s.nTracks, s.nScenes, ...slots]
}

export function tracksMsg(o: SetShape = {}): number[] {
	const s = shape(o)
	const real = (x: number) => s.trackOff + x < s.nTracks
	return [
		s.trackOff,
		...Array.from({ length: COLS }, (_, x) => (real(x) ? TRACK.exists | s.flag(x) : 0)),
		...Array.from({ length: COLS }, (_, x) => (real(x) ? s.vol(x) : 0)),
		s.master,
	]
}

export function scenesMsg(o: SetShape = {}): number[] {
	const s = shape(o)
	return [s.sceneOff, ...Array.from({ length: ROWS }, (_, y) => (s.sceneOff + y < s.nScenes ? s.scene(y) : SCENE.none))]
}

/** A state that has heard a full snapshot (window, tracks, scenes) from the fork. */
export function linked(o: SetShape = {}, nowMs = T0): ClipsState {
	const st = createClipsState()
	applyLive(st, "/clips/window", windowMsg(o), nowMs)
	applyLive(st, "/clips/tracks", tracksMsg(o), nowMs)
	applyLive(st, "/clips/scenes", scenesMsg(o), nowMs)
	return st
}
```

- [ ] **Step 2: Write the failing tests**

`test/clipsFeed.test.ts`:

```ts
import { describe, it, expect } from "vitest"
import {
	createClipsState, applyLive, linkTick, nextOffset, maxOffset,
	SLOT, TRACK, SCENE, COLS, ROWS, HELLO_RETRY_MS, QUIET_PROBE_MS,
} from "../src/util/clipsState.js"
import { windowMsg, tracksMsg, scenesMsg, T0 } from "./clipsFixtures.js"

const hellos = (sends: { path: string }[]) => sends.filter((m) => m.path === "/clips/hello").length

describe("clips feed", () => {
	it("reads a window: offsets, set size and 90 slot codes, row-major", () => {
		const st = createClipsState()
		const msg = windowMsg({ trackOff: 15, sceneOff: 6, fill: (x, y) => (x === 2 && y === 1 ? SLOT.playing : SLOT.stopped) })
		expect(applyLive(st, "/clips/window", msg, T0)).toBe(true)
		expect(st.win).toMatchObject({ trackOff: 15, sceneOff: 6, nTracks: 40, nScenes: 20 })
		expect(st.win!.slots).toHaveLength(COLS * ROWS)
		expect(st.win!.slots[1 * COLS + 2]).toBe(SLOT.playing)
		expect(st.linked).toBe(true)
		expect(st.lastHeardMs).toBe(T0)
	})

	it("reads tracks (flags, volumes, master) and scenes", () => {
		const st = createClipsState()
		applyLive(st, "/clips/tracks", tracksMsg({ trackOff: 15, flag: (x) => (x === 0 ? TRACK.mute | TRACK.playing : 0), vol: () => 0.5, master: 0.7 }), T0)
		applyLive(st, "/clips/scenes", scenesMsg({ sceneOff: 6, scene: (y) => (y === 2 ? SCENE.triggered : SCENE.present) }), T0)
		expect(st.tracks!.trackOff).toBe(15)
		expect(st.tracks!.flags[0]).toBe(TRACK.exists | TRACK.mute | TRACK.playing)
		expect(st.tracks!.volumes[3]).toBe(0.5)
		expect(st.tracks!.master).toBe(0.7)
		expect(st.scenes).toEqual({ sceneOff: 6, codes: [1, 1, 2, 1, 1, 1] })
	})

	it("remembers the beat and when it came", () => {
		const st = createClipsState()
		applyLive(st, "/clips/beat", [12], T0 + 5)
		expect(st.beat).toBe(12)
		expect(st.beatAtMs).toBe(T0 + 5)
	})

	it("ignores short, non-numeric or unknown messages without throwing, and they don't count as a link", () => {
		const st = createClipsState()
		const junk: Array<[string, unknown[]]> = [
			["/clips/window", [0, 0, 4]],
			["/clips/window", ["a", ...windowMsg().slice(1)]],
			["/clips/tracks", [0, 1]],
			["/clips/scenes", [0, NaN, 1, 1, 1, 1, 1]],
			["/clips/beat", []],
			["/clips/beat", ["one"]],
			["/live/song/get/tempo", [120]],
		]
		for (const [p, a] of junk) expect(applyLive(st, p, a, T0)).toBe(false)
		expect(st.linked).toBe(false)
		expect(st.win).toBeNull()
		expect(st.tracks).toBeNull()
		expect(st.scenes).toBeNull()
	})

	it("an out-of-range code reads as 'nothing there'; volumes clamp into 0..1", () => {
		const st = createClipsState()
		applyLive(st, "/clips/window", windowMsg({ fill: (x) => (x === 0 ? 99 : x === 1 ? -1 : 2.5) }), T0)
		expect(st.win!.slots.slice(0, 3)).toEqual([0, 0, 0])
		applyLive(st, "/clips/tracks", tracksMsg({ vol: (x) => (x === 0 ? 3 : -1) }), T0)
		expect(st.tracks!.volumes.slice(0, 2)).toEqual([1, 0])
	})

	it("a new window clears the offsets we were waiting for", () => {
		const st = createClipsState()
		st.want = { trackOff: 15, sceneOff: 0 }
		applyLive(st, "/clips/window", windowMsg({ trackOff: 15 }), T0)
		expect(st.want).toBeNull()
	})
})

describe("offsets", () => {
	it("steps and clamps so the window stays inside the set", () => {
		expect(nextOffset(0, 40, COLS, 1, COLS)).toBe(15)
		expect(nextOffset(15, 40, COLS, 1, COLS)).toBe(25) // max(0, 40 - 15)
		expect(nextOffset(25, 40, COLS, 1, COLS)).toBe(25)
		expect(nextOffset(3, 40, COLS, -1, COLS)).toBe(0)
		expect(nextOffset(7, 40, COLS, 1, 1)).toBe(8)
	})

	it("a set smaller than the window, or empty, pins the offset at 0", () => {
		expect(maxOffset(3, COLS)).toBe(0)
		expect(maxOffset(0, ROWS)).toBe(0)
		expect(nextOffset(0, 3, COLS, 1, COLS)).toBe(0)
		expect(nextOffset(0, 0, ROWS, 1, 1)).toBe(0)
	})
})

describe("link liveness", () => {
	it("says hello at once, then every 2 s until the fork answers", () => {
		const st = createClipsState()
		expect(hellos(linkTick(st, T0))).toBe(1)
		expect(hellos(linkTick(st, T0 + HELLO_RETRY_MS - 1))).toBe(0)
		expect(hellos(linkTick(st, T0 + HELLO_RETRY_MS))).toBe(1)
		applyLive(st, "/clips/window", windowMsg(), T0 + HELLO_RETRY_MS + 50)
		expect(linkTick(st, T0 + 3 * HELLO_RETRY_MS)).toEqual([])
	})

	it("Live quitting is noticed: a quiet link is probed, and an unanswered probe drops it", () => {
		const st = createClipsState()
		linkTick(st, T0)
		applyLive(st, "/clips/window", windowMsg(), T0 + 100) // linked, last heard T0+100
		const heard = T0 + 100
		expect(linkTick(st, heard + QUIET_PROBE_MS - 1)).toEqual([])
		expect(hellos(linkTick(st, heard + QUIET_PROBE_MS))).toBe(1) // the probe
		expect(st.linked).toBe(true)
		expect(linkTick(st, heard + QUIET_PROBE_MS + HELLO_RETRY_MS - 1)).toEqual([])
		expect(hellos(linkTick(st, heard + QUIET_PROBE_MS + HELLO_RETRY_MS))).toBe(1) // unanswered → retry
		expect(st.linked).toBe(false)
	})

	it("an answered probe keeps the link", () => {
		const st = createClipsState()
		applyLive(st, "/clips/window", windowMsg(), T0)
		linkTick(st, T0 + QUIET_PROBE_MS) // probe
		applyLive(st, "/clips/window", windowMsg(), T0 + QUIET_PROBE_MS + 80)
		expect(linkTick(st, T0 + QUIET_PROBE_MS + HELLO_RETRY_MS)).toEqual([])
		expect(st.linked).toBe(true)
	})
})
```

- [ ] **Step 3: Run them to make sure they fail**

Run: `npx vitest run test/clipsFeed.test.ts`
Expected: FAIL. `src/util/clipsState.js` can't be resolved.

- [ ] **Step 4: Write the module**

`src/util/clipsState.ts`:

```ts
/* clipsState — the clips page's model, with no I/O.
 * ------------------------------------------------------------------------------
 * pages/clips.ts owns the wiring (ctx.live, the timer, SharedStore, Max). Everything here
 * takes the state plus the time it should believe (`nowMs`) and RETURNS what to send
 * instead of sending it, so tests drive it without Live, a socket or a clock.
 * The /clips contract is idk.clips' (docs/superpowers/specs/2026-10-12-clip-launcher-design.md
 * in that repo), not ours; docs/clips-contract-notes.md lists how this page reads it.
 * Clips and scenes are addressed by ABSOLUTE index everywhere: a key remembers the slot it
 * pressed, so a bank move between press and release can't misfire.
 * ------------------------------------------------------------------------------
 */

export const COLS = 15 // tracks in the window = the width of Live's red box
export const ROWS = 6 // scenes in the window
export const SLOTS = COLS * ROWS

/** Slot codes in /clips/window. */
export const SLOT = {
	none: 0, empty: 1, emptyArmed: 2, stopped: 3, queuedPlay: 4,
	playing: 5, queuedStop: 6, queuedRec: 7, recording: 8,
} as const
/** Track flag bits in /clips/tracks. */
export const TRACK = { exists: 1, arm: 2, mute: 4, solo: 8, playing: 16 } as const
/** Scene codes in /clips/scenes. */
export const SCENE = { none: 0, present: 1, triggered: 2 } as const

/** Unlinked: resend /clips/hello this often (spec, "Failure handling"). */
export const HELLO_RETRY_MS = 2000
/** Linked but silent this long: probe with a hello. The window feed is quiet while nothing
 *  changes, so silence alone can't tell "idle" from "Live quit". */
export const QUIET_PROBE_MS = 10_000
/** No /clips/beat for this long: blink on our own clock (transport stopped). */
export const BEAT_STALE_MS = 2000

export type Layer = "clips" | "mute" | "solo" | "arm" | "volume"
export type Send = { path: string; args: Array<number | string> }

export interface WindowView { trackOff: number; sceneOff: number; nTracks: number; nScenes: number; slots: number[] }
export interface TracksView { trackOff: number; flags: number[]; volumes: number[]; master: number }
export interface ScenesView { sceneOff: number; codes: number[] }
/** A clip key that is down, and the absolute slot its press hit. */
export interface DownKey { track: number; scene: number }
/** A slot staged for a launch on shift release (staged-launch experiment). */
export interface Staged { track: number; scene: number; launches: boolean }

export interface ClipsState {
	win: WindowView | null
	tracks: TracksView | null
	scenes: ScenesView | null
	beat: number | null
	beatAtMs: number
	linked: boolean
	lastHeardMs: number
	lastHelloMs: number
	/** Offsets asked for with /clips/window/set and not yet answered by a /clips/window. */
	want: { trackOff: number; sceneOff: number } | null
	/** What the grid shows now. */
	layer: Layer
	/** Where a momentary layer hold returns to. */
	latched: Layer
	layerDown: { layer: Layer; atMs: number; prev: Layer } | null
	shift: boolean
	/** x0 y7 held: top-row keys x0-7 focus slots a-h. */
	pagesHeld: boolean
	/** Clip keys down, by grid cell (y*16+x). */
	down: Map<number, DownKey>
	/** Scene keys down, by grid row → absolute scene. */
	sceneDown: Map<number, number>
	staged: Staged[]
	focusTrack: number | null
	opts: { stagedLaunch: boolean }
}

export function createClipsState(): ClipsState {
	return {
		win: null, tracks: null, scenes: null,
		beat: null, beatAtMs: -Infinity,
		linked: false, lastHeardMs: -Infinity, lastHelloMs: -Infinity,
		want: null,
		layer: "clips", latched: "clips", layerDown: null,
		shift: false, pagesHeld: false,
		down: new Map(), sceneDown: new Map(), staged: [],
		focusTrack: null,
		opts: { stagedLaunch: false },
	}
}

// --- the feed (Live → page) ---------------------------------------------------------

/** The first n args as finite numbers, or null if any is missing or not a number. */
const nums = (args: unknown[], n: number): number[] | null => {
	if (args.length < n) return null
	const out: number[] = []
	for (let i = 0; i < n; i++) {
		const v = args[i]
		if (typeof v !== "number" || !Number.isFinite(v)) return null
		out.push(v)
	}
	return out
}
const index = (v: number) => Math.max(0, Math.trunc(v))
/** A code the contract defines, else 0: a code we don't know draws as nothing there. */
const code = (v: number, max: number) => (Number.isInteger(v) && v >= 0 && v <= max ? v : 0)
const unit = (v: number) => Math.min(1, Math.max(0, v))

/**
 * One message from the fork. Returns true if it was a well-formed /clips message, which is
 * also what counts as hearing from Live. Anything else is ignored, never thrown on.
 */
export function applyLive(st: ClipsState, path: string, args: unknown[], nowMs: number): boolean {
	switch (path) {
		case "/clips/window": {
			const a = nums(args, 4 + SLOTS)
			if (!a) return false
			st.win = {
				trackOff: index(a[0]), sceneOff: index(a[1]), nTracks: index(a[2]), nScenes: index(a[3]),
				slots: a.slice(4).map((v) => code(v, SLOT.recording)),
			}
			st.want = null
			break
		}
		case "/clips/tracks": {
			const a = nums(args, 2 + 2 * COLS)
			if (!a) return false
			st.tracks = {
				trackOff: index(a[0]),
				flags: a.slice(1, 1 + COLS).map((v) => code(v, 31)),
				volumes: a.slice(1 + COLS, 1 + 2 * COLS).map(unit),
				master: unit(a[1 + 2 * COLS]),
			}
			break
		}
		case "/clips/scenes": {
			const a = nums(args, 1 + ROWS)
			if (!a) return false
			st.scenes = { sceneOff: index(a[0]), codes: a.slice(1).map((v) => code(v, SCENE.triggered)) }
			break
		}
		case "/clips/beat": {
			const a = nums(args, 1)
			if (!a) return false
			st.beat = a[0]
			st.beatAtMs = nowMs
			break
		}
		default:
			return false
	}
	st.linked = true
	st.lastHeardMs = nowMs
	return true
}

// --- offsets ------------------------------------------------------------------------

/** The largest offset that still shows a full window (0 when the set is smaller). */
export const maxOffset = (count: number, size: number) => Math.max(0, count - size)

export function nextOffset(off: number, count: number, size: number, dir: -1 | 1, step: number): number {
	return Math.min(maxOffset(count, size), Math.max(0, off + dir * step))
}

// --- link liveness ------------------------------------------------------------------

const hello = (st: ClipsState, nowMs: number): Send => {
	st.lastHelloMs = nowMs
	return { path: "/clips/hello", args: [] }
}

/**
 * Called by the page's timer (and once at init). Unlinked: a hello every HELLO_RETRY_MS.
 * Linked but silent for QUIET_PROBE_MS: one hello as a probe; if that goes unanswered for
 * HELLO_RETRY_MS, the link is down and the retry starts.
 */
export function linkTick(st: ClipsState, nowMs: number): Send[] {
	if (st.linked) {
		if (nowMs - st.lastHeardMs < QUIET_PROBE_MS) return []
		const probed = st.lastHelloMs > st.lastHeardMs
		if (!probed) return [hello(st, nowMs)]
		if (nowMs - st.lastHelloMs < HELLO_RETRY_MS) return []
		st.linked = false // the probe went unanswered: Live closed, or the fork stopped
	}
	if (nowMs - st.lastHelloMs < HELLO_RETRY_MS) return []
	return [hello(st, nowMs)]
}
```

- [ ] **Step 5: Run the tests**

Run: `npx vitest run test/clipsFeed.test.ts && npx tsc --noEmit`
Expected: PASS, with no type errors.

- [ ] **Step 6: Commit**

```bash
git add src/util/clipsState.ts test/clipsFixtures.ts test/clipsFeed.test.ts
git commit -m "feat(clips): pure model — /clips feed, offsets, link liveness"
```

---

### Task 3: Clips model — keys, banking, layers, faders, pages key

**Files:**
- Modify: `src/util/clipsState.ts` (append)
- Test: `test/clipsKeys.test.ts`

**Interfaces:**
- Consumes: everything Task 2 produced.
- Produces:
  - `GRID_W = 16`, `SCENE_COL = 15`, `STOP_ROW = 6`, `CTRL_ROW = 7`, `SHIFT_X = 15`, `PAGES_X = 0`, `PAGE_SLOTS = 8`
  - `LAYER_KEYS: Record<number, Layer>` (`{1:"clips",2:"mute",3:"solo",4:"arm",5:"volume"}`)
  - `ARROWS = { left: 11, right: 12, up: 13, down: 14 }`, type `Arrow`, `MOMENTARY_MS = 300`
  - `FADER_STEPS = 7`, `UNITY = 0.85`, `stepToVolume(step): number`, `volumeToStep(v): number`
  - `type ToggleLayer = "mute" | "solo" | "arm"`, `TOGGLE_BIT: Record<ToggleLayer, number>`
  - `viewFlags(st, x): number | null`
  - `interface KeyResult { send: Send[]; focus?: number; focusSlot?: number }`
  - `pressKey(st, x, y, s: 0 | 1, nowMs): KeyResult`

- [ ] **Step 1: Write the failing tests**

`test/clipsKeys.test.ts`:

```ts
import { describe, it, expect } from "vitest"
import {
	createClipsState, applyLive, pressKey, stepToVolume, volumeToStep,
	SLOT, TRACK, SCENE_COL, STOP_ROW, CTRL_ROW, SHIFT_X, PAGES_X, ARROWS, MOMENTARY_MS, FADER_STEPS,
	type ClipsState, type KeyResult,
} from "../src/util/clipsState.js"
import { linked, windowMsg, T0 } from "./clipsFixtures.js"

const press = (st: ClipsState, x: number, y: number, t = T0) => pressKey(st, x, y, 1, t)
const release = (st: ClipsState, x: number, y: number, t = T0) => pressKey(st, x, y, 0, t)
const tap = (st: ClipsState, x: number, y: number, t = T0) => { press(st, x, y, t); return release(st, x, y, t) }
const msgs = (r: KeyResult) => r.send.map((m) => [m.path, ...m.args])

describe("clip keys", () => {
	it("press and release send the ABSOLUTE slot", () => {
		const st = linked({ trackOff: 15, sceneOff: 6 })
		expect(msgs(press(st, 2, 1))).toEqual([["/clips/slot/button", 17, 7, 1]])
		expect(msgs(release(st, 2, 1))).toEqual([["/clips/slot/button", 17, 7, 0]])
	})

	it("a release after a bank move still goes to the slot that was pressed", () => {
		const st = linked()
		press(st, 3, 2)
		press(st, ARROWS.right, CTRL_ROW)
		applyLive(st, "/clips/window", windowMsg({ trackOff: 15 }), T0)
		expect(msgs(release(st, 3, 2))).toEqual([["/clips/slot/button", 3, 2, 0]])
	})

	it("a release after switching layer still releases the clip", () => {
		const st = linked()
		press(st, 0, 0)
		tap(st, 5, CTRL_ROW) // latch V
		expect(st.layer).toBe("volume")
		expect(msgs(release(st, 0, 0))).toEqual([["/clips/slot/button", 0, 0, 0]])
	})

	it("a slot that doesn't exist sends nothing", () => {
		const st = linked({ nTracks: 3, nScenes: 2 })
		expect(press(st, 5, 0).send).toEqual([])
		expect(press(st, 0, 4).send).toEqual([])
		expect(release(st, 5, 0).send).toEqual([])
	})

	it("launching a clip (or recording into an armed empty slot) moves the track focus; an empty slot doesn't", () => {
		const st = linked({ trackOff: 15, fill: (x) => (x === 0 ? SLOT.empty : x === 1 ? SLOT.emptyArmed : SLOT.stopped) })
		expect(press(st, 0, 0).focus).toBeUndefined()
		expect(press(st, 1, 0).focus).toBe(16)
		expect(press(st, 4, 0).focus).toBe(19)
		expect(st.focusTrack).toBe(19)
	})

	it("nothing goes out before the fork has answered", () => {
		const st = createClipsState()
		expect(press(st, 0, 0).send).toEqual([])
		expect(press(st, SCENE_COL, 0).send).toEqual([])
		expect(press(st, 0, STOP_ROW).send).toEqual([])
		expect(press(st, ARROWS.right, CTRL_ROW).send).toEqual([])
	})
})

describe("scene and stop keys", () => {
	it("scene press/release by absolute scene; past the last scene does nothing", () => {
		const st = linked({ sceneOff: 6, nScenes: 9 })
		expect(msgs(press(st, SCENE_COL, 1))).toEqual([["/clips/scene/button", 7, 1]])
		expect(msgs(release(st, SCENE_COL, 1))).toEqual([["/clips/scene/button", 7, 0]])
		expect(press(st, SCENE_COL, 3).send).toEqual([])
	})

	it("the stop row stops a track, x15 stops all; releases send nothing", () => {
		const st = linked({ trackOff: 15 })
		expect(msgs(press(st, 4, STOP_ROW))).toEqual([["/clips/track/stop", 19]])
		expect(msgs(press(st, SCENE_COL, STOP_ROW))).toEqual([["/clips/stop_all"]])
		expect(release(st, 4, STOP_ROW).send).toEqual([])
	})
})

describe("navigation", () => {
	it("arrows bank a whole window, shift steps by one, and a second press builds on the first", () => {
		const st = linked()
		expect(msgs(press(st, ARROWS.right, CTRL_ROW))).toEqual([["/clips/window/set", 15, 0]])
		expect(msgs(press(st, ARROWS.down, CTRL_ROW))).toEqual([["/clips/window/set", 15, 6]])
		press(st, SHIFT_X, CTRL_ROW)
		expect(msgs(press(st, ARROWS.left, CTRL_ROW))).toEqual([["/clips/window/set", 14, 6]])
	})

	it("clamps so the window stays inside the set, and sends nothing at an edge", () => {
		const st = linked({ nTracks: 20, nScenes: 8 })
		expect(msgs(press(st, ARROWS.right, CTRL_ROW))).toEqual([["/clips/window/set", 5, 0]])
		applyLive(st, "/clips/window", windowMsg({ trackOff: 5, nTracks: 20, nScenes: 8 }), T0)
		expect(press(st, ARROWS.right, CTRL_ROW).send).toEqual([])
		expect(msgs(press(st, ARROWS.down, CTRL_ROW))).toEqual([["/clips/window/set", 5, 2]])
	})

	it("a set smaller than the window never moves", () => {
		const st = linked({ nTracks: 3, nScenes: 2 })
		for (const x of Object.values(ARROWS)) expect(press(st, x, CTRL_ROW).send).toEqual([])
	})

	it("an empty set (no tracks, no scenes) is safe", () => {
		const st = linked({ nTracks: 0, nScenes: 0 })
		expect(press(st, 0, 0).send).toEqual([])
		expect(press(st, SCENE_COL, 0).send).toEqual([])
		expect(press(st, 0, STOP_ROW).send).toEqual([])
		expect(press(st, ARROWS.right, CTRL_ROW).send).toEqual([])
	})

	it("pages key + a top-row key asks for slot a–h, and launches nothing while held", () => {
		const st = linked()
		press(st, PAGES_X, CTRL_ROW)
		expect(press(st, 2, 0)).toEqual({ send: [], focusSlot: 2 })
		expect(press(st, 9, 0).send).toEqual([])
		expect(press(st, 3, 3).send).toEqual([])
		release(st, PAGES_X, CTRL_ROW)
		expect(msgs(press(st, 2, 0))).toEqual([["/clips/slot/button", 2, 0, 1]])
	})

	it("the pages key works with no link (you can always leave)", () => {
		const st = createClipsState()
		press(st, PAGES_X, CTRL_ROW)
		expect(press(st, 1, 0).focusSlot).toBe(1)
	})
})

describe("layers", () => {
	it("a tap latches a layer; tap C returns", () => {
		const st = linked()
		press(st, 2, CTRL_ROW, T0)
		release(st, 2, CTRL_ROW, T0 + 100)
		expect(st.layer).toBe("mute")
		press(st, 1, CTRL_ROW, T0 + 200)
		release(st, 1, CTRL_ROW, T0 + 250)
		expect(st.layer).toBe("clips")
	})

	it("a hold is momentary: release goes back to the latched layer", () => {
		const st = linked()
		press(st, 3, CTRL_ROW, T0)
		expect(st.layer).toBe("solo")
		release(st, 3, CTRL_ROW, T0 + MOMENTARY_MS + 1)
		expect(st.layer).toBe("clips")
	})

	it("M/S/A: the stop row toggles that property from the track's flags; clips keep launching; stop-all stays", () => {
		const st = linked({ trackOff: 15, flag: (x) => (x === 1 ? TRACK.mute : 0) })
		tap(st, 2, CTRL_ROW)
		expect(msgs(press(st, 1, STOP_ROW))).toEqual([["/clips/track/set", "mute", 16, 0]])
		expect(msgs(press(st, 2, STOP_ROW))).toEqual([["/clips/track/set", "mute", 17, 1]])
		expect(msgs(press(st, SCENE_COL, STOP_ROW))).toEqual([["/clips/stop_all"]])
		expect(msgs(press(st, 0, 0))).toEqual([["/clips/slot/button", 15, 0, 1]])
	})

	it("toggles nothing while the track feed is for another bank", () => {
		const st = linked()
		applyLive(st, "/clips/window", windowMsg({ trackOff: 15 }), T0) // tracks still say offset 0
		tap(st, 4, CTRL_ROW)
		expect(press(st, 0, STOP_ROW).send).toEqual([])
	})

	it("V: a press sets that track's volume, y0 = 0 dB (0.85), y6 = −∞ (0); the master column sends nothing", () => {
		const st = linked({ trackOff: 15 })
		tap(st, 5, CTRL_ROW)
		expect(msgs(press(st, 3, 0))).toEqual([["/clips/track/set", "volume", 18, 0.85]])
		expect(msgs(press(st, 3, 6))).toEqual([["/clips/track/set", "volume", 18, 0]])
		expect(press(st, SCENE_COL, 0).send).toEqual([])
		expect(press(st, SCENE_COL, STOP_ROW).send).toEqual([]) // not stop-all on this layer
	})

	it("fader steps round-trip through volume", () => {
		for (let k = 0; k < FADER_STEPS; k++) expect(volumeToStep(stepToVolume(k))).toBe(k)
		expect(volumeToStep(1)).toBe(FADER_STEPS - 1) // +6 dB still reads as the top
		expect(volumeToStep(0)).toBe(0)
	})
})
```

- [ ] **Step 2: Run them to make sure they fail**

Run: `npx vitest run test/clipsKeys.test.ts`
Expected: FAIL. `pressKey` isn't exported.

- [ ] **Step 3: Append the key handling to `src/util/clipsState.ts`**

```ts
// --- the grid layout (spec "Grid layout"; C3 adds the pages key) ---------------------

export const GRID_W = 16
export const SCENE_COL = 15
export const STOP_ROW = 6
export const CTRL_ROW = 7
export const SHIFT_X = 15
/** x0 y7: hold, then x0-7 on y0 focuses slot a-h (Ian, 2026-10-12). */
export const PAGES_X = 0
export const PAGE_SLOTS = 8
export const LAYER_KEYS: Readonly<Record<number, Layer>> = { 1: "clips", 2: "mute", 3: "solo", 4: "arm", 5: "volume" }
export const ARROWS = { left: 11, right: 12, up: 13, down: 14 } as const
export type Arrow = keyof typeof ARROWS
/** A layer key held longer than this is momentary; shorter is a latching tap. */
export const MOMENTARY_MS = 300

// --- volume faders (V layer) --------------------------------------------------------

export const FADER_STEPS = 7 // y6 (bottom, −∞) .. y0 (top, 0 dB)
/** Live's mixer volume at 0 dB on its 0..1 parameter (confirm in the idk.clips spike). */
export const UNITY = 0.85
export const stepToVolume = (step: number) => Number(((UNITY * step) / (FADER_STEPS - 1)).toFixed(4))
export const volumeToStep = (v: number) =>
	Math.min(FADER_STEPS - 1, Math.max(0, Math.round((v / UNITY) * (FADER_STEPS - 1))))

export type ToggleLayer = "mute" | "solo" | "arm"
export const TOGGLE_BIT: Readonly<Record<ToggleLayer, number>> = { mute: TRACK.mute, solo: TRACK.solo, arm: TRACK.arm }

/** The flags of window column x, or null when unknown: no track there, or the track feed
 *  still describes another bank (it carries its own offset). */
export function viewFlags(st: ClipsState, x: number): number | null {
	const t = st.tracks
	if (!t || !st.win || t.trackOff !== st.win.trackOff) return null
	const f = t.flags[x] ?? 0
	return f & TRACK.exists ? f : null
}

// --- keys ---------------------------------------------------------------------------

export interface KeyResult {
	send: Send[]
	/** A launch moved the track focus (absolute track index). */
	focus?: number
	/** The pages key asked for slot a-h (0-7). */
	focusSlot?: number
}

const slotButton = (track: number, scene: number, state: 0 | 1): Send =>
	({ path: "/clips/slot/button", args: [track, scene, state] })
const sceneButton = (scene: number, state: 0 | 1): Send => ({ path: "/clips/scene/button", args: [scene, state] })

export function pressKey(st: ClipsState, x: number, y: number, s: 0 | 1, nowMs: number): KeyResult {
	if (y === CTRL_ROW && x === PAGES_X) {
		st.pagesHeld = s === 1
		return { send: [] }
	}
	if (st.pagesHeld && s === 1 && y !== CTRL_ROW)
		return y === 0 && x < PAGE_SLOTS ? { send: [], focusSlot: x } : { send: [] }
	if (y === CTRL_ROW) return controlKey(st, x, s, nowMs)
	if (s === 0) return release(st, x, y)
	const w = st.win
	if (!st.linked || !w) return { send: [] }
	if (st.layer === "volume") return { send: faderPress(st, w, x, y) }
	if (y === STOP_ROW) return { send: stopRowPress(st, w, x) }
	if (x === SCENE_COL) return { send: scenePress(st, w, y) }
	return clipPress(st, w, x, y)
}

/** A release goes wherever its press went, whatever the window or layer is now. */
function release(st: ClipsState, x: number, y: number): KeyResult {
	const cell = y * GRID_W + x
	const held = st.down.get(cell)
	if (held) {
		st.down.delete(cell)
		return { send: [slotButton(held.track, held.scene, 0)] }
	}
	const scene = x === SCENE_COL ? st.sceneDown.get(y) : undefined
	if (scene !== undefined) {
		st.sceneDown.delete(y)
		return { send: [sceneButton(scene, 0)] }
	}
	return { send: [] }
}

function launched(st: ClipsState, send: Send[], track: number | undefined): KeyResult {
	if (track === undefined) return { send }
	st.focusTrack = track
	return { send, focus: track }
}

function clipPress(st: ClipsState, w: WindowView, x: number, y: number): KeyResult {
	if (x >= COLS || y >= ROWS) return { send: [] }
	const code = w.slots[y * COLS + x]
	if (code === SLOT.none) return { send: [] }
	const track = w.trackOff + x
	const scene = w.sceneOff + y
	st.down.set(y * GRID_W + x, { track, scene })
	// An empty slot's press stops the track in Live: not a launch, so focus stays put.
	return launched(st, [slotButton(track, scene, 1)], code >= SLOT.emptyArmed ? track : undefined)
}

function scenePress(st: ClipsState, w: WindowView, y: number): Send[] {
	const scene = w.sceneOff + y
	if (scene >= w.nScenes) return []
	st.sceneDown.set(y, scene)
	return [sceneButton(scene, 1)]
}

function stopRowPress(st: ClipsState, w: WindowView, x: number): Send[] {
	if (x === SCENE_COL) return [{ path: "/clips/stop_all", args: [] }]
	const track = w.trackOff + x
	if (track >= w.nTracks) return []
	if (st.layer === "clips") return [{ path: "/clips/track/stop", args: [track] }]
	const flags = viewFlags(st, x)
	if (flags === null) return []
	const prop = st.layer as ToggleLayer
	return [{ path: "/clips/track/set", args: [prop, track, flags & TOGGLE_BIT[prop] ? 0 : 1] }]
}

function faderPress(st: ClipsState, w: WindowView, x: number, y: number): Send[] {
	if (y > STOP_ROW) return []
	// Master (x15) is shown, not set: the contract has no master address yet (C1).
	if (x === SCENE_COL) return []
	if (viewFlags(st, x) === null) return []
	return [{ path: "/clips/track/set", args: ["volume", w.trackOff + x, stepToVolume(FADER_STEPS - 1 - y)] }]
}

function controlKey(st: ClipsState, x: number, s: 0 | 1, nowMs: number): KeyResult {
	if (x === SHIFT_X) {
		st.shift = s === 1
		return { send: [] }
	}
	const layer = LAYER_KEYS[x]
	if (layer) {
		layerKey(st, layer, s, nowMs)
		return { send: [] }
	}
	if (s === 0) return { send: [] }
	const arrow = (Object.keys(ARROWS) as Arrow[]).find((a) => ARROWS[a] === x)
	return { send: arrow ? bank(st, arrow) : [] }
}

function layerKey(st: ClipsState, layer: Layer, s: 0 | 1, nowMs: number) {
	if (s === 1) {
		st.layerDown = { layer, atMs: nowMs, prev: st.latched }
		st.layer = layer
		return
	}
	const d = st.layerDown
	if (!d || d.layer !== layer) return
	st.layerDown = null
	if (nowMs - d.atMs > MOMENTARY_MS) st.layer = d.prev // held: momentary, go back
	else st.latched = layer // tapped: it sticks
}

function bank(st: ClipsState, dir: Arrow): Send[] {
	const w = st.win
	if (!st.linked || !w) return []
	// Build on an unanswered move, so two quick presses go two windows, not one.
	const base = st.want ?? { trackOff: w.trackOff, sceneOff: w.sceneOff }
	const sign = dir === "left" || dir === "up" ? -1 : 1
	const next =
		dir === "left" || dir === "right"
			? { trackOff: nextOffset(base.trackOff, w.nTracks, COLS, sign, st.shift ? 1 : COLS), sceneOff: base.sceneOff }
			: { trackOff: base.trackOff, sceneOff: nextOffset(base.sceneOff, w.nScenes, ROWS, sign, st.shift ? 1 : ROWS) }
	if (next.trackOff === base.trackOff && next.sceneOff === base.sceneOff) return []
	st.want = next
	return [{ path: "/clips/window/set", args: [next.trackOff, next.sceneOff] }]
}
```

- [ ] **Step 4: Run the tests**

Run: `npx vitest run test/clipsKeys.test.ts test/clipsFeed.test.ts && npx tsc --noEmit`
Expected: PASS, with no type errors.

- [ ] **Step 5: Commit**

```bash
git add src/util/clipsState.ts test/clipsKeys.test.ts
git commit -m "feat(clips): keys — absolute press/release, banking, layers, faders, pages key"
```

---

### Task 4: Clips model — the LED table and the frame

**Files:**
- Modify: `src/util/clipsState.ts` (add one import at the top; append the rest)
- Test: `test/clipsFrame.test.ts`

**Interfaces:**
- Consumes: Tasks 2–3.
- Produces: `LEVEL` (the one brightness table, with `[offBeat, onBeat]` pairs for blinks), `LOCAL_BEAT_MS = 500`, `DIP_MS = 120`, `onBeat(st, nowMs): boolean`, `inDip(st, nowMs): boolean`, `slotLevel(code, pick, dip): number`, `clipsFrame(st, size: GridSize, nowMs, ownSlot = -1): LedFrame`.

- [ ] **Step 1: Write the failing tests**

`test/clipsFrame.test.ts`:

```ts
import { describe, it, expect } from "vitest"
import {
	createClipsState, applyLive, pressKey, clipsFrame, stepToVolume,
	LEVEL, SLOT, TRACK, SCENE, SCENE_COL, STOP_ROW, CTRL_ROW, SHIFT_X, PAGES_X, ARROWS,
	LOCAL_BEAT_MS, DIP_MS, type ClipsState,
} from "../src/util/clipsState.js"
import { ledIndex, type GridSize, type LedFrame } from "../src/core/types.js"
import { linked, windowMsg, T0 } from "./clipsFixtures.js"

const SIZE: GridSize = { width: 16, height: 8 }
const at = (f: LedFrame, x: number, y: number) => f[ledIndex(SIZE, x, y)]
const tap = (st: ClipsState, x: number, y: number) => { pressKey(st, x, y, 1, T0); pressKey(st, x, y, 0, T0) }

describe("clips frame", () => {
	it("draws each steady slot code at its table level", () => {
		const codes = [SLOT.none, SLOT.empty, SLOT.emptyArmed, SLOT.stopped, SLOT.playing]
		const st = linked({ fill: (x) => codes[x] ?? SLOT.none })
		const f = clipsFrame(st, SIZE, T0)
		expect([0, 1, 2, 3, 4].map((x) => at(f, x, 0))).toEqual([0, 0, LEVEL.emptyArmed, LEVEL.stopped, LEVEL.playing])
	})

	it("queued states blink with Live's beat", () => {
		const st = linked({ fill: (x) => [SLOT.queuedPlay, SLOT.queuedStop, SLOT.queuedRec][x] ?? SLOT.none })
		applyLive(st, "/clips/beat", [4], T0)
		const on = clipsFrame(st, SIZE, T0 + 10)
		applyLive(st, "/clips/beat", [5], T0 + 500)
		const off = clipsFrame(st, SIZE, T0 + 510)
		expect([0, 1, 2].map((x) => at(on, x, 0))).toEqual([LEVEL.queuedPlay[1], LEVEL.queuedStop[1], LEVEL.queuedRec[1]])
		expect([0, 1, 2].map((x) => at(off, x, 0))).toEqual([LEVEL.queuedPlay[0], LEVEL.queuedStop[0], LEVEL.queuedRec[0]])
	})

	it("blinks on its own clock when Live sends no beat (transport stopped)", () => {
		const st = linked({ fill: () => SLOT.queuedPlay })
		const a = at(clipsFrame(st, SIZE, 0), 0, 0)
		const b = at(clipsFrame(st, SIZE, LOCAL_BEAT_MS), 0, 0)
		expect(new Set([a, b])).toEqual(new Set(LEVEL.queuedPlay))
	})

	it("recording dips on each beat", () => {
		const st = linked({ fill: () => SLOT.recording })
		applyLive(st, "/clips/beat", [8], T0)
		expect(at(clipsFrame(st, SIZE, T0 + 10), 0, 0)).toBe(LEVEL.recordingDip)
		expect(at(clipsFrame(st, SIZE, T0 + DIP_MS + 10), 0, 0)).toBe(LEVEL.recording)
	})

	it("scene keys: present steady, triggered blinks, missing dark", () => {
		const st = linked({ nScenes: 3, scene: (y) => (y === 1 ? SCENE.triggered : SCENE.present) })
		applyLive(st, "/clips/beat", [2], T0)
		const f = clipsFrame(st, SIZE, T0 + 10)
		expect([0, 1, 2, 3].map((y) => at(f, SCENE_COL, y))).toEqual([LEVEL.scenePresent, LEVEL.sceneTriggered[1], LEVEL.scenePresent, 0])
	})

	it("stop row: playing vs idle tracks, missing tracks dark; stop-all lit when anything plays", () => {
		const st = linked({ nTracks: 3, flag: (x) => (x === 1 ? TRACK.playing : 0) })
		const f = clipsFrame(st, SIZE, T0)
		expect([0, 1, 2, 3].map((x) => at(f, x, STOP_ROW))).toEqual([LEVEL.stopIdle, LEVEL.stopPlaying, LEVEL.stopIdle, 0])
		expect(at(f, SCENE_COL, STOP_ROW)).toBe(LEVEL.stopPlaying)
	})

	it("M/S/A: the stop row shows that property", () => {
		const st = linked({ flag: (x) => (x === 0 ? TRACK.solo : 0) })
		tap(st, 3, CTRL_ROW)
		const f = clipsFrame(st, SIZE, T0)
		expect([at(f, 0, STOP_ROW), at(f, 1, STOP_ROW)]).toEqual([LEVEL.toggleOn, LEVEL.toggleOff])
	})

	it("track rows stay dark while the track feed is for another bank", () => {
		const st = linked({ flag: () => TRACK.playing })
		applyLive(st, "/clips/window", windowMsg({ trackOff: 15 }), T0)
		const f = clipsFrame(st, SIZE, T0)
		expect(at(f, 0, STOP_ROW)).toBe(0)
	})

	it("V layer: a column per track up to its volume step, master on x15", () => {
		const st = linked({ nTracks: 2, vol: (x) => (x === 0 ? 0.85 : 0), master: stepToVolume(3) })
		tap(st, 5, CTRL_ROW)
		const f = clipsFrame(st, SIZE, T0)
		const col = (x: number) => [0, 1, 2, 3, 4, 5, 6].map((y) => at(f, x, y))
		const T = LEVEL.faderTop
		const F = LEVEL.faderFill
		expect(col(0)).toEqual([T, F, F, F, F, F, F])
		expect(col(1)).toEqual([0, 0, 0, 0, 0, 0, T])
		expect(col(2)).toEqual([0, 0, 0, 0, 0, 0, 0])
		expect(col(SCENE_COL)).toEqual([0, 0, 0, T, F, F, F])
	})

	it("control row: active layer bright, arrows dim at an edge, shift and pages keys", () => {
		const st = linked({ nTracks: 20, nScenes: 6 })
		const f = clipsFrame(st, SIZE, T0)
		expect([1, 2, 3, 4, 5].map((x) => at(f, x, CTRL_ROW))).toEqual([LEVEL.layerActive, LEVEL.layerOther, LEVEL.layerOther, LEVEL.layerOther, LEVEL.layerOther])
		expect([ARROWS.left, ARROWS.right, ARROWS.up, ARROWS.down].map((x) => at(f, x, CTRL_ROW)))
			.toEqual([LEVEL.arrowEdge, LEVEL.arrowCan, LEVEL.arrowEdge, LEVEL.arrowEdge])
		expect(at(f, SHIFT_X, CTRL_ROW)).toBe(LEVEL.shiftUp)
		expect(at(f, PAGES_X, CTRL_ROW)).toBe(LEVEL.pagesUp)
		pressKey(st, SHIFT_X, CTRL_ROW, 1, T0)
		expect(at(clipsFrame(st, SIZE, T0), SHIFT_X, CTRL_ROW)).toBe(LEVEL.shiftDown)
	})

	it("no link: a dim border and nothing else", () => {
		const f = clipsFrame(createClipsState(), SIZE, T0)
		for (let y = 0; y < 8; y++)
			for (let x = 0; x < 16; x++) {
				const edge = x === 0 || y === 0 || x === 15 || y === 7
				expect(at(f, x, y)).toBe(edge ? LEVEL.noLink : 0)
			}
	})

	it("holding the pages key lights slot keys a–h, this page's own brightest", () => {
		const st = linked()
		pressKey(st, PAGES_X, CTRL_ROW, 1, T0)
		const f = clipsFrame(st, SIZE, T0, 2)
		const S = LEVEL.slotKey
		expect([0, 1, 2, 3, 4, 5, 6, 7, 8].map((x) => at(f, x, 0))).toEqual([S, S, LEVEL.ownSlot, S, S, S, S, S, LEVEL.stopped])
		expect(at(f, PAGES_X, CTRL_ROW)).toBe(LEVEL.pagesDown)
	})

	it("every level in the table is a grid level", () => {
		for (const v of Object.values(LEVEL).flat()) expect(Number.isInteger(v) && v >= 0 && v <= 15).toBe(true)
	})
})
```

- [ ] **Step 2: Run them to make sure they fail**

Run: `npx vitest run test/clipsFrame.test.ts`
Expected: FAIL. `clipsFrame` / `LEVEL` aren't exported.

- [ ] **Step 3: Add the import at the top of `src/util/clipsState.ts`** (just below the header comment)

```ts
import { makeFrame, ledIndex, type GridSize, type LedFrame } from "../core/types.js"
```

- [ ] **Step 4: Append the table and the frame**

```ts
// --- LEDs ---------------------------------------------------------------------------

/**
 * Every brightness this page draws: the one table to tune (spec "LED brightness"; the
 * spec's values where it gives one, first guesses elsewhere). Pairs are [off-beat, on-beat].
 */
export const LEVEL = {
	emptyArmed: 2,
	stopped: 5,
	playing: 15,
	recording: 15,
	recordingDip: 8,
	queuedPlay: [5, 15],
	queuedStop: [15, 5],
	queuedRec: [2, 15],
	scenePresent: 3,
	sceneTriggered: [3, 15],
	stopPlaying: 8,
	stopIdle: 2,
	toggleOn: 15,
	toggleOff: 3,
	faderFill: 6,
	faderTop: 15,
	layerActive: 15,
	layerOther: 4,
	arrowCan: 8,
	arrowEdge: 2,
	shiftUp: 4,
	shiftDown: 15,
	pagesUp: 2,
	pagesDown: 15,
	slotKey: 6,
	ownSlot: 15,
	staged: [2, 8],
	noLink: 2,
} as const

/** Our own blink period when Live sends no beat (its transport is stopped). */
export const LOCAL_BEAT_MS = 500
/** How long a recording clip dips after each beat. */
export const DIP_MS = 120

const beatFresh = (st: ClipsState, nowMs: number) => st.beat !== null && nowMs - st.beatAtMs < BEAT_STALE_MS

/** The "on" half of a blink: Live's beat parity while it is fresh, else our own clock. */
export function onBeat(st: ClipsState, nowMs: number): boolean {
	if (beatFresh(st, nowMs)) return Math.floor(st.beat!) % 2 === 0
	return Math.floor(nowMs / LOCAL_BEAT_MS) % 2 === 0
}

export function inDip(st: ClipsState, nowMs: number): boolean {
	if (beatFresh(st, nowMs)) return nowMs - st.beatAtMs < DIP_MS
	return nowMs % LOCAL_BEAT_MS < DIP_MS
}

type Pick = (pair: readonly [number, number]) => number

export function slotLevel(code: number, pick: Pick, dip: boolean): number {
	switch (code) {
		case SLOT.emptyArmed: return LEVEL.emptyArmed
		case SLOT.stopped: return LEVEL.stopped
		case SLOT.queuedPlay: return pick(LEVEL.queuedPlay)
		case SLOT.playing: return LEVEL.playing
		case SLOT.queuedStop: return pick(LEVEL.queuedStop)
		case SLOT.queuedRec: return pick(LEVEL.queuedRec)
		case SLOT.recording: return dip ? LEVEL.recordingDip : LEVEL.recording
		default: return 0 // none, empty
	}
}

type Put = (x: number, y: number, v: number) => void

/** The page's whole frame, a pure function of state and time. */
export function clipsFrame(st: ClipsState, size: GridSize, nowMs: number, ownSlot = -1): LedFrame {
	const f = makeFrame(size)
	const put: Put = (x, y, v) => {
		if (x >= 0 && y >= 0 && x < size.width && y < size.height) f[ledIndex(size, x, y)] = v
	}
	const w = st.win
	if (!st.linked || !w) drawNoLink(put, size)
	else {
		const beat = onBeat(st, nowMs)
		const pick: Pick = (pair) => pair[beat ? 1 : 0]
		if (st.layer === "volume") drawFaders(st, put)
		else drawClips(st, w, put, pick, inDip(st, nowMs))
		drawControlRow(st, w, put)
	}
	put(PAGES_X, CTRL_ROW, st.pagesHeld ? LEVEL.pagesDown : LEVEL.pagesUp)
	if (st.pagesHeld)
		for (let x = 0; x < PAGE_SLOTS; x++) put(x, 0, x === ownSlot ? LEVEL.ownSlot : LEVEL.slotKey)
	return f
}

function drawNoLink(put: Put, size: GridSize) {
	for (let x = 0; x < size.width; x++) {
		put(x, 0, LEVEL.noLink)
		put(x, size.height - 1, LEVEL.noLink)
	}
	for (let y = 0; y < size.height; y++) {
		put(0, y, LEVEL.noLink)
		put(size.width - 1, y, LEVEL.noLink)
	}
}

function drawClips(st: ClipsState, w: WindowView, put: Put, pick: Pick, dip: boolean) {
	for (let y = 0; y < ROWS; y++)
		for (let x = 0; x < COLS; x++) put(x, y, slotLevel(w.slots[y * COLS + x], pick, dip))

	const scenes = st.scenes && st.scenes.sceneOff === w.sceneOff ? st.scenes.codes : null
	for (let y = 0; y < ROWS; y++) {
		const c = scenes?.[y] ?? SCENE.none
		put(SCENE_COL, y, c === SCENE.triggered ? pick(LEVEL.sceneTriggered) : c === SCENE.present ? LEVEL.scenePresent : 0)
	}

	let anyPlaying = false
	for (let x = 0; x < COLS; x++) {
		const fl = viewFlags(st, x)
		if (fl === null) continue
		if (fl & TRACK.playing) anyPlaying = true
		if (st.layer === "clips") put(x, STOP_ROW, fl & TRACK.playing ? LEVEL.stopPlaying : LEVEL.stopIdle)
		else put(x, STOP_ROW, fl & TOGGLE_BIT[st.layer as ToggleLayer] ? LEVEL.toggleOn : LEVEL.toggleOff)
	}
	put(SCENE_COL, STOP_ROW, anyPlaying ? LEVEL.stopPlaying : LEVEL.stopIdle)
}

function drawFaders(st: ClipsState, put: Put) {
	const column = (x: number, v: number) => {
		const top = volumeToStep(v)
		for (let k = 0; k <= top; k++) put(x, STOP_ROW - k, k === top ? LEVEL.faderTop : LEVEL.faderFill)
	}
	for (let x = 0; x < COLS; x++) if (viewFlags(st, x) !== null) column(x, st.tracks!.volumes[x])
	if (st.tracks) column(SCENE_COL, st.tracks.master)
}

function drawControlRow(st: ClipsState, w: WindowView, put: Put) {
	for (const [x, layer] of Object.entries(LAYER_KEYS))
		put(Number(x), CTRL_ROW, layer === st.layer ? LEVEL.layerActive : LEVEL.layerOther)
	const can: Record<Arrow, boolean> = {
		left: w.trackOff > 0,
		right: w.trackOff < maxOffset(w.nTracks, COLS),
		up: w.sceneOff > 0,
		down: w.sceneOff < maxOffset(w.nScenes, ROWS),
	}
	for (const a of Object.keys(ARROWS) as Arrow[]) put(ARROWS[a], CTRL_ROW, can[a] ? LEVEL.arrowCan : LEVEL.arrowEdge)
	put(SHIFT_X, CTRL_ROW, st.shift ? LEVEL.shiftDown : LEVEL.shiftUp)
}
```

- [ ] **Step 5: Run the tests**

Run: `npx vitest run test/clipsFrame.test.ts test/clipsKeys.test.ts test/clipsFeed.test.ts && npx tsc --noEmit`
Expected: PASS, with no type errors.

- [ ] **Step 6: Commit**

```bash
git add src/util/clipsState.ts test/clipsFrame.test.ts
git commit -m "feat(clips): LED table and frame — beat blinks, layers, faders, no-link border"
```

---

### Task 5: Staged launch (the experiment that stays, off by default)

**Files:**
- Modify: `src/util/clipsState.ts` (`clipPress`, the shift branch of `controlKey`, `drawClips`; add `fireStaged`)
- Test: `test/clipsStaged.test.ts`

**Interfaces:**
- Consumes: `ClipsState.opts.stagedLaunch`, `ClipsState.staged`, `Staged`, `LEVEL.staged`, `pressKey`, `clipsFrame`.
- Produces: no new exports. The behaviour hangs off `opts.stagedLaunch`.

- [ ] **Step 1: Write the failing tests**

`test/clipsStaged.test.ts`:

```ts
import { describe, it, expect } from "vitest"
import {
	applyLive, pressKey, clipsFrame, LEVEL, SLOT, SHIFT_X, CTRL_ROW, ARROWS,
	type ClipsState, type KeyResult,
} from "../src/util/clipsState.js"
import { ledIndex, type GridSize } from "../src/core/types.js"
import { linked, windowMsg, T0 } from "./clipsFixtures.js"

const SIZE: GridSize = { width: 16, height: 8 }
const press = (st: ClipsState, x: number, y: number) => pressKey(st, x, y, 1, T0)
const release = (st: ClipsState, x: number, y: number) => pressKey(st, x, y, 0, T0)
const tap = (st: ClipsState, x: number, y: number) => { press(st, x, y); return release(st, x, y) }
const msgs = (r: KeyResult) => r.send.map((m) => [m.path, ...m.args])
const staging = (o = {}) => {
	const st = linked(o)
	st.opts.stagedLaunch = true
	return st
}

describe("staged launch (experiment)", () => {
	it("off: shift + clip launches as usual", () => {
		const st = linked()
		press(st, SHIFT_X, CTRL_ROW)
		expect(msgs(press(st, 0, 0))).toEqual([["/clips/slot/button", 0, 0, 1]])
	})

	it("on: shift + taps stage silently; releasing shift fires them together, presses first", () => {
		const st = staging()
		press(st, SHIFT_X, CTRL_ROW)
		expect(press(st, 0, 0).send).toEqual([])
		expect(release(st, 0, 0).send).toEqual([])
		tap(st, 4, 2)
		const r = release(st, SHIFT_X, CTRL_ROW)
		expect(msgs(r)).toEqual([
			["/clips/slot/button", 0, 0, 1],
			["/clips/slot/button", 4, 2, 1],
			["/clips/slot/button", 0, 0, 0],
			["/clips/slot/button", 4, 2, 0],
		])
		expect(r.focus).toBe(4)
		expect(st.staged).toEqual([])
	})

	it("tapping a staged clip again unstages it", () => {
		const st = staging()
		press(st, SHIFT_X, CTRL_ROW)
		tap(st, 1, 1)
		tap(st, 1, 1)
		expect(release(st, SHIFT_X, CTRL_ROW).send).toEqual([])
	})

	it("staging an empty slot fires it but doesn't move the focus", () => {
		const st = staging({ fill: () => SLOT.empty })
		press(st, SHIFT_X, CTRL_ROW)
		tap(st, 2, 0)
		const r = release(st, SHIFT_X, CTRL_ROW)
		expect(r.send).toHaveLength(2)
		expect(r.focus).toBeUndefined()
	})

	it("shift + arrow still steps by one while staging", () => {
		const st = staging()
		press(st, SHIFT_X, CTRL_ROW)
		expect(msgs(press(st, ARROWS.right, CTRL_ROW))).toEqual([["/clips/window/set", 1, 0]])
	})

	it("staged slots survive a bank move and fire at their absolute slot", () => {
		const st = staging()
		press(st, SHIFT_X, CTRL_ROW)
		tap(st, 3, 0)
		applyLive(st, "/clips/window", windowMsg({ trackOff: 15 }), T0)
		expect(msgs(release(st, SHIFT_X, CTRL_ROW))[0]).toEqual(["/clips/slot/button", 3, 0, 1])
	})

	it("staged clips blink dim, and only while in the window", () => {
		const st = staging()
		press(st, SHIFT_X, CTRL_ROW)
		tap(st, 0, 0)
		const lit = clipsFrame(st, SIZE, T0)[ledIndex(SIZE, 0, 0)]
		expect((LEVEL.staged as readonly number[]).includes(lit)).toBe(true)
		applyLive(st, "/clips/window", windowMsg({ trackOff: 15 }), T0)
		expect(clipsFrame(st, SIZE, T0)[ledIndex(SIZE, 0, 0)]).toBe(LEVEL.stopped)
	})
})
```

- [ ] **Step 2: Run them to make sure they fail**

Run: `npx vitest run test/clipsStaged.test.ts`
Expected: FAIL. With staging on, shift + clip still launches.

- [ ] **Step 3: Stage in `clipPress`**

In `src/util/clipsState.ts`, replace

```ts
	const track = w.trackOff + x
	const scene = w.sceneOff + y
	st.down.set(y * GRID_W + x, { track, scene })
```

with

```ts
	const track = w.trackOff + x
	const scene = w.sceneOff + y
	if (st.opts.stagedLaunch && st.shift) {
		// Staged launch: collect now, fire on shift release. Nothing goes in `down`, so this
		// key's release sends nothing. A second tap unstages.
		const i = st.staged.findIndex((s) => s.track === track && s.scene === scene)
		if (i >= 0) st.staged.splice(i, 1)
		else st.staged.push({ track, scene, launches: code >= SLOT.emptyArmed })
		return { send: [] }
	}
	st.down.set(y * GRID_W + x, { track, scene })
```

- [ ] **Step 4: Fire on shift release**

In `controlKey`, replace

```ts
	if (x === SHIFT_X) {
		st.shift = s === 1
		return { send: [] }
	}
```

with

```ts
	if (x === SHIFT_X) {
		st.shift = s === 1
		return s === 0 && st.staged.length ? fireStaged(st) : { send: [] }
	}
```

and add, below `launched`:

```ts
/** Every staged slot as a press then a release, all presses first, so they land together.
 *  (A Gate clip fired this way plays only for that instant.) */
function fireStaged(st: ClipsState): KeyResult {
	const out: KeyResult = { send: [] }
	for (const s of st.staged) out.send.push(slotButton(s.track, s.scene, 1))
	for (const s of st.staged) out.send.push(slotButton(s.track, s.scene, 0))
	const last = [...st.staged].reverse().find((s) => s.launches)
	st.staged = []
	if (last) {
		st.focusTrack = last.track
		out.focus = last.track
	}
	return out
}
```

- [ ] **Step 5: Draw staged slots**

At the end of the first loop in `drawClips` (after the slot cells are drawn, before the scene loop), add:

```ts
	for (const s of st.staged) {
		const x = s.track - w.trackOff
		const y = s.scene - w.sceneOff
		if (x >= 0 && x < COLS && y >= 0 && y < ROWS) put(x, y, pick(LEVEL.staged))
	}
```

- [ ] **Step 6: Run the tests**

Run: `npx vitest run test/clips*.test.ts && npx tsc --noEmit`
Expected: PASS, with no type errors.

- [ ] **Step 7: Commit**

```bash
git add src/util/clipsState.ts test/clipsStaged.test.ts
git commit -m "feat(clips): staged launch experiment — hold shift, tap clips, release to fire"
```

---

### Task 6: The `clips` page

**Files:**
- Modify: `src/core/sharedStore.ts` (add `FOCUS_CLIPS` below the damp keys)
- Create: `src/pages/clips.ts`
- Test: `test/clipsPage.test.ts`

**Interfaces:**
- Consumes: `ctx.live` (Task 1), everything in `src/util/clipsState.ts` (Tasks 2–5).
- Produces: `FOCUS_CLIPS = "focus/clips"`, `class ClipsPage`, `LINK_TICK_MS = 500`, `page: PageModule` named `"clips"` with `settings` and `keymap`.

- [ ] **Step 1: Write the failing tests**

`test/clipsPage.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"
import { ClipsPage, page } from "../src/pages/clips.js"
import { SharedStore, FOCUS_CLIPS } from "../src/core/sharedStore.js"
import { HELLO_RETRY_MS, LEVEL, PAGES_X, CTRL_ROW } from "../src/util/clipsState.js"
import { ledIndex, type GridSize, type PageContext } from "../src/core/types.js"
import { windowMsg, tracksMsg, scenesMsg, type SetShape } from "./clipsFixtures.js"

const SIZE: GridSize = { width: 16, height: 8 }
type Msg = { path: string; args: any[] }

function rig(opts: { live?: boolean } = {}) {
	const live: Msg[] = []
	const osc: Msg[] = []
	let hear: ((path: string, args: any[]) => void) | null = null
	const shared = new SharedStore()
	const focus = vi.fn()
	const ctx = {
		size: SIZE,
		modifiers: { held: new Set(), shift1: false, shift2: false },
		clock: { running: false, rate: 20, tick: 0, lanes: [] },
		osc: { send: (path: string, ...args: any[]) => osc.push({ path, args }) },
		live: opts.live === false ? undefined : {
			send: (path: string, ...args: any[]) => live.push({ path, args }),
			on: (fn: (path: string, args: any[]) => void) => { hear = fn; return () => { hear = null } },
		},
		slot: 3,
		slotLabel: "d",
		setDirty: () => {},
		setShift: () => {},
		focus,
		persist: () => {},
		shared,
	} as unknown as PageContext
	const p = new ClipsPage()
	p.init(ctx)
	const fromLive = (path: string, args: any[]) => hear?.(path, args)
	const snapshot = (o: SetShape = {}) => {
		fromLive("/clips/window", windowMsg(o))
		fromLive("/clips/tracks", tracksMsg(o))
		fromLive("/clips/scenes", scenesMsg(o))
	}
	const at = (x: number, y: number) => p.render(ctx)![ledIndex(SIZE, x, y)]
	const key = (x: number, y: number, s: 0 | 1) => p.onKey({ x, y, s }, ctx)
	const hellos = () => live.filter((m) => m.path === "/clips/hello").length
	return { p, ctx, live, osc, shared, focus, fromLive, snapshot, at, key, hellos, listening: () => hear !== null }
}

beforeEach(() => vi.useFakeTimers())
afterEach(() => vi.useRealTimers())

describe("clips page", () => {
	it("says hello at init and every 2 s until the fork answers, then stops", () => {
		const r = rig()
		expect(r.hellos()).toBe(1)
		vi.advanceTimersByTime(HELLO_RETRY_MS)
		expect(r.hellos()).toBe(2)
		r.snapshot()
		vi.advanceTimersByTime(HELLO_RETRY_MS * 3)
		expect(r.hellos()).toBe(2)
	})

	it("shows the no-link border until the snapshot, then the window", () => {
		const r = rig()
		expect(r.at(0, 0)).toBe(LEVEL.noLink)
		expect(r.at(5, 3)).toBe(0)
		r.snapshot()
		expect(r.at(5, 3)).toBe(LEVEL.stopped)
	})

	it("a launch goes to Live, publishes focus/clips and tells Max", () => {
		const r = rig()
		r.snapshot({ trackOff: 15 })
		r.key(2, 0, 1)
		expect(r.live.at(-1)).toEqual({ path: "/clips/slot/button", args: [17, 0, 1] })
		expect(r.shared.get(FOCUS_CLIPS)).toBe(17)
		expect(r.osc).toContainEqual({ path: "/grid/out/page/d/focus/track", args: [17] })
	})

	it("Live traffic never reaches Max, and Max traffic never reaches Live", () => {
		const r = rig()
		r.snapshot()
		r.key(0, 0, 1)
		r.key(0, 0, 0)
		r.key(12, 7, 1)
		expect(r.osc.every((m) => m.path.startsWith("/grid/out/"))).toBe(true)
		expect(r.live.every((m) => m.path.startsWith("/clips/"))).toBe(true)
	})

	it("pages key + top-row key focuses that slot", () => {
		const r = rig()
		r.key(PAGES_X, CTRL_ROW, 1)
		r.key(5, 0, 1)
		expect(r.focus).toHaveBeenCalledWith(5)
		expect(r.live.filter((m) => m.path === "/clips/slot/button")).toEqual([])
	})

	it("announces its type and settings, takes a setting over OSC and echoes it", () => {
		const r = rig()
		expect(r.osc).toContainEqual({ path: "/grid/out/page/d/type", args: ["clips"] })
		expect(r.osc).toContainEqual({ path: "/grid/out/page/d/settings", args: [JSON.stringify({ stagedLaunch: false })] })
		r.p.onOsc!("/setting/stagedLaunch", [1], r.ctx)
		expect(r.p.serialize!()).toEqual({ stagedLaunch: true })
		expect(r.osc.at(-1)).toEqual({ path: "/grid/out/page/d/settings", args: [JSON.stringify({ stagedLaunch: true })] })
		r.p.onOsc!("/settings/get", [], r.ctx)
		expect(r.osc.at(-1)!.path).toBe("/grid/out/page/d/settings")
		r.p.onOsc!("/setting/nonsense", [1], r.ctx)
		expect(r.p.serialize!()).toEqual({ stagedLaunch: true })
	})

	it("turning staged launch off drops anything staged", () => {
		const r = rig()
		r.snapshot()
		r.p.onOsc!("/setting/stagedLaunch", [1], r.ctx)
		r.key(15, 7, 1)
		r.key(0, 0, 1)
		r.key(0, 0, 0)
		r.p.onOsc!("/setting/stagedLaunch", [0], r.ctx)
		r.key(15, 7, 0)
		expect(r.live.filter((m) => m.path === "/clips/slot/button")).toEqual([])
	})

	it("round-trips its settings through a fresh page; restore sends nothing to Live and survives junk", () => {
		const a = rig()
		a.p.onOsc!("/setting/stagedLaunch", [1], a.ctx)
		const saved = JSON.parse(JSON.stringify(a.p.serialize!()))
		const b = rig()
		const before = b.live.length
		b.p.restore!(saved, b.ctx)
		expect(b.p.serialize!()).toEqual(saved)
		expect(b.live.length).toBe(before)
		for (const junk of [null, undefined, 7, "x", [], { stagedLaunch: "maybe" }]) b.p.restore!(junk, b.ctx)
		expect(b.p.serialize!()).toEqual(saved)
	})

	it("dispose stops listening and stops the retry timer", () => {
		const r = rig()
		r.p.dispose(r.ctx)
		expect(r.listening()).toBe(false)
		const n = r.live.length
		vi.advanceTimersByTime(10_000)
		expect(r.live.length).toBe(n)
	})

	it("works on a host with no Live link: no-link border, no throw", () => {
		const r = rig({ live: false })
		vi.advanceTimersByTime(5000)
		expect(r.at(0, 0)).toBe(LEVEL.noLink)
		expect(() => r.key(3, 3, 1)).not.toThrow()
	})

	it("is registered as a page with settings and a key map", () => {
		expect(page.name).toBe("clips")
		expect(page.settings?.map((s) => s.key)).toEqual(["stagedLaunch"])
		expect(page.keymap!.length).toBeGreaterThan(8)
	})
})
```

- [ ] **Step 2: Run them to make sure they fail**

Run: `npx vitest run test/clipsPage.test.ts`
Expected: FAIL. `src/pages/clips.js` can't be resolved.

- [ ] **Step 3: Add the SharedStore key**

In `src/core/sharedStore.ts`, below `DAMP_STATE_SURFACE`:

```ts
/** Clips: the ABSOLUTE 0-based index (number) of the track whose clip was launched last.
 *  Written only by pages/clips.ts; any page may read or subscribe. */
export const FOCUS_CLIPS = "focus/clips"
```

- [ ] **Step 4: Write the page**

`src/pages/clips.ts`:

```ts
/* Page: Clips  (Ableton Live Session-view clip launcher, over the idk.clips fork)
 * ------------------------------------------------------------------------------
 * Summary : Launch clips and scenes in Live's Session view from a 15×6 window that banks
 *           four ways; Live's red box follows. Layers for mute / solo / arm / volume.
 * Input   : x0–14 × y0–5 = clips. Press and release both go to Live (/clips/slot/button),
 *           so Gate, Repeat and legato behave as in Live. x15 y0–5 = scenes.
 *           y6 = track stop (C layer) or that layer's toggle (M/S/A); x15 y6 = stop all.
 *           y7: x0 = pages key (hold, then x0–7 on y0 → slot a–h) · x1–5 = layers C M S A V
 *           (tap latches, hold >300 ms is momentary, tap C to return) · x11–14 = ← → ↑ ↓
 *           bank a whole window · x15 = ⇧ (+ arrow: move by one).
 *           V layer: x0–14 × y0–6 = 7-step faders (y0 = 0 dB, y6 = −∞); x15 = master,
 *           shown but not settable (the contract has no master address yet).
 * Display : one table, util/clipsState.ts LEVEL. Blinks follow /clips/beat, or a local
 *           500 ms clock while Live sends none. No link to Live: a dim border.
 * Settings: stagedLaunch (experiment, off): hold ⇧, tap clips, release ⇧ to fire together.
 * Rules   : Reaches Live ONLY through ctx.live (/clips/..., io/liveLink.ts, 11000/11001),
 *           never ctx.osc; Max hears only /grid/out/page/<slot>/focus/track <n> (+ type,
 *           settings). Absolute track/scene indices: a release goes to the slot its press
 *           hit, even after a bank move or a layer change. The last launched track is
 *           published in SharedStore "focus/clips" (this page is its one writer). Presets
 *           keep the setting only — the window, the link and anything staged are runtime,
 *           and restoring sends nothing to Live. One timer (LINK_TICK_MS) drives the hello
 *           retry and the quiet-link probe; it is cleared in dispose(), not onBlur(), so the
 *           link stays current while another slot is on screen.
 *           Contract: idk.clips' spec (2026-10-12); our readings: docs/clips-contract-notes.md.
 * ------------------------------------------------------------------------------
 */

import type { Page, PageContext, KeyEvent, LedFrame, GridSize, Slot } from "../core/types.js"
import type { KeySpec, PageModule, SettingSpec } from "../core/pageModule.js"
import { FOCUS_CLIPS } from "../core/sharedStore.js"
import { isRecord, bool } from "../util/restoreGuards.js"
import {
	createClipsState, applyLive, linkTick, pressKey, clipsFrame,
	COLS, ROWS, SCENE_COL, STOP_ROW, CTRL_ROW, SHIFT_X, PAGES_X, ARROWS, LAYER_KEYS, LEVEL,
	type ClipsState, type KeyResult,
} from "../util/clipsState.js"

/** How often the link timer runs; linkTick itself paces the hellos (2 s) and probes (10 s). */
export const LINK_TICK_MS = 500

const SPECS: SettingSpec[] = [
	{
		key: "stagedLaunch", label: "staged launch", type: "toggle", default: false,
		help: "Experiment: hold ⇧ (x15 y7), tap clips, release ⇧ to fire them together.",
	},
]
const SPEC_BY_KEY = new Map(SPECS.map((s) => [s.key, s]))

export class ClipsPage implements Page {
	private st: ClipsState = createClipsState()
	private size: GridSize = { width: 16, height: 8 }
	private ownSlot = -1
	private unlisten: (() => void) | null = null
	private timer: ReturnType<typeof setInterval> | null = null

	init(ctx: PageContext) {
		this.size = ctx.size
		this.ownSlot = ctx.slot
		this.unlisten = ctx.live?.on((path, args) => { applyLive(this.st, path, args, Date.now()) }) ?? null
		this.tick(ctx)
		this.timer = setInterval(() => this.tick(ctx), LINK_TICK_MS)
		this.announce(ctx)
	}

	onFocus(ctx: PageContext) {
		this.announce(ctx)
	}

	onBlur() {}

	onKey(ev: KeyEvent, ctx: PageContext) {
		this.apply(pressKey(this.st, ev.x, ev.y, ev.s, Date.now()), ctx)
	}

	// In: /setting/<key> <v> · /<key> <v> · /<key>/<v> · /settings/get.
	onOsc(path: string, args: any[], ctx: PageContext) {
		const parts = path.split("/").filter(Boolean)
		let i = 0
		if (parts[i] === "setting" || parts[i] === "settings") i++
		const key = parts[i]
		if (!key) return
		if (key === "get") {
			this.emitSettings(ctx)
			return
		}
		const raw = args.length ? args[0] : parts[i + 1]
		if (raw === undefined) return
		if (!this.applySetting(key, raw)) return
		this.emitSettings(ctx)
	}

	render(): LedFrame {
		return clipsFrame(this.st, this.size, Date.now(), this.ownSlot)
	}

	/** The setting only: the window, the link and anything staged are runtime. */
	serialize() {
		return { stagedLaunch: this.st.opts.stagedLaunch }
	}

	restore(config: unknown, ctx: PageContext) {
		if (!isRecord(config)) return
		for (const spec of SPECS) if (config[spec.key] !== undefined) this.applySetting(spec.key, config[spec.key])
		this.announce(ctx) // init() announced the defaults; they are stale now
	}

	dispose() {
		this.unlisten?.()
		this.unlisten = null
		if (this.timer) clearInterval(this.timer)
		this.timer = null
	}

	private tick(ctx: PageContext) {
		for (const m of linkTick(this.st, Date.now())) ctx.live?.send(m.path, ...m.args)
	}

	private apply(r: KeyResult, ctx: PageContext) {
		for (const m of r.send) ctx.live?.send(m.path, ...m.args)
		if (r.focus !== undefined) {
			ctx.shared?.set(FOCUS_CLIPS, r.focus)
			ctx.osc.send(`/grid/out/page/${ctx.slotLabel}/focus/track`, r.focus)
		}
		if (r.focusSlot !== undefined) ctx.focus(r.focusSlot as Slot)
	}

	/** Store one setting; returns true if it was a known key. */
	private applySetting(key: string, raw: unknown): boolean {
		if (!SPEC_BY_KEY.has(key)) return false
		if (key === "stagedLaunch") {
			this.st.opts.stagedLaunch = bool(raw, this.st.opts.stagedLaunch)
			if (!this.st.opts.stagedLaunch) this.st.staged = []
		}
		return true
	}

	private announce(ctx: PageContext) {
		ctx.osc.send(`/grid/out/page/${ctx.slotLabel}/type`, "clips")
		this.emitSettings(ctx)
	}

	private emitSettings(ctx: PageContext) {
		ctx.osc.send(`/grid/out/page/${ctx.slotLabel}/settings`, JSON.stringify(this.serialize()))
	}
}

const LAYER_NAMES: Record<string, string> = { clips: "Clips", mute: "Mute", solo: "Solo", arm: "Arm", volume: "Volume" }

const KEYMAP: KeySpec[] = [
	{ x: 0, y: 0, w: COLS, h: ROWS, name: "Clips", help: "Launch a clip; release matters for Gate and Repeat. An empty slot stops its track (or records, if armed). V layer: volume faders.", lit: LEVEL.stopped },
	{ x: SCENE_COL, y: 0, h: ROWS, name: "Scenes", help: "Launch a scene. V layer: master volume, shown only.", lit: LEVEL.scenePresent },
	{ x: 0, y: STOP_ROW, w: COLS, name: "Track stop", help: "Stop a track. M / S / A layers: toggle that track's mute, solo or arm.", lit: LEVEL.stopIdle },
	{ x: SCENE_COL, y: STOP_ROW, name: "Stop all", short: "■", lit: LEVEL.stopIdle },
	{ x: PAGES_X, y: CTRL_ROW, name: "Pages", short: "P", help: "Hold, then press x0–x7 on the top row to jump to slot a–h.", lit: LEVEL.pagesUp },
	...Object.entries(LAYER_KEYS).map(([x, layer]): KeySpec => ({
		x: Number(x), y: CTRL_ROW, name: `${LAYER_NAMES[layer]} layer`, short: layer[0].toUpperCase(),
		help: "Tap to latch, hold for momentary, tap C to return.",
		lit: layer === "clips" ? LEVEL.layerActive : LEVEL.layerOther,
	})),
	{ x: ARROWS.left, y: CTRL_ROW, name: "Bank left", short: "←", lit: LEVEL.arrowCan },
	{ x: ARROWS.right, y: CTRL_ROW, name: "Bank right", short: "→", lit: LEVEL.arrowCan },
	{ x: ARROWS.up, y: CTRL_ROW, name: "Bank up", short: "↑", lit: LEVEL.arrowCan },
	{ x: ARROWS.down, y: CTRL_ROW, name: "Bank down", short: "↓", lit: LEVEL.arrowCan },
	{ x: SHIFT_X, y: CTRL_ROW, name: "Shift", short: "⇧", help: "+ arrow: move by one track or scene. Staged launch: hold, tap clips, release to fire.", lit: LEVEL.shiftUp },
]

export const page: PageModule = {
	name: "clips",
	label: "Clips (Ableton Live)",
	create: () => new ClipsPage(),
	settings: SPECS,
	keymap: KEYMAP,
}
```

- [ ] **Step 5: Run the page tests, then everything**

Run: `npx vitest run test/clipsPage.test.ts && npm test && npx tsc --noEmit`
Expected: all PASS, including `test/keymap.test.ts` and `test/registry.test.ts`, which now see `clips`. No type errors.

- [ ] **Step 6: Commit**

```bash
git add src/core/sharedStore.ts src/pages/clips.ts test/clipsPage.test.ts
git commit -m "feat(clips): clips page — Live link wiring, focus/clips, staged-launch setting, key map"
```

---

### Task 7: A stand-in fork, so Ian can see the page before idk.clips exists

**Files:**
- Create: `src/cli/clips-fake-live.ts`
- Modify: `package.json` (`scripts`)

**Interfaces:**
- Consumes: `createOsc` from `src/io/osc.ts`.
- Produces: `npm run clips:fake`. It binds UDP 11000 and answers the `/clips` contract loosely: no launch modes, no quantization. A dev aid only; it isn't imported by anything.

This task has no unit test of its own. The page's behaviour is pinned in Tasks 2–6, and this file only exists to drive the web sim by hand.

- [ ] **Step 1: Write the stand-in**

`src/cli/clips-fake-live.ts`:

```ts
// src/cli/clips-fake-live.ts — a stand-in for the idk.clips fork, so the clips page can be
// seen in the web sim before Live is wired. It is NOT the contract's owner and plays it only
// loosely: 20 tracks × 10 scenes, launches are instant (no quantization, no launch modes),
// and a beat every 500 ms. Binds UDP 11000, replies to 11001. Run: npm run clips:fake

import { createOsc } from "../io/osc.js"

const W = 15
const H = 6
const N_TRACKS = 20
const N_SCENES = 10

const osc = createOsc({ localAddress: "127.0.0.1", localPort: 11000, remotePort: 11001 })
const hasClip = (t: number, s: number) => (t * 7 + s * 3) % 5 !== 0
const playing: (number | null)[] = Array.from({ length: N_TRACKS }, (_, t) => (t % 3 === 0 && hasClip(t, 0) ? 0 : null))
const flags = Array.from({ length: N_TRACKS }, () => 1) // bit0 exists
const volumes = Array.from({ length: N_TRACKS }, () => 0.85)
let trackOff = 0
let sceneOff = 0
let beat = 0

const code = (t: number, s: number) => {
	if (t >= N_TRACKS || s >= N_SCENES) return 0
	if (playing[t] === s) return 5
	if (!hasClip(t, s)) return flags[t] & 2 ? 2 : 1
	return 3
}

const sendAll = () => {
	const slots: number[] = []
	for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) slots.push(code(trackOff + x, sceneOff + y))
	osc.send("/clips/window", trackOff, sceneOff, N_TRACKS, N_SCENES, ...slots)
	const f: number[] = []
	const v: number[] = []
	for (let x = 0; x < W; x++) {
		const t = trackOff + x
		f.push(t < N_TRACKS ? flags[t] | (playing[t] !== null ? 16 : 0) : 0)
		v.push(t < N_TRACKS ? volumes[t] : 0)
	}
	osc.send("/clips/tracks", trackOff, ...f, ...v, 0.85)
	const sc: number[] = []
	for (let y = 0; y < H; y++) sc.push(sceneOff + y < N_SCENES ? 1 : 0)
	osc.send("/clips/scenes", sceneOff, ...sc)
}

const clampOff = (v: number, n: number, size: number) => Math.max(0, Math.min(Math.max(0, n - size), Math.trunc(v)))
const BITS: Record<string, number> = { arm: 2, mute: 4, solo: 8 }

osc.onMessage((path, args) => {
	const n = args.map(Number)
	switch (path) {
		case "/clips/hello":
			break
		case "/clips/window/set":
			trackOff = clampOff(n[0], N_TRACKS, W)
			sceneOff = clampOff(n[1], N_SCENES, H)
			break
		case "/clips/slot/button":
			if (n[2] !== 1 || n[0] >= N_TRACKS) return
			playing[n[0]] = hasClip(n[0], n[1]) ? n[1] : null
			break
		case "/clips/scene/button":
			if (n[1] !== 1) return
			for (let t = 0; t < N_TRACKS; t++) playing[t] = hasClip(t, n[0]) ? n[0] : null
			break
		case "/clips/track/stop":
			playing[n[0]] = null
			break
		case "/clips/stop_all":
			playing.fill(null)
			break
		case "/clips/track/set": {
			const t = n[1]
			if (t < 0 || t >= N_TRACKS) return
			const bit = BITS[String(args[0])]
			if (bit) flags[t] = n[2] ? flags[t] | bit : flags[t] & ~bit
			else if (args[0] === "volume") volumes[t] = n[2]
			break
		}
		default:
			return
	}
	sendAll()
})

setInterval(() => osc.send("/clips/beat", beat++), 500)
console.log("[fake-live] /clips stand-in on 11000 → 11001 (20 tracks × 10 scenes). Ctrl-C to stop.")
```

- [ ] **Step 2: Add the script**

In `package.json` `scripts`, after `"grid:led"`:

```json
		"clips:fake": "tsx src/cli/clips-fake-live.ts"
```

(Add the comma to the `grid:led` line.)

- [ ] **Step 3: Type-check and smoke it alone** (it only binds 11000, so it can't disturb the running agent)

Run: `npx tsc --noEmit && (timeout 3 npm run clips:fake; true)`
Expected: no type errors; the `[fake-live] … Ctrl-C to stop.` line prints, then the timeout ends it.

- [ ] **Step 4: Commit**

```bash
git add src/cli/clips-fake-live.ts package.json
git commit -m "chore(clips): fake /clips fork for viewing the page in the web sim"
```

---

### Task 8: Docs, contract notes, handoff

**Files:**
- Create: `docs/clips-contract-notes.md`
- Modify: `CLAUDE.md` (project layout; OSC section; ports note)
- Modify: `docs/PAGE_PROTOCOL.md` (§1)
- Modify: `HANDOFF.md` (prepend a Session log entry)

- [ ] **Step 1: Write the contract notes**

`docs/clips-contract-notes.md`:

```markdown
# clips page ↔ idk.clips: the /clips contract, read from gridmapper's side

The contract belongs to idk.clips
(`idk.clips/docs/superpowers/specs/2026-10-12-clip-launcher-design.md`); nothing here
changes it. These are Ian's calls of 2026-10-12, and the page's readings of places the
spec is silent. **idk.clips: please confirm or correct the readings (4–11).**

## Decided by Ian (2026-10-12)

1. **Master volume** — the V layer's x15 column *shows* master (from `/clips/tracks`) but
   sends nothing: no address sets it. Wiring one in is a one-line change in
   `src/util/clipsState.ts` (`faderPress`).
2. **Hold-to-cue is out of v1.** It needs what the feed doesn't carry: each track's playing
   scene when that is outside the 6-scene window, and each clip's launch mode (to skip Gate
   clips). Revisit if idk.clips adds them.
3. **x0 y7 is the pages key** (the spec had it reserved): hold, then x0–x7 on y0 focuses
   slot a–h. Page-side only.

## The page's readings

4. **Indices are 0-based** (AbletonOSC's convention): tracks, scenes, and the `n` in
   `/grid/out/page/<slot>/focus/track <n>`.
5. **Offsets clamp to `max(0, n − 15)` tracks / `max(0, n − 6)` scenes**: the box never
   shows past the last track unless the set is smaller than the box. The page clamps what it
   asks for the same way, and always draws the window the fork reports.
6. **`/clips/beat`** is read as a whole beat count, sent once per beat while Live plays and
   not at all while it is stopped. The page blinks on the beat's parity while one has come
   in the last 2 s, otherwise on its own 500 ms clock (so queued clips still blink with the
   transport stopped). A fractional song position sent many times a beat would break the
   recording "dip".
7. **Whole numbers go out as OSC int, fractions as float** (gridmapper's `io/osc.ts` does this
   for every message), so `/clips/track/set volume 18 0` carries int `0`. The fork must accept
   an int wherever it expects a float.
8. **Liveness.** The window feed is silent while nothing changes, so silence can't mean
   "Live quit". After 10 s with no `/clips` message the page sends `/clips/hello` as a probe;
   no answer within 2 s means no link, then a hello every 2 s. It costs one snapshot per quiet
   10 s; a `/clips/ping` → `/clips/pong` pair would do it with less traffic.
9. **Each feed message carries its own offset.** The page only uses a `/clips/tracks` or
   `/clips/scenes` whose offset matches the current `/clips/window`, so a bank move never
   draws (or toggles) the wrong tracks. The fork should send all three after every move.
10. **Volume faders** are 7 steps, linear in Live's 0..1 parameter from 0 (−∞) to 0.85, which
    the page takes to be 0 dB. To confirm in the spike.
11. **Staged launch** fires each staged slot as a press then a release (all presses first),
    so a staged Gate clip plays only for that instant.
```

- [ ] **Step 2: CLAUDE.md**

In the **Project layout** block, add after the `pages/meadowphysics.ts` entry (keep the block's two-space/column style):

```
  io/liveLink.ts         the Ableton Live link: a SECOND OSC peer (send 11000, listen 11001,
                         loopback), never mixed with Max's. Pages get it as ctx.live; only
                         pages/clips.ts uses it.
  pages/clips.ts         CLIPS — Live Session-view launcher over the idk.clips AbletonOSC fork.
                         15×6 window (Live's red box follows), x15 scenes, y6 stop/toggles,
                         y7 pages key · C M S A V layers · ←→↑↓ · ⇧. Absolute indices; publishes
                         SharedStore "focus/clips" + /grid/out/page/<slot>/focus/track <n>.
                         Contract is idk.clips'; our readings: docs/clips-contract-notes.md.
  util/clipsState.ts     the clips page's pure model: feed, offsets, liveness, keys, LEVEL, frame
  cli/clips-fake-live.ts stand-in /clips fork for the web sim (npm run clips:fake)
```

In the **OSC vocabulary** section, after the `**Power (implemented).**` bullet, add:

```markdown
- **Ableton Live link (implemented, 2026-10-12).** A second OSC peer, `io/liveLink.ts`:
  send **11000**, listen **11001**, loopback only, fully separate from the Max link (Live
  traffic never reaches Max or the web panel). Pages see it as `ctx.live` (`send`, `on` →
  unsubscribe). Only `pages/clips.ts` uses it, speaking idk.clips' `/clips/...` contract.
  Ports are boot-only settings (`osc.liveOutPort` / `osc.liveInPort`). If 11001 is taken,
  the clips page just shows "no link".
```

In the **Ports** note (the `> **Ports:**` line), append:

```
> The Live link holds UDP **11001** (and sends to 11000, the idk.clips fork).
```

- [ ] **Step 3: PAGE_PROTOCOL.md §1**

After the paragraph ending "If you find yourself importing anything from `src/io/`, stop — you're outside the contract.", add:

```markdown
The one sanctioned way out to another app is a link the host hands you on the context —
today `ctx.live` (the Ableton Live link, `io/liveLink.ts`). You still never import it:
use `ctx.live?.send(...)` / `ctx.live?.on(...)`, unsubscribe in `dispose()`, and expect it
to be absent in test rigs. See `pages/clips.ts`.
```

- [ ] **Step 4: HANDOFF.md**

Prepend a Session log entry with this content (fill in the date, agent, final test count, and whether Ian has seen the page):

```markdown
- **2026-10-12 · claude-mac · clips page (gridmapper side of idk.clips).** New `io/liveLink.ts`
  (ctx.live, UDP 11000/11001), `util/clipsState.ts` (pure model + LED table), `pages/clips.ts`,
  `cli/clips-fake-live.ts` (`npm run clips:fake`). Ian's calls: master volume shown only,
  hold-to-cue dropped, x0 y7 = pages key. Contract readings for idk.clips in
  `docs/clips-contract-notes.md`. Verified: unit tests (count) + tsc; NOT verified in Live
  (fork unbuilt) or on the grid. Next: Ian views it in the sim against the fake fork; the
  launchd agent needs `kickstart -k` to pick up the Live link (it binds 11001).
```

- [ ] **Step 5: Final check and commit**

Run: `npm test && npx tsc --noEmit`
Expected: all PASS.

```bash
git add docs/clips-contract-notes.md CLAUDE.md docs/PAGE_PROTOCOL.md HANDOFF.md
git commit -m "docs(clips): Live link, clips page, contract readings for idk.clips"
```

- [ ] **Step 6: Hand over. Don't restart anything unasked.**

Report: "ready for you to check". Say what was verified (unit tests, tsc, the fake fork starts on its own) and what wasn't (Live, the grid, the web sim). Then **ask Ian** before either of these, because both affect his running setup:

- (a) `launchctl bootout` the agent, then run `npm run clips:fake` + `npm run sim` so he can see the page in the browser; or
- (b) `launchctl kickstart -k gui/$(id -u)/com.ianduclos.gridmapper` so the always-on agent picks up the Live link.

The `CHANGES.md` entry (boundary: a new port and a new page) goes out through the `wrapup` skill at session end.
