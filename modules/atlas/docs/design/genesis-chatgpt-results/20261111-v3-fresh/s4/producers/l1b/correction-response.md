# WP-L1B metadata correction response

A nova versão separa fontes semânticas de população preservada. `artifacts-v2.json` usa somente os arquivos citados, auxiliares justificados, contratos e nove inputs compactos de receita/evidência. Os quatro corpos, `artifacts.json`, `coverage.json`, o pedido/resposta originais e todos os demais arquivos v1 continuam byte a byte iguais.

| Artefato | Source refs v2 | Inputs v2 |
|---|---:|---:|
| `S4:L1:atlas-engine` | 50 | 59 |
| `S4:L1:atlas-host-genesis` | 45 | 54 |
| `S4:L1:continuity-rag` | 62 | 71 |
| `S4:L1:coverage-governance` | 32 | 41 |

`metadata-v2/source-selection.json` explica cada fonte e todos os 41 grupos; `observation-plan.md` distingue fonte semântica, inventário e origem histórica. `metadata-v2/population-evidence.json` preserva os digests da captura/inventário/coverage, as contagens e as oito limitações do observador. A população original mantém seus 2.220 caminhos; nenhum foi removido.

A afirmação sobre os três logs `.atlas` está delimitada a contagens/envelopes históricos da captura: 4, 96 e 9 registros. A observação nativa desses caminhos continua recusada. O novo input é o snapshot estático com origem exata; não se apresenta seu hash como versão runtime dos logs. Paridade dos bundles e atualidade dos dados gerados continuam não verificadas.

Cada `source_refs.path` conserva `file:<mesmo path>`. O plano exige materialização multi-pin explícita: código baseline e protocolo pinado nos paths originais, `observed_head=null`, com o código candidato separado. Não se inventou commit para payloads nem versão de input.

Verifiquei a correspondência de caminhos, hashes, tamanhos ≤256.000 bytes dos inputs declarados, a derivação estática e a imutabilidade v1. Isso não executou native prepare, testes de produto, runtime ou publicação, nem emitiu aceite semântico. Os juízes precisam avaliar esta correspondência v2 antes de um binding novo.
