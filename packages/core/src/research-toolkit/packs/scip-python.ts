import type { ResearchPack } from "../index"
import lock from "./scip-python.package-lock.json"

// A bundled pyright fork in pure JavaScript with no install scripts, so one lock installs on all five targets. It runs
// on node and reads the project's Python source and installed packages; it needs no Python interpreter to index the
// project's own files.
const VERSION = "0.6.6"

export default {
  id: "scip-python",
  version: VERSION,
  license: "MIT",
  upstream: "sourcegraph/scip-python",
  runtime: "node",
  install: {
    kind: "npm",
    // The package.json text the lock was written from, in npm's own formatting.
    packageJson:
      JSON.stringify(
        {
          name: "research-toolkit-scip-python",
          private: true,
          dependencies: { "@sourcegraph/scip-python": VERSION },
        },
        null,
        2,
      ) + "\n",
    lock: JSON.stringify(lock, null, 2) + "\n",
  },
  launch: ["{install}/node_modules/@sourcegraph/scip-python/index.js"],
  fit: { role: "indexer", languages: ["py"] },
} as const satisfies ResearchPack
