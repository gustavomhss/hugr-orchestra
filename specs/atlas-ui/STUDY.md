# Atlas no Orchestra — estudo de telas, navegação e interface

Base: `dev` @ `6ea9383245` (2026-10-18). Estudo de leitura; nenhum código foi alterado.

Fontes: o código do Atlas (`modules/atlas`) e o do app (`packages/app-shell`, `packages/protocol`, `packages/server`, `packages/client`, `packages/orchestra`). Também os specs `specs/actions`, `specs/orchestra-visual`, `specs/hugr-maestro` e `specs/backend-specialist`, e uma pesquisa de produtos comparáveis (fontes no apêndice B). As afirmações sobre o código citam `arquivo:linha`.

---

## 0. Resumo

1. **O Atlas não tem interface gráfica hoje.** Ele é usado pelo CLI `atlas` (32 comandos) e por um servidor MCP stdio (18 ferramentas). O Orchestra não usa nenhum dos dois. Ele carrega o Atlas dentro do próprio processo, por um bundle gerado (`@orchestra/atlas-boundary`), e só o pacote `packages/orchestra` importa esse bundle.
2. **O bundle não expõe leitura de Knowledge.** As quatro entradas são `.`, `./materialize`, `./native-header` e `./native-memory` (`modules/atlas/boundary/script/build.ts:9-15`). Elas servem o contexto Own, o snapshot e o header e a Memória do seat. Não existe `query`, `own`, `node`, `relations`, `negations`, `doctor` ou `territories` no bundle. **A UI precisa de uma entrada nova no boundary.** Essa é uma mudança no Atlas, verificada pelo job `atlas` da CI.
3. **A UI hoje mostra só um item de configuração.** O diálogo de governança do Maestro tem a seção "Grounding · Atlas / Own", que lê `config.maestro.atlas` (`packages/app-shell/src/pages/session/orchestra-governance-data.ts:178-186`). O `specs/orchestra-visual/COVERAGE.md:418-423` registra como pendente a navegação e o consumo do Atlas (S19-W1). A parte ao vivo (S19-W2) ficou fora de escopo enquanto não existir uma projeção pública de leitura entre Server, Protocol e Client.
4. **O caminho para encaixar é o mesmo dos Actions** (`2a5c3cb887`, #633):
   - um capítulo `/orchestra/atlas/*` no sidebar;
   - dados vindos de um grupo novo de Schema → Protocol → Server, com o client gerado por `bun run generate`;
   - um contrato de view congelado;
   - um mock aprovado e guardado no repositório;
   - um registro de paridade visual.
5. **Recomendação de interface** (revisada depois da primeira rodada de mock, seção 5):
   - **três lugares só:** Visão geral, Conhecimento e Revisar;
   - **linguagem de produto:** Regra, Cuidado, Sugestão; Em dia, Código mudou, Não vale mais. O vocabulário interno do Atlas fica atrás de "Detalhes técnicos";
   - **detalhes abrem ao lado da lista** e também a partir das citações no Chat;
   - **a memória de cada agente mora em Agents**, não no Atlas.
6. **O Atlas tem regras de honestidade que a UI precisa respeitar** (seção 6). Por exemplo:
   - as duas bandas da pack nunca aparecem misturadas;
   - um valor de freshness ausente aparece como `[?]`, nunca como FRESH;
   - um campo degenerado aparece como "indisponível", nunca como zero.

   Elas viram critérios de aceite, não sugestões.

---

## 1. O que o Atlas é, do ponto de vista da UI

### 1.1 Entidades

| Entidade | Forma | O humano quer… | Fonte |
|---|---|---|---|
| **Fato (`GroundedFact`)** | É uma união de 6 famílias: advisory, predicate, relation, negation, transition e test-vacuity. Campos comuns: `id` (nodeKey), `tier` T0/T1/T2, `grounding.entries[]`, `freshness`, `claims`, `scope?`, `predicateSlot?`, `seal?` (proven/justified), `provenance?` | Ler o claim, o tier, a freshness, o seal e a âncora; descer ao detalhe; diagnosticar drift | `packages/knowledge/src/types.ts:98-376` |
| **Abstenção** | É um "não consegui decidir" honesto, com um `reason` entre 6 valores (scope-open, scope-dynamic, …) | Ver o que o Atlas recusou afirmar e por quê | `negation-types.ts:85-112` |
| **Âncora** | `StructRef {kind, qualifiedPath, subtreeHash}` mais `path` e `displayLines?`. As linhas são só uma dica de exibição | Ir até o código citado no sha | `contracts/src/struct.ts:20-50`, `grounding/src/types.ts:17-45` |
| **Pack / OwnPack** | Duas bandas em **campos separados**: `invariants` (T1 ou mais) e `advisory` (T2). Inclui `advisoryDropped`, `tokenEstimate` e uma marca `stale`. A OwnPack tem role, owner, tier, contains, inv, gotcha, dependent, finer… | É a "página do escopo" | `contracts/src/pack.ts:20-69`, `docs/reference/commands/own.md:60-70` |
| **sameAs / subsumes** | sameAs é simétrico e transitivo, sem merge, e um retract é um append. subsumes liga um broader a um narrower | Ver equivalências e hierarquia | `knowledge/src/read/sameas.ts:37-48` |
| **Território** | `{name, owner, tier, globs}`, mais caminhos `uncovered` | Ver quem é dono do quê e o que não tem cobertura | `contracts/src/territory.ts:15-20` |
| **Drift** | `DriftItem {fact, class: mechanical\|semantic, anchorWas, anchorNow}` | Fila de triagem: re-ground mecânico ou BROKEN | `tools/src/types.ts:189-217` |
| **Memória** | `MemoryRecord {owner, kind: task\|pr\|project\|logbook, entry}`. O header combina Awareness (5 facetas), Orientation e Rules (as 12 primeiras) | Ver o que cada seat carrega e o que vai decair | `memory/src/types.ts:24-211` |
| **Store / CAS** | `CasIntegrity {objects, corrupt, unreadable, missing, orphan, referenced, sound}` | Ver a saúde do Atlas | `tools/src/types.ts:280-298` |
| **Staging (genesis)** | `mine` grava candidatos e `promote` assenta todos de uma vez | Revisar as propostas antes de promover. Hoje não existe "listar staging sem promover" | `docs/reference/commands/mine.md`, `promote.md` |

**Dois identificadores, que não são intercambiáveis.** `node` recebe o content address. `link`, `doctor why` e `doctor reground` recebem a nodeKey (`docs/reference/commands/node.md:19-24`). Toda rota e todo deep link da UI precisa dizer qual dos dois carrega.

### 1.2 Vocabulário de estado: são três enums, não um

O README resume tudo como "FRESH → DRIFTED → BROKEN", mas o código tem três enums diferentes:

- `Freshness` = FRESH, DRIFTED ou STALE (`contracts/src/status.ts:8`);
- `KnowledgeFreshness` = FRESH ou DRIFTED (`knowledge/src/types.ts:38`);
- `Status` = HOLDS, BROKEN, NA ou advisory (`status.ts:11`).

**A UI mostra dois eixos separados:** a freshness da âncora e a verdade do predicado. Cada valor é exibido com ícone e texto, nunca só com cor.

### 1.3 Superfície operacional

- **Leituras:** `init`, `query --by scope|dependency|trigger`, `own`, `node`, `anchors`, `slots`, `draft`, `check`, `doctor {archive,why,hotset,reground,cas,index}`, `relations`, `negations`, `transitions`, `test-vacuities`, `verify-fact`, `verify-store`, `memory-*`, `budget`, `territories`, `reconcile`. A lista vem de `packages/cli/src/map.ts:69-102`.
- **Portas de escrita governadas:** são três, `atlas-emit`, `atlas-link` e `atlas-memory-emit` (`WRITE_PATHS`, `packages/tools/src/handler.ts:49`). O README fala em "two doors" e está desatualizado.
- **Envelope:** `Verdict {ok, data?, rejected?, guidance{next, invariant}}`. Um `guidance.next` serve diretamente como texto de "próximo passo" em estados de recusa.

### 1.4 O que a UI **não pode** prometer

| Lacuna | Consequência para a UI | Fonte |
|---|---|---|
| O modo `trigger` sempre retorna vazio, porque não existe produtor | Não oferecer a aba "por trigger", ou mostrá-la como "não disponível" | `adapter-io/src/retrieval-model.ts:43-46` |
| `dependencies`, `hits` e `ppr` são degenerados (sempre 0 ou vazio) | `budget` e `territories` mostram "indisponível", não 0 | `README.md:86-93` |
| A marca `stale` da pack é só um watermark | A freshness exibida vem de cada linha; o `stale` da pack não serve de semáforo | `docs/reference/commands/query.md:52-66` |
| Não existe "listar todos os fatos", "listar staging" ou "apagar" | Uma tela "Todos os fatos" precisa de uma leitura nova no Atlas; não existe botão de apagar | `docs/SESSION-STATE.md:396-399` |
| `atlas-diff` não está ligado | Não existe "diff entre versões" (meta G27 do Steward) | `tools/src/handler.ts:59-62` |
| O estado da Memória é contraditório: o README diz que nenhuma porta a expõe, mas o card da campanha 11 diz "closed" e os comandos existem | Resolver isso com o owner antes de desenhar a tela de Memória | `README.md:33-37`, `docs/requirements/work-packages/wp-campaign-11.md:3` |
| Os seats com Memória são backend, jimmy e archie no código, mas `classes.md:39` diz "only backend" | A tela usa a lista do runtime (`packages/orchestra/src/maestro/atlas-memory.ts:20-26`); o doc está desatualizado | — |

### 1.5 Para quem é a UI

O cliente principal do Atlas é um agente; o humano vem em segundo lugar (`docs/design/product-definition.md:11`). A UI é, portanto, **a superfície do humano**. O `docs/design/functional-surface.md` já define esse ator como **Steward (STW)** e lista suas metas:

| Meta | Descrição |
|---|---|
| G11 | Ratificar T0 |
| G12 | Declarar territórios e tiers |
| G13 / G13a | Revisar o knowledge-delta de um PR; auditar a proveniência |
| G14 | Rewind ou supersede |
| G15 | Exportar |
| G16 | Escopo do genesis |
| G27 | Diff entre versões |
| G28 | `doctor` |

Somam-se as metas de leitura do ORC/SEAT, que um humano também quer inspecionar: G1 localizar, G2 confirmar, G3 a pack, G4 o relacionado, G5 a memória e G24 o header. **Toda tela abaixo tem rastreio até uma dessas metas.** É a base de completude, e evita inventar escopo.

---

## 2. Onde o Atlas encosta no Orchestra hoje

- **No runtime:** só `packages/orchestra` depende de `@orchestra/atlas-boundary` (`packages/orchestra/package.json:84`). As costuras existentes:
  - `maestro/atlas-source.ts:53-154`, `readAtlasSource`: Own e catálogo; retorna `AtlasContextHeld{reason, evidence}` com códigos de razão em `:27-42`.
  - `maestro/atlas-discovery.ts`: catálogo e unidade.
  - `maestro/atlas-memory.ts:79-123`: `createNativeMemory` por chamada, sem cache.
  - `maestro/atlas-header.ts:14`: `readBoundHeader`, injetado em `session/llm/request.ts:96`.
  - `maestro/atlas-knowledge.ts`: âncoras do Archie para o Relay. O schema está em `packages/schema/src/atlas-knowledge.ts`.
- **Ferramentas de agente:** `atlas_context` (catalog, unit e anchor), `atlas_memory_recall` e `atlas_memory_emit`. Os IDs são protegidos em `tool/registry.ts:97-98`. O MCP chamado "atlas" é ignorado (`session/tools.ts:544`). Os recibos ficam no metadata dos tool-parts: `atlasContext`, `atlasMemory` e `atlasResume`. **Isso é útil para os chips de citação.**
- **Estado em disco:** `.atlas/` fica na worktree de execução: `memory.jsonl` e `orientation.jsonl` (rastreados pelo git), mais `cas/`, `index.scip`, `policy.json` e `projection.*.json`. A regra é um único escritor por raiz (`native-memory.ts:43`).
- **Restrições que a UI herda:**
  - Atlas → Orchestra é só de mão única (`modules/atlas/README.md:20-21`).
  - O host não importa o código-fonte do Atlas nem duplica seus parsers (`specs/hugr-maestro/grounding-boundary.md:7-11`).
  - Ninguém lê `.atlas/*.jsonl` diretamente (`specs/backend-specialist/atlas.md:92`).
  - O renderer não lê arquivos nem metadados por conta própria (`COVERAGE.md:422`).
  - Não dá para iniciar o MCP stdio: `check:spawn-imports` e o allowlist que só encolhe bloqueiam isso (`AGENTS.md`, seção Spawning Processes).

---

## 3. Como o app é montado (os pontos de extensão)

- **Stack:**
  - SolidJS, `@solidjs/router` e `@tanstack/solid-query`, com stores do Solid;
  - Tailwind v4 com os tokens v2 (`packages/ui/src/v2/styles`), o skin `--orchestra-*` (`orchestra/theme.css`) e o kit de capítulo `--mx-*` (`orchestra/chapters/kit.css`);
  - Kobalte (`@orchestra/ui`);
  - i18n com `@solid-primitives/i18n`; texto visível hardcoded é proibido;
  - Electron 42 no desktop. A web e o desktop renderizam o mesmo `AppInterface`, com as diferenças isoladas no contrato `Platform`.
- **Navegação:**
  - Rota `/orchestra/:chapter/*rest` → `OrchestraChapterRoute` (`app.tsx:770`).
  - Entradas do sidebar no array `navigation` (`packages/app-shell/src/orchestra/navigation.ts:6-26`).
  - A página registrada em `chapterPages` (`chapter-route.tsx:19-36`) recebe `{server, directory}` e é remontada quando o perfil (servidor + worktree) muda.
  - Breadcrumb por `breadcrumbLabel` mais `setCrumbTrail`.
  - Paleta com `mod+k`, por `command.register`; os comandos de "go to" ficam em `orchestra/shell/navigation-commands.tsx`.
  - O shell não tem tabs para capítulos nem split. As sub-views vivem no `*rest` ou em query params.
- **Dados:**
  - O padrão recomendado é o do Actions: Schema (`packages/schema/src/<domínio>`) → Core (o service) → Protocol (`packages/protocol/src/groups/*.ts`, registrado em `api.ts`) → Server (`packages/server/src/handlers/*.ts`) → `packages/client/src/contract.ts` → `bun run generate`.
  - O `packages/orchestra` monta esse servidor (importa `@orchestra/server`).
  - Atualização ao vivo: `useServerSDK().event.listen` e invalidação de query em `server-sync.tsx:531-554`.
  - Persistência de navegação: `Persist.serverWorkspace`, só para IDs e filtros.
- **Peças reutilizáveis:**
  - virtualização com `@tanstack/solid-virtual`;
  - árvore em `components/file-tree-v2.tsx`;
  - viewer de código e diff (`@orchestra/session-ui/file`, `diff-changes-v2`);
  - um DAG somente leitura com layout puro e limites (`orchestra/actions/graph.tsx` e `layout.ts`);
  - um drawer de inspector (`graph.tsx:245,314`).
  - Não existe biblioteca genérica de grafo.
- **Limite de tamanho:** 500 LOC é a meta e 750 o teto por arquivo (`script/godfile.ts:7-8`).

---

## 4. O que a pesquisa externa ensina

| Padrão | Exemplo | Uso no Atlas |
|---|---|---|
| **Drift em dois níveis**, com resolução por âncora (aceitar, re-ancorar, retirar) e filtro "só o drift deste PR" | Swimm | Fila de Drift; filtro por PR ou sessão |
| **"Verificado em sha X, há N commits"** e "último uso / decai em N dias" | GitHub Copilot Memory | Coluna de proveniência; decaimento da Memória visível |
| **Instruções escritas por humanos ≠ memória escrita pelo agente**; orçamento de tokens visível | Claude Code memory, Letta ADE | Knowledge (compartilhada, só leitura na visão do seat) ≠ Memory (por seat); mostrar o que entra no header e o que foi cortado (`advisoryDropped`, `tokenEstimate`) |
| **Escrita marcada onde acontece**, com o chip vindo da porta e não do texto do modelo | ChatGPT "Memory updated"; as falhas do Cursor | Chip na sessão gerado a partir do recibo `atlasMemory` / `atlasContext` |
| **Grafo de vizinhança, profundidade 1–2, como drill-in** e nunca como home | Backstage catalog graph; o local graph do Obsidian | Mini-grafo no Inspector; tela cheia só sob demanda |
| **"Search, show context, expand on demand"** | van Ham & Perer, 2009 | Busca → seleção → vizinhança → expandir |
| **Matriz acima de ~20 nós** para leitura; nó-aresta só para caminho | Ghoniem et al., 2004 | Matriz território × estado; caminho X → Y no grafo |
| **Rail → lista → detalhe** e um inspector compartilhado | Linear, SAP detail panel, Microsoft master-detail | O layout do capítulo e o Inspector global |
| **Breadcrumb pela estrutura**, não pelo histórico de cliques | NN/g | repo › território › escopo › fato |

**Anti-padrões que ficam de fora:**

- grafo force-directed global como página inicial;
- badge de "confiança" sem âncora;
- o agente dizer "lembrei" sem escrita feita;
- auto-fix sem registro na timeline;
- a paleta como único caminho até uma função;
- apagar uma memória sem mostrar a origem que vai recriá-la.

---

## 5. Proposta: arquitetura de informação e navegação

> **Em revisão (2026-10-18, terceira rodada).** O owner apontou que a versão abaixo perdeu a estrutura do Atlas. O modelo completo do que o Atlas guarda, organiza e faz, verificado no código e num store real, está em [`ATLAS-MODEL.md`](ATLAS-MODEL.md). Esta seção e o mock serão refeitos a partir dele, depois da validação do owner.

> **Revisão 2026-10-18.** A primeira versão desta seção tinha 13 telas, espelhava a estrutura interna do Atlas (territórios, escopos, nodeKey, tiers, bandas, negações, saúde do CAS) e mostrava cadeados de fase na tela. O owner rejeitou com razão: o usuário não sabe o que é nada disso e não precisa saber. Esta versão parte do que a pessoa quer fazer.

### 5.1 O modelo mental

O Atlas, para quem usa o Orchestra, responde a três perguntas:

1. **O que os meus agentes sabem sobre este projeto?** É a Visão geral e o Conhecimento, navegado por área e pasta do código.
2. **Isso ainda é verdade?** Cada item mostra um estado simples, verificado contra o código atual.
3. **O que precisa de mim?** É uma fila única em Revisar, com as decisões que só uma pessoa toma.

Todo o resto (ids, tiers, hashes, bandas, retrieval) é mecanismo, e a UI não fala dele.

### 5.2 Vocabulário: o que a UI diz e o que isso é no Atlas

| Na tela | No Atlas | Por quê |
|---|---|---|
| **Regra** | fato governante, tier T1, ratificado | É o que os agentes seguem |
| **Cuidado** | fato no slot `gotcha` / `rationale` | "Atenção ao mexer aqui" |
| **Sugestão** | banda advisory, T2, não ratificada | Proposta de um agente; os agentes a tratam como palpite |
| **Regra crítica** | T0, ratificação humana | Só uma pessoa confirma ou muda |
| **Em dia** | FRESH, e HOLDS quando há checagem | — |
| **Código mudou** | drift mecânico: a âncora mudou, o claim segue valendo | Um clique atualiza a referência (re-ground) |
| **Não vale mais** | drift semântico, BROKEN | Bloqueia; alguém decide |
| **Ainda não verificado** | freshness ausente (`[?]`) ou STALE | Nunca vira "Em dia" por omissão |
| **Área** / **Pasta** | território / escopo | Nomes que qualquer dev entende |
| **"Se este código mudar, confira também"** | `dependent`, raio de impacto | Substitui o grafo |
| **"Quem disse"** e **Histórico** | proveniência, ratificação, linhagem de supersede | — |
| **Confirmar / Editar / Remover / Descartar** | ratificar e reemitir via `atlas-emit`, ligar via `atlas-link`, supersede (nunca apagar) | Toda ação é reversível ("Desfazer") e fica no histórico |
| **Memória do agente** (em Agents) | Memory por seat: orientation, lições de task/pr, logbook | Aparece só para backend, jimmy e archie, que têm `atlasMemory` |

Ids, tier, tipo de checagem e commit ficam num bloco **"Detalhes técnicos"**, fechado por padrão, no painel de detalhes.

### 5.3 Telas

O mock interativo está em [`mock/`](mock/README.md) e mostra o estado final, sem marcas de fase. O faseamento está na seção 8.

| Tela | O que tem | Fonte no Atlas |
|---|---|---|
| **Visão geral** | Três números (quanto sabem; quanto está em dia; quanto precisa de você), "Precisa da sua atenção", cartões por área com a saúde de cada uma, e mudanças recentes em linguagem natural | `query` / `own` agregados, `reconcile`, histórico |
| **Conhecimento** | Tudo, por área ou por pasta, agrupado por pasta. Filtros por tipo (Regras, Cuidados, Sugestões) e "Precisa de atenção", mais busca. As áreas e as pastas da área aberta ficam no trilho lateral, com um ponto de saúde | `own <scope>` por pasta; `territories` para as áreas |
| **Detalhes** (painel e página) | O texto; o estado explicado numa frase; onde vale, com o código e as linhas; quem disse e quem confirmou; o histórico; "Se este código mudar, confira também"; itens relacionados; ações. Detalhes técnicos fechados | `node`, `doctor why`, `doctor archive`, `relations`, `dependent` |
| **Revisar** | Quatro abas com contagem: **Não vale mais** (antes e depois do código; Atualizar regra / Remover / "Corrigir o código em vez disso", que abre uma sessão com o agente), **Precisa da sua confirmação** (regras críticas), **Sugestões** (Confirmar / Editar / Descartar) e **Código mudou** (Atualizar, ou "Atualizar todas"). Tudo com Desfazer | `reconcile`, staging do `mine`, portas governadas |
| **Agents › Memória** | Por agente: "Trabalhando agora", "Lições aprendidas" (com "usada há…", "some em N dias" e Esquecer) e "Notas de PRs passados". Agentes sem memória dizem isso claramente | `memory-header`, `memory-recall` |
| **Chat** | Chips de citação inline ("regra · prompt.ts"; em vermelho quando a regra não vale mais) que abrem os detalhes ao lado. "Usou N coisas do Atlas" lista o que entrou e o que ficou de fora. "Salvo na memória do Backend" quando o agente grava memória | recibos `atlasContext` e `atlasMemory` nos tool-parts |
| **Atlas desligado / lendo o código** | "Ativar o Atlas neste projeto", com uma frase do porquê. "Lendo o código… cerca de 5 s" com esqueleto, sem número inventado | `AtlasContextHeld`, build do índice |

**O que saiu da UI, e por quê:**

- **Territórios como tela própria e a matriz:** viraram "Áreas", no trilho e na Visão geral.
- **Negações e abstenções:** uma negação provada é só mais uma Regra ("O client nunca importa o core"). Abstenção não é algo que a pessoa decide.
- **Grafo de relações:** virou a lista "Se este código mudar, confira também", que responde à pergunta real.
- **Saúde do store e verify-store:** são diagnóstico. Se forem necessários, vão para Configurações ou para o CLI.
- **Propostas e Ratificação como telas separadas:** foram unificadas em Revisar.
- **Campos degenerados, trigger, diff de versões e cadeados de fase:** o que não existe não aparece.

### 5.4 Navegação

- **Sidebar:** um item "Atlas", logo abaixo de Workflows (D1), com a contagem de Revisar em âmbar quando houver algo.
- **Trilho do capítulo:** Visão geral · Conhecimento · Revisar (com contagem), depois ÁREAS com um ponto de saúde em cada. A área aberta expande as suas pastas. No rodapé: "Verificado há 12 min · Verificar de novo".
- **Detalhes ao lado:** abrem sem sair da lista (`?item=<id>` na URL); `j`/`k` passam para o próximo, `Esc` fecha. Abaixo de 1280 px o painel fica por cima da lista; abaixo de 760 px ocupa a tela. "Abrir como página" dá um link próprio.
- **Toda tela é uma URL:** voltar, recarregar e compartilhar caem no mesmo lugar.
- **Busca `⌘K`:** encontra conhecimento, áreas, pastas e memória de agentes, além de ações.
- **Atalhos:** `g o`, `g k`, `g r`, `g a`, `g c`, `/` e `?`.
- **Breadcrumb pela estrutura:** Atlas › Conhecimento › Área › pasta.
- **Chat → detalhes** pelos chips; **Agents → Memória** por uma aba própria; e a memória aponta para o Atlas ("o conhecimento compartilhado mora no Atlas").

---

## 6. Invariantes de UI (viram critérios de aceite)

1. **Linguagem de produto na superfície.** Nenhum termo interno (nodeKey, tier, banda, seal, freshness, hash) aparece fora de "Detalhes técnicos".
2. **Confirmado e sugerido nunca se parecem.** Sugestões (T2) têm forma visual própria (borda tracejada, texto atenuado, "sugerido por") e nunca aparecem como Regra (`contracts/src/pack.ts:22-26`).
3. **Estado é sempre ícone + palavra**, nunca só cor. Um estado ausente aparece como "Ainda não verificado", nunca como "Em dia" (`query.md:46-48`).
4. **O que não existe não aparece.** Nada de campo degenerado, modo vazio ou cadeado de fase. Atlas desligado ou lendo o código são estados explícitos, nunca zero.
5. **Os números batem entre si.** Toda contagem é derivada da mesma lista que a tela mostra.
6. **Toda ação é reversível e fica registrada.** Desfazer aparece na hora; remover é supersede, nunca apagar. Regra crítica só é confirmada por uma pessoa, e a UI nunca aprova sozinha (S20).
7. **Estado operacional só de fonte real** (ROOT-INV-04). O renderer nunca lê `.atlas/`; tudo passa pelo client gerado.
8. **Memória ≠ Conhecimento.** A memória é do agente e mora em Agents; o conhecimento é do projeto e mora no Atlas.

---

## 7. A costura de dados

```
modules/atlas/packages/*  ──(gera)──▶  @orchestra/atlas-boundary  (nova entrada ./knowledge-read)
                                                │ só packages/orchestra importa
packages/schema/src/atlas/*.ts   DTOs (Schema.Struct): Pack, FactRow, FactDetail, DriftItem, Territory…
packages/core/src/atlas.ts       AtlasRead.Service — porta (Context.Tag + interface), sem implementação
packages/protocol/src/groups/atlas-*.ts   HttpApiGroup "server.atlas*" (GET, com location middleware)
packages/server/src/handlers/atlas-*.ts   handlers que dão yield em AtlasRead.Service
packages/orchestra/src/maestro/atlas-read.ts   Layer que implementa a porta com o boundary
packages/client/src/contract.ts   groupNames → bun run generate
packages/app-shell/src/orchestra/atlas/{api,model,contract}.ts   store da view, request owner, Data<T>
```

**Decisões e porquês:**

- **Porta no Core, implementação no `packages/orchestra`.**
  - O Server só depende de core, protocol, relay e schema (`packages/server/package.json:15-22`), e só `packages/orchestra` pode importar o boundary.
  - Declarar o service no Core e fornecer a Layer no `packages/orchestra` respeita os dois sentidos de dependência e a regra de mão única do Atlas.
- **Entrada nova no boundary.**
  - A leitura de Knowledge (`query`, `own`, `node`, `relations`, `negations`, `doctor why/archive/cas/index`, `territories`, `reconcile`) passa a ser exportada num bundle gerado, ao lado das quatro entradas atuais.
  - Isso é uma mudança no Atlas, com o gate do job `atlas` e o `--check` do boundary na CI (`test.yml:389-393`).
  - Nenhum parser do Atlas é duplicado no host.
- **Cache do índice no servidor.**
  - Um `atlas query` frio leva de 4,9 a 6,2 s, porque o custo é montar o índice (`docs/adr/ADR-0002-freshness-watermark.md:86-91`); a checagem de drift já aquecida leva cerca de 11 ms.
  - O servidor mantém um read model composto por `(projectID, worktree, HEAD sha)`, montado de forma preguiçosa e reaproveitado entre requests.
  - A UI tem um estado explícito "construindo índice", não um spinner infinito.
- **Sem push no Atlas.** O Atlas não emite eventos. O servidor invalida o read model quando o HEAD ou a worktree mudam e publica um evento de instância `atlas.updated`. A UI invalida as queries, como o Relay já faz.
- **Escritor único.** Ler não conflita com escrever. Quando a escrita entrar (W3), ela usa o mesmo caminho das ferramentas (`createNativeMemory` e as portas governadas) e respeita "um escritor por raiz".
- **Nada de MCP stdio nem de processo filho.** Tudo roda no processo, pelo bundle; o allowlist de spawn não cresce.

**Volumes:**

- O tamanho de quase tudo já é limitado: pack 2000, own 1500, finer 16, rules 12, header de cerca de 400 + 250 + 500 tokens. Isso dá telas pequenas por natureza.
- As listas sem limite são archive, relations (cerca de 6 mil arestas no Atlas sobre si mesmo), `doctor cas` (cerca de 1300 objetos) e o resultado de `promote`. Elas pedem paginação no servidor e `solid-virtual` no cliente.
- Contagens típicas: de 76 a 657 fatos por repositório (`BENCHMARKS.md:107-108`).

---

## 8. Fases sugeridas

Cada fase é uma fatia que pode ir para produção, com os gates do `specs/orchestra-visual/CHAPTERS-SCOPE.md`: só dados reais; estados de loading, vazio, erro e indisponível; teclado; escuro e claro; RTL; E2E pelo sidebar; isolamento ao trocar de perfil. A fase de uma tela não aparece na UI: uma tela entra quando a fase dela entra.

| Fase | Entrega | Pré-requisito |
|---|---|---|
| **W0 — Contrato e mock** | Mock aprovado (este, depois da revisão do owner) congelado com hashes; `UI-INVENTORY.md`, `UI-DELIVERY-PLAN.md`, `contract.ts` e registro de paridade | D1–D5 |
| **W1 — Ler** | Entrada `knowledge-read` no boundary, a porta e a Layer, os grupos Protocol e Server, o client gerado. Visão geral, Conhecimento, Detalhes, e os estados desligado e lendo o código | W0, D3 |
| **W2 — No contexto** | Chips de citação e "Usou N coisas do Atlas" no Chat; aba Memória em Agents | W1, D4 |
| **W3 — Revisar** | Revisar com as quatro abas e Desfazer; Editar e Remover nos detalhes. Escrita só pelas portas governadas, com a pessoa como ator | W1, D2; leitura "listar staging" no Atlas para as sugestões vindas do `mine` |

**Processo (copiar o do Actions):**

- slices por arquivo, com dono;
- `contract.ts` congelado antes das views;
- views `lazy()`;
- store por view, com um request owner que aborta leituras velhas;
- testes unitários ao lado do código, `test-browser`, Playwright `e2e/orchestra/chapter-atlas.spec.ts` e `packages/server/test/atlas-http.test.ts`;
- uma entrada na `orchestra-screenshots/visual-matrix`;
- testes só por `bun run test:ci`, nunca na máquina local.

**O que deu errado no Actions e que já entra como teste aqui:**

- todas as linhas V da paridade ficaram em GAP;
- estados internos crus apareciam para o usuário;
- diálogos ficavam fora do centro;
- o breadcrumb ficava preso.

---

## 9. Decisões do owner

| # | Pergunta | Recomendação |
|---|---|---|
| D1 | Onde o Atlas fica no sidebar e com que nome | Abaixo de Workflows, com o rótulo "Atlas" |
| D2 | A UI escreve no Atlas? | Sim, em Revisar e nos Detalhes (W3), só pelas portas governadas e com a pessoa como ator; regra crítica só humana |
| D3 | A entrada nova `knowledge-read` no boundary (é mudança no Atlas) | Sim. Sem ela não existe Conhecimento na UI |
| D4 | O estado real da Memória (README vs card da campanha 11) e quais agentes aparecem | Corrigir o README e o `classes.md` antes; mostrar backend, jimmy e archie, como no runtime |
| D5 | O mock | A segunda versão, em linguagem de produto, está em [`mock/`](mock/README.md). Falta a sua aprovação visual antes de congelar |
| D6 | O vocabulário da seção 5.2 (Regra, Cuidado, Sugestão; Em dia, Código mudou, Não vale mais) | Aprovar ou ajustar antes da W0, porque ele vira o i18n |

---

## Apêndice A — pontos de extensão (arquivo por arquivo)

| Preocupação | Arquivo |
|---|---|
| Entrada no sidebar | `packages/app-shell/src/orchestra/navigation.ts:6-26` (+ ícone em `sidebar.tsx:41-67`) |
| Registro da página | `packages/app-shell/src/orchestra/chapter-route.tsx:19-36` |
| Paleta | `packages/app-shell/src/orchestra/shell/navigation-commands.tsx` |
| Copy (i18n) | `packages/app-shell/src/i18n/orchestra-chapters/atlas.ts`, mesclado em `i18n/orchestra.ts` |
| Breadcrumb | `crumbs` em `navigation.ts:29` + `setCrumbTrail` (`orchestra/crumbs.tsx:7`) |
| Kit visual | `packages/app-shell/src/orchestra/chapters/kit.css` / `kit.tsx` |
| Inspector e grafo de referência | `packages/app-shell/src/orchestra/actions/graph.tsx`, `layout.ts` |
| Árvore | `packages/app-shell/src/components/file-tree-v2.tsx` |
| Código e diff | `@orchestra/session-ui/file`, `diff-changes-v2` |
| Seção atual do Atlas na UI | `packages/app-shell/src/pages/session/orchestra-governance-data.ts:178-186` |
| DTOs | `packages/schema/src/atlas/` (novo); já existem `atlas-knowledge.ts` e `config-maestro.ts:8` |
| Porta | `packages/core/src/atlas.ts` (novo) |
| Protocol | `packages/protocol/src/groups/atlas-*.ts` + `api.ts` |
| Handlers | `packages/server/src/handlers/atlas-*.ts` + `handlers.ts` |
| Implementação | `packages/orchestra/src/maestro/atlas-read.ts` (novo), ao lado de `atlas-source.ts` |
| Boundary | `modules/atlas/boundary/script/build.ts:9-15` |
| Client | `packages/client/src/contract.ts` → `bun run generate` |

## Apêndice B — fontes externas

- Swimm, documentação acoplada ao código e auto-sync: https://docs.swimm.io/features/keep-docs-updated-with-auto-sync/
- GitHub Copilot Memory: https://docs.github.com/en/copilot/concepts/agents/copilot-memory
- Claude Code memory: https://code.claude.com/docs/en/memory
- Letta ADE: https://docs.letta.com/guides/ade
- Sourcegraph code navigation: https://sourcegraph.com/docs/code-navigation
- Backstage catalog graph: https://roadie.io/md/docs/integrations/catalog-graph/
- Linear, redesign da UI: https://linear.app/blog/how-we-redesigned-the-linear-ui
- van Ham & Perer, "Search, Show Context, Expand on Demand": https://dig.cmu.edu/publications/2009-doigraphs.html
- Ghoniem, Fekete & Castagliola, matriz vs nó-aresta: https://hal.archives-ouvertes.fr/hal-00343819
- NN/g, breadcrumbs: https://www.nngroup.com/articles/breadcrumbs/
- Padrão de citações em UI de IA: https://aiuxplayground.com/pattern/citations
