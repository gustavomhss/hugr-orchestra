# Trechos decisivos para revisão de L1-B

**Fonte comum:** `gustavomhss/hugr-orchestra@1cde2ff7a71bcf7aecb5d030917b577165135d38`. Cada bloco abaixo preserva literalmente as linhas da captura; intervalos descontínuos são blocos distintos. SHA-256 externo e captura completa estão em `sources.json`; `review-evidence-index.json` permite conferir cada trecho. São evidências de código/documentação, não resultados de execução. O oracle reservado da campanha não foi lido.

## 1. Drivers shell: controles, regressões e posição

`modules/relay/SPEC.md` — blob `2144a0ed82da6f1472c426aecf3022762bfff4e7`

Linhas 39–44:

```text
| Driver | Current controls, in execution order | Regression controls | Position |
|---|---|---|---|
| `bin/relay-arm-hook.sh` | Current `checklist` only | Earlier `checklist[].cmd` whose control IDs have a recorded `checklist-item` pass | WP ID in `position`; `counter` is a compatibility mirror |
| `bin/relay-gate eval` | Current `checklist`, then `dod[].cmd` | Every earlier `checklist[].cmd` and `dod[].cmd` | Integer `counter` |
| `benchmark/relay_hook.sh` with `RELAY_GATE=on` | Current `dod[].cmd`, then `checklist` | Earlier `dod[].cmd` only | Integer `counter` |
| `bin/relay-gate check` | Selected WP's `checklist` only | None | Reads `counter` unless `--position` selects a named WP; does not advance |
```

Linhas 50–55:

```text
command hashing uses those same exact strings. A command's final shell status decides its verdict:
`false; true` passes, rather than treating each fragment as a separate control.

The benchmark's `RELAY_GATE=off` path advances without checking controls. Each evaluation resolves
at most one WP. All drivers load the plan on each invocation; none provides an immutable plan snapshot
across the separate `jq` reads within an invocation. Coordinate plan writes between evaluations.
```

## 2. Gate nativo: sequência e força decisória

`modules/relay/src/gate/control.ts` — blob `094077ca84e3b394c32e813402feb8ae63272892`

Linhas 71–74:

```text
/**
 * Runs the selected WP's checklist in declared order without short-circuiting. A nonempty `cmd` wins over `judge`;
 * a `host_check` control is graded by the arm, not here. `record` runs after each verdict and before the next control,
 * so a failed record stops the checklist like `ledger_item || return 1`.
```

Linhas 246–248:

```text
    const cmd = text(field(control, "cmd"))
    if (cmd === undefined) return graded("fail", "unavailable(invalid-command)", "", true)
    if (cmd) {
```

Linhas 254–255:

```text
      const pass = ran.success.exitCode === 0
      return graded(pass ? "pass" : "fail", "deterministic", oracleSha(cmd), !pass, "", Option.none(),
```

Linhas 259–266:

```text
    const criterion = text(field(control, "judge"))
    if (!criterion) return graded("fail", "judge:unavailable(invalid-criterion)", "", true)
    // `jq -r '.blocking // false'` compared with "true", and the same for `diff`.
    const blocking = raw(field(control, "blocking")) === "true"
    const scope = scopeText(field(control, "paths"))
    if (scope === undefined) return graded("fail", "judge:unavailable(invalid-scope)", "", true)
    // The oracle and the ledger hold the raw scope: `${spec_dir}/x.json` is the same question in every run.
    const oracle = oracleSha(scope ? `${criterion} :: ${scope}` : criterion)
```

Linhas 274–275:

```text
      // Fail closed, but an advisory control that cannot run still only advises.
      if (Option.isNone(diff)) return graded("fail", "judge:unavailable(no-diff)", oracle, blocking, scope, artifact)
```

Linhas 280–287:

```text
    // Exactly a pass/fail verdict with a NUL-free string backend; anything else is unavailable, never a pass.
    const backend = response.verdict === "pass" || response.verdict === "fail" ? text(response.backend) : undefined
    const pass = backend !== undefined && response.verdict === "pass"
    return graded(
      pass ? "pass" : "fail",
      `judge:${backend === undefined ? "unavailable(invalid-response)" : backend || "judge"}(non-independent)`,
      oracle,
      blocking && !pass,
```

## 3. Host check nativo: aquisição, timeout e resultado

`modules/relay/src/arm/round.ts` — blob `2986a545b724f842d784022d997e42848457905c`

Linhas 252–254:

```text
/**
 * One Arsenal host check (§6): the registered callback, 60 s at most. An unbound check fails closed and has no
 * result; a callback that fails, dies, times out or answers out of contract is an `acquisition-error`, never a pass.
```

Linhas 269–270:

```text
    const callback = input.hostChecks?.get(host)
    if (callback === undefined) return { verdict: verdict(false, "unavailable(missing)") }
```

Linhas 278–284:

```text
      Effect.timeoutOrElse({ duration: "60 seconds", orElse: () => Effect.succeed("timeout" as const) }),
      Effect.exit,
    )
    const value: unknown = Exit.isSuccess(answer) ? answer.value : undefined
    const result: RelayArm.HostCheckResult = Schema.is(RelayArm.HostCheckResult)(value)
      ? { ...value, name: item }
      : { name: item, status: "acquisition-error", provenance: provenance(input) }
```

Linhas 293–293:

```text
    return { verdict: verdict(result.status === "pass", graded_by), result }
```

## 4. Host instalado: timeout e ambiente

`packages/core/src/relay.ts` — blob `25fb509203f933a2e8b0f311c3fc8f9476d53e16`

Linhas 43–46:

```text
export const VERIFY_TIMEOUT = Duration.seconds(60)
export const GATE_TIMEOUT = Duration.minutes(15)
// "Test now" in the workflow editor: one command, cut at a minute.
export const TRIAL_TIMEOUT = Duration.seconds(60)
```

Linhas 219–221:

```text
    // A check: a fresh bash in the workdir with PATH, HOME and the run's params only. Only the end of its output is
    // kept, for the seat's next turn, and the whole process group is killed at the timeout. Provider keys, `RELAY_*` from this process and the ledger key never
    // reach it, and BASH_ENV, ENV and SHELLOPTS would run code at startup that the Python gate never ran.
```

Linhas 226–230:

```text
            const env = {
              ...Object.fromEntries(Object.entries(input.env).filter((entry) => !STARTUP.has(entry[0]))),
              PATH: process.env.PATH ?? "/usr/bin:/bin",
              HOME: global.home,
            }
```

Linhas 240–240:

```text
                extendEnv: false,
```

## 5. Cadeia íntegra pode ser prefixo; autoria e cauda

`modules/relay/src/ledger/verify.ts` — blob `9071d2e61cc0bc8f72d9657d5185735b23330810`

Linhas 11–13:

```text
export interface Result {
  // 0: intact, including an empty ledger or a valid nonterminal prefix; 1: broken or refused; 2: missing ledger.
  readonly exit: 0 | 1 | 2
```

Linhas 49–49:

```text
          "  NOTE: plain mode is tamper-evident, not unforgeable. Set RELAY_LEDGER_KEY for an adversary-resistant (keyed) chain.",
```

Linhas 53–53:

```text
          `  NOTE: trace ends on '${chain.last}', not a terminal event — possible tail-truncation; only an out-of-band anchor of the head can rule it out.`,
```

## 6. Auditoria: determinismo e ausência de recheck completo

`modules/relay/src/audit.ts` — blob `75a97f45b5b5c7cb52110de2206b68457c524e92`

Linhas 135–155:

```text
    const recheck =
      !intact || loaded.errors.length > 0
        ? NOT_RUN_BROKEN
        : yield* oracleRecheck(usable, options?.sprint ?? (yield* findSprint(target)))
    const deterministic = controls.filter((control) => control.graded_by === "deterministic")
    const failing = deterministic.filter((control) => control.verdict !== "pass")
    const lastEvent = finalEvent(loaded.entries)
    const verdict = {
      intact,
      errors: loaded.errors.length > 0,
      invalid: recheck.status === "invalid",
      diverged: recheck.status === "diverged",
      unverified: recheck.status === "unverified",
      // An empty ledger, or one without a deterministic control, is not an auditable pass.
      noControls: loaded.entries.length === 0 || deterministic.length === 0,
      truncated: intact && loaded.entries.length > 0 && !LedgerVerify.TERMINAL.some((event) => event === lastEvent),
      failing: failing.length > 0,
      laundered: drift.some((item) => item.laundered),
      drift: drift.length > 0,
      escalated: lastEvent === "escalate",
    }
```

Linhas 277–282:

```text
function finalControls(usable: ReadonlyArray<Entry>) {
  const final = new Map<unknown, Entry>()
  usable
    .filter((entry) => get(entry, "event") === "checklist-item")
    .forEach((entry) => final.set(get(entry, "item"), entry))
  return [...final.values()]
```

Linhas 659–672:

```text
function exitOf(verdict: Verdict): 0 | 1 | 2 {
  if (!verdict.intact) return 1
  const blocked = [
    verdict.errors,
    verdict.invalid,
    verdict.diverged,
    verdict.noControls,
    verdict.truncated,
    verdict.failing,
    verdict.drift,
    verdict.escalated,
    verdict.unverified,
  ]
  return blocked.some(Boolean) ? 2 : 0
```

## 7. Settlement: recibo antes de estado, repair com lock

`modules/relay/src/arm/settlement.ts` — blob `5a2c95f1b902a76f63c4b7620112875bc63fa46f`

Linhas 13–13:

```text
// Relay owns the lock and disposition ordering; callers own identity and durable receipts. No Core dependency.
```

Linhas 24–28:

```text
// The caller already owns .run.lock. A saved evaluation skips even construction of the engine's grading effect.
export const run = <E, E2, R>(boundary: Boundary<E>, evaluate: () => Effect.Effect<Step, E2, R>, ledger: string) =>
  Effect.gen(function* () {
    const saved = yield* boundary.before()
    if (saved !== undefined) return saved
```

Linhas 45–45:

```text
// Receipt precedes state writes, follows the engine's ordinary signed disposition. Legacy ledger is untouched.
```

Linhas 53–59:

```text
    if (context.boundary?.disposition) yield* context.boundary.disposition({
      ...evaluation, ledgerSeq: lastSeq(context.ledger),
      ...(evaluation.reason === undefined ? {} : { reason: context.warning + evaluation.reason }),
      ...(context.hosted ? { capture: { complete: context.complete, results: [...context.results] } } : {}),
      ...(context.injection === undefined ? {} : { inject: context.injection }),
    }, writes)
    yield* apply
```

Linhas 63–67:

```text
// Called only by the lock owner, including interrupted-disposition reconciliation. Null means the existing removal.
export const repair = (arm: string, writes: ReadonlyArray<Write>) => Effect.gen(function* () {
  if (!ArmState.held(arm)) return yield* new Invalid({ reason: "disposition repair requires the run lock" })
  if (writes.some((write) => !/^[A-Za-z0-9._-]+$/.test(write.name) || write.name === "." || write.name === ".."))
    return yield* new Invalid({ reason: "invalid disposition repair file" })
```

## 8. Recuperação e recusa de atalho para workflow ligado

`packages/core/src/relay.ts` — blob `25fb509203f933a2e8b0f311c3fc8f9476d53e16`

Linhas 382–384:

```text
      // Stale only when no evaluation in this process holds it and it predates this process: this process releases
      // every lock it takes synchronously, and a younger lock may belong to a live evaluation it cannot see.
      if (!info?.isDirectory() || ArmState.held(arm) || info.mtimeMs >= performance.timeOrigin) return false
```

Linhas 406–414:

```text
      // Noted before the lock goes: a recovery that cannot be recorded does not happen.
      yield* LedgerChain.append({
        ledger: path.join(arm, RelayArm.Files.ledger),
        body: yield* RelayJson.compact({ ts, arm: token, wp, event: "gate-recovered" }),
        gen,
        key,
      })
      yield* Effect.try({
        try: () => rmdirSync(lock),
```

Linhas 493–498:

```text
        // Bound progressive arms may only cross the guarded native settlement boundary; an API/CLI evaluate cannot
        // spend their retry budget or advance them. Missing/invalid arm data remains the existing engine's defect.
        const bound = yield* ArmLoad.arm(path.join(paths.arms, input.token)).pipe(Effect.option)
        if (Option.isSome(bound) && bound.value.meta.workflow)
          return { outcome: "refused" as const, failing: [], ledgerSeq: -1,
            reason: "WORKFLOW_NATIVE_SETTLEMENT_REQUIRED" }
```

## 9. Rota de documento não executa workflow

`packages/server/src/handlers/relay-document.ts` — blob `de7ff959ced8b2d0b4a2947add0f1a9600ffc845`

Linhas 158–165:

```text
      .handle("relay.document.check", () =>
        Effect.fail(
          new RelayForbiddenError({
            code: "maestro-execution-required",
            message: "Executable workflow checks are owned by Maestro.",
          }),
        ),
      )
```

## 10. Conflito preservado no preprocessor de políticas

`modules/relay/docs/guardrails.md` — blob `85bba4463a4cfd454f8ae36a8587229c35baf930`

Linhas 29–35:

```text
## Current ID mismatch

Applying one bundle to multiple WPs repeats its control IDs across those WPs. Current
[`relay-spec.py lint`](../bin/relay-spec.py) flags `duplicate-control-id` as an error.
Policy preprocessing and lint therefore do not agree on a globally valid merged plan. IDs also key
keep-best and drift/control reports; reachable-sprint audit comparison rejects duplicate checklist IDs
as `SPRINT-INVALID` (exit 2). Resolve the plan with its owner before claiming validated coverage.
```

## 11. LangGraph Python: shell e judge implementados

`modules/relay/lib/orchestra_relay/__init__.py` — blob `d281b8bc0c3154bf33a21bca7ad9f528e3676e4d`

Linhas 175–183:

```text
def _evaluate(kind, spec, root):
    if kind == "judge":
        model = os.environ.get("OPENAI_API_KEY") or os.environ.get("ANTHROPIC_API_KEY")
        return "advisory", "model judging is not available in this version" if model else "no model configured"
    try:
        done = subprocess.run(spec, shell=True, cwd=root, capture_output=True, timeout=600)
    except subprocess.TimeoutExpired:
        return "fail", "timed out after 600 s"
    return ("pass" if done.returncode == 0 else "fail"), (done.stdout + done.stderr).decode("utf-8", "replace")[:4000]
```

## 12. LangGraph Python: aprovação/checkpointer e autoridade

`modules/relay/lib/orchestra_relay/README.md` — blob `5f4c202ffb8aaf911422b73aea8ab08e57f92dcf`

Linhas 39–41:

```text
- `approve`: pauses with LangGraph's `interrupt()` before the node runs, so a rejected step never happens; retries after a failed check do not ask again. Resume with `graph.invoke(Command(resume="approve"), config)` or `Command(resume={"decision": "reject", "note": "..."})`. A decision already on the ledger is replayed, never asked again. While it waits, the run folder holds `waiting.pid`; Orchestra shows a waiting run whose process has exited as failed. Only a checkpointer that outlives the process (not `dev=True`'s in-memory one) can resume that thread; otherwise start a new run with a new `thread_id`.

Your node functions are never wrapped. Their static out-edges are moved behind the check node, and with `approve` their static in-edges go through the approval node first. A gated node with conditional out-edges, `Command` destinations or a join edge is refused with an error, and so is an approval-gated node reached through a conditional edge.
```

Linhas 52–53:

```text
- The check runs in the agent's own process. The ledger shows what that process recorded and that nothing changed afterwards. It does not show an independent party ran the check.
- Plain SHA-256 catches edits by anyone who does not recompute the chain. A process that controls the folder can rewrite it whole. Approvals are self-reported in the MVP.
```

