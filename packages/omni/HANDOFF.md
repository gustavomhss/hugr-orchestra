# HANDOFF — estado do hugr-omni (2026-10-02, tarde)

## Pós-landing — 2026-10-11

Esta seção substitui o estado de retomada abaixo. WP9a está na `dev` (PR #73, merge `7368278b`); Omni é o default.

- Espelho: `script/omni-mirror.sh` + `.github/workflows/omni-mirror.yml` reproduzem cada commit first-parent da
  `dev` que toca `packages/omni` como um commit determinístico no `hugr-omni` (trailer `Orchestra-Commit:`), sobre
  a v0.1 `415038b`, só fast-forward. `git subtree` foi abandonado (recursão do dash, mais de 1 h). A main do
  espelho é read-only (ruleset `mirror-main-read-only`, deploy key `OMNI_MIRROR_DEPLOY_KEY`).
- Limite de 400 linhas por arquivo de código (regra do owner): `scripts/file-size-guard.py` falha acima de 400.
  Campanha de split no PR #277 (`f926b11a74`).
- `native.yml` provisiona os binários do Omni no job workspace (PR #280).
- Paridade das CLIs (PR #282, `8926c90b93`): `packages/cli` e `packages/orchestra` usam
  `packages/script/src/omni.ts`. `OMNI_ARTIFACTS=<dir>/<id>/{hugr_omni.node,hugr-omni-supervisor[.exe]}` é
  obrigatório exceto com `--single`; o par vai ao lado do binário; preflight em `packages/cli/src/omni-entry.ts`. O
  loader também procura em `<binário>/../omni` (CLI do desktop em `Resources/cli`). O Nix (`fork/nix-omni`) passa
  um symlink por id.
- V7 no macOS Intel hospedado é ruidoso: falhou uma vez por 0,25 ms no #282 e passou na repetição.
- Pendências do owner: release do Orchestra (pré-requisito do WP9b), npm, notarização, campanha separada para os
  god files do Orchestra anteriores ao Omni.

## Landing WP9a no Orchestra — 2026-10-10

Esta seção substitui o estado de retomada anterior. Worktree `omni-native`; candidato final verificado
`c97e1a7283610c582e3e482a101e9f453ea1bab5`, reconciliado com `dev` até `d6a58a0296`. Owner autorizou reconciliação/merge do PR #73: **"ok manda bala.
paraleliza o que puder, vamos resolver isso logo"**, depois **"siga"**.

- Epic final `38071818809`, typecheck `38071010416`, Electron real `38071013779`, CLI `38071010746` e native
  `38071010790` verdes em `c97e1a7283`. Cache hits não são execução nova; todos artifacts/lanes continuam obrigatórios.
- Delivery `38071010760` passou na tentativa 3: V9 Windows perdeu o limite de 2 s na primeira; macOS recusou carga
  nas tentativas 1/2, sem KPI completo. Retentativas mantêm fonte, assertions, deadlines e KPI.
- União do BackgroundJob revisada: extensão não começa após falha. Fixture agora segura cleanup de tentativa
  iniciada durante reutilização do ID; isso não prova o guard de token de settlement antigo. Mutação da ordem
  rejeitada em `38069015137`, restauração `38069253793`; adoção real e controles portáveis em `38067064470`/`38067064731`.
- Checkpoints/evento público novos da `dev` reconciliados. Gerador SDK particiona seis aliases, preservando tipos
  públicos e teto existente: 16575 LOC, máximo 16592. Revisão fria e compiler probe: vermelho `38071401680`, verde
  `38071613961`. Client e SDK regenerados pelos comandos oficiais; nenhuma edição manual de generated.
- Builder publica `.complete` só após saída executável válida. Shell adota após exit zero/finalização; job mantém
  broker/scratch até parada. Broker Node via AppProcess, sem exceção nova no spawn ledger. Revisões/probes medidos.
- Quit desktop usa ID causal autenticado/atômico, não ordem entre relógios de processos. ID estrangeiro rejeitado
  nos três SOs (`38057262233`); logger/capture seguem caminho real do onboarding, tracing padrão desligado.
- Relatório final: `docs/ux/WP9a-default-on.md`. Restam landing/post-merge do PR; WP9b espera release limpa.
  npm/Developer ID/notarização seguem os adiamentos explícitos. Não relabelar PTY 500 anterior como corrigido.

## Retomada no Orchestra — 2026-10-09

Esta seção substitui os pontos de retomada históricos abaixo. A fonte da integração é `packages/omni` no
`gustavomhss/hugr-orchestra`; o repositório separado é o espelho. Worktree ativa:
`~/Documents/HuGR/_worktrees/omni-native`; produto verificado `f036dca9a4`, reparos CI `fc41e41a68`. Branch de integração do PR #73
(draft): `omni-native`. O relatório lista as revisões verificadas e os gates ainda pendentes.

- O rename da `dev` foi reconciliado: pacote `packages/orchestra`, imports `@orchestra/*`, flag
  `ORCHESTRA_EXPERIMENTAL_OMNI_SPAWNER`. Publicação npm continua adiada. Candidato seleciona Omni por default;
  `=0` mantém rollback legado. Alvos compilados sem suporte nativo continuam no legado.
- Código revisado e integrado: instalações via AppProcess, settlement de falhas de startup, cancelamento e staging;
  reinício LSP com fence de descarte; join de shutdown; preflight de arquivos nativos antes da árvore da CLI;
  inventário Windows por identidade/owner e deadline completo de ConPTY.
- Otimização Linux: `getsid` rejeita processos alheios antes da leitura de stat; stat continua a autoridade para os
  membros. ABI, unidade de sessão e garantias permanecem iguais. V7 de 1000 pares passou; baseline restaurado como
  mutação deixou o KPI vermelho.
- Campanha reproduzível em `campaign/`, instruções em `campaign/README.md`, relatório parcial em
  `docs/ux/WP10-orchestra-integration.md`. Typecheck completo: de `packages/core`,
  `bun typecheck --project ../omni/campaign/tsconfig.json`.
- `fork/dev` (`ad40b080e9`) foi integrado por merge, incluindo capability/seat framework. O conflito semântico no
  builder de saída natural foi corrigido: usa `seatSkillsFiles`, `ORCHESTRA_COMPILED=true` e hashes do módulo gerado.
  Core, Orchestra e campanha passaram typecheck; revisão fria aprovou os pontos de união.
- Provas anteriores, produto `50df6ac76a`: CLI compilada (`37886935451`) e Electron real (`37886938068`) nos três SOs.
  Electron prova crash de main/utility e app.quit natural; packaging é unsigned --dir, sem prova de notarização.
- Saída natural Bun/Node + controles de seats: `37886081319`, 26 testes por SO. Windows V1/V2/V10 restaurado:
  `37887074886`, incluindo dois Esc reais e Ctrl+C. Remover SIGINT/SIGBREAK deixou `37866045782` vermelho.
- V3–V6 verdes nos três SOs (`37866046448`); oito alvos nativos provados (`37799127882`). Raw POSIX é
  receiver-ACK; raw ConPTY permanece unsupported, com cooked/render testado. Não confundir isso com burst raw lossless.
- V7 macOS Intel/x64 fechado (`37832187161`): legado 9,89377 ms; Omni 11,30649 ms; limite 11,89377 ms. Slowdown
  real de 5 ms foi rejeitado. Recusas/execuções ARM incompletas permanecem unrun; KPI inalterado.
- Owner autorizou adiar Developer ID/notarização para uso local sem Apple Developer: **"go on"**. Waiver com alcance
  e remediação no relatório WP10. Não autoriza distribuição notarizada nem publicação npm.
- Owner aceitou o relatório para o escopo local em 2026-10-09: **"eai, pode seguir"**, respondendo à pergunta de
  assinatura. WP9a autorizado; npm/distribuição pública continuam fora desse aceite.
- WP9a provisiona artifacts nativos em cada shard, preserva/hash inputs Rust e helpers de campanha, valida arquivos
  também em cache hits e mantém lane Windows `=0`. Turbo strict preserva/hash `PSModuleAnalysisCachePath`: remover
  entrada deixou recorder vermelho; alteração/restauração de helper agora muda/recupera hash Core.
- Produto `f036dca9a4`: CLI (`38005242768`) e Electron unsigned (`38004541043`) nos três SOs; delivery
  (`38005245577`, tentativa 2), V9 três SOs/V8 Server 2022/V7 Linux e Intel. Recusa por carga na tentativa 1 preservada.
  Full typecheck `38004544234`. Reparos posteriores só CI/harness; não são novos binários medidos.
- Boundary Mac do owner executado: V2 CLI `d4a32678c6`, V7 Bun `feeb526787`; hashes e KPIs em
  `docs/ux/WP9a-default-on.md`. Não atribuir essas medições a binário novo `f036dca9a4`.
- Epic completa verde em `fc41e41a68` (`38014329741`): producers/consumers, unit Linux/Windows, e2e Linux,
  Atlas, godfile, HttpApi, Relay e Windows `=0`. Core Windows executou sem cache: 1524 pass/29 skips existentes.
  Relatório WP9a revisado; candidato integrado por fast-forward no `omni-native` e PR #73 (draft).
  WP9b continua depois de uma release limpa. Artefatos dos oito alvos não habilitam sozinhos as rows CLI desativadas.
- Provas brutas locais anteriores foram preservadas nas worktrees `omni-campaign`, `omni-protocol-qa` e
  `omni-delivery-qa` (`campaign/logs`, ignorado). Não apagar esses logs antes de arquivar as evidências.
- O binário desktop de nome legado ficou sem ignore após o rename; foi preservado fora do snapshot como
  `omni-legacy-desktop-cli-c8a77c4c93`, no diretório temporário autorizado pelo harness. Não subir esse binário de
  159 MB pelo test:ci.


Arquivo para retomar o trabalho depois de uma compactação de contexto ou de uma sessão que caiu. A fonte da verdade é
o `PLAN.md` (status na seção 8, decisões no Apêndice E). Aqui está só o "onde parei".

## Papéis

- **Usuário = stakeholder.** O lead (sessão principal do Claude) aprova as decisões técnicas e cuida de merge, push,
  PRs, manutenção e higiene do repo. Ao usuário, perguntar só sobre:
  - publicar pacotes;
  - mensagens em nome dele;
  - waivers de rigor;
  - metas de KPI.
- **Quem faz o quê:**
  - execução: sub-agentes Claude Opus, um por worktree (`.claude/worktrees/agent-*`, ignorado pelo git), branch
    `wp/<id>`;
  - revisão: um agente Claude separado (contexto novo, só leitura) contra o card do WP (o Codex acabou em 2026-10-05);
  - brief e prompt da revisão: `scripts/brief.py` e `scripts/review-prompt.py`, gerados do card vivo no PLAN.
- **Repo e CI (desde 2026-10-06):** GitHub `gustavomhss/hugr-omni` (público, remote `github`, https; `gh` ativo como
  `gustavomhss`). CI: GitHub Actions (`.github/workflows/ci.yml`, Ubuntu, macOS 14 arm64, Windows 2022), um script só
  (`node scripts/ci.mjs`, `--release` soma o pesado). O GitLab (`origin`, `gmhelmold/hugr-omni`) ficou só leitura; o
  runner self-hosted de lá (container `hugr-omni-runner`) deve ser removido quando o Docker voltar.
  - Nunca trocar contas nem mexer em config global.

## Repo (histórico do GitHub)

- **`main` = `ee40167`:** B0 + B1a (PR #2), com o contrato congelado, o ADR-0005 e o scaffold W00 completo:
  - workspace de 4 crates;
  - seams congelados;
  - protocolo v1 com o codec testado;
  - SPEC e FIXTURE;
  - GUARANTEES, AGENTS.md;
  - CI `core.yml` (verde nos 3 OS + musl estático) e `windows.yml` sob demanda.
- **`bundle/B2`:** a partir da `main`, já tem o `.gitignore` do `.claude/`, o seam `binding` (W03) e o contrato
  recusando caminhos do Windows relativos ao drive. É aqui que a primeira onda é integrada.
- **Spikes:** os branches `spike/*` ficam só no GitHub (as evidências dos ADRs apontam para eles); as worktrees locais
  foram removidas.

## Estado

- **`main` = `70d1828`:** primeira onda completa (W00, W01, W03–W06), merged pelo PR #4 com CI verde (3 OS, supervisor
  no musl, K4 em release no Linux). Linha do contrato: `0 passed, 36 pending, 0 failed`.
- **`bundle/B3`** (a partir da `main`): seam interno do `io` congelado (`Pumps`, `Source`, `Collected`, `Stdin`),
  `scripts/brief.py` (gera o brief a partir do card) e `scripts/review-prompt.py` (o prompt do revisor).
- **Segunda onda em execução,** baseline `a62ddf8`, briefs em `~/Documents/HuGR/hugr-omni-reviews/briefs/`:
  - W10, io (Opus);
  - W07, Child (Opus);
  - W02, runner TS (Sonnet);
  - W12w, ConPTY (Opus).
- **Depois:**
  - W09 (timeout/cancel/run), depois do W07;
  - W12 (PTY Unix + lado host), depois do W10, com o seam do `pty` congelado no V1;
  - W13 (binding Node), depois do B2/B3.
  Os itens saem do `conformance/pending.txt` (só o lead edita) quando ficam verdes.
- **Provas pendentes do lead:** matar o supervisor real durante um flood (DoD do W04), quando o W07 entrar; e, no W07,
  o probe "tirar a etapa forçada do stop".
- **Fluxo de cada entrega:**
  1. L0;
  2. o lead lê o código;
  3. o probe;
  4. o revisor Claude até aprovar;
  5. gates a frio, incluindo macOS sob carga e Linux privilegiado;
  6. squash no bundle.

## Avisos

- Docker Desktop: subir com `open -a Docker` se cair; cada agente usa o próprio volume `omni-target-<WP>`.
- O material para investidores está fora do repo: `~/Documents/HuGR/omni-investidores.html`.

## Estado em 2026-10-06

- De volta ao GitHub (`gustavomhss/hugr-omni`). `main` = `bundle/B4` (8f01860): v0.1 completo, CI verde em Ubuntu
  24.04, macOS 14 arm64 e Windows 2022 (~3 min por SO).
- O primeiro CI no macOS 14 achou um bug real: EMSGSIZE do XNU num `sendmsg` com descritores matava o canal sob
  carga (host e supervisor). Corrigido nos dois lados (8f01860^^).
- Q2 assinado. Demo nativa no Mac do Owner: `~/Documents/HuGR/omni-demo` (pacote npm local instalado,
  `demo.mjs`, `arvore.mjs`, `host-morre.mjs`, guia `omni-guia.html`).
- Validação do Owner feita (demo nativa no Mac: árvore, `kill -9` no host, timeout, PTY, sem shell). Versão 0.1.0.
  `release.yml` (à mão) gerou e provou os 5 pacotes, cada um no seu SO e CPU (run 37509139962); tarballs em
  `~/Documents/HuGR/hugr-omni-release/` (use o `hugr-omni-0.1.0.tgz` de um job POSIX). Publicar no npm: adiado pelo
  Owner (2026-10-06, "deixa sem npm por hora"); quando voltar: `npm login`, os 5 de plataforma, depois `hugr-omni`, e
  tirar `PRE_RELEASE_INSTALL` e o aviso de pre-release do README. K4 do Rust no macOS ainda aberto.
- Limpeza pendente: o runner do GitLab (container `hugr-omni-runner`, volume `hugr-omni-runner-config`, imagem
  `omni-ci-linux:1`, volumes `omni-ci-target`/`omni-npm`) quando o Docker voltar.

## Estado em 2026-10-05 (tarde)

- `bundle/B4` (não mergeada): W06b, W13, W14, Q1, W18, W18b, Q2. Gates locais verdes (macOS; Linux no Docker).
- Revisão: o Codex acabou; revisor = agente Claude separado, só leitura (PLAN Apêndice E).
- Para fechar o v0.1:
  1. Merge da `bundle/B4` na `main` quando o CI Linux self-hosted e o gate do macOS estiverem verdes. Decisão do
     usuário (2026-10-04): sem runner Windows por enquanto; `darwin-arm64` publicado sem teste num Mac ARM (build
     cruzado no Mac Intel: `rustup target add aarch64-apple-darwin`, depois `pack.mjs dist darwin-arm64`).
     No W21, o pacote `win32-x64-msvc` precisa de uma decisão: sem máquina Windows, ou sai sem prova do W13/W14 no
     Windows, ou fica de fora do v0.1.
  2. K4 do Rust no macOS (tempo até o pid ~+0,7 ms): medir no CI quieto; se ficar fora, decisão do usuário.
  3. Q2 assinado pelo Owner em 2026-10-06.
  4. W21 release: o Owner decidiu (2026-10-06) publicar no npm só depois de validar o pacote; publicar exige o "sim" do usuário (e uma conta npm); ordem: os 5 pacotes de plataforma,
     depois `hugr-omni`; tirar `PRE_RELEASE_INSTALL` do readme-check.

## Estado em 2026-10-05

- `bundle/B4` (não mergeada): W06b, W13 (binding Node/Bun/Deno), W14 (npm), Q1 (harness de QA). Gates locais verdes
  (macOS nativo; Linux no Docker com TS em Node/Bun/Deno; K9 linux-x64 em container limpo). Falta Windows e
  macOS arm64: precisam do AppVeyor, que espera o usuário autorizar o GitLab no AppVeyor.
- Em execução: W18 (docs + checks), brief em `~/Documents/HuGR/hugr-omni-reviews/briefs/W18.brief.txt`.
- Depois: Q2 (usuários frios só com o README), W21 (release: publicar exige aprovação do usuário; ordem: os 5
  pacotes de plataforma antes do `hugr-omni`).
- Ponto aberto para o release: K4 do Rust (tempo até o pid) no macOS fica ~+0,7 ms acima do stdlib em máquina
  local; medir no CI quieto (macOS do AppVeyor) e decidir com o usuário se ficar fora.

## Estado em 2026-10-04

- Repo no GitLab (`gitlab.com/gmhelmold/hugr-omni`), CI nos runners do GitLab (minutos grátis; AppVeyor depois).
- `main` = `c2e745b`: segunda onda inteira, contrato 36/36 (macOS local, Linux CI, Windows 2022 CI menos o W06b).
- Próximo bundle: `bundle/B4` (a partir da `main`).
- Aberto: **W06b** — no runner Windows do GitLab, o teste do W06 `stopped_arrives_only_once..._between_polls` falha
  (CTRL_BREAK não chega; stop de graça 2000 levou 5230 ms). Investigar com pipelines manuais (`TEST_FILTER`).
- Depois: W13 (binding Node/Bun/Deno), W14 (empacotamento), QA, W18, W21.

## Estado em 2026-10-03

- `bundle/B3` tem a segunda onda inteira: W12w, W02, W10, W07 (frios verdes no macOS e no Linux em `3876315`;
  Windows CI verde para o W12w). Ledger: saíram C-IO-02, C-IO-03, C-KILL-01, C-KILL-02, C-KILL-03, C-PROC-01.
- Seam `deadline::{refuse_if_cancelled, arm}` congelado (`2899b13`) e já chamado por `spawn_pipe`/`spawn_pty`.
- Em execução (baseline `409cdac`, só commit local): W09 (deadline.rs, run.rs; C-TMO-01/02, C-HOST-01, C-RS-01/02) e
  W12 (pty_unix, pty, `spawn_pty`/`PtyChild::resize`; PTYSYS-U, C-PTY-01..04). Briefs em
  `~/Documents/HuGR/hugr-omni-reviews/briefs/W09.brief.txt` e `W12.brief.txt`.
- Fluxo por entrega: push da `wp/<id>` pelo lead → L0 → leitura → revisor Claude (`scripts/review-prompt.py`) → probe do lead →
  frios (macOS; Linux no Docker `--privileged`; Windows CI se tocar Windows) → squash na `bundle/B3` → ledger.
- Depois do W09 e do W12: PR da `bundle/B3` para a `main`, CI completo, merge. Então W13 (binding Node).
