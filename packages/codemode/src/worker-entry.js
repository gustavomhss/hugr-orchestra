import { parentPort } from "node:worker_threads"
import { runWorker } from "./worker-runtime.ts"

// Bun 1.3.14 dispatches parent messages after module evaluation; observe the root Promise without awaiting it here.
runWorker().catch(() => {
  process.exitCode = 1
  parentPort?.close()
})
