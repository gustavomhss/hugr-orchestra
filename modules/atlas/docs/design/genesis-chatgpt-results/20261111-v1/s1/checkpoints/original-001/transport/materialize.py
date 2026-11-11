#!/usr/bin/env python3
"""Verify and materialize the exact S1 inventory payload; no network or product execution."""
import argparse, base64, gzip, hashlib, io, json, pathlib, tarfile
p=argparse.ArgumentParser()
p.add_argument('--transport', type=pathlib.Path, default=pathlib.Path(__file__).resolve().parent)
p.add_argument('--out', type=pathlib.Path, required=True)
a=p.parse_args()
manifest=json.loads((a.transport/'manifest.json').read_text())
chunks=[]
for item in manifest['parts']:
    b=(a.transport/'parts'/pathlib.PurePosixPath(item['path']).name).read_bytes()
    if len(b)!=item['bytes'] or hashlib.sha256(b).hexdigest()!=item['sha256']:
        raise SystemExit('transport part mismatch: '+item['path'])
    chunks.append(b.strip())
compressed=base64.b64decode(b''.join(chunks),validate=True)
if hashlib.sha256(compressed).hexdigest()!=manifest['gzip_sha256']:
    raise SystemExit('gzip identity mismatch')
raw=gzip.decompress(compressed)
if hashlib.sha256(raw).hexdigest()!=manifest['tar_sha256']:
    raise SystemExit('tar identity mismatch')
expected={x['path']:x for x in manifest['members']}
seen=set()
a.out.mkdir(parents=True,exist_ok=True)
with tarfile.open(fileobj=io.BytesIO(raw),mode='r:') as archive:
    for member in archive.getmembers():
        name=pathlib.PurePosixPath(member.name)
        if not member.isfile() or name.is_absolute() or '..' in name.parts or str(name) not in expected or str(name) in seen:
            raise SystemExit('unsafe/unexpected member: '+member.name)
        b=archive.extractfile(member).read()
        e=expected[str(name)]
        if len(b)!=e['bytes'] or hashlib.sha256(b).hexdigest()!=e['sha256']:
            raise SystemExit('member identity mismatch: '+member.name)
        target=a.out.joinpath(*name.parts)
        target.parent.mkdir(parents=True,exist_ok=True)
        if target.exists() and target.read_bytes()!=b:
            raise SystemExit('refusing to overwrite different bytes: '+str(target))
        target.write_bytes(b)
        seen.add(str(name))
if seen!=set(expected):
    raise SystemExit('missing archive members')
print(json.dumps({'result':'ALL_BYTES_VERIFIED','members':len(seen),'output':str(a.out.resolve()),
                  'canonical_inventory_sha256':manifest['canonical_inventory_sha256'],
                  'product_execution':'NOT_RUN'}))
