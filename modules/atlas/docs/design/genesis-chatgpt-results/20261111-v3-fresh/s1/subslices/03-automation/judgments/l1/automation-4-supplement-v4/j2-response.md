## PASS — automation-4, §§10–14, corpo candidato v4

**J2 — execução `34269cf4-d631-41c5-a30b-85b0ec217390`.**

Decisão restrita a **§§10–14**, intervalo **[48200,60767)**, do corpo v4 identificado com **60.767 bytes** e SHA256:

`968965f1b15d633cefc8a78868d9d1049147f23dff409c6cb05c7a75e3561cae`

O suplemento completa as cadeias solicitadas, consideradas em conjunto com os trechos S01–S06 anteriormente recebidos.

### Disposição das pendências

| Pendência de J2 | Disposição | Evidência suficiente |
|---|---|---|
| **RE-AUT4-01 — políticas, owner, placement, port e identidade das claims** | **ENCERRADA** | Separação entre legacy e capability; consultas por owner e por placement; binding com restauração ao encerrar o scope; falha sem binding; IDs e snapshot persistido da claim. **AUT4-C01–C05.** |
| **RE-AUT4-02 — planejamento legacy, retomada, DST, cron e limites** | **ENCERRADA** | Caminhos de planejamento, consumo e retomada; conversão de horário local; regra entre os campos de dia do cron; âncora de intervalos; busca e contagem limitadas. **AUT4-C02, C06–C07.** |
| **RE-AUT4-03 — dispatch, admissão, takeover, manualKey, cleanup, repeat, retenção e daemon** | **ENCERRADA** | As cadeias distinguem claim, admissão durável e assentamento; mostram recuperação de claims antigas, tratamento dos replays manuais, avanço dos contadores, retenção de 20 runs assentados e ciclo do daemon. **AUT4-C01–C04, trechos S04–S06 reutilizados e T01-complementos 6–8.** |
| **RE-AUT4-04 — reconciliação compartilhada da população** | **ENCERRADA POR REUTILIZAÇÃO** | Mantida a reconciliação anteriormente examinada das **204 fontes**, sem novo censo ou novas rows. As fontes adicionais de Schema continuam como evidência externa dos call sites, sem alteração de **204/462**. |

### Deltas v3 → v4

**AUT4-DELTA-01: adequado.** A nova redação distingue a consulta de presença e identidade do owner das verificações de `holds`. Ela delimita estas últimas à claim ainda não admitida e explicita que a Session do owner não é relida antes do prompt. Resolve, assim, a amplitude indevida da frase anterior. **Evidência: AUT4-C01, dispatch, e AUT4-C02, `holds`/`present`.**

**AUT4-DELTA-02: adequado.** O texto passa a descrever os ramos efetivos do replay por `manualKey`: `running` sem `SessionInput` aguarda; `revoked` retorna erro; os demais casos devolvem o SessionID retido com `reused:true`. A descrição deixa de exigir admissão como condição universal para uma row já assentada. **Evidência: AUT4-C02, trecho 335–378, incluindo a referência S05 e sua continuação literal.**

### Critérios e conclusão local

**GO-A1–A7, QS1–QS6 e CC1/CC3/CC7: atendidos neste recorte.** As distinções entre políticas, propriedade, planejamento, persistência e recuperação têm suporte suficiente, com limites de busca e de comportamento preservados.

**GO-I1/GO-I2/GO-I7/GO-I8 e AC01 local: atendidos no alcance documental e semântico.** Os deltas estão explícitos; referências e hashes identificam os materiais declarados. Os complementos T01 foram considerados como assertions presentes no código, mantendo **NOT_RUN**.

**Pendências obrigatórias deste lote: nenhuma.** Permanecem os alcances próprios dos pareceres anteriores e dos gates operacionais já registrados; este PASS encerra automation-4 §§10–14, sem constituir por si só uma decisão de binding, operação ou entrega global.