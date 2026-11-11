from pathlib import Path
from collections import Counter, defaultdict
import hashlib, json

ROOT = Path('/workspace/scratch/2b46fb541868/genesis-s1')
BASE = ROOT / 'producers/a'
OUT = ROOT / 'revisions/a-l1-evidence-v1'
PIN = '1cde2ff7a71bcf7aecb5d030917b577165135d38'

def read(name):
    return json.loads((BASE / name).read_text())

def sha(data):
    return hashlib.sha256(data).hexdigest()

def binding(name):
    data = (BASE / name).read_bytes()
    return {'path': 'producers/a/' + name, 'sha256': sha(data), 'byte_length': len(data)}

def dump(name, value):
    (OUT / name).write_text(json.dumps(value, ensure_ascii=False, indent=2) + '\n')

COVERAGE = read('coverage.json')
FAMILIES = read('family-disposition.json')
ARTIFACTS = read('artifacts.json')
CAPTURES = read('capture-manifest.json')
BY_PATH = {e['path']: e for e in COVERAGE['entries']}
BY_SOURCE = {e['path']: e for e in CAPTURES['sources']}

# Authored only in this evidence revision. These are bounded explanations of
# existing facts/gaps, never retroactive changes to frozen classifications.
FAMILY_NOTES = {
 'actions': ('O facade e o ledger observados separam binding tardio, preparo, envio e reconciliação de resultado; isso permite localizar a autoridade de uma operação sem prometer seu resultado remoto.', 'Os 80 leaves de implementação não lidos incluem authoring, transportes, GitHub/GitLab, recursos e readback. A semântica do comando ou a reconciliação de um provedor exige os seus leaves; o ledger comum não os valida.'),
 'agent': ('A seleção de agente e o fallback deny-all estão observados em agent.ts. O guia de agentes é somente orientação capturada no congelado.', 'Prompts empacotados, composição do agente e o guia não são automaticamente instruções de runtime aceitas. Mudança de agente, seleção ou prompt exige ler os membros exatos e seu carregamento.'),
 'architecture-history': ('Os nove planos/qualificações estão retidos por caminho e blob como história; nenhum deles foi lido individualmente e nenhum PASS histórico foi transportado.', 'Reivindicar um requisito de checkpoint/snapshot, encerramento de runtime ou migração desses planos exige ler o documento e confrontar implementação e versão. A disposição não prova reconciliação histórica já realizada.'),
 'atlas': ('atlas.ts sustenta a fronteira síncrona do adapter, erros unavailable e mineração legada de candidatos; não sustenta o motor Atlas.', 'Importação/publicação, validade, governança e recuperação do motor dependem das fontes do boundary/módulo e provas próprias. Não podem herdar aceitação deste adapter.'),
 'backend-toolkit': ('O entry e README sustentam aquisição por pin, piso do host, readiness composto e ownership dos packs/gerados.', 'Os manifests, downloaders, adapters, pins e gerador não foram validados como um conjunto funcional. Um engine ou alteração de pin exige esses inputs e qualificação autorizada do alvo; um marcador não basta.'),
 'board': ('decision.ts sustenta a linhagem de substituição de respostas e o registro de outcomes. tools.ts está capturado como orientação, sem aceite amplo no congelado.', 'Issue/epic automation, tarefas, guards de outras operações e contratos de resposta não são consequência da linhagem de decisão. Seus 23 leaves não lidos e tools.ts continuam leituras obrigatórias para esses usos.'),
 'capability': ('Frames emitidos, revalidação persistida e commit de permits sustentam a fronteira de autoridade nativa. Registro de nomes não prova comportamento de cada leaf.', 'Os 89 leaves não lidos retêm obrigações de compartilhamento, conteúdo, vendor schemas, processos e demais operações. O README de MCP sustenta intenção normativa; prova da implementação de limites do transporte requer seu código.'),
 'config': ('Loader, trust e contraste com o spec sustentam precedência, snapshot de projeto, refresh global e impossibilidade de autoconfiança do projeto.', '41 implementações não lidas incluem migrações de formato e políticas/consumidores. Presença no schema não prova aplicação por consumidor; a alteração de campo/política precisa de seu caminho real.'),
 'control-plane': ('MoveSession sustenta ordem de transferência, evento e limpeza e o limite de atomicidade; não cria coordenação de runner por si.', 'O outro leaf substantivo e o caller da operação continuam obrigatórios para provar quiescência e efeitos da movimentação. Não se infere rollback de arquivos/eventos.'),
 'database': ('Engine e README sustentam journal, transações immediate, backup, recusa de identidade desconhecida e contrato de usuário dos gerados/migrações.', '72 migrações históricas, dois gerados e seis implementações não lidas não são descartáveis. Mudança de schema/upgrade/restauração exige os predecessors e drivers pertinentes; o engine genérico não prova cada transformação de dados.'),
 'documentation': ('api.html, schema-changelog.md e todo.md estão identificados como documentação não lida; nenhuma route ou feature foi inferida de seus títulos.', 'Uma exigência de API, compatibilidade ou pendência baseada nesses documentos precisa de leitura e confronto com Schema/Protocol/Server. Não há autoridade comportamental própria demonstrada aqui.'),
 'economy': ('admission.ts sustenta identidade selada, reserva, terminus, settlement e separação de evidências econômicas.', 'executor.ts e sql.ts não foram lidos. Enforcamento em todos os emissores/providers, recuperação real e cobertura do executor permanecem sem prova; não podem ser promovidos por existência do ledger.'),
 'event': ('event.ts e seal.ts sustentam transação, replay, diferenças de persistência/notificação e integridade limitada por janela.', 'Os outros três leaves não lidos e drivers devem ser lidos para mudar seu comportamento. Replay não prova ownership de execução, autenticação ou compatibilidade irrestrita de schemas.'),
 'identity': ('credential/cipher/integration sustentam armazenamento, fallback, herança e ciclo de conexão observado.', 'Account, integração específica, OAuth page, share e credential SQL permanecem leaves próprios. Criptografia do valor não prova todo fluxo de login nem que todo segredo passa pela mesma proteção.'),
 'instruction': ('skill.ts sustenta nomes reservados, descoberta, permissões e invalidação do cache. O consumo de instruções tem evidência separada em context.', 'O documento não lido e os oito leaves não lidos retêm obrigações de autoria/carga/visibilidade. Texto de skill não se torna autoridade executável por registro.'),
 'location': ('Mutation e composição/mapa de serviços sustentam a identidade física/lógica e a escolha do grafo por Location.', 'location.ts não foi lido. O contrato de representação ou novas variantes de Location exigem esse leaf; configuração e runtime consultam fontes desta família embora a rota de inventário principal seja project.'),
 'package': ('README e package.json sustentam limites de dependência e exports explícitos; o número de exports é uma observação do manifesto.', 'Schema gerado, scripts, configuração de build e tarball/README vendor não têm semântica lida. Mudança de export, geração, licença ou upstream exige esses inputs e seu contrato; contar exports não valida cada API.'),
 'permission': ('O serviço e question.ts, junto ao skill de uso, sustentam avaliação, pending maps e o conflito preservado entre rejeição individual descrita e fan-out implementado.', 'Os dois leaves não lidos e o guia somente orientado permanecem necessários para seus detalhes. A diferença Session rules/materialization versus configured impede afirmar enforcamento universal sem rastrear o leaf.'),
 'plugin-host': ('Plugin e README, com State de runtime, sustentam escopos, rebuild, rollback local e limites de ciclo/batch.', 'Doze implementações, documento e suporte não lidos incluem fronteiras SDK/host e carregamento. Ativação em memória não prova durability, compatibilidade de cada plugin ou ordem global atômica.'),
 'process': ('AppProcess, Omni, PTY e skill de manutenção sustentam captura opcional, seleção de backend, ambiente exato e limites de retenção.', '26 leaves e seis documentos não lidos não herdam qualificação de OS/native. Backpressure de cliente WebSocket não leitor continua limite expresso; bounded ring não resolve a fila externa.'),
 'project': ('Project, membership, paths, checkpoint e FileSystem sustentam identidade e acesso; format pertence também ao consumo runtime.', 'Git mutation, caches, estratégias de cópia, snapshots/revert e demais 26 leaves exigem leitura para alteração/operação específica. Digest de checkpoint não prova restauração ou validade semântica.'),
 'provider': ('Catalog/model/provider/AISDK sustentam seleção e fronteira; o adapter de sessão é fonte adicional da família session.', '36 implementações, 25 bytes vendor e dois documentos não lidos não são aceitos como providers operacionais. Auth, protocolos, preços e compatibilidade vendor precisam de evidência específica; catálogo não faz ping.'),
 'rag-studio': ('O único membro atribuído é o schema SQL, lido: sua presença estabelece tabelas, não retrieval.', 'Embedding, busca e pipelines pertencem ao módulo responsável e não foram demonstrados. Ausência de coluna nesse schema não prova ausência de qualquer outro armazenamento no produto.'),
 'relay': ('O adapter sustenta gravação de verdict, recuperação local conservadora e recusa do evaluator genérico em workflows vinculados.', 'Nove leaves não lidos e o engine externo não têm aceite derivado. Hooks, workflows, gates reais e locks de outros hosts exigem suas fontes e evidências; passagem não gravada não vira PASS.'),
 'research': ('ResearchToolkit e Ledger sustentam caps, adapter vazio padrão, status best effort e identidade/replay da evidência.', '38 leaves e três inputs não lidos retêm validação de documentos, índices, parsers e sandbox builds. Planejamento que falhou e virou lista vazia não comprova cobertura; conteúdo admitido não comprova sua verdade.'),
 'runtime': ('Host, app-node, Global, State, instalação e OTLP sustentam composição e observação condicional dos serviços.', '18 leaves não lidos e implementações de backend/exporter externas precisam de leitura para usos específicos. Instalação latest com fallback não comprova frescor remoto; endpoint configurado não comprova exportação.'),
 'scheduled-task': ('Scheduler e port sustentam claims de dispatch, admissão por Session e separação do host; o lease não é ownership da execução de Session.', 'Cinco leaves não lidos incluem detalhes de SQL/cadência. Alterá-los exige leitura; a race revogação→admissão permanece observada e started não prova completion.'),
 'session': ('Quatorze leituras decisivas distribuem admissão, execução, contexto, persistência e seleção de modelo por cinco artefatos. Os usos cruzados são explícitos no mapa.', '36 leaves não lidos, três orientações e um suporte não autorizam feature census completo. Attachments, snapshot/revert, engine internals e demais operações precisam de leitura quando o requisito depende deles; não há recuperação distribuída demonstrada.'),
 'system-context': ('Os quatro membros de implementação atribuídos estão lidos e sustentam álgebra, registry, built-ins e instruction-context; sete testes são inventário, não resultados.', 'Fontes de contexto dos domínios externos, substituições de Continuity e qualidade de summaries ficam fora da prova dessas quatro implementações. Tests não executados não fecham o risco de runtime.'),
 'tool': ('Tool/registry/output e folhas representativas sustentam identidade, settlement, permissões locais, output e o contraste do read. MCP/LSP/terminal são usados por outros artefatos.', '53 leaves não lidos, orientação do spec, docs e suporte não validam cada ferramenta. Lean/attestation, outras mutações, parsing e payloads devem ser lidos antes de prometer esse comportamento; caminhos de output continuam expostos.'),
 'tool-safety': ('Safety e sandbox sustentam checks, scrub heurístico, wrapper e recusa/fallback condicionais; bash é evidência da chamada após permissões.', 'Doze leaves não lidos de perfis/backends/recognizers retêm obrigações específicas. Confinamento efetivo e completude de reconhecimento de segredo exigem qualificação; wrapper descoberto não equivale a processo confinado observado.'),
 'util': ('Nenhuma das 25 implementações de util foi lida: o agrupamento vincula consumidores/runtime e conserva o conjunto, sem autoridade semântica própria.', 'Hash, retry, timeout, locks, physical-path, image/npm e demais helpers exigem leitura antes de serem premissas de uma afirmação. Se um caso obrigatório L1 depende de sua semântica, a lacuna permanece obrigatória agora, não opcionalmente adiada.'),
 'validation-support': ('Os 80 fixtures/harnesses/testes transversais estão individualmente identificados e agrupados como inventário de validação.', 'A existência desses membros não produz teste executado nem garantia de regressão. Caso/gate pertinente exige selecionar e ler o teste/harness e obter execução autorizada no candidato correto.'),
}

KEY_NOTES = {
 'session-admission': ('Identidade de Session, retry e separação admitido/promovido.', 'Alteração de admissão/retry deve conservar identidade, delivery, proveniência histórica e transação; corrida/crash requer evidência runtime autorizada.', 'Explicação ou manutenção de admit-only/steer/queue pode usar a fronteira; garantias concorrentes ou HTTP ponta a ponta ficam bloqueadas sem as provas correspondentes.'),
 'session-execution': ('Ownership local, routing por Location e limites de continuação/interrupção.', 'Host adapter, anexos e estados de recuperação específicos exigem leitura; multi-node e post-crash provider continuation não são capacidades implementadas pelo coordenador.', 'L2/L3 podem descrever limites locais após aceite; um dependente que prometa cluster lease, retomada durável ou exactly-once de efeito externo fica bloqueado.'),
 'persistence': ('Transação de evento/projeção, replay e contrato de migração.', 'Mudança de dados exige migrações/predecessors/drivers pertinentes; mudança de versão de evento exige tratar o TODO de registro type+version.', 'Compatibilidade de upgrade/restauração, autenticação de seals e replay arbitrário não podem ser liberados por esse L1 genérico.'),
 'context': ('Retenção de observação indisponível, epoch e seleção de histórico.', 'Mudança de produtor externo/Continuity exige sua fonte; qualidade de summary e token estimates exigem medição quando reivindicadas.', 'Dependentes de freshness global, remoção por falha de leitura ou qualidade semântica de compactação ficam bloqueados sem evidência própria.'),
 'tools': ('Representação canônica, identidade capturada, settlement e limites de output.', 'Outra folha, Lean, output/atestado e plataforma de mutação exigem leitura; os designs futuros do AGENTS não são comportamento disponível.', 'Claims sobre cada tool, rollback multi-file, input validation dinâmica ou cap total de mídia ficam bloqueados; a fronteira de registry não os prova.'),
 'security': ('Permissões, regra da Session por caminho, sandbox condicional e segredos.', 'Rastrear o leaf antes de afirmar aplicação de Session rules; manter conflitos com docs; backend/OS e secret recognition precisam de prova específica.', 'Enforcamento universal, sandbox universal, proteção keychain universal e rejeição individual uniforme permanecem bloqueados.'),
 'configuration': ('Precedência, trust e lifetime de Location.', 'Ler migração legada e consumidor de política/campo antes de alterar; reload/eviction/trust transition não foram exercitados.', 'Dependente de configuração de projeto live ou de aplicação universal do schema fica bloqueado até seu fluxo real ser demonstrado.'),
 'project': ('Identidade de projeto, resolução física de caminho e checkpoint retido.', 'Git/cópia/cache/snapshot/revert e paths específicos exigem folhas; restauração precisa de prova própria, além do digest.', 'Garantias de restauração, APIs históricas atuais ou qualquer mutação Git genérica não ficam liberadas por identidade/path comuns.'),
 'extensions': ('Lifecycle in-memory de State/plugin/integration/MCP/skills.', 'Ler provider/plugin/OAuth específico e obter evidência de operação quando necessária; tentativas OAuth/ativação não sobrevivem por contrato ao processo.', 'Resumabilidade durável, disponibilidade live de MCP e compatibilidade de todo plugin ficam bloqueadas.'),
 'capability': ('Frame emitido, autorização persistida e commit de permit nativo.', 'Ler a operação e vendor exatos; o README MCP é contrato normativo e não prova código de limites/qualificação executada.', 'Uso remoto que conclua nonexecution após abort ou autoridade inferida do JSON/registro fica bloqueado; semântica de cada leaf permanece obrigatória.'),
 'automation': ('Estados distintos de Actions, dispatch admitido e linhagem de Board.', 'Provider commands/readback, cadence/SQL e workflows Board restantes exigem seus leaves; a race de revogação não está resolvida.', 'Conclusão de workflow/Session, remoção de ambiguidade externa e limite repeat estrito não podem ser derivados de prepared/started/recorded.'),
 'research': ('Acquisition/readiness e identidade de pesquisa retida.', 'Ler manifests/adapters/validators antes de usar algoritmos específicos; no-work após erro e adapter vazio não comprovam índice.', 'Cobertura completa, qualidade de fonte, build de índice e prontidão do host permanecem bloqueados sem evidência desses mecanismos.'),
 'runtime': ('Composição e limites condicionais de processos/PTY/serviços.', 'Ler adapter de OS/Omni/LSP/format/exporter pertinente e exigir prova do backend usado; slow-client memory permanece limite aberto.', 'Confinamento, memória/output universalmente limitados, backpressure e disponibilidade de atualização/telemetria ficam bloqueados sem prova específica.'),
 'models': ('Catálogo versus disponibilidade declarada e adapter nativo estreito.', 'Ler provider/vendor/transport exactos e confrontar preços/auth; protocolo live não foi executado.', 'Compatibilidade de todos os SDKs com Session, billing verificado e sucesso de provider não são liberados por presença no catálogo.'),
 'economy': ('Reserva, terminus e settlement como evidências diferentes.', 'Executor e SQL não lidos permanecem necessários para integração/enforcamento; custos desta produção continuam UNKNOWN.', 'Cobertura econômica universal, reembolso por rejeição semântica e receipt de custo da conversa ficam bloqueados.'),
 'boundaries': ('Adapters Core para engines externos, MoveSession e schema RAG.', 'Ler boundary/módulo/caller e folhas de workflow; a coordenação ativa e rollback cruzado não estão provados pelo MoveSession.', 'Publicação Atlas, governança Relay, quiescência atômica ou retrieval real ficam bloqueados sem fontes/provas do dono correspondente.'),
 'entry': ('Entrada comum, autoridade e disposição integral do inventário.', 'Aceite semântico independente, L2–L4, consumo e runtime/publicação pertencem à fila real da principal; documentos e helpers não lidos não desaparecem.', 'Nenhum dependente de camada seguinte é liberado pela contagem/hash. Esta revisão não transforma o pacote em S1 completo nem altera validity congelada.'),
}

member_fields = {'path', 'git_blob_sha', 'byte_length_from_population', 'captured_source'}
groups_by_signature = {}
for row in COVERAGE['entries']:
    classification = {k:v for k,v in row.items() if k not in member_fields}
    signature = json.dumps(classification, ensure_ascii=False, sort_keys=True)
    group = groups_by_signature.setdefault(signature, {'classification': classification, 'members': []})
    group['members'].append({k:v for k,v in row.items() if k in member_fields})
groups = sorted(groups_by_signature.values(), key=lambda g: (g['classification']['family'], g['classification']['proposed_artifact_key'], g['classification']['depth'], g['members'][0]['path']))
reasons = sorted({r['justification'] for r in COVERAGE['entries']})
reason_ids = {reason:f'R{i:03d}' for i,reason in enumerate(reasons,1)}
for i,g in enumerate(groups,1):
    g['id'] = f'G{i:03d}'
    g['count'] = len(g['members'])
    g['reason_id'] = reason_ids[g['classification']['justification']]

roundtrip = []
for g in groups:
    roundtrip += [{**g['classification'], **m} for m in g['members']]
assert sorted(roundtrip,key=lambda x:x['path']) == sorted(COVERAGE['entries'],key=lambda x:x['path'])
assert len(roundtrip) == 1441 and len({x['path'] for x in roundtrip}) == 1441

families = []
for original in FAMILIES['families']:
    name = original['family']; rows = [r for r in COVERAGE['entries'] if r['family']==name]
    family_sources = {r['path'] for r in rows}
    actual_using = sorted(a['key'] for a in ARTIFACTS['artifacts'] if any(s['path'] in family_sources for s in a['source_refs']))
    families.append({
        'original_record': original,
        'derived_counts': { 'by_depth':dict(sorted(Counter(r['depth'] for r in rows).items())), 'by_read_status':dict(sorted(Counter(r['source_read_status'] for r in rows).items())), 'unread_substantive_count':len(original['unread_substantive_paths']) },
        'coverage_group_ids':[g['id'] for g in groups if g['classification']['family']==name],
        'artifacts_actually_citing_family_sources':actual_using,
        'clarification_authored_in_this_revision': {'supported_boundary':FAMILY_NOTES[name][0], 'mandatory_remaining_boundary':FAMILY_NOTES[name][1], 'semantic_acceptance':False},
    })

artifact_projection = []
for original in ARTIFACTS['artifacts']:
    key=original['key']; rows=[r for r in COVERAGE['entries'] if r['proposed_artifact_key']==key]
    body=(BASE/original['body']['path']).read_bytes()
    assert sha(body)==original['body']['sha256']
    suffix=key.removeprefix('s1.core.'); note=KEY_NOTES[suffix]
    artifact_projection.append({
        'original_artifact':original,
        'derived_population_routing': {'count':len(rows),'families':sorted({r['family'] for r in rows}), 'by_depth':dict(sorted(Counter(r['depth'] for r in rows).items())), 'by_read_status':dict(sorted(Counter(r['source_read_status'] for r in rows).items())), 'coverage_group_ids':[g['id'] for g in groups if g['classification']['proposed_artifact_key']==key]},
        'source_reference_families':sorted({BY_PATH[s['path']]['family'] if s['path'] in BY_PATH else 'root-authority-outside-assigned-population' for s in original['source_refs']}),
        'clarification_authored_in_this_revision': {'need_boundary':note[0], 'mandatory_followup':note[1], 'blocked_dependent_claims':note[2], 'registered_dependent_artifact_keys':None, 'note':'No L2–L4 dependent keys or new build edges are invented. These are use restrictions derived from existing bodies/gaps, not a retroactive validity change.'},
    })

projection={
 'schema':'genesis-l1-evidence-projection/v1','revision':'a-l1-evidence-v1','scope':'orchestra.s1','producer_task':'S1-L1-A','source_revision':PIN,
 'base_dossier':{'path_as_provided_by_principal':'output/producers/a/review-dossier.md','sha256_as_provided_by_principal':'cf7676f527067c7b2aa3fc4bd0d4629e8fa2afa5b843ddc70f857dacc0abffbc','content_read_by_producer':False,'hash_locally_verified':False},
 'frozen_inputs':[binding(n) for n in ['coverage.json','family-disposition.json','artifacts.json','capture-manifest.json','excerpt-map.json','review-evidence-compact.md','population.json']],
 'projection_authority':'Original records/fields are exact JSON value projections. Counts/joins are deterministic derived views. The separately labeled clarifications were authored in this revision and do not alter frozen classifications or confer semantic acceptance.',
 'original_coverage_header':{k:v for k,v in COVERAGE.items() if k!='entries'},
 'original_need_roots':ARTIFACTS['roots'],
 'coverage_groups':groups,
 'reason_dictionary':[{'id':reason_ids[r],'exact_original_justification':r,'count':sum(x['justification']==r for x in COVERAGE['entries'])} for r in reasons],
 'families':families,
 'artifacts':artifact_projection,
 'reconciliation':{'assigned_entries':len(roundtrip),'unique_paths':len({x['path'] for x in roundtrip}),'exact_roundtrip_to_original_coverage':True,'all_original_family_records_preserved':True,'all_original_artifact_records_preserved':True,'artifact_count':len(artifact_projection),'need_ledger_extra':False,'semantic_acceptance':False},
}
dump('coverage-needs-projection.json',projection)

lines=['# Complemento de evidência L1 A — população, necessidades e dependentes', '',
 '**Identidade:** `a-l1-evidence-v1`; scope `orchestra.s1`; fonte `'+PIN+'`.', '',
 'Esta é uma projeção do candidato L1 congelado, não uma revisão dos seus corpos. Todos os campos originais `need`, `gaps`, `input_keys`, `validity`, `build_dependencies`, classificações e razões permanecem exatamente preservados no JSON acompanhante. As explicações de fronteira e uso bloqueado abaixo foram escritas nesta revisão e são identificadas como tal. Não constituem aceite semântico, criação de L2–L4 ou recategorização retroativa.', '',
 'O dossiê da principal foi informado como `output/producers/a/review-dossier.md`, SHA256 `cf7676f527067c7b2aa3fc4bd0d4629e8fa2afa5b843ddc70f857dacc0abffbc`. Seu conteúdo não foi lido e seu hash não foi verificado por este produtor; as projeções usam diretamente os próprios arquivos congelados. Nenhum oracle foi acessado.', '',
 '## O que as 1.340 entradas não lidas significam', '',
 'A reconciliação exata cobre 1.441 caminhos: 94 leituras decisivas no registro congelado, sete capturas de orientação e 1.340 entradas não lidas. As 599 implementações substantivas não lidas continuam fora da autoridade de afirmações específicas. As outras 741 entradas têm disposição agrupada de validação, história, documentação, gerados, vendor ou suporte. Essa disposição explica por que não se exigiu uma narrativa por arquivo no L1; ela não substitui leitura quando o conteúdo é premissa de uma necessidade obrigatória.', '',
 '| Profundidade original das entradas não lidas | Quantidade | Alcance e obrigação preservada |', '| --- | ---: | --- |']
depth_explanations={
 'representative_family_boundary':'Fronteira/coordenador lido; sem aceite da implementação de cada leaf. Ler o leaf e seus contratos antes de afirmação ou mudança que dependa dele.',
 'grouped_validation_inventory':'Inventário de testes, fixtures e suporte; nenhum resultado executado. Selecionar fontes e gate pertinente quando a afirmação exigir validação.',
 'grouped_history_contract':'Migração histórica retida como contrato de dados. Mudança/upgrade exige leitura da transformação e predecessors afetados.',
 'grouped_vendor_boundary':'Autoridade upstream distinta; host boundary não valida internals. Ler contrato/vendor/licença/update quando pertinente.',
 'grouped_documentation_disposition':'Documento/história retido; sem inferir implementação ou qualificação por título. Ler e confrontar fonte quando usado como requisito.',
 'grouped_support_contract':'Prompt/pin/script/asset/configuração é input sensível a mudança, não suporte descartável. Ler quando seu conteúdo ou geração afeta a necessidade.',
 'grouped_generated_contract':'Arquivo gerado retido e ligado ao dono/gerador. Fonte geradora e comparação de bytes são exigidas em manutenção pertinente.',
}
unread=Counter(r['depth'] for r in COVERAGE['entries'] if r['source_read_status']=='not_read')
for depth in depth_explanations:
    lines.append(f'| `{depth}` | {unread[depth]} | {depth_explanations[depth]} |')
lines += ['', 'As sete orientações capturadas permanecem orientações no congelado: `docs/guides/agents.md`, `docs/guides/session-requests.md`, `docs/specs/v2/tools.md`, `packages/core/src/board/tools.ts`, `packages/core/src/session/README.md`, `packages/core/src/session/runner/execution-host.ts` e `packages/core/src/session/runner/index.ts`. Um trecho complementar eventualmente lido agora não apaga esse estado histórico.', '',
 '**Lacuna obrigatória:** se uma pergunta L1 exigida depende de um leaf não lido, a lacuna permanece aberta nesse ponto. Não se presume que o requisito possa ser adiado por conveniência. O mesmo vale para a família util, sem fonte própria lida, e para documentos históricos ainda não confrontados. A suficiência do conjunto continua sujeita aos dois juízes da principal.', '',
 '## Projeção exata das 17 necessidades', '',
 'As contagens abaixo são rotas de inventário pelo campo `proposed_artifact_key`, não quantidades de fontes exclusivas. Fontes compartilhadas podem sustentar vários artefatos: por exemplo, Location é roteada a project mas também citada por configuration; State é roteado a runtime mas citado por extensions. O JSON conserva esses dois relacionamentos separadamente.', '',
 '| Key | Need original | Validity original | Entradas roteadas | Decisivas / orientação / não lidas | Famílias roteadas |', '| --- | --- | --- | ---: | --- | --- |']
for ap in artifact_projection:
    a=ap['original_artifact']; d=ap['derived_population_routing']; counts=d['by_read_status']
    lines.append(f"| `{a['key']}` | `{a['need']}` | `{a['validity']}` | {d['count']} | {counts.get('semantically_read_decisive_ranges',0)} / {counts.get('captured_targeted_orientation_only',0)} / {counts.get('not_read',0)} | {', '.join(d['families'])} |")
lines += ['', 'Todos os 17 `build_dependencies` L1 originais são vazios. A revisão não inventa nomes de dependentes ou edges. `supported` é a validade declarada para as afirmações limitadas dos corpos; não equivale a PASS dos juízes, aceitação da camada, binding ou publicação. Os needs `ownership`, `maintenance` e `operational` não foram produzidos por este L1; as obrigações posteriores permanecem com a principal e não são renomeadas para aparentar completude.', '']
for ap in artifact_projection:
    a=ap['original_artifact']; d=ap['clarification_authored_in_this_revision']
    lines += [f"### `{a['key']}` — `{a['need']}`", '',
      f"Corpo congelado: `{a['body']['path']}`, SHA256 `{a['body']['sha256']}`. Validade original: `{a['validity']}`.", '',
      '**Gaps originais, verbatim:**', '']
    lines += ['- '+g for g in a['gaps']]
    lines += ['', '**Inputs originais:** '+', '.join('`'+k+'`' for k in a['input_keys'])+'.', '',
      '**Explicitação nova nesta revisão:** '+d['need_boundary']+' '+d['mandatory_followup'], '',
      '**Uso dependente bloqueado:** '+d['blocked_dependent_claims'], '']

lines += ['## Disposição semântica por família', '',
 'Cada seção preserva count, profundidades, read status e razão por IDs. O apêndice transcreve literalmente todas as 109 razões do congelado; cada grupo reversível e seus membros estão no JSON. As duas frases de alcance/obrigação por família são explicitação nova desta revisão, apoiada nas fontes dos corpos e nos trechos complementares, e não julgamento de suficiência.', '']
for fp in families:
    f=fp['original_record']; name=f['family']; dc=fp['derived_counts']; cs=fp['clarification_authored_in_this_revision']
    gset=[g for g in groups if g['classification']['family']==name]
    lines += [f"### {name} — {f['population_count']} entradas", '',
      '**Profundidades originais:** '+', '.join(f'`{k}`={v}' for k,v in dc['by_depth'].items())+'.', '',
      '**Read status original:** '+', '.join(f'`{k}`={v}' for k,v in dc['by_read_status'].items())+'.', '',
      '**Rota original:** '+', '.join('`'+k+'`' for k in f['artifact_keys'])+'. **Artefatos que de fato citam fontes da família:** '+(', '.join('`'+k+'`' for k in fp['artifacts_actually_citing_family_sources']) or 'nenhum')+'.', '',
      '**Fontes decisivas listadas no original:** '+(', '.join('`'+p+'`' for p in f['read_source_paths']) or 'nenhuma')+'.', '',
      '**Razões originais aplicáveis:** '+', '.join(sorted({g['reason_id'] for g in gset}))+'.', '',
      '**Alcance sustentado (explicitação):** '+cs['supported_boundary'], '',
      '**Obrigação/lacuna retida (explicitação):** '+cs['mandatory_remaining_boundary'], '']

lines += ['## Apêndice — razões originais exatas', '',
 'As razões abaixo são texto do `coverage.json` congelado. O número é sua frequência global; não é uma decisão de aceite. `coverage-needs-projection.json` preserva a ligação razão → grupo → cada caminho/blob, sem perda de campos.', '']
for r in projection['reason_dictionary']:
    lines += [f"**{r['id']} — {r['count']} entradas**", '', '> '+r['exact_original_justification'], '']
(OUT/'coverage-needs-projection.md').write_text('\n'.join(lines)+'\n')

dump('needs-and-blockers.json', {
    'schema':'genesis-l1-needs-projection/v1', 'revision':'a-l1-evidence-v1', 'source_revision':PIN,
    'original_artifacts_binding':binding('artifacts.json'),
    'original_roots':ARTIFACTS['roots'],
    'needs':[{
        'key':a['original_artifact']['key'], 'need':a['original_artifact']['need'],
        'validity':a['original_artifact']['validity'], 'gaps':a['original_artifact']['gaps'],
        'input_keys':a['original_artifact']['input_keys'], 'build_dependencies':a['original_artifact']['build_dependencies'],
        'body':a['original_artifact']['body'],
        'new_clarification_not_frozen_metadata':a['clarification_authored_in_this_revision']
    } for a in artifact_projection],
    'layer_release':{'observed_review_status':'not_read_by_this_revision','producer_has_authority_to_release_dependents':False,'status':'NO_RELEASE_BY_THIS_SUPPLEMENT','why':'The common protocol requires both independent reviews of the complete required layer before releasing its next-layer dependents. This evidence supplement does not invent or change those decisions.'},
})
print(json.dumps({'groups':len(groups),'reasons':len(reasons),'families':len(families),'artifacts':len(artifact_projection),'roundtrip':True,'unread_depth':dict(unread)},ensure_ascii=False))
