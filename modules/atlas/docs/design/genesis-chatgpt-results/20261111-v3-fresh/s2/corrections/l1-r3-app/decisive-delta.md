# Decisive delta — app-session L1 r3

Execution: `46d09d97-39a9-482a-a290-646ba1d94c99`. Source pin: `1cde2ff7a71bcf7aecb5d030917b577165135d38`. Canonical r2 body: `0cacdbe33f21ceda94bddd725588a45ba10ac4945195d4f9b9794e2b0c1cc0bc`.

These are exact normative witnesses from existing connector captures. Their status is prescribed maintenance authority; no product change, generation, benchmark or test execution is inferred. Existing r2 evidence, including E01 and E15, remains unchanged.

## R3-N01 — App-shell priorities and benchmark condition

Prescribed priority order and before/after production-benchmark condition for session or timeline changes. This is authority, not an executed benchmark.

Source: `packages/app-shell/AGENTS.md`; commit `1cde2ff7a71bcf7aecb5d030917b577165135d38`; Git blob `a2bbdc5cb79a2fa1fc6bbcfea72c96e0d29130fe`; SHA-256 `a41f7ec47513e9a399d9ef066fbdb20ffaae712fcbb0c1881e1701cfaf76d15d`.

Exact lines 1–4:

```md
## Priorities

- Prioritise, in this order: stability, simplicity, performance.
- Before changing session or timeline code, record a production benchmark baseline and compare it after the change.
```

## R3-N02 — Session UI local authority

Local localization obligations. This file does not supply the app-shell benchmark condition or a Client dependency exception.

Source: `packages/session-ui/AGENTS.md`; commit `1cde2ff7a71bcf7aecb5d030917b577165135d38`; Git blob `678ae1bf90d8466fc47859eb01678d9e31586133`; SHA-256 `60bfa8f3ae4ad8e65a15247074ae0c105712b352990dac4b1f9463c1de4a58e7`.

Exact lines 1–7:

```md
## Localization

- NEVER hardcode user-visible English strings in production code. ALWAYS use an i18n key for visible copy, placeholders, accessible labels, tooltips, menus, dialogs, empty states, and displayed errors.
- When migrating existing copy to i18n, preserve the English text byte-for-byte unless the task explicitly requests a copy change.
- NEVER change existing English text or English keys to facilitate translation. English is intentional, designer-written source copy; adapt locale-specific translations and i18n mechanics around it.
- Do not translate from model knowledge alone. Verify terminology and grammar with Unicode CLDR locale/plural data, Microsoft Localization Style Guides and terminology, Apple localization/style guidance and localized platform UI, Mozilla localization style guides, Mozilla Pontoon, and the Firefox localization corpus at `github.com/mozilla-l10n/firefox-l10n`.
- Also use the relevant language authority or official dictionary for the locale (for example RAE/Fundéu, FranceTerme, Duden, TDK, Kotus/Kielitoimiston sanakirja, Språkrådet/Bokmålsordboka, Rada Języka Polskiego/PWN, the Russian and Arabic language academies, the Ukrainian Orthography, Taiwan MOE dictionaries, or the Royal Society of Thailand). Treat the English dictionary as the semantic source of truth and preserve placeholders, code identifiers, product names, and keyboard labels.
```

## R3-N03 — Generated Client and runtime dependencies

Root requires regeneration after a public Protocol/Server HttpApi change, forbids direct generated-file editing, and forbids Client runtime dependencies on Core/Server. Existing E01 supplies the distinct UI browserSafe exception.

Source: `AGENTS.md`; commit `1cde2ff7a71bcf7aecb5d030917b577165135d38`; Git blob `ef3b523b0c00aed722582b870c1919188edc4c4f`; SHA-256 `07acaefb95db4b07b4e76c4255f7d6e0ecc4c7466b46fbf6ec5e5cdf6cc01b4f`.

Exact lines 1–2:

```md
- After changing the public Protocol or Server `HttpApi`, run `bun run generate` from `packages/client`. Do not edit `src/generated` or `src/generated-effect` directly.
- Keep runtime dependencies directed from Schema to Core and Protocol, then from Core and Protocol to Server. Client runtime code may depend on Schema and Protocol but never Core or Server; `sdk-next` composes Client, Core, and Server.
```

## Existing retry witness retained

The revised admission sentence uses the unchanged canonical `E15 — Core admission and retry equivalence`: `packages/core/src/session/input.ts:59–62` returns the existing admission after its equivalence guard; `291–302` compares delivery, session and encoded prompt; `304–316` adds promptContext and timeCreated for projection equivalence. No new source or test is required for this correction. Its exact source/evidence hashes are bound in `sources-delta.json`.

