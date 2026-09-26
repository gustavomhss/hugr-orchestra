# QA v3 — planejamento e ferramentas, não aceite do produto

## Resultado executado

- **83 testes passaram**, zero falhas, Python 3.13.5 no container Linux. Log: `qa/tool-tests.log`.
- Contrato estrutural: **PASS**, 140 nós, 700 grupos explícitos de axiomas, 1,898 critérios com IDs (separador numérico inglês).
- 39 projeções Markdown locais correspondem ao PLAN.json: `qa/issue-projection-v3.json`.
- Referência PNG original e SHA-256 conferidos; nenhum redesign ou regeneração.
- Prontidão inicial: **somente S01-W1-T1**, zero tasks de implementação aprovadas; `source_revision_verified: false` sem checkout local.
- 68 registros de inventário misturam superfícies visuais, âncoras, medição e lacunas. Não são 68 telas exercitadas.

## Antes/depois demonstrado

A suite v2 passou seus 37 testes originais (`qa/v2-baseline-tests.log`). Dois controles adicionais demonstraram aceitação indevida de recibos: omissão de visual/performance e estados arbitrários (`qa/baseline-negative-probes.json`). A suite v3 agora os reprova e inclui verificações de contrato, conteúdo de provas, ownership, build/revisão, categorias nativas e frescor Git.

Também foi testado o oposto: escrever o próprio recibo não invalida o código medido. Mapas/fixtures/fonte alterados continuam sujeitos a invalidação. A revisão completa está em `REVIEW-v3.md`.

## O que os testes cobrem

Tipos e hierarquia inválidos; órfãos; critérios globais repetidos; steps ausentes; exclusões inseguras; dependências de ancestrais e ciclos; digest de contrato alterado; artefatos vazios/alterados/fora da pasta; categoria ausente/inválida; comando negativo mal tipado; ausência de positivo; path fora do owner; revisão/build incompatível; relatório não JSON; texto usado como screenshot; cobertura dos gates requeridos; source ancestry/dirty; dependência de tradução desnecessária; projeção Markdown; redução transitiva; preflight/idempotência/recusa de outro pai e falha parcial GitHub.

Os testes GitHub usam FakeGitHub. O teste Git real usa um repositório temporário **sintético**. PNGs/relatórios sintéticos nos testes verificam o validador, não o Orchestra. A checagem PNG verifica cabeçalho/dimensões, não aparência. Hashes provam correspondência de bytes, não autenticidade nem correção semântica.

## Estado GitHub

Commit de documentação: `0eef764981450b57a04d42985d94e033fd49e080` na branch `visual-migration-plan`, leitura posterior confirmada. Publicados: entrada v3, revisão e protocolo de recibos. Atualizadas as dependências textuais das issues #159/#160; comentário de revisão no épico #130. Nenhum ticket novo, merge ou alteração de produto.

**O plano completo, scripts e PNG permanecem no ZIP; não foram integralmente publicados na branch.** `GITHUB.json` registra quais arquivos foram publicados.

Relações nativas **não aplicadas nesta revisão**. Projeção calculada: 35 pais, 55 dependências não redundantes (de 118), 56 restrições finas/advisory. Endpoint de filhos de #130 retornou vazio; outras relações não foram auditadas exaustivamente. O script executável com gh reread/preflight antes de escrever; sua aceitação pela API real não foi testada aqui.

## Limites de produto

Não houve build do Orchestra, renderização do aplicativo, benchmark, Electron, testes de segurança nativos, CI ou expansão integral dos scopes no checkout do usuário. O Mac estava offline; clone por rede não foi obtido no container. S01 não é marcado concluído por esta revisão. As metas de performance continuam metas a medir, não resultados alcançados.

Validação estrutural não substitui análise de código, prova funcional, medição de performance nem inspeção visual. Não declarar “impecável” ou “98%” somente por este relatório.

## Reproduzir

```sh
python3 tools/validate_plan.py
python3 tools/render_issues.py --check
python3 -m unittest discover -s tools -p 'test_*.py' -v
python3 tools/select_work.py
python3 tools/github_sync.py --offline
```

No computador do executor, adicionar `--repo /caminho/real/HuGR-Orchestra` ao seletor e ao validador de scopes. Verificar logs/diagnósticos; ausência não é sucesso. `MANIFEST.sha256` cobre todos os arquivos de entrega exceto ele próprio; o ZIP é lido e conferido após montagem.
