# Orchestra validation campaign

These scripts exercise real Orchestra callers and compiled binaries. They are evidence producers for WP10 in
[`orchestra-integration.md`](../docs/orchestra-integration.md), not a completed acceptance certificate.

Every local run requires `ORCHESTRA_LOCAL_TESTS=1`, the owner-authorized exception for this campaign. Hosts use
temporary HOME/XDG directories and empty credentials. Do not point a scenario at a running user server. Process
queries fail on incomplete observations; scenario teardown is separate from the asserted cleanup observation.

## Build and run

Build the host target from the same source revision being evaluated:

```sh
bun run omni:build
bun run packages/orchestra/script/build.ts --single --skip-install --skip-embed-web-ui
ORCHESTRA_LOCAL_TESTS=1 bun packages/omni/campaign/v2-kill.ts serve
```

`OMNI_CAMPAIGN_CLI` can select an already-built CLI. Record its build revision and binary hashes: a verdict from
an older binary does not prove the current source. `logs/` is ignored because it holds local paths and raw process
observations. Preserve the JSON verdicts, negative controls and command logs when writing an acceptance report.

| Scenario | Entry point | Scope |
|---|---|---|
| V1 | `v1-background.ts` | Real agent turn, post-adoption output, session removal. Windows shell harness incomplete. |
| V2 | `v2-kill.ts serve`, `tui`, `hold` | Compiled CLI/TUI crash with live supervised trees. Desktop uses its packaged smoke. Windows TUI harness incomplete. |
| V3 | `v3-supervisor.ts` | Supervisor death, documented Unix hole, next-spawn recovery. |
| V4 | `v4-lsp.ts` | Twenty same-instance crashes/restarts with real tsservers. |
| V5 | `v5-mcp.ts` | One MiB measured stderr, real MCP handshake and final diagnostic marker. |
| V6 | `v6-terminal.ts` | vim, size, full Unicode reconnect replay, cooked responsiveness and raw byte identity. |
| V7 | `v7-overhead.ts --quiet` | 1,000 interleaved samples per real AppProcess caller; `--control` is readiness only. |
| V8 | `v8-windows.ts` | Windows command lines, npx, PowerShell and ConPTY stop/exit/EOF deadline. |
| V9 | `v9-broken-artifacts.ts --quiet --mutation --diagnose` | Copied shipped binaries; missing/corrupt native files; two-second rejection. |
| V10 | `v10-exit.ts` | Runtime disposal and tree cleanup on serve quit. Natural event-loop retention is explicitly unproven. |

Timing acceptance requires a quiet host; a refused or interrupted measurement is not green. V7's limit is
`p50(omni) <= max(p50(legacy) * 1.10, p50(legacy) + 2 ms)`. Do not loosen it to accommodate local load.

The delivery workflow covers Unix V7, Windows V8, and V9 on three OSes. Its scope artifact records remaining cells;
it does not certify all of WP10. Final acceptance still needs the complete OS/host matrix and owner signature.

## PTY byte evidence

Cooked PTY output includes OS terminal processing. The macOS investigation compared the same producer through
native Omni, Python's system PTY, and the real server WebSocket. Raw-mode accounting instead disables terminal
translation on the actual slave and compares output against independently mirrored successful writes. No arbitrary
CR normalization is used. `pty-byte-probe.ts` preserves mode snapshots and source/output hashes.
