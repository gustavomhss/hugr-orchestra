# L3 — Relações e fluxos da fatia Platform 200

Corpo de autoria estática; decisões de revisão ficam no índice/resumo do pacote. Baseline: `1cde2ff7a71bcf7aecb5d030917b577165135d38`. A população continua sendo as **200 primárias** do [manifesto](../manifest.json). Esta síntese usa os 21 corpos L2 aceitos, lidos integralmente, e um apoio delimitado ao final. Não houve execução de produto, testes, CI ou consumidores.

Os tipos abaixo qualificam as arestas: **consumo causal** exige um input efetivamente lido ou uma dependência expressa; **contrato de formato** liga representações e condições de admissão; **especificação estática de teste** descreve o que uma assertion exigiria; **reconciliação histórica** compara documentos de momentos ou decisões diferentes; **navegação** apenas localiza uma base. As descrições de código são fatos estáticos mediados pelos corpos L2; intenção documental, inferência e lacuna são indicadas separadamente.

## R1 — Identidade de módulo conecta localização, tooling e preparação

**Consumo causal e contrato de formato.** P188 combina registry, arquitetura P187 e manifestos do working tree. Na preparação, P176 localiza script/core, confere nome/contenção física e cria links; P127 gera aliases desses dois módulos, separando validação pura do registry da admissão física. Mudar endereço pode afetar checker, bootstrap e verificadores Nix mesmo preservando o nome público; esses helpers não são instaladores gerais. Bases: [B-02, P187–P188](b-02.md), [B-04, P176](b-04.md), [A-05, P127](a-05.md).

**Especificação estática de teste.** P143/P150/P151 exigem fingerprint, recursos Desktop e aliases em fixtures realocadas. Isso especifica relocação, sem validar um movimento atual. P188 modela imports/exports; localizar a fonte não reproduz todos os resolvedores dos consumidores. Base: [B-05](b-05.md), com os limites de P188 em B-02.

## R2 — Lock, patches e grafo de tarefas definem inputs diferentes de reúso

**Consumo causal e contrato de formato.** P072 declara workspaces, resoluções, catálogo e vínculos para 19 dos 20 patches da população. P166 não está vinculado: seu hunk não pode ser atribuído à instalação resolvida. P019 extrai a versão Bun e usa lock/patches/manifests na identidade de cache; um hit de árvore instalada pode evitar instalação. Declaração, resolução e bytes instalados são identidades diferentes. Bases: [B-01, P072](b-01.md), [B-07, P166](b-07.md), [A-01, P019](a-01.md).

P200 acrescenta `transit` e inputs fora dos workspaces à identidade das tarefas; `transit` propaga o grafo sem executar build. P017 usa hashes Turbo e OS/shard para procurar um passe anterior; P039, no e2e, só salva esse passe após teste realmente executado com sucesso e chave disponível. A consequência é reúso condicionado ao conjunto declarado de inputs, sem nova execução no hit. Variável encaminhada ao processo não é necessariamente input de hash, e a declaração não demonstra completude dos inputs. Bases: [C-02, P200](c-02.md), [A-01, P017](a-01.md), [A-03, P039](a-03.md).

## R3 — Patches mudam contratos locais, com pontes de integração ainda externas

**Contrato de formato.** P157 devolve thinking nativo em `providerMetadata`, mas o replay procura `providerOptions`; a ponte consumidora não aparece no patch. P066 exige documentalmente compatibilidade exata de provider/modelo para metadados nativos de continuação. Essa afinidade não demonstra a ponte nem aceitação remota. O exemplo mostra por que um patch de adaptação não prova integração entre turnos. Bases: [B-06, P157](b-06.md), [C-03, P066](c-03.md).

Na compilação, P172 exige C++20, enquanto P137 admite/reconstrói prebuilds por CPU/libc: são contratos distintos da mesma dependência. P198 altera versões/lock, mas não rebaseia patches como P163. **Consequência inferida:** trocar versão exige reconsiderar delta e consumidores; resolver o hunk não prova integração. Bases: [B-07, P163/P172](b-07.md), [B-01, P137](b-01.md), [B-04, P198](b-04.md).

## R4 — Artifacts nativos chegam ao produto por seleção e admissão explícitas

**Consumo causal e contrato de formato.** P033/P037 declaram produtores de companions Omni e bundles tree-sitter como predecessores; P041 exporta os bundles. P022 tem outro papel: lanes de ABI, sem construir a CLI inteira nem certificar saídas Nix. P133 seleciona o par addon/supervisor pelo alvo, sem completar um perfil local com outro. P137 exige chave exata, distinguindo musl mesmo com paths internos iguais. CPU, formato, libc e arquivos obrigatórios fazem parte da admissão. Bases: [A-02, P022/P041/P033](a-02.md), [A-03, P037](a-03.md), [B-04, P133](b-04.md), [B-01, P137](b-01.md).

P016 restaura modo executável perdido no transporte. No Nix, P112 exporta `cliArtifacts`, consumidos por P110 via `ORCHESTRA_CLI_PREBUILT_DIR`. P110 poda antes de reparar: P124 escolhe por nome de diretório, P125 confere CPU/reconstrói e P126 exige carga/parsing nativos. Essas garantias não são equivalentes: cabeçalho não prova ABI; P126 não abre GUI nem qualifica toda a árvore de processos. Bases: [A-01, P016](a-01.md), [A-04, P110/P112](a-04.md), [A-05, P124/P125](a-05.md), [A-06, P126](a-06.md).

## R5 — Dependências de workflows delimitam qualificação e publicação

**Consumo causal e especificação estática de teste.** A publicação CLI P036 depende expressamente de assemble e qualify; qualify chama P025. O bundle exige controles, nonce e resultados das lanes definidas, sem transformar sua mera declaração em execução. Já a release Desktop P037 não chama diretamente P025. O espelho P034 delega a P192 e não tem `needs` que o faça aguardar P035; compartilhar evento ou diretório de workflows não cria esse bloqueio. Bases: [A-03, P025/P036/P037](a-03.md), [A-02, P034/P035](a-02.md), [B-04, P192](b-04.md).

P036 calcula checksums depois das etapas previstas de assinatura, mas a configuração permite assinatura opcional e a publicação em múltiplos destinos não é atômica. Isso delimita a relação com P104: o contrato documental de payload/descriptor, checksums e qualificação é uma referência de formato e intenção; P105/P106 registram campanhas e quantidades históricas que não substituem o YAML corrente. Readiness Nix de P108 também não é resultado atual. Branch protection, execução de lanes, assinatura efetiva e produto instalado continuam fora da evidência desta síntese. Bases: [A-03, P036](a-03.md), [A-04, P104/P105/P106/P108](a-04.md).

## R6 — Nix separa medição, proveniência e verificação de saídas

**Consumo causal e contrato de formato.** P027 coordena prepare, workers e completion; P109 captura comandos/saídas e chama P117. As normalizações P114/P118 alimentam os recibos: P117 exige contagens positivas, ordem e mismatch Nix estritos, vinculando hash NAR e 17 arquivos de evidência. O candidato é `MEASURED_CANDIDATE_NOT_APPLIED`; hash da dependência e digests dos registros são identidades distintas. Bases: [A-03, P027](a-03.md), [A-04, P109](a-04.md), [A-05, P114/P117/P118](a-05.md).

P115 agrega contexto de run/attempt, jobs, artifacts e workers, reconstrói candidatos e exige checkpoint delimitado. Em current, compara campos de run com variáveis Actions; a igualdade de `dependencyInputs` na proveniência é entre JSONs capturados, não leitura direta dos inputs atuais do checkout. A condição `GITHUB_ACTIONS=true` de P109 não autentica origem ou pessoa; sua trap observa o estado Git final, sem detectar toda mutação intermediária revertida. O agregador distingue medição de captura nativa concluída com qualificação de produto ainda pendente. Bases: [A-06, P115](a-06.md), [A-04, P109](a-04.md).

**Especificação estática de teste.** P120/P121/P122/P129 plantam defeitos e exigem códigos/conjuntos exatos. P122 recalcula digest adulterado para exigir imagem/carga real: checksum não basta. No formato compartilhado de controles, P116 é mais permissivo que P115 para duplicatas e nomes/códigos; P142 testa parsing, não os controles. P113 conserva bytes selecionados sem julgar semântica. Bases: [A-05, P120/P129](a-05.md), [A-06, P113/P115/P116/P121/P122](a-06.md), [B-05, P142](b-05.md).

## R7 — Política arquitetural alimenta análise e transformações com alcance próprio

**Consumo causal e contrato de formato.** P187 alimenta P188/P178, e o modelo compartilhado também sustenta P181, P183, P189 e P191. A tabela de camadas expressa permissões; só as arestas coletadas correspondem a imports encontrados. O checker cruza registros, declarações, ownership, exports e README; seus mínimos de população combatem scan vazio, sem provar completude. O grafo de bundle R15 ignora tipos, enquanto R1 os considera; um escopo estreito reduz o grafo observado. Bases: [B-02, P187/P188/P178](b-02.md).

P181 altera literais para facades; P183 compara resolução de demandas ao fechar exports; P191 usa mapas from/to depois dos movimentos físicos e relata pins textuais. `exportMissing` e pins não são, sozinhos, falha do relinker, e preservar alvo no modelo não prova equivalência de runtime. P189 sincroniza um bloco gerado por política **e manifesto**, preservando a separação da prosa. P144/P145 especificam defeitos e fixtures para esses contratos, sem demonstrar conformidade atual. Bases: [B-03, P181/P183/P191/P145](b-03.md), [B-02, P189/P144](b-02.md).

As exceções têm chaves próprias. P177 tolera ocorrências regra/arquivo/specifier; comparação histórica de crescimento em P178 depende de `--base` e tem limite no tratamento de erro Git. P180 compara hits atuais com P197 nos dois sentidos, sem verificar historicamente a política de só reduzir permissões. **Consequência inferida:** uma mudança de path pode exigir atualizar vínculos sem representar capacidade nova, mas uma declaração de exceção não demonstra autorização independente nem uso em runtime. Bases: [B-02, P177/P178](b-02.md), [B-05, P134/P180/P197](b-05.md).

## R8 — Os planos explicam decisões sem substituir a fotografia estática

**Reconciliação histórica.** P075/P092 distinguem mover caminho, manter identidade e mudar produto. P076 propunha ownership separado, util e movimento Relay; P090 preferia registry arquitetural e helpers browser-safe. P083 cancela alternativas, inclusive o movimento Relay cujo leitor de guard poderia perder alvos silenciosamente. Logo, os planos de origem não se somam numa arquitetura instalada. P074 corrige critérios de saída com uma projeção de 487 exceções no rehearsal; P177 contém 94 no baseline. A diferença requer preservar momento e população, sem deduzir automaticamente quais mudanças fecharam a dívida. Bases: [C-05, P075/P092](c-05.md), [C-06, P076/P090](c-06.md), [C-07, P083](c-07.md), [C-04, P074](c-04.md), [B-02, P177](b-02.md).

P091/P085/P086 avisam que contratos públicos V1 usados nas auditorias foram removidos. Ports, composição e flip permanecem história/intenção; movimento de arquivo não demonstra sucessão funcional. P088 distingue presença de rota de vocabulário de eventos e estados consumidos pelo renderer. Os briefs e P080 são navegação/especificação de despacho, sem dependência de runtime entre todos os destinos. Bases: [C-07, P080/P091](c-07.md), [C-08, P085/P086/P088](c-08.md).

## R9 — Preservação por bytes e recuperação têm consumidores distintos

**Consumo causal e contrato de formato.** P175 seleciona escopos; P174 resolve uma revisão e inventaria blobs/modes/tamanhos. P193 consome esse inventário, lê e revalida os bytes, deduplica payloads e restaura em staging; P194 pede publicação exclusiva ao SO. P149 especifica corrupção, aliases e concorrência, sem provar todos os interleavings. O inventário não restaura sozinho; hashes autocontidos não autenticam externamente a origem. Bases: [B-03, P174/P175](b-03.md), [B-04, P193/P194/P149](b-04.md).

**Reconciliação histórica e navegação.** P093–P097 fixam índices e relatam recuperação de bundles externos; readers não comprovam disponibilidade do payload. Quando o leitor foi removido junto com o escopo, sua recuperação é condição material para voltar a usá-lo. P192 tem outro contrato: replay first-parent com árvore/trailer conferidos, sem reproduzir toda a topologia de merges. Índice, mirror e bundle não são mecanismos equivalentes. Bases: [C-04, P093–P097](c-04.md), [B-04, P192](b-04.md).

## R10 — Evidência visual depende do objeto realmente observado

**Contrato de formato, consumo causal e navegação.** P001 atribui valores às folhas de estilo e pede atualizar DESIGN; P002 distingue instalado com CSS injetado de dev com TSX/CSS. P007 troca seu `style`, preservando folhas antigas: uma captura ainda pode refletir declarações retiradas da fonte nova. P003 informa contraste, P006 ajusta luminosidade sem garantia final e P010 monta imagens sem identidade/veredito. A observação precisa ser ligada ao build/fontes efetivos. Base: [C-01, P001/P002/P003/P006/P007/P010](c-01.md).

P055 é consumido diretamente pelo install/set de P056, um smoke plugin TUI sem assertions automáticas; não implementa o sistema CSS de vidro. Os guias P098/P070 dão navegação por tarefa e sintoma, e os índices visuais P096/P097 preservam história, sem fornecer uma captura do baseline. Essas relações localizam evidência e superfícies; não criam dependência de execução entre o smoke, a UI desktop e os arquivos arquivados. Bases: [C-01, P055/P056](c-01.md), [C-04, P098/P096/P097](c-04.md), [C-03, P070](c-03.md).

## R11 — Captura documental não equivale à admissão pelo leitor Atlas

**Contrato de formato e inferência estática delimitada.** P072 tem 489.909 bytes no manifesto e na leitura estrutural de [B-01](b-01.md). O apoio [ownership-input.ts](../../../../../packages/adapter-io/src/ownership-input.ts), L172/L181, retorna `unavailable` acima de 256.000 bytes; L182 deriva a versão presente de uma estrutura com os bytes. Portanto, essa fonte excede o caminho de leitura mostrado. Seu Git blob e SHA-256 de transporte não são uma versão observada de input nem recibo Atlas. A recusa não significa `absent`, e o tamanho menor das outras 199 não demonstra sua admissibilidade. Não foi executado o observador nem alterado seu limite.

Esse apoio adicional, **sem recontagem de primária**, pertence ao mesmo commit: path `modules/atlas/packages/adapter-io/src/ownership-input.ts`; Git blob `c6afd6a35071a2487a1168cea5ed1ad26379c376`; SHA-256 `71c14819e60f81482c34f3fd84b47a08a972bcba5b19914e3b95d5a78161bc78`. A premissa aceita delimita apenas essa fronteira. Nenhuma relação acima transfere autoridade para implementação de outros escopos, ingestão, manutenção executada ou aceitação global.

## Predecessores efetivamente usados

Os links anteriores localizam as bases; os pins abaixo identificam seus bytes. Todos os corpos foram lidos integralmente nesta autoria. O manifesto recebeu leitura estrutural completa. A aceitação desses predecessores não julga esta unidade nova.

| Unidade | SHA-256 |
|---|---|
| manifest | `293392e28b20da40124af6ed710f3fb29fc6f208446ff966448617562c4e8c1d` |
| A-01 | `9ba73c99cdc6c0c05e5cac895320a463d9468b7e4d778ef81486dfd8b83f656e` |
| A-02 | `49417c5c197630418170ec3bf46d3e39aac2d6104ba1b9f5a756c7038cab179b` |
| A-03 | `690a9b65eae04a4cba640384e5c699c0654472c057f854622feb7148168d42aa` |
| A-04 | `ce0b80571ed5985df188996f604dfb5fe8cea91e128fe1c6fa9257fc0f8c271d` |
| A-05 | `09a1ad18a45f4c4d23f7c03d05839cd48860f98370af6e6624fd2ec0df771993` |
| A-06 | `da137d618577bc50764ce6a168bf9c05ae03f5bfbcd3836b90acaa3d3db1f079` |
| B-01 | `5764f08a06d60c22db605de956a09afab1786af86e126d81be4fc81496d7f1a5` |
| B-02 | `f37a19f2ad44d31ac325a9d61cb0b383564bf743f3d530b5b30661dc5d2f076f` |
| B-03 | `da129131222a1f111877c1c9eedc8ce130c9373d4f5251b4075f8d35281005d4` |
| B-04 | `3ff6b3065e3e73a7500ecd60781ac8bee401dcd898c106183d7a596f6faf1429` |
| B-05 | `b64091ecd3f1a90507a46ebb3d6597d6a7f88695ca42ea8b69b3f171cc9b1246` |
| B-06 | `08b1000e5f8222e36200858ebc42d7217c07f0e0c38423af4ff4c96ede0a2311` |
| B-07 | `5737f501719e35a5cf4149c5fbdd41cd9e547fd3c7a6feaaedb678960d0392da` |
| C-01 | `41b285b84fbbf72693cbeb0784f70352636ec6f55bf952be4d5693edae9f3048` |
| C-02 | `655e1baa50f43e5ede9a134f4107f39eab8e72fadacee30e2aa3ad1037513bc7` |
| C-03 | `ba2d13b34111d4b32922c3177e80032c9d39e274d19634015a7e4455b1cfdd30` |
| C-04 | `87458bdd131efcec6e3f0fdc2d7bc7fdeafb00aa9222abd305f5f5049efbebc8` |
| C-05 | `3595ff75ad69dc68897e40852d68b7eee70422f847818f32235a1042bbe2ecf2` |
| C-06 | `aab4cb35b78d3c48673aed5ccfb7a0f55df8cc6512ecf2762efb53463f96e88a` |
| C-07 | `35ccb181c5167dd2d093f43ed7a5cdeee221a17981d24e88ad59cb980cd50bf4` |
| C-08 | `32bfe540290c320d5761b1535c5cb8f02adcdce57467f7bdff64f26d4e96747c` |
