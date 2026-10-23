# Review de fidelidade: mock × Atlas real

> **Status (2026-10-22):** V1 — pendente no V2 (ver ORC-001 em `ORCHESTRA-INTEGRATION-ISSUES.md`). As afirmações marcadas abaixo descrevem o V1. Decisão do owner: o Maestro passa a ler o Atlas por `atlas_context` (`catalog` e `unit`), sem `anchor`; `atlas_memory_*` continua só com os seats. O texto original foi mantido como histórico.

2026-10-18 · base `dev` @ `6ea9383245` · mock v3 (commit `2ce0cb8f03`).

Dois revisores independentes compararam cada afirmação do mock com o código do Atlas e do Orchestra. Os achados mais graves foram reconferidos no código. Caminhos relativos a `modules/atlas/packages/` (Atlas) ou `packages/orchestra/src/` (Orchestra).

Os achados se dividem em dois tipos:

- **A — Mecânica errada:** o mock descreve algo que o Atlas faz de outro jeito. Corrigir.
- **B — Capacidade que não existe:** o mock desenha uma ação que o Atlas ou o Orchestra não tem. Ou ela vira requisito novo, marcado na tela, ou sai.

---

## A — Mecânica errada (corrigir)

### Alta

1. **O pack não é "exatamente o que o agente recebe".**
   - No Orchestra, o agente puxa um **snapshot Own comitado** (`OWN-SNAPSHOT.json`) com `atlas_context unit` (`maestro/atlas-source.ts:77-84`). Nada é empurrado ao entrar na unidade.
   - O snapshot não exporta pack com fato não-FRESH (`retrieval/src/own-snapshot.ts:197-205`), e o host trava (`artifacts-invalid`) se a fonte mudou.
   - Promover, ratificar, editar ou aposentar só chega ao agente depois de rematerializar o snapshot.
   - **Correção:** rotular como "o que `atlas own` compõe agora" e mostrar a revisão e o estado do snapshot.
2. **Orçamento do pack errado.**
   - O custo é em **caracteres** (`adapter-io/src/own-bands.ts:70`). O teto é **1500 para o briefing inteiro** e o sub-teto advisory é 750 (`retrieval/src/own.ts:56,78`).
   - A ordem é governante, depois gotchas, depois ponteiros, e o advisory por último. O preenchimento **para no primeiro fato que não cabe**, e a ordenação é tier e depois nodeKey.
   - O mock contava ~4× mais e ordenava por frescor.
3. **Drift de âncora de arquivo inteiro é semântico.**
   - O conteúdo antigo do arquivo não existe mais em lugar nenhum, então todos os 63 são **semânticos**: `reconcile` sai com código 2 e bloqueia o merge, e `doctor reground` propõe **aposentar** (`adapter-io/src/doctor-source.ts:101-124, 257-263`).
   - Reemitir a mesma afirmação é deduplicado e o fato continua com drift.
   - **Correção:** "semântico, bloqueia merge" e as ações *reescrever* (draft e emit com âncora nova) ou *aposentar*. O "Ainda vale" sai.
4. **Classificar cria outro fato.** O slot faz parte do nodeKey (`knowledge/src/write/router.ts:355-361`). Um slot novo gera um nó novo, o antigo continua servido, e a escrita exige que o fato esteja FRESH.
5. **Aposentar não tira o fato da leitura.** É um emit com `authoring: SUPERSEDED`, mas nenhum caminho de leitura filtra isso. **Correção:** "marcado como substituído; continua servido".
6. **Decaimento da memória de projeto.**
   - Toda regra entra com frecency 1. A "idade" é o número de registros gravados depois dela no `memory.jsonl` **por qualquer membro** (`adapter-io/src/memory-read.ts:142-163`). Abaixo de 0,1 a regra sai, ou seja, depois de 4 registros.
   - Não existe ledger de uso, e reenviar a mesma regra não a renova.
7. **Consciência no modo Ilustrado.** Só `taste` (de `CONVENTIONS.md`) e `constitution` (dos fatos T0) têm fonte. `mission`, `terrain` e `ontology` **estão sempre sem semente** (`adapter-io/src/awareness-store.ts:23-26`).
8. **"Privado do membro" é falso.** MEM-1 é escopo de injeção, não controle de acesso. Quem lê o repositório lê toda a memória de todos (`docs/reference/atlas-memory.md:121,140`).

### Média

9. **Editar acrescenta, não substitui.** Um UPDATE advisory no mesmo tier soma a nova afirmação ao conjunto (`knowledge/src/write/upsert.ts:332-336`). Se a afirmação citar outros símbolos, a âncora muda e nasce um nó novo.
10. **Ratificar.**
    - T1 pede qualquer `ATLAS_RATIFY_TOKEN` não vazio; T0 pede o literal `billy` (`knowledge/src/ratify/ratify.ts:142-144`). É um nome, não uma credencial.
    - Subir o tier **substitui** as afirmações.
    - O nó não guarda quem ratificou, então "Ratificado por Maestro / por você" não tem fonte.
11. **Dependentes são fatos, não arquivos.** As linhas `dependent` do `own` são nodeKeys de fatos no fecho reverso do SCIP, com no máximo 8, e sem `index.scip` não existe nenhuma (`adapter-io/src/own-source.ts:185-210`).
12. **Falta a banda de gotchas.** Fatos T1 ou acima com slot `gotcha` ou `rationale` vão numa seção própria (`adapter-io/src/own-bands.ts:44-81`).
13. **Unidades e níveis.**
    - `OwnLevel` é só `crate | module | service | feature`. "folder" e "repo" não existem.
    - O dono do pack vem do `policy.json` e o tier é o mais estrito arquivado, não o do território.
    - No Orchestra, as unidades são as do snapshot.
14. **Palavras-chave T0.** São fixas no código (`auth, payments, secrets, kms, crypto, billing`, em `knowledge/src/ratify/tier.ts:31`), casam com **segmentos de caminho de território** e não fazem parte da política de escrita.
15. **Minerar.**
    - O escopo é ignorado: minera o repositório inteiro.
    - Os braços são os três juntos, ou exatamente um via `ATLAS_MINE_SLOT`.
    - `symbol` **adiciona** sites, não substitui.
    - O orçamento é **por braço** (até 600 sites no padrão).
    - O custo de US$ 0,10 por site não tem fonte.
16. **Cabeçalho injetado.**
    - O formato real é `<atlas-header member rules rule-words>`, com `- mission: unseeded`, `none recorded` e `- [scope] rule` (`maestro/atlas-header.ts:38-58`).
    - Ele vai em **toda requisição ao provedor**, não "por turno".
17. **Memory log.**
    - É um registro por checkpoint, agrupado por `taskId`. A sessão (`task_id`) é proveniência.
    - Recusas não ficam no `memory.jsonl`: só existem nos recibos da sessão.
    - O status (Concluída / Pausada / Bloqueada) é inferência da interface, não algo do Atlas.
    - "O que volta no resume" é o último recibo admitido **naquela sessão**. Sem recibo, o Atlas escolhe o registro único ou recusa (`ambiguous`).
18. **Compactação.** No run D, uma compactação automática aplicou e tirou o fold da visão do agente. O restore está ligado no código (`7dba2cbc3c`, `session/prompt.ts:1225`), mas nunca foi observado ao vivo.
19. **PR memory.** `knowledgeDelta` precisa ser `object[]` (as strings do mock seriam recusadas com `template-invalid`). Nada no Orchestra produz PR memory, e o logbook só existe para o Maestro, que não está ligado.
20. **Chat.** Os recibos mostrados são inventados: os runs reais não chamaram `atlas_context`, o recibo não tem contagem de tokens nem campo "scanned", e não existe `@atlas` no composer.

### Baixa

- **link sameAs:** os dois nós continuam (não são "respondidos como um só"), a autorização vale para a classe inteira, e um par retratado não pode ser religado.
- **Portões:** a ordem real é truth, authz, âncora, incumbente e ratify. Não existe "shape primeiro". O braço advisory do mine não tem portão de verdade.
- **"Inside":** o limite é 16 escopos (`FINER_CAP`).
- **Scanner de segredos:** gitleaks pinado, com fallback para gitleaks ou trufflehog no PATH. Sem scanner, a gravação é recusada com `scanner-unavailable`.
- **Histórico:** datas, "quatro passadas" e "promovido como Maestro" são inferidos. O ator da política é `seat:orchestrator`.
- **"Versionada com o repositório":** só se o projeto rastreia `.atlas/memory.jsonl`. O Orchestra não comita.
- **Export:** grava só o CAS. O import só funciona num store vazio.
- **Código morto:** `views-more.js:80-113` foi sobrescrito por `views-memory.js`. Apagar.

---

## B — Capacidade que não existe (decisão do owner)

| # | No mock | No Atlas / Orchestra hoje |
|---|---|---|
| B1 | Memória de projeto com **Proposals → Index** e "Add rule" pelo steward | O próprio membro grava a regra (`atlas_memory_emit` kind `project`) e ela é admitida na hora. Não existe proposta nem aprovação. A ferramenta só roda para o membro dono. |
| B2 | **Arquivar / Restaurar** regra | A saída do cabeçalho é calculada na leitura. Não existe ação. |
| B3 | **Promover candidato por linha** e "Deixar no staging" | `atlas promote` não recebe argumentos e assenta **todo** o staging. O staging não tem marca nem remoção. |
| B4 | **Fila de propostas de ratificação** (proposto por Lucy ou Archie, rejeitar) | Não existe `proposedTier` nem rejeição no Atlas. |
| B5 | **Declarar território** pela interface | O catálogo é um JSON comitado e editado à mão, sem porta de escrita. |
| B6 | **"Respawnar com esta memória"** como botão | Só o Maestro chama `task` com `memoryUnit`. O replay de transcript (`@atlas/persist`) não está ligado. |
| B7 | Mostrar **quem ratificou** | O nó não guarda o ratificador. |

**Decisão do owner (2026-10-18):** corrigir o grupo A; manter B1, B3, B4, B5 e B6 marcados como capacidade nova, e somar R6 (aposentar tira da leitura) e R7 (reconstruir o snapshot). Ver [`REQUIREMENTS.md`](REQUIREMENTS.md). B2 virou lista só de leitura; B7 saiu.

**Recomendação original:** corrigir todo o grupo A agora. No grupo B, manter só o que você quer como produto (B1, B3 e B6 parecem centrais), marcando na tela "requer capacidade nova", e registrar cada um como requisito para o Atlas ou o Orchestra. O que você não quiser sai do mock.

---

## Segunda rodada (2026-10-18, adversarial)

Três revisores sem contexto compararam o mock já corrigido (`2d48ef2f4f`) com o código: um conferiu a regressão de cada item A, outro caçou conflitos em todas as telas e o terceiro listou o que o Atlas guarda ou faz e a interface omite. Os achados graves foram reconferidos no código antes de corrigir.

### Onde este review errou

- **A14 (palavras T0):** o `atlas init` não usa `T0_KEYWORDS` de `tier.ts`. Ele usa `policy.json` `t0Heuristic.keywords` como **substring do nome** do território (`adapter-io/src/compose.ts:97`). Neste store as palavras são `invariant` e `security-property`.
- **A2 (orçamento):** "para no primeiro que não cabe" vale só para o advisory. Governantes e gotchas são gulosos. E faltava a seção de **ponteiros** (até 12 `own_<folha>`, custo = tamanho do nome) entre gotchas e advisory (`retrieval/src/own.ts:190-199`).
- **Portões (baixa):** existe `shape` como portão 0. A cadeia é shape → truth → authz → ratify (`adapter-io/src/governed-emit-gates.ts:72`); âncora e incumbente são subpassos do authz.
- **A6 (renovar regra):** reenviar a regra **idêntica** é deduplicado. Regravá-la com outro escopo é um registro novo e a renova.

### Corrigido no mock

| Achado | Verdade | Fonte |
|---|---|---|
| "O conhecimento não está no git" | O repo standalone do Atlas comita a projection e 1.320 objetos do CAS. O store fica `tracked-provable`: a leitura serve só fatos selados que se reprovam (0 de 596) e toda escrita é recusada. | `adapter-io/src/store-provenance.ts`, `read-access.ts`; commit `2211f3046` |
| Snapshot Own "reconstruído do store" | O snapshot é um JSON revisado; a unidade `packages/genesis` é um fixture (dono `atlas-foundation`, 1 invariante T1 que o store não tem). O host valida `sourceBlobs` byte a byte. | `scripts/materialize-own-snapshot.mjs`, `OWN-SNAPSHOT.json`, `orch/maestro/atlas-source.ts:89-128` |
| "Reescrever deixa o fato fresco com a afirmação nova" | No mesmo tier as afirmações se unem; a antiga continua servida. Virou **R8**. | `knowledge/src/write/upsert.ts:332-336` |
| Consciência com o texto do `CONVENTIONS.md` e dos T0 | Só a linha de topo entra: `taste: CONVENTIONS.md@sha`, `constitution: N ratified T0 invariant(s)`. No Orchestra as cinco facetas saem `unseeded` (a raiz do worktree não tem fonte). | `memory/src/awareness.ts:117`, `adapter-io/src/awareness-store.ts:69,96` |
| Frecency ilustrada (várias regras em 1,0) | A idade é a posição no log inteiro: só o registro mais novo vale 1, e o repositório carrega no máximo 4 regras. Uma regra não guarda a task de origem. | `adapter-io/src/memory-read.ts:139-181`, `memory/src/types.ts:56-60` |
| Dono do pack "seat:orchestrator" | `terrainOwner` pega o escopo de política que cobre o caminho; `atlas:mined` não cobre nenhum, então o dono é vazio. | `adapter-io/src/own-source.ts:154-160` |
| Dependentes diretos, ordenados por tier | Fecho reverso transitivo, semeado pelas âncoras dos fatos do escopo, ordem de nodeKey. | `adapter-io/src/own-source.ts:183-209` |
| `finer` por contagem de fatos | Todos os filhos, em ordem de nome. | `adapter-io/src/own-source.ts:324-329` |
| Classificar herda o tier | Um draft começa sempre em T2. | `tools/src/draft.ts` (`DRAFT_TIER`) |
| "Bloqueia o merge" em todo drift | `reconcile <base>` só olha âncoras mudadas entre a base e o HEAD. Drift advisory deveria virar STALE (não bloqueia), mas esse roteamento não existe. | `adapter-io/src/git-drift.ts`, `contracts/src/status.ts:6-8` |
| Promote "recontou os 596" | Os 63 com drift são recusados `ungrounded`; os demais são deduplicados. | `adapter-io/src/governed-emit.ts:198-202` |
| Tasks do Jimmy com `bash`/`atlas mine`, Archie com `maestro_catalog_context` | Jimmy tem perfil de revisão (read, glob, grep, memória); Archie usa `atlas_context`. | `orch/maestro/roster.ts:50-120` |
| `builtAt` = "índice construído em" | É o HEAD carimbado ao publicar a geração. | `adapter-io/src/freshness-watermark.ts:10` |
| Modo ilustrado sem marca na tela | Banner em toda tela do Atlas e marca `example` por item. | |
| Configuração `"directory": ".atlas"` no HOLD | O diretório guarda o snapshot e o catálogo (ex.: `modules/atlas`); sem catálogo comitado o host ainda pararia. | `orch/maestro/atlas-source.ts:77-80` |
| Outros | Cabeçalho real exibido por membro; "Pinned by plans" na unidade; política com `t0Heuristic` e sem `authz.anchors`; `doctor cas` e `verify-store` separados; obviedade marcada "não calculada" (o predicado é fixo em `false`). | |

### Lacunas que ficam para a próxima iteração

Coisas reais que um steward usaria e o mock ainda não mostra. Nenhuma contradiz o que está na tela.

| Lacuna | Onde caberia | Fonte |
|---|---|---|
| Resultado do promote por linha, com motivo de recusa (`unratified`, `ungrounded`, `unauthorized`, `contended`) e a previsão de portões do `check` | Curadoria › Candidatos | `docs/reference/commands/promote.md`, `check` |
| Linhagem de substituição (`supersededBy`) e o arquivo (`doctor archive`, `node`) | Detalhe do fato › Proveniência; Histórico › Arquivo | `knowledge/src/write/router.ts:46` |
| Classe do drift por fato (`doctor why`: mecânico/semântico) e "aceitar reground" para o mecânico, que aparece com âncoras de símbolo | Curadoria › Drifted | `docs/reference/commands/doctor.md` |
| Selo (`proven`/`justified`), testemunha e "reverificar" | Detalhe do fato | `verify-fact`, `verify-store` |
| Última execução do genesis: cobertura (semeado, abstido, não visitado), custo, token de retomada | Curadoria › Minerar | `genesis/src/coverage.ts:103-166` |
| Famílias além de advisory (relações, negações e abstenções, transições, testes vazios) e `derive-relations` | Página da unidade › "Estrutura provada" | CLI `relations`, `negations`… |
| Equivalências `sameAs` e pares retratados; `subsumes` | Detalhe do fato | |
| Delta de conhecimento por PR e comparação entre gerações | Histórico | UC-G13, UC-G27 |
| Calibração (`budget`, taxa off-atlas de `territories`): hoje zero honesto, sem escritor | Settings › Índice | `docs/reference/commands/budget.md` |
| Planejadores `anchors`, `slots`, `draft` dentro dos diálogos de Reescrever e Classificar | Diálogos | |

## Terceira rodada (2026-10-18)

Três leituras do código (conceitos, memória, comandos + Orchestra), cada achado conferido no arquivo citado.

### O mock estava errado

| Achado | Verdade | Fonte |
|---|---|---|
| Connections › Uses calculado dos imports | O Atlas nunca serve `dependencies`; a linha agora diz "Not recorded" | `adapter-io/src/own-source.ts:221` |
| Glossário "Out of date (still sent) = STALE" | Um fato só é FRESH ou DRIFTED | `knowledge/src/types.ts:38` |
| "Tested" sugeria checagem viva | O status é o escrito; ninguém reavalia | `knowledge/src/lifecycle/evaluator.ts` sem chamador |
| Undo depois de indexar regra | Memória é append-only | `memory/src/rules.ts:207` |
| Teto de 800 para o Maestro | 800 é do actor `orch`; o Maestro não é dono de memória | `adapter-io/src/memory-emit.ts:206` |
| Resume com escolha "Earlier" | O Maestro não passa ref; vale o último recibo da sessão | `orch/maestro/atlas-resume.ts:76-98` |
| Checkpoint "Saved / Not saved" | Quatro resultados mais "já salvo" | `orch/tool/atlas-memory.ts:115-137` |
| Facetas "Not set up yet" | Mission, terrain, ontology e orientation não têm escritor | `adapter-io/src/awareness-store.ts:60-118` |
| 4 textos de próximo passo | O Orchestra tem 9 e os anexa à mensagem do hold | `orch/maestro/atlas-source.ts:27` |
| Tooltip "nada pede memória de PR" | O emit anuncia o template PR e o resume aceita `pr` | `orch/tool/atlas-memory.ts:102` |

### Adicionado

Add a fact (anchors → slots → draft → check), Check a claim (`verify-fact`), Proven structure com linhas e abstenções, plano Current/Out of date, evento "froze units" (anchor do Archie), Republish com as pré-condições do script e estado Served/Held, Suggest territories com blast radius, Import, Hot set com orçamento, matriz agente × ferramenta, linhas Health de Memory e Secret scanner, aviso de `.gitignore`, onde a memória mora, formas degradadas do cabeçalho, regra re-indexada idêntica ("Already saved"), teto vitalício na frase de recusa.

### Deixado de fora de propósito

Capacidades construídas só na biblioteca (sem CLI/MCP) e conceitos só de docs: lista em `DESIGN.md` › Fora de propósito.

## Quarta rodada: revisão fria (2026-10-18)

Três revisores sem contexto (conhecimento, memória, health/settings/activity) leram o mock contra o código. Cada achado foi conferido antes de virar mudança.

**Corrigido (confirmado no código):**
- **HOLD/config:** o exemplo precisa de `sourceDirectory`, porque sem ele os arquivos do snapshot não são achados. O catálogo ainda não existe em `modules/atlas` e é gerado por `publishTerritoryCatalog`; uma edição à mão quebra o hash de versão (`orch/maestro/atlas-source.ts:76`, `retrieval/src/host-context.ts:75`).
- **Retire de um fato alterado:** é recusado `ungrounded`, porque o truth gate re-deriva a âncora antiga. O botão sai, e a frase sugere reescrever (`adapter-io/src/doctor-source.ts:177`, `governed-emit-gates.ts:202`).
- **Edit, Classify e Add fact via `draft`:**
  - o grupo é o primeiro segmento do caminho (`packages`), então o "Allowed" fica vermelho com esta política;
  - sobre um fato Ratified ou Core, a escrita é `governance-downgrade`;
  - Classify re-ancora no HEAD (`tools/src/draft.ts:198`, `governed-emit-reasons.ts:37`).
- **Derive links:** só prova `depends-on`; SCIP não tem papel de chamada (`adapter-io/src/relation-derive.ts:40`).
- **Índice:** `.mjs`/`.js` contam como TypeScript (EXT_LANG); uma extensão desconhecida nunca vira lacuna.
- **Republish:**
  - lista as pré-condições reais do script (`.atlas`, ancestral, arquivo regular, blobs);
  - `skill-bytes-changed` é checado na leitura, não no script;
  - o script chama `exportOwnSnapshot`.
- **`init`:** um único blast radius para o caminho, não um por território.
- **Import:** o alvo só precisa não ter `.atlas/`. Os fatos importados não são servidos até passarem pelos checks.
- **Hot set:** é recusado num store em git.
- **Âncoras do Archie:**
  - a entrada é `target {kind, id}`;
  - o limite de 8 unidades e 128 KiB vale por âncora;
  - o drift é checado ao publicar o workflow.
- **Resume:**
  - o Orchestra escolhe o checkpoint a partir do recibo e o Atlas confere;
  - o checkpoint vai na mesma mensagem do packet;
  - quem reporta é o próprio seat (blocker `packet` ou `atlas`);
  - depois de uma compactação, ele é reenviado uma vez.
- **Logbook:** os limites de seção existem só na biblioteca; a porta de escrita checa apenas o template.
- **Frases:** `canonical-form violation`, `closed-slot-violation`, `ambiguous`, `over-cap`, `scanner-unavailable`, `no-own-fold`; Core "Atlas não verifica quem digitou"; Link pede sempre uma chave; `seq` é sempre 0.

**Rejeitado:** "um hint escrito à mão dispensa a chave". O `draft` marca a proveniência `trusted: false` (`tools/src/draft.ts:94`), e o fast path exige `trusted` (`knowledge/src/ratify/fastpath.ts:148`). Toda escrita feita pela UI passa pelo `draft`, então sempre pede a chave.

## Quinta rodada: revisão fria por ângulo (2026-10-18)

Três revisores sem contexto, cada um com um ângulo novo: fidelidade dos números, fluxos de ação de ponta a ponta, e telas do Orchestra mais as afirmações dos docs.

**Corrigido (confirmado no código):**
- **CI:** `data-real.js` trazia o nome de exibição padrão do seat de backend e quebraria `specialist-name-guard.test.ts`. O `extract.py` agora lê o rótulo de `roster.ts` e troca pelo id.
- **Briefing num store em git:** o `own` lê só fatos selados re-provados, então manda vazio. A tela avisa e o KPI mostra 0 (`adapter-io/src/compose.ts:517`).
- **Merge check num store em git:** o reconcile lê uma projeção vazia e sai 0. A tela diz que o resultado não informa nada, em vez de "bloquearia" (`compose.ts:557`).
- **Accept all:**
  - a linha de staging é T2, então sobre um fato T1 ou T0 ela é `governance-downgrade`;
  - as linhas "kept" continuam sendo reapresentadas, porque o staging não tem delete (`governed-emit-incumbent.ts:204`, `governed-promote.ts:36`).
- **Ordem do authz:** primeiro o ator no escopo (`unauthorized`), depois o downgrade.
- **Retire:** um fato Ratified ou Core precisa de chave (`billy` para Core); o botão não recebe chave e mostra a recusa.
- **Undo:** só para escolhas que existem apenas na interface. O Atlas não tem delete nem rebaixamento de tier.
- **Ponteiros do briefing:** todos os filhos rastreados no eixo espacial (`own-source.ts:331`). Os importadores incluem testes e `.mjs`. `(root)` não tem briefing.
- **Chat:** o usuário fala só com o Maestro. O chip fica na chamada `task` do backend (`agent/agent.ts:289`).
- **Task real:** o packet era a instrução ao Maestro, e o resultado e o modelo são do Maestro.
- **Activity:** o evento de resume pode ser uma recusa, e os recalls (`outcome: read`) entram como eventos.
- **Archie:**
  - a fala dele no transcript usa o hold real `unit-missing-or-ambiguous`;
  - plano congelado desatualizado é `anchor-source-drift` (`WORKFLOW_KNOWLEDGE_*`);
  - `plan-grounding-stale` é só da revisão de plano do Maestro.
- **Folhas:** amostra do mine (`budgetSpent` conta sites, frase real de cobertura), hot set (`over` é booleano), texto do init (`.gitignore`), rótulo do Ratify ao escolher Core, rodapé "locked" para `tracked-staging`.
- **Docs:**
  - a identidade da execução fica só no recibo, não no registro;
  - o Maestro lê por `maestro_catalog_context`; **[V1 — pendente no V2, ORC-007]** (no V2 o Maestro ainda não tem essa tool; a decisão do owner é ler por `atlas_context` `catalog`/`unit`);
  - o script de republicação chama `exportOwnSnapshot`;
  - são 50+ motivos de hold;
  - os campos dos recibos e da âncora foram completados;
  - os nomes de exibição vêm de `agent.<id>.name`;
  - o resume é escolhido pelo Orchestra, e a escolha manual é R5.

**Rejeitado de novo:** "um hint escrito à mão passa sem chave". Dois revisores repetiram a afirmação. O emit passa `{...node}` para o ratify, e o nó do `draft` carrega `provenance.trusted: false` (`tools/src/draft.ts:94`, `adapter-io/src/governed-emit.ts:214`), então o fast path não se aplica.
