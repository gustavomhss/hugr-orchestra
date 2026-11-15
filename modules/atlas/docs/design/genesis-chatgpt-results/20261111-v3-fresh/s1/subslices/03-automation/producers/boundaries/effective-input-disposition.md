# Inputs efetivos por artefato

Esta disposição registra entradas realmente usadas. O arquivo integral continua sendo a unidade de identidade, mesmo quando a leitura semântica se concentrou em intervalos. A lista não declara imports/aceites nem transforma fonte em predecessor aceito. Não há duplicação dos 128 registros de captura: paths exatos abaixo resolvem suas identidades em `captures.json`.

## História efetiva compartilhada

| Input integral | Bytes | SHA256 | Motivo em boundaries e support |
|---|---:|---|---|
| `inputs-effective/history/a3-dossier.md` | 177076 | `36416073165d59eec9c7d847a26f414d855cc2a40758d548f4dd49669dccc5d4` | Reuso declarado, escopo histórico, contagens/profundidade herdadas e limites de autoridade. |
| `inputs-effective/history/a4-dossier.md` | 155061 | `83b544ac46f99b2bf3585ff4e607bcd403e49eb20dd128deb5b6a029a772ead0` | Reuso declarado, escopo histórico, contagens/profundidade herdadas e limites de autoridade. |
| `inputs-effective/history/coverage-needs-projection.json` | 726892 | `05485c4bd0ac9c76814e44537788818bbcf1fbcbfb87dd8063ce30bf1a67e0cf` | Reuso declarado, escopo histórico, contagens/profundidade herdadas e limites de autoridade. |

A3/A4 foram lidos por trechos pertinentes; a projeção foi parseada para selecionar os dois registros. Isso **não** muda a unidade de input para o recorte pequeno. A projeção de 726.892 bytes permanece necessária às afirmações atuais de 4+20/2+102 e às obrigações históricas. Se um caminho nativo tiver teto 256K, estes registros não o contornam: capacidade/binding precisa ser resolvido pela autoridade competente ou uma futura mudança real de claims/recipe deve ser autorizada e julgada.

Os corpos históricos `history/boundaries.md` e `history/entry.md` também são inputs reais, preservados byte a byte. `inputs-effective/` conserva os 12 arquivos originais de orientação/inventário/autoridade, com identidades em `effective-inputs.json`. AGENTS corresponde ao blob de produto `ef3b523b0c00aed722582b870c1919188edc4c4f`, conferido contra a referência histórica, sem novo fetch fictício.

## Relação por artefato

- `s1.core.boundaries`: grupo 24 fronteiras + README compartilhado + oito arquivos de navegação; os dois corpos históricos, A3/A4/projection integrais e os inputs de autoridade/receita.

- `s1.subslice03.support`: grupo 104 suporte + oito arquivos de navegação; os dois corpos históricos, A3/A4/projection integrais e os inputs de autoridade/receita. A composição 24+104 vem do coverage original, sem declarar o corpo boundaries um predecessor aceito.

## Lista exata por grupo

### boundaries_assigned — 24 paths

Fourteen full implementation leaves and ten prepared test contracts supply the local adapter claims.

- `packages/core/src/atlas.ts`
- `packages/core/src/control-plane/move-session.ts`
- `packages/core/src/control-plane/workspace.sql.ts`
- `packages/core/src/rag-studio/sql.ts`
- `packages/core/src/relay-commands.ts`
- `packages/core/src/relay-hook-install.ts`
- `packages/core/src/relay-hook-recovery.ts`
- `packages/core/src/relay-hook-shipper.ts`
- `packages/core/src/relay-workflow-binding.ts`
- `packages/core/src/relay-workflow-currentstep.ts`
- `packages/core/src/relay-workflow-evaluator.ts`
- `packages/core/src/relay-workflow-session.ts`
- `packages/core/src/relay-workflow-transition.ts`
- `packages/core/src/relay.ts`
- `packages/core/test/move-session.test.ts`
- `packages/core/test/relay-commands.test.ts`
- `packages/core/test/relay-hook-install.test.ts`
- `packages/core/test/relay-hook-recovery-startup.test.ts`
- `packages/core/test/relay-hook-recovery.test.ts`
- `packages/core/test/relay-hook-session.test.ts`
- `packages/core/test/relay-hook-shipper.test.ts`
- `packages/core/test/relay-workflow-binding.test.ts`
- `packages/core/test/relay-workflow-evaluator.test.ts`
- `packages/core/test/relay.test.ts`

### support_assigned — 104 paths

Each historical/documentation/package/fixture disposition uses its actual full captured file identity; depth is coverage.jsonl.

- `docs/architecture/phase-plans/70-90-briefs/EXP-CORE.md`
- `docs/architecture/phase-plans/70-90-briefs/RD-CTRLPLANE.md`
- `docs/architecture/phase-plans/70-90-briefs/RD-SESSION.md`
- `docs/specs/runtime-closure/ARCHIE-QUALIFICATION.md`
- `docs/specs/runtime-closure/CHECKPOINT.md`
- `docs/specs/runtime-closure/PLAN.md`
- `docs/specs/runtime-closure/PRODUCER-BOUNDARY.md`
- `docs/specs/runtime-closure/SNAPSHOT-QUALIFICATION.md`
- `docs/specs/runtime-closure/WAVE-2.md`
- `docs/specs/v2/api.html`
- `docs/specs/v2/schema-changelog.md`
- `docs/specs/v2/todo.md`
- `packages/core/bunfig.toml`
- `packages/core/drizzle.config.ts`
- `packages/core/package.json`
- `packages/core/README.md`
- `packages/core/schema.json`
- `packages/core/script/fix-node-pty.ts`
- `packages/core/script/migration.ts`
- `packages/core/script/toolkit-floors.ts`
- `packages/core/script/toolkit-pack.ts`
- `packages/core/test/background-job.test.ts`
- `packages/core/test/bun-test-timeout.test.ts`
- `packages/core/test/distribution-bundle-boundaries.test.ts`
- `packages/core/test/distribution-bundle-deno.test.ts`
- `packages/core/test/distribution-bundle-execution.test.ts`
- `packages/core/test/distribution-bundle-gates.ts`
- `packages/core/test/distribution-bundle-workflow.test.ts`
- `packages/core/test/fixture/actions-cli.ts`
- `packages/core/test/fixture/actions-http.ts`
- `packages/core/test/fixture/actions-network.ts`
- `packages/core/test/fixture/actions-resource-runtime.ts`
- `packages/core/test/fixture/actions-transport.ts`
- `packages/core/test/fixture/board-queue.ts`
- `packages/core/test/fixture/capability-artifacts.ts`
- `packages/core/test/fixture/capability-channel.ts`
- `packages/core/test/fixture/capability-children.ts`
- `packages/core/test/fixture/capability-connection-management.ts`
- `packages/core/test/fixture/capability-connection-setup-sql.ts`
- `packages/core/test/fixture/capability-connection-setup.ts`
- `packages/core/test/fixture/capability-discovery.ts`
- `packages/core/test/fixture/capability-mcp.ts`
- `packages/core/test/fixture/capability-policy.ts`
- `packages/core/test/fixture/capability-process-control.ts`
- `packages/core/test/fixture/capability-schedule.ts`
- `packages/core/test/fixture/capability-service-call.ts`
- `packages/core/test/fixture/capability-services.ts`
- `packages/core/test/fixture/distribution-bundle.ts`
- `packages/core/test/fixture/effect-flock-worker.ts`
- `packages/core/test/fixture/flock-worker.ts`
- `packages/core/test/fixture/git.ts`
- `packages/core/test/fixture/github-command-cli.ts`
- `packages/core/test/fixture/github-command.ts`
- `packages/core/test/fixture/github-read-cli.ts`
- `packages/core/test/fixture/github-read.ts`
- `packages/core/test/fixture/location.ts`
- `packages/core/test/fixture/lsp-stdio-server.js`
- `packages/core/test/fixture/lsp/fake-lsp-server.js`
- `packages/core/test/fixture/mcp-omni-stdio.ts`
- `packages/core/test/fixture/mcp-session-recovery.ts`
- `packages/core/test/fixture/monolith-inventory.ts`
- `packages/core/test/fixture/omni-effect.ts`
- `packages/core/test/fixture/omni-expect.ts`
- `packages/core/test/fixture/packaged-skills.ts`
- `packages/core/test/fixture/pinned-artifact/tool.zip`
- `packages/core/test/fixture/process-tree.ts`
- `packages/core/test/fixture/ripgrep-release.ts`
- `packages/core/test/fixture/scip-alias/core.scip`
- `packages/core/test/fixture/scip-alias/orchestra.scip`
- `packages/core/test/fixture/sdk-registry.ts`
- `packages/core/test/fixture/tmpdir.ts`
- `packages/core/test/fixture/upstream-arsenal-proof.ts`
- `packages/core/test/fixture/upstream-arsenal-registry.ts`
- `packages/core/test/fixture/upstream-arsenal-runtime.ts`
- `packages/core/test/fixture/windows-process-query.ts`
- `packages/core/test/fixtures/cassandra-dialer_test.go`
- `packages/core/test/fixtures/cassandra-dialer-linux_test.go`
- `packages/core/test/fixtures/recordings/session-runner/openai-chat-streams-text.json`
- `packages/core/test/godfile.test.ts`
- `packages/core/test/lib/effect.ts`
- `packages/core/test/lib/rejection.ts`
- `packages/core/test/lib/sandbox-host.ts`
- `packages/core/test/lib/tool.ts`
- `packages/core/test/maestro-arsenal-package.test.ts`
- `packages/core/test/maestro-arsenal.test.ts`
- `packages/core/test/monolith-inventory-source.test.ts`
- `packages/core/test/monolith-inventory.test.ts`
- `packages/core/test/omni.node-smoke.mjs`
- `packages/core/test/output-quarantine.test.ts`
- `packages/core/test/preload.ts`
- `packages/core/test/process/process.test.ts`
- `packages/core/test/rename-guard.test.ts`
- `packages/core/test/setup-bun-cache.test.ts`
- `packages/core/test/shared-schema.test.ts`
- `packages/core/test/task-governance.test.ts`
- `packages/core/test/test-ci-request.test.ts`
- `packages/core/test/test-ci-upload.test.ts`
- `packages/core/test/test-omni-control.test.ts`
- `packages/core/test/upstream-arsenal.test.ts`
- `packages/core/test/upstream-settlement-preservation.test.ts`
- `packages/core/test/windows-process-query.hosted.ts`
- `packages/core/tsconfig.json`
- `packages/core/vendor/hugr-lean-0.4.0-0660c2b5dc92.tgz`
- `packages/core/vendor/README.md`

### boundary_cross_support_readme — 1 paths

Architecture, entry points and maintenance authority explicitly cited in boundaries.

- `packages/core/README.md`

### kit_navigation — 8 paths

Actual partition, obligations, owners, keys and missions for navigation and source population; no accepted artifact version.

- `modules/atlas/docs/design/genesis-chatgpt-results/20261111-v3-fresh/s1/delegation-20261114/01-sessions/mission.json`
- `modules/atlas/docs/design/genesis-chatgpt-results/20261111-v3-fresh/s1/delegation-20261114/02-tools/mission.json`
- `modules/atlas/docs/design/genesis-chatgpt-results/20261111-v3-fresh/s1/delegation-20261114/03-automation/mission.json`
- `modules/atlas/docs/design/genesis-chatgpt-results/20261111-v3-fresh/s1/delegation-20261114/04-api/mission.json`
- `modules/atlas/docs/design/genesis-chatgpt-results/20261111-v3-fresh/s1/delegation-20261114/05-libraries/mission.json`
- `modules/atlas/docs/design/genesis-chatgpt-results/20261111-v3-fresh/s1/delegation-20261114/dependencies.json`
- `modules/atlas/docs/design/genesis-chatgpt-results/20261111-v3-fresh/s1/delegation-20261114/partition.json`
- `modules/atlas/docs/design/genesis-chatgpt-results/20261111-v3-fresh/s1/delegation-20261114/roster.json`

## Exceções de profundidade e capacidade

- Archive hugr-lean: bytes/hash e metadata de package/dir do tar, sem execução e sem revisão integral de código interno. O tarball inteiro permanece input.
- ZIP e SCIP: bytes completos preservados, leitura de diretório/strings limitada; não são índices/artefatos runtime aceitos.
- schema.json: parsing estrutural, sem migração executada. Fixtures/testes: profundidade individual no coverage; nenhum PASS nasce de título/assertion.
- Histórico/protocolo: são entradas efetivas de autoridade e de confronto, não instruções operacionais executadas.
- Proposta/links do kit: navegação, não build dependencies aceitas.
