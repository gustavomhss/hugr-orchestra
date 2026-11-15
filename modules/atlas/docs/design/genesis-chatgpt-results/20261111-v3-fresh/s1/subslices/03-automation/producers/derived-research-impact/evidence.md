# Evidências — s1.subslice03.research-impact

## E0. Predecessor e gate exatos

O único predecessor semântico corrente é `s1.subslice03.research-flow`, L2 v3, `need=flow`, em `producers/derived-research-flow/body.md`: **17.124 bytes**, SHA-256 **`f2c19caaa501ea0e135cbbfb4768b4bd68c4e729e5545cb5f80e45c655f52ab7`**, blob Git **`1ceb2496a2185042e3eb564e80828bd85ac08f7f`**. O corpo foi relido integralmente nesta autoria.

A receita efetiva `payload/recipes/derived/research-impact.json`, 9.448 bytes, SHA-256 `68778f6144af73ee575678096eee818fb2a6ec2992572af4594dcf37af15fe7e`, fornece PASS de `parallel-v3-fresh/S1-03/J1` e `parallel-v3-fresh/S1-03/J2` para esses mesmos bytes. Identifica as respostas originais pelos hashes `488cc1430936a338edb5075ce43e24a059f0667804fcecbd61ef3bd0a55eb7d7` e `3a8274022dc6bf53c8e95e00b9bd4e327885848a87dc9622ea73805cc2815f47`. Nenhum parecer integral foi aberto. O estado autoral histórico no texto do L2 não substitui esse gate posterior, e o gate não aprova automaticamente este L3.

O L1 e versões anteriores persistem como contexto cumulativo real, sem aresta semântica direta adicional. O manifesto L2, SHA-256 `a6fa0d012f2d43eceaf033b570ed1cfe4a09f6089c1df1a720e663c2753efeb8`, foi consumido como proveniência expressamente autorizada, não como receita original nem novo predecessor semântico.

## E1. Mapa das afirmações ao L2 aceito

Todas as referências F abaixo são seções da chave e do hash fixados em E0. A coluna de natureza distingue mecanismos relatados de inferência de impacto; nenhuma linha representa execução do produto.

| Trecho L3 | Afirmação ou consequência | Seção exata do predecessor | Natureza e limite |
| --- | --- | --- | --- |
| I0 | Base exata, leitura estática, diferença entre aceite e execução | F0. Entrada, base aceita e alcance; F8. Limites preservados e provas separadas | Autoridade e limite; gate posterior fornecido pela receita |
| I1, base e tabela | Research reutiliza interface backend; receita, dependências, runtime/floors/layout/launcher e readiness | F1. Da receita à prontidão local | Base estática; conjuntos de usos afetados são inferência delimitada |
| I1, compartilhamento | Mudança comum pode atingir caminhos backend/research; pack específico não invalida pares sem relação demonstrada | F1. Da receita à prontidão local | Inferência a partir de reúso e dependências; sem isolamento universal alegado |
| I1, estados/guards | Waiter versus aquisição, cooldown, prefetch, marker, executável; OpenAPI/Cassandra e ausência de qualificação | F1. Da receita à prontidão local | Mecanismos/limites preservados; consequência para decisão de uso é inferência |
| I2, identidade | Chave indexer/shard/path/blob/config/lock/extends, projetos, worktree e ausência de snapshot atômico | F2. Do planejamento ao índice persistido | Base estática; membership/uso a reavaliar não é worklist calculada |
| I2, query e store | Bases/freshness/bounds, rows stale, dirty overlay, existência versus saúde e retenção | F2. Do planejamento ao índice persistido; F3. Da consulta à evidência localizada | Base estática; propagação para consumidores é inferência |
| I2, vazio e build | Origens de warm vazio, source_unavailable e início condicionado de build; erro não prova novo disparo | F2. Do planejamento ao índice persistido; F3. Da consulta à evidência localizada | Preserva literalmente o caráter condicionado de RF-J2-F01, sem nova afirmação de execução |
| I2, conclusões negativas | Limites de overlay, opaqueSites, relações, Locate e semantic absent | F3. Da consulta à evidência localizada | Impacto inferido sobre conclusões de ausência; sem cobertura total ou embeddings |
| I3 | Snapshot/runner/verdict/caps e fronteiras externas; resultado não cobra/captura/admite | F4. Do probe ao resultado que ainda precisa ser retido; F5. Identidade nativa e orçamento da investigação | Base estática; usos a reavaliar são inferência, guard preservado |
| I4, binding/allowance | Identidade nativa, operação, charge, replay/conflito, reserva e publicação incerta | F5. Identidade nativa e orçamento da investigação | Base estática; alcance nos registros dependentes é inferência |
| I4, custódia/locators | Bytes/digest/admissão, representação/parcialidade/derivação, paginação e validação de locator | F6. Da aquisição à fonte admitida e ao locator | Base estática; cadeia de suporte não é invalidação automática observada |
| I4, revisões/inquiry | Evidence/contrary/citações, CAS, evento exato, dispatch e fechamento | F7. Registros, publicação e fechamento de inquiry | Base estática; reavaliação dos dependentes é inferência |
| I4–I5, recibos | Cobrança, aquisição, admissão e publicação distintas; erro não prova ausência de efeito | F5–F7, títulos acima | Não confunde receipt research com binding de transporte Atlas |
| I5, única aresta | O contexto L1 e o manifesto anterior não criam outro predecessor L3 | F0. Entrada, base aceita e alcance; receita L3 e plano público | Regra de construção da tarefa; detalhes do grafo vêm do plano, não de artefatos irmãos |
| I6 | Relação entre tipo de mudança, explicação pertinente e usos a reavaliar | F1–F8, conforme cada linha da tabela do corpo | Síntese inferida; nenhum consumidor/caso foi executado |
| I7 | Limites externos, Modelina/S4 r3 informado, indisponível versus ausente e ausência de provas operacionais | F8. Limites preservados e provas separadas | Limites herdados; relato de transporte não foi reaferido |

## E2. Bases públicas que não são predecessores semânticos

O plano `payload/artifact-plan.json`, SHA-256 `6bf70a5c448d65ec3a046aefc0b0b9db2f783dcd8573a2d2ea69487bec7ce9ad`, sustenta em I5 o grafo declarado research-flow → research-impact → research-maintenance → entry e a separação da cadeia automation-flow → automation-impact. Sustenta em I6 os vínculos públicos A-IMPACT e R-FAILURE. Nenhum corpo irmão, caso reservado ou resposta esperada foi consultado. As referências a níveis posteriores descrevem o plano, sem produzi-los ou liberá-los.

O papel L3 vem de `payload/recipes/derived-contract.json`, SHA-256 `bcde63f79d8cacd030293da38c580c55c5aa58e0a5ff3751f1d1e27971f17588`: relações, impacto e conhecimento/consumidores a reavaliar, com independência entre famílias e navegação distinta de build.

`payload/recipes/derived-public-criteria.json`, SHA-256 `1e7686491c5b68cb4f3d287377723edcd8932ae803c267ddbabf44a360dfc36e`, sustenta as obrigações de I4–I6: GO-A4/5, GO-I3/4/5, AC-05/06 e CC-4. Em particular: autoridade/validade/gaps propagam mesmo com prosa igual; receipt-only pode atualizar bindings sem nova interpretação; resultado válido consumido inalterado interrompe reconstrução; receita, intenção e adição/remoção de fonte entram no impacto. O corpo identifica isso como contrato público, sem declarar que o runtime já passou nesses ensaios.

A distinção entre SHA-256 de transporte e versão real de input Atlas vem de `inputs/references/transport.md`, SHA-256 `02dbf78b9eb76c894d07c9e498704d2260157b7b10d5e1d159a0fd1037e73e3c`. Essas autoridades públicas compõem a receita e os critérios; não acrescentam uma segunda aresta semântica de produto.

## E3. Proveniência cumulativa e execução efetiva

Foram lidos/conferidos os 15 arquivos enumerados e as três unidades adicionais permitidas: receita L3, request e dispatch original. Tamanhos, SHA-256 e blobs Git dos 15 pins coincidiram. As autoridades públicas já haviam sido lidas integralmente neste mesmo contexto; o L2 aceito foi relido integralmente. O manifesto anterior foi analisado integralmente como JSON de proveniência. Nenhum irmão não enumerado foi reaberto nesta etapa.

O manifesto novo conserva **58 unidades integrais únicas**, **677.138 bytes de contexto**: 45 do manifesto anterior, dez outputs L2 v3 já efetivamente lidos nas verificações daquela etapa e três controles L3 novos. Dessas unidades, **18 foram lidas/verificadas nesta tarefa**; **40 foram conservadas sem reabertura**, com identidades herdadas e esse limite explícito. Bytes de contexto não são tokens/custo. Os aliases históricos e caminhos originais permanecem distintos; nenhum output deste L3 é auto-input.

O request permanece SHA-256 `fe6b14e0f21ae1f13b15255b79ae1601cce467df536d58464d74ab18046e287b`. O dispatch original tem 1.546 bytes e SHA-256 `28dcc55a79e9d1372cee574c7bdb7b5f7d7154f3e29c98af1f8b52ca9b24565e`. Os controles posteriores de continuação/status foram conservados literalmente no manifesto como contexto visível, sem criar parecer ou novo gate e sem substituir o dispatch original.

Dois rascunhos tiveram a gravação barrada por checagem de tamanho (16.999 e 14.013 bytes); nenhum body foi escrito por essas tentativas. O body final foi gravado uma vez, com **13.972 bytes** e oito cabeçalhos depth2. Isso é verificação de autoria, não teste de produto ou falha de capacidade do host. Não houve reinício ou produtor duplicado.

## E4. Escopo de revisão e limites

O conteúdo contribui para GO-A1/2/3/4/5, GO-I1/2/7/8, QS-1/2/3/5/6, CC-1/3/4/7 e AC-01 local. O mapa permite julgar suporte e utilidade; não é uma matriz de PASS. Reúso, propagação, independência operacional e consumidores exigem suas provas próprias. Não há self-PASS nem aceite global.

**NOT_RUN:** produto, testes/typecheck/guards, rede/provider, runtime/binding/importação/publicação/leitura Atlas, consumidores e manutenção. **UNKNOWN:** tentativas físicas do host, tokens e custo. Somente o L3 solicitado foi produzido; nenhum L4 foi liberado ou redigido.
