## J1 — PASS para o lote automation-1 (§§0–3)

**RE-AUT1-01 a RE-AUT1-06 estão encerrados neste recorte.** A evidência suplementar sustenta as afirmações examinadas, incluindo a correção da fachada. Não há novo achado obrigatório neste lote.

Execução: `34269cf4-d631-41c5-a30b-85b0ec217390`.

**Identidades do exame:**

- Corpo v2 de referência: `s1.core.automation`, **59.953 bytes**, SHA256 `e9c89bea68d594bc61356ff461642ea23cd905d4584f2b52d32e10a5af984e55`.
- Pacote literal: `automation-1-supplement-v2-coverage-erratum`, **344.323 bytes**, SHA256 `1599aa38f34decbc6bff88c972ed778d5f49e179dca7ac2915d37ecacf245a4b`.
- Coverage corrente após o erratum: SHA256 `2aa8583096af86ec9db54c9a1e60db305f46aa4be5c9979bda577c5f8b50f13e`.

Essas identidades delimitam o material recebido; este parecer não representa recálculo independente dos hashes.

### Disposição das pendências

| Pedido | Decisão | Fundamentação no material literal |
|---|---|---|
| **RE-AUT1-01** — histórico e população | **Encerrado** | AUT1-H01–H04 sustentam a reconciliação com o entendimento histórico e a disposição dos 204 paths, preservando as lacunas e profundidades anteriores. O erratum altera somente `role` e `reason` da fachada, sem promover os rótulos históricos a leitura ou aceite retroativos. |
| **RE-AUT1-02** — fachada, binding e estado | **Encerrado** | AUT1-C01–C05, X01–X02 e X05 permitem conferir a composição dos serviços, a resolução do binding, a identidade de Location, a validação dos remotes e a persistência delimitada. A nova frase distingue corretamente os componentes adiados daqueles compostos ao construir a fachada. |
| **RE-AUT1-03** — leitores e paginação | **Encerrado** | AUT1-C06–C16 e X06–X07 sustentam os vínculos de cursor, as identidades nativas, a resolução de fonte e a verificação de bytes/blob. Preservam as diferenças entre GitHub e GitLab: tentativa fixada no primeiro; slot de configuração, versões observadas e paginação separada de jobs/bridges no segundo. |
| **RE-AUT1-04** — YAML e grafo | **Encerrado** | AUT1-C17–C20 e X06 mostram os limites e suas aplicações, além das regras de composição, duplicatas, aliases, merges, `extends`, defaults e `needs`. A projeção conserva os estados parcial/não resolvido e não transforma includes, expressões, matrizes ou referências externas em topologia executada. |
| **RE-AUT1-05** — autoria e provas após escrita | **Encerrado** | AUT1-C21–C30, C45 e X03–X06 sustentam captura, paths/branches admitidos, precondições, diferenças de create/update e qualificação do retorno. Falha de prova após envio permanece `outcome_unknown`. Lint e os dois editores de schedules conservam seus contratos e limites distintos. |
| **RE-AUT1-06** — ledger, acknowledgements e reconciliação | **Encerrado** | AUT1-C31–C45 e X02–X05 sustentam a separação entre intenção persistida e payload de execução, unicidade/CAS, lease, retenção, recuperação por identidade de DB, finalização e observação sem reenvio. Os exemplos concretos preservam a distinção entre ID reconhecido, nova tentativa ou novo job e confirmação posterior. |

### Correção e critérios

A substituição de “construção lazy” está semanticamente justificada por AUT1-C01–C02: **a resolução do binding, a inicialização cached de operations e o carregamento de output são adiados; transport, readers e resources são compostos ao construir a fachada**. A cópia dessa mesma frase para coverage elimina a divergência de interpretação sem acrescentar comportamento. A referência ao corpo v4 no registro mecânico do erratum não constitui aceite integral dessa versão.

A correção de transporte em AUT1-C20 foi considerada exclusivamente na composição literal: `needs_duplicate:${id}`. A expressão de AUT1-C19 permanece `needs_duplicate:jobs.${id}`; o envio defeituoso e sua correção continuam registros distintos.

O reexame satisfaz **QS-1, QS-5, CC-3, GO-A1, GO-A5 e AC-01 local** neste lote. A disposição histórica, a rastreabilidade e o uso delimitado da cobertura são suficientes para os aspectos pertinentes de **CC-1, CC-7, GO-I1, GO-I2 e GO-I8**, sem certificação global desses critérios. O exame anterior de organização, consulta, escopo e separação de autoridades permanece válido nos trechos preservados. As fontes Schema externas sustentam os contratos consumidos pelo Core; seu uso não concede aceite a um artefato de S1-04.

### Estado resultante

**Pendências obrigatórias de automation-1: nenhuma.** O `REQUEST_EVIDENCE` anterior permanece preservado como decisão histórica, agora atendida pelo suplemento e pelo delta delimitado.

Continuam abertas as pendências dos demais lotes: **RE-AUT2-01–06, RE-AUT3-01–06 e RE-AUT4-01–04**. Este PASS cobre somente §§0–3; **`s1.core.automation` ainda não recebe aceite integral por este parecer**. Execução de produto, binding Atlas, consumidores e manutenção permanecem fora da decisão.