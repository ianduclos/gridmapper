import { describe, it, expect } from "vitest"
import { hotelierKeyHz, eventHz, worlds } from "../src/data/cells-hot-worlds.js"
import snapshot from "../src/data/hotelier-tunings.json" with { type: "json" }

describe("Hotelier tuning compatibility", () => {
 it("anchors all nine keyboard maps at A432 and preserves each period", () => {
  expect(snapshot.tables).toHaveLength(9)
  for (const t of snapshot.tables) {
   expect(hotelierKeyHz(t.id, 69)).toBe(432)
   expect(hotelierKeyHz(t.id, 69 + t.cents.length) / hotelierKeyHz(t.id, 69))
    .toBeCloseTo(2 ** ((t.period ?? 1200) / 1200), 12)
  }
 })
 it("preserves Young's intentionally nonascending keyboard order", () => {
  expect(hotelierKeyHz("young", 68)).toBeLessThan(hotelierKeyHz("young", 67))
 })
 it("maps a source period to the selected Hotelier period, independently of root multiplier", () => {
  const world = worlds["amadinda-ndyegulira"]
  const e = { atPulse: 0, durationPulses: 1, gain: .5, pitchOffsetCents: 0, pitchStep: 0 }
  const base = eventHz("hotelier-ranat", 0, e, world, 1)
  expect(eventHz("hotelier-ranat", 0, {...e, pitchStep: 5}, world, 1) / base)
   .toBeCloseTo(2 ** (1207 / 1200), 12)
  expect(eventHz("hotelier-ranat", 0, e, world, 2)).toBe(base * 2)
 })
})
