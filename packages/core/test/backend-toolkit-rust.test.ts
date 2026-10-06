import { describe, expect, test } from "bun:test"
import { BackendToolkitTarget } from "../src/backend-toolkit/target"
import { RUST, SQLX, SQLX_UNSUPPORTED } from "../src/backend-toolkit/hosted/rust"

// The milestone 5 pins; changing one is a contract amendment.
const TRIPLES = {
  "darwin-arm64": "aarch64-apple-darwin",
  "darwin-x64": "x86_64-apple-darwin",
  "linux-arm64": "aarch64-unknown-linux-gnu",
  "linux-x64": "x86_64-unknown-linux-gnu",
  "win32-x64": "x86_64-pc-windows-msvc",
} as Record<string, string>
const pins = Object.entries(RUST.targets).map(([target, pin]) => ({ target, ...pin }))
const source = SQLX.install.kind === "source" ? SQLX.install : undefined
const artifacts = [...pins.map((pin) => pin.artifact), ...(source ? [source.artifact] : [])]

describe("backend toolkit Rust runtime and source-built SQLx CLI", () => {
  test("pins Rust 1.99.0 and sqlx-cli 0.9.0 with their licenses", () => {
    expect([RUST.id, RUST.version, RUST.license, RUST.upstream]).toEqual([
      "rust",
      "1.99.0",
      "MIT OR Apache-2.0",
      "rust-lang/rust",
    ])
    expect([SQLX.id, SQLX.version, SQLX.license, SQLX.upstream, SQLX.runtime]).toEqual([
      "sqlx",
      "0.9.0",
      "MIT OR Apache-2.0",
      "transact-rs/sqlx",
      "rust",
    ])
  })

  test("the toolchain is at least the crate's rust-version 1.94.0", () => {
    const [major, minor] = RUST.version.split(".").map(Number)
    expect(major).toBe(1)
    expect(minor).toBeGreaterThanOrEqual(94)
  })

  test("the runtime covers exactly the five first-qualification targets", () => {
    expect(Object.keys(RUST.targets).sort()).toEqual([...BackendToolkitTarget.TARGETS].sort())
  })

  test("every integrity is a well-formed sha256 SRI digest, and no two downloads share one", () => {
    for (const artifact of artifacts) {
      const match = /^sha256-([A-Za-z0-9+/]+={0,2})$/.exec(artifact.integrity)
      expect(match, artifact.url).not.toBeNull()
      expect(Buffer.from(match![1], "base64").length, artifact.url).toBe(32)
    }
    expect(new Set(artifacts.map((artifact) => artifact.integrity)).size).toBe(artifacts.length)
    expect(new Set(artifacts.map((artifact) => artifact.url)).size).toBe(artifacts.length)
  })

  test("each toolchain is the standalone static.rust-lang.org archive for its target triple", () => {
    for (const pin of pins) {
      const url = new URL(pin.artifact.url)
      expect([url.protocol, url.hostname, url.pathname], pin.artifact.url).toEqual([
        "https:",
        "static.rust-lang.org",
        `/dist/rust-1.99.0-${TRIPLES[pin.target]}.tar.gz`,
      ])
      expect(pin.artifact.format).toBe("tar.gz")
    }
  })

  test("each target lays out a sysroot from the rustc, cargo and rust-std components and runs its cargo", () => {
    for (const pin of pins) {
      const triple = TRIPLES[pin.target]
      const root = `rust-1.99.0-${triple}`
      const exe = pin.target === "win32-x64" ? ".exe" : ""
      expect(pin.artifact.entries).toEqual([
        { from: `${root}/rustc/bin`, to: "bin" },
        { from: `${root}/rustc/lib`, to: "lib" },
        { from: `${root}/cargo/bin/cargo${exe}`, to: `bin/cargo${exe}` },
        { from: `${root}/rust-std-${triple}/lib/rustlib/${triple}/lib`, to: `lib/rustlib/${triple}/lib` },
        { from: `${root}/COPYRIGHT`, to: "COPYRIGHT" },
        { from: `${root}/LICENSE-APACHE`, to: "LICENSE-APACHE" },
        { from: `${root}/LICENSE-MIT`, to: "LICENSE-MIT" },
      ])
      expect(pin.executable).toBe(`bin/cargo${exe}`)
    }
  })

  test("the engine source is the published crate from static.crates.io, lifted out of its version prefix", () => {
    expect(source).toBeDefined()
    const url = new URL(source!.artifact.url)
    expect([url.protocol, url.hostname, url.pathname]).toEqual([
      "https:",
      "static.crates.io",
      "/crates/sqlx-cli/sqlx-cli-0.9.0.crate",
    ])
    expect(source!.artifact.format).toBe("tar.gz")
    expect(source!.artifact.entries.map((entry) => entry.to)).toContain("Cargo.lock")
    expect(source!.artifact.entries.map((entry) => entry.to)).toContain("Cargo.toml")
    for (const entry of source!.artifact.entries) {
      expect(entry.from).toBe(`sqlx-cli-0.9.0/${entry.to}`)
      expect(entry.to.split("/")).toHaveLength(1)
    }
  })

  test("the crate builds with cargo from its root with rustls instead of native-tls, and launches directly", () => {
    expect([source!.build, source!.path, source!.binary]).toEqual(["cargo", ".", "sqlx"])
    expect(source!.features).toEqual(["rustls", "postgres", "mysql", "sqlite", "sqlx-toml"])
    expect(source!.features).not.toContain("native-tls")
    expect(source!.features).not.toContain("openssl-vendored")
    expect(SQLX.launch).toEqual([])
  })

  test("Windows is the only target the engine cannot build on, for want of the MSVC linker", () => {
    expect(SQLX_UNSUPPORTED).toEqual({ "win32-x64": "needs-msvc-linker" })
  })
})
