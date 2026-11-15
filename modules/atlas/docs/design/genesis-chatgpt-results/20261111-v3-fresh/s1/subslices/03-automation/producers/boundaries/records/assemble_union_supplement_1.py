"""Literal kit excerpts for public RE-UNI-01/02 and RE-NAV-01; no body edit."""
import hashlib
import json
from pathlib import Path

ROOT = Path('/workspace/scratch/ef5eb2eb4a70/s1-03-34269cf4-d631-41c5-a30b-85b0ec217390')
OUT = ROOT / 'producers/boundaries'
REV = OUT / 'revisions/union-supplement-1'
(REV / 'inputs').mkdir(parents=True, exist_ok=True)
sha = lambda b: hashlib.sha256(b).hexdigest()
blob = lambda b: hashlib.sha1(b'blob ' + str(len(b)).encode() + b'\0' + b).hexdigest()

def ident(rel):
    raw = (OUT / rel).read_bytes()
    return {'path': rel, 'bytes': len(raw), 'sha256': sha(raw), 'git_blob_sha': blob(raw)}

def dump(rel, obj):
    (OUT / rel).write_text(json.dumps(obj, ensure_ascii=False, indent=2) + '\n')

for name in ['j1-response.md', 'j2-response.md']:
    (REV / 'inputs' / name).write_bytes((ROOT / 'relay/union-proposal' / name).read_bytes())

request = '''Mensagens públicas de autorização da coordenação; originais integrais dos pedidos de evidência preservados em inputs/j1-response.md e inputs/j2-response.md.

Aprovada a correção mecânica das duas razões de coverage em arquivo v2 separado, preservando original e reconciliação já congelados; o suplemento deve mostrar erratum e hashes exatos. Novo J1 union-proposal REQUEST_EVIDENCE: RE-UNI-01 pede somente dependencies.json10–54 com C-N01-host/session,C-N02,C-N05,API-session,LLM-tool; RE-UNI-02 os campos NOT_STARTED/PREPARED_NOT_EXECUTED das missions/roster com identidade. Relay salvará original. Após support, faça pequeno suplemento union; aguarde J2 para reunir ambos. Não precisa reenviar36keys/2236/divisão555/424/462/472/323 já aceitos, nem handoffsatuais externos. Sem mudança de proposta por ora.

Os originais completos da proposta já estão disponíveis e autorizados: relay/union-proposal/j1-response.md e relay/union-proposal/j2-response.md, no mesmo WD. J2 pede as mesmas seis obrigações (RE-NAV-01), sem defeito novo; J1 também pede estados do kit. Conclua o pequeno suplemento union após congelar support. Boundary suplemento root verificado e já enfileirado após research-b; support poderá reutilizar shared-reconciliation-1 pelos hashes exatos. Preserve original AGENTS somente como captura local: root não publicará cópia nova chamada AGENTS.md no namespace; fontes de autoridade ficam vinculadas ao AGENTS do repositório, inalterado.
'''
(REV / 'request.txt').write_text(request)

candidate = ident('union-navigation-proposal.md')
assert candidate['sha256'] == 'f4362077ed7eb2f0dff7bb76acd60debeaa41bd37886551977b92c02addfcb6e'
assert candidate['bytes'] == 14671
caps = {x['path']: x for x in json.loads((OUT / 'captures.json').read_text())}
kit = 'modules/atlas/docs/design/genesis-chatgpt-results/20261111-v3-fresh/s1/delegation-20261114/'
kit_rev = '70234d541a9a3539935ef16f19e33c8f2d5f30ec'
data = bytearray()
entries = []

def put(s):
    data.extend(s.encode() if isinstance(s, str) else s)

def literal(eid, relative, first, last, requests):
    path = kit + relative
    c = caps[path]
    raw = (OUT / c['capture_path']).read_bytes()
    assert c['commit'] == kit_rev
    assert sha(raw) == c['sha256'] and blob(raw) == c['git_blob_sha'] and len(raw) == c['byte_length']
    lines = raw.splitlines(keepends=True)
    a = sum(map(len, lines[:first-1])); b = sum(map(len, lines[:last]))
    ex = raw[a:b]
    rec = {'id': eid, 'requests': requests, 'path': path, 'capture_path': c['capture_path'],
           'commit': c['commit'], 'git_blob_sha': c['git_blob_sha'], 'sha256': c['sha256'], 'bytes': len(raw),
           'first_line': first, 'last_line': last, 'source_start_byte': a, 'source_end_byte_exclusive': b,
           'excerpt_bytes': len(ex), 'excerpt_sha256': sha(ex)}
    put(f'\n### {eid} — `{relative}` {first}–{last}\n\n')
    put(f'Fonte `{path}`; commit `{c["commit"]}`; blob `{c["git_blob_sha"]}`; SHA256 integral `{c["sha256"]}`; {len(raw)} bytes. Intervalo fonte [{a}, {b}); SHA256 trecho `{sha(ex)}`.\n\n`````json\n')
    rec['output_excerpt_start_byte'] = len(data)
    put(ex)
    rec['output_excerpt_end_byte_exclusive'] = len(data)
    if not ex.endswith(b'\n'): put('\n')
    put('`````\n')
    entries.append(rec)

put('# Suplemento union 1 — RE-UNI-01/02 e RE-NAV-01\n\n')
put('Produtor original `/root/boundaries_l1`. Os dois pedidos públicos foram lidos integralmente e estão preservados. Esta resposta acrescenta somente evidência literal do kit capturado; a proposta permanece byte-idêntica, com 14.671 bytes e SHA256 `f4362077ed7eb2f0dff7bb76acd60debeaa41bd37886551977b92c02addfcb6e`. Não há seleção de versão, dependência de build criada, decisão semântica ou aceite da união.\n\n')
put('## Obrigações e roteamento\n\n')
put('**Observação da fonte:** o intervalo abaixo inclui supplier, consumer e subject de `C-N01-host`, `C-N01-session`, `C-N02`, `C-N05`, `API-session` e `LLM-tool`. A entrada adjacente `tool-runtime` permanece no intervalo solicitado, sem ampliar o pedido. A atribuição é ao kit neste commit. A proposta de como usar essas rotas continua editorial e preparatória.\n')
literal('UNI-OBLIGATIONS', 'dependencies.json', 10, 54, ['J1/RE-UNI-01', 'J2/RE-NAV-01'])

put('\n## Estados históricos do kit\n\n')
put('**Observação da fonte:** cada mission abaixo declara `execution_state: NOT_STARTED`; o roster declara `state: PREPARED_NOT_EXECUTED`. O momento verificável é o conteúdo do commit do kit, não o estado atual de execução das sessões. Os cabeçalhos preservam id/branch/epoch para atribuição, e cada excerto identifica a captura integral. Não foram consultados handoffs ou progresso atuais.\n')
for n, directory in enumerate(['01-sessions', '02-tools', '03-automation', '04-api', '05-libraries'], 1):
    literal('UNI-STATE-S1-0'+str(n), directory+'/mission.json', 1, 12, ['J1/RE-UNI-02'])
literal('UNI-STATE-ROSTER', 'roster.json', 1, 10, ['J1/RE-UNI-02'])

review = (OUT / 'evidence-review.md').read_bytes()
prior = [x for x in json.loads((OUT / 'records/evidence-review-index.json').read_text()) if x['body'] == 'union-navigation-proposal.md']
assert [x['id'] for x in prior] == ['R078','R079','R080','R081','R082']
reuse = []
put('\n## Reuso e pendências compartilhadas\n\n')
put('R078–R082 permanecem os trechos recebidos do lote original. Não são retranscritos os números, as keys ou as rotas já reconhecidas nos pedidos públicos. O índice registra offsets e hashes para reuso.\n\n')
put('| Intervalo recebido | Fonte / linhas | SHA256 trecho | Bytes em evidence-review.md |\n|---|---|---|---|\n')
for x in prior:
    c = caps[x['path']]; raw = (OUT/c['capture_path']).read_bytes(); lines = raw.splitlines(keepends=True)
    a = sum(map(len, lines[:x['first_line']-1])); b = sum(map(len, lines[:x['last_line']]))
    ex = raw[a:b]
    s0 = review.index(('## '+x['id']+' ').encode())
    s = review.index(b'`````text\n', s0) + len(b'`````text\n'); e = s + len(ex)
    assert review[s:e] == ex and sha(ex) == x['sha256']
    row = {'id': x['id'], 'path': x['path'], 'first_line': x['first_line'], 'last_line': x['last_line'],
           'source_start_byte': a, 'source_end_byte_exclusive': b, 'excerpt_sha256': sha(ex),
           'review_start_byte': s, 'review_end_byte_exclusive': e, 'review_sha256': sha(review)}
    reuse.append(row)
    put(f'| {x["id"]} | `{x["path"]}` {x["first_line"]}–{x["last_line"]} | `{sha(ex)}` | [{s}, {e}) |\n')

shared = json.loads((OUT / 'suplemento-boundaries-1.index.json').read_text())['common_reconciliation']
put('\nOs componentes históricos/populacionais de RE-BND-01 e RE-SUP-01 estão em `shared-reconciliation-1.md`, SHA256 `75aa4f74aba2ddcecd58c52fd329481dffabc60271a57bf0bfbe358d0b903992`, bytes [9742, 131191) de `suplemento-boundaries-1.md`. Esse bloco é compartilhado uma única vez; as duas razões corrigidas de suporte ficam isoladas em `shared-reconciliation-2.delta.md`. A resposta não pressupõe que o material ainda pendente já recebeu aceite. A coordenação controla o envio e a reavaliação pelo mesmo par.\n\n')
put('**Limite:** nenhuma remissão desta proposta concede aceite aos corpos de destino. Os estados do kit são históricos; versões externas continuam não selecionadas. L2–L4, consumo, publicação e runtime não foram executados nesta tarefa.\n')

(OUT / 'suplemento-union-1.md').write_bytes(data)
for entry in entries:
    raw = (OUT / entry['capture_path']).read_bytes()
    ex = raw[entry['source_start_byte']:entry['source_end_byte_exclusive']]
    assert sha(raw) == entry['sha256'] and blob(raw) == entry['git_blob_sha']
    assert sha(ex) == entry['excerpt_sha256'] and len(ex) == entry['excerpt_bytes']
    assert data[entry['output_excerpt_start_byte']:entry['output_excerpt_end_byte_exclusive']] == ex
assert ident('union-navigation-proposal.md') == candidate

index = {
    'supplement': ident('suplemento-union-1.md'), 'unchanged_candidate': candidate,
    'public_requests': [ident('revisions/union-supplement-1/inputs/'+x) for x in ['j1-response.md','j2-response.md']],
    'offsets': 'zero-based UTF-8 byte offsets; end exclusive',
    'literal_entries': entries, 'reused_received': reuse,
    'shared_reconciliation': shared,
    'shared_erratum': ident('shared-reconciliation-2.delta.md'),
    'request_resolution': {'J1/RE-UNI-01': ['UNI-OBLIGATIONS'], 'J2/RE-NAV-01': ['UNI-OBLIGATIONS'], 'J1/RE-UNI-02': [x['id'] for x in entries if x['id'].startswith('UNI-STATE')]},
    'semantic_status': 'PENDING_SAME_PAIR_REEVALUATION', 'product_execution': 'NOT_RUN',
}
dump('suplemento-union-1.index.json', index)

response = f'''# Resposta ao pedido de evidência da proposta

J1 RE-UNI-01/02 e J2 RE-NAV-01 foram lidos integralmente e respondidos em `suplemento-union-1.md`. O suplemento traz sete excertos literais: dependencies 10–54; cabeçalhos 1–12 das cinco missions; roster 1–10. Identifica commit, blob, SHA256 integral e do trecho, linhas e offsets para cada excerto.

As seis obrigações aparecem com supplier/consumer/subject; as cinco missions declaram `NOT_STARTED` e o roster declara `PREPARED_NOT_EXECUTED` no kit pinado. A leitura comprova atribuição histórica ao kit, sem consulta a progresso atual. Não identifica defeito novo nem modifica a proposta.

O corpo permanece com 14.671 bytes e SHA256 `{candidate['sha256']}`. O suplemento tem {len(data)} bytes, SHA256 `{sha(data)}`. R078–R082 são reutilizados por offsets e hashes; pendências históricas/populacionais remetem à reconciliação compartilhada já preparada, com o erratum de duas razões em arquivo separado.

Os arquivos fonte integrais continuam inputs reais, capturados em `captures.json`. A3/A4/projection e os demais inputs históricos compartilhados continuam representados por suas identidades integrais em `effective-inputs.json`, sem substituir inputs grandes por recortes. Proposta sem chave nativa ou versão aceita atribuída; corpo e receita geral v1 preservados. Verificação de hashes/offsets concluída. Produto/testes/providers/Atlas/remote: NOT_RUN. Aceite semântico e envio aos juízes pertencem à coordenação e ao mesmo par.
'''
(REV / 'response.md').write_text(response)
recipe = {
    'kind': 'preparatory_navigation_evidence_supplement_recipe', 'revision': 1,
    'producer': '/root/boundaries_l1', 'execution_id': '34269cf4-d631-41c5-a30b-85b0ec217390',
    'native_artifact_key': None, 'native_version': None, 'native_binding': None,
    'proposal_unchanged': candidate, 'base_recipe': ident('recipe.json'),
    'request': ident('revisions/union-supplement-1/request.txt'),
    'public_requests': index['public_requests'], 'kit_revision': kit_rev,
    'source_inputs': [caps[x['path']] for x in entries],
    'actual_full_inputs_manifest': ident('effective-inputs.json'),
    'evidence': ident('suplemento-union-1.md'), 'evidence_index': ident('suplemento-union-1.index.json'),
    'response': ident('revisions/union-supplement-1/response.md'),
    'assembly_record': ident('records/assemble_union_supplement_1.py'),
    'body_changes': False, 'new_runtime_claims': False,
    'semantic_status': 'PENDING_SAME_PAIR_REEVALUATION', 'product_execution': 'NOT_RUN', 'usage': 'UNKNOWN',
}
dump('revisions/union-supplement-1/recipe.json', recipe)
receipt = {
    'kind': 'producer_supplement_preparation_receipt', 'proposal_unchanged': candidate,
    'producer': '/root/boundaries_l1', 'prepared_for': ['original J1', 'original J2'],
    'delivery_status': 'PREPARED_FOR_COORDINATOR_TRANSPORT', 'no_claim_of_judge_receipt': True,
    'public_requests': index['public_requests'], 'request': recipe['request'],
    'supplement': recipe['evidence'], 'index': recipe['evidence_index'],
    'recipe': ident('revisions/union-supplement-1/recipe.json'), 'response': recipe['response'],
    'literal_entries': len(entries), 'received_reused': len(reuse),
    'all_source_hashes_and_literal_offsets_verified': True,
    'body_changes': False, 'semantic_status': 'PENDING_SAME_PAIR_REEVALUATION', 'product_execution': 'NOT_RUN',
}
dump('suplemento-union-1.receipt.json', receipt)
print(json.dumps({k: ident(k) for k in ['suplemento-union-1.md','suplemento-union-1.index.json','suplemento-union-1.receipt.json','revisions/union-supplement-1/recipe.json','revisions/union-supplement-1/response.md']}, ensure_ascii=False))
