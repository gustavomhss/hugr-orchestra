import type { PinnedArtifact } from "../../pinned-artifact"
import type { HostedEngine, Runtime } from "../manifest"

// placeholder: replaced by tk-go. Every digest below is fake (all zero bytes) and fails verification by design.
const FAKE = "sha256-AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=" as const
const GO_VERSION = "1.25.0"
const OGEN_VERSION = "1.24.0"

// placeholder: replaced by tk-go. The whole `go/` tree is GOROOT; the go command finds it from its own path.
const go = (asset: string, integrity: PinnedArtifact.Artifact["integrity"]) => {
  const windows = asset.endsWith(".zip")
  return {
    artifact: {
      url: `https://go.dev/dl/go${GO_VERSION}.${asset}`,
      integrity,
      format: windows ? ("zip" as const) : ("tar.gz" as const),
      entries: [{ from: "go", to: "go" }],
    },
    executable: windows ? "go/bin/go.exe" : "go/bin/go",
  }
}

export const GO: Runtime = {
  id: "go",
  version: GO_VERSION,
  license: "BSD-3-Clause",
  upstream: "golang/go",
  targets: {
    "darwin-arm64": go("darwin-arm64.tar.gz", FAKE),
    "darwin-x64": go("darwin-amd64.tar.gz", FAKE),
    "linux-arm64": go("linux-arm64.tar.gz", FAKE),
    "linux-x64": go("linux-amd64.tar.gz", FAKE),
    "win32-x64": go("windows-amd64.zip", FAKE),
  },
}

// placeholder: replaced by tk-go.
export const OGEN: HostedEngine = {
  id: "ogen",
  version: OGEN_VERSION,
  license: "Apache-2.0",
  upstream: "ogen-go/ogen",
  runtime: "go",
  install: {
    kind: "source",
    artifact: {
      url: `https://proxy.golang.org/github.com/ogen-go/ogen/@v/v${OGEN_VERSION}.zip`,
      integrity: FAKE,
      format: "zip",
      entries: [{ from: `github.com/ogen-go/ogen@v${OGEN_VERSION}`, to: "src" }],
    },
    build: "go",
    path: "./cmd/ogen",
    binary: "ogen",
  },
  launch: [],
}
