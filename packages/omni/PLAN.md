# hugr-omni — Plano de execução

> Status: **G0 assinado (B)** · contrato congelado (D5) · primeira onda (W00, W01, W03–W06) na `main` (PR #4) · segunda onda (W02, W07, W09, W10, W12, W12w) na `main` (GitLab, `c2e745b`): contrato 36/36 · 2026-10-02
> Repo: `github.com/gustavomhss/hugr-omni` (público) · CI: GitHub Actions (`scripts/ci.mjs`) · Licença: MIT OR Apache-2.0
> Lead/orquestrador: Claude (sessão principal). Execução: sub-agentes Claude. Revisão: Codex CLI.

---

## 0. Resumo em 30 segundos

- **Produto:** uma biblioteca que roda processos e terminais com o mesmo comportamento em Windows, macOS e Linux. O núcleo é em Rust, com pacotes idiomáticos para TypeScript (a interface principal; Node, Bun e Deno), Python e Rust desde o dia 1.
- **Como provamos que funciona:** duas camadas.
  - Um **contrato pequeno** (~35 testes determinísticos, um por promessa do GUARANTEES), escrito uma vez e executado nas 3 linguagens.
  - **QA de uso real medido por KPIs**: agentes rodando suítes de teste de verdade, dev servers e terminais interativos, comparados com o stdlib de cada linguagem. Os KPIs (seção 4) decidem o release.
- **Como construímos rápido:** 31 work packages (WPs), até 6 agentes em paralelo, cada um em worktree própria, com o contrato da API congelado antes. Os WPs se juntam em **7 PRs em bundle**, e o CI completo roda uma vez por bundle.
- **Como garantimos qualidade:** cada WP é revisado a frio pelo Codex **contra o próprio card** (completude, sucesso, invariantes, qualidade, DoD, com veredito campo a campo) e verificado pelo lead antes de entrar no bundle.
- **Como evitamos overengineering:** uma API com no máximo 16 conceitos, a regra de paridade (cada feature custa 3×) e um "não fazer" explícito em cada WP. Nada de teste por teste.
- **Como o código fica organizado:** monolito modular, com módulos de responsabilidade única e dependências apontando só para baixo. Nenhum arquivo de código passa de 650 linhas: o ideal é ≤400, até 600 está ok, 601–650 é tolerado com aviso. O `scripts/file-size-guard.py` falha o gate acima disso (documentos ficam fora).
- **Prazo (estimativa grosseira):** Fase 0 em 3–5 dias; Fase 1 em ~2 semanas de relógio. O release depende dos design partners.

---

## 1. Decisões do Owner

| # | Decisão | Estado |
|---|---|---|
| D1 | Nome | ✅ `hugr-omni` (livre em npm, PyPI e crates.io) |
| D2 | Repo | ✅ `gitlab.com/gmhelmold/hugr-omni`, público (GitHub: HuGR-Labs → `gmhelmold` → `gusmhs`; Actions bloqueado na `gusmhs` em 2026-10-04 → GitLab) |
| D3 | Pasta local | ✅ `~/Documents/HuGR/hugr-omni` |
| D4 | Licença | ✅ MIT OR Apache-2.0 |
| D5 | Contrato da API | ✅ aprovado e congelado pelo lead (2026-10-02): `docs/api-contract.md` |
| D6 | Estratégia de testes: contrato enxuto + QA com KPIs | ✅ diretriz do Owner (2026-10-01) |
| D7 | PRs em bundle para economizar CI | ✅ diretriz do Owner (2026-10-01) |
| D9 | G0: núcleo próprio enxuto, TS primeiro (opção B; `docs/decisions/G0.md`) | ✅ assinado pelo Owner (2026-10-01) |
| D10 | Linguagens: TypeScript (Node/Bun/Deno) no v0.1; Python e Rust (pacotes publicados) no v0.2 | ✅ Owner (2026-10-01) |
| D11 | CI funcionando | ✅ repo em `gusmhs` (2026-10-02); os jobs rodam nos 5 alvos |
| D12 | Papéis: o usuário é **stakeholder**; o lead aprova as decisões técnicas (contrato, gates, merges, go/no-go técnico) | ✅ diretriz do stakeholder (2026-10-02) |
| D8 | Monolito modular + god-file guard (400 ideal · 600 ok · 650 máximo por arquivo de código; não vale para documentos; é por arquivo, não por PR) | ✅ diretriz do Owner (2026-10-01) |

Também ficam com você, em paralelo e sem bloquear o build:
- conversas com ≥5 maintainers (G0-05);
- configurar trusted publishing nos registries (o passo a passo vem do S3);
- assinar o gate G0 e a publicação.

---

## 2. Princípios

**O usuário é o rei.** Quem usa é um dev construindo um agente ou uma ferramenta.

- **UX-A** O caso de 80% funciona sem nenhuma opção.
- **UX-B** Existe um jeito óbvio de fazer cada coisa.
- **UX-C** Os nomes são idiomáticos em cada linguagem.
- **UX-D** Todo erro diz o que falhou, com qual valor, e como consertar.
- **UX-E** Nenhuma surpresa entre sistemas: ou o comportamento é igual, ou a diferença está escrita na doc da função.
- **UX-F** Instala sem compilar, em menos de 30 s.
- **UX-G** O hover na IDE mostra a doc e um exemplo.

**Cuidado com overengineering e com excesso de teste.**

- Sem abstração antes do segundo uso real.
- Sem opção fora do contrato.
- Spikes produzem decisões, não código para main.
- Testes determinísticos só onde guardam uma promessa pública. O resto se prova usando de verdade e medindo.

**Monolito modular, sem god files.** Um núcleo único (uma crate), dividido em módulos de responsabilidade única com dependências só para baixo (seção 3, "Arquitetura interna"). Arquivo de código: ideal ≤400 linhas, ok até 600, máximo absoluto 650. Passou disso, o arquivo é dividido; não existe lista de exceções.

**Rigor não se negocia.** Gate vermelho se corrige na raiz. Nenhuma dívida ou supressão entra sem um waiver escrito e assinado pelo Owner.

---

## 3. Contrato da API

**Fonte única: [`docs/api-contract.md`](docs/api-contract.md)** (em inglês, congelado para o v0.1 em 2026-10-02 pelo lead, depois de 3 rodadas de revisão fria do Codex). Este plano não repete o contrato, para não haver duas versões que divergem.

Resumo do que ficou decidido:
- `run()` para o caso de 80%. Quando resolve, a saída é sempre completa; se passar do limite, rejeita com `OUTPUT_LIMIT` e devolve o parcial.
- `spawn()` para streaming e interação, devolvendo `PipeChild` ou `PtyChild`.
- `stop()` (não `kill()`) encerra a árvore inteira com um prazo único (`graceMs`).
- O filho nunca trava por causa da saída: há buffer limitado, e a perda é avisada em ordem (`lostBefore`).
- `wait()` diz respeito só à raiz; o `RunResult` descreve a execução inteira.
- stdin do `spawn` fechado por padrão; `closeStdin()` existe só sem PTY; `run()` com PTY não aceita `input`.
- `lines()`, `mergeStderr`, `text: true|false`.
- Uma tabela de resultados para cada situação: falha ao iniciar, cancelamento, timeout, limite, exit ≠ 0, erro de I/O.
- `.cmd`/`.bat` no Windows rodam via `cmd.exe` com escaping seguro, ou são recusados.
- O glossário tem **15 conceitos**.

### Arquitetura interna (monolito modular)

Um workspace, poucas crates, um módulo por responsabilidade. Cada módulo tem um `mod.rs` que é a sua fachada (o seam congelado no W00) e arquivos pequenos atrás dela. O processo supervisor está no ADR-0005.

| Crate / módulo | Responsabilidade | Pode depender de | Dono |
|---|---|---|---|
| `hugr-omni` · `api/` | superfície pública (`docs/api-contract.md`) | `process`, `io`, `spawn`, `pty`, `error` | W00 (congelado) |
| `hugr-omni` · `process/` | estado do `Child`: `stop`, `wait`, `processes`, precedência de `reason`, timeout e cancelamento, `run` | `pty`, `client`, `io`, `spawn`, `error`, `types` | W07, W09 |
| `hugr-omni` · `pty/` | lado host do PTY: leitura, `Go`, `resize` | `client`, `io`, `error`, `types` | W12 |
| `hugr-omni` · `client/` | ciclo de vida do supervisor (início lazy, geração, reinício, checagem de pid criador), canal não bloqueante | `omni-proto`, `spawn` (tipo `Spec`), `error` | W04 |
| `hugr-omni` · `io/` | bombas de saída com buffer limitado, decodificação, `lines`, stdin, coleta do `run` | `error`, `types` | W10 |
| `hugr-omni` · `spawn/` | do pedido ao `Spawn`: `resolve` (PATH final + PATHEXT), `env`, `validate` | `error`, `types` | W03 |
| `hugr-omni` · `error/` | `OmniError` e códigos (`mod.rs`, congelado) + textos (`messages`) | `types` | W00, W03 |
| `hugr-omni` · `types` | tipos de valor públicos (`Exit`, `RunOutput`, `Chunk`, `ProcessInfo`, ...), sem dependências | — | W00 (congelado) |
| `omni-proto` | frames e mensagens host↔supervisor (`docs/protocol.md`) | — | W00 (tipos), W04 (codec) |
| `omni-supervisor` · `unix/` | loop de eventos, `posix_spawn`, sessões, inventário, pidfd/kqueue, colheita e pin, `Stop`, morte do host | `omni-proto` | W05 |
| `omni-supervisor` · `windows/` | `CreateProcessW` + `JOB_LIST`, quoting do std, Jobs, CTRL_BREAK do próprio console, morte do host | `omni-proto` | W06 |
| `omni-supervisor` · `pty_unix/`, `pty_windows/` | PTY no supervisor (fork + `TIOCSCTTY` + `Go`; ConPTY + worker de fechamento com prazo) | `unix/` ou `windows/` | W12, W12w |
| `omni-fixture` | programa de teste | — | W01 |

Regras:
- As dependências só apontam para baixo na tabela. O supervisor nunca depende de `hugr-omni`; os dois só compartilham `omni-proto`.
- `lib.rs` só reexporta `api` e `error`; o resto é `pub(crate)`.
- Os bindings são crates separadas e só enxergam a API pública (o compilador garante). Dentro de cada binding a divisão é por responsabilidade: `child`, `run`, `error`, `convert`.
- Um arquivo que encosta em 600 linhas é dividido dentro do mesmo módulo antes de virar problema.

---

## 4. Como provamos que funciona

### 4.1 Camada 1: contrato (determinístico, enxuto)

- São **~35 itens** (Apêndice A), um por promessa pública.
- Escritos **uma vez** como cenários JSON e executados pelos runners de Rust, TS (Node, Bun, Deno) e Python.
- Servem de especificação executável e de base do GUARANTEES.
- **Não** escrevemos teste unitário por exigência. O agente escreve se isso acelera o próprio trabalho, sem contar como critério.
- Teste flaky é corrigido ou apagado, nunca re-executado até passar.

### 4.2 Camada 2: QA de uso real + KPIs (decide o release)

Workloads reais, executados por um agente "usuário" scriptado em cada linguagem e comparados com o stdlib da mesma linguagem (`child_process`, `subprocess`, `std::process`):

| Workload | O que faz |
|---|---|
| QA-A Suítes reais | roda a suíte de teste de 3 projetos open source fixados por commit (um por ecossistema, < 60 s, sem rede) com timeout |
| QA-B Dev servers | Vite (Node) e Flask com reloader (Python, que cria processo filho): espera "ready", para, confere a árvore |
| QA-C Interativo | bash/zsh/pwsh, REPL do Python e do Node via PTY: comandos, Ctrl-C num comando longo, `exit` |
| QA-D Mal-comportados | processo que vira daemon, ignora SIGTERM, inunda saída, espera stdin (`git commit` abrindo editor), pede input |
| QA-E Loop de agente | 200 comandos típicos de agente (git, grep, build, test, install) com cancelamentos aleatórios |

| KPI | Meta para release |
|---|---|
| **K1** processos órfãos após cada tarefa | **0** |
| **K2** travamentos (tarefa sem retorno após timeout + graça) | **0** |
| **K3** latência de stop (kill → árvore morta), p95 | ≤ graceMs + 500 ms |
| **K4** overhead de spawn (latência até o PID e ida-e-volta de um filho trivial), p50 | ≤ 1,25× o stdlib **ou** ≤ +0,3 ms absolutos, o que for mais folgado |
| **K5** bytes de saída perdidos ou corrompidos (dentro dos limites documentados) | **0** |
| **K6** soak de 1000 tarefas: fds/handles voltam ao baseline; crescimento de RSS | ≤ 10 MB |
| **K7** crashes do host | **0** |
| **K8** paridade: K1–K7 no Windows | mesmas metas que macOS/Linux |
| **K9** instalação limpa: 5 alvos × npm/bun/deno/pip/uv/cargo | 100% |
| **K10** usuário frio: tarefas concluídas só com o README; mediana até o primeiro sucesso | 15/15; ≤ 5 min |
| **K11** design partners | ≥2 linguagens; código de plataforma removido; bugs de Windows com repro antes/depois |

O baseline do stdlib roda os mesmos workloads e registra os K1/K2 dele. A diferença é a prova de valor do produto, e vira o material do README.

### 4.3 Invariantes globais (INV)

- **INV-01** Semântica de processo só no núcleo Rust. Os bindings convertem tipos e modelo async, nada mais.
- **INV-02** Paridade: uma capacidade (função, opção ou campo) existe nas 3 linguagens ou em nenhuma.
- **INV-03** Nunca shell. `.cmd`/`.bat` no Windows: escaping seguro ou recusa.
- **INV-04** `kill` = árvore.
- **INV-05** Nada silencioso: erro tipado, código e mensagem acionável; perda de dados sempre contada.
- **INV-06** Nenhum panic atravessa FFI. Nada de `unwrap`/`expect` em código de biblioteca sem uma invariante provada.
- **INV-07** Nunca bloquear o host (thread principal do Node, GIL, executor tokio).
- **INV-08** Sem vazamento de processo, fd ou handle, inclusive em caminhos de erro.
- **INV-09** Garantia honesta: cada linha do GUARANTEES tem teste ou KPI medido naquele OS.
- **INV-10** Os defaults são a escolha segura (seção 3).
- **INV-11** `unsafe` só em `sys/`, `pty/`, `sandbox/` e na fronteira FFI, sempre com `// SAFETY:`.
- **INV-12** Dependência nova só com aprovação do lead (allowlist no `AGENTS.md`).
- **INV-13** Testes de contrato são somente-leitura para quem implementa.
- **INV-14** Nenhum arquivo de código rastreado passa de 650 linhas (`scripts/file-size-guard.py`; documentos e dados ficam fora). Não há lista de exceções.
- **INV-16** A saída de um processo filho nunca é observada pelo reaper de SIGCHLD do tokio: usa `waitpid` bloqueante por filho ou pidfd (Linux ≥ 5.3). Motivo: o S3 (Q8) mediu travamento determinístico dentro de Node e Bun no Linux sem pidfd.
- **INV-15** Camadas do monolito: dependências só para baixo na tabela "Arquitetura interna"; nenhum módulo importa uma camada acima.

### 4.4 Quality standards globais (QS)

- **QS-01** Rust: `rustfmt`, `clippy -D warnings`, `#![deny(missing_docs)]`. Nenhum `#[allow]` sem justificativa aprovada.
- **QS-02** TS: `strict`, zero `any`, JSDoc com exemplo em `run`/`spawn`.
- **QS-03** Python: `.pyi` completos, `pyright --strict`, `ruff`.
- **QS-04** Testes sincronizam por marcadores do fixture, nunca por `sleep`.
- **QS-05** Mensagens de erro: o quê + valor + causa provável + correção.
- **QS-06** O diff toca só o write-set do WP. Commits convencionais.
- **QS-07** Código simples: sem abstração sem segundo uso, sem opção fora do contrato, sem teste sem valor.
- **QS-08** Tamanho de arquivo: ideal ≤400 linhas, ok até 600; entre 601 e 650 o guard avisa e a revisão pede o plano de divisão.

### 4.5 Definition of Done global (por WP)

- **D1** Itens de contrato do WP verdes localmente: macOS nativo + Linux via Docker; código Windows compila com `clippy --target x86_64-pc-windows-msvc`.
- **D2** Nenhum item de contrato que já estava verde regrediu.
- **D3** Gates reproduzidos a frio pelo lead.
- **D4** WPs do núcleo e dos bindings: QA rápido local (QA-A + QA-D) sem piora de K1, K2 e K5.
- **D5** Codex: veredito `pass` nos 5 campos do card e zero P0/P1.
- **D6** O lead faz mutation probe em 1 item do WP (quebra, vê vermelho, restaura).
- **D7** Só o write-set mudou (`git diff --name-only`).
- **D8** Doc e CHANGELOG atualizados se o comportamento público mudou.
- **D10** `python3 scripts/file-size-guard.py` verde (nenhum arquivo acima de 650) e nenhuma importação que viole as camadas (INV-15).
- **D9** O agente para em "branch `wp/<id>` empurrada, verde localmente, aguardando o lead". Quem integra no bundle é o lead.

Windows em runtime e os alvos arm64 são provados no CI do bundle. Uma falha lá volta para o WP dono do item.

---

## 5. Orquestração

### Papéis

| Quem | Faz | Não faz |
|---|---|---|
| **Lead** (sessão principal) | decide, congela o contrato, escreve briefs, verifica, integra bundles, roda o QA, mantém este plano | não implementa WP de produto; não aceita relato sem verificar |
| **Agentes Claude** | executam 1 WP cada, em worktree isolada | não decidem interface, não saem do write-set, não abrem PR, não mergeiam |
| **Codex** | revisa cada WP contra o card; revisa cada bundle nos seams; red team da sandbox | não escreve código de produto |
| **Stakeholder** (o usuário) | direção do produto, conversas com maintainers, aprovar publicação e mensagens externas em seu nome, waivers de rigor | aprovar decisões técnicas (isso é do lead) |

**Modelos:**
- **Opus:** WPs com OS nativo, concorrência ou FFI (S1, S2, W01, W03, W05, W06, W07, W09, W10, W12, W12w, W13, W15, Q1, S4, SB2–SB4, SB6).
- **Sonnet:** pesquisa, runners, empacotamento, docs (R1, R2, S3, W02, W14, W18, Q2, SB1).

### Ciclo de cada WP

1. **Pré-dispatch (V1 do lead):** zero decisão em aberto, write-set disjunto, contrato congelado, gates escritos, baseline fixado.
2. **Dispatch:** `Agent` com `isolation: "worktree"`, branch `wp/<id>`, brief no formato do Apêndice C. O agente dá push no primeiro commit que compila (é ponto de recuperação, e não dispara CI).
3. **Agente:** implementa, roda os gates locais, empurra e **para**.
4. **Lead L0:** HEAD descende do baseline, commit existe, lista de arquivos ⊆ write-set.
5. **Codex, contra o card** (Apêndice D): veredito nos 5 campos + achados. P0/P1 voltam ao mesmo agente (SendMessage) e o Codex revisa de novo.
6. **Landing no bundle (lead):** gates a frio, QA rápido quando aplicável, mutation probe, squash de `wp/<id>` em `bundle/B<n>` (1 commit por WP).
7. Atualizar a tabela de status (seção 8).

**Concorrência:** até 6 agentes ao mesmo tempo, e no máximo 3 WPs prontos esperando revisão.

### Economia de CI e PRs em bundle

- Branches `wp/*` e `bundle/*` **não disparam CI**. Os workflows rodam só em: `pull_request` não-draft para `main`, `push` em `main` e `workflow_dispatch`.
- Cada bundle é um PR `bundle/B<n> → main`, aberto em **draft**:
  - CI rápido quando marcado como pronto (3 OS × contrato Rust, ~10 min);
  - CI completo uma única vez, com o label `full`: 5 alvos × runtimes + instalação limpa + QA no Windows.
- `concurrency: cancel-in-progress`; filtros de caminho (mudança só de docs roda só o check de docs); `Swatinem/rust-cache`.
- **Local primeiro:** macOS nativo (esta máquina é x86_64), Linux via Docker, Windows compilado por `clippy --target`.
- **Windows sob demanda:** pipeline manual ou pela API no GitLab (`windows-2022`, Server 2022) com `TEST_FILTER`, para WPs com muito Windows.
- O merge do bundle usa rebase-merge, para cada WP continuar um commit próprio em `main`.
- O Codex revisa cada bundle uma vez, olhando só os seams entre WPs.

| Bundle | Conteúdo | CI |
|---|---|---|
| B0 | Fase 0: pesquisa + ADRs (só docs) | check de docs; cada spike tem um workflow próprio, disparado só por push no seu branch `spike/*` (o código do spike nunca entra em main) |
| B1 | Fundação: W00, W01, W02 | rápido |
| B2 | Núcleo: W03, W05, W06, W07, W09, W10 | rápido → completo |
| B3 | PTY: W12, W12w | rápido → completo |
| B4 | Linguagens + pacotes: W13, W15, W14 | completo |
| B5 | Docs + QA: W18, Q1, Q2 e correções vindas do QA | completo + QA Windows |
| B6 | Release: W21 | release |
| B7–B8 | Sandbox macOS/Linux (S4, SB1–SB4); Windows (SB6) | completo |

---

## 6. Ondas (DAG; a ordem é de integração, não uma barreira de dispatch)

```text
Fase 0   R1 · R2 · S1 · S2 · S3   (+ H0)          → WG0 gate (Owner assina)   [B0]
Fase 1   W00 (lead) → W01 · W02                                               [B1]
         → W03 · W04 · W05 · W06 · W10 → W07 → W09                            [B2]
         → W12 · W12w                                                         [B3]
         → W13 · W14   (W15 Python e publicação Rust no v0.2)                 [B4]
         → W18 · Q1 → Q2 → correções                                          [B5]
         → W21                                                                [B6]
Fase 2-3 S4 → SB1 → SB2 · SB3 → SB4 → SB6                                     [B7, B8]
```

---

## 7. Work packages

> Cada card tem **Completude** (itens que precisam ficar verdes), **Sucesso** (o que o usuário observa), **Invariantes**, **Qualidade** e **DoD**. Só aparece o que é específico do WP; as seções 4.3–4.5 valem sempre. O `scripts/plan-sections-check.py` falha se algum card não tiver um desses campos (PLAN-01).

### Fase 0: validação

#### H0 · Owner: decisões, conversas, aprovações
- **Quem:** você · **Depende:** — · **Escreve:** `docs/research/conversations.md`, `docs/partners/**`
- **Completude:** G0-05, REL-02. (UX-02 passou para o lead: D5/D12.)
- **Sucesso:** ≥5 conversas com dor, workaround, disposição de trocar e bloqueios; ≥2 partners em linguagens diferentes.
- **Invariantes:** nenhum dado pessoal além do nome do projeto.
- **Qualidade:** cada partner com medida antes/depois (código de plataforma removido, repros de bugs de Windows).
- **DoD:** registros commitados no B0 (conversas) e no B5 (partners).
- **Não fazer:** bloquear o build esperando as conversas.

#### R1 · Mapa de alternativas — *em execução*
- **Agente:** Sonnet · **Revisor:** Codex · **Depende:** — · **Escreve:** `docs/research/landscape.md`
- **Completude:** G0-01.
- **Sucesso:** tabela candidato × 22 comportamentos com links; a melhor combinação por linguagem; veredito: alguém chega a ≥80%?
- **Invariantes:** toda célula "sim" tem link; nada é instalado ou executado.
- **Qualidade:** só fontes primárias; status de manutenção de cada candidato.
- **DoD:** o Codex confere 30% das citações e o lead confere 10 sorteadas.
- **Não fazer:** propor arquitetura.

#### R2 · Evidência de dor — *em execução*
- **Agente:** Sonnet · **Revisor:** Codex · **Depende:** — · **Escreve:** `docs/research/pain.md`
- **Completude:** G0-02.
- **Sucesso:** contagem por repo × categoria em 8 agentes open source (TS, Python, Rust); top-10; fatia de issues de Windows; veredito por ecossistema.
- **Invariantes:** toda contagem é reproduzível pela query registrada; só leitura (nunca comentar).
- **Qualidade:** dedupe; classificação pelo corpo da issue.
- **DoD:** o lead reproduz 3 contagens e confere 5 classificações.
- **Não fazer:** contatar autores.

#### S1 · Spike: modelo de processo e ciclo de vida do host
- **Agente:** Opus · **Revisor:** Codex · **Depende:** repo · **Escreve:** `spikes/process/**` (branch, nunca vai para main), `docs/adr/0001-process-model.md`, `docs/adr/0002-host-exit.md`
- **Completude:** G0-03a. Responde com CI nos 3 OS:
  1. Job no Windows sem corrida (e se `std::process` basta, ou se é preciso `CreateProcessW` + quoting próprio de `.bat`).
  2. Jobs aninhados.
  3. Tier do encerramento gracioso no Windows.
  4. `setsid` vs `setpgid` e o limite de fuga.
  5. Cleanup quando o host morre, por OS.
  6. Ctrl-C/SIGTERM no host sem quebrar o tratamento de sinais do Node e do Python.
  7. Reuso de PID.
  8. Baseline de latência de spawn.
- **Sucesso:** o lead escreve o seam `sys` e o GUARANTEES de kill/host sem nenhuma dúvida aberta.
- **Invariantes:** toda afirmação tem execução em CI no OS correspondente; o código do spike é descartável.
- **Qualidade:** cada ADR traz decisão, alternativas rejeitadas, evidência e consequência para o contrato.
- **DoD:** o Codex confirma que a evidência sustenta a decisão; o lead abre 3 links de CI.
- **Não fazer:** PTY.

#### S2 · Spike: PTY
- **Agente:** Opus · **Revisor:** Codex · **Depende:** repo · **Escreve:** `spikes/pty/**` (branch), `docs/adr/0003-pty.md`
- **Completude:** G0-03b:
  1. `portable-pty` vs implementação própria.
  2. Travamento de EOF no ConPTY e versão mínima do Windows.
  3. `\x03` como Ctrl-C.
  4. Resize.
  5. Filho do ConPTY dentro do Job.
  6. Especificação do matcher que remove VT nos testes.
- **Sucesso:** o lead decide o desenho do W12/W12w e o matcher.
- **Invariantes:** toda afirmação tem execução em CI no OS correspondente.
- **Qualidade:** o ADR inclui uma amostra real da saída bruta do ConPTY.
- **DoD:** revisão do Codex no ADR; o lead abre 3 links de CI.
- **Não fazer:** emulador de terminal.

#### S3 · Spike: empacotamento e runtimes (leve, ~1 dia)
- **Agente:** Sonnet · **Revisor:** Codex · **Depende:** repo · **Escreve:** `spikes/packaging/**` (branch), `docs/adr/0004-packaging.md`
- **Completude:** G0-03c:
  1. napi-rs com pacotes por plataforma em Node 22/24, Bun e Deno (e as flags).
  2. Wheels abi3 `py310` para os 5 alvos, incluindo CPython 3.14.
  3. Runners de CI para os 5 alvos.
  4. Um runtime tokio por processo e a ponte com asyncio.
  5. Passo a passo de trusted publishing.
  6. Tamanhos e tempos de instalação.
- **Sucesso:** snippets de CI prontos para o W14 e a lista de dependências fechada.
- **Invariantes:** nada é publicado em registry.
- **Qualidade:** cada alvo com um link de CI de instalação limpa.
- **DoD:** revisão do Codex no ADR; o lead instala localmente o wheel e o pacote npm de macOS-x64.
- **Não fazer:** o binding real.

#### S5 · Spike: supervisor (ADR-0005)
- **Agente:** Opus · **Revisor:** Codex · **Depende:** ADR-0001/0002/0003 + revisões · **Escreve:** `spikes/supervisor/**` (branch), `docs/adr/0005-supervisor.md` (seção de evidência)
- **Objetivo:** provar que um processo supervisor, dono de todos os filhos, resolve o que as revisões rejeitaram nos ADRs 0001–0003 sem custar o KPI de overhead.
- **Completude:** G0-03d. Testes que **afirmam** o resultado e falham o CI se der errado, nos 3 OS:
  - spawn pelo supervisor (pipe e PTY), com passagem de fd/handle;
  - eventos de saída e `stop()` em árvore que resiste a SIGTERM;
  - morte do host de 7 formas, inclusive no meio do spawn;
  - host que ignora SIGCHLD ou colhe com `waitpid(-1)`;
  - sentinela de reuso de PID;
  - supervisor morto;
  - Ctrl+C no PTY do Windows sem tocar o host;
  - `ClosePseudoConsole` com um escritor teimoso e `graceMs` curto;
  - latência de spawn contra o stdlib no mesmo job, em hosts Node, Bun, Deno e CPython.
- **Sucesso:** o lead consegue congelar o seam `sys`/supervisor do W00 e refatiar W05/W06/W12/W12w sem nenhuma dúvida aberta.
- **Invariantes:** nenhum teste "só imprime"; cada afirmação tem um controle que falharia; o host nunca faz fork nem muda o estado de console ou de sinais.
- **Qualidade:** protocolo host↔supervisor documentado em ≤1 página; o supervisor tem uma thread só no Unix; o código do spike é descartável.
- **DoD:** CI verde **com asserções** nos 3 OS; o Codex revisa a evidência contra o ADR-0005; o lead abre 3 runs.
- **Não fazer:** otimizar; sandbox.

#### WG0 · Gate G0
- **Quem:** o lead redige, você assina · **Depende:** R1, R2, S1–S3 · **Escreve:** `docs/decisions/G0.md`
- **Completude:** G0-04.
- **Sucesso:** decisão explícita:
  - alternativa cobre ≥80% → parar;
  - ninguém trocaria → parar;
  - seguir só com dor confirmada em ≥2 ecossistemas.
- **Invariantes:** nenhum WP da Fase 1 é despachado antes da sua assinatura.
- **Qualidade:** cada critério cita a evidência.
- **DoD:** assinado e commitado no B0, junto com a lista de mudanças de contrato que vieram dos ADRs.
- **Não fazer:** "seguir com ressalvas" sem waiver.

### Fase 1: v0.1 (`exec` + `pty`, 3 linguagens)

#### W00 · Scaffold + contrato congelado (lead, não delegado)
- **Quem:** lead · **Depende:** G0, D5, ADR-0005 · **Escreve:**
  - `Cargo.toml` (`members = ["crates/*", "bindings/*"]`), `rust-toolchain.toml`;
  - `AGENTS.md` e `CLAUDE.md`;
  - `GUARANTEES.md`, `docs/protocol.md`, `conformance/SPEC.md`, `conformance/FIXTURE.md`;
  - `crates/hugr-omni/src/{lib.rs, types.rs, api/**, error/mod.rs}` (API pública documentada, corpos stub) e a fachada `mod.rs` de `spawn`, `process`, `io`, `pty` e `client`;
  - `crates/omni-proto/**` (tipos das mensagens congelados; o codec fica como stub);
  - `crates/omni-supervisor/src/main.rs` + as fachadas `mod.rs` de `unix`, `windows`, `pty_unix` e `pty_windows`;
  - `bindings/node/{index.d.ts,package.json,tsconfig.json,examples/quickstart.ts}` e um `index.js` stub carregável (o W13 o substitui);
  - `.github/workflows/{core,windows}.yml` (com build musl estático do supervisor), `.github/review/schema.json`.
- **Completude:** SCF-01 (compila nos 3 OS e no musl; os stubs retornam erro, nunca panic; `file-size-guard` e seus testes de dentes rodando no `core.yml`).
- **Sucesso:** qualquer WP pode ser despachado sem nenhuma pergunta de interface.
- **Invariantes:** contrato mínimo; DSL de cenários com ≤10 passos; protocolo com ≤1 página; hash do contrato registrado.
- **Qualidade:** doc pública escrita primeiro (README-driven); os quickstarts compilam.
- **DoD:** o Codex pergunta "isto é o mínimo? algum nome confunde?" sobre a API, o protocolo e os seams.
- **Não fazer:** implementar comportamento.

#### W01 · Fixture + contrato (cenários + runner Rust)
- **Agente:** Opus · **Revisor:** Codex (vacuidade) · **Depende:** W00 · **Escreve:** `crates/omni-fixture/**`, `conformance/scenarios/**`, `conformance/FIXTURE.md` (só acrescenta verbos), `crates/hugr-omni/tests/**`
- **Completude:** FIX-01 (os subcomandos do `FIXTURE.md`); ACC-01 (cada item do Apêndice A com um cenário vermelho, mais as suítes dos seams `sys`/`pty`).
- **Sucesso:** a suíte mostra o produto inteiro "faltando", promessa por promessa, em ~35 cenários.
- **Invariantes:** cada cenário falha pelo motivo certo; o fixture sincroniza por marcadores (`READY`); nenhum cenário além do Apêndice A.
- **Qualidade:** o nome do cenário começa pelo ID do item; o runner Rust tem ≤ ~300 linhas.
- **DoD:** baseline vermelho capturado; o Codex confirma, item a item, que o cenário pega uma implementação errada plausível.
- **Não fazer:** inflar a suíte com casos que o QA cobre melhor.

#### W02 · Runners TS e Python
- **Agente:** Sonnet · **Revisor:** Codex (vacuidade) · **Depende:** W00, W01 · **Escreve:** `bindings/node/test/**`, `bindings/python/tests/**`
- **Completude:** ACC-02: runner TS sem framework (Node/Bun/Deno) e os testes do item de idioma C-TS-01 (vermelhos; quem os torna verdes é o W13). O runner pytest e o C-PY-01 entram no v0.2.
- **Sucesso:** o mesmo `scenarios/*.json` roda nos 5 runtimes, e o número de cenários executados bate com o total.
- **Invariantes:** o runner só lê os cenários; `skipped` conta como falha.
- **Qualidade:** cada runner com ≤ ~300 linhas; a falha mostra cenário, passo e esperado vs obtido.
- **DoD:** tudo vermelho contra os stubs, pelo motivo certo.
- **Não fazer:** criar cenário.

#### W03 · Resolução, ambiente e erros
- **Agente:** Opus · **Depende:** W01 · **Escreve:** `crates/hugr-omni/src/spawn/**` (os itens SEAM do `mod.rs` ficam congelados), `crates/hugr-omni/src/error/messages.rs`
- **Completude:** C-SPAWN-01, C-SPAWN-03, C-ENV-01, C-ERR-01, C-ERR-02.
- **Sucesso:** `run("npm", …)` funciona igual nos 3 OS, e cada erro diz como consertar.
- **Invariantes:**
  - a busca usa o PATH final do filho;
  - chaves de env case-insensitive no Windows;
  - validação antes de qualquer syscall;
  - a resolução nunca executa nada.
- **Qualidade:** funções puras (sem spawn) para resolve e env; o lead lê todas as mensagens de erro.
- **DoD:** mutation probe do lead removendo o PATHEXT.
- **Não fazer:** cache de resolução; expansão de variáveis.

#### W04 · Canal e cliente do supervisor (lado host)
- **Agente:** Opus · **Depende:** W00 · **Escreve:** `crates/hugr-omni/src/client/**` (o codec já vem pronto e testado do W00)
- **Objetivo:** o host fala com o supervisor de forma segura sob concorrência, falha e reinício.
- **Completude:** PROTO-01 (suíte do canal: frames parciais, enxurrada de pedidos, par travado, vários waiters de `Stop`, reinício por geração, cliente herdado por fork recusado, bootstrap do Windows sem handle herdável).
- **Sucesso:** matar o supervisor no meio de 10 operações concorrentes faz todas falharem com `IO`, e o próximo spawn funciona.
- **Invariantes:** ADR-0005 R1, R2, R6, R7; o host nunca bloqueia a thread do runtime esperando o supervisor.
- **Qualidade:** a ida e volta de um spawn ≤ 0,2 ms no Linux (meta do K4); o codec é uma função pura testada à parte.
- **DoD:** o Codex revisa a linearização e o bootstrap; o lead mata o supervisor durante um flood e confere.
- **Não fazer:** lógica de processo (isso fica no supervisor e no `process/`).

#### W05 · Supervisor Unix
- **Agente:** Opus · **Depende:** W00, W01 · **Escreve:** `crates/omni-supervisor/src/unix/**`, `crates/omni-supervisor/tests/unix*.rs` (+ helpers em `tests/common/`)
- **Objetivo:** criar, conter, parar e colher processos no Linux e no macOS, sem nunca atingir um processo errado.
- **Completude:** SUP-U (suíte do supervisor no Linux, macOS e Linux musl: spawn por `posix_spawn` com `SETSID` e só os fds de stdio; `Stop` com prazo único sobre a sessão; pin até a sessão esvaziar; inventário que distingue incompleto de vazio e responde `List` com o que o `Stop` alcançaria; fallback sem pidfd; morte do host de 7 formas, inclusive no meio do spawn; sentinela de reuso de PID; `Release` com descendentes resistentes em outros grupos, mais um controle só-grupo).
- **Sucesso:** `stop()` nunca deixa sobrevivente na sessão e nunca toca em processo alheio.
- **Invariantes:** ADR-0005 R1, R3, R4, R5, R8, R10; o supervisor tem uma thread só; toda syscall é checada.
- **Qualidade:** `// SAFETY:` em todo `unsafe`; stop-all com um inventário e um prazo compartilhados.
- **DoD:** suíte verde nos 3 alvos Unix do CI; o Codex revisa identidade de processos e corridas; o lead faz mutation probe trocando "sessão" por "grupo".
- **Não fazer:** abrir e configurar o terminal (`pty_unix`, que é do W12; o fork, o hold até o `Go` e o exec da raiz PTY são deste WP); I/O de saída (fica no host).

#### W06 · Supervisor Windows
- **Agente:** Opus · **Depende:** W00, W01 · **Escreve:** `crates/omni-supervisor/src/windows/**`, `crates/omni-supervisor/tests/windows*.rs`
- **Objetivo:** o filho nasce dentro do Job, a linha de comando é segura, e o Ctrl-Break sai do console do supervisor, nunca do host.
- **Completude:** SUP-W (suíte do supervisor no Windows 11 e no Server 2022: `CreateProcessW` + `JOB_LIST`; quoting igual ao do std, com testes diferenciais contra o `std::process`; `.cmd`/`.bat` seguros ou recusados; CTRL_BREAK gracioso e forçado via Job; `List` a partir dos membros do Job; morte do host; supervisor morto mata as árvores), C-SPAWN-02.
- **Sucesso:** argumentos chegam idênticos, `.bat` nunca vira injeção, e o estado de console do host não muda.
- **Invariantes:** ADR-0005 R1, R5, R7; nunca usar breakaway; handles fechados em todos os caminhos.
- **Qualidade:** o quoting cita o commit do std de onde foi portado, e o diferencial roda no CI.
- **DoD:** suíte verde no `windows.yml`; o Codex tenta achar uma entrada que vire comando.
- **Não fazer:** criar e fechar o ConPTY (`pty_windows`, que é do W12w; o `CreateProcessW` com o atributo `PSEUDOCONSOLE` é deste WP).

#### W06b · Stop no Windows sob o runner do GitLab
- **Agente:** Opus · **Depende:** W06, B3 · **Escreve:** `crates/omni-supervisor/src/windows/**`, `crates/omni-supervisor/tests/windows*.rs`
- **Objetivo:** o prazo único do stop vale no Windows também numa máquina lenta e sem console visível, e o teste da árvore que se reproduz entre as varreduras passa ali.
- **Completude:** SUP-W no runner Windows do GitLab (Server 2022): `stopped_arrives_only_once_every_member_is_gone_even_ones_born_between_polls` verde em 3 pipelines seguidos.
- **Sucesso:** a causa das duas falhas observadas é nomeada com evidência (CTRL_BREAK que não chega à raiz; stop de graça 2000 ms que levou 5230 ms) e corrigida no supervisor ou declarada no GUARANTEES com o limite medido.
- **Invariantes:** ADR-0005 R1, R2, R5; o prazo do stop é um só para a árvore inteira; nunca breakaway; nada de afrouxar asserção sem decisão do lead.
- **Qualidade:** diagnóstico mínimo e removível; a correção cita a evidência do log.
- **DoD:** 3 pipelines Windows verdes seguidos (o lead dispara); o Codex revisa a mudança.
- **Não fazer:** mexer no `pty_windows` ou fora do supervisor.

#### W18b · Atritos do Q2 (docs e tipagem)
- **Agente:** Sonnet · **Depende:** W18, Q2 · **Escreve:** `README.md`, `bindings/node/README.md`, `docs/guide/**`, `bindings/node/index.d.ts` (só a tipagem do resultado por `text`, decisão do lead), `bindings/node/test/overloads.ts`
- **Completude:** os atritos da tabela de `docs/ux/Q2-cold-users-v0.1.md`.
- **Sucesso:** um usuário novo acha `env`, `inheritEnv`, `cwd`, `stdin`, `mergeStderr`, a leitura do resultado e um shell no terminal sem abrir o `index.d.ts`; `r.stdout.trim()` compila quando `text` não é `false`.
- **Invariantes:** nenhuma mudança de comportamento; o binding em runtime fica igual; o surface-check e o readme-check continuam verdes.
- **Qualidade:** cada receita nova é código que roda no readme-check; o README continua curto.
- **DoD:** o Q2 roda de novo com agentes novos e os atritos somem.
- **Não fazer:** mudar a API em runtime.

#### W07 · Child: kill de árvore e saída
- **Agente:** Opus · **Depende:** W04, W05, W06 · **Escreve:** `crates/hugr-omni/src/process/**`, exceto `deadline.rs` e `run.rs` (do W09)
- **Completude:** C-KILL-01, C-KILL-02, C-KILL-03, C-EXIT-01, C-PROC-01, C-SCOPE-01.
- **Sucesso:** depois de `stop()` nada sobra, mesmo que a raiz já tenha morrido e só restem netos.
- **Invariantes:** `kill` idempotente; `drop` não bloqueia; `wait` tem uma fonte única de verdade; `Exit` vem de uma função pura.
- **Qualidade:** zero `cfg`; a precedência de `reason` documentada no código.
- **DoD:** QA rápido local com K1 = 0; mutation probe do lead removendo a etapa de força.
- **Não fazer:** timeout e cancelamento.

#### W09 · Supervisão: timeout, cancelamento, host
- **Agente:** Opus · **Depende:** W07 · **Escreve:** `crates/hugr-omni/src/process/{deadline,run}.rs` (seam `refuse_if_cancelled`/`arm` congelado pelo lead em `2899b13`, já chamado por `spawn_pipe` e `spawn_pty`)
- **Completude:** C-TMO-01, C-TMO-02, C-HOST-01 (host Rust), C-RS-01, C-RS-02 (todos os cenários via API Rust; a prova nos 5 alvos vem no CI completo do B2).
- **Sucesso:** timeout e cancelamento nunca deixam nada para trás; o host sair limpa tudo, no tier declarado.
- **Invariantes:** cada waiter resolve exatamente uma vez; a limpeza na morte do host é do supervisor (ADR-0005), não do host; nada bloqueia o executor.
- **Qualidade:** uma máquina de estados explícita, sem flags espalhadas.
- **DoD:** QA-E local (200 comandos com cancelamentos) com K1 = K2 = 0; o Codex revisa corridas.
- **Não fazer:** instalar handler de sinal ou hook de saída no host (ADR-0005 §9).

#### W10 · IO + `run()`
- **Agente:** Opus · **Depende:** W01 (o `run` integra com W07) · **Escreve:** `crates/hugr-omni/src/io/**`
- **Completude:** C-IO-01, C-IO-02, C-IO-03, C-IO-04, C-RUN-01.
- **Sucesso:** ler só o começo da saída de um dev server não o congela; `run()` resolve o caso de 80% numa linha.
- **Invariantes:**
  - buffer de 1 MiB sem consumidor, com descarte contado;
  - backpressure sem perda quando há consumidor;
  - UTF-8 com estado entre chunks;
  - EPIPE vira `CLOSED`;
  - nada se perde no exit.
- **Qualidade:** `run` é composição de `spawn` + coleta (≤ ~150 linhas).
- **DoD:** QA-D local (flood, stdin, pipe herdado) com K2 = K5 = 0.
- **Não fazer:** parsing de linhas; strip de ANSI.

#### W12 · PTY no Unix + lado host
- **Agente:** Opus · **Depende:** W04, W05, W10, ADR-0003/0005 · **Escreve:** `crates/omni-supervisor/src/pty_unix/**`, `crates/hugr-omni/src/pty/**` e, em `process/child.rs`, os corpos de `spawn_pty` (mantendo `refuse_if_cancelled` e chamando `deadline::arm` depois do start) e `PtyChild::resize`
- **Objetivo:** terminal interativo no Linux e no macOS, sem perder saída e sem travar.
- **Completude:** PTYSYS-U, C-PTY-01, C-PTY-02, C-PTY-03, C-PTY-04.
- **Sucesso:** um agente roda `bash` ou `python` interativo, redimensiona, manda Ctrl-C e encerra; um programa que imprime e sai na hora entrega 300/300 saídas no macOS.
- **Invariantes:** `/dev/ptmx` com `O_CLOEXEC`; `ptsname_r` / `TIOCPTYGNAME` (nunca `ptsname`); `Go` só depois que o leitor do host está rodando (ADR-0005 R9); a sessão é a unidade de kill.
- **Qualidade:** a comparação de saída usa o texto exato do fixture; o normalizador de VT só entra em fixtures de texto simples.
- **DoD:** a suíte no Linux e no macOS; o lead faz mutation probe removendo o `Go` e vê o controle perder saída.
- **Não fazer:** emulador de terminal.

#### W12w · ConPTY no supervisor
- **Agente:** Opus · **Depende:** W06, ADR-0003/0005 · **Escreve:** `crates/omni-supervisor/src/pty_windows/**`, `crates/omni-supervisor/tests/windows_pty*.rs` e o roteamento do PTY em `src/windows/spawn.rs`
- **Completude:** PTYSYS-W.
- **Sucesso:** um escritor teimoso com `graceMs` = 1000 termina dentro do prazo no Windows 11 e no Server 2022, e o host nunca muda o estado de console.
- **Invariantes:** flags 0, ponta do PTY fechada, handles padrão nulos explícitos; `ClosePseudoConsole` num worker com prazo independente; o filho nasce no Job.
- **Qualidade:** o caminho do ConPTY documentado passo a passo no código; o vazamento de handle em builds < 26100 medido e declarado no GUARANTEES.
- **DoD:** 200 execuções verdes no `windows.yml` nos dois builds; o Codex revisa a ordem de fechamento.
- **Não fazer:** Unix.

#### W13 · Binding Node/Bun/Deno
- **Agente:** Opus · **Depende:** B2, B3 · **Escreve:** `bindings/node/{src,lib}/**` (Rust dividido em `child`, `run`, `error`, `convert`), `bindings/node/{index.js,Cargo.toml,build.rs}`, a linha `members` do `Cargo.toml` da raiz
- **Completude:** C-TS-01 (idiomas e host TS), C-TS-02 (todos os cenários via TS em Node 22/24, Bun e Deno).
- **Sucesso:** os quickstarts TS da seção 3 rodam como estão escritos, nos 3 runtimes.
- **Invariantes:** zero lógica de processo em JS; o GC nunca mata o filho; nenhum handler de sinal nem hook de saída no host (ADR-0005 §9): na morte do host, quem limpa é o supervisor.
- **Qualidade:** wrapper JS com ≤ ~200 linhas; `index.d.ts` intocado; zero `any`.
- **DoD:** QA-A, QA-B e QA-E em Node locais com K1 = K2 = 0; o Codex revisa a fronteira FFI.
- **Não fazer:** mexer em `package.json` (é do W14).

#### W15 · Binding Python (v0.2)
- **Agente:** Opus · **Depende:** B2, B3 · **Escreve:** `bindings/python/src/**` (Rust dividido em `child`, `run`, `error`, `convert`), `bindings/python/python/hugr_omni/{__init__,aio}.py`
- **Completude:** C-PY-01 (idiomas e host Python), C-PY-02 (todos os cenários via Python sync e aio, em 3.10 e 3.14).
- **Sucesso:** os quickstarts Python rodam como estão escritos.
- **Invariantes:** o GIL é solto em toda espera; `KeyboardInterrupt` e cancelamento matam a árvore e propagam; `.pyi` intocados.
- **Qualidade:** wrapper com ≤ ~200 linhas; `pyright --strict` limpo.
- **DoD:** QA-A, QA-B (Flask com reloader) e QA-E em Python locais com K1 = K2 = 0; o Codex revisa GIL e FFI.
- **Não fazer:** mexer em `pyproject.toml`.

#### W14 · Empacotamento (npm, PyPI, crates.io)
- **Agente:** Sonnet · **Depende:** W00, ADR-0004 · **Escreve:** `bindings/node/{package.json,npm/**}`, `bindings/python/pyproject.toml`, `crates/hugr-omni/examples/**` (os jobs de CI vão para o `.gitlab-ci.yml`, que é do lead: o WP entrega os comandos)
- **Completude:** C-PKG-01 — no v0.1, só npm (Node/Bun/Deno), e cada pacote de plataforma leva o `hugr-omni-supervisor` (musl estático no Linux); PyPI e crates.io entram no v0.2.
- **Sucesso:** K9 = 100%: instalação limpa nos 5 alvos × npm/bun/deno (v0.1), hello em < 30 s. Snippets prontos no ADR-0004.
- **Invariantes:** nenhum `postinstall` que compile ou baixe; nenhuma sdist que compile de surpresa.
- **Qualidade:** mensagem clara para plataforma não suportada; metadados completos nos 3 registries.
- **DoD:** `npm pack`, wheel e `cargo publish --dry-run` instalados em runner limpo (no CI completo do B4).
- **Não fazer:** publicar.

#### W18 · Docs + checks de paridade e garantias
- **Agente:** Sonnet · **Depende:** B4 · **Escreve:** `README.md`, `*/README.md`, `docs/guide/**`, `scripts/{readme-check,surface-check,guarantees-check}/**` (CI: comandos entregues ao lead para o `.gitlab-ci.yml`)
- **Completude:** C-DOC-01, C-PAR-01, C-GUA-01, C-ARC-01.
- **Sucesso:** um dev entende e usa em 5 minutos; o README abre com TS e mostra os números do QA contra o stdlib.
- **Invariantes:** todo bloco de código roda no CI; um check que não consegue ler sua entrada falha alto.
- **Qualidade:** guia "receitas para agentes" (dev server, testes com timeout, terminal, cleanup); cada check com um teste de dentes.
- **DoD:** o Codex lê como usuário novo e lista o que confundiu; o lead injeta uma violação de paridade e vê o check falhar.
- **Não fazer:** site de docs.

#### Q1 · Harness de QA + KPIs
- **Agente:** Opus · **Depende:** W00 (o harness começa contra o stdlib e liga no omni quando o B2 entra) · **Escreve:** `qa/**` (CI: comandos entregues ao lead para o `.gitlab-ci.yml`)
- **Completude:** QA-01: workloads QA-A..E rodando em Rust e TS no v0.1 (Python no v0.2), com omni e com o baseline stdlib (`std::process`, `child_process`); relatório K1–K8 por OS em JSON + Markdown.
- **Sucesso:** um comando (`qa/run --quick` ou `--full`) devolve a tabela de KPIs, omni vs stdlib, em macOS (local), Linux (Docker local e CI) e Windows (CI do GitLab).
- **Invariantes:** a contagem de órfãos é medida pelo OS (árvore de processos real), nunca inferida; os repos dos workloads são fixados por commit e rodam sem rede.
- **Qualidade:** quick ≤ 5 min local; full ≤ 30 min por OS; um relatório legível por humano.
- **DoD:** o lead roda o quick, injeta um órfão de propósito e vê K1 falhar (teste de dentes).
- **Não fazer:** dashboard; histórico em banco.

#### Q2 · Usuário frio (K10)
- **Quem:** o lead despacha agentes Sonnet novos, só com o README (v0.1: TS; v0.2: Python e Rust) · **Depende:** W18 · **Escreve:** `docs/ux/**`
- **Completude:** UX-01.
- **Sucesso:** 15/15 tarefas; mediana até o primeiro sucesso ≤ 5 min. Cada atrito vira um WP de correção, e o teste roda de novo com agentes novos.
- **Invariantes:** os agentes nunca veem código, plano ou conversa.
- **Qualidade:** cada atrito classificado (bloqueante, incômodo, nenhum), com a transcrição resumida.
- **DoD:** você assina o relatório.
- **Não fazer:** dar dicas além do README.

#### W21 · Release v0.1
- **Quem:** o lead prepara, **você aprova a publicação** · **Depende:** B5 verde, KPIs no alvo, trusted publishing, REL-02 · **Escreve:** `.github/workflows/release.yml`, `CHANGELOG.md`, `RELEASING.md`
- **Completude:** C-REL-01.
- **Sucesso:** uma tag publica as 3 linguagens na mesma versão; smoke pós-publicação verde nos 5 alvos.
- **Invariantes:** nenhum token de longa duração; release reproduzível a partir da tag.
- **Qualidade:** CHANGELOG escrito para usuários.
- **DoD:** passe de risco do lead (o que é mock, o que depende de humano, qual o pior caso) e QA full com todos os KPIs no alvo; sua aprovação antes do push da tag.
- **Não fazer:** publicar sem sua aprovação na hora.

### Fases 2–3: sandbox (detalhes re-planejados depois do S4)

#### S4 · Spike: sandbox macOS/Linux + threat model
- **Agente:** Opus · **Revisor:** Codex (red team) · **Depende:** v0.1 · **Escreve:** `spikes/sandbox/**` (branch), `docs/adr/0006-sandbox.md`
- **Completude:** SBX-00:
  - Seatbelt (incluindo o status de deprecated do `sandbox-exec`);
  - Landlock vs namespaces vs bubblewrap, com as restrições de distro;
  - caminhos de sistema sempre legíveis;
  - threat model, com o que está fora do escopo.
- **Sucesso:** o lead congela o contrato `sandbox` sem nenhuma dúvida.
- **Invariantes:** fail-closed desde o desenho.
- **Qualidade:** threat model com exclusões explícitas.
- **DoD:** o Codex tenta derrubar o threat model até ficar sem achados.
- **Não fazer:** Windows.

#### SB1 · Política, plumbing e bindings
- **Agente:** Sonnet · **Depende:** S4 · **Escreve:** `crates/hugr-omni/src/sandbox/{mod,policy}.rs` (fachada + política), `bindings/*/src/sandbox.rs`
- **Completude:** C-SBX-01.
- **Sucesso:** o dev escreve a política uma vez e ela vale igual com ou sem PTY, nas 3 linguagens.
- **Invariantes:** fail-closed absoluto; política inválida nunca vira política mais fraca.
- **Qualidade:** a política é um tipo de dados simples, sem DSL.
- **DoD:** mutation probe removendo a checagem de disponibilidade.
- **Não fazer:** regras por syscall ou por porta.

#### SB2 · Backend macOS
- **Agente:** Opus · **Depende:** SB1 · **Escreve:** `crates/hugr-omni/src/sandbox/macos.rs`
- **Completude:** C-SBX-02.
- **Sucesso:** um agente no macOS não escreve fora do repo nem acessa a rede quando a política proíbe, e o permitido funciona.
- **Invariantes:** o perfil é gerado com escaping correto; nenhum caminho do usuário entra cru no perfil.
- **Qualidade:** perfil legível.
- **DoD:** o Codex procura injeção no perfil.
- **Não fazer:** expor Seatbelt cru na API.

#### SB3 · Backend Linux
- **Agente:** Opus · **Depende:** SB1 · **Escreve:** `crates/hugr-omni/src/sandbox/linux/**`
- **Completude:** C-SBX-03.
- **Sucesso:** a mesma política dá o mesmo resultado que no macOS.
- **Invariantes:** detecção de suporte antes do spawn; se faltar algo, `SANDBOX_UNAVAILABLE`.
- **Qualidade:** o CI inclui uma distro com restrição de user namespaces.
- **DoD:** o Codex revisa a ordem de aplicação das restrições.
- **Não fazer:** binário externo sem decisão no ADR.

#### SB4 · Suíte de fuga independente
- **Agente:** Opus, que **não** implementou backend nenhum, + Codex como red team · **Depende:** SB2, SB3 · **Escreve:** `crates/hugr-omni/tests/sandbox_escape/**`
- **Completude:** C-SBX-04.
- **Sucesso:** toda tentativa das categorias do threat model é bloqueada.
- **Invariantes:** a suíte é escrita a partir do threat model, sem ler os backends.
- **Qualidade:** cada tentativa documenta o que tentou e por que deveria falhar.
- **DoD:** o Codex propõe tentativas extras até ficar sem ideias.
- **Não fazer:** corrigir backend.

#### SB6 · Windows (spike S5 + backend)
- **Agente:** Opus · **Depende:** SB1 · **Escreve:** `crates/hugr-omni/src/sandbox/windows/**`, `docs/adr/0007-sandbox-windows.md`
- **Completude:** C-SBX-05.
- **Sucesso:** o GUARANTEES mostra exatamente o que o Windows bloqueia, e cada linha tem teste.
- **Invariantes:** o que não for garantido vira `SANDBOX_UNAVAILABLE`.
- **Qualidade:** o tier é explicado em linguagem de usuário.
- **DoD:** começa pelo spike (decisão de seguir ou não registrada no ADR); Codex como red team.
- **Não fazer:** prometer paridade com macOS/Linux.

---

## 8. Status (âncora viva)

| WP | Estado | Branch / PR | Notas |
|---|---|---|---|
| R1 | concluído | `docs/research/landscape.md` | processkit 81,8% no papel |
| R2 | concluído + verificado | `docs/research/pain.md` | dor nos 3 ecossistemas (teto, não medida) |
| P0 | concluído | `docs/research/processkit-fit.md` | 1 de 24 itens como está |
| E1 | concluído (macOS + Linux parcial) | `spike/processkit-eval` | Windows não medido (billing) |
| Codex | concluído | `docs/research/processkit-audit.md` | "build on it with fixes" |
| S3 | concluído (local) | `spike/packaging` · ADR-0004 | Q8: wait do processkit trava sob Node/Bun no Linux sem pidfd |
| WG0 | **assinado: B** | `docs/decisions/G0.md` | TS no v0.1; Python e Rust no v0.2 |
| S5 | concluído · revisado | `spike/supervisor` · ADR-0005 **aceito** | 9/10 testes com asserção nos 4 alvos; T9 resolvido por `posix_spawn` + novo K4 |
| W00 | **concluído · na `main`** (PR #2, CI verde nos 3 OS + musl) | `main` `ee40167` | workspace de 4 crates compilando (macOS, Windows clippy, Linux); seams congelados: API, protocolo v1, spawn/client, supervisor; `processes()` entrou no contrato |
| W03 | **no `bundle/B2`** (Codex: aprovado na rodada 3; probe do PATHEXT vermelho) | `75e8e90` | C-SPAWN-01/03, C-ENV-01, C-ERR-01/02 provados por 22 testes unitários; ponta a ponta com o B2 |
| W06 | **no `bundle/B2`** (Codex: aprovado na rodada 4; probe do quoting vermelho no Windows) | `031eb1b` | SUP-W + C-SPAWN-02 verdes em Server 2025 (26100) e 2022 (20348) |
| W04 | **no `bundle/B2`** (Codex: aprovado na rodada 4; probe `bInheritHandles=1` vermelho no Windows) | `ac5c023` | PROTO-01 verde em macOS, Linux e Windows; a prova do lead "matar o supervisor durante um flood" com o supervisor real fica para quando o W05 entrar |
| W05 | **no `bundle/B2`** (Codex: aprovado na rodada 6; probe sessão→grupo vermelho; o gate a frio sob carga achou a corrida de membro saindo no macOS, corrigida) | `a44901c` | SUP-U verde em macOS (também sob carga), Linux --privileged e musl estático |
| Q2 | **feito** (aguarda a assinatura do Owner em `docs/ux/Q2-cold-users-v0.1.md`) | — | 15/15 na primeira vez, mediana ≈ 0,1 min, nenhum bloqueio; rodada repetida com 3 agentes novos em TypeScript estrito: 15/15; atritos corrigidos no W18b e em 747c8c0/7b93599 |
| W18b | **no `bundle/B4`** (revisor Claude: aprovado na rodada 2) | squash | atritos do Q2: tipagem da saída por `text` (compatível com a anterior), receitas de ambiente, `cwd`, stdin, stderr, leitura do resultado e bash no terminal; `@types/node` no readme-check; CommonJS no README |
| W18 | **no `bundle/B4`** (revisor Claude: aprovado na rodada 3, depois de 2 rodadas do Codex; regra de escopo: as checagens pegam deriva honesta, não evasão deliberada) | squash | README com TS na frente e a tabela de QA (macOS, preliminar); receitas para agentes; surface-check (paridade TS+Rust, arquitetura), guarantees-check e readme-check, todos com testes de dentes (84); probe do lead (opção renomeada) vermelho |
| Q1 | **no `bundle/B4`** (Codex: aprovado na rodada 14; regra do lead: contar com qualquer evidência, matar só com evidência forte reconfirmada) | squash | harness QA-A..E em Rust e TS, omni vs stdlib, K1–K8 em JSON + Markdown; quick macOS ~4 min: omni K1 0, K2 0, K3 p95 ≤ 25 ms, K5 0, K6 Δ 0, K7 0; std: K1 4–10, travas; K4 do Rust no Mac carregado fora (registrado, não decide); Windows só em teste unitário até o CI |
| W14 | **no `bundle/B4`** (Codex: aprovado na rodada 3) | squash | npm: pacote principal + 5 de plataforma (addon + supervisor ao lado, Linux com glibc 2.17 e supervisor musl estático), sem scripts; K9 ok em npm/bun/deno no darwin-x64 e no linux-x64-gnu (Docker); darwin-arm64, linux-arm64 e win32 ficam para o CI |
| W13 | **no `bundle/B4`** (Codex: aprovado na rodada 2; probes: finalizador que solta o Child e erro N-API, vermelhos) | squash | binding napi-rs: idioms 19/19, contrato 37/37 (ledger vazio) e teeth 29/29 em Node 22/24, Bun e Deno (macOS); QA-A 12/12, QA-B 18/18 (Vite), QA-E 200/200, K1 = K2 = 0; quickstart roda em Node 24, Bun e Deno |
| W06b | **no `bundle/B4`** (Codex: aprovado na rodada 1) | squash | stop do Windows sob o runner do GitLab: 3 pipelines Windows verdes seguidos; força repetida até o Job esvaziar; folga pós-morte do host 5 s; desmontagem medida (840 ms para 875 processos) declarada no GUARANTEES |
| W09 | **no `bundle/B3`** (Codex: aprovado na rodada 6, depois de 6 corridas reais corrigidas; probes do lead e do agente vermelhos) | squash | C-TMO-01/02, C-HOST-01 (6 formas de morte do host), C-RS-01/02 verdes; contrato 36/36 no macOS e no Linux; QA-E: 200 comandos, K1 = K2 = 0; ledger vazio |
| W12 | **no `bundle/B3`** (Codex: aprovado na rodada 2; probes TIOCSCTTY e O_CLOEXEC vermelhos; DoD do `Go` por evidência, Apêndice E) | `a02c6c8` | PTYSYS-U verde no macOS e no Linux; C-PTY-02/04 verdes; `bash` e `python3` interativos com resize e Ctrl-C; 300/300 no controle de imprimir e sair |
| W10 | **no `bundle/B3`** (Codex: aprovado na rodada 3; 5 furos de perda corrigidos) | `bc08537` | C-IO-02/03 verdes no contrato; QA-D local: flood de 50 MiB = 16 recebidos + 34 descartados e contados, stdin 10 MiB idêntico, pipe herdado termina quando o dono fecha; K2 = K5 = 0 |
| W07 | **no `bundle/B3`** (Codex: aprovado na rodada 2; probes: etapa de força removida e `Child::drop` vazio, vermelhos) | `3876315` | C-KILL-01/02/03, C-PROC-01 e C-SCOPE-01 verdes; contrato 12 passed / 24 pending no macOS; frios verdes no macOS e no Linux (Docker) |
| W02 | **no `bundle/B3`** (Codex: aprovado na rodada 3; probe do matcher frouxo vermelho no teeth) | `02ed8f5` | runner TS sem framework: 37 cenários no macOS/Linux, 39 no Windows; teeth 29/29 em Node e Bun; idiomas do C-TS-01 (com ciclo de vida do host) vermelhos até o W13; Deno não rodado localmente |
| W12w | **no `bundle/B3`** (Codex: aprovado na rodada 2; probe do fechamento síncrono vermelho no 20348 e verde no 26100, como previsto) | `9f6c403` | PTYSYS-W verde em 26100 e 20348 (run 37067122812): escritor teimoso parado em 1005–1025 ms com graça de 1000; 200 sessões sem perda; vazamento de handle 0/sessão no 26100 e 1/sessão no 20348 (declarado no GUARANTEES) |
| W01 | **no `bundle/B2`** (Codex: aprovado na rodada 5; mutantes da referência pegos pelo lead) | `0a453ef` | fixture + 43 cenários + runner Rust; linha base `contract: 0 passed, 36 pending, 0 failed` em macOS e Linux |
| B0 | PR aberto | `bundle/B0` | pesquisa + ADR-0004 + G0; citações do R1 conferidas (12 ok, 8 parciais, 0 erradas) |
| S1, S2 | concluídos · revisados | ADR-0001/0002/0003 | Codex: *reject* como base de produto → ADR-0005 |
---

## 9. Riscos

| Risco | Resposta |
|---|---|
| Alternativa já existe (R1 ≥ 80%) | parar no G0 e contribuir com ela |
| Gracioso fraco no Windows | tier declarado; a força após `graceMs` continua garantida |
| Host morto à força no macOS/Linux | declarado no GUARANTEES; nada de prometer o que o OS não dá |
| ConPTY trava no EOF | W12w tem meta de 200/200; sem isso não há release |
| Falha só no Windows descoberta tarde (bundle) | Windows sob demanda (runner self-hosted) para WPs com muito Windows; atribuição pelo ID do item |
| Fila de revisão do lead | máximo de 3 WPs esperando; parar de despachar até baixar |

---

## Apêndice A · Contrato (~35 itens) e itens de gestão

Ver `docs/acceptance.md`.

## Apêndice B · Layout do repo

```text
Cargo.toml  AGENTS.md  CLAUDE.md  GUARANTEES.md  PLAN.md
conformance/{SPEC.md, FIXTURE.md, scenarios/*.json}
crates/hugr-omni/src/{lib.rs, api/, error/, spawn/, process/, io/, pty/, client/}   crates/hugr-omni/{tests/, examples/}
crates/omni-proto/   crates/omni-supervisor/src/{main.rs, unix/, windows/, pty_unix/, pty_windows/}
crates/omni-fixture/
bindings/node/{src/, lib/, index.d.ts, npm/, test/}
bindings/python/{src/, python/hugr_omni/, tests/}
qa/  scripts/  docs/{adr,research,decisions,guide,ux,partners}/  .github/{workflows,review}/
```

## Apêndice C · Template do brief

```text
RELAY-ARM:<token>                      (se o hook do relay estiver ligado)
WP <id> — <título>                     modelo: <opus|sonnet>
STEP 0  EXPECTED_BASELINE=<sha>; aborte se o HEAD não descender dele. Ecoe BASELINE_VERIFIED.
BRANCH  wp/<id> (já criada na sua worktree). Push no primeiro commit que compila.
ALVO    arquivos que você ESCREVE (só estes): <lista>
LEIA    (nesta ordem, nada além): <caminhos + linhas>
CONTRATO <trecho congelado, verbatim>
CARD    <o card inteiro do WP, verbatim: Completude, Sucesso, Invariantes, Qualidade, DoD, Não fazer>
ITENS   <id — promessa — cenário> (vermelho agora; faça ficar verde; testes são somente-leitura)
ARMADILHAS nunca `git add -A`; stage por nome; `git diff --name-only <baseline>...HEAD` antes de cada push;
           dependência nova = pare e pergunte; não abra PR.
GATES   python3 scripts/file-size-guard.py · cargo fmt --check · cargo clippy --all-targets -- -D warnings ·
        cargo clippy --target x86_64-pc-windows-msvc -- -D warnings · cargo test -p hugr-omni <filtro> ·
        scripts/linux-docker cargo test -p hugr-omni <filtro> · <gates do card, ex.: qa/run --quick>
PARE    em "branch wp/<id> empurrada, verde localmente, aguardando o lead". Você não integra nem abre PR.
RETORNO (exatamente isto):
  WP <id> · branch wp/<id> · head <sha> · BASELINE_VERIFIED <sha>
  ITENS    <id> verde [macos|linux|win-compile] ...
  GATES    <cmd> → <última linha>
  KPI      <se o card pede QA: K1/K2/K5 = …>
  ARQUIVOS <lista>
  ERREI NO BRIEF? <1–3 linhas>
```

## Apêndice D · Revisão Codex contra o card

```bash
codex exec -s read-only -C "$WORKTREE" --ephemeral \
  --output-schema .github/review/schema.json -o "$REVIEWS/$WP-r$N.json" - < "$REVIEWS/$WP-prompt.md"
```

Prompt (gerado pelo lead por WP e por rodada):

```text
ROLE: independent, adversarial reviewer for hugr-omni. You did not write this change; assume it is wrong
until the diff and its evidence prove otherwise.
SCOPE: `git diff <baseline>...HEAD` in this worktree. Read-only commands only.
THE CARD (the axioms this work is judged against, verbatim): <card do WP>
GLOBAL INVARIANTS / QUALITY: <seções 4.3 e 4.4 verbatim>   GLOSSARY: <docs/glossary.md>
FOR EACH CARD FIELD return pass|fail with concrete evidence (file:line or command output):
  completude  — every owned item is implemented and its scenario genuinely exercises it
  sucesso     — the user-visible outcome the card promises is actually delivered
  invariantes — every card invariant and global INV holds, including on error paths
  qualidade   — card quality bar + QS; flag over-engineering, tests without value, any code file > 600 lines
                (P2: needs a split plan; > 650 is P0) and any import that points up the module layering
  dod         — every DoD bullet of the card is satisfied or demonstrably satisfiable
Then list findings. SEVERITY: P0 wrong behavior/security/data loss/invariant broken/contract test edited;
P1 vacuous scenario, flaky, UX or message regression, wrong docs; P2 clarity/over-engineering; P3 nit.
Never invent filler: empty findings are fine.
```

Schema:

```json
{ "type": "object", "additionalProperties": false,
  "required": ["card", "findings", "verdict"],
  "properties": {
    "card": { "type": "object", "additionalProperties": false,
      "required": ["completude", "sucesso", "invariantes", "qualidade", "dod"],
      "properties": {
        "completude":  { "$ref": "#/$defs/field" }, "sucesso": { "$ref": "#/$defs/field" },
        "invariantes": { "$ref": "#/$defs/field" }, "qualidade": { "$ref": "#/$defs/field" },
        "dod":         { "$ref": "#/$defs/field" } } },
    "findings": { "type": "array", "items": { "type": "object", "additionalProperties": false,
      "required": ["severity", "file", "line", "problem", "fix"],
      "properties": { "severity": { "enum": ["P0", "P1", "P2", "P3"] }, "file": { "type": "string" },
        "line": { "type": "integer" }, "problem": { "type": "string" }, "fix": { "type": "string" } } } },
    "verdict": { "enum": ["approve", "changes_requested"] } },
  "$defs": { "field": { "type": "object", "additionalProperties": false, "required": ["status", "evidence"],
    "properties": { "status": { "enum": ["pass", "fail"] }, "evidence": { "type": "string" } } } } }
```

Merge no bundle só com os 5 campos em `pass`, zero P0/P1 e a verificação do lead.

## Apêndice E · Registro de decisões

- 2026-10-02 · Lead, revisão do W03:
  - caminho do Windows relativo ao drive (`C:dir`) é recusado, no programa e no `cwd` (contrato §3), porque depende de um diretório corrente por drive que ninguém controla;
  - as mensagens de `NOT_FOUND` mostram o valor do PATH e do PATHEXT pesquisados: é o valor que falhou e o usuário precisa dele para consertar (UX-D). Argumentos e os outros valores de env nunca aparecem;
  - novo seam `binding` (oculto da doc, do W03) com as regras de número que só TS e Python conseguem violar (NaN, negativo, fração), para o texto do erro ser o mesmo em toda linguagem;
  - `error/messages.rs` vira compartilhado e só recebe acréscimos: cada WP adiciona o próprio bloco `impl Error`.
- 2026-10-02 · Lead, entrega do W01:
  - C-SCOPE-01 é provado pelos testes de idioma de cada linguagem (o DSL não tem escopo); os outros quatro trechos que os cenários não expressam têm a prova nomeada no `acceptance.md`;
  - aprovado o crate `regex` como dev-dependency: substitui o motor de regex caseiro de 315 linhas, e os cenários usam o subconjunto que JS e Rust leem igual;
  - **registro de pendências** `conformance/pending.txt`: um item pendente que falha conta como `pending`, e um que passa falha o CI até sair do registro. Só o lead edita, e ele tem que estar vazio no release;
  - o `unsafe` do fixture fica restrito a `omni-fixture/src/sys`;
  - as 4 ambiguidades do SPEC que o primeiro runner resolveu viraram regra no SPEC.
- 2026-10-02 · Lead, V1 da segunda onda: o B2 entrou na `main` pelo PR #4, depois do CI completo (3 OS, suíte do supervisor no musl, K4 em release no Linux). O seam interno do `io` foi congelado (`Pumps`, `Source`, `Collected`, `Stdin`) para W10 e W07 andarem em paralelo. A divisão W07/W09 dentro de `process/` é sequencial: o W07 expõe ao W09 um gancho interno para encerrar com causa (`Reason`) e prazo. Os seams do `pty` (lado host) congelam no V1 do W12, depois do W10.
- 2026-10-02 · Lead, rodada 5 do W05: no macOS (sem id de sessão para processos saindo), um descendente fora do grupo da raiz, órfão antes da primeira varredura e já em teardown do kernel, pode ainda estar terminando quando o `Stopped` sai. Fica como limitação declarada, porque ele não roda mais código de usuário. A alternativa, bloquear a confirmação enquanto houver qualquer processo saindo que não dá para atribuir, arrisca travar a confirmação em máquina carregada (K3), o que é pior.
- 2026-10-02 · Lead, rodada 3 do W04: o pidfd do supervisor é aberto logo depois do spawn. A janela em que ele poderia apontar para outro processo exige o PID dar a volta no espaço inteiro em microssegundos, porque a alocação é sequencial. Sem mudar o protocolo, basta confirmar depois que o processo é filho do host (ppid == pid do host) e, se não for, nunca sinalizar. A janela residual de checagem até o sinal no macOS está declarada no GUARANTEES.
- 2026-10-02 · Lead: o GitHub não tem runner de Windows 11; o `windows-latest` (Server 2025, build 26100, o mesmo build do Windows 11 24H2) vale como Windows 11 nos cards. A regra "o supervisor tem uma thread só" passa a ser: uma thread de controle, mais uma thread que só escreve diagnósticos no stderr (existe nos dois OS para que um stderr cheio ou fechado nunca trave os prazos).
- 2026-10-02 · Lead, rodada 3 do W01: o runner cresceu para ~1,9 mil linhas em 12 arquivos, todos abaixo de 300. A maior parte vem do `schema.rs`, a validação completa do cenário na carga, que a revisão exigiu. Aceito.
- 2026-10-02 · Lead, revisão do W01 (emenda do card): o "runner Rust com ≤ ~300 linhas" era estimativa. O DSL de 10 ações, mais o oráculo do OS, o registro de pendências e a guarda de regex, precisa de ~1250 linhas em 8 arquivos, cada um abaixo de 300. Aceito, sem crescer além dos consertos da revisão.
- 2026-10-02 · Lead, rodada 2 do W05:
  - "revezamento" adversário (fork e saída mais rápidos que a varredura, sempre no intervalo exato) fica como limitação declarada no GUARANTEES, sem código novo. Não dá capacidade nova a um adversário, que já escapa mais fácil com `setsid` (declarado). O modelo de ameaça do exec é programa comum ou com bug; conter código hostil é o trabalho da sandbox;
  - o P1 de `unwrap` em teste unitário era falso positivo: o `clippy.toml` permite `unwrap` em `#[test]`, e o clippy do lead passou;
  - os diagnósticos dos dois supervisores nunca usam `eprintln!` no loop de controle: vão por fila limitada, em thread própria, com escrita que pode falhar.
- 2026-10-02 · Lead, retrabalho do W06: um `Stop` nunca fica sem resposta (K2). No Windows, com o Job vazio (a verdade do kernel), a prova extra por pid espera no máximo 1 s; se ainda não der para inspecionar um membro, o `Stopped` sai mesmo assim e o fato vai para o stderr (o caso residual está declarado no GUARANTEES). O limite é de 4096 árvores por supervisor nos dois OS (`docs/protocol.md`). As constantes `JOB_OBJECT_MSG_*` foram definidas localmente a partir do `winnt.h`, em vez de ligar mais um feature do `windows-sys`.
- 2026-10-02 · Lead, entrega do W04: aprovado o feature `Win32_System_LibraryLoader` do `windows-sys` para achar o supervisor ao lado do módulo nativo no Windows (é como o pacote npm o distribui); `FailCode::Invalid` vira `INVALID_ARGUMENT`; o K4 em release é medido como max(0,2 ms, 3× um ping-pong de socketpair na mesma execução), só em release, e a prova oficial do K4 continua no QA (Q1).
- 2026-10-02 · Lead, rodada 2 do W03:
  - "executável" no Unix passa a ser o acesso efetivo (`faccessat(X_OK, AT_EACCESS)`, a mesma regra do kernel): um arquivo `0645` do próprio usuário não pode bloquear um candidato válido mais adiante no PATH. É um `unsafe` permitido só em `spawn/sys.rs`;
  - chaves de env no Windows são comparadas por ordinal sem caixa sobre o UTF-16 inteiro, incluindo surrogates soltos, como o Windows faz;
  - `NotADirectory` durante a busca conta como ausente (semântica do `execvp`).
- 2026-10-02 · Stakeholder pediu ver "cada processo" de um comando; lead aprovou **`processes()`** no contrato v0.1 (C-PROC-01, dono W07; inventário no W05/W06). Motivo: o supervisor já mantém esse inventário para o `stop()`, e a dor nº 1 de "por que meu comando não termina?" é um neto segurando a saída. Regra: lista exatamente o que o `stop()` alcançaria (mesma regra, nunca promete mais); só pid, pai e nome do executável (argumentos ficam fora, por segredo e custo no Windows); `IO` se o inventário vier incompleto. Ficaram fora: etiqueta de agente/sessão (o app já sabe) e painel da máquina inteira (outro produto). O glossário continua com 15 conceitos (`processes` faz parte do Child).
- 2026-10-02 · Lead, W00:
  - protocolo v1 congelado em `docs/protocol.md`. Sem a mensagem `Signal` do S5, porque nenhuma promessa precisa de sinal sem prazo; o kill forçado é `Stop{grace_ms: 0}`. Entram `List`/`Processes`; o `Spawn` passou a levar o `program` resolvido e o `grace_ms` da árvore, usado na morte do host;
  - API Rust do núcleo espelha o TS: `Command` no estilo `std`, `spawn()`/`spawn_pty()`, `Data` texto|bytes conforme `text()`, `Error` com `code()` e `result()`. A seção §11 do contrato foi alinhada;
  - os seams internos de `io`, `process` e `pty` ficam só nos tipos públicos; o resto é congelado pelo lead no V1 de cada WP, porque congelar agora seria design especulativo;
  - `bindings/node` entra no workspace no W13;
  - toolchain fixado em 1.98.0;
  - hash do contrato: ver a entrada seguinte (o contrato mudou na revisão).
- 2026-10-02 · Lead, revisão do Codex sobre o W00 (`changes_requested`: 1 P0, 9 P1, 3 P2), tudo corrigido:
  - camadas: os tipos de valor públicos foram para um módulo `types` sem dependências (o `error` apontava para `process`); o `client` pode usar o `Spec` do `spawn` (uma aresta para baixo, registrada na tabela, em vez de duplicar o struct);
  - PTY síncrono: `Tree::go` bloqueia (segunda ida e volta limitada), então o `spawn_pty()` reporta falha de exec de forma síncrona; o `resize` não espera o `Ack`;
  - protocolo enxuto e sem ambiguidade: `Stopped` sem payload; sem slot de stdout (é sempre pipe); `pty_ends`; codificações, valores canônicos e respostas para id desconhecido definidos; CLOEXEC no macOS por `fcntl`, com a janela declarada no GUARANTEES;
  - contrato: `processes()` promete a mesma regra de pertença numa varredura curta (a árvore pode mudar entre a lista e o `stop()`); regras numéricas de validação; `SystemRoot` é o único extra do Windows com `inheritEnv: false`; o `timeout` passou para o `spawn::Request` e é validado num lugar só;
  - SPEC: `entries` para conferir os pais no `processes`, leitura por stream, matcher `hex`, `${handle.pid}`, `$number` para NaN e `langs`;
  - GUARANTEES: `setpgid` não sai da sessão (só `setsid`);
  - CI: o gate do musl não passa mais quando a inspeção falha; `converted_to_draft` cancela a run em andamento;
  - `index.js` stub carregável, para o runner TS falhar pelo motivo certo;
  - **emenda do card W00 pelo lead:** saiu o item de DoD "`move-in` confere o relay hook". O relay (`RELAY-ARM`, Apêndice C) é opcional e não está ligado neste repo, e o `move-in` só gera um mapa em `.techlead/`, que duplicaria o `AGENTS.md`. Não há o que conferir;
  - ficaram de propósito os arquivos de 1 linha `process/deadline.rs` e `error/messages.rs`: evitam que o W09 e o W03 editem um `mod.rs` de outro dono.
  - hash do contrato congelado (sha256, 16 primeiros): `86907cb5b71d790a`.
  - rodada 2 do Codex: o exemplo do SPEC segura a raiz com `read-line` até o inventário e confere cada elo pai→filho; o slot `null` é o dispositivo nulo aberto para leitura (no Windows `NUL`, nunca um handle nulo); `Ack::Gone` removido (valor 1 reservado); a seção de árvores do protocolo remete ao ADR. `Data` mantém `Display` por ergonomia; os stubs privados do `spawn` ficam com o W03, que é o dono;
  - rodada 3 do Codex: codec, `runtime()` e a emenda do card passaram; o último P1 (o `until` podia parar no meio de uma linha) foi corrigido: `until` e `capture` valem só sobre linhas completas, e cada marcador do fixture sai numa única escrita. **W00 aprovado pelo lead.**
  - o **codec** do protocolo saiu do W04 e foi feito no W00: W04, W05 e W06 precisam dele em paralelo, e ele é o contrato byte a byte (4 testes com probe de motivo: ida e volta de cada mensagem, frames parciais, 10 frames malformados, `encode` recusa o que o `decode` recusaria); `client::runtime()` entrou no seam (o runtime tokio próprio do ADR-0004 tem um dono só); os testes do supervisor ficam em `crates/omni-supervisor/tests/` (W05: `unix*`, `common/`; W06: `windows*`).
- 2026-10-01 · Owner: testes determinísticos se limitam ao contrato público (~35 itens); o peso da prova vai para o QA de uso real com KPIs. O loop do crítico frio da suíte foi encerrado na rodada 8 por essa diretriz. Os achados finos que restaram foram absorvidos como KPIs (K1–K6) ou como linhas de item existente (códigos de saída > 255 no Windows; paridade no nível de opção e campo).
- 2026-10-01 · Owner: PRs em bundle por onda; CI completo uma vez por bundle; verificação local primeiro.
- 2026-10-01 · Owner: repo `HuGR-Labs/hugr-omni`, público; nome `hugr-omni`.
- 2026-10-01 · R1 encontrou o `processkit` (Rust 3.3.4 + processkit-py 1.5.0, MIT), com 81,8% de cobertura nos 3 OS em 2 linguagens, o que dispara o nosso critério de parada. Owner: **pivotar** para hugr-omni = pacote TypeScript (Node/Bun/Deno) sobre o processkit, mais a camada de sandbox depois. **Condição do Owner:** não confiar no README; o pivô só se confirma com a avaliação prática (E1, KPIs nos 3 OS) e a auditoria independente do código (Codex). Até lá, S1/S2 ficam pausados. Sinais medidos no fonte v3.3.4: `src` com ~86 mil linhas em 58 arquivos (28 acima de 650 linhas), 308 ocorrências de `unsafe`, CI em 5 SOs, criado em 2026-05-31, 55 versões, um autor principal.
- 2026-10-01 · **G0 assinado: opção B.** A evidência medida (fit: 1 de 24 itens como está; perda silenciosa de saída; travamento sob Node/Bun no Linux sem pidfd; churn alto) mostrou que construir em cima do processkit nos faria reescrever I/O, timers, motivos, saída do host e o wait, mantendo uma dependência de 86 mil linhas. O processkit fica como **referência** (MIT): reaproveitamos técnicas (filho suspenso → Job → resume; cgroup v2 quando delegado), sem dependência de código. Linguagens: TS no v0.1; Python e Rust no v0.2. S1/S2 retomam assim que o billing do Actions for destravado (precisam de Windows).
- 2026-10-02 · Lead: **ADR-0005 aceito** depois do S5 (asserções verdes nos 4 alvos) e da revisão do Codex (*accept_with_changes*). Refinamentos incorporados: `posix_spawn` + SETSID para filhos com pipe e fork só para a raiz do PTY; supervisor Linux em musl estático; a sessão é a unidade de kill; o pin dura até a sessão esvaziar (nunca acaba no `Release`); `Stop`/`Stopped` com prazo único e todos os waiters respondidos; `Go` só com o leitor rodando. Os requisitos R1–R10 entraram nos cards W04/W05/W06/W12/W12w. Núcleo refatiado: W04 (canal/cliente), W05 (supervisor Unix), W06 (supervisor Windows), W12 (PTY Unix + host), W12w (ConPTY no supervisor).
- 2026-10-02 · Stakeholder autorizou: **K4 = ≤ 1,25× o stdlib ou ≤ +0,3 ms, o que for mais folgado.** O S5 mediu uma ida e volta fixa de ~0,17 ms do supervisor; com spawn de ~0,7 ms no Linux, a razão fica em 1,22–1,36×. macOS (1,10–1,14×) e Windows (1,11–1,16×) passam. A otimização da ida e volta continua no W04.
- 2026-10-02 · Lead: as revisões do Codex rejeitaram os ADRs 0001–0003 como base de produto, pela mesma causa raiz: trabalho de ciclo de vida dentro do host. Ficam proibidos fork no host, mudança de estado de console ou de sinais do host, e zumbis "pinados" que um host com reaper agressivo destrói. **Decisão (ADR-0005):** um supervisor (binário próprio, iniciado por exec, uma vez por host) cria e colhe todos os filhos; o I/O continua no host via fds/handles passados. A validação é o spike S5. Os testes de spike e de produto precisam **afirmar** o resultado (print não é aceite).
- 2026-10-02 · Stakeholder: "quem aprova é você" → o lead aprova as decisões técnicas (D12). Contrato da API revisado pelo Codex em 3 rodadas (rework → rework → freeze_after_fixes); as decisões estão em `docs/api-contract.md`: `stop()` no lugar de `kill()`, stdin fechado por padrão, saída sempre drenada com perda avisada em ordem, `run()` completo ou `OUTPUT_LIMIT`, `RunResult` descreve a execução inteira, `lines()` e `mergeStderr`, `.cmd` via `cmd.exe` com escaping seguro. Congelado (D5).
- 2026-10-02 · Owner: repo transferido de `HuGR-Labs` para `gmhelmold` porque o Actions da org estava travado por billing ("account is locked due to a billing issue"); o GitHub mantém redirect do endereço antigo.
- 2026-10-02 · Owner: a conta `gmhelmold` foi suspensa pelo GitHub sem aviso, e o repo saiu do ar. O histórico foi republicado a partir do clone local em `gusmhs/hugr-omni`. Os links de execuções de CI nos ADRs 0001–0003 e 0005 apontam para o repo antigo e não abrem mais; os resultados registrados nos ADRs continuam valendo como registro.
- 2026-10-02 · Lead (revisão W07 r1): no §7, "o ato da biblioteca" é o commit da causa (`Life::commit`), não a saída do `Stop` no fio. Uma saída da raiz que o cliente registra depois do commit conta como posterior ao ato; nenhum observador externo distingue os dois, e `wait()` fica consistente porque lê a causa commitada. Causas sobrepostas seguem a mesma regra (vence o primeiro commit). Tornar commit e envio atômicos exigiria mudar o seam do `client` sem ganho observável.
- 2026-10-02 · Lead (revisão W07 r1, P0 de saída): `Pumps::end()` primeiro lê o que os pipes já têm (sem esperar mais; com limite de tempo e de bytes, por causa de um descendente escapado), depois para. Sem isso, o "CLEANUP" escrito no handler de SIGTERM se perde depois do `stop()` (C-KILL-02). O W10 implementa e atualiza a doc do seam.
- 2026-10-02 · Lead (revisão W07 r1): uma cópia de `Child` num processo forkado não toca lock nem manda comando ao supervisor: `stop()` recebe o erro do cliente, e o `Drop` não faz nada. Sem teste de fork em `process/` (sem unsafe ali; forkar o binário de teste multithread é arriscado).
- 2026-10-02 · Lead (W02 r2, C-TS-01): "um Child vivo mantém o event loop vivo" vale até a raiz sair (ou o `stop()`); depois disso só um consumidor de saída conectado mantém o loop. Descendentes órfãos sozinhos nunca seguram o host. Regra do binding (W13); o teste de fim normal do W02 depende dela.
- 2026-10-03 · Lead (DoD do W12): o probe "tirar o `Go`" não fica vermelho nesta arquitetura. Sem a espera, o controle de 300 execuções perdeu 0/1200 no macOS 15.3 x86 (local) e 0/900 no `macos-26-arm64` do CI (run 37160768270). Sem a espera e com o leitor do host atrasado 50 ms: 1/300 perdido no local, 0/900 no CI (run 37160904402). Com a espera e o mesmo atraso: 0/900 (run 37160914794). O supervisor mantém o master aberto desde antes do fork, e o macOS segura o líder da sessão até a saída ser lida; isso fecha quase toda a janela do S1. A espera (R9) fica: custa uma ida e volta por spawn de PTY e cobre o caso raro do leitor lento. O controle de 300 fica como teste de regressão; o DoD do W12 é cumprido por esta evidência no lugar do probe vermelho.
- 2026-10-03 · Lead (W09): no `run()`, a janela de `graceMs` depois da saída da raiz é a graça dos descendentes; quando ela acaba, o resto da árvore é parado na hora (graça 0), não com um segundo `graceMs`. O `run()` fica limitado a ~`graceMs` depois da saída da raiz (C-IO-04); processos de longa duração são do `spawn()` (§6). Texto do §6 esclarecido.
- 2026-10-04 · Owner: o GitHub bloqueou o Actions na conta `gusmhs`. O repo foi para o GitLab (`gmhelmold/hugr-omni`, público). O CI usa os minutos grátis dos runners do GitLab (Linux e Windows Server 2022 = build 20348); o macOS fica no gate frio local do lead. Depois o CI vai para o AppVeyor (`appveyor.yml` pronto: Ubuntu 24.04, macOS Sonoma, Windows Server 2019 = build 17763). O build 26100 (Server 2025 / Windows 11) fica sem CI; as provas do W06 e do W12w nele são do GitHub (registradas nos ADRs e no PLAN).
- 2026-10-04 · Lead: B3 entrou na `main` do GitLab (fast-forward, `c2e745b`). CI no GitLab: Linux verde; Windows Server 2022 verde em tudo menos um teste do W06 (`stopped_arrives_only_once_every_member_is_gone_even_ones_born_between_polls`): no runner Windows do GitLab o CTRL_BREAK às vezes não chega à raiz (a barreira não abre) e um stop com graça de 2000 ms levou 5230 ms. O código é o do W06, já na `main` desde o B2; o B3 não o mudou, então o merge não piora a `main`. Aberto o W06b para investigar antes do release (prazo único do stop no Windows sob carga e entrega do CTRL_BREAK sem console). O teste de carga de 200 comandos (QA-E) também acusou uma vez um pid vivo no Windows; o oráculo agora só conta `omni-fixture.exe` e imprime a linha de comando de quem tem o pid, para separar reuso de pid de vazamento real.
- 2026-10-04 · Lead (Q1): o alvo do K4 não muda (≤ 1,25× o stdlib ou ≤ +0,3 ms). Para o gate de release ele é julgado em máquina quieta: build release no CI de cada OS, com o Linux como referência. Uma rodada numa máquina de desenvolvimento carregada (Mac x86_64, load ≈ 10: tempo até o pid 2,11 ms contra 1,11 ms) é registrada, não decide. O harness continua saindo com 1 quando o K4 falha.
- 2026-10-05 · Owner: o Codex acabou de vez (limite de uso). Daqui em diante a revisão independente de cada WP é de um agente Claude separado, em contexto novo e só leitura, com o mesmo prompt (`scripts/review-prompt.py`) e o mesmo formato (`.github/review/schema.json`): veredito campo a campo sobre os 5 campos do card, achados P0/P1/P2, até aprovar. O lead continua com os probes e os gates frios.
- 2026-10-01 · Owner: monolito modular + god-file guard. Limites por arquivo de código (não por PR): ideal 400, ok 600, máximo 650; documentos fora. Implementado em `scripts/file-size-guard.py`, com testes de dentes em `scripts/test_file_size_guard.py` (9 casos) e mutation probe no repo real (um arquivo de 651 linhas → FAIL; removido → verde).
- 2026-10-04 · Owner: sem AppVeyor; o CI é self-hosted e enxuto. Um script, `scripts/ci.mjs`, é o gate em todo OS (o runner e o lead rodam o mesmo). Push em `main`/`bundle/*` roda o gate rápido: checks estáticos, clippy, a suíte Rust com o contrato, contrato e idioms do TS no Node 22 (~7 min frio no Mac do lead; menos com cache quente). Tag `v*` ou `RELEASE=1` soma o resto: supervisor musl, Node 24/Bun/Deno, os blocos das docs rodando de verdade, K4 em release, os pacotes npm (K9). Runners: Linux em Docker na máquina do lead (privilegiado, imagem `scripts/ci.Dockerfile`), Windows quando houver uma máquina; só refs protegidas (`main`, `bundle/*`, `v*`); os runners compartilhados do GitLab ficam desligados. `appveyor.yml` saiu.
- 2026-10-04 · Owner: sem runner Windows por enquanto. O Linux checa que o código Windows compila (clippy com o alvo `x86_64-pc-windows-msvc`); o comportamento no Windows foi provado no CI do GitLab (Server 2022) até o W06b, e o que entrou depois (W13, W14, Q1, W18) fica sem prova no Windows até haver uma máquina. O pacote `darwin-arm64` sai compilado de forma cruzada no Mac Intel do lead e é publicado sem teste num Mac ARM (o código Unix é o mesmo do x64 testado; o risco fica no empacotamento).
- 2026-10-04 · Lead: o CI não roda mais no push. O runner Linux divide a máquina do Owner (Intel, 16 GB) e o build frio derrubou o Docker Desktop; agora o lead dispara um pipeline por bundle (à mão ou pela API) e uma tag `v*` dispara um. O container do job fica em 2 CPUs e 4 GB, com `CARGO_BUILD_JOBS=2`.
- 2026-10-06 · Owner: de volta ao GitHub, conta `gustavomhss` (repo público `gustavomhss/hugr-omni`, remote `github`). CI no GitHub Actions: Ubuntu 24.04, macOS 14 (arm64) e Windows Server 2022, todos com `node scripts/ci.mjs`; isso cobre o Windows e o darwin-arm64 que estavam sem prova. Cache: `Swatinem/rust-cache` por SO e lockfile, salvo só pela `main`. Poda: checks estáticos só no Linux; sem clippy cruzado para Windows; o pesado só no release. O GitLab vira só leitura; `.gitlab-ci.yml` e a imagem do runner saíram.
