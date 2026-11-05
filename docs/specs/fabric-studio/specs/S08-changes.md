# S08 — mudanças, aprovação e aplicação

**Estado:** proposta técnica; não congelada para implementação.  
**Requisitos proprietários:** FS-CHG-001–011; FS-INT-001.

## 1. Responsabilidade e integrações

Aplica Q04/Q07, [C04–C06](./CONTRACTS.md) e autoridade de S02. Produz revisão imutável que S09 pode admitir/despachar, com critérios S10. Não executa por salvar layout, editar código local, aprovar resumo ou receber texto de modelo. Domínio é compartilhado por UI e agente; origem/autorizações continuam distintas.

## 2. Contrato

### Conteúdo revisável e identidade

Change tem ID, objetivo, origem/proponente e revisões append-only. Cada revisão fixa: recursos resolvidos, identidade Microsoft, conteúdo/bytes exatos (referência cifrada + hash), parâmetros tipados, CapabilityRef, baseline remoto, força de proteção, efeitos/riscos, budget, DAG de passos com IDs estáveis, validações e recuperação por passo. Datas, policy/context/connection generations e versão do contrato integram o conteúdo relevante. Payload não é regenerado por IA após aprovação.

Representação canônica usa JCS/RFC 8785 e SHA-256 de C04, sem omitir campos de efeito ou substituir um blob mutável pelo mesmo nome. ContentRef referencia versão imutável cujo hash é verificado antes de submit. Argumento `expectedRevision` é obrigatório ao revisar; conflito retorna a revisão atual permitida, não last-writer-wins. Rejeitar floats não finitos, conteúdo excedente, DAG cíclico, referência estrangeira e passo não catalogado.

Regra ambígua conserva draft `needs-clarification`: status a excluir, vigência, fonte de verdade, histórico, consumidores e condição de reconciliação precisam de resposta explícita. Não sugerir apagar origem para resolver receita por conveniência. Cada alteração de regra/conteúdo/destino cria revisão nova e invalida a aprovação pertinente.

### Aprovação e executor

Approval registra revisionDigest, ator humano, origem proponente, executor/origem permitidos, destinos/identidades/efeitos, validade e generations. A pessoa confirma nos controles confiáveis do app, com diff técnico disponível, limite de dados/custo e risco residual. A prova de compreensão é H de S14, não a existência do clique.

Uma aprovação é utilizável apenas sob o grant atual aplicável; não é bearer transferível. Aprovação de proposta de agente não muda agente para operador. `approve` não inicia submit. No perfil inicial, cada passo habilitado é despachado por ação deliberada sob origem atual; sequência de comandos não se torna automação desassistida depois que a invocação/request terminou. Um passo já aceito no Fabric continua observável independentemente do painel. Retomar os próximos passos requer nova ação válida, sem replay dos anteriores.

Produção e teste têm target mappings e approvals diferentes, mesmo se bytes iguais. Uma revisão de teste não é transportada para produção por mudar label; preparar revisão do destino real, baseline próprio e novo digest/decisão. A UI pode reutilizar a intenção, não a autorização.

Quando usar ambientes mapeados, fixar EnvironmentMapRef e os pares de ResourceRef resolvidos de C08 no digest. Mapa revisado/retargetado exige nova resolução/revisão antes de aplicar; uma classificação sandbox nova não torna seguro usar o approval de outra versão. A prova de comparabilidade para checks é de S10, não implicada pelo par de destinos.

### Preflight e proteção contra drift

Ordem antes de cada efeito: resolver contexto e origem atual → confirmar revisão/hash/conteúdo → validar aprovação/validade/gerações → política e capability readiness → ler baseline remoto quando necessário → verificar mecanismo de concorrência → admitir/claim S09 → checar revogação conhecida imediatamente antes do envio. Revogação após o ponto de envio pode exigir cancelamento/reconciliação, não promete recolher efeito já aceito.

| Proteção | Política de aplicação |
| --- | --- |
| Condicional remoto forte, qualificado | Pode habilitar produção/prod-like se todas as outras condições permitirem; conflito de versão bloqueia antes de aplicar. |
| Engine transacional/condicional | Só é forte se a comparação da precondição e a alteração forem atômicas contra escritores externos no engine real. BEGIN/COMMIT por si só não basta. |
| Hash/readback/preflight/lock local | Detecção, não CAS remoto; write de produção permanece bloqueado. |
| Fraca em sandbox server-side | Apenas definição reversível e efeito limitado, baseline fresco, confirmação por passo, readback e recibo; excluir destruição/grants/dados sensíveis/efeito externo não delimitado. |
| Ausente, desconhecida ou não qualificada | `unverified`/blocked, com motivo; handoff não conta como execução do Studio. |

Sandbox é atributo do target binding governado, não string no manifesto. A rota forte de SQL continua um gate real: nenhuma transação/driver ainda foi qualificada. Se não existir rota adequada, J02/T20 e o lançamento integrado ficam bloqueados, não se relaxa Q07.

## 3. Estados e falhas

| Revisão/etapa | Transição / consequência |
| --- | --- |
| `draft → needs-clarification → reviewable` | Somente com conteúdo/contexto/critério suficientes; sem efeito remoto. |
| `reviewable → approved/rejected` | Decisão exata registrada; approved ainda não é admitido/executado. |
| Mudança relevante / expiração / drift | Aprovação torna-se inutilizável; exige revisão/decisão pertinente, não atualiza approval em lugar. |
| Preflight incompatível | Passo bloqueado, diagnóstico; nenhum claim de envio se condição já falha. |
| Dependência falha/unknown | Dependentes não são despachados. Já aplicados conservam seus recibos. |
| Alteração local de definição | Permanece rascunho; salvar local/recuperar não escreve no Fabric. Aplicar remoto é ação própria. |

São estados de revisão/progressão de plano; DispatchState, WorkloadState e CheckState permanecem separados em S09/S10. O resumo de plano é derivado dos passos: concluído no escopo só quando os efeitos necessários e os checks requeridos têm evidência suficiente. Caso parcial/unknown permanece expresso, sem status único enganoso.

Recuperação/compensação prepara **nova mudança**, com conteúdo, risco e aprovação próprios. Restaurar definição não restaura dados, mensagens, grants já usados ou histórico removido. Não haver rollback remoto não torna replay integral uma recuperação permitida.

## 4. Persistência e autoridade

Proposta de entidades privadas: `fabric_change`, `fabric_change_revision`, `fabric_approval`, `fabric_step`. Todas com context ID/owner; revisão e step content imutáveis; unique change/revision e step ID; approval vinculado ao digest, nunca à revisão “mais recente”. Payload cifrado S13/C07 antes de admitir efeito; sem proteção/persistência adequada, mutação permanece desabilitada.

Approval pode ser consultado como fato histórico após revogação, sujeito à política de dados; nunca se transforma em permissão atual. Não armazenar Authority/Tool.Context ou token. No request de agente, policy/deny floor da invocação real permanece obrigatório; no manual, operador atual é verificado. Retornar erro esperado não elimina interrupção/defeito nem transforma uma falha de DB em sucesso remoto.

## 5. Prova e bloqueios

| ID | Caso futuro / assert | Negativo |
| --- | --- | --- |
| FS-CHG-001 | `change.clarify`: regra indefinida mantém draft e pede os campos relevantes. | Modelo não escolhe status/período nem apaga origem. |
| FS-CHG-002 | `change.review`: UI e API disponibilizam bytes/efeitos/alvos/critérios exatos. | Resumo ocultando conteúdo não autoriza. |
| FS-CHG-003 | `change.digest`: payload enviado tem hash da revisão aprovada. | Regeneração posterior ou blob mutável falha. |
| FS-CHG-004 | `approval.binding`: alterar cada dimensão relevante exige nova decisão. | Revisão/identidade/destino diferente não usa aprovação antiga. |
| FS-CHG-005 | `preflight.current`: revogação conhecida, approval expirado e baseline novo impedem envio. | Botão habilitado ou histórico não concede acesso. |
| FS-CHG-006 | `promotion.separate`: destino prod-like precisa baseline/digest/approval próprios. | Trocar alias não promove consentimento. |
| FS-CHG-007 | `drift.strength`: escritor externo causa conflito protegido na rota forte. | Remover condicional faz contraprova detectar lost update; hash local não passa como prova equivalente. |
| FS-CHG-008 | `plan.closed-scope`: passos/args enviados pertencem à revisão. | Acrescentar reparo/grant por iniciativa do modelo é rejeitado. |
| FS-CHG-009 | `plan.partial`: falhar pré-requisito deixa dependentes não executados. | Etapas concluídas não desaparecem nem são repetidas. |
| FS-CHG-010 | `compensation.new-change`: recuperação informa alcance e exige revisão própria. | Voltar código não aparece como rollback de dados/efeitos externos. |
| FS-CHG-011 | `draft.no-remote-save`: digitar/autosave/recuperar não envia write. | Permissão write válida não habilita autosave remoto implícito. |
| FS-INT-001 | `origins.same-domain`: manual/IA usam o mesmo plano/preflight/receipt com atribuições diferentes. | Caminho de UI não omite guard da leaf/domínio. |

Bloqueios de freeze: codecs de revisão/canonicalização compiláveis; SQL de constraints e integração de Authority/Permission; prova de imutabilidade/conflitos; rota remota forte e matriz de riscos qualificada. Casos não executados. Não inventar precondição HTTP ou garantia transacional para fechar o documento.
