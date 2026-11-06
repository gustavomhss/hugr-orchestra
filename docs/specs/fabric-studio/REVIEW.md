# Fabric Studio — cold review adversarial

## Estado

**Veredito consolidado: APPROVE para derivar specs, com correções P2 registradas. Não aprova implementação ou lançamento.**

Revisão documental solicitada pelo proprietário em 2026-11-04. Não é revisão de implementação, pentest, qualificação de tenant nem aprovação de PR. O desenho fica congelado durante a revisão; correções não são aplicadas como parte deste pedido.

## Entrada congelada

Branch: `fabric-workbench`. Baseline de código: `9fcb899d50867c1ddc3f25d8345ac9fd8009d788`.
Snapshot capturado em `2026-11-04T21:03:44.145276+00:00`.

| Documento | SHA-256 |
| --- | --- |
| README.md | `28a2cba2676afcb4eee1fed7ae6a28a0e69c3e1350fd99ec9d3fbda40e7ede49` |
| DESIGN.md | `37ce7f0f352068af88ff3db16a890a0bac45770eab97a3c6f8f8f7c68f6aefb9` |
| COVERAGE.md | `9e506c360bfb845b14613570a2ffd45a36bc15402b0c7ca7dd7a329061f202d5` |
| TEMPLATES.md | `2bdc3a0ced33be84abf69010b798f1840298b1a2525bc7ce4138689f33db1ae0` |

Referências de linha nos achados apontam a essas revisões. Os arquivos eram documentos novos ainda não commitados; o snapshot/hash identifica a entrada de forma independente do HEAD.

## Método e independência

- Revisores novos, sem reutilizar os agentes de discovery/research.
- Sem conversa do autor, transcritos anteriores ou `RESEARCH.md`, que contém conclusões do autor e da rodada anterior.
- Evidência permitida: documentos congelados, código no baseline e fontes oficiais consultadas independentemente.
- Worktree isolado por revisor; sem edições no desenho, código, credenciais ou tenant.
- Divisão por responsabilidade e trechos-alvo, com leitura contextual limitada para testar consistência.
- Cada finding precisa de cenário concreto, arquivo/linha, evidência, impacto e correção delimitada. Não há quota de problemas.
- Questão conscientemente bloqueada ou detalhe alocado a uma spec não é automaticamente defeito. O revisor deve explicar quando falta uma decisão arquitetural indispensável.
- O lead verifica achados e pode aceitar, reclassificar ou rejeitar, com justificativa; não reproduz um veredito por confiança no agente.
- Relay de acompanhamento foi armado; enforcement de SubagentStop não foi comprovado e não é alegado.

## Frentes de revisão

| Frente | Escopo-alvo | Estado |
| --- | --- | --- |
| UX | README; produto/modelo mental/entrada; declaração e composição | APPROVE para derivar specs, sem finding substanciado no escopo |
| Segurança | Invariantes; autoridade, privacidade, descoberta; aprovação; persistência/IA | APPROVE documental, sem finding substanciado no escopo |
| Fabric | Jornadas, encaixe, catálogo; cobertura e templates; suporte documentado | APPROVE para o desenho proposto, com FAB-01/FAB-02 como P2 de cobertura |
| Runtime | Consultas/observação; jobs/validação; operação, aceitação, roadmap e specs | APPROVE para derivar specs, com RT-01/RT-02 como P2 de fechamento de spec |

## Severidade e veredito

- **P0:** contradição fundamental que leva diretamente a perda de dados/exposição grave ou torna a proposta inviável nas condições afirmadas.
- **P1:** decisão/invariante ausente ou inconsistente que pode produzir specs incompatíveis/inseguras ou falhar numa jornada central.
- **P2:** ambiguidade, cobertura/clareza ou requisito delimitado que precisa ser corrigido/explicitado, sem invalidar a arquitetura inteira.
- **DESIGN:** corrigir o desenho antes de usá-lo como base normativa das specs afetadas.
- **SPEC:** refinamento que a spec proprietária pode resolver sem contradizer a direção atual.

Vereditos: APPROVE, FIX-FIRST, REJECT ou ESCALATE. O alvo é prontidão para derivar specs, não alegação de que o produto já está pronto para implementar ou lançar.

## Achados e avaliação do lead

### RT-01 — P2 / SPEC — Identidade do comando e direito exclusivo de envio

**Referência:** `DESIGN.md:694–708`; specs proprietárias S08/S09.

**Cenário:** a UI perde a resposta e repete o POST, ou o mesmo comando aprovado é submetido em outra invocação do agente. Uma chave ligada apenas à invocação pode admitir duas intenções. Mesmo com uma única intenção, dois dispatchers podem enviar o efeito remoto se não houver claim exclusivo.

**Evidência conferida pelo lead:** `packages/core/src/capability/job/index.ts:240–268` deriva a chave de criação de sessão, agente, mensagem, call ID, operação e creation key. Nova invocação não é um retry idêntico desse mecanismo. `operator/request.ts:48–94` oferece deduplicação por principal/chave e payload/target, mas seu callback é exclusivamente SQL (`75–76`), não uma transação envolvendo HTTP externo. O job store usa atualização por geração (`job/index.ts:181–221`), sem que isso sozinho especifique um dispatcher Fabric.

**Avaliação:** aceito como requisito de fechamento de S08/S09, não contradição fundacional do desenho. O desenho já proíbe retry cego e não diz que os serviços existentes implementam o mecanismo completo.

**Fechamento exigido:** identidade estável de comando/passo, conflito em retry com conteúdo diferente, claim atômico de `intent → submitting`, prazo/tombstone de deduplicação, e tratamento de queda durante envio. Estado de envio ambíguo não é elegível a redispatch automático. Admitir intenção local e enviar ao provedor são fases distintas.

### RT-02 — P2 / SPEC — Retenção da proveniência quando a sessão é apagada

**Referência:** `DESIGN.md:702–716,817`; specs proprietárias S09/S13, em articulação com S02/S11.

**Cenário:** agente inicia job remoto e a sessão de origem é excluída antes de terminar. O espaço salvo e o ID remoto continuam existindo, mas o caminho de observação herdado exige uma sessão/mensagem que já não existe.

**Evidência conferida pelo lead:** `packages/core/src/capability/job/index.ts:129–166` verifica a sessão, a mensagem/tool part e a lineage do produtor. `packages/core/src/session/sql.ts:133–140` apaga mensagens por cascade com a sessão; `capability/sql.ts:107–110` faz o mesmo com provas de child calls. O job conserva owner/invocation em JSON (`capability/sql.ts:89–104`), o que não recria as provas apagadas.

**Avaliação:** aceito como fechamento de retenção/proveniência, não uma falha operacional demonstrada do Studio, que não foi implementado. A10 já permite indisponibilidade quando autorização/retenção impede reconciliação.

**Fechamento exigido:** decidir entre reter a prova enquanto necessária ou criar observação Studio separadamente autorizada, com proveniência durável independente da retenção do chat. Especificar exclusão, reautorização, tombstones e estado indisponível honesto; nunca fabricar `Tool.Context` ou herdar autoridade de operador silenciosamente.

### Avaliações sem finding substanciado

- **UX:** o revisor tentou caminhos de execução por binding/mount, perda de rascunho ao mover ferramenta, conflito de propriedade das preferências e obrigatoriedade de IA/wizard. O desenho separa essas responsabilidades; os contratos de wire e comportamento concreto continuam para S04–S07.
- **Segurança:** o revisor tentou laundering de aprovação de agente para operador, uso de service principal para emprestar privilégios, confiança em callbacks/endpoints e vazamento via cache/modelo/template. Não substanciou contradição no desenho. Q01/Q03/Q04/Q07/Q10/Q11/Q13 continuam bloqueando o congelamento das respectivas specs.
- O lead conferiu os anchors de política/invocação, request frame de operador e middleware: `capability/policy.ts`, `capability/operator/index.ts:99–138` e `packages/server/src/middleware/capability-authorization.ts:26–47`. Eles não constituem autenticação multiusuário nem aprovação durável de conteúdo prontas, e o desenho não deve ser lido assim.

### FAB-01 — P2 / DESIGN — Distribuição por Power BI apps e audiences não está explicitamente tratada

**Referência:** `COVERAGE.md:40–41,50,52,58`; `TEMPLATES.md:35,38–41,57`. Impacta T14/T17/T18/T20.

**Cenário:** relatório é alterado e validado no workspace, mas os consumidores do workspace app continuam recebendo o conteúdo publicado anterior. Revisar permissões do workspace também pode não explicar o acesso por audience do app.

**Evidência conferida pelo lead:** a matriz nomeia reports/dashboards/paginated reports em F16 e Fabric Apps em F33. Não dá disposição explícita aos **Power BI workspace apps, org apps e audiences**, que não são sinônimos de Fabric Apps. A [documentação de publicação](https://learn.microsoft.com/en-us/power-bi/collaborate-share/service-create-distribute-apps) distingue esses produtos e afirma: “your changes aren't live in the app until you publish again”. Também informa que múltiplas audiences não são plenamente suportadas por deployment pipelines e exigem gestão de visibilidade.

**Avaliação:** aceito como correção não bloqueante de cobertura do desenho. A linguagem de validação com escopo limitado evita transformá-lo num claim de publicação universal, mas a jornada de consumidor está incompleta no inventário.

**Correção mínima proposta, não aplicada:** nomear essas formas de distribuição no mapa BI/lifecycle/acesso, vinculando templates ao check da versão que o consumidor recebe ou a handoff oficial explícito. Não exige prometer publish automático. Considerar também que atualizar app não remove necessariamente grants diretos já concedidos ao modelo.

### FAB-02 — P2 / DESIGN — Industry Solutions não tem disposição nomeada

**Referência:** `COVERAGE.md:5–9,24–58`, especialmente F33.

**Cenário:** ambiente herdado de healthcare/nonprofit expõe pipelines e lakehouses comuns, mas o Studio não conhece as premissas do pacote, o modelo setorial nem seu ciclo de implantação. Suportar os itens subjacentes não equivale a operar a solução empacotada corretamente.

**Evidência conferida pelo lead:** a [visão geral Fabric](https://learn.microsoft.com/en-us/fabric/fundamentals/microsoft-fabric-overview) lista **Industry Solutions** em seus componentes. A [documentação setorial](https://learn.microsoft.com/en-us/industry/industry-data-solutions-fabric) descreve healthcare e nonprofit, incluindo pipelines, analytics e modelo de dados pré-montados. A matriz dá tratamento a extensões/workloads de terceiros sem dar disposição a essa categoria Microsoft.

**Avaliação:** aceito como lacuna não bloqueante do inventário, não como exigência de criar outro workload ou editor especializado.

**Correção mínima proposta, não aplicada:** acrescentar entrada/subentrada com tratamento inicial de inventário/handoff e operações qualificadas nos recursos subjacentes, sem alegar compreensão de semântica setorial.

### Restrições confirmadas para levar às specs

Estas não são novos defeitos do desenho, mas impedem atalhos de implementação:

- **Métricas de capacidade:** a [documentação do Capacity Metrics app](https://learn.microsoft.com/en-us/fabric/enterprise/metrics-app), consultada pelo lead, diz que o modelo semântico só é suportado pelos relatórios fornecidos no próprio app e que consumo/uso/modificação externos não são suportados. T16 não pode ganhar um adaptador nativo simplesmente consultando esse modelo. Exige fonte suportada ou handoff explícito.
- **Default de Dataflow Execute:** a [referência da operação](https://learn.microsoft.com/en-us/rest/api/fabric/dataflow/background-jobs/run-on-demand-execute) marca `SkipApplyChanges` como default, enquanto o guia CI/CD descreve outra expectativa de publicação. O adaptador deve fixar a opção explicitamente e qualificá-la; não depender da omissão de parâmetro.
- **Retenção de jobs:** a referência remota e o registro local de job não substituem a proveniência exigida pelo contrato atual, conforme RT-02.

## Cenários negativos de aceitação

Os cenários abaixo são exigências para as specs; não foram executados:

1. **Rascunho e reorganização:** editar SQL, mover editor entre slots, mudar recipe e recolher para janela pequena. Preservar estado/foco e não disparar nova consulta. Excluir componente sujo exige decisão sobre seu rascunho.
2. **Seleção e resposta atrasada:** selecionar execução A, B e nenhuma seleção enquanto logs de A chegam atrasados. Não misturar contextos nem renovar ativação de consulta expirada.
3. **Pin e troca de conta:** recurso fixado não vira dado de outra conta/tenant por reutilização de cache. A nova identidade resolve novamente ou recebe bloqueio.
4. **Manifesto hostil versus capacidade indisponível:** ID desconhecido é erro estrutural; ferramenta conhecida negada é estado degradado. Nenhum dos dois inicia trabalho remoto ao importar.
5. **Negação de agente e aprovação humana:** aprovação não pode rerotear a invocação negada para autoridade de operador. Ação manual independente exige nova atribuição/autorização.
6. **Drift após aprovação:** mudar conteúdo, identidade ou destino, ou editar o recurso externamente, invalida as garantias correspondentes; proteção fraca não se apresenta como atomicidade.
7. **OAuth/URL maliciosa:** callback de outro contexto ou URL arbitrária de polling/artefato não recebe a credencial nem conclui a conexão errada.
8. **Retry e crash no envio:** repetir comando de outra aba/invocação e cair durante submissão não envia o efeito duas vezes por recuperação automática; ambiguidade permanece desconhecida.
9. **Exclusão da sessão produtora:** apagar sessão durante job remoto não leva a recriar prova de produtor; observação depende da política de retenção e de autorização válida.
10. **Cancelamento concorrente:** conclusão remota durante pedido de cancelamento não vira cancelamento confirmado. Desconectar Studio não desliga uma agenda Fabric existente.
11. **Stream perdido e histórico expirado:** retomar pelo store/observações autorizadas; não exigir replay do stream nem inventar estado remoto que o provedor já removeu.
12. **Comparação de dados incompatíveis:** totais obtidos sob filtros/identidades/watermarks diferentes produzem inconclusivo, não validação aprovada.
13. **Publicação para consumidor:** alterar conteúdo no workspace, observar o app/audience publicado e distinguir quem já recebeu a nova versão; handoff de publicação é explícito quando a rota não é suportada.
14. **Solução empacotada:** descobrir pacote setorial e operar um recurso subjacente sem alegar que a instalação/configuração/semântica do pacote completo foi qualificada.
15. **Métrica sem fonte suportada:** indisponibilidade da telemetria não autoriza consultar modelo semântico cujo uso externo não é suportado nem preencher painéis com estimativas inventadas.

## Veredito consolidado

**APPROVE para derivar specs a partir da direção arquitetural proposta.**

O lead aceita os quatro achados documentados: RT-01/RT-02 como fechamento de specs; FAB-01/FAB-02 como correções de cobertura do desenho. Nenhum deles foi considerado bloqueio fundamental da arquitetura nesta revisão. Não foi substanciado finding P0 ou P1 pelos revisores nos escopos atribuídos; isso não é prova de inexistência de vulnerabilidades ou lacunas fora desse alcance.

| Achado | Severidade | Tratamento | Situação |
| --- | --- | --- | --- |
| RT-01 | P2 | S08/S09: identidade estável, retry exato e claim exclusivo do envio | Registrado; não implementado |
| RT-02 | P2 | S09/S13: retenção/proveniência e observação após apagar sessão | Registrado; não implementado |
| FAB-01 | P2 | Desenho BI/lifecycle/access: workspace apps, org apps, audiences e consumidor publicado | Correção proposta; não aplicada |
| FAB-02 | P2 | Mapa de cobertura: Industry Solutions com disposição/handoff explícitos | Correção proposta; não aplicada |

Antes de congelar as specs afetadas, resolver também as questões Q já declaradas: OAuth/consentimento, política de dados, fronteira operador/agente, contratos de job e contexto sem Git, entre outras. O veredito não elimina esses bloqueios nem permite a um implementador escolher silenciosamente os defaults.

**O desenho revisado não foi alterado nesta rodada.** Só este relatório foi criado/atualizado. Corrigir e reavaliar os pontos aceitos é um trabalho posterior à revisão, não uma limpeza silenciosa para apresentar um resultado artificialmente verde.

## Limites da revisão

Sem entrevistas, execução de produto, chamadas autenticadas ao Fabric ou testes de implementação. Ausência de um finding não comprova segurança ou completude operacional. Fontes Microsoft podem mudar após esta data.

O particionamento dos trechos de `DESIGN.md` foi conferido sem lacuna/sobreposição de responsabilidade; um controle com intervalo intencionalmente removido foi detectado. Hashes do snapshot foram comparados aos arquivos primários. Essas verificações comprovam integridade/alcance da entrada, não correção das afirmações do desenho.

Os relatórios individuais persistidos externamente durante esta sessão são `fabric-cold-review-ux.md`, `fabric-cold-review-security.md`, `fabric-cold-review-platform.md` e `fabric-cold-review-runtime.md`, no diretório temporário aprovado do OpenCode. Os findings aceitos e suas evidências relevantes estão preservados neste relatório, sem depender da memória dos agentes.
