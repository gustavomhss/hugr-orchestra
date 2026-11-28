# Pré-conferência mecânica do corpus S4

Escopo: 10 artefatos atuais, 7 L1 e 3 L2, do transporte atribuído pelo dispatch ao commit `47eaa5322102910289cb56e2e07e9d3536ba1926`. Envelope observado: 166351 bytes, SHA-256 `3ca92e5114946ee97de2bde5ea829feb94e5c07c358e8170ddfcc08071741bd1`. `observed_head = null`; não foi fabricado checkout nem verificada associação remota do commit.

## Resultado utilizável

272 source_refs, 193 paths únicos de fonte, 336 declarações de input e 226 inputs únicos. A união de fontes, corpos, receitas, protocolo, pedidos, respostas, recibos e inputs contém 244 paths atuais. Todos têm bytes locais correspondentes aos digests declarados; as receitas fornecem os hashes esperados dos 21 inputs sem digest em referência direta. SHA-256 e Git blob foram comparados quando declarados.

No final-corpus observado: 224 paths atuais correspondem, 19 faltam e 1 tem outra versão. As cópias exatas dos faltantes foram localizadas. O driver futuro acrescenta um path, ainda ausente no corpus. O plano contém 21 ações propostas com origem, destino, bytes e hashes; nenhuma foi executada. O envelope native-package existente no corpus também foi medido separadamente, sem tratá-lo como montagem final das camadas pendentes.

## Overlay e versões

O path de resultados `s4/runtime-release.json` exige os bytes R2 de `s4/producers/l2a/inputs/runtime-release.json`: 17593 bytes, SHA-256 `6e59f5ba8690fe7574d7e12f960aab120e20c942413c827a07d3bbf80d3cd38a`, Git blob `9344e06b86a1913178e101a640bae3c7f8252e11`, pin `8a041ca66982dcc2b89aaed46ebe347cb3de57db`. Candidate e corpus guardam R3, 28282 bytes, SHA-256 `6de0b5f7a8911eb40c7fbcf74e74210805175ee580c0c8482249c016af1c0016`. O plano preserva R2 e seu path/pin.

Não há conflito entre digests atuais exigidos para um mesmo path. Há 8 paths com versões locais diferentes: workflow atlas-pilot, cinco cópias achatadas do protocolo, runtime-release e knowledge/src/index.ts. O plano discrimina a origem correta; não copiar protocolo achatado ou runtime inteiro como corpus sem conferir cada identidade.

## Inputs e limites

Nenhum symlink encontrado nos caminhos examinados; nenhum input declarado excede 256000 bytes. Maior input: `modules/atlas/docs/design/genesis-chatgpt-results/20261111-v3-fresh/s4/producers/l1b/metadata-v2/source-selection.json`, 177641 bytes. O driver `runtime/maintenance-operation.mjs` tem 22051 bytes, SHA-256 `a6a579e6a3978daa9a67f01bce06fda56172334b0e34323e787cba4d5ab9f27f`, sob o prefixo de resultados em candidate-r1; execução nesta tarefa: NOT_RUN.

As 10 listas atuais de input_keys não estão em ordem lexical e não têm duplicatas. O transporte permanece intacto; o plano registra contagens e fornece propostas ordenadas: driver nas 10 entries, protocolo explícito nas 4 que ainda não o declaram. Proposta: 350 declarações e 227 paths únicos. Os cinco artefatos L3/L4 pendentes ficam fora dessas contagens e da alegação de cobertura.

Os 20 semantic_review_refs apontam a 10 arquivos únicos, tratados apenas como bytes, sem imprimir ou interpretar pareceres. Oracle e respostas de consumidores não foram abertos. Nenhum produto, teste, build, Git ou GitHub foi executado. Não há prova de publicação, consumo ou manutenção. Modelo/tokens/uso não expostos: UNKNOWN.

## Entrega

- `request.md`: 2647 bytes; SHA-256 `80a96db9b9c394ba47de2f2c75b936361c4ee3d9f22c647694b2a82df271afc3`.
- `plan.json`: 233705 bytes; SHA-256 `ecf7f075f882eceedb997110621a34351817338bca4d27ee58168d42aa790306`.

O plano registra por path os digests esperados, pins, estado no corpus, bytes locais utilizáveis, checagens de identidade/limite/symlink, versões alternativas e ações não executadas. O envelope final e seus bindings devem refletir a futura montagem completa; esta entrega não antecipa aprovação.
