# AC-06 — cinco casos minerados

Pin de leitura e pai do commit: `1cde2ff7a71bcf7aecb5d030917b577165135d38`. Branch de destino: `mine-ac06`.

O dossiê registra evidência histórica de reconstrução mecânica pelo executor real. Nenhuma corrida foi executada neste pin. O run [42684897357](https://github.com/gustavomhss/hugr-orchestra/actions/runs/42684897357), head `c67e97cf78b266d36cecd6a4b1e6b6b65639795b`, foi consultado; seu artefato 13705305312 foi baixado e o SHA-256 conferido contra a API. Os cinco casos nomeados passaram nesse run. Isso não constitui PASS global nem aprovação semântica de produção.

## Resultado por obrigação

| Caso | Conjunto afetado exigido pelo teste | Rebuild mecânico | Conteúdo comparado independentemente |
|---|---|---|---|
| behavior edit / RB-02 | z, a, m | Candidato completo | Corpos de z, a e m |
| added source / RB-03 | z, a, m | Candidato completo; nova fonte no receipt | Corpo de z; a/m não comparados |
| removed source / RB-04 | z, a, m | Candidato completo; fonte retirada, membership conservado | Corpo de z; a/m não comparados |
| intent-doc change / RB-06 | a, m | Candidato completo; execução observada; z/i preservados | Nenhum corpo novo comparado no caso |
| recipe change / RB-07 | Não asserido; a,m é esperado pelo grafo | Candidato completo; função alternativa fornecida; binding conferido | Corpo de a; m não comparado |

As constantes são independentes do planner. `calls` não preenche `affected`. O executor só devolve candidato depois de produzir os objetos, validar os bindings e ler todo o inventário. Essa conclusão mecânica não verifica, sozinha, que cada corpo contém o conhecimento esperado.

As observações e listas dos testes RB são fixtures; não se afirma uma execução integrada de filesystem real → observador → rebuild. Os reviews declaram proveniência sintética. O contrato G2.2 §2.5 admite receita determinística com transformação efetiva dentro desse aceite técnico. Em RB-07 a função alternativa retorna texto literal: o caso verifica sua execução e o binding fornecido, sem provar um loader que transforme bytes vinculados em callable.

## Evidência e continuidade

- [Cinco casos e recibo](mine-ac06.receipt.json): cada caso contém fontes `path:blob` lidas no pin, expectativas, assertions reais, lacunas e limites.
- [Extrato do CI](evidence/ci-42684897357.json): metadados confirmados, registros selecionados copiados do relatório original, ponteiros JSON, hashes do ZIP/relatórios e controles que rejeitaram input/edge omitidos. O mutant `rebuild-return-old-result` falhou nominalmente em RB-02.
- [Reconciliação de fontes](evidence/source-reconciliation.json): fixture e cinco casos são byte-idênticos ao head do run. O arquivo de testes inteiro mudou: RB-14 ganhou o binding de z.ts na linha 417. Esse reforço não recebe retroativamente execução histórica.

TC-05 lê um body de intenção sob uma receita específica de ABA. Ele é crédito adicional separado, não um recibo combinado que preencha o conteúdo ausente de RB-06. RB-05 apoia a estabilidade da remoção/recriação, sem abrir uma sexta contagem nem outra fatia.

## Correção do enquadramento

O mapa anterior respondia a uma pergunta mais restrita sobre aceite nominal. Exigir nova prosa do juiz repetindo cada mudança/conjunto não é uma exigência adicional deste pedido. A evidência de reconstrução mecânica e o aceite F1 delimitado já existem. O próprio mapa anterior reconhecia esse crédito; seria impreciso dizer que afirmava haver apenas detector de staleness.

As lacunas concretas permanecem visíveis: intent não tem oráculo dos corpos a/m; recipe não asserta affected e não verifica o corpo m; adição/remoção verificam o conteúdo de z, sem comparação independente de a/m. Os contraexemplos em intent/recipe são análises, não mutantes executados. Nenhum conjunto de outro grafo, retorno de calls ou green geral é usado para preencher esses campos.

AC-03 permanece fechado; old-producer permanece INDETERMINATE. Identidades são comparadas por igualdade, sem inventar ordem de versões. Nenhum sidecar untrusted foi servido. Não houve novo dispatch de CI/produtor/juiz de campanha; os três subagentes desta mineração constam do recibo. Custos monetários não disponíveis não são apresentados como zero.
