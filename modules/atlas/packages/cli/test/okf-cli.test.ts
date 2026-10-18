// @atlas/cli — test/okf-cli.test.ts  (EPIC-1-b — the `atlas export` / `atlas import` store-instance doors)
//
// Three things are under test and nothing else: the argv→dispatch wiring (does `atlas export`/`import`
// actually reach the PERSIST-9 OKF runners, or are `exportStore`/`importStore` still reference models
// nothing calls — the exact shape `@atlas/persist`'s `source.ts` was in before this WP), the READ
// classification (`COMMAND_LEG` → `atlas-query`, authority derived from `WRITE_PATHS`), and the REAL disk
// round-trip through the entrypoint: export a seeded store to a bundle, replay it into a fresh target, and
// assert the refusal on a non-fresh target (exit 1, fail-closed). The identity algebra itself is pinned by
// `packages/persist/test/source.test.ts`; THIS file pins that the shipped commands actually drive it.

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { mkdtempSync, mkdirSync, rmSync, readFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { createDiskStore } from "@atlas/adapter-io"
import type { CasObject } from "@atlas/kernel"
import { main } from "../src/cli.js"
import { runOkfExport, runOkfImport } from "../src/okf-cli.js"
import { COMMANDS, COMMAND_LEG, authorityOf } from "../src/map.js"
import { parse } from "../src/parse.js"

let writes: string[]
beforeEach(() => {
  writes = []
  vi.spyOn(process.stdout, "write").mockImplementation((chunk: unknown) => {
    writes.push(String(chunk))
    return true
  })
})
afterEach(() => vi.restoreAllMocks())

const stdoutOf = (): string => writes.join("")

describe("EPIC-1-b — `atlas export` / `atlas import` are registered commands of READ authority", () => {
  it("parses — `export` with ONE out-dir positional, `import` with bundle + target", () => {
    const e = parse(["export", "out"])
    expect(e.ok).toBe(true)
    expect(e.ok && e.command).toBe("export")
    expect(e.ok && e.positionals).toEqual(["out"])
    const im = parse(["import", "bundle.json", "target"])
    expect(im.ok).toBe(true)
    expect(im.ok && im.command).toBe("import")
    expect(im.ok && im.positionals).toEqual(["bundle.json", "target"])
  })

  it("both bind the `atlas-query` READ oracle and classify read (they carry NO governed fact-write token)", () => {
    expect(COMMANDS).toContain("export")
    expect(COMMANDS).toContain("import")
    expect(COMMAND_LEG.export).toBe("atlas-query")
    expect(COMMAND_LEG.import).toBe("atlas-query")
    // The whole authority claim, DERIVED from `WRITE_PATHS` rather than asserted: neither command's leg is a
    // governed write door, so both are read — even though import writes CAS bytes into a FRESH target only.
    expect(authorityOf("export")).toBe("read")
    expect(authorityOf("import")).toBe("read")
  })

  it("arity fails closed BEFORE any leg is reached", async () => {
    let called = 0
    const code = await main(["export"], {
      okfExport: () => {
        called++
        return { exitCode: 0, stdout: "" }
      },
    })
    expect(code).toBe(1)
    expect(called).toBe(0)
    expect(stdoutOf()).toContain("command 'export' requires 1 positional argument(s), got 0")

    writes = []
    const code2 = await main(["import", "only-the-bundle"], {
      okfImport: () => {
        called++
        return { exitCode: 0, stdout: "" }
      },
    })
    expect(code2).toBe(1)
    expect(called).toBe(0)
    expect(stdoutOf()).toContain("command 'import' requires 2 positional argument(s), got 1")
  })
})

describe("EPIC-1-b — DISPATCH: the injected legs are CALLED with the arguments the user typed", () => {
  it("`atlas export <out>` reaches the export leg ONCE, verbatim", async () => {
    // teeth: breaks-on "the export branch is never wired into `main`" — the exact state `source.ts` shipped
    // in (a green suite, zero production callers).
    const seen: string[] = []
    const okfExport = (outDir: string) => {
      seen.push(outDir)
      return { exitCode: 0, stdout: "export: ok\n" }
    }
    const code = await main(["export", "some/out"], { okfExport })
    expect(seen).toEqual(["some/out"])
    expect(code).toBe(0)
    expect(stdoutOf()).toContain("export: ok")
  })

  it("`atlas import <bundle> <target>` reaches the import leg ONCE, verbatim", async () => {
    const seen: string[] = []
    const okfImport = (bundlePath: string, targetDir: string) => {
      seen.push(bundlePath, targetDir)
      return { exitCode: 0, stdout: "import: ok\n" }
    }
    const code = await main(["import", "b/okf.json", "fresh"], { okfImport })
    expect(seen).toEqual(["b/okf.json", "fresh"])
    expect(code).toBe(0)
    expect(stdoutOf()).toContain("import: ok")
  })
})

describe("EPIC-1-b — REAL disk round-trip through the entrypoint (PERSIST-9, the shipped runner)", () => {
  let dir: string
  let liveCas: string
  let outDir: string
  let freshDir: string

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "atlas-okfcli-"))
    liveCas = join(dir, "repo", ".atlas", "cas")
    outDir = join(dir, "bundle")
    freshDir = join(dir, "fresh")
    mkdirSync(liveCas, { recursive: true })
  })
  afterEach(() => rmSync(dir, { recursive: true, force: true }))

  function seed(obj: Record<string, unknown>): void {
    createDiskStore(liveCas).put(obj as CasObject)
  }

  it("`atlas export <outDir>` exits 0, writes the bundle, and `atlas import` replays it 1:1 into a fresh store", async () => {
    seed({ kind: "StructuralNode", anchor: "pkg/mod", children: [1, 2] })
    seed({ kind: "KnowledgeFact", subject: "s", predicate: "is", object: "y" })
    seed({ kind: "MemoryEntry", seat: "forge", note: "observed" })

    // export — the REAL default runner bound to the fixture's store (cwd is irrelevant here), driven through
    // the entrypoint exactly as the shipped binary dispatches it.
    const outCode = await main(["export", outDir], { okfExport: (out) => runOkfExport(liveCas, out) })
    expect(outCode).toBe(0)
    const bundleFile = join(outDir, "atlas-okf.json")
    expect(JSON.parse(readFileSync(bundleFile, "utf8"))).toMatchObject({ format: "atlas-okf", version: 1 })

    // import — the REAL default runner, into a genuinely fresh target, through the entrypoint.
    // The same bundle replays 1:1: importStore(exportStore(store)) then a disk read-back.
    const impCode = await main(["import", bundleFile, freshDir], { okfImport: runOkfImport })
    expect(impCode).toBe(0)
    expect(stdoutOf()).toContain("3 CAS object(s) replayed 1:1")
    // the imported store is byte-identical to the exported one (three keys, values equal).
    const rehydrated = createDiskStore(join(freshDir, ".atlas", "cas"))
    const whole = createDiskStore(liveCas)
    const keys = Object.keys(JSON.parse(readFileSync(bundleFile, "utf8")).objects as Record<string, unknown>)
    expect(keys.length).toBe(3)
    for (const k of keys) expect(rehydrated.get(k as never)).toEqual(whole.get(k as never))
  })

  it("an EMPTY store exports the honest empty bundle, which imports into a fresh target (exit 0, 0 objects)", async () => {
    const outCode = await main(["export", outDir], { okfExport: (out) => runOkfExport(liveCas, out) })
    expect(outCode).toBe(0)
    const bundle = JSON.parse(readFileSync(join(outDir, "atlas-okf.json"), "utf8")) as {
      objects: Record<string, unknown>
    }
    expect(Object.keys(bundle.objects)).toEqual([])
    const impCode = await main(["import", join(outDir, "atlas-okf.json"), freshDir], { okfImport: runOkfImport })
    expect(impCode).toBe(0)
    expect(stdoutOf()).toContain("0 CAS object(s) replayed 1:1")
  })

  it("importing into a target that ALREADY hosts a store exits 1 (fail-closed), and writes nothing", async () => {
    seed({ kind: "MemoryEntry", note: "n" })
    const outCode = await main(["export", outDir], { okfExport: (out) => runOkfExport(liveCas, out) })
    expect(outCode).toBe(0)

    // seed a NON-fresh target: it already owns a store (an existing `.atlas/`).
    const occupied = join(dir, "occupied")
    mkdirSync(join(occupied, ".atlas"), { recursive: true })
    createDiskStore(join(occupied, ".atlas", "cas")).put({ kind: "MemoryEntry", note: "pre-existing" } as never)

    const impCode = await main(["import", join(outDir, "atlas-okf.json"), occupied], { okfImport: runOkfImport })
    expect(impCode).toBe(1) // the pinned fail-closed; NEVER a silent merge into a live store
    expect(stdoutOf()).toContain("already hosts an Atlas store")
    expect(stdoutOf()).toContain("back-channel write path for FACT rows")
    // nothing changed under the occupied store (the refusal precedes every write).
    expect(
      createDiskStore(join(occupied, ".atlas", "cas")).get(
        createDiskStore(join(occupied, ".atlas", "cas")).put({ kind: "MemoryEntry", note: "pre-existing" } as never),
      ),
    ).toBeDefined()
  })

  it("a MALFORMED bundle fails closed through the REAL import runner — nothing is written, exit 1", async () => {
    const bad = join(dir, "bad.json")
    const { writeFileSync } = await import("node:fs")
    writeFileSync(bad, "this is not an OKF bundle", "utf8")
    const impCode = await main(["import", bad, freshDir], { okfImport: runOkfImport })
    expect(impCode).toBe(1)
    expect(stdoutOf()).toContain("malformed OKF bundle")
    expect(stdoutOf()).toContain("Nothing was written (fail-closed)")
    // the refusal/shape checks happen before any write: the fresh target is still truly fresh.
    const { existsSync } = await import("node:fs")
    expect(existsSync(join(freshDir, ".atlas"))).toBe(false)
  })

  it("RENDERING is deterministic: equal out shapes render byte-identically (no clock, no nonce)", async () => {
    const { okfExportVerdict, okfImportVerdict } = await import("../src/okf-cli.js")
    const shape = { bundleFile: "/t/atlas-okf.json" as string, objects: 7 } as const
    expect(okfExportVerdict(shape).stdout).toBe(okfExportVerdict(shape).stdout)
    expect(okfImportVerdict({ casDir: "/f/.atlas/cas", objects: 7 }).stdout).toBe(
      okfImportVerdict({ casDir: "/f/.atlas/cas", objects: 7 }).stdout,
    )
    expect(okfExportVerdict(shape).exitCode).toBe(0)
  })
})
