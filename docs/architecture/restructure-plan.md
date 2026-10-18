# Plano 0–100: monólito modular Orchestra

**Prioridade principal: preservar comportamento, dados, contratos públicos e distribuição em cada etapa.** A organização do repositório melhora ao redor do produto existente; não autoriza uma reescrita do produto.

Auditoria ampla: `dev@49ab2cec4f77bdbb33314503da4d85fcd075114e`, em 2026-10-11. Delta de `dev` revisado até `5e7d3eb2d2cf1abb50e208466ff09fd185cb8445`: rendering Agent/Task e novos contratos de tree-sitter/Nix incorporados. O [mapa de módulos e dependências](monolith-map.md) acompanha este plano. Esta entrega é um plano: os marcos abaixo ainda precisam de implementação e qualificação. A auditoria foi de código, manifests e leitores; não executou a matriz de testes.

Os números 0–100 são **marcos de conclusão**, não estimativa de horas, porcentagem por quantidade de arquivos ou promessa de cronograma. Um marco só fecha quando sua evidência fecha. Nenhum teste oferece garantia matemática contra todo defeito; o contrato operacional é não avançar com regressão, diferença inexplicada ou verificação necessária ausente.

## 1. Resultado desejado

- Uma pessoa encontra cada responsabilidade pelo nome do módulo e seu `README.md`.
- Entradas executáveis, bibliotecas, capacidades do produto, código nativo, ferramentas e documentação têm lugares distintos.
- Cada responsabilidade tem um dono e uma implementação canônica; compatibilidade permanece explícita enquanto necessária.
- Interfaces, dependências, assets, persistência e lifetimes são visíveis e verificáveis.
- Pastas não carregam campanhas antigas, sessões, dumps, planejamento duplicado ou scaffolds abandonados.
- Documentação viva, fixtures, goldens, corpus, licenças e assets de runtime permanecem completos.
- Comandos de desenvolvimento, testes, geração e empacotamento continuam funcionando durante a migração.

## 2. Regras invioláveis de preservação

1. **Uma mudança conceitual por PR.** Relocar uma pasta, renomear um pacote, trocar gerenciador, alterar uma API e aposentar implementação são operações diferentes.
2. **Mover a implementação existente antes de substituí-la.** Facades temporárias reexportam os mesmos valores e serviços; não criam uma segunda instância de estado.
3. **Nenhuma remoção baseada apenas em nome, idade, extensão ou ausência de import estático.** Procurar leitores de disco, globs, generators, parsers, fixtures, configuração, publicação e consumidores externos.
4. **Nenhuma mudança funcional escondida como limpeza.** Fixes necessários têm PR e prova próprios. Namespaces de permissão, rotas, IDs, argumentos, headers, erros, variáveis de ambiente e defaults são contratos.
5. **Dados do usuário ficam fora da reorganização.** Preservar caminhos XDG, `ORCHESTRA_DB`, nomes de bancos, migrações, chaves de stores, IDs de perfil/janela/Session e compatibilidade de leitura.
6. **Rollback permanece viável.** Não combinar reorganização com migração destrutiva de dados. Qualificar upgrades e retorno ao artefato anterior usando cópias restauráveis; nunca experimentar no banco real.
7. **Compatibilidade é inventariada, não presumida.** Imports, wire types, plugins, SSE, CLI, assets e artefatos publicados entram no registro antes de qualquer movimento.
8. **Testes precisam executar a propriedade e o alvo corretos.** Cache, skip, `unrun-busy`, fixture isolada e typecheck não equivalem a prova de runtime empacotado.
9. **Gates não podem enfraquecer.** Mudanças de parser, inventário, exclusões ou ambiente exigem demonstração de alcance preservado ou ampliado e controles que falham diante de defeitos reais.
10. **Baseline precisa ser atualizada antes de integrar cada PR.** Registrar intervenções de outras sessões; não carregar diagnóstico antigo como fato atual.

### Isolamento, snapshot e rollback de dados

- **Cópia de DB não isola o runtime.** Antes de qualquer import/launch, fixar HOME/USERPROFILE, XDG, APPDATA/LOCALAPPDATA, temp, Electron `userData`/`sessionData` e stores no sandbox; desabilitar herança de credentials ou apontá-la a uma fixture isolada. Verificar os paths efetivos do candidate e predecessor. O padrão existente em `packages/cli/script/runtime-proof.ts:100–119` é ponto de partida, não qualifica automaticamente Electron.
- Credentials reais copiadas só entram em verificação offline. Auth/refresh live usa identidade dedicada de teste: um refresh token copiado pode consumir a mesma identidade remota e invalidar o login instalado. Testes não atingem o `auth.json`, keychain, bancos ou daemon reais.
- Snapshot precisa de fronteira consistente: flush de writes pendentes de drafts/stores, quiescência de escritores no runtime isolado ou backup transacional suportado, incluindo WAL. Não copiar apenas o arquivo SQLite principal. Preservar e comparar IDs/sequências de event/inbox, relações document–blob, hashes de blobs, perfis e stores.
- Qualificar casos com input committed somente em WAL e draft com blob/persistência pendentes. Pausa/flush de aplicação real exigiria autorização específica; não acontece como efeito colateral de uma prova.
- Prova de downgrade: **predecessor escreve → candidate lê/escreve → relaunch → predecessor lê/escreve o mesmo dataset pós-candidate → candidate reabre**. Conferir retries, steer/queue pendentes, seals, drafts/blobs, perfis e credentials.
- **Rollback de binário não é restauração de desastre.** O rollback deve preservar writes feitos depois do upgrade; voltar ao snapshot anterior apagando esses writes reprova a qualificação. Testar coexistência de canais/versões quando suportada e as recusas/read-only já existentes quando não suportada.

### Contratos críticos que não podem mudar por acidente

| Área | Preservar | Prova exigida |
| --- | --- | --- |
| Session | Admissão durável antes de wake; retry exato; delivery steer/queue; `resume:false`; projeção e replay | Inbox, runner, concorrência, interrupção, histórico e retry |
| Effect | Coordenador process-global; runner/LLM/tools/permissões/filesystem Location-scoped; MemoMap e finalizers | Identidade de serviços, isolamento entre Locations, cancelamento e shutdown |
| System Context | Álgebra/registry em `src/system-context`; produtores no domínio observado; história/epochs Session-owned | Snapshot, continuação durável e indisponibilidade versus remoção |
| Modelo/tools | Uma chamada explícita de stream por turno; ordem de hooks; autoridade e settlement; budgets | Requests e tool results correlacionados por IDs, replay e negativa de permissão |
| Persistência | Esquemas/journals; arquivos; IDs; locks; canonicalização; bytes assinados | Base antiga copiada, migração idempotente, integridade, leitura pelo artefato anterior |
| API/SDK/plugins | Exports, schema identity, rotas/queries/errors/auth, SSE, versões públicas, loading de plugins | Contratos de ambas as gerações e consumidores reais |
| UI | Estado/hydration, drafts, tabs, navigation, portals, locale, RTL, temas e assets | Browser/TUI e renderer empacotado; mesmas interações e resultados |
| Desktop/Dock | IPC/sender checks; perfis/generations; ownership; credentials; recursos; processos | Main/preload/renderer, ferramentas, ciclo de vida e viewer/workspace |
| Native | ABI, target/libc, addon + supervisor, tree-sitter/WASM, assinatura e colocação | Artefato real, manifest/digest, import/load/spawn/stop em cada alvo exigido |
| Atlas/Relay/Lean | Corpus/Own; oracle/goldens/ledger; pin Lean; origem versus projeção | Gates próprios, bundles, provenance, paridade e resultado persistido |
| Engine Claude | Estado pausado e opt-in existente; preset e ordem de autorização | Guard de aprovação e lifecycle, sem ativação pela reorganização |

As fontes concretas e limitações atuais dessas provas estão no [mapa](monolith-map.md).

## 3. Estrutura alvo

```text
apps/                         pontos de entrada e distribuição
  desktop/                    Electron main/preload/renderer e empacotamento
  web/                        bootstrap web, Vite e hospedagem
  cli/                        CLI atualmente empacotada e serviço V2
  orchestra/                  entrada legada/composição, até convergência qualificada
  storybook/                  workbench de componentes

packages/                     bibliotecas e infraestrutura TypeScript
  schema/  protocol/  core/  server/  client/
  sdk/  sdk-next/  plugin/     SDK legado fica compatível enquanto necessário
  llm/  codemode/  effect-drizzle-sqlite/  effect-sqlite-node/
  app-shell/                  composição UI reutilizada por web e desktop
  ui/  session-ui/  tui/  util/

modules/                      capacidades/coordenadores do produto
  maestro/                    coordenação, contratos e playbooks
    arsenal/                  pacote existente; mantém identidade inicial
  continuity/                 memória/continuidade de Session
  session-engine/             orquestração legada específica do produto
  engine-adapters/            contratos de engines na composição de produto
    claude-code/              estado pausado e preset existentes preservados
  acp/                        adapter ACP, sem assumir orchestration de Session
  janitor/                    manutenção/background do produto
  relay/                      engine, profiles, oracle e goldens independentes
  atlas/                      workspace interno coeso, sem cópia de outro scaffold
    packages/                 submódulos @atlas/* existentes
    boundary/                 bundles públicos consumidos pelo Orchestra
  app-dock/                   contratos e adapters de browser/Linux/native
  specialists/
    backend/                  assets de skills; README fora da árvore de skills
    archie/                   assets de authoring; IDs existentes preservados
  backend-toolkit/            receitas/packs/assets; aquisição de plataforma fica Core-owned
  capability-assets/          catálogo/provenance

native/
  omni/                       Cargo/NAPI, supervisor, conformance e QA

tooling/
  build/                      pacote @orchestra/script e ferramentas de entrega
  httpapi-codegen/            generator existente
  http-recorder/              suporte real de testes/cassettes
  ci/  guards/  scripts/  nix/
  modules.json                registro de papéis, owners, assets e comandos

assets/brand/                 identidade visual
vendor/                       arquivos imutáveis, pins, notices e hashes
docs/
  architecture/               mapa e plano canônicos
  requirements/              contratos vivos que não precisam de cwd próprio
  decisions/                  decisões vigentes, não diário de sessão
  development/               setup, testes e desenvolvimento
  operations/                 instalação, recuperação, manutenção e archive index

.github/                      workflows/actions efetivamente usados pela raiz
.orchestra/                   configuração de dogfooding descoberta pelo produto
patches/                      patches versionados de dependências
README.md  AGENTS.md  LICENSE  SECURITY.md
package.json  bun.lock  turbo.json  tsconfig.json  flake.nix ...
```

### Decisões que evitam uma nova bagunça

- `modules/` substitui o nome provisório `slices/`: a origem como repo separado não determina a camada arquitetural.
- Omni é infraestrutura nativa; `core → Omni` não é erro por si só. Não inventar um port para apagar uma seta legítima.
- O tarball Lean continua imutável em `vendor/`, com sua API `hugr-lean/core`. Sua substituição por workspace só ocorre em pacote de trabalho próprio, pela revisão exata aprovada.
- Atlas conserva seus submódulos reais. Não achatar um DAG válido apenas para reduzir a profundidade visual.
- `packages/app` hoje é app e biblioteca. O alvo separa `apps/web` de `packages/app-shell`, mantendo inicialmente o nome público `@orchestra/app` e sua facade. Desktop não passa a importar um app executável.
- Não se cria um pacote npm para cada diretório. Module READMEs e fronteiras internas bastam quando não há distribuição, dependência ou toolchain independente.
- `effect-sqlite-node` e outras suspeitas permanecem inventariadas até provar os consumidores e o caminho de substituição. Não são declaradas mortas por este plano.
- Workspaces npm/Cargo/Python deliberados são domínios de toolchain registrados, não scaffolds abandonados. Unificar gerenciadores não é condição de organização se uma fronteira qualificada permanece explícita.
- Nomes públicos de pacotes, namespaces `@atlas/*`/`hugr-*`, binários e IDs não mudam junto com o caminho físico.
- Compatibilidade fica em `compat/` dentro do dono, com contrato e prazo de revisão; não escondida numa segunda árvore de produto.
- O registro descobre manifests reais e valida ambos os sentidos. Fixtures, tarballs e workspaces internos têm domínio explícito; não entram como pacotes de produção por acaso.

## 4. Contrato de scaffold por módulo

Cada módulo tem um `README.md` curto e útil, na raiz lógica, cobrindo:

1. Propósito, owner por papel e o que o módulo não possui.
2. Entradas públicas, consumidores e exemplos mínimos de uso.
3. Dependências permitidas e limites internos relevantes.
4. Assets, schemas, generators e arquivos lidos dinamicamente.
5. Persistência, identidade, scope/lifetime e compatibilidade.
6. Comandos reais de desenvolvimento, testes, geração e entrega.
7. Ponte para contrato vivo/decisão e limitações de verificação atuais.

O scaffold é mínimo, não um conjunto de pastas vazias obrigatório:

```text
modules/relay/
  README.md
  package.json                já é pacote; um módulo de assets pode não ser
  src/
    authoring/  arm/  gate/  hook/  ledger/
    index.ts                  facade real, sem barrel que ativa tudo
  test/                       testes TS, fixtures e goldens
  tests/                      oracle Python, enquanto necessário
  profiles/                   dados de runtime
  docs/                       somente corpus/guia consumido localmente
  bin/  lib/                  oracle independente preservado
```

- Organização feature/domain-first; adapters e ports somente onde existe uma fronteira real.
- Código público não depende da organização interna do vizinho. Mapear exports existentes antes de fechá-los.
- Testes de integração e assets podem precisar de profundidade extra; a regra é profundidade com significado, não limite arbitrário.
- `README.md` de backend/Archie fica fora de `skills/`: o scanner e os testes impõem conteúdo exato naquela árvore.
- Docs locais são exceção legítima quando um parser, distribuição ou manutenção do módulo depende delas. A navegação global aponta para elas, sem duplicar o conteúdo.

### Direção de dependências

- `apps` fazem composição e dependem de bibliotecas/módulos; runtime reutilizável não importa um app.
- `schema` é browser-safe e fundação; `protocol` e `core` dependem de schema; `server` compõe core/protocol.
- `client` runtime depende de schema/protocol, nunca core/server. Dev/test dependencies são avaliadas separadamente.
- `sdk-next` é a composição permitida de client/core/server.
- UI e app-shell usam contratos/browser-safe utilities, não backend runtime.
- Ao mover o helper atual `task-tool` para util, preservar `task`/`Agent`/`Task` e precedência de `metadata.claudeCodeDispatch.seat` sobre `input.subagent_type`; o rendering existente não é uma feature a reinventar.
- Módulos de produto usam contratos e serviços de plataforma. Hooks/registries necessários à integração com Relay/Maestro vivem em ports pequenos definidos pelo dono apropriado.
- Infraestrutura nativa, LLM e parsers podem ser dependências legítimas da plataforma. A classificação depende da responsabilidade, não do histórico de importação.
- Dependências entre módulos são explícitas e sem ciclos de runtime. Um import de tipo não prova dependência executável nem autoriza uma camada indevida.

## 5. Limpeza completa de documentação e material acumulado

**Escopo inclui specs, tasks, handoffs, planos de agente, dumps, research, evidência, screenshots, logs, benchmark output e scaffolds antigos.** Nada disso recebe permanência automática por estar no Git.

O inventário cobre **todo** material acumulado, inclusive fora dos lotes prioritários. Os lotes definem a ordem, não o limite do escopo. A conclusão reconcilia cada item com remoção comprovada, archive restaurável ou necessidade vigente identificada; nenhum item fica sem revisão por não aparecer numa lista inicial.

| Classe | Destino final | Condição |
| --- | --- | --- |
| Markdown/JSON/schema/prompt/skill de runtime | Assets do módulo dono | Mesmo conteúdo, leitor, lookup e pacote distribuído |
| Contrato/requisito/ADR vigente | `docs/requirements`, `docs/decisions` ou corpus local necessário | Cláusulas e traceabilidade preservadas; fontes não inventadas |
| Guia de usuário/dev/operação | README ou seção canônica em `docs/` | Uma versão vigente; comandos e links qualificados |
| Golden/oracle/fixture/cassette | Testes do dono | Paridade, provenance e regeneração preservadas |
| Research, task card, handoff e plano encerrados | Archive durável; apenas índice mínimo no repo | Decisões vigentes e obrigações abertas extraídas primeiro |
| Log, screenshot, dump, tarball de campanha | Archive durável por revisão/campanha | Manifest e restauração completa verificados |
| Scratch/duplicata/boilerplate comprovados | Remoção | Prova de não-consumo e ausência de conteúdo/obrigação únicos |
| Item incerto ou campanha ativa | Mantido temporariamente com owner e revisão | A incerteza bloqueia a remoção, não fica escondida |

### Protocolo por lote de limpeza

1. Listar arquivos exatos, owner, classe, leitores e revisão fonte. Separar tracked de WIP/untracked/ignored de outras sessões.
2. Localizar imports **e** leitores dinâmicos, globs, headings, nomes de arquivos, referências, generators, policy/licensing e distribuição.
3. Extrair decisões/obrigações ainda válidas para o documento canônico, citando as cláusulas existentes. Fechar duplicatas em vez de criar outro corpus paralelo.
4. Para arquivo histórico: publicar/armazenar em destino durável com retenção acordada. Artifact efêmero de CI não é sozinho o arquivo final.
5. Registrar locator, source SHA, hashes, modes/symlinks, membro/parte/ordem, licença, relação com receipts, omissões e ferramentas de restauração.
6. Restaurar em destino vazio a partir do archive, comparar conteúdo completo e provar falha para membro/parte ausente ou corrompido.
7. Reapontar consumidores e links; executar checks dos readers/corpus/packaging afetados. Só então remover originais daquele lote.
8. Confirmar que PR não carregou WIP de outro agente, archives duplicados ou gerados inesperados.

### Lotes prioritários

- `specs/orchestra-visual/handoff/archives`, logs e screenshots históricos: archive preserva mock aprovado, receipts, manifests e restore utility juntos.
- `specs/backend-specialist/research`, `delivery-plan`, `session-*`: separar contratos/acceptance atuais e obrigações antes de arquivar história.
- `packages/orchestra/specs/context-continuity-*`, `BENCHMARK.md`, `bench-*` e `benchmark-evidence`: distinguir harness, gold/probes/scorers e resultados históricos; não apagar a infraestrutura de medição junto dos dumps.
- `packages/desktop/docs/plans` e Atlas `SESSION-STATE`/campaign notes: aposentar trechos superseded depois de reconciliar contratos e trabalho ainda aberto.
- Relay `docs/roadmaps` e demais históricos locais: classificar também material com doc-index gerado e link checker; atualizar esses leitores em vez de preservar a campanha por inércia.
- `CONTEXT.md`, specs vivos e guias: relocar só depois de atualizar prompt fallback, parsers e testes que conhecem seus caminhos.
- Casca importada: Omni `.github` serve o espelho; Atlas `.github/workflows/ci.yml` é lido por fitness test; licenças Atlas/Omni/Arsenal/Lean não são duplicatas descartáveis.
- Worktrees, branches e dados locais acumulados exigem inventário de owner/processo/estado e campanha separada; nunca `git clean` ou prune amplo como parte da limpeza documental.

## 6. Execução 0–100

### 0–10 — Congelar a realidade e provar recuperabilidade

| WP | Entrega | Saída verificável |
| --- | --- | --- |
| 00-A | Inventário de módulos/exports/consumidores/assets e baseline de revisão | Todos os domínios do mapa cobertos; discovery não vazio e sem itens órfãos |
| 00-B | Matriz de comportamento, contratos, dados e artefatos atualmente suportados | Sandbox/paths/identidade de auth isolados antes de executar; checks do baseline com failures/skips/limitações nomeados |
| 00-C | Snapshot consistente, restauração e upgrade/downgrade em cópias isoladas | WAL e writes pendentes cobertos; igualdade de inbox/event IDs, document–blob e stores; writes pós-upgrade sobrevivem ao rollback |
| 00-D | Pinning de runtime/build/toolchains e plano de rollback | Artefato anterior recuperável; hashes e plataformas correspondem aos receipts |

Antes de fechar: medir startup, interação UI, memória em cenário delimitado e tamanho/tempo de entrega com workload fixo quando forem afetados. Guardar resultados fora do source tree. Não usar números antigos como baseline.

**Rollback:** abandonar branches de qualificação e usar artefato anterior; os dados reais não foram modificados. Uma falha existente é registrada e tratada fora do PR de reorganização; não vira nova exclusão de teste.

### 10–20 — Navegação, ownership e limites antes de movimentos

| WP | Entrega | Saída verificável |
| --- | --- | --- |
| 10-A | README raiz e READMEs dos módulos nos caminhos atuais | Cada responsabilidade, assets e comandos encontrados sem conhecer a campanha |
| 10-B | Registro de módulos/papéis/owners/commands e policy de dependências | Inventário real ↔ registro ↔ jobs/gates correspondem nos dois sentidos |
| 10-C | Guards de estrutura, imports/exports, arquivos grandes e higiene | Árvore válida passa; defeito de cada classe, discovery vazio e row ausente falham |
| 10-D | Exceções transitórias exatas, com owner, motivo e WP de resolução | Ledger não permite novo desvio nem entrada obsoleta; infra legítima não é waiver |

`turbo boundaries` é candidato para tags e dependencies. Antes de adotá-lo, provar o alcance com a versão instalada, inclusive type-only/dev imports, Atlas externo, exports e exceções. Um bridge para ledger ou verificação mais fina é uma mudança própria; não é funcionalidade presumida do Turbo.

**Rollback:** reverter docs/registro/gate daquele PR. Nenhum caminho de runtime mudou; nenhum guard existente perde alcance.

### 20–30 — Tirar lixo qualificado, sem mutilar memória técnica

| WP | Entrega | Saída verificável |
| --- | --- | --- |
| 20-A | Classificação arquivo a arquivo de todo material acumulado inventariado | Todos têm classe/owner/leitor/disposição; prioridade define somente a ordem; nenhum item sem revisão |
| 20-B | Archive durável e índice de recuperação enxuto | Restauração completa e controles de corrupção aprovados antes da remoção |
| 20-C | Remoção dos lotes históricos e duplicatas qualificadas | Readers, corpus, links e packaging afetados continuam corretos |
| 20-D | Retirada de boilerplate, scripts e casca realmente dispensáveis | Consumidor e alternativa de manutenção demonstrados; nenhuma obrigação órfã |

Não mover specs vivos nem aposentar Python do Relay neste marco. Não reescrever histórico Git. O objetivo é tirar o lixo da árvore ativa, com recuperação garantida, não perder provenance.

**Rollback:** restaurar caminhos originais pelo manifest/archive ou reverter o lote. Não misturar essa restauração com alterações funcionais.

### 30–40 — Ferramentas deixam de presumir `packages/<nome>`

| WP | Entrega | Saída verificável |
| --- | --- | --- |
| 30-A | Resolver por identidade/role para Bun, npm interno, Cargo, Python e assets | Alias atual continua aceito; ambiguidades/missing/malformed falham por nome |
| 30-B | `test:ci`/snapshot/cwd/preloads adaptados ao resolver | Testes nomeados executam exatamente; Python/mixed args mantêm seleção; upload/digest íntegros |
| 30-C | Build/version/playbook/skill/vendor/resource lookup explícitos | Dev, compiled CLI, Node server e Electron usam os mesmos assets aprovados |
| 30-D | Cache keys/inputs/outputs/gates/ignore/attributes/ledgers | Mutação de dependência/asset/hook/toolchain invalida cache correto; LF/hashes preservados |
| 30-E | Nix/fileset/workspace domains e paths centralizados | Avaliação + builds/closures nos hosts aplicáveis; hashes remedidos, sem dados stale |
| 30-F | Matriz de workflows, seletores e modo de qualificação completa | Nenhum job/gate desaparece; modo exact-SHA ignora previous-pass, força execução de testes e impede scope skips dos cenários required |

Manter wrappers para comandos antigos. Resolver por nome reduz acoplamento, mas não torna todo movimento uma mudança mágica de uma linha: Cargo, Nix, globs, históricos e packaging ainda exigem integração explícita.

O modo completo de 30-F pode reutilizar cache de dependências/build com inputs comprovados, mas não resultado de testes. Precisa produzir a lista de suites/lane executadas, forçar tarefas Turbo required, selecionar as provas Omni aplicáveis com `--release` e qualificar npm artifacts com `pack:true` quando esse pacote fizer parte da entrega. Missing/skip ou receipt de outro candidate bloqueia 90-A.

30-E também cobre o alias `nix/scripts/workspace-paths.json`, com Bun auto-install desativado. Preservar as três provas tree-sitter atuais (CLI, CLI staged e Desktop), imagens/load/parse reais, capture files e falha de completion quando o receipt tree-sitter falta; não regredir à verificação apenas do addon Omni.

**Rollback:** restaurar resolver e seus adapters, mantendo paths antigos ainda existentes; invalidar caches da versão revertida quando necessário.

### 40–50 — Módulos simples e documentação viva no dono correto

| WP | Entrega | Saída verificável |
| --- | --- | --- |
| 40-A | Relay intacto em `modules/relay` | TS/Node/Python parity, profiles, ledgers, generators e goldens aprovados |
| 40-B | Arsenal/capability-assets/brand nos destinos do mapa | Registry/lazy loading/provenance/consumer checks preservados |
| 40-C | Backend/Archie skill assets com lookups e embeds atualizados | Conteúdo/digests/build Bun+Node e packaging corretos; README fora de skills |
| 40-D | Contratos/guias vivos consolidados, um lote por parser/dono | IDs, links, headings, current obligations e readers preservados |

O movimento mantém versões, nomes, implementações, fixtures e toolchain. Diferenças de caminho em output canônico precisam de análise explícita; não se regeneram expectativas para acomodar uma regressão.

**Rollback:** reversão do mapping e adapters de lookup do mesmo WP. Archives e compat aliases continuam disponíveis.

### 50–60 — Omni e Atlas: movimentos especiais, sem troca de engine

| WP | Entrega | Saída verificável |
| --- | --- | --- |
| 50-A | Espelho Omni preparado para prefixes antigo/novo por commit | Replay, resume, rerun e tags históricos preservam árvores e SHAs esperados |
| 50-B | Omni em `native/omni`, root/QA workspaces intactos | Cargo cfg/cwd, NAPI, par completo, conformance, distribuição e mirror qualificados |
| 50-C | Preparação histórica, depois Atlas + boundary em `modules/atlas` | Prefix por revisão em Own/materializer/EARS antes do move; corpus e bundles byte-equivalentes; consumers corretos |
| 50-D | Pin/vendor comum resolvido sem substituir Lean/client | Arquivo/digests/licenses e comportamento do build idênticos |

Não apagar o LICENSE Apache-2.0 do Atlas; não remover `.gitattributes`, OWN-SNAPSHOT ou um workflow lido por gate sem migrar seu consumidor primeiro. Preservar as identidades `@atlas/*`, `hugr-omni` e `hugr-lean`.

Pré-condição de 50-C: readers Own, materializer e projeção EARS de CI resolvem o prefix Atlas por revisão. Preservar `sourceRevision`, `sourceBlobs` e ancestry; uma relocação não pode virar baseline vazio ou corpus novo. Provar leitura histórica old/new e recusa de cláusula não coamendada antes de mover a árvore.

**Rollback:** prefix resolver entende revisões anteriores e posteriores; retorno é um novo commit normal com mapping correto, não force-push. Distribuição anterior continua recuperável. Restaurar a árvore fonte sem alterar digests dos artefatos aprovados.

### 60–70 — Entradas, UI compartilhada e entrega estável

| WP | Entrega | Saída verificável |
| --- | --- | --- |
| 60-A | Fronteira app-shell/web no caminho atual, depois `apps/web` | Desktop importa mesma facade; UI/state/assets/workers/Vite/Tailwind e stories equivalentes |
| 60-B | CLI viva e composição legada em `apps/cli`/`apps/orchestra` | Todos os comandos, daemon, V1/V2 boot e entrypoints continuam suportados |
| 60-C | Desktop/Storybook em `apps` | Dev/build/resources/asar/signing/titlebar/preload/renderer corretos |
| 60-D | Tooling/Nix/scripts nos destinos finais, mantendo wrappers necessários | Todos os comandos documentados, workflows e artefatos continuam executáveis |

Não declarar `apps/orchestra` aposentado porque `apps/cli` existe. O inventário de capacidades decide a convergência posterior. Primeiro separar runtime reutilizável das entradas; depois relocar.

Este marco pode relocar o entrypoint com facades provisórias. A declaração de **apps finos** só fecha depois de 70-G: o mapa atribui todos os domínios legados a owners finais, ou justifica o código que realmente é bootstrap/wiring/distribuição.

**Rollback:** reverter cada movimento de entrada com suas refs de build. Não depender de um novo formato de dados para usar o binário anterior.

### 70–80 — Modularidade real por dentro, sem abstrações decorativas

| WP | Entrega | Saída verificável |
| --- | --- | --- |
| 70-A | Core dividido em domínios internos com APIs explícitas | Session, tools, config, permission, project/filesystem/database e lifetimes preservados |
| 70-B | Browser-safe helpers em `packages/util`, com facades compatíveis | Rotas/encoding/retry/path e bundles web equivalentes; UI sem backend runtime |
| 70-C | Ports mínimos para hooks/registries de produto; composição no dono | Mesma ordem/autoridade/cancelamento; sem duas instâncias de coordinator/store |
| 70-D | Maestro/Continuity e receitas/assets toolkit em módulos coesos | Seats/IDs/prompts/Atlas memory/Task/resume e aquisição Core preservados |
| 70-E | App Dock com contracts + adapters Electron/Linux/native | Mesmos IPC/tools/permissions/profile fences/lifetimes e processos encerrados |
| 70-F | Facades/exports explícitos e revisão de dependências | Superfície pública inventariada permanece compatível; runtime/type/dev separados |
| 70-G | Disposição de todos os domínios legados de Orchestra | Tabela fonte → dono/path/README/facade/WP reconciliada; `apps/orchestra` contém somente entrada/composição/distribuição |

Cada extração começa como isolamento interno e ganha package boundary só quando necessário. Retargets de imports não podem duplicar tags de serviços, context singletons, MemoMap, caches, WeakMap de capabilities ou executors.

**Corte obrigatório Session/Agent/Continuity/engines em 70-C:**

- Core possui os contratos, IDs, serviços de storage/history, framework Agent e ports de lifecycle/engine/continuity. Extrair interfaces/tags existentes como canonical definitions e reexportá-las nos paths legados; preservar classes/tags/scope, sem recriar contratos paralelos.
- `modules/continuity` e `modules/engine-adapters/claude-code` implementam os ports e dependem de Core/contracts; não fazem Core importar implementações de produto de volta. Providers/LLM/history/helpers compartilhados ficam no owner de plataforma, não no módulo de orquestração que os chama.
- A implementação legada `SessionPrompt` que coordena Continuity/Claude/Atlas/Task fica em `modules/session-engine`, consumindo os mesmos contratos. O store/session model e adapters Instance-scoped permanecem Core-owned. `apps/orchestra` injeta/wire as implementações; wrappers legados preservam a API existente.
- Framework Agent genérico e `generate.txt` ficam no owner Agent; roster/presets/native seats/skill roots/publish policy são contribuições de produto injetadas da composição. Preservar aliases, defaults, labels, subagent permissions e ordem do merge de configuração.
- Congelar signatures, tags, error/return shapes e defaults antes de alterar providers/wiring. Provar ausência de `Core → Continuity/Claude/Maestro → Core` e de ciclos entre módulos, identidade de serviços, admission/cancel/resume/compaction/tool order e paused guard.
- Esse corte é hard dependency de 70-D e dos movimentos Session/Agent/engine de 70-G. O runner V2 continua independente; não passa a chamar `SessionPrompt.loop` nem um tool loop em memória.

**Corte obrigatório antes de separar receitas/assets toolkit em 70-D:**

- `OutputInspector` e sanitização/installer environment usados por TCP/producers são infraestrutura de plataforma, com implementação canônica em Core. Toolkit diagnostics preserva sua API como facade dessa implementação, não o inverso.
- Process execution, LayerNode compilation, PinnedArtifact e aquisição/readiness continuam num módulo de infraestrutura interno Core. Não mover `hosted`/`ensure` para um módulo que precise importar Core e seja depois importado de volta por Core.
- `@orchestra/core/backend-toolkit` continua facade dessa mesma engine de infraestrutura, com defaults/References/Root existentes. Receitas, packs e skill assets têm owner em `modules/backend-toolkit`; generators fornecem defaults compatíveis com hash/provenance, sem import runtime Core → módulo de produto nem segunda engine.
- Provar grafo acíclico, exports antigos, namespace/service identity, finalizers, defaults e igual diagnóstico/ambiente. Esse boundary é sub-WP explícito de 70-C e hard dependency da separação de assets. Extrair a engine para outro package não é objetivo obrigatório.

**Rollback:** composition switch/facade aponta novamente para implementação anterior, com mesmos dados e contratos; não mantém dois escritores em paralelo. Só introduzir switch quando seu default reproduzir exatamente o baseline.

### 80–90 — Concluir migrações incompletas por contrato, não por nome

| WP | Entrega | Saída verificável |
| --- | --- | --- |
| 80-A | Uma implementação por capacidade CLI/server; adapters V1/V2 explícitos | Matriz de comandos/rotas/auth/errors/SSE igual para todo consumidor suportado |
| 80-B | Types/client/schema com dono claro; SDKs migrados por consumidor | Identidade e wire shape; plugins externos; standalone/embedded/runtime isolation |
| 80-C | UI sem árvores paralelas sem propósito | Features e estados de ambos os shells inventariados; LTR/RTL e accessibility equivalentes |
| 80-D | Providers/SQLite/cópias suspeitas reconciliados | Requests, headers, auth, adapters Bun/Node e outputs idênticos antes de remover duplicata |
| 80-E | Integração final do domínio de toolchain Atlas preservado | Install links/patch SCIP, NodeNext/composite outputs, Vitest/gates/CLI e locks corretos no novo local |

Enquanto houver consumidor público suportado, manter adapter/export legado necessário. O alvo é um dono por responsabilidade; não remover protocolo, comando ou feature para chegar à expressão “um de cada”.

Atlas trocar `tsc -b` por `tsgo --noEmit` não satisfaz a geração de `dist` exigida pelos consumidores. Toolchain/lockfile/version changes não entram em PR de movimento. npm → Bun é campanha opcional separada: 100 pode fechar com workspace npm registrado, sem casca dispensável e completamente qualificado. A integração install/build/gates/CI do domínio existente em 80-E continua obrigatória.

**Rollback:** consumidores podem voltar ao facade/adapter anterior. Substituições começam sem DB migration ou wire change; não publicar formato que só o novo código lê.

### 90–100 — Qualificação completa e higiene permanente

| WP | Entrega | Saída verificável |
| --- | --- | --- |
| 90-A | Qualificação no exato candidate/head integrado pelo modo 30-F | Todos os branches/WPs required concluídos; testes executados sem previous-pass/scope skip; receipts SHA/target/digest |
| 90-B | Upgrade/write/relaunch/downgrade/reopen e restauração final | Dados antigos e writes pós-candidate preservados; WAL/drafts/blobs/steer/queue/coexistência ou recusa existente cobertos |
| 90-C | Docs/README/registry/archive index finais | Uma navegação canônica; nenhum link/owner/reader/registro stale; arquivos incertos resolvidos |
| 90-D | Exceções transitórias zeradas e safeguards operantes | Nenhuma violação arquitetural escondida; exceções permanentes legítimas documentadas |
| 90-E | Onboarding/navigation review e handoff enxuto | Pessoa fria acha um módulo, faz uma alteração e executa seus checks; avaliação humana registrada |

Fechamento de epic executa os suites/gates globais relevantes. Cada PR anterior usa testes change-scoped e typecheck dos packages/consumidores atingidos; o custo da matriz completa não se repete em cada edição de README.

**Rollback:** último artefato aprovado e mapping de dados recuperáveis permanecem disponíveis durante a janela acordada. Histórico Git não é reescrito como condição de conclusão.

## 7. DAG, tamanho e execução com agentes

```text
00 baseline/isolamento/snapshot/restore
  -> 10 inventory/README/guards
     -> 20 classificação exaustiva + archive/cleanup
     -> 30 resolvers/cache/build/CI/full-qualification mode
        -> 40 módulos simples
        -> 50 prefix-aware Omni/Atlas -> movimentos especiais
        -> 60 UI split -> entradas/tooling
40-C + 50-C -> readiness de skill/Atlas para 70-D
70-C boundary toolkit acíclico -> 70-D separação de receitas/assets
70-C boundary Session/Agent/Continuity/engines -> 70-D + movimentos 70-G
30 + 40 + 50 + 60 -> 70 APIs/lifetimes/domínios/70-G apps finos
70 -> 80 migração por consumidor + integração toolchain Atlas
20 + 40 + 50 + 60 + 70 + 80 -> congelar candidate integrado
candidate + modo 30-F -> 90 qualificação/restauração/cleanup -> 100
```

Nenhum ramo obrigatório termina sem join. O candidate do bundle final é definido depois de todas as entregas. Alterá-lo após congelamento invalida os receipts afetados; resultados continuam vinculados ao head e aos inputs/artefatos efetivamente qualificados.

- Cada WP da tabela pode exigir mais de um PR; dividir por consumer/adapter/site de escrita, nunca um PR gigantesco de “fase inteira”.
- Alvo normal: um contrato e um raio de regressão pequeno por PR; 50–200 linhas conceituais. Até 400 linhas por reviewer; dividir revisão acima disso. Renames mecânicos grandes exigem mapping + comparação de conteúdo e diffs de lógica revisados separadamente.
- Limite autorizado de até 15 agentes não é meta de ocupação. Usar até seis executores simultâneos em mudanças complexas; o restante pode pesquisar ou fazer revisão fria independente.
- Um worktree por agente ativo, baseline exata, lista de arquivos de escrita, interfaces congeladas, checks e stop line. Lead possui manifests, registry, arquitetura e merge order.
- Nunca duas escritas concorrentes no mesmo manifest, generator, route registry, CSS pipeline ou arquivo de wiring. Contratos compartilhados entram primeiro ou a alteração é serializada.
- Revisão fria não recebe narrativa do autor como prova. Lead confirma fontes, diff completo, controles e testes localizados da área alterada antes de integrar cada PR. Actions de qualificação pertencem ao bundle final, não a cada PR.
- Worktrees de campanhas em andamento, branches não entregues e processos vivos não entram em limpeza automática.

### Execução cirúrgica: reaproveitar prova, impedir acúmulo de erro

**Cadência determinada pelo owner em 13 de outubro de 2026:** várias PRs pequenas compõem uma entrega; **CI roda uma única vez, no bundle final, quando tudo estiver entregue**. Lead e agentes executam somente testes localizados nas áreas que alteraram, sem repetição e sem suítes pesadas intermediárias. Registrar e reaproveitar resultados; novo PR, merge ou avanço de `dev` não dispara outra rodada de CI. Essa regra deve constar dos briefs dos próximos agentes.

- Cada WP tem uma entrada canônica com owner, contratos, dependências, estado e evidências. Atualizar essa entrada; não recriar auditorias, planos ou versões concorrentes do mesmo diagnóstico.
- Quando `dev` avança, revisar o delta e seu alcance. Refazer somente o levantamento afetado; descoberta nova ou input não rastreado amplia a investigação de forma explícita.
- Prova intermediária só pode ser reaproveitada quando código/dependency/asset/recipe/env/target relevantes forem comprovadamente iguais. Revalidar esses inputs, sem tratar idade ou exit code antigo como prova. A qualificação final exact-SHA de 90-A continua obrigatória, sem reutilizar resultado de testes.
- Cada teste localizado tem escopo e resultado registrados. Não repetir checks aprovados nem ampliar para suítes pesadas durante os lotes. Uma falha é corrigida no domínio atingido, com verificação localizada da correção; a rodada única de CI permanece reservada ao bundle final.
- Bloqueador de contrato, dados, runtime ou distribuição impede integração daquele WP e início dos dependentes. Áreas independentes continuam. Registrar cenário reproduzível, owner, causa, condição de desbloqueio e check que demonstra a correção.
- Corrigir na origem do defeito antes de espalhar adapters/workarounds. Não aceitar supressão, skip, waiver automático, divergência sem explicação ou “arruma na fase seguinte” para fechar WP.
- Antes de despachar, conferir campanhas ativas e seus sites de escrita. Sobreposição tem um owner por janela: concluir o WP conflitante ou coordenar o corte antes do movimento; não esperar uma campanha inteira nem editar o mesmo boundary em paralelo.
- Manifests, generators, registry, workflows e wiring compartilhados têm integração serializada. Publicar mapping/compatibilidade primeiro; adaptar branches antigas com seu owner e conferir os consumidores diretamente atingidos com testes localizados mesmo quando o merge não apresenta conflito textual. A matriz ampla roda no bundle final.
- Checkpoint é estado verificável: diff, contratos, dados/artefatos, checks e rollback. Só liberar a próxima dependência depois desse checkpoint; candidate estável não é requalificado novamente sem uma razão registrada.

### Cartão obrigatório de cada PR

```text
WP / baseline SHA / candidate SHA / owner
Objetivo e único tipo de mudança
Caminhos e consumidores atingidos
Contratos/bytes/dados que precisam permanecer iguais
Pré-condições e dependências já concluídas
Checks: comando, ambiente/target, expected execution, resultado e receipt
Controles: defeito que deve falhar; no-op/árvore limpa que deve passar
Diferenças esperadas e como foram explicadas
Rollback executável e condição de parada
Decisões/obrigações transferidas; archive locator quando houver remoção
```

Nenhum cartão recebe “concluído” baseado em intenção, lint isolado ou relato do executor.

## 8. Matriz de verificação

Os comandos completos, runners atuais e fontes estão no [mapa](monolith-map.md). Adaptar aliases e cwd pelo resolver antes de mudar os caminhos.

A tabela define os domínios de cobertura, não uma suíte completa por PR. Durante as entregas, selecionar somente casos localizados diretamente afetados pela mudança, sem repetir checks já aprovados. CI, empacotamento e matrizes pesadas são executados uma única vez sobre o bundle final, após todas as entregas, conforme a cadência definida acima.

| Camada | Checks mínimos | Quando |
| --- | --- | --- |
| Estrutura/guards | Discovery, registro ↔ manifests, AST/resolver, links/readers, stale ledger, dentes em árvore real | Scaffold, cleanup e todo movimento |
| Packages TypeScript | `bun typecheck` no pacote e consumidores afetados | Cada PR que altera código/manifest/export |
| Session/dados | Inbox/runner/concurrency/replay/location/config/DB/credentials/ownership | Core, composition, adapters e extrações |
| API/clients/plugins | Contract identity/import boundaries; OpenAPI/auth/query/SDK; generation drift | APIs, manifests, exports, server/client e SDK |
| UI | Unit + browser com conditions corretas; Playwright; TUI; Storybook | Imports/asset pipeline/features/entrypoints/renderer |
| Atlas | Corpus/Own/gates, build outputs, boundary bytes/declarations, host consumers | Paths/docs/toolchain/boundary |
| Relay | TS/Node parity; Python oracle; goldens/ledgers/profile catalog/doc index | Paths/runtime/docs/fixture storage |
| Lean | Pin/licenses, actual ShellTool capture, hooks/telemetry/preferences, saved/replayed selected text | Vendor/native adapter/session/package |
| Omni | Cargo/clippy/fmt/API/conformance/QA, Node/Bun binding, pair/artifact/mirror | Native paths/build/runtime/delivery |
| Desktop/native | Main/preload/renderer IPC, tools, process lifetime; artefato real e installer quando atingido | App Dock/WSL/resources/packaging |
| Nix | Eval e builds/closures no host correto; metadata/hashes remedidos | Workspace/lock/patch/fileset/packaging |

### Targets e ambientes

- Bun-compiled CLI, Node server, Electron main/preload/renderer, browser e TUI são produtos de runtime diferentes.
- Preservar todas as lanes existentes e distinguir OS/CPU/libc/ABI. Suporte de distribuição não implica prova funcional no alvo.
- Omni publica oito combinações OS/CPU/libc; algumas combinações CLI/Omni continuam declaradas sem suporte. Não transformar N/A existente em promessa nova.
- macOS Intel/ARM64, Linux x64/ARM64, Windows x64/ARM64 e WSL são avaliados conforme o produto/artefato e sua matriz real.
- Smoke unsigned de Desktop não prova installer assinado/notarizado. Mock de Playwright não prova sidecar real. WSL script não prova controller Electron inteiro.
- Accessibility/Docker/live GUI precisam do ambiente e flags efetivos. Cenário requerido que não executou permanece aberto.
- Coletar receipt com source SHA, artifact digest, target, comando, execution status e links duráveis. Resultado antigo só vale se todos os inputs relevantes forem comprovadamente iguais.

## 9. Critérios objetivos de 100

1. Todo módulo/dataset/entrypoint do mapa tem destino, owner e README apropriados; registro não contém órfãos.
2. Árvore segue os papéis definidos; scaffold não tem diretórios decorativos ou cópias de outro repo sem função.
3. Não há dependência runtime proibida, ciclo ou acesso acidental a internals; exceções de migração acabaram.
4. Comandos, rotas, SDKs, plugins, features, layouts suportados e dados antigos passaram qualificação por consumidor.
5. Binários, assets e recursos distribuídos correspondem ao source/target/ABI aprovados, incluindo pair e licenças.
6. A matriz required executou no head final. Skips, cached pass e N/A não foram usados para fechar cenários requeridos.
7. Inventário de todo campaign/task/spec/research/handoff/history está reconciliado: cada item foi removido com prova, arquivado/restaurável ou retido por necessidade vigente identificada. Nenhum item ficou sem classificação/revisão fora dos lotes prioritários.
8. Goldens/corpus/fixtures/skills não perderam cláusulas, scenario coverage, provenance ou capacidade de regeneração.
9. READMEs, generators, registries, workflows, Nix, cache e readers não dependem dos paths antigos sem compatibilidade deliberada.
10. Upgrade com novos writes, relaunch, shutdown, restore consistente e rollback sem perda desses writes foram qualificados em runtime/paths/auth isolados; coexistência suportada e recusas existentes permanecem iguais.
11. Não se mudou engine, feature, permissão, formato de dados, provider ou comportamento de UI para disfarçar a reorganização.
12. Uma pessoa sem histórico das campanhas consegue navegar, localizar ownership e fazer uma mudança pequena corretamente.

## 10. Decisões fixadas e decisões que ficam separadas

**Direção deste plano:** README por módulo; arquitetura por responsabilidade; preservação primeiro; archive antes de remover; logical modules antes de novos packages; toolchains/identidades preservadas durante movimentos; limpeza integral do material acumulado com prova de consumo.

**Campanhas separadas, com autorização própria:** reescrever histórico Git; aposentar oráculo Python; encerrar espelho Omni; remover contrato público/feature suportada; trocar engine/provider; atualizar a fonte Lean; migrar toolchain Atlas npm → Bun; ativar engine Claude atualmente pausada; limpar worktrees/WIP de outros owners.

O começo executável é 00-A–00-D. A organização visual ganha clareza em 10-A; a remoção do volume histórico começa em 20-B–20-C; movimentos grandes só começam após 30. Essa ordem evita trocar aparência bonita por regressão escondida.

## Execução atual — checkpoint de baseline

Branches de execução: `monolith-baseline`, `monolith-inventory` e `monolith-source-proof`, sobre `cdf293420327e3b5f4879641c220949f29a4319c`. Os arquivos de execução estão no worktree isolado `monolith-baseline-cdf293`; esta seção é o registro canônico do checkpoint, não uma nova campanha documental.

Lotes publicados, aguardando revisão/aprovação antes da integração:

- [PR #336](https://github.com/gustavomhss/hugr-orchestra/pull/336), `19569a6845`: provas de snapshot/restauração do draft store.
- [PR #338](https://github.com/gustavomhss/hugr-orchestra/pull/338), `8199e0fcb8`: coletor de declarations/assets/pins e checks básicos, abaixo de 400 linhas.
- [PR #339](https://github.com/gustavomhss/hugr-orchestra/pull/339), `d93cfebc7b`, stacked sobre #338: provas adversariais da fonte Git e README de operação. Integrar junto da fatia do coletor; o CI final exercitou a árvore combinada.

| Item | Estado e alcance |
| --- | --- |
| 00-A1 | Implementado coletor de declarations/assets/pins por revisão Git imutável, com fingerprint incluindo revision/tree e producer hash. Não qualifica import reachability ou Cargo resolution. |
| 00-B parcial | Observados Session admission/retry/coordinator/Location, SQLite e credential isolation; processos reais adicionados para satisfazer Omni positive control. |
| 00-C1 | Provas do store atual: WAL versus raw-main-file copy, flush/backup/restauração de document/blob e novos writes preservados após relaunch. Não qualifica predecessor/candidate empacotados nem snapshot live multi-store. |
| 00-D | Continua aberto: artefatos reais, matriz completa, restore/upgrade/downgrade e coexistência por produto/target. |

Evidência de Actions:

- Core/Session/dados Linux: [38185276986](https://github.com/gustavomhss/hugr-orchestra/actions/runs/38185276986); Windows: [38184052721](https://github.com/gustavomhss/hugr-orchestra/actions/runs/38184052721). O run Windows também possui lane Linux inicialmente reprovada por seleção sem spawn, não por falha de Session; a lane foi corrigida por inclusão de processo real no run Linux seguinte.
- Coletor corrigido + processos, Linux/Windows: [38187506137](https://github.com/gustavomhss/hugr-orchestra/actions/runs/38187506137).
- Após separar fixture e source suite para publicação em lotes pequenos: [38190211184](https://github.com/gustavomhss/hugr-orchestra/actions/runs/38190211184), Linux/Windows, mesma implementação do coletor e todas as provas da fonte.
- Draft store, Linux/Windows, sem skips: [38187505336](https://github.com/gustavomhss/hugr-orchestra/actions/runs/38187505336).
- Dentes do coletor: retirar recusa de workspace pattern vazio fez o caso nominal falhar em [38187213907](https://github.com/gustavomhss/hugr-orchestra/actions/runs/38187213907).
- Dentes de persistência: tornar `flush()` um no-op manteve o teste antigo in-memory verde, mas fez as duas provas persistidas falharem em ambos os OS em [38187213961](https://github.com/gustavomhss/hugr-orchestra/actions/runs/38187213961). Runtime restaurado byte-equivalente à baseline antes do run final.

Revisão fria corrigiu entradas Cargo/Node, hidden assets, pins de raízes, source capture inconsistente, Git replacement refs e descoberta de arquivos como diretórios. Node observado no mutation receipt: `v24.21.0`; o runner usa Node 24 floating após setup, não comprova exatamente 24.15.

0–10 permanece aberto. Próxima dependência é completar matriz de comportamento/artefatos e compatibilidade de dados por produto; movimentos de módulos continuam condicionados à sua qualificação e ownership das campanhas ativas.

### Wave 2 — modelo e paralelização autorizados

O owner pediu GPT‑6 Luna para tarefas simples e paralelização máxima. Foram despachadas 15 frentes isoladas: 12 `gpt-6-luna` e 3 `gpt-6.1-sol`, com modelo confirmado nos headers do Codex e write sets disjuntos. Checks pesados permaneceram lead-owned. Os índices sparse dos worktrees foram reparados antes de qualquer integração; todos os bytes authored foram preservados e o post-flight passou a listar somente os arquivos owned.

Baseline da wave: `cdf293420327e3b5f4879641c220949f29a4319c`; integração dos lotes seguintes: `966c1af1ee596d5cccc8b87150dc5bcb0770570a`. Delta revisado: security-closeout e fix-dev-red-v2, sem conflito com os três testes Schema ou os READMEs preparados.

Lotes publicados:

- [PR #341](https://github.com/gustavomhss/hugr-orchestra/pull/341), `791dba65b6`: paths nativos Windows, discovery não vazio e witness de sete ResearchEvent duráveis. Final [38197865444](https://github.com/gustavomhss/hugr-orchestra/actions/runs/38197865444), 10 testes executados por OS. Omitir os eventos e introduzir reexport V1 foi detectado em ambos os OS em [38197647424](https://github.com/gustavomhss/hugr-orchestra/actions/runs/38197647424); fonte restaurada antes do final.
- [PR #343](https://github.com/gustavomhss/hugr-orchestra/pull/343), `939d001c20`: novos READMEs de Schema, Protocol e Server, com root exports/import paths/middleware/Relay ownership conferidos.
- [PR #344](https://github.com/gustavomhss/hugr-orchestra/pull/344), `994d4351ec`: READMEs de seis bibliotecas. Guias técnicos existentes de LLM/CodeMode/recorder preservados; revisão rejeitou condensação lossy e corrigiu exemplos/layers, admit-only Scope e claims de I/O.

Baseline Client observada em Linux/Windows: [38190920795](https://github.com/gustavomhss/hugr-orchestra/actions/runs/38190920795), 23 testes por OS. Baseline ampla Schema inicialmente falhou em [38190921723](https://github.com/gustavomhss/hugr-orchestra/actions/runs/38190921723); a falha `legacy-event.test.ts` já possui correção authored por OpenHermes E09/REPAIR-01 e permanece fora do write set da reestruturação, sem duplicação ou alegação de suite inteira verde.

Coordenação Maestro recebida: nenhum freeze/hold de `dev` nem espera da PR dele para lotes disjuntos. Área ativa reservada: `packages/orchestra/src/claude-code/**` e testes, além de adapters Server explicitamente coordenados com frontend. Pedido real de overlap/API usa hunk/dependência em `_worktrees/archie-state/meta-harness/MONOLITH-PENDING-FOR-MAESTRO.md`; nenhuma dependência artificial foi criada. Mensagem de peer não autoriza merge humano.

00-D continua sem qualificações automáticas: receipts CLI precisam de vínculo ao sourceSHA do run; `pack:true` fecha Node clean-install; ABI/load não comprova GUI/startup; artefatos predecessor/candidate e snapshot multi-store live ainda têm identidade e ambiente a qualificar. Não usar esses limites para parar READMEs, guards ou lotes disjuntos já verificados.

### Qualificação nativa — 12 de outubro de 2026

[runtime-products 38200134044](https://github.com/gustavomhss/hugr-orchestra/actions/runs/38200134044) terminou com sucesso sobre `dev@2c758e21f23205ef1f584503ebdd129c5ca645aa`, com `windows_x64_only=false`. Os seis receipts baixados declaram versão `1.18.27`, `healthy:true`, `wrongPasswordRejected:true` e `unauthenticatedRejected:true`. O vínculo à fonte é o `headSha` do run e o checkout do workflow; os receipts não possuem campo sourceSHA próprio.

| Target executado no host nativo | SHA-256 do binário declarado no receipt |
| --- | --- |
| `darwin-x64-baseline` | `0f913c4e1c4d0b28dda6e20f2fe264afee366981f5cffcc86b4b94ed21f258a6` |
| `darwin-arm64` | `46ebd0f810113f9b772ffbe9a68e6f9e8a77ae7918aa31786660cdf4c75f2db4` |
| `linux-x64-baseline` | `2e96a94b4f05dcdd62936c23c813650f93b300522348304fa4145b94cf3a8004` |
| `linux-arm64` | `8ae9be7d20626e6842294f847d532b2dd82c12c0b175a030ee97bd035a4e189b` |
| `windows-x64-baseline` | `0cab7908414d02b1afff03349690a1ba69687989d9ea3507a0956283f6dc8307` |
| `windows-arm64` | `cbf6e971fd108960a9890acf55b8eb90129ea2b0539fc5f71fe41ef7e43e1d72` |

Alcance conferido em `runtime-proof.ts` e no workflow: CLI compilada, versão, export/validação de resources, daemon start/status/stop, health autenticado e controles negativos de senha errada/acesso anônimo. HOME/XDG/AppData/temp/DB são isolados antes do launch e credential inheritance é desabilitada. O check-report de cada lane comparou o digest ao binário no runner; estes hashes foram lidos dos receipts, não recalculados localmente. Windows ARM64 executou o produto entregue pelo producer Linux e validou seu digest no host Windows ARM64.

Os producers Omni executaram controles de mutação de artefatos, mas `Pack` e clean-install Node/Bun/Deno ficaram **skipped** neste run (`pack` não habilitado). Build musl de Omni não qualifica CLI musl. Desktop channels/GUI/installers/WSL, Node SQLite e compatibilidade cross-version continuam sem evidência deste workflow. O sucesso nativo fecha esta fatia de 00-D, não o marco inteiro.

Próximo witness de dados: fixture real de `packages/core/test/session-create.test.ts`, com Session admit-only, steer promovido, queue pendente, snapshot de WAL committed antes do close e reopen/retry. A execução de upgrade/downgrade depende de designar release/tag/SHA e artefato predecessor suportado; nenhum merge parent foi escolhido implicitamente como predecessor. Candidate-only reopen não será apresentado como rollback.

### Persistência de Session e par preservado — 12 de outubro de 2026

[PR #347](https://github.com/gustavomhss/hugr-orchestra/pull/347), `35e4e9e39a`, adiciona um witness file-backed de Session em `packages/core/test/session-persistence.test.ts`. Usa Database/EventV2/SessionInput/SessionV2/SessionStore reais; compara cópia main-only com snapshot committed-WAL quiescente, depois verifica Session, inbox, prompt/context/delivery, IDs/sequences/events, histórico/projeções, retries sem duplicação, conflitos e writes novos após reopen. Dois steers são promovidos e uma queue continua pendente. Contexto host-owned inicial passa por `SessionInput.admit`; retries e novas admissões usam `SessionV2.prompt(..., resume:false)`. O serviço de execução da fixture falha se wake/resume for chamado.

- Final [38203486303](https://github.com/gustavomhss/hugr-orchestra/actions/runs/38203486303): witness executado em Linux/Windows junto dos controles reais de processo; 25 testes Linux, 23 Windows. `bun typecheck` em Core passou. Revisão fria da versão final não apontou blocker.
- Omitir WAL da cópia fez o witness falhar com `Session.NotFoundError` em ambos os OS: [38202790680](https://github.com/gustavomhss/hugr-orchestra/actions/runs/38202790680).
- Remover temporariamente o guard `resume:false` fez o witness falhar com `ADMIT_ONLY_WOKE_EXECUTION` em ambos os OS: [38203314395](https://github.com/gustavomhss/hugr-orchestra/actions/runs/38203314395). `packages/core/src/session.ts` foi restaurado ao blob original `ee09320406f19c18347c2904b4ed7cbc46d0b7a3` antes do final; a PR contém somente o teste novo.

Busca de predecessor: os remotos GitHub acessíveis `gustavomhss/hugr-orchestra` e `gustavomhss/HuGR-Orchestra` não retornaram releases; `@orchestra/cli/latest` no npm retornou 404. A consulta de releases retornou uma release real de Bun como controle do instrumento. O remoto de arquivo `gusmhs/HuGR-Orchestra` não pôde ser resolvido; essa falha não é evidência de ausência. Não foi inventada uma release suportada.

Para a prova bounded seguinte, foram designados **builds de desenvolvimento preservados**, ambos Windows ARM64: predecessor [38148620759](https://github.com/gustavomhss/hugr-orchestra/actions/runs/38148620759), fonte `1c7761973a2e3f1b919e259f7df43c68b5e0bb86`, artifact `11705866256`; candidate [38200134044](https://github.com/gustavomhss/hugr-orchestra/actions/runs/38200134044), fonte `2c758e21f23205ef1f584503ebdd129c5ca645aa`, artifact `11725206754`. Ambos runs passaram e os resources foram baixados e executados na qualificação abaixo.

[PR #352](https://github.com/gustavomhss/hugr-orchestra/pull/352), `aab55ef058`, adiciona `packages/cli/script/session-data-proof.ts` e workflow `session-data-proof`. Run [38204874629](https://github.com/gustavomhss/hugr-orchestra/actions/runs/38204874629) passou no host Windows ARM64 nativo. O receipt baixado identifica o harness SHA completo, ambas as fontes/runs e dois binários distintos, ambos `1.18.27`: predecessor SHA-256 `17b5a09fd344d17aa946b31157acaedfed3c6fe574dc25512ee6134da60a68c2`; candidate `cbf6e971fd108960a9890acf55b8eb90129ea2b0539fc5f71fe41ef7e43e1d72`.

| Fase realmente executada | Inbox rows | Events |
| --- | --- | --- |
| Predecessor grava steer e queue admit-only | 2 | 3 |
| Candidate lê/retry e acrescenta input | 3 | 4 |
| Candidate relaunch preserva dataset hash | 3 | 4 |
| Predecessor lê writes do candidate e acrescenta input | 4 | 5 |
| Candidate reabre e preserva dataset hash | 4 | 5 |

O oráculo SQLite compara Session/input/event/projection/cursor rows **antes** de retries, evitando que nova admissão esconda perda de registros; também confere conflitos, IDs/sequences e contexto vazio de admit-only. Manifest/receipt/digest/PE ARM64 e source runs bem-sucedidos são conferidos antes dos launches. HOME/XDG/AppData/temp/credentials e Git config/template são isolados antes dos imports; Git root vazio e verificado limita descoberta de configs/plugins. `serve` foreground e comandos auxiliares têm ownership scoped, limites de espera/terminação e confirmação de exit/scope antes da limpeza.

No mesmo run, restaurar o snapshot SQLite completo pré-upgrade no retorno ao predecessor fez o oráculo detectar perda dos writes do candidate: `STALE_SNAPSHOT_CONTROL_DETECTED`. O workflow exigiu evidência estruturada da fase `predecessor-return`, três fases anteriores completas, snapshot restaurado e ausência de relatório de sucesso. A execução positiva seguinte terminou `SESSION_DATA_PROOF_OK:5 phases`.

`bun typecheck` em CLI e spawn-imports passaram; godfile passou usando o target existente `GODFILE_BASE_REF=fork/dev` (o default `origin/dev` não existe neste clone). Revisão fria final cobriu 383 linhas em dois arquivos. Alcance: persistência current-source Bun SQLite e compatibilidade de Session admit-only para **este par de builds CLI e este target**; Desktop/installer/WSL, Node SQLite, provider execution e snapshot/rollback multi-store permanecem itens distintos. 0–10 ainda não está fechado.

### Integração aprovada e próximo marco Desktop — 12 de outubro de 2026

O owner autorizou a integração de #347/#352 com a resposta **“Sim, integrar”**. Delta de `dev@615b2602eac4898259842378de3c3f326e42bbbb` foi conferido antes do merge: Session/admission/store/SQLite e dependências de runtime relevantes não mudaram; houve extensão dos controles Omni, cleanup de fixtures Windows e correção de lookup do CI por branch+SHA. As branches foram sincronizadas sem alterar os arquivos authored dos dois lotes.

- #347 integrada por squash em `147e67c1aed462c7bd838d4491efac7c0b77431a`. Na árvore sincronizada, Core typecheck e seleção Actions [38274612670](https://github.com/gustavomhss/hugr-orchestra/actions/runs/38274612670) passaram: 25 testes Linux, 23 Windows; os verdicts novos registraram 27/25 spawns Omni reais, sem delegações, respectivamente. Os mutation receipts anteriores continuam aplicáveis ao mesmo arquivo de teste.
- #352 integrada por squash em `439a1a7f2fa9fdb47a00bff37d76a618caee2b65`. CLI typecheck e novo run nativo [38275426095](https://github.com/gustavomhss/hugr-orchestra/actions/runs/38275426095), sobre a branch sincronizada `fa6ca15efca5bfaab0e1daffe667aa52e6e03bb3`, passaram, incluindo controle stale-snapshot e cinco fases positivas. Os binários predecessor/candidate continuam os mesmos, com identidade preservada.
- Post-flight conferiu que as três adições em `dev` são os arquivos dos dois lotes, byte-equivalentes aos heads revisados. A autorização não se estende automaticamente às demais PRs abertas.

Próximo alvo é **Desktop empacotado com dados persistentes**. Já existe produtor em `.github/workflows/omni-desktop-smoke.yml`; ele constrói app unsigned `--dir`, verifica bytes em app.asar/Resources, abre GUI e mede encerramento main/utility/process trees. A fixture atual usa `ORCHESTRA_TEST_ONBOARDING=1` e `ORCHESTRA_DB=:memory:`: esses checks não provam persistência de sessões nem retorno entre builds Desktop.

A frente de packaging/ripgrep em [PR #357](https://github.com/gustavomhss/hugr-orchestra/pull/357) está ativa e possui os arquivos do producer. Run [38269877279](https://github.com/gustavomhss/hugr-orchestra/actions/runs/38269877279) falhou antes de lançar o app Windows por artefato Omni Linux ARM64 ausente durante staging; recebeu correção e novos runs. Último observado [38273548152](https://github.com/gustavomhss/hugr-orchestra/actions/runs/38273548152), fonte `26b356f3c2d8d05c84e74101b2d9cf1d932af179`: build Windows falhou, lanes Linux/macOS ainda em execução. Nenhum resultado foi atribuído à reestruturação ou anunciado como verde. Reutilizar a prova do producer quando concluída, sem editar seu write set em paralelo.

Fatia seguinte de dados: driver novo e disjunto que use preload/IPC reais para gravar draft/document/blob, peça quit, reabra o mesmo perfil isolado e confira bytes/novos writes. Para upgrade/retorno, reter também os **apps empacotados completos** predecessor/candidate, não somente receipts/hashes do producer. Manter estado de qualificação por OS/canal e limites explícitos; o marco Desktop não fecha por um run in-memory.

### Wave Desktop paralela — checkpoint inicial

Após pedido do owner **“siga, paraleliza o que puder, ta demorando demais”**, baseline fixada em `782c730bfdddfff899b3904982b785d00ad25655`. Três autores isolados trabalharam em paralelo: transporte Process/CDP (`gpt-6.1-sol`), driver renderer/IPC (`gpt-6.1-sol`) e workflow/retenção (`gpt-6-luna`). Três revisores frios trabalharam em fatias disjuntas abaixo de 400 linhas. Lead integrou contratos e wiring; a implementação inicial manteve write sets disjuntos do producer #357. Reparos posteriores e seu escopo estão registrados abaixo.

Stack publicada em draft para recuperação/CI, ainda **sem qualificação runtime verde**:

- [#360](https://github.com/gustavomhss/hugr-orchestra/pull/360), `desktop-proof-base`, `0dc41866f8`: Process scoped, CDP loopback real e tsconfig; 233 linhas.
- [#359](https://github.com/gustavomhss/hugr-orchestra/pull/359), base #360, `desktop-draft-proof`, `bb3047e836`: driver de draft/document/blob via `window.api`, seed/reopen-add/third-reopen, quit causal e leitura SQLite independente; 258 linhas.
- [#361](https://github.com/gustavomhss/hugr-orchestra/pull/361), base #359, `desktop-data-proof`: workflow additive, controles e arquivos completos tar.gz+SHA-256. Os tarballs preservam permissões Unix e não substituem o tarball Lean aprovado.

Revisão corrigiu observação de cleanup após abort, `exited` aguardando drenagem de output, causa original preservada e metadata Git coerente. Child mantém Omni ativo para o hook do pacote, enquanto host spawner usa layer Core explícita. Typecheck scoped Desktop e spawn-imports passaram; isso não é green do app. Escopo frozen: drafts/blobs current-source no app unsigned Linux/Windows x64, sem declaração de macOS, full Sessions ou cross-version Desktop.

Run [38282374247](https://github.com/gustavomhss/hugr-orchestra/actions/runs/38282374247), fonte `90b73a4f7bc45499ad7fbb6e270d9179623311ed`: quatro producers nativos passaram. Run Windows passou typecheck e staging, mas falhou **antes de abrir o app** por dependências opcionais Linux ausentes no cross-build WSL (`@ff-labs/fff-bin-linux-arm64-gnu/libfff_c.so` e `@opentui/core-linux-arm64`). Linux continuou independentemente. Correção `eaf98c0fd6` provisiona instalação frozen `--os='*' --cpu='*'`; dispatch permite selecionar lane, mantendo ambas como default. Nenhum skip/continue-on-error foi usado para declarar green.

### Reparos Desktop e primeira qualificação Linux — 13 de outubro de 2026

O workflow passou a compilar os guests CLI GNU em seus próprios CPUs, reter diretórios ocultos, montar recursos verificados para o producer existente e fixar versão `1.18.27`. Startup empacotado também revelou um CLI guard de tree-sitter executado durante import de `index.js`; `c82da4234a` restringiu o parser ao entrypoint standalone documentado. A PR #361 inclui esse reparo mínimo de startup além do workflow/diagnósticos; seus commits não constituem green isoladamente. Reparos adicionais publicados em [#372](https://github.com/gustavomhss/hugr-orchestra/pull/372), base #361, `desktop-proof-repair`; ordem de integração proposta #360 → #359 → #361 → #372, condicionada à aprovação humana do lote qualificado.

Run [38305415679](https://github.com/gustavomhss/hugr-orchestra/actions/runs/38305415679), fonte `c03f66055206539afc51be7b9cc5878042d912f8`: apps unsigned e quatro producers passaram, mas ambos controles falharam. Linux mostrou `SQLiteError: bad parameter or other API misuse` na abertura do mutator com `create:false` sem modo de leitura/escrita. Windows mostrou `APP_EXITED_BEFORE_REPORT`. A correção foi separada em `desktop-proof-repair`, base #361, com fatia inicial de 164 linhas alteradas em três arquivos de harness e revisão fria independente; deltas posteriores estão registrados abaixo.

Run [38311955035](https://github.com/gustavomhss/hugr-orchestra/actions/runs/38311955035), fonte `7d07ae4b716b9e1ed7c777a86cb84612465db817`: **Linux x64 passou** controle real de blob referenciado ausente antes de replacement write, controle real de child com falha, seed/reopen-add/third-reopen via Electron/preload, quit code zero e leitura SQLite independente. Receipt registra `cleanup:true`, `shellRestored:true` e `failedChildControl:true`. App completo foi retido em artifact `11775795742`, `desktop-data-app-ubuntu-24.04-7d07ae4b716b9e1ed7c777a86cb84612465db817`, digest do artifact `sha256:2aacbe2d8dca71d4ac718b1b7fdc623a8884fb1d8a5c4380c4307de1751f3776`, 266603927 bytes, com tar.gz e seu SHA-256. Digest do artifact é identidade do transporte GitHub, não o digest interno do tarball. Escopo continua unsigned current-source drafts/blobs; não full Sessions/cross-version/installer.

Windows desse run falhou antes do app: `SHSetKnownFolderPath(FOLDERID_LocalAppData): HRESULT 0x80070057` na aquisição e rollback. A [restrição documentada pela Microsoft](https://devblogs.microsoft.com/oldnewthing/20200115-00/?p=103329) proíbe relocar LocalAppData desde Windows 10 1803. A garantia da fixture foi corrigida: lease nativo somente de **RoamingAppData**, usado pelo Desktop para userData/drafts/logs/Crashpad; LOCALAPPDATA do child continua isolado por env, sem declaração de relocação da pasta nativa. Roaming setter e lookup físico legado já haviam passado antes da tentativa Local.

Revisão independente também detectou que child rejeitado podia esconder confirmação de teardown e impedir restauração do lease. `7d07ae4b71` propaga witness explícito após exit/scope closure em ambos outcomes, preserva erros de prova e cleanup em AggregateError, e executa controle real de body failure antes das fases. `392517d7c063ebf15f41802e2d9c99ec67674d34` remove somente a tentativa Local proibida; run Windows-only [38389504208](https://github.com/gustavomhss/hugr-orchestra/actions/runs/38389504208) lançou app real, mas falhou em `REPORTED_PATH_NOT_OWNED` para userData antes de qualquer preload write. O path não foi emitido naquele receipt; alias NTFS versus escape real ainda não foi determinado. Linux não foi rerodado nesse delta exclusivamente Windows.

A validação física foi reparada com dev/ino bigint do root capturado imediatamente após mkdtemp. Cada check exige root ainda com a identidade original, resolve links e exige ancestral físico do candidato igual ao root; userData ainda precisa coincidir com a identidade do diretório esperado. Revisão fria identificou e fechou uma versão intermediária que recapturava root mutável, permitindo substituição por junction externa. Controles reais agora rejeitam root em si, parent externo, escape por link e root substituído, restaurando a fixture **antes** de adquirir lease nativo ou lançar child. Fonte `8b29b6aa7178c58268dc1f7ac5d1243fab20e845`, revisão sem blocker e typecheck scoped aprovado; run Linux/Windows [38392711619](https://github.com/gustavomhss/hugr-orchestra/actions/runs/38392711619) passou Linux, mas Windows falhou no cleanup do link de controle antes do app.

O erro Windows foi `EFAULT: bad address in system call argument, rm` na junction externa; `fs.rmSync` não-recursivo falhou nessa versão Bun. Cleanup passou a validar `lstat().isSymbolicLink()` e executar `fs.unlinkSync` no entry exato, sem resolver target nem usar recursive, seguindo o [teste upstream da versão 1.3.14](https://github.com/oven-sh/bun/blob/bun-v1.3.14/test/js/node/test/parallel/test-fs-symlink-dir-junction-relative.js). Fonte `af09bcb6d70f7d6b596c4ac119b90c63a5186a14`, revisão fria sem blocker e typecheck scoped aprovado; run Linux/Windows [38394768904](https://github.com/gustavomhss/hugr-orchestra/actions/runs/38394768904) passou Linux com todos controles, três fases e retenção completa. Receipt inclui `pathControl:true`, `failedChildControl:true`, `shellRestored:true`, `cleanup:true`. Artifact Linux `11811591825`, digest `sha256:fae46a3a95444b2242ac6370083f93b4b0bd24d748e144740c6a175bebcc21b9`, 266653318 bytes. Windows passou a validação física/isolation do perfil, mas falhou `VISIBLE_GUI_REQUIRED` antes de preload writes.

Diagnóstico retido no run Windows [38400144771](https://github.com/gustavomhss/hugr-orchestra/actions/runs/38400144771), fonte `70fb9d34a09405ff8cc0848fc3692638642922cf`, confirmou CDP HTTP 200 com page real `oc://renderer/index.html`, loading task finalizado e erro IPC `Failed to get 'documents' path` em onboarding. Logs mostram os aliases NTFS `RUNNER~1`/`runneradmin` para o mesmo perfil temporário, agora aceito somente após comparação física. Captura de falha foi reparada para ler logs/events apenas depois de exit/scope closure confirmados; rejeição de exit promise é observation failure, não prova de morte; CDP captura até 20000 bytes com abort de 2 segundos e release do reader.

`b10e30a9a80fe054fc88206071c71201282c7fed` cria Documents na fixture e inclui `FOLDERID_Documents`/CSIDL_PERSONAL no lease nativo junto a RoamingAppData. Ambos originals são capturados antes do primeiro setter, verificados e restaurados em ordem reversa após confirmed teardown. Não há relocação nativa de LocalAppData. Revisão fria sem blocker e typecheck scoped passaram; run Windows-only [38402936982](https://github.com/gustavomhss/hugr-orchestra/actions/runs/38402936982) confirmou onboarding completo e Default Project dentro do sandbox, porém permaneceu vermelho em `VISIBLE_GUI_REQUIRED`. Capture confirmou release, CDP HTTP 200 e ausência de exit observado; não qualificou persistência Windows.

Divergência de launch foi localizada: `CrossSpawnSpawner` hardcoded `windowsHide:true` em Windows; o launcher packaged existente usa `false` e passou GUI Windows nos runs 38291609704/38300646634. PR #357 está merged no último estado observado. Slice novo e separado [#387](https://github.com/gustavomhss/hugr-orchestra/pull/387), `desktop-gui-spawn`, fonte `707f616a9b3e9f27357c1d5a43724e2984ad01fd`, adiciona opção explícita à factory legacy e usa `false` somente no launch Electron. Defaults omitidos e caminhos Omni-native mantêm seu comportamento. Revisão fria de 19 linhas sem blocker; Core e Desktop scoped typechecks aprovados. Regressão Core hospedada [38407121172](https://github.com/gustavomhss/hugr-orchestra/actions/runs/38407121172) passou 24 testes Linux/22 Windows, 27/25 spawns Omni reais e zero delegação.

### Desktop current-source qualificado — Linux/Windows x64

Qualificação composta [38406876581](https://github.com/gustavomhss/hugr-orchestra/actions/runs/38406876581), fonte `707f616a9b3e9f27357c1d5a43724e2984ad01fd`, concluiu **success** nas duas plataformas. Attempt 1 passou Linux, mas Windows teve `EPERM` no rename do staging CLI antes de lançar o app. Somente job falho foi rerodado na mesma fonte; attempt 2 passou Windows e concluiu o run, sem mudança de código ou gate para o retry.

Ambos receipts confirmam source/run/OS/arch, seed → reopen-add → third-reopen, preservação exata de documentos UTF-8 e blobs binários, quit code zero, `pathControl:true`, `failedChildControl:true`, `shellRestored:true` e `cleanup:true`. O controle anterior em cada lane removeu um blob referenciado committed, reabriu app real e detectou **DRAFT_BLOB_LOST antes de replacement write**, com duas fases e cleanup confirmado. Gate GUI exige janela visível e display real; o parent com launch oculto permanecia vermelho e a opção explícita passa o mesmo gate. Lead conferiu receipts baixados, stderr exato dos controles e metadata de retenção.

| Produto completo retido | Artifact | Digest do transporte GitHub | Bytes |
| --- | --- | --- | --- |
| Linux x64 unsigned | `11819244658` | `sha256:9b7b3197a6c797f389077d89b5ec949c7690ee18eba8c65f0e54ce6174b11892` | 266637954 |
| Windows x64 unsigned | `11821735358` | `sha256:b7533a74887c602c937f745685ad1448ad3536b2e7989dc44a81ebcb39ff239b` | 399092734 |

Cada artifact contém app `--dir` completo em tar.gz, seu SHA-256 interno e build receipt; nomes incluem source SHA e retenção é 14 dias. Os digests da tabela identificam o transporte GitHub, não substituem o SHA interno do tarball. Esses packages servem como development-build predecessors para qualificação seguinte; não substituem o tarball Lean aprovado.

Fatia fechada: **draft/document/blob current-source por Node SQLite e preload/IPC reais no Desktop unsigned Linux/Windows x64**. Full Sessions, compatibilidade Desktop entre builds, installers assinados/macOS/WSL e snapshot live multi-store continuam gates distintos de 00-D; 0–10 não fecha por este resultado. Naquele checkpoint, a ordem proposta para aprovação humana era **#360 → #359 → #361 → #372 → #387**; a aprovação e integração posteriores estão registradas abaixo.

### Lote Desktop integrado — 13 de outubro de 2026

O owner autorizou a integração do lote, condicionada a reconciliar `dev` e conferir novamente. Qualificação final [38436695973](https://github.com/gustavomhss/hugr-orchestra/actions/runs/38436695973), fonte `4556280f6ffe805d8243d4d978b64b673f810f94`, passou Linux/Windows x64 e os producers nativos, sem retry. Essa composição incorpora Lean 0.4.0, os notices atualizados, o entrypoint standalone de tree-sitter e os recursos ripgrep guest verificados. Revisão independente aprovou a preservação dos deltas de runtime.

Lead conferiu receipts baixados: `seed → reopen-add → third-reopen`, preservação exata, quit code zero, `pathControl:true`, `failedChildControl:true`, `shellRestored:true` e `cleanup:true` em ambas plataformas. Os controles reais detectaram `DRAFT_BLOB_LOST` com stderr exato antes de replacement write. Apps completos retidos por 14 dias: Linux artifact `11832888806`; Windows artifact `11833154422`, com tar.gz, SHA-256 interno e build receipt. Core/Desktop package typechecks e spawn-imports passaram; a instalação local Lean antiga foi atualizada pelo lock frozen antes do typecheck final de Core.

Antes da integração, `dev` avançou a `6dbb3546fcb9ab84b7c7629e095c5ddc1bf2278b` por #326. O delta altera somente wiring/testes CLI e Turbo, sem mudança de runtime ou dependências. Foi preservado na integração; a qualificação Desktop não foi repetida para esse delta. As bases das PRs restantes foram reconciliadas após os squashes, mantendo os arquivos qualificados byte-equivalentes.

| PR integrada | Squash em `dev` |
| --- | --- |
| #360 — transporte scoped | `fb4c66e511b7772eb7966edb75da7c5e2971a5cb` |
| #359 — driver de dados | `2fb576088c350d3678428d99de4ed05377cfc569` |
| #361 — workflow e retenção | `45d40a64aac9b4abd8e7c0a516d38887a94fa7c8` |
| #372 — isolamento e teardown | `4316904aafbf49254c87b63cf288e105fd4c1f8c` |
| #387 — opt-out GUI legacy | `e6d9a35f1b2434262ae846f37d5725b1f062e085` |

Postflight: `dev@e6d9a35f1b2434262ae846f37d5725b1f062e085` tem árvore `c34fc04f555c26d720ab3c807598862be025b53b`, exatamente igual à composição simulada antes da integração. Comparado à fonte qualificada, difere somente nos seis arquivos de testes/wiring já publicados por #326. Comparado ao `dev` imediatamente anterior ao lote, adiciona somente os seis arquivos Desktop/Core previstos. As PRs e seus bodies registram a evidência final.

**Estado do plano maior:** este lote terminou; a reestruturação 0–100 não terminou. 00-C/00-D ainda têm obrigações de recuperabilidade/distribuição além desta prova. Inventário, guards, contratos e READMEs dos lotes anteriores continuam com seus estados de integração próprios; esta autorização não cobre essas PRs. A sequência estrutural restante é a já definida em 10–100: ownership/navegação, limpeza recuperável, resolução de caminhos/build, movimentos por domínio, modularização interna, convergência e qualificação final. Não converter os números dos marcos em percentual de trabalho ou estimativa de horas.

### Navegação e composição do bundle — 13 de outubro de 2026

Depois da correção de cadência pelo owner, as fatias existentes #336/#338/#339/#341/#343/#344 foram compostas em `monolith-foundation@4a4ee819dbb027b1abd2960052d2a780e2dc14b0`, sobre `dev@e6d9a35f1b`. Lead comparou os arquivos owned de cada fatia com as fontes publicadas: bytes idênticos; nenhuma suíte foi repetida por essa composição. Esta branch não declara encerrado o bundle 0–100 nem transmite aprovação de merge das PRs anteriores.

Três autores `gpt-6-luna`, confirmados pelos headers da ferramenta, trabalharam em READMEs disjuntos: Core, CLI e App/Desktop. Lead possuiu README raiz e Client. Dois revisores frios independentes cobriram as fatias biblioteca e shell/raiz. Foram corrigidos os claims de Desktop V2 incondicional (é opt-in `ORCHESTRA_SIDECAR_V2=1`, legacy default), chaves de middleware do Client versus Server, comando CLI padrão/TUI e defaults separados de channel/staging. Revisões de delta aprovaram essas correções.

| Nova fatia publicada | PR | Base |
| --- | --- | --- |
| Core: ownership, entrypoints e scopes Session/Location | [#397](https://github.com/gustavomhss/hugr-orchestra/pull/397) | `monolith-foundation` |
| CLI: código V2 vivo, daemon, comandos e recursos | [#395](https://github.com/gustavomhss/hugr-orchestra/pull/395) | `core-guide` |
| App/Desktop: guias reais substituem boilerplate | [#398](https://github.com/gustavomhss/hugr-orchestra/pull/398) | `cli-guide` |
| Navegação raiz e ownership de geração Client | [#396](https://github.com/gustavomhss/hugr-orchestra/pull/396) | `shell-guides` |

Composição recuperável: `monolith-bundle@ac804d66b666b4be26686b32f105b64a346529f4`. As mudanças novas estão somente em seis READMEs. Verificação localizada: fontes, paths/links, diff owned e uma captura real do coletor imutável na foundation (`tree:78d8778d64c3b894a45f9843bf0704dff0caf3c0`, fingerprint `89bd42af3a9e360f7673b5dc3ef088237d5be5c8b1a77ca6a1f907ec782a88f7`). Captura identificou manifests Core/Client/CLI/App/Desktop e o pin Lean 0.4.0 aprovado. Não é prova de runtime ou de distribuição completa.

CI continua reservado à rodada única no bundle final, após todas as entregas. Próximo corte estrutural: registro/resolução de módulos e comandos por identidade nos paths atuais, antes de mudar suas pastas (10-B/30-A/30-B).

Durante a publicação, Maestro integrou #362 e `dev` avançou a `6a9b7c5e214d91bc25e9f116117660f4e83a1b19`. A foundation herdou o runtime/resources/clients gerados e reparos Schema dessa integração. Os conflitos dos três guards foram reconciliados: contract-hygiene e V1 isolation agora são byte-idênticos a `dev`; event-manifest preserva somente a extensão de 25 linhas do witness Research já revisado, com fonte/oracles imutáveis. Revisão fria separada aprovou essa composição, sem repetir testes.

Head recuperável atualizado: `monolith-bundle@c49ac28c3d2e0baf0cf7bcee20e929f4eb93b9d4`, foundation `822a4f6e323469df80f0497c85561abc751bfeda`. Os seis READMEs novos permanecem byte-idênticos à composição revisada anterior; os quatro diffs de PR continuam limitados a seus próprios READMEs. Nenhum CI intermediário foi solicitado.

### Resolver de identidade de módulos — 30-A1

[PR #472](https://github.com/gustavomhss/hugr-orchestra/pull/472), `module-resolver`, sobre `monolith-navigation`, adiciona o resolvedor puro `@orchestra/script/module-resolver`. Resolve declarações Bun/npm/Cargo capturadas por nome ou alias registrado, com qualifiers kind/scope. Retorna o mesmo objeto de declaração, incluindo path/manifest/metadata; recusa catálogo vazio/esparso, identidade duplicada, falta/ambiguidade e alias stale. Aliases aceitam forma string/objeto, qualifiers conflitantes falham, e targets canônicos não encadeiam aliases.

Bundle recuperável atualizado: `e20272830205e097601fc733a3c0fc3e8386baac`. Ainda não é o candidate final 0–100. Registro global de aliases e migração do uploader/request/workflow são as fatias seguintes; o produto não foi relocado por este PR.

Seguindo a instrução do owner para testes localizados e CI único final, lead executou somente: arquivo novo (7 casos), dois casos novos da correção de alias (7 anteriores filtrados), caso existente único de captura Git após reparo de índices do producer, e typecheck de `packages/script` com testes incluídos. O controle mutante de ambiguidade falhou no caso pontual; bytes originais foram restaurados sem rerun positivo. Reviewer frio independente aprovou a fatia e o delta corrigido. Luna escreveu apenas os testes no seu worktree; lead manteve interface, integração e execução.

Captura real do repo nesse head: tree `26488ca39104ae9ebeebc2a0fcf221cb2cc3c74b`, fingerprint `392e85d50b8af9022f5750ada1f84555b7fee9d07673f6a39cc9b904ac2f63ed`; aliases `core`, `cli`, `sdk/js`, `omni/bindings/node` apontaram aos manifests reais. Script agora declara seu teste para entrar na lane final existente; o task Turbo inclui producer/fixtures/guard usados pelos casos, mantendo cache correspondente. Nenhum CI intermediário ou suíte pesada foi executado. Hosted matrix/cache real continuam para o bundle final.

### Wave de quatro frentes paralelas — registro, comandos, seleção e higiene

Após pedido do owner para adiantar mais passos em paralelo, dois autores Luna e dois Sol (headers confirmados) implementaram quatro write sets isolados sobre `e20272830205e097601fc733a3c0fc3e8386baac`. Lead fixou contratos, realizou wiring compartilhado e compôs as entregas; quatro reviewers frios independentes cobriram diffs separados. Nenhum agente disparou testes/CI/builds; lead executou apenas casos pontuais nas áreas alteradas.

| Entrega publicada | PR |
| --- | --- |
| Registro atual de módulos/aliases e verificação bidirecional | [#479](https://github.com/gustavomhss/hugr-orchestra/pull/479) |
| Seleção e validação de requests por diretório resolvido | [#477](https://github.com/gustavomhss/hugr-orchestra/pull/477) |
| Adapter de identidade/cwd no uploader | [#475](https://github.com/gustavomhss/hugr-orchestra/pull/475) |
| Inventário Git imutável de disposição dos quatro escopos de archive | [#478](https://github.com/gustavomhss/hugr-orchestra/pull/478) |
| Bootstrap Node pré-Bun e wiring de cwd/cache/instalação/evidência | [#476](https://github.com/gustavomhss/hugr-orchestra/pull/476) |

Stack curada começa na #472. Fonte curada `f2bf1ff817fbeccbecceedb1b119e36e830c0939` é byte-idêntica à fonte revisada `a5ce943c9f1f81d2bdd7da1f3cfb32a4fa42a243`. Agregado recuperável atualizado: `monolith-bundle@08673fc167cde59c2852513951379f6cfd7bb008`, tree `648c77c8cd25d99ff35829c8f6d984726264f743`. Nenhum movimento de pasta do produto ou remoção de corpus foi confundido com a entrega do tooling.

Verificação localizada: 58 casos novos (seis arquivos), quatro casos adicionados das correções, um caso composto de replay e 12 regressões diretamente afetadas. Os casos já aprovados foram filtrados nos deltas, sem suíte ampla ou rerun por rotina. `bun typecheck` de Script passou, incluindo uploader/fixtures. Duas mutações pontuais tornaram vermelhos os cenários de diretório divergente e reader esparso; os blobs corretos foram restaurados sem repetir green. Bootstrap de pacote movido foi executado por Node real antes de setup Bun.

Reviews fecharam colisão alias/nome canônico, transporte explícito `packageSelector`, ownership físico de registry/manifests, vacuidade de readers esparsos e precisão de citações. Env/runner/config/benchmark/control/nonce/completion/platform checks permanecem; o diretório resolvido orienta cwd/instalação/cache/evidência. Cross-check real de registry↔inventário passou para os manifests Bun atuais. Captura de archive por revisão registrou os quatro escopos não vazios, modos/identidades Git/tamanhos, sem carregar tarballs, extrair ou deletar. A incerteza de readership direto do harness BENCH_DIR está registrada, não convertida em ausência de leitor.

CI único continua reservado ao bundle final. Próximos cortes são generalização dos demais lookups/build/resource/toolchain e materialização de archives duráveis com restauração antes da limpeza. Hosted matrix/instalação/cache/artifacts e reconstrução de archives ainda não são resultados desta verificação local.

No fechamento dessa wave, `dev` avançou pela campanha de distribuição a `5c87f7826ec2100ac5417f08fe2a411ebbeee921`. Merge limpo preservou selector/assert de Linux ARM64, systems exportados, usage, resources/skills e inputs de cache Core/CLI. Reviewer frio de delta aprovou somente os quatro seams compartilhados de tooling, sem requalificar a feature alheia nem repetir suítes/CI. Agregado mais recente: `monolith-bundle@978fd0fc3fae58e668ecf0982e1f2cd68c64b2a7`, tree `93e2a7b974dce9f5cb408d8e9cb3f408d5750138`. As cinco PRs pequenas continuam como fatias curadas da wave; esse agregado também inclui as mudanças posteriores de `dev` para o bundle final.

### Wave de paths de build/resources, Nix e recovery portátil

Três autores Sol e um Luna entregaram write sets isolados sobre `978fd0fc3fae58e668ecf0982e1f2cd68c64b2a7`. Lead integrou os contratos e os sites compartilhados; quatro reviewers frios independentes revisaram as fatias e somente os deltas corrigidos. A composição revisada `monolith-bundle@f4c6c2c5102dce9f1240bfeba6a7a606182ba8bd` e a entrega curada `source-path-wiring@ce57e53eead0908dc8ddd2ca4947d271a598e89f` possuem a mesma tree `5d1b37484eb552f0297fa295aa55eb3e6c39131e`.

| Fatia draft | PR | Base | Linhas adicionadas/removidas |
| --- | --- | --- | --- |
| Paths físicos por identidade e domínios Cargo/npm | [#500](https://github.com/gustavomhss/hugr-orchestra/pull/500) | `build-baseline` | 265/11 |
| Readers/resources Desktop/CLI e configs Electron | [#501](https://github.com/gustavomhss/hugr-orchestra/pull/501) | `workspace-paths` | 132/23 |
| Config Nix absoluta por identidade registrada | [#505](https://github.com/gustavomhss/hugr-orchestra/pull/505) | `source-resources` | 154/1 |
| Wiring de oracles e fingerprint Git byte-exato | [#504](https://github.com/gustavomhss/hugr-orchestra/pull/504) | `nix-source-config` | 215/54 |
| API de capture/restore de source com publicação exclusiva | [#499](https://github.com/gustavomhss/hugr-orchestra/pull/499) | `nix-source-wiring` | 344/0 |
| Regressões Git/filesystem de recovery | [#502](https://github.com/gustavomhss/hugr-orchestra/pull/502) | `recovery-source` | 277/0 |
| Preflights isolados, inputs/typecheck e guia | [#503](https://github.com/gustavomhss/hugr-orchestra/pull/503) | `recovery-source-tests` | 133/2 |

Verificação local registrada: 46 casos distintos em seis arquivos de Script, via runs pontuais com `ORCHESTRA_LOCAL_TESTS=1`, reaproveitando passes e repetindo somente implementação/witness afetados. Typechecks package-local de Script/CLI e `bun typecheck tsconfig.packaging.json` de Desktop passaram; esse config declara somente os scripts/configs de packaging que alcança. Vinte outcomes vermelhos esperados comprovaram mutações nas proteções. Nenhuma suíte ampla ou aplicação GUI foi iniciada localmente.

Reviews fecharam lookup CLI antes de target validation, fixtures com cwd ambíguo, inputs Nix sem Atlas, parsing Git não-NUL/text-mode, manifests symlink, collisions NFC/nomes não portáveis e races de publicação/claim. Recovery verifica Git blob e SHA-256 de conteúdo separadamente, escreve em staging privado e publica sem overwrite por primitiva OS. Slots vazios existentes são reivindicados por entrada nomeada e identidade antes do staging; destinos concorrentes permanecem intactos. A primitiva macOS foi executada nos fixtures. Execução nativa Linux/Windows, hosted packaging/Nix e live multi-store recovery continuam como qualificação futura. A retenção externa dos bundles torna a cópia durável; essa implementação não autoriza remover ou extrair os archives existentes.

Exceção de cadência observada: o workflow existente `nix-toolchain` dispara automaticamente em PRs sem label que alteram `nix/**`. Runs `38504045806` e `38504046107` iniciaram na publicação das duas PRs Nix; lead solicitou cancelamento e ambos fecharam `cancelled`. Não são evidence de qualificação. As sete PRs permanecem draft, sem labels e aguardam aprovação humana do lote. CI final continua reservado ao bundle após todas as entregas; futuras publicações Nix precisam considerar esse trigger existente.

`fork/dev` mais recente, `45133cd0d205e87556e991d7ecd231926a8da1c9`, integrou native closure de outra campanha. O delta de seus paths não altera arquivos owned desta wave; a tree revisada/curada ainda não herdou esse avanço. Fazer o join dos seams relevantes antes da qualificação final, preservando a campanha alheia. Registro detalhado: `monolith-build-wave/closeout.md` e `review.json` no diretório temporário aprovado. Próximos cortes seguem sendo movimentos físicos e retenção/restauração real dos corpora antes de qualquer limpeza; a reestruturação 0–100 permanece em andamento.

### Landing autorizado — lote e dependências em dev

Owner autorizou antecipar a qualificação CI e escolheu integrar em **dev + dependências**, mantendo aprovação condicionada aos gates verdes. O bundle herdou `dev@e6c39ff72d85f6e7c4d74f9872f1bea28899bfd5` sem alterar bytes owned nem bytes recebidos das campanhas alheias. Nix toolchain, typechecks, casos novos e dependências foram qualificados; falhas Windows de fixtures/CRLF/encoding e a posição absoluta de eventos foram corrigidas por delta e requalificadas somente nos casos afetados.

As 23 PRs #336, #338, #339, #341, #343, #344, #397, #395, #398, #396, #472, #479, #477, #475, #478, #476, #500, #501, #505, #504, #499, #502 e #503 estão integradas em `dev`. Head final `e87fd95799cba0220abf5c86b203bc8d82b29732`; tree `31bd7ae54025dfd0bd47a720427c2cd05dc8b3ed`, byte-idêntica ao source qualificado `build-qualification@b09a1777d15def525514a57430d4973eba9efa6f`. Cada landing verificou head, parents, diff/escopo/budget e tree; commits de merge preservaram a ancestry publicada e cada PR ficou abaixo de 400 linhas alteradas. As 23 branches remotas foram removidas após conferir os recibos de merge, preservando worktrees dirty dos autores/plano.

Evidence consolidada: [gate de landing](https://github.com/gustavomhss/hugr-orchestra/pull/291#issuecomment-6167150962), com runs e deltas completos. Registros locais em `monolith-build-wave/landed.json` e `landed-closeout.md`. Esse landing fecha preparação de tooling/docs/contratos de paths e recovery portátil; movimentos físicos, retenção/restauração dos corpora reais e live multi-store recovery continuam no plano. Não equivale à conclusão da reestruturação 0–100.

### 20-B1 — retenção e restore do corpus visual real

Owner escolheu `/Users/gustavoschneiter/Documents/HuGR/orchestra-recovery`, fora do repo, mantendo bundles até encerrar a janela de rollback. O snapshot completo de `specs/orchestra-visual/handoff` em `e87fd95799cba0220abf5c86b203bc8d82b29732` foi publicado em `visual-handoff-e87fd95799cb` nesse destino: 57 arquivos, 227.881.816 bytes, manifest SHA-256 `b81b3eaec6ea820a3bc950f8242c3c616887e61429803e3100ec5ae8592b628d`. Inclui archives, mock aprovado, receipts/manifests e restore utility juntos.

Restore real em destino vazio comparou lista exata, bytes e modes contra Git imutável enumerado por oracle independente. Controles com membro ausente/corrompido falharam antes de criar output. A utility original restaurada reconstruiu o archive histórico de 207.658.700 bytes; SHA-256 completo `27921a7b12d047070c8c4672f110a56c5edef9a97dcb608f6b8826d1b4e16d48` preservado. Receipt completo permanece junto do bundle; a cópia temporária é somente proof workspace.

[PR #524](https://github.com/gustavomhss/hugr-orchestra/pull/524), `visual-recovery@f577fb30e089635e5084fd3c2fbde3cbf32b1652`, publica índice/guia/ponte em 65 linhas. Reviewer frio independente conferiu metadata Git, receipt e hash do manifest. Sem novo CI ou repetição de casos anteriores; foram executadas captura/restauração reais e seus controles neste escopo. Esse checkpoint não remove originais: extração/equivalência por membro dos tarballs, migração de readers e limpeza precisam do corte seguinte. 20-B global e movimentos físicos permanecem abertos.

### 40-A1 — primeira relocação física: Relay

[PR #525](https://github.com/gustavomhss/hugr-orchestra/pull/525), `relay-module@27be69d1eaf56606a19c312e8f20c4d2c4cdb27e`, move a árvore inteira de `packages/relay` para `modules/relay` sobre `dev@e87fd95799cba0220abf5c86b203bc8d82b29732`. A identidade pública `@orchestra/relay`, versão, exports/conditions SQLite, dependências, profiles, fixtures/goldens e oracle permanecem. Workspaces/lock/registry, harness Core, fixture App, governance, cwd/cache Python e guards de rename seguem o novo endereço.

Comparação completa independente: 3.652 members/modes idênticos, 3.648 blobs iguais; quatro exceções explicadas são o INDEX regenerado, dois paths operacionais e o scanner que encontra Core no local preservado. Runtime source/profiles/goldens/fixtures e os 14 SHA-256 do ORACLE estão byte-idênticos. Dados/provenance históricos não foram regravados para acomodar o move.

Install frozen sem lifecycle scripts e typechecks Relay/Core/App passaram. Checks localizados passaram: 5 layer/Node/seeding, 2 runtime guards, 4 Core binding/evaluator/frozen-fixture, 1 Arsenal scan, 33 docs e 63 profile/compiler Python. Docs guard/index foram conferidos no local novo. Dois reviewers frios aprovaram mapping/internals e consumidores externos separadamente. Sem CI intermediário ou suíte ampla; qualificação native/Nix permanece no bundle final. PR está draft para próximo lote de landing. Este checkpoint executa movimento físico real; demais movimentos e qualificação global seguem no plano.

Exceção automática da publicação Relay: `omni-delivery-campaign` iniciou o run `38567579099`; lead cancelou e o estado final foi `cancelled`. Não é qualificação da relocação.

### 40-B/C — capacidades, Arsenal e especialistas em paralelo

Owner pediu execução autônoma e paralelização, sem checkpoints de microtarefas. Três autores em worktrees disjuntos entregaram movimentos sobre Relay; lead integrou manifests, registry, caches e readers compartilhados. Três revisores frios independentes aprovaram diffs e correções.

| Entrega draft | PR | Head publicado |
| --- | --- | --- |
| Capability assets → `modules/capability-assets` | [#526](https://github.com/gustavomhss/hugr-orchestra/pull/526) | `d8f05a7cf279d51ecd5d6cdde0d429c7edd00c7c` |
| Arsenal → `modules/maestro/arsenal` | [#528](https://github.com/gustavomhss/hugr-orchestra/pull/528) | `8ee8665fc13e3abad78e12b5559efa8d86e5389d` |
| Backend/Archie → `modules/specialists/{backend,archie}` | [#527](https://github.com/gustavomhss/hugr-orchestra/pull/527) | `c4613ed94fa724dcc3f2faaf54b8c21cd7be2635` |

Capability preservou seus 12 members/blobs; Arsenal preservou 112 members/modes e 108 blobs, incluindo todos os 82 members de runtime, manifest e licenças. Quatro exceções internas são paths/depth de testes/config. Backend preservou 74 arquivos, Archie sete; árvores de skills continuam `ed34b12c812aa6794a2151863270af9e3e48c3d9` e `1021f5d5117d15277435d19803762cfa40dc166b`. READMEs novos ficam fora das skills; bytes, IDs, caches, payloads, precedência e permissões permanecem.

Foram executados 82 casos locais distintos, sete typechecks package-local e seis mutações vermelhas reais; uma correção posterior acrescentou um caso localizado e controle vermelho para incluir assets manifestless no fingerprint Nix. Zero suites amplas; somente casos novos/afetados repetidos após falha ou delta. Bun/Node bundles reais preservaram Backend/Archie e controles Jimmy; snapshot do segundo seat, CLI payload de todos os seats, authority, lazy imports e fixtures de registry foram exercitados. Bootstrap Node pré-Bun manteve aliases antigos nos diretórios novos.

Dois defeitos de integração foram corrigidos: glob Bun com alternativa contendo slash enumerava vazio; os três scopes passaram a ser scans separados. O fingerprint Nix precisava incluir `modules` além dos módulos registrados para alcançar os especialistas sem manifest. Revisão também corrigiu statements atuais de Archie sem reescrever receipts/citações históricas. Artefatos Omni debug locais foram construídos somente para os casos de processo após install script-free; gates mantiveram modo nativo, sem delegação.

Sete workflows existentes dispararam automaticamente nessas três drafts; todos foram cancelados. O follow-up Nix da #527 iniciou automaticamente [38586618990](https://github.com/gustavomhss/hugr-orchestra/actions/runs/38586618990) em `c4613ed94f`; prepare, quatro toolchain rows nativas e completion terminaram success antes da detecção. É resultado automático do predecessor, não qualificação da composição final nem de distribuição. Sem dispatch manual; a cadência de CI final continua.

### 40-B e tooling — brand, generator e recorder

A execução continuou sem pedir novo checkpoint: três autores separados moveram brand, HttpApi generator e recorder. Outros três revisores frios aprovaram source e controles, incluindo correção de raw-byte proof e controle não-cassette dentro do próprio módulo.

| Entrega draft | PR | Head publicado |
| --- | --- | --- |
| Identity source → `assets/brand` | [#552](https://github.com/gustavomhss/hugr-orchestra/pull/552) | `13fc01231bc440853602ca08416fd9b01dc74b7d` |
| HttpApi generator → `tooling/httpapi-codegen` | [#551](https://github.com/gustavomhss/hugr-orchestra/pull/551) | `9a84752bff24907d514de57e1b357ae03d4e530b` |
| HTTP/WebSocket recorder → `tooling/http-recorder` | [#553](https://github.com/gustavomhss/hugr-orchestra/pull/553) | `e96ca6257abe867d43aa9ce80ffbb3e2a90b6add` |

Brand preservou seis blobs/modes; generator preservou 21 members/modes, 20 blobs e seus seis fixtures gerados (uma exceção é import Schema de teste); recorder preservou 24 members/modes, 22 blobs e ambos cassettes (metadata de localização/README são as exceções). Source lookup, workspace/lock/registry, LF/caches/guards/receipts e Nix incluem os paths novos; preparation Nix cobre node_modules por raiz/depth, sem perder a precondição da raiz.

Composição final recuperável: `recorder-paths@e96ca6257abe867d43aa9ce80ffbb3e2a90b6add`, tree `d579ed041a1685090c64d9f19007c0bbea1984be`; receipt `tooling-wave-proof.json`, fingerprint de inventário `64bf96fbdbc341923af7a48075370676e7d6fcf87dfe4873abf9e1e400fc3980`. Nessa onda, 17 casos locais afetados, quatro mutações vermelhas e sete typechecks package-local passaram. Casos reaproveitados só rerodaram quando seus inputs mudaram. `bun run check:generated` executou o generator real: Client gerado ficou byte-idêntico e limpo, inclusive untracked. Client/Protocol/Server/Schema inteiros permaneceram iguais. Replay HTTP/WebSocket e um prompt V2 gravado executaram offline com `CI=true`/auth fixture, sem gravar cassettes ou chamar provider live.

Nenhuma PR nova foi integrada em `dev`; stack depende de #525 e aguarda próximo lote aprovado pelo owner. `dev` continuava `e87fd95799cba0220abf5c86b203bc8d82b29732` no último refresh. Retenção de archives, runtime instalado, dados e WIP alheio permanecem preservados. Omni/Atlas, entradas/apps, boundaries internos, limpeza reconciliada e qualificação global seguem nos WPs próprios; essas duas ondas não declaram 100 concluído.

### 50-A/C — readers históricos preparados antes de Omni/Atlas

Steering posterior do owner: **Luna nas tarefas mais simples; evitar repetir testes**. Dispatch confirmou `gpt-6-luna` em mapas, Omni/fixtures e wiring frio; Sol manteve readers Atlas complexos, integração e revisão adversarial. Autores não executaram testes. Lead reaproveitou passes, selecionando novamente somente falhas, inputs novos e controles mutantes creditados.

| Preparação draft | PR | Head |
| --- | --- | --- |
| Mirror Omni por prefix/revisão, pins e SHAs preservados | [#607](https://github.com/gustavomhss/hugr-orchestra/pull/607) | `403a24e3bda5de32e1d1a1ee02af8880505439e5` |
| Own/EARS por root histórico, corpus e IDs preservados | [#606](https://github.com/gustavomhss/hugr-orchestra/pull/606) | `8c2721cbe3d6cbda9bda5181e3396318122a7556` |
| Baseline Atlas privado e alcance histórico dos fixtures CI | [#605](https://github.com/gustavomhss/hugr-orchestra/pull/605) | `c880860af7c87d3eac4d9909a395367662e8cfdc` |

Composição `atlas-baseline@c880860af7c87d3eac4d9909a395367662e8cfdc`, tree `766324e0eda0a42d88f66706a0fe0f6c509ec590`, byte-idêntica à fonte executada `historical-prefixes@bece546304b9005395c615f12bb42c88cf185d05`. Nenhuma árvore física nativa mudou neste lote. Runtime/Cargo/npm locks, requirements, OWN-SNAPSHOT e Own estático permaneceram.

Dez casos locais novos passaram: três mirror com grafo real/import pins/oracle legado, quatro roots/EARS em Git real, um Own compilado/materializado/verificado antes/depois do move sintético, um wrapper de projeção e um checkout shallow real restaurado pelo shellstep da receita. Cinco controles lead falharam: sem prefix novo Omni; sem prefix velho Atlas; fallback vazio amplo; Git replacements apagando corpus EARS; fetch histórico substituído por no-op. Bytes corretos restaurados sem rerun positivo de rotina. Atlas manteve `npm ci`/project build por `bun typecheck`; Script typecheck passou. Não houve suite de produto, CI manual ou acesso ao mirror real.

Revisão fria encontrou P1: resolver desabilitava `git replace`, mas reads históricos posteriores ainda aceitavam replacements, permitindo EARS passar como corpus novo. A correção desabilita replacements consistentemente nos executores/ancestry e acrescenta witnesses reais de gate/Own; somente dois casos afetados rerodaram. Revisão de delta aprovou. CI recebe histórico completo apenas nas lanes contendo Script e no request Script/Bun, com fixture real demonstrando objeto ausente antes e disponível depois. Limitação herdada do mirror continua explícita: validação por árvore+trailer, sem nova garantia contra forged provenance de árvore igual.

O corte físico seguinte foi implementado e publicado abaixo. Aprovação humana de landing e qualificação global final continuam separadas.

### 50-B/C — Omni, Atlas e boundary fisicamente relocados

Quatro autores Luna trabalharam em write sets disjuntos (campanha Omni, interior boundary, workflows e consumidores de prova); lead integrou registries, manifest/lock, source readers, loader, guards e Nix. Quatro revisores frios independentes cobriram a composição; Luna fez os retargets mecânicos e Sol revisou preservação nativa e contratos compartilhados. Revisões de delta fecharam os dois achados antes da publicação.

| Entrega draft | PR / base | Head publicado |
| --- | --- | --- |
| `packages/omni` → `native/omni` | [#615](https://github.com/gustavomhss/hugr-orchestra/pull/615), sobre `atlas-baseline` | `ea9fe371cf5a9eff515cb4b3c3bfc3ce18f47d1d` |
| `foundation/atlas` + `packages/atlas-boundary` → `modules/atlas` + `modules/atlas/boundary` | [#614](https://github.com/gustavomhss/hugr-orchestra/pull/614), sobre `omni-module` | `1f1d2f8801b420f59004cc3c81b3ed99901dbe60` |

Composição final: tree `ff111cb5e96f7e9fd760643025d71991dc6da5dc`, byte-idêntica à fonte executada `native-relocation@79ecaf6302385283400abd15ec4807353c8f04fa`. Merges internos somente sincronizaram fixes entre as duas branches da stack; nenhuma nova PR foi integrada em `dev`.

Preservação Git independente: Omni manteve os 406 members/modes/types, 384 blobs exatos e 22 exceções declaradas de campanha/path/config/documentação; Atlas manteve seus 1.269 members/blobs/modes exatos; boundary manteve 16 members/modes, 11 blobs exatos e cinco exceções de path/depth/config/test. Todo Rust/runtime binding, Cargo/QA manifests+locks, conformance/licenças, corpus/Own/npm lock Atlas e os oito JS/DTS gerados do boundary permaneceram byte-idênticos. Não há troca de engine, identidade pública, toolchain ou contrato de dados.

Checks locais novos/afetados: frozen install script-free; metadata Cargo root/QA `--locked --no-deps`; resolução real de `hugr-omni` pelo Core no novo path; typechecks package-local Core/Script/Orchestra/CLI/boundary e Desktop packaging; generator real boundary `check:generated` uma vez, sem drift; spawn gate com 77 sites declarados. Cinco casos focados distintos passaram, incluindo domain moves/pins, malformed registry, host boundary, diretório registry nos dois modos de source e scratch campaign instrumentation. Somente os dois casos de registry afetados pelo reparo de discovery e Core typecheck rerodaram por delta; nenhum passe histórico ou suite ampla foi repetido por rotina.

Achados fechados: scratch copy ainda procurava o import antigo e falhava carregando o módulo; a string agora corresponde ao import físico. Inventory confundia registry em formato diretório com ausência; presença agora usa metadados filesystem/Git da revisão capturada, rejeita tipo não regular e só permite fallback por ausência real. Fixture cria/commita um diretório real, depois remove o checkout antes de verificar a revisão imutável. A remoção isolada do lookup Git tornou essa segunda perna vermelha. Diretórios não vazios têm witness runtime; empty Git trees, symlinks, erros de acesso e discovery drift têm revisão de implementação, sem alegação de witness equivalente.

Controles medidos: excluir o boundary do guard host falhou; forçar fallback diante de registry malformed falhou; scratch import quebrado e diretório registry falharam antes dos fixes; omitir só o metadata lookup Git falhou na asserção imutável. Mutações restauradas por patches reversos e igualdade Git, sem rerun positivo de rotina. Fixtures sem spawn declarante imprimiram `not applicable`; não são prova de execução Omni.

Inventory real final: 49 declarações, producer SHA-256 `878869cdf69391b89155db6fd3154789cb172d79151b65cda3aa0348a5822740`, fingerprint `176820ba984bafc927c9c4365ccb7941701b6368279917fe673548fce1c2c531`, qualificação `syntax-and-declaration-shape-only`. Receipts locais: `native-move-proof.json`, `native-move-inventory-final.json`, `native-move-mutations.md` e reviews frios em `/var/folders/lt/z11pyzhj0m17vn798jkk69hh0000gn/T/opencode`.

Sem dispatch manual de CI intermediária. As drafts dispararam seis workflows automáticos, todos confirmados `completed/cancelled` conforme a cadência do owner: #615 `38619323308`, `38619323242`, `38619323263`, `38619323232`; #614 `38619323528`, `38619323983`. Seus resultados não qualificam entrega. [Handoff consolidado publicado em #291](https://github.com/gustavomhss/hugr-orchestra/pull/291#issuecomment-6176051294), referenciado em ambas as drafts. Hosted ABI/platforms, release/npm/installer, Nix delivery, qualificação global e landing humano continuam nos respectivos gates. Este lote fecha a implementação física revisada, não a campanha 0–100.

### Landing do lote físico e próximos movimentos — 17 e 18 de outubro de 2026

A campanha voltou para o Claude Code em 17 de outubro. A cópia não commitada deste plano foi perdida junto com o worktree que a guardava; o conteúdo acima foi reconstruído a partir das 41 edições gravadas na sessão anterior e confere com a última leitura registrada.

- **#681, mergeado em `dev` (`ca6d9b5625`):** as 14 drafts (#524–#615) e o corte `web-entry` entraram juntos.
  - O lote foi juntado duas vezes com `dev`, que estava 650 commits à frente.
  - Os conflitos e as referências novas do `dev` aos caminhos antigos foram corrigidos.
  - Uma rodada completa do epic CI passou antes do merge.
  - Defeitos achados pelo CI e pelas auditorias: caminhos relativos de profundidade errada em workflows e fixtures, fixtures e2e servidas da raiz web movida, ledgers com chaves por caminho e timeouts dos testes do espelho no Windows.
- **#738 (60-B/C):** `packages/{orchestra,desktop,cli,storybook}` foram para `apps/`.
  - Um codemod recalculou cada caminho relativo de import e config a partir da nova posição.
  - Uma auditoria Sonnet/Haiku corrigiu mais 15 caminhos construídos por variável, regex ou heredoc.
- **#755 (20-B/C), empilhado sobre #738:** `specs/orchestra-visual/{handoff,evidence,screenshots}` saiu da árvore.
  - O conteúdo está retido em `HuGR/orchestra-recovery`; a restauração de evidence e screenshots conferiu 100 de 100 blobs.
  - `docs/archives` indexa os dois bundles.

Próximos marcos: evidência e pesquisa restantes (`specs/backend-specialist`, `apps/orchestra/specs/benchmark-evidence`) com retenção antes da remoção; documentação viva de `specs/` para `docs/`; depois 70–80 (modularidade interna).
