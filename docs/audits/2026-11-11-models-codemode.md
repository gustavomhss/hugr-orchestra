# Rodada 2 — modelos, streaming e CodeMode

Agente `sol_elon`, modelo `gpt-6.1-sol`, lente de primeiros princípios. Snapshot `e70717ac937f26d38dbf9235860597f86447fa09`. Seis achados novos P2, deduplicados da rodada 1 e revisados pelo lead. Análise estática; nenhum teste executado. Os três últimos são riscos de bibliotecas públicas, sem consumidor do caminho correspondente de produção identificado no snapshot.

## E6 — P2: catálogo anuncia modelos que o runner nativo não executa

**Confiança alta. Alcance:** produto, seleção explícita no runner nativo.

[`catalog.ts:281`](../../packages/core/src/catalog.ts#L281) considera disponibilidade do provedor e enabled, sem compatibilidade do executor. [`runner/model.ts:217`](../../packages/core/src/session/runner/model.ts#L217), linhas 260–270 e 289–305, aceita rotas OpenAI, Anthropic e compatible/OpenRouter; modelos Google/Azure/Bedrock anunciados pelo catálogo acabam em UnsupportedApiError nesse caminho. O endpoint de modelos os expõe em [`handlers/model.ts:12`](../../packages/server/src/handlers/model.ts#L12).

**Cenário:** conectar provedor, selecionar explicitamente modelo anunciado como disponível e enviar prompt nativo. A seleção resolve, mas o turno falha. Hooks AISDK dos plugins não corrigem o caminho, que usa LLMClient nas rotas nativas.

**Mitigações:** seleção automática filtra supported; hosts externos têm outro executor. O teste `session-runner-model.test.ts:482` confirma rejeição deliberada de Google, mas não alinha a disponibilidade publicada à capacidade do executor.

**Correção/teste:** disponibilidade por engine, ou implementação das rotas; teste integrado catálogo → seleção → turno para cada provedor anunciado. Modelo sem executor deve apresentar limitação antes de admitir o prompt.

## E7 — P2: variante válida no catálogo é recusada no preparo HTTP

**Confiança alta. Alcance:** produto, variantes configuradas com os campos citados.

[`runner/model.ts:147`](../../packages/core/src/session/runner/model.ts#L147) incorpora body da variante e withDefaults o transfere ao http.body. [`route/transport/http.ts:31`](../../packages/llm/src/route/transport/http.ts#L31) rejeita overlays de campos canônicos, incluindo temperature e thinking.

**Cenário:** variante com `body.temperature` ou Anthropic `body.thinking`, formas presentes nos testes de resolução. Catálogo e seleção aceitam; prepare falha antes de qualquer chamada ao provedor. O contrato da variante oferece body/headers, sem alternativa correspondente para opções canônicas nesses casos.

**Mitigações:** a denylist é intencional e útil; o defeito é a combinação incompatível de contratos. Variantes que usam reasoning/output_config não estão automaticamente incluídas. Testes nas linhas 256–295 e 361–396 de `session-runner-model.test.ts` inspecionam defaults intermediários, sem executar prepare.

**Correção/teste:** representar opções canônicas no contrato da variante e baixá-las antes do transporte; rejeitar variantes incompatíveis no catálogo. Estender os testes até LLMClient.prepare e conferir body final.

## E8 — P2: EOF semanticamente incompleto termina o stream com sucesso

**Confiança alta. Alcance:** produto, endpoint/proxy compatible que fecha normalmente sem terminal.

[`route/client.ts:287`](../../packages/llm/src/route/client.ts#L287) não exige terminal no stream; [`protocols/openai-chat.ts:462`](../../packages/llm/src/protocols/openai-chat.ts#L462) não sintetiza finish no halt. [`runner/llm.ts:533`](../../packages/core/src/session/runner/llm.ts#L533) só publica Step.Ended se há stepSettlement, mas permite concluir quando stream teve Success mesmo sem settlement.

**Cenário:** HTTP 200 envia delta de texto válido e fecha o SSE normalmente sem finish_reason. A mensagem persiste incompleta, sem completion/falha, enquanto o drain termina. Custo do trecho não é assentado.

**Mitigações:** generate exige terminal em `route/client.ts:379–390`; o runner usa stream. Falha explícita de transporte tem tratamento e não é a pré-condição deste item. A reconexão da UI é outro mecanismo, já relatado em E2.

**Correção/teste:** exigir término semântico no stream ou settlement antes da conclusão do runner. HTTP 200 com um delta seguido de EOF deve gerar falha durável e conclusão explícita do assistente, nunca sucesso silencioso.

## E9 — P2: fila WebSocket cheia descarta frames sem sinalizar perda

**Confiança alta. Alcance:** transporte WebSocket público; o resolver Core examinado usa HTTP.

[`route/transport/websocket.ts:138`](../../packages/llm/src/route/transport/websocket.ts#L138) cria Queue.bounded(128) e ignora o boolean de Queue.offerUnsafe. Na [implementação exata do Effect 4.0.0-beta.83](https://raw.githubusercontent.com/Effect-TS/effect-smol/effect%404.0.0-beta.83/packages/effect/src/Queue.ts), linhas 671–684, offerUnsafe retorna false sem enqueue quando essa fila está cheia.

**Cenário:** consumidor bloqueado e burst superior à capacidade. Deltas, output_item.done ou response.completed podem sumir. Isso pode truncar texto, omitir chamada de ferramenta ou deixar consumo esperando por terminal já descartado enquanto o socket continua aberto.

**Mitigações:** o protocolo tem terminal, mas ele depende da entrega do frame. Testes WebSocket existentes usam seam de stream e estado de socket fechado; não exercitam pressão da fila real.

**Correção/teste:** controle de fluxo/buffering apropriado, ou erro explícito e encerramento no overflow. Testar fila real com burst >128 e consumidor parado, exigindo entrega integral ou erro declarado.

## E10 — P2: regex síncrona do host escapa do timeout CodeMode

**Confiança alta na ausência de preempção. Alcance:** biblioteca, quando um host executa CodeMode não confiável no próprio processo; integração de produção não encontrada.

[`stdlib/regexp.ts:52`](../../packages/codemode/src/stdlib/regexp.ts#L52) executa test/exec no RegExp do host. [`interpreter/runtime.ts:2280`](../../packages/codemode/src/interpreter/runtime.ts#L2280) chama o built-in sincronamente; o timeout de linhas 3377–3391 é Effect no mesmo processo. Backtracking patológico pode bloquear o event loop antes que o timeout receba controle. O README afirma limitação de backtracking pelo timeout na linha 250, excedendo a garantia implementada.

**Impacto:** aplicação hospedeira pode ficar sem resposta muito além do deadline e sem cancelamento efetivo. Não se afirma que o servidor Orchestra usa esse caminho hoje.

**Mitigações:** loops do interpreter cedem controle e têm teste de timeout; isso não cobre operações síncronas do host. **Correção/teste:** regex com execução limitada ou isolamento terminável; testar em worker/subprocesso com watchdog externo, preservando a responsividade do processo da suíte.

## E11 — P2: reuso do mesmo Effect compartilha estado entre execuções CodeMode

**Confiança alta. Alcance:** biblioteca pública, consumidor que reutiliza o valor Effect.

[`interpreter/runtime.ts:3349`](../../packages/codemode/src/interpreter/runtime.ts#L3349) cria ToolRuntime, calls e logs antes da execução do Effect. Linhas 3366–3375 e 3402 reaproveitam esses objetos e entregam o array de calls. [`tool-runtime.ts:715`](../../packages/codemode/src/tool-runtime.ts#L715) usa o contador compartilhado.

**Cenário:** construir um único `CodeMode.execute` com uma chamada e maxToolCalls=1 e executar seu Effect duas vezes. A primeira consome o orçamento; a segunda começa com calls.length=1 e falha antes de sua primeira chamada. Sem limite, logs anteriores contaminam resultados; execução posterior também pode modificar o array já entregue. Composição concorrente compartilha o mesmo contador.

**Mitigação:** chamadas novas a execute criam Effects distintos. **Correção/teste:** alocar estado por execução dentro de suspend/gen e devolver snapshots; executar o mesmo Effect sequencialmente e em paralelo, exigindo orçamento/logs independentes e imutabilidade do resultado anterior.

## Cobertura e limites

| Subdomínio | Leitura e invariantes examinadas | Limites |
| --- | --- | --- |
| Catálogo/modelo/credencial | catalog, provider, model, runner/model, config/provider, models-dev; identidade, lowering, disponibilidade e opções | Sem chamada autenticada real ou certificação de OAuth por provedor |
| Extensões | AISDK, APIs plugin Effect/Promise, plugins OpenAI/Anthropic/Google/Vertex/Azure/Bedrock/Copilot/Cloudflare/XAI/Cortex | Hooks legados não foram tratados como executor atual; reload/dispose não integral |
| Streaming | route/client, HTTP/WebSocket, framing/tool-stream, parsers Chat/Responses/Anthropic/Gemini/Bedrock, publisher/runner | Sem fault injection; eventos hosted-tool não exaustivos |
| Uso/custo/contexto | Usage mappers, cost tiers, publisher, trechos compaction | Sem faturas ou toda metadata variante |
| CodeMode/OpenAPI | Interpreter, tool-runtime, values, regex/string/promise, OpenAPI runtime/index/spec; limites e confinamento | Sem consumer de produção ou prova de limites de memória |

Descartados: hipótese de cache AISDK antigo sem consumidor atual; metadata OAuth isolada sem endpoint incorreto; pequenas ultrapassagens de output por marcadores. O Sol confirmou X1/X2 do TUI como contraditório; esses achados constam no relatório crosscutting e não são recontados aqui.
