import type { PinnedArtifact } from "../../pinned-artifact"
import type { TargetId } from "../target"
import orvalLock from "./node-orval.package-lock.json"
import protocGenEsLock from "./node-protoc-gen-es.package-lock.json"
import type { HostedEngine, Runtime } from "../manifest"

// Node pins are the sha256 lines of nodejs.org's SHASUMS256.txt for the release, in SRI form. The engine locks were
// written by `npm install --package-lock-only --ignore-scripts` with npm 10.9.8 (the npm this Node bundles); they keep
// every platform's optional packages (esbuild's among them), so one lock installs on all five targets.
const NODE_VERSION = "22.23.2"
const ORVAL_VERSION = "8.39.0"
const PROTOC_GEN_ES_VERSION = "2.16.0"

// Only the interpreter, the bundled npm and the license are installed. Archive symlinks (bin/npm, bin/npx) are left
// out: npm runs as `<node> lib/node_modules/npm/bin/npm-cli.js` (Windows: `node_modules/npm/bin/npm-cli.js`).
const unix = (asset: string, integrity: PinnedArtifact.Artifact["integrity"]) => ({
  artifact: {
    url: `https://nodejs.org/dist/v${NODE_VERSION}/node-v${NODE_VERSION}-${asset}.tar.gz`,
    integrity,
    format: "tar.gz" as const,
    entries: [
      { from: `node-v${NODE_VERSION}-${asset}/bin/node`, to: "bin/node", executable: true },
      { from: `node-v${NODE_VERSION}-${asset}/lib`, to: "lib" },
      { from: `node-v${NODE_VERSION}-${asset}/LICENSE`, to: "LICENSE" },
    ],
  },
  executable: "bin/node",
})

export const NODE: Runtime = {
  id: "node",
  version: NODE_VERSION,
  license: "MIT",
  upstream: "nodejs/node",
  targets: {
    "darwin-arm64": unix("darwin-arm64", "sha256-YRMPOUwWMNIR3VCuzENT03lIDzbTrJE82F27oa7VhcY="),
    "darwin-x64": unix("darwin-x64", "sha256-WOmQIsL/iTlVdsx/1NmM6iS7aAgUddX4i4Ae6HKfsCY="),
    "linux-arm64": unix("linux-arm64", "sha256-ATtZz9KBlwOm9KFKuJH8RvwqTj9bzZLeP7SSm0PjWzA="),
    "linux-x64": unix("linux-x64", "sha256-spSlVuY51kM4gjkg5YZsIcAnQXQtLhUp7hoiXB7JJSo="),
    "win32-x64": {
      artifact: {
        url: `https://nodejs.org/dist/v${NODE_VERSION}/node-v${NODE_VERSION}-win-x64.zip`,
        integrity: "sha256-EXe0E3ulrapWNUrkDxCAx0UOiuCc7LR9pFnRxSrJn5c=",
        format: "zip",
        entries: [
          { from: `node-v${NODE_VERSION}-win-x64/node.exe`, to: "node.exe", executable: true },
          { from: `node-v${NODE_VERSION}-win-x64/node_modules`, to: "node_modules" },
          { from: `node-v${NODE_VERSION}-win-x64/LICENSE`, to: "LICENSE" },
        ],
      },
      executable: "node.exe",
    },
  },
}

export const ORVAL: HostedEngine = {
  id: "orval",
  version: ORVAL_VERSION,
  license: "MIT",
  upstream: "orval-labs/orval",
  runtime: "node",
  install: {
    kind: "npm",
    packageJson: packageJson("backend-toolkit-orval", { orval: ORVAL_VERSION }),
    lock: JSON.stringify(orvalLock, null, 2) + "\n",
  },
  launch: ["{install}/node_modules/orval/dist/bin/orval.mjs"],
}

export const PROTOC_GEN_ES: HostedEngine = {
  id: "protoc-gen-es",
  version: PROTOC_GEN_ES_VERSION,
  license: "Apache-2.0",
  upstream: "bufbuild/protobuf-es",
  runtime: "node",
  install: {
    kind: "npm",
    packageJson: packageJson("backend-toolkit-protoc-gen-es", { "@bufbuild/protoc-gen-es": PROTOC_GEN_ES_VERSION }),
    lock: JSON.stringify(protocGenEsLock, null, 2) + "\n",
  },
  launch: ["{install}/node_modules/@bufbuild/protoc-gen-es/bin/protoc-gen-es"],
}

/** The package.json text the lock was written from, in npm's own formatting. */
function packageJson(name: string, dependencies: Record<string, string>) {
  return JSON.stringify({ name, private: true, dependencies }, null, 2) + "\n"
}
