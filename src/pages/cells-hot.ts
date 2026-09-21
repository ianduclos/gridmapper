/* Cells Hot — slot b's bank-backed, clock-scheduled hocket page. */
import {
	worlds,
	tuningNames,
	eventHz,
	type Tuning,
} from "../data/cells-hot-worlds.js"
import {
	type KeyEvent,
	type LedFrame,
	type Page,
	type PageContext,
	makeFrame,
	ledIndex,
} from "../core/types.js"
import type { PageModule, SettingSpec } from "../core/pageModule.js"
import { bool, int, isRecord, num } from "../util/restoreGuards.js"
import { drawSelector, selectorKey } from "../util/pageSelector.js"
export const PULSE_RATE = 12 / 1.66
const BUFFER_MS = 100,
	VOICES = 6
const worldNames = Object.keys(worlds)
const tunings: readonly string[] = tuningNames
type OutEvent = {
	id: string
	voice: number
	hz: number
	gain: number
	onsetMs: number
	durationMs: number
	durationMode: "gate" | "decay"
}
export const settings: SettingSpec[] = [
	{
		key: "rhythmWorld",
		label: "Rhythm world",
		type: "enum",
		options: worldNames,
		default: "horn-relay",
	},
	{
		key: "durationMode",
		label: "Duration (decay needs Max update)",
		type: "enum",
		options: ["gate", "decay"],
		default: "gate",
	},
	{
		key: "tuning",
		label: "Tuning world",
		type: "enum",
		options: [...tunings],
		default: "tritave",
	},
	{
		key: "rootMultiplier",
		label: "Root multiplier",
		type: "number",
		min: 0.25,
		max: 4,
		step: 0.01,
		default: 1,
	},
	{
		key: "pulseRate",
		label: "Pulse rate",
		type: "number",
		min: 0.1,
		max: 200,
		step: 0.001,
		default: PULSE_RATE,
	},
	{
		key: "lane",
		label: "Clock lane",
		type: "number",
		min: 0,
		max: 3,
		step: 1,
		default: 0,
	},
	{
		key: "humanizeMs",
		label: "Humanize ms",
		type: "number",
		min: 0,
		max: 4,
		step: 1,
		default: 4,
	},
]
export class CellsHotPage implements Page {
	private rhythmWorld = "horn-relay"
	private durationMode: "gate" | "decay" = "gate"
	private get world() {
		return worlds[this.rhythmWorld]
	}
	private selected = [...worlds["horn-relay"].presets[0]]
	private muted = new Array(VOICES).fill(false)
	private tuning: Tuning = "tritave"
	private rootMultiplier = 1
	private pulseRate = PULSE_RATE
	private lane = 0
	private humanizeMs = 4
	private running = false
	private observedRun = false
	private session = ""
	private serial = 0
	private originTick: number | undefined
	private windowStart = 0
	private lastPulse = 0
	private lastPeriod = 0
	private preparedEnd = 0
	private revisions = new Array(VOICES).fill(0)
	private flashes: number[][] = Array.from({ length: VOICES }, () => [])
	private changedUntil = new Array(VOICES).fill(0)
	init(c: PageContext) {
		this.observedRun = c.clock.running
		this.announce(c)
	}
	onFocus(c: PageContext) {
		this.announce(c)
	}
	onBlur(_c: PageContext) {}
	dispose(c: PageContext) {
		if (this.running) this.stop(c)
	}
	onClock(s: Readonly<PageContext["clock"]>, c: PageContext) {
		if (s.running === this.observedRun) return
		this.observedRun = s.running
		if (s.running) this.start(c)
		else this.stop(c)
	}
	onTick(tick: number, lane: number, c: PageContext) {
		if (lane !== this.lane || !this.running) return
		const now = Date.now(),
			period = this.period(c)
		if (this.originTick === undefined) this.originTick = tick
		this.windowStart = now + BUFFER_MS
		const p = tick - this.originTick
		this.lastPulse = p
		this.lastPeriod = period
		this.preparedEnd = this.windowStart + period
		const events = this.events(p, p + 1, period, undefined, 0, this.preparedEnd)
		this.rememberFlashes(events, now)
		this.emit(c, {
			type: "sync",
			session: this.session,
			now,
			periodMs: period,
			humanizeMs: this.humanizeMs,
			events,
		})
		c.setDirty()
	}
	onKey(e: KeyEvent, c: PageContext) {
		if (selectorKey(e, c) || !e.s) return
		if (e.y < VOICES) {
			if (e.x >= 1 && e.x <= 3) {
				this.selected[e.y] = e.x - 1
				this.replace(c, e.y)
			} else if (e.x === 4) {
				this.muted[e.y] = !this.muted[e.y]
				this.replace(c, e.y)
			}
			this.persist(c)
			c.setDirty()
			return
		}
		if (e.y === 7 && e.x === 1) {
			c.clockControl?.setRate(
				this.pulseRate * (c.clock.lanes[this.lane]?.div ?? 1),
			)
			this.start(c)
			c.clockControl?.start()
		} else if (e.y === 7 && e.x === 2) {
			c.clockControl?.stop()
			this.stop(c)
		} else if (e.y === 7 && e.x >= 4 && e.x <= 6) {
			this.selected = [...this.world.presets[e.x - 4]]
			for (let v = 0; v < VOICES; v++) this.replace(c, v)
			this.persist(c)
			c.setDirty()
		}
	}
	onOsc(path: string, args: any[], c: PageContext) {
		const m =
			/^\/setting\/(rhythmWorld|durationMode|tuning|rootMultiplier|pulseRate|lane|humanizeMs)$/.exec(
				path,
			)
		if (!m) return
		const [_, k] = m,
			v = args[0]
		if (k === "rhythmWorld" && worldNames.includes(v)) {
			this.rhythmWorld = v
			this.selected = [...this.world.presets[0]]
		}
		if (k === "durationMode" && (v === "gate" || v === "decay"))
			this.durationMode = v
		if (k === "tuning" && tunings.includes(v)) this.tuning = v
		if (k === "rootMultiplier")
			this.rootMultiplier = num(v, this.rootMultiplier, 0.25, 4)
		if (k === "pulseRate") {
			this.pulseRate = num(v, this.pulseRate, 0.1, 200)
			if (this.running)
				c.clockControl?.setRate(
					this.pulseRate * (c.clock.lanes[this.lane]?.div ?? 1),
				)
		}
		if (k === "lane") {
			const lane = int(v, this.lane, 0, 3)
			if (lane !== this.lane) {
				this.lane = lane
				this.originTick = undefined
			}
		}
		if (k === "humanizeMs") this.humanizeMs = int(v, this.humanizeMs, 0, 4)
		if (
			k === "tuning" ||
			k === "rootMultiplier" ||
			k === "rhythmWorld" ||
			k === "durationMode"
		)
			for (let voice = 0; voice < VOICES; voice++) this.replace(c, voice)
		this.persist(c)
		this.announce(c)
	}
	render(c: PageContext): LedFrame {
		const f = makeFrame(c.size),
			now = Date.now()
		drawSelector(f, c)
		for (let y = 0; y < VOICES; y++) {
			for (let x = 1; x <= 3; x++)
				f[ledIndex(c.size, x, y)] =
					this.selected[y] === x - 1
						? now < this.changedUntil[y]
							? 7
							: this.muted[y]
								? 3
								: 12
						: 2
			f[ledIndex(c.size, 4, y)] = this.muted[y] ? 3 : 8
			const len = this.world.cells[y][this.selected[y]].lengthPulses,
				phase = this.running
					? Math.max(
							0,
							this.lastPulse +
								(now - this.windowStart) / Math.max(1, this.lastPeriod),
						)
					: 0,
				fill = Math.floor(((phase % len) / len) * 11)
			for (let x = 5; x <= 15; x++)
				f[ledIndex(c.size, x, y)] = x - 5 <= fill ? 5 : 1
			if (this.flashes[y].some((at) => now >= at && now < at + 120))
				f[ledIndex(c.size, 15, y)] = 15
		}
		f[ledIndex(c.size, 1, 7)] = this.running ? 15 : 5
		f[ledIndex(c.size, 2, 7)] = this.running ? 5 : 2
		for (let x = 4; x <= 6; x++) f[ledIndex(c.size, x, 7)] = 6
		return f
	}
	serialize() {
		return {
			rhythmWorld: this.rhythmWorld,
			durationMode: this.durationMode,
			selected: [...this.selected],
			muted: [...this.muted],
			tuning: this.tuning,
			rootMultiplier: this.rootMultiplier,
			pulseRate: this.pulseRate,
			lane: this.lane,
			humanizeMs: this.humanizeMs,
		}
	}
	restore(raw: unknown, c: PageContext) {
		if (!isRecord(raw)) return
		if (this.running) this.stop(c)
		if (
			typeof raw.rhythmWorld === "string" &&
			worldNames.includes(raw.rhythmWorld)
		)
			this.rhythmWorld = raw.rhythmWorld
		if (raw.durationMode === "gate" || raw.durationMode === "decay")
			this.durationMode = raw.durationMode
		this.selected = this.selected.map((d, i) =>
			int((raw.selected as any)?.[i], d, 0, 2),
		)
		this.muted = this.muted.map((d, i) => bool((raw.muted as any)?.[i], d))
		if (tunings.includes(raw.tuning as Tuning))
			this.tuning = raw.tuning as Tuning
		this.rootMultiplier = num(raw.rootMultiplier, this.rootMultiplier, 0.25, 4)
		this.pulseRate = num(raw.pulseRate, this.pulseRate, 0.1, 200)
		this.lane = int(raw.lane, this.lane, 0, 3)
		this.humanizeMs = int(raw.humanizeMs, this.humanizeMs, 0, 4)
		this.announce(c)
	}
	private period(c: PageContext) {
		return (1000 * (c.clock.lanes[this.lane]?.div ?? 1)) / c.clock.rate
	}
	private start(c: PageContext) {
		if (this.running) return
		this.running = true
		this.originTick = undefined
		this.preparedEnd = 0
		this.flashes = Array.from({ length: VOICES }, () => [])
		this.changedUntil.fill(0)
		this.session = `cells-${Date.now()}-${++this.serial}`
		this.emit(c, { type: "start", session: this.session })
	}
	private stop(c: PageContext) {
		if (!this.running) return
		this.emit(c, { type: "stop", session: this.session })
		this.running = false
		this.originTick = undefined
		this.preparedEnd = 0
		this.flashes = Array.from({ length: VOICES }, () => [])
		this.changedUntil.fill(0)
	}
	private replace(c: PageContext, v: number) {
		if (!this.running || !this.preparedEnd) return
		const cutoffMs = Date.now() + BUFFER_MS
		this.revisions[v]++
		this.changedUntil[v] = cutoffMs
		const events = this.muted[v]
			? []
			: this.events(
					this.lastPulse,
					this.lastPulse + 1,
					this.lastPeriod,
					v,
					cutoffMs,
					this.preparedEnd,
				)
		this.flashes[v] = this.flashes[v].filter((at) => at < cutoffMs)
		this.rememberFlashes(events, Date.now())
		this.emit(c, {
			type: "replace",
			session: this.session,
			voice: v + 1,
			cutoffMs,
			events,
		})
	}
	private events(
		lo: number,
		hi: number,
		period: number,
		only: number | undefined,
		cutoff: number,
		end: number,
	): OutEvent[] {
		const out: OutEvent[] = []
		if (this.originTick === undefined) return out
		for (let v = 0; v < VOICES; v++) {
			if ((only !== undefined && v !== only) || this.muted[v]) continue
			const cell = this.world.cells[v][this.selected[v]]
			for (const e of cell.events) {
				let p =
					e.atPulse +
					Math.max(0, Math.ceil((lo - e.atPulse) / cell.lengthPulses)) *
						cell.lengthPulses
				for (; p < hi; p += cell.lengthPulses) {
					const onsetMs = this.windowStart + (p - lo) * period
					if (onsetMs < cutoff || onsetMs >= end) continue
					out.push({
						id: `${this.session}-${v + 1}-${this.revisions[v]}-${Math.round(p * 1000)}`,
						voice: v + 1,
						hz: eventHz(this.tuning, v, e, this.world, this.rootMultiplier),
						gain: e.gain,
						onsetMs,
						durationMs: e.durationPulses * period,
						durationMode: this.durationMode,
					})
				}
			}
		}
		return out
	}
	private rememberFlashes(events: OutEvent[], now: number) {
		this.flashes = this.flashes.map((a) => a.filter((at) => at + 120 > now))
		for (const e of events) this.flashes[e.voice - 1].push(e.onsetMs)
	}
	private persist(c: PageContext) {
		c.persist(this.serialize())
	}
	private announce(c: PageContext) {
		c.osc.send(`/grid/out/page/${c.slotLabel}/type`, "cells-hot")
		c.osc.send(
			`/grid/out/page/${c.slotLabel}/settings`,
			JSON.stringify(this.serialize()),
		)
	}
	private emit(c: PageContext, p: Record<string, unknown>) {
		c.osc.send(`/grid/out/page/${c.slotLabel}/cells`, JSON.stringify(p))
	}
}
export const page: PageModule = {
	name: "cells-hot",
	label: "Cells Hot",
	settings,
	create: () => new CellsHotPage(),
}
