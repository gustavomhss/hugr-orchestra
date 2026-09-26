# QA 4.1 — marca recebida, contrato atualizado; produto não executado

## Resultado atual

| Verificação | Resultado | Evidência |
|---|---|---|
| Suite completa das ferramentas | **151 PASS, zero falhas**; 133 anteriores + 18 novos | qa/v4.1-all-tests.log; qa/v4.1-test-run.json |
| Kit contra ZIP original | **304 arquivos idênticos** | qa/brand-integration-audit.json |
| Verificador original do handoff | **PASS**, 295 originais e relações locais | qa/brand-kit-verification.json |
| Registro de integração da marca | **PASS**, 14 assets, 2 obrigatórios | qa/brand-map-verification.json |
| Plano | **PASS**, 143 nós, 715 grupos, 1.980 critérios | qa/v4.1-plan-check.json |
| Projeções de issues e mapas | **PASS**, 39 issues e sem divergências nos mapas | qa/v4.1-issue-check.json; qa/v4.1-map-check.json |
| Dependências, locks e hierarquia | **Iguais à v4** | qa/brand-integration-audit.json |
| Mock, budgets, cobertura, fixture e progresso | **Bytes preservados** | qa/brand-integration-audit.json |
| Primeira task pronta | **S01-W1-T1**, zero tasks aprovadas | qa/v4.1-readiness.json |
| GitHub nativo | **NOT_APPLIED**, leitura offline de projeção não é sincronização | qa/v4.1-github-offline.json |

Última suite: `/opt/pyvenv/bin/python -m unittest discover -s tools -p 'test_*.py' -v`, exit code **0**, duração do runner 31.363 s. O caminho absoluto é do ambiente de auditoria, não um requisito do computador do usuário.

O primeiro run 4.1 encontrou uma falha de ownership de logo.tsx. Foi corrigida restaurando o responsável com limite opt-in e preservando o teste original. Depois do ajuste de ownership de BRAND-ASSETS/BRAND-INTEGRATION em S01, todos os 151 testes foram executados novamente. A falha anterior e os resultados históricos estão preservados, sem serem apresentados como estado atual.

## O que não está sendo aprovado

Nenhuma implementação de frontend, recurso servido, build, benchmark do Orchestra, teste Electron ou instalação nativa foi executado. O mapa de destinos é um contrato de integração a conferir em S01. As cópias de testes e os cenários das ferramentas são sintéticos. Nenhuma task de produto foi marcada PASS. Não chamar os 74 registros de inventário de 74 telas testadas.

Integridade não autentica a origem de um resultado nem garante beleza. O revisor ainda precisa abrir capturas, conferir os estados e avaliar as medições reais. O logotipo continua inalterado; a adaptação de seu contêiner precisa de prova no produto. A paisagem é uma entrega independente ainda prevista na S05.

O kit não contém arquivos de fontes e nenhum foi acrescentado. Nenhum pacote de runtime foi instalado. SVGs oficiais não foram reexportados ou otimizados. Os 304 arquivos originais do kit estão na subpasta vendor, não em public ou no aplicativo.

## GitHub

Atualizados apenas #148, specs/orchestra-visual/BRAND-INPUT.md e o bootstrap EXECUTE.md. Último commit confirmado: **100d8e4a1745724a08d20b934df9e509dab78676**, branch visual-migration-plan. Não houve merge, implantação ou instalação dos assets no repositório. Não presumir que corpos antigos das outras issues substituam o plano 4.1 do ZIP.

## Reproduzir

```sh
python3 vendor/HuGR-Brand-Kit-v1.0/11-handoff/verify_handoff.py --json
python3 tools/verify_brand.py
python3 tools/validate_plan.py
python3 tools/render_maps.py --check
python3 tools/render_issues.py --check
python3 -m unittest discover -s tools -p 'test_*.py' -v
python3 tools/select_work.py
```

No worktree real, usar --repo onde previsto. Depois de copiar os assets, `python3 tools/verify_brand.py --repo /caminho/do/worktree` confere hashes de destino; isso ainda não testa URL/MIME/render.

MANIFEST.sha256 é regenerado depois de finalizar todos os arquivos. O ZIP é reaberto e os bytes de cada entrada são conferidos antes da entrega; o relatório externo Orchestra_Codex_Execution_Plan_v4.1_verification.json registra o resultado. O manifesto não inclui a si próprio.

Histórico da v4: qa/v4-original-QA_REPORT.md, REVIEW-v4.md e FINDINGS-RESOLUTION.json. Revisão atual: BRAND-INTEGRATION-REVIEW.md; resultado estruturado: qa/brand-integration-audit.json.
