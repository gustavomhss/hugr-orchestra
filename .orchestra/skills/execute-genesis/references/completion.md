# Contrato de conclusão integral por domínio

Aplicar à campanha `20261111-v1`, protocolo `parallel-v2`, epoch `20261111-v2-parallel`.
Este contrato rege quando S1–S5 podem encerrar sua entrega. Ler junto de [SKILL.md](../SKILL.md),
[campanha](campaign.md), [runtime](runtime.md), [juízo](judging.md) e [handoffs](handoffs.md).

## Obrigação de executar até entregar

Cada conversa é a orquestradora responsável de ponta a ponta, conforme [orchestration.md](orchestration.md).
Executar fila→despacho→coleta→verificação→juízo→correção→reavaliação→fechamento, sem delegar a responsabilidade final.
Recolher artefatos, hashes e decisões reais dos filhos; retorno de subagente ou tarefa delegada não equivale a entrega.
Manter principal + um produtor/consumidor + dois juízes persistentes nos quatro slots observados, trabalhando em ondas.
Registrar IDs reais de tarefas/agentes, pedidos, respostas e estados; não recriar identidades para esconder pendências.
Dez a vinte unidades ao longo da execução não significam vinte agentes simultâneos nem substituem cobertura.

Concluir todas as obrigações atribuídas ao domínio, não apenas o primeiro lote ou um checkpoint.
Continuar autonomamente o trabalho já autorizado, sem perguntar “posso continuar?” e sem devolver só um plano.
Preparação, proposta, patch não aplicado, fila, `READY_FOR_JUDGMENT` e PASS semântico isolado não são entrega completa.
Não encerrar por ter produzido um documento, recebido dois pareceres parciais ou consumido uma quota antiga de bootstrap.
Limites operacionais locais organizam lotes finitos; registrar seu sucessor autorizado e continuar a fila restante.
Não inventar um orçamento curto para transformar trabalho pendente em conclusão. Preservar limites reais e autoridade.
Parar refinamentos opcionais quando os critérios fixos estiverem satisfeitos; completude não exige melhorias sem obrigação.

## Escopo fechado e fila verificável

Antes da produção, registrar o inventário inteiro do domínio e uma fila finita de obrigações identificadas.
Cada tarefa informa ID, scope, camada, tipo, dono, entradas/versões, predecessores, critério e resultado exigido.
Usar estados explícitos: `PENDING`, `RUNNING`, `BLOCKED`, `READY_FOR_REVIEW`, `FIX_REQUIRED`, `DONE`.
Um item `DONE` deve apontar evidência executada e a decisão aplicável; texto planejado não liquida sua obrigação.
Desdobrar lotes grandes preservando o vínculo ao inventário completo e atualizar a fila antes de novas execuções.
Registrar mudanças justificadas de escopo; não excluir necessidade, arquivo ou caso para esvaziar artificialmente a fila.
Todo caminho da partição recebe disposição verificável, inclusive gerados, terceiros, binários e interfaces.
Manter `completion-checklist.json` no namespace da sessão, com versão, fontes, obrigações, evidências e pendências.
A checklist complementa os estados de transporte/aceite do handoff; não os renomeia nem fabrica aceitação.

## Disposição dos 50 critérios

Usar [criteria.json](criteria.json): GO-A1..7, GO-I1..8, AC-01..10, CC-1..7, SC-1..5, QS-1..6 e DOD-1..7.
Registrar os 50 IDs em cada sessão, sem omissões, com obrigação local, disposição global, evidências e dono.
Cada obrigação local recebe `PASS`, `FIX-FIRST`, `HOLD` ou `NOT_APPLICABLE` fundamentado no contrato.
Ambos os juízes devem examinar os critérios aplicáveis sobre a mesma versão e validar as exclusões propostas.
Separar a parte local de um critério da sua parte global: uma conclusão local não fecha a obrigação integrada.
`DEFERRED_TO_INTEGRATION` vale apenas para uma obrigação explicitamente atribuída a ROOT no registro vigente.
Nomear dependência, evidência local entregue e obrigação global exata; não usar essa disposição como categoria genérica.
Falta de execução, importer, CI, revisão ou consumidor local nunca vira `NOT_APPLICABLE` por conveniência.

## Checklist mínima obrigatória

1. Inventário completo reconciliado com a partição; necessidades, fronteiras, lacunas e cobertura sem itens esquecidos.
2. Todos os artefatos L1→L4 exigidos produzidos de verdade, cumulativos, com fontes, autoria, bytes e hashes preservados.
3. Predecessores e dependências aceitos na versão correta; nenhuma aprovação parcial libera uma dependência ausente.
4. Código estritamente necessário implementado pelo dono, aplicado ao candidato fixado e verificado pelos caminhos permitidos.
5. Dois juízes reais persistentes próprios, independentes de autoria, cobrindo todos os critérios aplicáveis do pacote exato.
6. Defeitos obrigatórios corrigidos; os mesmos juízes reavaliam deltas e vinculam o aceite à versão final, sem terceiro voto.
7. Importação, construção, indexação e leitura reais exigidas para o domínio, com binding, trust e recusas observados.
8. Consumidores independentes reais, tarefas/oracles fixos, consultas Atlas registradas e limites/isolamento demonstrados.
9. Casos locais obrigatórios de reúso, mudança, rebuild, recuperação, coerência, migração e preservação realmente executados.
10. Gates aplicáveis satisfeitos no candidato correspondente, com runs/recibos reais e política de testes respeitada.
11. Os 50 IDs com disposição e evidência; nenhuma pendência de obrigação própria escondida como trabalho global.
12. Ledger reconciliado com os eventos observáveis, incluindo produtores, dois juízes, correções e consumidores.
13. Reservas antigas, incertezas e uso não observável preservados; não converter `UNKNOWN` em zero nem apagar tentativas.
14. Artefatos, decisões e recibos persistidos; handoff selado na branch própria e conteúdo confirmado por leitura remota.

## Continuidade durante a execução

Depois de concluir um item, escolher o próximo item executável da fila; não encerrar automaticamente ao fim do lote.
Depois de `FIX-FIRST`, corrigir o defeito e voltar ao mesmo par; não entregar só o relatório que pede a correção.
Depois de um resultado `RUNNING`, usar o mecanismo de espera suportado com o ID real até obter o resultado ou falha real.
Aguardar em intervalos limitados, mantendo atualizações e respeitando o contrato da ferramenta; espera não é execução inventada.
Não tratar um retorno assíncrono ou uma demora isolada como bloqueio definitivo. Recuperar a resposta já emitida antes de repetir.
Em compactação de contexto, retomar a mesma fila, rosters, versões, reservas e recibos; compactação não conclui a tarefa.
Persistir checkpoints para continuidade sem apresentá-los como entrega. Não recriar juízes ou produtores incertos silenciosamente.
Se um item bloquear, marcar sua closure dependente e executar todos os itens independentes ainda disponíveis.
Não cancelar atividade de outra conversa. Não presumir memória, IDs, filesystem ou trabalho contínuo após terminar o turno.

## Auditoria de encerramento

Após os dois PASS do pacote final local, reler literalmente cada condição da checklist e cada obrigação da fila.
Confrontar decisões com os bytes, manifestos, código, entradas, consumidores e runs realmente usados; corrigir drift.
Procurar condições ainda não satisfeitas nos artefatos vigentes: `NOT_RUN`, `HOLD`, `FIX-FIRST`, TODO e promessa de execução.
Classificar cada ocorrência: histórico preservado, desconhecido permitido pelo contrato ou obrigação atual ainda pendente.
Não apagar a ocorrência para passar na auditoria. Executar o trabalho faltante e reavaliar os critérios afetados.
Confirmar que os dois juízes cobriram o conjunto final; PASS de corpo anterior, amostra ou resumo não substitui esse aceite.
Confirmar a publicação do handoff por leitura do commit imutável remoto e conferir os hashes, conforme [handoffs](handoffs.md).
Não inventar no arquivo o SHA ainda inexistente do próprio commit; usar o mecanismo de selagem do protocolo.
Encerrar a entrega somente quando todas as obrigações próprias estiverem satisfeitas e verificadas.

## Dependência externa e impossibilidade material

Antes de declarar bloqueio, esgotar as rotas disponíveis e já autorizadas que possam satisfazer aquela dependência.
Verificar ferramentas realmente expostas, recibos/candidatos já publicados, fontes fixadas e comandos permitidos.
Implementar correções locais necessárias quando isso estiver no escopo; aproveitar o candidato exato do dono de código compartilhado.
Não esperar ROOT ou uma liberação global para produzir, julgar, corrigir ou consumir o próprio domínio.
Um gate de CI obrigatório não pode ser trocado por teste local proibido, run inventado ou edição da guarda.
Capacidade, autorização ou resposta externa realmente ausente pode impedir conclusão; o prompt não cria essa capacidade.
Registrar operação e critério, erro/estado observado, tentativas e rotas exatas, evidências, dono externo e condição de desbloqueio.
Um plano não executado, apenas a existência de uma dependência ou um limite arbitrário de lote não demonstra impossibilidade.
Antes de devolver controle por impedimento material, fechar toda a fila independente, persistir resultados e confirmar o handoff.
Se ainda restar obrigação própria impossível de concluir nesta sessão, usar `completion_state: INCOMPLETE_BLOCKED`.
Nomear o que falta e por quê; isso é uma entrega incompleta, não PASS, `DONE` ou solicitação genérica de permissão.
Não prometer continuar em background. Quando houver retomada, ler o checkpoint e reabrir os itens desbloqueados.

## Fronteira com a integração de ROOT

ROOT integra os cinco domínios na conversa original e julga a união com seu próprio par independente.
Fluxos globais, compatibilidade da união e obrigações explicitamente globais ficam nesse escopo, após os handoffs.
Essa fronteira não transfere a ROOT produção local, correções, consumidores, provas ou gates atribuídos à fatia.
Dependência real de código de S4 pode reter uma prova local; não autoriza rotulá-la como integração para declarar completude.
Manter a evidência local pronta e continuar tudo que independe da dependência; o item local fica pendente até sua execução.

## Estado final e resposta

Usar `completion_state: DELIVERY_COMPLETE` somente depois da auditoria integral, com zero obrigações próprias abertas.
Esse estado descreve a entrega do domínio; não significa aceite global, aceite humano, landing ou ativação em produção.
Reservar `IN_PROGRESS` para execução em curso e `INCOMPLETE_BLOCKED` para impedimento material demonstrado.
A resposta final deve trazer commit/handoff verificável, cobertura, decisões dos dois juízes, execução/consumo, gates e ledger.
Declarar explicitamente as obrigações globais transferidas a ROOT e qualquer limitação permitida pelo contrato.
Se incompleta, listar todas as obrigações próprias abertas e suas provas de bloqueio; não chamar o resultado de concluído.
Não perguntar se deve continuar trabalho já autorizado. Continuar enquanto houver obrigação própria executável.
