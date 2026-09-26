# Revisão adversarial v3 — execução, não redesign

Data: 26/09/2026. Base de código documentada permanece `30d951fcc4a09e708768551c7c6fd38a0efe3da8`. Referência visual e layout aprovados não mudaram. Nenhum código de produto foi alterado nesta revisão.

## Falhas demonstradas e correções

| ID | Problema | Correção / controle |
|---|---|---|
| R01 | v2 aceitava recibo sem visual/performance | Três categorias explícitas; omissão reprova. Reprodutor v2 em qa/baseline-negative-probes.json |
| R02 | v2 aceitava estado inventado em categoria | Enum fechado; BANANA e NOT_RUN não liberam conclusão |
| R03 | Presença de arquivo podia ser tratada como prova suficiente | Inventário SHA-256, recusa de vazio/escape/alteração; PNG tem checagem de cabeçalho e relatório exige JSON tipado |
| R04 | Recibo não identificava o contrato avaliado | contract_sha256 da task; mudança de contrato exige nova avaliação |
| R05 | Código alterado podia manter PASS apenas porque havia recibo | --repo verifica ancestry e mudanças relevantes, incluindo dirty/untracked; gates finais observam packages/manifests |
| R06 | Evidência nativa podia ser dispensada silenciosamente | native explícito e gates específicos por owner; Mac indisponível continua NOT_RUN |
| R07 | Paths do recibo não eram confrontados com ownership | paths_changed seguro e validado contra write_paths/exclude_paths |
| R08 | Campos malformados e IDs repetidos escapavam ao contrato | Validação de tipos, hierarquia, etapas, criterion IDs globalmente únicos e dependências de ancestrais |
| R09 | Dependências de tradução serializavam tarefas sem UI | S16/S17 não dependem de S22; limites de execução e testes permanecem |
| R10 | Graph de GitHub continha dependências redundantes | Redução transitiva: 118 relações brutas v3 → 55; 35 pais; restrições finas continuam em PLAN |
| R11 | Vários axiomas de execução eram genéricos | Critérios de steps/casos, qualidade e invariantes materializados por domínio/task; 1.898 critérios, sem aumentar os 39 tickets |
| R12 | Regeneração local podia divergir do plano | render_issues.py --check confronta os 39 Markdown com PLAN.json |
| R13 | Endurecimento de frescor podia invalidar a task ao gravar seu recibo | Evidências e progress.json não são mudanças de produto; mapas/fixtures/contratos continuam observados |
| R14 | Exigir todos os testes nativos em toda lane criava escopo indevido | Chrome, overlays, Dock e performance têm conjuntos de gates próprios; integração final reúne o necessário |
| R15 | “68 superfícies” podia soar como 68 telas exercitadas | Inventário classificado em UI, fontes, medidas, lacunas e referência; alcance local ainda deve ser verificado em S01 |

## Evidência desta revisão

A suite v2 original passou seus 37 testes antes das mutações adversariais. Os dois reprodutores R01/R02 foram aceitos pelo validador antigo apesar de deverem falhar. O pacote v3 acrescenta recusas e controles de lifecycle/frescor. Veja qa/tool-tests.log e QA_REPORT.md para o resultado final.

Não confundir hashes com assinatura ou autenticidade; não confundir campo PASS com métrica calculada. Os controles estruturais complementam a execução e revisão, não substituem julgamento de código, causalidade de métricas, comparação visual ou verificação funcional. Um arquivo pode ser íntegro e conter uma conclusão errada.

## Publicação e limites

Os 39 tickets já existiam; esta revisão não cria outros. A hierarquia nativa continua não aplicada por esta sessão. Consulta ao endpoint de filhos de #130 retornou lista vazia; isso não é auditoria exaustiva de todas as relações. O sincronizador reread/preflight continua necessário antes de qualquer escrita.

O Mac conectado estava offline e o container não obteve clone por rede. Portanto, não houve expansão integral dos scopes no checkout, testes de produto, benchmark, render de UI ou Electron. S01 permanece a primeira task pronta; zero tasks de implementação são promovidas a PASS.

O ZIP v3 é o pacote completo. Arquivos de revisão publicados na branch são complementos; onde um artefato não foi enviado ao GitHub, a entrada deve dizer explicitamente para obtê-lo do pacote, sem fingir que PLAN.json ou a imagem já estão no checkout.
