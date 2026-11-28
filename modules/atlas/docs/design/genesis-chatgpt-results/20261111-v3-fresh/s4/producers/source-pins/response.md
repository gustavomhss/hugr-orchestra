# WP-SOURCE-PINS — conferência mecânica concluída

O lote finito dos **11 artefatos** contém **278 ocorrências de source_refs e 199 pins únicos por commit/path**, distribuídos por sete commits. As **199 associações commit/path/blob foram confirmadas** pelas evidências indicadas e os **199 conteúdos foram comparados diretamente, byte a byte, com final-corpus**, além da conferência independente de SHA-256 e Git blob. **Nenhuma associação ficou sem comprovação; nenhuma divergência local permaneceu.** Isso é resultado mecânico de identidade, sem parecer semântico ou PASS de camada.

## Snapshot preservado antes da análise

[native-package.snapshot.json](sandbox:/workspace/scratch/aff930d22ec7/s4/producers/source-pins/native-package.snapshot.json) preserva os bytes originais: **175.960 B**, SHA-256 **`00e479d28eb3830c09722d4ad8629d751802d18ac84f9dfd85d93163c4952c92`**, Git blob **`f9a583cab3232c3cbe7e0d2abf65e112551d0d06`**. Esse blob coincide com a entrada `native-package.json` do mapa nomeado para o payload **`c4a2992369f2309cbb5ffb8f166abbd7c3b81a4c`**. O registro inicial está em [snapshot-capture.json](sandbox:/workspace/scratch/aff930d22ec7/s4/producers/source-pins/snapshot-capture.json). O JSON corrente ainda coincidia com esse snapshot na observação final registrada em pins.json.

## Evidência das associações

| Evidência usada | Pins |
|---|---:|
| Inventário baseline + source-capture-receipt | 157 |
| Boundary-capture-receipt + bytes em boundary-source | 12 |
| Protocol-captures + cópias exatas em protocol-source | 5 |
| Mapa do commit 47eaa, usado somente para 47eaa5322102910289cb56e2e07e9d3536ba1926 | 6 |
| Novas capturas GitHub fetch_file com commit completo | 19 |
| **Total** | **199** |

As 19 lacunas foram fechadas somente pelo conector GitHub. Cada resposta original está preservada em `connector/`, com os argumentos do pedido, ref fixo, URL retornada, blob informado e conteúdo base64. Os bytes decodificados produziram os Git blobs e SHA-256 esperados. Não houve repetição dos 2.220 blobs baseline. Os mapas de outros commits e os mapas staged não foram usados para herdar associações.

| Commit exato | Pins únicos |
|---|---:|
| `1cde2ff7a71bcf7aecb5d030917b577165135d38` | 170 |
| `ee2521a5b966bd505cc95bd1c733e09e12f33531` | 5 |
| `e3a8ab8cf56dbff1ee91272df51ffa398d882aa1` | 6 |
| `9a2be7fa2d0d54b0000657a0060cb0a200e04bb0` | 2 |
| `a3f224843321f2c18fb9532ef275411c6a0f617e` | 1 |
| `8a041ca66982dcc2b89aaed46ebe347cb3de57db` | 9 |
| `47eaa5322102910289cb56e2e07e9d3536ba1926` | 6 |

## R2 canônico preservado

O arquivo `genesis-native-recovery.test.ts` permanece vinculado a **`a3f224843321f2c18fb9532ef275411c6a0f617e`**, com **23.178 B** e SHA-256 **`8e33b9721ef0ea7b8979a696c9493c53d069483d727f64e327c4165341e7bcb4`**. As referências a `runtime/ci-r2b/receipt.json` e `runtime-release.json` permanecem no commit **`8a041ca66982dcc2b89aaed46ebe347cb3de57db`**, com os blobs e bytes originais confirmados remotamente e iguais aos de final-corpus. Não houve substituição por R3 nem modificação do corpus.

## Arquivos entregues

- [pins.json](sandbox:/workspace/scratch/aff930d22ec7/s4/producers/source-pins/pins.json) — **485931 B**, SHA-256 **`af7d2de7e57e9451b8ced56e856c3039fb16fcdd6267a35d75e9fa668ccf0dd0`**. Cada registro contém commit, path, blob, SHA-256, bytes, usos no snapshot, evidência efetiva da associação, identidade dos bytes capturados e resultado da comparação com final-corpus.
- [evidence-sources.json](sandbox:/workspace/scratch/aff930d22ec7/s4/producers/source-pins/evidence-sources.json) — **17834 B**, SHA-256 **`9be20508cb36d1530baad891dc74901d0535224b35d23e91f5ed59fd6bd99d36`**. Identifica e mede os recibos/mapas reutilizados e as 19 capturas novas; explicita os limites de commit de cada mapa utilizado.
- [request.md](sandbox:/workspace/scratch/aff930d22ec7/s4/producers/source-pins/request.md) preserva o pedido, [response.md](sandbox:/workspace/scratch/aff930d22ec7/s4/producers/source-pins/response.md) preserva esta resposta e [integrity-receipt.json](sandbox:/workspace/scratch/aff930d22ec7/s4/producers/source-pins/integrity-receipt.json) registra hashes e tamanhos dos arquivos entregues. `pin-worklist.json` é o plano inicial anterior às consultas; o resultado definitivo está em pins.json.

## Limites

A conferência reutiliza os recibos de captura já existentes, conforme autorizado; não refez sua coleta remota integral. Os seis pins de 47eaa usam o mapa capturado desse commit e bytes locais cuja identidade Git coincide com o mapa. O SHA Git foi calculado com hashlib sobre `blob <tamanho>`, NUL e bytes, sem shell Git.

Não houve uso de gh, shell Git, login, GH_TOKEN, rede direta ou escrita remota. Não houve execução de produto, testes, build, prepare ou publicação. Candidate e final-corpus não foram modificados; oracles e conteúdos de julgamentos não foram lidos. Modelo e tokens não expostos ficam UNKNOWN. A L4 não pertence a este snapshot e nenhum pin seu foi acrescentado. Lote encerrado.
