# Orchestra — migração visual integral

<!-- orchestra-widgets43:begin -->
## Widgets fechados — contrato 4.3

**Antes de implementar um widget, abra [WIDGETS.md](WIDGETS.md).** W01 checklist/todowrite; W02 diff; W03 testes/output; W04 Browser/Files/Docs/Terminal; W05 Tasks; W06 Atividade; W07 ações; W08 atalhos das features; W09 microacabamento e custo integrado. Os IDs Wxx e casos WKxx aparecem diretamente no corpo da sua issue/WP/task.

As seções indicam fontes e campos reais, paths de implementação, callbacks e efeitos exatos, estados, limites e testes. Docs é documentação local; Criar PR… prepara draft revisável sem publicar; repetir testes exige comando/contexto compatível e confirmação. Inputs de todowrite não são prova e metadata.output não é log completo. Nenhuma omissão de binding é aprovada como capability ausente.

DAG, 38 WPs/66 tasks, piloto antecipado, fronteiras de escrita e budgets 4.2 preservados. A fixture é sintética e foi alinhada aos campos reais; produto ainda NOT_RUN. A avaliação da publicação está em [reviews/widget-contracts/PUBLICATION.json](reviews/widget-contracts/PUBLICATION.json), e os limites da revisão em [reviews/widget-contracts/REVIEW.md](reviews/widget-contracts/REVIEW.md).
<!-- orchestra-widgets43:end -->


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

<!-- orchestra-pa-42:begin -->
## Execução proporcional e paralela — 4.2

As correções de PA-01–PA-06 estão em [reviews/parallelism-performance/repairs/REVIEW.md](reviews/parallelism-performance/repairs/REVIEW.md). O grafo preserva os mesmos 38 WPs/66 tasks. Use `verification_tier` e `dependency_inputs` da unidade: implementar consome a entrega T1 local; a auditoria cruzada completa fica no aceite. S22-T1 fornece copy/parity cedo; o piloto S25-W0 tem prioridade e 11 pré-requisitos.

P01 usa dois manifests reais, não cinco repetições de valores estáticos. S23-T2 coleta a campanha completa; S25-T2 valida/reutiliza artefatos do mesmo candidato sem repetir o soak. P03 exige teto absoluto e proteção contra regressão. Tendência de memória é assinada, com ruído inconclusivo não aprovado. Os consumidores de tema e governança estão explicitamente na matriz de capturas.

Para coletar: task já RUNNING → `python3 tools/select_work.py --collect ID` → se READY_TO_RESERVE, registrar phase=collect e conferir processos reais → medir → registrar phase=review e liberar o host. Nenhum processo é iniciado, pausado ou morto automaticamente. Não medir durante compilação/captura concorrente. Provas e axiomas continuam obrigatórios; a reforma visual ainda não está implementada.
<!-- orchestra-pa-42:end -->
