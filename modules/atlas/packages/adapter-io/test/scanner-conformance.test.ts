// @atlas/adapter-io — test/scanner-conformance.test.ts
//
// THE TEST THAT SHOULD HAVE EXISTED BEFORE THE ADAPTER SHIPPED.
//
// `scanner.ts` binds a real secret-scanning binary by NAME and reads its EXIT CODE. Every other test of that
// adapter injects a fake `NamedScanner`, so all of them passed — and eleven gates passed — while the shipped
// argv was wrong in the one direction that matters: `gitleaks detect --no-git --source -` resolves `-` as a
// PATH, fails, and exits **1**, which the spec table documents as "a finding". So a wrong invocation arrived
// wearing the exit code that means "secret detected", and the memory write door refused EVERY write on any
// machine with gitleaks installed. Found by running `atlas memory-emit` on a clean file, not by a test.
//
// The general lesson, which is why this file is scoped to the BINARY and not to the door: a fail-closed
// default only protects you against exits you did NOT enumerate. Enumerating an exit code assigns it a
// meaning, and a broken invocation is free to land on it.
//
// ── NEVER VACUOUS ────────────────────────────────────────────────────────────────────────────────────────
// CI may not have a scanner installed, so the measured legs are skipped there. A skipped file that asserts
// nothing is how this defect survived, so the no-binary path is not a skip: it asserts the no-scanner
// REFUSAL instead. Whatever the machine, this file asserts something.

import { describe, it, expect } from "vitest"
import { execFileSync } from "node:child_process"
import { mkdtempSync, writeFileSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { makeScannerAdapter, NO_SCANNER_NAME } from "../src/scanner.js"
import type { MemoryRecord } from "@atlas/memory"

/** Is a real gitleaks reachable? Its ABSENCE is a legitimate machine state, not a failure. */
function gitleaksPresent(): boolean {
  try {
    execFileSync("gitleaks", ["version"], { stdio: "ignore", timeout: 10_000 })
    return true
  } catch {
    return false
  }
}

const HAVE = gitleaksPresent()

const record = (text: string): MemoryRecord => ({
  owner: "lucy",
  kind: "project",
  entry: { rule: text, scope: "harness", frecency: 1 },
})

// A private-key block: one of gitleaks' strongest default rules, and MEASURED to fire here rather than
// assumed to. A synthetic AWS/GitHub-shaped token does NOT fire (they are allowlisted example values), which
// is exactly the kind of thing that makes a positive control mandatory instead of optional.
const SECRET =
  "-----BEGIN RSA PRIVATE KEY-----\n" +
  "MIIEowIBAAKCAQEA3Tz2mr7SZiAMfQyuvBjM9OiJjRazXBZ1BjP5CE/Wm/RrFqiIiaEQ\n" +
  "-----END RSA PRIVATE KEY-----"

describe("the named scanner is bound to the REAL binary, both directions", () => {
  it.skipIf(!HAVE)("a CLEAN record scans clean — the leg the old argv got WRONG", () => {
    const scanner = makeScannerAdapter()
    expect(scanner.name).not.toBe(NO_SCANNER_NAME)
    // teeth (breaks-on "a wrong invocation exits on a code the table reads as a finding, so every write is
    // refused"): this is the assertion the shipped `--source -` argv failed, and no other test could fail.
    expect(scanner.scan(record("gates that change logic need a mutation probe"))).toBe(false)
  })

  it.skipIf(!HAVE)("a record carrying a private key IS flagged — the fix does not fail OPEN", () => {
    // The dangerous repair for the bug above is an invocation that always exits 0. This is the control that
    // refuses it: a fix that stops false-blocking must still block a real secret.
    expect(makeScannerAdapter().scan(record(SECRET))).toBe(true)
  })

  it.skipIf(HAVE)("with NO scanner on PATH the write fails CLOSED and the name is attributable", () => {
    // The no-binary machine still asserts a real property, so this file is never a green no-op.
    const scanner = makeScannerAdapter({ scanners: [] })
    expect(scanner.name).toBe(NO_SCANNER_NAME)
    expect(scanner.scan(record("anything at all"))).toBe(true) // fail-closed
  })

  it("an EMPTY scanner list always yields the attributable no-scanner refusal, on any machine", () => {
    const scanner = makeScannerAdapter({ scanners: [] })
    expect(scanner.name).toBe(NO_SCANNER_NAME)
    expect(scanner.scan(record("clean"))).toBe(true)
  })
})
