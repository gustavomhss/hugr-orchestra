"""Reconcile S1 source populations with observed S2 capture, without planning an update."""
import collections
import hashlib
import json
import pathlib
import subprocess

ROOT = pathlib.Path(__file__).resolve().parent
INV = ROOT / 's1-checkpoint-original/materialized/inventory'
OUT = ROOT / 'receipts'
SOURCE = '1cde2ff7a71bcf7aecb5d030917b577165135d38'

def read(path):
    return json.loads(path.read_text())

def sha(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()

index = read(INV / 'path-ownership/index.json')
artifacts = read(INV / 'artifacts.json')['artifacts']
observations = {row['key'][5:]: row for row in read(OUT / 'source-observer-results.json')}
declared_blockers = {row['path']: row for row in read(INV / 'capture-blockers.json')['blocked_entries']}
tree_raw = subprocess.run(['git', 'ls-tree', '-r', '-z', SOURCE], cwd=ROOT.parent / 'orchestra', check=True, capture_output=True).stdout
tree = {}
for item in tree_raw.split(b'\0'):
    if not item:
        continue
    info, name = item.split(b'\t', 1)
    mode, kind, blob = info.decode().split()
    tree[name.decode()] = {'mode': mode, 'kind': kind, 'blob': blob}
domains = {}
owners = {}
shards = []
errors = []
for domain, population in sorted(index['domains'].items()):
    entries = []
    for ref in population['shards']:
        path = INV / 'path-ownership' / pathlib.PurePosixPath(ref['path']).name
        rows = [json.loads(line) for line in path.read_text().splitlines()]
        valid = sha(path) == ref['sha256'] and len(path.read_bytes()) == ref['bytes'] and len(rows) == ref['rows']
        shards.append({'name': path.name, 'verified': valid, 'rows': len(rows), 'sha256': sha(path)})
        if not valid:
            errors.append({'kind': 'shard-integrity', 'path': str(path)})
        entries.extend(rows)
    if len(entries) != population['leaf_count']:
        errors.append({'kind': 'domain-count', 'domain': domain})
    domains[domain] = {row['path'] for row in entries}
    for row in entries:
        path = row['path']
        if path in owners:
            errors.append({'kind': 'duplicate-owner', 'path': path})
        owners[path] = domain
        expected = tree.get(path)
        if expected is None or expected['blob'] != row['git_blob'] or expected['mode'] != row['mode']:
            errors.append({'kind': 'source-binding', 'path': path})
        observation = observations.get(path)
        if observation is None or observation['blob'] != row['git_blob']:
            errors.append({'kind': 'observer-binding', 'path': path})
for name, paths in [('inventory', set(owners)), ('observer', set(observations))]:
    if paths != set(tree):
        errors.append({'kind': name + '-coverage', 'missing': sorted(set(tree) - paths), 'extra': sorted(paths - set(tree))})
blocked = {path for path, row in observations.items() if row['observed']['kind'] != 'present'}
if blocked != set(declared_blockers):
    errors.append({'kind': 'capture-blocker-set', 'only_s1': sorted(set(declared_blockers) - blocked), 'only_s2': sorted(blocked - set(declared_blockers))})
by_id = {row['id']: row for row in artifacts}
direct = {}
source_counts = {}
cross_scope_edges = []
for artifact in artifacts:
    sources = artifact['build_dependencies']['sources']
    paths = set()
    for pop in sources['primary_populations']:
        domain = pop['domain']
        if domain not in domains or pop['membership_sha256'] != index['domains'][domain]['membership_identity']:
            errors.append({'kind': 'population-binding', 'artifact': artifact['id'], 'domain': domain})
            continue
        paths.update(domains[domain])
    for anchor in sources['additional_anchors']:
        path = anchor['path']
        if anchor['git_object_type'] == 'tree':
            expanded = {name for name in tree if name.startswith(path.rstrip('/') + '/')}
            if not expanded:
                errors.append({'kind': 'empty-tree-anchor', 'artifact': artifact['id'], 'path': path})
            paths.update(expanded)
        else:
            paths.add(path)
            if path not in tree or tree[path]['blob'] != anchor['git_object']:
                errors.append({'kind': 'anchor-binding', 'artifact': artifact['id'], 'path': path})
    direct[artifact['id']] = paths & blocked
    source_counts[artifact['id']] = len(paths)
    for dep in artifact['build_dependencies']['artifacts']:
        if dep not in by_id:
            errors.append({'kind': 'missing-artifact-dependency', 'artifact': artifact['id'], 'dependency': dep})
        elif by_id[dep]['scope'] != artifact['scope']:
            cross_scope_edges.append({'artifact': artifact['id'], 'dependency': dep, 'artifact_scope': artifact['scope'], 'dependency_scope': by_id[dep]['scope']})
closure = {}
pending = set(by_id)
while pending:
    ready = sorted(key for key in pending if all(dep in closure for dep in by_id[key]['build_dependencies']['artifacts']))
    if not ready:
        errors.append({'kind': 'dependency-cycle-or-unresolved', 'artifacts': sorted(pending)})
        break
    for key in ready:
        closure[key] = set(direct[key])
        for dep in by_id[key]['build_dependencies']['artifacts']:
            closure[key].update(closure[dep])
        pending.remove(key)
rows = []
for artifact in artifacts:
    key = artifact['id']
    rows.append({'artifact': key, 'scope': artifact['scope'], 'layer': artifact['layer'], 'source_leaves': source_counts[key], 'direct_capture_blockers': sorted(direct[key]), 'dependency_closure_capture_blockers': sorted(closure.get(key, set())), 'production': 'NOT_RUN', 'release': 'NOT_RELEASED'})
layers = {}
for layer in ['L1', 'L2', 'L3', 'L4']:
    group = [row for row in rows if row['layer'] == layer]
    layers[layer] = {'required': len(group), 'directly_capture_blocked': sum(bool(row['direct_capture_blockers']) for row in group), 'closure_capture_blocked': sum(bool(row['dependency_closure_capture_blockers']) for row in group), 'not_capture_blocked': sum(not row['dependency_closure_capture_blockers'] for row in group), 'produced': 0, 'accepted': 0}
report = {'schema': 'genesis-source-inventory-reconciliation/v1', 'campaign': '20261111-v1', 'session': 's2', 'source_revision': SOURCE,
          's1_scope_commit': 'f59a4f1bb83243022c52e18d3717e43ed1f7db60', 's1_handoff_observed_commit': 'bf76a2be592fa6a445b243b8652ee64ed2e498f6',
          'inputs': [{'path': str(path.relative_to(ROOT)), 'sha256': sha(path)} for path in [INV / 'artifacts.json', INV / 'path-ownership/index.json', INV / 'capture-blockers.json', OUT / 'source-observer-results.json']],
          'counts': {'source_leaves': len(tree), 'domains': len(domains), 'shards_verified': sum(row['verified'] for row in shards), 'observer_non_present': len(blocked), 's1_capture_blockers': len(declared_blockers), 'required_artifacts': len(artifacts), 'cross_scope_build_edges': len(cross_scope_edges)},
          'blocker_sets_equal': blocked == set(declared_blockers), 'errors': errors, 'layers': layers, 'artifact_capture': rows, 'cross_scope_build_edges': cross_scope_edges,
          'capture_classification': dict(collections.Counter(reason for row in declared_blockers.values() for reason in row['reasons'])),
          'interpretation': 'This is a source-readiness reconciliation of the declared dependency graph. It is not a runtime affected-set oracle, semantic acceptance, frozen authority disposition or production release.',
          'required_mapping': 'S1 domain scopes and flow scopes cross in build edges. Runtime manifests enforce a single common scope; S1/S5 must bind an Orchestra-wide cumulative manifest mapping while preserving every inventory artifact ID and domain label, or integrate a reviewed cross-manifest dependency extension.'}
output = OUT / 'source-inventory-reconciliation.json'
output.write_text(json.dumps(report, ensure_ascii=False, indent=2) + '\n')
print(json.dumps({'path': str(output), 'sha256': sha(output), 'counts': report['counts'], 'layers': layers, 'errors': errors, 'capture_classification': report['capture_classification']}, ensure_ascii=False, indent=2))
if errors:
    raise SystemExit(1)
