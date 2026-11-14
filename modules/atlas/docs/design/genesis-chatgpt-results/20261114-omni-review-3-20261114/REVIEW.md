# GENESIS / OMNI — Fatia 3/5: parecer documental L1

**Resultado: DONE para o escopo limitado desta sessão (dois corpos).**  
**Branch:** `genesis-omni-review-3-20261114`  
**Base:** `343d056ffef7f4a0052da8e2e55559c95169f462`  
**Fonte:** `1cde2ff7a71bcf7aecb5d030917b577165135d38`  
**Protocolo:** `ee2521a5b966bd505cc95bd1c733e09e12f33531`

## Partição e reconciliação

O inventário L1 no snapshot contém 38 corpos. A ordenação byte/ASCII dos caminhos completos gera:

- 1–18: `bodies/core/records-01.json` … `records-18.json`
- 19–28: `bodies/surface/records-01.json` … `records-10.json`
- 29–38: `bodies/validation/records-01.json` … `records-10.json`

Faixa desta sessão: 17–24. Foram escolhidos os dois primeiros corpos da faixa: posições 17 e 18 (Core 17 e Core 18). Não foram alterados corpos L1, fontes, protocolo, baseline ou branches alheias.

Estado atual observado:
- Snapshot das branches `genesis-omni-review-1-20261114` e `genesis-omni-review-2-20261114`: ambas apontavam para `343d056ffef7f4a0052da8e2e55559c95169f462`; nenhuma evidência pública de commit de revisão nessas branches no momento da consulta. Isso não prova ausência de atividade privada.
- Branch `genesis-external-omni-393`: HEAD observado `bdfebdb9fe6b5f2a921aef207cebe33b65cd6d20`. `work.md` permanece no blob `6b1b2f73ec124ab86bdaea5f584f7cfe34b94d0b`; registra autoria concluída e julgamento L1 em andamento. O último checkpoint escrito descreve julgamentos core até C09 aceitos dualmente e C10/C11 em fila/correção; não atribui nominalmente esta sessão a Core 17/18. A fila persistente de revisores é uma dependência de coordenação: este parecer não a substitui nem conta como segundo voto.
- A branch desta sessão não existia antes da criação; criada diretamente do SHA de snapshot indicado.

## Parecer — posição 17: Core 17

Corpo: `bodies/core/records-17.json`  
Blob SHA: `68297d120d8c4b3a63afe2382bb5b259d52dd707`  
Fontes: 8.

| Fonte | Git blob no baseline |
| --- | --- |
| `native/omni/crates/omni-supervisor/tests/windows_channel.rs` | `18048dc1a28dea74a00332b40e8bc110861c0f8b` |
| `native/omni/crates/omni-supervisor/tests/windows_child.rs` | `a6b579ca0452abfc6e9d07121142451eeae63ca9` |
| `native/omni/crates/omni-supervisor/tests/windows_host.rs` | `fe8569b4ebfbf9efc61fee0b97a28da6b328efec` |
| `native/omni/crates/omni-supervisor/tests/windows_host/spawn.rs` | `5e07525893021707293a5ea282f7b6341905bf7d` |
| `native/omni/crates/omni-supervisor/tests/windows_os.rs` | `bd916ab724f76301930811cba4a33a018253e944` |
| `native/omni/crates/omni-supervisor/tests/windows_pty.rs` | `072467d17ae026e6ae565df8d98cf87e52717eab` |
| `native/omni/crates/omni-supervisor/tests/windows_pty_term.rs` | `9cdd9eeff2bffc5bf9152f364659e16acdcc5f44` |
| `native/omni/crates/omni-supervisor/tests/windows_pty_term/screen.rs` | `902e72be0f76a737c4c89105c44a931cbd326dd5` |

**Parecer:** documentalmente fiel às fontes examinadas; nenhum defeito obrigatório identificado. Os trechos citados foram comparados com os intervalos de linhas no baseline e coincidem byte a byte após separação LF; os oito Git blob SHAs recuperados no baseline coincidem com os declarados nos registros.

Pontos materiais confirmados:
- O teste de `windows_channel.rs` acumula 1024 pedidos Spawn, deixa de consumir respostas, espera o callback de escrita travada e, após retomar a leitura, consome Spawned/Exited e comprova Stop/Release/novo Spawn. O corpo não converte isso em prova de sucesso de saída dos filhos nem afirma que o teste foi executado.
- `windows_child.rs` descreve os modos argv/stdin/stdio/Job/chain/breed/nest e a criação/log de PID+creation time. Os limites sobre watchdog ausente e descendentes criados mas não agendados estão explicitados.
- `windows_host.rs` e `spawn.rs` descrevem named pipe local, PID do cliente, canal de recepção limitado, transferência DuplicateHandle e os controles flood/sub-host. O corpo registra o vetor `early` sem limite e o Drop que apenas solicita kill.
- `windows_os.rs` explicita limites reais: waits com `None` e espera pós-stall podem ser indefinidos, `Lines` não tem limite de tamanho e erros de leitura encerram silenciosamente; também não trata qualquer status diferente de WAIT_TIMEOUT como prova positiva de morte.
- Os corpos PTY distinguem teste/expectativa de execução e documentam o slack de handles por build e a projeção `screen.visible` como filtro de marcadores, não emulador de terminal.

**Limites:** revisão documental do registro contra o baseline, não execução Windows, CI, prova de runtime, auditoria exaustiva de todos os caminhos dependentes nem aceite do par persistente.

## Parecer — posição 18: Core 18

Corpo: `bodies/core/records-18.json`  
Blob SHA: `a514896bf2883f7a8a667d7b61e2ea2fa5278645`  
Fontes: 3.

| Fonte | Git blob no baseline |
| --- | --- |
| `native/omni/crates/omni-supervisor/tests/windows_spawn/main.rs` | `4719d200881984fc1295c2da089269859589e133` |
| `native/omni/crates/omni-supervisor/tests/windows_spawn/root.rs` | `85145544ccef0626f322027dac6a06d5daea0c6a` |
| `native/omni/crates/omni-supervisor/tests/windows_tree.rs` | `119f1c6e12d3e4fb3dc8b749b4e6167ca86a281f` |

**Parecer:** documentalmente fiel às fontes examinadas; nenhum defeito obrigatório identificado. Os 14 trechos de evidência dos três registros coincidem exatamente com os intervalos no baseline, e os três Git blob SHAs recuperados coincidem com os SHAs declarados.

Pontos materiais confirmados:
- `windows_spawn/main.rs` usa corpus direcionado de argumentos, comparação com `std::process`, casos batch/verbatim e canários para verificar recusa antes da execução; o corpo corretamente não afirma equivalência universal de shell nem execução observada.
- `windows_spawn/root.rs` cobre Job/kill-on-close/breakaway, isolamento de handles, slots stdio, erros tipados, fechamento único de pipe repetido, códigos de saída de 32 bits e 30 ciclos com tolerância de até três handles.
- `windows_tree.rs` descreve inventário de árvore, prazos de Stop sobrepostos, IDs desconhecidos/liberados, perda do host/supervisor, isolamento de console e descendentes que nascem durante a parada. A ressalva de que o log de breeding prova somente as entradas efetivamente registradas (mínimo três), não todos os processos não registrados, está preservada.

**Limites:** os testes descritos não foram executados nesta revisão; nenhuma conclusão de comportamento em runtime, aprovação dual ou liberação de camada é inferida.

## Conclusão e autoridade

Os dois corpos avaliados podem prosseguir para a revisão persistente exigida pelo processo. Este é um parecer técnico adicional desta sessão, não um voto atribuído a J1/J2, não uma aceitação dual e não liberação de L1/L2/L3/L4. Nenhuma correção documental foi necessária. Nenhum teste, CI, operação de infraestrutura, merge ou PR foi executado/criado.
