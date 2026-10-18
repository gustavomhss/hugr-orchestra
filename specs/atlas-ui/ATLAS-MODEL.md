# O modelo do Atlas, para quem vai desenhar a interface

Base: `dev` @ `6ea9383245`, 2026-10-18.

Fontes:

- a documentação conceitual inteira do Atlas (`modules/atlas/docs/explanation`, `docs/spec`, `docs/design/product-*`, `ARCHITECTURE.md`);
- dois mapeamentos de código com `arquivo:linha`, nos caminhos de escrita, leitura e memória;
- **um store real**, inspecionado em disco: o Atlas rodando sobre o próprio código, em `~/Documents/HuGR/atlas/.atlas`.

Os caminhos de código abaixo são relativos a `modules/atlas/packages/`, exceto onde indicado.

Este documento vem **antes** de qualquer tela. As duas primeiras rodadas de mock falharam por motivos opostos:

- a primeira espelhou comandos do CLI;
- a segunda simplificou até perder a estrutura do Atlas.

Aqui está o que o Atlas é, guarda e faz. A interface tem que sair disso.

---

## 0. Em dez linhas

1. O Atlas é **um** sistema com **duas espécies de conteúdo**: **Conhecimento** (compartilhado, sobre o código) e **Memória** (privada de cada membro, sobre fazer o trabalho). As duas nunca se misturam.
2. As duas vivem sobre **um mapa estrutural do código**, o índice. Ele tem três eixos:
   - **espacial:** repo → pacote → módulo → arquivo → símbolo → bloco;
   - **territórios:** donos e criticidade;
   - **dependência:** quem depende de quem.
3. A unidade do Conhecimento é o **fato**: uma afirmação curta **ancorada** num pedaço do código pelo hash da subárvore. Quando aquele código muda, o fato sabe na hora.
4. Todo fato tem **tipo de afirmação** (13 slots), **família** (como é verificado), **tier** (criticidade e governança), **estado** (frescor e verdade) e **proveniência** (quem escreveu, quem ratificou e, quando minerado, o raciocínio inteiro).
5. Fatos nascem de dois jeitos:
   - **minerados** pelo genesis: vão para o *staging* e depois são promovidos;
   - **emitidos** por um agente ou pessoa: passam por quatro portões, *shape, truth, authz e ratify*.
6. Nada é apagado. Um fato muda **por edição** (advisory) ou **por substituição com linhagem** (predicate). Quando o código muda debaixo dele, o drift é **mecânico** (o código se moveu) ou **semântico** (a afirmação deixou de valer, e isso bloqueia o merge).
7. Os agentes recebem conhecimento como um **briefing por escopo** (o *own pack*), sempre limitado em tamanho e em duas bandas: governante (T0/T1) e advisory (T2).
8. A memória de cada membro tem quatro tipos:
   - **regras de projeto:** injetadas em todo turno, até 12, com decaimento por desuso;
   - **tarefa** e **PR:** consultadas sob demanda;
   - **logbook:** só do Maestro.

   Junto com as regras, cada turno recebe um **cabeçalho derivado e compartilhado**: Consciência (*Awareness*) e Orientação.
9. **Na prática, hoje:** o store real tem **596 fatos, todos observações mineradas por arquivo** (advisory, T2), mais 64 candidatos parados no staging. Não há predicados, relações nem memória gravada fora de evidências de teste.
10. **No Orchestra, hoje:** só a memória (backend, jimmy e archie) e um snapshot de "Own" estão ligados. Leitura de conhecimento, drift, genesis e curadoria existem só no CLI do Atlas.

---

## 1. O mapa do código (o índice estrutural)

**O que é.** `build(tree, scip)` monta três vistas do repositório (`index/src/build.ts:269-277`):

- **Espacial:** `repo → crate/pacote → módulo → arquivo → item (função, tipo) → bloco`. Cada nó tem um `subtreeHash` (BLAKE3) do seu trecho de código. Uma mudança refaz só o caminho até a raiz, e tudo o que não foi tocado continua igual.
- **Territórios:** `projeto → território → região`. Um território é `{nome, dono, tier, globs}` (`contracts/src/territory.ts:15-20`). Sobreposição se resolve de forma determinística, e caminhos que nenhum glob cobre aparecem como **descobertos**.
- **Dependência:** arestas `depends-on` vindas **só** do SCIP (`.atlas/index.scip`). O Atlas não gera esse arquivo; `doctor index` apenas imprime o comando para rodar (`adapter-io/src/scip.ts:198-204`). Sem SCIP, não existe "quem depende de mim".

**A unidade de escopo** é um caminho do repo: pasta, arquivo, ou `arquivo::item::bloco` (por exemplo `src/greet.ts::lexical_declaration:0:greet`).

**Na UI:** é o **esqueleto de navegação** natural. Todo conhecimento está pendurado em algum ponto desse mapa, e todo território tem dono e tier. Navegar o Atlas é navegar o código.

---

## 2. Conhecimento: o fato

### 2.1 Anatomia (o que um fato guarda)

| Campo | O que é | Exemplo real |
|---|---|---|
| **Afirmação** (`claims[]`, `claimNorm`) | uma frase curta, por template, nunca prosa livre (A-13) | "Despite its hash.ts name, this unit contains no runtime code at all…" |
| **Âncora** (`grounding.entries[]`) | `{kind: symbol\|block\|file, qualifiedPath, subtreeHash}` mais o caminho; as linhas são só dica de exibição | `file · packages/contracts/src/hash.ts` |
| **Tipo de afirmação** (`slot`, 13 valores fechados) | `invariant`, `contract`, `precondition`, `postcondition`, `sideeffect`, `ownership`, `perf-bound`, `security-property`, `gotcha`, `rationale`, `dependency`, `count`, `definition` | o slot `definition` alimenta a faceta *ontology* da Consciência |
| **Família** (6) | **como** é verificado: `advisory` (afirmação ancorada, sem checagem); `predicate` (tem `check` e veredito HOLDS/BROKEN/NA); `relation` (depends-on/calls entre duas unidades, provada pelo SCIP); `negation` ("nada em S chama X"); `transition` (o que mudou entre dois shas); `test-vacuity` (teste que não pode falhar) | 100% `advisory` no store real |
| **Tier** | criticidade e governança: **T0** (tem que estar certo; só ratificação humana), **T1** (sustenta o sistema), **T2** (padrão e advisory) | 100% `T2` no store real |
| **Escopo de governança** (`scope`) | rótulo que decide **quem pode escrever** (`policy.json → authz.scopes`); não é caminho | `atlas:mined`, que só `seat:orchestrator` escreve |
| **Proveniência** | quem emitiu (ator), `derivedAt` (sha), quem ratificou; nos minerados, `answerRef` aponta para o **raciocínio completo** do minerador, guardado no CAS | rascunho, passada de refutação e a decisão |
| **Obviedade** | nota, nunca filtro (ADR-0012) | hoje sempre `obvious`: o critério está fixo em `false` (`genesis/src/admit-harness.ts:132`) |
| **Selo** | `proven` (checagem determinística) ou `justified` (argumentado) | relations derivadas do SCIP são `proven` |
| **Equivalências** | `sameAs[]` (mesmo fato, ligado por `atlas link`; retratar acrescenta, não apaga) e `subsumes` (mais amplo / mais estreito) | nenhuma no store real |

**Duas identidades.** `nodeKey = hash(âncora, slot[, check])`, ou seja, o **assunto**: um mesmo assunto mantém o mesmo nodeKey quando o fato é editado. `contentHash = hash(fato)` é a **versão** e é também o nome do arquivo no CAS (`knowledge/src/write/router.ts:355-361`). Como a âncora no store real é o arquivo inteiro, **na prática há um fato por arquivo e por slot**.

### 2.2 Estados (dois eixos, nunca um só)

- **Frescor da âncora:**
  - `FRESH`: a subárvore bate;
  - `DRIFTED`: o código mudou;
  - `STALE`: drift em advisory, servido com aviso, sem bloquear;
  - valor ausente: `[?]`, nunca "fresco".
- **Verdade, só em predicados:** `HOLDS`, `BROKEN` ou `NA`. Para os outros é `advisory`.
- **Drift classificado** (`adapter-io/src/doctor-source.ts:117-124`):
  - **mecânico:** o conteúdo citado ainda existe em outro lugar; dá para reancorar (*reground*);
  - **semântico:** o conteúdo sumiu e a afirmação apodreceu. No merge, `reconcile` sai com código 2 e **bloqueia**.
- Um formatador rodando **sobre** a unidade citada faz o fato derivar: o hash é sobre bytes crus. É um falso alarme aceito de propósito.

### 2.3 Bandas: o que conta como regra

- **Banda governante:** T0/T1, ratificada; é o que dirige os agentes.
- **Banda advisory:** T2; são propostas que ninguém ratificou.

São **campos separados** no pack, de propósito, para que nenhuma tela mostre uma proposta com cara de regra (`contracts/src/pack.ts:22-26`). `query` sem flags nem lista T2 na banda governante.

---

## 3. O ciclo de vida de um fato

```
           ┌────────────── genesis (mine) ──────────────┐
 código ──▶│ frontier (até 200 sites) · modelo propõe    │──▶ STAGING (candidatos + raciocínio)
           │ verifica: âncora FRESH · admite ou abstém   │         │
           └─────────────────────────────────────────────┘         │ promote (origin: promoted)
                                                                    ▼
 agente/pessoa ──▶ draft/check (planejadores, sem gravar) ──▶ EMIT ── shape → truth → authz → ratify
                                                                    │
                          roteamento: DEDUP · CREATE · UPDATE (advisory) · SUPERSEDE (predicate)
                                                                    ▼
                                                     PROJECTION (o conhecimento vigente)
                                                                    │
                      código muda ──▶ drift: mecânico (reground) | semântico (BROKEN → bloqueia merge → reground/retire)
                      link/retract sameAs · derive-relations (SCIP) · transition · test-vacuity
```

- **Genesis** (`cli/src/mine.ts`):
  - roda até três braços (advisory, dependency e count) sobre arquivos, ou símbolos com `ATLAS_FRONTIER=symbol`;
  - tem custo medido de cerca de US$ 0,10 por site e usa o modelo configurado pelo operador;
  - grava só no staging, sempre como T2 com escopo `atlas:mined`, e guarda o raciocínio;
  - nunca escreve na projection.
- **Promote:** reenvia cada linha do staging pelo mesmo portão do emit e **não pula ratificação**. Exige um token de ratificação e que o ator esteja autorizado. O staging não é marcado depois de promovido: as linhas continuam lá.
- **Emit e os portões** (`adapter-io/src/governed-emit.ts`):
  - **shape:** forma e template;
  - **truth:** a âncora re-deriva FRESH agora;
  - **authz:** o ator pode escrever aquele escopo, não muda escopo, não rebaixa tier. O ator vem de uma variável de ambiente ou do e-mail do git: é uma declaração, não autenticação;
  - **ratify:** T2 advisory aterrado passa direto; predicate, T0, contestado ou promovido exige token, e T0 exige `billy`.
- **Roteamento** (`knowledge/src/write/router.ts:133-148`):
  - mesmo `contentHash`: nada muda;
  - nodeKey novo: cria;
  - advisory já existente: **edita**, une as afirmações, e **não guarda ponteiro para a versão anterior** ("o git guarda");
  - predicate com a mesma checagem: **substitui** com `supersededBy`.
- **Relações e afins:** `link` grava `sameAs` nos dois lados (sem objeto no CAS). `derive-relations` prova `depends-on` pelo SCIP, sem LLM, e grava como `relation` com selo `proven`. Negações gravam também as **abstenções**, por exemplo "não dá para decidir: o escopo carrega código em tempo de execução".
- **Nada morre:**
  - o CAS nunca apaga;
  - "esquecer" é sair do conjunto ativo ou injetado;
  - **a exceção:** a projection guarda só as **4 últimas gerações** (`projection.<gen>.json`); as mais antigas são apagadas (`sidecar-commit.ts:229-238`).

---

## 4. Como o conhecimento chega aos agentes

- **`query <escopo>`:** um pack com a banda governante (T0 primeiro, depois T1 por relevância; teto de cerca de 2000 tokens) e a advisory em separado (cerca de 2000). Cada linha traz o próprio frescor. O pack traz também um aviso `stale` geral, `advisoryDropped` e `tokenEstimate`.
- **`own <escopo>`:** o **briefing do escopo**, isto é, o que um agente recebe ao entrar ali. Ele traz:
  - papel e dono;
  - invariantes, cuidados (*gotchas*) e advisory;
  - `dependent` (quem depende: o raio de impacto, até 8);
  - `finer` (subescopos, até 16);
  - `pull-reachable`: o que não coube; aparece nomeado, nunca descartado em silêncio.

  O teto é de cerca de 1500 tokens. Não chama LLM, e a mesma entrada sempre dá os mesmos bytes.
- **No Orchestra, hoje:**
  - o Maestro e os agentes lêem um **snapshot Own pré-construído** (`OWN-SNAPSHOT.json`, que hoje tem 1 unidade) mais um **catálogo de territórios** (`TERRITORY-CATALOG.json`, que não existe no repo), pela ferramenta `atlas_context` (ações `catalog`, `unit` e `anchor`);
  - se faltar qualquer coisa, a ferramenta **para (HOLD)** com um de cerca de 30 motivos nomeados. Hoje o motivo é `provider-unconfigured`.
- **Âncoras do Archie:** um plano carrega de 1 a 8 unidades Own congeladas (com hashes). O Relay revalida as âncoras ao montar o workflow (`anchor-source-drift` se mudaram) e injeta o conteúdo como "dado não confiável" em cada passo.

---

## 5. Memória

**De quem.** Cada membro tem a sua memória, inclusive o Maestro. No Orchestra só `backend`, `jimmy` e `archie` estão ligados (`atlasMemory: true`). Um membro não lê a memória de outro.

**Quatro tipos, divididos por como são acessados:**

| Tipo | Acesso | Conteúdo | Ciclo |
|---|---|---|---|
| **projeto (regras)** | **injetado em todo turno** | `{regra imperativa de uma linha, escopo, âncora?}` | as 12 primeiras por *frecency*; decai pelo desuso (no código, a idade conta linhas novas no log; com 4 ou mais linhas depois, a regra sai); vai para o arquivo, nunca é apagada |
| **tarefa** | só sob demanda | `{taskId, tentado[], falhou com[], parou em, lição}` | ativa até a tarefa fechar; depois arquivada |
| **PR** | só sob demanda | `{prId, decisões[], resultados de review[], delta de conhecimento[]}` | ativa até o merge; depois arquivada |
| **logbook** (só Maestro) | só sob demanda | uma entrada por PR: `entregue / decisões e porquê / trade-offs / riscos / pendências` | só cresce; uma decisão nova substitui outra **por link** |

**Como o owner lê os dois tipos que mais importam** (2026-10-18):

- **Memória de projeto é stewardship.** É curta, escopada e vai em todo turno: o que o engenheiro que está há anos naquele código sabe e mais ninguém sabe.
- **Memória de task é a memória de um spawn.** Cada vez que um membro é chamado para uma unidade de trabalho, ficam guardados:
  - a **sessão** dele: o transcript, que é respawnável;
  - **cada invocação** daquela sessão: dispatch, resumes, continuações;
  - os **checkpoints** que ele gravou: o que tentou, o que falhou, onde parou e a lição.

  Ao respawnar a task com `memoryUnit`, o Atlas devolve o último checkpoint admitido.

No código isso fecha assim:

- cada registro de memória carrega a identidade da execução que o gravou (`executionSessionID`, `callID`, `assistantMessageID`, em `orch/maestro/atlas-memory.ts:108-111`);
- `task` com `memoryUnit` injeta o fold na sessão retomada (`orch/maestro/atlas-resume.ts`);
- o `@atlas/persist` define o metering por execução: modelo, tokens, ferramentas, tempo, retries, veredito e `transcriptSha` (`persist/src/types.ts:87-99`). Ele ainda não está ligado no Orchestra; hoje o transcript vive na sessão do Orchestra.

As 5 execuções reais em `specs/backend-specialist/evidence/continuity-live-2026-10-10` (T-LIVE-1…5) são exatamente isso, e o mock as usa.

**O cabeçalho de cada turno** (`orch/maestro/atlas-header.ts`): é a última parte de sistema de todo turno desses três agentes.

- **Consciência** (*Awareness*), compartilhada e derivada do próprio Atlas: `mission`, `constitution` (vinda dos fatos T0), `terrain` (territórios), `ontology` (slot `definition`) e `taste` (vinda do `CONVENTIONS.md`). Teto de cerca de 400 tokens. **Hoje** três facetas estão sempre `UN-SEEDED`.
- **Orientação**, compartilhada e derivada: `goal / last / current / state`. **Hoje** nada escreve `orientation.jsonl`, então ela vem vazia.
- **Regras:** as do próprio membro, até 12.

**Escrita** (`atlas_memory_emit`):

- passa por template e por um **scan de segredos obrigatório** (gitleaks); sem scanner, a escrita é recusada;
- devolve `admitted`, `reconciled`, `refused` (com motivo nomeado: `over-cap`, `kind-conflation`, `scanner-blocked`…), `unavailable` ou `uncertain`;
- os arquivos `memory.jsonl` e `orientation.jsonl` ficam no worktree, são **versionados pelo git** e fazem merge por união.

**Retomada:** uma tarefa pode carregar `memoryUnit`. O agente filho recebe o "fold" da memória daquela tarefa, e ele é **restaurado depois da compactação**.

**Recibos:** cada uso deixa um recibo no metadata do tool-part:

- `atlasContext`: unidade, hashes e cobertura `complete | partial | held(motivo)`;
- `atlasMemory`: operação, resultado, ref e recusa;
- `atlasResume`: admissão e residência.

**Nenhuma tela lê esses recibos hoje.**

---

## 6. Onde tudo fica (`.atlas/`)

| Arquivo | O que é | Git |
|---|---|---|
| `cas/<2hex>/<hash>` | objetos imutáveis: fatos (JSON) e raciocínios do minerador (texto, já sem segredos) | não versionado |
| `projection.json` (+ 4 gerações) | **o conhecimento vigente**: uma linha por nodeKey, com família, slot, tier, escopo, âncora, afirmações, equivalências, `derivedAt`, `supersededBy`, mais as abstenções | não versionado |
| `staging.json` (+ gerações) | **candidatos** do genesis, com `answerRef` | não versionado |
| `policy.json` | quem escreve cada escopo, palavras que sinalizam T0; editado à mão | **versionado** |
| `index.scip` | índice SCIP, gerado por fora | não versionado |
| `memory.jsonl` / `orientation.jsonl` | log de memória dos membros / log de orientação | **versionados** (merge por união) |
| `OWN-SNAPSHOT.json`, `TERRITORY-CATALOG.json`, `.orchestra/skills/own/…` | o que o Orchestra lê hoje: snapshot Own e catálogo de territórios | versionados (fora de `.atlas/`) |

**Uma tensão real que a interface precisa respeitar.** A documentação diz "git-native, viaja com o repo". No código, **o conhecimento** (projection e CAS) **não pode ser versionado pelo git**: se estiver rastreado, a leitura e a escrita são recusadas. Só a memória, a política e o snapshot Own viajam com o repo. O driver de merge OR-set existe mas não é instalado por nada. Exportar grava só o CAS, e importar não reconstrói a projection.

---

## 7. O que existe de verdade (store real, Atlas sobre Atlas)

- **596 fatos vigentes:**
  - todos `advisory`, tier `T2`, escopo `atlas:mined`;
  - uma afirmação cada, ancorada ao arquivo inteiro;
  - nenhum predicado, relação, negação, transição, sameAs ou T0/T1.
- **Distribuição por área:** `adapter-io` 107, `knowledge` 51, `e2e-blackbox` 43, `cli` 43, `docs/requirements` 43, `genesis` 40, `persist` 35… São fatos sobre código, testes **e** documentação.
- **Como as afirmações são:** observações específicas e úteis, quase sempre pegadinhas e comportamentos não óbvios. Exemplos:
  - "uma consulta filtrada por direção que não acha nada sai com código 0 e imprime '0 edge(s)'…";
  - "o painel de diagrama não pega o modo escuro porque…".
- **660 candidatos** no staging: 596 promovidos e **64 ainda pendentes**. Cada candidato tem o raciocínio do minerador anexado.
- **Política:** só `atlas:mined → seat:orchestrator` pode escrever.
- **Memória:** nenhum `memory.jsonl` real fora das evidências de teste em `specs/backend-specialist/evidence/`.
- **Orchestra:** não configurado neste repo. Snapshot Own com 1 unidade e nenhum catálogo de territórios.

**Consequência para a interface:** ela precisa ser excelente primeiro para o caso real, que é **muitas observações mineradas por arquivo, a curar e promover**, e acomodar o modelo completo (regras ratificadas, predicados, relações, memória) sem fingir que já existem.

---

## 8. Do modelo para a interface

| O Atlas tem… | A pessoa quer… | Lugar na interface |
|---|---|---|
| mapa espacial + territórios | "o que se sabe sobre **esta parte** do código, e de quem é" | **Mapa**: árvore do código com território, dono, tier e quanto se sabe e quanto mudou em cada nó |
| briefing `own` por escopo | "o que um agente recebe quando entra aqui" | painel **Briefing** de qualquer nó do mapa: bandas separadas, o que ficou de fora, quem depende |
| fatos (slot, família, tier, estado, proveniência) | ler, filtrar e confiar | **Conhecimento**: lista com os filtros reais (tipo de afirmação, família, tier/banda, estado, território, origem minerada ou emitida) e o **detalhe do fato** |
| raciocínio do minerador (`answerRef`) | "por que a máquina afirmou isso" | no detalhe: **"Como foi deduzido"** |
| staging do genesis + promote | revisar o que foi minerado e decidir | **Curadoria › Candidatos**: com raciocínio, resultado previsto de cada portão (dry-run do `check`), promover ou descartar |
| drift mecânico/semântico + reconcile | saber o que apodreceu e consertar | **Curadoria › Mudou no código**: antes e depois, reancorar ou aposentar; o semântico marcado como bloqueante de merge |
| ratificação (T0 humano, T1) | promover algo a regra | **Curadoria › Ratificar**: com o portão `ratify` e a identidade de quem ratifica |
| sameAs / subsumes | juntar duplicatas, ver hierarquia | no detalhe do fato, mais uma ação em Curadoria |
| genesis (escopo, orçamento, custo) | minerar uma área nova | **Curadoria › Minerar**: escolher o escopo, ver o orçamento e o custo estimado |
| memória por membro, cabeçalho | ver o que cada agente carrega e decidir o que esquecer | **Memória**: por membro, com cabeçalho (Consciência e Orientação compartilhadas; regras próprias com frecency), consultáveis (tarefa, PR, logbook) e arquivadas |
| gerações, `derivedAt`, logbook por PR | "o que mudou no que os agentes sabem, e por quê" | **Histórico**: mudanças por commit/PR (delta de conhecimento), ligadas ao logbook |
| política, catálogo, índice, CAS | configurar e diagnosticar | **Configuração**: territórios (descobertos), política de escrita, estado do índice (SCIP ausente = sem raio de impacto), integridade do store |
| recibos `atlasContext/Memory/Resume` | ver no chat o que o agente usou e gravou | **Chat**: chips de citação e "usou do Atlas", abrindo o detalhe |
| motivos HOLD | entender por que o Atlas não respondeu | estados vazios com o motivo nomeado e o próximo passo, em qualquer tela |

**Vocabulário na tela.** A interface usa **os conceitos reais** do Atlas com nomes claros e uma linha de explicação na primeira vez: território, tier, banda, tipo de afirmação, âncora, frescor, staging. A segunda versão apagou esses conceitos e perdeu a estrutura. O que fica escondido, atrás de "Detalhes técnicos", é só a **canalização**: nodeKey, contentHash, subtreeHash, gerações e escopo de governança cru.

---

## 9. Perguntas para validar antes de desenhar

1. **Quem é o usuário principal desta tela:** você, como steward técnico que conhece o Atlas, ou qualquer dev do projeto? Isso decide o quanto do vocabulário fica à vista.
2. **Memória dentro do Atlas** (é como o Atlas a define: uma espécie de conteúdo dele), **com um link a partir de Agents**? Ou o contrário?
3. **Curadoria agora ou depois?** Hoje a escrita só existe no CLI. Desenho o produto completo (minerar, promover, ratificar, reancorar) ou só leitura, com a curadoria marcada como próxima etapa?
4. **A tensão do git** (§6): o conhecimento não viaja com o repo, mas a memória sim. A interface deve mostrar isso ("conhecimento local desta máquina") ou isso é um bug do Atlas a corrigir antes?
5. **Os 64 candidatos parados e as 3 facetas sempre `UN-SEEDED`:** a interface deve tratá-los como estado normal ("aguardando você") ou como sintoma a corrigir?
