import type { ResearchPack } from "../index"
import lock from "./scip-typescript.package-lock.json"

// Pure JavaScript with no install scripts, so one lock installs on all five targets. It carries its own TypeScript 5.x
// compiler; the `typescript` oracle pack is separate and pinned independently.
const VERSION = "0.4.0"

export default {
  id: "scip-typescript",
  version: VERSION,
  license: "Apache-2.0",
  upstream: "sourcegraph/scip-typescript",
  runtime: "node",
  install: {
    kind: "npm",
    // The package.json text the lock was written from, in npm's own formatting.
    packageJson:
      JSON.stringify(
        {
          name: "research-toolkit-scip-typescript",
          private: true,
          dependencies: { "@sourcegraph/scip-typescript": VERSION },
        },
        null,
        2,
      ) + "\n",
    lock: JSON.stringify(lock, null, 2) + "\n",
  },
  launch: ["{install}/node_modules/@sourcegraph/scip-typescript/dist/src/main.js"],
  fit: { role: "indexer", languages: ["ts", "js"] },
} as const satisfies ResearchPack
