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
	tag = "live",
): LiveLinkHandle {
	const listeners = new Set<(path: string, args: any[]) => void>()
	let osc: Osc | null = null
	let retry: ReturnType<typeof setTimeout> | null = null

	const dispatch = (path: string, args: any[]) => {
		for (const fn of [...listeners]) {
			try {
				fn(path, args)
			} catch (err) {
				console.error(`[${tag}] listener threw:`, err)
			}
		}
	}

	const open = () => {
		const sock = makeOsc({ localAddress: "127.0.0.1", localPort: opts.inPort, remotePort: opts.outPort })
		osc = sock
		sock.onMessage(dispatch)
		sock.onError((err) => {
			if (!isBindFailure(err) || osc !== sock) return
			console.error(`[${tag}] UDP ${opts.inPort} unavailable (${(err as { code: string }).code}); retrying in ${retryMs / 1000}s`)
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

/** How often the surface link asks the app something, to know it is there. */
export const SURFACE_PROBE_MS = 1000
/** No word from the app for this long: it is away. */
export const SURFACE_AWAY_MS = 3000
/** What the probe asks (any cheap address; the pages want this one anyway). */
export const SURFACE_PROBE_ADDR = "/surface/arp"
/** Sent to the app each time it is found (again): let go of everything the grid held. */
export const SURFACE_RELEASE = ["/surface/osc/4/release", "/surface/arp/call/clear"] as const
/**
 * A message the LINK makes up, never the app: the app has just been found, at the agent's
 * start or after it was away. The link has already sent SURFACE_RELEASE; a page hearing
 * this empties its picture of what it holds and reads the app's state again.
 */
export const SURFACE_LINK_UP = "/link/up"

/**
 * The idk.surface link: a THIRD peer, same lazy socket as the Live link. Surface listens on
 * 57150 and answers /surface/get on the socket that asked; a subscribe names our port, so
 * the page needs to know it (`port`). The surface pages use it.
 *
 * It also WATCHES the app (Ian, 2026-11-13): while a page listens it asks SURFACE_PROBE_ADDR
 * every SURFACE_PROBE_MS. The first answer, and the first one after SURFACE_AWAY_MS of
 * silence, means the app is (back) there: the link sends SURFACE_RELEASE once, then tells
 * every page SURFACE_LINK_UP, before the pages see the answer itself. That is what ends notes
 * a restarted agent left ringing, and what makes every page re-read after either side restarts.
 */
export function createSurfaceLink(
	opts: { inPort: number; outPort: number },
	makeOsc?: MakeOsc,
	retryMs = RETRY_MS,
): LiveLinkHandle & { port: number; onAway: (fn: () => void) => void } {
	const base = createLiveLink(opts, makeOsc, retryMs, "surface")
	let away: (() => void) | null = null
	const pages = new Set<(path: string, args: any[]) => void>()
	let unwatch: (() => void) | null = null
	let timer: ReturnType<typeof setInterval> | null = null
	let up = false
	let heardAt = 0

	const watch = (path: string) => {
		if (!path.startsWith("/surface/")) return
		heardAt = Date.now()
		if (up) return
		up = true
		for (const a of SURFACE_RELEASE) base.send(a)
		for (const fn of [...pages]) {
			try {
				fn(SURFACE_LINK_UP, [])
			} catch (err) {
				console.error("[surface] listener threw:", err)
			}
		}
	}
	const probe = () => {
		if (up && Date.now() - heardAt > SURFACE_AWAY_MS) {
			up = false
			// Once per absence: the host's hook (core/surfaceAutosave.ts saves the preset).
			try {
				away?.()
			} catch (err) {
				console.error("[surface] the away hook threw:", err)
			}
		}
		base.send("/surface/get", SURFACE_PROBE_ADDR)
	}
	const stop = () => {
		if (timer) clearInterval(timer)
		timer = null
		unwatch?.()
		unwatch = null
		up = false
	}

	return {
		port: opts.inPort,
		/** Called once each time the app, having been there, stops answering. Not on close. */
		onAway: (fn) => { away = fn },
		send: base.send,
		on: (fn) => {
			// The watcher listens first, so a page hears SURFACE_LINK_UP before the answer that caused it.
			if (!unwatch) {
				unwatch = base.on(watch)
				timer = setInterval(probe, SURFACE_PROBE_MS)
				probe()
			}
			pages.add(fn)
			const off = base.on(fn)
			return () => {
				off()
				pages.delete(fn)
				if (!pages.size) stop()
			}
		},
		close: () => {
			stop()
			base.close()
		},
	}
}
