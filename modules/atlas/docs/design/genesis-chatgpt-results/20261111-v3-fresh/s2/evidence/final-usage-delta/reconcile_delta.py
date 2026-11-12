#!/usr/bin/env python3
"""Bounded local receipt reconciliation; no remote/runtime/model operations."""
from pathlib import Path
import hashlib
import json
from datetime import datetime, timezone

ROOT = Path('/workspace/scratch/7b5d6430f420/genesis-s2')
OUT = ROOT / 'closure-work/final-usage-delta'
D = ROOT / 'deliverable'
C = D / 'judgments/final-closure-r1'

def sha(b):
    return hashlib.sha256(b).hexdigest()

def ref(p):
    b = p.read_bytes()
    return {'path': str(p.relative_to(ROOT)), 'sha256': sha(b), 'byte_length': len(b)}

def read(p):
    return json.loads(p.read_text())

def save(name, obj):
    p = OUT / name
    data = (json.dumps(obj, ensure_ascii=False, indent=2) + '\n').encode()
    with p.open('xb') as f:
        f.write(data)
    return ref(p)

oldpath = D / 'evidence/observable-usage-01/observable-usage-index.json'
old = read(oldpath)
assert old['literal_review_transport']['resumed_logical_send_message_calls'] == 113
assert old['judges']['actual_semantic_response_documents'] == 18
frozen = D / 'history/ledger-at-final-closure-review.jsonl'
fb = frozen.read_bytes()
assert len(fb.splitlines()) == 79
assert sha(fb) == '45a3d4abb9ba101af7e739ff17071b9b176f16c4704b958c5506474c32c22450'
live = (D / 'execution-ledger.jsonl').read_bytes()
assert live.startswith(fb)
assert len(live.splitlines()) >= 82
observed82 = b''.join(live.splitlines(keepends=True)[:82])
with (OUT / 'ledger-observed-82-rows.jsonl').open('xb') as f:
    f.write(observed82)
rows = [json.loads(x) for x in observed82.splitlines()]
assert rows[79]['actual_send_calls'] == 13
assert rows[79]['actual_judge_activations'] == 2
assert rows[80]['actual_read_only_github_calls'] == 3
assert rows[81]['actual_read_only_github_calls'] == 1

a = read(C/'transport-a/completion.json')
b = read(C/'transport-b/transport-receipt.json')
c = read(C/'transport-c/receipt.json')
replacement = read(C/'transport-c-replacement/receipt.json')
assert a['actual_send_message_calls'] == b['actual_send_calls'] == c['actual_judge_delivery_calls'] == 4
assert replacement['actual_calls'] == 1
assert c['invalidated_calls'] == 1
assert sum(x['observed_return'] == 'UNCERTAIN_TRUNCATION' for x in a['calls']) == 1
calls = []
for group, nums, files in [
    ('a', [1,1,2,2], [f'transport-a/call-{i:02d}.request.json' for i in range(1,5)]),
    ('b', [3,3,4,4], [f'transport-b/call-{i:02d}-arguments.json' for i in range(1,5)]),
    ('c', [5,5,6,6], ['transport-c/part-005-judge-1-arguments.json','transport-c/part-005-judge-2-arguments.json','transport-c/part-006-judge-1-arguments.json','transport-c/part-006-judge-2-arguments.json']),
    ('replacement', [5], ['transport-c-replacement/arguments.json']),
]:
    for n, (part, filename) in enumerate(zip(nums, files), 1):
        p = C / filename
        args = read(p)
        message = args['message'].encode()
        literal = (C/f'packet/parts/part-{part:03d}-of-006.txt').read_bytes()
        invalid = group == 'c' and n == 2
        replace = group == 'replacement'
        if replace:
            prefix = (C/'transport-c-replacement/prefix.txt').read_bytes()
            assert message == prefix + literal
        elif invalid:
            diff = [(i,x,y) for i,(x,y) in enumerate(zip(literal,message)) if x != y]
            assert len(literal) == len(message) and diff == [(19279, 93, 125)]
        else:
            assert message == literal
        calls.append({
            'group': group, 'ordinal': n, 'part': part, 'target': args['target'],
            'arguments': ref(p), 'visible_message_sha256': sha(message),
            'visible_message_bytes': len(message),
            'payload_disposition': 'INVALIDATED' if invalid else 'FULL_REPLACEMENT' if replace else 'ORIGINAL_NO_KNOWN_INVALIDATION',
            'uncertain_return_flag': group == 'a' and n == 4,
            'local_literal_matches': not invalid,
            'host_serialization_attested': False,
        })
assert len(calls) == 13
call_index = save('closure-call-index.json', {'schema':'genesis-s2-closure-call-index/v1', 'calls':calls})

activation_refs = []
for j in ('j1','j2'):
    receipt = read(C/f'seal-{j}-dispatch-receipt.json')
    args = read(C/f'seal-{j}-visible-arguments.json')
    msg = args['message'].encode()
    assert sha(msg) == receipt['visible_message_sha256']
    assert len(msg) == receipt['visible_message_bytes']
    assert receipt['actual_calls'] == 1
    activation_refs.append({'target':args['target'],'actual_calls':1,'receipt':ref(C/f'seal-{j}-dispatch-receipt.json'),'arguments':ref(C/f'seal-{j}-visible-arguments.json')})

responses = []
for j in ('j1','j2'):
    p = C/f'{j}.json'
    o = read(p)
    assert o['transport']['status'] == 'COMPLETE'
    assert o['packet_sha256'] == '069416fb6b9d6fe2b0d2c12664f9283a09dddd761d08392f1026b5ca948b8410'
    ids = [i for g in o['criterion_groups'] for i in g['ids']]
    assert len(ids) == len(set(ids)) == 50
    responses.append({'reviewer':o['reviewer'], 'response':ref(p), 'response_kind':'FINAL_CLOSURE_ASSESSMENT', 'not_new_artifact_verdict_entries':True, 'transport_status':o['transport']['status'], 'parts_confirmed':o['transport']['parts_present'], 'criterion_ids_count':len(ids), 'peer_reasoning_copied':False})

evidence_paths = [oldpath, frozen, C/'packet/packet-manifest.json', C/'transport-preservation.json']
for dirname in ('transport-a','transport-b','transport-c','transport-c-replacement'):
    evidence_paths.extend(p for p in sorted((C/dirname).rglob('*')) if p.is_file())
evidence_paths.extend(C/f'seal-{j}-{suffix}' for j in ('j1','j2') for suffix in ('dispatch-receipt.json','visible-arguments.json','dispatched.txt','returned-content.txt'))
evidence_paths.extend(C/f'{j}.json' for j in ('j1','j2'))
evidence_paths.extend(p for p in sorted((D/'evidence/post-native-remote-recheck').glob('*')) if p.is_file())
evidence_paths.extend([D/'evidence/final-repository-metadata.json',D/'evidence/final-repository-metadata-connector.json'])
manifest = save('source-receipt-manifest.json', {'schema':'genesis-s2-usage-delta-source-manifest/v1','files':[ref(p) for p in sorted(set(evidence_paths))], 'scope':'Exact preserved record identities; hashes do not count operations or attest host serialization.'})

postread = read(D/'evidence/post-native-remote-recheck/readback-receipt.json')
repometa = read(D/'evidence/final-repository-metadata.json')
assert postread['actual_read_only_github_calls'] == 3
assert repometa['actual_read_only_github_calls'] == 1
delta = {
    'schema':'genesis-s2-final-observable-usage-delta/v1',
    'recorded_at':datetime.now(timezone.utc).isoformat(),
    'actor':'/root/s2_final_usage_delta',
    'execution_id':'46d09d97-39a9-482a-a290-646ba1d94c99',
    'scope':'Bounded reconciliation of current preserved receipts after the immutable 79-row closure snapshot. Not an exhaustive tool/conversation/provider inventory.',
    'root_only':True,
    'source_revision':'1cde2ff7a71bcf7aecb5d030917b577165135d38',
    'native_package_sha256':'9356cefcb4a1db413e67869a855fd082536476fb18ff7784dde39f051e9b407b',
    'ledger_boundary':{'immutable79':ref(frozen),'immutable79_prefix_verified':True,'observed82_copy':ref(OUT/'ledger-observed-82-rows.jsonl'),'current_rows_at_local_read':len(live.splitlines()),'scope':'Only frozen rows 1–82 evaluated here. Subsequent root operations require their own event records.'},
    'prior_index':ref(oldpath),
    'source_receipt_manifest':manifest,
    'literal_review_transport':{
        'prior_resumed_indexed_send_calls':113,'new_closure_send_calls':13,'combined_resumed_indexed_send_calls':126,
        'new_payload_dispositions':{'ORIGINAL_NO_KNOWN_INVALIDATION':11,'INVALIDATED':1,'FULL_REPLACEMENT':1},
        'combined_payload_dispositions':{'ORIGINAL_NO_KNOWN_INVALIDATION':114,'INVALIDATED':6,'FULL_REPLACEMENT':6},
        'prior_uncertain_return_flags':3,'new_uncertain_return_flags':1,'combined_uncertain_return_flags':4,
        'flags_are_overlapping_not_extra_calls':True,'new_automatic_retries':0,
        'call_index':call_index,
        'recipient_resolution':{'both_actual_responses':'COMPLETE, parts 1–6','j2_part2':'Actual J2 response explicitly confirms complete receipt despite sender-side truncated returned result. Historical uncertainty flag retained.','j2_part5':'Actual J2 response explicitly uses the correct full replacement and discards the invalid initial send.','not_claimed':'No independently recomputed host serialized-byte attestation.'},
        'already_recorded_in_current_ledger_row':80,
        'deduplication':'Copies and preservation operations are not new sends. Known-input replacement is a distinct actual send.'
    },
    'review_activations':{'new_actual_closure_activations':2,'new_receipts':activation_refs,'prior_explicit_saved_activation_request_or_dispatch_calls':12,'combined_explicit_saved_calls':14,'prior_additional_ledger_only_activations':2,'exact_all_review_activation_total':'UNKNOWN','already_recorded_in_current_ledger_row':80,'limits':'Standalone exact envelopes remain absent for initial L1 J2 desktop, initial J2 desktop/design r2, and both app r3 activations; prior actual responses remain preserved. Do not infer missing physical attempts.'},
    'returned_reviews':{'prior_artifact_review_response_documents':18,'prior_artifact_verdict_entries_including_history':34,'prior_artifact_verdict_counts':{'PASS':26,'FIX-FIRST':8},'current_accepted_artifacts':13,'current_accepted_artifact_pass_bindings':26,'new_closure_response_documents':2,'combined_review_documents_in_this_bounded_index':20,'responses':responses,'new_closure_docs_are_not_additional_artifact_verdicts':True,'ledger_status_at82':'Actual returned closure decisions not yet separately appended; row80 still records pending recipient confirmation.'},
    'read_only_github_observations':{'new_calls':4,'post_native_dependency_calls':3,'repository_metadata_calls':1,'prior_named_recent_batches_calls':9,'combined_named_recent_batches_calls':13,'all_remote_read_call_total':'UNKNOWN','existing_rows':[81,82],'post_native_receipt':ref(D/'evidence/post-native-remote-recheck/readback-receipt.json'),'repository_metadata_receipt':ref(D/'evidence/final-repository-metadata.json'),'additional_capture_hash_catalog':'42 distinct envelope hashes in prior catalog, NONADDITIVE and not a physical attempt count.','remote_writes_from_these_reads':0,'new_ci_runs':0},
    'current_support_scope':{
        'parent_reported_activations':[
            {'target':'/root/s2_closure_audit','operation':'followup_task for frozen S2-U1 binding audit','observed_count':1,'basis':'Parent task statement; exact host envelope not supplied to this support worker.'},
            {'target':'/root/s2_final_usage_delta','operation':'spawn_agent for this bounded accounting delta','observed_count':1,'basis':'This actual task delivery and resulting local work establish activation. In inherited parent transcript spawn result was marked aborted; do not erase that discrepancy or claim a normal host result.'}
        ],
        'bounded_parent_reported_activation_count':2,
        'all_support_coordination_call_total':'UNKNOWN',
        'this_worker_actual_parent_status_messages_before_receipt':1,
        'limits':'A support activation is separate from a judge activation, artifact verdict or provider-attempt count. Additional final coordination and later root work are outside this snapshot.'
    },
    'unchanged_operational_states':{'native_prepare_invocations':1,'native_prepare_exit_code':1,'native_retries':0,'consumer_cases':14,'consumer_state':'NOT_RUN','update_case':'S2-U1','update_state':'NOT_RUN','candidate_id':None,'binding_id':None,'artifact_revision':None},
    'provider_telemetry':old['provider_telemetry'],
    'historical_original_relay_calls':{'count':68,'included_in_126':False,'new_calls_from_preservation':0,'scope':'Original-session producer relay only, separate from resumed review transport.','history_state':'GLOBAL_UNRECONCILED','owner':'ROOT'},
    'remaining_precise_gaps':[
        'No exact total for initial review activation calls: some standalone visible request/result envelopes were not found. Actual responses and partial ledger entries remain.',
        'Current support/coordination and original source retrieval totals are not exhaustively indexed. Local file counts and capture hash counts cannot fill this gap.',
        'Physical provider attempts, tokens, cache tokens, cost and billing are not exposed and remain UNKNOWN.',
        'Historical campaign reconciliation and common reservation/adapter-envelope guarantees remain GLOBAL_UNRECONCILED/ROOT; no new budget compliance is inferred.',
        'This record evaluates only receipts available at its bounded cutoff. Later root GETs, record-completion review or export operations must be recorded separately if performed.'
    ],
    'suggested_ledger_appends':[
        {'event':'FINAL_CLOSURE_RESPONSES_PRESERVED_AND_TRANSPORT_CONFIRMED','new_actual_closure_response_documents':2,'j1_response':ref(C/'j1.json'),'j2_response':ref(C/'j2.json'),'recipient_completeness':'COMPLETE','historical_send_counts_unchanged':True,'new_artifact_verdict_entries':0,'current_artifact_acceptances_unchanged':True},
        {'event':'POST_SNAPSHOT_OBSERVABLE_USAGE_RECONCILED','bounded_combined_resumed_send_calls':126,'invalidated':6,'replacements':6,'uncertain_result_flags':4,'separate_closure_responses':2,'new_native_or_remote_operations_from_accounting':0,'telemetry':'UNKNOWN','history':'GLOBAL_UNRECONCILED','root_action':'Append this finalized receipt path/hash; do not duplicate already-recorded rows80–82 as new calls.'},
        {'event':'FINAL_RECORD_SUPPORT_ACTIVATIONS_OBSERVED','scope':'Two parent-reported bounded support activations, with the own-spawn aborted-return discrepancy retained; exact host envelopes not available to this worker.','count':2,'global_support_total':'UNKNOWN'}
    ],
    'forbidden_inferences':old['forbidden_inferences'] + ['No artifact verdict, closure disposition or expectation validation is treated as runtime acceptance.','No prior pending receipt is silently rewritten after actual recipient confirmation.'],
    'writer':ref(Path(__file__).resolve())
}
receipt = save('observable-usage-delta.json', delta)
notes = '''# Final observable usage delta

This receipt reconciles existing records after the immutable 79-row closure snapshot. It does not execute runtime work, call GitHub, dispatch judges, or modify canonical files.

| Bounded category | Prior index | New closure/post-snapshot records | Combined scope |
|---|---:|---:|---:|
| Resumed literal review sends | 113 | 13 | 126 |
| Known invalidated sends | 5 | 1 | 6 |
| Full replacement sends | 5 | 1 | 6 |
| Truncated-return uncertainty flags | 3 | 1 | 4 |
| Explicit saved review activation calls | 12 | 2 | 14 |
| Artifact-review response documents | 18 | 0 | 18 |
| Final closure response documents | 0 | 2 | 2 |
| Named recent GitHub GET results | 9 | 4 | 13 |

The four uncertainty flags overlap sends; they are not four additional calls. J2's actual response confirms the complete formerly uncertain part 2 and the valid full replacement part 5. The initial wrong-byte part 5 remains invalidated and preserved. Both actual closure responses report all six parts complete. These statements do not attest host serialization.

The 18 artifact-review documents contain 34 historical artifact verdict entries: 26 PASS and 8 superseded FIX-FIRST. The 13 exact current artifacts retain 26 selected PASS bindings. The two closure responses are a separate document class and do not add artifact verdict entries.

Current canonical ledger rows 80–82 already record 13 sends, two review activations, three post-native GETs and one repository-metadata GET. Do not append these as new calls again. Append both actual returned closure responses and their receipt-confirmation outcome, then reference this bounded delta. The historical 79-row snapshot and observed 82-row copy remain immutable.

Two narrowly observed current support activations are reported separately: the S2-U1 audit followup and this accounting worker. Exact host envelopes were not supplied. The inherited parent view marked this worker's spawn return `aborted`, although actual task delivery and work establish activation; preserve both observations. Global support/coordination totals remain unknown.

Still unavailable: exact total of early review activation calls (including missing standalone J2 desktop, J2 desktop/design r2, and both app-r3 envelopes), exhaustive support/source-read totals, provider physical attempts, tokens and billing. The 42 additional capture hashes are non-additive. The 68 original-session producer relay calls remain separate from the 126 resumed sends. Historical usage remains GLOBAL_UNRECONCILED under ROOT.

Native state remains one failed prepare, no retry, no candidate or binding, 14 consumers NOT_RUN and S2-U1 NOT_RUN. No accepted-content body changed. This file is root-only support and contains no raw peer reasoning or reserved consumer answers.

Later root operations, including a new dependency recheck, final record-completion review or export, are outside this cutoff and require their own truthful records.
'''
with (OUT/'notes.md').open('x') as f:
    f.write(notes)
print(json.dumps({'receipt':receipt,'notes':ref(OUT/'notes.md'),'manifest':manifest,'calls':call_index,'current_ledger_rows_at_read':len(live.splitlines()),'checks':'All local count, literal-byte, packet, snapshot-prefix and response-completeness assertions passed.'},indent=2))
