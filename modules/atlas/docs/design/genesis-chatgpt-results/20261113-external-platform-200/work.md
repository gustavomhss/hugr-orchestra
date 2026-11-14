# Platform 200 — execução documental, decisões e limites

O conjunto de **200 fontes** foi inventariado, lido e coberto por **21 corpos L2**, aceitos nas versões exatas pelos mesmos dois juízes independentes. O manifesto L1, a síntese de relações L3 e três entradas L4 também têm aceite documental local: **26 artefatos de conhecimento**. O alcance da revisão da transformação final de metadados e sua publicação estão vinculados no [handoff](handoff.json). O resultado permanece candidato à verificação própria da coordenação.

## Identidade e fronteira

| Campo | Vínculo |
| --- | --- |
| Repositório | `gustavomhss/hugr-orchestra` |
| Branch exclusiva | `genesis-external-platform-remainder` |
| Execução local | `e37ea00f-15fd-4383-b64c-4448ac34c9fe`; identificador gerado pela orquestradora, sem alegação de ID do host |
| Fontes | `1cde2ff7a71bcf7aecb5d030917b577165135d38` |
| Árvore das fontes | `a522a53e5f046f1758151b0f558531bbded04592` |
| Prompt original S5 | `d2d985c28947c7f984a36b07ad34ede3d4d2d6b4` |
| Skill e referências | `ee2521a5b966bd505cc95bd1c733e09e12f33531` |
| Prefixo de escrita | `modules/atlas/docs/design/genesis-chatgpt-results/20261113-external-platform-200/` |

A lista explícita do usuário é a autoridade dos 200 caminhos, sem expansão de prefixos. Os pins de prompt e protocolo não substituem o baseline das fontes. O escopo amplo da S5 contextualiza a campanha; este pedido especializa sua população, branch, destino e modalidade estática. Omni e guardrails continuam com os respectivos responsáveis. O estudo dos workflows Omni expressamente listados não confere ownership da implementação Omni.

## Fila inteira e autoria

| Lote | Fontes primárias | Corpos | Responsabilidade | Disposição atual |
| --- | ---: | ---: | --- | --- |
| A | 54 | 6 | Distribuição, Nix, CI e contratos de distribuição | Aceite documental do par |
| B | 69 | 7 | Tooling, scripts, patches e lockfile | Aceite documental do par |
| C | 77 | 8 | Arquitetura, guias, configurações e visual QA | Aceite documental do par |
| Total | 200 | 21 | União disjunta dos três lotes | Sem primárias pendentes |

Três subagentes reais receberam lotes disjuntos e trabalharam em paralelo. A orquestradora foi a única escritora remota. Dois outros contextos foram criados para julgar, separados da autoria, e os mesmos IDs foram preservados nas correções. Cada juiz aplica todos os critérios pertinentes; nenhum autor julga o próprio lote. Separação de contexto e instrução não é alegação de isolamento por permissões do sistema ou diversidade de modelo.

O [manifesto](manifest.json) resolve exatamente cada path em blob Git e registra SHA-256, bytes e lote. Os mapas [A](coverage-a.json), [B](coverage-b.json) e [C](coverage-c.json) ligam cada ID uma única vez ao corpo exato e à disposição. A síntese [relations](bodies/relations.md) distingue tipos de relação; [ownership](bodies/ownership.md) e [maintenance](bodies/maintenance.md) orientam responsabilidade funcional e reconsideração de mudanças; a [entrada](README.md) permite consulta progressiva. O [índice nativo](native-package.json) conserva autoria, corpos, fontes, dependências reais e referências privadas opacas.

## Leitura e identidade verificável

As fontes somam **2.295.653 bytes e 33.484 linhas**. Há 198 leituras textuais integrais, uma constatação integral do blob vazio `.sh` e uma travessia estrutural completa de `bun.lock`, com 1.921 registros de pacotes. A leitura estrutural não equivale à revisão do código de cada dependência, ao download/conferência de tarballs ou à aplicação de patches. Fontes de apoio não acrescentam entradas à população.

Os digests populacionais usam UTF-8 e ordenação pelos bytes UTF-8 de cada path, com LF após cada registro. Para caminhos, o registro é `path + LF`. Para a árvore, é `mode + TAB + object_type + TAB + git_blob_sha + TAB + path + LF`.

- Paths: `87b27e391d91a7371e5266ecbda370576032b7e125467d0a744b0585dea40e6f`.
- Registros da árvore: `49d641fae826831e1af5c9f162df8a1d0b2564ba16f07825142088de9f39a1c0`.
- Modos: 197 blobs `100644` e três `100755`.

Hashing, parsing e junções dos próprios artefatos conferem identidade e consistência interna. São distintos da leitura semântica dos autores e do exame dos corpos e excertos decisivos pelos juízes. Os 200 aceites de fonte significam cobertura pelos corpos examinados pela dupla; não afirmam releitura integral de todos os bytes originais pelos juízes.

## Construção cumulativa e critérios

[criteria.md](criteria.md) foi fixado antes da autoria de fontes; [layer-criteria.md](layer-criteria.md) foi fixado antes do despacho da síntese integrada final. Os casos reservados têm custódia real e não foram entregues aos autores. Propostas privadas anteriores permaneceram rascunhos, sem aprovação retroativa.

A liberação da nova autoria L3 foi registrada em `2026-11-13T22:54:36.240489+00:00`, depois de aceitos L1, os 21 L2 e a premissa de apoio pertinente. L4 só foi liberada após aceite do L3; a entrada final depende das unidades aceitas de ownership e manutenção. Dependência de construção é registrada quando o predecessor realmente sustentou a produção; links de navegação não são convertidos em causalidade.

A [matriz de critérios](criteria-matrix.json) preserva os 50 IDs normativos e separa a especialização documental, as exclusões operacionais impostas pelo usuário e as obrigações sem comprovação. PASS documental em uma linha não fecha a obrigação global original. Falta de ferramenta ou tempo não é usada como motivo de N/A.

## Correções e observações preservadas

O [resumo de revisão](review-summary.json) vincula as versões correntes e as cadeias de decisões. Não há achado semântico obrigatório aberto nos 26 corpos aceitos. Entre as correções materiais, foram delimitadas a validação de argumentos do bundle ([A-03](bodies/a-03.md)), a comparação de ambiente e o estado Git final ([A-04](bodies/a-04.md)), o destino lexical de R5 ([B-02](bodies/b-02.md)), as asserções das fixtures ([B-03](bodies/b-03.md)) e a direção ancestral→descendente do replay ([B-04](bodies/b-04.md)).

As revisões de [C-06](bodies/c-06.md) e [C-07](bodies/c-07.md) preservam App Dock como módulo lógico distribuído por pacotes. O complemento integral da fonte confirmou que o alias MCP Dock já estava no card RD-DESKTOP; a deficiência era a sustentação do recorte anterior. [C-08](bodies/c-08.md) distingue `re.S`/DOTALL e o contrato de IDs únicos da limitação do predicado truthy do exemplo. As correções e seus pareceres anteriores permanecem no histórico; foram alterações de conhecimento, sem modificação do produto.

Ocorrências de transporte literal foram registradas e corrigidas com os mesmos juízes. Retorno de envio sem erro, reconhecimento de disponibilidade textual e decisão semântica são fatos separados. A rechecagem das 68 correspondências compactadas de patches confirmou os recortes preservados; as transcrições incorretas recebidas em uma rodada foram substituídas e não usadas como prova final.

Permanecem 12 observações não bloqueantes em L2, sem ampliar a barra fixa de aceite:

| Unidade | ID | Precisão ou limite conservado |
| --- | --- | --- |
| A-05 | A05-O1 | Skip limita-se às consultas isDirectory selecionadas; o readdir inicial de bunRoot ainda pode falhar. |
| A-05 | A05-O2 | A seleção de owners verifica o endereço inicial da seção dentro de PT_LOAD gravável, não toda a extensão da seção. |
| B-04 | B04-O1 | A dispensa Windows é inferida dos targets textuais dos builds, não do sistema operacional do runner. |
| B-04 | B04-O2 | Resolve-Path exige paths resolvidos; não há filtro explícito de arquivo regular no predicado local. |
| B-05 | B05-O1 | O caso pré-importação usa commit sintético sem pai e sem domínio; a fixture não prova cronologia/ancestralidade. |
| B-05 | B05-O2 | A assertion verifica round-trip JSON em memória e baseUrl absoluto; não grava configuração em diretório externo. |
| B-06 | B06-O1 | O caminho externo providerMetadata.anthropic permanece inferência delimitada; hunk mostra somente inclusão do campo. |
| B-06 | B06-O2 | Opção promptCacheKey aparece também nas declarações; comentário de roteamento aparece nos hunks de fonte e JavaScript distribuído. |
| C-04 | C04-O1 | Actions in guide versus Checks (formerly Actions) in changelog; optional integrated-navigation precision; existing source summaries faithful. |
| C-06 | C06-O1 | A invariância formal do gerador abrange specifiers retidos e enumerados pela política full após filtros; R6b sobre imports é obrigação distinta. |
| C-06 | C06-O2 | 25 grupos canônicos não equivale à identidade de todos os caminhos /api/*; projectCopy é exceção de caminho documentada. |
| C-08 | C08-O1 | A fonte filtra mensagens de usuário ainda ausentes de state.delivered; o corpo resume como mensagens ainda não entregues. Precisão não bloqueante. |

As camadas integradas conservam 3 observações não bloqueantes distintas, registradas pelos mesmos juízes:

| Unidade | ID | Precisão ou limite conservado |
| --- | --- | --- |
| relations | L3-O1 | A tabela isolada de predecessores não explicita o pin da premissa de apoio; o vínculo exato já está no envelope de evidência. |
| relations | L3-O2 | Em R2, manifests resume o manifesto raiz usado pelo cache P019; não deve ser lido como cobertura de todos os manifestos de workspace. |
| maintenance | L4-M-O1 | A atualização das explicações e a submissão do delta ao mesmo par estão nos critérios referidos; explicitá-las no fechamento do roteiro facilitaria a continuidade. Observação opcional, sem alteração da barra. |

A precisão opcional de L1 sobre a serialização dos digests está explicitada acima. Seu histórico continua identificado no resumo de revisão, sem inventar uma decisão adicional de encerramento.

## Lacunas e exclusões operacionais

O pedido autoriza conhecimento estático. Não foram executados código, testes, ferramentas ou CI do produto, workflows, importadores, leitores/consumidores Atlas, manutenção operacional ou integração da campanha. Não houve PR, merge ou deploy. Comandos, asserções de testes e runs históricos nas fontes foram tratados como dados. Commits usam `[skip ci]`; isto não é uma afirmação de inspeção de toda atividade automática do provedor.

O lockfile tem 489.909 bytes. O ramo de leitura de conteúdo do observador no baseline retorna `unavailable` acima de 256.000 bytes; a comparação é inferência estática revisada, sem observação executada. O arquivo permanece entre as 200 fontes. Isso não estabelece admissibilidade das outras fontes, versão de input, hash CAS, receipt, importação ou binding de runtime. A forma de referência privada opaca exigida pela publicação pública também não teve compatibilidade comprovada com um adapter.

Evidência histórica, presença de artefato, reuso de previous-pass ou carregamento de saídas não provam execução atual, GUI/OAuth, disponibilidade de archives, proteção de branch ou consumidores. Papéis de manutenção são funcionais: não foram inventados aprovadores humanos ou permissões atuais. A coordenação principal fará sua própria verificação antes de integrar; esta fatia não recebe PASS global nem o estado amplo original S5 DELIVERY_COMPLETE.

## Proveniência, custódia e uso

Custódia privada confirmada da base de corpos e registros: `libfile_fde3_f-31e665d639ec8191a59492028fac26d2_3a07899f8a4481918837fffaac5a42fc`, versão 0, SHA-256 `11f9447ab1b2656f9aa5e459d45824ece75d1f2f158624167c6a1898fc79a96c`. As referências opacas resolvem para registros existentes no índice privado. Não tornam públicos oráculos, pareceres integrais, ledgers, capturas de sessão, segredos ou caminhos locais. Os registros posteriores de avaliação dos metadados e publicação são vinculados no handoff e na verificação posterior, sem alterar a identidade desta custódia.

Há limitações reais de preservação: os textos iniciais de criação/ativação dos juízes não estão salvos separadamente como transcrições originais do provedor. IDs reais, pacotes literais de avaliação, decisões visíveis, pedidos posteriores, correções e incidentes de transporte foram preservados. Também não estão preservados separadamente, nos registros atualmente disponíveis, o recibo original da API de criação da branch e os argumentos completos das primeiras 12 atualizações. Não se fabricou original ausente; representações normalizadas ou cópias visíveis conservam essa qualificação. Essas limitações ficam HOLD na matriz correspondente.

Tokens, custo e tentativas físicas internas do provedor permanecem UNKNOWN. Não foram zerados, estimados como recibos, nem transformados em prova de garantia econômica. A custódia é de registros visíveis, sem alegação de transcript integral assinado.

## Git e recuperação

A verificação remota preservada demonstra uma cadeia linear de 16 commits, cada um com um único parent, cujo primeiro parent é o baseline, e escritas restritas ao prefixo autorizado. Para os quatro checkpoints mais recentes, estão preservados os pedidos exatos de atualização condicional com `expected_sha` e `force: false`, além das releituras bem-sucedidas. A criação inicial da branch no baseline permanece registrada no relato contemporâneo de execução da orquestradora; o recibo original dessa chamada e os argumentos completos das primeiras 12 atualizações não estão preservados separadamente nos registros atualmente disponíveis. A ancestralidade atual não prova o valor histórico de `force` em todas as atualizações. Os checkpoints anteriores permanecem recuperáveis. O último checkpoint antes da selagem final registrado aqui é `1362b9383dbf9edff981bcf2812fcd3909d6ff3e`; ele não substitui a revisão de artefatos que ocorreram depois dele.

O commit de payload contém os bytes finais; o commit de selagem acrescenta `handoff.json`, cujo `artifact_revision` aponta ao payload já existente e não ao próprio hash. A atualização usa o HEAD observado como lease, com `force: false`. As releituras remotas conferem referências, parent, árvore e bytes. Os SHAs concretos da entrega ficam no handoff e na resposta de entrega; nenhum SHA futuro é inventado neste arquivo.
