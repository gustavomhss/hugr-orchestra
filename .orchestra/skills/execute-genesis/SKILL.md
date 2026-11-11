---
name: execute-genesis
description: Executar o Genesis do Orchestra inteiro em cinco sessões paralelas por domínio, cada uma com produção cumulativa L1–L4, dois juízes nativos persistentes, correções e consumo; migrar o trabalho existente preservando evidências e integrar a união no final. Usar ao iniciar ou retomar uma das cinco fatias, julgar seus resultados ou fechar a campanha.
---

# Genesis em cinco domínios paralelos

## Contrato ativo: parallel-v2

Trabalhar em `gustavomhss/hugr-orchestra`, campanha lógica `20261111-v1`,
`protocol_epoch: parallel-v2`, `results_epoch: 20261111-v2-parallel`.
O baseline de investigação continua `1cde2ff7a71bcf7aecb5d030917b577165135d38`.
Carregar esta skill no commit imutável do protocolo indicado no prompt.
Separar fonte, protocolo, HEAD da branch, candidato executado e revisão de artefatos.

O proprietário pediu o Orchestra inteiro, cinco sessões aqui no ChatGPT, subagentes,
juízes e correções. A divisão anterior por fases criou espera entre sessões. Este
contrato a substitui por **cinco domínios verticais que começam imediatamente**.
Substitui também a liberação inicial de S1, o julgamento local centralizado em S5 e
as quotas de preparação que impediam produzir ou iniciar os dois juízes.

A substituição muda coordenação, não evidência nem história. Não apaga alocações,
tentativas, reservas, incertezas, resultados ou decisões anteriores. Não transforma
uma preparação ou aprovação do piloto em aceitação do novo escopo.

## Carregar os contratos

Ler [campanha](references/campaign.md), [handoffs](references/handoffs.md),
[julgamento](references/judging.md), [runtime](references/runtime.md) e sua fatia.
Aplicar [orquestração](references/orchestration.md) e a
[condição de encerramento](references/completion.md) em todas as sessões.
Se já existe trabalho, ler também [migração](references/migration.md).
A [partição exata](references/parallel-partition.json) define o proprietário de cada
entrada Git; o [registro de critérios](references/criteria.json) atribui todos os 50 IDs.

| Sessão | Domínio de produção e julgamento | Contrato |
| --- | --- | --- |
| S1 | Core, sessões, modelos e contratos de API | [Fatia 1](references/fatia-1.md) |
| S2 | Interfaces: desktop, web, app-shell, UI e TUI | [Fatia 2](references/fatia-2.md) |
| S3 | Maestro, Relay, especialistas e integrações | [Fatia 3](references/fatia-3.md) |
| S4 | Atlas, continuidade, RAG e Genesis | [Fatia 4](references/fatia-4.md) |
| S5 | CLI, Omni, distribuição, infraestrutura e contratos transversais | [Fatia 5](references/fatia-5.md) |

ROOT, na conversa original, assume a integração final por decisão explícita do dono.
S5 produz e entrega seu domínio, como as demais. Nenhuma sessão aprova o início de
outra. Os nomes dos cinco braços do `atlas mine` legado não definem esta divisão.

Ler `AGENTS.md`, as instruções mais específicas dos arquivos envolvidos, as skills
`atlas-usage`, `atlas-maintenance`, `atlas-ownership` e as fontes normativas apontadas
pela campanha. Preservar axiomas, invariantes, qualidade, aceitação e DoD dessas fontes.
As restrições históricas de piloto/topologia não revogam a autorização atual do dono.

## Iniciar ou continuar sem perder trabalho

1. Manter seu número e branch `genesis-chatgpt-sN`. Se existe, reler HEAD, handoff e
   ledger atuais antes de escrever. Não resetar, substituir, apagar ou repetir trabalho
   só porque a sessão recebeu um protocolo novo. Se é uma sessão nova, criar a branch
   a partir do commit do protocolo. Usar lease de HEAD nas atualizações remotas.
2. Registrar a migração, quando aplicável, no novo namespace
   `modules/atlas/docs/design/genesis-chatgpt-results/20261111-v2-parallel/sN/`.
   Referenciar evidências antigas por commit/caminho/hash e decidir seu reúso exato.
3. Conferir capacidades reais: GitHub, execução isolada, código, dependências, leitores
   e slots. Usar o conector disponível; ausência de `gh` não é ausência de GitHub.
   Não iniciar login, extrair credenciais nem supor acesso à máquina do dono.
4. Resolver os caminhos do seu domínio pela partição já congelada. Ela cobre as
   14.442 entradas do baseline. Cada sessão refina suas próprias necessidades e
   artefatos; não espera um inventário semântico global de S1.
5. Planejar um lote finito que comporte produção, os dois juízes, correções e consumo.
   Registrar os limites lógicos localmente com continuidade econômica da campanha.
   Não esperar outra sessão aprovar ou redistribuir quotas de preparação.
6. Executar todos os lotes produtivos da própria fatia. Registrar o que ocorreu e
   continuar até a checklist integral ou um impedimento material demonstrado. Não encerrar somente com
   plano, fila, mapas de propostas ou um handoff que repete o bloqueio antigo.

Cada sessão principal é a **orquestradora responsável por entregar toda a fatia**.
Decompor trabalho em tarefas verificáveis e delegar a subagentes produtores reais;
recolher os resultados, conferir evidências, despachar os dois juízes independentes,
encaminhar correções e reavaliar. Delegar não transfere a responsabilidade de fechar
a fila. Aguardar agentes em andamento e continuar autonomamente sem pedir
confirmação para etapas já autorizadas. Checkpoints não são respostas finais.

## Executar cada domínio de ponta a ponta

1. Classificar todos os caminhos atribuídos e congelar necessidades, fontes,
   artefatos obrigatórios, lacunas, casos e critérios. Gerados/terceiros/binários podem
   remeter a geradores e fronteiras justificadas; não desaparecem da contabilidade.
2. Construir uma base verificável a partir das fontes realmente lidas. Separar
   comportamento observado, intenção autorizada, interpretação e lacuna. Preparar
   o oracle independente e reter suas respostas fora dos produtores.
3. Reutilizar apenas conhecimento compatível em corpo, autoridade, fonte, receita,
   dependências e contrato. Produzir as partes faltantes com subagentes nativos reais,
   guardando pedidos, respostas visíveis e identidades. Não publicar raciocínio privado.
4. Construir cumulativamente L1 → L2 → L3 → L4 no **escopo finito do próprio domínio**.
   Cada camada completa e exigida recebe revisão do par local antes de sustentar a
   seguinte. Lotes menores são possíveis; uma aprovação parcial não libera itens
   que dependem do restante. Não exigir quatro documentos ou quatro chamadas por arquivo.
5. Ler qualquer fonte de outro domínio no mesmo pin quando necessária para uma
   fronteira. Registrar essa dependência; não aguardar um artefato irmão só para
   descobrir código já disponível. Conhecimento externo não revisado não vira
   automaticamente um resultado aceito. Lacuna crítica retém apenas seus dependentes.
6. Executar consumidores e os controles aplicáveis pelos pontos de entrada reais.
   Se o importer, reader ou CI ainda falta, continuar produção e revisão semântica
   independentes, deixando importação, consumo Atlas e gates no estado correto.
   A revisão de um documento não prova AC-04 nem leitura governada.
7. Fechar cada critério com evidência e decisão, corrigir defeitos concretos e
   reapresentar o delta aos mesmos juízes. Não criar refinamento opcional interminável.

S4 é o proprietário do trabalho mínimo necessário para generalizar o adapter/importer
Atlas e aproveitar as propostas anteriores de produção, rebuild, recuperação e host.
O `ownership-pilot.ts` existente não é um importer genérico. S4 pode implementar seu
candidato isolado sem aguardar liberação de outra conversa; ROOT valida a união final. Outras fatias
podem executar com esse candidato exato quando disponível, preservando o pin usado.

Mudanças de produto estritamente necessárias ao Genesis seguem o proprietário do
caminho, as instruções locais e a disciplina de candidato isolado. Alterações de
contratos compartilhados vão ao proprietário com proposta concreta. O mapa de
extração não autoriza reescrever indiscriminadamente módulos ou o store servido.

## Dois juízes em cada sessão

Usar um par local com identidades `parallel-v2/SN/J1` e `parallel-v2/SN/J2`, em contextos
independentes de autoria, criados com `fork_turns: none`. Ambos avaliam todos os critérios
obrigatórios pertinentes sobre a mesma versão exata. Manter os IDs na sessão para
revisões de deltas; não recriar juízes por tarefa nem buscar um terceiro voto.

Com quatro slots, usar principal + um produtor + dois juízes. Dimensionar outras
unidades em ondas. O kit define dez papéis de juiz nas cinco conversas; a concorrência
efetiva depende do host de cada uma. Não prometer 10–20 subagentes simultâneos aqui.
Contextos independentes não provam diversidade de modelo/fornecedor.

ROOT cria um par independente próprio `integration/J1` e `integration/J2` para
o pacote final, sem autoria do material avaliado. Cinco aceites locais não são aceite global.
Transportar evidência por Git; IDs de agentes pertencem à conversa que os criou.

## Economia e dependências verdadeiras

Antes de cada lote, registrar tarefas, máximo de despachos lógicos, paralelismo e
reserva para juízes/correções/consumidores. Consolidar os ledgers locais por identidade
na integração. Revisões de plano são finitas, explícitas e prospectivas; preservar
uso e reservas v1, incluindo tentativas `UNCERTAIN` ou em andamento.

As quotas pequenas de bootstrap eram coordenação desta skill e são substituídas
pelos planos locais. Não exigem nova autorização de S1. Isso não concede chamadas
pagas externas nem apaga a exigência econômica do produto. Tokens, tentativas
físicas, cobrança e garantias não expostos pelo host continuam `UNKNOWN`; limites
de tarefas não demonstram admissão financeira AC-08 ou custo zero.

Investigar uma resposta incerta antes de repetir. Não cancelar atividade de outra
conversa, reaproveitar um ID conflitante ou zerar o orçamento ao trocar de epoch.
Usar apenas capacidades nativas autorizadas; não chamar provedores pagos externos
nem mudar modelo silenciosamente.

Produção nativa não exige workflow. Os testes do produto continuam sujeitos ao
`AGENTS.md`: GitHub Actions, salvo autorização explícita do dono para execução local.
Não contornar a guarda de testes. Build, leitura, produção e inspeção isolados não
recebem um run de CI inventado. Falta de dispatch bloqueia o gate específico,
não toda a descoberta, produção ou revisão que já pode ocorrer.

## Persistir e integrar

Escrever evidências somente na própria branch e namespace. Stores experimentais
também são isolados por sessão/candidato. Não editar namespaces de outros nem
publicar um sidecar documental como conhecimento servido pelo Atlas.

Ao finalizar sua fatia, publicar o handoff imutável e selado conforme o contrato:
fontes, artefatos, decisões dos dois juízes, consumidores, gates, economia, gaps e
interfaces. ROOT seleciona commits exatos, verifica união/cobertura/conflitos e
executa casos transversais e gates finais. Revalidar as dependências afetadas por
qualquer mudança do candidato, sem invalidar trabalho independente por conveniência.

Relatar separadamente produção nativa, aceite semântico, importação, leitura real,
controles mecânicos, integração, aceite do proprietário e landing. `GLOBAL_REVIEW_READY`
não é `DONE`, ativação nem aceite humano. Não criar PR/merge, force-push, publicação
em produção ou exclusão histórica como efeito colateral deste protocolo.

Se um item depende de capacidade ausente, persistir `HOLD`/`BLOCKED` com operação,
evidência, critérios e menor próximo passo; continuar itens independentes. Nenhuma
sessão fica esperando sua vez por causa da divisão do trabalho.

Antes de terminar, aplicar a auditoria de [completion.md](references/completion.md):
todas as obrigações locais devem estar entregues, verificadas e persistidas, com
os dois juízes e sem correção obrigatória aberta. Continuar enquanto houver tarefa
executável. Uma barreira externa comprovada é `INCOMPLETE_BLOCKED`, jamais entrega
completa. Só a integração da união, seu julgamento global e o aceite humano ficam
com ROOT, conforme [integration.md](references/integration.md).
