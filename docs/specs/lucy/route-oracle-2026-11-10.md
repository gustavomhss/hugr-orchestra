# Next block after partial acceptance (2026-11-10)

Verdict by Astra via the browser. The hold stays. This file records the order.
It does not yet record execution evidence for the candidate that implements it.

## Verbatim verdict

> VEREDITO: OUTRO — corrigir a regressão do teste de contrato do roteamento de oxlint, antes do bloco de integração de zizmor e da qualificação final do tip.
>
> Base obrigatória: 7f5ace4007744365874b9ad6dce655ba282923b6. Todas as referências de código abaixo estão nesse SHA.
>
> Encontrei uma contradição concreta fora dos três contraexemplos já encerrados: a fixture principal altera src/jobs/drain.ts; o catálogo atual torna essa alteração elegível para oxlint em Standard; porém o teste exige uma lista exata de packs que omite oxlint. É uma contraprova por leitura do código, sem execução de teste. O aceite parcial anterior permanece.
>
> Critérios de aceite
>
> Corrigir o oráculo literal do cenário existente, preservando a fixture e o comportamento de produção. A expectativa de packs deve incluir { id: "oxlint", source: "catalog", lane: "no-build", status: "routed" }. A alteração TypeScript está em packages/core/test/review/route-fixture/owner-example.json:3–14; a elegibilidade está em packages/core/src/review/catalog/oxlint.ts:15–27; a seleção ocorre em packages/core/src/review/route.ts:250–263. Contraexemplo 1: a lista exigida em packages/core/test/review/route.test.ts:59–64 contém somente gitleaks, repo, ast-grep e squawk; a rota atual acrescenta oxlint.
>
> Manter o teste independente e preservar os controles de elegibilidade. Continuar comparando o registro completo com valores esperados explícitos. Preservar a cobertura de Standard/Deep, Quick e mudanças sem arquivos-fonte em packages/core/test/review/oxlint-catalog.test.ts:49–60. Contraexemplo 2: retirar a mudança .ts da fixture, filtrar oxlint antes da comparação, substituir a igualdade completa por uma comparação parcial ou montar o esperado a partir do resultado esconderia a divergência. Remover oxlint do roteamento de produção também contrariaria o comportamento já documentado em docs/guides/review.md:138.
>
> Apresentar evidência específica para o novo candidato deste bloco. Exigir SHA integral descendente de 7f5ace4007, typecheck de @orchestra/core e execução verde de test/review/route.test.ts e test/review/oxlint-catalog.test.ts. Para test:ci, registrar separadamente o SHA candidato e o headSha real, comprovando equivalência das árvores com única adição de .ci-run.json, cujo conteúdo deve nomear os testes executados. Contraexemplo 3: o verde anterior de 42 testes não fecha esta pendência: o pedido daquele run não inclui test/review/route.test.ts.
>
> Manter este bloco limitado à correção da expectativa e à sua comprovação. O catálogo zizmor continua elegível conforme packages/core/src/review/catalog/zizmor.ts:60–69, e a ausência de dispatch permanece explícita em packages/core/src/review-toolkit/analyze.ts:220–248. Contraexemplo 4: tornar o teste de roteamento verde não demonstra execução nativa de zizmor nem qualificação final do tip.
>
> HOLD mantido. Este bloco não inclui registro de controller, reversão do catálogo, mudança em script/test-ci.ts ou merge.

## Cold-check of the order

The citations on `7f5ace4007` match the files. `route.test.ts:59–64` omitted oxlint.
`docs/guides/review.md:138` does say changed JS/TS on Standard or Deep can route oxlint.
`analyze.ts:220–248` dispatches squawk, ruff, actionlint and oxlint, then gitleaks and
ast-grep; zizmor is not among them and falls through to `not-built` at line 233.
The cited range is the dispatch list, not a zizmor comment.

## Implementation started

Candidate under test: `native-severity` `b71683ea9aa97cf50ee1092fc01558b7e3eb6532`.
The only change is the oxlint row in the existing full-record expectation.
Production route, fixture, catalog and controller are unchanged.
Typecheck dispatched: `42826603244`. `test:ci` of `route.test.ts` and
`oxlint-catalog.test.ts` was started and is not yet evidence in this file.
