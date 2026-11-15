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
