import { describe, expect, it } from "vitest"
import { existsSync, readFileSync } from "node:fs"
import { fileURLToPath } from "node:url"
import { ENGINE_DIALS, TREMOLO_DIALS, dialsFor, partOfSuffix } from "../src/util/playDials.js"
import { ENGINES, partSuffix, suffixesFor } from "../src/util/playSlots.js"

const ADDRESSES = fileURLToPath(new URL("../../idk.surface/docs/osc/addresses.txt", import.meta.url))

describe("play dials", () => {
	it("every engine's dials are followed by the tremolo's", () => {
		expect(dialsFor("reel").map(partSuffix).slice(-2)).toEqual(["tremolo/tremoloRate/norm", "tremolo/tremoloDepth/norm"])
		expect(dialsFor("blank")).toEqual([])
		expect(partOfSuffix("tremolo/tremoloDepth")).toMatchObject({ norm: false, dial: { scope: "tremolo", key: "tremoloDepth" } })
		expect(partOfSuffix("../etc")).toBeNull()
	})

	it("covers every dial the six layers use", () => {
		for (const e of ENGINES) {
			const all = new Set(dialsFor(e).map(partSuffix))
			for (const s of suffixesFor(e)) expect(all.has(s.endsWith("/norm") ? s : `${s}/norm`), `${e} ${s}`).toBe(true)
		}
	})

	it.skipIf(!existsSync(ADDRESSES))("is exactly idk.surface's list of owned per-lane dials", () => {
		const lines = readFileSync(ADDRESSES, "utf8").split("\n").filter((l) => l.startsWith("/")).map((l) => l.split(" ")[0])
		const known = new Set(lines)
		const want: Record<string, string[]> = {}
		for (const a of lines) {
			const m = /^\/surface\/lane\/\*\/(\w+)\/(\w+)\/norm$/.exec(a)
			if (!m || /(Span|Range)$/.test(m[2]) || !known.has(`/surface/lane/*/owner/${m[2]}`)) continue
			;(want[m[1]] ??= []).push(m[2])
		}
		for (const e of ENGINES) expect([...ENGINE_DIALS[e]], e).toEqual(want[e])
		expect([...TREMOLO_DIALS]).toEqual(want.tremolo)
		for (const e of ENGINES) for (const k of ENGINE_DIALS[e]) expect(known.has(`/surface/${e}/${k}/norm`), k).toBe(true)
	})
})
