# Transporte L1 preparado — rascunho mecânico

**Estado: DRAFT_READY_FOR_ROOT_BINDING.** O pacote vigente permanece `package_state: IN_PROGRESS`, com `validity: blocked` nos três artefatos, `oracle_ref: null`, `semantic_review_refs: []` e `runtime_receipt_refs: []`. Este trabalho não é aceite semântico, publicação Atlas nem produção L2–L4.

Foram usados somente os corpos e recibos finais de `out`, os inventários congelados e o contrato de transporte. O pacote vincula **A, B v2 e C v3**, incluindo seus pedidos/deltas. A raiz informou os hashes finais de B/C; os bytes foram reconferidos aqui. Pareceres ou decisões de versões anteriores não foram promovidos à versão atual.

## Conteúdo concreto

- Schema `genesis-native-package/v1`, scope `orchestra.s3.agents`, campanha lógica `20261111-v1`, protocolo `parallel-v3-fresh`, results epoch `20261111-v3-fresh`, sessão S3.
- Fonte `1cde2ff7a71bcf7aecb5d030917b577165135d38`; protocolo `ee2521a5b966bd505cc95bd1c733e09e12f33531`.
- **11 chaves obrigatórias**, das quais **três L1 presentes** e **oito L2–L4 explicitamente ausentes**. Roots oferece apenas a necessidade evidence com os três L1 disponíveis.
- **4.553 caminhos únicos**: A 424, B 3.700, C 429; nenhuma omissão, extra ou duplicata.
- **262 referências de fonte distintas por commit/path**, preservadas a partir dos manifestos finais. A/B/C conservam 85/109/90 source refs, incluindo cinco referências canônicas de protocolo por artefato.
- Autoridade distingue inspeção estática, contrato/intenção documental, histórico, interpretação e limite runtime. Os gaps originais permanecem atribuídos aos produtores.
- `recipe_ref` conserva o pedido original efetivamente usado. As emendas reais de A, B e C ficam como inputs e evidence exatos, sem substituir ou reescrever o pedido. `producer_request_ref` e `producer_response_ref` apontam aos receipts originais/finais.
- Nenhuma dependência de build aceita foi inventada; os três L1 independentes têm build_dependencies e navigation vazios. O mapper posterior contém candidatos de encaminhamento, sem convertê-los em dependência aceita.

## Corpos vinculados

| Artefato | body.path relativo ao pacote | Bytes | SHA-256 |
| --- | --- | ---: | --- |
| s3-l1-maestro | bodies/l1-maestro.md | 19752 | `75b4438d79ebd9667db94f03a6fea884329cd5c72e2c69f649eff1047e7b1918` |
| s3-l1-relay | bodies/l1-relay.md | 23932 | `369d2610ba4507a0950bd16cfce045dede276b67dee05f5d0086ef9ea503ffcb` |
| s3-l1-integrations | bodies/l1-integrations.md | 23985 | `81685f16fb32aae6958671939413d121e4f5babaf01d3b9565b03a50f7842e8a` |

Todos os `payload_path` começam por `modules/atlas/docs/design/genesis-chatgpt-results/20261111-v3-fresh/s3/`. Os `source_refs.path` continuam relativos à raiz do repositório de fonte e usam seus commits efetivos. Nenhum SHA de transporte foi apresentado como versão `id(...)` do kernel, receipt, result, artifact ou manifest runtime.

## Mapper e invalidação

`population-map.jsonl` conserva para cada entrada path, commit, Git blob, bytes, L1 responsável, classe, disposição, need/needs, família, profundidade, flag de leitura e encaminhamentos futuros. `original_entry_index` aponta à entrada original do coverage; `original_entry_sha256` vincula seu JSON canônico. A reconstrução desses hashes foi conferida para **todas as 4.553 entradas**. Os coverages e populações completos continuam referenciados com seus hashes; nenhuma versão original foi substituída pelo mapper.

Os encaminhamentos futuros são uma transformação mecânica das necessidades já registradas: todo membro retém seu L2 de domínio, e needs entry/ownership/maintenance/operational/flow acrescentam a chave futura correspondente. Não foram criados 4.553 artefatos ou necessidades independentes; as famílias e necessidades compartilhadas permanecem. A matriz não afirma que L2–L4 foram produzidos ou aceitos.

Há **4589 file input keys únicos** e **45 membership input keys únicos** no conjunto do pacote. Todos os 4.553 arquivos da população e as fontes adicionais capturadas continuam declarados como file inputs; receitas/protocolo também estão vinculados. Membership cobre componentes, árvores associadas e fontes de fronteira, de modo que novos filhos/subdiretórios nesses limites sejam detectáveis. Essas chaves são declarações para observação futura: nenhuma consulta Git de membership nem versão runtime foi fabricada.

## Limite real de 256.000 bytes

**Nenhum arquivo de fonte ou receita indispensável declarado excede 256.000 bytes nos metadados/capturas disponíveis. Nenhuma fonte foi removida para obter PASS.** A distinção indicada pela raiz foi preservada: cobertura e população completas são evidência de transporte; os arquivos de fonte e membership podem sustentar a invalidação sem transformar todo relatório derivado num único file input obrigatório.

Os seguintes arquivos de evidência continuam integrais e acima do limite:

| Evidência | Bytes | Disposição |
| --- | ---: | --- |
| `receipts/L1-A/coverage.json` | 373917 | Evidência integral preservada; recusa se exigida como um único file input. |
| `evidence/population-B.json` | 1282364 | Evidência integral preservada; recusa se exigida como um único file input. |
| `receipts/L1-B/coverage.json` | 2575078 | Evidência integral preservada; recusa se exigida como um único file input. |
| `receipts/L1-C/coverage.json` | 438017 | Evidência integral preservada; recusa se exigida como um único file input. |

O mapper possui **3106292 bytes** e o descritor do pacote **491913 bytes**. Também excedem o limite se um adapter futuro tentar observá-los como arquivos únicos pelo observador atual. Esse risco está no relatório; não foi solucionado por remover conteúdo, alterar hashes, fragmentar silenciosamente inputs ou declarar sucesso runtime.

## Entregas e hashes

| Arquivo | Bytes | SHA-256 |
| --- | ---: | --- |
| [draft-native-package.json](sandbox:/workspace/scratch/2c7c4c0ad466/genesis-s3/agents/packaging-l1/draft-native-package.json) | 491913 | `3dd2f55896912b7caa3e4717c7ed57f82c63b993c5eab90d3ef008f596dca2d9` |
| [population-map.jsonl](sandbox:/workspace/scratch/2c7c4c0ad466/genesis-s3/agents/packaging-l1/population-map.jsonl) | 3106292 | `1693d8a0ee92955bc928e32083a2d125802dc8ccf28322b89624910f4dffd7a7` |
| [mapping-contract.json](sandbox:/workspace/scratch/2c7c4c0ad466/genesis-s3/agents/packaging-l1/mapping-contract.json) | 5258 | `c08e06df84de7db974f8f6a165943b24576c183b0d8fd89e8322f68dad879b51` |
| [integrity-report.json](sandbox:/workspace/scratch/2c7c4c0ad466/genesis-s3/agents/packaging-l1/integrity-report.json) | 15844 | `7c3f90ccae190f67552160fb00be46160caa65e201331711f510ed899bdd4f4d` |
| [input-snapshot.json](sandbox:/workspace/scratch/2c7c4c0ad466/genesis-s3/agents/packaging-l1/input-snapshot.json) | 22115 | `3e768105a52f647283fbdfceb598e28603b1caf1aa2dc6a98ea2d5cbb917b2f4` |
| [payload-placement.json](sandbox:/workspace/scratch/2c7c4c0ad466/genesis-s3/agents/packaging-l1/payload-placement.json) | 1874 | `282114db4e6bdf0935fa7b7d81bb9eb4ba579d367e45d40267f6480b9a90f7b1` |

`request.md` preserva o despacho original. Os três arquivos `request-steering-*.md` preservam as mudanças recebidas durante o trabalho. `draft-native-package-v1.json` e `draft-native-package-v2.json`, com relatórios e snapshots correspondentes, são históricos **obsoletos**; não devem ser usados contra os corpos correntes. A revisão vigente é `draft-native-package.json`.

`payload-placement.json` fornece os destinos propostos dos novos arquivos. Ele é um plano de colocação: este agente não copiou nada para `out`, candidate ou repositório remoto. Nenhuma fonte integral foi incluída no payload; o literal default backend está ausente dos arquivos autorais de empacotamento.

## O que foi e não foi verificado

A reconciliação verificou os 4.553 membros/versões originais, hashes dos corpos e referências, faixas de tamanho, UTF-8, paths relativos e prefixos, ausência de symlinks, enums/keys, consistência de fontes repetidas, inclusão de todos os arquivos de fonte nos inputs e reconstrução do mapper. Os cinco arquivos locais de protocolo atuais coincidem com as capturas canônicas. A discrepância histórica de um LF registrada por A foi preservada como história, sem reescrever o recibo.

Não foram executados testes de produto, CI, Git writes, login, modelo, Atlas, publicação ou consumidor. Nenhum oracle reservado foi lido. Nenhuma revisão foi emitida ou fabricada. O empacotamento não acrescenta conhecimento de produto; a raiz deve preencher oracle_ref, anexar os pareceres exatos pertinentes e decidir as próximas portas. Esta entrega não autoriza nem inicia L2.

Esta resposta está preservada em `response.md`; `deliverables.json` inclui seu hash após a gravação, sem autorreferência circular.
