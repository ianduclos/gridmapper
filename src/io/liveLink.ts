// src/io/liveLink.ts — the OSC link to Ableton Live (the idk.clips AbletonOSC fork).
//
// A second peer beside the Max link (io/osc.ts's main socket), never mixed with it: Live's
// traffic never reaches Max or the web panel, and Max's never reaches Live. The fork listens
// on 11000 and replies to 11001 (AbletonOSC's own defaults). We bind 11001 on loopback only,
// since Live runs on this Mac, and send from that same socket. Pages see it as ctx.live;
// only pages/clips.ts uses it.
//
// The socket is LAZY: it binds when the first page listens and closes when the last one
// stops, so a daemon with no clips page loaded never holds 11001 (AbletonOSC's own client
// and tests bind it too). A bind that fails (port taken) is retried every RETRY_MS while a
// page still listens, and sends are DROPPED while there is no socket rather than queued:
// the clips page re-sends its hello on its own, so nothing piles up over a long day.

import { createOsc, type Osc } from "./osc.js"
import type { LiveLink } from "../core/types.js"

export type LiveLinkHandle = LiveLink & { close: () => void }
type MakeOsc = (opts: { localAddress: string; localPort: number; remotePort: number }) => Osc

export const RETRY_MS = 5000

/** Bind failures carry a code (EADDRINUSE, EADDRNOTAVAIL, EACCES); a malformed incoming
 *  packet does not, and must not tear a working socket down. */
const isBindFailure = (err: unknown) => {
	const code = (err as { code?: unknown } | null)?.code
	return typeof code === "string" && (code.startsWith("EADDR") || code === "EACCES")
}

export function createLiveLink(
	opts: { inPort: number; outPort: number },
	makeOsc: MakeOsc = (o) => createOsc(o),
	retryMs = RETRY_MS,
): LiveLinkHandle {
	const listeners = new Set<(path: string, args: any[]) => void>()
	let osc: Osc | null = null
	let retry: ReturnType<typeof setTimeout> | null = null

	const dispatch = (path: string, args: any[]) => {
		for (const fn of [...listeners]) {
			try {
				fn(path, args)
			} catch (err) {
				console.error("[live] listener threw:", err)
			}
		}
	}

	const open = () => {
		const sock = makeOsc({ localAddress: "127.0.0.1", localPort: opts.inPort, remotePort: opts.outPort })
		osc = sock
		sock.onMessage(dispatch)
		sock.onError((err) => {
			if (!isBindFailure(err) || osc !== sock) return
			console.error(`[live] UDP ${opts.inPort} unavailable (${(err as { code: string }).code}); retrying in ${retryMs / 1000}s`)
			sock.close()
			osc = null
			if (listeners.size && !retry)
				retry = setTimeout(() => {
					retry = null
					if (listeners.size && !osc) open()
				}, retryMs)
		})
	}

	const shut = () => {
		if (retry) clearTimeout(retry)
		retry = null
		osc?.close()
		osc = null
	}

	return {
		send: (path, ...args) => {
			osc?.send(path, ...args)
		},
		on: (fn) => {
			listeners.add(fn)
			if (!osc && !retry) open()
			return () => {
				listeners.delete(fn)
				if (!listeners.size) shut()
			}
		},
		close: shut,
	}
}
