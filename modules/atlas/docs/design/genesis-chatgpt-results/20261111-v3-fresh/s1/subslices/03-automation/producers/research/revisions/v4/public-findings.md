# ROOT-R-L1-F01 — condição de disparo em R8.1

A principal conferiu novamente a fonte já capturada no baseline 1cde2ff7a71bcf7aecb5d030917b577165135d38. A frase literal do L1 v3 R8.1 é: “Se não há shard aberto, dispara build detached e devolve building/unavailable com motivo, sem fabricar resultado vazio limpo.” Ela transforma o disparo em consequência incondicional.

Em packages/core/src/research-toolkit/code-index/query.ts:176–225, shards.length===0 retorna index_unavailable antes da tentativa. O disparo detached em 204–205 depende de missing && !building && ctx.extract; building inclui progresso do plano ou construção de shard. A ausência de resultado útil pode retornar building/unavailable sem que essa chamada tenha iniciado trabalho novo. Missing também cobre fallback stale: não restringir a regra de disparo exclusivamente a zero ready shards.

Corrigir somente a afirmação de R8.1, conservando o contrato completo observado e a distinção entre erro retornado e disparo efetivo. Atualizar somente os mapas/evidências atuais diretamente atingidos, se necessário, preservando o registro histórico. Critérios já existentes: QS-1, CC-3, GO-A1 e GO-A5. O achado da principal não contém oracle nem resposta de consumidor. Os PASS anteriores permanecem vinculados aos bytes v3; o corpo corrigido exige o mesmo par de juízes.
