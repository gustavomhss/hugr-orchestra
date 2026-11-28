# Operar e manter Continuity e RAG

## Propósito e alcance

Continuity reduz o pedido ao modelo preservando recuperação do contexto; RAG Studio diagnostica trechos de documentos admitidos e suas provas. Recuperar conversa não produz prova documental; `sent` no RAG não demonstra uso por modelo. Esta L2 deriva de duas L1 aceitas no commit `8a041ca66982dcc2b89aaed46ebe347cb3de57db`. “Observado” significa inspeção estática do baseline, sem execução nesta L2. [CR-C; CR-R]

## Continuity depende do caminho da sessão

O default de `SessionCompaction.node` oferece compactação, com `transform` que devolve as mensagens e `afterStep` sem efeito. Continuity declara substituição e ferramentas por Location, sem comprovar instalação global. O primeiro diagnóstico é identificar contribuição ativa e caminho do runner. [HB-S]

No runner normal, governança/ferramentas precedem `transform`/`compactIfNeeded` e o stream; uso/custo/snapshot precedem `afterStep`. O estado de Continuity é por Session dentro da Location. A sumarização de fundo usa o orçamento do modelo e revalida o contexto antes de publicar: mudança descarta o resumo; três falhas consecutivas suspendem novas tentativas. O pedido manual aguarda o próximo check; compactação central antecede máscara forçada. Admissão do pedido, início do resumo e conclusão do turno são marcos diferentes. [CR-C; HB-S]

A execução hospedada não passa por `transform`/`compactIfNeeded`; seu `afterStep` isolado não estabelece o estado do arquivo recuperável. `generate` não tem esses hooks, ferramentas ou registro de mensagens. **Inferência:** uma mudança em `modules/continuity/src/v2/strategy.ts` não garante efeito igual nesses caminhos. Investigar `packages/core/src/session/runner/llm.ts` e `packages/core/src/session/compaction.ts` antes de atribuir falha ao arquivo. [HB-S]

## Redução recuperável exige arquivo, permissão e contexto

Máscaras alteram cópias do pedido, preservando histórico. Exigem `context_recall` materializado e arquivo gravado antes da máscara; esta remete ao primeiro chunk, sem representar necessariamente o resultado inteiro. Resultados executados pelo provedor e ferramentas protegidas são excluídos; anexos ficam como nomes, sem payload binário. Mudar seleção, mensagem ou formato do arquivo em `modules/continuity/src/v2/masking.ts`, `strategy.ts` e `archive.ts` afeta economia e recuperação juntas. [CR-C]

O arquivo local guarda índice, Markdown por hash e `memory.json` em `<data>/continuity/<sha256(sessionID)>`; lê conferindo hash/tamanho. Temporário, flush/rename e mutex no processo não demonstram atomicidade de toda a Session. Falha ao carregar máscaras vira conjunto vazio com aviso e `loaded` definido, sem retentativa automática. Histórico existente, máscara carregada e arquivo disponível são verificações distintas. [CR-C; HB-S]

Recall exige permissão por Session/agente/mensagem/chamada; conteúdo é dado histórico. Lista/busca são locais e lexicais; só referência direta alcança arquivo de outra sessão do mesmo seat no repositório. Referência transforma erro em `missing`; lista/busca podem informar indisponibilidade. Falta de match não prova perda. [CR-C]

Na exportação, `commit` emite blobs, sem executar commit Git; eventos precedem blobs, logo não provam disponibilidade. Scrubbing cobre famílias limitadas de credenciais; a ligação visibilidade/exportação, retenção/remoção e descarte do estado permanecem desconhecidas. Preservar esses limites ao mudar `modules/continuity/src/v2/archive.ts` e `tools.ts`. [CR-C; CR-M]

## RAG atravessa extração, Store e persistência por requisição

O contrato pretende diagnóstico, sem resposta de modelo; embedding está desligado. O Store abstrato da L1 de domínio ganha fronteira concreta na L1 de host: `packages/server/src/handlers/rag-studio-session.ts` carrega tabelas, relê arquivos, hidrata `memoryStore`, chama `noteBytes` e a operação em `withStore`, depois apaga/reinsere estado da Location. `packages/core/src/rag-studio/sql.ts` guarda metadados de fontes, chunks com texto/offsets, revisões, perguntas e traces, sem texto integral da fonte. **Inferência:** até leitura HTTP pode regravar estado; não há transação demonstrada para todo o ciclo. [CR-R; HB-R]

Na admissão HTTP, `extract(payload.path)` lê antes de `admit`. O servidor omite `allowExternal`, cujo default nega; prefixos não resolvem symlinks. Recusa de admissão não prova ausência de leitura. A fronteira de autorização envolve `packages/server/src/handlers/rag-studio.ts`, o adaptador de sessão e `modules/rag-studio/src/admit.ts`/`extract.ts`. [HB-R]

O ID depende de Location/caminho; mudar conteúdo mantém o ID e torna a fonte não lida. `noteBytes` detecta sem recortar; reparse atualiza texto/hash/status; rechunk exige reparse compatível e substitui chunks. Só `line` divide por linhas; outras boundaries usam documento inteiro. Spans são UTF-16. PDF fornece texto, sem identidade dos bytes brutos; página vazia pode gerar `no_text_layer`. Extração/hash/corte afetam status, revisão, busca e prova. Busca faz substring sensível a caixa; `ask` retém os primeiros K e distingue fonte ausente/não lida, hit ausente, descartado ou retido, sem chamar modelo. [CR-R]

## Diagnóstico deve seguir a identidade que cada porta usa

| Sintoma ou pergunta | Distinção decisiva e ponto de manutenção |
|---|---|
| Fonte mudou, mas os trechos parecem antigos | Mudança legível marca `not_yet_read`; falha de leitura pode conservar metadados antigos e chunks elegíveis. É risco inferido, não falha reproduzida. Ver `modules/rag-studio/src/reparse.ts`, `search.ts` e o adaptador de sessão. |
| Pergunta tem hits, mas não há prova recuperável | `ask` grava trace por revisionId; prova consulta questionId. O host salva/carrega somente traces de perguntas, sem converter essa chave. Alinhar `ask.ts`, `trace.ts`, `proof.ts` e persistência, não preencher um trace presumido. |
| Revisão ou pergunta parece substituída | O Store recomeça `seq=0`; hidratar não o avança. A inferência é reutilização de IDs entre pedidos e possível colisão entre Locations, pois as chaves SQL não incluem Location. Examinar `context.ts`, adaptador e SQL juntos. |
| Revisão antiga mudou de resultado | Membros/hashes da revisão são metadados; busca usa fontes/chunks atuais. Não há replay histórico demonstrado. `search.ts`, `revision.ts` e `compare.ts` precisam manter explícito qual corpus está sendo comparado. |

Na tabela, arquivos curtos usam `modules/rag-studio/src/`; adaptador/SQL são os paths acima. [CR-R; HB-R]

## Percurso de mudança e limites de sustentação

Localizar a fronteira alterada e rastrear sua identidade até os consumidores. No RAG, span/K/corte alcançam schema, revisão, seleção e provas; strings de parser/tokenizer não selecionam outras implementações. Passes são explícitos, um por vez: reparse não implica rechunk; remover fonte não limpa automaticamente seus chunks. [CR-R; HB-R]

Controles citados nas L1 não foram executados aqui; traces manuais de fixtures não fecham ask/save/proof. Permanecem lacunas de transação/concorrência, validação numérica, autorização/canonicalização, fidelidade do resumo, retenção e composição dos hooks. Intenção documental e inspeção estática não comprovam execução. [CR-M; HB-S; HB-R]

## Localizadores dos predecessores

CR = `S4:L1:continuity-rag`: CR-C, seção “Continuity: recoverable request reduction around the Session core”; CR-R, “RAG Studio: admitted-document diagnostics, with embedding off”; CR-M, “Maintenance impact and evidence limits”. HB = `S4:L1:host-boundaries`: HB-S, “1. Session → runner → compaction/Continuity”; HB-R, “2. HTTP RAG → Store por requisição → SQLite”. Os paths de manutenção acima são conhecimento transmitido por essas L1; nenhuma fonte bruta foi reaberta.
