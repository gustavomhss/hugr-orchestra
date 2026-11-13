# Platform 200 — trabalho e limites

Execução local: `e37ea00f-15fd-4383-b64c-4448ac34c9fe`.

- Repositório: `gustavomhss/hugr-orchestra`.
- Branch: `genesis-external-platform-remainder`, criada exatamente no baseline.
- Fonte imutável: `1cde2ff7a71bcf7aecb5d030917b577165135d38`; árvore `a522a53e5f046f1758151b0f558531bbded04592`.
- Prompt S5: `d2d985c28947c7f984a36b07ad34ede3d4d2d6b4`.
- Skill/protocolo: `ee2521a5b966bd505cc95bd1c733e09e12f33531`.
- Escopo: a lista explícita de 200 caminhos desta sessão, reproduzida em [manifest.json](manifest.json). A população ampla da S5 serve de contexto, não amplia este escopo.

## Inventário e fila finita

Os 200 caminhos foram resolvidos em árvores Git completas, sem truncamento. Há 200 caminhos únicos e 200 blobs; nenhum ausente, duplicado ou tipo divergente. Somam 2.295.653 bytes. Fontes de apoio não contam na população.

| Lote | População | Responsabilidade | Estado |
| --- | ---: | --- | --- |
| A | 54 | Distribuição, Nix, CI e contratos de distribuição | PRODUZIDO; REVISÃO PENDENTE |
| B | 69 | Tooling, scripts, patches e lockfile | PRODUZIDO; REVISÃO PENDENTE |
| C | 77 | Arquitetura, guias, configs e visual QA | PRODUZIDO; REVISÃO PENDENTE |

Três subagentes distintos receberam autoria disjunta em paralelo. A principal mantém exclusividade de escrita remota. A revisão usará dois novos juízes, independentes da autoria, com o mesmo pacote e correções vinculadas; nenhum autor julga o próprio lote.

## Critérios e custódia

[criteria.md](criteria.md) foi congelado antes dos despachos. Os casos reservados foram fixados e hashados antes da autoria e não entregues aos autores. Sua referência opaca real é `libfile_fde3_f-03b718ea6e448191a9b6abd41aa64940_3a07899f8a4481918837fffaac5a42fc`, SHA-256 `b217c44958074cc0ed19c22fe2b931716d10ca2d944c8ab9d3fdbb45d77cb42c`. A gravação em custódia pessoal foi confirmada. Esta referência identifica conteúdo privado; não concede acesso público. Separação dos autores é de contexto e instrução, sem alegação de isolamento por permissões de sistema operacional.

O repositório público conterá apenas conhecimento próprio, manifesto, vínculos, disposições e resumo de revisão. Oráculos, pareceres integrais, registros privados de execução e capturas não pertencem aos commits.

## Limites desta entrega

O pedido desta sessão autoriza estudo estático e candidato documental. Não autoriza executar testes, ferramentas/código do produto, workflows, consumidores Atlas, gates de runtime, PR/merge/deploy ou integração da campanha. Comandos presentes nas fontes são dados estudados. Documentos e testes podem descrever comportamento ou runs anteriores, sem provar execução nesta sessão.

L1–L2 precedem a aceitação de L3–L4. O candidato final deve manter lacunas e achados abertos, se houver. Nenhum status deste pacote representa PASS global, binding Atlas, proteção de branch observada, manutenção executada ou aceite da coordenação.

Uso de tokens, custo e tentativas físicas internas do provedor: UNKNOWN. A publicação observará HEAD/parent/tree reais e lease sem força, com conferência remota. O estado atual é IN_PROGRESS; este checkpoint não é conclusão.


## Checkpoint de autoria A

Os seis corpos `bodies/a-01.md` a `bodies/a-06.md` contêm seções para 54/54 fontes de A, lidas integralmente pelo autor. Os bytes capturados foram conferidos independentemente pela principal. Os corpos ainda não têm aceite do par de juízes. B e C continuam em autoria; o mapa consolidado de cobertura e os vínculos de revisão serão incorporados ao pacote final.

## Checkpoint de autoria B

Os sete corpos `bodies/b-01.md` a `bodies/b-07.md` cobrem as 69 fontes de B. A leitura do lockfile é estrutural integral, com todos os registros percorridos; não afirma julgamento semântico individual de cada dependência. As demais 68 fontes foram lidas integralmente como texto. `coverage-a.json` agora preserva o mapeamento das 54 fontes de A. Nenhum desses estados substitui o juízo independente.

## Checkpoint de autoria completa

Os 200 caminhos têm seção semântica própria e mapeamento em `coverage-a.json`, `coverage-b.json` e `coverage-c.json`. Há 198 leituras textuais integrais, uma constatação integral de blob vazio (`.sh`, zero bytes/linhas) e uma leitura estrutural integral de `bun.lock`. Não se inventa comportamento para o blob vazio nem semântica individual das dependências do lockfile. A verificação documental conferiu todos os bindings e faixas possíveis, sem erro. Revisão independente permanece em andamento; produção completa não é aceitação.

## Checkpoint de revisão A-01

O par independente aceitou documentalmente o corpo `bodies/a-01.md`, com 11 fontes, após complemento explícito sobre método de leitura e critérios herdados. O corpo permaneceu inalterado. As duas pendências documentais do primeiro juiz foram resolvidas; o segundo confirmou sua decisão com o mesmo complemento. Os outros 189 caminhos continuam pendentes de revisão. [review-summary.json](review-summary.json) registra o alcance exato; não contém os pareceres privados.

Os critérios da síntese integrada final estão congelados em [layer-criteria.md](layer-criteria.md), antes do respectivo despacho. Casos adicionais têm custódia real `libfile_fde3_f-f844acdc30508191a34085a0e5416579_3a07899f8a4481918837fffaac5a42fc`, versão 0, SHA-256 `7ec1eca16ccc6bffc8a078d46e8414bed529ea516168b3f81dfbef29d5fa8b44`. Aplicam-se à nova síntese integrada, sem aprovação retroativa de propostas privadas anteriores. A liberação de L3–L4 continua condicionada aos predecessores aceitos.

## Checkpoint de revisão: 43 fontes

A-01 (11), A-02 (12), B-01 (8) e C-01 (12) têm aceite documental dos mesmos dois juízes, sem dupla contagem. As duas solicitações específicas de suporte do lockfile foram resolvidas com consulta da travessia preservada e nova conferência documental dos mesmos bytes. Não houve instalação, download de pacotes ou execução de produto. A grafia `modelos.dev` foi corrigida para `models.dev` em uma frase de P038; a versão anterior foi preservada e o delta passou pelos dois juízes. Uma sugestão opcional de precisão sobre indicadores de emulação permanece registrada, sem bloquear o aceite local.

A custódia privada dos registros originais dessas quatro unidades foi confirmada: referência opaca `libfile_fde3_f-37490b821af88191b1992581701f56df_3a07899f8a4481918837fffaac5a42fc`, versão 0, SHA-256 `f7a3a109b1cb8d74f9e4585a1febbc8b3aeaf52fbb79ebfb4da418d302f9d2e3`. O estado vigente de revisão fica em `review-summary.json`; os campos de disposição dos arquivos `coverage-*.json` ainda representam o checkpoint de autoria e serão reconciliados na entrega final. Restam 157 fontes para revisão dupla. Nenhuma camada L3–L4 foi promovida.

## Checkpoint de revisão: 81 fontes aceitas

A-01, A-02, A-03, B-01, B-02, C-01 e C-02 somam 81 fontes distintas aceitas documentalmente pela mesma dupla, nas versões exatas do resumo. Foram corrigidas duas ampliações materiais de garantia: a validação de argumentos do bundle não exige conteúdo não vazio dos arquivos, e R5 modela um destino lexical sem provar confinamento da resolução real. Também foram incorporadas precisões sobre R11, sinais de emulação e dependências Turbo. O suporte de três linhas sobre portabilidade Windows foi completado. Cada alteração voltou ao par; o histórico anterior foi preservado.

A-04 acrescenta oito fontes examinadas por ambos, mas permanece com duas correções materiais em revisão: admissão por variável de ambiente não autentica a origem da execução, e sujeira no status Git final não equivale a detecção de toda mutação. Assim, 89 fontes foram examinadas por ambos e 81 estão aceitas; 111 ainda aguardam o primeiro par de pareceres. O total não aceito é 119, sem dupla contagem.

Registros privados deste checkpoint têm custódia real `libfile_fde3_f-338e795aa89c8191b147fe8afe609589_3a07899f8a4481918837fffaac5a42fc`, versão 0, SHA-256 `1a42022d89cbdeb1246ffe068698dcfcf43434cc545656c39a90dc8a18863916`. O identificador não torna os pareceres públicos. As camadas integradas L3–L4 continuam sem promoção. Nenhuma execução operacional foi acrescentada.

## Checkpoint de revisão: 110 fontes aceitas

As dez unidades A-01–A-04, B-01–B-02 e C-01–C-04 somam 110 fontes distintas aceitas documentalmente nas versões atuais. A dupla reavaliou e encerrou as correções de P109/P112; os dois grupos de contratos e guias de C passaram na mesma versão, sem achados materiais. Permanece uma sugestão não bloqueante para a síntese de navegação: distinguir Actions no guia de Checks (anteriormente Actions) no changelog, sem inferir a interface instalada.

B-03 tem 12 fontes examinadas pelos dois, com correções documentais localizadas em preparação/revisão: separação de casos da fixture de inventário e alinhamento do nome exportMissing. O resultado é 122 fontes examinadas por ambos, 110 aceitas, 78 aguardando primeiro par e 90 ainda não aceitas. Os demais corpos continuam produzidos; não são aceitos por extrapolação.

Custódia privada confirmada dos registros deste checkpoint: `libfile_fde3_f-720a2dca401081919a454ae2fb4bd084_3a07899f8a4481918837fffaac5a42fc`, versão 0, SHA-256 `400a8d51ae61a0cec3bd119257a0712b3b3c3787dff0c417c4b062741bbc6b70`. Os próximos transportes são limitados à capacidade de leitura do par: texto literal completo e evidência decisiva permanecem requisitos. Não houve promoção de L3–L4 nem execução de produto.


## Checkpoint do delta B-03

O corpo B-03 foi corrigido em cinco linhas e o mapa B em dois campos: os casos de readers esparsos e revisão inválida foram separados, a ordem de validação foi atribuída à implementação e o identificador foi alinhado a `exportMissing`. O corpo corrente tem SHA-256 `da129131222a1f111877c1c9eedc8ce130c9373d4f5251b4075f8d35281005d4`. O primeiro juiz aceitou o delta e o segundo está em avaliação; este checkpoint ainda mantém 110 fontes aceitas pela dupla. A versão anterior e seus pareceres permanecem preservados.
