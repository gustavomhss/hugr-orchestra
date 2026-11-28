WP-L3-J1-01 — correção obrigatória e reavaliação. Mesmo produtor nativo, diretório exclusivo /workspace/scratch/aff930d22ec7/s4/producers/l3. Preserve v1/v2 e seus pedidos/transportes. Produza corpo, artifact, recipe, response, source-use e integrity-receipt v3, além deste pedido literal request-j1.md. P1-01/P1-02 já resolvidos; evite mudanças não necessárias.

Finding original do juiz J1, sem reescrita:
{
  "id": "L3-J1-01",
  "criteria": ["AC-01", "CC-3", "CC-7", "QS-1", "GO-I8"],
  "location": "Da requisição RAG à evidência de seleção, primeiro e segundo parágrafos",
  "expected": "Distinguir metadados persistidos da fonte do texto/offsets persistidos nos chunks. Explicar que noteBytes marca not_yet_read quando detecta conteúdo legível alterado; falha de leitura não equivale automaticamente a essa transição.",
  "observed": "O corpo afirma genericamente 'SQL persiste metadados, sem texto integral' e depois 'NoteBytes marca not_yet_read'. A primeira perde a distinção entre fonte e chunk; a segunda perde a condição de mudança. Isso pode induzir a conclusão de que o texto depende sempre do arquivo vivo ou de que toda requisição reinicia o status.",
  "evidence": "C distingue a fonte, os chunks e o ciclo carregar–operar–salvar; seu diagnóstico preserva mudança de conteúdo versus falha de leitura. A sustentação cumulativa de C já recebida, S4:L1:host-boundaries §2, explicita que fontes persistem caminho/hash/status e que chunks persistem texto e offsets.",
  "required_correction": "Qualificar a afirmação SQL por entidade, preservando explicitamente o texto dos chunks. Repor a condição de mudança de conteúdo em noteBytes e a distinção de falha de leitura. Corrigir somente a descrição e seus vínculos de versão, mantendo o teto de 9000 bytes e preservando v2. Não é solicitado conserto do produto nem nova execução."
}

Extensão progressiva congelada ANTES desta correção: /workspace/scratch/aff930d22ec7/s4/dispatches/l3-j1-input-addendum.json, 1084 bytes, SHA-256 e6006c8b5ee34212b5bca4daf567b9f9c4f54260f67c29e91ed0971020f98bab. Autoriza apenas o L1 aceito S4:L1:host-boundaries, seção “2. HTTP RAG → Store por requisição → SQLite”, com cópia local e commit/path/blob/SHA exatos no manifesto. Copie o manifesto byte exato. Se usar HB, declare source_ref/file input/build_dependency same_package. Os cinco predecessores já usados continuam; fonte bruta nova proibida.

Mantenha <=9000 bytes e H2 únicas, sem sacrificar qualificações decisivas. Sem teste/build/runtime/Git, oracle ou parecer integral; semantic_review_refs/runtime_receipt_refs vazios. Prepare pacote literal v3 <=32000 bytes com corpo e metadata integrais uma vez, diff v2→v3 e trechos literais decisivos somente para esta correção; os juízes conservam a revisão anterior. Não envie ainda; aguarde conferência do principal. Encerre ao congelar os hashes e a resposta original.