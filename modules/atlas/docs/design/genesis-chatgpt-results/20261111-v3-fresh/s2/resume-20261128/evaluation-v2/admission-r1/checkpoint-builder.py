#!/usr/bin/env python3
"""Preserve the split ADMIT review and stage a documentary checkpoint only.

No Atlas, product test, Git mutation, remote API or publication is invoked.
All archive sources are explicit directories/files. Existing dossier files are
read only; new seals and mechanical projections live in a separate directory.
"""
from pathlib import Path
from collections import Counter
import datetime
import hashlib
import json
import os
import subprocess
import zipfile

W=Path('/workspace/scratch/5cfbb6c803f1')
DELIVERY=W/'s2-delivery'
PREFIX='modules/atlas/docs/design/genesis-chatgpt-results/20261111-v3-fresh/s2/resume-20261128'
PUBLIC=DELIVERY/PREFIX
INV=W/'s2-investigation'
DOS=INV/'evaluation-dossier'
DIS=DOS/'dispatch-admit-r1'
LOCAL=INV/'admission-hold-checkpoint'
CID='d1c8478b155b2085df1289ef91edfeaa4834e9300d651c0b953e6e2978aa5d30'
NOW=datetime.datetime.now(datetime.timezone.utc).isoformat()
NEW='evaluation-v2/admission-r1'
written={}
source_cache={}

def sha(b):return hashlib.sha256(b).hexdigest()
def blob(b):return hashlib.sha1(b'blob '+str(len(b)).encode()+b'\0'+b).hexdigest()
def encode(v):return (json.dumps(v,ensure_ascii=False,indent=2)+'\n').encode()
def identity(p,b=None):
 b=p.read_bytes() if b is None else b
 return {'path':str(p),'byte_length':len(b),'sha256':sha(b)}
def source(p):
 p=p.absolute()
 assert p.is_file() and not p.is_symlink() and p.resolve()==p
 assert p.is_relative_to(W)
 assert 'custody-library-provenance' not in str(p)
 if p not in source_cache:source_cache[p]=p.read_bytes()
 return source_cache[p]
def local_write(rel,b):
 p=LOCAL/rel;p.parent.mkdir(parents=True,exist_ok=True)
 with p.open('xb') as f:f.write(b)
 assert p.read_bytes()==b
 return p
def put(rel,b,origin=None,modify=False):
 p=PUBLIC/rel;assert p.is_relative_to(PUBLIC)
 assert 'custody-library-provenance' not in str(p)
 old=p.read_bytes() if p.exists() else None
 assert modify or old is None,('refusing overwrite',str(p))
 p.parent.mkdir(parents=True,exist_ok=True)
 with p.open('wb' if modify else 'xb') as f:f.write(b)
 assert p.read_bytes()==b
 key=str(p.relative_to(DELIVERY))
 written[key]={'path':key,'change':'modified' if old is not None else 'new','byte_length':len(b),'sha256':sha(b),'git_blob_sha':blob(b),'source_path':str(origin) if origin else None,'source_bytes_preserved':origin is not None,'previous_sha256':sha(old) if old is not None else None}
 return p
def copy(p,rel):return put(rel,source(p),p)

assert not LOCAL.exists(),'Use a new checkpoint directory for another execution'
LOCAL.mkdir()
assert not (PUBLIC/NEW).exists()
head=subprocess.check_output(['git','-C',str(DELIVERY),'rev-parse','HEAD'],text=True,env={**os.environ,'GIT_OPTIONAL_LOCKS':'0'}).strip()
gitdir=subprocess.check_output(['git','-C',str(DELIVERY),'rev-parse','--absolute-git-dir'],text=True,env={**os.environ,'GIT_OPTIONAL_LOCKS':'0'}).strip()
index=Path(gitdir)/'index';index_before=index.read_bytes() if index.exists() else None
old={name:(PUBLIC/name).read_bytes() for name in ['work.md','status.json','runtime-status.json','execution-ledger.jsonl']}
for name,b in old.items():put('history/before-admission-r1-hold/'+name,b,PUBLIC/name)

# Literal reviewer answers: pin, parse, compare identities and criterion sets.
a087=DIS/'amendment-01/13-entry-final-id-table.json'
table=json.loads(source(a087));assert table['candidate']==CID
assert sha(source(a087))=='43949ea911bd36018f1eab5194aabf4e00c6d08de5b69ff48f15550eb8ee92b1'
assets=json.loads(source(DIS/'amendment-01/manifest.json'))['assets']
contract_asset=next(x for x in assets if x['id']=='A015')
contract_path=Path(contract_asset['file']);contract_raw=source(contract_path)
assert len(contract_raw)==contract_asset['utf8_bytes'] and sha(contract_raw)==contract_asset['sha256']
criteria=json.loads(contract_raw)['criteria']
expected={e['key']:e for e in table['entries']}
reviews={};review_rows=[];confirmation=[];comparisons=[];sealed=[]
pins={
 'j1':(54704,'9354131a19ddd0cefbd77c45efd1a3d6de35bda79c0ef653756e5fa16636c5dc',1148823,'f4263c0a78ee6fccf94ac23368a10e01658353d935e2285426112a62c5eac438'),
 'j2':(48952,'93778e0e6a839953536aaad0f2e39c4e2e14687d6ac69a2d1baa1b388aae201b',1197166,'fa2de394d5e038875109d101e1b8aaf4e7611fbbe951f40669857330704605ca')}
for j,(rn,rh,qn,qh) in pins.items():
 p=DIS/'final-reviews'/f'{j}-response.txt';b=source(p);assert len(b)==rn and sha(b)==rh
 o=json.loads(b);reviews[j]=o
 assert o['kind']=='FINAL_EVALUATION_ADMISSION_REVIEW' and o['purpose']=='isolated-evaluation-admission'
 assert o['reviewer']=='/root/s2_'+j and o['candidate_id']==CID
 assert len(o['entries'])==13 and len({e['key'] for e in o['entries']})==13
 assert {e['key'] for e in o['entries']}==set(expected)
 counts=Counter();criterion_counts={c:Counter() for c in criteria}
 for n,e in enumerate(o['entries']):
  for field in ['key','contract','result','inputs']:
   actual=e[field];wanted=expected[e['key']][field]
   comparisons.append({'reviewer':o['reviewer'],'json_pointer':f'/entries/{n}/{field}','entry':e['key'],'expected':wanted,'observed':actual,'equal':actual==wanted})
   assert actual==wanted
  observed=[c['id'] for c in e['criteria']]
  assert len(observed)==4 and set(observed)==set(criteria) and len(set(observed))==4
  comparisons.append({'reviewer':o['reviewer'],'json_pointer':f'/entries/{n}/criteria','entry':e['key'],'expected_ids':criteria,'observed_ids':observed,'same_membership':set(observed)==set(criteria),'same_order':observed==criteria})
  for c in e['criteria']:
   assert set(['id','verdict','reason','evidence']).issubset(c)
   counts[c['verdict']]+=1;criterion_counts[c['id']][c['verdict']]+=1
 review_rows.append({'reviewer':o['reviewer'],'source':identity(p,b),'declared_global_verdict':o['global_verdict'],'entry_count':len(o['entries']),'entry_order_equals_A087':[e['key'] for e in o['entries']]==[e['key'] for e in table['entries']],'criterion_verdict_counts':dict(counts),'per_criterion_counts':{c:dict(v) for c,v in criterion_counts.items()},'new_judgment':None})
 copy(p,NEW+'/final-reviews/'+j+'-response.txt')
 # The only receipt statement extracted is the original finding object.
 f=o['findings'][0]
 assert ('FECHAMENTO DO PEDIDO ADMIT R1' in f['finding'] and 'Recebi' in f['finding'])
 assert f['id']==('F01-CLOSING-RECEIVED' if j=='j1' else 'F00')
 activation=DIS/'root-captures'/f's2_{j}-final-activation.txt'
 capture_path=activation.with_suffix('.json');cap=json.loads(source(capture_path));ab=source(activation)
 assert cap['target']==o['reviewer'] and cap['kind']=='ACTUAL_FOLLOWUP_ACTIVATION'
 assert cap['request_path']==str(activation) and cap['request_utf8_bytes']==len(ab) and cap['request_sha256']==sha(ab)
 base=DIS/'actual-requests'/f's2_{j}-receipt-confirmed-through39.txt'
 pending=DIS/'actual-requests'/f's2_{j}-receipt-confirmed-plus-queued-closing.PENDING.txt'
 closing=DIS/'closing-request.txt'
 sent=DIS/'actual-requests'/f's2_{j}-full-request-SENT-AWAITING-REVIEW.txt';qb=source(sent)
 assert len(qb)==qn and sha(qb)==qh
 assert source(pending)==source(base)+source(closing)
 assert qb==source(pending)+ab
 seal=local_write('sealed-requests/'+j+'-request.txt',qb)
 public_seal=copy(seal,NEW+'/final-requests/'+j+'-request.txt')
 row={'reviewer':o['reviewer'],'review_source':identity(p,b),'json_pointer':'/findings/0','representation':'Complete JSON value extraction from pinned original response; no paraphrase or vote conversion','extracted_confirmation':f,'confirmed_scope':'Closing request, repeated A087 and explicit final activation as self-reported by this reviewer','full_request_source':identity(sent,qb),'sealed_literal_request':identity(seal,qb),'publication_path':str(public_seal.relative_to(PUBLIC)),'base_through39':identity(base,source(base)),'queued_closing':identity(closing,source(closing)),'activation':identity(activation,ab),'activation_record':identity(capture_path,source(capture_path)),'concatenation_rule':'through39 + exact closing + exact actual final trigger; no bytes inserted','preserved_pending_source':identity(pending,source(pending)),'host_message_id':None,'host_timestamp':None,'limits':['Reviewer-reported receipt is not cryptographic delivery authentication.','Old PENDING/NOT_SENT files and first unavailable J1wave36 remain historical; no file is retrospectively rewritten.']}
 confirmation.append(row);sealed.append(identity(seal,qb))
assert review_rows[0]['declared_global_verdict']=='PASS' and review_rows[0]['criterion_verdict_counts']=={'PASS':52}
assert review_rows[1]['declared_global_verdict']=='HOLD' and review_rows[1]['criterion_verdict_counts']=={'PASS':39,'HOLD':13}
assert review_rows[1]['per_criterion_counts']['ADMIT-SOURCE-BINDINGS']=={'HOLD':13}
mechanical={'schema':'genesis-s2-final-review-identity-reconciliation/v1','recorded_at':NOW,'candidate_id':CID,'method':'Hash literal original responses; parse JSON; compare all 13 keys/contract/result/inputs with pinned A087; compare each exact four-criterion membership and order with pinned A015. Count declared verdicts only. No response rewriting or new judgment.','table':identity(a087,source(a087)),'contract':identity(contract_path,contract_raw),'reviewers':review_rows,'comparisons':comparisons,'identity_field_comparisons':104,'criterion_set_comparisons':26,'divergences':[],'new_judgment':None,'operational_result':'ADMISSION_HOLD; no all-PASS independent pair exists for this candidate.'}
mp=local_write('identity-criteria-reconciliation.json',encode(mechanical));copy(mp,NEW+'/final-reviews/identity-criteria-reconciliation.json')
proof={'schema':'genesis-s2-final-request-receipt-seal/v1','recorded_at':NOW,'candidate_id':CID,'confirmations':confirmation,'response_bytes_modified':False,'old_dossier_or_pending_files_modified':False,'scope':'Transport receipt and exact identity reconciliation only; no admission or semantic approval by the recorder.'}
pp=local_write('receipt-confirmation.json',encode(proof));copy(pp,NEW+'/final-requests/receipt-confirmation.json')
copy(DIS/'closing-request.txt',NEW+'/final-requests/closing-request.txt')
for j in pins:
 for suffix in ['txt','json']:copy(DIS/'root-captures'/f's2_{j}-final-activation.{suffix}',NEW+'/final-requests/'+j+'-activation.'+suffix)

# Allowlisted snapshots. The S4 followup being authored elsewhere is excluded.
groups={
 'dossier-and-transport':{'directories':[DOS],'files':[],'state':'HISTORICAL_DOSSIER_TRANSPORT_AND_FINAL_SPLIT_REVIEWS'},
 'operator-preparation':{'directories':[INV/'evaluation-authority',INV/'consumer-dispatch',INV/'operation-config-history'],'files':[INV/n for n in ['record-operation.py','capture-state-operation.py','install-evaluation-policy.py','operation-config.py','operation-config.README.md']],'state':'OPERATOR_EVIDENCE_WITH_CONSUMER_PREPARATION_NOT_RUN'},
 'maintenance-not-run':{'directories':[INV/n for n in ['maintenance-plan','maintenance-mechanical-audit','maintenance-mechanical-fix-01','maintenance-m0-proposal','maintenance-u1-operator-draft']],'files':[],'state':'PROPOSALS_AND_STATIC_RECORDS_ONLY_ATLAS_MAINTENANCE_NOT_RUN'}}
archive_reports=[]
for name,g in groups.items():
 paths=list(g['files'])
 for directory in g['directories']:
  assert directory.is_dir() and not directory.is_symlink()
  for p in sorted(directory.rglob('*')):
   assert not p.is_symlink(),('symlink in allowlist',str(p))
   if p.is_file():paths.append(p)
 paths=sorted(set(paths));assert paths
 rows=[]
 for p in paths:
  raw=source(p)
  # Block actual library identifiers/URIs in these evidence sources.
  for needle in [b'oai-library:',b'file-inline-libfile_',b'library_file_id',b'chatgpt.com/library']:
   assert needle not in raw,('non-public storage data found',str(p),needle)
  rows.append({'member':str(p.relative_to(W)),'source_path':str(p),'byte_length':len(raw),'sha256':sha(raw),'source_mode':oct(p.stat().st_mode & 0o777)})
 manifest={'schema':'genesis-s2-allowlisted-evidence-archive/v1','recorded_at':NOW,'candidate_id':CID,'state':g['state'],'allowlist':{'directories':[str(p) for p in g['directories']],'files':[str(p) for p in g['files']]},'files':rows,'file_count':len(rows),'uncompressed_payload_bytes':sum(r['byte_length'] for r in rows),'path_rule':'Workspace-relative original paths; exact original file bytes. ZIP timestamps/modes normalized, original source mode recorded.','private_custody_or_library_data_included':False,'atlas_or_tests_executed_for_archiving':False}
 manifest_raw=encode(manifest)
 archive=LOCAL/(name+'-evidence.zip')
 with zipfile.ZipFile(archive,'x',compression=zipfile.ZIP_DEFLATED,compresslevel=9) as z:
  for member,raw in [(r['member'],source(Path(r['source_path']))) for r in rows]+[('MANIFEST.json',manifest_raw)]:
   info=zipfile.ZipInfo(member,date_time=(2026,11,28,0,0,0));info.compress_type=zipfile.ZIP_DEFLATED;info.external_attr=0o100644 << 16;z.writestr(info,raw)
 with zipfile.ZipFile(archive) as z:
  assert z.testzip() is None
  assert len(z.namelist())==len(set(z.namelist()))==len(rows)+1
  assert set(z.namelist())=={r['member'] for r in rows}|{'MANIFEST.json'}
  assert z.read('MANIFEST.json')==manifest_raw
  for r in rows:
   raw=z.read(r['member']);assert raw==source(Path(r['source_path'])) and len(raw)==r['byte_length'] and sha(raw)==r['sha256']
 archive_public=copy(archive,NEW+'/archives/'+archive.name)
 manifest_path=local_write(name+'-manifest.json',manifest_raw);copy(manifest_path,NEW+'/archives/'+manifest_path.name)
 report={'name':name,'archive':identity(archive,source(archive)),'publication_path':str(archive_public.relative_to(PUBLIC)),'manifest':identity(manifest_path,manifest_raw),'payload_members':len(rows),'members_including_manifest':len(rows)+1,'all_payload_members_equal_source_bytes':True,'duplicate_or_extra_members':[],'CRC_check':'NO_INVALID_MEMBER','state':g['state']}
 archive_reports.append(report)

review_state={'state':'ADMISSION_HOLD','candidate_id':CID,'purpose':'isolated-evaluation-admission','reviewers':[{'reviewer':r['reviewer'],'global_verdict':r['declared_global_verdict'],'criterion_counts':r['criterion_verdict_counts'],'response':NEW+'/final-reviews/'+j+'-response.txt','response_sha256':r['source']['sha256']} for j,r in zip(pins,review_rows)],'binding':'NOT_CREATED','admit':'NOT_RUN','publication':'NOT_RUN','index_read':'NOT_RUN','consumer_cases':{'executed':0,'total':14},'S2-U1':'NOT_RUN','blocker':{'reviewer':'/root/s2_j2','finding':'F02','request':'M01','criterion':'ADMIT-SOURCE-BINDINGS','entries':13,'summary':'Installed @noble/hashes bytes are outside the intrinsic identity checked by supported paths. The optional operator wrapper does not establish mandatory refusal of implementation drift.','resolution_owner':'S4','changed_runtime_requires_new_prepare_candidate_and_reviews':True},'original_v1_HOLD_preserved':True,'review_response_bytes_modified':False}
maintenance={'state':'DRAFTS_AND_STATIC_ANALYSIS_PRESERVED','execution':'NOT_RUN','driver':'DRAFT_PREPARED_NOT_RUN','target_roots':'NOT_CREATED','patch_applied':False,'producers_or_witnesses_executed':False,'archive':NEW+'/archives/maintenance-not-run-evidence.zip','scope':'Includes proposals, mechanical audit/fix records and operator drafts; no target prepare, admission, maintenance, read or semantic judgment is inferred.'}
status=json.loads(old['status.json']);status['updated_at']=NOW;status['state']='INCOMPLETE_BLOCKED';status['delivery_complete']=False
status['admission_review']=review_state;status['binding_review']='ADMISSION_HOLD; J1 PASS52; J2 PASS39/HOLD13_SOURCE_BINDINGS; NO_BINDING_OR_ADMISSION'
status['isolated_setup']['final_ADMIT_decisions']='RECEIVED_SPLIT_PAIR_ADMISSION_HOLD';status['isolated_setup']['binding']='NOT_CREATED';status['isolated_setup']['admission']='NOT_RUN'
status['runtime_coverage']['status']='MATERIAL_COVERAGE_GAP_BLOCKS_ADMISSION';status['runtime_coverage']['current_review']=NEW+'/final-reviews/j2-response.txt'
status['maintenance_static_plan']=maintenance
for event in ['39-review-waves-and-explicit-corrections-preserved','two-final-ADMIT-reviews-captured-with-split-verdicts','final-request-receipt-confirmed-and-sealed','13-entry-four-criterion-identities-mechanically-reconciled','consumer-packets-and-U1-drafts-preserved-NOT_RUN']:
 if event not in status['completed']:status['completed'].append(event)
status['open']=['S4-owned resolution of the mandatory runtime implementation binding/refusal described by J2 F02/M01; no concurrent S2 runtime edit or bypass of HOLD','If bound runtime inputs change: obtain compatible runtime, execute a new prepare with its own candidate/receipt, and submit exact bindings to the same independent pair','Construct binding and run governed admission only after both exact ADMIT approvals','Actual index/read and first independent consumer; frozen cases remain0/14','Complete the remaining frozen cases and S2-U1 with its own reviewed targets/recipes/producer bridge and evidence','Applicable later gates and final S2 operational judgments/seal; task is not complete']
status['current_checkpoint']={'state':'INCOMPLETE_BLOCKED','scope':'ADMISSION_HOLD documentary preservation only','evidence':NEW+'/README.md','S4_followup_proposal':'Being prepared separately by owner; excluded from this base checkpoint for root to add once fixed.'}
assert status['historical_r4_recovered'] is False and status['first_traversal']=='NOT_RUN' and status['consumer_cases']['executed']==0 and status['S2-U1']=='NOT_RUN'
put('status.json',encode(status),modify=True)
rs=json.loads(old['runtime-status.json']);rs['checkpoint_updated_at']=NOW;rs['current_state']='INCOMPLETE_BLOCKED';rs['admission_review']=review_state;rs['isolated_setup']['final_ADMIT_decisions']='RECEIVED_SPLIT_PAIR_ADMISSION_HOLD';rs['isolated_setup']['binding']='NOT_CREATED'
rs['first_traversal']['next_precondition']='Resolve S4-owned source-binding blocker F02/M01. A changed runtime requires new prepare/candidate and exact new judgments by the same pair; no binding/admit/index/read is authorized by the current split pair.'
put('runtime-status.json',encode(rs),modify=True)
work=old['work.md'].decode()
work=work.replace('Estado: **IN_PROGRESS**, `delivery_complete=false`.','Estado: **INCOMPLETE_BLOCKED**, `delivery_complete=false`; candidato d1 em **ADMISSION_HOLD**.')
work=work.replace('ADMIT ainda não tem decisões finais nem execução;', 'Os pareceres ADMIT finais foram recebidos: J1 declarou PASS nos52 critérios e J2 declarou HOLD nos13 SOURCE-BINDINGS e PASS nos39 restantes. A admissão permanece bloqueada e não foi executada;')
work=work.replace('| V2 ADMIT exato dos 13 | Em revisão, sem decisões finais e sem admissão |','| V2 ADMIT exato dos 13 | ADMISSION_HOLD: J1 PASS52; J2 PASS39/HOLD13 SOURCE-BINDINGS; sem binding ou admissão |')
work=work.replace('| Publicação/admissão governada v2 | NOT_RUN; depende das duas decisões finais exatas |','| Publicação/admissão governada v2 | NOT_RUN; o par atual não satisfaz o gate de duas aprovações exatas |')
work=work.replace('| S2-U1 | NOT_RUN; plano estático e patch proposto preservados, sem aplicação; driver/produção/targets e provas pendentes |','| S2-U1 | NOT_RUN; plano, drivers e operadores em rascunho, auditoria/correção mecânica e proposta M0 preservados; sem target, produção, manutenção ou testemunha executados |')
section=f'''\n## Checkpoint: pareceres finais e bloqueio de admissão\n\nEm `{NOW}`, este checkpoint documental preserva o candidato `{CID}` em **ADMISSION_HOLD** e a frente em **INCOMPLETE_BLOCKED**. Não é conclusão da missão. Os dois pareceres são originais integrais em `{NEW}/final-reviews/`: J1 `{pins['j1'][1]}` (54.704 bytes) e J2 `{pins['j2'][1]}` (48.952 bytes). J1 declara PASS nos52 critérios; J2 declara HOLD em ADMIT-SOURCE-BINDINGS das13 entradas e PASS nos39 critérios restantes. Nenhum voto foi convertido, removido ou transplantado.\n\nO impedimento F02/M01 de J2 é específico: os bytes instalados de `@noble/hashes`, usados pelo código de identidade, ficam fora da identidade intrínseca verificada pelos caminhos suportados. A evidência externa do prepare03 permanece válida para suas capturas, mas o wrapper opcional não torna obrigatória a recusa de drift para outros chamadores. A correção pertence à frente S4; nenhuma edição concorrente ou execução para contornar o HOLD integra este checkpoint. Uma mudança em runtime ou inputs vinculados exige novo prepare, candidato e recibo próprios, seguidos de novos julgamentos exatos pelo mesmo par.\n\nOs pedidos completos efetivamente recebidos estão selados em `{NEW}/final-requests/`, com a confirmação literal extraída de `/findings/0` de cada resposta e a reconstrução exata: transcript confirmado até39 + fechamento + gatilho final. Os arquivos pendentes e tentativas anteriores continuam intactos. A primeira onda36 indisponível de J1 foi excluída da vista confirmada; sua retransmissão, os gatilhos recebidos e todas as retiradas/erratas reais permanecem no histórico. Os hashes externos não autenticam a serialização do host ou a identidade pessoal dos revisores.\n\nA conferência documental compara as13 identidades completas e os4 critérios de cada entry, sem reavaliar o mérito: 104 campos de identidade e26 conjuntos de critérios, sem divergências. Os ZIPs em `{NEW}/archives/` preservam o dossiê completo, transporte, pareceres, preparação dos operadores e14 consumer packets, além das propostas/auditorias estáticas U1. Cada ZIP tem MANIFEST.json e foi reaberto para comparar cada membro com os bytes de origem. A ausência de execução de consumidores/U1 não é preenchida por preparação documental.\n\nContinuam **NOT_RUN**: binding/admit, publicação isolada, index/read, primeira travessia,14 casos (0/14) eS2-U1. Os helpers de consumidores e manutenção são preservados com suas versões e escopos; a correção estática E002 não é prova de execução. O arquivo `{NEW}/archives/maintenance-not-run-evidence.zip` inclui maintenance-plan, maintenance-mechanical-audit, maintenance-mechanical-fix-01, maintenance-m0-proposal e maintenance-u1-operator-draft, todos sem execução Atlas de manutenção.\n\nOs quatro arquivos de estado anteriores foram copiados integralmente para `history/before-admission-r1-hold/`. Nenhum Atlas, teste de produto, gate, commit, push ou chamada GitHub foi executado para montar este checkpoint. A proposta S2→S4 em preparação permanece fora desta captura base e será acrescentada pelo root depois de fixada.\n'''
work+=section;put('work.md',work.encode(),modify=True)
events=[{'event':'FINAL_ADMIT_PAIR_CAPTURED','candidate_id':CID,'reviewers':review_rows,'binding':'NOT_CREATED','admission':'NOT_RUN'}, {'event':'FINAL_REQUEST_RECEIPT_SEALED','candidate_id':CID,'seals':sealed,'confirmation':NEW+'/final-requests/receipt-confirmation.json','old_pending_files_preserved':True}, {'event':'ADMISSION_HOLD_RECORDED','candidate_id':CID,'blocker':review_state['blocker'],'first_traversal':'NOT_RUN','consumer_cases':'0/14','S2-U1':'NOT_RUN'}, {'event':'PREPARED_CONSUMER_AND_U1_MATERIALS_ARCHIVED','archives':archive_reports,'consumer_execution':'NOT_RUN','maintenance_execution':'NOT_RUN'}, {'event':'DOCUMENTARY_HOLD_CHECKPOINT_STAGED','state':'INCOMPLETE_BLOCKED','task_complete':False,'Atlas_executed':False,'tests_or_gates_executed':False,'commit_or_push':False,'S4_followup_excluded_pending_owner':True}]
ledger=old['execution-ledger.jsonl'];ledger+=b'' if ledger.endswith(b'\n') else b'\n'
for event in events:event.update(recorded_at=NOW,execution_id=status['execution_id']);ledger+=(json.dumps(event,ensure_ascii=False,separators=(',',':'))+'\n').encode()
put('execution-ledger.jsonl',ledger,modify=True)
readme=f'''# S2 ADMIT R1 — checkpoint de bloqueio\n\nEstado: **INCOMPLETE_BLOCKED / ADMISSION_HOLD**. Candidato `{CID}`. A tarefa continua aberta.\n\nOs pareceres integrais estão em `final-reviews/`: J1 declara PASS52; J2 declara PASS39 e HOLD13 em ADMIT-SOURCE-BINDINGS. `identity-criteria-reconciliation.json` contém somente a reconciliação mecânica das identidades e dos critérios, sem novo voto. O impedimento específico está em J2 F02/M01. Não há binding, admit, publicação isolada, index/read, consumidor (0/14) ou S2-U1 executado.\n\n`final-requests/receipt-confirmation.json` extrai a confirmação de fechamento dos próprios reviews e registra as fontes/pins das vistas seladas. Os pedidos selados são os mesmos bytes já enviados, acrescidos do fechamento e gatilho reais; nenhum parecer foi reformatado.\n\n## Arquivos ZIP\n\n- `archives/dossier-and-transport-evidence.zip`: dossiê integral, fontes/copias de evidência, projeções explicitadas, todos os pedidos, tentativas, correções, ACKs e respostas finais preservados. Os estados históricos PENDING/NOT_SENT continuam históricos; este checkpoint registra o estado posterior sem reescrevê-los.\n- `archives/operator-preparation-evidence.zip`: políticas e planejamento externos, recorders/builders com histórico e consumer packets. Recorders historicamente usados não são confundidos com consumidores executados; os14 consumer contexts/queries continuam NOT_RUN.\n- `archives/maintenance-not-run-evidence.zip`: plano, drivers em rascunho, auditoria/correção mecânica, proposta M0 e operadores/testemunhas propostos. Nenhuma execução Atlas de manutenção, target, produtor ou testemunha é alegada.\n\nCada ZIP contém MANIFEST.json; os manifestos também são expostos separadamente. Os membros têm nomes relativos à workspace e bytes exatos. Datas/modos ZIP são normalizados; modos de origem são registrados no manifesto. A verificação reabre os ZIPs e compara inventário, CRC, comprimento, SHA-256 e bytes de cada payload com a captura de origem.\n\nA allowlist exclui material privado de custódia e dados de armazenamento pessoal. A proposta de correção S4 ainda em elaboração não integra esta captura base. A resolução depende do dono S4 e de novas identidades/julgamentos quando os inputs vinculados mudarem. Este registro não encerra a missão, não promove d1 e não transfere seus votos para outro candidato.\n'''
put(NEW+'/README.md',readme.encode())
put(NEW+'/archive-verification.json',encode({'schema':'genesis-s2-hold-checkpoint-archives-verification/v1','recorded_at':NOW,'archives':archive_reports,'all_payload_members_compared_to_original_snapshot':True,'new_judgment':None}))
copy(Path(__file__),NEW+'/checkpoint-builder.py')

# Ensure no source changed while it was being captured and no Git index changed.
drift=[identity(p) for p,b in source_cache.items() if p.read_bytes()!=b]
assert not drift,('source changed during checkpoint',drift)
assert (index.read_bytes() if index.exists() else None)==index_before,'Git index changed during documentary staging'
inventory=[identity(p,b) for p,b in sorted(source_cache.items())]
ip=local_write('source-capture-inventory.json',encode({'schema':'genesis-s2-checkpoint-source-inventory/v1','recorded_at':NOW,'files':inventory,'file_count':len(inventory),'post_capture_byte_drift':[],'git_index_unchanged':True,'source_originals_modified_by_builder':False}));copy(ip,NEW+'/source-capture-inventory.json')
checkpoint={'schema':'genesis-s2-admission-hold-checkpoint/v1','recorded_at':NOW,'base_head':head,'state':'STAGED_DOCUMENTS_ONLY_INCOMPLETE_BLOCKED','candidate_id':CID,'admission_review':review_state,'maintenance':maintenance,'archives':archive_reports,'historical_r4_recovered':False,'first_traversal':'NOT_RUN','consumer_cases':'0/14','S2-U1':'NOT_RUN','source_drift':[],'source_roots_or_old_dossier_modified':False,'git_index_modified':False,'private_custody_or_library_data_included':False,'S4_followup_proposal_included':False,'Atlas_tests_gates_commit_push_executed':False}
put('checkpoint-admission-r1-hold.json',encode(checkpoint))
for row in written.values():
 raw=(DELIVERY/row['path']).read_bytes();assert len(raw)==row['byte_length'] and sha(raw)==row['sha256'] and blob(raw)==row['git_blob_sha']
assert sum(r['change']=='modified' for r in written.values())==4
manifest={'schema':'genesis-s2-next-checkpoint-publication-manifest/v1','recorded_at':NOW,'worktree':str(DELIVERY),'branch':'genesis-interfaces-resume','base_head':head,'prefix':PREFIX,'state':'FILES_PREPARED_NO_COMMIT_PUSH_OR_GATES','file_count':len(written),'counts':{'new':sum(r['change']=='new' for r in written.values()),'modified':4},'private_custody_or_library_data_included':False,'source_roots_or_old_dossier_modified':False,'git_index_modified':False,'S4_followup_excluded_for_root_to_add':True,'files':list(written.values()),'facts':{'candidate_id':CID,'state':'INCOMPLETE_BLOCKED','candidate_state':'ADMISSION_HOLD','J1':'PASS52','J2':'PASS39_HOLD13_SOURCE_BINDINGS','binding':'NOT_CREATED','admission':'NOT_RUN','publication':'NOT_RUN','index_read':'NOT_RUN','consumer_cases':'0/14','S2-U1':'NOT_RUN','task_complete':False}}
publish=INV/'publish-admission-hold-checkpoint.json'
with publish.open('xb') as f:f.write(encode(manifest))
print(json.dumps({'manifest':identity(publish),'base_head':head,'file_count':len(written),'counts':manifest['counts'],'archives':archive_reports,'source_files':len(source_cache),'source_drift':[],'git_index_unchanged':True},ensure_ascii=False,indent=2))
