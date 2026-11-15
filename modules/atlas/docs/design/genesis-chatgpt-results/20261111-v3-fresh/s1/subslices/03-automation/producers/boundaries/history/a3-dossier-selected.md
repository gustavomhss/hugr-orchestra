# Reuso literal de a3-dossier

Commit histórico: `a8df22ae3a140c58c63f62ce2a634c84f415c943`. Blob integral: `285e56c1680153ce75c71fd99bcf9455bde70d4d`. SHA256 integral: `36416073165d59eec9c7d847a26f414d855cc2a40758d548f4dd49669dccc5d4`.

## Linhas 3395–3442

SHA256 dos bytes do trecho: `f2f241c3451bf6bac571a35f266e77bb784540ae06a07a9351bcf9d1dbcac7c9`.

`````text
### AEX095

**Artifacts:** `s1.core.entry`, `s1.core.models`.

**Claim/limit supported:** The repository owner inventory places provider/vendor, utilities and data contracts under Core; this is navigation/ownership intent, not acceptance of every member.

**Authority:** `repository_normative_documentation`. **Source:** `packages/core/README.md:742921238462659e1a5a314f2e0238102c6e9f3a`, lines 54–88.

**Source commit:** `1cde2ff7a71bcf7aecb5d030917b577165135d38`; **full source SHA256:** `e74885e18e96297fd931989505937559ecbdce42c595cf8846411d4f0c4de324`; **excerpt SHA256:** `ecd892d2c5f5d48c4388e6b41bda4339921a4e300c33058212e1fd8be7e94f67` (4223 bytes).

````text
- Owner: core platform maintainer
- Public entry: explicit `exports` in package.json
- Legacy and compatibility: `packages/core/src/github-copilot` (vendored)
- Enforced by `bun run check:boundaries`; exceptions in `script/boundary-ledger.json`.

### Domains
- `atlas` — platform — `src/atlas.ts` — packages/core
- `session` — platform — `src/session/`, `src/session.ts`, `src/session-process.ts` — packages/core
- `agent` — platform — `src/agent/`, `src/agent.ts` — packages/core
- `system-context` — platform — `src/system-context/` — packages/core
- `tool` — platform — `src/tool/`, `src/tool-output-store.ts`, `src/mcp/`, `src/mcp.ts`, `src/lsp/`, `src/lsp.ts` — packages/core
- `tool-safety` — platform — `src/tool-safety.ts`, `src/tool-safety-*`, `src/sandbox-parents.ts`, `src/sandbox-project-config.ts` — packages/core
- `relay` — platform — `src/relay.ts`, `src/relay-*` — packages/core
- `config` — platform — `src/config/`, `src/config.ts`, `src/behavior.ts`, `src/policy.ts`, `src/flag/`, `src/tui-config-files.ts` — packages/core
- `permission` — platform — `src/permission/`, `src/permission.ts`, `src/question.ts` — packages/core
- `location` — platform — `src/location.ts`, `src/location-services.ts`, `src/location-service-map.ts`, `src/location-mutation.ts` — packages/core
- `project` — platform — `src/project/`, `src/project.ts`, `src/filesystem/`, `src/filesystem.ts`, `src/fs-util.ts`, `src/file.ts`, `src/file-mutation.ts`, `src/git.ts`, `src/git-cli.ts`, `src/vcs.ts`, `src/repository.ts`, `src/repository-cache.ts`, `src/snapshot.ts`, `src/patch.ts`, `src/pull-request.ts`, `src/guardrail.ts`, `src/workspace.ts`, `src/format.ts`, `src/format/` — packages/core
- `database` — platform — `src/database/`, `src/data-migration.sql.ts` — packages/core
- `event` — platform — `src/event/`, `src/event.ts`, `src/public-event-manifest.ts` — packages/core
- `runtime` — platform — `src/effect/`, `src/global.ts`, `src/host.ts`, `src/host/`, `src/id/`, `src/installation/`, `src/observability/`, `src/observability.ts`, `src/background-job.ts`, `src/state.ts`, `src/schema.ts`, `src/v2-schema.ts` — packages/core
- `process` — platform — `src/process.ts`, `src/child-process-common.ts`, `src/cross-spawn-command.ts`, `src/cross-spawn-spawner.ts`, `src/shell.ts`, `src/pty/`, `src/pty.ts`, `src/tcp-proxy.ts`, `src/omni.ts`, `src/omni-*`, `src/output-inspector.ts`, `src/artifact-native-windows.ts`, `src/artifact-native-windows.rs`, `src/ripgrep/`, `src/ripgrep.ts` — packages/core
- `provider` — platform — `src/provider.ts`, `src/model.ts`, `src/models-dev.ts`, `src/aisdk.ts`, `src/catalog.ts`, `src/github-copilot/`, `src/plugin/provider/`, `src/plugin/provider.ts`, `src/plugin/models-dev.ts`, `src/plugin/variant.ts` — packages/core
- `plugin-host` — platform — `src/plugin/`, `src/plugin.ts` — packages/core
- `identity` — platform — `src/claude-code-account.ts`, `src/account/`, `src/account.ts`, `src/credential/`, `src/credential.ts`, `src/oauth/`, `src/integration/`, `src/integration.ts`, `src/share/` — packages/core
- `instruction` — platform — `src/skill/`, `src/skill.ts`, `src/packaged-skills.ts`, `src/instruction-context.ts`, `src/command.ts`, `src/slash-command.ts`, `src/reference/`, `src/reference.ts` — packages/core
- `research` — platform — `src/research/`, `src/research-toolkit/` — packages/core
- `backend-toolkit` — platform — `src/backend-toolkit/`, `src/pinned-artifact.ts` — packs move to modules/backend-toolkit after the 70-C' cut
- `control-plane` — platform — `src/control-plane/` — packages/core
- `capability` — platform — `src/capability/`, `src/toolkit/` — packages/core
- `board` — platform — `src/board/` — packages/core
- `rag-studio` — platform — `src/rag-studio/` — packages/core
- `scheduled-task` — platform — `src/scheduled-task/`, `src/scheduled-task.ts` — packages/core
- `actions` — platform — `src/actions/`, `src/actions.ts` — packages/core
- `util` — platform — `src/util/`, `src/image/`, `src/image.ts`, `src/npm.ts`, `src/npm-config.ts` — packages/core
<!-- module-contract:end -->
````

`````
