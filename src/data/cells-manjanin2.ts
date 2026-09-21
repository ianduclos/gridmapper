import type { Cell, CellEvent, World } from "./cells-hot-worlds.js"

const source =
	"Rainer Polak (2010), Rhythmic Feel as Meter, Table 1 cycles 29–32, 65–68 and 165–168. https://www.mtosmt.org/issues/mto.10.16.4/mto.10.16.4.polak.html"
export const manjanin2Lead = [
	[".S.S.S.S..TS", ".S.S.S.S..TS", ".S.S.S.S..TS", "S..BS..BSSTT"],
	[".S.S.S.S..TS", "S....SB.SB.S", "B.SB.SB.S.TT", "TTS..SB.S.TT"],
	["TTTTTTTT..S.", ".S.S.S.S.S.S", ".S.S.S.S..TS", "S....TTTTSS."],
]
// Existing Manjanin descriptive mean: 27:33:40. J2's printed two-attack
// groups land at positions 0 and 1.8, matching the separately reported 60:40.
export const manjanin2Pulse = (pulse: number) =>
	Math.floor(pulse / 3) * 3 + [0, 0.81, 1.8][pulse % 3]
const d1Times = [0, 59, 159, 257, 322].map((n) => (n * 12) / 401)
function hit(
	atPulse: number,
	token: string,
	pitchStep: number,
	gain: number,
	durationPulses: number,
): CellEvent {
	return {
		atPulse,
		sourceToken: token,
		pitchStep,
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
	kind: string,
): Cell {
	return {
		id: `manjanin2-${row}-${choice}`,
		name,
		lengthPulses: 48,
		events,
		provenance: {
			kind,
			source,
			note,
			adaptation:
				"Six-row timbral split; pitch, gain and duration are designed. Compact flam signs collapse to one main-stroke event because one voice cannot schedule simultaneous attacks. The excerpt's local timing was not measured; documented mean models replace it.",
			timing:
				"Lead uses the existing Manjanin 27:33:40 descriptive mean. J2's attacks use the documented binary 60:40 positions. D2 inherits those timing landmarks rather than measured onsets. D1 uses Table 10's normalized mean IOIs.",
		},
	}
}
const labels = [
	"Cycles 29–32 · poised",
	"Cycles 65–68 · pressure",
	"Cycles 165–168 · suspended",
]
const cells: Cell[][] = Array.from({ length: 6 }, () => [])
for (let choice = 0; choice < 3; choice++) {
	const open: CellEvent[] = [],
		muted: CellEvent[] = [],
		d2: CellEvent[] = [],
		j2: CellEvent[] = [],
		low: CellEvent[] = [],
		slap: CellEvent[] = []
	for (let cycle = 0; cycle < 4; cycle++) {
		for (const [i, p] of [0, 2, 5, 8, 10].entries())
			(p === 5 ? muted : open).push(
				hit(
					cycle * 12 + d1Times[i],
					p === 5 ? "D1:X" : "D1:O",
					p === 5 ? 4 : 0,
					p === 5 ? 0.3 : 0.58,
					p === 5 ? 0.4 : 1.7,
				),
			)
		for (const phase of [0, 6])
			for (const p of [0, 5])
				d2.push(
					hit(cycle * 12 + phase + manjanin2Pulse(p), "D2:O", 2, 0.36, 1.1),
				)
		for (const phase of [0, 6])
			for (const [p, s] of [..."S.TS.B"].entries())
				if (s !== ".")
					j2.push(
						hit(
							cycle * 12 + phase + manjanin2Pulse(p),
							`J2:${s}`,
							s === "B" ? 5 : s === "T" ? 8 : 10,
							s === "B" ? 0.28 : 0.38,
							s === "B" ? 1 : 0.5,
						),
					)
		for (const [p, s] of [...manjanin2Lead[choice][cycle]].entries())
			if (s !== ".")
				(s === "S" ? slap : low).push(
					hit(
						cycle * 12 + manjanin2Pulse(p),
						`J1:${s}`,
						s === "S" ? 12 : s === "B" ? 6 : 9,
						s === "B" ? 0.34 : 0.43,
						s === "B" ? 1.2 : 0.75,
					),
				)
	}
	const rows =
		choice === 0
			? [open, muted, d2, j2, low, slap]
			: choice === 1
				? [
						open.filter((e) => Math.floor(e.atPulse / 12) % 2 === 0),
						muted.filter((e) => Math.floor(e.atPulse / 12) % 2 === 0),
						d2.filter((e) => Math.abs(e.atPulse % 6) < 0.001),
						j2.filter((e) => e.sourceToken === "J2:S"),
						low,
						slap,
					]
				: [
						open.filter((e) => Math.floor(e.atPulse / 12) % 2 === 1),
						muted.filter((e) => Math.floor(e.atPulse / 12) % 2 === 1),
						d2.filter((e) => e.atPulse % 6 > 4),
						j2.filter((e) => e.sourceToken !== "J2:S"),
						low,
						slap,
					]
	const foundationNames = [
		"Full source foundation",
		"Foundation · filtered A",
		"Foundation · filtered B",
	]
	for (let row = 0; row < 6; row++)
		cells[row].push(
			cell(
				row,
				choice,
				row < 4 ? foundationNames[choice] : labels[choice],
				rows[row],
				row < 4 && choice > 0
					? "Disclosed workshop filter of the source-derived foundation; not a separately documented accompaniment variation."
					: "Four parent-audited consecutive lead cycles from Table 1; the full source-derived foundation remains choice 1.",
				row < 4 && choice > 0
					? "filtered-adaptation"
					: "source-derived-arrangement",
			),
		)
}
type EvolutionWorld = World & {
	pulsesPerBeat: number
	recommendationBasis: string
	evolutionGroups: { rows: number[]; choices: number[][] }[]
}
export const manjanin2World: World = {
	id: "manjanin-ii",
	name: "Manjanin II — contrasting lead episodes",
	degreeCount: 7,
	cells,
	presets: [
		[0, 0, 0, 0, 0, 0],
		[0, 0, 0, 0, 1, 1],
		[0, 0, 0, 0, 2, 2],
	],
	presetNames: labels,
	recommendedTuning: "tritave",
	source,
	roles: [
		"First dunun · open",
		"First dunun · muted",
		"Second dunun",
		"Second jembe",
		"Lead · bass/tone",
		"Lead · slap",
	],
	pulsesPerBeat: 3,
	performanceBeatBasis:
		"The source groups three pulses per beat and four beats per 12-pulse cycle. Timing is separate: lead uses the Manjanin 27:33:40 mean model, J2 uses 60:40 binary positions, D2 inherits those landmarks, and D1 uses Table 10's separate mean IOIs.",
	recommendationBasis:
		"Tritave is an intentional non-traditional retuning that separates the designed drum-register pitches; the source contains no melodic pitch transcription.",
	pairedParts: [
		[0, 1],
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
	context:
		"Manjanin II draws on the same Rainer Polak (2010) transcription of the Drissa Kone Quartet recording as the first Manjanin bank, but takes three different lead excerpts — cycles 29–32, 65–68 and 165–168 — for contrasting lead episodes over the same steady accompaniment. The six rows split the two dununs, second jembe and lead bass/tone versus slap exactly as in the first bank, with the lead using the documented 27:33:40 mean timing and the jembe/dunun rows using their own separately documented models. Listen for the accompaniment staying essentially fixed while the lead phrase changes character across the three ensemble recalls. This is a source-derived arrangement, not a verified melodic transcription.",
	ensembleNotes: [
		"Keeps the full dunun/jembe foundation and uses source cycles 29–32 of the same 2006 recording, the workshop's 'poised' lead episode.",
		"Keeps the full dunun/jembe foundation and uses source cycles 65–68, the workshop's 'pressure' lead episode.",
		"Keeps the full dunun/jembe foundation and uses source cycles 165–168, much later in the same performance, the workshop's 'suspended' lead episode.",
	],
} satisfies EvolutionWorld
