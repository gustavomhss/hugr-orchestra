# Provider facades, protocol lowering and refusal boundaries

**L1 authority:** pinned provider, protocol and transport implementations. Source excerpts C05–C11 support the decisive boundaries. The existence of a facade does not demonstrate Core routing, credential availability, remote compatibility or a successful live call.

The package separates provider identity and deployment configuration from wire protocol, endpoint, auth, framing and transport. Its facades configure these parts before creating a model. The observed choices are:

| Facade | Source-defined route and configuration |
| --- | --- |
| OpenAI | Responses by default; explicit Responses WebSocket and Chat selectors; environment key fallback. |
| Anthropic | Messages route; `x-api-key` auth. |
| Google | Gemini route; `x-goog-api-key` auth. |
| Amazon Bedrock | Converse route; region-derived endpoint; bearer API key or SigV4 credentials. |
| Azure | Resource name or explicit base URL required; Responses default, optional completion URLs; API version query and API-key auth. |
| GitHub Copilot | Base URL required; model-name rule selects Responses for GPT 5+ except `gpt-5-mini`; no automatic environment key fallback. |
| Cloudflare | Gateway and Workers AI facades; derived or overridden endpoints; gateway and upstream authorization can coexist. |
| OpenAI-compatible, OpenRouter, xAI | Shared Chat protocol for generic compatible services; OpenRouter extends the body; xAI defaults to Responses with Chat available. |

Source: `packages/llm/src/providers/*.ts`; exact captured blob/SHA bindings are in `source-manifest.json`. These are source defaults at the pin, not current external product recommendations.

HTTP preparation rejects overlays of protocol-owned roots such as messages, model, tools, system and generation fields; other extension fields can merge into an object body. Auth runs after HTTP header overlays and receives the final URL/body. The executor classifies HTTP failures, redacts diagnostic context and retries only retryable failures, with two retries by default. Authentication, invalid requests, quota exhaustion, content policy and transport reasons are not all interchangeable retry classes. Error-body truncation occurs after reading the response text; it is not a general response-download size cap. Sources: `route/transport/http.ts` (C05), `route/executor.ts`, `schema/errors.ts` (C06).

Chronological system updates preserve their position. Shared fallback accepts text only and escapes `&`, `<`, `>` inside a `system-update` wrapper lowered as user content. Anthropic has native handling only for the exact supported model and neighbor placement; an update splitting pending local tool calls from their results is refused. Other inspected protocols use the fallback. Source: `protocols/shared.ts`, `protocols/anthropic-messages.ts` (C07–C08), `openai-chat.ts`, `openai-responses.ts`, `gemini.ts`, `bedrock-converse.ts`.

Automatic cache hints apply by the recognized Anthropic/Bedrock route IDs; explicit hints remain, and `none` disables automatic addition. The protocol encoders enforce their four-breakpoint budgets. OpenAI Responses skips provider-executed call resubmission and uses item-reference/reasoning metadata where appropriate; a structured-output refusal emits a generic provider-error message. WebSocket uses the same Responses protocol with a `response.create` message and requires the injected WebSocket service. Sources: `cache-policy.ts`, `protocols/openai-responses.ts` (C09), `route/transport/websocket.ts` (C10).

**Boundary and gaps.** `docs/guides/models.md` explicitly documents only Anthropic Messages, OpenAI Responses and compatible Chat as routed by the session core; it lists Bedrock, Gemini and OpenAI Chat as implemented in the model layer but not yet routed (C11). Core routing and remote providers are outside this record's implementation proof. Protocol helpers and broad multimodal branches are not exhaustively audited; declared and recorded tests are evidence of intended cases only.
