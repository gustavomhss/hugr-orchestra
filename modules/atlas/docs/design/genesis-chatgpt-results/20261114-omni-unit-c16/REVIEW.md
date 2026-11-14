# GENESIS / OMNI — revisão técnica consultiva da posição 16

**Resultado:** PARTIAL — findings documentais obrigatórios; sem aceite formal.
**Unidade exclusiva:** `core/records-16.json`, posição 16 da partição comum de 38 corpos.
**Snapshot/body:** `343d056ffef7f4a0052da8e2e55559c95169f462` / blob `6fe4ee6c82cd0db448ec239c0bb365c9cfa7f9b8`.
**Baseline:** `1cde2ff7a71bcf7aecb5d030917b577165135d38`.
**Protocolo:** `ee2521a5b966bd505cc95bd1c733e09e12f33531`.

## Escopo e reconciliação

O caminho efetivo do corpo no snapshot é
`modules/atlas/docs/design/genesis-chatgpt-results/20261113-external-omni-393/bodies/core/records-16.json`.
Ele contém quatro registros de teste:

1. `native/omni/crates/omni-supervisor/tests/unix_spawn.rs`
2. `native/omni/crates/omni-supervisor/tests/unix_stop/inventory.rs`
3. `native/omni/crates/omni-supervisor/tests/unix_stop/main.rs`
4. `native/omni/crates/omni-supervisor/tests/unix_stop/member_states.rs`

A posição 16 foi confirmada pela lista ordenada publicada em
`20261114-omni-review-2/HANDOFF.md`. O HEAD observado de
`genesis-omni-review-2-20261114` foi `436edb688f18923f160a09939869652f9ee3f286`;
seu handoff mais recente registra posições 13–14 como consultivamente verificadas
e declara 15–16 ainda não revistas. Não encontrei artefato público de revisão de
C16 nas árvores consultadas. Isso sustenta a ausência de revisão pública anterior,
não prova ausência de atividade privada. A branch específica
`genesis-omni-unit-c16-20261114` não existia e foi criada a partir do snapshot.

O corpo e os quatro arquivos-fonte foram lidos em seus pins. Os quatro
`git_blob_sha` declarados coincidem com os blobs retornados para os arquivos
no baseline. Não alterei corpo L1 nem fonte de produto.

## Parecer por registro

### 1. `unix_spawn.rs` — substancialmente fiel

As descrições de isolamento de descritores/sinais e identidade de sessão são
sustentadas por `a_pipe_root_leads_its_session_with_only_stdio_and_default_signals`
(linhas 48–74), incluindo controle independente via `std::process`.
O fallback sem `close_range` é coberto por teste Linux separado; stdio pipe/null,
stdout/stderr merged/separate, exit code e signal exit aparecem em
`stdio_slots_and_exit_statuses_arrive_as_sent`. Os erros tipados, o NUL,
verbatim Windows, rejeição de caminho relativo e restauração do conjunto exato
de FDs, inclusive cópias SCM_RIGHTS repetidas, correspondem ao teste nas linhas
127–172. O flood de 100.000 pedidos demonstra backpressure e ordem de ACKs após
a drenagem; a violação de protocolo termina a conexão e limpa a árvore; o burst
de 300 saídas é observado depois de todos os roots morrerem (linhas 175–237).

A ressalva de que os limites de flood/burst são finitos e de que os testes não
foram executados está correta. A cláusula de sessão/FDs/sinais é compatível com
as asserções citadas. Não identifiquei contradição material neste registro.

### 2. `unix_stop/inventory.rs` — precisão de inferência necessária

Os testes nas linhas 16–52, 59–65, 73–95 e 103–115 sustentam:
- inventário incompleto como erro, sem confirmação prematura de Stop;
- recuperação do limite de FDs, término do membro e ausência de leak;
- caso sem pidfd e alcance de membros em outros grupos;
- cenário de um FD livre e conclusão de Stop.

**Finding C16-F1 (obrigatório, precisão):** behavior 4 afirma que o caso de
um único FD livre “uses the emergency reserve during pidfd identity recheck”.
O código-fonte contém essa explicação no comentário do teste, mas as asserções
observáveis verificam término do membro e duração mínima do Stop; não inspecionam
diretamente a reserva nem provam qual caminho interno consumiu o FD. Reformular
como intenção/cenário declarado pelo comentário (“is designed to exercise the
one-free-FD/pidfd re-check scenario; the test asserts successful stop/member
termination”) ou explicitar que o uso da reserva é inferido do comentário, não
observado pela asserção.

A ressalva atual sobre ausência de validação da corrida PID-check-to-kill no
fallback sem pidfd é adequada. Não ampliar o resultado para segurança universal
contra PID reuse.

### 3. `unix_stop/main.rs` — duas alegações sem evidência correspondente no body

Os trechos citados sustentam deadline comum e preservação de processo externo
(linhas 33–62), pin/reap do root após saída (66–87), Stops concorrentes e deadline
mais curto (104–130), Release mantendo cleanup (164–191), e semântica de requests
unknown/Go/Resize (195–240).

**Finding C16-F2 (obrigatório, rastreabilidade):** behavior 3 também afirma
“idle-time grace” e “exact PID/parent/name inventory matching the stop boundary”,
mas a lista `evidence` do registro não inclui os testes que demonstram essas
partes: `a_stop_after_an_idle_period_gets_its_whole_grace` (linhas 91–102) e
`list_is_exactly_what_stop_reaches` (linhas 133–162). Acrescentar esses dois
excertos à evidência ou retirar/estreitar as duas alegações. As fontes suportam
as alegações; a falha é a cobertura explícita de evidência do registro.

A limitação de que a contenção é de membros cooperativamente dentro da sessão,
sem alegar contenção de um `setsid` adversarial, está correta.

### 4. `unix_stop/member_states.rs` — substancialmente fiel

Os trechos citados cobrem o root parado sem falsa notificação de saída e a
notificação única após retomada (12–35), membro ainda em teardown após SIGKILL
(37–51), e líder zombie com thread viva no Linux (54–79). A limitação de que
são estados difíceis selecionados, não todas as corridas da tabela de processos,
é proporcional. A nota sobre o contexto anterior de macOS `waitid` não é
apresentada como reprodução atual. Não identifiquei contradição material.

## Síntese

- **Fidelidade do conteúdo:** majoritariamente consistente com os quatro arquivos.
- **Correções obrigatórias:** C16-F1 (distinguir asserção observada de mecanismo inferido pelo comentário); C16-F2 (completar ou estreitar a evidência para duas alegações de `unix_stop/main.rs`).
- **Sem finding:** `unix_spawn.rs` e `unix_stop/member_states.rs` nesta leitura consultiva.
- **Runtime:** `NOT_RUN` nos registros; nenhuma execução de teste/CI foi feita nesta tarefa.
- **Prova de hash:** conferi os Git blob SHAs dos quatro arquivos contra o baseline. Não alego recomputação independente dos campos `source_sha256` ou validação do pipeline completo.
- **Limites:** não executei consumidor Atlas, OwnershipReview, importação, gates ou runtime. A revisão semântica é do principal, não dos juízes persistentes.

## Estado protocolar

O protocolo `judging.md` exige dois juízes independentes persistentes, os mesmos IDs
na reavaliação, pacote exato com corpos e evidências, e decisões reais por critério.
A superfície autorizada nesta tarefa é Chat + GitHub MCP; não há aqui operação ou
handles observáveis para criar/consultar esses juízes. Não inventei IDs, votos,
aceite dual, PASS protocolar ou liberação L1. Este documento é um parecer consultivo
com findings, não substitui o par J1/J2.

## Próximo passo executável

O autor CORE original deve produzir uma nova versão preservando o corpo original,
corrigindo somente C16-F1 e C16-F2 e vinculando o delta aos quatro blobs-fonte
fixados. Em seguida, o courier deve encaminhar o pacote integral corrigido ao mesmo
par persistente J1/J2 e preservar suas decisões reais. Revalidar também os trechos
afetados; não contar C16 como aceito até ambos os pareceres cobrirem a versão exata.
