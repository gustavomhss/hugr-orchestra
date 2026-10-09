# Service provider filter provenance

`providers.ts` copies metadata-only `defaultExcluded` presets from
`packages/capability-assets/src/providers.ts` at Orchestra baseline
`e3df2618d070a0ed2e2e20971fc6a277c46a8ded`.

Upstream: https://github.com/NousResearch/hermes-agent
at `134e08ca6d272c9b9610ce5889e2ecff9c73adf0`, MIT.
License notice: `packages/capability-assets/licenses/hermes.LICENSE`;
license blob `75410e73319c72cd3e991a501c5455eb78f38375`.

Catalog records A13–A24 identify `optional-mcps/{provider}/manifest.yaml`:
cloudflare, supabase, vercel, neon, railway, sentry, grafana, globalping,
linear, stripe, netlify, prisma-postgres. Runtime ID `prisma_postgres`
normalizes the upstream hyphenated name.

Only names and exclusion patterns are copied. No endpoint, OAuth configuration,
credential, account scope, discovered schema, execution authority or qualification
receipt is supplied by these presets. Filtering preserves original full catalog
generation, coverage, byte count and retained descriptor schemas. These records
establish source provenance, not live vendor acceptance.
