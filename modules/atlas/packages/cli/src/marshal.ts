// @atlas/cli — src/marshal.ts  (ARG-MARSHALLING: parsed positionals/flags → each leg's NAMED arg shape)
//
// The CLI parses into a uniform `{command, positionals, flags}` bag, but every governance leg (@atlas/adapter-io
// wire.ts) destructures a NAMED shape: init reads `.path`, query reads `.scope`, emit reads `{node, at}`,
// reconcile reads `{mergeBase, options?}`. Without this map, `handle(tool, {positionals, flags})` fails CLOSED
// with "malformed args" for every routed command. This module is the per-command marshaller — TOTAL: a missing
// required flag, an unreadable emit fact file, or malformed fact JSON fails CLOSED to a structured error string
// (never a throw), preserving CLI-1b totality.

import { readFileSync } from "node:fs"
import type { Command } from "./map.js"

/** A marshalled named-arg object bound for `handle`, OR a structured failure reason (never a throw).
 *  `refusal: true` (AUTHOR-7b/7c, WP-10.A2-a.CLI) marks a failure that is a GOVERNED REFUSAL — a
 *  well-formed invocation a gate declined — DISTINCT from every other marshal failure (a usage/wiring
 *  error): cli.ts renders it exit-2 `renderRefusal` instead of the default exit-1 `errorVerdict`. ABSENT
 *  (not `false`) on every pre-existing marshal failure, so back-compat is exact (exactOptionalPropertyTypes). */
export type MarshalResult =
  | { readonly ok: true; readonly args: unknown }
  | { readonly ok: false; readonly error: string; readonly refusal?: true }

/**
 * Map ONE command's `{positionals, flags}` to the exact named-arg object its wired leg reads (wire.ts):
 *   init      → `{ path }`                        (leg: `(args as { path }).path`)
 *   query     → `{ scope }`                       (leg: `(args as { scope }).scope`)
 *   reconcile → `{ mergeBase, options }`          (leg: `.mergeBase` + `.options?: {acceptReground?}`)
 *   emit      → `{ node, at }`                    (leg: `.node: GroundedFact` + `.at: Hash`)
 *   link      → `{ a, b, retract }`               (leg: `.a` + `.b` — the two nodeKeys to equate, WP-SAMEAS;
 *                                                   `.retract` selects the A-D3 retraction MODE. This one
 *                                                   REFUSES unknown/odd flags — see `marshalLink`)
 *   memory-emit → `{ entry }`                     (leg: `.entry: MemoryEntry`, WP-11.W8 — the governed
 *                                                   MEMORY write door; no `--at` — the entry's own DERIVED
 *                                                   `kind` selects its template, MEM-1..9)
 * `doctor` / `mine` / `node` / `memory-recall` / `memory-header` / `memory-awareness` / `memory-orientation`
 * are dispatched BEFORE the handler (cli.ts) and never reach here — the default fails closed.
 */
export function marshalArgs(
  command: Command,
  positionals: readonly string[],
  flags: Readonly<Record<string, string>>,
): MarshalResult {
  switch (command) {
    case "init":
      // `atlas init [path]` — parse enforces arity 1, so positionals[0] is present via the normal flow; the
      // `?? '.'` honors the card's documented default when marshalled directly (defensive totality).
      return { ok: true, args: { path: positionals[0] ?? "." } }
    case "query": {
      // `atlas query <scope> [--by scope|dependency|trigger]` — the leg reads `.scope` (back-compat) + `.by`
      // (the retrieval mode). `--by` defaults to `scope` (the pre-existing behavior). VALIDATE fail-CLOSED:
      // an unknown mode yields a structured marshal error, mirroring the emit missing-`--at` guard below.
      const by = (flags["by"] as string | undefined) ?? "scope"
      if (by !== "scope" && by !== "dependency" && by !== "trigger") {
        return { ok: false, error: `query --by must be one of scope|dependency|trigger` }
      }
      return { ok: true, args: { scope: positionals[0], by } }
    }
    case "reconcile":
      // `atlas reconcile <mergeBase>` — the leg reads `mergeBase` + `options?: {acceptReground?}`. There is NO
      // `topic` in the leg's shape, so nothing else is marshalled; `--accept-reground` drives the one option.
      return {
        ok: true,
        args: { mergeBase: positionals[0], options: { acceptReground: flags["accept-reground"] === "true" } },
      }
    case "emit":
      return marshalEmit(positionals, flags)
    case "link":
      return marshalLink(positionals, flags)
    case "memory-emit":
      return marshalMemoryEmit(positionals)
    default:
      // doctor/mine are intercepted before routing; a stray command here fails closed rather than routing blind.
      return { ok: false, error: `command '${command}' has no argument marshaller` }
  }
}

/** The ONLY flag `atlas link` accepts, and the only values that select the retraction MODE. `parse` folds a
 *  bare `--retract` to the string `'true'`, and `--retract=true` arrives as the same string, so ONE literal
 *  covers both spellings a user would reasonably type. */
const LINK_FLAG = "retract"
const LINK_TRUE = "true"

/**
 * `atlas link <a> <b> [--retract]` — the governed sameAs door (WP-SAMEAS / A-D3). The leg reads
 * `{a, b, retract}` (wire.ts). `parse` enforces arity 2, so both positionals are present via the normal flow.
 *
 * `retract` is converted to a REAL boolean because the published input schema (TOOLS-3) declares it as one
 * and the door type-checks declared properties; passing the raw string through would make the CLI fail
 * `malformed-args` on a call MCP accepts — a transport divergence on a governed door.
 *
 * ── WHY THIS DOOR REFUSES WHAT EVERY OTHER COMMAND IGNORES (measured; cold-review finding F4) ─────────────
 * `parse` deliberately never fails on an unknown or oddly-valued flag: an unrecognised `--x` folds into the
 * bag as `'true'` and is dropped by whichever marshaller does not read it (CLI-1b totality). For a READ
 * command that is harmless. For THIS one it silently INVERTED THE MODE — measured through the real parser:
 * `--retract=1`, `--retract=TRUE`, `--retract=false` and the typo `--retracted` every one of them produced
 * `retract: false`, i.e. an ASSERTION. An operator who asked to withdraw an equivalence got `linked: a ≡ b`
 * on screen and a fresh generation published.
 *
 * A governed WRITE door must not silently discard an argument its operator supplied, so this marshaller
 * fails CLOSED on anything it does not recognise, with a structured reason naming the accepted spellings
 * (never a throw — CLI-1b totality is preserved; the refusal is a `MarshalResult`, exit 1). The strictness
 * is scoped to `link` ALONE: no other command's flag handling moves, so no other command's totality
 * semantics change.
 *
 * `--retract=false` is REFUSED rather than read as "assert": the way to not retract is to omit the flag, and
 * refusing a confused invocation on a write door beats guessing which of two opposite acts was meant.
 *
 * NOT CLOSED HERE, and stated rather than left to be discovered: an EXTRA POSITIONAL (`atlas link a b c`) is
 * still silently ignored, since `parse` enforces a minimum arity and this reads only the first two. Same
 * class of defect, not part of the reviewed finding, and tightening arity touches every command's parser
 * contract — recorded for a follow-up rather than widened into this pass.
 */
function marshalLink(positionals: readonly string[], flags: Readonly<Record<string, string>>): MarshalResult {
  for (const name of Object.keys(flags)) {
    if (name !== LINK_FLAG) {
      return {
        ok: false,
        error: `link: unknown flag '--${name}'. The only flag this door accepts is '--retract' (withdraw a previously asserted equivalence); a governed write door does not ignore an argument you supplied`,
      }
    }
  }
  const raw = flags[LINK_FLAG]
  if (raw !== undefined && raw !== LINK_TRUE) {
    return {
      ok: false,
      error: `link: '--retract' is a bare flag — write '--retract' or '--retract=true'; got '--retract=${raw}'. To assert (not retract), omit the flag entirely`,
    }
  }
  return { ok: true, args: { a: positionals[0], b: positionals[1], retract: raw === LINK_TRUE } }
}

/**
 * `atlas emit <factJsonPath> --at <sha>` — the write door via CLI: a templated `GroundedFact` (OR an `atlas
 * draft` envelope — see below) lives in a JSON file (positionals[0]); `at` is the anchor rev the fact must
 * re-derive at (`--at`). Reads + parses the file to the `node`. TOTAL: a missing `--at`, an unreadable file,
 * or malformed JSON fails CLOSED to a structured error — never a throw.
 */
function marshalEmit(positionals: readonly string[], flags: Readonly<Record<string, string>>): MarshalResult {
  const at = flags["at"]
  if (at === undefined || at === "true" || at.length === 0) {
    return { ok: false, error: `emit requires --at <sha>: the anchor rev the fact must re-derive at` }
  }
  const factPath = positionals[0]
  if (factPath === undefined) {
    return { ok: false, error: `emit requires a fact JSON file path (positional 1)` }
  }
  let raw: string
  try {
    raw = readFileSync(factPath, "utf8")
  } catch {
    return { ok: false, error: `emit: cannot read fact file '${factPath}'` }
  }
  let node: unknown
  try {
    node = JSON.parse(raw)
  } catch {
    return { ok: false, error: `emit: fact file '${factPath}' is not valid JSON` }
  }
  return marshalEmitNode(node, at)
}

/**
 * AUTHOR-7b/7c (WP-10.A2-a.CLI): the parsed emit payload accepts a SECOND shape beyond the bare
 * `GroundedFact` this door has always taken — an `atlas draft` envelope (`DraftOut`: `{fact, rev, operation,
 * route, requires?}`), recognised structurally by BOTH `.fact` and `.rev` (no bare `GroundedFact` carries
 * either key at its top level, so this never fires for the pre-existing shape — back-compat exact).
 *
 * When it IS a draft envelope and `--at` names a DIFFERENT rev than the one the draft carries, the mismatch
 * is nameable HERE, before the generic truth gate ever re-derives anything — whose own refusal ("ungrounded:
 * citation does not re-derive at source@sha") would read as a BAD CLAIM when the true cause is a STALE REV
 * (AUTHOR-7's own "rather than attributing the failure to the claim"). `refusal: true` routes this through
 * cli.ts's exit-2 `renderRefusal` path, distinct from every other marshal failure on this door.
 *
 * When the revs MATCH, the envelope is unwrapped to its `.fact` — the round trip AUTHOR-8 describes (draft
 * at R, emit `--at R`) reaches the SAME door a bare fact always did, with no new argument shape for it.
 */
function marshalEmitNode(node: unknown, at: string): MarshalResult {
  if (typeof node === "object" && node !== null && "fact" in node && "rev" in node) {
    const env = node as { readonly fact: unknown; readonly rev: unknown }
    if (typeof env.rev === "string" && env.rev !== at) {
      return {
        ok: false,
        error:
          `rev mismatch: this draft's grounding was computed at rev '${env.rev}' but --at requested '${at}' — ` +
          `a STALE REV, not a bad claim; re-run \`atlas draft\` to re-ground at '${at}' (or emit with --at ${env.rev})`,
        refusal: true,
      }
    }
    return { ok: true, args: { node: env.fact, at } }
  }
  return { ok: true, args: { node, at } }
}

/**
 * `atlas memory-emit <entryJsonPath>` — the WP-11.W8 governed MEMORY write door via CLI: a `MemoryEntry`
 * lives in a JSON file (positionals[0]). No `--at` — memory carries no source@sha anchor requirement; the
 * entry's own DERIVED `kind` (`memoryKindOf`) selects the template gate applies (MEM-1..9). TOTAL: a
 * missing file path, an unreadable file, or malformed JSON fails CLOSED to a structured error — never a
 * throw, mirroring `marshalEmit`.
 */
function marshalMemoryEmit(positionals: readonly string[]): MarshalResult {
  const entryPath = positionals[0]
  if (entryPath === undefined) {
    return { ok: false, error: `memory-emit requires a MemoryEntry JSON file path (positional 1)` }
  }
  let raw: string
  try {
    raw = readFileSync(entryPath, "utf8")
  } catch {
    return { ok: false, error: `memory-emit: cannot read entry file '${entryPath}'` }
  }
  let entry: unknown
  try {
    entry = JSON.parse(raw)
  } catch {
    return { ok: false, error: `memory-emit: entry file '${entryPath}' is not valid JSON` }
  }
  return { ok: true, args: { entry } }
}
