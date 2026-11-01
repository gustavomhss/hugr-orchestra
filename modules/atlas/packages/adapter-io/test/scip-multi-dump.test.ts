// @atlas/adapter-io — test/scip-multi-dump.test.ts  (genesis-hardening A6 — several SCIP dumps, one index)
//
// `.atlas/index.d/*.scip` are read beside `.atlas/index.scip` and merged; `index.d/roots.json` names the
// repo-relative root of a dump whose paths are relative to a sub-directory (rust-analyzer's workspace). Each
// merged document carries its own indexer, so the TypeScript-only collapsed-local gate applies to TypeScript
// documents alone. Without `index.d` the single dump reads exactly as before — no tag, same bytes.
//
// NOT COVERED HERE: the escape leg's per-dump gate (`buildTargetEscapes`) — it needs warmed tree-sitter
// grammars and real source files; its multi-dump read goes through `decodeScipDumps`, exercised only by type.

import { afterEach, describe, expect, it } from "vitest"
import { execFileSync } from "node:child_process"
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { basename, join } from "node:path"
import { create } from "@bufbuild/protobuf"
import {
  serializeSCIP,
  IndexSchema,
  MetadataSchema,
  ToolInfoSchema,
  DocumentSchema,
  OccurrenceSchema,
  SymbolRole,
} from "@c4312/scip"
import { createSymbolReverse, nodeHashOfPath } from "@atlas/index"
import {
  SCIP_INDEX_REL,
  listScipDumps,
  planIndexers,
  readScip,
  readScipIndexerName,
  readScipOrEmpty,
  scipIndexPresent,
} from "../src/scip.js"
import { reportIndexPlan } from "../src/indexer-report.js"

const scratch: string[] = []
afterEach(() => {
  while (scratch.length > 0) rmSync(scratch.pop()!, { recursive: true, force: true })
})

type Doc = { readonly path: string; readonly occ: readonly (readonly [symbol: string, definition: boolean])[] }

const dumpBytes = (indexer: string, docs: readonly Doc[]): Uint8Array =>
  serializeSCIP(
    create(IndexSchema, {
      metadata: create(MetadataSchema, { toolInfo: create(ToolInfoSchema, { name: indexer, version: "0" }) }),
      documents: docs.map((d) =>
        create(DocumentSchema, {
          relativePath: d.path,
          occurrences: d.occ.map(([symbol, def]) =>
            create(OccurrenceSchema, { symbol, symbolRoles: def ? SymbolRole.Definition : 0 }),
          ),
        }),
      ),
    }),
  )

/** A git repo (the doctor walk reads `git ls-files`) with an `.atlas/` and the given files written raw. */
function repoWith(files: Readonly<Record<string, string | Uint8Array>>): string {
  const repo = mkdtempSync(join(tmpdir(), "atlas-multi-dump-"))
  scratch.push(repo)
  for (const [rel, body] of Object.entries(files)) {
    mkdirSync(join(repo, rel, ".."), { recursive: true })
    writeFileSync(join(repo, rel), body)
  }
  execFileSync("git", ["init", "-q"], { cwd: repo })
  execFileSync("git", ["add", "-A"], { cwd: repo })
  return repo
}

// A TS doc with a COLLAPSED local ref (a `local` reference with no `local` definition in that doc): the
// scip-typescript-only heuristic marks it opaque. The Rust doc carries the SAME shape and must NOT be marked.
const TS_DUMP = dumpBytes("scip-typescript", [{ path: "src/app.ts", occ: [["local 7", false]] }])
const RUST_DUMP = dumpBytes("rust-analyzer", [{ path: "src/lib.rs", occ: [["local 7", false]] }])
const PY_DUMP = dumpBytes("scip-python", [{ path: "modules/relay/x.py", occ: [["py x/f().", true]] }])

describe("genesis-hardening A6 — a multi-dump index", () => {
  it("single-file fallback: no `index.d` ⇒ the one dump reads exactly as before (no indexer tag)", () => {
    const repo = repoWith({ [SCIP_INDEX_REL]: TS_DUMP })
    const scipPath = join(repo, SCIP_INDEX_REL)
    expect(listScipDumps(scipPath)).toBeUndefined()
    expect(readScip(scipPath)).toStrictEqual({
      documents: [{ relativePath: "src/app.ts", occurrences: [{ symbol: "local 7", role: "reference" }] }],
    })
    expect(readScipIndexerName(scipPath)).toBe("scip-typescript")
  })

  it("reads `index.d` beside the single dump, rebases by `roots.json`, and tags each document", () => {
    const repo = repoWith({
      [SCIP_INDEX_REL]: TS_DUMP,
      ".atlas/index.d/py.scip": PY_DUMP,
      ".atlas/index.d/rust.scip": RUST_DUMP,
      ".atlas/index.d/roots.json": JSON.stringify({ "rust.scip": "native/omni/" }),
    })
    const scipPath = join(repo, SCIP_INDEX_REL)

    expect(listScipDumps(scipPath)?.map((d) => [d.rel, d.root])).toEqual([
      [".atlas/index.scip", ""],
      [".atlas/index.d/py.scip", ""],
      [".atlas/index.d/rust.scip", "native/omni"],
    ])
    const merged = readScipOrEmpty(scipPath)
    expect(merged.documents.map((d) => [d.relativePath, d.indexer])).toEqual([
      ["src/app.ts", "scip-typescript"],
      ["modules/relay/x.py", "scip-python"],
      ["native/omni/src/lib.rs", "rust-analyzer"], //  rebased onto the repository by its root
    ])
    expect(readScip(scipPath)).toStrictEqual(merged)
    expect(readScipIndexerName(scipPath)).toBeUndefined() // the dumps disagree; documents carry their own tag
    expect(scipIndexPresent(scipPath)).toBe(true)
  })

  it("the TypeScript collapsed-local gate applies to the TypeScript document ONLY", () => {
    const repo = repoWith({ ".atlas/index.d/ts.scip": TS_DUMP, ".atlas/index.d/rust.scip": RUST_DUMP })
    const scipPath = join(repo, SCIP_INDEX_REL)
    expect(scipIndexPresent(scipPath)).toBe(true) //   no single dump, still an index

    const reverse = createSymbolReverse(readScipOrEmpty(scipPath), { indexerName: readScipIndexerName(scipPath) })
    expect(reverse.opaqueRefSources()).toEqual([nodeHashOfPath("src/app.ts")])

    // Control: the same Rust doc read ALONE under a TypeScript whole-index name is gated by the doc's own tag.
    const rustOnly = repoWith({ ".atlas/index.d/rust.scip": RUST_DUMP })
    const rustReverse = createSymbolReverse(readScipOrEmpty(join(rustOnly, SCIP_INDEX_REL)), {
      indexerName: "scip-typescript",
    })
    expect(rustReverse.opaqueRefSources()).toEqual([])
  })

  it("a NAMELESS dump beside a TypeScript one never inherits `scip-typescript`", () => {
    const nameless = dumpBytes("", [{ path: "src/lib.rs", occ: [["local 7", false]] }])
    const repo = repoWith({ ".atlas/index.d/ts.scip": TS_DUMP, ".atlas/index.d/rust.scip": nameless })
    const scipPath = join(repo, SCIP_INDEX_REL)

    expect(readScipIndexerName(scipPath)).toBeUndefined() //  one dump names nothing ⇒ no whole-index name
    const merged = readScipOrEmpty(scipPath)
    expect(merged.documents.map((d) => [d.relativePath, d.indexer])).toEqual([
      ["src/lib.rs", "unknown"], //                            tagged explicitly, so nothing falls back for it
      ["src/app.ts", "scip-typescript"],
    ])
    const reverse = createSymbolReverse(merged, { indexerName: "scip-typescript" }) // even under a TS fallback
    expect(reverse.opaqueRefSources()).toEqual([nodeHashOfPath("src/app.ts")])
  })

  it("a document path that would leave the repository is dropped; a Windows-shaped root is refused", () => {
    const escaping = dumpBytes("scip-python", [
      { path: "/etc/passwd.py", occ: [["py a/f().", true]] },
      { path: "../up.py", occ: [["py a/g().", true]] },
      { path: "pkg\\win.py", occ: [["py a/h().", true]] },
      { path: "ok.py", occ: [["py a/i().", true]] },
    ])
    const climbing = dumpBytes("rust-analyzer", [
      { path: "../../../out.rs", occ: [["rust a/j().", true]] },
      { path: "src/lib.rs", occ: [["rust a/k().", true]] },
    ])
    const repo = repoWith({
      ".atlas/index.d/py.scip": escaping,
      ".atlas/index.d/rust.scip": climbing,
      ".atlas/index.d/roots.json": JSON.stringify({ "rust.scip": "native/omni" }),
    })
    expect(readScipOrEmpty(join(repo, SCIP_INDEX_REL)).documents.map((d) => d.relativePath)).toEqual([
      "ok.py",
      "native/omni/src/lib.rs",
    ])

    for (const root of ["native\\omni", "C:/omni", "c:omni"]) {
      const bad = repoWith({
        ".atlas/index.d/rust.scip": climbing,
        ".atlas/index.d/roots.json": JSON.stringify({ "rust.scip": root }),
      })
      expect(readScipOrEmpty(join(bad, SCIP_INDEX_REL))).toStrictEqual({ documents: [] })
      expect(() => readScip(join(bad, SCIP_INDEX_REL))).toThrow(/repo-relative POSIX path/)
    }
  })

  it("a corrupt dump degrades ALONE; a malformed `roots.json` degrades the whole index", () => {
    const corrupt = repoWith({ ".atlas/index.d/ts.scip": TS_DUMP, ".atlas/index.d/bad.scip": "not a protobuf" })
    const corruptPath = join(corrupt, SCIP_INDEX_REL)
    expect(readScipOrEmpty(corruptPath).documents.map((d) => d.relativePath)).toEqual(["src/app.ts"])
    expect(() => readScip(corruptPath)).toThrow() // the diagnostic reader keeps the reason

    for (const roots of ["{not json", JSON.stringify(["x"]), JSON.stringify({ "ts.scip": "../outside" })]) {
      const bad = repoWith({ ".atlas/index.d/ts.scip": TS_DUMP, ".atlas/index.d/roots.json": roots })
      const badPath = join(bad, SCIP_INDEX_REL)
      expect(readScipOrEmpty(badPath)).toStrictEqual({ documents: [] })
      expect(() => readScip(badPath)).toThrow()
      expect(reportIndexPlan(bad).rootsError).toContain("roots.json")
    }
  })

  it("`atlas doctor index` reports each dump — indexer, documents, root", () => {
    const repo = repoWith({
      "src/app.ts": "export const a = 1\n",
      ".atlas/index.d/ts.scip": TS_DUMP,
      ".atlas/index.d/rust.scip": RUST_DUMP,
      ".atlas/index.d/roots.json": JSON.stringify({ "rust.scip": "native/omni" }),
    })
    const r = reportIndexPlan(repo)
    expect(r.rootsError).toBeUndefined()
    expect(r.scip).toEqual({ kind: "absent" })
    expect(r.dumps).toEqual([
      {
        rel: ".atlas/index.d/rust.scip",
        root: "native/omni",
        indexer: "rust-analyzer",
        state: { kind: "present", documents: 1 },
      },
      { rel: ".atlas/index.d/ts.scip", root: "", indexer: "scip-typescript", state: { kind: "present", documents: 1 } },
    ])
    expect(reportIndexPlan(repoWith({ [SCIP_INDEX_REL]: TS_DUMP })).dumps).toEqual([])
  })

  it("the scip-python plan names its project and writes its own dump under `index.d`", () => {
    const repo = repoWith({ "svc/c.py": "c = 3\n" })
    const py = reportIndexPlan(repo).configured.find((p) => p.plan.lang === "py")!.plan
    expect(py.args).toEqual(["index", "--project-name", basename(repo), "--output", ".atlas/index.d/py.scip"])
    expect(planIndexers(["ts"])[0]!.args).toEqual(["index", "--output", SCIP_INDEX_REL]) // ts unchanged
  })
})
