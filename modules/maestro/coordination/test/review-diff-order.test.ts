import { expect, test } from "bun:test"
import { changes, hunks, reorderDiff } from "../src/v2/workflow/review-diff"

test("reorderDiff keeps hunk bytes, headers, paths and anchors", () => {
  const fileA = [
    "diff --git a/src/a.ts b/src/a.ts",
    "index 1111111..2222222 100644",
    "--- a/src/a.ts",
    "+++ b/src/a.ts",
    "@@ -1,2 +1,3 @@",
    " context",
    "-old",
    "+new",
    "@@ -10,1 +11,1 @@ fn",
    "-x",
    "+y",
    "\\ No newline at end of file",
    "",
  ].join("\n")
  const fileB = [
    "diff --git a/src/b.ts b/src/b.ts",
    "index 3333333..4444444 100644",
    "--- a/src/b.ts",
    "+++ b/src/b.ts",
    "@@ -4,1 +4,1 @@",
    "-one",
    "+two",
    "",
  ].join("\n")
  const binary = ["diff --git a/pic.bin b/pic.bin", "index 5555555..6666666 100644", "GIT binary patch", "literal 4", ""].join("\n")
  const diff = fileA + fileB + binary
  const reordered = reorderDiff(diff)
  expect(reorderDiff("")).toBe("")
  expect(changes("")).toEqual([])
  expect(hunks("")).toEqual([])
  expect(reorderDiff(fileB)).toBe(fileB)
  expect(reorderDiff(binary)).toBe(binary)
  expect(reordered).not.toBe(diff)
  expect(reordered.startsWith("diff --git a/pic.bin b/pic.bin\n")).toBe(true)
  expect(reordered).toContain(binary)
  expect(reordered).toContain("@@ -10,1 +11,1 @@ fn\n-x\n+y\n\\ No newline at end of file\n@@ -1,2 +1,3 @@\n context\n-old\n+new\n")
  expect(sortedChanges(reordered)).toEqual(sortedChanges(diff))
  expect(sortedHunks(reordered)).toEqual(sortedHunks(diff))
  expect(headerLines(reordered)).toEqual(headerLines(diff))
  expect(reordered.match(/^@@ [^\n]+/gm)?.toSorted()).toEqual(diff.match(/^@@ [^\n]+/gm)?.toSorted())
})

test("reordering keeps file boundaries when the final patch line has no newline", () => {
  const first = "diff --git a/a.ts b/a.ts\n--- a/a.ts\n+++ b/a.ts\n@@ -1 +1 @@\n-old\n+new\n"
  const last = "diff --git a/b.ts b/b.ts\n--- a/b.ts\n+++ b/b.ts\n@@ -1 +1 @@\n-before\n+after"
  for (const end of [last, `${last}\n\\ No newline at end of file`]) {
    const result = reorderDiff(first + end)
    expect(result).toContain(`${end}\ndiff --git a/a.ts b/a.ts`)
    expect(sortedChanges(result)).toEqual(sortedChanges(first + end))
    expect(sortedHunks(result)).toEqual(sortedHunks(first + end))
  }
})

function sortedChanges(diff: string) {
  return changes(diff)
    .map((change) => ({
      path: change.path,
      removed: change.removed,
      added: change.added.toSorted((left, right) => left.line - right.line || (left.text < right.text ? -1 : left.text > right.text ? 1 : 0)),
    }))
    .toSorted((left, right) => (left.path < right.path ? -1 : left.path > right.path ? 1 : 0))
}

function sortedHunks(diff: string) {
  return hunks(diff).toSorted((left, right) => {
    const order = JSON.stringify([left.path, left.line, left.current, left.original])
    const other = JSON.stringify([right.path, right.line, right.current, right.original])
    return order < other ? -1 : order > other ? 1 : 0
  })
}

function headerLines(diff: string) {
  return diff
    .split(/^(?=diff --git )/m)
    .filter((part) => part.startsWith("diff --git "))
    .map((part) => {
      const lines = part.split("\n")
      const start = lines.findIndex((line) => line.startsWith("@@ "))
      return (start < 0 ? lines : lines.slice(0, start)).join("\n")
    })
    .toSorted()
}
