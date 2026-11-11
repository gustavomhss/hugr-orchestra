# Entrega WP-L4A — entrada e ownership

Produzidos dois documentos operacionais de layer 4, scope `atlas-continuity-rag-genesis`, na área exclusiva l4a. `entry.md` tem 4908B; `ownership.md`, 9489B. Não se declara aceite, binding, publicação ou consumo L4.

## Entrada utilizável e limitada

A entrada começa por index/read reais, com JSONs de controle gravados no CWD `modules/atlas` usado pelos comandos. Ensina seleção por key/H2, histórico explícito e parada por suficiência, limite ou HOLD/erro/gap. A tabela encaminha os onze intermediários e indica a pergunta de cada rota. O caminho profundo é opcional: 12 read incluindo a entrada, 52252B de intermediários e 57160B com o corpo atual; limite superior com entrada de 5000B é 57252B, abaixo de 62000. A rotina termina na entrada quando suficiente. Corpo devolvido não mede IO, tokens ou custo.

## Ownership e qualificações conservadas

O guia separa corpo/resultado/receipt/seleção, autoridade e observação; explica impacto por dependências e recuperação sem transplantar recibos. Distingue Atlas fora de Session do default SessionCompaction e da substituição Continuity. Preserva arquivo antes da máscara, histórico, cauda/erros/ferramentas protegidas e limites do recall. Em RAG, mantém fonte versus chunk, conteúdo legível alterado versus falha de leitura, snapshots sem congelamento do texto, condições exatas e limites das flags de comparação e gaps trace/prova/seq. Os caminhos externos servem para encaminhar contratos aos donos, sem autorização de correção fora da propriedade.

## Fontes e conferência

Cada artefato depende diretamente da L3 aceita. Entrada usa também A/N e duas fontes auxiliares CLI/formato; ownership usa A/C/B/N e masking-rules.ts. Os demais intermediários da entrada são rotas derivadas do catálogo do manifesto, com navegação explícita. Nenhum L4 é fonte ou build dependency de outro L4. As oito capturas correspondem aos pins fornecidos: payload `c4a2992369f2309cbb5ffb8f166abbd7c3b81a4c`, CLI/formato em 1b5a4801acfae03969f78ee766ca6f0b7d0f9013 e masking no baseline.

`source-use.json` separa conteúdo semântico, precisão auxiliar e catálogo. `recipe.json` preserva pedido, steering, critérios e vínculos reais. Os pacotes de revisão apresentam os corpos e artifacts.json integrais uma vez, mais sustentação literal delimitada com offsets/hashes. Permanecem sem envio: **AGUARDAR FECHAMENTO DO PRINCIPAL**.

## Identidades e limites

- entry.md: SHA-256 415a5c31d006fea281ad650f4774dffeab5d913b667976f0ff4977f10a2fdacd.
- ownership.md: SHA-256 fdae8ea1d976abce4681ac8587d5ca8f54ceb6b381e1078592e6c2e5b8ed5e73.
- recipe.json: SHA-256 f49887fa41d3f73c1121a56181e3e65eb27583718950710e5ddccf1b15437068.
- source-use.json: SHA-256 7d6e982825a5ac0ca6722a3022dd2726e6024b7caa2193f5f67c00c500cb91c9.

Hashes e tamanhos finais dos demais arquivos constam de `integrity-receipt.json`. A conferência é estática de arquivos/bytes/declarações; nenhuma query de produto, teste/build/runtime/Git ou escrita remota foi executada. Não foram abertos oracles, pareceres ou consumidores. Driver/CI e runtime-release canônico não foram usados como novas fontes. Permanecem limites de instalação, autenticação, atomicidade, recuperação geral e gaps RAG. Modelo/tokens/cobrança não expostos são UNKNOWN. semantic_review_refs/runtime_receipt_refs vazios refletem a etapa anterior a revisão/publicação, não satisfazem o gate nativo de reviews.
