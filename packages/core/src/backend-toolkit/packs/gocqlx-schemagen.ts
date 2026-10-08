import type { Pack } from "../manifest"

// gocqlx's go.mod declares `go 1.21`, which the Go runtime satisfies. schemagen is a package of the v3 module, not a
// module of its own, so the pin is the whole module.
const VERSION = "3.0.4"

// The module zip's top-level children under its `<module>@<version>/` prefix, moved to the root of the source dir so
// the build runs in the module root next to its go.mod and go.sum.
const SOURCE = [
  ".github",
  ".gitignore",
  ".golangci.yml",
  "LICENSE",
  "Makefile",
  "README.md",
  "batchx.go",
  "batchx_test.go",
  "benchmark_test.go",
  "cmd",
  "dbutil",
  "doc.go",
  "doc_test.go",
  "example_test.go",
  "go.mod",
  "go.sum",
  "gocqlx.go",
  "gocqlxtest",
  "iterx.go",
  "iterx_test.go",
  "mapper.go",
  "migrate",
  "qb",
  "queryx.go",
  "queryx_bench_test.go",
  "queryx_test.go",
  "queryx_wrap.go",
  "renovate.json",
  "session.go",
  "table",
  "testdata",
  "transformer.go",
  "udt.go",
]

// The pin is the sha256 of the proxy's module zip, computed from the download. `go mod download` of the same zip
// verified it against h1:37rMVFEUlsGGNYB7OLR7991KwBYR2WA5TU7wtduClas=, the hash sum.golang.org records for the module.
// Its dependencies are pinned by the module's own go.sum and verified against the checksum database at build time.
export default {
  id: "gocqlx-schemagen",
  version: `${VERSION}+orchestra.cassandra1`,
  license: "Apache-2.0",
  // Owned build: unchanged gocqlx v3.0.4 generator + Scylla gocql v1.15.3 with the catalog-availability backport.
  // Both upstream licenses and source notices remain in the install; provenance and byte pins live in the helper.
  upstream: "scylladb/gocqlx",
  runtime: "go",
  install: {
    kind: "source",
    artifact: {
      url: `https://proxy.golang.org/github.com/scylladb/gocqlx/v3/@v/v${VERSION}.zip`,
      integrity: "sha256-wvq2iEEB9xQiuX2E19BS8d3AdTRECF54YDWzrOm9aDc=",
      format: "zip",
      entries: SOURCE.map((name) => ({ from: `github.com/scylladb/gocqlx/v3@v${VERSION}/${name}`, to: `src/${name}` })),
    },
    build: "go",
    path: "./cmd/schemagen",
    binary: "gocqlx-schemagen",
    compatibility: "cassandra-metadata",
  },
  launch: [],
  fit: {
    role: "generator",
    input: "a disposable Cassandra or Scylla cluster holding the packet's keyspace schema",
    skills: ["backend-data"],
  },
} as const satisfies Pack
