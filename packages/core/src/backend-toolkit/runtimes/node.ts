import type { PinnedArtifact } from "../../pinned-artifact"
import type { Runtime } from "../manifest"

// Node pins are the sha256 lines of nodejs.org's SHASUMS256.txt for the release, in SRI form. Engine locks on this
// runtime are written by `npm install --package-lock-only --ignore-scripts` with the npm it bundles (10.9.8).
const NODE_VERSION = "22.23.2"

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

export default {
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
} satisfies Runtime
