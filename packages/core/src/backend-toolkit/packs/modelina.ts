import type { Pack } from "../manifest"
import lock from "./modelina.package-lock.json"

// The AsyncAPI CLI's `generate models` delegates to this package, so it is the engine itself without the CLI's
// server, generator and linter. The lock's `node_modules/npm/node_modules/*` entries are bundled inside the npm tarball
// that @oclif/plugin-plugins depends on; that tarball's integrity covers them.
const VERSION = "5.10.1"

export default {
  id: "modelina",
  version: VERSION,
  license: "Apache-2.0",
  upstream: "asyncapi/modelina",
  runtime: "node",
  install: {
    kind: "npm",
    // The package.json text the lock was written from, in npm's own formatting.
    packageJson:
      JSON.stringify(
        { name: "backend-toolkit-modelina", private: true, dependencies: { "@asyncapi/modelina-cli": VERSION } },
        null,
        2,
      ) + "\n",
    lock: JSON.stringify(lock, null, 2) + "\n",
  },
  launch: ["{install}/node_modules/@asyncapi/modelina-cli/bin/run_bin"],
  fit: { role: "generator", input: "an AsyncAPI document", skills: ["backend-api"] },
} as const satisfies Pack
