import type { Pack } from "../manifest"

// ogen's go.mod declares `go 1.25.0`, which the Go runtime satisfies.
const VERSION = "1.24.0"

// The module zip's top-level children under its `<module>@<version>/` prefix, moved to the root of the source dir so
// the build runs in the module root next to its go.mod and go.sum.
const SOURCE = [
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

// The pin is the sha256 of the proxy's module zip, computed from the download. Recomputing the Go dirhash over the
// zip's files gave h1:NehBG/8s0JeM6jYHPJeFJntBG3cE/xQgZd1q8BchPNM=, the hash sum.golang.org records for the module.
// Its dependencies are pinned by the module's own go.sum and verified against the checksum database at build time.
export default {
  id: "ogen",
  version: VERSION,
  license: "Apache-2.0",
  upstream: "ogen-go/ogen",
  runtime: "go",
  install: {
    kind: "source",
    artifact: {
      url: `https://proxy.golang.org/github.com/ogen-go/ogen/@v/v${VERSION}.zip`,
      integrity: "sha256-QAbV57ez2whdMjgjZ2SVFjcb6Cbzc4fx9PJ9lyEZOAk=",
      format: "zip",
      entries: SOURCE.map((name) => ({ from: `github.com/ogen-go/ogen@v${VERSION}/${name}`, to: `src/${name}` })),
    },
    build: "go",
    path: "./cmd/ogen",
    binary: "ogen",
  },
  launch: [],
  fit: { role: "generator", input: "an OpenAPI description", skills: ["backend-api"] },
} as const satisfies Pack
