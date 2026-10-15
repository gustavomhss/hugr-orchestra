# Linux App Dock performance proof

Development probe, not a production installer or UI integration. It starts real
Mousepad (GTK), FeatherPad (Qt), xterm and a native GTK measurement workload in
one Linux container, then hosts the stock Xpra HTML5 client using the existing
`createAppDock` implementation and its sandboxed `WebContentsView`.

Run from `packages/desktop` with Bun, Electron dependencies and a running Docker
engine:

```sh
docker build --tag orchestra-dock-linux:probe scripts/linux-runtime
bun run scripts/linux-runtime/index.ts
```

`APP_DOCK_ELECTRON` can select an existing Electron executable.
`APP_DOCK_PROOF_TMP` selects the evidence directory's parent. Temporary evidence
is retained; the probe removes its container and volume on ordinary completion
or failure. `ownership.json` records the owned name for recovery after a hard
process kill. Docker CLI operations have a timeout. The container is limited to
1 GiB, two CPU cores and 256 processes; these are probe limits, not guarantees that
arbitrary applications fit within them.

The endpoint binds an exclusive host loopback port, uses a generated password
and an individual TLS certificate. The certificate is SHA-256 pinned only for
the probe's Chromium session. Authentication is supplied via session storage,
not stored in viewer URLs. No global certificate bypass is used.

## Measurement scope and controls

- Input latency measures key enqueue through a real GTK application's color
  change to verified canvas pixels. It excludes display scanout. `offscreen=0`
  allows readback instrumentation; default worker rendering is not benchmarked.
- A 100 ms injected forwarding delay must shift measured latency.
- Stopping the actual runtime must cause the input probe to fail.
- A bounded CPU/allocation workload must move cgroup CPU and memory counters.
- Native animation must draw visibly, reduce redraws while hidden, and resume.
- Graphics suspension uses the actual Xpra `suspend` / `resume` protocol packets.
  The HTML5 client's `suspend()` helper only changes damage batching.
- Guest memory includes applications and Xpra. It is not transport-only overhead.
  Host process working sets are separate and can share pages. Hypervisor process
  RSS is recorded for diagnosis; it does not account for total VM backing memory.

## First complete run

Observed on an Intel Mac with 16 GiB RAM, Linux amd64 and Electron 42.3.3, using
Xpra server 6.5.4 and HTML5 client 21. Default encoding and batching:

| Observation | Result |
| --- | --- |
| Key enqueue to canvas, p50 / p95 | 23.7 / 28.7 ms |
| Injected 100 ms delay, median | 123.1 ms |
| Guest visible / hidden idle CPU | 1.73% / 1.22% of one core |
| Guest working set, visible idle | 437 MiB |
| Native animation canvas updates | 488 in 10.38 s |
| Hidden animation canvas updates | 10 in 10.32 s |
| Restored animation canvas updates | 482 in 10.31 s |
| Guest visible / hidden animation CPU | 58.8% / 55.3% of one core |

Evidence: `orchestra-dock-linux-aUNMNN/report.json` under the session's temporary
evidence directory. These are one workload's observations, not performance
claims for Slack, GPU-heavy applications, Windows or ARM64. Graphics suspension
preserves guest execution; the animation workload continued to consume CPU.

Remaining validation: default worker rendering, native-app versus transport
cost, total VM footprint, sustained workloads and persistent installation.
Production integration should follow those measurements.
