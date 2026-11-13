import { describe, it, expect, vi } from "vitest"
import { createLiveLink, createSurfaceLink } from "../src/io/liveLink.js"

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

describe("surface link: it watches the app", () => {
	// The subscription renewals have their own tests below.
	const names = (o: ReturnType<typeof fakeOsc>) => o.sent.filter((m) => m.path !== "/surface/subscribe").map((m) => [m.path, ...m.args])
	const RELEASE = [["/surface/osc/4/release"], ["/surface/arp/call/clear"]]

	it("asks the app every second while a page listens, and stops when the last one leaves", () => {
		vi.useFakeTimers()
		const o = fakeOsc()
		const link = createSurfaceLink({ inPort: 57133, outPort: 57150 }, o.make)
		expect(link.port).toBe(57133)
		const off = link.on(() => {})
		expect(names(o)).toEqual([["/surface/get", "/surface/arp"]])
		vi.advanceTimersByTime(2000)
		expect(names(o).length).toBe(3)
		off()
		vi.advanceTimersByTime(5000)
		expect(names(o).length).toBe(3)
		vi.useRealTimers()
	})

	it("the first answer sends the release once and tells the pages, before the answer itself", () => {
		vi.useFakeTimers()
		const o = fakeOsc()
		const link = createSurfaceLink({ inPort: 57133, outPort: 57150 }, o.make)
		const a: string[] = [], b: string[] = []
		link.on((p) => a.push(p))
		link.on((p) => b.push(p))
		o.sent.length = 0
		o.incoming("/surface/arp", 0)
		expect(names(o)).toEqual(RELEASE)
		expect(a).toEqual(["/link/up", "/surface/arp"])
		expect(b).toEqual(["/link/up", "/surface/arp"])
		o.incoming("/surface/arp", 0)
		vi.advanceTimersByTime(1000)
		o.incoming("/surface/arp", 0)
		expect(names(o).filter((m) => m[0] !== "/surface/get")).toEqual(RELEASE) // only once
		expect(a.filter((p) => p === "/link/up").length).toBe(1)
		link.close()
		vi.useRealTimers()
	})

	it("after the app was away for three seconds, its return is a new link up", () => {
		vi.useFakeTimers()
		const o = fakeOsc()
		const link = createSurfaceLink({ inPort: 57133, outPort: 57150 }, o.make)
		const a: string[] = []
		link.on((p) => a.push(p))
		o.incoming("/surface/arp", 0)
		vi.advanceTimersByTime(2000) // a short gap is not away
		o.incoming("/surface/arp", 0)
		expect(a.filter((p) => p === "/link/up").length).toBe(1)
		vi.advanceTimersByTime(5000) // silence: the app is gone
		o.sent.length = 0
		o.incoming("/surface/arp", 1)
		expect(names(o)).toEqual(RELEASE)
		expect(a.filter((p) => p === "/link/up").length).toBe(2)
		link.close()
		vi.useRealTimers()
	})
})

describe("surface link: the subscription is the link's", () => {
	const subs = (o: ReturnType<typeof fakeOsc>) => o.sent.filter((m) => m.path === "/surface/subscribe").map((m) => m.args)
	const L = { inPort: 57133, outPort: 57150 }

	it("keeps `values` subscribed every 3 s while a page listens, with no page asking", () => {
		vi.useFakeTimers()
		const o = fakeOsc()
		const link = createSurfaceLink(L, o.make)
		const off = link.on(() => {})
		expect(subs(o)).toEqual([["127.0.0.1", 57133, "values"]]) // at once
		vi.advanceTimersByTime(9000)
		expect(subs(o).length).toBe(4) // 0, 3, 6, 9 s
		off()
		const n = subs(o).length
		vi.advanceTimersByTime(9000)
		expect(subs(o).length).toBe(n)
		vi.useRealTimers()
	})

	it("folds a page's own subscribe into one message, so pages cannot replace each other's topics", () => {
		vi.useFakeTimers()
		const o = fakeOsc()
		const link = createSurfaceLink(L, o.make)
		link.on(() => {})
		o.sent.length = 0
		link.send("/surface/subscribe", "127.0.0.1", 57133, "lanes")
		link.send("/surface/subscribe", "127.0.0.1", 57133, "preset")
		expect(subs(o)).toEqual([["127.0.0.1", 57133, "values", "lanes"], ["127.0.0.1", 57133, "values", "lanes", "preset"]])
		o.sent.length = 0
		vi.advanceTimersByTime(3000)
		expect(subs(o).at(-1)).toEqual(["127.0.0.1", 57133, "values", "lanes", "preset"])
		vi.advanceTimersByTime(12_000) // nobody renewed lanes or preset: they lapse, values stays
		expect(subs(o).at(-1)).toEqual(["127.0.0.1", 57133, "values"])
		link.close()
		vi.useRealTimers()
	})

	it("subscribes again when the app is found again", () => {
		vi.useFakeTimers()
		const o = fakeOsc()
		const link = createSurfaceLink(L, o.make)
		link.on(() => {})
		o.sent.length = 0
		o.incoming("/surface/arp", 0)
		expect(subs(o).length).toBe(1)
		link.close()
		vi.useRealTimers()
	})
})

describe("surface link: the app going away", () => {
	it("calls the away hook once per absence, not at the start, not while the app answers, not on close", () => {
		vi.useFakeTimers()
		const o = fakeOsc()
		const link = createSurfaceLink({ inPort: 57133, outPort: 57150 }, o.make)
		const away = vi.fn()
		link.onAway(away)
		link.on(() => {})
		vi.advanceTimersByTime(10_000) // never there: nothing went away
		expect(away).not.toHaveBeenCalled()
		o.incoming("/surface/arp", 0)
		vi.advanceTimersByTime(2000); o.incoming("/surface/arp", 0)
		expect(away).not.toHaveBeenCalled()
		vi.advanceTimersByTime(10_000) // silence
		expect(away).toHaveBeenCalledTimes(1)
		o.incoming("/surface/arp", 0) // back
		vi.advanceTimersByTime(10_000) // and gone again
		expect(away).toHaveBeenCalledTimes(2)
		o.incoming("/surface/arp", 0)
		link.close()
		vi.advanceTimersByTime(10_000)
		expect(away).toHaveBeenCalledTimes(2)
		vi.useRealTimers()
	})
})
