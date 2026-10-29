import { describe, it, expect, afterEach } from "vitest"
import { mkdtempSync, rmSync, mkdirSync, appendFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { dirname, join } from "node:path"
import { readReview, foldReview, reviewLogPath } from "@atlas/adapter-io"
import { runHold, runRelease, type HoldPorts } from "../src/hold-cli.js"
import { REVIEW_COMMANDS } from "../src/review-cli.js"

const NOW = "2026-10-18T10:00:00.000Z"

let tmp: string

afterEach(() => {
  if (tmp) rmSync(tmp, { recursive: true, force: true })
})

function ports(staged: ReadonlySet<string> | undefined = new Set(["nk-a"])): HoldPorts {
  return { repoPath: tmp, now: () => NOW, staged: () => staged }
}

describe("hold-cli", () => {
  it("1. hold requires --by", () => {
    tmp = mkdtempSync(join(tmpdir(), "atlas-hold-"))
    const r = runHold(ports(), ["nk-a"], {})
    expect(r.exitCode).toBe(1)
    expect(r.stdout).toContain("hold requires --by <actor>")
    expect(readReview(tmp).records).toEqual([])
    const r2 = runHold(ports(), ["nk-a"], { by: "true" })
    expect(r2.exitCode).toBe(1)
    expect(r2.stdout).toContain("hold requires --by <actor>")
  })

  it("2. hold writes a hold record", () => {
    tmp = mkdtempSync(join(tmpdir(), "atlas-hold-"))
    const r = runHold(ports(), ["nk-a"], { by: "alice" })
    expect(r.exitCode).toBe(0)
    expect(r.stdout.startsWith("status: ok\n")).toBe(true)
    expect(r.stdout).toContain("hold: ")
    const read = readReview(tmp)
    expect(foldReview(read.records).held.has("nk-a")).toBe(true)
    expect(read.records[0]!.by).toBe("alice")
    expect(read.records[0]!.at).toBe(NOW)
  })

  it("3. holding again is a no-op", () => {
    tmp = mkdtempSync(join(tmpdir(), "atlas-hold-"))
    runHold(ports(), ["nk-a"], { by: "alice" })
    const r = runHold(ports(), ["nk-a"], { by: "alice" })
    expect(r.exitCode).toBe(0)
    expect(r.stdout).toContain("already held")
    expect(readReview(tmp).records).toHaveLength(1)
  })

  it("4. hold unknown nodeKey is a usage error", () => {
    tmp = mkdtempSync(join(tmpdir(), "atlas-hold-"))
    const r = runHold(ports(), ["nk-zz"], { by: "alice" })
    expect(r.exitCode).toBe(1)
    expect(r.stdout).toContain("no staged candidate has nodeKey 'nk-zz'")
  })

  it("5. unreadable staging is a governed refusal", () => {
    tmp = mkdtempSync(join(tmpdir(), "atlas-hold-"))
    const r = runHold({ ...ports(), staged: () => undefined }, ["nk-a"], { by: "alice" })
    expect(r.exitCode).toBe(2)
    expect(r.stdout).toContain("status: rejected")
  })

  it("6. release before hold is a usage error", () => {
    tmp = mkdtempSync(join(tmpdir(), "atlas-hold-"))
    const r = runRelease(ports(), ["nk-a"], { by: "bob" })
    expect(r.exitCode).toBe(1)
    expect(r.stdout).toContain("is not held")
  })

  it("7. hold then release clears held", () => {
    tmp = mkdtempSync(join(tmpdir(), "atlas-hold-"))
    runHold(ports(), ["nk-a"], { by: "alice" })
    const r = runRelease({ ...ports(), now: () => "2026-10-18T11:00:00.000Z" }, ["nk-a"], { by: "bob" })
    expect(r.exitCode).toBe(0)
    const read = readReview(tmp)
    expect(foldReview(read.records).held.has("nk-a")).toBe(false)
    expect(read.records).toHaveLength(2)
  })

  it("8. torn log refuses", () => {
    tmp = mkdtempSync(join(tmpdir(), "atlas-hold-"))
    mkdirSync(dirname(reviewLogPath(tmp)), { recursive: true })
    appendFileSync(reviewLogPath(tmp), "{torn\n")
    const r = runHold(ports(), ["nk-a"], { by: "alice" })
    expect(r.exitCode).toBe(2)
  })

  it("9. REVIEW_COMMANDS has hold and release runners", () => {
    expect(typeof REVIEW_COMMANDS.hold).toBe("function")
    expect(typeof REVIEW_COMMANDS.release).toBe("function")
  })
})
