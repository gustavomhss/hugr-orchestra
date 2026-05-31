# Configuration & Installation

## 1. Installing the Relay hook

The Relay hook is a `SubagentStop` hook entry in a Claude Code settings file. It must use an
empty matcher (`""`) so it fires on every sub-agent stop, regardless of session context.

```json
{
  "hooks": {
    "SubagentStop": [
      {
        "matcher": "",
        "hooks": [
          {
            "type": "command",
            "command": "/absolute/path/to/relay-hook.sh"
          }
        ]
      }
    ]
  }
}
```

**Project scope vs. global scope**

| File | Scope | When to use |
|---|---|---|
| `<repo-root>/.claude/settings.json` | This project only | Relay driving a specific codebase sprint — most common |
| `~/.claude/settings.json` | All Claude Code sessions | Shared tooling you want available everywhere |

Prefer project scope. The Relay hook reads `sprint.json` from a path it knows at install time;
keeping the hook co-located with the sprint definition avoids cross-project interference.

---

## 2. Files & layout

A minimal Relay installation has three artifacts:

```
<repo-root>/
├── .claude/
│   └── settings.json          # SubagentStop hook registration (see §1)
├── relay/
│   ├── relay-hook.sh          # The Relay hook script (the installed executable)
│   └── sprint.json            # Sprint definition — read fresh on every hook fire
└── .relay-state/              # Runtime state (created by the hook on first run)
    ├── counters/              # Per-agent_id WP index (one file per Runner)
    └── retries/               # Per-agent_id, per-WP retry counters
```

**relay-hook.sh** — The Relay hook script. Registered in `settings.json`; receives the
`SubagentStop` payload on stdin as JSON. Reads `sprint.json` fresh on every fire (SPEC §3),
runs the Gate, and writes `decision:block` or `decision:allow` to stdout.

**sprint.json** — The on-disk Sprint definition (SPEC §3 schema). Because the hook re-reads
this file on every fire, you can edit `sprint.json` between stops — add DoD checks, adjust
instructions, change the retry budget — without touching the hook or restarting the session.

**State & counters** — The hook persists two counters per Runner keyed by `agent_id`
(SPEC §9): the current WP index and the per-WP retry count. These live outside the hook
script so the hook process is stateless; the files survive compaction and re-fires.

---

## 3. Knobs

### retry_budget

Top-level field in `sprint.json` (SPEC §3). Sets the maximum Gate failures allowed on a
single WP before the sprint escalates to the human.

```json
{ "retry_budget": 3, "work_packages": [ … ] }
```

When `retries[runner][i] > retry_budget`, the hook calls `allow_stop()` and surfaces the WP
and its gaps for human resolution. The last accepted (keep-best) WP remains locked. Default
recommendation: 3. Raise for exploratory WPs, lower for mechanical ones where a second failure
likely signals a spec gap.  See SPEC §5 (the Relay loop) for the exact escalation path.

### Per-WP model override

Each WP in `work_packages` accepts an optional `model` field (SPEC §3):

```json
{
  "id": "wp1-impl",
  "title": "Implement slugify",
  "instructions": "…",
  "model": "sonnet",
  "dod": [ … ]
}
```

Accepted values: `"haiku"` | `"sonnet"` | `"opus"`. When present, the Relay hook uses this
model for any `llm` DoD checks on that WP (SPEC §4). WPs without a `model` field inherit the
session default. Use `"haiku"` for mechanical WPs with cheap `grep`/`shell` gates to minimize
judge cost.

### Map-up-front

At Runner spawn, the orchestrator gives the Runner the sprint `brief` plus the ordered list of
WP **titles** — the Map (SPEC §2, §7). Each WP's `instructions` and `dod` are withheld until
the Relay hook relays that WP. This gives the Runner global orientation ("table of contents
visible") while keeping detail focused ("chapters revealed one at a time"). The Map is part of
the orchestrator's initial prompt, not a hook knob — but the `title` field in each WP is the
canonical source for Map content (SPEC §3).

### RELAY_LEDGER_KEY (verified-trace ledger mode)

Environment variable read by the hook (when it writes the ledger) and by `verify_ledger.py`
(when it checks it). It selects how each ledger line is sealed (SPEC §7):

```bash
# PLAIN (default, unset): h = SHA-256(body). Tamper-EVIDENT — catches in-place edits, reorders,
# and middle-deletions, but a holder of the file can rewrite the whole chain. Fine for demos/CI.
python3 benchmark/verify_ledger.py <run>/.relay-state/ledger.jsonl

# KEYED: h = HMAC-SHA256(RELAY_LEDGER_KEY, body). UNFORGEABLE without the secret — the mode for an
# actual adversary / a compliance artifact an auditor verifies without trusting the producer.
export RELAY_LEDGER_KEY="$(openssl rand -hex 32)"   # set for BOTH the run and the verification
```

The **same** key must be present when the hook writes and when you verify — a missing or wrong key
fails verification identically to a tampered line (by design). Keep the key out of the run directory
(env / secret manager), or the ledger and its seal travel together and the guarantee is lost. Neither
mode defends against tail-truncation on its own; anchor the latest chain head out-of-band if that is
in scope (SPEC §7).

### Context compaction for long sprints

A single continuous Runner accumulates context across all WPs (SPEC §7 design decision).
For long sprints this grows into compaction territory. Mitigation: Claude Code's built-in
`/compact` between WP relays, or configure `context_compaction` in `settings.json` to trigger
automatically. The hook-driven relay pattern (one continuous context) is the explicit design
choice; compaction is the cost-management knob. See SPEC §7 for the continuous-context
rationale.

---

## 4. Headless / automation

To run a sprint unattended, spawn the Runner via `claude -p` (print mode) with the appropriate
permission mode:

```bash
claude -p \
  --permission-mode acceptEdits \
  "$(cat orchestrator-prompt.txt)"
```

`--permission-mode acceptEdits` allows the Runner to read and write files without interactive
prompts, which is the minimum required for most sprints. Use `bypassPermissions` only in fully
isolated environments (containers, CI) where no interactive safeguard is needed.

The Relay hook fires identically in headless and interactive sessions — `SubagentStop` is
session-mode-agnostic. The `permission_mode` field in the hook payload (SPEC §9) reflects the
mode the session was started with; the hook can inspect it if gate logic needs to vary by mode.

For CI pipelines, write `sprint.json` from a template step, invoke `claude -p`, and assert exit
code 0. The hook writes its escalation reason to stderr and exits non-zero on budget exhaustion,
making it compatible with standard CI failure detection.

---

## 5. Disabling or neutralizing a hook

**Critical caveat (SPEC §9):** removing a `SubagentStop` entry from `settings.json` does **not**
hot-reload mid-session. Hook registration is snapshotted at session start; the settings file is
not re-read between fires.

However, the hook **script body is read fresh on every fire**. This means:

- To **disable a hook in a live session**: neutralize the script — replace its body with `exit 0`.
  The hook entry remains registered, but every fire is a no-op. The Runner will stop normally.
- To **fully clean up**: remove the hook from `settings.json` and restart the session. The hook
  will not fire in the new session.

Neutralizing to a no-op:

```bash
# Disable relay-hook.sh for the rest of this session
echo 'exit 0' > /absolute/path/to/relay-hook.sh
```

Restore from version control afterward. Do not leave a neutralized script committed.

---

## 6. Troubleshooting install

**Hook not firing**

- Confirm the entry is in the correct settings file for the session scope (project vs. global,
  see §1). Run `claude /hooks` or inspect the active settings to verify registration.
- The `matcher` must be `""` (empty string). A non-empty matcher is matched against
  session context; only `""` catches all stops unconditionally.
- Ensure the hook script is executable: `chmod +x /path/to/relay-hook.sh`.
- The hook fires only on `SubagentStop` — i.e., when a sub-agent (Runner) stops, not when
  the top-level session stops. If you have not spawned a sub-agent, the hook will not fire.

**`jq` missing**

The Relay hook script parses the JSON payload with `jq`. If `jq` is absent the script will fail
silently (exit non-zero) and the Runner will stop as if no hook fired.

```bash
# macOS
brew install jq

# Ubuntu/Debian
apt-get install -y jq
```

Verify: `jq --version`.

**Wrong `sprint.json` path**

The hook script has the path to `sprint.json` hardcoded at install time (or derived from
`$SPRINT_JSON` if you parameterize it). If the sprint file is not found, the hook has no WP
list and will fail. Check:

1. The path in the hook script matches the actual file location.
2. The file is valid JSON: `jq . sprint.json` should print without error.
3. The working directory at hook fire time (`cwd` in the payload, SPEC §9) matches your
   assumptions if you use a relative path. Prefer absolute paths.

---

## 7. See also

- [Getting started](getting-started.md) — write your first `sprint.json` and run a sprint end-to-end.
- [Architecture](architecture.md) — the Relay loop internals, Gate evaluation order, and
  keep-best semantics in detail.
