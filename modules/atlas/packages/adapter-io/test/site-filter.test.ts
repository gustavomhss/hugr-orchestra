// @atlas/adapter-io — test/site-filter.test.ts  (genesis-hardening A5 + A3b — which files may be mined; loud git)
//
// A5: `createSiteFilter` keeps tests, fixtures, benchmarks, generated code, lockfiles, docs and data out of the
// frontier — by default, by `.gitattributes` `linguist-generated`, and by the operator's `.atlas/mine-exclude`
// (`!` re-includes). With a code index that has documents, only an indexed file is kept. The history source
// applies it where tracked paths enter, so an excluded file adds no churn and no blame.
// A3b: a git read that FAILS throws `GitHistoryError`; an empty or young repository is still thin history.

import { afterEach, describe, expect, it } from "vitest"
import { execFileSync } from "node:child_process"
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { create } from "@bufbuild/protobuf"
import { serializeSCIP, IndexSchema, DocumentSchema } from "@c4312/scip"
import { probeHistory } from "@atlas/genesis"
import { createSiteFilter } from "../src/site-filter.js"
import { createHistorySource } from "../src/git-history.js"
import { SCIP_INDEX_REL } from "../src/scip.js"

const scratch: string[] = []
afterEach(() => {
  while (scratch.length > 0) rmSync(scratch.pop()!, { recursive: true, force: true })
})

const tempDir = (): string => {
  const dir = mkdtempSync(join(tmpdir(), "atlas-site-filter-"))
  scratch.push(dir)
  return dir
}

const write = (repo: string, files: Readonly<Record<string, string | Uint8Array>>): void => {
  for (const [rel, body] of Object.entries(files)) {
    mkdirSync(join(repo, rel, ".."), { recursive: true })
    writeFileSync(join(repo, rel), body)
  }
}

/** A git repo; each entry of `commits` is one commit writing those files (in order). */
function gitRepo(commits: readonly Readonly<Record<string, string | Uint8Array>>[]): string {
  const repo = tempDir()
  const git = (...args: string[]): void => void execFileSync("git", args, { cwd: repo, stdio: "ignore" })
  git("init", "-q")
  git("config", "user.email", "test@atlas.local")
  git("config", "user.name", "atlas-test")
  commits.forEach((files, i) => {
    write(repo, files)
    git("add", "-A")
    git("commit", "-qm", `c${i}`)
  })
  return repo
}

const indexOf = (paths: readonly string[]): Uint8Array =>
  serializeSCIP(create(IndexSchema, { documents: paths.map((p) => create(DocumentSchema, { relativePath: p })) }))

describe("genesis-hardening A5 — the default exclusion rules", () => {
  const keep = createSiteFilter(tempDir()) // not a repository: patterns only (no attributes, no index)

  it.each([
    "packages/x/test/a.ts",
    "tests/a.py",
    "packages/e2e-blackbox/src/h.ts",
    "src/fixtures/a.ts",
    "src/__snapshots__/a.ts",
    "src/a.test.ts",
    "src/a.spec.tsx",
    "pkg/test_util.py",
    "pkg/util_test.py",
    "crate/benches/b.rs",
    "src/generated/api.ts",
    "bun.lock",
    "sub/package-lock.json",
    "yarn.lock",
    "pnpm-lock.yaml",
    "native/Cargo.lock",
    "uv.lock",
    "poetry.lock",
    "README.md",
    "tsconfig.json",
    "docs/guide.ts",
    ".atlas/index.scip",
    "src/Button.stories.tsx",
    "modules/atlas/packages/cli/src/mine.ts",
    "native/omni/qa/run.rs",
  ])("excludes %s", (path) => {
    expect(keep(path)).toBe(false)
  })

  it.each(["src/app.ts", "packages/x/src/latest.ts", "native/omni/src/lib.rs", "modules/relay/x.py", "pkg/docs/a.ts"])(
    "keeps %s",
    (path) => {
      expect(keep(path)).toBe(true)
    },
  )
})

describe("genesis-hardening A5 — attributes, operator override, index coverage", () => {
  it("a file `.gitattributes` marks linguist-generated is excluded", () => {
    const repo = gitRepo([
      {
        ".gitattributes": "src/gen.ts linguist-generated\nsrc/notgen.ts -linguist-generated\n",
        "src/gen.ts": "1",
        "src/notgen.ts": "1",
      },
    ])
    const keep = createSiteFilter(repo)
    expect(keep("src/gen.ts")).toBe(false)
    expect(keep("src/notgen.ts")).toBe(true)
  })

  it("`.atlas/mine-exclude` adds rules and `!pattern` re-includes a default", () => {
    const repo = tempDir()
    write(repo, { ".atlas/mine-exclude": "# operator rules\nlegacy/**\n!**/fixtures/**\n" })
    const keep = createSiteFilter(repo)
    expect(keep("legacy/old.ts")).toBe(false)
    expect(keep("src/fixtures/real.ts")).toBe(true) //   re-included
    expect(keep("src/a.test.ts")).toBe(false) //         other defaults still hold
  })

  it("with an index that has documents only an indexed file is kept; without one the leg is skipped", () => {
    const indexed = tempDir()
    write(indexed, { [SCIP_INDEX_REL]: indexOf(["src/a.ts"]) })
    expect(createSiteFilter(indexed)("src/a.ts")).toBe(true)
    expect(createSiteFilter(indexed)("src/b.ts")).toBe(false)

    const empty = tempDir()
    write(empty, { [SCIP_INDEX_REL]: indexOf([]) }) //  an index with no document covers nothing: skipped
    expect(createSiteFilter(empty)("src/b.ts")).toBe(true)
    expect(createSiteFilter(tempDir())("src/b.ts")).toBe(true) // no index at all
  })
})

describe("genesis-hardening A5 — the history source applies the filter where paths enter", () => {
  const churned = [
    { "src/core.ts": "a\n", "src/core.test.ts": "t\n" },
    { "src/core.ts": "a\nb\n", "src/core.test.ts": "t\nu\n" },
    { "src/core.test.ts": "t\nu\nv\n" },
  ]

  it("an excluded file never enters the frontier, however much it churns", () => {
    const repo = gitRepo(churned)
    const front = createHistorySource(repo, "HEAD").frontier(repo, "HEAD").map((s) => s.qualifiedPath)
    expect(front).toEqual(["src/core.ts"])
    // Control: the SAME history with every file kept ranks the test file first (churn 3).
    const all = createHistorySource(repo, "HEAD", () => true).frontier(repo, "HEAD").map((s) => s.qualifiedPath)
    expect(all).toEqual(["src/core.test.ts", "src/core.ts"])
  })

  it("an excluded file adds no blame: a one-commit lockfile no longer makes history look concentrated", () => {
    const lock = Array.from({ length: 400 }, (_, i) => `line ${i}`).join("\n")
    const repo = gitRepo([
      { "package-lock.json": lock, "src/a.ts": "a\n" },
      { "src/a.ts": "a\nb\n" },
      { "src/b.ts": "b\n" },
      { "src/c.ts": "c\n" },
    ])
    const filtered = createHistorySource(repo, "HEAD").blameConcentration(repo, "HEAD")
    const unfiltered = createHistorySource(repo, "HEAD", () => true).blameConcentration(repo, "HEAD")
    expect(unfiltered).toBeGreaterThan(0.9) //   the lockfile's single commit owns almost every line
    expect(filtered).toBeLessThan(0.5) //        without it, blame spreads over the source commits
  })

  it("with an index, only the files it covers are in the frontier; without one, every churned file", () => {
    const commits = [
      { "src/a.ts": "a\n", "src/b.ts": "b\n" },
      { "src/a.ts": "a\n1\n", "src/b.ts": "b\n1\n" },
    ]
    const bare = gitRepo(commits)
    expect(createHistorySource(bare, "HEAD").frontier(bare, "HEAD").map((s) => s.qualifiedPath)).toEqual([
      "src/a.ts",
      "src/b.ts",
    ])
    const indexed = gitRepo(commits)
    write(indexed, { [SCIP_INDEX_REL]: indexOf(["src/a.ts"]) }) // untracked: `.atlas/` is never a site
    expect(createHistorySource(indexed, "HEAD").frontier(indexed, "HEAD").map((s) => s.qualifiedPath)).toEqual([
      "src/a.ts",
    ])
  })
})

describe("genesis-hardening A3b — git failure is loud, an empty history is not", () => {
  it("a directory git cannot read throws GitHistoryError naming the command and git's error", () => {
    const notRepo = tempDir()
    const h = createHistorySource(notRepo, "HEAD")
    expect(() => probeHistory(h, notRepo, "HEAD")).toThrow(
      /git failed in .*: git rev-list --count HEAD — .*not a git repository/i,
    )
    expect(() => h.frontier(notRepo, "HEAD")).toThrow(/git failed in .*: git ls-tree -r -z HEAD/)
  })

  it("a repository with no commits, and one with a single commit, are thin history — no throw", () => {
    const empty = gitRepo([])
    const h = createHistorySource(empty, "HEAD")
    expect(probeHistory(h, empty, "HEAD")).toEqual({ thin: true, reason: "low-commit-count" })
    expect(h.frontier(empty, "HEAD")).toEqual([])

    const young = gitRepo([{ "src/a.ts": "a\n" }])
    expect(probeHistory(createHistorySource(young, "HEAD"), young, "HEAD")).toEqual({
      thin: true,
      reason: "low-commit-count",
    })
  })
})
