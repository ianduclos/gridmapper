import type { Cell, CellEvent, World } from "./cells-hot-worlds.js"

const source =
	"Rainer Polak (2010), Rhythmic Feel as Meter, §§123–132, Video 2, Tables 19–20. https://www.mtosmt.org/issues/mto.10.16.4/mto.10.16.4.polak.html"
const adaptation =
	"Pitch, gain, duration and the six-row timbral allocation are workshop designs; the attack tokens and Cycle 8 positions come from Tables 19–20."

export const wolosoCycle8 = {
	lead: [
		".",
		".",
		".",
		"T",
		"T",
		"S",
		"T",
		"T",
		"S",
		"S",
		"S",
		".",
		".",
		".",
		".",
		".",
		".",
		"B",
		"B",
		"B",
		"S",
		"S",
		"S",
		".",
	],
	second: [
		"T",
		".",
		"S",
		"B",
		".",
		"S",
		"T",
		".",
		"S",
		"B",
		".",
		"S",
		"T",
		".",
		"S",
		"B",
		".",
		"S",
		"T",
		".",
		"S",
		"B",
		".",
		"S",
	],
	// Table 19 motif. Table 20 prints a distinct dunun variant; see source note.
	dunun: [
		"O",
		".",
		".",
		"O",
		".",
		"O",
		".",
		".",
		".",
		"X",
		".",
		"O",
		"O",
		".",
		"O",
		".",
		".",
		"X",
		".",
		".",
		"X",
		".",
		".",
		"O",
	],
} as const

const ternaryAt = (pulse: number) =>
	Math.floor(pulse / 3) * 3 + [0, 0.75, 1.74][pulse % 3]
const binaryAt = (pulse: number) =>
	Math.floor(pulse / 3) * 3 + (pulse % 3 === 0 ? 0 : 1.74)

function hit(atPulse: number, token: string, pitchStep: number): CellEvent {
	const stroke = token.at(-1)
	return {
		atPulse,
		sourceToken: token,
		pitchStep,
		gain: stroke === "B" ? 0.58 : stroke === "O" ? 0.48 : 0.38,
		durationPulses: stroke === "B" || stroke === "O" ? 1.1 : 0.55,
		pitchOffsetCents: 0,
	}
}
function attacks(
	pattern: readonly string[],
	prefix: string,
	accept: (stroke: string) => boolean,
	basePitch: number,
	warp: (pulse: number) => number,
): CellEvent[] {
	return pattern.flatMap((stroke, pulse) =>
		stroke !== "." && accept(stroke)
			? [
					hit(
						warp(pulse),
						`${prefix}:${stroke}`,
						basePitch + ({ O: 0, X: 2, B: 0, T: 3, S: 5 }[stroke] ?? 0),
					),
				]
			: [],
	)
}
function excerpt(events: CellEvent[], half: 0 | 1): CellEvent[] {
	const start = half * 12
	return events
		.filter((e) => e.atPulse >= start && e.atPulse < start + 12)
		.map((e) => ({ ...e, atPulse: e.atPulse - start }))
}
function makeCell(
	row: number,
	choice: number,
	name: string,
	lengthPulses: number,
	events: CellEvent[],
	note: string,
): Cell {
	return {
		id: `woloso-${row}-${choice}`,
		name,
		lengthPulses,
		events,
		provenance: {
			kind: choice === 0 ? "source-derived" : "excerpt-loop-adaptation",
			source,
			note,
			adaptation,
			timing:
				"Lead uses 25:33:42 ternary landmarks (0, .75, 1.74); second jembe and dunun use the nested 58:42 binary offbeat at 1.74.",
		},
	}
}

const full = [
	attacks(wolosoCycle8.dunun, "Dunun", (s) => s === "O", 0, binaryAt),
	attacks(wolosoCycle8.dunun, "Dunun", (s) => s === "X", 3, binaryAt),
	attacks(
		wolosoCycle8.second,
		"J2",
		(s) => s === "B" || s === "T",
		5,
		binaryAt,
	),
	attacks(wolosoCycle8.second, "J2", (s) => s === "S", 9, binaryAt),
	attacks(
		wolosoCycle8.lead,
		"Lead",
		(s) => s === "B" || s === "T",
		7,
		ternaryAt,
	),
	attacks(wolosoCycle8.lead, "Lead", (s) => s === "S", 12, ternaryAt),
]
const cells = full.map((events, row) => [
	makeCell(
		row,
		0,
		"Cycle 8",
		24,
		events,
		"Attack positions visually transcribed from the corresponding row of Tables 19–20.",
	),
	makeCell(
		row,
		1,
		"Cycle 8 · opening",
		12,
		excerpt(events, 0),
		"First four-beat source excerpt looped as a deliberate adaptation.",
	),
	row < 4
		? makeCell(
				row,
				2,
				"Alternate beats",
				24,
				events.filter((e) => Math.floor(e.atPulse / 3) % 2 === 0),
				"Every other source beat retained as a disclosed thinning adaptation.",
			)
		: makeCell(
				row,
				2,
				"Cycle 8 · closing",
				12,
				excerpt(events, 1),
				"Last four-beat source excerpt looped as a deliberate adaptation.",
			),
])

type EvolutionWorld = World & {
	pulsesPerBeat: number
	recommendationBasis: string
	evolutionGroups: { rows: number[]; choices: number[][] }[]
}
export const wolosoWorld: World = {
	id: "woloso",
	name: "Woloso-dòn — nested binary / ternary",
	degreeCount: 7,
	cells,
	presets: [
		[0, 0, 0, 0, 0, 0],
		[0, 0, 0, 0, 1, 1],
		[0, 0, 0, 0, 2, 2],
	],
	presetNames: [
		"Cycle 8 ensemble",
		"Opening lead excerpt",
		"Closing lead excerpt",
	],
	recommendedTuning: "heptatonic-model",
	source,
	roles: [
		"Dunun · open",
		"Dunun · muted",
		"Second jembe · bass/tone",
		"Second jembe · slap",
		"Lead · bass/tone",
		"Lead · slap",
	],
	pulsesPerBeat: 3,
	performanceBeatBasis:
		"Cycle 8 nests 58:42 binary accompaniment within the 24-position ternary reference grid; lead follows 25:33:42.",
	recommendationBasis:
		"The source supplies drum timbres but no melodic pitches; the seven-tone model keeps the designed pitch labels ordinal and explicitly non-transcriptive.",
	pairedParts: [
		[0, 1],
		[2, 3],
		[4, 5],
	],
	foundationRows: [0, 1, 2, 3],
	evolutionGroups: [
		{
			rows: [4, 5],
			choices: [
				[0, 0],
				[1, 1],
				[2, 2],
			],
		},
	],
} satisfies EvolutionWorld
