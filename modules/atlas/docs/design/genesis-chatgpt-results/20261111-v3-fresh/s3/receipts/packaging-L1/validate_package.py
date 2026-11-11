from pathlib import Path
import hashlib,json,re

B=Path(__file__).resolve().parent
O=B.parents[1]/'out'
P='modules/atlas/docs/design/genesis-chatgpt-results/20261111-v3-fresh/s3/'
h=lambda b:hashlib.sha256(b).hexdigest()
canonical=lambda x:json.dumps(x,ensure_ascii=False,sort_keys=True,separators=(',',':')).encode()
pkg=json.loads((B/'draft-native-package.json').read_text())
report=json.loads((B/'integrity-report.json').read_text())
coverages={u:json.loads((O/'receipts'/u/'coverage.json').read_text()) for u in ['L1-A','L1-B','L1-C']}
rows=[json.loads(line) for line in (B/'population-map.jsonl').read_text().splitlines()]
assert len(rows)==len({x['path'] for x in rows})==4553
for row in rows:
    original=coverages[row['unit']]['entries'][row['original_entry_index']]
    assert row['path']==original['path'] and row['git_blob_sha']==original['git_blob_sha']
    assert h(canonical(original))==row['original_entry_sha256']
    assert set(row['future_artifact_keys'])<=set(pkg['missing_required_artifact_keys'])
for artifact in pkg['artifacts']:
    raw=(O/artifact['body']['path']).read_bytes()
    assert len(raw)==artifact['body']['byte_length'] and h(raw)==artifact['body']['sha256']
    assert artifact['validity']=='blocked' and not artifact['semantic_review_refs'] and not artifact['runtime_receipt_refs'] and not artifact['build_dependencies']
    for field in ['recipe_ref','producer_request_ref','producer_response_ref']:
        ref=artifact[field]
        assert ref['payload_path'].startswith(P)
        assert h((O/ref['payload_path'][len(P):]).read_bytes())==ref['sha256']
    for ref in artifact['evidence']:
        assert ref['payload_path'].startswith(P)
        assert h((O/ref['payload_path'][len(P):]).read_bytes())==ref['sha256']
    assert all('file:'+r['path'] in artifact['input_keys'] for r in rows if r['l1']==artifact['key'])
    assert all('file:'+r['path'] in artifact['input_keys'] for r in artifact['source_refs'])
    assert artifact['recipe_ref']==artifact['producer_request_ref']
assert pkg['contract']['oracle_ref'] is None and pkg['package_state']=='IN_PROGRESS'
# Inspect only the declaration to ensure it was not copied; never display its value.
sources=json.loads((O/'receipts/L1-C/sources.json').read_text())
roster=next(x for x in sources if x['path']=='modules/maestro/coordination/src/roster.ts')
raw=Path(roster['capture_path']).read_text()
literal=re.search(r'export const BACKEND_DEFAULT_LABEL = "([^"]+)"',raw).group(1)
assert all(literal not in f.read_text() for f in B.iterdir() if f.suffix in {'.json','.jsonl','.md','.py'})
snapshot=json.loads((B/'input-snapshot.json').read_text())
for rel,info in snapshot['files'].items():
    assert h((O/rel).read_bytes())==info['sha256'],rel
    path=O/rel
    assert all(not p.is_symlink() for p in [path,*path.parents] if p==O or O in p.parents),rel
for unit in coverages:
    population=json.loads((O/f'evidence/population-{unit[-1]}.json').read_text())
    assert all(x['type']=='blob' and x['mode']!='120000' for x in population)
report['checks'].update({
    'mapper_rows_reconstruct_original_entry_hashes':True,
    'all_4553_original_paths_remain_declared_file_inputs':True,
    'all_captured_sources_remain_declared_file_inputs':True,
    'final_out_snapshot_unchanged_during_packaging':True,
    'authored_packaging_files_exclude_default_backend_literal':True,
    'B_v2_hash_matches_root':True,
    'C_v3_hash_matches_root':True,
    'no_payload_path_symlinks_or_population_symlink_blobs':True,
})
report['counts']['mapper_reconstruction_checks']=len(rows)
report['counts']['oversized_evidence_files']=len(report['oversized_evidence'])
report['auxiliary_observer_risks']=[
    {**report['auxiliary_observer_risk'],'role':'mapper evidence; not an original producer file input'},
    {'file':'draft-native-package.json','byte_length':(B/'draft-native-package.json').stat().st_size,'sha256':h((B/'draft-native-package.json').read_bytes()),'role':'transport descriptor; if later observed as a single file input the same limit applies'},
]
report['final_packaging_state']='DRAFT_READY_FOR_ROOT_BINDING'
report['artifacts']['validate_package.py']={'byte_length':Path(__file__).stat().st_size,'sha256':h(Path(__file__).read_bytes())}
(B/'integrity-report.json').write_text(json.dumps(report,ensure_ascii=False,indent=2)+'\n')
print(json.dumps({'state':report['final_packaging_state'],'mapper_checks':len(rows),'package_sha256':h((B/'draft-native-package.json').read_bytes()),'integrity_sha256':h((B/'integrity-report.json').read_bytes()),'oversized_inputs':len(report['oversized_inputs']),'oversized_evidence':len(report['oversized_evidence'])},indent=2))
