# Partial acceptance of block A (2026-11-10)

Verdict by Astra via the browser, after the refusal of `6726d91f5e`. The lead
cold-checked the citations against `7f5ace4007` and the runs against `git`/`gh`.
This is not a tip release. The hold stays.

## Read

- Candidate: `native-severity` `7f5ace4007744365874b9ad6dce655ba282923b6`
- Receipt he was given: `snapshot-lucy-audit-20261110` `258368c842ec96e13d6736f91a5f066ac05b29fa`
- Thread: https://chatgpt.com/c/6af245b9-6190-83e9-9c9e-1795a54f97ff
- Model button: Esforço de raciocínio 6 Pro

## Verbatim verdict

> VEREDITO: ACEITE PARCIAL
>
> CONFERE — Contraexemplo 2, bloqueante, fechado. Em
> packages/core/src/review-toolkit/analyze.ts:755–768, tanto "*" quanto o nível passam por ownSeverity: a propriedade precisa ser própria (Object.hasOwn) e seu valor precisa ser exatamente P0, P1, P2 ou P3. Assim, os nomes herdados "toString" e "constructor" deixam de produzir uma prioridade e chegam a severity-unmapped. A regressão em
> packages/core/test/review-toolkit/zizmor-severity.test.ts:51–60 cobre esses dois nomes, undefined e "critical"; exige ausência de itens e exclusões, raw preservado em unresolved e retorno explícito de bind com failed: "severity-unmapped".
>
> CONFERE — Contraexemplo 1, fechado. Os três achados agora variam somente em level: regra, mensagem, localização e snippet "persisted credential" permanecem iguais. O teste usa ReviewAnalyze.rules(ReviewCatalog.current), passa por parseSarif e verifica nativeSeverity, prioridades P3/P2/P1, classe estável security.secret e sucesso de bind. Referências:
> packages/core/test/review-toolkit/zizmor-severity.test.ts:7–29 e
> linhas 32–43.
>
> CONFERE — Contraexemplo 3, fechado. O teste removeu a comparação com oxlint.pack e oxlint.rules. O1 voltou a declarar os valores esperados; O2 compara as regras do catálogo com RULES, uma tabela literal independente que fixa typescript(no-explicit-any) em P3. A conversão por JSON preserva essa independência: uma alteração dessa prioridade no catálogo diverge do literal esperado. Referências:
> packages/core/test/review/oxlint-catalog.test.ts:1–16,
> linhas 23–34 e
> linhas 37–40.
>
> Evidência conferida para este candidato: o
> typecheck 42822045452 terminou com sucesso para @orchestra/core, com headSha igual a 7f5ace4007744365874b9ad6dce655ba282923b6. O
> test:ci 42822565653 registra Ubuntu 24.04, Bun, 42 pass / 0 fail, 337 assertions e 284 omni spawns, com headSha real 4cd2169400b95d0c799979f0051ff93ddca4e65e. A
> árvore candidata e a
> árvore testada diferem somente pela adição de
> .ci-run.json, com core, bun, os quatro arquivos declarados, timeout 120000 e env: {}. O vínculo é por equivalência de conteúdo.
>
> HOLD mantido. O aceite parcial limita-se ao fechamento dos três contraexemplos em 7f5ace4007; a recusa de 6726d91f5e permanece registrada. Nenhuma das demais ações está autorizada.

## Cold-check

| Claim | Disposition | Evidence |
|---|---|---|
| `analyze.ts:755–768` is `ownSeverity` with `Object.hasOwn` and `P0`–`P3` | CONFIRMED | Those lines on `7f5ace4007` |
| Negative regression covers `toString`, `constructor`, missing and `critical` | CONFIRMED | `zizmor-severity.test.ts:51–60` |
| Three findings vary only `level`; snippet is `persisted credential` | CONFIRMED | `zizmor-severity.test.ts:34–36` |
| Resolver is `ReviewAnalyze.rules(ReviewCatalog.current)` | CONFIRMED | line 7 |
| Oxlint oracle is the literal `RULES`, with `no-explicit-any` at `P3` | CONFIRMED | `oxlint-catalog.test.ts:8–11` and `:39` |
| Line range `23–34` is only the O1 literal | PARTIAL | `:23–32` is the literal; `:33–34` are the template id and the schema decode. The semantic claim holds. |
| Typecheck `42822045452` succeeded on the candidate SHA | CONFIRMED | `gh run view` |
| Run `42822565653` is Ubuntu 24.04, bun, 42/0, 337 assertions, 284 omni spawns, headSha `4cd21694` | CONFIRMED | workflow log and `gh run view` |
| Tree differs from `7f5ace4007` only by `A .ci-run.json` | CONFIRMED | `git diff-tree -r --name-status` |
| `.ci-run.json` names core, bun, the four files, timeout 120000, empty env | CONFIRMED | `git show 4cd21694:.ci-run.json` |

## Still open

- Hold on the tip. `7f5ace4007` is not on `native-oxlint-map`.
- Zizmor routing to `not-built` and tip qualification are not closed.
- No controller, no catalog revert, no `script/test-ci.ts` change, no merge.
