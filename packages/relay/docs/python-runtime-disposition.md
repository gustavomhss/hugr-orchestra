# Python runtime disposition — W7

Audience: agents. Status: current.

Decision baseline: `d0299accb79ed51b4b590801e45ac479d95a6c14`. W7 retires only the unused,
unpinned Python authoring launch pair. Retained standalone tools have current named owners and
tooling roles; they are not claimed retired or classified as migration debt. This disposition
does not change runtime dependencies, CI guards, Python test lanes, or frozen evidence.

## Native production authoring

All paths in this section are relative to the Orchestra root. The installed caller chain is:

| Caller | Replacement entrypoint / role |
|---|---|
| `packages/app/src/orchestra/relay/client.ts` | Generated Client `sdk.v2.relay.document`, `.publish`, `.hook` with Location identity |
| `packages/protocol/src/groups/relay-document.ts` | `/api/relay/document`, `/api/relay/scope`, `/api/relay/node-types`; document and publish groups |
| `packages/protocol/src/groups/relay-hook.ts` | `/api/relay/hook` install lifecycle and decisions |
| `packages/server/src/handlers.ts` | Registers `RelayDocumentHandler`, `RelayPublishHandler`, `RelayHookHandler` |
| `packages/server/src/handlers/relay-document.ts` | Native documents, compilation, scopes and publication through `RelayDocuments` |
| `packages/server/src/handlers/relay-hook.ts` | Published-snapshot installation through native `RelayHookInstall` |
| `packages/server/src/relay-documents.ts` | Native `AuthoringStore`, `AuthoringGraph`, `AuthoringHook`, Location `SkillV2`; project SQLite |

Public document checks return 403 `maestro-execution-required`; Maestro owns approved executable
workflow checks. No Python daemon or authoring server backs these installed routes.
Profiles missing native tools remain unavailable; standalone tool availability is not native support.
See [authoring API](authoring-api.md) for payload boundaries and [SPEC §7](../SPEC.md#7-authoring-service-and-host-boundary).

## Retired launch pair

| Deleted source | Baseline caller | Installed replacement |
|---|---|---|
| `bin/relay-api` | Manual historical launch; imports `relay_authoring.cli.main` | Native Server handlers above |
| `lib/relay_authoring/cli.py` | `bin/relay-api` only | Orchestra server lifecycle; no authoring sidecar |

Reference checks used tracked-source searches for `relay-api`, `bin/relay-api` and
`relay_authoring.cli`. Positive controls found the launcher import, App's `relay.document.list`
call and Server's handler registration. The launch names have no references in native host source
or root scripts/workflows at this baseline. Remaining references are historical changelog prose,
the disposition, and retirement checks. This is a repository caller claim, not a claim about external users.
Neither deleted path is among the 14 `sha256` entries in [ORACLE](../test/golden/ORACLE).

## Retained test-only authoring service

| Source | Actual caller / retention role | Owner |
|---|---|---|
| `lib/relay_authoring/application.py`, `server.py`, `runs.py` | `tests/test_authoring.py` directly imports `AuthoringApplication`, `AuthoringServer`, `Runner`; tests exercise persistence, HTTP refusals, evaluation and retry | `authoring` |
| `lib/relay_authoring/{config,graph,hooks,skills,store}.py`, `__init__.py` | Authoring regression imports plus frozen authoring graph/hook/skills/SQLite generators | `authoring` |
| `bin/relay-daemon.py` | `runs.py:GateClient` imports `make_server`; `tests/test_daemon.py`, `tests/test_ask.py`, `tests/test_arm_runtime.py` exercise gate and wait channels; also remains a standalone integration tool | `daemon` |

The daemon's `main` entrypoint remains: subprocess tests invoke it. The retained Python host's
`api/v1`, events and execution receipts are regression behavior, not current Orchestra routing.

## Retained standalone tools and evidence producers

Owners, exact source assignments, tests and dependencies remain in [skills.json](skills.json).
These tool entrypoints remain current for their named standalone role; none starts installed authoring.

| Entrypoint / sources | Named role and callers | Owner |
|---|---|---|
| `bin/relay`, `benchmark/verify_ledger.py` | Standalone audit/integrity commands; CLI/benchmark/example consumers, audit and corpus tests, golden generators | `audit` |
| `bin/relay-spec.py` | Sprint library/lint/amendment tooling; `tests/test_spec.py`, `test_spec_lint.py`, `test_amend.py`, frozen spec generators | `spec-library` |
| `bin/relay-profile.py`, `relay-policy.py`, `relay-autodecompose.py` | Profile compilation, policy application, pytest-nodeid drafting; corresponding cataloged regression tests | `profiles`, `policies`, `autodecompose` |
| `bin/relay-corpus.py`, `relay-dash.py` | Retained trace extraction and read-only dashboard; corpus/dashboard/cost tests | `telemetry` |
| `benchmark/judge.py`, `calibrate_judge.py` | Shell gate/judge calls and calibration; judge tests and frozen judge generators | `judge` |
| `tools/criterion`, `tools/edd/*`, `tools/spec/spec-check`, `tools/design/design-check`, `tools/research/*` | Standalone planning/spec/design/research checks and capture/replay; shipped profile checklist commands and cataloged tool tests | `planning`, `specification`, `design`, `research` |
| Benchmark Python drivers, grader, generators and campaigns | Measurement/evidence production and benchmark regression tests | `benchmark` |
| `examples/fleet-chain/run_example.py` | Scripted standalone fleet evidence and `tests/test_example_completion.py` | `examples` |
| `bin/check-docs.py`, `gen-doc-index.py` | Structural documentation/catalog guard and supported index generation; `tests/test_docs.py` | `doc-tooling` |

Shell oracle drivers/core also remain byte-exact where pinned. Tool ownership is not a claim that
every tool is exposed through native profiles or the installed SDK.

## Frozen controls and validation

All 14 ORACLE source entries must still hash to their recorded SHA-256. The existing golden
generator's `assert_oracle_pins()` checks those source bytes without regenerating goldens.
`test/golden`, `test/fixtures` and `docs/reviews` remain byte-identical to the decision baseline.
Do not regenerate them or remove a test caller to justify a source deletion.

Structural docs guard checks links and source partition, not native route semantics. The narrow
authoring routing test checks the documented handler/source table against actual native exports
and registration and rejects retired launcher advertisements in current authoring pages.
Run docs and retained authoring regression files through `bun run test:ci relay` with `--os both`;
run supported index generation/check and structural guard from `packages/relay`. Cold review of
the frozen commits remains required before landing.
