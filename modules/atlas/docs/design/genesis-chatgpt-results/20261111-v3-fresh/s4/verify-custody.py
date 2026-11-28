"""Verify preserved original Actions files against their custody manifest; no Atlas operation."""
import argparse
import hashlib
import json
from pathlib import Path, PurePosixPath

S4 = 'modules/atlas/docs/design/genesis-chatgpt-results/20261111-v3-fresh/s4/'
OWN = S4 + 'runtime/own-20261128/'


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--repository', type=Path, required=True)
    parser.add_argument('--output', type=Path, required=True)
    args = parser.parse_args()
    raw_manifest = (args.repository / (OWN + 'operational-custody.json')).read_bytes()
    if hashlib.sha256(raw_manifest).hexdigest() != '3f93b9e0142c86e8cc2ffc85458b1cc953bea323ef42a9fa03626094d494020e':
        raise ValueError('audited custody manifest differs')
    manifest = json.loads(raw_manifest)
    if manifest['schema'] != 's4-operational-custody/v1':
        raise ValueError('unexpected custody schema')
    if len(manifest['files']) != 130 or len(manifest['existing_files_verified']) != 11:
        raise ValueError('incomplete original Actions custody manifest')
    rows = manifest['files'] + manifest['existing_files_verified']
    seen = set()
    for row in rows:
        path = row['path']
        if path in seen or not path.startswith(S4) or '..' in PurePosixPath(path).parts:
            raise ValueError('duplicate or unsafe custody path: ' + path)
        seen.add(path)
        target = args.repository / path
        if target.is_symlink() or not target.is_file():
            raise ValueError('custody file unavailable: ' + path)
        raw = target.read_bytes()
        blob = hashlib.sha1(f'blob {len(raw)}\0'.encode() + raw).hexdigest()
        if len(raw) != row['byte_length'] or hashlib.sha256(raw).hexdigest() != row['sha256'] or blob != row['git_blob_sha']:
            raise ValueError('original Actions bytes differ: ' + path)
    release = (args.repository / (OWN + 'consumed-runtime-release.json')).read_bytes()
    expected = manifest['runtime_release']
    if len(release) != expected['byte_length'] or hashlib.sha256(release).hexdigest() != expected['sha256']:
        raise ValueError('preserved runtime release differs')
    result = {'schema': 's4-operational-custody-integrity/v1', 'state': 'PASS',
              'preserved_original_files': len(manifest['files']),
              'existing_files_rechecked': len(manifest['existing_files_verified']),
              'runtime_release_sha256': expected['sha256'],
              'scope': 'Exact bytes against the audited original Actions custody manifest; no new product execution or judge decision.'}
    args.output.write_text(json.dumps(result, indent=2) + '\n')
    print('S4_OPERATIONAL_CUSTODY_JSON=' + json.dumps(result, sort_keys=True))


if __name__ == '__main__':
    main()
