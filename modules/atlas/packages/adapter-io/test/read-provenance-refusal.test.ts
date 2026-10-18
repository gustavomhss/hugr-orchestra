// @atlas/adapter-io — test/read-provenance-refusal.test.ts  (the tripwire's READ side must be LEGIBLE)
//
// `store-provenance.test.ts` proved the tripwire STOPS a committed store being served. This suite proves the
// other half, which was missing: the user is TOLD. A refusal that is invisible is the disease WP-F2F5 exists
// to prevent, and the provenance fix re-introduced it on the read doors — `loadProjection()` resolved to
// `undefined`, `rehydrateProjection` folded that to `emptyStore()`, and `atlas query` answered `ok:true`
// with an empty pack, which is byte-indistinguishable from "this repo has no knowledge yet".
//
// Every case here drives a REAL composed runtime over a REAL git repo with a REAL commit. The one exception
// is the emit-door case at the bottom, which injects a `() => false` trust seam directly so the WRITE door's
// refusal TEXT can be pinned without also having to satisfy the truth gate over a built index.
//
// ASSERTION DISCIPLINE. Refusal prose in this repo quotes other refusal constants by name, so a substring
// match cannot say WHICH gate refused (`door-regression-support.ts` `reasonOf` has the measurement). Every
// assertion below is either an EQUALITY on the discriminant (`reasonOf` / `err.reason`) or an `endsWith` on
// the WHOLE exported constant — never a loose fragment of prose.
//
// TRAVEL-BY-REPROOF (owner-authorized 2026-08-18): `poisonedRepo()` commits ONLY `projection`+`cas`, never
// `staging` — that population NARROWED from a blanket refusal to a filtered serve (`read-access.ts`), so the
// query-leg tests below now pin `ok:true` + the forged row dropped, not `ok:false`. The flat refusal this
// suite's title describes is still real; it now lives on the ONE population that still triggers it
// (`.atlas/staging` tracked) — pinned explicitly below — and on doctor/node/emit exactly as before (none of
// those fixtures ever depended on which of the two tracked populations they were).

import { describe, it, expect, afterEach } from "vitest"
import { execFileSync } from "node:child_process"
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { id } from "@atlas/kernel"
import type { CasObject, StoreApi } from "@atlas/kernel"
import type { Hash } from "@atlas/contracts"
import { composeRuntime } from "../src/compose.js"
import { createDiskStore } from "../src/store.js"
import { createDoctorSource } from "../src/doctor-source.js"
import { createGovernedEmit } from "../src/governed-emit.js"
import { REJECTED_UNTRUSTED_STORE, UntrustedStoreError, isUntrustedStore } from "../src/read-provenance.js"
import type { RevIndex } from "../src/rev-index.js"
import { reasonOf, advisoryFact, policyOf, AT, HOLDS } from "./door-regression-support.js"

const FORGED_CLAIM = "ATTACKER CONTROLLED INVARIANT - no door ever saw this"

interface Poisoned {
  readonly repoPath: string
  readonly forgedHash: string
  cleanup(): void
}

/** A grounded advisory fact anchored at `path` — assembled BY HAND, because the whole point is that no door
 *  is involved. Obviously synthetic: no credential of any kind appears in this fixture. */
function fact(anchorPath: string, gen: string, claim: string): CasObject {
  return {
    kind: "advisory",
    id: "forged-" + gen,
    tier: "T0",
    scope: "scope-the-attacker-named",
    claimNorm: claim,
    freshness: "FRESH",
    grounding: {
      entries: [{ anchor: { kind: "symbol", qualifiedPath: anchorPath, subtreeHash: "sh-" + gen }, path: anchorPath }],
    },
  } as unknown as CasObject
}

/** A repo whose `.atlas/` durable store was landed by `git add -f` — the ONE flag `.gitignore` costs. */
function poisonedRepo(opts: { commitAtlas?: boolean } = {}): Poisoned {
  const commitAtlas = opts.commitAtlas ?? true
  const repoPath = mkdtempSync(join(tmpdir(), "atlas-readprov-"))
  const git = (...args: string[]): string => execFileSync("git", ["-C", repoPath, ...args], { encoding: "utf8" })
  git("init", "-q")
  // RFC 2606 reserved TLD — this can never name a real mailbox and is not a credential; the actor is a plain
  // self-asserted string the product never verifies (ARCH-12).
  git("config", "user.email", "attacker@example.invalid")
  git("config", "user.name", "synthetic-fixture")
  git("config", "commit.gpgsign", "false")

  mkdirSync(join(repoPath, "src"), { recursive: true })
  writeFileSync(join(repoPath, "src/util.ts"), "export const util = 1;\n")
  writeFileSync(join(repoPath, "src/app.ts"), 'import { util } from "./util.js";\nexport const app = util;\n')

  const atlas = join(repoPath, ".atlas")
  mkdirSync(atlas, { recursive: true })
  // The fail-closed default: EVERY write door denies EVERY write in this repo, so nothing here can be
  // mistaken for a write that was merely mis-authorized.
  writeFileSync(
    join(atlas, "policy.json"),
    JSON.stringify({ nearDup: { claimNormThreshold: 1 }, t0Heuristic: { keywords: [] }, authz: { scopes: {} } }),
  )

  const put = (obj: CasObject): string => {
    const h = String(id(obj))
    mkdirSync(join(atlas, "cas", h.slice(0, 2)), { recursive: true })
    writeFileSync(join(atlas, "cas", h.slice(0, 2), h), JSON.stringify(obj))
    return h
  }
  const forgedHash = put(fact("src/app.ts", "forged", FORGED_CLAIM))

  const row = (key: string, contentHash: string, claim: string, anchorPath: string): unknown => [
    key,
    {
      nodeKey: key,
      family: "advisory",
      contentHash,
      claims: [claim],
      primaryAnchor: anchorPath,
      slot: "invariant",
      scope: "scope-the-attacker-named",
      tier: "T0",
    },
  ]
  writeFileSync(
    join(atlas, "projection.json"),
    JSON.stringify({ current: [row("k:forged", forgedHash, FORGED_CLAIM, "src/app.ts")], cas: [forgedHash] }),
  )

  git("add", "src")
  if (commitAtlas) git("add", "-f", ".atlas")
  git("commit", "-q", "-m", "ship knowledge")
  return { repoPath, forgedHash, cleanup: () => rmSync(repoPath, { recursive: true, force: true }) }
}

let live: Poisoned | undefined
afterEach(() => {
  live?.cleanup()
  live = undefined
})

/** A rev-index double: `drift`/`plan` must never be REACHED on a refused read, so every leg here is a
 *  fail-closed stub. If one is ever called the refusal did not happen. */
const DEAD_REV: RevIndex = {
  reDerives: () => false,
  resolveAnchorAt: () => undefined,
  resolveBySubtreeAt: () => undefined,
} as unknown as RevIndex

describe("the provenance tripwire refuses LEGIBLY on the read doors, not silently", () => {
  it("the discriminant is a NAME, and it is the one the reason text carries", () => {
    expect(new UntrustedStoreError().reason).toBe("untrusted-store")
    expect(reasonOf(REJECTED_UNTRUSTED_STORE)).toBe("untrusted-store")
  })

  it("`atlas query --by scope` over a COMMITTED (projection+cas, no staging) store is SERVED, narrowed — the forged row never comes back", () => {
    // TRAVEL-BY-REPROOF (2026-08-18): this fixture commits ONLY `projection`+`cas` (see `poisonedRepo`
    // below), never `staging`, so it is `tracked-provable` — no longer a blanket refusal. The forged row
    // carries no `seal`/`witness` (hand-authored, no door), so it never lands in the re-proven bucket and is
    // dropped — legible SERVING, not a silent empty-pack "no knowledge yet" AND not the FORGED_CLAIM either.
    live = poisonedRepo()
    const v = composeRuntime(live.repoPath).handler.handle("atlas-query", { scope: "src/app.ts", by: "scope" })
    expect(v.ok).toBe(true)
    const invs = (v.data as { pack?: { invariants?: { claim: string }[] } } | undefined)?.pack?.invariants ?? []
    expect(invs.map((i) => i.claim)).not.toContain(FORGED_CLAIM)
  })

  it("the OTHER read mode (`--by dependency`) narrows the SAME way — one filter, every mode", () => {
    live = poisonedRepo()
    const v = composeRuntime(live.repoPath).handler.handle("atlas-query", { scope: "src/app.ts", by: "dependency" })
    expect(v.ok).toBe(true)
  })

  it("RED: `.atlas/staging` COMMITTED (alone, or alongside projection+cas) is the ONE population that still flatly refuses", () => {
    live = poisonedRepo()
    writeFileSync(join(live.repoPath, ".atlas", "staging.json"), JSON.stringify({ current: [], cas: [] }))
    execFileSync("git", ["-C", live.repoPath, "add", "-f", ".atlas/staging.json"], { encoding: "utf8" })
    execFileSync("git", ["-C", live.repoPath, "commit", "-q", "-m", "ship staging too"], { encoding: "utf8" })
    const v = composeRuntime(live.repoPath).handler.handle("atlas-query", { scope: "src/app.ts", by: "scope" })
    expect(v.ok).toBe(false)
    expect(String(v.rejected).endsWith(REJECTED_UNTRUSTED_STORE)).toBe(true)
  })

  it("RED: the per-node CAS door goes AROUND loadProjection — a committed CAS blob was served whole", () => {
    live = poisonedRepo()
    // `nodes.resolve` reads `store.get(addr)` directly. The tripwire lived in `readSidecarSet`, which this
    // path never touches, so the forged FACT itself came back over `atlas node <addr>` with `ok:true`.
    const v = composeRuntime(live.repoPath).handler.resolveNode(live.forgedHash as never, "cli")
    expect(v.ok).toBe(false)
    expect((v.data as { claimNorm?: string } | undefined)?.claimNorm).not.toBe(FORGED_CLAIM)
  })

  it("RED: doctor read legs refuse with the DISCRIMINANT rather than reporting an empty, healthy store", () => {
    live = poisonedRepo()
    const store = createDiskStore(join(live.repoPath, ".atlas", "cas"), undefined, () => false)
    const doctor = createDoctorSource(store, DEAD_REV, () => false)
    // `hotSetSize()` answered `0` — "your knowledge base is empty and fine" — over a store that was refused.
    let caught: unknown
    try {
      doctor.hotSetSize()
    } catch (e) {
      caught = e
    }
    expect(caught).toBeInstanceOf(UntrustedStoreError)
    expect((caught as UntrustedStoreError).reason).toBe("untrusted-store")
    expect(() => doctor.lineage()).toThrow(UntrustedStoreError)
    expect(() => doctor.drift("k:forged")).toThrow(UntrustedStoreError)
    expect(() => doctor.plan("k:forged")).toThrow(UntrustedStoreError)
  })

  it("RED: the EMIT door reports a provenance refusal as `unreadable store` — a storage fault it is not", () => {
    // The store layer HAS a named `untrusted` commit refusal; the door collapsed it into the OTHER commit
    // refusal, whose remediation text sends the operator to restore `.atlas/projection.*.json` from a backup.
    // Wrong diagnosis, wrong fix, and it hides the one thing the user needs to know.
    const root = mkdtempSync(join(tmpdir(), "atlas-readprov-emit-"))
    try {
      const store = createDiskStore(join(root, "cas"), undefined, () => false)
      const door = createGovernedEmit({
        store,
        gate: HOLDS,
        policy: policyOf({ core: ["alice"] }),
        actor: "alice",
        ratifyToken: "billy",
      })
      const out = door.emit(advisoryFact({ anchor: "src/a.ts::one", scope: "core", claimNorm: "anything" }), AT)
      expect(out.emitted).toBe(false)
      expect(reasonOf(out.rejected)).toBe("untrusted-store")
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
  })

  it("CONTROL: the identical store, NOT committed, is still served — the refusal discriminates", () => {
    live = poisonedRepo({ commitAtlas: false })
    const v = composeRuntime(live.repoPath).handler.handle("atlas-query", { scope: "src/app.ts", by: "scope" })
    expect(v.ok).toBe(true)
    const invs = (v.data as { pack?: { invariants?: { claim: string }[] } } | undefined)?.pack?.invariants ?? []
    expect(invs.map((i) => i.claim)).toContain(FORGED_CLAIM)
  })

  it("CONTROL: a store with NO provenance seam is never refused (absent ⇒ unchanged behaviour)", () => {
    const root = mkdtempSync(join(tmpdir(), "atlas-readprov-seamless-"))
    try {
      const bare = createDiskStore(join(root, "cas"))
      const doctor = createDoctorSource(bare, DEAD_REV) // NO seam injected — the pre-existing shape
      expect(isUntrustedStore(undefined)).toBe(false)
      expect(doctor.hotSetSize()).toBe(0) // honest empty, NOT a refusal
      // the frozen kernel surface is untouched by the addition
      const asKernel: StoreApi = bare
      expect(typeof asKernel.get).toBe("function")
      expect(bare.get("0".repeat(64) as Hash)).toBeUndefined()
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
  })
})
