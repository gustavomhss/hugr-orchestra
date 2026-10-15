// @atlas/cli — src/parse.ts  (CLI-1b/1c: the hand-rolled TOTAL argv parser)
//
// argv → a structured `{command, positionals, flags}` OR a structured `ParseError`. Hand-rolled on purpose:
// cac/yargs/commander throw or call `process.exit` on bad input (violating CLI-1c totality). This parser
// NEVER throws and NEVER touches `process.exit` — a malformed invocation fails CLOSED to a `ParseError`.

import { COMMAND_LEG, COMMANDS } from "./map.js"
import type { Command } from "./map.js"

/** A successful parse — the routed command plus its captured positionals/flags. */
export interface ParseOk {
  readonly ok: true
  readonly command: Command
  readonly positionals: readonly string[]
  readonly flags: Readonly<Record<string, string>>
}

/** A structured parse failure — a reason string, never a throw (CLI-1b). */
export interface ParseError {
  readonly ok: false
  readonly error: string
}

export type ParseResult = ParseOk | ParseError

/** The minimum positional arity each command requires (CLI-1b: a missing positional is a parse error).
 *  EXPORTED — `help.ts` (ENTRY-CLI-5) derives the help door's per-command arity line from THIS table, never
 *  a second hand-transcribed count. */
export const ARITY: Record<Command, number> = {
  init: 1, // init <path>
  query: 1, // query <scope>
  emit: 1, // emit <node>
  reconcile: 1, // reconcile <mergeBase>
  doctor: 1, // doctor <scope>
  mine: 1, // mine <repo>
  node: 1, // node <addr>
  link: 2, // link <a> <b> — the two nodeKeys to equate (WP-SAMEAS)
  // `promote` takes NO positional. The repo it promotes in is `process.cwd()` — the same root the entrypoint
  // composes the runtime over — because the staging sidecar it reads and the projection it writes are both
  // under that one composed store. A path argument would let the two disagree (read one repo's candidates,
  // publish into another's knowledge), which is a confusion no gate downstream is positioned to catch.
  promote: 0,
  own: 1, // own <scope> — the scope-unit path the briefing is composed for (RETR-12)
  // `relations <unit> [out|in|both]` — the unit is the only REQUIRED positional; the direction is an OPTIONAL
  // second positional (defaults to `both`, validated by the shared verdict builder), so arity is 1.
  relations: 1,
  // `negations <scope> [--abstained]` — the scope is the only REQUIRED positional; `--abstained` is an
  // OPTIONAL boolean flag (focuses the render on the honest abstentions), so arity is 1 (#99b).
  negations: 1,
  // `transitions <unit>` — the unit lineage key is the only positional (#234, ADR-0015 D4 read door).
  transitions: 1,
  // `transition <unit> <revBefore> <revAfter>` — the unit lineage + the TWO revs it spans are all required
  // positionals, so arity is 3 (#234, ADR-0015 D4 producer).
  transition: 3,
  // `test-vacuities <unit>` — the unit key whose grounded test-vacuity facts to read is the only positional
  // (#95, ADR-0015 D5 read door).
  "test-vacuities": 1,
  // `test-vacuity <path>` — the repo path to scan is the only required positional (like `mine <repo>`, the
  // producer scans the composed `process.cwd()`); arity is 1 (#95, ADR-0015 D5 producer).
  "test-vacuity": 1,
  // `verify-fact <kind> <target> --scope <s> [--world <w>] [--min <n>] [--exact]` — the class and the target
  // symbol are BOTH required positionals (the scope + count bounds ride valued flags), so arity is 2.
  "verify-fact": 2,
  // `verify-store` takes NO positional — same reasoning as `promote`: it re-verifies the WHOLE durable store
  // at `process.cwd()`, the same root the entrypoint composes the runtime over, so a path argument would let
  // the store re-verified diverge from the one every other command reads.
  "verify-store": 0,
  // `derive-relations` takes NO positional — same reasoning as `promote`/`verify-store`: it projects the WHOLE
  // index at `process.cwd()` (the root the entrypoint composes the runtime over) to proven `depends-on`
  // relations and persists them into THAT repo's store, so a path argument would let the index projected diverge
  // from the store written and the one every other command reads (#99 WP-R7).
  "derive-relations": 0,
  // `anchors <path>` — the tree path to list groundable units under is the only required positional (AUTHOR-3/4,
  // ADR-0004 discovery planner); arity is 1. A path outside the tracked set / a non-git dir / an unreadable path
  // is NOT a parse error — it is the leg's honest-empty-with-a-reason answer (never a throw).
  anchors: 1,
  // `slots` takes NO positional — it answers "what can I say?" over the WHOLE closed PredicateSlot vocabulary,
  // never a scoped subset (AUTHOR-5, WP-10.A2-a.CLI).
  slots: 0,
  // `draft <anchor> <slot> <claim>` — EXACTLY the three fields AUTHOR-6d says the author supplies; arity 3
  // (WP-10.A2-a.CLI). Every other field of the composed fact is computed or defaulted, never a positional here.
  draft: 3,
  // `check <anchor> <slot> <claim>` — the SAME three author fields as `draft`; `atlas check` composes the
  // candidate through the draft planner then dry-runs the emit gate chain over it (WP-10.A3.CLI, AUTHOR-11/12).
  check: 3,
  // `memory-emit <entryJsonPath>` — the MemoryEntry JSON file path is the only positional (WP-11.W8); no
  // `--at` (memory carries no source@sha anchor requirement).
  "memory-emit": 1,
  // `memory-recall [--owner o] [--kind k] [--task-id t] [--pr-id p]` — MEM-4b's explicit-consult path takes
  // NO positional; the query is built entirely from optional valued flags.
  "memory-recall": 0,
  // `memory-header` — the composed actor's running-turn header; no positional (MEM-1/4/7).
  "memory-header": 0,
  // `memory-awareness` — the SHARED Awareness slab; no positional (MEM-11/12).
  "memory-awareness": 0,
  // `memory-orientation` — the SHARED Orientation slab; no positional (MEM-6).
  "memory-orientation": 0,
  // `budget` — the RETR-8 per-kind calibration ledger; no positional (WP-3-RETR).
  budget: 0,
  // `territories` — the RETR-13 per-territory off-atlas MISS-oracle; no positional (WP-3-RETR).
  territories: 0,
  // `export <outDir>` — the output DIRECTORY the OKF bundle file is written into (`<outDir>/atlas-okf.json`);
  // the store dumped is ALWAYS the composed `process.cwd()` (the SAME repo every other command reads), so a
  // path argument cannot let the exported store diverge from the live one (EPIC-1-b PERSIST-9). Arity is 1.
  export: 1,
  // `import <bundle> <targetDir>` — the bundle FILE path + the FRESH EMPTY store target directory to replay
  // into (EPIC-1-b PERSIST-9). A target that already hosts a store is REFUSED by the leg, not merged with.
  // Exactly TWO positionals.
  import: 2,
}

// [ENTRY-CLI-5 clean-up] this used to be a HAND-TRANSCRIBED string literal — a second copy of `COMMANDS`
// (map.ts), three feet from the array that already enumerates the surface, and exactly the smell that made
// `COMMAND_LEG`'s own count-in-a-comment wrong twice (map.ts:63-65). DERIVED now: an error message built
// from this is automatically current the moment a command joins `COMMANDS`, never a second list to remember.
const COMMAND_LIST = COMMANDS.join("|")

function isCommand(s: string): s is Command {
  return Object.prototype.hasOwnProperty.call(COMMAND_LEG, s)
}

/**
 * Flags that carry a VALUE token, accepting both the joined `--flag=v` and the space `--flag v` forms.
 * Valued today: `--at`/`--by` (emit anchor rev / query axis), `--scope`/`--world`/`--min` (verify-fact's
 * claim scope, completeness world, and count lower bound), and `--owner`/`--kind`/`--task-id`/`--pr-id`
 * (WP-11.W8 — `memory-recall`'s MEM-4b query selectors). Everything else stays a bare boolean. Any unknown
 * flag simply folds into the bag (a bare `--x` becomes `'true'`) — never a parse error, preserving totality.
 *  EXPORTED — `help.ts` (ENTRY-CLI-5) lists these as the flags help names, rather than a second hand-
 *  transcribed set. */
export const VALUED_FLAGS = new Set(["at", "by", "scope", "world", "min", "owner", "kind", "task-id", "pr-id"])

/**
 * Fold one `-x`/`--x`/`--x=y`/`--x y` token into the flag bag — a bare flag is `'true'`. For a VALUED flag in
 * the space form (`--at <v>`), the following token `next` is consumed as the value; the return is the number of
 * EXTRA tokens consumed (0, or 1 when a valued flag swallowed its value). Never throws. The value is only
 * consumed when `next` is a real value token (not another flag / not absent) — so a following positional that
 * belongs to a non-valued flag is never swallowed and totality is preserved (a valueless `--at` folds to
 * `'true'`, which the emit marshaller rejects as a missing `--at`).
 */
function foldFlag(tok: string, next: string | undefined, flags: Record<string, string>): number {
  const body = tok.replace(/^-+/, "")
  const eq = body.indexOf("=")
  if (eq >= 0) {
    flags[body.slice(0, eq)] = body.slice(eq + 1)
    return 0
  }
  if (VALUED_FLAGS.has(body) && next !== undefined && !next.startsWith("-")) {
    flags[body] = next
    return 1
  }
  flags[body] = "true"
  return 0
}

/**
 * Parse `argv` TOTALLY. Failures: empty argv, a flag where the command belongs, an unknown command, or a
 * missing positional. Every failure is a `ParseError` — never a throw, never `process.exit`. Unknown flags
 * are never a failure — they fold into the flag bag and are ignored by the marshallers that do not read them.
 */
export function parse(argv: readonly string[]): ParseResult {
  if (argv.length === 0) {
    return { ok: false, error: `no command: expected one of ${COMMAND_LIST}` }
  }
  const cmd = argv[0]
  if (cmd === undefined || cmd.startsWith("-")) {
    return { ok: false, error: `no command: the first argument is a flag — expected one of ${COMMAND_LIST}` }
  }
  if (!isCommand(cmd)) {
    return { ok: false, error: `unknown command '${cmd}': expected one of ${COMMAND_LIST}` }
  }

  const positionals: string[] = []
  const flags: Record<string, string> = {}
  const rest = argv.slice(1)
  for (let i = 0; i < rest.length; i++) {
    const tok = rest[i]
    if (tok === undefined) continue
    if (tok.startsWith("-")) i += foldFlag(tok, rest[i + 1], flags)
    else positionals.push(tok)
  }

  // missing positional
  const need = ARITY[cmd]
  if (positionals.length < need) {
    return {
      ok: false,
      error: `command '${cmd}' requires ${need} positional argument(s), got ${positionals.length}`,
    }
  }

  return { ok: true, command: cmd, positionals, flags }
}
