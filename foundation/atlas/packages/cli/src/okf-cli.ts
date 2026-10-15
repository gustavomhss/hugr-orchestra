// @atlas/cli — src/okf-cli.ts  (EPIC-1-b — the `atlas export` / `atlas import` store-instance door)
//
// The two new headless store-instance commands, and THE production callers that make `@atlas/persist`'s
// `exportStore`/`importStore` running code (they were the reference model `source.ts` until this module
// value-imported them). Both consume the SEALED kernel OKF seam through `@atlas/persist` — nothing here
// touches identity/hash/format, exactly as the frozen PERSIST-1/PERSIST-9 spec demands.
//
//   `atlas export <outDir>`  — dump the WHOLE durable CAS of the repo at cwd through `exportStore` (the
//                             KERNEL-6 serializer) into `<outDir>/atlas-okf.json`. Clean read-and-write-a-bundle.
//   `atlas import <bundle> <targetDir>` — replay the bundle 1:1 into a FRESH EMPTY store target ONLY.
//
// ── THE GOVERNED-DOORS FRAMING (ADR-0003), STATED, NOT LEFT AS A TODO ─────────────────────────────────────
// `import` WRITES files, so it must answer the confused-deputy question the product forbids: a full store
// import into the LIVE `.atlas/` would put FACT rows on disk WITHOUT the governed emit door (truth → authz →
// ratify → incumbent) ever seeing them — the exact back-channel this repo's provenance tripwire exists to
// close. The honest shape is: import replays ONLY the content-addressed CAS bytes (the immutable, keyed-by-
// hash half of the store) into a target that FAILS CLOSED unless it is provably fresh (no `.atlas/` at all).
// It NEVER writes the guarded `projection` sidecar — the mutable, served half whose rows ARE the defended
// facts — so nothing imported becomes readable until it re-enters through the door, and no live store can be
// touched: a target that already hosts one is REFUSED (exit 1), not merged into.
//
// `export` is the clean mirror: it reads the store and writes a bundle file, opening no write path into any
// store. Read authority, neither command carries a governed fact-write token (`COMMAND_LEG` → `atlas-query`).

import { mkdirSync, readFileSync, writeFileSync } from "node:fs"
import { join } from "node:path"
import { exportStore, importStore } from "@atlas/persist"
import { CAS_REL, okfBundlePath, readCas, sameCas, targetHasStore, writeCasObjects } from "@atlas/adapter-io"
import type { CliVerdict } from "./render.js"

/** The invariant every `atlas export` outcome carries (PERSIST-9 — the whole store dumps open, no lock-in). */
const EXPORT_INVARIANT =
  "PERSIST-9: the WHOLE store dumps to self-contained open JSON over the SEALED kernel OKF seam — no proprietary encoding, no host path, no lock-in on git; the dump replays 1:1 into a fresh store"

/** The invariant every `atlas import` outcome carries (PERSIST-9 + the governed-doors discipline). */
const IMPORT_INVARIANT =
  "PERSIST-9/ADR-0003: import replays the OKF dump 1:1 into a FRESH EMPTY store ONLY — CAS bytes yes, the guarded projection NEVER, so an import cannot become a back-channel FACT write past the governed emit door"

/** The invariant every FAIL-CLOSED outcome carries (CLI-1b — a malformed invocation is structured, never a
 *  crash). */
const FAILURE_INVARIANT =
  "CLI-1b: a malformed invocation yields a structured error + guidance + non-zero exit, never a crash"

/** A structured fail-closed CliVerdict (the SAME status/next/invariant/reason shape `renderVerdict` emits for
 *  an `ok:false` handler verdict — uniform bytes through the ONE process-outcome path). */
function failVerdict(verb: string, message: string): CliVerdict {
  return {
    exitCode: 1,
    stdout: `status: error\nnext: ${message}\ninvariant: ${FAILURE_INVARIANT}\nreason: ${verb}: ${message}\n`,
  }
}

/**
 * Drive `atlas export <outDir>` ONE pass over the repo at cwd: read the whole durable CAS through the disk
 * adapter, serialize it through the SEALED kernel OKF seam (`exportStore`), and write the bundle at
 * `<outDir>/atlas-okf.json` (creating the output directory). TOTAL — every filesystem failure resolves to a
 * fail-closed CliVerdict, never a throw. An ABSENT store is the honest empty bundle (0 objects), never an
 * error: a fresh repo has an empty CAS, and the empty dump still replays 1:1.
 */
export function runOkfExport(casDir: string, outDir: string): CliVerdict {
  let bundle: string
  let objects: number
  try {
    const cas = readCas(casDir)
    objects = cas.size
    bundle = exportStore(cas)
  } catch (e) {
    return failVerdict("atlas export", `could not assemble the OKF bundle — ${(e as Error).message}`)
  }
  let bundleFile: string
  try {
    bundleFile = okfBundlePath(outDir)
    mkdirSync(outDir, { recursive: true })
    writeFileSync(bundleFile, bundle, "utf8")
  } catch (e) {
    return failVerdict("atlas export", `could not write the bundle — ${(e as Error).message}`)
  }
  return okfExportVerdict({ bundleFile, objects })
}

/** The rendered success receipt for one export pass. PURE — a function of the out shape alone. */
export function okfExportVerdict(out: { readonly bundleFile: string; readonly objects: number }): CliVerdict {
  return {
    exitCode: 0,
    stdout:
      [
        "status: ok",
        `next: OKF bundle of the durable store written to '${out.bundleFile}' — ${out.objects} CAS object(s); replay it INTO A FRESH STORE with 'atlas import <thisBundle> <freshTargetDir>'`,
        `invariant: ${EXPORT_INVARIANT}`,
        `export: ${out.objects} CAS object(s) dumped — located, not copied`,
      ].join("\n") + "\n",
  }
}

/**
 * Drive `atlas import <bundle> <targetDir>` ONE pass into a FRESH EMPTY store target:
 *   1. FAIL CLOSED on a target that already hosts an Atlas store (`.atlas/` present) — a full-store import
 *      may never merge into a live store, or it would be a back-channel write path for FACT rows (ADR-0003).
 *   2. Read the bundle; `importStore` (the SEALED kernel `importCas`) FAILS CLOSED on a malformed dump —
 *      nothing is written on a partial/fabricated bundle.
 *   3. Write the replayed CAS objects through the disk store's own `put`, then READ THEM BACK and verify the
 *      fresh store equals the replay EXACTLY (PERSIST-9 1:1) before reporting success.
 *
 * The guarded `projection` sidecar is NEVER written — the imported CAS bytes are durable but inert until a
 * governed emit (or reconcile) rebuilds the served projection.
 */
export function runOkfImport(bundlePath: string, targetDir: string): CliVerdict {
  if (targetHasStore(targetDir)) {
    return {
      exitCode: 1,
      stdout:
        `status: error\n` +
        `next: target '${targetDir}' already hosts an Atlas store ('.atlas/' exists) — 'atlas import' replays ONLY ` +
        `into a FRESH EMPTY store target and NEVER into a live one, so a full-store import can never become a ` +
        `back-channel write path for FACT rows past the governed emit door\n` +
        `invariant: ${IMPORT_INVARIANT}\n` +
        `reason: atlas import : target '${targetDir}' is not a fresh empty store\n`,
    }
  }

  let bundle: string
  try {
    bundle = readFileSync(bundlePath, "utf8")
  } catch (e) {
    return failVerdict("atlas import", `could not read the bundle '${bundlePath}' — ${(e as Error).message}`)
  }

  let cas
  try {
    cas = importStore(bundle)
  } catch (e) {
    return failVerdict(
      "atlas import",
      `malformed OKF bundle — ${(e as Error).message}. Nothing was written (fail-closed).`,
    )
  }

  const casDir = join(targetDir, CAS_REL)
  try {
    writeCasObjects(cas, casDir)
    if (!sameCas(readCas(casDir), cas)) {
      return failVerdict(
        "atlas import",
        `the fresh store did not replay 1:1 (verified after writing) — refusing to report success`,
      )
    }
  } catch (e) {
    return failVerdict("atlas import", `could not write the fresh store — ${(e as Error).message}`)
  }

  return okfImportVerdict({ casDir, objects: cas.size })
}

/** The rendered success receipt for one import pass. PURE — a function of the out shape alone. */
export function okfImportVerdict(out: { readonly casDir: string; readonly objects: number }): CliVerdict {
  return {
    exitCode: 0,
    stdout:
      [
        "status: ok",
        `next: ${out.objects} CAS object(s) replayed 1:1 into a FRESH store at '${out.casDir}' — the guarded projection is NOT written; serve these facts only through the governed emit door ('atlas init' installs the .gitignore deny if this target is a git repo)`,
        `invariant: ${IMPORT_INVARIANT}`,
        `import: ${out.objects} CAS object(s) replayed — verified byte-identical after writing`,
      ].join("\n") + "\n",
  }
}
