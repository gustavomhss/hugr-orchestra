# Descritores mecânicos dos quatro corpos L1 atuais

Execução `34269cf4-d631-41c5-a30b-85b0ec217390`, S1-03, repositório `gustavomhss/hugr-orchestra`. Esta entrega prepara identidades e referências para a montagem posterior. Não é um `native-package.json`, não decide validade/aceite e não executa `prepare`, publicação, receitas ou testes de produto.

## Entrega e seleção

`descriptors.json` contém, por artefato, `input_keys`, `source_refs`, identidade do corpo e referências candidatas de procedimento/pedido/resposta. `input_units` explica o papel e a temporalidade de cada arquivo. `materialization-plan.json` é a tabela completa de origem local, destino canônico, SHA-256, Git blob, tamanho, aliases conferidos, presença no native-source e cópias do payload. Nenhuma cópia foi realizada por esta tarefa.

| Artefato | Corpo | Input keys / source refs | Inputs > 256.000 bytes |
|---|---:|---:|---:|
| `s1.core.automation` v4 | 60.767 bytes | 263 / 263 | 5 |
| `s1.core.research` v2 | 63.501 bytes | 153 / 153 | 2 |
| `s1.core.boundaries` v2 | 23.665 bytes | 60 / 60 | 1 |
| `s1.subslice03.support` v2 | 23.025 bytes | 140 / 140 | 1 |

Os SHA-256 dos corpos são, respectivamente, `968965f1b15d633cefc8a78868d9d1049147f23dff409c6cb05c7a75e3561cae`, `d2def4b82495605b491e0d5494b1511e1b68c47dcffa84af87c8d35705468661`, `ca7e76aa47100f32e2076b0a5055b2cebfe3d36cfb5c0d29601125db34d7b3c6` e `498a0454418a14977b9b2f4c4f515711d941b6d4bbece13f1baaa8feaa76d378`.

Há 594 destinos únicos no plano, dos quais 561 são inputs de um ou mais corpos. No momento da conferência, 505 destinos do native-source já eram byte-idênticos e 89 estavam ausentes. Os 96 arquivos pertinentes ao namespace de resultados já existiam no payload com bytes idênticos. Não há conflito de versão nos destinos. Os 498 destinos restantes mantêm o caminho original de fonte/autoridade e não pedem cópia para resultados. As contagens do plano incluem corpos, registros de produção e arquivos auxiliares necessários à auditoria, além dos inputs.

## Como os commits foram vinculados

O payload de conteúdo é **P `f6ffb725704cc01682847d7e175f22b6ead3894c`**; o selo é **H `332a0b292123de704ec0b4b393e77e0902a00b01`**. **H nunca foi usado como commit de conteúdo.**

Cada `source_ref` local em P passou por três conferências: seu caminho exato está em `publish/l1-corrections-v2b/index.json`; SHA-256, tamanho e Git blob do arquivo observado coincidem com essa entrada; e os bytes correspondentes em `publish/l1-corrections-v2b/files/` também coincidem. O vínculo do snapshot com P vem do recibo já existente `payload/receipts/l1-corrections-v2-readback.json`, que registra os 438 arquivos publicados e verificados. Esta tarefa não fez nova consulta de rede.

**Todos os inputs locais selecionados e os quatro `recipe_ref` escolhidos têm correspondência exata nesse snapshot P. Não ficou script não publicado dentro dos source_refs.** Para arquivos novos da auditoria research, posteriores a P, o plano conserva `origin_commit: null`; são proveniência posterior, não input nem source_ref dos corpos. A publicação futura desses arquivos é trabalho da principal. Nenhum SHA foi inventado ou inferido apenas pelo nome de um arquivo.

Fontes de produto, contratos, kit e história conservam seus commits originais: baseline `1cde2ff7a71bcf7aecb5d030917b577165135d38`, protocolo `ee2521a5b966bd505cc95bd1c733e09e12f33531`, kit `70234d541a9a3539935ef16f19e33c8f2d5f30ec` e herança `a8df22ae3a140c58c63f62ce2a634c84f415c943`, conforme os manifests observados. Seus bytes, SHA-256 e Git blobs foram recalculados localmente. Isso não representa uma nova verificação remota da associação commit/path.

## Procedimentos reais e temporalidade

| Artefato | `recipe_ref` recomendado, relativo ao output_prefix | Justificativa |
|---|---|---|
| automation v4 | `producers/automation/revisions/v4/apply.py` | Procedimento real das duas substituições; consome body/recipe v3, fontes e registros de preservação. |
| research v2 | `producers/research/correction-v2-request.txt` | Registro fiel da mensagem efetivamente consumida; o contrato de transporte permite referência ao pedido usado. |
| boundaries v2 | `producers/boundaries/records/prepare_boundaries_v2.py` | Procedimento retido das duas correções autorizadas. |
| support v2 | `producers/boundaries/records/prepare_support_v2.py` | Procedimento retido das três correções do corpo e duas razões de coverage. |

As receitas JSON atuais de automation v4, research v2, boundaries v2 e support v2 descrevem resultados e foram geradas depois dos corpos. Permanecem como `posterior_descriptive_recipe_ref`, fora dos inputs retroativos. Não foram alteradas.

Automation preserva os inputs semânticos/contratuais do manifest e fecha também as leituras reais do `apply.py`. Seu `delta.json` lista 32 arquivos anteriores em `preserved_files`; o script os lê antes da escrita, além dos dois pedidos públicos. `captures.json` participa da escolha/conferência das fontes. Os demais registros de preservação são dependências mecânicas, explicitamente sem autoridade independente sobre comportamento do produto. O conjunto observado difere, por essa razão documentada, da disposição original que classificava esses registros apenas como proveniência semântica. A autorização da principal para esse fechamento foi preservada em `followups.txt`.

Research mantém as **152 unidades integrais** da nova auditoria: 130 fontes, 16 contextos e seis arquivos locais de versões/propostas. A chave adicional é exclusivamente o registro do pedido escolhido como `recipe_ref`. Esse arquivo foi serializado durante a correção, depois de calcular os bytes candidatos e antes de escrever o corpo; não foi parseado como receita pré-existente. As instruções foram consumidas como mensagens. Seus hashes originais de transporte são **UNKNOWN**. A correção foi executada inline; não há script original persistido estabelecido, e nenhum foi reconstruído. A alternativa real mais ampla, `SKILL.md` original, também aparece nos descritores, sem ser preferida ao pedido específico.

Boundaries usa o predecessor v1 retido e resolve o sentinela support pela cópia **support-v1**, porque o caminho atual de support contém v2. Support usa a v1 retida e lê/checka o corpo boundaries v2 já produzido como sentinela de preservação. Isso é input mecânico de arquivo, não transferência de aceite nem aresta semântica de `build_dependencies`. Nenhum predecessor aceito foi inventado. Os pedidos públicos são inputs de correção, nunca `semantic_review_refs` atuais.

As formas nativas são `layer: 1` e `need: entry` para support, coerentes com a definição original do candidato e com o enum do adapter. Os campos descritivos `"L1"` / `"entry/support"` da receita local posterior não foram copiados como enums nativos.

## Arquivos grandes mantidos integralmente

| Arquivo | Bytes | Uso |
|---|---:|---|
| Projeção histórica `coverage-needs-projection.json` | 726.892 | Input efetivo dos quatro corpos. |
| `packages/core/src/backend-toolkit/packs/modelina.package-lock.json` | 266.885 | Input efetivo de research. |
| `producers/automation/evidence.md` | 953.016 | Leitura anterior de preservação no procedimento v4. |
| `producers/automation/review-supplement-1.md` | 338.932 | Leitura anterior de preservação no procedimento v4. |
| `producers/automation/review-supplement-2.md` | 375.497 | Leitura anterior de preservação no procedimento v4. |
| `producers/automation/review-supplement-3.md` | 404.469 | Leitura anterior de preservação no procedimento v4. |

A3 (177.076 bytes) e A4 (155.061 bytes) também permanecem integrais em todos os corpos. A leitura por trechos não altera a unidade de identidade. Nenhum arquivo foi recortado, partido, omitido ou reclassificado para caber no teto de 256.000 do adapter observado. O código `genesis-native.ts` aplica esse limite às fontes e às observações `file:`; portanto a seleção completa ainda tem uma incompatibilidade de capacidade explícita. Não foi feita nova tentativa de `prepare` nesta tarefa.

## Limites precisos que permanecem

1. Os bytes de transporte originais das mensagens não são expostos; os arquivos preservados têm identidade exata, sem pretensão de equivalência a uma serialização de host desconhecida.
2. Não existe inventário integral comprovado de scripts temporários da produção inicial; a correção research foi inline. A entrega não inventa esse inventário nem refaz os corpos.
3. Em boundaries, o script copia request/followups/verification apenas quando o alias v1 não existe. O branch efetivamente tomado não está exposto. Os aliases conservados são byte-idênticos; o conjunto conservador mantém cada unidade, sem inventar telemetria.
4. Não houve nova leitura remota. Os vínculos de commit usam os manifests/capturas e, para P, o snapshot exato e o recibo observado de publicação.
5. `semantic_review_refs`, autoridade, validade, gaps/evidence semânticos, links/dependências finais, contrato/oracle e recibos de binding/runtime permanecem com a principal e o par existente. Não são inferidos desta montagem.
6. Os seis inputs acima do limite continuam necessários no fechamento escolhido. A resolução de capacidade/binding permanece fora desta tarefa; a existência de descriptors não declara importabilidade.

## Verificação e preservação

`assemble_descriptors.py` só gera estes metadados no diretório exclusivo. `verify_descriptors.py` reabre todos os arquivos observados, confere aliases, corpos, referências, pertinência dos caminhos ao snapshot P, ausência de self-input do corpo e de receitas posteriores como inputs, preservação de AGENTS na autoridade original e a relação entre tabelas/arrays. O resultado está em `verification.json`; `observed-identities.json` guarda as identidades dos bytes observados.

Não houve escrita fora de `assembly-native-descriptors/`, leitura de oracle/reserved, execução de scripts de produtor, alteração de corpo/receita/produto, teste, rede, `prepare`, publicação ou juízo semântico. O pedido recebido e o followup da principal foram preservados como texto visível; a resposta desta tarefa está em `response.md`.
