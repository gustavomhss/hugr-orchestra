# GENESIS / Omni — rodada 2, posições 13–14

## Estado

- Resultado: **PARTIAL** — dois corpos receberam revisão técnica consultiva nesta rodada.
- Branch: `genesis-omni-review-2-20261114`.
- HEAD anterior conferido antes da escrita: `91f1a76da6765e6adb4a5ea08731e17baaf00061`.
- Snapshot de população: `343d056ffef7f4a0052da8e2e55559c95169f462`.
- Baseline das fontes: `1cde2ff7a71bcf7aecb5d030917b577165135d38`.
- Protocolo: `ee2521a5b966bd505cc95bd1c733e09e12f33531`.
- HEAD externo consultado: `bdfebdb9fe6b5f2a921aef207cebe33b65cd6d20`.

O parecer C12-R1 da rodada anterior permanece intacto em `REVIEW.md`. Nenhum corpo L1 ou artefato de autor foi modificado.

## Reconciliação de ownership

Foram relidos os HEADs das cinco branches de revisão e os handoffs publicados. As faixas observáveis são: S1 posições 1–8; esta sessão 9–16; S3 posições 17–24; S4 posições 25–31; S5 posições 32–38. Os handoffs das outras sessões registram trabalho em 17–18, 26 e 32–33, não em 13–14. A branch externa não contém resumos de revisão C13/C14 nem recibos públicos correspondentes.

Assim, C13 e C14 foram escolhidos como as duas primeiras unidades sem aceite dual nem atribuição concorrente **demonstrada nos registros Git consultados**. Isso não prova ausência de atividade privada: o checkpoint externo descreve o par persistente J1/J2 como ativo, e os seus estados/handles privados não são expostos pelo GitHub. A revisão abaixo é uma leitura adicional de fonte, não uma tentativa de substituir ou duplicar os juízes.

## Posição 13 — C13

- Corpo: `bodies/core/records-13.json`.
- Body blob SHA: `2076e16cf2860ef3c124227cc1da70b992777ae9`.
- Fontes: 7 arquivos, todos recuperados no baseline e com Git blob SHA idêntico ao `git_blob_sha` declarado no corpo:
  - `native/omni/crates/omni-supervisor/src/windows/diag.rs` — `0c52c46067a1461b5f5fe0b7904e4d8eaa3f0c02`
  - `native/omni/crates/omni-supervisor/src/windows/inventory.rs` — `3702faa0f1dba094b2bafb8dccb12579a066f782`
  - `native/omni/crates/omni-supervisor/src/windows/job.rs` — `bace96746cff8d83b507b5ae10dfd97328b31ff5`
  - `native/omni/crates/omni-supervisor/src/windows/members.rs` — `da62deb134121546a6e263c6c86e0b882270997b`
  - `native/omni/crates/omni-supervisor/src/windows/mod.rs` — `97c76451ed7c852756c27a941c71b30ab813bbda`
  - `native/omni/crates/omni-supervisor/src/windows/queues.rs` — `42d0b7606a5e4018ab809eed68861d288116c260`
  - `native/omni/crates/omni-supervisor/src/windows/spawn.rs` — `b2c097e9c51e4b4ffd70ffd0721fc8bed8bc5561`
- Evidência: 24 trechos citados foram comparados com as linhas indicadas no baseline; todos coincidem exatamente.

### Parecer técnico

Não identifiquei contradição material entre os registros e as fontes examinadas. Em particular:

1. **Diagnósticos:** a fila limita 32 linhas, descarta a mais nova quando cheia e agrega a contagem de descartes; a escrita/flush ocorre no helper e seus erros são ignorados. O corpo não transforma “não bloqueia” em promessa lock-free: explicita que `report` ainda adquire mutex.
2. **Inventário:** cada PID candidato é aberto e validado como membro do Job antes de ser descrito; o handle mantém a identidade do processo durante o snapshot e há nova checagem de liveness. Parent PID só é emitido se o pai também estiver no resultado e sua criação não for posterior à do filho. A ordem não é estável e o snapshot não é atômico, limites corretamente declarados.
3. **Job/members:** contagem desconhecida não é tratada como zero; listagem com crescimento tem quatro tentativas limitadas; probes distinguem Gone/Outside/Member e falhas permanecem desconhecidas. O flush marker, a reconciliação de notificações com `TotalProcesses` e a verificação dos PIDs listados estão descritos sem afirmar que a prova é ilimitada.
4. **Owner loop/filas/spawn:** os limites de requests, replies e trees, prioridade de eventos, contabilização de frames em voo, rollback de spawn e fronteiras de handles/stdio correspondem às fontes citadas. Os limites de tamanho, progresso do writer e chamadas síncronas não interrompíveis também estão registrados.

**Conclusão consultiva:** nenhuma correção documental obrigatória identificada nesta leitura. Isso não é PASS formal, aceite L1 ou liberação de C13.

## Posição 14 — C14

- Corpo: `bodies/core/records-14.json`.
- Body blob SHA: `9c2d4f517056a50ff3971b0713bc83d7eca38f6e`.
- Fontes: 4 arquivos, todos recuperados no baseline e com Git blob SHA idêntico ao `git_blob_sha` declarado no corpo:
  - `native/omni/crates/omni-supervisor/src/windows/tests/job_lifetime.rs` — `db2b1228c71572654843430f157163cffdb680f0`
  - `native/omni/crates/omni-supervisor/src/windows/tests/members.rs` — `295e9e10893ffcace6bbfc729e017e5fa75fb23e`
  - `native/omni/crates/omni-supervisor/src/windows/tests/mod.rs` — `defc022cfcc336060747f61ebbe1cd0b745f7e9a`
  - `native/omni/crates/omni-supervisor/src/windows/tree.rs` — `8ed49805ebf5248ae97df419a7889e622ba6121a`
- Evidência: 13 trechos citados foram comparados com as linhas indicadas no baseline; todos coincidem exatamente.

### Parecer técnico

Não identifiquei contradição material entre os registros e as fontes examinadas. Em particular:

1. **Ciclo de vida do Job:** os testes verificam o handle original, sem clone que manteria o recurso vivo; distinguem fechamento do Job antes de Stopped, preservação do handle de processo raiz até Release, descendente vivo e Stop idempotente. O caso de mutação exige falha no oracle específico de fechamento do Job.
2. **Members:** o teste usa PID externo como substituto determinístico de reutilização, sem alegar que forçou reciclagem real do PID. O corpo preserva essa limitação e observa o flush marker e o estado Pending.
3. **Owner-loop:** os casos exercitam orçamento de replies, retomada após progresso do writer, fallback de prova desconhecida/notificação perdida, sink stderr bloqueado/rompido e fechamento do handle de stdout de um Spawn recusado. As janelas temporais são especificações para futura execução, não resultados observados.
4. **Tree:** o corpo separa saída do processo raiz de conclusão da árvore; registra contagem ativa desconhecida como insuficiente, limite de um segundo para prova Pending/Unknown e fechamento do Job antes de responder aos waiters. Também registra a limitação de `exit_code` quando `GetExitCodeProcess` falha.

**Conclusão consultiva:** nenhuma correção documental obrigatória identificada nesta leitura. Isso não é PASS formal, aceite L1 ou liberação de C14.

## Aplicação do protocolo e limites

A leitura aplicou os princípios de fidelidade/utilidade/evidência (QS-1, QS-2, QS-5), distinção entre observação e interpretação (GO-I2/GO-I8) e a exigência de não confundir código de teste com execução atual. Os dois corpos marcam `runtime_status: NOT_RUN`; nenhum resultado de Windows, produto, CI ou Atlas foi inferido.

O protocolo de judging exige os mesmos dois juízes persistentes, ambos cobrindo o pacote exato, e proíbe substituir um voto por um terceiro. Esta sessão não possui os handles desses juízes. Portanto, os pareceres acima são consultivos; não registrei votos, aceites, reviews independentes nem alterações nos corpos.

## Próximo passo

Encaminhar os pacotes C13/C14 ao courier/autor e ao par J1/J2 já existente para avaliação dos mesmos bytes. Se o par apontar defeito obrigatório, preservar original e delta e reavaliar a correção com os mesmos IDs. Depois, reconciliar posições 15–16 antes de abrir nova rodada. C12-R1 continua pendente de encaminhamento/reavaliação e não foi substituído por este trabalho.
