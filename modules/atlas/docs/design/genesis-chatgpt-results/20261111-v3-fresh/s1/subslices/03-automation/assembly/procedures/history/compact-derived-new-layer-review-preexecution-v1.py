"""Reuse exact public and cumulative input context already received by both judges.

Keep the entire new body, evidence, task recipe and appended public authority.
This changes only review transport, not author inputs or semantic authority.
"""
from pathlib import Path
import hashlib
import json
import sys

W = Path(__file__).resolve().parents[1]
lot, previous_full_lot, previous_current_lot, parent_manifest_path = sys.argv[1:]
H = lambda raw: hashlib.sha256(raw).hexdigest()
G = lambda raw: hashlib.sha1(b'blob ' + str(len(raw)).encode() + b'\0' + raw).hexdigest()
readj = lambda path: json.loads(path.read_text())
packet_path = W / 'review-packets' / (lot + '.md')
old = packet_path.read_bytes()
metadata = readj(packet_path.with_suffix('.manifest.json'))
assert metadata['dispatch_state'] == 'NOT_YET_DISPATCHED' and H(old) == metadata['sha256']
assert not (W / 'relay' / lot / 'dispatch-receipt.json').exists()
assert not (W / 'relay-root' / lot / 'dispatch-receipt.json').exists()
context = []
for prior_lot in dict.fromkeys([previous_full_lot, previous_current_lot]):
    prior = W / 'review-packets' / (prior_lot + '.md')
    receipt = readj(W / 'relay' / prior_lot / 'dispatch-receipt.json')
    raw = prior.read_bytes()
    assert H(raw) == receipt['source_sha256']
    assert set(receipt['completed_targets']) == {'/root/s1_03_j1', '/root/s1_03_j2'}
    assert set(receipt['judgment_captures']) == {'j1', 'j2'}
    context.append({'lot': prior_lot, 'bytes': len(raw), 'sha256': H(raw)})
prior_full = (W / 'review-packets' / (previous_full_lot + '.md')).read_bytes()
new = old
for label, path in [('RECEITA_COMUM_EXATA', 'payload/recipes/derived-contract.json'),
                    ('PLANO_PUBLICO_EXATO', 'payload/artifact-plan.json')]:
    raw = (W / path).read_bytes()
    block = ('\n## BEGIN_' + label + '\n\n').encode() + raw + ('\n## END_' + label + '\n').encode()
    assert old.count(block) == 1 and prior_full.count(block) == 1
    replacement = ('\n## Reúso literal de ' + label + '\n\n' + path + ': ' + str(len(raw)) +
                   ' bytes; SHA256 ' + H(raw) + '. Mesmo arquivo integral recebido por ambos no lote ' +
                   previous_full_lot + '; não há conteúdo novo ou alterado neste bloco.\n').encode()
    new = new.replace(block, replacement, 1)

slug = metadata['artifact'].removeprefix('s1.subslice03.')
current = readj(W / ('producers/derived-' + slug + '/production-manifest.json'))
parent = readj(W / parent_manifest_path)
old_inputs = {row['local_path']: row for row in parent['inputs']}
new_inputs = {row['local_path']: row for row in current['inputs']}
assert set(old_inputs) <= set(new_inputs)
for path, row in old_inputs.items():
    assert row['sha256'] == new_inputs[path]['sha256']
    assert H((W / path).read_bytes()) == row['sha256']
removed = 0
lines = new.decode().splitlines(keepends=True)
retained_lines = []
for line in lines:
    if line.startswith('| '):
        cells = line.split(' | ')
        path = cells[0][2:]
        if path in old_inputs:
            assert len(cells) >= 4 and cells[2] == old_inputs[path]['sha256']
            removed += 1
            continue
    retained_lines.append(line)
assert removed == len(old_inputs)
new = ''.join(retained_lines).encode()
marker = '\n## Inputs reais — projeção mecânica do manifesto\n\n'.encode()
assert new.count(marker) == 1
explanation = (f'\n## Novos inputs — projeção mecânica do manifesto\n\n'
               f'Os {removed} inputs cumulativos anteriores mantêm os mesmos bytes/identidades do manifesto '
               f'{parent_manifest_path}, SHA256 {H((W / parent_manifest_path).read_bytes())}. '
               f'Seus registros foram recebidos nos lotes anteriores identificados neste pacote; não são retransmitidos. '
               f'A tabela contém os {len(new_inputs) - removed} inputs adicionais. O manifesto corrente integral '
               'e a tabela completa permanecem preservados no pacote alternativo preparado, sem alegar leitura integral dele pelo juiz.\n\n').encode()
new = new.replace(marker, explanation, 1)
for label in ['CORPO_EXATO', 'EVIDENCIA_EXATA', 'RECEITA_DE_TAREFA_EXATA']:
    start = ('\n## BEGIN_' + label + '\n\n').encode()
    end = ('\n## END_' + label + '\n').encode()
    original = old.split(start, 1)[1].split(end, 1)[0]
    assert new.split(start, 1)[1].split(end, 1)[0] == original
destination = packet_path.with_name(lot + '-compact.md')
assert not destination.exists()
destination.write_bytes(new)
record = dict(metadata, lot=lot + '-compact', bytes=len(new), sha256=H(new), git_blob_sha=G(new),
              unchanged_context_reuse=context, cumulative_rows_reused=removed,
              added_input_rows=len(new_inputs) - removed,
              full_alternative_packet_not_dispatched=str(packet_path.relative_to(W)),
              complete_new_body_evidence_task_recipe_preserved=True,
              procedure_sha256=H(Path(__file__).read_bytes()))
destination.with_suffix('.manifest.json').write_text(json.dumps(record, ensure_ascii=False, indent=2) + '\n')
print(json.dumps({k: record[k] for k in ['lot', 'bytes', 'sha256', 'cumulative_rows_reused', 'added_input_rows']}, ensure_ascii=False))
