## J1 — PASS de `automation-4-supplement-v4`

**Aceite restrito a §§10–14 do corpo v4**, intervalo UTF-8 **`[48200,60767)`**. Identidade do corpo: **60.767 bytes**, SHA256 **`968965f1b15d633cefc8a78868d9d1049147f23dff409c6cb05c7a75e3561cae`**, Git blob **`e26213eb2fc76dc843dca17d1111334c76f88890`**.

### Correções e disposição das pendências

Os dois deltas de §12 resolvem as qualificações exigidas:

- **AUT4-DELTA-01:** distingue a verificação da presença/identidade do owner das duas verificações de `holds` para a claim ainda não admitida. A nova redação deixa explícito que não ocorre uma segunda leitura da Session do owner. Sustentação: **AUT4-C01/C02 e S04**.
- **AUT4-DELTA-02:** descreve o ramo efetivo de replay da row retida: `running` sem SessionInput produz “retry shortly”; `revoked` produz erro; os demais casos devolvem o SessionID com `reused:true`. Retira a condição indevida de exigir admissão para toda row já assentada. Sustentação: **AUT4-C02/C03 e S05**.

| Pedido | Disposição |
| --- | --- |
| **RE-AUT4-01** | **ENCERRADO.** As fontes sustentam a separação das políticas, a identidade do owner, a consulta por placement e o binding da porta no processo, incluindo restauração do binding anterior ao fechar o Scope. **AUT4-C01–C05; S01.** |
| **RE-AUT4-02** | **ENCERRADO.** Completada a sustentação das regras legacy e capability, conversão de horário local, parsing de cron, combinação dos campos de dia, catch-up e limites de busca e contagem. **AUT4-C01/C02/C06/C07; S02–S03.** |
| **RE-AUT4-03** | **ENCERRADO.** Claims, snapshots e IDs, índices de unicidade, admissão, revogação, assentamento, retenção e retomada após lease estão sustentados, com as duas correções acima. Permanece a distinção entre `started` e conclusão da execução da Session. **AUT4-C01–C04/C06/C07; S04–S05.** |
| **RE-AUT4-04** | **ENCERRADO.** Sustentados os limites e o ciclo do daemon, inclusive passagem inicial, espera e continuidade após falha. A reconciliação compartilhada das **204 fontes** permanece válida, sem novo censo nem incorporação das fontes externas de Schema à população atribuída. **AUT4-C01; S06; reconciliação já recebida.** |

### Suficiência do lote

Reutilizado o exame anterior dos trechos inalterados, **não resta achado obrigatório nem evidência semântica ausente neste recorte**. As correções preservam a fidelidade aos mecanismos e seus limites, e a evidência mantém separados interpretação, contrato declarado e execução, atendendo aos critérios pertinentes de qualidade e suficiência local.

Os **T01-complementos 1–8** foram considerados como assertions declaradas. Os cenários de edição após admissão, corrida de revogação, replay manual e retomada de claims permanecem **NOT_RUN**; sua leitura não qualifica o runtime ou os fusos horários.

Os pareceres e versões anteriores permanecem preservados. Este PASS encerra **automation-4**, mantendo os aceites próprios dos outros lotes; não constitui, por si, aceite consolidado do corpo integral, binding Atlas, prova de consumidor, manutenção executada ou entrega concluída.