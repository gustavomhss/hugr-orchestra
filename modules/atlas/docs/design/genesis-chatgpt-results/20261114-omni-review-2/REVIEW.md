# GENESIS / Omni — revisão documental, fatia 2/5

## Estado e limites

- Estado: **PARTIAL**.
- Branch: `genesis-omni-review-2-20261114`.
- Base/HEAD inicial: `343d056ffef7f4a0052da8e2e55559c95169f462`.
- Protocolo: `ee2521a5b966bd505cc95bd1c733e09e12f33531`.
- Baseline das fontes: `1cde2ff7a71bcf7aecb5d030917b577165135d38`.
- Snapshot de população: `343d056ffef7f4a0052da8e2e55559c95169f462`.
- Escopo exclusivo: posições 9–16 dos 38 corpos L1 enumerados abaixo.
- Revisão efetivamente realizada: corpo #12, `bodies/core/records-12.json`.
- Não alterei corpos de autores, código, workflows, CI, infraestrutura, branches alheias, PRs ou merges.
- Este parecer é uma leitura técnica adicional e **não** é voto J1/J2, aceite L1, correção do autor ou liberação de camada.

## Inventário congelado — 38 corpos L1

Ordenação lexicográfica dos caminhos completos (byte/ASCII), no snapshot indicado:

| # | Caminho |
|---:|---|
| 1 | `modules/atlas/docs/design/genesis-chatgpt-results/20261113-external-omni-393/bodies/core/records-01.v2.json` |
| 2 | `modules/atlas/docs/design/genesis-chatgpt-results/20261113-external-omni-393/bodies/core/records-02.v3.json` |
| 3 | `modules/atlas/docs/design/genesis-chatgpt-results/20261113-external-omni-393/bodies/core/records-03.v2.json` |
| 4 | `modules/atlas/docs/design/genesis-chatgpt-results/20261113-external-omni-393/bodies/core/records-04.v2.json` |
| 5 | `modules/atlas/docs/design/genesis-chatgpt-results/20261113-external-omni-393/bodies/core/records-05.json` |
| 6 | `modules/atlas/docs/design/genesis-chatgpt-results/20261113-external-omni-393/bodies/core/records-06.v2.json` |
| 7 | `modules/atlas/docs/design/genesis-chatgpt-results/20261113-external-omni-393/bodies/core/records-07.v2.json` |
| 8 | `modules/atlas/docs/design/genesis-chatgpt-results/20261113-external-omni-393/bodies/core/records-08.v2.json` |
| 9 | `modules/atlas/docs/design/genesis-chatgpt-results/20261113-external-omni-393/bodies/core/records-09.v3.json` |
| 10 | `modules/atlas/docs/design/genesis-chatgpt-results/20261113-external-omni-393/bodies/core/records-10.json` |
| 11 | `modules/atlas/docs/design/genesis-chatgpt-results/20261113-external-omni-393/bodies/core/records-11.v2.json` |
| 12 | `modules/atlas/docs/design/genesis-chatgpt-results/20261113-external-omni-393/bodies/core/records-12.json` |
| 13 | `modules/atlas/docs/design/genesis-chatgpt-results/20261113-external-omni-393/bodies/core/records-13.json` |
| 14 | `modules/atlas/docs/design/genesis-chatgpt-results/20261113-external-omni-393/bodies/core/records-14.json` |
| 15 | `modules/atlas/docs/design/genesis-chatgpt-results/20261113-external-omni-393/bodies/core/records-15.json` |
| 16 | `modules/atlas/docs/design/genesis-chatgpt-results/20261113-external-omni-393/bodies/core/records-16.json` |
| 17 | `modules/atlas/docs/design/genesis-chatgpt-results/20261113-external-omni-393/bodies/core/records-17.json` |
| 18 | `modules/atlas/docs/design/genesis-chatgpt-results/20261113-external-omni-393/bodies/core/records-18.json` |
| 19 | `modules/atlas/docs/design/genesis-chatgpt-results/20261113-external-omni-393/bodies/surface/records-01.json` |
| 20 | `modules/atlas/docs/design/genesis-chatgpt-results/20261113-external-omni-393/bodies/surface/records-02.json` |
| 21 | `modules/atlas/docs/design/genesis-chatgpt-results/20261113-external-omni-393/bodies/surface/records-03.json` |
| 22 | `modules/atlas/docs/design/genesis-chatgpt-results/20261113-external-omni-393/bodies/surface/records-04.json` |
| 23 | `modules/atlas/docs/design/genesis-chatgpt-results/20261113-external-omni-393/bodies/surface/records-05.json` |
| 24 | `modules/atlas/docs/design/genesis-chatgpt-results/20261113-external-omni-393/bodies/surface/records-06.json` |
| 25 | `modules/atlas/docs/design/genesis-chatgpt-results/20261113-external-omni-393/bodies/surface/records-07.json` |
| 26 | `modules/atlas/docs/design/genesis-chatgpt-results/20261113-external-omni-393/bodies/surface/records-08.json` |
| 27 | `modules/atlas/docs/design/genesis-chatgpt-results/20261113-external-omni-393/bodies/surface/records-09.json` |
| 28 | `modules/atlas/docs/design/genesis-chatgpt-results/20261113-external-omni-393/bodies/surface/records-10.json` |
| 29 | `modules/atlas/docs/design/genesis-chatgpt-results/20261113-external-omni-393/bodies/validation/records-01.json` |
| 30 | `modules/atlas/docs/design/genesis-chatgpt-results/20261113-external-omni-393/bodies/validation/records-02.json` |
| 31 | `modules/atlas/docs/design/genesis-chatgpt-results/20261113-external-omni-393/bodies/validation/records-03.json` |
| 32 | `modules/atlas/docs/design/genesis-chatgpt-results/20261113-external-omni-393/bodies/validation/records-04.json` |
| 33 | `modules/atlas/docs/design/genesis-chatgpt-results/20261113-external-omni-393/bodies/validation/records-05.json` |
| 34 | `modules/atlas/docs/design/genesis-chatgpt-results/20261113-external-omni-393/bodies/validation/records-06.json` |
| 35 | `modules/atlas/docs/design/genesis-chatgpt-results/20261113-external-omni-393/bodies/validation/records-07.json` |
| 36 | `modules/atlas/docs/design/genesis-chatgpt-results/20261113-external-omni-393/bodies/validation/records-08.json` |
| 37 | `modules/atlas/docs/design/genesis-chatgpt-results/20261113-external-omni-393/bodies/validation/records-09.json` |
| 38 | `modules/atlas/docs/design/genesis-chatgpt-results/20261113-external-omni-393/bodies/validation/records-10.json` |

Faixa 9–16: core records-09.v3, records-10, records-11.v2, records-12, records-13, records-14, records-15, records-16. Nenhum item fora dessa faixa foi revisado.

## Reconciliação de propriedade e status

- O HANDOFF de `20261114-omni-small` no snapshot 343d056 declara BLOCKED porque as 393 fontes já tinham sido atribuídas integralmente aos produtores core (134), validation (147) e surface (112), com as ondas de autoria concluídas e julgamento L1 independente em curso.
- O `work.md` da branch `genesis-external-omni-393`, HEAD observado `bdfebdb9fe6b5f2a921aef207cebe33b65cd6d20`, identifica o par persistente `omni_j1`/`omni_j2` e uma fila de revisão/correção sequencial. Registra C09v3 aceito por ambos (84/393), C10 com FIX-FIRST e correção pendente; a nota mais recente preserva a reconciliação de transporte C10/C11, não um aceite adicional.
- C09 (posição 9) foi pulado: já possui os dois resumos PASS vinculados ao mesmo corpo e SHA-256 `53e546b5c1a628577bbaa136a4c2349f084668afd371318138cc4f0f0bd7fdc6`.
- C10 (posição 10) foi pulado: o resumo intermediário C10 registra FIX-FIRST de ambos os juízes e correção do autor pendente. Não dupliquei a tarefa nem substituí o par.
- C11 (posição 11) foi pulado por pertencer à sequência corrente de transporte/revisão do mesmo par; não há aqui uma decisão final que autorize marcá-lo aceito.
- C12 (posição 12) foi selecionado para leitura técnica adicional. O registro público não demonstra aceite dual nem uma atribuição específica concorrente a esta revisão consultiva. Não houve tentativa de convocar terceiro juiz nem de substituir J1/J2.
- Posições 13–16 não foram consumidas; a fila sequencial dos dois juízes persistentes e a ausência de prova pública de liberação/atribuição independente não justificam abrir trabalho concorrente nesta sessão.

## Parecer consultivo — corpo #12

Artefato: `bodies/core/records-12.json`  
Blob SHA no snapshot e no HEAD externo consultado: `ec43b75b622c84d33b9354ca283ea55cdf7ad2b1`  
Fonte normativa: baseline `1cde2ff7a71bcf7aecb5d030917b577165135d38`.  
Conferência: todos os caminhos-fonte listados no corpo foram lidos no baseline; seus Git blob SHAs corresponderam aos `git_blob_sha` declarados no corpo.

### Finding consultivo C12-R1 — enumeração incompleta de marcadores pode ser tratada como ausência de holders

**Localização:** `native/omni/crates/omni-supervisor/src/windows/container/guard.rs:212-218` (helper `read_names`); consumidor em `guard.rs:140-178` (`reconcile`).

**Evidência observada:** `read_names` converte falha de `read_dir` em vetor vazio e usa `.flatten()` sobre o iterador, descartando silenciosamente entradas cujo avanço resulte em erro. `reconcile` usa essa enumeração para formar a lista completa de `g-*.state` e, para cada estado, de `o-<hash>-*.own`. Se uma entrada de marcador de owner não for enumerada por erro transitório do iterador, ela não chega a `held_by_other`; o algoritmo pode concluir `live == false`, prosseguir para restauração e remover o estado enquanto ainda existe um holder ativo.

**Por que importa:** o contrato descrito no cabeçalho de `guard.rs` afirma que holders concorrentes mantêm a proteção até que nenhum marcador esteja travado. Uma enumeração parcial não prova ausência de holders. Isso é distinto do caminho já descrito no corpo, em que falhas de abertura/lock do marcador são tratadas como ausência de holder: aqui a própria entrada pode desaparecer da coleção antes da consulta.

**Resultado esperado:** falha ao enumerar qualquer parte do journal deve ser tratada como inventário incompleto, nunca como conjunto vazio/ausência de holders; o estado protegido deve permanecer intacto até uma enumeração confiável.

**Correção documental proposta ao autor:** acrescentar a limitação/failure mode ao registro de `guard.rs`, com referência explícita ao comportamento de `read_names` e à consequência em `reconcile`. A correção do corpo cabe ao produtor original e deve ser reavaliada pelo mesmo par J1/J2. Não alterei o corpo publicado.

**Classificação:** finding técnico consultivo, candidato a obrigatório para C4 (utilidade de failures/limits) e C3 (evidência suficiente). Não é FIX-FIRST formal, pois não foi emitido pelo par persistente; não é aceite nem rejeição oficial.

## Limitações e próximo passo

- Apenas corpo #12 recebeu revisão técnica adicional. Os demais sete itens da faixa foram preservados sem alteração; #9–11 foram pulados conforme os estados acima.
- O protocolo exige os mesmos dois juízes persistentes, sem terceiro voto, e reavaliação das correções pelo mesmo par. Esta sessão não dispõe de handles desses juízes nem de mecanismo permitido para produzir suas opiniões originais. Por isso não transformei o parecer em aceite.
- Nenhum teste de produto, CI, execução de runtime, operação Atlas ou consumidor foi executado.
- Próximo passo executável: encaminhar C12-R1 ao produtor CORE original e ao courier para inclusão no pacote C12; os mesmos J1/J2 devem avaliar a versão exata corrigida. Depois, retomar a fila pelos mesmos juízes, sem reatribuir corpos já aceitos ou ativos.
