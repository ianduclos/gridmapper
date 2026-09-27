import type { Cell, CellEvent, World } from "./cells-hot-worlds.js"

// Nyamaropa for mbira dzavadzimu, read from B. Michael Williams, "Getting
// Started with Mbira dzaVadzimu", Percussive Notes, August 1997, pp.38–49
// (author-hosted PDF; Nyamaropa tablature and staff on pp.43–46). Full dossier: docs/cells-research-nyamaropa.md.
const source =
	"B. Michael Williams (1997), Getting Started with Mbira dzaVadzimu, Percussive Notes, Aug 1997: tablature 'Nyamaropa I—Chara I (standard kushaura)' p.43, 'Nyamaropa I—Chara III' p.44, 'Nyamaropa II—Chara I (standard kutsinhira)' and 'Chara II' p.45, 'Nyamaropa II—Chara III' p.46; key numbering Diagram 2 p.39, letter-name layout Diagram 1 p.38. https://bmichaelwilliams.com/wp-content/uploads/2013/02/PNGettingStartedMbira.pdf"

export type TabLine = "RI" | "RT" | "UL" | "LL"
/** One printed 12-column section: '.' = no stroke, digit = key number (Diagram 2). */
export type TabSection = Record<TabLine, string>

// Printed tablature, transcribed column-for-column. Kushaura (Nyamaropa I)
// columns are pulses 1..12. Kutsinhira (Nyamaropa II) columns are printed as
// 12 | 1..11: column 0 is the pickup pulse 12 of the PREVIOUS section.
export const nyamaropaKushauraI: TabSection[] = [
	{ RI: "......4.4...", RT: "2.2.2.....3.", UL: "1..1..5..2..", LL: ".1..1..2..4." },
	{ RI: "......4...4.", RT: "2.2.2...2...", UL: "1..1..5..4..", LL: ".1..1..2..5." },
	{ RI: "......5.5.4.", RT: "2.2.2.......", UL: "1..1..3..4..", LL: ".1..1..3..5." },
	{ RI: "......5.5.4.", RT: "3.3.3.......", UL: "4..4..3..4..", LL: ".7..7..3..5." },
]
export const nyamaropaKushauraIII: TabSection[] = [
	{ RI: "..6.4.4.4...", RT: "2.........3.", UL: "1..1..5..2..", LL: ".1..1..2..4." },
	{ RI: "..9.9.9.8.7.", RT: "2...........", UL: "1..1..5..4..", LL: ".1..1..2..5." },
	{ RI: "6.6.7.6.5.4.", RT: "............", UL: "1..1..3..4..", LL: ".1..1..3..5." },
	{ RI: "4...6.5.5.4.", RT: "..3.........", UL: "4..4..3..4..", LL: ".7..7..3..5." },
]
export const nyamaropaKutsinhiraI: TabSection[] = [
	{ RI: "......4.4...", RT: "2.2.2.....3.", UL: "1..1..5..2..", LL: ".1..1..2..4." },
	{ RI: "......4...4.", RT: "2.2.2...2...", UL: "1..1..5..4..", LL: ".1..1..2..5." },
	{ RI: "......5.5.4.", RT: "2.2.2.......", UL: "1..1..3..4..", LL: ".1..1..3..5." },
	{ RI: "......5.5.4.", RT: "3.3.3.......", UL: "4..4..3..4..", LL: ".7..7..3..5." },
]
export const nyamaropaKutsinhiraII: TabSection[] = [
	{ RI: "6.6.4.4.6.6.", RT: "2.2.....3.3.", UL: "1..1..5..2..", LL: ".1..1..2..4." },
	{ RI: "6.6.4.4...4.", RT: "2.2.....2...", UL: "1..1..5..4..", LL: ".1..1..2..5." },
	{ RI: "6.6.6.6.5.4.", RT: "2.2.2.2.2...", UL: "1..2..3..4..", LL: ".1..2..3..5." },
	{ RI: "4...5.5.5.4.", RT: "..3.2.2.2...", UL: "4..4..3..4..", LL: ".7..5..3..5." },
]
// Section I column 10 prints key 3 on the RI line (key 3 is normally a thumb
// key, p.39). Kept on the RI row exactly as printed.
export const nyamaropaKutsinhiraIII: TabSection[] = [
	{ RI: "..6.4.4.4.3.", RT: "2...........", UL: "1..1..5..2..", LL: ".1..1..2..4." },
	{ RI: "..9.9.9.8.7.", RT: "2...........", UL: "1..1..5..4..", LL: ".1..1..2..5." },
	{ RI: "9.8.7.6.5.4.", RT: "............", UL: "1..2..3..4..", LL: ".1..2..3..5." },
	{ RI: "4...5.5.5.4.", RT: "..3.........", UL: "4..4..3..4..", LL: ".7..5..3..5." },
]

// Key → ordinal heptatonic step, G2 = 0 (so G3 = 7, G4 = 14). Letter names
// from Diagram 1; octave placement read off the staff notation on pp.43 and 45
// for every key marked "staff". The rest follow Diagram 1's ascending order.
export const nyamaropaPitch: Record<string, number> = {
	LL1: 0, // G2  staff
	LL2: 2, // B2  staff
	LL3: 3, // C3  staff
	LL4: 4, // D3  staff (p.45 kutsinhira; p.43 kushaura staff prints F3 — see dossier)
	LL5: 5, // E3  staff
	LL7: 8, // A3  staff
	UL1: 7, // G3  staff
	UL2: 11, // D4 staff
	UL3: 10, // C4 staff
	UL4: 12, // E4 staff
	UL5: 13, // F4 staff
	RT2: 14, // G4 staff
	RT3: 15, // A4 staff
	RI3: 15, // A4 (key 3, printed on the RI line)
	RI4: 16, // B4 staff
	RI5: 17, // C5 staff
	RI6: 18, // D5 Diagram 1 order
	RI7: 19, // E5 Diagram 1 order
	RI8: 20, // F5 Diagram 1 order
	RI9: 21, // G5 Diagram 1 order
}

export type Part = "kushaura" | "kutsinhira"
export type Digit = "RI" | "RT" | "LT"
/** Every printed stroke of one chara, placed on the 48-pulse ensemble cycle. */
export function tabEvents(tab: TabSection[], part: Part) {
	const out: { at: number; line: TabLine; key: number }[] = []
	tab.forEach((section, s) => {
		for (const line of ["RI", "RT", "UL", "LL"] as TabLine[])
			[...section[line]].forEach((ch, col) => {
				if (ch === ".") return
				// Kutsinhira column 0 is the pickup (pulse 12 of the previous section).
				const at = part === "kushaura" ? s * 12 + col : (s * 12 + col - 1 + 48) % 48
				out.push({ at, line, key: Number(ch) })
			})
	})
	return out.sort((a, b) => a.at - b.at)
}
const digitLines: Record<Digit, TabLine[]> = { RI: ["RI"], RT: ["RT"], LT: ["UL", "LL"] }

function event(at: number, line: TabLine, key: number, gain: number): CellEvent {
	const token = line + key
	const pitchStep = nyamaropaPitch[token]
	if (pitchStep === undefined) throw new Error(`Nyamaropa: no pitch for ${token}`)
	return { atPulse: at, durationPulses: 0.9, gain, pitchOffsetCents: 0, pitchStep, sourceToken: token }
}
function digitEvents(tab: TabSection[], part: Part, digit: Digit, gain: number) {
	return tabEvents(tab, part)
		.filter((e) => digitLines[digit].includes(e.line))
		.map((e) => event(e.at, e.line, e.key, gain))
}

const rows: { part: Part; digit: Digit; gain: number }[] = [
	{ part: "kushaura", digit: "RI", gain: 0.42 },
	{ part: "kushaura", digit: "RT", gain: 0.42 },
	{ part: "kushaura", digit: "LT", gain: 0.46 },
	{ part: "kutsinhira", digit: "RI", gain: 0.38 },
	{ part: "kutsinhira", digit: "RT", gain: 0.38 },
	{ part: "kutsinhira", digit: "LT", gain: 0.42 },
]
const adaptation =
	"Six rows = one per playing digit (right index, right thumb, left thumb covering UL+LL) for each of the two parts; this allocation, the 0.9-pulse durations, gains and the idealized heptatonic tuning are workshop choices. Kutsinhira placement follows the printed 12|1..11 column labels as shared ensemble pulses (see dossier for the alignment question)."
const choiceSpec: Record<Part, { name: string; tab: TabSection[]; kind: string; note: string; excerpt?: boolean }[]> = {
	kushaura: [
		{ name: "Chara I (standard kushaura)", tab: nyamaropaKushauraI, kind: "source-derived", note: "Williams p.43, all printed strokes." },
		{ name: "Chara III (kushaura variation)", tab: nyamaropaKushauraIII, kind: "source-derived", note: "Williams p.44, all printed strokes." },
		{ name: "Chara I, sections I–II loop", tab: nyamaropaKushauraI, kind: "excerpt-loop-adaptation", note: "First 24 pulses of the standard kushaura looped. A workshop excerpt, not a traditional phrase; the article's kushaura Chara II is not present in the accessible PDF.", excerpt: true },
	],
	kutsinhira: [
		{ name: "Chara I (standard kutsinhira)", tab: nyamaropaKutsinhiraI, kind: "source-derived", note: "Williams p.45, all printed strokes." },
		{ name: "Chara II (kutsinhira variation)", tab: nyamaropaKutsinhiraII, kind: "source-derived", note: "Williams p.45, all printed strokes." },
		{ name: "Chara III (kutsinhira variation)", tab: nyamaropaKutsinhiraIII, kind: "source-derived", note: "Williams p.46, all printed strokes; section I's key 3 stays on the RI line as printed." },
	],
}
const cells: Cell[][] = rows.map(({ part, digit, gain }, row) =>
	choiceSpec[part].map((spec, choice) => {
		const all = digitEvents(spec.tab, part, digit, gain)
		return {
			id: `mbira-nyamaropa-${row}-${choice}`,
			name: spec.name,
			lengthPulses: spec.excerpt ? 24 : 48,
			events: spec.excerpt ? all.filter((e) => e.atPulse < 24) : all,
			provenance: { kind: spec.kind, source, note: spec.note, adaptation },
		}
	}),
)

export const nyamaropaWorld: World = {
	id: "mbira-nyamaropa",
	name: "Mbira — Nyamaropa (kushaura + kutsinhira)",
	degreeCount: 7,
	cells,
	presets: [
		[0, 0, 0, 0, 0, 0],
		[0, 0, 0, 1, 1, 1],
		[1, 1, 1, 2, 2, 2],
	],
	presetNames: ["Standard pair", "Kutsinhira Chara II", "Chara III pair"],
	recommendedTuning: "heptatonic-model",
	source,
	roles: [
		"Kushaura right index",
		"Kushaura right thumb",
		"Kushaura left thumb",
		"Kutsinhira right index",
		"Kutsinhira right thumb",
		"Kutsinhira left thumb",
	],
	pulsesPerBeat: 3,
	performanceBeatBasis:
		"The tablature numbers 12 pulses per section and four sections per 48-pulse chara; it marks pulses, not beats. Three pulses per beat (16 beats per cycle) is a workshop grouping.",
	recommendationBasis:
		"Williams describes dzavadzimu tuning as heptatonic (standard 'Nyamaropa' tuning roughly a major scale with flatted seventh, p.39); the seven-tone model keeps the source's seven ordered letter names but is idealized, not a measured instrument.",
	pairedParts: [
		[0, 1, 2],
		[3, 4, 5],
	],
	foundationRows: [0, 1, 2],
	evolutionGroups: [
		{
			rows: [3, 4, 5],
			choices: [
				[0, 0, 0],
				[1, 1, 1],
				[2, 2, 2],
			],
		},
	],
	context:
		"Nyamaropa is among the oldest pieces for the Shona mbira dzavadzimu of Zimbabwe, adapted here from B. Michael Williams's 1997 tablature of its kushaura (leading) and kutsinhira (following) parts. Each part is split into its three playing digits — right index, right thumb and left thumb — so the six rows are two complete mbira parts. The two standard parts use the same keys, the kutsinhira sounding each stroke one pulse before the kushaura's as printed, so every pulse of the cycle is filled. Listen for the two identical lines knitting into one dense texture, then for the kutsinhira's variations moving over a steady kushaura. This is an adaptation of the published tablature, not a recording or measured tuning.",
	ensembleNotes: [
		"Both standard parts (Chara I) as printed: the same key sequence, offset by one pulse, interlocking into a continuous stream.",
		"Standard kushaura held under the printed kutsinhira Chara II variation, which doubles the right-hand strokes. The pairing is a workshop choice.",
		"Kushaura Chara III against kutsinhira Chara III, two near-mirror variations with high right-index runs. The pairing is a workshop choice.",
	],
}
