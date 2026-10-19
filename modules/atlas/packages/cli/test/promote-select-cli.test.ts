import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { appendFileSync, mkdirSync, mkdtempSync, rmSync } from "node:fs"
import { join } from "node:path"
import { tmpdir } from "node:os"
import type { Hash, PromoteOut, PromoteSelect } from "@atlas/adapter-io"
import { appendReview, reviewLogPath } from "@atlas/adapter-io"
import { main } from "../src/cli.js"
import { promoteVerdict } from "../src/promote.js"

let writes: string[]
let tmp: string
let prev: string
let calls: { at: Hash; select: PromoteSelect | undefined }[]

beforeEach(() => {
  writes = []
  vi.spyOn(process.stdout, "write").mockImplementation((chunk: unknown) => {
    writes.push(String(chunk))
    return true
  })
  tmp = mkdtempSync(join(tmpdir(), "atlas-promote-select-"))
  prev = process.cwd()
  process.chdir(tmp)
  calls = []
})

afterEach(() => {
  process.chdir(prev)
  rmSync(tmp, { recursive: true, force: true })
  vi.restoreAllMocks()
})

const promote = (at: Hash, select?: PromoteSelect): PromoteOut => {
  calls.push({ at, select })
  return { read: true, candidates: 0, promoted: 0, refused: 0, rows: [] }
}

describe("CLI promote select", () => {
  it("named nodeKeys are passed as only", async () => {
    const code = await main(["promote", "nk-a", "nk-b"], { promote })
    expect(code).toBe(0)
    expect(calls[0].select?.only).toEqual(["nk-a", "nk-b"])
    expect([...calls[0].select!.held]).toEqual([])
  })

  it("a held row folds into held", async () => {
    appendReview(tmp, { kind: "hold", nodeKey: "nk-a", at: "2026-10-18T10:00:00.000Z", by: "alice" })
    await main(["promote"], { promote })
    expect(calls[0].select?.only).toBeUndefined()
    expect(calls[0].select?.held.has("nk-a")).toBe(true)
  })

  it("a release removes the hold", async () => {
    appendReview(tmp, { kind: "hold", nodeKey: "nk-a", at: "2026-10-18T10:00:00.000Z", by: "alice" })
    appendReview(tmp, { kind: "release", nodeKey: "nk-a", at: "2026-10-18T11:00:00.000Z", by: "alice" })
    await main(["promote"], { promote })
    expect(calls[0].select?.held.has("nk-a")).toBe(false)
  })

  it("a torn review log refuses the pass", async () => {
    mkdirSync(join(tmp, ".atlas"), { recursive: true })
    appendFileSync(reviewLogPath(tmp), "{torn\n")
    const code = await main(["promote"], { promote })
    expect(code).toBe(2)
    expect(calls).toHaveLength(0)
    const out = writes.join("")
    expect(out).toContain("status: rejected")
    expect(out).toContain("review.jsonl")
  })

  it("promoteVerdict reports held rows", () => {
    const cv = promoteVerdict({ read: true, candidates: 0, promoted: 0, refused: 0, rows: [], held: ["nk-a"] })
    expect(cv.exitCode).toBe(0)
    expect(cv.stdout).toContain("  held nk-a — skipped")
    expect(cv.stdout).toContain("nothing was presented to the door")
  })

  it("promoteVerdict reports unknown rows", () => {
    const cv = promoteVerdict({ read: true, candidates: 0, promoted: 0, refused: 0, rows: [], unknown: ["nk-z"] })
    expect(cv.exitCode).toBe(2)
    expect(cv.stdout).toContain("  not staged nk-z")
  })

  it("promoteVerdict byte-stability", () => {
    const cv = promoteVerdict({ read: true, candidates: 0, promoted: 0, refused: 0, rows: [] })
    expect(cv.stdout).not.toContain("held")
    expect(cv.stdout).not.toContain("not staged")
  })
})
