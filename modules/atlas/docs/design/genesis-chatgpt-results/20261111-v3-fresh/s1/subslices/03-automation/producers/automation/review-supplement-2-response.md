# Resposta original do produtor — suplemento2

Entreguei os trechos literais adicionais para os seis grupos públicos de J1 e os quatro grupos públicos de J2 em automation-2 (§4–5). O índice distingue os namespaces: J2-01 → J1-01/02; J2-02 → J1-03/04; J2-03 → J1-05; J2-04 → J1-06.

São **45 blocos novos**, relativos a **44 fontes Core já capturadas e um schema externo**, com **28 blocos únicos do suplemento1 reutilizados** por identidade/offset/hash. A união mecânica dos paths Core com trechos nos suplementos1–2 tem 83 implementações Actions; isso não é aceite semântico. Não refiz o censo204 nem repeti o histórico: a reconciliação compartilhada continua no índice congelado do suplemento1.

O caminho de partial content está literal em `AUT2-C39`, `output/index.ts` linhas43–50: após `OutputDownload.open(..., true)`, o chamador recusa status206 ou content-range antes de devolver response.body. `AUT2-C42/C43`, `AUT2-C35/C38` completam download/URLs assinadas/HTTP/processo e a finalização. Isso é observação de fonte, sem download ou execução de provider.

O schema adicional `packages/schema/src/actions/resource.ts` está em `external-sources/`, com manifesto próprio `external-source-captures-supplement-2.json`. Dono S1-04, baseline fixado, fora204/462; não modifica a receita v2 nem o manifesto externo anterior. A principal deve registrar esse input bruto adicional na materialização pertinente; não há aceite de artefato Schema.

Corpo v2 SHA256: `e9c89bea68d594bc61356ff461642ea23cd905d4584f2b52d32e10a5af984e55`. Receita v2 SHA256: `2bed1778e629415d5bc7c818773ef18b012a8a0bd4239d5bc85db6642b41a80e`. Ambos, suplemento1, seus índice/recibo e as capturas/disposições originais verificadas permanecem idênticos. Não proponho novo delta factual neste lote.

Suplemento2: `208b0ba87350a91970d28f298d802512b72b6834360815b95ca17ab22ebc54b1` (375497 bytes). Índice: `9b69ab60d2f1b5d51d46a165852e9402b63261b77aee59a7001ff80ff3a5cfcb` (113392 bytes).

A verificação é documental: cada intervalo foi comparado byte a byte ao archive e cada bloco reutilizado ao suplemento congelado. Testes de produto/provider: NOT_RUN. Nenhum oracle, avaliação reservada, escrita remota ou mudança de produto. Julgamento/aceite não são realizados pelo produtor. Lotes3–4 terão suplementos próprios quando seus pedidos públicos chegarem.
