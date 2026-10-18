// @atlas/adapter-io — test/harness/git-sbx.smoke.test.ts
//
// Fixture-infra sanity (NOT a golden): proves the frozen `git-sbx` topology materializes faithfully so
// both consuming WPs (DRIFT, HISTORY) start from a sound substrate. Asserts the merge-base, the greet
// body divergence (topic vs mb, untouched on main), the shared identical service.py bump, and that
// blame(greet) at r0/mainTip attributes to cGreet — plus that every captured SHA is a distinct 40-hex.

import { describe, it, expect, afterEach } from "vitest"
import { execFileSync } from "node:child_process"
import { makeGitSbx, type GitSbx } from "./git-sbx.js"

const HEX40 = /^[0-9a-f]{40}$/

describe("git-sbx harness (fixture infra)", () => {
  let sbx: GitSbx | undefined
  afterEach(() => sbx?.cleanup())

  const g = (repoPath: string, ...args: string[]): string =>
    execFileSync("git", args, { cwd: repoPath, encoding: "utf8" }).trim()

  it("merge-base(main, topic) === mb", () => {
    sbx = makeGitSbx()
    expect(g(sbx.repoPath, "merge-base", "main", "topic")).toBe(sbx.mb)
  })

  it("repo is left checked out on topic (HEAD === topicTip)", () => {
    sbx = makeGitSbx()
    expect(g(sbx.repoPath, "rev-parse", "HEAD")).toBe(sbx.topicTip)
  })

  it("greet's body diverges between mb and topicTip (hi → hello)", () => {
    sbx = makeGitSbx()
    const atMb = g(sbx.repoPath, "show", `${sbx.mb}:src/util.ts`)
    const atTip = g(sbx.repoPath, "show", `${sbx.topicTip}:src/util.ts`)
    expect(atMb).toContain("hi ${name}")
    expect(atTip).toContain("hello ${name}")
    expect(atTip).not.toContain("hi ${name}")
  })

  it("greet is UNCHANGED on main (arms the 9a mb→main mutant)", () => {
    sbx = makeGitSbx()
    expect(g(sbx.repoPath, "show", `${sbx.mainTip}:src/util.ts`)).toContain("hi ${name}")
  })

  it("service.py is identical at mainTip and topicTip (the shared X — arms 9b exclusion)", () => {
    sbx = makeGitSbx()
    const onMain = g(sbx.repoPath, "show", `${sbx.mainTip}:api/service.py`)
    const onTopic = g(sbx.repoPath, "show", `${sbx.topicTip}:api/service.py`)
    expect(onMain).toBe(onTopic)
    expect(onMain).toContain("return 43")
  })

  it("blame attributes greet body line to cGreet at r0/mainTip", () => {
    sbx = makeGitSbx()
    // util.ts line 2 is greet's body (`return `hi ${name}`;`) — never rewritten off C0 on main.
    // `--line-porcelain`: the first token of the first line is the full 40-hex commit SHA (unlike `-l`,
    // which prefixes root/boundary commits with `^` and truncates a hex digit to keep column width).
    const blame = g(sbx.repoPath, "blame", "--line-porcelain", "-L", "2,2", sbx.r0, "--", "src/util.ts")
    expect(blame.split("\n")[0]!.split(" ")[0]).toBe(sbx.cGreet)
  })

  it("all captured SHAs are distinct, non-empty 40-hex", () => {
    sbx = makeGitSbx()
    const shas = [sbx.mb, sbx.mainTip, sbx.topicTip, sbx.cGreet]
    for (const s of shas) expect(s).toMatch(HEX40)
    expect(new Set(shas).size).toBe(shas.length)
    expect(sbx.r0).toBe(sbx.mainTip) // r0 is the pinned alias of mainTip
  })
})
