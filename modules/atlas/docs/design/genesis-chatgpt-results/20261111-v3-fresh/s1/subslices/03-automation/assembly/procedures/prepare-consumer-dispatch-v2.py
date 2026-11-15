"""Version 2: include the explicit L4 research direct-read supplement.

Freeze one public, fresh-context consumer request after the actual full prepare.

This script reads no reserved oracle and creates no native agent or model response.
"""
from pathlib import Path
import datetime
import hashlib
import json
import sys

W = Path(__file__).resolve().parents[1]
P = W / 'payload'
case_id = sys.argv[1]
public_path = P / 'consumers/public-cases.json'
plan_path = P / 'artifact-plan.json'
protocol_path = P / 'consumers/public-bridge-protocol.md'
public = json.loads(public_path.read_text())
plan = json.loads(plan_path.read_text())
case = next(row for row in public['cases'] if row['id'] == case_id)
supplement_path = P / 'consumers/direct-read-supplement-v1.json'
supplement = json.loads(supplement_path.read_text())
assert supplement['original_artifact_plan']['sha256'] == hashlib.sha256(plan_path.read_bytes()).hexdigest()
assert supplement['public_cases']['sha256'] == hashlib.sha256(public_path.read_bytes()).hexdigest()
assert supplement['build_graph_unchanged'] and supplement['public_cases']['questions_and_quotas_unchanged']
keys = list(dict.fromkeys(plan['direct_use_case_plan'][case_id] + supplement['additional_required_direct_keys'].get(case_id, [])))
assert set(keys) <= {row['key'] for row in plan['artifacts']}
preparation = json.loads((P / 'receipts/native-prepare-final.json').read_text())
assert preparation['artifact_count'] == 12
assert preparation['source_root'] == str(W / 'native-source')
protocol = protocol_path.read_text()
request = (
    f'Você é um consumidor nativo independente do caso {case_id} da missão S1-03, execução 34269cf4-d631-41c5-a30b-85b0ec217390. '
    'Seu contexto é novo, fork_turns none, sem produção, fontes brutas, oracle reservado, julgamentos ou respostas de outros consumidores. '
    'Não use ferramentas, filesystem ou rede. Não delegue. A principal executará somente suas consultas Atlas por ponte fiel. '
    'A separação é por contexto e instruções, sem alegação de sandbox técnico.\n\n'
    f'Pergunta pública congelada: {case["question"]}\n\n'
    'Chaves previstas para consulta direta neste caso, conforme o plano público e o suplemento de uso direto congelado antes dos consumidores: '
    + ', '.join(keys) + '. As chaves não são evidência de conteúdo disponível.\n\n'
    + protocol
    + '\n\nPara pedir uma consulta, termine sua resposta visível com exatamente o JSON de uma operação, sem executar ferramenta. '
      'A principal responderá com o envelope literal da CLI; então escolha a próxima consulta necessária. '
      'Quando concluir as consultas previstas dentro da quota, entregue uma resposta final em português com base apenas no conteúdo efetivamente recebido, '
      'indicando limites e consultas. Não antecipe o resultado operacional nem resolva a pergunta com memória geral do produto. '
      'Comece agora pelo pedido index pertinente.\n'
)
directory = P / 'consumers' / case_id
directory.mkdir(parents=True, exist_ok=True)
request_path = directory / 'request.txt'
assert not request_path.exists(), 'Do not overwrite or redispatch a preserved fresh consumer request.'
request_path.write_text(request)
def identity(path):
    raw = path.read_bytes()
    return {'path': str(path.relative_to(P)), 'bytes': len(raw), 'sha256': hashlib.sha256(raw).hexdigest()}
record = {'schema': 's1-03-public-consumer-request-freeze/v2', 'case_id': case_id,
          'at_utc': datetime.datetime.now(datetime.timezone.utc).isoformat(),
          'state': 'PREPARED_NOT_DISPATCHED', 'request': identity(request_path),
          'public_controls': [identity(path) for path in [public_path, plan_path, protocol_path, supplement_path]],
          'required_direct_keys': keys, 'reserved_oracle_read_by_this_script': False,
          'actual_prepare_receipt': identity(P / 'receipts/native-prepare-final.json'),
          'required_fork_turns': 'none', 'native_consumer_created': False}
(directory / 'request-freeze.json').write_text(json.dumps(record, ensure_ascii=False, indent=2) + '\n')
print(json.dumps(record, ensure_ascii=False))
