## J1 — PASS semântico para research L1 v3 completo

**Juiz:** `parallel-v3-fresh/S1-03/J1`  
**Execução:** `34269cf4-d631-41c5-a30b-85b0ec217390`  
**Artefato:** `s1.core.research` — L1 `component`, `producers/research/body.md`  
**Versão julgada:** v3, **63.841 bytes**, SHA256 **`f6e3fe95e3db7adab59087b780fb232ae62cc7a2ba83623d355bcbad250b431f`**  
**Git blob:** `72bdc55fdf2dbda97e84c87111be73fa49aceeb4`  
**Fonte:** `1cde2ff7a71bcf7aecb5d030917b577165135d38`

O pacote foi recebido integralmente, com `FIM_DO_LOTE`. **O corpo research L1 v3 completo, R0–R14, recebe PASS semântico. RB-J2-F01 está fechado para esta versão.** O julgamento incorpora os corpos originais, os suplementos A/B, o complemento residual e os três deltas documentais acumulados.

### RB-J2-F01 — orçamento de consultas de `locate`

A correção está sustentada pelos ramos literais, independentemente do nome do teste:

| Caminho | Contagem sustentada pela implementação |
|---|---|
| **Índice utilizável** | Uma chamada `map`, até 21 listas iniciais e até dez buscas de vizinhos: **até 32 consultas internas**. |
| **`sources.query` ausente** | Nenhuma sondagem `map`; até **32 listas lexicais**. |
| **`sources.query` presente, mas `map` retorna `index_unavailable` ou `index_building`** | A sondagem já ocorreu; `query` passa a `undefined` e o `slice` permite outras 32 listas lexicais: **podem ocorrer 33 consultas internas**. |

**Fundamentação:** RB-S005, `locate.ts` 56–79 e 187–199. Com 16 termos distintos, as listas `lexical` e `lexical-wide` podem ocupar as 32 posições depois da sondagem malsucedida. A nova redação descreve essa exceção e conserva os limites de cinco seeds e três snippets por arquivo.

RB-S032 delimita corretamente a evidência dos testes: o caso de teto usa a fixture com `map` bem-sucedido; o caso sem índice remove `query`; o caso `index_building` usa um termo e não verifica o teto. Essas asserções preparadas não sustentam um limite universal de 32 nem constituem resultado executado.

**Disposição: FECHADO. Nenhuma correção adicional é necessária para esse achado na v3.**

### Suficiência agregada de R0–R14

| Conjunto avaliado | Disposição na v3 |
|---|---|
| **Research-a — RE-A1 a RE-A5** | **Fechados.** Permanece suficiente a evidência de população e história, manifests, aquisição e readiness, preparação, shards, armazenamento, extração e interpretação do índice. RESEARCH-RES-01 conserva o fechamento do intervalo residual de `extract.ts`. |
| **Research-b — RE-B1 a RE-B7** | **Fechados.** A evidência sustenta consultas, localização, liveness, probe, binding, allowance, ledger, custódia, registros, aquisição e inquiry, agora com a exceção de contagem explicitada em R8. |
| **Delta do memo** | **PASS preservado na v3:** duas entradas no total, uma por path, validadas por mtime e tamanho. |
| **Delta de seleção do retido** | **PASS preservado na v3:** primeiro retido presente de mesmo ID, conforme a ordem do manifesto mantida por `retain`/`touch`. |
| **Delta do orçamento de `locate`** | **PASS:** distingue os três caminhos acima e não atribui execução aos testes. |

Os critérios pertinentes de **fidelidade e contratos — QS-1, QS-4, CC-3, GO-A1 e GO-A5 —** ficam satisfeitos no escopo semântico deste L1. A reconciliação, a profundidade declarada das leituras e o reúso sustentam **GO-A2/GO-A3/GO-A4, QS-2/QS-3 e CC-1/CC-7**. A separação entre fonte, autoridade, inferência e execução permanece compatível com **QS-5/QS-6 e GO-I1/GO-I2/GO-I7/GO-I8**.

**Achados obrigatórios ainda abertos em research v3: nenhum. Pedidos de evidência de J1 ainda aplicáveis e não atendidos: nenhum.**

### Preservação dos pareceres

Meu PASS anterior sobre a v2 permanece no histórico. **Aquele parecer não apontou a exceção ao teto de consultas agora demonstrada.** Este parecer reconhece essa omissão e vincula o aceite agregado à **v3 corrigida**, sem reescrever a decisão anterior.

O resultado é semântico para o corpo e os inputs identificados. Binding Atlas, publicação, consumidores, manutenção e execução de produto permanecem obrigações separadas. As decisões e pendências dos demais artefatos não mudam por este lote.