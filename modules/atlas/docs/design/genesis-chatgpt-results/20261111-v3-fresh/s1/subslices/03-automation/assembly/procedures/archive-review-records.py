"""Archive actual visible review records; prepared-only files are not dispatches."""
from pathlib import Path
import hashlib
import json
import shutil

W = Path(__file__).resolve().parents[1]
P = W / 'payload'
archives = []

def copy(source, destination, original=False):
    raw = source.read_bytes()
    destination.parent.mkdir(parents=True, exist_ok=True)
    if original and destination.exists():
        assert destination.read_bytes() == raw, f'Preserved original changed: {destination}'
    destination.write_bytes(raw)
    archives.append({'source': str(source.relative_to(W)), 'path': str(destination.relative_to(P)),
                     'bytes': len(raw), 'sha256': hashlib.sha256(raw).hexdigest()})

for root_name in ['relay', 'relay-root']:
    root = W / root_name
    if not root.exists():
        continue
    for receipt in sorted(root.rglob('dispatch-receipt.json')):
        directory = receipt.parent
        if any(part.startswith('prepared') for part in receipt.relative_to(root).parts):
            continue
        record = json.loads(receipt.read_text())
        calls = record.get('calls', record.get('dispatches', []))
        if not calls:
            continue
        relative = directory.relative_to(root)
        lot = relative.parts[0]
        category = 'derived' if lot.startswith('derived-') else 'delivery' if lot.startswith('delivery-') else 'consumers' if lot.startswith('consumer-') else 'l1'
        base = P / 'judgments' / category
        target = base / relative if root_name == 'relay' else base / lot / 'root-transport' / Path(*relative.parts[1:])
        copy(receipt, target / 'dispatch-receipt.json')
        requested = {call['request_file'] for call in calls if call.get('request_file')}
        messages = {call['message_file'] for call in calls if call.get('message_file')}
        for name in sorted(requested | messages):
            src = directory / name
            assert src.is_file(), f'Actual dispatch record missing: {src}'
            copy(src, target / name, original=True)
        for src in sorted(directory.iterdir()):
            if not src.is_file() or src.name == 'dispatch-receipt.json':
                continue
            keep = (src.name in {'manifest.json','wire-manifest.json','response-capture.json','j1-response.md','j2-response.md'}
                    or src.name.startswith(('ack-', 'actual-', 'part-')))
            if keep:
                copy(src, target / src.name, original=src.name.endswith('-response.md') or src.name.startswith(('ack-', 'actual-', 'part-')))
        packet = W / 'review-packets' / (lot + '.md')
        manifest = W / 'review-packets' / (lot + '.manifest.json')
        if packet.exists():
            copy(packet, base / lot / 'packet.md', original=True)
        if manifest.exists():
            copy(manifest, base / lot / 'packet-manifest.json', original=True)

result = {'schema': 's1-03-visible-review-record-archive/v1',
          'count': len(archives), 'files': archives,
          'dispatch_count_rule': 'Count only actual invocations recorded in dispatch-receipt.json, preserving whether normal return, truncated display or delivery confirmation was observed. Prepared files, canonical parts/manifests, ACKs and correction indexes are not inferred extra requests.',
          'transport_proof_limit': 'Visible native arguments/results were archived by their caller; no independent host-provided argument checksum or message id is available. Transcription corrections remain explicit.',
          'prepared_only_directories_excluded': True,
          'not_new_semantic_judgment': True}
(P / 'receipts/review-record-archive.json').write_text(json.dumps(result, ensure_ascii=False, indent=2) + '\n')
print(json.dumps({'archive_file_observations': len(archives), 'prepared_only_excluded': True}))
