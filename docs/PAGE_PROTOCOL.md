# gridmapper — Page Authoring Protocol

How to write a **page prototype** for gridmapper and drop it in. Audience: a person
or an LLM. If you follow this, your file goes into `src/pages/`, is auto-discovered,
and is immediately selectable on every grid and in the web UI. No central list to
edit, no wiring.

> **The one sentence:** You write input handling and a `render()` that returns *what
> the 8×16 grid should look like right now* (values 0–15). The framework owns
> everything else — rate limiting, batching, diffing, key routing, frame timing.

---

## 1. The boundary (read this first)

You are responsible for exactly two things:

1. **React to key presses** (`onKey`) — only the *focused* page receives them.
2. **Describe the current frame** (`render`) — an intensity per cell, `0..15`.

You are **never** responsible for, and must **never** touch:

- The device / driver (`serialoscDriver`, OSC LED messages) — forbidden.
- Rate limiting, burst caps, quadrant batching — handled for you.
- Deciding *when* to push to the grid — the render loop does it every frame.
- Other pages, focus, slots — not your concern.

If you find yourself importing anything from `src/io/`, stop — you're outside the
contract.

---

## 2. Quickstart

1. Copy `src/pages/_template.ts` → `src/pages/<yourname>.ts`.
2. Fill in the spec-comment header (§9), the class, and the `page` descriptor.
3. Save. Done. It appears in the page dropdown and is loadable into any slot.

That's the whole loop. Files beginning with `_` are ignored by the loader, which is
why the template ships inert.

---

## 3. The `Page` interface

From `src/core/types.ts`. Implement this:

```ts
interface Page {
  init(ctx: PageContext): void                 // once, when loaded into a slot
  onFocus(ctx: PageContext): void              // page became visible
  onBlur(ctx: PageContext): void               // page hidden
  onKey(ev: KeyEvent, ctx: PageContext): void  // a key went down (s=1) or up (s=0)
  onOsc?(path: string, args: any[], ctx: PageContext): void  // optional, app OSC in
  render(ctx: PageContext): LedFrame | undefined             // the current frame
  serialize?(): unknown                        // optional, structural config for presets
  dispose(): void                              // slot unloaded — clean up
}
```

When each is called:

| Method      | When                                                            |
|-------------|----------------------------------------------------------------|
| `init`      | Once, when the page is created in a slot. Read `ctx.size`, set up state. |
| `onFocus`   | When this slot becomes the focused one (incl. loading into the focused slot). |
| `onBlur`    | When focus leaves this slot. Clear visual state if you want.    |
| `onKey`     | On every key edge, **only while focused**. Mutate state; don't draw here. |
| `onOsc`     | When app OSC is routed to this slot (optional).                 |
| `render`    | **Every frame** (~58fps) while focused. Return the frame for *now*. |
| `serialize` | When a preset is captured (optional).                          |
| `dispose`   | When the slot is unloaded/replaced. Clean up timers (rare).    |

---

## 4. The frame (`LedFrame`)

A frame is a flat, row-major `Uint8Array` of length `width*height`, each cell `0..15`.

```ts
import { makeFrame, ledIndex } from "../core/types.js"

const f = makeFrame(ctx.size)              // all zeros (dark)
f[ledIndex(ctx.size, x, y)] = 15           // set cell (x,y) to full
return f
```

- `ledIndex(size, x, y)` → `y * width + x`. Always index through it.
- Values are clamped to `0..15` downstream, but stay in range — it's clearer.
- `render()` may return a **fresh** frame each call or a **reused** buffer; both work
  (the reconciler diffs against what it last sent).
- Returning `undefined` keeps the previous frame.

---

## 5. Input (`onKey`)

```ts
interface KeyEvent { x: number; y: number; s: 0 | 1 } // s: 1 = press, 0 = release
```

- Only the **focused** page gets keys.
- **Momentary vs latched is your call** — act on `s===1` only (latch/toggle), or on
  both edges (hold-to-do). Base acts on both (light on down, clear on up);
  Screensaver acts on `s===1` only (advance).
- The grid has no dedicated shift/side buttons. If you want a modifier, treat a held
  key as one — currently-held cells are available via `ctx.modifiers.held`
  (a `Set` of `ledIndex` values).
- Do **not** draw from `onKey`. Mutate state; the next `render()` reflects it.

---

## 6. Timing & animation — the per-frame model

**`render()` is called for you every frame (~58fps).** This is the key idea:

- **Static page?** Keep a frame in state, update it in `onKey`, return it from
  `render()`. Nothing changes between frames → the reconciler sends nothing.
- **Animated page?** Just read a clock in `render()`:

  ```ts
  onFocus() { this.startMs = Date.now() }      // reset the animation clock
  render() {
    const tSec = (Date.now() - this.startMs) / 1000
    return myAnimation(tSec, this.size)        // pure function of time
  }
  ```

You **do not** need `setInterval`, and you **do not** need `setDirty()` — those are
gone from the author's job. (If you ever do spin up a timer for non-visual reasons,
clear it in `onBlur`/`dispose`.) The framework also **force-repaints on every page
change**, so you never have to "kick" the first frame.

Why 58fps: the grid's serialosc redraw default is 60fps; we run just under it so we
never out-run the device. You don't set this — `FRAME_FPS` lives in the render loop.

---

## 7. Registration — auto-discovery

Export a `page` descriptor (`src/core/pageModule.ts`). The loader
(`src/pages/registry.ts`) scans the folder at startup and registers it:

```ts
import type { PageModule } from "../core/pageModule.js"

export const page: PageModule = {
  name: "mypage",            // unique, lowercase — id in messages + dropdown
  label: "My Page",          // display name (optional)
  create: () => new MyPage(), // fresh instance each time a slot loads it
  settings: [ /* optional, see §8 */ ],
}
```

Rules:

- **One page module per file.** `name` must be unique.
- Files starting with `_` are skipped (templates/helpers).
- Put shared, testable logic in plain functions (ideally a separate `util/` module),
  not in the loader's path.

That's it — no edit to any registry/list. Drop the file, restart the app, and it's
in the dropdown.

---

## 8. Settings (declare-now, wire-later)

You may declare page settings today. The right-hand settings panel that renders and
feeds them is being built; declaring now keeps your page forward-compatible and
self-describing. `SettingSpec` (`src/core/pageModule.ts`):

```ts
settings: [
  { key: "speed", type: "number", min: 0.1, max: 4, step: 0.1, default: 0.5 },
  { key: "wrap",  type: "toggle", default: true },
  { key: "mode",  type: "enum", options: ["a", "b", "c"], default: "a" },
]
```

Until the panel lands, values are **not** delivered to your page — use your own
constants/defaults for now and read settings once the wiring exists. Don't block on
this; declaring is optional.

---

## 9. The spec-comment header (required)

Every page file starts with this block — it's the contract in prose, for the next
human/LLM to read at a glance. Keep it accurate as the page evolves.

```
/* Page: <Name>
 * ------------------------------------------------------------------
 * Summary : one line — what this page is.
 * Input   : what key presses do.
 * Display : what the LEDs show (0..15).
 * Settings: declared knobs (or "none").
 * Rules   : invariants / edge cases you guarantee.
 * ------------------------------------------------------------------
 */
```

(Longer prose, acceptance criteria, or a worked rationale below the block are
welcome — this codebase favours "comment before program".)

---

## 10. What the framework guarantees

So you can stop thinking about it:

- **Single output path.** A fixed-rate loop is the *only* thing that pushes LEDs.
- **Diffing.** Your frame is compared to the last-sent one; unchanged → zero output.
- **Quadrant batching.** Many cells changed in an 8×8 quadrant → one `led/level/map`
  message; a few → per-cell `led/level/set`. You never choose.
- **Force repaint on page change**, so switching pages always paints cleanly.
- **Key routing.** Only the focused page is fed keys.
- **Real grid vs sim are identical.** Your page can't tell, and shouldn't try.

---

## 11. Hard rules (do / don't)

- ✅ Keep `render()` cheap — it runs ~58×/sec. Building a 128-cell frame is fine; a
  network call or heavy allocation loop is not.
- ✅ Keep cell values in `0..15` and coordinates in-bounds (`ledIndex` + size checks).
- ✅ Put visual logic in **pure functions** of `(time/state, size)` → easy to test.
- ✅ Clean up in `dispose()` (and `onBlur` for visuals).
- ❌ Don't import from `src/io/` or send LED OSC. Output is `render()` only.
- ❌ Don't rate-limit, sleep, or block.
- ❌ Don't throw from `render()`/`onKey` (the loop guards, but don't rely on it).
- ❌ Don't reach into other pages, slots, or global state.

---

## 12. Testing

Extract the visual logic as a pure function and unit-test it (see
`src/pages/screensaver.ts` + `test/screensaver.test.ts`):

```ts
// in your page file
export function myAnimation(tSec: number, size: GridSize): LedFrame { /* ... */ }

// in test/<name>.test.ts
import { myAnimation } from "../src/pages/<name>.js"
it("peaks mid-cycle", () => { expect(myAnimation(1, SIZE)[0]).toBe(15) })
```

Run `npm test`.

---

## 13. Worked example (annotated)

A complete page — momentary light surface (this is `BasePage`):

```ts
/* Page: Base
 * ------------------------------------------------------------------
 * Summary : Momentary light surface. Press lights a cell; release clears it.
 * Input   : key down → cell = 15; key up → cell = 0.
 * Display : pressed cells full-bright, everything else dark.
 * Settings: none.
 * Rules   : dark at rest; clears held cells on blur.
 * ------------------------------------------------------------------
 */
import { type Page, type PageContext, type KeyEvent, type LedFrame, makeFrame, ledIndex } from "../core/types.js"
import type { PageModule } from "../core/pageModule.js"

export class BasePage implements Page {
  private size = { width: 16, height: 8 }
  private frame!: LedFrame

  init(ctx: PageContext) { this.size = ctx.size; this.frame = makeFrame(this.size) }
  onFocus() {}
  onBlur() { this.frame.fill(0) }
  onKey(ev: KeyEvent) {
    const i = ledIndex(this.size, ev.x, ev.y)
    if (i < 0 || i >= this.frame.length) return
    this.frame[i] = ev.s ? 15 : 0
  }
  render(): LedFrame { return this.frame }
  dispose() {}
}

export const page: PageModule = { name: "base", label: "Base", create: () => new BasePage() }
```

For an **animated** example (per-cell triangle, Perlin field) see
`src/pages/screensaver.ts`.

---

## 14. Checklist before you drop it in

- [ ] Spec-comment header filled in and accurate.
- [ ] Implements `Page`; `render()` returns a `0..15` frame.
- [ ] Input handled in `onKey`; nothing drawn there.
- [ ] No imports from `src/io/`; no LED OSC; no rate-limiting; no `setInterval` for
      animation.
- [ ] Exports `page: PageModule` with a unique lowercase `name`.
- [ ] Visual logic is a pure function with a unit test (encouraged).
- [ ] `npx tsc --noEmit` clean; `npm test` green.
