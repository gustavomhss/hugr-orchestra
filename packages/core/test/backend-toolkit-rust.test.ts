import { describe, expect, test } from "bun:test"
import { BackendToolkitTarget } from "../src/backend-toolkit/target"
import { RUST, SQLX } from "../src/backend-toolkit/hosted/rust"

// The milestone 5 pins; changing one is a contract amendment.
const pins = Object.entries(RUST.targets).map(([target, pin]) => ({ target, ...pin }))
const source = SQLX.install.kind === "source" ? SQLX.install : undefined
const artifacts = [...pins.map((pin) => pin.artifact), ...(source ? [source.artifact] : [])]

describe("backend toolkit Rust runtime and source-built SQLx CLI", () => {
  test("pins Rust 1.99.0 for the five targets and sqlx-cli 0.9.0 built with cargo and rustls", () => {
    expect([RUST.id, RUST.version, RUST.license]).toEqual(["rust", "1.99.0", "MIT OR Apache-2.0"])
    expect(Object.keys(RUST.targets).sort()).toEqual([...BackendToolkitTarget.TARGETS].sort())
    expect([SQLX.id, SQLX.version, SQLX.upstream, SQLX.runtime, SQLX.launch]).toEqual([
      "sqlx",
      "0.9.0",
      "transact-rs/sqlx",
      "rust",
      [],
    ])
    expect([source?.build, source?.path, source?.binary, source?.features]).toEqual([
      "cargo",
      ".",
      "sqlx",
      ["rustls", "postgres", "mysql", "sqlite", "sqlx-toml"],
    ])
    expect(SQLX.unsupported).toEqual({ "win32-x64": "needs-msvc-linker" })
  })

  test("every download is a distinct sha256 pin from static.rust-lang.org or static.crates.io", () => {
    for (const artifact of artifacts) {
      const match = /^sha256-([A-Za-z0-9+/]+={0,2})$/.exec(artifact.integrity)
      expect(Buffer.from(match?.[1] ?? "", "base64").length, artifact.url).toBe(32)
      expect(artifact.format).toBe("tar.gz")
    }
    expect(new Set(artifacts.map((artifact) => artifact.integrity)).size).toBe(artifacts.length)
    expect(Object.fromEntries(pins.map((pin) => [pin.target, pin.artifact.url]))).toEqual({
      "darwin-arm64": "https://static.rust-lang.org/dist/rust-1.99.0-aarch64-apple-darwin.tar.gz",
      "darwin-x64": "https://static.rust-lang.org/dist/rust-1.99.0-x86_64-apple-darwin.tar.gz",
      "linux-arm64": "https://static.rust-lang.org/dist/rust-1.99.0-aarch64-unknown-linux-gnu.tar.gz",
      "linux-x64": "https://static.rust-lang.org/dist/rust-1.99.0-x86_64-unknown-linux-gnu.tar.gz",
      "win32-x64": "https://static.rust-lang.org/dist/rust-1.99.0-x86_64-pc-windows-msvc.tar.gz",
    })
    expect(source?.artifact.url).toBe("https://static.crates.io/crates/sqlx-cli/sqlx-cli-0.9.0.crate")
  })

  test("the toolchain is a sysroot of rustc, cargo and rust-std, and the crate is lifted out of its prefix", () => {
    for (const pin of pins) {
      const exe = pin.target === "win32-x64" ? ".exe" : ""
      const root = pin.artifact.entries[0].from.split("/")[0]
      const triple = root.slice("rust-1.99.0-".length)
      expect(pin.artifact.entries.map((entry) => [entry.from.slice(root.length + 1), entry.to])).toEqual([
        ["rustc/bin", "bin"],
        ["rustc/lib", "lib"],
        [`cargo/bin/cargo${exe}`, `bin/cargo${exe}`],
        [`rust-std-${triple}/lib/rustlib/${triple}/lib`, `lib/rustlib/${triple}/lib`],
        ["COPYRIGHT", "COPYRIGHT"],
        ["LICENSE-APACHE", "LICENSE-APACHE"],
        ["LICENSE-MIT", "LICENSE-MIT"],
      ])
      expect(pin.executable).toBe(`bin/cargo${exe}`)
    }
    expect(source?.artifact.entries.map((entry) => entry.to)).toContain("src/Cargo.lock")
    for (const entry of source?.artifact.entries ?? []) expect(`src/${entry.from.slice("sqlx-cli-0.9.0/".length)}`).toBe(entry.to)
  })
})
