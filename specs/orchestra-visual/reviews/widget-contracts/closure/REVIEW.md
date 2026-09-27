# Widgets — fechamento de decisões e bindings para execução

[Contrato dos widgets](../../../WIDGETS.md) · [Entrada do Codex](../../../START-HERE.md) · [Índice de owners/tasks](../../../INDEX.md) · [Publicação desta passagem](PUBLICATION.json)

Este fechamento completa o contrato 4.3 existente. Não cria outro plano, mais épicos, WPs ou tasks. O mock, os assets, a geometria, as margens de performance, os estágios de aprovação e os limites de escrita permanecem iguais. A implementação do produto continua **NOT_RUN**.

## O que o executor encontra

`WIDGETS.md` tem uma tabela inicial **Onde implementar**: componente existente, destino novo/modificado, owner e par T1/T2. Depois, W01–W09 definem campos, identidade, callbacks, efeito de cada controle, estados de indisponibilidade reais, recursos limitados e WK01–WK28 de produto. PLAN.json vincula essas seções às tasks e aos cinco axiomas. O Codex não precisa escolher o significado de Docs, inventar um backend de widgets ou adivinhar como repetir testes.

| Elemento | Decisão de produto |
|---|---|
| Checklist | Snapshot de todowrite; plano informado pelo agente, não prova de execução. Sem ID por linha inventado ou correspondência entre snapshots por índice/texto. |
| Alterações/diff | Um controller de revisão e seleção compartilhado; não criar outro editor. |
| Testes/output | Parser limitado de Bun elegível, output retido como fallback final suportado; estado e fim autoritativos prevalecem sobre a normalização de apresentação. |
| Browser/Files/Docs/Terminal | Quatro panes no mesmo Dock; Docs local e lazy, um PTY existente e browser com tab/perfil preservados. |
| Tasks | Resumo de três linhas priorizando ativas, expansão virtualizada, origem real; 64 é carga de teste, não limite silencioso de entidades. |
| Atividade | Fonte de sessão, janela e servidor discriminadas; sem feed persistente, saúde fictícia ou outro subscriber. |
| Repetir testes | Confirmação do comando/contexto, transporte existente, nenhuma limpeza do rascunho; diretório incompatível não é corrigido com cd inventado. |
| Criar PR… | Prepara pedido revisável no composer normal; não publica, faz push ou envia ao modelo ao clicar. |
| Abrir origem | Usa user confirmado e hash da timeline; origem ausente oferece Abrir sessão, não deep link aproximado. |

## Achados concretos endereçados nesta passagem

### 1. Estado normalizado não é resultado autoritativo

`packages/app/src/utils/session-message.ts`, no source `1a235323361717d13a44d3c184bad13649f59e60`, projeta shell não-running como ToolPart completed e pode preencher o fim ausente com o início. Reusar esses valores como certificado de sucesso/tempo zero seria incorreto.

W03 agora distingue o ToolPart original do agente da execução direta `SessionMessageInfo.type=shell`. O seam S09→S11 recebe `sourceMessage` opcional, com tipo existente; S25 o conecta. Estado/fim/exit reais vencem o fallback visual. Sem fonte suficiente, resultado/duração permanecem desconhecidos. Não modificar o normalizador compartilhado nem inventar status públicos para atender o mock.

### 2. O hash de navegação é de uma mensagem user

`use-session-hash-scroll.ts` trabalha com UserMessage e `message-id-from-hash.ts` reconhece `message-<id>`. Não existe permissão para transformar callID em esse ID. W05 exige parent confirmado na mesma sessão/servidor, usando a projeção existente; origem incompleta é explicitamente Abrir sessão. S17 entrega referências, S18 apresenta e S25 liga o hook. Não há três owners escrevendo a navegação central.

### 3. Repetir um comando não pode apagar o prompt em edição

A ramificação shell do submit atual chama clearInput antes do envio. W07 exige reusar somente transporte e ownership, não chamar esse fluxo de limpeza ao clicar Repetir. Texto, cursor, anexos, contexto e modo continuam intactos em sucesso/falha/cancelamento/resposta incerta. Uma resposta tardia não restaura snapshot sobre texto mais recente.

### 4. Limite de DOM não é limite de trabalho visível

A redação anterior de W05/W06 podia ser lida como cortar a coleção em64. Foi substituída por virtualização do DOM, preservando todas as ativas já sincronizadas e a65ª intervenção. Encerradas seguem a retenção explícita de12. Falhas recentes fora do resumo têm indicador, mas não expulsam uma ativa das três linhas. Os casos WK13/WK15/WK16 incluem essa condição sem criar outro perfil de benchmark.

### 5. Fallback do checklist sem correlação impossível

Não há ID/revisão individual suficiente no schema observado para associar a lista corrente a um snapshot histórico por conteúdo. O contrato agora decide a condição: lista corrente somente quando não há snapshot todowrite concluído válido no histórico carregado. Caso contrário, manter os snapshots em suas mensagens. Não apresentar a lista mais recente como se fosse a antiga.

## Axiomas, paralelismo e escopo

Os cinco grupos continuam explícitos. Os critérios dos owners S09/S10/S11/S17/S18/S25 foram especificados para estas decisões, preservando IDs e estágios. WK07 em S09 é somente passthrough da origem; parser e card pertencem a S11. WK14 em S17 é somente referência qualificada/ausência; Stop e navegação renderizada pertencem a S18/S25. Isso evita testes de interfaces com dois implementadores concorrentes.

Não se alteram dependências, prioridades, leases, writer dos hotspots, gates ou escopos de escrita. Os novos caminhos são âncoras read-only. O piloto S25-W0 não recebe obrigações da entrega final. Os mesmos143nós,38WPs,66tasks e1.974IDs permanecem. As seções por widget não são plugins ou unidades de execução adicionais.

## Verificação e seus limites

A revisão usou o plano pinado em `d7ba1cb2ecb51395a5d2a6282286a1484e6d5b4d` e fontes textuais de produto pinadas em `1a235323361717d13a44d3c184bad13649f59e60`, obtidas por artefato do próprio GitHub. Localmente passaram224testes das ferramentas após os ajustes. O snapshot local não é uma instalação nem execução do produto. A publicação repete as verificações num checkout do GitHub; o resultado efetivo, comandos e logs ficam em `QA-GITHUB.json`.

Os controles preservam todos os contratos que já reprovam prova falsa/incompleta, alterações de marca, ausência de consumidor, regressão de latência e invalidação de fonte. Verificações adicionais desta passagem confrontam bytes protegidos, ownership dos destinos, atribuição de casos, baseline e conteúdo das decisões. Não substituem os testes WK no frontend. A verificação nativa de issues lê de volta os39corpos e as relações existentes, sem fechar tickets ou remover vínculos externos.

Não houve build/render do Orchestra, teste Electron, reprodução real do bug de UI, benchmark do computador do usuário, criação de PR pelo aplicativo ou chamada a modelo. Revisão pelo mesmo assistente em passagem separada; não é auditoria externa independente. S01 revalida o checkout e os bindings; S02/S11 capturam fixtures reais do Bun; S23/S24 aprovam o mesmo build implementado. Dados faltantes têm alternativas explicitamente decididas; componente suportado porém não ligado não pode ser aprovado como indisponível.
