import type { Pack } from "../manifest"
import lock from "./orval.package-lock.json"

// The lock keeps every platform's optional packages (esbuild's among them), so one lock installs on all five targets.
const VERSION = "8.39.0"

export default {
  id: "orval",
  version: VERSION,
  license: "MIT",
  upstream: "orval-labs/orval",
  runtime: "node",
  install: {
    kind: "npm",
    // The package.json text the lock was written from, in npm's own formatting.
    packageJson:
      JSON.stringify({ name: "backend-toolkit-orval", private: true, dependencies: { orval: VERSION } }, null, 2) +
      "\n",
    lock: JSON.stringify(lock, null, 2) + "\n",
  },
  launch: ["{install}/node_modules/orval/dist/bin/orval.mjs"],
  fit: { role: "generator", input: "an OpenAPI description", skills: ["backend-api"] },
} as const satisfies Pack
