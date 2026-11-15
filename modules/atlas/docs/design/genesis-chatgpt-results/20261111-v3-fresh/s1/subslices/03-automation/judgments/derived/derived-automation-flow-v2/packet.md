# s1.subslice03.automation-flow — revisão semântica L2 v2

Execução34269cf4-d631-41c5-a30b-85b0ec217390. Mesmos J1/J2, independentes, sem ferramentas. Material literal termina apenas no FIM_DO_LOTE externo. Nenhum voto do outro juiz sobre este candidato foi emitido ou incluído neste pacote. Metadados de gate na receita/evidência referem-se exclusivamente ao predecessor já aceito.

Candidato: s1.subslice03.automation-flow, 16541 bytes, SHA256 5b24037431881e96ddb5a872fd6541c94880d189d8b0c873bac9d8bd874d85c1, Git blob 378dbb4cd9f978ed9ab848136a2f4b9fdd72ca6b. Reutilize seus próprios pareceres e os bytes exatos dos predecessores indicados, já recebidos. Não reabrir por rotina conteúdo inalterado nem inferir aceite do novo corpo a partir do anterior.

Aplicar todos os critérios públicos pertinentes já recebidos, em especial GO-A1–7, GO-I1/2/7/8, QS-1–6, CC-1/3/7 e a suficiência local AC-01; demais obrigações operacionais mantêm provas próprias. Julgar o corpo inteiro e a fidelidade ao predecessor, utilidade da camada, limites de autoridade, interpretação, navegação versus build e receita/proveniência. Emitir PASS, FIX-FIRST ou REQUEST_EVIDENCE com falta obrigatória concreta; sugestão opcional não amplia a barra. Não emitir binding Atlas, consumidor, manutenção ou entrega completa.

A principal conferiu deterministicamente os 24 inputs declarados e os outputs, seus tamanhos/SHA256/blobs; receita congelada antes do dispatch; predecessor gate verificado antes da autoria. Corpo e evidência foram lidos integralmente. Nenhum teste de produto foi executado. Recibo receipts/derived-automation-flow-v2-verification.json. A tabela abaixo é projeção mecânica identificada do manifesto posterior, não texto da receita anterior nem nova autoridade semântica.


## BEGIN_CORPO_EXATO

# Automação: da intenção ao fato observável

**Chave:** `s1.subslice03.automation-flow` · **L2** · **need:** `flow` · **escopo:** S1-03 / `orchestra.s1`.

## 1. Escopo e escolha do ponto de entrada

Este L2 explica o ciclo local de Actions, Board e admissão agendada. Seu único predecessor de build é `s1.core.automation`, corpo v4 de 60.767 bytes, SHA256 `968965f1b15d633cefc8a78868d9d1049147f23dff409c6cb05c7a75e3561cae`, referido a `1cde2ff7a71bcf7aecb5d030917b577165135d38`. O gate semântico desse predecessor foi fornecido pela receita; seus pareceres e fontes brutas não foram lidos nesta derivação. As referências `[E01]`–`[E10]` remetem às seções exatas em `evidence.md`.

| Necessidade local | Fato que o mecanismo oferece | Limite da conclusão |
| --- | --- | --- |
| Enviar comando de CI | Intenção durável, acknowledgment e eventual readback atribuído | `accepted` é aceitação; `confirmed` vale para a pós-condição observada, que pode ser apenas existência do dispatch |
| Levar card até integração | Plano e decisões, checks de um tree, bundle e registro após push | Prosa não prova efeito; scoped-green não substitui full gate; um bundle aceito como flaky pode conservar gate vermelho |
| Fazer prompt chegar à Session | Claim, identidade de Session/mensagem e `started` após admissão | Não comprova conclusão da Session nem execução bem-sucedida do trabalho pedido |

Para envio/readback, use §§2–4; para plano, CI e bundle, §§5–6; para atraso, admissão e retomada, §§7–8. O aprofundamento é no predecessor, sem adicionar dependências de build por simples navegação. Mecanismos descritos são achados estáticos herdados; expectativas de testes e inferências permanecem identificadas. [E01]

## 2. Actions: fixar vínculo e intenção antes do envio

A operação começa na Location. A fachada resolve preguiçosamente o vínculo; abrir uma Location sem Git não prova disponibilidade nem precisa falhar de imediato. O chamador fornece ID/revisão, e o serviço relê projeto nativo, provider/host e conta confiáveis. Nome de repo ou metadado do cliente não substituem essa identidade. Mudança de policy local avança a revisão, mas não configura a policy remota. Capacidade `unknown`, role desconhecido ou permissão ausente não equivalem a autorização. [E02]

Há três identidades diferentes no preparo: **commit da base**, **versão nativa da fonte/recurso** e **hash do texto proposto**. `sourceBase` observa a branch; o draft fixa commit/path e SHA256 local. GitHub atualiza arquivo com SHA do blob; GitLab usa versão com `blob_id` e `last_commit_id`. O hash do draft não substitui essas precondições. Fingerprints de recurso orientam a releitura, mas não garantem CAS atômico remoto. [E03]

O parser gera uma projeção da definição, com limites e estados `complete`, `partial` e `unresolved`. Matriz dinâmica, reusable workflow, includes ou regras não resolvidas não viram jobs executados por inferência. Lint GitLab com `dry_run:false`/`include_jobs:false` não simula pipeline nem completa o grafo; GitHub não ganha lint remoto equivalente. Uma proposta passa por base, validação, branch, escrita e review com identidades próprias. As fases podem ter efeitos parciais: criar PR/MR não prova merge, e perder readback depois de escrever não demonstra que nada mudou. [E03]

## 3. Actions: admitir, enviar uma vez localmente e observar

`prepare` persiste intenção estrita e a liga à Location, binding/revisão e client ID. A chave única é `(location_key, binding_id, client_id)`: retry idêntico reconcilia a mesma operação; conteúdo conflitante é recusado. Payload de execução, texto sensível e segredo não são persistidos como intenção/acknowledgment. [E04]

| Estado do recibo | Interpretação para seguir o fluxo |
| --- | --- |
| `prepared` | Ainda não enviado; admissão tem lease de 24 horas |
| `sending` | CAS durável concedeu o direito local de envio; chamada duplicada não envia novamente |
| `accepted` | Houve acknowledgment qualificado, sem afirmar conclusão remota |
| `rejected` | Há prova de não envio ou rejeição definitiva segundo o classificador |
| `outcome_unknown` | Pode ter ocorrido efeito; interrupção, timeout, órfão ou confirmação incompleta impedem certeza |
| `confirmed` | Observação atribuída estabeleceu a pós-condição implementada |
| `expired` | Prazo/retenção alterou o recibo; a chave retida não autoriza reenvio |

Deadline de execução é 30 s. Recuperação de `sending` órfão torna o resultado unknown e não repete a escrita. Retenção de 30 dias conserva chave/intenção; `outcome_unknown` não é descartado como terminal comum. São proteções locais e limites do código, sem garantia universal de exatamente um efeito externo. [E04]

`reconcile` observa apenas `accepted`/`outcome_unknown`, sem `perform`, nova admissão ou replay. Dispatch com runID exige identidade/commit/workflow/ref e, no GitHub, evento `workflow_dispatch`; pode confirmar run ainda em andamento. Sem ID ou com `unattributed:true`, fica pending antes de procurar runs. Retry exige tentativa atribuída suficiente, que o ack GitHub atual não fornece; GitLab não fabrica tentativa. Cancel confirma estado nativo cancelado. Source/resource/job e outros kinds não têm pós-condição genérica implementada: readback próprio de uma fase não vira `confirmed` genérico. [E04]

Logo, a próxima decisão depende do fato ausente: procurar evidência do recurso exato pode esclarecer uma operação; trocar client ID para repetir automaticamente abandona a deduplicação. Reconciliação não resolve incerteza fabricando identidade. [E04]

## 4. Actions: preservar a semântica do provider e do transporte

A mesma intenção superficial pode exigir provas distintas. A fachada comum não permite transferir a garantia de um adapter ao outro. [E05]

| Ponto do ciclo | GitHub | GitLab |
| --- | --- | --- |
| Dispatch | Workflow ativo e `workflow_dispatch` na branch padrão e ref selecionada; 204 fica sem atribuição | Pipeline, trigger e MR têm endpoints/identidades próprios; includes desconhecidos não viram schema vazio |
| Retry | Run completo; ack traz runID anterior, sem nova tentativa inventada | Retry nativo de pipeline; retry de job exige outro jobID, não equivalência por nome |
| Schedule remoto de CI | Cron no YAML da branch padrão; edição é `source.write`, sem play/pause independente | Recurso com ID/owner/timezone/ref/active; play retorna resourceID `unattributed`, sem pipelineID |
| Recursos | Escopo, identidade e readback particulares | Scope/ownership/versão particulares; não se pressupõe equivalência de roles, proteção ou operação |

Esses schedules de CI são diferentes de ScheduledTask (§§7–8). Versão GitLab declarada no binding não qualifica funcionalidade: os gates pertinentes observam `/metadata`. Autorização, scope e precondições devem corresponder à operação efetiva. Fluxos de recurso com várias fases podem aplicar uma parte e terminar unknown, sem rollback automático. Valores secretos e tokens sensíveis não viram conteúdo do ledger. [E05]

No transporte, diagnóstico incompleto, stderr sugestivo, timeout, exit anormal, 5xx ou perda depois de possível HTTP autenticado não provam “não enviado”. O caminho GitLab usa snapshot qualificado de configuração e mantém ambiguidade após `http_possible`; a leitura estática não qualifica CLI, host ou conta presentes. [E05]

Se a necessidade é ler resultado, a transferência também fixa IDs/ownership. Bytes emitidos só constituem transferência concluída com EOF/exit válido. Redirect assinado GitLab usa canal sem credenciais nativas; a única renovação read-only por expiração ocorre antes de emitir bytes e revalida identidade. Não se repete transferência parcial para esconder falha, nem se infere integridade criptográfica de mero header de digest. [E05]

## 5. Board: transformar plano em trabalho elegível

Board conserva plano, decisões e evidências. Suas tools são guardadas para Maestro default; isso não autentica universalmente todo método interno. Escritas centrais persistem atividade em transação e publicam `board.changed` após commit. Decisão do owner é imutavelmente sucedida por outra quando alterada; `decisionOutcome` é relato de Maestro, sem consulta automática a PR/CI que o comprove. [E06]

O fluxo usual começa em backlog; Intake remoto exige accept/decline do owner, salvo auto-accept configurado. Review requer PR. Maestro usa a fila do host para queue. Move direto a shipped com PR exige leitura fresca de merge e PR ainda correspondente; sem PR, utiliza a justificativa prevista, sem inventar merge. Pausa, hold e archive têm verificações nos caminhos definidos, não uma revogação universal de todo trabalho em voo. [E06]

Para `board_queue`, o card deve estar Review, com PR/repo/worktree, sem pausa/conflito, dependências shipped ou queued e record com intent/decisions/not-covered/risk e follow-ups conhecidos. A fila busca head/commit exato, verifica scoped state quando exigido e, sob lock, reconfere stage/PR e grava o SHA. Head movido depois requer nova verificação. Card queued não troca PR/branch pelo update comum. [E07]

O gate scoped pertence ao **tree** e ao contrato `.orchestra/ci.json` observado no base. Mesmo tree pode reutilizar checks; conteúdo alterado perde aquele green. `run:false` apenas relata. O cálculo usa o resultado mais recente por `(kind, command)` no tree. Scoped-green pode coexistir com outros checks scoped pending/error: quando há testes configurados, aceita algum scoped pass, além de pass por workflow exigido, e qualquer fail nesses resultados produz scoped-red. Não se conclui “todos os comandos passaram”. Ausência de contrato leva à descoberta/default; falha nessa descoberta não é prova forte de ausência de CI. [E07]

Board tem ledger e correlação próprios. Após dispatch sem ID, usa runs recentes por branch/workflow/evento, SHA e janela desde 60 s antes do envio; lane rollup escolhe run mais novo por workflow/head. Concorrência externa pode tornar essa atribuição ambígua. Essa inferência estática não transfere ao Board a atribuição exata de Actions. Mirror/PR vivo, campo narrativo e check armazenado também mantêm suas origens distintas. [E07]

## 6. Board: cortar, julgar e integrar o bundle

O tick corta bundles em worktree temporário e aplica filtros de owner hold/card pause/conflito. Dependencies precisam ter landed ou preceder no bundle. Lanes derivam dos packages afetados na árvore de integração; graph inconfiável recua ao escopo global. O busy-set é memória do serviço, sem lease distribuído. [E08]

Checks requeridos ausentes/em andamento mantêm pending; só `source:no-ci` permite green sem checks. Full green com heads intactos habilita integração. Red qualificado de infraestrutura recebe recuperação limitada; base desconhecido abre probe; base-red preserva cards e encaminha fix; red de código pode isolar/dividir membros. Flaky aguarda decisão explícita `board_bundle merge/retry`: aceitar registra `accepted` sem transformar o teste vermelho em verde. Probes sem membros não mergeiam. [E08]

Antes do push, settle compara heads de bundle/membros e reobserva base. Movimento invalida as condições correspondentes. A integração pode qualificar base nova disjunta/lanes com merge-tree e write sets/packages; “tested on” e “merged on” podem diferir. Depois do push bem-sucedido, atualiza banco/cards/attempts. Se bundle head já for ancestral do base, reconhece o caso de morte depois do push e registra sem segundo push. Essa recuperação específica não torna GitHub, Git e SQLite uma transação única. [E08]

**Inferência estática preservada:** filtros de hold/pausa estão antes do corte, mas settle pode chegar ao push após gate e rechecagem de heads sem reler esses controles imediatamente antes do efeito. Pausar projeto/card ou aplicar hold não está demonstrado como revogação atômica de bundle já formado. Nenhuma corrida foi reproduzida nesta autoria. Snapshot/restore também não oferece retomada geral: import do plano não reconstrói queue, bundles, attempts, checks, sync state ou segredos. [E08]

## 7. Scheduler: identificar política e slot devido

ScheduledTask compartilha persistência/dispatch, mas separa `legacy-browser` e `capability`. Legado filtra policy/diretório. Capability fixa owner por Session, agent, project e Location/workspace; tarefa estrangeira aparece NotFound. Leitura de operador `placed` tem outra autoridade. Host sem binding do port falha. [E09]

| Decisão temporal | Legado | Capability |
| --- | --- | --- |
| Cadência | once/hourly/daily/weekly | once/interval/daily/weekly/cron |
| Atraso | Último slot devido; once/weekly com mais de 24 h é skipped | Once também tem limite de 24 h; `latest` serve último e conta anteriores; `skip` não serve recorrente cujo último due passou há mais de 1 min |
| Hora de DST inexistente | Preserva offset após o gap naquele dia | Primeiro instante local válido; 02:30 pode virar 03:00 |
| Hora repetida | Primeira ocorrência | Uma vez no instante anterior |
| Manual | Serve due disponível ou cria extra | Dedupe por manualKey; pode rodar paused, sem mover next nem consumir repeat |

Interval mantém âncora; cron capability aceita cinco campos numéricos Vixie, com listas/ranges/steps, sem nomes/macros/segundos, e usa OR entre dia do mês/semana quando ambos restritos. Busca/contagem são limitadas. Editar uma política como se fosse a outra altera comportamento. [E09]

Daemon retoma stale claims antes de slots novos, faz tick no boot e espera due/lease ou wake. Sem tarefa habilitada nem claim, aguarda Queue.take. **Inferência estática:** `capability.create` insere fora do wrapper `store.immediate` que oferece wake; o predecessor não demonstra wake para daemon já ocioso. Pontualidade da primeira tarefa nesse estado permanece sem prova até outro wake/tick ou qualificação específica. [E10]

## 8. Scheduler: separar claim, admissão e trabalho concluído

Planejamento transacional cria claim `running` com lease de 120.000 ms, snapshot de prompt/messageID e identidade determinística. Capability usa task+revision+slot; manual usa task+manualKey. Lease protege posse da claim, não mede duração da Session. Histórico assentado é limitado aos últimos 20 runs por tarefa; manualKey não herda retenção ilimitada da admissão Actions. [E10]

Dispatch cria/adota a Session e chama `sessions.prompt` com a mensagem capturada. Em capability, verifica a presença/identidade do owner antes da Session; para claim ainda não admitida, verifica `holds` antes da Session e outra vez antes de prompt, sem reler a Session do owner. `started` registra admissão. Se wake falha depois dela, consultar SessionInput durável permite conservar esse fato. Falha de tick antes de admissão assenta `failed` e consome slot devido sem retry automático; runs só aumenta com started. Falha manual pode voidar/remover claim e devolver erro para retry. [E10]

Lease vencido exige takeover sob lock. Sem SessionInput, voida para replanejar; com admissão, reconcilia/wake com **o mesmo messageID e prompt**, depois assenta started. No replay de capability manualKey, `running` sem SessionInput retorna “retry shortly” e `revoked` retorna erro; nos demais casos, o ramo devolve o SessionID retido com `reused:true`, sem exigir admissão para uma row já assentada. Nova chave significa nova invocação. [E10]

Edit incrementa revision/recomputa next e revoga claims antigos ainda não admitidos; owner ausente/mudado desabilita capability com `owner-missing`. Admissão anterior permanece. **Race preservada:** entre último holds e admissão, edit pode revogar e o prompt ainda entrar; settle converte revoked em started com SessionID, sem contar repeat nem mover next nesse ramo. Pode haver admissão além do repeat limit. Delete/cascade tampouco desfaz SessionInput. O teste que simula essa janela é expectativa de regressão lida no predecessor, **NOT_RUN**, e não prova nova desta derivação. [E10]

Não há aqui resultado de Session, CI/provider, consumidor Atlas ou manutenção executada. Hashes verificam os arquivos desta autoria; não qualificam runtime, atualidade fora do pin ou aceite deste L2. O mesmo par nativo deve julgar estes bytes antes de liberar camadas dependentes. [E01, E10]

## END_CORPO_EXATO

## BEGIN_EVIDENCIA_EXATA

# Evidência de derivação — s1.subslice03.automation-flow

## 1. Objeto, autoridade e identidade exata

Esta evidência acompanha somente `s1.subslice03.automation-flow`, L2 v2, need `flow`, da execução `34269cf4-d631-41c5-a30b-85b0ec217390`, missão S1-03. A autoria explica fluxo local; não entrega impacto L3, manutenção L4, entrada global ou qualificação operacional.

A autoridade semântica consumida foi o arquivo inteiro `producers/automation/body.md`, chave `s1.core.automation`, v4, com **60.767 bytes**, SHA256 **`968965f1b15d633cefc8a78868d9d1049147f23dff409c6cb05c7a75e3561cae`**, Git blob **`e26213eb2fc76dc843dca17d1111334c76f88890`**. A identidade foi recalculada e coincidiu com a receita. Todas as referências E01–E10 abaixo vinculam-se exclusivamente a esses mesmos bytes; não citam uma versão genérica da chave.

O predecessor atribui seus achados ao baseline `1cde2ff7a71bcf7aecb5d030917b577165135d38`. Esse commit é procedência relatada pelo L1, não checkout/código relido pelo produtor L2. Seus marcadores A/B/S/T e referências a arquivos de evidência são parte do conteúdo aceito; os respectivos arquivos não foram abertos.

O gate fornecido pela receita congelada registra PASS dos papéis `parallel-v3-fresh/S1-03/J1` e `parallel-v3-fresh/S1-03/J2` para o SHA256 acima. Recebi essa condição de liberação sem consumir pareceres originais. Não a converto em aceite do L2 ou em OwnershipReview de runtime. O principal mantém o mesmo par para a revisão destes novos bytes.

Corpo L2 v2 acompanhado: `producers/derived-automation-flow/body.md`, SHA256 `5b24037431881e96ddb5a872fd6541c94880d189d8b0c873bac9d8bd874d85c1`.

## 2. Mapa de afirmações e seções do predecessor

Cada linha identifica o trecho útil do L2, o apoio exato dentro do único predecessor e a qualificação que precisa sobreviver à consulta limitada. Os números/títulos são os do corpo aceito, sem linhas de fonte inventadas.

| ID / trecho L2 | Seções exatas de s1.core.automation nos bytes fixados | Afirmação sustentada e limite conservado |
| --- | --- | --- |
| E01 — §1; limite final de §8 | `Como usar este L1`, subheading `Três mecanismos, três significados de sucesso`; `13. Prova disponível e lacunas preservadas`; `14. Impacto de manutenção e uso seguro do conhecimento` | Actions observa pós-condição; Board separa plano/fato/integração; scheduler assenta admissão. Descrições são leitura estática, não execuções. Derivação não concede validade atual fora do baseline nem aceite local/global. O vínculo de build único e o papel L2 são fixados pela receita/plano públicos. |
| E02 — §2, vínculo | `1. Actions: vínculo, leitura e autoridade`, especialmente `1.1 Vínculo confiável antes de tocar o provider`; `4.2 Comandos GitLab` | Fachada lazy, ID/revisão e releitura de projeto/conta; policy local distinta da remota; capacidade/permissão/role desconhecidos não concedem autoridade. Não se qualifica conta/host atual. |
| E03 — §2, base/projeção/autoria | `2. Fonte de CI: compreender, validar e propor alteração`, incluindo `2.1 O grafo é uma projeção da definição` e `2.2 Ciclo de autoria com base imutável`; `4.3 Recursos: escopo, versões e efeitos parciais` | Commit-base, sourceVersion e hash de draft têm papéis distintos. Parser/CI lint não executam grafo remoto. Branch→arquivo→review são fases; versão/fingerprint não garante CAS remoto e readback perdido não desfaz escrita. |
| E04 — §3 | `3. Intenção durável, execução única local e readback`, incluindo `3.1 O ledger protege o envio, não inventa certeza remota` e `3.2 Confirmar exige atribuição suficiente`; `2.2 Ciclo de autoria com base imutável` | Chave única, conflito de intenção, CAS sending, prazos/retenção e persistência restrita. Unknown não é convite a replay. Observação é read-only e limitada por kind/ID/tentativa: dispatch pode confirmar antes de terminar, retry GitHub não recebe tentativa inventada e source/resource/job não ganham confirmação genérica. |
| E05 — §4 | `1.2 Identidade e paginação são parte da leitura`; `4. Comandos e recursos têm semântica nativa` e subheadings `4.1 Comandos GitHub`, `4.2 Comandos GitLab`, `4.3 Recursos: escopo, versões e efeitos parciais`; `5. Transporte e download: onde a incerteza começa`; `5.1 Transferir resultado sem mudar sua autoridade` | Dispatch/retry/schedules/resources preservam identidade/escopo por provider; schedule YAML difere de recurso GitLab e ambos de ScheduledTask. Metadado de binding não qualifica versão real. Fase pós-envio pode ser unknown; transferência exige término válido e não repete bytes parciais. Nenhuma chamada real foi feita. |
| E06 — §5, plano/decisão/card | `6. Board: plano, owner, evidência e memória de decisão`, incluindo `6.1 Fluxo do card e controles` e `6.2 Decisão, resultado narrado e undo` | Guard Maestro é da porta de tools; transação/atividade e publicação posterior; decisão preservada, outcome narrativo não é prova; Intake, Review, queue e shipped têm condições específicas. Controles não são autenticação ou cancelamento universal. |
| E07 — §5, queue/CI/correlação | `7. Espelho GitHub, CI local e métricas do Board`, especialmente `7.1 Espelho e fatos vivos` e `7.2 ci_run: resultado do tree, não do rótulo`; `8.1 Antes de cortar um bundle` | Queue fixa head e record; scoped state é por tree e último resultado por kind/command, com regra exata de pass/fail, não todos os comandos verdes. Contrato ausente/default não prova CI ausente. Correlação por SHA/tempo/latest é heurística própria do Board; possível ambiguidade é inferência estática. |
| E08 — §6 | `8. Fila: admissão, bundle, gate e integração`, com `8.1 Antes de cortar um bundle`, `8.2 O gate e suas saídas`, `8.3 Integração e recuperação parcial`, `8.4 Limite de revogação observado por leitura`; `9. Snapshots e records: durabilidade limitada ao que foi gravado` | Lanes/bundles, pending/red/flaky, confirmação de heads/base e recuperação específica após push. Tested/merged podem divergir sob condição qualificada. Hold/pause sem rechecagem final conserva janela de revogação como inferência, sem reprodução. Restore de plano não recompõe automação inteira. |
| E09 — §7, política/tempo | `10. Agendamento: duas políticas, identidades diferentes`; `11. Tempo devido, catch-up e DST` | Policy/owner/placement, diferenças de manual, cadência, atraso, DST e cron. `placed` não é leitura caller-scoped. Capability e legado não podem ser unificados sem mudar semântica. |
| E10 — §7, daemon; §8 | `10. Agendamento: duas políticas, identidades diferentes`; `12. Claim, admissão, revogação e retomada`; `13. Prova disponível e lacunas preservadas` | Claim/lease/dedupe/retenção; started após SessionInput; failure de tick consome slot. Os dois holds são de claim ainda não admitida, distintos da presença/identidade do owner antes da Session. Replay de capability manualKey: running sem SessionInput pede retry shortly; revoked retorna erro; demais casos incluem running com SessionInput e devolvem SessionID retido/reused, sem exigir admissão para row já assentada. Takeover reconcilia identidade; edição/revogação não cancela admissão. Janela após holds e ramo revoked→started preservam excesso possível sobre repeat. Wake capability.create é inferência sem liveness test; teste da race é código lido no L1, não executado no L2. |

## 3. Classes de evidência e fronteiras de afirmação

**Achado estático herdado:** mecanismos, estados e condições foram explicados a partir do corpo L1 aceito. Não houve acesso às implementações, fixtures ou testes originais. O aceite informado libera a derivação dessa versão; não elimina limitações expressas nela.

**Expectativa de contrato em teste:** o predecessor relata teste que simula revogação após o último recheck do scheduler. O L2 conserva a expectativa e a marca NOT_RUN. A existência de assertion, fixture ou teste live não é evidência de execução nesta autoria.

**Inferência estática identificada:** correlação heurística de runs do Board sob concorrência; falta de rechecagem final de hold/pause de bundle; falta de wake demonstrado em capability.create com daemon ocioso. Não foi reproduzida corrida, medida liveness nem corrigido produto.

**Composição L2:** escolher o fato ausente antes do aprofundamento, distinguir schedules de CI de ScheduledTask e organizar os três fluxos em entradas limitadas são síntese local apoiada nas seções citadas. Isso não estabelece uma integração transacional entre esses mecanismos.

**Execução real desta autoria:** leitura dos inputs públicos enumerados e do predecessor, preservação do dispatch, composição dos arquivos e verificação determinística de UTF-8/bytes/SHA256/Git blob/estrutura. Não foram feitos testes de produto, rede, providers, GitHub, CI, Atlas import/binding/publicação/index/read, consumidores ou manutenção. Não há PASS autoatribuído.

## 4. Critérios públicos: contribuição e prova ainda externa

| Critérios pertinentes | Contribuição concreta desta entrega | Fronteira de avaliação |
| --- | --- | --- |
| GO-A1, GO-A2, GO-A3; QS-1, QS-2; CC-3 | Oito seções L2 independentes explicam propósito, sequência, decisões e limites; E01–E10 permitem aprofundar no L1 | Utilidade e suficiência destes bytes ainda requerem o par nativo; links não provam leitor Atlas real |
| GO-A4, GO-A5; GO-I1, GO-I2; CC-1, AC-01 | Inputs e receita fixados, predecessor exato, dispatch/pedido preservados, tipos de evidência separados | Hash atual não prova verdade; esta entrega não reconcilia toda S1-03 nem todos os artefatos/casos |
| GO-A6, QS-6 | Leitura delimitada, reaproveitamento do L1 aceito, hashes calculados; uso não exposto UNKNOWN | Nenhum número de bytes é convertido em tokens/custo; não se presume cache hit de runtime |
| GO-A7, GO-I7; QS-3, QS-4 | Apenas arquivos da área exclusiva, sem novo motor/store, fontes externas, testes ou alterações de produto | A autoria não oferece permissões para operação externa ou publicação |
| GO-I8, QS-5 | Conteúdo semântico e evidência disponíveis para juízo; estrutura mecânica não autocertifica | Revisão L2, consumidores e recibos reais permanecem obrigações da coordenação |
| CC-4, CC-7 | Dependência declarada e limites de compatibilidade/pin preservados; escopo posterior nomeado | Build/reuse/invalidação ponta a ponta e obrigações de produto/campanha não são demonstrados por esta autoria |

O único predecessor semântico de build é `s1.core.automation` nos bytes fixados. Referências internas a seções e nomes de dependências externas são navegação/contexto relatado; não acrescentam arquivos brutos ou artefatos irmãos ao conjunto de inputs. Camadas L3/L4 continuam dependentes de novos gates e despachos.

## 5. Procedência do procedimento e conferências

A receita efetiva conserva o contrato público `payload/recipes/derived-contract.json`, a receita inicial `payload/recipes/derived/automation-flow.json`, o pedido e o dispatch iniciais. A correção v2 acrescenta a receita congelada `payload/recipes/derived/automation-flow-source-fidelity-v2.json`, o pedido `producers/derived-automation-flow/revisions/v2/request.txt` e o novo dispatch em `revisions/v2/dispatch-message.txt`. O manifesto é registro posterior à execução dessas instruções; não é receita retrospectiva.

Os 17 inputs integrais da autoria inicial permanecem no contexto desta família e no manifesto cumulativo. Na leitura inicial, COMMON/mission foram relidos integralmente após truncamento de uma saída; o predecessor foi consumido em quatro segmentos contíguos cobrindo seus 59.078 caracteres decodificados e 60.767 bytes. Nesta correção, foram lidos integralmente os quatro outputs v1 preservados em `revisions/v2/history`, a nova receita e o novo pedido; o dispatch novo é também input efetivo. São **24 unidades integrais distintas** no contexto acumulado. A §12 do predecessor foi reconsultada e sua identidade integral reconferida, sem criar um input duplicado.

Cada cópia histórica conserva sua identidade e `original_read_paths` para o caminho v1 efetivamente usado. Os inputs originais continuam nas identidades anteriores; o pedido e o dispatch iniciais, as quatro cópias de histórico, o plano e o predecessor permanecem inalterados. Não houve fonte nova, oracle, parecer completo, irmão não listado ou inventário recursivo.

As conferências determinísticas cobrem bytes/SHA256/Git blob, dois replacements exatos, igualdade da reversão integral com v1, três segmentos restantes byte-idênticos, dez referências E, oito headings depth2 e resposta/dispatch novos sem LF terminal. `revisions/v2/delta.json` preserva o antes/depois integral, os textos substituídos e o resultado da inversão. Não se trata de teste de comportamento nem de aceite semântico.

## 6. Correções públicas anteriores à primeira revisão L2

Os achados AF-L2-PREVIEW-01/02 vieram da comparação de fidelidade feita pelo principal antes de qualquer parecer J1/J2 sobre este corpo L2. Não são oracle nem terceiro voto. O predecessor L1 v4 continua o mesmo aceito; apenas as duas cláusulas autorizadas da §8 do L2 mudaram.

| Achado | Correção no corpo e apoio exato | Qualificação preservada |
| --- | --- | --- |
| AF-L2-PREVIEW-01 | Reposta literalmente a frase da §12 de `s1.core.automation` que verifica presença/identidade do owner antes da Session e restringe os dois holds a claim ainda não admitida | Não se generalizam rechecagens para claim já admitida; verificar holds não significa reler a Session do owner |
| AF-L2-PREVIEW-02 | Reposto literalmente o ramo de replay de capability manualKey da mesma §12: running sem SessionInput, revoked e todos os demais casos | O ramo restante inclui running com SessionInput; não é reduzido a rows assentadas. Row já assentada não exige admissão nesse ramo |

As substituições usam os literais do predecessor SHA256 `968965f1b15d633cefc8a78868d9d1049147f23dff409c6cb05c7a75e3561cae`. A reversão exata restaura o corpo v1 SHA256 `5985441b360d0efc6693d0d385980f4a93cab2c044387a7375608dd5a9adf517`. O corpo corrigido inteiro ainda deve passar pelo mesmo par; esta conferência não libera L3 ou outra camada dependente. Não houve rede/GitHub, teste de produto, operação Atlas ou delegação.

## END_EVIDENCIA_EXATA

## BEGIN_RECEITA_DE_TAREFA_EXATA

{
  "schema": "s1-03-derived-source-fidelity-correction/v1",
  "artifact": {
    "key": "s1.subslice03.automation-flow",
    "layer": 2,
    "need": "flow",
    "version": "v2"
  },
  "execution_id": "34269cf4-d631-41c5-a30b-85b0ec217390",
  "frozen_at_utc": "2026-11-15T09:07:04.980055+00:00",
  "state": "FROZEN_BEFORE_CORRECTION_DISPATCH",
  "author": "/root/derived_automation",
  "finding_origin": "Principal source-fidelity pre-review; no J1/J2 judgment of L2 has yet occurred. The current L1 predecessor remains accepted by the same pair, unchanged. This is not a third semantic vote.",
  "prior_recipe": {
    "local_path": "payload/recipes/derived/automation-flow.json",
    "sha256": "ec4550336620b1d7abed85e78460c6d4c5ede73f31c8ddcf8a77be5272af3179"
  },
  "prior_manifest": {
    "local_path": "producers/derived-automation-flow/revisions/v2/history/production-manifest.json",
    "original_read_paths": [
      "producers/derived-automation-flow/production-manifest.json"
    ],
    "bytes": 16158,
    "sha256": "9c7d3130d4265bccba5e94fa0448b1d0bbbf3c02bf421a09d4e8d053cae4df06",
    "git_blob_sha": "ee7c2879510553e13c9c61faefdda6b9e09d8e17",
    "role": "Exact v1 output retained before the first semantic review and before source-fidelity correction."
  },
  "parent_body": {
    "local_path": "producers/automation/body.md",
    "key": "s1.core.automation",
    "version": "v4",
    "bytes": 60767,
    "sha256": "968965f1b15d633cefc8a78868d9d1049147f23dff409c6cb05c7a75e3561cae",
    "git_blob_sha": "e26213eb2fc76dc843dca17d1111334c76f88890",
    "section": "12. Claim, admissão, revogação e retomada"
  },
  "exact_retained_outputs": [
    {
      "local_path": "producers/derived-automation-flow/revisions/v2/history/body.md",
      "original_read_paths": [
        "producers/derived-automation-flow/body.md"
      ],
      "bytes": 16441,
      "sha256": "5985441b360d0efc6693d0d385980f4a93cab2c044387a7375608dd5a9adf517",
      "git_blob_sha": "b4874e39655e7aef9c9f6e08aeecc37718658b2f",
      "role": "Exact v1 output retained before the first semantic review and before source-fidelity correction."
    },
    {
      "local_path": "producers/derived-automation-flow/revisions/v2/history/evidence.md",
      "original_read_paths": [
        "producers/derived-automation-flow/evidence.md"
      ],
      "bytes": 11997,
      "sha256": "d2b8068c9167c0813719479d4d2b10046cc718921dad3db52d1f44957e3f1360",
      "git_blob_sha": "6697c34caf08d7d8d4bacd4793f3e36c1d035aa4",
      "role": "Exact v1 output retained before the first semantic review and before source-fidelity correction."
    },
    {
      "local_path": "producers/derived-automation-flow/revisions/v2/history/production-manifest.json",
      "original_read_paths": [
        "producers/derived-automation-flow/production-manifest.json"
      ],
      "bytes": 16158,
      "sha256": "9c7d3130d4265bccba5e94fa0448b1d0bbbf3c02bf421a09d4e8d053cae4df06",
      "git_blob_sha": "ee7c2879510553e13c9c61faefdda6b9e09d8e17",
      "role": "Exact v1 output retained before the first semantic review and before source-fidelity correction."
    },
    {
      "local_path": "producers/derived-automation-flow/revisions/v2/history/response.md",
      "original_read_paths": [
        "producers/derived-automation-flow/response.md"
      ],
      "bytes": 2470,
      "sha256": "c8bf48be1b48cc17d8c376978e37c401079ba6e5ad72c51ac12443b8e433c7fd",
      "git_blob_sha": "e26287f9867203f71804eecce18b6a706997539a",
      "role": "Exact v1 output retained before the first semantic review and before source-fidelity correction."
    }
  ],
  "findings": [
    {
      "id": "AF-L2-PREVIEW-01",
      "body_section": "8. Scheduler: separar claim, admissão e trabalho concluído",
      "current_literal": "Capability verifica owner antes da Session e `holds` antes da Session e antes do prompt; não relê o owner nessa segunda passagem.",
      "accepted_predecessor_literal": "Em capability, verifica a presença/identidade do owner antes da Session; para claim ainda não admitida, verifica `holds` antes da Session e outra vez antes de prompt, sem reler a Session do owner.",
      "required_correction": "Restore the qualification that the two holds checks apply to a claim not yet admitted, while retaining the distinct owner identity check. Do not reintroduce the broad v3 wording corrected in L1 v4."
    },
    {
      "id": "AF-L2-PREVIEW-02",
      "body_section": "8. Scheduler: separar claim, admissão e trabalho concluído",
      "current_literal": "Em replay de manualKey, running sem admissão pede retry shortly e revoked falha; demais rows assentadas podem devolver SessionID retido com `reused:true`, sem exigir nova prova de admissão nesse ramo.",
      "accepted_predecessor_literal": "No replay de capability manualKey, `running` sem SessionInput retorna “retry shortly” e `revoked` retorna erro; nos demais casos, o ramo devolve o SessionID retido com `reused:true`, sem exigir admissão para uma row já assentada.",
      "required_correction": "State the complete remaining replay branch as the accepted parent does. The phrase demais rows assentadas omits the running-with-SessionInput case; retain the parent distinction without narrowing the remaining branch to settled rows."
    }
  ],
  "allowed_reads": "The existing17 whole-file inputs remain in the same family context. Read this recipe, the new frozen request, this visible correction dispatch, the four exact retained v1 outputs and the accepted parent section as necessary. No other file, oracle, judge prose or raw source is authorized. Preserve cumulative whole-file input identities; history aliases must point to retained bytes and preserve original_read_paths.",
  "allowed_writes": [
    "producers/derived-automation-flow/body.md",
    "producers/derived-automation-flow/evidence.md",
    "producers/derived-automation-flow/production-manifest.json",
    "producers/derived-automation-flow/response.md",
    "producers/derived-automation-flow/revisions/v2/dispatch-message.txt",
    "producers/derived-automation-flow/revisions/v2/delta.json"
  ],
  "preserve_unchanged": [
    "producers/derived-automation-flow/request.txt",
    "producers/derived-automation-flow/dispatch-message.txt",
    "producers/derived-automation-flow/revisions/v2/history",
    "payload/artifact-plan.json",
    "producers/automation/body.md"
  ],
  "instructions": [
    "Only the two quoted body clauses may change; preserve all other body bytes. Update body identity and relevant evidence qualifications, manifest and response consistently.",
    "The actual authoring recipe is the original public contract/task plus this predispatch correction recipe, request and visible dispatch. The new manifest is an output, not a retrospective preexisting recipe.",
    "Use actual_authoring_recipe.task_recipe.local_path for this correction recipe and current_request.local_path for the new correction request; retain the original recipe/request/dispatch as actual context inputs.",
    "Record before/after full identities, the two exact replacements and inverse equality in revisions/v2/delta.json. Do not execute product tests or any runtime operation.",
    "Return exactly response.md without terminal LF; no dependent is released until same-pair whole-body acceptance of the corrected L2."
  ],
  "reserved_answers_included": false
}

## END_RECEITA_DE_TAREFA_EXATA

## BEGIN_RECEITA_COMUM_EXATA

{
  "schema": "s1-03-derived-public-authoring-contract/v1",
  "execution_id": "34269cf4-d631-41c5-a30b-85b0ec217390",
  "purpose": "Actual common recipe for future L2-L4 derivation; frozen before those author dispatches. Not semantic output or acceptance.",
  "scope": "S1-03 only",
  "source_revision": "1cde2ff7a71bcf7aecb5d030917b577165135d38",
  "protocol_revision": "ee2521a5b966bd505cc95bd1c733e09e12f33531",
  "kit_revision": "70234d541a9a3539935ef16f19e33c8f2d5f30ec",
  "artifact_plan": {
    "payload_path": "modules/atlas/docs/design/genesis-chatgpt-results/20261111-v3-fresh/s1/subslices/03-automation/artifact-plan.json",
    "sha256": "6bf70a5c448d65ec3a046aefc0b0b9db2f783dcd8573a2d2ea69487bec7ce9ad"
  },
  "author_context": "fresh fork none; no reserved answers; read exactly listed accepted predecessor bodies plus public task/recipe/authority inputs; new raw-source needs return to principal before use",
  "gate": "Only dispatch a derived artifact after the same two current native judges accept every declared required predecessor at exact bytes. Recipe preparation does not release the gate.",
  "layer_roles": {
    "2": "Explain local working flow and decision boundaries from accepted L1, giving useful direct entry points into the detailed contracts.",
    "3": "Explain relationships, change impact and which knowledge/consumers need re-evaluation; distinguish build dependencies from navigation and independent families.",
    "4": "Ownership, maintenance/diagnosis, verification and escalation; entry gives shallow orientation and concrete deeper navigation while preserving the historical Core entry."
  },
  "quality_rules": [
    "Write a usable Portuguese reference with clear depth2 section headings so a consumer can request a bounded section through ownership.read.",
    "Make distinct the source-supported mechanism, authorized intent, inference and remaining gap. Do not upgrade tests listed to executions.",
    "Cite exact accepted predecessor keys, bytes/hashes and relevant sections. Do not invent line evidence, raw source details or external engine guarantees.",
    "Avoid reprinting the full predecessor or adding a file per source; satisfy the defined need with a compact coherent explanation.",
    "Describe known failures and authority boundaries explicitly. A proposed operational action does not prove it was executed.",
    "Do not include reserved oracle answers or infer a consumer PASS; public questions are needs, not outcomes.",
    "No product edits, local tests, network/provider calls, GitHub writes, policy/guard changes or external messages.",
    "Preserve exact visible request/response and body bytes; retain every revision and actual input identity, including genuine procedures used. No private reasoning.",
    "Use only authorized exclusive producer directory. No sibling payload/producer mutation or recursive filesystem discovery. If an extra input is necessary, identify it before reading.",
    "The actual authoring recipe is this contract plus the per-task frozen recipe and visible dispatch. A descriptive output manifest created afterwards is not a preexisting executable recipe."
  ],
  "public_criteria": [
    "GO-A1",
    "GO-A2",
    "GO-A3",
    "GO-A4",
    "GO-A5",
    "GO-A6",
    "GO-A7",
    "GO-I1",
    "GO-I2",
    "GO-I7",
    "GO-I8",
    "QS-1",
    "QS-2",
    "QS-3",
    "QS-4",
    "QS-5",
    "QS-6",
    "CC-1",
    "CC-3",
    "CC-4",
    "CC-7",
    "AC-01"
  ],
  "outputs": [
    "body.md",
    "evidence.md mapping claims/sections to exact accepted predecessor sections",
    "production-manifest.json listing actual consumed whole-file units and the scope of each, output hashes, gaps and procedure provenance",
    "request.txt exact visible dispatch",
    "response.md original visible result and limitations"
  ],
  "not_outputs": [
    "No oracle copy",
    "No new AGENTS or authority file",
    "No claimed runtime receipts or semantic verdicts",
    "No replacement of historical s1.core.entry"
  ]
}

## END_RECEITA_COMUM_EXATA

## BEGIN_PLANO_PUBLICO_EXATO

{
  "schema": "s1-03-required-artifact-plan/v1",
  "execution_id": "34269cf4-d631-41c5-a30b-85b0ec217390",
  "scope": "S1-03 only",
  "assigned_source_population": 462,
  "status": "FROZEN_BEFORE_DEPENDENT_L2_L4_PRODUCTION",
  "authoring_gate": "Only release each dependent after both same native judges accept every required predecessor; input body pins and acceptance refs are supplied at dispatch. This plan is not acceptance.",
  "artifacts": [
    {
      "key": "s1.core.automation",
      "layer": 1,
      "need": "flow",
      "required_build_predecessors": [],
      "purpose": "Actions, Board e agendamento: contratos da implementação"
    },
    {
      "key": "s1.core.research",
      "layer": 1,
      "need": "component",
      "required_build_predecessors": [],
      "purpose": "Research e toolkits: contratos, prontidão e autoridade da evidência"
    },
    {
      "key": "s1.core.boundaries",
      "layer": 1,
      "need": "component",
      "required_build_predecessors": [],
      "purpose": "Fronteiras Core para Atlas, Relay, control plane e RAG"
    },
    {
      "key": "s1.subslice03.support",
      "layer": 1,
      "need": "entry",
      "required_build_predecessors": [],
      "purpose": "Suporte de entrada, ferramentas, história e fixtures dos104 paths"
    },
    {
      "key": "s1.subslice03.automation-flow",
      "layer": 2,
      "need": "flow",
      "required_build_predecessors": [
        "s1.core.automation"
      ],
      "purpose": "Entendimento local do ciclo de comando, Board e admissão agendada"
    },
    {
      "key": "s1.subslice03.research-flow",
      "layer": 2,
      "need": "flow",
      "required_build_predecessors": [
        "s1.core.research"
      ],
      "purpose": "Entendimento local da aquisição, índice, custódia e investigação"
    },
    {
      "key": "s1.subslice03.boundary-flow",
      "layer": 2,
      "need": "flow",
      "required_build_predecessors": [
        "s1.core.boundaries"
      ],
      "purpose": "Encadeamento e limites do lado Core das portas externas"
    },
    {
      "key": "s1.subslice03.automation-impact",
      "layer": 3,
      "need": "operational",
      "required_build_predecessors": [
        "s1.subslice03.automation-flow"
      ],
      "purpose": "Impacto de mudanças de contrato e separação de famílias independentes"
    },
    {
      "key": "s1.subslice03.research-impact",
      "layer": 3,
      "need": "operational",
      "required_build_predecessors": [
        "s1.subslice03.research-flow"
      ],
      "purpose": "Impacto de mudanças em receitas, índice, custódia e autoridade"
    },
    {
      "key": "s1.subslice03.automation-maintenance",
      "layer": 4,
      "need": "maintenance",
      "required_build_predecessors": [
        "s1.subslice03.automation-impact"
      ],
      "purpose": "Manutenção, diagnóstico, verificação e encaminhamento da automação"
    },
    {
      "key": "s1.subslice03.research-maintenance",
      "layer": 4,
      "need": "maintenance",
      "required_build_predecessors": [
        "s1.subslice03.research-impact"
      ],
      "purpose": "Manutenção e diagnóstico de research/toolkits e suas evidências"
    },
    {
      "key": "s1.subslice03.entry",
      "layer": 4,
      "need": "entry",
      "required_build_predecessors": [
        "s1.subslice03.support",
        "s1.subslice03.boundary-flow",
        "s1.subslice03.automation-maintenance",
        "s1.subslice03.research-maintenance"
      ],
      "purpose": "Entrada local rasa e aprofundamento com proposta de navegação para a união"
    }
  ],
  "direct_use_case_plan": {
    "A-PERMITTED": [
      "s1.core.automation",
      "s1.subslice03.automation-flow"
    ],
    "A-VIOLATION": [
      "s1.core.automation",
      "s1.subslice03.automation-maintenance"
    ],
    "A-IMPACT": [
      "s1.subslice03.automation-impact",
      "s1.subslice03.research-impact"
    ],
    "S-FAILURE": [
      "s1.core.automation",
      "s1.subslice03.automation-flow"
    ],
    "R-FAILURE": [
      "s1.core.research",
      "s1.subslice03.research-flow"
    ],
    "B-ABSTAIN": [
      "s1.core.boundaries",
      "s1.subslice03.boundary-flow"
    ],
    "ENTRY-NAV": [
      "s1.subslice03.entry",
      "s1.subslice03.support"
    ]
  },
  "case_limits_ref": "consumers/public-cases.json",
  "reserved_answers_included": false,
  "historical_entry": "s1.core.entry preserved byte-identically; never replaced or included as a rival new local definition",
  "union_navigation": "Existing concrete36-key/5-owner proposal remains NOT_SELECTED; S1_COORDINATION chooses union after five handoffs.",
  "navigation_rule": "Navigation links are not build edges. Declared entry dependencies concern the accepted explanations it summarizes; peer links alone never add dependency.",
  "allowed_adjustment": "Only a concrete new need/finding can change this finite graph; preserve previous plan and explain the delta before new dependent production."
}

## END_PLANO_PUBLICO_EXATO

## Inputs reais — projeção mecânica do manifesto

| Path local | Bytes | SHA256 | Papel declarado |
| --- | ---: | --- | --- |
| inputs/AGENTS.md | 16501 | 07acaefb95db4b07b4e76c4255f7d6e0ecc4c7466b46fbf6ec5e5cdf6cc01b4f | public_authority_or_procedure |
| inputs/COMMON.md | 12959 | ec78eb0fa7dd391c623bac4d953115df6fbd6ba77176dc1bf1cf43650e9a90e7 | public_authority_or_procedure |
| inputs/mission.json | 6006 | 32fc0a8d442eff56716ba86400b13109c4bbb97d047e12a2d597a930153e7f75 | public_authority_or_procedure |
| inputs/SKILL.md | 8143 | f86523d16180ce06376c1635e1ee2f51f61bf80f620466fdd2cf9821ff720029 | public_authority_or_procedure |
| inputs/references/principles.md | 6010 | f724520d864fff48e11951fa97d54a362517a863ef518bb7b3cb3606b01f3230 | public_authority_or_procedure |
| inputs/references/fatia-1.md | 3987 | 152429602222695674fe42b029e8d8d83c974c0369d6c441eccfa0cacfeba7ae | public_authority_or_procedure |
| inputs/references/fresh-start.md | 4983 | c5168fade744fd3809aeec6c48b22b85914c5257a0b7dd5b9dfcbb6c4c3b2166 | public_authority_or_procedure |
| inputs/references/orchestration.md | 4408 | b9c6b6cb8b67b4ff546c99aa62041657482a74f11822514e37e2dbbc755cbbcb | public_authority_or_procedure |
| inputs/references/judging.md | 5787 | c820270ed2d777777be8794980658f3fcfe6e59cfa05ccac197280c56035f0bb | public_authority_or_procedure |
| inputs/references/transport.md | 8478 | 02dbf78b9eb76c894d07c9e498704d2260157b7b10d5e1d159a0fd1037e73e3c | public_authority_or_procedure |
| payload/artifact-plan.json | 5017 | 6bf70a5c448d65ec3a046aefc0b0b9db2f783dcd8573a2d2ea69487bec7ce9ad | frozen_artifact_plan |
| payload/recipes/derived-contract.json | 4017 | bcde63f79d8cacd030293da38c580c55c5aa58e0a5ff3751f1d1e27971f17588 | actual_common_authoring_contract |
| payload/recipes/derived-public-criteria.json | 16244 | 1e7686491c5b68cb4f3d287377723edcd8932ae803c267ddbabf44a360dfc36e | public_normative_criteria |
| producers/automation/body.md | 60767 | 968965f1b15d633cefc8a78868d9d1049147f23dff409c6cb05c7a75e3561cae | accepted_semantic_predecessor |
| payload/recipes/derived/automation-flow.json | 8479 | ec4550336620b1d7abed85e78460c6d4c5ede73f31c8ddcf8a77be5272af3179 | original_task_recipe_retained |
| producers/derived-automation-flow/request.txt | 856 | da3d46f1369fc5ec17d4ec73b3b95ebeecf2c83c796f06e88d4409c1c64a331e | original_request_retained |
| producers/derived-automation-flow/dispatch-message.txt | 2056 | 808b4733f5306981efcdf337732dc6d53d1dce7b6569b5c7b32af0611e761fd9 | original_visible_dispatch_retained |
| producers/derived-automation-flow/revisions/v2/history/body.md | 16441 | 5985441b360d0efc6693d0d385980f4a93cab2c044387a7375608dd5a9adf517 | exact_retained_v1_output_consumed_for_correction |
| producers/derived-automation-flow/revisions/v2/history/evidence.md | 11997 | d2b8068c9167c0813719479d4d2b10046cc718921dad3db52d1f44957e3f1360 | exact_retained_v1_output_consumed_for_correction |
| producers/derived-automation-flow/revisions/v2/history/production-manifest.json | 16158 | 9c7d3130d4265bccba5e94fa0448b1d0bbbf3c02bf421a09d4e8d053cae4df06 | exact_retained_v1_output_consumed_for_correction |
| producers/derived-automation-flow/revisions/v2/history/response.md | 2470 | c8bf48be1b48cc17d8c376978e37c401079ba6e5ad72c51ac12443b8e433c7fd | exact_retained_v1_output_consumed_for_correction |
| payload/recipes/derived/automation-flow-source-fidelity-v2.json | 7391 | 16c2b4e2efc5a6e2ea6a111540e7a662ce154af3c58c366306e254f23d9b3364 | actual_frozen_correction_recipe |
| producers/derived-automation-flow/revisions/v2/request.txt | 841 | 34caa0867a7d0c02dd94c37f789c0af7262132bf4f2359563021b8df3977e769 | actual_current_correction_request |
| producers/derived-automation-flow/revisions/v2/dispatch-message.txt | 1370 | b5cf544c85c7f3fae4739c200210f829a8b72a7bbb65eab809799fa198621e93 | actual_visible_correction_dispatch |

Manifesto original posterior: producers/derived-automation-flow/production-manifest.json; 27416 bytes; SHA256 1802600a673c0521064bc636bd9be5e9e9aad9dd644f26efd5d14c02bee52cff. Ele permanece integral no payload, mas sua totalidade não é retransmitida aqui. Conteúdo declarativo de uso não substitui seu juízo.

Decida somente após FIM_DO_LOTE externo.
