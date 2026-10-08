# Orchestra DigitalOcean public registration

Lead reports official registration HTTP 201. Public client ID: `8927d6fd39836377289fc753b996b8bb7a9f71870f0a2b01ddf1f45d7d9bc3cb`.
Registered name: **Orchestra**. Homepage: https://github.com/gustavomhss/hugr-orchestra.
Registered redirects: `http://127.0.0.1:1456/auth/callback` and `http://localhost:1456/auth/callback`.
Public client: `token_endpoint_auth_method=none`; authorization-code and refresh-token grants. No management credential belongs in this repository.

Protocol: https://docs.digitalocean.com/reference/api/oauth/ (last verified 28 September 2026); PKCE S256, one-hour public access tokens. The bundled default uses this issued ID; an explicit environment override is still validated. Credentials retain the bound client ID and granted scopes, so refresh does not follow later environment changes. Legacy OAuth metadata changes require lead regeneration of the public SDK/Client.

**NO CONSENT YET.** Registration is not A08 closure. Requested `genai:read inference:query`, router enumeration and OAuth-bearer inference eligibility still require lead-owned real user consent and operational probes. No user authorization, real token refresh or inference was performed for this slice.
