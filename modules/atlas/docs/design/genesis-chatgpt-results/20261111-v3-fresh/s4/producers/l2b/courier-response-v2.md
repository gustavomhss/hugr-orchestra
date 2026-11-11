# Transporte WP-L2B-v2 concluído

As três partes canônicas foram enviadas a /root/judge_j1 e /root/judge_j2, com AGUARDAR FECHAMENTO DO PRINCIPAL e identificação de material como dado, não autoridade. Não foi solicitado nem aguardado parecer. O principal conserva o fechamento do L2 completo.

A parte03 reapresenta o corpo CR integral e os localizadores/trechos Session e HTTP RAG de HB, preservados literalmente das cópias aceitas no commit 8a041ca66982dcc2b89aaed46ebe347cb3de57db. Não inclui a seção Atlas de HB. As partes01/02, o corpo L2B v2 e seus metadados permanecem congelados.

| Parte | Bytes do pacote | SHA-256 do pacote | Bytes da mensagem com envelope |
|---|---:|---|---:|
| 01 | 29850 | 415953649fb972177b5ac0476ad7c79200b9519d6f69a38afc3fb1fb077d0baa | 30073 |
| 02 | 17315 | 755111e7986c73670f0e2c55426458f3a0c3a6500d8500b279620b0c652ca3ed | 17538 |
| 03 | 28566 | a034e7b38d41b02c354f19a3ff870f5d756a6770deecd82a3c63bb48bc742bc3 | 28789 |

## Registro de reposição

A primeira cópia da parte03 enviada a judge_j2 perdeu quatro localizadores no parágrafo de deriva documental do CR. Esse payload foi preservado em courier-message-v2-03-j2-superseded.txt e marcado como substituído pelo envio7, que repôs o payload canônico integral. O aviso de reposição foi preservado antes de ser enviado, com texto igual para os dois juízes. Não houve modificação do pacote canônico ou de conteúdo de autoria.

O ledger registra nove chamadas: seis envios de conteúdo canônico, um envio de conteúdo substituído e dois avisos de reposição. Todos os IDs de mensagem são UNKNOWN. Na parte03 para judge_j1, o retorno visível da ferramenta foi truncado; não foi exposta rejeição. Não há recibo de leitura nem digest de bytes do lado receptor. A igualdade registrada refere-se aos payloads literais submetidos.

## Preservação e limites

courier-request-v2.md preserva o pedido. courier-ledger-v2.json registra os envios e a igualdade dos payloads canônicos. courier-integrity-v2.json registra bytes/hashes e a conferência mecânica dos segmentos literais. Os arquivos históricos de autoria, incluindo review-packet-v2-manifest.json, mantêm seu estado de preparação original; o ledger é o registro posterior de transporte.

Nenhum julgamento, teste de produto, build, runtime, execução Git ou escrita remota foi feito nesta tarefa. Modelo e tokens não expostos: UNKNOWN.
