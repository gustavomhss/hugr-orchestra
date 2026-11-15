## Parecer — rodada 4d

**PASS para D15 e D18. Os dois findings ficam resolvidos por fonte, mantendo os claims inalterados.**

| Domínio | Decisão e evidência |
|---|---|
| **D15 — Maestro** | **PASS.** A apresentação conjunta de `Definitions` e `DurableOnlyDefinitions` permite verificar a diferença entre as duas listas declaradas. Isso completa o suporte que faltava, sem inferir comportamento de publicação, entrega ou replay. |
| **D18 — Lean** | **PASS.** A função completa mostra que a condição inicial rejeita registros com `return undefined`; chama `counts(root.bytes)` e recusa `!bytes`. Para tokens estimados, `estimated(token)` também chama `counts` e propaga a invalidez. Fica demonstrada a aplicação das verificações de forma, elegibilidade e aritmética no caminho de decodificação. Isso não estabelece a verdade das métricas fornecidas. |

**Estado agregado B3: PASS no escopo de disposição domain-level de fonte dos 24 domínios, com os 190 membros declarados e vinculados pela principal.** Não resta finding ativo contra os claims locais atuais nesse escopo.

Preservo os PASS anteriores e os limites de **QS-1/2/4/5/6, CC-3/7 e GO-I1/2/7/8**. As especificidades retiradas continuam **`RETIRED_EXTRA_CLAIM`**, sem serem declaradas resolvidas por fonte.

**O reúso dos nove corpos e o L1 integral continuam pendentes.** As remissões de D07 e D24 não antecipam o aceite dos corpos referenciados. Nenhuma execução, teste ou garantia externa foi concedida.
