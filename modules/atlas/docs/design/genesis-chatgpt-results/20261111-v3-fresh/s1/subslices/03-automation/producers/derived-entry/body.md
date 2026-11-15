# Entrada local S1-03: automação, pesquisa e fronteiras do Core

**Chave:** s1.subslice03.entry · **L4** · **need:** entry · **escopo:** S1-03 / orchestra.s1.

## 1. Escopo e primeira decisão

Use esta entrada para localizar o contrato que decide uma mudança ou diagnóstico em Actions, Board, agendamento, research/toolkits e portas externas do Core. Comece pela pergunta, escolha uma rota da seção 2 e verifique a distinção pertinente na seção 3. Aprofunde pelo protocolo da seção 4 somente quando a decisão exigir mais evidência. Isso é orientação de consulta, sem leitura Atlas executada. [E01–E04]

A missão S1-03 tem 462 fontes atribuídas; o suporte recebido reconcilia as 104 antes associadas à entrada histórica. Esses números são escopos declarados pelos inputs, não um novo censo nem prova de compreensão integral. **s1.core.entry permanece histórica e não é substituída por esta chave local.** A união S1 de 2.236 paths pertence à seleção posterior de S1_COORDINATION. [E01, E05]

A base semântica desta derivação são quatro corpos exatos: s1.subslice03.support, s1.subslice03.boundary-flow, s1.subslice03.automation-maintenance e s1.subslice03.research-maintenance. A receita fixa seus hashes e gates do mesmo J1/J2; evidence.md os identifica integralmente. O gate recebido libera a autoria desta entrada, cujo aceite continua pendente. Fonte de produto referida: 1cde2ff7a71bcf7aecb5d030917b577165135d38. [E01]

**Mecanismo herdado** designa comportamento descrito nesses corpos, sem nova inspeção de código. **Orientação** prescreve consulta/verificação futura autorizada. **Inferência** é uma consequência delimitada; **lacuna** exige outra evidência. Teste citado continua expectativa quando não existe execução vinculada. Hash atual, fixture preparada e parecer semântico têm funções distintas. [E01, E08]

## 2. Rotas locais: o que ler para a pergunta

Os títulos abaixo são seções independentes dos corpos recebidos. A tabela permite escolher uma leitura delimitada; não exige carregar todos os destinos nem declara que estejam publicados no Atlas. [E02–E04]

| Pergunta que decide o trabalho | Artefato e seção de partida | O que o aprofundamento fornece |
| --- | --- | --- |
| Envio, confirmação, repetição, autoria ou schedule de CI | s1.subslice03.automation-maintenance — §3, “Actions: localizar a perda de prova antes de repetir” | Identidade, envio/ack/readback, efeito parcial e diferença GitHub/GitLab |
| Check verde, card, queue ou integração | Mesmo artefato — §4, “Board: separar verde, elegibilidade e integração” | Qual verde foi calculado, qual head/tree foi provado e onde falta integração observada |
| Atraso, DST, pausa, replay ou lease | Mesmo artefato — §5, “Scheduler: decidir pela fronteira de admissão” | Slot/claim/SessionInput; políticas distintas e limites de pausa/repeat |
| Pack listado, fetching ou ready incompatível | s1.subslice03.research-maintenance — M2, “Diagnosticar aquisição e prontidão” | Receita, dependências, floor/target, executável/shim e aquisição compartilhada |
| Vazio, stale, dirty ou source_unavailable | Mesmo artefato — M3, “Diagnosticar vazio, stale e dirty no índice” | Basis, freshness, cobertura e limite da conclusão negativa |
| Probe, fonte, quote, revisão ou publicação incerta | Mesmo artefato — M4, “Diagnosticar probes, custódia e publicação incerta” | Snapshot/runner, custódia/admissão, locator, binding, revisão e cobrança |
| Atlas, gate Relay, hook ou workflow | s1.subslice03.boundary-flow — §§2–6, escolhendo a porta | Ordem entre proposta, registro, publicação pinada, leitura de passo e settlement |
| MoveSession, Location ou RAG | Mesmo artefato — §7, “Movimentação e RAG: separar persistência de coordenação” | Efeitos em meios distintos, necessidade de coordenação do caller e limites do schema |
| Export, gerador, migração, história ou fixture | s1.subslice03.support — §§2–5, escolhendo a família | Superfície do package, produtores oficiais, tempo da evidência e partes simuladas |

Quando nem a família estiver clara, use §2 de automation-maintenance ou M1 de research-maintenance para nomear promessa, identidade e último fato sustentado. Para avaliar uma mudança, essas bases apontam respectivamente ao L3 de impacto e às suas cadeias L2/L1; são rotas a consultar em versões válidas, não novos corpos lidos nesta autoria. [E02–E04]

## 3. Distinções que permitem parar na leitura rasa

Estas conclusões são deliberadamente limitadas. Elas permitem reconhecer a evidência que falta e escolher o próximo destino; não autorizam uma operação nem certificam o ambiente atual. [E02–E04]

| Sinal disponível | Conclusão sustentada e fronteira que deve permanecer |
| --- | --- |
| Actions accepted, envio incerto ou falta de readback | Intenção, direito local de envio, ack e pós-condição são fatos distintos. Ausência de confirmação não prova ausência de efeito nem justifica, sozinha, reenvio. Proteção local não garante exatamente um efeito remoto. |
| Dispatch GitHub com 204 | No contrato descrito, não há run atribuído. A prova de workflow_dispatch na branch padrão é separada da fonte da ref selecionada; proximidade temporal não cria run ID. GitLab mantém identidades/endpoints próprios. |
| Board verde ou shipped | Scoped-green pode coexistir com pending/error; fail nos últimos resultados por kind/command produz scoped-red. Bundle tem contrato próprio: ausência de checks requeridos mantém pending; source:no-ci é a exceção para green sem checks. Integração exige identidade e leitura fresca. |
| ScheduledTask started, pausada ou lease vencida | Started indica SessionInput durável, não conclusão da Session. Pause/edit/remove não desfazem admissão anterior; lease não mede duração da Session. Políticas de DST, replay e janelas de revogação exigem §5 antes de decidir. |
| Pack listado ou marcador .complete | Prontidão depende da receita e das condições de runtime/layout/executável/shim. Waiter desistir não encerra necessariamente aquisição compartilhada. Retorno de prefetch não prova sucesso de todas as engines. |
| Consulta vazia, dirty ou stale | Preserve basis, cobertura, freshness e limites. Source_unavailable não é ausência; símbolos dirty atuais não tornam todas as relações atuais. Nenhum hit não prova inexistência de uso. |
| Probe, arquivo ou locator válido | Resultado de experimento, bytes em custódia, SourceAdmitted e publicação são etapas distintas. Validade de endereço não prova verdade; erro após efeito exige reconciliação por identidade antes de repetir. |
| Atlas staging, gate favorável ou currentstep | Staging não publica. Gate favorável sem registro pode ser unavailable/unrecorded. Currentstep é leitura sem avanço; settlement exige identidade, fence/checkpoint e disposition autenticada. |
| MoveSession ou schema RAG | Aplicar destino, publicar evento e limpar origem não são transação única; falha pode ocorrer após efeito. Essa folha não paralisa runner. Schema RAG não qualifica retrieval, embeddings ou busca. |

Para evidência de teste, consulte support §5: capability-schedule substitui SessionExecution; o caso não prova execução até conclusão. Fixtures de Actions/Board misturam partes reais e respostas controladas, e registros preparados de pass não são recibos observados. Cards, mock visual e qualificações históricas precisam manter data/candidato e exclusões; o vocabulário HTTP vigente deve ser resolvido com S1-04. [E04, E05]

## 4. Protocolo de consulta e aprofundamento

**Orientação para consumo autorizado pelas portas reais, ainda não executada.** Os limites de consultas/contexto pertencem à tarefa congelada de consumo; esta entrada não inventa um orçamento, altera esses limites ou torna obrigatório um ciclo profundo. [E06]

1. **Fixe a decisão.** Registre pergunta, objeto, versão/candidato e último fato observado; separe hipótese de observação. Para mudança, inclua contrato/receita/intenção afetados.
2. **Comece por ownership.index.** Localize a entrada S1-03 no scope pertinente e confira chave, versão selecionada, autoridade, validade, gaps e vínculos disponíveis. A existência desta referência Markdown não demonstra que o índice já a serve.
3. **Use ownership.read para a seção necessária.** Escolha o título de nível 2 desta entrada ou do destino na seção 2, conforme o mecanismo e os limites efetivamente expostos. Preserve a identidade retornada; não invente parâmetros ou recibos.
4. **Pare quando houver suporte suficiente.** Uma triagem que precisa apenas distinguir admissão de conclusão pode terminar rasa. Se faltar comportamento, impacto ou prova, leia a seção pertinente e siga o predecessor indicado que resolve essa lacuna; não carregue a família inteira por rotina.
5. **Trate a falta como falta.** Chave ausente, versão incompatível, conhecimento stale ou acesso indisponível não autorizam usar histórico como corrente ou buscar fonte arbitrária fora da permissão do consumidor. Registre HOLD da decisão dependente, evidência necessária e destino; conserve o trabalho independente válido.
6. **Registre o uso real.** No consumo efetivo, preserve consulta/resposta, versões, limites, decisão e abstenção. O roteiro e as conferências de bytes desta autoria não substituem esses recibos nem o julgamento independente.

O plano público conserva uso direto dos intermediários: A-PERMITTED/S-FAILURE consultam L1/L2 de automação; R-FAILURE, L1/L2 de research; A-IMPACT, os dois L3; A-VIOLATION, L1 de automação e seu L4; B-ABSTAIN, L1/L2 de fronteiras; ENTRY-NAV, esta entrada e support. São necessidades de consulta, sem respostas reservadas ou resultado executado. Não é necessário passar por esta entrada quando a tarefa já pede o intermediário exato. [E06]

## 5. Fronteiras externas e proposta para a união

A proposta recebida tem estado **PASS_LOCAL_PROPOSAL_NOT_SELECTED_FOR_UNION**: o par aceitou sua contribuição local, sem selecionar versões externas, roots ou a entrada global. Ela é um input de autoria desta entrada, não uma dependência de build de um artefato externo. Os destinos abaixo são navegação derivada da proposta pinada, sem inspeção dos handoffs ou aceites desses donos. [E05]

| Necessidade além do recorte local | Dono e keys concretas de navegação | Complemento ainda necessário |
| --- | --- | --- |
| Admissão, execução, retomada, contexto e movimentação | S1-01: s1.core.session-admission, s1.core.session-execution, s1.core.context, s1.core.project, s1.core.persistence | Versões aceitas que sustentem a garantia da Session/caller pertinente |
| Trust, tools, capability e extensões | S1-02: s1.core.security, s1.core.tools, s1.core.capability, s1.core.extensions | Autoridade do contrato e integração exigida, sem herdá-las da fixture ou do adapter |
| HTTP/SDK vigente e geração | S1-04: s1.api.schema-contracts, s1.api.session-contract, s1.api.server-edge, s1.api.codegen, s1.api.sdk-composition | Contrato selecionado e caminho oficial do gerador |
| Turnos/providers, plugin e persistência compartilhada | S1-05: s1.runtime.llm_turns.l1, s1.runtime.llm_providers.l1, s1.runtime.plugin.l1, s1.runtime.effect_sqlite.l1 | Adoção pelo host e bindings aceitos, além da existência da biblioteca |
| Garantias dos engines Relay, Atlas e runtime/distribuição | S3, S4 e S5, conforme a fronteira | O kit não fornece suas keys/versões; não preenchê-las por suposição |

Cada seleção externa desta tabela permanece **NOT_SELECTED**. S1_COORDINATION, em genesis-fresh-s1, recebe os cinco handoffs e escolhe corpos, receitas, pareceres, dependências necessárias e roots da união. ROOT integra posteriormente a campanha em genesis-fresh-final. Branch, contagem de paths ou PASS desta contribuição não substituem a seleção e as provas de composição. [E05]

## 6. Manter a entrada e encaminhar uma mudança

Os **quatro predecessores de build** são os corpos identificados na seção 1. As cadeias públicas preservam suporte → entrada; boundaries → boundary-flow → entrada; automation → automation-flow → automation-impact → automation-maintenance → entrada; e research → research-flow → research-impact → research-maintenance → entrada, com os prefixos exatos do plano. Se mudar um contrato resumido, reavalie o predecessor atingido e esta entrada na ordem dos gates. A granularidade é artefato; não se presume cache por seção. [E07]

Rotas de consulta não acrescentam arestas de build. Um delta restrito à automação não exige reconstruir research, support ou boundary-flow sem input/contrato compartilhado afetado. Mudança da proposta de navegação pode exigir atualizar as rotas que esta entrada usa como input, sem transformar seus destinos externos em dependências. Adição, remoção, intenção e receita relevantes também entram no impacto; observação indisponível exige HOLD, não conjunto afetado vazio. [E07]

Inputs/receita iguais e válidos permitem reúso; autoridade, validade ou gaps alterados podem exigir propagação com prosa igual. Mudança somente de recibo pede renovar vínculos; resultado validado visível ao consumidor que permanece igual pode interromper reconstrução posterior. Essas são regras públicas, não cache hits ou manutenção observados aqui. Aceite antigo/rollback não torna corrente o conhecimento inválido para inputs atuais. [E07]

Encaminhe pergunta/sintoma, identidade/candidato, observação versus hipótese, contrato/seção, afetados/independentes, evidência faltante e condição de desbloqueio. Produto, gerados e garantias externas seguem seus responsáveis; nomes de pessoas ou plantões não foram fornecidos. Para o caminho de manutenção, use automation-maintenance §§6–8 ou research-maintenance M5–M7. Releitura e atualização de conhecimento não autorizam reparo operacional. [E02, E03, E07]

## 7. Lacunas e estado desta entrega

O suporte conserva profundidades distintas de leitura para os 104 paths: exame estrutural de snapshot/archive e fixtures agrupadas não é revisão semântica integral de todo conteúdo interno. Readiness de pack não qualifica engine/plataforma; wrapper Core não concede garantias Relay/Atlas. As janelas de Board/scheduler, limites de concorrência/movimentação e autoridade da evidência continuam nas seções indicadas. [E02–E05]

Research-maintenance M6 preserva o relato Modelina de 266.885 bytes diante do limite S4 r3 de 256.000; **não foi reaferido** nesta entrada. A condição atual exige release/candidato e observação próprios. Preserve a fonte e encaminhe a limitação ao principal/S4; não reduza a população nem converta unavailable em absent. [E03]

**Estado: autoria local concluída para revisão pelo mesmo J1/J2, sem self-PASS.** Nenhum provider, teste de produto, reparo, operação Atlas, consumidor ou manutenção foi executado. Binding, publicação, leitura real, suficiência semântica desta entrada e seleção da união continuam estados separados. Não há DELIVERY_COMPLETE de S1-03, S1 ou da campanha. Tentativas físicas, tokens e cobrança não expostos permanecem UNKNOWN. [E08]
