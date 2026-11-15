## J2 — **B1/B2 fechado como fonte: PASS do delta**

As evidências adicionais resolvem `B2.active-history`, e a redação corrigida do `stream-contract` descreve precisamente o objeto armazenado no cache. **Não resta finding aberto de B1/B2 neste recorte.** Os PASS anteriores permanecem preservados.

### Pontos reavaliados

| Ponto | Decisão | Evidência |
|---|---|---|
| **B2.active-history — active** | **PASS** | `protocol/src/groups/session.ts:174–185` declara `{data: Record(Session.ID, SessionActive)}` e o significado restrito aos drains foreground do processo. `server/src/handlers/session.ts:164–173` constrói efetivamente esse mapeamento, com `{type: "running"}` por ID retornado por `session.active`. |
| **B2.active-history — history** | **PASS** | O schema anteriormente apresentado estabelece `limit` de 1–100 e `after` não negativo. O handler aplica o default **50** e devolve `page.events`/`page.hasMore`. O Core encaminha a consulta para `readAggregate` com `SessionDurable`; essa função lê `EventTable`, restringe o agregado e os tipos do manifesto, usa **`gt(EventTable.seq, after)`**, ordena por sequência e busca `limit + 1` registros. `rows.length > input.limit` sustenta `hasMore`. O protocolo também declara a resposta de eventos duráveis e a sequência exclusiva. |
| **B2.production-sse — precisão do cache** | **PASS da correção textual** | `eventFrames` armazena a **string JSON serializada** no `WeakMap`. Cada chamada retorna um novo objeto `Sse.Event`; `Sse.encode()` ocorre posteriormente. O novo parágrafo explicita essas três etapas e não atribui compartilhamento de identidade ao objeto de frame. O compartilhamento do cache entre assinantes continua sustentado pela alocação no handler já apresentada. |

A versão do `stream-contract` reavaliada é a informada com **3.883 bytes**, SHA256 `8aac12750cd96c30f9bee287bdab2fdbb61ca67903b604aa8a0c1809e7c4bdfa`. A versão anterior permanece parte do histórico; sua preservação e a substituição reversível são informações declaradas no pacote, não verificações executadas por este juiz.

### Estado consolidado de B1/B2

| Item | Estado |
|---|---|
| B1 — limite do diagnóstico | **PASS preservado** |
| B2.active-history | **PASS; lacuna de fonte resolvida** |
| B2.cross-session | **PASS preservado** |
| B2.production-sse | **PASS; alocação preservada e descrição do cache corrigida** |
| B2.generated-runtime | **PASS dos ramos apresentados, preservado** |

### Critérios e limites

**QS-1, QS-4 e CC-3** ficam atendidos para os claims deste delta pelas ligações explícitas entre contrato, adapter e seleção no Core. **QS-2** fica atendido quanto à utilidade dessas evidências para L1, sem equivaler à suficiência de L1 completo. **QS-5** permanece respeitado: o fechamento é de fonte, sem resultado de teste, execução ou medição de desempenho.

**QS-6 e CC-7** permanecem atendidos neste recorte pelo reúso delimitado e pela identificação de código gerado e histórico; isso não aprova os corpos integrais ainda pendentes. **GO-I1 e GO-I2** exigem conservar os pareceres anteriores e registrar a resolução atual sem apagar os findings históricos. **GO-I7 e GO-I8** continuam preservados: dados, hashes e estrutura não concedem autoridade nem demonstram suficiência global.

**O veto agregado à liberação completa de L1 permanece**, porque B3 e o pacote de reúso continuam pendentes e não foram objeto desta reavaliação. Este PASS não constitui binding Atlas, consumidor, CI ou entrega.
