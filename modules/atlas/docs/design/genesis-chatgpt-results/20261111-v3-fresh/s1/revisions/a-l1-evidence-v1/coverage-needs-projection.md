# Complemento de evidência L1 A — população, necessidades e dependentes

**Identidade:** `a-l1-evidence-v1`; scope `orchestra.s1`; fonte `1cde2ff7a71bcf7aecb5d030917b577165135d38`.

Esta é uma projeção do candidato L1 congelado, não uma revisão dos seus corpos. Todos os campos originais `need`, `gaps`, `input_keys`, `validity`, `build_dependencies`, classificações e razões permanecem exatamente preservados no JSON acompanhante. As explicações de fronteira e uso bloqueado abaixo foram escritas nesta revisão e são identificadas como tal. Não constituem aceite semântico, criação de L2–L4 ou recategorização retroativa.

O dossiê da principal foi informado como `output/producers/a/review-dossier.md`, SHA256 `cf7676f527067c7b2aa3fc4bd0d4629e8fa2afa5b843ddc70f857dacc0abffbc`. Seu conteúdo não foi lido e seu hash não foi verificado por este produtor; as projeções usam diretamente os próprios arquivos congelados. Nenhum oracle foi acessado.

## O que as 1.340 entradas não lidas significam

A reconciliação exata cobre 1.441 caminhos: 94 leituras decisivas no registro congelado, sete capturas de orientação e 1.340 entradas não lidas. As 599 implementações substantivas não lidas continuam fora da autoridade de afirmações específicas. As outras 741 entradas têm disposição agrupada de validação, história, documentação, gerados, vendor ou suporte. Essa disposição explica por que não se exigiu uma narrativa por arquivo no L1; ela não substitui leitura quando o conteúdo é premissa de uma necessidade obrigatória.

| Profundidade original das entradas não lidas | Quantidade | Alcance e obrigação preservada |
| --- | ---: | --- |
| `representative_family_boundary` | 599 | Fronteira/coordenador lido; sem aceite da implementação de cada leaf. Ler o leaf e seus contratos antes de afirmação ou mudança que dependa dele. |
| `grouped_validation_inventory` | 584 | Inventário de testes, fixtures e suporte; nenhum resultado executado. Selecionar fontes e gate pertinente quando a afirmação exigir validação. |
| `grouped_history_contract` | 72 | Migração histórica retida como contrato de dados. Mudança/upgrade exige leitura da transformação e predecessors afetados. |
| `grouped_vendor_boundary` | 27 | Autoridade upstream distinta; host boundary não valida internals. Ler contrato/vendor/licença/update quando pertinente. |
| `grouped_documentation_disposition` | 26 | Documento/história retido; sem inferir implementação ou qualificação por título. Ler e confrontar fonte quando usado como requisito. |
| `grouped_support_contract` | 28 | Prompt/pin/script/asset/configuração é input sensível a mudança, não suporte descartável. Ler quando seu conteúdo ou geração afeta a necessidade. |
| `grouped_generated_contract` | 4 | Arquivo gerado retido e ligado ao dono/gerador. Fonte geradora e comparação de bytes são exigidas em manutenção pertinente. |

As sete orientações capturadas permanecem orientações no congelado: `docs/guides/agents.md`, `docs/guides/session-requests.md`, `docs/specs/v2/tools.md`, `packages/core/src/board/tools.ts`, `packages/core/src/session/README.md`, `packages/core/src/session/runner/execution-host.ts` e `packages/core/src/session/runner/index.ts`. Um trecho complementar eventualmente lido agora não apaga esse estado histórico.

**Lacuna obrigatória:** se uma pergunta L1 exigida depende de um leaf não lido, a lacuna permanece aberta nesse ponto. Não se presume que o requisito possa ser adiado por conveniência. O mesmo vale para a família util, sem fonte própria lida, e para documentos históricos ainda não confrontados. A suficiência do conjunto continua sujeita aos dois juízes da principal.

## Projeção exata das 17 necessidades

As contagens abaixo são rotas de inventário pelo campo `proposed_artifact_key`, não quantidades de fontes exclusivas. Fontes compartilhadas podem sustentar vários artefatos: por exemplo, Location é roteada a project mas também citada por configuration; State é roteado a runtime mas citado por extensions. O JSON conserva esses dois relacionamentos separadamente.

| Key | Need original | Validity original | Entradas roteadas | Decisivas / orientação / não lidas | Famílias roteadas |
| --- | --- | --- | ---: | --- | --- |
| `s1.core.session-admission` | `component` | `supported` | 6 | 2 / 0 / 4 | session |
| `s1.core.session-execution` | `flow` | `supported` | 64 | 5 / 3 / 56 | session |
| `s1.core.persistence` | `evidence` | `supported` | 111 | 8 / 0 / 103 | database, event, session |
| `s1.core.context` | `component` | `supported` | 16 | 7 / 0 / 9 | session, system-context |
| `s1.core.tools` | `component` | `supported` | 81 | 9 / 1 / 71 | tool |
| `s1.core.security` | `evidence` | `supported` | 51 | 7 / 1 / 43 | identity, permission, tool-safety |
| `s1.core.configuration` | `component` | `supported` | 62 | 3 / 0 / 59 | config |
| `s1.core.project` | `component` | `supported` | 61 | 8 / 0 / 53 | location, project |
| `s1.core.extensions` | `component` | `supported` | 122 | 6 / 1 / 115 | agent, identity, instruction, plugin-host, tool |
| `s1.core.capability` | `component` | `supported` | 170 | 5 / 0 / 165 | capability |
| `s1.core.automation` | `flow` | `supported` | 204 | 6 / 1 / 197 | actions, board, scheduled-task |
| `s1.core.research` | `component` | `supported` | 130 | 4 / 0 / 126 | backend-toolkit, research |
| `s1.core.runtime` | `component` | `supported` | 150 | 12 / 0 / 138 | process, project, runtime, tool, util |
| `s1.core.models` | `component` | `supported` | 80 | 5 / 0 / 75 | provider, session |
| `s1.core.economy` | `evidence` | `supported` | 5 | 1 / 0 / 4 | economy |
| `s1.core.boundaries` | `component` | `supported` | 24 | 4 / 0 / 20 | atlas, control-plane, rag-studio, relay |
| `s1.core.entry` | `entry` | `supported` | 104 | 2 / 0 / 102 | architecture-history, documentation, package, validation-support |

Todos os 17 `build_dependencies` L1 originais são vazios. A revisão não inventa nomes de dependentes ou edges. `supported` é a validade declarada para as afirmações limitadas dos corpos; não equivale a PASS dos juízes, aceitação da camada, binding ou publicação. Os needs `ownership`, `maintenance` e `operational` não foram produzidos por este L1; as obrigações posteriores permanecem com a principal e não são renomeadas para aparentar completude.

### `s1.core.session-admission` — `component`

Corpo congelado: `bodies/session-admission.md`, SHA256 `2535bba77505ed74e7dc2759dce815c8e9684e68e2f0a10fa75f9813192e7ae1`. Validade original: `supported`.

**Gaps originais, verbatim:**

- Runtime retry races and crash behavior were not executed; source evidence only.
- The Session spec contains historical V1/route sections and must not be promoted wholesale to current API authority.

**Inputs originais:** `file:packages/core/src/session.ts`, `file:packages/core/src/session/input.ts`, `file:packages/core/src/session/sql.ts`, `file:packages/core/src/session/projector.ts`, `file:docs/specs/v2/session.md`.

**Explicitação nova nesta revisão:** Identidade de Session, retry e separação admitido/promovido. Alteração de admissão/retry deve conservar identidade, delivery, proveniência histórica e transação; corrida/crash requer evidência runtime autorizada.

**Uso dependente bloqueado:** Explicação ou manutenção de admit-only/steer/queue pode usar a fronteira; garantias concorrentes ou HTTP ponta a ponta ficam bloqueadas sem as provas correspondentes.

### `s1.core.session-execution` — `flow`

Corpo congelado: `bodies/session-execution.md`, SHA256 `470ddb1eacfe7294071893968d7de999c90ea98cb0fd48c48e0730ded51d1663`. Validade original: `supported`.

**Gaps originais, verbatim:**

- Durable multi-node ownership and automatic post-crash provider recovery are explicitly not implemented by this local coordinator.
- ExecutionHost internals are a separate owner boundary; only the Core port and invocation path are inspected.
- No runtime or product test result was obtained.

**Inputs originais:** `file:packages/core/src/session/execution.ts`, `file:packages/core/src/session/execution/local.ts`, `file:packages/core/src/session/run-coordinator.ts`, `file:packages/core/src/session/runner/llm.ts`, `file:docs/specs/v2/session.md`.

**Explicitação nova nesta revisão:** Ownership local, routing por Location e limites de continuação/interrupção. Host adapter, anexos e estados de recuperação específicos exigem leitura; multi-node e post-crash provider continuation não são capacidades implementadas pelo coordenador.

**Uso dependente bloqueado:** L2/L3 podem descrever limites locais após aceite; um dependente que prometa cluster lease, retomada durável ou exactly-once de efeito externo fica bloqueado.

### `s1.core.persistence` — `evidence`

Corpo congelado: `bodies/persistence.md`, SHA256 `2a9d564fbc6ce848129eb4611b47ecb27c873cc41cdb9a4e34c2f1f043587741`. Validade original: `supported`.

**Gaps originais, verbatim:**

- Historical migrations and driver implementations have grouped inventory disposition; they were not exhaustively read or executed.
- Projector registration is not yet keyed by exact durable type plus version.
- Seals do not establish authentication or Session execution ownership.

**Inputs originais:** `file:packages/core/src/database/database.ts`, `file:packages/core/src/database/migration.ts`, `file:packages/core/src/event.ts`, `file:packages/core/src/session/store.ts`, `file:packages/core/src/event/seal.ts`, `file:packages/core/src/database/README.md`.

**Explicitação nova nesta revisão:** Transação de evento/projeção, replay e contrato de migração. Mudança de dados exige migrações/predecessors/drivers pertinentes; mudança de versão de evento exige tratar o TODO de registro type+version.

**Uso dependente bloqueado:** Compatibilidade de upgrade/restauração, autenticação de seals e replay arbitrário não podem ser liberados por esse L1 genérico.

### `s1.core.context` — `component`

Corpo congelado: `bodies/context.md`, SHA256 `205b44488e2b6349a55480d3becf2e59806c185bec90d43af283e11b3933b1fd`. Validade original: `supported`.

**Gaps originais, verbatim:**

- Provider token estimates and generated summaries were not measured or evaluated.
- External Context Source producers and Continuity replacement layers are separate source boundaries.

**Inputs originais:** `file:packages/core/src/system-context/index.ts`, `file:packages/core/src/system-context/registry.ts`, `file:packages/core/src/system-context/builtins.ts`, `file:packages/core/src/instruction-context.ts`, `file:packages/core/src/session/context-epoch.ts`, `file:packages/core/src/session/history.ts`, `file:packages/core/src/session/compaction.ts`, `file:packages/core/src/session/runner/llm.ts`, `file:AGENTS.md`.

**Explicitação nova nesta revisão:** Retenção de observação indisponível, epoch e seleção de histórico. Mudança de produtor externo/Continuity exige sua fonte; qualidade de summary e token estimates exigem medição quando reivindicadas.

**Uso dependente bloqueado:** Dependentes de freshness global, remoção por falha de leitura ou qualidade semântica de compactação ficam bloqueados sem evidência própria.

### `s1.core.tools` — `component`

Corpo congelado: `bodies/tools.md`, SHA256 `ed668009ad400bf61adee3f1d497c59f91c9932b1730642816659ddbf2978e23`. Validade original: `supported`.

**Gaps originais, verbatim:**

- Plugin canonical tool registration, Session-scoped MCP registration and opaque managed-output references are documented future work.
- The older Session spec overstates arbitrary binary read support.
- Other leaf implementations and Lean attestation internals need targeted source reads before behavior-specific modifications.

**Inputs originais:** `file:packages/core/src/tool/tool.ts`, `file:packages/core/src/tool/application-tools.ts`, `file:packages/core/src/tool/registry.ts`, `file:packages/core/src/tool/AGENTS.md`, `file:packages/core/src/tool-output-store.ts`, `file:packages/core/src/tool/read.ts`, `file:packages/core/src/tool/apply-patch.ts`, `file:docs/specs/v2/session.md`.

**Explicitação nova nesta revisão:** Representação canônica, identidade capturada, settlement e limites de output. Outra folha, Lean, output/atestado e plataforma de mutação exigem leitura; os designs futuros do AGENTS não são comportamento disponível.

**Uso dependente bloqueado:** Claims sobre cada tool, rollback multi-file, input validation dinâmica ou cap total de mídia ficam bloqueados; a fronteira de registry não os prova.

### `s1.core.security` — `evidence`

Corpo congelado: `bodies/security.md`, SHA256 `dd6e7372b2c26c8c05435db8a55dfa05cd42813a9f105f48dc8b5d702bacbbcf`. Validade original: `supported`.

**Gaps originais, verbatim:**

- Per-Session rules are consumed differently by materialization/capability context and ordinary PermissionV2.configured; universal enforcement is not established.
- The Session spec contains an overbroad unsandboxed-Bash statement.
- Confinement and secret recognition were inspected but not exercised on any OS.
- Fallback credential key-file storage and readable legacy plaintext are explicit implementation limits.

**Inputs originais:** `file:packages/core/src/permission.ts`, `file:packages/core/src/question.ts`, `file:packages/core/src/session/runner/llm.ts`, `file:packages/core/src/tool-safety.ts`, `file:packages/core/src/tool/bash.ts`, `file:packages/core/src/tool-safety-sandbox.ts`, `file:packages/core/src/tool/agent-terminal.ts`, `file:packages/core/src/credential/cipher.ts`, `file:packages/core/src/credential.ts`, `file:docs/specs/v2/session.md`, `file:AGENTS.md`, `file:.orchestra/skills/session-requests-usage/SKILL.md`.

**Explicitação nova nesta revisão:** Permissões, regra da Session por caminho, sandbox condicional e segredos. Rastrear o leaf antes de afirmar aplicação de Session rules; manter conflitos com docs; backend/OS e secret recognition precisam de prova específica.

**Uso dependente bloqueado:** Enforcamento universal, sandbox universal, proteção keychain universal e rejeição individual uniforme permanecem bloqueados.

### `s1.core.configuration` — `component`

Corpo congelado: `bodies/configuration.md`, SHA256 `eed22f8ddd9f3fdad18b39cfb8e52ca5f412bad8b21de10fef58ce113ba60ab1`. Validade original: `supported`.

**Gaps originais, verbatim:**

- Project configuration remains an open-time snapshot while globals refresh per entries call.
- Legacy upgrade helpers and consumer-specific policies are not exhaustively inspected.
- No Location eviction/reload or trust transition was executed.

**Inputs originais:** `file:packages/core/src/config.ts`, `file:packages/core/src/config/trust.ts`, `file:packages/core/src/location-services.ts`, `file:packages/core/src/location-service-map.ts`, `file:docs/specs/v2/config.md`.

**Explicitação nova nesta revisão:** Precedência, trust e lifetime de Location. Ler migração legada e consumidor de política/campo antes de alterar; reload/eviction/trust transition não foram exercitados.

**Uso dependente bloqueado:** Dependente de configuração de projeto live ou de aplicação universal do schema fica bloqueado até seu fluxo real ser demonstrado.

### `s1.core.project` — `component`

Corpo congelado: `bodies/project.md`, SHA256 `937f99ba01085530af69abf620793e1b518c32867b956e805a5c68d65f950c43`. Validade original: `supported`.

**Gaps originais, verbatim:**

- Git mutation, copy strategies, repository caches, snapshots/revert and formatter/LSP leaves require deeper source reads for behavior-specific changes.
- Historical project route sketches are not current API proof.
- Checkpoint semantic validity and runtime restoration were not tested.

**Inputs originais:** `file:packages/core/src/project.ts`, `file:packages/core/src/project/directories.ts`, `file:packages/core/src/location-mutation.ts`, `file:packages/core/src/filesystem.ts`, `file:packages/core/src/project/checkpoint.ts`, `file:packages/core/src/session.ts`, `file:docs/specs/project.md`.

**Explicitação nova nesta revisão:** Identidade de projeto, resolução física de caminho e checkpoint retido. Git/cópia/cache/snapshot/revert e paths específicos exigem folhas; restauração precisa de prova própria, além do digest.

**Uso dependente bloqueado:** Garantias de restauração, APIs históricas atuais ou qualquer mutação Git genérica não ficam liberadas por identidade/path comuns.

### `s1.core.extensions` — `component`

Corpo congelado: `bodies/extensions.md`, SHA256 `1adfea6dc88bb969fb2c9232c82b81ae917e8112a9d0993273733450891984d4`. Validade original: `supported`.

**Gaps originais, verbatim:**

- Individual plugin/provider/OAuth implementations and live MCP operation were not exercised.
- OAuth attempts and plugin activations are scoped in-memory state, not durable resumable workflows.

**Inputs originais:** `file:packages/core/src/state.ts`, `file:packages/core/src/plugin.ts`, `file:packages/core/src/integration.ts`, `file:packages/core/src/mcp.ts`, `file:packages/core/src/skill.ts`, `file:packages/core/src/agent.ts`, `file:packages/core/src/plugin/README.md`.

**Explicitação nova nesta revisão:** Lifecycle in-memory de State/plugin/integration/MCP/skills. Ler provider/plugin/OAuth específico e obter evidência de operação quando necessária; tentativas OAuth/ativação não sobrevivem por contrato ao processo.

**Uso dependente bloqueado:** Resumabilidade durável, disponibilidade live de MCP e compatibilidade de todo plugin ficam bloqueadas.

### `s1.core.capability` — `component`

Corpo congelado: `bodies/capability.md`, SHA256 `a5d40d013b3976a612a53acb7999ea498c32c71bff5f7acb276f1ddc3be95e7a`. Validade original: `supported`.

**Gaps originais, verbatim:**

- Leaf capability behavior is represented by the actual invocation/policy/registration boundary; vendor and leaf-specific algorithms need deeper reads when consumed.
- Native MCP transport bounds and mutation ambiguity are documented contract, not a newly executed protocol qualification.

**Inputs originais:** `file:packages/core/src/capability/invocation.ts`, `file:packages/core/src/capability/policy.ts`, `file:packages/core/src/capability/tools.ts`, `file:packages/core/src/scheduled-task/port.ts`, `file:packages/core/src/capability/mcp/README.md`, `file:docs/guides/artifacts-and-processes.md`.

**Explicitação nova nesta revisão:** Frame emitido, autorização persistida e commit de permit nativo. Ler a operação e vendor exatos; o README MCP é contrato normativo e não prova código de limites/qualificação executada.

**Uso dependente bloqueado:** Uso remoto que conclua nonexecution após abort ou autoridade inferida do JSON/registro fica bloqueado; semântica de cada leaf permanece obrigatória.

### `s1.core.automation` — `flow`

Corpo congelado: `bodies/automation.md`, SHA256 `83d483f7f56a0e3dfa7a29e89fea01b29d1b5529e36693b20a06fe9cc0db8b88`. Validade original: `supported`.

**Gaps originais, verbatim:**

- Provider-specific Actions commands/reconciliation, cadence policy and remaining Board workflows need their leaf sources when changed.
- Scheduled dispatch has an explicit revocation-to-admission race; admission is not Session completion.
- No external actions or product runtime checks executed.

**Inputs originais:** `file:packages/core/src/actions.ts`, `file:packages/core/src/actions/contract.ts`, `file:packages/core/src/actions/operations.ts`, `file:packages/core/src/scheduled-task.ts`, `file:packages/core/src/board/decision.ts`.

**Explicitação nova nesta revisão:** Estados distintos de Actions, dispatch admitido e linhagem de Board. Provider commands/readback, cadence/SQL e workflows Board restantes exigem seus leaves; a race de revogação não está resolvida.

**Uso dependente bloqueado:** Conclusão de workflow/Session, remoção de ambiguidade externa e limite repeat estrito não podem ser derivados de prepared/started/recorded.

### `s1.core.research` — `component`

Corpo congelado: `bodies/research.md`, SHA256 `76a39828caccbb41b99fe0f7d480f4a35abac7722d5c34ddfe5c7ddd67c7c202`. Validade original: `supported`.

**Gaps originais, verbatim:**

- Toolkit manifests, index adapters and individual research validators need leaf inspection for operation-specific changes.
- No engine availability or platform qualification was measured.

**Inputs originais:** `file:packages/core/src/backend-toolkit/index.ts`, `file:packages/core/src/backend-toolkit/README.md`, `file:packages/core/src/research-toolkit/index.ts`, `file:packages/core/src/research/ledger.ts`.

**Explicitação nova nesta revisão:** Acquisition/readiness e identidade de pesquisa retida. Ler manifests/adapters/validators antes de usar algoritmos específicos; no-work após erro e adapter vazio não comprovam índice.

**Uso dependente bloqueado:** Cobertura completa, qualidade de fonte, build de índice e prontidão do host permanecem bloqueados sem evidência desses mecanismos.

### `s1.core.runtime` — `component`

Corpo congelado: `bodies/runtime.md`, SHA256 `331d26e17158e0770af02c8772bd01a421dbda1a0bc82802da825f3666fba534`. Validade original: `supported`.

**Gaps originais, verbatim:**

- OS/native adapters and external LSP/formatter/exporter behavior were not executed.
- PTY replay retention does not solve unbounded slow WebSocket-client memory; documented unresolved limit remains.
- AppProcess limits depend on caller options and native/legacy backend.

**Inputs originais:** `file:packages/core/src/host.ts`, `file:packages/core/src/effect/app-node.ts`, `file:packages/core/src/global.ts`, `file:packages/core/src/process.ts`, `file:packages/core/src/omni.ts`, `file:packages/core/src/pty.ts`, `file:.orchestra/skills/terminal-maintenance/SKILL.md`, `file:packages/core/src/lsp/lsp.ts`, `file:packages/core/src/format/format.ts`, `file:packages/core/src/installation/service.ts`, `file:packages/core/src/observability/otlp.ts`.

**Explicitação nova nesta revisão:** Composição e limites condicionais de processos/PTY/serviços. Ler adapter de OS/Omni/LSP/format/exporter pertinente e exigir prova do backend usado; slow-client memory permanece limite aberto.

**Uso dependente bloqueado:** Confinamento, memória/output universalmente limitados, backpressure e disponibilidade de atualização/telemetria ficam bloqueados sem prova específica.

### `s1.core.models` — `component`

Corpo congelado: `bodies/models.md`, SHA256 `4af060adbf07f6e7e759bd8574793155c5676fd87fbef77125c70cc618ffdcfe`. Validade original: `supported`.

**Gaps originais, verbatim:**

- The native Session adapter has a narrower supported API set than the full catalog/SDK plugin surface.
- Vendor adapters, pricing accuracy and current provider availability were not exercised.

**Inputs originais:** `file:packages/core/src/provider.ts`, `file:packages/core/src/model.ts`, `file:packages/core/src/catalog.ts`, `file:packages/core/src/session/runner/model.ts`, `file:packages/core/src/aisdk.ts`, `file:packages/core/README.md`.

**Explicitação nova nesta revisão:** Catálogo versus disponibilidade declarada e adapter nativo estreito. Ler provider/vendor/transport exactos e confrontar preços/auth; protocolo live não foi executado.

**Uso dependente bloqueado:** Compatibilidade de todos os SDKs com Session, billing verificado e sucesso de provider não são liberados por presença no catálogo.

### `s1.core.economy` — `evidence`

Corpo congelado: `bodies/economy.md`, SHA256 `0413cc550f9037ababcc8cbb706cee3a19c55b35480396b381f0f6c4272096f4`. Validade original: `supported`.

**Gaps originais, verbatim:**

- Provider/executor integration was not exhaustively read; universal economic enforcement is not asserted.
- Product economy code is not a receipt for this producer execution; token/attempt/billing usage is UNKNOWN.

**Inputs originais:** `file:packages/core/src/economy/admission.ts`.

**Explicitação nova nesta revisão:** Reserva, terminus e settlement como evidências diferentes. Executor e SQL não lidos permanecem necessários para integração/enforcamento; custos desta produção continuam UNKNOWN.

**Uso dependente bloqueado:** Cobertura econômica universal, reembolso por rejeição semântica e receipt de custo da conversa ficam bloqueados.

### `s1.core.boundaries` — `component`

Corpo congelado: `bodies/boundaries.md`, SHA256 `7b20ed7cedf86c24fb1d9c3471250fcddf666f9c66e7de2dba9852df1fa17143`. Validade original: `supported`.

**Gaps originais, verbatim:**

- Atlas and Relay engine guarantees require their boundary/module sources and separate runtime evidence.
- Session movement is not atomic across file changes and durable location update; active-runner coordination belongs to the caller.
- RAG tables alone do not implement or prove retrieval/embedding capability.

**Inputs originais:** `file:packages/core/src/atlas.ts`, `file:packages/core/src/relay.ts`, `file:packages/core/src/control-plane/move-session.ts`, `file:packages/core/src/rag-studio/sql.ts`.

**Explicitação nova nesta revisão:** Adapters Core para engines externos, MoveSession e schema RAG. Ler boundary/módulo/caller e folhas de workflow; a coordenação ativa e rollback cruzado não estão provados pelo MoveSession.

**Uso dependente bloqueado:** Publicação Atlas, governança Relay, quiescência atômica ou retrieval real ficam bloqueados sem fontes/provas do dono correspondente.

### `s1.core.entry` — `entry`

Corpo congelado: `bodies/entry.md`, SHA256 `6a488ca8f9717a497949b71ed41db84d995f23b90c31cc59c22c5bd86239ca6c`. Validade original: `supported`.

**Gaps originais, verbatim:**

- L1 candidate only; independent review, later layers and runtime/import/publication remain principal/campaign obligations.
- Broad family disposition is not exhaustive acceptance of unread leaf implementations.
- No product runtime qualification or fresh test result is claimed.

**Inputs originais:** `file:packages/core/README.md`, `file:packages/core/package.json`, `file:AGENTS.md`, `members:packages/core/src`, `members:packages/core/test`, `members:docs/specs/v2`, `members:docs/specs/terminal`, `members:docs/specs/runtime-closure`.

**Explicitação nova nesta revisão:** Entrada comum, autoridade e disposição integral do inventário. Aceite semântico independente, L2–L4, consumo e runtime/publicação pertencem à fila real da principal; documentos e helpers não lidos não desaparecem.

**Uso dependente bloqueado:** Nenhum dependente de camada seguinte é liberado pela contagem/hash. Esta revisão não transforma o pacote em S1 completo nem altera validity congelada.

## Disposição semântica por família

Cada seção preserva count, profundidades, read status e razão por IDs. O apêndice transcreve literalmente todas as 109 razões do congelado; cada grupo reversível e seus membros estão no JSON. As duas frases de alcance/obrigação por família são explicitação nova desta revisão, apoiada nas fontes dos corpos e nos trechos complementares, e não julgamento de suficiência.

### actions — 155 entradas

**Profundidades originais:** `decisive_source_read`=3, `grouped_validation_inventory`=72, `representative_family_boundary`=80.

**Read status original:** `not_read`=152, `semantically_read_decisive_ranges`=3.

**Rota original:** `s1.core.automation`. **Artefatos que de fato citam fontes da família:** `s1.core.automation`.

**Fontes decisivas listadas no original:** `packages/core/src/actions.ts`, `packages/core/src/actions/contract.ts`, `packages/core/src/actions/operations.ts`.

**Razões originais aplicáveis:** R001, R039, R072.

**Alcance sustentado (explicitação):** O facade e o ledger observados separam binding tardio, preparo, envio e reconciliação de resultado; isso permite localizar a autoridade de uma operação sem prometer seu resultado remoto.

**Obrigação/lacuna retida (explicitação):** Os 80 leaves de implementação não lidos incluem authoring, transportes, GitHub/GitLab, recursos e readback. A semântica do comando ou a reconciliação de um provedor exige os seus leaves; o ledger comum não os valida.

### agent — 10 entradas

**Profundidades originais:** `decisive_source_read`=1, `grouped_support_contract`=6, `grouped_validation_inventory`=1, `orientation_read`=1, `representative_family_boundary`=1.

**Read status original:** `captured_targeted_orientation_only`=1, `not_read`=8, `semantically_read_decisive_ranges`=1.

**Rota original:** `s1.core.extensions`. **Artefatos que de fato citam fontes da família:** `s1.core.extensions`.

**Fontes decisivas listadas no original:** `packages/core/src/agent.ts`.

**Razões originais aplicáveis:** R008, R027, R040, R073, R102.

**Alcance sustentado (explicitação):** A seleção de agente e o fallback deny-all estão observados em agent.ts. O guia de agentes é somente orientação capturada no congelado.

**Obrigação/lacuna retida (explicitação):** Prompts empacotados, composição do agente e o guia não são automaticamente instruções de runtime aceitas. Mudança de agente, seleção ou prompt exige ler os membros exatos e seu carregamento.

### architecture-history — 9 entradas

**Profundidades originais:** `grouped_documentation_disposition`=9.

**Read status original:** `not_read`=9.

**Rota original:** `s1.core.entry`. **Artefatos que de fato citam fontes da família:** nenhum.

**Fontes decisivas listadas no original:** nenhuma.

**Razões originais aplicáveis:** R031.

**Alcance sustentado (explicitação):** Os nove planos/qualificações estão retidos por caminho e blob como história; nenhum deles foi lido individualmente e nenhum PASS histórico foi transportado.

**Obrigação/lacuna retida (explicitação):** Reivindicar um requisito de checkpoint/snapshot, encerramento de runtime ou migração desses planos exige ler o documento e confrontar implementação e versão. A disposição não prova reconciliação histórica já realizada.

### atlas — 1 entradas

**Profundidades originais:** `decisive_source_read`=1.

**Read status original:** `semantically_read_decisive_ranges`=1.

**Rota original:** `s1.core.boundaries`. **Artefatos que de fato citam fontes da família:** `s1.core.boundaries`.

**Fontes decisivas listadas no original:** `packages/core/src/atlas.ts`.

**Razões originais aplicáveis:** R002.

**Alcance sustentado (explicitação):** atlas.ts sustenta a fronteira síncrona do adapter, erros unavailable e mineração legada de candidatos; não sustenta o motor Atlas.

**Obrigação/lacuna retida (explicitação):** Importação/publicação, validade, governança e recuperação do motor dependem das fontes do boundary/módulo e provas próprias. Não podem herdar aceitação deste adapter.

### backend-toolkit — 59 entradas

**Profundidades originais:** `decisive_source_read`=2, `grouped_generated_contract`=1, `grouped_support_contract`=4, `grouped_validation_inventory`=13, `representative_family_boundary`=39.

**Read status original:** `not_read`=57, `semantically_read_decisive_ranges`=2.

**Rota original:** `s1.core.research`. **Artefatos que de fato citam fontes da família:** `s1.core.research`.

**Fontes decisivas listadas no original:** `packages/core/src/backend-toolkit/README.md`, `packages/core/src/backend-toolkit/index.ts`.

**Razões originais aplicáveis:** R013, R022, R041, R074, R103.

**Alcance sustentado (explicitação):** O entry e README sustentam aquisição por pin, piso do host, readiness composto e ownership dos packs/gerados.

**Obrigação/lacuna retida (explicitação):** Os manifests, downloaders, adapters, pins e gerador não foram validados como um conjunto funcional. Um engine ou alteração de pin exige esses inputs e qualificação autorizada do alvo; um marcador não basta.

### board — 38 entradas

**Profundidades originais:** `decisive_source_read`=1, `grouped_validation_inventory`=13, `orientation_read`=1, `representative_family_boundary`=23.

**Read status original:** `captured_targeted_orientation_only`=1, `not_read`=36, `semantically_read_decisive_ranges`=1.

**Rota original:** `s1.core.automation`. **Artefatos que de fato citam fontes da família:** `s1.core.automation`.

**Fontes decisivas listadas no original:** `packages/core/src/board/decision.ts`.

**Razões originais aplicáveis:** R001, R026, R042, R075.

**Alcance sustentado (explicitação):** decision.ts sustenta a linhagem de substituição de respostas e o registro de outcomes. tools.ts está capturado como orientação, sem aceite amplo no congelado.

**Obrigação/lacuna retida (explicitação):** Issue/epic automation, tarefas, guards de outras operações e contratos de resposta não são consequência da linhagem de decisão. Seus 23 leaves não lidos e tools.ts continuam leituras obrigatórias para esses usos.

### capability — 170 entradas

**Profundidades originais:** `decisive_source_read`=5, `grouped_documentation_disposition`=2, `grouped_support_contract`=1, `grouped_validation_inventory`=73, `representative_family_boundary`=89.

**Read status original:** `not_read`=165, `semantically_read_decisive_ranges`=5.

**Rota original:** `s1.core.capability`. **Artefatos que de fato citam fontes da família:** `s1.core.capability`.

**Fontes decisivas listadas no original:** `docs/guides/artifacts-and-processes.md`, `packages/core/src/capability/invocation.ts`, `packages/core/src/capability/mcp/README.md`, `packages/core/src/capability/policy.ts`, `packages/core/src/capability/tools.ts`.

**Razões originais aplicáveis:** R003, R032, R043, R076, R104.

**Alcance sustentado (explicitação):** Frames emitidos, revalidação persistida e commit de permits sustentam a fronteira de autoridade nativa. Registro de nomes não prova comportamento de cada leaf.

**Obrigação/lacuna retida (explicitação):** Os 89 leaves não lidos retêm obrigações de compartilhamento, conteúdo, vendor schemas, processos e demais operações. O README de MCP sustenta intenção normativa; prova da implementação de limites do transporte requer seu código.

### config — 62 entradas

**Profundidades originais:** `decisive_source_read`=3, `grouped_validation_inventory`=18, `representative_family_boundary`=41.

**Read status original:** `not_read`=59, `semantically_read_decisive_ranges`=3.

**Rota original:** `s1.core.configuration`. **Artefatos que de fato citam fontes da família:** `s1.core.configuration`.

**Fontes decisivas listadas no original:** `docs/specs/v2/config.md`, `packages/core/src/config.ts`, `packages/core/src/config/trust.ts`.

**Razões originais aplicáveis:** R004, R044, R077.

**Alcance sustentado (explicitação):** Loader, trust e contraste com o spec sustentam precedência, snapshot de projeto, refresh global e impossibilidade de autoconfiança do projeto.

**Obrigação/lacuna retida (explicitação):** 41 implementações não lidas incluem migrações de formato e políticas/consumidores. Presença no schema não prova aplicação por consumidor; a alteração de campo/política precisa de seu caminho real.

### control-plane — 3 entradas

**Profundidades originais:** `decisive_source_read`=1, `grouped_validation_inventory`=1, `representative_family_boundary`=1.

**Read status original:** `not_read`=2, `semantically_read_decisive_ranges`=1.

**Rota original:** `s1.core.boundaries`. **Artefatos que de fato citam fontes da família:** `s1.core.boundaries`.

**Fontes decisivas listadas no original:** `packages/core/src/control-plane/move-session.ts`.

**Razões originais aplicáveis:** R002, R045, R078.

**Alcance sustentado (explicitação):** MoveSession sustenta ordem de transferência, evento e limpeza e o limite de atomicidade; não cria coordenação de runner por si.

**Obrigação/lacuna retida (explicitação):** O outro leaf substantivo e o caller da operação continuam obrigatórios para provar quiescência e efeitos da movimentação. Não se infere rollback de arquivos/eventos.

### database — 89 entradas

**Profundidades originais:** `decisive_source_read`=3, `grouped_generated_contract`=2, `grouped_history_contract`=72, `grouped_validation_inventory`=6, `representative_family_boundary`=6.

**Read status original:** `not_read`=86, `semantically_read_decisive_ranges`=3.

**Rota original:** `s1.core.persistence`. **Artefatos que de fato citam fontes da família:** `s1.core.persistence`.

**Fontes decisivas listadas no original:** `packages/core/src/database/README.md`, `packages/core/src/database/database.ts`, `packages/core/src/database/migration.ts`.

**Razões originais aplicáveis:** R011, R023, R025, R046, R079.

**Alcance sustentado (explicitação):** Engine e README sustentam journal, transações immediate, backup, recusa de identidade desconhecida e contrato de usuário dos gerados/migrações.

**Obrigação/lacuna retida (explicitação):** 72 migrações históricas, dois gerados e seis implementações não lidas não são descartáveis. Mudança de schema/upgrade/restauração exige os predecessors e drivers pertinentes; o engine genérico não prova cada transformação de dados.

### documentation — 3 entradas

**Profundidades originais:** `grouped_documentation_disposition`=3.

**Read status original:** `not_read`=3.

**Rota original:** `s1.core.entry`. **Artefatos que de fato citam fontes da família:** nenhum.

**Fontes decisivas listadas no original:** nenhuma.

**Razões originais aplicáveis:** R033.

**Alcance sustentado (explicitação):** api.html, schema-changelog.md e todo.md estão identificados como documentação não lida; nenhuma route ou feature foi inferida de seus títulos.

**Obrigação/lacuna retida (explicitação):** Uma exigência de API, compatibilidade ou pendência baseada nesses documentos precisa de leitura e confronto com Schema/Protocol/Server. Não há autoridade comportamental própria demonstrada aqui.

### economy — 5 entradas

**Profundidades originais:** `decisive_source_read`=1, `grouped_validation_inventory`=2, `representative_family_boundary`=2.

**Read status original:** `not_read`=4, `semantically_read_decisive_ranges`=1.

**Rota original:** `s1.core.economy`. **Artefatos que de fato citam fontes da família:** `s1.core.economy`.

**Fontes decisivas listadas no original:** `packages/core/src/economy/admission.ts`.

**Razões originais aplicáveis:** R006, R047, R080.

**Alcance sustentado (explicitação):** admission.ts sustenta identidade selada, reserva, terminus, settlement e separação de evidências econômicas.

**Obrigação/lacuna retida (explicitação):** executor.ts e sql.ts não foram lidos. Enforcamento em todos os emissores/providers, recuperação real e cobertura do executor permanecem sem prova; não podem ser promovidos por existência do ledger.

### event — 11 entradas

**Profundidades originais:** `decisive_source_read`=2, `grouped_validation_inventory`=6, `representative_family_boundary`=3.

**Read status original:** `not_read`=9, `semantically_read_decisive_ranges`=2.

**Rota original:** `s1.core.persistence`. **Artefatos que de fato citam fontes da família:** `s1.core.persistence`.

**Fontes decisivas listadas no original:** `packages/core/src/event.ts`, `packages/core/src/event/seal.ts`.

**Razões originais aplicáveis:** R011, R048, R081.

**Alcance sustentado (explicitação):** event.ts e seal.ts sustentam transação, replay, diferenças de persistência/notificação e integridade limitada por janela.

**Obrigação/lacuna retida (explicitação):** Os outros três leaves não lidos e drivers devem ser lidos para mudar seu comportamento. Replay não prova ownership de execução, autenticação ou compatibilidade irrestrita de schemas.

### identity — 15 entradas

**Profundidades originais:** `decisive_source_read`=3, `grouped_validation_inventory`=5, `representative_family_boundary`=7.

**Read status original:** `not_read`=12, `semantically_read_decisive_ranges`=3.

**Rota original:** `s1.core.extensions`, `s1.core.security`. **Artefatos que de fato citam fontes da família:** `s1.core.extensions`, `s1.core.security`.

**Fontes decisivas listadas no original:** `packages/core/src/credential.ts`, `packages/core/src/credential/cipher.ts`, `packages/core/src/integration.ts`.

**Razões originais aplicáveis:** R008, R015, R049, R050, R082.

**Alcance sustentado (explicitação):** credential/cipher/integration sustentam armazenamento, fallback, herança e ciclo de conexão observado.

**Obrigação/lacuna retida (explicitação):** Account, integração específica, OAuth page, share e credential SQL permanecem leaves próprios. Criptografia do valor não prova todo fluxo de login nem que todo segredo passa pela mesma proteção.

### instruction — 21 entradas

**Profundidades originais:** `decisive_source_read`=1, `grouped_documentation_disposition`=1, `grouped_validation_inventory`=11, `representative_family_boundary`=8.

**Read status original:** `not_read`=20, `semantically_read_decisive_ranges`=1.

**Rota original:** `s1.core.extensions`. **Artefatos que de fato citam fontes da família:** `s1.core.extensions`.

**Fontes decisivas listadas no original:** `packages/core/src/skill.ts`.

**Razões originais aplicáveis:** R008, R034, R051, R083.

**Alcance sustentado (explicitação):** skill.ts sustenta nomes reservados, descoberta, permissões e invalidação do cache. O consumo de instruções tem evidência separada em context.

**Obrigação/lacuna retida (explicitação):** O documento não lido e os oito leaves não lidos retêm obrigações de autoria/carga/visibilidade. Texto de skill não se torna autoridade executável por registro.

### location — 10 entradas

**Profundidades originais:** `decisive_source_read`=3, `grouped_validation_inventory`=6, `representative_family_boundary`=1.

**Read status original:** `not_read`=7, `semantically_read_decisive_ranges`=3.

**Rota original:** `s1.core.project`. **Artefatos que de fato citam fontes da família:** `s1.core.configuration`, `s1.core.project`.

**Fontes decisivas listadas no original:** `packages/core/src/location-mutation.ts`, `packages/core/src/location-service-map.ts`, `packages/core/src/location-services.ts`.

**Razões originais aplicáveis:** R004, R012, R052, R084.

**Alcance sustentado (explicitação):** Mutation e composição/mapa de serviços sustentam a identidade física/lógica e a escolha do grafo por Location.

**Obrigação/lacuna retida (explicitação):** location.ts não foi lido. O contrato de representação ou novas variantes de Location exigem esse leaf; configuração e runtime consultam fontes desta família embora a rota de inventário principal seja project.

### package — 12 entradas

**Profundidades originais:** `decisive_source_read`=2, `grouped_generated_contract`=1, `grouped_support_contract`=7, `grouped_vendor_boundary`=2.

**Read status original:** `not_read`=10, `semantically_read_decisive_ranges`=2.

**Rota original:** `s1.core.entry`. **Artefatos que de fato citam fontes da família:** `s1.core.entry`, `s1.core.models`.

**Fontes decisivas listadas no original:** `packages/core/README.md`, `packages/core/package.json`.

**Razões originais aplicáveis:** R007, R009, R024, R100, R105.

**Alcance sustentado (explicitação):** README e package.json sustentam limites de dependência e exports explícitos; o número de exports é uma observação do manifesto.

**Obrigação/lacuna retida (explicitação):** Schema gerado, scripts, configuração de build e tarball/README vendor não têm semântica lida. Mudança de export, geração, licença ou upstream exige esses inputs e seu contrato; contar exports não valida cada API.

### permission — 9 entradas

**Profundidades originais:** `decisive_source_read`=3, `grouped_validation_inventory`=3, `orientation_read`=1, `representative_family_boundary`=2.

**Read status original:** `captured_targeted_orientation_only`=1, `not_read`=5, `semantically_read_decisive_ranges`=3.

**Rota original:** `s1.core.security`. **Artefatos que de fato citam fontes da família:** `s1.core.security`.

**Fontes decisivas listadas no original:** `.orchestra/skills/session-requests-usage/SKILL.md`, `packages/core/src/permission.ts`, `packages/core/src/question.ts`.

**Razões originais aplicáveis:** R015, R028, R053, R085.

**Alcance sustentado (explicitação):** O serviço e question.ts, junto ao skill de uso, sustentam avaliação, pending maps e o conflito preservado entre rejeição individual descrita e fan-out implementado.

**Obrigação/lacuna retida (explicitação):** Os dois leaves não lidos e o guia somente orientado permanecem necessários para seus detalhes. A diferença Session rules/materialization versus configured impede afirmar enforcamento universal sem rastrear o leaf.

### plugin-host — 63 entradas

**Profundidades originais:** `decisive_source_read`=2, `grouped_documentation_disposition`=1, `grouped_support_contract`=2, `grouped_validation_inventory`=46, `representative_family_boundary`=12.

**Read status original:** `not_read`=61, `semantically_read_decisive_ranges`=2.

**Rota original:** `s1.core.extensions`. **Artefatos que de fato citam fontes da família:** `s1.core.extensions`.

**Fontes decisivas listadas no original:** `packages/core/src/plugin.ts`, `packages/core/src/plugin/README.md`.

**Razões originais aplicáveis:** R008, R035, R054, R086, R106.

**Alcance sustentado (explicitação):** Plugin e README, com State de runtime, sustentam escopos, rebuild, rollback local e limites de ciclo/batch.

**Obrigação/lacuna retida (explicitação):** Doze implementações, documento e suporte não lidos incluem fronteiras SDK/host e carregamento. Ativação em memória não prova durability, compatibilidade de cada plugin ou ordem global atômica.

### process — 58 entradas

**Profundidades originais:** `decisive_source_read`=4, `grouped_documentation_disposition`=6, `grouped_validation_inventory`=22, `representative_family_boundary`=26.

**Read status original:** `not_read`=54, `semantically_read_decisive_ranges`=4.

**Rota original:** `s1.core.runtime`. **Artefatos que de fato citam fontes da família:** `s1.core.runtime`.

**Fontes decisivas listadas no original:** `.orchestra/skills/terminal-maintenance/SKILL.md`, `packages/core/src/omni.ts`, `packages/core/src/process.ts`, `packages/core/src/pty.ts`.

**Razões originais aplicáveis:** R014, R036, R055, R087.

**Alcance sustentado (explicitação):** AppProcess, Omni, PTY e skill de manutenção sustentam captura opcional, seleção de backend, ambiente exato e limites de retenção.

**Obrigação/lacuna retida (explicitação):** 26 leaves e seis documentos não lidos não herdam qualificação de OS/native. Backpressure de cliente WebSocket não leitor continua limite expresso; bounded ring não resolve a fila externa.

### project — 56 entradas

**Profundidades originais:** `decisive_source_read`=6, `grouped_validation_inventory`=24, `representative_family_boundary`=26.

**Read status original:** `not_read`=50, `semantically_read_decisive_ranges`=6.

**Rota original:** `s1.core.project`, `s1.core.runtime`. **Artefatos que de fato citam fontes da família:** `s1.core.project`, `s1.core.runtime`.

**Fontes decisivas listadas no original:** `docs/specs/project.md`, `packages/core/src/filesystem.ts`, `packages/core/src/format/format.ts`, `packages/core/src/project.ts`, `packages/core/src/project/checkpoint.ts`, `packages/core/src/project/directories.ts`.

**Razões originais aplicáveis:** R012, R014, R056, R057, R088.

**Alcance sustentado (explicitação):** Project, membership, paths, checkpoint e FileSystem sustentam identidade e acesso; format pertence também ao consumo runtime.

**Obrigação/lacuna retida (explicitação):** Git mutation, caches, estratégias de cópia, snapshots/revert e demais 26 leaves exigem leitura para alteração/operação específica. Digest de checkpoint não prova restauração ou validade semântica.

### provider — 76 entradas

**Profundidades originais:** `decisive_source_read`=4, `grouped_documentation_disposition`=2, `grouped_validation_inventory`=9, `grouped_vendor_boundary`=25, `representative_family_boundary`=36.

**Read status original:** `not_read`=72, `semantically_read_decisive_ranges`=4.

**Rota original:** `s1.core.models`. **Artefatos que de fato citam fontes da família:** `s1.core.models`.

**Fontes decisivas listadas no original:** `packages/core/src/aisdk.ts`, `packages/core/src/catalog.ts`, `packages/core/src/model.ts`, `packages/core/src/provider.ts`.

**Razões originais aplicáveis:** R010, R037, R058, R089, R101.

**Alcance sustentado (explicitação):** Catalog/model/provider/AISDK sustentam seleção e fronteira; o adapter de sessão é fonte adicional da família session.

**Obrigação/lacuna retida (explicitação):** 36 implementações, 25 bytes vendor e dois documentos não lidos não são aceitos como providers operacionais. Auth, protocolos, preços e compatibilidade vendor precisam de evidência específica; catálogo não faz ping.

### rag-studio — 1 entradas

**Profundidades originais:** `decisive_source_read`=1.

**Read status original:** `semantically_read_decisive_ranges`=1.

**Rota original:** `s1.core.boundaries`. **Artefatos que de fato citam fontes da família:** `s1.core.boundaries`.

**Fontes decisivas listadas no original:** `packages/core/src/rag-studio/sql.ts`.

**Razões originais aplicáveis:** R002.

**Alcance sustentado (explicitação):** O único membro atribuído é o schema SQL, lido: sua presença estabelece tabelas, não retrieval.

**Obrigação/lacuna retida (explicitação):** Embedding, busca e pipelines pertencem ao módulo responsável e não foram demonstrados. Ausência de coluna nesse schema não prova ausência de qualquer outro armazenamento no produto.

### relay — 19 entradas

**Profundidades originais:** `decisive_source_read`=1, `grouped_validation_inventory`=9, `representative_family_boundary`=9.

**Read status original:** `not_read`=18, `semantically_read_decisive_ranges`=1.

**Rota original:** `s1.core.boundaries`. **Artefatos que de fato citam fontes da família:** `s1.core.boundaries`.

**Fontes decisivas listadas no original:** `packages/core/src/relay.ts`.

**Razões originais aplicáveis:** R002, R059, R090.

**Alcance sustentado (explicitação):** O adapter sustenta gravação de verdict, recuperação local conservadora e recusa do evaluator genérico em workflows vinculados.

**Obrigação/lacuna retida (explicitação):** Nove leaves não lidos e o engine externo não têm aceite derivado. Hooks, workflows, gates reais e locks de outros hosts exigem suas fontes e evidências; passagem não gravada não vira PASS.

### research — 71 entradas

**Profundidades originais:** `decisive_source_read`=2, `grouped_support_contract`=3, `grouped_validation_inventory`=28, `representative_family_boundary`=38.

**Read status original:** `not_read`=69, `semantically_read_decisive_ranges`=2.

**Rota original:** `s1.core.research`. **Artefatos que de fato citam fontes da família:** `s1.core.research`.

**Fontes decisivas listadas no original:** `packages/core/src/research-toolkit/index.ts`, `packages/core/src/research/ledger.ts`.

**Razões originais aplicáveis:** R013, R060, R091, R107.

**Alcance sustentado (explicitação):** ResearchToolkit e Ledger sustentam caps, adapter vazio padrão, status best effort e identidade/replay da evidência.

**Obrigação/lacuna retida (explicitação):** 38 leaves e três inputs não lidos retêm validação de documentos, índices, parsers e sandbox builds. Planejamento que falhou e virou lista vazia não comprova cobertura; conteúdo admitido não comprova sua verdade.

### runtime — 41 entradas

**Profundidades originais:** `decisive_source_read`=6, `grouped_validation_inventory`=17, `representative_family_boundary`=18.

**Read status original:** `not_read`=35, `semantically_read_decisive_ranges`=6.

**Rota original:** `s1.core.runtime`. **Artefatos que de fato citam fontes da família:** `s1.core.extensions`, `s1.core.runtime`.

**Fontes decisivas listadas no original:** `packages/core/src/effect/app-node.ts`, `packages/core/src/global.ts`, `packages/core/src/host.ts`, `packages/core/src/installation/service.ts`, `packages/core/src/observability/otlp.ts`, `packages/core/src/state.ts`.

**Razões originais aplicáveis:** R008, R014, R061, R092.

**Alcance sustentado (explicitação):** Host, app-node, Global, State, instalação e OTLP sustentam composição e observação condicional dos serviços.

**Obrigação/lacuna retida (explicitação):** 18 leaves não lidos e implementações de backend/exporter externas precisam de leitura para usos específicos. Instalação latest com fallback não comprova frescor remoto; endpoint configurado não comprova exportação.

### scheduled-task — 11 entradas

**Profundidades originais:** `decisive_source_read`=2, `grouped_validation_inventory`=4, `representative_family_boundary`=5.

**Read status original:** `not_read`=9, `semantically_read_decisive_ranges`=2.

**Rota original:** `s1.core.automation`. **Artefatos que de fato citam fontes da família:** `s1.core.automation`, `s1.core.capability`.

**Fontes decisivas listadas no original:** `packages/core/src/scheduled-task.ts`, `packages/core/src/scheduled-task/port.ts`.

**Razões originais aplicáveis:** R001, R003, R062, R093.

**Alcance sustentado (explicitação):** Scheduler e port sustentam claims de dispatch, admissão por Session e separação do host; o lease não é ownership da execução de Session.

**Obrigação/lacuna retida (explicitação):** Cinco leaves não lidos incluem detalhes de SQL/cadência. Alterá-los exige leitura; a race revogação→admissão permanece observada e started não prova completion.

### session — 90 entradas

**Profundidades originais:** `decisive_source_read`=14, `grouped_support_contract`=1, `grouped_validation_inventory`=36, `orientation_read`=3, `representative_family_boundary`=36.

**Read status original:** `captured_targeted_orientation_only`=3, `not_read`=73, `semantically_read_decisive_ranges`=14.

**Rota original:** `s1.core.context`, `s1.core.models`, `s1.core.persistence`, `s1.core.session-admission`, `s1.core.session-execution`. **Artefatos que de fato citam fontes da família:** `s1.core.context`, `s1.core.models`, `s1.core.persistence`, `s1.core.project`, `s1.core.security`, `s1.core.session-admission`, `s1.core.session-execution`, `s1.core.tools`.

**Fontes decisivas listadas no original:** `docs/specs/v2/session.md`, `packages/core/src/session.ts`, `packages/core/src/session/compaction.ts`, `packages/core/src/session/context-epoch.ts`, `packages/core/src/session/execution.ts`, `packages/core/src/session/execution/local.ts`, `packages/core/src/session/history.ts`, `packages/core/src/session/input.ts`, `packages/core/src/session/projector.ts`, `packages/core/src/session/run-coordinator.ts`, `packages/core/src/session/runner/llm.ts`, `packages/core/src/session/runner/model.ts`, `packages/core/src/session/sql.ts`, `packages/core/src/session/store.ts`.

**Razões originais aplicáveis:** R005, R010, R011, R016, R017, R018, R019, R020, R029, R063, R064, R065, R066, R094, R108.

**Alcance sustentado (explicitação):** Quatorze leituras decisivas distribuem admissão, execução, contexto, persistência e seleção de modelo por cinco artefatos. Os usos cruzados são explícitos no mapa.

**Obrigação/lacuna retida (explicitação):** 36 leaves não lidos, três orientações e um suporte não autorizam feature census completo. Attachments, snapshot/revert, engine internals e demais operações precisam de leitura quando o requisito depende deles; não há recuperação distribuída demonstrada.

### system-context — 11 entradas

**Profundidades originais:** `decisive_source_read`=4, `grouped_validation_inventory`=7.

**Read status original:** `not_read`=7, `semantically_read_decisive_ranges`=4.

**Rota original:** `s1.core.context`. **Artefatos que de fato citam fontes da família:** `s1.core.context`.

**Fontes decisivas listadas no original:** `packages/core/src/instruction-context.ts`, `packages/core/src/system-context/builtins.ts`, `packages/core/src/system-context/index.ts`, `packages/core/src/system-context/registry.ts`.

**Razões originais aplicáveis:** R005, R095.

**Alcance sustentado (explicitação):** Os quatro membros de implementação atribuídos estão lidos e sustentam álgebra, registry, built-ins e instruction-context; sete testes são inventário, não resultados.

**Obrigação/lacuna retida (explicitação):** Fontes de contexto dos domínios externos, substituições de Continuity e qualidade de summaries ficam fora da prova dessas quatro implementações. Tests não executados não fecham o risco de runtime.

### tool — 114 entradas

**Profundidades originais:** `decisive_source_read`=11, `grouped_documentation_disposition`=2, `grouped_support_contract`=4, `grouped_validation_inventory`=43, `orientation_read`=1, `representative_family_boundary`=53.

**Read status original:** `captured_targeted_orientation_only`=1, `not_read`=102, `semantically_read_decisive_ranges`=11.

**Rota original:** `s1.core.extensions`, `s1.core.runtime`, `s1.core.tools`. **Artefatos que de fato citam fontes da família:** `s1.core.extensions`, `s1.core.runtime`, `s1.core.security`, `s1.core.tools`.

**Fontes decisivas listadas no original:** `packages/core/src/lsp/lsp.ts`, `packages/core/src/mcp.ts`, `packages/core/src/tool-output-store.ts`, `packages/core/src/tool/AGENTS.md`, `packages/core/src/tool/agent-terminal.ts`, `packages/core/src/tool/application-tools.ts`, `packages/core/src/tool/apply-patch.ts`, `packages/core/src/tool/bash.ts`, `packages/core/src/tool/read.ts`, `packages/core/src/tool/registry.ts`, `packages/core/src/tool/tool.ts`.

**Razões originais aplicáveis:** R008, R014, R015, R021, R030, R038, R067, R068, R069, R097, R109.

**Alcance sustentado (explicitação):** Tool/registry/output e folhas representativas sustentam identidade, settlement, permissões locais, output e o contraste do read. MCP/LSP/terminal são usados por outros artefatos.

**Obrigação/lacuna retida (explicitação):** 53 leaves não lidos, orientação do spec, docs e suporte não validam cada ferramenta. Lean/attestation, outras mutações, parsing e payloads devem ser lidos antes de prometer esse comportamento; caminhos de output continuam expostos.

### tool-safety — 36 entradas

**Profundidades originais:** `decisive_source_read`=2, `grouped_validation_inventory`=22, `representative_family_boundary`=12.

**Read status original:** `not_read`=34, `semantically_read_decisive_ranges`=2.

**Rota original:** `s1.core.security`. **Artefatos que de fato citam fontes da família:** `s1.core.security`.

**Fontes decisivas listadas no original:** `packages/core/src/tool-safety-sandbox.ts`, `packages/core/src/tool-safety.ts`.

**Razões originais aplicáveis:** R015, R070, R096.

**Alcance sustentado (explicitação):** Safety e sandbox sustentam checks, scrub heurístico, wrapper e recusa/fallback condicionais; bash é evidência da chamada após permissões.

**Obrigação/lacuna retida (explicitação):** Doze leaves não lidos de perfis/backends/recognizers retêm obrigações específicas. Confinamento efetivo e completude de reconhecimento de segredo exigem qualificação; wrapper descoberto não equivale a processo confinado observado.

### util — 32 entradas

**Profundidades originais:** `grouped_validation_inventory`=7, `representative_family_boundary`=25.

**Read status original:** `not_read`=32.

**Rota original:** `s1.core.runtime`. **Artefatos que de fato citam fontes da família:** nenhum.

**Fontes decisivas listadas no original:** nenhuma.

**Razões originais aplicáveis:** R071, R098.

**Alcance sustentado (explicitação):** Nenhuma das 25 implementações de util foi lida: o agrupamento vincula consumidores/runtime e conserva o conjunto, sem autoridade semântica própria.

**Obrigação/lacuna retida (explicitação):** Hash, retry, timeout, locks, physical-path, image/npm e demais helpers exigem leitura antes de serem premissas de uma afirmação. Se um caso obrigatório L1 depende de sua semântica, a lacuna permanece obrigatória agora, não opcionalmente adiada.

### validation-support — 80 entradas

**Profundidades originais:** `grouped_validation_inventory`=80.

**Read status original:** `not_read`=80.

**Rota original:** `s1.core.entry`. **Artefatos que de fato citam fontes da família:** nenhum.

**Fontes decisivas listadas no original:** nenhuma.

**Razões originais aplicáveis:** R099.

**Alcance sustentado (explicitação):** Os 80 fixtures/harnesses/testes transversais estão individualmente identificados e agrupados como inventário de validação.

**Obrigação/lacuna retida (explicitação):** A existência desses membros não produz teste executado nem garantia de regressão. Caso/gate pertinente exige selecionar e ler o teste/harness e obter execução autorizada no candidato correto.

## Apêndice — razões originais exatas

As razões abaixo são texto do `coverage.json` congelado. O número é sua frequência global; não é uma decisão de aceite. `coverage-needs-projection.json` preserva a ligação razão → grupo → cada caminho/blob, sem perda de campos.

**R001 — 5 entradas**

> Captured pinned bytes and inspected cited definitions/control flow used by s1.core.automation; conclusions are limited to these source ranges and explicit normative sections.

**R002 — 4 entradas**

> Captured pinned bytes and inspected cited definitions/control flow used by s1.core.boundaries; conclusions are limited to these source ranges and explicit normative sections.

**R003 — 6 entradas**

> Captured pinned bytes and inspected cited definitions/control flow used by s1.core.capability; conclusions are limited to these source ranges and explicit normative sections.

**R004 — 5 entradas**

> Captured pinned bytes and inspected cited definitions/control flow used by s1.core.configuration; conclusions are limited to these source ranges and explicit normative sections.

**R005 — 7 entradas**

> Captured pinned bytes and inspected cited definitions/control flow used by s1.core.context; conclusions are limited to these source ranges and explicit normative sections.

**R006 — 1 entradas**

> Captured pinned bytes and inspected cited definitions/control flow used by s1.core.economy; conclusions are limited to these source ranges and explicit normative sections.

**R007 — 1 entradas**

> Captured pinned bytes and inspected cited definitions/control flow used by s1.core.entry; conclusions are limited to these source ranges and explicit normative sections.

**R008 — 7 entradas**

> Captured pinned bytes and inspected cited definitions/control flow used by s1.core.extensions; conclusions are limited to these source ranges and explicit normative sections.

**R009 — 1 entradas**

> Captured pinned bytes and inspected cited definitions/control flow used by s1.core.models, s1.core.entry; conclusions are limited to these source ranges and explicit normative sections.

**R010 — 5 entradas**

> Captured pinned bytes and inspected cited definitions/control flow used by s1.core.models; conclusions are limited to these source ranges and explicit normative sections.

**R011 — 6 entradas**

> Captured pinned bytes and inspected cited definitions/control flow used by s1.core.persistence; conclusions are limited to these source ranges and explicit normative sections.

**R012 — 6 entradas**

> Captured pinned bytes and inspected cited definitions/control flow used by s1.core.project; conclusions are limited to these source ranges and explicit normative sections.

**R013 — 4 entradas**

> Captured pinned bytes and inspected cited definitions/control flow used by s1.core.research; conclusions are limited to these source ranges and explicit normative sections.

**R014 — 11 entradas**

> Captured pinned bytes and inspected cited definitions/control flow used by s1.core.runtime; conclusions are limited to these source ranges and explicit normative sections.

**R015 — 9 entradas**

> Captured pinned bytes and inspected cited definitions/control flow used by s1.core.security; conclusions are limited to these source ranges and explicit normative sections.

**R016 — 1 entradas**

> Captured pinned bytes and inspected cited definitions/control flow used by s1.core.session-admission, s1.core.project; conclusions are limited to these source ranges and explicit normative sections.

**R017 — 1 entradas**

> Captured pinned bytes and inspected cited definitions/control flow used by s1.core.session-admission, s1.core.session-execution, s1.core.tools, s1.core.security; conclusions are limited to these source ranges and explicit normative sections.

**R018 — 3 entradas**

> Captured pinned bytes and inspected cited definitions/control flow used by s1.core.session-admission; conclusions are limited to these source ranges and explicit normative sections.

**R019 — 1 entradas**

> Captured pinned bytes and inspected cited definitions/control flow used by s1.core.session-execution, s1.core.context, s1.core.security; conclusions are limited to these source ranges and explicit normative sections.

**R020 — 3 entradas**

> Captured pinned bytes and inspected cited definitions/control flow used by s1.core.session-execution; conclusions are limited to these source ranges and explicit normative sections.

**R021 — 7 entradas**

> Captured pinned bytes and inspected cited definitions/control flow used by s1.core.tools; conclusions are limited to these source ranges and explicit normative sections.

**R022 — 1 entradas**

> Generated artifact retained in backend-toolkit disposition; generator/owner contract, not hand-editable semantic authority. Current runtime contract is represented by s1.core.research; regeneration and byte comparison belong to authorized maintenance.

**R023 — 2 entradas**

> Generated artifact retained in database disposition; generator/owner contract, not hand-editable semantic authority. Current runtime contract is represented by s1.core.persistence; regeneration and byte comparison belong to authorized maintenance.

**R024 — 1 entradas**

> Generated artifact retained in package disposition; generator/owner contract, not hand-editable semantic authority. Current runtime contract is represented by s1.core.entry; regeneration and byte comparison belong to authorized maintenance.

**R025 — 72 entradas**

> Ordered historical user-data migration retained as compatibility input; current migration engine and data-contract limits are read in s1.core.persistence. A change affecting this history requires this migration and affected predecessor reads.

**R026 — 1 entradas**

> Pinned bytes captured; orientation/header inspection does not authorize leaf-specific behavior claims. Family boundary is documented in s1.core.automation; deeper source read required before operational use of this file.

**R027 — 1 entradas**

> Pinned bytes captured; orientation/header inspection does not authorize leaf-specific behavior claims. Family boundary is documented in s1.core.extensions; deeper source read required before operational use of this file.

**R028 — 1 entradas**

> Pinned bytes captured; orientation/header inspection does not authorize leaf-specific behavior claims. Family boundary is documented in s1.core.security; deeper source read required before operational use of this file.

**R029 — 3 entradas**

> Pinned bytes captured; orientation/header inspection does not authorize leaf-specific behavior claims. Family boundary is documented in s1.core.session-execution; deeper source read required before operational use of this file.

**R030 — 1 entradas**

> Pinned bytes captured; orientation/header inspection does not authorize leaf-specific behavior claims. Family boundary is documented in s1.core.tools; deeper source read required before operational use of this file.

**R031 — 9 entradas**

> Repository document retained with architecture-history family; no current implementation or executed qualification is inferred from its filename/status. Consult alongside s1.core.entry before relying on historical intent or a specific guide requirement.

**R032 — 2 entradas**

> Repository document retained with capability family; no current implementation or executed qualification is inferred from its filename/status. Consult alongside s1.core.capability before relying on historical intent or a specific guide requirement.

**R033 — 3 entradas**

> Repository document retained with documentation family; no current implementation or executed qualification is inferred from its filename/status. Consult alongside s1.core.entry before relying on historical intent or a specific guide requirement.

**R034 — 1 entradas**

> Repository document retained with instruction family; no current implementation or executed qualification is inferred from its filename/status. Consult alongside s1.core.extensions before relying on historical intent or a specific guide requirement.

**R035 — 1 entradas**

> Repository document retained with plugin-host family; no current implementation or executed qualification is inferred from its filename/status. Consult alongside s1.core.extensions before relying on historical intent or a specific guide requirement.

**R036 — 6 entradas**

> Repository document retained with process family; no current implementation or executed qualification is inferred from its filename/status. Consult alongside s1.core.runtime before relying on historical intent or a specific guide requirement.

**R037 — 2 entradas**

> Repository document retained with provider family; no current implementation or executed qualification is inferred from its filename/status. Consult alongside s1.core.models before relying on historical intent or a specific guide requirement.

**R038 — 2 entradas**

> Repository document retained with tool family; no current implementation or executed qualification is inferred from its filename/status. Consult alongside s1.core.tools before relying on historical intent or a specific guide requirement.

**R039 — 80 entradas**

> Substantive actions leaf, not discarded as support. The coherent family entry/authority/lifecycle boundary is sourced in s1.core.automation; this individual implementation is not semantically accepted and needs deeper reading for leaf-specific claims or changes.

**R040 — 1 entradas**

> Substantive agent leaf, not discarded as support. The coherent family entry/authority/lifecycle boundary is sourced in s1.core.extensions; this individual implementation is not semantically accepted and needs deeper reading for leaf-specific claims or changes.

**R041 — 39 entradas**

> Substantive backend-toolkit leaf, not discarded as support. The coherent family entry/authority/lifecycle boundary is sourced in s1.core.research; this individual implementation is not semantically accepted and needs deeper reading for leaf-specific claims or changes.

**R042 — 23 entradas**

> Substantive board leaf, not discarded as support. The coherent family entry/authority/lifecycle boundary is sourced in s1.core.automation; this individual implementation is not semantically accepted and needs deeper reading for leaf-specific claims or changes.

**R043 — 89 entradas**

> Substantive capability leaf, not discarded as support. The coherent family entry/authority/lifecycle boundary is sourced in s1.core.capability; this individual implementation is not semantically accepted and needs deeper reading for leaf-specific claims or changes.

**R044 — 41 entradas**

> Substantive config leaf, not discarded as support. The coherent family entry/authority/lifecycle boundary is sourced in s1.core.configuration; this individual implementation is not semantically accepted and needs deeper reading for leaf-specific claims or changes.

**R045 — 1 entradas**

> Substantive control-plane leaf, not discarded as support. The coherent family entry/authority/lifecycle boundary is sourced in s1.core.boundaries; this individual implementation is not semantically accepted and needs deeper reading for leaf-specific claims or changes.

**R046 — 6 entradas**

> Substantive database leaf, not discarded as support. The coherent family entry/authority/lifecycle boundary is sourced in s1.core.persistence; this individual implementation is not semantically accepted and needs deeper reading for leaf-specific claims or changes.

**R047 — 2 entradas**

> Substantive economy leaf, not discarded as support. The coherent family entry/authority/lifecycle boundary is sourced in s1.core.economy; this individual implementation is not semantically accepted and needs deeper reading for leaf-specific claims or changes.

**R048 — 3 entradas**

> Substantive event leaf, not discarded as support. The coherent family entry/authority/lifecycle boundary is sourced in s1.core.persistence; this individual implementation is not semantically accepted and needs deeper reading for leaf-specific claims or changes.

**R049 — 6 entradas**

> Substantive identity leaf, not discarded as support. The coherent family entry/authority/lifecycle boundary is sourced in s1.core.extensions; this individual implementation is not semantically accepted and needs deeper reading for leaf-specific claims or changes.

**R050 — 1 entradas**

> Substantive identity leaf, not discarded as support. The coherent family entry/authority/lifecycle boundary is sourced in s1.core.security; this individual implementation is not semantically accepted and needs deeper reading for leaf-specific claims or changes.

**R051 — 8 entradas**

> Substantive instruction leaf, not discarded as support. The coherent family entry/authority/lifecycle boundary is sourced in s1.core.extensions; this individual implementation is not semantically accepted and needs deeper reading for leaf-specific claims or changes.

**R052 — 1 entradas**

> Substantive location leaf, not discarded as support. The coherent family entry/authority/lifecycle boundary is sourced in s1.core.project; this individual implementation is not semantically accepted and needs deeper reading for leaf-specific claims or changes.

**R053 — 2 entradas**

> Substantive permission leaf, not discarded as support. The coherent family entry/authority/lifecycle boundary is sourced in s1.core.security; this individual implementation is not semantically accepted and needs deeper reading for leaf-specific claims or changes.

**R054 — 12 entradas**

> Substantive plugin-host leaf, not discarded as support. The coherent family entry/authority/lifecycle boundary is sourced in s1.core.extensions; this individual implementation is not semantically accepted and needs deeper reading for leaf-specific claims or changes.

**R055 — 26 entradas**

> Substantive process leaf, not discarded as support. The coherent family entry/authority/lifecycle boundary is sourced in s1.core.runtime; this individual implementation is not semantically accepted and needs deeper reading for leaf-specific claims or changes.

**R056 — 24 entradas**

> Substantive project leaf, not discarded as support. The coherent family entry/authority/lifecycle boundary is sourced in s1.core.project; this individual implementation is not semantically accepted and needs deeper reading for leaf-specific claims or changes.

**R057 — 2 entradas**

> Substantive project leaf, not discarded as support. The coherent family entry/authority/lifecycle boundary is sourced in s1.core.runtime; this individual implementation is not semantically accepted and needs deeper reading for leaf-specific claims or changes.

**R058 — 36 entradas**

> Substantive provider leaf, not discarded as support. The coherent family entry/authority/lifecycle boundary is sourced in s1.core.models; this individual implementation is not semantically accepted and needs deeper reading for leaf-specific claims or changes.

**R059 — 9 entradas**

> Substantive relay leaf, not discarded as support. The coherent family entry/authority/lifecycle boundary is sourced in s1.core.boundaries; this individual implementation is not semantically accepted and needs deeper reading for leaf-specific claims or changes.

**R060 — 38 entradas**

> Substantive research leaf, not discarded as support. The coherent family entry/authority/lifecycle boundary is sourced in s1.core.research; this individual implementation is not semantically accepted and needs deeper reading for leaf-specific claims or changes.

**R061 — 18 entradas**

> Substantive runtime leaf, not discarded as support. The coherent family entry/authority/lifecycle boundary is sourced in s1.core.runtime; this individual implementation is not semantically accepted and needs deeper reading for leaf-specific claims or changes.

**R062 — 5 entradas**

> Substantive scheduled-task leaf, not discarded as support. The coherent family entry/authority/lifecycle boundary is sourced in s1.core.automation; this individual implementation is not semantically accepted and needs deeper reading for leaf-specific claims or changes.

**R063 — 1 entradas**

> Substantive session leaf, not discarded as support. The coherent family entry/authority/lifecycle boundary is sourced in s1.core.models; this individual implementation is not semantically accepted and needs deeper reading for leaf-specific claims or changes.

**R064 — 4 entradas**

> Substantive session leaf, not discarded as support. The coherent family entry/authority/lifecycle boundary is sourced in s1.core.persistence; this individual implementation is not semantically accepted and needs deeper reading for leaf-specific claims or changes.

**R065 — 2 entradas**

> Substantive session leaf, not discarded as support. The coherent family entry/authority/lifecycle boundary is sourced in s1.core.session-admission; this individual implementation is not semantically accepted and needs deeper reading for leaf-specific claims or changes.

**R066 — 29 entradas**

> Substantive session leaf, not discarded as support. The coherent family entry/authority/lifecycle boundary is sourced in s1.core.session-execution; this individual implementation is not semantically accepted and needs deeper reading for leaf-specific claims or changes.

**R067 — 8 entradas**

> Substantive tool leaf, not discarded as support. The coherent family entry/authority/lifecycle boundary is sourced in s1.core.extensions; this individual implementation is not semantically accepted and needs deeper reading for leaf-specific claims or changes.

**R068 — 12 entradas**

> Substantive tool leaf, not discarded as support. The coherent family entry/authority/lifecycle boundary is sourced in s1.core.runtime; this individual implementation is not semantically accepted and needs deeper reading for leaf-specific claims or changes.

**R069 — 33 entradas**

> Substantive tool leaf, not discarded as support. The coherent family entry/authority/lifecycle boundary is sourced in s1.core.tools; this individual implementation is not semantically accepted and needs deeper reading for leaf-specific claims or changes.

**R070 — 12 entradas**

> Substantive tool-safety leaf, not discarded as support. The coherent family entry/authority/lifecycle boundary is sourced in s1.core.security; this individual implementation is not semantically accepted and needs deeper reading for leaf-specific claims or changes.

**R071 — 25 entradas**

> Substantive util leaf, not discarded as support. The coherent family entry/authority/lifecycle boundary is sourced in s1.core.runtime; this individual implementation is not semantically accepted and needs deeper reading for leaf-specific claims or changes.

**R072 — 72 entradas**

> Validation/fixture population is retained under actions; grouped at L1 because no executed result is inferred from test existence. Select exact tests only when a behavior change or runtime gate requires them.

**R073 — 1 entradas**

> Validation/fixture population is retained under agent; grouped at L1 because no executed result is inferred from test existence. Select exact tests only when a behavior change or runtime gate requires them.

**R074 — 13 entradas**

> Validation/fixture population is retained under backend-toolkit; grouped at L1 because no executed result is inferred from test existence. Select exact tests only when a behavior change or runtime gate requires them.

**R075 — 13 entradas**

> Validation/fixture population is retained under board; grouped at L1 because no executed result is inferred from test existence. Select exact tests only when a behavior change or runtime gate requires them.

**R076 — 73 entradas**

> Validation/fixture population is retained under capability; grouped at L1 because no executed result is inferred from test existence. Select exact tests only when a behavior change or runtime gate requires them.

**R077 — 18 entradas**

> Validation/fixture population is retained under config; grouped at L1 because no executed result is inferred from test existence. Select exact tests only when a behavior change or runtime gate requires them.

**R078 — 1 entradas**

> Validation/fixture population is retained under control-plane; grouped at L1 because no executed result is inferred from test existence. Select exact tests only when a behavior change or runtime gate requires them.

**R079 — 6 entradas**

> Validation/fixture population is retained under database; grouped at L1 because no executed result is inferred from test existence. Select exact tests only when a behavior change or runtime gate requires them.

**R080 — 2 entradas**

> Validation/fixture population is retained under economy; grouped at L1 because no executed result is inferred from test existence. Select exact tests only when a behavior change or runtime gate requires them.

**R081 — 6 entradas**

> Validation/fixture population is retained under event; grouped at L1 because no executed result is inferred from test existence. Select exact tests only when a behavior change or runtime gate requires them.

**R082 — 5 entradas**

> Validation/fixture population is retained under identity; grouped at L1 because no executed result is inferred from test existence. Select exact tests only when a behavior change or runtime gate requires them.

**R083 — 11 entradas**

> Validation/fixture population is retained under instruction; grouped at L1 because no executed result is inferred from test existence. Select exact tests only when a behavior change or runtime gate requires them.

**R084 — 6 entradas**

> Validation/fixture population is retained under location; grouped at L1 because no executed result is inferred from test existence. Select exact tests only when a behavior change or runtime gate requires them.

**R085 — 3 entradas**

> Validation/fixture population is retained under permission; grouped at L1 because no executed result is inferred from test existence. Select exact tests only when a behavior change or runtime gate requires them.

**R086 — 46 entradas**

> Validation/fixture population is retained under plugin-host; grouped at L1 because no executed result is inferred from test existence. Select exact tests only when a behavior change or runtime gate requires them.

**R087 — 22 entradas**

> Validation/fixture population is retained under process; grouped at L1 because no executed result is inferred from test existence. Select exact tests only when a behavior change or runtime gate requires them.

**R088 — 24 entradas**

> Validation/fixture population is retained under project; grouped at L1 because no executed result is inferred from test existence. Select exact tests only when a behavior change or runtime gate requires them.

**R089 — 9 entradas**

> Validation/fixture population is retained under provider; grouped at L1 because no executed result is inferred from test existence. Select exact tests only when a behavior change or runtime gate requires them.

**R090 — 9 entradas**

> Validation/fixture population is retained under relay; grouped at L1 because no executed result is inferred from test existence. Select exact tests only when a behavior change or runtime gate requires them.

**R091 — 28 entradas**

> Validation/fixture population is retained under research; grouped at L1 because no executed result is inferred from test existence. Select exact tests only when a behavior change or runtime gate requires them.

**R092 — 17 entradas**

> Validation/fixture population is retained under runtime; grouped at L1 because no executed result is inferred from test existence. Select exact tests only when a behavior change or runtime gate requires them.

**R093 — 4 entradas**

> Validation/fixture population is retained under scheduled-task; grouped at L1 because no executed result is inferred from test existence. Select exact tests only when a behavior change or runtime gate requires them.

**R094 — 36 entradas**

> Validation/fixture population is retained under session; grouped at L1 because no executed result is inferred from test existence. Select exact tests only when a behavior change or runtime gate requires them.

**R095 — 7 entradas**

> Validation/fixture population is retained under system-context; grouped at L1 because no executed result is inferred from test existence. Select exact tests only when a behavior change or runtime gate requires them.

**R096 — 22 entradas**

> Validation/fixture population is retained under tool-safety; grouped at L1 because no executed result is inferred from test existence. Select exact tests only when a behavior change or runtime gate requires them.

**R097 — 43 entradas**

> Validation/fixture population is retained under tool; grouped at L1 because no executed result is inferred from test existence. Select exact tests only when a behavior change or runtime gate requires them.

**R098 — 7 entradas**

> Validation/fixture population is retained under util; grouped at L1 because no executed result is inferred from test existence. Select exact tests only when a behavior change or runtime gate requires them.

**R099 — 80 entradas**

> Validation/fixture population is retained under validation-support; grouped at L1 because no executed result is inferred from test existence. Select exact tests only when a behavior change or runtime gate requires them.

**R100 — 2 entradas**

> Vendored/upstream compatibility bytes retained as distinct authority. s1.core.entry establishes the host boundary; vendor internals and license/update obligations require targeted vendor inspection when touched.

**R101 — 25 entradas**

> Vendored/upstream compatibility bytes retained as distinct authority. s1.core.models establishes the host boundary; vendor internals and license/update obligations require targeted vendor inspection when touched.

**R102 — 6 entradas**

> agent support input retained under s1.core.extensions. Runtime text/pins/generator inputs are behavior-relevant when changed; this L1 claims only inspected owner/entry boundaries, not the unseen content.

**R103 — 4 entradas**

> backend-toolkit support input retained under s1.core.research. Runtime text/pins/generator inputs are behavior-relevant when changed; this L1 claims only inspected owner/entry boundaries, not the unseen content.

**R104 — 1 entradas**

> capability support input retained under s1.core.capability. Runtime text/pins/generator inputs are behavior-relevant when changed; this L1 claims only inspected owner/entry boundaries, not the unseen content.

**R105 — 7 entradas**

> package support input retained under s1.core.entry. Runtime text/pins/generator inputs are behavior-relevant when changed; this L1 claims only inspected owner/entry boundaries, not the unseen content.

**R106 — 2 entradas**

> plugin-host support input retained under s1.core.extensions. Runtime text/pins/generator inputs are behavior-relevant when changed; this L1 claims only inspected owner/entry boundaries, not the unseen content.

**R107 — 3 entradas**

> research support input retained under s1.core.research. Runtime text/pins/generator inputs are behavior-relevant when changed; this L1 claims only inspected owner/entry boundaries, not the unseen content.

**R108 — 1 entradas**

> session support input retained under s1.core.session-execution. Runtime text/pins/generator inputs are behavior-relevant when changed; this L1 claims only inspected owner/entry boundaries, not the unseen content.

**R109 — 4 entradas**

> tool support input retained under s1.core.tools. Runtime text/pins/generator inputs are behavior-relevant when changed; this L1 claims only inspected owner/entry boundaries, not the unseen content.

