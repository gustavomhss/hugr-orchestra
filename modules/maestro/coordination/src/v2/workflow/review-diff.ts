import type { ReviewRoute } from "@orchestra/core/review/route"
import type { GitCli } from "@orchestra/core/git-cli"
import { Effect } from "effect"

/** Read from the base revision only, so a change cannot rewrite how it is reviewed. */
export const RULE_FILES = ["AGENTS.md", "CLAUDE.md", "REVIEW.md"] as const

/** The rule files the base revision holds for the changed paths, from the root down; a missing file is skipped. */
export const baseRules = Effect.fn("ReviewFanoutV2.baseRules")(function* (
  git: GitCli.Interface,
  worktree: string,
  base: string,
  changed: ReadonlyArray<string>,
) {
  const directories = Array.from(new Set(changed.flatMap(ancestors))).toSorted(
    (left, right) => depth(left) - depth(right) || (left < right ? -1 : left > right ? 1 : 0),
  )
  const found = yield* Effect.forEach(
    directories.flatMap((directory) => RULE_FILES.map((name) => (directory ? `${directory}/${name}` : name))),
    (file) =>
      git
        .run(["show", `${base}:${file}`], { cwd: worktree })
        .pipe(Effect.map((result) => (result.exitCode === 0 ? [{ path: file, text: result.text() }] : []))),
  )
  return found.flat()
})

/** Hunks a regress probe can revert: head lines (`current`) at `line`, replaced by the base lines (`original`). */
export function hunks(diff: string) {
  return sections(diff).flatMap((section) => {
    const found: Array<{ path: string; line: number; current: string[]; original: string[] }> = []
    let head = 0
    let open: { line: number; current: string[]; original: string[] } | undefined
    const flush = () => {
      if (!open || (open.current.length === 0 && open.original.length === 0)) {
        open = undefined
        return
      }
      found.push({ path: section.path, ...open })
      open = undefined
    }
    for (const line of section.text.split("\n")) {
      const marker = /^@@ -\d+(?:,\d+)? \+(\d+)(?:,\d+)? @@/.exec(line)
      if (marker) {
        flush()
        head = Number(marker[1])
        continue
      }
      if (head === 0 || line.startsWith("\\")) continue
      if (line.startsWith(" ")) {
        flush()
        head += 1
        continue
      }
      if (line.startsWith("-")) {
        open ??= { line: head, current: [], original: [] }
        open.original.push(line.slice(1))
        continue
      }
      if (line.startsWith("+")) {
        open ??= { line: head, current: [], original: [] }
        open.current.push(line.slice(1))
        head += 1
      }
    }
    flush()
    return found
  })
}

/** The changes of a unified diff as routing reads them: added lines with their head line numbers, removed counts. */
export function changes(diff: string): ReviewRoute.Change[] {
  return sections(diff).map((section) =>
    section.text.split("\n").reduce(
      (change, line) => {
        const hunk = /^@@ -\d+(?:,\d+)? \+(\d+)(?:,\d+)? @@/.exec(line)
        if (hunk) return { ...change, next: Number(hunk[1]) }
        if (change.next === 0) return change
        if (line.startsWith("+")) return { ...change, added: [...change.added, { line: change.next, text: line.slice(1) }], next: change.next + 1 }
        if (line.startsWith("-")) return { ...change, removed: change.removed + 1 }
        if (line.startsWith(" ")) return { ...change, next: change.next + 1 }
        return change
      },
      { path: section.path, added: [] as { line: number; text: string }[], removed: 0, next: 0 },
    ),
  ).map((change) => ({ path: change.path, added: change.added, removed: change.removed }))
}

/** The sections of a unified diff for the given paths. */
export function sliceDiff(diff: string, paths: ReadonlyArray<string>) {
  return sections(diff)
    .filter((section) => paths.includes(section.path))
    .map((section) => section.text)
    .join("")
}

function sections(diff: string) {
  return diff
    .split(/^(?=diff --git )/m)
    .flatMap((text) => {
      const header = /^diff --git a\/(.+?) b\/(.+)$/m.exec(text)
      return header ? [{ path: header[2], text }] : []
    })
}

function ancestors(file: string) {
  const parts = file.split("/").slice(0, -1)
  return ["", ...parts.map((_, index) => parts.slice(0, index + 1).join("/"))]
}

function depth(directory: string) {
  return directory ? directory.split("/").length : 0
}
