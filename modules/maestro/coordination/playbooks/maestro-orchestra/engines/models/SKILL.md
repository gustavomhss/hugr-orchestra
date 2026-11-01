---
name: maestro-orchestra-engines-models
description: Which model providers and wire protocols Orchestra uses, how a model is picked and called, where credentials live, and the stated limits.
internal: true
when: The owner asks which providers or models work, why a model is unavailable or unsupported, how to connect or remove a credential, or what the model layer does.
not-when: The question is about running on a Claude subscription; open claude-mode.
covers: [packages/llm]
---

# Models, providers and credentials

## Providers and catalog

- About 30 built-in provider plugins in `packages/core/src/plugin/provider/` (Anthropic, OpenAI, Google, Vertex, Bedrock,
  Azure, GitHub Copilot, OpenRouter, xAI, Groq, Mistral and others), plus generic OpenAI-compatible endpoints and
  custom providers from config `providers`.
- The model catalog comes from models.dev (`packages/core/src/models-dev.ts`); the build embeds a snapshot as the
  offline fallback. Each model can carry reasoning variants; a variant only names a level the model's API accepts.
- Default model: config `model`. An agent's own `model` and `variant`, and the session's choice, override it.
- A provider is turned off by a `provider.use` deny policy; Settings writes it as the disabled-providers list.

## Wire protocols

| Protocol | Routed by the session core |
|---|---|
| Anthropic Messages | yes, for `@ai-sdk/anthropic` models |
| OpenAI Responses | yes, for `@ai-sdk/openai` models |
| OpenAI-compatible chat | yes |
| Bedrock Converse | no; implemented in the model layer |
| Gemini | no; implemented in the model layer |
| OpenAI Chat | no; implemented in the model layer |

`packages/core/src/session/runner/model.ts` picks the route. Any other model fails with an unsupported-API error naming
provider, model and API. A malformed `api.settings.generation` fails as model unavailable. Prices come from the catalog.

## Credentials

- Provider credentials and integration tokens live in `orchestra.db` in the data directory (`~/.local/share/orchestra`
  unless `XDG_DATA_HOME` says otherwise); MCP OAuth tokens in `mcp-auth.json` beside it.
- Every secret is encrypted with AES-256-GCM. The key is 32 random bytes in the operating system's credential store,
  entry `ai.hugr.orchestra` / `credential-key`. With no usable store, the key sits in `credential.key` (mode 0600) and a
  warning is logged once.
- A secret that cannot be decrypted is logged and skipped, never deleted. A damaged `mcp-auth.json` is moved aside to
  `mcp-auth.json.corrupt-<timestamp>` and MCP logins start empty.
- Remove: `orchestra providers logout [provider]`, `orchestra mcp logout [name]`.
- Claude mode stores no Claude credential; Claude Code holds the login.

## Limits the owner should know

Early release. The session core routes three of six protocols. Provider work is not retried automatically after a crash.
Builds are unsigned. The limits guide lists the rest.

## Not matching the guide

The limits guide lists code review among "not built"; in code that seat is staffed (see team).

## `packages/llm`

Schema-first LLM core (`@orchestra/llm`): one typed request, response, event and tool language; provider differences
live in adapters (protocols, routes, providers). Core's Session runner uses it for every model turn.

Entry points: `LLM.request`, `LLMClient` (`generate`, `stream`, `prepare`), `Tool`, `ToolRuntime`; `/route` for routes,
auth, endpoints and executors; `/providers` for facades (OpenAI, Anthropic, Google, Amazon Bedrock, Azure, Cloudflare,
GitHub Copilot, OpenRouter, xAI, OpenAI-compatible); `/protocols` for the six wire protocols.

Behavior: prompt caching is on by default (`cache: "auto"`, breakpoints on the last tool, last system part and latest user
message; OpenAI and Gemini cache server-side). Escape hatches in order: `generation`, `providerOptions`, then `http`
overlays. `LLMClient.prepare` compiles a request without sending it. It owns schemas, protocols, routes and transports;
model selection, permissions, tools and history belong to Core.
