# B-L API · the review log and the CLI room (contract for lanes B-K and B-O)

Frozen by the B-L lane briefs. Lanes B-K and B-O build on exactly this. If a B-K or B-O brief needs something this file
does not give, that is a brief defect: stop and report it.

Paths are relative to `modules/atlas/`.

## 1. The review log (`packages/adapter-io/src/review-log.ts`, task B-L02)

The file is `.atlas/review.jsonl` under the repository root. Each line is a kernel `Event` (the same line form as
`.atlas/memory.jsonl`), written through `createDurableLog` (`durable-log.ts`): `payload` is the record without its `id`,
`contentHash` is the record id. Nobody reads or writes the file except through these four functions.

Exported from the `@atlas/adapter-io` barrel (`packages/adapter-io/src/index.ts`):

```ts
export type ReviewTier = "T1" | "T0"

export type ReviewBody =
  | { readonly kind: "hold"; readonly nodeKey: string }
  | { readonly kind: "release"; readonly nodeKey: string }
  | { readonly kind: "proposal"; readonly nodeKey: string; readonly toTier: ReviewTier; readonly reason: string }
  | { readonly kind: "decision"; readonly proposalId: string; readonly verdict: "ratified" | "rejected"; readonly reason: string }
  | {
      readonly kind: "answer"
      readonly questionId: string
      readonly answer: string
      readonly drafted?: { readonly model: string; readonly why: string }
    }
  | { readonly kind: "memory-proposal"; readonly member: string; readonly rule: string; readonly scope: string }
  | {
      readonly kind: "memory-decision"
      readonly proposalId: string
      readonly verdict: "indexed" | "discarded"
      readonly rule?: string
      readonly scope?: string
    }

/** What a caller appends: the body plus when (ISO-8601 UTC, `new Date().toISOString()`) and who. */
export type ReviewInput = ReviewBody & { readonly at: string; readonly by: string }

/** What a read returns: the input plus its id (the kernel content hash of the input). */
export type ReviewRecord = ReviewInput & { readonly id: string }

/** The record type of one kind, e.g. `ReviewOf<"proposal">`. */
export type ReviewOf<K extends ReviewBody["kind"]> = Extract<ReviewRecord, { readonly kind: K }>

export interface ReviewRead {
  readonly records: readonly ReviewRecord[] // file order
  readonly rejected: number // lines that did not verify (torn, edited, not a review record)
  readonly unreadable?: true // the file exists and could not be read at all
}

export interface ReviewFold {
  readonly held: ReadonlySet<string> // nodeKeys whose latest hold/release (by `at`, file order breaks ties) is a hold
  readonly openProposals: readonly ReviewOf<"proposal">[] // proposals with no decision naming their id, file order
  readonly decisions: readonly ReviewOf<"decision">[] // every decision, file order
  readonly answers: ReadonlyMap<string, ReviewOf<"answer">> // questionId → latest answer (by `at`)
  readonly openMemoryProposals: readonly ReviewOf<"memory-proposal">[] // no memory-decision names their id
  readonly memoryDecisions: readonly ReviewOf<"memory-decision">[] // every memory decision, file order
}

export const reviewLogPath: (repoPath: string) => string // join(repoPath, ".atlas", "review.jsonl")
export function appendReview(repoPath: string, input: ReviewInput): ReviewRecord
export function readReview(repoPath: string): ReviewRead
export function foldReview(records: readonly ReviewRecord[]): ReviewFold
```

Rules every caller relies on:

- `appendReview` throws `Error("review-log: refusing to append a malformed '<kind>' record")` when the input does not
  match its kind (an empty string field, a `toTier` other than T1/T0, a bad verdict). Callers validate first; the throw
  is a defect path, never a user path.
- The record id is `String(id(input))` with `id` from `@atlas/kernel`, over the input with only its known fields. The
  same input appended twice is one record. `at` is part of the hashed content.
- A missing file reads as `{ records: [], rejected: 0 }`.
- A caller that DECIDES something from the fold (promote skipping held rows, decide finding an open proposal) must
  refuse when `rejected > 0` or `unreadable` is set. The CLI does this through `foldOrRefuse` (section 3).
- Never use the field names `status`, `grounding` or `freshness` in a record: the kernel hash drops them.

## 2. The lane command tables (task B-L01)

`cli.ts` sits at its godfile waiver (625 lines). New commands add no line to it. Since B-L01, `main` looks the parsed
command up in two tables before its own interceptors (right after the `mine` block):

```ts
const laneRunner = REVIEW_COMMANDS[command] ?? OPS_COMMANDS[command]
if (laneRunner !== undefined) return laneRunner({ positionals, flags, deps })
```

Types, in `packages/cli/src/cli-dispatch.ts`:

```ts
export interface CommandInput {
  readonly positionals: readonly string[]
  readonly flags: Readonly<Record<string, string>>
  readonly deps: CliDeps
}
export type CommandRunner = (input: CommandInput) => number | Promise<number>
export type CommandTable = Readonly<Partial<Record<string, CommandRunner>>>
```

| Table | File | Owner lane | Commands |
|---|---|---|---|
| `REVIEW_COMMANDS` | `packages/cli/src/review-cli.ts` | B-K | hold, release, propose, proposals, decide, interview, answer |
| `OPS_COMMANDS` | `packages/cli/src/ops-cli.ts` | B-O | territory, own-export, repair (and any other B-O command) |

The tables are keyed by plain strings on purpose. A key that is not yet in `COMMANDS` is unreachable (`parse` refuses
an unknown command before dispatch), so a runner can land and be tested before its command is published. This is what
lets every task keep all Atlas guards green: `command-doc-guard` needs the docs page in the same commit as the
`COMMANDS` entry, and `reference-model-guard` needs every new module to have a production caller (the table is that
caller).

A runner returns the process exit code: build a `CliVerdict` (`render.ts`) and pass it to `emitCli` (`cli-verdict.ts`).
Exit codes: 0 ok, 1 usage error (`renderVerdict(errorVerdict(msg))`), 2 governed refusal
(`renderRefusal(refusalVerdict(msg))`). A runner never reads `process.env` (only `compose.ts` may; `help-cli.test.ts`
pins that) and never edits `compose.ts` (597 lines, no room). When a runner needs a store it builds one through an
adapter-io helper, exactly as `awareness-store.ts` `constitutionInput` does:
`createDiskStore(join(repoPath, CAS_REL), () => headSha(repoPath), gitSidecarTrust(repoPath))`.

## 3. Shared CLI helpers (`packages/cli/src/review-common.ts`, lane B-K)

Created by B-R2-01b and extended by B-R2-02a and B-R3-01. B-O may import these; it must not edit the file.

```ts
export function governedRefusal(message: string): CliVerdict // exit 2 (B-R2-01b)
export function foldOrRefuse(repoPath: string): { readonly fold: ReviewFold } | { readonly refusal: CliVerdict } // (B-R2-01b)
export const REVIEW_INVARIANT: string // (B-R2-02a)
export function reviewOutcome(next: string, lines: readonly string[]): CliVerdict // exit 0 (B-R2-02a)
export function usageError(message: string): CliVerdict // exit 1 (B-R2-02a)
export function requireBy(flags: Readonly<Record<string, string>>): string | undefined // the --by actor (B-R2-02a)
export function resolveId(ids: readonly string[], wanted: string): string | undefined // exact id or unique prefix ≥ 8 (B-R3-01)
```

Every review write takes the actor from `--by <actor>` (already a valued flag in `parse.ts`) and is refused without it.

## 4. How a command is published (the surface recipe)

After its runner is in a lane table, a command is published in ONE task that edits these places together. Each lane
inserts at its own fixed anchor so the two lanes never edit adjacent lines.

| # | File | What | B-K anchor (insert after) | B-O anchor (insert after) |
|---|---|---|---|---|
| 1 | `packages/cli/src/map.ts` `COMMANDS` (line 69) | the name | the last B-K name already present; the first B-K task uses `  "promote",` | `  "import",` (then the last B-O name) |
| 2 | `packages/cli/src/map.ts` `COMMAND_LEG` (line 127) | `name: "<leg>", // <why>` | the `promote:` entry (3 lines, ends `//                        through THIS leg's own door — the same \`createGovernedEmit\` \`wire.ts\` binds`), then the last B-K entry | the `import:` entry (5 lines, the last is `  //                       read by \`authorityOf\` (WRITE_PATHS), with the page stating the honest write it does.`), i.e. directly before the map's closing `}` |
| 3 | `packages/cli/src/parse.ts` `ARITY` (line 29) | `name: <n>, // <usage>` | `  promote: 0,` (then the last B-K entry) | `  import: 2,` |
| 4 | `packages/cli/src/parse.ts` `VALUED_FLAGS` (line 130) | only for a new valued flag | B-K adds none | B-O appends its flags at the end of the array literal |
| 5 | `packages/cli/test/wp-9.1.1-a-cli.test.ts` | the `COMMANDS` `toEqual` list (line 73), the `COMMAND_LEG` `toEqual` map (line 108), and the sorted `writers` list (line 238, alphabetical) when the leg is a `WRITE_PATHS` door | after `      "promote",` / the one-line `promote:` entry (then the last B-K one) | after `      "import",` / the 3-line `import:` entry (last line `//                       guarded projection is NEVER written); no governed fact-write token`) |
| 6 | `docs/reference/commands/<name>.md` | the page; no fenced block may contain a line starting `$ ` with `atlas` in it, or a line `status: ok`/`status: error`/`status: rejected` (`doc-transcript-guard` would try to re-run it); no "single write door", "four tools", "four-leg" or "no fifth" wording (`spec-conformance-guard`) | new file | new file |
| 7 | `README.md` command table (between `<!-- command-table:begin -->` and `<!-- command-table:end -->`) | one padded row per command (columns 70 / 9 / 106 / 60 characters between the pipes) | the `` `atlas promote …` `` row (then the last B-K row) | the `` `atlas reconcile …` `` row (the last row) |
| 8 | `README.md` transport-parity bullet (between `<!-- transport-parity:begin -->` and `:end -->`) | raise `The CLI exposes **N** commands` by k; raise `The remaining N commands are CLI-only` by k; append the names, backticked, at the END of the CLI-only list | same | same |
| 9 | `README.md` package line `cli             the \`atlas\` CLI — N commands through a total argv parser` | raise N by k | same | same |

A command that is not an MCP tool (every B-K and B-O command) is CLI-only, so it goes into the CLI-only list.
`COMMAND_LEG` classification: a command that only appends to the review log or writes a file binds `"atlas-query"`
(the `export` precedent: it writes a file and no store); a command that publishes knowledge through the governed emit
door binds `"atlas-emit"` and joins the `writers` list in the test.

Rows 8 and 9 and the `reference-model-guard.mjs` DECLARED COUNTS header line (section 5) are single lines that both lanes
change. They cannot be given distinct anchors; see `specs/atlas-ui/build/issues/b-l-k.md` for the merge rule.

## 5. reference-model-guard ledger moves in lane B-L/B-K

`harness/gates/reference-model-guard.mjs` line 21 reads `//   declared-modules: 40 · dead-value-exports: 145 · type-reachable: 4`.
Each task below changes it by a DELTA; a task that finds other numbers applies the same delta to what it finds.

| Task | Row | declared-modules | dead-value-exports |
|---|---|---|---|
| B-L02 | add `packages/adapter-io/src/review-log.ts` (values 4) | +1 | +4 |
| B-R2-01b | delete that row (the promote dispatch reads the log) | −1 | −4 |
| B-R11-01 | add `packages/genesis/src/open-questions.ts` (values 2) | +1 | +2 |
| B-R11-02a | delete that row AND the `packages/genesis/src/align.ts` row (values 7) | −2 | −9 |

## 6. Ownership of shared files across lanes

- `packages/adapter-io/src/index.ts`: B-L02 adds the review-log exports right below
  `export type { DurableMemory, MemoryRead } from "./memory-store.js"`; B-K adds its exports directly below the
  review-log lines; B-O appends its exports at the END of the file.
- `packages/cli/src/cli.ts`: after B-L01 only B-R2-01b edits it (the `promote` line and the `CliDeps.promote` type).
  Nobody else adds lines.
- `packages/cli/src/cli-dispatch.ts`: after B-L01 only B-R2-01b edits it (`dispatchPromote`).
