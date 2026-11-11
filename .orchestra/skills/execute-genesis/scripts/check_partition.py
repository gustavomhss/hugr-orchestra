#!/usr/bin/env python3
"""Verify the pinned domain partition against Git metadata, without executing product code."""

import argparse
import hashlib
import json
import os
from pathlib import Path
import subprocess


def digest(lines):
    return hashlib.sha256(''.join(line + '\n' for line in lines).encode('utf-8')).hexdigest()


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--repo', required=True, help='Existing Git repository with the pinned tree objects')
    parser.add_argument('--partition', type=Path, default=Path(__file__).resolve().parents[1] / 'references/parallel-partition.json')
    args = parser.parse_args()
    partition = json.loads(args.partition.read_text())
    environment = dict(os.environ, GIT_NO_LAZY_FETCH='1')

    def git(*arguments):
        return subprocess.run(['git', '-C', args.repo, *arguments], env=environment,
                              check=True, stdout=subprocess.PIPE, stderr=subprocess.PIPE).stdout

    revision = partition['baseline_commit']
    tree = git('rev-parse', revision + '^{tree}').decode().strip()
    records = []
    for entry in git('ls-tree', '-r', '-z', '--full-tree', revision).split(b'\0'):
        if not entry:
            continue
        metadata, path = entry.split(b'\t', 1)
        mode, kind, oid = metadata.decode().split(' ')
        records.append((path.decode('utf-8'), mode, kind, oid))
    records.sort(key=lambda record: record[0].encode('utf-8'))
    paths = [record[0] for record in records]
    exact = partition['exact_files']
    prefixes = sorted(partition['directory_prefixes'], key=lambda prefix: (-len(prefix), prefix))
    errors = []
    if any(not prefix.endswith('/') for prefix in prefixes):
        errors.append('A directory prefix lacks its slash boundary')
    if len(paths) != len(set(paths)):
        errors.append('Duplicate source paths')
    missing = sorted(set(exact) - set(paths))
    empty = [prefix for prefix in prefixes if not any(path.startswith(prefix) for path in paths)]
    if missing or empty:
        errors.append({'missing_exact_rules': missing, 'empty_prefix_rules': empty})
    owners = {}
    fallback = {owner: 0 for owner in partition['shards']}
    for record in records:
        path = record[0]
        owner = exact.get(path)
        if owner is None:
            owner = next((partition['directory_prefixes'][prefix] for prefix in prefixes
                          if path.startswith(prefix)), None)
        if owner is None:
            owner = partition['resolver']['fallback_shard']
            fallback[owner] += 1
        if owner not in partition['shards']:
            errors.append({'unknown_owner': owner, 'path': path})
            continue
        owners.setdefault(owner, []).append(record)

    def check(label, observed, expected):
        if observed != expected:
            errors.append({'field': label, 'observed': observed, 'expected': expected})

    def records_digest(group):
        return digest(['\t'.join([mode, kind, oid, path]) for path, mode, kind, oid in group])

    check('tree', tree, partition['baseline_tree'])
    check('entry_count', len(records), partition['baseline_entry_count'])
    check('paths_sha256', digest(paths), partition['baseline_paths_sha256'])
    check('tree_records_sha256', records_digest(records), partition['baseline_tree_records_sha256'])
    for owner, expected in partition['shards'].items():
        group = owners.get(owner, [])
        check(owner + '.entry_count', len(group), expected['entry_count'])
        check(owner + '.path_sha256', digest([record[0] for record in group]), expected['path_sha256'])
        check(owner + '.tree_records_sha256', records_digest(group), expected['tree_records_sha256'])
        check(owner + '.fallback_count', fallback[owner], expected['fallback_count'])
    assigned = sum(map(len, owners.values()))
    check('assigned_count', assigned, len(records))
    result = {
        'verification': 'PASS' if not errors else 'FAIL',
        'proof_scope': 'Git entry ownership and object identity only; not semantic sufficiency or Genesis acceptance',
        'source_revision': revision, 'tree': tree, 'entry_count': len(records),
        'assigned_count': assigned, 'duplicates': len(paths) - len(set(paths)),
        'unassigned_count': len(records) - assigned,
        'shard_counts': {owner: len(owners.get(owner, [])) for owner in partition['shards']},
        'partition_sha256': hashlib.sha256(args.partition.read_bytes()).hexdigest(), 'errors': errors
    }
    print(json.dumps(result, ensure_ascii=False, indent=2))
    return 0 if not errors else 1


if __name__ == '__main__':
    raise SystemExit(main())
