## J1 — Reavaliação de L1-A v1: PASS

**F1 está encerrado.** Os novos trechos demonstram a precedência das permissões no pin e a restrição de delegação solicitadas. O corpo pode permanecer inalterado, com SHA-256 `75b4438d79ebd9667db94f03a6fea884329cd5c72e2c69f649eff1047e7b1918`.

Este PASS aprova a unidade como **base estática L1**. Não representa execução de runtime, aceite de L2–L4 nem fechamento da população S3.

### Decisão por critério

| Critério | Decisão atual | Evidência e motivo |
|---|---|---|
| **C1 / QS1 — fidelidade, autoridade e fonte exata** | **PASS** | A evidência adicional resolve a afirmação material pendente da §4. `v2/seats.ts` aguarda `config-agent` e acrescenta o profile nativo às permissões; `floor` preserva sua ordem. `permission.ts` usa a última regra correspondente. A origem dos novos recortes permanece vinculada ao baseline e à verificação de integridade informada. |
| **C2 / CC1 — cobertura, classificação e necessidades seguintes** | **PASS — preservado** | Permanecem reconciliados os 424 paths do lote, com distinção entre população, inspeção realizada e necessidades de L2–L4. Não há alegação de fechamento da população S3. |
| **C3 / CC2–3 / GO-A1–3 — utilidade como base L1** | **PASS — preservado** | O mapa de componentes, identidades, portas, autoridade, distribuição e lacunas continua suficiente para orientar consulta progressiva e aprofundamento. |
| **C4 / GO-I1,2,7 / QS4 — preservação, identidade, fronteiras e gerados** | **PASS** | Identidade, preservação e gerados já estavam atendidos. Os novos recortes resolvem a fronteira pendente: grants declarados mantêm as restrições relevantes de `direct` e `review`; `CallerGate` consulta o próprio profile antes de autorizar delegação. |
| **C5 / GO-I8 / QS5–6 — honestidade de prova e economia** | **PASS — preservado** | A prova adicional é estática e não altera as alegações de execução do corpo. O candidato continua dentro do limite de bytes e não atribui PASS de runtime a código ou testes apenas lidos. |

### F1 — Encerrado por evidência

**Esperado:** demonstrar que, no baseline, configuração e grants declarados não superam as restrições relevantes dos profiles `direct` e `review`, incluindo delegação.

**Observado:**

- **Precedência sobre configuração:** `v2/seats.ts` L73–126 aguarda o plugin de configuração e acrescenta as regras do profile nativo. `floor`, L176–185, preserva a ordem do profile. A função `evaluate` de `permission.ts` seleciona a última regra correspondente.
- **Restrições preservadas:** os blocos completos de `review` e `direct` começam com `"*": "deny"` e não concedem `bash`, `edit` ou `task`. `seatProfile` acrescenta grants específicos de MCP, Atlas, skills e diretórios; os trechos não transformam o carregamento de uma skill em autorização genérica de execução.
- **Delegação protegida:** a função completa `CallerGateV2.check` reconstrói as regras do profile nativo, avalia `task` para o target e produz `Task denied` quando o resultado é `deny`.
- **Regras salvas não anulam a negativa configurada:** `evaluateInput` devolve `deny` antes de acrescentar `savedRules()` quando as regras configuradas já negam a operação.
- **Restrições adicionais:** a composição acrescenta a proibição de editar as árvores de skills e, depois, os denials de visibilidade.

**Correção:** a entrega dos recortes solicitados resolveu a lacuna. **Não é necessária alteração do candidato.** A conclusão vale para os descriptors e mecanismos apresentados no pin; não afirma comportamento de descriptors futuros nem execução observada.

### Oracle reservado

- **R1: PASS — preservado.**
- **R2: PASS — atualizado.** Precedência de permissões e restrição de delegação demonstradas estaticamente; as proibições de autoaprovação e autorrevisão do conductor permanecem preservadas.
- **R3: PASS — preservado.**

**Estado final da unidade: PASS.** Nenhum finding obrigatório aberto. Nenhuma sugestão opcional condiciona esta decisão.
