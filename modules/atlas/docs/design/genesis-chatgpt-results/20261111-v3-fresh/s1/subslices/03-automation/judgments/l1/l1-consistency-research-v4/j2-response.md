## PASS — `s1.core.research`, L1 v4 completo, R0–R14

**Corpo avaliado:** 64.106 bytes · SHA-256 `c3925ca6e27465598796ef21815e79980277d4c3194a8b2fda7cf433700675d1` · Git blob `69fda8b4a63d5480b7d78e8f915e1d90fb8a2b8b`.

O **corpo inteiro v4 é semanticamente suficiente no escopo local de L1/component**. A substituição em R8.1 corrige a afirmação reaberta; mantenho a avaliação dos segmentos inalterados de R0–R14.

### ROOT-R-L1-F01 — fechado

A nova formulação corresponde ao ramo completo de **RB-S002/E24, `query.ts`, linhas 176–225**:

- A ausência de shards no escopo produz `index_unavailable` antes do caminho de disparo.
- O disparo exige conjuntamente `missing`, ausência de build indicado pelo plano ou pelos shards e disponibilidade de `ctx.extract`. `missing` também inclui fallback stale, mesmo quando existe um shard utilizável para responder.
- Quando nenhum shard é utilizável, os erros distinguem as condições observadas. Receber `index_building` ou `index_unavailable` não demonstra, por si só, que esta chamada iniciou um build.

O delta preserva, portanto, a diferença entre **estado observado, capacidade de iniciar trabalho e ação efetivamente solicitada pelo ramo**. Isso resolve o achado de fidelidade em **QS-1, CC-3, GO-A1 e GO-A5**, sem depender de execução de produto.

**Reconheço que a afirmação incondicional também constava no L1 v3 anteriormente aprovado.** A condição agora explicitada pertence aos bytes v4; não deve ser atribuída retroativamente ao texto antigo. Os pareceres anteriores permanecem históricos e intactos.

### Conclusão agregada

**AC-01 está atendido para o entendimento local deste componente.** Permanecem as disposições anteriores dos demais critérios públicos pertinentes e os fechamentos já estabelecidos, inclusive a correção do orçamento de Locate incorporada no v3. Não há achado obrigatório ou pedido adicional de evidência aberto para este corpo v4.

O procedimento anterior à aplicação, o incidente de bootstrap registrado e o manifesto posterior permanecem categorias distintas na proveniência apresentada; a conferência de bytes não substitui o fundamento semântico acima.

**Este parecer não avalia nem aceita automaticamente o L2.** Sua atualização para o predecessor v4 e sua revisão própria continuam necessárias. O PASS aqui emitido não abrange binding Atlas, consumidores, manutenção, união ou aceite operacional.