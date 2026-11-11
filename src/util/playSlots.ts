/* PLAY page: the six slots, as DATA (idk.surface spec 2026-11-11, section 3).
 * ------------------------------------------------------------------------------
 * Each engine answers a slot its own way, the same for every lane on that engine. This
 * file is the whole table: change a pick here and nothing else moves. `pick` is what the
 * page uses; `alt` is the spec's alternative and `third` is room for one more — neither is
 * wired to a control yet (a CONTROL subtab in idk.surface will choose them later).
 *
 * 2026-11-11: the six parameter layers that used this table were taken off the PLAY page
 * (Ian). The table stays as the spec's data; the page now uses only the address builders
 * below and, to read presets stored by the first version, suffixesFor.
 *
 * A dial is named by its scope and key exactly as idk.surface's generated
 * docs/osc/reference.txt spells them: test/playSlots.test.ts checks every address this
 * file can produce against that list, so a name is never a guess.
 *
 *   lane's own   /surface/lane/<n>/<scope>/<key>[/norm]
 *   shared       /surface/<scope>/<key>[/norm]
 *   who owns it  /surface/lane/<n>/owner/<key>   follow (F) | voice (V)
 */

export const ENGINES = ["modal", "string", "drone", "wind", "reel", "corpus"] as const
export type Engine = (typeof ENGINES)[number]
export const isEngine = (v: unknown): v is Engine => (ENGINES as readonly string[]).includes(v as string)

export interface Dial {
	scope: string
	key: string
	/** The name on idk.surface's screen. */
	label: string
}

export interface SlotDef {
	/** The slot's family: tone, time, force, move, place. */
	family: string
	pick: Dial
	alt?: Dial
	third?: Dial
}

const d = (scope: string, key: string, label: string): Dial => ({ scope, key, label })

/** Slots 1-5 per engine (index 0-4). null = the engine has nothing there: a dark column. */
export const SLOT_TABLE: Record<Engine, ReadonlyArray<SlotDef | null>> = {
	modal: [
		{ family: "tone", pick: d("modal", "hardness", "Hardness"), alt: d("modal", "morph", "Material") },
		{ family: "time", pick: d("modal", "decay", "Decay") },
		{ family: "force", pick: d("modal", "deform", "Deform"), alt: d("modal", "modalInput", "Input") },
		{ family: "move", pick: d("modal", "coupling", "Coupling"), alt: d("modal", "rattleLevel", "Rattle") },
		{ family: "place", pick: d("modal", "position", "Position") },
	],
	string: [
		{ family: "tone", pick: d("string", "stringBrightness", "Brightness"), alt: d("string", "stringFuller", "Fuller") },
		{ family: "time", pick: d("string", "stringDecay", "Decay"), alt: d("string", "stringDamping", "Damping") },
		{ family: "force", pick: d("string", "stringStrength", "Strength"), alt: d("string", "stringPick", "Finger / Pick") },
		// STRING's only dial called Drift is the BOW's: it is heard under a bow, not on a pluck.
		{ family: "move", pick: d("string", "stringBowDrift", "Drift"), alt: d("string", "stringBeating", "Beating") },
		{ family: "place", pick: d("string", "stringPosition", "Position") },
	],
	drone: [
		{ family: "tone", pick: d("drone", "droneFocus", "Focus"), alt: d("drone", "droneShape", "Shape") },
		{ family: "time", pick: d("drone", "droneRelease", "Release"), alt: d("drone", "droneAttack", "Attack") },
		{ family: "force", pick: d("drone", "droneFold", "Fold"), alt: d("drone", "droneFloor", "Floor") },
		{ family: "move", pick: d("drone", "droneInstability", "Instability"), alt: d("drone", "droneDrift", "Drift") },
		{ family: "place", pick: d("drone", "droneBalance", "Balance"), alt: d("drone", "droneSpread", "Spread") },
	],
	wind: [
		{ family: "tone", pick: d("wind", "windEdge", "Edge"), alt: d("wind", "windColour", "Colour") },
		{ family: "time", pick: d("wind", "windRelease", "Release"), alt: d("wind", "windLength", "Breath length") },
		{ family: "force", pick: d("wind", "windBreath", "Breath"), alt: d("wind", "windPush", "Push") },
		{ family: "move", pick: d("wind", "windWaver", "Waver"), alt: d("wind", "windFlutter", "Flutter") },
		{ family: "place", pick: d("wind", "windEmbouchure", "Embouchure") },
	],
	// REEL: LENGTH and START only; the rest dark.
	reel: [
		null,
		{ family: "time", pick: d("reel", "reelWindow", "Window (length)") },
		null,
		null,
		{ family: "place", pick: d("reel", "reelPosition", "Position (start)") },
	],
	// CORPUS: X position, X range, Y position, Y range in slots 1-4.
	corpus: [
		{ family: "tone", pick: d("corpus", "corpusMapXCentre", "Map x centre") },
		{ family: "time", pick: d("corpus", "corpusMapXWidth", "Map x width") },
		{ family: "force", pick: d("corpus", "corpusMapYCentre", "Map y centre") },
		{ family: "move", pick: d("corpus", "corpusMapYWidth", "Map y width") },
		null,
	],
}

/** Slot 6, the same for every engine: one bar sets the lane's tremolo rate and depth. */
export const TREMOLO_RATE = d("tremolo", "tremoloRate", "Tremolo rate")
export const TREMOLO_DEPTH = d("tremolo", "tremoloDepth", "Tremolo depth")
/** A full bar is this much depth, never more. */
export const TREMOLO_DEPTH_MAX = 0.8
export const SLOTS = 6
export const TREMOLO_SLOT = 5

/**
 * One address a bar drives. `norm` = the dial's 0-1 twin (along the dial, whatever its
 * real range or curve); `scale` = what a full bar sends.
 */
export interface Part {
	dial: Dial
	norm: boolean
	scale: number
}

/** The addresses slot `slot` (0-5) drives on `engine`. The first one is what the bar shows. */
export function partsFor(engine: string | undefined, slot: number): Part[] {
	if (!isEngine(engine)) return []
	if (slot === TREMOLO_SLOT)
		return [
			{ dial: TREMOLO_RATE, norm: true, scale: 1 },
			// Depth is already 0-1, so its real address takes the cap directly.
			{ dial: TREMOLO_DEPTH, norm: false, scale: TREMOLO_DEPTH_MAX },
		]
	const def = SLOT_TABLE[engine][slot]
	return def ? [{ dial: def.pick, norm: true, scale: 1 }] : []
}

/** `scope/key[/norm]`: a part's name inside a stored preset, and the tail of its addresses. */
export const partSuffix = (p: Part) => `${p.dial.scope}/${p.dial.key}${p.norm ? "/norm" : ""}`
/** `lane` is 1-8, or "*" for a wildcard read. */
export const laneAddr = (lane: number | "*", p: Part) => `/surface/lane/${lane}/${partSuffix(p)}`
export const sharedAddr = (p: Part) => `/surface/${partSuffix(p)}`
export const ownerAddr = (lane: number | "*", p: Part) => `/surface/lane/${lane}/owner/${p.dial.key}`

/** Every part suffix an engine's six slots can store. */
export function suffixesFor(engine: Engine): string[] {
	const out: string[] = []
	for (let s = 0; s < SLOTS; s++) for (const p of partsFor(engine, s)) out.push(partSuffix(p))
	return out
}
