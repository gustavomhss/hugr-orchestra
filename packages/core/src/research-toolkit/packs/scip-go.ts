import type { ResearchPack } from "../index"

// scip-go publishes binaries for three of the five targets only, so it builds from the module source on the private
// Go runtime, as the backend's ogen does. The module moved from sourcegraph to scip-code; its go.mod declares
// `go 1.25.0`, which the Go runtime satisfies. At index time it loads packages through the host's own `go`
// toolchain (`go list`); a host without one keeps the tree-sitter layer (code-index/extract.ts).
const VERSION = "0.2.7"

// The module zip's top-level children under its `<module>@<version>/` prefix, moved to the root of the source dir.
const SOURCE = [".agents", ".github", ".gitignore", "LICENSE", "README.md", "cmd", "flake.lock", "flake.nix", "go.mod", "go.sum", "internal"]

// The pin is the sha256 of the proxy's module zip, computed from the download. Recomputing the Go dirhash over the
// zip's files gave h1:gcHFnhoMCdp3C/0xvCn9QFuTsF/W3JSR5cLVf7uG+Us=, the hash sum.golang.org records for the module.
// Its dependencies are pinned by the module's own go.sum and verified against the checksum database at build time.
export default {
  id: "scip-go",
  version: VERSION,
  license: "Apache-2.0",
  upstream: "scip-code/scip-go",
  runtime: "go",
  install: {
    kind: "source",
    artifact: {
      url: `https://proxy.golang.org/github.com/scip-code/scip-go/@v/v${VERSION}.zip`,
      integrity: "sha256-UrTV3vykBXbGTyGhlsYeCMxUSB1yy25Yor2gfLtB5wE=",
      format: "zip",
      entries: SOURCE.map((name) => ({ from: `github.com/scip-code/scip-go@v${VERSION}/${name}`, to: `src/${name}` })),
    },
    build: "go",
    path: "./cmd/scip-go",
    binary: "scip-go",
  },
  launch: [],
  fit: { role: "indexer", languages: ["go"] },
} as const satisfies ResearchPack
