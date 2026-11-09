import { symlinkSync, writeFileSync } from "node:fs"
import { join } from "node:path"
import { afterEach, describe, expect, it } from "vitest"
import { ownershipInput } from "../src/ownership-input.js"
import { makeFixRepo } from "./harness/fix-repo.js"

const cleanups: (() => void)[] = []
afterEach(() => cleanups.splice(0).forEach((cleanup) => cleanup()))

describe("host-bound ownership input oracle", () => {
  it("RP-5 source/recipe bytes and registered membership drift independently; no receipt echo", () => {
    const f = makeFixRepo()
    cleanups.push(f.cleanup)
    const source = ownershipInput(f.repoPath, "file:src/util.ts")
    const members = ownershipInput(f.repoPath, "members:src")
    expect(source).toMatch(/^[0-9a-f]{64}$/)
    expect(members).toMatch(/^[0-9a-f]{64}$/)
    writeFileSync(join(f.repoPath, "src", "util.ts"), "changed source bytes\n")
    expect(ownershipInput(f.repoPath, "file:src/util.ts")).not.toBe(source)
    expect(ownershipInput(f.repoPath, "members:src")).toBe(members)
    writeFileSync(join(f.repoPath, "src", "added.ts"), "new member\n")
    expect(ownershipInput(f.repoPath, "members:src")).not.toBe(members)
    writeFileSync(join(f.repoPath, "recipe.md"), "recipe v1\n")
    const recipe = ownershipInput(f.repoPath, "file:recipe.md")
    expect(recipe).toMatch(/^[0-9a-f]{64}$/)
    writeFileSync(join(f.repoPath, "recipe.md"), "recipe v2\n")
    expect(ownershipInput(f.repoPath, "file:recipe.md")).not.toBe(recipe)
  })

  it("RP-5 unavailable/empty/unknown/oversized/escaped inputs fail closed", () => {
    const f = makeFixRepo()
    cleanups.push(f.cleanup)
    expect(ownershipInput(f.repoPath, "members:no-such-scope")).toBeUndefined()
    expect(ownershipInput(f.repoPath, "file:no-such-source")).toBeUndefined()
    expect(ownershipInput(f.repoPath, "recipe:pretend-version")).toBeUndefined()
    expect(ownershipInput(f.repoPath, "file:../outside")).toBeUndefined()
    expect(ownershipInput(f.repoPath, "file:.git/config")).toBeUndefined()
    writeFileSync(join(f.repoPath, "oversized.txt"), new Uint8Array(256001))
    expect(ownershipInput(f.repoPath, "file:oversized.txt")).toBeUndefined()
    symlinkSync(join(f.repoPath, "src", "util.ts"), join(f.repoPath, "alias.ts"))
    expect(ownershipInput(f.repoPath, "file:alias.ts")).toBeUndefined()
    expect(ownershipInput(join(f.repoPath, "no-repository"), "members:src")).toBeUndefined()
  })
})
