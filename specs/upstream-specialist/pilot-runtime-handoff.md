# Candidate pilot runtime handshake

2026-10-09. Implementation and credential placement are active; no new pilot, tests, mutation, CI or typecheck run in this wave. Runtime owns the supported credential binding and preserves the owner's installed ChatGPT OAuth.

## Actual previous invocation

Working directory: `/var/folders/lt/z11pyzhj0m17vn798jkk69hh0000gn/T/opencode/upstream-host/packages/orchestra`.

```bash
PILOT="/var/folders/lt/z11pyzhj0m17vn798jkk69hh0000gn/T/opencode/upstream-authoring-pilot-01"
ORCHESTRA_DB="$PILOT/session.db" bun ./src/index.ts run \
  --dir "$PILOT/project" --agent maestro \
  --title upstream-authoring-candidate --format json --log-level WARN \
  < "$PILOT/demand.txt" > "$PILOT/events.jsonl" 2> "$PILOT/stderr.log"
```

Actual retry used the same isolated DB/demand and `--session ses_ee29a94c6ffeTkLltsxz8j7ydu`, with `ORCHESTRA_PRINT_LOGS=1 ORCHESTRA_LOG_LEVEL=WARN`; outputs are `retry-events.jsonl` and `retry-stderr.log`. Neither actual invocation included `--model`. Their commands were recovered from stored tool input, not reconstructed from a successful provider run.

**Engine kind: retained V1 legacy run**, through `SessionPrompt` and legacy `Provider`/`Auth`, not current V2 execution. Required next model: `--model openai/gpt-6.1-sol`. This addition is prepared, not previously executed. Demand is natural CSV-import planning; do not inject Task calls, identity flags, approval or a custom loop. Unique fixture Project is `upstream-authoring-pilot-01-20261008`, held in `.git/orchestra`. Use an owned isolated candidate DB, never the installed DB as the active Database service. Preserve old evidence files when preparing the final run.

Prepared invocation (UNRUN):

Current prepared working directory: `/var/folders/lt/z11pyzhj0m17vn798jkk69hh0000gn/T/opencode/upstream-combined/packages/orchestra`, source `01a48f6a22158437ce544d8cdcef08a29ddcd7fb` over runtime `b1cad41dc515eec9dcf474c413da853061894ac1`. The old invocation above remains historical evidence; do not reuse its older candidate as the final source pin. Runtime b1 contains the supported inherited-token guard; actual owner-bound launch wrapper/store classification still requires runtime handoff.

Runtime wrapper source is now published UNVALIDATED as `fe3760f621a987809990d95f73979bdfb80f5994`, branch `runtime-pilot`, adding `packages/orchestra/script/maestro-pilot.ts`. Source is provisionally composed into the candidate. Installed-store compatibility/path remains unproved. Both prepare-only and run modes read private credentials; no invocation, including default mode or help, occurs until combined code is ready and the final-batch boundary permits execution.

Final wrapper invocation shape (UNRUN; explicit auth-source path selected only at the permitted boundary):

```bash
bun packages/orchestra/script/maestro-pilot.ts \
  --candidate /absolute/integrated-candidate \
  --pilot /canonical/existing/upstream-authoring-pilot-01 \
  --auth-source /explicit/private/existing/legacy/Auth.json \
  --run
```

Defaults are Maestro and `openai/gpt-6.1-sol`. The wrapper streams existing demand, creates fresh private runtime/DB/XDG/HOME and redacted evidence, preserves old fixture artifacts, and checks four pinned b1 credential blobs. It requires expiry beyond its ten-minute deadline plus five-minute refresh margin; incompatible legacy registration/plan scope or expiry is a named blocker, without invented IDs, migration, token rotation or re-login. NativeV2 Credential inheritance is not used by this wrapper.

```bash
PILOT="/var/folders/lt/z11pyzhj0m17vn798jkk69hh0000gn/T/opencode/upstream-authoring-pilot-01"
ORCHESTRA_DB="$PILOT/session.db" bun ./src/index.ts run \
  --dir "$PILOT/project" --agent maestro --model openai/gpt-6.1-sol \
  --title upstream-authoring-candidate --format json --log-level WARN \
  < "$PILOT/demand.txt"
```

## Observed previous failure / store classification

- `retry-stderr.log` records `ProviderNoProvidersError: No providers are available` in `SessionPrompt.createUserMessage`, before admission or LLM work. The fixture Session exists; this is preflight evidence only.
- Existing OpenCode connected-provider metadata includes OpenAI. That metadata does not classify whether its active credential is legacy Auth JSON or a Credential-table record.
- Candidate legacy `Auth.Service.all/get` reads `Global.Path.data/auth.json` (or its explicit content override). Candidate native `Credential.Service.all/list/get` is a distinct store. Previous config/model override did not supply credentials. No credential copying or installed account reconnection was attempted.
- Actual installed Credential binding remains runtime-owned classification. Report only ID, integration, label, value type and expiry; never value/access/refresh or full credential objects. A legacy-only OpenCode OAuth binding is a store mismatch, not evidence that the owner is logged out.

## Supported credential placement handed to runtime

### V1 launch binding

The actual source CLI above uses legacy `Auth.Service.all/get`; it accepts the supported `ORCHESTRA_AUTH_CONTENT` in-memory override. Current V2 `Credential.layerFrom` alone does not wire this V1 execution path. Runtime b1 already treats that override as inherited in `plugin/openai/codex.ts`; `plugin/openai/siwc.ts` requires expiry more than five minutes ahead, otherwise refuses with `Inherited ChatGPT OAuth credentials cannot be refreshed` before token-exchange HTTP. Runtime owns binding the actual legacy OAuth store to the isolated in-memory launch. Never print/pass raw secret contents in a tool command or evidence artifact. Do not claim that importing a V2 Credential layer authenticates the retained V1 Provider.

### V2 storage inheritance (separate execution path)

Core already provides `Credential.layerFrom(actualInstalledReleaseDBPath)` and the AppNodeBuilder override `[Credential.node, Credential.layerFrom(actualInstalledReleaseDBPath)]`. It inherits installed release records read-only while own candidate records take precedence. Inherited update/remove/refresh are refused. No new auth architecture is required.

With unchanged installed `Global.Path.data`, absolute isolated `ORCHESTRA_DB` plus `ORCHESTRA_INHERIT_CREDENTIALS=1` uses the existing release-path fallback. If XDG paths are isolated, default release path moves too; use the explicit supported `layerFrom(actualInstalledReleaseDBPath)` override rather than copying secrets or pointing the active Database at installed storage.

If inherited OAuth is expired, surface the existing named inherited-refresh refusal; candidate must not rotate the installed refresh token. Code-grounded inheritance is not proof that the required installed Credential row exists. Runtime will supply actual redacted store classification and binding before the final combined pilot.
