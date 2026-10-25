# Mapa do monólito Orchestra

Auditoria ampla: `dev@49ab2cec4f77bdbb33314503da4d85fcd075114e`, 2026-10-11; delta revisado até `5e7d3eb2d2cf1abb50e208466ff09fd185cb8445`. Este mapa substitui o diagnóstico de `30c3f713cf`; não reutiliza seus números de volume nem suas conclusões de código morto. O [plano 0–100](restructure-plan.md) define destinos, ordem, provas e rollback.

Auditoria de fontes, manifests, consumidores e readers em worktrees isolados. Os checks abaixo foram **identificados, não executados**. Toda execução futura precisa registrar revisão, alvo e alcance.

## 1. O que mudou no diagnóstico

| Premissa antiga | Fato da baseline atual | Fonte |
| --- | --- | --- |
| `packages/cli` é rewrite morto | CLI `orchestra` está empacotada no Desktop; V2 chama service status/start/password | `packages/cli/package.json:7–16`; `packages/desktop/src/main/background-cli.ts:20–61` |
| Lean ainda não entrou | Core usa `hugr-lean@0.2.0` de tarball imutável aprovado; Orchestra integra captura/preferences/API | `packages/core/package.json:67`; `packages/core/vendor/README.md:6–30`; `packages/orchestra/src/session/LEAN-NATIVE.md:3–51` |
| Todo import de fatia inverte arquitetura | Omni fornece infraestrutura de processo; há integrações de produto e imports de tipos que precisam de análise distinta | `packages/core/src/omni-spawner.ts:54–66,139–150`; `packages/core/src/tool-safety-hooks.ts:9–22` |
| Nested `.github` é todo descartável | Omni usa workflows no espelho; Atlas fitness test lê seu `ci.yml` | `script/omni-mirror.sh:2–19`; `foundation/atlas/harness/gates/gate-directory.test.mjs:55–66` |
| LICENSE Atlas é cópia dispensável | Atlas tem LICENSE Apache-2.0 | `foundation/atlas/LICENSE:1–3` |
| Specs/tasks/docs de campanha são todos lixo | Parte é parser input, runtime asset, golden, corpus ou trabalho ainda aberto | Seções 4–5 abaixo |
| Um server/SDK basta por troca direta | Gerações têm contratos, eventos, erros e consumidores diferentes; listener legado também monta handlers novos | `packages/orchestra/src/server/routes/instance/httpapi/api.ts:49–96`; `packages/orchestra/src/server/routes/instance/httpapi/server.ts:134–207` |
| Mover app para `apps/web` é rename simples | App exporta biblioteca importada pelo renderer Desktop | `packages/app/src/index.ts:1–19`; `packages/desktop/src/renderer/index.tsx:429–435` |
| Menos workflows prova organização | Há novas lanes de runtime/native/Nix; remover wrapper pode remover cobertura | `.github/workflows/runtime-products.yml`; `.github/workflows/artifact-native.yml`; `.github/workflows/nix-distribution.yml` |

Esses fatos tornam inseguras as remoções globais do plano anterior. O problema continua real: ownership misturado, path coupling, APIs abertas demais, migrações incompletas e excesso de material de campanha na árvore ativa.

### Delta de dev durante a auditoria

- PR #332 (`d126e5a109`): `core/src/util/task-tool.ts` é compartilhado por App/session-ui/TUI. `task`, `Agent` e `Task` têm o mesmo rendering; dispatch seat precede subagent type. Entra no contrato de 70-B.
- PR #318 (`5e7d3eb2d2`): Nix distribui e qualifica tree-sitter no CLI, CLI staged e Desktop; exige imagem native/load/parse e receipt de completion. `nix/scripts/workspace-paths.json` resolve o build helper sem auto-install. Esses caminhos/probes entram em 30-C/E e na qualificação final.
- Não houve inclusão de novo pacote de produção nesses deltas. Os diffs de manifests/domínios e os arquivos alterados foram revisados; a evidência de execução continua fora do alcance desta auditoria.

## 2. Mapa completo de unidades de produção e desenvolvimento

As linhas são unidades lógicas. Um dataset pode não ter `package.json`; um módulo pode conter workspace coeso. Destino é **proposta**, não descrição de movimento já feito. Identidade pública permanece inicialmente igual.

| Caminho atual | Identidade / papel | Destino e observação |
| --- | --- | --- |
| `package.json` | `orchestra`, workspace/toolchain raiz | Raiz; distinguir do pacote homônimo na resolução |
| `packages/orchestra` | `orchestra`; CLI/server legado e composição de produto | `removed-v1`; domínios extraídos depois, contratos preservados |
| `packages/cli` | `@orchestra/cli`; CLI/daemon V2 distribuído | `apps/cli`; ativo, não candidato automático a remoção |
| `packages/app` | `@orchestra/app`; UI reutilizável + entrada web | `packages/app-shell` + `apps/web`; split qualificado, nome público inicial mantido |
| `packages/desktop` | `@orchestra/desktop`; Electron + delivery | `apps/desktop`; Dock e infra separados por fronteiras reais |
| `packages/storybook` | `@orchestra/storybook`; workbench dev | `apps/storybook` |
| `packages/schema` | `@orchestra/schema`; contratos browser-safe | `packages/schema` |
| `packages/protocol` | `@orchestra/protocol`; HttpApi público | `packages/protocol` |
| `packages/core` | `@orchestra/core`; Session/config/tools/persistência/serviços | `packages/core`, domínios internos explícitos; toolkit extraído depois |
| `packages/server` | `@orchestra/server`; handlers/authorization/Location | `packages/server` |
| `packages/client` | `@orchestra/client`; clientes Promise/Effect | `packages/client` |
| `packages/sdk/js` | `@orchestra/sdk`; SDK público legado/root/v2 | `packages/sdk`; compatibilidade por consumidor antes de convergir |
| `packages/sdk-next` | `@orchestra/sdk-next`; embedded composition | `packages/sdk-next` |
| `packages/plugin` | `@orchestra/plugin`; APIs de plugins/TUI | `packages/plugin` |
| `packages/llm` | `@orchestra/llm`; providers/protocolos | `packages/llm`; reconcile Copilot somente por prova |
| `packages/codemode` | `@orchestra/codemode`; interpreter/tool programs | `packages/codemode` |
| `packages/effect-drizzle-sqlite` | `@orchestra/effect-drizzle-sqlite`; adapter SQLite | Mesmo caminho; contract Bun/Node preservado |
| `packages/effect-sqlite-node` | `@orchestra/effect-sqlite-node`; adapter declarado por Core | Mesmo caminho até consumer/retirement proof; não marcado morto |
| `packages/ui` | `@orchestra/ui`; primitives/theme/assets | `packages/ui` |
| `packages/session-ui` | `@orchestra/session-ui`; transcript/diffs/composer | `packages/session-ui` |
| `packages/tui` | `@orchestra/tui`; renderer terminal/plugins | `packages/tui`; library, não entrypoint separado por obrigação |
| `packages/httpapi-codegen` | `@orchestra/httpapi-codegen`; generator | `tooling/httpapi-codegen` |
| `packages/http-recorder` | `@orchestra/http-recorder`; cassettes reais de teste | `tooling/http-recorder` |
| `packages/script` | `@orchestra/script`; build/version/delivery | `tooling/build`; identidade preservada |
| `packages/relay` | `@orchestra/relay`; TS runtime + oracle Python/bash | `modules/relay`; goldens, generators e profiles ficam íntegros |
| `packages/maestro-arsenal` | `@orchestra/maestro-arsenal`; registry/MCP/capabilities | `modules/maestro/arsenal` |
| `packages/capability-assets` | `@orchestra/capability-assets`; catálogo/provenance | `modules/capability-assets`; reservas declaradas não provam wiring executável |
| `packages/backend-specialist` | Dataset de skills | `modules/specialists/backend`; README fora de `skills/` |
| `packages/archie-specialist` | Dataset de skills upstream | `modules/specialists/archie`; stable ID e lookup preservados |
| `packages/identity` | SVG/PNG de marca | `assets/brand` |
| `foundation/atlas` | `atlas`; workspace npm com DAG @atlas | `modules/atlas`; domínio npm qualificado, campanha Bun opcional separada |
| `packages/atlas-boundary` | `@orchestra/atlas-boundary`; bundles/declarações | `modules/atlas/boundary`; bytes/provenance preservados |
| `packages/omni` | Workspace Rust process runtime | `native/omni`; root e QA workspaces distintos |
| `packages/omni/bindings/node` | `hugr-omni`; NAPI JS/TS binding | Mesmo subtree relativo dentro de `native/omni` |
| `packages/core/vendor/hugr-lean-0.2.0-native-465fb4c04773.tgz` | `hugr-lean@0.2.0`; dependência aprovada | `vendor/lean`, somente retarget equivalente do arquivo atual |
| `packages/app/vendor/opencode-ai-client-1.17.13-v2.tgz` | Client upstream vendorizado | `vendor/client`; remover só depois de migrar todos os consumidores |

### Submódulos Atlas, sem achatar o DAG

Todos hoje ficam em `foundation/atlas/packages/<nome>` e propõem-se em `modules/atlas/packages/<nome>`, mantendo o nome `@atlas/<nome>`:

| Nome | Responsabilidade |
| --- | --- |
| `contracts` | Contratos e tipos fundamentais |
| `kernel` | Modelo/identidades/regras fundamentais |
| `persist` | Persistência do conhecimento |
| `index` | Indexação |
| `grounding` | Ligação entre conhecimento e fontes |
| `knowledge` | Estado/revisões de conhecimento |
| `retrieval` | Seleção/recuperação |
| `memory` | Memória governada |
| `tools` | Operações expostas |
| `genesis` | Inicialização/composição |
| `adapter-io` | Integração com filesystem/Git/prompts |
| `cli` | CLI Atlas |
| `mcp-server` | Exposição MCP |
| `e2e` | Qualificação de integração |
| `e2e-blackbox` | Qualificação black-box |

Fontes: `foundation/atlas/package.json:6–29`; `foundation/atlas/ARCHITECTURE.md:7–76`. E2E packages são unidades de teste, não bibliotecas de runtime.

### Native/QA e manifests auxiliares

- Cargo root Omni: `crates/hugr-omni`, `crates/omni-proto`, `crates/omni-supervisor`, `crates/omni-fixture`, `bindings/node`. A binding herda o workspace; não é terceiro workspace Cargo.
- Cargo separado: `packages/omni/qa`, crate `omni-qa`, lock próprio e path dependencies. Preservar separação até qualificação independente.
- `packages/omni/qa/vite/package.json` (`qa-vite`), `packages/omni/scripts/readme-check/fixture/package.json` (`fixture-app`) e `packages/desktop/test/omni-smoke/package.json` pertencem a harnesses/fixtures, não ao workspace de produção por glob indiscriminado.
- Licenças/pins no vendor são unidades de distribuição, não packages a executar.

Fontes: `packages/omni/Cargo.toml:1–11`; `packages/omni/qa/Cargo.toml:10–22`; manifests auxiliares citados.

## 3. Domínios escondidos dentro dos pacotes

| Domínio atual | Ownership desejado | Fronteira a preservar antes de extrair |
| --- | --- | --- |
| `core/src/session`, `session.ts` | Session | Admissão, projeção, execution coordinator, model turns, safe boundaries |
| `orchestra/src/agent` | Framework Agent em Core + contribuições Maestro na composição | Service/tag/Instance scope, generate prompt, defaults/aliases/labels/subagent permissions |
| `core/src/system-context` | System Context | Álgebra/registry; producers nos domínios; history/epoch Session-owned |
| `core/src/database`, `config`, `permission`, `filesystem`, `project`, `tool` | Domínios internos Core | Paths/journal/cache/scope/registry e APIs explícitas |
| `core/src/backend-toolkit` | Engine de plataforma interna Core + assets em `modules/backend-toolkit` | Recipe/default provenance, aquisição/readiness/process capability; nenhuma dependência circular |
| `orchestra/src/maestro`, `playbooks` | `modules/maestro` | Seats, governance, Task, proposal/settlement, Own/Atlas |
| `orchestra/src/continuity` | `modules/continuity` | Serviço compartilhado, persistence/admission e engine adapters |
| `desktop/src/main/app-dock-*`, Orchestra plugins e App controllers | `modules/app-dock` | IPC, autorização, profiles/generations, controller lifetime, browser/Linux separation |
| `orchestra/src/claude-code` | Adapter de engine na composição de produto | Preset, permission, durable mirror, process joining e pause guard |
| `orchestra/src/acp`, Core `control-plane` | Adapter ACP e Core service explícitos | SDK/session contracts e move-session ownership |
| `app/src/orchestra`, `pages/session`, `context` | App-shell feature/domain modules | Server/directory ownership, tabs/drafts, async cancellation e theme/locale |
| Desktop WSL/Omni/window/updater | Desktop platform adapters | Process/data identity, resource placement e estado de updater existente |

O número de pacotes só cresce quando a separação precisa de contrato, distribuição ou toolchain independentes. Uma pasta com responsabilidade e README pode ser um módulo interno suficiente.

### Disposição completa dos domínios legados de Orchestra

Prefix da primeira coluna: `packages/orchestra/src/`. Os owners abaixo são lógicos; preservar scopes/IDs/exports e facades V1 até migrar cada consumidor. Cada owner ganha README na raiz adequada. 70-G reconcilia esta tabela com todos os diretórios/arquivos reais; novo domínio descoberto precisa de disposição antes do fechamento.

| Fonte | Owner/path final | Facade e WP de resolução |
| --- | --- | --- |
| `cli`, `index.ts`, `temporary.ts` | `removed-v1/src` entrada/bootstrap/composição | Comandos legados, Node facade e build assets preservados; 60-B, 70-G, 80-A |
| `node.ts` | Facade pública de composição; implementations nos owners abaixo | Preserve Config/Server/bootstrap/Database exports; 70-F/G, 80-A/B |
| `server` | `packages/server/src/compat/v1` + handlers canônicos | `/doc`, UI/static/lifecycle e auth/SSE preservados; 70-G, 80-A |
| `session`, `storage`, `background` | Core `src/v1` Session/storage/jobs; orquestração legada em `modules/session-engine` | Model/store/history/platform helpers separados de SessionPrompt/Continuity/Claude wiring; Instance scope/#db preservados; corte 70-C antes de 70-D/G, 80-A |
| `agent` | Core Agent/compat V1; roster/presets/native-seat policy nos módulos de produto | Service/tag/scope, generate.txt, defaults/labels/aliases/subagent permissions; injeção de produto em 70-C antes da extração; 70-A/G, 80-A/B |
| `config`, `permission`, `question`, `command`, `skill`, `env` | Core config/policy/interaction/instruction com compat V1 | Defaults, permission order, reader paths e errors; 70-A/G, 80-A |
| `account`, `auth` | Core account/credential e compat auth.json | OAuth/API identity, herança/read-only e stores; 70-A/G, 80-D |
| `project`, `git`, `worktree`, `snapshot` | Core project/repository/filesystem e compat V1 | Identidade/worktree/revisions/receipts/scopes; 70-A/G, 80-A |
| `provider`, `plugin` | Core provider/plugin-host + LLM transport owners | Presets/hooks/headers/auth/variants e API de plugins; 70-G, 80-B/D |
| `tool` | Core tools/registry/compat V1; adapters de produto no respectivo módulo | Mesmas permissions/capture/settlement; 70-C/G, 80-A |
| `lsp`, `mcp`, `ide`, `format` | Core `integration/{lsp,mcp,ide,format}` e adapters compat V1 | Connections, LSP state, spawned processes e editor capabilities; 70-G, 80-D |
| `control-plane` | Core `control-plane`, handlers no Server | Process-global move service e rotas existentes; 70-G, 80-A |
| `acp` | `modules/acp` | Adapter/protocolo SDK, sem nova Session orchestration; 70-G |
| `maestro` | `modules/maestro` | Seats/governance/Task/Atlas/Own; 70-D |
| `continuity` | `modules/continuity` | Serviço canônico + engine/transport adapters explícitos; 70-D |
| `claude-code` | `modules/engine-adapters/claude-code` | Preset, paused guard, mirror e process joining; 70-G |
| `janitor` | `modules/janitor`; bindings Desktop/CLI no app | Background loops/resources/history; 70-G |
| `bus`, `event-manifest.ts`, `event-v2-bridge.ts`, `sync` | Core event compatibility + contratos schema quando portáveis | Mesmo GlobalBus singleton/ID/shape/bridge; 70-G, 80-B |
| `effect` | Core infrastructure + compat Instance boundary | MemoMap/tags/finalizers; bindings app ficam composição; 70-A/G |
| `installation`, `util`, `id`, `image`, `patch` | Core infrastructure; helpers browser-safe em `packages/util` | Public aliases e bytes/encoding/paths preservados; 70-B/G, 80-D |
| `audio.d.ts`, `markdown.d.ts`, `sql.d.ts` | Declarations do pacote que usa cada loader/asset | Build-resolution/type contracts, sem runtime novo; 60-D, 70-G |

Fontes de distinções importantes: `orchestra/src/background/job.ts:17–35` mantém registry Instance-scoped; `src/bus/global.ts:11–22` é singleton com atribuição de ID; `src/node.ts:1–4` exporta API; `src/lsp/lsp.ts:120–147` contém state/service, não apenas bootstrap. Relocar o monólito não fecha apps finos; 70-G precisa qualificar essa disposição por consumidor.

`src/agent/agent.ts:12,32–46,82–119` liga framework/prompt a contribuições Maestro; `src/agent/subagent-permissions.ts:14–25` define herança de permissões. `src/session/prompt.ts:26–29,125–137`, `src/continuity/service.ts:3–11,112–149` e `src/claude-code/engine.ts:18–36,55–90` exigem o corte de contratos/wiring 70-C antes de qualquer import retarget. Mover SessionPrompt inteiro para Core criaria dependência de produto na plataforma; sua orquestração legada tem owner específico em `modules/session-engine`.

## 4. Dependências e contratos que determinam a ordem

### Session, dados e lifetimes

- `core/src/session.ts:415–439`: hooks, admissão e advisory wake; ID/retry em `session/input.ts:59–160`.
- `session/projector.ts:462–475` + `event.ts:384–431`: atomicidade da promoção e commit/notification.
- `session/execution/local.ts:14–35`, `run-coordinator.ts:67–103`, `location-services.ts:46–127`: process-global versus Location-scoped.
- `database/database.ts:43–62`, `database/path.ts:5–75`, `global.ts:10–29`, `credential.ts:172–239`: localização e compatibilidade de dados.
- `database/migration.ts:43–105`: identidade/ordem das migrações; não reaplicar reset histórico ao relocar.
- DB usa WAL (`core/src/database/database.ts:27–32`); draft store adia documents e grava blobs antes (`desktop/src/main/draft-store.ts:18–79`). Snapshot legível pode ser incompleto: flush/capture consistente e igualdade por IDs/refs/hash são pré-condições.
- `orchestra/src/auth/index.ts:10,73–88` usa `Global.Path.data/auth.json`, independente de um `ORCHESTRA_DB` temporário; `plugin/xai.ts:241–263` rotaciona refresh remoto. Sandbox precisa de isolamento de paths e identidade, não só cópia de DB.

### APIs e clientes

- `protocol/src/api.ts:30–97`: contrato atual `/api`; `server/src/routes.ts:44–73`: concrete handlers/auth/Location.
- SDK root congelado e `sdk/v2` misto continuam ativos; client Promise/Effect e sdk-next embedded têm papéis diferentes.
- Legacy prompt return/SSE `properties` versus admission atual/SSE `data` não são diferenças cosméticas.
- `orchestra/.../httpapi/public.ts:88–196,553–560` transforma OpenAPI para compatibilidade; não substituir pelo raw Protocol OpenAPI.
- Imports de SDK apenas como tipos não exigem promoção automática para runtime. Orchestra usa valores de Core com declaração em devDependencies: avaliar esse descompasso separadamente.
- Exports wildcard do Core e demais pacotes são superfície existente. Fechar o wildcard exige inventário e reexports, não um rename de manifest.

### UI e Desktop

- `app/src/index.ts`, `desktop/src/renderer/index.tsx`: facade e Platform injection compartilhadas.
- `app/vite.js`, `desktop/electron.vite.config.ts`, `ui/src/styles/tailwind/index.css`, markdown workers: aliases/globs/assets/conditions dependem de paths.
- `app/src/context/settings.tsx:57–60,121–123`: visual shell e V1/V2 transport são eixos distintos; sunset e fixtures de clock requerem análise própria.
- Desktop stores são lazy; app IDs/data roots/window/profile revisions e `drafts.sqlite` são persistência existente.
- `desktop/src/main/background-cli.ts:20–61`: CLI V2 é consumidor empacotado real.
- `desktop/src/main/app-dock-rpc.ts:132–149` versus `linux-workspace-rpc.ts:110–128`: autoridades/envelopes de RPC diferem; extração não autoriza unificá-las.

### Fatias importadas e arquivos aparentemente descartáveis

- Atlas README/ARCHITECTURE/corpus/WP cards/ledgers e `.orchestra/skills/own` alimentam parsers, scheduling e snapshot verification.
- Atlas `gate-directory.test.mjs:55–66` lê nested workflow; Own verifica revisions/paths/ancestry. Sua remoção exige migrar os readers.
- Own/materializer usam Git `revision:./path` relativo à raiz atual; EARS CI projeta prefix fixo e pode criar empty tree (`own-snapshot-guard.mjs:45–50`; `scripts/materialize-own-snapshot.mjs:100–103,171–198`; `.github/workflows/test.yml:105–116`). Reader prefix-aware por revisão precisa preceder a relocação Atlas.
- Atlas LICENSE Apache-2.0, Omni dual MIT/Apache, Arsenal Apache/NOTICE, Lean LICENSE/NOTICE/licenses/SOURCES permanecem.
- Relay `test/golden/ORACLE` + `FORMAT.md`: dados TS vêm de oracle independente; não regenerar expectativas com implementação sob teste.
- Relay `src/authoring/store.ts:239–259`: profiles são assets relativos; glob/import negativo não prova que não são usados.
- Lean pin: source `465fb4c04773f1a40733c9f4c334b980e3195646`, SHA-256 `369206cd0a468904d7896c3e729535911e9258a7d4a3e9c8eedb078b6a096ec1`; copiar repo doador atual é outra mudança.
- `orchestra/script/lean-notices.ts:18–45`: packaging verifica o archive e copia notices; não separar assets de atribuição.
- `orchestra/test/skill/backend-skills.test.ts:136–146`: README dentro da árvore de skills quebra contrato exato.
- `orchestra/src/claude-code/sdk.ts:41–67`: guard mantém engine pausada antes de ler login/spawn. Esse estado deve permanecer.

## 5. Corpus, histórico e limpeza: candidatos e bloqueadores

| Área | Material histórico candidato | Material/readers a preservar |
| --- | --- | --- |
| Visual | `specs/orchestra-visual/handoff/archives`, logs/screenshots de campaign | Mock aprovado, receipts, manifests e `restore-evidence.ts`; hash + fresh restore |
| Backend | `specs/backend-specialist/research`, delivery/session notes superseded | Acceptance/contracts atuais, obrigações e referências de testes |
| Continuity | Experiment/review notes e benchmark outputs históricos | Gold/probes/scoring/harness, contratos de prefixo e operação |
| Desktop | Briefs/recovery/plans encerrados | App Dock brownfield corpus, contract witnesses, active closeout |
| Atlas | Campaign recut/WAVE/SESSION-STATE superseded | Requirement/WP acceptance links, reference docs, Own bundle e ledgers |
| Omni | Campaign/HANDOFF seções históricas | PLAN/API/GUARANTEES/readme/skill parser inputs, conformance/QA e espelho |
| Relay | `docs/roadmaps` e outras campanhas encerradas | `bin/gen-doc-index.py`/`check-docs.py` e pointers para contratos vigentes |
| Raiz | Perf notes e organização duplicada | `CONTEXT.md` fallback, AGENTS/skills/commands descobertos, guias necessários |

Leitores demonstrados:

- `core/src/instruction-context.ts:50–58`, `core/src/skill.ts:83`, `orchestra/src/session/instruction.ts:63–67,129–143`: documentos de instrução e globs são runtime assets.
- `orchestra/test/maestro/arsenal-one-evaluator.test.ts:35–37`: contrato em `specs/hugr-maestro/arsenal-port.md` é input de teste.
- `orchestra/script/continuity-bench/v4.ts:25,67,170`: `$BENCH_DIR` e arquivos dinâmicos; `benchmark-evidence/scoring/deterministic.py` lê frozen answers.
- `foundation/atlas/harness/gates/id-integrity.mjs:149–153,300–342`: requirement/scenario/WP traceability; `doc-transcript-guard.mjs:14–31`: document output replay.
- `omni/scripts/brief.py:21–27`, `scripts/guarantees-check/check.mjs:116–119`, `scripts/readme-check/check.mjs:91–103`: PLAN/acceptance/headings/guides são entradas.
- `specs/runtime-closure/CHECKPOINT.md:48–56` e `desktop/docs/plans/dock-accessibility/closeout.md:10–16`: há obrigações abertas; idade não comprova encerramento.
- `specs/orchestra-visual/handoff/README.md:54–55`: `missingTrackedPaths` é forense, não lista de arquivos autorizados a apagar.

Nenhuma classe recebe exclusão global por regex de nome. Cada lote precisa classificação, consumers, archive quando necessário e qualificação dos readers. O Git histórico sozinho não substitui um archive restaurável com todos os dados necessários.

O inventário de limpeza é exaustivo: as áreas desta tabela priorizam, não delimitam o escopo. Todo item acumulado precisa de disposição reconciliada antes de 100.

## 6. Tooling, CI e acoplamentos de caminho

| Site | Acoplamento / risco | Pré-condição do movimento |
| --- | --- | --- |
| `script/test-ci.ts:108–160,178–226` | Presume package dir, normaliza filtros; Python depende de `.py` em todos os args | Resolver language-aware; exact-test ordering/selection mantidos |
| `test-ci-upload.ts` / `test-ci.yml` | Snapshot, ignore rules, limites e exact-tree receipt | Rename não omite arquivo nem importa WIP; digest e leitura correspondem |
| `turbo.json:12–41` | `^transit`, Rust root/campaign inputs, outputs | Cache invalida quando assets/dependências mudam; outputs reais incluídos |
| `setup-bun/action.yml` | Installed-tree cache e profundidade dos node_modules | OS/CPU/toolchain/hooks/cwd corretos; sem usar cache como prova de runtime |
| `script/godfile.ts` | Exclui Atlas; waivers e legacy oversize por caminho | Preservar alcance; não usar LOC gate como prova de cleanup documental |
| `check-spawn-imports.ts` | Scan delimitado + allowlist por site | Retarget exato, stale entries falham; não ampliar exclusões para esconder movimento |
| `script/omni-mirror.sh:17–19,45–61,77–84` | Prefix fixo, first-parent/history/tag-tree equality | Resolução old/new por revisão antes da relocação |
| Core/CLI/Desktop Omni loaders/copiers | `hugr_omni.node` producer versus `hugr-omni.node` npm; supervisor adjacente | Pair/filename/ABI/resources/realpath preservados |
| Build helpers/desktop playbooks/skill generators | Paths relativos, version source, embeds | Registro + asset resolution; identidade e conteúdo iguais |
| Nix `node_modules.nix:32–48,72–84,129–140` | Globs suportados limitados; fileset `packages`; recursive hashes stale | Fileset/locks adaptados + build closure/hash medidos por host |
| Nix delta #318 | Workspace-path alias; bundles tree-sitter e capture/completion nos três locais | Retarget resolver + manter native image/load/parse e receipt obrigatório |
| `.gitattributes`, ignores, vendor manifests | LF, union merge, byte-exact bundles, tarball relativos | Novo path tem mesma policy antes de gerar/empacotar |

O registry não substitui parsers/compilers/OS que conhecem a semântica. Novo guard deve provar discovery não vazio, correspondence nos dois sentidos, missing/malformed/stale como erros e mutantes reais; não ser uma tabela que concorda consigo mesma.

## 7. Checks concretos para o plano

### Como executar na baseline

- Typecheck: `bun typecheck` **no diretório do package**. Nunca `tsc` direto como substituto geral.
- Atlas: seu script `npm run typecheck` executa o project build necessário a `dist`; preservar esse pipeline em CI. A regra do package Bun não autoriza substituir esse build por no-emit.
- Testes Orchestra: `bun run test:ci <package> <arquivos...> --os both` na raiz; local `bun test` é bloqueado por policy.
- Relay Python: somente args de arquivos `.py` selecionam pytest; argumentos mistos/diretórios mudam runner. Python qualifica Linux separadamente.
- Atlas tem pipeline npm/Vitest/project build independente em Actions; deve executar os mesmos scripts/gates reais, preservando `dist`, refs e ambiente.
- Comandos adicionais que executam testes também obedecem à policy de CI. A listagem abaixo não autoriza testes locais nem declara que passaram.

| Área | Suites/comandos existentes a selecionar |
| --- | --- |
| Session/Core | `test/session-create.test.ts`, `session-prompt`, `session-runner`, `session-run-coordinator`, `session-runner-recorded`, `location-layer`, `session-runner-tool-registry` |
| Dados/config | Core `test/database-migration.test.ts`, `database-sqlite`, `credential-inherit`, `config/config`, `location-filesystem`, `project` |
| APIs | Client `test/contract-identity.test.ts`, `import-boundaries`, `type-conformance`, `promise`, `effect`; sdk-next `embedded`/boundaries; schema compatibility/event/v1 |
| Legacy HTTP/SDK | Orchestra `test/server/httpapi-public-openapi.test.ts`, query-schema-drift, authorization, SDK, sdk-v1-smoke, sdk-error-shape; `test:httpapi` |
| Plugins | Core `test/plugin/sdk-runtime.test.ts`, `sdk-authority`; SDK/plugin export/consumer tests |
| UI | App `test:unit`, `test:browser` (browser/solid conditions), `typecheck:e2e`, selected Playwright; session-ui/UI tests; TUI lifecycle/runtime/keymap; Storybook build |
| Atlas | npm install/project typecheck/build, godfile/layer/reference-model/spec/id/command/wiring/ADR/req/EARS/doc-transcript/service/Own guards; npm tests; Own materialization tests; WP audit |
| Boundary | `bun run check:generated` em atlas-boundary, JS/declaration byte checks e Maestro consumers |
| Relay | TS/Node parity/layering/gate/ledger/arm; Python audit/provenance/oracle-drift/docs; `bin/gen-doc-index.py --check`; independent golden generators em ambiente pinned |
| Lean | Core processor/telemetry, Orchestra native/item/profile/project/package/replay tests, notices digest; actual ShellTool calls, não apenas parser fixture |
| Agents | Seat-name/label/framework/skills build; backend toolkit/acquisition/process/readiness; upstream Arsenal/authoring; Continuity persistence; Claude plan-approval/preset/lifecycle; ACP/control-plane |
| Omni | `scripts/ci.mjs`, conformance/QA, Node/Bun binding contracts, artifact import/load/spawn/stop e mirror replay; flags release expandem alcance |
| Runtime/delivery | `runtime-products.yml`, tree-sitter/Omni artifacts, Desktop packaged lifecycle, native/accessibility/WSL, Nix artifact/distribution/toolchain qualification |
| Guards | `bun run check:godfile`, `bun run check:spawn-imports`, declared corpus/gate fitness tests |

Geração obrigatória:

- Protocol ou Server HttpApi público alterado: `bun run generate` em `packages/client`; não editar `src/generated`/`src/generated-effect`.
- SDK legado: `./packages/sdk/js/script/build.ts`; root `script/generate.ts` também possui responsibilities OpenAPI/format e não é lixo por usar legado.
- Clients: `check:generated` usa regeneration + diff. Skill/toolkit/boundary generators têm provenance/assets próprios; mover os inputs sem requalificar o generator não basta.

### Alcance e lacunas que precisam continuar honestos

- Epic CI atual: units Linux/Windows; Atlas/generated/HttpApi/Relay Python em Linux; browser tests frequentemente mocked. Executar no environment real quando a propriedade requer integração.
- Omni artifact matrix tem combinações GNU/musl/Darwin/Windows x64/ARM64; CLI desabilita Omni em alguns targets. Preservar suporte declarado, não inventar equivalência.
- Desktop smoke unsigned cobre ciclo de vida em runners determinados; não qualifica automaticamente assinatura/notarização/installers ou todos os CPUs.
- WSL workflow descreve proof preparado/unrun; script foreground não substitui teste de controller Electron.
- Dock security/live/RPC/accessibility inclui harnesses fora de Bun discovery e cenários opt-in. Teste skipped não fecha comportamento exigido.
- V7 pode terminar `unrun-busy`; isso é falta de medição, não validação verde de overhead.
- Epic normal usa previous-pass/changed scope/Turbo pass cache. O modo completo de 30-F precisa forçar execução required no exato candidate, preservando build cache somente quando inputs forem demonstrados. Omni release/npm delivery precisa das lanes `--release`/`pack:true` aplicáveis.
- Nix metadata hash atual, cache hit e eval warning não provam closure funcional no host/artefato final.
- Lean possui backend preferences/telemetry/API; contrato de dashboard e integração de UI são escopos distintos. Não completar feature ausente escondida na reorganização.

Essas limitações são entradas da matriz 00-B. Depois de implementados os movimentos, a conclusão exige os checks requeridos no candidate final e o alcance exato dos receipts, como definido no [plano](restructure-plan.md).

## 8. Implementação publicada após a auditoria

O mapa acima conserva a baseline histórica da auditoria. A stack draft sobre `dev@e87fd95799cb` publicou os seguintes mappings, com readers e checks localizados; ainda não altera os paths de `dev`:

| Fonte da auditoria | Path implementado | PR |
| --- | --- | --- |
| `packages/relay` | `modules/relay` | #525 |
| `packages/capability-assets` | `modules/capability-assets` | #526 |
| `packages/maestro-arsenal` | `modules/maestro/arsenal` | #528 |
| `packages/backend-specialist` / `packages/archie-specialist` | `modules/specialists/backend` / `modules/specialists/archie` | #527 |
| `packages/identity` | `assets/brand` | #552 |
| `packages/httpapi-codegen` | `tooling/httpapi-codegen` | #551 |
| `packages/http-recorder` | `tooling/http-recorder` | #553 |
| `packages/omni` | `native/omni` | #615, após readers históricos #607/#606/#605 |
| `foundation/atlas` | `modules/atlas` | #614 |
| `packages/atlas-boundary` | `modules/atlas/boundary` | #614 |

Composição mais recente: `atlas-module@1f1d2f8801b420f59004cc3c81b3ed99901dbe60`, tree `ff111cb5e96f7e9fd760643025d71991dc6da5dc`, sobre `omni-module@ea9fe371cf5a9eff515cb4b3c3bfc3ce18f47d1d`. Identidades públicas, runtimes, skills, oracle/cassettes e contracts permanecem; exceções exatas de config/fixture/metadata, provas e cadência automática estão no registro de execução do [plano](restructure-plan.md). Omni preserva 406 members/modes, Atlas 1.269 members/blobs/modes e boundary 16 members/modes; Cargo/QA/corpus/Own/locks e gerados permanecem exatos. Readers continuam resolvendo o prefix por revisão, e o boundary continua sob o guard host apesar do parent Atlas ter gate próprio. Hosted qualification final, dados/archives e demais movimentos mantêm seus estados próprios; as drafts não mudam `dev`.
