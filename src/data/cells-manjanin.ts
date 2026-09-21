import type { Cell, CellEvent, World } from "./cells-hot-worlds.js"

const source = "Rainer Polak (2010), Rhythmic Feel as Meter; Drissa Kone Quartet, Bamako 2006. Table 1 cycles 5–12 and 175–178; tables 8–10; §§65,69,83–90. https://www.mtosmt.org/issues/mto.10.16.4/mto.10.16.4.polak.html"

// Literal twelve-column rows of the published score. Dots here mean no
// transcribed attack. No flam-containing phrase is used in these excerpts.
export const manjaninLead = [
 ["..S..S..S..S", "..S..S..S.TS", ".BS.SS.BS.SS", "TTS.SS.BS.SS"],
 [".BS.SS.BS.SS", "TTS.SS.BSSTT", "S....SSS..TT", ".TT.TT.TT.TS"],
 ["TTSSBSSBSSBS", "SBSSBSSBSSBS", "SBSSBSSBSSBS", "TTSSBSSBSSBS"],
]

// 27:33:40 is a descriptive lead/accompaniment model, not a universal
// Manjanin quantizer. The first dunun has its own published mean timing.
export function manjaninPulse(p: number): number {
 return Math.floor(p / 3) * 3 + [0, 0.81, 1.8][p % 3]
}
// Table 10 rounded IOI percentages total 401, normalized to exactly one cycle.
export const manjaninDununTimes = [0, 59, 159, 257, 322].map(x => x * 12 / 401)
const dununSlots = [0, 2, 5, 8, 10]
const leadNames = ["Cycles 5–8 · open space", "Cycles 9–12 · turning phrase", "Cycles 175–178 · heat"]

function hit(atPulse: number, token: string, pitchStep: number, gain: number, durationPulses: number): CellEvent {
 return { atPulse, sourceToken: token, pitchStep, gain, durationPulses, pitchOffsetCents: 0 }
}
function cell(voice: number, choice: number, name: string, lengthPulses: number,
 events: CellEvent[], note: string, kind = "source-derived-arrangement"): Cell {
 return {
  id: `manjanin-${voice}-${choice}`, name, lengthPulses, events,
  provenance: { kind, source, note,
   timing: "Lead/J2: 27:33:40 model; D1: normalized published mean IOIs 59:100:98:65:79. D2 inherits model timing, not separately measured onsets.",
   adaptation: "Excerpt loops and timbral splits for six voices. Pitch, gain and duration are composed; not a drum recording or a traditional melodic scale." },
 }
}
const cells: Cell[][] = Array.from({length: 6}, () => [])
for (let choice = 0; choice < 3; choice++) {
 const length = choice === 2 ? 48 : 12
 const open: CellEvent[] = [], muted: CellEvent[] = []
 for (let cycle = 0; cycle < length / 12; cycle++) {
  for (let i = 0; i < dununSlots.length; i++) {
   const slot = dununSlots[i], at = cycle * 12 + manjaninDununTimes[i]
   if (slot === 5) muted.push(hit(at, "D1:X", 4, .30, .38))
   else if (!(slot === 0 && (choice === 1 || (choice === 2 && cycle === 3))))
    open.push(hit(at, "D1:O", 0, .58, 1.7))
  }
 }
 cells[0].push(cell(0, choice, ["Dunun theme", "Omit downbeat · published variation", "Dunun cycles 175–178"][choice], length, open,
  "Open strokes separated from X. The omission choice loops the published variation (§53) independently of its original context; heat excerpt omits only cycle 178 downbeat."))
 cells[1].push(cell(1, choice, ["Muted reply", "Muted reply · every other cycle", "Muted reply · heat"][choice],
  choice === 1 ? 24 : length, muted,
  choice === 1 ? "Every-other-cycle thinning is a workshop adaptation." : "Muted D1 stroke separated from the same source phrase.",
  choice === 1 ? "filtered-adaptation" : "source-derived-arrangement"))
 const d2 = [0,5].filter((_,i) => choice === 0 || i === choice - 1)
 cells[2].push(cell(2, choice, ["Second dunun · ostinato", "Second dunun · beat only", "Second dunun · pickup only"][choice], 6,
  d2.map(p => hit(manjaninPulse(p), "D2:O", 2, .36, 1.1)),
  "Steady second-dunun six-pulse phrase from cycle 3 onward: O....O. Beat/pickup choices are complementary filtered stems.",
  choice === 0 ? "source-derived-arrangement" : "filtered-adaptation"))
 const j2: CellEvent[] = []
 for (const [p,stroke] of [..."S.TS.B"].entries()) {
  if (stroke === "." || (choice === 1 && stroke !== "S") || (choice === 2 && stroke === "S")) continue
  j2.push(hit(manjaninPulse(p), `J2:${stroke}`, {B:5,T:8,S:10}[stroke]!, {B:.25,T:.32,S:.37}[stroke]!, {B:1,T:.7,S:.45}[stroke]!))
 }
 cells[3].push(cell(3, choice, ["Second jembe · ostinato", "Second jembe · slaps", "Second jembe · tone and bass"][choice], 6, j2,
  "S.TS.B accompaniment; choices two and three are complementary timbral stems.", choice === 0 ? "source-derived-arrangement" : "filtered-adaptation"))
 for (const voice of [4,5]) {
  const events: CellEvent[] = []
  for (const [cycle, pattern] of manjaninLead[choice].entries()) {
   for (const [p, stroke] of [...pattern].entries()) {
    if (stroke === "." || (voice === 5 ? stroke !== "S" : stroke === "S")) continue
    events.push(hit(cycle * 12 + manjaninPulse(p), `J1:${stroke}`, {B:6,T:9,S:12}[stroke]!,
     {B:.32,T:.41,S:.46}[stroke]!, {B:1.2,T:.8,S:.45}[stroke]!))
   }
  }
  cells[voice].push(cell(voice, choice, leadNames[choice] + (voice === 4 ? " · low" : " · slaps"), 48, events,
   "Four consecutive source cycles looped; lead bass/tone and slap allocated to separate voices. Fixed mean timing replaces the recording's moment-to-moment variation."))
 }
}
export const manjaninWorld: World = {
 id: "manjanin", name: "Manjanin — Kone quartet study", degreeCount: 7, cells,
 presets: [[0,0,0,0,0,0],[0,0,0,0,1,1],[2,2,0,0,2,2]],
 presetNames: ["Open space · 5–8", "Turning phrase · 9–12", "Heat · 175–178"],
 recommendedTuning: "tritave", source,
 roles: ["First dunun · open", "First dunun · muted", "Second dunun", "Second jembe", "Lead · bass/tone", "Lead · slap"],
}
