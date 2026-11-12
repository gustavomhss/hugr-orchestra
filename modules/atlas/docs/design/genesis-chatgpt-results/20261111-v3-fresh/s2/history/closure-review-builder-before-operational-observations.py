#!/usr/bin/env python3
"""Build literal tool-free closure-review transport from final actual evidence. No dispatch."""
from __future__ import annotations

import argparse
import hashlib
import importlib.util
import json
import sys
from pathlib import Path

MAX_PART_BYTES = 26000
MAX_S4_OBSERVATION_BYTES = 52000
FORBIDDEN_FIELDS = {'actual_criterion_review_scopes', 'optional_suggestions_as_recorded',
                    'shared_criteria', 'optional_suggestions'}


def sha(raw):
    return hashlib.sha256(raw).hexdigest()


def require(condition, message):
    if not condition:
        raise ValueError(message)


def encoded(value):
    return (json.dumps(value, ensure_ascii=False, indent=2) + '\n').encode('utf-8')


def reject_opinion_objects(value):
    """Reject known opinion-bearing structures; selected evidence must be operational only."""
    if isinstance(value, dict):
        require(not (set(value) & FORBIDDEN_FIELDS), 'Opinion-bearing field in supplied operational evidence')
        require(not value.get('mandatory_findings'), 'Raw mandatory findings are not closure transport evidence')
        criteria = value.get('criteria')
        if isinstance(criteria, list):
            require(not any(isinstance(x, dict) and any(k in x for k in ['reason', 'observed', 'required_fix']) for x in criteria),
                    'Raw criterion opinions detected in supplied operational evidence')
        for child in value.values():
            reject_opinion_objects(child)
    elif isinstance(value, list):
        for child in value:
            reject_opinion_objects(child)


def find_stream_bindings(value, stream, pointer=''):
    found = []
    if isinstance(value, dict):
        path = value.get('payload_path', value.get('path', value.get('file')))
        digest = value.get('sha256')
        label = str(value.get('stream', value.get('kind', ''))).lower()
        if path and digest and (stream in pointer.lower() or label == stream):
            found.append({'path': path, 'sha256': digest})
        direct_path = value.get(stream + '_path')
        direct_hash = value.get(stream + '_sha256')
        if direct_path and direct_hash:
            found.append({'path': direct_path, 'sha256': direct_hash})
        if isinstance(value.get(stream), str) and direct_hash:
            found.append({'path': value[stream], 'sha256': direct_hash})
        for key, child in value.items():
            found.extend(find_stream_bindings(child, stream, pointer + '.' + key))
    elif isinstance(value, list):
        for number, child in enumerate(value):
            found.extend(find_stream_bindings(child, stream, pointer + f'[{number}]'))
    return found


def select_stream(e, runtime, runtime_ref, stream, explicit_path):
    candidates = []
    for binding in find_stream_bindings(runtime, stream):
        ref = e.bound_ref(binding, Path(runtime_ref['path']).parent)
        if ref not in candidates:
            candidates.append(ref)
    if explicit_path:
        explicit = e.register(explicit_path)
        candidates = [ref for ref in candidates if ref['path'] == explicit['path'] and ref['sha256'] == explicit['sha256']]
    require(len(candidates) == 1, f'Need one actual, receipt-bound {stream} file; use --runtime-{stream} to disambiguate')
    return candidates[0]


def original_bytes(e, ref):
    verified = e.bound_ref(ref)
    raw = Path(verified['path']).read_bytes()
    raw.decode('utf-8')  # No lossy decoding, escaping, omission or replacement of actual logs.
    require(sha(raw) == verified['sha256'], 'Referenced file changed while building packet')
    return raw, verified


def make_parts(payload, cap):
    packet_sha = sha(payload)
    def header(number, total, chunk):
        return (f'GENESIS S2 FINAL CLOSURE — LITERAL PART {number:06d}/{total:06d}\n'
                f'packet_sha256={packet_sha}\n'
                f'payload_bytes={len(chunk):012d}; payload_sha256={sha(chunk)}\n'
                'Transport only. No tools. Await the principal\'s separate seal/request before judging.\n'
                '--- EXACT PAYLOAD SEGMENT FOLLOWS ---\n').encode('utf-8')
    budget = cap - len(header(0, 0, b''))
    require(budget > 4, 'Part limit cannot accommodate literal header')
    chunks = []
    offset = 0
    while offset < len(payload):
        end = min(offset + budget, len(payload))
        while True:
            try:
                payload[offset:end].decode('utf-8')
                break
            except UnicodeDecodeError:
                end -= 1
                require(end > offset, 'Cannot split UTF-8 payload safely')
        chunks.append(payload[offset:end])
        offset = end
    require(len(chunks) < 1000000, 'Part-count field overflow')
    result, offset = [], 0
    for number, chunk in enumerate(chunks, 1):
        prefix = header(number, len(chunks), chunk)
        raw = prefix + chunk
        require(len(raw) <= cap <= MAX_PART_BYTES, 'Literal part exceeds byte limit')
        result.append({'filename': f'part-{number:03d}-of-{len(chunks):03d}.txt', 'raw': raw,
                       'number': number, 'of': len(chunks), 'byte_length': len(raw), 'sha256': sha(raw),
                       'header_byte_length': len(prefix), 'payload_offset': offset,
                       'payload_byte_length': len(chunk), 'payload_sha256': sha(chunk)})
        offset += len(chunk)
    require(b''.join(item['raw'][item['header_byte_length']:] for item in result) == payload,
            'Literal reassembly differs from packet')
    return result


def seal_request(judge, packet_sha, part_count, all_ids):
    template = (Path(__file__).resolve().parent / 'root-seal-request.template.md').read_text()
    replacements = {'{{JUDGE}}': judge, '{{PART_COUNT}}': str(part_count),
                    '{{PACKET_SHA256}}': packet_sha, '{{CRITERION_IDS}}': ', '.join(all_ids)}
    for old, new in replacements.items():
        template = template.replace(old, new)
    require('{{' not in template, 'Unresolved root-only request template placeholder')
    return template


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--final-render-dir', required=True)
    parser.add_argument('--output-dir', required=True)
    parser.add_argument('--s4-observations', action='append', required=True,
                        help='Existing compact operational JSON observations only; repeatable, total <=52000 bytes')
    parser.add_argument('--runtime-stdout', help='Optional exact stdout path already bound by operation receipt')
    parser.add_argument('--runtime-stderr', help='Optional exact stderr path already bound by operation receipt')
    parser.add_argument('--max-part-bytes', type=int, default=MAX_PART_BYTES)
    args = parser.parse_args()
    closure = Path(__file__).resolve().parent.parent
    root = closure.parent
    out = Path(args.output_dir).resolve()
    rendered = Path(args.final_render_dir).resolve()
    require(closure in out.parents and out != closure and not out.exists() and out.parent.is_dir(),
            'Output must be a new, nonexistent directory below closure-work with an existing parent')
    require(1024 <= args.max_part_bytes <= MAX_PART_BYTES, 'Part cap must be 1024..26000 bytes')
    renderer_file = closure / 'render_final_work.py'
    spec = importlib.util.spec_from_file_location('s2_closure_renderer_support', renderer_file)
    require(spec is not None and spec.loader is not None, 'Renderer support module unavailable')
    renderer = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(renderer)  # Definitions only: its main/CLI is not run.
    e = renderer.Evidence(root)
    renderer_ref = e.register(renderer_file)
    final, final_ref = e.read(rendered / 'final-obligations.json')
    require(final.get('schema') == 'genesis-s2-final-work-draft/v1'
            and final.get('status') == 'DRAFT_FOR_FINAL_SAME_PAIR_ASSESSMENT', 'Not an actual final-render draft')
    require(final.get('execution_id') == renderer.EXECUTION and final.get('source_revision') == renderer.SOURCE
            and final.get('protocol_revision') == renderer.PROTOCOL, 'Final-render identity mismatch')
    work_ref = e.register(rendered / 'work.md')
    work_raw = Path(work_ref['path']).read_bytes()
    require(work_raw == renderer.markdown(final).encode('utf-8'),
            'work.md differs from the exact renderer output; regenerate after changes rather than transporting unverified additions')
    e.bound_ref(final['native_package'])
    native, _ = e.read(final['native_package']['path'])
    require(native.get('missing_required_artifact_keys') == [], 'Current native package still has missing required artifacts')
    native_artifacts = {x['key']: x for x in native.get('artifacts', [])}
    registry, registry_ref = e.read(final['normative_registry']['path'])
    require(registry_ref['sha256'] == final['normative_registry']['sha256'], 'Registry changed after final render')
    norm_raw, norm_ref = original_bytes(e, final['normative_source'])
    norm_lines = norm_raw.decode().splitlines()
    rows = final.get('criteria', [])
    ids = [x['id'] for x in rows]
    require(len(ids) == len(set(ids)) == 50 and ids == [x['id'] for x in registry['criteria']], 'Not exactly the pinned 50 IDs')
    for row, criterion in zip(rows, registry['criteria']):
        require(row['source_line'] == criterion['source_line']
                and row['normative_line'] == norm_lines[row['source_line'] - 1], f"Normative line mismatch: {row['id']}")
        require(row['global_complement']['owner'] == 'ROOT', 'Global owner boundary changed')
    accepted = final.get('semantic_acceptance', [])
    require(len(accepted) == len({x['key'] for x in accepted}) == 13, 'Thirteen exact accepted artifacts required')
    require({x['key'] for x in accepted} == set(native.get('required_artifact_keys', [])) == set(native_artifacts),
            'Final-render artifact set differs from current native package')
    manifests, public_artifacts = {}, []
    for artifact in accepted:
        body = e.bound_ref(artifact['body'])
        require(body['sha256'] == native_artifacts[artifact['key']]['body']['sha256']
                and native_artifacts[artifact['key']].get('validity') == 'supported', 'Current artifact body/validity differs from acceptance')
        manifest = e.bound_ref(artifact['accepted_layer'])
        manifests[manifest['path']] = manifest
        reviews = artifact.get('reviews', [])
        require(len(reviews) == 2 and {x['judge'] for x in reviews} == renderer.JUDGES
                and all(x.get('verdict') == 'PASS' for x in reviews), 'Final artifact lacks both actual semantic PASS metadata')
        public_artifacts.append({'key': artifact['key'], 'layer': artifact['layer'], 'body': body,
                                 'accepted_manifest': manifest,
                                 'semantic_acceptance_metadata': [{'judge': x['judge'], 'verdict': x['verdict'], 'scope': x['scope']} for x in reviews]})
    require(len(manifests) == 4, 'Four exact accepted-layer manifest pins required')
    # Full original review responses are intentionally never read or added to this packet.
    runtime_ref = final['runtime_operation']['receipt']
    runtime_raw, runtime_ref = original_bytes(e, runtime_ref)
    runtime = json.loads(runtime_raw)
    renderer.package_binding(runtime, final['native_package']['sha256'], 'Native operation receipt')
    reject_opinion_objects(runtime)
    stdout_ref = select_stream(e, runtime, runtime_ref, 'stdout', args.runtime_stdout)
    stderr_ref = select_stream(e, runtime, runtime_ref, 'stderr', args.runtime_stderr)
    stdout_raw, stdout_ref = original_bytes(e, stdout_ref)
    stderr_raw, stderr_ref = original_bytes(e, stderr_ref)
    support = []
    total_support_bytes = 0
    for path in args.s4_observations:
        data, ref = e.read(path)
        reject_opinion_objects(data)
        raw = Path(ref['path']).read_bytes()
        total_support_bytes += len(raw)
        support.append((raw, ref))
    require(total_support_bytes <= MAX_S4_OBSERVATION_BYTES,
            f'Supplied S4 observations total {total_support_bytes} bytes; supply bounded actual observations <=52000, never silently truncate')
    oracle, oracle_ref = e.read(final['frozen_oracle_identity']['path'])
    require(oracle_ref['sha256'] == final['frozen_oracle_identity']['sha256'], 'Reserved oracle identity changed')
    # Exact long questions/answers are used only to reject accidental contamination, never emitted.
    reserved = []
    for case in oracle.get('cases', []):
        for field in ['question', 'expected', 'critical']:
            values = case.get(field, [])
            values = [values] if isinstance(values, str) else values
            for value in values:
                if isinstance(value, str) and len(value) >= 24:
                    reserved.append((case['id'], value))
    old_template, _ = e.read(closure / 'obligations.json')
    expected_completion = next(x for x in old_template['snapshot']['files'] if x['path'] == 'protocol/references/completion.md')
    completion_raw, completion_ref = original_bytes(e, {'path': str(root / expected_completion['path']), 'sha256': expected_completion['sha256']})
    sections, buffer = [], bytearray()
    def section(name, raw, provenance=None):
        raw.decode('utf-8')
        heading = (f'\n===== {name} =====\n'
                   f'content_bytes={len(raw)}; content_sha256={sha(raw)}\n'
                   + (f"source_path={provenance['path']}; source_sha256={provenance['sha256']}\n" if provenance else '')
                   + '----- EXACT SECTION CONTENT -----\n').encode('utf-8')
        buffer.extend(heading)
        offset = len(buffer)
        buffer.extend(raw)
        buffer.extend(b'\n----- END SECTION CONTENT -----\n')
        sections.append({'name': name, 'content_offset': offset, 'content_byte_length': len(raw),
                         'content_sha256': sha(raw), 'source': provenance})
    scope = {'purpose': 'Independent same-pair final closure assessment; no result is predetermined.',
             'source_revision': renderer.SOURCE, 'protocol_revision': renderer.PROTOCOL, 'execution_id': renderer.EXECUTION,
             'final_render': final_ref, 'complete_work': work_ref, 'renderer': renderer_ref,
             'exclusions': ['Peer raw review opinions', 'Criterion-specific peer opinion records', 'Reserved consumer questions and answer keys'],
             'limits': ['Draft HOLD labels are not requested judge answers.',
                        'Artifact PASS metadata does not establish operational acceptance.',
                        'Predicted affected sets are not execution receipts.',
                        'No original decision is modified or replaced; no handoff is created.']}
    section('00 PACKET SCOPE AND IDENTITIES', encoded(scope))
    section('01 COMPLETE FINAL-RENDER WORK.MD — DRAFT, NOT A VERDICT', work_raw, work_ref)
    criterion_text = []
    for row in rows:
        criterion_text += [f"### {row['id']} — normative source line {row['source_line']}",
                           'Normative line (verbatim):', row['normative_line'],
                           'Local obligation (verbatim from final-render draft):', row['local_obligation'],
                           'Exclusively global complement owner: ROOT', row['global_complement']['proof'], '']
    section('02 ALL FIFTY EXACT NORMATIVE LINES AND LOCAL OBLIGATIONS', '\n'.join(criterion_text).encode(), norm_ref)
    section('03 THIRTEEN BODY IDENTITIES AND FOUR ACCEPTED MANIFEST PINS — PUBLIC METADATA ONLY',
            encoded({'artifacts': public_artifacts, 'accepted_manifests': list(manifests.values())}))
    section('04 ACTUAL NATIVE OPERATION RECEIPT — SCOPE IS THE RECORDED OPERATION ONLY', runtime_raw, runtime_ref)
    section('05 EXACT ACTUAL RUNTIME STDOUT', stdout_raw, stdout_ref)
    section('06 EXACT ACTUAL RUNTIME STDERR', stderr_raw, stderr_ref)
    # This allowlist never serializes actual_criterion_review_scopes or opinion-bearing objects from final JSON.
    observation_summary = {'runtime_observed_fields': final['runtime_operation']['observed_fields'],
                           'runtime_scope': final['runtime_operation']['interpretation'],
                           'final_remote_readback': final['final_remote_readback'],
                           'ci_readbacks': final['ci_readbacks'],
                           'note': 'These are supplied operational observations at their cited pins, not semantic opinions or a blanket S4 verdict.'}
    reject_opinion_objects(observation_summary)
    section('07 ACTUAL READBACK AND CI OBSERVATIONS AT SUPPLIED PINS', encoded(observation_summary))
    for number, (raw, ref) in enumerate(support, 1):
        section(f'08.{number:02d} BOUNDED SUPPLIED S4 CI/COMPATIBILITY OBSERVATIONS', raw, ref)
    for number, item in enumerate(final['historical_public_write_rejections'], 1):
        raw, ref = original_bytes(e, item['receipt'])
        section(f'09.{number:02d} EXACT ORIGINAL PUBLIC-WRITE REFUSAL — HISTORICAL EVIDENCE', raw, ref)
    update = final['local_update']
    section('10 S2-U1 DECLARED-GRAPH PREDICTION, SEPARATE FROM ANY ACTUAL EXECUTION',
            encoded({'id': update['id'], 'changed_input': update['changed_input'],
                     'prediction_only': update['expected_graph'],
                     'prediction_limit': 'Mechanical closure of the final declared build graph; not independently validated semantic affected set and not execution/rebuild/reuse proof.',
                     'recorded_execution_state': update['state'], 'actual_execution': update.get('actual_execution'),
                     'recorded_set_comparison': update.get('set_comparison')}))
    cases = [{k: x[k] for k in ['id', 'kind', 'target', 'depth', 'state', 'trace_refs', 'evaluation_refs'] if k in x}
             for x in final['consumer_cases']]
    require(len(cases) == len({x['id'] for x in cases}) == 14, 'Frozen fourteen-case metadata missing')
    section('11 CONSUMER OBLIGATION METADATA ONLY — NO QUESTIONS OR ANSWER KEYS',
            encoded({'cases': cases, 'frozen_read_limits': final['consumer_read_limits']}))
    section('12 SOURCE PRESERVATION AND HONEST USAGE — RECEIPT SCOPE',
            encoded({'coverage': final['coverage'], 'preservation': final['preservation'], 'accounting': final['accounting']}))
    section('13 PINNED LOCAL COMPLETION PROTOCOL', completion_raw, completion_ref)
    payload = bytes(buffer)
    text = payload.decode('utf-8')
    require('actual_criterion_review_scopes' not in text, 'Forbidden review-scope field leaked into packet')
    for case_id, secret in reserved:
        require(secret not in text, f'Reserved consumer content detected for {case_id}; no packet emitted')
    parts = make_parts(payload, args.max_part_bytes)
    request_template_ref = e.register(Path(__file__).resolve().parent / 'root-seal-request.template.md')
    requests = {short: seal_request(judge, sha(payload), len(parts), ids)
                for short, judge in [('j1', '/root/s2_resume_j1'), ('j2', '/root/s2_resume_j2')]}
    e.stable()
    manifest = {'schema': 'genesis-s2-final-closure-literal-packet/v1', 'packet_sha256': sha(payload),
                'packet_byte_length': len(payload), 'source_revision': renderer.SOURCE,
                'protocol_revision': renderer.PROTOCOL, 'execution_id': renderer.EXECUTION,
                'part_count': len(parts), 'max_part_bytes': args.max_part_bytes,
                'parts': [{k: v for k, v in x.items() if k != 'raw'} for x in parts],
                'sections': sections, 'criterion_ids': ids, 'root_request_template': request_template_ref,
                'artifact_keys': [x['key'] for x in public_artifacts],
                'snapshot_input_files': sorted(e.files.values(), key=lambda x: x['path']),
                'transport_limit': 'Exact local literal bytes only; host message serialization, actual sends and judge receipt are not observed by this builder.',
                'no_dispatch': True, 'no_judgment': True, 'no_handoff_seal': True}
    out.mkdir(exist_ok=False)
    (out / 'parts').mkdir()
    (out / 'root-only').mkdir()
    for name, raw in [('packet.txt', payload), ('packet-manifest.json', encoded(manifest))]:
        with (out / name).open('xb') as stream:
            stream.write(raw)
    for item in parts:
        with (out / 'parts' / item['filename']).open('xb') as stream:
            stream.write(item['raw'])
    for short, request_text in requests.items():
        with (out / 'root-only' / f'seal-{short}-request-template.md').open('x', encoding='utf-8') as stream:
            stream.write(request_text)
    print(json.dumps({'output_dir': str(out), 'packet_sha256': manifest['packet_sha256'],
                      'parts': len(parts), 'max_actual_part_bytes': max(x['byte_length'] for x in parts),
                      'criteria': len(ids), 'artifacts': len(public_artifacts),
                      'state': 'LOCAL_PACKET_BUILT_NOT_SENT_NOT_JUDGED'}, indent=2))


if __name__ == '__main__':
    try:
        main()
    except Exception as exc:
        print(f'PACKET_REFUSED: {exc}', file=sys.stderr)
        raise SystemExit(2)
