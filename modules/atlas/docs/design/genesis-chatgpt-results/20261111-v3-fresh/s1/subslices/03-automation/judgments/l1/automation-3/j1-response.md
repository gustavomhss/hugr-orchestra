## J1 — automation-3: REQUEST_EVIDENCE

Recebidas **2/2 partes** e **FIM_DO_LOTE**. Parecer restrito a **§6–9**, bytes **[30077,47444)** de `producers/automation/body.md` e à evidência literal recebida. Sem ferramentas.

**O recorte distingue corretamente relato, observação externa, estado local e recuperação parcial. A evidência ainda não demonstra vários fluxos centrais de Board, CI, fila e snapshots. Há também duas descrições agregadas — medição e scoped-green — que precisam ser confrontadas com seus chamadores antes de concluir fidelidade.**

Não há, por ora, defeito factual conclusivamente demonstrado que imponha `FIX-FIRST`.

### Critérios

| Decisão | Critérios | Fundamentação localizada |
|---|---|---|
| **PASS restrito ao recorte** | GO-A3; QS2–QS3 | §6–9 organizam aprofundamento por decisão, CI, fila e recuperação, com consequências práticas localizáveis. |
| **PASS restrito ao recorte** | GO-A5; GO-I2, GO-I7–I8 | O corpo qualifica heurísticas, estimativas e inferências estáticas; não promove relato, scoped-green, snapshot registrado ou import de plano a garantia operacional ampla. |
| **PASS restrito ao recorte** | GO-A7 | §9 mantém o boundary Atlas existente e não apresenta um substituto ou publicação realizada. |
| **REQUEST_EVIDENCE** | GO-A1–A2, GO-A4, GO-A6; QS1, QS4–QS6; CC1, CC3, CC7; GO-I1; AC01, AC04 | Dependem dos fluxos abaixo e da cobertura/herança já pedidas em RE-AUT1-01. A disposição compartilhada deve incluir agora §6–9. |

### Evidência obrigatória ainda ausente

#### RE-AUT3-01 — Estado, autoridade e histórico de planejamento

**Localização:** §6; B01–B03; `board.ts`, `tools.ts`, `decision.ts` e módulos de projeção/anexos.

**Pergunta:** quais ramos sustentam as transições e limites de autoridade descritos, além das verificações já mostradas?

- **Esperado:** verificar origem/backlog/intake, update em queue, archive/unarchive, dependências e steps; preservação de decisões e limites de undo/anexos.
- **Observado:** estão demonstrados o guard da porta Maestro, `requireActive`, parte de move/shipped, seleção da decisão vigente e início do controle de undo.
- **Necessário:** fluxos restantes dessas transições; leitura fresca do PR sem cache; resolução/ciclos de dependências e unicidade de step active; criação/supersession completa de decisões; conclusão da detecção de conflito de undo; autorização de notas/threads; armazenamento/remoção de anexos e projeção que omite paths/credentialID.

#### RE-AUT3-02 — Mirror, origem das métricas e medição parcial

**Localização:** §7.1 e §7.3; B04–B05/B13; `github.ts`, `money.ts`, `spend.ts`, `forecast.ts`, trail/proof/ledger.

**Pergunta:** os percursos completos sustentam importação delimitada, sincronização, leitura viva e condições de medição/forecast?

- **Esperado:** suporte aos filtros de Intake, conflitos, labels, cache, origem das parcelas e thresholds.
- **Observado:** há constantes de paginação/taxas/TTL, preservação de dirty durante push, fórmula parcial de spend e constantes de forecast.
- **Necessário:** filtros/paginação/importação de issues/comments, tratamento de overwrite/close/reopen e avanço por PR; semaphore; cache de trail; coleta de Sessions/filhos e CI; thresholds, perguntas, settings e cálculo/evaluation de forecast/ledger.

**Esclarecimento específico:** §7.3 diz “Subscription engine ou preço ausente é `not-metered`”. Em `spend.card`, linhas **30–49**, a seleção também depende de tokens e da existência de parcelas medidas; com sessões presentes, o ramo `metered.length > 0 || unmetered.length === 0` produz `usd`. Fornecer a coleta/invariantes dos inputs que delimitam essa descrição, ou qualificar a frase pelas condições efetivas. Não estou afirmando que custo real desconhecido seja zero.

#### RE-AUT3-03 — Contrato CI, tree e scoped-green

**Localização:** §7.2; B06; `board/ci.ts` e carregador do contrato.

**Pergunta:** quais condições garantem que o resultado scoped consumido pelo gate representa o conjunto de trabalho exigido naquele tree?

- **Esperado:** verificar contrato/base/defaults, construção do tree, execução e associação dos checks.
- **Observado:** o trecho de `settle` demonstra a correlação heurística; `state`, linhas **440–454**, exige algum pass de `kind === "scoped"` para satisfazer a parcela de testes.
- **Necessário:** carregamento de `.orchestra/ci.json` e tratamento da descoberta indisponível; índice temporário/preservação de timestamps; tokenização/substituições; descoberta de packages, convenção `none`, persistência e deduplicação de dispatch.

**Esclarecimento específico:** demonstrar, pelos chamadores e pela formação das rows, por que `latest.some(...scoped...pass)` cobre os “caminhos requeridos” mencionados no corpo. Se um pass parcial puder coexistir com outro trabalho scoped pendente/error no mesmo tree, essa limitação deve aparecer no entendimento de scoped-green.

#### RE-AUT3-04 — Admissão, corte e lanes

**Localização:** §8.1; B07–B08/B10; `queue.ts`, `queue-lanes.ts` e helpers de affected packages.

**Pergunta:** quais ramos completam as regras de admissão e a formação de bundles/lanes?

- **Esperado:** vinculação ao head/tree exato, record obrigatório, dependências e alcance do paralelismo.
- **Observado:** há requisitos iniciais de fila, checagem de scoped state, releitura stage/PR, busy-set local, filtros antes do corte e parte do agrupamento por overlap.
- **Necessário:** leitura/fetch do head e checks daquele tree; definição de record completo/follow-ups; dequeue/dissolução; thresholds de corte/adaptação; montagem dos merges/refs/PR; cálculo de packages via turbo, fallback global, global globs, plan drift, capacidade e regras de full safety/epic closing.

#### RE-AUT3-05 — Red, integração e recuperação

**Localização:** §8.2–§8.4; B08–B10; `queue-settle.ts`, `queue-red.ts`, `queue-shared.ts` e helpers.

**Pergunta:** os branches efetivos correspondem à tabela de saídas e delimitam corretamente a integração sobre base movido?

- **Esperado:** verificar tentativas limitadas, classificação base/code/flaky, aceite explícito, push e atualização posterior.
- **Observado:** `judge` demonstra pending/green; há classificação parcial de infra, base desconhecido, filtros pré-corte e caminho de heads/tip/push com recuperação por ancestry.
- **Necessário:** ramos de rerun/rebuild/pausa; provas das **duas falhas no base/três passes no head**; probes sem membros, bisseção/fix/isolamento/split/held; ação explícita sobre flaky e uso de `accepted`; verificação do head do próprio bundle; `skew`, write sets/packages e exceção `.atlas/`; atualizações/cleanup após push.

Para a inferência de revogação, completar o encadeamento **leitura do gate → integração**, mantendo visíveis os controles existentes e seu alcance. Os trechos já recebidos sustentam a cautela contra uma garantia de revogação atômica; não demonstram uma corrida executada.

#### RE-AUT3-06 — Snapshots, attempts, records e restore

**Localização:** §9; B11–B13; `snapshot.ts`, `conflicts.ts`, `queue-record.ts`, `tree.ts` e módulos de attempts/record port.

**Pergunta:** quais fluxos sustentam publicação/restauração de snapshot e a separação entre conhecimento importado e automação em voo?

- **Esperado:** ordem scanner/push/registro, limites de restauração e origem dos fatos publicados.
- **Observado:** scanner e comparação de tree estão demonstrados; o record mantém `doneWhen/reviews` vazios e `used: unseen`; restore exige Board vazio e recusa ação desconhecida.
- **Necessário:** criação e push das refs de snapshot, registro somente após sucesso e seleção do remote; restauração de worktree; abertura/fechamento de attempts; cálculo de conflitos sem rebase; fallback sem record port e montagem/redaction do record; aplicação dos eventos e registro de lacuna para prosa redigida. O comentário sobre tabelas excluídas do import deve acompanhar os ramos de implementação que efetivam essa disposição.

**Continuidade:** pareceres anteriores preservados. Estes pedidos tratam de suficiência semântica sobre fontes; não solicitam execução de produto nem encerram binding, operação ou critérios globais.