Helper determinístico preparado em [summarize_consumers.py](sandbox:/workspace/scratch/ef5eb2eb4a70/s1-03-34269cf4-d631-41c5-a30b-85b0ec217390/assembly-native-descriptors/consumer-summary-helper/summarize_consumers.py), com instruções em [README.md](sandbox:/workspace/scratch/ef5eb2eb4a70/s1-03-34269cf4-d631-41c5-a30b-85b0ec217390/assembly-native-descriptors/consumer-summary-helper/README.md). O [dispatch-message.txt](sandbox:/workspace/scratch/ef5eb2eb4a70/s1-03-34269cf4-d631-41c5-a30b-85b0ec217390/assembly-native-descriptors/consumer-summary-helper/dispatch-message.txt) preserva literalmente o pedido inicial visível, sem LF terminal. Esta resposta está preservada em [response.md](sandbox:/workspace/scratch/ef5eb2eb4a70/s1-03-34269cf4-d631-41c5-a30b-85b0ec217390/assembly-native-descriptors/consumer-summary-helper/response.md), também sem LF terminal.

O helper recebe a raiz da execução e um destino novo. Depois de existirem os recibos reais, produzirá consumer-summary.json e consumer-summary.md com a identidade da preparação, operações por caso, bytes, HOLDs/erros/timeouts, tentativas diretas e provas. Exige a preparação real da seleção de **12 artefatos**, os **sete consumidores**, seus requests congelados pela versão 2 e os FINALs acompanhados de capture.file, bytes, sha256, literal=true e agent_id.

A obrigação direta combina o mapa original com o suplemento autorizado: **R-FAILURE também exige read explícito de s1.subslice03.research-maintenance**. Os pins do plano original e das perguntas permanecem fixados. O helper permite aprofundamentos dentro das quotas de **2 index, 5 read e 60.000 bytes UTF-8 por caso**; não exige exatamente três operações.

Ele verifica hashes, tamanhos, numeração, ordem temporal, queries, comandos, vínculo à mesma preparação, streams, base64 e envelopes completos. Reproduz mecanicamente o tratamento de timeout e de saldo insuficiente da ponte v2, sem trocar bytes por tokens. Aborta diante de arquivos ausentes, órfãos, divergências, limites excedidos, read direto exigido ausente ou destino já existente. Os originais permanecem intactos.

**Limites explícitos:** os inputs autorizados não incluem o schema formal da resposta de ownership.read. Uma resposta estruturada completa com exit 0 permanece **UNKNOWN para consumo de corpo** quando esse contrato não permite identificá-lo; uma tentativa, HOLD, erro ou timeout não é promovido a conteúdo consumido. O helper também não inventa prova independente de entrega nativa dos forwards nem checksum do wire do host. Tokens, tentativas físicas de modelo e custos ficam UNKNOWN. Não emite juízo de domínio/critério nem consulta oracle.

**Verificação realizada:** somente análise sintática determinística com ast.parse. O helper não foi importado ou executado; não houve fixtures, testes simulados, consultas Atlas, chamadas de colaboração ou alteração de scripts existentes/payload.

| Arquivo | Bytes | SHA-256 |
|---|---:|---|
| summarize_consumers.py | 44200 | 452a59a1b27a25c58f79582643cbe064bef1c30910b558c6faa85d0da6328629 |
| README.md | 9168 | b1630f6340f825f85d8b7b68f872ba869ce72f5c369b4dd11c569950bec70378 |
| dispatch-message.txt | 2412 | 6bc5fa8c0faaaf29de15e7311a4929be2e653cd655e6802396db2b69bb9a7091 |

O hash do próprio response.md foi registrado separadamente na saída de hashing da entrega, sem inserção autorreferente no arquivo.