# S1-L1-A1-v1 — transporte concluído

Foram concluídas nove chamadas reais de `collaboration.followup_task`: quatro partes DATA para `/root/judge1`, uma errata delimitada para J1 e as quatro partes canônicas para `/root/judge2`. J2 só foi ativado após a principal confirmar o encerramento de J1.

O dossiê canônico continua com 138935 bytes UTF-8 e SHA256 `7d1a1587aee606681c491a9bb63db5c579cb07b83ee8a9c78387e1d053d6d188`. As quatro partes recompõem exatamente o original; as duas entradas congeladas permanecem intactas.

A parte 4 enviada inicialmente a J1 continha uma única transcrição incorreta em AEX096 (`coalescesces prompt wakeups`). A tentativa foi preservada; a errata real substitui por `coalesces prompt wakeups`. A aplicação local foi verificada contra o request canônico. A principal informou que J1 reconheceu essa errata. A primeira transmissão da parte 4 de J1 não é registrada como canônica.

J1 teve 138938 bytes DATA nos quatro envios iniciais, 144473 bytes de mensagens incluindo envelopes e errata; J2 teve 138935 bytes DATA e 143530 bytes de mensagens. A reconstrução canônica corrigida é a mesma para ambos. Não há byte echo do host, request IDs, tokens ou custos expostos; esses campos são UNKNOWN.

O retorno da parte 3 de J1 foi truncado; a principal forneceu o ACK nativo de partes 1–3. Não houve retransmissão por truncamento. Os demais oito retornos visíveis foram vazios, sem erro explícito. O erro local de preparação anterior à entrega também está preservado separadamente.

Recibo: `receipt.json`, 6045 bytes, SHA256 `528a86be6fead49dbcb31f9a03568d59c5b41fc6f43403da89608810a02ff0c6`. Requests efetivos, argumentos reconstruídos dos envios visíveis, resultados, hashes e limites estão em `calls/`, `delivery-results.json`, `verification.json` e `part-04-transcription-correction.json`. A comparação dos argumentos nativos foi manual; os arquivos e a aplicação da errata foram verificados mecanicamente.

Este é um recibo de transporte, sem julgamento semântico ou qualificação de runtime. A principal arquiva os pareceres. A1 está fechado; a onda A2–A4 só segue pelo despacho formal separado.
