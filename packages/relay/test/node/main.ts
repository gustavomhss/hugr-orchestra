import { Effect } from "effect"
import { smoke } from "./smoke"

// The entry node.test.ts bundles for Node: `node main.js <dir>` prints the runtime and the smoke summary as one JSON
// line.
const summary = await Effect.runPromise(smoke(process.argv[2]!))
console.log(
  JSON.stringify({
    runtime: { name: process.release.name, bun: "bun" in process.versions, node: process.versions.node },
    summary,
  }),
)
