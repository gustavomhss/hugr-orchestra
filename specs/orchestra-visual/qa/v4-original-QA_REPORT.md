# QA v4 — pacote executável de planejamento

**Escopo aprovado por esta verificação:** estrutura, coerência de estágios revisados e tooling de controle. **Fora desta verificação:** implementação do frontend, cobertura efetiva do checkout completo, benchmark do Orchestra e Electron.

| Verificação | Resultado desta revisão |
|---|---|
| Testes únicos de ferramentas | 133 PASS;83 preexistentes +50 regressões adicionais. |
| Grafo | 143nós /4épicos /10issues /25subissues /38WPs /66tasks. |
| Axiomas | 715grupos explícitos /1.936critérios identificados. |
| Projeções locais | 39issues Markdown + MAP/OWNERSHIP regenerados e conferidos. |
| Referência | PNG original1672×941; SHA-256 e839b759e0f93beca37b10cd45700725020a840fee6e97da1e67556b2ffb128d. |
| Primeiro piloto |15pré-requisitos executáveis; não espera settings/providers/Janitor completos. |
| Inventário |74registros mistos, não74telas testadas. CENSUS real ainda UNRESOLVED. |
| Readiness inicial |Somente S01-W1-T1;zero tasks de implementação aprovadas. |
| GitHub |Consulte GITHUB.json/publicação; não assumir sincronização de corpos ou relações nativas. |

Logs finais em qa/tool-tests-v4.log; IDs únicos e limites em qa/test-inventory.json; reparos e testes por achado em FINDINGS-RESOLUTION.json. Referências históricas ficam em qa/history, nunca como resultado atual.

Os testes adaptados não dispensam invariantes anteriores: fixtures agora carregam normas, esquema3, matrizes de captura e observações brutas. Testes da ordem de integração incluem o novo piloto. A expectativa de source-map foi substituída pelo canônico SURFACES; testes novos verificam que o censo é realmente consumido. Registros sintéticos não são exportados como evidência de produto em progress.json.

A verificação de hashes prova correspondência de bytes, não verdade dos resultados. O validador recalcula as métricas; a coleta real continua sendo responsabilidade de S02/S23. A revisão de microacabamento continua exigindo capturas reais e inspeção de cada superfície/estado pertinente.

**Condição de início:** pacote válido → S01 no checkout real. **Condição de rollout:** candidato integrado + todos os gates pertinentes no mesmo SHA/build. Não reaproveitar PASS da v3 nem da preparação documental como prova do produto.
