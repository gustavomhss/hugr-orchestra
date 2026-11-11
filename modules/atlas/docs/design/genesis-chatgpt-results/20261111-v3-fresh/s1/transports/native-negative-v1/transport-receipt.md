# S1-NATIVE-NEGATIVE-v1 — recibo de transporte

Foram concluídas duas chamadas reais de `collaboration.followup_task`, uma para `/root/judge1` e uma para `/root/judge2`, com o dossiê integral como DATA 1/1. A segunda chamada ocorreu somente depois de a principal informar que J1 encerrou e o slot estava livre. A mensagem exata de liberação está preservada.

Cada request contém 32197 bytes de DATA e 32683 bytes com envelope. Os dois requests preservados são idênticos. Totais das chamadas observadas: 64394 bytes de DATA e 65366 bytes de mensagens. SHA-256 do DATA: `8c6e2ac69e54ab10a280d0c425cdaaf7d15e6ac017ae073daebab7cb7a1bf4af`. SHA-256 do request: `43becef4b7e65e6dbaf80fd863defcfde34a60d27835340642d151e16f168a3c`.

Os resultados visíveis das duas chamadas foram vazios, sem erro explícito ou truncamento. Não houve retransmissão nem diferença de transcrição detectada. A comparação da transcrição efetiva foi manual; a igualdade de DATA/cópias locais foi verificada mecanicamente. Nenhum retorno expôs byte echo ou hash recebido pelo host. Esses dados, IDs do host, tentativas físicas internas, tokens e custo permanecem UNKNOWN.

O dossiê e o freeze original foram novamente conferidos e permaneceram idênticos. O transportador não leu oracle ou parecer para decidir mérito e não alterou o pacote ou os critérios. A principal arquiva os veredictos integrais. Este recibo registra transporte, sem resultado semântico ou prova de runtime Atlas.

`delivery-results.json` preserva as chamadas e os resultados visíveis; `verification.json` registra a conferência; `transport-receipt.json` contém alvos, sequência, métricas e limites; `manifest.json` vincula todos os arquivos preservados por bytes/SHA-256.
