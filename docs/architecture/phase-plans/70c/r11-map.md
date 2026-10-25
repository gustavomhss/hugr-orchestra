| # | importer (removed-v1/src/…) | specifier | closes by |
|---|---|---|---|
| 1 | agent/agent.ts | `@/maestro/roster` | C4 |
| 2 | agent/agent.ts | `@/maestro/seat-skill-root` | C4 |
| 3 | agent/agent.ts | `@/maestro/seats` | C4 |
| 4 | plugin/index.ts | `./app-dock` | C2 |
| 5 | plugin/index.ts | `./linux-workspace` | C2 |
| 6 | project/bootstrap.ts | `@/maestro/upstream-v2` | open: B1-C port or B9 delete |
| 7 | research/allowance.ts | `@/maestro/logical-task` | open: B1-C port or B9 delete |
| 8 | research/allowance.ts | `@/maestro/roster` | C4 |
| 9 | research/binding.ts | `@/maestro/roster` | C4 |
| 10 | server/routes/instance/httpapi/handlers/catalog.ts | `@/claude-code/host/provider` | C7 |
| 11 | server/routes/instance/httpapi/handlers/catalog.ts | `@/claude-code/sdk` | C7 |
| 12 | server/routes/instance/httpapi/handlers/global.ts | `@/janitor/report-state` | C3 |
| 13 | server/routes/instance/httpapi/handlers/provider.ts | `@/claude-code/host/provider` | C7 |
| 14 | server/routes/instance/httpapi/handlers/session.ts | `@/continuity/service` | open: B1-C port or B9 delete |
| 15 | server/routes/instance/httpapi/handlers/session.ts | `@/maestro/write-roots` | open: B1-C port or B9 delete |
| 16 | server/routes/instance/httpapi/server.ts | `@/claude-code/sdk` | C7 |
| 17 | server/routes/instance/httpapi/server.ts | `@/continuity/service` | open: B1-C port or B9 delete |
| 18 | server/routes/instance/httpapi/server.ts | `@/maestro/arsenal-bindings` | open: B1-C port or B9 delete |
| 19 | server/server.ts | `@/janitor/bootstrap` | C3 |
| 20 | session/compaction.ts | `@/maestro/atlas-resume-restore` | open: B1-C port or B9 delete |
| 21 | session/llm/context-budget.ts | `@/continuity/masking` | C8 |
| 22 | session/llm/context-budget.ts | `@/continuity/trigger` | open: B1-C port or B9 delete |
| 23 | session/llm/request.ts | `@/maestro/atlas-header` | open: B1-C port or B9 delete |
| 24 | session/native-tools.ts | `@/maestro/arsenal-bindings` | open: B1-C port or B9 delete |
| 25 | session/prompt-host.ts | `@/continuity/service` | open: B1-C port or B9 delete |
| 26 | session/prompt-host.ts | `@/maestro/write-roots` | open: B1-C port or B9 delete |
| 27 | session/prompt.ts | `./prompt-continuity` | open: B1-C port or B9 delete |
| 28 | session/prompt.ts | `@/claude-code/engine` | open: B1-C port or B9 delete |
| 29 | session/prompt.ts | `@/continuity/alias` | C8 |
| 30 | session/prompt.ts | `@/continuity/service` | open: B1-C port or B9 delete |
| 31 | session/prompt.ts | `@/continuity/trigger` | open: B1-C port or B9 delete |
| 32 | session/prompt.ts | `@/maestro/arsenal-bindings` | open: B1-C port or B9 delete |
| 33 | session/prompt.ts | `@/maestro/arsenal-observations` | C5 |
| 34 | session/prompt.ts | `@/maestro/atlas-knowledge` | open: B1-C port or B9 delete |
| 35 | session/prompt.ts | `@/maestro/atlas-resume-restore` | open: B1-C port or B9 delete |
| 36 | session/task-prompt-ops.ts | `@/maestro/arsenal-bindings` | open: B1-C port or B9 delete |
| 37 | session/tools.ts | `@/maestro/roster` | C4 |
| 38 | session/upstream-task-settlement.ts | `@/maestro/backend-result` | open: B1-C port or B9 delete |
| 39 | session/upstream-task-settlement.ts | `@/maestro/logical-task` | open: B1-C port or B9 delete |
| 40 | session/upstream-task-settlement.ts | `@/maestro/seats` | C4 |
| 41 | session/upstream-task-settlement.ts | `@/maestro/session-authority` | C5 |
| 42 | session/upstream-task-settlement.ts | `@/maestro/upstream-result` | C5 |
| 43 | skill/index.ts | `@/maestro/seat-skill-root` | C4 |
| 44 | skill/index.ts | `@/maestro/seats` | C4 |
| 45 | tool/registry.ts | `./atlas-context` | open: B1-C port or B9 delete |
| 46 | tool/registry.ts | `./atlas-memory` | open: B1-C port or B9 delete |
| 47 | tool/registry.ts | `./context-compact` | open: B1-C port or B9 delete |
| 48 | tool/registry.ts | `./context-recall` | open: B1-C port or B9 delete |
| 49 | tool/registry.ts | `./maestro-admission` | open: B1-C port or B9 delete |
| 50 | tool/registry.ts | `./maestro-approval` | open: B1-C port or B9 delete |
| 51 | tool/registry.ts | `./maestro-arsenal` | open: B1-C port or B9 delete |
| 52 | tool/registry.ts | `./maestro-authorization` | open: B1-C port or B9 delete |
| 53 | tool/registry.ts | `./maestro-context` | open: B1-C port or B9 delete |
| 54 | tool/registry.ts | `./maestro-plan` | open: B1-C port or B9 delete |
| 55 | tool/registry.ts | `./maestro-result-decision` | open: B1-C port or B9 delete |
| 56 | tool/registry.ts | `./maestro-review` | open: B1-C port or B9 delete |
| 57 | tool/registry.ts | `./maestro-validation` | open: B1-C port or B9 delete |
| 58 | tool/registry.ts | `./maestro-workflows` | open: B1-C port or B9 delete |
| 59 | tool/registry.ts | `@/continuity/archive` | open: B1-C port or B9 delete |
| 60 | tool/registry.ts | `@/continuity/service` | open: B1-C port or B9 delete |
| 61 | tool/registry.ts | `@/maestro/arsenal-bindings` | open: B1-C port or B9 delete |
| 62 | tool/registry.ts | `@/maestro/arsenal-observations` | C5 |
| 63 | tool/registry.ts | `@/maestro/atlas-knowledge` | open: B1-C port or B9 delete |
| 64 | tool/registry.ts | `@/maestro/atlas-memory` | open: B1-C port or B9 delete |
| 65 | tool/registry.ts | `@/maestro/invocation-binding` | open: B1-C port or B9 delete |
| 66 | tool/registry.ts | `@/maestro/roster` | C4 |
| 67 | tool/research-registry.ts | `./atlas-context` | open: B1-C port or B9 delete |
| 68 | tool/research-registry.ts | `@/maestro/atlas-memory` | open: B1-C port or B9 delete |
| 69 | tool/research-registry.ts | `@/maestro/roster` | C4 |
| 70 | tool/research-repo.ts | `@/maestro/roster` | C4 |
| 71 | tool/shell.ts | `@/maestro/seats` | C4 |
| 72 | tool/shell/execution.ts | `@/maestro/roster` | C4 |
| 73 | tool/shell/execution.ts | `@/maestro/seats` | C4 |
| 74 | tool/shell/scan.ts | `@/maestro/seats` | C4 |
| 75 | tool/skill.ts | `@/maestro/atlas-source` | open: B1-C port or B9 delete |
| 76 | tool/task-background.ts | `@/maestro/arsenal-completion` | open: B1-C port or B9 delete |
| 77 | tool/task-background.ts | `@/maestro/backend-result` | open: B1-C port or B9 delete |
| 78 | tool/task-background.ts | `@/maestro/backend-work` | open: B1-C port or B9 delete |
| 79 | tool/task-background.ts | `@/maestro/discovery-result` | open: B1-C port or B9 delete |
| 80 | tool/task-background.ts | `@/maestro/upstream-result` | C5 |
| 81 | tool/task-background.ts | `@/maestro/upstream-settlement` | open: B1-C port or B9 delete |
| 82 | tool/task-work-observation.ts | `@/maestro/backend-result` | open: B1-C port or B9 delete |
| 83 | tool/task-work-observation.ts | `@/maestro/logical-task` | open: B1-C port or B9 delete |
| 84 | tool/task-work-observation.ts | `@/maestro/session-authority` | C5 |
| 85 | tool/task-work-observation.ts | `@/maestro/upstream-settlement` | open: B1-C port or B9 delete |
| 86 | tool/task.ts | `../maestro/governed-task-reservation` | open: B1-C port or B9 delete |
| 87 | tool/task.ts | `@/maestro/arsenal-completion` | open: B1-C port or B9 delete |
| 88 | tool/task.ts | `@/maestro/atlas-resume` | open: B1-C port or B9 delete |
| 89 | tool/task.ts | `@/maestro/authorization` | open: B1-C port or B9 delete |
| 90 | tool/task.ts | `@/maestro/backend-work` | open: B1-C port or B9 delete |
| 91 | tool/task.ts | `@/maestro/dispatch` | open: B1-C port or B9 delete |
| 92 | tool/task.ts | `@/maestro/grounded-skills` | open: B1-C port or B9 delete |
| 93 | tool/task.ts | `@/maestro/logical-task` | open: B1-C port or B9 delete |
| 94 | tool/task.ts | `@/maestro/roster` | C4 |
| 95 | tool/task.ts | `@/maestro/seats` | C4 |
| 96 | tool/task.ts | `@/maestro/session-authority` | C5 |
| 97 | tool/task.ts | `@/maestro/workflow-binding` | open: B1-C port or B9 delete |
| 98 | tool/task.ts | `@/maestro/write-roots` | open: B1-C port or B9 delete |

Totals: C2 2, C3 2, C4 18, C5 7, C7 4, C8 2, open: B1-C port or B9 delete 63
