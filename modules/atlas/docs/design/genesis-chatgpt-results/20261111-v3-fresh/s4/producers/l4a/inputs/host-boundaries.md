# Fronteiras do host: Session, RAG e Atlas

**Evidência estática sustentada, com limites.** Baseline `1cde2ff7a71bcf7aecb5d030917b577165135d38`; protocolo `ee2521a5b966bd505cc95bd1c733e09e12f33531`. Os 12 externos foram lidos e ligados a S4, sem ampliar seus 2.220 caminhos. Constatações descrevem código; inferências, suas consequências; prompts/comentários indicam intenção. Nenhuma integração, chamada de modelo, CI ou teste foi executado.

## Localizadores

Linhas inclusivas do baseline; `artifact-v2.json` e `source-provenance-v2.json` vinculam caminhos a commit, Git blob e SHA-256.

| Sigla | Caminho exato ou prefixo |
|---|---|
| S | `packages/core/src/session.ts` |
| C | `packages/core/src/session/compaction.ts` |
| L | `packages/core/src/session/runner/llm.ts` |
| I | `packages/core/src/session/runner/index.ts` |
| P | `packages/core/package.json` |
| D | `packages/core/src/rag-studio/sql.ts` |
| RS | `packages/server/src/handlers/rag-studio-session.ts` |
| RH | `packages/server/src/handlers/rag-studio.ts` |
| RP | `packages/protocol/src/groups/rag-studio.ts` |
| RT | `packages/schema/src/rag-studio.ts` |
| AH | `packages/server/src/handlers/atlas.ts` |
| AC | `packages/core/src/atlas.ts` |
| V/ | `modules/continuity/src/v2/` |
| R/ | `modules/rag-studio/src/` |
| A/ | `modules/atlas/packages/adapter-io/src/` |
| B/ | `modules/atlas/boundary/` |
| M | `modules/atlas/packages/cli/src/surface-mine.ts` |

## 1. Session → runner → compaction/Continuity

**Finalidade e admissão.** Registrar entrada, executar turno e construir contexto são operações distintas. `Session.prompt` aplica hooks, preserva identidade de pedidos repetidos, usa `SessionInput.admit` e pode disparar `resume` desacoplado; falha nesse disparo vai para log. Aceitar o prompt não prova conclusão. `compact` usa `execution.exclusive`, com `BusyError` sem exclusividade; a interface do runner declara drenagem de trabalho durável. [S:290–355,491–518,667–687; I:24–47]

**Sequência observada.** O runner verifica Location/workspace e governança antes de promover entradas, combina permissões e deriva ferramentas visíveis. No modelo normal, chama `compaction.transform`/`compactIfNeeded` antes do stream. Compactação pode provocar nova iteração; recuperação de overflow precede o início da mensagem e não se repete no turno de recuperação. Ferramentas publicam chamada antes do efeito; uso, custo e snapshot precedem `afterStep`. [L:185–272,289–357,449–564,588–642]

**Persistência e transformação.** `Session.messages` consulta `SessionMessageTable`; `events/history` leem eventos e `context` delega ao Store. A compactação publica `Compaction.Started/Ended`, com resumo e mensagens recentes; limita o resumo a 4.096 tokens e trunca resultados de ferramentas na serialização. A fidelidade pedida no prompt não é garantia. Projetor/Store não foram capturados: atomicidade completa e recuperação após crash não estão demonstradas. [S:435–489,749–764; C:17–60,108–179,197–275]

**Default:** `SessionCompaction.node` combina `make` (`compact`, `compactIfNeeded`, `compactAfterOverflow`) com `transform` que devolve `input.messages` e `afterStep` sem efeito. [C:277–329]

**Ligação com Continuity.** `V/index.ts:3–17` declara a substituição e ferramentas (exports P:340–357), sem demonstrar instalação global. Habilitada, a estratégia arquiva conteúdo antes de persistir máscaras e exige recall disponível para mascarar. A sumarização em segundo plano descarta resultado se o contexto mudou e limita falhas consecutivas. Os gatilhos dependem do modelo e da última entrada guardados pelos hooks. [V/strategy.ts:122–180,183–300]

O recall autoriza a ferramenta e chama `SessionHistory.loadAll` com a sessão do contexto; a API não recebe outra sessão. Distingue busca sem resultado, referência ausente e arquivo indisponível; pagina em UTF-16 com limite de bytes. O arquivo local usa `<data>/continuity/<sha256(sessionID)>`, índice, Markdown por hash e máscaras em `memory.json`. Exportação ao repositório é função separada, com opção `commit`, sem execução demonstrada. [V/tools.ts:22–55,77–152,154–219,248–286; V/archive.ts:76–177]

**Outros caminhos.** Engine hospedada recebe histórico sem `transform`/`compactIfNeeded`; `memory.archive` publica evento sintético. `afterStep` ocorre, mas seus pré-requisitos de estado não se estabelecem nesse caminho isoladamente: não comprova o arquivo recuperável de Continuity. `generate` não tem ferramentas, registro de mensagens ou esses hooks; `compact` manual resolve modelo e chama compactador. [L:231–272,358–383,427–448,559–564,684–717; I:33–39; V/strategy.ts:257–300]

**Manutenção:** alterar admissão/exclusão em S; ordem de governança, ferramentas e hooks em L; orçamento/serialização em C; retenção, recall e substituição em V. L:67–115 marca continuação pós-compactação como pendente; L:588–613 implementa o fluxo. O checklist não prova ausência.

## 2. HTTP RAG → Store por requisição → SQLite

**Contrato.** RP:9–155 declara rotas por Location para fontes, pipeline, revisões, busca, pergunta, provas, comparação e passes. RH:32–47 traduz só `Error("rejected")` em `InvalidRequest`. RT:48–70,178–182 fixa `lexical=true`/`embedding=false`, mas usa inteiros sem positividade para `k`/spans e aceita atualização como string ou número, sem validação por campo. `R/revision.ts:9–17` converte `k` com `Number(value)`: a borda não demonstra um domínio numérico seguro completo.

**Ciclo e dados.** RS:18–134 usa `location.directory` como `locationId`, carrega fontes, chunks, pipeline, revisões/membros, perguntas e traces do banco, relê os arquivos admitidos, reconstrói `memoryStore`, chama `noteBytes` e executa a operação em `withStore`. Depois, RS:139–275 apaga e reinsere o estado dessa Location. Fontes persistem caminho/hash/status, não texto integral; chunks persistem texto e offsets; revisões guardam hashes, membros e parâmetros; perguntas guardam span; traces guardam hits/dropped/k por `question_id`. Pipeline também conserva `blocked`. [D:6–81]

**Inferência:** até leituras HTTP podem marcar mudança e regravar tabelas. O adaptador não abre transação para carregar–operar–salvar; atomicidade/concorrência externas não foram demonstradas. SQLite identifica o destino da persistência, sem provar isolamento do ciclo.

**Admissão.** RH:55–63 chama `extract(payload.path)` antes de `admit`: usa `Bun.file` e `unpdf` para PDFs. Depois, o gate normaliza o caminho, recusa arquivos do projeto como `atlas` e exige permissão fora da Location. O servidor omite `allowExternal`, cujo padrão nega. O gate usa prefixos, sem resolver symlinks. Recusa de admissão não prova ausência de leitura prévia. [R/extract.ts:3–16; R/admit.ts:4–28; R/context.ts:17–44,150–183; RS:52–65]

Bytes novos mudam hash/status para `not_yet_read`; busca exclui fonte sem status `read` ou hash compatível. Mas falha de leitura em `noteBytes` mantém a linha: RS restaura texto vazio quando não há extração, conservando metadados antigos. **Inferência:** indisponibilidade do arquivo não vira automaticamente estado stale; chunks antigos ainda podem satisfazer os filtros de busca. Não tratar “nenhum resultado”, “fonte ausente” e “hash alterado” como o mesmo diagnóstico. [RS:77–99; R/reparse.ts:4–14; R/search.ts:4–26]

**Conflitos comprováveis na ligação.** `ask` grava trace com `revisionId`; `saveQuestion` cria outro ID e `retrievalProof` procura trace por `questionId`. O adaptador carrega/salva somente traces de perguntas persistidas: não converte a chave de `ask`, portanto esse trace não é conservado por esse caminho. Também reconstrói o Store com contador `seq=0` e o hidrata sem avançá-lo; `allocate` é usado por revisões/perguntas. **Inferência estática:** pedidos separados podem reutilizar `rev_1`/`q_1`, substituindo a entrada no Map; IDs são chaves primárias sem Location nas tabelas, trazendo também risco de colisão entre Locations. Nada disso foi reproduzido por execução. [R/ask.ts:9–29; R/trace.ts:3–6; R/proof.ts:4–25; R/context.ts:150–165,197–199,228–243; R/revision.ts:42–63; RS:22–51,100–130,239–275; D:34–70]

Persistir `members` não torna a busca histórica: `searchWords` filtra chunks/fontes atuais, sem consultar membros da revisão. **Manutenção:** alinhar identidade/trace em `ask/proof` e RS; alocação e transação em RS/Store/SQL; leitura autorizada antes de `extract`; schema, pipeline e snapshot. [R/search.ts:4–26; R/revision.ts:42–63]

## 3. Atlas host → pacote boundary → origens de domínio

**Entrada efetiva.** P:28,530 exporta o adaptador e depende de `@orchestra/atlas-boundary`. AH:19–37 obtém Location e abre Atlas na raiz escolhida por `storeRoot`; AC:103–147 usa o projeto salvo o caso `Project.isRoot`, envolve chamadas síncronas em `Effect.try` e traduz exceções em `Unavailable`. O handler mapeia isso a `ServiceUnavailable`. `territory` injeta o projectId do host. A origem de `openSurface` retorna `{state:"empty"}` quando falta `.atlas`, exceto `install`; ausência da loja é distinta de exceção. [A/surface/index.ts:136–159]

AC:5–34 importa `./surface` e `./mine`; B/package.json:23–29 exporta arquivos gerados. B/script/build.ts:16–19,29–81 mapeia entradas para `A/surface/index.ts` e M e oferece verificação `--check`. A falta de caller interno citada em A/surface/index.ts:3–6 não significa falta de caller no host. **Limite:** a ligação é com as origens declaradas; paridade dos bundles não foi estabelecida nem build executado.

**Modelos e autoridade.** AH:40–71 resolve catálogo, integração e credenciais fora de Session e cria chamadas diretas a `LLMClient`, recolhendo texto. O `sessionID` usado no gateway é descritivo; esse código não cria uma Session durável. Não há fundamento para atribuir a essas chamadas os hooks/permissões/arquivo de Continuity do runner. AC:248–279 solicita rascunhos e grava `answer` com `drafted:{model,why}`; A/review-answer.ts:61–86 impede que esse caso crie proposta. A proposta de tier de uma resposta humana ainda precisa de decisão; o caminho de decisão reemite pelo runtime. [A/surface/review.ts:134–174]

A origem resolve o ator por `ATLAS_ACTOR` ou git user.email e o chama de declaração, não autenticação. Territórios exigem token de ratificador e um ratificador específico para T0; a resposta manda comprometer o catálogo. Essas regras de domínio não demonstram autenticação HTTP. O middleware global, a instalação das rotas e a resolução de Location não foram capturados; não se conclui nem acesso anônimo nem autorização completa. [A/surface/review.ts:200–254; AH:19–37,73–114]

**Mineração e setup.** AC:318–341 lista sites, chama o modelo com concorrência 4 e passa respostas por chave ao segundo passe; falha de uma chamada omite a resposta. M:1–7,43–86 usa o passe `advisory`, histórico de HEAD e admissão de resposta; o contrato de origem é staging, sem promoção automática. Como há dois passes em torno das chamadas assíncronas, não se deduz uma fotografia imutável entre eles. Indexação em AC:152–196 escolhe plano TypeScript/Python, resolve binário, executa processo com timeout e consulta saúde depois; é uma capacidade do host observada no código, não prova de dependência instalada ou índice produzido.

**Manutenção:** AH para rotas/modelos; AC para raiz, falhas e processos; origens Atlas para revisão/mineração; B para empacotamento. A unidade sustenta essas ligações estáticas, preservando lacunas de composição, atomicidade, autenticação e paridade. Aceite independente e vinculação em runtime permanecem pendentes; este corpo não confere autoridade para publicar ou ratificar.
