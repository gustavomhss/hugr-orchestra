# Genesis 20261111-v1 — S2: produção e atualização

**Estado: BLOCKED para produção dependente e revisão adicional. A campanha não está concluída; nenhuma camada atual foi produzida ou aceita.**

Fonte: `1cde2ff7a71bcf7aecb5d030917b577165135d38`. Protocolo e checkout original: `2689c516d63488be37de678cc853dd4556fd5c13`. `candidate_revision` permanece nulo: S5 ainda não integrou as propostas. Os previews isolados, comandos, falhas e hashes estão nos recibos; não são uma implementação candidata aceita.

## Execução concreta desta continuação

O inventário recuperado da S1 foi conferido em 60 partes, 126 membros e 105 shards de ownership. As 14.442 fontes e os 86 bloqueios correspondem ao observador real, sem divergências. O escopo contém 83 domínios, 188 necessidades, 21 fluxos e 269 artefatos: L1=83, L2=86, L3=21, L4=79. Há 603 dependências de build entre os scopes de domínio/fluxo; isso requer um mapeamento explícito para o manifesto cumulativo do runtime.

A adaptação de captura foi implementada em preview e executada sobre **todas as 14.442 fontes**. Produziu 14.440 capturas com conteúdo e modo conferidos: 14.434 arquivos, cinco blobs históricos de `.atlas` e um link simbólico literal. Não houve divergência de bytes, SHA-256, blob Git ou modo. As duas imagens `docs/images/readme/atlas-graph-{dark,light}.png` seguem ausentes; os bytes não foram reconstruídos. A primeira execução dos 86 casos revelou dois `.atlas` aninhados com conteúdo binário; a correção introduziu leitura binária no seam Git existente e foi reexecutada. Os dois resultados estão preservados.

Essas são capturas de fonte e evidência de execução do adapter proposto, não produção semântica. Os testes não foram executados localmente. Typecheck do pacote, composição ordenada dos quatro patches e bundle dos dois CLIs terminaram com exit 0. Foram conferidos 18 arquivos resultantes da composição; o checkout original continua limpo. Há 31 casos de CI preparados, todos `NOT_RUN`.

## Propostas atuais para S5

Aplicar na ordem registrada em `proposals/integration-packet-v5.json`:

1. Importador nativo v5: preserva respostas e recibos originais, reuso histórico explícito e pares atuais; acrescenta controle compacto de escopo para a população inteira.
2. Rebuild boundaries v3 já entregue: restringe inputs, preserva snapshots e exige bytes/receita declarados.
3. Captura de fontes v1: rotas explícitas para bytes/modo, link literal, fonte Git histórica e membership; não altera os limites do namespace `file:` nem concede autoridade a `.atlas`.
4. Ponte de rebuild nativo v1: chama o executor existente, persiste pedidos quando faltam respostas ou pareceres e valida originais e ambos os juízes antes de produzir um manifesto candidato. Não cria planner, cache ou publicação paralelos.

Os novos patches são propostas de autoria, aguardando revisão técnica independente, integração S5 e CI. Os primeiros builds que falharam também permanecem nos recibos. A revisão técnica antiga do rebuild não é reapresentada como aprovação dessas mudanças novas.

## Originais, reuso e economia

Três subagentes nativos distintos realizaram os cinco turnos anteriores preservados: importador, rebuild, reuso, revisão técnica e correção. O principal é o sexto pacote e retomou a preparação por instrução explícita do proprietário. Não houve novo turno de subagente, produção semântica ou juízo vinculante nesta continuação. A quota S2 continua em seis unidades na alocação `bootstrap-v3-original-reconciliation`; não foi consumido o envelope de produção ainda proposto. Tokens, tentativas físicas e cobrança são `UNKNOWN`.

O corpus histórico continua intacto: 20 corpos, dez reviews, suplemento e derivações operacionais já conferidos. Fonte igual permite candidatura de reuso, mas não substitui o binding atual. O importador preserva limites comparativos e originais indisponíveis, sem fabricar uma resposta nativa antiga. Os oráculos reservados dos consumidores não foram expostos ao produtor.

## Dependências que impedem concluir

S1, sequência 5 em `950e531d036a29be303a052382e55f31377ad7e8`, vinculou o inventário recuperado para julgamento, mas mantém preparação apenas e quota S2=6. `S2-S1-PREP-002` pede três unidades para revisão técnica, correção delimitada e revisão do delta. A produção requer a alocação derivada do escopo, a disposição de autoridade/captura e o mapeamento de scope/routing. A ausência das duas imagens precisa de transporte binário exato ou de uma receita de metadados explicitamente aprovada e limitada.

S5, sequência 5 em `adfcbc639d31d2ae01f72e58d21f2657d5c6b63c`, ainda não apresenta candidato integrado, dupla atual ou decisões sobre as camadas S2. `S2-S5-INTEGRATE-005` entrega a sequência concreta de patches e recibos. S2 não pode assumir os papéis dos dois juízes nem operar os agentes de outra conversa.

L1 completa deve ser produzida e aceita pelos dois juízes antes de L2; a mesma barreira vale para L3 e L4. Produção atual, importação histórica atual, cache/rebuild de campanha, publicação e consumo governado permanecem `NOT_RUN`. AC-04/05/06, CC-2/3/4 e SC-3 continuam `INDETERMINATE`. Esta entrega preserva trabalho concreto e os impedimentos; não declara conclusão ou revisão OK.

## Evidência reproduzível

`source-evidence-v2/manifest.json` vincula os relatórios grandes por SHA-256, gzip e partes. `tools/restore-segmented-evidence.py` restaura os bytes exatos e recusa hashes divergentes. `receipts/whole-source-capture-summary.json` apresenta os totais e as duas fontes ausentes. `handoff.json` é o ponto de retomada com commits e hashes imutáveis.
