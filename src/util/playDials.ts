/* PLAY page: every continuous dial a lane has, per engine, as DATA.
 * ------------------------------------------------------------------------------
 * A grid preset holds a lane's whole sound: every one of these that the lane has pulled
 * away from the shared dial (V), and nothing else. The lists are idk.surface's own: every
 * per-lane dial with a 0-1 twin in its generated docs/osc/addresses.txt that also has an
 * owner address, leaving out the modulation ranges (…Span, …Range).
 * test/playDials.test.ts rebuilds the lists from that file and fails when they drift, so a
 * dial surface gains or loses shows up here as a failing test, never as a guessed address.
 */

import { isEngine, type Engine, type Part } from "./playSlots.js"

export const ENGINE_DIALS: Record<Engine, readonly string[]> = {
	modal: [
		"coupling", "jawariCloseness", "rattleLooseness", "jawariLevel", "rattleLevel", "bowPressure",
		"bowSpeed", "bowPosition", "rattleTone", "deform", "bowStroke", "bowDrift", "morph", "morphY",
		"hardness", "decay", "position", "modalInput", "modalDecayByPitch",
	],
	string: [
		"stringStrength", "stringPick", "stringPosition", "stringBrightness", "stringDecay",
		"stringTrebleLoss", "stringBeating", "stringStiffness", "stringStretch", "stringDamping",
		"stringNonlinearity", "stringLoopTone", "stringCoupling", "stringBodyReturn", "stringBend",
		"stringLevel", "stringBowPressure", "stringBowSpeed", "stringBowPosition", "stringBowAttack",
		"stringBowDrift", "stringInput", "stringMutePress", "stringMuteAt", "stringFuller",
		"stringVelocityColour", "stringDecayByPitch",
	],
	drone: [
		"droneInterval", "droneBeat", "droneShape", "dronePull", "droneFold", "droneDrift",
		"droneInstability", "droneHarmonic", "droneSpread", "droneFocus", "droneBalance", "droneFloor",
		"droneAttack", "droneRelease", "droneCurve", "droneVactrol", "droneSlew",
	],
	wind: [
		"windBreathIn", "windBreath", "windPush", "windLength", "windWaver", "windAir",
		"windAirBrightness", "windEmbouchure", "windEdge", "windColour", "windBend", "windCavity",
		"windTongue", "windBloom", "windRelease", "windPuff", "windPushTime", "windPushVary",
		"windMouthX", "windMouthY", "windMouthDepth", "windSplit", "windHum", "windHumPress",
		"windFlutter", "windClicks", "windMouthVary", "windMouthLength", "windMouthLips", "windBodyPush",
		"windAirOut", "windBite",
	],
	reel: [
		"reelOverdub", "reelRate", "reelPosition", "reelWindow", "reelFade", "reelSense", "reelAttack",
		"reelHold", "reelRelease", "reelTone", "reelWow", "reelWear", "reelGrain",
	],
	corpus: [
		"corpusBrightCentre", "corpusBrightWidth", "corpusLoudCentre", "corpusLoudWidth",
		"corpusNoisyCentre", "corpusNoisyWidth", "corpusLengthCentre", "corpusLengthWidth",
		"corpusPitchedAt", "corpusLevel", "corpusReach", "corpusFine", "corpusXfade", "corpusMaxLength",
		"corpusJoinWeight", "corpusFadeTime", "corpusMapXCentre", "corpusMapXWidth", "corpusMapYCentre",
		"corpusMapYWidth", "corpusGlide", "corpusGrain", "corpusSpotSize", "corpusSpotSpread",
		"corpusReverseChance", "corpusStepMutate", "corpusPitchComp", "corpusLoudComp",
		"corpusListenChance", "corpusListenSense", "corpusListenLiteral",
		"corpusPartBlend",
	],
}

/** Every lane has these whatever its engine. */
export const TREMOLO_DIALS = ["tremoloRate", "tremoloDepth"] as const

const part = (scope: string, key: string): Part => ({ dial: { scope, key, label: key }, norm: true, scale: 1 })

/** Every continuous dial of a lane on `engine`: the engine's own, then its tremolo. */
export function dialsFor(engine: string | undefined): Part[] {
	if (!isEngine(engine)) return []
	return [...ENGINE_DIALS[engine].map((k) => part(engine, k)), ...TREMOLO_DIALS.map((k) => part("tremolo", k))]
}

/** A stored name (`scope/key[/norm]`) back to the address it stands for. */
export function partOfSuffix(suffix: string): Part | null {
	const m = /^(\w+)\/(\w+)(\/norm)?$/.exec(suffix)
	return m ? { ...part(m[1], m[2]), norm: !!m[3] } : null
}
