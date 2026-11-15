"""Summarize caller-visible records without certifying an unavailable host total.

This reads local evidence only. A record, a reply, a metadata correction and a
native request are different units; physical attempts, tokens and money remain
UNKNOWN. Existing originals and the append-only ledger are not edited.
"""
from pathlib import Path
from collections import Counter
from datetime import datetime, timezone
import hashlib
import json
import sys

W = Path(__file__).resolve().parents[1]
P = W / 'payload'
tag = sys.argv[1]
assert tag and all(c.isalnum() or c in '-_' for c in tag)
destination = P / 'economy' / 'snapshots' / tag
assert not destination.exists(), 'An economy snapshot is immutable; use a new tag.'
H = lambda raw: hashlib.sha256(raw).hexdigest()

def identity(path):
    raw = path.read_bytes()
    return {'path': str(path.relative_to(W)), 'bytes': len(raw), 'sha256': H(raw)}

ledger_path = P / 'execution-ledger.jsonl'
ledger_raw = ledger_path.read_bytes()
rows = [json.loads(line) for line in ledger_raw.splitlines() if line.strip()]
ids = Counter(row['event_id'] for row in rows if row.get('event_id'))
dispatch_records = []
request_checks = []
receipts = []
for root_name in ['relay', 'relay-root']:
    root = W / root_name
    for path in sorted(root.rglob('dispatch-receipt.json')):
        if any(part.startswith('prepared') for part in path.relative_to(root).parts):
            continue
        record = json.loads(path.read_bytes())
        calls = record.get('calls', record.get('dispatches', []))
        receipts.append(identity(path) | {'recorded_calls': len(calls)})
        for index, call in enumerate(calls):
            row = {'receipt': str(path.relative_to(W)), 'array_index': index,
                   'lot': record.get('lot', path.parent.name),
                   'target': call.get('target', record.get('target')),
                   'sequence': call.get('sequence'),
                   'caller': call.get('actual_dispatcher', call.get('caller',
                       record.get('relay', record.get('caller',
                           '/root/review_relay' if root_name == 'relay' else '/root')))),
                   'tool_returned_normally': call.get('tool_returned_normally', 'UNKNOWN'),
                   'message_sha256': call.get('message_sha256')}
            dispatch_records.append(row)
            request_name = call.get('request_file')
            check = row.copy()
            if request_name is None:
                check['request_check'] = 'NO_REQUEST_PATH_IN_THIS_RECORD'
            else:
                request_path = path.parent / request_name
                if not request_path.is_file():
                    check['request_check'] = 'REFERENCED_REQUEST_UNAVAILABLE'
                else:
                    request = json.loads(request_path.read_bytes())
                    message = request.get('message')
                    if not isinstance(message, str):
                        check['request_check'] = 'UNRECOGNIZED_REQUEST_SCHEMA'
                    else:
                        raw = message.encode('utf-8')
                        check['request'] = identity(request_path)
                        check['preserved_request_message_bytes'] = len(raw)
                        check['preserved_request_message_sha256'] = H(raw)
                        check['request_check'] = ('MATCH' if
                            (call.get('message_sha256') in [None, H(raw)] and
                             call.get('message_bytes') in [None, len(raw)])
                            else 'RECORDED_IDENTITY_MISMATCH')
            request_checks.append(check)

linked = []
for name in ['receipts/derived-dispatches.json',
             'receipts/l1-consistency-correction-dispatches.json',
             'receipts/consumer-dispatches.json']:
    path = P / name
    if path.is_file():
        record = json.loads(path.read_bytes())
        linked.append(identity(path) | {'recorded_calls': len(record.get('calls', [])),
            'states': dict(Counter(call.get('state', 'UNSPECIFIED') for call in record.get('calls', [])))})

record = {'schema': 's1-03-visible-economy-snapshot/v2',
    'observed_at_utc': datetime.now(timezone.utc).isoformat(),
    'execution_id': '34269cf4-d631-41c5-a30b-85b0ec217390',
    'scope': 'Caller-visible local evidence at this instant. No host/private-log recovery and no new native request.',
    'ledger': identity(ledger_path) | {'rows': len(rows),
        'rows_without_event_id': sum(not row.get('event_id') for row in rows),
        'duplicate_nonempty_event_ids': {key: value for key, value in ids.items() if value > 1},
        'event_counts': dict(Counter(row.get('event', 'UNCLASSIFIED') for row in rows))},
    'judge_dispatch_receipts': receipts,
    'judge_dispatch_records': dispatch_records,
    'judge_dispatch_record_count': len(dispatch_records),
    'recorded_judge_calls_by_target': dict(Counter(str(row['target']) for row in dispatch_records)),
    'recorded_judge_calls_by_caller': dict(Counter(str(row['caller']) for row in dispatch_records)),
    'recorded_tool_return_states': dict(Counter(str(row['tool_returned_normally']) for row in dispatch_records)),
    'request_identity_scope': 'Checks identify preserved request JSON against its canonical receipt, not independently observed host wire bytes. The linked two-envelope correction supplies the reported extra LF without claiming wire capture.',
    'known_envelope_accounting_correction': identity(P / 'receipts/automation-impact-v1-envelope-accounting-correction.json'),
    'request_identity_check_counts': dict(Counter(row['request_check'] for row in request_checks)),
    'request_identity_checks': request_checks,
    'other_dispatch_receipts': linked,
    'known_capture_gap': 'The original native FINAL of research L2 correction v2 was not separately captured before compaction. The producer-written response and a later explicitly non-verbatim confirmation remain preserved.',
    'records_are_not_total_native_invocations': True,
    'complete_native_total_certified': False,
    'physical_attempts': 'UNKNOWN', 'tokens': 'UNKNOWN', 'cost': 'UNKNOWN',
    'historical_accounting': 'GLOBAL_UNRECONCILED',
    'financial_ceiling_guarantee': 'NOT_EXPOSED_BY_NATIVE_HOST',
    'usage_by_stage': {
        'initial_construction': 'Visible producer dispatches and outputs are preserved; usage/cost UNKNOWN.',
        'validation_and_correction': 'Judge dispatch records and exact responses are preserved separately; metadata corrections and replies are not extra interpretation requests. Usage/cost UNKNOWN.',
        'incremental_update': 'Consult actual maintenance receipts; a prepared mutation is not a rebuild request. Usage/cost UNKNOWN, never zero inferred from blocked work.',
        'daily_reads': 'Consumer CLI calls and returned UTF-8 bytes are measured by the bridge; byte quotas are not token or money estimates. Native consumer usage/cost UNKNOWN.'},
    'limitations': [
        'The ten initial aggregate ledger rows do not carry unique event IDs and cannot establish a complete invocation total.',
        'This snapshot does not certify exact host wire bytes, physical retry counts, billing or future completion.',
        'A later final review or handoff control is recorded after this snapshot rather than anticipated as an actual call.',
        'No campaign cost, savings percentage, zero-usage result or reset global budget is inferred.']}
destination.mkdir(parents=True)
(destination / 'receipt.json').write_text(json.dumps(record, ensure_ascii=False, indent=2) + '\n')
print(json.dumps({key: record[key] for key in ['observed_at_utc', 'judge_dispatch_record_count',
    'request_identity_check_counts', 'complete_native_total_certified', 'historical_accounting']}, ensure_ascii=False))
