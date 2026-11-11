# Exact supplementary source evidence — frozen Core L1 A

Revision `a-l1-evidence-v1`; scope `orchestra.s1`; all source bytes are from `1cde2ff7a71bcf7aecb5d030917b577165135d38`.

These excerpts complement the original compact evidence. They do not replace bodies, source captures, earlier review payloads or original read-status records. The claim captions below were authored for this revision; the fenced source content is byte-exact and contains no inserted line numbers or ellipses. Source code shows implementation, repository instructions/READMEs show stated intent, and neither is a product execution receipt.

Original compact evidence SHA256: `1d28ad12ce7c525d230e42486b6bccd691104d5e6acd4a815728dda7b8ed8676`. Body identity, exact source blob/full-file SHA256, line span and excerpt SHA256 are recorded below and in `supplement-excerpt-map.json`. Some spans overlap an earlier snippet where a complete branch/transaction is necessary; every added span includes new source lines absent from the compact projection.

## Artifact → excerpt map

| Frozen artifact key | Existing compact excerpts | Added exact excerpts |
| --- | --- | --- |
| `s1.core.session-admission` | C001, C002 | AEX001, AEX002, AEX003, AEX004, AEX005, AEX006 |
| `s1.core.session-execution` | C003, C004, C005, C006, C007 | AEX007, AEX008, AEX009, AEX010, AEX011, AEX096 |
| `s1.core.persistence` | C008, C009, C010, C011, C012, C013 | AEX012, AEX013, AEX014, AEX015, AEX016, AEX017, AEX018, AEX019 |
| `s1.core.context` | C014, C015, C016, C017, C018, C019 | AEX009, AEX010, AEX020, AEX021, AEX022, AEX023, AEX024, AEX025, AEX026, AEX027, AEX096 |
| `s1.core.tools` | C020, C021, C022, C023, C024 | AEX028, AEX029, AEX030, AEX031, AEX032, AEX033, AEX034, AEX035 |
| `s1.core.security` | C025, C026, C027, C028, C029, C030, C031 | AEX009, AEX036, AEX037, AEX038, AEX039, AEX040, AEX041, AEX042, AEX043, AEX044, AEX045, AEX046 |
| `s1.core.configuration` | C032, C033, C034 | AEX047, AEX048, AEX049 |
| `s1.core.project` | C035, C036, C037, C038 | AEX050, AEX051, AEX052, AEX053, AEX054 |
| `s1.core.extensions` | C039, C040, C041, C042, C043, C044 | AEX055, AEX056, AEX057, AEX058, AEX059, AEX060, AEX061 |
| `s1.core.capability` | C045, C046, C047, C048 | AEX062, AEX063, AEX064, AEX065, AEX066 |
| `s1.core.automation` | C049, C050, C051, C052, C053, C054 | AEX067, AEX068, AEX069, AEX070 |
| `s1.core.research` | C055, C056, C057, C058, C059 | AEX071, AEX072, AEX073, AEX074, AEX075 |
| `s1.core.runtime` | C060, C061, C062, C063, C064, C065 | AEX076, AEX077, AEX078, AEX079, AEX080, AEX081, AEX082, AEX083, AEX084, AEX085, AEX086, AEX087 |
| `s1.core.models` | C066, C067, C068, C069, C070 | AEX088, AEX089, AEX095 |
| `s1.core.economy` | C071, C072, C073, C074 | AEX090, AEX091, AEX092 |
| `s1.core.boundaries` | C075, C076, C077, C078, C079, C080, C081 | AEX093, AEX094 |
| `s1.core.entry` | C082, C083 | AEX015, AEX046, AEX095, AEX096 |

## Preserved conflicts and mandatory limits

- Session rules: the runner merges Session rules (AEX009) while ordinary PermissionV2.configured returns selected-agent permissions. Both executable branches are included. No universal enforcement/ignoring claim is substituted.
- Bash: original C030 preserves the old unsandboxed wording. Added foreground/background permission→wrapper branches and the current AGENTS requirement preserve the actual conditional confinement boundary. C027/C028 preserve no-requirement/fallback cases.
- Permission rejection: original C026 and C031 retain implementation fan-out versus one-request guide wording. No source here resolves that conflict by fiat.
- Binary read: original C022 and C024 preserve the current supported-image restriction versus the earlier broad binary description.
- Native MCP bounds remain normative README authority. The transport implementation was not captured/read here; behavioral guarantees beyond the inspected policy/registration boundary remain mandatory gaps.
- 599 unread implementation leaves, seven orientation-only frozen entries and external engine/OS/provider boundaries remain outside exhaustive semantic acceptance. This revision supplies material source context; it does not certify those members or qualify runtime.

## Exact source spans

### AEX001

**Artifacts:** `s1.core.session-admission`.

**Claim/limit supported:** Existing Session identity wins before applying new creation fields.

**Authority:** `observed_implementation`. **Source:** `packages/core/src/session.ts:402a192a69bcad6a4b08c695657e24ff5e335f93`, lines 357–364.

**Source commit:** `1cde2ff7a71bcf7aecb5d030917b577165135d38`; **full source SHA256:** `d8c38d46bc6b78ec23d7dae7525fa2ad4c4f07f3f6b5963248e0a0e96d1fbe58`; **excerpt SHA256:** `545b68e4f4e81fdebcfa738e1083607ed3342bfdfa04430886fa4ae2663bb8fb` (440 bytes).

````text
    const result = Service.of({
      create: Effect.fn("V2Session.create")(function* (input) {
        const sessionID = input.id ?? SessionSchema.ID.create()
        const recorded = yield* store.get(sessionID)
        if (recorded) return recorded
        if (input.parentID) yield* result.get(input.parentID)
        const project = yield* projects.resolve(input.location.directory)
        yield* ProjectV2.record(db, events, project)
````

### AEX002

**Artifacts:** `s1.core.session-admission`.

**Claim/limit supported:** Concurrent creation adopts the recorded Session; post-create hooks cannot undo it.

**Authority:** `observed_implementation`. **Source:** `packages/core/src/session.ts:402a192a69bcad6a4b08c695657e24ff5e335f93`, lines 393–414.

**Source commit:** `1cde2ff7a71bcf7aecb5d030917b577165135d38`; **full source SHA256:** `d8c38d46bc6b78ec23d7dae7525fa2ad4c4f07f3f6b5963248e0a0e96d1fbe58`; **excerpt SHA256:** `fd501736789c987505cf539d6d0b2253dc655766a5a95b6f94be17e5168c3659` (1104 bytes).

````text
          .pipe(
            Effect.as({ type: "created" } as const),
            Effect.catchDefect((defect) => {
              if (!(defect instanceof SessionProjector.SessionAlreadyProjected)) {
                return Effect.die(defect)
              }
              // Concurrent creation lost the projection race. The existing Session identity wins.
              return store
                .get(sessionID)
                .pipe(
                  Effect.flatMap((session) =>
                    session ? Effect.succeed({ type: "existing", session } as const) : Effect.die(defect),
                  ),
                )
            }),
          )
        if (projected.type === "existing") return projected.session
        // TODO: Restore recorded sessions onto replacement synchronized workspaces in a future API slice.
        const created = yield* result.get(sessionID).pipe(Effect.orDie)
        // `session-start` hooks run once a new Session is stored; their outcome never undoes it.
        yield* hook(created, { operation: "session-start" }).pipe(Effect.exit)
        return created
````

### AEX003

**Artifacts:** `s1.core.session-admission`.

**Claim/limit supported:** Prompt hooks occur before admission; an already durable message skips re-asking and leaves retry reconciliation to admission.

**Authority:** `observed_implementation`. **Source:** `packages/core/src/session.ts:402a192a69bcad6a4b08c695657e24ff5e335f93`, lines 304–325.

**Source commit:** `1cde2ff7a71bcf7aecb5d030917b577165135d38`; **full source SHA256:** `d8c38d46bc6b78ec23d7dae7525fa2ad4c4f07f3f6b5963248e0a0e96d1fbe58`; **excerpt SHA256:** `0e976f3b322643b171e0988a9e6dd049175836bd52bf8f6a9236b9aefc49b6d5` (1348 bytes).

````text
    // Before admission and interruptible, since an Ask waits for a person: a refused prompt is never admitted. A message
    // ID that already names a durable prompt is left to admission, which reconciles an exact retry or refuses a
    // conflict, without asking again. It reads the Session first, as admission did.
    const promptHooks = Effect.fnUntraced(function* (input: {
      readonly id: SessionMessage.ID
      readonly sessionID: SessionSchema.ID
      readonly prompt: PromptInput.Prompt
    }) {
      const session = yield* result.get(input.sessionID)
      if ((yield* SessionInput.find(db, input.id)) || (yield* store.message(input.id))) return []
      return yield* hook(session, { operation: "prompt", text: input.prompt.text, messageID: input.id }).pipe(
        Effect.catch((error) => {
          const err = error as { _tag?: string; reason?: string; message?: string }
          return Effect.fail(
            new PromptBlockedError({
              sessionID: session.id,
              reason: err._tag === "ToolSafety.Denied" ? (err.reason ?? "relay-hook-location-acquisition") : "relay-hook-location-acquisition",
              detail: err._tag === "ToolSafety.Denied" ? (err.message ?? "Prompt hooks could not be evaluated.") : "Prompt hooks could not be evaluated.",
            }),
          )
        }),
      )
````

### AEX004

**Artifacts:** `s1.core.session-admission`.

**Claim/limit supported:** Historical prompt reconciliation needs the original durable Prompted event for delivery and verifies all projection identity before inserting a promoted inbox row.

**Authority:** `observed_implementation`. **Source:** `packages/core/src/session/input.ts:d945b00cf43d03b923cc90d51970d47e2dd3a9c2`, lines 96–158.

**Source commit:** `1cde2ff7a71bcf7aecb5d030917b577165135d38`; **full source SHA256:** `c5c418685f90aac45034890e2f8a2e2ee9787505e0134b9331a7edbb6be6e7bc`; **excerpt SHA256:** `29dc5faed3607388dc907b139a1c20e8f27a98792bcc2112beec5a7b101b847f` (3136 bytes).

````text
// User projections omit delivery. Only their original durable Prompted event can establish it.
const reconcileHistorical = Effect.fn("SessionInput.reconcileHistorical")(function* (
  db: DatabaseService,
  input: Parameters<typeof equivalent>[1] & { readonly id: SessionMessage.ID },
) {
  const version = SessionEvent.Prompted.durable?.version
  if (version === undefined) return yield* Effect.die("Prompted event is not durable")
  return yield* db
    .transaction(
      (tx) =>
        Effect.gen(function* () {
          const existing = yield* find(tx, input.id)
          if (existing !== undefined) {
            if (!equivalent(existing, input)) return yield* Effect.die(new LifecycleConflict({ id: input.id }))
            return existing
          }
          const row = yield* tx.select().from(SessionMessageTable).where(eq(SessionMessageTable.id, input.id)).get()
          if (row === undefined) return
          if (row.session_id !== input.sessionID || row.type !== "user")
            return yield* Effect.die(new LifecycleConflict({ id: input.id }))
          const message = Schema.decodeUnknownOption(SessionMessage.User)({ ...row.data, id: row.id, type: row.type })
          const event = yield* tx
            .select()
            .from(EventTable)
            .where(and(eq(EventTable.aggregate_id, row.session_id), eq(EventTable.seq, row.seq)))
            .get()
          if (Option.isNone(message) || event?.type !== Event.versionedType(SessionEvent.Prompted.type, version))
            return yield* Effect.die(new LifecycleConflict({ id: input.id }))
          const provenance = Schema.decodeUnknownOption(SessionEvent.Prompted.data)(event.data)
          if (Option.isNone(provenance)) return yield* Effect.die(new LifecycleConflict({ id: input.id }))
          const canonical = Admitted.make({
            id: message.value.id,
            sessionID: input.sessionID,
            prompt: Prompt.fromUserMessage(message.value),
            promptContext: message.value.promptContext,
            delivery: provenance.value.delivery,
            timeCreated: message.value.time.created,
            admittedSeq: row.seq,
            promotedSeq: row.seq,
          })
          if (
            provenance.value.messageID !== row.id ||
            !matchesProjection(canonical, { ...provenance.value, timeCreated: provenance.value.timestamp }) ||
            DateTime.toEpochMillis(canonical.timeCreated) !== row.time_created ||
            !equivalent(canonical, input)
          )
            return yield* Effect.die(new LifecycleConflict({ id: input.id }))
          yield* tx
            .insert(SessionInputTable)
            .values({
              id: canonical.id,
              session_id: canonical.sessionID,
              prompt: encodePrompt(canonical.prompt),
              prompt_context: canonical.promptContext,
              delivery: canonical.delivery,
              admitted_seq: row.seq,
              promoted_seq: row.seq,
              time_created: row.time_created,
            })
            .run()
          return canonical
        }),
      { behavior: "immediate" },
````

### AEX005

**Artifacts:** `s1.core.session-admission`.

**Claim/limit supported:** Steers use the admission cutoff and sequence order; queue promotion takes one oldest pending row.

**Authority:** `observed_implementation`. **Source:** `packages/core/src/session/input.ts:d945b00cf43d03b923cc90d51970d47e2dd3a9c2`, lines 348–390.

**Source commit:** `1cde2ff7a71bcf7aecb5d030917b577165135d38`; **full source SHA256:** `c5c418685f90aac45034890e2f8a2e2ee9787505e0134b9331a7edbb6be6e7bc`; **excerpt SHA256:** `f564f6bda160c6849aa224f7b0799525b154c2ae1d0efb9720741b2b28b71a95` (1271 bytes).

````text
export const promoteSteers = Effect.fn("SessionInput.promoteSteers")(function* (
  db: DatabaseService,
  events: EventV2.Interface,
  sessionID: SessionSchema.ID,
  cutoff: number,
) {
  const rows = yield* db
    .select()
    .from(SessionInputTable)
    .where(
      and(
        eq(SessionInputTable.session_id, sessionID),
        isNull(SessionInputTable.promoted_seq),
        eq(SessionInputTable.delivery, "steer"),
        lte(SessionInputTable.admitted_seq, cutoff),
      ),
    )
    .orderBy(asc(SessionInputTable.admitted_seq))
    .all()
    .pipe(Effect.orDie)
  return yield* publish(db, events, sessionID, rows)
})

export const promoteNextQueued = Effect.fn("SessionInput.promoteNextQueued")(function* (
  db: DatabaseService,
  events: EventV2.Interface,
  sessionID: SessionSchema.ID,
) {
  const row = yield* db
    .select()
    .from(SessionInputTable)
    .where(
      and(
        eq(SessionInputTable.session_id, sessionID),
        isNull(SessionInputTable.promoted_seq),
        eq(SessionInputTable.delivery, "queue"),
      ),
    )
    .orderBy(asc(SessionInputTable.admitted_seq))
    .limit(1)
    .get()
    .pipe(Effect.orDie)
  return row === undefined ? false : yield* publish(db, events, sessionID, [row]).pipe(Effect.as(true))
````

### AEX006

**Artifacts:** `s1.core.session-admission`.

**Claim/limit supported:** Prompted promotes and writes visible projection; PromptAdmitted only projects admission under the event machinery.

**Authority:** `observed_implementation`. **Source:** `packages/core/src/session/projector.ts:e5d7ca7d65d1da035a136557b08e2a264c788da5`, lines 283–310.

**Source commit:** `1cde2ff7a71bcf7aecb5d030917b577165135d38`; **full source SHA256:** `41e2b996cc570b3db0cc844619454f61234fd499390d5cefa340a6ad2cb0a6ba`; **excerpt SHA256:** `8969842e430658f60b746267f931c44bcf9edcbbc3051031bd7939968eaa6610` (1200 bytes).

````text
    yield* events.project(SessionEvent.Prompted, (event) =>
      Effect.gen(function* () {
        if (event.durable === undefined) return yield* Effect.die("Durable Session event is missing aggregate sequence")
        yield* SessionInput.projectPrompted(db, {
          id: event.data.messageID,
          sessionID: event.data.sessionID,
          prompt: event.data.prompt,
          promptContext: event.data.promptContext,
          delivery: event.data.delivery,
          timeCreated: event.data.timestamp,
          promotedSeq: event.durable.seq,
        })
        yield* run(db, event)
      }),
    )
    yield* events.project(SessionEvent.PromptAdmitted, (event) =>
      Effect.gen(function* () {
        if (event.durable === undefined) return yield* Effect.die("Durable Session event is missing aggregate sequence")
        yield* SessionInput.projectAdmitted(db, {
          admittedSeq: event.durable.seq,
          id: event.data.messageID,
          sessionID: event.data.sessionID,
          prompt: event.data.prompt,
          promptContext: event.data.promptContext,
          delivery: event.data.delivery,
          timeCreated: event.data.timestamp,
        })
      }),
````

### AEX007

**Artifacts:** `s1.core.session-execution`.

**Claim/limit supported:** The drain resolves the stored Session and routes through its concrete Location.

**Authority:** `observed_implementation`. **Source:** `packages/core/src/session/execution/local.ts:e7b758462abfd388f937fb18b79f82f2733dffad`, lines 14–29.

**Source commit:** `1cde2ff7a71bcf7aecb5d030917b577165135d38`; **full source SHA256:** `74621798a88cf5f9cb05306616d1896b752b4f4f001c3ae03bafc2e0b3910f97`; **excerpt SHA256:** `463ff50d2ddcbd617ad3cb761f13ac765941dca5e0b2acb6672ae0bcb42316ad` (897 bytes).

````text
    const store = yield* SessionStore.Service
    const locations = yield* LocationServiceMap.Service
    const coordinator = yield* SessionRunCoordinator.make<SessionSchema.ID, SessionRunner.RunError>({
      drain: Effect.fnUntraced(function* (sessionID: SessionSchema.ID, force) {
        const session = yield* store.get(sessionID)
        if (!session) return yield* Effect.die(`Session not found: ${sessionID}`)
        return yield* SessionRunner.Service.use((runner) => runner.run({ sessionID, force })).pipe(
          Effect.provide(locations.get(session.location)),
          Effect.mapError((error) => error as SessionRunner.RunError),
          Effect.tapCause((cause) =>
            Cause.hasInterruptsOnly(cause)
              ? Effect.void
              : Effect.logError("Failed to drain Session", cause).pipe(Effect.annotateLogs({ sessionID })),
          ),
        )
      }),
````

### AEX008

**Artifacts:** `s1.core.session-execution`.

**Claim/limit supported:** Stop targets the exact process-local entry and clears pendingWake; it is not a durable cluster lease.

**Authority:** `observed_implementation`. **Source:** `packages/core/src/session/run-coordinator.ts:526a1e28f6027d744a95f145159be9cc59109ac2`, lines 136–153.

**Source commit:** `1cde2ff7a71bcf7aecb5d030917b577165135d38`; **full source SHA256:** `369d3e9a2f8769b363b50937c628a291dab3f874b6a2d5f31b9a307fbf349cfa`; **excerpt SHA256:** `ee5da7fa4926e6f783028cc9cf5d4c3a64162aecbdfabf6ba2be146cd45a9ecd` (634 bytes).

````text
    const stop = (key: Key, expected?: Entry<E>): Effect.Effect<void> =>
      Effect.suspend(() => {
        const entry = active.get(key)
        // The entry object is process-local ownership. A completed waiter's successor is a different owner.
        if (entry?.owner === undefined || (expected !== undefined && entry !== expected)) return Effect.void
        entry.stopping = true
        entry.pendingWake = false
        return Fiber.interrupt(entry.owner)
      })

    return {
      active: Effect.sync(() => new Set(active.keys())),
      run,
      wake,
      interrupt: (key) => stop(key),
      exclusive,
    }
  })
````

### AEX009

**Artifacts:** `s1.core.session-execution`, `s1.core.security`, `s1.core.context`.

**Claim/limit supported:** Stored placement and governance precede promotion; agent and Session rules are materialized; missing context is initialized before input visibility and new input resets the step allowance.

**Authority:** `observed_implementation`. **Source:** `packages/core/src/session/runner/llm.ts:c3ad8d87a58923d40797d38a77ff65367bbe66b6`, lines 185–215.

**Source commit:** `1cde2ff7a71bcf7aecb5d030917b577165135d38`; **full source SHA256:** `03b1068354e6bc049f2f30125f413f2b2a966817ac59e69e98bce561c87305c7`; **excerpt SHA256:** `40a74fe87d62c5123691e911ff20e4b37e59b8e4d3d30ed7c6cfeeb3cee56802` (1724 bytes).

````text
    const runTurnAttempt = Effect.fn("SessionRunner.runTurn")(function* (
      sessionID: SessionSchema.ID,
      promotion: SessionInput.Delivery | undefined,
      step: number,
      recoverOverflow?: typeof compaction.compactAfterOverflow,
    ) {
      const session = yield* getSession(sessionID)
      if (session.location.directory !== location.directory || session.location.workspaceID !== location.workspaceID)
        return yield* Effect.interrupt
      // Before agent selection and promotion: a refused turn leaves pending input pending.
      yield* governance.beforeTurn(session)
      const agent = yield* agents.select(session.agent)
      // A Session's own permission rules, after its agent's as the earlier runtime merged them, so a Session rule wins over the agent's.
      const effectiveRules = [
        ...(agent.info?.permissions.map((rule) => ({ ...rule })) ?? []),
        ...(yield* store.permissions(session.id)),
      ]
      const initialized = yield* SessionContextEpoch.initialize(db, loadSystemContext(session.id, agent), session.id)
      const toolFibers = yield* FiberSet.make<void, ToolOutputStore.Error>()
      let needsContinuation = false
      let currentStep = step
      if (promotion) {
        const cutoff = yield* EventV2.latestSequence(db, session.id)
        let promoted = 0
        if (promotion === "steer") promoted = yield* SessionInput.promoteSteers(db, events, session.id, cutoff)
        if (promotion === "queue") {
          promoted += Number(yield* SessionInput.promoteNextQueued(db, events, session.id))
          promoted += yield* SessionInput.promoteSteers(db, events, session.id, cutoff)
        }
        if (promoted > 0) {
          currentStep = 1
````

### AEX010

**Artifacts:** `s1.core.session-execution`, `s1.core.context`.

**Claim/limit supported:** History follows baselineSeq; the final provider step advertises no tools; hosted engine history bypasses the Core provider compaction transform.

**Authority:** `observed_implementation`. **Source:** `packages/core/src/session/runner/llm.ts:c3ad8d87a58923d40797d38a77ff65367bbe66b6`, lines 237–270.

**Source commit:** `1cde2ff7a71bcf7aecb5d030917b577165135d38`; **full source SHA256:** `03b1068354e6bc049f2f30125f413f2b2a966817ac59e69e98bce561c87305c7`; **excerpt SHA256:** `20b4596f1e6b2a622cceb5448be2e95c4c957eba7be06e6c7f722cc31af213d0` (2273 bytes).

````text
      const modelRef = model ? SessionRunnerModel.reference(model) : (session.model ?? agent.info?.model)
      const entries = yield* SessionHistory.entriesForRunner(db, session.id, system.baselineSeq)
      const context = entries.map((entry) => entry.message)
      const workflow = yield* RelayWorkflowSession.current(session.id).pipe(Effect.provide(workflowContext), Effect.orDie)
      if (workflow?.view.pending) return { needsContinuation: yield* RelayWorkflowSession.reconcile(workflow).pipe(
        Effect.provide(workflowContext), Effect.map((next) => next === true), Effect.orDie), step: currentStep }
      if (workflow?.view.state === "complete") return { needsContinuation: false, step: currentStep }
      const isLastStep = currentStep >= (agent.info?.steps ?? DEFAULT_MAX_STEPS)
      if (!isLastStep) yield* mcp.ready()
      const stepTools = narrowStepTools(workflow?.view.tools, workflow?.view.tools?.mcp ? yield* mcp.tools() : {})
      const toolMaterialization = isLastStep ? undefined : yield* tools.materialize([...effectiveRules, ...stepTools.hidden])
      const promptCacheKey = /^ses_[0-9a-f]{64}$/.test(session.id) ? session.id.slice(4) : session.id
      const contextText = [system.baseline, workflow?.view.instructions].filter((part): part is string => !!part)
      const systemText = agent.info?.system ? [agent.info.system, ...contextText] : contextText
      // Only provider-model turns pass through the compaction transform; a hosted engine receives its history as is.
      const messages = model
        ? yield* compaction.transform({
            sessionID: session.id,
            messages: [...toLLMMessages(context, model), ...(isLastStep ? [Message.assistant(MAX_STEPS_PROMPT)] : [])],
            model,
            tools: toolMaterialization?.definitions ?? [],
          })
        : []
      const request = model && LLM.request({
        model,
        http: {
          headers: SessionRunnerModel.sessionHeaders(model, session.id, session.parentID),
        },
        providerOptions: { openai: { promptCacheKey } },
        system: systemText.map(SystemPart.make),
        messages: [...messages],
        tools: toolMaterialization?.definitions ?? [],
        toolChoice: isLastStep ? "none" : undefined,
      })
````

### AEX011

**Artifacts:** `s1.core.session-execution`.

**Claim/limit supported:** Interrupting a drain cancels all of that Session’s pending permission and question requests.

**Authority:** `observed_implementation`. **Source:** `packages/core/src/session/runner/llm.ts:c3ad8d87a58923d40797d38a77ff65367bbe66b6`, lines 671–682.

**Source commit:** `1cde2ff7a71bcf7aecb5d030917b577165135d38`; **full source SHA256:** `03b1068354e6bc049f2f30125f413f2b2a966817ac59e69e98bce561c87305c7`; **excerpt SHA256:** `95796df62c475859629546adb71ab326f1a99a1e1041c82d9ccc8815eb5a3259` (559 bytes).

````text
    // Stop interrupts the drain. The turn ends, so its open permission and question requests end with it.
    const run = (input: { readonly sessionID: SessionSchema.ID; readonly force: boolean }) =>
      drain(input).pipe(
        Effect.tapCause((cause) =>
          recordFailure(input.sessionID, cause).pipe(Effect.catchCause(() => Effect.void)),
        ),
        Effect.onInterrupt(() =>
          permissions
            .cancelSession(input.sessionID)
            .pipe(Effect.andThen(questions.cancelSession(input.sessionID))),
        ),
      )
````

### AEX012

**Artifacts:** `s1.core.persistence`.

**Claim/limit supported:** An unknown nonempty database is refused; fresh schema initialization uses an immediate transaction with a second existence check.

**Authority:** `observed_implementation`. **Source:** `packages/core/src/database/migration.ts:b3d38c72425f3bae7f5730140070b251a8a4c8e7`, lines 21–48.

**Source commit:** `1cde2ff7a71bcf7aecb5d030917b577165135d38`; **full source SHA256:** `3586274f5aa72a80d5645f5caea718d3c9234f69c15ca8ddbfbb8c0b5f37186d`; **excerpt SHA256:** `c1fb370d27ce41606007dde9a0bd656cfc4e11c4289c5d319cf387527d108d67` (1407 bytes).

````text
export function apply(db: Database, input: Migration[] = migrations) {
  return lock.withPermit(
    Effect.gen(function* () {
      const tables = yield* db.all<{ name: string }>(
        sql`SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%'`,
      )
      if (tables.some((table) => table.name === "session")) return yield* applyExisting(db, input)
      if (tables.length > 0) return yield* Effect.die("Database is not empty and has no session table")
      // IMMEDIATE takes the write lock up front, so a second process (CLI and desktop share one database file)
      // waits here instead of both creating the schema; the check inside the lock sees what the first one did.
      yield* db.transaction((tx) =>
        Effect.gen(function* () {
          const created = yield* tx.get(sql`SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'session'`)
          if (created) return
          yield* schema.up(tx)
          yield* tx.run(
            sql`CREATE TABLE ${sql.identifier("migration")} (id TEXT PRIMARY KEY, time_completed INTEGER NOT NULL)`,
          )
          yield* Effect.forEach(input, (migration) =>
            tx.run(
              sql`INSERT INTO ${sql.identifier("migration")} (id, time_completed) VALUES (${migration.id}, ${Date.now()})`,
            ),
          )
        }),
        { behavior: "immediate" },
      )
    }),
  )
````

### AEX013

**Artifacts:** `s1.core.persistence`.

**Claim/limit supported:** Unknown journal entries are refused; pending migrations first get VACUUM INTO backup and retention pruning.

**Authority:** `observed_implementation`. **Source:** `packages/core/src/database/migration.ts:b3d38c72425f3bae7f5730140070b251a8a4c8e7`, lines 55–94.

**Source commit:** `1cde2ff7a71bcf7aecb5d030917b577165135d38`; **full source SHA256:** `3586274f5aa72a80d5645f5caea718d3c9234f69c15ca8ddbfbb8c0b5f37186d`; **excerpt SHA256:** `0241d309fced3f5c3de127746e7302969483361f4294f5123d86fac04893603d` (1815 bytes).

````text
function applyExisting(db: Database, input: Migration[]) {
  return Effect.gen(function* () {
    const hasJournal = yield* db.get(sql`SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'migration'`)
    const applied = hasJournal
      ? (yield* db.all<{ id: string }>(sql`SELECT id FROM ${sql.identifier("migration")} ORDER BY id`)).map((row) => row.id)
      : []
    const known = new Set(input.map((migration) => migration.id))
    const unknown = applied.filter((id) => !known.has(id))
    if (unknown.length > 0)
      return yield* Effect.die(
        new Error(
          `This database was created by a newer Orchestra version (it has migrations this build does not know: ${unknown.join(", ")}). Update the app before opening it.`,
        ),
      )
    if (input.every((migration) => applied.includes(migration.id))) return
    yield* backup(db, applied.at(-1) ?? "legacy")
    yield* applyOnly(db, input)
  })
}

function backup(db: Database, from: string) {
  return Effect.gen(function* () {
    const file = (yield* db.all<{ file: string | null }>(sql`SELECT file FROM pragma_database_list WHERE name = 'main'`))[0]?.file
    if (!file) return
    const target = `${file}.backup-${from}-${Date.now()}`
    yield* db.run(sql`VACUUM INTO ${target}`).pipe(
      Effect.mapError((error) => new Error(`Could not back up the database before migrating, nothing was changed: ${error}`)),
    )
    prune(file)
  })
}

function prune(file: string) {
  const prefix = `${basename(file)}.backup-`
  readdirSync(dirname(file))
    .filter((name) => name.startsWith(prefix))
    .map((name) => ({ name, time: Number(name.slice(name.lastIndexOf("-") + 1)) }))
    .sort((a, b) => b.time - a.time)
    .slice(KEEP_BACKUPS)
    .forEach((old) => rmSync(join(dirname(file), old.name), { force: true }))
````

### AEX014

**Artifacts:** `s1.core.persistence`.

**Claim/limit supported:** Every pending migration rereads its identity inside an immediate write transaction before running and journaling it.

**Authority:** `observed_implementation`. **Source:** `packages/core/src/database/migration.ts:b3d38c72425f3bae7f5730140070b251a8a4c8e7`, lines 150–166.

**Source commit:** `1cde2ff7a71bcf7aecb5d030917b577165135d38`; **full source SHA256:** `3586274f5aa72a80d5645f5caea718d3c9234f69c15ca8ddbfbb8c0b5f37186d`; **excerpt SHA256:** `af2ef65a37916294556a2247658bc65902e2bede039a0b847e29b5b7e217fe51` (881 bytes).

````text
    for (const migration of input) {
      if (completed.has(migration.id)) continue
      // The semaphore only serialises this process. IMMEDIATE makes another process (CLI and desktop share the
      // database file) wait for the write lock, and the journal is read again inside it, so a migration the other
      // process just applied is skipped instead of failing on a duplicate column.
      yield* db.transaction(
        (tx) =>
          Effect.gen(function* () {
            const done = yield* tx.get(sql`SELECT id FROM ${sql.identifier("migration")} WHERE id = ${migration.id}`)
            if (done) return
            yield* migration.up(tx)
            yield* tx.run(
              sql`INSERT INTO ${sql.identifier("migration")} (id, time_completed) VALUES (${migration.id}, ${Date.now()})`,
            )
          }),
        { behavior: "immediate" },
      )
````

### AEX015

**Artifacts:** `s1.core.persistence`, `s1.core.entry`.

**Claim/limit supported:** Database path, ordered migration identity and generated schema maintenance are user-data/maintenance contracts; history cannot be discarded.

**Authority:** `repository_normative_documentation`. **Source:** `packages/core/src/database/README.md:272a4d3d363f4871b5288d8fb879b9d9b9710d65`, lines 7–38.

**Source commit:** `1cde2ff7a71bcf7aecb5d030917b577165135d38`; **full source SHA256:** `5bd3a917366391323a94bec85ace411f4d8ce1ee098a4ea062bd2f75b1fcaf83`; **excerpt SHA256:** `db62b7d84b0e3928ee3804010a04e6276f17fce37d970474f545aedc071c4191` (2079 bytes).

````text
- `database.ts` opens the database in WAL mode and picks its path. `sqlite.ts` is the driver interface, with `sqlite.bun.ts` and `sqlite.node.ts` as the two implementations.
- `migration.ts` runs the migrations listed in `migration.gen.ts`; the migration bodies are in `packages/core/src/database/migration`.
- `schema.sql.ts` holds the tables owned by this folder; other domains define their own in `sql.ts` files.

## Public entry points and consumers

- Core exports `./database/database`, `./database/migration`, `./database/migration.gen`, `./database/sqlite`, `./database/sqlite.bun` and one export per migration file.
- Consumers: every core domain with tables, the server, the CLI database commands, and `modules/maestro/coordination` and `modules/continuity`, which build on the `Database` service.

## Dependencies and boundaries

- None beyond the core layer rules.

## Assets, schemas and generated files

- `migration.gen.ts` and `schema.gen.ts` are generated by `bun run migration` in `packages/core`; `bun run migration --check` verifies them against `packages/core/schema.json`.
- `packages/core/drizzle.config.ts` globs `./src/**/*.sql.ts` and `./src/**/sql.ts`, so never move `packages/core/src/account/sql.ts`, `packages/core/src/credential/sql.ts`, `packages/core/src/share/sql.ts`, `packages/core/src/control-plane/workspace.sql.ts` or `packages/core/src/data-migration.sql.ts`.

## Persistence, identity and lifetime

- The database is `orchestra.db` under the XDG data path, or the file named by `ORCHESTRA_DB` (a relative name resolves under the data path; `:memory:` is allowed).
- The data path, `ORCHESTRA_DB`, and migration identity and order are user-data contracts: never rename or reorder a shipped migration.

## Commands

- `bun run test:ci core test/database-migration.test.ts test/database-sqlite.test.ts`
- `bun typecheck` from `packages/core`.

## Contracts and verification limits

- The generated files are path-pinned.
- The migration tests cover the real migrations on a scratch database; they do not exercise a user's existing database.
````

### AEX016

**Artifacts:** `s1.core.persistence`.

**Claim/limit supported:** Strict owner mismatch fails; exact replay identity is reconciled; conflicting replay and sequence gaps fail; ordinary foreign owner replay returns without applying.

**Authority:** `observed_implementation`. **Source:** `packages/core/src/event.ts:fa7a39a0c039770d36523723e75c1f228e1142f0`, lines 319–367.

**Source commit:** `1cde2ff7a71bcf7aecb5d030917b577165135d38`; **full source SHA256:** `4da815f4da0f85c45b45b6af49fdfd94889fe0e167025b8b49a6a25805217b80`; **excerpt SHA256:** `1ab9dc1bbff1f5834e04ff170942f361ce9c4357c02bd38826efc0e2e5c8d863` (2741 bytes).

````text
                          if (input?.strictOwner && row?.ownerID && row.ownerID !== input.ownerID) {
                            yield* Effect.die(
                              new InvalidDurableEventError({
                                type: event.type,
                                message: `Replay owner mismatch for aggregate ${aggregateID}: expected ${row.ownerID}, got ${input.ownerID ?? "none"}`,
                              }),
                            )
                          }
                          if (input && input.seq <= latest) {
                            const stored = yield* db
                              .select()
                              .from(EventTable)
                              .where(and(eq(EventTable.aggregate_id, aggregateID), eq(EventTable.seq, input.seq)))
                              .get()
                              .pipe(Effect.orDie)
                            if (
                              stored?.id === event.id &&
                              stored.type === versionedType(definition.type, durable.version) &&
                              isDeepStrictEqual(stored.data, encoded)
                            ) {
                              if (input.ownerID && row?.ownerID == null) {
                                yield* db
                                  .update(EventSequenceTable)
                                  .set({ owner_id: input.ownerID })
                                  .where(eq(EventSequenceTable.aggregate_id, aggregateID))
                                  .run()
                                  .pipe(Effect.orDie)
                              }
                              return
                            }
                            yield* Effect.die(
                              new InvalidDurableEventError({
                                type: event.type,
                                message: `Replay diverged at aggregate ${aggregateID} sequence ${input.seq}`,
                              }),
                            )
                          }
                          if (input && row?.ownerID && row.ownerID !== input.ownerID) {
                            return
                          }
                          const seq = input?.seq ?? latest + 1
                          if (input && seq !== latest + 1) {
                            yield* Effect.die(
                              new InvalidDurableEventError({
                                type: event.type,
                                message: `Sequence mismatch for aggregate ${aggregateID}: expected ${latest + 1}, got ${seq}`,
                              }),
                            )
                          }
````

### AEX017

**Artifacts:** `s1.core.persistence`.

**Claim/limit supported:** Projectors, optional commit hook, sequence and sealed event insertion execute before the same immediate transaction closes.

**Authority:** `observed_implementation`. **Source:** `packages/core/src/event.ts:fa7a39a0c039770d36523723e75c1f228e1142f0`, lines 383–425.

**Source commit:** `1cde2ff7a71bcf7aecb5d030917b577165135d38`; **full source SHA256:** `4da815f4da0f85c45b45b6af49fdfd94889fe0e167025b8b49a6a25805217b80`; **excerpt SHA256:** `a50c7fba057d40929d3f447d3415f68062ec87d8755948ff7e078a42cf9fecb7` (2358 bytes).

````text
                            durable: { aggregateID, seq, version: durable.version },
                          } as Payload
                          for (const projector of list) {
                            yield* projector(committed, origin)
                          }
                          if (commit) yield* commit(seq)
                          yield* db
                            .insert(EventSequenceTable)
                            .values([{ aggregate_id: aggregateID, seq, owner_id: input?.ownerID }])
                            .onConflictDoUpdate({
                              target: EventSequenceTable.aggregate_id,
                              set: {
                                seq,
                                ...(input?.ownerID && row?.ownerID == null ? { owner_id: input.ownerID } : {}),
                              },
                            })
                            .run()
                            .pipe(Effect.orDie)
                          const predecessor = yield* db
                            .select(EventSeal.columns)
                            .from(EventTable)
                            .where(and(eq(EventTable.aggregate_id, aggregateID), eq(EventTable.seq, latest)))
                            .get()
                            .pipe(Effect.orDie)
                          // Materialize JSON once so user toJSON values cannot change between sealing and storage.
                          const record = {
                            id: event.id,
                            aggregate_id: aggregateID,
                            seq,
                            type: versionedType(definition.type, durable.version),
                            data: Schema.decodeUnknownSync(
                              Schema.fromJsonString(Schema.Record(Schema.String, Schema.Unknown)),
                            )(JSON.stringify(encoded)),
                          }
                          yield* db
                            .insert(EventTable)
                            .values([{ ...record, ...EventSeal.sealRow(record, predecessor) }])
                            .run()
                            .pipe(Effect.orDie)
                          return { aggregateID, seq }
                        }),
                      { behavior: "immediate" },
                    )
````

### AEX018

**Artifacts:** `s1.core.persistence`.

**Claim/limit supported:** The implementation explicitly refuses combining persist:false with a commit hook.

**Authority:** `observed_implementation`. **Source:** `packages/core/src/event.ts:fa7a39a0c039770d36523723e75c1f228e1142f0`, lines 449–455.

**Source commit:** `1cde2ff7a71bcf7aecb5d030917b577165135d38`; **full source SHA256:** `4da815f4da0f85c45b45b6af49fdfd94889fe0e167025b8b49a6a25805217b80`; **excerpt SHA256:** `ad25c69fef13db609caf4715cc41668d1835ba63cf23316e3c5ab57bc56e2397` (268 bytes).

````text
          if (!persist && commit)
            return yield* Effect.die(
              new InvalidDurableEventError({
                type: event.type,
                message: "Local commit hooks cannot be combined with persist:false",
              }),
            )
````

### AEX019

**Artifacts:** `s1.core.persistence`.

**Claim/limit supported:** The durable stream subscribes to wakes before reading history and advances from stored durable events.

**Authority:** `observed_implementation`. **Source:** `packages/core/src/event.ts:fa7a39a0c039770d36523723e75c1f228e1142f0`, lines 681–699.

**Source commit:** `1cde2ff7a71bcf7aecb5d030917b577165135d38`; **full source SHA256:** `4da815f4da0f85c45b45b6af49fdfd94889fe0e167025b8b49a6a25805217b80`; **excerpt SHA256:** `58f5e77cb92bfa09ab33668b43a2c7920f519242421e1e2eb8d6caba622eb863` (861 bytes).

````text
      const durable = (input: { readonly aggregateID: string; readonly after?: number }): Stream.Stream<Payload> =>
        Stream.unwrap(
          Effect.gen(function* () {
            const wakes = yield* subscribeDurable(input.aggregateID)
            let sequence = input.after ?? -1
            const read = Effect.suspend(() => readAfter(input.aggregateID, sequence)).pipe(
              Effect.tap((events) =>
                Effect.sync(() => {
                  sequence = events.at(-1)?.durable?.seq ?? sequence
                }),
              ),
            )
            const historical = yield* read
            const live = Stream.fromSubscription(wakes).pipe(
              Stream.mapEffect(() => read),
              Stream.flattenIterable,
            )
            return Stream.concat(Stream.fromIterable(historical), live)
          }),
````

### AEX020

**Artifacts:** `s1.core.context`.

**Claim/limit supported:** Scoped registrations reject duplicate keys; load sorts keys and provides the current turn only to load effects.

**Authority:** `observed_implementation`. **Source:** `packages/core/src/system-context/registry.ts:9402523a4b03cb21465da1285e2488eb7d2c11bd`, lines 38–60.

**Source commit:** `1cde2ff7a71bcf7aecb5d030917b577165135d38`; **full source SHA256:** `27505e7f29016e62fc521c6d20a132003d1487c9e7099859cd7c1cab4ff1952e`; **excerpt SHA256:** `ecac098645532cea0c8a548d72ff9d96d662279194d3110946c977d16c948d62` (1058 bytes).

````text
    return Service.of({
      register: Effect.fn("SystemContextRegistry.register")(function* (entry) {
        yield* Effect.acquireRelease(
          Ref.modify(entries, (current) => {
            if (current.some((item) => item.key === entry.key)) return [false, current]
            return [true, [...current, entry]]
          }).pipe(
            Effect.flatMap((added) =>
              added ? Effect.void : Effect.die(`Duplicate system context entry key: ${entry.key}`),
            ),
            Effect.as(entry),
          ),
          (entry) => Ref.update(entries, (current) => current.filter((item) => item !== entry)),
        )
      }),
      load: Effect.fn("SystemContextRegistry.load")(function* (turn) {
        const current = (yield* Ref.get(entries)).toSorted((a, b) => (a.key < b.key ? -1 : a.key > b.key ? 1 : 0))
        return SystemContext.combine(
          yield* Effect.forEach(current, (entry) => entry.load, { concurrency: "unbounded" }).pipe(
            Effect.provideService(Turn, turn),
          ),
        )
      }),
````

### AEX021

**Artifacts:** `s1.core.context`.

**Claim/limit supported:** Configured project instructions must resolve inside the project while global inputs have distinct authority.

**Authority:** `observed_implementation`. **Source:** `packages/core/src/instruction-context.ts:6ba99cade2574448b9a8008b544791581b22bb11`, lines 70–80.

**Source commit:** `1cde2ff7a71bcf7aecb5d030917b577165135d38`; **full source SHA256:** `1ad05d900edbf814b3ed68200eb5f452089a112de60cf8b8eae0d1553d0896e1`; **excerpt SHA256:** `274c7c9215b2aebc3861c5731466f564d3d12becc2340e5a14c63c0e182ba3f0` (557 bytes).

````text
              : [pattern]
            return yield* Effect.forEach(targets, (target) =>
              fs.resolve(target).pipe(Effect.map((resolved) => ({ path: resolved, allowed: isGlobal || contains(project, resolved) }))),
            )
          }),
      )).flat()
      // A project instruction that escapes the project makes the whole context unavailable, so it fails closed.
      return {
        paths: Array.dedupe(resolved.filter((item) => item.allowed).map((item) => item.path)),
        escaped: resolved.some((item) => !item.allowed),
      }
````

### AEX022

**Artifacts:** `s1.core.context`.

**Claim/limit supported:** Escaped, missing discovered or missing configured instructions yield unavailable, not an empty/deleted context.

**Authority:** `observed_implementation`. **Source:** `packages/core/src/instruction-context.ts:6ba99cade2574448b9a8008b544791581b22bb11`, lines 101–119.

**Source commit:** `1cde2ff7a71bcf7aecb5d030917b577165135d38`; **full source SHA256:** `1ad05d900edbf814b3ed68200eb5f452089a112de60cf8b8eae0d1553d0896e1`; **excerpt SHA256:** `6ed6c770dcdc92fceae030443aba30d220dd080dfe04de6a05de80191f7f64e9` (864 bytes).

````text
      const configured = yield* configuredInstructions
      const paths = Array.dedupe([yield* fs.resolve(join(global.config, "AGENTS.md")), ...discovered, ...configured.paths])
      const files = yield* Effect.forEach(
        paths,
        (path) =>
          fs
            .readFileStringSafe(path)
            .pipe(
              Effect.map((content) =>
                content === undefined ? undefined : new File({ path: AbsolutePath.make(path), content }),
              ),
            ),
        { concurrency: "unbounded" },
      )
      if (configured.escaped) return SystemContext.unavailable
      if (files.some((file, index) => file === undefined && (discovered.has(paths[index]) || configured.paths.includes(paths[index]))))
        return SystemContext.unavailable
      return files.filter((file): file is File => file !== undefined)
    })
````

### AEX023

**Artifacts:** `s1.core.context`.

**Claim/limit supported:** Model history is selected by compaction and baseline sequence predicates, rather than deleting prior transcript rows.

**Authority:** `observed_implementation`. **Source:** `packages/core/src/session/history.ts:60f31114138a8920e8e81a031815897568dba211`, lines 24–52.

**Source commit:** `1cde2ff7a71bcf7aecb5d030917b577165135d38`; **full source SHA256:** `1989745f9737d404950f166faf43df5890ccb13df6561eeae106032dc79ae79a`; **excerpt SHA256:** `f19429a085d9a32956012f7d6fa7fb37f3648e6abea03f112e016d44b955cc34` (898 bytes).

````text
const messageRows = Effect.fnUntraced(function* (
  db: DatabaseService,
  sessionID: SessionSchema.ID,
  compaction: { readonly seq: number } | undefined,
  baselineSeq?: number,
) {
  const rows = yield* db
    .select()
    .from(SessionMessageTable)
    .where(
      and(
        eq(SessionMessageTable.session_id, sessionID),
        compaction
          ? or(
              gte(SessionMessageTable.seq, compaction.seq),
              baselineSeq === undefined
                ? undefined
                : and(eq(SessionMessageTable.type, "system"), gt(SessionMessageTable.seq, baselineSeq)),
            )
          : undefined,
        baselineSeq === undefined
          ? undefined
          : or(ne(SessionMessageTable.type, "system"), gt(SessionMessageTable.seq, baselineSeq)),
      ),
    )
    .orderBy(asc(SessionMessageTable.seq))
    .all()
    .pipe(Effect.orDie)
  return rows
````

### AEX024

**Artifacts:** `s1.core.context`.

**Claim/limit supported:** loadAll explicitly retains compacted history.

**Authority:** `observed_implementation`. **Source:** `packages/core/src/session/history.ts:60f31114138a8920e8e81a031815897568dba211`, lines 82–85.

**Source commit:** `1cde2ff7a71bcf7aecb5d030917b577165135d38`; **full source SHA256:** `1989745f9737d404950f166faf43df5890ccb13df6561eeae106032dc79ae79a`; **excerpt SHA256:** `9763c876f419c5da3ea49372375296ab0de4f33e99536e09f9549c95b91498ec` (301 bytes).

````text
/** Every stored message of the Session in order, compacted history included. */
export const loadAll = Effect.fn("SessionHistory.loadAll")(function* (db: DatabaseService, sessionID: SessionSchema.ID) {
  return yield* Effect.forEach(yield* messageRows(db, sessionID, undefined), decodeMessageRow)
})
````

### AEX025

**Artifacts:** `s1.core.context`.

**Claim/limit supported:** The exact default buffer, tail, tool-character and summary-output caps are constants.

**Authority:** `observed_implementation`. **Source:** `packages/core/src/session/compaction.ts:26f09bdbf2f5908199270ad5e4d24f520dee548f`, lines 17–20.

**Source commit:** `1cde2ff7a71bcf7aecb5d030917b577165135d38`; **full source SHA256:** `d6becda5c14c0679b6d5bf509a04631309518bd0ca0ba35d1b6f7e8296266d84`; **excerpt SHA256:** `7537bab717e0c477c077f7061f926e720bda8f5e982a92e60f2ba814c7191302` (136 bytes).

````text
const DEFAULT_BUFFER = 20_000
const DEFAULT_KEEP_TOKENS = 8_000
const TOOL_OUTPUT_MAX_CHARS = 2_000
const SUMMARY_OUTPUT_TOKENS = 4_096
````

### AEX026

**Artifacts:** `s1.core.context`.

**Claim/limit supported:** The compaction LLM request has no tools; provider errors and text are collected before the successful-summary branch already shown in C018.

**Authority:** `observed_implementation`. **Source:** `packages/core/src/session/compaction.ts:26f09bdbf2f5908199270ad5e4d24f520dee548f`, lines 225–242.

**Source commit:** `1cde2ff7a71bcf7aecb5d030917b577165135d38`; **full source SHA256:** `d6becda5c14c0679b6d5bf509a04631309518bd0ca0ba35d1b6f7e8296266d84`; **excerpt SHA256:** `14d823aa81b9a9faedff6cb11924df6dc1a22d59c1e39d687420f779a0aa7008` (646 bytes).

````text
    let failed = false
    yield* dependencies.subagentModels.assert(input.sessionID, SessionRunnerModel.reference(input.model))
    const summarized = yield* dependencies.llm
      .stream(
        LLM.request({
          model: input.model,
          http: input.request.http,
          messages: [Message.user(summaryPrompt)],
          tools: [],
          generation: { maxTokens: summaryOutput },
        }),
      )
      .pipe(
        Stream.runForEach((event) => {
          if (LLMEvent.is.providerError(event)) failed = true
          if (LLMEvent.is.textDelta(event)) chunks.push(event.text)
          return Effect.void
        }),
````

### AEX027

**Artifacts:** `s1.core.context`.

**Claim/limit supported:** The composed default transform preserves messages and afterStep does nothing; alternate behavior requires replacement.

**Authority:** `observed_implementation`. **Source:** `packages/core/src/session/compaction.ts:26f09bdbf2f5908199270ad5e4d24f520dee548f`, lines 313–326.

**Source commit:** `1cde2ff7a71bcf7aecb5d030917b577165135d38`; **full source SHA256:** `d6becda5c14c0679b6d5bf509a04631309518bd0ca0ba35d1b6f7e8296266d84`; **excerpt SHA256:** `8564fd4c3c607f63464add5b4f7cec8f0d0f17aa7cbc92740dace1ffa37cb44c` (539 bytes).

````text
export const node = makeLocationNode({
  service: Service,
  layer: Layer.effect(
    Service,
    Effect.gen(function* () {
      const events = yield* EventV2.Service
      const llm = yield* LLMClient.Service
      const subagentModels = yield* SessionSubagentModels.Service
      const config = yield* Config.Service
      return Service.of({
        ...make({ events, llm, subagentModels, config: yield* config.entries() }),
        transform: (input) => Effect.succeed(input.messages),
        afterStep: () => Effect.void,
      })
````

### AEX028

**Artifacts:** `s1.core.tools`.

**Claim/limit supported:** Canonical Tool.make decodes input and encodes/validates output, mapping violations to ToolFailure.

**Authority:** `observed_implementation`. **Source:** `packages/core/src/tool/tool.ts:2ecde42373ef59b1bf2352e6272141a610feea16`, lines 102–122.

**Source commit:** `1cde2ff7a71bcf7aecb5d030917b577165135d38`; **full source SHA256:** `69633b1e0a9932a7b6d7126f7f9c86a2147869544c295416dfae817e4639643e`; **excerpt SHA256:** `380555d95b7ae4aa1f43c17dd1e3d97d50dcdcd172f5e10cab8509d8eca4387e` (1071 bytes).

````text
    settle: (call, context) =>
      Schema.decodeUnknownEffect(config.input)(call.input).pipe(
        Effect.mapError((error) => new ToolFailure({ message: `Invalid tool input: ${error.message}` })),
        Effect.flatMap((input) =>
          config.execute(input, context).pipe(
            Effect.flatMap((output) =>
              Schema.encodeEffect(config.output)(output).pipe(
                Effect.flatMap((output) => {
                  if (!config.structured || !config.toStructuredOutput)
                    return Effect.succeed({ output, structured: output })
                  return Schema.encodeEffect(config.structured)(config.toStructuredOutput({ input, output })).pipe(
                    Effect.map((structured) => ({ output, structured })),
                  )
                }),
                Effect.mapError(
                  (error) =>
                    new ToolFailure({
                      message: `Tool returned an invalid value for its output schema: ${error.message}`,
                    }),
                ),
              ),
````

### AEX029

**Artifacts:** `s1.core.tools`.

**Claim/limit supported:** Tool.dynamic passes input undecoded to its external owner; local JSON Schema decoding must not be inferred.

**Authority:** `observed_implementation`. **Source:** `packages/core/src/tool/tool.ts:2ecde42373ef59b1bf2352e6272141a610feea16`, lines 156–177.

**Source commit:** `1cde2ff7a71bcf7aecb5d030917b577165135d38`; **full source SHA256:** `69633b1e0a9932a7b6d7126f7f9c86a2147869544c295416dfae817e4639643e`; **excerpt SHA256:** `a3c4679c3514d44d563ddbc8a1dd38567f4d3b4bd5ee3a4ccc2f75aa50729be1` (896 bytes).

````text
/**
 * A tool whose input contract is a JSON Schema owned by another system, such as an MCP server. The input reaches
 * `execute` undecoded: the owner validates it.
 */
export function dynamic(config: {
  readonly description: string
  readonly inputSchema: JsonSchema.JsonSchema
  readonly execute: (input: unknown, context: Context) => Effect.Effect<ToolOutput, ToolFailure>
}): AnyTool {
  const tool = Object.freeze({}) as AnyTool
  const definitions = new Map<string, ToolDefinition>()
  runtimes.set(tool, {
    definition: (name) => {
      const cached = definitions.get(name)
      if (cached) return cached
      const definition = new ToolDefinition({ name, description: config.description, inputSchema: config.inputSchema })
      definitions.set(name, definition)
      return definition
    },
    settle: (call, context) => config.execute(call.input, context),
  })
  return tool
````

### AEX030

**Artifacts:** `s1.core.tools`.

**Claim/limit supported:** Safety inspection precedes contextual bounding; Lean projection is selected only when generic bounding has not already retained a full file.

**Authority:** `observed_implementation`. **Source:** `packages/core/src/tool/registry.ts:ab6a6dc2f8c993aec804ebdfc73d89885e8a1453`, lines 145–173.

**Source commit:** `1cde2ff7a71bcf7aecb5d030917b577165135d38`; **full source SHA256:** `276f5d6bc32ca3020058a0e8acb429301a834d77d0a4382c09c3ebe8b647f085`; **excerpt SHA256:** `0901e6b8ed67a3034c6981bf0958916ed8ee2b375e1bad68f10c9ef83f99bdc8` (1635 bytes).

````text
          const output = attempted.value
          yield* safety.inspect(output)
          const bounded = yield* resources.bound({ sessionID: input.sessionID, toolCallID: input.call.id, output })
          // Lean selects the model view of a complete result only; a bounded result already points at its full file.
          const projected = bounded.outputPaths.length
            ? ToolSafetyOutput.nudge(bounded.output, bounded.outputPaths, yield* resources.limits())
            : location ? yield* lean(input, output, bounded.output, location) : bounded.output
          const result = ToolOutput.toResultValue(projected)
          if (result.type === "error")
            return bounded.outputPaths.length > 0 ? { result, outputPaths: bounded.outputPaths } : { result }
          return bounded.outputPaths.length > 0
            ? { result, output: projected, outputPaths: bounded.outputPaths }
            : { result, output: projected }
        })
      return yield* safety.run(
        invocation,
        acquire ? acquire(invocation, settlement) : settlement,
        (observation) => events ? Effect.gen(function* () {
          yield* events.publish(SessionEvent.Tool.Progress, {
            timestamp: yield* DateTime.now,
            sessionID: input.sessionID,
            assistantMessageID: input.assistantMessageID,
            callID: input.call.id,
            structured: { toolSafety: observation },
            content: [],
          }, { location })
        }) : Effect.void,
        (settlement) => settlement.result.type === "error" ? "failure" : ToolSafetyOutput.outcome(settlement.output),
      ).pipe(
````

### AEX031

**Artifacts:** `s1.core.tools`.

**Claim/limit supported:** Scoped cleanup removes its own registrations, and latest local entries overlay process registrations during materialization.

**Authority:** `observed_implementation`. **Source:** `packages/core/src/tool/registry.ts:ab6a6dc2f8c993aec804ebdfc73d89885e8a1453`, lines 243–274.

**Source commit:** `1cde2ff7a71bcf7aecb5d030917b577165135d38`; **full source SHA256:** `276f5d6bc32ca3020058a0e8acb429301a834d77d0a4382c09c3ebe8b647f085`; **excerpt SHA256:** `a06a94b6ef1b38598f48b9c325a65f0c13b2d57c50944b79c9b8664ef5a7bf91` (1630 bytes).

````text
      register: Effect.fn("ToolRegistry.register")(function* (tools) {
        const entries = Object.entries(tools)
        if (entries.length === 0) return
        yield* Effect.forEach(entries, ([name]) => validateName(name), { discard: true })
        yield* Effect.uninterruptible(
          Effect.gen(function* () {
            const token = {}
            for (const [name, tool] of entries)
              local.set(name, [...(local.get(name) ?? []), { token, registration: { identity: {}, tool } }])
            yield* Effect.addFinalizer(() =>
              Effect.sync(() => {
                for (const [name] of entries) {
                  const registrations = local.get(name)?.filter((registration) => registration.token !== token) ?? []
                  if (registrations.length > 0) local.set(name, registrations)
                  else local.delete(name)
                }
              }),
            )
          }),
        )
      }),
      materialize: Effect.fn("ToolRegistry.materialize")(function* (permissions = [], options) {
        const registrations = new Map(applications.entries())
        for (const [name, entries] of local) {
          const registration = entries.at(-1)?.registration
          if (registration) registrations.set(name, registration)
        }
        for (const [name, registration] of registrations)
          if (whollyDisabled(permission(registration.tool, name), permissions)) registrations.delete(name)
        const definitions = new Map(
          Array.from(registrations, ([name, registration]) => [name, definition(name, registration.tool)] as const),
        )
````

### AEX032

**Artifacts:** `s1.core.tools`.

**Claim/limit supported:** Registry composition depends on safety/output, not PermissionV2; ordinary action/resource authorization remains a leaf boundary.

**Authority:** `observed_implementation`. **Source:** `packages/core/src/tool/registry.ts:ab6a6dc2f8c993aec804ebdfc73d89885e8a1453`, lines 321–334.

**Source commit:** `1cde2ff7a71bcf7aecb5d030917b577165135d38`; **full source SHA256:** `276f5d6bc32ca3020058a0e8acb429301a834d77d0a4382c09c3ebe8b647f085`; **excerpt SHA256:** `ea906471c29ba8d9454c854588d40127e924f466947419a325441a6b21f95891` (646 bytes).

````text
export const node = makeLocationNode({
  service: Service,
  layer,
  deps: [ApplicationTools.node, ToolOutputStore.node, ToolSafety.node],
})

/** Native host composition replacements: captures real Location/Event services while constructing the registry. */
export const nativeNode = makeLocationNode({
  service: Service, layer: nativeLayer,
  deps: [ApplicationTools.node, ToolOutputStore.node, ToolSafety.node, Location.node, EventV2.node],
})
export const nativeToolsNode = makeLocationNode({
  service: Tools.Service, layer: nativeLayer,
  deps: [ApplicationTools.node, ToolOutputStore.node, ToolSafety.node, Location.node, EventV2.node],
````

### AEX033

**Artifacts:** `s1.core.tools`.

**Claim/limit supported:** The generic bound limits contextual text but preserves structured output and media; managed paths remain observable.

**Authority:** `observed_implementation`. **Source:** `packages/core/src/tool-output-store.ts:605a99e72e0482a998e2521a26f025589f81da68`, lines 165–200.

**Source commit:** `1cde2ff7a71bcf7aecb5d030917b577165135d38`; **full source SHA256:** `179b486daca21ebf7aa9302cd7c5135f8afd0d2df1d719ad9826da0fdcbb50d8`; **excerpt SHA256:** `fd4f3b8d80a50b0ffa17b119cfdcb14d0f873db6e8f3bc2dd2b762c1543a9ed9` (1374 bytes).

````text
    const bound = Effect.fn("ToolOutputStore.bound")(function* (input: BoundInput) {
      const outputLimits = yield* limits()
      const media = input.output.content.filter((item) => item.type === "file")
      const text = input.output.content.filter((item) => item.type === "text")
      const contextual =
        input.output.content.length === 0
          ? yield* Effect.try({
              try: () => JSON.stringify(input.output.structured, null, 2) ?? String(input.output.structured),
              catch: (cause) => new StorageError({ operation: "encode", cause }),
            })
          : text.map((item) => item.text).join("")
      if (
        lineCount(contextual) <= outputLimits.maxLines &&
        Buffer.byteLength(contextual, "utf-8") <= outputLimits.maxBytes
      )
        return {
          output: input.output,
          outputPaths: [],
        }

      const outputPath = yield* write(contextual)
      const marker = `... output truncated; full content saved to ${outputPath} ...`

      return {
        output: {
          structured: input.output.structured,
          content: [
            {
              type: "text" as const,
              text: boundedPreview(contextual, marker, outputLimits.maxLines, outputLimits.maxBytes),
            },
            ...media,
          ],
        },
        outputPaths: [outputPath],
      }
````

### AEX034

**Artifacts:** `s1.core.tools`.

**Claim/limit supported:** Default contextual limits and retained-output lifetime are fixed constants.

**Authority:** `observed_implementation`. **Source:** `packages/core/src/tool-output-store.ts:605a99e72e0482a998e2521a26f025589f81da68`, lines 16–19.

**Source commit:** `1cde2ff7a71bcf7aecb5d030917b577165135d38`; **full source SHA256:** `179b486daca21ebf7aa9302cd7c5135f8afd0d2df1d719ad9826da0fdcbb50d8`; **excerpt SHA256:** `d10720a05d25042b0f1f41c05ecdc646a0ca177c6ccc58abb767d63e212f0cc8` (109 bytes).

````text
export const MAX_LINES = 2_000
export const MAX_BYTES = 50 * 1024
export const RETENTION = Duration.days(7)

````

### AEX035

**Artifacts:** `s1.core.tools`.

**Claim/limit supported:** Retention deletes only old tool_* files; capture/body state is not inferred from a model preview.

**Authority:** `observed_implementation`. **Source:** `packages/core/src/tool-output-store.ts:605a99e72e0482a998e2521a26f025589f81da68`, lines 203–215.

**Source commit:** `1cde2ff7a71bcf7aecb5d030917b577165135d38`; **full source SHA256:** `179b486daca21ebf7aa9302cd7c5135f8afd0d2df1d719ad9826da0fdcbb50d8`; **excerpt SHA256:** `3997df78515c887ddd9c50c542c8edc0ff10b38a0d475e050ed83dff1b14db94` (716 bytes).

````text
    const cleanup = Effect.fn("ToolOutputStore.cleanup")(function* () {
      const entries = yield* fs.readDirectory(directory).pipe(Effect.catch(() => Effect.succeed([])))
      const cutoff = Date.now() - Duration.toMillis(RETENTION)
      for (const entry of entries) {
        if (!entry.startsWith("tool_")) continue
        const file = path.join(directory, entry)
        const info = yield* fs.stat(file).pipe(Effect.catch(() => Effect.void))
        const modified = info?.mtime.pipe(
          Option.map((date) => date.getTime()),
          Option.getOrElse(() => 0),
        )
        if (modified !== undefined && modified < cutoff) yield* fs.remove(file).pipe(Effect.catch(() => Effect.void))
      }
````

### AEX036

**Artifacts:** `s1.core.security`.

**Claim/limit supported:** Rule evaluation is last-match with default ask.

**Authority:** `observed_implementation`. **Source:** `packages/core/src/permission.ts:2e3d29d3f1ec1fe805d21af091029721c9fa738e`, lines 76–85.

**Source commit:** `1cde2ff7a71bcf7aecb5d030917b577165135d38`; **full source SHA256:** `19e4a3668e1689c0b9565cb4d09444e155e1a06a571484e37e642d3cff3857d6`; **excerpt SHA256:** `216c5fe263c3dafe28825e350af01962771cab5b94c2c0d2666360c6b48c3911` (328 bytes).

````text
export function evaluate(action: string, resource: string, ...rulesets: Permission.Ruleset[]): Permission.Rule {
  return (
    rulesets
      .flat()
      .findLast((rule) => Wildcard.match(action, rule.action) && Wildcard.match(resource, rule.resource)) ?? {
      action,
      resource: "*",
      effect: "ask",
    }
  )
````

### AEX037

**Artifacts:** `s1.core.security`.

**Claim/limit supported:** Ordinary configured authorization resolves agent permissions, and configured deny precedes saved project allow; compare Session rules in the runner excerpt.

**Authority:** `observed_implementation`. **Source:** `packages/core/src/permission.ts:2e3d29d3f1ec1fe805d21af091029721c9fa738e`, lines 140–170.

**Source commit:** `1cde2ff7a71bcf7aecb5d030917b577165135d38`; **full source SHA256:** `19e4a3668e1689c0b9565cb4d09444e155e1a06a571484e37e642d3cff3857d6`; **excerpt SHA256:** `f13c5dc4f2aa57b618ce0741c79c05b9a6bed23961e40415570768adaf648a07` (1545 bytes).

````text
    const savedRules = EffectRuntime.fnUntraced(function* () {
      return (yield* saved.list({ projectID: location.project.id })).map(
        (item): Permission.Rule => ({ action: item.action, resource: item.resource, effect: "allow" }),
      )
    })

    const configured = EffectRuntime.fn("PermissionV2.configured")(function* (
      sessionID: SessionV2.ID,
      agentID?: AgentV2.ID,
    ) {
      const session = yield* sessions.get(sessionID)
      if (!session) return yield* new SessionV2.NotFoundError({ sessionID })
      const agent = yield* agents.resolve(agentID ?? session.agent)
      return agent?.permissions ?? missingAgentPermissions
    })

    function denied(input: AssertInput, rules: Permission.Ruleset) {
      return input.resources.some((resource) => evaluate(input.action, resource, rules).effect === "deny")
    }

    function relevant(input: AssertInput, rules: Permission.Ruleset) {
      return rules.filter((rule) => Wildcard.match(input.action, rule.action))
    }

    const evaluateInput = EffectRuntime.fnUntraced(function* (input: AssertInput) {
      const rules = yield* configured(input.sessionID, input.agent)
      if (denied(input, rules)) return { effect: "deny" as const, rules }
      const all = [...rules, ...(yield* savedRules())]
      const effects = input.resources.map((resource) => evaluate(input.action, resource, all).effect)
      const effect: Permission.Effect = effects.includes("deny") ? "deny" : effects.includes("ask") ? "ask" : "allow"
      return { effect, rules: all }
````

### AEX038

**Artifacts:** `s1.core.security`.

**Claim/limit supported:** Bash permission precedes profile handling; read-only agents require confinement without fallback; confined background launches are refused.

**Authority:** `observed_implementation`. **Source:** `packages/core/src/tool/bash.ts:6f047c8ba423c3656bbd03ef12f5f41ea6b0c68b`, lines 193–217.

**Source commit:** `1cde2ff7a71bcf7aecb5d030917b577165135d38`; **full source SHA256:** `e16afdfbf390d4350be701b010c5c6be44e36c313deffd2a4761ee827a618473`; **excerpt SHA256:** `ca224d3de695daab052a1baf8ca3b9cddb40374c061036784a06171793c72f06` (1391 bytes).

````text
              yield* permission.assert({
                action: name,
                resources: [input.command],
                save: [input.command],
                sessionID: context.sessionID,
                agent: context.agent,
                source,
              })

              if ((yield* fs.stat(target.canonical)).type !== "Directory")
                return yield* Effect.fail(new Error(`Working directory is not a directory: ${target.canonical}`))

              const project = yield* ToolSafety.RuntimeProfile
              // A read-only agent's shell runs inside the OS sandbox with no write root; a host without one refuses the command.
              const profile = context.agent && READ_ONLY_SHELL.has(context.agent)
                ? {
                    ...project,
                    writeRoots: [],
                    requireSandbox: true,
                    sandbox: { ...project?.sandbox, enabled: true, scratch: true, unconfinedFallback: false },
                  } satisfies ToolSafety.Profile
                : project
              // A background process outlives the call, so a profile that confines shells refuses it.
              if (input.background && (profile?.requireSandbox || profile?.sandbox?.enabled || profile?.sandbox?.readRoots))
                return yield* new ToolSafety.Denied({ reason: "background-process-sandbox-unbound" })
````

### AEX039

**Artifacts:** `s1.core.security`.

**Claim/limit supported:** Background launch preparation uses the same sandbox wrapper with its lifetime bound to the process.

**Authority:** `observed_implementation`. **Source:** `packages/core/src/tool/bash.ts:6f047c8ba423c3656bbd03ef12f5f41ea6b0c68b`, lines 233–245.

**Source commit:** `1cde2ff7a71bcf7aecb5d030917b577165135d38`; **full source SHA256:** `e16afdfbf390d4350be701b010c5c6be44e36c313deffd2a4761ee827a618473`; **excerpt SHA256:** `a912a5db0b6c45314424b6f18fe663b87a9a5df12cdee88f70d37b22bfd7d668` (789 bytes).

````text
              if (input.background) {
                if (Option.isNone(sessionProcess))
                  return yield* new ToolFailure({ message: "Session process registry is unavailable" })
                // The same confinement and environment scrub as a foreground call, kept open for the process's life.
                const launched = yield* sessionProcess.value.launch({
                  sessionID: context.sessionID,
                  command,
                  title: input.command,
                  prepare: (command) =>
                    ToolSafetySandbox.wrap(command, { prepareParents: true }).pipe(
                      Effect.provideService(FSUtil.Service, fs),
                      Effect.provideService(ToolSafety.RuntimeProfile, profile),
                    ),
````

### AEX040

**Artifacts:** `s1.core.security`.

**Claim/limit supported:** Foreground execution wraps before agent-terminal launch; this is the actual order needed to interpret the older unsandboxed claim.

**Authority:** `observed_implementation`. **Source:** `packages/core/src/tool/bash.ts:6f047c8ba423c3656bbd03ef12f5f41ea6b0c68b`, lines 255–267.

**Source commit:** `1cde2ff7a71bcf7aecb5d030917b577165135d38`; **full source SHA256:** `e16afdfbf390d4350be701b010c5c6be44e36c313deffd2a4761ee827a618473`; **excerpt SHA256:** `69e73d0d28d4e608c9b67c5ea24fcbd984e13128d076a6223a3e4155d8e413de` (825 bytes).

````text
              const result = yield* Effect.scoped(Effect.gen(function* () {
                const inspector = OutputInspector.make()
                const wrapped = yield* ToolSafetySandbox.wrap(command, { prepareParents: true }).pipe(
                  Effect.provideService(FSUtil.Service, fs),
                  Effect.provideService(ToolSafety.RuntimeProfile, profile),
                )
                // Same confinement and inspection, but the command runs in a terminal tab the owner can see and answer.
                if (wrapped._tag === "StandardCommand" && AgentTerminal.enabled(wrapped)) {
                  const ran = yield* AgentTerminal.run(pty, {
                    command: wrapped,
                    title: input.command,
                    timeout,
                    maxChars: MAX_CAPTURE_BYTES,
````

### AEX041

**Artifacts:** `s1.core.security`.

**Claim/limit supported:** Environment scrub is limited to tool children and recognized patterns; discovery alone does not establish confinement.

**Authority:** `observed_implementation`. **Source:** `packages/core/src/tool-safety-sandbox.ts:61a252c15cc35fa534593413045a6f54a15b6665`, lines 24–47.

**Source commit:** `1cde2ff7a71bcf7aecb5d030917b577165135d38`; **full source SHA256:** `bbf5091b282f9fbeea862f3ebc3d9365a87a59fb414197eb6524268fbc32478a`; **excerpt SHA256:** `9a7106a9a342184ee35c180abd873c30d9fb08dfc94d26488b6c7126a6e86d18` (1396 bytes).

````text
/** Tool-child environment only. Never applied to provider adapters or the server process. */
export function environment(input: NodeJS.ProcessEnv = process.env) {
  return Object.fromEntries(Object.entries(input).filter(([name, value]) =>
    value !== undefined && !/(?:TOKEN|SECRET|PASSWORD|PASSWD|PRIVATE_KEY|API_KEY|ACCESS_KEY|CREDENTIAL)/i.test(name) &&
    !["SSH_AUTH_SOCK", "SSH_ASKPASS", "GIT_ASKPASS", "ORCHESTRA_AUTH_CONTENT"].includes(name) &&
    !/\b(?:AKIA|ASIA)[A-Z0-9]{16}\b|\bgh[pousr]_[A-Za-z0-9]{36,}\b|\bsk_live_[A-Za-z0-9]{20,}\b/.test(value)))
}

/** The macOS seatbelt launcher. A host without it (or with this pointed elsewhere) has no seatbelt sandbox. */
export const Seatbelt = Context.Reference<string>("@orchestra/ToolSafetySandbox/Seatbelt", {
  defaultValue: () => "/usr/bin/sandbox-exec",
})

/** Discovery performs filesystem checks only; confinement starts when the caller spawns the command. */
export const available = (executable?: string) => Effect.gen(function* () {
  const seatbelt = yield* Seatbelt
  return yield* Effect.tryPromise({
    try: async () => {
      const binary = await which(executable ?? "srt", { nothrow: true })
      if (binary || executable || process.platform !== "darwin") return binary
      return which(seatbelt, { nothrow: true })
    },
    catch: () => new ToolSafety.Denied({ reason: "sandbox-binary-acquisition" }),
  })
````

### AEX042

**Artifacts:** `s1.core.security`.

**Claim/limit supported:** Agent terminal is opt-in, excludes Windows/verbatim command paths and takes an already confined command.

**Authority:** `observed_implementation`. **Source:** `packages/core/src/tool/agent-terminal.ts:d8cbde3d8436081eb9c3815bea334915e6efef0b`, lines 36–44.

**Source commit:** `1cde2ff7a71bcf7aecb5d030917b577165135d38`; **full source SHA256:** `a869ee14c21054a21d7f7adbe289588655f49d3c1cad7d21b6d4f22a30000fc4`; **excerpt SHA256:** `db4250f446e1abe7840677cdbf1a1256ea0f54ac86d9a97558a65b30b4cb52b7` (653 bytes).

````text
export function enabled(command: ChildProcess.StandardCommand) {
  // cmd.exe parses its own command line and needs omni's verbatim form, which a PTY spawn cannot take.
  return Flag.ORCHESTRA_AGENT_TERMINAL && process.platform !== "win32" && OmniSpawner.program(command).verbatim === undefined
}

/**
 * Runs an already confined command in a PTY of its own so the owner sees it in a tab and can answer it. The caller
 * keeps the sandbox scope open until this returns. Resolves undefined on timeout, fails Denied when the output shows a
 * recognized secret, and kills the process on either. A finished command's tab stays, as an exited terminal does.
````

### AEX043

**Artifacts:** `s1.core.security`.

**Claim/limit supported:** Cipher implementation uses AES-256-GCM with a random 12-byte IV and auth tag.

**Authority:** `observed_implementation`. **Source:** `packages/core/src/credential/cipher.ts:829dd497e04ee5729a6ab45cd5164bee9430a641`, lines 27–37.

**Source commit:** `1cde2ff7a71bcf7aecb5d030917b577165135d38`; **full source SHA256:** `599393f98c4a3dbc80ccaaf14bbdaee62417a557dc1425f77fd4781dc8e7edd7`; **excerpt SHA256:** `2b32b9c003c4820d511b3f1b0defe5dc7af350482bf958e35c91231fc9c28a9c` (587 bytes).

````text
export function seal(plain: string, key = keys()[0]) {
  const iv = randomBytes(12)
  const cipher = createCipheriv("aes-256-gcm", key, iv)
  const data = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()])
  return PREFIX + Buffer.concat([iv, cipher.getAuthTag(), data]).toString("base64")
}

/** Returns the plaintext, or undefined when no loaded key opens the sealed text. */
export function open(text: string) {
  const raw = Buffer.from(text.slice(PREFIX.length), "base64")
  return keys().reduce<string | undefined>((plain, key) => plain ?? attempt(key, raw), undefined)
````

### AEX044

**Artifacts:** `s1.core.security`.

**Claim/limit supported:** OS keychain is preferred; fallback to a data-directory key file is explicitly weaker.

**Authority:** `observed_implementation`. **Source:** `packages/core/src/credential/cipher.ts:829dd497e04ee5729a6ab45cd5164bee9430a641`, lines 57–75.

**Source commit:** `1cde2ff7a71bcf7aecb5d030917b577165135d38`; **full source SHA256:** `599393f98c4a3dbc80ccaaf14bbdaee62417a557dc1425f77fd4781dc8e7edd7`; **excerpt SHA256:** `f8cbeb99fd06e013efb47a865c17419a26f493c65d0aea1a80938ce8ea8c797c` (855 bytes).

````text
function load() {
  return Effect.gen(function* () {
    const file = Flag.ORCHESTRA_CREDENTIAL_KEY_FILE
    if (file) {
      yield* Effect.promise(() => refuseNewKey(file))
      return [fileKey(file)]
    }
    const { Global } = yield* Effect.promise(() => import("../global"))
    const fallback = path.join(Global.Path.data, "credential.key")
    const keychain = yield* Effect.tryPromise(() => keychainKey()).pipe(Effect.timeout("10 seconds"), Effect.option)
    if (Option.isSome(keychain)) return [keychain.value, ...(existsSync(fallback) ? [fileKey(fallback)] : [])]
    yield* Effect.logWarning(
      "OS keychain unavailable: stored credentials are encrypted with a key file in the data directory, which is weaker",
      { path: fallback },
    )
    yield* Effect.promise(() => refuseNewKey(fallback))
    return [fileKey(fallback)]
  })
}
````

### AEX045

**Artifacts:** `s1.core.security`.

**Claim/limit supported:** Memory inheritance is opt-in; legacy sealing failure preserves readability; undecodable rows are skipped and left untouched.

**Authority:** `observed_implementation`. **Source:** `packages/core/src/credential.ts:3161ca0d7f1e4c68a372acb97234eab80a9024b2`, lines 83–117.

**Source commit:** `1cde2ff7a71bcf7aecb5d030917b577165135d38`; **full source SHA256:** `d091c6c02c5ba51b930ac55cf8ca473d048f8b336e9dccf310e2c2f6f978b2e8`; **excerpt SHA256:** `d74e28a7457cc84f7f8d8dcedb4ddb6c3e6d7156cf3b1c6190ede36093efa0ab` (1524 bytes).

````text
 * Returns the release database to inherit credentials from, or undefined when
 * this build must stay isolated.
 */
export function inheritedPath(active = Database.path(), release = Database.releasePath()) {
  const flag = Flag.ORCHESTRA_INHERIT_CREDENTIALS
  if (flag === false) return
  if (active === ":memory:" && flag !== true) return
  if (active !== ":memory:" && resolve(active) === resolve(release)) return
  return release
}

export const layerFrom = (release: string | undefined) =>
  Layer.effect(
    Service,
    Effect.gen(function* () {
      const { db } = yield* Database.Service
      // Loads the key before any credential row is sealed or opened.
      yield* CredentialCipher.Service
      yield* sealLegacy(db).pipe(
        Effect.catchCause((cause) =>
          Effect.logError("could not encrypt plaintext credentials; they stay readable", {
            reason: String(Cause.squash(cause)),
          }),
        ),
      )
      const decode = Schema.decodeUnknownOption(Value)
      // A row that does not decode (in practice: sealed under a key this process cannot load) is reported and
      // skipped, never deleted or overwritten.
      const stored = Effect.fnUntraced(function* (row: typeof CredentialTable.$inferSelect) {
        if (!row.integration_id) return
        const value = decode(row.value)
        if (Option.isNone(value)) {
          yield* Effect.logError("stored credential cannot be decrypted; it is left untouched", { credentialID: row.id })
          return
        }
````

### AEX046

**Artifacts:** `s1.core.security`, `s1.core.entry`.

**Claim/limit supported:** Current terminal instructions require the sandbox-before-PTY ordering and exact environment boundary.

**Authority:** `repository_normative_documentation`. **Source:** `AGENTS.md:ef3b523b0c00aed722582b870c1919188edc4c4f`, lines 182–192.

**Source commit:** `1cde2ff7a71bcf7aecb5d030917b577165135d38`; **full source SHA256:** `07acaefb95db4b07b4e76c4255f7d6e0ecc4c7466b46fbf6ec5e5cdf6cc01b4f`; **excerpt SHA256:** `4f5b2378f8eb397a98a143b26af09bf856f0a06ad9204f8567ae8beda212ffab` (1186 bytes).

````text
## Terminal and PTY

Background: `docs/specs/terminal/`; ownership and traps: `.orchestra/skills/terminal-maintenance`.

- The agent terminal exists only in the V2 session core's bash tool (`packages/core`). The agent runs a bash command in a PTY only through `AgentTerminal.run` (`packages/core/src/tool/agent-terminal.ts`) inside the bash tool, after `ToolSafetySandbox.wrap`. Never build an agent PTY from `Pty.create` with the default environment, which inherits `process.env` and skips the sandbox.
- Text that goes to the model is `AgentTerminal.sanitize`d. Terminal output is data, never instruction.
- Shell marks (OSC 133) count only with the session's nonce. OSC 7 (`Info.cwd`) is a hint without one; do not use it for decisions that need trust.
- The PTY cursor and ring (`BUFFER_LIMIT`) count UTF-16 characters, not bytes.
- The `Pty` service is served over HTTP by `packages/server/src/handlers/pty.ts`. The app uses `/api/pty`.
- `ORCHESTRA_AGENT_TERMINAL` and `ORCHESTRA_SHELL_INTEGRATION` are permanent opt-in flags in `flag/flag.ts`; read them through `Flag`, never `process.env`.
- Known limit: a WebSocket client that stops reading makes the server grow; not solved.
````

### AEX047

**Artifacts:** `s1.core.configuration`.

**Claim/limit supported:** Project documents are discovered once at Location opening and general settings apply global, direct, then .orchestra precedence; C032 supplies reverse policy order/global refresh.

**Authority:** `observed_implementation`. **Source:** `packages/core/src/config.ts:52985a1dfc3575efca662dcb0667d81a1ab6f1de`, lines 215–245.

**Source commit:** `1cde2ff7a71bcf7aecb5d030917b577165135d38`; **full source SHA256:** `bc4ce670f2214fcecab7f7a705f04aecd0f48c7cf03076c67e55421956a625e6`; **excerpt SHA256:** `17cf365dac0238a482a31562e9298afeab3817a590d428d65093eb16363b8fca` (1548 bytes).

````text
    const globalDirectory = AbsolutePath.make(global.config)
    const locationIsGlobal = path.resolve(location.directory) === path.resolve(global.config)
    // Read configuration once when this location opens. Later calls reuse these
    // values until the location is reopened.
    const discovered = locationIsGlobal
      ? []
      : yield* fs
          .up({
            targets: [".orchestra", ...names.toReversed()],
            start: location.directory,
            stop: location.project.directory,
          })
          .pipe(Effect.orDie)
    const directories = [
      globalDirectory,
      ...discovered
        .filter((item) => path.basename(item) === ".orchestra")
        .toReversed()
        .map((directory) => AbsolutePath.make(directory)),
    ]
    // A config closer to the opened directory should win over one higher up.
    // Search starts nearby, so reverse the results before applying them.
    const directPaths = discovered.filter((item) => path.basename(item) !== ".orchestra").toReversed()
    const direct = yield* Effect.forEach(directPaths, loadFile).pipe(
      Effect.orDie,
      Effect.map((configs) => configs.filter((config): config is Document => config !== undefined)),
    )
    const supplementary = yield* Effect.forEach(directories, loadDirectory).pipe(Effect.orDie)
    // Apply general settings first and more specific settings last:
    // global config, project files, then `.orchestra` files.
    const configs = [...(supplementary[0] ?? []), ...direct, ...supplementary.slice(1).flat()]
````

### AEX048

**Artifacts:** `s1.core.configuration`.

**Claim/limit supported:** Approve is parent-aware; revoke removes only the folder’s own entry, preserving any trusted parent.

**Authority:** `observed_implementation`. **Source:** `packages/core/src/config/trust.ts:a8b068f1fdb5c01e59ad43c56b9e6241ec3dfc78`, lines 40–56.

**Source commit:** `1cde2ff7a71bcf7aecb5d030917b577165135d38`; **full source SHA256:** `f00fbbf4cb98646c376ff14662e4e43d16ad64b11b439d7abccffae7723569b9`; **excerpt SHA256:** `d2eace66bb17b674247531829de1ab87fd8c3ec15d19057220330530c89f1895` (996 bytes).

````text
/** Approves a project folder in the user's global config. A folder already trusted, directly or through a parent, changes nothing. */
export const approve = Effect.fn("ConfigTrust.approve")(function* (directory: string) {
  const root = yield* canonical(directory)
  const trusted = yield* list()
  if (trusted.some((item) => within(item, root))) return
  yield* Config.updateGlobal({ trustedProjects: [...trusted, root] })
})

/** Removes a folder's own entry from the user's global config. A folder trusted only through a parent stays trusted. */
export const revoke = Effect.fn("ConfigTrust.revoke")(function* (directory: string) {
  const fs = yield* FSUtil.Service
  const root = yield* fs.resolve(directory)
  const trusted = yield* list()
  const resolved = yield* Effect.forEach(trusted, (item) => fs.resolve(item))
  const kept = trusted.filter((_, index) => resolved[index] !== root)
  if (kept.length === trusted.length) return
  yield* Config.updateGlobal({ trustedProjects: kept })
````

### AEX049

**Artifacts:** `s1.core.configuration`.

**Claim/limit supported:** Approval canonicalizes an existing absolute folder and refuses filesystem root.

**Authority:** `observed_implementation`. **Source:** `packages/core/src/config/trust.ts:a8b068f1fdb5c01e59ad43c56b9e6241ec3dfc78`, lines 63–81.

**Source commit:** `1cde2ff7a71bcf7aecb5d030917b577165135d38`; **full source SHA256:** `f00fbbf4cb98646c376ff14662e4e43d16ad64b11b439d7abccffae7723569b9`; **excerpt SHA256:** `c07cc5a986c629e4f7343b329fc5bfb380659d8e2b67f526766c01f64dc6a44f` (997 bytes).

````text
// The real path of an existing absolute folder, so a symlink and its target store as one entry.
const canonical = Effect.fnUntraced(function* (directory: string) {
  const fs = yield* FSUtil.Service
  if (!path.isAbsolute(directory))
    return yield* new DirectoryError({ message: `Project folder must be an absolute path: ${directory}` })
  if (!(yield* fs.isDir(directory)))
    return yield* new DirectoryError({ message: `Project folder does not exist: ${directory}` })
  const real = yield* fs.realPath(directory).pipe(Effect.orDie)
  if (path.parse(real).root === real)
    return yield* new DirectoryError({
      message: "The filesystem root cannot be trusted: it would approve every project on this machine.",
    })
  return real
})

// Whether `target` is `root` or inside it.
export function within(root: string, target: string) {
  const relative = path.relative(path.resolve(root), path.resolve(target))
  return relative.split(path.sep)[0] !== ".." && !path.isAbsolute(relative)
````

### AEX050

**Artifacts:** `s1.core.project`.

**Claim/limit supported:** Repository identity chooses remote, cache, then root commit; no repository returns the global project at filesystem root.

**Authority:** `observed_implementation`. **Source:** `packages/core/src/project.ts:bbedbbf34cbc5b431538db37993c0cc0830fa393`, lines 125–148.

**Source commit:** `1cde2ff7a71bcf7aecb5d030917b577165135d38`; **full source SHA256:** `a430e2c36fdf6544efcb36c6d13da86826083b41073a010d788e8629b9f89a63`; **excerpt SHA256:** `2631a4eb2c67a3812a88e07225a2f208574ba961099f33362eaaa00b267f429f` (1014 bytes).

````text
    const root = Effect.fnUntraced(function* (repo: Git.Repository) {
      const root = (yield* git.history.rootCommits(repo))[0]
      return root ? ID.make(root) : undefined
    })

    const resolve = Effect.fn("Project.resolve")(function* (input: AbsolutePath) {
      const repo = yield* git.repo.discover(input)
      if (!repo) return { id: ID.global, directory: AbsolutePath.make(path.parse(input).root), vcs: undefined }

      const previous = yield* cached(repo.commonDirectory)
      const id = (yield* remote(repo)) ?? previous ?? (yield* root(repo))
      return {
        previous,
        id: id ?? ID.global,
        directory: repo.worktree,
        vcs: { type: "git" as const, store: repo.commonDirectory },
      }
    })

    const commit = Effect.fn("Project.commit")(function* (input: { store: AbsolutePath; id: ID }) {
      yield* fs.writeFileString(path.join(input.store, "orchestra"), input.id).pipe(Effect.ignore)
    })

    return Service.of({ list, directories, resolve, commit })
````

### AEX051

**Artifacts:** `s1.core.project`.

**Claim/limit supported:** Physical resolution follows existing ancestors and bounded dangling symlinks; path authority is not just lexical normalization.

**Authority:** `observed_implementation`. **Source:** `packages/core/src/location-mutation.ts:5c80742365c78301f296d5fe87fd8844a1efc44c`, lines 90–132.

**Source commit:** `1cde2ff7a71bcf7aecb5d030917b577165135d38`; **full source SHA256:** `1eef86e372d56b4137ea0b6576b13f8eff655737d451e2446f87f97c8a02001a`; **excerpt SHA256:** `29ab036acbbfb83b2956cc67a81d1bd69e62659858a2ee37b77a1d0d0aeeff35` (1859 bytes).

````text
    // A dangling symlink is not missing: a write through it creates the file where it points.
    const followDangling = Effect.fnUntraced(function* (start: string) {
      let current = start
      for (let hops = 0; hops < 40; hops++) {
        if ((yield* notFound(fs.realPath(current))) !== undefined) return current
        const link = yield* fs.readLink(current).pipe(Effect.orElseSucceed(() => undefined))
        if (link === undefined) return current
        const parent = (yield* notFound(fs.realPath(path.dirname(current)))) ?? path.dirname(current)
        current = path.resolve(parent, link)
      }
      return current
    })

    const resolvePath = Effect.fnUntraced(function* (requested: string) {
      const absolute = yield* followDangling(requested)
      const existing = yield* notFound(fs.realPath(absolute))
      if (existing !== undefined) {
        const info = yield* fs.stat(existing)
        return {
          canonical: existing,
          type: info.type,
          directory: info.type === "Directory" ? existing : path.dirname(existing),
        } satisfies ResolvedPath
      }

      let anchor = path.dirname(absolute)
      while (true) {
        const canonical = yield* notFound(fs.realPath(anchor))
        if (canonical !== undefined) {
          const info = yield* fs.stat(canonical)
          if (info.type !== "Directory") {
            return yield* new PathError({ path: absolute, reason: "non_directory_ancestor" })
          }
          return {
            canonical: path.resolve(canonical, path.relative(anchor, absolute)),
            directory: canonical,
          } satisfies ResolvedPath
        }
        const parent = path.dirname(anchor)
        if (parent === anchor) return yield* new PathError({ path: absolute, reason: "non_directory_ancestor" })
        anchor = parent
      }
    })
````

### AEX052

**Artifacts:** `s1.core.project`.

**Claim/limit supported:** Checkpoint identity, exact retry and retained owner are checked before requiring the current Session; retries survive source Session deletion.

**Authority:** `observed_implementation`. **Source:** `packages/core/src/project/checkpoint.ts:5972b18ab5b5bd6792447261cd65933aee379e99`, lines 99–132.

**Source commit:** `1cde2ff7a71bcf7aecb5d030917b577165135d38`; **full source SHA256:** `25156c4e4b8cdb91db190f5d388c78b48e198be8511dd95c0aaef4821213531a`; **excerpt SHA256:** `ca177da0a1ce0f23b4dad4e3c1e6ea04fcbc0507177e097ceb4ddc9cc62e6dbf` (1696 bytes).

````text
        const id = `${value.forkID}:${value.attempt}`
        const hash = digest(value.payload)
        return yield* database.db.transaction(
          (tx) =>
            Effect.gen(function* () {
              const existing = yield* tx
                .select({ ...metadata, payload: ProjectCheckpointTable.payload })
                .from(ProjectCheckpointTable)
                .where(eq(ProjectCheckpointTable.id, id))
                .get()
              if (existing) {
                if (
                  existing.sessionID !== value.sessionID ||
                  existing.forkID !== value.forkID ||
                  existing.boundary !== value.boundary ||
                  existing.attempt !== value.attempt ||
                  existing.payload !== value.payload
                )
                  return yield* new CheckpointError({ reason: "conflict" })
                if (existing.digest !== hash) return yield* new CheckpointError({ reason: "corrupt" })
                const { payload, ...result } = existing
                return result
              }

              // Exact retries use the retained record, even after the source Session is deleted.
              // Only insertion resolves current ownership; retries never reassign old checkpoints.
              const session = yield* tx
                .select({ projectID: SessionTable.project_id, directory: SessionTable.directory })
                .from(SessionTable)
                .where(eq(SessionTable.id, value.sessionID))
                .get()
              if (!session) return yield* new CheckpointError({ reason: "missing_session" })

              const createdAt = yield* Clock.currentTimeMillis
````

### AEX053

**Artifacts:** `s1.core.project`.

**Claim/limit supported:** Reads bind project and digest; lists enforce the default and maximum page limits.

**Authority:** `observed_implementation`. **Source:** `packages/core/src/project/checkpoint.ts:5972b18ab5b5bd6792447261cd65933aee379e99`, lines 163–185.

**Source commit:** `1cde2ff7a71bcf7aecb5d030917b577165135d38`; **full source SHA256:** `25156c4e4b8cdb91db190f5d388c78b48e198be8511dd95c0aaef4821213531a`; **excerpt SHA256:** `9ed1983086f1c06748156d8a927d51a64e6f8c62fc66f9d8e1132b48c684d54f` (1090 bytes).

````text
      read: Effect.fn("ProjectCheckpoint.read")(function* (input) {
        const row = yield* database.db
          .select({ ...metadata, payload: ProjectCheckpointTable.payload })
          .from(ProjectCheckpointTable)
          .where(and(eq(ProjectCheckpointTable.project_id, input.projectID), eq(ProjectCheckpointTable.id, input.id)))
          .get()
        if (!row) return undefined
        if (digest(row.payload) !== row.digest) return yield* new CheckpointError({ reason: "corrupt" })
        return row
      }, storageBoundary),
      list: Effect.fn("ProjectCheckpoint.list")(function* (input) {
        const offset = input.offset === undefined ? 0 : input.offset
        const limit = input.limit === undefined ? 20 : input.limit
        if (
          !Number.isSafeInteger(offset) ||
          offset < 0 ||
          offset > Number.MAX_SAFE_INTEGER - 50 ||
          !Number.isSafeInteger(limit) ||
          limit < 1 ||
          limit > 50
        )
          return yield* new CheckpointError({ reason: "invalid_input" })
        const items = yield* database.db
````

### AEX054

**Artifacts:** `s1.core.project`.

**Claim/limit supported:** Fork writes copied projections with new message IDs and negative sequence positions, rather than replaying original side effects.

**Authority:** `observed_implementation`. **Source:** `packages/core/src/session.ts:402a192a69bcad6a4b08c695657e24ff5e335f93`, lines 537–568.

**Source commit:** `1cde2ff7a71bcf7aecb5d030917b577165135d38`; **full source SHA256:** `d8c38d46bc6b78ec23d7dae7525fa2ad4c4f07f3f6b5963248e0a0e96d1fbe58`; **excerpt SHA256:** `6923b7b8546ba3289b82acdfc199241fb1bb9202ae96ddd67a9ae155201955f7` (1188 bytes).

````text
            () =>
              Effect.forEach(
                kept,
                (row, index) =>
                  decode(row).pipe(
                    Effect.orDie,
                    Effect.flatMap((message) => {
                      const { id, type, ...data } = encodeMessage({
                        ...message,
                        id: SessionMessage.ID.create(),
                        ...(message.type === "synthetic" ? { sessionID: forked.id } : {}),
                      })
                      return db
                        .insert(SessionMessageTable)
                        .values({
                          id: SessionMessage.ID.make(id),
                          session_id: forked.id,
                          type,
                          seq: index - kept.length,
                          time_created: row.time_created,
                          data,
                        })
                        .run()
                    }),
                  ),
                { discard: true },
              ),
            { behavior: "immediate" },
          )
          .pipe(Effect.orDie)
        return yield* result.get(forked.id)
      }),
````

### AEX055

**Artifacts:** `s1.core.extensions`.

**Claim/limit supported:** State rebuilds from initial plus ordered transforms, finalizes before commit, and serializes rebuild/read with a semaphore.

**Authority:** `observed_implementation`. **Source:** `packages/core/src/state.ts:116e268bb9edf045985e1598a4e1a3ed1d410872`, lines 63–91.

**Source commit:** `1cde2ff7a71bcf7aecb5d030917b577165135d38`; **full source SHA256:** `237de5f76069595f50c7e7049dc72fe295a6b0ecaa615d849ef5b67ecd9f4189`; **excerpt SHA256:** `bb8eee95e1b8be1ebfc1b768f1565cc3492f0f147da72b8ca9ef167d7567eec7` (1155 bytes).

````text
export function create<State, DraftApi>(options: Options<State, DraftApi>): Interface<State, DraftApi> {
  let state = options.initial()
  let transforms: { run: TransformCallback<DraftApi> }[] = []
  const semaphore = Semaphore.makeUnsafe(1)

  const commit = Effect.fn("State.commit")(function* (next: State) {
    const api = options.draft(next)
    if (options.finalize) yield* options.finalize(api)
    state = next
  })

  const apply = (transform: TransformCallback<DraftApi>, draft: DraftApi) =>
    Effect.suspend(() => {
      const result = transform(draft)
      return Effect.isEffect(result) ? Effect.asVoid(result).pipe(Effect.orDie) : Effect.void
    })

  const materialize = Effect.fnUntraced(function* () {
    const next = options.initial()
    const api = options.draft(next)
    for (const transform of transforms) yield* apply(transform.run, api).pipe(Effect.withSpan("State.reload.update"))
    yield* commit(next)
  })

  const reload = () => semaphore.withPermit(materialize())

  const result: Interface<State, DraftApi> = {
    get: () => state,
    withRead: (read) => semaphore.withPermit(Effect.suspend(() => read(state))),
````

### AEX056

**Artifacts:** `s1.core.extensions`.

**Claim/limit supported:** Plugin activation uses a child scope, publishes only after materialization, and closes/replays after failure.

**Authority:** `observed_implementation`. **Source:** `packages/core/src/plugin.ts:5c3c232bfa46b3f8cfad106c2db4787d6c374818`, lines 115–151.

**Source commit:** `1cde2ff7a71bcf7aecb5d030917b577165135d38`; **full source SHA256:** `8b7221fadc81a9cac0b7a1b3229a3bdb098966c8474c261b9ae971d9ad7d4302`; **excerpt SHA256:** `a81d00696236d7272c0c9920bdeb0bf9173d85d9a58c7560d25490e2b7f75b63` (1786 bytes).

````text
          if (retain && active.has(id)) return
          const child = yield* Scope.fork(scope)
          const reloads = new Set<State.Reload>()
          const token = { scope, id, live: true }
          loading.add(id)
          failures.delete(id)
          const activate = Effect.gen(function* () {
            const existing = active.get(id)
            active.delete(id)
            if (existing) yield* Scope.close(existing, Exit.void)
            yield* effect(host).pipe(
              Scope.provide(child),
              Effect.withSpan("Plugin.load", { attributes: { "plugin.id": id } }),
            )
            yield* settle(reloads, boot).pipe(Scope.provide(child))
            yield* Effect.uninterruptible(
              Effect.gen(function* () {
                yield* events.publish(Event.Added, { id })
                active.set(id, child)
                yield* Effect.forEach(waiters.get(id) ?? [], (waiter) => Deferred.succeed(waiter, undefined), {
                  discard: true,
                })
                waiters.delete(id)
              }),
            ).pipe(Effect.provideService(StateBatch, undefined))
          })
          yield* Effect.uninterruptibleMask((restore) =>
            Effect.gen(function* () {
              const primary = yield* restore(activate).pipe(Effect.exit)
              if (Exit.isSuccess(primary)) return
              active.delete(id)
              const combined = yield* closeAndReplay(child, primary, reloads, boot)
              failures.set(id, combined)
              yield* Effect.forEach(waiters.get(id) ?? [], (waiter) => Deferred.done(waiter, combined), {
                discard: true,
              }).pipe(Effect.ensuring(Effect.sync(() => waiters.delete(id))))
              return yield* combined
````

### AEX057

**Artifacts:** `s1.core.extensions`.

**Claim/limit supported:** Boot retry is collected flush followed by per-plugin reinstall after failure; this is not outer-batch durable atomicity.

**Authority:** `observed_implementation`. **Source:** `packages/core/src/plugin.ts:5c3c232bfa46b3f8cfad106c2db4787d6c374818`, lines 187–207.

**Source commit:** `1cde2ff7a71bcf7aecb5d030917b577165135d38`; **full source SHA256:** `8b7221fadc81a9cac0b7a1b3229a3bdb098966c8474c261b9ae971d9ad7d4302`; **excerpt SHA256:** `26b5001b777fffbd379a0fdbb0a7ac676074fe66f09a6e6dedc03f885bb86c36` (1184 bytes).

````text
    const boot = Effect.fn("Plugin.boot")(function* (
      plugins: Iterable<{ readonly id: ID; readonly effect: PluginRuntime["effect"] }>,
    ) {
      const reloads = new Set<State.Reload>()
      const installed: { readonly id: ID; readonly effect: PluginRuntime["effect"] }[] = []
      const booted = yield* Effect.forEach(
        plugins,
        (plugin) =>
          install(plugin.id, plugin.effect, false, reloads).pipe(
            Effect.andThen(Effect.sync(() => installed.push(plugin))),
          ),
        { discard: true },
      ).pipe(Effect.exit)
      const flushed = yield* flush(reloads).pipe(Effect.exit)
      if (Exit.isSuccess(flushed)) return yield* booted
      // One flush cannot tell which plugin's state failed. Remove the booted plugins, then add them back one at a
      // time so the per-plugin flush rolls back the failing one and stops there, as a boot of plain adds would.
      yield* Effect.forEach(installed.toReversed(), (plugin) => remove(plugin.id).pipe(Effect.exit), { discard: true })
      yield* Effect.forEach(installed, (plugin) => install(plugin.id, plugin.effect, false), { discard: true })
      return yield* booted
    })
````

### AEX058

**Artifacts:** `s1.core.extensions`.

**Claim/limit supported:** Each ordinary MCP call asserts its namespaced permission and forwards cancellation and timeout to the SDK.

**Authority:** `observed_implementation`. **Source:** `packages/core/src/mcp.ts:3d2203cb152ef733ca3b7d3231a302416a1f394b`, lines 235–263.

**Source commit:** `1cde2ff7a71bcf7aecb5d030917b577165135d38`; **full source SHA256:** `73c99e41cceb9e58ba89ca9b7aa93049b5aa3620a962ee5166e5496fc8c78f59`; **excerpt SHA256:** `a96a12bface5460a64ba71b4f8fa58ab12d45c8f9eec707091d51a23721e679b` (1667 bytes).

````text
    const mcpTool = (server: string, client: Client, def: ListToolsResult["tools"][number], timeout: number) =>
      Tool.dynamic({
        description: def.description ?? "",
        inputSchema: { ...def.inputSchema, type: "object", properties: def.inputSchema.properties ?? {} },
        execute: (input, context) =>
          Effect.gen(function* () {
            yield* permission.assert({
              action: McpCatalog.toolName(server, def.name),
              resources: ["*"],
              save: ["*"],
              metadata: { server, tool: def.name },
              sessionID: context.sessionID,
              agent: context.agent,
              source: { type: "tool", messageID: context.assistantMessageID, callID: context.toolCallID },
            })
            const result = yield* Effect.tryPromise((signal) =>
              client.callTool(
                { name: def.name, arguments: isObject(input) ? input : {} },
                CallToolResultSchema,
                // The MCP SDK only sends a progress token when `onprogress` is set, which enables timeout resets.
                { signal, timeout, resetTimeoutOnProgress: true, onprogress: () => {} },
              ),
            )
            if ("toolResult" in result) return yield* Effect.fail(new Error("MCP tool returned no content"))
            if (result.isError) return yield* Effect.fail(new Error(McpCatalog.resultText(result) || "MCP tool returned an error"))
            return { structured: result.structuredContent ?? {}, content: McpCatalog.resultContent(result) }
          }).pipe(Effect.mapError((error) => new ToolFailure({ message: error.message }))),
      })

````

### AEX059

**Artifacts:** `s1.core.extensions`.

**Claim/limit supported:** Stale asynchronous connection/catalog results close their client before registration; connected follows successful tools registration.

**Authority:** `observed_implementation`. **Source:** `packages/core/src/mcp.ts:3d2203cb152ef733ca3b7d3231a302416a1f394b`, lines 283–309.

**Source commit:** `1cde2ff7a71bcf7aecb5d030917b577165135d38`; **full source SHA256:** `73c99e41cceb9e58ba89ca9b7aa93049b5aa3620a962ee5166e5496fc8c78f59`; **excerpt SHA256:** `7596c50ca4f5c6c1b197e640be2c61da9200dc0fca8e6877afd08a00d900b4a9` (1253 bytes).

````text
      blocked.delete(name)
      const startup = server.timeout?.startup ?? found.timeout?.startup ?? DEFAULT_TIMEOUT
      const request = server.timeout?.request ?? found.timeout?.request ?? DEFAULT_TIMEOUT
      const opened = yield* open(name, server, startup)
      const client = opened.client
      if (current.generation !== generation) {
        if (client) yield* Effect.promise(() => client.close().catch(() => undefined))
        return
      }
      if (!client) {
        current.status = opened.status
        return
      }
      const listed = client.getServerCapabilities()?.tools
        ? yield* McpCatalog.tools(client, request).pipe(Effect.result)
        : undefined
      if (current.generation !== generation) return yield* Effect.promise(() => client.close().catch(() => undefined))
      if (listed?._tag === "Failure") {
        yield* Effect.promise(() => client.close().catch(() => undefined))
        current.status = failed(
          McpStdio.failure(opened.transport, new Error(`Listing tools failed: ${messageOf(listed.failure)}`)),
        )
        return
      }
      const defs = listed?.success ?? []
      // Connected is reported only once the server's tools are in the registry.
      current.client = client
````

### AEX060

**Artifacts:** `s1.core.extensions`.

**Claim/limit supported:** Generation invalidation prevents stale in-flight skill loading from refilling a new cache.

**Authority:** `observed_implementation`. **Source:** `packages/core/src/skill.ts:dc8d8f67c6b658ce7716a2b17e0c9b2e517c6db0`, lines 153–172.

**Source commit:** `1cde2ff7a71bcf7aecb5d030917b577165135d38`; **full source SHA256:** `07c062a4f778a329572ba0217df3e72315c61bf5baa135414324af63dd28a18b`; **excerpt SHA256:** `e40643e1c1479fe8d72d0d372730d699ba2c4fdb81dc94c10eec089136e6d2b8` (983 bytes).

````text
    // QUESTION(Dax): Should local skill sources invalidate on filesystem watch
    // events, following the reload policy chosen for other context sources?
    const cache = new Map<string, Info[]>()
    // A write bumps the generation, so a list() that started loading before it cannot refill the cache.
    const generation = { current: 0 }
    const invalidate = () => {
      generation.current++
      cache.clear()
    }
    // Each dropped skill file is reported once, not on every list.
    const shadowed = new Set<string>()
    const list = Effect.fn("SkillV2.list")(function* () {
      const started = generation.current
      const data = state.get()
      const sources: { key: string; skills: Info[] }[] = []
      for (const source of data.sources) {
        const key = Source.key(source)
        const loaded = cache.get(key) ?? (yield* load(source))
        if (generation.current === started) cache.set(key, loaded)
        sources.push({ key, skills: loaded })
````

### AEX061

**Artifacts:** `s1.core.extensions`.

**Claim/limit supported:** OAuth attempts are synchronized in-memory state owned by the Location layer; this map does not establish a durable resumable workflow.

**Authority:** `observed_implementation`. **Source:** `packages/core/src/integration.ts:d6d9a85e8c9b2737b1f09f95700c05663735e6e4`, lines 231–238.

**Source commit:** `1cde2ff7a71bcf7aecb5d030917b577165135d38`; **full source SHA256:** `d1952b88c361ed35ac1dd3b2f736b6aa9588bd7e82db37c1f88fb878f09f9796`; **excerpt SHA256:** `2f145cb1b2e6a1da3e03631f4ca8b4524d65392196c697ca5876a3fd92046bea` (341 bytes).

````text
export const locationLayer = Layer.effect(
  Service,
  Effect.gen(function* () {
    const credentials = yield* Credential.Service
    const events = yield* EventV2.Service
    const scope = yield* Scope.Scope
    const attempts = SynchronizedRef.makeUnsafe(new Map<AttemptID, AttemptEntry>())
    const state = State.create<Data, Draft>({
````

### AEX062

**Artifacts:** `s1.core.capability`.

**Claim/limit supported:** The issued-frame symbol is private and the host boundary expressly does not prove persisted Session/tool-part existence.

**Authority:** `observed_implementation`. **Source:** `packages/core/src/capability/invocation.ts:e2ddcb3e3f0da61b8d9d5fe8c7c74436b844e890`, lines 34–50.

**Source commit:** `1cde2ff7a71bcf7aecb5d030917b577165135d38`; **full source SHA256:** `6f7d95bbb07aa7d3e12c63d56dbf8458bde5b7053aaf51f97b078c41a2da53ae`; **excerpt SHA256:** `a2ae78bd0dff991cf5b4361aaca7432b3a7bd56e284e6f130f3ebedb502b2b8f` (664 bytes).

````text
const issued = Symbol("CapabilityInvocation.issued")
type Frame = Binding & { readonly [issued]: true }
const Current = Context.Reference<Frame | undefined>("@orchestra/core/CapabilityInvocation", {
  defaultValue: () => undefined,
})
const Input = Schema.Struct({
  issuer: Schema.Literals(["app", "core", "sdk"]),
  owner: Capability.Owner,
  invocation: Capability.InvocationRef,
  rootToolName: Schema.NonEmptyString,
  effectiveRules: Permission.Ruleset,
  nativeDenyFloor: Permission.Ruleset,
})

/** Trusted host boundary only: validates caller claims, not persisted Session/tool-part existence. */
export function withContext<A, E, R>(
  input: HostInput,
````

### AEX063

**Artifacts:** `s1.core.capability`.

**Claim/limit supported:** Persisted validation rechecks placement, current root pending/running tool and the exact running child lineage.

**Authority:** `observed_implementation`. **Source:** `packages/core/src/capability/policy.ts:d75718a6ac8d6d3e36c5b791301a68a728be26b0`, lines 35–78.

**Source commit:** `1cde2ff7a71bcf7aecb5d030917b577165135d38`; **full source SHA256:** `9ae8ac1edc77785058071356c0927b1d8c1a019a2b6be5cdf564c3b0dad65022`; **excerpt SHA256:** `ed0cf6e1c4a25ec2b18050e5d5837504dc00fe09d64a29d3194f9e2fb828a196` (2701 bytes).

````text
  const validate = Effect.fn("CapabilityPolicy.validate")(function* (binding: CapabilityInvocation.Binding) {
    const session = yield* sessions.get(binding.owner.sessionID)
    const stored = yield* sessions.message(binding.rootInvocation.assistantMessageID)
    if (
      !session ||
      session.id !== binding.owner.sessionID ||
      session.projectID !== binding.owner.projectID ||
      session.location.directory !== binding.owner.location.directory ||
      session.location.workspaceID !== binding.owner.location.workspaceID ||
      !stored ||
      stored.sessionID !== binding.rootInvocation.sessionID ||
      stored.message.id !== binding.rootInvocation.assistantMessageID ||
      stored.message.type !== "assistant" ||
      stored.message.agent !== binding.rootInvocation.agentID ||
      !stored.message.content.some(
        (part) =>
          part.type === "tool" &&
          part.id === binding.rootInvocation.callID &&
          part.name === binding.rootToolName &&
          (part.state.status === "pending" || part.state.status === "running"),
      )
    )
      return yield* mismatch()
    if (binding.lineage.length > 8) return yield* mismatch()
    yield* Effect.forEach(binding.lineage, (proof, index) => Effect.gen(function* () {
      const parentCallID = index === 0 ? binding.rootInvocation.callID : binding.lineage[index - 1]?.callID
      const row = yield* database.db.select().from(CapabilityChildTable)
        .where(eq(CapabilityChildTable.id, proof.callID)).get().pipe(
          Effect.catchIf((error) => error instanceof SqlError || error instanceof EffectDrizzleQueryError,
            () => Effect.fail(mismatch())),
        )
      if (!row || proof.parentCallID !== parentCallID || !Number.isSafeInteger(proof.ordinal) ||
        proof.ordinal < 1 || proof.ordinal > 64 || proof.callID !== CapabilityInvocation.childID({
          ...binding.rootInvocation, callID: proof.parentCallID,
        }, proof.ordinal) || row.id !== proof.callID || row.session_id !== binding.owner.sessionID ||
        row.agent_id !== binding.owner.agentID || row.assistant_message_id !== binding.rootInvocation.assistantMessageID ||
        row.root_call_id !== binding.rootInvocation.callID || row.root_tool_name !== binding.rootToolName ||
        row.parent_call_id !== proof.parentCallID || row.ordinal !== proof.ordinal || row.depth !== index + 1 ||
        row.tool_name !== proof.toolName || row.request_hash !== proof.requestHash || row.state !== "running")
        return yield* mismatch()
    }), { discard: true })
    if (binding.invocation.callID !== (binding.lineage.at(-1)?.callID ?? binding.rootInvocation.callID))
      return yield* mismatch()
  })
````

### AEX064

**Artifacts:** `s1.core.capability`.

**Claim/limit supported:** Leaf construction/registration is Location-owned and lazy vendor I/O stays first-use; a failed noninterrupt startup sweep is logged.

**Authority:** `observed_implementation`. **Source:** `packages/core/src/capability/tools.ts:1103ab0c8eb3d9d79cc5ff295cb267847eab629e`, lines 36–68.

**Source commit:** `1cde2ff7a71bcf7aecb5d030917b577165135d38`; **full source SHA256:** `7704b7d8c7742deece88da2fd87f6fb2064eb580659548d159565f10893d3b46`; **excerpt SHA256:** `1f073ebdbe1ec722b474dc85fea55007e56ef2d6ae722d8c121a7b2c605f442c` (2436 bytes).

````text
// Stable canonical leaves are registered once per Location. Account resolution and vendor I/O stay first-use.
export const node = makeLocationNode({
  name: "capability/tools",
  layer: Layer.effectDiscard(Effect.gen(function* () {
    const tools = yield* Tools.Service
    const connections = yield* CapabilityConnections.make
    const jobs = yield* CapabilityJobs.make
    const location = yield* Location.Service
    const registry = yield* CapabilityProcessRegistry.Service
    // Startup-only evidence: rows this host never held are lost. A sweep failure must not block the Location.
    yield* CapabilityProcessSweep.run({ jobs, live: registry.live(), startedAt: registry.startedAt,
      placement: { projectID: location.project.id,
        location: Location.Ref.make({ directory: location.directory, workspaceID: location.workspaceID }) } }).pipe(
      Effect.catchCauseIf((cause) => !Cause.hasInterrupts(cause), (cause) => Effect.logWarning("process sweep failed", { cause })))
    const processControl = yield* CapabilityProcessControl.make({ jobs })
    const schedule = yield* CapabilitySchedule.make()
    const artifacts = yield* CapabilityArtifacts.make()
    const channels = yield* CapabilityChannels.make({ connections, jobs, artifacts })
    const media = yield* CapabilityMedia.make()
    const documents = yield* CapabilityDocuments.make()
    const sheets = yield* CapabilitySheets.make()
    const transport = CapabilityMcp.make()
    const discovery = yield* CapabilityDiscovery.make({ source: { listTools: (selection) => transport.listTools(selection).pipe(
      Effect.map((catalog) => CapabilityServiceProviders.filterCatalog(selection.connection.provider, catalog)),
    ) } })
    const execute = yield* CapabilityServiceExecution.make({ transport, discovery, connections, jobs, artifacts,
      filterCatalog: CapabilityServiceProviders.filterCatalog })
    const services = yield* CapabilityServices.make({ discovery, execute })
    yield* tools.register({ ...channels.tools, ...media.tools, ...documents, ...sheets, ...services.tools, ...processControl.tools, ...schedule.tools }).pipe(Effect.orDie)
  }).pipe(Effect.orDie)),
  deps: [ToolRegistry.node, EventV2.node, AgentV2.node, Credential.node, Database.node, Location.node,
    PermissionV2.node, SessionStore.node, Global.node, FSUtil.node,
    CapabilityProcessRegistry.node, LocationMutation.node, AppProcess.node, ScheduledTaskPort.node],
````

### AEX065

**Artifacts:** `s1.core.capability`.

**Claim/limit supported:** The host binds scheduler process state and an absent binding defects explicitly.

**Authority:** `observed_implementation`. **Source:** `packages/core/src/scheduled-task/port.ts:8ea347436e18a93f8dc43926c7fb84108fc0a20c`, lines 7–26.

**Source commit:** `1cde2ff7a71bcf7aecb5d030917b577165135d38`; **full source SHA256:** `5fb969a9e8a030b02e31ff1678e1e0c2887c4e30c3078a5016642131de95ead7`; **excerpt SHA256:** `3e4e3ec6645c53013117f41f8dcdf0041ce290b35a0d91c481b07edd5f70ea5c` (1002 bytes).

````text
// Capability tools reach the scheduler through this port so the Location graph never imports the
// Session graph (Session -> LocationServiceMap -> capability tools would close a type cycle). Location
// graphs hoist their own global nodes, so the running scheduler binds itself here for the process.
export class Service extends Context.Service<Service, ScheduledTaskCapability.Interface>()("@orchestra/v2/ScheduledTaskPort") {}

const state: { bound?: ScheduledTaskCapability.Interface } = {}

/** Called by the scheduler layer; the previous binding is restored when that layer's Scope closes. */
export const bind = (api: ScheduledTaskCapability.Interface) => Effect.acquireRelease(
  Effect.sync(() => {
    const previous = state.bound
    state.bound = api
    return previous
  }),
  (previous) => Effect.sync(() => {
    state.bound = previous
  }),
)

const current = Effect.suspend(() => state.bound ? Effect.succeed(state.bound) : Effect.die("schedule_manage requires the host scheduler"))
````

### AEX066

**Artifacts:** `s1.core.capability`.

**Claim/limit supported:** Transport catalog/session bounds are documented by the native MCP owner; this is normative intent, not a newly observed implementation run.

**Authority:** `repository_normative_documentation`. **Source:** `packages/core/src/capability/mcp/README.md:95f3154aef1625eaac3cd8feb500504996eb074f`, lines 43–70.

**Source commit:** `1cde2ff7a71bcf7aecb5d030917b577165135d38`; **full source SHA256:** `f9b7b9df6645714b942f2adc46c9c1a727def9ea39a1f9e33782519bb14ca662`; **excerpt SHA256:** `dad31b1ba08d4e1cef714ba7f71b284c5b63f5573f4dbbb87bccc912ea80a47b` (1967 bytes).

````text
## Bounds and lifecycle

Defaults: 4 MiB aggregate catalog envelopes (including initialization and all read
SSE framing/notifications), 256 tools, 16 pages, 4 MiB call response envelopes,
256 KiB encoded requests, 30 seconds total acquisition/call, four scoped sessions
per factory, 512 generation identities, and 64 JSON-RPC SSE messages per acquisition
or call. UTF-8 bytes are counted before decoding/buffering/parsing. JSON nesting
is bounded at 64, cursor bytes at 4096, session IDs at 256 visible ASCII characters,
tool names at 256 characters, descriptions at 2048, and credential headers at 16384.
Positive integer options are required; timeout must fit a native timer.
Incoming HTTP headers are subject to native fetch's bounds, not a custom aggregate
header-byte quota. Only the assigned session-ID value has the transport's explicit header bound.

Catalog acquisition returns complete coverage only after the terminal page.
Duplicates, cursor cycles and all exhausted budgets fail. `byteLength` measures
response body bytes, including full envelopes and read SSE framing, not HTTP header
or compressed wire bytes. SSE acquisition ends at the correlated response and cancels
its reader; later unsolicited traffic is not read or included. Repeat session lists
include the original initialization byte cost in their catalog budget.

Generations increase monotonically within a factory. Keys bind Connection/Target
references and generations, owner and approved endpoint; values hash all sorted raw
tools, including schemas, descriptions and metadata. Identical catalogs reuse their
generation. A full identity map fails closed rather than evicting and reusing history.
Create one host factory for the required generation lifetime; generations are not
persisted or deterministic across host restarts: numeric generations depend on each
factory's acquisition order. Credential rotation always requires an explicit new
open; sessions are never shared or pooled.
````

### AEX067

**Artifacts:** `s1.core.automation`.

**Claim/limit supported:** Actions binding is obtained lazily on first operation and provider read adapters are explicit.

**Authority:** `observed_implementation`. **Source:** `packages/core/src/actions.ts:4f81df84763bd63e7680de8fd40c60b583ef68ca`, lines 49–85.

**Source commit:** `1cde2ff7a71bcf7aecb5d030917b577165135d38`; **full source SHA256:** `08c5f306bc1c53b978a4254eba0fc708d9a4bfbb30fb63ead23c237f359fceef`; **excerpt SHA256:** `1da4f54a53d4aa9be81eef8aead409a461a262f0ecadc3467579c5df74eaf214` (2211 bytes).

````text
export const make = Effect.fn("Actions.make")(function* (input: {
  directory: string
  workspaceID?: string
  projectID: string
  stateDirectory: string
  transport?: ActionsContract.Transport
}) {
  const config = { ...input }
  const fs = yield* FSUtil.Service
  const proc = yield* AppProcess.Service
  const transport = config.transport ?? (yield* ActionsTransport.make({ directory: config.directory }))
  const lifetime = yield* Scope.Scope
  const database = yield* Database.Service
  const operations = yield* Effect.cached(ActionsOperations.make(config).pipe(
    Effect.provideService(Database.Service, database), Scope.provide(lifetime),
  ))
  const github = ActionsGitHubRead.make({ transport })
  const gitlab = ActionsGitLabRead.make({ transport })
  const reader = (binding: Actions.Binding) => binding.provider.kind === "github" ? github : gitlab
  const resources = ActionsResources.make({ transport, reader, directory: config.directory, proc })
  const output = (binding: Actions.Binding) => Effect.promise(() => import("./actions/output/index")).pipe(
    Effect.map(({ ActionsOutput }) => ActionsOutput.make({ transport, reader: reader(binding) })),
  )

  // Actions is Location-scoped, but a non-Git Location must still boot other services.
  // Resolve repository state only when an Actions method is requested.
  const store = () => ActionsBinding.make({ ...config, resolve: transport.resolve }).pipe(
    Effect.provideService(FSUtil.Service, fs), Effect.provideService(AppProcess.Service, proc),
  )
  const bindings: ActionsContract.Bindings = {
    list: () => store().pipe(Effect.flatMap((bindings) => bindings.list())),
    create: (input) => store().pipe(Effect.flatMap((bindings) => bindings.create(input))),
    update: (id, input) => store().pipe(Effect.flatMap((bindings) => bindings.update(id, input))),
    remove: (ref) => store().pipe(Effect.flatMap((bindings) => bindings.remove(ref))),
    get: (ref) => store().pipe(Effect.flatMap((bindings) => bindings.get(ref))),
    policy: (ref) => store().pipe(Effect.flatMap((bindings) => bindings.policy(ref))),
    updatePolicy: (ref, policy) => store().pipe(Effect.flatMap((bindings) => bindings.updatePolicy(ref, policy))),
````

### AEX068

**Artifacts:** `s1.core.automation`.

**Claim/limit supported:** Prepare strictly decodes intent, verifies binding revision, reconciles exact retry and refuses capacity/unknown-outcome overflow before insertion.

**Authority:** `observed_implementation`. **Source:** `packages/core/src/actions/operations.ts:83c0b9e03b063bd59bc2d30317f7de85cbb99ee4`, lines 60–96.

**Source commit:** `1cde2ff7a71bcf7aecb5d030917b577165135d38`; **full source SHA256:** `f4180bfeabef99c0eaddace3f1da7242fb8dacd7d63fb948b84cc014f59a89d4`; **excerpt SHA256:** `5b4852195e0aac76b1d9419ba682571f3cc21302168a01c8342ea2feb8eab4a5` (2711 bytes).

````text
  const prepare: ActionsContract.Operations["prepare"] = Effect.fn("ActionsOperations.prepare")(function* (bindingInput, raw) {
    const binding = { ...bindingInput, provider: { ...bindingInput.provider } }
    const invalid = validate(binding)
    if (invalid) return yield* Effect.fail(invalid)
    // Strict decoding rejects extras before encoding elides optional undefined
    // keys. Decode the encoded DTO again to preserve branded identity types.
    const decoded = yield* Schema.decodeUnknownEffect(Schema.toType(Actions.OperationIntent), { onExcessProperty: "error" })(raw).pipe(
      Effect.map((value) => Schema.decodeUnknownSync(Actions.OperationIntent)(Schema.encodeSync(Actions.OperationIntent)(value))),
      Effect.mapError(() => error("invalid_input", "Actions operation intent is invalid")),
    )
    if (decoded.binding.id !== binding.id || decoded.binding.revision !== binding.revision)
      return yield* Effect.fail(error("binding_stale", "Actions operation intent binding changed"))
    // Maintenance commits independently so a refused expired retry still leaves
    // a compact, non-executable tombstone rather than rolling cleanup back.
    yield* safe(database.db.transaction((tx) => Clock.currentTimeMillis.pipe(
      Effect.flatMap((now) => sweep(tx, now)),
    ), { behavior: "immediate" }))
    return yield* safe(database.db.transaction((tx) => Effect.gen(function* () {
      const now = yield* Clock.currentTimeMillis
      const existing = yield* tx.select().from(ActionsOperationTable).where(and(
        eq(ActionsOperationTable.location_key, location), eq(ActionsOperationTable.binding_id, binding.id),
        eq(ActionsOperationTable.client_id, decoded.clientID),
      )).get()
      if (existing) {
        if (!matches(existing, binding) || !equivalent(intent(existing), decoded))
          return yield* Effect.fail(error("intent_conflict", "Actions logical intent was already bound to another command", existing.id))
        const expired = unavailable(existing, now)
        if (expired) return yield* Effect.fail(expired)
        return receipt(existing)
      }
      const ledger = yield* tx.select({ total: count() }).from(ActionsOperationTable).get()
      if (!ledger || ledger.total >= LEDGER_LIMIT)
        return yield* Effect.fail(error("maintenance_required", "Actions admission ledger requires maintenance"))
      const unknown = yield* tx.select({ total: count() }).from(ActionsOperationTable)
        .where(eq(ActionsOperationTable.state, "outcome_unknown")).get()
      if (!unknown || unknown.total >= UNKNOWN_LIMIT)
        return yield* Effect.fail(error("maintenance_required", "Actions unknown outcome storage requires maintenance"))
````

### AEX069

**Artifacts:** `s1.core.automation`.

**Claim/limit supported:** Stale takeover checks exact prior ownership/claim and distinguishes admitted exact retry from void unadmitted dispatch.

**Authority:** `observed_implementation`. **Source:** `packages/core/src/scheduled-task.ts:0a89bbdc576091ca01445e45e1500ed4008898a9`, lines 272–301.

**Source commit:** `1cde2ff7a71bcf7aecb5d030917b577165135d38`; **full source SHA256:** `8c204bd55a8cf8fd1dbddc232f5dfa84b9190822d074ccc72e85594e457af12b`; **excerpt SHA256:** `75232658d0ea0c69eed303e78e05e65b7a85943fe3d5de13c110f143f9c1242f` (1593 bytes).

````text
    // Only a claim whose prompt was admitted happened. It is finished with the exact retry a client would send,
    // which reconciles the admitted prompt and wakes the Session. A claim that never reached admission is void,
    // and its slot is planned again.
    const takeOver = Effect.fn("ScheduledTask.takeOver")(function* (stale: RunRow, now: number) {
      const claimed = yield* immediate(
        Effect.gen(function* () {
          const run = yield* db.select().from(ScheduledTaskRunTable).where(eq(ScheduledTaskRunTable.id, stale.id)).get()
          if (run?.state !== "running" || run.owner !== stale.owner || run.time_claimed !== stale.time_claimed) return
          const task = yield* find(run.task_id)
          if (!task || !run.message_id || run.prompt === null) return
          yield* db
            .update(ScheduledTaskRunTable)
            .set({ owner: lease, time_claimed: now })
            .where(eq(ScheduledTaskRunTable.id, run.id))
            .run()
          return {
            id: run.id,
            task,
            sessionID: run.session_id,
            messageID: run.message_id,
            prompt: run.prompt,
          }
        }),
      )
      if (!claimed) return
      const admitted = yield* SessionInput.find(db, claimed.messageID)
      if (!admitted) return yield* settle(claimed, { type: "void" })
      const retried = yield* dispatch(claimed, true)
      if (retried.type !== "started") yield* Effect.logWarning("Scheduled run retry failed", retried)
      yield* settle(claimed, { type: "started", sessionID: admitted.sessionID })
````

### AEX070

**Artifacts:** `s1.core.automation`.

**Claim/limit supported:** Changing a decision updates standing lineage, while recording an outcome logs a stated reason rather than independently verifying work.

**Authority:** `observed_implementation`. **Source:** `packages/core/src/board/decision.ts:4b219f5b62517b2c4f9749a1a99e6257cfeff167`, lines 90–128.

**Source commit:** `1cde2ff7a71bcf7aecb5d030917b577165135d38`; **full source SHA256:** `7fdd5f2d2d0dfa0414b70b870e4ff75ca62fe7af36c62c90e583663af8833b43`; **excerpt SHA256:** `8acecc7a9f686e37e6a78c98fdcb6ffca32da830f4f6221ddb721978e4002a65` (1817 bytes).

````text
  const activity = yield* log(tx, {
    project: project.id,
    issue: old.issue_id,
    actor: "owner",
    action: "question.answer",
    before: { id: old.question_id, answer_option: old.chosen, answer_text: old.chosen_text },
    after: { id: old.question_id, status: "answered", answer_option: input.option, answer_text: text, decision: next },
  })
  return { result: { activity }, changed: changed(project.id, activity, old.issue_id) }
})

export const outcome = Effect.fnUntraced(function* (tx: Tx, input: Board.DecisionOutcomeInput) {
  const project = yield* loadProject(tx, input.project)
  const row = yield* tx
    .select()
    .from(BoardDecisionTable)
    .where(
      and(
        eq(BoardDecisionTable.project_id, project.id),
        isNull(BoardDecisionTable.overturned_by_id),
        or(eq(BoardDecisionTable.id, input.id as Board.DecisionID), eq(BoardDecisionTable.question_id, input.id as Board.QuestionID)),
      ),
    )
    .orderBy(desc(BoardDecisionTable.answered_at))
    .get()
  if (!row) return yield* new NotFoundError({ message: `No standing decision ${input.id} on ${project.key}.` })
  if (row.outcome === input.outcome) return yield* new RefusedError({ message: "That outcome is already recorded." })
  const now = yield* Clock.currentTimeMillis
  yield* tx.update(BoardDecisionTable).set({ outcome: input.outcome, outcome_at: now }).where(eq(BoardDecisionTable.id, row.id)).run()
  const activity = yield* log(tx, {
    project: project.id,
    issue: row.issue_id,
    actor: "maestro",
    action: "question.answer",
    reason: input.reason,
    before: { id: row.question_id, outcome: row.outcome },
    after: { id: row.question_id, decision: row.id, outcome: input.outcome },
  })
  return { result: { activity }, changed: changed(project.id, activity, row.issue_id) }
````

### AEX071

**Artifacts:** `s1.core.research`.

**Claim/limit supported:** Dependency and host-floor checks precede acquisition; cross-target prefetch is not host execution.

**Authority:** `observed_implementation`. **Source:** `packages/core/src/backend-toolkit/index.ts:e5c8e61d202f8a79a5b967d5abc467a97b58f4a3`, lines 180–198.

**Source commit:** `1cde2ff7a71bcf7aecb5d030917b577165135d38`; **full source SHA256:** `d420651f26050d31c924b078a59fff12081be914cb8cb94685aad720a9275d9a`; **excerpt SHA256:** `f136d164ba697d4df434dc6ef26fe79012c6292f92f21bd201a0221954c0cff0` (1457 bytes).

````text
const request = Effect.fnUntraced(function* (id: string, target: TargetId, host: boolean) {
  const root = yield* Root
  const manifest = yield* Manifest
  const runtimes = yield* Runtimes
  const machine = yield* Machine
  const dependencies = dependencyOrder(manifest, id)
  if (typeof dependencies === "string") return yield* new NotReady({ reason: dependencies })
  const engine = manifest[id]
  const unsupported = "runtime" in engine ? engine.unsupported?.[target] : undefined
  if (unsupported) return yield* new NotReady({ reason: `unsupported-target:${unsupported}` })
  // Before any fetch. A cross-target prefetch (`host` false) is never executed here, so it has no floor to meet.
  const floor = host ? belowFloor(manifest, runtimes, id, target, machine) : undefined
  if (floor) return yield* new NotReady({ reason: `unsupported-target:${id}:${floor}` })
  const directory = path.join(root, "engines", id, `${engine.version}-${target}`)
  const cause = yield* attempts.once(requestKey(directory, host), Effect.gen(function* () {
    yield* Effect.forEach([...dependencies, id], (dependency) => acquire(root, manifest[dependency], runtimes, target, host), { discard: true })
  }))
  if (cause !== undefined) return yield* new NotReady({ reason: cause.startsWith("toolkit-not-ready:") || cause.startsWith("unsupported-target:") ? cause : `toolkit-not-ready:failed:${id}:${cause}` })
  return { executable: executable(engine, directory, target) }
````

### AEX072

**Artifacts:** `s1.core.research`.

**Claim/limit supported:** Config can lower the owner byte caps, never raise them.

**Authority:** `observed_implementation`. **Source:** `packages/core/src/research-toolkit/index.ts:a6e7b3bf6dd0ba44d0f0de5cac3eebe5c9f36095`, lines 52–67.

**Source commit:** `1cde2ff7a71bcf7aecb5d030917b577165135d38`; **full source SHA256:** `9c1bfe5c5a7bc0c8d4d1f835e61031e0cca06b9ed6567415d9d04ff6e84b599c`; **excerpt SHA256:** `8eea3de748bac0964e70c4971f3a78e6ed0119a8c28b58799ce3db7bfaf2af9c` (688 bytes).

````text
/** `Caps` from config `research.limits.*`: each configured value lowers its owner cap and never raises it (D2). */
export function caps(limits?: {
  readonly indexer_bytes?: number
  readonly probe_bytes?: number
  readonly scratch_bytes?: number
  readonly index_bytes?: number
}): typeof Limits {
  const lower = (cap: number, value?: number) => Math.min(cap, value ?? cap)
  return Object.freeze({
    ...Limits,
    indexerBytes: lower(Limits.indexerBytes, limits?.indexer_bytes),
    probeBytes: lower(Limits.probeBytes, limits?.probe_bytes),
    scratchBytes: lower(Limits.scratchBytes, limits?.scratch_bytes),
    indexBytes: lower(Limits.indexBytes, limits?.index_bytes),
  })
}
````

### AEX073

**Artifacts:** `s1.core.research`.

**Claim/limit supported:** Status record writes are best effort; a failed rename/write can lose status and is not evidence of a successful build.

**Authority:** `observed_implementation`. **Source:** `packages/core/src/research-toolkit/index.ts:a6e7b3bf6dd0ba44d0f0de5cac3eebe5c9f36095`, lines 281–300.

**Source commit:** `1cde2ff7a71bcf7aecb5d030917b577165135d38`; **full source SHA256:** `9c1bfe5c5a7bc0c8d4d1f835e61031e0cca06b9ed6567415d9d04ff6e84b599c`; **excerpt SHA256:** `947c7770a0802af915f03dd0fe1db7cdb54e9538a601137209dc5ae59e051c10` (987 bytes).

````text
/** Replace one shard's record (none clears it) through a temp file and one rename; a failed write loses only status. */
const record = (root: string, worktree: string, shard: string, entry?: { readonly status: "building" | "skipped"; readonly reason?: string }) =>
  read(root, worktree).pipe(
    Effect.flatMap((records) =>
      Effect.tryPromise({
        try: async () => {
          const file = recordFile(root, worktree)
          const next = Object.fromEntries([
            ...Object.entries(records).filter(([id]) => id !== shard),
            ...(entry ? [[shard, { ...entry, at: Date.now() }]] : []),
          ])
          await mkdir(path.dirname(file), { recursive: true })
          const temp = `${file}.${randomUUID()}`
          await writeFile(temp, JSON.stringify(next))
          await rename(temp, file).catch(() => rm(temp, { force: true }))
        },
        catch: () => new ShardFailed({ reason: "record-write" }),
      }).pipe(Effect.ignore),
    ),
  )
````

### AEX074

**Artifacts:** `s1.core.research`.

**Claim/limit supported:** Research identity uses canonical object order, operation tuple and execution-scoped event ID.

**Authority:** `observed_implementation`. **Source:** `packages/core/src/research/ledger.ts:6b6ca2931b6aa8bdd2156b47fc13005aab93dcbf`, lines 32–51.

**Source commit:** `1cde2ff7a71bcf7aecb5d030917b577165135d38`; **full source SHA256:** `67e07368ea820ec0c1cb791d601a10acdfa2e9259605a1bec4f556f6bb121839`; **excerpt SHA256:** `c5564eab1a9cda93c47064a3237bbce052337a7b0d950df6990e1c21ecebe651` (990 bytes).

````text
/** Canonical JSON ignores object insertion order and absent optional fields, preserving array order. */
export function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`
  if (value !== null && typeof value === "object") return `{${Object.entries(value)
    .filter((entry) => entry[1] !== undefined).sort((a, b) => a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0)
    .map((entry) => `${JSON.stringify(entry[0])}:${canonical(entry[1])}`).join(",")}}`
  return JSON.stringify(value)
}

export function digest(value: string | Uint8Array) {
  return createHash("sha256").update(value).digest("hex")
}

export function operation(context: Tool.Context, action: string) {
  return digest(canonical([context.sessionID, context.assistantMessageID, context.toolCallID, action]))
}

export function eventID(binding: Research.Binding, key: string) {
  return EventV2.ID.make(`evt_research_${digest(canonical([binding.executionSessionID, key]))}`)
}
````

### AEX075

**Artifacts:** `s1.core.research`.

**Claim/limit supported:** Retained research events are filtered/decoded and scope/receipt mismatches are refused.

**Authority:** `observed_implementation`. **Source:** `packages/core/src/research/ledger.ts:6b6ca2931b6aa8bdd2156b47fc13005aab93dcbf`, lines 62–84.

**Source commit:** `1cde2ff7a71bcf7aecb5d030917b577165135d38`; **full source SHA256:** `67e07368ea820ec0c1cb791d601a10acdfa2e9259605a1bec4f556f6bb121839`; **excerpt SHA256:** `b2f146c726ed7837f75884bb5496219064da31d486f59876ba2a9c47ea20009b` (1726 bytes).

````text
export const entries = Effect.fn("ResearchLedger.entries")(function* (binding: Research.Binding, explicitID?: string, executionOnly = false) {
  const database = yield* Database.Service
  const rows = yield* database.db.select().from(EventTable).where(and(
    inArray(EventTable.type, types),
    sql`json_extract(${EventTable.data}, '$.binding.projectID') = ${binding.projectID}`,
    executionOnly ? eq(EventTable.aggregate_id, binding.executionSessionID) : undefined,
    explicitID === undefined ? eq(EventTable.aggregate_id, binding.executionSessionID) : sql`(
      json_extract(${EventTable.data}, '$.record.id') = ${explicitID} OR
      json_extract(${EventTable.data}, '$.receipt.ref.id') = ${explicitID} OR
      json_extract(${EventTable.data}, '$.receipt.ref.artifact.id') = ${explicitID} OR
      json_extract(${EventTable.data}, '$.receipt.artifact.id') = ${explicitID})`,
  )).orderBy(asc(EventTable.seq)).all().pipe(Effect.orDie)
  return yield* Effect.forEach(rows, (row) => Schema.decodeUnknownEffect(Entry)({
    id: row.id, type: row.type.slice(0, -2), data: row.data,
    durable: { aggregateID: row.aggregate_id, seq: row.seq, version: 1 },
  }).pipe(
    Effect.mapError(() => new Research.Error({ code: "source_unavailable", message: "Invalid retained research event" })),
    Effect.flatMap((entry) => entry.data.sessionID !== row.aggregate_id || entry.data.binding.executionSessionID !== row.aggregate_id ||
      (entry.type !== "research.record.committed" && !isDeepStrictEqual(entry.data.receipt.binding, entry.data.binding))
      ? Effect.fail(new Research.Error({ code: "source_unavailable", message: "Research event scope does not match admission" }))
      : Effect.succeed(entry)),
  ))
})
````

### AEX076

**Artifacts:** `s1.core.runtime`.

**Claim/limit supported:** Composition types allow Location to depend on global nodes and preserve the converse boundary.

**Authority:** `observed_implementation`. **Source:** `packages/core/src/effect/app-node.ts:e8112f921ad7a7dcefbf6985c24995df1855c96b`, lines 1–14.

**Source commit:** `1cde2ff7a71bcf7aecb5d030917b577165135d38`; **full source SHA256:** `84d50e650e7354f3fcbcdc39a005cce87d35aae6519cbf4995f1252062f5b2d2`; **excerpt SHA256:** `84d50e650e7354f3fcbcdc39a005cce87d35aae6519cbf4995f1252062f5b2d2` (450 bytes).

````text
import { LayerNode } from "./layer-node"

export const tags = LayerNode.tags({
  location: ["global"],
  global: [],
})

export type GlobalNode<A, E = never> = LayerNode.Node<A, E, (typeof tags.values)["global"]>
export type LocationNode<A, E = never> = LayerNode.Node<A, E, (typeof tags.values)["location"]>

export const makeGlobalNode = tags.make("global")
export const makeLocationNode = tags.make("location")

export * as Node from "./app-node"
````

### AEX077

**Artifacts:** `s1.core.runtime`.

**Claim/limit supported:** Collectors continue draining after byte caps; inspectors receive raw chunks; the process path receives optional RSS constraints.

**Authority:** `observed_implementation`. **Source:** `packages/core/src/process.ts:a2c29d4a18c44ff407e6055b27830fade5d43f20`, lines 131–173.

**Source commit:** `1cde2ff7a71bcf7aecb5d030917b577165135d38`; **full source SHA256:** `7bfd3adf7274bd90bfe4cf1d7fd3f4bb256f6914dbd74cea00127e33704a6875`; **excerpt SHA256:** `e521fb44a3e6ad676d35005554ad4dd2319566e22384ee196ec6e620b6568216` (2021 bytes).

````text
export const collectStream = <E>(stream: Stream.Stream<Uint8Array, E>, maxOutputBytes: number | undefined) =>
  Stream.runFold(
    stream,
    () => ({ chunks: [] as Uint8Array[], bytes: 0, truncated: false }),
    (acc, chunk) => {
      if (maxOutputBytes === undefined) {
        acc.chunks.push(chunk)
        acc.bytes += chunk.length
        return acc
      }
      const remaining = maxOutputBytes - acc.bytes
      if (remaining > 0) acc.chunks.push(remaining >= chunk.length ? chunk : chunk.slice(0, remaining))
      acc.bytes += chunk.length
      acc.truncated = acc.truncated || acc.bytes > maxOutputBytes
      return acc
    },
  ).pipe(Effect.map((x) => ({ buffer: Buffer.concat(x.chunks), truncated: x.truncated })))

/**
 * AppProcess over the spawner in context, for a mode of ORCHESTRA_EXPERIMENTAL_OMNI_SPAWNER: with omni on, run()
 * collects through omni itself where it can (R2-1).
 */
export const layerWith = (mode: typeof Flag.ORCHESTRA_EXPERIMENTAL_OMNI_SPAWNER) => Layer.effect(
  Service,
  Effect.gen(function* () {
    const spawner = yield* ChildProcessSpawner
    const omni = mode === "off" ? undefined : yield* Effect.promise(() => Omni.load())

    const runCommand = (command: ChildProcess.Command, options?: RunOptions) => {
      const description = describeCommand(command)
      const inspected = (stream: Stream.Stream<Uint8Array, PlatformError>) => options?.inspect
        ? stream.pipe(Stream.tap((chunk) => Effect.try({
            try: () => options.inspect?.(chunk),
            catch: (cause) => wrapError(description, cause),
          }))) : stream
      const collect = Effect.scoped(
        Effect.gen(function* () {
          const handle = yield* spawner
            .spawn(command)
            .pipe(Effect.provideService(OmniSpawner.MemoryCap, options?.maxRssBytes))
          if (options?.combineOutput) {
            const [output, exitCode] = yield* Effect.all(
              [collectStream(inspected(handle.all), options.maxOutputBytes), handle.exitCode],
````

### AEX078

**Artifacts:** `s1.core.runtime`.

**Claim/limit supported:** Native collect is conditional on eligibility and other options route through the configured spawner; there is no universal captured-output bound.

**Authority:** `observed_implementation`. **Source:** `packages/core/src/process.ts:a2c29d4a18c44ff407e6055b27830fade5d43f20`, lines 258–272.

**Source commit:** `1cde2ff7a71bcf7aecb5d030917b577165135d38`; **full source SHA256:** `7bfd3adf7274bd90bfe4cf1d7fd3f4bb256f6914dbd74cea00127e33704a6875`; **excerpt SHA256:** `896bbfa4172a3ecbe149dd1fb2b39d2e2db59acdbc2975004782c7f2ad6a5734` (759 bytes).

````text
    const run = Effect.fn("AppProcess.run")(function* (command: ChildProcess.Command, options?: RunOptions) {
      if (omni && OmniSpawner.collectable(command, options)) return yield* collect(omni, command, options)
      if (options?.stdin === undefined) return yield* runCommand(command, options)
      if (command._tag !== "StandardCommand") {
        return yield* new AppProcessError({
          command: describeCommand(command),
          cause: new Error("stdin option only supports StandardCommand; received PipedCommand"),
        })
      }
      const next = ChildProcess.make(command.command, command.args, {
        ...command.options,
        stdin: normalizeStdin(options.stdin),
      })
      return yield* runCommand(next, options)
    })
````

### AEX079

**Artifacts:** `s1.core.runtime`.

**Claim/limit supported:** Explicit native addon/supervisor paths must form an existing pair and do not silently borrow mismatched candidates.

**Authority:** `observed_implementation`. **Source:** `packages/core/src/omni.ts:94a19789cef782806a80432c9a86f28bccbdecac`, lines 62–84.

**Source commit:** `1cde2ff7a71bcf7aecb5d030917b577165135d38`; **full source SHA256:** `b032344ff11c078ecdc062bd796a5ad75ccb046a319d674ab7faba659d84b3ab`; **excerpt SHA256:** `036d2b18227b40b84f2ce0bbd92585dd9883eb7b37ea27a0d9e97c146c83f708` (1471 bytes).

````text
 * Where the addon and the supervisor are, in this order: the paths given to configure(), then HUGR_OMNI_ADDON and
 * HUGR_OMNI_SUPERVISOR (CI). An explicit addon requires its sibling supervisor unless explicitly overridden; it
 * never borrows a supervisor from another candidate. Otherwise look next to realpath(process.execPath) (the
 * CLI), then in ../omni from there (the desktop's CLI, run standalone from Resources/cli), then
 * process.resourcesPath/omni (the desktop), then this checkout's native/omni/target/{release,debug}.
 * A non-explicit location counts only when it holds both files, so a release addon never pairs a debug supervisor.
 */
export function locate(given: Paths = injected): Found {
  const explicit = {
    addon: given.addon ?? process.env.HUGR_OMNI_ADDON,
    supervisor: given.supervisor ?? process.env.HUGR_OMNI_SUPERVISOR,
  }
  if (explicit.addon !== undefined) {
    const found = { addon: explicit.addon, supervisor: explicit.supervisor ?? sibling(explicit.addon, SUPERVISOR) }
    const missing = Object.entries(found).filter(([, file]) => !existsSync(file))
    if (missing.length > 0)
      throw new Error(
        `hugr-omni: the configured ${missing.map(([kind, file]) => `${kind} ${file} does not exist`).join("; ")}.`,
      )
    return found
  }
  if (explicit.supervisor !== undefined && !existsSync(explicit.supervisor))
    throw new Error(`hugr-omni: the configured supervisor ${explicit.supervisor} does not exist.`)
````

### AEX080

**Artifacts:** `s1.core.runtime`.

**Claim/limit supported:** The positive/strict control predicate is code, not an executed qualification result.

**Authority:** `observed_implementation`. **Source:** `packages/core/src/omni.ts:94a19789cef782806a80432c9a86f28bccbdecac`, lines 139–152.

**Source commit:** `1cde2ff7a71bcf7aecb5d030917b577165135d38`; **full source SHA256:** `b032344ff11c078ecdc062bd796a5ad75ccb046a319d674ab7faba659d84b3ab`; **excerpt SHA256:** `f53332d2fbb0bd0c66652fb72c13c0e418a9afd0d522438c2ac4cce728d9b384` (1015 bytes).

````text
 * The positive control for a test run (D-L1): a run with the flag on that made no omni spawn proved nothing about
 * omni, and a strict run must not have delegated. `expected` false (a focused run in which no test declared an omni
 * spawn, script/test-omni-control.ts) still fails a run that delegated without any omni spawn: it did spawn, just never
 * through omni. Undefined means the run passes.
 */
export function verdict(mode: "off" | "on" | "strict", counts: { spawns: number; delegations: number }, expected = true) {
  if (mode === "off") return
  if (counts.spawns === 0 && (expected || counts.delegations > 0))
    return `ORCHESTRA_EXPERIMENTAL_OMNI_SPAWNER=${mode === "on" ? "1" : mode}, but this run made no omni spawn${
      counts.delegations > 0 ? ` and delegated ${counts.delegations} spawn(s) to legacy` : ""
    }.`
  if (mode === "strict" && counts.delegations > 0)
    return `ORCHESTRA_EXPERIMENTAL_OMNI_SPAWNER=strict, but this run delegated ${counts.delegations} spawn(s) to legacy.`
}
````

### AEX081

**Artifacts:** `s1.core.runtime`.

**Claim/limit supported:** PTY exited retention and finalization cap are explicit; each subscriber has a pending array distinct from the retained output ring.

**Authority:** `observed_implementation`. **Source:** `packages/core/src/pty.ts:fc08cb64d832f77b145c4c9702d417d7db49c14f`, lines 23–39.

**Source commit:** `1cde2ff7a71bcf7aecb5d030917b577165135d38`; **full source SHA256:** `03f62b4e17ac231291eb4c726d92415f63fa4b08eb66ced6d5c60cb9a3d0b4be`; **excerpt SHA256:** `a58681ecc906ad3e8bb8e35a929b81bb5d4f8d683def1988df6863c0958c1f9a` (773 bytes).

````text
// Exited sessions stay observable (status, exit code, retained output) until removed explicitly.
// Cap retention so abandoned terminals do not accumulate unbounded buffers.
const EXITED_LIMIT = 25
const pty = lazy(() => import("#pty"))
const omniPty = lazy(() => import("./pty/omni").then((mod) => mod.load()))
// How long an omni tree gets to wind down when its session goes, and how long the layer finalizer waits for every
// pending stop: above ConPTY's declared 6 s close (integration plan, WP2).
const STOP_GRACE_MS = 2000
const FINALIZE_CAP = "7 seconds"

type Subscriber = {
  readonly onData: (chunk: string) => void
  readonly onEnd: (event: { exitCode?: number }) => void
  active: boolean
  detached: boolean
  pending: string[]
  end?: { exitCode?: number }
````

### AEX082

**Artifacts:** `s1.core.runtime`.

**Claim/limit supported:** PTY finalization waits for pending stops only up to the configured cap.

**Authority:** `observed_implementation`. **Source:** `packages/core/src/pty.ts:fc08cb64d832f77b145c4c9702d417d7db49c14f`, lines 186–197.

**Source commit:** `1cde2ff7a71bcf7aecb5d030917b577165135d38`; **full source SHA256:** `03f62b4e17ac231291eb4c726d92415f63fa4b08eb66ced6d5c60cb9a3d0b4be`; **excerpt SHA256:** `52946ec7dba2dbff2920b5ed03200a85aa88a4d4d42659199521ea4eca633e85` (411 bytes).

````text
    yield* Effect.addFinalizer(() =>
      Effect.gen(function* () {
        for (const session of sessions.values()) teardown(session, false)
        sessions.clear()
        exitOrder.length = 0
        if (stopping.size === 0) return
        yield* Effect.promise(() => Promise.allSettled([...stopping])).pipe(
          Effect.timeoutOption(FINALIZE_CAP),
          Effect.asVoid,
        )
      }),
    )
````

### AEX083

**Artifacts:** `s1.core.runtime`.

**Claim/limit supported:** Project LSP commands are admitted through ConfigTrust.

**Authority:** `observed_implementation`. **Source:** `packages/core/src/lsp/lsp.ts:7848ef568344421190171962367fe2836170d084`, lines 153–159.

**Source commit:** `1cde2ff7a71bcf7aecb5d030917b577165135d38`; **full source SHA256:** `e7500203a6b6dc05949917252e32d6e50a605b80d186f7b596c7a294654cb3f6`; **excerpt SHA256:** `4c62a36835c2fce0c7de11e61f8cbb2f8fa60da9684473eea894437e1d844c9b` (548 bytes).

````text
    // A project's LSP commands are code the repository chose to run: they apply only once the user trusts the project.
    const entries = Effect.fnUntraced(function* () {
      const all = yield* config.entries()
      const allowed = ConfigTrust.runnable(all, global.config, location.directory)
      if (all.some((entry) => !allowed.includes(entry) && entry.type === "document" && entry.info.lsp !== undefined))
        yield* Effect.logWarning(`Project LSP config ignored. ${ConfigTrust.approveHint(location.directory)}`)
      return allowed
````

### AEX084

**Artifacts:** `s1.core.runtime`.

**Claim/limit supported:** Workspace-code LSP commands take the confined branch; ordinary trusted commands have a distinct spawn path.

**Authority:** `observed_implementation`. **Source:** `packages/core/src/lsp/lsp.ts:7848ef568344421190171962367fe2836170d084`, lines 193–198.

**Source commit:** `1cde2ff7a71bcf7aecb5d030917b577165135d38`; **full source SHA256:** `e7500203a6b6dc05949917252e32d6e50a605b80d186f7b596c7a294654cb3f6`; **excerpt SHA256:** `fc03b46bfabb53d82047115a2886363eea72014cdd226240364951f5562e8b7c` (525 bytes).

````text
                spawn: async (root) => ({
                  process: (await ToolSafetySandbox.runsWorkspaceCode(ctx.directory, entry.command![0], entry.command!.slice(1), root))
                    ? await confined(entry.command![0], entry.command!.slice(1), { cwd: root, env: { ...process.env, ...entry.env } })
                    : await lspspawn(entry.command![0], entry.command!.slice(1), { cwd: root, env: { ...process.env, ...entry.env } }),
                  initialization: entry.initialization,
                }),
````

### AEX085

**Artifacts:** `s1.core.runtime`.

**Claim/limit supported:** Formatter workspace code is confined with explicit write targets and exact child environment.

**Authority:** `observed_implementation`. **Source:** `packages/core/src/format/format.ts:0198f9c0d4aa4a9e1452339ca5c3302611478aba`, lines 97–143.

**Source commit:** `1cde2ff7a71bcf7aecb5d030917b577165135d38`; **full source SHA256:** `1a9918459995534b16242fcdd18c576de735fdac63a87603e0ad3ca215b036fd`; **excerpt SHA256:** `485a92ff92910e48d2a1be58c9771c3d615a292dcfa3bf55a7ada6ebd440186a` (2048 bytes).

````text
    const run = Effect.fnUntraced(function* (item: Info, cmd: string[], filepath: string) {
      const replaced = cmd.map((part) => part.replace("$FILE", filepath))
      const directory = location.directory
      // A trusted formatter still runs workspace code when its program resolves into the workspace, is a runner
      // (npx, uv run, ...) or is a version-manager shim.
      const confine =
        item.confine ??
        ((yield* Effect.promise(() =>
          ToolSafetySandbox.runsWorkspaceCode(directory, replaced[0]!, replaced.slice(1), directory),
        ))
          ? "file"
          : undefined)
      const source = confine === "stdin" ? yield* Effect.promise(() => readSource(filepath, directory)) : undefined
      if (confine === "stdin" && !source)
        return yield* Effect.logError("failed to format file", { error: "outside the workspace", command: cmd, file: filepath })
      const input = source?.content
      const result = yield* Effect.scoped(
        Effect.gen(function* () {
          if (!confine)
            return yield* appProcess.run(
              ChildProcess.make(replaced[0]!, replaced.slice(1), {
                cwd: directory,
                env: item.environment,
                extendEnv: true,
                stdin: "ignore",
                stdout: "ignore",
                stderr: "ignore",
              }),
            )
          const launch = yield* ToolSafetySandbox.confine({
            command: replaced[0]!,
            args: replaced.slice(1),
            cwd: directory,
            env: { ...process.env, ...item.environment },
            write: input ? [] : [filepath],
          })
          return yield* appProcess.run(
            ChildProcess.make(launch.command, launch.args, {
              cwd: directory,
              env: launch.env,
              extendEnv: false,
              stdin: "ignore",
              stdout: input ? "pipe" : "ignore",
              stderr: "ignore",
            }),
            input ? { stdin: input } : undefined,
          )
````

### AEX086

**Artifacts:** `s1.core.runtime`.

**Claim/limit supported:** Log/tracing startup is conditional on an endpoint, not a claim of observed exporter availability.

**Authority:** `observed_implementation`. **Source:** `packages/core/src/observability/otlp.ts:4d403d30bded809a37d426a8c56361ca8d66ddf7`, lines 50–58.

**Source commit:** `1cde2ff7a71bcf7aecb5d030917b577165135d38`; **full source SHA256:** `4a76113bce60f765e3d431eb6c5c46e3d224d889da83a8cfd00143d1c52a3003`; **excerpt SHA256:** `6ab5c14df473adb422979b8f6f5f7c5606e9eb09dc40a4857595980cf6cc9ee4` (358 bytes).

````text
export function loggers() {
  if (!endpoint) return []
  return [OtlpLogger.make({ url: `${endpoint}/v1/logs`, resource: resource(), headers })]
}

export async function tracingLayer() {
  if (!endpoint) return Layer.empty
  const NodeSdk = await import("@effect/opentelemetry/NodeSdk")
  const OTLP = await import("@opentelemetry/exporter-trace-otlp-http")
````

### AEX087

**Artifacts:** `s1.core.runtime`.

**Claim/limit supported:** The maintenance source explicitly preserves unresolved WebSocket-client backpressure/memory limits.

**Authority:** `repository_normative_documentation`. **Source:** `.orchestra/skills/terminal-maintenance/SKILL.md:610fa93e3ec385790509b0c7fd0181fd30adc727`, lines 10–29.

**Source commit:** `1cde2ff7a71bcf7aecb5d030917b577165135d38`; **full source SHA256:** `62265a02943d78fb6922b806888a9193dc1f7007d5dd1e6114a63438bea2d553`; **excerpt SHA256:** `a26ccc0f66e8b532949b6f6033beb5c013febfba3f38c42ee6934c9a5dbe142c` (2381 bytes).

````text
## Ownership

| Piece | Owner file | Rule |
|---|---|---|
| Session, ring buffer, replay gap, repaint | `packages/core/src/pty.ts` | One implementation serves both HTTP surfaces (legacy handlers and `@orchestra/server`); change both or neither |
| Wire framing (meta frame, cut, afterFirstLine) | `packages/core/src/pty/protocol.ts` | A protocol change needs `bun run generate` in `packages/client` |
| Shell marks (OSC 133) | `pty/shell-marks.ts`, `pty/shell-integration.ts` | Marks count only with the session nonce; zsh and bash on posix; opt-in per create |
| Shell cwd (OSC 7) | `pty/shell-cwd.ts`, `Info.cwd` in `pty.ts` | A hint, never a boundary: no nonce, any output can print one; the new-terminal default only |
| Agent command in a tab | `packages/core/src/tool/agent-terminal.ts` | Behind `ORCHESTRA_AGENT_TERMINAL`; only the foreground block of the V2 `bash.ts`. The app's chat reaches it through V2 by default; the V1 shell tool (legacy sidecar fallback only) is deliberately not wired |
| Client write path (sync output 2026) | `packages/app-shell/src/utils/terminal-writer.ts` | Holds a DEC 2026 frame until it closes or 250 ms pass |
| Emulator | `ghostty-web`, pinned fork | Swap only behind the plan's plan B, after a failing Phase 1 test |

## Invariants

- The agent runner never loosens the bash tool: permissions, git safety, `ToolSafetySandbox.wrap`, `OutputInspector`, the 1 MiB cap, timeout and kill-on-abort stay identical. A divergence between the two runners blocks the change.
- `Pty.create` with `exact: true` never reads `process.env` and never adds `-l`. The default path is unchanged.
- Model-facing terminal text goes through `AgentTerminal.sanitize` (no CSI/OSC incl. OSC 52, `\r` overwrite, no control characters). Terminal output is data, never instruction.
- Spawn only through the existing PTY service/omni; `bun run check:spawn-imports` must stay green.
- The `claude-code` engine runs its own Bash outside `bash.ts`, so it never gets an agent tab (decision D-4, recorded in `docs/specs/terminal/agent-terminal-approval.md`). The plugin `shell.env` hook is not applied to the agent's environment; keep it that way unless the sandbox scrubs the result.
- Known limit: a WebSocket client that stops reading grows server memory (`ws.send` never awaits; `writableLength` reads 0 under Bun). Not solved; do not add a bound that cannot trigger.
````

### AEX088

**Artifacts:** `s1.core.models`.

**Claim/limit supported:** Native routes strip API keys from body settings; unknown explicit variants fail rather than silently changing selection.

**Authority:** `observed_implementation`. **Source:** `packages/core/src/session/runner/model.ts:188abc7053f9a02b8dd84ce7bdc30e0e7c001b3b`, lines 147–188.

**Source commit:** `1cde2ff7a71bcf7aecb5d030917b577165135d38`; **full source SHA256:** `25c8400ee9162fb798aafa3cf2c540b7364c097e669a7b361489e5cf1610db5f`; **excerpt SHA256:** `37929a967f0f573bf2973a9cc84ee1f0998de36bea2e9116c5d3303d98241610` (1452 bytes).

````text
const withDefaults = (model: ModelV2.Info, route: AnyRoute, generation: GenerationOptions) => {
  const body = model.request.body
  const httpBody = Object.hasOwn(body, "apiKey")
    ? Object.fromEntries(Object.entries(body).filter(([key]) => key !== "apiKey"))
    : body
  return route.with({
    provider: model.providerID,
    endpoint: model.api.url === undefined ? undefined : { baseURL: model.api.url },
    headers: model.request.headers,
    http: { body: httpBody },
    limits: {
      context: model.limit.context,
      ...(model.limit.input === undefined ? {} : { input: model.limit.input }),
      output: model.limit.output,
    },
    generation,
  })
}

const withVariant = (
  model: ModelV2.Info,
  variantID: ModelV2.VariantID | undefined,
): Effect.Effect<ModelV2.Info, VariantUnavailableError> => {
  const id = variantID === "default" || variantID === undefined ? model.request.variant : variantID
  const variant = model.variants.find((item) => item.id === id)
  if (!variant && variantID !== undefined && variantID !== "default")
    return Effect.fail(
      new VariantUnavailableError({
        providerID: model.providerID,
        modelID: model.id,
        variant: variantID,
      }),
    )
  return Effect.succeed(
    variant
      ? produce(model, (draft) => {
          Object.assign(draft.request.headers, variant.headers)
          Object.assign(draft.request.body, variant.body)
        })
      : model,
  )
}
````

### AEX089

**Artifacts:** `s1.core.models`.

**Claim/limit supported:** The actual adapter branches accept a narrower API set than arbitrary SDK/catalog entries and return UnsupportedApiError otherwise.

**Authority:** `observed_implementation`. **Source:** `packages/core/src/session/runner/model.ts:188abc7053f9a02b8dd84ce7bdc30e0e7c001b3b`, lines 193–245.

**Source commit:** `1cde2ff7a71bcf7aecb5d030917b577165135d38`; **full source SHA256:** `25c8400ee9162fb798aafa3cf2c540b7364c097e669a7b361489e5cf1610db5f`; **excerpt SHA256:** `03c9a05685a4a958e901aa4ae1d0c40ce6306a33a46fb5f9cd6f3c6cef5ed1dd` (2318 bytes).

````text
export const fromCatalogModel = (
  model: ModelV2.Info,
  credential?: Credential.Value,
): Effect.Effect<Model, UnsupportedApiError | ModelUnavailableError> => {
  // Native V2 api.settings.generation uses canonical LLM options, not http.body.
  // Strict decoding rejects misspellings/coercion; absence keeps empty defaults.
  const generation = Schema.decodeUnknownOption(GenerationOptions, { onExcessProperty: "error" })(
    model.api.settings?.generation === undefined ? {} : model.api.settings.generation,
  )
  if (Option.isNone(generation))
    return Effect.fail(
      new ModelUnavailableError({
        providerID: model.providerID,
        modelID: model.id,
        cause: "Invalid api.settings.generation: expected canonical GenerationOptions",
      }),
    )
  const resolved =
    credential?.type !== "key" || credential.metadata === undefined
      ? model
      : produce(model, (draft) => {
          Object.assign(draft.request.body, credential.metadata)
        })
  const key = apiKey(resolved, credential)
  if (resolved.api.type === "aisdk" && resolved.api.package === "@ai-sdk/openai") {
    return Effect.succeed(
      withDefaults(resolved, OpenAIResponses.route, generation.value)
        .with({ auth: key === undefined ? Auth.none : Auth.bearer(key) })
        .model({ id: resolved.api.id }),
    ).pipe(Effect.map((value) => withPrices(withReference(value, model), model)))
  }
  if (resolved.api.type === "aisdk" && resolved.api.package === "@ai-sdk/anthropic") {
    return Effect.succeed(
      withDefaults(resolved, AnthropicMessages.route, generation.value)
        .with({ auth: key === undefined ? Auth.none : Auth.header("x-api-key", key) })
        .model({ id: resolved.api.id }),
    ).pipe(Effect.map((value) => withPrices(withReference(value, model), model)))
  }
  if (openAICompatible(resolved)) {
    return Effect.succeed(
      withDefaults(resolved, OpenAICompatibleChat.route, generation.value)
        .with({ auth: key === undefined ? Auth.none : Auth.bearer(key) })
        .model({ id: resolved.api.id }),
    ).pipe(Effect.map((value) => withPrices(withReference(value, model), model)))
  }
  return Effect.fail(
    new UnsupportedApiError({
      providerID: resolved.providerID,
      modelID: resolved.id,
      api: apiName(resolved),
    }),
  )
}
````

### AEX090

**Artifacts:** `s1.core.economy`.

**Claim/limit supported:** The final request digest participates in sealed identity; admitted bound dimensions are mandatory and positive safe integers.

**Authority:** `observed_implementation`. **Source:** `packages/core/src/economy/admission.ts:914a0b925dd282e264292b2247189c549c993a3f`, lines 242–284.

**Source commit:** `1cde2ff7a71bcf7aecb5d030917b577165135d38`; **full source SHA256:** `4806923787eb5724f7d70f9316bec2f74e3bd94fa48e8e62f9d4674dbf469dd7`; **excerpt SHA256:** `f8e2abe539559e09012ad7aa67fa1e2d87507fb43828e2acc6a6e99c73ee7962` (1769 bytes).

````text
export const sealRequest = (request: SealedRequest): { fingerprint: string; bodyDigest: string } => {
  const bodyDigest = sha256(request.body)
  const fingerprint = sha256(JSON.stringify({
    envelopeId: request.envelope.envelopeId,
    authorityId: request.envelope.authorityId,
    scope: request.envelope.scope,
    provider: request.envelope.provider,
    model: request.envelope.model,
    route: request.envelope.route,
    stages: [...request.envelope.stages],
    limits: request.envelope.limits,
    retryPolicy: request.envelope.retryPolicy,
    logicalRequestId: request.logical.logicalRequestId,
    snapshot: request.logical.snapshot,
    stage: request.logical.stage,
    dispatchRoute: request.route,
    endpoint: request.endpoint,
    protocol: request.protocol,
    bodyDigest,
    bound: request.bound,
  }))
  return { fingerprint, bodyDigest }
}

/**
 * Per-attempt bounds sealed from the final request bytes (§1.2). A dimension the envelope
 * admits is mandatory; bound exposure beyond an envelope dimension is refused.
 */
export const validateBound = (bound: AttemptBound, envelope: EconomyEnvelope, evidence: readonly string[]): AttemptOutcome | undefined => {
  for (const dimension of ["outputTokens", "inputTokens"] as const) {
    const value = bound[dimension]
    if (value === undefined) {
      if (envelope.limits[dimension] !== undefined) return refusal("bound", [...evidence, dimension])
      continue
    }
    if (typeof value !== "number" || !Number.isSafeInteger(value) || value <= 0) {
      return refusal("bound", [...evidence, dimension])
    }
    if (envelope.limits[dimension] !== undefined && value > envelope.limits[dimension]) {
      return refusal("bound", [...evidence, dimension])
    }
  }
  return undefined
````

### AEX091

**Artifacts:** `s1.core.economy`.

**Claim/limit supported:** Occupancy uses settled usage or retained unsettled bounds and refuses/holds corrupt evidence; in-flight release is tracked independently.

**Authority:** `observed_implementation`. **Source:** `packages/core/src/economy/admission.ts:914a0b925dd282e264292b2247189c549c993a3f`, lines 463–505.

**Source commit:** `1cde2ff7a71bcf7aecb5d030917b577165135d38`; **full source SHA256:** `4806923787eb5724f7d70f9316bec2f74e3bd94fa48e8e62f9d4674dbf469dd7`; **excerpt SHA256:** `a9af3cab2a4ee26ae509e5c3d550b2a00c6e3346a17cbad7d6fefa35039e2ea2` (2942 bytes).

````text
            const rows = yield* tx.select().from(EconomyAttemptTable).where(foundEnvelopeWhere(request.envelope.envelopeId)).all()
            const occupied = { outputTokens: 0, inputTokens: 0 }
            let inFlight = 0
            for (const row of rows) {
              const bound = JSON.parse(row.bound_json) as AttemptBound
              if (row.state === "settled") {
                const usage = row.usage_json === null ? undefined : JSON.parse(row.usage_json) as AttemptUsage
                const numbers = [usage?.outputTokens, usage?.inputTokens, usage?.cachedInputTokens, usage?.reasoningTokens]
                if (
                  (request.envelope.limits.outputTokens !== undefined && usage?.outputTokens === undefined) ||
                  (request.envelope.limits.inputTokens !== undefined && usage?.inputTokens === undefined) ||
                  (bound.outputTokens !== undefined && usage?.outputTokens === undefined) ||
                  (bound.inputTokens !== undefined && usage?.inputTokens === undefined) ||
                  numbers.some((value) => value !== undefined && (!Number.isSafeInteger(value) || value < 0))
                ) {
                  return yield* Effect.fail(hold("authority", ["corrupt", "usage", row.admission_key]))
                }
                const output = exactSum(occupied.outputTokens, usage?.outputTokens ?? 0)
                const input = exactSum(occupied.inputTokens, usage?.inputTokens ?? 0)
                if (output === undefined || input === undefined) return yield* Effect.fail(refusal("bound", [request.key, "arithmetic"]))
                occupied.outputTokens = output
                occupied.inputTokens = input
              } else {
                const heldOutput = bound.outputTokens
                const heldInput = bound.inputTokens
                const requiredMissing =
                  (request.envelope.limits.outputTokens !== undefined && heldOutput === undefined) ||
                  (request.envelope.limits.inputTokens !== undefined && heldInput === undefined)
                if (
                  requiredMissing ||
                  (heldOutput !== undefined && (!Number.isSafeInteger(heldOutput) || heldOutput < 0)) ||
                  (heldInput !== undefined && (!Number.isSafeInteger(heldInput) || heldInput < 0))
                ) {
                  return yield* Effect.fail(hold("authority", ["corrupt", "bound", row.admission_key]))
                }
                const output = exactSum(occupied.outputTokens, heldOutput ?? 0)
                const input = exactSum(occupied.inputTokens, heldInput ?? 0)
                if (output === undefined || input === undefined) return yield* Effect.fail(refusal("bound", [request.key, "arithmetic"]))
                occupied.outputTokens = output
                occupied.inputTokens = input
              }
              if (row.slot_released === 0) inFlight += 1
            }
````

### AEX092

**Artifacts:** `s1.core.economy`.

**Claim/limit supported:** Reservation persists body snapshot and distinct forward/terminal/usage/completion/semantic fields in its immediate transaction.

**Authority:** `observed_implementation`. **Source:** `packages/core/src/economy/admission.ts:914a0b925dd282e264292b2247189c549c993a3f`, lines 551–579.

**Source commit:** `1cde2ff7a71bcf7aecb5d030917b577165135d38`; **full source SHA256:** `4806923787eb5724f7d70f9316bec2f74e3bd94fa48e8e62f9d4674dbf469dd7`; **excerpt SHA256:** `238a5ff7cdafbecbd0f20fc1ca075d349772923b0aa08546f6b5d99e06784ae1` (1267 bytes).

````text
            yield* tx.insert(EconomyAttemptTable).values({
              envelope_id: request.envelope.envelopeId,
              logical_request_id: request.logical.logicalRequestId,
              ordinal,
              admission_key: admissionKey,
              fingerprint,
              body_digest: bodyDigest,
              body_snapshot: request.body,
              snapshot: request.logical.snapshot,
              route: request.route,
              endpoint: request.endpoint,
              protocol: request.protocol,
              ...(request.prior === undefined ? {} : { predecessor: attemptKey(request.prior) }),
              state: "reserved",
              forward_intent: 1,
              forward_observed: 0,
              terminal: null,
              slot_released: 0,
              bound_json: JSON.stringify(request.bound),
              usage_json: null,
              evidence_digest: null,
              evidence_json: null,
              completion_ref: null,
              completion_body: null,
              semantic: null,
            })
            return grant({ envelopeId: request.envelope.envelopeId, logicalRequestId: request.logical.logicalRequestId, ordinal }, request.key, true)
          }),
        { behavior: "immediate" },
````

### AEX093

**Artifacts:** `s1.core.boundaries`.

**Claim/limit supported:** Move applies captured changes, then publishes Session.Moved, then discards source changes with a distinct later failure; no cross-filesystem/event rollback appears in this function.

**Authority:** `observed_implementation`. **Source:** `packages/core/src/control-plane/move-session.ts:49fe728d6956ca1555a763548e9458ea5f3938dc`, lines 83–138.

**Source commit:** `1cde2ff7a71bcf7aecb5d030917b577165135d38`; **full source SHA256:** `302fd923821d8f2d4124b8e4cca38485abe86c3f3c74e2f0b9bc420b56ec2518`; **excerpt SHA256:** `0bf7650e1460727e2eadbf9006d079aae8f164dea4c4a3e62ffdf442ea2ad790` (2427 bytes).

````text
      const source = yield* project.resolve(current.location.directory)
      const destination = yield* project.resolve(directory)
      if (current.projectID !== destination.id) {
        return yield* new DestinationProjectMismatchError({ expected: current.projectID, actual: destination.id })
      }

      const moveChanges = input.moveChanges && source.directory !== destination.directory
      const sourceRepository = moveChanges ? yield* git.repo.discover(current.location.directory) : undefined
      if (moveChanges && !sourceRepository)
        return yield* new CaptureChangesError({ message: "Source is not a Git repository" })
      const patch = sourceRepository
        ? yield* git.change
            .capture({ repository: sourceRepository, path: current.location.directory })
            .pipe(Effect.mapError((error) => new CaptureChangesError({ message: error.message })))
        : Git.ChangeSet.make("")
      if (patch) {
        const repository = yield* git.repo.discover(directory)
        if (!repository) return yield* new ApplyChangesError({ message: "Destination is not a Git repository" })
        yield* git.change
          .apply({ repository, path: directory, changes: patch })
          .pipe(Effect.mapError((error) => new ApplyChangesError({ message: error.message })))
      }

      yield* events.publish(SessionEvent.Moved, {
        sessionID: input.sessionID,
        location: Location.Ref.make({ directory }),
        subdirectory: RelativePath.make(path.relative(destination.directory, directory).replaceAll("\\", "/")),
        timestamp: yield* DateTime.now,
      })

      if (patch) {
        const repository = yield* git.repo.discover(current.location.directory)
        if (!repository)
          return yield* new ResetSourceChangesError({
            directory: current.location.directory,
            message: "Source is not a Git repository",
          })
        yield* git.change
          .discard({
            repository,
            path: current.location.directory,
            index: "preserve",
            untracked: "remove",
          })
          .pipe(
            Effect.mapError(
              (error) =>
                new ResetSourceChangesError({
                  directory: current.location.directory,
                  message: error.message,
                  cause: error.cause,
                }),
            ),
          )
      }
    })
````

### AEX094

**Artifacts:** `s1.core.boundaries`.

**Claim/limit supported:** The complete remainder of the assigned RAG SQL schema shows table/column scope and the deliberate chunk-orphan cleanup boundary; it cannot prove an engine or retrieval implementation.

**Authority:** `observed_implementation`. **Source:** `packages/core/src/rag-studio/sql.ts:214ab3375acc34072ee74c3123501c80615bf488`, lines 5–81.

**Source commit:** `1cde2ff7a71bcf7aecb5d030917b577165135d38`; **full source SHA256:** `e6c3580d95d86b307624fe8c58b5790f3a07ce17ed20e5cbe851b44667c7add9`; **excerpt SHA256:** `8d6d5fd357fce5db74ab6c0c4e5668a3823304304895b2438c47622739766bdc` (2228 bytes).

````text

export const RagSourceTable = sqliteTable(
  "rag_source",
  {
    id: text().primaryKey(),
    location_id: text().notNull(),
    path: text().notNull(),
    content_hash: text().notNull(),
    status: text().notNull(),
    reparsed_hash: text(),
  },
  (table) => [index("rag_source_location_path").on(table.location_id, table.path)],
)

export const RagChunkTable = sqliteTable(
  "rag_chunk",
  {
    id: text().primaryKey(),
    source_id: text().notNull(),
    location_id: text().notNull(),
    start: integer().notNull(),
    end: integer().notNull(),
    text: text().notNull(),
    source_hash: text().notNull(),
    boundary: text().notNull(),
  },
  (table) => [index("rag_chunk_source_idx").on(table.source_id), index("rag_chunk_location_idx").on(table.location_id)],
)

export const RagRevisionTable = sqliteTable("rag_revision", {
  id: text().primaryKey(),
  location_id: text().notNull(),
  snapshot: text().notNull(),
  pipeline_hash: text().notNull(),
  fill: text().notNull(),
  parser: text().notNull(),
  boundary: text().notNull(),
  tokenizer: text().notNull(),
  k: integer().notNull(),
})

export const RagRevisionSourceTable = sqliteTable(
  "rag_revision_source",
  {
    revision_id: text().notNull(),
    source_id: text().notNull(),
    content_hash: text().notNull(),
  },
  (table) => [primaryKey({ columns: [table.revision_id, table.source_id] })],
)

export const RagQuestionTable = sqliteTable("rag_question", {
  id: text().primaryKey(),
  revision_id: text().notNull(),
  text: text().notNull(),
  span_source_id: text().notNull(),
  span_start: integer().notNull(),
  span_end: integer().notNull(),
})

export const RagTraceTable = sqliteTable("rag_trace", {
  question_id: text().primaryKey(),
  hits: text().notNull(),
  dropped: text().notNull(),
  k: integer(),
})

// Not in the spec table list. readPipeline/setPipeline have nowhere else to persist. lexical stays true and
// embedding stays false, so neither is a column.
export const RagPipelineTable = sqliteTable("rag_pipeline", {
  location_id: text().primaryKey(),
  parser: text().notNull(),
  boundary: text().notNull(),
  tokenizer: text().notNull(),
  k: integer().notNull(),
  blocked: integer().notNull().default(0),
})
````

### AEX095

**Artifacts:** `s1.core.entry`, `s1.core.models`.

**Claim/limit supported:** The repository owner inventory places provider/vendor, utilities and data contracts under Core; this is navigation/ownership intent, not acceptance of every member.

**Authority:** `repository_normative_documentation`. **Source:** `packages/core/README.md:742921238462659e1a5a314f2e0238102c6e9f3a`, lines 54–88.

**Source commit:** `1cde2ff7a71bcf7aecb5d030917b577165135d38`; **full source SHA256:** `e74885e18e96297fd931989505937559ecbdce42c595cf8846411d4f0c4de324`; **excerpt SHA256:** `ecd892d2c5f5d48c4388e6b41bda4339921a4e300c33058212e1fd8be7e94f67` (4223 bytes).

````text
- Owner: core platform maintainer
- Public entry: explicit `exports` in package.json
- Legacy and compatibility: `packages/core/src/github-copilot` (vendored)
- Enforced by `bun run check:boundaries`; exceptions in `script/boundary-ledger.json`.

### Domains
- `atlas` — platform — `src/atlas.ts` — packages/core
- `session` — platform — `src/session/`, `src/session.ts`, `src/session-process.ts` — packages/core
- `agent` — platform — `src/agent/`, `src/agent.ts` — packages/core
- `system-context` — platform — `src/system-context/` — packages/core
- `tool` — platform — `src/tool/`, `src/tool-output-store.ts`, `src/mcp/`, `src/mcp.ts`, `src/lsp/`, `src/lsp.ts` — packages/core
- `tool-safety` — platform — `src/tool-safety.ts`, `src/tool-safety-*`, `src/sandbox-parents.ts`, `src/sandbox-project-config.ts` — packages/core
- `relay` — platform — `src/relay.ts`, `src/relay-*` — packages/core
- `config` — platform — `src/config/`, `src/config.ts`, `src/behavior.ts`, `src/policy.ts`, `src/flag/`, `src/tui-config-files.ts` — packages/core
- `permission` — platform — `src/permission/`, `src/permission.ts`, `src/question.ts` — packages/core
- `location` — platform — `src/location.ts`, `src/location-services.ts`, `src/location-service-map.ts`, `src/location-mutation.ts` — packages/core
- `project` — platform — `src/project/`, `src/project.ts`, `src/filesystem/`, `src/filesystem.ts`, `src/fs-util.ts`, `src/file.ts`, `src/file-mutation.ts`, `src/git.ts`, `src/git-cli.ts`, `src/vcs.ts`, `src/repository.ts`, `src/repository-cache.ts`, `src/snapshot.ts`, `src/patch.ts`, `src/pull-request.ts`, `src/guardrail.ts`, `src/workspace.ts`, `src/format.ts`, `src/format/` — packages/core
- `database` — platform — `src/database/`, `src/data-migration.sql.ts` — packages/core
- `event` — platform — `src/event/`, `src/event.ts`, `src/public-event-manifest.ts` — packages/core
- `runtime` — platform — `src/effect/`, `src/global.ts`, `src/host.ts`, `src/host/`, `src/id/`, `src/installation/`, `src/observability/`, `src/observability.ts`, `src/background-job.ts`, `src/state.ts`, `src/schema.ts`, `src/v2-schema.ts` — packages/core
- `process` — platform — `src/process.ts`, `src/child-process-common.ts`, `src/cross-spawn-command.ts`, `src/cross-spawn-spawner.ts`, `src/shell.ts`, `src/pty/`, `src/pty.ts`, `src/tcp-proxy.ts`, `src/omni.ts`, `src/omni-*`, `src/output-inspector.ts`, `src/artifact-native-windows.ts`, `src/artifact-native-windows.rs`, `src/ripgrep/`, `src/ripgrep.ts` — packages/core
- `provider` — platform — `src/provider.ts`, `src/model.ts`, `src/models-dev.ts`, `src/aisdk.ts`, `src/catalog.ts`, `src/github-copilot/`, `src/plugin/provider/`, `src/plugin/provider.ts`, `src/plugin/models-dev.ts`, `src/plugin/variant.ts` — packages/core
- `plugin-host` — platform — `src/plugin/`, `src/plugin.ts` — packages/core
- `identity` — platform — `src/claude-code-account.ts`, `src/account/`, `src/account.ts`, `src/credential/`, `src/credential.ts`, `src/oauth/`, `src/integration/`, `src/integration.ts`, `src/share/` — packages/core
- `instruction` — platform — `src/skill/`, `src/skill.ts`, `src/packaged-skills.ts`, `src/instruction-context.ts`, `src/command.ts`, `src/slash-command.ts`, `src/reference/`, `src/reference.ts` — packages/core
- `research` — platform — `src/research/`, `src/research-toolkit/` — packages/core
- `backend-toolkit` — platform — `src/backend-toolkit/`, `src/pinned-artifact.ts` — packs move to modules/backend-toolkit after the 70-C' cut
- `control-plane` — platform — `src/control-plane/` — packages/core
- `capability` — platform — `src/capability/`, `src/toolkit/` — packages/core
- `board` — platform — `src/board/` — packages/core
- `rag-studio` — platform — `src/rag-studio/` — packages/core
- `scheduled-task` — platform — `src/scheduled-task/`, `src/scheduled-task.ts` — packages/core
- `actions` — platform — `src/actions/`, `src/actions.ts` — packages/core
- `util` — platform — `src/util/`, `src/image/`, `src/image.ts`, `src/npm.ts`, `src/npm-config.ts` — packages/core
<!-- module-contract:end -->
````

### AEX096

**Artifacts:** `s1.core.entry`, `s1.core.session-execution`, `s1.core.context`.

**Claim/limit supported:** The current repository instructions explicitly keep execution local and context ownership split across Core/domain/Session boundaries.

**Authority:** `repository_normative_documentation`. **Source:** `AGENTS.md:ef3b523b0c00aed722582b870c1919188edc4c4f`, lines 207–217.

**Source commit:** `1cde2ff7a71bcf7aecb5d030917b577165135d38`; **full source SHA256:** `07acaefb95db4b07b4e76c4255f7d6e0ecc4c7466b46fbf6ec5e5cdf6cc01b4f`; **excerpt SHA256:** `405cd0b08a53f053f88de7fd615712564267b65a3cfcdaafd0b86a7e177fb1c1` (3113 bytes).

````text
## V2 Session Core

- Keep durable prompt admission separate from model execution. `SessionV2.prompt(...)` admits one durable `session_input` row before scheduling advisory `SessionExecution.wake(sessionID)` unless `resume: false` requests admit-only behavior. The serialized runner promotes admitted inputs into visible user messages at safe boundaries.
- Reusing a Session ID adopts the existing Session. Reusing a prompt message ID reconciles an exact retry only when Session, prompt, and delivery mode match; conflicting reuse fails. Historical projected prompts lazily synthesize promoted inbox records during exact retry.
- Keep `SessionExecution` process-global and Session-ID based. Its local implementation owns the process-local Session coordinator and discovers placement through `SessionStore` plus `LocationServiceMap.get(session.location)` only when a drain starts; no layer should take a Session ID. V2 interruption targets the active process-local ownership chain for that Session; idle or missing interruption is a no-op.
- Keep `SessionRunner`, model resolution, tool registry, permissions, and filesystem Location-scoped. Omitted `Location.workspaceID` means implicit-local placement; explicit workspace identity remains reserved for future placement semantics.
- Preserve one explicit `llm.stream(request)` call per provider turn and reload projected history before durable continuation. Do not bridge through legacy `SessionPrompt.loop(...)` or delegate orchestration to an in-memory tool loop. The one exception is an agent whose `engine` names a registered `ExecutionHost` (today only `claude-code`): its single `ExecutionHost.stream(turn)` call is that provider turn, its internal tool calls persist as provider-executed events, Orchestra tools it invokes settle through the runner's `turn.execute`, and its `query()` always keeps the `claude_code` system prompt preset.
- Keep local Session drains process-local until clustering is implemented. `SessionRunCoordinator` joins explicit same-Session resumes, coalesces prompt wakeups, and allows different Sessions to run concurrently. Advisory wakes drain eligible durable inbox rows only; post-crash continuation recovery requires a separate explicit design before it may retry provider work. A drain has no durable identity or transcript boundary.
- Keep delivery vocabulary explicit. Prompts steer by default and promote at the next safe provider-turn boundary while the current drain requires continuation. An explicit `queue` input remains pending until the Session would otherwise become idle; promote one queued input at that boundary, then reevaluate continuation before promoting another. Promoting any new user input resets the selected agent's provider-turn allowance; a batch of steers resets it once.
- Keep EventV2 replay owner claims separate from clustered Session execution ownership.
- Keep the System Context algebra, registry, and built-ins in `packages/core/src/system-context`; keep Context Source producers with their observed domains, and keep Session History selection plus Context Epoch persistence Session-owned.
````

