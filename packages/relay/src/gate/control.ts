export * as GateControl from "./control"

import { stat } from "node:fs/promises"
import { Effect, Option, Schema } from "effect"
import type { RelayLedger } from "@opencode-ai/schema/relay-ledger"
import type { RelaySprint } from "@opencode-ai/schema/relay-sprint"
import { GateDiff } from "./diff"
import { GateShell } from "./shell"
import { JudgeConfig } from "../judge/config"

// The gate core (`relay_run_checklist` and its helpers in lib/relay-gate.sh; WP3).

// A plan defect that stops the evaluation before the control runs: an invalid control ID or assertion, or a
// checklist that is neither an array nor null. Earlier verdicts stay recorded.
export class PlanError extends Schema.TaggedErrorClass<PlanError>()("GateControl.PlanError", {
  message: Schema.String,
}) {}

export interface ChecklistInput {
  readonly sprint: RelaySprint.Sprint
  readonly index: number
  readonly workdir: string
  // The ref the WP was entered at; absent or invalid makes every `diff` control `judge:unavailable(no-diff)`.
  readonly baseRef?: string
  // `${name}` values for context and scope paths, and the check environment.
  readonly params: Readonly<Record<string, string>>
  // `host_check` controls are skipped for the arm to grade, or failed unrecorded by a dry check that cannot run them.
  readonly hostCheck?: "skip" | "fail"
}

/** One graded control, before the caller adds `ts`, `arm`, `wp`, `i`, `macro` and `kind`. */
export interface Verdict {
  readonly item: string
  readonly assert: string
  readonly verdict: "pass" | "fail"
  readonly graded_by: RelayLedger.GradedBy
  readonly oracle: RelayLedger.Oracle
  readonly origin: string
  readonly scope?: string
  readonly artifact?: string
}

export interface ChecklistResult {
  // Failing control IDs in declared order: deterministic failures, blocking judge failures and named plan failures.
  readonly failing: ReadonlyArray<string>
  readonly verdicts: ReadonlyArray<Verdict>
}

/**
 * Runs the selected WP's checklist in declared order without short-circuiting. A nonempty `cmd` wins over `judge`;
 * a `host_check` control is graded by the arm, not here. `record` runs after each verdict and before the next control,
 * so a failed record stops the checklist like `ledger_item || return 1`.
 */
export const run = <E, R>(
  input: ChecklistInput,
  record: (verdict: Verdict) => Effect.Effect<void, E, R>,
): Effect.Effect<ChecklistResult, PlanError | E, R | GateShell.Service | GateShell.Git | JudgeConfig.Service> =>
  Effect.gen(function* () {
    const controls = yield* checklist(input)
    const failing: string[] = []
    const verdicts: Verdict[] = []
    yield* Effect.forEach(
      controls,
      (control, j) =>
        Effect.gen(function* () {
          const graded = yield* grade(input, control, j)
          if (graded.fails) failing.push(graded.id)
          if (!graded.verdict) return
          verdicts.push(graded.verdict)
          yield* record(graded.verdict)
        }),
      { discard: true },
    )
    return { failing, verdicts }
  })

// `${name}` from `params` by substitution, never by shell evaluation; unset names stay literal. Replacements are never
// rescanned, which is what the bash loop's right-to-left rewrite amounts to.
export const expandParams = (text: string, params: Readonly<Record<string, string>>): string =>
  text.replace(/\$\{([a-zA-Z_][a-zA-Z0-9_]*)\}/g, (literal, name: string) =>
    Object.hasOwn(params, name) ? params[name]! : literal,
  )

// The oracle sha: the command, or the criterion plus ` :: <space-joined paths>` before expansion.
export const oracleSha = (text: string): string => sha256(text)

// Explicit `origin`, otherwise `policy:<policy>`, otherwise `sprint`.
export const controlOrigin = (control: RelaySprint.Control): string => {
  const origin = substitution(raw(field(control, "origin")))
  if (origin) return origin
  const policy = substitution(raw(field(control, "policy")))
  if (policy) return `policy:${policy}`
  return "sprint"
}

/**
 * The artifact digest of a judge scope: per space-split path `<path>:<sha256>\n`, or `<path>:absent\n` when it is not
 * a readable file, hashed once more. None for an empty scope.
 */
export const artifactSha = (paths: string, workdir: string): Effect.Effect<Option.Option<string>> =>
  Effect.gen(function* () {
    if (paths === "") return Option.none()
    // Word splitting only: bash also globbed these words against the hook's cwd (PARITY-EXCEPTIONS WP3-2).
    const lines = yield* Effect.forEach(GateDiff.words(paths), (path) =>
      Effect.promise(async () => {
        const file = `${workdir}/${path}`
        if (
          !(await stat(file).then(
            (info) => info.isFile(),
            () => false,
          ))
        )
          return `${path}:absent\\n`
        // `[ -f ]` passed but `shasum < file` could not read: bash recorded an empty digest.
        const bytes = await Bun.file(file)
          .bytes()
          .catch(() => undefined)
        return `${path}:${bytes ? sha256(bytes) : ""}\\n`
      }),
    )
    // The accumulator went through `printf '%b'`, so escapes in a path name are interpreted too.
    return Option.some(sha256(printfB(lines.join(""))))
  })

/** `relay_json_string` over a decoded value: null is "", a NUL-free string is itself, anything else is invalid. */
export const text = (value: unknown): string | undefined => {
  if (value === undefined || value === null) return ""
  if (typeof value !== "string" || value.includes("\u0000")) return undefined
  return value
}

/** The `fails` string the gate prints: `; <id>` per failing control, with trailing LF lost to `$(…)`. */
export const fails = (failing: ReadonlyArray<string>) =>
  failing
    .map((id) => `; ${id}`)
    .join("")
    .replace(/\n+$/, "")

export interface Envelope {
  // Absent on CLI lines; the arm always sets it.
  readonly arm?: string
  readonly wp: string
  readonly i: number
  readonly macro?: string
  readonly kind?: RelayLedger.RecordedKind
}

/** The `checklist-item` body in the oracle's key order, without `ts` (the arm prepends it at flush). */
export const body = (envelope: Envelope, verdict: Verdict) => ({
  ...(envelope.arm === undefined ? {} : { arm: envelope.arm }),
  wp: envelope.wp,
  i: envelope.i,
  event: "checklist-item" as const,
  item: verdict.item,
  assert: verdict.assert,
  verdict: verdict.verdict,
  graded_by: verdict.graded_by,
  oracle: verdict.oracle,
  origin: verdict.origin,
  ...(verdict.scope === undefined ? {} : { scope: verdict.scope }),
  ...(verdict.artifact === undefined ? {} : { artifact: verdict.artifact }),
  ...(envelope.macro ? { macro: envelope.macro } : {}),
  ...(envelope.kind ? { kind: envelope.kind } : {}),
})

interface Graded {
  readonly id: string
  readonly fails: boolean
  readonly verdict?: Verdict
}

function checklist(input: ChecklistInput): Effect.Effect<ReadonlyArray<unknown>, PlanError> {
  const value = field(input.sprint.work_packages[input.index], "checklist")
  if (value === undefined || value === null) return Effect.succeed([])
  if (Array.isArray(value)) return Effect.succeed(value)
  return Effect.fail(
    new PlanError({ message: `relay: work_packages[${input.index}].checklist must be an array or null` }),
  )
}

const grade = (input: ChecklistInput, control: unknown, j: number) =>
  Effect.gen(function* () {
    const id = text(field(control, "id"))
    if (!id)
      return yield* new PlanError({
        message: `relay: work_packages[${input.index}].checklist[${j}] has invalid id (expected a nonempty NUL-free string)`,
      })
    const declared = field(control, "assert")
    const assertion = text(declared === undefined || declared === null || declared === false ? id : declared)
    if (assertion === undefined)
      return yield* new PlanError({
        message: `relay: checklist ${id} has invalid assertion (expected a NUL-free string)`,
      })
    const host = field(control, "host_check")
    if (host !== undefined && host !== null) return { id, fails: input.hostCheck === "fail" }
    const origin = controlOrigin(control as RelaySprint.Control)
    const graded = (
      verdict: Verdict["verdict"],
      graded_by: Verdict["graded_by"],
      oracle: string,
      fails: boolean,
      scope = "",
      artifact = Option.none<string>(),
    ): Graded => ({
      id,
      fails,
      verdict: {
        item: id,
        assert: assertion,
        verdict,
        graded_by,
        oracle,
        origin,
        ...(scope ? { scope } : {}),
        ...(Option.isSome(artifact) ? { artifact: artifact.value } : {}),
      },
    })

    const cmd = text(field(control, "cmd"))
    if (cmd === undefined) return graded("fail", "unavailable(invalid-command)", "", true)
    if (cmd) {
      const shell = yield* GateShell.Service
      const ran = yield* Effect.result(shell.run({ program: cmd, cwd: input.workdir, env: input.params }))
      if (ran._tag === "Failure") return graded("fail", `unavailable(${ran.failure.reason})`, oracleSha(cmd), true)
      const pass = ran.success.exitCode === 0
      return graded(pass ? "pass" : "fail", "deterministic", oracleSha(cmd), !pass)
    }

    const criterion = text(field(control, "judge"))
    if (!criterion) return graded("fail", "judge:unavailable(invalid-criterion)", "", true)
    const blocking = field(control, "blocking") === true
    const scope = scopeText(field(control, "paths"))
    if (scope === undefined) return graded("fail", "judge:unavailable(invalid-scope)", "", true)
    // The oracle and the ledger hold the raw scope: `${spec_dir}/x.json` is the same question in every run.
    const oracle = oracleSha(scope ? `${criterion} :: ${scope}` : criterion)
    const scopePaths = substitution(expandParams(scope, input.params))
    const artifact = yield* artifactSha(scopePaths, input.workdir)
    const files = yield* Effect.forEach(contextNames(field(control, "context")), (name) =>
      readContext(`${input.workdir}/${substitution(expandParams(name, input.params))}`),
    )
    if (field(control, "diff") === true) {
      const diff = yield* GateDiff.compute({ workdir: input.workdir, baseRef: input.baseRef, pathspec: scopePaths })
      // Fail closed, but an advisory control that cannot run still only advises.
      if (Option.isNone(diff)) return graded("fail", "judge:unavailable(no-diff)", oracle, blocking, scope, artifact)
      files.push({ name: GateDiff.NAME, text: newlines(diff.value) })
    }
    const judge = yield* JudgeConfig.Service
    const response = yield* judge.judge({ criterion, files })
    // Exactly a pass/fail verdict with a NUL-free string backend; anything else is unavailable, never a pass.
    const backend = response.verdict === "pass" || response.verdict === "fail" ? text(response.backend) : undefined
    const pass = backend !== undefined && response.verdict === "pass"
    return graded(
      pass ? "pass" : "fail",
      `judge:${backend === undefined ? "unavailable(invalid-response)" : backend || "judge"}(non-independent)`,
      oracle,
      blocking && !pass,
      scope,
      artifact,
    )
  })

function field(value: unknown, key: string): unknown {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return undefined
  return Object.hasOwn(value, key) ? (value as Record<string, unknown>)[key] : undefined
}

// `jq -r` of one value behind `// empty`, which drops null and false.
function raw(value: unknown) {
  if (value === undefined || value === null || value === false) return ""
  return printed(value)
}

function printed(value: unknown) {
  if (typeof value === "string") return value
  return JSON.stringify(value)
}

// What `$(…)` keeps of a printed value: NUL bytes are dropped and trailing LF is stripped.
function substitution(value: string) {
  return value.replaceAll("\u0000", "").replace(/\n+$/, "")
}

function scopeText(paths: unknown) {
  if (paths === undefined || paths === null) return ""
  if (!Array.isArray(paths) || !paths.every((path) => typeof path === "string")) return undefined
  return text(paths.join(" "))
}

// `.context // empty | if type == "array" then .[] else . end`, printed raw and read back line by line.
function contextNames(context: unknown) {
  return (Array.isArray(context) ? context.map(printed) : [raw(context)])
    .flatMap((value) => value.replaceAll("\u0000", "").split("\n"))
    .filter(Boolean)
}

// judge.py reads each file in text mode: strict UTF-8 and universal newlines. A missing, unreadable or undecodable
// file has no text (PARITY-EXCEPTIONS WP3-5). The judge sees the basename.
function readContext(file: string): Effect.Effect<JudgeConfig.File> {
  return Effect.promise(() =>
    Bun.file(file)
      .bytes()
      .catch(() => undefined),
  ).pipe(
    Effect.map((bytes) => {
      const decoded = bytes ? GateDiff.utf8(bytes) : Option.none<string>()
      const name = file.slice(file.lastIndexOf("/") + 1)
      return Option.isSome(decoded) ? { name, text: newlines(decoded.value) } : { name }
    }),
  )
}

function newlines(value: string) {
  return value.replace(/\r\n?/g, "\n")
}

function sha256(value: string | Uint8Array) {
  return new Bun.CryptoHasher("sha256").update(value).digest("hex")
}

// bash `printf '%b'` (`bexpand`): the backslash escapes below, `\c` ends all output, anything else stays as written.
// Every escape is ASCII, so the UTF-8 bytes are processed as a binary string. `\u` and `\U` are encoded as UTF-8
// including surrogates and values past U+10FFFF, as bash 5 does in a UTF-8 locale (PARITY-EXCEPTIONS WP3-7).
const ESCAPE =
  /\\(?:([\\abeEfnrtv])|(0[0-7]{0,3}|[1-7][0-7]{0,2})|x([0-9A-Fa-f]{1,2})|u([0-9A-Fa-f]{1,4})|U([0-9A-Fa-f]{1,8})|(c))/g
const CONTROL: Record<string, number> = { "\\": 92, a: 7, b: 8, e: 27, E: 27, f: 12, n: 10, r: 13, t: 9, v: 11 }

function printfB(value: string) {
  const binary = Array.from(new TextEncoder().encode(value), (byte) => String.fromCharCode(byte)).join("")
  const stop = [...binary.matchAll(ESCAPE)].find((match) => match[6])?.index ?? binary.length
  const expanded = binary
    .slice(0, stop)
    .replace(ESCAPE, (_, control?: string, octal?: string, hex?: string, short?: string, long?: string) => {
      if (control) return String.fromCharCode(CONTROL[control]!)
      if (octal) return String.fromCharCode(parseInt(octal, 8) & 0xff)
      if (hex) return String.fromCharCode(parseInt(hex, 16))
      return utf8Sequence(parseInt(short ?? long!, 16))
        .map((byte) => String.fromCharCode(byte))
        .join("")
    })
  return Uint8Array.from(expanded, (char) => char.charCodeAt(0))
}

// bash `u32toutf8`: the original UTF-8 scheme up to six bytes, nothing past 0x7fffffff.
function utf8Sequence(code: number) {
  if (code < 0x80) return [code]
  const length = [0x800, 0x10000, 0x200000, 0x4000000, 0x80000000].findIndex((limit) => code < limit) + 2
  if (length === 1) return []
  const tail = Array.from({ length: length - 1 }, (_, k) => 0x80 | ((code >>> (6 * (length - 2 - k))) & 0x3f))
  return [((0xff00 >> length) & 0xff) | (code >>> (6 * (length - 1))), ...tail]
}
