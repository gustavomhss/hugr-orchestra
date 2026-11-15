# Automação no Core: Actions, Board e agendamento

**Artefato:** `s1.core.automation` · **camada:** L1 · **necessidade:** `flow` · **escopo:** `orchestra.s1`.

**Fonte observada:** `gustavomhss/hugr-orchestra`, commit `1cde2ff7a71bcf7aecb5d030917b577165135d38`. Este corpo é uma nova produção da chave histórica, construída sobre o corpo herdado de `a8df22ae3a140c58c63f62ce2a634c84f415c943`; não apaga respostas, correções, recibos ou decisões anteriores. O protocolo é `ee2521a5b966bd505cc95bd1c733e09e12f33531`, o kit é `70234d541a9a3539935ef16f19e33c8f2d5f30ec` e a execução local é `34269cf4-d631-41c5-a30b-85b0ec217390`. Metadado herdado `supported` não é aceite independente desta versão.

## Como usar este L1

Este corpo permite seguir uma operação desde sua intenção até o fato que a implementação realmente consegue observar. Para modificar dispatch, retries ou auth, comece em **1–5**; para trabalho planejado, CI e integração, em **6–9**; para cadência, retomada e revogação, em **10–12**. **13–14** delimitam provas e impacto de manutenção. Os identificadores `[A…]`, `[B…]`, `[S…]` e `[T…]` apontam para trechos literais em `evidence.md`; cada trecho conserva arquivo, linhas, commit, Git blob, SHA256 e bytes. `coverage.jsonl` dá disposição individual às 204 fontes; `captures.json` identifica os bytes capturados.

**Vocabulário de autoridade.** “O código faz/recusa/persiste” significa observação estática das implementações capturadas. “Intenção” designa o contrato ou comentário atribuído que orienta esse código. “Inferência estática” explicita uma consequência deduzida, sujeita a revisão. “Teste existente” significa código de teste lido, **NOT_RUN nesta produção**. Nenhum estado de sucesso da implementação é um resultado executado por este produtor. Não houve chamada a provider de produto, CI, CLI autenticada, sessão agendada ou Atlas runtime. Este L1 não se autocertifica semanticamente e não qualifica runtime. [A01, B01, S04, T01]

### Três mecanismos, três significados de sucesso

| Superfície | Propósito e identidade | Saída que realmente autoriza afirmar algo | O que essa saída não prova |
| --- | --- | --- | --- |
| Actions | Operar CI e seus recursos no projeto nativo vinculado a uma Location e conta | Recibo durável da intenção; acknowledgment qualificado; observação por ID nativo; bytes de uma transferência | `accepted` não significa execução terminada; `confirmed` confirma a pós-condição observada da operação, que pode ser somente a existência do dispatch |
| Board | Registrar plano, decisão do owner, evidência de trabalho e fila de integração de cards | Estado local com atividade; evidência PR/CI; commit de bundle integrado no remoto | Campo narrativo ou decisão não prova seu resultado; scoped-green não é full gate; mirror e CI do Board não herdam o ledger de Actions |
| ScheduledTask | Admitir prompts em Sessions nos slots de duas políticas separadas | Claim, identidade de Session/mensagem, recibo `started` após admissão | `started` não é conclusão, resposta satisfatória, execução da intenção do prompt nem término de trabalho externo |

Essas fronteiras se cruzam conceitualmente, mas são implementações distintas. Em especial, a fila do Board tem transporte `gh`, ledger e heurísticas de correlação próprios; não recebe por transitividade as garantias de identidade, não repetição e readback de Actions. [A15–A17, B04, B06–B10, S04]

## 1. Actions: vínculo, leitura e autoridade

### 1.1 Vínculo confiável antes de tocar o provider

`actions.ts` é uma fachada da Location. A construção é preguiçosa: abrir uma Location sem Git não exige resolver remoto ou CLI; a operação solicitada é que descobre a indisponibilidade. A resolução do binding, a inicialização cached de operations e o carregamento de output são adiados; transport, readers e resources são compostos ao construir a fachada. O vínculo guarda ID estável, revisão, provider/host/API origin, projeto nativo e conta; o chamador passa a referência de ID/revisão, e a implementação relê o estado confiável. Nome visível, path do repositório ou metadado trazido pelo cliente não substituem a identidade nativa. [A01–A02]

`binding.ts` resolve o diretório físico e examina URLs brutas **e** URLs efetivas após `insteadOf`, antes de resolver autenticação. Canonicaliza HTTPS/SSH/SCP e aliases públicos permitidos, recusa credenciais embutidas, remotos ambíguos, host/origin incompatíveis e caminhos inseguros. No subprocesso Git desse vínculo, remove `GIT_*`, desliga locks opcionais/fsmonitor e limita tempo/saída. Criar não pode duplicar remoto ou identidade imutável. Atualizar exige revisão esperada e pode mudar conta/remoto sob as verificações, mas não retargetar provider/projeto; atualização de policy local também avança a revisão. [A02]

`state.ts` armazena JSON fora do checkout, particionado por projeto e hash de diretório/workspace, com schema estrito, limites, verificações de caminho/symlink, arquivo temporário exclusivo e rename. Um estado corrompido ou bloqueado não vira lista vazia. Diretórios/arquivos têm permissões restritas. O mutex dessa escrita é local ao processo; não equivale a coordenação distribuída de várias instâncias. Credenciais do provider não são um campo desse arquivo. [A02]

**Pré-condição operacional:** o usuário precisa de remoto compatível, conta autenticada e autorização nativa para a operação particular. `capabilities` não promete essas permissões genericamente: uma leitura de catálogo bem-sucedida pode marcar aquela leitura disponível; várias capacidades de escrita continuam `unknown`. Ausência de um campo de permissão não é aprovação, e uma negação observada é respeitada. `Binding.policy` é política do Orchestra; editar essa política não configura remotamente GitHub ou GitLab. [A03, A18, A20, A27]

### 1.2 Identidade e paginação são parte da leitura

IDs positivos canônicos permanecem strings quando necessário, sem perder precisão. Commits aceitam as identidades SHA previstas por cada parser. Cursors vinculam binding/revisão, provider/host/projeto, escopo de consulta e fingerprint de filtros. Mudar filtro, escopo ou vínculo invalida o cursor; página inconsistente, continuação incompleta ou total desconhecido não deve ser apresentado como inventário vazio/completo. Cada adapter aplica ainda regras nativas de paginação. [A03–A07]

| Leitura | GitHub | GitLab |
| --- | --- | --- |
| Catálogo | Workflow tem ID nativo, path, nome e estado próprios. Resolver repo usa `/repositories/{id}`, sem fallback silencioso para um path que pode ter sido reutilizado | Um slot de configuração de pipeline por projeto: `gitlab:project:<id>:pipeline`. Não é uma coleção de workflow IDs GitHub. `ci_config_path` explícito é preservado; configuração externa/dinâmica fica não resolvida |
| Fonte | Resolve ref a commit, lê conteúdo nesse commit, verifica tipo/path, tamanho, base64, UTF-8 e hash Git do blob; SHA explicitamente solicitado é conferido | Resolve commit e verifica que arquivo, commit e conteúdo retornados pertencem à leitura. Versão da fonte é JSON com `blob_id` e `last_commit_id`. Arquivo histórico não demonstra qual definição gerou cada job |
| Runs | Mantém ID, workflow, commit, ref, evento, estados e `run_attempt`; `updated_at` não é inventado como `finishedAt` | Pipeline mantém ID/projeto/source/status/ref/commit e tempos nativos; não se fabrica número de tentativa |
| Jobs | A leitura fixa tentativa atual ou explicitamente solicitada antes de listar; confere run e tentativa | Jobs e bridges são coleções nativas separadas, percorridas em faixas distintas do cursor; `include_retried=true` conserva IDs diferentes. Nome/stage não prova `retryOf`, `definitionID` ou tentativa |
| Filtros | Usa sintaxe nativa de criação/evento/status/ator/SHA; filtros não representáveis são recusados | Usa capacidades versionadas observadas no servidor, por exemplo criação limitada por data exige versão qualificada; não aceita um filtro genérico que a API não representa |

As diferenças acima são comportamento dos adapters, não equivalências entre providers. A versão declarada no binding não prova recursos GitLab: os gates relevantes consultam `/metadata`. O leitor GitLab vincula `file.commit_id` ao commit resolvido, mas não reproduz em todo caminho a comparação explícita GitHub de SHA solicitado versus SHA resolvido; não se deve generalizar a prova exata de um adapter para o outro. [A04–A07]

## 2. Fonte de CI: compreender, validar e propor alteração

### 2.1 O grafo é uma projeção da definição

O parser conserva o texto de fonte e impõe limites antes e durante parsing: fonte de 1 MiB, profundidade, nós, lexemas, aliases, merges, resoluções e diagnósticos. YAML usa schema seguro, rejeita valores/estruturas não representáveis, chaves perigosas e duplicatas. Isso limita expansão e trabalho; não executa expressões, scripts ou includes. Os estados `complete`, `partial` e `unresolved` pertencem à interpretação local. [A08]

No GitHub, `jobs` são definições. Uma matriz estática continua uma definição; células executadas são outra informação. `needs` local cria arestas e recebe validação de referência/ciclo. Matriz dinâmica, reusable workflow ou condição podem exigir `partial`; não se inventam execuções. No GitLab, templates ocultos não viram jobs executados; `extends` local usa reverse deep merge, com pais posteriores/filho prevalecendo e arrays substituídos. `default` copia keywords inteiras quando permitido, sem deep merge de default em valor explícito do job. Limites e ciclos interrompem a resolução. [A09–A10]

`include`, `!reference`, regras, paralelismo, downstream e dependências externas permanecem metadados ou parcialidades qualificadas quando não resolvidos. Stage order não fabrica `needs`. `needs` optional ausente pode ser omitido; required ausente e ciclos geram diagnóstico. A existência de um arquivo local correto não prova que regras/inclusões produzirão aquele DAG no servidor. [A10]

O lint GitLab usa `ci/lint` com `dry_run:false` e `include_jobs:false`: erros podem tornar a fonte não resolvida; warning/indisponibilidade mantém limite. Um lint aceito **não** completa a topologia local nem simula uma pipeline. GitHub aqui oferece validação local, não um lint remoto equivalente. [A14]

### 2.2 Ciclo de autoria com base imutável

Um fluxo de manutenção é: observar a branch base por `sourceBase`; obter commit exato; validar rascunho contra essa base; admitir cada mutação apropriada; criar branch, escrever arquivo e abrir review quando necessário. As fases não são uma transação remota única. Cada nova fase precisa das identidades/precondições correspondentes ao estado que acabou de ser observado. [A11–A14]

| Fase | Entradas e prova antes de escrever | Pós-condição exigida / falha |
| --- | --- | --- |
| Base e draft | Branch padrão observada ou short branch explícita; sem adivinhar `main`. Draft fixa path/base commit e calcula SHA256 do texto local | Releitura detecta branch movida. Hash do draft não é `sourceVersion` nativa |
| Branch | Nome seguro e base commit esperada; nos caminhos de proposta de arquivo novo, ausência no path exato só após prova de projeto/ator/head | Retorno deve provar a nova ref e commit-base. 404 genérico/auth não autoriza criar |
| Arquivo GitHub | Path literal `.github/workflows/<arquivo>.yml|yaml`; create sem blob anterior, update com SHA do blob; commit esperado; texto UTF-8 bem formado e limitado | `PUT contents` usa semântica create/update; retorno e readback devem provar path, bytes e commit novo. Texto idêntico não vira alteração fictícia |
| Arquivo GitLab | Path local explícito; create por POST, update por PUT com `last_commit_id`; fonte anterior exige os dois componentes de versão | Releitura deve provar blob e último commit do arquivo no novo head; editar um path alternativo não muda automaticamente `ci_config_path` |
| Review | Mesmo projeto/repositório, source/target branches e commit observados; base diferente; título/corpo literal | PR/MR retornado precisa da identidade, branches, estado e URL nativa exatos. URL é saída do pedido; não é aceite/merge |

O texto/payload é congelado antes do primeiro `await`, e os schemas recusam extras e precondições que não pertencem à operação. Segredos/textos não devem ser refletidos em erros. Antes da escrita, falhas qualificadas podem ser `definitely_unsent`; depois de uma escrita, perda da confirmação/readback é `outcome_unknown`, inclusive se o arquivo já tiver mudado. Não há retry de mutação nem rollback silencioso para “fazer a confirmação passar”. [A11–A14, A16]

Há dois editores de schedule YAML: o helper de autoria e o usado pelo recurso GitHub. Ambos alteram o campo schedule com restrições próprias, recusam estrutura ambígua/aliases nos caminhos admitidos e preservam outros elementos dentro do suporte observado. Não são um parser universal de cron nem garantia de disparo remoto; o provider continua decidindo aceitação e execução. [A14, A31]

## 3. Intenção durável, execução única local e readback

### 3.1 O ledger protege o envio, não inventa certeza remota

`prepare` captura intenção estrita com binding/revisão, kind, target, expected e client ID. O ledger SQLite vincula Location/projeto/diretório/workspace, provider nativo e ator. A unicidade é `(location_key, binding_id, client_id)`. Repetir a mesma admissão retorna a mesma operação apenas quando a identidade e a intenção concordam; reutilizar a chave com conteúdo diferente é conflito. O payload de execute, inclusive texto ou segredo, não é persistido como intenção nem como acknowledgment. [A15]

| Estado | Significado observado e transição |
| --- | --- |
| `prepared` | Intenção admitida, ainda não enviada. Lease de admissão de 24 horas; execute só pode reivindicar uma preparada válida |
| `sending` | CAS durável ganhou o direito de executar. A implementação registra a fiber antes do CAS e amostra tempo sob lock; duplicatas não enviam novamente nem esperam a mesma chamada como um novo envio |
| `accepted` | A escrita devolveu acknowledgment qualificado, com apenas metadados permitidos. Não é conclusão do trabalho remoto |
| `rejected` | Há prova de não envio ou rejeição definitiva segundo o classificador; uma mensagem vaga de stderr não basta |
| `outcome_unknown` | A escrita pode ter ocorrido, houve interrupção/timeout ou prova incompleta. Recuperação de `sending` órfão chega aqui; não reexecuta |
| `confirmed` | Readback atribuído estabeleceu a pós-condição contemplada pelo observador |
| `expired` | Admissão passou do prazo, ou recibo terminal envelheceu segundo retenção. A chave de admissão e a intenção permanecem retidas |

Execução tem deadline de 30 s e vínculo ao Scope; fechamento interrompe/aguarda trabalho. Recuperação de `sending` acontece uma vez por lifetime do serviço de banco, não a cada reconstrução de Location. Retenção de 30 dias limpa resultado/envelhece estados elegíveis, **não** apaga a chave para autorizar reenvio. `outcome_unknown` não é descartado como terminal comum. Limites de ledger (100.000) e unknowns (10.000) recusam novas admissões quando excedidos. Estes são limites observados do código, sem medição de capacidade aqui. [A16]

### 3.2 Confirmar exige atribuição suficiente

`reconcile` da fachada usa `ActionsReadback.observe`; não escolhe automaticamente um reconciliador especializado por resourceKind. Só observa operações `accepted`/`outcome_unknown`, sem chamar `perform`, sem nova admissão e sem replay. Combinação de observações não pode trocar runID/jobID/resourceID/tentativa já atribuídos. Promoção exige observação atribuída; pending conserva o recibo. [A17]

| Operação | Regra concreta do observador genérico | Consequência para o mantenedor |
| --- | --- | --- |
| Dispatch com runID | Relê o run exato; verifica commit esperado e identidade, workflow/ref; GitHub exige evento `workflow_dispatch` | Pode confirmar um run ainda em andamento: confirmou dispatch, não sucesso da pipeline |
| Dispatch sem ID ou `unattributed:true` | Retorna pending antes de procurar runs | HTTP 204 aceito não autoriza escolher um run “próximo” |
| Retry/retryFailed | Precisa de tentativa no acknowledgment e tentativa observada suficiente | Os comandos GitHub atuais retornam runID sem nova tentativa; portanto esse caminho não obtém confirmação genérica apenas do acknowledgment. GitLab não inventa tentativa |
| Cancel/forceCancel | Confirma conclusão `cancelled` ou status nativo `canceled` | Aceitação de cancelamento não é cancelamento já concluído |
| Source/resource/job e demais kinds | O observador não implementa pós-condição genérica para esses kinds | Um write pode permanecer `accepted`, mesmo que sua fase tenha feito readback próprio; não anuncie confirmação genérica inexistente |

Essa limitação é uma propriedade do código, não uma fila de mudanças executadas por este trabalho. Uma operação ambígua exige examinar o recibo e o recurso nativo adequado, preservar o ID e decidir uma ação nova com sua própria autoridade; trocar client ID para repetir automaticamente a mesma mutação abandona a proteção de deduplicação. [A17, A19, A22]

## 4. Comandos e recursos têm semântica nativa

### 4.1 Comandos GitHub

Autoridade passa por repo imutável e conta atual, recusando permissões negativas/arquivo arquivado/scopes clássicos incompatíveis quando observados. O ator é revisto próximo do envio, porque cada invocação `gh` pode resolver credencial novamente. Esperados de fonte/run/tentativa são conferidos no contexto apropriado; um campo extra não pode simplesmente ser ignorado. [A18]

| Intenção | Elegibilidade, envio e acknowledgment |
| --- | --- |
| `workflow.dispatch` | Workflow ativo; prova de `workflow_dispatch` na branch padrão **e** fonte da ref selecionada; inputs literais tipados/defaults/required/choices e environment por identidade nativa. POST dispatch: 200 com identidade completa pode atribuir run; 204 fica `unattributed` |
| `workflow.enable/disable` | Estados nativos admitidos e precondição opcional de fonte; PUT com 204. Acknowledgment vazio não é execução de workflow |
| `run.retry` / `run.retryFailed` | Run completo; failed-mode restringe conclusões a failure/cancelled/timed_out. Endpoint rerun ou rerun-failed-jobs; 201/204. Retorna ID do run anterior, sem inventar nova tentativa |
| `run.cancel` / `run.forceCancel` | Estado ativo/cancelável; 202. Force-cancel é limitado ao host público/origin público e à versão de API selecionada que o código observa (`2026-03-10` neste baseline) |
| `run.delete` | Run terminal, DELETE 204; não interpreta ausência como um novo sucesso de execução |
| `run.approveFork` | Evento pull_request, action_required, repo público, head repo distinto e realmente fork; confere novamente run/commit/tentativa/estado antes de aprovar |
| `job.retry` | Job exato do run, SHA e tentativa atual; job e run terminais. Retorna IDs conhecidos, sem prometer nova tentativa/job observado |

As regras de input são leitura estrutural limitada, não avaliação de expressões de Actions. O limite de definições dispatch é próprio desse caminho e menor que o limite geral de fonte. [A18–A19]

### 4.2 Comandos GitLab

O plano passa por projeto nativo, papel observado e conta; campos de repo/CI desabilitados, arquivamento, políticas de variables/cancelamento e mínimos de versão são verificações particulares. Roles desconhecidos não são promovidos a autorização. O adapter constrói plano antes do único envio principal e exige status e resposta nativos qualificados. Numeric attempt e `resourceVersion` não têm significado no dispatcher de execução GitLab. [A20–A22]

| Intenção | Diferença nativa que deve sobreviver a uma alteração |
| --- | --- |
| Dispatch comum | POST pipeline por ref/commit observado; inputs e variables usam campos nativos. Ack precisa manter projeto, SHA, ref e source adequado |
| Trigger | Endpoint de trigger e token no corpo têm semântica própria; não é dispatch comum com token em query/diagnóstico |
| Pipeline de MR | Endpoint por IID de MR aberta no mesmo projeto; fork é recusado sem prova de placement. Source `merge_request_event` e refs head/merge são conferidos |
| Retry de pipeline | Endpoint nativo retry, sem significado de rerun-all ou tentativa GitHub; retorno confirma aceitação/identidade do pipeline, não término de jobs |
| Cancel / delete / rename | Cancel respeita política; delete requer role mais alta e resposta vazia 204; rename exige versão nativa observada e confirma nome. Não há a mesma lista local de estados terminais do dispatcher GitHub |
| Job retry/play/cancel/erase | ID e ownership exatos, regras de estado específicas; retry deve retornar **outro** jobID, não converter nome em vínculo. Play é manual; erase exige estado/autoridade e não aceita arquivo variável. Readback pós-envio incompleto deixa unknown |
| Bridges | Distintos dos jobs ordinários; retry/play dependem de versão qualificada, cancel/erase não são generalizados. Busca de bridge por ID é limitada e não adivinha por nome |

Inputs de pipeline dependem de especificação local autoritativa e versão GitLab observada (o suporte explícito usado aqui exige 18.1). Includes desconhecidos não viram schema de inputs vazio; constraints que o código não consegue validar com fidelidade são recusadas, sem trocar regex nativa por avaliação JavaScript. Defaults omitidos ficam com o provider. [A20–A22]

### 4.3 Recursos: escopo, versões e efeitos parciais

`resourceID`, `resourceKind` e scope pertencem ao projeto vinculado. Versões de recurso são fingerprints de metadados selecionados ou versões/ETags nativos nos caminhos que os suportam; não contêm segredo e não constituem, por si, um CAS atômico no servidor. A implementação relê antes da escrita, mas a janela até o provider continua existindo. Em fluxos multifase, a primeira rejeição pode ser definitiva; falhar depois de uma fase aplicada é `outcome_unknown`, sem rollback ou repetição automática. [A23]

| Recurso | GitHub | GitLab / limite relevante |
| --- | --- | --- |
| Variables/secrets | Repo ou environment; values legíveis só para variables. Secret é criptografado com sealed box e chave pública observada; nome/metadados podem ser lidos, valor não retorna. Rename só de variable legível | Identidade inclui key **e** environment_scope; `Repository` literal não é alias de `*`. Masked/hidden/hidden desconhecido redigem valor. Hidden create exige versão observada; valor refletido na resposta é descartado. Movimento de scope e rename só onde explicitamente suportados |
| Environments | Reviewers resolvidos a users/teams nativos; branch/tag policies separadas; alterar proteção e refs pode aplicar parcialmente. Não altera silenciosamente plataforma de cobrança via timer ausente | Description/tier e conjunto limitado de approvals representáveis; proteção não garante filtro de branch/tag e não oferece wait timer equivalente. Wildcards, groups/roles ou multiapprovals não representáveis tornam reviewers read-only. Delete exige environment parado |
| Deployment review | Aprovação de pending deployments da execução exata e elegibilidade do ator | Deployment bloqueado e approvals pendentes precisam de prova. Aprovar **não** executa job manual. Não confundir resource listing genérico com esse read por run |
| Policy/retention | Política de actions permitidas preserva enabled/set selecionado; retention herdada não é um controle remoto implementado aqui | Política local de retenção fica no binding; GitLab approved-actions equivalente é indisponível. Project settings observados não implicam suporte para editar qualquer campo |
| Caches | IDs/chaves/refs nativos; delete por ID ou key exige inventário suficiente e correspondência exata; uso é metadado com atualização aproximada | Uma entrada de cache de projeto descreve **invalidação do namespace**, via `/api/graphql`: afeta jobs futuros, não enumera/deleta cada blob e mantém blobs existentes. Não prometer remoção física imediata |
| Runners | Repo scoped dá ownership; labels read-only/plataforma instalada não podem ser alterados como labels custom. JIT exige runnerGroupID explícito. Token de registration tem saída sensível efêmera e ack unattributed, sem provar instalação | OwnerProject vem de GraphQL, não da ordem de assignments ou tags. Runners herdados/externos são read-only salvo assign qualificado. Delete recusa impacto em outros projetos. Enrollment `user/runners` depende de versão e devolve token por saída de comando |
| Schedules | Cron é conteúdo YAML de workflow na **branch padrão**; update exige commit/sourceVersion e publica como source.write. Sem API de play/ownership/pause independente; múltiplos crons exigem editor explícito | Pipeline schedule tem ID, owner, timezone, ref e active próprios. Update exige owner; take-ownership requer papel adequado. Inputs/variables têm fases próprias. Play 201 `Created` retorna resourceID **unattributed**, sem pipelineID ou prova de término |
| Artifacts | Metadados e delete por artifactID nativo; keep não é suportado por equivalência | JobID identifica o artifact resource. Erased/expired/unavailable são estados explícitos. Keep exige confirmação de expiry nula; delete é operação nativa de artifacts do job |

Valores secretos existem somente no caminho necessário à chamada e na saída sensível tipada quando aplicável; o ledger registra acknowledgment permitido, não CommandOutput de token/JIT. Isso não autoriza alegar apagamento garantido de toda string da memória do runtime. O wrapper de sealed box zera seu byte array local, não controla todas as cópias do texto JavaScript. [A24–A31, A37]

**Assimetria concreta da API de environments/deployments:** `resources.ts` roteia ambos os kinds ao mesmo domínio, mas `environments.list` valida a seleção como `environments`; pending reviews são obtidos pelo caminho `environments` com runID. Não descreva `resources({kind:"deployments"})` como listing independente demonstrado. Esse é um limite de composição observado, não uma correção implementada aqui. [A23, A26]

## 5. Transporte e download: onde a incerteza começa

No GitHub, metadados usam `gh api`, argumentos explícitos, sem shell, JSON por stdin, host/API coerentes, prompts/pager/debug desativados e limites de saída/tempo. Identidades retornadas são parseadas; CLI ausente é erro nomeado. `stderr` e bodies do provider podem refletir segredo; o boundary produz classificações seguras em vez de reproduzir o diagnóstico bruto. Header/JSON completos e exit normal são necessários para classificar uma rejeição definitiva. Timeouts, exits anormais, status 5xx, respostas parciais e dicas soltas em stderr não demonstram “não enviado”. [A32, A34]

No GitLab, `glab` qualificado é usado para snapshot de configuração; HTTP vai por HTTPS direto ao host/origin vinculado. Este baseline exige `glab 1.118.0` e prefixo de commit qualificado, não “qualquer glab instalado”. Token/job token/OAuth e referências CA/mTLS ficam no snapshot em memória por pedido. O mesmo snapshot verifica ator e faz escrita. Arquivos TLS são limitados e regulares; certificado/chave vêm em par; TLS verifica cadeia e hostname, sem aceitar skip flags como substituto. Não se transfere credencial nativa em redirect. A fase `http_possible` é pegajosa: depois da possibilidade de HTTP autenticado, falha de transporte continua ambígua. [A33–A34]

Metadados têm budget de bytes/tempo; streams têm watchdog absoluto próprio e finalização que fecha processo/socket mesmo sob backpressure ou consumidor segurando chunk. No caminho GitHub, EOF ainda precisa de exit válido do child; bytes já emitidos não tornam um término falho bem-sucedido. Upload GitLab usa framing multipart e backpressure explícito, com rota e filename admitidos; existência desse seam não significa que todo resourceKind ou UI publique secure files. [A32–A36]

### 5.1 Transferir resultado sem mudar sua autoridade

`transferInfo` e `transfer` resolvem o alvo por binding e IDs; run/job/artifact/attempt precisam pertencer uns aos outros. Paths de single file são validados. GitHub oferece logs de run/tentativa/job e artifact ZIP pelos endpoints qualificados; GitLab oferece trace/artifacts de job e arquivo direto, sem inventar pipeline log ou tentativa. Artifacts GitHub não ganham tentativa por associação especulativa. Erased/expired recusam download. [A35]

GitLab pode abrir rota autenticada que devolve redirect para URL assinada. Cada hop assinado precisa de HTTPS seguro e usa getter separado, **sem** Authorization/cookies/mTLS/headers do request nativo. Redirects têm limite. Expiração 401/403/404 permite uma única renovação read-only do endpoint original **antes de qualquer byte emitido**; depois de transferência parcial, falha propaga sem replay. Revalida identidade na renovação. O código não declara uma allowlist geral de IPs privados nem verificação criptográfica do corpo apenas porque um digest apareceu em header. [A36]

Headers de tamanho/tipo/digest/range são metadados limitados; filename é reduzido a basename seguro, com controles/bidi e nomes perigosos tratados. Não há extração de archive. O input público não fornece um contrato arbitrário de Range; partial content não solicitado é recusado no caminho qualificado. A confirmação útil ao consumidor é “estes bytes desta tentativa/recurso chegaram até um EOF válido”, preservando falha se o stream terminou mal. [A35–A36]

## 6. Board: plano, owner, evidência e memória de decisão

Board oferece projetos, epics, issues, steps, dependências, perguntas, decisões, notas, anexos, trail/proof, forecasts/spend, snapshots e fila. Tools de Board pertencem ao agente default Maestro: o guard em `tools.ts` recusa outros seats mesmo quando o perfil deixaria chamar a tool. Esse guard é da porta de tools; métodos internos recebem actor/contexto conforme seus callers, portanto não se deve apresentá-lo como autenticação universal de toda função exportada. [B01]

As escritas centrais do serviço usam transação SQLite immediate, registram atividade e publicam `board.changed` depois do commit. Banco quebrado é defect, sem recuperação fabricada. Queries/projeções transformam rows em wire shape; anexos expõem label/tipo/tamanho, não path interno nem credentialID. Owner e Maestro têm verbos distintos. [B01, B03]

### 6.1 Fluxo do card e controles

Um issue novo de Maestro nasce em backlog. Intake é entrada de issue GitHub e exige owner accept→backlog ou decline→cut, salvo auto-accept configurado. Review requer PR. Um move direto a shipped com PR pede leitura fresca, sem cache, de merge e confere que o PR não mudou antes do write; sem PR, a mudança usa a justificativa do contrato de entrada e não fabrica merge. Maestro não move diretamente para queue; chama a fila do host. Card em queue não pode trocar PR/branch pelo update comum. [B02, B07]

Project/issue pausado bloqueia os caminhos normais de planejamento que chamam `requireActive`; perguntas continuam sendo meio de alcançar owner. Archived recusa mudanças nos caminhos pertinentes; archivar exige projeto shipped ou paused; unarchive volta paused. Owner hold-before-merge barra move direto a shipped e filtra o card antes de formar bundle. Isso é diferente de revogação atômica de um bundle já em execução, discutida em 8.4. [B02, B10]

Dependências são refs resolvidas, inclusive cross-project, com recusa de self/cycle antes de substituir lista. Steps permitem no máximo um active. `blocking` em pergunta e `paused` ajudam a representar espera/forecast; não se deve presumir que todo método externo, CI ou fila revalida todos esses sinais. Orçamento impede **entrada nova** em building quando o gasto medido alcança 100%; trabalho já building continua. [B02, B05]

### 6.2 Decisão, resultado narrado e undo

Responder pergunta aberta exige opção existente; cria decisão com pergunta, opções, recomendado, escolhido, texto, owner e instante. Alterar uma decisão cria outra e liga `supersedes_id`/`overturned_by_id`; a pergunta carrega a resposta atual para Maestro. Não se reescreve a decisão antiga. Mudar uma já superada é recusado. [B03]

`decisionOutcome` grava o resultado narrado por Maestro na decisão vigente; não consulta PR, CI ou agente para provar o relato. Até haver relato, a projeção mostra `applied, no result yet`. O mantenedor deve distinguir **owner escolheu**, **Maestro declarou resultado** e **fato independente observado**. [B03, T01]

Undo é um novo evento inverso, limitado a ações de planejamento Maestro permitidas ou `github.overwrite`. Se atividade posterior tocou os mesmos campos da mesma entidade, recusa para não sobrescrever trabalho mais novo. Owner faz a ação contrária para reverter seus próprios controles. Notas de owner podem ser editadas/removidas; notas GitHub/Maestro/threads do host não recebem esse poder. Threads do host têm IDs determinísticos e insert-on-conflict-do-nothing para retry exato. [B03]

Segredo anexado vai ao credential store; Board conserva label. Arquivo vai para diretório de dados e registro aponta a cópia. Remover segredo elimina credential row; remoção física de arquivo acontece depois do commit. O fato de a escrita de arquivo ocorrer dentro do fluxo de transação não torna filesystem e SQLite atomicamente reversíveis. Não atribuir rollback externo garantido a uma transação de rows. [B03]

## 7. Espelho GitHub, CI local e métricas do Board

### 7.1 Espelho e fatos vivos

O mirror usa `gh` autenticado sem prompting, runner injetável e sem armazenar token diretamente. Serializa sync/CI pelo seu semaphore local. Sync puxa issues/comments, segue PRs e empurra cards dirty. A origem de Intake é delimitada pelo instante inicial do mirror; issues fechadas históricas, PRs e markers de outro Board não são importados como novos cards. Pagination é uma varredura limitada por `since`, ETag, lotes de 100 e até cinco passos; não é inventário ilimitado garantido. [B04]

Board prevalece para stage/steps; divergência de title/body marcado gera atividade `github.overwrite` e próximo push restaura Board, com undo possível. Close/reopen divergente gera pergunta, sem aplicar automaticamente stage do issue remoto. Comentário vira nota uma vez por ID; esse caminho não é sincronização bidirecional de edits de comentários. Push preserva labels de pessoas, substitui stage/type, renderiza steps/footer/marker e usa milestone de epic. Dirty só é limpo se a row não mudou durante o envio. [B04]

PR aberto pode levar building→review; PR merged pode levar building/review→shipped, respeitando os controles lidos nesse caminho. Erro de um PR deixa seu card sem avanço. Trail usa leitura PR, cacheia somente sucesso por 30 s e expõe `verifiedAt`; sign-out/error/none permanecem estados próprios. Proof combina esse fato vivo com attempts, crash reason, guardrail e decisão armazenados; não converte campo de card em prova externa. [B02, B04, B13]

### 7.2 `ci_run`: resultado do tree, não do rótulo

O contrato vem de `.orchestra/ci.json` no base ref observado. JSON inválido recusa execução. Ausente, tenta descobrir required PR checks e escolhe defaults `required-checks` ou `no-ci`; indisponibilidade dessa descoberta não é a mesma prova forte de “repo não tem CI”, pois o default deriva do resultado que esse caminho conseguiu ler. O contrato define scoped tests/workflows, full checks/label/control, base, bundle/lane/budget, remote de snapshot e somente merge commits. [B06]

O tree corrente é obtido com índice temporário; ci.ts preserva timestamps ao copiar o índice para não esconder edição de mesmo tamanho/segundo. Checks são registrados por issue, tree e comando. Commit com mesmo tree pode reutilizar o resultado; editar conteúdo perde o green daquele tree. `run:false` só relata. Comando é tokenizado por whitespace, sem shell; `{package}` e `{files}` têm substituição específica, não interpretação completa de quoting shell. [B06]

Se scoped tests precisam de package e nenhum foi fornecido, turbo deve provar packages afetados. Havendo packages, recusa e nomeia; se nenhum workspace package foi afetado, pode registrar explicitamente `none: no workspace package affected` como pass, sem testes. Essa é uma convenção do gate, não execução vazia disfarçada. O estado usa o resultado mais recente por `(kind, command)` no tree: qualquer `fail` produz scoped-red e, sem requisito configurado, retorna null. Para scoped-green, basta algum check `scoped` com `pass` quando há scoped.tests, além de um `pass` por workflow exigido. Isso pode coexistir com outros checks scoped `pending`/`error`; não prova que todos os comandos scoped passaram. [B06]

Para o card, o ledger evita novo dispatch do mesmo workflow no mesmo tree quando já existe row com outcome diferente de `error`; se houver apenas rows em `error`, permite outra tentativa. **Aqui há heurística:** após dispatch sem ID, Board consulta últimos runs da branch/workflow/evento e escolhe correspondência por SHA e createdAt a partir de 60 s antes do envio. Lane rollup também usa o run mais novo por workflow no head do bundle. Essas correlações são mais fracas que a atribuição exata de Actions; concorrência externa no mesmo head pode tornar associação ambígua. Trata-se de limite estático explícito, sem corrida reproduzida nesta produção. [B06, B08]

### 7.3 Spend, forecast e ledger são estimativas com origem

Spend lê custo/tokens de Sessions vinculadas e seus filhos imediatos, mais cache de minutos CI; não busca GitHub a cada render. `spend.card` considera medida a Session com custo positivo cujo provider não é `claude-code`; não medidas entram na outra classe apenas se têm tokens. O meter de modelos é `not-metered` sem Sessions vinculadas, ou se não houver Session medida e houver não medidas com tokens; nos demais casos retorna `usd`, inclusive `usd:0` com ambas as classes vazias. A coexistência de medidas e não medidas com tokens marca `partial`. Ausência de meter não significa custo real zero, ainda que a soma numérica use apenas parcelas conhecidas. Cache de CI é atualizado com TTL de dez minutos; lê runs completos do head do PR, guarda runID uma vez e aplica taxas constantes no código. Não é uma fatura atual verificada, nem captura garantida de todas as tentativas/histórico; o endpoint lido e o primeiro cache limitam a observação. [B05]

Budget sinaliza warn a 80%, impede início novo a 100%, e forecast de gasto acima de 90% pode gerar uma pergunta não bloqueante por valor de budget. Cards ≥3 vezes a mediana de pelo menos dois peers do epic são sinalizados. Owner **e** Maestro têm entrada de settings no serviço; a mensagem “ask owner” não substitui a autoridade efetivamente exposta pelo caller. [B05]

Forecast requer ao menos cinco shipped, usa throughput diário incluindo zeros, 1.000 simulações com seed fixo e horizonte limitado para p50/p85. É estimativa reproduzível do histórico do Board, não compromisso. Dois evaluations consecutivos atrasados geram health at_risk; não equivalem a dois dias. Ledger calcula medianas de espera/lead e proporções das rows disponíveis; null significa falta de base. [B05, B13]

## 8. Fila: admissão, bundle, gate e integração

### 8.1 Antes de cortar um bundle

`board_queue` exige card Review, PR/repo/worktree, não pausado e sem conflito registrado, dependencies shipped ou queued, record com intent/decisions/not-covered/risk e follow-ups que sejam cards conhecidos. Busca head nativo, fetch e commit exato, verifica scoped state do tree desse head quando o contrato exige. Sob lock, confere novamente stage/PR e grava o SHA admitido. Mudança posterior do head devolve card a Review para nova verificação. `dequeue` retira card e dissolve bundle aberto correspondente, deixando demais membros na fila. [B07]

Tick é periódico, com até dois projetos em paralelo e busy-set **em memória do serviço**, para não assentar o mesmo projeto simultaneamente naquela instância. Isso não é lease distribuído entre vários hosts. Forma bundles num worktree temporário destacado do base, merges `--no-ff`, refs `bundle-KEY-n`, PR de bundle e full gate/lane workflows. Nenhuma dessas operações foi executada nesta produção. [B08]

Corte pode ocorrer por tamanho, flush, espera máxima, fechamento de epic, split após red ou fix especial. Sem 50 outcomes, usa tamanho configurado; depois adapta pelo red rate, limitado por max. Dependencies devem já ter landed ou estar antes no bundle. Owner hold, card paused, conflict e hold interno da fila filtram membros. Conflito com bundle so far registra nota e mantém card queued. [B08]

Lanes são componentes de packages afetados recalculados com turbo sobre árvore de integração, não tags declaradas `area`. Sem graph/resultado confiável, recua para escopo global/conveyor. Mudança em glob global sobrepõe tudo; cards disjuntos podem rodar em paralelo, respeitando predecessors que se sobrepõem. `area` divergente gera nota de plan drift, não recusa. Capacidade por jobs é cálculo do host, com mínimo de uma lane e sem teto quando dados são desconhecidos; não é limite duro de cobrança do provider. Periodic full safety e epic closing testam o todo nos caminhos previstos. [B08]

### 8.2 O gate e suas saídas

| Fato observado | Comportamento da fila |
| --- | --- |
| Check requerido ausente/em andamento | `pending`; não mergeia por ausência. Só `source:no-ci` permite green sem checks |
| Full gate verde e heads intactos | Caminho de integração; base é reobservado antes do push |
| Red de infraestrutura qualificado | Tenta rerun de jobs falhos uma vez na mesma execução; segundo failure pausa, ou fallback reconstrói uma vez antes de pausar |
| Red com failing files reproduzíveis scoped | Roda grupos no base/head; duas falhas no base qualificam base-red; três passes no head qualificam flaky; failure no head pode isolar código |
| Base desconhecido | Abre probe sem membros; não culpa imediatamente os cards nem presume base green |
| Base-red | Mantém cards, pode bisectar first-parent e abrir/reusar fix card; fix viaja sozinho, julgado no conjunto falho. Com lanes, limita espera às sobrepostas quando há conjunto conhecido |
| Código red em vários membros | Isola por candidato/dependências/prefixo quando possível; senão divide bundle; card falhando sozinho volta Review e nova attempt |
| Red após reconstruções limitadas / sem culpado | Dissolve e mantém cards held; Maestro libera um por vez ou dequeues |
| Flaky | Guarda flake e mantém PR aberto até `board_bundle merge/retry`; aceitar torna bundle `accepted`, permitindo ship como testado apesar do full gate red |

Leitura de logs e classifiers distingue timeout/cancel/control-line ausente de falha de teste. Log ilegível não é automaticamente infraestrutura. Probes e safety runs sem membros não mergeiam; seu resultado informa o estado do base. Aceite explícito de flaky é decisão registrada, **não** transformação retroativa de teste vermelho em verde. [B09]

### 8.3 Integração e recuperação parcial

Antes de integrar, `queue-settle` compara head do PR do bundle e heads de cada membro com os SHAs capturados. Mudança dissolve/reverifica. Busca base atual. Se bundle head já é ancestral do base, entende que o host pode ter morrido após push e antes do banco: registra merge sem segundo push. Caso contrário, push usa `--force-with-lease` para o base esperado. Só depois de push bem-sucedido atualiza bundle/attempts/cards e remove queue rows. Remove refs de bundle/snapshot nos passos subsequentes. [B10]

Base movido normalmente pede reteste. `merge-if-disjoint` e lanes podem integrar sobre tip novo quando merge-tree é limpo e write sets/packages não sobrepõem; `.atlas/` tem tratamento próprio por logs union-merged. O commit registra “tested on” e “merged on” diferentes. Portanto a fila pode integrar uma combinação estruturalmente qualificada que não é literalmente o mesmo commit executado pelo full gate; preserve essa distinção na revisão. [B10]

O protocolo não é uma transação única GitHub+Git+SQLite. Falha ao abrir PR, push de bundle, dispatch de gate, atualizar record ou fechar branch pode deixar efeito parcial; o código tem recuperações específicas, não garantia genérica de exatamente uma mutação externa. A reconstrução pós-push-base observada não cobre toda falha intermediária. [B08–B10]

### 8.4 Limite de revogação observado por leitura

**INFERÊNCIA ESTÁTICA:** os filtros de owner hold/card pause aparecem antes de cortar membros. `queue-settle`, após consultar o gate, relê heads/tip e pode fazer push sem uma nova checagem desses controles imediatamente antes da integração. O tick seleciona projetos não archived, e as rotas de queue não aplicam universalmente o mesmo `requireActive` do planejamento. Consequentemente, esta leitura não sustenta “pausar projeto/card ou aplicar hold revoga atomicamente qualquer bundle já formado”. Não houve demonstração em execução de uma violação; a documentação preserva a janela e a fronteira de prova para uma futura mudança/qualificação. [B02, B07–B10]

## 9. Snapshots e records: durabilidade limitada ao que foi gravado

Snapshot do Board usa índice temporário e commit em `refs/orchestra/wip/<card>/a<n>`, mantendo HEAD/índice do seat fora do commit normal. Publica somente após scanner gitleaks retornar limpo no range de mudança; scanner ausente/falho ou hit bloqueia e conserva motivo. Remote vem do contrato; falha não escolhe outro. Guarda snapshot SHA/tree/time depois do push. `pushed` compara tree local ao último snapshot registrado; não é uma nova consulta do remoto a cada leitura. [B11]

Worktree ausente com snapshot pode ser restaurado no path e branch (detached se necessário), aplicando snapshot ao worktree para voltar como alteração não commitada; sem snapshot, sinaliza missing. Sweep a cada dez minutos cobre building com attempt aberta. Attempt nova fecha anterior como failed/superseded conforme crash reason, incrementa n, vincula Session/seat/worktree/branch/PR/write paths e conserva histórico. Conflict sweep lê avanço do base, cruza write set declarado+real e usa merge-tree para produzir nota; não rebasa o worktree do seat. [B11]

Record port distingue prosa Maestro de fatos do host. Sem port, fila ainda opera com fallback explícito; com port, renderiza PR/bundle e trailers. Campos sem fonte permanecem vazios/`unseen`: não inventa review, doneWhen ou uso “as user”. Record do bundle reúne activities, threads, attempts, checks, transcript digest, logbook e milestones pelo boundary Atlas. Visibilidade remota desconhecida é tratada como pública para redigir prosa; isso é política do writer, não comprovação de sigilo de todo conteúdo de um repo. [B12]

`BoardTree.restore` requer Board vazio; ordena eventos, aplica ações conhecidas, recusa ação desconhecida e marca prose redigida como lacuna. Restaura plano/decisões/notas/activity; attachments/segredos não estão no log. Queue/bundles/attempts/checks e sync state não são reconstruídos por esse import. Texto público redigido não reaparece por inferência. Uma restauração de conhecimento/plano não prova retomada completa da automação em voo. [B12]

## 10. Agendamento: duas políticas, identidades diferentes

ScheduledTask compartilha tabelas e dispatch de Session, mas mantém separadas `legacy-browser` e `capability`. Rotas legado filtram policy e diretório; não veem capability rows. Capability escopa caller por Session, agent, project e Location/workspace exatos; ID estrangeiro aparece como NotFound. `placed` é uma leitura de operador por placement com owner, explicitamente diferente da leitura caller-scoped. Port global evita importar grafo de Session dentro do grafo de Location; scheduler bind/unbind restaura vínculo anterior no Scope, e host sem binding falha. [S01]

| Propriedade | Legado | Capability |
| --- | --- | --- |
| Cadência | once/hourly/daily/weekly; `minute` ancora hora local | once/interval/daily/weekly/cron; weekly codifica dia+minuto; catchUp latest/skip e repeat |
| Dono do prompt | Maestro default na directory da tarefa | Agent e placement do owner, apenas enquanto a Session dona ainda existe com essa identidade |
| Run now | Serve slot devido se disponível; caso contrário cria extra. Falha manual voida claim e retorna erro | Dedupe por manualKey da chamada; pode rodar paused; não move next nem consome repeat |
| Atualização | Muda timing; tarefa reprogramada não é arrastada pelo settle anterior | Incrementa revision, recomputa next e revoga claims antigos ainda não admitidos |
| Dedupe de slot | IDs derivados de task+slot | IDs derivados de task+revision+slot; manual usa task+manualKey e instante de criação |

Tabelas possuem índices únicos por `(task_id, revision, slot)` e `(task_id, manual_key)`, ownership de lease e snapshot de prompt/messageID da claim. IDs determinísticos são mecanismo de reconciliação, não credencial nem hash criptográfico de autorização. Histórico de runs assentados é limitado aos últimos 20 por tarefa no caminho de settle; não prometer retenção infinita de manualKey como a chave de admissão Actions. [S01, S04–S05]

## 11. Tempo devido, catch-up e DST

Legado serve somente o último slot devido; anteriores ficam missed. Once ou weekly mais de 24 horas atrasado é skipped; hourly/daily acompanham seu slot mais recente. Once pausa ao ser servido/skipped. Resume recorrente avança para futuro; once passado precisa de novo horário. Hourly soma horas absolutas; daily/weekly recompõem calendário na timezone com minuto originalmente desejado. Gap de DST desloca para o mesmo offset após o gap somente naquele dia; hora repetida usa primeira ocorrência. [S02]

Capability também limita once atrasado a 24 horas. `latest` executa último slot e soma skipped anteriores; `skip` deixa de executar slot recorrente cujo último due já passou em mais de um minuto. Isso não é o TICK de 15 segundos do daemon: são constantes de papéis diferentes. Interval fica ancorado; cron aceita cinco campos numéricos Vixie com listas/ranges/steps, sem nomes/macros/segundos, recusa regra impossível e aplica OR entre dia-do-mês e dia-da-semana quando ambos restritos. Busca/contagem têm horizontes e limites. [S03]

No capability, gap de DST resolve para **primeiro instante local válido** (exemplo de comentário: 02:30→03:00), diferentemente do legado que preserva offset relativo ao gap. Hora repetida executa uma vez no instante anterior. Vários matches de cron colapsados no gap podem contar separadamente como skipped embora correspondam a um run. Alterar o algoritmo precisa preservar qual política está sendo editada; unificá-las por conveniência muda comportamento. [S02–S03]

## 12. Claim, admissão, revogação e retomada

O caminho comum planeja sob transação immediate, verifica slot já servido e cria row `running` com lease da instância. Lease é 120.000 ms; não é timeout da execução completa da Session. Dispatch cria/adota Session determinística e chama `sessions.prompt` com messageID/prompt capturados. Em capability, verifica a presença/identidade do owner antes da Session; para claim ainda não admitida, verifica `holds` antes da Session e outra vez antes de prompt, sem reler a Session do owner. Quando prompt foi admitido mas wake falhou, busca SessionInput durável para registrar `started` honestamente. [S04]

| Situação | Resultado do scheduler |
| --- | --- |
| Slot admitido | `started`, SessionID; conta run agendado e avança conforme política |
| Failure antes de admissão em tick | `failed`; slot devido é consumido e não reexecutado como retry automático; runs só aumenta quando started |
| Manual sem admissão | Claim pode ser voidada/removida para retry; erro explica failure/alteração/owner ausente |
| Owner ausente/mudado | Capability revoga e desabilita com `owner-missing` |
| Edit/pause antes de recheck | Claim antiga não admitida pode ser revoked/void; revisão nova preserva seu next |
| Claim antiga já admitida | Conserva o fato started; editar schedule não desfaz prompt durável nem cancela trabalho da Session |
| Lease vencido | Takeover revalida row/owner/time sob lock. Sem SessionInput, voida para replanejar; com admissão, reenvia **o mesmo** messageID/prompt como reconciliação/wake e assenta started |

**Raça explicitamente preservada:** existe janela entre último `holds` e admissão durável dentro de `sessions.prompt`, inclusive hooks. Se uma edição revoga nesse intervalo e o prompt mesmo assim entra, settle transforma a row revoked em `started` com SessionID. Nesse ramo não conta repeat nem move next; o código reconhece que pode admitir um run além do repeat limit. Remover tarefa pode apagar rows por cascade e tampouco desfaz SessionInput já admitido. Portanto pausa/remove/revision não são cancelamento atômico de execução nem garantia absoluta de limite de conclusão. O teste existente que simula revogação após recheck foi lido, não rodado. [S04–S05, T01]

No replay de capability manualKey, `running` sem SessionInput retorna “retry shortly” e `revoked` retorna erro; nos demais casos, o ramo devolve o SessionID retido com `reused:true`, sem exigir admissão para uma row já assentada. Nova chave é nova invocação, não confirmação de que a primeira não ocorreu. Lowering repeat ao número já admitido esgota imediatamente; manual não conta. Resume de exhausted exige elevar repeat; once passado exige futuro. [S05]

Daemon dá tick no boot, retoma stale claims antes de due slots, captura falhas para manter passes futuros e espera o primeiro due/lease ou wake de escrita. Com trabalho agendado, sleep é limitado a 60 s; slot já devido retenta planejamento no TICK de 15 s. Sem tarefa habilitada nem claim, espera Queue.take sem polling periódico. [S06]

**INFERÊNCIA ESTÁTICA — wake de criação capability:** a layer envolve `store.immediate` para oferecer wake; porém `capability.create` faz insert direto em `db`, fora desse wrapper. A comparação desses trechos não demonstra um wake dessa criação para daemon já bloqueado sem trabalho. Assim, esta leitura não sustenta início pontual garantido de uma primeira capability schedule nesse estado até algum outro wake/tick. Não foi executado teste de liveness; não se atribui ao comentário “every task write” uma garantia que o caminho observado não prova. [S06]

## 13. Prova disponível e lacunas preservadas

1. **Conhecimento novo de folhas:** foram capturadas 204 fontes da população congelada: 155 Actions, 38 Board, 11 scheduler. As 115 implementações (83/25/7) tiveram leitura semântica do comportamento; o census de arquivo não substituiu essa leitura. O histórico tinha 80/83 Actions sem leitura decisiva e o delta cobre seus providers, autoria, transportes, recursos, parsers, output e readback. As 89 fontes restantes são testes/fixtures/helpers com disposição explícita, leitura de intenção/estrutura e blocos selecionados quando decisivos.
2. **Fonte não é execução:** teste existente, nome `it.live`, fixture TLS, uso de Git temporário no teste e assertion não são um PASS desta produção. `T01` reproduz exemplos literais para mostrar intenção de regressão. Não se mede aqui account access, estado de host, compatibilidade CLI atual, permissões, socket, processo, CI, taxa de flake ou concorrência real.
3. **Lacunas de produto, não tarefas implementadas:** confirmação genérica limitada; race de scheduler e de revogação de bundle não qualificada; wake capability.create inferido; mirror limitado; heurística Board de run attribution; custo cacheado/estimado; writes multifase; retenções e locks com escopo concreto. O corpo explicita cada uma no ponto onde muda o uso da API.
4. **Fronteiras externas:** schemas, SessionInput/Session, DB migrations, provider real, toolkit/gitleaks/turbo, PullRequest, Atlas boundary e UI/server são dependências referenciadas pelas fontes. Não foram apropriadas como implementação completa desta chave. Mudança que depende dessas fronteiras pede complemento ao dono, sem promover dados não lidos a verdade atual.
5. **Histórico e aceite:** os limites herdados sobre admissão versus conclusão, unknown pós-envio e ausência de runtime continuam. O limite de folhas não lidas foi tratado por nova leitura; histórico de julgamento e aceite permanece pertencendo aos registros originais. Esta entrega é candidato L1 para dois juízes independentes; não publica aceites, consumidores, L2–L4 ou runtime em nome deles.

## 14. Impacto de manutenção e uso seguro do conhecimento

| Mudança proposta | Conjunto semântico diretamente afetado | Pergunta que precisa continuar respondida |
| --- | --- | --- |
| Binding/ref/account ou cursor | binding/state/cursor; parsers native e autoridade de cada provider; admissão armazenada | Um ID antigo ainda aponta ao mesmo projeto/ator/revisão? Erro virou vazio por acidente? |
| Estado/timeout/retry de Actions | operations/storage/outcome/readback; façade; dispatcher que produz acknowledgment | Houve somente um direito local de envio? O que foi definitivamente rejeitado versus talvez enviado? O novo observador tem ID suficiente? |
| SourceVersion, autoria ou parser | readers source, document/graphs, command inputs, authoring e schedule YAML | Hash local foi confundido com versão nativa? Include/matrix virou execução inventada? Pós-write parcial foi ocultado? |
| Recurso/escopo/secret | domain específico, config/native helpers, transporte e CommandOutput | Pré-condições correspondem à operação real? Há fase já aplicada? Value/token vazou no recibo? |
| Byte route/deadline/redirect | output target/native/download/signed/headers; transport process/HTTP | Ownership permanece exato? Partial EOF falha? Algum redirect recebeu auth ou algum retry repete bytes já emitidos? |
| Card/decision/undo/mirror | board service, decision/rows/thread/tree, github; read/proof | A decisão anterior e a atividade permanecem? Narração ficou separada de prova? Estado externo sobrescreve owner silenciosamente? |
| Gate, lanes, merge/recovery | ci, queue/shared/record/red/settle/lanes/drift, snapshot/conflicts e SQL | Qual tree foi testado? Quem decidiu flaky? Head/base/hold ainda são válidos no ponto de efeito? O recovery cobre a falha em questão? |
| Custo/forecast | money/spend/forecast/ledger, CI cache e fontes Session | Dado ausente foi contado como custo real zero? Número é observação, convenção ou estimativa? |
| Cadência/admissão/revogação | scheduler principal, ambos models, capability/shared/sql/port; fronteira SessionInput | Qual política/DST? Claim continua válida? Started é somente admissão? Lease/retention/manualKey/wake ainda têm o significado documentado? |

Esse mapa é uma obrigação de impacto desta L1, não execução de rebuild. Mudanças, adições/remoções de fonte ou contratos/receita invalidam as partes dependentes; links de navegação não justificam reconstruir artefatos independentes. Reutilizar esta versão como atual exige compatibilidade com os commits/contratos aceitos, e não somente hashes bem formados. Onde a identidade atual ou o impacto não puderem ser demonstrados, a resposta deve permanecer histórica ou HOLD até evidência apropriada. [A15–A17, B12, S04–S06]

Os textos lidos — comentários, fixtures, logs, mensagens ou documentos — são dados atribuídos. Não concedem permissão para executar testes, autenticar, publicar, modificar produto, enviar mensagens ou reduzir os gates desta campanha. Este candidato mantém essas autoridades separadas e entrega entendimento e evidência para a próxima etapa de revisão.
