#!/usr/bin/env python3
"""Append actual record-check results and freeze local blocked-return records."""
from pathlib import Path
import collections
import datetime
import hashlib
import json
import re
import shutil

R = Path('/workspace/scratch/7b5d6430f420/genesis-s2')
D = R / 'deliverable'
J = D / 'judgments/final-record-check-r1'


def now():
    return datetime.datetime.now(datetime.timezone.utc).isoformat()


def pin(p):
    b = p.read_bytes()
    return {'path': p.relative_to(D).as_posix(), 'byte_length': len(b),
            'sha256': hashlib.sha256(b).hexdigest()}


def read(p):
    return json.loads(p.read_text())


def save(p, obj):
    with p.open('x') as f:
        f.write(json.dumps(obj, ensure_ascii=False, indent=2) + '\n')
    return pin(p)


def append(event, **kwargs):
    with (D / 'execution-ledger.jsonl').open('a') as f:
        f.write(json.dumps({'event': event, 'recorded_at': now(), **kwargs}, ensure_ascii=False) + '\n')


def main():
    responses = {name: read(J / f'{name}.json') for name in ('j1', 'j2')}
    for n, o in responses.items():
        assert o['reviewer'].endswith('/' + n.upper())
        assert o['ready_for_INCOMPLETE_BLOCKED_after_export'] is True
        assert o.get('native_package_sha256', o.get('input_manifest', {}).get('native_package_sha256')) == '9356cefcb4a1db413e67869a855fd082536476fb18ff7784dde39f051e9b407b'
    assert pin(D / 'native-package.json')['sha256'] == '9356cefcb4a1db413e67869a855fd082536476fb18ff7784dde39f051e9b407b'
    review_refs = {n: pin(J / f'{n}.json') for n in responses}
    latest = read(D / 'evidence/return-readback-02/readback-receipt.json')
    assert latest['same_release_bytes_as_attempted_implementation_discovery'] is True
    latest_ref = pin(D / 'evidence/return-readback-02/readback-receipt.json')
    history = D / 'history/records-before-final-blocked-return'
    history.mkdir()
    for rel in ('work.md','handoff.json','execution-ledger.jsonl','evidence/final-local-gates.json','evidence/final-record-consolidation.json'):
        dst = history / rel
        dst.parent.mkdir(parents=True, exist_ok=True)
        shutil.copyfile(D / rel, dst)
    closure = {'schema':'genesis-s2-final-record-correction-resolution/v1','recorded_at':now(),
       'scope':'Actual same-pair bounded record correction only; no new artifact or operational verdict.',
       'packet_sha256':'a390d8681f142aabe0310e1289c01d5de36c7d32a23a6adc0dbb21e3539d57ae',
       'responses':review_refs,'both_ready_for_INCOMPLETE_BLOCKED_after_export':True,
       'resolved_record_findings':['J1-CLOSURE-04','CLOSURE-J2-F3'],
       'remaining_material_blockers':['Compatible complete-input runtime and exact bindings','Fourteen local consumers and S2-U1/recovery execution','Public disclosure authorization and exact S2 CI/publication/seal/readback','Applicable shared reservation/adapter-envelope guarantee'],
       'retained_criteria':{'PASS':9,'HOLD':41},'retained_accepted_content_artifacts':13,
       'later_read_only_observation':latest_ref,
       'remaining_mechanics':'The actual responses are preserved here. Complete archive verification is performed next and its external manifest/receipt must accompany the delivered ZIP.',
       'delivery_complete':False,'completion_state':'INCOMPLETE_BLOCKED'}
    closure_ref = save(D / 'evidence/final-record-correction-resolution.json', closure)
    usage = {'schema':'genesis-s2-final-return-observable-usage/v1','recorded_at':now(),
       'previous_bounded_delta':pin(D/'evidence/final-usage-delta/reconciled-01/observable-usage-delta.json'),
       'judge_send_message_calls_indexed':126,'invalidated_send_message_calls':6,'full_replacements':6,'uncertain_return_flags':4,
       'flags_overlap_calls':True,'additional_record_check_followup_task_calls':2,'followup_calls_are_dispatch_and_activation_once':True,
       'explicit_saved_review_activation_calls_indexed':16,'exact_all_review_activation_total':'UNKNOWN',
       'artifact_review_response_documents':18,'final_closure_response_documents':2,'record_correction_response_documents':2,
       'artifact_verdict_entries_unchanged':34,'artifact_current_pass_bindings_unchanged':26,
       'post_79_snapshot_read_only_github_gets':10,'named_recent_indexed_gets':19,'all_github_get_total':'UNKNOWN',
       'bounded_current_support_activations':3,'bounded_principal_to_usage_support_coordination_messages':1,
       'all_support_coordination_total':'UNKNOWN','original_session_relay_calls_separate':68,
       'native_prepare_invocations':1,'native_prepare_exit_code':1,'native_retries':0,
       'consumer_runs':0,'update_runs':0,'new_remote_writes_since_refusals':0,
       'tokens':'UNKNOWN','billing':'UNKNOWN','physical_provider_attempts':'UNKNOWN','historical_accounting':'GLOBAL_UNRECONCILED','historical_owner':'ROOT',
       'record_check_receipt':pin(J/'transport/receipt.json'),'record_check_responses':review_refs,'last_three_gets':latest_ref,
       'support_observation_limits':pin(D/'evidence/principal-current-support-observation.json'),
       'limits':['No hidden/provider/total-native-call inventory is inferred.','Original missing activation envelopes, nonexhaustive support/source totals and worker/root visible-return discrepancy remain preserved.','Final export is a subsequent deterministic local file operation, recorded in its external actual receipt; it adds no model/runtime/provider call.']}
    usage_ref = save(D/'evidence/final-return-observable-usage.json', usage)
    append('FINAL_RECORD_CORRECTION_RESPONSES_PRESERVED', responses=review_refs,
           resolution=closure_ref, actual_returned_record_responses=2, new_artifact_verdicts=0,
           record_findings_satisfied=True, operational_blockers_unchanged=True)
    append('FINAL_RETURN_OBSERVABLE_ACCOUNTING', receipt=usage_ref,
           already_recorded_operations_not_recounted=True, native_telemetry='UNKNOWN', historical='GLOBAL_UNRECONCILED')
    # Current obligations are recorded separately from preserved historical vetoes/prompts.
    scan = {'schema':'genesis-s2-final-current-queue-disposition/v1','recorded_at':now(),
       'current_files':['work.md','handoff.json','native-package.json','evidence/final-local-gates.json','evidence/final-criterion-matrix.json'],
       'current_open_operational_gates':['G-RUNTIME','G-BINDING','G-CONSUMERS','G-UPDATE','G-RECOVERY','G-CI','G-PUBLICATION','G-CLOSURE'],
       'current_accounting_gap':'G-PROVENANCE retains shared route/reservation/adapter proof and explicitly unavailable telemetry; current bounded records reconciled.',
       'current_independent_record_findings':[],
       'current_mechanical_action':'Complete ZIP export and actual external integrity receipt after freezing these records.',
       'historical_open_labels':'Prior DRAFT, FIX-FIRST, REQUEST_EVIDENCE, pending transport acknowledgments and PLANNED_ABSENT labels remain in original requests, decisions, snapshots and archives. Superseding exact responses/current records resolve their bookkeeping scopes; they are not silently erased.',
       'remaining_specification_detail':'S2-U1 exact mutation/result/control fixtures absent from frozen records, explicitly identified; bind before future execution, without rewriting the original oracle.',
       'no_claim':'No current open operational obligation is relabeled N/A, PASS or delegated away.'}
    scan_ref = save(D/'evidence/final-current-queue-disposition.json', scan)
    append('FINAL_BLOCKED_RETURN_RECORD_FREEZE', completion_state='INCOMPLETE_BLOCKED', delivery_complete=False,
           native_package_sha256='9356cefcb4a1db413e67869a855fd082536476fb18ff7784dde39f051e9b407b',
           artifact_revision=None, current_queue_disposition=scan_ref,
           export_plan={'tool':'evidence/export-support/build_review_zip.py','output':'genesis-s2-resumed-review-package.zip','external_manifest':'genesis-s2-review-manifest.json','external_actual_receipt':'export-receipt.json','status_at_freeze':'TO_BE_EXECUTED_NEXT'},
           publication_authorized=False, remote_writes=0)
    ledger_ref = pin(D/'execution-ledger.jsonl')
    ledger_rows = len((D/'execution-ledger.jsonl').read_text().splitlines())
    work = D/'work.md'
    original = work.read_text()
    addendum = f'''\n## Conferência final dos registros e retorno bloqueado\n\nOs mesmos juízes receberam o delta completo e concluíram que os achados de registro J1-CLOSURE-04 e CLOSURE-J2-F3 foram satisfeitos. Ambos permitem o retorno INCOMPLETE_BLOCKED após preservar as respostas reais e verificar a exportação completa. Os 13 aceites de conteúdo e os estados originais dos 50 critérios permanecem inalterados. Pareceres: [j1.json](sandbox:{J/'j1.json'}) e [j2.json](sandbox:{J/'j2.json'}).\n\nA última releitura, em {latest['recorded_at']}, confirmou HEAD S2 `{latest['own_branch_head']}` e descoberta S4 `{latest['s4_discovery']['commit']}`. O release e o candidato são exatamente os mesmos, com a incompatibilidade observada. Recibo: [readback-receipt.json](sandbox:{D/latest_ref['path']}).\n\nA consolidação final do ledger contém {ledger_rows} registros. Além do índice anterior, foram preservadas duas ativações/entregas de conferência de registros e suas duas respostas reais, uma ativação de suporte de transporte e três GETs finais. Os totais delimitados são 126 send_message de revisão, 16 ativações de revisão com registros explícitos, 18 respostas de artefatos + 2 de fechamento + 2 de correção de registros, e 19 GETs de lotes recentes indexados. Isso não é total de chamadas físicas, de suporte ou de toda a sessão. Os 6 envios invalidados, 6 substituições e 4 flags sobrepostas permanecem históricos; tokens/cobrança/tentativas físicas continuam UNKNOWN, e o agregado histórico GLOBAL_UNRECONCILED. [final-return-observable-usage.json](sandbox:{D/usage_ref['path']}).\n\nNão resta correção independente de registros exigida por esse par. Permanecem as dependências concretas de runtime/binding, consumidores/manutenção/recuperação, autorização pública/CI/selagem e garantia compartilhada de reservas/adapter. A fila atual e a distinção entre labels históricos e pendências atuais estão preservadas em [final-current-queue-disposition.json](sandbox:{D/scan_ref['path']}).\n\nA exportação completa é uma operação mecânica posterior a este congelamento. Seu manifesto externo e export-receipt.json, entregues junto ao ZIP, são a evidência real de todos os membros, hashes, releitura e estabilidade da árvore; não há hash autorreferente no handoff. Um ZIP íntegro preserva este estado bloqueado e não comprova entrega operacional completa ou autorização de upload.\n'''
    work.write_text(original + addendum)
    work_ref = pin(work)
    hand = read(D/'handoff.json')
    hand['recorded_at'] = now()
    hand['work_identity'] = work_ref
    hand['ledger_identity'] = ledger_ref
    hand['record_correction_reviews'] = list(review_refs.values())
    hand['record_correction_resolution'] = closure_ref
    hand['last_dependency_readback'] = latest_ref
    hand['observed_branch_head'] = latest['own_branch_head']
    hand['consumed_dependencies'] = [{'session':'S4','discovery':latest['s4_discovery'],'readback':latest_ref,'compatibility':'NOT_COMPATIBLE_FOR_COMPLETE_S2_INPUTS'}]
    hand['independent_record_work'] = {'status':'COMPLETE_ASSESSED_BY_SAME_PAIR','resolved_findings':['J1-CLOSURE-04','CLOSURE-J2-F3'],'responses':review_refs,'remaining_record_corrections':[],
       'remaining_mechanical_delivery':'Actual full export and integrity receipt follow this freeze; use accompanying external export-receipt.json as proof, not this prospective field.'}
    hand['accounting']['final_return_delta'] = usage_ref
    hand['current_queue_disposition'] = scan_ref
    hand['export_binding'] = {'zip':'genesis-s2-resumed-review-package.zip','manifest':'genesis-s2-review-manifest.json','actual_receipt':'export-receipt.json','external_to_payload':True,'reason':'Avoid self-referential archive/hash cycle; these external files bind this handoff by exact bytes.'}
    # Remove only the now-resolved review-preparation sentence from the current copied gate description.
    for g in hand['local_obligations_open']:
        if g['id']=='G-CLOSURE':
            g['remaining']='Operational gates remain open. Both actual record corrections are satisfied; exact complete export is verified by the external receipt. DELIVERY_COMPLETE remains false.'
            g['existing_evidence'].append(closure_ref['path'])
    (D/'handoff.json').write_text(json.dumps(hand,ensure_ascii=False,indent=2)+'\n')
    handoff_ref = pin(D/'handoff.json')
    final = {'schema':'genesis-s2-final-blocked-return-identities/v1','recorded_at':now(),
       'work':work_ref,'handoff':handoff_ref,'ledger':ledger_ref,'ledger_rows':ledger_rows,
       'native_package':pin(D/'native-package.json'),'matrix':pin(D/'evidence/final-criterion-matrix.json'),
       'record_resolution':closure_ref,'usage':usage_ref,'queue_disposition':scan_ref,
       'latest_dependency_readback':latest_ref,'completion_state':'INCOMPLETE_BLOCKED','delivery_complete':False,
       'no_new_runtime_or_remote_write':True,'archive_integrity_source':'Accompanying external export-receipt.json after actual export.'}
    save(D/'evidence/final-blocked-return-identities.json',final)
    for key in ('work_identity','ledger_identity','criterion_matrix','local_gate_matrix'):
        ref=hand[key]; assert pin(D/ref['path'])==ref
    for url in re.findall(r'\]\(sandbox:([^\)]+)\)',work.read_text()):
        assert Path(url).exists(),url
    print(json.dumps(final,indent=2))


if __name__=='__main__':
    main()
