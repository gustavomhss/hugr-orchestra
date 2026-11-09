// G2.2 F1 — host observer oracle (HO-01..HO-12). Contract:
// modules/atlas/docs/design/genesis-g2.2-contract.md §3.2.
// Content / membership / removal / recreation use real FS/Git; transient FS/Git errors are
// injected at the narrow `OwnershipObserveSeams` seam. Every test must fail on the unimplemented
// seam (named failure), never on import/collection error.

import { mkdirSync, rmSync, symlinkSync, utimesSync, writeFileSync } from "node:fs"
import { join } from "node:path"
import { afterEach, describe, expect, it } from "vitest"
import { id } from "@atlas/kernel"
import { observeOwnershipInput, ownershipInput, ownershipInputFromObservation } from "../src/ownership-input.js"
import type { OwnershipObserveSeams } from "../src/ownership-input.js"
import { makeFixRepo } from "./harness/fix-repo.js"

const cleanups: (() => void)[] = []
afterEach(() => cleanups.splice(0).forEach((cleanup) => cleanup()))

const fileVersion = (bytes: Uint8Array): string =>
  String(id({ kind: "ownership-source", version: 1, bytes: Array.from(bytes) }))
const membersVersion = (paths: readonly string[]): string =>
  String(id({ kind: "ownership-membership", version: 2, bytes: Array.from(new TextEncoder().encode([...new Set(paths)].sort().join("\0"))) }))
const text = (value: string): Uint8Array => new TextEncoder().encode(value)
const coded = (code: string): Error & { code: string } => Object.assign(new Error(code), { code })

describe("G2.2 host observer", () => {
  it("HO-01 file present hashes exact bytes", () => {
    const f = makeFixRepo()
    cleanups.push(f.cleanup)
    const observed = observeOwnershipInput(f.repoPath, "file:src/util.ts")
    expect(observed).toEqual({ kind: "present", version: fileVersion(text("export function greet(name: string): string {\n  return `hi ${name}`;\n}\n")) })
    writeFileSync(join(f.repoPath, "src", "util.ts"), "export const changed = true\n")
    expect(observeOwnershipInput(f.repoPath, "file:src/util.ts")).toEqual({ kind: "present", version: fileVersion(text("export const changed = true\n")) })
    expect(observeOwnershipInput(f.repoPath, "file:src/util.ts")).not.toEqual(observed)
    writeFileSync(join(f.repoPath, "src", "util.ts"), "export function greet(name: string): string {\n  return `hi ${name}`;\n}\n")
    utimesSync(join(f.repoPath, "src", "util.ts"), new Date("2020-01-01T00:00:00Z"), new Date("2020-01-01T00:00:00Z"))
    expect(observeOwnershipInput(f.repoPath, "file:src/util.ts")).toEqual(observed)
    utimesSync(join(f.repoPath, "src", "util.ts"), new Date("2030-01-01T00:00:00Z"), new Date("2030-01-01T00:00:00Z"))
    expect(observeOwnershipInput(f.repoPath, "file:src/util.ts")).toEqual(observed)
  })

  it("HO-02 file ceiling applies to bytes actually read", () => {
    const f = makeFixRepo()
    cleanups.push(f.cleanup)
    writeFileSync(join(f.repoPath, "empty.txt"), new Uint8Array(0))
    writeFileSync(join(f.repoPath, "exact.txt"), new Uint8Array(256000))
    writeFileSync(join(f.repoPath, "over.txt"), new Uint8Array(256001))
    expect(observeOwnershipInput(f.repoPath, "file:empty.txt")).toEqual({ kind: "present", version: fileVersion(new Uint8Array(0)) })
    expect(observeOwnershipInput(f.repoPath, "file:exact.txt").kind).toBe("present")
    expect(observeOwnershipInput(f.repoPath, "file:over.txt")).toEqual({ kind: "unavailable" })
    const grown: OwnershipObserveSeams = {
      lstat: () => ({ size: 10, isFile: true, isDirectory: false, isSymbolicLink: false }),
      readBytes: () => new Uint8Array(256001),
    }
    expect(observeOwnershipInput(f.repoPath, "file:src/util.ts", grown)).toEqual({ kind: "unavailable" })
  })

  it("HO-03 absent requires a verified negative lookup", () => {
    const f = makeFixRepo()
    cleanups.push(f.cleanup)
    expect(observeOwnershipInput(f.repoPath, "file:no-such-source.ts")).toEqual({ kind: "absent" })
    expect(observeOwnershipInput(join(f.repoPath, "no-repository"), "file:src/util.ts")).toEqual({ kind: "unavailable" })
    expect(observeOwnershipInput(f.repoPath, "members:no-such-scope")).toEqual({ kind: "absent" })
  })

  it("HO-04 read errors never become absence", () => {
    const f = makeFixRepo()
    cleanups.push(f.cleanup)
    const eacces: OwnershipObserveSeams = { lstat: () => { throw coded("EACCES") } }
    const eperm: OwnershipObserveSeams = { lstat: () => { throw coded("EPERM") } }
    const eio: OwnershipObserveSeams = {
      lstat: () => ({ size: 5, isFile: true, isDirectory: false, isSymbolicLink: false }),
      readBytes: () => { throw coded("EIO") },
    }
    const gone: OwnershipObserveSeams = {
      lstat: () => ({ size: 5, isFile: true, isDirectory: false, isSymbolicLink: false }),
      readBytes: () => { throw coded("ENOENT") },
    }
    expect(observeOwnershipInput(f.repoPath, "file:src/util.ts", eacces)).toEqual({ kind: "unavailable" })
    expect(observeOwnershipInput(f.repoPath, "file:src/util.ts", eperm)).toEqual({ kind: "unavailable" })
    expect(observeOwnershipInput(f.repoPath, "file:src/util.ts", eio)).toEqual({ kind: "unavailable" })
    expect(observeOwnershipInput(f.repoPath, "file:src/util.ts/child")).toEqual({ kind: "unavailable" })
    expect(observeOwnershipInput(f.repoPath, "file:src/util.ts", gone)).toEqual({ kind: "unavailable" })
    expect(observeOwnershipInput(f.repoPath, "file:src/util.ts", gone)).not.toEqual({ kind: "absent" })
  })

  it("HO-05 invalid escaped and nonregular inputs are unavailable", () => {
    const f = makeFixRepo()
    cleanups.push(f.cleanup)
    symlinkSync(join(f.repoPath, "src", "util.ts"), join(f.repoPath, "alias.ts"))
    mkdirSync(join(f.repoPath, "realdir"))
    symlinkSync(join(f.repoPath, "realdir"), join(f.repoPath, "linkdir"))
    for (const key of [
      "recipe:pretend-version",
      "file:../outside",
      "file:.git/config",
      "file:.atlas/policy.json",
      "file:/absolute/path",
      "file:C:\\evil",
      "file:with\\backslash",
      "file:alias.ts",
      "file:linkdir/inside.ts",
      "file:src",
      "file:./dot",
      "members:../escape",
    ]) {
      expect(observeOwnershipInput(f.repoPath, key), key).toEqual({ kind: "unavailable" })
    }
  })

  it("HO-06 members v2 describes Git-eligible live files", () => {
    const f = makeFixRepo()
    cleanups.push(f.cleanup)
    expect(observeOwnershipInput(f.repoPath, "members:src")).toEqual({ kind: "present", version: membersVersion(["src/app.ts", "src/util.ts"]) })
    writeFileSync(join(f.repoPath, "src", "util.ts"), "changed bytes, same membership\n")
    expect(observeOwnershipInput(f.repoPath, "members:src")).toEqual({ kind: "present", version: membersVersion(["src/app.ts", "src/util.ts"]) })
    writeFileSync(join(f.repoPath, "src", "added.ts"), "new member\n")
    expect(observeOwnershipInput(f.repoPath, "members:src")).toEqual({ kind: "present", version: membersVersion(["src/added.ts", "src/app.ts", "src/util.ts"]) })
    writeFileSync(join(f.repoPath, "src", "added.log"), "ignored\n")
    expect(observeOwnershipInput(f.repoPath, "members:src")).toEqual({ kind: "present", version: membersVersion(["src/added.ts", "src/app.ts", "src/util.ts"]) })
  })

  it("HO-07 empty scope is present and missing scope is absent", () => {
    const f = makeFixRepo()
    cleanups.push(f.cleanup)
    mkdirSync(join(f.repoPath, "empty-scope"))
    expect(observeOwnershipInput(f.repoPath, "members:empty-scope")).toEqual({ kind: "present", version: membersVersion([]) })
    expect(observeOwnershipInput(f.repoPath, "members:empty-scope")).toEqual({ kind: "present", version: membersVersion([]) })
    expect(observeOwnershipInput(f.repoPath, "members:no-such-scope")).toEqual({ kind: "absent" })
    const denied: OwnershipObserveSeams = { gitMembers: () => { throw coded("EACCES") } }
    expect(observeOwnershipInput(f.repoPath, "members:empty-scope", denied)).toEqual({ kind: "unavailable" })
  })

  it("HO-08 unstaged deletion and eligible recreation change members", () => {
    const f = makeFixRepo()
    cleanups.push(f.cleanup)
    const base = membersVersion(["src/app.ts", "src/util.ts"])
    expect(observeOwnershipInput(f.repoPath, "members:src")).toEqual({ kind: "present", version: base })
    rmSync(join(f.repoPath, "src", "util.ts"))
    expect(observeOwnershipInput(f.repoPath, "members:src")).toEqual({ kind: "present", version: membersVersion(["src/app.ts"]) })
    writeFileSync(join(f.repoPath, "src", "util.ts"), "export function greet(name: string): string {\n  return `hi ${name}`;\n}\n")
    expect(observeOwnershipInput(f.repoPath, "members:src")).toEqual({ kind: "present", version: base })
  })

  it("HO-09 an unobservable candidate invalidates membership", () => {
    const f = makeFixRepo()
    cleanups.push(f.cleanup)
    symlinkSync(join(f.repoPath, "src", "util.ts"), join(f.repoPath, "src", "alias.ts"))
    const seam: OwnershipObserveSeams = {
      gitMembers: () => ({ stdout: ["src/app.ts", "src/util.ts", "src/alias.ts"].join("\0") + "\0", stderr: "", truncated: false }),
      lstat: (path) => path.endsWith("alias.ts") ? { size: 5, isFile: false, isDirectory: false, isSymbolicLink: true } : { size: 5, isFile: true, isDirectory: false, isSymbolicLink: false },
    }
    expect(observeOwnershipInput(f.repoPath, "members:src", seam)).toEqual({ kind: "unavailable" })
  })

  it("HO-10 incomplete Git enumeration is unavailable", () => {
    const f = makeFixRepo()
    cleanups.push(f.cleanup)
    const nonZero: OwnershipObserveSeams = { gitMembers: () => { throw new Error("git ls-files exited 128") } }
    const diagnostic: OwnershipObserveSeams = { gitMembers: () => ({ stdout: "src/util.ts\0", stderr: "warning: partial", truncated: false }) }
    const truncated: OwnershipObserveSeams = { gitMembers: () => ({ stdout: "src/util.ts\0", stderr: "", truncated: true }) }
    const timeout: OwnershipObserveSeams = { gitMembers: () => { throw coded("ETIMEDOUT") } }
    const malformed: OwnershipObserveSeams = { gitMembers: () => ({ stdout: "src/util.ts\nsrc/app.ts\n", stderr: "", truncated: false }) }
    for (const seam of [nonZero, diagnostic, truncated, timeout, malformed]) {
      expect(observeOwnershipInput(f.repoPath, "members:src", seam)).toEqual({ kind: "unavailable" })
    }
  })

  it("HO-11 legacy oracle projects tri-state without inventing absence", () => {
    const f = makeFixRepo()
    cleanups.push(f.cleanup)
    expect(ownershipInputFromObservation({ kind: "present", version: "v1" })).toBe("v1")
    expect(ownershipInputFromObservation({ kind: "absent" })).toBeUndefined()
    expect(ownershipInputFromObservation({ kind: "unavailable" })).toBeUndefined()
    const observed = observeOwnershipInput(f.repoPath, "file:src/util.ts")
    expect(ownershipInputFromObservation(observed)).toBe(ownershipInput(f.repoPath, "file:src/util.ts"))
    expect(observeOwnershipInput(f.repoPath, "recipe:pretend-version")).toEqual({ kind: "unavailable" })
    expect(ownershipInput(f.repoPath, "recipe:pretend-version")).toBeUndefined()
  })

  it("HO-12 membership policy versions cannot alias", () => {
    const f = makeFixRepo()
    cleanups.push(f.cleanup)
    const paths = ["src/app.ts", "src/util.ts"]
    const v1 = String(id({ kind: "ownership-membership", version: 1, bytes: Array.from(new TextEncoder().encode([...paths].sort().join("\0"))) }))
    const v2 = membersVersion(paths)
    expect(v1).not.toBe(v2)
    const observed = observeOwnershipInput(f.repoPath, "members:src")
    expect(observed).toEqual({ kind: "present", version: v2 })
    expect(observed.kind === "present" ? observed.version : "mismatch").not.toBe(v1)
    expect(ownershipInput(f.repoPath, "members:src")).toBe(v2)
  })
})
