# INDEX — onde estão os tickets, contratos e entradas de código

[Comece por START-HERE.md](START-HERE.md) · [Épico #215](https://github.com/gmhelmold/HuGR-Orchestra/issues/215)

Índice de navegação, não nova especificação. Axiomas, permissões e desbloqueio vêm de PLAN.json/EXECUTE.md. As relações abaixo não marcam trabalho como concluído. Nenhuma nova task foi criada.

Contrato: `4.3`; SHA-256 de PLAN.json: `45159c61d0cd1a67d22e8d35149a2f4567855db9325870cfcf1dc472c4211b1f`. Snapshot do código: `links conferidos no checkout fornecido; base histórica das âncoras 30d951fcc4a09e708768551c7c6fd38a0efe3da8`.

**Raízes:** caminhos `packages/...` partem de `$REPO`; links para specs, tools e provas partem de `$PLAN_ROOT = $REPO/specs/orchestra-visual`. Um caminho de leitura não concede escrita. Um padrão com `*` não é um arquivo existente. Presença não prova reachability, backend live ou runtime testado.

Se PLAN/SURFACES/GITHUB mudarem, o coordenador pode regenerar este índice em uma atualização documental com `python3 tools/render_navigation.py --write --repo "$REPO"`. `--check` não altera arquivos. Isto não modifica o DAG nem dispensa qualquer gate; os contratos atuais prevalecem sobre o snapshot.

## Mapa dos 39 tickets subordinados

| ID / ticket real | Responsabilidade | Pai | Filhos diretos |
|---|---|---|---|
| [E1 / #130](#e1) | Fundação visual, contratos e orçamentos | [#215](https://github.com/gmhelmold/HuGR-Orchestra/issues/215) | [I01](#i01) · [I02](#i02) |
| [E2 / #131](#e2) | Aplicação inteira e cockpit de sessão | [#215](https://github.com/gmhelmold/HuGR-Orchestra/issues/215) | [I03](#i03) · [I04](#i04) · [I05](#i05) |
| [E3 / #132](#e3) | Dock, tarefas e capacidades reais | [#215](https://github.com/gmhelmold/HuGR-Orchestra/issues/215) | [I06](#i06) · [I07](#i07) · [I08](#i08) |
| [E4 / #133](#e4) | Performance, microacabamento e entrega | [#215](https://github.com/gmhelmold/HuGR-Orchestra/issues/215) | [I09](#i09) · [I10](#i10) |
| [I01 / #134](#i01) | Baseline, inventário e contratos executáveis | [E1 / #130](https://github.com/gmhelmold/HuGR-Orchestra/issues/130) | [S01](#s01) · [S02](#s02) · [I01-W1](#i01-w1) |
| [I02 / #135](#i02) | Tema, primitives e assets definitivos | [E1 / #130](https://github.com/gmhelmold/HuGR-Orchestra/issues/130) | [S03](#s03) · [S04](#s04) · [S05](#s05) · [I02-W1](#i02-w1) |
| [I03 / #136](#i03) | Shell, navegação e telas de entrada | [E2 / #131](https://github.com/gmhelmold/HuGR-Orchestra/issues/131) | [S06](#s06) · [S07](#s07) · [S08](#s08) · [I03-W1](#i03-w1) |
| [I04 / #137](#i04) | Conversa, composer e evidências | [E2 / #131](https://github.com/gmhelmold/HuGR-Orchestra/issues/131) | [S09](#s09) · [S10](#s10) · [S11](#s11) · [I04-W1](#i04-w1) |
| [I05 / #138](#i05) | Configurações e superfícies transversais | [E2 / #131](https://github.com/gmhelmold/HuGR-Orchestra/issues/131) | [S12](#s12) · [S13](#s13) · [S14](#s14) · [I05-W1](#i05-w1) |
| [I06 / #139](#i06) | Dock: composição visual e bridge nativa | [E3 / #132](https://github.com/gmhelmold/HuGR-Orchestra/issues/132) | [S15](#s15) · [S16](#s16) · [I06-W1](#i06-w1) |
| [I07 / #140](#i07) | Tasks e atividade: dados incrementais e UI | [E3 / #132](https://github.com/gmhelmold/HuGR-Orchestra/issues/132) | [S17](#s17) · [S18](#s18) · [I07-W1](#i07-w1) |
| [I08 / #141](#i08) | Contexto, governança e Janitor | [E3 / #132](https://github.com/gmhelmold/HuGR-Orchestra/issues/132) | [S19](#s19) · [S20](#s20) · [S21](#s21) · [I08-W1](#i08-w1) |
| [I09 / #142](#i09) | Gates de acessibilidade, performance e acabamento | [E4 / #133](https://github.com/gmhelmold/HuGR-Orchestra/issues/133) | [S22](#s22) · [S23](#s23) · [S24](#s24) · [I09-W1](#i09-w1) |
| [I10 / #143](#i10) | Integração final, ativação e transferência | [E4 / #133](https://github.com/gmhelmold/HuGR-Orchestra/issues/133) | [S25](#s25) · [I10-W1](#i10-w1) |
| [S01 / #144](#s01) | Censo de superfícies e contratos de capacidade | [I01 / #134](https://github.com/gmhelmold/HuGR-Orchestra/issues/134) | [S01-W1](#s01-w1) |
| [S02 / #145](#s02) | Fixture, medição e budgets que realmente reprovam | [I01 / #134](https://github.com/gmhelmold/HuGR-Orchestra/issues/134) | [S02-W1](#s02-w1) |
| [S03 / #146](#s03) | Tema Graphite em V1/V2 e primeiro paint | [I02 / #135](https://github.com/gmhelmold/HuGR-Orchestra/issues/135) | [S03-W1](#s03-w1) |
| [S04 / #147](#s04) | Primitives, estados e tipografia de toda a UI | [I02 / #135](https://github.com/gmhelmold/HuGR-Orchestra/issues/135) | [S04-W1](#s04-w1) |
| [S05 / #148](#s05) | Marca HuGR oficial e paisagem independente | [I02 / #135](https://github.com/gmhelmold/HuGR-Orchestra/issues/135) | [S05-W1](#s05-w1) |
| [S06 / #149](#s06) | Shell e navegação da composição aprovada | [I03 / #136](https://github.com/gmhelmold/HuGR-Orchestra/issues/136) | [S06-W1](#s06-w1) |
| [S07 / #150](#s07) | Home, nova sessão, onboarding e erros | [I03 / #136](https://github.com/gmhelmold/HuGR-Orchestra/issues/136) | [S07-W1](#s07-w1) |
| [S08 / #151](#s08) | Chrome desktop, startup, updater e plataformas | [I03 / #136](https://github.com/gmhelmold/HuGR-Orchestra/issues/136) | [S08-W1](#s08-w1) |
| [S09 / #152](#s09) | Timeline, mensagens e ferramentas sem rerender global | [I04 / #137](https://github.com/gmhelmold/HuGR-Orchestra/issues/137) | [S09-W1](#s09-w1) |
| [S10 / #153](#s10) | Composer, anexos e seleção de execução | [I04 / #137](https://github.com/gmhelmold/HuGR-Orchestra/issues/137) | [S10-W1](#s10-w1) |
| [S11 / #154](#s11) | Arquivos, diff, terminal e evidência verificável | [I04 / #137](https://github.com/gmhelmold/HuGR-Orchestra/issues/137) | [S11-W1](#s11-w1) |
| [S12 / #155](#s12) | Configurações gerais, teclas e conexões | [I05 / #138](https://github.com/gmhelmold/HuGR-Orchestra/issues/138) | [S12-W1](#s12-w1) |
| [S13 / #156](#s13) | Providers, credenciais, modelos e MCP | [I05 / #138](https://github.com/gmhelmold/HuGR-Orchestra/issues/138) | [S13-W1](#s13-w1) |
| [S14 / #157](#s14) | Command palette, busca, pickers e popovers | [I05 / #138](https://github.com/gmhelmold/HuGR-Orchestra/issues/138) | [S14-W1](#s14-w1) |
| [S15 / #158](#s15) | Dock visual no rail simultâneo | [I06 / #139](https://github.com/gmhelmold/HuGR-Orchestra/issues/139) | [S15-W1](#s15-w1) |
| [S16 / #159](#s16) | Bounds, overlays e lifecycle nativo do Dock | [I06 / #139](https://github.com/gmhelmold/HuGR-Orchestra/issues/139) | [S16-W1](#s16-w1) |
| [S17 / #160](#s17) | Projeção incremental e identidade de Tasks | [I07 / #140](https://github.com/gmhelmold/HuGR-Orchestra/issues/140) | [S17-W1](#s17-w1) |
| [S18 / #161](#s18) | Tasks resumidas, drill-down e atividade | [I07 / #140](https://github.com/gmhelmold/HuGR-Orchestra/issues/140) | [S18-W1](#s18-w1) |
| [S19 / #162](#s19) | Contexto, recursos e Own com read boundary explícita | [I08 / #141](https://github.com/gmhelmold/HuGR-Orchestra/issues/141) | [S19-W1](#s19-w1) · [S19-W2](#s19-w2) |
| [S20 / #163](#s20) | Maestro: status, input e aprovação sem autoridade fictícia | [I08 / #141](https://github.com/gmhelmold/HuGR-Orchestra/issues/141) | [S20-W1](#s20-w1) · [S20-W2](#s20-w2) |
| [S21 / #164](#s21) | Janitor: widget, pocket e diagnósticos contextualizados | [I08 / #141](https://github.com/gmhelmold/HuGR-Orchestra/issues/141) | [S21-W1](#s21-w1) |
| [S22 / #165](#s22) | Localização, acessibilidade e matriz de estados | [I09 / #142](https://github.com/gmhelmold/HuGR-Orchestra/issues/142) | [S22-W1](#s22-w1) |
| [S23 / #166](#s23) | Performance de produto e soak no hardware-alvo | [I09 / #142](https://github.com/gmhelmold/HuGR-Orchestra/issues/142) | [S23-W1](#s23-w1) |
| [S24 / #167](#s24) | Inspeção visual integral e microacabamento | [I09 / #142](https://github.com/gmhelmold/HuGR-Orchestra/issues/142) | [S24-W1](#s24-w1) |
| [S25 / #168](#s25) | Integração, ativação reversível e entrega completa | [I10 / #143](https://github.com/gmhelmold/HuGR-Orchestra/issues/143) | [S25-W0](#s25-w0) · [S25-W1](#s25-w1) |

## Guias por ticket e unidade

As seções WP/task são localizáveis por ID. Abra a seção correspondente no Markdown canônico ou use o comando `--show` abaixo. `--show` apenas lê: a prontidão vem de `select_work.py --repo`.

<a id="e1"></a>
### E1 — Fundação visual, contratos e orçamentos

**Ticket:** [E1 / #130](https://github.com/gmhelmold/HuGR-Orchestra/issues/130) · **Contrato completo:** [`issues/E1.md`](issues/E1.md)
**Caminho:** #215 → [E1 / #130](https://github.com/gmhelmold/HuGR-Orchestra/issues/130)
**Dependências de entrada declaradas:** nenhuma neste nó. Leia também as dependências herdadas/finas da task.
**Entrar pelos filhos:** [I01 / #134](https://github.com/gmhelmold/HuGR-Orchestra/issues/134) · [I02 / #135](https://github.com/gmhelmold/HuGR-Orchestra/issues/135)

[Voltar ao início](START-HERE.md) · [Mapa de tickets](#mapa-dos-39-tickets-subordinados)

<a id="e2"></a>
### E2 — Aplicação inteira e cockpit de sessão

**Ticket:** [E2 / #131](https://github.com/gmhelmold/HuGR-Orchestra/issues/131) · **Contrato completo:** [`issues/E2.md`](issues/E2.md)
**Caminho:** #215 → [E2 / #131](https://github.com/gmhelmold/HuGR-Orchestra/issues/131)
**Dependências de entrada declaradas:** nenhuma neste nó. Leia também as dependências herdadas/finas da task.
**Entrar pelos filhos:** [I03 / #136](https://github.com/gmhelmold/HuGR-Orchestra/issues/136) · [I04 / #137](https://github.com/gmhelmold/HuGR-Orchestra/issues/137) · [I05 / #138](https://github.com/gmhelmold/HuGR-Orchestra/issues/138)

[Voltar ao início](START-HERE.md) · [Mapa de tickets](#mapa-dos-39-tickets-subordinados)

<a id="e3"></a>
### E3 — Dock, tarefas e capacidades reais

**Ticket:** [E3 / #132](https://github.com/gmhelmold/HuGR-Orchestra/issues/132) · **Contrato completo:** [`issues/E3.md`](issues/E3.md)
**Caminho:** #215 → [E3 / #132](https://github.com/gmhelmold/HuGR-Orchestra/issues/132)
**Dependências de entrada declaradas:** nenhuma neste nó. Leia também as dependências herdadas/finas da task.
**Entrar pelos filhos:** [I06 / #139](https://github.com/gmhelmold/HuGR-Orchestra/issues/139) · [I07 / #140](https://github.com/gmhelmold/HuGR-Orchestra/issues/140) · [I08 / #141](https://github.com/gmhelmold/HuGR-Orchestra/issues/141)

[Voltar ao início](START-HERE.md) · [Mapa de tickets](#mapa-dos-39-tickets-subordinados)

<a id="e4"></a>
### E4 — Performance, microacabamento e entrega

**Ticket:** [E4 / #133](https://github.com/gmhelmold/HuGR-Orchestra/issues/133) · **Contrato completo:** [`issues/E4.md`](issues/E4.md)
**Caminho:** #215 → [E4 / #133](https://github.com/gmhelmold/HuGR-Orchestra/issues/133)
**Dependências de entrada declaradas:** nenhuma neste nó. Leia também as dependências herdadas/finas da task.
**Entrar pelos filhos:** [I09 / #142](https://github.com/gmhelmold/HuGR-Orchestra/issues/142) · [I10 / #143](https://github.com/gmhelmold/HuGR-Orchestra/issues/143)

[Voltar ao início](START-HERE.md) · [Mapa de tickets](#mapa-dos-39-tickets-subordinados)

<a id="i01"></a>
### I01 — Baseline, inventário e contratos executáveis

**Ticket:** [I01 / #134](https://github.com/gmhelmold/HuGR-Orchestra/issues/134) · **Contrato completo:** [`issues/I01.md`](issues/I01.md)
**Caminho:** #215 → [E1 / #130](https://github.com/gmhelmold/HuGR-Orchestra/issues/130) → [I01 / #134](https://github.com/gmhelmold/HuGR-Orchestra/issues/134)
**Dependências de entrada declaradas:** nenhuma neste nó. Leia também as dependências herdadas/finas da task.
**Entrar pelos filhos:** [S01 / #144](https://github.com/gmhelmold/HuGR-Orchestra/issues/144) · [S02 / #145](https://github.com/gmhelmold/HuGR-Orchestra/issues/145)

<a id="i01-w1"></a>
#### I01-W1 — Integrar e auditar baseline, inventário e contratos executáveis
Arquivo: [`issues/I01.md`](issues/I01.md) · localizar o heading `## I01-W1 —`. Os cinco axiomas e seus IDs estão nessa seção.
Tasks: [I01-W1-T1](#i01-w1-t1)

<a id="i01-w1-t1"></a>
#### I01-W1-T1 — Conferir entregas e emitir recibo I01
Arquivo: [`issues/I01.md`](issues/I01.md) · localizar o heading `## I01-W1-T1 —`. Os cinco axiomas e seus IDs estão nessa seção.
```sh
# CWD: $PLAN_ROOT
python3 tools/select_work.py --show I01-W1-T1
```
Provas: `evidence/I01/W1-T1/attempt-NN/`. Template/selagem/validação: [passo a passo](START-HERE.md). Readiness e locks devem ser verificados antes de iniciar; mostrar a task não a libera.

[Voltar ao início](START-HERE.md) · [Mapa de tickets](#mapa-dos-39-tickets-subordinados)

<a id="i02"></a>
### I02 — Tema, primitives e assets definitivos

**Ticket:** [I02 / #135](https://github.com/gmhelmold/HuGR-Orchestra/issues/135) · **Contrato completo:** [`issues/I02.md`](issues/I02.md)
**Caminho:** #215 → [E1 / #130](https://github.com/gmhelmold/HuGR-Orchestra/issues/130) → [I02 / #135](https://github.com/gmhelmold/HuGR-Orchestra/issues/135)
**Dependências de entrada declaradas:** nenhuma neste nó. Leia também as dependências herdadas/finas da task.
**Entrar pelos filhos:** [S03 / #146](https://github.com/gmhelmold/HuGR-Orchestra/issues/146) · [S04 / #147](https://github.com/gmhelmold/HuGR-Orchestra/issues/147) · [S05 / #148](https://github.com/gmhelmold/HuGR-Orchestra/issues/148)

<a id="i02-w1"></a>
#### I02-W1 — Integrar e auditar tema, primitives e assets definitivos
Arquivo: [`issues/I02.md`](issues/I02.md) · localizar o heading `## I02-W1 —`. Os cinco axiomas e seus IDs estão nessa seção.
Tasks: [I02-W1-T1](#i02-w1-t1)

<a id="i02-w1-t1"></a>
#### I02-W1-T1 — Conferir entregas e emitir recibo I02
Arquivo: [`issues/I02.md`](issues/I02.md) · localizar o heading `## I02-W1-T1 —`. Os cinco axiomas e seus IDs estão nessa seção.
```sh
# CWD: $PLAN_ROOT
python3 tools/select_work.py --show I02-W1-T1
```
Provas: `evidence/I02/W1-T1/attempt-NN/`. Template/selagem/validação: [passo a passo](START-HERE.md). Readiness e locks devem ser verificados antes de iniciar; mostrar a task não a libera.

[Voltar ao início](START-HERE.md) · [Mapa de tickets](#mapa-dos-39-tickets-subordinados)

<a id="i03"></a>
### I03 — Shell, navegação e telas de entrada

**Ticket:** [I03 / #136](https://github.com/gmhelmold/HuGR-Orchestra/issues/136) · **Contrato completo:** [`issues/I03.md`](issues/I03.md)
**Caminho:** #215 → [E2 / #131](https://github.com/gmhelmold/HuGR-Orchestra/issues/131) → [I03 / #136](https://github.com/gmhelmold/HuGR-Orchestra/issues/136)
**Dependências de entrada declaradas:** nenhuma neste nó. Leia também as dependências herdadas/finas da task.
**Entrar pelos filhos:** [S06 / #149](https://github.com/gmhelmold/HuGR-Orchestra/issues/149) · [S07 / #150](https://github.com/gmhelmold/HuGR-Orchestra/issues/150) · [S08 / #151](https://github.com/gmhelmold/HuGR-Orchestra/issues/151)

<a id="i03-w1"></a>
#### I03-W1 — Integrar e auditar shell, navegação e telas de entrada
Arquivo: [`issues/I03.md`](issues/I03.md) · localizar o heading `## I03-W1 —`. Os cinco axiomas e seus IDs estão nessa seção.
Tasks: [I03-W1-T1](#i03-w1-t1)

<a id="i03-w1-t1"></a>
#### I03-W1-T1 — Conferir entregas e emitir recibo I03
Arquivo: [`issues/I03.md`](issues/I03.md) · localizar o heading `## I03-W1-T1 —`. Os cinco axiomas e seus IDs estão nessa seção.
```sh
# CWD: $PLAN_ROOT
python3 tools/select_work.py --show I03-W1-T1
```
Provas: `evidence/I03/W1-T1/attempt-NN/`. Template/selagem/validação: [passo a passo](START-HERE.md). Readiness e locks devem ser verificados antes de iniciar; mostrar a task não a libera.

[Voltar ao início](START-HERE.md) · [Mapa de tickets](#mapa-dos-39-tickets-subordinados)

<a id="i04"></a>
### I04 — Conversa, composer e evidências

**Ticket:** [I04 / #137](https://github.com/gmhelmold/HuGR-Orchestra/issues/137) · **Contrato completo:** [`issues/I04.md`](issues/I04.md)
**Caminho:** #215 → [E2 / #131](https://github.com/gmhelmold/HuGR-Orchestra/issues/131) → [I04 / #137](https://github.com/gmhelmold/HuGR-Orchestra/issues/137)
**Dependências de entrada declaradas:** nenhuma neste nó. Leia também as dependências herdadas/finas da task.
**Entrar pelos filhos:** [S09 / #152](https://github.com/gmhelmold/HuGR-Orchestra/issues/152) · [S10 / #153](https://github.com/gmhelmold/HuGR-Orchestra/issues/153) · [S11 / #154](https://github.com/gmhelmold/HuGR-Orchestra/issues/154)

<a id="i04-w1"></a>
#### I04-W1 — Integrar e auditar conversa, composer e evidências
Arquivo: [`issues/I04.md`](issues/I04.md) · localizar o heading `## I04-W1 —`. Os cinco axiomas e seus IDs estão nessa seção.
Tasks: [I04-W1-T1](#i04-w1-t1)

<a id="i04-w1-t1"></a>
#### I04-W1-T1 — Conferir entregas e emitir recibo I04
Arquivo: [`issues/I04.md`](issues/I04.md) · localizar o heading `## I04-W1-T1 —`. Os cinco axiomas e seus IDs estão nessa seção.
```sh
# CWD: $PLAN_ROOT
python3 tools/select_work.py --show I04-W1-T1
```
Provas: `evidence/I04/W1-T1/attempt-NN/`. Template/selagem/validação: [passo a passo](START-HERE.md). Readiness e locks devem ser verificados antes de iniciar; mostrar a task não a libera.

[Voltar ao início](START-HERE.md) · [Mapa de tickets](#mapa-dos-39-tickets-subordinados)

<a id="i05"></a>
### I05 — Configurações e superfícies transversais

**Ticket:** [I05 / #138](https://github.com/gmhelmold/HuGR-Orchestra/issues/138) · **Contrato completo:** [`issues/I05.md`](issues/I05.md)
**Caminho:** #215 → [E2 / #131](https://github.com/gmhelmold/HuGR-Orchestra/issues/131) → [I05 / #138](https://github.com/gmhelmold/HuGR-Orchestra/issues/138)
**Dependências de entrada declaradas:** nenhuma neste nó. Leia também as dependências herdadas/finas da task.
**Entrar pelos filhos:** [S12 / #155](https://github.com/gmhelmold/HuGR-Orchestra/issues/155) · [S13 / #156](https://github.com/gmhelmold/HuGR-Orchestra/issues/156) · [S14 / #157](https://github.com/gmhelmold/HuGR-Orchestra/issues/157)

<a id="i05-w1"></a>
#### I05-W1 — Integrar e auditar configurações e superfícies transversais
Arquivo: [`issues/I05.md`](issues/I05.md) · localizar o heading `## I05-W1 —`. Os cinco axiomas e seus IDs estão nessa seção.
Tasks: [I05-W1-T1](#i05-w1-t1)

<a id="i05-w1-t1"></a>
#### I05-W1-T1 — Conferir entregas e emitir recibo I05
Arquivo: [`issues/I05.md`](issues/I05.md) · localizar o heading `## I05-W1-T1 —`. Os cinco axiomas e seus IDs estão nessa seção.
```sh
# CWD: $PLAN_ROOT
python3 tools/select_work.py --show I05-W1-T1
```
Provas: `evidence/I05/W1-T1/attempt-NN/`. Template/selagem/validação: [passo a passo](START-HERE.md). Readiness e locks devem ser verificados antes de iniciar; mostrar a task não a libera.

[Voltar ao início](START-HERE.md) · [Mapa de tickets](#mapa-dos-39-tickets-subordinados)

<a id="i06"></a>
### I06 — Dock: composição visual e bridge nativa

**Ticket:** [I06 / #139](https://github.com/gmhelmold/HuGR-Orchestra/issues/139) · **Contrato completo:** [`issues/I06.md`](issues/I06.md)
**Caminho:** #215 → [E3 / #132](https://github.com/gmhelmold/HuGR-Orchestra/issues/132) → [I06 / #139](https://github.com/gmhelmold/HuGR-Orchestra/issues/139)
**Dependências de entrada declaradas:** nenhuma neste nó. Leia também as dependências herdadas/finas da task.
**Entrar pelos filhos:** [S15 / #158](https://github.com/gmhelmold/HuGR-Orchestra/issues/158) · [S16 / #159](https://github.com/gmhelmold/HuGR-Orchestra/issues/159)

<a id="i06-w1"></a>
#### I06-W1 — Integrar e auditar dock: composição visual e bridge nativa
Arquivo: [`issues/I06.md`](issues/I06.md) · localizar o heading `## I06-W1 —`. Os cinco axiomas e seus IDs estão nessa seção.
Tasks: [I06-W1-T1](#i06-w1-t1)

<a id="i06-w1-t1"></a>
#### I06-W1-T1 — Conferir entregas e emitir recibo I06
Arquivo: [`issues/I06.md`](issues/I06.md) · localizar o heading `## I06-W1-T1 —`. Os cinco axiomas e seus IDs estão nessa seção.
```sh
# CWD: $PLAN_ROOT
python3 tools/select_work.py --show I06-W1-T1
```
Provas: `evidence/I06/W1-T1/attempt-NN/`. Template/selagem/validação: [passo a passo](START-HERE.md). Readiness e locks devem ser verificados antes de iniciar; mostrar a task não a libera.

[Voltar ao início](START-HERE.md) · [Mapa de tickets](#mapa-dos-39-tickets-subordinados)

<a id="i07"></a>
### I07 — Tasks e atividade: dados incrementais e UI

**Ticket:** [I07 / #140](https://github.com/gmhelmold/HuGR-Orchestra/issues/140) · **Contrato completo:** [`issues/I07.md`](issues/I07.md)
**Caminho:** #215 → [E3 / #132](https://github.com/gmhelmold/HuGR-Orchestra/issues/132) → [I07 / #140](https://github.com/gmhelmold/HuGR-Orchestra/issues/140)
**Dependências de entrada declaradas:** nenhuma neste nó. Leia também as dependências herdadas/finas da task.
**Entrar pelos filhos:** [S17 / #160](https://github.com/gmhelmold/HuGR-Orchestra/issues/160) · [S18 / #161](https://github.com/gmhelmold/HuGR-Orchestra/issues/161)

<a id="i07-w1"></a>
#### I07-W1 — Integrar e auditar tasks e atividade: dados incrementais e ui
Arquivo: [`issues/I07.md`](issues/I07.md) · localizar o heading `## I07-W1 —`. Os cinco axiomas e seus IDs estão nessa seção.
Tasks: [I07-W1-T1](#i07-w1-t1)

<a id="i07-w1-t1"></a>
#### I07-W1-T1 — Conferir entregas e emitir recibo I07
Arquivo: [`issues/I07.md`](issues/I07.md) · localizar o heading `## I07-W1-T1 —`. Os cinco axiomas e seus IDs estão nessa seção.
```sh
# CWD: $PLAN_ROOT
python3 tools/select_work.py --show I07-W1-T1
```
Provas: `evidence/I07/W1-T1/attempt-NN/`. Template/selagem/validação: [passo a passo](START-HERE.md). Readiness e locks devem ser verificados antes de iniciar; mostrar a task não a libera.

[Voltar ao início](START-HERE.md) · [Mapa de tickets](#mapa-dos-39-tickets-subordinados)

<a id="i08"></a>
### I08 — Contexto, governança e Janitor

**Ticket:** [I08 / #141](https://github.com/gmhelmold/HuGR-Orchestra/issues/141) · **Contrato completo:** [`issues/I08.md`](issues/I08.md)
**Caminho:** #215 → [E3 / #132](https://github.com/gmhelmold/HuGR-Orchestra/issues/132) → [I08 / #141](https://github.com/gmhelmold/HuGR-Orchestra/issues/141)
**Dependências de entrada declaradas:** nenhuma neste nó. Leia também as dependências herdadas/finas da task.
**Entrar pelos filhos:** [S19 / #162](https://github.com/gmhelmold/HuGR-Orchestra/issues/162) · [S20 / #163](https://github.com/gmhelmold/HuGR-Orchestra/issues/163) · [S21 / #164](https://github.com/gmhelmold/HuGR-Orchestra/issues/164)

<a id="i08-w1"></a>
#### I08-W1 — Integrar e auditar contexto, governança e janitor
Arquivo: [`issues/I08.md`](issues/I08.md) · localizar o heading `## I08-W1 —`. Os cinco axiomas e seus IDs estão nessa seção.
Tasks: [I08-W1-T1](#i08-w1-t1)

<a id="i08-w1-t1"></a>
#### I08-W1-T1 — Conferir entregas e emitir recibo I08
Arquivo: [`issues/I08.md`](issues/I08.md) · localizar o heading `## I08-W1-T1 —`. Os cinco axiomas e seus IDs estão nessa seção.
```sh
# CWD: $PLAN_ROOT
python3 tools/select_work.py --show I08-W1-T1
```
Provas: `evidence/I08/W1-T1/attempt-NN/`. Template/selagem/validação: [passo a passo](START-HERE.md). Readiness e locks devem ser verificados antes de iniciar; mostrar a task não a libera.

[Voltar ao início](START-HERE.md) · [Mapa de tickets](#mapa-dos-39-tickets-subordinados)

<a id="i09"></a>
### I09 — Gates de acessibilidade, performance e acabamento

**Ticket:** [I09 / #142](https://github.com/gmhelmold/HuGR-Orchestra/issues/142) · **Contrato completo:** [`issues/I09.md`](issues/I09.md)
**Caminho:** #215 → [E4 / #133](https://github.com/gmhelmold/HuGR-Orchestra/issues/133) → [I09 / #142](https://github.com/gmhelmold/HuGR-Orchestra/issues/142)
**Dependências de entrada declaradas:** nenhuma neste nó. Leia também as dependências herdadas/finas da task.
**Entrar pelos filhos:** [S22 / #165](https://github.com/gmhelmold/HuGR-Orchestra/issues/165) · [S23 / #166](https://github.com/gmhelmold/HuGR-Orchestra/issues/166) · [S24 / #167](https://github.com/gmhelmold/HuGR-Orchestra/issues/167)

<a id="i09-w1"></a>
#### I09-W1 — Integrar e auditar gates de acessibilidade, performance e acabamento
Arquivo: [`issues/I09.md`](issues/I09.md) · localizar o heading `## I09-W1 —`. Os cinco axiomas e seus IDs estão nessa seção.
Tasks: [I09-W1-T1](#i09-w1-t1)

<a id="i09-w1-t1"></a>
#### I09-W1-T1 — Conferir entregas e emitir recibo I09
Arquivo: [`issues/I09.md`](issues/I09.md) · localizar o heading `## I09-W1-T1 —`. Os cinco axiomas e seus IDs estão nessa seção.
```sh
# CWD: $PLAN_ROOT
python3 tools/select_work.py --show I09-W1-T1
```
Provas: `evidence/I09/W1-T1/attempt-NN/`. Template/selagem/validação: [passo a passo](START-HERE.md). Readiness e locks devem ser verificados antes de iniciar; mostrar a task não a libera.

[Voltar ao início](START-HERE.md) · [Mapa de tickets](#mapa-dos-39-tickets-subordinados)

<a id="i10"></a>
### I10 — Integração final, ativação e transferência

**Ticket:** [I10 / #143](https://github.com/gmhelmold/HuGR-Orchestra/issues/143) · **Contrato completo:** [`issues/I10.md`](issues/I10.md)
**Caminho:** #215 → [E4 / #133](https://github.com/gmhelmold/HuGR-Orchestra/issues/133) → [I10 / #143](https://github.com/gmhelmold/HuGR-Orchestra/issues/143)
**Dependências de entrada declaradas:** nenhuma neste nó. Leia também as dependências herdadas/finas da task.
**Entrar pelos filhos:** [S25 / #168](https://github.com/gmhelmold/HuGR-Orchestra/issues/168)

<a id="i10-w1"></a>
#### I10-W1 — Integrar e auditar integração final, ativação e transferência
Arquivo: [`issues/I10.md`](issues/I10.md) · localizar o heading `## I10-W1 —`. Os cinco axiomas e seus IDs estão nessa seção.
Tasks: [I10-W1-T1](#i10-w1-t1)

<a id="i10-w1-t1"></a>
#### I10-W1-T1 — Conferir entregas e emitir recibo I10
Arquivo: [`issues/I10.md`](issues/I10.md) · localizar o heading `## I10-W1-T1 —`. Os cinco axiomas e seus IDs estão nessa seção.
```sh
# CWD: $PLAN_ROOT
python3 tools/select_work.py --show I10-W1-T1
```
Provas: `evidence/I10/W1-T1/attempt-NN/`. Template/selagem/validação: [passo a passo](START-HERE.md). Readiness e locks devem ser verificados antes de iniciar; mostrar a task não a libera.

[Voltar ao início](START-HERE.md) · [Mapa de tickets](#mapa-dos-39-tickets-subordinados)

<a id="s01"></a>
### S01 — Censo de superfícies e contratos de capacidade

**Ticket:** [S01 / #144](https://github.com/gmhelmold/HuGR-Orchestra/issues/144) · **Contrato completo:** [`issues/S01.md`](issues/S01.md)
**Caminho:** #215 → [E1 / #130](https://github.com/gmhelmold/HuGR-Orchestra/issues/130) → [I01 / #134](https://github.com/gmhelmold/HuGR-Orchestra/issues/134) → [S01 / #144](https://github.com/gmhelmold/HuGR-Orchestra/issues/144)
**Dependências de entrada declaradas:** nenhuma neste nó. Leia também as dependências herdadas/finas da task.
**Entrega esperada:** Inventário auditável e bindings de capacidade usados por todos os implementadores.
**Contratos usados pelas tasks (leitura seletiva por categoria):** [`CONTRACTS.md`](CONTRACTS.md) · [`RECEIPTS-v4.md`](RECEIPTS-v4.md) · [`BRAND-INTEGRATION.md`](BRAND-INTEGRATION.md) · [`BRAND-ASSETS.json`](BRAND-ASSETS.json) · [`WIDGETS.md`](WIDGETS.md)

**Entradas mapeadas de código / fontes (não são todas permissões de edição):**
- [`AGENTS.md`](../../AGENTS.md) — presente no snapshot; raiz `$REPO`
- [`packages/app/src/app.tsx`](../../packages/app/src/app.tsx) — presente no snapshot; raiz `$REPO`
- [`packages/app/src/context/settings.tsx`](../../packages/app/src/context/settings.tsx) — presente no snapshot; raiz `$REPO`
- [`packages/app/src/pages/session.tsx`](../../packages/app/src/pages/session.tsx) — presente no snapshot; raiz `$REPO`
- [`packages/desktop/src/main/app-dock.ts`](../../packages/desktop/src/main/app-dock.ts) — presente no snapshot; raiz `$REPO`
- [`specs/hugr-maestro/SESSION-STATE.md`](../../specs/hugr-maestro/SESSION-STATE.md) — presente no snapshot; raiz `$REPO`

**Escrita autorizada no nível da subissue — a task pode ser mais restrita:**
```text
specs/orchestra-visual/PLAN.json
specs/orchestra-visual/SURFACES.json
specs/orchestra-visual/CENSUS.json
specs/orchestra-visual/MAP.md
specs/orchestra-visual/OWNERSHIP.md
specs/orchestra-visual/issues/*.md
specs/orchestra-visual/evidence/S01/**
specs/orchestra-visual/coverage-manifest.json
specs/orchestra-visual/BRAND-ASSETS.json
specs/orchestra-visual/BRAND-INTEGRATION.md
specs/orchestra-visual/WIDGETS.md
```
**Registros de cobertura:** consulte SURFACES.json; não deduzir cobertura só por nome de arquivo
**Provas da frente:** `evidence/S01/`; só crie arquivos das suas tentativas. Não há provas de produto preaprovadas.

<a id="s01-w1"></a>
#### S01-W1 — Implementar e provar censo de superfícies e contratos de capacidade
Arquivo: [`issues/S01.md`](issues/S01.md) · localizar o heading `## S01-W1 —`. Os cinco axiomas e seus IDs estão nessa seção.
Tasks: [S01-W1-T1](#s01-w1-t1) · [S01-W1-T2](#s01-w1-t2)

<a id="s01-w1-t1"></a>
#### S01-W1-T1 — Implementar censo de superfícies e contratos de capacidade
Arquivo: [`issues/S01.md`](issues/S01.md) · localizar o heading `## S01-W1-T1 —`. Os cinco axiomas e seus IDs estão nessa seção.
```sh
# CWD: $PLAN_ROOT
python3 tools/select_work.py --show S01-W1-T1
```
Provas: `evidence/S01/W1-T1/attempt-NN/`. Template/selagem/validação: [passo a passo](START-HERE.md). Readiness e locks devem ser verificados antes de iniciar; mostrar a task não a libera.

<a id="s01-w1-t2"></a>
#### S01-W1-T2 — Testar, medir e revisar censo de superfícies e contratos de capacidade
Arquivo: [`issues/S01.md`](issues/S01.md) · localizar o heading `## S01-W1-T2 —`. Os cinco axiomas e seus IDs estão nessa seção.
```sh
# CWD: $PLAN_ROOT
python3 tools/select_work.py --show S01-W1-T2
```
Provas: `evidence/S01/W1-T2/attempt-NN/`. Template/selagem/validação: [passo a passo](START-HERE.md). Readiness e locks devem ser verificados antes de iniciar; mostrar a task não a libera.

[Voltar ao início](START-HERE.md) · [Mapa de tickets](#mapa-dos-39-tickets-subordinados)

<a id="s02"></a>
### S02 — Fixture, medição e budgets que realmente reprovam

**Ticket:** [S02 / #145](https://github.com/gmhelmold/HuGR-Orchestra/issues/145) · **Contrato completo:** [`issues/S02.md`](issues/S02.md)
**Caminho:** #215 → [E1 / #130](https://github.com/gmhelmold/HuGR-Orchestra/issues/130) → [I01 / #134](https://github.com/gmhelmold/HuGR-Orchestra/issues/134) → [S02 / #145](https://github.com/gmhelmold/HuGR-Orchestra/issues/145)
**Dependências de entrada declaradas:** [S01](#s01). Leia também as dependências herdadas/finas da task.
**Entrega esperada:** Harness de regressão e fixture reutilizável; sem novo runtime de benchmark.
**Contratos usados pelas tasks (leitura seletiva por categoria):** [`CONTRACTS.md`](CONTRACTS.md) · [`SPEC.md`](SPEC.md) · [`PERFORMANCE.md`](PERFORMANCE.md) · [`BUDGETS.json`](BUDGETS.json) · [`COVERAGE.json`](COVERAGE.json) · [`fixture.json`](fixture.json) · [`RECEIPTS-v4.md`](RECEIPTS-v4.md) · [`BRAND-INTEGRATION.md`](BRAND-INTEGRATION.md) · [`BRAND-ASSETS.json`](BRAND-ASSETS.json) · [`WIDGETS.md`](WIDGETS.md)

**Entradas mapeadas de código / fontes (não são todas permissões de edição):**
- [`packages/app/e2e/performance/README.md`](../../packages/app/e2e/performance/README.md) — presente no snapshot; raiz `$REPO`
- [`packages/app/e2e/performance/benchmark.ts`](../../packages/app/e2e/performance/benchmark.ts) — presente no snapshot; raiz `$REPO`
- [`packages/app/e2e/performance/playwright.config.ts`](../../packages/app/e2e/performance/playwright.config.ts) — presente no snapshot; raiz `$REPO`
- [`packages/app/playwright.config.ts`](../../packages/app/playwright.config.ts) — presente no snapshot; raiz `$REPO`

**Escrita autorizada no nível da subissue — a task pode ser mais restrita:**
```text
packages/app/e2e/performance/orchestra/**
packages/app/e2e/regression/orchestra-reference.spec.ts
specs/orchestra-visual/performance-baseline.json
specs/orchestra-visual/fixtures/**
specs/orchestra-visual/evidence/S02/**
```
**Registros de cobertura:** `UI64` Performance harness [measurement-anchor]
**Provas da frente:** `evidence/S02/`; só crie arquivos das suas tentativas. Não há provas de produto preaprovadas.

<a id="s02-w1"></a>
#### S02-W1 — Implementar e provar fixture, medição e budgets que realmente reprovam
Arquivo: [`issues/S02.md`](issues/S02.md) · localizar o heading `## S02-W1 —`. Os cinco axiomas e seus IDs estão nessa seção.
Tasks: [S02-W1-T1](#s02-w1-t1) · [S02-W1-T2](#s02-w1-t2)

<a id="s02-w1-t1"></a>
#### S02-W1-T1 — Implementar fixture, medição e budgets que realmente reprovam
Arquivo: [`issues/S02.md`](issues/S02.md) · localizar o heading `## S02-W1-T1 —`. Os cinco axiomas e seus IDs estão nessa seção.
```sh
# CWD: $PLAN_ROOT
python3 tools/select_work.py --show S02-W1-T1
```
Provas: `evidence/S02/W1-T1/attempt-NN/`. Template/selagem/validação: [passo a passo](START-HERE.md). Readiness e locks devem ser verificados antes de iniciar; mostrar a task não a libera.

<a id="s02-w1-t2"></a>
#### S02-W1-T2 — Testar, medir e revisar fixture, medição e budgets que realmente reprovam
Arquivo: [`issues/S02.md`](issues/S02.md) · localizar o heading `## S02-W1-T2 —`. Os cinco axiomas e seus IDs estão nessa seção.
```sh
# CWD: $PLAN_ROOT
python3 tools/select_work.py --show S02-W1-T2
```
Provas: `evidence/S02/W1-T2/attempt-NN/`. Template/selagem/validação: [passo a passo](START-HERE.md). Readiness e locks devem ser verificados antes de iniciar; mostrar a task não a libera.

[Voltar ao início](START-HERE.md) · [Mapa de tickets](#mapa-dos-39-tickets-subordinados)

<a id="s03"></a>
### S03 — Tema Graphite em V1/V2 e primeiro paint

**Ticket:** [S03 / #146](https://github.com/gmhelmold/HuGR-Orchestra/issues/146) · **Contrato completo:** [`issues/S03.md`](issues/S03.md)
**Caminho:** #215 → [E1 / #130](https://github.com/gmhelmold/HuGR-Orchestra/issues/130) → [I02 / #135](https://github.com/gmhelmold/HuGR-Orchestra/issues/135) → [S03 / #146](https://github.com/gmhelmold/HuGR-Orchestra/issues/146)
**Dependências de entrada declaradas:** [S02](#s02). Leia também as dependências herdadas/finas da task.
**Entrega esperada:** Tema selecionável persistente e render sem flash.
**Contratos usados pelas tasks (leitura seletiva por categoria):** [`CONTRACTS.md`](CONTRACTS.md) · [`SPEC.md`](SPEC.md) · [`PERFORMANCE.md`](PERFORMANCE.md) · [`BUDGETS.json`](BUDGETS.json) · [`COVERAGE.json`](COVERAGE.json) · [`fixture.json`](fixture.json) · [`RECEIPTS-v4.md`](RECEIPTS-v4.md) · [`BRAND-INTEGRATION.md`](BRAND-INTEGRATION.md) · [`BRAND-ASSETS.json`](BRAND-ASSETS.json)

**Entradas mapeadas de código / fontes (não são todas permissões de edição):**
- [`packages/ui/src/theme/types.ts`](../../packages/ui/src/theme/types.ts) — presente no snapshot; raiz `$REPO`
- [`packages/ui/src/theme/context.tsx`](../../packages/ui/src/theme/context.tsx) — presente no snapshot; raiz `$REPO`
- [`packages/ui/src/theme/v2/resolve.ts`](../../packages/ui/src/theme/v2/resolve.ts) — presente no snapshot; raiz `$REPO`
- [`packages/ui/src/theme/default-themes.ts`](../../packages/ui/src/theme/default-themes.ts) — presente no snapshot; raiz `$REPO`
- [`packages/app/src/pages/layout-new.tsx`](../../packages/app/src/pages/layout-new.tsx) — presente no snapshot; raiz `$REPO`

**Escrita autorizada no nível da subissue — a task pode ser mais restrita:**
```text
packages/ui/src/theme/**
packages/app/index.html
packages/app/src/index.css
specs/orchestra-visual/evidence/S03/**
```
**Registros de cobertura:** `UI01` ThemeProvider V1/V2 [read-anchor], `UI02` Tokens e schema de tema [read-anchor], `UI75` Tema aplicado ao shell existente: primeiro paint e troca [ui-surface]
**Provas da frente:** `evidence/S03/`; só crie arquivos das suas tentativas. Não há provas de produto preaprovadas.

<a id="s03-w1"></a>
#### S03-W1 — Implementar e provar tema graphite em v1/v2 e primeiro paint
Arquivo: [`issues/S03.md`](issues/S03.md) · localizar o heading `## S03-W1 —`. Os cinco axiomas e seus IDs estão nessa seção.
Tasks: [S03-W1-T1](#s03-w1-t1) · [S03-W1-T2](#s03-w1-t2)

<a id="s03-w1-t1"></a>
#### S03-W1-T1 — Implementar tema graphite em v1/v2 e primeiro paint
Arquivo: [`issues/S03.md`](issues/S03.md) · localizar o heading `## S03-W1-T1 —`. Os cinco axiomas e seus IDs estão nessa seção.
```sh
# CWD: $PLAN_ROOT
python3 tools/select_work.py --show S03-W1-T1
```
Provas: `evidence/S03/W1-T1/attempt-NN/`. Template/selagem/validação: [passo a passo](START-HERE.md). Readiness e locks devem ser verificados antes de iniciar; mostrar a task não a libera.

<a id="s03-w1-t2"></a>
#### S03-W1-T2 — Testar, medir e revisar tema graphite em v1/v2 e primeiro paint
Arquivo: [`issues/S03.md`](issues/S03.md) · localizar o heading `## S03-W1-T2 —`. Os cinco axiomas e seus IDs estão nessa seção.
```sh
# CWD: $PLAN_ROOT
python3 tools/select_work.py --show S03-W1-T2
```
Provas: `evidence/S03/W1-T2/attempt-NN/`. Template/selagem/validação: [passo a passo](START-HERE.md). Readiness e locks devem ser verificados antes de iniciar; mostrar a task não a libera.

[Voltar ao início](START-HERE.md) · [Mapa de tickets](#mapa-dos-39-tickets-subordinados)

<a id="s04"></a>
### S04 — Primitives, estados e tipografia de toda a UI

**Ticket:** [S04 / #147](https://github.com/gmhelmold/HuGR-Orchestra/issues/147) · **Contrato completo:** [`issues/S04.md`](issues/S04.md)
**Caminho:** #215 → [E1 / #130](https://github.com/gmhelmold/HuGR-Orchestra/issues/130) → [I02 / #135](https://github.com/gmhelmold/HuGR-Orchestra/issues/135) → [S04 / #147](https://github.com/gmhelmold/HuGR-Orchestra/issues/147)
**Dependências de entrada declaradas:** [S03-W1-T1](#s03-w1-t1). Leia também as dependências herdadas/finas da task.
**Entrega esperada:** Primitives reutilizadas consistentes; sem biblioteca paralela.
**Contratos usados pelas tasks (leitura seletiva por categoria):** [`CONTRACTS.md`](CONTRACTS.md) · [`SPEC.md`](SPEC.md) · [`PERFORMANCE.md`](PERFORMANCE.md) · [`BUDGETS.json`](BUDGETS.json) · [`COVERAGE.json`](COVERAGE.json) · [`fixture.json`](fixture.json) · [`RECEIPTS-v4.md`](RECEIPTS-v4.md) · [`BRAND-INTEGRATION.md`](BRAND-INTEGRATION.md) · [`BRAND-ASSETS.json`](BRAND-ASSETS.json)

**Entradas mapeadas de código / fontes (não são todas permissões de edição):**
- [`packages/ui/src/components/font.tsx`](../../packages/ui/src/components/font.tsx) — presente no snapshot; raiz `$REPO`
- [`packages/ui/src/theme/types.ts`](../../packages/ui/src/theme/types.ts) — presente no snapshot; raiz `$REPO`
- [`packages/app/src/components/settings-v2/settings-v2.css`](../../packages/app/src/components/settings-v2/settings-v2.css) — presente no snapshot; raiz `$REPO`
- [`packages/ui/package.json`](../../packages/ui/package.json) — presente no snapshot; raiz `$REPO`

**Escrita autorizada no nível da subissue — a task pode ser mais restrita:**
```text
packages/ui/src/components/**
packages/ui/src/styles/**
packages/ui/src/v2/**
specs/orchestra-visual/evidence/S04/**
```
**Exclusões:**
```text
packages/ui/src/components/logo.tsx
```
**Registros de cobertura:** `UI03` Primitives legados/V2 [read-anchor], `UI04` Fonte e ícones compartilhados [ui-surface]
**Provas da frente:** `evidence/S04/`; só crie arquivos das suas tentativas. Não há provas de produto preaprovadas.

<a id="s04-w1"></a>
#### S04-W1 — Implementar e provar primitives, estados e tipografia de toda a ui
Arquivo: [`issues/S04.md`](issues/S04.md) · localizar o heading `## S04-W1 —`. Os cinco axiomas e seus IDs estão nessa seção.
Tasks: [S04-W1-T1](#s04-w1-t1) · [S04-W1-T2](#s04-w1-t2)

<a id="s04-w1-t1"></a>
#### S04-W1-T1 — Implementar primitives, estados e tipografia de toda a ui
Arquivo: [`issues/S04.md`](issues/S04.md) · localizar o heading `## S04-W1-T1 —`. Os cinco axiomas e seus IDs estão nessa seção.
```sh
# CWD: $PLAN_ROOT
python3 tools/select_work.py --show S04-W1-T1
```
Provas: `evidence/S04/W1-T1/attempt-NN/`. Template/selagem/validação: [passo a passo](START-HERE.md). Readiness e locks devem ser verificados antes de iniciar; mostrar a task não a libera.

<a id="s04-w1-t2"></a>
#### S04-W1-T2 — Testar, medir e revisar primitives, estados e tipografia de toda a ui
Arquivo: [`issues/S04.md`](issues/S04.md) · localizar o heading `## S04-W1-T2 —`. Os cinco axiomas e seus IDs estão nessa seção.
```sh
# CWD: $PLAN_ROOT
python3 tools/select_work.py --show S04-W1-T2
```
Provas: `evidence/S04/W1-T2/attempt-NN/`. Template/selagem/validação: [passo a passo](START-HERE.md). Readiness e locks devem ser verificados antes de iniciar; mostrar a task não a libera.

[Voltar ao início](START-HERE.md) · [Mapa de tickets](#mapa-dos-39-tickets-subordinados)

<a id="s05"></a>
### S05 — Marca HuGR oficial e paisagem independente

**Ticket:** [S05 / #148](https://github.com/gmhelmold/HuGR-Orchestra/issues/148) · **Contrato completo:** [`issues/S05.md`](issues/S05.md)
**Caminho:** #215 → [E1 / #130](https://github.com/gmhelmold/HuGR-Orchestra/issues/130) → [I02 / #135](https://github.com/gmhelmold/HuGR-Orchestra/issues/135) → [S05 / #148](https://github.com/gmhelmold/HuGR-Orchestra/issues/148)
**Dependências de entrada declaradas:** [S02](#s02). Leia também as dependências herdadas/finas da task.
**Entrega esperada:** Assets HuGR oficiais copiados intactos, adaptador Solid local e paisagem independente; proveniência e consumidores explícitos.
**Contratos usados pelas tasks (leitura seletiva por categoria):** [`CONTRACTS.md`](CONTRACTS.md) · [`SPEC.md`](SPEC.md) · [`PERFORMANCE.md`](PERFORMANCE.md) · [`BUDGETS.json`](BUDGETS.json) · [`COVERAGE.json`](COVERAGE.json) · [`fixture.json`](fixture.json) · [`RECEIPTS-v4.md`](RECEIPTS-v4.md) · [`BRAND-INTEGRATION.md`](BRAND-INTEGRATION.md) · [`BRAND-ASSETS.json`](BRAND-ASSETS.json)

**Entradas mapeadas de código / fontes (não são todas permissões de edição):**
- [`packages/app/src/pages/session/zen-assets/NOTICE.md`](../../packages/app/src/pages/session/zen-assets/NOTICE.md) — presente no snapshot; raiz `$REPO`
- [`packages/ui/src/components/logo.tsx`](../../packages/ui/src/components/logo.tsx) — presente no snapshot; raiz `$REPO`
- `packages/app/src/components/orchestra-brand.tsx` — entrada mapeada; **existência/consumer a conferir em S01**

**Escrita autorizada no nível da subissue — a task pode ser mais restrita:**
```text
packages/app/src/assets/orchestra/**
packages/desktop/resources/orchestra/**
specs/orchestra-visual/evidence/S05/**
packages/app/src/components/orchestra-brand.tsx
packages/app/src/components/orchestra-brand.test.tsx
packages/ui/src/components/logo.tsx
```
**Registros de cobertura:** `UI05` Marca e paisagem [ui-surface]
**Provas da frente:** `evidence/S05/`; só crie arquivos das suas tentativas. Não há provas de produto preaprovadas.

<a id="s05-w1"></a>
#### S05-W1 — Integrar marca HuGR intacta e verificar a paisagem
Arquivo: [`issues/S05.md`](issues/S05.md) · localizar o heading `## S05-W1 —`. Os cinco axiomas e seus IDs estão nessa seção.
Tasks: [S05-W1-T1](#s05-w1-t1) · [S05-W1-T2](#s05-w1-t2)

<a id="s05-w1-t1"></a>
#### S05-W1-T1 — Copiar assets HuGR oficiais e preparar o adaptador Solid
Arquivo: [`issues/S05.md`](issues/S05.md) · localizar o heading `## S05-W1-T1 —`. Os cinco axiomas e seus IDs estão nessa seção.
```sh
# CWD: $PLAN_ROOT
python3 tools/select_work.py --show S05-W1-T1
```
Provas: `evidence/S05/W1-T1/attempt-NN/`. Template/selagem/validação: [passo a passo](START-HERE.md). Readiness e locks devem ser verificados antes de iniciar; mostrar a task não a libera.

<a id="s05-w1-t2"></a>
#### S05-W1-T2 — Verificar origem, render e custo dos assets integrados
Arquivo: [`issues/S05.md`](issues/S05.md) · localizar o heading `## S05-W1-T2 —`. Os cinco axiomas e seus IDs estão nessa seção.
```sh
# CWD: $PLAN_ROOT
python3 tools/select_work.py --show S05-W1-T2
```
Provas: `evidence/S05/W1-T2/attempt-NN/`. Template/selagem/validação: [passo a passo](START-HERE.md). Readiness e locks devem ser verificados antes de iniciar; mostrar a task não a libera.

[Voltar ao início](START-HERE.md) · [Mapa de tickets](#mapa-dos-39-tickets-subordinados)

<a id="s06"></a>
### S06 — Shell e navegação da composição aprovada

**Ticket:** [S06 / #149](https://github.com/gmhelmold/HuGR-Orchestra/issues/149) · **Contrato completo:** [`issues/S06.md`](issues/S06.md)
**Caminho:** #215 → [E2 / #131](https://github.com/gmhelmold/HuGR-Orchestra/issues/131) → [I03 / #136](https://github.com/gmhelmold/HuGR-Orchestra/issues/136) → [S06 / #149](https://github.com/gmhelmold/HuGR-Orchestra/issues/149)
**Dependências de entrada declaradas:** [S03-W1-T1](#s03-w1-t1), [S04-W1-T1](#s04-w1-t1), [S05-W1-T1](#s05-w1-t1), [S22-W1-T1](#s22-w1-t1). Leia também as dependências herdadas/finas da task.
**Entrega esperada:** Shell reutilizável, sem alteração do modelo de sessão.
**Contratos usados pelas tasks (leitura seletiva por categoria):** [`CONTRACTS.md`](CONTRACTS.md) · [`SPEC.md`](SPEC.md) · [`PERFORMANCE.md`](PERFORMANCE.md) · [`BUDGETS.json`](BUDGETS.json) · [`COVERAGE.json`](COVERAGE.json) · [`fixture.json`](fixture.json) · [`RECEIPTS-v4.md`](RECEIPTS-v4.md) · [`BRAND-INTEGRATION.md`](BRAND-INTEGRATION.md) · [`BRAND-ASSETS.json`](BRAND-ASSETS.json) · [`WIDGETS.md`](WIDGETS.md)

**Entradas mapeadas de código / fontes (não são todas permissões de edição):**
- [`packages/app/src/app.tsx`](../../packages/app/src/app.tsx) — presente no snapshot; raiz `$REPO`
- [`packages/app/src/context/tabs.tsx`](../../packages/app/src/context/tabs.tsx) — presente no snapshot; raiz `$REPO`
- [`packages/app/src/context/layout.tsx`](../../packages/app/src/context/layout.tsx) — presente no snapshot; raiz `$REPO`
- [`packages/app/src/context/settings.tsx`](../../packages/app/src/context/settings.tsx) — presente no snapshot; raiz `$REPO`
- [`packages/app/src/pages/layout-new.tsx`](../../packages/app/src/pages/layout-new.tsx) — presente no snapshot; raiz `$REPO`
- [`packages/app/src/components/titlebar.tsx`](../../packages/app/src/components/titlebar.tsx) — presente no snapshot; raiz `$REPO`
- [`packages/app/src/components/session/session-header.tsx`](../../packages/app/src/components/session/session-header.tsx) — presente no snapshot; raiz `$REPO`
- [`packages/app/src/pages/layout/sidebar-shell.tsx`](../../packages/app/src/pages/layout/sidebar-shell.tsx) — presente no snapshot; raiz `$REPO`
- [`packages/app/src/pages/layout/sidebar-items.tsx`](../../packages/app/src/pages/layout/sidebar-items.tsx) — presente no snapshot; raiz `$REPO`
- [`packages/app/src/pages/layout/sidebar-project.tsx`](../../packages/app/src/pages/layout/sidebar-project.tsx) — presente no snapshot; raiz `$REPO`
- [`packages/app/src/pages/layout/sidebar-workspace.tsx`](../../packages/app/src/pages/layout/sidebar-workspace.tsx) — presente no snapshot; raiz `$REPO`
- [`packages/app/src/pages/layout/inline-editor.tsx`](../../packages/app/src/pages/layout/inline-editor.tsx) — presente no snapshot; raiz `$REPO`
- [`packages/app/src/pages/layout/session-tab-avatar.tsx`](../../packages/app/src/pages/layout/session-tab-avatar.tsx) — presente no snapshot; raiz `$REPO`

**Escrita autorizada no nível da subissue — a task pode ser mais restrita:**
```text
packages/app/src/pages/layout-new.tsx
packages/app/src/pages/layout.tsx
packages/app/src/components/titlebar*
packages/app/src/pages/session/session-panel-layout.ts
packages/app/src/pages/session/session-panel-width.ts
packages/app/src/pages/session/orchestra-shell*
packages/app/src/components/session/session-header.tsx
specs/orchestra-visual/evidence/S06/**
packages/app/src/pages/layout/**
```
**Registros de cobertura:** `UI06` Shell novo e legado [ui-surface], `UI07` Titlebar e abas da sessão [ui-surface], `UI08` Header da sessão [ui-surface], `UI69` sidebar-shell.tsx [ui-surface], `UI70` sidebar-items.tsx [ui-surface], `UI71` sidebar-project.tsx [ui-surface], `UI72` sidebar-workspace.tsx [ui-surface], `UI73` inline-editor.tsx [ui-surface], `UI74` session-tab-avatar.tsx [ui-surface]
**Provas da frente:** `evidence/S06/`; só crie arquivos das suas tentativas. Não há provas de produto preaprovadas.

<a id="s06-w1"></a>
#### S06-W1 — Implementar e provar shell e navegação da composição aprovada
Arquivo: [`issues/S06.md`](issues/S06.md) · localizar o heading `## S06-W1 —`. Os cinco axiomas e seus IDs estão nessa seção.
Tasks: [S06-W1-T1](#s06-w1-t1) · [S06-W1-T2](#s06-w1-t2)

<a id="s06-w1-t1"></a>
#### S06-W1-T1 — Implementar shell e navegação da composição aprovada
Arquivo: [`issues/S06.md`](issues/S06.md) · localizar o heading `## S06-W1-T1 —`. Os cinco axiomas e seus IDs estão nessa seção.
```sh
# CWD: $PLAN_ROOT
python3 tools/select_work.py --show S06-W1-T1
```
Provas: `evidence/S06/W1-T1/attempt-NN/`. Template/selagem/validação: [passo a passo](START-HERE.md). Readiness e locks devem ser verificados antes de iniciar; mostrar a task não a libera.

<a id="s06-w1-t2"></a>
#### S06-W1-T2 — Testar, medir e revisar shell e navegação da composição aprovada
Arquivo: [`issues/S06.md`](issues/S06.md) · localizar o heading `## S06-W1-T2 —`. Os cinco axiomas e seus IDs estão nessa seção.
```sh
# CWD: $PLAN_ROOT
python3 tools/select_work.py --show S06-W1-T2
```
Provas: `evidence/S06/W1-T2/attempt-NN/`. Template/selagem/validação: [passo a passo](START-HERE.md). Readiness e locks devem ser verificados antes de iniciar; mostrar a task não a libera.

[Voltar ao início](START-HERE.md) · [Mapa de tickets](#mapa-dos-39-tickets-subordinados)

<a id="s07"></a>
### S07 — Home, nova sessão, onboarding e erros

**Ticket:** [S07 / #150](https://github.com/gmhelmold/HuGR-Orchestra/issues/150) · **Contrato completo:** [`issues/S07.md`](issues/S07.md)
**Caminho:** #215 → [E2 / #131](https://github.com/gmhelmold/HuGR-Orchestra/issues/131) → [I03 / #136](https://github.com/gmhelmold/HuGR-Orchestra/issues/136) → [S07 / #150](https://github.com/gmhelmold/HuGR-Orchestra/issues/150)
**Dependências de entrada declaradas:** [S03-W1-T1](#s03-w1-t1), [S04-W1-T1](#s04-w1-t1), [S22-W1-T1](#s22-w1-t1), [S25-W0-T2](#s25-w0-t2). Leia também as dependências herdadas/finas da task.
**Entrega esperada:** Entradas e estados de falha coerentes com cockpit.
**Contratos usados pelas tasks (leitura seletiva por categoria):** [`CONTRACTS.md`](CONTRACTS.md) · [`SPEC.md`](SPEC.md) · [`PERFORMANCE.md`](PERFORMANCE.md) · [`BUDGETS.json`](BUDGETS.json) · [`COVERAGE.json`](COVERAGE.json) · [`fixture.json`](fixture.json) · [`RECEIPTS-v4.md`](RECEIPTS-v4.md) · [`BRAND-INTEGRATION.md`](BRAND-INTEGRATION.md) · [`BRAND-ASSETS.json`](BRAND-ASSETS.json)

**Entradas mapeadas de código / fontes (não são todas permissões de edição):**
- [`packages/app/src/app.tsx`](../../packages/app/src/app.tsx) — presente no snapshot; raiz `$REPO`
- [`packages/app/src/pages/home/home-controller.ts`](../../packages/app/src/pages/home/home-controller.ts) — presente no snapshot; raiz `$REPO`
- [`packages/app/src/pages/home.tsx`](../../packages/app/src/pages/home.tsx) — presente no snapshot; raiz `$REPO`
- [`packages/app/src/pages/home/legacy-home.tsx`](../../packages/app/src/pages/home/legacy-home.tsx) — presente no snapshot; raiz `$REPO`
- [`packages/app/src/pages/new-session.tsx`](../../packages/app/src/pages/new-session.tsx) — presente no snapshot; raiz `$REPO`
- [`packages/app/src/components/session/session-new-view.tsx`](../../packages/app/src/components/session/session-new-view.tsx) — presente no snapshot; raiz `$REPO`
- [`packages/app/src/pages/error.tsx`](../../packages/app/src/pages/error.tsx) — presente no snapshot; raiz `$REPO`

**Escrita autorizada no nível da subissue — a task pode ser mais restrita:**
```text
packages/app/src/pages/home.tsx
packages/app/src/pages/home/**
packages/app/src/pages/new-session*
packages/app/src/pages/error*
packages/app/src/components/session/session-new-view.tsx
specs/orchestra-visual/evidence/S07/**
```
**Registros de cobertura:** `UI09` Home projetos/sessões [ui-surface], `UI10` Home legado [ui-surface], `UI11` Nova sessão/draft [ui-surface], `UI12` Sessão vazia [ui-surface], `UI13` Página de erro [ui-surface]
**Provas da frente:** `evidence/S07/`; só crie arquivos das suas tentativas. Não há provas de produto preaprovadas.

<a id="s07-w1"></a>
#### S07-W1 — Implementar e provar home, nova sessão, onboarding e erros
Arquivo: [`issues/S07.md`](issues/S07.md) · localizar o heading `## S07-W1 —`. Os cinco axiomas e seus IDs estão nessa seção.
Tasks: [S07-W1-T1](#s07-w1-t1) · [S07-W1-T2](#s07-w1-t2)

<a id="s07-w1-t1"></a>
#### S07-W1-T1 — Implementar home, nova sessão, onboarding e erros
Arquivo: [`issues/S07.md`](issues/S07.md) · localizar o heading `## S07-W1-T1 —`. Os cinco axiomas e seus IDs estão nessa seção.
```sh
# CWD: $PLAN_ROOT
python3 tools/select_work.py --show S07-W1-T1
```
Provas: `evidence/S07/W1-T1/attempt-NN/`. Template/selagem/validação: [passo a passo](START-HERE.md). Readiness e locks devem ser verificados antes de iniciar; mostrar a task não a libera.

<a id="s07-w1-t2"></a>
#### S07-W1-T2 — Testar, medir e revisar home, nova sessão, onboarding e erros
Arquivo: [`issues/S07.md`](issues/S07.md) · localizar o heading `## S07-W1-T2 —`. Os cinco axiomas e seus IDs estão nessa seção.
```sh
# CWD: $PLAN_ROOT
python3 tools/select_work.py --show S07-W1-T2
```
Provas: `evidence/S07/W1-T2/attempt-NN/`. Template/selagem/validação: [passo a passo](START-HERE.md). Readiness e locks devem ser verificados antes de iniciar; mostrar a task não a libera.

[Voltar ao início](START-HERE.md) · [Mapa de tickets](#mapa-dos-39-tickets-subordinados)

<a id="s08"></a>
### S08 — Chrome desktop, startup, updater e plataformas

**Ticket:** [S08 / #151](https://github.com/gmhelmold/HuGR-Orchestra/issues/151) · **Contrato completo:** [`issues/S08.md`](issues/S08.md)
**Caminho:** #215 → [E2 / #131](https://github.com/gmhelmold/HuGR-Orchestra/issues/131) → [I03 / #136](https://github.com/gmhelmold/HuGR-Orchestra/issues/136) → [S08 / #151](https://github.com/gmhelmold/HuGR-Orchestra/issues/151)
**Dependências de entrada declaradas:** [S03-W1-T1](#s03-w1-t1), [S04-W1-T1](#s04-w1-t1), [S05-W1-T1](#s05-w1-t1), [S22-W1-T1](#s22-w1-t1), [S25-W0-T2](#s25-w0-t2). Leia também as dependências herdadas/finas da task.
**Entrega esperada:** Chrome e estados de inicialização com acabamento consistente.
**Contratos usados pelas tasks (leitura seletiva por categoria):** [`CONTRACTS.md`](CONTRACTS.md) · [`SPEC.md`](SPEC.md) · [`PERFORMANCE.md`](PERFORMANCE.md) · [`BUDGETS.json`](BUDGETS.json) · [`COVERAGE.json`](COVERAGE.json) · [`fixture.json`](fixture.json) · [`RECEIPTS-v4.md`](RECEIPTS-v4.md) · [`BRAND-INTEGRATION.md`](BRAND-INTEGRATION.md) · [`BRAND-ASSETS.json`](BRAND-ASSETS.json)

**Entradas mapeadas de código / fontes (não são todas permissões de edição):**
- [`packages/desktop/src/main/index.ts`](../../packages/desktop/src/main/index.ts) — presente no snapshot; raiz `$REPO`
- [`packages/desktop/src/preload/types.ts`](../../packages/desktop/src/preload/types.ts) — presente no snapshot; raiz `$REPO`
- [`packages/app/src/desktop-menu.ts`](../../packages/app/src/desktop-menu.ts) — presente no snapshot; raiz `$REPO`
- [`packages/app/src/updater.ts`](../../packages/app/src/updater.ts) — presente no snapshot; raiz `$REPO`
- [`packages/app/src/components/windows-app-menu.tsx`](../../packages/app/src/components/windows-app-menu.tsx) — presente no snapshot; raiz `$REPO`
- [`packages/app/src/components/dialog-release-notes.tsx`](../../packages/app/src/components/dialog-release-notes.tsx) — presente no snapshot; raiz `$REPO`

**Escrita autorizada no nível da subissue — a task pode ser mais restrita:**
```text
packages/desktop/src/renderer/**
packages/desktop/src/main/window*
packages/desktop/src/main/menu*
packages/desktop/src/main/theme*
packages/app/src/components/windows-app-menu.tsx
packages/app/src/components/updater-action*
packages/app/src/components/dialog-release-notes.tsx
specs/orchestra-visual/evidence/S08/**
```
**Registros de cobertura:** `UI17` Menu Windows [ui-surface], `UI18` Updater e release notes [ui-surface]
**Provas da frente:** `evidence/S08/`; só crie arquivos das suas tentativas. Não há provas de produto preaprovadas.

<a id="s08-w1"></a>
#### S08-W1 — Implementar e provar chrome desktop, startup, updater e plataformas
Arquivo: [`issues/S08.md`](issues/S08.md) · localizar o heading `## S08-W1 —`. Os cinco axiomas e seus IDs estão nessa seção.
Tasks: [S08-W1-T1](#s08-w1-t1) · [S08-W1-T2](#s08-w1-t2)

<a id="s08-w1-t1"></a>
#### S08-W1-T1 — Implementar chrome desktop, startup, updater e plataformas
Arquivo: [`issues/S08.md`](issues/S08.md) · localizar o heading `## S08-W1-T1 —`. Os cinco axiomas e seus IDs estão nessa seção.
```sh
# CWD: $PLAN_ROOT
python3 tools/select_work.py --show S08-W1-T1
```
Provas: `evidence/S08/W1-T1/attempt-NN/`. Template/selagem/validação: [passo a passo](START-HERE.md). Readiness e locks devem ser verificados antes de iniciar; mostrar a task não a libera.

<a id="s08-w1-t2"></a>
#### S08-W1-T2 — Testar, medir e revisar chrome desktop, startup, updater e plataformas
Arquivo: [`issues/S08.md`](issues/S08.md) · localizar o heading `## S08-W1-T2 —`. Os cinco axiomas e seus IDs estão nessa seção.
```sh
# CWD: $PLAN_ROOT
python3 tools/select_work.py --show S08-W1-T2
```
Provas: `evidence/S08/W1-T2/attempt-NN/`. Template/selagem/validação: [passo a passo](START-HERE.md). Readiness e locks devem ser verificados antes de iniciar; mostrar a task não a libera.

[Voltar ao início](START-HERE.md) · [Mapa de tickets](#mapa-dos-39-tickets-subordinados)

<a id="s09"></a>
### S09 — Timeline, mensagens e ferramentas sem rerender global

**Ticket:** [S09 / #152](https://github.com/gmhelmold/HuGR-Orchestra/issues/152) · **Contrato completo:** [`issues/S09.md`](issues/S09.md)
**Caminho:** #215 → [E2 / #131](https://github.com/gmhelmold/HuGR-Orchestra/issues/131) → [I04 / #137](https://github.com/gmhelmold/HuGR-Orchestra/issues/137) → [S09 / #152](https://github.com/gmhelmold/HuGR-Orchestra/issues/152)
**Dependências de entrada declaradas:** [S03-W1-T1](#s03-w1-t1), [S04-W1-T1](#s04-w1-t1), [S22-W1-T1](#s22-w1-t1). Leia também as dependências herdadas/finas da task.
**Entrega esperada:** Transcript operacional fiel, selecionável e leve.
**Contratos usados pelas tasks (leitura seletiva por categoria):** [`CONTRACTS.md`](CONTRACTS.md) · [`SPEC.md`](SPEC.md) · [`PERFORMANCE.md`](PERFORMANCE.md) · [`BUDGETS.json`](BUDGETS.json) · [`COVERAGE.json`](COVERAGE.json) · [`fixture.json`](fixture.json) · [`RECEIPTS-v4.md`](RECEIPTS-v4.md) · [`BRAND-INTEGRATION.md`](BRAND-INTEGRATION.md) · [`BRAND-ASSETS.json`](BRAND-ASSETS.json) · [`WIDGETS.md`](WIDGETS.md)

**Entradas mapeadas de código / fontes (não são todas permissões de edição):**
- [`packages/app/src/pages/session.tsx`](../../packages/app/src/pages/session.tsx) — presente no snapshot; raiz `$REPO`
- [`packages/session-ui/src/components/session-turn.tsx`](../../packages/session-ui/src/components/session-turn.tsx) — presente no snapshot; raiz `$REPO`
- [`packages/schema/src/session-todo.ts`](../../packages/schema/src/session-todo.ts) — presente no snapshot; raiz `$REPO`
- [`packages/opencode/src/tool/todo.ts`](../../packages/opencode/src/tool/todo.ts) — presente no snapshot; raiz `$REPO`
- [`packages/opencode/src/session/todo.ts`](../../packages/opencode/src/session/todo.ts) — presente no snapshot; raiz `$REPO`
- [`packages/app/src/context/directory-sync.ts`](../../packages/app/src/context/directory-sync.ts) — presente no snapshot; raiz `$REPO`
- [`packages/session-ui/src/components/message-part.tsx`](../../packages/session-ui/src/components/message-part.tsx) — presente no snapshot; raiz `$REPO`
- [`packages/app/src/pages/session/timeline/message-timeline.tsx`](../../packages/app/src/pages/session/timeline/message-timeline.tsx) — presente no snapshot; raiz `$REPO`
- [`packages/session-ui/package.json`](../../packages/session-ui/package.json) — presente no snapshot; raiz `$REPO`
- [`packages/opencode/src/plugin/hugr-composer/tools.ts`](../../packages/opencode/src/plugin/hugr-composer/tools.ts) — presente no snapshot; raiz `$REPO`
- [`packages/opencode/src/tool/read.ts`](../../packages/opencode/src/tool/read.ts) — presente no snapshot; raiz `$REPO`
- `packages/app/src/pages/session/timeline/orchestra-checklist.tsx` — entrada mapeada; **existência/consumer a conferir em S01**

**Escrita autorizada no nível da subissue — a task pode ser mais restrita:**
```text
packages/app/src/pages/session/timeline/**
packages/session-ui/src/components/message*
packages/session-ui/src/components/tool*
packages/session-ui/src/styles/message*
packages/session-ui/src/styles/tool*
packages/session-ui/src/v2/components/message*
packages/session-ui/src/v2/styles/message*
packages/session-ui/src/components/markdown*
packages/session-ui/src/components/session-turn*
packages/session-ui/src/styles/markdown*
packages/session-ui/src/styles/session-turn*
packages/session-ui/src/v2/components/session-turn*
specs/orchestra-visual/evidence/S09/**
```
**Exclusões:**
```text
packages/session-ui/src/components/message-file*
```
**Registros de cobertura:** `UI19` Timeline virtualizada [ui-surface], `UI20` Message/tool render [read-anchor], `UI21` HuGR Composer resultados [read-anchor], `UI22` Read tool resultados [read-anchor], `UI66` Shared session styles [read-anchor], `UI77` Compact todowrite checklist consumer [ui-surface]
**Provas da frente:** `evidence/S09/`; só crie arquivos das suas tentativas. Não há provas de produto preaprovadas.

<a id="s09-w1"></a>
#### S09-W1 — Implementar e provar timeline, mensagens e ferramentas sem rerender global
Arquivo: [`issues/S09.md`](issues/S09.md) · localizar o heading `## S09-W1 —`. Os cinco axiomas e seus IDs estão nessa seção.
Tasks: [S09-W1-T1](#s09-w1-t1) · [S09-W1-T2](#s09-w1-t2)

<a id="s09-w1-t1"></a>
#### S09-W1-T1 — Implementar timeline, mensagens e ferramentas sem rerender global
Arquivo: [`issues/S09.md`](issues/S09.md) · localizar o heading `## S09-W1-T1 —`. Os cinco axiomas e seus IDs estão nessa seção.
```sh
# CWD: $PLAN_ROOT
python3 tools/select_work.py --show S09-W1-T1
```
Provas: `evidence/S09/W1-T1/attempt-NN/`. Template/selagem/validação: [passo a passo](START-HERE.md). Readiness e locks devem ser verificados antes de iniciar; mostrar a task não a libera.

<a id="s09-w1-t2"></a>
#### S09-W1-T2 — Testar, medir e revisar timeline, mensagens e ferramentas sem rerender global
Arquivo: [`issues/S09.md`](issues/S09.md) · localizar o heading `## S09-W1-T2 —`. Os cinco axiomas e seus IDs estão nessa seção.
```sh
# CWD: $PLAN_ROOT
python3 tools/select_work.py --show S09-W1-T2
```
Provas: `evidence/S09/W1-T2/attempt-NN/`. Template/selagem/validação: [passo a passo](START-HERE.md). Readiness e locks devem ser verificados antes de iniciar; mostrar a task não a libera.

[Voltar ao início](START-HERE.md) · [Mapa de tickets](#mapa-dos-39-tickets-subordinados)

<a id="s10"></a>
### S10 — Composer, anexos e seleção de execução

**Ticket:** [S10 / #153](https://github.com/gmhelmold/HuGR-Orchestra/issues/153) · **Contrato completo:** [`issues/S10.md`](issues/S10.md)
**Caminho:** #215 → [E2 / #131](https://github.com/gmhelmold/HuGR-Orchestra/issues/131) → [I04 / #137](https://github.com/gmhelmold/HuGR-Orchestra/issues/137) → [S10 / #153](https://github.com/gmhelmold/HuGR-Orchestra/issues/153)
**Dependências de entrada declaradas:** [S03-W1-T1](#s03-w1-t1), [S04-W1-T1](#s04-w1-t1), [S22-W1-T1](#s22-w1-t1). Leia também as dependências herdadas/finas da task.
**Entrega esperada:** Composer real polido com todas as funções existentes.
**Contratos usados pelas tasks (leitura seletiva por categoria):** [`CONTRACTS.md`](CONTRACTS.md) · [`SPEC.md`](SPEC.md) · [`PERFORMANCE.md`](PERFORMANCE.md) · [`BUDGETS.json`](BUDGETS.json) · [`COVERAGE.json`](COVERAGE.json) · [`fixture.json`](fixture.json) · [`RECEIPTS-v4.md`](RECEIPTS-v4.md) · [`BRAND-INTEGRATION.md`](BRAND-INTEGRATION.md) · [`BRAND-ASSETS.json`](BRAND-ASSETS.json) · [`WIDGETS.md`](WIDGETS.md)

**Entradas mapeadas de código / fontes (não são todas permissões de edição):**
- [`packages/app/src/context/prompt.tsx`](../../packages/app/src/context/prompt.tsx) — presente no snapshot; raiz `$REPO`
- [`packages/app/src/pages/session.tsx`](../../packages/app/src/pages/session.tsx) — presente no snapshot; raiz `$REPO`
- [`packages/app/src/components/prompt-input/submit.ts`](../../packages/app/src/components/prompt-input/submit.ts) — presente no snapshot; raiz `$REPO`
- [`packages/app/src/components/prompt-input/contracts.ts`](../../packages/app/src/components/prompt-input/contracts.ts) — presente no snapshot; raiz `$REPO`
- [`packages/app/src/pages/session/session-ownership.ts`](../../packages/app/src/pages/session/session-ownership.ts) — presente no snapshot; raiz `$REPO`
- [`packages/app/src/components/prompt-input.tsx`](../../packages/app/src/components/prompt-input.tsx) — presente no snapshot; raiz `$REPO`
- [`packages/app/src/components/prompt-input-v2.tsx`](../../packages/app/src/components/prompt-input-v2.tsx) — presente no snapshot; raiz `$REPO`
- [`packages/app/src/components/dialog-subagent-models.tsx`](../../packages/app/src/components/dialog-subagent-models.tsx) — presente no snapshot; raiz `$REPO`
- [`packages/app/src/components/prompt-input/attachments.ts`](../../packages/app/src/components/prompt-input/attachments.ts) — presente no snapshot; raiz `$REPO`

**Escrita autorizada no nível da subissue — a task pode ser mais restrita:**
```text
packages/app/src/components/prompt-input*
packages/app/src/pages/session/composer/**
packages/app/src/pages/session/use-composer-commands.tsx
packages/session-ui/src/v2/components/prompt-input/**
packages/app/src/components/dialog-subagent-models.tsx
packages/app/src/components/draft-subagent-models*
packages/app/src/components/subagent-model-rules*
specs/orchestra-visual/evidence/S10/**
```
**Registros de cobertura:** `UI23` Composer V1 [ui-surface], `UI24` Composer V2 [ui-surface], `UI25` Subagent allowlist [ui-surface], `UI26` Anexos/slash/mentions [read-anchor]
**Provas da frente:** `evidence/S10/`; só crie arquivos das suas tentativas. Não há provas de produto preaprovadas.

<a id="s10-w1"></a>
#### S10-W1 — Implementar e provar composer, anexos e seleção de execução
Arquivo: [`issues/S10.md`](issues/S10.md) · localizar o heading `## S10-W1 —`. Os cinco axiomas e seus IDs estão nessa seção.
Tasks: [S10-W1-T1](#s10-w1-t1) · [S10-W1-T2](#s10-w1-t2)

<a id="s10-w1-t1"></a>
#### S10-W1-T1 — Implementar composer, anexos e seleção de execução
Arquivo: [`issues/S10.md`](issues/S10.md) · localizar o heading `## S10-W1-T1 —`. Os cinco axiomas e seus IDs estão nessa seção.
```sh
# CWD: $PLAN_ROOT
python3 tools/select_work.py --show S10-W1-T1
```
Provas: `evidence/S10/W1-T1/attempt-NN/`. Template/selagem/validação: [passo a passo](START-HERE.md). Readiness e locks devem ser verificados antes de iniciar; mostrar a task não a libera.

<a id="s10-w1-t2"></a>
#### S10-W1-T2 — Testar, medir e revisar composer, anexos e seleção de execução
Arquivo: [`issues/S10.md`](issues/S10.md) · localizar o heading `## S10-W1-T2 —`. Os cinco axiomas e seus IDs estão nessa seção.
```sh
# CWD: $PLAN_ROOT
python3 tools/select_work.py --show S10-W1-T2
```
Provas: `evidence/S10/W1-T2/attempt-NN/`. Template/selagem/validação: [passo a passo](START-HERE.md). Readiness e locks devem ser verificados antes de iniciar; mostrar a task não a libera.

[Voltar ao início](START-HERE.md) · [Mapa de tickets](#mapa-dos-39-tickets-subordinados)

<a id="s11"></a>
### S11 — Arquivos, diff, terminal e evidência verificável

**Ticket:** [S11 / #154](https://github.com/gmhelmold/HuGR-Orchestra/issues/154) · **Contrato completo:** [`issues/S11.md`](issues/S11.md)
**Caminho:** #215 → [E2 / #131](https://github.com/gmhelmold/HuGR-Orchestra/issues/131) → [I04 / #137](https://github.com/gmhelmold/HuGR-Orchestra/issues/137) → [S11 / #154](https://github.com/gmhelmold/HuGR-Orchestra/issues/154)
**Dependências de entrada declaradas:** [S03-W1-T1](#s03-w1-t1), [S04-W1-T1](#s04-w1-t1), [S22-W1-T1](#s22-w1-t1). Leia também as dependências herdadas/finas da task.
**Entrega esperada:** Inspeção real e evidência acionável integradas à conversa.
**Contratos usados pelas tasks (leitura seletiva por categoria):** [`CONTRACTS.md`](CONTRACTS.md) · [`SPEC.md`](SPEC.md) · [`PERFORMANCE.md`](PERFORMANCE.md) · [`BUDGETS.json`](BUDGETS.json) · [`COVERAGE.json`](COVERAGE.json) · [`fixture.json`](fixture.json) · [`RECEIPTS-v4.md`](RECEIPTS-v4.md) · [`BRAND-INTEGRATION.md`](BRAND-INTEGRATION.md) · [`BRAND-ASSETS.json`](BRAND-ASSETS.json) · [`WIDGETS.md`](WIDGETS.md)

**Entradas mapeadas de código / fontes (não são todas permissões de edição):**
- [`packages/app/src/context/file.tsx`](../../packages/app/src/context/file.tsx) — presente no snapshot; raiz `$REPO`
- [`packages/app/src/context/terminal.tsx`](../../packages/app/src/context/terminal.tsx) — presente no snapshot; raiz `$REPO`
- [`packages/app/src/components/session/open-in-app-v2.tsx`](../../packages/app/src/components/session/open-in-app-v2.tsx) — presente no snapshot; raiz `$REPO`
- [`packages/opencode/src/tool/shell.ts`](../../packages/opencode/src/tool/shell.ts) — presente no snapshot; raiz `$REPO`
- [`packages/app/src/pages/session/v2/review-panel-v2.tsx`](../../packages/app/src/pages/session/v2/review-panel-v2.tsx) — presente no snapshot; raiz `$REPO`
- [`packages/app/src/components/prompt-input/submit.ts`](../../packages/app/src/components/prompt-input/submit.ts) — presente no snapshot; raiz `$REPO`
- [`packages/app/src/components/file-tree-v2.tsx`](../../packages/app/src/components/file-tree-v2.tsx) — presente no snapshot; raiz `$REPO`
- [`packages/app/src/pages/session/review-tab.tsx`](../../packages/app/src/pages/session/review-tab.tsx) — presente no snapshot; raiz `$REPO`
- [`packages/app/src/components/terminal.tsx`](../../packages/app/src/components/terminal.tsx) — presente no snapshot; raiz `$REPO`
- `packages/app/src/pages/session/orchestra-evidence.tsx` — entrada mapeada; **existência/consumer a conferir em S01**
- `packages/app/src/pages/session/orchestra-evidence-files.tsx` — entrada mapeada; **existência/consumer a conferir em S01**
- `packages/app/src/pages/session/orchestra-evidence-docs.tsx` — entrada mapeada; **existência/consumer a conferir em S01**
- [`packages/app/src/pages/session/terminal-panel.tsx`](../../packages/app/src/pages/session/terminal-panel.tsx) — presente no snapshot; raiz `$REPO`
- `packages/app/src/pages/session/orchestra-evidence-actions.tsx` — entrada mapeada; **existência/consumer a conferir em S01**

**Escrita autorizada no nível da subissue — a task pode ser mais restrita:**
```text
packages/app/src/pages/session/review-tab.tsx
packages/app/src/pages/session/v2/review*
packages/app/src/pages/session/file-tabs*
packages/app/src/pages/session/terminal-panel*
packages/app/src/components/file-tree*
packages/app/src/components/terminal.tsx
packages/session-ui/src/pierre/**
packages/session-ui/src/components/session-review*
packages/session-ui/src/components/session-diff*
packages/session-ui/src/components/file*
packages/session-ui/src/v2/components/session-review*
packages/app/src/pages/session/orchestra-evidence*
packages/session-ui/src/components/message-file*
packages/app/src/pages/session/v2/session-file-browser*
packages/app/src/components/session/open-in-app*
specs/orchestra-visual/evidence/S11/**
```
**Registros de cobertura:** `UI27` Lista de arquivos/tree [ui-surface], `UI28` Review diff [ui-surface], `UI29` Review V2/no-git/empty [ui-surface], `UI30` Terminal e PTY [ui-surface], `UI31` Evidência de testes [ui-surface], `UI79` Dock Files local pane [ui-surface], `UI80` Dock Docs local pane [ui-surface], `UI81` Dock Terminal existing-PTY pane [ui-surface], `UI82` Completion action strip and confirmation [ui-surface]
**Provas da frente:** `evidence/S11/`; só crie arquivos das suas tentativas. Não há provas de produto preaprovadas.

<a id="s11-w1"></a>
#### S11-W1 — Implementar e provar arquivos, diff, terminal e evidência verificável
Arquivo: [`issues/S11.md`](issues/S11.md) · localizar o heading `## S11-W1 —`. Os cinco axiomas e seus IDs estão nessa seção.
Tasks: [S11-W1-T1](#s11-w1-t1) · [S11-W1-T2](#s11-w1-t2)

<a id="s11-w1-t1"></a>
#### S11-W1-T1 — Implementar arquivos, diff, terminal e evidência verificável
Arquivo: [`issues/S11.md`](issues/S11.md) · localizar o heading `## S11-W1-T1 —`. Os cinco axiomas e seus IDs estão nessa seção.
```sh
# CWD: $PLAN_ROOT
python3 tools/select_work.py --show S11-W1-T1
```
Provas: `evidence/S11/W1-T1/attempt-NN/`. Template/selagem/validação: [passo a passo](START-HERE.md). Readiness e locks devem ser verificados antes de iniciar; mostrar a task não a libera.

<a id="s11-w1-t2"></a>
#### S11-W1-T2 — Testar, medir e revisar arquivos, diff, terminal e evidência verificável
Arquivo: [`issues/S11.md`](issues/S11.md) · localizar o heading `## S11-W1-T2 —`. Os cinco axiomas e seus IDs estão nessa seção.
```sh
# CWD: $PLAN_ROOT
python3 tools/select_work.py --show S11-W1-T2
```
Provas: `evidence/S11/W1-T2/attempt-NN/`. Template/selagem/validação: [passo a passo](START-HERE.md). Readiness e locks devem ser verificados antes de iniciar; mostrar a task não a libera.

[Voltar ao início](START-HERE.md) · [Mapa de tickets](#mapa-dos-39-tickets-subordinados)

<a id="s12"></a>
### S12 — Configurações gerais, teclas e conexões

**Ticket:** [S12 / #155](https://github.com/gmhelmold/HuGR-Orchestra/issues/155) · **Contrato completo:** [`issues/S12.md`](issues/S12.md)
**Caminho:** #215 → [E2 / #131](https://github.com/gmhelmold/HuGR-Orchestra/issues/131) → [I05 / #138](https://github.com/gmhelmold/HuGR-Orchestra/issues/138) → [S12 / #155](https://github.com/gmhelmold/HuGR-Orchestra/issues/155)
**Dependências de entrada declaradas:** [S03-W1-T1](#s03-w1-t1), [S04-W1-T1](#s04-w1-t1), [S22-W1-T1](#s22-w1-t1), [S25-W0-T2](#s25-w0-t2). Leia também as dependências herdadas/finas da task.
**Entrega esperada:** Settings completos no novo padrão, não só aba principal.
**Contratos usados pelas tasks (leitura seletiva por categoria):** [`CONTRACTS.md`](CONTRACTS.md) · [`SPEC.md`](SPEC.md) · [`PERFORMANCE.md`](PERFORMANCE.md) · [`BUDGETS.json`](BUDGETS.json) · [`COVERAGE.json`](COVERAGE.json) · [`fixture.json`](fixture.json) · [`RECEIPTS-v4.md`](RECEIPTS-v4.md) · [`BRAND-INTEGRATION.md`](BRAND-INTEGRATION.md) · [`BRAND-ASSETS.json`](BRAND-ASSETS.json)

**Entradas mapeadas de código / fontes (não são todas permissões de edição):**
- [`packages/app/src/context/settings.tsx`](../../packages/app/src/context/settings.tsx) — presente no snapshot; raiz `$REPO`
- [`packages/app/src/components/settings-v2/general-controllers.ts`](../../packages/app/src/components/settings-v2/general-controllers.ts) — presente no snapshot; raiz `$REPO`
- [`packages/app/src/components/settings-v2/dialog-settings-v2.tsx`](../../packages/app/src/components/settings-v2/dialog-settings-v2.tsx) — presente no snapshot; raiz `$REPO`
- [`packages/app/src/components/settings-v2/general.tsx`](../../packages/app/src/components/settings-v2/general.tsx) — presente no snapshot; raiz `$REPO`
- [`packages/app/src/components/settings-keybinds.tsx`](../../packages/app/src/components/settings-keybinds.tsx) — presente no snapshot; raiz `$REPO`
- [`packages/app/src/components/settings-v2/servers.tsx`](../../packages/app/src/components/settings-v2/servers.tsx) — presente no snapshot; raiz `$REPO`

**Escrita autorizada no nível da subissue — a task pode ser mais restrita:**
```text
packages/app/src/components/settings-v2/**
packages/app/src/components/settings-*.tsx
packages/app/src/components/settings-dialog.tsx
packages/app/src/components/dialog-settings.tsx
specs/orchestra-visual/evidence/S12/**
```
**Exclusões:**
```text
packages/app/src/components/settings-v2/providers.tsx
packages/app/src/components/settings-v2/models.tsx
packages/app/src/components/settings-providers.tsx
packages/app/src/components/settings-models.tsx
```
**Registros de cobertura:** `UI32` Settings shell [ui-surface], `UI33` Settings general [ui-surface], `UI34` Settings keybinds [ui-surface], `UI35` Settings servers [ui-surface]
**Provas da frente:** `evidence/S12/`; só crie arquivos das suas tentativas. Não há provas de produto preaprovadas.

<a id="s12-w1"></a>
#### S12-W1 — Implementar e provar configurações gerais, teclas e conexões
Arquivo: [`issues/S12.md`](issues/S12.md) · localizar o heading `## S12-W1 —`. Os cinco axiomas e seus IDs estão nessa seção.
Tasks: [S12-W1-T1](#s12-w1-t1) · [S12-W1-T2](#s12-w1-t2)

<a id="s12-w1-t1"></a>
#### S12-W1-T1 — Implementar configurações gerais, teclas e conexões
Arquivo: [`issues/S12.md`](issues/S12.md) · localizar o heading `## S12-W1-T1 —`. Os cinco axiomas e seus IDs estão nessa seção.
```sh
# CWD: $PLAN_ROOT
python3 tools/select_work.py --show S12-W1-T1
```
Provas: `evidence/S12/W1-T1/attempt-NN/`. Template/selagem/validação: [passo a passo](START-HERE.md). Readiness e locks devem ser verificados antes de iniciar; mostrar a task não a libera.

<a id="s12-w1-t2"></a>
#### S12-W1-T2 — Testar, medir e revisar configurações gerais, teclas e conexões
Arquivo: [`issues/S12.md`](issues/S12.md) · localizar o heading `## S12-W1-T2 —`. Os cinco axiomas e seus IDs estão nessa seção.
```sh
# CWD: $PLAN_ROOT
python3 tools/select_work.py --show S12-W1-T2
```
Provas: `evidence/S12/W1-T2/attempt-NN/`. Template/selagem/validação: [passo a passo](START-HERE.md). Readiness e locks devem ser verificados antes de iniciar; mostrar a task não a libera.

[Voltar ao início](START-HERE.md) · [Mapa de tickets](#mapa-dos-39-tickets-subordinados)

<a id="s13"></a>
### S13 — Providers, credenciais, modelos e MCP

**Ticket:** [S13 / #156](https://github.com/gmhelmold/HuGR-Orchestra/issues/156) · **Contrato completo:** [`issues/S13.md`](issues/S13.md)
**Caminho:** #215 → [E2 / #131](https://github.com/gmhelmold/HuGR-Orchestra/issues/131) → [I05 / #138](https://github.com/gmhelmold/HuGR-Orchestra/issues/138) → [S13 / #156](https://github.com/gmhelmold/HuGR-Orchestra/issues/156)
**Dependências de entrada declaradas:** [S03-W1-T1](#s03-w1-t1), [S04-W1-T1](#s04-w1-t1), [S22-W1-T1](#s22-w1-t1), [S25-W0-T2](#s25-w0-t2). Leia também as dependências herdadas/finas da task.
**Entrega esperada:** Seletores e credenciais com identidade segura e acabamento único.
**Contratos usados pelas tasks (leitura seletiva por categoria):** [`CONTRACTS.md`](CONTRACTS.md) · [`SPEC.md`](SPEC.md) · [`PERFORMANCE.md`](PERFORMANCE.md) · [`BUDGETS.json`](BUDGETS.json) · [`COVERAGE.json`](COVERAGE.json) · [`fixture.json`](fixture.json) · [`RECEIPTS-v4.md`](RECEIPTS-v4.md) · [`BRAND-INTEGRATION.md`](BRAND-INTEGRATION.md) · [`BRAND-ASSETS.json`](BRAND-ASSETS.json)

**Entradas mapeadas de código / fontes (não são todas permissões de edição):**
- [`packages/core/src/catalog.ts`](../../packages/core/src/catalog.ts) — presente no snapshot; raiz `$REPO`
- [`packages/core/src/credential.ts`](../../packages/core/src/credential.ts) — presente no snapshot; raiz `$REPO`
- [`packages/opencode/src/provider/provider.ts`](../../packages/opencode/src/provider/provider.ts) — presente no snapshot; raiz `$REPO`
- [`packages/app/src/context/models.tsx`](../../packages/app/src/context/models.tsx) — presente no snapshot; raiz `$REPO`
- [`packages/app/src/components/settings-v2/providers.tsx`](../../packages/app/src/components/settings-v2/providers.tsx) — presente no snapshot; raiz `$REPO`
- [`packages/app/src/components/dialog-connect-provider.tsx`](../../packages/app/src/components/dialog-connect-provider.tsx) — presente no snapshot; raiz `$REPO`
- [`packages/app/src/components/dialog-custom-provider.tsx`](../../packages/app/src/components/dialog-custom-provider.tsx) — presente no snapshot; raiz `$REPO`
- [`packages/app/src/components/dialog-select-model.tsx`](../../packages/app/src/components/dialog-select-model.tsx) — presente no snapshot; raiz `$REPO`
- [`packages/app/src/components/dialog-select-mcp.tsx`](../../packages/app/src/components/dialog-select-mcp.tsx) — presente no snapshot; raiz `$REPO`

**Escrita autorizada no nível da subissue — a task pode ser mais restrita:**
```text
packages/app/src/components/settings-v2/providers.tsx
packages/app/src/components/settings-v2/models.tsx
packages/app/src/components/settings-providers.tsx
packages/app/src/components/settings-models.tsx
packages/app/src/components/dialog-connect-provider*
packages/app/src/components/dialog-custom-provider*
packages/app/src/components/dialog-manage-models.tsx
packages/app/src/components/dialog-select-model*
packages/app/src/components/dialog-select-mcp.tsx
packages/app/src/components/model-tooltip.tsx
specs/orchestra-visual/evidence/S13/**
```
**Registros de cobertura:** `UI36` Settings providers [ui-surface], `UI37` Connect/OAuth/key [ui-surface], `UI38` Custom provider [ui-surface], `UI39` Models/manage/unpaid [ui-surface], `UI40` MCP selector [ui-surface]
**Provas da frente:** `evidence/S13/`; só crie arquivos das suas tentativas. Não há provas de produto preaprovadas.

<a id="s13-w1"></a>
#### S13-W1 — Implementar e provar providers, credenciais, modelos e mcp
Arquivo: [`issues/S13.md`](issues/S13.md) · localizar o heading `## S13-W1 —`. Os cinco axiomas e seus IDs estão nessa seção.
Tasks: [S13-W1-T1](#s13-w1-t1) · [S13-W1-T2](#s13-w1-t2)

<a id="s13-w1-t1"></a>
#### S13-W1-T1 — Implementar providers, credenciais, modelos e mcp
Arquivo: [`issues/S13.md`](issues/S13.md) · localizar o heading `## S13-W1-T1 —`. Os cinco axiomas e seus IDs estão nessa seção.
```sh
# CWD: $PLAN_ROOT
python3 tools/select_work.py --show S13-W1-T1
```
Provas: `evidence/S13/W1-T1/attempt-NN/`. Template/selagem/validação: [passo a passo](START-HERE.md). Readiness e locks devem ser verificados antes de iniciar; mostrar a task não a libera.

<a id="s13-w1-t2"></a>
#### S13-W1-T2 — Testar, medir e revisar providers, credenciais, modelos e mcp
Arquivo: [`issues/S13.md`](issues/S13.md) · localizar o heading `## S13-W1-T2 —`. Os cinco axiomas e seus IDs estão nessa seção.
```sh
# CWD: $PLAN_ROOT
python3 tools/select_work.py --show S13-W1-T2
```
Provas: `evidence/S13/W1-T2/attempt-NN/`. Template/selagem/validação: [passo a passo](START-HERE.md). Readiness e locks devem ser verificados antes de iniciar; mostrar a task não a libera.

[Voltar ao início](START-HERE.md) · [Mapa de tickets](#mapa-dos-39-tickets-subordinados)

<a id="s14"></a>
### S14 — Command palette, busca, pickers e popovers

**Ticket:** [S14 / #157](https://github.com/gmhelmold/HuGR-Orchestra/issues/157) · **Contrato completo:** [`issues/S14.md`](issues/S14.md)
**Caminho:** #215 → [E2 / #131](https://github.com/gmhelmold/HuGR-Orchestra/issues/131) → [I05 / #138](https://github.com/gmhelmold/HuGR-Orchestra/issues/138) → [S14 / #157](https://github.com/gmhelmold/HuGR-Orchestra/issues/157)
**Dependências de entrada declaradas:** [S03-W1-T1](#s03-w1-t1), [S04-W1-T1](#s04-w1-t1), [S22-W1-T1](#s22-w1-t1), [S25-W0-T2](#s25-w0-t2). Leia também as dependências herdadas/finas da task.
**Entrega esperada:** Todas as superfícies transitórias com acabamento Raycast discreto, sem copiar novo layout.
**Contratos usados pelas tasks (leitura seletiva por categoria):** [`CONTRACTS.md`](CONTRACTS.md) · [`SPEC.md`](SPEC.md) · [`PERFORMANCE.md`](PERFORMANCE.md) · [`BUDGETS.json`](BUDGETS.json) · [`COVERAGE.json`](COVERAGE.json) · [`fixture.json`](fixture.json) · [`RECEIPTS-v4.md`](RECEIPTS-v4.md) · [`BRAND-INTEGRATION.md`](BRAND-INTEGRATION.md) · [`BRAND-ASSETS.json`](BRAND-ASSETS.json)

**Entradas mapeadas de código / fontes (não são todas permissões de edição):**
- [`packages/app/src/context/command.tsx`](../../packages/app/src/context/command.tsx) — presente no snapshot; raiz `$REPO`
- [`packages/app/src/components/server/server-row.tsx`](../../packages/app/src/components/server/server-row.tsx) — presente no snapshot; raiz `$REPO`
- [`packages/app/src/components/directory-picker-domain.ts`](../../packages/app/src/components/directory-picker-domain.ts) — presente no snapshot; raiz `$REPO`
- [`packages/app/src/components/dialog-command-palette-v2.tsx`](../../packages/app/src/components/dialog-command-palette-v2.tsx) — presente no snapshot; raiz `$REPO`
- [`packages/app/src/components/dialog-select-directory-v2.tsx`](../../packages/app/src/components/dialog-select-directory-v2.tsx) — presente no snapshot; raiz `$REPO`
- [`packages/app/src/components/dialog-select-file.tsx`](../../packages/app/src/components/dialog-select-file.tsx) — presente no snapshot; raiz `$REPO`
- [`packages/app/src/components/dialog-select-server.tsx`](../../packages/app/src/components/dialog-select-server.tsx) — presente no snapshot; raiz `$REPO`
- [`packages/app/src/components/dialog-edit-project-v2.tsx`](../../packages/app/src/components/dialog-edit-project-v2.tsx) — presente no snapshot; raiz `$REPO`
- [`packages/app/src/components/status-popover.tsx`](../../packages/app/src/components/status-popover.tsx) — presente no snapshot; raiz `$REPO`
- [`packages/app/src/components/dialog-usage-exceeded.tsx`](../../packages/app/src/components/dialog-usage-exceeded.tsx) — presente no snapshot; raiz `$REPO`
- [`packages/app/src/utils/toast.tsx`](../../packages/app/src/utils/toast.tsx) — presente no snapshot; raiz `$REPO`

**Escrita autorizada no nível da subissue — a task pode ser mais restrita:**
```text
packages/app/src/components/dialog-command-palette-v2*
packages/app/src/components/command-palette.ts
packages/app/src/components/dialog-select-directory*
packages/app/src/components/dialog-select-file.tsx
packages/app/src/components/dialog-select-server.tsx
packages/app/src/components/dialog-edit-project*
packages/app/src/components/dialog-fork.tsx
packages/app/src/components/directory-picker.tsx
packages/app/src/components/prompt-project-selector.tsx
packages/app/src/components/prompt-workspace-selector.tsx
packages/app/src/components/status-popover*
packages/app/src/components/dialog-usage-exceeded.tsx
packages/app/src/utils/toast*
specs/orchestra-visual/evidence/S14/**
```
**Registros de cobertura:** `UI41` Command palette [ui-surface], `UI42` Directory picker [ui-surface], `UI43` File picker [ui-surface], `UI44` Server picker [ui-surface], `UI45` Project/workspace dialogs [ui-surface], `UI46` Status popover [ui-surface], `UI47` Quota/usage dialog [ui-surface], `UI48` Toasts [ui-surface]
**Provas da frente:** `evidence/S14/`; só crie arquivos das suas tentativas. Não há provas de produto preaprovadas.

<a id="s14-w1"></a>
#### S14-W1 — Implementar e provar command palette, busca, pickers e popovers
Arquivo: [`issues/S14.md`](issues/S14.md) · localizar o heading `## S14-W1 —`. Os cinco axiomas e seus IDs estão nessa seção.
Tasks: [S14-W1-T1](#s14-w1-t1) · [S14-W1-T2](#s14-w1-t2)

<a id="s14-w1-t1"></a>
#### S14-W1-T1 — Implementar command palette, busca, pickers e popovers
Arquivo: [`issues/S14.md`](issues/S14.md) · localizar o heading `## S14-W1-T1 —`. Os cinco axiomas e seus IDs estão nessa seção.
```sh
# CWD: $PLAN_ROOT
python3 tools/select_work.py --show S14-W1-T1
```
Provas: `evidence/S14/W1-T1/attempt-NN/`. Template/selagem/validação: [passo a passo](START-HERE.md). Readiness e locks devem ser verificados antes de iniciar; mostrar a task não a libera.

<a id="s14-w1-t2"></a>
#### S14-W1-T2 — Testar, medir e revisar command palette, busca, pickers e popovers
Arquivo: [`issues/S14.md`](issues/S14.md) · localizar o heading `## S14-W1-T2 —`. Os cinco axiomas e seus IDs estão nessa seção.
```sh
# CWD: $PLAN_ROOT
python3 tools/select_work.py --show S14-W1-T2
```
Provas: `evidence/S14/W1-T2/attempt-NN/`. Template/selagem/validação: [passo a passo](START-HERE.md). Readiness e locks devem ser verificados antes de iniciar; mostrar a task não a libera.

[Voltar ao início](START-HERE.md) · [Mapa de tickets](#mapa-dos-39-tickets-subordinados)

<a id="s15"></a>
### S15 — Dock visual no rail simultâneo

**Ticket:** [S15 / #158](https://github.com/gmhelmold/HuGR-Orchestra/issues/158) · **Contrato completo:** [`issues/S15.md`](issues/S15.md)
**Caminho:** #215 → [E3 / #132](https://github.com/gmhelmold/HuGR-Orchestra/issues/132) → [I06 / #139](https://github.com/gmhelmold/HuGR-Orchestra/issues/139) → [S15 / #158](https://github.com/gmhelmold/HuGR-Orchestra/issues/158)
**Dependências de entrada declaradas:** [S03-W1-T1](#s03-w1-t1), [S04-W1-T1](#s04-w1-t1), [S06-W1-T1](#s06-w1-t1), [S22-W1-T1](#s22-w1-t1). Leia também as dependências herdadas/finas da task.
**Entrega esperada:** Dock no lugar aprovado com UI real.
**Fronteiras externas registradas:** `[{"ref": "PR#12", "type": "integration-review", "hard": false, "rule": "A base já tem createAppDock; revisar diferenças da PR sem exigir ou efetuar merge integral."}]`. Não presumir prontidão pelo título da issue.
**Contratos usados pelas tasks (leitura seletiva por categoria):** [`CONTRACTS.md`](CONTRACTS.md) · [`SPEC.md`](SPEC.md) · [`PERFORMANCE.md`](PERFORMANCE.md) · [`BUDGETS.json`](BUDGETS.json) · [`COVERAGE.json`](COVERAGE.json) · [`fixture.json`](fixture.json) · [`RECEIPTS-v4.md`](RECEIPTS-v4.md) · [`BRAND-INTEGRATION.md`](BRAND-INTEGRATION.md) · [`BRAND-ASSETS.json`](BRAND-ASSETS.json) · [`WIDGETS.md`](WIDGETS.md)

**Entradas mapeadas de código / fontes (não são todas permissões de edição):**
- [`packages/desktop/src/preload/types.ts`](../../packages/desktop/src/preload/types.ts) — presente no snapshot; raiz `$REPO`
- [`packages/desktop/src/main/app-dock.ts`](../../packages/desktop/src/main/app-dock.ts) — presente no snapshot; raiz `$REPO`
- [`packages/app/src/pages/session/session-side-panel.tsx`](../../packages/app/src/pages/session/session-side-panel.tsx) — presente no snapshot; raiz `$REPO`
- [`packages/app/src/pages/session/apps-panel.css`](../../packages/app/src/pages/session/apps-panel.css) — presente no snapshot; raiz `$REPO`
- [`packages/app/src/pages/session/apps-panel.tsx`](../../packages/app/src/pages/session/apps-panel.tsx) — presente no snapshot; raiz `$REPO`

**Escrita autorizada no nível da subissue — a task pode ser mais restrita:**
```text
packages/app/src/pages/session/apps-panel.tsx
packages/app/src/pages/session/apps-panel.css
packages/app/src/pages/session/orchestra-dock*
specs/orchestra-visual/evidence/S15/**
```
**Registros de cobertura:** `UI49` Dock front shell [ui-surface], `UI50` Dock renderer/component [ui-surface]
**Provas da frente:** `evidence/S15/`; só crie arquivos das suas tentativas. Não há provas de produto preaprovadas.

<a id="s15-w1"></a>
#### S15-W1 — Implementar e provar dock visual no rail simultâneo
Arquivo: [`issues/S15.md`](issues/S15.md) · localizar o heading `## S15-W1 —`. Os cinco axiomas e seus IDs estão nessa seção.
Tasks: [S15-W1-T1](#s15-w1-t1) · [S15-W1-T2](#s15-w1-t2)

<a id="s15-w1-t1"></a>
#### S15-W1-T1 — Implementar dock visual no rail simultâneo
Arquivo: [`issues/S15.md`](issues/S15.md) · localizar o heading `## S15-W1-T1 —`. Os cinco axiomas e seus IDs estão nessa seção.
```sh
# CWD: $PLAN_ROOT
python3 tools/select_work.py --show S15-W1-T1
```
Provas: `evidence/S15/W1-T1/attempt-NN/`. Template/selagem/validação: [passo a passo](START-HERE.md). Readiness e locks devem ser verificados antes de iniciar; mostrar a task não a libera.

<a id="s15-w1-t2"></a>
#### S15-W1-T2 — Testar, medir e revisar dock visual no rail simultâneo
Arquivo: [`issues/S15.md`](issues/S15.md) · localizar o heading `## S15-W1-T2 —`. Os cinco axiomas e seus IDs estão nessa seção.
```sh
# CWD: $PLAN_ROOT
python3 tools/select_work.py --show S15-W1-T2
```
Provas: `evidence/S15/W1-T2/attempt-NN/`. Template/selagem/validação: [passo a passo](START-HERE.md). Readiness e locks devem ser verificados antes de iniciar; mostrar a task não a libera.

[Voltar ao início](START-HERE.md) · [Mapa de tickets](#mapa-dos-39-tickets-subordinados)

<a id="s16"></a>
### S16 — Bounds, overlays e lifecycle nativo do Dock

**Ticket:** [S16 / #159](https://github.com/gmhelmold/HuGR-Orchestra/issues/159) · **Contrato completo:** [`issues/S16.md`](issues/S16.md)
**Caminho:** #215 → [E3 / #132](https://github.com/gmhelmold/HuGR-Orchestra/issues/132) → [I06 / #139](https://github.com/gmhelmold/HuGR-Orchestra/issues/139) → [S16 / #159](https://github.com/gmhelmold/HuGR-Orchestra/issues/159)
**Dependências de entrada declaradas:** [S01](#s01), [S02](#s02). Leia também as dependências herdadas/finas da task.
**Entrega esperada:** Bridge nativa mínima, segura e testada para o novo rail.
**Contratos usados pelas tasks (leitura seletiva por categoria):** [`CONTRACTS.md`](CONTRACTS.md) · [`SPEC.md`](SPEC.md) · [`PERFORMANCE.md`](PERFORMANCE.md) · [`BUDGETS.json`](BUDGETS.json) · [`COVERAGE.json`](COVERAGE.json) · [`fixture.json`](fixture.json) · [`RECEIPTS-v4.md`](RECEIPTS-v4.md) · [`BRAND-INTEGRATION.md`](BRAND-INTEGRATION.md) · [`BRAND-ASSETS.json`](BRAND-ASSETS.json) · [`WIDGETS.md`](WIDGETS.md)

**Entradas mapeadas de código / fontes (não são todas permissões de edição):**
- [`packages/app/src/pages/session/apps-panel.tsx`](../../packages/app/src/pages/session/apps-panel.tsx) — presente no snapshot; raiz `$REPO`
- [`packages/desktop/src/main/index.ts`](../../packages/desktop/src/main/index.ts) — presente no snapshot; raiz `$REPO`
- [`packages/desktop/src/main/server.ts`](../../packages/desktop/src/main/server.ts) — presente no snapshot; raiz `$REPO`
- [`packages/desktop/src/main/app-dock.ts`](../../packages/desktop/src/main/app-dock.ts) — presente no snapshot; raiz `$REPO`
- [`packages/desktop/src/main/app-dock-profile-registry.ts`](../../packages/desktop/src/main/app-dock-profile-registry.ts) — presente no snapshot; raiz `$REPO`
- `packages/desktop/src/main/app-dock-api.ts` — entrada mapeada; **existência/consumer a conferir em S01**

**Escrita autorizada no nível da subissue — a task pode ser mais restrita:**
```text
packages/desktop/src/main/app-dock*
packages/desktop/src/main/ipc.ts
packages/desktop/src/preload/index.ts
packages/desktop/src/preload/types.ts
packages/app/src/context/platform.tsx
specs/orchestra-visual/evidence/S16/**
```
**Registros de cobertura:** `UI51` Dock main native [read-anchor], `UI52` Dock profile registry [read-anchor], `UI53` Dock automation API split [capability-gap]
**Provas da frente:** `evidence/S16/`; só crie arquivos das suas tentativas. Não há provas de produto preaprovadas.

<a id="s16-w1"></a>
#### S16-W1 — Implementar e provar bounds, overlays e lifecycle nativo do dock
Arquivo: [`issues/S16.md`](issues/S16.md) · localizar o heading `## S16-W1 —`. Os cinco axiomas e seus IDs estão nessa seção.
Tasks: [S16-W1-T1](#s16-w1-t1) · [S16-W1-T2](#s16-w1-t2)

<a id="s16-w1-t1"></a>
#### S16-W1-T1 — Implementar bounds, overlays e lifecycle nativo do dock
Arquivo: [`issues/S16.md`](issues/S16.md) · localizar o heading `## S16-W1-T1 —`. Os cinco axiomas e seus IDs estão nessa seção.
```sh
# CWD: $PLAN_ROOT
python3 tools/select_work.py --show S16-W1-T1
```
Provas: `evidence/S16/W1-T1/attempt-NN/`. Template/selagem/validação: [passo a passo](START-HERE.md). Readiness e locks devem ser verificados antes de iniciar; mostrar a task não a libera.

<a id="s16-w1-t2"></a>
#### S16-W1-T2 — Testar, medir e revisar bounds, overlays e lifecycle nativo do dock
Arquivo: [`issues/S16.md`](issues/S16.md) · localizar o heading `## S16-W1-T2 —`. Os cinco axiomas e seus IDs estão nessa seção.
```sh
# CWD: $PLAN_ROOT
python3 tools/select_work.py --show S16-W1-T2
```
Provas: `evidence/S16/W1-T2/attempt-NN/`. Template/selagem/validação: [passo a passo](START-HERE.md). Readiness e locks devem ser verificados antes de iniciar; mostrar a task não a libera.

[Voltar ao início](START-HERE.md) · [Mapa de tickets](#mapa-dos-39-tickets-subordinados)

<a id="s17"></a>
### S17 — Projeção incremental e identidade de Tasks

**Ticket:** [S17 / #160](https://github.com/gmhelmold/HuGR-Orchestra/issues/160) · **Contrato completo:** [`issues/S17.md`](issues/S17.md)
**Caminho:** #215 → [E3 / #132](https://github.com/gmhelmold/HuGR-Orchestra/issues/132) → [I07 / #140](https://github.com/gmhelmold/HuGR-Orchestra/issues/140) → [S17 / #160](https://github.com/gmhelmold/HuGR-Orchestra/issues/160)
**Dependências de entrada declaradas:** [S01](#s01), [S02](#s02). Leia também as dependências herdadas/finas da task.
**Entrega esperada:** Read model leve de Tasks/Atividade usando dados existentes.
**Contratos usados pelas tasks (leitura seletiva por categoria):** [`CONTRACTS.md`](CONTRACTS.md) · [`SPEC.md`](SPEC.md) · [`PERFORMANCE.md`](PERFORMANCE.md) · [`BUDGETS.json`](BUDGETS.json) · [`COVERAGE.json`](COVERAGE.json) · [`fixture.json`](fixture.json) · [`RECEIPTS-v4.md`](RECEIPTS-v4.md) · [`BRAND-INTEGRATION.md`](BRAND-INTEGRATION.md) · [`BRAND-ASSETS.json`](BRAND-ASSETS.json) · [`WIDGETS.md`](WIDGETS.md)

**Entradas mapeadas de código / fontes (não são todas permissões de edição):**
- [`packages/opencode/src/tool/task.ts`](../../packages/opencode/src/tool/task.ts) — presente no snapshot; raiz `$REPO`
- [`packages/app/src/context/sync.tsx`](../../packages/app/src/context/sync.tsx) — presente no snapshot; raiz `$REPO`
- [`packages/app/src/context/server-sync.tsx`](../../packages/app/src/context/server-sync.tsx) — presente no snapshot; raiz `$REPO`
- [`packages/app/src/context/janitor.tsx`](../../packages/app/src/context/janitor.tsx) — presente no snapshot; raiz `$REPO`
- [`packages/app/src/pages/session/apps-panel.tsx`](../../packages/app/src/pages/session/apps-panel.tsx) — presente no snapshot; raiz `$REPO`
- [`packages/app/src/pages/session/tasks-data.ts`](../../packages/app/src/pages/session/tasks-data.ts) — presente no snapshot; raiz `$REPO`

**Escrita autorizada no nível da subissue — a task pode ser mais restrita:**
```text
packages/app/src/pages/session/tasks-data.ts
packages/app/src/pages/session/tasks-data.test.ts
packages/app/src/pages/session/orchestra-activity-data*
specs/orchestra-visual/evidence/S17/**
```
**Registros de cobertura:** `UI54` Tasks data [read-anchor], `UI56` Typed activity read model source [read-anchor]
**Provas da frente:** `evidence/S17/`; só crie arquivos das suas tentativas. Não há provas de produto preaprovadas.

<a id="s17-w1"></a>
#### S17-W1 — Implementar e provar projeção incremental e identidade de tasks
Arquivo: [`issues/S17.md`](issues/S17.md) · localizar o heading `## S17-W1 —`. Os cinco axiomas e seus IDs estão nessa seção.
Tasks: [S17-W1-T1](#s17-w1-t1) · [S17-W1-T2](#s17-w1-t2)

<a id="s17-w1-t1"></a>
#### S17-W1-T1 — Implementar projeção incremental e identidade de tasks
Arquivo: [`issues/S17.md`](issues/S17.md) · localizar o heading `## S17-W1-T1 —`. Os cinco axiomas e seus IDs estão nessa seção.
```sh
# CWD: $PLAN_ROOT
python3 tools/select_work.py --show S17-W1-T1
```
Provas: `evidence/S17/W1-T1/attempt-NN/`. Template/selagem/validação: [passo a passo](START-HERE.md). Readiness e locks devem ser verificados antes de iniciar; mostrar a task não a libera.

<a id="s17-w1-t2"></a>
#### S17-W1-T2 — Testar, medir e revisar projeção incremental e identidade de tasks
Arquivo: [`issues/S17.md`](issues/S17.md) · localizar o heading `## S17-W1-T2 —`. Os cinco axiomas e seus IDs estão nessa seção.
```sh
# CWD: $PLAN_ROOT
python3 tools/select_work.py --show S17-W1-T2
```
Provas: `evidence/S17/W1-T2/attempt-NN/`. Template/selagem/validação: [passo a passo](START-HERE.md). Readiness e locks devem ser verificados antes de iniciar; mostrar a task não a libera.

[Voltar ao início](START-HERE.md) · [Mapa de tickets](#mapa-dos-39-tickets-subordinados)

<a id="s18"></a>
### S18 — Tasks resumidas, drill-down e atividade

**Ticket:** [S18 / #161](https://github.com/gmhelmold/HuGR-Orchestra/issues/161) · **Contrato completo:** [`issues/S18.md`](issues/S18.md)
**Caminho:** #215 → [E3 / #132](https://github.com/gmhelmold/HuGR-Orchestra/issues/132) → [I07 / #140](https://github.com/gmhelmold/HuGR-Orchestra/issues/140) → [S18 / #161](https://github.com/gmhelmold/HuGR-Orchestra/issues/161)
**Dependências de entrada declaradas:** [S03-W1-T1](#s03-w1-t1), [S04-W1-T1](#s04-w1-t1), [S17](#s17), [S22-W1-T1](#s22-w1-t1). Leia também as dependências herdadas/finas da task.
**Entrega esperada:** Painéis de execução úteis, fiéis e verdadeiros.
**Contratos usados pelas tasks (leitura seletiva por categoria):** [`CONTRACTS.md`](CONTRACTS.md) · [`SPEC.md`](SPEC.md) · [`PERFORMANCE.md`](PERFORMANCE.md) · [`BUDGETS.json`](BUDGETS.json) · [`COVERAGE.json`](COVERAGE.json) · [`fixture.json`](fixture.json) · [`RECEIPTS-v4.md`](RECEIPTS-v4.md) · [`BRAND-INTEGRATION.md`](BRAND-INTEGRATION.md) · [`BRAND-ASSETS.json`](BRAND-ASSETS.json) · [`WIDGETS.md`](WIDGETS.md)

**Entradas mapeadas de código / fontes (não são todas permissões de edição):**
- [`packages/app/src/pages/session/tasks-data.ts`](../../packages/app/src/pages/session/tasks-data.ts) — presente no snapshot; raiz `$REPO`
- [`packages/app/src/pages/session/session-side-panel.tsx`](../../packages/app/src/pages/session/session-side-panel.tsx) — presente no snapshot; raiz `$REPO`
- [`packages/app/src/pages/session/use-session-commands.tsx`](../../packages/app/src/pages/session/use-session-commands.tsx) — presente no snapshot; raiz `$REPO`
- [`packages/app/src/pages/session/tasks-panel.tsx`](../../packages/app/src/pages/session/tasks-panel.tsx) — presente no snapshot; raiz `$REPO`
- `packages/app/src/pages/session/orchestra-activity.tsx` — entrada mapeada; **existência/consumer a conferir em S01**

**Escrita autorizada no nível da subissue — a task pode ser mais restrita:**
```text
packages/app/src/pages/session/tasks-panel.tsx
packages/app/src/pages/session/orchestra-tasks*
packages/app/src/pages/session/orchestra-activity.tsx
specs/orchestra-visual/evidence/S18/**
packages/app/src/pages/session/orchestra-activity.test.tsx
```
**Registros de cobertura:** `UI55` Tasks panel [ui-surface], `UI78` Typed Activity card consumer [ui-surface]
**Provas da frente:** `evidence/S18/`; só crie arquivos das suas tentativas. Não há provas de produto preaprovadas.

<a id="s18-w1"></a>
#### S18-W1 — Implementar e provar tasks resumidas, drill-down e atividade
Arquivo: [`issues/S18.md`](issues/S18.md) · localizar o heading `## S18-W1 —`. Os cinco axiomas e seus IDs estão nessa seção.
Tasks: [S18-W1-T1](#s18-w1-t1) · [S18-W1-T2](#s18-w1-t2)

<a id="s18-w1-t1"></a>
#### S18-W1-T1 — Implementar tasks resumidas, drill-down e atividade
Arquivo: [`issues/S18.md`](issues/S18.md) · localizar o heading `## S18-W1-T1 —`. Os cinco axiomas e seus IDs estão nessa seção.
```sh
# CWD: $PLAN_ROOT
python3 tools/select_work.py --show S18-W1-T1
```
Provas: `evidence/S18/W1-T1/attempt-NN/`. Template/selagem/validação: [passo a passo](START-HERE.md). Readiness e locks devem ser verificados antes de iniciar; mostrar a task não a libera.

<a id="s18-w1-t2"></a>
#### S18-W1-T2 — Testar, medir e revisar tasks resumidas, drill-down e atividade
Arquivo: [`issues/S18.md`](issues/S18.md) · localizar o heading `## S18-W1-T2 —`. Os cinco axiomas e seus IDs estão nessa seção.
```sh
# CWD: $PLAN_ROOT
python3 tools/select_work.py --show S18-W1-T2
```
Provas: `evidence/S18/W1-T2/attempt-NN/`. Template/selagem/validação: [passo a passo](START-HERE.md). Readiness e locks devem ser verificados antes de iniciar; mostrar a task não a libera.

[Voltar ao início](START-HERE.md) · [Mapa de tickets](#mapa-dos-39-tickets-subordinados)

<a id="s19"></a>
### S19 — Contexto, recursos e Own com read boundary explícita

**Ticket:** [S19 / #162](https://github.com/gmhelmold/HuGR-Orchestra/issues/162) · **Contrato completo:** [`issues/S19.md`](issues/S19.md)
**Caminho:** #215 → [E3 / #132](https://github.com/gmhelmold/HuGR-Orchestra/issues/132) → [I08 / #141](https://github.com/gmhelmold/HuGR-Orchestra/issues/141) → [S19 / #162](https://github.com/gmhelmold/HuGR-Orchestra/issues/162)
**Dependências de entrada declaradas:** [S03-W1-T1](#s03-w1-t1), [S04-W1-T1](#s04-w1-t1), [S01](#s01), [S22-W1-T1](#s22-w1-t1). Leia também as dependências herdadas/finas da task.
**Entrega esperada:** Contexto polido + read-boundary planejada/implementada onde suportada; bloqueio live explícito.
**Fronteiras externas registradas:** `[{"ref": "#109", "type": "read-boundary", "hard": true, "rule": "Exigida para Own live; unavailable UI independe."}, {"ref": "#112", "type": "catalog", "hard": true, "rule": "Catálogo instalado para unidade canônica."}, {"ref": "#108", "type": "context", "hard": true, "rule": "ContextRecord verificado."}, {"ref": "#114", "type": "durable-records", "hard": true, "rule": "Leitura durável; não inferir de texto."}]`. Não presumir prontidão pelo título da issue.
**Contratos usados pelas tasks (leitura seletiva por categoria):** [`CONTRACTS.md`](CONTRACTS.md) · [`SPEC.md`](SPEC.md) · [`PERFORMANCE.md`](PERFORMANCE.md) · [`BUDGETS.json`](BUDGETS.json) · [`COVERAGE.json`](COVERAGE.json) · [`fixture.json`](fixture.json) · [`RECEIPTS-v4.md`](RECEIPTS-v4.md) · [`BRAND-INTEGRATION.md`](BRAND-INTEGRATION.md) · [`BRAND-ASSETS.json`](BRAND-ASSETS.json) · [`WIDGETS.md`](WIDGETS.md)

**Entradas mapeadas de código / fontes (não são todas permissões de edição):**
- [`specs/hugr-maestro/own-protocol.md`](../../specs/hugr-maestro/own-protocol.md) — presente no snapshot; raiz `$REPO`
- [`specs/hugr-maestro/atlas-context-envelope-contract.md`](../../specs/hugr-maestro/atlas-context-envelope-contract.md) — presente no snapshot; raiz `$REPO`
- [`foundation/atlas/OWN-SNAPSHOT.json`](../../foundation/atlas/OWN-SNAPSHOT.json) — presente no snapshot; raiz `$REPO`
- [`packages/app/src/components/session/session-context-metrics.ts`](../../packages/app/src/components/session/session-context-metrics.ts) — presente no snapshot; raiz `$REPO`
- [`packages/app/src/components/session-context-usage.tsx`](../../packages/app/src/components/session-context-usage.tsx) — presente no snapshot; raiz `$REPO`
- [`specs/hugr-maestro/SESSION-STATE.md`](../../specs/hugr-maestro/SESSION-STATE.md) — presente no snapshot; raiz `$REPO`

**Escrita autorizada no nível da subissue — a task pode ser mais restrita:**
```text
packages/app/src/components/session-context-usage.tsx
packages/app/src/components/session/session-context-*
packages/app/src/pages/session/orchestra-context*
packages/server/src/orchestra-context-read/**
packages/protocol/src/orchestra-context-read/**
packages/client/src/orchestra-context-read/**
specs/orchestra-visual/evidence/S19/**
```
**Registros de cobertura:** `UI57` Context usage/cost [ui-surface], `UI58` Own/context live [read-anchor]
**Provas da frente:** `evidence/S19/`; só crie arquivos das suas tentativas. Não há provas de produto preaprovadas.

<a id="s19-w1"></a>
#### S19-W1 — Implementar e provar contexto, recursos e own com read boundary explícita
Arquivo: [`issues/S19.md`](issues/S19.md) · localizar o heading `## S19-W1 —`. Os cinco axiomas e seus IDs estão nessa seção.
Tasks: [S19-W1-T1](#s19-w1-t1) · [S19-W1-T2](#s19-w1-t2)

<a id="s19-w1-t1"></a>
#### S19-W1-T1 — Implementar contexto, recursos e own com read boundary explícita
Arquivo: [`issues/S19.md`](issues/S19.md) · localizar o heading `## S19-W1-T1 —`. Os cinco axiomas e seus IDs estão nessa seção.
```sh
# CWD: $PLAN_ROOT
python3 tools/select_work.py --show S19-W1-T1
```
Provas: `evidence/S19/W1-T1/attempt-NN/`. Template/selagem/validação: [passo a passo](START-HERE.md). Readiness e locks devem ser verificados antes de iniciar; mostrar a task não a libera.

<a id="s19-w1-t2"></a>
#### S19-W1-T2 — Testar, medir e revisar contexto, recursos e own com read boundary explícita
Arquivo: [`issues/S19.md`](issues/S19.md) · localizar o heading `## S19-W1-T2 —`. Os cinco axiomas e seus IDs estão nessa seção.
```sh
# CWD: $PLAN_ROOT
python3 tools/select_work.py --show S19-W1-T2
```
Provas: `evidence/S19/W1-T2/attempt-NN/`. Template/selagem/validação: [passo a passo](START-HERE.md). Readiness e locks devem ser verificados antes de iniciar; mostrar a task não a libera.

<a id="s19-w2"></a>
#### S19-W2 — Read projection autoritativa de Own/contexto — enablement live
Arquivo: [`issues/S19.md`](issues/S19.md) · localizar o heading `## S19-W2 —`. Os cinco axiomas e seus IDs estão nessa seção.
Tasks: [S19-W2-T1](#s19-w2-t1) · [S19-W2-T2](#s19-w2-t2)

<a id="s19-w2-t1"></a>
#### S19-W2-T1 — Ligar read projection autoritativa de own/contexto
Arquivo: [`issues/S19.md`](issues/S19.md) · localizar o heading `## S19-W2-T1 —`. Os cinco axiomas e seus IDs estão nessa seção.
```sh
# CWD: $PLAN_ROOT
python3 tools/select_work.py --show S19-W2-T1
```
Provas: `evidence/S19/W2-T1/attempt-NN/`. Template/selagem/validação: [passo a passo](START-HERE.md). Readiness e locks devem ser verificados antes de iniciar; mostrar a task não a libera.

<a id="s19-w2-t2"></a>
#### S19-W2-T2 — Provar enablement live S19
Arquivo: [`issues/S19.md`](issues/S19.md) · localizar o heading `## S19-W2-T2 —`. Os cinco axiomas e seus IDs estão nessa seção.
```sh
# CWD: $PLAN_ROOT
python3 tools/select_work.py --show S19-W2-T2
```
Provas: `evidence/S19/W2-T2/attempt-NN/`. Template/selagem/validação: [passo a passo](START-HERE.md). Readiness e locks devem ser verificados antes de iniciar; mostrar a task não a libera.

[Voltar ao início](START-HERE.md) · [Mapa de tickets](#mapa-dos-39-tickets-subordinados)

<a id="s20"></a>
### S20 — Maestro: status, input e aprovação sem autoridade fictícia

**Ticket:** [S20 / #163](https://github.com/gmhelmold/HuGR-Orchestra/issues/163) · **Contrato completo:** [`issues/S20.md`](issues/S20.md)
**Caminho:** #215 → [E3 / #132](https://github.com/gmhelmold/HuGR-Orchestra/issues/132) → [I08 / #141](https://github.com/gmhelmold/HuGR-Orchestra/issues/141) → [S20 / #163](https://github.com/gmhelmold/HuGR-Orchestra/issues/163)
**Dependências de entrada declaradas:** [S03-W1-T1](#s03-w1-t1), [S04-W1-T1](#s04-w1-t1), [S01](#s01), [S22-W1-T1](#s22-w1-t1). Leia também as dependências herdadas/finas da task.
**Entrega esperada:** Governança exposta com status real e fronteiras preservadas.
**Fronteiras externas registradas:** `[{"ref": "#106", "type": "approval-authority", "hard": true, "rule": "Exigida para enablement, não para UI unavailable."}, {"ref": "#114", "type": "durable-records", "hard": true, "rule": "Exact durable reader."}, {"ref": "#113", "type": "hardening", "hard": true, "rule": "Fechar hardening aplicável antes de habilitar."}]`. Não presumir prontidão pelo título da issue.
**Contratos usados pelas tasks (leitura seletiva por categoria):** [`CONTRACTS.md`](CONTRACTS.md) · [`SPEC.md`](SPEC.md) · [`PERFORMANCE.md`](PERFORMANCE.md) · [`BUDGETS.json`](BUDGETS.json) · [`COVERAGE.json`](COVERAGE.json) · [`fixture.json`](fixture.json) · [`RECEIPTS-v4.md`](RECEIPTS-v4.md) · [`BRAND-INTEGRATION.md`](BRAND-INTEGRATION.md) · [`BRAND-ASSETS.json`](BRAND-ASSETS.json) · [`WIDGETS.md`](WIDGETS.md)

**Entradas mapeadas de código / fontes (não são todas permissões de edição):**
- [`packages/opencode/src/tool/maestro-approval.ts`](../../packages/opencode/src/tool/maestro-approval.ts) — presente no snapshot; raiz `$REPO`
- [`packages/opencode/src/maestro/approval-record.ts`](../../packages/opencode/src/maestro/approval-record.ts) — presente no snapshot; raiz `$REPO`
- [`packages/schema/src/maestro-event.ts`](../../packages/schema/src/maestro-event.ts) — presente no snapshot; raiz `$REPO`
- [`specs/hugr-maestro/SESSION-STATE.md`](../../specs/hugr-maestro/SESSION-STATE.md) — presente no snapshot; raiz `$REPO`
- [`packages/opencode/src/agent/prompt/maestro.txt`](../../packages/opencode/src/agent/prompt/maestro.txt) — presente no snapshot; raiz `$REPO`
- `packages/app/src/pages/session/orchestra-governance.tsx` — entrada mapeada; **existência/consumer a conferir em S01**

**Escrita autorizada no nível da subissue — a task pode ser mais restrita:**
```text
packages/app/src/pages/session/orchestra-governance*
packages/server/src/orchestra-governance-read/**
packages/protocol/src/orchestra-governance-read/**
packages/client/src/orchestra-governance-read/**
specs/orchestra-visual/evidence/S20/**
```
**Registros de cobertura:** `UI59` Maestro normal [read-anchor], `UI60` Maestro governed approval [read-anchor], `UI76` Governança no consumidor visual: estados seguros e decisões [ui-surface]
**Provas da frente:** `evidence/S20/`; só crie arquivos das suas tentativas. Não há provas de produto preaprovadas.

<a id="s20-w1"></a>
#### S20-W1 — Implementar e provar maestro: status, input e aprovação sem autoridade fictícia
Arquivo: [`issues/S20.md`](issues/S20.md) · localizar o heading `## S20-W1 —`. Os cinco axiomas e seus IDs estão nessa seção.
Tasks: [S20-W1-T1](#s20-w1-t1) · [S20-W1-T2](#s20-w1-t2)

<a id="s20-w1-t1"></a>
#### S20-W1-T1 — Implementar maestro: status, input e aprovação sem autoridade fictícia
Arquivo: [`issues/S20.md`](issues/S20.md) · localizar o heading `## S20-W1-T1 —`. Os cinco axiomas e seus IDs estão nessa seção.
```sh
# CWD: $PLAN_ROOT
python3 tools/select_work.py --show S20-W1-T1
```
Provas: `evidence/S20/W1-T1/attempt-NN/`. Template/selagem/validação: [passo a passo](START-HERE.md). Readiness e locks devem ser verificados antes de iniciar; mostrar a task não a libera.

<a id="s20-w1-t2"></a>
#### S20-W1-T2 — Testar, medir e revisar maestro: status, input e aprovação sem autoridade fictícia
Arquivo: [`issues/S20.md`](issues/S20.md) · localizar o heading `## S20-W1-T2 —`. Os cinco axiomas e seus IDs estão nessa seção.
```sh
# CWD: $PLAN_ROOT
python3 tools/select_work.py --show S20-W1-T2
```
Provas: `evidence/S20/W1-T2/attempt-NN/`. Template/selagem/validação: [passo a passo](START-HERE.md). Readiness e locks devem ser verificados antes de iniciar; mostrar a task não a libera.

<a id="s20-w2"></a>
#### S20-W2 — Read projection e binding de decisão Maestro — enablement live
Arquivo: [`issues/S20.md`](issues/S20.md) · localizar o heading `## S20-W2 —`. Os cinco axiomas e seus IDs estão nessa seção.
Tasks: [S20-W2-T1](#s20-w2-t1) · [S20-W2-T2](#s20-w2-t2)

<a id="s20-w2-t1"></a>
#### S20-W2-T1 — Ligar read projection e binding de decisão maestro
Arquivo: [`issues/S20.md`](issues/S20.md) · localizar o heading `## S20-W2-T1 —`. Os cinco axiomas e seus IDs estão nessa seção.
```sh
# CWD: $PLAN_ROOT
python3 tools/select_work.py --show S20-W2-T1
```
Provas: `evidence/S20/W2-T1/attempt-NN/`. Template/selagem/validação: [passo a passo](START-HERE.md). Readiness e locks devem ser verificados antes de iniciar; mostrar a task não a libera.

<a id="s20-w2-t2"></a>
#### S20-W2-T2 — Provar enablement live S20
Arquivo: [`issues/S20.md`](issues/S20.md) · localizar o heading `## S20-W2-T2 —`. Os cinco axiomas e seus IDs estão nessa seção.
```sh
# CWD: $PLAN_ROOT
python3 tools/select_work.py --show S20-W2-T2
```
Provas: `evidence/S20/W2-T2/attempt-NN/`. Template/selagem/validação: [passo a passo](START-HERE.md). Readiness e locks devem ser verificados antes de iniciar; mostrar a task não a libera.

[Voltar ao início](START-HERE.md) · [Mapa de tickets](#mapa-dos-39-tickets-subordinados)

<a id="s21"></a>
### S21 — Janitor: widget, pocket e diagnósticos contextualizados

**Ticket:** [S21 / #164](https://github.com/gmhelmold/HuGR-Orchestra/issues/164) · **Contrato completo:** [`issues/S21.md`](issues/S21.md)
**Caminho:** #215 → [E3 / #132](https://github.com/gmhelmold/HuGR-Orchestra/issues/132) → [I08 / #141](https://github.com/gmhelmold/HuGR-Orchestra/issues/141) → [S21 / #164](https://github.com/gmhelmold/HuGR-Orchestra/issues/164)
**Dependências de entrada declaradas:** [S03-W1-T1](#s03-w1-t1), [S04-W1-T1](#s04-w1-t1), [S22-W1-T1](#s22-w1-t1), [S25-W0-T2](#s25-w0-t2). Leia também as dependências herdadas/finas da task.
**Entrega esperada:** Janitor íntegro visualmente integrado.
**Contratos usados pelas tasks (leitura seletiva por categoria):** [`CONTRACTS.md`](CONTRACTS.md) · [`SPEC.md`](SPEC.md) · [`PERFORMANCE.md`](PERFORMANCE.md) · [`BUDGETS.json`](BUDGETS.json) · [`COVERAGE.json`](COVERAGE.json) · [`fixture.json`](fixture.json) · [`RECEIPTS-v4.md`](RECEIPTS-v4.md) · [`BRAND-INTEGRATION.md`](BRAND-INTEGRATION.md) · [`BRAND-ASSETS.json`](BRAND-ASSETS.json) · [`WIDGETS.md`](WIDGETS.md)

**Entradas mapeadas de código / fontes (não são todas permissões de edição):**
- [`packages/opencode/src/janitor/scan.ts`](../../packages/opencode/src/janitor/scan.ts) — presente no snapshot; raiz `$REPO`
- [`packages/opencode/src/janitor/scheduler.ts`](../../packages/opencode/src/janitor/scheduler.ts) — presente no snapshot; raiz `$REPO`
- [`packages/opencode/src/janitor/report-state.ts`](../../packages/opencode/src/janitor/report-state.ts) — presente no snapshot; raiz `$REPO`
- [`packages/app/src/components/janitor-widget.tsx`](../../packages/app/src/components/janitor-widget.tsx) — presente no snapshot; raiz `$REPO`

**Escrita autorizada no nível da subissue — a task pode ser mais restrita:**
```text
packages/app/src/components/janitor*
packages/app/src/context/janitor.tsx
packages/app/src/utils/janitor-report*
packages/desktop/src/main/janitor*
specs/orchestra-visual/evidence/S21/**
```
**Registros de cobertura:** `UI61` Janitor widget [ui-surface], `UI62` Janitor data/scheduler [read-anchor]
**Provas da frente:** `evidence/S21/`; só crie arquivos das suas tentativas. Não há provas de produto preaprovadas.

<a id="s21-w1"></a>
#### S21-W1 — Implementar e provar janitor: widget, pocket e diagnósticos contextualizados
Arquivo: [`issues/S21.md`](issues/S21.md) · localizar o heading `## S21-W1 —`. Os cinco axiomas e seus IDs estão nessa seção.
Tasks: [S21-W1-T1](#s21-w1-t1) · [S21-W1-T2](#s21-w1-t2)

<a id="s21-w1-t1"></a>
#### S21-W1-T1 — Implementar janitor: widget, pocket e diagnósticos contextualizados
Arquivo: [`issues/S21.md`](issues/S21.md) · localizar o heading `## S21-W1-T1 —`. Os cinco axiomas e seus IDs estão nessa seção.
```sh
# CWD: $PLAN_ROOT
python3 tools/select_work.py --show S21-W1-T1
```
Provas: `evidence/S21/W1-T1/attempt-NN/`. Template/selagem/validação: [passo a passo](START-HERE.md). Readiness e locks devem ser verificados antes de iniciar; mostrar a task não a libera.

<a id="s21-w1-t2"></a>
#### S21-W1-T2 — Testar, medir e revisar janitor: widget, pocket e diagnósticos contextualizados
Arquivo: [`issues/S21.md`](issues/S21.md) · localizar o heading `## S21-W1-T2 —`. Os cinco axiomas e seus IDs estão nessa seção.
```sh
# CWD: $PLAN_ROOT
python3 tools/select_work.py --show S21-W1-T2
```
Provas: `evidence/S21/W1-T2/attempt-NN/`. Template/selagem/validação: [passo a passo](START-HERE.md). Readiness e locks devem ser verificados antes de iniciar; mostrar a task não a libera.

[Voltar ao início](START-HERE.md) · [Mapa de tickets](#mapa-dos-39-tickets-subordinados)

<a id="s22"></a>
### S22 — Localização, acessibilidade e matriz de estados

**Ticket:** [S22 / #165](https://github.com/gmhelmold/HuGR-Orchestra/issues/165) · **Contrato completo:** [`issues/S22.md`](issues/S22.md)
**Caminho:** #215 → [E4 / #133](https://github.com/gmhelmold/HuGR-Orchestra/issues/133) → [I09 / #142](https://github.com/gmhelmold/HuGR-Orchestra/issues/142) → [S22 / #165](https://github.com/gmhelmold/HuGR-Orchestra/issues/165)
**Dependências de entrada declaradas:** [S01](#s01). Leia também as dependências herdadas/finas da task.
**Entrega esperada:** Todos os fluxos e estados legíveis, localizados e acessíveis.
**Contratos usados pelas tasks (leitura seletiva por categoria):** [`CONTRACTS.md`](CONTRACTS.md) · [`SPEC.md`](SPEC.md) · [`PERFORMANCE.md`](PERFORMANCE.md) · [`BUDGETS.json`](BUDGETS.json) · [`COVERAGE.json`](COVERAGE.json) · [`fixture.json`](fixture.json) · [`RECEIPTS-v4.md`](RECEIPTS-v4.md) · [`BRAND-INTEGRATION.md`](BRAND-INTEGRATION.md) · [`BRAND-ASSETS.json`](BRAND-ASSETS.json) · [`WIDGETS.md`](WIDGETS.md)

**Entradas mapeadas de código / fontes (não são todas permissões de edição):**
- [`packages/app/src/context/language.tsx`](../../packages/app/src/context/language.tsx) — presente no snapshot; raiz `$REPO`
- [`packages/app/src/i18n/parity.test.ts`](../../packages/app/src/i18n/parity.test.ts) — presente no snapshot; raiz `$REPO`

**Escrita autorizada no nível da subissue — a task pode ser mais restrita:**
```text
packages/app/src/i18n/**
packages/ui/src/i18n/**
packages/app/e2e/regression/orchestra-accessibility.spec.ts
specs/orchestra-visual/copy.json
specs/orchestra-visual/qa/a11y.json
specs/orchestra-visual/evidence/S22/**
```
**Registros de cobertura:** `UI63` Localização/parity [read-anchor]
**Provas da frente:** `evidence/S22/`; só crie arquivos das suas tentativas. Não há provas de produto preaprovadas.

<a id="s22-w1"></a>
#### S22-W1 — Implementar e provar localização, acessibilidade e matriz de estados
Arquivo: [`issues/S22.md`](issues/S22.md) · localizar o heading `## S22-W1 —`. Os cinco axiomas e seus IDs estão nessa seção.
Tasks: [S22-W1-T1](#s22-w1-t1) · [S22-W1-T2](#s22-w1-t2)

<a id="s22-w1-t1"></a>
#### S22-W1-T1 — Implementar localização, acessibilidade e matriz de estados
Arquivo: [`issues/S22.md`](issues/S22.md) · localizar o heading `## S22-W1-T1 —`. Os cinco axiomas e seus IDs estão nessa seção.
```sh
# CWD: $PLAN_ROOT
python3 tools/select_work.py --show S22-W1-T1
```
Provas: `evidence/S22/W1-T1/attempt-NN/`. Template/selagem/validação: [passo a passo](START-HERE.md). Readiness e locks devem ser verificados antes de iniciar; mostrar a task não a libera.

<a id="s22-w1-t2"></a>
#### S22-W1-T2 — Testar, medir e revisar localização, acessibilidade e matriz de estados
Arquivo: [`issues/S22.md`](issues/S22.md) · localizar o heading `## S22-W1-T2 —`. Os cinco axiomas e seus IDs estão nessa seção.
```sh
# CWD: $PLAN_ROOT
python3 tools/select_work.py --show S22-W1-T2
```
Provas: `evidence/S22/W1-T2/attempt-NN/`. Template/selagem/validação: [passo a passo](START-HERE.md). Readiness e locks devem ser verificados antes de iniciar; mostrar a task não a libera.

[Voltar ao início](START-HERE.md) · [Mapa de tickets](#mapa-dos-39-tickets-subordinados)

<a id="s23"></a>
### S23 — Performance de produto e soak no hardware-alvo

**Ticket:** [S23 / #166](https://github.com/gmhelmold/HuGR-Orchestra/issues/166) · **Contrato completo:** [`issues/S23.md`](issues/S23.md)
**Caminho:** #215 → [E4 / #133](https://github.com/gmhelmold/HuGR-Orchestra/issues/133) → [I09 / #142](https://github.com/gmhelmold/HuGR-Orchestra/issues/142) → [S23 / #166](https://github.com/gmhelmold/HuGR-Orchestra/issues/166)
**Dependências de entrada declaradas:** [S02](#s02), [S06](#s06), [S07](#s07), [S08](#s08), [S09](#s09), [S10](#s10), [S11](#s11), [S12](#s12), [S13](#s13), [S14](#s14), [S15](#s15), [S16](#s16), [S17](#s17), [S18](#s18), [S19-W1](#s19-w1), [S20-W1](#s20-w1), [S21](#s21), [S25-W1-T1](#s25-w1-t1). Leia também as dependências herdadas/finas da task.
**Entrega esperada:** Relatório reproduzível de leveza e fluidez; nenhuma promessa sem medição.
**Contratos usados pelas tasks (leitura seletiva por categoria):** [`CONTRACTS.md`](CONTRACTS.md) · [`SPEC.md`](SPEC.md) · [`PERFORMANCE.md`](PERFORMANCE.md) · [`BUDGETS.json`](BUDGETS.json) · [`COVERAGE.json`](COVERAGE.json) · [`fixture.json`](fixture.json) · [`RECEIPTS-v4.md`](RECEIPTS-v4.md) · [`BRAND-INTEGRATION.md`](BRAND-INTEGRATION.md) · [`BRAND-ASSETS.json`](BRAND-ASSETS.json) · [`WIDGETS.md`](WIDGETS.md)

**Entradas mapeadas de código / fontes (não são todas permissões de edição):**
- [`packages/app/e2e/performance/README.md`](../../packages/app/e2e/performance/README.md) — presente no snapshot; raiz `$REPO`
- `packages/app/e2e/performance/orchestra/**` — **padrão de caminho**, não um arquivo literal
- [`packages/desktop/src/main/app-dock.ts`](../../packages/desktop/src/main/app-dock.ts) — presente no snapshot; raiz `$REPO`

**Escrita autorizada no nível da subissue — a task pode ser mais restrita:**
```text
packages/app/e2e/performance/orchestra-final/**
packages/desktop/test/orchestra-performance/**
specs/orchestra-visual/qa/performance/**
specs/orchestra-visual/evidence/S23/**
```
**Registros de cobertura:** `UI65` Native performance attribution [measurement-anchor]
**Provas da frente:** `evidence/S23/`; só crie arquivos das suas tentativas. Não há provas de produto preaprovadas.

<a id="s23-w1"></a>
#### S23-W1 — Implementar e provar performance de produto e soak no hardware-alvo
Arquivo: [`issues/S23.md`](issues/S23.md) · localizar o heading `## S23-W1 —`. Os cinco axiomas e seus IDs estão nessa seção.
Tasks: [S23-W1-T1](#s23-w1-t1) · [S23-W1-T2](#s23-w1-t2)

<a id="s23-w1-t1"></a>
#### S23-W1-T1 — Implementar performance de produto e soak no hardware-alvo
Arquivo: [`issues/S23.md`](issues/S23.md) · localizar o heading `## S23-W1-T1 —`. Os cinco axiomas e seus IDs estão nessa seção.
```sh
# CWD: $PLAN_ROOT
python3 tools/select_work.py --show S23-W1-T1
```
Provas: `evidence/S23/W1-T1/attempt-NN/`. Template/selagem/validação: [passo a passo](START-HERE.md). Readiness e locks devem ser verificados antes de iniciar; mostrar a task não a libera.

<a id="s23-w1-t2"></a>
#### S23-W1-T2 — Testar, medir e revisar performance de produto e soak no hardware-alvo
Arquivo: [`issues/S23.md`](issues/S23.md) · localizar o heading `## S23-W1-T2 —`. Os cinco axiomas e seus IDs estão nessa seção.
```sh
# CWD: $PLAN_ROOT
python3 tools/select_work.py --show S23-W1-T2
```
Provas: `evidence/S23/W1-T2/attempt-NN/`. Template/selagem/validação: [passo a passo](START-HERE.md). Readiness e locks devem ser verificados antes de iniciar; mostrar a task não a libera.

[Voltar ao início](START-HERE.md) · [Mapa de tickets](#mapa-dos-39-tickets-subordinados)

<a id="s24"></a>
### S24 — Inspeção visual integral e microacabamento

**Ticket:** [S24 / #167](https://github.com/gmhelmold/HuGR-Orchestra/issues/167) · **Contrato completo:** [`issues/S24.md`](issues/S24.md)
**Caminho:** #215 → [E4 / #133](https://github.com/gmhelmold/HuGR-Orchestra/issues/133) → [I09 / #142](https://github.com/gmhelmold/HuGR-Orchestra/issues/142) → [S24 / #167](https://github.com/gmhelmold/HuGR-Orchestra/issues/167)
**Dependências de entrada declaradas:** [S06](#s06), [S07](#s07), [S08](#s08), [S09](#s09), [S10](#s10), [S11](#s11), [S12](#s12), [S13](#s13), [S14](#s14), [S15](#s15), [S16](#s16), [S18](#s18), [S19-W1](#s19-w1), [S20-W1](#s20-w1), [S21](#s21), [S22](#s22), [S25-W1-T1](#s25-w1-t1). Leia também as dependências herdadas/finas da task.
**Entrega esperada:** Acabamento examinado em todas as superfícies; feedback do usuário não reinventa a direção.
**Contratos usados pelas tasks (leitura seletiva por categoria):** [`CONTRACTS.md`](CONTRACTS.md) · [`SPEC.md`](SPEC.md) · [`PERFORMANCE.md`](PERFORMANCE.md) · [`BUDGETS.json`](BUDGETS.json) · [`COVERAGE.json`](COVERAGE.json) · [`fixture.json`](fixture.json) · [`RECEIPTS-v4.md`](RECEIPTS-v4.md) · [`BRAND-INTEGRATION.md`](BRAND-INTEGRATION.md) · [`BRAND-ASSETS.json`](BRAND-ASSETS.json) · [`WIDGETS.md`](WIDGETS.md)

**Entradas mapeadas de código / fontes (não são todas permissões de edição):**
- [`SURFACES.json`](SURFACES.json) — arquivo/pasta do plano; raiz `$PLAN_ROOT`
- `packages/app/e2e/regression/orchestra-reference.spec.ts` — entrada mapeada; **existência/consumer a conferir em S01**
- `reference/approved.png` — entrada mapeada; **existência/consumer a conferir em S01**

**Escrita autorizada no nível da subissue — a task pode ser mais restrita:**
```text
packages/app/e2e/regression/orchestra-visual*
packages/app/e2e/orchestra-screenshots/**
specs/orchestra-visual/qa/visual/**
specs/orchestra-visual/evidence/S24/**
```
**Registros de cobertura:** `UI68` Screenshot-only extra dashboards [visual-reference]
**Provas da frente:** `evidence/S24/`; só crie arquivos das suas tentativas. Não há provas de produto preaprovadas.

<a id="s24-w1"></a>
#### S24-W1 — Implementar e provar inspeção visual integral e microacabamento
Arquivo: [`issues/S24.md`](issues/S24.md) · localizar o heading `## S24-W1 —`. Os cinco axiomas e seus IDs estão nessa seção.
Tasks: [S24-W1-T1](#s24-w1-t1) · [S24-W1-T2](#s24-w1-t2)

<a id="s24-w1-t1"></a>
#### S24-W1-T1 — Implementar inspeção visual integral e microacabamento
Arquivo: [`issues/S24.md`](issues/S24.md) · localizar o heading `## S24-W1-T1 —`. Os cinco axiomas e seus IDs estão nessa seção.
```sh
# CWD: $PLAN_ROOT
python3 tools/select_work.py --show S24-W1-T1
```
Provas: `evidence/S24/W1-T1/attempt-NN/`. Template/selagem/validação: [passo a passo](START-HERE.md). Readiness e locks devem ser verificados antes de iniciar; mostrar a task não a libera.

<a id="s24-w1-t2"></a>
#### S24-W1-T2 — Testar, medir e revisar inspeção visual integral e microacabamento
Arquivo: [`issues/S24.md`](issues/S24.md) · localizar o heading `## S24-W1-T2 —`. Os cinco axiomas e seus IDs estão nessa seção.
```sh
# CWD: $PLAN_ROOT
python3 tools/select_work.py --show S24-W1-T2
```
Provas: `evidence/S24/W1-T2/attempt-NN/`. Template/selagem/validação: [passo a passo](START-HERE.md). Readiness e locks devem ser verificados antes de iniciar; mostrar a task não a libera.

[Voltar ao início](START-HERE.md) · [Mapa de tickets](#mapa-dos-39-tickets-subordinados)

<a id="s25"></a>
### S25 — Integração, ativação reversível e entrega completa

**Ticket:** [S25 / #168](https://github.com/gmhelmold/HuGR-Orchestra/issues/168) · **Contrato completo:** [`issues/S25.md`](issues/S25.md)
**Caminho:** #215 → [E4 / #133](https://github.com/gmhelmold/HuGR-Orchestra/issues/133) → [I10 / #143](https://github.com/gmhelmold/HuGR-Orchestra/issues/143) → [S25 / #168](https://github.com/gmhelmold/HuGR-Orchestra/issues/168)
**Dependências de entrada declaradas:** nenhuma neste nó. Leia também as dependências herdadas/finas da task.
**Entrega esperada:** Migração integrada e reproduzível, pronta para uso com estado de capacidades transparente.
**Contratos usados pelas tasks (leitura seletiva por categoria):** [`CONTRACTS.md`](CONTRACTS.md) · [`SPEC.md`](SPEC.md) · [`PERFORMANCE.md`](PERFORMANCE.md) · [`BUDGETS.json`](BUDGETS.json) · [`COVERAGE.json`](COVERAGE.json) · [`fixture.json`](fixture.json) · [`RECEIPTS-v4.md`](RECEIPTS-v4.md) · [`BRAND-INTEGRATION.md`](BRAND-INTEGRATION.md) · [`BRAND-ASSETS.json`](BRAND-ASSETS.json) · [`WIDGETS.md`](WIDGETS.md)

**Entradas mapeadas de código / fontes (não são todas permissões de edição):**
- `packages/app/src/pages/session/orchestra-*` — **padrão de caminho**, não um arquivo literal
- [`CENSUS.json`](CENSUS.json) — arquivo/pasta do plano; raiz `$PLAN_ROOT`
- [`packages/app/src/app.tsx`](../../packages/app/src/app.tsx) — presente no snapshot; raiz `$REPO`
- [`packages/desktop/src/main/index.ts`](../../packages/desktop/src/main/index.ts) — presente no snapshot; raiz `$REPO`

**Escrita autorizada no nível da subissue — a task pode ser mais restrita:**
```text
packages/app/src/app.tsx
packages/app/src/pages/session.tsx
packages/app/src/pages/session/session-side-panel.tsx
packages/app/src/context/settings.tsx
packages/desktop/src/main/index.ts
packages/desktop/src/main/server.ts
packages/app/package.json
packages/desktop/package.json
packages/storybook/.storybook/**
specs/orchestra-visual/DELIVERY.md
specs/orchestra-visual/evidence/S25/**
packages/app/src/pages/session/use-session-commands.tsx
packages/app/src/pages/session/use-session-commands.test.tsx
```
**Registros de cobertura:** `UI14` ConnectionGate/offline/startup [ui-surface], `UI15` Router e server identity [ui-surface], `UI16` Chrome da janela [ui-surface], `UI67` Preferences/wiring [ui-surface]
**Provas da frente:** `evidence/S25/`; só crie arquivos das suas tentativas. Não há provas de produto preaprovadas.

<a id="s25-w1"></a>
#### S25-W1 — Implementar e provar integração, ativação reversível e entrega completa
Arquivo: [`issues/S25.md`](issues/S25.md) · localizar o heading `## S25-W1 —`. Os cinco axiomas e seus IDs estão nessa seção.
Tasks: [S25-W1-T1](#s25-w1-t1) · [S25-W1-T2](#s25-w1-t2)

<a id="s25-w1-t1"></a>
#### S25-W1-T1 — Produzir candidato integrado para gates finais
Arquivo: [`issues/S25.md`](issues/S25.md) · localizar o heading `## S25-W1-T1 —`. Os cinco axiomas e seus IDs estão nessa seção.
```sh
# CWD: $PLAN_ROOT
python3 tools/select_work.py --show S25-W1-T1
```
Provas: `evidence/S25/W1-T1/attempt-NN/`. Template/selagem/validação: [passo a passo](START-HERE.md). Readiness e locks devem ser verificados antes de iniciar; mostrar a task não a libera.

<a id="s25-w1-t2"></a>
#### S25-W1-T2 — Testar, medir e revisar integração, ativação reversível e entrega completa
Arquivo: [`issues/S25.md`](issues/S25.md) · localizar o heading `## S25-W1-T2 —`. Os cinco axiomas e seus IDs estão nessa seção.
```sh
# CWD: $PLAN_ROOT
python3 tools/select_work.py --show S25-W1-T2
```
Provas: `evidence/S25/W1-T2/attempt-NN/`. Template/selagem/validação: [passo a passo](START-HERE.md). Readiness e locks devem ser verificados antes de iniciar; mostrar a task não a libera.

<a id="s25-w0"></a>
#### S25-W0 — Piloto vertical antecipado com controllers reais
Arquivo: [`issues/S25.md`](issues/S25.md) · localizar o heading `## S25-W0 —`. Os cinco axiomas e seus IDs estão nessa seção.
Tasks: [S25-W0-T1](#s25-w0-t1) · [S25-W0-T2](#s25-w0-t2)

<a id="s25-w0-t1"></a>
#### S25-W0-T1 — Conectar piloto mínimo ao aplicativo existente
Arquivo: [`issues/S25.md`](issues/S25.md) · localizar o heading `## S25-W0-T1 —`. Os cinco axiomas e seus IDs estão nessa seção.
```sh
# CWD: $PLAN_ROOT
python3 tools/select_work.py --show S25-W0-T1
```
Provas: `evidence/S25/W0-T1/attempt-NN/`. Template/selagem/validação: [passo a passo](START-HERE.md). Readiness e locks devem ser verificados antes de iniciar; mostrar a task não a libera.

<a id="s25-w0-t2"></a>
#### S25-W0-T2 — Verificar piloto real antes de propagação
Arquivo: [`issues/S25.md`](issues/S25.md) · localizar o heading `## S25-W0-T2 —`. Os cinco axiomas e seus IDs estão nessa seção.
```sh
# CWD: $PLAN_ROOT
python3 tools/select_work.py --show S25-W0-T2
```
Provas: `evidence/S25/W0-T2/attempt-NN/`. Template/selagem/validação: [passo a passo](START-HERE.md). Readiness e locks devem ser verificados antes de iniciar; mostrar a task não a libera.

[Voltar ao início](START-HERE.md) · [Mapa de tickets](#mapa-dos-39-tickets-subordinados)

