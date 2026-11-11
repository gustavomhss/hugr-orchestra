# Native capability identity, policy and leaf registration

Layer: **L1 — pinned factual basis**. Need: `component`. Scope: `orchestra.s1`.
Source revision: `1cde2ff7a71bcf7aecb5d030917b577165135d38`.

## Observed implementation

Capability host authority is an issued Context frame, not model-supplied JSON. `withContext` validates matching owner/invocation Session and agent IDs, freezes identity and captured rules, and marks the frame with a private Symbol. It explicitly does not establish persisted Session/tool-part existence. Child frames additionally require an exact parent context, deterministic child ID, ordinal 1–64, maximum lineage depth 8 and a 64-character request hash. `require` checks current tool invocation and exact project/directory/workspace placement. [1]

`CapabilityPolicy` supplies the persistence check: the Session must still occupy that project/Location, and the root assistant message must still contain the named pending/running tool part for the same agent. Each child proof must match a running child SQL row and every lineage field. Native captured deny rules are a restrict-only floor; later allow/ask rules cannot erase one. Authorization rechecks the binding and current configured permission after any approval. [2]

Permits are frozen objects issued into a private WeakSet. `commitMany` accepts at most 16 permits sharing the same binding, refuses an existing ambient SQL transaction, holds the agent's materialized permission state, starts an immediate database transaction, verifies the same current frame and persisted invocation again, and rechecks current denies before the write callback. Approval occurs before these locks. The guarantee here concerns this native capability boundary; it must not be generalized to every arbitrary plugin/tool. [2]

The Location capability node creates connections/jobs/artifacts/channels/media/document/sheet/service/process/schedule leaves and registers their canonical names once. Vendor resolution and I/O are deliberately first-use. A startup process sweep records stale ownership using the current host registry; a non-interruption sweep failure is logged so Location startup can continue. Schedule management reaches the host scheduler through a separate process-bound port; an unbound scheduler defects explicitly. [3,4]

## Normative intent and limits

The native Streamable HTTP MCP README assigns transport only `listTools` and scoped `open/callTool`. Approved endpoint and exact credential come from the caller. Its stated contract bounds catalogs, requests, responses and session generations; it deliberately omits retry, resumability, OAuth discovery and server-triggered model/tool execution. It requires ambiguous remote mutations to retain `outcome_unknown`: abort/DELETE does not prove nonexecution. These are the transport owner's documented constraints, not fresh runtime verification by this producer. The ordinary SDK-backed MCP service in `s1.core.extensions` is a different surface. [5]

The artifact/process guide explicitly presents artifact content verification and latest-observed process state as limited evidence. This matches why registration or a “running” record must not be reported as verified content or current remote liveness. Leaf artifact revision, sharing, vendor schema validation and process cancellation rules are outside the inspected policy module; the inventory retains those sources for deeper consumption. No native capability operation or vendor call was executed. [6]

## Source anchors

- **1.** `packages/core/src/capability/invocation.ts:e2ddcb3e3f0da61b8d9d5fe8c7c74436b844e890` — issued root/child frames and require, lines 12–141.
- **2.** `packages/core/src/capability/policy.ts:d75718a6ac8d6d3e36c5b791301a68a728be26b0` — validate, authorize, commitMany, lines 35–170.
- **3.** `packages/core/src/capability/tools.ts:1103ab0c8eb3d9d79cc5ff295cb267847eab629e` — canonical Location leaf registration and process sweep, lines 36–68.
- **4.** `packages/core/src/scheduled-task/port.ts:8ea347436e18a93f8dc43926c7fb84108fc0a20c` — scheduler binding port, lines 7–40.
- **5.** `packages/core/src/capability/mcp/README.md:95f3154aef1625eaac3cd8feb500504996eb074f` — native transport contract and deliberate limits, lines 3–9,29–37,43–126.
- **6.** `docs/guides/artifacts-and-processes.md:b9e9c90310318f99a1efaa3ae2952026796364c4` — verification status and observed process state, lines 7–31,33–51.
