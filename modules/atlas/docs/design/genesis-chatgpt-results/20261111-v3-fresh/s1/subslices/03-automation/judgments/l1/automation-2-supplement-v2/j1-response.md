## PASS — automation-2-supplement-v2, escopo §§4–5

**J1 — execução `34269cf4-d631-41c5-a30b-85b0ec217390`.** O aceite deste lote refere-se exclusivamente a **§§4–5 do corpo v2**, intervalo UTF-8 **`[17674,30198)`**, no corpo de **59.953 bytes**, SHA256 **`e9c89bea68d594bc61356ff461642ea23cd905d4584f2b52d32e10a5af984e55`**.

Reutilizado o exame anterior do trecho inalterado, as fontes literais completam a evidência necessária. **Não permanece achado obrigatório ou pedido de evidência aberto neste lote.**

### Disposição dos pedidos

| Pedido | Decisão e fundamento |
| --- | --- |
| **RE-AUT2-01** | **ENCERRADO.** Os caminhos GitHub distinguem elegibilidade na branch padrão, fonte selecionada, validação de inputs e ambientes, condições dos comandos e qualificação do acknowledgment. Retry não recebe tentativa nova fabricada; dispatch 204 permanece sem atribuição. **AUT2-C01–C05; AUT1-C30, C38–C40.** |
| **RE-AUT2-02** | **ENCERRADO.** Os caminhos GitLab sustentam os limites de papel, política e versão observada, a resolução de inputs, a colocação de pipelines de MR e as provas de identidade para pipelines e jobs. O planejamento precede o envio único; retry de job exige identidade substituta demonstrada. **AUT2-C06–C11; AUT1-C41–C44.** |
| **RE-AUT2-03** | **ENCERRADO.** Contratos de configuração, seleção, versões, redaction, criptografia de secrets, ambientes, revisão de deployment e política estão sustentados. A limpeza demonstrada alcança o buffer local de plaintext; disponibilidade e autoridade externas continuam qualificadas. Falha em etapa posterior de uma alteração composta permanece resultado incerto. **AUT2-C12–C24; AUT2-X01.** |
| **RE-AUT2-04** | **ENCERRADO.** A evidência distingue invalidação de cache GitLab, exclusões GitHub, ownership de runners, dados transitórios de registro/JIT, schedules nativos e edição de YAML. As mutações de artifacts têm suas próprias provas de ownership, versão e acknowledgment. **AUT2-C25–C31, C41; AUT1-C28–C29.** |
| **RE-AUT2-05** | **ENCERRADO.** Estão demonstrados os limites de captura e parsing, a resolução qualificada de credenciais, o uso do mesmo snapshot no caminho HTTPS GitLab, o transporte multipart e a classificação conservadora dos erros. Diagnóstico textual ou saída incompleta não prova rejeição definitiva. **AUT2-C32–C38; AUT1-C45.** |
| **RE-AUT2-06** | **ENCERRADO.** Targets, ownership, tentativas, headers e transferência estão sustentados. No caminho GitLab, `read` recusa 206 ou `content-range` antes de entregar bytes; a renovação de URL assinada ocorre uma única vez, nas condições declaradas, com revalidação. Scopes, watchdogs, EOF completo e verificação do exit do processo sustentam os limites relatados. Digest permanece metadado, sem verificação criptográfica dos bytes presumida. **AUT2-C38–C44; AUT2-X01.** |

### Critérios e pendências preservadas

O trecho atende aos critérios pertinentes de fidelidade, utilidade, mecanismos, limites de autoridade e distinção entre interpretação estática e execução, mantendo a barra de **GO-A, GO-I, QS e CC** aplicável a este julgamento local. Os recortes externos de Schema esclarecem contratos consumidos pelo Core; não constituem aceite independente de outro componente.

**O corpo integral de automation continua sem aceite.** Permanecem os pedidos dos lotes **automation-3 (`RE-AUT3-01..06`)** e **automation-4 (`RE-AUT4-01..04`)**, além do exame dos deltas posteriores que lhes correspondam. O PASS anterior de automation-1 é preservado. Este parecer não aceita automaticamente versões posteriores do corpo nem encerra obrigações de execução, consumidores ou manutenção.