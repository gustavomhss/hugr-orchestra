# Receita v4 — acessibilidade de navegação em L4 entry §3

Produção original desta correção por `/root/s3_l4_producer` em `2026-11-28T07:25:36Z`, execução `15cc9853-0e71-4950-8813-0bfb66f82c8a`. Estado no momento da correção: `REVIEW_REQUIRED`; o produtor não concede aceite.

## Pedido e fontes

`request-v4.md` preserva literalmente o pedido da principal. A descrição de `index(scope, need)` e `Read(key, section, maxBytes)` deriva da observação estática da principal na porta S4 pinada em `db9b423`; este produtor não executou a porta nem promove essa informação a prova de runtime.

Foram extraídos somente os metadados H2 de dois corpos L1 originais aceitos: `s3-provenance/files/bodies/l1-relay.md` e `s3-provenance/files/bodies/l1-integrations.md`. Seus bytes/SHA-256 e as linhas originais dos cabeçalhos estão em `response-v4.json`. O conteúdo das seções não foi reescrito nem transformado em respostas esperadas. Nenhum oracle, caso reservado, julgamento ou output de consumidor foi aberto.

## Preservação e linhagem

Antes da gravação do entry v4, os dezesseis arquivos ativos da entrega v3 foram copiados byte a byte para `revisions/v3/`. As áreas `revisions/v1/` e `revisions/v2/` e os registros anteriores não foram alterados. O novo recibo identifica entry v4 e os outros três corpos idênticos ao conjunto v3; os recibos anteriores continuam descrevendo suas versões originais.

## Extração determinística

Para cada fonte UTF-8, selecionar somente linhas que começam com `## `. Conservar a linha completa como metadado de origem e obter o valor de `section` por `line[3:]`, sem normalizar caixa, número, acentos, pontuação ou espaços. Foram extraídos 7 títulos de Relay e 11 de integrações.

Associar esses títulos respectivamente a `s3-l1-relay` e `s3-l1-integrations`. Inserir o catálogo, com a explicação de leitura por seção, imediatamente antes do parágrafo final de entry §3 que começa com `Abra a menor rota`. A substituição literal e o texto completo da inserção estão em `response-v4.json`.

## Verificações documentais realizadas

1. Conferir os hashes das fontes L1 e dos quatro corpos ativos v3 contra os recibos existentes.
2. Conferir a cópia integral dos dezesseis arquivos v3 antes da edição.
3. Comparar os 18 textos do catálogo com os H2 extraídos, em ordem, sem transformação semântica.
4. Remover em memória a inserção registrada e exigir igualdade byte a byte com entry v3; conferir também que prefixo até §3 e sufixo desde §4 permanecem idênticos.
5. Reproduzir `changes-v4.diff`, conferir UTF-8/newline final e o limite de 16.000 bytes; entry também fica abaixo de 10.000 bytes.
6. Conferir que os demais três corpos, registros anteriores e fontes permanecem byte-idênticos.

Essas verificações são de texto e identidade de arquivos. Não houve testes de produto, execução de API/produto, build, runtime, CI, live, Atlas ou GitHub. A correção trata da acessibilidade documental descrita pela principal; não é recuperação de originais históricos nem novo resultado runtime. A principal enviará o delta ao mesmo par de revisão, e recibos externos determinarão qualquer liberação futura.
