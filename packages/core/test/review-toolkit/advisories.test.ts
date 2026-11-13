import { describe, expect, test } from "bun:test"
import path from "path"
import { mkdir, mkdtemp, rm, stat, writeFile } from "fs/promises"
import { tmpdir } from "os"
import { Effect } from "effect"
import { ReviewOsvFacts } from "../../src/review-toolkit/osv-facts"

const root = path.resolve(import.meta.dirname, "../..")

describe("offline advisories", () => {
  test("the host refresh argv is the v2.7.1 documented command and is not the review scan", () => {
    const refresh = ReviewOsvFacts.refreshArgv("/opt/osv-scanner", ReviewOsvFacts.refreshTarget())
    expect(refresh).toEqual([
      "/opt/osv-scanner",
      "--offline-vulnerabilities",
      "--download-offline-databases",
      ReviewOsvFacts.refreshTarget(),
    ])
    expect(refresh.join(" ")).not.toContain("fix")
    expect(refresh).not.toContain("--offline")
    expect(refresh).not.toContain("scan")
    const review = ReviewOsvFacts.argv("/opt/osv-scanner", "/tmp/copy")
    expect(review).toEqual(["/opt/osv-scanner", "scan", "source", "-r", "/tmp/copy", "--offline"])
    expect(review.join(" ")).not.toContain("download")
    expect(ReviewOsvFacts.refreshTarget()).not.toBe("/tmp/copy")
    expect(ReviewOsvFacts.refreshTarget()).not.toBe(ReviewOsvFacts.databaseDir())
  })

  test("the review modules do not call the download command", async () => {
    const review = await Bun.file(path.join(root, "src/review-toolkit/osv.ts")).text()
    const analyze = await Bun.file(path.join(root, "src/review-toolkit/analyze.ts")).text()
    expect(review).not.toContain("download-offline-databases")
    expect(review).not.toContain("ReviewOsvRefresh")
    expect(analyze).not.toContain("download-offline-databases")
    expect(analyze).not.toContain("osv-refresh")
  })

  test("a missing ecosystem stays absent, and a present database states its age", async () => {
    expect(ReviewOsvFacts.ecosystems(["bun.lock", "pkg/a.go", "../Cargo.lock"])).toEqual(["npm"])
    expect(ReviewOsvFacts.ecosystems(["Cargo.lock", "go.sum", "poetry.lock"])).toEqual(["Go", "PyPI", "crates.io"])
    expect(ReviewOsvFacts.cardReason(ReviewOsvFacts.DATABASE_ABSENT, "2026-11-11T00:00:00.000Z")).toBe(ReviewOsvFacts.DATABASE_ABSENT)
    expect(ReviewOsvFacts.cardReason(undefined, "2026-11-11T00:00:00.000Z")).toBe("osv database age: 2026-11-11T00:00:00.000Z")
    expect(ReviewOsvFacts.cardReason("findings", "2026-11-11T00:00:00.000Z")).toBe("findings; osv database age: 2026-11-11T00:00:00.000Z")
    expect(ReviewOsvFacts.databaseAgeIso([200, 100])).toBe(new Date(100).toISOString())

    const dir = await mkdtemp(path.join(tmpdir(), "osv-age-"))
    try {
      expect(await Effect.runPromise(ReviewOsvFacts.databaseReady(dir, ["npm"]))).toBe(false)
      const zip = path.join(dir, "osv-scalibr", "npm", "all.zip")
      await mkdir(path.dirname(zip), { recursive: true })
      await writeFile(zip, "zip")
      expect(await Effect.runPromise(ReviewOsvFacts.databaseReady(dir, ["npm"]))).toBe(true)
      expect(await Effect.runPromise(ReviewOsvFacts.databaseReady(dir, ["npm", "Go"]))).toBe(false)
      const age = await Effect.runPromise(ReviewOsvFacts.databaseAge(dir, ["npm"]))
      expect(age).toBe(new Date((await stat(zip)).mtimeMs).toISOString())
    } finally {
      await rm(dir, { recursive: true, force: true })
    }
  })
})
