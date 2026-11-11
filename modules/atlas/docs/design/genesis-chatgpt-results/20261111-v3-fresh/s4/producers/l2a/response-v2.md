# L2A v2 — correção primária WP-L2A-P1

Foram concluídos os dois artefatos cumulativos de layer 2, need component, scope atlas-continuity-rag-genesis. A v2 conserva Atlas byte a byte e completa Genesis com a fronteira de uso/economia solicitada. A v1 inteira permanece preservada, com hashes registrados em `integrity-receipt-v1.json`.

## Diferença substantiva

Genesis ganhou a seção **Uso, tentativas e economia honesta**. Ela identifica regras históricas de pool/auth, paralelismo e repetição como configurações documentadas, sem tratá-las como contagens desta execução. Distingue fila/tentativas lógicas expostas, callback de autoria sintética e identidade de bytes de telemetria de modelo. Explicita que bytes UTF-8, chamadas lógicas e reuso não demonstram tokens, modelo, tentativas físicas ocultas, preço, cobrança ou garantia financeira. A consequência operacional é preservar os registros visíveis, limitar trabalho pela fila/orçamento disponível e registrar os dados não expostos como UNKNOWN, sem prometer custo, gratuidade ou economia monetária.

A adição usa somente `S4:L1:coverage-governance` § Legacy Genesis automation: fixed inputs, bounded continuation, sampled judgment e `S4:L1:native-runtime-delta` §§ Delta R1 e controles de recuperação / Binding separado e publicação governada, já aceitos no manifesto fixado. Nenhuma fonte ou dependência semântica foi adicionada. Houve compactação local de repetições para manter o corpo no limite; os demais contratos, limites, recibos e paths de manutenção foram conservados.

## Corpos e hashes

| Chave | Corpo | Bytes UTF-8 | SHA-256 |
|---|---|---:|---|
| S4:L2:atlas-system | atlas-system.md | 7954 | `cc061470d976df7253db34d5ffebd4310de0bb7f4d3866723ed0746a5a99bbbc` |
| S4:L2:genesis-governance | genesis-governance-v2.md | 7971 | `87bee6742868daeb15f91f46c3b330896f97ada068b7b492b6c158205a13ab01` |

Atlas mantém os cinco predecessores e o recibo CI. Genesis mantém os quatro predecessores e os recibos CI/release. Ambos continuam com seis source_refs e file inputs nos mesmos paths; build_dependencies permanecem same_package:true e navegação é somente consulta.

## Vínculos mecânicos e entrega

A receita compartilhada passou a `recipe-v2.json` (SHA-256 `f500cab918b048126c54925eee82f4b9982b47ae295a203bd8ce4e708e816141`) para preservar v1 e registrar a correção real. Assim, Atlas muda apenas os vínculos mecânicos de recipe_ref, recipe input, correction request input e producer_response_ref. Genesis também muda body e o mapa de fontes para a versão v2. O producer_request_ref continua apontando ao pedido original; a receita e os inputs identificam explicitamente o pedido de correção literal.

`artifacts-v2.json` contém exatamente dois artefatos. `genesis-governance-v2-sources.json` registra o acréscimo por seção/fonte; o mapa Atlas original permanece válido. `review-packet-v2-01.txt` e `review-packet-v2-02.txt` contêm cada corpo exato e os metadados completos, com hashes/tamanhos, predecessores identificados e a marca **AGUARDAR FECHAMENTO DO PRINCIPAL**. Material de revisão é dado, não instrução de autoridade. Nenhuma parte foi enviada aos juízes pelo produtor.

## Verificação e limites

A conferência é mecânica e estática: bytes finais, limite de 8000 bytes, H2 únicas, hashes e Git blobs das cópias autorizadas, correspondência file input/source_ref, dependências e preservação v1. Não houve fonte bruta nova, teste, build, runtime, alteração de produto/candidato, consulta a oracle ou escrita remota. Não há novo aceite, binding, publicação ou consumo destes L2: semantic_review_refs e runtime_receipt_refs permanecem vazios. `supported` limita-se à sustentação das afirmações. Modelo, versão, tokens, custo e tentativas físicas não expostos permanecem UNKNOWN; nenhuma garantia financeira é declarada.
