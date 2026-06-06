// src/cli/grid-log.ts — connect to a real grid, log key presses, and echo each
// held key as a lit LED. Proves 2-way communication with the hardware.
//   npm run grid:log
import { connectGrid } from "../io/serialoscDriver.js"

const grid = await connectGrid()
console.log(`Connected: ${grid.size.width}×${grid.size.height} grid. Press buttons (Ctrl-C to quit).`)

grid.ledLevelAll(0)
grid.onKey((e) => {
	console.log(`KEY ${e.s ? "↓" : "↑"} (${e.x}, ${e.y})`)
	grid.ledLevelSet(e.x, e.y, e.s ? 15 : 0) // light while held
})

process.on("SIGINT", () => {
	grid.ledLevelAll(0)
	setTimeout(() => {
		grid.close()
		process.exit(0)
	}, 50)
})
