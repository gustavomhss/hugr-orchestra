import { expect, test } from "bun:test"
import { ReviewCargoAuditLock } from "../../src/review-toolkit/cargo-audit-lock"
import { lock, PKG, SOURCE, span } from "../fixture/cargo-audit"

test("canonical v3 and v4 package ranges end at fields rather than trailing comments", () => {
  for (const version of [3, 4]) {
    const text = lock("1.0.0").replace("version = 4", `version = ${version}`)
    const parsed = ReviewCargoAuditLock.parse(text + "\n# heading for a future package\n")
    expect(parsed.status).toBe("ok")
    if (parsed.status !== "ok") throw new Error(parsed.reason)
    expect(parsed.blocks).toEqual([{
      name: PKG, version: "1.0.0", source: SOURCE,
      line: span(text).start, endLine: span(text).end,
    }])
  }
})

test("string contents cannot synthesize canonical package headers", () => {
  const fake = `\n[metadata]\ntext = """\n[[package]]\nname = "phantom"\nversion = "9.9.9"\n"""\n`
  expect(ReviewCargoAuditLock.parse(lock("1.0.0") + fake)).toEqual({ status: "acquisition-error", reason: "lockfile-layout-unsupported" })
  const escaped = lock("1.0.0").replace(`name = "${PKG}"`, 'name = "fixture\\u002ddependency"')
  expect(ReviewCargoAuditLock.parse(escaped)).toEqual({ status: "acquisition-error", reason: "lockfile-layout-unsupported" })
})
