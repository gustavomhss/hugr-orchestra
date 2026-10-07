export * as ArmRound from "./round"

import { createHash, randomUUID } from "node:crypto"
import { Clock, Effect, Exit, Result, Schema } from "effect"
import { RelayArm } from "@orchestra/schema/relay-arm"
import type { RelayLedger } from "@orchestra/schema/relay-ledger"
import type { RelaySprint } from "@orchestra/schema/relay-sprint"
import { GateControl } from "../gate/control"
import { GateShell } from "../gate/shell"
import type { JudgeConfig } from "../judge/config"
import { RelayJson } from "../json"
import { LedgerChain } from "../ledger/chain"
import { LedgerRead } from "../ledger/read"

// One round of verdicts (WP6): the current gate's controls and the regression re-runs of accepted earlier work,
// buffered as unstamped compact lines. An identical failing round is recorded once in full, then counted under its
// sha as `gate-fail-repeat`.

// A plan the hook could not have graded (it exits 1), or a revision the round cannot be bound to.
export class Defect extends Schema.TaggedErrorClass<Defect>()("ArmRound.Defect", { reason: Schema.String }) {}

export interface Input {
  readonly token: RelayArm.Token
  readonly workdir: string
  readonly params: Readonly<Record<string, string>>
  readonly hostChecks?: ReadonlyMap<RelaySprint.Id, RelayArm.HostCheck>
  readonly meta: RelayArm.Meta
  // HEAD before the checks, when the revision guard read it.
  readonly revision?: string
}

// The envelope every buffered line carries: `macro` and `kind` only when set.
export interface Owner {
  readonly wp: string
  readonly i: number
  readonly macro: string
  readonly kind: string
}

export interface Graded {
  readonly lines: ReadonlyArray<string>
  // Failing control IDs in declared order.
  readonly failing: ReadonlyArray<string>
  // One result per bound host check; an unbound one fails closed and has none.
  readonly results: ReadonlyArray<RelayArm.HostCheckResult>
  readonly unbound: ReadonlyArray<string>
}

/**
 * The current WP's checklist in declared order. Each control goes through the gate core on its own, so a `host_check`
 * control is graded here between its neighbours and the round keeps the declared order.
 */
export const grade = (
  input: Input,
  owner: Owner,
  baseRef: string,
  checklist: ReadonlyArray<unknown>,
): Effect.Effect<
  Graded,
  GateControl.PlanError | RelayJson.EncodeError,
  GateShell.Service | GateShell.Git | JudgeConfig.Service
> =>
  Effect.gen(function* () {
    const lines: string[] = []
    const failing: string[] = []
    const results: RelayArm.HostCheckResult[] = []
    const unbound: string[] = []
    const envelope = { arm: input.token, wp: owner.wp, i: owner.i, ...labels(owner) }
    yield* Effect.forEach(
      checklist,
      (control) =>
        Effect.gen(function* () {
          const verdicts: GateControl.Verdict[] = []
          const sprint = { work_packages: [{ id: owner.wp, checklist: [control] }] } as unknown as RelaySprint.Sprint
          const run = yield* GateControl.run(
            { sprint, index: 0, workdir: input.workdir, baseRef, params: input.params, hostCheck: "skip" },
            (verdict) => Effect.sync(() => void verdicts.push(verdict)),
          )
          failing.push(...run.failing)
          for (const verdict of verdicts) lines.push(yield* RelayJson.compact(GateControl.body(envelope, verdict)))
          const host = field(control, "host_check")
          if (host === undefined || host === null) return
          const name = typeof host === "string" ? host : JSON.stringify(host)
          const checked = yield* hostCheck(input, owner.wp, control, name)
          if (checked.verdict.verdict === "fail") failing.push(checked.verdict.item)
          if (checked.result === undefined) unbound.push(checked.verdict.item)
          if (checked.result !== undefined) results.push(checked.result)
          const provenance = checked.result?.provenance
          lines.push(
            yield* RelayJson.compact({
              ...GateControl.body(envelope, checked.verdict),
              host_check: name,
              ...(provenance?.revision === undefined ? {} : { revision: provenance.revision }),
              ...(provenance === undefined ? {} : { event_id: provenance.eventID }),
            }),
          )
        }),
      { discard: true },
    )
    return { lines, failing, results, unbound }
  })

/**
 * Keep-best: earlier gates' commands are re-run, but only for controls this chain accepted (a recorded pass anywhere
 * on the ledger). A control spliced in behind the cursor was never accepted, so there is nothing to regress. A
 * re-run that cannot start is a fail (PARITY-EXCEPTIONS WP6-7).
 *
 * An accepted `host_check` control is re-run through its callback too (TS-only, §6): a completion then certifies every
 * gate at the revision it ends on, as the Arsenal evaluator re-ran every check. `graded` names the host checks this
 * evaluation already ran at its guarded revision; they are not run twice.
 */
export const regressions = (
  input: Input,
  owner: Owner,
  ledger: string,
  earlier: ReadonlyArray<unknown>,
  graded: ReadonlySet<string> = new Set(),
): Effect.Effect<
  Graded,
  Defect | LedgerRead.ReadError | LedgerRead.Missing | RelayJson.EncodeError,
  GateShell.Service
> =>
  Effect.gen(function* () {
    const entries = yield* LedgerRead.entries(ledger)
    const accepted = new Set(
      entries
        .filter((entry) => entry.event === "checklist-item" && entry.verdict === "pass")
        .map((entry) => entry.item),
    )
    const shell = yield* GateShell.Service
    const lines: string[] = []
    const failing: string[] = []
    const results: RelayArm.HostCheckResult[] = []
    const unbound: string[] = []
    // `.checklist[]? | select(.cmd != null)`: a null control has no command; any other non-object breaks the selection.
    const controls = earlier.flatMap((wp) => members(field(wp, "checklist")).map((control) => ({ wp, control })))
    for (const { wp, control } of controls) {
      if (control !== null && !isObject(control))
        return yield* new Defect({ reason: "an earlier checklist control is not an object" })
      const host = field(control, "host_check")
      if (host !== undefined && host !== null) {
        const id = GateControl.text(field(control, "id"))
        if (id === undefined) return yield* new Defect({ reason: "an earlier control has an invalid id" })
        if (!accepted.has(id) || graded.has(id)) continue
        const name = typeof host === "string" ? host : JSON.stringify(host)
        const checked = yield* hostCheck(input, GateControl.text(field(wp, "id")) ?? "", control, name)
        const pass = checked.verdict.verdict === "pass"
        if (!pass) failing.push(id)
        if (checked.result === undefined) unbound.push(id)
        if (checked.result !== undefined) results.push(checked.result)
        const provenance = checked.result?.provenance
        lines.push(
          yield* RelayJson.compact({
            arm: input.token,
            wp: owner.wp,
            i: owner.i,
            event: "regression-item",
            item: id,
            verdict: pass ? "pass" : "fail",
            graded_by: "deterministic",
            oracle: checked.verdict.oracle,
            origin: "regression",
            ...labels(owner),
            host_check: name,
            ...(provenance?.revision === undefined ? {} : { revision: provenance.revision }),
            ...(provenance === undefined ? {} : { event_id: provenance.eventID }),
          }),
        )
        continue
      }
      const command = field(control, "cmd")
      if (command === undefined || command === null) continue
      const id = GateControl.text(field(control, "id"))
      const cmd = GateControl.text(command)
      if (id === undefined || cmd === undefined)
        return yield* new Defect({ reason: "an earlier control has an invalid id or command" })
      if (cmd === "" || !accepted.has(id)) continue
      const ran = yield* Effect.result(shell.run({ program: cmd, cwd: input.workdir, env: input.params }))
      const pass = Result.isSuccess(ran) && ran.success.exitCode === 0
      if (!pass) failing.push(id)
      lines.push(
        yield* RelayJson.compact({
          arm: input.token,
          wp: owner.wp,
          i: owner.i,
          event: "regression-item",
          item: id,
          verdict: pass ? "pass" : "fail",
          graded_by: "deterministic",
          oracle: GateControl.oracleSha(cmd),
          origin: "regression",
          ...labels(owner),
        }),
      )
    }
    return { lines, failing, results, unbound }
  })

// The revision guard's HEAD (§6): a commit ID read with the sandboxed git, or the round cannot be bound to a revision.
export const revision = (workdir: string): Effect.Effect<string, Defect, GateShell.Git> =>
  Effect.gen(function* () {
    const git = yield* GateShell.Git
    const result = yield* Effect.result(git.run(workdir, ["rev-parse", "HEAD"]))
    const text = Result.isSuccess(result) ? new TextDecoder().decode(result.success.stdout).trim() : ""
    if (Result.isFailure(result) || result.success.exitCode !== 0 || !/^(?:[0-9a-f]{40}|[0-9a-f]{64})$/.test(text))
      return yield* new Defect({ reason: "the revision guard could not read HEAD" })
    return text
  })

// sha256 over the buffered lines (each with LF), then `<fails>\n<reg>\n`. `ts` is excluded by construction.
export const shape = (buffered: ReadonlyArray<string>, fails: string, reg: string): string =>
  createHash("sha256")
    .update(buffered.map((line) => `${line}\n`).join("") + `${fails}\n${reg}\n`)
    .digest("hex")

/**
 * Appends every buffered line with `ts` prepended at flush time, in order; the first failed append stops the flush.
 * Each line is a compact object from the jq-compatible writer, so splicing `"ts"` in front of its first member is what
 * `jq -c '{ts:$ts} + .'` printed.
 */
export const flush = (
  ledger: string,
  buffered: ReadonlyArray<string>,
  chain: Omit<LedgerChain.AppendInput, "ledger" | "body">,
): Effect.Effect<void, LedgerChain.AppendError> =>
  Effect.forEach(
    buffered,
    (line) =>
      Clock.currentTimeMillis.pipe(
        Effect.flatMap((millis) =>
          LedgerChain.append({ ...chain, ledger, body: `{"ts":${Math.floor(millis / 1000)},${line.slice(1)}` }),
        ),
      ),
    { discard: true },
  )

/**
 * One Arsenal host check (§6): the registered callback, 60 s at most. An unbound check fails closed and has no
 * result; a callback that fails, dies, times out or answers out of contract is an `acquisition-error`, never a pass.
 */
const hostCheck = (input: Input, gate: string, control: unknown, host: string) =>
  Effect.gen(function* () {
    const item = GateControl.text(field(control, "id"))!
    const declared = field(control, "assert")
    const verdict = (pass: boolean, graded_by: RelayLedger.GradedBy): GateControl.Verdict => ({
      item,
      assert: GateControl.text(declared === undefined || declared === null || declared === false ? item : declared)!,
      verdict: pass ? "pass" : "fail",
      graded_by,
      // The host check's name is its oracle, as a command is a deterministic control's.
      oracle: GateControl.oracleSha(`host_check:${host}`),
      origin: GateControl.controlOrigin(control as RelaySprint.Control),
    })
    const callback = input.hostChecks?.get(host)
    if (callback === undefined) return { verdict: verdict(false, "unavailable(missing)") }
    const answer = yield* callback({
      token: input.token,
      ...(input.meta.session_id === undefined ? {} : { sessionID: input.meta.session_id }),
      gateID: gate,
      check: { id: item, hostCheck: host },
      ...(input.revision === undefined ? {} : { revision: input.revision }),
    }).pipe(
      Effect.timeoutOrElse({ duration: "60 seconds", orElse: () => Effect.succeed("timeout" as const) }),
      Effect.exit,
    )
    const value: unknown = Exit.isSuccess(answer) ? answer.value : undefined
    const result: RelayArm.HostCheckResult = Schema.is(RelayArm.HostCheckResult)(value)
      ? { ...value, name: item }
      : { name: item, status: "acquisition-error", provenance: provenance(input) }
    const graded_by: RelayLedger.GradedBy =
      result.status === "missing"
        ? "unavailable(missing)"
        : result.status !== "acquisition-error"
          ? "deterministic"
          : value === "timeout"
            ? "unavailable(timeout)"
            : "unavailable(spawn)"
    return { verdict: verdict(result.status === "pass", graded_by), result }
  })

// Provenance for a result the arm had to make itself because the callback gave none.
function provenance(input: Input): RelayArm.Provenance {
  return {
    source: "host-check",
    projectID: input.meta.project_id ?? "",
    sessionID: input.meta.session_id ?? "",
    eventID: randomUUID(),
    ...(input.revision === undefined
      ? { revisionUnavailable: "not-captured" as const }
      : { revision: input.revision, revisionKind: "git" as const }),
  }
}

// `add_macro`: `macro` and `kind` follow every line of a WP that declares them.
function labels(owner: Owner) {
  return {
    ...(owner.macro ? { macro: owner.macro } : {}),
    ...(owner.kind ? { kind: owner.kind as RelayLedger.RecordedKind } : {}),
  }
}

// `.checklist[]?` iterates an array's items or an object's values, and nothing else.
function members(value: unknown): ReadonlyArray<unknown> {
  if (Array.isArray(value)) return value
  if (isObject(value)) return Object.values(value)
  return []
}

function field(value: unknown, key: string): unknown {
  if (!isObject(value)) return undefined
  return Object.hasOwn(value, key) ? value[key] : undefined
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}
