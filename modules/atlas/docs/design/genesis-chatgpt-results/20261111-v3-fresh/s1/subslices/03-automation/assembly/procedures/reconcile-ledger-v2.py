"""V2: exact per-call response aliases and immutable-row accounting.
Original v1 script and all original ledger rows remain preserved.
"""
from pathlib import Path
import json,hashlib
r=Path(__file__).resolve().parent.parent
p=r/'payload/execution-ledger.jsonl'
original_ledger=p.read_bytes()
rows=[json.loads(s) for s in original_ledger.decode().splitlines() if s.strip()]
ids={x.get('event_id') for x in rows}
def add(event_id,**v):
 if event_id in ids:return
 v.update(event_id=event_id,tokens='UNKNOWN',physical_attempts='UNKNOWN',cost='UNKNOWN')
 rows.append(v);ids.add(event_id)
for root_name in ['relay','relay-root']:
 root=r/root_name
 if not root.exists():continue
 for receipt in sorted(root.rglob('dispatch-receipt.json')):
  if any(x.startswith('prepared') for x in receipt.relative_to(root).parts):continue
  d=receipt.parent
  rel=d.relative_to(root).as_posix()
  lot=d.relative_to(root).parts[0]
  category='derived' if lot.startswith('derived-') else 'delivery' if lot.startswith('delivery-') else 'consumers' if lot.startswith('consumer-') else 'l1'
  prefix=f'judgments/{category}/{rel}' if root_name=='relay' else f'judgments/{category}/{lot}/root-transport'+('/'+('/'.join(d.relative_to(root).parts[1:])) if len(d.relative_to(root).parts)>1 else '')
  j=json.loads(receipt.read_text())
  for c in j.get('calls',j.get('dispatches',[])):
   q=c.get('request_file')
   target=c.get('target',j.get('target'))
   key=f"judge-dispatch:{rel if root_name=='relay' else root_name+'/'+rel}:{target}:{c.get('sequence')}:{c.get('message_sha256')}"
   dispatcher=c.get('actual_dispatcher',c.get('caller',j.get('relay',j.get('caller','/root/review_relay' if root_name=='relay' else '/root'))))
   previous=next((row for row in rows if row.get('event_id')==key),None)
   if previous is not None and previous.get('relay')!=dispatcher:
    add('judge-dispatch-caller-correction:'+key+':'+dispatcher,event='derived_accounting_correction',corrects_event_id=key,field='relay',before=previous.get('relay'),after=dispatcher,evidence=f'{prefix}/dispatch-receipt.json',reason='Actual per-call dispatcher is explicit after transport ownership transfer. Prior ledger row is preserved; this correction is not another native request.',new_native_request=False)
   add(key,event='native_judge_followup',lot=lot,relay=dispatcher,agent_id=target,logical_sequence=c.get('sequence'),request_ref=f'{prefix}/{q}' if q else None,dispatch_record_ref=f'{prefix}/dispatch-receipt.json',call=c)
 for f in sorted(root.rglob('*-response.md')):
  if f.name not in ['j1-response.md','j2-response.md']:continue
  rel=f.parent.relative_to(root).as_posix();lot=f.parent.relative_to(root).parts[0]
  category='derived' if lot.startswith('derived-') else 'delivery' if lot.startswith('delivery-') else 'consumers' if lot.startswith('consumer-') else 'l1'
  prefix=f'judgments/{category}/{rel}' if root_name=='relay' else f'judgments/{category}/{lot}/root-transport'+('/'+('/'.join(f.parent.relative_to(root).parts[1:])) if len(f.parent.relative_to(root).parts)>1 else '')
  b=f.read_bytes();h=hashlib.sha256(b).hexdigest()
  add(f'judge-response:{rel if root_name=="relay" else root_name+"/"+rel}:{f.name}:{h}',event='native_judge_response',lot=lot,agent_id='/root/s1_03_'+f.name.split('-')[0],response_ref=f'{prefix}/{f.name}',response_sha256=h,response_bytes=len(b),decision='ORIGINAL_RESPONSE_AUTHORITATIVE_NOT_PARAPHRASED')
add('oracle-direct-delivery-v1',event='reserved_oracle_delivery',agent_ids=['/root/s1_03_j1','/root/s1_03_j2'],native_tool_invocations=2,request_ref='judgments/oracle/request.txt',receipt_ref='judgments/oracle/dispatch-receipt.json',producer_or_consumer_access=False)
for family,ref in [('automation','producers/automation/revisions/v2/delta.json'),('research','producers/research/correction-v2.json')]:
 b=(r/'payload'/ref).read_bytes()
 add(f'correction:{family}:v2',event='native_author_correction',agent_id=f'/root/{family}_l1',version='v2',delta_ref=ref,delta_sha256=hashlib.sha256(b).hexdigest(),verification_ref='receipts/l1-v2-correction-verification.json',judgment='PENDING_SAME_PAIR')
for family,files in [('automation',['review-supplement-1-receipt.json','review-supplement-2-receipt.json']),('research',['review-supplement-a-receipt.json','review-supplement-b-receipt.json'])]:
 for filename in files:
  b=(r/'producers'/family/filename).read_bytes()
  add(f'evidence-supplement:{family}:{filename}',event='native_author_evidence_supplement',agent_id=f'/root/{family}_l1',receipt_ref=f'producers/{family}/{filename}',receipt_sha256=hashlib.sha256(b).hexdigest(),semantic_acceptance='PENDING_SAME_PAIR')
derived=r/'payload/receipts/derived-dispatches.json'
if derived.exists():
 for call in json.loads(derived.read_text()).get('calls',[]):
  assert call.get('tool_returned_normally') is True
  add('derived-dispatch:'+call['id'],event='native_derived_author_request',agent_id=call.get('returned_agent',call.get('target')),artifact=call['artifact'],dispatch_record_ref='receipts/derived-dispatches.json',call=call)
  response=call.get('original_response_archive')
  if response:
   f=r/response;b=f.read_bytes();h=hashlib.sha256(b).hexdigest()
   add('derived-response:'+call['id']+':'+h,event='native_derived_author_response',agent_id=call.get('returned_agent',call.get('target')),artifact=call['artifact'],response_ref=response.removeprefix('payload/'),response_sha256=h,response_bytes=len(b))
# Subsequent L1 consistency corrections and coordination calls are actual native calls too.
l1=r/'payload/receipts/l1-consistency-correction-dispatches.json'
if l1.exists():
 for call in json.loads(l1.read_text()).get('calls',[]):
  assert call.get('tool_returned_normally') is True
  add('l1-consistency-dispatch:'+call['id'],event='native_l1_author_correction_request',agent_id=call['target'],artifact=call['artifact'],dispatch_record_ref='receipts/l1-consistency-correction-dispatches.json',call=call)
  response=call.get('original_native_final_archive')
  if response:
   b=(r/response).read_bytes();h=hashlib.sha256(b).hexdigest()
   add('l1-consistency-response:'+call['id']+':'+h,event='native_l1_author_correction_response',agent_id=call['target'],artifact=call['artifact'],response_ref=response.removeprefix('payload/'),response_sha256=h,response_bytes=len(b),state=call['state'])
controls=r/'payload/receipts/continuation-controls'
if controls.exists():
 for control in sorted(controls.glob('*.json')):
  c=json.loads(control.read_text());assert c['tool_returned_normally'] is True
  add('continuation-control:'+c['id'],event='native_control_request',agent_id=c['target'],kind=c['kind'],request_record_ref=str(control.relative_to(r/'payload')),method=c['method'])
# Versioned explicit aliases supplement immutable original dispatch metadata.
alias_by_call = {}
for overlay_file in sorted((r/'payload/receipts').glob('producer-response-alias-overlays-v*.json')):
 for overlay in json.loads(overlay_file.read_text())['aliases']:
  call_id=overlay['call_id']
  if call_id in alias_by_call:assert alias_by_call[call_id]==overlay
  alias_by_call[call_id]=overlay
if derived.exists():
 for call in json.loads(derived.read_text()).get('calls',[]):
  if call.get('state','').startswith('COMPLETED') and call.get('producer_response_file'):
   response=call['producer_response_file'];expected=call.get('producer_response_sha256')
   overlay=alias_by_call.get(call['id'])
   if overlay:
    assert response==overlay['original_pointer'] and expected==overlay['expected_response_sha256']
    identity=overlay['historical_response_identity'];response=identity['path']
   b=(r/response).read_bytes();h=hashlib.sha256(b).hexdigest()
   assert expected and h==expected,('producer-response-identity-mismatch',call['id'],response)
   if overlay:
    assert len(b)==identity['bytes'] and hashlib.sha1(b'blob '+str(len(b)).encode()+b'\0'+b).hexdigest()==identity['git_blob_sha']
   prefix='derived-producer-file-completion:'+call['id']+':'
   existing=[row for row in rows if str(row.get('event_id','')).startswith(prefix)]
   for prior in existing:
    if prior.get('response_sha256')!=expected:
     assert any(a.get('event')=='derived_accounting_correction' and a.get('corrects_event_id')==prior['event_id'] and a.get('after',{}).get('response_sha256')==expected for a in rows),('missing-completion-correction',prior['event_id'])
   if not existing:
    add(prefix+h,event='native_derived_author_completion_record',agent_id=call.get('target',call.get('returned_agent')),artifact=call['artifact'],response_ref=response,response_sha256=h,response_bytes=len(b),response_kind='Original producer-written response file, verified against declared per-call hash; not automatically the native FINAL.',missing_native_final_capture=call.get('original_native_final_separate_capture'),state=call['state'])

updated_ledger=''.join(json.dumps(x,ensure_ascii=False,separators=(',',':'))+'\n' for x in rows).encode()
assert updated_ledger.startswith(original_ledger),'Do not rewrite any preserved ledger row'
p.write_bytes(updated_ledger)
print({'ledger_rows':len(rows),'new_unique_event_ids':sum(x.get('event_id') is not None for x in rows),'accounting':'logical visible calls; physical attempts/tokens/cost UNKNOWN; historical GLOBAL_UNRECONCILED'})
