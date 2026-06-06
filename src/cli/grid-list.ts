// src/cli/grid-list.ts — discovery probe. Asks serialosc what's connected.
//   npm run grid:list
import { listDevices } from "../io/serialoscDriver.js"

const devices = await listDevices()
if (!devices.length) {
	console.log("No devices reported by serialosc.")
	console.log("  • Is the grid plugged in (and awake)?")
	console.log("  • Is serialoscd running?  →  pgrep -fl serialosc")
	process.exit(0)
}
console.log(`Found ${devices.length} device(s):`)
for (const d of devices) {
	console.log(`  ${d.id}\t${d.type}\tport ${d.port}`)
}
process.exit(0)
