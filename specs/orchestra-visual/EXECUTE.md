# EXECUTE — Orchestra / contrato de execução v4.3

<!-- executor-design-complement -->
## Assets e decisões para começar sem inventar aparência

**[design/README.md](design/README.md)** localiza as peças reutilizáveis. **[design/zen/README.md](design/zen/README.md)** separa materiais, chrome, controles, sidebar e estados inspirados no Zen. **[design/REQUESTS.md](design/REQUESTS.md)** responde A1–A11, B1–B10 e C1; **[design/gallery.html](design/gallery.html)** indexa as 22 referências PNG de interface. Abra localmente o HTML ou os PNGs individuais no GitHub.

Tokens medidos/decididos, SVGs oficiais, paisagem limpa, 33 ícones de inspeção, copy PT-BR/EN e fonte HTML/CSS estão disponíveis; os blocos Axx pertinentes aparecem no pacote da sua task e nos cinco axiomas. `PLAN.json` é 4.4; DAG, owners, 38 WPs/66 tasks e budgets permanecem. S01 ainda precisa ser executada; não use as imagens de design como evidência de produto.

<!-- orchestra-widgets43:begin -->
## Widgets fechados — contrato 4.3

**Antes de implementar um widget, abra [WIDGETS.md](WIDGETS.md).** W01 checklist/todowrite; W02 diff; W03 testes/output; W04 Browser/Files/Docs/Terminal; W05 Tasks; W06 Atividade; W07 ações; W08 atalhos das features; W09 microacabamento e custo integrado. Os IDs Wxx e casos WKxx aparecem diretamente no corpo da sua issue/WP/task.

As seções indicam fontes e campos reais, paths de implementação, callbacks e efeitos exatos, estados, limites e testes. Docs é documentação local; Criar PR… prepara draft revisável sem publicar; repetir testes exige comando/contexto compatível e confirmação. Inputs de todowrite não são prova e metadata.output não é log completo. Nenhuma omissão de binding é aprovada como capability ausente.

DAG, 38 WPs/66 tasks, piloto antecipado, fronteiras de escrita e budgets 4.2 preservados. A fixture é sintética e foi alinhada aos campos reais; produto ainda NOT_RUN. A avaliação da publicação está em [reviews/widget-contracts/PUBLICATION.json](reviews/widget-contracts/PUBLICATION.json), e os limites da revisão em [reviews/widget-contracts/REVIEW.md](reviews/widget-contracts/REVIEW.md).
<!-- orchestra-widgets43:end -->


Você é o Codex no checkout local de `gmhelmold/HuGR-Orchestra`. Execute a migração desktop/web completa. Não produza outro plano, outra identidade ou um aplicativo demonstrativo separado. Leia este arquivo e a task selecionada; carregue somente os contratos pertinentes nos subagentes.

## Entrada no GitHub

Épico principal: [#215](https://github.com/gmhelmold/HuGR-Orchestra/issues/215). Todas as especificações, ferramentas, projeções de tickets, imagem aprovada e o kit HuGR estão nesta pasta. Consulte [PUBLICATION.json](PUBLICATION.json) para proveniência e verificação. A branch publica o planejamento, não uma implementação concluída nem um merge em dev.

## Autoridade e insumos

`PLAN.json`: hierarquia, cinco axiomas por nó, dependências, scopes, estágios e gates. `SURFACES.json`: capacidades, classificação, owners e estados a cobrir. `CENSUS.json`: censo concreto de arquivos do checkout, ainda UNRESOLVED nesta entrega; S01 deve completá-lo. `MAP.md`, `OWNERSHIP.md` e `issues/*.md` são projeções, não uma segunda fonte. `SPEC.md`, `CONTRACTS.md`, `PERFORMANCE.md`, `BUDGETS.json`, `COVERAGE.json`, `fixture.json` e master são normativos.

Abra `reference/approved.png`: 1672×941; SHA-256 `e839b759e0f93beca37b10cd45700725020a840fee6e97da1e67556b2ffb128d`. Essa é a escolha aprovada. Grafite discretamente azulado, azul contido, centro de conversa dominante, input inferior único e Dock acima de Tasks/Atividade à direita. Preservar montanhas dessaturadas, proporções, bordas e microacabamento. Não voltar ao roxo/ciano/neon ou às alternativas Claude/Replit.

Base remota examinada: `30d951fcc4a09e708768551c7c6fd38a0efe3da8`. Revalide o HEAD; nunca dê reset para essa base. Respeite AGENTS.md e instruções locais. Preserve trabalho preexistente; não reset/clean/stash/force-push/kill global. Use worktrees isolados por frente, sem tocar nas mudanças do usuário. Testes e typecheck são por package; branch curta sem slashes conforme host.

## Marca HuGR fornecida

Antes de executar S05, leia `BRAND-INTEGRATION.md`, `BRAND-ASSETS.json`, `vendor/HuGR-Brand-Kit-v1.0/AGENT-START-HERE.md` e o runbook do kit. A marca vem pronta; não vetorize/reconstrua/otimize/reexporte. Use SVG externo com adaptador Solid, não o componente React do exemplo. Orchestra continua o nome do produto e o tema grafite continua aprovado. Não copiar o kit inteiro para o diretório público.

`python3 tools/verify_brand.py` verifica origem e mapa; `--repo /caminho/worktree` confere cópias necessárias, não funcionamento do aplicativo. Não reaproveite recibos anteriores sem reavaliação dos contratos afetados. S05 continua planned, não PASS. O kit resolve a origem da marca; não entrega paisagem nem build nativo.

## Inicialização verificável

O pacote completo já está versionado nesta pasta da branch `visual-migration-plan`. Não é necessário obter ZIP ou anexos do chat. Se transportar o plano para outro worktree, compare o destino e mescle sem sobrescrever trabalho diferente. Os caminhos de prova nos recibos são relativos à raiz do pacote. Execute dali:

```sh
python3 tools/verify_brand.py
python3 tools/validate_plan.py
python3 tools/render_issues.py --check
python3 tools/render_maps.py --check
python3 -m unittest discover -s tools -p 'test_*.py' -v
python3 tools/select_work.py --repo /caminho/HuGR-Orchestra --jobs 4
python3 tools/select_work.py --show S01-W1-T1
```

Apenas S01-W1-T1 começa pronta. A validação do pacote não simula um censo já feito. `--census-strict` deve falhar no checkout enquanto houver arquivos de UI sem classificação. Antes de encerrar S01:

```sh
python3 tools/census.py --repo /caminho/HuGR-Orchestra --out evidence/S01/census-candidate.json
# Inspecione imports/rotas/exports e classifique o candidato; atualize os canônicos.
python3 tools/render_maps.py
python3 tools/render_issues.py
python3 tools/validate_plan.py --repo /caminho/HuGR-Orchestra --census-strict
```

Cada TSX/CSS pertinente descoberto deve ter disposição `migrate`, `inherit` ou `out-of-scope`, fonte e razão. Migrar exige writer compatível; herdar exige consumidor coberto. Nenhum arquivo real precisa ser editado só porque existe. Fontes/leitores não são telas. S01 pode atualizar PLAN/SURFACES/CENSUS e projeções, mas não tem autoridade para mudar o design ou relaxar budgets.

## Ordem que evita retrabalho

1. S01: censo e fronteiras; S02: fixture e coleta real sobre a suíte existente. O avaliador determinístico já está neste pacote; não o substitua por PASS preenchido à mão.
2. S03/S04/S05: tema, primitives e assets. S22: copy/locales/testes iniciais. S16/S17 não esperam tradução.
3. **S25-W0-T1**: primeiro candidato funcional usando shell S06, Dock S15/bridge S16 e controllers de conversa, input, review e Tasks que já existem. Tem 11 pré-requisitos de task, não os 44 da v3. **S25-W0-T2** verifica macrocomposição, foco, scroll e custos locais antes da migração ampla. Não é aceite final de microacabamento.
4. Continuar pelas frentes disjuntas: home/settings/providers/diálogos/Janitor não são pré-requisitos desse piloto. O piloto não é motivo para parar ou perguntar a paleta novamente.
5. **S25-W1-T1** integra o restante e entrega candidato com builds/smoke locais. Não exige o resultado futuro de S23/S24. S23 mede, S24 revisa; **S25-W1-T2** só fecha com os gates do mesmo candidato.
6. S19/S20-W1 entregam estados verdadeiros, inclusive unavailable/HOLD. W2 local só começa com fonte autoritativa comprovada e codegen autorizado. A T1 entrega adapter/consumer local; S25 pode importar essa entrega; T2 prova o caminho live conectado. Ausência de W2 não impede a migração visual honesta, mas impede declarar a capacidade live entregue.

## Executar cada task

Antes de escrever, capture a baseline em arquivo NOVO; não faça esse registro retroativamente:

```sh
python3 tools/capture_scope.py --repo /caminho/worktree --out evidence/S17/source-before.json
python3 tools/receipt_template.py S17-W1-T1 --out evidence/S17/W1-T1.draft.json
```

Leia `write_paths`, `exclude_paths`, eventuais `leased_write_paths`, `source_watch_paths`, axiomas e contratos. Faça a menor alteração correta, incluindo casos positivos/negativos e revisão renderizada onde aplicável. Não modifique hotspots de outro owner. T1 prova a entrega local; T2 verifica os critérios dessa fatia; os gates integrados avaliam o conjunto.

Use commits atribuíveis à task. O recibo registra baseline, lista COMPLETA `git rev-list --reverse --topo-order BASE..HEAD` e o footprint real (incluindo ambos os lados de renames). Não omita arquivos gerados. Worktree inicialmente dirty não é limpo: se houver sobreposição com o escopo, use outro worktree; mudanças não relacionadas continuam preservadas.

Preencha IDs exatos dos cinco axiomas, comandos/cwd/exit/logs, revisão, capturas e dados brutos. Depois:

```sh
python3 tools/seal_receipt.py evidence/S17/W1-T1.draft.json --out evidence/S17/W1-T1.json
python3 tools/validate_evidence.py S17-W1-T1 evidence/S17/W1-T1.json --repo /caminho/worktree
```

Só após examinar resultados reais, o coordenador atualiza `progress.json` com `status: PASS`, SHA e caminho de prova. Templates começam NOT_RUN; selar bytes não executa teste nem torna uma conclusão verdadeira. Sem `--repo`, há apenas análise estrutural: o seletor não consome PASSs como entregas verificadas.

## Paralelismo, imports e reparo

Um coordenador escreve `progress.json`. `--jobs 4` limita RUNNING + novas seleções. O seletor prioriza os pré-requisitos do próximo marco do piloto, sem ignorar dependências. Cada frente usa worktree/branch própria. Somente `phase=collect` reserva o host durante amostragem; `work` e `review` não retêm a reserva inteira. Antes da coleta, `select_work.py --collect ID` precisa retornar READY_TO_RESERVE; WAIT (exit 2) não autoriza medir. O coordenador registra collect e confere processos/energia reais; ao terminar registra review. Reviews concorrentes não podem usar ferramentas locais durante coleta. O seletor é read-only, não um serviço de locks de SO.

S25 é único integrador de app.tsx, session.tsx, session-side-panel.tsx, settings context e wiring native. Imports de outros owners devem constar em `source.imported_receipts`; cada recibo de origem é verificado e precisa ser ancestral do candidato. Uma alteração fora do scope de S25 só é aceita se o blob/modo final corresponder ao produtor verificado. Conflito que modifica o conteúdo volta ao owner. Não há import recursivo de recibos nem permissão de escrita irrestrita.

Histórico não é estado atual: S01 e o piloto W0 são milestones históricos, vinculados ao contrato. Integração prevista não os torna falsos. Demais entregas observam outputs próprios; gates finais observam TODO código de produto e manifests de build. `read_paths` contextual não é promessa de que todo arquivo lido ficará imutável. Mudança de interface/contrato/cobertura exige atualização canônica e novas provas afetadas.

```sh
python3 tools/select_work.py --affected-by S17-W1-T1
python3 tools/select_work.py --repo /caminho/HuGR-Orchestra --jobs 4 --all
```

`--affected-by` é cone POTENCIAL para revisão, não ordem para invalidar tudo. `REPAIR_REQUIRED` lista recibos inválidos e permite selecionar reparo desbloqueado; não apague provas antigas, não reescreva hashes para manter PASS. Alteração posterior ao aceite final exige repetir os gates correspondentes.

## Performance e acabamento, juntos

Leia os P01–P12 e Q01–Q16. O cenário medido inclui assets/efeitos/widgets de produção. Não desative recursos para produzir um benchmark mais leve. Use `tools/evaluate_performance.py` sobre observações A/B e BUDGETS.json; o validador recalcula, não confia em rótulos. O manifesto visual exige superfície, estado, viewport, DPR, zoom, host, origem, build, fixture/master e revisão. Electron não é provado por uma captura DOM.

Sem backend verdadeiro: estado indisponível, não botão cenográfico. Atlas é conhecimento; Dock é browser; Janitor permanece read-only. Nenhum progresso por tempo/tokens, teste verde por prosa do modelo, presença inventada, limpeza destrutiva ou autoridade de aprovação baseada em hash fornecido pelo LLM.

## Entregar

Código no aplicativo existente, comparação ao master, cobertura de telas/estados, medições reproduzíveis, comandos de execução e rollback, SHA e limitações reais. Nenhuma task do produto vem aprovada pela publicação do plano. Não terminar em documentação, mock ou só Storybook; não forçar push/merge/release e não fechar com gate reprovado.

Consulte RECEIPTS-v4.md para formatos e tools/README.md para comandos. O épico principal é #215. GITHUB.json e PUBLICATION.json registram os 39 tickets subordinados reconciliados e as relações nativas verificadas; não recrie tickets. Os documentos de QA anteriores registram o estado histórico de cada revisão, não a situação atual de publicação. A projeção nativa de dependências não substitui o DAG fino.

<!-- orchestra-pa-42:begin -->
## Execução proporcional e paralela — 4.2

As correções de PA-01–PA-06 estão em [reviews/parallelism-performance/repairs/REVIEW.md](reviews/parallelism-performance/repairs/REVIEW.md). O grafo preserva os mesmos 38 WPs/66 tasks. Use `verification_tier` e `dependency_inputs` da unidade: implementar consome a entrega T1 local; a auditoria cruzada completa fica no aceite. S22-T1 fornece copy/parity cedo; o piloto S25-W0 tem prioridade e 11 pré-requisitos.

P01 usa dois manifests reais, não cinco repetições de valores estáticos. S23-T2 coleta a campanha completa; S25-T2 valida/reutiliza artefatos do mesmo candidato sem repetir o soak. P03 exige teto absoluto e proteção contra regressão. Tendência de memória é assinada, com ruído inconclusivo não aprovado. Os consumidores de tema e governança estão explicitamente na matriz de capturas.

Para coletar: task já RUNNING → `python3 tools/select_work.py --collect ID` → se READY_TO_RESERVE, registrar phase=collect e conferir processos reais → medir → registrar phase=review e liberar o host. Nenhum processo é iniciado, pausado ou morto automaticamente. Não medir durante compilação/captura concorrente. Provas e axiomas continuam obrigatórios; a reforma visual ainda não está implementada.
<!-- orchestra-pa-42:end -->
