import { describe, it, expect, vi } from "vitest"
import { createLiveLink } from "../src/io/liveLink.js"

function fakeOsc() {
	const sent: Array<{ path: string; args: any[] }> = []
	let deliver: (path: string, args: any[]) => void = () => {}
	let opened: unknown
	const close = vi.fn()
	const make = (o: any) => {
		opened = o
		return {
			send: (path: string, ...args: any[]) => { sent.push({ path, args }) },
			onMessage: (cb: (path: string, args: any[]) => void) => { deliver = cb },
			close,
		}
	}
	return { make, sent, close, incoming: (p: string, ...a: any[]) => deliver(p, a), opened: () => opened }
}

describe("liveLink", () => {
	it("binds the in-port on loopback and sends to the out-port", () => {
		const f = fakeOsc()
		createLiveLink({ inPort: 11001, outPort: 11000 }, f.make)
		expect(f.opened()).toEqual({ localAddress: "127.0.0.1", localPort: 11001, remotePort: 11000 })
	})

	it("sends straight through", () => {
		const f = fakeOsc()
		const link = createLiveLink({ inPort: 11001, outPort: 11000 }, f.make)
		link.send("/clips/slot/button", 3, 2, 1)
		expect(f.sent).toEqual([{ path: "/clips/slot/button", args: [3, 2, 1] }])
	})

	it("fans every message out to each listener until it unsubscribes", () => {
		const f = fakeOsc()
		const link = createLiveLink({ inPort: 11001, outPort: 11000 }, f.make)
		const a: string[] = []
		const b: string[] = []
		const offA = link.on((p) => a.push(p))
		link.on((p) => b.push(p))
		f.incoming("/clips/beat", 1)
		offA()
		f.incoming("/clips/beat", 2)
		expect(a).toEqual(["/clips/beat"])
		expect(b).toEqual(["/clips/beat", "/clips/beat"])
	})

	it("a listener that throws doesn't stop the others", () => {
		const f = fakeOsc()
		const link = createLiveLink({ inPort: 11001, outPort: 11000 }, f.make)
		const err = vi.spyOn(console, "error").mockImplementation(() => {})
		const got: string[] = []
		link.on(() => { throw new Error("boom") })
		link.on((p) => got.push(p))
		f.incoming("/clips/hello")
		expect(got).toEqual(["/clips/hello"])
		expect(err).toHaveBeenCalled()
		err.mockRestore()
	})

	it("close() closes the socket", () => {
		const f = fakeOsc()
		createLiveLink({ inPort: 11001, outPort: 11000 }, f.make).close()
		expect(f.close).toHaveBeenCalled()
	})

	it("round-trips a real datagram over loopback", async () => {
		const port = 47000 + Math.floor(Math.random() * 1000)
		const link = createLiveLink({ inPort: port, outPort: port }) // talks to itself
		try {
			const got = new Promise<{ path: string; args: any[] }>((resolve) =>
				link.on((path, args) => resolve({ path, args })),
			)
			link.send("/clips/hello")
			const timeout = new Promise((_, reject) => setTimeout(() => reject(new Error("no datagram")), 1000))
			await expect(Promise.race([got, timeout])).resolves.toEqual({ path: "/clips/hello", args: [] })
		} finally {
			link.close()
		}
	})
})
