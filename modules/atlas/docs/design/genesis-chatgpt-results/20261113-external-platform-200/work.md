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


## Checkpoint de revisão: 122 fontes

A mesma dupla aceitou o delta de B-03 e os dois campos de cobertura correspondentes. Os achados obrigatórios e opcionais dessa unidade foram encerrados, sem alterar a população nem executar produto. São 122 fontes aceitas nos corpos atuais; 78 aguardam aceite da dupla. A tentativa interrompida de um juiz não recebeu resultado presumido: o mesmo contexto foi retomado e emitiu o parecer efetivo. A retransmissão de texto após compactação é registrada separadamente da leitura das fontes e da decisão semântica.

Custódia privada real: referência opaca `libfile_fde3_f-11d3446a1e508191bb7d852a4d0e6bc9_3a07899f8a4481918837fffaac5a42fc`, versão 0, SHA-256 `c0253078b7d887057c7cf24dba76d7eb2aa8fa2dfde0b02201b42a1de40b20cd`. Ela preserva os registros visíveis disponíveis e distingue conclusões de atividades ainda pendentes; não é recibo assinado do provedor, prova de runtime ou conclusão global.


## Checkpoint de revisão: 153 fontes

Os mesmos dois juízes aceitaram A-05, A-06, B-04 e C-05, além das onze unidades já aceitas. O total vigente é 153 fontes distintas aceitas, em quinze corpos L2; 47 fontes permanecem em seis unidades pendentes. Em A-06, a alternativa de completion sem system foi incluída e as fronteiras das comparações/erros foram delimitadas. Em B-04, a direção do replay first-parent foi corrigida para ancestral→descendente. Os deltas foram reavaliados pela mesma dupla e os achados obrigatórios dessas unidades estão encerrados. Cinco observações opcionais permanecem registradas em três unidades, sem ampliar a barra de aceite.

Custódia privada real dos registros disponíveis: `libfile_fde3_f-2a7935e2614c819189ceab2bba744e79_3a07899f8a4481918837fffaac5a42fc`, versão 0, SHA-256 `4c801a4a2a887424d0bf96d6e3c73a1f868b0a4e83c47287a0baa3a1a10cb716`. Os originais distinguem leitura da autora, conferência mecânica e exame dos juízes, incluindo retransmissões e continuidade literal. O manifesto L1 tem transporte em preparação/revisão; L3–L4 continuam sem liberação. Nenhum teste, ferramenta ou código do produto, CI ou consumidor foi executado.

## Checkpoint: 164 fontes e manifesto L1

A dupla fixa concluiu B-05 sem alteração de corpo; são 16 unidades L2 e 164 fontes primárias aceitas documentalmente. O manifesto L1 também recebeu os dois pareceres, sem acrescentar fontes à contagem. Permanecem B-06, B-07, C-06, C-07 e C-08 antes da liberação da síntese final L3–L4.

B-07 recebeu suporte literal complementar do bloco patchedDependencies de bun.lock, com 19 entradas e sem vínculo para o patch standard-openapi. Um juiz encerrou essa pendência; a unidade ainda aguarda a dupla. Em B-06, o segundo juiz informou indisponibilidade literal das mensagens apesar de retornos de envio sem erro; a retransmissão usa confirmação por parte. Esses estados não foram contados como aprovação.

A observação estática de ownership-input.ts, no baseline, identifica limite de 256.000 bytes para leitura de arquivo. bun.lock tem 489.909 bytes e continua no escopo de 200: seu transporte a esse observador permanece uma lacuna de integração, sem prova de remoção nem tentativa operacional nesta sessão. A fonte de apoio não é entrada adicional da fatia.

## Checkpoint: 184 fontes aceitas

B-06 e B-07 completaram o aceite dos mesmos dois juízes, sem mudança de corpo. São 18 unidades L2 e 184 fontes primárias aceitas; restam 16 fontes em C-06, C-07 e C-08. O manifesto L1 permanece aceito pela dupla. C-06 recebeu uma correção de cardinalidade: App Dock é um módulo lógico distribuído por três pacotes. A condição de recusa de prefixação node: também foi explicitada. O primeiro juiz fechou os dois apontamentos; o segundo está recebendo a versão completa corrigida. C-07 tem um parecer favorável e C-08 está em transporte; nenhum desses estados parciais foi convertido em aceite da dupla.

Duas transcrições de evidência de P171 foram corrigidas e preservadas. A comparação dos bytes capturados confirmou as 68 correspondências de compactação dos patches B-06/B-07; o erro estava nas cópias enviadas, não na fonte ou no corpo. O mesmo juiz recebeu o complemento correto e manteve o aceite. Retorno de envio sem erro, confirmação literal e decisão semântica permanecem registros distintos.

Custódia privada confirmada: `libfile_fde3_f-85c3faf588908191ade2fc93b8e0d583_3a07899f8a4481918837fffaac5a42fc`, versão 0, SHA-256 `3ca1fb301cc0a4f267fb83ebdaf33e16a1807203f8d4d796e240e5b70055c4cc`. A síntese final L3–L4 ainda não foi liberada. Esta publicação é checkpoint documental, sem execução operacional ou conclusão global.

## Checkpoint: 194 fontes aceitas

C-06 e C-07 completaram a revisão da mesma dupla nas versões atuais. São 20 unidades L2 e 194 fontes primárias aceitas. Em C-07, o complemento da linha integral P083 L561 confirmou que MCP Dock já aparece no card RD-DESKTOP: a redação passou a ligar explicitamente esse alias a App Dock/app-dock, preservando as autoridades distintas dos RPCs. O achado era insuficiência do recorte apresentado, sem demonstrar inexistência do alias na fonte. A anotação local sobre a remoção de server-protocol também foi localizada corretamente. Os apontamentos dessas duas alterações foram encerrados pelos mesmos juízes.

C-08 permanece pendente de decisão do segundo juiz. A versão aqui preservada corrige re.S para DOTALL e separa a exigência documental de IDs únicos da limitação do predicado truthy no exemplo; o primeiro juiz aceitou essas alterações. Os cinco segmentos literais do envelope atual foram efetivamente enviados ao segundo juiz, sem presumir seu resultado. Nenhum desses seis caminhos entrou no total de 194 por extrapolação.

A conferência mecânica cruzada confirmou 200 junções únicas entre manifesto, mapas de cobertura e seções com ID/path/blob nos 21 corpos. Ela verifica correspondência interna, sem substituir juízo semântico ou nova conferência dos blobs remotos. O apoio sobre o limite do leitor de inputs recebeu um parecer; sua revisão dupla e a autoria integrada continuam pendentes. A leitura de bun.lock permanece estrutural completa e a fonte vazia .sh conserva sua disposição própria.

Custódia privada confirmada dos registros disponíveis: `libfile_fde3_f-63fe6843880c8191b4e4e66c3777fad2_3a07899f8a4481918837fffaac5a42fc`, versão 0, SHA-256 `f7649444fd58fa1ebe4af105302e2c3b285d98fec17ca69da208f780f16e2fd9`. Há uma limitação de proveniência explícita: os textos iniciais de criação/ativação dos juízes não estão preservados separadamente como transcrições originais do provedor. Pacotes literais, decisões visíveis, pedidos posteriores, correções e identidades reais estão preservados; nenhum original ausente foi fabricado. Tokens, custos e tentativas internas continuam desconhecidos.


## Checkpoint: 200 fontes aceitas em L2

C-08 concluiu o aceite integrado do mesmo segundo juiz, cobrindo P084–P089 e as relações do lote. O primeiro juiz já havia aceitado o corpo corrigido. São 21 corpos L2 e 200 primárias distintas aceitas documentalmente, além do manifesto L1 aceito sem nova contagem. Nenhum achado obrigatório permanece aberto nessas unidades. C08-O1 conserva uma precisão opcional: o filtro da fonte refere-se a mensagens de usuário ainda não entregues.

A retomada de J2 conservou o mesmo ID, corpo e critérios. Após o host informar inicialização pendente, uma checagem explícita confirmou a disponibilidade literal das cinco partes e de todos os excertos. Avaliações delimitadas foram seguidas de uma decisão real sobre a coerência do conjunto; nenhuma tentativa sem resposta ou simples confirmação de transporte foi contada como parecer.

Os três mapas de cobertura foram reconciliados para explicitar cada disposição e o vínculo do corpo corrente. O manifesto continua autoridade para ID, path e blob; as explicações e evidências semânticas permanecem nos corpos. A junção mecânica confirmou 200 IDs únicos com hashes corretos. Essa transformação de metadados ainda requer a revisão independente final, separada do aceite dos corpos. As versões detalhadas anteriores foram preservadas no histórico.

Custódia privada confirmada dos registros disponíveis: `libfile_fde3_f-c8dabdfdcfa08191936e7dee79cc646d_3a07899f8a4481918837fffaac5a42fc`, versão 0, SHA-256 `f3a8fe31d3cd62769d3804f5436de25403cad12999b30e5794987669afc4b445`. Ambos os juízes receberam os critérios e os casos congelados para a nova síntese. A premissa de apoio aguarda o segundo julgamento antes da liberação de L3; L4 depende de L3. Este marco fecha a cobertura documental de fontes, sem declarar encerrada a entrega ou provar runtime.
