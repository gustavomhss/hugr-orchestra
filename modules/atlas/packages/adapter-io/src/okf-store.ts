// @atlas/adapter-io — src/okf-store.ts  (EPIC-1-b — the disk side of the OKF store-instance door)
//
// The raw-file helpers `atlas export`/`atlas import` ride. They turn the DURABLE CAS on disk into the
// `Cas` Map `@atlas/persist`'s `exportStore`/`importStore` (over the SEALED kernel `exportCas`/`importCas`
// seam) serialize and replay — nothing here computes an identity or touches the OKF format; this module
// only enumerates the sharded CAS directory and writes value files back through the SAME `createDiskStore`
// adapter every governed door rides, so an imported object is authenticated by the store's own tamper-safe
// get path (re-hash on read) exactly as a door-written one is.
//
// These are STORE-INSTANCE operations (a headless seed/migration tool), deliberately NOT composed over the
// runtime: export reads the whole CAS, import writes ONLY a FRESH EMPTY target's CAS bytes and never the
// guarded projection sidecar — see `cli/src/okf-cli.ts` for the governed-doors framing (ADR-0003). No
// clock/network/LLM anywhere.

import { existsSync, lstatSync, mkdirSync, readdirSync, realpathSync } from "node:fs"
import { dirname, join, resolve } from "node:path"
import type { Hash } from "@atlas/contracts"
import type { Cas, CasObject } from "@atlas/kernel"
import { createDiskStore } from "./store.js"

/** Evaluation data must never leave an operational bulk-transfer door, including copied
 * carriers whose original store marker was removed. Legacy ownership v1 remains exportable. */
export function isEvaluationPayload(value: unknown): boolean {
  const pending: unknown[] = [value]
  const seen = new Set<object>()
  while (pending.length > 0) {
    const next = pending.pop()
    if (typeof next === "string") {
      if (next.startsWith("Evaluation-only ownership manifest for ")) return true
      continue
    }
    if (next === null || typeof next !== "object" || seen.has(next)) continue
    seen.add(next)
    if (Array.isArray(next)) { pending.push(...next); continue }
    const record = next as Record<string, unknown>
    if ("evaluation" in record || "evaluationCandidate" in record || record.phase === "evaluation" ||
      (typeof record.kind === "string" && record.kind.startsWith("genesis-evaluation-")) ||
      (typeof record.schema === "string" && (record.schema.startsWith("genesis-evaluation-") || record.schema.startsWith("ownership-evaluation-"))) ||
      (record.version === 2 && typeof record.kind === "string" && record.kind.startsWith("ownership-"))) return true
    pending.push(...Object.values(record))
  }
  return false
}

/** Also check the resolved CAS location: an alias must not erase its store's phase. */
export function assertOperationalCas(casPath: string): void {
  const paths = [resolve(casPath)]
  if (existsSync(casPath)) paths.push(realpathSync(casPath))
  for (const path of paths) for (const name of ["evaluation-store.json", "evaluation-policy.json"]) {
    try { lstatSync(join(dirname(path), name)) } catch (error) {
      if (typeof error === "object" && error !== null && "code" in error && error.code === "ENOENT") continue
      throw error
    }
    throw new Error("evaluation-operational-cas-refused")
  }
}

/** The durable CAS root under a repo — the SAME relative path `compose.ts`'s `CAS_REL` names (D4). */
export const CAS_REL = join(".atlas", "cas")

/** Read the WHOLE durable CAS at `<casPath>` into a `Cas` Map, each value through the store's own validated
 *  `get` (re-hash-on-read, no-symlink, size-capped — store.ts). TOTAL: an absent/unlistable CAS root or shard
 *  contributes nothing (the honest empty store), never a throw — mirroring `doctor-source.ts`'s `casAudit`
 *  walk, whose `store.get` this reuse shares. Evaluation phase/payload is an explicit error, never an empty/partial success. */
export function readCas(casPath: string): Cas {
  assertOperationalCas(casPath)
  const store = createDiskStore(casPath)
  const cas: Cas = new Map<Hash, CasObject>()
  let shards: string[]
  try {
    shards = readdirSync(casPath, { withFileTypes: true })
      .filter((e) => e.isDirectory())
      .map((e) => e.name)
  } catch {
    return cas
  }
  for (const shard of shards) {
    let files: string[]
    try {
      files = readdirSync(join(casPath, shard), { withFileTypes: true })
        .filter((e) => e.isFile())
        .map((e) => e.name)
    } catch {
      continue
    }
    for (const name of files) {
      const obj = store.get(name as Hash)
      if (isEvaluationPayload(obj)) throw new Error("evaluation-operational-export-refused")
      if (obj !== undefined) cas.set(name as Hash, obj)
    }
  }
  assertOperationalCas(casPath)
  return cas
}

/** Write every object of `cas` into a FRESH CAS root at `<casPath>` through the disk store's own `put`
 *  (content-keyed dedup + canonicalize-before-hash — store.ts). Creates the store root even for an EMPTY
 *  replay, so a fresh target is provably no longer fresh after one import (a second `atlas import` into the
 *  same target REFUSES). Returns the number of objects put. */
export function writeCasObjects(cas: Cas, casPath: string): number {
  assertOperationalCas(casPath)
  // Complete preflight before creating directories or writing even the first object.
  for (const obj of cas.values()) if (isEvaluationPayload(obj)) throw new Error("evaluation-operational-import-refused")
  const store = createDiskStore(casPath)
  mkdirSync(casPath, { recursive: true })
  let n = 0
  for (const obj of cas.values()) {
    store.put(obj)
    n += 1
  }
  return n
}

/** The deterministic bundle filename inside an export output directory. */
export function okfBundlePath(outDir: string): string {
  return join(outDir, "atlas-okf.json")
}

/** Does `targetDir` already host an Atlas store — i.e. is it NOT a fresh empty target? Refusing a target
 *  with `.atlas/` present (the conservative strict-membership rule) is what keeps `atlas import` honest: it
 *  writes only into a store that is provably empty, never into a live one. */
export function targetHasStore(targetDir: string): boolean {
  return existsSync(join(targetDir, ".atlas"))
}

/** Content-equality of two `Cas` maps — key sets equal AND every value JSON-equal. Order-independent (a Map
 *  carries no order worth trusting; the bundle and a readback of the just-written files need not agree on
 *  insertion sequence to be the same store). */
export function sameCas(a: Cas, b: Cas): boolean {
  if (a.size !== b.size) return false
  for (const [k, v] of a) {
    const w = b.get(k)
    if (w === undefined || JSON.stringify(v) !== JSON.stringify(w)) return false
  }
  return true
}
