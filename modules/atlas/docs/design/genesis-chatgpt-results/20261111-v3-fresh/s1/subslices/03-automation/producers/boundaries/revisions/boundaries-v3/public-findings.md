# ROOT-BND-L1-F01/F02 — fidelidade de trial e intervalos RAG

A principal conferiu novamente duas afirmações no L1 v2 contra as fontes já capturadas no baseline 1cde2ff7a71bcf7aecb5d030917b577165135d38.

F01, §3.2: “Seu caráter de dry grading evita avanço/ledger” atribui grading a trial. Em packages/core/src/relay.ts:420–481, trial verifica trust, shell, prepara comando/ambiente, usa ToolSafetySandbox.wrap, executa e retorna exitCode/timedOut/output/truncated/durationMs. Não chama grading nesse percurso. Remover a atribuição; preservar que o shell pode produzir efeitos e que a execução não equivale à avaliação/registro. Conservar separadamente check sem stateDir e caminhos do avaliador, sem ampliar garantias de sanitização.

F02, §6: “chunks com texto/linhas/hash/boundary” dá uma unidade não demonstrada a start/end. packages/core/src/rag-studio/sql.ts:19–32 define start e end como inteiros; este schema não declara que sejam números de linha. Usar os campos/intervalos sem inventar unidade. Não adquirir fonte externa para tornar verdadeira a afirmação; explicar o alcance desta evidência.

Corrigir somente essas duas afirmações e os mapas/evidências atuais diretamente atingidos, preservando histórico. Critérios já existentes: QS-1, CC-3, GO-A1. Nenhum oracle, parecer integral ou resposta esperada de consumidor está incluído. O achado da principal preserva os pareceres anteriores vinculados aos bytes v2, sem promover esse histórico a aceite da próxima revisão.
