import { describe, it, expect, vi } from "vitest"
import { worlds, tuningNames, eventHz } from "../src/data/cells-hot-worlds.js"
import { manjaninLead, manjaninDununTimes } from "../src/data/cells-manjanin.js"
import { CellsHotPage } from "../src/pages/cells-hot.js"
import type { PageContext } from "../src/core/types.js"

describe("Mande source banks", () => {
 it("retains twelve source columns and all 48 heat attacks after timbral splitting", () => {
  for (const sequence of manjaninLead) for (const cycle of sequence) expect(cycle.length).toBe(12)
  const w = worlds.manjanin
  const merged = [...w.cells[4][2].events, ...w.cells[5][2].events].sort((a,b) => a.atPulse-b.atPulse)
  expect(merged).toHaveLength(48)
  expect(merged.slice(0,6).map(e => e.sourceToken)).toEqual(["J1:T","J1:T","J1:S","J1:S","J1:B","J1:S"])
  expect(merged.slice(0,4).map(e => e.atPulse)).toEqual([0,.81,1.8,3])
 })
 it("preserves the crossing dunun theme and omits only the documented heat downbeat", () => {
  const w = worlds.manjanin
  expect(w.cells[0][0].events.map(e => e.atPulse)).toEqual([manjaninDununTimes[0],manjaninDununTimes[1],manjaninDununTimes[3],manjaninDununTimes[4]])
  expect(w.cells[0][1].events).toHaveLength(3)
  expect(w.cells[0][2].events).toHaveLength(15)
  expect(w.cells[0][2].events.some(e => e.atPulse === 36)).toBe(false)
  expect(w.cells[1][2].events).toHaveLength(4)
 })
 it("keeps fractional attacks at humanization zero through one-pulse scheduling", () => {
  vi.useFakeTimers(); vi.setSystemTime(1000)
  try {
   const sent: any[] = []
   const c = {
    size:{width:16,height:8}, slot:1, slotLabel:"b", modifiers:{held:new Set(),shift1:false,shift2:false},
    clock:{running:false,rate:10,tick:0,lanes:[{div:1}]},
    osc:{send:(path: string,...args: unknown[])=>sent.push({path,args})},
    setDirty(){},persist(){},focus(){},setShift(){},
   } as unknown as PageContext
   const p = new CellsHotPage(); p.init(c)
   p.onOsc!("/setting/rhythmWorld",["manjanin"],c)
   p.onOsc!("/setting/humanizeMs",[0],c)
   // Select heat; existing controls keep source pitches/timing paired.
   p.onKey({x:3,y:4,s:1},c); p.onKey({x:3,y:5,s:1},c)
   p.onClock!({...c.clock,running:true},c); p.onTick!(0,0,c)
   const packets=sent.filter(x=>x.path.endsWith("/cells")).map(x=>JSON.parse(x.args[0]))
   const events=packets.flatMap(x=>x.events??[]).filter((x:any)=>x.voice===5)
   expect(events.some((e:any)=>Math.abs(e.onsetMs-1181)<.001)).toBe(true)
  } finally {vi.useRealTimers()}
 })
 it("preserves Ngòn hook and the lead's alternating four-beat cells", () => {
  const w = worlds.ngon
  const lead = [...w.cells[4][0].events, ...w.cells[5][0].events].sort((a,b)=>a.atPulse-b.atPulse)
  expect(w.cells[4][0].lengthPulses).toBe(12)
  expect(w.cells[5][0].lengthPulses).toBe(12)
  expect(lead.map(e=>Number(e.atPulse.toFixed(3)))).toEqual([.612,2.145,3.612,6,7.224,9])
  const accomp = [...w.cells[2][0].events, ...w.cells[3][0].events].sort((a,b)=>a.atPulse-b.atPulse)
  expect(accomp.map(e=>Number(e.atPulse.toFixed(3)))).toEqual([0,1.224,2.145])
  expect(w.cells[1][0].events.map(e=>Number(e.atPulse.toFixed(3)))).toEqual([6,7.224,18,19.224,21])
 })
 it("keeps every new bank playable under independent tunings", () => {
  for (const id of ["manjanin", "ngon"]) {
   const w=worlds[id]; expect(w).toBeDefined()
   expect(w.cells).toHaveLength(6)
   for(const [v,row] of w.cells.entries()) {
    expect(row).toHaveLength(3)
    for(const c of row) for(const e of c.events) {
     expect(e.atPulse).toBeGreaterThanOrEqual(0);expect(e.atPulse).toBeLessThan(c.lengthPulses)
     for(const t of tuningNames) { const hz=eventHz(t,v,e,w,1); expect(hz).toBeGreaterThan(10);expect(hz).toBeLessThan(20000) }
    }
   }
  }
 })
})
