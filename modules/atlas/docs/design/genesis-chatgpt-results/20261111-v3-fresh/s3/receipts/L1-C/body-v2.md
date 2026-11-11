# L1-C — Especialistas e integrações: base verificável

Fonte: `gustavomhss/hugr-orchestra@1cde2ff7a71bcf7aecb5d030917b577165135d38`. Protocolo: `ee2521a5b966bd505cc95bd1c733e09e12f33531`. Unidade `L1-C`, S3.

**Escopo:** entradas, consumidores, identidade, autoridade, empacotamento e lifetime. “Observação” é leitura estática, sem execução; “intenção” é prescrição documental; “interpretação” é consequência inferida; “gap” é limite não comprovado. E01–E12 remetem a `review-evidence.md`; `sources.json` guarda revisão, blobs, SHA-256 e capturas; `coverage.json` enumera caminhos/profundidades.

## 1. População e necessidades

As **429 entradas Git** foram reconciliadas. Skills, companheiros, testes e pesquisa respondem a necessidades de família, sem uma necessidade por arquivo.

| Família | Entradas | Necessidade compartilhada e profundidade L1 |
| --- | ---: | --- |
| `modules/specialists/{backend,archie,team}` | 92 | Entender papel, consumo e embarque das árvores; leitura dos READMEs, raízes representativas e código de consumo; demais nós classificados por árvore. |
| `modules/engine-adapters/claude-code` | 23 | Contrato de execução, portas de autorização, identidade, conta e processo; leitura do host/SDK/resolver e superfícies auxiliares. |
| `modules/capability-assets` | 75 | Separar proveniência, presets e texto adaptado de ferramentas disponíveis; catálogo e manifestos lidos, assets classificados por skill/companheiro. |
| `modules/app-dock` | 21 | Distinguir hooks, MCP por interface, canais, permissões e resultados incertos; leitura dos pontos de registro/RPC e consumidores. |
| `modules/janitor` | 13 | Distinguir scanner implementado de integração ativada e de limpeza; leitura do scanner, scheduler, bootstrap e estado. |
| `packages/jimmy-specialist` | 21 | Distinguir as duas skills atuais de documentos históricos de pesquisa/qualificação e do host real. |
| Specs, guia, manutenção e brief associados | 184 | Reter intenção, evidência datada e conflitos; leitura seletiva dos índices/handoffs e classificação explícita dos demais documentos. |

Entradas não lidas individualmente têm **classificação por família** e fonte representativa. Membership completo não significa leitura completa. Nenhum teste presente comprova PASS. Sem L2–L4 ou skill instalada.

## 2. Identidade e autoridade dos especialistas

**Observação.** `Seat.id` é identidade de roster, agente e chave `agent.<id>`. `backend`, `archie` e `jimmy` são endereços estáveis. `upstream` é a projeção de perfil de `archie`, não outro agente nem base nova de permissão. O resolver V2 seleciona a variável de label do seat, depois `agent.<id>.name`, depois o fallback; o id continua o endereço. `AGENTS.md` mantém Maestro fixo. O antigo id do backend é derivado do único literal central e normalizado por `canonicalMemberId`; isso é compatibilidade de leitura, não autorização para escrever aliases novos. [E01; `roster.ts`, `seats/seat.ts`, `v2/seats.ts`]

| Seat | Contrato observado | Separação de autoridade |
| --- | --- | --- |
| `backend` | Implementação backend dentro de packet completo; `backend-result`, `backend-work-result-v1`; `writeRoots`, `strictResume`, `atlasMemory` e `toolkit` habilitados na definição. | Não recebe investigação, diagnóstico, arquitetura, delegação, autorrevisão/aceite, publicação nem instalação como atribuições. O packet fornece `writePaths`; sem eles a descrição exige leitura somente. |
| `archie` | Produto, arquitetura, especificação e planejamento; `planner: true`, perfil de execução com `profileKey: upstream`; `upstream-result`/`upstream-work-result-v1`; write roots, resume estrito e Atlas habilitados. | Autoria de propostas não aprova escopo, não implementa produto, não despacha nem executa workflow. Seu grant Arsenal é o subconjunto de authoring; não transforma a identidade em Maestro. |
| `jimmy` | Exploração e pesquisa; perfil `discovery`, `discovery-work-result-v1`; `strictResume`, `atlasMemory` e `research`; sem write roots nem toolkit backend. | Produto é somente leitura. Acesso para escrever corpus/documentos nativos e memória vinculada não é permissão de editar produto nem de ratificar sozinho. |

Em `v2/seats.ts`, o host aplica o piso do perfil, nega edição das árvores de skills externas ao projeto e aplica a matriz de visibilidade: ferramentas governadas para Maestro, review para `lucy`, pesquisa para o seat de discovery e memória para os seats que a declaram. Skills e playbooks de outro dono são negados. **Interpretação:** a prosa do charter orienta o trabalho; as regras de ferramentas, o runner e ToolSafety são fronteiras de enforcement distintas. Não se deve vender cada proibição semântica do charter como detector automático de intenção. [E02; `v2/seats.ts:76–120,188–232`; `roster.ts:baseProfiles/seatProfile`]

## 3. Árvores de skills, geração e instalação

**Observação.** Os módulos de especialistas são assets, sem implementação de runtime própria. `Seats.skillSource` resolve `backend`/`archie` sob `modules/specialists`; outros seats, incluindo `jimmy`, sob `packages/<id>-specialist/skills`. `sharedSource` resolve a árvore `team`. O backend declara sete raízes próprias — implement, api, data, concurrency, refactor, check e codegen — mais `team-stack`; `archie` declara plan, work-package e workflow; `jimmy` declara calibration e web-research. [E02–E03]

`seatSkillsModule` lê as árvores declaradas, valida seus conteúdos e gera o módulo virtual `orchestra-seat-skills.gen.ts` para os builds Bun/Node; compartilha `team` uma vez e inclui os playbooks de Maestro. Em execução de fonte, lê as árvores no lugar. Em build compilado, `SeatSkillRoot` exige o embed, valida membership e extrai uma cópia em cache por versão e digest. O digest incorpora nomes relativos e bytes; cópia íntegra é reutilizada, versões antigas permanecem, e conteúdo adulterado/parcial é reconstruído sob lock por publicação via diretório temporário. Ausência/árvore estrangeira falha, não produz plugin vazio. [E03; `seat-skill-root.ts:17–100,102–132,149–180`]

**Disposição de gerados:** o módulo virtual é gerado fora destas 429 entradas; quatro READMEs de módulos contêm bloco de contrato gerado. Os nós `backend-codegen` são receitas: o scaffold `packages/core/script/toolkit-pack.ts` cria/atualiza pack, receita e índice gerado de entry skills. A receita não contém a implementação do engine. Documentação ao lado de `skills/` é repo-only; cada companion dentro da árvore entra no payload. A classificação preserva a diferença entre texto autoral, receita mantida pelo scaffold e produto gerado. [E03–E04; `AGENTS.md`, `toolkit-pack.ts:8–15,26–35,64–70`]

**Limite instalado.** O Core adquire engines host-pinned sob demanda e expõe `BACKEND_TOOLKIT_BIN`; readiness tem estados `absent`, `fetching`, `ready`, `failed`, `unsupported`. Um arquivo de recipe ou pack não implica `ready`. `target.ts` recusa Linux musl e Windows ARM64 e aplica pisos de plataforma/CPU; o resolver Claude tem outro conjunto de targets, portanto não se deve transferir suporte de um para o outro. A recipe ast-grep distingue transformação sintática de rename semântico e limita arquivos/matches ao packet. Nenhum engine foi adquirido. [E04; `backend-toolkit/index.ts:17–38,67–133`; `target.ts:27–52`; recipe ast-grep]

## 4. Discovery: pacote documental versus host efetivo

**Observação.** O pacote `jimmy-specialist` contém 19 documentos e duas skills opcionais. Elas ensinam calibração de buscas/contagens/gates e atribuição de fontes web; não constituem um segundo loop. A declaração única `ResearchSeatTools` fornece ferramentas próprias (`research_capture/view/record`, inquiry, consultas de código, probes e Atlas), auxiliares de loop e saídas retidas. O seat atual e o prompt apontam às duas raízes presentes. O prompt determina que `inquiry close` produz o resultado pelo host, em vez de o modelo escrever um fenced card. [E02, E11; `seat-tools.ts`; `seats/prompt/jimmy.txt`]

O vínculo não vem de um argumento autodeclarado: `ResearchBinding.require` compara CapabilityInvocation, owner/agent, Session de execução e placement retido; `resolve` valida Project, `Task.Bound`, Session de autoridade e relação pai/filho. Também exige a parte de ferramenta do assistente correspondente. `ResearchInquiry.fold` recompõe registros/eventos do ledger; um write posterior invalida o check anterior; o check usa corpus vinculado, bytes retidos, verificadores e liveness. **Interpretação:** identidade persistida e referências são pré-condições para evidência; nem um card parseável nem uma URL citada estabelecem suficiência semântica. [E11; `research/binding.ts:21–103`; `v2/tools/inquiry.ts:45–80,133–178`]

**Conflito preservado.** `DELIVERY.md` ainda diz que existe uma skill única `jimmy-reference`, enquanto definição, prompt, duas árvores presentes e `jimmy-method.test.ts` indicam duas. `HANDOFF.md` preserva o modelo Claude de plugin subagent de outubro; o host V2 atual usa Session filha via `task`, e a spec de meta-harness registra a revisão de 28/10. O charter de 10/10 descreve qualificação falha; o handoff posterior declara a campanha encerrada e os estudos anteriores superados. Nenhum desses status históricos foi convertido aqui em bloqueio atual genérico ou aceite novo. Seus limites de modelo, retries invisíveis e R14 continuam atribuídos à evidência datada, sem alegar requalificação no pin atual. [E12]

## 5. Claude: integração, execução e recusas

**Entrada e dono.** `apps/cli/src/host.ts` inclui `ClaudeCodeHost.contribution`. Ela substitui `ExecutionHost` e o serviço de conta, e fornece a extensão de catálogo. O contrato de `ExecutionHost.Turn` mantém persistência no runner: fornece history, context, ferramentas filtradas, `execute`, `authorize`, perguntas, estado e steers. `engineOf` é a porta de seleção de engine de uma Session; o adapter não vira dono independente da Session. [E05–E06; `execution-host.ts`; `apps/cli/src/host.ts`]

**Prompt/contexto.** O SDK exige estruturalmente `systemPrompt.type=preset` e `preset=claude_code`; nem um cast pode suprir prompt customizado. O host usa um append curto para Maestro, ou nota e prompt próprio para outro seat. `Turn.context` entra por `UserPromptSubmit.additionalContext`, com hash e ids entregues; não é reanexado ao system prompt. Usa apenas settings de projeto e modo default. Compaction tem hooks de recall/archive. São caminhos de código, não uma prova ao vivo da aceitação do fornecedor. [E05; `host.ts:228–252,263–303`; `sdk.ts:42–50`; `host/options.ts`]

**Ferramentas e autoridade.** O MCP interno `orchestra` oferece apenas as ferramentas de `turn.tools` não duplicadas pelos built-ins/loop. Claude `Agent`/`Task` são desabilitados e recusados: delegação deve usar `mcp__orchestra__task`, criando Session filha durável. `ListAgents`, `SendMessage`, `RemoteTrigger` e `PushNotification` são recusados porque atravessariam o alcance da Session. [E05; `host.ts:28–63,158–171`]

O gate `PreToolUse` e `canUseTool` compartilham uma decisão por tool-use id. Built-ins passam por `turn.authorize`, que associa permissão e chamada de ToolSafety; exceções/aborts do check recusam. Ferramentas Orchestra assentam por `turn.execute` no registry, com o sinal de cancelamento do MCP. `ToolSearch` só carrega schemas, não substitui autorização da operação. Para Maestro, built-ins não mapeados e fora da lista de bookkeeping são recusados. [E05; `host.ts:149–225,574–593`; `execution-host.ts:36–56`]

**Gate governado específico.** `maestro_*` exige carregar `maestro-run-governed` com o tool `skill` do MCP Orchestra. Apenas sucesso dessa chamada marca a Session no Set em memória. `maestro_arsenal_*` e `maestro_workflows` são exceções desse pré-requisito, não exceções dos seus controles de autorização. O estado é por Session no processo e se perde no restart. A sincronização nome/prompt/playbook exigida por `AGENTS.md` faz parte do contrato de manutenção, não pode ser substituída por carregar uma skill Claude homônima. [E05; `host.ts:38–42,162–168,588`; `AGENTS.md`]

## 6. Claude: identidade, lifetime, conta e distribuição

**Observação.** A chave de estado `claudeCode` mantém compatibilidade com metadata legada. O host reutiliza `state.sessionId` ou deriva UUID estável da Session Orchestra, conserva ids de mensagens entregues e retoma a conversa Claude. Seu mapa de tails é por Session: fecha a cauda anterior antes de novo turno; trabalho de background pode reter query após o resultado até notificar, terminar ou atingir 30 minutos. A notificação entra por `turn.notify`, não como evento tardio do stream encerrado. [E06; `host.ts:21–23,109–128,314–349,551–570,684–692`]

`processLifetime` captura o processo no único spawn seam do SDK e `join()` espera os eventos reais de saída; `Query.return`/abort não são recibos de exit. O host cancela e faz join na finalização, ressalvada a cauda mantida. O ambiente de origem e a credencial pertencem ao dono/Claude Code; o adapter remove metadados de rollout/entrypoint e acrescenta o opt-in de todo tools. Não obtém nem fabrica credencial para o modelo. Recusas de autenticação e billing são representadas, não autorização para login ou retry invisível. [E06; `sdk.ts:19–50,58–93`; `host/options.ts:21–28`]

`account.ts` consulta `accountInfo()` sem prompt; falha preserva o último signed-in, não prova sign-out. Login explícito tem um slot por processo. O catálogo adicional exige engine de Maestro `claude-code`, provider permitido e conta signed-in; seat secundário Claude não habilita o picker principal. [fontes `v2/account.ts:13–84,93–146`, `v2/catalog.ts:13–54`]

O manifest fixa SDK `0.3.289`; `executable.ts` fixa Code `2.1.289`. Override de executável precisa ser caminho absoluto real. Recursos compilados exigem manifest, versão, target, arquivo e SHA-256 correspondentes, sem escape do diretório implantado; execução de fonte pode usar resolução do SDK. **Gap:** nenhuma existência de binário, login, chamada de modelo, restauração ou aceitação em máquina instalada foi observada nesta execução. [fontes `package.json`, `executable.ts:14–105,155–163`]

## 7. Capability assets: proveniência não é runtime

**Observação.** O catálogo possui A01–A32: 12 skills, 12 provider packs e oito fontes native. `nativeNames` é correspondência semântica; `packID` é id de plataforma; `destination` não registra tool. A população materializada só possui `assets/skills` (63 arquivos, incluindo 14 raízes, as do catálogo mais platform-cli e vault-operations). Os 20 destinos provider/native são reservados, não arquivos implementados. [E07; catálogo e população]

`providers.ts` declara endpoint/transporte/auth/filtros; não abre conexão nem fornece schema aprovado, conta ou receipt. A proveniência registra pins de Hermes/OpenClaw e licenças MIT com blob SHA-1 de licença. O SHA-256 calculado nesta execução é identidade dos bytes capturados, não validação da licença, dependências ou operação. [E07; `sources.ts`, `providers.ts`, `NOTICES`]

O README afirma que nenhum workspace importa o pacote e nenhuma raiz de seat carrega esses assets. O Core contém dados transcritos em capability MCP/verifiers; o arquivo `service/PROVENANCE.md` ainda cita o antigo caminho `packages/capability-assets`. Isso é proveniência histórica, não alias ativo para consumo das skills. A spec `source-qualified` mantém pendentes copied-file digests, integridade/licenças de dependências, conformance e live acceptance; scripts companheiros precisam de sua própria revisão. **Interpretação:** um item listado ou uma skill adaptada existente não permite dizer “capacidade instalada e pronta”. [E07; `packages/core/src/capability/service/PROVENANCE.md`]

## 8. Dock: duas superfícies e um receptor desktop

**Entrada.** `createAppDockHooks` e `createLinuxWorkspaceHooks` recebem `Transport`; `AppDockTools.contribution` registra tools V2 e substitui `McpProvided.node`. `serve` só inclui a contribuição quando `AppDockSocket.fromEnv()` recebe URL e token; o socket envia Bearer. O receptor pertence a `apps/desktop/src/main`, não ao módulo. Não há canal por default fora do desktop. [E08; `application-tools.ts:73–121`; `socket-transport.ts:8–24`; host/serve]

**Hooks diretos.** V2 resolve Session/Location para `PermissionV2.authorize`. `scope()` prioriza `linux` por default para `linux_*`, `ui_*`, `dock_find` e `dock_action`; nos outros agentes, regras próprias posteriores podem sobrepor os denials inseridos. O perfil `linux` preserva regras configuradas de `linux`/`dock`. `linux-workspace` autoriza cada operação e envia `sessionID`; paths são internos. Terminal tem UUID e dono Session; ACK de escrita não prova conclusão. [E08; `application-tools.ts:82–102,146–179`; `linux-workspace.ts:43–86,137–174`]

**Servidores MCP por interface.** Cada tab e workspace aberto vira `dock-<host>` ou `dock-linux`, com sufixo para colisões; `tabID:generation` é chave de reconexão. Oferecem look/find/act/wait, navigate para browser e apps/launch para workspace. São ferramentas MCP comuns para agentes/engines com permissões aplicáveis; o Core chama `permission.assert` pelo nome do tool antes do MCP. Não herdam automaticamente a restrição do hook direto ao agente `linux`. Servidor configurado com mesmo nome prevalece. O tracker mantém a última resposta se discovery falhar; lista vazia bem-sucedida remove ausentes. [E08; `dock-mcp.ts:41–101,489–517`; `mcp.ts:175–187,235–255,770–821`; `provided.ts:27–40`]

**Lifetime e efeitos incertos.** Servidores são efêmeros, não escritos em config. Reaper observa Session deletada e envia `linux.session.close`; o código comentado atribui ao desktop o cancelamento de calls/processos/terminais do dono. Ler uma interface não prova que ela existe após churn: refs e completeness importam. A ação nativa localiza de novo, exige cobertura/uniquidade e faz no máximo um retry de stale-ref comprovadamente `not-dispatched`; resultado `unknown` não é repetido. Há limite de 32 RPCs pendentes; timeout/cancelamento preservam incerteza de efeito. [E09; `app-dock.ts:65–129,348–390`; `application-tools.ts:124–143`]

**Limites observados/declarados.** MCP usa árvore de acessibilidade, sem screenshot/modelo; outline corta a 40.000 caracteres, texto a 20.000 e wait a 15 s. Linux pode expor árvore parcial ou nenhum controle acessível, precisa serializar leituras que invalidam cursores e não pode inferir sucesso de ACK. A existência dos handlers não prova desktop, AT-SPI, apps ou workspace configurados. [E09; `dock-mcp.ts:3–5,34–37,127–130,165–181,324–345`; guia e skill de manutenção]

## 9. Janitor: observação e notificação, sem limpeza automática

**Observação.** `scan()` executa exatamente três grupos: disco, processos e portas. `Finding` contém kind/severity/summary/evidence/suggestion; `Report` tem timestamp e findings ordenados. Há allowlist de comandos, timeout de cinco segundos, saída máxima de 256 KiB e erro para exit não zero/truncamento. Allowlist e thresholds não provam scanners adicionais: POSIX resolve df, ps e lsof; Windows usa scripts PowerShell fixos. Falha de scanner retorna finding de indisponibilidade, não sistema limpo. Não há rm, kill ou prune no scan. [E10; `scan.ts:7–45,162–208,347–350`]

O scheduler começa com intervalo de 15 minutos e dedupe de 24 horas, limita intervalos e guarda no máximo 1024 chaves; decide emissão por relatório alterado/finding fresco. Bootstrap recebe sink externo e compartilha uma única fiber por processo entre scopes. Quando o último scope sai, interrompe a fiber e apaga o relatório em memória. `ORCHESTRA_JANITOR=0` desabilita; a variável de intervalo muda config. [E10; `bootstrap.ts`; `scheduler.ts:20–34,59–122`]

**Fronteira importante.** O módulo não grava relatório em disco nem importa bus. O desktop tem seus próprios handlers/estado: persiste report/snooze/dismiss no store `orchestra.janitor`, valida sender da janela principal e compara source em dismiss/snooze. Esse store não é persistência do módulo scanner. O README registra ausência de consumidores do pacote; `ProductHost.contributions` lido não o inclui. **Gap delimitado:** não há nesta base demonstração de ligação ativa scanner→sink→UI; não chamar a feature de “rodando” porque o módulo e a UI existem. [E10; `apps/desktop/src/main/janitor-ipc.ts:49–69,99–133`; host]

## 10. Intenção, histórico e evidência de testes

**Specs backend:** README/catalog/integration-flow são propostas datadas; o README registra que a antiga ponte plugin Composer V1 foi apagada e o seat atual permite o MCP configurado `hugr-composer`. O acceptance record e handoff orientam a história, mas citam revisões e caminhos antigos; até a contagem “seis entry skills” diverge das oito raízes atuais contando a compartilhada. Conservar os contratos e a cronologia, confirmar forma instalada pelo código atual. [E02, E12]

**Specs upstream:** oito documentos mantêm propostas, correção de id e provas datadas. `archie`/`upstream` não transforma nomes antigos em aliases nem transfere aprovação/execução. A árvore atual adiciona workflow às duas raízes da documentação anterior. O estudo E/P relatado tem uma execução por braço; sua prova remota não foi auditada aqui. [E02, E12; `NAMING-CORRECTION.md`, `EVIDENCE-2026-10-11.md`]

**Pesquisa de review:** os 34 pares pergunta/resposta sob `docs/specs/lucy/research` são corpus de pesquisa, não ferramentas ou skills instaladas nem um novo parecer desta campanha. As respostas examinadas identificam limitações próprias; disposições das outras perguntas/respostas preservam membership e profundidade não lida. O brief RD-JANITOR descreve migração antiga de `removed-v1`, não instrução ativa para este produtor. [fontes de pesquisa selecionadas; `coverage.json`]

**Testes:** a população cobre catálogo, credential/preset/lifetime do SDK, seats/host, Dock/foco/targets/outline/MCP e scanner/scheduler/bootstrap. Definições selecionadas foram lidas; demais testes têm classificação por contrato. Não executei produto, testes, typecheck, CI, login, fornecedor, desktop ou Atlas. Executei captura, decodificação, hashing e reconciliação de evidência. `AGENTS.md` exige testes em Actions.

## 11. Alcance e gaps que acompanham o resultado

1. **Suficiência L1 sujeita a revisão:** bytes e cobertura foram conferidos, mas ainda dependem dos dois pareceres da orquestradora; nenhum PASS semântico é emitido pelo produtor.
2. **Runtime não observado:** não há recibos novos de execução Claude, shell confinado, Dock, Janitor, pesquisa ou Atlas. Conhecimento estático não é prova operacional nem release acceptance.
3. **Assets pendentes:** capability source qualification conserva as pendências do próprio manifesto; presets/scripts não autorizam conectividade ou uso.
4. **Histórico preservado:** conflitos identificados não foram editados nem silenciosamente resolvidos; provas antigas continuam atribuídas às revisões/origens declaradas, inclusive material externo indisponível citado pelos handoffs.
5. **Profundidade explícita:** cobertura integral de membership não pretende leitura integral de todos os research reports e leaves. Os pontos de consumo/autoridade foram lidos; cada entrada restante conserva família, necessidade, profundidade e fonte representante.

L1 pronto para avaliação; publicação Atlas e consumo real permanecem distintos.
