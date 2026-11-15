## REQUEST_EVIDENCE — automation-1, §§0–3 do corpo v2

**Juiz:** `parallel-v3-fresh/S1-03/J2`  
**Execução:** `34269cf4-d631-41c5-a30b-85b0ec217390`

**Candidato avaliado neste lote:** recorte §§0–3 do corpo automation v2, **59.953 bytes**, SHA-256 `e9c89bea68d594bc61356ff461642ea23cd905d4584f2b52d32e10a5af984e55`, Git blob `b8fec4854b4c1384d3c4a2a4f0d51d220c874618`.

As **seis partes** e o **FIM_DO_LOTE externo** foram recebidos. A complementação resolve os pedidos de evidência comportamental deste recorte. **Permanece uma falta obrigatória: a projeção individual da população atual de 204 fontes.**

### Pedidos encerrados

**RE-AUT1-02–06 — encerrados para o alcance deste lote.** Os trechos agora permitem examinar a composição da fachada e o binding, estado físico e persistido, leitores e paginação, interpretação limitada de YAML/grafos, autoria com precondições e qualificação posterior à escrita, além do ledger e do reconciliador efetivamente utilizado. Os schemas externos necessários estão identificados como fontes brutas de S1-04, sem ampliar a população local nem conceder aceite ao artefato daquele dono. [AUT1-C01–C45; AUT1-X01–X07.]

A correção sobre a fachada está sustentada: resolução de binding, inicialização cached de operations e carregamento de output são adiados; transport, readers e resources são compostos durante `make`. A mesma frase no erratum de coverage corrige o rótulo amplo anterior sem acrescentar uma afirmação comportamental. [AUT1-C01–C02; delta literal 1; erratum.]

Também está demonstrada a distinção decisiva entre execução e observação: o ledger restringe a execução à transição elegível de `prepared` para `sending`; `reconcile` chama o observador e não o callback de envio. Os acknowledgments concretos não fabricam uma nova tentativa de GitHub ou GitLab para satisfazer a confirmação genérica. [AUT1-C31–C36; AUT1-C39–C44.]

**RE-AUT1-01 — componente histórico encerrado.** O corpo histórico integral, seus gaps e a projeção de sua disposição anterior foram fornecidos. A leitura nova não apaga os estados históricos de orientação, representação de família ou ausência de leitura. [AUT1-H01–H04.]

### Única evidência obrigatória ainda ausente

**RE-AUT1-01 — componente do censo corrente permanece aberto.**

AUT1-H04 apresenta a disposição **histórica agregada** das 204 fontes. O cabeçalho remete a `review-supplement-1-index.json#/shared_population_reconciliation`, mas os **204 registros individuais correntes** não aparecem no material recebido neste lote. O erratum fornece apenas a alteração de `role` e `reason` da primeira row.

Para encerrar o pedido, falta transportar a **projeção mecânica integral dessas 204 rows**, identificando, por fonte, o path, papel/necessidade, profundidade ou estado de leitura e vínculo às seções pertinentes do corpo, com a identidade do coverage correspondente. Pode ser a projeção original acompanhada do erratum já recebido; não é necessária nova redação do corpo ou repetição dos trechos de código.

Essa pendência corresponde a **CC-1/7, QS-4/5 e suficiência local AC-01**. Não identifico novo achado obrigatório de conteúdo nas afirmações examinadas. Os demais pedidos comportamentais ficam encerrados, preservados os limites de observação estática e de autoridade.

O parecer permanece restrito a **automation-1**. Não concede PASS ao corpo automation inteiro nem encerra os pedidos dos lotes automation-2, automation-3 e automation-4.