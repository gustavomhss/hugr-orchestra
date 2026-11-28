#!/usr/bin/env python3
"""Preserve prepare02 bytes, exact materialization, CAS, audits and proposed controls.

This creates an evidence archive only. It never restores a served Atlas store.
"""
import datetime
import hashlib
import json
from pathlib import Path
import zipfile

BASE = Path('/workspace/scratch/5cfbb6c803f1')
OUT = BASE / 's2-execution/evaluation-prepare-02-evidence.zip'
RECEIPT = BASE / 's2-execution/evaluation-prepare-02/receipt.json'
ROOT = BASE / 's2-evaluation'


def sha(data):
    return hashlib.sha256(data).hexdigest()


def main():
    receipt = json.loads(RECEIPT.read_bytes())
    files = {}

    def add(name, source, expected=None):
        source = Path(source)
        assert not source.is_symlink() and source.is_file(), str(source)
        data = source.read_bytes()
        if expected:
            assert len(data) == expected['byte_length'] and sha(data) == expected['sha256'], str(source)
        assert name not in files, name
        files[name] = (source, data)

    # Exact pre-prepare named inputs only, not newly generated execution artifacts.
    for entry in receipt['input_files_before']:
        source = Path(entry['path'])
        add('materialization/' + source.relative_to(ROOT).as_posix(), source, entry)
    for entry in receipt['cas_after']:
        add('prepared-cas/' + entry['path'], ROOT / entry['path'], entry)
    for source in sorted(RECEIPT.parent.iterdir()):
        if source.is_file():
            add('operation/' + source.name, source)
    groups = {
        'materialization-evidence': 's2-investigation/evaluation-plan',
        'independent-audit': 's2-investigation/evaluation-audit',
        'proposed-authority-not-installed': 's2-investigation/evaluation-authority',
        'release-compatibility': 's2-investigation/runtime/latest-release',
    }
    for prefix, directory in groups.items():
        root = BASE / directory
        for source in sorted(root.rglob('*')):
            if source.is_file() and '__pycache__' not in source.parts:
                add(prefix + '/' + source.relative_to(root).as_posix(), source)
    audit = json.loads((BASE / 's2-investigation/evaluation-audit/runtime-identity.json').read_bytes())
    noble = audit['omitted_resolved_packages'][0]
    for entry in noble['files']:
        add('external-runtime/noble-hashes-1.8.0/' + entry['relative_path'], entry['path'], entry)
    tar = noble['locked_tarball']
    add('external-runtime/noble-hashes-1.8.0.tgz', tar['cache_path'], tar)
    add('future-recorder-not-used-for-prepare02/record-operation.py', BASE / 's2-investigation/record-operation.py')
    add('archive-builder.py', Path(__file__).resolve())

    manifest = {
        'schema': 'genesis-s2-evaluation-prepare-archive/v1',
        'created_at': datetime.datetime.now(datetime.timezone.utc).isoformat(),
        'execution_id': receipt['execution_id'],
        'operation_id': receipt['operation_id'],
        'candidate_id': receipt['returned_candidate_id'],
        'runtime_revision': receipt['runtime_revision'],
        'scope': 'Original prepare02 and static evidence. CAS is archival only; proposed policies, external guard and generation were not installed or used for prepare02. No binding, admission or consumer is asserted.',
        'files': [{'member': name, 'byte_length': len(data), 'sha256': sha(data)}
                  for name, (_, data) in sorted(files.items())],
    }
    manifest_data = (json.dumps(manifest, ensure_ascii=False, indent=2) + '\n').encode()
    with zipfile.ZipFile(OUT, 'x', compression=zipfile.ZIP_DEFLATED, compresslevel=9) as archive:
        for name, (_, data) in sorted(files.items()):
            info = zipfile.ZipInfo(name, (2026, 11, 28, 0, 0, 0))
            info.compress_type = zipfile.ZIP_DEFLATED
            info.external_attr = 0o100644 << 16
            archive.writestr(info, data, compress_type=zipfile.ZIP_DEFLATED, compresslevel=9)
        archive.writestr('MANIFEST.json', manifest_data)
    with zipfile.ZipFile(OUT) as archive:
        assert archive.testzip() is None
        assert set(archive.namelist()) == set(files) | {'MANIFEST.json'}
        for entry in manifest['files']:
            data = archive.read(entry['member'])
            assert len(data) == entry['byte_length'] and sha(data) == entry['sha256']
        assert archive.read('MANIFEST.json') == manifest_data
    data = OUT.read_bytes()
    verification = {
        'schema': 'genesis-s2-evaluation-archive-verification/v1',
        'archive': OUT.name, 'byte_length': len(data), 'sha256': sha(data),
        'git_blob_sha': hashlib.sha1(f'blob {len(data)}\0'.encode() + data).hexdigest(),
        'payload_members': len(files), 'total_members': len(files) + 1,
        'payload_bytes': sum(len(value[1]) for value in files.values()),
        'all_members_verified': True, 'manifest_sha256': sha(manifest_data),
        'candidate_id': receipt['returned_candidate_id'], 'served_state': False,
    }
    target = OUT.with_name('evaluation-prepare-02-archive-verification.json')
    target.write_text(json.dumps(verification, indent=2) + '\n')
    print(json.dumps(verification))


if __name__ == '__main__':
    main()
