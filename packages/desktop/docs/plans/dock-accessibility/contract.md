# Native Dock contract v1 — design specification

Status: lead-selected design; executable schemas freeze after W0 in [plan.md](plan.md). This is not an implemented/public HttpApi.

## Ownership and transport

Host-only registration associates:

```text
DockIdentity = { senderID, tabID, generation, profileID }
RuntimeIdentity = { runtimeID, runtimeEpoch, accessibilitySessionID }
AppIdentity = { appID, launchEpoch, ownershipRevision, processIdentities, windowAssociations }
Binding = { bindingID, bindingEpoch, dock, runtime, app }
```

`processIdentities` include guest PID plus process-start/namespace identity, not PID alone. The helper performs indexed root discovery, resolves exporter unique owners/PIDs and proposes serializable `{busOwner,objectPath,objectGeneration}` handles with ancestry/window evidence. Runtime window associations use that proposal and its launch evidence without another AT-SPI reader. Window titles, shared bus visibility and X display numbers alone are not ownership evidence. Portal/broker confirmation authorizes one concrete dialog root, not the broker's entire process.

`bind` has explicit `discover` and `confirm` phases: discover consumes host launch evidence and returns a bounded root proposal; confirm echoes the proposal/roots and current ownership revision, then the helper freshly revalidates identities/ancestry before returning `bound`. No model refs/actions are available before `bound`. Proposal expiry, shared-process ambiguity and unprovable window/portal association fail `ownership-unresolved`/`stale-proposal` rather than widening scope. W0 freezes actual window-evidence fields from observed providers.

The runtime starts the helper inside its guest user/display/accessibility session and supplies raw stdin/stdout/stderr plus exit, termination and reaping. UTF-8 chunks may split JSON lines or characters. The client buffers only within the framing limit and handles backpressure. It never trims protocol chunks or interprets stdout as diagnostics.

Startup `hello` negotiates exact version, helper epoch, session identity, supported operations and effective limits. A protocol-ready helper is distinct from an app-ready binding. Epoch/version mismatch is a named failure. The runtime supervises one helper per accessibility session and provides a new runtime/session epoch after recreation.

## Guest wire

One complete JSON object per line; stdout is protocol-only. W1 encodes a discriminated union, not an unvalidated `unknown` request handler.

```json
{"v":1,"id":"helper-uuid:1","sequence":1,"bindingID":"binding-uuid","bindingEpoch":"launch-binding-uuid","helperEpoch":"helper-uuid","op":"read","timeoutMs":1000,"args":{"budget":100,"maxText":1500}}
```

The `timeoutMs` example is illustrative; it is not a measured SLA. The host tracks the original monotonic deadline including queue time and passes the remaining relative budget. Guest monotonic clocks need not match the host clock.

Operations: `hello`, `bind`, `read`, `action`, `type`, `unbind`, `cancel`, `shutdown`. Only host control messages can create/remove bindings. `read` optionally selects a previously issued owned root ref and text character offset. `action` selects an advertised action ID from the current observation; `type` requests full-value replacement.

Replies: `{v,id,ok:true,value}` or `{v,id,ok:false,error:{code,message,outcome}}`. Every request gets at most one terminal result. After the startup hello, requests use strictly increasing safe-integer sequences with canonical ID `<helperEpoch>:<sequence>`. Allocate sequence/ID at actual wire serialization, not semantic queue admission: bypassing controls may overtake queued requests without giving them obsolete sequence numbers. The helper retains one sequence high-water mark and rejects replay/lower sequences, noncanonical IDs, oversized/malformed/version-mismatched frames, unknown operations and scope/epoch mismatch before dispatch. A new channel requires a new helper epoch; sequence exhaustion requires epoch recreation. This supplies replay rejection without an accumulating request-ID history. JSON round-trip tests cover non-ASCII text and split/coalesced frames.

Cancellation identifies the original request. Queued/not-started work is removed; in-flight synchronous provider work may finish. The host discards late results and invalidates uncertain observations. Deadline, cancellation, provider crash or EOF after dispatch returns `outcome:"unknown"`; before dispatch returns `outcome:"not-dispatched"`. Neither is automatically retried. Correlation-only late replies must not affect a new binding.

The client admits a bounded FIFO semantic queue with one in-flight semantic operation per helper. `cancel`, local `unbind` and `shutdown` use a separate bounded control lane and may bypass that queue; they share monotone wire sequencing but never start another semantic operation. Control acknowledgement is distinct from the original operation's sole terminal result. Caller promise settlement does not free the semantic slot: retain it until the original guest terminal result or confirmed helper termination/reaping. Normal cancellation marks in-flight work cancelled and stops scheduling subsequent calls while allowing the outstanding Gio call to reach its terminal callback; close/watchdog cancellation may retire the entire helper epoch. Remote mutation completion remains unknown regardless of local cancellation.

Revalidate binding/observation at semantic dispatch, not just enqueue time. Queued work using refs consumed by a prior mutation fails stale. Unknown/cancelled mutation consumes observations; a new observation is required before another mutation. A stalled provider triggers bounded helper retirement, fails pending calls and invalidates its epoch without killing or replaying app operations. Test cancel/terminal/EOF races and late replies against this state machine.

## Outer Dock RPC and tool cancellation

W1 freezes the outer bridge additions alongside the guest schemas. Existing `dock.rpc` request UUIDs remain distinct from helper wire IDs. Main sends a bounded `{type:"dock.rpc.native-admitted",id,backend:"linux-atspi"}` notification immediately after capturing a native target, before guest queueing. This lets the plugin classify default-active-tab reads as native. String refs and `dock_action` also establish explicit native intent; the notification is routing evidence, not provider dispatch/effect evidence.

Native RPC failures retain `error:{message,backend,code,outcome}` and the plugin serializes those fields as model-visible JSON; ordinary browser `{message}` errors retain their existing output. For native intent/admitted requests, the plugin-owned 15-second timeout yields `transport-timeout` with conservative unknown outcome and sends correlated cancellation if the port is usable. A routing-unconfirmed generic transport failure cannot prove a native mutation was not dispatched and never justifies automatic replay.

`ToolContext.abort` is wired to `{type:"dock.rpc.cancel",id:<original UUID>}`. Main cancels only the captured native request/binding, never a tab resolved again from current focus. If abort occurs before native admission, retain the abort marker and cancel on admission; a browser request keeps legacy behavior. Remove abort listeners/timers on terminal settlement. Native caller settlement, control acknowledgement, guest completion and reaping remain separate transitions; N09/N10 exercise all of them.

## Model-facing observations

Native `dock_read` preserves recognizable `title`, `items`, `text`, `truncated` concepts while adding `backend:"linux-atspi"`, observation identity, windows, capabilities and coverage. Metadata accurately labels guest coordinates; it does not pretend they are viewer CSS coordinates. Host-derived URLs/titles remain viewer metadata rather than guest navigation APIs.

Each item has an opaque string `ref`, normalized `role`, `name`, optional parent ref, explicit states, interfaces, advertised actions and bounded text/value metadata. Containers/window roots remain discoverable even if not clickable. Capabilities distinguish unsupported, unavailable, read-only and unknown; a successful empty interface probe is not sufficient to label a defunct provider unsupported.

Actions contain a snapshot-qualified ID, provider name and optional localized label. The model passes the advertised ID, not a guessed role or mutable provider index. Before dispatch, resolve the same object, revalidate ownership/liveness/state and re-enumerate the action to detect drift. Duplicate/ambiguous action identity requires a new read rather than guessing.

Text offsets/counts are provider character offsets, not UTF-8 byte indexes. Text/value metadata reports the returned range and whether it is complete within that control. Virtualized/projected editor content is not labeled a complete document. `maxText=0` avoids optional text extraction. Protected-text controls expose state/capability rather than echoing their contents into snapshots or logs.

Coverage reports `complete-within-scope`, `partial` or `unsupported` with scope/reason. Consistency is independently always `non-atomic`: live AT-SPI queries provide no transaction/revision fence, and lifecycle events are not exhaustive UI change detection. `complete-within-scope` refers only to exhausted accessible traversal of the requested scope; it cannot imply a complete inaccessible/virtualized dataset. Detected changes add a partial/invalidation reason.

Tree pagination returns an opaque bounded continuation token for the same binding/query/root and next indexed traversal position; text pagination uses explicit character ranges. Each page issues a fresh observation/ref epoch. Continuation state retains only a bounded traversal stack/frontier, expires on mutation/lifecycle/ownership change, and freshly validates its root and resume anchor. If validity is unprovable return `cursor-stale`. Pagination is live and non-atomic; report that fact and `hasMore`, rather than promising one coherent historical snapshot. Never implement pagination by first fetching the entire tree.

## Native refs and tool compatibility

Native refs bind helper epoch + binding epoch + observation epoch + object identity/generation. They are opaque string tokens, never node positions, names or recycled numeric indexes. A new native read, a mutation attempt, provider removal, owner loss, rebind/restart or uncertain event coverage invalidates affected refs. Resolve an optional root ref before advancing the read's observation epoch.

Only the current observation's bounded ref map is retained per binding. Event invalidation and action-time fresh checks supplement provider-lifetime checks; unsupported identity/path-reuse behavior cannot be advertised as reliable mutation capability. Web numeric refs keep their existing behavior. Native strings cannot be routed to a browser ref registry, and web numbers cannot be treated as native handles.

| Tool | Native v1 | Browser behavior |
| --- | --- | --- |
| `dock_list` / `dock_activate` | Existing Dock tab identity; additive backend/native readiness metadata | Existing fields and activation semantics |
| `dock_read` | Existing budgets plus optional `rootRef`, `cursor` and `textOffset` for bounded subtree/tree/text reads | Existing defaults; native-only selectors rejected |
| `dock_click` | String ref; dispatch one uniquely established default activation from W0's tested provider mapping; ambiguous controls require `dock_action` | Numeric ref and coordinate precedence preserved |
| `dock_type` | String ref, EditableText full-value replacement including empty string; actual read-back required | Numeric-ref path keeps existing behavior |
| `dock_action` (additive) | String ref and advertised `actionID`; returns acknowledgement and explicit observation status | Named unsupported operation |
| `dock_wait` | Bounded delay only; not proof of application completion | Existing bounded delay |
| `dock_close` | Close the viewer and unbind that tab's accessibility state; app stop/uninstall follows the runtime's explicit lifecycle policy | Existing close/remaining-tab semantics |
| Remaining browser/display operations | Named unsupported operation in semantic v1; no implicit viewer fallback | Existing operations |

Tool schemas broaden ref acceptance to number-or-native-string for common ref operations. RPC/backend validation remains stricter. Native target resolution is captured at request admission; focus/activation changes do not retarget queued work. A valid ref from a different tab/window/profile/runtime/binding is rejected even if its label matches.

## Mutation results

`action`/native click: report `dispatch:"acknowledged"`, `"rejected"` or `"unknown"`; separately report `postcondition:"unverified"` unless an explicit supported predicate was actually observed. A helper-level `ok:true` is not a claim that a file was saved or a workflow completed.

Native `type`: after `EditableText.SetTextContents`, fresh Text read-back must equal the requested contents within a bounded verification budget before reporting `postcondition:"verified"`. Missing Text verification support is `unverified`, not a fabricated equality. An oversized verification cannot silently widen the read budget. Both outcomes consume the observation; the next operation obtains fresh refs. Tests independently inspect the app's saved file/config as well.

Errors distinguish `not-ready`, `ownership-unresolved`, `stale-proposal`, `cursor-stale`, `stale-ref`, `wrong-scope`, `defunct`, `disabled`, `read-only`, `unsupported-operation`, `unsupported-interface`, `action-required`, `action-changed`, `provider-rejected`, `provider-unavailable`, `busy`, `timeout`, `cancelled`, `protocol-error`, `helper-exited`, `helper-resource-exit`, `postcondition-mismatch` and `verification-incomplete`. Native error code/outcome survives guest -> desktop RPC -> plugin -> model-visible JSON, including timeout/EOF/cancel faults; existing `{message}` browser failures retain their legacy representation. Outer transport success and native-operation success remain distinguishable. Externally displayed copy uses existing typed i18n; diagnostic codes remain machine-readable.

## Limits and freshness

- Public output defaults remain `budget=100`, `maxText=1500`; existing public maxima remain 500/20000. These are schema ceilings, not latency claims.
- W1 fixes additional finite limits for visited nodes/edges, calls, depth, per-field/total text, UTF-8 reply bytes, ref entries, pending requests, diagnostics and event invalidations. Their initial values are explicit configuration; performance acceptance is calibrated separately.
- Count scheduling work as well as returned items. Stop before the next call when a limit is exhausted. Return valid partial JSON with a limiting reason; do not generate a giant tree then truncate the encoded string.
- Bound native-call timeouts, connection startup and app-ready waiting. Keep a host-level whole-request watchdog inside the shipped 15-second tool timeout. A watchdog can terminate/reap a stuck helper; it does not prove an action was cancelled in the app.
- Direct `Gio.DBusConnection` calls select one property/index/text range at a time; never request eager `Cache.GetItems`, full `GetChildren`, `GetAll` or unlimited Collection results. Use finite asynchronous method timeouts and a separate connection-start deadline, not libatspi's hidden startup/cache behavior.
- Bound-owner removal/owner-loss notifications only mark the relevant binding/root dirty. Coalesce at the earliest client boundary; overflow invalidates the root. No global UI event subscription or callback traversal. Fresh reads/mutation checks cannot assume complete provider event delivery.
- Client budgets do not bound Gio message decoding, daemon/provider work or app-side accessibility activation. W0 must demonstrate the direct-query strategy and bounded retention, plus a runtime-enforced helper-only process resource envelope (where supported, cgroup v2 memory/swap/CPU controls with termination/reaping). Resource exit is explicit; external allocations and app activation costs are separately measured. No claim of a strict total-memory bound follows from a small Python map or cgroup setting alone.
- Read does not focus or activate a window. Native `SHOWING` and Dock viewer visibility are separate facts. Hidden-view policy keeps ownership and semantic operations explicit, without automatic tab activation or fallback to the currently focused guest app.
- On helper/runtime/binding close, fail pending requests, invalidate refs, unsubscribe events and release owned state. Closing a viewer does not uninstall the app; process lifetime belongs to the runtime contract.
