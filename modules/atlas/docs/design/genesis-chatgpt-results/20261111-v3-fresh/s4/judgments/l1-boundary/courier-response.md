# WP-L1-BOUNDARY — courier concluído

Produtor original: `/root/producer_l1a`. Courier: `/root/producer_runtime`.
Somente transporte; nenhum parecer ou autoria de conhecimento acrescentado.

O pedido literal foi preservado antes das leituras. A Parte 1 v1 foi enviada a
ambos os juízes antes da orientação de correção chegar; os dois envios e todos
os drafts v1 permanecem preservados. A reposição V2 foi declarada em cada parte
e as três partes V2 foram enviadas literalmente a ambos os destinatários,
`/root/judge_j1` e `/root/judge_j2`. São oito chamadas de envio de payload no total.

Cada par usa o mesmo texto de mensagem preservado antes do envio. O ledger
registra o mesmo caminho, bytes e digest para ambos, e esses bytes foram
novamente conferidos. As chamadas de envio retornaram sem erro, sem message ID
exposto; todos os IDs ficam `UNKNOWN`. Isso registra submissão pelo courier,
sem inventar telemetria de leitura ou um recibo do host.

Todos os payloads dizem **AGUARDAR FECHAMENTO DO PRINCIPAL** e separam este pacote
do R1 simultâneo, conduzido por outro courier. Nenhuma decisão foi aguardada.

## Partes V2

| Parte | Bytes UTF-8 | SHA-256 |
| --- | ---: | --- |
| 1 | 31097 | `2ff8c3089dae943270bdde00eb050c2dd520225e0974be27025d878d68621af3` |
| 2 | 30675 | `45813371f5608cce9b6c75fa5d863862bcb2df998dd2db56ae47987901382fc7` |
| 3 | 28448 | `3cb8423648e6145ee65444ace09e255334ca97cc7941a27e351fb3e4909796dd` |

Parte 1: body-v2 e artifact-v2 integrais. Parte 2: trechos literais de
SessionCompaction/runner normal e hospedado, contribuição Continuity, ciclo
RAG load–memoryStore–save, alocação, traces e extração/admissão. Parte 3:
Atlas host/boundary/modelos, SQL, recipe-v2 e diff integrais, e resumos mecânicos
de proveniência, primary-check v1/v2 e receipt v2, sem reatribuir evidência v1.

Os registros completos ficam em `payload-manifest-v2.json`,
`excerpt-manifest-v2.json`, `mechanical-summary-v2.json` e `send-ledger.json`.

Não houve teste local/remoto, build, importação de produto, escrita GitHub,
alteração de produtor/candidato ou leitura de oracle/respostas reservadas.
Todas as escritas deste trabalho ficaram em `s4/review-packets/l1-boundary`.
