// GEN-16 · `atlas decay` drives the KNOW-17 decay pass over the repository's own hits ledger
// (`.atlas/hits.jsonl`). The pass itself is `hits-log.test.ts`'s job; this suite asserts the command's
// contract: a malformed window is a usage error that writes nothing, the first run opens the window, and
// `--restore` logs one hit that the next pass counts.

import { afterEach, describe, expect, it } from "vitest"
import { existsSync, mkdtempSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { HITS_REL, readHitsLog } from "@atlas/adapter-io"
import { runDecay } from "../src/decay-cli.js"
import { COMMANDS, COMMAND_LEG } from "../src/map.js"

let tmp: string | undefined
afterEach(() => {
  if (tmp) rmSync(tmp, { recursive: true, force: true })
  tmp = undefined
})

describe("atlas decay", () => {
  it("is a registered OPS command on the query leg", () => {
    expect(COMMANDS).toContain("decay")
    expect(COMMAND_LEG.decay).toBe("atlas-query")
  })

  it("a malformed window is a usage error and writes no ledger", () => {
    tmp = mkdtempSync(join(tmpdir(), "atlas-decay-"))
    for (const window of ["0", "-3", "1.5", "abc"]) {
      const r = runDecay(tmp, { window })
      expect(r.exitCode).toBe(1)
      expect(r.stdout).toContain("usage: atlas decay")
    }
    expect(existsSync(join(tmp, HITS_REL))).toBe(false)
  })

  it("the first run opens the window; a restore hit is counted by the next pass", () => {
    tmp = mkdtempSync(join(tmpdir(), "atlas-decay-"))
    const baseline = runDecay(tmp, { window: "2" })
    expect(baseline.exitCode).toBe(0)
    expect(baseline.stdout).toContain("close the first window")

    const restore = runDecay(tmp, { restore: "k:x" })
    expect(restore.exitCode).toBe(0)
    expect(restore.stdout).toContain("hits: 1")

    const open = runDecay(tmp, { window: "2" })
    expect(open.stdout).toContain("1 of 2 hit(s)")
    expect(readHitsLog(join(tmp, HITS_REL)).events.map((event) => event.kind)).toEqual(["decay", "hit"])
  })
})
