# Resposta boundaries v2 / suplemento 1

Os dois pedidos públicos foram lidos integralmente e preservados em `inputs/`. A resposta contém prova literal para RE-BND-01..06, complementando R001–R041 já recebidos. Não cria decisão de juiz nem move aceite.

## Duas alterações autorizadas

1. A atribuição ao comentário de Atlas agora conserva “Genesis mining from the screen” e distingue a classificação interpretativa histórica “legado” da afirmação textual da fonte. O limite staging sem promoção permanece.
2. MoveSession agora delimita `discard` ao diretório da Session, `index: "preserve"`, `untracked: "remove"`, sem patch. O teste aninhado tem asserções de staged dentro de `packages/` e alterações fora desse diretório; não exercita mudanças concorrentes posteriores à captura no mesmo diretório.

O corpo v1, receita v1 e resposta v1 permanecem byte-idênticos em `../boundaries-v1/`. `delta.patch` e `delta.json` preservam as duas substituições exatas e seus hashes. O corpo v2 tem 23.665 bytes e SHA256 `ca7e76aa47100f32e2076b0a5055b2cebfe3d36cfb5c0d29601125db34d7b3c6`.

## Evidência entregue

`suplemento-boundaries-1.md`, na raiz do produtor, contém 107 entradas literais e um plano de reuso dos 41 trechos recebidos. Seu índice liga offsets na fonte, offsets no suplemento, linhas, hashes integrais e hashes de excerto. São dez fontes de teste com contratos preparados, sem execução. RAG 1–81 é repetido integralmente por solicitação explícita de J1; os demais blocos omitem os trechos já recebidos e apontam seu reuso exato.

`shared-reconciliation-1.md` está incorporado integralmente uma única vez no suplemento. Ele contém as 24 disposições literais, a relação exata das 104 fontes de suporte, históricos boundaries/entry/manifest, trechos A3/A4/projection, README/I01 e rotas do kit. O lote de suporte poderá reutilizar os bytes por offsets/hashes, sem nova transmissão do mesmo censo.

## Inputs efetivos e limite de transporte

A3 (177.076 bytes), A4 (155.061 bytes) e a projeção (726.892 bytes) foram preservados integralmente em `inputs-effective/history/`. São inputs reais de ambos os artefatos para claims históricos e de população; seus recortes de evidência não substituem a identidade integral. `effective-inputs.json` lista grupos exatos por artefato e exceções de profundidade; `effective-input-disposition.md` explica os motivos.

O fato de a projeção ultrapassar 256 KiB continua explícito. Não houve recorte/reclassificação para contornar limite, import nativo ou seleção de binding. Mudanças futuras de claims/recipe, se necessárias, exigem autorização e julgamento próprios.

## Estado e seleção do registro

Este `recipe.json` versionado corresponde ao corpo boundaries v2. A receita geral v1 na raiz continua preservada como registro da produção original; não deve ser confundida com a recipe deste delta. `support.md` e a proposta permanecem inalterados nesta etapa. O próximo trabalho de suporte tem autorização própria e produzirá delta e suplemento separados.

Verificação determinística de hashes/offsets concluída; produto/testes/providers/Atlas/remote: NOT_RUN. Suficiência semântica: pendente de reavaliação pelo mesmo par.
