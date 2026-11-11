## L2B v2 entregue para conferência primária

[continuity-rag-operations-v2.md](sandbox:/workspace/scratch/aff930d22ec7/s4/producers/l2b/continuity-rag-operations-v2.md) mantém **S4:L2:continuity-rag-operations**, layer **2**, need **component**, scope **atlas-continuity-rag-genesis**. Tem **7949 bytes UTF-8**, oito H2 únicas e SHA-256 `4ed332b190be9bcbbd19a7360461b29bce836fb704015077978926376ae5bd2e`.

A correção P1-01 acrescenta as assinaturas de `readPipeline`, `setPipeline`, `openRevision`, `readRevision` e `compareRevisions`. Explica identidade do pipeline, coerções sem validação, membership/snapshot/fill, corpus corrente e condições da comparação. Também registra que comparar todas as perguntas e retornar flags falsos não prova equivalência geral de recuperação; a limitação revisionId/questionId permanece.

A correção P1-02 restaura os últimos cinco passos protegidos, a exclusão da mensagem mais recente no alívio urgente, preservação das primeiras 20 linhas de erros e de erros curtos integrais, economia estimada e archive-before-mask, com sua consequência operacional.

**Todos os 17 arquivos v1 foram preservados.** [input-manifest-v2.json](sandbox:/workspace/scratch/aff930d22ec7/s4/producers/l2b/input-manifest-v2.json) foi congelado antes da correção e acrescenta somente `revision.ts` e `compare.ts`, conferidos contra os bytes/hashes autorizados. Os dois predecessores L1 continuam sendo as únicas dependências de build. Nenhuma outra fonte bruta foi reaberta.

[artifacts-v2.json](sandbox:/workspace/scratch/aff930d22ec7/s4/producers/l2b/artifacts-v2.json) contém os quatro source_refs reais e os file inputs correspondentes. [recipe-v2.json](sandbox:/workspace/scratch/aff930d22ec7/s4/producers/l2b/recipe-v2.json) vincula os pedidos original e de correção; [request-v2.md](sandbox:/workspace/scratch/aff930d22ec7/s4/producers/l2b/request-v2.md) preserva ambos literalmente. [integrity-receipt-v2.json](sandbox:/workspace/scratch/aff930d22ec7/s4/producers/l2b/integrity-receipt-v2.json) registra tamanhos, hashes e preservação da v1.

Os pacotes [review-packet-v2-01.txt](sandbox:/workspace/scratch/aff930d22ec7/s4/producers/l2b/review-packet-v2-01.txt) e [review-packet-v2-02.txt](sandbox:/workspace/scratch/aff930d22ec7/s4/producers/l2b/review-packet-v2-02.txt) aguardam conferência do principal; **não foram enviados aos juízes**. Semantic/runtime review refs permanecem vazios. Sem execução de produto/testes/build, alteração de produto ou escrita GitHub; modelo/tokens não expostos continuam `UNKNOWN`.
