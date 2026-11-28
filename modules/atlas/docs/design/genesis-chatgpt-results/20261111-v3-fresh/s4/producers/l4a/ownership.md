# Ownership S4: manter contratos e localizar impacto

Scope: `atlas-continuity-rag-genesis`. Mantenha conhecimento e contexto recuperável. Base aceita: L=`S4:L3:system-flows`, A=`S4:L2:atlas-system`, C=`S4:L2:continuity-rag-operations`, B=`S4:L1:host-boundaries`, N=`S4:L1:native-runtime-delta`. M=`modules/continuity/src/masking-rules.ts`.

## Delimite a mudança antes de agir

Identifique comportamento, estado, origem e dono. Sob autorização, revise corpos/receitas/vínculos e origens próprias em `modules/atlas`, `modules/continuity` e `modules/rag-studio`. `packages/core`, `packages/server`, protocolo/schema são fronteiras: documente o contrato para o dono, sem propor correção aqui. Gerados seguem origem/gerador. [A § Fronteira externa e pontos de manutenção]

## Atlas separa identidade, autoridade e atualidade

Corpo conserva octetos. Resultado inclui corpo, autoridade, validade, gaps e evidência. Receipt liga contrato, inputs, resultados dos predecessores e reviews; manifest seleciona o scope. Prosa igual pode ter resultado diferente. SHA-256 de transporte, Git blob e versão de input do kernel não são intercambiáveis. Endereço estável não prova bytes atuais; FRESH não implica HOLDS; tier não autentica ratificador. [A § Por que texto igual pode exigir outro resultado; A § Responsabilidades do motor e do host]

Observe: present(version) divergente indica mudança; ausência exige corroboração; indisponibilidade preserva HOLD/incerteza. Stale é comparação, não quarto estado do observador. `members:` observa caminhos; conteúdo exige `file:` relevante. Falha de Git, recusa ou leitura incompleta não provam remoção ou impacto nulo. [A § Como mudanças de fonte orientam a revisão]

CAS não publica. O accessor exige carrier publicado único compatível com scope/provenance. `prepare` gera candidato; `publish` refaz preparação, exige binding dos dois juízes distintos ao candidato/contrato/critérios/result/input e passa por `check`/`atlas-emit`. Política, ator e ratificação continuam gates. ATLAS_ACTOR/ATLAS_RATIFY_TOKEN são declarações locais, sem autenticação demonstrada. Recuse autoridade de fixture, PASS inferido, approval antigo para candidato novo e promoção de blocked. [A § O percurso até uma leitura utilizável; N § Binding separado e publicação governada]

## Propague pelo resultado e preserve o passado

Mude receita/input com fontes/deps reais, captura/reobservação e ordem afetada. Rebuild avalia/relê o candidato, sem ativar. **Inferência contratual:** resultado completo validado e igual pode parar reinterpretação em key/result se vínculos do dependente seguem válidos; preserve receipts/bindings afetados e gates. Navegação é consulta; unidades independentes preservam resultados/receipts, observando fontes compartilhadas. [L § Mudanças propagam por resultados e vínculos]

Leia seleção corrente primeiro. HOLD não prova perda do CAS; `historical:true` inspeciona passado, sem atualizar inputs antigos. Retome candidato/resultados duráveis com inputs/bindings atuais; correção tem identidade nova e preserva recibos antigos. Retornar à publicação anterior exige scope/seleção/inputs/contrato e gates compatíveis; sem autorização automática ou proibição cronológica universal. Isso não prova recuperação/concorrência universais. [L § Após falha, separar recuperação de nova publicação]

## Host e Session têm portas diferentes

Atlas entra por `packages/server/src/handlers/atlas.ts` → `packages/core/src/atlas.ts` → boundary gerado. Modelos são chamados fora de Session; ID do gateway não cria Session durável nem herda hooks/permissões/arquivo de Continuity. Rascunho de modelo não cria proposta; staging não é ratificação. Localize as origens em `modules/atlas/packages/adapter-io/src/surface/index.ts` e `modules/atlas/packages/cli/src/surface-mine.ts`; o gerador é `modules/atlas/boundary/script/build.ts`. Exportação não prova composição, autenticação ou paridade. [B § 3. Atlas host → pacote boundary → origens de domínio]

O default SessionCompaction.node oferece compactação, transform identidade e afterStep sem efeito. Continuity declara substituição/ferramentas por Location; não prova instalação global. Runner normal faz governança/ferramentas → transformação/compactação/stream → uso/custo/snapshot → afterStep. Hospedado omite transform/compactIfNeeded; generate omite hooks/registro. Confira a entrada antes de atribuir efeitos. [C § Session define quais hooks existem]

## Continuity reduz o pedido e conserva recuperação

Antes de mascarar, confirme context_recall materializado e economia estimada. Arquive candidato antes da máscara; persista máscaras depois. Elas alteram cópias do pedido, não o histórico. Normalmente preserve os últimos cinco passos do assistente; urgência não pode ocultar a mensagem mais recente. Resultados executados pelo provedor e ferramentas protegidas ficam fora. Erros preservam 20 primeiras linhas; curtos ficam integrais. [C § Mascaramento preserva uma cauda recuperável; M:TAIL_STEPS/ERROR_LINES]

M protege: `skill`, `todowrite`, `todoread`, `context_recall`, `task`, `maestro_request_review`. Preserve a proteção. Stub aponta ao primeiro chunk; anexos ficam como nomes, sem seus binários. Índice, Markdown por hash e memory.json ficam em `<data>/continuity/<sha256(sessionID)>`. Hash/tamanho são conferidos; flush/rename/mutex não provam atomicidade da Session. Falha de carga deixa máscaras vazias e loaded definido, sem retentativa: não conclua que o arquivo recuperável está vazio. [M:PROTECTED; C § Mascaramento preserva uma cauda recuperável]

Recall exige permissão, busca/lista são locais/lexicais e referência pode alcançar outra sessão do mesmo seat. Missing não equivale a “sem match”. Mantenha `modules/continuity/src/v2/strategy.ts`, `masking.ts`, `archive.ts` e `tools.ts`. [C § Mascaramento preserva uma cauda recuperável]

## RAG separa fonte, chunk, revisão e prova

O host carrega SQL/arquivos, hidrata Store, opera e regrava a Location. Fontes persistem caminho/hash/status, sem texto integral da fonte; chunks persistem texto/offsets. noteBytes marca not_yet_read quando detecta conteúdo legível alterado; não recorta. Falha de leitura mantém a linha e pode conservar metadados/chunks antigos: não equivale a essa transição. Reparse atualiza texto/hash/status; rechunk exige reparse compatível; remover fonte não limpa chunks. Leitura HTTP pode regravar estado, sem atomicidade do ciclo demonstrada. [B § 2. HTTP RAG → Store por requisição → SQLite]

setPipeline coage sem validar campo/valor; strings parser/tokenizer mudam identidade, sem outra implementação inspecionada. Revisão grava parâmetros, fill e membros/contentHash; snapshot não congela texto. Busca usa fontes/chunks atuais. Comparar exige duas revisões, proofSetId igual aos dois snapshots e exatamente um campo entre parser/boundary/tokenizer/K diferente; não executa passes nem iguala snapshots. Ela considera todas as perguntas do Store; calcula alteração de span/texto só com boundary alterada e chunk marcado com a boundary direita. Flags falsos não provam equivalência para K/parser/tokenizer, replay histórico ou uso por modelo. [C § Pipeline e revisão têm identidades distintas; C § Comparação exige uma mudança isolada]

Ask busca substring sensível a caixa e retém K sem modelo. Trace usa revisionId; prova procura questionId; o host não converte a chave. Hidratação não avança seq: risco inferido de colisão entre pedidos/Locations. Extração precede admissão; allowExternal omitido nega, mas recusa não prova ausência de leitura prévia nem prefixo resolve symlink. Preserve os gaps; trace manual em fixture não prova integração. [C § Diagnóstico e percurso de manutenção; B § 2. HTTP RAG → Store por requisição → SQLite]

## Localize a implementação e feche com evidência

| Impacto | Origem |
|---|---|
| Identidade/ownership | `modules/atlas/packages/kernel/src/canonical.ts`; `modules/atlas/packages/knowledge/src/ownership/shape.ts` |
| Inputs/rebuild/consumo | Em `modules/atlas/packages/adapter-io/src/`: `ownership-input.ts`, `ownership-rebuild.ts`, `ownership-access.ts`, `governed-emit.ts` |
| RAG | Em `modules/rag-studio/src/`: `context.ts`, `revision.ts`, `compare.ts`, `ask.ts`, `trace.ts`, `proof.ts`, `admit.ts`, `extract.ts` |

Retrieval ativo usa `modules/atlas/packages/adapter-io/src/retrieval-model.ts`; alterar só o pack de referência pode não mudar o comando. Memory filtra injeção por owner, sem confidencialidade dos registros em texto. [A § O percurso até uma leitura utilizável; A § Fronteira externa e pontos de manutenção]

Fronteiras para o dono externo: em `packages/core/src/session/`, `compaction.ts` e `runner/llm.ts`; `packages/server/src/handlers/rag-studio-session.ts` e `packages/core/src/rag-studio/sql.ts`. [C § Diagnóstico e percurso de manutenção; B § Localizadores]

Fixe release/código/payload/scope e recibos; não transplante R2. `modules/atlas/scripts/genesis-native.ts` serve index/read; exit 2 é HOLD/recusa, 1 erro, 0 de prepare só preparação. Outro L4 é consulta. Sem execução aqui ou aceite/binding/publicação/consumidor L4; modelo/tokens/cobrança não expostos são UNKNOWN. [N § Consumo e manutenção pela porta real; L § Manutenção e alcance da evidência]
