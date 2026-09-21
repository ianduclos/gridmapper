// Snapshot the canonical Max tuning tables using an explicit source path.
import fs from "node:fs"
import vm from "node:vm"
import crypto from "node:crypto"

const input = process.argv[2]
if (!input) {
 throw new Error("Usage: node scripts/sync-hotelier-tunings.mjs /path/to/idk.tuning.js [output]")
}
const source = fs.readFileSync(input, "utf8")
const context = vm.createContext({
 outlet() {},
 error(message) { throw new Error(message) },
})
vm.runInContext(source, context, { timeout: 1000 })
const snapshot = {
 source: "Hotelier idk.tuning.js; see Hotelier TUNINGS.md for sources and measurement caveats.",
 sha256: crypto.createHash("sha256").update(source).digest("hex"),
 anchorKey: 69,
 anchorHz: 432,
 tables: JSON.parse(JSON.stringify(context.tunings)),
}
fs.writeFileSync(
 process.argv[3] ?? "src/data/hotelier-tunings.json",
 JSON.stringify(snapshot, null, 2) + "\n",
)
