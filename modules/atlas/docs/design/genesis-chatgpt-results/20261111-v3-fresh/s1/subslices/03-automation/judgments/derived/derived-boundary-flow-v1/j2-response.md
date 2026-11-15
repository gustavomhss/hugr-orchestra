## J2 — FIX-FIRST para `s1.subslice03.boundary-flow` L2 v1

**Juiz:** `parallel-v3-fresh/S1-03/J2`  
**Execução:** `34269cf4-d631-41c5-a30b-85b0ec217390`  
**Corpo:** `producers/derived-boundary-flow/body.md`, **16.112 bytes**  
**SHA-256:** `83c961e473f666034b6db197ead28594580f4a953fc9f6f4bb63f006ab65ddbd`  
**Predecessor:** `s1.core.boundaries` L1 v2, SHA-256 `ca7e76aa47100f32e2076b0a5055b2cebfe3d36cfb5c0d29601125db34d7b3c6`

O corpo inteiro foi avaliado. A organização por portas e condições de continuidade é útil, mas a síntese introduz **três imprecisões obrigatórias**: mistura contratos de delegação e mining, atribui dry grading ao `trial` e atribui unidade de linhas aos limites dos chunks RAG sem suporte no schema referido.

### BF-J2-F01 — Delegação e mining precisam conservar contratos separados

**Localização:** §2, terceiro parágrafo; mapeamento correspondente em `evidence.md`.  
**Critérios:** QS-1, CC-3, GO-A1 e GO-A5.

**Esperado:** distinguir a resposta estruturada de delegação por pergunta do transporte de respostas de mining por site, incluindo o tratamento de falhas de cada caminho.

**Observado:** após descrever `answer` e `why`, o texto associa diagnóstico por pergunta a respostas “omitidas/abstidas” e afirma que o fluxo “Genesis mining from the screen” envia **“resposta, justificativa e modelo à superfície”**.

A evidência distingue os mecanismos:

- A delegação trabalha com `Reply { answer, why }` e conserva uma linha de resultado por pergunta, inclusive recusa ou falha.
- `mine` recebe texto de cada chamada, conserva pares de chave do site e texto, omite o par quando a chamada falha e chama `mineWith` com `ceiling`, `answers` e `model`. Esse adaptador não extrai nem valida um campo separado `why`.

**Fundamentação:** predecessor §2; R004 e AT01-4/AT01-5, `packages/core/src/atlas.ts:239–280,313–347`.

**Correção necessária:** separar explicitamente os dois caminhos, atribuindo diagnóstico por pergunta à delegação e omissão/abstenção por site ao mining. Não apresentar a justificativa estruturada da delegação como contrato assegurado por `mine`.

### BF-J2-F02 — `trial` foi descrito como dry grading

**Localização:** §3, segundo parágrafo.  
**Critérios:** QS-1, CC-3 e GO-A1.

**Esperado:** apresentar `trial` como execução confiável de um comando, com resultado de processo e coleta limitada, conservando a distinção em relação aos caminhos de avaliação ou grading.

**Observado:** **“`trial` exige trust antes de executar. Seu dry grading evita avanço/ledger…”** atribui um mecanismo de grading ao próprio `trial`.

O caminho fornecido verifica trust e disponibilidade do shell, prepara o comando, aplica `ToolSafetySandbox.wrap`, executa o processo e retorna exit code, timeout, saída, truncamento e duração. Não realiza grading nesse percurso. A ausência de avanço ou registro não deve ser explicada como efeito de um dry grading pertencente a `trial`.

**Fundamentação:** predecessor §3.2; R018 e RL01-7, `packages/core/src/relay.ts:420–481`.

**Correção necessária:** remover essa associação e conservar separadas a execução de `trial`, a avaliação sem registro e eventual modo dry do avaliador, conforme os contratos descritos no predecessor.

### BF-J2-F03 — Unidade dos intervalos RAG não demonstrada

**Localização:** §7, último parágrafo: **“chunks/texto/linhas/hash/boundary”**.  
**Critérios:** QS-1 e CC-3.

**Esperado:** conservar o significado demonstrado pelo schema, sem deduzir a unidade de coordenadas apenas dos nomes ou tipos das colunas.

**Observado:** o L2 chama os limites dos chunks de “linhas”. O schema apresentado define `start` e `end` como inteiros; o recorte não estabelece que sejam números de linha.

**Fundamentação:** predecessor §6 e RG01-1, `packages/core/src/rag-studio/sql.ts`, definição de `RagChunkTable`.

**Correção necessária:** descrever os campos ou intervalos sem fixar essa unidade não demonstrada. Se a unidade de linhas estiver explicitamente estabelecida no predecessor aceito, identificar esse suporte exato; a presença de `start`/`end` no schema, sozinha, não o fornece.

### Demais critérios e alcance

| Grupo | Avaliação |
|---|---|
| **GO-A2–A4; QS-2, QS-3** | Sem outra falta obrigatória. As oito seções oferecem entradas úteis por porta e encaminhamento ao L1. O tamanho acima da preferência usual não constitui violação de um teto obrigatório. |
| **QS-4, QS-6; CC-1, CC-7; GO-I1** | Sem falta adicional identificada na receita e proveniência. Há um predecessor semântico exato; receita anterior, manifesto posterior e verificação mecânica informada pela principal permanecem distintos. A navegação para outros donos não cria novas dependências de build. |
| **GO-A6, GO-A7; QS-5; GO-I2, GO-I7, GO-I8** | Sem outra falta obrigatória. O corpo preserva as limitações de registro, shipping, lock local, settlement autenticado, quiescência do caller e interpretação de schema. Testes preparados, hashes e respostas favoráveis não são promovidos a execução ou autoridade externa. |
| **AC-01 — suficiência local** | **Pendente dos três achados acima.** As correções são documentais e podem usar o material já recebido; não requerem testes ou alteração do produto. CC-4 e as obrigações operacionais mantêm suas provas próprias. |

O **PASS de `s1.core.boundaries` L1 v2 permanece preservado**. Este FIX-FIRST pertence ao novo L2 e não altera os demais pareceres, nem emite binding Atlas, aceite de consumidor, manutenção executada ou conclusão da missão.