# Orchestra — migração visual integral

> **Codex: [COMECE AQUI](START-HERE.md).** Para localizar qualquer ticket, WP, task ou entrada de código: [INDEX.md](INDEX.md). Este é um guia de navegação; EXECUTE.md e PLAN.json continuam sendo o contrato.

**Épico principal: [#215](https://github.com/gmhelmold/HuGR-Orchestra/issues/215). Entrada executável: [EXECUTE.md](EXECUTE.md).**

Este checkout contém todas as especificações, o grafo completo, os cinco axiomas em cada unidade, as ferramentas, a referência aprovada e o kit HuGR. Não depende de anexos do chat. O pacote original de 430 arquivos foi importado e conferido no commit 9b65a109eba3cf182d11ef5a13302915b6c7636f. Os arquivos operacionais de publicação foram posteriormente reconciliados; a proveniência por arquivo está em publication/SOURCE-PACKAGE.json e o estado atual em PUBLICATION.json.

## Organização

Épico principal #215 → quatro frentes #130–133 → dez issues #134–143 → 25 subissues #144–168. Os 38 work packages e 66 tasks permanecem dentro dos contratos completos de seus tickets; não são 104 tickets extras. Todos preservam DoD, Invariants, Quality standards, Completeness criteria e Success criteria. Relação pai/filho e bloqueio de fechamento de issue não substituem o DAG fino de tasks.

## Arquivos

- PLAN.json, SURFACES.json, CENSUS.json e COVERAGE.json: grafo, escopo, owners e cobertura.
- SPEC.md, CONTRACTS.md, PERFORMANCE.md e BUDGETS.json: apresentação, integração, performance e aceite.
- issues/: cópias canônicas completas dos 39 tickets subordinados, incluindo WPs/tasks.
- reference/approved.png: mock aprovado, intacto.
- vendor/HuGR-Brand-Kit-v1.0/: 304 arquivos oficiais de marca e handoff, intactos; não copiar tudo ao runtime.
- BRAND-INTEGRATION.md e BRAND-ASSETS.json: variantes e integração da marca sem redesenho.
- tools/: validação, seleção de trabalho e comprovação; nenhum script simula produto concluído.
- publication/: provas da publicação e verificação nativa do GitHub.

## Início

Leia EXECUTE.md, abra o master e comece por S01-W1-T1. Preserve o checkout atual. Depois do censo/fundação, faça o piloto conectado S25-W0; continue pelas frentes disjuntas e pelos gates reais. Performance e microacabamento são obrigatórios no mesmo build.

**Publicação completa não é implementação pronta.** CENSUS local e tasks de produto continuam pendentes; não houve build, benchmark ou teste Electron do Orchestra nesta publicação. Relatórios anteriores de revisão são históricos; o estado atual está em PUBLICATION.json.
