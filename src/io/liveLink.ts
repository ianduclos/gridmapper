// src/io/liveLink.ts — the OSC link to Ableton Live (the idk.clips AbletonOSC fork).
//
// A second peer beside the Max link (io/osc.ts's main socket), never mixed with it: Live's
// traffic never reaches Max or the web panel, and Max's never reaches Live. The fork listens
// on 11000 and replies to 11001 (AbletonOSC's own defaults). We bind 11001 on loopback only,
// since Live runs on this Mac, and send from that same socket. Pages see it as ctx.live;
// only pages/clips.ts uses it. A port already taken is logged by io/osc.ts and leaves the
// clips page showing "no link"; nothing else in gridmapper depends on it.

import { createOsc, type Osc } from "./osc.js"
import type { LiveLink } from "../core/types.js"

export type LiveLinkHandle = LiveLink & { close: () => void }
type MakeOsc = (opts: { localAddress: string; localPort: number; remotePort: number }) => Osc

export function createLiveLink(
	opts: { inPort: number; outPort: number },
	makeOsc: MakeOsc = (o) => createOsc(o),
): LiveLinkHandle {
	const osc = makeOsc({ localAddress: "127.0.0.1", localPort: opts.inPort, remotePort: opts.outPort })
	const listeners = new Set<(path: string, args: any[]) => void>()
	osc.onMessage((path, args) => {
		for (const fn of [...listeners]) {
			try {
				fn(path, args)
			} catch (err) {
				console.error("[live] listener threw:", err)
			}
		}
	})
	return {
		send: (path, ...args) => osc.send(path, ...args),
		on: (fn) => {
			listeners.add(fn)
			return () => {
				listeners.delete(fn)
			}
		},
		close: () => osc.close(),
	}
}
