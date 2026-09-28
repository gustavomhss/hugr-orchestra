# COMECE AQUI — execução da migração visual pelo Codex

<!-- executor-design-complement -->
## Assets e decisões para começar sem inventar aparência

**[design/README.md](design/README.md)** localiza as peças reutilizáveis. **[design/zen/README.md](design/zen/README.md)** separa materiais, chrome, controles, sidebar e estados inspirados no Zen. **[design/REQUESTS.md](design/REQUESTS.md)** responde A1–A11, B1–B10 e C1; **[design/gallery.html](design/gallery.html)** indexa as 22 referências PNG de interface. Abra localmente o HTML ou os PNGs individuais no GitHub.

Tokens medidos/decididos, SVGs oficiais, paisagem limpa, 33 ícones de inspeção, copy PT-BR/EN e fonte HTML/CSS estão disponíveis; os blocos Axx pertinentes aparecem no pacote da sua task e nos cinco axiomas. `PLAN.json` é 4.4; DAG, owners, 38 WPs/66 tasks e budgets permanecem. S01 ainda precisa ser executada; não use as imagens de design como evidência de produto.

<!-- orchestra-executor-aids -->
**Entrada curta para executar ou retomar:** [RUN.md](RUN.md) — `executor.py doctor`, `resume` e `packet TASK`. Reutiliza seletor/recibos existentes; não altera axiomas nem autoriza uma task bloqueada.


<!-- orchestra-widget-closure:entry -->
**Localize sua implementação:** [WIDGETS.md — tabela Onde implementar](WIDGETS.md) informa arquivo existente, destino novo, dados, ações e task T1/T2 de cada widget. [Fechamento dos bindings](reviews/widget-contracts/closure/REVIEW.md) explica origem da execução, navegação por mensagem, preservação do draft e limites sem omitir tarefas ativas. Os axiomas continuam na task; não crie outro plano.


<!-- orchestra-widgets43:begin -->
## Widgets fechados — contrato 4.3

**Antes de implementar um widget, abra [WIDGETS.md](WIDGETS.md).** W01 checklist/todowrite; W02 diff; W03 testes/output; W04 Browser/Files/Docs/Terminal; W05 Tasks; W06 Atividade; W07 ações; W08 atalhos das features; W09 microacabamento e custo integrado. Os IDs Wxx e casos WKxx aparecem diretamente no corpo da sua issue/WP/task.

As seções indicam fontes e campos reais, paths de implementação, callbacks e efeitos exatos, estados, limites e testes. Docs é documentação local; Criar PR… prepara draft revisável sem publicar; repetir testes exige comando/contexto compatível e confirmação. Inputs de todowrite não são prova e metadata.output não é log completo. Nenhuma omissão de binding é aprovada como capability ausente.

DAG, 38 WPs/66 tasks, piloto antecipado, fronteiras de escrita e budgets 4.2 preservados. A fixture é sintética e foi alinhada aos campos reais; produto ainda NOT_RUN. A avaliação da publicação está em [reviews/widget-contracts/PUBLICATION.json](reviews/widget-contracts/PUBLICATION.json), e os limites da revisão em [reviews/widget-contracts/REVIEW.md](reviews/widget-contracts/REVIEW.md).
<!-- orchestra-widgets43:end -->


**Entrada única:** [épico #215](https://github.com/gmhelmold/HuGR-Orchestra/issues/215). **Repositório:** `gmhelmold/HuGR-Orchestra`. **Branch dos insumos:** `visual-migration-plan`. **Pasta:** `specs/orchestra-visual/`.

Este guia explica onde estão os insumos e como iniciar. Não substitui [EXECUTE.md](EXECUTE.md), os cinco axiomas nem o DAG de [PLAN.json](PLAN.json). Os insumos estão publicados; o frontend ainda precisa ser implementado e comprovado. Não é necessário receber ZIP ou recuperar esta conversa.

## 1. Primeira ação: localizar o checkout correto

Na máquina do usuário, abra um terminal **dentro do checkout do Orchestra**. Não adivinhe um caminho como `~/Projects/Orchestra`.

```sh
# CWD: qualquer pasta DENTRO do checkout real do Orchestra.
REPO="$(git rev-parse --show-toplevel)" || exit 1
cd "$REPO" || exit 1
printf 'Checkout: %s\n' "$REPO"
git remote -v
git status --short --branch
git rev-parse HEAD
```

Confirme que os remotes correspondem ao repositório acima. Verifique `AGENTS.md` e as instruções específicas das pastas antes de escrever. **Não faça reset, clean, stash, force-push ou troca de branch que descarte trabalho.**

### Os arquivos do plano já estão no checkout?

```sh
# CWD: raiz do checkout confirmado.
test -f specs/orchestra-visual/PLAN.json && \
  test -f specs/orchestra-visual/reference/approved.png && \
  test -f specs/orchestra-visual/EXECUTE.md
```

- **Sim:** use esse checkout e confira a proveniência em [PUBLICATION.json](PUBLICATION.json). O nome da branch local não precisa ser literalmente `visual-migration-plan` se os insumos já foram integrados.
- **Não:** provavelmente está em `dev` ou outra branch sem os insumos. Busque a branch documental, sem mudar seu checkout. O bloco abaixo cria um worktree isolado e só deve ser usado após confirmar o remoto `origin` e a ausência dos nomes de destino. Ele não integra automaticamente mudanças novas de `dev`.

```sh
# CWD: raiz do checkout confirmado; não executar sobre um destino existente.
git fetch origin visual-migration-plan || exit 1
WORKTREE="${REPO}-visual-work"
if test -e "$WORKTREE" || git show-ref --verify --quiet refs/heads/visual-work; then
  printf '%s\n' 'Destino/branch já existem. Inspecione e reutilize com cuidado; não sobrescreva.'
  exit 1
fi
git worktree add -b visual-work "$WORKTREE" origin/visual-migration-plan || exit 1
cd "$WORKTREE" || exit 1
REPO="$(git rev-parse --show-toplevel)" || exit 1
```

Antes de implementar, compare a base da branch com o código atual necessário. S01 resolve divergências no mapa. Não confundir obter os insumos com autorizar regressão para código antigo; não transplante uma PR histórica inteira como atalho.

## 2. Fixar as duas raízes — não misturar caminhos

```sh
# CWD: raiz do worktree escolhido para esta execução.
REPO="$(git rev-parse --show-toplevel)" || exit 1
PLAN_ROOT="$REPO/specs/orchestra-visual"
cd "$PLAN_ROOT" || exit 1
printf 'Código: %s\nPlano: %s\n' "$REPO" "$PLAN_ROOT"
```

| Quando um documento diz… | O caminho é relativo a… | Exemplo completo |
|---|---|---|
| `packages/app/src/...`, `write_paths`, `read_paths` | **`$REPO`**, raiz do código | `$REPO/packages/app/src/pages/session.tsx` |
| `tools/...`, `issues/...`, `reference/...` | **`$PLAN_ROOT`**, raiz do plano | `$PLAN_ROOT/tools/select_work.py` |
| Arquivo de prova em um recibo | **`$PLAN_ROOT`** | `evidence/S17/W1-T1/attempt-01/receipt.json` |
| Caminho passado a `--repo` | **O worktree cujo código está sendo verificado** | `--repo "$REPO"` |

Cada worktree paralelo tem seu próprio `$REPO`. O coordenador reconcilia provas/progresso; não permita que vários agentes sobrescrevam o mesmo `progress.json`. A política de importação de recibos está em [EXECUTE.md](EXECUTE.md) e [RECEIPTS-v4.md](RECEIPTS-v4.md).

## 3. Onde está cada coisa

| Preciso encontrar… | Abrir | Papel / o que NÃO significa |
|---|---|---|
| Todos os épicos, issues, WPs e tasks | [INDEX.md](INDEX.md) | Índice com atalhos por ID; não é outro plano. |
| O contrato de execução | [EXECUTE.md](EXECUTE.md) | Ler antes de iniciar uma task. |
| Os cinco axiomas, dependências e permissões de escrita | [PLAN.json](PLAN.json) → `nodes[id]` | Fonte canônica. Não carregar o arquivo inteiro em cada subagente. |
| O corpo de um ticket com WPs/tasks | [issues/](issues/) | `issues/S17.md` corresponde à issue #160; os números não são intercambiáveis. |
| O mock EXATO aprovado | [reference/approved.png](reference/approved.png) | Referência visual, não captura da implementação. Abrir a imagem, não apenas verificar o hash. |
| Geometria, paleta, tipografia e microacabamento | [SPEC.md](SPEC.md) | Requisitos visuais; não criar outro tema. |
| Ligações entre componentes e fontes de dados | [CONTRACTS.md](CONTRACTS.md) | Fronteiras entre responsáveis. Um arquivo de backend não autoriza editá-lo. |
| Arquivos e responsáveis de código | [MAP.md](MAP.md), [OWNERSHIP.md](OWNERSHIP.md) e [INDEX.md](INDEX.md) | Mapa inicial. S01 confere o checkout e reachability. |
| Telas, widgets, estados e lacunas | [SURFACES.json](SURFACES.json) | Fontes e superfícies são classificadas; nem todo registro representa uma tela. |
| O censo do checkout local | [CENSUS.json](CENSUS.json) | Deve ser preenchido por S01; publicação não o torna concluído. |
| Quais capturas produzir | [COVERAGE.json](COVERAGE.json) + [SURFACES.json](SURFACES.json) | Cobertura por estado, viewport, host etc.; não basta uma tela bonita. |
| Limites de desempenho e cargas | [PERFORMANCE.md](PERFORMANCE.md) + [BUDGETS.json](BUDGETS.json) | Metas a medir, não benchmarks já aprovados. |
| Dados sintéticos para capturas/testes | [fixture.json](fixture.json) | Somente testes; nunca fonte operacional de produção. |
| Logo e integração da marca | [BRAND-INTEGRATION.md](BRAND-INTEGRATION.md) + [BRAND-ASSETS.json](BRAND-ASSETS.json) | Usar os assets intactos; preservar nome Orchestra e tema grafite. |
| O brand kit completo | [vendor/HuGR-Brand-Kit-v1.0/AGENT-START-HERE.md](vendor/HuGR-Brand-Kit-v1.0/AGENT-START-HERE.md) | Insumo de integração. Não copiar 304 arquivos para `public/`. |
| Progresso da implementação | [progress.json](progress.json) | Estado por **task**, com evidência; não concluir pais manualmente. |
| Formato de prova | [RECEIPTS-v4.md](RECEIPTS-v4.md) | O nome v4 continua correto: o recibo da v4.2 usa esquema 3. |
| Ferramentas e parâmetros exatos | [tools/README.md](tools/README.md) | Scripts locais; não executam a migração sozinhos. |
| O que de fato foi publicado | [PUBLICATION.json](PUBLICATION.json) e [publication/](publication/) | Prova da publicação, não aprovação do produto. |
| Revisões anteriores | `REVIEW-*.md`, `QA_REPORT.md`, `qa/` | Histórico. Afirmações antigas de publicação parcial não substituem PUBLICATION atual. |

**Marca do cockpit escuro:** [hugr-symbol-inverse.svg](vendor/HuGR-Brand-Kit-v1.0/07-web/brand/logos/hugr-symbol-inverse.svg). **Superfície clara:** [hugr-symbol-primary.svg](vendor/HuGR-Brand-Kit-v1.0/07-web/brand/logos/hugr-symbol-primary.svg). A paisagem da sidebar é uma entrega separada da S05.

## 4. Ordem mínima de leitura e primeira task

Leia este guia → [EXECUTE.md](EXECUTE.md) → abra [o mock](reference/approved.png) → [SPEC.md](SPEC.md), [CONTRACTS.md](CONTRACTS.md) e [PERFORMANCE.md](PERFORMANCE.md) → selecione **uma** task. Para detalhes da marca, leia o contrato BRAND antes de S05.

```sh
# CWD: $PLAN_ROOT. Requisitos do tooling: Python 3.9+ e Git.
python3 tools/verify_brand.py
python3 tools/validate_plan.py
python3 tools/render_maps.py --check
python3 tools/render_issues.py --check
python3 tools/select_work.py --repo "$REPO" --jobs 4
```

Confira os códigos de saída **e o JSON**. `REPAIR_REQUIRED`, `invalid_claims`, dependências externas ou `selected: []` não significam autorização para inventar PASS. Não altere thresholds/expectativas para desbloquear trabalho.

**Primeira task no estado publicado:** `S01-W1-T1` → [issue #144](https://github.com/gmhelmold/HuGR-Orchestra/issues/144) → [issues/S01.md](issues/S01.md), seção `## S01-W1-T1`. Se há execução posterior registrada, a próxima task vem do seletor, não desta fotografia inicial.

```sh
python3 tools/select_work.py --show S01-W1-T1
```

O `--show` apresenta a unidade e os axiomas dos ancestrais. Não prova que ela está desbloqueada. `S01` é a subissue; `S01-W1` é seu WP; `S01-W1-T1` é a unidade executável. **Rodar `select_work.py` não implementa nada.**

## 5. Execução de uma unidade — exemplo completo sem PASS predefinido

Use este bloco somente para uma task selecionada e ainda não iniciada. Troque `attempt-01` por uma tentativa nova quando houver retrabalho; nunca sobrescreva uma prova anterior.

```sh
# CWD: $PLAN_ROOT; REPO aponta para o worktree desta task.
TASK="S01-W1-T1"
OWNER="${TASK%%-*}"
UNIT="${TASK#*-}"
EVIDENCE="evidence/$OWNER/$UNIT/attempt-01"
if test -e "$EVIDENCE"; then
  printf '%s\n' 'Tentativa já existe: inspecione ou escolha nova, sem sobrescrever.'
  exit 1
fi
mkdir -p "$EVIDENCE" || exit 1
python3 tools/select_work.py --show "$TASK" > "$EVIDENCE/task-input.json" || exit 1
python3 tools/capture_scope.py --repo "$REPO" --out "$EVIDENCE/source-before.json" || exit 1
python3 tools/receipt_template.py "$TASK" --out "$EVIDENCE/receipt.draft.json" || exit 1
```

Agora o Codex implementa **os passos dessa task**, no seu `write_paths`, preservando `exclude_paths` e locks. Testes/builds do produto rodam no package correto, não automaticamente na raiz do plano. Guarde comandos, CWD, exit codes e logs; produza capturas/métricas reais quando exigidas. Faça revisão fria e corrija antes do aceite.

Preencha o draft conforme [RECEIPTS-v4.md](RECEIPTS-v4.md): baseline criada antes da escrita, SHA real, commits atribuíveis, arquivos alterados reais, resultado por criterion ID e provas. O template não é um recibo aprovado.

```sh
# CWD: $PLAN_ROOT. Rodar só DEPOIS de implementar, testar e preencher o draft.
python3 tools/seal_receipt.py "$EVIDENCE/receipt.draft.json" --out "$EVIDENCE/receipt.json" || exit 1
python3 tools/validate_evidence.py "$TASK" "$EVIDENCE/receipt.json" --repo "$REPO" || exit 1
```

Somente após revisão dos resultados, o coordenador atualiza `progress.json` na entrada dessa task, com status verdadeiro, SHA e caminho relativo da prova. Uma falha permanece falha. Rodar `seal_receipt.py` apenas cataloga hashes; não executa teste nem avalia beleza.

Depois, rode novamente `select_work.py --repo "$REPO" --jobs 4`. Não saltar do censo para o fechamento do épico, nem confundir uma issue bloqueada para fechamento com todas as suas tasks bloqueadas.

## 6. Onde entrar conforme o trabalho

| Trabalho | Navegação direta |
|---|---|
| Censo / fonte de verdade / permissões | [S01 → #144](INDEX.md#s01) |
| Instrumentação e budgets | [S02 → #145](INDEX.md#s02) |
| Tema / controles / logo | [S03](INDEX.md#s03) · [S04](INDEX.md#s04) · [S05](INDEX.md#s05) |
| Shell / home / janela desktop | [S06](INDEX.md#s06) · [S07](INDEX.md#s07) · [S08](INDEX.md#s08) |
| Conversa / input / diff e terminal | [S09](INDEX.md#s09) · [S10](INDEX.md#s10) · [S11](INDEX.md#s11) |
| Configurações / contas-modelos / menus | [S12](INDEX.md#s12) · [S13](INDEX.md#s13) · [S14](INDEX.md#s14) |
| Dock visual versus bridge nativa | [S15](INDEX.md#s15) · [S16](INDEX.md#s16) |
| Tasks: dados versus apresentação | [S17](INDEX.md#s17) · [S18](INDEX.md#s18) |
| Own/contexto / Maestro / Janitor | [S19](INDEX.md#s19) · [S20](INDEX.md#s20) · [S21](INDEX.md#s21) |
| Tradução / performance final / acabamento final | [S22](INDEX.md#s22) · [S23](INDEX.md#s23) · [S24](INDEX.md#s24) |
| Piloto e integração dos componentes | [S25 → #168](INDEX.md#s25) |

## 7. O que não pode ser confundido

**Código existente** é insumo, não prova de feature integrada. **Nome proposto/glob** não é arquivo que necessariamente já existe. **Dependência externa** não é backend pronto porque a issue foi fechada. **Kit de marca** não é tema de aplicação. **151 testes do tooling** não são testes de performance do Orchestra. **Publicação completa** não é produto entregue.

O piloto S25-W0 é cedo e conectado; S25-W1-T1 produz candidato; S23/S24 avaliam; S25-W1-T2 encerra. Não antecipar obrigações de aceite final dentro do produtor. O design está escolhido: não iniciar outra rodada de mockups.

## 8. Prompt de transferência

> Execute o épico #215 de gmhelmold/HuGR-Orchestra. Comece por specs/orchestra-visual/START-HERE.md na branch visual-migration-plan. Use INDEX.md para localizar o ticket, seus WPs/tasks e entradas de código. Confira o checkout e siga EXECUTE.md/PLAN.json com o seletor. Preserve o mock e os assets HuGR. Implemente e verifique cada unidade pelos cinco axiomas, com performance e microacabamento no mesmo build; não entregue outro planejamento. Preserve meu trabalho e registre provas reais antes de concluir.

<!-- orchestra-pa-42:begin -->
## Execução proporcional e paralela — 4.2

As correções de PA-01–PA-06 estão em [reviews/parallelism-performance/repairs/REVIEW.md](reviews/parallelism-performance/repairs/REVIEW.md). O grafo preserva os mesmos 38 WPs/66 tasks. Use `verification_tier` e `dependency_inputs` da unidade: implementar consome a entrega T1 local; a auditoria cruzada completa fica no aceite. S22-T1 fornece copy/parity cedo; o piloto S25-W0 tem prioridade e 11 pré-requisitos.

P01 usa dois manifests reais, não cinco repetições de valores estáticos. S23-T2 coleta a campanha completa; S25-T2 valida/reutiliza artefatos do mesmo candidato sem repetir o soak. P03 exige teto absoluto e proteção contra regressão. Tendência de memória é assinada, com ruído inconclusivo não aprovado. Os consumidores de tema e governança estão explicitamente na matriz de capturas.

Para coletar: task já RUNNING → `python3 tools/select_work.py --collect ID` → se READY_TO_RESERVE, registrar phase=collect e conferir processos reais → medir → registrar phase=review e liberar o host. Nenhum processo é iniciado, pausado ou morto automaticamente. Não medir durante compilação/captura concorrente. Provas e axiomas continuam obrigatórios; a reforma visual ainda não está implementada.
<!-- orchestra-pa-42:end -->
