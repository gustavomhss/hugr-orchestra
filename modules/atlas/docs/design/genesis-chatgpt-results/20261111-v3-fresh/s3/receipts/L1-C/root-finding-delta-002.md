# Correção autoral C-002 — transporte loopback e token por lançamento

## Pedido original da raiz

J2 C v2 FIX-FIRST F1 C4/R2, obrigatório: §8Entrada corpoURLtokenBearer mas omite WebSocketloopback +tokenporlançamento que oracleexigeefonte socket-transport.tsfornece. Preserve body-v2.md/response-v2.md, substitua exatamente “o socket envia Bearer. O receptor pertence a `apps/desktop/src/main`, não ao módulo.” por “o WebSocket loopback usa token por lançamento e Bearer; o receptor está em `apps/desktop/src/main`.” (se ultrapassar24000 ajuste mínimo sem perderconteúdo). Registre finding/pedido/delta ehashv3, atualizerecibos. Ambosjuízes reavaliarão: J1PASSv2. Packagingpodeentregardraftcomv2rotuladoobsoleto; raizatualizarárefs ouaguardeCcopiado. NadaL2atéaceitecompleto. C1/C2/C3/C5 eR1/R3/R4passaram noJ2. EsteéconteúdorequeridoF1, nãoeliminaçãofonte.

## Delta realizado

A substituição solicitada foi aplicada literalmente na Entrada de §8, com o início do intervalo citado ajustado de 8 para 5 para incluir o comentário de transporte; os demais trechos de `body.md` permanecem intactos. O corpo agora explicita WebSocket loopback, token por lançamento e Bearer. A fonte já capturada é `modules/app-dock/src/socket-transport.ts`, blob `bdb749fdb2707e486b57e85d5921faa1c122ac20`; seu comentário de abertura atribui loopback/token por lançamento e o construtor envia Authorization Bearer.

A versão v2 foi preservada em `body-v2.md`, SHA-256 `c348fbcdb07c7be3f3eebb4d8cb85d9ecb94b094f9e2e086f118298b8e956541`, 23.970 bytes. A resposta e o inventário v2 também foram preservados. A v3 não herda aceite da v2: ambos os pareceres serão reavaliados pela raiz, conforme pedido. Nenhum oracle reservado foi aberto pelo produtor, nenhuma fonte foi removida e nenhum runtime ou L2 foi executado.
