// @atlas/memory — src/portable.ts  (WP-3.5-a.MEM · MEM-9)
//
// Portable + scanner-gated (MEM-9). Memory exports to OPEN JSON that replays 1:1 into a fresh store, no
// lock-in: `deepEqual(mem, import(export(mem)))` (the KERNEL-6 OKF open-JSON discipline over the flat
// `MemoryStore` array — no raw hashing). A pre-write NAMED cred-scanner (gitleaks / trufflehog) runs BEFORE
// the write persists and a HIT fails the write CLOSED (blocked, never redacted-and-continued). Scanner
// DETECTION completeness is DELEGATED (a conformance gate against the real binary, FR-12) — consumed here as
// an injected `NamedScanner` seam; these residue goldens assert only pipeline wiring + fail-closed.

import type { MemoryStore, MemoryRecord } from "./types.js"

// ── frozen portable surface, co-located here (was ref/portable.ts) ─────────────────────────────────────────

export interface PortableApi {
  /** Open-JSON dump of the member's Memory — replays 1:1, no proprietary encoding, no host dependency
   *  (MEM-9). Reuses KERNEL-6 `portable.ts`. (method-tags-mem:81) */
  export(): string

  /** Replay an open-JSON dump 1:1 into a fresh store — `deepEqual(mem, import(export(mem)))` (MEM-9).
   *  (method-tags-mem:81) */
  import(json: string): MemoryStore
}

// ── MEM-9a: open-JSON export / import round-trip ──────────────────────────────────────────────────

/** OKF envelope tag + version — the ONLY literals the serializer adds; both are host-independent, so a
 *  grep of the dump finds 0 host/external refs (no lock-in). Mirrors KERNEL-6 `portable.ts`. */
const OKF_MEM_FORMAT = "atlas-okf-mem"
const OKF_MEM_VERSION = 1

/** The on-the-wire shape of a memory dump: a self-describing open-JSON envelope over the store records. */
interface OkfMemBundle {
  readonly format: string
  readonly version: number
  readonly records: MemoryStore
}

/**
 * Serialize a member's Memory to a self-contained OPEN-JSON dump (MEM-9a). Every record is carried
 * verbatim — nothing is dropped (no lossy / lock-in encoding), no host path / external reference is
 * introduced. The dump replays 1:1 through `importMemory`.
 */
export function exportMemory(mem: MemoryStore): string {
  const bundle: OkfMemBundle = { format: OKF_MEM_FORMAT, version: OKF_MEM_VERSION, records: mem }
  return JSON.stringify(bundle)
}

/**
 * Replay an open-JSON dump 1:1 into a FRESH store (MEM-9a) — `deepEqual(mem, importMemory(exportMemory(mem)))`.
 * Fails closed (throws) on a malformed bundle — non-JSON text, or a missing/typed-wrong envelope — rather
 * than returning a partial or fabricated store.
 */
export function importMemory(json: string): MemoryStore {
  let parsed: unknown
  try {
    parsed = JSON.parse(json)
  } catch {
    throw new Error("malformed OKF memory bundle: not valid JSON")
  }
  if (!isOkfMemBundle(parsed)) {
    throw new Error("malformed OKF memory bundle: missing or invalid OKF envelope")
  }
  return parsed.records
}

/** Structural guard for the memory OKF envelope — the fail-closed predicate `importMemory` gates on. */
function isOkfMemBundle(v: unknown): v is OkfMemBundle {
  if (typeof v !== "object" || v === null) return false
  const b = v as Record<string, unknown>
  return b.format === OKF_MEM_FORMAT && typeof b.version === "number" && Array.isArray(b.records)
}

/**
 * Bind a Memory snapshot to the frozen `PortableApi` — `export()`/`import(json)` as
 * the store-attached form the contract names. Thin adapters over the free functions above.
 */
export function makePortableMemory(mem: MemoryStore): PortableApi {
  return {
    export: (): string => exportMemory(mem),
    import: (json: string): MemoryStore => importMemory(json),
  }
}

// ── MEM-9b / MEM-9c: pre-write named-scanner fail-closed gate ─────────────────────────────────────

/**
 * A NAMED cred-scanner in the pre-write path (MEM-9b). `name` is load-bearing — the golden requires the
 * scanner stage be PRESENT and NAMED (gitleaks / trufflehog). `scan` returns the hit boolean; its
 * DETECTION quality is delegated to FR-12 (billy) — the boolean is the delegated input, not authored here.
 */
export interface NamedScanner {
  readonly name: string
  scan(record: MemoryRecord): boolean
}

/**
 * Raised when the named scanner signals a hit — the write is BLOCKED (fail-closed, MEM-9c). Carries the
 * scanner name so the block is attributable; it is NOT a redaction and NOT a pass-through.
 */
export class ScannerBlockedError extends Error {
  readonly scannerName: string
  constructor(scannerName: string) {
    super(`memory write blocked (fail-closed) by named scanner '${scannerName}': secret detected`)
    this.name = "ScannerBlockedError"
    this.scannerName = scannerName
  }
}

/**
 * The pre-write named-scanner gate (MEM-9b/9c). The named scanner runs BEFORE the write persists; on a
 * HIT the write is BLOCKED fail-closed (throws) — never redacted-and-continued, never logged-and-passed.
 * On a clean scan the record is appended to the store (a fresh array; the input store is not mutated).
 *
 * @throws {Error}                on an unnamed scanner — the pre-write stage MUST be a NAMED scanner.
 * @throws {ScannerBlockedError}  on a scanner hit — the fail-closed gate blocks the write.
 */
export function writeWithScanner(store: MemoryStore, record: MemoryRecord, scanner: NamedScanner): MemoryStore {
  if (!scanner.name) {
    throw new Error("pre-write scanner stage requires a NAMED scanner (gitleaks / trufflehog)")
  }
  // The named scanner runs in the pre-write path — BEFORE any record is persisted.
  const hit = scanner.scan(record)
  if (hit) {
    // Fail-closed: a hit BLOCKS the write. The record never reaches the store.
    throw new ScannerBlockedError(scanner.name)
  }
  // Clean → persist. Append-only, non-mutating.
  return [...store, record]
}

// differential-vs-oracle (compile-time): `makePortableMemory` conforms to the frozen PortableApi.
const _portable: (mem: MemoryStore) => PortableApi = makePortableMemory
void _portable
