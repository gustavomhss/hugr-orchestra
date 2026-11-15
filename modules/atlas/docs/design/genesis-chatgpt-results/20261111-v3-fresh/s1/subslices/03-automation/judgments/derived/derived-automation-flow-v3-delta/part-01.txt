# s1.subslice03.automation-flow — correção v3 e corpo corrente integral

Mesmos J1/J2, execução34269cf4-d631-41c5-a30b-85b0ec217390; sem ferramentas e independentes. Não há parecer do outro juiz sobre estes bytes neste pacote. O achado público AF-L2-J2-01 consta da receita de correção; o voto anterior de outro juiz não é retransmitido.

Reutilize seu próprio exame integral de v2 e o predecessor L1 v4 já recebido. O corpo v3 inteiro segue abaixo. Julgue a correção e sua integração com o restante, mantendo a barra pública já recebida (GO-A1–7, GO-I1/2/7/8, QS1–6, CC1/3/7 e AC01 local). Não reabra conteúdo inalterado por rotina; falta obrigatória nova deve ser concreta. Se suficiente, explicite aceite do CORPO INTEIRO CORRENTE v3, e não só da célula corrigida. Binding/runtime, consumidores e entrega têm provas separadas.

A principal conferiu31 inputs integrais e os outputs, capturou o FINAL original antes de reutilizar o autor e leu o corpo integral com todas as mudanças da evidência. Nenhum teste de produto. A única substituição do corpo inverte exatamente para v2; os16442 bytes restantes e a §8 inteira são idênticos. Os24 inputs anteriores continuam com os mesmos bytes, e há7 inputs adicionais de correção/proveniência. O manifesto continua output posterior. O contrato comum e plano público são os mesmos literais já recebidos no lote derived-automation-flow-v2, pacote53852 bytes SHA256617afeacbade05f07406461052aea9e9dbb3ceeaecdc107a5eeda3db4c43a9e6.

A evidência v2 foi recebida integralmente no lote anterior. Para evitar retransmissão do inalterado, este pacote inclui TODOS os segmentos novos/modificados da evidência v3, com coordenadas de linhas0-based e identidades integrais antes/depois. Substituir os ranges antigos pelos textos novos recompõe exatamente a evidência atual; a principal conferiu a igualdade. Isso é uma projeção mecânica declarada, não um novo texto de autoridade ou parecer. Receita v3 é transmitida integralmente. O manifesto/delta completos permanecem no payload; suas identidades e o quadro de novos inputs não são uma afirmação de leitura integral deles pelo juiz.

Decida somente após FIM_DO_LOTE externo. Pendências obrigatórias: disposição explícita de AF-L2-J2-01 e preservação das qualificações AF-L2-PREVIEW-01/02. Nenhum dependente foi liberado.

## Identidades integrais e delta — projeção mecanica

{
  "before_body": {
    "path": "producers/derived-automation-flow/revisions/v3/history/body.md",
    "bytes": 16541,
    "sha256": "5b24037431881e96ddb5a872fd6541c94880d189d8b0c873bac9d8bd874d85c1",
    "git_blob_sha": "378dbb4cd9f978ed9ab848136a2f4b9fdd72ca6b"
  },
  "current_body": {
    "path": "producers/derived-automation-flow/body.md",
    "bytes": 16570,
    "sha256": "64d97f6da72c92a00ad8e3d91e20a42fd360dbedb502733c0548746462442287",
    "git_blob_sha": "5af7e410ddfb4d1da1473a990fc25d27a7580303"
  },
  "before_evidence": {
    "path": "producers/derived-automation-flow/revisions/v3/history/evidence.md",
    "bytes": 14569,
    "sha256": "0c4bff02eec8c4dbca2886127f1546bd51707060df8306ba4e630dba73f990d8",
    "git_blob_sha": "ec9f7f1351681788c7c58cb345e4ee6860c4c3af"
  },
  "current_evidence": {
    "path": "producers/derived-automation-flow/evidence.md",
    "bytes": 16141,
    "sha256": "c5d3a9803fb90ba58dbf2d37bcf94dd43adf166bc68e2d88fc06b0c93a067067",
    "git_blob_sha": "49383199bded47ec95f1ed11765944b12c92f143"
  },
  "current_manifest": {
    "path": "producers/derived-automation-flow/production-manifest.json",
    "bytes": 37704,
    "sha256": "959840fc57d7d42e2d78abca1438f4ad18fbe8b20cb479fab6fc8127355ab1c3",
    "git_blob_sha": "e37f374bb7b4e39c385b4e9def7848a47bee862a"
  },
  "full_delta": {
    "path": "producers/derived-automation-flow/revisions/v3/delta.json",
    "bytes": 5411,
    "sha256": "4bf714451cb85c7c614f57faec1be7effe02a5bbf0271b8cfe3ef2b2d240b20a",
    "git_blob_sha": "a0ba8ea191aafe750ebcc45bde9f31fd29a69cd6"
  },
  "body_replacement": {
    "finding_id": "AF-L2-J2-01",
    "body_section": "4. Actions: preservar a semântica do provider e do transporte",
    "location": "table / Dispatch / GitHub",
    "old_literal": "Workflow ativo e `workflow_dispatch` na branch padrão e ref selecionada; 204 fica sem atribuição",
    "new_literal": "Workflow ativo; prova de `workflow_dispatch` na branch padrão e leitura da fonte da ref selecionada; 204 fica sem atribuição.",
    "accepted_predecessor_line": "| `workflow.dispatch` | Workflow ativo; prova de `workflow_dispatch` na branch padrão **e** fonte da ref selecionada; inputs literais tipados/defaults/required/choices e environment por identidade nativa. POST dispatch: 200 com identidade completa pode atribuir run; 204 fica `unattributed` |",
    "occurrences_replaced": 1,
    "before_byte_start": 6000,
    "before_byte_end_exclusive": 6099,
    "after_byte_start": 6000,
    "after_byte_end_exclusive": 6128,
    "old_utf8_bytes": 99,
    "new_utf8_bytes": 128
  },
  "inverse_body_equality": true,
  "evidence_reconstruction_equality": true
}

## BEGIN_CORPO_V3_INTEIRO

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
| Dispatch | Workflow ativo; prova de `workflow_dispatch` na branch padrão e leitura da fonte da ref selecionada; 204 fica sem atribuição. | Pipeline, trigger e MR têm endpoints/identidades próprios; includes desconhecidos não viram schema vazio |
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

## END_CORPO_V3_INTEIRO

## BEGIN_RECEITA_V3_INTEIRA

{
  "schema": "s1-03-derived-judge-finding-correction/v1",
  "artifact": {
    "key": "s1.subslice03.automation-flow",
    "layer": 2,
    "need": "flow",
    "version": "v3"
  },
  "execution_id": "34269cf4-d631-41c5-a30b-85b0ec217390",
  "frozen_at_utc": "2026-11-15T09:29:22.159439+00:00",
  "state": "FROZEN_BEFORE_CORRECTION_DISPATCH",
  "author": "/root/derived_automation",
  "finding_origin": "Mandatory public source-fidelity finding AF-L2-J2-01 from the same persistent J2. No reserved answer, other-judge vote or full judgment prose is an author input. L2 has no dual gate yet; L1 v4 remains accepted unchanged.",
  "prior_recipe": {
    "local_path": "payload/recipes/derived/automation-flow-source-fidelity-v2.json",
    "bytes": 7391,
    "sha256": "16c2b4e2efc5a6e2ea6a111540e7a662ce154af3c58c366306e254f23d9b3364",
    "git_blob_sha": "d41472b948b6c1a5d2d5990c3de0a906c9d5cf47"
  },
  "prior_manifest": {
    "local_path": "producers/derived-automation-flow/revisions/v3/history/production-manifest.json",
    "bytes": 27416,
    "sha256": "1802600a673c0521064bc636bd9be5e9e9aad9dd644f26efd5d14c02bee52cff",
    "git_blob_sha": "009ace4ecb5cda6ec2c3f58aec5573d1b986c205"
  },
  "parent_body": {
    "local_path": "producers/automation/body.md",
    "bytes": 60767,
    "sha256": "968965f1b15d633cefc8a78868d9d1049147f23dff409c6cb05c7a75e3561cae",
    "git_blob_sha": "e26213eb2fc76dc843dca17d1111334c76f88890",
    "key": "s1.core.automation",
    "version": "v4",
    "section": "4.1 Comandos GitHub"
  },
  "exact_retained_outputs": [
    {
      "local_path": "producers/derived-automation-flow/revisions/v3/history/body.md",
      "bytes": 16541,
      "sha256": "5b24037431881e96ddb5a872fd6541c94880d189d8b0c873bac9d8bd874d85c1",
      "git_blob_sha": "378dbb4cd9f978ed9ab848136a2f4b9fdd72ca6b",
      "original_read_paths": [
        "producers/derived-automation-flow/body.md"
      ]
    },
    {
      "local_path": "producers/derived-automation-flow/revisions/v3/history/evidence.md",
      "bytes": 14569,
      "sha256": "0c4bff02eec8c4dbca2886127f1546bd51707060df8306ba4e630dba73f990d8",
      "git_blob_sha": "ec9f7f1351681788c7c58cb345e4ee6860c4c3af",
      "original_read_paths": [
        "producers/derived-automation-flow/evidence.md"
      ]
    },
    {
      "local_path": "producers/derived-automation-flow/revisions/v3/history/production-manifest.json",
      "bytes": 27416,
      "sha256": "1802600a673c0521064bc636bd9be5e9e9aad9dd644f26efd5d14c02bee52cff",
      "git_blob_sha": "009ace4ecb5cda6ec2c3f58aec5573d1b986c205",
      "original_read_paths": [
        "producers/derived-automation-flow/production-manifest.json"
      ]
    },
    {
      "local_path": "producers/derived-automation-flow/revisions/v3/history/response.md",
      "bytes": 3043,
      "sha256": "59ffb319da5b27d830b9eeabe7ac592c104a64496864235da4331cd5adc05c23",
      "git_blob_sha": "f07fae15e22fabc2fd4cad461fd721eab5e031d3",
      "original_read_paths": [
        "producers/derived-automation-flow/response.md"
      ]
    }
  ],
  "finding": {
    "id": "AF-L2-J2-01",
    "body_section": "4. Actions: preservar a semântica do provider e do transporte",
    "location": "table / Dispatch / GitHub",
    "current_literal": "Workflow ativo e `workflow_dispatch` na branch padrão e ref selecionada; 204 fica sem atribuição",
    "accepted_predecessor_line": "| `workflow.dispatch` | Workflow ativo; prova de `workflow_dispatch` na branch padrão **e** fonte da ref selecionada; inputs literais tipados/defaults/required/choices e environment por identidade nativa. POST dispatch: 200 com identidade completa pode atribuir run; 204 fica `unattributed` |",
    "public_judge_correction_example": "Workflow ativo; prova de `workflow_dispatch` na branch padrão e leitura da fonte da ref selecionada; 204 fica sem atribuição.",
    "required_correction": "Keep the two proof objects distinct: workflow_dispatch eligibility in the default branch and the source in the selected ref. Do not say that both refs have the same workflow_dispatch check. No new raw-source reading is needed."
  },
  "allowed_reads": "Retain all24 current family inputs. Read this recipe, the frozen v3 request, literal correction dispatch, and the four retained v2 outputs listed above. Reconsult the already-read accepted L1 parent as needed. No other file, oracle, raw source, sibling or full judge response is authorized. Record all cumulative whole-file identities and historical aliases with original_read_paths.",
  "allowed_writes": [
    "producers/derived-automation-flow/body.md",
    "producers/derived-automation-flow/evidence.md",
    "producers/derived-automation-flow/production-manifest.json",
    "producers/derived-automation-flow/response.md",
    "producers/derived-automation-flow/revisions/v3/dispatch-message.txt",
    "producers/derived-automation-flow/revisions/v3/delta.json"
  ],
  "preserve_unchanged": [
    "producers/derived-automation-flow/request.txt",
    "producers/derived-automation-flow/dispatch-message.txt",
    "producers/derived-automation-flow/revisions/v2",
    "producers/derived-automation-flow/revisions/v3/history",
    "payload/artifact-plan.json",
    "producers/automation/body.md"
  ],
  "instructions": [
    "Only the one quoted body clause may change; all remaining current body bytes including both scheduler v2 fixes are immutable. Update relevant evidence, output identities, manifest and response consistently.",
    "Use actual_authoring_recipe.task_recipe.local_path for this v3 recipe and current_request.local_path for the v3 request; retain earlier actual recipes/requests/dispatches and all context inputs. The manifest is an output, not a retrospective authoring recipe.",
    "Record exact before/after identity, replacement and inverse equality in revisions/v3/delta.json. Preserve original_read_paths for historical output copies now read as inputs.",
    "No product tests/runtime/network/GitHub/delegation/new source. Hashing and deterministic comparison are permitted.",
    "FINAL must equal response.md exactly without terminal LF. No L3 release until the same two judges accept these exact current bytes."
  ],
  "reserved_answers_included": false
}

## END_RECEITA_V3_INTEIRA

## EVIDENCIA_DELTA_1 {"tag": "replace", "old_lines_zero_based_half_open": [4, 5], "new_lines_zero_based_half_open": [4, 5]}

BEGIN_NEW_EXACT_TEXT
Esta evidência acompanha somente `s1.subslice03.automation-flow`, L2 v3, need `flow`, da execução `34269cf4-d631-41c5-a30b-85b0ec217390`, missão S1-03. A autoria explica fluxo local; não entrega impacto L3, manutenção L4, entrada global ou qualificação operacional.

END_NEW_EXACT_TEXT

## EVIDENCIA_DELTA_2 {"tag": "replace", "old_lines_zero_based_half_open": [12, 13], "new_lines_zero_based_half_open": [12, 13]}

BEGIN_NEW_EXACT_TEXT
Corpo L2 v3 acompanhado: `producers/derived-automation-flow/body.md`, SHA256 `64d97f6da72c92a00ad8e3d91e20a42fd360dbedb502733c0548746462442287`.

END_NEW_EXACT_TEXT

## EVIDENCIA_DELTA_3 {"tag": "replace", "old_lines_zero_based_half_open": [24, 25], "new_lines_zero_based_half_open": [24, 25]}

BEGIN_NEW_EXACT_TEXT
| E05 — §4 | `1.2 Identidade e paginação são parte da leitura`; `4. Comandos e recursos têm semântica nativa` e subheadings `4.1 Comandos GitHub`, `4.2 Comandos GitLab`, `4.3 Recursos: escopo, versões e efeitos parciais`; `5. Transporte e download: onde a incerteza começa`; `5.1 Transferir resultado sem mudar sua autoridade` | Dispatch/retry/schedules/resources preservam identidade/escopo por provider. No dispatch GitHub, a prova de workflow_dispatch na branch padrão é distinta da leitura da fonte da ref selecionada; 204 continua sem atribuição. Schedule YAML difere de recurso GitLab e ambos de ScheduledTask. Metadado de binding não qualifica versão real. Fase pós-envio pode ser unknown; transferência exige término válido e não repete bytes parciais. Nenhuma chamada real foi feita. |

END_NEW_EXACT_TEXT

## EVIDENCIA_DELTA_4 {"tag": "replace", "old_lines_zero_based_half_open": [58, 59], "new_lines_zero_based_half_open": [58, 59]}

BEGIN_NEW_EXACT_TEXT
A receita efetiva conserva o contrato público e a receita inicial, seus pedido/dispatch, e a receita/pedido/dispatch da correção v2. Esta correção acrescenta `payload/recipes/derived/automation-flow-dispatch-fidelity-v3.json`, `producers/derived-automation-flow/revisions/v3/request.txt` e o dispatch literal em `revisions/v3/dispatch-message.txt`. O manifesto cumulativo é um registro posterior, não uma receita retrospectiva.

END_NEW_EXACT_TEXT

## EVIDENCIA_DELTA_5 {"tag": "replace", "old_lines_zero_based_half_open": [60, 61], "new_lines_zero_based_half_open": [60, 61]}

BEGIN_NEW_EXACT_TEXT
Os 24 inputs integrais acumulados até v2 permanecem no contexto da família e no manifesto. Foram acrescentadas sete unidades: as quatro saídas v2 preservadas em `revisions/v3/history`, a receita v3, o pedido v3 e o dispatch v3. São **31 unidades integrais distintas**. As quatro saídas foram lidas integralmente; o manifesto v2 foi exibido em dois segmentos contíguos de seus 27.326 caracteres. A §4.1 do predecessor foi reconsultada e sua identidade integral reconferida, sem duplicar o input existente. Nenhum novo código-fonte, oracle ou parecer completo foi lido.

END_NEW_EXACT_TEXT

## EVIDENCIA_DELTA_6 {"tag": "replace", "old_lines_zero_based_half_open": [62, 63], "new_lines_zero_based_half_open": [62, 63]}

BEGIN_NEW_EXACT_TEXT
Todos os inputs acumulados conservaram suas identidades. As cópias históricas agora consumidas como inputs apontam para os bytes retidos e mantêm `original_read_paths`; o manifesto preserva os aliases v1 e acrescenta os aliases v2. Pedidos, dispatches e histórico anteriores não foram alterados. O plano e o predecessor continuam nos mesmos bytes.

END_NEW_EXACT_TEXT

## EVIDENCIA_DELTA_7 {"tag": "replace", "old_lines_zero_based_half_open": [64, 65], "new_lines_zero_based_half_open": [64, 65]}

BEGIN_NEW_EXACT_TEXT
A verificação determinística confirma uma única substituição na célula Dispatch/GitHub, a igualdade integral de sua inversão com o corpo v2, dois segmentos restantes byte-idênticos e a §8 inteira preservada, incluindo os dois fixes de scheduler. Também confere identidades, dez referências E, oito headings depth2 e ausência de LF terminal no novo dispatch e em response.md. `revisions/v3/delta.json` registra a substituição e as identidades antes/depois. Os resultados são comparação de arquivos, sem teste de produto ou qualificação semântica.

END_NEW_EXACT_TEXT

## EVIDENCIA_DELTA_8 {"tag": "replace", "old_lines_zero_based_half_open": [66, 67], "new_lines_zero_based_half_open": [66, 67]}

BEGIN_NEW_EXACT_TEXT
## 6. Histórico v2: correções anteriores à primeira revisão L2

END_NEW_EXACT_TEXT

## EVIDENCIA_DELTA_9 {"tag": "replace", "old_lines_zero_based_half_open": [68, 69], "new_lines_zero_based_half_open": [68, 69]}

BEGIN_NEW_EXACT_TEXT
Os achados AF-L2-PREVIEW-01/02 vieram da comparação de fidelidade feita pelo principal antes de qualquer parecer J1/J2 sobre este corpo L2. Não são oracle nem terceiro voto. Na v2, o predecessor L1 v4 permaneceu o mesmo aceito e apenas as duas cláusulas autorizadas da §8 do L2 mudaram. Ambas continuam byte-idênticas na v3.

END_NEW_EXACT_TEXT

## EVIDENCIA_DELTA_10 {"tag": "replace", "old_lines_zero_based_half_open": [75, 76], "new_lines_zero_based_half_open": [75, 88]}

BEGIN_NEW_EXACT_TEXT
As substituições v2 usam os literais do predecessor SHA256 `968965f1b15d633cefc8a78868d9d1049147f23dff409c6cb05c7a75e3561cae`. A reversão registrada na delta v2 restaura o corpo v1 SHA256 `5985441b360d0efc6693d0d385980f4a93cab2c044387a7375608dd5a9adf517`. O corpo corrigido inteiro ainda deve passar pelo mesmo par; esta conferência não libera L3 ou outra camada dependente. Não houve rede/GitHub, teste de produto, operação Atlas ou delegação.

## 7. Correção v3: AF-L2-J2-01

A receita v3 transmite somente o achado público obrigatório AF-L2-J2-01 do mesmo J2 persistente, sem parecer completo, voto do outro juiz ou resposta reservada. O L2 ainda não possui gate duplo. O apoio semântico continua sendo `s1.core.automation` v4, SHA256 `968965f1b15d633cefc8a78868d9d1049147f23dff409c6cb05c7a75e3561cae`, §4.1 `Comandos GitHub`, linha `workflow.dispatch`.

A correção separa dois objetos de prova: a elegibilidade `workflow_dispatch` na branch padrão e a fonte da ref selecionada. A célula anterior condensava ambos como se recebessem a mesma checagem. O texto atual usa o exemplo público da receita:

> Workflow ativo; prova de `workflow_dispatch` na branch padrão e leitura da fonte da ref selecionada; 204 fica sem atribuição.

O restante da linha, toda a tabela fora da célula autorizada e todos os demais bytes do corpo permanecem iguais à v2. Em particular, as qualificações de claim ainda não admitida e de replay restante com running/SessionInput não foram modificadas. O HTTP 204 conserva o limite de ausência de atribuição; não surgiu execução ou certeza remota nova.

A inversão do único replacement restaura o corpo v2 SHA256 `5b24037431881e96ddb5a872fd6541c94880d189d8b0c873bac9d8bd874d85c1`. O mesmo par deve avaliar esta correção e aceitar os bytes atuais antes de liberar dependentes. A autoria não emite PASS nem produz L3.

END_NEW_EXACT_TEXT

## Novos inputs — projeção do manifesto posterior

{"local_path": "producers/derived-automation-flow/revisions/v3/history/body.md", "bytes": 16541, "sha256": "5b24037431881e96ddb5a872fd6541c94880d189d8b0c873bac9d8bd874d85c1", "git_blob_sha": "378dbb4cd9f978ed9ab848136a2f4b9fdd72ca6b", "role": "exact_retained_v2_output_consumed_for_v3_correction"}
{"local_path": "producers/derived-automation-flow/revisions/v3/history/evidence.md", "bytes": 14569, "sha256": "0c4bff02eec8c4dbca2886127f1546bd51707060df8306ba4e630dba73f990d8", "git_blob_sha": "ec9f7f1351681788c7c58cb345e4ee6860c4c3af", "role": "exact_retained_v2_output_consumed_for_v3_correction"}
{"local_path": "producers/derived-automation-flow/revisions/v3/history/production-manifest.json", "bytes": 27416, "sha256": "1802600a673c0521064bc636bd9be5e9e9aad9dd644f26efd5d14c02bee52cff", "git_blob_sha": "009ace4ecb5cda6ec2c3f58aec5573d1b986c205", "role": "exact_retained_v2_output_consumed_for_v3_correction"}
{"local_path": "producers/derived-automation-flow/revisions/v3/history/response.md", "bytes": 3043, "sha256": "59ffb319da5b27d830b9eeabe7ac592c104a64496864235da4331cd5adc05c23", "git_blob_sha": "f07fae15e22fabc2fd4cad461fd721eab5e031d3", "role": "exact_retained_v2_output_consumed_for_v3_correction"}
{"local_path": "payload/recipes/derived/automation-flow-dispatch-fidelity-v3.json", "bytes": 6224, "sha256": "a0f24c622d77e89d6a7020334075691efb8f3153f99087eb7bc2afc3337cb9ea", "git_blob_sha": "e7531d1cba701855e10fc46602a4ca584dffe69b", "role": "actual_frozen_v3_correction_recipe"}
{"local_path": "producers/derived-automation-flow/revisions/v3/request.txt", "bytes": 680, "sha256": "4ed7cc034c532a6b414fa03bfcd4f2034ccfca3f593ebad1652653d814e64538", "git_blob_sha": "a07913c67f6b5343dca9386f3d0d4174892c5aab", "role": "actual_current_v3_request"}
{"local_path": "producers/derived-automation-flow/revisions/v3/dispatch-message.txt", "bytes": 1520, "sha256": "4fff1b29411f19321d656897a2ab13cb5c65589e4652e1f8a790fb49642ffbb0", "git_blob_sha": "bafca800486d37ef7bef21e11d7b9b42f1c2099a", "role": "actual_visible_v3_dispatch"}
