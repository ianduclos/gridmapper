import { describe, it, expect, vi } from "vitest"
import { createLiveLink } from "../src/io/liveLink.js"

function fakeOsc() {
	const sent: Array<{ path: string; args: any[] }> = []
	let deliver: (path: string, args: any[]) => void = () => {}
	let fail: (err: unknown) => void = () => {}
	let opened: unknown
	let opens = 0
	const close = vi.fn()
	const make = (o: any) => {
		opened = o
		opens++
		return {
			send: (path: string, ...args: any[]) => { sent.push({ path, args }) },
			onMessage: (cb: (path: string, args: any[]) => void) => { deliver = cb },
			onError: (cb: (err: unknown) => void) => { fail = cb },
			close,
		}
	}
	return {
		make, sent, close,
		incoming: (p: string, ...a: any[]) => deliver(p, a),
		error: (err: unknown) => fail(err),
		opened: () => opened,
		opens: () => opens,
	}
}

describe("liveLink", () => {
	it("binds the in-port on loopback and sends to the out-port", () => {
		const f = fakeOsc()
		createLiveLink({ inPort: 11001, outPort: 11000 }, f.make).on(() => {})
		expect(f.opened()).toEqual({ localAddress: "127.0.0.1", localPort: 11001, remotePort: 11000 })
	})

	it("sends straight through", () => {
		const f = fakeOsc()
		const link = createLiveLink({ inPort: 11001, outPort: 11000 }, f.make)
		link.on(() => {})
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
		const link = createLiveLink({ inPort: 11001, outPort: 11000 }, f.make)
		link.on(() => {})
		link.close()
		expect(f.close).toHaveBeenCalled()
	})

	it("doesn't bind until a page listens, and lets go when the last one stops", () => {
		const f = fakeOsc()
		const link = createLiveLink({ inPort: 11001, outPort: 11000 }, f.make)
		link.send("/clips/hello") // nobody listening: no socket, nothing sent
		expect(f.opens()).toBe(0)
		expect(f.sent).toEqual([])
		const offA = link.on(() => {})
		const offB = link.on(() => {})
		expect(f.opens()).toBe(1)
		offA()
		expect(f.close).not.toHaveBeenCalled()
		offB()
		expect(f.close).toHaveBeenCalledTimes(1)
	})

	it("a taken port is retried, and sends are dropped meanwhile instead of piling up", () => {
		vi.useFakeTimers()
		const err = vi.spyOn(console, "error").mockImplementation(() => {})
		try {
			const f = fakeOsc()
			const link = createLiveLink({ inPort: 11001, outPort: 11000 }, f.make, 5000)
			link.on(() => {})
			f.error(Object.assign(new Error("bind"), { code: "EADDRINUSE" }))
			expect(f.close).toHaveBeenCalledTimes(1)
			link.send("/clips/hello")
			expect(f.sent).toEqual([])
			vi.advanceTimersByTime(5000)
			expect(f.opens()).toBe(2)
			link.send("/clips/hello")
			expect(f.sent).toEqual([{ path: "/clips/hello", args: [] }])
		} finally {
			err.mockRestore()
			vi.useRealTimers()
		}
	})

	it("an error that isn't a bind failure (a bad packet) leaves a working socket alone", () => {
		const f = fakeOsc()
		const link = createLiveLink({ inPort: 11001, outPort: 11000 }, f.make)
		link.on(() => {})
		const err = vi.spyOn(console, "error").mockImplementation(() => {})
		f.error(new Error("malformed OSC packet"))
		err.mockRestore()
		expect(f.close).not.toHaveBeenCalled()
		link.send("/clips/hello")
		expect(f.sent).toHaveLength(1)
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
