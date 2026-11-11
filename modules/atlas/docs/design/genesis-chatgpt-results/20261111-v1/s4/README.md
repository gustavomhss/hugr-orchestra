# S4 — host, preservação e migração / Genesis 20261111-v1

**Estado: BLOCKED.** Preparação independente concluída; nenhuma integração de produto executada e nenhum aceite global atribuído.

Fonte inicial: `1cde2ff7a71bcf7aecb5d030917b577165135d38`. Protocolo: `2689c516d63488be37de678cc853dd4556fd5c13`. Prompt fixado: `cb26a0a16f5f4212553aaecb03a0dfcc1a5f098e`. A branch S4 deriva do protocolo. A revisão candidata executada permanece `null`.

## Entrega concreta para S5

- [Mapa de 12 superfícies](entrypoints.json), com callers/readers, fontes exatas e gaps de ligação do host.
- [Três propostas](proposals/manifest.json): dez controles do runtime Atlas, um controle de adição de fonte pelo atlas_context real e correção de dois detectores de escopo do workflow. Todas aguardam aplicação serial por S5.
- [17 linhas de casos de host](cases/host.json), [sete casos de seleção de CI](cases/workflow-scope.json) e [12 casos de migração/compatibilidade](cases/migration.json). São catálogos complementares, com sobreposição explícita; não são 36 recusas executadas nem um denominador repo-wide.
- [Inventário protegido](protected-inventory.json): 439 objetos Git enumerados; 88 objetos rehashados, 62 pins históricos conferidos. A comparação pós-commit da branch documental é entregue separadamente; a migração real ainda requer seus próprios estados antes/depois.
- [Migração e rollback](migration.md), mantendo publicação isolada, autoridade, fonte atual e ativação de produção separadas.
- [Verificação](verification.json) e [critérios](criteria.json), distinguindo execução de produto, preparo estático, configuração de workflow e enforcement de branch.

## Resultados efetivamente observados

Os três patches aplicam aos arquivos baseline materializados. As duas propostas TypeScript passam a verificação de sintaxe sem resolver/executar imports; o YAML alterado foi parseado e os campos superiores de política preservados. Os comandos, hashes, stdout/stderr e exit codes estão em [static-verification.json](receipts/static-verification.json). Isso não é um typecheck nem teste de produto.

O Bun 1.3.14 foi instalado isoladamente a partir do pacote pinado, conferido por SHA-512 e SHA-256 e executado apenas para verificar a versão/preparação sintática. A política de testes do AGENTS foi preservada.

O artifact histórico 13444687733 do run 42087075694 foi lido novamente. Seus 886 membros foram hashados; 103 respostas, 365 objetos CAS e 272 claims/91 lugares mantêm os vínculos verificados. A cadeia original completa de 295 envelopes não está nesse ZIP. O pedido original sem resposta, M1 aposentado, J1/R3 aberto, HOLDs históricos e uso físico UNKNOWN permanecem com essas disposições. Nenhum programa do ZIP foi executado. Detalhes: [historical-archive-receipt.json](receipts/historical-archive-receipt.json).

## Dependências recebidas e bloqueios

Os handoffs consumidos nesta rodada foram S1 `11b5eaaf1d2383070a5433e72f4b5ba578582b0c`, S2 `af063c6651123b1d5b16b7bee52b41560ad4f41d`, S3 `87804c85d4241e68a2fc3f5a5693c171b4f1a9c3` e S5 `7b1a933483e966ba324f424b9aab3f2d49326355`. Todos registram candidato `null`; os inventários/interfaces de produção e julgamentos vinculantes não foram recebidos. Foram feitas três rodadas finitas de descoberta, sem polling contínuo.

S1 publicou quota `bootstrap-v1/s4` de seis pacotes, exclusivamente de preparação. Quatro pacotes foram observados: principal e três subagentes. A contabilização do começo anterior à publicação é retrospectiva, sem alegar reserva atômica ou limite financeiro. Dois pacotes de correção permanecem não usados. Tokens, tentativas físicas e cobrança: UNKNOWN.

O hash da skill em S1 diverge dos bytes Git verificados. A [validação de dependências](receipts/dependency-validation.json) e o [pedido de correção](correction-requests.json) registram ambos os valores. A alocação de preparação foi lida e hashada diretamente; isso não valida o contrato de execução dependente nem corrige silenciosamente o handoff S1.

O conector desta sessão não expõe workflow_dispatch. Atlas usa a lane Vitest/typecheck de test.yml; `test:ci atlas` não é uma rota válida. O host Maestro tem comando test:ci próprio, mas seu transporte não foi executado. A configuração visível de dev contém proteção contra force-push/exclusão, sem status check Atlas exigido; o endpoint detalhado de proteção devolveu 403. Inspeção de configuração não comprova enforcement.

## Próximo passo concreto

S1 entrega bindings corrigidos e contrato de escopos/interfaces; S2 e S3 entregam candidatos reais. S5 aplica serialmente os patches e fixa um único candidato integrado. S4 então pode executar os casos sob a política de CI, vincular recusas/readbacks e inventários ao mesmo SHA e receber os dois julgamentos da mesma versão. Até lá AC-09, AC-10, old-producer, migração/rollback e aceite integrado permanecem indeterminados. Nenhuma policy de produção, branch de outra sessão, PR histórico ou recurso retido foi alterado.

Os arquivos sob agents/host-readers e ci preservam as respostas de autoria. Seus estados de dependência refletem o instante da preparação; os recibos do principal acrescentam a descoberta posterior sem reescrever essas respostas. Esses subagentes são autores/inspectores, não os dois juízes vinculantes da sessão 5.
