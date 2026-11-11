from pathlib import Path, PurePosixPath
import collections, hashlib, json

B=Path(__file__).resolve().parent
R=B.parents[1]
OUT=R/'out'
PREFIX='modules/atlas/docs/design/genesis-chatgpt-results/20261111-v3-fresh/s3/'
SOURCE='1cde2ff7a71bcf7aecb5d030917b577165135d38'
PROTOCOL='ee2521a5b966bd505cc95bd1c733e09e12f33531'
SCOPE='orchestra.s3.agents'
LIMIT=256000
NEEDS={'entry','ownership','maintenance','operational','flow','evidence','component'}
UNITS={'L1-A':('maestro',424),'L1-B':('relay',3700),'L1-C':('integrations',429)}

def digest(raw): return hashlib.sha256(raw).hexdigest()
def canonical(obj): return json.dumps(obj,ensure_ascii=False,sort_keys=True,separators=(',',':')).encode()
def read(path): return json.loads(path.read_text())
def save(name,value):
    path=B/name
    assert path.parent==B
    path.write_text(json.dumps(value,ensure_ascii=False,indent=2)+'\n')
def safe(path):
    p=PurePosixPath(path)
    assert not p.is_absolute() and path and all(x not in {'.','..','.git','.atlas'} for x in p.parts),path
    return path
def payload_ref(rel):
    p=OUT/rel
    assert p.is_file() and not p.is_symlink(),str(p)
    raw=p.read_bytes()
    return {'payload_path':PREFIX+safe(rel),'sha256':digest(raw)}
def metadata(rel):
    p=OUT/rel; raw=p.read_bytes()
    return {'path':str(p),'payload_path':PREFIX+rel,'byte_length':len(raw),'sha256':digest(raw)}

required=read(OUT/'evidence/required-artifacts.json')
required_keys=[x['key'] for x in required['required_artifacts']]
assert len(required_keys)==len(set(required_keys))==11 and required['scope']==SCOPE
future_by_need={'entry':'s3-l4-entry','ownership':'s3-l4-ownership','maintenance':'s3-l4-maintenance','operational':'s3-l4-operational','flow':'s3-l3-flows'}
source_registry={}
input_snapshot={}
coverage_refs={}
protocol_rows={}
artifacts=[]
map_rows=[]
oversized_inputs=[]
oversized_evidence=[]
membership_report={}
unit_report={}
historical_metadata=[]

known_gaps={
 'L1-A':[
  'Inspeção estática do produtor; sem execução de build, Session, Actions, Atlas ou consumidor instalado.',
  'O recibo preserva HOLD work-result-unavailable na decisão V2, divergências de Memory/standalone/compatibilidade e limites de plataforma, orçamento e dispatch; não foram corrigidos neste transporte.',
  'Classificação dos 424 membros não declara leitura individual de todos os conteúdos; a profundidade original está preservada.'
 ],
 'L1-B':[
  'Inspeção estática e metadados de corpus; nenhuma execução atual de Relay, CI, benchmark, judge/modelo ou integração instalada.',
  'O recibo preserva divergências entre drivers, contrato atual versus comentários históricos, limites de Python/LangGraph, profiles bloqueados e insuficiência de exit codes isolados.',
  'Goldens, fixtures e estudos mantêm classe, família e versão; 3.700 membros não equivalem a leitura individual nem juízo independente.'
 ],
 'L1-C':[
  'Inspeção estática; sem binário/login/chamada real Claude, Dock/desktop/AT-SPI, Janitor, pesquisa ou Atlas observados nesta produção.',
  'Qualificação de capability assets permanece pendente; receitas não provam engines prontos; não foi demonstrada composição ativa scanner Janitor→sink→UI.',
  'Conflitos documentais e evidências históricas mantêm origem e limites; 429 membros não equivalem a leitura individual de todas as folhas.'
 ]
}
base_members={
 'L1-A':['modules/maestro'],
 'L1-B':['modules/relay','specs/relay-langgraph'],
 'L1-C':['modules/specialists','modules/engine-adapters','modules/capability-assets','modules/app-dock','modules/janitor','packages/jimmy-specialist']
}

for unit,(slug,expected) in UNITS.items():
    receipt=f'receipts/{unit}'
    cov=read(OUT/receipt/'coverage.json')
    source_doc=read(OUT/receipt/'sources.json')
    source_rows=source_doc if isinstance(source_doc,list) else source_doc['sources']+source_doc.get('recipe_sources',[])
    population_rel=f'evidence/population-{unit[-1]}.json'
    population=read(OUT/population_rel)
    pop={x['path']:x for x in population}
    entries=cov['entries']
    assert len(population)==len(pop)==len(entries)==expected
    assert {x['path'] for x in entries}==set(pop)
    coverage_refs[unit]=payload_ref(f'{receipt}/coverage.json')
    body_rel=f'bodies/l1-{slug}.md'
    body=(OUT/body_rel).read_bytes()
    assert len(body)<=24000 and body.decode('utf-8')
    if unit=='L1-B': assert digest(body)=='369d2610ba4507a0950bd16cfce045dede276b67dee05f5d0086ef9ea503ffcb'
    if unit=='L1-C': assert digest(body)=='81685f16fb32aae6958671939413d121e4f5babaf01d3b9565b03a50f7842e8a'
    source_refs=[]
    seen_sources=set()
    source_sizes={}
    for s in source_rows:
        p=safe(s['path']); commit=s['commit']
        assert commit in {SOURCE,PROTOCOL}
        sr={k:s[k] for k in ['commit','path','git_blob_sha','sha256']}
        assert len(sr['git_blob_sha'])==40 and len(sr['sha256'])==64
        key=(commit,p)
        if key in source_registry: assert source_registry[key]==sr,key
        else: source_registry[key]=sr
        if key not in seen_sources: source_refs.append(sr);seen_sources.add(key)
        source_sizes[p]=s.get('byte_length')
        if commit==PROTOCOL and source_sizes[p] is None: source_sizes[p]=len((R/'protocol'/PurePosixPath(p).name).read_bytes())
        if source_sizes[p] is None and p in pop: source_sizes[p]=pop[p]['size']
        if source_sizes[p] is None:
            capture=s.get('capture_path_absolute',s.get('capture_local',s.get('capture_path')))
            assert capture and Path(capture).is_absolute() and Path(capture).is_file(),p
            source_sizes[p]=Path(capture).stat().st_size
        assert source_sizes[p] is not None,p
        if source_sizes[p]>LIMIT:
            oversized_inputs.append({'artifact_key':f's3-l1-{slug}','input_key':'file:'+p,'byte_length':source_sizes[p],'sha256':s['sha256'],'role':'captured semantic or integrity source; original inspection flags retained','disposition':'retained as real observer limitation; no runtime version invented'})
        if commit==PROTOCOL:
            protocol_rows[p]=sr
            if s.get('provided_local_matches') is False:
                historical_metadata.append({'unit':unit,'path':p,'captured_sha256':s['sha256'],'original_provided_local_sha256':s.get('provided_local_sha256'),'disposition':'original producer discrepancy retained; canonical captured source selected'})
    assert len([x for x in source_refs if x['commit']==PROTOCOL])==5
    source_refs.sort(key=lambda x:(x['commit'],x['path']))
    file_inputs=set(pop)|{x['path'] for x in source_refs}
    local_receipts=['request.md','response.md','sources.json','coverage.json','findings.md','review-evidence.md','verification.json']
    recipe_deltas=sorted([p.name for p in (OUT/receipt).glob('request-delta-*.md')]+[p.name for p in (OUT/receipt).glob('root-finding-delta-*.md')])
    local_receipts.extend(recipe_deltas)
    supplemental_evidence=[f for f in ['body-v1.md','response-v1.md','verification-v1.json','body-v2.md','response-v2.md','verification-v2.json','body-delta-002.diff','finding-delta-002.md','delta-validation-002.json','artifact-hashes-v2.json','v1/response.md','v1/verification.json','v1/findings.md','v2/response.md','v2/verification.json','v2/findings.md'] if (OUT/receipt/f).exists()]
    local_receipts.extend(supplemental_evidence)
    payload_evidence=[population_rel,'evidence/required-artifacts.json']+[f'{receipt}/{f}' for f in local_receipts]
    payload_inputs=['evidence/required-artifacts.json',f'{receipt}/request.md']+[f'{receipt}/{f}' for f in recipe_deltas]
    for rel in payload_evidence:
        info=metadata(rel);input_snapshot[rel]=info
        full=info['payload_path']
        if rel in payload_inputs: file_inputs.add(full)
        if info['byte_length']>LIMIT:
            risk={'artifact_key':f's3-l1-{slug}','payload_path':full,'byte_length':info['byte_length'],'sha256':info['sha256'],'role':'frozen-population' if rel==population_rel else 'preserved-final-receipt','disposition':'exact evidence retained; files plus directory membership carry source invalidation; if observed as one file later, the 256.000-byte refusal remains'}
            oversized_evidence.append(risk)
            if rel in payload_inputs: oversized_inputs.append({**risk,'input_key':'file:'+full})
    input_snapshot[body_rel]=metadata(body_rel)
    members=set(base_members[unit])
    for p in set(pop)|{x['path'] for x in source_refs}:
        if '/' not in p: continue
        if p.startswith('.orchestra/skills/'): directory='/'.join(p.split('/')[:3])
        elif p.startswith('docs/specs/'): directory='/'.join(p.split('/')[:3])
        elif p.startswith('docs/guides/'): directory='docs/guides'
        elif p.startswith('docs/architecture/phase-plans/'): directory='docs/architecture/phase-plans'
        else: directory=str(PurePosixPath(p).parent)
        members.add(directory)
    # Preserve broad component roots so a newly added subtree is observed; remove redundant descendant declarations.
    members={d for d in members if not any(d.startswith(other+'/') for other in members if other!=d)}
    for p in file_inputs: safe(p)
    for d in members: safe(d)
    assert all('/' not in p or any(p.startswith(d+'/') for d in members) for p in file_inputs if not p.startswith(PREFIX)),unit
    membership_report[unit]={'keys':['members:'+d for d in sorted(members)],'status':'declared only; no Git membership query or kernel version invented','purpose':'new child/subtree detection at component, supporting source, protocol and receipt boundaries'}
    for index,e in enumerate(entries):
        p=e['path'];v=pop[p]
        commit=e.get('commit',e.get('source_revision',SOURCE))
        assert commit==SOURCE and e['git_blob_sha']==v['sha']
        length=e.get('byte_length',v.get('size'))
        assert length==v.get('size')
        if e.get('git_type'): assert e['git_type']==v['type']
        if e.get('git_mode'): assert e['git_mode']==v['mode']
        need=e['need']; needs=e.get('needs',[need])
        assert need in NEEDS and set(needs)<=NEEDS
        targets={f's3-l2-{slug}'}|{future_by_need[n] for n in needs if n in future_by_need}
        row={
          'path':p,'commit':commit,'git_blob_sha':e['git_blob_sha'],'byte_length':length,
          'l1':f's3-l1-{slug}','unit':unit,'classification':e.get('classification',e.get('content_kind')),
          'disposition':e['disposition'],'need':need,'needs':needs,
          'family':e.get('family',e.get('contract_family',e.get('component'))),
          'depth':e.get('depth',e.get('depth_rationale')),
          'individual_content_read':e.get('individual_content_read',e.get('source_inspected',e['disposition']=='source-read-static')),
          'future_artifact_keys':sorted(targets),
          'original_entry_index':index,'original_entry_sha256':digest(canonical(e))
        }
        if 'depth_justification_ref' in e: row['depth_justification_ref']=e['depth_justification_ref']
        assert row['classification'] and row['family'] and row['depth']
        map_rows.append(row)
    requested=payload_ref(f'{receipt}/request.md')
    recipe=requested  # Actual original request; amendments remain separate exact input/evidence refs and do not replace it.
    gaps=known_gaps[unit]+[
      'Draft de transporte: oracle_ref ainda null e pareceres semânticos/binding não incorporados por este empacotador; não é aceite.',
      'Importação, versão de input por id(...) do kernel, publicação e consumo Atlas não observados; hashes de transporte não substituem versões runtime.'
    ]
    local_risks=[x for x in oversized_inputs if x['artifact_key']==f's3-l1-{slug}']
    for risk in local_risks: gaps.append(f"Observador atual recusa arquivo acima de 256.000 bytes: {risk['input_key']} ({risk['byte_length']} bytes); input conservado.")
    if unit=='L1-B': gaps.append('B v2 foi copiado pela raiz após a correção sobre diagnóstico de stdout vazio e está vinculado pelos bytes atuais e pelo request-delta-002. Pareceres semânticos permanecem abertos; este empacotamento não decide o mérito da correção.')
    authority={
      'scope':SCOPE,
      'basis':'Inspeção estática atribuída ao produtor no baseline pinado, limitada às leituras declaradas em sources.json e coverage.json. Guias/specs/charters são contratos ou intenção atribuída; histórico mantém sua época. Inferências e gaps permanecem rotulados no corpo. Receipts de integridade e este transporte não provam runtime, implantação, revisão semântica ou aceite. O empacotador não acrescentou conhecimento de produto.'
    }
    artifact={
      'key':f's3-l1-{slug}','scope':SCOPE,'title':body.decode().splitlines()[0].lstrip('# '),'layer':1,'need':'evidence',
      'body':{'path':body_rel,'encoding':'utf-8','byte_length':len(body),'sha256':digest(body)},
      'authority':authority,'validity':'blocked','gaps':gaps,
      'evidence':[payload_ref(f'{receipt}/{f}') for f in ['sources.json','coverage.json','findings.md','review-evidence.md','verification.json']+recipe_deltas+supplemental_evidence]+[payload_ref(population_rel),payload_ref('evidence/required-artifacts.json')],
      'input_keys':sorted(['file:'+p for p in file_inputs]+['members:'+p for p in members]),
      'source_refs':source_refs,'recipe_ref':recipe,'build_dependencies':[],'navigation':[],
      'producer_request_ref':requested,'producer_response_ref':payload_ref(f'{receipt}/response.md'),
      'semantic_review_refs':[],'runtime_receipt_refs':[]
    }
    artifacts.append(artifact)
    unit_report[unit]={'artifact_key':artifact['key'],'population_count':expected,'body':artifact['body'],'source_refs':len(source_refs),'protocol_refs':5,'file_inputs':len(file_inputs),'membership_inputs':len(members),'oversized_input_count':len(local_risks),'original_coverage_ref':coverage_refs[unit],'future_keys':sorted({k for x in map_rows if x['unit']==unit for k in x['future_artifact_keys']})}

assert len(map_rows)==len({x['path'] for x in map_rows})==4553
assert len(protocol_rows)==5
protocol_path='.orchestra/skills/execute-genesis/SKILL.md'
protocol_ref={k:protocol_rows[protocol_path][k] for k in ['commit','path','sha256']}
protocol_checks=[]
for path,sr in sorted(protocol_rows.items()):
    local=R/'protocol'/PurePosixPath(path).name
    raw=local.read_bytes()
    assert digest(raw)==sr['sha256']
    assert hashlib.sha1(b'blob '+str(len(raw)).encode()+b'\0'+raw).hexdigest()==sr['git_blob_sha']
    protocol_checks.append({'path':path,'commit':PROTOCOL,'sha256':sr['sha256'],'byte_length':len(raw),'local_copy_matches_canonical_capture':True})
package={
  'schema':'genesis-native-package/v1','campaign':'20261111-v1','protocol_epoch':'parallel-v3-fresh','results_epoch':'20261111-v3-fresh','session':'S3',
  'source_revision':SOURCE,'protocol_ref':protocol_ref,'scope':SCOPE,'package_state':'IN_PROGRESS',
  'contract':{'criteria':required['public_criteria']+[f'QS-{i}' for i in range(1,7)]+['CC-1','CC-2','CC-3','CC-7']+[f'GO-A{i}' for i in range(1,8)]+[f'GO-I{i}' for i in range(1,9)],'oracle_ref':None},
  'required_artifact_keys':required_keys,'artifacts':artifacts,'roots':{'evidence':[x['key'] for x in artifacts]},
  'missing_required_artifact_keys':[k for k in required_keys if k not in {x['key'] for x in artifacts}],
  'known_limits':[
    'Pacote parcial de transporte L1: oito artefatos L2–L4 obrigatórios ainda ausentes; nenhuma seleção completa ou publicação Atlas alegada.',
    'Oracle não lido nem vinculado; oracle_ref fica null para a raiz. Nenhum parecer semântico ou receipt runtime foi criado ou inferido.',
    'Fonte imutável e protocolo têm commits distintos explícitos. Inputs são declarações para observação futura; nenhum id(...) do kernel, receipt, result, artifact ou manifest runtime foi inventado.',
    'Input keys conservam todos os arquivos da população, fontes adicionais capturadas, protocolo, pedido/deltas e inventário obrigatório; membership cobre novos filhos. Cobertura/população são evidência integral com hash, sem obrigar o observador a ler um relatório derivado como um único input.',
    'Nenhuma fonte ou receita indispensável declarada excede 256.000 bytes nos metadados disponíveis. Quatro evidências grandes permanecem preservadas: coverage.json de L1-A/B/C e population-B.json. Se o adapter exigir observá-las como arquivos inteiros, a recusa de tamanho continua um gap real; não há PASS runtime.',
    'B v2 e C v3 estão vinculados aos hashes finais informados pela raiz, com pedidos/deltas e versões anteriores preservados em evidence. A incorporação dos pareceres semânticos ainda pertence à raiz; nenhum aceite foi inferido de uma cópia final.',
    'O mapper é uma projeção mecânica das versões originais, não conhecimento L2/L3/L4, nova necessidade por arquivo ou dependência de build aceita.',
    'Corpos e recibos finais existentes permanecem intocados. Não foram copiadas fontes integrais nem executados Git writes, testes de produto, CI, login, modelo, Atlas ou consumer.'
  ]
}

assert len(package['missing_required_artifact_keys'])==8
assert all(x['key'] in required_keys and x['layer']==1 and x['need']=='evidence' for x in artifacts)
def walk_refs(obj):
    if isinstance(obj,dict):
        if 'payload_path' in obj: assert obj['payload_path'].startswith(PREFIX);safe(obj['payload_path'])
        for v in obj.values(): walk_refs(v)
    elif isinstance(obj,list):
        for v in obj: walk_refs(v)
walk_refs(package)
save('draft-native-package.json',package)
map_rows.sort(key=lambda x:x['path'])
mapper_raw=b''.join(canonical(x)+b'\n' for x in map_rows)
(B/'population-map.jsonl').write_bytes(mapper_raw)
mapper_info={'file':'population-map.jsonl','payload_path':PREFIX+'evidence/l1-population-map.jsonl','byte_length':len(mapper_raw),'sha256':digest(mapper_raw),'entries':4553}
mapping={
 'schema':'genesis-l1-population-mapping/v1','source_revision':SOURCE,'scope':SCOPE,'mapper':mapper_info,
 'original_coverage_refs':coverage_refs,'original_populations':{u:payload_ref(f'evidence/population-{u[-1]}.json') for u in UNITS},
 'original_entry_hash_recipe':'SHA-256 of UTF-8 JSON with ensure_ascii=false, sort_keys=true, separators=(comma,colon), no trailing newline; original_entry_index indexes the original coverage entries array.',
 'current_mapping':'One existing L1 key per original population partition, without merging or changing original source versions. Shared family/need is retained.',
 'future_mapping':{'status':'candidate routing only; no L2–L4 production or accepted dependency','all_rows':'same-domain L2 component key','additional_by_original_need':future_by_need,'component_and_evidence':'same-domain L2 only unless another original need supplies an additional route'},
 'depth_policy':'Original depth/rationale and inspection flag retained; family-only classification is not promoted to content reading. Full original entry remains recoverable and hash-bound.',
 'families':{u:dict(collections.Counter(x['family'] for x in map_rows if x['unit']==u)) for u in UNITS},
 'needs':{u:dict(collections.Counter(x['need'] for x in map_rows if x['unit']==u)) for u in UNITS},
 'future_artifact_reference_counts':dict(collections.Counter(k for x in map_rows for k in x['future_artifact_keys'])),
 'observer_limit_note':'Mapper exceeds 256.000 bytes; it is auxiliary transport evidence, not retroactively an input used by the L1 producers. If a later binding observes it as one file, the same explicit size refusal applies; no runtime read is claimed.'
}
save('mapping-contract.json',mapping)
save('input-snapshot.json',{'schema':'genesis-transport-input-snapshot/v1','files':input_snapshot,'protocol':protocol_checks,'historical_metadata_preserved':historical_metadata})
save('payload-placement.json',{
 'schema':'genesis-payload-placement/v1','prefix':PREFIX,'status':'plan only; no out or remote writes',
 'new_files':[
   {'local_path':str(B/'draft-native-package.json'),'payload_path':PREFIX+'native-package.json'},
   {'local_path':str(B/'population-map.jsonl'),'payload_path':mapper_info['payload_path']},
   {'local_path':str(B/'mapping-contract.json'),'payload_path':PREFIX+'evidence/l1-mapping-contract.json'},
   {'local_path':str(B/'integrity-report.json'),'payload_path':PREFIX+'evidence/l1-packaging-integrity.json'},
   {'local_path':str(B/'request.md'),'payload_path':PREFIX+'receipts/packaging-l1/request.md'},
   {'local_path':str(B/'response.md'),'payload_path':PREFIX+'receipts/packaging-l1/response.md'}
 ],
 'existing_files':'All body/receipt/population refs resolve under the verified out directory and retain their exact current bytes; source_refs resolve in their original source repository commits.'
})
report={
 'schema':'genesis-l1-packaging-integrity/v1','status':'MECHANICALLY_RECONCILED_DRAFT','not_semantic_acceptance':True,'not_product_test':True,
 'source_revision':SOURCE,'protocol_revision':PROTOCOL,'scope':SCOPE,'execution_id':'bdac971f-e4ee-40e5-ad9b-30d659303bab',
 'counts':{'required_artifacts':11,'present_l1_artifacts':3,'missing_required_artifacts':8,'population_entries':4553,'unique_paths':4553,'population_missing':0,'population_extra':0,'population_duplicates':0,'unique_source_refs':len(source_registry),'oversized_declared_input_occurrences':len(oversized_inputs)},
 'units':unit_report,'memberships':membership_report,'oversized_inputs':oversized_inputs,'oversized_evidence':oversized_evidence,
 'largest_source_population_member':max(({'path':x['path'],'byte_length':x['byte_length']} for x in map_rows),key=lambda x:x['byte_length']),
 'auxiliary_observer_risk':mapper_info,
 'checks':{'source_versions_match_original_populations':True,'source_ref_duplicates_agree_on_bytes':True,'body_paths_relative_safe':True,'all_body_hashes_recomputed':True,'all_bodies_utf8':True,'all_payload_refs_prefixed':True,'all_payload_refs_hash_existing_exact_bytes':True,'all_declared_directory_inputs_safe':True,'new_children_have_membership_boundary':True,'criteria_and_required_keys_from_frozen_contract':True,'protocol_local_matches_canonical_capture':True,'no_fake_runtime_versions':True,'no_semantic_reviews_added':True,'no_runtime_receipts_added':True,'original_coverage_entries_hash_bound':True},
 'preserved_protocol_history':historical_metadata,
 'limits':['The package stays blocked/IN_PROGRESS until root binds exact oracle/reviews and later runtime proof as required.','Source capture integrity is inherited from final producer receipts; this mechanical task does not re-fetch sources or claim new semantic inspection.','No source files or fixtures copied into payload.','Membership inputs are declared, not observed: no Git query, kernel version, accepted manifest or reader was executed.','Oversized evidence remains exact and unresolved if demanded as one observer file; no semantic source was dropped for size and no runtime PASS is claimed.','B v2 and C v3 exact hashes match the final copies announced by root; semantic review is still not incorporated or inferred.'],
 'actions':{'out_written':False,'candidate_written':False,'git_writes':False,'remote_writes':False,'product_tests':False,'ci':False,'reserved_oracle_read':False,'L2_started':False,'semantic_judgment':False},
 'artifacts':{}
}
for name in ['draft-native-package.json','population-map.jsonl','mapping-contract.json','input-snapshot.json','payload-placement.json','request.md','request-steering-001.md','request-steering-002.md','request-steering-003.md','build_package.py']:
    raw=(B/name).read_bytes();report['artifacts'][name]={'byte_length':len(raw),'sha256':digest(raw)}
save('integrity-report.json',report)
print(json.dumps({'counts':report['counts'],'bodies':{u:r['body'] for u,r in unit_report.items()},'oversized_inputs':oversized_inputs,'mapper':mapper_info},ensure_ascii=False,indent=2))
