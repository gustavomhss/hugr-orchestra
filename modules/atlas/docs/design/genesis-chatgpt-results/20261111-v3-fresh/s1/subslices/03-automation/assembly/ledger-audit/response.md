**Auditoria mecânica concluída; o total completo de chamadas e a economia não podem ser certificados neste snapshot.** Nenhum ledger, script ou arquivo de juiz foi alterado. Não houve despacho, execução de runtime, delegação, escrita remota ou acesso a conteúdo reservado.

## Entregas

- [REPORT.md](sandbox:/workspace/scratch/ef5eb2eb4a70/s1-03-34269cf4-d631-41c5-a30b-85b0ec217390/assembly-native-descriptors/ledger-audit/REPORT.md) — achados, limites e correções mínimas sugeridas.
- [evidence.json](sandbox:/workspace/scratch/ef5eb2eb4a70/s1-03-34269cf4-d631-41c5-a30b-85b0ec217390/assembly-native-descriptors/ledger-audit/evidence.json) — identidades e conferências por registro, sem copiar corpos semânticos.
- [response.md](sandbox:/workspace/scratch/ef5eb2eb4a70/s1-03-34269cf4-d631-41c5-a30b-85b0ec217390/assembly-native-descriptors/ledger-audit/response.md) e [FINAL.md](sandbox:/workspace/scratch/ef5eb2eb4a70/s1-03-34269cf4-d631-41c5-a30b-85b0ec217390/assembly-native-descriptors/ledger-audit/FINAL.md) — capturas idênticas desta resposta final original.

## Achados

O snapshot de **15/11/2026, 07:04:17 UTC** contém **290 linhas no ledger** e **174 chamadas declaradas efetivas em 33 recibos relay/relay-root**. Dessas chamadas, **173 estão no ledger**. A sequência 3 de `relay/automation-2-supplement-v2` para J2 ainda não constava do ledger, e sua cópia de request também estava ausente do payload. O original existe e foi conferido; a correção é arquivá-lo e reconciliar o evento existente, sem reenviar a parte. Essa lacuna é relativa ao instante capturado.

Há dois controles locais sem correspondência contábil identificada: uma tentativa de `send_message` que retornou erro e não confirmou entrega, e uma mensagem recebida de transferência de J2 cujo método do caller não foi registrado. Devem permanecer classificados como falha de transporte e evidência de controle recebido, sem inferir execução de juiz.

Na sequência 2 de `relay-root/research-b-supplement-v2`, o JSON do request conserva a mensagem efetiva de **27.001 bytes**, mas `message_file` aponta ao TXT preparado de **26.998 bytes**. O original e a correção literal estão preservados; falta corrigir o vínculo por adendo explícito.

## Conferências e limites

- **174 requests** tiveram mensagem, tamanho e SHA-256 conferidos; **173 cópias** existentes no payload são idênticas.
- **50 respostas originais de juízes** correspondem integralmente às cópias e aos hashes registrados.
- As **7 chamadas derivadas**, **2 correções L1**, **10 controles indexados** e **1 controle de retomada** têm correspondência no ledger.
- As **5 correções de caller** estão preservadas como metadados, sem nova chamada. Aplicando-as, não há divergência de caller nos recibos auditados.
- Não foram encontradas duplicações de event_id não vazio ou de assinatura das 174 chamadas. Índices de correções, ACKs, respostas e controles espelhados não acrescentam execuções.
- O **FINAL original de research L2 v2** está explicitamente marcado como perdido antes da compactação. O arquivo de resposta do produtor e a confirmação posterior foram preservados, sem serem tratados como substitutos daquele FINAL.

Tokens, tentativas físicas e custos continuam **UNKNOWN**; o histórico permanece **GLOBAL_UNRECONCILED**. A auditoria encerra neste snapshot, sem presumir registros futuros. As correções mínimas estão no relatório; nenhum patch foi aplicado ou executado.

**SHA-256 das entregas principais:**

- REPORT.md: `39b6f22e6f10eee59fdef071a9ee40830605d35de07f28ec7a096467dbb36f21`
- evidence.json: `ddbbaa8ba820181be1776f5cc5ca80ba16cc0179a286f0fab7bf26d36f8f59e0`
