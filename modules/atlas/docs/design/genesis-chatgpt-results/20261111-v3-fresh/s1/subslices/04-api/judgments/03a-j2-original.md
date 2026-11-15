## J2 — rodada 3a, B3 D01–D06: **FIX-FIRST**

O lote sustenta vários contratos e caminhos locais de delegação, mas **não fecha a triagem semântica das 80 linhas de membership apresentadas**. Parte das alegações locais permanece apoiada apenas pela tabela herdada e por identificadores de evidência cujo conteúdo não aparece neste pedido.

O impedimento é de **cobertura de fonte para os claims exatos**, sem exigir garantias de Core/runtime. B1/B2 permanecem aceitos.

### Decisão por domínio e complementos obrigatórios

| Domínio | Sustentado pelos trechos apresentados | Lacunas locais obrigatórias |
|---|---|---|
| **D01 — Actions** | `BindingRef` contém ID/revisão; `OperationIntent` separa identidade/precondições de `ExecuteInput`; o erro público tem status 400; `job.retry` declara comando/resposta; o handler de prepare e o helper comum mostram delegação, referência de binding e projeção dos erros. | **Q047:** os seis exports do barrel. **Q048:** vocabulários fechados de recusa/disposição. **Q050–Q053:** contratos de resource/redaction/transfer, strictness e saída com segredo, estados/paginação de run/job, estados de graph. **P01–P09:** os contratos específicos ainda não mostrados — inclusive queries de P02, demais comandos de P03, validação estrita de P08 e enums/comandos dos outros grupos. **G57-E008/009/012/014/015/017/020/022**, mais os ramos get/reconcile de **E013:** as delegações atribuídas a esses handlers. |
| **D02 — Agent/behavior/skill/prompt** | Revisão como input; substituição ordenada de behaviors como contrato declarado; reminders como propósito documentado; validação de nome, escrita do agent file e mapeamento de conflito; delegação de behavior, catálogo de comandos e `skill.save` com Location. | **Q001:** representação de leitura/revisão e atualização ordenada de permissões. **Q002, Q004, Q005, Q007, Q008:** as representações e alternativas declaradas na tabela. **Q003:** definição do ID estável. **P10:** detail/tools/skills/engines e a declaração específica de stale revision/409. **P12, P17, P42:** respostas, contexto e restrições declaradas, particularmente read-only de globals/built-ins/Atlas. **G57-E024/E121/E122:** listagem/materialização de agentes e caminhos restantes de skills. |
| **D03 — Permission/question** | **PASS localizado dos checks de ownership apresentados:** permission get/reply e question reply/reject verificam existência e `sessionID` antes da delegação; helpers e catches sustentam os erros correspondentes. O registro saved e a identidade de question também estão mostrados. | **P30/P34:** endpoints, respostas NoContent, placement completo dos middlewares e declarações de erro ainda não exibidos. **Q009:** `RequestFields` e formas histórica/moderna alegadas. **Q011:** schema do payload de respostas que sustenta sua ordenação. Faltam os ramos dos handlers usados para alegar pending/saved/create e listagens; os checks já demonstrados não precisam ser reenviados. |
| **D04 — Projeções de Session** | Revert anchor e campos opcionais; `period`, `activeMs` e `truncated`; notificações `session.compacted`/`todo.updated`; `status` e `priority` efetivamente definidos como `String`. | **Q013:** os campos de timestamps mencionados pela tabela não aparecem nos intervalos fornecidos. Exibir o trecho correspondente — provavelmente no intervalo omitido entre as linhas 34 e 40 — ou retirar essa especificidade. Os demais claims locais apresentados ficam sustentados no escopo de representação/notificação. |
| **D05 — Project/workspace/copy** | Prefixo `wrk`; parte de `Project.Info`; shape de `CreateInput`; LocationQuery opcional; resposta do catálogo project; registro do projeto, injeção de `projectID`/`sourceDirectory` e chamada de `initGit`. | **Q016/Q017/Q019/Q021/Q023/Q024:** construção de IDs, sentinel e eventos/facade alegados. **Q018:** construtor além do prefix validator. **Q020:** `project.updated`. **Q022:** estratégia e remove. **P26/P31/P32:** deepObject, Info/paths.home, omissões de payload, `forceRequired`, mutations e resposta nullable de initGit. **G57-E059/E075** e os ramos restantes de **E072:** descrição de Location, list/update, lifecycle de copy e nomes opcionais gerados por LLM. |
| **D06 — Files/reference/Git/PR** | DTO de diff; Entry relativo; intenção documentada de PR via host CLI; modo/context de `vcs.diff`; delegação de criação de PR e projeção de HostError; catálogo reference; status de Git usando diretórios da Location. | **Q026/Q029:** notificações. **Q027:** search DTOs. **Q028:** schemas efetivos das respostas; o comentário sozinho não demonstra seus campos. **Q030:** definições de `LocalSource`/`GitSource`. **Q031:** refusal kinds. **P33/P36** e os demais endpoints de **P44:** contratos declarados na tabela. Faltam a listagem de PR e os ramos de diff/activity/Session activity, inclusive **G57-E129**. |

Para fechar essas lacunas, bastam **intervalos literais locais vinculados às alegações apontadas**, ou uma redução explícita dos claims que deixe de atribuir ao lote detalhes ainda não demonstrados. Não é necessário reenviar arquivos inteiros ou executar o produto.

### Critérios aplicáveis

- **QS-1, QS-4, CC-3:** atendidos nos trechos e claims localizados acima; **pendentes para a tabela integral**, porque várias especificidades de contrato e delegação não têm evidência literal disponível.
- **QS-2:** o lote é útil para L1, mas ainda não sustenta o fechamento semântico de todos os membros que transporta.
- **QS-5:** respeitado. Comentários e anotações sustentam propósito declarado; não são recibos de execução, autorização efetiva ou efeito remoto.
- **QS-6:** o reúso é admissível e evita repetir as evidências já suficientes. Referências herdadas ainda não abertas neste pedido não substituem o julgamento dos respectivos claims.
- **CC-7:** origem herdada, transporte e ausência de nova execução estão explícitos. Preservo essa distinção.
- **GO-I1/GO-I2:** preservados os pareceres anteriores e a união dos findings. B1/B2 seguem aceitos; o presente finding é de B3 D01–D06.
- **GO-I7/GO-I8:** pins, hashes e conferência de membership identificam o pacote declarado; não autorizam ações nem provam suficiência semântica.

**Veto agregado de L1 mantido.** Este lote não concede aceite de Core/runtime, Atlas, consumidor, CI ou entrega.

## Cópia da mensagem inicial recebida — verbatim

````text
Você é o juiz nativo persistente parallel-v3-fresh/S1-04/J2 da execução local 94f1e157-8c44-4e6e-a4af-7690a8845ecf. Independente da autoria. NÃO use ferramentas, filesystem, navegação, delegação ou edição. Avalie somente dados fornecidos; responda com decisão concisa e evidências, sem raciocínio privado. Este primeiro lote é DELTA B1/B2 da B-v3, não libera L1 completo; B3 e os corpos restantes virão em lotes posteriores ao mesmo par. Preserve veto e solicite evidência específica quando faltar. Ambos os juízes cobrem todos os critérios aplicáveis, não meia barra.

Identidade: repo gustavomhss/hugr-orchestra, fonte 1cde2ff7a71bcf7aecb5d030917b577165135d38, protocolo ee2521a5b966bd505cc95bd1c733e09e12f33531, herança B-v3 em a8df22ae3a140c58c63f62ce2a634c84f415c943. Não se trata de produção nova retroativamente avaliada: é reavaliação dos findings históricos, rotulada regressão. Nove corpos B-v3 tiveram bytes UTF-8/Git blob/SHA256 recalculados pela principal. Seis são cópias B-v2; três mudaram (server-edge, schema-contracts, surface-disposition). Nenhum produto foi alterado ou teste executado.

Critérios deste lote: QS-1 fidelidade e precisão; QS-2 utilidade no L1; QS-4 contratos/dependências; QS-5 fonte/teste/execução distintos; QS-6 reúso econômico; CC-3 propósito/contrato sustentado; CC-7 gerados/docs/história explícitos; GO-I1 preservação; GO-I2 conflito visível; GO-I7 dados não concedem autoridade; GO-I8 hash/estrutura não provam suficiência. CC-1/B3 aguarda o lote completo. Esta revisão não vale como binding Atlas, consumidor, CI ou entrega.

Histórico preservado: B-v2 J1 SHA256 223f6b965dc8f1e5ed3600805275f0ca7d8c4cea0bb14aff10bdc857d3219f02 e J2 0ad7a34608713c5e40c9f7ecf023ecbc36d6e9e320925d4b67d448f23f034cf4, ambos FIX-FIRST. União obrigatória: B1 corrigir limite de diagnóstico; B2 fornecer active/history, rejeição cross-session, alocação SSE de produção e branches gerados completos; B3 triagem semântica dos 190 módulos. J2 partial PASS não elimina B3 de J1. Os artefatos boundaries/codegen têm claims declarados apoiados por ambos; sdk tem composição apoiada com tool.ts sob B3. Não conceda PASS desses corpos por esta informação isolada; receberá o pacote de reúso.

DADOS EXATOS DO DELTA E CLAIMS AFETADOS

1. server-edge atual: 5596 bytes, SHA256 711c744e089e59a11ee0b56ba4ec495277993dc7a58e351c8e2af4dc557ce404; base 5106 bytes f4b99d7a6bafb6a6aa672eeb5a63aa7621a14e65cfe863fe0f9d9eb36e0981de. Parágrafo corrigido literal:
The schema-error adapter defines `REASON_LIMIT = 1024`. For an oversized reason it retains `reason.slice(0, REASON_LIMIT)` and appends `... (N more chars)`, where N is `reason.length - REASON_LIMIT`; the limit therefore applies to the prefix as measured by JavaScript string length/slice. It logs and returns that prefix plus the omitted-character count in an `InvalidRequestError` with kind, so the complete summary may exceed 1,024 characters. A defect outside the typed error mapping is not proven to receive this treatment.

Fonte packages/server/src/middleware/schema-error.ts, blob d39702b74b11b1ee8e0072903bf1f9f19310da33, SHA256 cec3dac0a0706af6daa39233b37c453e99b57a234a40ddcd27ef01cb0777ec08. Literal:
const REASON_LIMIT = 1024
function truncateReason(reason: string) {
  if (reason.length <= REASON_LIMIT) return reason
  return reason.slice(0, REASON_LIMIT) + `... (${reason.length - REASON_LIMIT} more chars)`
}
export const schemaErrorLayer = HttpApiMiddleware.layerSchemaErrorTransform(SchemaErrorMiddleware, (error) => {
  const reason = truncateReason(error.cause.message)
  return Effect.logWarning("schema rejection").pipe(
    Effect.annotateLogs({ kind: error.kind, reason }),
    Effect.andThen(Effect.fail(new InvalidRequestError({ message: reason, kind: error.kind }))),
  )
})

2. session-contract corpo inalterado da correção MCP: 5155 bytes, SHA256 22b526a2423572f2bbc17f3bfccd2eb0ea8f7fb16f2215bb0904f1cc5c2125bc. Claims literais da tabela:
| `GET /api/session/active` | Reports process-local foreground drains, as session IDs mapped to `{type: "running"}`. It is not declared as a fleet-wide scheduler view. |
| `GET /api/session/:sessionID/history` | Exclusive nonnegative `after` sequence and limit 1–100, default 50; returns durable events with `hasMore`. |
| `GET /api/session/:sessionID/message/:messageID` | `{data: Message}`; missing or cross-session message returns `MessageNotFoundError`. |
O corpo atribui fontes Protocol/Server e declara: “This source supports the API admission result and adapter mapping; it does not on its own prove transactional persistence, crash recovery, scheduling, or exactly-once execution inside Core.”

Fonte Protocol groups/session.ts blob 5830f50001c8dc01227a920f04276054c0e29570, SHA256 2dad331fa3b169d4eff2f870b70a4524f24497cb4a08dda3ee4a09cf3783af1f:
const SessionActive = Schema.Struct({
  type: Schema.Literal("running"),
}).annotate({ identifier: "SessionActive" })
const SessionHistoryLimit = PositiveInt.check(Schema.isLessThanOrEqualTo(100))
export const SessionHistoryQuery = Schema.Struct({
  limit: Schema.NumberFromString.pipe(Schema.decodeTo(SessionHistoryLimit), Schema.optional),
  after: Schema.NumberFromString.pipe(Schema.decodeTo(NonNegativeInt), Schema.optional),
})
Anotação active literal: "Retrieve foreground Session drains currently owned by this Orchestra process. Sessions absent from the result are inactive."
Schema schema.ts blob d19a39b9708cfcaeedc1d7c62503afbadfee5dd7 define:
export const PositiveInt = Schema.Int.check(Schema.isGreaterThan(0))
export const NonNegativeInt = Schema.Int.check(Schema.isGreaterThanOrEqualTo(0))

Core session.ts blob 402a192a69bcad6a4b08c695657e24ff5e335f93, SHA256 d8c38d46bc6b78ec23d7dae7525fa2ad4c4f07f3f6b5963248e0a0e96d1fbe58, spans 24,270–275,469–472:
import { SessionStore } from "./session/store"
    const events = yield* EventV2.Service
    const projects = yield* ProjectV2.Service
    const execution = yield* SessionExecution.Service
    const store = yield* SessionStore.Service
    const locations = yield* LocationServiceMap.Service
    const global = yield* Global.Service
      message: Effect.fn("V2Session.message")(function* (input) {
        const stored = yield* store.message(input.messageID)
        return stored?.sessionID === input.sessionID ? stored.message : undefined
      }),
Core session/store.ts blob 1e44d051f1a51b816bfeb96ce46dbc0747d07aff, SHA256 2532e550ec0d74f7b07c33560651db176479d6b9d827fdc19d1d1198ba0628de. Serviço SessionStore usa Database.Service e Schema.decodeUnknownEffect(SessionMessage.Message); branch literal 73–86:
      message: Effect.fn("SessionStore.message")(function* (messageID) {
        const row = yield* db
          .select()
          .from(SessionMessageTable)
          .where(eq(SessionMessageTable.id, messageID))
          .get()
          .pipe(Effect.orDie)
        return row
          ? {
              sessionID: SessionSchema.ID.make(row.session_id),
              message: yield* decodeMessage({ ...row.data, id: row.id, type: row.type }).pipe(Effect.orDie),
            }
          : undefined
      }),
Server handlers/session.ts blob 1ce1cd359f5c9bbfc12122fad3d4439655a1e5bb, 686–698:
        "session.message",
        Effect.fn(function* (ctx) {
          const message = yield* session.message(ctx.params)
          if (message) return { data: message }
          return yield* new MessageNotFoundError({
            sessionID: ctx.params.sessionID,
            messageID: ctx.params.messageID,
            message: `Message not found: ${ctx.params.messageID}`,
          })
        }),
      )
  }),
)

3. stream-contract inalterado, 3824 bytes, SHA256 d1f68eb106131ba1efd61c4157b91826a25b176ab87ff74defc140ef9f4d67d8. Claims literais:
`packages/server/src/handlers/event.ts` creates a per-handler WeakMap frame cache keyed by event payload object. A repeated payload object is encoded once and the cached frame is shared across subscribers. Frames use event `message` and no SSE event ID. The function is an observed implementation mechanism; no performance measurement was taken.
`eventStream` obtains `EventV2.allBounded(events, 4096)` before producing `server.connected`, so a consumer observing readiness has already acquired its live subscription. The stream concatenates the connected frame and live events, merges 15-second heartbeat comments, and halts the merge when the primary side ends. The response sets `text/event-stream`, `no-cache, no-transform`, `X-Accel-Buffering: no`, and `X-Content-Type-Options: nosniff`. Capacity 4,096 is a declared subscription bound, not a proof that slow subscribers can never lose data or that a remote proxy honors these headers.

Fonte handlers/event.ts blob d644f36bdd6aa93cd538f560dab63337c2436022, SHA256 ca51a6d6bd47e97cda8d43b629e4a590cbe21e1a263b6146d3609d30bceae427. Literais:
export const eventFrames = (encode: (data: unknown) => string = encodeEvent) => {
  const frames = new WeakMap<object, string>()
  return (data: object): Sse.Event => {
    const cached = frames.get(data)
    const json = cached ?? encode(data)
    if (cached === undefined) frames.set(data, json)
    return { _tag: "Event", event: "message", id: undefined, data: json }
  }
}
export const subscriberCapacity = 4096
export const eventStream = (events: EventV2.Interface, frame = eventFrames()) => {
  const connected = {
    id: EventV2.ID.create(),
    type: "server.connected",
    data: {},
  }
  const output = Stream.unwrap(
    Effect.gen(function* () {
      // Acquiring the bounded stream installs its listener before readiness is observable.
      const live = yield* EventV2.allBounded(events, subscriberCapacity)
      return Stream.make(connected).pipe(Stream.concat(live))
    }),
  ).pipe(Stream.map(frame), Stream.pipeThroughChannel(Sse.encode()))
  const heartbeat = Stream.tick("15 seconds").pipe(Stream.map(() => ": heartbeat\n\n"))
  return output.pipe(Stream.merge(heartbeat, { haltStrategy: "left" }), Stream.encodeText)
}
export const EventHandler = HttpApiBuilder.group(Api, "server.event", (handlers) =>
  Effect.gen(function* () {
    const events = yield* EventV2.Service
    // One memo for the whole server, so every subscriber reuses the first one's encode.
    const frame = eventFrames()
    return handlers.handleRaw("event.subscribe", () =>
      Effect.succeed(
        HttpServerResponse.stream(eventStream(events, frame), {
          contentType: "text/event-stream",
          headers: {
            "Cache-Control": "no-cache, no-transform",
            "X-Accel-Buffering": "no",
            "X-Content-Type-Options": "nosniff",
          },
        }),
      ),
    )
  }),
)

4. client-projection inalterado, 5193 bytes, SHA256 089304921b004984de3b15b75af18fea3c7ebf15191f3874e9f668066569d478. Claim literal:
JSON success requires a JSON or `+json` media type, nonempty well-formed JSON, and maps read failures into transport errors. No-content cancels any response body and returns undefined. Binary success reads an ArrayBuffer into Uint8Array, but that await is not wrapped by the JSON reader's catch; this packet does not claim that every binary-body failure becomes a `ClientError`. The SSE reader is described in the streaming artifact.
stream-contract claim literal: The generated Promise client returns a lazy async iterable: opening/reading the stream happens during iteration. It checks the SSE content type and response body, decodes chunks, joins multi-line data, normalizes CRLF, parses JSON data, and cancels/releases the reader in `finally`. It limits its buffered string to 1,048,576 characters. That is a character-length guard, not a stated byte or event-count bound. No automatic reconnect/resume loop is implemented by this inspected transport.
Fonte generated/client.ts blob 93cab27e0b902d6e8fbd21d6aaec320a2b9fe09c; SHA256 f032a64d8223ac1b584ba17cf39e7f8da9e0be05f88682425692304a3a8ba20b. Ramos completos exigidos (595–597 e 649–654):
    if (descriptor.binary) {
      return new Uint8Array(await response.arrayBuffer()) as A
    }
      } finally {
        try {
          await reader.cancel()
        } catch {}
        reader.releaseLock()
      }
Branch binary SHA256 982420772be23bd408fa112c9a727d14cfc7a76b137ff8a564d5a8d2821efe9c; finally 918d47dde944d44dc0967056e6334260e085c304a3db27e7bc009ef1590422d8. Os demais detalhes de parser/codec são apoio B-v2 preservado, não novos deltas.

Retorne decisão por B1/B2.active-history/B2.cross-session/B2.production-sse/B2.generated-runtime e critérios aplicáveis. Limite seu PASS ao delta apresentado. Não solicite testes para afirmações explicitamente de fonte. B3 e o pacote completo permanecem em revisão futura.
````
