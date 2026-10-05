// @atlas/adapter-io -- test/scanner.wp-11.w5.test.ts  (CAMPAIGN-11 W5 -- MEM-9b/9c adapter binding)
//
// Fake binaries (executable shell scripts under a temp dir) stand in for gitleaks/trufflehog -- no real
// scanner is installed in this repo (see scanner.ts header). Every fake is invoked through the exact same
// `execFileSync` seam a real binary would take (argv, stdin, timeout, exit code), so these tests exercise
// the ADAPTER, not a mock of it. Detection QUALITY is out of scope (FR-12, delegated) -- these check that a
// named stage RAN and its verdict was honoured, per the WP brief.

import { describe, it, expect, afterEach } from "vitest"
import { mkdtempSync, writeFileSync, chmodSync, rmSync, existsSync, readFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import type { MemoryRecord } from "@atlas/memory"
import { writeWithScanner, ScannerBlockedError } from "@atlas/memory"
import {
  runScanner,
  detectAvailableScanner,
  makeScannerAdapter,
  NO_SCANNER_NAME,
  type ScannerBinarySpec,
} from "../src/scanner.js"

// ── fixtures --------------------------------------------------------------------------------------

const record = (rule: string): MemoryRecord => ({
  owner: "m1",
  kind: "project",
  entry: { rule, scope: "s", frecency: 1 },
})

const tmpDirs: string[] = []
afterEach(() => {
  for (const d of tmpDirs.splice(0)) rmSync(d, { recursive: true, force: true })
})

/** Write an executable shell-script fake binary at `dir/name` with `body` as its script content. Returns
 *  the absolute path -- passed as `ScannerBinarySpec.command` directly (no PATH env mutation needed;
 *  `execFileSync` spawns an absolute path exactly like a PATH-resolved one). */
function fakeBinary(name: string, body: string): string {
  const dir = mkdtempSync(join(tmpdir(), "atlas-scanner-fake-"))
  tmpDirs.push(dir)
  const path = join(dir, name)
  writeFileSync(path, "#!/bin/sh\n" + body + "\n")
  chmodSync(path, 0o755)
  return path
}

function spec(command: string, over: Partial<ScannerBinarySpec> = {}): ScannerBinarySpec {
  return {
    name: "gitleaks",
    command,
    args: [],
    cleanExitCodes: [0],
    hitExitCodes: [1],
    ...over,
  }
}

// ── runScanner: three-value verdict, never collapsed --------------------------------------------------

describe("runScanner -- three-value verdict", () => {
  it("a documented clean exit (0) is clean", () => {
    const bin = fakeBinary("gitleaks", "exit 0")
    expect(runScanner(spec(bin), record("r"))).toBe("clean")
  })

  it("a documented hit exit (1) is hit", () => {
    const bin = fakeBinary("gitleaks", "exit 1")
    expect(runScanner(spec(bin), record("r"))).toBe("hit")
  })

  it("an UNDOCUMENTED exit code is could-not-run, never clean and never hit", () => {
    const bin = fakeBinary("gitleaks", "exit 7")
    expect(runScanner(spec(bin), record("r"))).toBe("could-not-run")
  })

  it("a spawn failure (binary vanished) is could-not-run", () => {
    expect(runScanner(spec("/no/such/binary/at/all"), record("r"))).toBe("could-not-run")
  })

  it("exit 0 is could-not-run when this SPEC does not document 0 as its clean code -- the exit is read against the spec, not assumed", () => {
    const bin = fakeBinary("gitleaks", "exit 0")
    const verdict = runScanner(spec(bin, { cleanExitCodes: [7] }), record("r"))
    expect(verdict).toBe("could-not-run")
  })

  it("a timeout is could-not-run, not clean -- and the call still returns promptly", () => {
    const bin = fakeBinary("gitleaks", "sleep 5; exit 0")
    const start = Date.now()
    const verdict = runScanner(spec(bin), record("r"), 200)
    expect(verdict).toBe("could-not-run")
    expect(Date.now() - start).toBeLessThan(4000)
  })

  it("record content is piped on stdin, not argv or a shell string -- injection metacharacters are inert", () => {
    const dir = mkdtempSync(join(tmpdir(), "atlas-scanner-fake-"))
    tmpDirs.push(dir)
    const marker = join(dir, "pwned")
    const capture = join(dir, "stdin-capture")
    const bin = fakeBinary("gitleaks", "cat > " + JSON.stringify(capture) + "\nexit 0")
    const dangerous = "$(touch " + marker + ") ; touch " + marker + " ; `touch " + marker + "`"
    runScanner(spec(bin), record(dangerous))
    expect(existsSync(marker)).toBe(false)
    const captured = readFileSync(capture, "utf8")
    expect(captured).toContain(dangerous)
  })
})

// ── detectAvailableScanner ------------------------------------------------------------------------

describe("detectAvailableScanner", () => {
  it("returns null when no known scanner is on the given list", () => {
    const found = detectAvailableScanner([
      spec("/no/such/gitleaks", { name: "gitleaks" }),
      spec("/no/such/trufflehog", { name: "trufflehog" }),
    ])
    expect(found).toBeNull()
  })

  it("finds an available binary and reports its declared name", () => {
    const bin = fakeBinary("gitleaks", "exit 0")
    const found = detectAvailableScanner([spec(bin, { name: "gitleaks" })])
    expect(found?.name).toBe("gitleaks")
  })

  it("a binary that REJECTS --version (nonzero exit) still counts as available -- only ENOENT excludes it", () => {
    const bin = fakeBinary("gitleaks", 'case "$1" in --version) exit 2;; esac\nexit 0')
    const found = detectAvailableScanner([spec(bin, { name: "gitleaks" })])
    expect(found?.name).toBe("gitleaks")
  })

  it("prefers the first entry in declared order when both are available", () => {
    const gl = fakeBinary("gitleaks", "exit 0")
    const th = fakeBinary("trufflehog", "exit 0")
    const found = detectAvailableScanner([spec(gl, { name: "gitleaks" }), spec(th, { name: "trufflehog" })])
    expect(found?.name).toBe("gitleaks")
  })
})

// ── makeScannerAdapter x writeWithScanner -- A8 / A9 end-to-end -------------------------------------

describe("makeScannerAdapter -- A8: a flagged write is BLOCKED, fail-closed, named", () => {
  it("a hit from a real named binary blocks the write via the memory door, naming the scanner", () => {
    const bin = fakeBinary("gitleaks", "exit 1")
    const adapter = makeScannerAdapter({ scanners: [spec(bin, { name: "gitleaks" })] })
    expect(adapter.name).toBe("gitleaks")
    expect(() => writeWithScanner([], record("aws_secret_key=AKIA000000000EXAMPLE"), adapter)).toThrow(
      ScannerBlockedError,
    )
    try {
      writeWithScanner([], record("aws_secret_key=AKIA000000000EXAMPLE"), adapter)
      expect.unreachable()
    } catch (err) {
      expect(err).toBeInstanceOf(ScannerBlockedError)
      expect((err as InstanceType<typeof ScannerBlockedError>).scannerName).toBe("gitleaks")
    }
  })

  it("a clean verdict from a real named binary lets the write through", () => {
    const bin = fakeBinary("gitleaks", "exit 0")
    const adapter = makeScannerAdapter({ scanners: [spec(bin, { name: "gitleaks" })] })
    const store = writeWithScanner([], record("nothing secret here"), adapter)
    expect(store).toHaveLength(1)
  })
})

describe("makeScannerAdapter -- A9: no binary configured fails closed; a configured one is real+named", () => {
  it("with NO scanner on the given list, every write refuses -- fail-closed, not a silent pass", () => {
    const adapter = makeScannerAdapter({ scanners: [] })
    expect(adapter.name).toBe(NO_SCANNER_NAME)
    expect(() => writeWithScanner([], record("perfectly clean text"), adapter)).toThrow(ScannerBlockedError)
  })

  it("the no-binary block is attributable -- names itself, distinct from a real scanner name", () => {
    const adapter = makeScannerAdapter({ scanners: [] })
    try {
      writeWithScanner([], record("clean"), adapter)
      expect.unreachable()
    } catch (err) {
      expect((err as InstanceType<typeof ScannerBlockedError>).scannerName).toBe(NO_SCANNER_NAME)
      expect((err as InstanceType<typeof ScannerBlockedError>).scannerName).not.toBe("gitleaks")
      expect((err as InstanceType<typeof ScannerBlockedError>).scannerName).not.toBe("trufflehog")
    }
  })

  it("with a scanner configured, it is a REAL named binary -- gitleaks or trufflehog, not a synthetic label", () => {
    const bin = fakeBinary("trufflehog", "exit 0")
    const adapter = makeScannerAdapter({ scanners: [spec(bin, { name: "trufflehog", hitExitCodes: [183] })] })
    expect(["gitleaks", "trufflehog"]).toContain(adapter.name)
    expect(adapter.name).not.toBe(NO_SCANNER_NAME)
  })

  it("a could-not-run verdict (not hit, not clean) STILL blocks -- absence of a verdict is not a pass", () => {
    const bin = fakeBinary("gitleaks", "exit 66")
    const adapter = makeScannerAdapter({ scanners: [spec(bin, { name: "gitleaks" })] })
    expect(() => writeWithScanner([], record("clean text"), adapter)).toThrow(ScannerBlockedError)
  })
})
