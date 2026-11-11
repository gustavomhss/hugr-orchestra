# Fluxos de dados, decisões e conhecimento na S4

Base aceita: payload `47eaa5322102910289cb56e2e07e9d3536ba1926`. A=`S4:L2:atlas-system`; C=`S4:L2:continuity-rag-operations`; G=`S4:L2:genesis-governance`. Inspeção herdada, inferências marcadas e execução atribuída à evidência. Sem execução nesta L3.

## Um host, três percursos de estado

Os fluxos recuperam contexto, examinam documentos e servem conhecimento com autoridade; mantêm IDs distintos:

| Percurso | Identidade e dado preservado | Conclusão permitida |
|---|---|---|
| Session/Continuity | Session na Location; arquivo em `<data>/continuity/<sha256(sessionID)>` | Recuperar material mascarado, sujeito a permissão/integridade. |
| RAG/Store | Location/fonte/chunk/revisionId/snapshot/questionId | Diagnosticar seleção/provas; revisão não congela texto. |
| Genesis/Atlas | scope/artifact/result/receipt/inputs | Conferir conhecimento publicado, reviews e inputs atuais. |

**Inferência:** host/Location compartilhados não unem transações ou IDs. Circular no pedido não dá autoridade ao trecho. Não foi demonstrada promoção automática de conversa/prova RAG a artefato Atlas. [C § Mascaramento preserva uma cauda recuperável; C § Pipeline e revisão têm identidades distintas; A § Por que texto igual pode exigir outro resultado]

## Do turno à redução recuperável do pedido

No runner normal, governança/ferramentas precedem transformação/compactação/stream; uso/custo/snapshot precedem `afterStep`. O default `SessionCompaction.node` compacta, com transform identidade e afterStep vazio. Continuity declara substituição por Location, sem provar instalação global. Execução hospedada omite transform/compactIfNeeded; generate omite hooks/registro. **Consequência:** identificar a entrada antes de atribuir efeitos à estratégia. [C § Session define quais hooks existem]

Máscara exige `context_recall` materializado e economia estimada. Arquivar precede mascarar; persistir máscaras vem depois. Histórico permanece, stub aponta ao primeiro chunk, anexos viram nomes. A seleção normal protege os últimos cinco passos do assistente; urgência exclui a última mensagem, mantém ferramentas protegidas e evidência de erro. Reduzir a cópia enviada conserva recuperação, sem provar uso por modelo. [C § Mascaramento preserva uma cauda recuperável; C § Responsabilidades e base]

Contexto alterado descarta resumo; três falhas consecutivas suspendem tentativas de fundo. Carga falha deixa máscaras vazias e loaded definido, sem retentativa. **Inferência:** pedido grande pode decorrer de hook ausente, recall, proteção ou carga falha; ampliar máscara não resolve todas essas causas. Flush/rename/mutex não provam atomicidade de Session. [C § Session define quais hooks existem; C § Mascaramento preserva uma cauda recuperável]

## Da requisição RAG à evidência de seleção

Embedding desligado. O handler carrega tabelas/arquivos, hidrata memoryStore, chama noteBytes/operação em withStore e apaga/reinsere estado da Location. SQL guarda metadados de fontes/chunks/revisões/perguntas/traces, sem texto integral da fonte. Leitura HTTP pode regravar estado; isolamento não foi demonstrado. Extração precede admissão; allowExternal omitido nega, mas recusa não prova ausência de leitura nem prefixos resolvem symlinks. [C § RAG cruza leitura e persistência por requisição]

`noteBytes` sinaliza conteúdo novo como not_yet_read; reparse atualiza texto/hash/status; rechunk exige reparse compatível. Remover fonte não limpa chunks. Revisão grava parâmetros, pipelineHash, fill e membros com contentHash; busca usa fontes/chunks atuais. **Inferência:** registrar configuração/membership não garante replay dos mesmos bytes. [C § Diagnóstico e percurso de manutenção; C § Pipeline e revisão têm identidades distintas]

`compareRevisions` exige duas revisões, proofSetId igual aos dois snapshots e exatamente um campo diferente entre parser/boundary/tokenizer/K; não executa passes. Só calcula mudança de span/texto para boundary alterada com chunk marcado à direita; flags falsos não provam equivalência. `setPipeline` coage valores, sem validação runtime. Strings de parser/tokenizer mudam identidade sem escolher outra implementação examinada. [C § Comparação exige uma mudança isolada; C § Pipeline e revisão têm identidades distintas]

`ask` busca substring sensível a caixa e retém K, sem modelo. `ask` grava trace por revisionId, prova consulta questionId; o host não converte a chave. Hits não garantem prova. Hidratar sem avançar seq cria risco inferido de colisões entre requisições/Locations; falha não reproduzida nesta L3. [C § Diagnóstico e percurso de manutenção]

## Da autoria à leitura de conhecimento governado

Mineração/staging fornece candidatos; Genesis conserva bases/decisões. Aceite semântico, transformação e publicação permanecem separados. Prepare valida bytes, scope, fontes/inputs/deps e grava CAS/candidato. Dois juízes distintos vinculam candidato, contrato, critérios e result/input; publish refaz prepare e mudança exige novo binding. Check/atlas-emit mantém política, ator, ratificação e provenance. Admissão mecânica não pula essas portas. [G § Finalidade e compromissos separados; G § Da produção nativa à porta de consumo; G § Rotas históricas têm outra finalidade]

CAS precede projeção; gates participam do commit, que pode repetir. A porta busca um único carrier publicado compatível com scope/provenance antes de conferir ownership. Read exige orçamento positivo e key ou need exclusivos; section seleciona H2 único. Index verifica bytes sem devolver corpos. **Inferência:** falha de leitura pede conferir seleção publicada antes de concluir perda do objeto ou refazer autoria. [A § O percurso até uma leitura utilizável]

Atlas alcança surface/mine por boundary gerado e resolve modelos fora de Session. O ID do gateway não cria Session durável nem comprova hooks de Continuity. Retrieval monta contexto; Memory filtra por owner sem dar confidencialidade aos registros. **Inferência:** unir contexto e conhecimento exige conferir a porta; não há governança única demonstrada para toda chamada. [A § Fronteira externa e pontos de manutenção; A § O percurso até uma leitura utilizável]

## Mudança e falha seguem vínculos diferentes

Em Atlas, present divergente indica mudança; ausência exige corroboração; indisponibilidade conserva HOLD/incerteza. Members observa caminhos; file, conteúdo. O plano propaga dependências; rebuild reobserva e produz candidato. Prosa igual não garante autoridade/gaps/resultado iguais. Censo e hashes de transporte não substituem inputs vivos ou removem recusas do observador. [A § Como mudanças de fonte orientam a revisão; A § Por que texto igual pode exigir outro resultado; G § Cobertura não é uma lista indiscriminada de inputs]

**Manutenção inferida:** prosa igual pode ocultar autoridade Atlas alterada; pipelineHash novo pode não trocar parser RAG; máscara não altera histórico. Localize observador, transformação e consumidor antes de propagar reparo. Não há invalidação comum demonstrada.

| Sintoma | Paths de partida já documentados |
|---|---|
| Máscara ausente ou irrecuperável | `packages/core/src/session/runner/llm.ts`, `packages/core/src/session/compaction.ts`; `modules/continuity/src/v2/strategy.ts`, `masking.ts`, `archive.ts` |
| RAG perde prova ou mistura revisões | `packages/server/src/handlers/rag-studio-session.ts`; `packages/core/src/rag-studio/sql.ts`; `modules/rag-studio/src/context.ts`, `ask.ts`, `trace.ts`, `proof.ts` |
| Atlas muda ou não serve | `modules/atlas/packages/adapter-io/src/ownership-input.ts`, `ownership-rebuild.ts`, `ownership-access.ts`, `governed-emit.ts`; `modules/atlas/scripts/genesis-native.ts` |

[C § Diagnóstico e percurso de manutenção; C § Session define quais hooks existem; C § Mascaramento preserva uma cauda recuperável; A § Fronteira externa e pontos de manutenção; G § Manutenção e limites da explicação]

## Alcance da evidência e uso responsável

Payload 47eaa532 contém L2 aceitos; não identifica produto. A/G reportam CI de 7102f2e3, run 43077975153, limitado a um Worker/writer e falha controlada. G conserva release R2 de um L1A anterior, sem transferir binding a L2/L3. Isso não prova integração completa, concorrência universal ou recuperação geral. [A § Recibos e limites desta síntese; G § Ler recibos sem transportar autoridade entre revisões]

Redução estimada, bytes, reuso e chamadas lógicas não medem tokens, tentativas ocultas ou cobrança. Fila/retries históricos não garantem custo; não exposto fica UNKNOWN. Autenticação, instalação global, atomicidade e uso por modelo continuam lacunas. Sem aceite/publicação L3. [G § Uso, tentativas e economia honesta; C § Responsabilidades e base]
