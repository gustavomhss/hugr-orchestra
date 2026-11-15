# Reavaliação de consistência L1 — boundaries v3

Mesmo juiz nativo independente, sem ferramentas; nenhuma opinião atual do outro juiz incluída. Execução 34269cf4-d631-41c5-a30b-85b0ec217390.

Artefato completo: s1.core.boundaries L1, need component; corpo atual 23769 bytes, SHA256 937208953bb286da7bcefad8fd145d935a0ed00ee7d8f87d87c840973033d070, Git blob d3b070015882d10f778f563438eb3f9d67cab061. O corpo v2 completo anteriormente recebido tem SHA256 ca7e76aa47100f32e2076b0a5055b2cebfe3d36cfb5c0d29601125db34d7b3c6; são exatamente duas substituições abaixo, com três segmentos restantes idênticos e inversa integral verificados pela principal. Reutilize seu juízo sobre o restante inalterado, julgue estes dois deltas contra a fonte literal e emita conclusão explícita sobre o corpo inteiro v3.

A conferência da principal depois do L2 identificou estas duas imprecisões também no L1 antes aceito; não atribua ao predecessor uma qualificação que seus bytes antigos não continham. Os pareceres anteriores ficam históricos, intactos. Este lote reabre e corrige somente esses achados de fidelidade (QS-1, CC-3, GO-A1 e suficiência local AC-01); os demais critérios públicos e limites de runtime permanecem os já fornecidos. Não é pedido de binding, consumidor, manutenção, union ou PASS operacional. Não avalia ainda o L2, cujo novo predecessor dependerá deste gate.

Procedimento real apply.py SHA256 8ca6ab3b26860f1d5f4c2c4eb0f329c45aa66a6fed9976f2707570418866e6fe, congelado em 2026-11-15T04:06:09.432292+00:00 antes da invocação 2026-11-15T04:06:17.858738+00:00. Receita/root request congelados antes do despacho, todas as 12 unidades integrais deste despacho e procedimento conferidas; o fechamento anterior de 60 inputs permanece herdado. O novo manifesto é saída descritiva, não receita retroativa. Support/union conferidos intactos. Recibo da principal: receipts/boundaries-l1-v3-principal-verification.json.

## Suplemento literal do produtor

# Boundaries v3 — suplemento mínimo para ROOT-BND-L1-F01/F02

Mesma autoria L1 oracle-blind. Este suplemento registra duas substituições e a prova fonte correspondente; não atribui aceite semântico. O corpo v2 e os registros anteriores permanecem preservados.

Corpo anterior: 23665 bytes, SHA256 `ca7e76aa47100f32e2076b0a5055b2cebfe3d36cfb5c0d29601125db34d7b3c6`; corpo v3: 23769 bytes, SHA256 `937208953bb286da7bcefad8fd145d935a0ed00ee7d8f87d87c840973033d070`. Offsets abaixo são bytes UTF-8, base zero e fim exclusivo.

## ROOT-BND-L1-F01 — §3.2

Anterior [9520, 9623), SHA256 `49427583718a274581a827a64e7e9ee432c284e156b5817708f9656aa36af076`:

`````text
Seu caráter de dry grading evita avanço/ledger, mas o shell executado pode produzir efeitos no mundo.
`````

Novo [9520, 9664), SHA256 `6ef541aed10ab35a58608c9ed146c907464c0ce7c674932f3435acb75d99df76`:

`````text
Esse percurso executa o comando e retorna seu resultado, sem grading nem registro de veredito; o shell executado pode produzir efeitos no mundo.
`````

## ROOT-BND-L1-F02 — §6

Anterior [21237, 21274), SHA256 `07ad62af0d2a0c77a0f0984ae3392b1e72d9c9a8e72b70d8aa45675974d9ceba`:

`````text
chunks com texto/linhas/hash/boundary
`````

Novo [21278, 21378), SHA256 `d16ba749aa54e1308ae09e0eb881fe417506897fe7a40d5e4936b8c85f5f2492`:

`````text
chunks com texto, hash, boundary e campos inteiros `start`/`end` (sem unidade declarada pelo schema)
`````

## Alcance da correção

**Observação:** `trial` executa o comando e retorna resultado; não chama grading nem grava veredito de gate nesse percurso. O shell pode ter efeitos. `check` permanece separado, com `stateDir: undefined`, e `evaluate` permanece separado, com o guard de workflow e a chamada ArmEvaluate. O delta não amplia a sanitização de trial.

**Observação e limite:** o objeto RagChunkTable declara `start` e `end` inteiros. A folha lida integralmente não fornece unidade para esses campos; o corpo deixa de atribuir números de linha. Não se consultou outra fonte para completar essa unidade.

## Prova literal decisiva

### V3-TRIAL-CONTRACT — `packages/core/src/relay.ts` 125–136

Commit `1cde2ff7a71bcf7aecb5d030917b577165135d38`; blob `25fb509203f933a2e8b0f311c3fc8f9476d53e16`; SHA256 integral `446774386bf8020528bdc2138a066fd9dc4b214d3288dc069cb5da9d3cef2b2a`; 30225 bytes. Recorte [5502, 6209); SHA256 trecho `74fb0a688d48a9ea6f3d9832774762cf3d28784abd8b051f44314505e2860e88`.

`````text
  // The dry "Check now": grades a WP and records nothing.
  readonly check: (
    input: Omit<GateCheck.Input, "stateDir">,
  ) => Effect.Effect<RelayArm.CheckOutcome, GateCheck.Busy | GateControl.PlanError>
  // Whether the user approved this project's own commands (the gate on `trial`).
  readonly trusted: Effect.Effect<boolean>
  // "Test now": runs one check command in the project as a check would, and returns its output. It grades nothing,
  // records nothing and cannot pass a step; only a trusted project may run one.
  readonly trial: (input: {
    readonly command: string
    readonly params?: Readonly<Record<string, string>>
  }) => Effect.Effect<Trial, Untrusted | GateShell.Unavailable>
`````

### V3-TRIAL — `packages/core/src/relay.ts` 420–481

Commit `1cde2ff7a71bcf7aecb5d030917b577165135d38`; blob `25fb509203f933a2e8b0f311c3fc8f9476d53e16`; SHA256 integral `446774386bf8020528bdc2138a066fd9dc4b214d3288dc069cb5da9d3cef2b2a`; 30225 bytes. Recorte [20529, 23137); SHA256 trecho `c687548e24a7ca7a528299278ccc4e480e125d8fa085b6d5c0fe33601e7b5f42`.

`````text
    const trusted = config
      .entries()
      .pipe(Effect.map((entries) => ConfigTrust.isTrusted(entries, global.config, location.directory)))

    const trial = Effect.fn("Relay.trial")(function* (input: {
      readonly command: string
      readonly params?: Readonly<Record<string, string>>
    }) {
      if (!(yield* trusted)) return yield* new Untrusted({ directory: location.directory })
      const env = {
        ...Object.fromEntries(Object.entries(input.params ?? {}).filter((entry) => !STARTUP.has(entry[0]))),
        PATH: process.env.PATH ?? "/usr/bin:/bin",
        HOME: global.home,
      }
      if (!(yield* Effect.promise(() => which("bash", { path: env.PATH, nothrow: true }))))
        return yield* new GateShell.Unavailable({ reason: "missing" })
      const argv = GateShell.argv(input.command)
      const native = yield* ToolSafety.NativeContext
      const command = yield* ToolSafetySandbox.wrap(
        ChildProcess.make(argv[0], argv.slice(1), {
          cwd: location.directory,
          env,
          extendEnv: false,
          stdin: "ignore",
          killSignal: "SIGKILL",
        }),
      ).pipe(
        Effect.provideService(FSUtil.Service, fs),
        Effect.provideService(ToolSafety.NativeContext, native ?? { directory: location.directory }),
        Effect.mapError(() => new GateShell.Unavailable({ reason: "spawn" })),
      )
      // The capture keeps the start of the output; the summary is at the end, so the tail is kept here instead.
      const tail = outputTail(TRIAL_OUTPUT_BYTES)
      const started = yield* Clock.currentTimeMillis
      const result = yield* processes
        .run(command, { combineOutput: true, maxOutputBytes: 0, inspect: tail.keep })
        .pipe(
          Effect.map((done) => ({ exitCode: done.exitCode, timedOut: false })),
          Effect.mapError(() => new GateShell.Unavailable({ reason: "spawn" })),
          Effect.timeoutOrElse({
            duration: TRIAL_TIMEOUT,
            orElse: () => Effect.succeed({ exitCode: -1, timedOut: true }),
          }),
        )
      const kept = tail.read()
      return {
        ...result,
        output: kept.text,
        truncated: kept.truncated,
        durationMs: (yield* Clock.currentTimeMillis) - started,
      } satisfies Trial
    }, Effect.scoped)

    return Service.of({
      paths,
      judge,
      verify,
      trusted,
      trial,
      check: Effect.fn("Relay.check")(function* (input: Omit<GateCheck.Input, "stateDir">) {
        return yield* GateCheck.check({ ...input, stateDir: undefined }).pipe(ports(GATE_TIMEOUT))
      }),
`````

### V3-EVALUATE — `packages/core/src/relay.ts` 491–501

Commit `1cde2ff7a71bcf7aecb5d030917b577165135d38`; blob `25fb509203f933a2e8b0f311c3fc8f9476d53e16`; SHA256 integral `446774386bf8020528bdc2138a066fd9dc4b214d3288dc069cb5da9d3cef2b2a`; 30225 bytes. Recorte [23610, 24469); SHA256 trecho `c9e2066fd654c9f00cd4d661a0d684db2526c41e425d1fa9f4e4580f959d8e2f`.

`````text
      evaluate: Effect.fn("Relay.evaluate")(function* (input: RelayArm.EvaluateInput) {
        if (!Schema.is(RelayArm.Token)(input.token)) return { outcome: "refused" as const, failing: [], ledgerSeq: -1 }
        // Bound progressive arms may only cross the guarded native settlement boundary; an API/CLI evaluate cannot
        // spend their retry budget or advance them. Missing/invalid arm data remains the existing engine's defect.
        const bound = yield* ArmLoad.arm(path.join(paths.arms, input.token)).pipe(Effect.option)
        if (Option.isSome(bound) && bound.value.meta.workflow)
          return { outcome: "refused" as const, failing: [], ledgerSeq: -1,
            reason: "WORKFLOW_NATIVE_SETTLEMENT_REQUIRED" }
        yield* recover(input.token).pipe(Effect.ignore)
        return yield* armed(ArmEvaluate.evaluate(input))
      }),
`````

### V3-RAG-CHUNK — `packages/core/src/rag-studio/sql.ts` 19–32

Commit `1cde2ff7a71bcf7aecb5d030917b577165135d38`; blob `214ab3375acc34072ee74c3123501c80615bf488`; SHA256 integral `e6c3580d95d86b307624fe8c58b5790f3a07ce17ed20e5cbe851b44667c7add9`; 2519 bytes. Recorte [632, 1075); SHA256 trecho `a1bc0942b6df86a5cc0fce07d1e870bbf493bd6179cb030d27307a2bebda65ba`.

`````text
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
`````

## Mapa da revisão e herança

F01 atualiza somente a afirmação de §3.2, sustentada por `V3-TRIAL-CONTRACT`, `V3-TRIAL` e `V3-EVALUATE`; F02 atualiza somente a afirmação de §6, sustentada por `V3-RAG-CHUNK`. Os mapas/excertos v1/v2 continuam históricos e não foram reescritos. Este mapa local identifica as duas afirmações correntes e sua prova.

As fontes integrais relay.ts e rag-studio/sql.ts foram relidas, assim como todos os demais inputs enumerados na receita v3. A lineage integral anterior permanece em effective-inputs.json e na receita v2, incluindo A3/A4/projection e suas unidades completas. Excertos não substituem inputs integrais. Support/union não foram abertos nem alterados neste despacho.

Produto, testes, providers, Atlas e rede: NOT_RUN. Sem acesso a oracle/juízes/descendentes nesta revisão; sem delegação. O mesmo par deve reavaliar estes bytes antes de qualquer gate dependente.
