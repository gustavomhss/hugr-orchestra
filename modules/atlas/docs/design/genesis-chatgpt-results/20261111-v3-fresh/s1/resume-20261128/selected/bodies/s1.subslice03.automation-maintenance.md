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
