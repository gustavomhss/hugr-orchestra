#!/usr/bin/env python3
"""Mechanical, whole-population evidence supplement; no semantic authorship."""
from pathlib import Path
import copy
import hashlib
import json

ROOT = Path(__file__).resolve().parents[1]
LOT = 'automation-population-current-v1'

def sha(data):
    return hashlib.sha256(data).hexdigest()

def ident(path):
    data = path.read_bytes()
    return {'path': str(path.relative_to(ROOT)), 'bytes': len(data), 'sha256': sha(data),
            'git_blob_sha': hashlib.sha1(b'blob ' + str(len(data)).encode() + b'\0' + data).hexdigest()}

def j(value):
    return json.dumps(value, ensure_ascii=False, separators=(',', ':'))

index_path = ROOT / 'producers/automation/review-supplement-1-index.json'
coverage_path = ROOT / 'producers/automation/coverage.jsonl'
updated_path = ROOT / 'payload/assembly/automation-coverage-v2.jsonl'
erratum_path = ROOT / 'payload/assembly/automation-coverage-erratum.json'
index = json.loads(index_path.read_text())
projection = index['shared_population_reconciliation']
erratum = json.loads(erratum_path.read_text())
assert ident(coverage_path)['sha256'] == projection['coverage_ref']['sha256'] == erratum['coverage_before_sha256']
assert ident(updated_path)['sha256'] == erratum['coverage_after_sha256']
rows = copy.deepcopy(projection['rows'])
coverage = [json.loads(line) for line in coverage_path.read_text().splitlines()]
updated = [json.loads(line) for line in updated_path.read_text().splitlines()]
assert len(rows) == len(coverage) == len(updated) == 204
assert len({r['path'] for r in rows}) == 204
by_path = {r['path']: r for r in coverage}
new_by_path = {r['path']: r for r in updated}
assert set(by_path) == set(new_by_path) == {r['path'] for r in rows}
for row in rows:
    original = by_path[row['path']]
    for field in projection['exact_original_fields']:
        assert row[field] == original[field], (row['path'], field)
    assert row['body_anchors'] == original['evidence_ids']
assert rows[0]['path'] == erratum['source_path']
assert rows[0]['role'] == erratum['before']['role']
rows[0]['role'] = erratum['after']['role']
for row in rows:
    for field in projection['exact_original_fields']:
        assert row[field] == new_by_path[row['path']][field], (row['path'], field)

header = {
    'type': 'complete_mechanical_current_population_projection',
    'request': 'RE-AUT1-01 current 204 individual rows',
    'assembler': '/root',
    'source_index': ident(index_path),
    'source_pointer': '#/shared_population_reconciliation',
    'original_coverage': ident(coverage_path),
    'current_coverage': ident(updated_path),
    'erratum': ident(erratum_path),
    'source_commit': projection['source_commit'],
    'source_count': 204,
    'unique_path_count': 204,
    'family_counts': projection['family_counts'],
    'read_depth_counts': projection['read_depth_counts'],
    'exact_original_fields': projection['exact_original_fields'],
    'mechanical_fields': projection['mechanical_fields'],
    'method': 'All original projection rows in original order; only row 1 role uses the already supplied literal erratum. No row omitted, no read depth or test execution promoted. Body sections and anchors copied from the original projection. Legacy artifact labels remain literal producer data.',
    'body_changes': False,
    'product_tests_executed': False,
    'scope': 'Population evidence reusable for both same judges and all four automation review lots. Does not grant aggregate body acceptance.',
}
text = '# Automação — projeção individual integral da população corrente\n\n'
text += 'Complemento mecânico a RE-AUT1-01. Preserve os pedidos comportamentais já encerrados e examine apenas esta evidência que faltava. Nenhum parecer do outro juiz está incluído.\n\n'
text += '## Identidade e método\n\n```json\n' + j(header) + '\n```\n\n'
text += '## Todas as 204 fontes — JSONL integral\n\n```jsonl\n'
text += ''.join(j(row) + '\n' for row in rows)
text += '```\n\nFim da projeção: 204 registros individuais, sem omissões. O pedido ao juiz é decidir o componente corrente de RE-AUT1-01 e o recorte automation-1 previamente examinado; não inferir PASS dos outros lotes.\n'
packet = ROOT / 'review-packets' / (LOT + '.md')
assert not packet.exists(), packet
packet.write_text(text)
manifest = {'schema': 's1-03-mechanical-review-supplement/v1', 'packet': ident(packet), 'projection': header,
            'rows_sha256': sha((''.join(j(row) + '\n' for row in rows)).encode()),
            'actual_procedure': ident(Path(__file__).resolve()), 'dispatch_status': 'PREPARED_NOT_DISPATCHED'}
packet.with_suffix('.manifest.json').write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + '\n')
archive = ROOT / 'payload/assembly/procedures' / Path(__file__).name
assert not archive.exists()
archive.write_bytes(Path(__file__).read_bytes())
print(json.dumps(manifest['packet'], ensure_ascii=False))
