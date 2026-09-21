import { manjanin2World } from "./cells-manjanin2.js"
import { wolosoWorld } from "./cells-woloso.js"
import { kotekanWorld } from "./cells-kotekan.js"
import { ngonWorld } from "./cells-ngon.js"
import { manjaninWorld } from "./cells-manjanin.js"
import hotelier from "./hotelier-tunings.json" with { type: "json" }
import horn from "./cells-hot-bank.json" with { type: "json" }

export type CellEvent = {
	atPulse: number
	durationPulses: number
	gain: number
	pitchOffsetCents: number
	pitchStep?: number
	sourceToken?: string
}
export type Cell = {
	id: string
	name: string
	lengthPulses: number
	events: CellEvent[]
	provenance: unknown
}
export type World = {
	id: string
	name: string
	degreeCount: number
	/** Source pulses per shared performance beat; legacy banks retain 3. */
	pulsesPerBeat?: number
	performanceBeatBasis?: string
	recommendationBasis?: string
	foundationRows?: number[]
	/** Source parts split between rows; evolution rules may use only a subset. */
	pairedParts?: number[][]
	evolutionGroups?: { rows: number[]; choices: number[][] }[]
	cells: Cell[][]
	presets: number[][]
	presetNames: string[]
	recommendedTuning: Tuning
	source: string
	roles: string[]
}
export const hotelierTuningNames = [
 "hotelier-12edo", "hotelier-just", "hotelier-werckmeister3",
 "hotelier-young", "hotelier-slendro", "hotelier-pelog", "hotelier-ranat",
 "hotelier-balafon", "hotelier-equipentatonic",
] as const
export const tuningNames = [
	"tritave",
	"beating",
	"source",
	"pentatonic-model",
	"heptatonic-model",
 ...hotelierTuningNames,
] as const
export type Tuning = (typeof tuningNames)[number]
export const tuningLabels: Record<string, string> = {
 tritave: "Tritave", beating: "Beating", source: "Horn source model",
 "pentatonic-model": "Five-tone model", "heptatonic-model": "Seven-tone model",
 ...Object.fromEntries(hotelierTuningNames.map(id => [id, "Hotelier · " + id.slice(9)])),
}
export function hotelierKeyHz(id: string, key: number): number {
 const table = hotelier.tables.find(t => t.id === id)
 if (!table) throw new Error(`Unknown Hotelier tuning: ${id}`)
 const n = table.cents.length, period = table.period ?? 1200
 const cents = (k: number) => {
  const relative = k - table.root, octave = Math.floor(relative / n)
  return octave * period + table.cents[relative - octave * n]
 }
 return hotelier.anchorHz * 2 ** ((cents(key) - cents(hotelier.anchorKey)) / 1200)
}
const hornRoles = ["ground", "knock", "low", "high", "reply", "splinter"]
const hornCells = hornRoles.map((role) =>
	horn.cells.filter((c) => c.voiceRole === role),
)
export const worlds: Record<string, World> = {
	"horn-relay": {
		id: "horn-relay",
		name: "Horn relay — composed / inferred",
		degreeCount: 0,
		cells: hornCells,
		presets: horn.presets.map((p) =>
			p.cells.map((id, v) => hornCells[v].findIndex((c) => c.id === id)),
		),
		presetNames: ["Deep lock", "Hollow", "Long"],
		recommendedTuning: "tritave",
		source:
			"Original workshop bank; composed/inferred, not a verified traditional transcription.",
		roles: hornRoles,
	},
}

// Numerals are source tonal degrees, not semitones. A/B enter on alternate
// elementary pulses. Six monophonic voices reproduce the two octave-doubled
// lines and split the single high C part by its A/B provenance.
function amadinda(
	id: string,
	name: string,
	a: number[],
	b: number[],
	source: string,
) {
	const length = a.length * 2
	const parts = [
		a.map((degree, i) => ({ at: 2 * i, degree })),
		b.map((degree, i) => ({ at: 2 * i + 1, degree })),
	]
	const specs = [
		{ part: 0, register: 0, binder: false },
		{ part: 0, register: 1, binder: false },
		{ part: 1, register: 0, binder: false },
		{ part: 1, register: 1, binder: false },
		{ part: 0, register: 2, binder: true },
		{ part: 1, register: 2, binder: true },
	]
	const cells = specs.map((s, voice) =>
		[0, 1, 2].map((choice) => {
			const events = parts[s.part]
				.filter(
					(e) =>
						(!s.binder || e.degree <= 2) &&
						(choice === 0 ||
							(choice === 1
								? e.degree <= (s.binder ? 1 : 2)
								: e.degree > (s.binder ? 1 : 2))),
				)
				.map((e) => ({
					atPulse: e.at,
					durationPulses: 0.7,
					gain: s.register === 1 ? 0.35 : 0.5,
					pitchOffsetCents: 0,
					pitchStep: e.degree - 1 + s.register * 5,
				}))
			return {
				id: `${id}-${voice}-${choice}`,
				name: ["Published part", "Lower degrees", "Upper degrees"][choice],
				lengthPulses: length,
				events,
				provenance: {
					kind: choice === 0 ? "source-derived" : "filtered-adaptation",
					source,
					note: "Onsets and degree order follow the cited notation; C is split between two voices. Duration, gain and absolute tuning are workshop choices. Filtered choices are not additional traditional variations.",
				},
			}
		}),
	)
	worlds[id] = {
		id,
		name,
		degreeCount: 5,
		cells,
		presets: [
			[0, 0, 0, 0, 0, 0],
			[1, 1, 1, 1, 0, 0],
			[2, 2, 2, 2, 0, 0],
		],
		presetNames: ["Published parts", "Lower stream", "Upper stream"],
		recommendedTuning: "pentatonic-model",
		source,
		roles: [
			"A lower octave",
			"A upper octave",
			"B lower octave",
			"B upper octave",
			"C from A",
			"C from B",
		],
	}
}
amadinda(
	"amadinda-ndyegulira",
	"Amadinda — Ndyegulira ekkadde",
	[2, 1, 2, 2, 2, 5, 2, 1, 1, 2, 3, 5],
	[4, 2, 5, 4, 2, 5, 4, 2, 5, 4, 2, 5],
	"Gerd Grupe (2005), Notating African Music: Issues and Concepts, pp.94–95, fig.10. https://phaidra.kug.ac.at/detail/o:69192.pdf",
)
amadinda(
	"amadinda-ssematimba",
	"Amadinda — Ssematimba ne Kikwabanga",
	[4, 5, 2, 3, 3, 5, 2, 1, 2, 5, 2, 2, 1, 4, 4, 2, 1, 1],
	[1, 4, 3, 1, 2, 3, 4, 3, 2, 2, 5, 4, 3, 2, 4, 4, 4, 1],
	"Gerhard Kubik (2004), Inherent patterns, pp.253–257, fig.2 and C-part extraction rule. https://journals.openedition.org/lhomme/pdf/24906",
)

// Virginia Mukwesha's Chakwi kushaura, Grupe fig.15. The tablature's
// manual-local key numbers are retained; fig.13 supplies relative staff pitch.
// In particular L3 is F, below L2=G, and the bass sequence skips D.
export const chakwiPitch: Record<string, number> = {
	LL3: 3,
	LL4: 4,
	LL5: 5,
	LL6: 6,
	LL7: 8,
	LU3: 10,
	LU2: 11,
	LU4: 12,
	LU5: 13,
	RT2: 14,
	RT3: 15,
	RI4: 16,
	RI5: 17,
	RI6: 18,
}
const chakwiKeys = {
	RI: [5, 5, 5, 5, 5, 5, 5, 5, 6, 6, 6, 4, 6, 6, 6, 6],
	RT: [2, 2, 2, 3, 2, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3],
	LU: [3, 4, 3, 4, 3, 5, 3, 4, 2, 5, 3, 5, 2, 5, 3, 4],
	LL: [3, 5, 7, 5, 3, 6, 7, 5, 4, 6, 7, 6, 4, 6, 7, 5],
}
const chakwiRoles: [keyof typeof chakwiKeys, number | null][] = [
	["LL", 0],
	["LL", 1],
	["LU", null],
	["RT", null],
	["RI", 0],
	["RI", 1],
]
const chakwiSource =
	"Gerd Grupe (2005), Notating African Music: Issues and Concepts, pp.98–99, figs.13–15; Virginia Mukwesha, Chakwi kushaura. https://phaidra.kug.ac.at/detail/o:69192.pdf"
const chakwiCells = chakwiRoles.map(([manual, parity], voice) =>
	[0, 1, 2].map((choice) => {
		const start = choice === 2 ? 24 : 0,
			end = choice === 0 ? 48 : start + 24
		const events = chakwiKeys[manual]
			.map((key, i) => ({
				key,
				i,
				at: 3 * i + (manual === "RI" ? 0 : manual === "LL" ? 2 : 1),
			}))
			.filter(
				(e) =>
					e.at >= start &&
					e.at < end &&
					(parity === null || e.i % 2 === parity),
			)
			.map((e) => ({
				atPulse: e.at - start,
				durationPulses: 0.9,
				gain: 0.45,
				pitchOffsetCents: 0,
				pitchStep: chakwiPitch[manual + e.key],
				sourceToken: manual + e.key,
			}))
		return {
			id: `mbira-chakwi-${voice}-${choice}`,
			name: ["Full-cycle allocation", "First-half loop", "Second-half loop"][
				choice
			],
			lengthPulses: end - start,
			events,
			provenance: {
				kind: choice === 0 ? "source-derived" : "excerpt-loop-adaptation",
				source: chakwiSource,
				note: "Unparenthesized tablature choices. LL and RI are split into alternating streams for six-voice allocation. Short excerpt loops, gain, duration and tuning are workshop choices; no second player or kutsinhira part is invented.",
			},
		}
	}),
)
worlds["mbira-chakwi"] = {
	id: "mbira-chakwi",
	name: "Mbira — Chakwi (Virginia Mukwesha)",
	degreeCount: 7,
	cells: chakwiCells,
	presets: [
		[0, 0, 0, 0, 0, 0],
		[1, 1, 1, 1, 1, 1],
		[2, 2, 2, 2, 2, 2],
	],
	presetNames: [
		"Published 48-pulse reconstruction",
		"First-half loop",
		"Second-half loop",
	],
	recommendedTuning: "heptatonic-model",
	source: chakwiSource,
	roles: [
		"Bass split A",
		"Bass split B",
		"Upper left thumb",
		"Right thumb",
		"Right index A",
		"Right index B",
	],
}

worlds[manjaninWorld.id] = manjaninWorld
worlds[ngonWorld.id] = ngonWorld
worlds[manjanin2World.id] = manjanin2World
worlds[wolosoWorld.id] = wolosoWorld
worlds[kotekanWorld.id] = kotekanWorld

// Explicit performance arrangements: these groups choose existing compatible
// cell tuples and never synthesize new attacks or change foundation rows.
const legacyEvolution: Record<string, { rows: number[]; choices: number[][] }[]> = {
 "horn-relay": [{ rows: [3], choices: [[0],[1],[2]] }, { rows: [4], choices: [[0],[1],[2]] }, { rows: [5], choices: [[0],[1],[2]] }],
 "amadinda-ndyegulira": [{ rows: [0,1], choices: [[0,0],[1,1],[2,2]] }],
 "amadinda-ssematimba": [{ rows: [0,1], choices: [[0,0],[1,1],[2,2]] }],
 "mbira-chakwi": [{ rows: [4,5], choices: [[0,0],[1,1],[2,2]] }],
 manjanin: [{ rows: [4,5], choices: [[0,0],[1,1],[2,2]] }],
 ngon: [{ rows: [4,5], choices: [[0,0],[1,1],[2,2]] }],
}
for (const world of Object.values(worlds)) {
 world.pulsesPerBeat ??= 3
 world.performanceBeatBasis ??= ["manjanin", "ngon"].includes(world.id)
  ? "Three design pulses per documented beat; uneven onsets retained."
  : "Three design pulses per performance beat: workshop grouping, not a traditional-meter claim."
 world.recommendationBasis ??= world.recommendedTuning.endsWith("-model")
  ? "Idealized degree-count model; not measured source intonation."
  : "Workshop recommendation for this arrangement; not a traditional tuning claim."
 world.evolutionGroups ??= legacyEvolution[world.id] ?? []
 world.foundationRows ??= [0,1,2,3,4,5].filter(row => !world.evolutionGroups!.some(group => group.rows.includes(row)))
}

// Existing horn tuning maps remain byte-for-byte musically unchanged. For
// melodic source parts, ordinal degrees are rescaled into the selected system.
// These are declared retunings: no source recording's measured tuning is claimed.
export function eventHz(
	tuning: Tuning,
	voice: number,
	event: CellEvent,
	world: World,
	rootMultiplier: number,
): number {
	let hz: number
 if (tuning.startsWith("hotelier-")) {
  const id = tuning.slice(9), table = hotelier.tables.find(t => t.id === id)!
  const n = table.cents.length
  const rank = event.pitchStep === undefined
   ? horn.tunings.tritave.voiceSteps[voice] / horn.tunings.tritave.divisions
   : event.pitchStep / world.degreeCount
  hz = hotelierKeyHz(id, hotelier.anchorKey - 2 * n + Math.round(rank * n))
 } else if (event.pitchStep === undefined) {
		if (tuning === "pentatonic-model" || tuning === "heptatonic-model")
			hz = 82 * 2 ** (voice / (tuning === "pentatonic-model" ? 5 : 7))
		else {
			const t = horn.tunings[tuning as keyof typeof horn.tunings]
			hz =
				"voiceSteps" in t
					? t.rootHz * t.periodRatio ** (t.voiceSteps[voice] / t.divisions)
					: t.voiceHz[voice]
		}
	} else {
		const rank = event.pitchStep / world.degreeCount
		if (tuning === "tritave") hz = 82 * 3 ** (Math.round(rank * 13) / 13)
		else if (tuning === "pentatonic-model" || tuning === "heptatonic-model") {
			const n = tuning === "pentatonic-model" ? 5 : 7
			hz = 82 * 2 ** (Math.round(rank * n) / n)
		} else {
			const hzValues = horn.tunings[tuning as "beating" | "source"].voiceHz,
				root = hzValues[0]
			const ratios = [
				...new Set(
					hzValues.map((h) => h / root / 2 ** Math.floor(Math.log2(h / root))),
				),
			].sort((a, b) => a - b)
			const index = Math.round(rank * ratios.length),
				degree = ((index % ratios.length) + ratios.length) % ratios.length
			hz = root * ratios[degree] * 2 ** Math.floor(index / ratios.length)
		}
	}
	return hz * rootMultiplier * 2 ** (event.pitchOffsetCents / 1200)
}
