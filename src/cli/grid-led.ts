// src/cli/grid-led.ts — connect to a real grid and run a short LED animation,
// then clear. Proves the output direction (app → grid LEDs).
//   npm run grid:led
import { connectGrid } from "../io/serialoscDriver.js"

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

const grid = await connectGrid()
const { width: w, height: h } = grid.size
console.log(`Connected: ${w}×${h}. Running LED sweep…`)

grid.ledLevelAll(0)
await sleep(150)

// Column sweep with a varibright trail.
for (let x = 0; x < w; x++) {
	for (let y = 0; y < h; y++) grid.ledLevelSet(x, y, 15)
	if (x > 0) for (let y = 0; y < h; y++) grid.ledLevelSet(x - 1, y, 4)
	if (x > 1) for (let y = 0; y < h; y++) grid.ledLevelSet(x - 2, y, 0)
	await sleep(60)
}
for (let y = 0; y < h; y++) {
	grid.ledLevelSet(w - 1, y, 4)
	grid.ledLevelSet(w - 2, y, 0)
}
await sleep(120)

// Brightness ramp across the whole surface, then clear.
for (let l = 15; l >= 0; l--) {
	grid.ledLevelAll(l)
	await sleep(45)
}

grid.ledLevelAll(0)
await sleep(50)
grid.close()
console.log("Done.")
process.exit(0)
