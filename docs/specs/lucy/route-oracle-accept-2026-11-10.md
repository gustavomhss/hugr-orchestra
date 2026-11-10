# Acceptance of the oxlint route oracle (2026-11-10)

Verdict by Astra via the browser. The lead cold-checked the citations against
`b71683ea9a` and the runs against `git`/`gh`. The hold stays. This closes only
the route-oracle block.

## Read

- Candidate: `native-severity` `b71683ea9aa97cf50ee1092fc01558b7e3eb6532`
- Receipt he was given: `snapshot-lucy-audit-20261110` `6fa4bc48313a901a51387d6dea468d00bb79cb18`
- Thread: https://chatgpt.com/c/6af245b9-6190-83e9-9c9e-1795a54f97ff
- Model button: Esforço de raciocínio 6 Pro

## Verbatim verdict

> VEREDITO: ACEITE
>
> CONFERE — Correção literal, com fixture e produção preservadas. O
> commit b71683ea9aa97cf50ee1092fc01558b7e3eb6532 tem como pai 7f5ace4007744365874b9ad6dce655ba282923b6 e altera somente uma linha: acrescenta oxlint depois de squawk em
> packages/core/test/review/route.test.ts:59–65. A chamada real a ReviewRoute.route e a comparação do registro completo continuam em
> linhas 30–68. Fixture, rota de produção, catálogo e controller permanecem intactos. Contraexemplo 1, fechado: a expectativa deixou de omitir oxlint.
>
> CONFERE — Independência do oráculo e controles de elegibilidade preservados.
> packages/core/test/review/oxlint-catalog.test.ts:49–60 permanece inalterado: exige oxlint nas extensões elegíveis em Standard/Deep, exclui README.md, SQL e alteração apenas de package.json, e exclui oxlint em Quick. Contraexemplo 2, fechado: não houve retirada da mudança TypeScript, filtragem do resultado, comparação parcial no cenário principal ou construção do esperado a partir da própria saída.
>
> CONFERE — Evidência específica deste candidato. O
> typecheck 42826603244 terminou com sucesso para @orchestra/core, com headSha igual ao candidato. O
> test:ci 42827399846 executou os dois arquivos exigidos, incluindo o cenário de
> packages/core/test/review/route.test.ts:30–69: 67 pass / 0 fail, 189 assertions, Ubuntu 24.04, Bun, runner GitHub Actions 1000047355. Seu headSha real é 5905bf058e64fb4f1ec777fe923223bc9cc22152. Comparei a
> árvore candidata com a
> árvore testada: a única diferença é a adição de
> .ci-run.json:1, que declara core, bun, os dois testes, timeout 120000 e env: {}. Contraexemplo 3, fechado: há prova nova que inclui route.test.ts; o vínculo com o candidato é por equivalência de conteúdo, sem atribuir ao run o SHA candidato.
>
> CONFERE — Escopo e limites da conclusão preservados. O dispatch em
> packages/core/src/review-toolkit/analyze.ts:220–248 continua sem controller zizmor e mantém o fallback not-built. O log do run registra Omni como not applicable, sem teste declarante, spawn ou delegação. Contraexemplo 4 permanece como limite respeitado: esse verde demonstra o contrato de roteamento coberto pelos testes; não demonstra execução nativa de oxlint ou zizmor nem qualificação final do tip.
>
> HOLD mantido. Este ACEITE encerra apenas o bloco do oráculo de rota. Não autoriza controller zizmor, qualificação do tip, reversão, alteração de script/test-ci.ts, merge ou novo bloco.

## Cold-check

| Claim | Disposition | Evidence |
|---|---|---|
| Parent is `7f5ace4007`; only `route.test.ts` changed, one insertion | CONFIRMED | `git show` and `git diff --name-only` |
| Oxlint row is at `route.test.ts:64`, inside the full-record expectation at `:30–68` | CONFIRMED | file on `b71683ea9a` |
| `oxlint-catalog.test.ts:49–60` unchanged in this commit | CONFIRMED | that file is not in the diff |
| Typecheck `42826603244` succeeded on the candidate SHA | CONFIRMED | `gh run view` |
| Run `42827399846` is Ubuntu 24.04, bun, 67/0, 189 assertions, headSha `5905bf05` | CONFIRMED | workflow log and `gh run view` |
| Tree differs only by `A .ci-run.json` | CONFIRMED | `git diff-tree -r --name-status` |
| `.ci-run.json` names the two test files, core, bun, timeout 120000, empty env | CONFIRMED | `git show 5905bf05:.ci-run.json` |
| Omni not applicable, no declaring test, no spawn | CONFIRMED | the run log |
| `analyze.ts:220–248` still has no zizmor controller | CONFIRMED | unchanged since `7f5ace4007`; zizmor is absent from that dispatch list and the fallthrough is `not-built` at line 233 |

## Still open

- Hold. No controller, no tip qualification, no merge, no next block authorized by this acceptance.
