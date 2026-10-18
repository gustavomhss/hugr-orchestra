import type { ResearchPack } from "../index"
import lock from "./typescript.package-lock.json"

// The fallback oracle (J6.4). TypeScript stays on 6.x: 7.x is the native port without the JavaScript compiler API.
const VERSION = "6.0.3"

export default {
  id: "typescript",
  version: VERSION,
  license: "Apache-2.0",
  upstream: "microsoft/TypeScript",
  runtime: "node",
  install: {
    kind: "npm",
    // The package.json text the lock was written from, in npm's own formatting.
    packageJson:
      JSON.stringify(
        { name: "research-toolkit-typescript", private: true, dependencies: { typescript: VERSION } },
        null,
        2,
      ) + "\n",
    lock: JSON.stringify(lock, null, 2) + "\n",
  },
  launch: ["{install}/node_modules/typescript/lib/tsc.js"],
  fit: { role: "oracle", languages: ["ts", "js"] },
} as const satisfies ResearchPack
