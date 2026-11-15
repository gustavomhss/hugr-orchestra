# Evidência de derivação — s1.subslice03.automation-impact

## 1. Autoridade semântica e gate recebido

Entrega restrita à chave `s1.subslice03.automation-impact`, L3 v2, need `operational`, missão S1-03, execução `34269cf4-d631-41c5-a30b-85b0ec217390`. Não há conteúdo de manutenção L4 produzido.

O único predecessor obrigatório de build é `s1.subslice03.automation-flow`, L2 v3, arquivo integral `producers/derived-automation-flow/body.md`: **16.570 bytes**, SHA256 **`64d97f6da72c92a00ad8e3d91e20a42fd360dbedb502733c0548746462442287`**, Git blob **`5af7e410ddfb4d1da1473a990fc25d27a7580303`**. As afirmações de produto deste L3 derivam desses bytes aceitos. O baseline `1cde2ff7a71bcf7aecb5d030917b577165135d38` é a procedência atribuída pelo predecessor; nenhum código bruto foi relido para o L3.

A receita congelada `payload/recipes/derived/automation-impact.json` e o dispatch informam aceite integral do mesmo par J1/J2 sobre esse SHA256, sem pendências obrigatórias. Recebi a condição de gate e suas identidades; não consumi pareceres completos. O aceite libera autoria L3, não é aceite deste novo corpo, transformação Atlas ou prova de consumidor.

O manifesto L2 SHA256 `959840fc57d7d42e2d78abca1438f4ad18fbe8b20cb479fab6fc8127355ab1c3` foi lido como proveniência. Seu estado pendente registra o momento anterior ao gate agora fornecido; permanece preservado. Ele não é novo predecessor semântico, receita anterior inventada ou justificativa para desconsiderar o gate da receita atual.

Corpo L3 v2 acompanhado: `producers/derived-automation-impact/body.md`, SHA256 `05aeecb75fb2c4f8afb34fc44cf315490d800ac976eed82100f279ec2402044d`.

## 2. Mapa de afirmações I01–I08

Todos os vínculos L2 abaixo usam a mesma chave/hash integral da §1. Títulos são os headings exatos do predecessor, sem linhas brutas inventadas. Onde a regra é do contrato de campanha, isso aparece explicitamente em vez de atribuí-la à implementação.

| ID / trecho L3 | Apoio exato no L2 aceito e contratos públicos | Natureza e qualificação |
| --- | --- | --- |
| I01 — §§1 e 8 | L2 `1. Escopo e escolha do ponto de entrada` e encerramento de `8. Scheduler: separar claim, admissão e trabalho concluído`; receita L3 original `artifact`, `predecessors`; receita v2 `unchanged_accepted_semantic_predecessor`, `predecessor_gate`; contrato derivado `layer_roles.3` | Escopo e significado de cada prova herdados; papel L3/gate são autoridade pública atual. A entrega não se autocertifica nem libera L4. |
| I02 — §2 | L2 §1; `3. Actions: admitir, enviar uma vez localmente e observar`; `4. Actions: preservar a semântica do provider e do transporte`; `5. Board: transformar plano em trabalho elegível`; `6. Board: cortar, julgar e integrar o bundle`; §§7–8 | Identidades e resultados dos três mecanismos são achados estáticos herdados. Inferência L3: semelhança lexical não basta para propagar contrato ou garantia. Cron YAML GitHub exige reavaliar autoria/fonte via source.write; pipeline schedule GitLab exige reavaliar contrato do recurso, identidade/owner/timezone/ref/active e precondições. Nenhum dos dois invalida automaticamente DST/claims de ScheduledTask. |
| I03 — §§2–3 | L2 `2. Actions: fixar vínculo e intenção antes do envio`; §3; §4 | Mapa de impacto derivado de vínculo, sourceVersion, projeção, fases, ack/readback e transporte. Preserva prova de workflow_dispatch na branch padrão versus leitura da fonte selecionada, unknown pós-envio, atribuição por ID, limite de tentativa e ausência de replay parcial. Reavaliações são condicionais, não testes rodados. |
| I04 — §4 | L2 §§5–6 | Contratos do card, decisão, CI, queue, correlação, lanes, integração e restore. Inferências explícitas: mudar critério de gate exige reavaliar suficiência da prova; janela de hold/pausa e ambiguidade de run não foram reproduzidas. Nenhuma garantia de Actions é transferida ao Board. |
| I05 — §§2, 3 e 5 | L2 `7. Scheduler: identificar política e slot devido`; `8. Scheduler: separar claim, admissão e trabalho concluído`; distinção de schedules em §4 | Impacto esperado de policy/slot, owner, holds, lease, replay, admissão e wake. Os dois holds restringem-se a claim não admitida. Ramo restante de manualKey inclui running com SessionInput; row assentada não exige admissão nesse ramo. Retenção de runs assentados não é retenção Actions. Teste referido continua NOT_RUN. |
| I06 — §§6 e 8 | L2 §1 para predecessor/navegação; `payload/artifact-plan.json`: artifacts/required_build_predecessors/navigation_rule; critérios GO-I4, GO-I5, AC-05, AC-06; COMMON `Produção e reaproveitamento`; transport `Inputs: evidência capturada não é versão do runtime` | Grafo e regras de reúso são contratos públicos. Inferência L3 condicionada: propagação depende de alteração relevante do resultado/autoridade/validade/gaps, e famílias independentes não entram por links. Não prova cache, observação de impacto ou isolamento universal de código. |
| I07 — §7 | Plano `direct_use_case_plan`; L2 §§2–8 para as promessas de produto potencialmente afetadas; judging `Consumidor independente`; critérios AC-02/03/05/06 | Associações públicas de consumidores e condições de reavaliação. Não foram lidos consumers/public-cases.json ou respostas reservadas; não há oracle inferido, limite de contexto inventado ou consumidor executado. A-IMPACT consulta dois intermediários sem criar edge de build. |
| I08 — §§1, 7 e 8 | L2 §1 e limites das §§6–8; critérios GO-I2, GO-I5, GO-I8, AC-01/05/06; COMMON `Transporte e runtime Atlas`; judging e transport | Ausência de observação não é impacto vazio; fonte indisponível não é removida. Checks de arquivos não substituem juízo, runtime ou consumo. Expectativas/inferências permanecem distintas de resultado real. |

## 3. Autoridade pública para grafo, reúso e consumo

Os contratos abaixo já foram lidos integralmente no contexto da família e estão retidos com identidades no manifesto. O plano foi reconsultado para este L3. Nenhum deles é um corpo semântico irmão.

| Unidade | Identidade SHA256 | Trecho utilizado |
| --- | --- | --- |
| `payload/artifact-plan.json` | `6bf70a5c448d65ec3a046aefc0b0b9db2f783dcd8573a2d2ea69487bec7ce9ad` | Cadeias automation/research/boundary/support, entrada dependente e direct_use_case_plan; navegação não cria build edge |
| `payload/recipes/derived-contract.json` | `bcde63f79d8cacd030293da38c580c55c5aa58e0a5ff3751f1d1e27971f17588` | layer_roles.3, quality_rules, limites e procedimento efetivo |
| `payload/recipes/derived-public-criteria.json` | `1e7686491c5b68cb4f3d287377723edcd8932ae803c267ddbabf44a360dfc36e` | GO-I2/4/5/8, AC-01/02/03/05/06; distinção resultado/recibo, autoridade/validade/gaps e consumo real |
| `inputs/COMMON.md` | `ec78eb0fa7dd391c623bac4d953115df6fbd6ba77176dc1bf1cf43650e9a90e7` | Reúso, gates de predecessores, operação versus pacote nativo e limites de entrega |
| `inputs/references/transport.md` | `02dbf78b9eb76c894d07c9e498704d2260157b7b10d5e1d159a0fd1037e73e3c` | Dependência versus navegação; input unavailable versus absent; hashes de transporte versus versões de runtime |
| `inputs/references/judging.md` | `c820270ed2d777777be8794980658f3fcfe6e59cfa05ccac197280c56035f0bb` | Casos fixados, gates do mesmo par, consumidor independente e recibos concretos |

As abreviações de chaves em tabelas do corpo correspondem às chaves de prefixo `s1.subslice03.` do plano, salvo as chaves L1 explicitadas como `s1.core.*`. A entrada planejada exige support, boundary-flow, automation-maintenance e research-maintenance; não se deduziu aresta direta deste L3 para research-impact. O caso A-IMPACT, por consultar os dois L3, é uso conjunto e não dependência de construção.

## 4. Escopo da inferência e da prova

**Observação estática herdada:** identidades, estados, prazos, readback, heurísticas, políticas temporais e limites de admissão descritos no L2. Não se afirma execução desses mecanismos nesta autoria.

**Inferência de impacto L3:** cada alteração hipotética pode deslocar as condições de autorização, identidade, evidência, revogação ou significado do resultado que sustentam explicações e consumidores. As matrizes não afirmam que a mudança aconteceu ou que uma lista real de arquivos foi analisada. Não demonstram que caches atuais já invalidam corretamente um contrato alterado.

**Regras normativas:** a cadeia de build vem do plano; critérios públicos prescrevem reúso e propagação, incluindo resultados com prosa igual mas autoridade/validade/gaps diferentes e atualização isolada de recibos. Não foram exercitadas portas Atlas para demonstrar esses critérios.

**Expectativas de verificação:** consumidor e caso público são necessidades a reavaliar conforme versões/casos fixados. O teste de revogação citado no L2 é evidência de intenção, NOT_RUN. A consulta ao arquivo de casos não foi autorizada nem realizada; não se criaram respostas esperadas reservadas.

**Execução efetiva:** leitura dos inputs autorizados, síntese portuguesa, escrita em área exclusiva e conferência determinística de identidades, seções, referências e resposta preservada. Não houve teste de produto, alteração de produto, rede/GitHub, operação de provider/Atlas, consumidor, manutenção ou delegação.

## 5. Contribuição aos critérios e pendências

GO-A1/2/3, QS-1/2 e CC-3 recebem conteúdo concreto: oito seções de relações/impacto e entradas de aprofundamento. GO-A4/5 e CC-4 são tratados como contratos de propagação/reúso; execução ponta a ponta não é reivindicada. GO-A6 e QS-6 têm leitura delimitada e conferência mecânica, com uso não exposto UNKNOWN. GO-A7, GO-I7 e QS-3/4 preservam portas e escopo, sem mecanismo paralelo. GO-I1/2/8, QS-5 e AC-01 têm identidades, histórico e rótulos de prova; não recebem PASS autoatribuído. CC-1/7 permanecem delimitados a esta unidade e ao plano vigente, sem fechar a campanha.

A semântica de pesquisa e fronteiras não foi consumida por seus corpos. Sua separação aqui se baseia no grafo público e é condicional à ausência de alteração em inputs/contratos próprios; não constitui aceite de conhecimento ausente. L4 e entrada local são citados somente como nós planejados de propagação, sem conteúdo desses níveis produzido. Julgamento L3 pelo mesmo par, runtime, consumidores e manutenção continuam com gates próprios.

## 6. Inputs cumulativos e procedimento real

Os **36 inputs** anteriores permanecem no conjunto, com seus oito aliases históricos e `original_read_paths`. A correção acrescenta sete unidades integrais: os quatro outputs L3 v1 efetivamente lidos e preservados sob `revisions/v2/history`, a receita v2, o pedido v2 e o dispatch v2. Total: **43 inputs cumulativos distintos**. O L2 v3 aceito, já pertencente aos 36, foi relido integralmente sem duplicar sua unidade.

A lista read_exactly desta correção tem cinco arquivos, todos lidos por inteiro nos paths correntes e conferidos contra a receita antes de qualquer substituição. O manifesto L3 v1 foi exibido nos segmentos contíguos [0,18000), [18000,36000) e [36000,41645), sem truncamento. As quatro saídas substituídas foram preservadas byte-identicamente; os inputs correspondentes apontam agora para os aliases de histórico e conservam os paths lidos em original_read_paths. O manifesto registra se cada cópia foi criada ou já existia idêntica, sem sobrescrever histórico divergente.

A receita efetiva mantém contrato comum, receita/pedido/dispatch L3 originais e acrescenta `payload/recipes/derived/automation-impact-schedule-fidelity-v2.json`, `producers/derived-automation-impact/revisions/v2/request.txt` e o novo dispatch literal. O manifesto anterior é proveniência, sem virar fonte semântica ou receita retrospectiva. O L2 v3 permanece a única autoridade semântica obrigatória de build. Não houve fonte nova, oracle, parecer completo, corpo irmão ou arquivo de casos adicional.

As conferências determinísticas calculam bytes/SHA256/Git blob, comparam os dois segmentos não alterados e invertem a única substituição para restaurar integralmente a v1. Oito headings depth2 e oito grupos I permanecem. Pedidos/dispatches anteriores estão preservados; response.md e dispatch v2 não têm LF terminal. A delta registra texto e identidades antes/depois, não resultado de teste de produto. A identidade do próprio manifesto é calculada fora dele após serialização.

## 7. Correção obrigatória AI-L3-J1-01

O único finding público obrigatório transmitido afeta a §2, no parágrafo depois da tabela de relações. A formulação v1 ligava genericamente alteração de cron de CI a autoria/fonte. A correção separa os mecanismos conforme `s1.subslice03.automation-flow` L2 v3, SHA256 `64d97f6da72c92a00ad8e3d91e20a42fd360dbedb502733c0548746462442287`, §4 `Actions: preservar a semântica do provider e do transporte`.

| Mecanismo | Apoio exato no L2 §4 | Relação de impacto corrigida |
| --- | --- | --- |
| GitHub | Linha Schedule remoto de CI: cron no YAML da branch padrão; edição source.write | Reavaliar autoria/fonte para alterar esse cron YAML |
| GitLab | Mesma linha: recurso com ID/owner/timezone/ref/active; parágrafo seguinte exige autorização/scope/precondições da operação | Reavaliar contrato do pipeline schedule como recurso, suas identidades e precondições |
| ScheduledTask | O L2 distingue esses schedules de CI das políticas/claims locais das §§7–8 | Preservar ausência de invalidação automática de DST/claims por essas mudanças remotas |

A cláusula atual é:

> Alterar o cron YAML da branch padrão no GitHub exige examinar autoria/fonte via `source.write`; alterar pipeline schedule no GitLab exige examinar o contrato do recurso, sua identidade, owner, timezone, ref, active e precondições. Essas mudanças não invalidam automaticamente DST ou claims de ScheduledTask.

Todos os demais bytes do corpo foram preservados. A inversão restaura o L3 v1 SHA256 `cc7ebd4319e301cf3100f83867a889c6295e52c7d0c39a769d2962bc251c9722`; não se editou dispatch, scheduler, grafo de dependências ou mapa de consumidores fora da cláusula autorizada. A receita não transmitiu outro finding obrigatório, mas isso não é aceite automático da v2. O mesmo par deve reavaliar estes bytes; L4 continua não liberado.
