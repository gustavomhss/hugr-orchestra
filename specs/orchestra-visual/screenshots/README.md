# Current-dev candidate screenshots

Captured from the `identity-integration` production frontend on
`fork/dev@da2b75aff12e21c9974ebc5be41ae138302de40b`, after the four scoped
Godfile extractions. The existing built bundle is served without CSS overrides.
The geometry/profile-portal tests use deterministic backend fixtures and real
application components at 1400×900, DPR 1. These images show the renderer, not
AppKit window controls or real-provider execution.

| Theme / direction | Capture |
| --- | --- |
| Dark / LTR | [dark-ltr.png](dark-ltr.png) |
| Light / LTR | [light-ltr.png](light-ltr.png) |
| Dark / RTL | [dark-rtl.png](dark-rtl.png) |
| Light / RTL | [light-rtl.png](light-rtl.png) |

Source test: `packages/app/e2e/orchestra/identity.spec.ts`, four `frozen glass`
cases. The test closes the profile portal before each capture. Original
source-branch captures and historical benchmarks remain separately indexed in
`../VERIFICATION.md`.
