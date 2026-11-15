## Parecer — rodada 3a, B3 D01–D06

**FIX-FIRST para o lote integral de 80 paths.** As evidências sustentam partes relevantes dos seis domínios, mas vários membros continuam apresentados apenas por descrição e identificador de evidência. Isso não permite aceitar todos os claims locais exatos.

**Os PASS de B1/B2 permanecem inalterados.** As pendências abaixo são de cobertura semântica do lote B3, sem solicitação de testes, auditoria operacional ou garantias amplas de Core/runtime.

### Evidência já suficiente neste lote

- **D01:** separação entre `BindingRef`, `OperationIntent` e `ExecuteInput`; erro público Actions 400; delegação de `prepare`; construção da referência de binding e projeção comum de erros.
- **D02:** intenção declarada de substituição ordenada de comportamentos; reminders como texto declarado sem autoridade de permissão; escrita de configuração com validação local do nome e mapeamento de conflito; delegação de `behavior.set`, catálogo de comandos e `skill.save`.
- **D03:** verificações locais de existência e pertencimento à sessão em permission get/reply e question reply/reject, incluindo os respectivos erros de ausência. O registro de permissão salva também está demonstrado.
- **D04:** estado de revert, notificação `session.compacted`, campos livres de status/prioridade de todo e atualização vinculada à sessão.
- **D05:** query opcional de Location, prefixo declarado de Workspace, contexto de criação de cópia e precedência explícita de `projectID`/`sourceDirectory` fornecidos pelo adapter; chamadas de registro e inicialização de projeto.
- **D06:** DTO de delta de arquivo e entrada relativa de filesystem; modalidade do endpoint de diff; criação de PR e projeção do erro do host; catálogo de referências; guarda local de Git antes de consultar status.

Esses suportes não equivalem a PASS dos domínios completos.

### Lacunas obrigatórias precisas

| Domínio | Evidência ainda necessária para os claims exatos |
|---|---|
| **D01 — Actions** | **Sem trecho literal:** P01, P04–P09, Q047, Q050–Q053 e G57-E008/E009/E012/E014/E015/E017/E020/E022. São necessários os exports, DTOs, endpoints ou chamadas que sustentem seus propósitos específicos. **Trechos parciais:** P02 não mostra bindingID, revisão e limites/attempt; P03 mostra somente retry, sem definição de `Params` ou play/cancel/erase; Q048 não mostra os vocabulários fechados de recusa/disposição; G57-E013 não mostra get/reconcile. Em Q051, apresentar especificamente os schemas que fundamentam “strict” e a qualificação “request-only secret-bearing output”. |
| **D02 — Agent/behavior/skill/command** | **Sem trecho literal:** P12, P17, P42, Q002, Q004, Q005, Q007 e Q008. **Complementos:** P10 precisa de detail/file-get e da declaração de conflito por revisão stale; Q001 precisa dos campos relevantes ao markdown, revisão de leitura e atualização ordenada de permissões; Q003 precisa da identidade estável. G57-E024 deve sustentar listagem/anotação de agentes, tools e skills; G57-E121/E122 devem sustentar as operações de skill ainda não mostradas. Onde o claim atribui ownership a Location, incluir o trecho de contexto/placement correspondente. |
| **D03 — Permission/question** | P30 precisa dos endpoints pending/saved, reply NoContent e placement dos endpoints de sessão; P34 não tem trecho literal. Q009 precisa das formas modernas/históricas mencionadas; Q011 precisa do payload ordenado de respostas. Nos handlers, faltam os caminhos de listagem/pending/saved/create descritos nas linhas locais; os trechos atuais demonstram principalmente get/reply e reply/reject. Para listagem por sessão, mostrar o filtro ou a delegação com esse escopo. **As verificações locais de ownership já demonstradas não precisam ser reapresentadas.** |
| **D04 — Projeções** | Q013 não mostra os campos de timestamp afirmados na tabela. Basta acrescentar suas declarações, ou restringir essa cláusula ao conteúdo efetivamente apresentado. Os demais claims locais deste domínio estão sustentados. |
| **D05 — Project/workspace/copy** | **Sem trecho literal:** P31, Q016, Q017, Q019, Q021, Q023 e Q024. **Complementos:** P26 precisa de deepObject, resposta Info direta e `paths.home`; P32 precisa de mutation e do contrato initGit com LocationQuery/resposta nullable; Q018 precisa do construtor; Q020, de `project.updated`; Q022, da estratégia e remoção. G57-E059 deve mostrar a descrição de Location; G57-E072 precisa das partes de lifecycle e nome opcional por LLM; G57-E075/E076 precisam de list/update e do contexto que sustenta a qualificação sobre inicialização antes dos serviços de Location. |
| **D06 — Files/reference/Git/PR** | **Sem trecho literal:** P33, P36, Q026 e Q029. **Complementos:** P44 precisa de info/status, métricas e atividade de sessão; Q027, dos DTOs de search match; Q028, das declarações de respostas — o comentário sozinho não demonstra seus formatos; Q030, das definições de `LocalSource`/`GitSource`, incluindo caminho absoluto e branch; Q031, dos tipos de recusa. G57-E077 precisa da listagem de PR; G57-E127/E129 precisam de diff/activity e do escopo de Session afirmado. |

A correção pode usar **trechos mínimos decisivos**, sem repetir corpos inteiros já suficientes. Para cláusulas adicionais de uma linha parcialmente sustentada, também é aceitável restringir explicitamente o claim, preservando a triagem individual de cada path.

### Critérios e limites

**QS-1/2/4 e CC-3** impedem o PASS integral enquanto faltarem os suportes acima. O problema é a ligação entre claims locais e fonte apresentada, não a ausência de resultados operacionais.

**QS-5** permanece respeitado: não concedo execução, autorização efetiva, persistência, recuperação, efeitos remotos ou desempenho a partir desses DTOs/adapters. Em **QS-6 e CC-7**, a identificação do reúso e da leitura histórica está clara, mas referências herdadas não substituem o conteúdo necessário para julgar cada claim.

Para **GO-I1/2**, preservo o histórico e a coexistência dos PASS anteriores com estas pendências. Para **GO-I7/8**, nem comentários, nem IDs de evidência, membership ou hashes constituem aceite semântico ou autoridade adicional.

**Este parecer não fecha B3, o reúso ou o L1 integral.**

## Cópia verbatim da mensagem inicial recebida

```text
Você é o juiz nativo persistente parallel-v3-fresh/S1-04/J1 da execução local 94f1e157-8c44-4e6e-a4af-7690a8845ecf. Independente da autoria. NÃO use ferramentas, filesystem, navegação, delegação ou edição. Avalie somente dados fornecidos; responda com decisão concisa e evidências, sem raciocínio privado. Este primeiro lote é DELTA B1/B2 da B-v3, não libera L1 completo; B3 e os corpos restantes virão em lotes posteriores ao mesmo par. Preserve veto e solicite evidência específica quando faltar. Ambos os juízes cobrem todos os critérios aplicáveis, não meia barra.

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
```
