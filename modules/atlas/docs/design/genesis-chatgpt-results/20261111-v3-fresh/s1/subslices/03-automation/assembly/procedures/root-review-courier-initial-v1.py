"""Prepare or record a literal root-to-judge dispatch; never call a collaborator itself."""
from pathlib import Path
import datetime
import hashlib
import json
import shutil
import sys

W = Path(__file__).resolve().parents[1]
action, lot, judge, part_text = sys.argv[1:5]
assert judge in ['j1', 'j2']
part_number = int(part_text)
source = W / 'relay' / lot
destination = W / 'relay-root' / lot
manifest = json.loads((source / 'manifest.json').read_text())
parts = manifest['parts']
whole = b''.join((source / row['file']).read_bytes() for row in parts)
assert len(whole) == manifest['source_bytes']
assert hashlib.sha256(whole).hexdigest() == manifest['source_sha256']
assert whole == (W / manifest['source']).read_bytes()
part = next(row for row in parts if row['part'] == part_number)
raw = (source / part['file']).read_bytes()
assert len(raw) == part['bytes'] and hashlib.sha256(raw).hexdigest() == part['sha256']
target = '/root/s1_03_' + judge
destination.mkdir(parents=True, exist_ok=True)
request_path = destination / f'request-{judge}-{part_number:02}.json'
message_path = destination / f'message-{judge}-{part_number:02}.txt'
if action == 'prepare':
    assert not request_path.exists() and not message_path.exists()
    for filename in ['manifest.json', part['file']]:
        dest = destination / filename
        if dest.exists():
            assert dest.read_bytes() == (source / filename).read_bytes()
        else:
            shutil.copyfile(source / filename, dest)
    intro = (f'Transporte literal pela principal ao mesmo juiz {judge.upper()}, execução 34269cf4-d631-41c5-a30b-85b0ec217390. '
             'Não use ferramentas, delegue, edite ou receba parecer do outro juiz. '
             f'Lote {lot}; parte {part_number}/{len(parts)}. '
             f'Pacote canônico {manifest["source_bytes"]} bytes SHA256 {manifest["source_sha256"]}. '
             f'Esta parte tem {part["bytes"]} bytes SHA256 {part["sha256"]}. '
             'Conserve o exame anterior e os deltas já recebidos. Julgue apenas após FIM_DO_LOTE; até lá responda somente ACK da parte e da última âncora.\n\nBEGIN_PART\n')
    suffix = '\nEND_PART\n'
    if part_number == len(parts):
        suffix += 'FIM_DO_LOTE. Avalie todos os critérios pertinentes e dê a decisão deste lote, com disposição explícita das pendências. Não infira aceite do corpo inteiro a partir de cobertura parcial.\n'
    message = intro + raw.decode('utf-8') + suffix
    message_path.write_text(message)
    request_path.write_text(json.dumps({'target': target, 'message': message}, ensure_ascii=False, indent=2) + '\n')
    print(message, end='')
elif action == 'record-success':
    request = json.loads(request_path.read_text())
    assert request['target'] == target and request['message'] == message_path.read_text()
    receipt_path = destination / 'dispatch-receipt.json'
    receipt = json.loads(receipt_path.read_text()) if receipt_path.exists() else {
        'schema': 's1-03-native-judge-dispatch/v1', 'lot': lot,
        'execution_id': '34269cf4-d631-41c5-a30b-85b0ec217390',
        'caller': '/root', 'transport_only': True, 'calls': [],
        'host_wire_checksum_available': False,
        'scope': 'Actual successful collaboration.followup_task calls only. Prepared files are not calls.'}
    assert not any(row['judge'] == judge and row['part'] == part_number for row in receipt['calls'])
    receipt['calls'].append({'judge': judge, 'target': target, 'part': part_number, 'sequence': part_number,
                             'tool': 'collaboration.followup_task', 'tool_returned_normally': True,
                             'observed_at_utc': datetime.datetime.now(datetime.timezone.utc).isoformat(),
                             'request_file': request_path.name, 'message_file': message_path.name,
                             'message_bytes': len(request['message'].encode()),
                             'message_sha256': hashlib.sha256(request['message'].encode()).hexdigest(),
                             'packet_bytes': len(raw), 'packet_sha256': hashlib.sha256(raw).hexdigest(),
                             'physical_attempts': 'UNKNOWN', 'tokens': 'UNKNOWN', 'cost': 'UNKNOWN'})
    receipt_path.write_text(json.dumps(receipt, ensure_ascii=False, indent=2) + '\n')
    print(json.dumps({'recorded': True, 'lot': lot, 'judge': judge, 'part': part_number}))
else:
    raise SystemExit('prepare or record-success expected')
