import { expect, test } from "bun:test"
import { mkdir, readFile, writeFile } from "fs/promises"
import path from "path"
import { Effect } from "effect"
import { ReviewAnalyze } from "../../src/review-toolkit/analyze"
import type { ReviewItem } from "../../src/review-toolkit/item"
import { tmpdir } from "../fixture/tmpdir"

function item(ruleStatus: ReviewItem.RuleStatus, lens: string, line: number, fingerprint = `${lens}-${line}`): ReviewItem.ToolItem {
  return {
    fingerprint,
    class: "security.secret",
    lens,
    pack: "gitleaks",
    rule: "F401",
    ruleStatus,
    severity: "P1",
    path: "src/a.ts",
    line,
    snippetDigest: `digest-${fingerprint}`,
    sources: [{ pack: "gitleaks", rule: "F401" }],
    triage: "triage",
    onChangedLine: true,
  }
}

async function artifact(items: readonly ReviewItem.ToolItem[]) {
  const made = await tmpdir()
  const id = crypto.randomUUID()
  const file = path.join(made.path, id, "retained.json")
  await mkdir(path.dirname(file), { recursive: true })
  const body = JSON.stringify({ total: items.length, unread: {}, items })
  await writeFile(file, body)
  return { made, file, body, store: made.path, uri: `review:${id}/retained.json` }
}

function page(input: Parameters<typeof ReviewAnalyze.page>[0]) {
  return Effect.runPromise(ReviewAnalyze.page(input))
}

test("model pages omit demoted and dropped items without changing the retained artifact", async () => {
  const held = await artifact([
    item("active", "security", 1),
    item("demoted", "security", 2),
    item("probation", "security", 3),
    item("dropped", "security", 4),
    item("active", "tests", 5),
  ])
  const mixed = await page({ store: held.store, uri: held.uri, lens: "security" })
  expect(mixed.items.map((entry) => [entry.line, entry.ruleStatus])).toEqual([[1, "active"], [3, "probation"]])
  expect(mixed.cursor).toBeUndefined()
  const other = await page({ store: held.store, uri: held.uri, lens: "tests" })
  expect(other.items.map((entry) => entry.line)).toEqual([5])
  expect(await readFile(held.file, "utf8")).toBe(held.body)
  await held.made[Symbol.asyncDispose]()

  const onlyHeld = await artifact([item("demoted", "security", 1), item("dropped", "security", 2), item("active", "other", 3)])
  expect(await page({ store: onlyHeld.store, uri: onlyHeld.uri, lens: "security" })).toEqual({ items: [] })
  expect(await readFile(onlyHeld.file, "utf8")).toBe(onlyHeld.body)
  await onlyHeld.made[Symbol.asyncDispose]()

  const hidden = Array.from({ length: 30 }, (_, index) => item(index % 2 === 0 ? "demoted" : "dropped", "security", index + 1, `held-${index}`))
  const visible = Array.from({ length: 21 }, (_, index) => item(index % 2 === 0 ? "active" : "probation", "security", 100 + index, `visible-${index}`))
  const window = await artifact([...hidden, ...visible])
  const first = await page({ store: window.store, uri: window.uri, lens: "security" })
  expect(first.items.map((entry) => entry.fingerprint)).toEqual(visible.slice(0, 20).map((entry) => entry.fingerprint))
  expect(first.cursor).toBe("20")
  const second = await page({ store: window.store, uri: window.uri, lens: "security", cursor: first.cursor })
  expect(second.items.map((entry) => entry.fingerprint)).toEqual(["visible-20"])
  expect(second.cursor).toBeUndefined()
  expect(await readFile(window.file, "utf8")).toBe(window.body)

  const unknown = await Effect.runPromise(ReviewAnalyze.page({ store: window.store, uri: "review:../../etc/retained.json", lens: "security" }).pipe(Effect.flip))
  expect(unknown.reason).toBe("artifact-unknown: review:../../etc/retained.json")
  const cursor = await Effect.runPromise(ReviewAnalyze.page({ store: window.store, uri: window.uri, lens: "security", cursor: "-1" }).pipe(Effect.flip))
  expect(cursor.reason).toBe("cursor-invalid: -1")
  expect(await readFile(window.file, "utf8")).toBe(window.body)
  await window.made[Symbol.asyncDispose]()
})
