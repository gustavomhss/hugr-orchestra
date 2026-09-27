# WIDGETS — decisões executáveis do cockpit / contrato 4.3

**Leia somente as seções atribuídas à sua task.** Este arquivo fecha o significado e a integração dos elementos do mock; `PLAN.json` continua sendo a autoridade de owners, dependências, cinco axiomas e estágios. Não é um registro de plugins, schema de servidor, biblioteca nova ou autorização para implementar outro harness.

[Entrada](START-HERE.md) · [Índice](INDEX.md) · [Execução](EXECUTE.md) · [Referência aprovada](reference/approved.png) · [Estética](SPEC.md) · [Fronteiras](CONTRACTS.md)

## Decisões fechadas

| ID | Elemento visível / mudança | Implementação e verificação | Integração |
|---|---|---|---|
| [W01](#w01) | Checklist compacto na conversa; apresentação nova de `todowrite` existente | S09 / #152 | S25 mantém a timeline existente |
| [W02](#w02) | Arquivos alterados e diff lado a lado | S11 / #154 | S25 liga a mesma seleção/revisão |
| [W03](#w03) | Resultado de testes e output, sem inventar estatísticas | S11 / #154 | S09 oferece o ponto de render; S25 o conecta |
| [W04](#w04) | Dock com Browser / Files / Docs / Terminal | S15 / #158: chrome/browser; S11: panes locais; S16 / #159: bounds/visibilidade | S25 conecta callbacks e um único terminal |
| [W05](#w05) | Resumo de Tasks e expansão | S17 / #160: dados; S18 / #161: apresentação | S25 cria uma projeção e a compartilha |
| [W06](#w06) | Atividade tipada; substitui “Agents 4 online” fictício | S17: projeção; S18: card; S15/S21: fontes existentes | S25 injeta snapshots pequenos, não outro store |
| [W07](#w07) | Ver alterações / repetir testes / editor / preparar PR | S11: botões e confirmação; S10 / #153: ações de execução/draft | S25 liga handlers e captura a identidade |
| [W08](#w08) | Entradas Tasks / Agents / Maestro / Atlas / Dock / Janitor | S06 / #149: navegação; S19–S21: domínio | S25 é writer único dos comandos compartilhados |
| [W09](#w09) | Microinterações, estados, limites e prova integrada | Cada owner em sua fatia; S22 copy; S23 performance; S24 visual | S25 produz candidato antes dos gates finais |

### Onde implementar — destinos, não um segundo plano

Todos os caminhos desta tabela partem da raiz do repositório. **Novo** significa componente/adaptação frontend a implementar no escopo indicado, não arquivo já existente. As tarefas T1 implementam e provam sua fatia; T2 verificam essa fatia. S25 conecta os componentes no candidato; S23/S24 avaliam esse candidato; nenhuma T1 exige aprovação de um consumidor futuro.

| Elemento | Fonte/componente existente | Destino decidido | Task de entrega → verificação |
|---|---|---|---|
| Checklist W01 | todowrite + timeline atual | Novo `packages/app/src/pages/session/timeline/orchestra-checklist.tsx`, apresentado pelo `message-timeline.tsx` existente | `S09-W1-T1` → `S09-W1-T2` |
| Alterações/diff W02 e testes W03 | ReviewPanelV2 + ToolPart normalizado + mensagem-fonte real | Novo `packages/app/src/pages/session/orchestra-evidence.tsx`; adaptadores/ações/testes no cone `orchestra-evidence*` | `S11-W1-T1` → `S11-W1-T2`; seam da timeline em S09 |
| Dock W04 | AppsPanel + appDock* | Modificar `packages/app/src/pages/session/apps-panel.tsx` e `.css`; bridge no owner S16 | `S15-W1-T1` → `S15-W1-T2`; nativo `S16-W1-T1` → `S16-W1-T2` |
| Files / Docs / Terminal em W04 | file context, reader, file renderer e terminal atuais | Novos `packages/app/src/pages/session/orchestra-evidence-files.tsx` e `orchestra-evidence-docs.tsx`; reusar `terminal-panel.tsx` | S11 entrega panes; S25 conecta; S15 não escreve nesses arquivos |
| Dados de Tasks/Atividade W05/W06 | stores sincronizados + snapshots pequenos existentes | Modificar `packages/app/src/pages/session/tasks-data.ts`; novo `orchestra-activity-data.ts` no mesmo diretório se a projeção separada for necessária | `S17-W1-T1` → `S17-W1-T2` |
| Cards Tasks/Atividade W05/W06 | um read model compartilhado | Modificar `packages/app/src/pages/session/tasks-panel.tsx`; novo `orchestra-activity.tsx` e seu teste | `S18-W1-T1` → `S18-W1-T2` |
| Faixa de ações W07 | shell transport, prompt store, open-in-app e share atuais | Novo `packages/app/src/pages/session/orchestra-evidence-actions.tsx`; callbacks de draft/execução no cone de composer de S10 | S11 entrega UI; S10 entrega callbacks; S25 conecta |
| Atalhos W08 | shell, comandos da sessão e consumers S19–S21 | S06 apresenta navegação; somente S25 modifica `packages/app/src/pages/session/use-session-commands.tsx` | S06/S19/S20/S21 entregam; `S25-W1-T1` conecta |
| Acabamento/prova W09 | aplicativo integrado, não outra demo | Comparação visual e métricas sobre o mesmo build; evidências nos owners atuais | `S23-W1-T2` / `S24-W1-T2` → `S25-W1-T2` |

Sufixo `*` é um cone de escrita, não ordem para criar arquivos desnecessários. Não criar um componente para cada célula desta tabela nem um registry genérico de widgets. Adaptadores pequenos podem ficar no arquivo do componente quando não são reutilizados. A árvore de providers, a persistência e os backends atuais continuam sendo a fonte de verdade.

### Interfaces locais propostas — nomes e efeitos, não APIs já existentes

| Ligação | Contrato mínimo decidido | Regra de implementação |
|---|---|---|
| Timeline S09 → renderer S11 | `renderExecutionEvidence({serverKey, sessionID, messageID, part, sourceMessage}) => JSX.Element | undefined` | S25 fornece o callback; `part` usa ToolPart do SDK já importado; `sourceMessage` é opcional e usa o tipo SessionMessageInfo atual, sem um schema paralelo. undefined mantém renderer atual. Não visitar outros parts dentro do callback. |
| Dock S15 → panes S11 | `files: () => JSX.Element`, `docs: () => JSX.Element`, `terminal: () => JSX.Element`, com `activePane` e `onPaneChange` locais | Três props/factories fixas; avaliar só a escolhida. Nenhum registry/dynamic loader genérico. |
| AppsPanel S15 → Atividade | `onActivitySnapshot(snapshot | undefined)` com os campos listados em W06 | Uma emissão por mudança real relevante do controller existente. undefined limpa a fonte; não replay do histórico. |
| S11 → S10 | `onReplayExecution(source)` e `onPreparePullRequest(context)` | source/context carregam a identidade capturada descrita em W07. S25 fornece callbacks; não são métodos novos do SDK. |
| S25 → S18 | `data` compartilhado de `createTasksData` e callbacks `onOpenItem` / `onStopItem` | Instanciar o produtor fora das duas views, manter defaults do modo legado. Ler props reativamente; não congelar `const item = props.item` quando a row puder receber item atualizado. |

Reusar tipos de identidade do host, não substituir branded IDs por strings irrestritas para compilar. As assinaturas são as novas fronteiras locais a implementar; não tentar chamar esses nomes no backend. Ausência de callback durante desenvolvimento conserva o fallback legado; ausência no candidato final quando a capacidade é suportada **reprova a integração**, não vira disabled aprovado.

**O que não é um widget novo:** o site “Approval Flow” dentro do browser é conteúdo demonstrativo, não uma aplicação a implementar. Prosa de conclusão é uma mensagem do agente, não um certificado de testes. Percentuais, nomes de modelos, nomes de pessoas e “online” ilustrativos não são dados de produção. O símbolo vem do kit HuGR; nenhuma nova rodada estética está autorizada.

## Fontes de código fixadas para estas decisões

Snapshot lido: `bde9005056e17d6495ce1270a2f25ca811b69e43`. Os links abaixo são fontes inspecionadas, não declaração de testes de runtime. S01 verifica paths/símbolos no checkout real e tem escrita limitada a esses bindings neste documento; se o contrato mudou, registra a divergência e ajusta o binding mínimo, sem reabrir o produto ou alterar a política silenciosamente.

| Fonte real | Campos / símbolos utilizados |
|---|---|
| [session-todo.ts](https://github.com/gmhelmold/HuGR-Orchestra/blob/bde9005056e17d6495ce1270a2f25ca811b69e43/packages/schema/src/session-todo.ts) | `SessionTodo.Info`: content/status/priority; **sem ID e timestamp individuais**; evento `todo.updated` com sessão e lista |
| [tool/todo.ts](https://github.com/gmhelmold/HuGR-Orchestra/blob/bde9005056e17d6495ce1270a2f25ca811b69e43/packages/opencode/src/tool/todo.ts) | `todowrite` retorna `metadata.todos` após atualização; input ainda não concluído não é confirmação |
| [directory-sync.ts](https://github.com/gmhelmold/HuGR-Orchestra/blob/bde9005056e17d6495ce1270a2f25ca811b69e43/packages/app/src/context/directory-sync.ts) | `data.todo`, `data.part`, `session.todo`, `session_message`, permission e status já sincronizados |
| [message-part.tsx](https://github.com/gmhelmold/HuGR-Orchestra/blob/bde9005056e17d6495ce1270a2f25ca811b69e43/packages/session-ui/src/components/message-part.tsx) | Já registra `todowrite` e usa metadata ou input; o cockpit distingue confirmado de proposto, em vez de copiar esse fallback como prova |
| [review-panel-v2.tsx](https://github.com/gmhelmold/HuGR-Orchestra/blob/bde9005056e17d6495ce1270a2f25ca811b69e43/packages/app/src/pages/session/v2/review-panel-v2.tsx) | `ReviewPanelV2`: diffs/diffsReady/diffVersion/loadDiff/activeFile/onSelectFile; renderer já protege fonte/versão |
| [shell.ts](https://github.com/gmhelmold/HuGR-Orchestra/blob/bde9005056e17d6495ce1270a2f25ca811b69e43/packages/opencode/src/tool/shell.ts) | input command/workdir; resultado output; metadata.exit, truncated, outputPath; metadata.output é **preview**, não output integral |
| [tasks-data.ts](https://github.com/gmhelmold/HuGR-Orchestra/blob/bde9005056e17d6495ce1270a2f25ca811b69e43/packages/app/src/pages/session/tasks-data.ts) | `createTasksData`, childId, callID, states e `childStats`; nenhuma segunda fonte persistente necessária |
| [tasks-panel.tsx](https://github.com/gmhelmold/HuGR-Orchestra/blob/bde9005056e17d6495ce1270a2f25ca811b69e43/packages/app/src/pages/session/tasks-panel.tsx) | Abrir tarefa, interrupt, dismiss e ticker existentes; corrigir erros silenciosos e não manter projeções duplicadas |
| [apps-panel.tsx](https://github.com/gmhelmold/HuGR-Orchestra/blob/bde9005056e17d6495ce1270a2f25ca811b69e43/packages/app/src/pages/session/apps-panel.tsx) | `AppsPanel`; active tabID/generation/profile; appDockHide/Select/CloseTab; eventos state/crash/navigation-error; não há timestamp nativo no evento state |
| [use-session-commands.tsx](https://github.com/gmhelmold/HuGR-Orchestra/blob/bde9005056e17d6495ce1270a2f25ca811b69e43/packages/app/src/pages/session/use-session-commands.tsx) | `tasks.toggle`, `review.toggle`, `terminal.toggle`, `session.share`, `input.focus`, `createSessionOwnership` |
| [prompt-input/submit.ts](https://github.com/gmhelmold/HuGR-Orchestra/blob/bde9005056e17d6495ce1270a2f25ca811b69e43/packages/app/src/components/prompt-input/submit.ts) | `api.session.shell({sessionID,id,command,agent,model})`; o request mostrado **não oferece workdir**; prompt normal mantém draft/queue/permissões |
| [open-in-app-v2.tsx](https://github.com/gmhelmold/HuGR-Orchestra/blob/bde9005056e17d6495ce1270a2f25ca811b69e43/packages/app/src/components/session/open-in-app-v2.tsx) | `useOpenInApp`, canOpen/opening/openDir/current; abre **diretório**, não garante linha/arquivo selecionado |
| [janitor.tsx](https://github.com/gmhelmold/HuGR-Orchestra/blob/bde9005056e17d6495ce1270a2f25ca811b69e43/packages/app/src/context/janitor.tsx) e [janitor-widget.tsx](https://github.com/gmhelmold/HuGR-Orchestra/blob/bde9005056e17d6495ce1270a2f25ca811b69e43/packages/app/src/components/janitor-widget.tsx) | `useJanitor().store.report/source/expanded`, expand/collapse/dismiss/snooze; null não prova health; PocketChat só por ação do usuário |

**Bindings adicionais conferidos em `1a235323361717d13a44d3c184bad13649f59e60`:**
- `packages/app/src/utils/session-message.ts`: `normalizeSessionMessages`, `shellMessages` e `shellPart`; preservar status/tempo da mensagem-fonte.
- `packages/app/src/context/server-session-v2-reducer.ts`: `session.shell.started`/`session.shell.ended` alimentam a origem real de replay.
- `packages/app/src/pages/session/use-session-hash-scroll.ts` e `message-id-from-hash.ts`: navegação por UserMessage e hash `#message-<id>`.
- `packages/app/src/utils/session-route.ts`: `sessionHref(serverKey, sessionID)` qualifica a rota de servidor/sessão.
Esses caminhos são **fontes de leitura**, não nova permissão de escrita. W03 e W05 explicam exatamente como usar suas saídas sem modificar o contrato público.

**Escolha de implementação:** todos os itens W01–W08 usam frontend e contratos existentes. Não criar endpoint de “widgets”, storage de atividade, API de teste ou login GitHub. Own/governança live continuam exclusivamente nas W2 já existentes, com autoridade comprovada. “Implementação ausente” não é um estado de capability: uma fonte presente mas não ligada reprova a task; ausência real de fonte usa somente o comportamento de indisponibilidade definido abaixo.

<a id="w01"></a>
## W01 — Checklist de execução na conversa

**Owner:** S09. **Local:** renderer da timeline em `packages/app/src/pages/session/timeline/`; novo `orchestra-checklist.tsx` apenas para a apresentação compacta, reutilizando tipos/primitives existentes. Não criar outro registro de tools. O renderer compacto substitui a apresentação do mesmo part no cockpit, não aparece ao lado de uma segunda lista legada.

**Semântica decidida:** checklist é **plano informado pelo agente**, não auditoria independente da execução. O label acessível e o disclosure de origem dizem “Plano informado pelo agente”. Uma linha completed significa o valor comunicado em `todowrite`; não pode validar teste, diff ou aprovação governada.

**Fonte e identidade:** para uma mensagem histórica, usar somente a lista `metadata.todos` de um tool part `todowrite` concluído naquela mensagem. Identidade do snapshot: `(serverKey, sessionID, messageID, partID)`; identidade local de linha: posição **dentro desse snapshot**. Não deduplicar duas linhas iguais por content, inventar ID durável ou associar itens de snapshots diferentes por índice. O schema atual não permite essa promessa.

**Posição:** abaixo do texto/resultado a que o part pertence, na ordem real da timeline. Não mover um plano de outra mensagem para imitar a história ilustrativa. Se só existir a lista sincronizada atual, mostrar no máximo um disclosure “Plano atual da sessão”, separado do histórico, sem atribuir autoria/horário de uma mensagem antiga. Não montar ambos para o mesmo snapshot confirmado. Regra exata de fallback: mostrar a lista corrente somente se não existir nenhum part todowrite concluído com lista válida no histórico carregado da sessão. Havendo snapshot histórico carregado, mostrar somente os snapshots em seus lugares; não tentar provar correspondência da lista corrente por igualdade de conteúdo ou índice. O mesmo reader de sessão existente faz a hidratação, sem novo polling.

| Entrada | Render / comportamento |
|---|---|
| pending/in_progress/completed/cancelled | Ícone e texto próprios; completed com check, cancelled com traço e rótulo, não check de sucesso |
| status desconhecido | “Estado não reconhecido”; conteúdo preservado; nunca mapear para completed |
| Tool pending/running só com input.todos | “Atualização do plano em andamento”; itens propostos neutros; nenhum check de conclusão confirmado |
| Tool error | Erro da atualização com output correspondente; input não substitui o último snapshot confirmado |
| Lista confirmada vazia | “Nenhuma etapa registrada” quando o usuário abre o resultado; não criar cinco linhas decorativas |
| Fonte malformada/parcial | Resultado original acessível; aviso local, sem converter texto livre em checklist |

Mostrar cinco linhas no resumo, com altura mínima 24px/linha e texto que pode quebrar em duas linhas; além disso, “Mostrar todas (N)” expande no fluxo principal. Para listas >50, detalhe virtualizado com o virtualizer já disponível; não criar scroller permanente para cinco linhas. Expansão/foco pertencem ao snapshot; mudança de lista preserva a sessão, não mantém seleção por ID fictício. Nenhum cronômetro neste widget. Recalcular apenas quando muda aquela lista/part, não por delta de texto de outra mensagem.

**Casos de aceite de produto:** `WK01` snapshot histórico permanece inalterado quando chega novo todo.updated; `WK02` tool recusada com input contendo completed não mostra confirmação; `WK03` conteúdos repetidos/status desconhecido/0,5,51 itens e troca de servidor não se misturam. S09-T1 implementa/prova a fatia; S09-T2 exercita esses casos. O piloto pode usar o renderer existente antes dessa entrega, sem certificar W01 antecipadamente.

<a id="w02"></a>
## W02 — Alterações e diff selecionado

**Owner:** S11. **Base:** `ReviewPanelV2`, `review-tab.tsx` e seus tipos de diff; wrapper `orchestra-evidence*` apenas onde precisa da composição inline. Não montar outro editor ou carregar conteúdo de todos os arquivos. S25 fornece a seleção e o controller de revisão já pertencentes à sessão.

**Composição:** lista à esquerda, diff à direita, proporção inicial 1:1, gap8, geometria de SPEC. Cabeçalho “Alterações propostas (N)” somente com lista de diffs carregada. “Propostas” não afirma que foram commitadas/aprovadas. N é número de arquivos únicos da revisão mostrada; adições/deleções desconhecidas ficam `—`, não zero. Renames/binários/deletes usam o discriminante real e fallback do renderer.

**Seleção:** chave `(serverKey, sessionID, revisionIdentity, canonicalPath)`, não índice visual. Clique/Enter em arquivo muda somente o preview; o botão de abrir no editor é separado. Preservar activeFile quando ainda existe; se removido, selecionar o primeiro disponível e anunciar a mudança sem roubar foco. Buscar não seleciona outro arquivo automaticamente. Mostrar a origem da revisão (sessão/turno/worktree conforme o controller real), sem atribuir um SHA inexistente.

**Versão:** `loadDiff(path, diffVersion)` e os guards existentes impedem resultado atrasado de A sobre B. Quando diffs mudam, marca “Alterações atualizadas” até carregar a versão selecionada; não manter check de teste vigente por proximidade temporal. Nunca interpretar os nomes de arquivos na prosa do modelo como a lista VCS autoritativa.

**Narrow:** abaixo do espaço necessário, alternância lista/preview com voltar preserva seleção; não encolher fonte para caber. Lista longa usa componente virtual existente. Só um renderer pesado por seleção na localização ativa; maximizar move/mostra a mesma superfície, não deixa dois diff viewers em background.

**Casos:** `WK04` A→B com respostas invertidas, rename e revisão alterada; `WK05` vazio/no-git/permissão negada/binário/1000 arquivos/100k linhas e retorno narrow→wide preservam identidade. Dono dos testes e parser de diff permanece S11, não S25.

<a id="w03"></a>
## W03 — Testes e output de execução

**Owner:** S11, arquivo proposto `packages/app/src/pages/session/orchestra-evidence-tests.tsx` e parser puro irmão no mesmo prefixo. **Composição:** um card inline associado a uma execução real; abas **Resultado / Output**. “Terminal” no mock significa output daquela execução aqui, **não abrir outro PTY**. O PTY interativo fica no W04/terminal existente.

**Ponto de ligação:** S09 expõe um callback opcional específico de renderer de evidência para parts de execução na timeline, com part/message e identidade da sessão. Sem callback, renderer atual. S11 entrega o renderer; S25 conecta depois de ambos prontos. O callback não é um registry genérico nem dá a S11 escrita na timeline. Não renderizar o mesmo output duas vezes nem duplicar todo o card em cada delta.

### Campos e fonte exatos

| Campo de apresentação | Fonte / regra |
|---|---|
| identity | serverKey, sessionID, messageID, partID/callID; todos preservados ao abrir output |
| command | `part.state.input.command` quando string; fallback title serve apenas de label, não de comando executável |
| execution state | discriminante real do part; completed não implica exit0 |
| exit code | `state.metadata.exit` se number inteiro; null/ausente é desconhecido, nunca 0 |
| tempo observado | timestamps start/end reais do part, quando disponíveis; não usar Date.now como começo histórico |
| output completo retido | `state.output`; **não** `metadata.output`, que é preview limitado |
| truncamento | `metadata.truncated`, outputPath e estado de carga; ausência de prova de completude impede estatística final |
| revisão validada | somente vínculo autoritativo da execução com a revisão. Sem ele: “Execução desta sessão; revisão não vinculada” |

Aceitar aliases legados `bash`/`shell` somente quando o adapter de protocolo confirme os mesmos campos; nome da ferramenta sozinho não garante equivalência. Demais ferramentas usam renderer original.

### Duas origens de execução, uma apresentação

O frontend atual normaliza mensagens pelo `packages/app/src/utils/session-message.ts`. **O adapter de evidência deve preservar a origem, não converter a forma normalizada em autoridade nova.** A normalização pode gerar `state.status="completed"` para uma shell interrompida e preencher um fim ausente com o início. Esses valores de apresentação não comprovam sucesso nem duração zero.

| Origem | Binding decidido | Regra de resultado |
|---|---|---|
| Tool do agente | ToolPart + mensagem assistant correspondente, no mesmo servidor/sessão | Usar estado real e metadata de execução. Erro/cancelamento explícito prevalece sobre texto/rodapé; ausente continua desconhecido |
| Comando direto/repetido por `session.shell` | `SessionMessageInfo` de tipo shell → `normalizeSessionMessages` / `shellPart`; `message.shellID` corresponde ao callID; IDs sintéticos são usados somente na projeção existente | Preferir `source.status`, `source.exit`, `source.output?.output`, `source.output?.truncated` e `source.time` da mensagem real. No shape observado, running é ativa; exited com exit inteiro usa esse código. Outro status exige o discriminante real do host ou resultado desconhecido. Interrupção/falha explicitamente reportada não vira sucesso por `part.state.status=completed`, rodapé positivo ou exit0 contraditório |

S09 fornece ao callback `sourceMessage` quando a mensagem bruta correspondente está carregada. Para assistant, o ID é o da mensagem-fonte; para shell direta, é a origem que a normalização converte em `<id>:assistant` e `<id>:tool`. **Não inventar outro ID nem inferir parentesco pelo texto do comando.** S11 consome essa informação; S25 liga o seam. Reusar a projeção/lookup já existente e qualificar por servidor/sessão; não varrer todas as mensagens de todas as sessões a cada render.

Sem estado/fim autoritativo: resultado não confirmado, duração `—`, motivo disponível no disclosure. Para shell direta, `time.completed` ausente não se transforma em zero por causa do fallback do normalizador. Quando o shape de output não expõe outputPath, oferecer só o output retido; não fabricar caminho de arquivo a partir do texto. O contrato não exige editar o normalizador compartilhado ou ampliar o backend para esses casos.

**Owner do adapter W03: S11.** O adaptador deve preservar a projeção existente para outros consumidores. O teste `WK07` inclui shell direta interrompida/failed, exit contraditório e fim ausente, além dos casos de log já definidos. O teste `WK19` confirma que repetir cria nova execução e novo card sem sobrescrever o resultado anterior.

### Formato reconhecido, decidido

A primeira entrega implementa **um parser pequeno do resumo final de `bun test`**, com fixtures capturadas usando a versão Bun pinada pelo repo. Não criar framework de reporters, importar JUnit/XML, chamar LLM ou “suportar qualquer runner”. Os demais comandos continuam tendo card de execução completo com output/exit/time e **“Contagens não disponíveis”**. Isso é estado final suportado, não stub.

Entrada elegível: invocação direta de `bun test` (executável absoluto também permitido se a origem o registrar), output retido completo, part concluído e rodapé reconhecido no fim. Wrapper de script, composição shell ou runner incerto vai para output-only; não adivinhar o programa pelo texto impresso. O parser não é uma fronteira de segurança para executar comandos.

Gramática do rodapé, não regex solta sobre todas as linhas: linhas numéricas `N pass`, `N fail`, opcionais `N skip`/`N todo`/`N expect() calls`, seguidas da linha terminal `Ran N tests across M file(s). [duration]`. Usar somente formas efetivamente demonstradas pelas fixtures do Bun pinado. Remover ANSI com utilitário já disponível. Números inteiros finitos não negativos; totais coerentes; status/exit sem contradição. Duplicação ambígua, rodapé incompleto, texto após o rodapé ou formas não reconhecidas → output-only com motivo. Não somar resumos de execuções distintas.

Exibir **“Arquivos executados: M”**, nunca “M arquivos aprovados”: o rodapé não atesta o resultado de cada arquivo. Exibir testes passed/failed/skipped apenas quando reportados/coerentes; não inventar skip=0 para campo não reconhecido. Sucesso do card: exit0, testes executados >0, falhas0 e rodapé válido, rotulado “Execução de testes concluída”. Zero testes = “Nenhum teste executado”, não verde. Falhas/exit não zero = falha; exit desconhecido = resultado não confirmado. O texto global “nenhuma regressão” não é emitido pelo widget.

Fonte de formato: [Bun test reporters](https://bun.sh/docs/test/reporters). Um log pode ser produzido pelo código testado; contagens são **reportadas pelo runner**, não prova independente. A fixture do mock demonstra a distribuição visual, não autoriza fixar “12 / 186 / 2.38s”.

### Output e custo

Resumo lê no máximo os últimos64KiB de output elegível uma vez por revisão concluída; não percorre MB por token. Cache local do resultado por identidade/revisão, no máximo32 execuções; liberar na troca de servidor/sessão. Uma mudança no output invalida seu parse. Sem novo worker ou parsing durante render de cada linha.

Output inline mostra preview até16KiB com marcador explícito de trecho. “Ver output completo” expande **o output retido** no viewer existente; arquivo truncado é carregado somente por ação e pelo reader autorizado do host. `outputPath` é path, não URL confiável; não navegar file:// nem buscar arquivo fora das permissões. Se o host negar acesso, mostrar motivo e manter trecho/cópia de comando. Não prometer bytes descartados. Copy informa se copiou apenas trecho. Nenhum terminal é criado para mostrar esse log.

**Casos:** `WK06` Bun pass/fail/zero tests, ANSI e números/tempos inválidos; `WK07` stdout parecido com resumo, múltiplos rodapés, output parcial, metadata.preview vs output completo e exitnull; `WK08` abrir/copy output, autorização negada, parse uma vez por revisão e limite32 entradas. Fixtures reais e negativos são testes de S11; S02 prepara execução isolada sem provider pago. Suíte de scripts do plano não prova esse parser de produto.

<a id="w04"></a>
## W04 — Dock e quatro panes locais

**Disposição fechada:** mesmo card superior, **Browser / Files / Docs / Terminal**, nessa ordem. Browser é o default. Tasks e Atividade continuam abaixo e visíveis no wide. Somente o conteúdo superior alterna; não voltar a três tabs exclusivas Dock/Tasks/Atividade.

| Pane | Conteúdo exato | Owner / base | Ação e estado sem dados |
|---|---|---|---|
| Browser | AppsPanel/navegador nativo e sua navegação/perfis | S15 + S16 | API nativa ausente: “Browser disponível no aplicativo desktop”; os demais panes continuam utilizáveis |
| Files | Arquivos do **workspace atual**, selector e conteúdo do arquivo | S11, `SessionFileBrowserTab` / `FileTabContent` / `useFile` | Sem pasta: selecionar projeto pela ação atual; acesso negado/arquivo removido preservam erro, não árvore fake |
| Docs | **Documentação local do workspace**, não site genérico, busca semântica ou RAG | S11, wrapper `orchestra-evidence-docs*` com reader/tree/Markdown atuais | Entradas README.md e AGENTS.md da raiz quando existentes + diretório docs; vazio “Nenhuma documentação local encontrada” com “Abrir arquivos” |
| Terminal | Terminal interativo já pertencente à sessão/workspace | S11, terminal-panel/Terminal e useTerminal atuais | Sem PTY: botão explícito “Novo terminal”; selecioná-lo não cria processo automaticamente |

**Docs em detalhe:** tentar somente os arquivos raiz conhecidos e listar `docs/` ao selecionar o pane; extensão `.md`/`.mdx`/`.txt`. `.mdx` é **texto/documento**, nunca compilado/executado como JSX. Se não há README/AGENTS/docs, não varrer recursivamente o repo. Diretórios de docs abrem sob demanda; links relativos resolvem pela raiz autorizada com o reader do host, sem escapar via `..`, symlink ou file://. Links externos HTTP(S) usam ação externa existente após clique, não navegação automática do browser. Caminho atual e “Abrir em Files” visíveis. Reusar conteúdo/cache de useFile; não manter duas cópias do texto. Ao sair, não parsear documentos escondidos.

**Seleções:** pane ativo é estado de apresentação qualificado por sessão/servidor; seleção de arquivo compartilha o file context/tabs atuais. Docs pode guardar somente o último path local para retorno; não cria store de arquivos. Terminal reutiliza o mesmo terminal ativo. Se o terminal inferior estiver aberto, a seleção do pane Terminal transfere sua superfície visível para o Dock e registra como voltar; nunca mantém dois xterm/ghostty renderers conectados ao mesmo PTY. Fechar/sair do pane não mata PTY; encerrar processo é ação separada do terminal existente.

**Fronteira mínima, sem framework:** S15 aceita três factories de conteúdo lazy (`files`, `docs`, `terminal`) e pane atual/callback de seleção; a definição é uma pequena prop local do componente, não um registry extensível. Factory não é avaliada até pane selecionado. S11 entrega factories/componentes sem escrever em apps-panel; S25 os conecta. Trocar pane não solicita mensagem/modelo/API de backend nova. S15 pode desenvolver/testar chrome com factories locais de teste antes de S11; sua aprovação final ligada ocorre no candidato S25.

**Browser lifecycle:** AppsPanel preserva controller/tabs/perfis durante alternância. Ao sair de Browser, `appDockHide` e suspensão de bounds; não `appDockClose`. Ao voltar, `appDockSelect(tabID,bounds)` da **mesma generation válida**, sem open/reload redundantes. Fechar tab chama `appDockCloseTab(tabID)` explicitamente, não CloseAll. Host fechado/oculto não recebe bounds0×0 nem frames contínuos. Root/controller desliga listeners no unmount real; a troca de pane não equivale a shutdown.

**Occlusion:** W04 tabs/menus/diálogos usam S16. Se o host não suporta clipping do nativeview no rail scroll, o Dock fica ancorado e somente o grupo Tasks/Atividade rola abaixo; ordem/largura/aspecto do master preservados. Z-index DOM não é prova. Popup fechando não pode mostrar browser sob outro overlay ainda aberto. Página mantém CSS/cookies/permissões originais; URL localhost do raster não relaxa HTTPS/sandbox.

**Toolbar Browser:** back/forward/reload/address/profile/tab menu mantêm handlers reais appDock*. Capability ausente tem disabled com texto, sem toast falso. Enter navega URL validada pela política existente; Escape restaura URL atual sem navegar. Indicadores de loading/crash/blocked vêm de eventos. Atualização de título não rouba foco do endereço sendo editado.

**Casos:** `WK09` Browser→Files→Docs→Terminal→Browser preserva tab/generation/cookies/draft e usa um PTY; `WK10` Docs path traversal/MDX/texto longo/no-docs e carregamento lazy; `WK11` fechar tab entre várias, trocar perfil, callbacks antigos, crash/restore; `WK12` nested overlay, resize/scroll/DPR2 e web sem native API. S15 testa chrome, S11 panes, S16 nativo; S25 prova a sequência integrada, sem tornar os três owners writers do mesmo arquivo.

<a id="w05"></a>
## W05 — Resumo de Tasks e detalhe

**Owner:** S17 dados; S18 UI. S25 instancia `createTasksData` **uma vez no owner da sessão** e fornece seus accessors ao resumo, à expansão e à autoabertura. Remover as duas derivações independentes atualmente feitas em TasksPanel/SessionSidePanel somente no caminho cockpit; modo legado preservado. Não criar novo event bus, endpoint, polling ou persistência de tarefas.

**Entidade e fonte:** child session + tool call relacionados por metadata.sessionId. Key composta por serverKey/sessionID e childSessionID ou callID com discriminante agent/shell. Chegada tool→child ou child→tool converge em um card, sem push duplicado do orphan. Não inferir estado terminal bem-sucedido de `idle`. Precedência: permissão pendente → needs-input; erro terminal explícito → failed; conclusão explícita → completed; interrupção comprovada → cancelled; trabalho ativo → running; idle sem resultado → `result-unknown` / “Finalizada; resultado não informado”. Campo ausente é desconhecido, não contador0/modelo-default.

**Resumo:** até3 rows, mínimo44px/row, duas linhas (título; tipo/agente/modelo/tempo/estado). Header “Tarefas” + contador derivado da mesma coleção: running + needs-input como ativas, com needs-input indicado separadamente. Contagem não depende de quantas linhas foram truncadas. Percentual fica **fora desta versão**: os producers atuais não expõem total confiável. Não implementar cálculo por tokens/tempo e não inventar barra78%. A ausência de percentual é decisão final, não feature pendente.

**Ordenação e resumo:** primeiro compor a coleção de ativas (`needs-input`, depois `running`); em cada grupo, ordenar por timestamp real decrescente quando conhecido e depois pela key lexical. Timestamp desconhecido fica depois dos conhecidos no mesmo grupo. O ticker não muda a ordem. Mostrar até3 ativas; somente se houver menos de3, preencher as vagas com encerradas recentes, priorizando failed antes das demais. Se houver falhas recentes fora do resumo, o header mostra contagem/link para o detalhe, sem deslocar uma ativa ou inventar status. Este algoritmo substitui a ordenação genérica que colocava failed antes de running no mesmo pool.

**Detalhe:** “Ver todas (N)” expande o próprio card, com seções ativas/encerradas e as mesmas rows; usar o virtualizer existente acima de30 itens. **64 é carga de referência, não teto da coleção.** Todas as entidades ativas já sincronizadas continuam acessíveis, inclusive65 ou mais; limitar DOM montado/overscan e caches derivados, nunca aplicar slice(0,64) às ativas. Encerradas continuam limitadas às12retidas pelo read model, explicitamente rotuladas “12 encerradas recentes”. Se o backend só carregou parte da coleção, exibir a quantidade carregada e o mecanismo atual de carregar mais; não prometer o total global. Expandir não remonta o Dock. WK13 inclui 65+ ativas e WK15 verifica DOM limitado sem perda de entidade/intervenção.

**Abrir:** agente com childID usa `sessionHref(serverKey, childID)`; shell abre a sessão/mensagem/callID correspondente pela navegação atual da timeline (não cria child). Callback valida o servidor e a entidade capturados. **Stop:** somente child agent com endpoint de interrupção existente; `sdk.api.session.interrupt({sessionID:childID})`, nunca fallback para parent nem stop-all. Estado pending no botão, erro legível/retry explícito; não swallowing catch. Shell sem cancelamento granular não ganha botãoStop: “Abrir execução” encaminha ao controle real disponível, sem interromper o pai por engano.

### Abrir a origem — contrato exato de navegação

S17 acrescenta ao read model somente referências frontend opcionais já observadas: `sourceMessageID`, `sourcePartID`, `callID` e `originUserMessageID`. Não muda schema de servidor. A mensagem normalizada assistant carrega `parentID`; confirmar que esse parent identifica uma mensagem user projetada na mesma sessão. Para shell direta, a normalização existente produz o par user/assistant com a origem shell. Não escolher “a mensagem anterior mais próxima” nem deduzir o parent por timestamp.

O hook `useSessionHashScroll` recebe **UserMessage**, e o hash reconhecido é `#message-<id>`. Não criar `#message-<callID>` nem passar ToolPart ao hook. S25 recebe `onOpenItem(source)` de S18, usa `sessionHref(serverKey, sessionID)` para a sessão real e o ID de user confirmado para revelar o turno pelo fluxo de hash/scroll existente; respeita reduced-motion e carregamento histórico atual. A seleção/exibição do output permanece vinculada ao part/callID de W03, não à label da row.

Se a origem user não puder ser resolvida, o botão se chama **“Abrir sessão”**, não “Abrir execução exata”. Mostrar “Origem da execução não disponível no histórico carregado” e preservar o output retido quando disponível. Não iniciar varredura/polling ilimitado nem rolar para uma mensagem escolhida por aproximação. A troca de servidor/sessão enquanto a origem carrega invalida o callback antigo. `WK14` cobre parent válido, origem ausente, hash de callID recusado e callback obsoleto.

**Dismiss:** apenas encerradas, local à mesma sessão/key; não remove histórico/child no backend. **Auto-open:** real necessidade de intervenção expande/destaca o resumo conforme snooze; nunca troca de pane/servidor/modelo ou rouba foco. Um único ticker1Hz para tempos visíveis ativos; zero quando offscreen, recolhido ou sem atividade. Textos de tempo usam tabular-nums e largura reservada, sem criar métrica start com Date.now quando falta timestamp.

**Casos:** `WK13` 0/1/64children, tool/child fora de ordem, erros tardios eIDs iguais em servidores distintos; `WK14` Stop child, falha/retry, shell sem cancel e dismiss sem mutação; `WK15` View all, auto-open/snooze/foco e atualização de um child sem varrer todos os transcripts. Capturas/UI pertencem a S18; counters/projeção/perf local a S17.

<a id="w06"></a>
## W06 — Atividade tipada e compartilhada

**Título:** “Atividade”, não “Agents 4 online”. **Owner:** S17 gera itens derivados em `orchestra-activity-data*`; S18 renderiza `orchestra-activity.tsx` e teste irmão. **Não é feed persistente:** mostra entidades atuais/recentes já carregadas da sessão e do host. Sem auditoria global, fila nova, polling ou armazenamento de eventos.

| Linha | Fonte exata | Escopo / ação |
|---|---|---|
| Agente | Mesmo accessor de Tasks, kind=agent | sessão e servidor atuais; abrir child/transcript; não duplicar stats |
| Shell/ferramenta | Mesmo Tasks kind=shell, somente execução com origem | abrir mensagem/output do callID; ícone de ferramenta, não avatar de agente |
| Dock | Snapshot readonly emitido pelo controller AppsPanel já montado | rotulado **“Esta janela”**, perfil/tabID/generation; abrir Browser e selecionar essa aba, sem mudar sessão |
| Janitor | `useJanitor().store.report` e source | somente source compatível com servidor atual; label “Servidor atual”, abrir relatório existente via expand |

**Snapshot Dock mínimo:** chave local opaca do owner de janela (somente correlação de UI, não nova autoridade IPC), tabID/generation/profileID, title, loading/crashed/navigationError e `observedAt` quando observado pelo renderer. O stateevent nativo não tem horário: não fabricar “última execução”; label “observado” e timestamp local opcional. Não incluir cookies, HTML, screenshot, URL com query/token ou conteúdo da página no resumo. Mudança de um evento atualiza só sua row. Uma prop/callback local de S15 fornece esse snapshot a S25; S17 recebe accessor puro. Não adicionar outro subscriber appDockEvent para cada card.

**Janitor:** reportnull significa “sem relatório disponível”, não healthy/idle. Não mostrar row de sucesso sempre ligada. Se source=null legado sem vinculação comprovada, não atribuir a esta sessão/servidor: menu do Janitor explica que não há relatório vinculado. Montar o resumo não monta `JanitorPocketChat`, não cria sessão e não chama modelo. Row de relatório presente mostra findings/severidade do parser já existente; abrir usa expand; dismiss/snooze continuam em S21. Se não há fonte Janitor válida, sua ausência não reduz para um “0 problemas” fabricado.

**Apresentação:** até4 rows no resumo. Ordenar por necessidade de intervenção/erro, depois execução ativa, depois eventos recentes com tempo conhecido; desempate por tipo/key. `observedAt` do Dock não supera uma permissão pendente. Contador é de itens de atividade, não de pessoas online; tooltip discrimina fonte/escopo. Tempo ausente = `—`. Tipo textual acompanha ícone. “Ver todas” expande inline a coleção já retida, com virtualização; não limita as entidades ativas a64 nem oculta a65ª intervenção. Encerradas seguem a retenção W05, e fontes Dock/Janitor não consomem uma cota artificial das tarefas. Sem buscar transcript inteiro. Filtro “Agentes” mostra apenas agent, sem novas cópias da coleção. Header/filtro não multiplica subscriptions.

**Estados:** sem itens: “Nenhuma atividade observada nesta sessão”; dados carregando: skeleton de altura estável; desconectado: preservar último snapshot claramente desatualizado e desabilitar ações de mutação; troca de servidor elimina vínculos anteriores; nunca requalificar IDs velhos pelo servidor novo. Se erro de fonte, indicar qual, não esconder todas as outras rows válidas.

**Casos:** `WK16` mistura de tipos, fonte de janela vs servidor e contagem exata; `WK17` reportnull/source mismatch/abrir relatório sem iniciação automática de chat; `WK18` título Dock muda durante digitação, snapshot tardio após close, filtro/expand e único subscriber/ticker. A superfície **UI78** cobre este consumer; UI56 permanece âncora de dados, não screenshot de TypeScript.

<a id="w07"></a>
## W07 — Faixa de ações e seus efeitos

**Owner de apresentação:** S11 em `orchestra-evidence-actions*`. **Owner de execução/draft:** S10 em `pages/session/composer/` ou `components/prompt-input/`. **Integrator:** S25 conecta ambos. A faixa recebe identity/source/result e callbacks estreitos; não importa diretamente SDK de backend para contornar o composer/permissões. O scope de ações é o da mensagem/execução, não “a sessão que estiver selecionada quando a Promise terminar”.

| Controle | Efeito fechado | Sem capacidade / dados |
|---|---|---|
| **Ver alterações (N)** | Abre/foca a revisão W02 existente para a sessão/versão; preserva activeFile válido | zero: abrir estado vazio, sem count inventado; revisão histórica indisponível é explicada |
| **Repetir testes…** | Confirmação do comando observado e contexto; execução exata pela API shell existente somente sob as condições abaixo | sem contexto reproduzível: explicar e oferecer copiar comando/abrir terminal; não trocar por prompt “rode testes” |
| **Abrir no editor** | `useOpenInApp().openDir(current().id)` para o diretório da sessão, usando seletor existente | host sem openDir: ação explícita “Copiar caminho”; não dizer que abriu editor/arquivo |
| **Criar PR…** | **Preparar pedido para o agente no composer normal**, para revisão/envio do usuário | sem sessão/draft disponível: razão local; nunca OAuth/backend novo nem PR fictícia |
| Share no header, quando existente | `command.trigger('session.share')`, respeitando config.share e handler atual | configurado disabled: não expor bypass; compartilhar não é criar PR |

### Repetir testes: confirmação e alcance real

A confirmação max560px exibe command em texto selecionável, diretório conhecido, servidor/sessão, origem do resultado e aviso: **“Novo processo, com arquivos e ambiente atuais; não reproduz o ambiente antigo.”** O botão confirmar é “Executar comando”. Cancelar não altera nada. Usar identificador novo da execução via mecanismo `Event.ID.create` já usado pelo submit; não reutilizar o ID do resultado antigo.

S10 reutiliza `sdk.api.session.shell({sessionID,id,command,agent,model})` no fluxo capturado da sessão. Capturar a identidade pelo mesmo padrão `createSessionOwnership` usado nos comandos e revalidar servidor/sessão ao confirmar; agent/model são a seleção atual visível e não serão trocados para valores históricos. Mensagem antiga de outro servidor/sessão não executa no contexto atual. Com sessão ativa ocupada ou admissão indisponível, não abortar/steer automaticamente: botão disabled com motivo e retry por nova ação.

**Condição do diretório:** aceitar apenas origem no mesmo session directory, com workdir ausente (portanto implícito confirmado) ou workdir absoluto/canônico igual ao diretório que o host resolve para essa sessão. O request atual não transporta workdir. Se a origem declara outro workdir, workdir relativo não resolvido ou localização desconhecida, **não executar** e não prefixar `cd`, modificar quoting/comando/env ou adicionar flags para fazer caber. Copiar comando e abrir terminal são alternativas explícitas, não sucesso da repetição. A expansão de suporte a workdir seria mudança pública de protocolo e fica fora desta migração, não oculta como tarefa “futura necessária”.

Confirmar trava a ação até resposta. Double click não dispara duas requests. Falha de rede com resultado incerto mostra “Estado da solicitação desconhecido — confira as execuções”, sem retry automático nem alegação de exatamente-uma-execução no servidor. Novo resultado usa novo card W03; resultado antigo não é sobrescrito. Cancelar o modal depois de enviado não mata processo; interrupção permanece no controle autoritativo existente. Chamada respeita autenticação/permissões do host; nunca executar via PTY injecção/CLI local ou usar API de outro servidor para contornar falha.

**Preservação do composer ao repetir:** reusar o transporte e a captura de ownership, **não chamar o submit normal que limpa o input**. O callback de replay não chama `clearInput`, `prompt.reset`, `context.clear`, não altera o modo do composer e não muda o texto, cursor, anexos ou contextos do rascunho. Isso vale no sucesso, erro, cancelamento antes do envio e resposta incerta. O resultado aparece no fluxo real da sessão; o rascunho continua aguardando envio normal. `WK19` inclui rascunho não vazio com anexos antes/depois do replay; `WK20` confirma que respostas antigas não restauram um snapshot sobre edições mais novas.

### Criar PR: handoff explícito, sem publicação disfarçada

O label é **“Criar PR…”**, tooltip “Preparar solicitação para o agente; revise e envie”. Clique prepara texto e referência à revisão corrente no **único composer**, não envia prompt, não usa provider e não cria commit/push/PR. Texto base: “Prepare uma pull request para as alterações desta sessão. Confira diff, branch e testes. Apresente as mudanças e peça confirmação antes de qualquer commit, push ou publicação.” Acrescentar somente IDs/paths/branch conhecidos, nunca credencial/URL com segredo. Não injetar o log inteiro.

Draft vazio: usar `usePrompt().set(prompt, cursorPosition)` com o tipo Prompt/normalização do editor existente e focar input. `usePrompt().current()`, `context.items()` e `capture()` são as fontes reais; não chamar reset nem model.set para preparar a ação. Draft não vazio: pequena confirmação **Acrescentar ao rascunho / Cancelar**; nenhuma substituição automática. Acrescentar preserva anexos, selection/context e conteúdo anterior. Troca de sessão enquanto modal está aberto **cancela o handoff**, fecha a confirmação e informa “A sessão mudou; nenhum texto foi inserido”. Não mantém a ação pendente para outra sessão. Ao confirmar append na mesma sessão, reler o draft atual e preservar edições feitas depois de abrir o modal; nunca sobrescrever com um snapshot antigo. Não criar outro input de mensagem nem estado global de intents. Envio continua sendo o botão normal e o fluxo de queue/permissão do host. A UI não exibe “PR criada” por preencher o campo; resultado real aparece pelo fluxo da sessão.

**Casos:** `WK19` reexecutar comando exato no contexto válido, double click e nova identidade; `WK20` workdir diferente/desconhecido, sessão trocada, ocupada, erro/timeout sem retry; `WK21` PR prefill em draft vazio/ocupado com anexos e zero networkcall até envio explícito; `WK22` openDir e share com capability/config negada e falha visível. S11 entrega botão/diálogo/intent, S10 entrega callback testado, S25 confere wiring. Não criar dependência circular S11↔S10.

<a id="w08"></a>
## W08 — Navegação das features, contexto e diagnóstico

As entradas do mock são **atalhos para superfícies reais**, não páginas de marketing. S06 mantém a sidebar e S25 adapta os comandos em `use-session-commands.tsx` (writer exclusivo), sem adicionar routers concorrentes. Props/eventos mínimos são entregues aos componentes; IDs abaixo são decisões da UI, não claims de APIs já existentes.

| Entrada | Destino decidido no cockpit | Observação |
|---|---|---|
| Chat | Sessão ativa / composer existente | Não criar nova sessão ao focar chat |
| Tasks | Expandir W05; `tasks.toggle` usa esta política quando cockpit=true | Legado mantém a tab antiga; não troca Dock/foco por auto-open |
| Agents | Expandir W06 com filtro agent | Não lista Atlas/browser/Janitor como agentes |
| Dock | Selecionar Browser em W04 e revelar rail | Não abre tab extra nem muda perfil |
| Atlas | Superfície de contexto existente + adapter Own de S19 | Não dispara “indexação” por clique; ausência do reader tem estado definido W1 |
| Maestro | Superfície de governança S20 relativa à sessão atual | Não muda agente/modelo selecionado; não simula aprovação a partir de todo |
| Janitor | Relatório S21 existente; sem relatório, empty read-only explicativo | Não iniciar PocketChat/scan por exibir menu; ações de diagnóstico apenas sob solicitação |

Atlas/Maestro podem abrir no mecanismo contextual/modal já existente com occlusion S16, preservando o rail. Quando sem sessão, textos curtos orientam selecionar/criar sessão; não exibir números/status fictícios. O primeiro piloto pode manter bindings de domínio ainda indisponíveis, explicitamente identificado como piloto; a entrega final exige todas as W1 ligadas. W2 live só fica habilitada com provas de autoridade já previstas em S19/S20, sem converter “backend não pronto” em faux botãoApprove.

**Estado de governança:** identidade de solicitação/revisão, freshness/hold e confirmação vêm do contrato S20. Permissão de tool, pergunta do agente e aprovação governada nunca compartilham um callback genérico “Approve & continue”. O site Approval Flow dentro de Browser não oferece autoridade ao harness. Todos os caminhos negados têm motivos no consumer, sem área vazia de feature.

**Casos:** `WK23` cada entrada abre o destino certo, volta por Escape e não muda conta/modelo/sessão inadvertidamente; `WK24` ausência de sessão/relatório/reader, HOLD e tentativas obsoletas não concedem autoridade. S19/S20/S21 verificam seus consumers; S25 liga os atalhos após W1, sem esperar W2 live para migrar UI honesta.

<a id="w09"></a>
## W09 — Acabamento, custo e receita de integração

**A estética não mudou.** Seguir tokens/medidas de SPEC e variantes do kit. Diferenças semânticas registradas em W01–W08 não autorizam outra composição. “Atividade” no lugar de “Agents online”, “Output” no lugar de terminal estático e ausência de percentuais fictícios são correções de significado; não remover os cards nem mascarar a sidebar na revisão visual.

**Microdetalhes:** altura de headers32px, hitarea>=28px, gaps8/12 e tipografia12/14 conforme SPEC; ícones16, estados por texto+ícone, foco visível sem mudar dimensão. Títulos/path longos fazem ellipsis com acesso ao texto inteiro; conteúdo de checklist pode quebrar linha. Zero botão aninhado em botão; row com ação secundária usa foco/propagação separados. Enter/Space ativa row, Escape fecha somente overlay atual e devolve foco à origem se ainda existir. Roving tablist Browser/Files/Docs/Terminal, arrows/Home/End e aria-controls correspondentes; pane oculto é inert/não focável. Nenhum aria-live por segundo ou por token; anunciar mudança de estado, não relógio.

**Estados vazios e falhas não são placeholders:** linguagem da fonte, tamanho estável sem brilho animado ilimitado, ação pertinente e nenhum “healthy” por ausência. Loading nativo não é teste aprovado. Incerteza de envio, output parcial, denied e stale usam rótulos diferentes. Sem erro somente no console. Hover/disabled/pressed/focus/reduced-motion continuam Q01–Q16.

**Perf continua P01–P12/P03 combinado.** Nenhum budget aumentado. Tema porCSS; projections porID; timestamp format só em rows visíveis; parse após término; caches limitados e liberados; nativebounds somente em mudança. Render, parsing e timers cosméticos de widgets invisíveis não continuam trabalhando. Execuções legítimas, o PTY existente e a sincronização necessária para intervenções seguem a política do host; esconder UI não cancela o trabalho do usuário. Uma fonte de Tasks, um subscriber Dock, JanitorProvider já existente, um composer e um terminal renderer visível. Novos workspaces/reloads não podem multiplicar listeners. CPU/RSS medidos no mesmo build que contém os widgets bonitos, não numa variante sem eles.

**Dependências mínimas:** S09/S10/S11/S15/S17/S18/S21 implementam em seus escopos, usando contratos de props/callbacks aqui fechados e fixtures locais nos testes. Nenhum novo prerequisito do piloto. S25-W1-T1 conecta as entregas no aplicativo real; seus builds/smokes locais não exigem o parecer futuro de S23/S24. S23 mede e S24 inspeciona W01–W08; S25-W1-T2 só encerra com o mesmo candidato. Faltou um export do fornecedor? Defeito volta ao owner, não novo writer no hotspot.

### Casos integrados que o Codex deve executar

`WK25` — No mesmo aplicativo: selecionar sessão → ver checklist real → escolher diff → abrir output de teste → percorrer quatro panes → expandir Tasks e Atividade → abrir/voltar de child → preparar PR sem enviar → trocar tema. Draft, seleção e identidades preservados; nenhuma mensagem/processo/PR criado por mera navegação.

`WK26` — Mesma sequência com8sessões×8children e eventos controlados do perfilP1; input/scroll/foco e atualização local permanecem dentro dos gates. Capturar DOM/projeções/subscribers/parse/PTY/nativeview contados; uma alteração de part não reprocessa histórias de outros children.

`WK27` — Falhas: desconexão/servidor trocado, permissão negada, output truncado, crashDock, modal sobre browser, readerOwn ausente eJanitor semrelatório. Cada estado é honesto e utilizável; o gate não aprova widget removido para evitar o caso.

`WK28` — Viewports da cobertura eDPR2/zoom200, textos EN/PT-BR, teclado/reduced-motion. Comparar a disposição ao master, a marca aoSVG oficial e as diferenças de copy acima; não rasterizar a UI nem adicionar um overlay de screenshot.

Uma captura pode comprovar vários widgets realmente presentes no mesmo estado; registrar os consumidores, não repetir bytes artificialmente. Medições válidas do mesmo candidato podem ser reutilizadas. Os testes da infraestrutura do plano verificam o contrato, **não** substituem WK01–WK28 de produto.

### Sequência operacional curta por owner

1. Abra sua seção Wxx, a task pelo seletor e os arquivos da tabela de fontes. S01 resolve somente mudanças reais do checkout, não deixa sem decisão o comportamento já fechado aqui.
2. Capture baseline; implemente no scope da task; teste os WK atribuídos com identidades/outputs locais controlados. Não usar as fixtures Python do plano como provas do app.
3. Publique o componente/callback tipado + testes + sua evidência local. S25 conecta, S24 captura os consumers registrados e S23 mede os hotspots/gates.
4. Atualize recibo e progresso somente após validar os cinco axiomas no estágio correto. Operação de UI obrigatória sem binding real reprova; capability ausente só aceita a alternativa explícita deste contrato.

**Decisões de produto fechadas não equivalem a produto pronto.** S01/capacidades externas e calibração de hardware continuam verificações de execução. Não inventar backend existente, formatos extras de testes ou controles com efeito diferente para alegar conclusão.


## Verificação desta especificação e limites

A revisão 4.3 fecha comportamento e bindings, não verifica a implementação. `fixture.json` continua demo-only e agora usa shape de checklist content/status/priority, Files executed e rodapé Bun explicitamente sintético; a coleta de exemplos reais pertence a S02/S11. A mesma fixture deve ser aplicada às medições/capturas do candidato; ela não autoriza executar comandos ao carregar dados. Nenhuma arte aprovada foi alterada.
