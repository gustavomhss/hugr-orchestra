## C-change — comparar K=4 e K=6 no RAG Studio

Para comparar o mesmo conjunto de documentos:

1. Confirme que as fontes foram admitidas e lidas, e que seus hashes/status continuam compatíveis. Conteúdo alterado pode marcar a fonte `not_yet_read`; busca exclui fontes não lidas ou com hash incompatível.
2. Mantenha o pipeline lexical e altere somente `k`: crie uma revisão com K=4 e outra com K=6. A API expõe fontes, pipeline, revisões, busca, pergunta, provas, comparação e passes; a borda aceita `k` como inteiro sem demonstrar validação de positividade.
3. Compare as revisões usando o mesmo `proofSetId` e uma única mudança de campo, sem passes. Confira os traces/provas pelas identidades corretas: `ask` grava trace com `revisionId`, enquanto a prova procura por `questionId`; o adaptador não faz essa conversão.

A mudança pretendida é o parâmetro K e, portanto, a identidade da revisão; as fontes e seus hashes devem permanecer iguais. Aumentar K pode alterar hits e resultados, mas a comparação permite afirmar apenas a diferença observada no conjunto de provas selecionado. Não prova equivalência ou replay com flags falsas, nem resultado de modelo: ask retém K sem modelo. [ `S4:L1:host-boundaries`, seção “2. HTTP RAG → Store por requisição → SQLite”; `S4:L3:system-flows`, seção “Da requisição RAG à evidência de seleção” ]

## C-violation — mascarar saídas de `context_recall` e `task`

A proposta não é compatível com o contrato descrito. Máscara só é tentada quando `context_recall` está no conjunto materializado de ferramentas; ferramentas de recall, planejamento, delegação e revisão estão protegidas contra mascaramento. Se a ferramenta de recuperação não está disponível, a condição para tentar a máscara não se cumpre. Além disso, candidatos precisam economizar tokens estimados e ser arquivados antes de a máscara ser adicionada.

Para manutenção, comece em `modules/continuity/src/v2/masking.ts` e `modules/continuity/src/v2/strategy.ts`; regras de ferramentas protegidas também estão em `modules/continuity/src/masking-rules.ts`. [ `S4:L1:continuity-rag`, seção “Masking contract”; `S4:L3:system-flows`, seção “Do turno à redução recuperável do pedido” ]

## C-impact — mudança em `authority.basis` e link de navegação

A unidade cuja base mudou precisa ser reavaliada: o resultado completo inclui autoridade, validade, gaps e evidência, então prosa idêntica não garante o mesmo resultado ou receipt. Reavalie dependentes alcançados pelas dependências semânticas declaradas e produza vínculos/receipts atuais para os resultados afetados.

O link de navegação na unidade independente é consulta, não aresta de build. Resultados e receipts de unidades não afetadas podem ser reutilizados quando seus hashes precisos de inputs, contrato e dependências permanecem válidos. Ainda é necessário conferir o grafo; proximidade ou navegação, por si, não exige refazer autoria. [ `S4:L2:atlas-system`, seção “Por que texto igual pode exigir outro resultado”; `S4:L3:system-flows`, seção “Mudanças propagam por resultados e vínculos” ]

## C-failure — fonte obrigatória mudou e ativação falhou

Não trate o manifesto antigo como automaticamente atual nem retome o candidato com pareceres antigos como se a mudança não tivesse ocorrido. Comece pela porta corrente e preserve HOLD/recusa como diagnóstico; consulte histórico apenas com `historical:true`, que mostra o passado sem validar seus inputs hoje.

Preserve o candidato exato, CAS e recibos. Prepare/reconstrua observando novamente as fontes e os bindings atuais; indisponibilidade obrigatória mantém HOLD. Resultados duráveis podem ser reutilizados quando os vínculos exatos continuam válidos, mas candidato ou binding alterado requer binding novo. Publicação deve passar pelas portas existentes e gates de política, provenance e ratificação. Não reescreva recibos antigos. [ `S4:L3:system-flows`, seção “Após falha, separar recuperação de nova publicação”; `S4:L1:native-runtime-delta`, seção “Consumo e manutenção pela porta real” ]

**Limite:** a evidência retornada descreve contratos e inspeção estática, não execução destas mudanças. A síntese Atlas também declara que cobrança e tentativas ocultas não são medidas por bytes, reuso ou chamadas lógicas; o que não é exposto permanece `UNKNOWN`.

**Keys usadas:** `S4:L3:system-flows`, `S4:L2:atlas-system`, `S4:L1:continuity-rag`, `S4:L1:host-boundaries`, `S4:L1:native-runtime-delta`.