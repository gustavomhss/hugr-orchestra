# Rodada 5 — integração SDK e contratos, lente Geohot

O usuário acrescentou Geohot/George Hotz ao grupo, que passa a sete agentes `gpt-6.1-sol`. A lente é de integração prática e coerência entre implementações; não é identidade real. Agente: `sol_geohot`, com modelo escolhido explicitamente e contexto novo.

Baseline de código: `e70717ac937f26d38dbf9235860597f86447fa09`, branch `orchestra-audit`, worktree isolada. Somente leitura; o lead mantém autoria dos documentos e não altera o HEAD enquanto a leitura está em andamento.

## Despacho

Domínio: Promise/Effect em packages/client, embedding/layers/lifecycle de sdk-next, tooling/httpapi-codegen e comparação com schemas Protocol/handlers concretos Server. Buscar encoding de query/path/body, optional/nullable/responses/binary, cancelamento, erros e disposal/Scope. Os 42 mecanismos antigos e os 21 da rodada 3 foram disponibilizados para deduplicação, incluindo SSE 1 MiB, terminal LLM, fila WebSocket, export/import e políticas já relatadas.

Não há mínimo de achados. Até seis novos mecanismos fortes, com entrada até efeito, mitigadores e consumidores reais. Biblioteca sem integração encontrada deve ser condicionada. Não executar testes locais/CI/runtime, reiniciar serviços, alterar generated, escrever arquivos ou criar subagentes. Toda recomendação de correção gerada deve ir ao gerador e regenerar pelas rotinas do repositório.

## Registro de andamento

Baseline e AGENTS confirmados. Primeira leitura cobriu runtime Promise, adaptadores Effect, encoding/normalização no gerador e construção/disposal de sdk-next. Foram descartados como achado preliminar drift de revision de artifact com conversão explícita e suspeitas de encoding boolean/number padrão. MemoMap/ownership e upload/download permaneciam em confronto de consumidores. Nenhum achado foi contado antes de seu fechamento.

O retorno fechou dois novos P2, ambos condicionados ao uso de APIs de biblioteca. Não foi identificado consumer de produção Orchestra dos caminhos Effect/sdk-next afetados. O lead conferiu MemoMap, persistência compartilhada e o renderer de campos opcionais. Nenhum teste/runtime foi executado.

## G1 — P2 condicionado: adaptador Effect invalida payload parcial válido

**Confiança alta na cadeia estática.** [`effect-headers.ts:44`](../../tooling/httpapi-codegen/src/effect-headers.ts#L44) omite optional field ausente somente quando source=query. Para payload emite propriedade com valor undefined. [`relay-document.ts:60`](../../packages/protocol/src/groups/relay-document.ts#L60) usa Schema.optionalKey exato para criação/atualização.

**Sequência:** consumidor chama relayDocuments.create apenas com name, input válido na assinatura; adaptador em [`generated-effect/client.ts:2130`](../../packages/client/src/generated-effect/client.ts#L2130) introduz description/nodes/connections/nodeGroups/tags/meta/isArchived próprios com undefined; HttpApiClient valida contra o schema antes de JSON.stringify e falha localmente, sem chegar ao handler. Update parcial tem a mesma causa em linhas 2173–2188. sdk-next retorna esse cliente em orchestra.ts:45–51.

**Contraprova examinada:** stringify removeria undefined, mas é posterior à validação. O Sol leu Effect 4.0.0-beta.83 exato no cache: HttpApiClient.ts:367–370/398–404/949–1004, Schema.ts:1934–1956 e SchemaAST.ts:2226 distinguem ausência de propriedade própria undefined. Patch local não muda essa semântica. optional normal que admite undefined não é afetado do mesmo modo.

**Impacto:** chamadas básicas da API Effect/embedded falham com ClientError apesar de input parcial válido. O app usa Promise, cujo JSON.stringify remove os campos; não se atribui a falha à UI instalada. Fornecer todos os campos pode contornar.

**Correção/teste:** omitir optional fields conforme schema também fora de query, sem tolerar ausência de obrigatórios. Corrigir gerador e regenerar Client; nunca editar generated. Testar {}, name isolado, enabled=false e undefined normalizado por adaptador inline/imported e router real. Teste existente optional-query cobre a causa só para query.

## G2 — P2 condicionado: hosts embedded compartilham Session, mas não ownership de execução

**Confiança alta na estrutura e alcançabilidade; efeitos não executados.** [`sdk-next/orchestra.ts:16`](../../packages/sdk-next/src/orchestra.ts#L16) cria MemoMap por create; router o recebe em linha 39. [`execution/local.ts:16`](../../packages/core/src/session/execution/local.ts#L16) cria coordinator e run-coordinator.ts:42 mantém Map por construção. Hosts diferentes não compartilham essa exclusão.

**Persistência comum:** database.ts:54–67 fixa path comum. embedded.test.ts:11–12 declara hosts na mesma DB e linhas 166–198 testam isolamento de notificações. Session existente é adotada em session.ts:359–361; session-location.ts:35–57 resolve pela DB, sem domínio de host que impeça B de endereçar a Session de A.

**Cronologia:** A recebe prompt e inicia provider bloqueado numa barreira; B admite steer distinto para a mesma Session; wake de B vê Map vazio, encontra input pendente e inicia outro provider enquanto A continua. Não exige dois wakes simultâneos nem disputa pela mesma linha de input. Interrupt/wait/active de B só consultam seu coordinator e não controlam owner de A.

**Impacto:** embedding com dois hosts sobre o mesmo store pode executar turnos/ferramentas concorrentes na mesma Session e oferecer controles que não alcançam o owner. Não há prova de que o app padrão cria dois hosts sdk-next; uma instância ou DBs realmente distintas evita o cenário.

**Mitigadores:** cada host serializa corretamente dentro de seu próprio coordinator. Event buses independentes são intencionais/testados, mas não isolam registros duráveis. Promoção/idempotência de inbox não fornece ownership da execução; um segundo input com A já ativo demonstra a distinção.

**Correção/teste:** autoridade de execução por storage namespace + Session ID compartilhada no processo, com roteamento/vida útil corretos, ou recusa explícita de hosts simultâneos sobre o mesmo store. Dois hosts/mesma DB/provider A em barreira devem serializar o steer de B; interrupt de B alcança A ou recusa ownership explicitamente; fechar B não pode parar A indevidamente. Sessions distintas continuam concorrentes.

## Cobertura e descartes finais

Leitura de runtime Promise (prepare/encoding/JSON/binary/errors/SSE), adaptadores Effect, compile/normalização/tipos/headers no codegen, sdk-next constructor/MemoMap/router/operator transport/renovação/Scope/disposal e contratos Relay/artifacts/connections/Session/Location/filesystem. Upload/download preserva AbortSignal, redirect manual e ownership de Response nos caminhos examinados.

Descartados: revision de artifact com conversão explícita; query boolean/number padrão; suspeita de ApplicationTools com mapa separado, pois o constructor compartilha MemoMap dentro do mesmo host. Não se recontaram SSE 1 MiB, terminal LLM, queue WebSocket, export/import ou políticas já inventariadas. Não é prova integral do gerador ou execução embedded.
