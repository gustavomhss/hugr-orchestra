# Start a gated agent task

Audience: agents. Status: current.

Load [relay-integration](../.opencode/skills/relay-integration/SKILL.md). Use the
[arm-hook skill](../.opencode/skills/relay-arm-hook/SKILL.md) for Claude Code
subagents or the [gate-CLI skill](../.opencode/skills/relay-gate-cli/SKILL.md) for
another harness.

## Inputs

- Bash, `jq`, Python 3, and `shasum`; Git for base refs and diff controls.
- The test tools referenced by the checklist; OpenSSL for keyed ledgers.
- An absolute workdir, a unique arm token or CLI state directory, and an ordered
  checklist plan. Give concurrent authors disjoint write paths.
- For hook integration, a harness supporting `SubagentStop`, JSON block responses,
  and the subagent's own transcript path. Check the active harness contract rather
  than assuming a fixed Claude Code version.

## Author the current control format

Adapt paths to existing tests in the target workdir; this is a plan template:

```json
{
  "brief": "Repair the feature against the existing acceptance tests.",
  "retry_budget": 3,
  "work_packages": [
    {
      "id": "wp1-change",
      "title": "Repair feature",
      "instructions": "Change the feature implementation; preserve the acceptance tests.",
      "checklist": [
        {"id": "FEATURE-UNIT", "assert": "feature acceptance tests pass",
         "cmd": "python3 -m pytest tests/test_feature.py -q"}
      ]
    },
    {
      "id": "wp2-integrate",
      "title": "Check integration",
      "instructions": "Resolve integration failures without regressing the feature tests.",
      "checklist": [
        {"id": "FEATURE-INTEGRATION", "assert": "integration tests pass",
         "cmd": "python3 -m pytest tests/test_integration.py -q"}
      ]
    }
  ]
}
```

Use unique WP and control IDs across the sprint. `cmd` exits `0` to pass. Typed
`dod` entries from the historical catalog are not interpreted by the arm hook.
The CLI additionally executes `dod[].cmd`, without the named checklist audit
contract. Prefer `checklist` for both surfaces. Full commands and checklist IDs
retain tabs and all LF, including trailing LF; multiline shell programs also run
whole during regression. Preserve each program's failure status explicitly.

## Bind a hook arm

1. Write the plan to `$RELAY_ARMS_DIR/<token>/sprint.json`; default arms root is
   `~/.relay/arms`. Write `meta.json` beside it:

   ```json
   {"token": "feature-a", "workdir": "/absolute/path/to/worktree",
    "base_ref": "<commit captured before the first state starts>"}
   ```

2. Register the actual script in the orchestrator's Claude Code settings:

   ```json
   {
     "hooks": {
       "SubagentStop": [
         {"matcher": "", "hooks": [
           {"type": "command", "command": "/absolute/path/to/relay/bin/relay-arm-hook.sh"}
         ]}
       ]
     }
   }
   ```

3. Ensure the hook environment and arm writer share `RELAY_ARMS_DIR`. Check the
   harness block cap: advancing also blocks. The first preflight reads
   `CLAUDE_CODE_STOP_HOOK_BLOCK_CAP`, using `8` for unset, empty, or invalid values.
   It warns only when a nonzero cap is below `len(work_packages)+1`. That formula
   is the implemented warning estimate, not a physical minimum. `0` requests an
   uncapped harness and suppresses the hook's cap warning; it does not guarantee
   completion.
4. Seed the runner prompt with `RELAY-ARM:feature-a`, absolute workdir, brief,
   ordered titles, and **first WP instructions**. Include first macro protocol,
   self-check questions, and review requirement when declared. The hook cannot
   deliver these before the first stop. Record the first base ref before work.
   For a fresh arm, mark the supplied opening macro entered **before the first
   evaluation**: create `$ARM/macro_<safe-id>`, sanitizing the first WP's macro with
   `printf '%s' "$macro" | tr -c 'A-Za-z0-9._-' '_'`. Follow
   [integration procedure, step 3](../.opencode/skills/relay-integration/SKILL.md#procedure)
   for the actual marker initialization; otherwise later entry can repeat that protocol.
5. Dispatch one runner for that arm. Pass `agent_transcript_path` and `agent_id`
   in stop payloads. The hook evaluates the current checklist and reveals later
   instructions through `{"decision":"block","reason":"..."}`. Its whole-evaluation
   `<arm>/.run.lock` precedes binding/state/cost writes. A busy fire exits `3` with
   stderr only and no arm changes; the harness must handle that as busy, not a verdict.

A top-level `claude -p` stop is not a `SubagentStop`. Plain `Stop` use needs
separate registration; `RELAY_ARM_TOKEN` is an explicit binding override, not
fleet transcript discovery. See [per-agent arms](per-agent-arms.md).

## Drive a CLI task

Seed first instructions in the driving harness, then call:

```sh
bin/relay-gate eval --sprint /path/to/sprint.json \
  --workdir /path/to/worktree --state /path/to/state
```

Handle outcome and exit code together. The CLI does not inject instructions or
switch runners. `eval` uses its integer `counter`; current ID/macro and next ID are
decoded losslessly and validated before commands. `check` validates only its selected
WP. Required verdict/disposition appends precede counter/retry publication; failures
are fatal, without rollback of earlier command or ledger effects. `check` can target an explicit
`--position <WP-ID-or-macro-qualified-position>` and `--base-ref <commit>` without
advancing or charging retries. An explicit `--base-ref ""` means unavailable,
even when a state base ref exists. See [SDK contract](sdk.md) for state, retry,
and busy handling.

## Establish completion

```sh
bin/relay problems /path/to/arm --json
bin/relay verify /path/to/arm --json
```

For an arm, require `state=complete` and a successful audit. Empty stdout or
`counter >= work_packages.length` also occurs on escalation. A parked arm needs
an attributed, nonblank `release`; whitespace-only reasons, including tabs/CRLF,
are rejected. A valid release clears retry/round/repeat/blocked state for the
resolved WP ID plus its legacy index retry and regression retry, restores its
compatibility counter, and rechecks that same gate. It does not waive controls
or authenticate the writer. See [release details](per-agent-arms.md#release-input-and-cleanup).

For a CLI ledger, pass `--sprint` to `relay verify`. The comparison checks named
IDs in both directions and recorded oracle hashes; added/unrecorded controls also
diverge. Requested/reachable invalid sprint input yields `SPRINT-INVALID`, intact
unusable audit fields yield `RECORD-INVALID`, and missing legacy oracle hashes
yield `ORACLE-UNVERIFIED` when compared. These are exit `2`. A bare ledger without
a sprint can pass only with explicit recorded-controls-only scope and
`oracle_recheck.status=not-run`. Verification never reruns commands or validates
current artifacts; an intact hash chain alone does not prove controls passed or
the sprint finished.

Runtime: [arm hook](../bin/relay-arm-hook.sh), [gate CLI](../bin/relay-gate),
[checklist core](../lib/relay-gate.sh), [audit CLI](../bin/relay).
