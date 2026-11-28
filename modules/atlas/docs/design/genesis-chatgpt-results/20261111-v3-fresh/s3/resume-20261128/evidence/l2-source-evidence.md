# S3 L2 — evidência decisiva para revisão independente

Ref de todos os recortes de código: `gustavomhss/hugr-orchestra@1cde2ff7a71bcf7aecb5d030917b577165135d38`. Capturas UTF-8 integrais: SHA-256 calculado e Git blob conferido, 16/16 corretos.

Sem veredito, oracle ou execução. Blocos literais; intervalos separados indicam recortes separados. Fontes completas e manifesto ficam com a principal.

## Predecessores L1 aceitos — suporte estático preservado

Os três corpos têm dois pareceres finais conferidos. Excertos de predecessor estático aceito. Ref de custódia `19b909ef3bf27e0332f24fc30e3a5c471ea37d78`; base dos paths `modules/atlas/docs/design/genesis-chatgpt-results/20261111-v3-fresh/s3/`.



### Predecessor `bodies/l1-maestro.md`

SHA-256 `75b4438d79ebd9667db94f03a6fea884329cd5c72e2c69f649eff1047e7b1918`; Git blob `2771a4efb6ef054d647ceea8a356dc1c3a8afd89`.

L69, excerto delimitado da linha:

```text
**Aprovação governada.** O input `governed` é opcional e explicitamente destinado a Task governada. O playbook descreve o fluxo auditável pedido pelo owner; isso não torna toda tarefa normal dependente da cadeia.
```

L85, excerto delimitado da linha:

```text
**Observação de packaging.** O leitor exige UTF-8 preservável, árvore completa, frontmatter/names corretos e entradas regulares sem links; referências binárias não são suportadas. O gerador inclui árvores por seat, shared e Maestro. Startup compilado extrai bytes para cache por versão/digest, valida antes de reuso e usa lock cooperativo; mantém cópias antigas para rollback.
```

### Predecessor `bodies/l1-relay.md`

SHA-256 `369d2610ba4507a0950bd16cfce045dede276b67dee05f5d0086ef9ea503ffcb`; Git blob `3b9788cb4cf709f80f663364cf4ca5874b9a8c8d`.

L96, excerto delimitado da linha:

```text
Registros obrigatórios precedem estado/counter/retry correspondentes, mas efeitos de comandos podem já ter ocorrido; append parcial ou falha posterior de escrita permanecem possíveis.
```

L98, excerto delimitado da linha:

```text
Recuperação nativa de lock exige diretório de lock anterior ao processo, não detido por avaliação local; registra gate-recovered antes de remover. Não remove lock jovem nem resolve automaticamente conflito de identidade/planos.
```

### Predecessor `bodies/l1-integrations.md`

SHA-256 `81685f16fb32aae6958671939413d121e4f5babaf01d3b9565b03a50f7842e8a`; Git blob `42800afbd5bdd0ca51c4e0eab136e9de31f7673f`.

L81, excerto delimitado da linha:

```text
O README afirma que nenhum workspace importa o pacote e nenhuma raiz de seat carrega esses assets.
```

L101, excerto delimitado da linha:

```text
 não há nesta base demonstração de ligação ativa scanner→sink→UI; não chamar a feature de “rodando” porque o módulo e a UI existem. [E10; `apps/desktop/src/main/janitor-ipc.ts:49–69,99–133`; host]
```

## Recortes literais do baseline

### A1. Resposta e apresentação exatas

`modules/maestro/coordination/src/approval.ts` @ baseline comum. Blob `4181f5cefc9b1541fc2b73b4fcaca7e1a349b12e`. SHA-256 integral `70bb260f4e7ffb20844042f8c12934ce10398779d9ff4916b0ced9c5917cd8d4` (9452 bytes).

L131–L146:

```typescript
  if (!input.presentationCurrent || !isNewestPresentation(input.presentation, input.presentations, ordered)) {
    return { status: "HOLD", reason: "presentation-not-current" }
  }

  const reply = ordered.find((message) => message.id === input.replyMessageID)
  if (!reply) return { status: "HOLD", reason: "reply-not-found" }
  if (reply.sessionID !== input.presentation.sessionID) return { status: "HOLD", reason: "reply-session-mismatch" }
  if (reply.role !== "user") return { status: "HOLD", reason: "reply-not-direct-user" }
  if (reply.synthetic) return { status: "HOLD", reason: "reply-synthetic" }
  if (reply.seq <= presentationMessage.seq) return { status: "HOLD", reason: "reply-not-after-presentation" }
  if (
    ordered.some(
      (message) => message.role === "user" && message.seq > presentationMessage.seq && message.seq < reply.seq,
    )
  ) {
    return { status: "HOLD", reason: "reply-not-immediate" }
```

L158–L159:

```typescript
  const outcome = classifyReply(reply.text)
  if (!outcome) return { status: "PENDING", kind: reply.text.includes("?") ? "question" : "ambiguous" }
```

### A2. Seat/intent antes da reserva

`modules/maestro/coordination/src/v2/governance/dispatch.ts` @ baseline comum. Blob `63af3a2e95eb280dfe0a98f22fd51079e1323819`. SHA-256 integral `5f13bf85bf3bd74ba3e17caf4e6899dd2fd19503430b262976b57a82e53f7300` (8908 bytes).

L53–L69:

```typescript
/** Why an authorized Task in this Session does not dispatch the approved seat and intent, worded for the model to retry. */
export function mismatch(
  authorization: { sessionID: string; routedMemberID: string; taskIntentHash: string } | undefined,
  task: { sessionID: string; memberID: string; subagentType: string; prompt: string; model?: string },
) {
  if (authorization?.sessionID !== task.sessionID) return undefined
  if (authorization.routedMemberID !== task.memberID)
    return `Authorized Task denied: routed-seat-mismatch. This authorization dispatches only ${authorization.routedMemberID}; retry with exactly the approved seat, prompt and model.`
  if (authorization.taskIntentHash !== taskIntentHash(task))
    return "Authorized Task denied: task-intent-mismatch. subagent_type, prompt and model must match the approved intent byte for byte; retry with exactly what was presented and approved."
  return undefined
}

/** The one child an authorization reserves, derived from the authorization alone. */
export function childSessionID(authorizationID: string) {
  return SessionSchema.ID.make(`${CHILD_PREFIX}${sha256(authorizationID)}`)
}
```


### A3. Reserva governada vinculada

`modules/maestro/coordination/src/v2/governance/reservation.ts` @ baseline comum. Blob `b3885aab1cd5f9c9a2bb71db90b1e8044edf933a`. SHA-256 integral `f22d10e5ab86bf5289c9b9e58ebde6f3df702b566887725a88b2685ec24ff1a4` (13426 bytes).

L59–L79:

```typescript
  if (
    input.governed.taskHash !==
    taskHash({ subagentType: input.subagentType, prompt: input.prompt, model: input.model, ...input.governed, ...input.workflow })
  )
    return yield* denied("task-hash-mismatch")
  const direct = yield* MaestroApprovalTools.recordApproval(services, SessionSchema.ID.make(input.sessionID))
  if (direct.status !== "APPROVED") return yield* denied("direct-approval-not-approved")
  if (
    direct.decision.sessionID !== input.governed.sessionID ||
    direct.decision.actor.projectId !== input.governed.projectID ||
    direct.decision.actor.memberId !== input.governed.memberID ||
    direct.decision.approvalMessageID !== input.governed.approvalMessageID ||
    direct.decision.planRevisionID !== input.governed.planRevisionID ||
    direct.decision.revisionHash !== input.governed.revisionHash ||
    direct.decision.validationRecordID !== input.governed.validationRecordID ||
    direct.decision.validationHash !== input.governed.validationHash ||
    direct.decision.contextHash !== input.governed.contextHash ||
    direct.decision.policyHash !== input.governed.policyHash ||
    direct.decision.taskHash !== input.governed.taskHash
  )
    return yield* denied("direct-approval-binding-mismatch")
```

L111–L113:

```typescript
  const suffix = reservationHash(input.governed.sessionID, approved.presentationID, input.governed.taskHash)
  const childSessionID = SessionSchema.ID.make(`${CHILD_PREFIX}${suffix}`)
  if (input.taskID && input.taskID !== childSessionID) return yield* denied("reservation-child-mismatch")
```

L128–L131:

```typescript
    childSessionID,
    parentSessionID: input.sessionID,
    agent: input.target,
    permission: input.permission.map((rule) => ({ ...rule })),
```

L254–L261:

```typescript
    existing.childSessionID !== reservation.childSessionID ||
    existing.parentSessionID !== reservation.parentSessionID ||
    services.canonical(existing.agent) !== reservation.agent
  )
    return yield* denied("reservation-binding-mismatch")
  // The reservation binds the write roots; a replay that asks for others is refused, never widened.
  if (JSON.stringify(roots(existing.permission)) !== JSON.stringify(roots(reservation.permission)))
    return yield* denied("reservation-write-roots-mismatch")
```


### A4. Primeiro provider turn

`modules/maestro/coordination/src/v2/governance.ts` @ baseline comum. Blob `acab0bd78caa6e4810b08a2fbabf9bc9ff437ba7`. SHA-256 integral `7ab5f454b0443a311f8671b4153d64f83f0d9f18997d913d166911823757885c` (27278 bytes).

L323–L330:

```typescript
    beforeTurn: (session) =>
      Effect.gen(function* () {
        if (Option.isSome(sessions)) yield* background.start(sessions.value, session.id)
        if (!session.parentID) return
        // Only a child's first provider turn is gated; every later turn already ran under the same checks.
        // A refused turn leaves its input pending, so a promoted input means an earlier turn already passed this gate.
        if ((yield* SessionInput.promotedAfter(database.db, session.id, -1)).length === 0) yield* firstTurn(session)
        yield* WorkflowAdmissionV2.turn(services, session)
```

L390–L396:

```typescript
  // A child's first provider turn: its reservation is revalidated or consumed, and a strict-resume seat binds its task.
  function firstTurn(session: SessionSchema.Info) {
    return Effect.gen(function* () {
      const dispatch = session.id.startsWith(GovernanceDispatchV2.CHILD_PREFIX)
      const governed = session.id.startsWith(GovernanceReservationV2.CHILD_PREFIX)
      if (dispatch) yield* revalidateDispatch(session.id)
      if (governed) yield* GovernanceReservationV2.consume(services, session.id)
```


### A5. Leitura fiel de arquivos autorais

`modules/maestro/coordination/src/seat-skill-content.ts` @ baseline comum. Blob `ee9de21c4aeceb1c9b014cdae2b710efb9d0360a`. SHA-256 integral `7aaebead2a68c47dd89f2e86541d53114039d5a1b38cb00ec6c455827fcb087f` (8797 bytes).

L112–L118:

```typescript
/** Read authored bytes exactly; neither symlinks nor binary companions are supported. */
export async function read(id: string, root: string, skills: readonly string[]) {
  const stat = await fs.lstat(root).catch((cause) => {
    throw new PackagingError(`Cannot acquire seat skill source root: ${id}`, { cause })
  })
  if (!stat.isDirectory() || stat.isSymbolicLink()) throw new PackagingError(`Invalid seat skill source root: ${id}`)
  const canonical = await fs.realpath(root)
```

L135–L147:

```typescript
        const file = path.relative(root, target).split(path.sep).join("/")
        if ((await fs.realpath(target)) !== path.join(canonical, ...file.split("/")))
          throw new PackagingError(`Escaping seat skill source path: ${id}/${file}`)
        const bytes = await fs.readFile(target)
        const text = (() => {
          try {
            return new TextDecoder("utf-8", { fatal: true, ignoreBOM: true }).decode(bytes)
          } catch (cause) {
            throw new PackagingError(`Invalid UTF-8 seat skill content: ${id}/${file}`, { cause })
          }
        })()
        if (!bytes.equals(Buffer.from(text, "utf8")))
          throw new PackagingError(`Nonlossless UTF-8 seat skill content: ${id}/${file}`)
```


### A6. Módulo virtual dos builds

`modules/maestro/coordination/src/seat-skills-module.ts` @ baseline comum. Blob `19f7786d82aa7043213a95a3e3e5eb8cb505d573`. SHA-256 integral `f468d2d52a9d5c7007dd938ad7d41fe9f9b312637c2ba173f1a447de4ab88d11` (2018 bytes).

L6–L18:

```typescript
// Every seat's packaged skills (F6.12) as one generated module: seat id -> tree-relative path -> file text. Both the
// Bun binary (script/build.ts) and the desktop Node sidecar (script/build-node.ts) embed it; modules/maestro/coordination/src/seat-skill-root.ts
// extracts each tree to a real directory at runtime.
export async function seatSkillsModule() {
  const trees = await Promise.all(
    Object.values(Seats.all)
      .filter((seat) => seat.skills.length > 0)
      .map(async (seat) => {
        const root = Seats.skillSource(seat.id)
        const files = await SeatSkillContent.read(seat.id, root, seat.skills)
        const entries = Object.keys(files).toSorted().map((file) => `    [${JSON.stringify(file)}]: ${JSON.stringify(files[file])},`)
        return [`  ${JSON.stringify(seat.id)}: {`, ...entries, "  },"]
      }),
```

L40–L42:

```typescript
export async function seatSkillsFiles() {
  return { "orchestra-seat-skills.gen.ts": await seatSkillsModule() }
}
```


### A7. Digest/cache e publicação da árvore

`modules/maestro/coordination/src/seat-skill-root.ts` @ baseline comum. Blob `c01632881ed8e61ee0b008fb41d36ef8ceba8afd`. SHA-256 integral `804a7ec1d341ba32e074d1badd3cbce8612b218d105b61660beae44340dd705c` (10150 bytes).

L90–L100:

```typescript
export async function extract(id: string, files: Record<string, string>, cache: string, version: string) {
  SeatSkillContent.validate(id, files)
  if (!version || /[\\/:\p{Cc}]/u.test(version) || version === "." || version === "..")
    throw new SeatSkillContent.PackagingError(`Invalid seat skill installation version: ${version}`)
  const entries = Object.entries(files).map(([file, text]) => [file, new TextEncoder().encode(text)] as const)
  const expected = digest(entries)
  const dir = path.join(cache, `${id}-skills`, `${version}-${expected.slice(0, 12)}`)
  // Windows temp and cache paths can carry 8.3 short names (RUNNER~1); permission checks compare canonical paths, so the
  // root handed to grants and the read tool must be the canonical one.
  const canonical = () => fs.realpath(dir)
  if (await readTree(dir).then((tree) => tree && digest(tree)) === expected) return canonical()
```

L103–L105:

```typescript
  // A per-copy publication lock keeps the verification/removal pair atomic for cooperative starts. A crashed holder
  // fails acquisition closed; we never steal a lock from a publisher that might still be alive.
  const lock = `${dir}.lock`
```

L118–L119:

```typescript
    // A competing start may have published while we acquired the lock. Never remove its valid tree.
    if (await readTree(dir).then((tree) => tree && digest(tree)) === expected) return canonical()
```

L125–L128:

```typescript
    await fs.rm(dir, { recursive: true, force: true })
    await place(temp, dir)
    if (await readTree(dir).then((tree) => tree && digest(tree)) !== expected)
      throw new SeatSkillContent.PackagingError(`Cannot verify extracted seat skill tree: ${id}`)
```

L175–L181:

```typescript
function digest(entries: readonly (readonly [string, Uint8Array])[]) {
  const hash = createHash("sha256")
  entries
    .toSorted(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .forEach(([file, bytes]) => hash.update(`${file}\0${createHash("sha256").update(bytes).digest("hex")}\n`))
  return hash.digest("hex")
}
```

### B1. Disposição, recibo e estado

`modules/relay/src/arm/settlement.ts` @ baseline comum. Blob `5a2c95f1b902a76f63c4b7620112875bc63fa46f`. SHA-256 integral `dc2491de96dbfcc334ad57355addcf9db9506f1ddf83de61afa5d70b31dd39d7` (4384 bytes).

L13–L20:

```typescript
// Relay owns the lock and disposition ordering; callers own identity and durable receipts. No Core dependency.
export const Write = Schema.Struct({ name: Schema.String, value: Schema.Union([Schema.String, Schema.Null]) })
export interface Write extends Schema.Schema.Type<typeof Write> {}
export interface Boundary<E> {
  readonly before: () => Effect.Effect<RelayArm.Evaluation | undefined, E>
  readonly after: (evaluation: RelayArm.Evaluation) => Effect.Effect<void, E>
  readonly disposition?: (evaluation: RelayArm.Evaluation, writes: ReadonlyArray<Write>) => Effect.Effect<void, E>
}
```

L45–L60:

```typescript
// Receipt precedes state writes, follows the engine's ordinary signed disposition. Legacy ledger is untouched.
export const dispose = <E, E2, R>(
  context: Disposition<E>,
  evaluation: Step,
  writes: ReadonlyArray<Write>,
  apply: Effect.Effect<unknown, E2, R>,
) =>
  Effect.gen(function* () {
    if (context.boundary?.disposition) yield* context.boundary.disposition({
      ...evaluation, ledgerSeq: lastSeq(context.ledger),
      ...(evaluation.reason === undefined ? {} : { reason: context.warning + evaluation.reason }),
      ...(context.hosted ? { capture: { complete: context.complete, results: [...context.results] } } : {}),
      ...(context.injection === undefined ? {} : { inject: context.injection }),
    }, writes)
    yield* apply
    return evaluation
```

L63–L67:

```typescript
// Called only by the lock owner, including interrupted-disposition reconciliation. Null means the existing removal.
export const repair = (arm: string, writes: ReadonlyArray<Write>) => Effect.gen(function* () {
  if (!ArmState.held(arm)) return yield* new Invalid({ reason: "disposition repair requires the run lock" })
  if (writes.some((write) => !/^[A-Za-z0-9._-]+$/.test(write.name) || write.name === "." || write.name === ".."))
    return yield* new Invalid({ reason: "invalid disposition repair file" })
```

### B2. Release refaz a mesma WP

`modules/relay/src/arm/evaluate.ts` @ baseline comum. Blob `3e4675d89217e12c1b852f7bc50ff49c3aa59983`. SHA-256 integral `a404c11fc270299ecc76def0fb40ad4ff2a146f4dc817a030394d33f4e0b064c` (41405 bytes).

L67–L70:

```typescript
/**
 * Writes the `release` file of a parked arm under its run lock. The next evaluation records `human-release` before
 * consuming it, resets that gate's retry, round and claim state and grades the same WP again; a release never waives
 * a control. Only the owner's path may call this (Maestro condition 2): no evaluation releases an arm.
```


### B3. Lock e settlement nativo

`packages/core/src/relay.ts` @ baseline comum. Blob `25fb509203f933a2e8b0f311c3fc8f9476d53e16`. SHA-256 integral `446774386bf8020528bdc2138a066fd9dc4b214d3288dc069cb5da9d3cef2b2a` (30225 bytes).

L382–L384:

```typescript
      // Stale only when no evaluation in this process holds it and it predates this process: this process releases
      // every lock it takes synchronously, and a younger lock may belong to a live evaluation it cannot see.
      if (!info?.isDirectory() || ArmState.held(arm) || info.mtimeMs >= performance.timeOrigin) return false
```

L406–L416:

```typescript
      // Noted before the lock goes: a recovery that cannot be recorded does not happen.
      yield* LedgerChain.append({
        ledger: path.join(arm, RelayArm.Files.ledger),
        body: yield* RelayJson.compact({ ts, arm: token, wp, event: "gate-recovered" }),
        gen,
        key,
      })
      yield* Effect.try({
        try: () => rmdirSync(lock),
        catch: () => new ArmState.StateError({ path: lock, reason: "lock-release" }),
      })
```

L491–L498:

```typescript
      evaluate: Effect.fn("Relay.evaluate")(function* (input: RelayArm.EvaluateInput) {
        if (!Schema.is(RelayArm.Token)(input.token)) return { outcome: "refused" as const, failing: [], ledgerSeq: -1 }
        // Bound progressive arms may only cross the guarded native settlement boundary; an API/CLI evaluate cannot
        // spend their retry budget or advance them. Missing/invalid arm data remains the existing engine's defect.
        const bound = yield* ArmLoad.arm(path.join(paths.arms, input.token)).pipe(Effect.option)
        if (Option.isSome(bound) && bound.value.meta.workflow)
          return { outcome: "refused" as const, failing: [], ledgerSeq: -1,
            reason: "WORKFLOW_NATIVE_SETTLEMENT_REQUIRED" }
```


### B4. Judge advisory e indisponibilidade

`modules/relay/src/gate/control.ts` @ baseline comum. Blob `094077ca84e3b394c32e813402feb8ae63272892`. SHA-256 integral `71d27c1b7189edc2038198ac0dfdb5b9155eb5224a2d413bd00ec4e43373567d` (16574 bytes).

L261–L266:

```typescript
    // `jq -r '.blocking // false'` compared with "true", and the same for `diff`.
    const blocking = raw(field(control, "blocking")) === "true"
    const scope = scopeText(field(control, "paths"))
    if (scope === undefined) return graded("fail", "judge:unavailable(invalid-scope)", "", true)
    // The oracle and the ledger hold the raw scope: `${spec_dir}/x.json` is the same question in every run.
    const oracle = oracleSha(scope ? `${criterion} :: ${scope}` : criterion)
```

L272–L287:

```typescript
    if (raw(field(control, "diff")) === "true") {
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
```


### B5. Recheck não é execução; custo não medido

`modules/relay/src/audit.ts` @ baseline comum. Blob `75a97f45b5b5c7cb52110de2206b68457c524e92`. SHA-256 integral `3261c023115c5b642a136328faa824e10289d412207c877f07596a37ce5b8e47` (34332 bytes).

L206–L215:

```typescript
const NOT_RUN_BROKEN: Recheck = {
  status: "not-run",
  items: [],
  note: "Broken or unusable record; sprint comparison not run.",
}
const NOT_RUN_BARE: Recheck = {
  status: "not-run",
  items: [],
  note: "Recorded controls only; no current sprint comparison. Pass --sprint to compare.",
}
```

L335–L346:

```typescript
// Named IDs compared both ways and recorded oracles against the sprint as it is now, without running any check. A
// reachable sprint that cannot be read is invalid, never not-run.
function oracleRecheck(usable: ReadonlyArray<Entry>, sprint: string | undefined): Effect.Effect<Recheck> {
  if (sprint === undefined) return Effect.succeed(NOT_RUN_BARE)
  return sprintText(sprint).pipe(
    Effect.map((text): Recheck => {
      const current = Result.flatMap(text, sprintOracles)
      if (Result.isFailure(current)) return { status: "invalid", items: [], sprint, reason: current.failure }
      return compare(usable, current.success)
    }),
  )
}
```

L528–L529:

```typescript
    if (priced.length === 0)
      return { total: null, states, macros: [], note: "this run recorded no cost data — not zero cost, unmeasured" }
```


### C1. Host Claude e autorização

`modules/engine-adapters/claude-code/src/v2/host.ts` @ baseline comum. Blob `fa5708ad05b2e77d7b08074cf6b84f031e274b96`. SHA-256 integral `630e68e234e862cdd5d2b6d33732e3e7072fe0145b60d0a476c985a379bd6e1e` (41462 bytes).

L38–L42:

```typescript
const GOVERNED_PLAYBOOK = "maestro-run-governed"
const GOVERNED_DENIAL = `Load the ${GOVERNED_PLAYBOOK} playbook with \`mcp__${MCP_SERVER}__skill\` before governed Maestro tools.`
// Session ids whose governed playbook has loaded: a governed tool is refused until its session has one.
const governedLoaded = new Set<string>()
const isGoverned = (name: string) => name.startsWith("maestro_") && !name.startsWith("maestro_arsenal_") && name !== "maestro_workflows"
```

L49–L49:

```typescript
const SUBAGENT_TOOLS = ["Agent", "Task"]
```

L158–L178:

```typescript
                if (SUBAGENT_TOOLS.includes(tool)) return { allow: false, reason: SUBAGENTS_REFUSED }
                // An agent whose rules deny `*` still reaches the Orchestra tools it holds, which sit behind ToolSearch.
                if (tool === TOOL_SEARCH) return { allow: true }
                if (HOST_REACH.has(tool)) return { allow: false, reason: OUTSIDE }
                if (tool.startsWith(MCP_PREFIX)) {
                  const name = tool.slice(MCP_PREFIX.length)
                  if (isGoverned(name) && !governedLoaded.has(turn.session.id)) return { allow: false, reason: GOVERNED_DENIAL }
                  if (!learned.has(toolUseID)) callIDs.set(name, [...(callIDs.get(name) ?? []), toolUseID])
                  learned.add(toolUseID)
                  // The registry settles the Orchestra tool's own permissions when the runner executes it.
                  return { allow: true }
                }
                if (turn.agent.id === "maestro" && !PERMISSIONS[tool] && !MAESTRO_BOOKKEEPING.has(tool))
                  return { allow: false, reason: UNMAPPED }
                return Effect.runPromise(
                  turn.authorize({
                    callID: toolUseID,
                    tool,
                    ...permission(tool, input, turn.session.location.directory),
                    safety: safetyCall(tool, input),
                  }).pipe(
```

L580–L588:

```typescript
  mcp.instance.server.setRequestHandler(CallToolRequestSchema, async (request, extra) => {
    const tool = tools.find((item) => item.name === request.params.name)
    if (!tool) return { content: [{ type: "text" as const, text: `Orchestra tool ${request.params.name} is not available.` }], isError: true }
    // A cancelled Claude turn aborts `extra.signal`; interrupting the run stops the Orchestra tool with it.
    const settlement = await Effect.runPromise(
      execute({ id: callID(tool.name), name: tool.name, input: request.params.arguments ?? {} }),
      { signal: extra.signal },
    )
    if (tool.name === "skill" && request.params.arguments?.name === GOVERNED_PLAYBOOK && settlement.result.type !== "error") governedLoad()
```

### C2. Canal real por lançamento

`modules/app-dock/src/socket-transport.ts` @ baseline comum. Blob `bdb749fdb2707e486b57e85d5921faa1c122ac20`. SHA-256 integral `545f1026e03420188cffa85cd0514608e6b1ae579a46bce009d67c5853c63afd` (1687 bytes).

L5–L17:

```typescript
// The desktop-owned V2 `serve` child has no utility port. Electron main hands it a loopback WebSocket and a per-launch
// token instead; messages keep the utility port's shapes, one JSON value per text frame.

export const URL_ENV = "ORCHESTRA_DOCK_URL"
export const TOKEN_ENV = "ORCHESTRA_DOCK_TOKEN"

/** The Dock channel this process was given, or undefined when it runs outside the desktop. */
export function fromEnv(env: Record<string, string | undefined> = process.env): Transport | undefined {
  const url = env[URL_ENV]
  const token = env[TOKEN_ENV]
  if (!url || !token) return undefined
  return connect(url, token)
}
```

L24–L24:

```typescript
  const socket = new WebSocket(url, { headers: { authorization: `Bearer ${token}` } } as unknown as string[])
```

### C3. Retry de ação delimitado

`modules/app-dock/src/app-dock.ts` @ baseline comum. Blob `ad81a43b726abe216e5dc7cf45768698aaf59c03`. SHA-256 integral `e70b35aea0b041ab27f01823ecee2893d0738b657a4de1f67121ac016dc8e980` (55918 bytes).

L357–L360:

```typescript
  // Locate and mutate within one tool call so UI churn between model turns cannot stale the ref.
  // Uniqueness is decided over the whole tree, then a second whole-tree scan must pick the same control by the same
  // rule and supplies a current ref. Only a certainly-undispatched stale target is located again; unknown outcomes are
  // never replayed.
```

L380–L390:

```typescript
      return toJSON({ code: "target-changed", outcome: "not-dispatched", item: compactItem(winner.item) })
    // Each native page is a new observation that retires the refs of earlier pages, so a winner before the last
    // page needs a scan that stops on its page to hold a live ref, re-identified the same way.
    const live = current.page === fresh.pages ? current
      : only(located(await find(context, loose, (scan) => scan.pages >= winner.page, clock)), query).found.find((match) =>
        same(match, winner))
    if (Date.now() >= clock.deadline) return compactScan(expired(all), "target-search-incomplete")
    if (live === undefined) return toJSON({ code: "target-changed", outcome: "not-dispatched", item: compactItem(winner.item) })
    return Promise.resolve(run(live.item, clock)).catch((error: unknown) => {
      if (!(error instanceof NativeRPCError) || error.code !== "stale-ref" || error.outcome !== "not-dispatched" || attempt >= 1) throw error
      return act(context, query, run, clock, attempt + 1)
```


### C4. Janitor observador e indisponibilidade

`modules/janitor/src/scan.ts` @ baseline comum. Blob `e4512251b7db3fc10981766565ba5e47918bf513`. SHA-256 integral `9ed10a9066296f67c8eafac4168cd3dd39fe6f5fc4fdf6afff7dace11cede4bf` (13691 bytes).

L7–L10:

```typescript
// Read-only allowlist. No rm/kill/prune here. Actions happen only via explicit UI click.
const Allowlist = new Set(["ps", "df", "du", "lsof", "docker", "git", "vm_stat", "memory_pressure", "powershell.exe"])
const ScannerTimeout = Duration.seconds(5)
const ScannerOutputBytes = 256 * 1024
```

L201–L209:

```typescript
export function scannerUnavailable(binary: string): Finding {
  return {
    kind: "scanner",
    severity: "attention",
    summary: `Scanner indisponível: ${binary}`,
    evidence: `Não foi possível executar ${binary}.`,
    suggestion: "Verificar suporte da plataforma e disponibilidade do comando.",
  }
}
```

L347–L350:

```typescript
export const scan = Effect.fn("Janitor.scan")(function* () {
  const groups = yield* Effect.all([readDf(), readProcesses(), readPorts()], { concurrency: "unbounded" })
  return summarize(groups.flat())
})
```

## Limites preservados

Prova exclusivamente estática. Não demonstra approval exercitada, build/extração, Relay executado, CI, conexão Claude/Dock, Janitor ativo ou publicação Atlas. Runtime não observado permanece NOT_RUN; custo/tentativas não medidos permanecem UNKNOWN. Recortes parciais não provam propriedades de caminhos não exibidos. A principal conserva 16 arquivos-fonte integrais e o manifesto para pedidos de evidência.
