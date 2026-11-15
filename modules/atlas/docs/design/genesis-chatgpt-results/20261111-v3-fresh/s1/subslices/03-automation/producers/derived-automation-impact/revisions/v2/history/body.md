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
