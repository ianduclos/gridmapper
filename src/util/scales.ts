/* Scales — semitone degree sets in 12-EDO, plus the two things a keyboard page needs:
 * "is this note in the scale?" and "what is the Nth note of the scale?".
 *
 * Deliberately 12-tone. gridmapper's step model is otherwise EDO-agnostic (isometric's
 * `npo` goes to 48 for microtonal layouts), but a scale named "dorian" only means anything
 * against twelve semitones — so pages apply these ONLY when they're in 12-EDO, and fall
 * back to plain octave-root marking otherwise. That rule lives in the page; this module
 * just owns the table.
 *
 * `chromatic` is the identity entry: every pitch class, so selecting it is the same as
 * having no scale at all. It's first in the table, but it is NOT the default — a keyboard
 * that highlights nothing is harder to play than one that does, so `ionian` is. Pages that
 * care about microtonal tunings still get the old behaviour by selecting `chromatic`
 * explicitly (see `baseLevel()` in pages/isometric.ts).
 */

export const SCALES = {
	chromatic: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11],
	// The seven modes of the major scale, in the usual order.
	ionian: [0, 2, 4, 5, 7, 9, 11],
	dorian: [0, 2, 3, 5, 7, 9, 10],
	phrygian: [0, 1, 3, 5, 7, 8, 10],
	lydian: [0, 2, 4, 6, 7, 9, 11],
	mixolydian: [0, 2, 4, 5, 7, 9, 10],
	aeolian: [0, 2, 3, 5, 7, 8, 10],
	locrian: [0, 1, 3, 5, 6, 8, 10],
	// Five-note scales — the folded layout gets much wider under the hand with these.
	"pentatonic-major": [0, 2, 4, 7, 9],
	"pentatonic-minor": [0, 3, 5, 7, 10],
	// The funkier end.
	"lydian-b7": [0, 2, 4, 6, 7, 9, 10], // lydian dominant / acoustic
	altered: [0, 1, 3, 4, 6, 8, 10], // super locrian
	"harmonic-minor": [0, 2, 3, 5, 7, 8, 11],
	"melodic-minor": [0, 2, 3, 5, 7, 9, 11],
	"whole-tone": [0, 2, 4, 6, 8, 10],
	blues: [0, 3, 5, 6, 7, 10],
} as const satisfies Record<string, readonly number[]>

export type ScaleName = keyof typeof SCALES

export const SCALE_NAMES = Object.keys(SCALES) as ScaleName[]
export const DEFAULT_SCALE: ScaleName = "ionian"
export const OCTAVE = 12

export const isScaleName = (v: unknown): v is ScaleName =>
	typeof v === "string" && v in SCALES

/** The scale's semitone offsets. Unknown names degrade to chromatic rather than throwing. */
export const degreesOf = (name: string): readonly number[] =>
	isScaleName(name) ? SCALES[name] : SCALES.chromatic

/** How many notes per octave this scale has — 7 for the modes, 5 for the pentatonics. */
export const stepsPerOctave = (name: string): number => degreesOf(name).length

/** Positive modulo — steps go negative below the root, and % doesn't in JS. */
const mod = (n: number, m: number): number => ((n % m) + m) % m

/** Is this chromatic step a member of `scale` rooted at `root` (0..11)? */
export function isInScale(step: number, root: number, name: string): boolean {
	return degreesOf(name).includes(mod(step - root, OCTAVE))
}

/** Is this chromatic step the scale's root pitch class? */
export const isRootOf = (step: number, root: number): boolean =>
	mod(step - root, OCTAVE) === 0

/**
 * The Nth note OF THE SCALE, as a chromatic step. This is what makes the "folded"
 * keyboard layout work: one key right advances one scale degree, and we resolve it back
 * to semitones here so what leaves the page is still an ordinary chromatic step — Max's
 * existing step→pitch mapping keeps working, whatever scale is selected.
 */
export function foldedStep(degreeIndex: number, root: number, name: string): number {
	const degrees = degreesOf(name)
	const len = degrees.length
	const octave = Math.floor(degreeIndex / len)
	return root + octave * OCTAVE + degrees[mod(degreeIndex, len)]
}
