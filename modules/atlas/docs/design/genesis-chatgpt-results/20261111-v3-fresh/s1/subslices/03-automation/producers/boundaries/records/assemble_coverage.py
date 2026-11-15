"""Assemble one explicit disposition per assigned path; no repository code executes."""
import json
from collections import Counter
from pathlib import Path

ROOT=Path('/workspace/scratch/ef5eb2eb4a70/s1-03-34269cf4-d631-41c5-a30b-85b0ec217390')
OUT=ROOT/'producers/boundaries'
rows=[json.loads(x) for x in (ROOT/'inputs/sources.jsonl').read_text().splitlines()]
rows=[x for x in rows if x['legacy_artifact_key'] in ('s1.core.boundaries','s1.core.entry')]
caps={x['path']:x for x in json.loads((OUT/'captures.json').read_text())}
eindex=json.loads((OUT/'records/evidence-index.json').read_text())

boundary={
'atlas.ts':('atlas_host_port','Abre superfície pelo projeto/raiz do host, traduz indisponibilidade e prepara indexação/drafting; propõe conteúdo sem atribuir aceite do engine Atlas.','S1-03; engine Atlas S4'),
'control-plane/move-session.ts':('location_transfer','Ordena apply no destino, evento e descarte de origem; falha pós-evento e ausência de coordenação do runner são limites explícitos.','S1-03; caller Session S1-01'),
'control-plane/workspace.sql.ts':('workspace_storage_schema','Define registro Workspace e relação de projeto; tabela não implementa warp, sync ou execução distribuída.','S1-03; Location S1-01'),
'rag-studio/sql.ts':('rag_persistence_schema','Distingue fontes/chunks/revisions/traces/pipeline; índices e ausência deliberada de FK não estabelecem retrieval ou embedding.','S1-03; retrieval/engine S4'),
'relay-commands.ts':('command_discovery','Lê manifests, lockfiles e pytest limitado para sugestões; classificação heurística não executa nem valida comandos.','S1-03'),
'relay-hook-install.ts':('hook_install_lifecycle','Verifica snapshot/digest/grafo, arquivo e lifecycle; reparo explícito, escrita substitutiva e lock só no processo delimitam autoridade.','S1-03; publicação pelo host'),
'relay-hook-recovery.ts':('hook_local_recovery','Recupera decisões só em implicit-local/projeto/diretório exatos; conta tentativas e não garante todos os recibos.','S1-03; Session S1-01'),
'relay-hook-shipper.ts':('hook_receipt_shipping','Separa decisão durável de recibo, deduplica por install/ledger e absorve falhas por grupo; inFlight é local ao processo.','S1-03'),
'relay-workflow-binding.ts':('workflow_publication_binding','Adquire publicação/version/skills/âncoras e revalida bytes e identidade; exige resolver/autor quando conhecimento é necessário.','S1-03; host S1-02/API S1-04; Atlas S4'),
'relay-workflow-currentstep.ts':('workflow_read_projection','Projeta passo atual sem mutação, confere posição/attempt/ledgerSeq e mantém conteúdo de fonte/check como não confiável.','S1-03'),
'relay-workflow-evaluator.ts':('workflow_native_settlement','Exige identidade e recibo autenticado sob lock do engine; reconcilia writes sem regrading, old PASS/JSON sozinho não basta.','S1-03; engine Relay S3'),
'relay-workflow-session.ts':('workflow_session_bridge','Liga evento de Session ao host nativo único, recusa binding múltiplo/host ausente e decide continuação por disposition.','S1-03; Session S1-01'),
'relay-workflow-transition.ts':('workflow_checkpoint_fence','Persiste fence global antes do checkpoint por assistantMessageID e reconcilia settled/pending com tripla esperada.','S1-03; engine Relay S3'),
'relay.ts':('relay_host_ports','Vincula diretórios, chave, processo/sandbox, gates e trial; aprovação calculada sem registro não se torna pass durável.','S1-03; Relay S3; sandbox S1-02; Omni S4'),
}
boundary_tests={
'move-session.test.ts':'Cenários fonte com Git/DB para transferência, mesmo root e preservação de staged/unrelated; não executados.',
'relay-commands.test.ts':'Asserções de sugestões Bun/Makefile/pytest e diretório vazio; valida intenção do detector, não qualidade do comando sugerido.',
'relay-hook-install.test.ts':'Asserções de digest, regras de grafo, lifecycle, arquivos inválidos/symlink e falhas/concor­rência de escrita; sem resultado novo.',
'relay-hook-recovery-startup.test.ts':'Prepara startup em Location real do harness, finalizer, falha não fatal e explicit-workspace unsupported; não comprova startup atual.',
'relay-hook-recovery.test.ts':'Prepara filtro de projeto/diretório, paginação, órfãos, inFlight, falha/retry e workspace explícito; fonte de caso, não recibo.',
'relay-hook-session.test.ts':'Prepara block/approve nos boundaries de sessão/ferramenta e retry exato; aceitação depende da execução e identidade do caso.',
'relay-hook-shipper.test.ts':'Prepara deferred receipt, deduplicação, inFlight e falha por install sem apagar decisões; não atesta shipping neste host.',
'relay-workflow-binding.test.ts':'Prepara publicação/checksum/materialização/skills/âncoras, read-only currentStep e holder; não transfere aceite de Atlas ou host.',
'relay-workflow-evaluator.test.ts':'Asserções sobre duplicate settlement, signed receipt, partial repair, old PASS, HMAC e lock; sem execução, não são qualificação do engine.',
'relay.test.ts':'Asserções sobre paths/chave, ambiente/timeout, semáforo, judge config e locks; distinguir cada caso de garantia universal de plataforma.',
}
docs={
'docs/architecture/phase-plans/70-90-briefs/EXP-CORE.md':('historical_plan_full_read','Card mecânico de exports no baseline histórico; confrontado com os 437 exports atuais, sem transformar a meta antiga em censo vigente.'),
'docs/architecture/phase-plans/70-90-briefs/RD-CTRLPLANE.md':('historical_plan_full_read','Card de README/retirada de control plane legado; serve para entender intenção e localizar contratos atuais, não para provar implementação.'),
'docs/architecture/phase-plans/70-90-briefs/RD-SESSION.md':('historical_plan_full_read','Card histórico sobre admissão/execução/persistência de Session; navega para S1-01 e conserva sua época.'),
'docs/specs/runtime-closure/ARCHIE-QUALIFICATION.md':('historical_qualification_targeted_read','Recibos e candidatos do recorte Archie com exclusões explícitas; não repassa aprovação a dual V2, W6 ou plataformas fora do recorte.'),
'docs/specs/runtime-closure/CHECKPOINT.md':('historical_qualification_targeted_read','Checkpoint de casos/candidatos anteriores, com CI integral/plataformas ainda limitadas; não é recibo do pin atual.'),
'docs/specs/runtime-closure/PLAN.md':('historical_plan_targeted_read','Plano de closure CLI/WSL/SDK/Nix/OAuth, invariantes e WPs; ações e observações são intenção contextual, não resultados novos.'),
'docs/specs/runtime-closure/PRODUCER-BOUNDARY.md':('historical_contract_full_read','Preserva exceção humana de namespace controlado e controles de produtor, excluindo adversário same-UID; não concede permissão nesta execução.'),
'docs/specs/runtime-closure/SNAPSHOT-QUALIFICATION.md':('historical_qualification_targeted_read','Comparação datada de updater/snapshot com candidatos e limitações; medir um caminho não fecha todas as capacidades/plataformas.'),
'docs/specs/runtime-closure/WAVE-2.md':('historical_plan_targeted_read','Cadência e owners da onda, preparação e conclusões específicas; não confundir harness preparado/falho com runtime efetivamente exercido.'),
'docs/specs/v2/api.html':('documentation_targeted_read','Mapa visual de rotas/contextos com discussão pendente e vocabulário immediate/deferred histórico; contrato vigente requer S1-04 e Session.'),
'docs/specs/v2/schema-changelog.md':('documentation_targeted_read','Registro datado de schemas/compatibilidade e direção de manutenção; cada mudança exige fonte atual, sem herdar comportamento por narrativa histórica.'),
'docs/specs/v2/todo.md':('documentation_full_read','Backlog e decisões de rebuild; distingue replay de evento de recuperação provider pós-crash, sem declarar toda lacuna ainda aberta hoje.'),
}
package={
'bunfig.toml':('configuration_full_read','Declara preloads de guard/controle Omni/Core; é configuração do harness, não autorização nem resultado de teste.'),
'drizzle.config.ts':('configuration_full_read','Configura dialect/globs/output de geração SQLite; dbCredentials de tooling não define localização runtime universal.'),
'package.json':('manifest_structural_and_targeted_read','437 exports explícitos sem bare/wildcard, scripts e dependências; distingue folhas produtivas e helpers de teste e identifica os entry points reais.'),
'README.md':('documentation_full_read','Entrada pública e direção Schema/Protocol→Core→Server, composição e geradores oficiais; intenção de arquitetura não prova todas as folhas.'),
'schema.json':('generated_json_structural_read','Snapshot SQLite formato7 com ddl/IDs e 63 tabelas contado estruturalmente; manter via migration generator, não editar snapshot manualmente.'),
'script/fix-node-pty.ts':('maintenance_source_full_read','Ajusta bit executável de spawn-helper existente fora Windows; não comprova execução de PTY ou sandbox.'),
'script/migration.ts':('maintenance_source_full_read','Gera migration/snapshot/schema/registry com ordem e --check, sem overwrite de nome; preserva caminho oficial e história de migrations.'),
'script/toolkit-floors.ts':('maintenance_source_targeted_read','Parser de formatos binários/download/digest e comparação de floors; inspeção estática limitada, sem qualificação de execução ou plataforma.'),
'script/toolkit-pack.ts':('maintenance_source_targeted_read','Scaffolding/skills/pins de toolkit e recipes; TODO-PIN não resolvido permanece limite e gerador pertence aos donos de suas saídas.'),
'tsconfig.json':('configuration_full_read','Configuração TypeScript/Bun e opções de biblioteca/checagem; não é resultado de tsgo.'),
'vendor/hugr-lean-0.4.0-0660c2b5dc92.tgz':('vendored_archive_metadata_and_hash_read','Tarball pinado preservado, hash/bytes e package.json interno conferidos; código interno completo não recebeu aceite semântico nem foi executado.'),
'vendor/README.md':('documentation_full_read','Proveniência/commit/tree/digest/licenças e limites de superfície do vendorizado; preservar licença e bytes sem alegar attestation upstream verificada ao vivo.'),
}

# Each support path has a purpose derived from the observed imports, constructors,
# protocols or assertions. Grouping does not erase the per-path disposition.
test_data='''background-job.test.ts|jobs|Observações de job process-local, metadata durable=false, começo/finalização/escopo e falha prévia; não demonstra durable execution.
bun-test-timeout.test.ts|ci|Prepara subprocesso Bun com prazo e contrato de preload; sem executar, não prova deadline real do runner.
distribution-bundle-boundaries.test.ts|distribution|Usa cargo/logs sintéticos ORCHESTRATION-ONLY para argv/cwd/ordem/falha; não é qualificação nativa.
distribution-bundle-deno.test.ts|distribution|Prepara admission/parser/arquivos e HTTP local para versão/checksum/aborto do bundle Deno; não prova release remota instalada.
distribution-bundle-execution.test.ts|distribution|AppProcess real no harness e Bun fake na borda de shell; verifica protocolo/argv/logs em fonte sem transferir native PASS.
distribution-bundle-gates.ts|distribution|Parser exige recibos de teste nativo e resultado cargo não vazio/sem ignored; texto reconhecido só vale com origem real do job.
distribution-bundle-workflow.test.ts|distribution|Lê YAML e seletores do workflow e prepara mutation cases; não executa o próprio workflow.
fixture/actions-cli.ts|actions|CLI de protocolo por reply.json e captura de argv/stdin; respostas são controladas, não gh/glab reais autenticados.
fixture/actions-http.ts|actions|Compõe AppProcess, transporte e servidor de rede fixture para contrato HTTP; sem compatibilidade live-provider inferida.
fixture/actions-network.ts|actions|Rede TLS/HTTP local de baixo nível para controlar chunks e callbacks; manutenção acompanha limites de transporte e cleanup.
fixture/actions-resource-runtime.ts|actions|Servidor loopback de recursos/GraphQL GitLab com commits/runners/cache sintéticos; não observa conta remota.
fixture/actions-transport.ts|actions|Transporte real exige raw spawn e falha nos caminhos run/runStream; prepara respostas, ambiente e tokens sintéticos.
fixture/board-queue.ts|actions|Git real com GitHub/renderer/gates sintéticos; registro scoped-pass inserido pela fixture não é recibo CI.
fixture/capability-artifacts.ts|capability|Compõe DB/Event/host e diretórios isolados para artefato/policy; bytes/metadados de exemplo não são artefatos publicados reais.
fixture/capability-channel.ts|capability|Compõe canais/conexões/jobs com tokens e respostas sintéticos, mutações e falhas de fase controladas; não contata Slack/Discord.
fixture/capability-children.ts|capability|Compõe Invocation/ToolRegistry/child storage e registra ferramenta controlada sob contexto canônico; não cria execução autônoma real aqui.
fixture/capability-connection-management.ts|capability|Exige factory real do Store, falhando se ausente; semeadura de placement/credenciais é sintética para testar autoridade.
fixture/capability-connection-setup-sql.ts|capability|Instrumenta SQL/reserva reais no harness e conta tentativas inclusive rollback; exige controle INSERT autorizado do próprio caso.
fixture/capability-connection-setup.ts|capability|Usa factories reais de setup/verificação/request e provider local controlado; observa writer state/redação sem revelar credencial real.
fixture/capability-discovery.ts|capability|Compõe catálogo/discovery/registry com schemas e seleção sintéticos; disclosure/cursores precisam dos casos executados para aceite.
fixture/capability-mcp.ts|capability|Prepara seleção/binding/owner, endpoint autorizado e respostas MCP JSON/SSE com token sintético; recurso não escolhe endpoint livremente.
fixture/capability-policy.ts|capability|Estabelece regras allow/deny, owner/invocation e eventos de permissão; exemplos de segredo e timestamp são dados de teste.
fixture/capability-process-control.ts|capability|Combina registry/processo/DB/Invocation em tempdir e criança controlada; eco de variável sintética não mede vazamento de credencial real.
fixture/capability-schedule.ts|capability_schedule|ToolRegistry/settlement e DB reais no fixture, SessionExecution substituído e withRunner proibido; admissão não comprova conclusão.
fixture/capability-service-call.ts|capability|Prepara schemas, seleção e corrida de publicação/rotação/retarget/disconnect em serviço controlado; não atesta provedor externo.
fixture/capability-services.ts|capability|Compõe services/discovery/connections e limites mutáveis de output; dados/templates isolam divulgação e retenção a testar.
fixture/distribution-bundle.ts|distribution|Extrai passos nomeados de YAML e cria fake Bun/commands para ensaio de orquestração; manter rótulo de substituição explícito.
fixture/effect-flock-worker.ts|process|Worker usa EffectFlock e protocolo de job/espera para concorrência preparada; não confere lock distribuído automaticamente.
fixture/flock-worker.ts|process|Worker Flock com entrada JSON e jobs controlados; seu processo só seria criado por teste autorizado.
fixture/git.ts|actions|Helper de repositório Git real isolado para branch/commit/remoto de teste; não altera repositório de produto nesta leitura.
fixture/github-command-cli.ts|actions|CLI responde a rotas/argv validados de comando GitHub; não é chamada real a API remota.
fixture/github-command.ts|actions|Reusa bindings e wire-shapes de read com comandos/workflows sintéticos; preservar decoder e protocolo juntos.
fixture/github-read-cli.ts|actions|Subprocesso de protocolo entrega bytes brutos para decoder de produção; não é implementação alternativa do provider.
fixture/github-read.ts|actions|Exemplos oficiais sanitizados de wire-shape e binding/repo/workflow/run; comentário exclui compatibilidade live-provider.
fixture/location.ts|harness|Constrói Location/Project controlados a partir de Ref; não resolve projeto real nem garante identidade externa.
fixture/lsp-stdio-server.js|protocol_fixture|Servidor mínimo Content-Length/JSON-RPC para initialize/shutdown/exit; não é language server completo.
fixture/lsp/fake-lsp-server.js|protocol_fixture|Servidor LSP controlável para registros/diagnósticos/delays; manter correlação do protocolo e estado do fixture.
fixture/mcp-omni-stdio.ts|protocol_fixture|Servidor MCP SDK stdio controlável com árvore de processo/stderr/falhas e recursos/prompts; não atesta compatibilidade universal MCP.
fixture/mcp-session-recovery.ts|protocol_fixture|Cliente SDK fala com servidor local que expira sessão e entrega replacement; grava posts para observar retry, não serviço externo.
fixture/monolith-inventory.ts|package_fixture|Cria workspace/pacotes/fontes sintéticos para scanner de inventário; contagem preparada não é censo do monorepo atual.
fixture/omni-effect.ts|process|Reexporta Effect/ManagedRuntime/ChildProcess pela resolução real do Core, mantendo identidade de serviço entre harness e caller.
fixture/omni-expect.ts|process|Controle positivo abre expectativa no próprio teste e computa apenas seus spawns; outro teste não satisfaz a declaração.
fixture/packaged-skills.ts|package_fixture|Dados UTF-8/CRLF/vazios e bundle de fixture preservam identidade real dos módulos via specifiers AST; não gera pacote de produto aqui.
fixture/pinned-artifact/tool.zip|binary_fixture|Archive de regressão conferido por diretório e bytes do membro bin/tool; não executado, não qualifica artefato de distribuição.
fixture/process-tree.ts|process|Árvore de descendentes com nonce e birth time por plataforma; PID isolado não é identidade suficiente para a observação.
fixture/ripgrep-release.ts|package_fixture|Servidor release local, archives e gates explícitos de ordenação sem depender de tempo; não baixa release real nesta tarefa.
fixture/scip-alias/core.scip|binary_fixture|SCIP binário preservado; strings identificam @orchestra/core e símbolos greet/Greeter; sem decodificação semântica completa.
fixture/scip-alias/orchestra.scip|binary_fixture|SCIP binário preservado com referência orchestra e @orchestra/core; dado de regressão de alias, não índice atual aceito.
fixture/sdk-registry.ts|package_fixture|Servidor de packuments/tarballs locais para Arborist/pacote e cópia plantada que falha se rodar; não usa registry remoto aqui.
fixture/tmpdir.ts|harness|Tempdir realpath e cleanup com retries EBUSY delimitados, preservando demais falhas; isolamento de teste, não transação de produto.
fixture/upstream-arsenal-proof.ts|upstream|Orquestra subprocesso com snapshot copiado/perturbado e verifica bytes originais; intenção de prova sem execução desta produção.
fixture/upstream-arsenal-registry.ts|upstream|Preload instala snapshot de fonte para fresh-process e marca entrada backend; não muda fonte original do produto.
fixture/upstream-arsenal-runtime.ts|upstream|Casos usam Arsenal real e perturbam registry missing/nonpure para recusa antes do backend; fonte não equivale a PASS.
fixture/windows-process-query.ts|process|Broker/Node nativo, IPC e recibo de fechamento retêm controle dos helpers; implementação extensa lida por contrato/branches pertinentes.
fixtures/cassandra-dialer_test.go|process|Casos Go de socket bloqueado/deadline/cancel/CONNECT local; o proxy srt real é reservado ao caso hospedado específico.
fixtures/cassandra-dialer-linux_test.go|process|Caso Linux prepara Unix backlog esgotado/EAGAIN para dialer; limite de plataforma é parte da disposição.
fixtures/recordings/session-runner/openai-chat-streams-text.json|recording_fixture|Interação HTTP/SSE datada de Chat Completions com chunks/texto/usage; é replay armazenado, não provider pago chamado nesta produção.
godfile.test.ts|governance|Asserções do gate de tamanho/LOC e exceções de módulos em repos sintéticos; guard não foi executado sobre o produto atual.
lib/effect.ts|harness|Executaria efeitos scoped com logging de Cause, TestClock/live e skip contabilizado; biblioteca do harness não é serviço runtime de produto.
lib/rejection.ts|harness|Retorna motivo de rejeição e falha se promise resolver; evita espera nested-loop problemática comentada para Bun/Windows.
lib/sandbox-host.ts|process|Consulta jail disponível e trata AppContainer separadamente dos probes Node; não converte fallback/HOLD em enforcement universal.
lib/tool.ts|harness|Identidade general não Maestro e helpers de materialize/settle para testar recusa; não fornece identidade privilegiada real.
maestro-arsenal-package.test.ts|upstream|Fonte exige pacote Arsenal montado real, sem mock de validators/handlers; examina contrato de catálogo/profile/execute, sem executá-lo.
maestro-arsenal.test.ts|upstream|Compõe host DB/Location/registry e identidade Maestro/não-Maestro para permissões/execução; não transfere aceite do backend externo.
monolith-inventory-source.test.ts|governance|Asserções distinguem worktree de Git blobs e fingerprint/revision/tree; arquivo legado ausente difere de input inválido.
monolith-inventory.test.ts|governance|Casos de Bun/Cargo/assets/pins e erros de manifests para o scanner; censo não equivale a compreensão semântica do conteúdo.
omni.node-smoke.mjs|process|Smoke de loader Omni sob Node e um spawn requer addon/supervisor prontos; comando documentado não foi executado.
output-quarantine.test.ts|governance|Asserções preparam splits de padrões reconhecidos de segredo, tail limitado e Unicode; não demonstram redator universal de segredos.
preload.ts|harness|DB em memória, herança de credenciais desligada e modelos locais/fetch desativado; manter isolamento antes de qualquer teste autorizado.
process/process.test.ts|process|Casos de AppProcess para coleta/stream/erro/interrupção/lifetime usam harness e controles; resultados reais continuam não executados.
rename-guard.test.ts|governance|Guard repo-wide de nomes com exceções/strings protegidas em ledger; não dá autorização para reescrever frozen research ou evidência.
setup-bun-cache.test.ts|ci|Asserções de YAML/chaves/arquitetura e restore/save com hash fixo; GitHub é dono de hashFiles e job real continua ausente aqui.
shared-schema.test.ts|governance|Compara identidade de schemas canônicos/Core e construção/decodificação; não revisa semanticamente toda API ou cada export.
task-governance.test.ts|governance|Prepara TaskGovernance.allowAll/admit/settle em contexto controlado; não é permissão global para callers reais.
test-ci-request.test.ts|ci|Valida parser/seletores/runner/OS/controle e vínculo de nonce em workflow; não dispara CI nem cria recibo observado.
test-ci-upload.test.ts|ci|Examina base Git, parsing HTTP/run/ratelimit e paths de request em fixture; não executa gh nem envia trabalho remotamente aqui.
test-omni-control.test.ts|ci|Exercitaria preload de controle em diretório temporário com Omni.count substituindo spawn; native lanes precisam controles próprios reais.
upstream-arsenal.test.ts|upstream|Casos de operações de authoring/efeitos puros/autoridade no backend Arsenal; nome ou lista congelada não é prova de execução atual.
upstream-settlement-preservation.test.ts|upstream|Casos preparados de receipt/updater e preservação de metadata; comentário explicita prepared not executed e não substitui resultado real.
windows-process-query.hosted.ts|process|Fonte de prova hospedada exige CI, runtime Node real e lifecycle/identidade; não foi executada no host local.'''
tests={}
for line in test_data.splitlines():
    p,g,reason=line.split('|',2);tests[p]=(g,reason)
assert len(tests)==80,len(tests)
maintenance={
 'actions':'Rever fixture e decoder/transporte/queue juntos quando argv, resposta, gate ou binding mudar; owner de comportamento S1-03.',
 'capability':'Rever com dono S1-02 quando policy, ownership, conexão, disclosure ou settlement mudar; preservar partes reais e substituições declaradas.',
 'capability_schedule':'Rever S1-03 schedule e contrato S1-02; execução/completion exige evidência S1-01, pois runner está substituído.',
 'distribution':'Rever produtores/parsers/workflows de distribuição com dono de runtime S4; não reclassificar log sintético como native receipt.',
 'process':'Rever contrato de processo/plataforma com S1-01/S1-02/S4 conforme o caminho; conservar nonce, lifetime, limites e controles positivos.',
 'harness':'Rever junto aos callers do harness, mantendo scope, cleanup, identidade de serviços e isolamento; não introduzir API produtiva por export de teste.',
 'protocol_fixture':'Rever quando framing, método, retry, cleanup ou versão de protocolo mudar; fixture local não assegura compatibilidade ao vivo.',
 'package_fixture':'Rever junto ao gerador/loader/registry consumidor, mantendo bytes especiais e pins; nunca usar output de fixture como release do produto.',
 'binary_fixture':'Conservar bytes/hash e documentação do caso; reexaminar ou regenerar pelo produtor correto somente se a afirmação de alias/artefato mudar.',
 'recording_fixture':'Conservar identidade/formato/época do replay; mudança de contrato LLM/recorder deve ser reconciliada com S1-01/S1-05.',
 'governance':'Rever regra e caso de validação juntos com o dono do contrato; fonte de teste não substitui rodagem autorizada nem aceite de juiz.',
 'ci':'Rever request/seleção/workflow/recibo como cadeia; somente job real do candidato pode fornecer resultado CI.',
 'upstream':'Rever host S1-02 e dono do Arsenal/engine; manter perturbação controlada e backend real distinguíveis, sem apropriar garantia externa.',
 'jobs':'Rever com S1-01 a semântica de jobs/scope; metadata não durável não autoriza alegação de retomada pós-crash.',
}
fully_read_support={'test/preload.ts','test/fixture/omni-expect.ts','test/fixture/omni-effect.ts','test/lib/effect.ts','test/lib/rejection.ts','test/lib/sandbox-host.ts','test/lib/tool.ts','test/fixture/tmpdir.ts','test/fixture/actions-transport.ts','test/fixture/capability-schedule.ts','test/fixture/mcp-session-recovery.ts','test/fixtures/recordings/session-runner/openai-chat-streams-text.json'}
result=[]
for x in rows:
    p=x['path'];c=caps[p]
    if x['legacy_artifact_key']=='s1.core.boundaries':
        art='s1.core.boundaries';need='component';owner='S1-03'
        if p.startswith('packages/core/src/'):
            role,reason,owners=boundary[p.removeprefix('packages/core/src/')]
            depth='decisive_full_source_read'
            maintenance_text='Reler a folha completa quando identidade, ordem, autoridade, erro ou persistência mudar; limitar engine/caller ao dono nomeado: '+owners+'.'
        else:
            role='prepared_boundary_test';reason=boundary_tests[p.removeprefix('packages/core/test/')]
            depth='targeted_test_contract_read' if not p.endswith('/relay-commands.test.ts') else 'full_test_source_read'
            maintenance_text='Reler asserções e fixture junto da implementação alterada; só execução autorizada com candidato/caso identifica resultado.'
    else:
        art='s1.subslice03.support';need='entry';owner='S1-03'
        if p in docs:
            depth,reason=docs[p];role='historical_context' if x['family']=='architecture-history' else 'documentation_context'
            maintenance_text='Preservar época/candidato/intenção; reconciliar com implementação atual antes de promover a claim ou instrução operacional.'
        elif p.startswith('packages/core/test/'):
            rel=p.removeprefix('packages/core/test/');group,reason=tests[rel]
            role=group;maintenance_text=maintenance[group]
            if group=='binary_fixture':depth='binary_metadata_strings_or_archive_read'
            elif 'test/'+rel in fully_read_support:depth='support_source_full_read'
            else:depth='support_targeted_structure_contract_read'
        else:
            depth,reason=package[p.removeprefix('packages/core/')];role='package_support'
            maintenance_text='Manter a origem/gerador/pin real documentado; alterações produtivas cabem ao dono e foram excluídas desta produção.'
    ex=[{'id':z['id'],'first_line':z['first_line'],'last_line':z['last_line']} for z in eindex if z['path']==p]
    result.append({
      'path':p,'commit':c['commit'],'git_blob_sha':c['git_blob_sha'],'sha256':c['sha256'],'bytes':c['byte_length'],
      'legacy_artifact_key':x['legacy_artifact_key'],'family':x['family'],'kind':x['kind'],'owner':owner,
      'read_depth':depth,'role':role,'need':need,'artifact':art,
      'serves_needs':['component','flow','ownership','evidence'] if need=='component' else ['entry','maintenance','evidence'],
      'disposition':'included_l1_candidate_with_stated_limits','reason':reason,'maintenance_trigger':maintenance_text,
      'evidence':ex,'capture_path':c['capture_path'],'execution_status':'NOT_RUN','semantic_acceptance':'PENDING_INDEPENDENT_JUDGMENT',
      'read_depth_limit':'Leitura integral da folha de implementação, sem execução ou transferência de garantia externa.' if depth=='decisive_full_source_read' else 'Profundidade declarada do path; agrupamento ou leitura estrutural não significa revisão semântica integral nem PASS.'
    })
assert len(result)==128 and len({x['path'] for x in result})==128
assert Counter(x['legacy_artifact_key'] for x in result)==Counter({'s1.core.boundaries':24,'s1.core.entry':104})
assert set(assigned['path'] for assigned in rows)==set(x['path'] for x in result)
(OUT/'coverage.jsonl').write_text(''.join(json.dumps(x,ensure_ascii=False,separators=(',',':'))+'\n' for x in result))
summary={'paths':len(result),'artifact_counts':dict(Counter(x['artifact'] for x in result)),'family_counts':dict(Counter(x['family'] for x in result)),'read_depth_counts':dict(Counter(x['read_depth'] for x in result)),'role_counts':dict(Counter(x['role'] for x in result)),'no_local_tests':True,'no_product_mutations':True}
(OUT/'records/coverage-summary.json').write_text(json.dumps(summary,ensure_ascii=False,indent=2)+'\n')
print(json.dumps(summary,ensure_ascii=False))
