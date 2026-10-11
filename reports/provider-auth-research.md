# Provider auth research: verified key setup vs OAuth (2026-10-11)

Scope: the media providers (`openai`, `runway`) and the 12 `platform_*` hosted-MCP providers.
Sources: official docs plus public OpenAPI specs. On 2026-10-11 I also sent unauthenticated
requests to each MCP endpoint and read the public `.well-known` OAuth metadata. No credentialed calls were made.

## How the repo authenticates today

- `packages/core/src/capability/mcp/index.ts` `credential()` always sends `Authorization: Bearer <token>`. The token is `Credential.Key.key` or `Credential.OAuth.access`, and an expired OAuth credential is rejected. The MCP transport has no OAuth discovery or refresh (README, "Deliberate limits"). An OAuth provider therefore needs a separate client that does DCR, PKCE and refresh, then hands the transport an `oauth` credential.
- Hosts are pinned in a fixed table (`hosts`). The path and query come from the approved Selection, so `/mcp/<org>/<project>`, `?project_ref=` or `?readonly=true` are allowed on the pinned host.
- Media (`packages/core/src/capability/media/index.ts`) sends `Bearer` to `https://api.openai.com/v1` and to `https://api.dev.runwayml.com`, adding `X-Runway-Version: 2024-11-06` for Runway.
- The verifier (`connection/verify.ts`) and `CapabilitySetup.Provider` support only `slack | discord`. The pattern is a fixed production origin, one identity call, a strict ID regex, and a proof built from those IDs plus a key hash.

## Summary table

| Provider | Repo endpoint | Hosted MCP auth (official) | Key / token type | Cheapest identity call (free) | Stable IDs returned | Verdict |
|---|---|---|---|---|---|---|
| openai | `api.openai.com/v1` (media, no MCP) | n/a | Project API key `sk-proj-…` (standard key); Admin key `sk-admin-…` | **None documented for standard keys.** `/v1/organization/*` needs an Admin key. Every response carries an `openai-organization` header, which the docs describe only as "the organization associated with the request" | none guaranteed | **Key works; identity cannot be proven** |
| runway | `api.dev.runwayml.com` (media) | n/a | Runway API secret key (Bearer) | `GET /v1/organization` + `X-Runway-Version` | **none**: only `tier`, `creditBalance`, `usage` | **Key works; identity cannot be proven** |
| cloudflare | `mcp.cloudflare.com/mcp?codemode=false` | **OAuth or API token (Bearer)**. User and account tokens both accepted ([docs](https://developers.cloudflare.com/agents/model-context-protocol/mcp-servers-for-cloudflare/)) | API Token (user token), Account API token `cfat_…` | User token: `GET https://api.cloudflare.com/client/v4/user/tokens/verify`, then `GET /accounts` (and `GET /user` if User Details:Read is granted). Account token: `GET /accounts/{account_id}/tokens/verify` | verify → `result.id` (**token ID only**, plus `status`). `/accounts` → `result[].id` (32-hex). `/user` → `result.id` | **Key setup possible**, needs two calls (user token) or a known account ID (account token) |
| supabase | `mcp.supabase.com/mcp` | **OAuth (DCR) or PAT as `Authorization: Bearer`** ([docs](https://supabase.com/docs/guides/getting-started/mcp)) | Personal access token `sbp_…` | `GET https://api.supabase.com/v1/profile` | `gotrue_id` (user UUID). Also `GET /v1/organizations` → `[].slug` (`id` deprecated) | **Key setup possible** |
| vercel | `mcp.vercel.com` | **OAuth only**, and "only supports AI clients that have been reviewed and approved by Vercel" ([docs](https://vercel.com/docs/agent-resources/vercel-mcp)) | (Vercel access token exists for REST, but MCP does not document Bearer tokens) | `GET https://api.vercel.com/v2/user` (REST, if ever needed) | `user.id`, `user.defaultTeamId` | **OAuth only + client approval** |
| neon | `mcp.neon.tech/mcp` | **OAuth or Neon API key (Bearer)** ([docs](https://neon.com/docs/ai/neon-mcp-server)) | Personal, organization, and project-scoped API keys | `GET https://console.neon.tech/api/v2/auth` | `account_id` + `auth_method` ∈ {`api_key_user`,`api_key_org`,`oauth`,…}. `/users/me` → `id` (user keys only). `/users/me/organizations` → owning org for org/project keys | **Key setup possible** |
| railway | `mcp.railway.com` | **OAuth** (scope `workspace:member`) or CLI login. "Project tokens are not accepted"; account tokens not documented ([docs](https://docs.railway.com/ai/remote-mcp-server)) | Account token (Bearer); workspace/project tokens can't call `me` | `POST https://backboard.railway.com/graphql/v2` `query{ me { id email } }` | `me.id` (account tokens only). **HTTP 200 on auth errors: check `errors`** | **OAuth** (account-token Bearer on MCP unconfirmed) |
| sentry | `mcp.sentry.dev/mcp` | **OAuth only** ("All connections use OAuth"). The AS is `mcp.sentry.dev` itself (proxy) ([docs](https://mcp.sentry.dev/)) | n/a for hosted MCP (user/org tokens are REST-only) | n/a | n/a | **OAuth only** |
| grafana | `mcp.grafana.com/mcp` | **OAuth 2.1 only**, Grafana Cloud only. "doesn't support self-hosted Grafana instances" ([docs](https://grafana.com/docs/grafana-cloud/ai-tools/mcp-servers/cloud-mcp/)) | Service-account tokens work only with the local OSS `mcp-grafana`, not the hosted one | n/a hosted. OSS: `GET {base}/api/org` → `id` (org only; `/api/user` rejects SA tokens) | n/a | **OAuth only + stack URL** |
| globalping | `mcp.globalping.dev/mcp` | **OAuth or Globalping API token (Bearer)**. **Not anonymous**: the probe got 401, scope `measurements` ([repo docs](https://github.com/jsdelivr/globalping-mcp-server)) | Globalping API token (dash.globalping.io/tokens) | `GET https://api.globalping.io/v1/limits` | **none**: `rateLimit.*` + `credits.remaining` only (proves "authenticated", not who) | **Key works; identity cannot be proven** |
| linear | `mcp.linear.app/mcp` | **OAuth 2.1 (DCR) or API key / OAuth token as `Authorization: Bearer`** ([docs](https://linear.app/docs/mcp)) | Personal API key `lin_api_…` | `POST https://api.linear.app/graphql` `{ viewer { id } organization { id urlKey } }` with header `Authorization: <API_KEY>` (**no Bearer** on GraphQL) | `viewer.id`, `organization.id` (UUIDs) | **Key setup possible** |
| stripe | `mcp.stripe.com` | **OAuth or Agent API key (Bearer)**. **From 2026-10-31 only Agent-tagged restricted keys**; secret keys and untagged RAKs get 401 ([docs](https://docs.stripe.com/mcp)) | Agent-tagged restricted key `rk_live_…`/`rk_test_…` | `GET https://api.stripe.com/v1/account` (`GetAccount`, no ID: returns the key's own account) | `id` = `acct_…` (+ `livemode` implied by key prefix) | **Key setup possible** (agent keys only) |
| netlify | `netlify-mcp.netlify.app/mcp` | **OAuth** (AS is the MCP host itself; scopes `read write offline_access claudeai`). The PAT is documented only as an env var for the local `@netlify/mcp` ([docs](https://docs.netlify.com/build/build-with-ai/netlify-mcp-server/)) | PAT (REST) | `GET https://api.netlify.com/api/v1/user` (REST) | `id` | **OAuth** (PAT on hosted MCP undocumented) |
| prisma-postgres | `mcp.prisma.io/mcp` | **OAuth** (AS `auth.prisma.io`, scopes `workspace:admin offline_access`). Docs mention only browser sign-in ([docs](https://www.prisma.io/docs/postgres/integrations/mcp-server)) | Service token (Management API, REST only) | `GET https://api.prisma.io/v1/me` | `data.user.id` `usr_…`, `data.workspace.id` `wksp_…`, `data.credential.{type,id}` | **OAuth** (service token on MCP undocumented) |

## OAuth metadata (unauthenticated probe, 2026-10-11)

Every MCP endpoint returned `401` with `WWW-Authenticate: Bearer resource_metadata=…`. All 12 authorization servers publish a `registration_endpoint` (DCR) and PKCE `S256`.

| Provider | Resource metadata → AS | DCR endpoint | CIMD | Refresh grant | Scopes (AS) | Notes |
|---|---|---|---|---|---|---|
| cloudflare | `mcp.cloudflare.com` | `/register` | yes | yes | `offline_access user:read account:read` + ~400 granular | Public client (`none`) ok |
| supabase | `api.supabase.com` | `/platform/oauth/apps/register` | – | yes | `organizations:read projects:* database:* …` | Token auth only `client_secret_basic/post` (confidential); PKCE also `plain` |
| vercel | `vercel.com` | `api.vercel.com/login/oauth/register` | – | yes | `openid email profile offline_access` | **Client allowlist** despite DCR |
| neon | `mcp.neon.tech` | `/api/register` | – | yes | `read write` | Read-only also via `?readonly=true` |
| railway | `backboard.railway.com` | `/oauth/register` | yes | yes (`offline_access` + `prompt=consent`) | `workspace:* project:* openid …` | Access token 1 h |
| sentry | `mcp.sentry.dev` | `/oauth/register` | yes | yes | `org:read project:write team:write event:write alerts:write` | Path scoping `/mcp/{org}/{project}` |
| grafana | `mcp.grafana.com/mcp` (path issuer) | `/mcp/oauth/register` | yes | yes | `grafana:read grafana:query grafana:write` | Stack via `X-Grafana-URL` or `/mcp/<stack>.grafana.net` |
| globalping | `mcp.globalping.dev` | `/register` | no | yes | `measurements` | |
| linear | `mcp.linear.app` | `/register` | yes | yes | `read write openid email` | |
| stripe | `access.stripe.com/mcp` | `/mcp/oauth2/register` | – | yes | `mcp` | Token auth `none` only (public client); per-environment consent |
| netlify | `netlify-mcp.netlify.app` | `/oauth-server/reg` | – | yes | `offline_access read write claudeai` | |
| prisma-postgres | `auth.prisma.io` | `/register` | – | not advertised (`offline_access` scope in resource metadata) | not advertised | |

## Caveats per provider

- **openai**: Standard (project) keys have no whoami endpoint. The `openai-organization` header is not documented as a stable ID. Binding identity would need an Admin key, which has much broader power and should not be requested. The proof could bind key hash + origin, but it cannot name an account.
- **runway**: `/v1/organization` is free and confirms that the key works and has credits, but returns no org/user ID. The proof can only bind key hash + origin.
- **cloudflare**: `tokens/verify` returns the *token* ID, not the account. A user token needs `GET /accounts` (scoped to the accounts the token can see; there may be several), so the setup must pick or confirm one. A `cfat_` account token needs the account ID as input, and a 200 from `/accounts/{id}/tokens/verify` proves the binding. The general limit is 1200 req/5 min per user.
- **supabase**: `/v1/profile` has no OAuth scope tag in the spec, so a scoped/OAuth token may be refused. In that case fall back to `/v1/organizations` (`organizations:read`). `?project_ref=` disables account tools, and `?read_only=true` runs queries as a read-only Postgres role.
- **vercel**: DCR exists, but Vercel restricts MCP to clients it has reviewed. Orchestra would have to submit the client review form, and until approval the platform is unusable. A REST `/v2/user` key check would not unlock the MCP.
- **neon**: `/auth` is the best fit because it reports the credential *type*, so personal and org keys can be told apart. Pin `auth_method`. Project-scoped keys return only their owning org.
- **railway**: Only account tokens resolve `me`. Workspace tokens need `workspace(workspaceId:)`. Hosted MCP Bearer support for account tokens is undocumented, so treat it as OAuth until confirmed. GraphQL returns 200 on authorization failure.
- **sentry**: The hosted MCP's AS proxies Sentry OAuth, so a static user/org token cannot be used there. Self-hosted Sentry and EU-region specifics are not addressed by the hosted MCP docs.
- **grafana**: Hosted MCP covers Grafana Cloud only and needs the Assistant enabled plus the `grafana-assistant-app.cloud-mcp:access` permission (Editor+ by default). Self-hosted Grafana needs the OSS server, a user-supplied base URL and a service-account token. That host is outside the pinned table and would need a new base-URL design.
- **globalping**: Despite the public API, the hosted MCP rejects anonymous requests. The REST API itself works anonymously (250 tests/h per IP vs 500/h authenticated). No identity endpoint exists, and `credits` being present only proves the request is authenticated.
- **linear**: The MCP takes `Bearer <key>`, but GraphQL documents personal keys *without* `Bearer`. The verifier must use the raw key header for GraphQL. Rate limits are complexity-based and a `viewer` query is negligible.
- **stripe**: Plan for Agent keys only (the 2026-10-31 cutoff falls 20 days from now). `livemode` follows from the key prefix (`rk_live_`/`rk_test_`). Whether a RAK needs an explicit Account read permission for `GET /v1/account` is not documented, so check on first use. Connect use with `Stripe-Account` needs a RAK, not OAuth.
- **netlify**: The hosted MCP's OAuth AS is Netlify's own proxy. Do not assume a PAT works on it. A REST `/api/v1/user` check proves identity only for REST.
- **prisma-postgres**: `/v1/me` is ideal for identity (user, workspace and credential type), but it serves the Management API (a third-party source says service tokens never expire; unverified). The MCP is OAuth-only per its docs.

## Doc URLs

- Cloudflare MCP: https://developers.cloudflare.com/agents/model-context-protocol/mcp-servers-for-cloudflare/ ; verify: https://developers.cloudflare.com/api/resources/user/subresources/tokens/methods/verify/ , https://developers.cloudflare.com/api/resources/accounts/subresources/tokens/methods/verify/
- Supabase MCP: https://supabase.com/docs/guides/getting-started/mcp ; spec https://api.supabase.com/api/v1-json
- Vercel MCP: https://vercel.com/docs/agent-resources/vercel-mcp ; user: https://vercel.com/docs/rest-api/reference/endpoints/user/get-the-user
- Neon MCP: https://neon.com/docs/ai/neon-mcp-server ; spec https://neon.com/api_spec/release/v2.json (`/auth`, `/users/me`, `/users/me/organizations`)
- Railway MCP: https://docs.railway.com/ai/remote-mcp-server ; API: https://docs.railway.com/integrations/api ; https://railway.com/auth.md
- Sentry MCP: https://mcp.sentry.dev/ ; API auth: https://docs.sentry.io/api/auth/
- Grafana Cloud MCP: https://grafana.com/docs/grafana-cloud/ai-tools/mcp-servers/cloud-mcp/
- Globalping MCP: https://github.com/jsdelivr/globalping-mcp-server ; spec https://api.globalping.io/v1/spec.yaml
- Linear MCP: https://linear.app/docs/mcp ; GraphQL: https://linear.app/developers/graphql
- Stripe MCP: https://docs.stripe.com/mcp ; keys: https://docs.stripe.com/keys ; spec `GetAccount` `/v1/account` https://github.com/stripe/openapi
- Netlify MCP: https://docs.netlify.com/build/build-with-ai/netlify-mcp-server/ ; spec https://open-api.netlify.com/swagger.json
- Prisma MCP: https://www.prisma.io/docs/postgres/integrations/mcp-server ; spec https://api.prisma.io/v1/doc (`/v1/me`)
- OpenAI: https://developers.openai.com/api/docs/api-reference/introduction ; spec https://github.com/openai/openai-openapi
- Runway: https://docs.dev.runwayml.com/api/ ; spec https://docs.dev.runwayml.com/openapi.json
