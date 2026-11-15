## J1 — PASS para research-maintenance L4 v1 completo

**Aceito semanticamente o corpo inteiro M0–M7 de `s1.subslice03.research-maintenance`.** Não há achado obrigatório nem pedido de evidência pendente para a suficiência local deste candidato.

| Identidade | Valor |
|---|---|
| Execução | `34269cf4-d631-41c5-a30b-85b0ec217390` |
| Camada / necessidade | L4 / `maintenance` |
| Corpo | **13.958 bytes** |
| SHA256 | `b57970febca6ecd87e6df64586e8a1bf557e112a0761ddc3afc58a92f4fc8025` |
| Git blob | `9fd888ebd44a07eba2724423d8cfb5e8e89a9dd1` |
| Predecessor semântico único | `s1.subslice03.research-impact`, L3 v1, SHA256 `4fe6c73bc209b2461f8ef3a342832dd79b5541cf8b2d43afd958bab0327a3d3f` |

### Fundamentação por grupos de critérios

| Critérios pertinentes | Decisão e fundamento |
|---|---|
| **GO-A1–A3, QS-1–QS-2, CC-3, AC-01 local** | **PASS.** O guia acrescenta utilidade própria de manutenção: triagem por identidade e tipo de sinal, verificações que discriminam causas, condições de parada, preparação de mudança e encaminhamento com evidência. M2–M4 transformam as relações do L3 em procedimentos utilizáveis, preservando suas qualificações. |
| **GO-A4–A5, QS-4–QS-5, CC-1/3/7** | **PASS no escopo explicativo.** M3–M5 conservam construção condicionada, limites de stale/dirty, impacto por inputs e separação entre navegação e dependência de build. Readiness, resultado de probe, custódia, admissão, publicação e fechamento de inquiry mantêm autoridades distintas. |
| **GO-A6–A7, QS-3/QS-6** | **PASS.** Oito seções delimitadas permitem consulta progressiva. O procedimento utiliza os contratos, portas e responsáveis existentes, com seleção de provas pelo risco e preservação dos independentes. Não introduz mecanismo adicional para substituir essas autoridades. |
| **GO-I1/2/7/8 e rastreabilidade local** | **Suficientes para este aceite semântico.** E0–E4 distinguem receita anterior, manifesto posterior, predecessor corrente, contexto retido e verificações mecânicas. A projeção dos inputs conserva essa separação; hashes e contagens não são apresentados como prova de mérito. |

As regras novas de procedimento em **M0/M5** têm suporte normativo adequado: o contrato comum e o plano delimitam camada, portas e gates; os recortes de **AGENTS/COMMON** sustentam CI, typecheck por pacote, guards, geração oficial e encaminhamento fora da autoridade. As prescrições permanecem explicitamente futuras.

A proveniência corrente é coerente com **65 unidades cumulativas**, sendo **18 lidas/conferidas nesta tarefa e 47 retidas**. Os outputs anteriores usados como proveniência não se tornam novos predecessores semânticos nem auto-inputs do L4.

### Pendências e alcance

**Pendências obrigatórias deste corpo: nenhuma.**

Permanece registrada a lacuna histórica do **FINAL nativo de research-flow L2 v2**, preservada como tal em E3. Este PASS não a reconstrói, não a encerra e não certifica GO-I1 integral da execução.

A decisão cobre a **suficiência semântica do guia L4 completo**. Manutenção executada, provas operacionais de reúso/propagação, Atlas, consumidores e o gate da entrada local conservam suas obrigações próprias.