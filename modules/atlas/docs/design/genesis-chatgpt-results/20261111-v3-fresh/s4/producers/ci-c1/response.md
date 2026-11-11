# WP-CI-C1 — conferência mecânica concluída

Consolidei os recibos existentes do run **43094387837**, job **130779354662**, candidato **`1b5a4801acfae03969f78ee766ca6f0b7d0f9013`**. O `jobs.json` preservado registra `completed / success` para o job e seus 14 passos. Esta unidade não emite parecer semântico nem aceitação final de S4.

| Evidência conferida | Resultado observado |
|---|---|
| Testes principais | **220 `assertionResults` passed**, 0 failureMessages, 220 nomes únicos. São 23 resultados de arquivo; o reporter registra separadamente 58 suites. |
| Mutações | **22 recibos**, todos `exitCode: 1`, cada um com a falha nominal exata no respectivo probe JSON. Os 22 reports registram `success: false`; isso corresponde à rejeição esperada dos mutantes. |
| Arquivos gerados | **18/18 iguais byte a byte**, com conjuntos de caminhos iguais e hashes de cada lado preservados. |
| Guard | **78 regras, 1.188 caminhos alterados, 0 gate findings, 2 warnings, 0 errors; exitCode 0**. |
| Parsing do driver | Passo de CI `Parse the native maintenance operation` concluído com `success`; comando do workflow local: `node --check` no driver. Execução operacional permanece **NOT_RUN nesta unidade**. |
| Preservação | 26 JSONs originais, total de 282.208 bytes, copiados e comparados byte a byte. Os 44 arquivos extraídos também correspondem aos bytes das respectivas entradas do ZIP. |

## Quatro controles NR1

As durações abaixo são as durações em milissegundos informadas pelo reporter, sem arredondamento adicional.

| Controle | Estado | Duração (ms) |
|---|---|---:|
| NR1-01 — interruption before activation leaves HOLD or the valid old manifest; resume reuses durable candidate/CAS | passed | 1235.1170649999997 |
| NR1-02 — failed activation after source drift serves HOLD; incompatible rollback is refused and historical reads stay explicit | passed | 480.0144660000001 |
| NR1-03 — stale transport, scope rebinding and old approval cannot replace the new accepted scope | passed | 329.831193 |
| NR1-04 — a separate reader overlaps real sidecar activation and sees only complete accepted manifests | passed | 692.8580820000002 |

Os dois warnings são `large-file` em `modules/atlas/docs/design/genesis-chatgpt-results/20261111-v3-fresh/s4/producers/l1b/artifacts.json` e `modules/atlas/docs/design/genesis-chatgpt-results/20261111-v3-fresh/s4/producers/l1b/coverage.json`. Eles permanecem explícitos no recibo; o exit 0 não foi convertido em ausência de warnings.

## Entrega e identidades

- [receipt.json](sandbox:/workspace/scratch/aff930d22ec7/s4/producers/ci-c1/receipt.json) — 14193 B; SHA-256 `0e5ab3de3e3eff58fda61020dc4f3ec6b2c67007ecc3b42c7d81a7e97654ca0c`. Contém candidato/run/job/artifact, comandos e fontes, resultados, NR1, guard e limites.
- [generated-comparison.json](sandbox:/workspace/scratch/aff930d22ec7/s4/producers/ci-c1/generated-comparison.json) — 6517 B; SHA-256 `6bbe0409f83fdf0f6b421007b746c10a6261f477f7e610a979bcbd4b7029662d`. Registra os 18 pares e a comparação direta dos bytes.
- [mutation-checks.json](sandbox:/workspace/scratch/aff930d22ec7/s4/producers/ci-c1/mutation-checks.json) — 22155 B; SHA-256 `5d3c48b8dcdbb1325fd920c654a5a9df45a0087249d66291ddbdfd4618aabd5c`. Registra nomes, status, falhas correspondentes, filtros e argv dos 22 probes conforme o workflow local.
- [originals-manifest.json](sandbox:/workspace/scratch/aff930d22ec7/s4/producers/ci-c1/originals-manifest.json) — 10347 B; SHA-256 `947959cea2464d6e35141d535069b46c3f012d656e3ac2857b7a8e93c04e1ffe`. Relaciona as 26 cópias literais em `originals/` com origem, tamanho e hash.
- [request.md](sandbox:/workspace/scratch/aff930d22ec7/s4/producers/ci-c1/request.md) preserva o pedido; [response.md](sandbox:/workspace/scratch/aff930d22ec7/s4/producers/ci-c1/response.md) preserva esta resposta. [hash-receipt.json](sandbox:/workspace/scratch/aff930d22ec7/s4/producers/ci-c1/hash-receipt.json) mede os arquivos entregues, sem referência recursiva a si próprio.

O ZIP original do artefato **13890576220** tem **431.390 B**, SHA-256 `224e19264b4da2d2a323cd950c2a86f28c41c13a688223e4077c2ed1c18e0dac`, confirmado localmente. O log original tem **1.021 B**, SHA-256 `b2dfe1660fa4959f3a9ce6c2e3fb789a4ffedf3e7dec28cf14261f13120e780c`. O recibo contém somente a extração literal delimitada das linhas 1–4, com comando, dois achados e contadores. As linhas 5–6 são anotações GitHub que repetem os warnings. O código de saída foi tomado do JSON original. Nenhum `.log` bruto ou ZIP foi copiado para esta entrega.

## Limites preservados

A conferência usou somente leitura de arquivos, parsing de JSON/ZIP e da tabela literal do workflow, hashing e comparação de bytes em Python. Não houve rede, Git, execução de produto, teste, build ou novo parsing executável do driver. Candidate e corpus não foram editados; oracles e respostas de consumidores não foram lidos.

O sucesso do passo `node --check` atesta parsing no CI, sem executar imports ou o corpo do driver; não prova a operação de prepare/rebuild/publish/read com o pacote real. A identidade local do driver consultado é 22.051 B / SHA-256 `a6a579e6a3978daa9a67f01bce06fda56172334b0e34323e787cba4d5ab9f27f`. A associação do ID remoto do artefato ao download veio do principal; o ZIP foi conferido offline. A igualdade do restante do produto com `7102f2e`, excetuando workflow/gate e driver, continua declarada pelo principal e não foi refeita por diff nesta unidade. Os comandos foram correlacionados ao workflow local, cujo hash está no recibo; a identidade remota desse arquivo não foi consultada.

Os 220 registros `assertionResults` contam casos de teste, não chamadas individuais de `expect`. Códigos numéricos de saída ficam `UNKNOWN` onde só há conclusão de passo no JSON; exits explícitos dos mutantes e do guard são preservados. Modelo/tokens ficam `UNKNOWN`. Nenhum binding da amostra foi transferido e nenhum PASS final S4 foi emitido.
