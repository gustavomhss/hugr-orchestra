// @atlas/e2e-blackbox — test/s19-init-gitignore.blackbox.test.ts  (S19 — move-in installs the ignore rule)
//
// THE DEPLOYMENT DEPENDENCY, driven end to end through the real CLI binary.
//
// Atlas refuses to serve or write a durable store that is TRACKED BY GIT (the provenance tripwire) — a
// correct, fail-closed control. Its consequence for a real user is brutal and was never discharged: a repo
// with no ignore rule is ONE `git add -A` away from an Atlas that is silently off. Atlas's own repository
// has the rule; nothing in the product ever put it in anyone else's.
//
// This story asserts the loop a user actually walks: move in → work → `git add -A` → commit → read back.
// The middle two steps are the ones no in-process test can fake, because the thing being tested IS what git
// decides to track.

import { describe, it, expect, afterEach } from "vitest"
import { execFileSync } from "node:child_process"
import { readFileSync, writeFileSync } from "node:fs"
import { join } from "node:path"
import { makeFixtureRepo, runAtlas } from "../src/harness.js"
import type { FixtureRepo } from "../src/harness.js"

const SRC = "export function greet(name: string): string {\n  return `hi ${name}`;\n}\n"

let repo: FixtureRepo | undefined
afterEach(() => {
  repo?.cleanup()
  repo = undefined
})

/** A fixture repo with the Atlas ignore rule DELETED — i.e. an ordinary user's repository, which is the
 *  only shape this story is about. (`makeFixtureRepo` writes the rule because every OTHER story needs a
 *  healthy repo; here its absence is the premise.) */
function repoWithoutTheRule(): FixtureRepo {
  const r = makeFixtureRepo({ files: { "src/greet.ts": SRC } })
  writeFileSync(join(r.repoPath, ".gitignore"), "# a user's own ignore file, with nothing about Atlas\nnode_modules/\n")
  return r
}

const git = (repoPath: string, ...args: string[]): string =>
  execFileSync("git", args, { cwd: repoPath, encoding: "utf8" })

describe("S19 — `atlas init` installs the durable-store ignore rule", () => {
  it("RED: a fresh user repo has no Atlas rule, and `atlas init` now writes one", () => {
    repo = repoWithoutTheRule()
    const before = readFileSync(join(repo.repoPath, ".gitignore"), "utf8")
    expect(before).not.toContain(".atlas")

    const run = runAtlas(repo.repoPath, ["init", "."])
    expect(run.exitCode).toBe(0)
    // The user is TOLD, on the move-in door's own stdout — a silent repair is a repair nobody learns from.
    expect(run.stdout).toContain("gitignore:")

    const after = readFileSync(join(repo.repoPath, ".gitignore"), "utf8")
      .split(/\r?\n/)
      .map((l) => l.trim())
    expect(after).toContain(".atlas/*")
    // `.atlas/*`, NOT `.atlas/` — git cannot re-include a path under an excluded DIRECTORY, so the negation
    // below would be unreachable and the admin-owned policy would be silently dropped from version control.
    expect(after).not.toContain(".atlas/")
    expect(after).toContain("!.atlas/policy.json")
    // The user's own rules survive: this is an APPEND to their file, never a rewrite of it.
    expect(after).toContain("node_modules/")
  })

  it("THE PROPERTY: after `atlas init`, a `git add -A` no longer tracks the durable store", () => {
    repo = repoWithoutTheRule()
    // The counterfactual, measured in the same repo shape: with no rule, `git add -A` sweeps the store in.
    writeFileSync(join(repo.repoPath, ".atlas", "projection.json"), '{"current":[],"cas":[]}')
    git(repo.repoPath, "add", "-A")
    expect(git(repo.repoPath, "ls-files", ".atlas")).toContain(".atlas/projection.json")
    git(repo.repoPath, "rm", "-r", "--cached", "-q", ".atlas")

    expect(runAtlas(repo.repoPath, ["init", "."]).exitCode).toBe(0)
    git(repo.repoPath, "add", "-A")
    const tracked = git(repo.repoPath, "ls-files", ".atlas")
    expect(tracked).not.toContain(".atlas/projection.json")
    // …and the one file that IS source is still tracked. A rule that hid the admin policy would be worse
    // than no rule: the authorization config would stop being reviewable.
    expect(tracked).toContain(".atlas/policy.json")
  })

  it("IDEMPOTENT: a second `atlas init` writes nothing and says so — re-running move-in is free", () => {
    repo = repoWithoutTheRule()
    runAtlas(repo.repoPath, ["init", "."])
    const once = readFileSync(join(repo.repoPath, ".gitignore"), "utf8")
    const second = runAtlas(repo.repoPath, ["init", "."])
    expect(second.exitCode).toBe(0)
    expect(second.stdout).toContain("already denied")
    expect(readFileSync(join(repo.repoPath, ".gitignore"), "utf8")).toBe(once)
  })

  it("a repo that ALREADY has the rule (the healthy default fixture) is left byte-identical", () => {
    repo = makeFixtureRepo({ files: { "src/greet.ts": SRC } })
    const before = readFileSync(join(repo.repoPath, ".gitignore"), "utf8")
    expect(runAtlas(repo.repoPath, ["init", "."]).exitCode).toBe(0)
    expect(readFileSync(join(repo.repoPath, ".gitignore"), "utf8")).toBe(before)
  })
})
