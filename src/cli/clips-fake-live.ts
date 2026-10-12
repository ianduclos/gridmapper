// src/cli/clips-fake-live.ts — a stand-in for the idk.clips fork, so the clips page can be
// seen in the web sim before Live is wired. It is NOT the contract's owner and plays it only
// loosely: 20 tracks × 10 scenes, launches are instant (no quantization, no launch modes),
// and a beat every 500 ms. Binds UDP 11000, replies to 11001. Run: npm run clips:fake

import { createOsc } from "../io/osc.js"

const W = 15
const H = 6
const N_TRACKS = 20
const N_SCENES = 10

const osc = createOsc({ localAddress: "127.0.0.1", localPort: 11000, remotePort: 11001 })
const hasClip = (t: number, s: number) => (t * 7 + s * 3) % 5 !== 0
const playing: (number | null)[] = Array.from({ length: N_TRACKS }, (_, t) => (t % 3 === 0 && hasClip(t, 0) ? 0 : null))
const flags = Array.from({ length: N_TRACKS }, () => 1) // bit0 exists
const volumes = Array.from({ length: N_TRACKS }, () => 0.85)
let trackOff = 0
let sceneOff = 0
let beat = 0

const code = (t: number, s: number) => {
	if (t >= N_TRACKS || s >= N_SCENES) return 0
	if (playing[t] === s) return 5
	if (!hasClip(t, s)) return flags[t] & 2 ? 2 : 1
	return 3
}

const sendAll = () => {
	const slots: number[] = []
	for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) slots.push(code(trackOff + x, sceneOff + y))
	osc.send("/clips/window", trackOff, sceneOff, N_TRACKS, N_SCENES, ...slots)
	const f: number[] = []
	const v: number[] = []
	for (let x = 0; x < W; x++) {
		const t = trackOff + x
		f.push(t < N_TRACKS ? flags[t] | (playing[t] !== null ? 16 : 0) : 0)
		v.push(t < N_TRACKS ? volumes[t] : 0)
	}
	osc.send("/clips/tracks", trackOff, ...f, ...v, 0.85)
	const sc: number[] = []
	for (let y = 0; y < H; y++) sc.push(sceneOff + y < N_SCENES ? 1 : 0)
	osc.send("/clips/scenes", sceneOff, ...sc)
}

const clampOff = (v: number, n: number, size: number) => Math.max(0, Math.min(Math.max(0, n - size), Math.trunc(v)))
const BITS: Record<string, number> = { arm: 2, mute: 4, solo: 8 }

osc.onMessage((path, args) => {
	const n = args.map(Number)
	switch (path) {
		case "/clips/hello":
			break
		case "/clips/window/set":
			trackOff = clampOff(n[0], N_TRACKS, W)
			sceneOff = clampOff(n[1], N_SCENES, H)
			break
		case "/clips/slot/button":
			if (n[2] !== 1 || n[0] >= N_TRACKS) return
			playing[n[0]] = hasClip(n[0], n[1]) ? n[1] : null
			break
		case "/clips/scene/button":
			if (n[1] !== 1) return
			for (let t = 0; t < N_TRACKS; t++) playing[t] = hasClip(t, n[0]) ? n[0] : null
			break
		case "/clips/track/stop":
			playing[n[0]] = null
			break
		case "/clips/stop_all":
			playing.fill(null)
			break
		case "/clips/track/set": {
			const t = n[1]
			if (t < 0 || t >= N_TRACKS) return
			const bit = BITS[String(args[0])]
			if (bit) flags[t] = n[2] ? flags[t] | bit : flags[t] & ~bit
			else if (args[0] === "volume") volumes[t] = n[2]
			break
		}
		default:
			return
	}
	sendAll()
})

setInterval(() => osc.send("/clips/beat", beat++), 500)
console.log("[fake-live] /clips stand-in on 11000 → 11001 (20 tracks × 10 scenes). Ctrl-C to stop.")
