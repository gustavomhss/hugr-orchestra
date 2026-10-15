// @atlas/cli — test/mine-proposer-identity.test.ts  (#210: capture WHICH model produced answers)
//
// `resolveProposer` now stamps a stable `modelIdentity` on its result so W-REPORT can record what a run was
// produced by. It is `cmd + args` plus a BEST-EFFORT `--version` probe. The two load-bearing properties:
//   • a resolvable command yields an identity that carries cmd+args (and appends a real version when the
//     probe succeeds) — never empty, never fabricated.
//   • a command with no readable `--version` still yields a NON-EMPTY identity that NOTES the probe failed,
//     rather than inventing a version.
// No live model, no vendor: the stand-ins are POSIX-adjacent binaries whose `--version` behaviour is fixed.

import { describe, it, expect, afterAll } from "vitest"
import { mkdtempSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"

import { resolveProposer, NO_MODEL_IDENTITY } from "../src/mine-proposer.js"

const scratch: string[] = []

/** An operator config on disk, OUTSIDE any analysed repo (the ADR-0011 two-scope split). Returns the env
 *  that points `resolveProposer` at it and a throwaway repo path for the source reader. */
function wired(cmd: string, args: readonly string[] = []): { env: NodeJS.ProcessEnv; repo: string } {
  const cfgDir = mkdtempSync(join(tmpdir(), "atlas-identity-cfg-"))
  const repo = mkdtempSync(join(tmpdir(), "atlas-identity-repo-")) // DISTINCT from the config dir: an
  scratch.push(cfgDir, repo) //                                       operator config inside the analysed repo is refused (ACE guard)
  const cfg = join(cfgDir, "model.json")
  writeFileSync(cfg, JSON.stringify({ roles: { propose: { cmd, args } } }))
  return { env: { ATLAS_MODEL_CONFIG: cfg }, repo }
}

afterAll(() => {
  while (scratch.length > 0) rmSync(scratch.pop()!, { recursive: true, force: true })
})

describe("#210 — resolveProposer captures the resolved model identity", () => {
  it("a wired command yields a NON-EMPTY identity carrying cmd + args", () => {
    const { env, repo } = wired("echo", ["--role", "propose"])
    const resolved = resolveProposer(repo, env)

    expect(resolved.wired).toBe(true)
    // cmd + args are always present, regardless of whether the version probe succeeds.
    expect(resolved.modelIdentity).toContain("echo --role propose")
    expect(resolved.modelIdentity.length).toBeGreaterThan(0)
  })

  it("records the probe FAILED (never a fabricated version) when `--version` cannot be read", () => {
    // A command that does not exist: the config is still valid (a `cmd` string), so the proposer is WIRED,
    // but the `--version` probe raises ENOENT and is caught. teeth (breaks-on "a version is invented"): the
    // identity must say the probe failed, not carry a made-up version.
    const { env, repo } = wired("atlas-no-such-model-binary-xyzzy", ["-m", "x"])
    const resolved = resolveProposer(repo, env)

    expect(resolved.wired).toBe(true)
    expect(resolved.modelIdentity).toContain("atlas-no-such-model-binary-xyzzy -m x")
    expect(resolved.modelIdentity).toContain("probe failed")
  })

  it("the fail-closed default (no model wired) carries the honest NO_MODEL sentinel", () => {
    // teeth (breaks-on "modelIdentity is required but left undefined on the default path"): the type would
    // not compile, and W-REPORT would stamp `undefined` as the producer of a run.
    const resolved = resolveProposer(tmpdir(), { XDG_CONFIG_HOME: "/atlas-no-such-config-root" })
    expect(resolved.wired).toBe(false)
    expect(resolved.modelIdentity).toBe(NO_MODEL_IDENTITY)
  })
})
