/* Cells Hot — six banked hocket voices, scheduled against transport deadlines. */
import {
	worlds,
	tuningNames,
	tuningLabels,
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
	VOICES = 6,
	PERFORMANCE_PULSES_PER_BEAT = 3
const worldNames = Object.keys(worlds),
	tunings: readonly string[] = tuningNames
const worldLabels = Object.fromEntries(
	worldNames.map((id) => [id, worlds[id].name]),
)
type WorldMeta = {
	pulsesPerBeat?: number
	recommendationBasis?: string
	evolutionGroups?: Array<{ rows: number[]; choices: number[][] }>
}
const meta = (id: string) => worlds[id] as (typeof worlds)[string] & WorldMeta
type OutEvent = {
	id: string
	voice: number
	hz: number
	gain: number
	onsetMs: number
	durationMs: number
	durationMode: "gate" | "decay"
	decayMs?: number
}

export const settings: SettingSpec[] = [
	{
		key: "rhythmWorld",
		label: "Rhythm world",
		type: "enum",
		options: worldNames,
		presentation: "buttons",
		optionLabels: worldLabels,
		default: "horn-relay",
	},
	{
		key: "durationMode",
		label: "Duration",
		type: "enum",
		options: ["gate", "decay"],
		default: "gate",
	},
	{
		key: "decayScale",
		label: "Decay scale",
		type: "number",
		min: 0.25,
		max: 4,
		step: 0.01,
		default: 1,
	},
	{
		key: "decayStretch",
		label: "Long-note stretch",
		type: "number",
		min: 1,
		max: 8,
		step: 0.01,
		default: 1,
	},
	{
		key: "decayThreshold",
		label: "Long-note threshold (pulses)",
		type: "number",
		min: 0.1,
		max: 4,
		step: 0.01,
		default: 1,
	},
	{
		key: "tuning",
		label: "Tuning world",
		type: "enum",
		options: [...tunings],
		presentation: "buttons",
		optionLabels: tuningLabels,
		optionGroups: Object.fromEntries(
			tunings.map((id, i) => [
				id,
				i < 5 ? "Included tunings" : "Hotelier scales",
			]),
		),
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
		key: "allowSilence",
		label: "Allow silence in evolution",
		type: "toggle",
		default: false,
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
	private pendingWorldId: string | undefined
	private pendingBoundaryPulse = 0
	private pendingRecommendationWorldId: string | undefined
	private durationMode: "gate" | "decay" = "gate"
	private selected = [...worlds["horn-relay"].presets[0]]
	private muted = new Array(VOICES).fill(false)
	private locks = new Array(VOICES).fill(false)
	private protectedUntilBeat = new Array(VOICES).fill(0)
	private lockMode = false
	private autoEvolve = false
	private allowSilence = false
	private evolvedRest = new Array(VOICES).fill(false)
	private nextEvolveBeat = 0
	private rng = 1
	private preparingTick = false
	private skippedLateEvents = 0
	constructor(private readonly evolutionSeed?: number) {}
	private tuning: Tuning = "tritave"
	private rootMultiplier = 1
	private pulseRate = PULSE_RATE
	private lane = 0
	private humanizeMs = 4
	private decayScale = 1
	private decayStretch = 1
	private decayThreshold = 1
	private bankMode: "cells" | "rhythmWorld" | "tuning" = "cells"
	private running = false
	private observedRun = false
	private session = ""
	private serial = 0
	private originTick: number | undefined
	private lastPulse = 0
	private lastPeriod = 0
	private deadlineMs = 0
	private preparedEnd = 0
	private revisions = new Array(VOICES).fill(0)
	private flashes: number[][] = Array.from({ length: VOICES }, () => [])
	private changedUntil = new Array(VOICES).fill(0)
	private get world() {
		return worlds[this.rhythmWorld]
	}
	private get sourceScale() {
		return (
			PERFORMANCE_PULSES_PER_BEAT / (meta(this.rhythmWorld).pulsesPerBeat ?? 3)
		)
	}
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
	onTick(tick: number, lane: number, c: PageContext, deadlineMs = Date.now()) {
		if (lane !== this.lane || !this.running) return
		if (this.originTick === undefined) this.originTick = tick
		const p = tick - this.originTick,
			period = this.period(c),
			now = Date.now()
		this.lastPulse = p
		this.lastPeriod = period
		this.deadlineMs = deadlineMs
		this.preparedEnd = deadlineMs + BUFFER_MS + period
		const transitioned = this.commitPendingWorld(c, p, period, deadlineMs, now)
		// This window has not been sent yet. Evolution changes its composition once;
		// it must not send replacement copies followed by duplicate sync events.
		this.preparingTick = true
		try {
			if (!transitioned) this.autoEvolution(c, p)
		} finally {
			this.preparingTick = false
		}
		const before = this.skippedLateEvents
		const events = this.events(p, p + 1, period, undefined, 0, this.preparedEnd)
		this.rememberFlashes(events, now)
		this.emit(c, {
			type: "sync",
			session: this.session,
			now,
			deadlineMs,
			periodMs: period,
			humanizeMs: this.humanizeMs,
			callbackLateMs: now - deadlineMs,
			skippedLateEvents: this.skippedLateEvents - before,
			events: transitioned ? [] : events,
		})
		if (transitioned)
			this.emit(c, {
				type: "replaceAll",
				session: this.session,
				cutoffMs: deadlineMs + BUFFER_MS,
				events,
			})
		c.setDirty()
	}
	onKey(e: KeyEvent, c: PageContext) {
		if (selectorKey(e, c) || !e.s) return
		if (e.y === 6) {
			if (e.x === 1) this.bankMode = "rhythmWorld"
			else if (e.x === 2) this.bankMode = "tuning"
			else if (e.x === 3) this.bankMode = "cells"
			else if (e.x === 4) {
				this.toggleEvolution(c)
			} else if (e.x === 5) this.lockMode = !this.lockMode
			else if (e.x === 6) this.onOsc("/action/applyRecommendation", [], c)
			c.setDirty()
			this.view(c)
			return
		}
		if (this.bankMode !== "cells" && e.y < VOICES && e.x >= 1) {
			const value =
				this.bankMode === "rhythmWorld"
					? worldNames[e.y * 15 + e.x - 1]
					: e.y === 0 && e.x <= 5
						? tunings[e.x - 1]
						: e.y === 1 && e.x <= tunings.length - 5
							? tunings[e.x + 4]
							: undefined
			if (value) this.onOsc(`/setting/${this.bankMode}`, [value], c)
			return
		}
		if (e.y < VOICES) {
			if (e.x >= 1 && e.x <= 3) this.chooseCell(c, e.y, e.x - 1)
			else if (e.x === 4) {
				if (this.lockMode) this.toggleLock(e.y)
				else {
					this.muted[e.y] = !this.muted[e.y]
					this.protectGroup(e.y)
					this.replace(c, e.y)
				}
			} else return
			this.persist(c)
			c.setDirty()
			this.view(c)
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
		} else if (e.y === 7 && e.x >= 4 && e.x <= 6) this.applyEnsemble(c, e.x - 4)
	}
	onOsc(path: string, args: any[], c: PageContext) {
		const v = args[0]
		if (path === "/action/refreshView") {
			this.view(c)
			return
		}
		if (path === "/action/applyRecommendation") {
			if (this.pendingWorldId) {
				this.pendingRecommendationWorldId = this.pendingWorldId
				this.view(c)
			} else {
				this.tuning = this.world.recommendedTuning
				this.replaceAll(c)
				this.persist(c)
				this.announce(c)
			}
			return
		}
		if (path === "/action/evolve") {
			this.toggleEvolution(c)
			return
		}
		if (path === "/action/lockMode") {
			this.lockMode = !this.lockMode
			this.view(c)
			return
		}
		let m = /^\/lock\/(\d+)$/.exec(path)
		if (m) {
			const row = int(m[1], -1, 0, VOICES - 1)
			if (row >= 0) {
				this.toggleLock(row)
				this.persist(c)
				this.view(c)
			}
			return
		}
		m = /^\/mute\/(\d+)$/.exec(path)
		if (m) {
			const row = int(m[1], -1, 0, VOICES - 1)
			if (row >= 0) {
				this.muted[row] = !this.muted[row]
				this.protectGroup(row)
				this.replace(c, row)
				this.persist(c)
				this.view(c)
			}
			return
		}
		m = /^\/cell\/(\d+)\/(\d+)$/.exec(path)
		if (m) {
			const row = int(m[1], -1, 0, VOICES - 1),
				choice = int(m[2], -1, 0, 2)
			if (row >= 0 && choice >= 0) {
				this.chooseCell(c, row, choice)
				this.persist(c)
				this.view(c)
			}
			return
		}
		m = /^\/ensemble\/(\d+)$/.exec(path)
		if (m) {
			this.applyEnsemble(c, int(m[1], -1, 0, 2))
			return
		}
		const setting =
			/^\/setting\/(rhythmWorld|durationMode|decayScale|decayStretch|decayThreshold|tuning|rootMultiplier|pulseRate|lane|allowSilence|humanizeMs)$/.exec(
				path,
			)
		if (!setting) return
		const key = setting[1]
		if (
			key === "rhythmWorld" &&
			typeof v === "string" &&
			worldNames.includes(v)
		)
			this.requestWorld(c, v)
		else if (key === "durationMode" && (v === "gate" || v === "decay"))
			this.durationMode = v
		else if (key === "decayScale")
			this.decayScale = num(v, this.decayScale, 0.25, 4)
		else if (key === "decayStretch")
			this.decayStretch = num(v, this.decayStretch, 1, 8)
		else if (key === "decayThreshold")
			this.decayThreshold = num(v, this.decayThreshold, 0.1, 4)
		else if (key === "allowSilence") {
			this.allowSilence = bool(v, this.allowSilence)
			if (!this.allowSilence) this.evolvedRest.fill(false)
		} else if (key === "tuning" && tunings.includes(v))
			this.tuning = v as Tuning
		else if (key === "rootMultiplier")
			this.rootMultiplier = num(v, this.rootMultiplier, 0.25, 4)
		else if (key === "pulseRate") {
			this.pulseRate = num(v, this.pulseRate, 0.1, 200)
			if (this.running)
				c.clockControl?.setRate(
					this.pulseRate * (c.clock.lanes[this.lane]?.div ?? 1),
				)
		} else if (key === "lane") {
			const n = int(v, this.lane, 0, 3)
			if (n !== this.lane) {
				this.lane = n
				this.originTick = undefined
			}
		} else if (key === "humanizeMs")
			this.humanizeMs = int(v, this.humanizeMs, 0, 4)
		if (key !== "rhythmWorld") this.replaceAll(c)
		this.persist(c)
		this.announce(c)
	}
	render(c: PageContext): LedFrame {
		const f = makeFrame(c.size),
			now = Date.now()
		drawSelector(f, c)
		if (this.bankMode !== "cells") {
			const values = this.bankMode === "rhythmWorld" ? worldNames : tunings
			for (const [i, value] of values.entries()) {
				const x =
					this.bankMode === "tuning" ? (i < 5 ? i + 1 : i - 4) : 1 + (i % 15)
				const y =
					this.bankMode === "tuning" ? (i < 5 ? 0 : 1) : Math.floor(i / 15)
				const selected =
					this.bankMode === "rhythmWorld"
						? value === this.rhythmWorld
						: value === this.tuning
				if (y < VOICES)
					f[ledIndex(c.size, x, y)] =
						this.bankMode === "rhythmWorld" && value === this.pendingWorldId
							? 7
							: selected
								? 12
								: 3
			}
		} else
			for (let y = 0; y < VOICES; y++) {
				for (let x = 1; x <= 3; x++)
					f[ledIndex(c.size, x, y)] =
						this.selected[y] === x - 1
							? now < this.changedUntil[y]
								? 7
								: this.silent(y)
									? 3
									: 12
							: 2
				f[ledIndex(c.size, 4, y)] = this.lockMode
					? this.locks[y]
						? 15
						: 4
					: this.silent(y)
						? 3
						: 8
				const len =
						this.world.cells[y][this.selected[y]].lengthPulses *
						this.sourceScale,
					phase = this.running
						? Math.max(
								0,
								this.lastPulse +
									(now - (this.deadlineMs + BUFFER_MS)) /
										Math.max(1, this.lastPeriod),
							)
						: 0,
					fill = Math.floor(((phase % len) / len) * 11)
				for (let x = 5; x <= 15; x++)
					f[ledIndex(c.size, x, y)] = x - 5 <= fill ? 5 : 1
				if (this.flashes[y].some((at) => now >= at && now < at + 120))
					f[ledIndex(c.size, 15, y)] = 15
			}
		f[ledIndex(c.size, 1, 6)] = this.bankMode === "rhythmWorld" ? 15 : 5
		f[ledIndex(c.size, 2, 6)] = this.bankMode === "tuning" ? 15 : 5
		f[ledIndex(c.size, 3, 6)] = this.bankMode === "cells" ? 8 : 3
		f[ledIndex(c.size, 4, 6)] = this.autoEvolve ? 15 : 4
		f[ledIndex(c.size, 5, 6)] = this.lockMode ? 15 : 4
		f[ledIndex(c.size, 6, 6)] =
			this.pendingWorldId &&
			this.pendingRecommendationWorldId === this.pendingWorldId
				? 7
				: this.tuning === this.recommendedWorld().recommendedTuning
					? 12
					: 3
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
			locks: [...this.locks],
			tuning: this.tuning,
			rootMultiplier: this.rootMultiplier,
			pulseRate: this.pulseRate,
			lane: this.lane,
			allowSilence: this.allowSilence,
			humanizeMs: this.humanizeMs,
			decayScale: this.decayScale,
			decayStretch: this.decayStretch,
			decayThreshold: this.decayThreshold,
		}
	}
	restore(raw: unknown, c: PageContext) {
		this.bankMode = "cells"
		this.autoEvolve = false
		this.lockMode = false
		this.evolvedRest.fill(false)
		this.protectedUntilBeat.fill(0)
		if (this.running) this.stop(c)
		if (!isRecord(raw)) {
			this.view(c)
			return
		}
		if (
			typeof raw.rhythmWorld === "string" &&
			worldNames.includes(raw.rhythmWorld)
		)
			this.rhythmWorld = raw.rhythmWorld
		if (raw.durationMode === "gate" || raw.durationMode === "decay")
			this.durationMode = raw.durationMode
		this.selected = [...this.world.presets[0]]
		this.selected = this.selected.map((d, i) =>
			int((raw.selected as any)?.[i], d, 0, 2),
		)
		this.muted = this.muted.map((d, i) => bool((raw.muted as any)?.[i], d))
		this.locks = this.locks.map((d, i) => bool((raw.locks as any)?.[i], d))
		if (tunings.includes(raw.tuning as Tuning))
			this.tuning = raw.tuning as Tuning
		this.rootMultiplier = num(raw.rootMultiplier, this.rootMultiplier, 0.25, 4)
		this.pulseRate = num(raw.pulseRate, this.pulseRate, 0.1, 200)
		this.lane = int(raw.lane, this.lane, 0, 3)
		this.allowSilence = bool(raw.allowSilence, this.allowSilence)
		this.humanizeMs = int(raw.humanizeMs, this.humanizeMs, 0, 4)
		this.decayScale = num(raw.decayScale, this.decayScale, 0.25, 4)
		this.decayStretch = num(raw.decayStretch, this.decayStretch, 1, 8)
		this.decayThreshold = num(raw.decayThreshold, this.decayThreshold, 0.1, 4)
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
		const previousBeat = this.lastPulse / PERFORMANCE_PULSES_PER_BEAT
		this.protectedUntilBeat = this.protectedUntilBeat.map((until) =>
			Math.max(0, Math.min(8, until - previousBeat)),
		)
		this.lastPulse = 0
		this.rng = (this.evolutionSeed ?? Date.now() ^ this.serial) >>> 0 || 1
		this.resetEvolution()
		this.emit(c, { type: "start", session: this.session })
	}
	private stop(c: PageContext) {
		if (!this.running) return
		this.emit(c, { type: "stop", session: this.session })
		this.running = false
		this.originTick = undefined
		this.preparedEnd = 0
		this.pendingWorldId = undefined
		this.pendingRecommendationWorldId = undefined
		this.evolvedRest.fill(false)
		this.flashes = Array.from({ length: VOICES }, () => [])
		this.changedUntil.fill(0)
		this.view(c)
	}
	private requestWorld(c: PageContext, id: string) {
		if (id !== this.pendingWorldId)
			this.pendingRecommendationWorldId = undefined
		if (id === this.rhythmWorld) this.pendingWorldId = undefined
		else if (!this.running) this.switchWorld(id)
		else {
			this.pendingWorldId = id
			// Choose the first global beat STRICTLY beyond the request's buffer.
			// Later callback lateness must not keep moving this target forward.
			const phase =
				this.lastPulse +
				Math.max(
					0,
					(Date.now() - this.deadlineMs) / Math.max(1, this.lastPeriod),
				)
			this.pendingBoundaryPulse =
				this.originTick === undefined
					? 0
					: (Math.floor(phase / PERFORMANCE_PULSES_PER_BEAT) + 1) *
						PERFORMANCE_PULSES_PER_BEAT
		}
		this.view(c)
	}
	private switchWorld(id: string) {
		this.rhythmWorld = id
		this.selected = [...this.world.presets[0]]
		this.pendingWorldId = undefined
		this.evolvedRest.fill(false)
		this.protectedUntilBeat.fill(0)
		if (this.pendingRecommendationWorldId === id)
			this.tuning = this.world.recommendedTuning
		this.pendingRecommendationWorldId = undefined
		this.resetEvolution()
	}
	private commitPendingWorld(
		c: PageContext,
		p: number,
		_period: number,
		deadlineMs: number,
		now: number,
	) {
		if (
			!this.pendingWorldId ||
			p < this.pendingBoundaryPulse ||
			p % PERFORMANCE_PULSES_PER_BEAT ||
			deadlineMs + BUFFER_MS < now
		)
			return false
		this.switchWorld(this.pendingWorldId)
		this.revisions = this.revisions.map((v) => v + 1)
		this.flashes = this.flashes.map((a) =>
			a.filter((at) => at < deadlineMs + BUFFER_MS),
		)
		this.persist(c)
		this.announce(c)
		return true
	}
	private replace(c: PageContext, v: number, commonCutoff?: number) {
		if (!this.running || !this.preparedEnd) return
		const cutoffMs =
			commonCutoff ??
			Math.max(Date.now() + BUFFER_MS, this.deadlineMs + BUFFER_MS)
		this.revisions[v]++
		if (this.preparingTick) return
		this.changedUntil[v] = cutoffMs
		const events = this.silent(v)
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
	private replaceAll(c: PageContext) {
		if (!this.running || !this.preparedEnd) return
		const cutoffMs = Math.max(
			Date.now() + BUFFER_MS,
			this.deadlineMs + BUFFER_MS,
		)
		this.revisions = this.revisions.map((v) => v + 1)
		this.flashes = this.flashes.map((a) => a.filter((at) => at < cutoffMs))
		const events = this.events(
			this.lastPulse,
			this.lastPulse + 1,
			this.lastPeriod,
			undefined,
			cutoffMs,
			this.preparedEnd,
		)
		this.rememberFlashes(events, Date.now())
		this.emit(c, {
			type: "replaceAll",
			session: this.session,
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
			if ((only !== undefined && v !== only) || this.silent(v)) continue
			const cell = this.world.cells[v][this.selected[v]],
				scale = this.sourceScale,
				length = cell.lengthPulses * scale
			for (const e of cell.events) {
				const at = e.atPulse * scale
				let p = at + Math.max(0, Math.ceil((lo - at) / length)) * length
				for (; p < hi; p += length) {
					const onsetMs =
						this.deadlineMs + BUFFER_MS + (p - this.lastPulse) * period
					if (onsetMs < cutoff || onsetMs >= end) continue
					if (onsetMs < Date.now()) {
						this.skippedLateEvents++
						continue
					}
					const durationMs = e.durationPulses * scale * period,
						decayMs =
							period *
							scale *
							this.decayScale *
							(Math.min(e.durationPulses, this.decayThreshold) +
								this.decayStretch *
									Math.max(0, e.durationPulses - this.decayThreshold))
					out.push({
						id: `${this.session}-${v + 1}-${this.revisions[v]}-${Math.round(p * 1000)}`,
						voice: v + 1,
						hz: eventHz(this.tuning, v, e, this.world, this.rootMultiplier),
						gain: e.gain,
						onsetMs,
						durationMs,
						durationMode: this.durationMode,
						...(this.durationMode === "decay" ? { decayMs } : {}),
					})
				}
			}
		}
		return out
	}
	private resetEvolution() {
		this.nextEvolveBeat =
			Math.floor(this.lastPulse / PERFORMANCE_PULSES_PER_BEAT) +
			2 +
			Math.floor(this.random() * 3)
	}
	private random() {
		this.rng = (Math.imul(this.rng, 1664525) + 1013904223) >>> 0
		return this.rng / 2 ** 32
	}
	private autoEvolution(c: PageContext, pulse: number) {
		if (
			!this.autoEvolve ||
			this.pendingWorldId ||
			pulse % PERFORMANCE_PULSES_PER_BEAT
		)
			return
		const beat = pulse / PERFORMANCE_PULSES_PER_BEAT
		if (beat < this.nextEvolveBeat) return
		this.nextEvolveBeat = beat + 2 + Math.floor(this.random() * 3)
		if (this.random() < 0.5) return
		this.evolve(c, false)
	}
	private evolve(c: PageContext, _manual: boolean) {
		if (this.pendingWorldId) return
		const beat = this.lastPulse / PERFORMANCE_PULSES_PER_BEAT
		const candidates = (this.world.evolutionGroups ?? []).filter(
			(g) =>
				g.rows.length &&
				g.choices.length &&
				g.rows.every(
					(row) =>
						!this.world.foundationRows?.includes(row) &&
						!this.locks[row] &&
						this.protectedUntilBeat[row] <= beat,
				),
		)
		if (!candidates.length) return
		const group = candidates[Math.floor(this.random() * candidates.length)]
		const resting = group.rows.some((row) => this.evolvedRest[row])
		const rest = this.allowSilence && !resting && this.random() < 0.25
		const options = group.choices.filter(
			(tuple) =>
				tuple.length === group.rows.length &&
				(resting ||
					tuple.some((choice, i) => choice !== this.selected[group.rows[i]])),
		)
		if (!rest && !options.length) return
		const tuple = rest
			? undefined
			: options[Math.floor(this.random() * options.length)]
		for (const [i, row] of group.rows.entries()) {
			this.evolvedRest[row] = rest
			if (tuple) this.selected[row] = tuple[i]
		}
		const cutoff = Date.now() + BUFFER_MS
		for (const row of group.rows) this.replace(c, row, cutoff)
		c.setDirty()
		this.view(c)
	}
	private toggleEvolution(c: PageContext) {
		this.autoEvolve = !this.autoEvolve
		this.resetEvolution()
		if (!this.autoEvolve && this.evolvedRest.some(Boolean)) {
			this.evolvedRest.fill(false)
			this.replaceAll(c)
		}
		c.setDirty()
		this.view(c)
	}
	private setCell(
		c: PageContext,
		row: number,
		choice: number,
		protect: boolean,
	) {
		if (protect) this.protectGroup(row)
		if (this.selected[row] === choice) return
		this.selected[row] = choice
		this.replace(c, row)
	}
	private chooseCell(c: PageContext, row: number, choice: number) {
		if (this.selected[row] === choice) this.muted[row] = !this.silent(row)
		else {
			this.selected[row] = choice
			this.muted[row] = false
		}
		const changed = this.clearGroupRest(row)
		this.protectGroup(row)
		const cutoff = Date.now() + BUFFER_MS
		for (const r of new Set([row, ...changed])) this.replace(c, r, cutoff)
		c.setDirty()
	}
	private silent(row: number) {
		return this.muted[row] || this.evolvedRest[row]
	}
	private performancePulse() {
		return (
			this.lastPulse +
			(this.running && this.lastPeriod > 0
				? Math.max(0, (Date.now() - this.deadlineMs) / this.lastPeriod)
				: 0)
		)
	}
	private protectGroup(row: number) {
		const until = this.performancePulse() / PERFORMANCE_PULSES_PER_BEAT + 8,
			group = (meta(this.rhythmWorld).evolutionGroups ?? []).find((g) =>
				g.rows.includes(row),
			)
		for (const r of group?.rows ?? [row]) this.protectedUntilBeat[r] = until
	}
	private clearGroupRest(row: number) {
		const group = (meta(this.rhythmWorld).evolutionGroups ?? []).find((g) =>
			g.rows.includes(row),
		)
		const changed = (group?.rows ?? [row]).filter((r) => this.evolvedRest[r])
		for (const r of changed) this.evolvedRest[r] = false
		return changed
	}
	private applyEnsemble(c: PageContext, index: number) {
		const ensemble = this.world.presets[index]
		if (!ensemble) return
		this.evolvedRest.fill(false)
		this.selected = [...ensemble]
		for (let row = 0; row < VOICES; row++) this.protectGroup(row)
		this.replaceAll(c)
		this.persist(c)
		c.setDirty()
		this.view(c)
	}
	private toggleLock(row: number) {
		this.locks[row] = !this.locks[row]
	}
	private recommendedWorld() {
		return meta(this.pendingWorldId ?? this.rhythmWorld)
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
		this.view(c)
	}
	private view(c: PageContext) {
		const w = this.world,
			recommendation = this.recommendedWorld(),
			stagedTuning =
				this.pendingWorldId &&
				this.pendingRecommendationWorldId === this.pendingWorldId
					? recommendation.recommendedTuning
					: this.tuning
		c.osc.send(
			`/grid/out/page/${c.slotLabel}/view`,
			JSON.stringify({
				worldId: w.id,
				worldName: w.name,
				pendingWorldId: this.pendingWorldId ?? null,
				pendingWorldName: this.pendingWorldId
					? worlds[this.pendingWorldId].name
					: null,
				recommendedTuning: recommendation.recommendedTuning,
				recommendationBasis:
					meta(recommendation.id).recommendationBasis ?? recommendation.source,
				recommendationActive: this.tuning === recommendation.recommendedTuning,
				recommendationPending:
					!!this.pendingWorldId &&
					stagedTuning === recommendation.recommendedTuning &&
					this.pendingRecommendationWorldId === this.pendingWorldId,
				roles: w.roles,
				cellNames: w.cells.map((row) => row.map((cell) => cell.name)),
				presetNames: w.presetNames,
				selected: this.selected,
				muted: this.muted,
				locks: this.locks,
				evolvedRest: this.evolvedRest,
				evolving: this.autoEvolve,
				lockMode: this.lockMode,
			}),
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
