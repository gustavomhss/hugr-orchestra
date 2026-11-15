# Auditoria mecânica do ledger de execução

## Resultado e limite temporal

**Não é possível certificar o total completo de chamadas nem fechar a economia desta execução.** Esta auditoria verifica um snapshot local enquanto o transporte autorizado continua. O histórico permanece `GLOBAL_UNRECONCILED`; tokens, tentativas físicas e custos permanecem `UNKNOWN`.

Snapshot de metadados capturado entre **2026-11-15T07:04:17.536715+00:00** e **2026-11-15T07:04:17.551128+00:00**. O ledger observado tem **290 linhas**, **280 event_ids não vazios e únicos** e 10 linhas iniciais sem event_id. Identidade: **252.135 bytes**, SHA-256 `4e828338d20e140d9704d37fa6564a0a92089a028a5e8282b89eb2436fd96238`.

Leituras posteriores fizeram somente conferência dos arquivos referidos por esse snapshot. Às **2026-11-15T07:09:06.189287+00:00**, o hash do ledger e dos dois scripts permanecia igual. O recibo de `relay/automation-2-supplement-v2` já havia mudado: seu novo hash está no apêndice estruturado. Não foram incorporadas nem contadas novas chamadas dessa versão posterior.

A auditoria não despachou chamadas, não chamou juízes/produtores, não delegou trabalho, não executou runtime, não escreveu remotamente e não alterou ledger, scripts ou arquivos de juízes. O conteúdo de oracle/reserved e os logs internos do host não foram abertos. Requests, mensagens e respostas ligados aos recibos foram processados para identidade e comparação de bytes; nenhum corpo de fonte semântica foi consultado para reavaliar conteúdo.

## O que foi reconciliado

| Família observada | Registros nos recibos | Correspondência no ledger do snapshot | Interpretação |
|---|---:|---:|---|
| 33 recibos em relay/ e relay-root/ | 174 chamadas declaradas efetivas | 173 | Uma lacuna temporal identificada em F01 |
| derived-dispatches.json | 7 chamadas de autoria/correção | 7 | Respostas e arquivos de conclusão não são novas chamadas |
| l1-consistency-correction-dispatches.json | 2 chamadas de correção | 2 | Os dois FINALs arquivados têm identidade conferida |
| payload/receipts/continuation-controls/ | 10 controles efetivamente registrados | 10 | Comunicação/coordenação; não novos trabalhos semânticos |
| relay-controls/resume-derived-research-flow-v1.json | 1 controle de retomada | 1 | Distinto dos envios posteriores aos juízes |
| Respostas originais de juízes referidas no ledger | 50 respostas | 50 | Original local e cópia no payload byte-idênticos |
| Correções de caller | 5 adendos | 5 | Metadados, `new_native_request=false` |

Os **174 arquivos JSON de request** existem e suas mensagens UTF-8 correspondem aos hashes/tamanhos declarados nos recibos. Desses requests, **173 cópias no payload** foram encontradas e são idênticas; a cópia ausente corresponde à mesma chamada de F01. A verificação também cobriu **91 referências de resposta/controle, em 78 paths distintos**, sem divergência de hash/tamanho; inclui as 50 comparações entre original de juiz e cópia.

Há **169 chamadas de juiz com retorno normal registrado e 5 com exibição de retorno truncada/indeterminada**. Todas as cinco continuam identificadas como tais; ACKs ou FINALs preservados são evidência adicional, não tentativas novas. A contagem de 174 significa linhas de chamadas efetivas nos recibos locais, não tentativas físicas de provedor nem 174 avaliações completas.

Não foi encontrada duplicação de event_id não vazio, nem duplicação entre os 174 recibos por `target + método + message_sha256`. Nenhuma das 173 linhas `native_judge_followup` do ledger ficou sem recibo correspondente.

## F01 — chamada efetiva e cópia ainda ausentes no snapshot

O recibo `relay/automation-2-supplement-v2/dispatch-receipt.json`, SHA-256 `e3d7c84a2f90fb53888682fc37742eb45be8b9a5c6a90d02a9834d69589ec03a`, contém uma chamada de sequência **3**, para **/root/s1_03_j2**, parte **1**, método `collaboration.followup_task`, `tool_returned_normally=true`.

- Request original: `relay/automation-2-supplement-v2/request-j2-01.json`.
- Identidade do arquivo: **58.444 bytes**, SHA-256 `1f7fa443f39b6063eaf0e462d858209e7f8644dbbc1066dbe9a3830948450a30`.
- Mensagem efetiva: **54.494 bytes**, SHA-256 `9d89e56e43f7f607292c10fdf63503d9c9c32880b6479fac3b421539de31ccc2`.
- Cópia ausente às 07:06:51 UTC: `payload/judgments/l1/automation-2-supplement-v2/request-j2-01.json`.
- Identificador contábil derivado pela regra existente, ainda ausente no ledger capturado: `judge-dispatch:automation-2-supplement-v2:/root/s1_03_j2:3:9d89e56e43f7f607292c10fdf63503d9c9c32880b6479fac3b421539de31ccc2`.

**Correção mínima sugerida:** na próxima reconciliação normal do principal, arquivar esse original e acrescentar o evento pelo recibo existente. Não despachar a parte novamente. Esta é uma lacuna comprovada daquele snapshot e pode decorrer da janela entre despacho, arquivo e reconciliação; não é uma afirmação sobre o estado posterior.

## F02 — controles locais não cobertos pela reconciliação atual

`scripts/reconcile-ledger.py` percorre os dispatch-receipts dos dois roots e `payload/receipts/continuation-controls/*.json`, mas não percorre `relay/continuation-controls/`. `archive-review-records.py` também arquiva apenas diretórios ligados a dispatch-receipts. Dois registros ali exigem disposição explícita:

1. **Tentativa de contato que falhou.** `relay/continuation-controls/j1-idle-handle-contact.json`, **1.129 bytes**, SHA-256 `587b6e8357c8b268e4f691bbc229b1783563668b518085adbed9acdabbe6a0ad`, registra `collaboration.send_message` para `/root/s1_03_j1` às 05:22:34 UTC, com erro original `collab tool failed: agent thread limit reached` e `delivery_confirmed=false`. Não há evento equivalente no ledger capturado. É evidência de uma tentativa de ferramenta que falhou, **não de execução/recebimento pelo modelo do juiz**.
2. **Controle de transferência recebido.** `relay/continuation-controls/2026-11-15-root-reclaims-j2.json`, **388 bytes**, SHA-256 `350ac0dd4c8cd7b1be314297aedb95f134152bb59adc2b907871a75602930fb7`, preserva uma mensagem original recebida de /root às 06:41:09 UTC. Não há referência ou mensagem idêntica nos controles indexados do snapshot. O arquivo não informa o método de ferramenta do caller; isso permanece desconhecido. O registro comprova o controle recebido, não uma nova avaliação de juiz.

**Correção mínima sugerida:** preservar esses dois registros e acrescentar adendos contábeis de classes distintas: tentativa de transporte com falha e evidência de controle recebido. Para o primeiro, manter entrega falsa e tentativas físicas de modelo desconhecidas; para o segundo, não inferir método nem contar execução. A recuperação `union-supplement-v1` citada dentro do primeiro arquivo já corresponde a um despacho existente e não deve ser lançada novamente.

Dois outros arquivos do mesmo diretório **já têm equivalentes**, portanto não são omissões de chamadas:

| Registro no relay | Equivalente já indexado | Prova de identidade |
|---|---|---|
| after-support-j2-part05.md e seu metadata.json | relay-after-agent-registry-gap.json | Mensagem inteira: 727 bytes, SHA-256 `adc84e5a96cc8020d1db4df40455e32757ec6d727c5ea1d664093b25b00e43a6` |
| 2026-11-15-root-returns-both-for-automation.json | relay-both-handles-handover-after-population.json | `literal_message` recebido igual, byte por byte, ao campo `message` do caller |

Não é correto contar cada JSON/índice desses pares como chamada adicional.

## F03 — message_file aponta para texto preparado, embora o request real esteja preservado

No recibo `relay-root/research-b-supplement-v2/dispatch-receipt.json`, sequência **2**, o campo `request_file` aponta ao original efetivo `actual-j2-part02-sub2.json`. Sua mensagem tem **27.001 bytes**, SHA-256 `9d9020e5534705dacf5d0627052ea09f2c4186cd7afbdbe577125547616b495c`; o JSON tem **27.872 bytes**, SHA-256 `a196c430dd7f23d1cb9c8d169ebb79fa3b580529ea79d13f8c8da51da99474c0`.

Porém `message_file` aponta a `wire/j2-part02-sub2.txt`, **26.998 bytes**, SHA-256 `b8cc137088c802640e5b6d837fcb52e9256fe34ebfa10857e6041789ecdedb6d`. É a mensagem preparada, distinta do argumento real que sofreu a transcrição já documentada. As cópias dos dois arquivos no payload mantêm fielmente essa diferença.

O original não está perdido: a mensagem está inteira no JSON efetivo, e a correção literal correspondente está registrada como outra chamada. O risco concreto é um leitor do recibo tratar `message_file` como os bytes efetivamente enviados e obter identidade incorreta.

**Correção mínima sugerida:** acrescentar um adendo ao recibo/ledger que classifique o TXT como `prepared_message_file` e indique o JSON como fonte do argumento efetivo. Se for necessário um TXT efetivo, derivá-lo literalmente do campo `message` do JSON e marcar que é extração posterior, com identidade própria. Não reescrever o request original nem criar outra chamada para essa extração.

## Preservação correta e limites de contagem

### Caller e correções

As cinco linhas de correção de caller no ledger, linhas 261–265 do snapshot, corrigem /root para /root/review_relay no lote `relay-root/automation-1-supplement-v2-coverage-erratum`, sequências `3.1`, `3.2`, `3.2-correction`, `4.1` e `4.2`. Todas apontam ao evento original e têm `new_native_request=false`. Aplicando esses adendos à leitura contábil, nenhum caller efetivo diverge dos recibos auditados. O path `relay-root/` sozinho não determina quem fez a chamada.

A repetição da correção `2.1-correction` em `literal_corrections` do recibo de automation-population-current-v1 é um índice do elemento já existente em `calls`; o próprio índice declara `not_an_additional_call_beyond_calls_entry=true`. Os índices de transcrição, ACKs, callbacks, FINALs e arquivos de conclusão não acrescentam chamadas. A correção literal que foi realmente enviada é uma chamada; os seus índices não são.

### Pedidos preparados

Nos 174 elementos auditados de `calls/dispatches`, não foi encontrado um pedido meramente preparado contado como envio efetivo. Há vários arquivos de preparação não referidos por essas listas; sua existência não foi usada para inferir chamadas. Os scripts excluem diretórios cujo segmento começa por `prepared`, mas a prova das chamadas atuais vem dos elementos efetivos dos recibos e seus argumentos preservados.

Em `derived-research-impact-plan-v1`, apenas um alvo despachado consta de `calls`; o alvo listado em `not_dispatched_targets` não foi contado. `request-j2-continuation-state-control.json` de support é um envio real já listado uma vez em `calls`; seu propósito de controle não cria uma nova produção semântica.

### FINAL original perdido

`payload/receipts/derived-dispatches.json`, entrada `derived-research-l2-correction-v2`, declara explicitamente:

`original_native_final_separate_capture = NOT_PRESERVED_BEFORE_COMPACTION; do not reconstruct as verbatim`.

A resposta produzida em arquivo, `producers/derived-research-flow/revisions/v2/response.md`, está preservada e seu SHA-256 é `553422eb616a5e72a38d82810ba0cfbd4221baa8828333e5600f488c4e8fea90`. A confirmação posterior está arquivada separadamente com SHA-256 `1ea44c9a77e5211ad649b32ba689ef0f744549df731efda794822fab5ac1eeb8`. Ambos foram conferidos; nenhum deles foi promovido a cópia do FINAL ausente. O ledger já distingue `native_derived_author_completion_record` de FINAL nativo. A lacuna permanece e não deve ser preenchida por reconstrução.

As seis outras respostas nativas derivadas e as duas respostas de correção L1 referidas nos seus recibos têm arquivos e hashes conferidos. Isso não certifica todos os originais históricos sem ligação inequívoca a esses recibos.

## Contratos dos scripts e correção mínima de procedimento

- `reconcile-ledger.py` preserva linhas anteriores e deduplica por event_id. Seu relatório `new_unique_event_ids` conta todos os IDs não vazios existentes, não apenas adições desta execução do script; não usar esse número como total de novas chamadas.
- O mesmo script agrupa eventos iniciais, chamadas, respostas, arquivos de conclusão e metadados. **290 linhas não significam 290 chamadas.** O par de juízes aparece em uma única linha inicial, e arquivos de resposta também produzem linhas.
- O bloco de oracle inclui metadados de duas invocações, mas sua evidência reservada não foi aberta por esta auditoria. Esse subtotal não foi certificado aqui.
- `archive-review-records.py` preserva requests/mensagens referidos com verificação de bytes quando já existem. A string `dispatch_count_rule` diz “successful actual calls”, enquanto cinco chamadas preservadas têm retorno truncado/indeterminado; a redação deve distinguir invocação registrada de sucesso observado.
- Para fechar a contabilidade depois do trabalho em curso, o principal deve conciliar uma única vez os recibos efetivos, falhas e aliases; aplicar adendos de caller e de ponteiro como metadados; preservar `UNKNOWN` e a lacuna de FINAL. Nenhum evento futuro é garantido por este relatório.

Não foi produzido patch aplicável automaticamente: os ajustes recomendados exigem classificação explícita de dois formatos de controle e um adendo de ponteiro; um novo leitor de diretório que contasse todos os arquivos seria insuficiente. As correções mínimas estão especificadas em F01–F03, sem alteração dos originais.

## Identidades principais

Todos os paths abaixo são relativos à raiz da execução. O apêndice `evidence.json` contém o inventário de identidades, comparações por request/referência e os hashes de fechamento, sem copiar mensagens ou respostas semânticas.

| Arquivo | Bytes observados | SHA-256 do snapshot |
|---|---:|---|
| `payload/execution-ledger.jsonl` | 252135 | `4e828338d20e140d9704d37fa6564a0a92089a028a5e8282b89eb2436fd96238` |
| `payload/receipts/derived-dispatches.json` | 10539 | `104247571432eb7e6c0cbec33de025e44446f88261f91b11e64c1f5a9cfcf576` |
| `payload/receipts/l1-consistency-correction-dispatches.json` | 2955 | `6b4f3e6fca68760ef70e876c8453e7248536e15a6a52cf324232733e5bd12ff6` |
| `payload/receipts/review-record-archive.json` | 145747 | `38109dca016178d62ff5ddf9fb3b1f9ff7dab8a17e1eb2a7ee8a19142ae75a07` |
| `relay/automation-2-supplement-v2/dispatch-receipt.json` | 4670 | `e3d7c84a2f90fb53888682fc37742eb45be8b9a5c6a90d02a9834d69589ec03a` |
| `relay/continuation-controls/2026-11-15-root-reclaims-j2.json` | 388 | `350ac0dd4c8cd7b1be314297aedb95f134152bb59adc2b907871a75602930fb7` |
| `relay/continuation-controls/j1-idle-handle-contact.json` | 1129 | `587b6e8357c8b268e4f691bbc229b1783563668b518085adbed9acdabbe6a0ad` |
| `relay-root/research-b-supplement-v2/dispatch-receipt.json` | 2788 | `e08ee2a8105a40a18ce12b82e4f60cf2826f337e9da2f9cc4dbd48c69bc7d8c9` |
| `scripts/archive-review-records.py` | 3700 | `facb376464305d90d96d7fc3586aa39822443791f49310d255e29ece5480e64f` |
| `scripts/reconcile-ledger.py` | 7522 | `133a462aab31727f7fe971d88020f51b179a12b55b278e7bb6f903e58b590eff` |

## Entrega e procedência

Escritas restritas a `assembly-native-descriptors/ledger-audit/`: este relatório, seu apêndice estruturado e as capturas idênticas `response.md` e `FINAL.md` da resposta final original. Nenhum script foi importado ou executado para alterar a contabilidade. A chamada desta própria auditoria e seu retorno final ocorreram fora do snapshot congelado; sua retenção caberá ao caller e não foi inventada dentro do ledger auditado.

