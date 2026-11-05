import { expect, test } from "bun:test"
import { Schema } from "effect"
import { ReviewCatalog } from "../../src/review/catalog"

const gitleaks = ReviewCatalog.current.packs.find((pack) => pack.id === "gitleaks")!
const repo = ReviewCatalog.current.packs.find((pack) => pack.id === "repo")!
const decode = Schema.decodeUnknownSync(ReviewCatalog.Pack)

test("pack licence and pin validation accepts existing and invocation backends", () => {
  expect(gitleaks.id).toBe("gitleaks")
  expect(repo.id).toBe("repo")
  expect(() => decode(gitleaks)).not.toThrow()
  expect(() => decode(repo)).not.toThrow()
  expect(() => decode({ ...gitleaks, backend: "path", licence: "invoke" })).not.toThrow()
  expect(() => decode({ ...gitleaks, backend: "path", licence: "user-licence" })).not.toThrow()
})

test("pack licence and pin validation rejects each invalid combination", () => {
  const cases = [
    { value: { ...gitleaks, licence: "invoke" }, issue: "pack-licence" },
    { value: { ...gitleaks, licence: "user-licence" }, issue: "pack-licence" },
    { value: { ...gitleaks, licence: "never" }, issue: "pack-licence" },
    { value: { ...gitleaks, backend: "path", licence: "never" }, issue: "pack-licence" },
    { value: { ...repo, licence: "never" }, issue: "pack-licence" },
    { value: { ...gitleaks, pin: undefined }, issue: "pack-pin" },
    { value: { ...gitleaks, pin: { source: "fixture", integrity: {} } }, issue: "pack-pin" },
  ]
  expect(cases).toHaveLength(7)
  for (const entry of cases) {
    expect(() => decode(gitleaks)).not.toThrow()
    expect(() => decode(entry.value)).toThrow(entry.issue)
  }
})
