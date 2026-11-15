# s1.subslice03.automation-maintenance — revisão semântica L4 v1

Execução34269cf4-d631-41c5-a30b-85b0ec217390. Mesmos J1/J2, independentes, sem ferramentas. Material literal termina apenas no FIM_DO_LOTE externo. Nenhum voto do outro juiz sobre este candidato foi emitido ou incluído neste pacote. Metadados de gate na receita/evidência referem-se exclusivamente ao predecessor já aceito.

Candidato: s1.subslice03.automation-maintenance, 13840 bytes, SHA256 8cb4befb0cef6a35002679580d60f1746fdeac26acf45ff08e04942cff83abc7, Git blob 2685cecdd7df56046cc82f70ac8104c639249e33. Reutilize seus próprios pareceres e os bytes exatos dos predecessores indicados, já recebidos. Não reabrir por rotina conteúdo inalterado nem inferir aceite do novo corpo a partir do anterior.

Aplicar todos os critérios públicos pertinentes já recebidos, em especial GO-A1–7, GO-I1/2/7/8, QS-1–6, CC-1/3/7 e a suficiência local AC-01; demais obrigações operacionais mantêm provas próprias. Julgar o corpo inteiro e a fidelidade ao predecessor, utilidade da camada, limites de autoridade, interpretação, navegação versus build e receita/proveniência. Emitir PASS, FIX-FIRST ou REQUEST_EVIDENCE com falta obrigatória concreta; sugestão opcional não amplia a barra. Não emitir binding Atlas, consumidor, manutenção ou entrega completa.

A principal conferiu deterministicamente os 48 inputs declarados e os outputs, seus tamanhos/SHA256/blobs; receita congelada antes do dispatch; predecessor gate verificado antes da autoria. Corpo e evidência foram lidos integralmente. Nenhum teste de produto foi executado. Recibo receipts/derived-automation-maintenance-v1-verification.json. A tabela abaixo é projeção mecânica identificada do manifesto posterior, não texto da receita anterior nem nova autoridade semântica.


## BEGIN_CORPO_EXATO

# Automação: manutenção, diagnóstico e encaminhamento

**Chave:** `s1.subslice03.automation-maintenance` · **L4** · **need:** `maintenance` · **escopo:** S1-03 / `orchestra.s1`.

## 1. Uso e autoridade desta orientação

Este L4 orienta triagem, evidência necessária e encaminhamento ao responsável pelo contrato. Seu único predecessor obrigatório de build é `s1.subslice03.automation-impact` **L3 v2**, 13.666 bytes, SHA256 `05aeecb75fb2c4f8afb34fc44cf315490d800ac976eed82100f279ec2402044d`. O mesmo J1/J2 aceitou esses bytes, conforme a receita. O baseline referido é `1cde2ff7a71bcf7aecb5d030917b577165135d38`; não há diagnóstico de ambiente atual. [M01]

**Os procedimentos são orientação proposta, condicionada à autorização e à evidência nas portas reais.** Nenhum comando, teste, reparo, consumidor ou operação Atlas foi executado nesta autoria. M01–M08 em `evidence.md` distinguem mecanismo herdado, inferência operacional e requisito público. [M01, M06]

| Necessidade imediata | Seção a consultar | Aprofundamento no L3 aceito |
| --- | --- | --- |
| Envio, confirmação, retry ou schedules de CI | §3 | §§2–3 |
| Check verde, queue, PR ou integração | §4 | §4 |
| Atraso, falha, replay ou pausa agendada | §5 | §5 |
| Evidência insuficiente, mudança ou encaminhamento | §§2 e 6–8 | §§6–8 |

Essas rotas limitam a leitura ao problema; não provam leitura via Atlas nem criam build edges adicionais. [M01, M07]

## 2. Triagem e responsabilidade pelo contrato

Registre **qual promessa parece falhar**, versão, identidade do objeto e último fato sustentado. Preserve observação, intenção autorizada, inferência e lacuna separadamente. Ausência de confirmação não demonstra ausência de efeito; conhecimento indisponível não demonstra ausência de impacto. [M02]

| Família | Identidade e fronteira a localizar | Encaminhamento proposto |
| --- | --- | --- |
| Actions | Location, binding/revisão, client ID, IDs nativos; envio/ack/pós-condição | Mantenedor autorizado do contrato de comando, provider ou transporte atingido |
| Board | Card, PR/head, tree/comando, bundle/base; elegibilidade/check/integração | Mantenedor autorizado do Board e do gate atingido |
| ScheduledTask | Policy, owner/placement, task/revision/slot ou manualKey; claim/SessionInput | Mantenedor autorizado de política temporal, claim/admissão ou retomada |
| Conhecimento | Chave, versão, inputs/receita, validade e dependentes | Coordenação S1-03 para escopo e reavaliação pelo mesmo par |

São responsabilidades propostas; os inputs não nomeiam pessoas ou plantões de produto. A coordenação deve resolver necessidade de nova fonte ou mudança de escopo. Texto importado não concede permissão operacional. Tokens e segredos não devem integrar o registro diagnóstico. [M02, M08]

Antes de recomendar repetição ou reparo, determine a identidade, a precondição da operação real, a possibilidade de efeito e a existência de admissão. Preserve e encaminhe o desconhecido que impede decidir; não o converta em autorização. [M02, M03, M05]

## 3. Actions: localizar a perda de prova antes de repetir

Intenção durável, direito local de envio, ack e pós-condição são fatos distintos. Compare estado e prova, mantendo dedupe/retry/readback juntos; proteção local não garante universalmente exatamente um efeito remoto. [M03]

| Sinal | Evidência a examinar em atividade autorizada | Limite da decisão |
| --- | --- | --- |
| Recusa ou divergência de binding/policy | Binding/revisão, conta, IDs nativos e precondições efetivas | Nome não substitui ID; unknown não autoriza; policy local não configura provider |
| `accepted`, `unknown` ou falta de confirmação | Intenção, classificação do envio, ack e pós-condição implementada | Possível envio não é definitely unsent; accepted não basta para confirmed; falta de readback não justifica sozinha reenvio |
| Dispatch GitHub sem run atribuído | Prova de `workflow_dispatch` na branch padrão, separada da fonte da ref selecionada | No contrato descrito, 204 fica sem atribuição; proximidade temporal não cria run ID |
| Autoria após write sem confirmação | Commit-base/sourceVersion, draft, mutações e readback | Hash do draft não é versão nativa; perder confirmação não desfaz efeito; parser/lint não executam topologia |
| Recurso ou download parcial | Scope/precondições, fase aplicada; ownership, canal, bytes e EOF/exit | Fingerprint não garante CAS remoto; efeito parcial permanece visível; renovar antes de bytes não autoriza replay parcial nem credencial nativa no canal assinado |

GitLab conserva endpoints, identidades e gates de versão próprios, sem herdar permissões ou tentativas GitHub. Um novo contrato de atribuição ou retomada exige evidência nova; não preencher o gap inventando tentativa, ID ou pós-condição. [M03]

**Schedules de CI:** alterar cron YAML da branch padrão GitHub exige examinar autoria/fonte via `source.write`. Para pipeline schedule GitLab, examinar contrato do recurso, identidade, owner, timezone, ref, active e precondições. Essas mudanças não invalidam automaticamente DST ou claims de ScheduledTask; ligação adicional exige evidência do contrato compartilhado afetado. [M03, M05]

## 4. Board: separar verde, elegibilidade e integração

Identifique a decisão contestada: avanço de card, admissão do head, gate de bundle ou integração observada. Outcome narrado não prova efeito externo; guard de tools não é autenticação universal. [M04]

| Situação | Verificação proposta e consequência |
| --- | --- |
| Scoped-green surpreendente | Examinar último resultado por `(kind, command)` no tree. Pode haver green com pending/error; qualquer fail nesses resultados produz scoped-red. Não resumir como “todos passaram”. |
| Bundle pendente ou vermelho | Conferir checks requeridos e contrato vigente: ausência mantém pending; só `source:no-ci` permite green sem checks. Aceitar flaky não converte vermelho em verde. |
| Run correlacionado ao head errado | Preservar SHA/tempo/latest e concorrência como hipótese de ambiguidade; readback de Actions não resolve a prova própria do Board. |
| `shipped` com PR ou integração divergente | Exigir vínculo correto e leitura fresca; preservar tested on/merged on e a sequência bundle/gate/reobservação/push/banco. |
| Push já ocorrido, hold ou restore | Não presumir transação geral GitHub+Git+SQLite, cancelamento atômico ou reconstrução de queue/bundles/attempts/checks por restore de plano. |

Se tree/comando ou contrato CI mudarem, reavaliar o significado do green e a suficiência da prova anterior. Busy-set local não coordena hosts. A janela sem rechecagem final de revogação do bundle permanece inferência qualificada; esta orientação não demonstra correção da race nem propõe contornar gates. [M04, M06]

## 5. Scheduler: decidir pela fronteira de admissão

O ponto de diagnóstico é **SessionInput durável**. `started` indica admissão, não conclusão da Session. Revogar claim, editar horário e cancelar trabalho admitido não são equivalentes. [M05]

| Sinal ou mudança | Evidência/expectativa a confrontar | Distinção que deve permanecer |
| --- | --- | --- |
| Slot perdido, atraso, timezone ou DST | Policy, slot devido/skipped, next/repeat, latest/skip | Legado preserva offset no gap; capability escolhe primeiro instante válido. Não unificar atraso e catch-up por conveniência. |
| Owner/placement ou revisão divergente | Presença/identidade do owner antes da Session; claim e admissão | Os dois holds são para claim ainda não admitida, sem reler a Session do owner. |
| Tick falhou ou lease expirou | Running, SessionInput, settle e takeover | Lease de 120.000 ms não mede duração da Session; falha em tick consome slot sem retry automático; takeover admitido usa o mesmo messageID/prompt. |
| Replay de capability manualKey | Estado da row e existência de SessionInput | Running sem SessionInput pede retry shortly; revoked retorna erro; demais casos incluem running com SessionInput. Row assentada nesse ramo não exige admissão. |
| Pause/edit/remove ou repeat | Ordem entre holds/recheck, revogação e admissão | Admissão anterior permanece; janela após holds pode produzir revoked→started sem contar repeat/mover next. Não afirmar “pause cancela tudo” ou “repeat limita conclusões”. |
| Primeira capability com daemon ocioso | Condição de wake e fato de admissão | A lacuna de wake permanece qualificada; criação da capability não prova despertar. |

Nova manualKey é nova invocação; retenção dos últimos 20 runs assentados não equivale à retenção de Actions. Considerar identidade e trabalho admitido antes de recomendar nova invocação. O roteiro não autoriza limpar claims ou alterar persistência para aparentar consistência. [M05]

O teste de revogação citado pelo predecessor é expectativa **NOT_RUN**. Afirmar que um delta fecha a janela exigiria evidência do contrato e da ordem de admissão no candidato exato; repetir a expectativa não demonstra execução. [M05, M06]

## 6. Verificação: que evidência permite concluir

Defina versão/identidades, precondições, resultado esperado e resultado observado para a promessa afetada. O roteiro exige evidência para atividade futura autorizada; nenhum controle foi executado aqui. [M06]

| Prova necessária | O que permite avaliar | O que continua separado |
| --- | --- | --- |
| Comparação estática de contrato/delta | Regra alterada, identidades/estados e conhecimentos atingidos | Estado real de provider, runtime ou Session |
| Verificação de comportamento no candidato exato | Expectativa exercitada, incluindo falha/ambiguidade relevante | Cobertura universal e aceitação semântica |
| Leitura atribuída do efeito | Pós-condição do objeto correto e limite do mecanismo | Exatamente um efeito universal, conclusão de Session ou integração global |
| Julgamento e leitura de conhecimento | Suficiência semântica, validade de vínculos e consumo nas portas próprias | Qualificação de provider, testes e aceite global S1 |

Preserve divergências. Para retry, tratar envio/readback juntos; para CI, green/identidade; para scheduler, antes/depois da admissão. Controles capazes de rejeitar uma violação são expectativas pertinentes quando aplicáveis, não resultados obtidos. Registre `NOT_RUN` para execução ausente e `UNKNOWN` para informação não exposta. Hashes e seções completos não produzem PASS semântico. [M03–M06, M08]

## 7. Manter conhecimentos e consumidores coerentes

Para mudança autorizada: identificar delta/versão; localizar contrato/trecho; determinar conjunto de build e necessidades de consumo; justificar validade dos independentes; encaminhar revisão antes de promover conhecimento a corrente. Adições, remoções, intenção e receita também entram no impacto. Impacto indisponível é HOLD, não worklist vazia. [M07]

A cadeia declarada é `s1.core.automation` → `s1.subslice03.automation-flow` → `s1.subslice03.automation-impact` → este L4 → futura `s1.subslice03.entry`. A granularidade é artefato, sem cache por seção presumido. Entry também depende de support, boundary-flow e research-maintenance. Links/consulta conjunta não acrescentam build edge. Mudança restrita à automação não obriga reconstruir essas famílias; contrato/input compartilhado alterado exige reexaminar alcance com seus responsáveis. [M07]

Inputs/receita iguais e válidos permitem reúso pelas regras públicas. Autoridade, validade ou gaps alterados propagam mesmo com prosa igual; mudança apenas de recibo pede renovar vínculos, sem presumir nova interpretação. Resultado validado visível ao consumidor que permanece igual pode interromper rebuild posterior. Não são cache hits observados. Leitura corrente exige versão e manifestos válidos para inputs/contratos atuais; aceite anterior ou rollback não torna corrente um conhecimento obsoleto. [M07]

No plano público, **A-VIOLATION** consulta L1 automation e este L4; alterações de fronteira pedem reavaliar essa necessidade. **A-PERMITTED/S-FAILURE** usam L1/L2; **A-IMPACT**, os L3 de automação/research; **ENTRY-NAV**, entry/support. Reavaliar conforme o contrato afetado não obriga reconstruir toda família consultada. R-FAILURE/B-ABSTAIN não se tornam dependentes por navegação. São necessidades, sem casos reservados lidos, respostas previstas ou PASS de consumidor. [M07]

## 8. Handoff e critério de encerramento

O handoff proposto reúne: promessa/sintoma; versão/identidade; fato versus hipótese; contrato/seção e conjunto afetados; autorização pertinente; evidência, divergências e verificações ausentes; responsável a confirmar e decisão necessária. Encaminhe lacunas de contrato/fonte à coordenação, falhas ao responsável autorizado e suficiência do conhecimento ao mesmo par. Não invente intenção de produto para fechar o registro. [M02, M08]

Encerrar diagnóstico exige evidência da promessa e disposição explícita dos gaps. Reparar produto, julgar conteúdo, publicar/bindar, ler pelo índice e validar consumidores são estados distintos. Falha após mudança de fonte não autoriza conhecimento obsoleto como corrente; histórico permanece identificado. Preserve originais e identidades de revisões. [M08]

O gate recebido libera **a autoria deste L4**, não seu aceite, publicação, sucesso de manutenção ou a entrada. O L3 e os artefatos anteriores permanecem preservados. O mesmo par deve examinar estes bytes antes de qualquer dependente; `s1.subslice03.entry`, consumidores, Atlas e conclusão de S1-03/S1 não foram realizados ou certificados aqui. [M01, M08]

## END_CORPO_EXATO

## BEGIN_EVIDENCIA_EXATA

# Evidências — s1.subslice03.automation-maintenance

## 1. Objeto, autoridade e identidade integral

Este registro acompanha somente `s1.subslice03.automation-maintenance`, L4, need `maintenance`, v1. Corpo: **13840 bytes**, SHA256 `8cb4befb0cef6a35002679580d60f1746fdeac26acf45ff08e04942cff83abc7`, Git blob SHA1 `2685cecdd7df56046cc82f70ac8104c639249e33`. A autoria usa o mesmo contexto de família, sem oracle, parecer completo, fonte nova ou corpo de família irmã.

**P1 — única autoridade semântica e único predecessor obrigatório de build:** `s1.subslice03.automation-impact`, L3 v2. Todos os apontamentos P1 abaixo referem-se a este arquivo inteiro e a estes bytes:

| Campo | Valor |
| --- | --- |
| Caminho local | `producers/derived-automation-impact/body.md` |
| Bytes | 13666 |
| SHA256 | `05aeecb75fb2c4f8afb34fc44cf315490d800ac976eed82100f279ec2402044d` |
| Git blob SHA1 | `b803b5e7b626bcf746d5c15d7a0071a9f23de592` |
| Baseline de origem referido | `1cde2ff7a71bcf7aecb5d030917b577165135d38` |

A receita atual informa PASS de `parallel-v3-fresh/S1-03/J1` e `parallel-v3-fresh/S1-03/J2` para P1 exato, sem achados obrigatórios. Os hashes de resposta originais fornecidos são, respectivamente, `cebf51a08751a4ce81ffa6c2a472535e6ed3f6dde0f846f1bef8e10355310f29` e `00410b524cea90a9a4626a55fc83a2ec0c13ab648aca6b3590f198a9723063dd`. São metadados de gate recebidos; os pareceres completos e os arquivos de captura não foram lidos. Aceite semântico de P1 não prova runtime, consumo ou aceite deste L4.

**P2 — proveniência, sem edge semântico adicional:** `producers/derived-automation-impact/production-manifest.json`, 59561 bytes, SHA256 `71c87a55b4b64cf1dceeddbf466ecee7d7571edf15d125b24d91d968c792d4f5`, Git blob SHA1 `5b219e435b23d758b614f9212c8048fbfd55d373`. Seu estado de revisão é histórico, anterior ao gate comunicado na receita L4. O arquivo permanece inalterado; não é receita original nem autoridade para acrescentar fatos de produto.

## 2. Legenda de sustentação

- **Fato herdado:** contrato descrito em P1, sem observação nova de execução.
- **Derivação operacional:** orientação proposta a partir desse contrato; sua aplicação depende da autorização e de evidência nas portas pertinentes.
- **Norma pública:** requisito de manutenção, validade, preservação ou revisão do plano/contrato/critérios autorizados.
- **Não executado:** testes, reparos, provider, CI, Atlas e consumidores não foram exercitados nesta entrega. Conferência de arquivos não é teste de produto.

P1 é sempre a origem das afirmações sobre Actions, Board e scheduler. Os L1/L2 retidos no contexto cumulativo não viram predecessores diretos extras nem substituem a autoridade de P1. O manifesto anterior serve à enumeração e preservação do contexto, não à ampliação do escopo semântico.

## 3. Mapa do corpo às seções exatas de P1

| Grupo / destino neste L4 | Seções de P1 | Sustentação e transformação permitida |
| --- | --- | --- |
| **M01 — §1; gate e encerramento em §8** | §1 “Qual decisão este L3 sustenta”; §6 “Propagação entre conhecimentos e preservação dos independentes”; §8 “Fronteira desta análise e evidência ainda necessária” | Escopo, baseline e distinção entre análise, aceite e execução. O papel L4 vem de `derived-contract.json/layer_roles/4`; identidade e gate atual vêm de `automation-maintenance.json/predecessors`. A navegação curta é orientação editorial proposta, sem operação Atlas ou edge extra. |
| **M02 — §2 e handoff de §8** | §2 “Relações do produto: os fatos não são intercambiáveis”; §8 | Preserva identidades próprias: Actions Location/binding/revisão/client ID/IDs nativos; Board card/PR/head/tree/comando/bundle/base; scheduler policy/owner/placement/task/revision/slot/manualKey. A triagem e o encaminhamento são derivação operacional. Não se atribuem pessoas ou plantões; responsabilidade de produto permanece a confirmar. |
| **M03 — §3; verificações em §6** | §3 “Actions: onde uma mudança desloca a prova”; §2, parágrafo dos schedules de CI | Binding, autoridade/precondições, envio/ack/readback, autoria, efeito parcial e transporte são fatos herdados. O diagnóstico proposto exige prova compatível com o estado, sem transformar accepted em confirmed ou ausência de confirmação em ausência de efeito. Mantém branch padrão como prova de workflow_dispatch e fonte da ref selecionada como objeto separado; 204 sem atribuição. GitLab não herda contratos GitHub. Schedules: cron YAML da branch padrão GitHub → autoria/fonte via source.write; pipeline schedule GitLab → recurso/identidade/owner/timezone/ref/active/precondições; sem invalidar automaticamente DST/claims de ScheduledTask. |
| **M04 — §4; verificações em §6** | §4 “Board: impacto em elegibilidade, evidência e integração” | Mantém separação entre plano/outcome e fato externo, guard e autenticação, scoped state e bundle, tested on/merged on e integração observada. Scoped-green pode coexistir pending/error pelo último resultado por (kind, command) no tree; fail nesses resultados é red. Check requerido ausente deixa bundle pending; somente source:no-ci permite green sem checks. Preserva limites de flaky, correlação, busy-set, restore, push/banco e revogação, sem elevar inferência a execução. |
| **M05 — §5 e fronteira com CI em §3** | §5 “Scheduler: impacto antes e depois da admissão”; §2, parágrafo dos schedules; §3, parágrafo final de retry | SessionInput durável é fronteira; started não é término. Preserva DST legado/capability, latest/skip, owner antes da Session, holds somente para claim não admitida sem reler Session do owner, lease de 120.000 ms, falha de tick que consome slot sem retry automático e takeover admitido com mesmo messageID/prompt. Replay manualKey: running sem SessionInput pede retry shortly, revoked erro, demais incluem running com SessionInput e row assentada não exige admissão nesse ramo. Mantém janela revoked→started sem contar repeat/mover next, lacuna de wake, nova chave como nova invocação e retenção dos últimos 20 assentados distinta de Actions. |
| **M06 — §6; rótulos de §§1,4,5** | §§3–5; §8 | A matriz de prova e o desenho de verificações são orientação proposta. Contratos e inferências de P1 dão o objeto a examinar; não há evidência de testes ou correção medida. O teste de revogação permanece expectativa NOT_RUN. Hash, teste, julgamento, efeito atribuído e leitura real têm escopos distintos. |
| **M07 — §7; navegação em §1** | §6; §7 “Consumidores: quem deve ser reavaliado e por quê”; §8 | Mantém grafo declarado, granularidade de artefato, independência de research/boundaries/support, diferença entre navegação e build, impacto de adição/remoção/intenção/receita, reúso e propagação de autoridade/validade/gaps. IDs de consumidor são necessidades públicas do plano, sem casos ou respostas reservadas. O procedimento de atualizar e rever o conjunto é proposto, não rebuild/consumo executado. |
| **M08 — §8; fronteiras em §§2 e 6** | §8; §§6–7 | Preserva gaps, HOLD para impacto desconhecido, distinções entre conteúdo, provider, testes, publicação/binding/leitura e consumidor. Handoff e critério de encerramento são proposta normativa, sem declarar sucesso de manutenção. Originais, versões e históricos devem permanecer identificados. O gate de P1 libera somente a autoria deste L4; o gate deste corpo permanece pendente. |

A orientação é prescritiva onde explicitamente rotulada, sem transformar essas prescrições em contratos novos do produto. As qualificações do predecessor acompanham as decisões: ambiguidade de correlação do Board, janela de revogação de bundle e wake capability não foram reproduzidos nem resolvidos nesta entrega.

## 4. Normas públicas usadas e limites de prova

| Input normativo efetivo | Localizador | Uso neste L4 |
| --- | --- | --- |
| `payload/recipes/derived-contract.json` | `layer_roles/4`; `quality_rules`; `gate` | Ownership, diagnóstico, verificação e encaminhamento; referência útil em português; distinção de execução; gate do mesmo par. |
| `payload/artifact-plan.json` | `artifacts`; `direct_use_case_plan`; `navigation_rule`; `historical_entry` | Único predecessor L3; futura entry e demais famílias; associações A-VIOLATION, A-PERMITTED, S-FAILURE, A-IMPACT, ENTRY-NAV, R-FAILURE e B-ABSTAIN; preservação da entrada histórica. |
| `payload/recipes/derived-public-criteria.json` | GO-A1–A6, GO-I1–I5, GO-I7–I8, AC-01–AC-07, AC-09–AC-10, CC-3/4/7, QS-1/2/4/5/6 | Utilidade operacional, distinção epistemológica, independência/propagação, vínculo corrente, histórico, preservação, governança e limites de prova. São critérios públicos, não verdicts concedidos. |
| `payload/recipes/derived/automation-maintenance.json` | `artifact`; `predecessors`; `read_exactly`; `instructions`; `outputs` | Liberação e limites desta autoria L4; 15 inputs enumerados; cinco outputs exclusivos. |

As normas AGENTS, COMMON, missão, SKILL e seis referências públicas já lidas integralmente nesta família permanecem retidas e foram reconferidas por identidade. Plano, contrato comum e critérios foram relidos integralmente nesta entrega. Nenhum arquivo apontado por essas normas foi aberto apenas por estar citado. Em particular, `consumers/public-cases.json`, arquivos de oracle, pareceres e corpos irmãos não foram lidos.

As regras de reúso e de leitura corrente são requisitos públicos a demonstrar nas portas reais. Esta entrega não observa cache hit, call count de runtime, invalidação/rebuild, publicação/recuperação, reader ou consumidor; tampouco qualifica adapter/provider ou altera policy/guards. Papéis de encaminhamento são funcionais, sem afirmação de ownership operacional já atribuído.

## 5. Procedimento efetivo e contexto cumulativo

Receita, pedido, dispatch visível, corpo P1 e manifesto P2 são os cinco inputs novos. Somados aos **43 inputs anteriores integralmente retidos**, resultam em **48 unidades de input**, sem duplicar paths ou omitir aliases. Os **12 aliases históricos** e seus `original_read_paths` continuam idênticos. P1 atual é distinto do seu histórico v1; P2 atual é distinto do manifesto histórico preservado. O manifesto corrente registra cada arquivo inteiro, bytes, SHA256 e Git blob SHA1.

| Procedimento atual | Caminho | Bytes | SHA256 |
| --- | --- | ---: | --- |
| Receita congelada efetivamente usada | `payload/recipes/derived/automation-maintenance.json` | 9509 | `234852b82b4d24a10cda4840c6262abab446e3520f1a706eb0a1c555200cca5c` |
| Pedido preservado efetivamente usado | `producers/derived-automation-maintenance/request.txt` | 884 | `1fca3760dc1cc0749d5e44c216a7de6db0dc92916683c11e2435b05b199f25d8` |
| Dispatch literal efetivamente usado | `producers/derived-automation-maintenance/dispatch-message.txt` | 1704 | `47c9e0fe0a731c14c5930ec3d6b58a8322dae2381efd71852df7f1e67640d35f` |

P1 foi lido integralmente. Na exibição inicial de P2 houve truncamento central; o trecho literal de caracteres `[18000,38000)` foi relido e recuperou toda a região omitida, com sobreposição às extremidades recebidas. O arquivo inteiro tem 59.436 caracteres UTF-8 decodificados e 59561 bytes. Sua identidade integral e as identidades dos 15 inputs enumerados e dos 43 retidos foram conferidas. Normas já consumidas integralmente puderam ser reutilizadas conforme a receita.

A composição é nativa. Python por `exec_command` foi usado para leitura/escrita de UTF-8/JSON e conferência determinística via SHA256 e Git blob SHA1 (`blob`, espaço, tamanho, NUL, bytes). Um rascunho de 15.044 bytes foi mantido apenas em memória e condensado antes de gravar o corpo de 13840 bytes; a conferência de tamanho não é teste de produto. Nenhum script/procedimento extra foi salvo. O manifesto produzido depois é registro de proveniência, nunca receita retroativa.

Foram escritos somente `body.md`, este `evidence.md`, `production-manifest.json`, `response.md` e `dispatch-message.txt` no diretório exclusivo. `request.txt`, antecessores, pedidos/dispatches anteriores e históricos foram preservados. O dispatch e a resposta usam UTF-8 sem LF terminal; o FINAL reproduzirá a resposta exatamente. O manifesto registra a identidade da resposta; a identidade do próprio manifesto é calculada externamente após a serialização, evitando self-hash circular.

## 6. Estado e lacunas desta entrega

O corpo L4 tem oito seções depth2 e oito grupos de evidência. Verificações locais de identidade, estrutura, alias e preservação são mecânicas. Não foram feitas rede/GitHub, delegação, teste ou alteração de produto, operação Atlas, execução de consumidor ou produção da entrada.

P1 está aceito segundo o gate recebido. Este L4 permanece **AUTHORED_AWAITING_SAME_PAIR_SEMANTIC_REVIEW**. O principal obtém revisão do mesmo par antes de liberar dependentes. Limites de leitura/consumo devem ser demonstrados em atividade própria; navegação em Markdown não os satisfaz. Nenhum sucesso de manutenção ou aceite global S1-03/S1 é alegado. Tentativas físicas, tokens e cobrança são `UNKNOWN` quando não expostos.

## END_EVIDENCIA_EXATA

## BEGIN_RECEITA_DE_TAREFA_EXATA

{
  "schema": "s1-03-derived-task-recipe/v1",
  "execution_id": "34269cf4-d631-41c5-a30b-85b0ec217390",
  "frozen_at_utc": "2026-11-15T10:10:10.388930+00:00",
  "state": "FROZEN_BEFORE_AUTHOR_DISPATCH",
  "artifact": {
    "key": "s1.subslice03.automation-maintenance",
    "layer": 4,
    "need": "maintenance",
    "required_build_predecessors": [
      "s1.subslice03.automation-impact"
    ],
    "purpose": "Manutenção, diagnóstico, verificação e encaminhamento da automação"
  },
  "predecessors": [
    {
      "key": "s1.subslice03.automation-impact",
      "local_body_path": "producers/derived-automation-impact/body.md",
      "payload_body_path": "modules/atlas/docs/design/genesis-chatgpt-results/20261111-v3-fresh/s1/subslices/03-automation/producers/derived-automation-impact/body.md",
      "body_bytes": 13666,
      "body_sha256": "05aeecb75fb2c4f8afb34fc44cf315490d800ac976eed82100f279ec2402044d",
      "body_git_blob_sha": "b803b5e7b626bcf746d5c15d7a0071a9f23de592",
      "acceptance_gate": [
        {
          "judge_id": "parallel-v3-fresh/S1-03/J1",
          "status": "PASS",
          "body_sha256": "05aeecb75fb2c4f8afb34fc44cf315490d800ac976eed82100f279ec2402044d",
          "original_response_sha256": "cebf51a08751a4ce81ffa6c2a472535e6ed3f6dde0f846f1bef8e10355310f29"
        },
        {
          "judge_id": "parallel-v3-fresh/S1-03/J2",
          "status": "PASS",
          "body_sha256": "05aeecb75fb2c4f8afb34fc44cf315490d800ac976eed82100f279ec2402044d",
          "original_response_sha256": "00410b524cea90a9a4626a55fc83a2ec0c13ab648aca6b3590f198a9723063dd"
        }
      ],
      "gate_scope": "Semantic acceptance only; runtime and consumers are separate. Full judge prose is not an author input."
    }
  ],
  "author_context": "Continue the same already oracle-blind family author after the predecessor gate. No new agent per layer; preserve cumulative input context.",
  "retained_family_context": {
    "prior_manifest": "producers/derived-automation-impact/production-manifest.json",
    "manifest_sha256": "71c87a55b4b64cf1dceeddbf466ecee7d7571edf15d125b24d91d968c792d4f5",
    "rule": "Continue the same family author. List every retained prior context input in the new manifest as well as newly read files. Do not silently drop the earlier source/recipe/request context. The principal inspected this manifest mechanically; it is not a new semantic source."
  },
  "union_navigation_proposal_gate": null,
  "exclusive_output_directory": "producers/derived-automation-maintenance",
  "payload_output_directory": "modules/atlas/docs/design/genesis-chatgpt-results/20261111-v3-fresh/s1/subslices/03-automation/producers/derived-automation-maintenance",
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
      "local_path": "producers/derived-automation-impact/body.md",
      "bytes": 13666,
      "sha256": "05aeecb75fb2c4f8afb34fc44cf315490d800ac976eed82100f279ec2402044d",
      "git_blob_sha": "b803b5e7b626bcf746d5c15d7a0071a9f23de592",
      "whole_file_identity": true,
      "accepted_predecessor_key": "s1.subslice03.automation-impact"
    },
    {
      "local_path": "producers/derived-automation-impact/production-manifest.json",
      "bytes": 59561,
      "sha256": "71c87a55b4b64cf1dceeddbf466ecee7d7571edf15d125b24d91d968c792d4f5",
      "git_blob_sha": "5b219e435b23d758b614f9212c8048fbfd55d373",
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

## Reúso literal de RECEITA_COMUM_EXATA

payload/recipes/derived-contract.json: 4017 bytes; SHA256 bcde63f79d8cacd030293da38c580c55c5aa58e0a5ff3751f1d1e27971f17588. Mesmo arquivo integral recebido por ambos no lote derived-automation-impact-v1; não há conteúdo novo ou alterado neste bloco.

## Reúso literal de PLANO_PUBLICO_EXATO

payload/artifact-plan.json: 5017 bytes; SHA256 6bf70a5c448d65ec3a046aefc0b0b9db2f783dcd8573a2d2ea69487bec7ce9ad. Mesmo arquivo integral recebido por ambos no lote derived-automation-impact-v1; não há conteúdo novo ou alterado neste bloco.

## Novos inputs — projeção mecânica do manifesto

Os 43 inputs cumulativos anteriores mantêm os mesmos bytes/identidades do manifesto producers/derived-automation-impact/production-manifest.json, SHA256 71c87a55b4b64cf1dceeddbf466ecee7d7571edf15d125b24d91d968c792d4f5. Seus registros foram recebidos nos lotes anteriores identificados neste pacote; não são retransmitidos. A tabela contém os 5 inputs adicionais. O manifesto corrente integral e a tabela completa permanecem preservados no pacote alternativo preparado, sem alegar leitura integral dele pelo juiz.

| Path local | Bytes | SHA256 | Papel declarado |
| --- | ---: | --- | --- |
| producers/derived-automation-impact/body.md | 13666 | 05aeecb75fb2c4f8afb34fc44cf315490d800ac976eed82100f279ec2402044d | accepted_l3_semantic_build_predecessor |
| producers/derived-automation-impact/production-manifest.json | 59561 | 71c87a55b4b64cf1dceeddbf466ecee7d7571edf15d125b24d91d968c792d4f5 | prior_family_manifest_provenance_not_semantic_predecessor_or_recipe |
| payload/recipes/derived/automation-maintenance.json | 9509 | 234852b82b4d24a10cda4840c6262abab446e3520f1a706eb0a1c555200cca5c | actual_frozen_l4_task_recipe |
| producers/derived-automation-maintenance/request.txt | 884 | 1fca3760dc1cc0749d5e44c216a7de6db0dc92916683c11e2435b05b199f25d8 | actual_preserved_l4_request |
| producers/derived-automation-maintenance/dispatch-message.txt | 1704 | 47c9e0fe0a731c14c5930ec3d6b58a8322dae2381efd71852df7f1e67640d35f | actual_visible_l4_dispatch |

Manifesto original posterior: producers/derived-automation-maintenance/production-manifest.json; 78038 bytes; SHA256 0823cff6ce4916334118fbcb0df923dfa09d60350d1e2b0fc80b8d9e90de1e56. Ele permanece integral no payload, mas sua totalidade não é retransmitida aqui. Conteúdo declarativo de uso não substitui seu juízo.

Decida somente após FIM_DO_LOTE externo.

## Autoridade publica decisiva para procedimentos e limites

Recortes de inputs públicos já consumidos pelo autor, transportados literalmente antes do primeiro despacho. Não são execução de comandos nem concessão de autoridade.

BEGIN_LITERAL_AUTHORITY {"path": "inputs/AGENTS.md", "first_line": 1, "last_line": 1, "source_bytes": 16501, "source_sha256": "07acaefb95db4b07b4e76c4255f7d6e0ecc4c7466b46fbf6ec5e5cdf6cc01b4f", "bytes": 169, "sha256": "5d4629babd7a5f60103e1ccedc0583a63b1804203cd0d735d71f5b648aae14f8"}
- After changing the public Protocol or Server `HttpApi`, run `bun run generate` from `packages/client`. Do not edit `src/generated` or `src/generated-effect` directly.
END_LITERAL_AUTHORITY

BEGIN_LITERAL_AUTHORITY {"path": "inputs/AGENTS.md", "first_line": 158, "last_line": 178, "source_bytes": 16501, "source_sha256": "07acaefb95db4b07b4e76c4255f7d6e0ecc4c7466b46fbf6ec5e5cdf6cc01b4f", "bytes": 3402, "sha256": "3f932e5e2e0bbed1e970b5e835b9db650f467fdb6a82785c51fdc9e4d09a1b40"}
- Avoid mocks as much as possible, you shouldn't be using globalThis.\* at all unless it's the only option.
- Test actual implementation, do not duplicate logic into tests
- Tests run on GitHub Actions, never on this machine. From the repository root: `bun run test:ci <package> [test files...] [-t pattern] [--os linux|windows|both]`, for example `bun run test:ci maestro test/roster.test.ts`.
  - Named test files run exactly and in the order given. Any other argument, such as a directory, is a Bun substring filter that may match several files, which Bun runs in its own order.
  - It uploads a snapshot of your working tree to a temporary `ci-run-*` branch, waits for the `test-ci` workflow, prints the result and exits non-zero when tests fail. No commit is needed; untracked files that are not gitignored are included, so keep secrets out of the tree.
  - A run takes a few minutes: give the shell call a long timeout or run it in the background.
  - A Python package (a `requirements-dev.txt` and no `package.json`) runs pytest instead. In a package with both, such as `modules/relay`, naming only `.py` files runs pytest, for example `bun run test:ci relay tests/test_authoring.py`, and anything else runs `bun test`; `-t` becomes pytest's `-k`.
  - The omni positive control (`script/test-omni-control.ts`) prints one `omni positive control:` line per run, and `test:ci` fails a job without it or whose verdict is neither `pass` nor `not applicable`. Full lanes and whole-package `test:ci` runs expect every run to spawn through omni; a narrower `test:ci` run (`ORCHESTRA_OMNI_CONTROL=declared`, derived from the request) expects it only from tests that declared it. A test that must spawn through omni calls `expectSpawn(import.meta.path)` from `packages/core/test/fixture/omni-expect.ts` in its body, before it spawns; it then fails unless it made an omni spawn of its own. `packages/core/test/omni-expect-guard.test.ts` requires the call in test files that import omni's spawn surface. `test:ci` accepts only `1` or `strict` for `--env ORCHESTRA_EXPERIMENTAL_OMNI_SPAWNER`: `0` or a typo would run the tests on legacy with the control off. Legacy rollback runs only in test.yml's named lanes.
  - A local `bun test` stops with a pointer to `test:ci` (`script/test-guard.ts`). Only the owner may allow a local run, with `ORCHESTRA_LOCAL_TESTS=1`.

## Spawning Processes

- Orchestra code starts child processes only through `ChildProcessSpawner`, `Process`, or `Process.interactive`.
- Only `packages/core/src/omni.ts` imports `hugr-omni` (`native/omni`); everything else goes through it.
- The sites that stay outside omni are the entries in `script/spawn-allowlist.json`, which is the source of truth; `native/omni/docs/orchestra-integration.md` §3 explains only the main groups.
- `bun run check:spawn-imports` fails on any other import of `cross-spawn`, `bun-pty`, `@lydell/node-pty`, `child_process` or `hugr-omni`, or use of `StdioClientTransport`. Today's sites are in `script/spawn-allowlist.json`; entries are only removed, never added without the lead.

## CI Cadence

- The full suite runs once per epic, not per unit of work. Gate each unit with change-scoped tests through `bun run test:ci` and a local package typecheck.
- To run CI, add the `epic` label to the epic PR (remove and re-add it to rerun) or dispatch the workflow manually. Pushes and unlabeled PRs run nothing.
END_LITERAL_AUTHORITY

BEGIN_LITERAL_AUTHORITY {"path": "inputs/AGENTS.md", "first_line": 194, "last_line": 205, "source_bytes": 16501, "source_sha256": "07acaefb95db4b07b4e76c4255f7d6e0ecc4c7466b46fbf6ec5e5cdf6cc01b4f", "bytes": 674, "sha256": "c297e5d83bc49bbb8b9b2ebfe0092931750c5fc716168d10f636d47e8ff2446d"}
## Guardrail

- Before calling a change done, run `bun run check:guards --base origin/dev`; CI runs the same rules on every PR. Load the `guardrail-usage` skill to read a finding.
- Fix the finding. Use `guardrail-ignore: <rule id> <reason>` only where the rule's `clearedBy` allows it, and apply a `guardrail-approved` label only if you are Maestro: any other agent asks Maestro, who decides.

## Local Runtime

- You may be running inside the Orchestra desktop app or its local server. Do not stop or restart either; ask the owner when a restart is needed.

## Type Checking

- Always run `bun typecheck` from package directories (e.g., `apps/cli`), never `tsc` directly.
END_LITERAL_AUTHORITY

BEGIN_LITERAL_AUTHORITY {"path": "inputs/COMMON.md", "first_line": 34, "last_line": 41, "source_bytes": 12959, "source_sha256": "ec78eb0fa7dd391c623bac4d953115df6fbd6ba77176dc1bf1cf43650e9a90e7", "bytes": 1357, "sha256": "b2fc6248c9227243e9887796c3d2c5f77558feb9c49564130106525918d3d2bc"}
Preservar s1/native-package.json, coverage.json, handoff.json, work.md, ledger, snapshots, corpos e decisões históricos. Não editar genesis-fresh-s1 ou genesis-fresh-final a partir destas missões.

Código de produto só pode mudar quando uma correção/adaptação for estritamente necessária para executar ou comprovar uma obrigação atribuída do Genesis, em um path exato da sua partição.
Não implementar features nem corrigir incidentalmente todo defeito encontrado. Não alterar comportamento para tornar verdadeira uma afirmação: explicar o comportamento observado e seus limites.
Preservar a fonte investigada; qualquer candidato alterado recebe revisão, novos inputs, impacto e provas próprias. Não apresentar execução do candidato como execução do baseline inalterado.
Testes novos estritamente necessários ficam nos diretórios governados dos pacotes atribuídos, com prefixo s1-XX da sua identidade e helpers exclusivos.
Gerados só pelo gerador oficial e pelo dono correspondente. Mudança que gerar output fora da sua autoridade exige encaminhar o patch/proposta completa ao dono.
Esta autorização não inclui mudar AGENTS, contratos/skills da campanha, guards, workflows, aprovações, segredos ou políticas de acesso. Fora da propriedade, preparar a correção concreta para o dono e continuar o trabalho independente.
END_LITERAL_AUTHORITY

BEGIN_LITERAL_AUTHORITY {"path": "inputs/COMMON.md", "first_line": 93, "last_line": 103, "source_bytes": 12959, "source_sha256": "ec78eb0fa7dd391c623bac4d953115df6fbd6ba77176dc1bf1cf43650e9a90e7", "bytes": 1749, "sha256": "bef8ade677e8942e95475d027441de79091460a91d0bb0d2d99fbdbfac12c05c"}
Manter poucos arquivos úteis: work.md, execution-ledger.jsonl, native-package.json, corpos/evidências, judgments, matriz única e handoff.json.
Usar todos os 50 IDs do registro original na matriz final, com decisão local, evidência e complemento exclusivamente de composição. Não criar 50 documentos.
Registrar um plano finito de produção/juízes/correções/consumidores e revisá-lo conforme o trabalho. Não inventar uma quota curta que encerre a missão.
Tokens, tentativas físicas e cobrança não expostos ficam UNKNOWN; histórico não reconciliado não é zero. Não fazer chamadas pagas externas como efeito colateral.
Seguir AGENTS: testes de produto em GitHub Actions; typecheck e guard estático conforme as instruções. Não contornar guardas nem chamar teste local de outro nome.
Prova reutilizada deve identificar candidato e caso; testar somente os deltas e riscos reais. CI verde não é aceite semântico e um comando não executado fica NOT_RUN.

DELIVERY_COMPLETE vale somente para a subfatia quando população/necessidades, camadas necessárias, dois juízos, correções, operações, consumidores, manutenção, gates, economia e selo estão completos.
Não marcar a S1 inteira ou a campanha global como concluída. Falta exclusivamente da composição não impede entrega local; falta própria de consumo/revisão/gate não pode ser escondida como global.
Continuar todo trabalho executável até cumprir a missão. Plano, checkpoint, delegação ou PASS de lote isolado não encerram o trabalho.
Se houver impedimento material, descobrir capacidades/rotas realmente disponíveis, registrar erro/operação/evidência/condição de desbloqueio e terminar os itens independentes. O estado fica INCOMPLETE_BLOCKED.
END_LITERAL_AUTHORITY

