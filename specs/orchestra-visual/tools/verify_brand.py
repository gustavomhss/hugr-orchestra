#!/usr/bin/env python3
"""Read-only brand-input/copy verifier; never claims product rendering or readiness."""
from __future__ import annotations
import argparse
import hashlib
import json
import sys
from pathlib import Path, PurePosixPath
ROOT = Path(__file__).resolve().parents[1]


def safe_file(root: Path, relative: str) -> Path:
    if not isinstance(relative, str) or not relative or '\\' in relative or '\x00' in relative:
        raise ValueError('Invalid relative file path')
    parts = PurePosixPath(relative)
    if parts.is_absolute() or '..' in parts.parts or ':' in parts.parts[0]:
        raise ValueError('Unsafe path: ' + relative)
    candidate = root
    for part in parts.parts:
        candidate = candidate / part
        if candidate.is_symlink():
            raise ValueError('Symlink is not an immutable file copy: ' + relative)
    if not candidate.is_file():
        raise ValueError('Missing file: ' + relative)
    candidate.resolve().relative_to(root.resolve())
    return candidate


def digest(path: Path) -> str:
    result = hashlib.sha256()
    with path.open('rb') as stream:
        for chunk in iter(lambda: stream.read(1024 * 1024), b''):
            result.update(chunk)
    return result.hexdigest()


def verify(root: Path = ROOT, repo: Path | None = None) -> dict:
    errors, missing_optional, copies = [], [], []
    result = {'kind': 'brand-input-and-copy-check', 'status': 'FAIL',
              'product_integration_tested': False, 'errors': errors}
    try:
        mapping = json.loads(safe_file(root, 'BRAND-ASSETS.json').read_text(encoding='utf-8'))
        if mapping.get('schema_version') != 1 or mapping.get('repository') != 'gmhelmold/HuGR-Orchestra':
            raise ValueError('Unexpected brand map schema or repository')
        if mapping.get('kit_root') != 'vendor/HuGR-Brand-Kit-v1.0':
            raise ValueError('Unexpected source kit root')
        # Every path walk starts at root, so a symlinked vendor parent cannot escape.
        expected = mapping['kit_files']
        if len(expected) != mapping['kit_file_count'] or len(expected) != 304:
            raise ValueError('Expected all 304 immutable supplied kit files')
        names = set()
        for entry in expected:
            rel = entry['path']
            if rel in names:
                raise ValueError('Duplicate kit file: ' + rel)
            names.add(rel)
            source = safe_file(root, mapping['kit_root'] + '/' + rel)
            if source.stat().st_size != entry['bytes'] or digest(source) != entry['sha256']:
                errors.append('Source bytes changed: ' + rel)
        actual = {p.relative_to(root / mapping['kit_root']).as_posix()
                  for p in (root / mapping['kit_root']).rglob('*') if p.is_file()}
        if actual != names:
            errors.append('Source file inventory differs: ' + repr(sorted(actual ^ names)))
        by_file = {entry['path']: entry for entry in expected}
        assets = mapping['assets']
        ids, destinations = set(), set()
        for item in assets:
            ident, destination = item['id'], item['destination']
            if ident in ids or destination in destinations:
                raise ValueError('Duplicate asset id or destination')
            ids.add(ident); destinations.add(destination)
            if item.get('visual_bytes_immutable') is not True:
                raise ValueError('Mapped visual asset must be immutable: ' + ident)
            source = safe_file(root, mapping['kit_root'] + '/' + item['source'])
            if item['source'] not in by_file or item['sha256'] != by_file[item['source']]['sha256']:
                errors.append('Asset mapping differs from kit inventory: ' + ident)
            if digest(source) != item['sha256'] or source.stat().st_size != item['bytes']:
                errors.append('Asset source hash/size mismatch: ' + ident)
            # Verify destinations are inside the existing S05 asset scopes, even without a repo.
            dest_path = PurePosixPath(destination)
            if not (destination.startswith('packages/app/src/assets/orchestra/') or
                    destination.startswith('packages/desktop/resources/orchestra/')) or '..' in dest_path.parts or '\\' in destination:
                raise ValueError('Destination outside brand owner asset scope: ' + ident)
            if repo is not None:
                target = repo / destination
                if not target.exists() and not target.is_symlink() and not item['required_for_initial_brand_integration']:
                    missing_optional.append(ident)
                    continue
                try:
                    actual_copy = safe_file(repo, destination)
                    if digest(actual_copy) != item['sha256']:
                        errors.append('Destination bytes differ from approved source: ' + ident)
                    else:
                        copies.append(ident)
                except ValueError as error:
                    errors.append(str(error))
        required = mapping['required_asset_ids']
        declared = {item['id'] for item in assets if item['required_for_initial_brand_integration']}
        if set(required) != {'symbol-light', 'symbol-dark'} or declared != set(required):
            errors.append('Initial required brand subset differs')
        if not set(required) <= ids:
            errors.append('Required asset missing from map')
        if digest(safe_file(root, 'reference/approved.png')) != mapping['authorities']['layout_sha256']:
            errors.append('Layout reference changed')
        result.update({'source_files_checked': len(expected), 'mapped_assets_checked': len(assets),
                       'required_initial_assets': required, 'repo_copies_checked': copies,
                       'conditional_assets_absent': missing_optional, 'destination_checked': repo is not None})
    except (OSError, ValueError, KeyError, TypeError, IndexError) as error:
        errors.append(str(error))
    result['status'] = 'FAIL' if errors else 'PASS'
    return result


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--package-root', type=Path, default=ROOT)
    parser.add_argument('--repo', type=Path)
    args = parser.parse_args()
    report = verify(args.package_root, args.repo)
    print(json.dumps(report, ensure_ascii=False, indent=2))
    return int(report['status'] != 'PASS')

if __name__ == '__main__':
    sys.exit(main())
