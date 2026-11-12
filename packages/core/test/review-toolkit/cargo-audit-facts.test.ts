import { expect, test } from "bun:test"
import { ReviewCargoAuditFacts } from "../../src/review-toolkit/cargo-audit-facts"

test("RustSec constants identify only the frozen pin and native contract", () => {
  expect(ReviewCargoAuditFacts.VERSION).toBe("0.23.0")
  expect(ReviewCargoAuditFacts.TEMPLATE).toBe("cargo-audit-lock-json")
  expect(ReviewCargoAuditFacts.RULE).toBe("cargo-audit/advisory")
  expect(ReviewCargoAuditFacts.DATABASE_ABSENT).toBe("not run: RustSec advisory database absent")
})

test("RustSec review argv fixes the file, DB, no-fetch, no-yanked and JSON output", () => {
  expect(ReviewCargoAuditFacts.argv("/host/cargo-audit", "/host/input/Cargo.lock", "/host/rustsec/db")).toEqual([
    "/host/cargo-audit", "audit", "--file", "/host/input/Cargo.lock", "--db", "/host/rustsec/db",
    "--no-fetch", "--no-yanked", "--stale", "--format", "json",
  ])
  expect(ReviewCargoAuditFacts.refreshArgv("/host/cargo-audit", "/host/rustsec/new")).toEqual([
    "/host/cargo-audit", "audit", "update-db", "--db", "/host/rustsec/new", "--url", "https://github.com/RustSec/advisory-db.git",
  ])
})

test("only safe changed Cargo.lock paths are admitted deterministically", () => {
  expect(ReviewCargoAuditFacts.lockfiles([
    "", ".", "..", "\r", "cargo.lock", "Cargo.lock.bak", "z/Cargo.lock", "Cargo.toml", "Cargo.lock", "z/Cargo.lock", "../Cargo.lock", "/Cargo.lock",
    "C:\\repo\\Cargo.lock", "a/../Cargo.lock", "a/./Cargo.lock", "a//Cargo.lock", "a\0/Cargo.lock", "a\n/Cargo.lock",
  ])).toEqual(["Cargo.lock", "z/Cargo.lock"])
})

test("review environment uses one private home and keeps the ordinary child safety strips", () => {
  const env = ReviewCargoAuditFacts.environment("/host/private", { HOME: "/host/unsafe", CARGO_HOME: "/host/unsafe", CARGO_HTTP_PROXY: "SECRET", RUSTUP_TOOLCHAIN: "evil", RUSTSEC_LOG: "evil", XDG_DATA_HOME: "/host/unsafe", CI: "true", ORCHESTRA_LOCAL_TESTS: "hostile-parent", NODE_OPTIONS: "--require evil" })
  for (const key of ["HOME", "CARGO_HOME", "RUSTUP_HOME", "XDG_CONFIG_HOME", "XDG_CACHE_HOME", "TMPDIR"]) expect(env[key]).toBe("/host/private")
  for (const key of ["CARGO_HTTP_PROXY", "RUSTUP_TOOLCHAIN", "RUSTSEC_LOG", "XDG_DATA_HOME"]) expect(env[key]).toBeUndefined()
  expect(env.CI).toBeUndefined()
  expect(env.ORCHESTRA_LOCAL_TESTS).toBeUndefined()
  expect(env.NODE_OPTIONS).toBeUndefined()
  expect(env.GIT_CONFIG_GLOBAL).toBe("/dev/null")
})

test("database age reports the captured revision and both timestamps, including stale data", () => {
  const state = { dir: "/host/rustsec/gen/db", revision: "a".repeat(40), committedAt: "2024-01-01T00:00:00Z", refreshedAt: "2026-11-12T00:00:00Z" }
  const reason = ReviewCargoAuditFacts.cardReason("findings", state)
  expect(reason).toBe(`findings; rustsec database: ${state.revision}; committed: ${state.committedAt}; refreshed: ${state.refreshedAt}; yanked: not examined`)
  expect(ReviewCargoAuditFacts.cardReason(undefined)).toBe(ReviewCargoAuditFacts.DATABASE_ABSENT)
})
