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
	UI_ONLY_PREFIX,
} from "../core/types.js"
import type { KeySpec, PageModule, SettingSpec } from "../core/pageModule.js"
import { bool, int, isRecord, num, records } from "../util/restoreGuards.js"
import { SELECTOR_KEYS, drawSelector, selectorKey } from "../util/pageSelector.js"
import { DAMP_FROM_CELLS, DAMP_STATE } from "../core/sharedStore.js"
import { CycleLooper, MAX_LOOP_CYCLES, type LoopEvent } from "../util/cycleLooper.js"

export const PULSE_RATE = 12 / 1.66
const BUFFER_MS = 100,
	VOICES = 6,
	PERFORMANCE_PULSES_PER_BEAT = 3
/** Tempo is shown as BPM of the shared performance beat (3 pulses). */
export const pulseRateToBpm = (rate: number) =>
	(rate * 60) / PERFORMANCE_PULSES_PER_BEAT
export const bpmToPulseRate = (bpm: number) =>
	(bpm * PERFORMANCE_PULSES_PER_BEAT) / 60
const BPM_MIN = 20,
	BPM_MAX = 400
/** Voice rows: mute (or lock) key at x1, three cell choices at x2-4, phase bar x5-15. */
const MUTE_X = 1,
	CELL_X0 = 2
/** Row 6 view keys: cells (main) at x1, rhythm banks x2, tuning banks x3. */
const CELLS_VIEW_X = 1,
	RHYTHM_VIEW_X = 2,
	TUNING_VIEW_X = 3
/** Damp at x0 y6 (hold = all six). Hold it with shift (x0 y7) to toggle damp mode, where
 *  the mute column damps single voices; press either key to leave. set-hot sends it. */
const DAMP_X = 0,
	DAMP_Y = 6
/** Bottom row: shift held at x0, play toggle at x1, four gesture loopers at x12-15. */
const SHIFT_X = 0,
	PLAY_X = 1,
	LOOPER_X0 = 12,
	LOOPERS = 4,
	BLINK_MS = 220,
	MAX_PATTERN_EVENTS = 20_000,
	/** Live-layout writes are batched: a tempo drag must not hit the disk per step. */
	PERSIST_MS = 400,
	/** The phase bars flash this long when a new world lands. */
	LAND_FLASH_MS = 150
const LVL_REC_EMPTY = 1,
	LVL_REC_ARMED = 12,
	LVL_REC_STOPPED = 5,
	LVL_REC_PLAYING = 15
/** Arrangement gestures the loopers record: absolute values, so replay is idempotent. */
const parseCtl = (
	id: string,
): { kind: "cell" | "mute"; row: number } | { kind: "ensemble" } | null => {
	if (id === "ensemble") return { kind: "ensemble" }
	const m = /^(cell|mute)\/([0-5])$/.exec(id)
	return m ? { kind: m[1] as "cell" | "mute", row: Number(m[2]) } : null
}
/**
 * One phase-bar cell (0..10) for a row whose cycle has advanced `fill` cells (0..11).
 * The leading edge is interpolated so progress glides; a silent row draws dimmer.
 */
export function playheadLevel(i: number, fill: number, silent: boolean) {
	const lo = silent ? 0 : 1,
		hi = silent ? 2 : 5,
		whole = Math.floor(fill)
	if (i < whole) return hi
	if (i > whole) return lo
	return Math.round(lo + (hi - lo) * (fill - whole))
}
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
const gcd = (a: number, b: number): number => (b ? gcd(b, a % b) : a)
/**
 * The world's full cycle in performance pulses: the one span where every cell of every
 * row realigns (the LCM of all its cell lengths). 8–16 beats for the current banks.
 * Gesture loops lock to whole multiples of it.
 */
export function worldCyclePulses(id: string): number {
	const w = worlds[id],
		lengths = w.cells.flat().map((cell) => Math.round(cell.lengthPulses))
	const lcm = lengths.reduce((a, b) => (a / gcd(a, b)) * b, 1)
	return (lcm * PERFORMANCE_PULSES_PER_BEAT) / (meta(id).pulsesPerBeat ?? 3)
}
const MAX_CYCLE = Math.max(...Object.keys(worlds).map(worldCyclePulses))
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

/** First sentence of each world's context: the one-line card text in the web panel. */
const worldSummaries = () =>
	Object.fromEntries(
		worldNames.map((id) => {
			const text = worlds[id].context ?? ""
			const m = /^.*?[.!?](?=\s|$)/.exec(text)
			return [id, m ? m[0] : text]
		}),
	)
export const settings: SettingSpec[] = [
	{
		key: "rhythmWorld",
		label: "Rhythm world",
		help: "Six-voice source or study. While playing, a new world lands on the next shared beat.",
		type: "enum",
		options: worldNames,
		presentation: "buttons",
		optionLabels: worldLabels,
		default: "horn-relay",
	},
	{
		key: "durationMode",
		label: "Duration",
		help: "Gate: each note ends at its cell duration. Decay: the note rings for a shaped decay time instead.",
		type: "enum",
		options: ["gate", "decay"],
		default: "gate",
	},
	{
		key: "decayScale",
		label: "Decay scale",
		help: "Multiplies every decay, short and long notes alike (decay mode only).",
		type: "number",
		min: 0.25,
		max: 4,
		step: 0.01,
		default: 1,
	},
	{
		key: "decayStretch",
		label: "Long-note stretch",
		help: "Extra length only for notes longer than the threshold (decay mode only).",
		type: "number",
		min: 1,
		max: 8,
		step: 0.01,
		default: 1,
	},
	{
		key: "decayThreshold",
		label: "Long-note threshold (pulses)",
		help: "Notes longer than this many pulses count as long (decay mode only).",
		type: "number",
		min: 0.1,
		max: 4,
		step: 0.01,
		default: 1,
	},
	{
		key: "tuning",
		label: "Tuning world",
		help: "Pitch table for the six voices. Changing the rhythm world never retunes on its own.",
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
		help: "Transposes every voice by a frequency ratio (2 = an octave up).",
		type: "number",
		min: 0.25,
		max: 4,
		step: 0.01,
		default: 1,
	},
	{
		key: "bpm",
		label: "Tempo (BPM)",
		type: "number",
		min: BPM_MIN,
		max: BPM_MAX,
		step: 0.1,
		default: Math.round(pulseRateToBpm(PULSE_RATE) * 10) / 10,
		help: "One beat = three clock pulses. Cells owns the tempo: editing the transport rate writes back here.",
	},
	{
		key: "lane",
		label: "Clock lane",
		help: "Which of the four transport lanes drives this page.",
		type: "number",
		min: 0,
		max: 3,
		step: 1,
		default: 0,
	},
	{
		key: "allowSilence",
		label: "Allow silence in evolution",
		help: "Auto-evolve may rest a group for a while; its next change brings it back.",
		type: "toggle",
		default: false,
	},
	{
		key: "evolveActivity",
		label: "Evolution activity",
		help: "How often a change opportunity actually changes something (0 = never, 1 = every time).",
		type: "number",
		min: 0,
		max: 1,
		step: 0.05,
		default: 0.5,
	},
	{
		key: "restChance",
		label: "Rest chance",
		help: "With silence allowed: the chance a change rests a group instead of swapping it.",
		type: "number",
		min: 0,
		max: 1,
		step: 0.05,
		default: 0.25,
	},
	{
		key: "humanizeMs",
		label: "Humanize ms",
		help: "Random timing spread applied by Max, up to this many ms.",
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
	private evolveActivity = 0.5
	private restChance = 0.25
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
	/** Cells' own session is sounding. The transport can run without it (Play gates cells only). */
	private running = false
	/** Play is on: the session starts whenever the transport does. Only the Play key clears it. */
	private playOn = true
	/** Joined a transport already running: wait for its next beat before phase zero. */
	private joinOnBeat = false
	private observedRun = false
	private observedRate = 0
	private loopers = Array.from({ length: LOOPERS }, () => new CycleLooper())
	private persistTimer: ReturnType<typeof setTimeout> | null = null
	private worldLandedAt = 0
	/** The world the last /world packet described. */
	private worldSent = ""
	private dampAllHeld = false
	private dampMode = false
	private dampRows = new Array(VOICES).fill(false)
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
		this.observedRate = c.clock.rate
		this.announce(c, true)
	}
	onFocus(c: PageContext) {
		this.announce(c, true)
	}
	onBlur(c: PageContext) {
		c.setShift(1, false)
		// Hands let go: a held damp must not outlive leaving the page.
		this.dampAllHeld = false
		this.dampRows.fill(false)
		this.publishDamp(c)
	}
	dispose(c: PageContext) {
		this.dampAllHeld = false
		this.dampRows.fill(false)
		this.publishDamp(c)
		if (this.running) this.stop(c)
		for (const l of this.loopers) l.clear()
		if (this.persistTimer) clearTimeout(this.persistTimer)
		this.persistTimer = null
	}
	onClock(s: Readonly<PageContext["clock"]>, c: PageContext) {
		const rateChanged = s.rate !== this.observedRate
		this.observedRate = s.rate
		if (s.running !== this.observedRun) {
			this.observedRun = s.running
			if (s.running && this.playOn) this.start(c, false)
			else if (!s.running) this.stop(c)
			return
		}
		// Cells owns the tempo; the transport is its second editor. A rate change that
		// isn't our own push is adopted, so the next Play doesn't snap it back.
		if (rateChanged) this.adoptTransportRate(s, c)
	}
	private adoptTransportRate(s: Readonly<PageContext["clock"]>, c: PageContext) {
		const lane = s.lanes[this.lane]
		if (lane?.source === "external") return
		const next = s.rate / (lane?.div ?? 1)
		if (!Number.isFinite(next) || Math.abs(next - this.pulseRate) < 1e-9) return
		this.pulseRate = num(next, this.pulseRate, 0.1, 200)
		this.persist(c)
		this.announce(c)
	}
	onTick(tick: number, lane: number, c: PageContext, deadlineMs = Date.now()) {
		if (lane !== this.lane || !this.running) return
		if (this.originTick === undefined) {
			// Lane ticks count from 1 at transport start, so beats fall on 1, 4, 7...
			if (this.joinOnBeat && (tick - 1) % PERFORMANCE_PULSES_PER_BEAT) return
			this.originTick = tick
		}
		const p = tick - this.originTick,
			period = this.period(c),
			now = Date.now()
		// The web score runs its own playhead from the last anchor; re-anchor it only when
		// the extrapolation would go wrong: the first pulse and a tempo change.
		const reanchor = p === 0 || period !== this.lastPeriod
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
		this.playLoops(c, p, period, deadlineMs)
		if (reanchor && !transitioned) this.view(c)
		c.setDirty()
	}
	onKey(e: KeyEvent, c: PageContext) {
		if (selectorKey(e, c)) return
		if (e.x === DAMP_X && (e.y === DAMP_Y || e.y === 7)) {
			// Read the partner BEFORE this key updates shift.
			const partnerHeld = e.y === DAMP_Y ? c.modifiers.shift1 : this.dampAllHeld
			if (e.y === 7) c.setShift(1, e.s === 1)
			this.dampChordKey(e.y === DAMP_Y, e.s === 1, partnerHeld, c)
			return
		}
		// A held per-voice damp is released wherever its release lands, even after a view
		// change moved the column's meaning; otherwise it sticks until damp mode ends.
		if (
			e.x === MUTE_X &&
			e.y < VOICES &&
			((this.dampMode && this.bankMode === "cells") ||
				(!e.s && this.dampRows[e.y]))
		) {
			this.dampRows[e.y] = e.s === 1
			this.publishDamp(c)
			return
		}
		if (!e.s) return
		if (e.y === 6) {
			if (e.x === CELLS_VIEW_X) this.bankMode = "cells"
			else if (e.x === RHYTHM_VIEW_X) this.bankMode = "rhythmWorld"
			else if (e.x === TUNING_VIEW_X) this.bankMode = "tuning"
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
			if (e.x >= CELL_X0 && e.x < CELL_X0 + 3)
				this.chooseCell(c, e.y, e.x - CELL_X0, true)
			else if (e.x === MUTE_X) {
				if (this.lockMode) this.toggleLock(e.y)
				else this.toggleMute(c, e.y)
			} else return
			this.persist(c)
			c.setDirty()
			this.view(c)
			return
		}
		if (e.y === 7 && e.x === PLAY_X) this.togglePlay(c)
		else if (e.y === 7 && e.x >= 4 && e.x <= 6)
			this.applyEnsemble(c, e.x - 4, true)
		else if (e.y === 7 && e.x >= LOOPER_X0 && e.x < LOOPER_X0 + LOOPERS)
			this.looperKey(c, e.x - LOOPER_X0, c.modifiers.shift1)
	}
	private dampChordKey(
		isDamp: boolean,
		down: boolean,
		partnerHeld: boolean,
		c: PageContext,
	) {
		if (down && this.dampMode) {
			// Either key leaves damp mode.
			this.dampMode = false
			this.dampAllHeld = false
			this.dampRows.fill(false)
		} else if (down && partnerHeld) {
			// Both held: enter damp mode. The all-damp from holding x0 y6 first is let go.
			this.dampMode = true
			this.dampAllHeld = false
		} else if (isDamp) this.dampAllHeld = down && !this.dampMode
		else return
		this.publishDamp(c)
		this.view(c)
		c.setDirty()
	}
	private publishDamp(c: PageContext) {
		c.shared?.set(
			DAMP_FROM_CELLS,
			this.dampRows.map((row) => this.dampAllHeld || row),
		)
	}
	/**
	 * Play gates CELLS only. On: start the transport at cells' tempo if it is stopped, or
	 * join it on its next beat if it is already running. Off: silence cells and leave the
	 * transport to the other pages that follow it.
	 */
	private togglePlay(c: PageContext) {
		if (this.running) {
			this.playOn = false
			this.stop(c)
			return
		}
		this.playOn = true
		if (c.clock.running) {
			this.start(c, true)
			return
		}
		c.clockControl?.setRate(
			this.pulseRate * (c.clock.lanes[this.lane]?.div ?? 1),
		)
		this.start(c, false)
		c.clockControl?.start()
	}
	onOsc(path: string, args: any[], c: PageContext) {
		const v = args[0]
		if (path === "/action/refreshView") {
			this.emitWorld(c)
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
		if (path === "/action/play") {
			this.togglePlay(c)
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
				this.toggleMute(c, row)
				this.persist(c)
				this.view(c)
			}
			return
		}
		m = /^\/looper\/(\d+)(\/clear)?$/.exec(path)
		if (m) {
			const i = int(m[1], -1, 0, LOOPERS - 1)
			if (i >= 0) this.looperKey(c, i, !!m[2])
			return
		}
		m = /^\/cell\/(\d+)\/(\d+)$/.exec(path)
		if (m) {
			const row = int(m[1], -1, 0, VOICES - 1),
				choice = int(m[2], -1, 0, 2)
			if (row >= 0 && choice >= 0) {
				this.chooseCell(c, row, choice, true)
				this.persist(c)
				this.view(c)
			}
			return
		}
		m = /^\/ensemble\/(\d+)$/.exec(path)
		if (m) {
			this.applyEnsemble(c, int(m[1], -1, 0, 2), true)
			return
		}
		const setting =
			/^\/setting\/(rhythmWorld|durationMode|decayScale|decayStretch|decayThreshold|tuning|rootMultiplier|pulseRate|bpm|lane|allowSilence|evolveActivity|restChance|humanizeMs)$/.exec(
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
		} else if (key === "evolveActivity")
			this.evolveActivity = num(v, this.evolveActivity, 0, 1)
		else if (key === "restChance")
			this.restChance = num(v, this.restChance, 0, 1)
		else if (key === "tuning" && tunings.includes(v))
			this.tuning = v as Tuning
		else if (key === "rootMultiplier")
			this.rootMultiplier = num(v, this.rootMultiplier, 0.25, 4)
		else if (key === "pulseRate" || key === "bpm") {
			this.pulseRate =
				key === "bpm"
					? bpmToPulseRate(num(v, pulseRateToBpm(this.pulseRate), BPM_MIN, BPM_MAX))
					: num(v, this.pulseRate, 0.1, 200)
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
		if (key !== "rhythmWorld" && key !== "evolveActivity" && key !== "restChance")
			this.replaceAll(c)
		this.persist(c)
		this.announce(c)
	}
	render(c: PageContext): LedFrame {
		const f = makeFrame(c.size),
			now = Date.now()
		// What Max is actually told (set-hot's view), so its ALL key lights ours too.
		const damped = c.shared?.get<boolean[]>(DAMP_STATE) ?? []
		const blinkOn = now % (BLINK_MS * 2) < BLINK_MS
		// A new world just landed: every phase bar flashes once, on the audible beat.
		const landing =
			now >= this.worldLandedAt && now < this.worldLandedAt + LAND_FLASH_MS
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
				for (let x = CELL_X0; x < CELL_X0 + 3; x++)
					f[ledIndex(c.size, x, y)] =
						this.selected[y] === x - CELL_X0
							? now < this.changedUntil[y]
								? 7
								: this.silent(y)
									? 3
									: 12
							: 2
				f[ledIndex(c.size, MUTE_X, y)] = this.dampMode
					? damped[y]
						? 15
						: 6
					: this.lockMode
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
					fill = this.running ? ((phase % len) / len) * 11 : 0,
					silent = this.silent(y)
				for (let x = 5; x <= 15; x++)
					f[ledIndex(c.size, x, y)] = landing
						? 10
						: playheadLevel(x - 5, fill, silent)
				if (
					!silent &&
					this.flashes[y].some((at) => now >= at && now < at + 120)
				)
					f[ledIndex(c.size, 15, y)] = 15
			}
		f[ledIndex(c.size, CELLS_VIEW_X, 6)] = this.bankMode === "cells" ? 8 : 3
		// A queued world blinks the rhythm-bank key until it lands (at most about a beat).
		f[ledIndex(c.size, RHYTHM_VIEW_X, 6)] =
			this.pendingWorldId && this.bankMode === "cells"
				? blinkOn
					? 15
					: 5
				: this.bankMode === "rhythmWorld"
					? 15
					: 5
		f[ledIndex(c.size, TUNING_VIEW_X, 6)] = this.bankMode === "tuning" ? 15 : 5
		f[ledIndex(c.size, 4, 6)] = this.autoEvolve ? 15 : 4
		f[ledIndex(c.size, 5, 6)] = this.lockMode ? 15 : 4
		f[ledIndex(c.size, 6, 6)] =
			this.pendingWorldId &&
			this.pendingRecommendationWorldId === this.pendingWorldId
				? 7
				: this.tuning === this.recommendedWorld().recommendedTuning
					? 12
					: 3
		f[ledIndex(c.size, PLAY_X, 7)] = this.running ? 15 : 5
		const active = this.activeEnsemble()
		for (let x = 4; x <= 6; x++)
			f[ledIndex(c.size, x, 7)] = active === x - 4 ? 12 : 6
		for (let i = 0; i < LOOPERS; i++) {
			const st = this.loopers[i].state
			f[ledIndex(c.size, LOOPER_X0 + i, 7)] =
				st === "recording"
					? blinkOn
						? LVL_REC_ARMED
						: LVL_REC_EMPTY
					: st === "playing"
						? LVL_REC_PLAYING
						: st === "stopped"
							? LVL_REC_STOPPED
							: LVL_REC_EMPTY
		}
		f[ledIndex(c.size, SHIFT_X, 7)] = c.modifiers.shift1 ? 15 : 1
		f[ledIndex(c.size, DAMP_X, DAMP_Y)] = this.dampMode
			? now % (BLINK_MS * 4) < BLINK_MS * 2
				? 12
				: 6
			: damped.length && damped.every(Boolean)
				? 15
				: 3
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
			bpm: Math.round(pulseRateToBpm(this.pulseRate) * 1000) / 1000,
			lane: this.lane,
			allowSilence: this.allowSilence,
			evolveActivity: this.evolveActivity,
			restChance: this.restChance,
			humanizeMs: this.humanizeMs,
			decayScale: this.decayScale,
			decayStretch: this.decayStretch,
			decayThreshold: this.decayThreshold,
			patterns: this.loopers.map((l) => l.snapshot()),
		}
	}
	restore(raw: unknown, c: PageContext) {
		this.bankMode = "cells"
		this.autoEvolve = false
		this.lockMode = false
		this.evolvedRest.fill(false)
		this.protectedUntilBeat.fill(0)
		// Restoring never plays: the session stops (the Play key shows it) and the transport
		// is left to the other pages. Play stays armed, so the next transport start resumes.
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
		this.evolveActivity = num(raw.evolveActivity, this.evolveActivity, 0, 1)
		this.restChance = num(raw.restChance, this.restChance, 0, 1)
		this.humanizeMs = int(raw.humanizeMs, this.humanizeMs, 0, 4)
		this.decayScale = num(raw.decayScale, this.decayScale, 0.25, 4)
		this.decayStretch = num(raw.decayStretch, this.decayStretch, 1, 8)
		this.decayThreshold = num(raw.decayThreshold, this.decayThreshold, 0.1, 4)
		if (raw.pulseRate === undefined && raw.bpm !== undefined)
			this.pulseRate = bpmToPulseRate(
				num(raw.bpm, pulseRateToBpm(this.pulseRate), BPM_MIN, BPM_MAX),
			)
		if (raw.patterns !== undefined) this.restorePatterns(raw.patterns)
		this.announce(c, true)
	}
	/** Loops in pulses. The older wall-clock (`lengthMs`) form has no cycle position, so it is dropped. */
	private restorePatterns(value: unknown) {
		const raw = Array.isArray(value) ? value : []
		for (let i = 0; i < LOOPERS; i++) {
			const node = isRecord(raw[i]) ? raw[i] : {}
			const maxLength = MAX_LOOP_CYCLES * MAX_CYCLE
			const lengthPulses = num(node.lengthPulses, 0, 0, maxLength)
			this.loopers[i].restore({
				lengthPulses,
				anchor: num(node.anchor, 0, 0, maxLength),
				cycle: num(node.cycle, lengthPulses, 0, maxLength),
				events: records(
					node.events,
					MAX_PATTERN_EVENTS,
					(e): LoopEvent | undefined => {
						const atPulse = num(e.atPulse, -1, 0, maxLength)
						if (atPulse < 0 || typeof e.id !== "string") return undefined
						const target = parseCtl(e.id)
						if (!target) return undefined
						const max = target.kind === "mute" ? 1 : 2
						const value = Number(e.value)
						if (!Number.isInteger(value) || value < 0 || value > max)
							return undefined
						return { atPulse, id: e.id, value }
					},
				),
			})
		}
	}
	private period(c: PageContext) {
		return (1000 * (c.clock.lanes[this.lane]?.div ?? 1)) / c.clock.rate
	}
	private start(c: PageContext, joinOnBeat: boolean) {
		if (this.running) return
		this.running = true
		this.joinOnBeat = joinOnBeat
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
		this.view(c)
	}
	private stop(c: PageContext) {
		if (!this.running) return
		this.emit(c, { type: "stop", session: this.session })
		// A take still recording closes on what it has; its pulses end with this session.
		for (const l of this.loopers)
			if (l.state === "recording" && l.events.length) l.close(undefined)
		this.emitPatterns(c)
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
		this.worldLandedAt = deadlineMs + BUFFER_MS
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
	private replaceAll(c: PageContext, at?: number) {
		if (!this.running || !this.preparedEnd) return
		const cutoffMs =
			at ?? Math.max(Date.now() + BUFFER_MS, this.deadlineMs + BUFFER_MS)
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
		if (this.random() < 1 - this.evolveActivity) return
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
		const rest = this.allowSilence && !resting && this.random() < this.restChance
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
	/** `byHand` = your press (grid or web), which armed loopers record; playback passes false. */
	private chooseCell(
		c: PageContext,
		row: number,
		choice: number,
		byHand: boolean,
	) {
		if (this.selected[row] === choice) this.muted[row] = !this.silent(row)
		else {
			this.selected[row] = choice
			this.muted[row] = false
		}
		this.applyRow(c, row)
		if (byHand) {
			this.recordGesture(`cell/${row}`, choice)
			this.recordGesture(`mute/${row}`, this.muted[row] ? 1 : 0)
		}
	}
	private toggleMute(c: PageContext, row: number) {
		this.muted[row] = !this.muted[row]
		this.protectGroup(row)
		this.replace(c, row)
		this.recordGesture(`mute/${row}`, this.muted[row] ? 1 : 0)
	}
	/** Re-send one row (and its linked group's cleared rests) after its choice changed. */
	private applyRow(c: PageContext, row: number, at?: number) {
		const changed = this.clearGroupRest(row)
		this.protectGroup(row)
		const cutoff = at ?? Date.now() + BUFFER_MS
		for (const r of new Set([row, ...changed])) this.replace(c, r, cutoff)
		c.setDirty()
	}
	/** A hand move, recorded by any armed looper at its exact pulse. Needs cells playing. */
	private recordGesture(id: string, value: number) {
		if (!this.running || this.originTick === undefined) return
		const pulse = this.performancePulse(),
			cycle = worldCyclePulses(this.rhythmWorld)
		for (const l of this.loopers) l.record(id, value, pulse, cycle)
	}
	private looperKey(c: PageContext, i: number, clear: boolean) {
		const l = this.loopers[i]
		if (clear) l.clear()
		else
			l.press(
				this.running && this.originTick !== undefined
					? this.performancePulse()
					: undefined,
			)
		this.emitPatterns(c)
		this.persist(c)
	}
	/**
	 * Loop moves due in this tick's window [p, p+1) land at their exact pulse: each one's
	 * cutoff is that pulse's onset time, so the notes before it keep the old cell.
	 * Ensembles apply before cell and mute moves at the same pulse.
	 */
	private playLoops(c: PageContext, p: number, period: number, deadlineMs: number) {
		let stateChanged = false
		for (const l of this.loopers) stateChanged = l.tick(p) || stateChanged
		const due = this.loopers
			.flatMap((l) => l.due(p, p + 1))
			.sort(
				(a, b) =>
					a.pulse - b.pulse ||
					Number(b.id === "ensemble") - Number(a.id === "ensemble"),
			)
		let moved = false
		for (const e of due) {
			const at = deadlineMs + BUFFER_MS + (e.pulse - p) * period
			const t = parseCtl(e.id)
			if (!t) continue
			if (t.kind === "ensemble") this.applyEnsemble(c, e.value, false, at)
			else {
				if (t.kind === "cell") {
					if (this.selected[t.row] === e.value) continue
					this.selected[t.row] = e.value
				} else {
					if (this.muted[t.row] === (e.value !== 0)) continue
					this.muted[t.row] = e.value !== 0
				}
				this.applyRow(c, t.row, at)
			}
			moved = true
		}
		if (moved) this.view(c)
		if (stateChanged) {
			this.emitPatterns(c)
			this.persist(c)
		}
	}
	private emitPatterns(c: PageContext) {
		c.osc.send(
			`/grid/out/page/${c.slotLabel}/patterns`,
			JSON.stringify(
				this.loopers.map((l) => ({
					state: l.state,
					beats: l.lengthPulses / PERFORMANCE_PULSES_PER_BEAT,
				})),
			),
		)
	}
	/** The recall whose tuple is exactly what's playing (no mutes/rests), else -1. */
	private activeEnsemble() {
		if (this.selected.some((_, row) => this.silent(row))) return -1
		return this.world.presets.findIndex((p) =>
			p.every((choice, row) => choice === this.selected[row]),
		)
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
	private applyEnsemble(
		c: PageContext,
		index: number,
		byHand: boolean,
		at?: number,
	) {
		const ensemble = this.world.presets[index]
		if (!ensemble) return
		this.evolvedRest.fill(false)
		this.selected = [...ensemble]
		for (let row = 0; row < VOICES; row++) this.protectGroup(row)
		this.replaceAll(c, at)
		if (byHand) {
			this.recordGesture("ensemble", index)
			this.persist(c)
		}
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
	/**
	 * Refresh the LIVE layout (slots.json) only, batched. The empty patch is deliberate:
	 * nothing cells does merges into the saved preset. Presets change from the web panel's
	 * save, never as a side effect of playing.
	 */
	private persist(c: PageContext) {
		if (this.persistTimer) return
		this.persistTimer = setTimeout(() => {
			this.persistTimer = null
			c.persist({})
		}, PERSIST_MS)
	}
	/** `forceWorld`: resend the world packet even if it hasn't changed (init, focus, restore). */
	private announce(c: PageContext, forceWorld = false) {
		c.osc.send(`/grid/out/page/${c.slotLabel}/type`, "cells-hot")
		if (forceWorld || this.worldSent !== this.rhythmWorld) this.emitWorld(c)
		this.emitPatterns(c)
		c.osc.send(
			`/grid/out/page/${c.slotLabel}/settings`,
			JSON.stringify(this.serialize()),
		)
		this.view(c)
	}
	/**
	 * Everything about the world that only changes when the world does: names, notes and
	 * the score (every cell's hits, in source pulses). Sent on announce (init, focus,
	 * restore, a world change) and on refreshView, never per key press.
	 */
	private emitWorld(c: PageContext) {
		const w = this.world
		this.worldSent = w.id
		c.osc.send(
			// Web only: Max has no use for the score, and a 15 KB datagram is not worth risking.
			`${UI_ONLY_PREFIX}page/${c.slotLabel}/world`,
			JSON.stringify({
				worldId: w.id,
				worldName: w.name,
				roles: w.roles,
				cellNames: w.cells.map((row) => row.map((cell) => cell.name)),
				presetNames: w.presetNames,
				ensembleNotes: w.ensembleNotes ?? [],
				context: w.context ?? "",
				worldSummaries: worldSummaries(),
				source: w.source,
				pulsesPerBeat: meta(w.id).pulsesPerBeat ?? 3,
				sourceScale: this.sourceScale,
				cyclePulses: worldCyclePulses(w.id),
				score: w.cells.map((row) =>
					row.map((cell) => ({
						lengthPulses: cell.lengthPulses,
						events: cell.events.map((e) => ({
							atPulse: e.atPulse,
							durationPulses: e.durationPulses,
							gain: e.gain,
						})),
					})),
				),
			}),
		)
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
				activeEnsemble: this.activeEnsemble(),
				running: this.running,
				// Where the score's playhead is: `pulse` is heard at `atMs` (same-host epoch
				// ms), and advances one pulse per `periodMs`. Null while cells is silent.
				phase:
					this.running && this.originTick !== undefined && this.lastPeriod > 0
						? {
								pulse: this.lastPulse,
								atMs: this.deadlineMs + BUFFER_MS,
								periodMs: this.lastPeriod,
							}
						: null,
				bpm: pulseRateToBpm(this.pulseRate),
				selected: this.selected,
				muted: this.muted,
				locks: this.locks,
				evolvedRest: this.evolvedRest,
				evolving: this.autoEvolve,
				dampMode: this.dampMode,
				keyView:
					this.bankMode === "cells"
						? this.dampMode
							? "damp"
							: "cells"
						: this.bankMode === "rhythmWorld"
							? "rhythm banks"
							: "tuning banks",
				lockMode: this.lockMode,
			}),
		)
	}
	private emit(c: PageContext, p: Record<string, unknown>) {
		c.osc.send(`/grid/out/page/${c.slotLabel}/cells`, JSON.stringify(p))
	}
}
/** Legend labels short enough for one key; the full name shows on hover. */
const WORLD_SHORT: Record<string, string> = {
	"horn-relay": "Horn",
	"amadinda-ndyegulira": "Ndyeg.",
	"amadinda-ssematimba": "Ssemat.",
	"mbira-chakwi": "Chakwi",
	manjanin: "Manjanin",
	ngon: "Ngòn",
	"manjanin-ii": "Manj. II",
	woloso: "Woloso",
	kotekan: "Pelayon",
}
const shortWorld = (id: string) => WORLD_SHORT[id] ?? worlds[id].name.split(" — ")[0]
// Cheat-sheet looks, from render(): a cell chosen per row, phase bars part-way through.
const CELLS_LIT = Array.from({ length: VOICES }, (_, y) => [0, 1, 2].map((x) => (x === y % 3 ? 12 : 2))).flat()
const PHASE_LIT = Array.from({ length: VOICES }, (_, y) =>
	Array.from({ length: 11 }, (_, i) => playheadLevel(i, [3.5, 7.2, 1.6, 9.8, 5.1, 0.4][y], y === 4)),
).flat()
/** The web cheat-sheet: views are the row-6 modes, plus damp mode. */
export const keymap: KeySpec[] = [
	...SELECTOR_KEYS,
	{ x: MUTE_X, y: 0, h: VOICES, view: "cells", name: "Mute", help: "Mute or rejoin the voice. In lock editing, locks the row against auto-evolve.", lit: [8, 8, 8, 8, 3, 8] },
	{ x: MUTE_X, y: 0, h: VOICES, view: "damp", name: "Damp voice", short: "Damp", help: "Hold to damp that voice (sent through set-hot). Press Damp or Shift to leave damp mode.", lit: [6, 15, 6, 6, 6, 6] },
	...(["cells", "damp"] as const).flatMap((view): KeySpec[] => [
		{ x: CELL_X0, y: 0, w: 3, h: VOICES, view, name: "Cells 1–3", help: "Choose the voice's cell; it comes in at the current phase. Tap the lit one to mute.", lit: CELLS_LIT },
		{ x: 5, y: 0, w: 11, h: VOICES, view, name: "Phase", help: "The cycle's progress; the last key flashes on each onset. Dim = muted or resting.", lit: PHASE_LIT },
	]),
	{ x: DAMP_X, y: DAMP_Y, name: "Damp", help: "Hold to damp all six voices, in sync with set-hot. Hold together with Shift to toggle per-voice damp on column 1; press either to leave.", lit: { damp: 12, "*": 3 } },
	...worldNames.map((id, i): KeySpec => ({ x: 1 + (i % 15), y: Math.floor(i / 15), view: "rhythm banks", name: worlds[id].name, short: shortWorld(id), help: "Switch world on the next shared beat.", lit: i === 0 ? 12 : 3 })),
	...tunings.map((id, i): KeySpec => ({ x: i < 5 ? i + 1 : i - 4, y: i < 5 ? 0 : 1, view: "tuning banks", name: tuningLabels[id] ?? id, short: (tuningLabels[id] ?? id).replace("Hotelier · ", "").split(" ")[0], help: i < 5 ? "Included tuning." : "Hotelier keyboard scale.", lit: i === 0 ? 12 : 3 })),
	{ x: CELLS_VIEW_X, y: 6, name: "Cells view", short: "Cells", help: "The main screen: voices, cells and phase.", lit: { cells: 8, damp: 8, "*": 3 } },
	{ x: RHYTHM_VIEW_X, y: 6, name: "Rhythm banks", short: "Rhythm", help: "Pick a rhythm world on the top rows.", lit: { "rhythm banks": 15, "*": 5 } },
	{ x: TUNING_VIEW_X, y: 6, name: "Tuning banks", short: "Tuning", help: "Pick a tuning on the top two rows.", lit: { "tuning banks": 15, "*": 5 } },
	{ x: 4, y: 6, name: "Auto-evolve", short: "Evolve", help: "Every 2–4 beats, maybe swap one linked group of rows.", lit: 4 },
	{ x: 5, y: 6, name: "Lock editing", short: "Locks", help: "While on, the mute keys lock rows against auto-evolve instead.", lit: 4 },
	{ x: 6, y: 6, name: "Recommended tuning", short: "Rec. tuning", help: "Apply this world's recommended tuning. Lit when it's active.", lit: 12 },
	{ x: SHIFT_X, y: 7, name: "Shift", help: "Hold, then press a looper to clear it. Held with Damp, toggles damp mode.", lit: { damp: 15, "*": 1 } },
	{ x: PLAY_X, y: 7, name: "Play / stop", short: "Play", help: "Starts or stops cells. Starts the transport at this page's tempo if it is stopped; stopping leaves the transport running for other pages.", lit: 15 },
	{ x: 4, y: 7, w: 3, name: "Ensembles 1–3", help: "Recall all six cells at once. The live one is brighter.", lit: [12, 6, 6] },
	{ x: LOOPER_X0, y: 7, w: LOOPERS, name: "Loopers 1–4", help: "Record cell, mute and ensemble moves while cells plays: arm, close, then play/pause. Loops lock to whole world cycles. Shift + press clears.", lit: [LVL_REC_PLAYING, LVL_REC_STOPPED, LVL_REC_EMPTY, LVL_REC_EMPTY] },
]
export const page: PageModule = {
	name: "cells-hot",
	label: "Cells Hot",
	settings,
	keymap,
	create: () => new CellsHotPage(),
}
