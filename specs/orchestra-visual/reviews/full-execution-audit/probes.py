#!/usr/bin/env python3
"""Audit a pinned planning package; mutate only disposable copies and synthetic Git.
Never submits evidence to the real project or claims Orchestra runtime was tested.
Expectations document the audited behavior, not desired post-repair behavior.
"""
import argparse, copy, json, os, shutil, subprocess, sys, tempfile
from pathlib import Path

os.environ['PYTHONDONTWRITEBYTECODE'] = '1'
sys.dont_write_bytecode = True
ap = argparse.ArgumentParser()
ap.add_argument('--package', type=Path, required=True)
ap.add_argument('--out', type=Path, required=True)
a = ap.parse_args()
r = a.package.resolve()
sys.path.insert(0, str(r/'tools'))
from effective_contract import load, contract_digest, file_hash
from validate_plan import validate
from census import check as check_census
from select_work import select, source_errors, git_snapshot
from source_proof import snapshot, git
from validate_evidence import validate_receipt
from seal_receipt import seal
from test_support import install, raw_fixture, categories
from test_contract import EvidenceTests
from evaluate_performance import evaluate

plan = load(r/'PLAN.json'); surfaces = load(r/'SURFACES.json')
by = {n['id']: n for n in plan['nodes']}; results = {}
assert validate(plan, surfaces) == []

def init(repo):
    git(repo, 'init', '-q')
    git(repo, 'config', 'user.name', 'Synthetic Audit')
    git(repo, 'config', 'user.email', 'audit@example.invalid')

def commit(repo):
    git(repo, 'add', '.')
    git(repo, 'commit', '-qm', 'synthetic audit fixture')
    return git(repo, 'rev-parse', 'HEAD').strip()

# Real tracked TSX in isolated Git; normal/empty/typo roots and positive control.
with tempfile.TemporaryDirectory(prefix='orchestra-census-audit-') as td:
    repo = Path(td); init(repo)
    f = repo/'packages/app/src/app.tsx'; f.parent.mkdir(parents=True)
    f.write_text('// synthetic, NOT product code\n'); commit(repo)
    census = load(r/'CENSUS.json')
    regular = check_census(plan, surfaces, census, repo)
    empty = copy.deepcopy(census); empty['scan_roots'] = []
    narrowed = copy.deepcopy(census); narrowed['scan_roots'] = ['packages/does-not-exist']
    slash = copy.deepcopy(census); slash['scan_roots'] = [x+'/' for x in slash['scan_roots']]
    empty_errors = check_census(plan, surfaces, empty, repo)
    narrow_errors = check_census(plan, surfaces, narrowed, repo)
    slash_errors = check_census(plan, surfaces, slash, repo)
    assert regular and empty_errors == [] and narrow_errors == [] and slash_errors == []
    classified = copy.deepcopy(census)
    classified['files'] = [{'path': 'packages/app/src/app.tsx', 'disposition': 'migrate', 'owner': 'S25', 'surface_ids': ['UI16'], 'reason': 'Synthetic control mapped to the integration owner.', 'source': 'Isolated Git fixture; not a product census.'}]
    assert check_census(plan, surfaces, classified, repo) == []
    results['census_boundary'] = {'normal_unclassified_errors': regular, 'empty_scan_roots_errors': empty_errors, 'nonexistent_scan_root_errors': narrow_errors, 'trailing_slash_scan_roots_errors': slash_errors, 'valid_classification_errors': [], 'kind': 'isolated-Git-negative-controls'}
    # Exercise the public CLI too; preserve original package and brand bytes.
    package = repo/'specs/orchestra-visual'; package.parent.mkdir(parents=True)
    shutil.copytree(r, package, ignore=shutil.ignore_patterns('__pycache__', '*.pyc'))
    def cli():
        cmd = [sys.executable, str(package/'tools/validate_plan.py'), '--repo', str(repo), '--census-strict']
        ran = subprocess.run(cmd, capture_output=True, text=True, timeout=30)
        return {'exit_code': ran.returncode, 'output': json.loads(ran.stdout)}
    normal_cli = cli()
    (package/'CENSUS.json').write_text(json.dumps(empty))
    empty_cli = cli()
    assert normal_cli['exit_code'] == 1 and empty_cli['exit_code'] == 0
    results['census_cli'] = {'normal': normal_cli, 'empty': empty_cli}

# Context-displayed ancestor metadata can change while its effective digest does not.
p = copy.deepcopy(plan); parent = next(n for n in p['nodes'] if n['id'] == 'S25')
cid = parent['criterion_ids']['quality_standards'][0]
parent['criterion_evaluation_stage'] = {cid: 'NOT-A-VALID-STAGE'}
parent['axiom_application'] = 'All parent acceptance is required immediately, before producer work.'
stage_err = validate(p, surfaces)
d0 = contract_digest(by['S25-W1-T1'], r, plan)
d1 = contract_digest(next(n for n in p['nodes'] if n['id'] == 'S25-W1-T1'), r, p)
assert stage_err == [] and d0 == d1
p2 = copy.deepcopy(plan); t = next(n for n in p2['nodes'] if n['id'] == 'S25-W1-T1')
t['criterion_evaluation_stage'][next(iter(t['criterion_evaluation_stage']))] = 'S23-W1-T2'
assert validate(p2, surfaces)
results['ancestor_stage_metadata'] = {'parent_mutation': {'id': 'S25', 'criterion_id': cid, 'stage': 'NOT-A-VALID-STAGE', 'axiom_application': parent['axiom_application']}, 'plan_errors': stage_err, 'producer_effective_digest_unchanged': d0 == d1, 'wrong_task_stage_rejected': True, 'qualification': 'Mutated metadata only; no current published dependency cycle alleged.'}

# Direct historical attribution vs current-source freshness enforced by selector.
with tempfile.TemporaryDirectory(prefix='orchestra-source-audit-') as td:
    root = Path(td)/'packet'; root.mkdir(); repo = Path(td)/'repo'; repo.mkdir(); init(repo)
    path = 'packages/app/src/pages/session/tasks-data.ts'
    f = repo/path; f.parent.mkdir(parents=True); f.write_text('// synthetic baseline\n'); commit(repo)
    baseline = snapshot(repo)
    receipt = EvidenceTests().receipt(root, 'S17-W1-T1')
    (root/'before.json').write_text(json.dumps(baseline))
    f.write_text('// synthetic verified implementation\n'); head = commit(repo)
    receipt.update(head=head, paths_changed=[path], source={'baseline_file': 'before.json', 'commits': [head]})
    receipt['review']['head'] = head; receipt = seal(receipt, root)
    initial = validate_receipt(by[receipt['id']], receipt, root, repo=repo, plan=plan)
    assert initial == [], initial
    f.write_text('// later incompatible synthetic implementation\n'); commit(repo)
    later = validate_receipt(by[receipt['id']], receipt, root, repo=repo, plan=plan)
    state = {'tasks': {receipt['id']: {'status': 'PASS', 'head': head, 'evidence': 'proof.json'}}, 'external': {}}
    (root/'proof.json').write_text(json.dumps(receipt))
    source_err = source_errors(by[receipt['id']], receipt, git_snapshot(repo, state))
    selection = select(plan, state, root=root, source_snapshot=git_snapshot(repo, state))
    assert later == [] and source_err and receipt['id'] in selection['invalid_claims']
    results['receipt_freshness_boundary'] = {'initial_direct_errors': initial, 'later_clean_commit_direct_errors': later, 'later_selector_source_errors': source_err, 'selector_invalid_claim': True, 'qualification': 'Resume/select correctly refuse freshness; no end-to-end stale approval bypass.'}

# Explicit synthetic markers are accepted structurally at product receipt boundary.
with tempfile.TemporaryDirectory(prefix='orchestra-synthetic-audit-') as td:
    root = Path(td)/'packet'; root.mkdir(); repo = Path(td)/'repo'; repo.mkdir(); init(repo)
    f = repo/'packages/app/src/app.tsx'; f.parent.mkdir(parents=True)
    f.write_text('// synthetic acceptance fixture only\n'); head = commit(repo); baseline = snapshot(repo)
    receipt = EvidenceTests().receipt(root, 'S25-W1-T2')
    receipt['head'] = head; receipt['review']['head'] = head
    (root/'before.json').write_text(json.dumps(baseline))
    receipt['source'] = {'baseline_file': 'before.json', 'commits': []}
    categories(root, receipt, by[receipt['id']]); receipt = seal(receipt, root)
    errors = validate_receipt(by[receipt['id']], receipt, root, repo=repo, plan=plan)
    assert errors == [], errors
    assert load(root/'raw.json')['synthetic'] and load(root/'captures.json')['synthetic']
    results['explicit_synthetic_evidence'] = {'receipt_id': receipt['id'], 'with_real_isolated_git_check_errors': errors, 'raw_synthetic': True, 'capture_manifest_synthetic': True, 'proof_log': 'Synthetic evidence for a schema test. NOT product proof.', 'qualification': 'Submission-boundary hardening; no real fabricated product evidence or real PASS is alleged.'}

# Whole-document identity includes changes outside assigned widget sections.
with tempfile.TemporaryDirectory(prefix='orchestra-widget-hash-audit-') as td:
    root = Path(td); install(root)
    tasks = [n for n in plan['nodes'] if n['kind'] == 'task']
    prior = {n['id']: contract_digest(n, root, plan) for n in tasks}
    text = (root/'WIDGETS.md').read_text(); anchor = '<a id="w07"></a>'; assert anchor in text
    (root/'WIDGETS.md').write_text(text.replace(anchor, anchor+'\n<!-- Synthetic audit: W07-only provenance note. -->', 1))
    changed = [n['id'] for n in tasks if prior[n['id']] != contract_digest(n, root, plan)]
    unrelated = [n['id'] for n in tasks if n['id'] in changed and 'W07' not in n.get('widget_contracts', [])]
    results['widget_hash_granularity'] = {'changed_tasks': changed, 'changed_count': len(changed), 'unrelated_declared_widget_tasks': unrelated, 'unrelated_count': len(unrelated), 'qualification': 'Conservative invalidation, not security bypass or a requirement to rerun every test.'}

# Already-fixed relative latency gate remains protective.
budgets = load(r/'BUDGETS.json'); raw = raw_fixture(r, ['P03'])
changed_ob = [ob for ob in raw['observations'] if ob['metric'] == 'input_paint_p95']
assert len(changed_ob) == 1
for pair in changed_ob[0]['pairs']:
    pair['baseline'] = [8]*len(pair['baseline']); pair['candidate'] = [49]*len(pair['candidate'])
regr = evaluate(raw, budgets, ['P03']); assert regr['status'] == 'FAIL'
results['regression_control'] = {'input_8_to_49ms': regr['status']}

manifest = {}
for line in (r/'MANIFEST.sha256').read_text().splitlines():
    if line.strip():
        h, path = line.split(None, 1); manifest[path.lstrip('* ')] = h
mismatch = [p for p, h in manifest.items() if not (r/p).is_file() or file_hash(r/p) != h]
unlisted = [p.relative_to(r).as_posix() for p in r.rglob('*') if p.is_file() and p.name != 'MANIFEST.sha256' and '__pycache__' not in p.parts and p.relative_to(r).as_posix() not in manifest]
assert not mismatch
results['package_integrity'] = {'listed_files': len(manifest), 'hash_mismatches': mismatch, 'unlisted_files': unlisted, 'master_sha256': file_hash(r/'reference/approved.png')}
output = {'kind': 'adversarial-tooling-audit-NOT-product-evidence', 'audited_plan_commit': '3c97621681b119105be8b7982ba663b0d701fd83', 'findings_not_fixes': True, 'canonical_mutations': False, 'results': results}
a.out.parent.mkdir(parents=True, exist_ok=True)
with a.out.open('x', encoding='utf-8') as handle:
    json.dump(output, handle, ensure_ascii=False, indent=2)
print(json.dumps({'output': str(a.out), 'probes': list(results), 'canonical_mutations': False}))
