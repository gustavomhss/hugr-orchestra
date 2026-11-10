# zizmor catalog classification (2026-11-09)

Decision by Astra, per owner directive. The lead executes and cold-checks.

## Astra verdict (verbatim)

> C — classe por regra; severidade por achado, com conversão explícita e curada no catálogo.
>
> Para artipacked, proponho Low → P3, Medium → P2, High → P1, preservando também a
> severidade nativa no achado.
>
> A máxima superestima os achados leves; a típica pode rebaixar os graves. A prioridade
> deve acompanhar a condição efetivamente detectada.

## Verified source facts

- `crates/zizmor/src/output/sarif.rs`: `ResultLevel::from(Severity)` maps
  `Informational → note`, `Low → note`, `Medium → warning`, `High → error`.
  `ResultKind` maps `Informational → review`, others → `fail`.
- `crates/zizmor/src/finding.rs`: `Severity` is `Informational | Low | Medium | High`;
  `FindingBuilder::new` defaults to `Severity::Low`.
- `crates/zizmor/src/audit/artipacked.rs`: severity is per finding (Low/Medium/High by
  checkout version and upload presence). Other audits set severity per finding as well.

## Contract implemented

`packages/core/src/review-toolkit/sarif.ts`:
- `Raw.nativeSeverity?: string` carries the native spelling.
- `SarifResult.level` is decoded; `parseSarif` copies it into `Raw.nativeSeverity`.
- `RuleInfo.severityByNative?: Record<string, Severity>`; `Lookup` takes the native severity.
- `toItems` passes `raw.nativeSeverity` to the lookup.

`packages/core/src/review-toolkit/analyze.ts`:
- `rules()` resolves `entry.severity[nativeSeverity] ?? entry.severity["*"] ?? first`.

## Curated conversion (per Astra)

Native zizmor severity → P severity:

| Native | P |
|---|---|
| `note` (SARIF level for Informational/Low) | P3 |
| `warning` (Medium) | P2 |
| `error` (High) | P1 |

The catalog key is the SARIF `level` spelling, which is the `Raw.nativeSeverity`
value the normalizer produces.

## Class mapping

Each zizmor rule maps to one catalog class. The class set is the existing catalog's
`security.ci`, `security.supply-chain`, `security.secret`, `security.boundary`,
`logic.invariant`, `logic.contract`, `concurrency.order`, `reliability.rollback`,
`contracts.third-party`.
