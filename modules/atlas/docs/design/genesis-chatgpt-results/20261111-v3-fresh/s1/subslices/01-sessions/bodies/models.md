# Core catalog and current Session model adapter boundary

Layer: **L1 — pinned factual basis**. Need: `component`. Scope: `orchestra.s1`.
Source revision: `1cde2ff7a71bcf7aecb5d030917b577165135d38`.

## Observed implementation

Core ProviderV2 and ModelV2 primarily re-export schema contracts; `ModelV2.parse` splits a provider prefix from the remaining slash-containing model ID. The catalog is Location-scoped, starts empty and receives ordered State transforms. Finalization removes providers denied by `provider.use` policy. Availability checks enabled/disabled state and configured credentials/integration connections; it does not ping a provider. Model projections merge provider/model API settings, headers and request bodies. Labeled non-default key credentials create virtual provider IDs with a `#credentialID` suffix; their model projections retain that distinct selected identity. [1,2,3]

A Session-selected model must be present among available candidates and satisfy inherited subagent-model ceilings. An explicit unavailable selection fails rather than falling back. Without one, the runner tries the configured/default candidate if supported, then the first supported candidate. An unknown explicit variant fails; absent/default variant may use the model request default. Credential resolution chooses the exact virtual-provider credential or the base integration's active connection. [4]

The native Session adapter supports OpenAI Responses for `@ai-sdk/openai`, Anthropic Messages for `@ai-sdk/anthropic`, and OpenAI-compatible chat for native endpoint models or the specified compatible/OpenRouter packages. Other API packages return `UnsupportedApiError`, even if the broader catalog knows them. Canonical generation options are strictly decoded; API keys are separated from HTTP request body before the route is constructed. The adapter carries context/input/output limits and catalog prices, but does not establish live protocol compatibility or measured billing. [4]

The separate AISDK service lets registered plugin hooks supply SDK/language instances. It caches language objects by provider/model/variant and SDKs by serialized API/options, installs scoped hooks and errors if no plugin returns an SDK. It wraps optional SSE chunk timeouts and combined abort signals. This dynamic SDK mechanism must not be used to infer that the current native Session adapter accepts every plugin package. Its caches also have a different identity/lifetime from per-turn native route construction. [5]

## Normative intent and limits

Core's README assigns provider/model/catalog and provider plugins to the platform boundary, with the Copilot directory explicitly vendored. This body covers the catalog-to-Session decision point; transport codecs, model package internals, catalog synchronization and vendor-specific authentication belong to their owning packages/families. Catalog presence, a price record and successful source decoding are not operational availability, billing evidence or a successful model turn. No provider request or model test ran. [6]

## Source anchors

- **1.** `packages/core/src/provider.ts:56a8629db307e3d904c355789db9e5b8256e644f` — schema aliases, lines 1–25.
- **2.** `packages/core/src/model.ts:085800e0480c60a70f989469ba7c0dc09aa758eb` — model aliases and parse, lines 1–42.
- **3.** `packages/core/src/catalog.ts:86acb93f550bc2b941e85d42cc4d62d73cbf64ba` — materialization, policy, availability and virtual credentials, lines 84–122,124–188,191–312.
- **4.** `packages/core/src/session/runner/model.ts:188abc7053f9a02b8dd84ce7bdc30e0e7c001b3b` — variant, route support, selection and credential binding, lines 132–338.
- **5.** `packages/core/src/aisdk.ts:c5f21baea562c0a8eeeb568929d7971f4c80a3dd` — SDK hooks, caches and timeout wrapping, lines 27–122,149–234.
- **6.** `packages/core/README.md:742921238462659e1a5a314f2e0238102c6e9f3a` — module/domain contract and vendored compatibility, lines 54–88.
