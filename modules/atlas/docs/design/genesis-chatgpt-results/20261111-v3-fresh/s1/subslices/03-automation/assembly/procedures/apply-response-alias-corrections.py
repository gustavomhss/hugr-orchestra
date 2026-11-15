"""Apply the reviewed mechanical alias correction without changing original rows.

This corrects accounting metadata only. No native request, producer text, semantic
gate or missing FINAL is manufactured, retried or replaced.
"""
from pathlib import Path
from datetime import datetime, timezone
import ast
import hashlib
import json

W = Path(__file__).resolve().parents[1]
P = W / 'payload'
H = lambda raw: hashlib.sha256(raw).hexdigest()
G = lambda raw: hashlib.sha1(b'blob ' + str(len(raw)).encode() + b'\0' + raw).hexdigest()
proposal_path = P / 'assembly/response-alias-audit/proposed-corrections.json'
proposal = json.loads(proposal_path.read_text())
assert proposal['status'] == 'PROPOSED_NOT_APPLIED'
ledger = P / 'execution-ledger.jsonl'
original = ledger.read_bytes()
lines = original.splitlines(keepends=True)
rows = [json.loads(line) for line in lines]
assert H(original) == proposal['ledger_snapshot']['sha256']
assert len(rows) == proposal['ledger_snapshot']['row_count']
calls = {c['id']: c for c in json.loads((P / 'receipts/derived-dispatches.json').read_text())['calls']}
aliases = []
for item in proposal['alias_overlays']:
    call = calls[item['call_id']]
    identity = item['historical_response_identity']
    raw = (W / identity['path']).read_bytes()
    assert len(raw) == identity['bytes'] and H(raw) == identity['sha256'] and G(raw) == identity['git_blob_sha']
    assert call['producer_response_file'] == item['original_pointer']
    assert call['producer_response_sha256'] == item['expected_response_sha256'] == identity['sha256']
    aliases.append({'call_id': item['call_id'], 'original_pointer': item['original_pointer'],
                    'expected_response_sha256': item['expected_response_sha256'],
                    'historical_response_identity': identity})
ids = {row.get('event_id') for row in rows}
addenda = []
for item in proposal['ledger_addenda']:
    target = item['target']
    line = lines[target['line'] - 1]
    assert H(line) == target['line_sha256_including_lf']
    assert json.loads(line)['event_id'] == target['event_id']
    record = dict(item['proposed_append_record'])
    assert record['new_native_request'] is False and record['event_id'] not in ids
    record['evidence'] = 'receipts/response-alias-corrections-applied.json'
    record['proposal_ref'] = 'assembly/response-alias-audit/proposed-corrections.json#' + item['proposal_id']
    addenda.append(record)
    ids.add(record['event_id'])

old_script = W / 'scripts/reconcile-ledger.py'
old_bytes = old_script.read_bytes()
assert H(old_bytes) == proposal['script_change_proposal']['sha256']
source = old_bytes.decode()
source = source.replace("rows=[json.loads(s) for s in p.read_text().splitlines() if s.strip()]",
                        "original_ledger=p.read_bytes()\nrows=[json.loads(s) for s in original_ledger.decode().splitlines() if s.strip()]", 1)
start = source.rfind('if derived.exists():\n')
end = source.index("p.write_text(''.join(", start)
assert start > 0
replacement = '''# Versioned explicit aliases supplement immutable original dispatch metadata.
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
    assert len(b)==identity['bytes'] and hashlib.sha1(b'blob '+str(len(b)).encode()+b'\\0'+b).hexdigest()==identity['git_blob_sha']
   prefix='derived-producer-file-completion:'+call['id']+':'
   existing=[row for row in rows if str(row.get('event_id','')).startswith(prefix)]
   for prior in existing:
    if prior.get('response_sha256')!=expected:
     assert any(a.get('event')=='derived_accounting_correction' and a.get('corrects_event_id')==prior['event_id'] and a.get('after',{}).get('response_sha256')==expected for a in rows),('missing-completion-correction',prior['event_id'])
   if not existing:
    add(prefix+h,event='native_derived_author_completion_record',agent_id=call.get('target',call.get('returned_agent')),artifact=call['artifact'],response_ref=response,response_sha256=h,response_bytes=len(b),response_kind='Original producer-written response file, verified against declared per-call hash; not automatically the native FINAL.',missing_native_final_capture=call.get('original_native_final_separate_capture'),state=call['state'])

'''
source = source[:start] + replacement + source[end:]
old_write = "p.write_text(''.join(json.dumps(x,ensure_ascii=False,separators=(',',':'))+'\\n' for x in rows))"
new_write = "updated_ledger=''.join(json.dumps(x,ensure_ascii=False,separators=(',',':'))+'\\n' for x in rows).encode()\nassert updated_ledger.startswith(original_ledger),'Do not rewrite any preserved ledger row'\np.write_bytes(updated_ledger)"
assert source.count(old_write) == 1
source = source.replace(old_write, new_write)
source = ('"""V2: exact per-call response aliases and immutable-row accounting.\n'
          'Original v1 script and all original ledger rows remain preserved.\n"""\n' + source)
ast.parse(source)
new_script = W / 'scripts/reconcile-ledger-v2.py'
assert not new_script.exists()
overlay_path = P / 'receipts/producer-response-alias-overlays-v1.json'
receipt_path = P / 'receipts/response-alias-corrections-applied.json'
history = P / 'history/execution-ledger-before-response-alias-corrections.jsonl'
assert not any(path.exists() for path in [overlay_path, receipt_path, history])
overlay = {'schema': 's1-03-producer-response-alias-overlays/v1', 'aliases': aliases,
           'original_dispatch_metadata_preserved': True,
           'proposal_sha256': H(proposal_path.read_bytes()), 'new_native_requests': 0}
new_ledger = original + ''.join(json.dumps(row,ensure_ascii=False,separators=(',',':'))+'\n' for row in addenda).encode()
assert new_ledger[:len(original)] == original
history.write_bytes(original)
overlay_path.write_text(json.dumps(overlay,ensure_ascii=False,indent=2)+'\n')
new_script.write_text(source)
archived_script = P / 'assembly/procedures/reconcile-ledger-v2.py'
assert not archived_script.exists()
archived_script.write_bytes(new_script.read_bytes())
ledger.write_bytes(new_ledger)
record = {'schema': 's1-03-response-alias-corrections-applied/v1',
          'at_utc': datetime.now(timezone.utc).isoformat(), 'status': 'APPLIED_MECHANICAL_CORRECTIONS_ONLY',
          'alias_count': len(aliases), 'addendum_count': len(addenda),
          'appended_event_ids': [row['event_id'] for row in addenda],
          'original_ledger_sha256': H(original), 'updated_ledger_sha256': H(new_ledger),
          'original_rows': len(rows), 'original_row_bytes_preserved': True, 'original_script_unchanged': H(old_script.read_bytes())==H(old_bytes),
          'new_script': str(new_script.relative_to(W)), 'new_script_sha256': H(new_script.read_bytes()),
          'new_script_syntax': 'PASS', 'new_script_execution': 'NOT_RUN_YET',
          'overlay': str(overlay_path.relative_to(P)), 'history': str(history.relative_to(P)),
          'proposal': str(proposal_path.relative_to(P)), 'proposal_sha256': H(proposal_path.read_bytes()),
          'new_native_requests': 0, 'native_final_gap_repaired': False,
          'scope': 'Correct historical response-file identity and prevent recurrence; no producer, judgment or domain result changes.'}
receipt_path.write_text(json.dumps(record,ensure_ascii=False,indent=2)+'\n')
print(json.dumps(record,ensure_ascii=False))
