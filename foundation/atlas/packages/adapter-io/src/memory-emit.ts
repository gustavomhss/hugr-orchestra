// @atlas/adapter-io — src/memory-emit.ts  (the GOVERNED MEMORY WRITE DOOR — CAMPAIGN-11 W4)
//
// ── REFERENCE MODEL — NO PRODUCTION CALLERS ──────────────────────────────────────────────────────────
// Nothing in `packages/*/src` calls `createMemoryEmit` yet; W8 exposes it over the CLI and MCP. Declared in
// `harness/gates/reference-model-guard.mjs` rather than pre-wired — a door hung early to clear a gate is
// the stub that gate exists to refuse.
//
// ── WHAT THIS DOOR IS ────────────────────────────────────────────────────────────────────────────────────
// The one path by which a memory record reaches disk. Every gate it runs already exists as a pure function
// in `@atlas/memory`; this file's whole job is to COMPOSE them in an order that is defensible, and to turn
// each refusal into a structured verdict instead of an exception a caller might swallow. It authors no
// policy of its own.
//
// ── THE ORDER, AND WHY IT IS THIS ORDER ──────────────────────────────────────────────────────────────────
//   1. DERIVE the kind (`memoryKindOf`). It must be first because it selects the template that gate 2 runs,
//      and `atlas-memory.md` §Decisions D3 forbids the payload choosing its own judge (ARCH-9, one layer
//      down). A kind that cannot be derived is refused here rather than guessed.
//   2. TEMPLATE (`validate`). A missing required field or prose outside the fixed keys is refused
//      fail-closed (MEM-5). Runs before the store is touched at all.
//   3. PARTITION + OWNER (`put`). Memory-vs-Knowledge conflation, both directions, and an empty owner
//      (MEM-2, MEM-1). This is what mints the `MemoryRecord`.
//   4. LOGBOOK DISCIPLINE, only for that kind: one entry per PR (MEM-8). The incumbent is read from the
//      DURABLE log, so the guard survives a restart — a second entry filed tomorrow is refused the same as
//      one filed a second later.
//   5. CAP, only for `project` (MEM-3). Computed over the OWNER'S existing set plus the candidate, because
//      a per-member cap that ignored what the member already holds would never bind.
//   6. SCANNER (MEM-9b/9c), immediately before persist. LAST on purpose: "pre-write" is least ambiguous at
//      the point where the only remaining step is the write, and a record refused by gates 1-5 never
//      reaches disk, so scanning it would be work with nothing to protect.
//   7. PERSIST — one append.
//
// A refusal at any gate means NOTHING is appended. The store is append-only, so there is no partial write
// to unwind: the door either produced one line or produced none.
//
// ── WHY A VERDICT AND NOT AN EXCEPTION ───────────────────────────────────────────────────────────────────
// `@atlas/memory` throws — `KindConflationError`, `UndeterminedKindError`, `UnownedWriteError`,
// `ScannerBlockedError`. Those are correct at that layer, where a throw is the fail-closed primitive. At a
// DOOR they are not enough: a caller can catch and continue, and `atlas emit`'s exit-code contract
// distinguishes "your invocation was wrong" (1) from "a gate declined it" (2), which an exception does not
// carry. So every throw is caught here and turned into a named refusal with its receipt — the over-cap one
// carries `tokens` and `cap`, the scanner one carries the scanner's NAME, so a block is attributable.

import {
  KindConflationError,
  UndeterminedKindError,
  UnownedWriteError,
  ScannerBlockedError,
  capGate,
  memoryKindOf,
  put,
  MEMBER_TOK_CAP,
  ORCH_TOK_CAP,
  LOGBOOK_AUTHOR,
  validate,
} from "@atlas/memory"
import type { MemberId, MemoryEntry, MemoryRecord, NamedScanner, ProjectMemoryEntry } from "@atlas/memory"
import type { DurableMemory } from "./memory-store.js"
import { NO_SCANNER_NAME } from "./scanner.js"

/** The named refusals. A caller distinguishes them; none is a generic failure. */
export type MemoryRefusal =
  | "undetermined-kind"
  | "template-invalid"
  | "kind-conflation"
  | "unowned"
  | "logbook-duplicate"
  | "logbook-unauthorized"
  | "over-cap"
  | "scanner-blocked"
  | "scanner-unavailable"

/** A refused write: the gate that declined, why, and the receipt that gate owes the caller. */
export interface MemoryRejected {
  readonly ok: false
  readonly refusal: MemoryRefusal
  readonly reason: string
  /** `over-cap` only — the honest tokens-vs-cap receipt MEM-3 requires instead of a silent truncation. */
  readonly tokens?: number
  readonly cap?: number
  /** `scanner-blocked` / `scanner-unavailable` only — the block is attributable to a NAMED stage. */
  readonly scanner?: string
}

/** An admitted write: the record that reached disk. */
export interface MemoryAdmitted {
  readonly ok: true
  readonly record: MemoryRecord
}

export type MemoryVerdict = MemoryAdmitted | MemoryRejected

export interface MemoryEmitDeps {
  readonly store: DurableMemory
  /** The owner (D1): the composition root's resolved `actor`. This door does not resolve or interpret it. */
  readonly actor: MemberId
  /**
   * The pre-write named scanner (MEM-9). ABSENT is not "no secrets" — it is "not checked", and the door
   * refuses, because those two must never be the same value. That is the failure shape this repository has
   * spent a campaign removing, and a door that passed an unscanned write would reintroduce it at the one
   * place a secret becomes durable.
   */
  readonly scanner?: NamedScanner
}

export interface MemoryEmit {
  emit(entry: MemoryEntry): MemoryVerdict
}

const reject = (refusal: MemoryRefusal, reason: string, extra: Partial<MemoryRejected> = {}): MemoryRejected => ({
  ok: false,
  refusal,
  reason,
  ...extra,
})

export function createMemoryEmit(deps: MemoryEmitDeps): MemoryEmit {
  function emit(entry: MemoryEntry): MemoryVerdict {
    // 1 — the kind is DERIVED. `memoryKindOf` throws on no match and on a TIE; both are the same refusal
    // to a caller, because both mean "this entry does not name exactly one template".
    let kind
    try {
      kind = memoryKindOf(entry)
    } catch (e) {
      if (!(e instanceof UndeterminedKindError)) throw e
      return reject("undetermined-kind", e.message)
    }

    // 2 — the template that the DERIVED kind selected, never one the payload asked for.
    const verdict = validate(kind, entry)
    if (!verdict.valid) {
      return reject("template-invalid", `MEM-5 template: ${verdict.reasons.join("; ")}`)
    }

    // 3 — partition + owner. `put` mints the record and is the only thing here that does.
    //
    // [MEASURED — `kind-conflation` is UNREACHABLE FROM THIS DOOR, and is deliberately not advertised.]
    // `partition()` answers `knowledge` only for an entry carrying `kind: 'advisory' | 'predicate'`. That
    // key is outside all four memory templates, so gate 1 refuses such an entry as `undetermined-kind`
    // before `put` is ever called, and this branch fires on nothing. Measured against the shipped binary,
    // both discriminants, in `harness/probes/m1-memory-ring.mjs` (axis M2) — not argued from the source.
    //
    // The catch STAYS: `put` really does throw it, and a template change could reopen the path, so removing
    // the branch would trade a live fail-closed floor for tidiness. What was removed instead is the CLAIM —
    // `handler.ts`'s `atlas-memory-emit` guidance used to enumerate `kind-conflation` among the outcomes a
    // user may receive, which was the same shape of defect as `template-invalid` (a refusal advertised to
    // users that no input could produce). The M2 assertions turn RED the moment it becomes reachable again,
    // which is what keeps the guidance and the code from drifting back apart.
    let record: MemoryRecord
    try {
      record = put("memory", entry, deps.actor)
    } catch (e) {
      if (e instanceof KindConflationError) return reject("kind-conflation", e.message)
      if (e instanceof UnownedWriteError) return reject("unowned", e.message)
      if (e instanceof UndeterminedKindError) return reject("undetermined-kind", e.message)
      throw e
    }

    const durable = deps.store.read()

    // 4 — MEM-8, logbook only. Read from the DURABLE log so the guard survives a restart.
    if (kind === "logbook") {
      if (deps.actor !== LOGBOOK_AUTHOR) {
        return reject(
          "logbook-unauthorized",
          `MEM-8 logbook: only '${LOGBOOK_AUTHOR}' may append; '${deps.actor}' may not`,
        )
      }
      const prId = (entry as { readonly prId: string }).prId
      const extant = durable.store.some(
        (r) => r.kind === "logbook" && (r.entry as { readonly prId?: string }).prId === prId,
      )
      if (extant) {
        return reject(
          "logbook-duplicate",
          `MEM-8 logbook: an entry for PR '${prId}' already exists; a correction appends a supersede ` +
            "pointer and never rewrites the extant entry",
        )
      }
    }

    // 5 — MEM-3, project only. Over the OWNER'S set plus the candidate: a per-member cap computed over the
    // candidate alone would never bind, and one computed over EVERY member's records would refuse a write
    // because somebody else is verbose.
    if (kind === "project") {
      const cap = deps.actor === LOGBOOK_AUTHOR ? ORCH_TOK_CAP : MEMBER_TOK_CAP
      const mine = durable.store
        .filter((r) => r.owner === deps.actor && r.kind === "project")
        .map((r) => r.entry as ProjectMemoryEntry)
      const gate = capGate([...mine, entry as ProjectMemoryEntry], cap)
      if (!gate.accepted) {
        return reject("over-cap", "MEM-3 cap: the injected project set would exceed its bound", {
          tokens: gate.tokens,
          cap: gate.cap,
        })
      }
    }

    // 6 — MEM-9. Absent scanner ⇒ refuse; see `MemoryEmitDeps.scanner`.
    //
    // `NO_SCANNER_NAME` IS AN ABSENCE, NOT A HIT, and this line exists because W4 and W5 were built in
    // parallel and were each correct alone while being WRONG TOGETHER. W5's adapter, finding no binary on
    // PATH, returns a `NamedScanner` named `no-scanner-on-path` whose `scan()` always answers `true` —
    // fail-closed, which is right. But this door reads `scan() === true` as `scanner-blocked`, so the pair
    // would have told a user "a secret was detected in your write" when the truth is "nothing looked". A
    // refusal that misnames its own reason is a worse failure than the one it reports, because the user
    // acts on the reason: they would go hunting a secret that is not there instead of installing gitleaks.
    if (deps.scanner === undefined || deps.scanner.name === "" || deps.scanner.name === NO_SCANNER_NAME) {
      return reject(
        "scanner-unavailable",
        "MEM-9 pre-write scan: no NAMED scanner is configured, so this write was not checked for secrets. " +
          '"Not checked" and "no secret" are refused as the same value — and so are "not checked" and ' +
          '"a secret was found".',
        { scanner: deps.scanner?.name ?? "" },
      )
    }
    try {
      if (deps.scanner.scan(record)) {
        return reject("scanner-blocked", new ScannerBlockedError(deps.scanner.name).message, {
          scanner: deps.scanner.name,
        })
      }
    } catch (e) {
      // A scanner that THREW did not return "clean". Fail-closed: an unavailable check is refused, never
      // treated as a pass, which is the same rule as an absent one.
      return reject(
        "scanner-unavailable",
        `MEM-9 pre-write scan: scanner '${deps.scanner.name}' could not complete ` +
          `(${e instanceof Error ? e.message : String(e)}) — refused, never passed`,
        { scanner: deps.scanner.name },
      )
    }

    // 7 — one append. Append-only, so a refusal above left nothing to unwind.
    deps.store.append(record)
    return { ok: true, record }
  }

  return { emit }
}
