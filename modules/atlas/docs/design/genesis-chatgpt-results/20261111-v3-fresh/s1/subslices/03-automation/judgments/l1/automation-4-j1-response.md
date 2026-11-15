## J1 — automation-4: REQUEST_EVIDENCE

Recebidas **2/2 partes** e **FIM_DO_LOTE**. Parecer sobre **§10–14**, bytes **[47444,59832)** de `producers/automation/body.md` e evidência literal recebida. Sem ferramentas.

**A distinção entre admissão e conclusão, a corrida de revogação e o limite do wake de criação estão sustentados nos trechos apresentados.** Permanecem pendentes partes dos contratos de identidade, cadência, claims, retenção e daemon. Não há defeito factual conclusivamente demonstrado que imponha `FIX-FIRST`.

Os quatro recortes declarados de automation foram apresentados. Isso não encerra os pedidos dos lotes anteriores.

### Critérios

| Decisão | Critérios | Fundamentação |
|---|---|---|
| **PASS restrito ao recorte** | GO-A3; QS2–QS3 | §10–12 permitem comparar políticas e diagnosticar os estados; §14 organiza impacto por contrato. |
| **PASS restrito ao recorte** | GO-A5; GO-I2, GO-I7–I8; GO-A7 | O corpo distingue identidade, admissão, execução, inferência e evidência operacional; preserva autoridades externas e não propõe Atlas paralelo. |
| **REQUEST_EVIDENCE** | GO-A1–A2, GO-A4, GO-A6; QS1, QS4–QS6; CC1, CC3, CC7; GO-I1; AC01, AC04 | Dependem dos complementos abaixo e da cobertura/herança já pedidas em RE-AUT1-01. §14 é um mapa de impacto estático; sua falta de execução não é motivo desta decisão. |

### Evidência obrigatória

#### RE-AUT4-01 — Políticas, ownership e porta

**Localização:** §10; S01; `scheduled-task.ts`, `scheduled-task/capability.ts`, `shared.ts`, `sql.ts` e port.

**Pergunta:** quais fluxos aplicam a separação entre legado, capability, leitura caller-scoped e leitura de operador?

- **Esperado:** filtros efetivos por policy/placement, tratamento de IDs estrangeiros e lifecycle do binding da porta.
- **Observado:** S01 demonstra índices únicos e comparação de owner, mas não os chamadores que aplicam essa comparação nem os filtros descritos.
- **Necessário:** rotas legadas; `owned/getOwned`, `placed` e validação de owner; schema persistido de claim; derivação dos IDs; bind/unbind com restauração no Scope e falha sem binding. Incluir os campos/algoritmos que sustentam os diferentes mecanismos de dedupe da tabela.

#### RE-AUT4-02 — Cadência, catch-up e DST

**Localização:** §11; S02–S03; `model.ts`, `capability-model.ts` e validação/encoding de cadência.

**Pergunta:** a implementação completa confirma as diferenças de calendário, parsing e contagem atribuídas às duas políticas?

- **Esperado:** verificar comportamento declarado e limites de busca/contagem, sem transformar comentários em execução observada.
- **Observado:** foram recebidos planning legado, avanço hourly/calendário, início do parser cron, planning capability e resolução capability no gap.
- **Necessário:** `local` do legado; constantes de atraso/TICK e regras de pause/resume; `parseField`, rejeição de cron impossível e matching OR dos dias; `firstSlot/following`, encoding weekly, horizontes e `countWalls`. Para a contagem de matches colapsados no gap, fornecer os ramos que relacionam contagem de wall times e instante resolvido.

#### RE-AUT4-03 — Claim, admissão, manualKey e retenção

**Localização:** §10 e §12; S04–S05; `scheduled-task.ts`, `capability.ts`, `shared.ts`.

**Pergunta:** quais invariantes completam a sequência claim → dispatch → settle/takeover e permitem as conclusões sobre repeat, manualKey e histórico?

- **Esperado:** verificar lease sob transação, revalidação, consumo de slot, revisão e condições de reúso.
- **Observado:** S04 demonstra dois calls a `holds`, prompt capturado, recuperação de admissão durável, corrida revoked→started e reconciliação de claim admitida. S05 demonstra parte do manual replay e da contabilização.
- **Necessário:** planejamento/claim e verificação de slot servido; constante de lease e takeover com comparação de owner/tempo sob lock; restante do settle e poda dos últimos 20; update/pause/remove/resume/repeat; restante de `capability.run` e tratamento dos resultados não admitidos.

**Dois esclarecimentos específicos:**

1. §12 diz que verifica “owner e `holds` antes da Session e outra vez antes de prompt”. No trecho de dispatch, `cap.present` aparece antes da Session; a segunda chamada explícita é somente `cap.holds`. Fornecer **`holds` integral** para estabelecer se também revalida presença/identidade do owner. Se não o fizer, a frase deve distinguir essas verificações.
2. O trecho de manual replay retorna `reused` para um prior não revoked, recusando especificamente `running` sem admissão. Fornecer os caminhos que impedem ou tratam um prior assentado sem `SessionInput`, para sustentar “reutiliza Session somente depois de admissão”.

#### RE-AUT4-04 — Daemon e comprovação da produção

**Localização:** §12–13; S06/T01; lifecycle do scheduler e cobertura.

**Pergunta:** quais ramos completam as regras do daemon e a reconciliação da população produzida?

- **Esperado:** verificar boot, ordem stale→due, continuidade após falhas e constantes de espera; reconciliar fontes, profundidade e histórico.
- **Observado:** S06 demonstra o wrapper de wake, espera indefinida sem trabalho e insert direto de capability.create. T01 fornece um contrato de teste da corrida, corretamente marcado NOT_RUN.
- **Necessário:** início/loop do daemon, captura de falhas, seleção de stale/due e constantes de sleep/TICK. Na cobertura compartilhada de **RE-AUT1-01**, reconciliar **155 Actions + 38 Board + 11 scheduler**, **115 implementações + 89 demais fontes**, e a alegação histórica de **80/83 Actions sem leitura decisiva**. Fornecer a disposição individual de testes/fixtures/helpers e os trechos decisivos usados, sem exigir execução.

### Pontos sustentados que devem permanecer

- **S04, linhas 156–207:** `started` pode decorrer de admissão durável mesmo com falha posterior; uma claim revogada durante admissão conserva o fato e pode ultrapassar a contabilização de repeat.
- **S04, linhas 285–302:** existência de SessionInput é determinante na recuperação; não equivale a prova de wake ou trabalho externo concluído.
- **S06:** a diferença entre wrapper com wake e insert direto sustenta a inferência limitada formulada no corpo.
- **§14:** impacto semântico e compatibilidade são distintos de mera navegação ou hashes bem formados.

**Continuidade:** decisões e pedidos anteriores preservados, inclusive os subclaims já fechados expressamente. Sem aceite global, binding de runtime ou encerramento operacional.