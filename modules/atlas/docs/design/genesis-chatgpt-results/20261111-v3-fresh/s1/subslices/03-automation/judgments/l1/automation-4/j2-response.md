## REQUEST_EVIDENCE — automation-4, §10–14

**J2 — completude/utilidade.** Recebidas as duas partes e **FIM_DO_LOTE**. Parecer sobre o recorte `[47444,59832)` de `producers/automation/body.md` e S01–S06/T01 apresentados.

O conteúdo distingue corretamente as duas políticas, admissão de prompt versus conclusão, lease versus duração da Session e revisão versus cancelamento. **A corrida de revogação e o recibo `started` sem contabilização estão diretamente sustentados por S04/T01.** A inferência sobre wake está explicitamente limitada e apoiada na comparação entre wrapper e `create`, sem se apresentar como teste de liveness.

Persistem lacunas de evidência em escopo/port, algoritmos temporais, lifecycle completo das claims e reconciliação da população. **Nenhum defeito material comprovado exige FIX-FIRST.**

### Critérios

- **GO-A1/A2, QS2/3:** favoráveis na utilidade e organização observadas.
- **GO-A5/A6, GO-I2/I7/I8:** distinções de autoridade, tempo, intenção e limite de prova adequadas.
- **GO-A3/A4, QS1/4/5/6, GO-I1, CC1/3/7, AC01/04:** **REQUEST_EVIDENCE**, nos pontos abaixo e nos pedidos ainda abertos dos recortes anteriores.
- **GO-A7:** compatível com a fase; o mapa de manutenção não é apresentado como rebuild executado.

### Evidência exata ainda necessária

**RE-AUT4-01 — Separação de políticas, placement e port**  
**Localização:** §10; S01.

**Pergunta:** quais ramos impõem a separação de leitura/autoridade e implementam o binding scoped descrito?

**Falta:** em `scheduled-task.ts` e `scheduled-task/capability.ts`, filtros das rotas legado, `owned/getOwned`, `placed` e validação de presença do owner; nos arquivos de port/shared associados a S01, bind/unbind, restauração do vínculo anterior e falha sem binding. Incluir composição de IDs, snapshots de prompt/messageID e campos de lease em shared/sql.

S01 comprova os índices únicos e a comparação exata de owner, mas não demonstra onde todos esses controles são aplicados.

---

**RE-AUT4-02 — Cadência, DST, cron e limites de busca**  
**Localização:** §11; S02–S03.

**Pergunta:** as funções completas sustentam os comportamentos temporais específicos e seus limites?

**Falta:**

- `scheduled-task/model.ts`: `local`, regras de resume/once e constantes pertinentes, completando a prova do DST legado.
- `capability-model.ts`: `parseField`, validação de regra impossível, predicado de calendário que aplica DOM/DOW, `firstSlot/following`, busca/contagem e seus horizontes.
- Constantes que distinguem o minuto de tolerância capability, atraso de 24 horas e TICK do daemon; trecho de `countWalls` pertinente aos matches colapsados no gap.

S02 sustenta seleção do último slot e avanço hourly/calendário. S03 sustenta catch-up por `due.latest`, formato inicial do cron e resolução capability do gap. Não peço execução de timezone ou qualificação da biblioteca externa.

---

**RE-AUT4-03 — Claim, atualização, retenção e retomada**  
**Localização:** §10 e §12; S04–S06.

**Pergunta:** quais caminhos completam as transições descritas, principalmente antes da admissão e após falha manual ou lease vencido?

**Falta:** intervalos de `scheduled-task.ts`, `capability.ts` e shared/sql que demonstrem:

- planejamento/claim sob transação immediate, slot servido, valor de lease e takeover com rechecagem de row/owner/tempo;
- settle normal e atualização/reprogramação legado;
- continuação de `capability.run` após as linhas 335–364, incluindo limpeza de claim manual sem admissão;
- update/pause/resume, incremento de revisão, lowering de repeat, exhausted e remoção por cascade;
- poda dos últimos 20 runs;
- sequência do daemon: tick inicial, stale antes de due, recuperação de falha e constantes de espera.

**Questão específica de contexto:** S05 só bloqueia reutilização sem admissão quando a row anterior está `running`, e depois retorna `reused`. Mostrar como os demais caminhos impedem uma claim manual não admitida, em outro estado retido, de contradizer “reutiliza Session somente depois de admissão”. O trecho isolado ainda não permite decidir isso.

A corrida após último `holds`, seu assentamento como `started`, o replay com messageID/prompt retidos e a distinção de contabilização manual já estão substancialmente demonstrados.

---

**RE-AUT4-04 — Cobertura consolidada e origem histórica**  
**Localização:** §13; complementa RE-AUT1-01.

**Pergunta:** a disposição individual confirma as 204 fontes e as profundidades de leitura declaradas, inclusive a lacuna histórica de 80/83 Actions?

**Falta:** reconciliação verificada da população **155/38/11**, implementações **83/25/7** e 89 testes/fixtures/helpers; `coverage.jsonl` com disposição por fonte; intervalos históricos que sustentem os números e o entendimento herdado. T01 demonstra um contrato de regressão do scheduler, mas não a disposição dos demais arquivos.

Esse pedido pode ser atendido uma vez para automation-1–4. Não exige rodar os testes nem converter fixtures em prova de runtime.

**Estado:** **REQUEST_EVIDENCE** para automation-4 e para a união dos quatro recortes enquanto seus pedidos estiverem abertos. O recebimento integral dos bytes não substitui suficiência semântica, binding ou obrigações operacionais.