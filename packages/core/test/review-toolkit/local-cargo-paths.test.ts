import { expect, test } from "bun:test"
import { ReviewLocalCargoPaths } from "../../src/review-toolkit/local-cargo-paths"

const manifest = (path: string, value: unknown) => ({ path, value })
const packageValue = (extra: Record<string, unknown> = {}) => ({
  package: {
    name: "fixture",
    version: "0.1.0",
    readme: "README.md",
    "license-file": "LICENSE",
    build: "build.rs",
    ...extra,
  },
  lib: { path: "src/lib.rs" },
  bin: [{ path: "src/main.rs" }],
  test: [{ path: "tests/unit.rs" }],
  bench: [{ path: "benches/bench.rs" }],
  example: [{ path: "examples/demo.rs" }],
  dependencies: { local: { path: "../sibling" } },
  "dev-dependencies": { dev: { path: "dev" } },
  "build-dependencies": { build: { path: "build-dep" } },
  target: { "cfg(unix)": { dependencies: { platform: { path: "unix-dep" } } } },
  patch: { crates: { patched: { path: "patched" } } },
  replace: { "old:1.0": { path: "replacement" } },
})
const files = [
  "Cargo.toml",
  "pkg/Cargo.toml",
  "pkg/src/lib.rs",
  "pkg/src/main.rs",
  "pkg/tests/unit.rs",
  "pkg/benches/bench.rs",
  "pkg/examples/demo.rs",
  "sibling/Cargo.toml",
  "pkg/sibling/Cargo.toml",
  "pkg/dev/Cargo.toml",
  "pkg/build-dep/Cargo.toml",
  "pkg/unix-dep/Cargo.toml",
  "pkg/patched/Cargo.toml",
  "pkg/replacement/Cargo.toml",
  "pkg/sub/Cargo.toml",
]

test("allows contained known fields, internal ../ sibling references, and projected workspace globs", () => {
  const root = manifest("Cargo.toml", {
    workspace: {
      members: ["pkg/*"],
      "default-members": ["pkg/?ub"],
      exclude: ["pkg/ignored"],
      package: { readme: "README.md", "license-file": "LICENSE" },
      dependencies: { shared: { path: "pkg/sibling" } },
      metadata: { arbitrary: { path: "../../outside" } },
    },
  })
  const child = manifest("pkg/Cargo.toml", packageValue({ workspace: "..", metadata: { custom: { path: "/outside-metadata" } } }))
  expect(ReviewLocalCargoPaths.check([root, child], files)).toBeUndefined()
  expect(ReviewLocalCargoPaths.check([manifest("pkg/Cargo.toml", { workspace: { members: ["../sibling"] } })], files)).toBeUndefined()
  const members = Array.from({ length: 129 }, (_, i) => `m${i}`)
  expect(ReviewLocalCargoPaths.check([manifest("Cargo.toml", { workspace: { members } })], [...files, ...members.map((dir) => `${dir}/Cargo.toml`)])).toBeUndefined()
})

test("rejects outside paths in every source, dependency, workspace, patch, and replace field", () => {
  const values: unknown[] = [
    { package: { name: "x", version: "1", readme: "../../outside" } },
    { package: { name: "x", version: "1", build: "../../outside" } },
    { lib: { path: "../../outside.rs" } },
    { bin: [{ path: "../../outside.rs" }] },
    { test: [{ path: "../../outside.rs" }] },
    { bench: [{ path: "../../outside.rs" }] },
    { example: [{ path: "../../outside.rs" }] },
    { dependencies: { x: { path: "../../outside" } } },
    { "dev-dependencies": { x: { path: "../../outside" } } },
    { "build-dependencies": { x: { path: "../../outside" } } },
    { target: { cfg: { dependencies: { x: { path: "../../outside" } } } } },
    { package: { workspace: "../../outside" } },
    { package: { "license-file": "../../outside" } },
    { workspace: { package: { readme: "../../outside" } } },
    { workspace: { package: { "license-file": "../../outside" } } },
    { workspace: { dependencies: { x: { path: "../../outside" } } } },
    { patch: { crates: { x: { path: "../../outside" } } } },
    { replace: { "x:1": { path: "../../outside" } } },
    { workspace: { members: ["../../outside"] } },
    { workspace: { "default-members": ["../../outside"] } },
    { workspace: { exclude: ["../../outside"] } },
  ]
  for (const kind of ["dev-dependencies", "build-dependencies"]) values.push({ target: { cfg: { [kind]: { x: { path: "../../outside" } } } } })
  for (const value of values) {
    expect(ReviewLocalCargoPaths.check([manifest("pkg/Cargo.toml", { package: { name: "x" }, ...(value as Record<string, unknown>) })], files)).toEqual({
      status: "not-run",
      reason: "cargo-path-outside",
    })
  }
  for (const value of ["/outside", "C:/outside", String.raw`..\outside`, "../..\0outside"]) {
    expect(ReviewLocalCargoPaths.check([manifest("pkg/Cargo.toml", { package: { name: "x" }, lib: { path: value } })], files)?.reason).toBe("cargo-path-outside")
  }
})

test("refuses missing projected targets or dependency manifests and unsupported glob syntax", () => {
  expect(ReviewLocalCargoPaths.check([manifest("pkg/Cargo.toml", { package: { name: "x" }, lib: { path: "src/missing.rs" } })], files)?.reason).toBe("cargo-path-missing")
  expect(ReviewLocalCargoPaths.check([manifest("pkg/Cargo.toml", { package: { name: "x" }, dependencies: { absent: { path: "absent" } } })], files)?.reason).toBe("cargo-path-missing")
  expect(ReviewLocalCargoPaths.check([manifest("pkg/Cargo.toml", { package: { name: "x" }, lib: { path: "src/*.rs" } })], files)?.reason).toBe("cargo-path-unsupported")
  expect(ReviewLocalCargoPaths.check([manifest("pkg/Cargo.toml", { package: { name: "x" }, dependencies: { x: { path: "dep*" } } })], files)?.reason).toBe("cargo-path-unsupported")
  expect(ReviewLocalCargoPaths.check([manifest("Cargo.toml", { workspace: { members: ["pkg/[ab]"] } })], files)?.reason).toBe("cargo-path-unsupported")
  expect(ReviewLocalCargoPaths.check([manifest("Cargo.toml", { workspace: { members: ["pkg/../*"] } })], files)?.reason).toBe("cargo-path-unsupported")
  expect(ReviewLocalCargoPaths.check([manifest("Cargo.toml", { workspace: { members: ["pkg/nomatch*"] } })], files)?.reason).toBe("cargo-path-missing")
})

test("bounds references, patterns, and UTF-8 path bytes while rejecting malformed schemas", () => {
  expect(ReviewLocalCargoPaths.check([manifest("Cargo.toml", null)], files)?.reason).toBe("cargo-manifest-invalid")
  expect(ReviewLocalCargoPaths.check([manifest("Cargo.toml", { workspace: new Date() })], files)?.reason).toBe("cargo-manifest-invalid")
  expect(ReviewLocalCargoPaths.check([manifest("Cargo.toml", { package: "bad" })], files)?.reason).toBe("cargo-manifest-invalid")
  expect(ReviewLocalCargoPaths.check([manifest("Cargo.toml", { package: { name: "x", version: "1", readme: 42 } })], files)?.reason).toBe("cargo-manifest-invalid")
  expect(ReviewLocalCargoPaths.check([manifest("Cargo.toml", { package: { name: "x" }, dependencies: Object.fromEntries(Array.from({ length: 4096 }, (_, i) => [`d${i}`, { path: "pkg/sibling" }])) })], files)).toBeUndefined()
  expect(ReviewLocalCargoPaths.check([manifest("Cargo.toml", { package: { name: "x" }, dependencies: Object.fromEntries(Array.from({ length: 4097 }, (_, i) => [`d${i}`, { path: "pkg/sibling" }])) })], files)?.reason).toBe("cargo-manifest-budget")
  expect(ReviewLocalCargoPaths.check([manifest("Cargo.toml", { workspace: { members: Array(128).fill("pkg/*") } })], files)).toBeUndefined()
  expect(ReviewLocalCargoPaths.check([manifest("Cargo.toml", { workspace: { members: Array(129).fill("pkg/*") } })], files)?.reason).toBe("cargo-manifest-budget")
  expect(ReviewLocalCargoPaths.check([manifest("Cargo.toml", { package: { name: "x", readme: "x".repeat(2048) } })], files)).toBeUndefined()
  expect(ReviewLocalCargoPaths.check([manifest("Cargo.toml", { package: { name: "x", version: "1", readme: "é".repeat(1025) } })], files)?.reason).toBe("cargo-manifest-budget")
})
