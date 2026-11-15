"""Append already-consumed public authority before a derived packet's first dispatch.

This transports exact source lines. It does not change an author input, body, recipe,
criterion, or previous judgment. Prior prepared packet bytes remain available.
"""
from pathlib import Path
import datetime
import hashlib
import json
import sys

W = Path(__file__).resolve().parents[1]
lot = sys.argv[1]
assert lot.startswith('derived-')
packet = W / 'review-packets' / (lot + '.md')
metadata = packet.with_suffix('.manifest.json')
old_packet, old_meta = packet.read_bytes(), metadata.read_bytes()
record = json.loads(old_meta)
assert record['dispatch_state'] == 'NOT_YET_DISPATCHED'
assert not (W / 'relay' / lot / 'dispatch-receipt.json').exists()
assert not (W / 'relay-root' / lot / 'dispatch-receipt.json').exists()
assert b'BEGIN_LITERAL_AUTHORITY' not in old_packet
H = lambda raw: hashlib.sha256(raw).hexdigest()
assert H(old_packet) == record['sha256']
slug = record['artifact'].removeprefix('s1.subslice03.')
manifest = json.loads((W / ('producers/derived-' + slug) / 'production-manifest.json').read_text())
if 'inputs' in manifest:
    inputs = manifest['inputs']
elif manifest.get('schema') == 's1-03-derived-production-manifest/v1' and record['artifact'] == 's1.subslice03.entry':
    inputs = manifest['actual_inputs']
else:
    raise AssertionError('Unrecognized actual input manifest schema')
parts = [old_packet, b'\n## Autoridade publica decisiva para procedimentos e limites\n\n',
         'Recortes de inputs públicos já consumidos pelo autor, transportados literalmente antes do primeiro despacho. Não são execução de comandos nem concessão de autoridade.\n\n'.encode()]
excerpts = []
for path, intervals in [('inputs/AGENTS.md', [(1, 1), (158, 178), (194, 205)]),
                        ('inputs/COMMON.md', [(34, 41), (93, 103)])]:
    whole = (W / path).read_bytes()
    assert any(row['local_path'] == path and row['sha256'] == H(whole) for row in inputs)
    lines = whole.splitlines(keepends=True)
    for first, last in intervals:
        raw = b''.join(lines[first - 1:last])
        identity = {'path': path, 'first_line': first, 'last_line': last,
                    'source_bytes': len(whole), 'source_sha256': H(whole),
                    'bytes': len(raw), 'sha256': H(raw)}
        excerpts.append(identity)
        parts += [('BEGIN_LITERAL_AUTHORITY ' + json.dumps(identity, ensure_ascii=False) + '\n').encode(),
                  raw, b'END_LITERAL_AUTHORITY\n\n']
history = W / 'review-packets/prepared-history'
history.mkdir(exist_ok=True)
for suffix, raw in [('.md', old_packet), ('.manifest.json', old_meta)]:
    target = history / (lot + '-before-public-authority' + suffix)
    assert not target.exists()
    target.write_bytes(raw)
new = b''.join(parts)
record.update(bytes=len(new), sha256=H(new),
              git_blob_sha=hashlib.sha1(b'blob ' + str(len(new)).encode() + b'\0' + new).hexdigest(),
              public_authority_excerpts=excerpts,
              predispatch_amendment={'at_utc': datetime.datetime.now(datetime.timezone.utc).isoformat(),
                                    'previous_sha256': H(old_packet),
                                    'procedure_sha256': H(Path(__file__).read_bytes()),
                                    'body_or_recipe_changed': False})
packet.write_bytes(new)
metadata.write_text(json.dumps(record, ensure_ascii=False, indent=2) + '\n')
print(json.dumps({'lot': lot, 'bytes': len(new), 'sha256': H(new), 'exact_excerpts': len(excerpts)}))
