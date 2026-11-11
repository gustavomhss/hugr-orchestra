import base64, hashlib, json, pathlib, sys

root = pathlib.Path(__file__).parent
batch = root / sys.argv[1]
rows = json.loads(batch.read_text())
manifest = json.loads((root / 'source-manifest.json').read_text())
known = {row['path'] for row in manifest}
for row in rows:
    data = row['result']['structuredContent']
    assert data['sha'] == row['expected'], row['path']
    body = base64.b64decode(data['content'])
    blob = hashlib.sha1(b'blob ' + str(len(body)).encode() + b'\0' + body).hexdigest()
    assert blob == row['expected'], (row['path'], blob, row['expected'])
    path = root / 'sources' / row['path']
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_bytes(body)
    entry = {'path': row['path'], 'commit':'1cde2ff7a71bcf7aecb5d030917b577165135d38', 'git_blob_sha':data['sha'], 'sha256':hashlib.sha256(body).hexdigest(), 'byte_length':len(body), 'capture':'github_fetch_file_base64', 'display_url':data['display_url']}
    if row['path'] not in known:
        manifest.append(entry)
        known.add(row['path'])
(root / 'source-manifest.json').write_text(json.dumps(manifest, indent=2) + '\n')
batch.unlink()
print(json.dumps({'captured':len(rows),'manifest_sources':len(manifest),'blob_verification':'matched'}))
