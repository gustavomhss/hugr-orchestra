# Orchestra v3 — revisão extensa e adversarial

**VEREDITO: NÃO APROVADO para execução ampla sem corrigir o contrato.**

A identidade visual e o layout aprovados permanecem preservados. O objeto desta revisão é o plano de execução v3, seus axiomas, o grafo, a cobertura e as ferramentas de prova. Este arquivo não é uma v4 e não altera o produto.

## 1. Resumo do resultado

Confirmei os **83 testes originais passando**. Executei **27 sondas focalizadas** e **12 controles positivos**. As sondas foram agrupadas em **10 bloqueadores de execução/aceite** e **3 reforços de validação**. Várias sondas examinam a mesma causa; não são 27 bugs independentes.

O problema principal não é a falta de mais texto ou de mais IDs. Existem contradições entre os axiomas, as dependências e o que as ferramentas realmente verificam. Um Codex obediente pode ficar bloqueado; um Codex que preencha formulários pode produzir recibos estruturalmente aceitos sem cumprir a cobertura objetiva esperada.

| Achado | Classificação | Alvo |
|---|---|---|
| [R01 — O grafo é acíclico, mas os axiomas criam um ciclo de aceite](#r01) | Bloqueador | S25-W1-T1, #168, S23 |
| [R02 — O primeiro piloto funcional ficou depois de 44 tasks](#r02) | Bloqueador | S06, #149, S25-W1-T1 |
| [R03 — Censo e ownership não fecham o ciclo com o plano executável](#r03) | Bloqueador | S01, #144, S06 |
| [R04 — O codegen exigido não tem autorização de escrita compatível](#r04) | Bloqueador | S19-W2-T1, #162, S20-W2-T1 |
| [R05 — Recibos não vinculam o contrato efetivo completo](#r05) | Bloqueador | tools/validate_evidence.py, tools/select_work.py, todas as tasks que consomem SPEC/PERFORMANCE |
| [R06 — A integração normal invalida a raiz e contamina as 64 tasks](#r06) | Bloqueador | S01-W1-T1, #144, S25-W1-T1 |
| [R07 — Ownership é conferido contra o que o recibo declara, não o diff real](#r07) | Bloqueador | tools/validate_evidence.py, tools/select_work.py, todas as tasks de escrita |
| [R08 — O teto de paralelismo ignora tasks já em execução](#r08) | Bloqueador | tools/select_work.py, política de quatro frentes |
| [R09 — Pré-requisitos externos usam um protocolo de prova mais fraco](#r09) | Bloqueador | S19-W2-T1, #162, S20-W2-T1 |
| [R10 — O aceite visual não verifica a cobertura formal exigida](#r10) | Bloqueador | S24, #167, S25-W1-T2 |
| [H01 — O resultado numérico ainda depende de um avaliador futuro sem contrato fechado](#h01) | Reforço | S02, #145, S23 |
| [H02 — Os arrays de gates obrigatórios não são validados como contrato fechado](#h02) | Reforço | tools/validate_plan.py, PLAN.json: required_performance_gates/required_native_gates |
| [H03 — Cabeçalho PNG não garante um arquivo de captura utilizável](#h03) | Reforço | tools/validate_evidence.py |

## 2. O que foi realmente examinado

O pacote v3 foi extraído em uma cópia separada; o manifesto original continua com **76 entradas verificadas e zero divergências**. Foram lidos os documentos normativos, a estrutura de todos os 140 nós, suas dependências e axiomas, as projeções e os scripts Python. O master foi aberto e sua decodificação/hash conferidos.

Consultei o GitHub por leitura para confrontar a branch `dev`, as regras de geração do cliente e os componentes reais da sidebar com o mapa. A branch consultada permaneceu em `30d951fcc4a09e708768551c7c6fd38a0efe3da8`. Confirmar arquivos/imports é evidência de integração em código, não de comportamento em execução.

As sondas de Git usam repositórios temporários isolados. Os recibos, métricas e screenshots minúsculos usados para provocar falhas são **fixtures sintéticas explícitas**, nunca prova de que o Orchestra funcionou ou falhou. Nenhum token pessoal, chamada de modelo paga, banco do usuário ou API de escrita foi usado.

Não houve clone completo no container: a tentativa de rede não resolveu o host. Isso não impediu as leituras pelo conector. Não houve build/render/benchmark/Electron do Orchestra. Consequentemente, esta revisão não atribui regressão de performance, bug de produção ou fidelidade alcançada ao aplicativo.

## 3. Achados e contratos de correção

<a id="r01"></a>
### R01 — O grafo é acíclico, mas os axiomas criam um ciclo de aceite

**Estado:** aberto. **Classificação:** bloqueador de aprovação do plano. **Afeta:** S25-W1-T1, #168, S23, #166, S24, #167.

**Observação reproduzida ou demonstrada no contrato.** O critério S25-W1-T1-COMPLETENESS_CRITERIA-05 exige concluir e provar o passo “Passe builds/testes por package, cold-review, performance S23 e visual S24 no SHA integrado”. Entretanto, S23 e S24 dependem de S25-W1-T1. O validador estrutural retorna PASS porque só percorre depends_on/children: a dependência invertida está escrita dentro do critério.

**Consequência.** Um executor que respeite literalmente todos os axiomas não consegue concluir T1. Um executor que marque T1 como PASS para destravar os gates precisa ignorar o critério. A mesma task contém também o invariante correto, de produzir o build antes dos gates; portanto, há duas instruções contraditórias, não apenas uma frase pouco elegante.

**Correção delimitada:**
1. Separar “build candidato utilizável” de “release aprovado” nos critérios, não só nas arestas.
2. Remover de T1 a obrigação de aprovação por S23/S24. Manter builds, smoke e provas locais do candidato. A aprovação dos gates pertence a T2.
3. Revisar todas as frases geradas de passos do pai para filhos: uma obrigação do programa não deve aparecer antecipada em um produtor.
4. Registrar pré-condições/artefatos verificáveis por etapa. Não tentar resolver o conflito mandando o Codex interpretar a intenção contra o texto.

**Axiomas para aceitar a correção:**

| Grupo | Critério verificável |
|---|---|
| Definition of Done | T1 é concluível com um candidato e provas locais, sem resultados ainda inexistentes de S23/S24. |
| Invariants | T2 continua impossível sem os gates finais do mesmo candidato. |
| Quality standards | Cada critério tem uma etapa de avaliação e uma fonte produzida antes ou durante essa etapa. |
| Completeness criteria | Simular produtor → gates → encerramento, incluindo um gate falho e correção posterior. |
| Success criteria | Nenhuma task precisa declarar como concluído um consumidor que depende dela. |

**Limite / contra-argumento considerado.** PC07 e PC11 confirmam que não existe um ciclo no grafo declarado. O defeito é semântico, nos critérios; seria incorreto anunciar que o algoritmo topológico está quebrado.

**Prova:** `AP01` em `evidence/adversarial-probes.json`. **Âncoras:** `PLAN.json: S25-W1-T1-COMPLETENESS_CRITERIA-05`; `PLAN.json: S23.depends_on e S24.depends_on`.

<a id="r02"></a>
### R02 — O primeiro piloto funcional ficou depois de 44 tasks

**Estado:** aberto. **Classificação:** bloqueador de aprovação do plano. **Afeta:** S06, #149, S25-W1-T1, #168.

**Observação reproduzida ou demonstrada no contrato.** S25 é o único owner de app.tsx, session.tsx e session-side-panel.tsx. Sua primeira task de integração depende de 44 tasks: inclusive settings, providers, diálogos, contexto e Janitor. Essas frentes são exigidas antes de ligar a composição ao aplicativo real.

**Consequência.** O plano promete validar cedo a reprodução aprovada, mas o DAG adia a primeira integração funcional para depois de quase toda a construção das frentes. O Codex pode produzir vários componentes isolados antes de descobrir que a disposição, o lifecycle nativo ou a densidade não funcionam juntos. Isso cria precisamente o retrabalho que o usuário quis evitar.

**Correção delimitada:**
1. Criar uma etapa de integração antecipada no mesmo owner S25, sem adicionar outro épico ou um segundo writer.
2. Essa etapa deve depender apenas da fundação e da fatia mínima de shell, conversa, composer, evidência e rail necessária ao piloto; dividir entregas desses owners em contratos mínimos quando necessário.
3. Conectar o piloto aos controllers reais e comparar seu render ao master antes da propagação ampla. Storybook pode auxiliar, mas não satisfaz esse gate.
4. Manter integração incremental e o gate final posterior. “Não parar no piloto” não significa “não ter um piloto cedo”.

**Axiomas para aceitar a correção:**

| Grupo | Critério verificável |
|---|---|
| Definition of Done | Há uma task de piloto funcional desbloqueável antes de settings/providers/Janitor completos. |
| Invariants | Um único owner continua controlando os hotspots; nenhum cenário separado finge ser o aplicativo. |
| Quality standards | A fatia é pequena, reversível e permite validar geometria, foco, rolagem e custo inicial. |
| Completeness criteria | DAG, tarefas, critérios, slots e ordem de leitura descrevem a mesma sequência. |
| Success criteria | Um erro de disposição é detectado antes de contaminar a migração das demais telas. |

**Limite / contra-argumento considerado.** O número 44 é a contagem exata dos pré-requisitos executáveis na v3, não uma estimativa de duração ou esforço.

**Prova:** `AP20` em `evidence/adversarial-probes.json`. **Âncoras:** `PLAN.json: dependências transitivas de S25-W1-T1`; `OWNERSHIP.md: writer único dos hotspots`; `EXECUTE.md: piloto como primeira fatia vertical`.

<a id="r03"></a>
### R03 — Censo e ownership não fecham o ciclo com o plano executável

**Estado:** aberto. **Classificação:** bloqueador de aprovação do plano. **Afeta:** S01, #144, S06, #149, tools/validate_plan.py, tools/select_work.py.

**Observação reproduzida ou demonstrada no contrato.** Confirmei seis caminhos reais em pages/layout/ sem owner de escrita na v3, incluindo sidebar-shell.tsx, sidebar-items.tsx, sidebar-project.tsx e sidebar-workspace.tsx. layout.tsx importa componentes dessa pasta. Em um repositório temporário com esses nomes, validate_plan --repo retorna PASS. A inclusão de uma surface UI999 com owner S06 que não pode escrever no arquivo também permanece PASS, apenas como aviso. Além disso, S01 produz source-map.json, surface-map.json, capabilities.json e ownership.json; os seletores/validadores continuam lendo PLAN.json e SURFACES.json, sem consumir esses quatro outputs. Nenhum owner do plano autoriza atualizar os canônicos PLAN.json/SURFACES.json.

**Consequência.** O executor encontra arquivos alcançáveis e descobre que não pode modificá-los; mesmo que atualize os quatro mapas previstos em S01, o scheduler não aprende a nova atribuição. O censo pode parecer encerrado e o problema continuar intacto. Recriar a sidebar em arquivos permitidos seria um atalho especialmente ruim: duplicaria o trabalho existente para contornar uma falha do planejamento.

**Correção delimitada:**
1. Escolher uma única representação canônica para superfície, reachability, ação, estados e owner. Os demais mapas devem ser projeções verificadas dessa fonte.
2. Autorizar uma atualização delimitada de PLAN/SURFACES em S01 ou em uma task explícita de manutenção do contrato; regenerar projeções e recalcular apenas os consumidores afetados.
3. Classificar cada superfície alcançável como migrar, herdar tema sem alteração local, ou fora de escopo com razão verificável. Não exigir edição de todo arquivo.
4. Fazer o gate falhar para UI alcançável não classificada e para atribuição de escrita incompatível. Separar formalmente read-anchor de UI a migrar.

**Axiomas para aceitar a correção:**

| Grupo | Critério verificável |
|---|---|
| Definition of Done | Censo atualizado é efetivamente lido pelo seletor e pelo validador; arquivos de sidebar têm disposition explícita. |
| Invariants | Não há segundo mapa de ownership com autoridade divergente nem duplicação de UI como workaround. |
| Quality standards | Cada UI a migrar possui writer único; no-change/inherited e read-anchor são classificações explícitas. |
| Completeness criteria | Adicionar uma UI órfã, um owner incorreto e um arquivo novo alcançável deve reprovar o gate; os controles classificados corretamente passam. |
| Success criteria | Codex consegue passar do censo à implementação sem violar write_paths nem ignorar arquivos reais. |

**Limite / contra-argumento considerado.** Os seis arquivos não provam que todos precisem de edição; podem herdar parte do tema. A falha é a ausência de classificação/owner e de feedback executável. A prova --repo usa um índice Git sintético com caminhos confirmados no GitHub, não um clone completo do produto.

**Prova:** `AP02`, `AP03`, `AP04`, `AP05` em `evidence/adversarial-probes.json`. **Âncoras:** `PLAN.json: write_paths de S01/S06`; `tools/validate_plan.py: owners_for e inspect`; `tools/select_work.py: leitura de PLAN.json`; `MAP.md e SURFACES.json`; `Código remoto: pages/layout.tsx e pages/layout/sidebar-shell.tsx`.

<a id="r04"></a>
### R04 — O codegen exigido não tem autorização de escrita compatível

**Estado:** aberto. **Classificação:** bloqueador de aprovação do plano. **Afeta:** S19-W2-T1, #162, S20-W2-T1, #163, S25, #168.

**Observação reproduzida ou demonstrada no contrato.** O repositório determina regenerar o Client após mudanças na API pública e proíbe editar src/generated e src/generated-effect manualmente. S19/S20 mandam executar essa geração e registrar todos os outputs. Porém, nenhum owner cobre os diretórios gerados. O lease public-api-registration-and-client-codegen serializa as tasks, mas não lhes concede esses write_paths. Vários registradores/manifests compartilhados também precisam ser mapeados antes de permitir a alteração pública.

**Consequência.** Uma implementação correta da API pode ser rejeitada pelo recibo por ter gerado os arquivos necessários. O executor fica pressionado a omitir outputs de paths_changed, não gerar o cliente ou expandir o escopo informalmente. Isso contradiz tanto a disciplina do host quanto a rastreabilidade prometida.

**Correção delimitada:**
1. Mapear o comando real e seu footprint de saída antes de concluir a fase de contrato.
2. Dar ao único integrador uma task aditiva de registro/codegen, ou autorizar explicitamente o footprint gerado na task sob lease. A exclusividade deve ser por etapa, sem dois writers simultâneos.
3. Distinguir modificação gerada por comando autorizado de edição manual; registrar comando, versão, inputs e diff real.
4. A API live só fecha depois de geração, consumidor efetivo e regressões correspondentes.

**Axiomas para aceitar a correção:**

| Grupo | Critério verificável |
|---|---|
| Definition of Done | O comando oficial roda e todos os outputs necessários têm owner/autorização declarados. |
| Invariants | Nada em generated é editado manualmente; nenhuma geração paralela disputa o mesmo diretório. |
| Quality standards | Footprint concreto, regeneração reproduzível e diff mínimo; nenhum silêncio em paths_changed. |
| Completeness criteria | Testar geração legítima, output inesperado, execução concorrente e client desatualizado. |
| Success criteria | Adicionar a projeção pública pode ser feito corretamente sem contornar o próprio plano. |

**Limite / contra-argumento considerado.** As sondas usam nomes exemplificativos dentro dos prefixos generated documentados; não alegam que client.ts seja um arquivo real específico do checkout. O problema comprovado é que nenhum caminho nesses prefixos recebe owner.

**Prova:** `AP19` em `evidence/adversarial-probes.json`. **Âncoras:** `PLAN.json: write_paths de S19-W2-T1/S20-W2-T1/S25`; `CONTRACTS.md C-07`; `OWNERSHIP.md: lease de APIs tardias`; `AGENTS.md do repositório: geração oficial do Client`.

<a id="r05"></a>
### R05 — Recibos não vinculam o contrato efetivo completo

**Estado:** aberto. **Classificação:** bloqueador de aprovação do plano. **Afeta:** tools/validate_evidence.py, tools/select_work.py, todas as tasks que consomem SPEC/PERFORMANCE.

**Observação reproduzida ou demonstrada no contrato.** O digest considera os campos do nó local, mas não os axiomas aplicáveis dos ancestrais nem o conteúdo dos documentos normativos. Alterei o invariante de S17: o digest de S17-W1-T2 permaneceu idêntico. Alterações em PERFORMANCE.md, SPEC.md, CONTRACTS.md, SURFACES.json e fixture.json também não tornam o recibo final stale no teste de source_errors.

**Consequência.** Um resultado obtido contra uma especificação anterior pode permanecer estruturalmente aceito depois de mudar o orçamento, a cobertura ou a regra visual. Isso não é a impossibilidade de automatizar beleza: são dependências normativas conhecidas que não entram na identidade da prova.

**Correção delimitada:**
1. Vincular o recibo a um manifesto pequeno do contrato efetivo: task, axiomas herdados aplicáveis, versão/hash dos contratos P/Q, fixture, cobertura e referência.
2. Definir quais mudanças invalidam quais provas. Não usar indiscriminadamente o hash de todo PLAN para derrubar tudo.
3. Verificar esses vínculos antes de liberar o consumidor ou aceitar o gate final, inclusive em --repo.
4. Quando mudar uma regra, exigir nova avaliação; recalcular um hash sem repetir a prova não é revalidação.

**Axiomas para aceitar a correção:**

| Grupo | Critério verificável |
|---|---|
| Definition of Done | Mudança em um invariante herdado ou budget efetivo invalida as provas afetadas. |
| Invariants | Mudança de documentação sem efeito normativo não invalida automaticamente o produto inteiro. |
| Quality standards | Identidades derivadas deterministicamente de fontes canônicas, sem digest fornecido só pela narrativa do executor. |
| Completeness criteria | Cobrir alteração de task, ancestral, P/Q, fixture e cobertura; incluir controle de mudança realmente irrelevante. |
| Success criteria | PASS significa que a prova corresponde às regras que estão sendo usadas agora. |

**Limite / contra-argumento considerado.** PC02 confirma que a inspeção completa do pacote rejeita um master corrompido. AP08 da imagem mostra uma lacuna no frescor do recibo, não um bypass de todos os comandos do pacote. PC04 confirma que alterações diretas no nó da task já são recusadas.

**Prova:** `AP07`, `AP08-PERFORMANCE.md`, `AP08-SPEC.md`, `AP08-CONTRACTS.md`, `AP08-SURFACES.json`, `AP08-fixture.json`, `AP08-reference_approved.png` em `evidence/adversarial-probes.json`. **Âncoras:** `tools/validate_evidence.py: contract_digest`; `tools/select_work.py: source_errors`; `RECEIPTS-v3.md`; `PLAN.json: critérios e ancestors`.

<a id="r06"></a>
### R06 — A integração normal invalida a raiz e contamina as 64 tasks

**Estado:** aberto. **Classificação:** bloqueador de aprovação do plano. **Afeta:** S01-W1-T1, #144, S25-W1-T1, #168, tools/select_work.py.

**Observação reproduzida ou demonstrada no contrato.** S01-W1-T1 observa app.tsx, session.tsx e outros arquivos que a integração final deve modificar. Quando S25 faz uma alteração prevista em app.tsx, o recibo do censo se torna STALE. Aplicar a regra documentada de invalidação transitiva a S01-W1-T1 alcança os 140 nós e todas as 64 tasks. A presença de um recibo stale também faz select retornar FAIL sem selecionar nem a tarefa de reparo.

**Consequência.** O plano não separa “observação histórica usada para mapear a base” de “invariante atual do produto”. Se seguido mecanicamente, o avanço normal da implementação obriga invalidar todo o trabalho e percorrer novamente a cadeia. Um censo pode e deve ser reavaliado quando o código muda, mas essa reavaliação não deveria destruir provas que continuam válidas contra interfaces inalteradas.

**Correção delimitada:**
1. Distinguir milestone de descoberta, contrato estável produzido e prova do estado atual. Consumidores devem depender do contrato pertinente, não de que a fotografia antiga dos arquivos nunca mude.
2. Classificar a mudança contra o mapa: alteração planejada que preserva a interface versus nova superfície ou alteração de contrato que exige revalidação.
3. Propagar STALE apenas pelas dependências semanticamente afetadas e oferecer uma task de remapeamento/reparo sem reiniciar todo o programa.
4. Preservar a reprovação forte para alterações relevantes não verificadas. O objetivo não é aceitar recibo stale, mas tornar a recuperação executável.

**Axiomas para aceitar a correção:**

| Grupo | Critério verificável |
|---|---|
| Definition of Done | Modificar app.tsx pela task autorizada não exige refazer indiscriminadamente as 64 tasks. |
| Invariants | Mudanças que de fato quebram um contrato ainda invalidam os consumidores e o aceite final. |
| Quality standards | Histórico e prova atual têm papéis distintos; recomputação limitada e rastreável. |
| Completeness criteria | Simular censo → algumas frentes → integração → reparo → gates, incluindo alteração fora do contrato. |
| Success criteria | A execução converge para um candidato verificado em vez de recomeçar por efeito do próprio trabalho. |

**Limite / contra-argumento considerado.** A v3 já documenta editar progress.json manualmente para marcar STALE. Por isso, AP11 não é apresentado como um deadlock algorítmico inevitável: é um agravante operacional. O bloqueador é o cone de invalidação global aplicado ao progresso normal.

**Prova:** `AP10`, `AP11` em `evidence/adversarial-probes.json`. **Âncoras:** `PLAN.json: read_paths de S01-W1-T1`; `tools/select_work.py: source_errors, invalidated_closure e select`; `OWNERSHIP.md: invalidação por rework`.

<a id="r07"></a>
### R07 — Ownership é conferido contra o que o recibo declara, não o diff real

**Estado:** aberto. **Classificação:** bloqueador de aprovação do plano. **Afeta:** tools/validate_evidence.py, tools/select_work.py, todas as tasks de escrita.

**Observação reproduzida ou demonstrada no contrato.** Criei um repositório Git temporário, fiz um commit contendo uma alteração fora do escopo da task, e gerei um recibo no HEAD desse commit com paths_changed vazio. validate_receipt e source_errors não apontaram erro. O primeiro percorre somente a lista declarada; o segundo compara mudanças posteriores ao HEAD alegado, sem recompor o footprint da task.

**Consequência.** Um arquivo esquecido no recibo — não necessariamente uma falsificação intencional — escapa do controle de ownership. A exclusividade de escrita parece mecanicamente garantida, mas depende de o executor descrever corretamente tudo o que fez.

**Correção delimitada:**
1. Registrar baseline da unidade e commits/patch efetivamente produzidos, incluindo o estado dirty anterior sem sobrescrevê-lo.
2. Derivar o footprint pelo Git e comparar com paths_changed e write/exclude_paths.
3. Separar alterações preexistentes do usuário de alterações da task; não exigir limpar o worktree para facilitar a auditoria.
4. Recusar omissão, path extra e alteração não atribuída; autorizar exceção somente por procedimento explícito de ownership.

**Axiomas para aceitar a correção:**

| Grupo | Critério verificável |
|---|---|
| Definition of Done | Alterações efetivas fora do owner são detectadas mesmo com paths_changed vazio ou incompleto. |
| Invariants | O trabalho preexistente do usuário não é atribuído falsamente à task nem removido. |
| Quality standards | Footprint derivado do candidato/patch verificável, não apenas de um array autodeclarado. |
| Completeness criteria | Testar omissão de arquivo, arquivo extra, rename, mudança legítima, worktree inicialmente dirty e commits de outros owners. |
| Success criteria | “Escopo exclusivo” é verificável no código alterado, não apenas no formulário. |

**Limite / contra-argumento considerado.** Isso não demonstra que o produto sofreu uma alteração indevida; o contraexemplo ocorreu somente no repositório sintético da auditoria.

**Prova:** `AP09` em `evidence/adversarial-probes.json`. **Âncoras:** `tools/validate_evidence.py: validação de paths_changed`; `tools/select_work.py: git_snapshot e source_errors`.

<a id="r08"></a>
### R08 — O teto de paralelismo ignora tasks já em execução

**Estado:** aberto. **Classificação:** bloqueador de aprovação do plano. **Afeta:** tools/select_work.py, política de quatro frentes.

**Observação reproduzida ou demonstrada no contrato.** Com jobs=4 e três T1 disjuntas já RUNNING, o seletor devolveu mais quatro tasks. O total potencial foi sete, não quatro. O algoritmo limita len(chosen), sem descontar len(running).

**Consequência.** A configuração anunciada como teto operacional deixa de limitar a concorrência real. Em uma máquina compartilhada com builds, testes e browser nativo, isso pode agravar contenção, uso de memória e instabilidade das medições. Não medi o custo no Mac; demonstrei a falha determinística do escalonamento.

**Correção delimitada:**
1. Calcular vagas como max(0, jobs - running_count), além das verificações de arquivos e leases.
2. Se a intenção for limitar somente novas alocações, renomear a opção e introduzir separadamente o limite total; a documentação e o executor não podem confundir os dois.
3. Preservar a reserva exclusiva de hardware para benchmarks e a regra de coordenador único.

**Axiomas para aceitar a correção:**

| Grupo | Critério verificável |
|---|---|
| Definition of Done | running + selected nunca ultrapassa o limite total solicitado. |
| Invariants | Nenhuma task já em execução é cancelada automaticamente para satisfazer o limite. |
| Quality standards | Contagem determinística, conflitos/leases preservados e diagnóstico claro de falta de vagas. |
| Completeness criteria | Cobrir 0, 1, jobs-1, jobs e mais de jobs tarefas RUNNING; incluir benchmark e conflitos de arquivo. |
| Success criteria | O Codex respeita o grau de paralelismo que o plano promete. |

**Prova:** `AP06` em `evidence/adversarial-probes.json`. **Âncoras:** `tools/select_work.py: construção de running e laço chosen/deferred`; `OWNERSHIP.md: waves e limite operacional`.

<a id="r09"></a>
### R09 — Pré-requisitos externos usam um protocolo de prova mais fraco

**Estado:** aberto. **Classificação:** bloqueador de aprovação do plano. **Afeta:** S19-W2-T1, #162, S20-W2-T1, #163, tools/select_work.py.

**Observação reproduzida ou demonstrada no contrato.** Os pré-requisitos de Own/governança foram aceitos com JSON contendo somente ref, head e status PASS, além de verified_public_path como string não vazia no progresso. Não há exigência equivalente de hashes, logs de execução ou recibo de caminho público. O teste aceitou um head externo fora da ancestralidade fornecida para o checkout, enquanto source_revision_verified era true. Alterar conteúdo adicional do arquivo de prova externo também não foi detectado por hash.

**Consequência.** A fronteira mais sensível do plano — liberar integração live a partir de autoridade existente — tem menos proteção que uma task de apresentação. O scheduler pode considerar disponível uma implementação não presente no candidato ou uma alegação sem teste do caminho público. Isso não contorna a segurança do backend real; pode liberar a fase errada e sustentar uma declaração falsa de prontidão.

**Correção delimitada:**
1. Definir recibo externo verificável com repositório/artefato, revisão, relação com o candidato, caminho público exercitado, comandos, hashes e resultado.
2. Verificar presença no checkout ou vínculo explícito a uma dependência instalada e identificada; não usar somente issue fechada ou string de caminho.
3. Invalidar a prova quando fonte, candidato ou artefato externo mudar. Estados unavailable/HOLD continuam independentes.
4. Garantir que source_revision_verified descreva exatamente o conjunto de provas realmente verificado.

**Axiomas para aceitar a correção:**

| Grupo | Critério verificável |
|---|---|
| Definition of Done | Uma implementação externa ausente do candidato não libera W2 live. |
| Invariants | A UI segura unavailable/HOLD não fica bloqueada pela ausência dessa autoridade. |
| Quality standards | Protocolo de integridade e proveniência no mínimo tão rigoroso quanto o das tasks locais. |
| Completeness criteria | Testar fonte divergente, artefato removido/alterado, caminho não executado, prova válida e dependência instalada legítima. |
| Success criteria | W2 só avança quando a capacidade autoritativa realmente consumida está demonstrada. |

**Limite / contra-argumento considerado.** Ancestralidade não é universalmente suficiente nem necessária para uma biblioteca instalada: nesse caso o vínculo deve ser pela identidade do artefato. O problema é não verificar nenhum desses vínculos.

**Prova:** `AP12`, `AP13` em `evidence/adversarial-probes.json`. **Âncoras:** `tools/select_work.py: bloco ext_ok e git_snapshot`; `PLAN.json: external_requires`; `CONTRACTS.md C-07`.

<a id="r10"></a>
### R10 — O aceite visual não verifica a cobertura formal exigida

**Estado:** aberto. **Classificação:** bloqueador de aprovação do plano. **Afeta:** S24, #167, S25-W1-T2, #168, tools/validate_evidence.py.

**Observação reproduzida ou demonstrada no contrato.** O validador estrutural de S25-W1-T2 aceitou uma única imagem PNG válida de 1×1 pixel como screenshots do gate visual. Não existe no recibo uma matriz obrigatória de surface/state/viewport, vínculo ao master ou verificação de dimensões esperadas. O restante da prova foi preenchido de forma explicitamente sintética para testar a estrutura.

**Consequência.** A ferramenta não precisa decidir se a interface é bonita. Mas pode e deve distinguir “uma imagem qualquer existe” de “as telas, estados e tamanhos obrigatórios foram capturados”. Hoje a completude visual pedida pelo usuário depende inteiramente da narrativa de revisão.

**Correção delimitada:**
1. Adicionar manifesto de capturas com surface_id, state_id, viewport, DPR, plataforma, tema/flags, fixture/master e identidade de build.
2. Derivar a cobertura obrigatória dos registros reais de UI, não de todos os 68 registros mistos de fonte/medida/lacuna.
3. Verificar campos, dimensões e pares obrigatórios; manter julgamento visual e desvios semânticos explicitamente revisados.
4. Separar captura do host web de prova nativa do Dock. Não mascarar colunas inteiras nem aceitar imagem gerada como captura do aplicativo.

**Axiomas para aceitar a correção:**

| Grupo | Critério verificável |
|---|---|
| Definition of Done | O gate final recusa imagem 1×1 e cobertura incompleta, mesmo com hashes e PASS declarados. |
| Invariants | O validador não se apresenta como juiz automático de beleza, autenticidade ou equivalência perceptiva. |
| Quality standards | Cobertura canônica, imagens decodificáveis, identidade de build e revisão por estado. |
| Completeness criteria | Omitir settings, um estado de erro, um viewport e a prova nativa necessária deve reprovar; a matriz completa passa. |
| Success criteria | Não é possível chamar de migração integral apenas a fotografia de um cockpit. |

**Limite / contra-argumento considerado.** A v3 já avisa que hashes não provam qualidade e que a revisão humana/agêntica é indispensável. O achado não repete essa limitação: cobra a cobertura objetiva que os próprios requisitos enumeram.

**Prova:** `AP14` em `evidence/adversarial-probes.json`. **Âncoras:** `tools/validate_evidence.py: ramo visual`; `SPEC.md: Q01–Q16 e viewports`; `SURFACES.json`; `PLAN.json: recibo final`.

<a id="h01"></a>
### H01 — O resultado numérico ainda depende de um avaliador futuro sem contrato fechado

**Estado:** aberto. **Classificação:** reforço de validação / esclarecimento de contrato. **Afeta:** S02, #145, S23, #166, tools/validate_evidence.py.

**Observação reproduzida ou demonstrada no contrato.** Uma observação sintética com p95=9999 ms, limite=50 ms e somente uma amostra coexistiu com um relatório manual de gates PASS aceito pelo validador de recibos. A checagem confere IDs/status/arquivos, não calcula os percentis. O pacote reconhece essa limitação e delega o produtor/avaliador a S02, ainda não implementado.

**Consequência.** Não é prova de que um benchmark real incorreto passaria por um avaliador S02 já pronto: esse avaliador ainda não existe. É um ponto de contrato que deve ficar fechado para que a futura execução quantitativa não termine em preenchimento manual de PASS. Também não considerei a possibilidade de NOT_APPLICABLE em S02, isoladamente, uma falha: testar a instrumentação não é medir o desempenho final do produto.

**Correção delimitada:**
1. Definir o formato mínimo de amostras, unidade, relógio, janela, perfil, candidato/base, amostragem e configuração imutável dos budgets.
2. Definir produtor → avaliador determinístico → recibo, incluindo versão/identidade do avaliador e comando de avaliação.
3. Em S02-T2, exigir demonstração positiva e negativa do avaliador. A categoria “performance do produto” pode ser não aplicável nessa etapa, mas a prova de funcionamento do avaliador não pode ser omitida.
4. Em S23, exigir recálculo a partir das amostras e rejeição de inconclusivo, não confiar exclusivamente em rótulos fornecidos.

**Axiomas para aceitar a correção:**

| Grupo | Critério verificável |
|---|---|
| Definition of Done | S02 entrega um avaliador que reprova automaticamente o registro contraditório utilizado na sonda. |
| Invariants | Nenhum ajuste automático de workload/threshold para obter PASS; a mesma build é medida e renderizada. |
| Quality standards | Unidades, denominadores, versões e incerteza explícitos; P1/soak/idle independentes de rede/modelo remoto. |
| Completeness criteria | Abaixo/acima do limite, insuficiência de amostra, ambiente diferente, base ausente, NaN e resultado inconclusivo. |
| Success criteria | Performance é uma conclusão recalculável, não um adjetivo nem um campo preenchido. |

**Limite / contra-argumento considerado.** Classificado como reforço de contrato e condição de S02, não como descoberta de uma regressão do Orchestra. Não houve benchmark do aplicativo nesta auditoria.

**Prova:** `AP16`, `AP17` em `evidence/adversarial-probes.json`. **Âncoras:** `PERFORMANCE.md: formato de prova v3`; `tools/validate_evidence.py: relatório performance-evaluation`; `PLAN.json: S02-W1-T2`.

<a id="h02"></a>
### H02 — Os arrays de gates obrigatórios não são validados como contrato fechado

**Estado:** aberto. **Classificação:** reforço de validação / esclarecimento de contrato. **Afeta:** tools/validate_plan.py, PLAN.json: required_performance_gates/required_native_gates.

**Observação reproduzida ou demonstrada no contrato.** O validador do plano aceitou required_performance_gates de S25-W1-T2 como null, array vazio ou [UNKNOWN_GATE]. O resultado pode ser uma falha tardia de tipo ou uma exigência de gates diferente da especificação. O teste não removeu axiomas nem deformou as demais estruturas.

**Consequência.** Uma edição acidental do contrato pode atravessar a verificação inicial e aparecer apenas na etapa de recibos, ou reduzir silenciosamente a cobertura esperada. Não é possível tornar um plano arbitrariamente editável imune a fraude do seu próprio autor; a proteção relevante aqui é consistência e tipagem.

**Correção delimitada:**
1. Exigir arrays de strings únicas reconhecidas; validar a relação entre evidence_requirements e seus gates.
2. Expressar a cobertura final de P/Q/nativo em um registro canônico e verificar que a task de release a consome.
3. Recusar null, tipos incorretos, IDs desconhecidos e remoções incompatíveis com a política final.

**Axiomas para aceitar a correção:**

| Grupo | Critério verificável |
|---|---|
| Definition of Done | As três mutações testadas são rejeitadas na validação inicial do plano. |
| Invariants | Gates não podem desaparecer por omissão de campo ou conversão implícita de tipo. |
| Quality standards | Diagnósticos com nó/campo/ID e sem traceback como interface normal de erro. |
| Completeness criteria | Null, número, string, duplicatas, desconhecidos, vazio indevido e configuração válida. |
| Success criteria | Uma v4 mal editada não parece validada para só falhar no final. |

**Prova:** `AP18-None`, `AP18-[]`, `AP18-['UNKNOWN_GATE']` em `evidence/adversarial-probes.json`. **Âncoras:** `tools/validate_plan.py: validação de tasks`; `tools/validate_evidence.py: required_ids`.

<a id="h03"></a>
### H03 — Cabeçalho PNG não garante um arquivo de captura utilizável

**Estado:** aberto. **Classificação:** reforço de validação / esclarecimento de contrato. **Afeta:** tools/validate_evidence.py.

**Observação reproduzida ou demonstrada no contrato.** Truncar uma captura sintética aos primeiros 24 bytes, preservando assinatura, IHDR e dimensões positivas, continua aceito. O arquivo não contém dados de imagem suficientes para abrir uma captura.

**Consequência.** A limitação de verificar apenas o cabeçalho já estava explicitada na v3. Ainda assim, um arquivo corrompido deveria ser recusado antes de ser encaminhado para uma revisão visual. Esse reforço não substitui o manifesto de cobertura de R10.

**Correção delimitada:**
1. Validar a decodificação/integridade do arquivo de imagem no tooling de auditoria ou captura.
2. Rejeitar truncamento, dimensão incoerente, payload ausente ou checksum inválido; impor limites razoáveis para evitar arquivos absurdos.
3. Não adicionar dependência ao runtime do aplicativo para resolver uma checagem de arquivos de prova.

**Axiomas para aceitar a correção:**

| Grupo | Critério verificável |
|---|---|
| Definition of Done | A captura truncada de 24 bytes é rejeitada, enquanto o PNG completo é aceito. |
| Invariants | Decodificar não significa autenticar a origem nem aprovar a aparência. |
| Quality standards | Validação limitada e segura, restrita ao tooling. |
| Completeness criteria | PNG válido, truncado, payload ausente, CRC inválido e tamanho fora dos limites. |
| Success criteria | O revisor recebe imagens que de fato podem ser inspecionadas. |

**Prova:** `AP15` em `evidence/adversarial-probes.json`. **Âncoras:** `tools/validate_evidence.py: leitura de 24 bytes`; `QA_REPORT.md v3: limite declarado da checagem PNG`.

## 4. Ordem de reparo recomendada — sem inflar a hierarquia

Não recomendo criar mais épicos, substituir o design ou gerar milhares de critérios adicionais. Repare os contratos existentes nesta sequência:

| Etapa | Correções | Saída necessária |
|---|---|---|
| A — Convergência | R01, R02 e R06 | Etapas de produtor/gates/encerramento coerentes; piloto cedo; atualização de censo que não reinicia o programa. |
| B — Fonte e footprint | R03, R04 e R07 | Censo canônico consumido, owner para cada superfície pertinente e diff real compatível com a escrita autorizada. |
| C — Provas e recursos | R05, R08 e R09 | Contrato efetivo vinculado, limite total de concorrência correto e prova externa ligada à capacidade consumida. |
| D — Aceite objetivo | R10, H01, H02 e H03 | Cobertura de capturas, avaliador quantitativo definido, schema fechado e arquivos de prova utilizáveis. |
| E — Reauditoria | Todos | Testes corrigidos, simulação completa de execução/retrabalho e revisão semântica dos axiomas antes de aprovar a versão reparada. |

Uma task de manutenção do contrato deve poder atualizar os artefatos canônicos. Não espalhar alterações manuais em 39 Markdown: regenerar as projeções a partir da fonte revisada e conferir consistência. A publicação em GitHub e a vinculação nativa devem ser reconciliadas depois do contrato corrigido, sem duplicar tickets.

## 5. Critérios para uma versão seguinte ser aprovada

A versão reparada deve demonstrar uma caminhada executável **censo → fundação → piloto real → frentes disjuntas → integração → gates → encerramento**. A caminhada precisa incluir rework legítimo, mudança de contrato, fonte externa ausente, prova adulterada, interface nova sem owner e esgotamento de vagas.

Não basta o grafo ser acíclico: nenhum axioma de um produtor pode exigir antecipadamente um consumidor. Não basta contar cinco grupos em cada nó: uma obrigação do pai precisa ser alocada à etapa certa e seu vínculo com os critérios filhos precisa ser claro.

O aceite da correção exige que os contraexemplos bloqueadores deixem de passar, que os 83 testes originais continuem válidos quando pertinentes e que os 12 controles positivos não sofram regressão. Não alterar a expectativa do teste apenas para acomodar a implementação. Para comportamentos intencionalmente revistos, registrar a decisão e a prova substituta.

Aprovar o **plano corrigido** ainda não significa aprovar o **produto**. A segunda aprovação dependerá de código executado, comparação ao master, métricas no hardware/perfil definido e testes nativos quando requeridos. O ponto desta revisão é tornar essa futura aprovação possível e honesta.

## 6. O que continua bom — e não deve ser descartado

O master correto, a separação entre aparência e autoridade, a distinção entre unavailable e live, o uso das capacidades existentes e a orientação para preservar dados do usuário são decisões úteis. A v3 também já recusa prova com bytes alterados, alteração direta do contrato da task, ciclos explícitos e dispensa indevida das categorias finais obrigatórias.

A revisão não propõe um framework de UI novo, um motor de workflows novo ou outro sistema de evidência em produção. As correções são de contrato, fronteiras e tooling; o runtime do Orchestra permanece o existente.

## 7. Hipóteses que não contei como falhas novas

1. **“A API 2026-03-10 foi inventada.”** Descartado: a versão existe na documentação oficial do GitHub. Não há motivo para apontar o cabeçalho do sincronizador como bug por esse nome.
2. **“O grafo contém um ciclo explícito.”** Descartado: o grafo puro percorre todas as 64 tasks com pré-requisitos sintéticos satisfeitos. R01 trata da semântica dos axiomas.
3. **“Qualquer troca do master passa por todos os validadores.”** Descartado: a inspeção completa verifica o hash. R05 trata do vínculo efetivo do recibo e dos demais documentos normativos.
4. **“O validador deveria decidir sozinho se uma tela é linda.”** Não é uma exigência razoável. R10 cobra cobertura formal, dimensões e identidade das capturas; acabamento ainda precisa de inspeção real.
5. **“NOT_APPLICABLE na task de instrumentação sempre é errado.”** Não. Ela pode testar o avaliador sem medir a performance final do produto. O que precisa ser obrigatório é a prova do avaliador correto.
6. **“Todo arquivo sem owner deve ser editado.”** Não. Ele deve ser classificado; herdar tema sem alteração local pode ser a disposition correta.
7. **“A relação nativa de subissues já foi aplicada.”** Não foi alegado pelo pacote e não foi aplicada nesta revisão. Trata-se de pendência conhecida, não de descoberta nova.

## 8. Reproduzir esta auditoria

Na raiz deste bundle, com Python 3.9+ e o pacote original no diretório indicado:

```sh
python3 tools/audit_probes.py --package input/orchestra-execution-plan
python3 tools/positive_controls.py --package input/orchestra-execution-plan
```

`audit_probes.py` registra o comportamento atual da v3. Ele não converte a v3 em corrigida. Depois dos reparos, as expectativas devem ser usadas como regressões que exigem a recusa/seleção correta, preservando a prova do comportamento anterior. O runner de controles positivos usa Pillow somente para conferir a decodificação da imagem original; não é uma dependência do aplicativo.

Para reexecutar a suite original:

```sh
cd input/orchestra-execution-plan
python3 tools/validate_plan.py
python3 tools/render_issues.py --check
python3 -m unittest discover -s tools -p 'test_*.py' -v
```

### Artefatos de prova

| Arquivo | Conteúdo |
|---|---|
| `FINDINGS.json` | Achados, nós afetados, correções e cinco axiomas por correção. |
| `evidence/adversarial-probes.json` | Resultado detalhado das 27 sondas. Fixtures explicitamente sintéticas. |
| `evidence/positive-controls.json` | 12 controles que desafiam as próprias hipóteses da revisão. |
| `evidence/03-original-tests.log` | Suite v3 original: 83 testes passando. |
| `evidence/early-pilot-dependency-analysis.json` | As 44 tasks anteriores à primeira integração autorizada. |
| `evidence/original-manifest-verification.json` | Preservação dos 76 arquivos do manifesto original. |
| `input/orchestra-execution-plan/` | Cópia da v3 auditada, sem correção silenciosa. |

## 9. Fontes primárias consultadas

- Código e regras: `gmhelmold/HuGR-Orchestra` no SHA `30d951fcc4a09e708768551c7c6fd38a0efe3da8`.
- Imports da sidebar: https://github.com/gmhelmold/HuGR-Orchestra/blob/30d951fcc4a09e708768551c7c6fd38a0efe3da8/packages/app/src/pages/layout.tsx
- Composição real da sidebar: https://github.com/gmhelmold/HuGR-Orchestra/blob/30d951fcc4a09e708768551c7c6fd38a0efe3da8/packages/app/src/pages/layout/sidebar-shell.tsx
- Regras de codegen: https://github.com/gmhelmold/HuGR-Orchestra/blob/30d951fcc4a09e708768551c7c6fd38a0efe3da8/AGENTS.md
- GitHub — versões suportadas da API: https://docs.github.com/en/enterprise-cloud%40latest/rest/about-the-rest-api/api-versions
- GitHub — API de dependências de issues: https://docs.github.com/en/rest/issues/issue-dependencies

As provas locais apontam para os arquivos exatos do pacote incluído e para IDs canônicos dos nós/critérios. A documentação externa foi usada para verificar hipóteses de API, não como substituto do código do usuário.

## 10. Estado de aprovação

**O plano v3 permanece NÃO APROVADO.** Nenhuma issue foi fechada, nenhum merge foi realizado, nenhuma relação nativa foi alterada e nenhum frontend foi implementado por esta revisão. O master aprovado continua sendo o norte visual. O próximo trabalho é reparar os bloqueadores do contrato e reauditar a versão resultante, não iniciar a migração inteira com a v3 como está.

Esta revisão foi realizada nesta sessão pelo mesmo assistente, incluindo uma contraleitura dos próprios achados. Não foi atribuída falsamente a outro agente, auditor externo ou equipe independente.
