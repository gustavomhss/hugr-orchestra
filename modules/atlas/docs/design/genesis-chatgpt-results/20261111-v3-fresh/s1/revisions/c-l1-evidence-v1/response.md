**Suplemento R1–R4 concluído e pronto para conferência da principal.** Nenhum envio aos juízes foi realizado. Os dez corpos, os registros congelados e os arquivos em `output/` permanecem inalterados; nenhum produto ou teste foi executado.

Diretório exclusivo: `/workspace/scratch/2b46fb541868/genesis-s1/revisions/c-l1-evidence-v1`.

## Entregáveis principais

| Arquivo | Bytes | SHA-256 |
| --- | ---: | --- |
| [c-l1-evidence-v1.tar.gz](sandbox:/workspace/scratch/2b46fb541868/genesis-s1/revisions/c-l1-evidence-v1/c-l1-evidence-v1.tar.gz) | 221.304 | `80d65faad2bdfbdefa7d74d51ca2e7e3c6e69115ddf6ebf4cfd941aac7a0f4d5` |
| [supplement.md](sandbox:/workspace/scratch/2b46fb541868/genesis-s1/revisions/c-l1-evidence-v1/supplement.md) | 203.995 | `10b7e677eba2129608f7d4dde3edeaa6f9d1e5d5fef819babb737b7a0ada46e7` |
| [package-manifest.json](sandbox:/workspace/scratch/2b46fb541868/genesis-s1/revisions/c-l1-evidence-v1/package-manifest.json) | 10.460 | `3d0ca72eee68f45bed478a8f2f4b8b2e6723c579a3285b8fa8330c06e8e90f81` |
| [verification.json](sandbox:/workspace/scratch/2b46fb541868/genesis-s1/revisions/c-l1-evidence-v1/verification.json) | 1.672 | `1968965badb375c7a34244631f4980cac8f4bb728e4b27fbb12d56d25123dcc0` |

O arquivo compactado contém **64 arquivos de conteúdo e o manifesto**, totalizando 65 entradas. O pacote completo para leitura sem ferramentas está em `supplement.md`.

## Cobertura entregue

- **R1:** projeção dos dez artefatos e das 323 entradas, com 60 grupos de disposição, 15 justificativas originais, profundidades, famílias, needs e todos os 39 fixtures/mídias metadata-only discriminados. Os **26 textos originais de gaps** foram preservados. As **sete propostas de classificação** estão identificadas como novas e separadas dos valores congelados; indicam a aceitação dependente bloqueada, a evidência necessária e os owners concretos ainda não resolvidos.
- **R2:** grupos completos **C04, C06, C10, C17, C39 e C43**, byte a byte iguais ao arquivo congelado, incluindo seus nove excerpts originais.
- **R3/R4:** **104 spans adicionais**, organizados em 34 grupos, extraídos de **48 fontes já capturadas**. Cobrem os mecanismos solicitados, os contratos associados aos grupos restaurados, a documentação Claude e os dois lados da discrepância de configuração.

Cada excerpt foi conferido contra a captura por linha, comprimento e SHA-256. As 48 fontes usadas também conferem com o Git blob e o SHA-256 originais. O índice registra o offset dos bytes de cada excerpt dentro do respectivo grupo. As verificações de arquivo compactado, projeções, membros dos grupos e identidades dos corpos também concluíram sem divergência.

As propostas novas preservam os bloqueios para afirmações dependentes sobre host lifecycle/policy, adoção pelo Core, qualificação de runtime, branches não examinados e relação schema/decoder. Os 39 casos metadata-only continuam `not_read` e `classification_only`. A discrepância de configuração continua aberta.

O [registro de achados e propostas de correção](sandbox:/workspace/scratch/2b46fb541868/genesis-s1/revisions/c-l1-evidence-v1/findings-and-proposed-body-fixes.json) não registra contradição estabelecida nos spans solicitados nem propõe alteração de corpo. Isso não constitui veredito semântico.

O [delivery-receipt.json](sandbox:/workspace/scratch/2b46fb541868/genesis-s1/revisions/c-l1-evidence-v1/delivery-receipt.json) reúne os hashes das seções e os totais; seu SHA-256 é `c0ada8e30082fc0d0a95524b378aaa41e25e275d20b58ea461f818306d1a19e9`. A receita e os arquivos de request/steering preservam as instruções efetivamente usadas.
