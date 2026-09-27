import type { Cell, CellEvent, World } from "./cells-hot-worlds.js"

// Darmawan, Ardini & Mudana (2020), observed at the Uluwatu kecak (Sanggar
// Karang Boma, Pecatu), 9 Dec 2019. Printed p.70 (PDF page 6), untitled
// notation block between "Pengucapan Ketukan" and the legend box.
const source =
	"I Putu Ikka Darmawan, Ni Wayan Ardini & I Gede Mudana (2020), Kecak Touristic Performance in Uluwatu Temple: Its Aspects of Vocal Karawitan, Jurnal Bali Membangun Bali 1(1), printed p.70 (Pola Cak 3 / Cak 6 / Cak 5, Pengucapan Ketukan, Pola Melodi). https://ejournal.baliprov.go.id/index.php/jbmb/article/download/109/84/249"
const solfegeSource =
	"Tone-name order ding-dong-deng-dung-dang: Michael Tenzer (2000), Theory and Analysis of Melody in Balinese Gamelan, §3.1. https://mtosmt.org/classic/mto.00.6.2/mto.6.2.tenzer.html"
const adaptation =
	"Six-row allocation, alternative choices 2/3, all pitches, gains, durations, melody placement on the pulse grid and the four-pulse beat grouping are workshop designs. Cak is unpitched; any pitch is an assignment, not a transcription."

// Legend: "." = ketukan (Pung), "C" = cak. Strings copied as printed.
export const kecakCak3 = {
	polos: "..C..C.C",
	sangsih: ".C..C.C.",
	sanglot: "C..C.C..",
} as const
// Pola Cak 6 (polos, sangsih) and Pola Cak 5 (penyelah) share one
// repeat-bracketed block on the page.
export const kecakCak6 = {
	polos: "C..C..C..C.C.C..",
	sangsih: ".C..C..C..C.C.C.",
	penyelah: "..C..C..C..C..C.",
} as const
// "Pengucapan Ketukan": eight Pung between repeat signs.
export const kecakPung = ["Pung", "Pung", "Pung", "Pung", "Pung", "Pung", "Pung", "Pung"] as const
// Pola Melodi, all seven lines as printed (syllable letters per the legend:
// B Bug, S Sir, Y Yang, E Nger, U Ngur, O Ngor, A Ngar, I Ngir, 7 Ndur, 3 Ndir).
// The source gives NO rhythmic placement for these syllables.
export const kecakMelodi = {
	awal: ["B", "S", "B", "S"],
	kedua: ["Y", "I", "Y", "U", "Y", "E", "Y", "S"],
	ketiga: ["Y", "O", "Y", "A", "Y", "E", "Y", "S"],
	keempat: ["Y", "E", "Y", "S"],
	kelima: ["Y", "E", "Y", "A", "Y", "O", "Y", "S"],
	keenam: ["Y", "E", "Y", "O", "Y", "E", "Y", "S"],
	ketujuh: ["3", "7", "3", "S"],
} as const
export const kecakSyllables: Record<string, string> = {
	B: "Bug", S: "Sir", Y: "Yang", E: "Nger", U: "Ngur", O: "Ngor", A: "Ngar", I: "Ngir", "7": "Ndur", "3": "Ndir",
}
// DESIGN: a syllable's vowel is read as the Balinese tone name sharing it
// (ding i, dong o, deng e, dung u, dang a → 0..4). The article does not
// say these syllables are pitched; this is our interpretation.
const vowelStep: Record<string, number> = { i: 0, o: 1, e: 2, u: 3, a: 4 }
export const kecakVowelStep = (letter: string) =>
	vowelStep[kecakSyllables[letter].match(/[aeiou]/)![0]]

// Designed register: pung low, entrance/closing lines, melody, cak on top.
const CAK_STEP = [12, 13, 14]
const PUNG_STEP = 0
const SHORT_LINE_BASE = 2
const MELODY_BASE = 7

const onsets = (pattern: string) =>
	[...pattern].flatMap((ch, i) => (ch === "C" ? [i] : []))

function ev(atPulse: number, sourceToken: string, pitchStep: number, gain: number, durationPulses: number): CellEvent {
	return { atPulse, sourceToken, pitchStep, gain, durationPulses, pitchOffsetCents: 0 }
}
function cell(row: number, choice: number, name: string, lengthPulses: number, events: CellEvent[], kind: string, note: string): Cell {
	return {
		id: `kecak-${row}-${choice}`,
		name,
		lengthPulses,
		events,
		provenance: { kind, source, note, adaptation, ...(row >= 4 ? { pitch: solfegeSource } : {}) },
	}
}
const cak = (pattern: string, token: string, row: number, from = 0, to = pattern.length) =>
	onsets(pattern)
		.filter((p) => p >= from && p < to)
		.map((p) => ev(p - from, token, CAK_STEP[row], row === 2 ? 0.38 : 0.42, 0.45))
// Melody placement is DESIGNED: `every` pulses per syllable.
const sung = (line: readonly string[], name: string, base: number, every: number, gain: number) =>
	line.map((letter, i) =>
		ev(i * every, `${name}:${kecakSyllables[letter]}`, base + kecakVowelStep(letter), gain, every * 0.8),
	)

const cakRows = (["polos", "sangsih", "sanglot"] as const).map((part, row) => {
	const six = row === 2 ? "penyelah" : (part as "polos" | "sangsih")
	const token6 = row === 2 ? "cak5:penyelah" : `cak6:${part}`
	return [
		cell(row, 0, `Cak 3 · ${part}`, 8, cak(kecakCak3[part], `cak3:${part}`, row), "source-derived",
			"Onsets copied from the printed Pola Cak 3 line; one C = one attack on its ketukan position."),
		cell(row, 1, row === 2 ? "Cak 5 · penyelah" : `Cak 6 · ${part}`, 16, cak(kecakCak6[six], token6, row), "source-derived",
			row === 2
				? "Pola Cak 5 is printed as the third (penyelah) line of the Cak 6 block; it shares that block's 16 positions and repeat signs."
				: "Onsets copied from the printed Pola Cak 6 line."),
		cell(row, 2, row === 2 ? "Cak 5 · closing half" : `Cak 6 · closing half`, 8, cak(kecakCak6[six], token6, row, 8, 16), "excerpt-loop-adaptation",
			"Positions 8–15 of the printed 16-position line looped as a workshop excerpt; not a separately documented pattern."),
	]
})
const pungRow = [
	cell(3, 0, "Pung · every ketukan", 8, kecakPung.map((_, i) => ev(i, "pung", PUNG_STEP, 0.5, 0.5)), "source-derived",
		"Eight Pung between repeat signs; the legend equates '.' with one ketukan (Pung), read here as one Pung per position of the 8-position Cak 3 cycle."),
	cell(3, 1, "Pung · alternate ketukan", 8, [0, 2, 4, 6].map((p) => ev(p, "pung", PUNG_STEP, 0.5, 0.9)), "filtered-adaptation",
		"Every other printed Pung kept: a disclosed thinning, not a documented variant."),
	cell(3, 2, "Pung · beat marker", 8, [0, 4].map((p) => ev(p, "pung", PUNG_STEP, 0.55, 1.6)), "filtered-adaptation",
		"One Pung per designed four-pulse beat: a disclosed thinning, not a documented variant."),
]
const melodyRow = (["kedua", "ketiga", "kelima"] as const).map((key, choice) =>
	cell(4, choice, `Melodi ${key}`, 16, sung(kecakMelodi[key], `melodi-${key}`, MELODY_BASE, 2, 0.46), "source-syllables-designed-rhythm",
		`Syllable sequence copied from the printed Melodi ${key} line. Placement (one syllable per two pulses, from the cycle start) and vowel-derived pitch are designs; the source prints no rhythm for melody lines.`),
)
const shortRow = (["awal", "keempat", "ketujuh"] as const).map((key, choice) =>
	cell(5, choice, key === "awal" ? "Melodi awal · Bug/Sir" : `Melodi ${key}`, 16, sung(kecakMelodi[key], `melodi-${key}`, SHORT_LINE_BASE, 4, 0.52), "source-syllables-designed-rhythm",
		`Four-syllable line copied from the printed Melodi ${key} line. Placement (one syllable per four pulses) and vowel-derived pitch are designs.`),
)

type EvolutionWorld = World & {
	pulsesPerBeat: number
	recommendationBasis: string
	evolutionGroups: { rows: number[]; choices: number[][] }[]
}
export const kecakWorld: World = {
	id: "kecak",
	name: "Kecak — cak interlock (Uluwatu)",
	degreeCount: 5,
	cells: [...cakRows, pungRow, melodyRow, shortRow],
	presets: [
		[0, 0, 0, 0, 0, 0],
		[1, 1, 1, 0, 1, 1],
		[2, 2, 2, 1, 2, 2],
	],
	presetNames: ["Cak 3", "Cak 6 with cak 5", "Cak 6 closing half"],
	recommendedTuning: "hotelier-pelog",
	source,
	roles: [
		"Cak polos",
		"Cak sangsih",
		"Cak sanglot / penyelah",
		"Pung (ketukan)",
		"Melody line",
		"Entrance / closing line",
	],
	pulsesPerBeat: 4,
	performanceBeatBasis:
		"Each printed position is one ketukan (Pung); grouping four per shared beat is a workshop choice (cak 3 = two beats, cak 6/5 = four), not stated in the source.",
	recommendationBasis:
		"Cak is unpitched; the melody's pitches are our vowel-to-tone-name reading, so a Balinese pelog-type table is a workshop recommendation, not a measured tuning of this performance.",
	pairedParts: [[0, 1, 2]],
	foundationRows: [3, 4, 5],
	evolutionGroups: [
		{
			rows: [0, 1, 2],
			choices: [
				[0, 0, 0],
				[1, 1, 1],
				[2, 2, 2],
			],
		},
	],
	context:
		"Kecak is the Balinese vocal chorus in which dozens of men interlock the syllable \"cak\", adapted here from the notation Darmawan, Ardini and Mudana (2020) made of the tourist kecak at Uluwatu temple. The top three rows are the printed interlocking cak parts — polos, sangsih and sanglot for the eight-position cak 3, and polos, sangsih and the cak-5 penyelah line for the sixteen-position cak 6 — over the printed \"Pung\" pulse and two rows of the printed melody syllables. Listen for three identical off-set parts filling every position of the cycle between them. The cak onsets are source-derived; the melody's rhythm and every pitch are workshop designs, not a transcription.",
	ensembleNotes: [
		"Plays the printed cak 3 in all three parts over the printed Pung, with Melodi kedua and the Bug/Sir entrance line placed by design.",
		"Switches the cak rows to the printed cak 6 polos/sangsih with the cak 5 penyelah line, under Melodi ketiga and Melodi keempat.",
		"Loops only the second half of the cak 6/5 block — a workshop excerpt — over a thinned Pung, Melodi kelima and Melodi ketujuh.",
	],
} satisfies EvolutionWorld
