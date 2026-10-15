// @atlas/adapter-io — test/identity-schema.test.ts  (#112: the store was re-keyed and nothing said so)
//
// ── THE DISEASE, MEASURED ────────────────────────────────────────────────────────────────────────────────
// The identity schema — the rules that decide what hash a given piece of source produces — MOVED twice in
// one working session, and no released artifact recorded which one a store was written under:
//
//   0b65b42  the Merkle fold was unified and re-shaped (own content + NAMED children). Every ancestor
//            subtreeHash moved.
//   f2a8659  the anchor mint changed. Unit LEAF hashes held, but every ancestor of a parsed unit moved AND
//            every sub-file anchor's `qualifiedPath` changed FORMAT: `<parent>::<start>:<kind>:<name>`
//            became `<parent>::<kind>:<ordinal>[:<name>]`.
//
// The consequence is repo-wide and it is SILENT. A user upgrades Atlas; every fact anchored at a symbol now
// names a `qualifiedPath` that `resolveCurrent` cannot find, so `driftDetect` returns DRIFTED for the whole
// store. Fail-closed, correct, and completely illegible: there is nothing anywhere that lets the user tell
// "my code changed" from "the hash function changed". That is the same disease as the silent read refusal
// fixed in `a587182` — fail-closed without being legible — and the first test below reproduces it end to end
// on the production path, with the two anchor formats over BYTE-IDENTICAL source.
//
// ── WHAT THE FIX IS, AND WHAT IT IS NOT ──────────────────────────────────────────────────────────────────
// The sidecar now carries the identity schema it was written under, and a store written under a different
// one (or under none) is DETECTED and REFUSED with prose that names the remediation. It is NOT auto-migrated
// — see `identity-schema.ts` for why that is impossible rather than merely expensive.

import { describe, it, expect, beforeAll, afterEach } from "vitest"
import { execFileSync } from "node:child_process"
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync, readdirSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { build } from "@atlas/index"
import { asSubtreeHash } from "@atlas/kernel"
import { driftDetect } from "@atlas/grounding"
import type { Grounding } from "@atlas/grounding"
import { emptyStore } from "@atlas/knowledge"
import type { StoreProjection } from "@atlas/knowledge"
import { initAst, foldAstUnits } from "../src/ast.js"
import { walkFileTree } from "../src/fs.js"
import { readSidecarSet } from "../src/sidecar.js"
import { createDiskStore } from "../src/store.js"
import { REJECTED_UNTRUSTED_STORE } from "../src/read-provenance.js"
import {
  IDENTITY_SCHEMA,
  IdentitySchemaError,
  REJECTED_FOREIGN_IDENTITY_SCHEMA,
  classifyIdentity,
  identitySchemaRefusal,
} from "../src/identity-schema.js"

/** The fixture's single source file. Deliberately a bare `function` declaration at byte 0, because that
 *  makes the two anchor formats a TRANSPOSITION of one another — the same characters in a different order —
 *  which is exactly why a user cannot eyeball the difference:
 *    OLD (pre-f2a8659): `src/acct.ts::0:function_declaration:isAdmin`   (`<start>:<kind>:<name>`)
 *    NEW (current):     `src/acct.ts::function_declaration:0:isAdmin`   (`<kind>:<ordinal>:<name>`)
 *  Both are MEASURED below, never assumed: `NEW_ANCHOR` is read out of a real `build`. */
const SRC = "function isAdmin() { return false; }\n"
const NEW_ANCHOR = "src/acct.ts::function_declaration:0:isAdmin"
const OLD_ANCHOR = "src/acct.ts::0:function_declaration:isAdmin"

interface Fixture {
  readonly repoPath: string
  readonly atlas: string
  readonly casPath: string
  cleanup(): void
}

/** A real git repo with one tracked TS file and an `.atlas/` directory. No sidecar is written here — each
 *  test decides which SCHEMA its store was written under, which is the whole variable under study. */
function repo(): Fixture {
  const repoPath = mkdtempSync(join(tmpdir(), "atlas-identity-"))
  const git = (...args: string[]): string => execFileSync("git", ["-C", repoPath, ...args], { encoding: "utf8" })
  git("init", "-q")
  // Obviously-synthetic identity: `.invalid` is the RFC 2606 reserved TLD and can never name a real mailbox.
  git("config", "user.email", "fixture@example.invalid")
  git("config", "user.name", "synthetic-fixture")
  git("config", "commit.gpgsign", "false")
  mkdirSync(join(repoPath, "src"), { recursive: true })
  writeFileSync(join(repoPath, "src/acct.ts"), SRC)
  git("add", "-A")
  git("commit", "-q", "-m", "the code, unchanged across the upgrade")
  const atlas = join(repoPath, ".atlas")
  mkdirSync(atlas, { recursive: true })
  return {
    repoPath,
    atlas,
    casPath: join(atlas, "cas"),
    cleanup: () => rmSync(repoPath, { recursive: true, force: true }),
  }
}

/** The built axes for a fixture repo, through the SAME transform `composeRuntime` applies (F1). */
const axesOf = (f: Fixture) => build(foldAstUnits(walkFileTree(f.repoPath)), { documents: [] })

/** A grounding anchored at `qualifiedPath` with `subtreeHash` — the shape a governed emit stores. */
const groundedAt = (qualifiedPath: string, subtreeHash: string): Grounding =>
  ({
    entries: [
      { anchor: { kind: "symbol", qualifiedPath, subtreeHash: asSubtreeHash(subtreeHash) }, path: "src/acct.ts" },
    ],
  }) as unknown as Grounding

/** Find a node's recorded subtreeHash in a built axis tree. Test-local: the production resolver
 *  (`grounding/src/drift.ts findByKey`) is what is UNDER test, so re-using it would be circular. */
function hashAt(
  node: { key: string; subtreeHash: unknown; children: readonly unknown[] },
  key: string,
): string | undefined {
  if (node.key === key) return String(node.subtreeHash)
  for (const c of node.children) {
    const hit = hashAt(c as Parameters<typeof hashAt>[0], key)
    if (hit !== undefined) return hit
  }
  return undefined
}

/** Write a sidecar generation by hand, with FULL control over the wire object — the only way to author a
 *  store that a previous Atlas would have written, since no previous Atlas is importable. */
function writeSidecar(f: Fixture, wire: Record<string, unknown>): void {
  writeFileSync(join(f.atlas, "projection.1.json"), JSON.stringify(wire))
  writeFileSync(join(f.atlas, "projection.json"), JSON.stringify(wire))
}

/** One well-formed row (`isKeyedEntry`: the map key IS the row's own `nodeKey`). */
const row = (key: string, anchor: string): unknown => [
  key,
  { nodeKey: key, family: "advisory", contentHash: "ch-" + key, claims: ["a claim"], primaryAnchor: anchor },
]

let live: Fixture | undefined
afterEach(() => {
  live?.cleanup()
  live = undefined
})

beforeAll(async () => {
  // `foldAstUnits` is a NO-OP until the grammar is warmed (the entrypoint bins do this once). Without it the
  // fixture has no `::` sub-file node at all and the whole suite would measure a tree that has no anchors —
  // a vacuous pass in exactly the shape ADR-0007 names.
  await initAst()
})

describe("#112 — the identity schema moved and the store could not say which one it was written under", () => {
  // ── THE REPRODUCTION. Green before AND after the fix: it measures the disease, it does not test the cure.
  it("MEASURED: over BYTE-IDENTICAL source, an old-schema anchor is DRIFTED and the new-schema one is FRESH", () => {
    live = repo()
    const axes = axesOf(live)
    // The fixture really does carry a sub-file symbol node under the CURRENT mint — if it did not, every
    // assertion below would be quantifying over an empty region (the vacuous-test class).
    const unitHash = hashAt(axes.spatial, NEW_ANCHOR)
    expect(unitHash).toBeDefined()
    // A fact grounded under the CURRENT schema: FRESH, as it must be — the code did not change.
    expect(driftDetect(groundedAt(NEW_ANCHOR, unitHash!), axes)).toBe("FRESH")
    // The SAME fact, about the SAME symbol, in the SAME unchanged file, as an Atlas one commit older would
    // have stored it: DRIFTED. Nothing about the code moved. Only the schema did.
    expect(driftDetect(groundedAt(OLD_ANCHOR, unitHash!), axes)).toBe("DRIFTED")
    // …and it is unresolvable, not merely mismatched: the old key names no node in the current tree at all.
    expect(hashAt(axes.spatial, OLD_ANCHOR)).toBeUndefined()
  })

  // ── THE LAW. RED at 740bd08 with:
  //      AssertionError: expected [ 'projection', 'top', …(2) ] to include 'identity'
  //    The read carried no schema verdict at all, so nothing downstream could distinguish the two causes.
  it("an UNSTAMPED sidecar (every store written before this fix) is DETECTED", () => {
    live = repo()
    // Exactly what a pre-#112 Atlas wrote: `current`, `cas`, `gen` — and no identity stamp, because the
    // concept did not exist.
    writeSidecar(live, { current: [row("k:old", OLD_ANCHOR)], cas: ["ch-k:old"], gen: 1 })
    const read = readSidecarSet(live.atlas, "projection")
    // DETECTED, on a machine-readable discriminant — never a substring of the prose.
    expect(read.identity).toBe("unstamped")
    expect(read.identityFound).toBeUndefined()
    // NOT reported as a storage fault: `unreadable` sends an operator to fsck, and this file parses fine.
    // NOT reported as a provenance fault either: it is not committed. Three orthogonal conditions, three
    // fields — collapsing any pair would send an operator to the wrong remedy.
    expect(read.unreadable).toBe(false)
    expect(read.untrusted).toBe(false)
    // `top` stays honest (it is a directory listing, not store content), exactly as the provenance refusal
    // keeps it, so no caller has to special-case the flagged shape.
    expect(read.top).toBe(1)
    // THE ROWS ARE STILL SERVED, and that is a DECISION, not an oversight — see `identity-schema.ts`
    // §"WHY THE READ IS FLAGGED AND NOT EMPTIED". Every one of these facts already reads DRIFTED (the first
    // test above measures exactly that), so emptying adds no safety; it would only replace "everything
    // drifted, with no explanation" with "there is nothing here, with no explanation". The teeth are on the
    // write doors, where a wrong answer DESTROYS the store rather than merely confusing its owner.
    expect(read.projection?.current.size).toBe(1)
  })

  it("a sidecar stamped with a DIFFERENT schema is detected as foreign, and the tag it carries is reported", () => {
    live = repo()
    writeSidecar(live, {
      current: [row("k:old", OLD_ANCHOR)],
      cas: ["ch-k:old"],
      gen: 1,
      identity: "atlas-identity-from-the-future",
    })
    const read = readSidecarSet(live.atlas, "projection")
    expect(read.identity).toBe("foreign")
    // The tag is REPORTED, so the refusal can say what it actually found rather than "something else".
    expect(read.identityFound).toBe("atlas-identity-from-the-future")
  })

  // ── THE CONTROL, and it is not optional. A verdict machine that answered `unstamped` for everything would
  // pass every test above. This asserts the OTHER side of the discrimination: the identical store, differing
  // ONLY in the stamp, is `current` and writable.
  it("CONTROL: the identical store, stamped with the CURRENT schema, is accepted — the check discriminates", () => {
    live = repo()
    writeSidecar(live, {
      current: [row("k:new", NEW_ANCHOR)],
      cas: ["ch-k:new"],
      gen: 1,
      identity: IDENTITY_SCHEMA,
    })
    const read = readSidecarSet(live.atlas, "projection")
    expect(read.identity).toBe("current")
    expect(identitySchemaRefusal(read)).toBeUndefined()
    // …and a write over it settles, where the unstamped twin below throws. That pair IS the discrimination.
    expect(createDiskStore(live.casPath).commitProjection(() => ({ out: "ok", next: emptyStore() })).settled).toBe(true)
  })

  it("CONTROL: an EMPTY repo (no sidecar at all) is not a schema refusal — a fresh install still works", () => {
    live = repo()
    const read = readSidecarSet(live.atlas, "projection")
    // Nothing persisted ⇒ nothing to judge. A verdict of `unstamped` here would refuse every write in every
    // new repo — the check would brick the product on install.
    expect(read.identity).toBe("current")
    expect(read.projection).toBeUndefined()
    expect(read.unreadable).toBe(false)
    expect(identitySchemaRefusal(read)).toBeUndefined()
    expect(() => createDiskStore(live!.casPath).persistProjection(emptyStore())).not.toThrow()
  })

  // A stamp is untrusted input from a file anyone with write access can author, so the classifier is total
  // over `unknown` — and a NEAR-MISS must be `foreign`, never quietly accepted.
  it("the classifier is total over untrusted input, and byte-exact on the tag", () => {
    for (const junk of [undefined, null, "", 0, 1, {}, [], true]) {
      expect(classifyIdentity(junk)).toBe("unstamped")
    }
    expect(classifyIdentity(IDENTITY_SCHEMA)).toBe("current")
    for (const near of [
      ` ${IDENTITY_SCHEMA}`,
      `${IDENTITY_SCHEMA} `,
      IDENTITY_SCHEMA.toUpperCase(),
      `${IDENTITY_SCHEMA}x`,
    ]) {
      expect(classifyIdentity(near), near).toBe("foreign")
    }
  })

  // ── THE REFUSAL IS LEGIBLE, and it names the remediation.
  it("the refusal is legible: DISCRIMINANT, what to do, and that the CAS bytes are NOT affected", () => {
    live = repo()
    writeSidecar(live, { current: [row("k:old", OLD_ANCHOR)], cas: ["ch-k:old"], gen: 1 })
    const refusal = identitySchemaRefusal(readSidecarSet(live.atlas, "projection"))
    expect(refusal).toBeDefined()
    expect(refusal).toContain(REJECTED_FOREIGN_IDENTITY_SCHEMA)
    // The discriminant is the text before the first `:` — asserted for EQUALITY on the error, never as a
    // substring of prose (the vacuous-assertion class, ADR-0007).
    expect(new IdentitySchemaError("unstamped", undefined).reason).toBe("identity-schema")
    expect(REJECTED_FOREIGN_IDENTITY_SCHEMA.startsWith("identity-schema:")).toBe(true)
    // …and it is a discriminant, not a coincidence: no OTHER refusal constant in this package leads with it.
    expect(REJECTED_UNTRUSTED_STORE.startsWith("identity-schema:")).toBe(false)
    // The remediation must be NAMED, not implied. These are the four things a user has to be told.
    expect(refusal).toMatch(/re-?mine/i) // what to do
    expect(refusal).toMatch(/re-derive/i) // …in the words the rest of the product uses
    expect(refusal).toContain("packages/adapter-io/src/identity-schema.ts") // where to read why
    expect(refusal).toContain(IDENTITY_SCHEMA) // which schema THIS build speaks
    // The single most important sentence for a frightened user: their content-addressed bytes are fine.
    expect(refusal).toMatch(/CAS blobs are content-addressed and are NOT affected/)
    expect(refusal).toMatch(/Nothing was written and nothing was deleted/)
  })

  it("an UNSTAMPED store is not called an OLD VERSION — the refusal says the past was never tagged", () => {
    live = repo()
    writeSidecar(live, { current: [row("k:old", OLD_ANCHOR)], cas: ["ch-k:old"], gen: 1 })
    const refusal = identitySchemaRefusal(readSidecarSet(live.atlas, "projection"))!
    // HONESTY TOOTH. No previous Atlas stamped anything, so "written by version N" is a claim nobody is in a
    // position to make. The unstamped branch must say UNKNOWN and must not invent a predecessor.
    expect(refusal).toMatch(/carries no identity stamp at all/)
    expect(refusal).toMatch(/UNKNOWN/)
    expect(refusal).not.toMatch(/version 0|v0\b|schema 0|version 1|previous version/i)
    // The FOREIGN branch, by contrast, may and does quote what it found — that is the one case where the
    // store can say something concrete about itself. Asserted so the two branches cannot collapse into one.
    writeSidecar(live, { current: [], cas: [], gen: 1, identity: "atlas-identity-1999-01-01" })
    const foreign = identitySchemaRefusal(readSidecarSet(live.atlas, "projection"))!
    expect(foreign).toContain("atlas-identity-1999-01-01")
    expect(foreign).not.toMatch(/carries no identity stamp at all/)
  })

  // ── WRITES REFUSE. This is the load-bearing half, and the harm is worth stating PRECISELY rather than
  // dramatically. Because the read still serves the rows (see above), a write does NOT erase them — `decide`
  // receives the old projection and carries it forward. What it does is LAUNDER: the successor generation is
  // stamped with the CURRENT schema, so a store whose anchors were minted under different rules now asserts
  // that they were minted under these ones. The evidence is destroyed, permanently and in one write, and
  // every read afterwards believes a false thing about the hashes it is holding. That is the same shape
  // `store-provenance.ts` refuses for a committed store, and for the same reason.
  it("every write door refuses over a foreign-schema store rather than publishing over it", () => {
    live = repo()
    writeSidecar(live, { current: [row("k:old", OLD_ANCHOR)], cas: ["ch-k:old"], gen: 1 })
    const store = createDiskStore(live.casPath)
    const before = readFileSync(join(live.atlas, "projection.1.json"), "utf8")
    expect(() => store.commitProjection(() => ({ out: "x", next: emptyStore() }))).toThrow(IdentitySchemaError)
    expect(() => store.persistProjection(emptyStore())).toThrow(IdentitySchemaError)
    // NOTHING was written: the old bytes survive, and no successor generation was published. A user's store
    // must still be there after the refusal, or "re-derive it" is advice about data that is already gone.
    expect(readFileSync(join(live.atlas, "projection.1.json"), "utf8")).toBe(before)
    expect(readdirSync(live.atlas).filter((n) => /^projection\.\d+\.json$/.test(n))).toEqual(["projection.1.json"])
  })

  it("the staging sidecar refuses on its own schema, independently of the projection", () => {
    live = repo()
    writeFileSync(join(live.atlas, "staging.1.json"), JSON.stringify({ current: [], cas: [], gen: 1 }))
    const store = createDiskStore(live.casPath)
    expect(() => store.commitStaging(() => ({ out: "x", next: emptyStore() }))).toThrow(IdentitySchemaError)
    // …and the PROJECTION, which has no sidecar at all, is unaffected: the two families are judged apart.
    expect(readSidecarSet(live.atlas, "projection").identity).toBe("current")
  })

  // ── THE ROUND TRIP. A store this build writes must be one this build reads — otherwise the check is a
  // brick rather than a gate.
  it("a store written through the production path carries the stamp and reads back", () => {
    live = repo()
    const store = createDiskStore(live.casPath)
    const next: StoreProjection = {
      current: new Map([["k:new", { nodeKey: "k:new", family: "advisory", contentHash: "ch", claims: [] }]]),
      cas: new Set(["ch"]),
    }
    store.persistProjection(next)
    const wire = JSON.parse(readFileSync(join(live.atlas, "projection.json"), "utf8")) as { identity?: string }
    expect(wire.identity).toBe(IDENTITY_SCHEMA)
    const read = readSidecarSet(live.atlas, "projection")
    expect(read.identity).toBe("current")
    expect(read.projection?.current.get("k:new")?.contentHash).toBe("ch")
    // …and a second governed write over it settles, so the stamp is not a one-shot.
    expect(store.commitProjection(() => ({ out: "ok", next })).settled).toBe(true)
  })

  // ── THE FALLBACK MUST NOT LAUNDER. A corrupt CURRENT generation falling back to an older-schema
  // predecessor must carry the PREDECESSOR's verdict, not the head's — otherwise one corrupt file is enough
  // to make a refused store writable again, which is the g-1 fallback turned into a bypass.
  it("the g-1 fallback reports the schema of the generation it actually resolved", () => {
    live = repo()
    writeFileSync(
      join(live.atlas, "projection.1.json"),
      JSON.stringify({ current: [row("k:old", OLD_ANCHOR)], cas: [], gen: 1 }),
    )
    writeFileSync(join(live.atlas, "projection.2.json"), "{ truncated")
    const read = readSidecarSet(live.atlas, "projection")
    expect(read.identity).toBe("unstamped") // gen 1's verdict, not gen 2's absence of one
    expect(read.projection?.current.has("k:old")).toBe(true)
    expect(() => createDiskStore(live!.casPath).persistProjection(emptyStore())).toThrow(IdentitySchemaError)
  })

  // The mirror is the pre-protocol compat name, and it is the LAST resort of the read. It must be judged by
  // the same rule: a store whose generation files were all pruned by hand still gets an honest verdict.
  it("the pre-protocol MIRROR is judged too — the compat name is not a schema-check bypass", () => {
    live = repo()
    writeFileSync(
      join(live.atlas, "projection.json"),
      JSON.stringify({ current: [row("k:old", OLD_ANCHOR)], cas: [], gen: 7 }),
    )
    const read = readSidecarSet(live.atlas, "projection")
    expect(read.identity).toBe("unstamped")
    expect(read.top).toBe(7) // the mirror's own counter still keeps the sequence monotone
    expect(() => createDiskStore(live!.casPath).persistProjection(emptyStore())).toThrow(IdentitySchemaError)
  })
})
