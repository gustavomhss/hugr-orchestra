## J2 — FIX-FIRST para `s1.subslice03.research-flow` L2 v1

**Juiz:** `parallel-v3-fresh/S1-03/J2`  
**Execução:** `34269cf4-d631-41c5-a30b-85b0ec217390`  
**Corpo:** `producers/derived-research-flow/body.md`, **16.980 bytes**  
**SHA-256:** `a4b50fa9ae0b781dbea831aefcb98cb099f93167d4a7a584dc88878fc93bc044`  
**Predecessor:** `s1.core.research` L1 v3, SHA-256 `f6e3fe95e3db7adab59087b780fb232ae62cc7a2ba83623d355bcbad250b431f`

O corpo inteiro foi avaliado. A derivação oferece uma explicação útil do fluxo e conserva as principais qualificações do predecessor, mas **F3 transforma o início condicionado de um build em consequência automática da ausência de shard aberto**. Há **um achado obrigatório**, corrigível documentalmente com a evidência já recebida.

### RF-J2-F01 — Início de build apresentado como incondicional

**Critérios:** QS-1, CC-3, GO-A1 e GO-A6.  
**Localização:** F3, primeiro parágrafo; linha correspondente de E1 sobre query/stale/dirty.

| Elemento | Avaliação |
|---|---|
| **Esperado** | Conservar as condições que permitem iniciar o build detached, distinguindo ausência de índice, build já em curso e possibilidade efetiva de iniciar construção. |
| **Observado** | F3 afirma: **“Sem shard aberto, dispara build detached e responde building/unavailable com motivo.”** A frase atribui o disparo a todos os casos sem shard aberto. |
| **Evidência** | O predecessor, **R8.1**, e seu suporte já recebido, **RB-S002, `packages/core/src/research-toolkit/code-index/query.ts:176–225`**, condicionam o disparo à presença do extrator e à ausência de build já em curso, além da falta que demanda construção. Sem extrator, a indisponibilidade não inicia automaticamente um build; um build em curso também não implica novo disparo. |
| **Relevância para o fluxo** | O leitor precisa saber se houve trabalho iniciado ao qual possa atribuir progresso futuro. Receber `index_unavailable` ou `index_building` não demonstra, por si, que aquela consulta iniciou uma construção. A distinção é especialmente relevante após F2 apresentar adapters e caminhos indisponíveis. |
| **Correção necessária** | Restaurar em F3 o caráter condicionado do início do build e separar o resultado de indisponibilidade/building do fato de iniciar a construção. Ajustar o mapeamento correspondente em E1 se necessário. A evidência existente basta; não é necessário executar o produto nem modificar sua implementação. |

### Avaliação dos demais aspectos

| Critérios | Resultado da avaliação |
|---|---|
| **GO-A2, GO-A3, GO-A4; QS-2, QS-3** | Sem outra falta obrigatória. F0–F8 organizam a leitura por decisões concretas: prontidão, construção, interpretação da consulta, probe, orçamento, custódia e fechamento. O mapa de aprofundamento permite retornar às seções pertinentes do L1. Os 16.980 bytes excedem uma preferência declarada, não um teto obrigatório; o tamanho não constitui achado. |
| **GO-A5, GO-A7; QS-4, QS-5, QS-6; GO-I2, GO-I7, GO-I8** | Sem outra falta obrigatória. A derivação preserva as diferenças entre readiness e uso, basis e bytes antigos, overlay e relações, processo e fonte admitida, custódia e verdade, reserva e saldo, locator e proposição, fechamento e aceite semântico. Conserva também a exceção de 33 consultas e a ausência de exigência local de abertura anterior a cada check/close. As garantias externas e os resultados não executados permanecem delimitados. |
| **GO-I1; CC-1, CC-7; receita e proveniência** | Sem falta adicional identificada. A receita fixa um único predecessor semântico com identidade exata e gate anterior à autoria. O pacote distingue receita anterior, manifesto posterior e verificação mecânica informada pela principal. Os 17 inputs são identificados, o incidente de truncamento de COMMON tem reapresentação registrada e o autor não atribui a si leitura de fontes brutas ou de pareceres integrais. As referências R funcionam como navegação, sem criar dependências de outras famílias. |
| **AC-01 — suficiência local** | **Pendente exclusivamente de RF-J2-F01.** Não há outro pedido de evidência para este candidato. CC-4 e as demais obrigações operacionais continuam com suas provas próprias. |

O **PASS do predecessor L1 v3 permanece intacto**. Este FIX-FIRST pertence somente ao novo corpo L2 identificado acima; não altera os pareceres das outras famílias nem emite binding Atlas, aceite de consumidor, manutenção executada ou conclusão da missão.