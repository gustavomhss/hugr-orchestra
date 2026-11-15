# s1.subslice03.automation-impact — revisão semântica L3 v1

Execução34269cf4-d631-41c5-a30b-85b0ec217390. Mesmos J1/J2, independentes, sem ferramentas. Material literal termina apenas no FIM_DO_LOTE externo. Nenhum voto do outro juiz sobre este candidato foi emitido ou incluído neste pacote. Metadados de gate na receita/evidência referem-se exclusivamente ao predecessor já aceito.

Candidato: s1.subslice03.automation-impact, 13454 bytes, SHA256 cc7ebd4319e301cf3100f83867a889c6295e52c7d0c39a769d2962bc251c9722, Git blob 5e345882926432b1049d4ef9ae781c2fb6a1e5f2. Reutilize seus próprios pareceres e os bytes exatos dos predecessores indicados, já recebidos. Não reabrir por rotina conteúdo inalterado nem inferir aceite do novo corpo a partir do anterior.

Aplicar todos os critérios públicos pertinentes já recebidos, em especial GO-A1–7, GO-I1/2/7/8, QS-1–6, CC-1/3/7 e a suficiência local AC-01; demais obrigações operacionais mantêm provas próprias. Julgar o corpo inteiro e a fidelidade ao predecessor, utilidade da camada, limites de autoridade, interpretação, navegação versus build e receita/proveniência. Emitir PASS, FIX-FIRST ou REQUEST_EVIDENCE com falta obrigatória concreta; sugestão opcional não amplia a barra. Não emitir binding Atlas, consumidor, manutenção ou entrega completa.

A principal conferiu deterministicamente os 36 inputs declarados e os outputs, seus tamanhos/SHA256/blobs; receita congelada antes do dispatch; predecessor gate verificado antes da autoria. Corpo e evidência foram lidos integralmente. Nenhum teste de produto foi executado. Recibo receipts/derived-automation-impact-v1-verification.json. A tabela abaixo é projeção mecânica identificada do manifesto posterior, não texto da receita anterior nem nova autoridade semântica.


## BEGIN_CORPO_EXATO

# Automação: relações e impacto de mudanças

**Chave:** `s1.subslice03.automation-impact` · **L3** · **need:** `operational` · **escopo:** S1-03 / `orchestra.s1`.

## 1. Qual decisão este L3 sustenta

Este artefato delimita quais contratos, explicações e necessidades de consumo precisam ser reavaliados quando muda a automação. Seu único predecessor obrigatório de build é `s1.subslice03.automation-flow` L2 v3: **16.570 bytes**, SHA256 `64d97f6da72c92a00ad8e3d91e20a42fd360dbedb502733c0548746462442287`. O aceite do mesmo par foi fornecido pela receita, sem leitura dos pareceres. O baseline referido continua `1cde2ff7a71bcf7aecb5d030917b577165135d38`; não se qualifica um ambiente atual. [I01]

As §§2–5 distinguem as promessas de produto que podem mudar; §§6–7 delimitam propagação e consumidores. I01–I08 em `evidence.md` vinculam as afirmações ao L2 exato e aos contratos públicos. “Impacto esperado” é inferência condicionada à mudança; “verificar” indica evidência necessária, não execução realizada. Dependentes mecanicamente listados não provam suficiência semântica ou observação de todo o conjunto alterado. [I01, I08]

## 2. Relações do produto: os fatos não são intercambiáveis

Actions, Board e ScheduledTask têm identidades, persistência e significados de sucesso próprios. Nomes como retry, schedule ou accepted não criam contrato comum. [I02]

| Mecanismo e vínculo | Fato sustentado | Consequência para avaliar uma mudança |
| --- | --- | --- |
| Actions: Location, binding/revisão, client ID e IDs nativos | Intenção durável, direito local de envio, ack e pós-condição atribuída | Dedupe/readback afetam o significado de accepted/confirmed; suas garantias não passam ao ledger do Board |
| Board: card, PR/head, tree/comando, bundle/base | Plano/decisão, checks do tree e integração observada | Correlação/gate afetam a prova para avançar; prosa de outcome não vira fato externo |
| Scheduler: policy, owner/placement, task/revision/slot ou manualKey | Claim e admissão identificada | Tempo/lease/retomada afetam admissões; started não demonstra término da Session |

Cron YAML GitHub, pipeline schedule GitLab e ScheduledTask também são distintos. Alterar cron de CI exige examinar autoria/fonte; não invalida automaticamente DST ou claims locais. Uma conexão adicional precisa de evidência do contrato compartilhado alterado, não apenas de um nome comum. [I02, I03, I05]

## 3. Actions: onde uma mudança desloca a prova

A matriz delimita impacto semântico, sem inventariar paths brutos ou apresentar testes executados. Cada linha orienta a reavaliação do trecho indicado; outra linha entra quando o delta alcança seu contrato. [I03]

| Mudança considerada | Relação atingida / trecho do L2 | Distinção a preservar |
| --- | --- | --- |
| Binding, revisão, conta ou policy | Vínculo → autoridade/precondições → intenção; §§2–3 | ID nativo não é nome; unknown não autoriza; policy local não configura provider |
| Base/sourceVersion, parser ou autoria | Commit-base → draft → mutações → readback; §§2 e 4 | Hash do draft não é versão nativa; parser/lint não executam topologia; perder confirmação pós-write não desfaz efeito |
| Ack, estado, retry ou observador | prepare/dedupe → sending → accepted/unknown → reconcile; §3 | Confirmed vale para a pós-condição implementada; dispatch sem ID não recebe run por proximidade; retry não ganha tentativa inventada |
| Recurso, scope, segredo ou transporte | Precondição por provider → fase aplicada → resultado; §4 | Fingerprint não garante CAS remoto; efeito parcial fica visível; segredo/token não vira ledger; possível envio não é definitely unsent |
| Download, redirect ou término | Ownership → canal → bytes → EOF/exit; §4 | Renovação antes de bytes não autoriza replay parcial; credencial nativa não acompanha canal assinado |

Dispatch GitHub conserva **prova de workflow_dispatch na branch padrão** e **leitura da fonte da ref selecionada** como objetos diferentes. No contrato descrito, 204 fica sem atribuição. Um contrato novo que pretenda atribuir run precisa de evidência nova; alterar prosa não cria ID. GitLab mantém endpoints/identidades e gates de versão próprios, sem herdar tentativas ou permissões GitHub. [I03]

Retry atravessa identidade, classificação de envio e readback; analisar só o endpoint pode ocultar repetição de efeito. A proteção local de Actions não é garantia universal de exatamente um efeito remoto. Tampouco sua retenção de chave/intenção se transfere ao manualKey do scheduler. [I03, I05]

## 4. Board: impacto em elegibilidade, evidência e integração

Mudar estado de card e mudar prova de integração são alterações diferentes. O impacto depende de qual decisão passa a aceitar/recusar trabalho, com que identidade e em qual instante. [I04]

| Mudança considerada | Encadeamento afetado | Reavaliação necessária |
| --- | --- | --- |
| Guard, owner, decisão, stage ou PR | Porta/contexto → plano/atividade → Review/queue/shipped | Guard de tools não vira autenticação universal; outcome narrado não prova efeito; shipped com PR mantém leitura fresca e vínculo correto |
| Contrato CI, comando, tree ou correlação | Check → scoped state → admissão do head → gate | Comparar significado do green sob o contrato alterado, além de tree/comando; não presumir prova anterior suficiente para novo critério |
| Lanes, heads, base ou settle | Bundle → gate → reobservação → push → banco | Preservar tested on/merged on; recuperação de push já ocorrido não garante transação geral GitHub+Git+SQLite |
| Hold, pausa ou revogação | Filtro antes do corte → bundle em voo → efeito | Janela sem rechecagem final permanece como inferência até nova evidência; planejamento não prova cancelamento atômico |

Scoped state usa o último resultado por `(kind, command)` no tree: pode haver scoped-green com checks pending/error sob a regra descrita; qualquer fail nesses resultados produz scoped-red. Não se conclui “todos passaram”. No bundle, check requerido ausente mantém pending; só `source:no-ci` permite green sem checks. Aceitar flaky não transforma vermelho em verde. [I04]

Correlação de runs por SHA/tempo/latest é própria do Board e pode ser ambígua sob concorrência; readback de Actions não resolve essa prova. Busy-set local não é coordenação entre hosts. Restore de plano não recompõe queue/bundles/attempts/checks. Esses limites devem acompanhar qualquer mudança pertinente; não foram reproduzidos em execução. [I04]

## 5. Scheduler: impacto antes e depois da admissão

A fronteira decisiva é SessionInput durável. Mudar horário, revogar claim e cancelar trabalho admitido não são equivalentes. [I05]

| Mudança considerada | Contratos a manter coerentes | Consequência a examinar |
| --- | --- | --- |
| Cadência, catch-up, timezone ou DST | Policy → slot devido/skipped → next/repeat; L2 §7 | Legado preserva offset no gap; capability escolhe primeiro instante válido. Latest/skip e atraso não podem ser unificados por conveniência |
| Owner, placement, revision ou holds | Dono → claim → admissão; L2 §8 | Presença/identidade do owner antes da Session; os dois holds são para claim ainda não admitida, sem reler a Session do owner |
| Lease, falha, replay ou manualKey | Running → SessionInput → settle/takeover; L2 §8 | Lease de 120.000 ms não mede duração da Session; failure em tick consome slot sem retry automático; takeover admitido usa o mesmo messageID/prompt |
| Pause/edit/remove, repeat ou wake | Recheck → possível admissão → next; L2 §§7–8 | Admissão anterior permanece; janela após holds pode gerar revoked→started sem contar repeat/mover next; primeira capability com daemon ocioso conserva lacuna de wake |

No replay de capability manualKey, running sem SessionInput pede retry shortly e revoked retorna erro; demais casos incluem running com SessionInput. Não se exige admissão para row já assentada nesse ramo. Nova chave é nova invocação; a retenção dos últimos 20 runs assentados não equivale à retenção Actions. Alterar essas regras exige revisar dedupe e retomada conjuntamente. [I05]

O teste de revogação referido no L2 é expectativa, NOT_RUN. Não prova que um delta fecha a race. Intenções novas como “pause cancela toda execução” ou “repeat limita conclusões” exigem evidência que o contrato atual não oferece; started não pode ser reclassificado como conclusão. [I05]

## 6. Propagação entre conhecimentos e preservação dos independentes

O plano congelado define a cadeia abaixo. São dependências e alcance potencial; os artefatos futuros não são produzidos ou declarados aceitos por esta tabela. [I06]

| Artefato | Predecessor obrigatório / alcance |
| --- | --- |
| `s1.subslice03.automation-flow` L2 | `s1.core.automation` L1; explicação local afetada |
| `s1.subslice03.automation-impact` L3 | `s1.subslice03.automation-flow`; relações e conjunto afetado |
| `s1.subslice03.automation-maintenance` L4, planejado | Este L3; orientação futura depende de seu aceite/conteúdo |
| `s1.subslice03.entry` L4, planejado | automation-maintenance, research-maintenance, boundary-flow e support; automação chega pela maintenance |

Uma alteração de scheduler pode alcançar a mesma cadeia que Actions porque L1/L2 agregam ambos. Isso não obriga reescrever explicações inalteradas nem prova cache por seção: a granularidade declarada é o artefato. Código, adição/remoção, intenção e receita entram no impacto; fonte unavailable não demonstra ausência ou worklist vazia. [I06]

As regras públicas distinguem reúso com inputs/receita iguais e válidos, mudança de resultado visível ao consumidor e mudança apenas de recibo. Autoridade/validade/gaps alterados exigem propagação pertinente mesmo com prosa igual; recibo isolado pede renovar vínculos, sem presumir nova interpretação descendente. Resultado visível validado que permanece igual pode interromper rebuild posterior. São critérios a comprovar nas portas reais, não cache hits observados aqui. [I06]

A cadeia `s1.core.research` → research-flow → research-impact → research-maintenance é independente no plano; boundaries → boundary-flow e support têm entradas próprias. Link ou consulta conjunta não cria build edge. Mudança restrita a automação não justifica, por si, reconstruí-las. Isso não prova isolamento de todo código: evidência de input/contrato compartilhado alterado exige rever o conjunto com seus donos. Seus corpos não foram consumidos neste L3. [I06]

## 7. Consumidores: quem deve ser reavaliado e por quê

Os IDs vêm somente do `direct_use_case_plan` público: associações de necessidades, não respostas reservadas ou execuções. O arquivo de casos referenciado não foi aberto. Reavaliações concretas devem respeitar os casos/limites fixados pela coordenação. [I07]

| Necessidade pública | Quando a mudança pode exigir reavaliação |
| --- | --- |
| A-IMPACT | Usa este L3 e research-impact: mudanças nas relações exigem conferir a explicação de automação e a preservação do independente; consulta conjunta não liga builds |
| A-PERMITTED | Usa L1 automation/L2 automation-flow: identidade, autoria ou contrato de comando que altere a orientação consumida |
| A-VIOLATION | Usa L1 automation/maintenance planejada: mudança da fronteira de contrato a reconhecer; não se presume L4 disponível |
| S-FAILURE | Usa L1 automation/L2 automation-flow: mudança de política temporal, claim, admissão, wake ou significado de falha/retomada |
| ENTRY-NAV | Usa entry/support: contribuição aceita de automação que altere resumo ou aprofundamento da futura entrada |
| R-FAILURE / B-ABSTAIN | Navegação não os torna dependentes de automação; reavaliar se houver impacto demonstrado sobre seus próprios contratos/inputs |

Reavaliar consumidor não implica reconstruir toda família também consultada. É preciso distinguir resposta exigida, resultado de conhecimento e vínculo. Caso novo não aprova retroativamente produção anterior. Sem recibo de leitura/resposta no candidato exato, a expectativa não é um PASS. [I07, I08]

## 8. Fronteira desta análise e evidência ainda necessária

Uma conclusão de impacto identifica mudança/versão, promessa afetada, seção de conhecimento, caminho de build e necessidade de consumo. Preservar um independente exige sustentar a validade dos seus inputs/contratos; “mesmo domínio” ou “link removido” não resolve isso. Impacto não observável permanece incerto/HOLD, sem anunciar conjunto vazio. [I06, I08]

Ambiguidade do Board, revogação de bundle e wake capability permanecem inferências qualificadas. Proposta não é resultado medido. Provider, testes, Atlas binding/publicação/read, consumidores e manutenção exigem provas próprias. Esta autoria fez somente leitura/composição e conferência de arquivos; hashes não são versões de runtime nem juízo semântico. [I08]

O gate recebido libera este L3 a partir do L2 exato. Não equivale ao aceite deste corpo, à liberação de manutenção L4 ou à conclusão de S1-03/S1. O mesmo par deve julgar estes bytes antes de qualquer dependente. [I01, I08]

## END_CORPO_EXATO

## BEGIN_EVIDENCIA_EXATA

# Evidência de derivação — s1.subslice03.automation-impact

## 1. Autoridade semântica e gate recebido

Entrega restrita à chave `s1.subslice03.automation-impact`, L3, need `operational`, missão S1-03, execução `34269cf4-d631-41c5-a30b-85b0ec217390`. Não há conteúdo de manutenção L4 produzido.

O único predecessor obrigatório de build é `s1.subslice03.automation-flow`, L2 v3, arquivo integral `producers/derived-automation-flow/body.md`: **16.570 bytes**, SHA256 **`64d97f6da72c92a00ad8e3d91e20a42fd360dbedb502733c0548746462442287`**, Git blob **`5af7e410ddfb4d1da1473a990fc25d27a7580303`**. As afirmações de produto deste L3 derivam desses bytes aceitos. O baseline `1cde2ff7a71bcf7aecb5d030917b577165135d38` é a procedência atribuída pelo predecessor; nenhum código bruto foi relido para o L3.

A receita congelada `payload/recipes/derived/automation-impact.json` e o dispatch informam aceite integral do mesmo par J1/J2 sobre esse SHA256, sem pendências obrigatórias. Recebi a condição de gate e suas identidades; não consumi pareceres completos. O aceite libera autoria L3, não é aceite deste novo corpo, transformação Atlas ou prova de consumidor.

O manifesto L2 SHA256 `959840fc57d7d42e2d78abca1438f4ad18fbe8b20cb479fab6fc8127355ab1c3` foi lido como proveniência. Seu estado pendente registra o momento anterior ao gate agora fornecido; permanece preservado. Ele não é novo predecessor semântico, receita anterior inventada ou justificativa para desconsiderar o gate da receita atual.

Corpo L3 acompanhado: `producers/derived-automation-impact/body.md`, SHA256 `cc7ebd4319e301cf3100f83867a889c6295e52c7d0c39a769d2962bc251c9722`.

## 2. Mapa de afirmações I01–I08

Todos os vínculos L2 abaixo usam a mesma chave/hash integral da §1. Títulos são os headings exatos do predecessor, sem linhas brutas inventadas. Onde a regra é do contrato de campanha, isso aparece explicitamente em vez de atribuí-la à implementação.

| ID / trecho L3 | Apoio exato no L2 aceito e contratos públicos | Natureza e qualificação |
| --- | --- | --- |
| I01 — §§1 e 8 | L2 `1. Escopo e escolha do ponto de entrada` e encerramento de `8. Scheduler: separar claim, admissão e trabalho concluído`; receita atual `artifact`, `predecessors`; contrato derivado `layer_roles.3` | Escopo e significado de cada prova herdados; papel L3/gate são autoridade pública atual. A entrega não se autocertifica nem libera L4. |
| I02 — §2 | L2 §1; `3. Actions: admitir, enviar uma vez localmente e observar`; `4. Actions: preservar a semântica do provider e do transporte`; `5. Board: transformar plano em trabalho elegível`; `6. Board: cortar, julgar e integrar o bundle`; §§7–8 | Identidades e resultados dos três mecanismos são achados estáticos herdados. Inferência L3: semelhança lexical não basta para propagar contrato ou garantia. Schedules remotos de CI não são ScheduledTask. |
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

Os **31 inputs** do manifesto anterior permanecem no conjunto, com os oito aliases históricos e respectivos `original_read_paths` intactos. Somam-se **cinco unidades novas** efetivamente consumidas: corpo L2 v3, manifesto L2 v3 como proveniência, receita L3, pedido L3 e dispatch L3. Total: **36 inputs integrais distintos**. A lista read_exactly tem 15 arquivos; 13 já pertenciam ao contexto integral, e os dois restantes foram lidos agora por inteiro. O manifesto anterior foi exibido em dois segmentos contíguos [0,18000) e [18000,37617), sem truncamento.

O L1 ancestral e versões L2 antigas continuam declarados como contexto retido; não substituem o L2 v3 como autoridade atual desta derivação. Históricos não foram alterados. Nomes de fontes ou objetos internos mencionados nos corpos são referências atribuídas, não arquivos novos abertos. O manifesto anterior é proveniência e não cria uma dependência semântica extra.

A receita efetiva é o contrato comum mais `payload/recipes/derived/automation-impact.json`, o pedido preservado `producers/derived-automation-impact/request.txt` e o dispatch literal desta tarefa. `production-manifest.json` é produzido depois da autoria. As identidades integrais usam SHA256 dos bytes e Git blob SHA1 de cabeçalho blob/tamanho/NUL mais os bytes, sem normalizar texto.

O corpo tem oito headings depth2 e oito grupos I. O pedido permanece byte-idêntico; dispatch e response.md não têm LF terminal. O manifesto conserva os hashes de outputs não autorreferentes, incluindo response.md; a própria identidade é calculada externamente após serialização. Conferência determinística não equivale a aceite semântico. Somente o principal obtém o mesmo par e libera eventual dependente.

## END_EVIDENCIA_EXATA

## BEGIN_RECEITA_DE_TAREFA_EXATA

{
  "schema": "s1-03-derived-task-recipe/v1",
  "execution_id": "34269cf4-d631-41c5-a30b-85b0ec217390",
  "frozen_at_utc": "2026-11-15T09:40:18.891448+00:00",
  "state": "FROZEN_BEFORE_AUTHOR_DISPATCH",
  "artifact": {
    "key": "s1.subslice03.automation-impact",
    "layer": 3,
    "need": "operational",
    "required_build_predecessors": [
      "s1.subslice03.automation-flow"
    ],
    "purpose": "Impacto de mudanças de contrato e separação de famílias independentes"
  },
  "predecessors": [
    {
      "key": "s1.subslice03.automation-flow",
      "local_body_path": "producers/derived-automation-flow/body.md",
      "payload_body_path": "modules/atlas/docs/design/genesis-chatgpt-results/20261111-v3-fresh/s1/subslices/03-automation/producers/derived-automation-flow/body.md",
      "body_bytes": 16570,
      "body_sha256": "64d97f6da72c92a00ad8e3d91e20a42fd360dbedb502733c0548746462442287",
      "body_git_blob_sha": "5af7e410ddfb4d1da1473a990fc25d27a7580303",
      "acceptance_gate": [
        {
          "judge_id": "parallel-v3-fresh/S1-03/J1",
          "status": "PASS",
          "body_sha256": "64d97f6da72c92a00ad8e3d91e20a42fd360dbedb502733c0548746462442287",
          "original_response_sha256": "e690c904584be5efe3021e5ae3d8a8683c9de1d85e3851714cb321f7339f61ba"
        },
        {
          "judge_id": "parallel-v3-fresh/S1-03/J2",
          "status": "PASS",
          "body_sha256": "64d97f6da72c92a00ad8e3d91e20a42fd360dbedb502733c0548746462442287",
          "original_response_sha256": "793452cf4731dc118de5e9b7cc0c5359c9278daedd76b18e86ae9377abade175"
        }
      ],
      "gate_scope": "Semantic acceptance only; runtime and consumers are separate. Full judge prose is not an author input."
    }
  ],
  "author_context": "Continue the same already oracle-blind family author after the predecessor gate. No new agent per layer; preserve cumulative input context.",
  "retained_family_context": {
    "prior_manifest": "producers/derived-automation-flow/production-manifest.json",
    "manifest_sha256": "959840fc57d7d42e2d78abca1438f4ad18fbe8b20cb479fab6fc8127355ab1c3",
    "rule": "Continue the same family author. List every retained prior context input in the new manifest as well as newly read files. Do not silently drop the earlier source/recipe/request context. The principal inspected this manifest mechanically; it is not a new semantic source."
  },
  "union_navigation_proposal_gate": null,
  "exclusive_output_directory": "producers/derived-automation-impact",
  "payload_output_directory": "modules/atlas/docs/design/genesis-chatgpt-results/20261111-v3-fresh/s1/subslices/03-automation/producers/derived-automation-impact",
  "read_exactly": [
    {
      "local_path": "inputs/AGENTS.md",
      "bytes": 16501,
      "sha256": "07acaefb95db4b07b4e76c4255f7d6e0ecc4c7466b46fbf6ec5e5cdf6cc01b4f",
      "git_blob_sha": "ef3b523b0c00aed722582b870c1919188edc4c4f",
      "whole_file_identity": true
    },
    {
      "local_path": "inputs/COMMON.md",
      "bytes": 12959,
      "sha256": "ec78eb0fa7dd391c623bac4d953115df6fbd6ba77176dc1bf1cf43650e9a90e7",
      "git_blob_sha": "893cbb5f5eda2d0c19753606a50d1c482523f0c8",
      "whole_file_identity": true
    },
    {
      "local_path": "inputs/mission.json",
      "bytes": 6006,
      "sha256": "32fc0a8d442eff56716ba86400b13109c4bbb97d047e12a2d597a930153e7f75",
      "git_blob_sha": "48fa8da131e97c50110ee76e41e79283cd9a0ac4",
      "whole_file_identity": true
    },
    {
      "local_path": "inputs/SKILL.md",
      "bytes": 8143,
      "sha256": "f86523d16180ce06376c1635e1ee2f51f61bf80f620466fdd2cf9821ff720029",
      "git_blob_sha": "852e1d66539be5df895ba4cdbd2f9ab6e2331877",
      "whole_file_identity": true
    },
    {
      "local_path": "inputs/references/principles.md",
      "bytes": 6010,
      "sha256": "f724520d864fff48e11951fa97d54a362517a863ef518bb7b3cb3606b01f3230",
      "git_blob_sha": "3b4122705ef4ae4bda66fe7b5be4c93d55d32765",
      "whole_file_identity": true
    },
    {
      "local_path": "inputs/references/fatia-1.md",
      "bytes": 3987,
      "sha256": "152429602222695674fe42b029e8d8d83c974c0369d6c441eccfa0cacfeba7ae",
      "git_blob_sha": "78482ad7c72ec275fadb26ebece1c30bc1e5ccb9",
      "whole_file_identity": true
    },
    {
      "local_path": "inputs/references/fresh-start.md",
      "bytes": 4983,
      "sha256": "c5168fade744fd3809aeec6c48b22b85914c5257a0b7dd5b9dfcbb6c4c3b2166",
      "git_blob_sha": "ca485b25e43293a309c5489279dce80ce1441ed0",
      "whole_file_identity": true
    },
    {
      "local_path": "inputs/references/orchestration.md",
      "bytes": 4408,
      "sha256": "b9c6b6cb8b67b4ff546c99aa62041657482a74f11822514e37e2dbbc755cbbcb",
      "git_blob_sha": "4ffd37ea0015eb1d7529e23a2762aa2cec3dc8ac",
      "whole_file_identity": true
    },
    {
      "local_path": "inputs/references/judging.md",
      "bytes": 5787,
      "sha256": "c820270ed2d777777be8794980658f3fcfe6e59cfa05ccac197280c56035f0bb",
      "git_blob_sha": "452dc16776f84a6b0010dafa217564fc6411f183",
      "whole_file_identity": true
    },
    {
      "local_path": "inputs/references/transport.md",
      "bytes": 8478,
      "sha256": "02dbf78b9eb76c894d07c9e498704d2260157b7b10d5e1d159a0fd1037e73e3c",
      "git_blob_sha": "e9a98619f3b0759ead0287fa54fe3ef2f22137d5",
      "whole_file_identity": true
    },
    {
      "local_path": "payload/artifact-plan.json",
      "bytes": 5017,
      "sha256": "6bf70a5c448d65ec3a046aefc0b0b9db2f783dcd8573a2d2ea69487bec7ce9ad",
      "git_blob_sha": "8dba81b59cd093d28ea07cf4369d5842b6bdee68",
      "whole_file_identity": true
    },
    {
      "local_path": "payload/recipes/derived-contract.json",
      "bytes": 4017,
      "sha256": "bcde63f79d8cacd030293da38c580c55c5aa58e0a5ff3751f1d1e27971f17588",
      "git_blob_sha": "b0687d5855dd78d7ce1959d217b4ad15143565cd",
      "whole_file_identity": true
    },
    {
      "local_path": "payload/recipes/derived-public-criteria.json",
      "bytes": 16244,
      "sha256": "1e7686491c5b68cb4f3d287377723edcd8932ae803c267ddbabf44a360dfc36e",
      "git_blob_sha": "d4f6b765e6d78341ba2b77186c77b9177cf3156c",
      "whole_file_identity": true
    },
    {
      "local_path": "producers/derived-automation-flow/body.md",
      "bytes": 16570,
      "sha256": "64d97f6da72c92a00ad8e3d91e20a42fd360dbedb502733c0548746462442287",
      "git_blob_sha": "5af7e410ddfb4d1da1473a990fc25d27a7580303",
      "whole_file_identity": true,
      "accepted_predecessor_key": "s1.subslice03.automation-flow"
    },
    {
      "local_path": "producers/derived-automation-flow/production-manifest.json",
      "bytes": 37704,
      "sha256": "959840fc57d7d42e2d78abca1438f4ad18fbe8b20cb479fab6fc8127355ab1c3",
      "git_blob_sha": "e37f374bb7b4e39c385b4e9def7848a47bee862a",
      "whole_file_identity": true,
      "role": "Prior family output manifest now explicitly authorized as a provenance input for this next layer; not an original recipe or a new semantic predecessor."
    }
  ],
  "other_actual_inputs": "This frozen recipe, the request file and the visible dispatch. Record their full identities. If an extra source is needed, ask principal before reading.",
  "instructions": [
    "Read the listed public authority, plan, common recipe and criteria in full unless already completely read in this same family context, then the exact accepted predecessor body. Avoid output truncation. Retain all earlier actual context inputs in the new manifest. Do not open any oracle, judgment response, unlisted sibling file or recursive directory inventory.",
    "Produce only this artifact and its evidence/manifest. Do not preproduce a later layer. Use the accepted body as semantic authority, preserving its qualifications. The normative recipe states the role of this layer.",
    "Write a coherent useful Portuguese reference, normally 6000–14000 UTF-8 bytes, with independent depth2 headings for bounded Atlas read. This is a sizing preference, not permission to omit necessary meaning.",
    "Explain the defined need, mechanisms, decision boundaries and relevant limitations without copying the full predecessor. Distinguish static findings, contract-test expectations, inference and actual execution.",
    "Map claims to exact predecessor keys/hashes/sections in evidence.md. Navigation is not a build edge. Do not claim provider qualification, runtime binding, live consumers, maintenance success or global S1 acceptance.",
    "Store body.md, evidence.md, production-manifest.json, response.md and the exact visible dispatch record in the exclusive directory. Preserve existing request.txt. Include every actual consumed whole-file unit and provenance in production-manifest.json; do not call a postproduction manifest an earlier recipe.",
    "No network, GitHub writes, product tests or product changes, policy/guard changes, sibling mutations or other agents. Python/file tools may read the enumerated inputs and write your outputs; deterministic hashing is permitted.",
    "Stop after this one authoring delivery and report hashes, input/output counts and limitations. The principal obtains the same two native judges before releasing a dependent."
  ],
  "outputs": [
    "body.md",
    "evidence.md",
    "production-manifest.json",
    "response.md",
    "dispatch-message.txt"
  ],
  "reserved_answers_included": false,
  "usage_fields": "Physical attempts, tokens and billing UNKNOWN when not exposed."
}

## END_RECEITA_DE_TAREFA_EXATA

## BEGIN_RECEITA_COMUM_EXATA

{
  "schema": "s1-03-derived-public-authoring-contract/v1",
  "execution_id": "34269cf4-d631-41c5-a30b-85b0ec217390",
  "purpose": "Actual common recipe for future L2-L4 derivation; frozen before those author dispatches. Not semantic output or acceptance.",
  "scope": "S1-03 only",
  "source_revision": "1cde2ff7a71bcf7aecb5d030917b577165135d38",
  "protocol_revision": "ee2521a5b966bd505cc95bd1c733e09e12f33531",
  "kit_revision": "70234d541a9a3539935ef16f19e33c8f2d5f30ec",
  "artifact_plan": {
    "payload_path": "modules/atlas/docs/design/genesis-chatgpt-results/20261111-v3-fresh/s1/subslices/03-automation/artifact-plan.json",
    "sha256": "6bf70a5c448d65ec3a046aefc0b0b9db2f783dcd8573a2d2ea69487bec7ce9ad"
  },
  "author_context": "fresh fork none; no reserved answers; read exactly listed accepted predecessor bodies plus public task/recipe/authority inputs; new raw-source needs return to principal before use",
  "gate": "Only dispatch a derived artifact after the same two current native judges accept every declared required predecessor at exact bytes. Recipe preparation does not release the gate.",
  "layer_roles": {
    "2": "Explain local working flow and decision boundaries from accepted L1, giving useful direct entry points into the detailed contracts.",
    "3": "Explain relationships, change impact and which knowledge/consumers need re-evaluation; distinguish build dependencies from navigation and independent families.",
    "4": "Ownership, maintenance/diagnosis, verification and escalation; entry gives shallow orientation and concrete deeper navigation while preserving the historical Core entry."
  },
  "quality_rules": [
    "Write a usable Portuguese reference with clear depth2 section headings so a consumer can request a bounded section through ownership.read.",
    "Make distinct the source-supported mechanism, authorized intent, inference and remaining gap. Do not upgrade tests listed to executions.",
    "Cite exact accepted predecessor keys, bytes/hashes and relevant sections. Do not invent line evidence, raw source details or external engine guarantees.",
    "Avoid reprinting the full predecessor or adding a file per source; satisfy the defined need with a compact coherent explanation.",
    "Describe known failures and authority boundaries explicitly. A proposed operational action does not prove it was executed.",
    "Do not include reserved oracle answers or infer a consumer PASS; public questions are needs, not outcomes.",
    "No product edits, local tests, network/provider calls, GitHub writes, policy/guard changes or external messages.",
    "Preserve exact visible request/response and body bytes; retain every revision and actual input identity, including genuine procedures used. No private reasoning.",
    "Use only authorized exclusive producer directory. No sibling payload/producer mutation or recursive filesystem discovery. If an extra input is necessary, identify it before reading.",
    "The actual authoring recipe is this contract plus the per-task frozen recipe and visible dispatch. A descriptive output manifest created afterwards is not a preexisting executable recipe."
  ],
  "public_criteria": [
    "GO-A1",
    "GO-A2",
    "GO-A3",
    "GO-A4",
    "GO-A5",
    "GO-A6",
    "GO-A7",
    "GO-I1",
    "GO-I2",
    "GO-I7",
    "GO-I8",
    "QS-1",
    "QS-2",
    "QS-3",
    "QS-4",
    "QS-5",
    "QS-6",
    "CC-1",
    "CC-3",
    "CC-4",
    "CC-7",
    "AC-01"
  ],
  "outputs": [
    "body.md",
    "evidence.md mapping claims/sections to exact accepted predecessor sections",
    "production-manifest.json listing actual consumed whole-file units and the scope of each, output hashes, gaps and procedure provenance",
    "request.txt exact visible dispatch",
    "response.md original visible result and limitations"
  ],
  "not_outputs": [
    "No oracle copy",
    "No new AGENTS or authority file",
    "No claimed runtime receipts or semantic verdicts",
    "No replacement of historical s1.core.entry"
  ]
}

## END_RECEITA_COMUM_EXATA

## BEGIN_PLANO_PUBLICO_EXATO

{
  "schema": "s1-03-required-artifact-plan/v1",
  "execution_id": "34269cf4-d631-41c5-a30b-85b0ec217390",
  "scope": "S1-03 only",
  "assigned_source_population": 462,
  "status": "FROZEN_BEFORE_DEPENDENT_L2_L4_PRODUCTION",
  "authoring_gate": "Only release each dependent after both same native judges accept every required predecessor; input body pins and acceptance refs are supplied at dispatch. This plan is not acceptance.",
  "artifacts": [
    {
      "key": "s1.core.automation",
      "layer": 1,
      "need": "flow",
      "required_build_predecessors": [],
      "purpose": "Actions, Board e agendamento: contratos da implementação"
    },
    {
      "key": "s1.core.research",
      "layer": 1,
      "need": "component",
      "required_build_predecessors": [],
      "purpose": "Research e toolkits: contratos, prontidão e autoridade da evidência"
    },
    {
      "key": "s1.core.boundaries",
      "layer": 1,
      "need": "component",
      "required_build_predecessors": [],
      "purpose": "Fronteiras Core para Atlas, Relay, control plane e RAG"
    },
    {
      "key": "s1.subslice03.support",
      "layer": 1,
      "need": "entry",
      "required_build_predecessors": [],
      "purpose": "Suporte de entrada, ferramentas, história e fixtures dos104 paths"
    },
    {
      "key": "s1.subslice03.automation-flow",
      "layer": 2,
      "need": "flow",
      "required_build_predecessors": [
        "s1.core.automation"
      ],
      "purpose": "Entendimento local do ciclo de comando, Board e admissão agendada"
    },
    {
      "key": "s1.subslice03.research-flow",
      "layer": 2,
      "need": "flow",
      "required_build_predecessors": [
        "s1.core.research"
      ],
      "purpose": "Entendimento local da aquisição, índice, custódia e investigação"
    },
    {
      "key": "s1.subslice03.boundary-flow",
      "layer": 2,
      "need": "flow",
      "required_build_predecessors": [
        "s1.core.boundaries"
      ],
      "purpose": "Encadeamento e limites do lado Core das portas externas"
    },
    {
      "key": "s1.subslice03.automation-impact",
      "layer": 3,
      "need": "operational",
      "required_build_predecessors": [
        "s1.subslice03.automation-flow"
      ],
      "purpose": "Impacto de mudanças de contrato e separação de famílias independentes"
    },
    {
      "key": "s1.subslice03.research-impact",
      "layer": 3,
      "need": "operational",
      "required_build_predecessors": [
        "s1.subslice03.research-flow"
      ],
      "purpose": "Impacto de mudanças em receitas, índice, custódia e autoridade"
    },
    {
      "key": "s1.subslice03.automation-maintenance",
      "layer": 4,
      "need": "maintenance",
      "required_build_predecessors": [
        "s1.subslice03.automation-impact"
      ],
      "purpose": "Manutenção, diagnóstico, verificação e encaminhamento da automação"
    },
    {
      "key": "s1.subslice03.research-maintenance",
      "layer": 4,
      "need": "maintenance",
      "required_build_predecessors": [
        "s1.subslice03.research-impact"
      ],
      "purpose": "Manutenção e diagnóstico de research/toolkits e suas evidências"
    },
    {
      "key": "s1.subslice03.entry",
      "layer": 4,
      "need": "entry",
      "required_build_predecessors": [
        "s1.subslice03.support",
        "s1.subslice03.boundary-flow",
        "s1.subslice03.automation-maintenance",
        "s1.subslice03.research-maintenance"
      ],
      "purpose": "Entrada local rasa e aprofundamento com proposta de navegação para a união"
    }
  ],
  "direct_use_case_plan": {
    "A-PERMITTED": [
      "s1.core.automation",
      "s1.subslice03.automation-flow"
    ],
    "A-VIOLATION": [
      "s1.core.automation",
      "s1.subslice03.automation-maintenance"
    ],
    "A-IMPACT": [
      "s1.subslice03.automation-impact",
      "s1.subslice03.research-impact"
    ],
    "S-FAILURE": [
      "s1.core.automation",
      "s1.subslice03.automation-flow"
    ],
    "R-FAILURE": [
      "s1.core.research",
      "s1.subslice03.research-flow"
    ],
    "B-ABSTAIN": [
      "s1.core.boundaries",
      "s1.subslice03.boundary-flow"
    ],
    "ENTRY-NAV": [
      "s1.subslice03.entry",
      "s1.subslice03.support"
    ]
  },
  "case_limits_ref": "consumers/public-cases.json",
  "reserved_answers_included": false,
  "historical_entry": "s1.core.entry preserved byte-identically; never replaced or included as a rival new local definition",
  "union_navigation": "Existing concrete36-key/5-owner proposal remains NOT_SELECTED; S1_COORDINATION chooses union after five handoffs.",
  "navigation_rule": "Navigation links are not build edges. Declared entry dependencies concern the accepted explanations it summarizes; peer links alone never add dependency.",
  "allowed_adjustment": "Only a concrete new need/finding can change this finite graph; preserve previous plan and explain the delta before new dependent production."
}

## END_PLANO_PUBLICO_EXATO

## Inputs reais — projeção mecânica do manifesto

| Path local | Bytes | SHA256 | Papel declarado |
| --- | ---: | --- | --- |
| inputs/AGENTS.md | 16501 | 07acaefb95db4b07b4e76c4255f7d6e0ecc4c7466b46fbf6ec5e5cdf6cc01b4f | public_authority_or_procedure |
| inputs/COMMON.md | 12959 | ec78eb0fa7dd391c623bac4d953115df6fbd6ba77176dc1bf1cf43650e9a90e7 | public_authority_or_procedure |
| inputs/mission.json | 6006 | 32fc0a8d442eff56716ba86400b13109c4bbb97d047e12a2d597a930153e7f75 | public_authority_or_procedure |
| inputs/SKILL.md | 8143 | f86523d16180ce06376c1635e1ee2f51f61bf80f620466fdd2cf9821ff720029 | public_authority_or_procedure |
| inputs/references/principles.md | 6010 | f724520d864fff48e11951fa97d54a362517a863ef518bb7b3cb3606b01f3230 | public_authority_or_procedure |
| inputs/references/fatia-1.md | 3987 | 152429602222695674fe42b029e8d8d83c974c0369d6c441eccfa0cacfeba7ae | public_authority_or_procedure |
| inputs/references/fresh-start.md | 4983 | c5168fade744fd3809aeec6c48b22b85914c5257a0b7dd5b9dfcbb6c4c3b2166 | public_authority_or_procedure |
| inputs/references/orchestration.md | 4408 | b9c6b6cb8b67b4ff546c99aa62041657482a74f11822514e37e2dbbc755cbbcb | public_authority_or_procedure |
| inputs/references/judging.md | 5787 | c820270ed2d777777be8794980658f3fcfe6e59cfa05ccac197280c56035f0bb | public_authority_or_procedure |
| inputs/references/transport.md | 8478 | 02dbf78b9eb76c894d07c9e498704d2260157b7b10d5e1d159a0fd1037e73e3c | public_authority_or_procedure |
| payload/artifact-plan.json | 5017 | 6bf70a5c448d65ec3a046aefc0b0b9db2f783dcd8573a2d2ea69487bec7ce9ad | frozen_artifact_plan |
| payload/recipes/derived-contract.json | 4017 | bcde63f79d8cacd030293da38c580c55c5aa58e0a5ff3751f1d1e27971f17588 | actual_common_authoring_contract |
| payload/recipes/derived-public-criteria.json | 16244 | 1e7686491c5b68cb4f3d287377723edcd8932ae803c267ddbabf44a360dfc36e | public_normative_criteria |
| producers/automation/body.md | 60767 | 968965f1b15d633cefc8a78868d9d1049147f23dff409c6cb05c7a75e3561cae | accepted_semantic_predecessor |
| payload/recipes/derived/automation-flow.json | 8479 | ec4550336620b1d7abed85e78460c6d4c5ede73f31c8ddcf8a77be5272af3179 | original_task_recipe_retained |
| producers/derived-automation-flow/request.txt | 856 | da3d46f1369fc5ec17d4ec73b3b95ebeecf2c83c796f06e88d4409c1c64a331e | original_request_retained |
| producers/derived-automation-flow/dispatch-message.txt | 2056 | 808b4733f5306981efcdf337732dc6d53d1dce7b6569b5c7b32af0611e761fd9 | original_visible_dispatch_retained |
| producers/derived-automation-flow/revisions/v2/history/body.md | 16441 | 5985441b360d0efc6693d0d385980f4a93cab2c044387a7375608dd5a9adf517 | exact_retained_v1_output_consumed_for_correction |
| producers/derived-automation-flow/revisions/v2/history/evidence.md | 11997 | d2b8068c9167c0813719479d4d2b10046cc718921dad3db52d1f44957e3f1360 | exact_retained_v1_output_consumed_for_correction |
| producers/derived-automation-flow/revisions/v2/history/production-manifest.json | 16158 | 9c7d3130d4265bccba5e94fa0448b1d0bbbf3c02bf421a09d4e8d053cae4df06 | exact_retained_v1_output_consumed_for_correction |
| producers/derived-automation-flow/revisions/v2/history/response.md | 2470 | c8bf48be1b48cc17d8c376978e37c401079ba6e5ad72c51ac12443b8e433c7fd | exact_retained_v1_output_consumed_for_correction |
| payload/recipes/derived/automation-flow-source-fidelity-v2.json | 7391 | 16c2b4e2efc5a6e2ea6a111540e7a662ce154af3c58c366306e254f23d9b3364 | prior_correction_recipe_retained |
| producers/derived-automation-flow/revisions/v2/request.txt | 841 | 34caa0867a7d0c02dd94c37f789c0af7262132bf4f2359563021b8df3977e769 | prior_correction_request_retained |
| producers/derived-automation-flow/revisions/v2/dispatch-message.txt | 1370 | b5cf544c85c7f3fae4739c200210f829a8b72a7bbb65eab809799fa198621e93 | prior_correction_dispatch_retained |
| producers/derived-automation-flow/revisions/v3/history/body.md | 16541 | 5b24037431881e96ddb5a872fd6541c94880d189d8b0c873bac9d8bd874d85c1 | exact_retained_v2_output_consumed_for_v3_correction |
| producers/derived-automation-flow/revisions/v3/history/evidence.md | 14569 | 0c4bff02eec8c4dbca2886127f1546bd51707060df8306ba4e630dba73f990d8 | exact_retained_v2_output_consumed_for_v3_correction |
| producers/derived-automation-flow/revisions/v3/history/production-manifest.json | 27416 | 1802600a673c0521064bc636bd9be5e9e9aad9dd644f26efd5d14c02bee52cff | exact_retained_v2_output_consumed_for_v3_correction |
| producers/derived-automation-flow/revisions/v3/history/response.md | 3043 | 59ffb319da5b27d830b9eeabe7ac592c104a64496864235da4331cd5adc05c23 | exact_retained_v2_output_consumed_for_v3_correction |
| payload/recipes/derived/automation-flow-dispatch-fidelity-v3.json | 6224 | a0f24c622d77e89d6a7020334075691efb8f3153f99087eb7bc2afc3337cb9ea | actual_frozen_v3_correction_recipe |
| producers/derived-automation-flow/revisions/v3/request.txt | 680 | 4ed7cc034c532a6b414fa03bfcd4f2034ccfca3f593ebad1652653d814e64538 | actual_current_v3_request |
| producers/derived-automation-flow/revisions/v3/dispatch-message.txt | 1520 | 4fff1b29411f19321d656897a2ab13cb5c65589e4652e1f8a790fb49642ffbb0 | actual_visible_v3_dispatch |
| producers/derived-automation-flow/body.md | 16570 | 64d97f6da72c92a00ad8e3d91e20a42fd360dbedb502733c0548746462442287 | accepted_l2_semantic_build_predecessor |
| producers/derived-automation-flow/production-manifest.json | 37704 | 959840fc57d7d42e2d78abca1438f4ad18fbe8b20cb479fab6fc8127355ab1c3 | prior_family_manifest_provenance_not_semantic_predecessor |
| payload/recipes/derived/automation-impact.json | 9478 | dc1cb8d1b096c7cded692b4b5cd010d67e5a01165b28622a5caef5be4c0c0767 | actual_frozen_l3_task_recipe |
| producers/derived-automation-impact/request.txt | 869 | 493eb3912f434e83bafb9448d44e7b36961c37400bf53fec677e4edf69c938e6 | actual_preserved_l3_request |
| producers/derived-automation-impact/dispatch-message.txt | 1902 | 3129949a5d075b93e1922b5e3bf12b16f8f59f6fecb8d196ac460beef39d095c | actual_visible_l3_dispatch |

Manifesto original posterior: producers/derived-automation-impact/production-manifest.json; 41752 bytes; SHA256 fa3cb6ba4888e6449e2cb39d424e4e0dab2bc4e05f85c190fa1cfd7591e71c9c. Ele permanece integral no payload, mas sua totalidade não é retransmitida aqui. Conteúdo declarativo de uso não substitui seu juízo.

Decida somente após FIM_DO_LOTE externo.
