// src/io/osc.ts — OSC transport to/from the app world (Max).
//
// This is the *application* OSC seam (talking to Max), NOT the device link.
// Talking to the grid goes through serialosc on its own UDP ports — see
// io/serialoscDriver.ts. Defaults: listen 57131, send 57130 (override per app).
//
// NB: gridmapper deliberately uses the 5713x block. twistermapper runs constantly
// and holds 57120/57121, so we must not collide with it.

import { toFixedN } from "../util/scale.js"

// The 'osc' package ships without TS types; keep it loose for NodeNext ESM.
// @ts-ignore
import osc from "osc"

export type Osc = {
	send: (path: string, ...args: Array<number | string | boolean>) => void
	onMessage: (cb: (path: string, args: any[]) => void) => void
	close: () => void
}

export function createOsc(opts?: {
	localAddress?: string // default 0.0.0.0
	localPort?: number // default 57131
	remoteAddress?: string // default 127.0.0.1
	remotePort?: number // default 57130
}): Osc {
	const udpPort = new osc.UDPPort({
		localAddress: opts?.localAddress ?? "0.0.0.0",
		localPort: opts?.localPort ?? 57131,
		remoteAddress: opts?.remoteAddress ?? "127.0.0.1",
		remotePort: opts?.remotePort ?? 57130,
		metadata: true,
	})

	let ready = false
	const queue: { address: string; args: any[] }[] = []

	udpPort.on("ready", () => {
		ready = true
		while (queue.length) udpPort.send(queue.shift()!)
	})
	udpPort.on("error", (err: unknown) => console.error("[OSC] UDP error:", err))

	const buildArgs = (args: Array<number | string | boolean>) =>
		args.map((a) => {
			if (typeof a === "boolean") return { type: a ? "T" : "F" }
			if (typeof a === "number") {
				if (Number.isInteger(a)) return { type: "i", value: a | 0 }
				return { type: "f", value: toFixedN(a, 5) }
			}
			return { type: "s", value: String(a) }
		})

	const send = (path: string, ...args: Array<number | string | boolean>) => {
		const msg = { address: path, args: buildArgs(args) }
		if (!ready) {
			queue.push(msg)
			return
		}
		udpPort.send(msg)
	}

	const onMessage = (cb: (path: string, args: any[]) => void) => {
		udpPort.on("message", (m: any) => {
			const args = (m.args ?? []).map((a: any) => {
				if (a.type === "T") return true
				if (a.type === "F") return false
				return a.value ?? a
			})
			cb(m.address, args)
		})
	}

	const close = () => {
		try {
			udpPort.close()
		} catch {}
	}

	udpPort.open()
	return { send, onMessage, close }
}
