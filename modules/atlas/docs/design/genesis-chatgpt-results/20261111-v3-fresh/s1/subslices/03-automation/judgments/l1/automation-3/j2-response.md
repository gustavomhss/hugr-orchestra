## REQUEST_EVIDENCE — automation-3, §6–9

**J2 — completude/utilidade.** Recebidas as duas partes e **FIM_DO_LOTE**. Parecer limitado ao recorte `[30077,47444)` de `producers/automation/body.md` e à evidência B01–B13 recebida.

O corpo oferece entendimento transferível e preserva limites importantes: guard da tool não é autenticação universal; resultado narrado não é prova externa; correlação de CI do Board é heurística; `no-ci`, flaky aceito e gate verde têm significados distintos; recuperação pós-push é específica. **Falta evidência literal para confirmar vários contratos de estado, fila e persistência. Nenhum defeito material está comprovado para FIX-FIRST.**

### Critérios

- **GO-A1/A2, QS2/3:** favoráveis na organização e utilidade observadas.
- **GO-A5/A6, GO-I2/I7/I8:** delimitação adequada entre fato, interpretação, estimativa, identidade e autoridade.
- **GO-A3/A4, QS1/4/5/6, GO-I1, CC1/3/7, AC01/04:** **REQUEST_EVIDENCE**, pelos pontos abaixo e pela reconciliação de cobertura/reúso já solicitada em RE-AUT1-01.
- **GO-A7:** compatível com o limite L1; sem certificação operacional.

### Evidência exata ainda necessária

**RE-AUT3-01 — Estado do Board, decisões e persistência**  
**Localização:** §6; B01–B03.

**Pergunta:** quais ramos implementam as transições e os controles descritos além de `requireActive` e move→shipped?

**Falta:** em `board/board.ts`, os intervalos de criação/intake, update de card queued, archive/unarchive, dependências com self/cycle, exclusividade de step active, notas/threads e anexos; em `decision.ts`, criação da resposta e conclusão da revisão com `supersedes_id`/`overturned_by_id`; continuação do undo desde o cálculo de `conflict` até aplicação do inverso. Para anexos, incluir projeção pública e ordem das operações de credential store/filesystem/commit.

B01–B03 já sustentam transação immediate, publicação após o trabalho transacional, guard Maestro, parte das transições, resultado narrado e restrição inicial de undo.

---

**RE-AUT3-02 — Mirror, CI e métricas**  
**Localização:** §7; B04–B06 e B13.

**Pergunta:** os caminhos completos sustentam o alcance da sincronização, a identidade por tree e as bases das estimativas?

**Falta:**

- `board/github.ts`: admissão inicial dos issues, exclusão por marker/histórico, overwrite/perguntas, deduplicação de comentários, progressão por PR e cache de minutos; fonte de Trail em B04/B13 para TTL de 30 s, estados e bypass de cache no move.
- `board/ci.ts`: carregamento/default do contrato, índice temporário com timestamps, ledger por tree/comando, `run:false`, tokenização/substituições, descoberta de packages e registro explícito do caso sem package afetado.
- `money.ts`, `spend.ts`, `forecast.ts` e fonte do ledger em B13: seleção das Sessions/filhos, thresholds, permissões de settings, throughput com zeros, uso efetivo da seed, percentis e regra de duas avaliações.

**Ponto a esclarecer:** B06 calcula a condição de testes por `latest.some(...kind === "scoped" && outcome === "pass")`. Mostrar como a produção dessas rows torna essa condição compatível com “pass dos caminhos requeridos”, especialmente quando há vários packages/comandos e resultados pending/error. Isso é pedido de contexto, não defeito já concluído.

---

**RE-AUT3-03 — Formação de bundles e tratamento de red**  
**Localização:** §8.1–8.2; B07–B09.

**Pergunta:** quais ramos sustentam admissão, corte/adaptação, composição de lanes e cada saída da tabela do gate?

**Falta:** intervalos pertinentes de `queue.ts`, `queue-lanes.ts`, `queue-shared.ts`, `queue-red.ts` e `queue-settle.ts` para:

- validação de follow-ups, obtenção/fetch do head exato e dequeue/dissolução;
- critérios de corte, adaptação após 50 outcomes, montagem/push/PR e dispatch;
- cálculo de packages na árvore integrada, fallback global, capacidade, safety e fechamento de epic;
- rollup que escolhe o run mais novo;
- limites de rerun/rebuild, duas falhas no base, três passes no head, isolamento/bisseção/fix, held e liberação;
- aceitação explícita de flaky e transição para `accepted`.

O `judge` de B08, a heurística de CI de B06, o busy-set local e a distinção base desconhecido/green de B09 já estão demonstrados.

---

**RE-AUT3-04 — Integração e inferência de revogação**  
**Localização:** §8.3–8.4; B10.

**Pergunta:** qual é a composição exata do caminho entre decisão do gate, controles de admissão, integração e registro durável?

**Falta:** em `queue-settle.ts`, checagem do head do PR do bundle, continuação após o push para rows/cleanup e implementação de `skew`/merge-if-disjoint, incluindo write sets/packages, tratamento `.atlas/` e registro de “tested on”/“merged on”. Incluir o contexto de chamada que situe os últimos filtros de pause/hold e eventuais helpers entre gate e push, para fundamentar a inferência de §8.4.

B10 já demonstra rechecagem dos heads dos membros, recuperação por ancestralidade e push com lease. Não peço reprodução de corrida.

---

**RE-AUT3-05 — Snapshot, attempts, conflicts e records**  
**Localização:** §9; B11–B13.

**Pergunta:** quais operações efetivas sustentam o que se preserva, o que se restaura e o que permanece ausente?

**Falta:**

- `snapshot.ts`: índice/ref, ligação do scanner ao bloqueio do push, remoto selecionado, gravação após push e restauração de worktree;
- fontes de attempts/conflicts identificadas em B11: fechamento/incremento/vínculos da attempt, write sets e uso de merge-tree sem rebase;
- `queue-record.ts` e writer/porta identificados em B12: fallback sem port, agregação de fatos, chamada Atlas e política para visibilidade desconhecida;
- `tree.ts`: catálogo/aplicação dos eventos e marcação da prosa redigida como lacuna, complementando o comentário sobre exclusões do import.

B11 comprova o classificador do scanner e o significado local de `pushed`; B12 comprova campos vazios/`unseen`, Board vazio e recusa de ação desconhecida. Comentários sobre a restauração não substituem sua aplicação.

**Estado:** permanecem abertos os pedidos acima e RE-AUT1-01 para cobertura pertinente. Nenhuma execução externa é exigida para resolver estas lacunas semânticas; nenhuma decisão de runtime ou da união automation é emitida.