# Maestro pilot credential launch contract

This launcher is prepared source, not executed evidence. No real store was inspected;
credential compatibility, entitlement and successful inference remain unproved.

## Two supported credential paths

1. **V1 CLI:** Legacy `Auth.all()` reads an in-memory `ORCHESTRA_AUTH_CONTENT`
   provider map. Codex treats that environment variable as inherited; LegacySiwc
   refuses inherited refresh before HTTP. This launcher uses only this path.
2. **V2:** `Credential.layerFrom` supplies a read-only credential layer to V2
   composition. It does not populate V1 Auth or authenticate the V1 CLI.

## Candidate and execution

Use an absolute integrated candidate root containing baseline `75546395d0`
(b1 plus cadence documentation) and W6/attribution changes. Do not use old
`upstream-host`/05a source. Launcher compares exact Git blob hashes for b1 Auth,
Codex, LegacySiwc and Core Siwc; changed files require reviewed repinning.
Those four pins establish the known credential boundary, not arbitrary candidate
security or proof that W6 is integrated. Freeze the candidate before execution.
W6 readiness, attribution readiness and owner execution approval are external gates.

```sh
bun packages/orchestra/script/maestro-pilot.ts --candidate /absolute/integrated-worktree --pilot /absolute/owned-fixture --auth-source /absolute/private/legacy/auth.json --prepare-only
# Only after external gates approve the final batch:
bun packages/orchestra/script/maestro-pilot.ts --candidate /absolute/integrated-worktree --pilot /absolute/owned-fixture --auth-source /absolute/private/legacy/auth.json --run
```

No mode flag means prepare-only; `--run` alone permits one invocation. Optional
`--model` defaults to `openai/gpt-6.1-sol`; only OpenAI models are accepted.
Fixture must already contain `project/` and `demand.txt`; canonical absolute paths
reject aliases. Auth source must be an existing owned private regular legacy JSON
file, opened read-only/no-follow. Only OpenAI OAuth is retained in memory.
Schema failures have named errors; missing provider/OAuth/metadata and unsupported
legacy registration are store compatibility results, not owner logout. Actual
`Siwc.registration` and `requirePlanUsage` run without migration or forced login.
Expiry must exceed the ten-minute deadline plus official five-minute refresh margin.

Prepare checks paths, pinned bytes and credential metadata; prints only provider,
type, expiry and registration boolean. Both modes create a fresh private runtime
directory under the fixture, isolating HOME, XDG data/state/cache/config and temp
before Core imports. Run sets a new absolute `ORCHESTRA_DB`, disables native
credential inheritance and supplies only the snapshot via child environment.
Installed Auth/DB is not active; historical fixture DB/evidence stays untouched.

Child cwd is candidate `packages/orchestra`; source CLI receives demand stream,
`run --dir FIXTURE/project --agent maestro --model MODEL --title upstream-authoring-candidate
--format json --log-level WARN`. Fresh exclusive events/stderr files use `0600`.
Access/refresh/ID-token values are redacted from bounded stdout before persistence;
stderr is discarded and replaced with a generic artifact. Errors never print raw
causes. Deadline kills only this child; no retry, probe or automatic refresh.
This is credential/store isolation, not a sandbox against hostile candidate code,
tools or demand. Environment secrets remain readable by trusted child code.

Concrete remaining preconditions: integrated frozen candidate, owner-selected
compatible private legacy OpenAI OAuth snapshot with sufficient lifetime, prepared
fixture and explicit external final-batch approval. None was proved by this wave.
