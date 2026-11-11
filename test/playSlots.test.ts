import { describe, expect, it } from "vitest"
import { existsSync, readFileSync } from "node:fs"
import { fileURLToPath } from "node:url"
import { ENGINES, SLOT_TABLE, SLOTS, TREMOLO_DEPTH_MAX, laneAddr, ownerAddr, partsFor, sharedAddr, suffixesFor, type Dial } from "../src/util/playSlots.js"
import { BASE_READS } from "../src/util/playModel.js"

// idk.surface's generated list of every OSC address it answers. Never guess an address:
// when the sibling repo is on this machine, everything the PLAY page can send is checked
// against it.
const ADDRESSES = fileURLToPath(new URL("../../idk.surface/docs/osc/addresses.txt", import.meta.url))
const known = existsSync(ADDRESSES)
	? new Set(readFileSync(ADDRESSES, "utf8").split("\n").filter((l) => l.startsWith("/")).map((l) => l.split(" ")[0]))
	: null

describe("play slots", () => {
	it("gives every engine five slots and tremolo as the sixth", () => {
		for (const e of ENGINES) {
			expect(SLOT_TABLE[e]).toHaveLength(SLOTS - 1)
			const trem = partsFor(e, SLOTS - 1)
			expect(trem.map((p) => p.dial.key)).toEqual(["tremoloRate", "tremoloDepth"])
			expect(trem[1].scale).toBe(TREMOLO_DEPTH_MAX)
		}
	})

	it("REEL has LENGTH and START only; CORPUS the map's X and Y in slots 1-4", () => {
		expect(SLOT_TABLE.reel.map((s) => s?.pick.key ?? null)).toEqual([null, "reelWindow", null, null, "reelPosition"])
		expect(SLOT_TABLE.corpus.map((s) => s?.pick.key ?? null)).toEqual(["corpusMapXCentre", "corpusMapXWidth", "corpusMapYCentre", "corpusMapYWidth", null])
		expect(partsFor("reel", 0)).toEqual([])
		expect(partsFor("blank", 0)).toEqual([])
		expect(partsFor(undefined, 5)).toEqual([])
	})

	it("names the parts a preset stores", () => {
		expect(suffixesFor("reel")).toEqual(["reel/reelWindow/norm", "reel/reelPosition/norm", "tremolo/tremoloRate/norm", "tremolo/tremoloDepth"])
	})

	it.skipIf(!known)("sends only addresses idk.surface answers", () => {
		const missing: string[] = []
		const need = (a: string) => { if (!known!.has(a.replace(/\/lane\/(\d+|\*)\//, "/lane/*/"))) missing.push(a) }
		for (const e of ENGINES)
			for (let s = 0; s < SLOTS; s++)
				for (const p of partsFor(e, s)) {
					need(laneAddr(3, p))
					need(sharedAddr(p))
					need(ownerAddr(3, p))
				}
		// The alternatives are not wired yet, but they must be real dials too.
		const dials: Dial[] = ENGINES.flatMap((e) => SLOT_TABLE[e].flatMap((s) => (s ? [s.alt, s.third].filter((d): d is Dial => !!d) : [])))
		for (const d of dials) {
			need(`/surface/lane/3/${d.scope}/${d.key}`)
			need(`/surface/lane/3/owner/${d.key}`)
		}
		for (const a of BASE_READS) need(a)
		for (const a of ["note/on", "note/off", "strike/hz", "damp", "arm", "freeze", "trem", "modal/voiceNote"]) need(`/surface/lane/3/${a}`)
		for (const a of ["/surface/get", "/surface/subscribe"]) need(a)
		expect(missing).toEqual([])
	})
})
