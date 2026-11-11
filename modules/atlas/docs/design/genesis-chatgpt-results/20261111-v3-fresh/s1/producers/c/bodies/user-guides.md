# User-guide intent and the limits of documentary evidence

**L1 authority:** the thirteen assigned `docs/guides` documents, read at the baseline. These are product explanations and operational intent. They are not independently established Core, server or UI execution facts in this unit. Excerpts C11 and C40–C44 preserve important boundaries.

| Guide group | Documented contract or operator distinction |
| --- | --- |
| Models, Claude mode, limits | The guide separates model-layer protocols from session-core routes. Claude Code is described as a one-turn execution host with Orchestra retaining its outer orchestration; billing refusals are passed through without retries. Listed limitations are documentary scope, not test results. |
| Permissions | Deny rejects waiting requests for the session; allow-once and always have different persistence/scope. Auto-accept is client session state and resolves allow-once requests, rather than writing saved project rules. |
| Project trust and MCP/CLI failures | Project local MCP commands, code plugins, formatter and LSP config need trust. Remote MCP and global config differ. Only global `trusted_projects` counts, and a project cannot approve itself. Startup/status failures and headless prompt handling are documented separately. |
| Credentials and integrations | Credentials guide describes encrypted local credential storage and key-file fallback; integration guide separates account/target/session binding, connection from catalog visibility, and local disconnect from upstream revocation. These are not claims that credentials were inspected. |
| Database backups | Guide documents pre-migration backup, retention, refusal on backup failure or a newer database, and quit-before-restore procedure. Generic adapter code alone does not prove these Core policies. |
| Hooks and plugins | Hook draft, publication and project installation are separate states. The plugins guide describes model behavior instructions and visible application state, distinct from the code plugin package. |
| Tools and config errors | Tool availability, permission and tool-safety boundaries are described. Config errors distinguish parse/schema failures; the guide says unknown extra keys are ignored. |

Source-to-claim mapping is explicit in `coverage.json`; each guide remains its own pinned source record. Exact sampled excerpts show protocol routing (C11), global trust and refusal (C40), permission persistence (C41), backup intent (C42), credential intent (C43), and behavior plugins (C44). Other guide content is captured in full and attributed as documentary intent.

**Boundary and gaps.** None of these instructions was executed: no database restore, project trust change, credential read, permission reply, integration connection or paid Claude call took place. The implementation of these host-level policies belongs to other S1 production areas or other owners and needs its own evidence. A guide's recommendation, historical limitation or claim that a migration landed is not a substitute for that evidence. In particular, current config schema objects declare `additionalProperties: false`, while the config-error guide describes ignoring unknown keys; the runtime decoder/publisher relationship is unresolved here and should not be collapsed into either a runtime rejection guarantee or a defect assertion.
