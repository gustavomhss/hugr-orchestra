## J1 — PASS semântico para o L1 research v2 completo

**Juiz:** `parallel-v3-fresh/S1-03/J1`  
**Execução:** `34269cf4-d631-41c5-a30b-85b0ec217390`  
**Artefato:** `s1.core.research` — `producers/research/body.md`  
**Versão julgada:** v2, **63.501 bytes**, SHA256 **`d2def4b82495605b491e0d5494b1511e1b68c47dcffa84af87c8d35705468661`**  
**Fonte:** `1cde2ff7a71bcf7aecb5d030917b577165135d38`

O complemento residual foi recebido integralmente, com `FIM_DO_LOTE`. **A evidência fecha RE-A4, último pedido pendente de research.** Considerados os corpos originais, os suplementos A/B e os dois deltas literais, o corpo **research v2 completo é semanticamente suficiente no escopo L1 avaliado**.

### Fechamento do pedido residual

| Pedido | Decisão | Evidência e razão |
|---|---|---|
| **RE-A4 — residual de `extract.ts` 150–180** | **FECHADO** | `RESEARCH-RES-01`, linhas 155–164, completa a sequência: seleção dos arquivos planejados, leitura dos bytes do worktree, extração estrutural, escolha entre dump estrutural vazio e chamada SCIP com os textos lidos, criação do resolver e montagem do resultado. As linhas 165–170 conservam razões distintas para arquivos filtrados, ausentes no worktree, parse parcial, ocorrências SCIP malformadas e cobertura somente estrutural. Em conjunto com RA-S058 anteriormente recebido, isso permite avaliar o encadeamento de disponibilidade, verificação de HEAD e extração sem preencher o intervalo ausente por inferência. |

A leitura mantém separados o conjunto de arquivos planejado para o commit e os bytes obtidos do worktree. A verificação de HEAD e o comentário sobre confinamento não se tornam prova de snapshot atômico nem de execução qualificada.

### Resultado agregado e deltas

| Unidade | Resultado atual |
|---|---|
| **Research-a, R0–R7 — RE-A1 a RE-A5** | Todos os pedidos fechados; suficiência semântica **PASS** na v2. |
| **Research-b, R8–R14 — RE-B1 a RE-B7** | Todos os pedidos fechados; permanece o **PASS** semântico já emitido para a v2. |
| **Delta R7.2 — memo de dumps** | **PASS** preservado: máximo de duas entradas no total, uma por path, validadas por mtime e tamanho. |
| **Delta R8.1 — seleção de shard retido** | **PASS** preservado: primeiro retido de mesmo ID ainda presente, segundo a ordem do manifesto, alterada por `retain`/`touch`. Sustentação: RB-S002, bloco `open`, e RB-S003, linhas 170–215. |

### Critérios pertinentes

**QS-1, QS-4, CC-3 e GO-A1/GO-A5:** os encadeamentos decisivos agora têm suporte suficiente para distinguir comportamento observado, identidade, validade, disponibilidade e limites da interpretação.

**GO-A2/GO-A3/GO-A4, QS-2/QS-3, CC-1/CC-7:** permanecem sustentados o uso dos intermediários, o reúso histórico e a reconciliação das fontes com profundidades de leitura explícitas; o censo não substitui a compreensão declarada.

**QS-5/QS-6 e GO-I1/GO-I2/GO-I7/GO-I8:** testes preparados, verificações estruturais, comentários, hashes e conteúdo importado conservam suas autoridades próprias. A evidência adicional não exige apagar conflitos ou promover inspeção estática a resultado operacional.

**Achados obrigatórios ainda abertos em research v2: nenhum. Evidência adicional exigida para este julgamento semântico: nenhuma.**

Os pareceres originais de `research-a` e `research-b`, as correções de transporte e as decisões dos suplementos permanecem preservados. Este é um **parecer agregado novo sobre a v2**, sem reescrever os votos anteriores.

O PASS não encerra publicação, binding Atlas, consumidores, manutenção ou execução de testes/produto. **D-SUP-01 permanece FIX-FIRST**, e os pedidos pendentes de automation, boundaries, support e union-proposal continuam independentes deste aceite.