// @atlas/cli — test/doctor-provenance-total.test.ts  (`runDoctor` promises "never a throw" — keep it true)
//
// `atlas doctor` sub-dispatches WITHOUT going through the frozen handler, so nothing between `runDoctor` and
// `bin.ts` catches; and `main` is `async`, which means an escaping throw becomes an UNHANDLED REJECTION
// rather than a rendered outcome with an exit code.
//
// That mattered the moment the read-provenance refusal landed: `DoctorSource` is documented total, and its
// legs now THROW over a COMMITTED durable store, because the frozen leg return types (`number`, `Hash[]`,
// `DriftItem | undefined`) have no refusal channel and every one of them would otherwise have to report a
// healthy, empty knowledge base for a store the read doors had just refused to serve. The entrypoint refuses
// the whole invocation earlier in production; this pins the backstop for every other composition.

import { describe, it, expect, afterEach } from "vitest"
import { execFileSync } from "node:child_process"
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { createDiskStore, createDoctorSource, gitSidecarTrust, reportIndexPlan } from "@atlas/adapter-io"
import type { RevIndex } from "@atlas/adapter-io"
import { runDoctor, DOCTOR_SUBCOMMANDS } from "../src/doctor.js"

/** Never reached on a refused read — if one of these fires, the refusal did not happen. */
const DEAD_REV = {
  reDerives: () => false,
  resolveAnchorAt: () => undefined,
  resolveBySubtreeAt: () => undefined,
} as unknown as RevIndex

let repoPath: string | undefined
afterEach(() => {
  if (repoPath !== undefined) rmSync(repoPath, { recursive: true, force: true })
  repoPath = undefined
})

/** A real repo whose durable store was landed by `git add -f` — the accident a missing ignore rule produces. */
function committedStoreRepo(): string {
  const p = mkdtempSync(join(tmpdir(), "atlas-doctor-prov-"))
  const git = (...a: string[]): void => void execFileSync("git", ["-C", p, ...a], { stdio: "ignore" })
  git("init", "-q")
  // Obviously-synthetic identity on the RFC 2606 reserved TLD; not a credential.
  git("config", "user.email", "fixture@example.invalid")
  git("config", "user.name", "synthetic-fixture")
  git("config", "commit.gpgsign", "false")
  mkdirSync(join(p, ".atlas"), { recursive: true })
  writeFileSync(join(p, ".atlas", "projection.json"), '{"current":[],"cas":[]}')
  git("add", "-f", ".atlas")
  git("commit", "-q", "-m", "ship the store")
  return p
}

/**
 * The surface, PARTITIONED by whether the leg reads the durable store — because the refusal below is the
 * STORE's, and a leg that never opens it cannot honestly repeat it.
 *
 * The partition is asserted total against `DOCTOR_SUBCOMMANDS` in the first test, so this keeps the property
 * the original loop had ("a leg added later inherits this or turns it red"): a new leg is unclassified, the
 * totality assertion goes red, and someone has to decide which half it is in. What it no longer does is
 * force a leg to name a refusal it did not receive.
 */
// `cas` reads `loadProjection()` for its referenced set, so it IS store-reading: on a refused store it
// would otherwise report the objects it walked against `referenced: 0`, which renders as a large orphan
// count and `sound=true` — a clean bill of health for state the read doors declined to serve.
const STORE_LEGS = ["archive", "why", "hotset", "reground", "cas"] as const
const NO_STORE_LEGS = ["index"] as const // reads the file tree + the SCIP dump; holds no store port

describe("runDoctor stays TOTAL over a refusing DoctorSource", () => {
  it("EVERY store-reading sub-command renders a structured non-zero outcome carrying the reason — never a throw", () => {
    // the partition is TOTAL over the closed surface — an unclassified new leg fails HERE, deliberately.
    expect([...STORE_LEGS, ...NO_STORE_LEGS].sort()).toEqual([...DOCTOR_SUBCOMMANDS].sort())

    repoPath = committedStoreRepo()
    const trusted = gitSidecarTrust(repoPath)
    const source = createDoctorSource(
      createDiskStore(join(repoPath, ".atlas", "cas"), undefined, trusted),
      DEAD_REV,
      trusted,
    )
    for (const sub of STORE_LEGS) {
      const arg = sub === "hotset" ? "5" : "k:whatever"
      const cv = runDoctor([sub, arg], source)
      expect(cv.exitCode, `doctor ${sub} exited 0 over a refused store`).not.toBe(0)
      expect(cv.stdout, `doctor ${sub} did not name the refusal`).toContain("untrusted-store")
    }
  })

  it("`index` reads NO store, so it answers — and the ENTRYPOINT is what refuses the invocation (exit 2)", () => {
    repoPath = committedStoreRepo()
    // Same refused repository. `doctor index` walks the tree and reads the dump; it holds no store port, so
    // repeating "untrusted-store" here would be a leg reporting on state it never touched — the mirror image
    // of the sin this file exists to prevent (a leg reporting a healthy store it was refused).
    const cv = runDoctor(["index"], undefined, () => reportIndexPlan(repoPath!))
    expect(cv.exitCode).toBe(0)
    expect(cv.stdout).toContain("doctor: index")
    expect(cv.stdout).not.toContain("untrusted-store")
    // In PRODUCTION the whole invocation is refused before dispatch (`cli.ts`, `deps.readRefusal`, `init` the
    // only exemption), so a user on this repo sees the refusal and exit 2 — measured, not assumed:
    // `atlas doctor index` on a committed-store repo exits 2 with `status: rejected`. This is the backstop
    // layer, where the leg must merely stay TOTAL.
  })

  it("CONTROL: with no provenance seam the same legs answer normally — an honest empty store", () => {
    repoPath = mkdtempSync(join(tmpdir(), "atlas-doctor-clean-"))
    const source = createDoctorSource(createDiskStore(join(repoPath, ".atlas", "cas")), DEAD_REV)
    const cv = runDoctor(["hotset", "5"], source)
    expect(cv.exitCode).toBe(0)
    expect(cv.stdout).toContain("hotSet: size=0")
    expect(cv.stdout).not.toContain("untrusted-store")
  })
})
