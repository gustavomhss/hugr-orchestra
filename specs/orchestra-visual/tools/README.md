# Ferramentas / uso operacional v4.1

Python 3.9+ e Git. Somente biblioteca padrão; nenhuma dependência nova no runtime do Orchestra. gh já autenticado somente para sincronização GitHub explicitamente aplicada. Não instalam pacotes, não compilam o produto, não escrevem código de UI e não simulam subagentes.

| Comando | O que comprova / modifica |
|---|---|
| python3 tools/validate_plan.py | Contrato, DAG, axiomas, gates tipados, scopes e referência; não o checkout inteiro. |
| python3 tools/census.py --repo REPO --out evidence/S01/census-candidate.json | Descobre arquivos via Git e grava arquivo NOVO com classificações pendentes; não muda o checkout. |
| python3 tools/validate_plan.py --repo REPO --census-strict | Reprova UI não classificada, owner incompatível e censo obsoleto. S01 preenche CENSUS/PLAN/SURFACES antes de PASS. |
| python3 tools/render_maps.py [--check] | Gera/confere MAP.md e OWNERSHIP.md dos canônicos. |
| python3 tools/render_issues.py [--check] | Gera/confere as 39 projeções locais dos tickets. Não publica. |
| python3 tools/select_work.py --repo REPO --jobs 4 [--all] | Verifica claims, deps, fontes e capacidade total; retorna tarefas prontas. Nunca altera progress. |
| python3 tools/select_work.py --show ID | Task e axiomas ancestrais; aplicar sem antecipar fechamento dos pais. |
| python3 tools/select_work.py --affected-by ID | Cone POTENCIAL para revisão; não ordem de reset global. |
| python3 tools/capture_scope.py --repo REPO --out evidence/OWNER/source-before.json | Baseline ANTES da escrita; grava novo arquivo e preserva dirty/index. |
| python3 tools/receipt_template.py ID --out evidence/OWNER/receipt.draft.json | Template NOT_RUN do esquema3. |
| python3 tools/seal_receipt.py DRAFT --out RECEIPT | Catalogação SHA dos artefatos; não muda resultados ou verifica conteúdo semântico. |
| python3 tools/validate_evidence.py ID RECEIPT --repo REPO | Valida critérios, footprint Git, contrato, prova externa quando pertinente via seletor e categorias. Sem --repo só estrutura, não fonte verificada. |
| python3 tools/evaluate_performance.py RAW --gates P03 P08 --out RESULT | Calcula resultados contra BUDGETS.json; novo arquivo, não coleta. O recibo recalcula novamente. |
| python3 tools/github_sync.py --offline | Relações desejadas, sem consultar ou alterar GitHub. |
| python3 tools/github_sync.py | Preflight/dry-run real com gh; não escreve. |
| python3 tools/github_sync.py --apply | Cria somente relações ausentes dos tickets existentes e verifica. Não recria, fecha ou reparenteia. |
| python3 -m unittest discover -s tools -p 'test_*.py' -v | Testa ferramentas com dados/Git/API sintéticos isolados. Não testa Orchestra. |

Códigos de saída: validadores/evaluator retornam não-zero em FAIL; seletor retorna 0 com REPAIR_REQUIRED quando pode indicar reparos, mantendo invalid_claims explícitos. Não tratar exit0 isolado como todas as tasks aprovadas.

Capture manifesto: use required_captures da biblioteca visual_coverage, ou a matriz JSON de COVERAGE/SURFACES. Recibo externo: formato em RECEIPTS-v4.md. O contexto de cada subagente deve conter somente task+axiomas+contratos aplicáveis, não os143nós.

Nunca use as fixtures sintéticas de test_support como resultado de produto. Revise os comandos e saídas verdadeiros antes de preencher PASS.

## Marca oficial HuGR — v4.1

`python3 tools/verify_brand.py` confere o kit imutável, os bindings e a referência do cockpit. Com `--repo /caminho/do/worktree`, também confere as duas cópias obrigatórias e as condicionais que existirem. Não escreve arquivos nem testa recursos HTTP, frontend, acessibilidade ou desempenho do aplicativo.

Leia BRAND-INTEGRATION.md antes de copiar. Os arquivos React do kit são exemplos, não dependência para a Orchestra Solid. Não executar todo o kit em public nem reexportar o logo. S01 pode ajustar bindings/consumidores nos contratos BRAND sem redefinir as fontes imutáveis; S05 cuida da cópia e adaptação local.
