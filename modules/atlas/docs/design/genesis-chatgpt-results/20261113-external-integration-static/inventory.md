# Inventário e reconciliação da população Genesis

## Resultado estático

A árvore do baseline contém **14.442 caminhos de folhas**, todos do tipo Git `blob`, e **2.268 entradas de diretórios** do tipo `tree`. O inventário completo tem **16.710 registros de descendentes**, além da identidade da árvore raiz registrada separadamente. A população de 14.442 do protocolo corresponde às folhas rastreadas; os diretórios permanecem visíveis no inventário e não integram essa população.

A diferença de população é **zero**. As contagens S1–S5, as contagens por primeiro segmento de caminho, os fallbacks e os **12 digests SHA-256** — dois globais e dois por fatia — coincidem com o registro do protocolo. Isso reconcilia a estrutura e a atribuição de caminhos. Não demonstra leitura semântica de todos os blobs, extração L1–L4, compatibilidade de runtime, consumo Atlas ou aceite da campanha.

Artefatos:

- [inventory.json](inventory.json): resultados, método, comparações, 225 caminhos de fallback, limites e recuperação.
- [tree-inventory.tsv](tree-inventory.tsv): todos os 16.710 registros, com modo, tipo, OID, caminho, população, dono, regra e tamanho.
- [sources-A.json](sources-A.json): seis leituras de conteúdo declaradas, metadados do commit e os 47 endpoints de árvore efetivamente lidos.
- [gaps-A.json](gaps-A.json): limitações e requisito de compatibilidade do observer do baseline.
- [static-verification.json](static-verification.json): relatório adicional de recomputação independente da orquestração; seu método e seus resultados são preservados nesse arquivo.

## Identidades e fontes

| Finalidade | Identidade |
| --- | --- |
| Baseline de fontes | `1cde2ff7a71bcf7aecb5d030917b577165135d38` |
| Árvore raiz fornecida pelo commit via MCP | `a522a53e5f046f1758151b0f558531bbded04592` |
| Pin do protocolo | `ee2521a5b966bd505cc95bd1c733e09e12f33531` |
| Blob de `parallel-partition.json` | `cdd2fba881059af6152371b417d8a791d8090a9f` |
| Commit que congelou os critérios antes da autoria | `3d9a515f264a7938c764d37532bc42ad6005fc47` |
| Blob dos critérios públicos congelados | `ac96d6dbb23025989be110029dcb63fad9b25b1b` |

A ligação commit→árvore foi lida diretamente no [objeto do commit](https://api.github.com/repos/gustavomhss/hugr-orchestra/git/commits/1cde2ff7a71bcf7aecb5d030917b577165135d38). A definição, o resolver e os valores esperados vêm de [parallel-partition.json](https://github.com/gustavomhss/hugr-orchestra/blob/ee2521a5b966bd505cc95bd1c733e09e12f33531/.orchestra/skills/execute-genesis/references/parallel-partition.json). Os limites da conclusão vêm de [integration.md](https://github.com/gustavomhss/hugr-orchestra/blob/ee2521a5b966bd505cc95bd1c733e09e12f33531/.orchestra/skills/execute-genesis/references/integration.md) e [principles.md](https://github.com/gustavomhss/hugr-orchestra/blob/ee2521a5b966bd505cc95bd1c733e09e12f33531/.orchestra/skills/execute-genesis/references/principles.md). As instruções aplicáveis foram lidas em [AGENTS.md](https://github.com/gustavomhss/hugr-orchestra/blob/1cde2ff7a71bcf7aecb5d030917b577165135d38/AGENTS.md).

O inventário distingue duas formas de evidência:

1. **Conteúdo lido:** os blobs explicitamente enumerados em `sources-A.json.content_sources`, incluindo o observer analisado adiante. Seus SHAs foram fornecidos pelo GitHub MCP.
2. **Metadados enumerados:** path, mode, type, OID e tamanho dos descendentes do baseline. Um blob aparecer no TSV não significa que seu conteúdo foi lido. Os OIDs dos blobs enumerados foram fornecidos pela árvore Git; esta frente não recalculou seus hashes a partir de todos os conteúdos.

Não foram consultados resultados de outras sessões ou o estado privado da coordenação. Os pins de prompts são responsabilidade das outras frentes e da orquestração; nenhuma inferência de código aqui usa o HEAD atual.

## Método de enumeração

A solicitação inicial da árvore raiz com `?recursive=1` falhou com **Transport closed**. Não houve resposta Git com `truncated=true` ou `false`; portanto essa falha não foi apresentada como truncamento Git e não forneceu registros ao inventário.

A leitura foi decomposta assim:

1. Ler a árvore raiz sem recursão: **43 entradas**.
2. Ler recursivamente as **17 subárvores de primeiro nível** diferentes de `modules` e `packages`.
3. Ler `modules` e `packages` sem recursão: respectivamente **10** e **17** entradas.
4. Ler recursivamente as **27 subárvores** encontradas nessas duas áreas.
5. Prefixar cada caminho relativo com o caminho da subárvore, manter uma única cópia de cada entrada e ordenar pelo caminho.

As **47 respostas** usadas na reconstrução retornaram o SHA esperado e `truncated=false`. Os endpoints exatos, prefixos, SHAs e quantidades retornadas estão no índice `tree_responses` de [sources-A.json](sources-A.json). A soma dos registros retornados é 16.710. Cada árvore de primeiro nível aparece como entrada da raiz, e cada árvore de segundo nível de `modules`/`packages` aparece em sua leitura não recursiva; essas entradas não foram adicionadas novamente na expansão de seus próprios conteúdos.

Foram observados **16.710 caminhos únicos**, nenhum caminho duplicado e nenhum caractere TAB, CR ou LF em caminhos. Todos os caminhos observados são ASCII; por isso a ordenação ordinal usada é também a ordenação por bytes UTF-8 exigida pelo protocolo.

### Tipos, modos e identidades

| Tipo / modo | Registros | Tratamento |
| --- | ---: | --- |
| `tree` / `040000` | 2.268 | Diretórios enumerados; fora da contagem de folhas |
| `blob` / `100644` | 14.370 | Folhas incluídas |
| `blob` / `100755` | 71 | Folhas executáveis incluídas |
| `blob` / `120000` | 1 | Symlink incluído como blob |
| `commit` / `160000` | 0 | Nenhum gitlink observado |
| **Total de folhas** | **14.442** | **População atribuída a S1–S5** |
| **Total de descendentes** | **16.710** | **TSV completo** |

O único symlink é `packages/app-shell/src/custom-elements.d.ts`, atribuído a S2, OID `e4ea0d6cebdad58ea12fc08dd7a3f732cdb45f8f`, tamanho de blob 33 bytes. O conteúdo de seu alvo não foi buscado por esta frente.

As 14.442 referências de blobs correspondem a **12.807 OIDs distintos**. Há **2.202 OIDs de tree distintos entre descendentes**, ou **2.203 incluindo a raiz**. O mesmo conteúdo pode aparecer em caminhos diferentes: as 1.635 referências adicionais de blob não são duplicatas de caminhos e não reduzem a população.

## População, exclusões e partição

A população foi reconstruída selecionando os descendentes cujo tipo difere de `tree`. Neste baseline todos são blobs. Se houvesse gitlinks, eles seriam mostrados e tratados explicitamente, sem fingir que foram enumerados como árvores locais.

**Nenhum caminho de folha foi excluído.** Não houve filtro por extensão, arquivo oculto, geração, fixture, asset, código de terceiros, documento, teste ou configuração. A enumeração não atribui profundidade semântica igual a essas classes, nem pretende classificá-las integralmente apenas pelo nome.

Contar diretórios junto com folhas produziria 16.710 em vez de 14.442. A diferença de **2.268** é inteiramente explicada pelos registros de `tree`. O acordo dos digests da população de folhas com os digests congelados confirma a definição usada, além de sua coincidência numérica.

### Resolver aplicado

Foi aplicada a prioridade do protocolo:

1. Regra de arquivo exato.
2. Prefixo de diretório mais longo, obrigatoriamente terminado em `/`.
3. Fallback explícito para S5.

O registro contém **87 regras exatas** e **99 prefixos**. Não foram usadas correspondências por substring, basename ou aproximação. O resultado foi:

| Tipo de atribuição | Folhas |
| --- | ---: |
| `exact_file` | 87 |
| `longest_directory_prefix` | 14.130 |
| `fallback` | 225 |
| **União** | **14.442** |

Os 225 fallbacks estão listados em `inventory.json.resolver.fallback_paths`; são propriedade explícita de S5 e não lacunas de contagem.

### Reconciliação por fatia

| Fatia | Esperado | Observado | Diferença | Fallback observado | Digests e contagens top-level |
| --- | ---: | ---: | ---: | ---: | --- |
| S1 | 2.236 | 2.236 | 0 | 0 | iguais |
| S2 | 4.506 | 4.506 | 0 | 0 | iguais |
| S3 | 4.553 | 4.553 | 0 | 0 | iguais |
| S4 | 2.220 | 2.220 | 0 | 0 | iguais |
| S5 | 927 | 927 | 0 | 225 | iguais |
| **União** | **14.442** | **14.442** | **0** | **225** | **iguais** |

Os mapas esperados e observados de primeiro segmento estão preservados integralmente em `inventory.json.shards`. O algoritmo também verificou:

- **0** caminhos duplicados.
- **0** caminhos com mais de uma regra exata/prefixo candidata.
- **0** atribuições duplicadas ou donos não resolvidos.
- **0** regras exatas sem caminho correspondente.
- **0** prefixos vazios.
- **0** exclusões de folhas.

As árvores de diretórios têm dono `NOT_APPLICABLE` no TSV, porque a atribuição congelada do protocolo cobre as folhas. Isso não é uma exclusão de fonte rastreada nem uma propriedade de runtime.

## Digests calculados

O cálculo foi feito por transformação determinística em JavaScript dos metadados retornados pelo MCP. Nenhuma ferramenta do produto ou teste foi executado.

Para cada conjunto global ou de fatia:

- Ordenar registros pelos bytes UTF-8 do caminho.
- Para `paths`, concatenar `path + LF`.
- Para `tree_records`, concatenar `mode + TAB + object_type + TAB + object_oid + TAB + path + LF`.
- Incluir LF depois de **cada** registro, inclusive o último.
- Calcular SHA-256 dos bytes UTF-8 dessa concatenação.
- Manter apenas folhas para comparação com os digests congelados.

### Globais

| Digest | Calculado, igual ao esperado |
| --- | --- |
| Paths | `2516d9fbc2edc223c10a30359aabc54687eb0871c0f77c35a7e5952fede57b83` |
| Tree records | `ac3538da3b3440fe7c7c931aa69ca3be423b39ec56a5b0775b95a1f5b2e7ddab` |

### Por fatia

| Fatia | Paths SHA-256 calculado | Tree records SHA-256 calculado |
| --- | --- | --- |
| S1 | `67d80c0e398b495140ef3b9fd4d0a8058036290919856635298b9007ed153889` | `30fd2c9a07e039f5277ffe761c87f162e946188404dcedc9bf34d73c6a927e58` |
| S2 | `8b70f96dcbb623bdd1cc2a48b61d51d255d9d9ce90836efc9a5cd05f1fc5a582` | `cb4f96b19e248e923485db63de87e56b45523428e1cb891a8746ec8189dffd88` |
| S3 | `6ca1aca1f8a1da4bf4061c67f06f983f0b676e6d90a7f2af945cb57a7f76c4f1` | `f9130f5eaa900907cefacb284974dabfeb22970e1e391f5eb0a567175e9f46c2` |
| S4 | `0b99735199c8a9a4db61bf506dafe92acb76909dd9f9c48d8f521fb920c6cd1d` | `919064e1e589092b32d0f19d7f01346fab04faa9f6dad0ed6a3070ef8d083129` |
| S5 | `7d807d18a0bbbcccbaa1f01954b78036a2769c5fee95a1e8be5293435ec714f0` | `1117add0d62b1d427ae30df7bedf616a507f35a41c0534fb1444951f48c15c31` |

O TSV completo, que também contém diretórios e colunas de atribuição, possui **2.828.263 bytes**, **16.710 linhas de dados** e SHA-256 `243af8f4c2ea35ac4ede30d7ed8dc42ab52adb710fe29163d12c6c5c8fa0a8a8`. Esse hash cobre o cabeçalho e todas as linhas com LF; não é o digest de população do protocolo.

## Compatibilidade estática do observer do baseline

A leitura integral de [ownership-input.ts](https://github.com/gustavomhss/hugr-orchestra/blob/1cde2ff7a71bcf7aecb5d030917b577165135d38/modules/atlas/packages/adapter-io/src/ownership-input.ts), blob `c6afd6a35071a2487a1168cea5ed1ad26379c376`, mostrou regras específicas:

- `isAllowedRel`, linhas 31–33, recusa qualquer segmento `.atlas`; a validação ocorre na linha 43.
- O caminho de observação de arquivo recusa symlinks, incluindo a checagem da linha 152.
- A leitura de bytes e a checagem final recusam tamanhos acima de **256.000 bytes**, nas linhas 172 e 181.

A interseção dessas regras com os metadados do baseline é:

| Grupo de caminhos rastreados | Contagem | Donos |
| --- | ---: | --- |
| Blob com tamanho >256.000 bytes | 80 | S1: 3; S2: 73; S4: 3; S5: 1 |
| Caminho com qualquer segmento `.atlas` | 5 | S4: 5 |
| Symlink | 1 | S2: 1 |
| **União sem sobreposição** | **86** | **Caminhos mantidos no inventário** |

Os cinco caminhos com segmento `.atlas` abrangem os três caminhos da `.atlas/` raiz e dois fixtures, em `modules/atlas/harness/probes/__fixtures__/bench-driver-corpus/pkg-a/.atlas/index.scip` e `pkg-b/.atlas/index.scip`. Todos os caminhos, SHAs e tamanhos usados nessa interseção estão em `inventory.json.baseline_input_fit`.

**Esse é um requisito aberto de integração, não um resultado de execução.** A comparação de tamanho usa bytes do blob Git e pressupõe que o worktree materialize esses bytes fielmente; filtros de checkout e finais de linha não foram medidos. A observação de membership também pode recusar um diretório que contenha caminhos restritos; essa propagação não foi executada ou quantificada aqui.

O candidato S4 atual é **UNKNOWN** nesta auditoria. A coordenação deve conferir representação, input, binding e reader no release exato selecionado, conservar todos os 14.442 caminhos e registrar a disposição segura das fontes que o observer do baseline não cobre diretamente. Nenhuma conclusão sobre uma adaptação já feita por outra sessão é inferida.

## Recuperação e limites

Para reproduzir ou retomar esta frente:

1. Ler o commit baseline pelo GitHub MCP e exigir a árvore `a522a53e5f046f1758151b0f558531bbded04592`.
2. Repetir os endpoints registrados em `sources-A.json.tree_responses`, preservando pins e prefixos. Exigir SHA retornado correto e `truncated=false`.
3. Se um endpoint não funcionar, decompô-lo por seus filhos sem descartar silenciosamente caminhos. Uma falha de observação permanece erro ou UNKNOWN até ser resolvida.
4. Reconstruir os registros do TSV, selecionar folhas e reaplicar a partição fixada.
5. Comparar os dois digests globais, os dez por fatia, as contagens top-level, as regras vazias e os fallbacks.
6. Tratar qualquer nova revisão de fonte como nova enumeração. Não substituir o baseline pelo HEAD da branch de auditoria.

O namespace contém apenas documentação e metadados da auditoria. Omni 393 e Platform 200 não foram produzidas ou alteradas: sua presença neste inventário é apenas parte da enumeração completa obrigatória. Não foram executados testes, CI, consumidores, ferramentas nativas do produto, merge ou deploy. Nenhum oracle reservado, parecer privado, ledger ou captura foi consultado ou publicado.

Os critérios A-01–A-10 são endereçados por este pacote, mas a decisão da revisão independente pertence aos revisores da orquestração. O artefato permanece **candidato estático para a coordenação** e não expressa PASS global, conclusão da integração ou aceite humano.
