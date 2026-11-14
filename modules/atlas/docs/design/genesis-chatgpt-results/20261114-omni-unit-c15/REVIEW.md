# GENESIS / Omni — parecer consultivo da posição 15

## Identidade e escopo

- Estado: **PARTIAL — finding documental encaminhável; sem aceite formal**.
- Unidade exclusiva: posição 15, `omni393.core.records-15`.
- Corpo: `modules/atlas/docs/design/genesis-chatgpt-results/20261113-external-omni-393/bodies/core/records-15.json`.
- Body blob SHA: `5e5ddae28f144af083e2c30695812bed9b9d35c7`.
- Snapshot da população: `343d056ffef7f4a0052da8e2e55559c95169f462`.
- Baseline das fontes: `1cde2ff7a71bcf7aecb5d030917b577165135d38`.
- Protocolo: `ee2521a5b966bd505cc95bd1c733e09e12f33531`.
- Escopo: oito registros/fonte; nenhum corpo L1, arquivo-fonte, artefato de autor ou branch alheia foi alterado.

## Reconciliação de concorrência e aceites

- Branch desta entrega criada a partir do snapshot exato: `genesis-omni-unit-c15-20261114`.
- HEAD externo consultado: `genesis-external-omni-393` em `bdfebdb9fe6b5f2a921aef207cebe33b65cd6d20`. O checkpoint público mantém o par persistente J1/J2 ativo e não publica decisão C15; ausência de recibo público não prova ausência de atividade privada.
- HEAD da faixa 9–16: `genesis-omni-review-2-20261114` em `436edb688f18923f160a09939869652f9ee3f286`. Seu HANDOFF registra pareceres consultivos para posições 12–14 e declara posições 15–16 ainda não revisadas naquela rodada.
- O checkpoint de produção diz que as fontes CORE foram integralmente atribuídas e produzidas, com revisão L1 sequencial pelo mesmo par persistente. Logo, este trabalho é uma leitura técnica consultiva independente; não reivindica que C15 esteja livre de toda atividade privada.
- Não encontrei recibo público de aceite dual ou de correção para C15 no HEAD externo consultado. Não há base para marcar C15 aceito, liberar L1 ou afirmar que os juízes terminaram a unidade.

## Conferência de identidade das fontes

Os oito caminhos declarados no corpo foram recuperados individualmente no baseline. Em todos os oito casos, o Git blob SHA retornado corresponde exatamente ao campo `git_blob_sha` do registro:

| Fonte | Git blob SHA |
|---|---|
| `native/omni/crates/omni-supervisor/tests/common/cmd.rs` | `a582f48ac84bc21f15faaddc4e78a841f5b6d4be` |
| `native/omni/crates/omni-supervisor/tests/common/host.rs` | `ac1f453b07959ad18f0d5fb97a356579d7090533` |
| `native/omni/crates/omni-supervisor/tests/common/host_role.rs` | `60099eba1f0054357e735351e6954f7c949b4e5f` |
| `native/omni/crates/omni-supervisor/tests/common/mod.rs` | `dc3fb5559aa28cd0407b22514f5dc2c326e17136` |
| `native/omni/crates/omni-supervisor/tests/common/os.rs` | `efea0beb267e336b302ef53d357708d49f5b8ace` |
| `native/omni/crates/omni-supervisor/tests/common/role.rs` | `106e4b91f6215044ba28b7a634cb719142882cee` |
| `native/omni/crates/omni-supervisor/tests/unix_host.rs` | `0ca3078074e3f2ed508a55d4bdc1d1477db4a168` |
| `native/omni/crates/omni-supervisor/tests/unix_pid_reuse.rs` | `0d142c4cdc731365394a31029c03d5ec0cd7cee9` |

## Parecer técnico por conjunto

1. **cmd.rs / host.rs:** descrição de comandos e transporte de teste coerente com as fontes. O controle `std()` é deliberadamente parcial (stdin null, stdout piped), não substituto comportamental completo do comando enviado pelo protocolo. O host usa socketpair/SCM_RIGHTS e stashes de respostas fora de ordem. O corpo registra adequadamente que `Lines` usa canal não limitado, erros de leitura viram EOF e o timeout limita observações individuais, não `write_all` ou fluxo infinito de mensagens não correspondentes.
2. **host_role.rs / common/mod.rs:** os modos exit/abort/signal/idle/midspawn/partial/held e o papel dos módulos compartilhados estão descritos com precisão; são fixtures para induzir mortes/races, não resultados observados.
3. **os.rs:** a separação do oráculo do supervisor, os casos Linux/macOS, filtros seccomp, limites de inventário e buffers fixos estão representados. Há, contudo, uma falha de classificação de erro macOS descrita abaixo.
4. **role.rs:** o snapshot ocorre antes da thread de lifetime e observa fds, sinais ignorados/bloqueados e PID/PGID/SID. O limite de descritores abaixo de 1024 e sinais abaixo de 32 está explicitamente documentado no registro; as funções heavy, zleader e cycle são fixtures, não evidência de execução.
5. **unix_host.rs:** os cenários exercitam causas distintas de morte do host, fechamento parcial/completo, canal herdado, grace, pressão de descritores e stderr bloqueado/rompido. As asserções são expectativas futuras dos testes; `runtime_status: NOT_RUN` está correto.
6. **unix_pid_reuse.rs:** o teste exige reciclagem real de PID para o controle A e preservação do número do root B enquanto descendente permanece vivo; o controle destrutivo demonstra que `killpg` ingênuo atingiria o newcomer. O fallback Linux via namespace e o ciclo macOS limitado a 300 s estão descritos. Nenhuma execução foi observada nesta revisão.

## Finding consultivo C15-R1 — ESRCH em macOS é tratado como falha de observação, não como processo ausente

**Localização:** `native/omni/crates/omni-supervisor/tests/common/os.rs:67-89`, função `alive(pid)` sob `cfg(target_os = "macos")`.

**Evidência:** a função consulta `sysctl(KERN_PROC_PID)` e executa `assert_eq!(r, 0, ...)` para qualquer retorno diferente de zero. Os testes chamam `alive(pid)` repetidamente durante teardown para decidir quando o processo deixou de existir (por exemplo, `unix_host.rs:82-85` e `unix_pid_reuse.rs:59-60`). Se o processo desaparecer entre a observação anterior e a chamada a `sysctl`, o kernel pode responder ESRCH/ENOENT para PID inexistente; o helper então entra em panic em vez de retornar `false`. Isso torna a própria condição terminal esperada uma corrida capaz de falhar o teste.

**Distinção importante:** erros de permissão, ABI/tamanho inesperado ou outras falhas reais de consulta devem continuar falhando alto; não devem ser convertidos genericamente em “morto”. O caso ESRCH/ENOENT para PID já ausente, porém, é evidência negativa conclusiva e deve ser distinguido dos erros de observabilidade.

**Resultado esperado:** tratar somente o erro de PID inexistente como `Ok(false)`/ausente; preservar panic/erro para falhas restantes e documentar essa política no helper e no registro.

**Correção documental proposta ao produtor CORE:** adicionar esse caso específico a `failures_or_limits` do registro de `common/os.rs`, citando o caminho de polling em teardown. A correção de conteúdo pertence ao autor original e deve preservar o corpo original/delta. Se o autor concluir que a API/target não retorna ESRCH nessa condição, deve trazer fonte normativa ou evidência de plataforma que sustente a exceção.

**Classificação:** finding técnico consultivo com impacto na confiabilidade do oráculo Unix/macOS; candidato a finding obrigatório de fidelidade/utilidade e limites. Não é FIX-FIRST formal, pois não foi emitido pelo par J1/J2.

## Aplicação do protocolo e limites

- Critérios consultados: fidelidade a fonte, utilidade/limites, evidência decisiva e separação entre código de teste e execução atual (QS-1/QS-2/QS-5; GO-I2/GO-I8).
- Não consultei nem reproduzi o oracle privado; seu compromisso público é `criteria-freeze.json` no blob `227e5ca10e3b1440c283b9ada2f3b3cde9ff762a`. Não alego ter reproduzido casos reservados.
- A skill e `judging.md` exigem os mesmos dois juízes persistentes, ambos avaliando o pacote exato; proíbem terceiro voto/substituição. Esta sessão não possui os handles J1/J2 e não produziu parecer formal deles.
- Não executei testes, CI, Atlas, runtime, scripts, workflows ou comandos locais. Não alego comportamento de runtime.
- Não alterei a autoria, o corpo L1 ou as branches de terceiros. Não criei PR nem fiz merge.

## Próximo passo executável

Encaminhar C15-R1 ao courier e ao produtor CORE original, preservar o body original e publicar correção/delta versionado se o autor concordar. O pacote corrigido (ou a justificativa de não correção com evidência) deve ser reavaliado pelo mesmo J1/J2 persistente. Até lá, C15 permanece pendente de decisão formal e a camada L1 não é liberada por este parecer.
