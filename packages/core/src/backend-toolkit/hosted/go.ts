import type { PinnedArtifact } from "../../pinned-artifact"
import type { TargetId } from "../target"
import type { HostedEngine, Runtime } from "../manifest"


// Go pins are the sha256 fields of https://go.dev/dl/?mode=json&include=all for the release, in SRI form; each download
// hashed to the same value when pinning. ogen 1.24.0's go.mod declares `go 1.25.0`, which this toolchain satisfies.
const GO_VERSION = "1.25.14"
const OGEN_VERSION = "1.24.0"
const OGEN_MODULE = `github.com/ogen-go/ogen@v${OGEN_VERSION}`

// Every archive holds one `go/` tree with these children; all of them move, so the runtime is a complete GOROOT
// (`go.env` carries the toolchain's defaults, `pkg/tool` its compiler and linker).
const GOROOT = [
  "CONTRIBUTING.md",
  "LICENSE",
  "PATENTS",
  "README.md",
  "SECURITY.md",
  "VERSION",
  "api",
  "bin",
  "codereview.cfg",
  "doc",
  "go.env",
  "lib",
  "misc",
  "pkg",
  "src",
  "test",
]

// The module zip's top-level children under its `<module>@<version>/` prefix, moved to the root of the source dir so
// the build runs in the module root next to its go.mod and go.sum.
const OGEN_SOURCE = [
  ".codecov.yaml",
  ".editorconfig",
  ".gitattributes",
  ".github",
  ".gitignore",
  ".golangci.yml",
  "CONTRIBUTING.md",
  "Dockerfile",
  "LICENSE",
  "Makefile",
  "README.md",
  "SECURITY.md",
  "_logo",
  "_testdata",
  "cmd",
  "conv",
  "dsl.go",
  "dsl_test.go",
  "gen",
  "gen_bench_test.go",
  "gen_test.go",
  "go.coverage.sh",
  "go.mod",
  "go.sum",
  "go.test.sh",
  "http",
  "internal",
  "json",
  "jsonpointer",
  "jsonschema",
  "location",
  "location_test.go",
  "middleware",
  "ogen.go",
  "ogen_test.go",
  "ogenerrors",
  "ogenregex",
  "openapi",
  "otelogen",
  "schema.go",
  "schema_backcomp.go",
  "schema_test.go",
  "security_scheme.go",
  "spec.go",
  "spec_test.go",
  "sse",
  "tools",
  "uri",
  "validate",
]

const go = (asset: string, integrity: PinnedArtifact.Artifact["integrity"]) => {
  const windows = asset.startsWith("windows-")
  return {
    artifact: {
      url: `https://go.dev/dl/go${GO_VERSION}.${asset}.${windows ? "zip" : "tar.gz"}`,
      integrity,
      format: windows ? ("zip" as const) : ("tar.gz" as const),
      entries: GOROOT.map((name) => ({ from: `go/${name}`, to: name })),
    },
    executable: windows ? "bin/go.exe" : "bin/go",
  }
}

export const GO: Runtime = {
  id: "go",
  version: GO_VERSION,
  license: "BSD-3-Clause",
  upstream: "golang/go",
  targets: {
    "darwin-arm64": go("darwin-arm64", "sha256-WybAtvMIJA/KJhT7AvYiz8yMDMO2nHi7pIRUiaRZAlk="),
    "darwin-x64": go("darwin-amd64", "sha256-sJCHpn1Xkqiw/L90IS1iVgyUrIqP11D/kg2MtfHiARg="),
    "linux-arm64": go("linux-arm64", "sha256-m/I06nD/7JNH/fayLOSt1RcX0zhqOKRB6Mh0P8616u4="),
    "linux-x64": go("linux-amd64", "sha256-ohrlYzomm81+kM92fkgiVjN5XpnYMXQsvzOXBk/udxI="),
    "win32-x64": go("windows-amd64", "sha256-EZBEqSs5h8NBzWrrslZnbdR4DSkve05yo+mXZneEFpc="),
  },
}

// The pin is the sha256 of the proxy's module zip, computed from the download. Recomputing the Go dirhash over the
// zip's files gave h1:NehBG/8s0JeM6jYHPJeFJntBG3cE/xQgZd1q8BchPNM=, the hash sum.golang.org records for the module.
// Its dependencies are pinned by the module's own go.sum and verified against the checksum database at build time.
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
      integrity: "sha256-QAbV57ez2whdMjgjZ2SVFjcb6Cbzc4fx9PJ9lyEZOAk=",
      format: "zip",
      entries: OGEN_SOURCE.map((name) => ({ from: `${OGEN_MODULE}/${name}`, to: `src/${name}` })),
    },
    build: "go",
    path: "./cmd/ogen",
    binary: "ogen",
  },
  launch: [],
}
