# CONTRACTS — fronteiras de implementação entre owners

Estas são especificações de adaptação, não alegações de que interfaces homônimas já existam no repositório. Reutilize o tipo/componente equivalente do host. Crie somente o seam mínimo quando ele faltar. Não transforme esta lista em nova plataforma de UI.

## C-01 — identidade e fonte

Toda entidade de sessão usa `(serverKey, sessionID)`. Child task acrescenta `childSessionID` e/ou `callID`, preservando a chave real do host. Arquivo/revisão acrescenta path canônico e identidade de snapshot/revisão disponível. Uma label nunca resolve credencial, branch, perfil, tarefa ou destinatário de ação.

Estados desconhecidos não são `0`, `healthy`, `completed`, `online` ou `fresh`. Use `unknown`/`unavailable` com motivo. Metadata sem origem não ganha certeza por passar pelo renderer. O tipo específico do host prevalece sobre as palavras usadas no mock.

## C-02 — shell, slots e ativação (S06 → S25)

O shell apresenta cinco regiões: navegação, barra de contexto, transcript, composer e rail. Os children/slots usam o mecanismo Solid existente; não montar outra árvore de providers para preencher um slot.

S06 entrega composição, dimensionamento e contratos de slots. S25 conecta o controller real da sessão, shared providers e a preferência reversível. `orchestraCockpit` é o nome proposto de uma opção booleana no settings existente se não houver opção equivalente; default inicial `false`, opção ligada explicitamente para executar/validar a migração. Não reutilizar uma flag de runtime com outro significado. Persistência deve usar o mecanismo do host. Migrar o tema não migra conta, modelo ou permissões.

Em viewport largo, o rail contém Dock, Tasks e Atividade simultâneos. `activeTab` legado não pode ocultar dois desses três. Na nova composição, pedido automático de Tasks torna o resumo visível/expandido, respeitando snooze; não desmonta o Dock, muda a sessão ou rouba foco. No modo legado, a política existente fica intacta. Essa adaptação limitada pertence ao integrador, não a três listeners concorrentes.

Testes de integração obrigatórios: mudar sessão no mesmo servidor não remonta o provider; mudar servidor troca a identidade corretamente; input/seleção/scroll sobrevivem; desativar a opção retorna à composição anterior sem apagar dados. Roteamento atual continua sendo a fonte de verdade.

## C-03 — dados de Tasks (S17 → S18)

O produtor é a projeção derivada dos stores sincronizados. O consumidor recebe acesso reativo a:
- identidade real, tipo `agent` ou `shell`, título e parent session;
- estado distinguido pela fonte e pedido de intervenção correspondente;
- tempo de início/fim quando conhecido; nome do modelo/provider/credencial apenas como metadata;
- contagens/custo/tokens quando disponíveis, com ausência explícita;
- referência para abrir o transcript e para solicitar interrupção da entidade correta.

Não criar REST endpoint ou store persistente somente para esses cards. S17 controla deduplicação, índices derivados, invalidação e limites. S18 controla apresentação e callbacks existentes. Um resumo não solicita novamente o histórico inteiro. Um detalhe não cria outra task.

Mapeamento: `needs-input` tem precedência visual sobre “running”; falha não deve ser perdida por um tool part marcado completed; uma fonte que só sabe idle não prova sucesso. Progresso sem total mensurável permanece indeterminado. Não usar tokens gastos como percentual de conclusão.

Fixture deve exercitar: tool antes de child; child antes de tool; mesmo evento repetido; erro tardio; permission pending; cancelamento; ausência de transcript; mesmo ID em dois servidores. Mudanças de uma part não revarrem sessões não afetadas.

## C-04 — atividade tipada (S17 → S18/S21)

Card “Agentes” só pode conter agentes reais. Card “Atividade” pode conter agente, ferramenta/browser e sistema/scanner, sempre com tipo visível/acessível. Atlas não ganha uma sessão executora imaginária. Janitor não ganha status online eterno. Títulos e contadores derivam da mesma coleção, não de constantes separadas.

Ações são capacidades: abrir transcript, abrir Dock ou abrir relatório são callbacks distintos. Tipo incompatível não recebe botão genérico de executar. A ausência de capability renderiza indisponibilidade explicada, não botão com toast de sucesso.

## C-05 — evidência e revisão (S09/S11 → S25)

A lista de alterações consome a projeção de VCS/diff já existente. Seleção armazena a identidade de arquivo/revisão, não só índice da lista. Requisição atrasada de outra seleção não substitui o diff atual. Cancelar/ignorar resultado tardio usa o mecanismo de cancelamento do host.

Para teste/terminal, a UI pode apresentar: ID de tool call/execução, comando, status, exit code, horário e output. Estatísticas de testes aparecem apenas quando houver parser ou resultado estruturado confiável para aquele formato. Sem isso, apresente log bruto e código de saída, sem afirmar quantidade de testes. `exit=0` só comprova o comando executado, não a aprovação de toda a aplicação.

Se a execução não contém revisão de código rastreável, rotule como execução observada na sessão, sem declarar que valida o diff atual. Não inventar vínculo de SHA a partir de horário aproximado. A fixture congelada pode demonstrar o layout, mas não autoriza esse vínculo em produção.

O slot de evidência reutiliza renderers e file context existentes. Não montar editor/diff engine separado. Abrir resultado completo navega à evidência existente. “Run again”, “Open in editor”, “Share” e “Create PR” só usam ações suportadas e permissões vigentes. UI não publica automaticamente.

## C-06 — fronteira nativa do Dock (S16 → S14/S15/S25)

S16 mapeia a API real e registra quais campos já existem. Contrato conceitual de identificação: janela/sender, `tabID`, generation quando disponível e perfil/partição sob autoridade nativa. O renderer não pode escolher a partição de outra janela por label.

Bounding box usa a conversão existente entre CSS viewport e bounds nativos. Input inválido, zero size, sender inválido ou generation velha não atualiza outra view. Faça read/layout antes de write/IPC, agrupe mudanças e envie no máximo uma por frame enquanto há mudança. Em idle, nenhuma amostragem contínua de bounds ou screenshots.

Overlay que intercepte a região do browser deve obter oclusão/visibilidade pelo mecanismo nativo; z-index CSS não resolve. Fechar overlay restaura a mesma view e foco apropriado, sem recriar login/tab. Overlays aninhados precisam de contagem/token por owner para que o fechamento do primeiro não revele a página atrás do segundo. Reutilize o protocolo equivalente se o host já o fornece.

Scroll do rail não pode deixar a view fora do retângulo visual ou vazando sobre cards. Preserve clipping real do host; caso indisponível, mantenha o Dock ancorado no topo e permita scroll do grupo Tasks/Atividade abaixo. Essa adaptação limitada conserva ordem, largura e aspecto do master; não reduzir tudo a abas exclusivas. Toda mudança de scroll/resize deve ser comprovada no Electron, não apenas no DOM.

Fechar uma aba passa explicitamente seu tabID. A base inspecionada fecha todas sem esse ID. Não chamar close-all para trocar visual de painel. Esconder painel não é destruir perfil. Restore após crash usa o lifecycle existente, não novo browser.

Testes negativos: sender de outra janela, generation antiga, retângulo inválido, nested overlay, callback após close, resize no DPR2/zoom200%, fechar uma aba preservando as demais. Preserve sandbox, HTTPS, DevTools, permission checks e caps de recursos.

## C-07 — capability read (S19/S20 → consumidor de domínio)

Use a união discriminada equivalente do host. Na ausência de um contrato existente, o adapter de apresentação tem um estado dentre `available`, `unavailable` ou `hold`:

| Estado | Campos obrigatórios | Regra |
|---|---|---|
| available | identity, source record/revision, payload e freshness que o produtor comprova | Dado limitado e derivado de fonte autoritativa, não do argumento do modelo |
| unavailable | capability e reason | Não habilitar ação de execução nem produzir conteúdo falso |
| hold | identity disponível, reason e conflito/staleness comprovado | Não promover para available por fallback genérico |

Essa união é proposta para fronteira de UI, não um schema servidor que deva ser criado cegamente. Quando o servidor já oferece equivalente, adapte sem duplicar contrato de domínio.

W1 implementa views e capacidades presentes, incluindo ausência segura. W2 implementa somente reader/projection que faltar depois de #106/#108/#109/#112/#113/#114 pertinentes terem autoridade operacional comprovada. Não reconstruir o mecanismo upstream. Issue fechada e biblioteca unit-tested não provam caminho público alcançável.

W2-T1 entrega consumer local tipado e exercitado; W2-T2 exige o consumer público conectado ao candidato, não apenas uma função exportada. Shared registry/client generation usa lease `public-api-registration-and-client-codegen`, sequencial e oficial; não escrever generated à mão. Se precisar reabrir root wiring de S25, registrar rework e invalidar todos os gates afetados no novo SHA. Release antiga não se aplica à integração posterior.

## C-08 — copy, UI states e permissões (S22 → todos)

Cada controle possui label, estado disabled/loading/error e destino real. Use keys existentes primeiro; S22 é único writer de novas traduções. Outras lanes solicitam nova key no contrato de copy e recebem o commit, sem editar dicionários em paralelo.

Pergunta do agente, permissão de ferramenta e aprovação governada são eventos diferentes. UI preserva cada identity e handler. Não mapear todos para “Approve & Continue”. Estado visual jamais concede a autoridade ausente.

Microestados mínimos por componente interativo: default, hover, pressed, selected quando aplicável, focus-visible, disabled, loading e error. Ausência deliberada de um estado exige justificativa do componente, não campo omitido no recibo. Clique/hover/foco não altera box size. Seleção não desaparece ao focar vizinho. Loading não substitui label informativa por espaço sem dimensão.

## C-09 — fonte única e fechamento por estágio

PLAN.json é a fonte de nós, axiomas, dependencies, acceptance_requires, scopes e gates. SURFACES.json é fonte de superfícies, capacidades, estados e owners. CENSUS.json representa arquivos concretos do checkout. S01 atualiza esses canônicos e regenera MAP/OWNERSHIP/issues; nenhuma segunda família source-map/surface-map/ownership mantém autoridade paralela.

Invariantes do pai são contínuos. Padrões de qualidade se aplicam à etapa nomeada: preparação/candidato não precisam do resultado de consumidores futuros. Regras de aceite integral são avaliadas somente no encerramento correspondente. DoD/completude/sucesso do pai são verificados no fechamento do pai; não impor o fechamento antes de produzir seus filhos. Cada critério informa criterion_evaluation_stage. S25-W0 produz e verifica um piloto cedo; S25-W1-T1 produz o candidato final; S23/S24 medem/revisam; S25-W1-T2 encerra. Fonte de dados, integração, evidência e aceite não são o mesmo estágio.

Em S12, exports atuais de provider/model bastam para desenvolver o container; integração com S13 é verificada em I05. S15-T1 expõe slots/bridge; S25-W0 conecta; S15-T2 verifica composição real. S19/S20-W2-T1 entregam readers/consumers locais com código atribuível; S25 importa quando disponíveis; T2 prova enablement público e gates afetados são repetidos. Não criar ciclos de aceite dentro da prosa.

## C-10 — recibos, escopo e revalidação

RECEIPTS-v4.md define esquema3. Cada prova vincula contrato efetivo (task/ancestrais/normas/fixture/cobertura/master), SHA, build e arquivos íntegros. Git reconstrói o footprint BASE..HEAD, inclusive imports verificados e renames. Lista autodeclarada não substitui o diff. Não resetar ou atribuir trabalho preexistente do usuário ao agente. Baseline é registrada antes do trabalho; logs/hashes não autenticam o executor.

S01 e piloto são milestones históricos; não congelam app.tsx para sempre. Entregas locais observam outputs do owner, não todo arquivo contextual lido. Gates finais observam todos packages/manifests. Mudança de interface/cobertura/contrato exige novas provas pertinentes; novo arquivo de UI não classificado reprova o censo. Somente reavaliar cone potencial, não invalidar indiscriminadamente o programa inteiro. Recibos antigos permanecem histórico, não são reetiquetados como novos resultados.

## C-11 — codegen e pré-requisito externo

O comando confirmado no repositório é bun run generate em packages/client (script/build.ts), que escreve src/generated e src/generated-effect. check:generated repete geração e compara o diff. S01 confirma o footprint no checkout e altera o lease para local-command-footprint-verified; isso não autoriza alterar budgets nem capacidades. O lease concede paths de registro específicos e generated_paths, com lock único entre S19/S20. Qualquer saída não prevista exige remapeamento, nunca omissão.

A autoridade externa precisa estar no candidato (ancestralidade) ou em artefato instalado/lockfile de identidade verificada, com teste público positivo/negativo e revisão. --repo é obrigatório. W1 unavailable/HOLD não depende dessa fonte; W2 live depende.

## C-12 — capacidade de execução e provas formais

Quando running<=jobs, o coordenador respeita running+selected<=jobs. Se já existir excesso, selected=[] e over_capacity=true; não cancela trabalho nem aloca mais. Scope e lease se aplicam a tarefas em andamento e novas. Amostragem requer host quieto: phase=collect reserva só sua janela; work/review não retêm uma reserva da task inteira. Use o preflight --collect, o coordenador único e verifique também processos reais. Um seletor read-only não adquire locks concorrentes: coordenador único e worktrees são parte do procedimento.

Cobertura visual formal e avaliações numéricas são recalculadas por ferramentas; aparência, causalidade de métricas e comportamento continuam precisando de revisão. Uma imagem decodificável não prova beleza; um JSON íntegro não prova execução real. Este tooling permanece fora do runtime.

## C-BRAND — HuGR fornecida, produto Orchestra preservado

Contrato detalhado em BRAND-INTEGRATION.md/BRAND-ASSETS.json. O input HuGR é imutável; o único owner de cópias de assets e wrapper app-local é S05. S06 integra o slot visual, S03 preserva o tema, S08 coordena native icons e S25 é writer de entrypoints/head/packaging. Brandkit não adiciona owners, WPs, tasks ou backend. Sobrescreve somente ordens históricas de desenhar/vetorizar/otimizar a marca e não altera a tarefa de paisagem. Condicionais de plataforma exigem consumidor e configuração reais; as cópias não mudam identidade instalada, appId, escopo, updater ou preferências.

## C-13 — entregas pequenas e paralelismo sem nova plataforma

| Entrega de entrada | Consumidor pode começar quando | Aceite cruzado |
|---|---|---|
| Tema S03-T1 | ThemeProvider/tokens existentes implementados e smoke/typecheck locais | T2 do fornecedor/consumidor e gates finais |
| Primitives S04-T1 | Props/exports existentes preservados, estilos da fatia disponíveis | S04-T2 não bloqueia preparo de layout |
| Marca S05-T1 | Assets e wrapper oficiais disponíveis, hashes e uso local conferidos | S05-T2 valida render/custo; marca não é redesenhada |
| Copy S22-T1 | copy.json/dicionários com chaves/interpolação/fallback e parity | S22-T2 audita componentes; S24 candidato integrado |
| Evidência C-05, conferida em S01 | S11 prepara arquivos/diff/terminal usando readers/handlers existentes | S11-T2 consome S09-T1 para verificar ligação da timeline |
| Shell S06-T1 e Dock S15/S16-T1 | Composição e controllers locais publicados pelo owner | S25-W0 conecta cedo; T2s fazem verificação cruzada |

Nenhuma linha autoriza API inventada, segundo provider/store, slots universais ou edição concorrente dos mesmos arquivos. T1 já precisa de prova local; apenas a auditoria mais ampla é adiada. Mudança posterior de contrato é integrada pelo owner e invalida os consumidores pertinentes. S17/read-model antes de S18 e autoridade antes de W2 live permanecem dependências reais.

O seletor prioriza os pré-requisitos prontos de S25-W0-T1, depois S25-W0-T2, e preserva ordem estável nos demais. Isso não ignora dependências, scopes, leases ou limite total RUNNING+selected. Uma reserva collect exige host realmente quieto apenas durante medição; não existe serviço novo de agendamento.

## C-14 — cobertura de consumidor, não de arquivo de backend

UI75 é inspeção do tema no shell existente (S03 herda o consumidor; S06 continua writer do layout). UI76 é o adapter visual **planejado**, no escopo S20, com ausência/HOLD/error seguros. Os registros não alegam que o frontend já foi implementado.

COVERAGE.task_consumer_states define os estados específicos de S03-T2, S20-W1-T2 e S20-W2-T2. Obrigação visual com zero alvos reprova. Uma captura que não corresponde ao consumidor/estado/perfil esperado é recusada. W2 testa estados live somente com a autoridade real exigida no DAG; isso não bloqueia a UI indisponível de W1. S24/release seguem a cobertura comum do candidato; nenhuma capacidade live pode ser declarada sem W2-T2 no candidato conectado e os gates afetados repetidos.

Capturas podem compartilhar um arquivo somente quando os consumidores estão de fato visíveis no mesmo estado/render. Reaproveitar pixels não dispensa revisão por critério. Não produzir um produto cartesiano desnecessário de todas as telas em todos os tamanhos: estados relevantes no viewport principal, mais os perfis definidos.
