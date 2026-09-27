import type { Cell, CellEvent, World } from "./cells-hot-worlds.js"

// Sikuri metropolitano (Lima, November 2020): two huaynos transcribed by
// Francisco Javier Serrano Finetti, with the maltas' ira/arka tuning in his
// Figure 1. See docs/cells-research-sikuri.md for what was read and how.
const source =
	"Francisco Javier Serrano Finetti (2022), La presencia del sikuri metropolitano en las protestas de noviembre del 2020 y dos de sus melodías, Kaylla 1: 97–110, fig.1 (tuning of the 27.5 cm maltas), fig.2 (“Mariátegui”, p.105), fig.3 (“Caballero”, p.107). https://doi.org/10.18800/kaylla.202201.005"

/**
 * Figure 1, read low to high. The text says the pipes rise from right to left,
 * so the right-hand circles (Mib arka, Fa ira) are the lowest; footnote 3 puts
 * the lowest pipe at Eb4. The two rows interleave in thirds into one 13-pipe
 * Eb-mixolydian ladder, so every printed pitch belongs to exactly one row.
 * Index = pipe number from the bottom; even = arka, odd = ira.
 */
export const sikuLadder = [
	{ pitch: "Eb4", row: "arka" },
	{ pitch: "F4", row: "ira" },
	{ pitch: "G4", row: "arka" },
	{ pitch: "Ab4", row: "ira" },
	{ pitch: "Bb4", row: "arka" },
	{ pitch: "C5", row: "ira" },
	{ pitch: "Db5", row: "arka" },
	{ pitch: "Eb5", row: "ira" },
	{ pitch: "F5", row: "arka" },
	{ pitch: "G5", row: "ira" },
	{ pitch: "Ab5", row: "arka" },
	{ pitch: "Bb5", row: "ira" },
	{ pitch: "C6", row: "arka" },
] as const
export type SikuPitch = (typeof sikuLadder)[number]["pitch"]
export const pipeIndex = (pitch: SikuPitch) =>
	sikuLadder.findIndex((pipe) => pipe.pitch === pitch)
export const sikuRow = (pitch: SikuPitch) => sikuLadder[pipeIndex(pitch)].row

/** A printed melody attack: sixteenth-note onset, tied length in sixteenths. */
export type PrintedNote = { at: number; dur: number; pitch: SikuPitch }
/** A printed bombo attack: ">" accent, plain, or the slashed notehead of fig.3. */
export type PrintedStroke = { at: number; stroke: "accent" | "plain" | "slash" }

const n = (at: number, dur: number, pitch: SikuPitch): PrintedNote => ({
	at,
	dur,
	pitch,
})
const shift = <T extends { at: number }>(events: T[], by: number): T[] =>
	events.map((e) => ({ ...e, at: e.at + by }))

// ---- Figure 2, "Mariátegui", ♩=70: the repeated A section, bars 1–6
// (3/4 3/4 1/4 3/4 3/4 2/4 = 15 quarter beats = 60 sixteenths).
const mariBar1 = [
	n(0, 1, "C5"),
	n(1, 2, "F5"),
	n(3, 1, "F5"),
	n(4, 2, "F5"),
	n(6, 1, "Eb5"),
	n(7, 2, "C5"), // tied across the beat
	n(9, 1, "C5"),
	n(10, 2, "Bb4"),
]
export const mariateguiA: PrintedNote[] = [
	...mariBar1,
	// bar 2
	n(12, 4, "Ab4"),
	n(16, 2, "F5"),
	n(18, 1, "Eb5"),
	n(19, 2, "F5"), // tied
	n(21, 1, "G5"),
	n(22, 3, "Ab5"), // tied into the 1/4 bar
	// bar 3 (1/4)
	n(25, 3, "C5"),
	// bar 4 repeats bar 1
	...shift(mariBar1, 28),
	// bar 5
	n(40, 4, "Ab4"),
	n(44, 2, "F4"),
	n(46, 1, "Eb4"),
	n(47, 2, "F4"), // tied
	n(49, 1, "G4"),
	n(50, 1, "Ab4"),
	n(51, 1, "G4"),
	// bar 6 (2/4), marked "Repique"
	n(52, 1, "F4"),
	n(53, 1, "F5"),
	n(54, 1, "C5"),
	n(55, 1, "F5"),
	n(56, 1, "C5"),
	n(57, 1, "F5"),
	n(58, 1, "C5"),
	n(59, 1, "F5"),
]
const s = (at: number, stroke: PrintedStroke["stroke"]): PrintedStroke => ({
	at,
	stroke,
})
const mariBombo1 = [
	s(0, "accent"),
	s(2, "accent"),
	s(4, "accent"),
	s(6, "plain"),
	s(8, "plain"),
	s(10, "plain"),
]
export const mariateguiBombo: PrintedStroke[] = [
	...mariBombo1,
	s(12, "accent"),
	s(16, "accent"),
	s(18, "plain"),
	s(20, "plain"),
	s(22, "plain"),
	s(24, "accent"),
	...shift(mariBombo1, 28),
	s(40, "accent"),
	s(44, "accent"),
	s(46, "plain"),
	s(48, "plain"),
	s(50, "plain"),
	s(52, "accent"),
	s(54, "plain"),
	s(56, "plain"),
	s(58, "plain"),
]

// ---- Figure 3, "Caballero", ♩=61. Bars are 4/4 3/4 4/4 4/4 = 15 beats.
// A = bars 1–4; B = bars 5–8 (first ending), which print bar 3, bar 2,
// bar 3, bar 4 again under new words.
const cabBar1 = [
	n(0, 1, "C5"),
	n(1, 2, "F5"),
	n(3, 1, "F5"),
	n(4, 2, "F5"),
	n(6, 1, "F5"),
	n(7, 2, "Eb5"), // tied
	n(9, 2, "Db5"),
	n(11, 2, "F5"),
	n(13, 2, "C5"), // then a sixteenth rest
]
const cabBar2 = [
	n(0, 1, "F5"),
	n(1, 2, "G5"),
	n(3, 2, "Ab5"), // tied
	n(5, 2, "Ab5"),
	n(7, 2, "F5"), // tied
	n(9, 3, "C5"),
]
const cabBar3 = [
	n(0, 1, "Ab4"),
	n(1, 2, "C5"),
	n(3, 1, "C5"),
	n(4, 2, "C5"),
	n(6, 1, "C5"),
	n(7, 2, "Bb4"), // tied
	n(9, 2, "G4"),
	n(11, 2, "Bb4"),
	n(13, 2, "Ab4"), // then a sixteenth rest
]
const cabBar4 = [
	n(0, 1, "F4"),
	n(1, 2, "G4"),
	n(3, 2, "Ab4"), // tied
	n(5, 1, "Bb4"),
	n(6, 2, "Ab4"),
	// "Repique", as in Mariátegui bar 6
	n(8, 1, "F4"),
	n(9, 1, "F5"),
	n(10, 1, "C5"),
	n(11, 1, "F5"),
	n(12, 1, "C5"),
	n(13, 1, "F5"),
	n(14, 1, "C5"),
	n(15, 1, "F5"),
]
export const caballeroA: PrintedNote[] = [
	...cabBar1,
	...shift(cabBar2, 16),
	...shift(cabBar3, 28),
	...shift(cabBar4, 44),
]
export const caballeroB: PrintedNote[] = [
	...cabBar3,
	...shift(cabBar2, 16),
	...shift(cabBar3, 28),
	...shift(cabBar4, 44),
]
// Bombo bars 1, 3, 5 and 7 print the same pattern, so A and B share it.
const cabBomboFour = [
	s(0, "accent"),
	s(2, "plain"),
	s(4, "plain"),
	s(6, "plain"),
	s(8, "slash"),
	s(10, "slash"),
	s(12, "accent"),
]
export const caballeroBombo: PrintedStroke[] = [
	...cabBomboFour,
	s(16, "accent"),
	s(18, "plain"),
	s(20, "plain"),
	s(22, "plain"),
	s(24, "accent"),
	s(26, "slash"),
	...shift(cabBomboFour, 28),
	s(44, "accent"),
	s(46, "plain"),
	s(48, "plain"),
	s(50, "slash"),
	s(52, "accent"),
	s(54, "plain"),
	s(56, "plain"),
	s(58, "slash"),
]

export const sikuriTunes = [
	{ name: "Mariátegui A", notes: mariateguiA, bombo: mariateguiBombo },
	{ name: "Caballero A", notes: caballeroA, bombo: caballeroBombo },
	{ name: "Caballero B", notes: caballeroB, bombo: caballeroBombo },
] as const

// ---- Cells. pitchStep = pipe index + 7 for the maltas and the bare pipe
// index for the sanqa an octave below; seven pipes make an octave.
const LENGTH = 60
const MALTA = 7
const adaptation =
	"The ira/arka split is derived here from fig.1's tuning, not printed in the score; the staff carries the sung words and the author calls that line similar to what the sikus play. Six-row allocation, the sanqa octave doubling, dividing the one bombo line into two rows, gains and 0.9× articulation of the printed lengths are workshop designs."

function cell(row: number, choice: number, name: string, events: CellEvent[], note: string): Cell {
	return {
		id: `sikuri-${row}-${choice}`,
		name,
		lengthPulses: LENGTH,
		events,
		provenance: {
			kind: "source-derived-arrangement",
			source,
			note,
			adaptation,
		},
	}
}
const melodic = (
	notes: readonly PrintedNote[],
	row: "ira" | "arka",
	octave: number,
	gain: number,
	tag: string,
): CellEvent[] =>
	notes
		.filter((note) => sikuRow(note.pitch) === row)
		.map((note) => ({
			atPulse: note.at,
			sourceToken: `${tag}:${row}:${note.pitch}`,
			pitchStep: pipeIndex(note.pitch) + octave,
			gain,
			durationPulses: note.dur * 0.9,
			pitchOffsetCents: 0,
		}))
const drum = (strokes: readonly PrintedStroke[], keep: (s: PrintedStroke) => boolean): CellEvent[] =>
	strokes.filter(keep).map((stroke) => ({
		atPulse: stroke.at,
		sourceToken: `bombo:${stroke.stroke}`,
		pitchStep: 0,
		gain: stroke.stroke === "accent" ? 0.72 : stroke.stroke === "plain" ? 0.46 : 0.3,
		durationPulses: 1.6,
		pitchOffsetCents: 0,
	}))

const rowSpecs = [
	(t: (typeof sikuriTunes)[number]) => melodic(t.notes, "ira", MALTA, 0.5, "malta"),
	(t: (typeof sikuriTunes)[number]) => melodic(t.notes, "arka", MALTA, 0.5, "malta"),
	(t: (typeof sikuriTunes)[number]) => melodic(t.notes, "ira", 0, 0.38, "sanqa"),
	(t: (typeof sikuriTunes)[number]) => melodic(t.notes, "arka", 0, 0.38, "sanqa"),
	(t: (typeof sikuriTunes)[number]) => drum(t.bombo, (s) => s.stroke === "accent"),
	(t: (typeof sikuriTunes)[number]) => drum(t.bombo, (s) => s.stroke !== "accent"),
]
const rowNotes = [
	"Malta ira: the printed pitches that fall on fig.1's ira row.",
	"Malta arka: the printed pitches that fall on fig.1's arka row.",
	"Sanqa ira, an octave below the malta. The article says sanqa, malta and chili sizes are tuned in octaves; this doubling is not printed in the score.",
	"Sanqa arka, an octave below the malta; arranged doubling, as for the ira row.",
	"Bombo strokes printed with an accent (>).",
	"Bombo strokes printed without an accent, plus fig.3's slashed noteheads, which the article does not explain. Its footnote 13 says bomberos often mark unaccented eighths silently, so muting this row is a source-sanctioned thinning.",
]
const cells: Cell[][] = rowSpecs.map((events, row) =>
	sikuriTunes.map((tune, choice) =>
		cell(row, choice, tune.name, events(tune), `${tune.name}. ${rowNotes[row]}`),
	),
)

type EvolutionWorld = World & {
	pulsesPerBeat: number
	recommendationBasis: string
	evolutionGroups: { rows: number[]; choices: number[][] }[]
}
export const sikuriWorld: World = {
	id: "sikuri",
	name: "Sikuri — ira/arka hocket (Lima 2020)",
	degreeCount: 7,
	cells,
	presets: [
		[0, 0, 0, 0, 0, 0],
		[1, 1, 1, 1, 1, 1],
		[2, 2, 2, 2, 2, 2],
	],
	presetNames: ["Mariátegui A", "Caballero A", "Caballero B"],
	recommendedTuning: "heptatonic-model",
	source,
	roles: [
		"Malta ira",
		"Malta arka",
		"Sanqa ira (8vb)",
		"Sanqa arka (8vb)",
		"Bombo accents",
		"Bombo fill",
	],
	pulsesPerBeat: 4,
	performanceBeatBasis:
		"Both scores print sixteenth notes against a quarter-note beat (♩=70 and ♩=61); each excerpt is 15 quarter beats across mixed 3/4, 4/4, 2/4 and 1/4 bars.",
	recommendationBasis:
		"The siku's 13 pipes form a seven-pitch-class ladder (fig.1), so the seven-tone model keeps pipe order and octave. It is idealized equal spacing, not the measured tuning of these maltas.",
	pairedParts: [
		[0, 1],
		[2, 3],
		[4, 5],
	],
	foundationRows: [],
	evolutionGroups: [
		{
			rows: [0, 1, 2, 3, 4, 5],
			choices: [
				[0, 0, 0, 0, 0, 0],
				[1, 1, 1, 1, 1, 1],
				[2, 2, 2, 2, 2, 2],
			],
		},
	],
	context:
		"Sikuri is the Andean panpipe practice in which each melody is split between two players, one on the six-pipe ira row and one on the seven-pipe arka row, adapted here from two huaynos transcribed at Lima street protests in November 2020 (Serrano Finetti 2022). Each printed pitch is assigned to ira or arka from the article's own tuning chart for the maltas, then doubled an octave lower as a sanqa pair, over a bombo line split into accented strokes and fill. Listen for the melody passing between the two rows, most plainly in the repique bar where ira and arka alternate on every sixteenth. This is an adaptation of a published transcription of urban sikuri metropolitano, not Conima or other rural Aymara repertoire, and the scores print the sung line, which the author says the sikus follow.",
	ensembleNotes: [
		"Plays the repeated opening of “Mariátegui” (fig.2, bars 1–6), ending in the repique, with its bombo.",
		"Plays the opening verse of “Caballero” (fig.3, bars 1–4) with its bombo, slashed strokes included.",
		"Plays the second verse of “Caballero” (bars 5–8, first ending), which differs from the first only in its opening bar.",
	],
} satisfies EvolutionWorld
