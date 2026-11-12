#!/usr/bin/env python3
"""Read preserved S2 receipts; emit bounded observable accounting, not spend."""
import collections
import datetime
import hashlib
import json
from pathlib import Path
import re

ROOT = Path(__file__).resolve().parents[2]
OUT = Path(__file__).resolve().parent
D = ROOT / 'deliverable'


def sha(raw):
    return hashlib.sha256(raw).hexdigest()


def reference(path):
    path = Path(path)
    raw = path.read_bytes()
    return {'path': str(path.relative_to(ROOT)), 'sha256': sha(raw), 'byte_length': len(raw)}


def read(path):
    return json.loads(Path(path).read_text())


ledger_raw = (D / 'execution-ledger.jsonl').read_bytes()
ledger = [json.loads(line) for line in ledger_raw.splitlines()]
ledger_ref = reference(D / 'execution-ledger.jsonl')
groups = [
    ('resume-l1-desktop-r1', 'judgments/resume-l1/transport/desktop-web-visible-requests.json', 'calls', {1}, {2}, set()),
    ('resume-l1-app-desktop-r2', 'judgments/resume-l1/transport-r2/app-desktop/visible-requests.json', 'calls', {8, 10}, {9, 11}, {12}),
    ('resume-l1-design-r2', 'judgments/resume-l1/transport-r2/design/native-send-observations.complete.json', 'observations', set(), set(), set()),
    ('resume-l1-app-r3', 'corrections/l1-r3-app/transport/transport-receipt.json', 'submissions', set(), set(), set()),
    ('l2-desktop-r1', 'judgments/l2-r1/transport/desktop-web/transport/transport-record.json', 'calls_observed', set(), set(), set()),
    ('l2-app-r1', 'judgments/l2-r1/transport/app-session/transport/receipt.json', 'calls', set(), set(), set()),
    ('l2-design-r1', 'judgments/l2-r1/transport/design-tui/transport/native-call-log.json', 'calls', {1}, {2}, set()),
    ('l3-desktop-r1', 'judgments/l3-r1/transport/desktop-web/transport/transport-record.json', 'actual_native_send_calls', set(), set(), set()),
    ('l3-app-r1', 'judgments/l3-r1/transport/app-session/transport/receipts.json', 'calls', set(), set(), set()),
    ('l3-design-r1', 'judgments/l3-r1/transport/design-tui/transport/calls.json', 'calls', set(), set(), set()),
    ('l3-design-r2', 'judgments/l3-r2/transport/transport/calls.json', 'calls', set(), set(), set()),
    ('l4-desktop-r1', 'judgments/l4-r1/transport/desktop-web/transport/transport-record.json', 'events', set(), set(), {1}),
    ('l4-app-r1', 'judgments/l4-r1/transport/app-session/transport/receipts.json', 'calls', set(), set(), set()),
    ('l4-design-r1', 'judgments/l4-r1/transport/design-tui/transport/calls.json', 'records', set(), set(), set()),
    ('l4-entry-r1', 'judgments/l4-r1/transport/entry/transport/receipts.json', 'calls', {4}, {5}, {5}),
    ('l4-entry-r2', 'judgments/l4-r2/transport/transport-r2/receipts.json', 'calls', set(), set(), set()),
]
transport, calls, seen_receipts = [], [], set()
for name, relative, key, invalid, replacement, uncertain in groups:
    path = D / relative
    receipt_ref = reference(path)
    assert receipt_ref['sha256'] not in seen_receipts, 'Duplicate receipt selected as another transport group'
    seen_receipts.add(receipt_ref['sha256'])
    data = read(path)
    records = data[key]
    assert invalid.isdisjoint(replacement)
    for i, record in enumerate(records, 1):
        target = record.get('target', record.get('destination', record.get('request', {}).get('target')))
        assert target in ('/root/s2_resume_j1', '/root/s2_resume_j2')
        calls.append({'id': f'{name}:{i}', 'receipt_group': name, 'record_number': i, 'target': target,
                      'payload_disposition': 'INVALIDATED' if i in invalid else ('FULL_REPLACEMENT' if i in replacement else 'ORIGINAL_NO_KNOWN_INVALIDATION'),
                      'visible_result': 'CONTEXT_TRUNCATED_UNCERTAIN' if i in uncertain else 'RETURNED_NO_REPORTED_ERROR',
                      'host_serialized_bytes': 'NOT_EXPOSED', 'recipient_received_byte_attestation': 'NOT_EXPOSED'})
    transport.append({'id': name, 'receipt': receipt_ref, 'records_field': key, 'logical_calls': len(records),
                      'original_without_known_invalidation': len(records) - len(invalid) - len(replacement),
                      'invalidated_calls': len(invalid), 'full_replacements': len(replacement), 'uncertain_result_flags': len(uncertain)})
assert len(calls) == 113

construction = []
for layer in (1, 2, 3, 4):
    for unit in ('desktop-web', 'app-session', 'design-tui'):
        path = D / 'requests' / (f'l1-{unit}.md' if layer == 1 else f'l{layer}-{unit}-dispatch.md')
        construction.append({'artifact': f's2.l{layer}.{unit}', 'request': reference(path)})
construction.append({'artifact': 's2.l4.entry', 'request': reference(D / 'requests/l4-entry-dispatch.md')})
supplements = []
for unit in ('desktop-web', 'app-session', 'design-tui'):
    path = D / f'requests/l1-{unit}-supplements.json'
    supplements.append({'unit': unit, 'saved_message_texts': len(read(path)['messages']), 'request': reference(path), 'native_call_count': None})
correction_specs = [('l1-r2', 'corrections/l1-r2/producer-request.md', ['s2.l1.desktop-web', 's2.l1.app-session', 's2.l1.design-tui'], 24),
                    ('l1-app-r3', 'corrections/l1-r3-app/producer-request.md', ['s2.l1.app-session'], 38),
                    ('l3-design-r2', 'requests/l3-design-tui-r2-correction.md', ['s2.l3.design-tui'], 56),
                    ('l4-entry-r2', 'requests/l4-entry-r2-correction.md', ['s2.l4.entry'], 73)]
corrections = [{'id': name, 'request': reference(D / path), 'affected_artifacts': artifacts, 'dispatch_ledger_row': row} for name, path, artifacts, row in correction_specs]

review_files = [p for p in sorted((D / 'judgments').rglob('*')) if p.is_file() and re.search(r'(?:^|-)j[12]\.(?:json|md)$', p.name) and 'completeness' not in p.name]
responses = []
for path in review_files:
    raw = path.read_text()
    fenced = re.findall(r'```json\s*\n(.*?)\n```', raw, re.S)
    try:
        data = json.loads(fenced[0] if fenced else raw)
        entries = [{k: a.get(k) for k in ['key', 'body_sha256', 'verdict']} for a in data['artifacts']]
        reviewer = data['reviewer']
        basis = 'Exact original structured response metadata only; reasoning omitted'
    except (ValueError, KeyError, TypeError):
        assert path.name in ('desktop-web-r1-j1.md', 'desktop-web-r1-j2.md')
        reviewer = 'parallel-v3-fresh/S2/' + ('J1' if 'j1' in path.name else 'J2')
        entries = [{'key': 's2.l1.desktop-web', 'body_sha256': 'f680f5e2900f4e5039e0d9be32b4756db66de7d776d59ee0232c26555fd362f9', 'verdict': 'FIX-FIRST'}]
        assert ledger[24]['event'] == 'judge_decisions' and ledger[24]['verdicts'] == ['FIX-FIRST', 'FIX-FIRST']
        basis = 'Original prose response retained; identity/verdict also recorded in ledger row25'
    responses.append({'response': reference(path), 'reviewer': reviewer, 'artifacts': entries, 'metadata_basis': basis})
assert len(responses) == 18
assert sum(len(r['artifacts']) for r in responses) == 34

activation_specs = [('l1-app-r2', 'judgments/resume-l1/app-r2-seal-requests.json', 'messages'),
                    ('l2-r1', 'judgments/l2-r1/seal-requests.json', None),
                    ('l3-r1', 'judgments/l3-r1/seal-dispatch-receipt.json', 'calls'),
                    ('l3-r2', 'judgments/l3-r2/seal-dispatch-receipt.json', 'calls'),
                    ('l4-r1', 'judgments/l4-r1/seal-dispatch-receipt.json', 'calls'),
                    ('l4-r2', 'judgments/l4-r2/seal-dispatch-receipt.json', 'recipients')]
activations = []
for name, relative, key in activation_specs:
    path = D / relative
    data = read(path)
    records = data if key is None else data[key]
    targets = [record if isinstance(record, str) else record['target'] for record in records]
    assert set(targets) == {'/root/s2_resume_j1', '/root/s2_resume_j2'}
    activations.append({'batch': name, 'request_or_dispatch_receipt': reference(path), 'targets': targets, 'recorded_logical_calls': len(targets)})

historical = []
for unit, path, calls_count, uncertain in [
    ('desktop-web', ROOT / 'producers/desktop-web/transport-receipt.json', 18, 0),
    ('design-tui', ROOT / 'producers/design-tui/transport-receipt.json', 22, 0),
    ('app-session', D / 'history/late-original-app-transport/later-original-receipt.json', 28, 1)]:
    historical.append({'unit': unit, 'receipt': reference(path), 'historical_reported_calls': calls_count, 'historical_acceptance_unconfirmed': uncertain,
                       'new_calls_caused_by_preservation': 0, 'scope': 'Original-session producer relay only; not complete historical/root accounting'})

readback_specs = [
    ('s4-r3-discovery', ['evidence/s4-discovery-r3/branch-ref-connector.json', 'evidence/s4-discovery-r3/release-connector.json'], 54),
    ('s4-post-l3', ['evidence/s4-post-l3-recheck/branch-ref-connector.json', 'evidence/s4-post-l3-recheck/release-connector.json'], 63),
    ('ci-final-two-runs', ['evidence/ci-final-readbacks/run-43065851373-connector.json', 'evidence/ci-final-readbacks/run-43077975153-connector.json'], 65),
    ('final-s4-s2', ['evidence/final-remote-recheck-01/s4-branch-connector.json', 'evidence/final-remote-recheck-01/s2-branch-connector.json', 'evidence/final-remote-recheck-01/runtime-release-connector.json'], 74),
]
readbacks = []
for name, paths, row in readback_specs:
    refs = []
    for relative in paths:
        path = D / relative
        data = read(path)
        assert data.get('isError') is not True and isinstance(data.get('structuredContent'), dict)
        sc = data['structuredContent']
        refs.append({'envelope': reference(path), 'endpoint': sc.get('url', sc.get('display_url')), 'is_error': data.get('isError')})
    readbacks.append({'batch': name, 'ledger_row': row, 'observed_connector_returns': len(refs), 'returns': refs})

# Additional connector capture identities are an inventory, not another additive
# call total. Copies share a single hash identity; independent repeated GETs can
# return identical envelopes, so their physical/logical attempts are not inferred.
catalog = {}
catalog_roots = [D / 'evidence/s4-discovery-r3/support/original-responses', D / 'evidence/runtime-initial', ROOT / 'runtime-work/github']
paths = [p for folder in catalog_roots if folder.is_dir() for p in folder.rglob('*.json')]
paths += list((D / 'evidence').glob('s4-ci-*.json'))
for path in sorted(paths):
    try:
        data = read(path)
    except (ValueError, UnicodeError):
        continue
    if not isinstance(data, dict) or not isinstance(data.get('structuredContent'), dict) or not isinstance(data.get('content'), list):
        continue
    record = reference(path)
    identity = record['sha256']
    catalog.setdefault(identity, {'sha256': identity, 'byte_length': record['byte_length'], 'paths': []})['paths'].append(record['path'])

native_path = D / 'evidence/native-final-prepare/prepare-execution-receipt.json'
native = read(native_path)
assert reference(native_path)['sha256'] == '234d2a18c572b19bbc6cdc1df01a3e89f4e911ab446a403ff6905c01eb91a410'
assert native['native_package_sha256'] == '9356cefcb4a1db413e67869a855fd082536476fb18ff7784dde39f051e9b407b'
assert native['prepare_executed'] is True and native['exit_code'] == 1 and native['automatic_retries'] == 0
counts = collections.Counter(c['payload_disposition'] for c in calls)
verdicts = collections.Counter(a['verdict'] for r in responses for a in r['artifacts'])
index = {
    'schema': 'genesis-s2-observable-usage-index/v1', 'recorded_at': datetime.datetime.now(datetime.timezone.utc).isoformat(),
    'execution_id': '46d09d97-39a9-482a-a290-646ba1d94c99', 'source_revision': '1cde2ff7a71bcf7aecb5d030917b577165135d38',
    'native_package_sha256': native['native_package_sha256'], 'scope': 'Bounded local reconciliation of explicitly indexed preserved receipts; not exhaustive conversation/tool/provider accounting',
    'snapshot': {'execution_ledger': ledger_ref, 'ledger_rows': len(ledger)},
    'construction': {'saved_artifact_request_documents': len(construction), 'ledger_recorded_initial_author_activations': 12,
                     'activation_ledger_rows': [3, 4, 5, 42, 47, 50, 62], 'failed_initial_author_activation_calls': [{'ledger_row': 48, 'target': '/root/s2_author_design', 'result': 'thread-capacity rejection; no production presumed'}],
                     'unit_and_entry_requests': construction, 'supplemental_saved_texts': supplements,
                     'limits': 'L4 app and entry were one author activation with two artifact requests. Supplement text count is not a native call count. Support/coordination followups are not exhaustively indexed.'},
    'corrections': {'saved_logical_correction_batches': len(corrections), 'corrected_artifact_revisions': sum(len(x['affected_artifacts']) for x in corrections),
                    'batches': corrections, 'exact_native_activation_total': None,
                    'limit': 'Four ledger-backed correction batches; additional followup/scope-addition messages inside a batch are not promoted to unobserved exact call totals.'},
    'literal_review_transport': {'resumed_logical_send_message_calls': len(calls), 'payload_dispositions': dict(counts),
                                 'uncertain_context_truncated_result_flags': sum(c['visible_result'] == 'CONTEXT_TRUNCATED_UNCERTAIN' for c in calls),
                                 'uncertainty_is_overlapping_not_extra_calls': True, 'groups': transport,
                                 'call_index_file': 'transport-call-index.json', 'definition': 'Original/no-known-invalidation describes the payload history, not guaranteed delivery. An empty return without reported error is not a received-byte attestation.',
                                 'deduplication': 'One canonical preserved receipt per group, selected by exact path and SHA256; copies in producer/staging/history locations are not extra calls. Distinct per-group ordinals, including same-payload replacements, remain distinct actual logical calls.'},
    'judges': {'actual_semantic_response_documents': len(responses), 'artifact_verdict_entries_including_superseded_revisions': sum(len(r['artifacts']) for r in responses),
               'verdict_counts_including_history': dict(verdicts), 'current_accepted_artifacts': 13, 'current_accepted_pass_bindings': 26,
               'explicit_saved_activation_request_or_dispatch_calls': sum(x['recorded_logical_calls'] for x in activations), 'activation_batches': activations,
               'additional_ledger_only_review_activations': [{'ledger_row': 23, 'target': '/root/s2_resume_j1', 'batch': 'desktop L1r1'}, {'ledger_row': 34, 'target': '/root/s2_resume_j1', 'batch': 'desktop/design L1r2'}],
               'exact_total_review_activation_calls': None, 'one_failed_activation': {'ledger_row': 22, 'target': '/root/s2_resume_j1', 'result': 'thread-capacity rejection; later dispatched once'},
               'judge_context_initializations_separate_from_reviews': {'original_ready_records': [12, 13], 'resumed_ready_dispatch_records': [15, 16], 'old_handles_not_found_record': 14},
               'responses': responses, 'nonsemantic_completeness_check': {'request': reference(D / 'judgments/l4-r1/desktop-transport-completeness-request-j1.txt'), 'response': reference(D / 'judgments/l4-r1/desktop-transport-completeness-response-j1.md'), 'ledger_row': 69},
               'limits': 'Response documents are real preserved results, not inferred executions. Initial L1 J2 desktop, J2 desktop/design and both app-r3 review activations lack standalone dispatched-call receipts in this bounded index; their actual response documents remain present. Closure review is outside this preclosure snapshot.'},
    'native_prepare': {'logical_cli_invocations': 1, 'receipt': reference(native_path), 'state': native['state'], 'exit_code': native['exit_code'],
                       'started_at': native['started_at'], 'ended_at': native['ended_at'], 'automatic_retries': native['automatic_retries'],
                       'candidate_id': native['candidate_id'], 'binding_id': native['binding_id'], 'partial_cas_preserved': native['partial_cas_preserved'],
                       'scope': 'Own S2 final package only; prior setup/typecheck and other-session sample operations are not additional S2 prepare calls'},
    'readbacks': {'explicit_named_fresh_batches': readbacks, 'captured_returns_in_these_four_batches': sum(x['observed_connector_returns'] for x in readbacks),
                  'additional_capture_catalog_file': 'additional-connector-capture-index.json', 'additional_distinct_envelope_hashes': len(catalog),
                  'total_remote_read_calls': None, 'new_ci_runs_from_readbacks': False,
                  'limits': 'The four named batches are9 captured logical GET results, not a global read total. The additional catalog is non-additive: matching hashes collapse preserved copies, but separate repeated GETs can produce identical bytes. Initial source captures, all historical reads and every root/support tool call are not fully reconciled here.'},
    'consumers_and_update': {'consumer_state': 'NOT_RUN', 'planned_consumer_cases': 14, 'update_state': 'NOT_RUN', 'planned_update_case': 'S2-U1',
                             'scope': 'Explicit own-S2 execution state in ledger row75, consistent with failed native prepare and absent candidate/binding. No consumer/update execution total is inferred from other-session evidence.'},
    'publication_attempts': {'recorded_automatic_approval_rejections': 2, 'ledger_rows': [19, 26], 'result': 'No remote tree write from these rejected requests',
                            'prior_claim_commit_is_history': True, 'global_remote_mutation_total': None},
    'historical_original_session': {'reported_producer_relay_calls': sum(x['historical_reported_calls'] for x in historical), 'groups': historical,
                                   'late_receipt_observation': reference(D / 'history/late-original-app-transport/observation.json'),
                                   'included_in_resumed113': False, 'global_history_state': 'GLOBAL_UNRECONCILED', 'owner': 'ROOT',
                                   'limit': 'These68 historical producer-relay calls are retained evidence, not newly issued calls and not the full original-session or campaign total.'},
    'provider_telemetry': {'physical_provider_attempts': 'UNKNOWN', 'input_tokens': 'UNKNOWN', 'output_tokens': 'UNKNOWN', 'cached_tokens': 'UNKNOWN', 'billing': 'UNKNOWN', 'global_history': 'GLOBAL_UNRECONCILED', 'owner': 'ROOT'},
    'independently_recoverable_local_gaps': [
        {'gap': 'L4 entry-r2 two sends and two review activations have actual preserved receipts but no separate ledger events before row75.', 'resolution': 'Root may append references to those existing actual receipts without new calls or reconstructing spend.'},
        {'gap': 'Some initial L1 review activations are represented by actual response files and partial ledger entries rather than standalone exact dispatched-request/result records.', 'resolution': 'If original visible conversation arguments/results remain accessible, preserve those exact records. Otherwise retain UNKNOWN exact activation total; do not manufacture envelopes.'},
        {'gap': 'Support/coordination and original source-retrieval totals are not complete in this scoped index.', 'resolution': 'Existing additional connector envelopes and retained archives can support further bounded identity indexing if a required gate demands it; do not equate capture/hash counts with physical attempts.'},
    ],
    'forbidden_inferences': ['No filesystem-copy count is treated as another call.', 'No late archival observation is treated as a new send.', 'No token/billing/provider-attempt estimate is synthesized.', 'No semantic PASS is promoted to runtime, consumer, CI or global acceptance.', 'No raw judge reasoning or reserved consumer expected answers appear in this index.'],
}
for name, value in [('transport-call-index.json', calls), ('additional-connector-capture-index.json', list(catalog.values()))]:
    path = OUT / name
    with path.open('x') as f:
        f.write(json.dumps(value, ensure_ascii=False, indent=2) + '\n')
index['support_files'] = [reference(OUT / 'transport-call-index.json'), reference(OUT / 'additional-connector-capture-index.json'), reference(Path(__file__))]
with (OUT / 'observable-usage-index.json').open('x') as f:
    f.write(json.dumps(index, ensure_ascii=False, indent=2) + '\n')
print(json.dumps({'index': reference(OUT / 'observable-usage-index.json'), 'resumed_transport': len(calls), 'payload_counts': dict(counts),
                  'uncertain_result_flags': 3, 'semantic_responses': len(responses), 'artifact_verdict_entries': 34, 'verdict_counts': dict(verdicts),
                  'explicit_saved_review_activations': 12, 'ledger_only_review_activations': 2, 'historical_producer_relays_separate': 68,
                  'named_readback_returns': 9, 'additional_distinct_envelope_hashes_nonadditive': len(catalog)}, indent=2))
