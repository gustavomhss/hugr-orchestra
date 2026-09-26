# EXECUTE — Orchestra / contrato de execução v4.1

Você é o Codex no checkout local de `gmhelmold/HuGR-Orchestra`. Execute a migração desktop/web completa. Não produza outro plano, outra identidade ou um aplicativo demonstrativo separado. Leia este arquivo e a task selecionada; carregue somente os contratos pertinentes nos subagentes.

## Autoridade e insumos

`PLAN.json`: hierarquia, cinco axiomas por nó, dependências, scopes, estágios e gates. `SURFACES.json`: capacidades, classificação, owners e estados a cobrir. `CENSUS.json`: censo concreto de arquivos do checkout, ainda UNRESOLVED nesta entrega; S01 deve completá-lo. `MAP.md`, `OWNERSHIP.md` e `issues/*.md` são projeções, não uma segunda fonte. `SPEC.md`, `CONTRACTS.md`, `PERFORMANCE.md`, `BUDGETS.json`, `COVERAGE.json`, `fixture.json` e master são normativos.

Abra `reference/approved.png`: 1672×941; SHA-256 `e839b759e0f93beca37b10cd45700725020a840fee6e97da1e67556b2ffb128d`. Essa é a escolha aprovada. Grafite discretamente azulado, azul contido, centro de conversa dominante, input inferior único e Dock acima de Tasks/Atividade à direita. Preservar montanhas dessaturadas, proporções, bordas e microacabamento. Não voltar ao roxo/ciano/neon ou às alternativas Claude/Replit.

Base remota examinada: `30d951fcc4a09e708768551c7c6fd38a0efe3da8`. Revalide o HEAD; nunca dê reset para essa base. Respeite AGENTS.md e instruções locais. Preserve trabalho preexistente; não reset/clean/stash/force-push/kill global. Use worktrees isolados por frente, sem tocar nas mudanças do usuário. Testes e typecheck são por package; branch curta sem slashes conforme host.

## Marca HuGR fornecida

Antes de executar S05, leia `BRAND-INTEGRATION.md`, `BRAND-ASSETS.json`, `vendor/HuGR-Brand-Kit-v1.0/AGENT-START-HERE.md` e o runbook do kit. A marca vem pronta; não vetorize/reconstrua/otimize/reexporte. Use SVG externo com adaptador Solid, não o componente React do exemplo. Orchestra continua o nome do produto e o tema grafite continua aprovado. Não copiar o kit inteiro para o diretório público.

`python3 tools/verify_brand.py` verifica origem e mapa; `--repo /caminho/worktree` confere cópias necessárias, não funcionamento do aplicativo. Não reaproveite recibos anteriores sem reavaliação dos contratos afetados. S05 continua planned, não PASS. O kit resolve a origem da marca; não entrega paisagem nem build nativo.

## Inicialização verificável

Coloque o pacote em `specs/orchestra-visual/` apenas depois de comparar o destino e mesclar sem sobrescrever trabalho diferente. Os caminhos de prova nos recibos são relativos à raiz do pacote. Execute dali:

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
3. **S25-W0-T1**: primeiro candidato funcional usando shell S06, Dock S15/bridge S16 e controllers de conversa, input, review e Tasks que já existem. Tem 15 pré-requisitos de task, não os 44 da v3. **S25-W0-T2** verifica macrocomposição, foco, scroll e custos locais antes da migração ampla. Não é aceite final de microacabamento.
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

Um coordenador escreve `progress.json`. `--jobs 4` limita RUNNING + novas seleções; excesso já em execução não é cancelado automaticamente. Cada frente usa worktree/branch própria. Benchmark reserva hardware e não disputa recursos com builds ou capturas pesadas. O seletor é read-only e não é um serviço de locks concorrentes.

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

Código no aplicativo existente, comparação ao master, cobertura de telas/estados, medições reproduzíveis, comandos de execução e rollback, SHA e limitações reais. Nenhuma task do produto vem aprovada neste ZIP. Não terminar em documentação, mock ou só Storybook; não forçar push/merge/release e não fechar com gate reprovado.

Consulte RECEIPTS-v4.md para formatos e tools/README.md para comandos. GITHUB.json distingue o que foi publicado do que permanece no pacote; não recrie os 39 tickets. A projeção nativa de dependências não substitui o DAG fino.
