# Operar e manter Continuity e RAG

## Responsabilidades e base

Continuity reduz pedidos preservando recuperação; RAG diagnostica trechos admitidos e provas. `sent` não demonstra uso por modelo. Base: CR/HB aceitos em `8a041ca66982dcc2b89aaed46ebe347cb3de57db` e RV/CP para precisar portas. “Observado” é leitura estática, sem execução; localizadores ao final.

## Session define quais hooks existem

O default de `SessionCompaction.node` oferece compactação, com `transform` identidade e `afterStep` sem efeito. Continuity declara substituição e ferramentas por Location, sem provar instalação global. No runner normal, governança/ferramentas precedem transformação/compactação/stream; uso/custo/snapshot precedem `afterStep`. Estado é por Session na Location. Resumo é descartado se o contexto mudou; três falhas consecutivas suspendem novas tentativas de fundo. Compactação central antecede máscara forçada. [HB-S; CR-C]

Execução hospedada omite `transform`/`compactIfNeeded`; `afterStep` isolado não estabelece estado recuperável. `generate` omite hooks/registro. **Inferência:** mudar `modules/continuity/src/v2/strategy.ts` pode afetar caminhos diferentemente. Conferir `packages/core/src/session/runner/llm.ts` e `packages/core/src/session/compaction.ts`; admissão não prova conclusão. [HB-S]

## Mascaramento preserva uma cauda recuperável

Máscaras alteram cópias do pedido, não o histórico. Exigem `context_recall` materializado e economia estimada de tokens. A seleção normal protege os últimos cinco passos do assistente; alívio urgente pode alcançar resultados anteriores, mas exclui a mensagem mais recente. Resultados executados pelo provedor e ferramentas protegidas ficam fora. Erros preservam as primeiras 20 linhas; erros curtos ficam integrais. **Consequência:** alívio urgente não pode ocultar a última mensagem nem toda evidência de erro. [CR-C]

Cada candidato é arquivado antes da máscara; depois persistem-se máscaras. O stub aponta ao primeiro chunk; anexos viram nomes, sem binários. Seleção/formato em `modules/continuity/src/v2/masking.ts`, `strategy.ts`, `archive.ts` afeta economia e recuperação. Índice, Markdown por hash e `memory.json` ficam em `<data>/continuity/<sha256(sessionID)>`. Hash/tamanho são conferidos; flush/rename/mutex não provam atomicidade da Session. Falha na carga deixa máscaras vazias e `loaded` definido, sem retentativa. [CR-C; HB-S]

Recall exige permissão; busca/lista são locais/lexicais, referência pode alcançar outra sessão do mesmo seat no repositório selecionado. `missing` não equivale a ausência de match. Na exportação, eventos precedem blobs; `commit` não executa commit Git. Scrubbing, retenção e visibilidade/exportação têm limites em `archive.ts`/`tools.ts`. [CR-C; CR-M]

## RAG cruza leitura e persistência por requisição

Embedding está desligado. `packages/server/src/handlers/rag-studio-session.ts` carrega tabelas/arquivos, hidrata `memoryStore`, chama `noteBytes` e a operação em `withStore`, depois apaga/reinsere estado da Location. `packages/core/src/rag-studio/sql.ts` guarda metadados de fontes, chunks, revisões, perguntas e traces, sem texto integral da fonte. **Inferência:** leitura HTTP pode regravar estado; isolamento do ciclo não está demonstrado. [CR-R; HB-R]

`packages/server/src/handlers/rag-studio.ts` extrai antes de admitir e omite `allowExternal`, default nega. Recusa não prova ausência de leitura; prefixos não resolvem symlinks. Autorização envolve o handler e `modules/rag-studio/src/admit.ts`/`extract.ts`. PDF fornece texto, não identidade dos bytes brutos. [CR-R; HB-R]

## Pipeline e revisão têm identidades distintas

Portas em RV, com seus tipos declarados:

```typescript
readPipeline(locationId: string): Promise<Pipeline>
setPipeline(locationId: string, field: PipelineField, value: string | number): Promise<Pipeline>
openRevision(locationId: string): Promise<StoredRevision>
readRevision(revisionId: string): Promise<Revision>
```

Defaults: parser `plain`, boundary `document`, tokenizer `utf16`, K=4. `setPipeline` usa `Number(value)` para K e `String(value)` nos demais, sem validação runtime de campo/valor; o tipo TypeScript não fecha essa fronteira. `pipelineHash(pipeline: Pipeline)` deriva identidade de boundary/K/parser/tokenizer. Mudar strings de parser/tokenizer muda metadados, sem selecionar outra implementação nas funções inspecionadas. [RV:5–39; CR-R]

`openRevision` aloca ID e grava Location, parâmetros, `pipelineHash`, `fill` e membros ordenados por sourceId com contentHash; `snapshot` deriva dessas identidades/hash. `fill` falha diante de falha da Location, chunk órfão, membro faltante ou hash incompatível. `readRevision` rejeita ID ausente e retorna id/snapshot/pipelineHash/fill. Membership não congela texto: busca usa fontes/chunks atuais e não consulta a lista histórica da revisão. Controlar configuração, corpus e cortes separadamente. [RV:20–78; CR-R]

## Comparação exige uma mudança isolada

```typescript
compareRevisions(leftId: string, rightId: string, proofSetId: string):
  Promise<{ rejected: true } | { questions: CompareRow[] }>
```

CP exige ambas as revisões, proofSetId igual aos dois snapshots e exatamente um campo diferente entre parser/boundary/tokenizer/K. Abrir revisão esquerda, alterar um campo, fazer eventual recorte à parte e abrir a direita; usar o snapshot comum como proofSetId. A porta não executa passes nem iguala snapshots: lê os registros e recusa divergência. [CP:5–17; RV:42–63]

Compara todas as perguntas do Store, sem filtrá-las por revisão/Location. Só calcula mudança de span/texto quando a boundary mudou e há chunk marcado com a boundary direita; caso contrário retorna flags falsos. Essa detecção de recorte é global; a resolução posterior usa fontes/chunks atuais da Location direita. **Limite:** flags falsos não provam recuperação equivalente ao mudar K/parser/tokenizer; tampouco uma comparação aceita prova replay histórico ou uso por modelo. [CP:18–50; CR-R]

## Diagnóstico e percurso de manutenção

| Sinal | Contrato a seguir |
|---|---|
| Fonte mudou ou sumiu | Conteúdo novo mantém ID de Location/caminho e marca `not_yet_read`. `noteBytes` não recorta; reparse atualiza texto/hash/status; rechunk exige reparse compatível. Falha de leitura pode conservar metadados/chunks antigos: risco inferido, não reproduzido. |
| Hits sem prova | `ask` grava trace por revisionId; prova consulta questionId. O host persiste traces de perguntas sem converter a chave. Alinhar `ask.ts`, `trace.ts`, `proof.ts` e adaptador; fixture com trace manual não fecha essa ligação. |
| Revisão/pergunta substituída | Hidratação não avança `seq`, reiniciado em zero: risco inferido de IDs colidirem entre pedidos/Locations. Examinar `context.ts`, adaptador e SQL. |

Nomes curtos: `modules/rag-studio/src/`. Busca é substring sensível a caixa; `ask` retém primeiros K sem modelo. Spans são UTF-16; só `line` divide por linhas. K/span/corte alcançam schema, revisão, seleção, trace e prova. Passes são explícitos; remover fonte não limpa chunks. Transação, validação e autorização têm lacunas; nenhum controle executado aqui. [CR-R; CR-M; HB-R]

## Localizadores

CR = `S4:L1:continuity-rag`: CR-C, “Continuity: recoverable request reduction around the Session core”; CR-R, “RAG Studio: admitted-document diagnostics, with embedding off”; CR-M, “Maintenance impact and evidence limits”. HB = `S4:L1:host-boundaries`: HB-S, “1. Session → runner → compaction/Continuity”; HB-R, “2. HTTP RAG → Store por requisição → SQLite”. RV = `modules/rag-studio/src/revision.ts`; CP = `modules/rag-studio/src/compare.ts`, ambos no baseline `1cde2ff7a71bcf7aecb5d030917b577165135d38`. Só RV/CP foram reabertos por autorização progressiva; demais paths vêm das L1.
