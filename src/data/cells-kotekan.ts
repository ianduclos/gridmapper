import type { Cell, CellEvent, World } from "./cells-hot-worlds.js"

const source =
	"Michael Tenzer (2000), Theory and Analysis of Melody in Balinese Gamelan, Example 1 and §§3.1–3.12. https://mtosmt.org/classic/mto.00.6.2/mto.6.2.tenzer.html"
// Example 1 solfege e-o-I-A | I-U-A-I, expressed relative to final I.
export const pelayonNeliti = [2, 1, 0, -1, 0, -2, -1, 0]
// Example 1's upper Pelayon realization, read as scale steps. Alternating
// attacks are a software split of the printed composite kotekan staff.
export const pelayonComposite = [
	1, 0, 1, 0, 1, 1, 2, 1, 2, 1, 2, 1, -1, -1, 0, -1, 0, -1, 0, -1, -2, -2, -1,
	-2, -1, -2, -1, -2, 0, 0, 1, 0,
]

function event(
	atPulse: number,
	token: string,
	pitchStep: number,
	gain: number,
	durationPulses: number,
): CellEvent {
	return {
		atPulse,
		sourceToken: token,
		pitchStep: pitchStep + 7,
		gain,
		durationPulses,
		pitchOffsetCents: 0,
	}
}
function cell(
	row: number,
	choice: number,
	name: string,
	events: CellEvent[],
	note: string,
): Cell {
	return {
		id: `kotekan-${row}-${choice}`,
		name,
		lengthPulses: 32,
		events,
		provenance: {
			kind: choice === 0 ? "source-derived-arrangement" : "filtered-adaptation",
			source,
			note,
			adaptation:
				"The source prints a composite kotekan, not separate polos/sangsih parts. Alternating attacks are explicitly a software allocation. Gains, durations and octave/register placement are designed.",
		},
	}
}
const kotekan = (parity: number) =>
	pelayonComposite.flatMap((degree, pulse) =>
		pulse % 2 === parity
			? [
					event(
						pulse,
						parity ? "interlock:B" : "interlock:A",
						degree,
						0.42,
						0.7,
					),
				]
			: [],
	)
const slow = pelayonNeliti.map((degree, beat) =>
	event(beat * 4, `neliti:${beat + 1}`, degree, 0.56, 2.6),
)
const pokok = [1, -1, -2, 0].map((degree, i) =>
	event((i * 2 + 1) * 4, `pokok:${i + 1}`, degree, 0.48, 3.2),
)
const jegogan = [
	event(12, "jegogan:midpoint", -1, 0.7, 5.5),
	event(28, "jegogan:final", 0, 0.7, 5.5),
]
const gong = [event(28, "gong:arrival", 0, 0.82, 7)]
const sourceRows = [kotekan(0), kotekan(1), slow, pokok, jegogan, gong]
const half = (events: CellEvent[], n: 0 | 1) =>
	events
		.filter((e) => e.atPulse >= n * 16 && e.atPulse < (n + 1) * 16)
		.map((e) => ({ ...e, atPulse: e.atPulse - n * 16 }))
const cells = sourceRows.map((events, row) => [
	cell(
		row,
		0,
		"Pelayon source layer",
		events,
		"Preserves the printed eight-beat cyclic layer and its arrival toward gong.",
	),
	{
		...cell(
			row,
			1,
			"Opening four beats",
			half(events, 0),
			row === 5
				? "The printed gong occurs only at the cycle's final beat, outside this excerpt. This empty cell is a source-derived structural rest, not placeholder material."
				: "First four-beat source excerpt looped as an adaptation.",
		),
		lengthPulses: 16,
	},
	{
		...cell(
			row,
			2,
			"Closing four beats",
			half(events, 1),
			"Last four-beat source excerpt looped as an adaptation.",
		),
		lengthPulses: 16,
	},
])

type EvolutionWorld = World & {
	pulsesPerBeat: number
	recommendationBasis: string
	evolutionGroups: { rows: number[]; choices: number[][] }[]
}
export const kotekanWorld: World = {
	id: "kotekan",
	name: "Pelayon — kotekan and gong cycle",
	degreeCount: 5,
	cells,
	presets: [
		[0, 0, 0, 0, 0, 0],
		[1, 1, 0, 0, 0, 0],
		[2, 2, 0, 0, 0, 0],
	],
	presetNames: [
		"Full Pelayon strata",
		"Opening interlock",
		"Closing interlock",
	],
	recommendedTuning: "pentatonic-model",
	source,
	roles: [
		"Interlock A",
		"Interlock B",
		"Neliti",
		"Pokok",
		"Jegogan",
		"Gong arrival",
	],
	pulsesPerBeat: 4,
	performanceBeatBasis:
		"Example 1 prints four kotekan tones per beat over an eight-beat melody, with midpoint at pulse 12 and gong arrival at pulse 28.",
	recommendationBasis:
		"The pentatonic model matches the source's five ordered pelog scale degrees while remaining an idealized tuning rather than a measurement of this gamelan.",
	pairedParts: [[0, 1]],
	foundationRows: [2, 3, 4, 5],
	evolutionGroups: [
		{
			rows: [0, 1],
			choices: [
				[0, 0],
				[1, 1],
				[2, 2],
			],
		},
	],
} satisfies EvolutionWorld
