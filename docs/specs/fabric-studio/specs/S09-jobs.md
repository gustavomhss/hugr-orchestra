# S09 — comandos, jobs e recuperação

**Estado:** proposta técnica; não congelada para implementação.  
**Requisitos proprietários:** FS-RUN-001–015; FS-OPS-004.

## 1. Responsabilidade e integrações

Materializar Q04 e RT-01/RT-02 sem alterar a semântica de CapabilityJobs legada. [C04–C07](./CONTRACTS.md), S02 e S08 controlam origem/autoridade/revisão; S03 adapta provedor; S10 valida negócio; S13 protege/retém. Não cria pipeline engine, scheduler local de workloads ou recuperação automática do provider/modelo.

## 2. Contrato

### Identidade e admissão

Cada passo de ChangeRevision identifica uma ocorrência intencional de efeito. `command.admit` resolve essa ocorrência no servidor; unique `(context_id, change_id, revision, step_id)` devolve o mesmo CommandRef entre abas/call IDs. Delivery key é scoped por contexto/principal/origem de classe e tem hash de payload; conflito falha. Outro delivery key não cria segundo comando para a mesma ocorrência. Repetição deliberada de workload exige nova ocorrência/revisão/aprovação e vínculo à anterior, não chamar submit do comando antigo de novo.

Record privado `fabric_command`: command ID, context/generation/owner, mudança/revisão/passo, delivery identity/hash, digest e conteúdo/ref imutável, origem real capturada, estado/generation, processo de admissão, tentativa de envio única, timestamps e correlação. Aprovação e fatos de autoria são referências, não Authority persistida. Caller continua precisando de autorização atual para admitir, consultar ou despachar; obter recibo por idempotência não dispensa owner checks.

Admissão confirma/reconcilia intenção e recibo em transação SQL; **não chama Microsoft dentro do callback SQL**. Confirmação de armazenamento é pré-condição para enviar. O DB atual configura synchronous NORMAL: não é, por si só, prova contra perda de energia. A futura integração deve oferecer conexão do mesmo store governado com durabilidade FULL/flush demonstrada antes de envio, sem PRAGMA ad hoc por request ou banco paralelo. Esse é bloqueio de freeze, não comportamento já existente.

### Claim e efeito remoto

Atualização atômica proposta: compare owner/context generation, payload/digest, estado intent/blocked, expected command generation, aprovação e fatos locais atuais; grave submitting, attempt ID, process incarnation e generation+1; exigir exatamente uma linha atualizada. A operação de rede só é invocada pelo detentor desse claim e depois de última verificação de revogação conhecida. Ninguém readquire claim de submitting/accepted/unknown por prazo/lease ou restart.

Se o mesmo processo prova que não invocou transporte antes de uma interrupção/negação, registrar not-sent; uma nova ação explícita pode preparar nova ocorrência, com escopo atual. Se não puder provar, unknown. Em restart/restore, intenções antigas nunca são automaticamente despachadas: processo de admissão anterior exige reconciliação da história/durabilidade antes de habilitar novo envio. Restauração de backup/rollback de store entra em modo observation-only e revisão de comandos pendentes; não ressuscita uma intenção antiga como autorização nova.

| DispatchState | Próximo estado permitido / evidência |
| --- | --- |
| intent | blocked por preflight/auth/offline; submitting por claim atômico; not-sent por abandono explícito sem transporte. |
| blocked | intent/submitting somente por ação explícita, mesmos conteúdo/ocorrência e autorização válida; aprovação trocada exige nova ocorrência após inutilizar a antiga não enviada. |
| submitting | accepted com correlação do provedor; not-sent só com prova de que transporte não foi invocado; unknown se efeito possível ou registro de aceitação falha. |
| accepted | Mantém recibo de aceitação; estado do workload/LRO é outro registro. Falta de acesso à observação não apaga aceitação. |
| unknown | accepted/not-sent somente com reconciliação conclusiva; sem evidência, permanece unknown. Nunca volta a intent/submitting para retry cego. |
| not-sent | Terminal para a ocorrência; retry de entrega retorna esse fato, não envia. Novo trabalho é ação/revisão deliberada distinta. |

Uma rejeição remota pode provar não aceitação apenas quando o contrato da operação garante que não houve efeito. HTTP 5xx/timeout e “não achei por nome” não são essa prova. Retry de SDK/transporte para mutação não idempotente fica desabilitado; retry qualificado remoto só existe se o contrato preservar a mesma identidade e prova, não por configuração geral da biblioteca.

### LRO, job e observação

`fabric_job_observation` separa provider operation ID, job ID/tipo, resource/connection generation, WorkloadState, Cancellation, observedAt, coverage/erro e remote outcome. HTTP202/LRO concluída não significa workload concluído; exit value success não significa check passed. Estados remotos desconhecidos são preservados como desconhecidos, não forçados ao enum favorável.

Um serviço contextual de observação, separado de painel/tool, faz reads autorizados no mesmo ID; compartilha fetch entre assinantes compatíveis e respeita backoff/budget. Quando perde token/política/retenção/API, observação fica unavailable/unknown com motivo. Reautorizar pode retomar leitura, não refazer comando. Reabrir UI lê record local autoritativo e reconcilia esse mesmo ID, mesmo sem stream completo.

Proveniência mínima Studio é capturada na admissão confiável e não tem cascade de sessão/mensagem. Guarda owner/context, origem real e identidade da chamada como fato, revisão/digest, comando/passo e provider refs; não replica o chat. Apagar sessão marca origem removida, sem falsear atribuição. Observador operador atual precisa de leitura autorizada do contexto/conexão/política; não herda direito de efeito do produtor nem adota job legado que depende de prova apagada. Apagar a própria proveniência necessária torna observação unavailable, por decisão de retenção/exclusão explícita.

## 3. Estados e falhas

| Fronteira interrompida | Resultado honesto |
| --- | --- |
| Antes da admissão | Nenhum comando/efeito; retry da mesma entrega reconcilia o registro ou cria a intenção, sem enviar implicitamente. |
| Commit de intenção / antes do claim | Intenção conhecida não enviada no processo corrente; restart não a agenda automaticamente. |
| Claim persistido / antes ou durante rede | Sem prova local confiável de não envio, unknown; nenhum takeover. |
| Provedor aceitou / resposta perdida | Reconciliação por correlação suportada; sem ID/prova suficiente, investigação, nunca resend automático. |
| Aceitação conhecida / persistência falhou | unknown local até recuperar correlação; não afirmar falha remota. |
| Evento local perdido/duplicado | GET/observação autoritativa por generation converge ou nomeia lacuna; não repete efeito. |
| Permissão removida / sessão apagada | Reavaliar observação atual; preservar fatos de efeito e limites, sem forjar invocação. |
| Painel/app/backend fechado | Job já aceito pode continuar no Fabric; worker local só funciona enquanto serviço existe. Sem promessa de continuidade desktop fechado. |

Parar observação cancela assinatura/local read, não workload. `request-cancel` é outra ocorrência de comando autorizada contra o job exato. Cancellation requested só vira confirmed com confirmação remota; conclusão concorrente preserva o resultado real. Unsupported não vira “cancelado”. Desconectar interrompe uso local; agenda remota é recurso Fabric separado e continua até alteração explícita suportada.

Um plano que teve efeitos parciais conserva recibos por passo; próximos passos desconhecidos/bloqueados não rodam. Resumo partial é derivado dessa lista, não novo estado que apague Command/Job. Offline antes de submit fica explicitamente não enviado/bloqueado; reconexão não drena fila de mutações. Nenhum outcome de job reinicia automaticamente sessão IA.

## 4. Persistência e autoridade

Constraints propostas: unique ocorrência de passo; unique delivery key scoped; unique attempt por command; CAS de generation; FKs de contexto/revisão com exclusão governada, não cascade da sessão; índices de estados ativos por contexto. Tombstone mínimo preserva command ID/hash/estado durante a vida do contexto e continua rejeitando/reconciliando retry após limpar payload. Exclusão de contexto invalida todos os handles; servidor não aceita ID antigo desconhecido como nova criação.

Payload/recibo/proveniência seguem S13 e retenções Q03. Se armazenamento cifrado/durável falha, não permitir novo efeito; observação pode ficar limitada. Quotas de tombstones/recibos/observações são bloqueio a fixar/medir, não política de apagar chaves silenciosamente para liberar espaço. Clock/lease não são mecanismo de exatamente-uma-vez remoto.

Tracing redigido liga request Orchestra, context, change/revision/digest, command/step, connection/target e provider operation/job. Erro estruturado/unknown é consultável sem SQL literal/token/log bruto. A UI e o modelo recebem só refs/conteúdo permitido, não registro de Authority ou prova reutilizável como grant.

## 5. Prova e bloqueios

| ID | Caso futuro / assert | Negativo |
| --- | --- | --- |
| FS-RUN-001 | `admit.before-network`: transporte só é alcançado após commit durável. | Falha/ambiguidade de DB nunca é green. |
| FS-RUN-002 | `delivery.cross-call`: mesmo passo em abas/invocações diferentes retorna o mesmo command ID. | Chave igual com payload diferente rejeita; chave diferente não duplica ocorrência. |
| FS-RUN-003 | `claim.race`: dois clientes SQL concorrentes obtêm um único claim e uma invocação de transporte. | Expirar prazo/reiniciar não dá novo claim de submitting. |
| FS-RUN-004 | `retention.replay`: apagar payload conserva tombstone; contexto excluído recusa handle antigo. | Ausência de recibo não habilita recreate/resend. |
| FS-RUN-005 | `states.separate`: aceitação, LRO/job e check evoluem independentemente. | 202/success do job não é check passed. |
| FS-RUN-006 | `lost-response`: aceitação remota com resposta perdida fica unknown/reconcilia o mesmo ID. | Nenhum segundo workload pelo retry local. |
| FS-RUN-007 | `cancel.race`: conclusão concorrente não vira cancel confirmado por request local encerrado. | Stop-observation não envia cancel. |
| FS-RUN-008 | `reopen.same-job`: reabrir observa o ID original com autorização atual. | Sem histórico/API/retenção, unavailable/unknown; nunca reenviar. |
| FS-RUN-009 | `stream.loss`: remover eventos mantém convergência por GET/generation. | Duplicar eventos não reexecuta comando ou provider IA. |
| FS-RUN-010 | `delete-session`: chat apagado conserva fato Studio e observação autorizada independente. | Apagar provenance bloqueia observação; legado não é adotado por contexto falso. |
| FS-RUN-011 | `service.lifecycle`: job remoto continua reconhecido com backend/painel fechado. | Não alegar worker desktop ativo depois de parar. |
| FS-RUN-012 | `schedule.owner`: agenda remota identificada/alterada por contrato Fabric. | Desconectar não a desativa nem instala scheduler Studio. |
| FS-RUN-013 | `partial.receipts`: falha após primeiro efeito preserva lista de efeitos e bloqueia dependentes. | Resumo final não é sucesso global. |
| FS-RUN-014 | `poll.auth-loss`: expiração/revogação muda observação sem inventar falha do workload. | Nenhuma troca silenciosa de credencial. |
| FS-RUN-015 | `offline.no-drain`: reconexão não envia intenções bloqueadas sem ação explícita. | Approval válido não é licença de fila oculta. |
| FS-OPS-004 | `trace.correlate`: percorrer intenção→comando→provider ID sem segredo. | HTTP200 isolado não é a única observação. |

Bloqueios de freeze: SQL/DDL compilável, FULL/flush e restore fence demonstrados na integração Database; CAS concorrente real; integração de política/origem/ContextGuard; proteção/retention/quota; provas de crash e sessão apagada com stores reais, não testes que repetem a lógica. Bloqueios de ativação: suporte remoto a IDs/status/cancel/reconciliação por operação e ambiente autorizado. Nada executado aqui; não declarar exactly-once, atomicidade distribuída ou continuidade de worker como resultado entregue.
