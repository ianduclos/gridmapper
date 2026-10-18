import { describe, expect, it } from "vitest"
import osc from "osc"
import { connectGrid } from "../src/io/serialoscDriver.js"

type Msg = { address: string; args: Array<number | string> }

/** A loopback stand-in for serialoscd: one discovery port + one device server. */
async function fakeSerialosc() {
	const open = (): Promise<any> =>
		new Promise((resolve) => {
			const p = new osc.UDPPort({ localAddress: "127.0.0.1", localPort: 0, metadata: true })
			p.on("ready", () => resolve(p))
			p.open()
		})
	const discovery = await open()
	const device = await open()
	const devicePort: number = device.socket.address().port
	const received: Msg[] = []
	let clientPort = 0

	discovery.on("message", (m: any) => {
		if (m.address !== "/serialosc/list") return
		const [host, port] = m.args.map((a: any) => a.value)
		discovery.send({ address: "/serialosc/device", args: [
			{ type: "s", value: "m-test" },
			{ type: "s", value: "monome 128" },
			{ type: "i", value: devicePort },
		] }, host, port)
	})
	device.on("message", (m: any) => {
		const args = m.args.map((a: any) => a.value)
		received.push({ address: m.address, args })
		if (m.address === "/sys/port") clientPort = Number(args[0])
		if (m.address === "/sys/info") {
			device.send({ address: "/sys/size", args: [
				{ type: "i", value: 16 }, { type: "i", value: 8 },
			] }, "127.0.0.1", clientPort)
		}
	})

	return {
		discoveryPort: discovery.socket.address().port as number,
		received,
		close() {
			discovery.close()
			device.close()
		},
	}
}

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms))

describe("serialosc driver", () => {
	it("delivers a send issued right before close() (power-off blanking)", async () => {
		const fake = await fakeSerialosc()
		try {
			const grid = await connectGrid({ discoveryPort: fake.discoveryPort, timeoutMs: 1000 })
			grid.ledLevelAll(0)
			grid.close()
			await wait(150)
			expect(fake.received).toContainEqual({ address: "/monome/grid/led/level/all", args: [0] })
		} finally {
			fake.close()
		}
	})
})
