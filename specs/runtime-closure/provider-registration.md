# W6: owned OAuth registration and probe requirements

Owner requirement: “nao, tem que aparecer orchestra”. A07/A08 cannot pass from an environment string or local fixture. This slice supplies internal wiring, not provider approval or operational closure.

## Wiring contract

`OwnOAuthApp.requireClientID` reads only `ORCHESTRA_OPENAI_CLIENT_ID`, `ORCHESTRA_COPILOT_CLIENT_ID`, `ORCHESTRA_XAI_CLIENT_ID`, or `ORCHESTRA_DIGITALOCEAN_CLIENT_ID`. Missing/blank values and all four known borrowed IDs fail with named registration errors containing only provider and environment key. API-key paths and plugin initialization do not require registration. Authorization captures the ID for its pending grant; refresh reads the same provider's configured ID. Keep that ID stable for existing credentials; changing registration requires a new login, not reuse of another app's tokens.

An arbitrary nonempty ID is not proof of ownership, registered name, granted scopes, entitlement, or allowlisting. No ID is invented here. Attribution headers, Codex originator, and Zen/Go transport retain their current protocol values.

## Provider forms and blockers (official documentation read 2026-10-07)

### OpenAI / ChatGPT

- [Partner client IDs](https://developers.openai.com/siwc/request-client-id): select commercial partners, with an official interest form; not unrestricted self-service registration.
- [OSS plan registration](https://developers.openai.com/siwc/token-sharing-open-source/sign-in): initial `dynamic_agent_client`, actual `agent_name_hint`, stable `ext_agent_host_id`; callback issues an account-associated ID. Do not put the registration entrypoint in the environment as an issued ID. Public flow uses PKCE S256, nonce and verified ID token; `http://127.0.0.1:1455/auth/callback` (not localhost), `/api/accounts/authorize`, `/api/accounts/oauth/token`, resource `https://api.openai.com/v1`; scopes `openid profile email offline_access resource.invoke chatgpt.tokens.use.direct`.
- Current Core/Codex implementation instead uses `/oauth/authorize`, `/oauth/token`, localhost callback, scopes `openid profile email offline_access`, and Codex-specific device endpoints. An issued OSS ID is not a drop-in compatibility claim. Lead must decide protocol migration or obtain explicit approval for existing endpoints/grants. [Codex authentication](https://developers.openai.com/codex/auth/) documents enabling device login in personal security settings/workspace permissions, not approval of Orchestra's app.
- Owner form: registration route/approval reference, registered name **Orchestra**, issued public ID, accepted callback/grants/scopes, ChatGPT plan/workspace, selected model, and permission to probe. Keep `originator: opencode` until the real ChatGPT-plan probe and owner decision.

### GitHub Copilot

- [Register an OAuth app](https://docs.github.com/en/apps/oauth-apps/building-oauth-apps/creating-an-oauth-app): choose owner, application name **Orchestra**, owned homepage/description, callback URL; enable Device Flow. [Authorization](https://docs.github.com/en/apps/oauth-apps/building-oauth-apps/authorizing-oauth-apps#device-flow) uses `/login/device/code` then `/login/oauth/access_token`, `read:user` as requested by current code, and `urn:ietf:params:oauth:grant-type:device_code`; device flow needs no client secret or callback exchange.
- Registration currently defaults to expiring tokens. Existing plugin stores the access token with `expires: 0` and has no refresh implementation; owner must identify token-expiration settings before use, or lead must approve refresh work. Ordinary GitHub OAuth success does not prove access to `api.githubcopilot.com` under that app ID; obtain GitHub confirmation of any app allowlisting and enterprise policy requirements, then prove entitled inference.
- Owner form: owning user/org, public client ID, registration/consent showing **Orchestra**, Device Flow setting, token-expiration setting, GitHub.com or enterprise host, Copilot-entitled account and applicable admin approval, model, probe permission.

### xAI

- [Official Grok Build guide](https://docs.x.ai/build/overview) documents browser authentication and API-key use; it does not establish a third-party SuperGrok OAuth app-registration procedure. [Official contact route](https://docs.x.ai/developers/faq/general) supplies the business form and `sales@x.ai`. Ask for a supported Orchestra client and subscription-inference entitlement; do not guess a registration API.
- Source requests RFC 8628 device authorization at `https://auth.x.ai/oauth2/device/code`, polls/refreshes `https://auth.x.ai/oauth2/token`, scopes `openid profile email offline_access grok-cli:access api:access`. No loopback callback. These are implementation requirements, not fresh provider confirmation. Ask xAI to confirm device/refresh grants, scopes, registered display name, and any allowlisting/referrer requirements.
- Owner form: xAI-issued public ID and approval reference, name **Orchestra**, confirmed grants/scopes, SuperGrok-entitled account, model and approved inference endpoint, probe permission. Loader-local single-flight does not solve cross-process rotating-refresh races.

### DigitalOcean

- [Official OAuth reference](https://docs.digitalocean.com/reference/api/oauth/) supports manual control-panel registration of confidential applications and documented dynamic registration of public clients. Public clients require authorization-code + PKCE S256; documented dynamic registration accepts `response_types: ["code"]`, `token_endpoint_auth_method: "none"`, authorization-code/refresh grants and registered redirect URIs. Registration remains an owner-authorized action, not executed here.
- Current plugin uses implicit `response_type=token`, `http://localhost:1456/auth/callback`, requested scopes `genai:read inference:query`, no refresh, and router listing every five minutes while bearer valid. Public-client registration therefore needs a lead-approved protocol migration; an environment ID alone cannot close this mismatch. [Scope catalog](https://docs.digitalocean.com/reference/api/scopes/) documents `genai:read`; obtain explicit confirmation for `inference:query` on OAuth grants. [Inference credentials](https://docs.digitalocean.com/products/inference/how-to/manage-model-access-keys/) documents model access keys or personal access tokens, not blanket OAuth-token compatibility.
- Owner form: team/app owner, registration route and issued public ID, name **Orchestra**, accepted grant/callback/scopes, confirmation OAuth bearer can list routers and perform inference, chosen router/model and funded team, probe permission. Never request a desktop-embedded client secret.

## Next-slice evidence, not yet performed

For each provider record public registration metadata and a redacted real consent screen displaying **Orchestra**, fresh login under that exact ID, entitled inference with a chosen model/endpoint, and refresh/re-login behavior supported by its actual grant. Record commit, UTC date, grant, host, scopes, status and result; retain no tokens, codes, credentials, or account-identifying screenshots. Establish provider approval/allowlisting where required rather than assuming it from a successful fixture.

Local HTTP fixtures prove request construction and named rejection only. Next operational slice needs explicit lead approval for account access, registration/consent, inference spend and refresh. Required inputs are the four issued public IDs, ownership/name evidence, provider grant/scope/callback confirmations, entitled test-account access through an approved channel, chosen models/endpoints, and per-provider spend/time budgets. A08 remains **NOT COMPLETE**; A07 live attribution compatibility is also pending.
