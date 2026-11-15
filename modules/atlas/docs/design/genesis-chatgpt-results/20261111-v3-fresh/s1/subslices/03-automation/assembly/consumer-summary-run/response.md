Executei o helper preservado e concluí a auditoria adicional **sem divergências de identidade ou vínculo nos arquivos examinados**. O helper terminou com **exit code 0**; os inputs e o script permaneceram originais.

### Números conferidos

- **33 chamadas nativas e 33 completions:** sete spawns com `fork_turns=none` e 26 followups.
- **Sete handles distintos e sete FINALs de caso**, com 12.461 bytes ao todo.
- **26 chamadas CLI registradas:** 11 `index` e 15 `read`.
- **26 forwards**, totalizando **7.713 bytes UTF-8**, cada um vinculado uma única vez ao pedido nativo seguinte.
- **12 chaves de artefato tentadas diretamente**, incluindo research-maintenance em R-FAILURE.
- **22 HOLDs** por `ownership-store-unavailable`, exit code 2, e **quatro erros** `native-query-need`, exit code 1.
- **Zero timeouts, streams não UTF-8/base64, envelopes parciais ou suprimidos por quota.**

Os quatro erros ocorreram no primeiro `index` de A-VIOLATION, A-IMPACT, R-FAILURE e B-ABSTAIN. Todos os 15 reads registrados retornaram HOLD; **não há conteúdo de corpo confirmado nesses forwards**. A preparação real dos 12 artefatos permaneceu `BLOCKED_ACTUAL_PREPARE`, com `native-file-limit` na projeção histórica. Nenhum PASS de domínio, critério ou missão foi atribuído.

Conferi tamanho/hash e correspondência integral dos 33 requests, suas mensagens e message_source, das 33 respostas e capturas embutidas, dos 26 forwards e dos sete pares final-response/final-capture. Cada FINAL de caso coincide byte a byte com o último retorno nativo preservado daquele handle.

### Arquivos e hashes

| Arquivo | Bytes | SHA-256 |
|---|---:|---|
| [consumer-summary.json](sandbox:/workspace/scratch/ef5eb2eb4a70/s1-03-34269cf4-d631-41c5-a30b-85b0ec217390/payload/consumers/verified-summary-v1/consumer-summary.json) | 134340 | 37dc9ccfa9ceaae418fed41fc931b9ad12f9919de73b893c72d4279ef5775b73 |
| [consumer-summary.md](sandbox:/workspace/scratch/ef5eb2eb4a70/s1-03-34269cf4-d631-41c5-a30b-85b0ec217390/payload/consumers/verified-summary-v1/consumer-summary.md) | 32399 | 5b306a9db2bfaa2bc9982dce20e0cf05ab28e7dc9439c555042f31f6dab0a90c |
| [dispatch-audit.json](sandbox:/workspace/scratch/ef5eb2eb4a70/s1-03-34269cf4-d631-41c5-a30b-85b0ec217390/assembly-native-descriptors/consumer-summary-run/dispatch-audit.json) | 138951 | 96b92fc0b4dd5743355ddd33fd9b4889f62fa7a49642fb3d6ac3678a351acd5d |
| [REPORT.md](sandbox:/workspace/scratch/ef5eb2eb4a70/s1-03-34269cf4-d631-41c5-a30b-85b0ec217390/assembly-native-descriptors/consumer-summary-run/REPORT.md) | 7877 | 38e27c0f3087ae77c7412e08c61618a6930c3e3ec67c441f11fc4b74a4d07d20 |

O quinto output é [response.md](sandbox:/workspace/scratch/ef5eb2eb4a70/s1-03-34269cf4-d631-41c5-a30b-85b0ec217390/assembly-native-descriptors/consumer-summary-run/response.md), congelado sem LF terminal e idêntico a este FINAL; seu hash é emitido após a escrita, fora do próprio conteúdo.

**Limite da prova:** a contabilidade confirma coerência dos arquivos e da atestação preservada da principal. Não fornece checksum independente do wire, prova técnica de impedimento de acesso ao filesystem ou avaliação semântica dos consumidores. O helper preserva seus UNKNOWNs sobre atestação independente e schema de resposta. Não executei novas consultas Atlas, rede, modelos ou testes, nem abri conteúdo reservado, corpos de produtores ou julgamentos. Tokens, tentativas físicas e custo permanecem **UNKNOWN**.