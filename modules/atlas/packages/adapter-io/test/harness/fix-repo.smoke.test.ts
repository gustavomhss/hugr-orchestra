// @atlas/adapter-io — test/harness/fix-repo.smoke.test.ts
//
// Fixture-infra sanity (NOT a golden): proves the frozen `fix-repo` oracle materializes faithfully so
// every downstream WP that consumes it starts from a sound base. Asserts the committed tracked set is
// exactly TRACKED_PATHS (gitignored paths excluded by real git) and that T_ref's shape agrees with it.

import { describe, it, expect, afterEach } from "vitest"
import { execFileSync } from "node:child_process"
import { makeFixRepo, TRACKED_PATHS, T_ref, type FixRepo } from "./fix-repo.js"

describe("fix-repo harness (fixture infra)", () => {
  let repo: FixRepo | undefined
  afterEach(() => repo?.cleanup())

  it("commits exactly the tracked set — dist/ and *.log are excluded by git", () => {
    repo = makeFixRepo()
    const tracked = execFileSync("git", ["ls-files"], { cwd: repo.repoPath, encoding: "utf8" })
      .split("\n")
      .filter(Boolean)
      .sort()
    expect(tracked).toEqual([...TRACKED_PATHS])
    expect(tracked).not.toContain("dist/bundle.js")
    expect(tracked).not.toContain("debug.log")
  })

  it("T_ref enumerates the same leaf paths as the tracked set (oracle ↔ disk agree)", () => {
    const leaves: string[] = []
    const walk = (n: typeof T_ref): void => {
      if (n.children.length === 0) leaves.push(n.path)
      else n.children.forEach(walk)
    }
    walk(T_ref)
    expect(leaves.sort()).toEqual([...TRACKED_PATHS])
  })
})
