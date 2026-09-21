import { describe, expect, it, vi } from "vitest"
import { CellsHotPage, PULSE_RATE } from "../src/pages/cells-hot.js"
import { ledIndex, type PageContext } from "../src/core/types.js"
const clock: any = {
	running: false,
	rate: 20,
	tick: 0,
	lanes: [{ div: 2 }, { div: 1 }, { div: 1 }, { div: 1 }],
}
const rig = () => {
	const sent: any[] = [],
		ctl: string[] = [], saved: any[] = []
	const c: PageContext = {
		size: { width: 16, height: 8 },
		modifiers: { held: new Set(), shift1: false, shift2: false },
		clock,
		slot: 1,
		slotLabel: "b",
		osc: { send: (path, ...args) => sent.push({ path, args }) },
		setDirty: () => {},
		setShift: () => {},
		focus: () => {},
		persist: (state) => { saved.push(state) },
		clockControl: {
			start: () => ctl.push("start"),
			stop: () => ctl.push("stop"),
			setRate: (r) => ctl.push(`rate:${r}`),
		},
	}
	const p = new CellsHotPage()
	p.init(c)
	const packets = () =>
		sent
			.filter((x) => x.path.endsWith("/cells"))
			.map((x) => JSON.parse(x.args[0]))
	const tap = (x: number, y: number) => p.onKey({ x, y, s: 1 }, c)
	return { p, c, sent, ctl, packets, tap, saved }
}
describe("cells-hot", () => {
	it("uses tritave frequencies, phase zero first tick, and actual lane period", () => {
		vi.useFakeTimers()
		vi.setSystemTime(1000)
		const r = rig()
		r.p.onClock!({ ...clock, running: true }, r.c)
		r.p.onTick!(9, 0, r.c)
		const q = r.packets().at(-1)
		expect(q.periodMs).toBe(100)
		expect(q.events.find((e: any) => e.voice === 3).hz).toBeCloseTo(
			82 * Math.pow(3, 7 / 13),
		)
		expect(q.events.every((e: any) => e.onsetMs >= 1100)).toBe(true)
		vi.useRealTimers()
	})
	it("uses beating and source maps with root multiplier", () => {
		const a = rig()
		a.p.restore!({ tuning: "beating", rootMultiplier: 2 }, a.c)
		a.p.onClock!({ ...clock, running: true }, a.c)
		a.p.onTick!(1, 0, a.c)
		expect(
			a
				.packets()
				.at(-1)
				.events.find((e: any) => e.voice === 3).hz,
		).toBe(376)
		const b = rig()
		b.p.restore!({ tuning: "source", rootMultiplier: 2 }, b.c)
		b.p.onClock!({ ...clock, running: true }, b.c)
		b.p.onTick!(1, 0, b.c)
		expect(
			b
				.packets()
				.at(-1)
				.events.find((e: any) => e.voice === 3).hz,
		).toBeCloseTo(767.6)
	})
	it("selects source bank presets", () => {
		const r = rig()
		r.tap(4, 7)
		expect((r.p.serialize() as any).selected).toEqual([0, 0, 0, 0, 1, 0])
		r.tap(5, 7)
		expect((r.p.serialize() as any).selected).toEqual([0, 0, 0, 1, 2, 1])
		r.tap(6, 7)
		expect((r.p.serialize() as any).selected).toEqual([0, 0, 0, 2, 1, 2])
	})
	it("replaces only remaining prepared events and delayed ticks re-anchor", () => {
		vi.useFakeTimers()
		vi.setSystemTime(1000)
		const r = rig()
		r.p.onClock!({ ...clock, running: true }, r.c)
		r.p.onTick!(1, 0, r.c)
		r.tap(3, 2)
		const q = r.packets().at(-1)
		expect(q.type).toBe("replace")
		expect(q.events).toHaveLength(1)
		expect(q.events[0].onsetMs).toBeGreaterThanOrEqual(q.cutoffMs)
		expect(q.events[0].onsetMs).toBeLessThan(1200)
		vi.setSystemTime(9000)
		r.p.onTick!(2, 0, r.c)
		const delayed = r.packets().at(-1).events
		expect(delayed).not.toHaveLength(0)
		expect(delayed[0].onsetMs).toBeGreaterThanOrEqual(9100)
		vi.useRealTimers()
	})
	it("replaces a nonempty remaining event at its original absolute onset with a new revision", () => {
		vi.useFakeTimers()
		vi.setSystemTime(1000)
		const r = rig()
		r.p.onClock!({ ...clock, running: true }, r.c)
		r.p.onTick!(1, 0, r.c)
		const before = r
			.packets()
			.at(-1)
			.events.find((e: any) => e.voice === 3)
		expect(before).toBeTruthy()
		r.tap(3, 2)
		const replace = r.packets().at(-1)
		expect(replace.events).toHaveLength(1)
		expect(replace.events[0].onsetMs).toBe(before.onsetMs)
		expect(replace.events[0].id).not.toBe(before.id)
		expect(replace.events[0].id).toContain("-1-")
		vi.useRealTimers()
	})
	it("rapid A→B→A replacements increment revisions without shifting the pending onset", () => {
		vi.useFakeTimers()
		vi.setSystemTime(1000)
		const r = rig()
		r.p.onClock!({ ...clock, running: true }, r.c)
		r.p.onTick!(1, 0, r.c)
		const onset = r
			.packets()
			.at(-1)
			.events.find((e: any) => e.voice === 3).onsetMs
		r.tap(3, 2)
		const b = r.packets().at(-1).events[0]
		r.tap(2, 2)
		const a = r.packets().at(-1).events[0]
		expect(b.onsetMs).toBe(onset)
		expect(a.onsetMs).toBe(onset)
		expect(b.id).not.toBe(a.id)
		vi.useRealTimers()
	})
	it("mute cancels the scheduled voice and unmute rejoins only the future window", () => {
		vi.useFakeTimers()
		vi.setSystemTime(1000)
		const r = rig()
		r.p.onClock!({ ...clock, running: true }, r.c)
		r.p.onTick!(1, 0, r.c)
		r.tap(1, 2)
		const muted = r.packets().at(-1)
		expect(muted.events).toEqual([])
		r.tap(1, 2)
		const joined = r.packets().at(-1)
		expect(joined.events).toHaveLength(1)
		expect(joined.events[0].onsetMs).toBeGreaterThanOrEqual(joined.cutoffMs)
		vi.useRealTimers()
	})
	it("continues ticking while blurred, restore stops an active session, and restart returns to phase zero", () => {
		vi.useFakeTimers()
		vi.setSystemTime(1000)
		const r = rig()
		r.p.onClock!({ ...clock, running: true }, r.c)
		r.p.onTick!(7, 0, r.c)
		r.p.onBlur(r.c)
		vi.setSystemTime(2000)
		r.p.onTick!(8, 0, r.c)
		expect(r.packets().at(-1).type).toBe("sync")
		r.p.restore!({ tuning: "source" }, r.c)
		expect(r.packets().at(-1).type).toBe("stop")
		r.p.onClock!({ ...clock, running: false }, r.c)
		vi.setSystemTime(3000)
		r.p.onClock!({ ...clock, running: true }, r.c)
		r.p.onTick!(99, 0, r.c)
		const second = r.packets().at(-1)
		const low = second.events.find((e: any) => e.voice === 3)
		expect(low).toBeTruthy()
		expect(low.id).toContain("-571")
		expect(low.onsetMs).toBeGreaterThanOrEqual(3100)
		vi.useRealTimers()
	})
	it("only explicit run sets pulse rate and phase/onset LEDs draw", () => {
		vi.useFakeTimers()
		vi.setSystemTime(1000)
		const r = rig()
		r.p.onClock!({ ...clock, running: false }, r.c)
		expect(r.packets().some((x) => x.type === "start")).toBe(false)
		r.tap(1, 7)
		expect(r.ctl).toEqual([`rate:${PULSE_RATE * 2}`, "start"])
		r.p.onTick!(1, 0, r.c)
		vi.advanceTimersByTime(160)
		const f = r.p.render(r.c)!
		expect(f[ledIndex(r.c.size, 5, 2)]).toBeGreaterThan(0)
		expect(f[ledIndex(r.c.size, 15, 2)]).toBe(15)
		vi.useRealTimers()
	})
})

it("persists choices/settings without playback and flashes only after onsets", () => {
 vi.useFakeTimers();vi.setSystemTime(1000);const r=rig();
 expect((r.p.serialize() as any).selected).toEqual([0,0,0,0,1,0]);
 r.tap(3,2);expect(r.saved.at(-1).selected[2]).toBe(1);
 r.p.onOsc('/setting/rootMultiplier',[1.5],r.c);expect(r.saved.at(-1).rootMultiplier).toBe(1.5);
 expect(r.saved.at(-1).running).toBeUndefined();r.tap(2,2);
 r.p.onClock({...clock,running:true},r.c);r.p.onTick(1,0,r.c);
 expect(r.p.render(r.c)[ledIndex(r.c.size,15,2)]).not.toBe(15);
 const onset=r.packets().at(-1).events.find((e:any)=>e.voice===3).onsetMs;vi.setSystemTime(onset+1);expect(r.p.render(r.c)[ledIndex(r.c.size,15,2)]).toBe(15);
 r.tap(3,2);expect(r.p.render(r.c)[ledIndex(r.c.size,3,2)]).toBe(7);
 vi.setSystemTime(1300);expect(r.p.render(r.c)[ledIndex(r.c.size,3,2)]).toBe(12);
 vi.useRealTimers();
})
