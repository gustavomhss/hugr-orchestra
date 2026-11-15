# S1-03 — execução do helper e auditoria de dispatch dos consumidores

## Resultado mecânico

O helper preservado foi executado uma vez no destino novo payload/consumers/verified-summary-v1 e terminou com **exit code 0**, estado **MECHANICAL_REPORT_WRITTEN**. A auditoria adicional encontrou **zero divergências de identidade ou vínculo** nos registros examinados. Isso não atribui PASS de domínio, critério ou missão.

Foram conferidos **33 pedidos nativos e 33 completions**, com **sete handles distintos**, **sete spawns declarando fork_turns=none**, **26 followups**, **26 respostas de consulta** e **sete FINALs de caso**. As chamadas CLI registradas são **26: 11 index e 15 read**. Não se somam esses números como tentativas físicas de modelo.

| Caso | Chamadas e retornos nativos, cada | Index | Read | HOLD | Erros CLI | Bytes UTF-8 dos forwards |
|---|---:|---:|---:|---:|---:|---:|
| A-PERMITTED | 4 | 1 | 2 | 3 | 0 | 921 |
| A-VIOLATION | 5 | 2 | 2 | 3 | 1 | 1172 |
| A-IMPACT | 5 | 2 | 2 | 3 | 1 | 1162 |
| S-FAILURE | 4 | 1 | 2 | 3 | 0 | 915 |
| R-FAILURE | 6 | 2 | 3 | 4 | 1 | 1480 |
| B-ABSTAIN | 5 | 2 | 2 | 3 | 1 | 1155 |
| ENTRY-NAV | 4 | 1 | 2 | 3 | 0 | 908 |
| Total | 33 | 11 | 15 | 22 | 4 | 7713 |

Fontes: [consumer-summary.json](sandbox:/workspace/scratch/ef5eb2eb4a70/s1-03-34269cf4-d631-41c5-a30b-85b0ec217390/payload/consumers/verified-summary-v1/consumer-summary.json), [consumer-dispatches.json](sandbox:/workspace/scratch/ef5eb2eb4a70/s1-03-34269cf4-d631-41c5-a30b-85b0ec217390/payload/receipts/consumer-dispatches.json) e [dispatch-audit.json](sandbox:/workspace/scratch/ef5eb2eb4a70/s1-03-34269cf4-d631-41c5-a30b-85b0ec217390/assembly-native-descriptors/consumer-summary-run/dispatch-audit.json). Os FINALs por caso somam **12.461 bytes** e são cópias exatas do último retorno nativo preservado de cada handle.

## Estado operacional observado

A preparação real de **12 artefatos** ficou **BLOCKED_ACTUAL_PREPARE**, exit code **1**, sem timeout e sem arquivo preparado. Seu stderr preserva native-file-limit no path modules/atlas/docs/design/genesis-chatgpt-results/20261111-v3-fresh/s1/revisions/a-l1-evidence-v1/coverage-needs-projection.json. Não foi tentada publicação por esse comando. O recibo [native-prepare-final.json](sandbox:/workspace/scratch/ef5eb2eb4a70/s1-03-34269cf4-d631-41c5-a30b-85b0ec217390/payload/receipts/native-prepare-final.json) tem **2576 bytes**, SHA-256 **469f4cdf21af6e295378b975a75e6670c4a07f4452335b4dbc76e64ce4eedc81**.

As consultas posteriores registraram:

- **22 HOLDs**, exit code 2, reason ownership-store-unavailable.
- **Quatro erros native-query-need**, exit code 1, no primeiro index de A-VIOLATION, A-IMPACT, R-FAILURE e B-ABSTAIN.
- **Zero timeouts, streams não UTF-8/base64, forwards parciais ou suprimidos por quota.**
- **26 envelopes completos preservados**, mesmo quando contêm HOLD ou erro. Envelope completo não significa conteúdo de corpo disponível.

Todos os **12 artefatos planejados receberam tentativa direta de read** no conjunto dos casos, incluindo research-maintenance em R-FAILURE pelo suplemento público. Os 15 reads retornaram HOLD; não há conteúdo de corpo confirmado nesses forwards. As quotas de **2 index, 5 read e 60.000 bytes por caso** foram conferidas pelo helper. Os 7.713 bytes contam os envelopes UTF-8, inclusive sua estrutura JSON; não são tokens.

## Vínculos de dispatch efetivamente conferidos

Para cada uma das 33 chamadas, foram comparados path, tamanho e SHA-256 do JSON de argumentos e de message_source. A string message, codificada integralmente em UTF-8, é idêntica aos bytes da fonte preservada, sem normalização de LF. Os sete primeiros pedidos correspondem aos requests congelados; os 26 seguintes correspondem, um a um, aos forwards da ponte.

Cada completion foi associado à mesma dupla case_id/turn e ao mesmo handle. Os **33 registros capture embutidos** conferem file, bytes, sha256, literal=true e agent_id contra a resposta preservada. As 26 respostas de consulta são JSON literal coerente com parsed_operation, com a query executada e com a operação resumida pelo helper. Cada forward aparece em um único pedido nativo posterior.

Os **sete arquivos final-capture.json** e final-response.md conferem com o último retorno nativo do caso. A auditoria também conferiu os inventários restritos de native-turns, sem deduzir chamadas de arquivos preparados. Todos os bytes lidos foram novamente comparados antes da saída.

Contagens de bytes, em categorias que se sobrepõem:

| Categoria | Bytes |
|---|---:|
| 33 JSONs de argumentos nativos | 45264 |
| 33 mensagens UTF-8 contidas nesses argumentos | 40996 |
| 33 respostas nativas preservadas | 14782 |
| Sete FINALs de caso, subconjunto das respostas | 12461 |
| 26 forwards, subconjunto das mensagens | 7713 |

A auditoria adicional leu **167 arquivos**, incluindo o recibo e o JSON produzido pelo helper; suas identidades e papéis estão em dispatch-audit.json. O helper registra **169 inputs, 173.203 bytes**, com sobreposição à auditoria adicional. Esses inventários não representam número de execuções ou cobrança.

O snapshot da auditoria vai de **2026-11-15T11:25:07.967014+00:00** a **2026-11-15T11:25:08.005936+00:00**. Não afirma captura de eventos futuros.

## Limites da prova

A conclusão é de **coerência de arquivos e da atestação preservada da principal**. Não é checksum independente do wire do host, verificação por logs internos ou prova de ausência técnica de acesso ao filesystem. Os sete handles e fork_turns=none documentam o contexto declarado; não demonstram um sandbox técnico.

O helper permanece inalterado: seu campo de atestação independente de entrega nativa continua UNKNOWN. A auditoria adicional vincula os forwards aos argumentos e retornos preservados pela principal, sem elevar essa prova a observação independente do transporte. Também permanece a limitação do helper quanto ao schema formal de ownership.read; nenhum schema de sucesso foi inventado.

Não houve consulta a oracle, corpo de produtor, julgamento, fonte de produto, rede ou logs internos. Nenhuma nova operação Atlas, teste de produto ou execução de modelo foi criada pela consolidação/auditoria. As 26 chamadas CLI descritas são registros anteriores. Tokens, tentativas físicas e custo: **UNKNOWN**.

## Identidades de entrada e de saída

| Entrada autorizada | Bytes | SHA-256 |
|---|---:|---|
| summarize_consumers.py | 44200 | 452a59a1b27a25c58f79582643cbe064bef1c30910b558c6faa85d0da6328629 |
| README.md do helper | 9168 | b1630f6340f825f85d8b7b68f872ba869ce72f5c369b4dd11c569950bec70378 |
| consumer-dispatches.json | 65941 | 22f2d14860df2df8bf975d0955b664d4dfecbf450d46e526e7e2222afcfe2ff9 |

| Output concluído | Bytes | SHA-256 |
|---|---:|---|
| [consumer-summary.json](sandbox:/workspace/scratch/ef5eb2eb4a70/s1-03-34269cf4-d631-41c5-a30b-85b0ec217390/payload/consumers/verified-summary-v1/consumer-summary.json) | 134340 | 37dc9ccfa9ceaae418fed41fc931b9ad12f9919de73b893c72d4279ef5775b73 |
| [consumer-summary.md](sandbox:/workspace/scratch/ef5eb2eb4a70/s1-03-34269cf4-d631-41c5-a30b-85b0ec217390/payload/consumers/verified-summary-v1/consumer-summary.md) | 32399 | 5b306a9db2bfaa2bc9982dce20e0cf05ab28e7dc9439c555042f31f6dab0a90c |
| [dispatch-audit.json](sandbox:/workspace/scratch/ef5eb2eb4a70/s1-03-34269cf4-d631-41c5-a30b-85b0ec217390/assembly-native-descriptors/consumer-summary-run/dispatch-audit.json) | 138951 | 96b92fc0b4dd5743355ddd33fd9b4889f62fa7a49642fb3d6ac3678a351acd5d |

São cinco outputs: os dois do helper e dispatch-audit.json, este REPORT.md e response.md. Os hashes do relatório e da resposta são emitidos após a escrita, sem autorreferência. response.md é congelado sem LF terminal e corresponde exatamente ao FINAL. Os inputs e o helper permanecem originais.
