"""Prepare exact whole-v4 review material; dispatch only if whole-body acceptance is absent."""
from pathlib import Path
import hashlib
import json

W = Path(__file__).resolve().parents[1]
D = W / 'producers/automation'
LOT = 'automation-aggregate-v4'
H = lambda b: hashlib.sha256(b).hexdigest()
G = lambda b: hashlib.sha1(b'blob ' + str(len(b)).encode() + b'\0' + b).hexdigest()

def ident(path):
    b = path.read_bytes()
    return {'path': str(path.relative_to(W)), 'bytes': len(b), 'sha256': H(b), 'git_blob_sha': G(b)}

history = {v: D / (f'history/body-v{v}.md' if v < 4 else 'body.md') for v in [1, 2, 3, 4]}
chain = []
for v in [2, 3, 4]:
    delta_path = D / f'revisions/v{v}/delta.json'
    d = json.loads(delta_path.read_text())
    before, after = history[v-1].read_bytes(), history[v].read_bytes()
    for label, raw in [('before', before), ('after', after)]:
        pin = d[label]['body']
        assert len(raw) == pin['bytes'] and H(raw) == pin['sha256'] and G(raw) == pin['git_blob_sha']
    changes = [d['literal_delta']] if v == 2 else d['changes']
    reconstructed = before
    projected = []
    for change in changes:
        old, new = change['old_text'].encode(), change['new_text'].encode()
        assert reconstructed.count(old) == 1
        reconstructed = reconstructed.replace(old, new, 1)
        projected.append({k: change[k] for k in ['id', 'section', 'old_text', 'new_text'] if k in change})
    assert reconstructed == after, f'Unlisted body mutation in v{v}'
    chain.append({'from': v-1, 'to': v, 'original_delta': ident(delta_path),
                  'before_body': ident(history[v-1]), 'after_body': ident(history[v]),
                  'literal_substitutions': projected,
                  'actual_procedure': ident(D / d['procedure']['path']),
                  'exact_reconstruction': True})
body = history[4].read_bytes()
assert len(body) == 60767 and H(body) == '968965f1b15d633cefc8a78868d9d1049147f23dff409c6cb05c7a75e3561cae'
assert sum(len(c['literal_substitutions']) for c in chain) == 6
control = {
    'scope': 's1.core.automation whole current v4 body, not the entire S1 mission',
    'body': ident(history[4]),
    'required_prior_lots': ['automation-1-supplement-v2-coverage-erratum',
                           'automation-population-current-v1', 'automation-2-supplement-v2',
                           'automation-3-supplement-v3', 'automation-4-supplement-v4'],
    'reuse_rule': 'Each judge reuses only their own prior reviews and the literal evidence already received. No other judge prose or reserved answer is included.',
    'dispatch_rule': 'Prepared only. Deliver to a judge after that judge has received all mandatory lot evidence, only when no explicit whole-current-body PASS already exists. Do not repeat a complete existing acceptance.',
    'population': {'assigned': 204, 'actions': 155, 'board': 38, 'scheduled-task': 11,
                   'current_projection_packet': ident(W / 'review-packets/automation-population-current-v1.md')},
    'operational_limits': 'Whole-body semantic PASS does not certify runtime binding, consumers, maintenance, guards, product/provider execution or delivery completion.',
}
text = '# Automação — decisão agregada do corpo corrente v4\n\n'
text += 'Mesmos J1/J2, independentes e sem ferramentas. O objetivo é uma decisão explícita sobre todos os bytes correntes depois da revisão dos quatro recortes e do censo individual. Reutilize suas próprias evidências e feche ou mantenha cada pendência obrigatória; não infira PASS agregado da mera contagem dos lotes. Não receberá parecer do outro juiz.\n\n'
text += '## Identidades e regra de reúso\n\n```json\n' + json.dumps(control, ensure_ascii=False, indent=2) + '\n```\n\n'
text += '## Reconciliação mecânica das seis substituições já autoradas\n\nA aplicação literal das mudanças declaradas reproduz cada versão integral seguinte, sem outra alteração de corpo. As identidades dos procedimentos são proveniência; este transporte não é nova autoria.\n\n```json\n'
text += json.dumps(chain, ensure_ascii=False, indent=2) + '\n```\n\n'
text += '## BEGIN_CORPO_V4_EXATO\n\n' + body.decode() + '\n## END_CORPO_V4_EXATO\n\n'
text += 'Após o FIM_DO_LOTE externo, emita PASS, FIX-FIRST ou REQUEST_EVIDENCE explícito para o corpo inteiro v4 identificado acima, com disposição das pendências. Aplique os critérios públicos pertinentes já recebidos. Obrigações operacionais e de preservação global mantêm suas provas próprias.\n'
packet = W / 'review-packets' / (LOT + '.md')
assert not packet.exists()
packet.write_text(text)
manifest = {'schema': 's1-03-automation-whole-body-review/v1', 'lot': LOT,
            'packet': ident(packet), 'body': ident(history[4]),
            'revision_chain': chain, 'original_revision_count': 4,
            'substitution_count': 6, 'no_new_body_authorship': True,
            'dispatch_status': 'PREPARED_NOT_DISPATCHED', 'actual_procedure': ident(Path(__file__))}
packet.with_suffix('.manifest.json').write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + '\n')
archive = W / 'payload/assembly/procedures' / Path(__file__).name
assert not archive.exists()
archive.write_bytes(Path(__file__).read_bytes())
print(json.dumps(manifest['packet']))
