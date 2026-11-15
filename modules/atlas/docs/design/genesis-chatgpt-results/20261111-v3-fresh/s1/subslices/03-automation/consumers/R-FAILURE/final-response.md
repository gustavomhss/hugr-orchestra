**Não foi possível determinar se o warm sem shards e o marker local bastam para declarar a indexação pronta ou confiar em todo o conteúdo do ledger.** Nenhuma das consultas devolveu conteúdo que permita avaliar esses sinais. Portanto, não posso confirmar essa conclusão nem estabelecer a resposta de domínio contrária.

### Consultas e evidências recebidas

| Consulta | Operação e seleção | Resultado |
|---|---|---|
| 1 | `index`, scope `orchestra.s1`, need `research` | Exit code `1`; erro `native-query-need`; sem conteúdo. |
| 2 | `index`, scope `orchestra.s1`, need `flow` | Exit code `2`; `hold`, razão `ownership-store-unavailable`, evidência `["orchestra.s1"]`. |
| 3 | `read`, key `s1.core.research`, `maxBytes: 12000` | Mesmo `hold` por `ownership-store-unavailable`; sem conteúdo do artefato. |
| 4 | `read`, key `s1.subslice03.research-flow`, `maxBytes: 12000` | Mesmo `hold` por `ownership-store-unavailable`; sem conteúdo do artefato. |
| 5 | `read`, key `s1.subslice03.research-maintenance`, `maxBytes: 12000` | Mesmo `hold` por `ownership-store-unavailable`; sem conteúdo do artefato. |

As três chaves previstas foram consultadas diretamente. As consultas 2 a 5 sustentam somente a constatação de impedimento de acesso ao store naquele momento. **Indisponibilidade não demonstra ausência dos artefatos e não responde à pergunta sobre indexação ou confiança no ledger.**

Permanecem indeterminados o significado operacional do warm sem shards, o alcance do marker local, os critérios de prontidão da indexação e as condições de confiança aplicáveis ao conteúdo do ledger. Os campos físicos de uso ou cobrança não expostos são `UNKNOWN`.