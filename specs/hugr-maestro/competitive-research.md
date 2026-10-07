# Maestro Competitive Research

Status: source-backed prompt research, 2026-09-08. This records observed product patterns, not benchmark claims.

## Sources and Lift

| Source                                                                                              | Observed pattern                                                                                                                                            | Maestro decision                                                                                                       |
| --------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| Claude Code overview, subagents, memory, workflows, skills                                          | concise persistent instructions; task-specific skills loaded on demand; focused subagents isolate exploration; workflows fit large repeatable orchestration | base prompt stays small; skill loading is explicit/on-demand; delegate only bounded work; no workflow for routine task |
| OpenAI Codex docs index                                                                             | projects/chats, skills/plugins, permission modes, subagents, worktrees, record/replay, long-running work are separate surfaces                              | separate normal work from optional governed work; do not conflate conversation instruction with enforcement            |
| Hermes Agent product page                                                                           | one agent across surfaces, persistent memory, isolated subagents, sandbox backends                                                                          | retain Session identity; use isolation only for work needing it; do not invent another memory system                   |
| Grok Code Fast 1 announcement                                                                       | tool-oriented coding model; launch feedback recommends small focused tasks, plan large features, execute phases                                             | frame large work, then use small verifiable slices; avoid one giant prompt                                             |
| DeepSeek-V3 public repository                                                                       | model/inference publication; no public coding-harness contract identified in source reviewed                                                                | no product behavior lifted from DeepSeek model marketing or inference docs                                             |
| OpenCode source: `session/llm/request.ts`, `session/system.ts`, `tool/skill.ts`, `session/tools.ts` | agent prompt replaces provider prompt; skills are available then loaded through tool; Session supplies real tools/messages/permissions                      | Maestro prompt must preserve tool reality, list methods compactly, and direct skill loading only when relevant         |

`OpenAI Atlas` and a distinct `DeepSeek Harness` were not identifiable from a primary public source in this research
pass. They contribute no claimed behavior until exact sources are supplied.

## Design Invariants

1. Base prompt gives role, operating loop, tool discipline, and output contract only. Detailed procedure lives in a
   skill loaded when relevant.
2. Normal work is default and remains productive. Governed work is explicit and must never pretend an unimplemented
   runtime fence exists.
3. Every code change starts with current-source inspection and ends with proportionate verification.
4. Delegation is bounded by responsibility, expected evidence, and return shape. Parallelism is for independent work,
   not a reflex.
5. Facts, user decisions, tool observations, and proposals remain distinguishable.
6. Runtime permissions enforce; prompt text guides. Prompt must not claim enforcement it cannot prove.

## Rejected Patterns

1. Giant always-loaded methodology corpus: burns context and lowers adherence.
2. Keyword-only state machine: natural requests become brittle hidden modes.
3. Universal approval gate: blocks ordinary exploration and implementation without proportional value.
4. Persistent Maestro memory/store before a measured need: duplicates OpenCode Session evidence.

## Prompt Acceptance

1. Normal edit request leads inspect -> smallest change -> relevant verification, without approval ceremony.
2. Complex request leads bounded plan/slices before broad edit or fan-out.
3. Unknown fact is labeled unknown or investigated; it is not promoted to requirement.
4. Agent loads a matching skill only for specialized repeatable procedure.
5. Prompt does not claim that governed approval is technically enforced until event writer/fence lands.

## Primary Sources

1. https://code.claude.com/docs/en/sub-agents
2. https://code.claude.com/docs/en/skills
3. https://code.claude.com/docs/en/workflows
4. https://code.claude.com/docs/en/memory
5. https://developers.openai.com/codex/
6. https://hermes-agent.nousresearch.com/
7. https://x.ai/news/grok-code-fast-1
8. https://github.com/deepseek-ai/DeepSeek-V3
