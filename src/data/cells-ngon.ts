import type { World } from "./cells-hot-worlds.js"

// Polak and London report the corpus-mean kèngèbu subdivision as
// 40.8:30.7:28.5. This bank keeps the three-pulse display grid but places
// source landmarks at their fractional measured-feel positions within it.
const PULSES_PER_BEAT = 3
const KEN = 0.408 * PULSES_PER_BEAT
const GE = (0.408 + 0.307) * PULSES_PER_BEAT
const HALF_BU = (0.408 / 2) * PULSES_PER_BEAT
const source =
	"Rainer Polak and Justin London (2014), Timing and Meter in Mande Drumming from Mali, MTO 20.1, esp. figs. 3.1, 3.3, 3.6, 5.2, 6.1 and paragraphs 25, 31–33, 38, 46, 68, 74–78. https://mtosmt.org/issues/mto.14.20.1/mto.14.20.1.polak-london.php"

function hit(
	atPulse: number,
	sourceToken: string,
	pitchStep: number,
	gain: number,
	durationPulses: number,
) {
	return {
		atPulse,
		sourceToken,
		pitchStep,
		pitchOffsetCents: 0,
		gain: gain * 0.7, // Match the existing bank's audition level.
		durationPulses,
	}
}

const sharedNote =
	"Onset locations use the published notation and the article's corpus-mean 40.8:30.7:28.5 subdivision model, not the onset series of one recording. Pitch, gain and duration are workshop designs from stroke identity and remain independently retunable. Notated lead flams are collapsed to one attack; no unmeasured flam offset is invented."

export const ngonWorld: World = {
	id: "ngon",
	name: "Ngòn — measured-feel study",
	degreeCount: 7,
	recommendedTuning: "tritave",
	source,
	roles: [
		"Cunba hook",
		"Ngangan response",
		"Kèngèbu Bu",
		"Kèngèbu Kèn/Gè",
		"Lead offbeat",
		"Lead response",
	],
	cells: [
		[
			{
				id: "ngon-cunba-basic",
				name: "Basic hook",
				lengthPulses: 24,
				events: [0, GE, 12, 12 + GE].map((at) =>
					hit(at, at % 12 === 0 ? "cunba:Bu" : "cunba:Gè", 0, 0.78, 1.35),
				),
				provenance: {
					kind: "source-derived",
					source,
					note: `The two-stroke Beat-1 motive, repeated at Beat 5, from fig. 3.3 and paragraphs 31–32. ${sharedNote}`,
				},
			},
			{
				id: "ngon-cunba-regular-variation",
				name: "Beat-4 variation",
				lengthPulses: 24,
				events: [
					hit(0, "cunba:Bu", 0, 0.78, 1.35),
					hit(GE, "cunba:Gè", 0, 0.72, 1.15),
					hit(9, "cunba:Bu", 0, 0.82, 1.35),
					hit(9 + KEN, "cunba:Kèn", 0, 0.76, 1.15),
					hit(12, "cunba:Bu", 0, 0.82, 1.35),
					hit(12 + GE, "cunba:Gè", 0, 0.72, 1.15),
				],
				provenance: {
					kind: "source-derived",
					source,
					note: `The basic motive plus the regularly varied Beat-4 Bu–Kèn pair shown in fig. 3.3 and described in paragraphs 31–33. ${sharedNote}`,
				},
			},
			{
				id: "ngon-cunba-optional",
				name: "Optional fills",
				lengthPulses: 24,
				events: [
					hit(0, "cunba:Bu", 0, 0.78, 1.35),
					hit(GE, "cunba:Gè", 0, 0.72, 1.15),
					hit(6 + GE, "cunba:Gè-optional", 1, 0.6, 0.95),
					hit(9, "cunba:Bu", 0, 0.82, 1.35),
					hit(9 + KEN, "cunba:Kèn", 0, 0.76, 1.15),
					hit(12, "cunba:Bu", 0, 0.82, 1.35),
					hit(12 + GE, "cunba:Gè", 0, 0.72, 1.15),
					hit(21 + GE, "cunba:Gè-optional", 1, 0.6, 0.95),
				],
				provenance: {
					kind: "source-derived-variant",
					source,
					note: `Fig. 3.3's complete notated example, including its grey optional cunba strokes. It is one documented variant, not a claim that both optional strokes occur in every cycle. ${sharedNote}`,
				},
			},
		],
		[
			{
				id: "ngon-ngangan-basic",
				name: "Basic response",
				lengthPulses: 24,
				events: [6, 6 + KEN, 18, 18 + KEN, 21].map((at, i) =>
					hit(at, i === 1 || i === 3 ? "ngangan:upbeat" : "ngangan:beat", 7, 0.62, 0.72),
				),
				provenance: {
					kind: "source-derived",
					source,
					note: `The two-stroke first-half and three-stroke second-half responses in fig. 3.3 and paragraph 32. ${sharedNote}`,
				},
			},
			{
				id: "ngon-ngangan-variation",
				name: "Beat-4/5 variation",
				lengthPulses: 24,
				events: [
					hit(6, "ngangan:beat", 7, 0.62, 0.72),
					hit(6 + KEN, "ngangan:upbeat", 8, 0.62, 0.72),
					hit(9 + GE, "ngangan:Gè-variation", 9, 0.67, 0.68),
					hit(12 + HALF_BU, "ngangan:HalfBu-variation", 10, 0.7, 0.62),
					hit(12 + GE, "ngangan:Gè-variation", 9, 0.67, 0.68),
				],
				provenance: {
					kind: "excerpt-loop-adaptation",
					source,
					note: `Six-beat excerpt of fig. 5.2 followed by two beats of arranged rest to retain the eight-beat hook phase. The three orange-frame offbeats replace any basic-part attacks in their local window; this choice does not layer conflicting readings. Paragraphs 68–69 explicitly withhold statistical analysis of this intermittent variant. ${sharedNote}`,
				},
			},
			{
				id: "ngon-ngangan-union",
				name: "Basic + variation",
				lengthPulses: 24,
				events: [
					hit(6, "ngangan:beat", 7, 0.62, 0.72),
					hit(6 + KEN, "ngangan:upbeat", 8, 0.62, 0.72),
					hit(9 + GE, "ngangan:Gè-variation", 9, 0.67, 0.68),
					hit(12 + HALF_BU, "ngangan:HalfBu-variation", 10, 0.7, 0.62),
					hit(12 + GE, "ngangan:Gè-variation", 9, 0.67, 0.68),
					hit(18, "ngangan:beat", 7, 0.62, 0.72),
					hit(18 + KEN, "ngangan:upbeat", 8, 0.62, 0.72),
					hit(21, "ngangan:beat", 7, 0.62, 0.72),
				],
				provenance: {
					kind: "combination-adaptation",
					source,
					note: `Workshop union of the fig. 5.2 variation with the later basic response from fig. 3.3. The sources document both materials but do not publish this exact continuous eight-beat combination. ${sharedNote}`,
				},
			},
		],
		[
			{
				id: "ngon-bu-full",
				name: "Every Bu",
				lengthPulses: 3,
				events: [hit(0, "kèngèbu:Bu", 2, 0.68, 1.05)],
				provenance: {
					kind: "timbre-split-adaptation",
					source,
					note: `Low hand-stroke stem split from the published one-beat low–high–high kèngèbu in fig. 3.1 and paragraph 25. The source part is complete only when combined with the Kèn/Gè row. ${sharedNote}`,
				},
			},
			{
				id: "ngon-bu-alternate",
				name: "Alternate Bu",
				lengthPulses: 6,
				events: [hit(0, "kèngèbu:Bu", 2, 0.68, 1.05)],
				provenance: {
					kind: "filtered-adaptation",
					source,
					note: `Every other low hand stroke retained from the published accompaniment. This thinning is a workshop arrangement, not a reported accompaniment variant. ${sharedNote}`,
				},
			},
			{
				id: "ngon-bu-sparse",
				name: "Sparse Bu",
				lengthPulses: 12,
				events: [
					hit(0, "kèngèbu:Bu", 2, 0.7, 1.05),
					hit(9, "kèngèbu:Bu", 3, 0.62, 1.05),
				],
				provenance: {
					kind: "sparse-arrangement",
					source,
					note: `Two Bu attacks retained in a four-beat loop. Density and the second attack's pitch design are workshop choices, not a published Ngòn part. ${sharedNote}`,
				},
			},
		],
		[
			{
				id: "ngon-ken-ge-full",
				name: "Kèn + Gè",
				lengthPulses: 3,
				events: [
					hit(KEN, "kèngèbu:Kèn", 10, 0.52, 0.48),
					hit(GE, "kèngèbu:Gè", 12, 0.5, 0.48),
				],
				provenance: {
					kind: "timbre-split-adaptation",
					source,
					note: `High stick-stroke stem split from the published kèngèbu. Combine with Every Bu to reconstruct the notated low–high–high accompaniment. ${sharedNote}`,
				},
			},
			{
				id: "ngon-ken-only",
				name: "Kèn only",
				lengthPulses: 3,
				events: [hit(KEN, "kèngèbu:Kèn", 10, 0.54, 0.48)],
				provenance: {
					kind: "filtered-adaptation",
					source,
					note: `Kèn-only filter of the published high-stick stem; not an independently documented accompaniment. ${sharedNote}`,
				},
			},
			{
				id: "ngon-ge-only",
				name: "Gè only",
				lengthPulses: 3,
				events: [hit(GE, "kèngèbu:Gè", 12, 0.52, 0.48)],
				provenance: {
					kind: "filtered-adaptation",
					source,
					note: `Gè-only filter of the published high-stick stem; not an independently documented accompaniment. ${sharedNote}`,
				},
			},
		],
		[
			{
				id: "ngon-lead-offbeat",
				name: "Published offbeat cell",
				lengthPulses: 12,
				events: [
					hit(HALF_BU, "lead:HalfBu", 9, 0.84, 0.55),
					hit(GE, "lead:Gè", 11, 0.8, 0.55),
					hit(3 + HALF_BU, "lead:HalfBu", 9, 0.84, 0.55),
				],
				provenance: {
					kind: "source-derived",
					source,
					note: `The red three-attack first cell in figs. 3.6 and 6.1. HalfBu uses half the corpus-mean Bu; paragraph 76 reports .501 of performed Bu (SD .061), while this bank uses the structural mean rather than sampled jitter. ${sharedNote}`,
				},
			},
			{
				id: "ngon-lead-offbeat-fragment",
				name: "Offbeat fragment",
				lengthPulses: 3,
				events: [
					hit(HALF_BU, "lead:HalfBu", 9, 0.82, 0.55),
					hit(GE, "lead:Gè", 11, 0.78, 0.55),
				],
				provenance: {
					kind: "excerpt-loop-adaptation",
					source,
					note: `First two attacks excerpted from the published offbeat cell and looped per beat. The shortened cell boundary is an adaptation. ${sharedNote}`,
				},
			},
			{
				id: "ngon-lead-offbeat-repeated",
				name: "Repeated offbeats",
				lengthPulses: 12,
				events: [0, 3, 6, 9].flatMap((beat) => [
					hit(beat + HALF_BU, "lead:HalfBu", 9, 0.76, 0.5),
					hit(beat + GE, "lead:Gè", 11, 0.72, 0.5),
				]),
				provenance: {
					kind: "documented-variation-adaptation",
					source,
					note: `Paragraphs 76–78 document a continuous series of this offbeat figure; four repetitions form the workshop loop. Preset 3 pairs it with a thinned response, a combination not published as one fixed score. ${sharedNote}`,
				},
			},
		],
		[
			{
				id: "ngon-lead-response",
				name: "Published response cell",
				lengthPulses: 12,
				events: [
					hit(6, "lead:Bu", 6, 0.86, 0.62),
					hit(6 + KEN, "lead:Kèn", 8, 0.82, 0.55),
					hit(9, "lead:Bu", 6, 0.88, 0.62),
				],
				provenance: {
					kind: "source-derived",
					source,
					note: `The blue three-attack second cell in figs. 3.6 and 6.1, retained at beats 3–4 of the same four-beat cycle as the offbeat cell. The article reports a 43:57 performed-cell grand average; this structural realization anchors its middle attack to corpus-mean Kèn at 40.8%. ${sharedNote}`,
				},
			},
			{
				id: "ngon-lead-response-fragment",
				name: "Response fragment",
				lengthPulses: 3,
				events: [
					hit(0, "lead:Bu", 6, 0.84, 0.62),
					hit(KEN, "lead:Kèn", 8, 0.78, 0.55),
				],
				provenance: {
					kind: "excerpt-loop-adaptation",
					source,
					note: `First two attacks excerpted from the published response cell and looped per beat. The shortened cell boundary is an adaptation. ${sharedNote}`,
				},
			},
			{
				id: "ngon-lead-response-thinned",
				name: "Thinned response",
				lengthPulses: 12,
				events: [
					hit(0, "lead:Bu", 6, 0.8, 0.62),
					hit(KEN, "lead:Kèn", 8, 0.74, 0.55),
					hit(3, "lead:Bu", 6, 0.82, 0.62),
				],
				provenance: {
					kind: "density-adaptation",
					source,
					note: `One published response cell followed by two beats of rest. Preset 3 pairs this workshop thinning with the documented repeated-offbeat texture; that pairing is not claimed as a transcribed fixed phrase. ${sharedNote}`,
				},
			},
		],
	],
	presets: [
		[0, 0, 0, 0, 0, 0],
		[1, 1, 0, 0, 1, 1],
		[2, 2, 0, 0, 2, 2],
	],
	presetNames: [
		"Core hook",
		"Interleaved fragments",
		"Offbeat pressure",
	],
	context:
		"Ngòn is a Segu Bamana ensemble rhythm analysed by Rainer Polak and Justin London (2014) for its measured, unevenly spaced beat subdivision. The six rows split a bass/stick cunba hook and its ngangan response from the accompanying kèngèbu low and high strokes and a two-part lead phrase, all placed at the study's measured corpus-mean timing (40.8:30.7:28.5) rather than an even grid. Listen for the lead's offbeat and response halves alternating against the steady hook and kèngèbu accompaniment underneath. This is a source-derived, measured-feel study, not a verified melodic transcription.",
	ensembleNotes: [
		"Each row plays its basic published cell: the core cunba hook, its basic ngangan response, the full kèngèbu accompaniment, and the lead's two published phrase halves.",
		"Swaps the hook and lead rows for their shorter excerpted fragments — the regular variation and the offbeat/response fragments — while the full kèngèbu accompaniment stays steady underneath.",
		"Brings in the cunba's optional fill strokes and the ngangan's combined basic-plus-variation response, paired with the lead's repeated-offbeat figure and thinned response for a busier, more insistent feel.",
	],
}
