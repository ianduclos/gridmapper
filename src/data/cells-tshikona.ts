import type { Cell, CellEvent, World } from "./cells-hot-worlds.js"

// Source: Andrew Tracey & Laina Gumboreshumba, "Transcribing the Venda tshikona
// reedpipe dance", African Music (Journal of the International Library of
// African Music) 9(3), 2013, pp.25–39. Open access:
// https://journal.ru.ac.za/index.php/africanmusic/article/view/1909
// See docs/cells-research-tshikona.md for what was read where.
const source =
	"Andrew Tracey & Laina Gumboreshumba (2013), Transcribing the Venda tshikona reedpipe dance, African Music 9(3): figs.2, 5, 10, 11 and pp.29–34. https://journal.ru.ac.za/index.php/africanmusic/article/view/1909"

/**
 * Figure 5 (p.31), "the unison rhythm pattern of the tshikona pipes", verbatim:
 * 12-pulse cycle numbered 1..12 from thungwa 1. At each onset two pipes sound
 * together: `large` = the starting scale (large numbers / white notes in
 * fig.2), `small` = the secondary scale (small numbers / black notes).
 * Pulse 9.5 is printed ("Pipes 7 and 4 play between pulses 9 and 10").
 * Cross-checked note-for-note against fig.2 (p.25) and fig.10 (p.35).
 */
export const tshikonaFigure5 = [
	{ pulse: 1, large: 2, small: 6 },
	{ pulse: 3, large: 3, small: 7 },
	{ pulse: 5, large: 4, small: 1 },
	{ pulse: 7, large: 5, small: 2 },
	{ pulse: 8, large: 6, small: 3 },
	{ pulse: 9.5, large: 7, small: 4 },
	{ pulse: 11, large: 1, small: 5 },
] as const

/**
 * The two alternative readings of the "hazy" second half described in the text
 * (p.33) and marked with small black notes in fig.10. Keyed by the fig.5 pulse
 * they replace; unlisted onsets are unchanged.
 * A) "four equal beats of 1½ pulses each (on 7 8½ 10 11½)".
 * B) "two double strokes, on pulses 7 - 8 and 10 - 11".
 */
export const tshikonaReadingA: Record<number, number> = { 7: 7, 8: 8.5, 9.5: 10, 11: 11.5 }
export const tshikonaReadingB: Record<number, number> = { 7: 7, 8: 8, 9.5: 10, 11: 11 }

/** Fig.11 / p.28: pipes numbered 1..7 descend the heptatonic scale; Pipe 1 is highest. */
export const tshikonaPipeStep = (pipe: number) => 7 - pipe

/** Design grid: two design pulses per source pulse, so the printed half-pulse is an integer. */
export const HALF = 2
const toDesign = (pulse: number) => (pulse - 1) * HALF
const REGISTER = 7

type Reading = 0 | 1 | 2
const readingOf = (pulse: number, r: Reading) =>
	r === 0 ? pulse : ((r === 1 ? tshikonaReadingA : tshikonaReadingB)[pulse] ?? pulse)

/** Every attack of one pipe in one reading, as design-pulse events. */
function pipeEvents(pipe: number, r: Reading): CellEvent[] {
	return tshikonaFigure5.flatMap((onset) => {
		const scale = onset.large === pipe ? "large" : onset.small === pipe ? "small" : null
		if (!scale) return []
		return [
			{
				atPulse: toDesign(readingOf(onset.pulse, r)),
				durationPulses: 1.6,
				gain: 0.45,
				pitchOffsetCents: 0,
				pitchStep: tshikonaPipeStep(pipe) + REGISTER,
				sourceToken: `pipe${pipe}:${scale}`,
			},
		]
	})
}

// Six rows for seven pipes: Pipes 7 and 1 share row 0 (they never sound
// together, and 7 → 1 is the turnaround of the descending scale). Rows 1–5 are
// Pipes 2–6, one pipe (one pitch) each. This allocation is a workshop choice.
export const tshikonaRowPipes = [[1, 7], [2], [3], [4], [5], [6]]
const choiceNames = [
	"Fig.5 reading (half-pulse Pipe 7/4)",
	"Reading A: equal 1½-pulse beats",
	"Reading B: double strokes 7-8, 10-11",
]
const choiceNotes = [
	"Onsets and pipe pairings exactly as printed in fig.5 (cross-checked with figs.2 and 10), including the half-pulse 9½ that the authors argue for.",
	"Alternative reading A (p.33; fig.10 small black notes): the second half as four equal 1½-pulse beats on 7, 8½, 10, 11½. The authors considered and rejected it as their main reading. Fig.10 draws no alternative for Pipe 5; moving its pulse-11 note to 11½ with Pipe 1 follows the text's rule that two pipes always sound together (p.29), an inference.",
	"Alternative reading B (p.33; fig.10 small black notes): double strokes on 7-8 and 10-11, i.e. Pipes 7 and 4 on pulse 10 instead of 9½. The authors hear it sometimes but reject it as their main reading.",
]
const cells: Cell[][] = tshikonaRowPipes.map((pipes, row) =>
	([0, 1, 2] as Reading[]).map((r) => ({
		id: `tshikona-${row}-${r}`,
		name: choiceNames[r],
		lengthPulses: 12 * HALF,
		events: pipes
			.flatMap((pipe) => pipeEvents(pipe, r))
			.sort((a, b) => a.atPulse - b.atPulse),
		provenance: {
			kind: r === 0 ? "source-derived-arrangement" : "source-described-alternative",
			source,
			note: choiceNotes[r],
			adaptation:
				"Seven pipes on six rows (Pipes 7 and 1 share row 0). Each row sounds the printed one-octave pitch of its pipe; the real ensemble doubles every pipe in about four octaves. Drums (thungwa, murumba, ngoma), dance, durations, gains and register are not encoded or are designed.",
		},
	})),
)

type EvolutionWorld = World & {
	pulsesPerBeat: number
	recommendationBasis: string
	evolutionGroups: { rows: number[]; choices: number[][] }[]
}
export const tshikonaWorld: World = {
	id: "tshikona",
	name: "Tshikona — Venda reedpipe song",
	degreeCount: 7,
	cells,
	presets: [
		[0, 0, 0, 0, 0, 0],
		[1, 1, 1, 1, 1, 1],
		[2, 2, 2, 2, 2, 2],
	],
	presetNames: ["Tracey fig.5 reading", "Reading A (equal beats)", "Reading B (double strokes)"],
	recommendedTuning: "heptatonic-model",
	source,
	roles: [
		"Pipes 1 + 7 (turnaround)",
		"Pipe 2",
		"Pipe 3",
		"Pipe 4",
		"Pipe 5",
		"Pipe 6",
	],
	pulsesPerBeat: 3 * HALF,
	performanceBeatBasis:
		"Fig.2 prints a 12-pulse cycle with the thungwa drum on every third pulse (average 90 MM); one performance beat = one thungwa beat = three source pulses = six half-pulse design pulses, so the printed 9½ is an integer.",
	recommendationBasis:
		"Fig.11 tunings are heptatonic, and the text (p.28) notes the Sundani group's intervals cluster near 171.4 cents, the equiheptatonic step; the seven-tone model is that idealization, not any group's measured tuning.",
	foundationRows: [1],
	evolutionGroups: [
		{
			rows: [0, 2, 3, 4, 5],
			choices: [
				[0, 0, 0, 0, 0],
				[1, 1, 1, 1, 1],
				[2, 2, 2, 2, 2],
			],
		},
	],
	context:
		"Tshikona is the Venda reedpipe dance of Limpopo, South Africa, in which each player blows a single pitch and seven pipes hocket one 12-pulse song, adapted here from Andrew Tracey and Laina Gumboreshumba's 2013 transcription (figures 2, 5 and 10). Two pipes always sound together, tracing two parallel descending scales a fourth/fifth apart; rows 1–5 are Pipes 2–6 and row 0 carries both Pipe 1 and Pipe 7, which never coincide. Listen for four even two-pulse notes, then the squeezed second half with Pipes 7 and 4 on the half-pulse before thungwa. The alternative choices are the two readings the authors describe and set aside, not traditional variants; pitches are one printed octave, not the four-octave ensemble.",
	ensembleNotes: [
		"All seven pipes as printed in fig.5, including the half-pulse 9½ placement the authors settle on.",
		"The authors' alternative reading A: pulses 7, 8½, 10, 11½ as four equal beats. Considered and set aside in the article.",
		"The authors' alternative reading B: double strokes on 7-8 and 10-11, moving Pipes 7 and 4 to pulse 10. Considered and set aside in the article.",
	],
} satisfies EvolutionWorld
