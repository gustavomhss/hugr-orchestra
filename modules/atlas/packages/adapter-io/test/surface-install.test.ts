// @atlas/adapter-io — test/surface-install.test.ts  (D37: the Atlas UI surface sets Atlas up in a repository)
//
// Over a real committed repository: install creates `.atlas/`, a policy granting the actor every first-segment scope
// plus the mined scope, and the ignore rule; a second install refuses; a directory without git and a repository with
// no actor refuse and write nothing.

import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { afterEach, describe, expect, it } from "vitest"
import { openSurface } from "../src/surface/index.js"
import { makeFixRepo } from "./harness/fix-repo.js"

const prior = process.env.ATLAS_ACTOR
const cleanups: (() => void)[] = []
afterEach(() => {
  for (const cleanup of cleanups.splice(0)) cleanup()
  if (prior === undefined) delete process.env.ATLAS_ACTOR
  else process.env.ATLAS_ACTOR = prior
})

function repo(): string {
  const fix = makeFixRepo()
  cleanups.push(fix.cleanup)
  return fix.repoPath
}

describe("openSurface — install", () => {
  it("creates the store, grants the actor every scope and ignores the store", () => {
    process.env.ATLAS_ACTOR = "alice@atlas.test"
    const repoPath = repo()
    expect(openSurface(repoPath).snapshot()).toEqual({ state: "empty" })
    const out = openSurface(repoPath).install()
    expect(out.installed).toBe(true)
    expect(out.refusal).toBeNull()
    expect(out.actor).toBe("alice@atlas.test")
    expect(out.scopes).toContain("src")
    expect(out.scopes).toContain("atlas:mined")
    expect(out.index?.scipRel).toBe(".atlas/index.scip")
    const policy = JSON.parse(readFileSync(join(repoPath, ".atlas", "policy.json"), "utf8"))
    expect(policy.t0Heuristic).toEqual({ keywords: [] })
    expect(policy.authz.scopes.src).toEqual(["alice@atlas.test"])
    expect(policy.authz.scopes["atlas:mined"]).toEqual(["alice@atlas.test"])
    expect(readFileSync(join(repoPath, ".gitignore"), "utf8")).toContain(".atlas/*")
    expect(openSurface(repoPath).snapshot().state).toBe("ok")
  })

  it("refuses a second install and leaves the policy as it was", () => {
    process.env.ATLAS_ACTOR = "alice@atlas.test"
    const repoPath = repo()
    openSurface(repoPath).install()
    const before = readFileSync(join(repoPath, ".atlas", "policy.json"), "utf8")
    process.env.ATLAS_ACTOR = "bob@atlas.test"
    const out = openSurface(repoPath).install()
    expect(out).toMatchObject({ installed: false, refusal: "already-installed", scopes: [], gitignore: null, index: null })
    expect(readFileSync(join(repoPath, ".atlas", "policy.json"), "utf8")).toBe(before)
  })

  it("refuses a directory that is not a git repository and writes nothing", () => {
    process.env.ATLAS_ACTOR = "alice@atlas.test"
    const dir = mkdtempSync(join(tmpdir(), "atlas-install-nogit-"))
    cleanups.push(() => rmSync(dir, { recursive: true, force: true }))
    expect(openSurface(dir).install()).toMatchObject({ installed: false, refusal: "no-git" })
    expect(existsSync(join(dir, ".atlas"))).toBe(false)
  })

  it("refuses when no actor is set and writes nothing", () => {
    process.env.ATLAS_ACTOR = ""
    const repoPath = repo()
    expect(openSurface(repoPath).install()).toMatchObject({ installed: false, refusal: "no-actor", actor: "" })
    expect(existsSync(join(repoPath, ".atlas"))).toBe(false)
  })
})
