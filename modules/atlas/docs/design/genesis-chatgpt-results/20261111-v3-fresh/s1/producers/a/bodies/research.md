# Pinned toolkits and retained research evidence

Layer: **L1 — pinned factual basis**. Need: `component`. Scope: `orchestra.s1`.
Source revision: `1cde2ff7a71bcf7aecb5d030917b577165135d38`.

## Observed implementation

BackendToolkit has explicit absent/fetching/ready/failed/unsupported states, a root separated by engine version and target, and manifest-supplied engines/runtimes. `ensure` rejects an unsupported host and checks dependency ordering and host floor before acquisition. Downloaded engines use `PinnedArtifact.install`; hosted engines use the hosted lifecycle. Readiness requires installed markers, executable files, runtime executables where needed and exact host shim text. A cache marker alone is insufficient. Cross-target prefetch does not execute that target or write its host shim. [1]

`prepare` recognizes commands naming `BACKEND_TOOLKIT_BIN` engines and acquires only those engines and dependencies. The source describes a 60-second shell preparation wait while acquisition may continue; installation has its own attempt lifecycle. The README assigns lockfiles and generated entry skills to owning packs and keeps Core independent of product specialist modules. Those manifest pins and platform floor values are inputs, not evidence that an engine was downloaded or qualified on this machine. [1,2]

ResearchToolkit reuses BackendToolkit with its own root and manifest. Default owner caps are 2 GiB indexer, 1 GiB probe, 2 GiB scratch, 4 GiB index storage, eight commits and a 15-minute shard timeout; config can lower byte caps, not raise them. The default index adapter plans no shards and fails a build as unavailable, so providing the real adapter is necessary. Prewarm records building/skipped state outside the worktree, uses a host-wide file lock for indexer work and retries lock timeouts. A building status older than the shard timeout no longer claims live building. Status writes are best effort and may lose status without making the underlying index successful. `warm` also catches a planning error as an empty shard list: a no-work warm-up is therefore not proof of complete index coverage. [3]

ResearchLedger canonicalizes JSON with sorted object keys, omitted undefined fields and preserved array order. Operation identity derives from Session/message/call/action; event identity derives from execution Session and operation key. Retained entries query versioned event types within project and execution scope, decode each row and reject scope/receipt mismatches. Placement is re-resolved before reuse. A repeated operation with a different input hash or multiple matching records fails conflict. This is retained evidence identity, not a proof of the truth of admitted source text. [4]

## Normative intent and limits

The bodies establish acquisition, readiness, resource-cap and evidence-ledger boundaries. Individual engine manifests, parsers, language indexes, sandbox build adapters and research source/document validation remain owned by the corresponding toolkit/leaf families in coverage. No engine install, language server, index build, source admission or research publication was executed. “Ready” here describes the source predicate, not a current host observation.

## Source anchors

- **1.** `packages/core/src/backend-toolkit/index.ts:e5c8e61d202f8a79a5b967d5abc467a97b58f4a3` — state, prepare, acquire and readiness, lines 17–107,108–179,180–279.
- **2.** `packages/core/src/backend-toolkit/README.md:a7efc8b49f165ad767f51cb49ad9bdbb220215d1` — pack ownership, lockfiles and generated entry skills, lines 1–24.
- **3.** `packages/core/src/research-toolkit/index.ts:a6e7b3bf6dd0ba44d0f0de5cac3eebe5c9f36095` — caps, adapter boundary, prewarm and shard status, lines 15–107,150–218,220–300.
- **4.** `packages/core/src/research/ledger.ts:6b6ca2931b6aa8bdd2156b47fc13005aab93dcbf` — canonical identity, retained scope and replay, lines 30–84,145–157.
