from pathlib import Path
from collections import Counter
import hashlib,json,re

R=Path(__file__).resolve().parent
ROOT=R.parents[3]
B=ROOT/'producers/b'
PIN='1cde2ff7a71bcf7aecb5d030917b577165135d38'
PROTO='ee2521a5b966bd505cc95bd1c733e09e12f33531'
base=json.loads((ROOT/'revisions/b-l1-evidence-v1/coverage-projection.json').read_text())
g=next(g for g in base['groups'] if g['id']=='G30')
entries=[{**g['common'],**m} for m in g['members']]
manifest=json.loads((B/'source-manifest.json').read_text())
sources={s['path']:s for s in manifest['sources']}
sha=lambda x:hashlib.sha256(x).hexdigest()
def dump(name,value):(R/name).write_text(json.dumps(value,ensure_ascii=False,indent=2)+'\n')

# These records are semantic observations from the six complete, untruncated source-reading batches.
domains=[
('actions',['actions-common','actions-binding','actions-job','actions-operation','actions-pipeline','actions-resource','actions-run','actions-source','actions-workflow'],
 'API de bindings versionados, operações admitidas e comandos de CI/provedor.',
 'Distinguir o identificador/revisão do binding de uma autorização de execução; conhecer a forma de erro e separar preparação/readback dos comandos específicos de provedor.',
 'ActionsApiError expõe os campos de Actions.ErrorData com status 400. BindingQuery combina LocationQuery com revisão positiva decodificada de string. As respostas usam Location.response; preparação/leitura/reconcile têm Operation e comandos de jobs/runs/workflows/resources têm CommandExecution. Payloads distinguem GitHub, GitLab e comandos genéricos; presence de endpoint não comprova um efeito remoto.',
 'A validade operacional de um binding/revisão, credencial de provedor, execução/reconcile e resultado remoto pertence ao serviço Actions/Core e seus handlers; este contrato não prova esses efeitos.',
 ['s1.api.boundaries','s1.api.client-projection','s1.api.codegen']),
('agent-authoring',['agent','behavior','command','skill'],
 'Catálogos de agentes/comandos/skills e authoring de agentes, skills e comportamentos de projeto.',
 'Separar o catálogo anunciado ao modelo de execução e identificar quais arquivos/valores podem ser alterados por esta API.',
 'AgentDetail declara ferramentas, skills e engines com estado de instalação; agent.file.update aceita AgentFile.Input e declara conflito. Behavior.set substitui o conjunto de comportamentos, com anotação de aplicação no próximo provider turn. command.list só lê o catálogo. skill.save/remove aceitam inputs/path e anotam que globais, built-in e Atlas-governed são read-only.',
 'Revisão de arquivo, reload, contenção de paths e aplicação no provider turn são enforcement dos handlers/Core, não consequência da declaração Schema.String ou do OpenAPI.',
 ['s1.api.schema-contracts','s1.api.boundaries']),
('atlas',['atlas'],
 'Fachada HTTP da tela Atlas sobre o store da localização, incluindo leitura, draft/emit/review e setup legado.',
 'Reconhecer a autoridade da fachada existente sem confundir atlas.mine ou a descrição de portas governadas com o runtime Genesis aceito nesta campanha.',
 'O grupo usa LocationQuery, Location.response e ServiceUnavailableError; separa draft declarado sem escrita, emit na rev do draft, verificações, review, decisões humanas, install/index/mine. A própria fonte identifica formas legadas /atlas/* e ausência como null/estado empty. São contratos e descrições de intenção de portas, não recibos desta produção.',
 'Governança efetiva, CAS, reader, efeitos de index/mine e equivalência ao runtime comum dependem dos donos Atlas e implementação; nenhuma chamada desta API foi feita.',
 ['s1.api.boundaries','s1.api.surface-disposition']),
('board',['board'],
 'Leitura do board de projetos e comandos do owner para orientar Maestro.',
 'Identificar a fronteira entre planejamento por Maestro e operações do proprietário, com respostas/erros de conflito concretos.',
 'BoardGroup não usa LocationQuery nos endpoints: key e issue number positivo identificam o projeto/issue. Leituras retornam Snapshot/IssuePage/relatórios; mutations retornam OwnerResult e declaram BoardNotFoundError 404/BoardRefusedError 409. As anotações restringem edição de notas ao owner e descrevem pause/hold/accept/decline como orientação de Maestro.',
 'Identificação real de owner, recusa de escrita e efeitos GitHub/Maestro exigem o handler/serviço Board. A descrição de segredo nunca retornado não é uma prova de redaction executada.',
 ['s1.api.boundaries','s1.api.server-edge']),
('capability-management',['capability-connections','capability-operator','capability-schedules'],
 'Inspeção de autoridade, ciclo de connections/targets/bindings e gerenciamento de schedules criados por agentes.',
 'Não tratar IDs de cliente como grants; localizar middleware e idempotência na declaração pública.',
 'Connections limita páginas a 1..32 (anotação default 16), requer idempotency-key não vazio nas mutations e retorna Receipt/DTOs diretos. Operator.inspect retorna requestID/principal/origin/scopeHash. Os três factories aplicam location middleware e CapabilityAuthorization. Capability schedules não cria/edita: isso fica com schedule_manage do agente; run usa key idempotente e retorna Started.',
 'Validação mais estrita do header, autenticação e revogação, atomicidade de recibos e idempotência efetiva pertencem ao middleware/serviços Core; o corpo server-edge existente cobre parte da autenticação e a triagem Server deve cobrir as delegações.',
 ['s1.api.server-edge','s1.api.sdk-composition']),
('global-settings-trust',['config','trust'],
 'Configuração global, shells disponíveis e decisão global de trust de projetos.',
 'Evitar interpretar configurações globais como mutations de uma Location escolhida pelo cliente; separar string de diretório de validação de caminho.',
 'ConfigPatch substitui listas de disabledProviders/permissions e definições de providers por ID; update é NoContent e a descrição pede reload de localizações abertas. Trust é explicitamente global, sem LocationQuery; approve/revoke recebem directory:String. A anotação de approve exige pasta existente/absoluta/realpath e revoke preserva trust herdado de pai.',
 'Schema.String não verifica existência/realpath/trust: o enforcement e o start/stop de MCP são fatos a confirmar no Server/Core antes de alegá-los implementados.',
 ['s1.api.boundaries','s1.api.server-edge']),
('integration-credentials',['credential','integration'],
 'Descoberta de integrações e ciclo de credenciais/attempts de autenticação.',
 'Distinguir metadados de credencial e attempts OAuth de segredos e registrar a existência dos endpoints de compatibilidade.',
 'Credential só expõe update label e remoção por ID, com ConflictError. Integration list/get anunciam métodos; connect/key recebe key, connect/oauth recebe methodID/inputs e retorna Attempt. Há endpoints por integrationID+attemptID de compatibilidade e endpoints globais por attemptID para status/complete/cancel. A anotação de disconnect remove credenciais armazenadas, preservando env vars.',
 'Ownership de um attempt, armazenamento seguro, cancelamento de recursos e efeito OAuth não são provados pelas formas públicas; dependem dos handlers/serviços e não foram executados.',
 ['s1.api.server-edge','s1.api.client-projection']),
('host-health-installation',['health','installation'],
 'Prontidão declarada do servidor e solicitação de upgrade.',
 'Distinguir um DTO de health/upgrade de observação de disponibilidade ou instalação realmente realizada.',
 'health.get declara healthy literal true, pid opcional e version; installation.upgrade recebe target:String, retorna success literal true/version e declara InvalidRequestError/UnknownError. A descrição escolhe o package manager que instalou o servidor.',
 'Prontidão, pacote instalado, integridade e sucesso do upgrade precisam de implementação/execução pertinente; o L1 aqui só afirma o contrato solicitado.',
 ['s1.api.boundaries','s1.api.server-edge']),
('developer-services',['formatter','lsp','mcp'],
 'Status de formatters/LSP e administração de conexões, config, recursos e auth MCP.',
 'Identificar operações que apenas anunciam status versus as que escrevem config, conectam e iniciam OAuth.',
 'Formatter/LSP retornam listas Status em Location.response. MCP expõe server state, resource catalog, entries/config, tool names e mutations de conexão/config/OAuth, com InvalidRequestError e McpServerNotFoundError conforme rota. As descrições distinguem config resolvida sem secrets de entries com referências env não resolvidas; auth.start e callback têm respostas diretas, não todas envelopadas.',
 'Redaction, confiança de projeto, processo MCP e OAuth dependem de implementação; os comentários de debug/segredos não provam que uma chamada de rede ocorreu ou que toda resposta está saneada.',
 ['s1.api.server-edge','s1.api.client-projection']),
('locations-projects',['location','project','project-copy'],
 'Resolução de contexto de localização e catálogo/cópias de projeto.',
 'Separar query deepObject, catálogo global e operações de projeto com IDs de entradas cuja autoridade vem da Location.',
 'LocationQuery possui directory/workspace opcionais e transforma a representação OpenAPI para deepObject/explode; location.get retorna Info direto, paths retorna home. Project list/directories/update usam IDs e respostas diretas; initGit usa LocationQuery/envelope. ProjectCopy remove projectID/sourceDirectory de CreateInput em favor de params/contexto e declara ProjectCopyError 400 com forceRequired opcional.',
 'Resolução de path, isolamento, initGit e semântica destrutiva/force de cópias são responsabilidade Server/Core; não decorrem de branded strings ou do schema de erro.',
 ['s1.api.server-edge','s1.api.schema-contracts']),
('permission-question',['permission','question'],
 'Pendências de aprovação e perguntas, com recursos ligados à sessão e permissões salvas.',
 'Estabelecer placement de middleware e ownership de request/session declarado antes de usar essas APIs no fluxo de sessão.',
 'Os factories aplicam location middleware aos endpoints já adicionados e sessionLocationMiddleware a cada endpoint de sessão. Permission.create aceita action/resources/save/metadata/source, devolvendo ID/effect; get/reply combinam sessionID+requestID e erros 404 apropriados. Question reply usa Question.Reply e reject é NoContent. Saved permissions têm list por projectID opcional e remove por ID.',
 'O contrato descreve requests owned by session; lookup e autorização reais precisam da implementação de Permission/Question. Não inferir ownership somente do par de params nem confundir saved state com uma decisão executada.',
 ['s1.api.session-contract','s1.api.server-edge']),
('meetings',['meeting'],
 'Registros de reuniões de sessão, transcrições finais e decisões do owner.',
 'Conhecer fronteiras start/append/stop, resultado de ações e passagem de itens para Maestro sem atribuir gravação de áudio a estas rotas.',
 'MeetingError 400 contém ErrorReason. Endpoints usam DTOs Start/Append/Stop/Read/List e NoContent para append; descrições dizem um meeting running por Session e append idempotente por segmento já armazenado. Confirm/commitment/handoff têm DTOs próprios; handoff é declarado como itens com origem, sem transcript.',
 'Unicidade de running meeting, deduplicação de segmentos, cascade de memória no delete e envio team_message são responsabilidade de implementação; nenhuma dessas operações foi executada.',
 ['s1.api.session-contract','s1.api.surface-disposition']),
('guardrails',['guardrail'],
 'Leitura de regras e solicitação de avaliação de mudança no repositório.',
 'Distinguir o contrato de um engine de guardrail de um parecer executado sobre esta produção.',
 'rules retorna Guardrail.Rules e run recebe RunInput/retorna Report em Location.response; GuardrailError 400 contém kind e message. A descrição usa regras do merge-base com a branch alvo.',
 'Seleção efetiva de base/regra e resultado do engine permanecem externos ao contrato Protocol; não são veredictos Genesis.',
 ['s1.api.surface-disposition']),
('lean',['lean'],
 'Dashboard e preferências/histórico de Lean no perfil salvo da localização.',
 'Distinguir DTOs/meters históricos de medição de economia observada nesta execução.',
 'GET/PATCH /api/lean usa LeanDashboard.Info/Update; history por LeanCoverage.ItemID retorna History. Os três endpoints declaram ServiceUnavailableError.',
 'Cálculo de economia e aplicação de switches dependem de Core/persistência; nenhuma economia ou desempenho foi medido aqui.',
 ['s1.api.surface-disposition']),
('retrieval-research',['rag-studio','research-artifact'],
 'Pipeline de fontes/revisões RAG e leitura de artefatos de pesquisa admitidos à sessão.',
 'Separar source/pipeline experimental da leitura imutável autorizada por sessão e evitar tratar qualquer path como fonte autorizada.',
 'RAG usa LocationQuery/envelopes para admit/parse/revision/search/ask/proofs; embedding declara literal refused:embedding_off e passes/batch refused:one_pass. Research read exige sessionID, ArtifactID, revisão positiva e cursor opcional; responde ArtifactPage direto e declara 404/409/400/503, aplicando o middleware recebido. A anotação restringe acesso ao escopo admitido e proíbe paths arbitrários.',
 'A verificação de binding e escopo admitido, paginação imutável efetiva e recusa de source de projeto dependem dos handlers/serviços. A presença de ask/search não prova resposta fundamentada nem embedding ativo.',
 ['s1.api.session-contract','s1.api.client-projection']),
('references',['reference'],
 'Catálogo de referências disponíveis na localização.',
 'Conhecer a fronteira de descoberta e não inferir que uma referência dá acesso a um arquivo.',
 'reference.list usa LocationQuery e retorna Location.response(Array(Reference.Info)); não declara uma operação de leitura de conteúdo neste grupo.',
 'Disponibilidade real, origem e autorização de conteúdo exigem serviço de referência e o consumidor correspondente.',
 ['s1.api.schema-contracts']),
('vcs-pull-requests',['vcs','pull-request'],
 'Estado/diffs/atividade VCS e operações de pull request via host.',
 'Distinguir observações locais de Git, métricas de sessão e mutations externas com identidade do servidor.',
 'VCS diff requer mode working|branch e context não negativo opcional; activity recebe limites epoch-millis não negativos. PullRequestError 400 contém kind/message e host/branch/remote opcionais; list/create são Location.response e o contrato atribui ao gh/glab autenticado no servidor a interação com GitHub/GitLab.',
 'Comandos Git/host CLI, limites de repo, credenciais e publicação externa dependem da implementação; nenhuma PR ou chamada CLI foi feita neste trabalho.',
 ['s1.api.server-edge','s1.api.surface-disposition']),
('schedules',['schedule'],
 'Agendamento de prompts por localização e disparo manual.',
 'Distinguir CRUD de schedule, admissão de sessão e sucesso de execução; separar esta API de capability schedules de agentes.',
 'CRUD usa ScheduledTask.CreateInput/UpdateInput e Info; remove é NoContent. run retorna RunResult e declara ScheduleNotFoundError 404/ScheduleRunError 500. Anotações descrevem ID existente como create idempotente, admissão do prompt, slot devido versus execução extra e falha não registrada.',
 'Idempotência, exclusão de slot, armazenamento e execução são implementação Core; a descrição não comprova scheduler distribuído nem exatamente uma vez.',
 ['s1.api.session-contract','s1.api.server-edge']),
('relay',['relay-document','relay-hook','relay-run'],
 'Authoring/publicação de Relay, instalação de hooks e leitura de execução externa.',
 'Separar drafts/versões/checks executáveis, manutenção explícita de hooks e auditoria auto-reportada de evidência aceita.',
 'RelayErrors carregam code/message sob 400/404/409/503, com Forbidden403 separado. Update declara versionId/expectedChecksum/force opcionais; publish exige versionId. Anotação de check nega execução pública com 403 Maestro; trial é endpoint distinto para comando de até 60s sem grading/registro. Hooks têm versões publicadas, order list completo e repair exige confirm:true. External run é read-only; DTO Audit admite pass/fail/pending, mas a anotação deste audit exige pending external-self-reported para cadeia íntegra, nunca pass.',
 'A condição versionId-unless-force é descrição, não expressa como refinamento no Struct; checksums, trust, política de reparo e decisão pending precisam de implementação Server/Relay. Nenhum dado externo self-reported foi promovido a prova.',
 ['s1.api.boundaries','s1.api.server-edge','s1.api.surface-disposition']),
]

notes={
'actions-common':'Define erro público ActionsError 400, bindingID, revision positiva e limites/attempt opcionais positivos.',
'actions-binding':'CRUD de binding e acesso a capabilities/policy; create/update recebem BindingInput, policy usa Policy/PolicyState.',
'actions-job':'retry/play/cancel/erase usam jobID não vazio e retornam CommandExecution; comandos de cancel/erase são GitLabCommand.',
'actions-operation':'prepare recebe OperationIntent; get/reconcile usam OperationID e devolvem Operation. A fonte separa admissão/readback de writes específicos.',
'actions-pipeline':'merge-request usa mergeRequestID e MergeRequestCommand; trigger usa TriggerPipelineCommand; ambos devolvem CommandExecution.',
'actions-resource':'list combina ResourceListInput e limit positivo; command restringe action a create/update/delete/play/pause/keep/clear e recebe ResourceCommand.',
'actions-run':'List/get/jobs são readback paginado; retry/cancel/forceCancel/remove/approveFork/rename têm comandos com schemas específicos de provedor.',
'actions-source':'Validação de source/draft retorna Graph, com onExcessProperty:error nos DTOs de validação; branch/write/review são actions admitidas.',
'actions-workflow':'List/source/graph são leitura; dispatch/state aceitam DispatchCommand/WorkflowStateCommand e retornam CommandExecution.',
'agent':'Detail anuncia tools, skills e engines/status; file get/update usam AgentFile e update declara 409 por revision stale.',
'behavior':'PUT recebe SetInput, devolve array Info e declara substituição do contexto de comportamento do projeto.',
'command':'GET retorna catálogo Command.Info na localização; execução de comando não pertence a este grupo.',
'skill':'List e save/remove para catálogo/arquivos de projeto; save declara globals/built-ins/Atlas-governed read-only, com InvalidRequest/Conflict.',
'atlas':'Fachada da tela/store Atlas: distingue draft, emit, review, decisões e setup/index/mine; todos os endpoints declaram ServiceUnavailable.',
'board':'Projeto por key e issue por número positivo; reads têm DTOs específicos e writes OwnerResult, com 404/409; ownership de notas é declarado.',
'capability-connections':'Páginas 1..32, mutations com idempotency-key, input de setup/binding/target e receipts diretos; aplica CapabilityAuthorization.',
'capability-operator':'Inspeciona requestID/principal/origin/scopeHash; origin é configured-auth/desktop/cli/sdk; aplica CapabilityAuthorization.',
'capability-schedules':'Ações list/pause/resume/run/remove de schedules de agente; create/edit ficam no tool do agente; mutations exigem key.',
'config':'Patch global de modelo/shell/engines/providers/permissions; listas substituem as anteriores; update é NoContent.',
'trust':'Lista/aprova/revoga trust global com directory String; não é Location-scoped; realpath e herança são descrições de behavior.',
'credential':'PATCH altera somente label; DELETE remove por Credential.ID; os dois retornam NoContent e declaram ConflictError.',
'integration':'Discovery de métodos, connect por key/OAuth e polling/completion/cancel; endpoints OAuth por integrationID preservam compatibilidade.',
'health':'GET declara healthy:true, version e pid opcional; é schema de resposta, não medição de disponibilidade desta sessão.',
'installation':'POST target seleciona release, resposta success:true/version e erros 400/500; upgrade executado não foi observado.',
'formatter':'Status dos formatters configurados/disponíveis por Location, Array(Formatter.Status).',
'lsp':'Status de language servers conectados na Location, Array(Lsp.Status).',
'mcp':'Discovery/status/config/resources/tools, mutations de config/conexão e OAuth; descrições distinguem redaction e env refs não resolvidas.',
'location':'Query directory/workspace opcionais deepObject; Info direto e paths.home no endpoint de caminhos.',
'project':'Catálogo global e mutation por Project.ID; initGit é operação com LocationQuery e resposta nullable dentro do envelope.',
'project-copy':'Create omite projectID/sourceDirectory do payload e usa params/contexto; Remove omite projectID; erro400 inclui forceRequired opcional.',
'permission':'Queries de requests/saved e recursos de sessão; middleware placement separa endpoints prévios e session endpoints; reply é NoContent.',
'question':'Pending list por Location; list/reply/reject por sessionID e requestID com middleware de sessão e erros404.',
'meeting':'Start/append/stop/read/list, confirmações e handoff; ErrorReason estruturado em400, append NoContent e descrição de deduplicação.',
'guardrail':'Rules e run/reports com erro400 kind/message e descrição de baseline merge-base.',
'lean':'Dashboard/update/history por item, todos com ServiceUnavailableError; não calcula economia nesta camada.',
'rag-studio':'Sources/pipeline/revisions/search/ask/proofs; tipos explícitos de refusal embedding_off e one_pass restringem duas rotas.',
'research-artifact':'SessionID + ArtifactID + revisão positiva, cursor opcional, ArtifactPage direto e middleware recebido; sem path de filesystem.',
'reference':'Somente catálogo Reference.Info na localização; não fornece acesso de conteúdo.',
'vcs':'Info/status/diff working|branch, métricas entre millis e atividade de sessão por período.',
'pull-request':'List/create com erro400 kind/message e contexto host; declaração atribui efeitos ao gh/glab autenticado do servidor.',
'schedule':'CRUD e run de ScheduledTask; erros404/500 explícitos para run, descrição separa admissão e execução.',
'relay-document':'Authoring e publicação; revision/checksum/force, recusa de check público e trial separado; versão publicada tem porta própria.',
'relay-hook':'Instalações versionadas, enable/disable/order/uninstall/decision read; repair explícito exige confirm:true e preserva ledger no uninstall.',
'relay-run':'Leitura de runs e ledger externo; audit schema admite pass, mas descrição exige pending para cadeia íntegra self-reported.',
}

# A narrow evidence selection. Complete source was read; selected spans are the transmitted L1 witnesses.
ranges={
'actions-common':[(6,17)],'actions-binding':[(15,20),(28,34)],'actions-job':[(10,18)],'actions-operation':[(10,21)],'actions-pipeline':[(10,18)],'actions-resource':[(8,19)],'actions-run':[(8,23)],'actions-source':[(8,22),(27,30)],'actions-workflow':[(8,17),(22,29)],
'agent':[(9,26),(77,91)],'behavior':[(9,23)],'command':[(9,19)],'skill':[(29,42),(46,56)],
'atlas':[(39,48),(122,150),(317,330)],'board':[(6,23),(52,56),(102,116),(280,286)],
'capability-connections':[(9,32),(91,95)],'capability-operator':[(6,16)],'capability-schedules':[(9,14),(24,43)],
'config':[(15,40),(56,65)],'trust':[(5,7),(22,45)],'credential':[(8,18),(26,36)],'integration':[(41,54),(79,96),(100,112),(169,181)],
'health':[(5,15)],'installation':[(5,15)],'formatter':[(9,19)],'lsp':[(9,19)],'mcp':[(39,53),(86,97),(173,188)],
'location':[(5,12),(20,23),(33,54)],'project':[(10,26),(35,48),(51,61)],'project-copy':[(10,31),(36,43)],
'permission':[(60,84),(104,128)],'question':[(33,62),(67,78)],'meeting':[(7,25),(38,49),(164,176)],
'guardrail':[(7,24),(36,47)],'lean':[(9,14),(26,37),(42,54)],'rag-studio':[(11,18),(29,33),(83,104),(133,154)],'research-artifact':[(9,24)],'reference':[(9,18)],
'vcs':[(40,55),(59,71),(76,88)],'pull-request':[(8,21),(25,37),(41,54)],'schedule':[(8,21),(41,54),(91,104)],
'relay-document':[(15,41),(74,80),(306,319),(353,366),(430,443)],'relay-hook':[(17,47),(126,138),(170,181)],'relay-run':[(8,10),(43,47),(82,94),(98,112)],
}
assert set(notes)==set(ranges)=={Path(e['path']).stem for e in entries}
flat=[n for _,members,*_ in domains for n in members]
assert len(flat)==44 and len(set(flat))==44 and set(flat)==set(notes)

old_lines={}
for idx in [B/'review-evidence-compact-index.json',ROOT/'revisions/b-l1-evidence-v1/source-supplement-index.json']:
    v=json.loads(idx.read_text())
    for item in v['sources']:
        for sp in item['ranges']:old_lines.setdefault(item['path'],set()).update(range(sp['start_line'],sp['end_line']+1))
domain_for={n:did for did,members,*_ in domains for n in members}
members=[]; selections=[]
for e in sorted(entries,key=lambda e:e['path']):
    p=e['path']; n=Path(p).stem;s=sources[p];raw=(B/'sources'/p).read_bytes();lines=raw.decode().splitlines(keepends=True)
    assert sha(raw)==s['sha256'] and len(raw)==s['byte_length']
    assert hashlib.sha1(b'blob '+str(len(raw)).encode()+b'\0'+raw).hexdigest()==s['git_blob_sha']
    selected=[]
    for start,end in ranges[n]:
        end=min(end,len(lines)); assert start<=end
        assert not (set(range(start,end+1)) & old_lines.get(p,set()))
        excerpt=''.join(lines[start-1:end]).encode()
        selected.append({'start_line':start,'end_line':end,'byte_length':len(excerpt),'sha256':sha(excerpt)})
    source_ref={k:s[k] for k in ['commit','path','git_blob_sha','sha256','byte_length']}
    selections.append({'id':f'P{len(selections)+1:02}','domain_id':domain_for[n],'source_ref':source_ref,'ranges':selected,'purpose':notes[n]})
    members.append({'path':p,'domain_id':domain_for[n],'historical_record':e,'current_read_state':{'status':'full_source_read_for_L1_contract_semantics','reader':'/root/producer_b/protocol_triage','revision':'S1-L1-B-v3','source_ref':source_ref,'read_spans':[{'start_line':1,'end_line':len(lines)}],'method':'Six batched local reads of exact previously captured files; full texts were displayed without truncation. Source hashes rechecked.','execution':'none','semantic_review':'unjudged'},'l1_fact':notes[n],'evidence_selection_id':selections[-1]['id'],'depth_justification':'Full declaration and annotation read establishes the public input/output/error/middleware contract and its attributed intent. No Server/Core implementation or execution guarantee is inferred.'})

records=[]
for did,names,purpose,need,facts,gap,related in domains:
    mm=[m for m in members if m['domain_id']==did]
    records.append({'domain_id':did,'member_paths':[m['path'] for m in mm],'purpose':purpose,'current_l1_need':need,'source_supported_facts':facts,'new_evidence_ids':[m['evidence_selection_id'] for m in mm],'current_knowledge_status':'Declared Protocol purpose and public contract now directly supplied for review; no semantic verdict asserted.','existing_artifact_relationship':{'artifact_keys':related,'relationship':'Existing bounded L1 context/navigation, not accepted build predecessors and not a substitute for these new source reads.'},'conditional_gap':{'description':gap,'kind':'implementation_or_runtime_claim_not_asserted_by_protocol_triage','blocked_claim':gap,'blocked_dependents':'Any L1 implementation assertion or later end-to-end/maintenance claim relying on that unstated enforcement must obtain the corresponding literal Server/Core/domain evidence; no need is discharged by this label.'},'mandatory_current_l1_source_gap_for_declared_contract':None,'why_depth_adequate':'All member declarations and annotations were read; the current claim is the observed public contract and ownership boundary. Repeating every schema field or runtime body is not needed to establish that bounded role. Enforcement beyond Protocol remains explicitly attributed/unproved.','review_state':'unjudged'})

dump('triage.json',{'schema':'genesis-domain-triage/v1','task':'S1-L1-B-v3','finding':'B3','scope':'orchestra.s1','source_revision':PIN,'protocol_revision':PROTO,'historical_group':'G30','historical_membership_count':44,'new_domain_count':len(records),'source_bytes_read':sum(sources[e['path']]['byte_length'] for e in entries),'request_sha256':sha((R/'request.txt').read_bytes()),'new_artifact_key_claimed':False,'primary_existing_key':'s1.api.surface-disposition','domains':records,'members':members,'global_limits':['No fixture/generated/documentation family disposition was changed.','F02-F08 remain applicable to their specific dependent implementation/runtime claims; declared Protocol knowledge is now directly supplied, not postponed to L2.','No product execution, source mutation, remote write, oracle access or judge dispatch.','Annotations describe intended behavior; they are not substituted for the Server/Core enforcement implementation.']})
dump('excerpt-selection.json',{'schema':'genesis-excerpt-selection/v1','source_revision':PIN,'sources':selections,'claim_scope':'L1 public Protocol contract, with implementation intent explicitly attributed','prior_evidence_overlap_lines':0})
md=['# Triagem semântica L1 — 44 módulos Protocol\n\n',f'Fonte `{PIN}`; protocolo `{PROTO}`; grupo histórico G30. Os 44 arquivos foram lidos integralmente nesta revisão: 155.952 bytes. Seu estado histórico `L1_literal_surface` permanece preservado em triage.json; o novo estado é leitura completa do contrato Protocol, não execução nem aceite.\n\n','Esta base distingue schemas/erros/middleware declarados, anotações de intenção e enforcement de Server/Core. Ela complementa s1.api.surface-disposition e os corpos existentes; não cria chaves L2–L4 ou predecessores aceitos.\n\n']
for d in records:
    md.append(f"## {d['domain_id']} — {len(d['member_paths'])} membros\n\n**Propósito:** {d['purpose']}\n\n**Necessidade L1 atual:** {d['current_l1_need']}\n\n**Base factual nova:** {d['source_supported_facts']}\n\n**Profundidade:** {d['why_depth_adequate']}\n\n**Limite / claim bloqueado:** {d['conditional_gap']['description']} A evidência de implementação correspondente deve existir antes de afirmar enforcement; não está sendo adiada uma descrição de contrato Protocol que já pode ser obtida destas fontes.\n\n**Contexto L1 existente:** {', '.join('`'+k+'`' for k in d['existing_artifact_relationship']['artifact_keys'])}. Esses refs são navegação, sem aceite implícito.\n\n| Membro exato | Observação material lida | Evidência nova |\n| --- | --- | --- |\n")
    for m in members:
        if m['domain_id']==d['domain_id']:md.append(f"| `{m['path']}` | {m['l1_fact']} | {m['evidence_selection_id']} |\n")
    md.append('\n')
md.append('## Limites de prova\n\nNenhum produto foi executado. Fontes não são resultados de OAuth, Git, instalação, scheduler, guards ou publicações. O Audit de Relay ilustra por que as camadas precisam permanecer separadas: a união do DTO permite pass, enquanto a anotação da rota externa afirma pending; só o handler pode estabelecer o comportamento implementado. As descrições de realpath/trust, ownership de request/attempt e proteção de arquivos também não surgem automaticamente de campos String.\n\nA disposição é reversível: triage.json mantém cada registro histórico completo e adiciona o novo recibo de leitura, com pin/blob/SHA-256/span. O conjunto é exatamente G30; os outros 146 membros do finding B3 pertencem às triagens irmãs e não recebem cobertura por este documento.\n')
(R/'triage.md').write_text(''.join(md))

ev=['# Trechos novos Protocol — seleção estreita\n\n',f'Todos os trechos são do commit `{PIN}`. Bytes copiados das capturas originais; nenhuma linha selecionada aparece em C01–C47/S01–S38. A leitura completa está registrada separadamente; este documento transmite somente testemunhas dos contratos e ownership declarados.\n\n']
for sel in selections:
    s=sel['source_ref'];lines=(B/'sources'/s['path']).read_bytes().decode().splitlines(keepends=True)
    ev.append(f"## {sel['id']} — `{s['path']}`\n\nBlob `{s['git_blob_sha']}`; arquivo SHA-256 `{s['sha256']}`; {s['byte_length']} bytes. {sel['purpose']}\n\n")
    for sp in sel['ranges']:
        txt=''.join(lines[sp['start_line']-1:sp['end_line']])
        ev.append(f"Linhas {sp['start_line']}–{sp['end_line']}, trecho SHA-256 `{sp['sha256']}`:\n\n```typescript\n{txt}")
        if not txt.endswith('\n'):ev.append('\n')
        ev.append('```\n\n')
(R/'excerpts.md').write_text(''.join(ev))
dump('reading-receipt.json',{'schema':'genesis-source-reading-receipt/v1','reader':'/root/producer_b/protocol_triage','task':'S1-L1-B-v3','source_revision':PIN,'previous_state':'44 literal surface-indexed production sources; original records preserved','current_state':'44 full source reads of public Protocol declarations and annotations, no runtime execution or semantic verdict','batches':[['actions-common','actions-binding','actions-job','actions-operation','actions-pipeline','actions-resource','actions-run','actions-source','actions-workflow','capability-connections','capability-operator','capability-schedules'],['agent','behavior','command','skill','config','trust','credential','integration'],['health','installation','formatter','lsp','location','project','project-copy','permission','question','meeting'],['guardrail','lean','rag-studio','research-artifact','reference','vcs','pull-request','schedule'],['atlas','board','mcp'],['relay-document','relay-hook','relay-run']],'members':[{'path':m['path'],**m['current_read_state']} for m in members]})

assert {m['path'] for m in members}=={e['path'] for e in entries}
assert all(m['historical_record']==next(e for e in entries if e['path']==m['path']) for m in members)
response=f"""# Entrega Protocol — S1-L1-B-v3 / B3

Concluí a triagem dos exatos 44 membros G30, organizados em 19 domínios. Li integralmente os 44 arquivos capturados no pin {PIN}, total de 155.952 bytes; todos mantêm o estado histórico e recebem um novo recibo de leitura com path, blob, SHA-256 e spans.

Entregas no diretório `{R}`:

- `triage.md`: propósito, necessidade L1, fatos materiais, membros exatos, justificativa de profundidade e claim/depêndencia bloqueado por domínio.
- `triage.json`: 44 registros históricos completos, novo estado individual e 19 registros de domínio, sem aceite semântico.
- `excerpt-selection.json` e `excerpts.md`: seleção estreita de {sum(len(s['ranges']) for s in selections)} spans de 44 fontes, zero sobreposição com C01–C47/S01–S38.
- `reading-receipt.json`: seis lotes reais de leitura completa, sem truncamento dos textos de fonte; nenhuma execução de produto.
- `request.txt` e `request-followup.txt`: delegações preservadas.
- `verification.json`: bijeção, hashes e fidelidade dos spans.

Limites materiais: campos String e anotações de trust/ownership não provam enforcement; capabilities distinguem receipts diretos, idempotência e CapabilityAuthorization; Relay distingue authoring/check recusado e trial, e o DTO de audit aceita pass embora a anotação de audit externo exija pending. A verificação de handlers/Core é necessária antes de afirmar esses efeitos implementados. Atlas screen/mine declarado não constitui runtime Genesis desta campanha. Nenhuma fonte de outro autor foi aceita como síntese, nenhuma fixture/gerado/documentação foi reclassificada, nenhum oracle foi lido e nenhum parecer foi solicitado.

SHA-256 triage.md: `{sha((R/'triage.md').read_bytes())}`.
SHA-256 triage.json: `{sha((R/'triage.json').read_bytes())}`.
SHA-256 excerpt-selection.json: `{sha((R/'excerpt-selection.json').read_bytes())}`.
"""
(R/'response.md').write_text(response)
dump('verification.json',{'status':'verified-mechanically','not_semantic_acceptance':True,'source_revision':PIN,'member_count':len(members),'domain_count':len(records),'source_bytes_read':sum(sources[e['path']]['byte_length'] for e in entries),'span_count':sum(len(s['ranges']) for s in selections),'span_lines':sum(x['end_line']-x['start_line']+1 for s in selections for x in s['ranges']),'prior_evidence_overlap_lines':0,'checks':['44 member paths equal exact G30 membership','Full historical record retained per member','Every source matches observed Git blob/SHA-256/byte length','Selected snippets are exact source lines','No selected line overlaps old compact/supplement','No body/source outside this exclusive helper directory written'],'files':{p.name:{'sha256':sha(p.read_bytes()),'byte_length':p.stat().st_size} for p in sorted(R.iterdir()) if p.is_file() and p.name!='verification.json'}})
print(json.dumps({'members':len(members),'domains':len(records),'triage_bytes':(R/'triage.md').stat().st_size,'excerpt_bytes':(R/'excerpts.md').stat().st_size,'spans':sum(len(s['ranges']) for s in selections),'hash':sha((R/'triage.json').read_bytes())},indent=2))
