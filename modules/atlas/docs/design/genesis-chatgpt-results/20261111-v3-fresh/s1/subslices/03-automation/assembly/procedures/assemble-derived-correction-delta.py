"""Transport a complete corrected body and every changed evidence segment.

Reuse only the exact prior packet already received independently by the same pair.
This mechanical projection does not infer a verdict or expose another judge's prose.
"""
from pathlib import Path
import datetime
import difflib
import hashlib
import json
import sys

W = Path(__file__).resolve().parents[1]
P = W / 'payload'
key, version, history_relative, previous_lot = sys.argv[1:]
slug = key.removeprefix('s1.subslice03.')
D = W / ('producers/derived-' + slug)
OLD = W / history_relative
H = lambda raw: hashlib.sha256(raw).hexdigest()
G = lambda raw: hashlib.sha1(b'blob ' + str(len(raw)).encode() + b'\0' + raw).hexdigest()

def readj(path):
    return json.loads(path.read_text())

def ident(path):
    raw = path.read_bytes()
    return {'path': str(path.relative_to(W)), 'bytes': len(raw), 'sha256': H(raw), 'git_blob_sha': G(raw)}

def changes(before, after):
    a, b = before.decode().splitlines(keepends=True), after.decode().splitlines(keepends=True)
    result = []
    for tag, i, j, k, l in difflib.SequenceMatcher(a=a, b=b, autojunk=False).get_opcodes():
        if tag != 'equal':
            result.append({'tag': tag, 'old_lines_zero_based_half_open': [i, j],
                           'new_lines_zero_based_half_open': [k, l],
                           'old_exact_text': ''.join(a[i:j]), 'new_exact_text': ''.join(b[k:l])})
    reconstructed = a[:]
    for item in reversed(result):
        i, j = item['old_lines_zero_based_half_open']
        reconstructed[i:j] = item['new_exact_text'].splitlines(keepends=True)
    assert ''.join(reconstructed).encode() == after
    return result

prior_packet = W / 'review-packets' / (previous_lot + '.md')
prior_receipt = readj(W / 'relay' / previous_lot / 'dispatch-receipt.json')
assert H(prior_packet.read_bytes()) == prior_receipt['source_sha256']
assert set(prior_receipt['completed_targets']) == {'/root/s1_03_j1', '/root/s1_03_j2'}
for judge in ['j1', 'j2']:
    capture = prior_receipt['judgment_captures'][judge]
    assert capture['literal'] is True and capture['target'] == '/root/s1_03_' + judge
    assert H(Path(capture['file']).read_bytes()) == capture['sha256']
    assert any(c['target'] == capture['target'] and c['tool_returned_normally'] for c in prior_receipt['calls'])

old, new = readj(OLD / 'production-manifest.json'), readj(D / 'production-manifest.json')
assert new['artifact']['key'] == key
previous = {row['local_path']: row for row in old['inputs']}
current = {row['local_path']: row for row in new['inputs']}
assert len(previous) == len(old['inputs']) and len(current) == len(new['inputs'])
assert set(previous) <= set(current)
for path, row in current.items():
    raw = (W / path).read_bytes()
    assert len(raw) == row.get('bytes', row.get('byte_length')) and H(raw) == row['sha256']
    assert G(raw) == row.get('git_blob_sha', row.get('calculated_git_blob_sha'))
    if path in previous:
        assert row['sha256'] == previous[path]['sha256']
added = [row for path, row in current.items() if path not in previous]
body, evidence = (D / 'body.md').read_bytes(), (D / 'evidence.md').read_bytes()
body_changes = changes((OLD / 'body.md').read_bytes(), body)
evidence_changes = changes((OLD / 'evidence.md').read_bytes(), evidence)
actual = new.get('actual_authoring_recipe', new.get('effective_authoring_recipe', new.get('actual_recipe', {})))
recipe_relative = next(actual[name]['local_path'] for name in ['task_recipe', 'per_task', 'current_recipe', 'correction'] if name in actual)
recipe = W / recipe_relative
assert recipe_relative in current
verification = P / ('receipts/derived-' + slug + '-' + version + '-verification.json')
verified = readj(verification)
assert verified['body_sha256'] == H(body) and verified['input_count'] == len(current)
full_packet = W / 'review-packets' / ('derived-' + slug + '-' + version + '.md')
full_meta = readj(full_packet.with_suffix('.manifest.json'))
assert full_meta['dispatch_state'] == 'NOT_YET_DISPATCHED' and H(full_packet.read_bytes()) == full_meta['sha256']

header = f'''# {key} — correção {version} e corpo inteiro corrente

Mesmos J1/J2, execução 34269cf4-d631-41c5-a30b-85b0ec217390; independentes, sem ferramentas. Reutilize somente seu próprio exame e o pacote literal anterior {previous_lot}, {prior_packet.stat().st_size} bytes, SHA256 {H(prior_packet.read_bytes())}. Nenhum voto do outro juiz é retransmitido.

O corpo corrente inteiro e a receita de correção inteira seguem abaixo. Aplicar os critérios públicos já recebidos, em especial GO-A1–7, GO-I1/2/7/8, QS1–6, CC1/3/7 e AC01 local. Julgue a correção e sua integração com os trechos inalterados. Se suficiente, explicite PASS para TODOS OS BYTES DO CORPO CORRENTE, não apenas o delta; identifique qualquer falta obrigatória concreta. Sugestões opcionais não ampliam a barra. Runtime, consumidores, manutenção executada e entrega têm provas próprias.

A principal leu o corpo e a evidência correntes, capturou o FINAL original, e conferiu deterministicamente {len(current)} inputs integrais e outputs. Os {len(previous)} inputs anteriores mantêm identidade; há {len(added)} unidades novas. Abaixo estão todos os segmentos alterados da evidência com coordenadas e texto exato; sua aplicação à evidência anterior recompõe exatamente os bytes correntes. O corpo também tem reconstrução exata verificada e é retransmitido integralmente. São projeções mecânicas identificadas; não se alega leitura pelo juiz de todo manifesto/delta original. Originais completos permanecem preservados. Contrato comum e plano público são os mesmos literais recebidos anteriormente; nenhuma autoridade nova foi introduzida.

Decida somente após FIM_DO_LOTE externo. Nenhum dependente foi liberado.
'''
identities = {'previous_body': ident(OLD / 'body.md'), 'current_body': ident(D / 'body.md'),
              'previous_evidence': ident(OLD / 'evidence.md'), 'current_evidence': ident(D / 'evidence.md'),
              'previous_manifest': ident(OLD / 'production-manifest.json'), 'current_manifest': ident(D / 'production-manifest.json'),
              'body_changes': body_changes, 'body_reconstruction_equal': True, 'evidence_reconstruction_equal': True,
              'recipe': ident(recipe), 'verification': ident(verification)}
parts = [header.encode(), '\n## Identidades e delta — projeção mecânica\n\n'.encode(),
         json.dumps(identities, ensure_ascii=False, indent=2).encode(),
         b'\n\n## BEGIN_CORPO_INTEIRO_CORRENTE\n\n', body,
         b'\n## END_CORPO_INTEIRO_CORRENTE\n\n## BEGIN_RECEITA_INTEIRA\n\n', recipe.read_bytes(),
         b'\n## END_RECEITA_INTEIRA\n']
for number, change in enumerate(evidence_changes, 1):
    metadata = {k: v for k, v in change.items() if k not in ['old_exact_text', 'new_exact_text']}
    parts.append(('\n## EVIDENCIA_DELTA_' + str(number) + ' ' + json.dumps(metadata, ensure_ascii=False) +
                  '\n\nBEGIN_NEW_EXACT_TEXT\n').encode() + change['new_exact_text'].encode() + b'\nEND_NEW_EXACT_TEXT\n')
parts.append('\n## Novos inputs — projeção do manifesto posterior\n\n'.encode())
for row in added:
    parts.append((json.dumps(row, ensure_ascii=False) + '\n').encode())
packet = b''.join(parts)
lot = 'derived-' + slug + '-' + version + '-delta'
destination = W / 'review-packets' / (lot + '.md')
assert not destination.exists()
destination.write_bytes(packet)
metadata = {'schema': 's1-03-derived-delta-review-packet/v2', 'lot': lot, 'artifact': key,
            'layer': new['artifact']['layer'], 'version': version, 'bytes': len(packet), 'sha256': H(packet),
            'git_blob_sha': G(packet), 'body_bytes': len(body), 'body_sha256': H(body),
            'body_sent_complete': True, 'prior_packet': ident(prior_packet), 'retained_inputs': len(previous),
            'added_inputs': len(added), 'changed_evidence_segments': len(evidence_changes),
            'evidence_reconstruction_matches': True, 'full_alternative_packet_not_dispatched': str(full_packet.relative_to(W)),
            'procedure': ident(Path(__file__)), 'dispatch_state': 'NOT_YET_DISPATCHED'}
destination.with_suffix('.manifest.json').write_text(json.dumps(metadata, ensure_ascii=False, indent=2) + '\n')
print(json.dumps(metadata, ensure_ascii=False))
