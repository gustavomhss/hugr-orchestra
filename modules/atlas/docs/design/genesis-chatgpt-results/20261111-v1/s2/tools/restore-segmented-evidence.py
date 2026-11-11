"""Restore this delivery's exact evidence JSON files, checking every transport/content digest."""
import argparse
import base64
import gzip
import hashlib
import json
from pathlib import Path

parser = argparse.ArgumentParser()
parser.add_argument('manifest', type=Path)
parser.add_argument('output', type=Path)
args = parser.parse_args()
manifest = json.loads(args.manifest.read_text())
root = args.manifest.resolve().parent.parent
args.output.mkdir(parents=True, exist_ok=True)
for archive in manifest['archives']:
    name = archive['name']
    if Path(name).name != name or not name.endswith('.json') or archive['bytes'] > 64 * 1024 * 1024:
        raise ValueError('unsafe evidence name or unsupported size')
    parts = []
    for part in archive['parts']:
        path = (root / part['path']).resolve()
        if not path.is_relative_to(root):
            raise ValueError('part outside delivery root')
        data = path.read_bytes()
        if len(data) != part['bytes'] or hashlib.sha256(data).hexdigest() != part['sha256']:
            raise ValueError('part digest mismatch: ' + part['path'])
        parts.append(data.strip())
    compressed = base64.b64decode(b''.join(parts), validate=True)
    if len(compressed) != archive['gzip_bytes'] or hashlib.sha256(compressed).hexdigest() != archive['gzip_sha256']:
        raise ValueError('compressed stream mismatch: ' + name)
    data = gzip.decompress(compressed)
    if len(data) != archive['bytes'] or hashlib.sha256(data).hexdigest() != archive['sha256']:
        raise ValueError('restored evidence mismatch: ' + name)
    with (args.output / name).open('xb') as output:
        output.write(data)
    print(name, len(data), archive['sha256'])
