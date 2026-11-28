# Seleção S3 v4 — montagem mecânica

O payload v4 foi montado após conferir o release real
`s3-resume-work/releases/L4-adoption-v4.json` da principal e os dois pareceres
PASS que ele cita para os quatro corpos L4 atuais. Não houve julgamento novo,
execução de produto, teste, API ou escrita remota por este builder.

## Payload pronto para a principal

| Campo | Valor |
|---|---|
| Manifesto de staging | `payload-files.json`, 176 arquivos |
| Pacote canônico | `modules/atlas/docs/design/genesis-chatgpt-results/20261111-v3-fresh/s3/native-package.json` |
| Artefatos | 11 |
| SHA256 do pacote | `e2bec9aadf58327d7ae72c991c581a03089ee6dce165595fa802e4923c58ccde` |
| Git blob do pacote | `8eea7cc11e93ea37d5a427df1ca5630c1ee47b26` |
| Bytes do pacote | 1164616 |
| Commit P real do payload v4 | `6c28b6da92a45d6c26490389b4813b8ba4849065` |
| Tree de P | `f1fa81f0b2790a50bf55940ac68630c8c0031345` |

A nova entrada tem **7764 bytes**, SHA256
`a5e1bf88aa6c17470c2832c99049dba76867615279689db85d25e2fe8b39e9ef`.
Sua recipe/request/response são `recipe-v4.md`, `request-v4.md` e
`response-v4.json`. Manutenção conserva os recibos de saída v3; ownership e
operacional conservam os de saída v1. Os quatro recebem os pareceres reais v4.
O builder confere os campos de output dos recibos, nunca um hash de input ou de
versão anterior.

Os três corpos L1 e suas referências históricas permanecem iguais. L2 e L3
conservam seus releases e recibos já selecionados. Todas as references novas
usam `payload_path` no prefixo `s3/resume-20261128/`.

## Gate real conferido

- Release L4 v4: SHA256 `8346500e7604876edadefab1af967bc2691cdc62355236bbefb0456b3be0639b`.
- J1 L4 v4: SHA256 `bdca866b628f399b35783ca339886f2aeb6ad5c91706fe07a06fd1777c18cf08`, 4833 bytes.
- J2 L4 v4: SHA256 `216d1f335590509de8cfe008ff42efd2eee35b5941eb94bc5432386f569b10c1`, 4769 bytes.

`gate-report.json` contém a conferência dos hashes/tamanhos dos corpos, execução,
autoridade `/root`, identidades dos revisores, decisões reais e ausência de
findings obrigatórios abertos. Os builders copiados em v4 recusam releases L4
anteriores a v4 e só escrevem dentro deste diretório.

## Preservação v3

Os builders originais, o payload original e seus relatórios permanecem intactos
em `s3-selected-finalization/`; `builder-copy-provenance.json` registra suas
identidades antes da cópia.

O payload v4 também inclui um arquivo histórico explícito sob
`s3/resume-20261128/lineage/selected-v3-caae29c/`: pacote v3, seus onze corpos,
transformação, relatório/recibo de montagem e readback. Cada arquivo de payload
v3 copiado foi comparado ao manifesto e ao readback real de
`caae29c9ae560d49859b67c52c81e66c2a3b078e`. O manifesto dessa cópia está em
`v3-lineage-archive.json`.

As revisões autorais `revisions/v3`, os pareceres, releases e transmissões v3
permanecem byte a byte, junto com v1/v2 e os novos registros v4. Nenhuma identidade
de candidate, binding ou prepare v3 é atribuída ao pacote novo.

## Input lock

O pré-inventário em `input-lock.preflight.json` está resolvido:

| Medida | Quantidade |
|---|---:|
| File inputs | 4601 |
| Members roots | 45 |
| Paths estritos | 309 |
| União exata de paths do lock | 4639 |
| SHA256 prévios conhecidos | 321 |
| SHA256 a medir, exclusivamente baseline-only | 4318 |
| Referências/identidades sem resolução | 0 |
| Conflitos | 0 |

Os 4590 file inputs originais estão preservados. A materialização da membership
de protocolo contém 21 arquivos e continua separada de `lock.files`; seus 16
descendentes que não são file inputs não são acrescentados à união exata.
Nulos de SHA256 só são admitidos nos inputs baseline-only já fixados por SOURCE,
Git blob e tamanho. Não há nulo em referência estrita.

O lock final foi emitido com o commit P real fornecido pela principal e seu
recibo `v4/readback-selected.json`. O builder conferiu os 176 paths, todos os
Git blobs contra o staging local, a identidade de P e o hash do pacote. Conforme
o recibo da principal, os conteúdos novos foram comparados integralmente e 158
blobs já relidos na v3 foram confirmados pela mesma identidade Git. Isso não é
uma alegação de novas leituras remotas por este builder.

| Identidade do lock final | Valor |
|---|---|
| Arquivo | `input-lock.json` |
| SHA256 | `ada53fd4d9712a09c37d9b29f8d1c00d813b9089bd5afb4ff4213ed1807b8704` |
| Git blob | `fe2677462beceb36223fd2de443e95fd49fe5807` |
| Bytes | 1673102 |
| SHA256 do recibo de readback | `0ba06eda7c9b9e7426c75b2496ff0451879ac906ab5cb7a4b4d9077dac0d4a83` |
| Estado do commit no preflight | `ROOT_COMMIT_WITH_EXACT_READBACK` |

Comando efetivamente executado:

```sh
python /workspace/scratch/0666cc914bd1/s3-selected-finalization/v4/build_input_lock.py \
  --payload-commit 6c28b6da92a45d6c26490389b4813b8ba4849065 \
  --payload-readback /workspace/scratch/0666cc914bd1/s3-selected-finalization/v4/readback-selected.json
```

O lock contém os pins reais de P, sem commit futuro presumido. A principal fará
o commit independente L do lock e o plano; nenhum SHA de L é antecipado aqui.
A montagem já concluída pode ser inspecionada por
`payload-files.json`, `bindings.selected.json`, `selected-assembly.json` e pela
matriz `selected-reference-matrix.json`.

O pacote novo exige novo prepare e posterior binding independente. Esses passos,
publicação, consumidores e manutenção pertencem à execução da principal, não a
esta montagem de arquivos.
