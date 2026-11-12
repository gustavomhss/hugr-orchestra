import { runWorker } from "../../../codemode/src/worker-runtime.ts"

// Diagnostic only: let module evaluation finish while the identical runtime Promise remains pending.
runWorker().catch((error) => {
  process.stderr.write("E10_WORKER_ENTRY_ERROR " + JSON.stringify({
    name: error instanceof Error ? error.name.slice(0, 40) : "Unknown",
    message: String(error instanceof Error ? error.message : error).slice(0, 160),
  }) + "\n")
  process.exitCode = 1
  close()
})
