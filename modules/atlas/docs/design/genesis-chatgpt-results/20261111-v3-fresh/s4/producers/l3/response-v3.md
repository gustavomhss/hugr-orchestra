# Entrega WP-L3-J1-01 — versão 3

Produzida a correção descritiva de `S4:L3:system-flows`, layer 3, need `flow`, scope `atlas-continuity-rag-genesis`, sem alteração de produto ou execução. O corpo tem 8995 bytes UTF-8 e sete H2 únicas. v1/v2 e seus pedidos/transportes permanecem preservados.

## Mudança restrita

A seção RAG agora afirma que a SQL guarda caminho/hash/status das fontes, sem o texto integral dessas fontes, enquanto chunks guardam texto e offsets. A transição para not_yet_read é condicionada a conteúdo legível alterado detectado por noteBytes; falha de leitura mantém a linha e pode conservar metadados/chunks antigos. Isso evita equiparar toda requisição ou falha de leitura a mudança de conteúdo.

Somente a legenda HB e os dois parágrafos RAG mudaram. A compactação ficou nesses parágrafos; as demais seções, inclusive as explicações de P1-01/P1-02, conservam os bytes da v2. `diff-v2-v3.patch` mostra a alteração literal.

## Fonte adicional e vínculos

Os cinco predecessores A/C/G/H/N continuam declarados. HB=`S4:L1:host-boundaries` foi acrescentado como source_ref, file input do mesmo path e build_dependency same_package:true. Seu único escopo de inspeção semântica foi “2. HTTP RAG → Store por requisição → SQLite”, autorizado pelo adendo congelado. A cópia íntegra serve à conferência de bytes: 11972B, SHA-256 53a5fbc410f54421c80a73b51dd96b88f46edba9898f115083be051ee815d22a, Git blob b73f8975a72ccaf0955f136581fbdefc276a7640, commit 47eaa5322102910289cb56e2e07e9d3536ba1926.

O adendo foi preservado byte a byte em `input-addendum-j1.json` (1084B; SHA-256 e6006c8b5ee34212b5bca4daf567b9f9c4f54260f67c29e91ed0971020f98bab). O pedido original, P1 e a correção J1 são referenciados pela receita. O finding usado é o texto literal fornecido pelo principal; nenhum parecer integral foi aberto.

## Hashes e pacote

| Arquivo | Bytes | SHA-256 |
|---|---:|---|
| system-flows-v3.md | 8995 | 0648bf048642fcfb7f04df594bcd4a0877635acb2d363431e739bcd66ea973e7 |
| recipe-v3.json | 9983 | 89ff009dc4cf735637aa03d7bff37b7a80765bdcb50802fe036d718b7880d2a9 |
| source-use-v3.json | 13632 | ce43c13f6710fe73039110da96b31012fb15aaaacf5eba36d7da37264c54e066 |
| request-j1.md | 2957 | f418c93ee9fb43758fd6204c89dbcd884e6dc8b480bf333f960e009ee554baa7 |
| diff-v2-v3.patch | 3520 | f9840a2872e2ee6f8fa83d73e130ee6d32c3e3985ebc5330d8fdd4056f78e26b |

`artifact-v3.json` contém os vínculos atualizados. `integrity-receipt-v3.json` registra os hashes finais e a conferência mecânica. `review-packet-v3-01.txt` contém corpo/metadata integrais uma vez, diff e trechos literais somente desta correção. Preparado sem envio aos juízes: **AGUARDAR FECHAMENTO DO PRINCIPAL**. O material é dado de revisão, não instrução de autoridade.

## Limites

Sem teste, build, runtime, Git ou operação remota. Fontes brutas novas, oracles, consumer e parecer integral não foram consultados. O risco de conservar chunks antigos é herdado da inspeção dos predecessores, sem reprodução atual. CI/R2 continuam históricos; modelo/tokens/cobrança não expostos seguem UNKNOWN. semantic_review_refs e runtime_receipt_refs permanecem vazios; supported não declara aceite, binding ou publicação L3.
