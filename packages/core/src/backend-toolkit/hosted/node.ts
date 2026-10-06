// placeholder: replaced by tk-node
import type { HostedEngine, Runtime } from "../manifest"

// placeholder: replaced by tk-node. Every pin below is fake and fails integrity on purpose.
const FAKE = "sha256-AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=" as const
const pin = (executable: string) => ({
  artifact: { url: "https://placeholder.invalid/node.tar.gz", integrity: FAKE, format: "tar.gz" as const, entries: [] },
  executable,
})

export const NODE: Runtime = {
  id: "node",
  version: "0.0.0-placeholder",
  license: "placeholder",
  upstream: "placeholder/node",
  targets: {
    "darwin-arm64": pin("bin/node"),
    "darwin-x64": pin("bin/node"),
    "linux-arm64": pin("bin/node"),
    "linux-x64": pin("bin/node"),
    "win32-x64": pin("node.exe"),
  },
}

export const ORVAL: HostedEngine = {
  id: "orval",
  version: "0.0.0-placeholder",
  license: "placeholder",
  upstream: "placeholder/orval",
  runtime: "node",
  install: { kind: "npm", packageJson: "{}", lock: "{}" },
  launch: ["{install}/node_modules/orval/dist/bin/orval.js"],
}

export const PROTOC_GEN_ES: HostedEngine = {
  id: "protoc-gen-es",
  version: "0.0.0-placeholder",
  license: "placeholder",
  upstream: "placeholder/protoc-gen-es",
  runtime: "node",
  install: { kind: "npm", packageJson: "{}", lock: "{}" },
  launch: ["{install}/node_modules/@bufbuild/protoc-gen-es/bin/protoc-gen-es"],
}
