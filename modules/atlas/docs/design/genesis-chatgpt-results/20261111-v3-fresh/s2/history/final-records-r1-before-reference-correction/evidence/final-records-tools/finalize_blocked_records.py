#!/usr/bin/env python3
"""Faithfully record existing decisions; issue no semantic or runtime approval."""
import argparse
import collections
import datetime
import hashlib
import json
from pathlib import Path
import shutil

ROOT = Path('/workspace/scratch/7b5d6430f420/genesis-s2')
D = ROOT / 'deliverable'
PREFIX = 'modules/atlas/docs/design/genesis-chatgpt-results/20261111-v3-fresh/s2/'
EXECUTION = '46d09d97-39a9-482a-a290-646ba1d94c99'
BASE = '1cde2ff7a71bcf7aecb5d030917b577165135d38'
PROTOCOL = 'ee2521a5b966bd505cc95bd1c733e09e12f33531'
PACKAGE = '9356cefcb4a1db413e67869a855fd082536476fb18ff7784dde39f051e9b407b'
PACKET = '069416fb6b9d6fe2b0d2c12664f9283a09dddd761d08392f1026b5ca948b8410'


def now():
    return datetime.datetime.now(datetime.timezone.utc).isoformat()


def pin(p):
    p = Path(p)
    b = p.read_bytes()
    try:
        path = p.relative_to(D).as_posix()
    except ValueError:
        path = str(p)
    return {'path': path, 'byte_length': len(b), 'sha256': hashlib.sha256(b).hexdigest()}


def read(p):
    return json.loads(Path(p).read_text())


def save(path, value):
    path.parent.mkdir(parents=True, exist_ok=True)
    raw = (json.dumps(value, ensure_ascii=False, indent=2) + '\n').encode()
    with path.open('xb') as f:
        f.write(raw)
    assert path.read_bytes() == raw
    return pin(path)


def append(event, **data):
    row = {'event': event, 'recorded_at': now(), **data}
    with (D / 'execution-ledger.jsonl').open('a') as f:
        f.write(json.dumps(row, ensure_ascii=False) + '\n')


def link(ref):
    p = Path(ref['path'])
    p = p if p.is_absolute() else D / p
    return f"[{p.name}](sandbox:{p}) (SHA-256 `{ref['sha256']}`)"


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--u1-receipt', type=Path, required=True)
    ap.add_argument('--usage-receipt', type=Path, required=True)
    args = ap.parse_args()
    draft_path = D / 'judgments/final-closure-r1/reviewed-draft/final-obligations.json'
    draft = read(draft_path)
    assert pin(D / 'native-package.json')['sha256'] == PACKAGE
    ids = [c['id'] for c in draft['criteria']]
    assert len(ids) == len(set(ids)) == 50
    decisions = {}
    groups = {}
    for name in ('j1', 'j2'):
        p = D / f'judgments/final-closure-r1/{name}.json'
        o = read(p)
        assert o['packet_sha256'] == PACKET and o['transport']['status'] == 'COMPLETE'
        assert o['source_revision'] == BASE and o['protocol_revision'] == PROTOCOL
        seen = [i for g in o['criterion_groups'] for i in g['ids']]
        assert len(seen) == len(set(seen)) == 50 and set(seen) == set(ids)
        decisions[name] = {'response': pin(p), 'reviewer': o['reviewer'],
                           'transport': o['transport'], 'closure_assessment': o['closure_assessment'],
                           'criterion_groups': o['criterion_groups']}
        groups[name] = {i: (n, g) for n, g in enumerate(o['criterion_groups']) for i in g['ids']}
    criteria = []
    for old in draft['criteria']:
        i = old['id']
        by_judge = {n: {'status': groups[n][i][1]['local_status'],
                       'group_pointer': f'/criterion_groups/{groups[n][i][0]}',
                       'response': decisions[n]['response']} for n in ('j1', 'j2')}
        agreed = all(x['status'] == 'PASS' for x in by_judge.values())
        criteria.append({'id': i, 'normative_line': old['normative_line'],
                         'normative_source_line': old['source_line'],
                         'local_obligation': old['local_obligation'],
                         'local_status': 'PASS' if agreed else 'HOLD',
                         'status_scope': 'RECORDED_INTERSECTION_OF_ACTUAL_SCOPED_CLOSURE_DECISIONS',
                         'judge_decisions': by_judge,
                         'scope_difference': i in ('GO-A7', 'QS-3'),
                         'scope_note': ('J2 accepts existing-mechanism design; J1 retains runtime-integration HOLD. Both original scopes remain; no synthetic agreement.' if i in ('GO-A7', 'QS-3') else 'Exact satisfied and outstanding portions are retained in both original criterion groups.'),
                         'related_gate_refs': old['open_gate_refs'],
                         'global_complement': old['global_complement']})
    counts = dict(collections.Counter(c['local_status'] for c in criteria))
    assert counts == {'HOLD': 41, 'PASS': 9}
    matrix = {'schema': 'genesis-s2-final-criterion-matrix/v1', 'recorded_at': now(),
              'execution_id': EXECUTION, 'source_revision': BASE, 'protocol_revision': PROTOCOL,
              'native_package_sha256': PACKAGE, 'reviewed_packet_sha256': PACKET,
              'normative_registry': draft['normative_registry'], 'normative_source': draft['normative_source'],
              'preserved_reviewed_draft': pin(draft_path), 'judges': decisions,
              'criteria': criteria, 'criterion_counts': counts,
              'limits': ['No new criterion decision is issued by this recorder.',
                         'PASS is limited to each original reviewed local portion; it does not establish runtime, publication or whole-delivery acceptance.',
                         'The 41 HOLD records remain open despite completion of current local bookkeeping. Exact resolved bookkeeping is recorded separately; unavailable operational proof is not manufactured.']}
    matrix_ref = save(D / 'evidence/final-criterion-matrix.json', matrix)
    confirmation = {'schema': 'genesis-s2-final-closure-response-preservation/v1',
                    'recorded_at': now(), 'packet_sha256': PACKET,
                    'responses': {n: decisions[n]['response'] for n in decisions},
                    'both_transports': 'COMPLETE', 'criteria_per_judge': 50,
                    'criterion_ids_exact_once': True,
                    'j2_part2': 'Complete recipient confirmation supersedes uncertainty about sender return only.',
                    'j2_part5': 'Full replacement confirmed complete; original invalidated send remains preserved.',
                    'transport_limits': 'File hashes and visible envelope capture do not attest hidden host serialization or provider attempts.',
                    'matrix': matrix_ref}
    confirmation_ref = save(D / 'evidence/final-closure-response-preservation.json', confirmation)
    u1_ref, usage_ref = pin(args.u1_receipt), pin(args.usage_receipt)
    remote_ref = pin(D / 'evidence/final-return-remote-recheck/readback-receipt.json')
    remote = read(D / remote_ref['path'])
    native_ref = pin(D / 'evidence/native-final-prepare/prepare-execution-receipt.json')
    diagnosis_ref = pin(D / 'evidence/native-final-input-cap-diagnosis.json')
    gates = [
        {'id':'G-LAYERS','state':'PASS_CONTENT_ONLY','applicability':'All thirteen assigned artifacts.','existing_evidence':['accepted/l1.json','accepted/l2.json','accepted/l3.json','accepted/l4.json','evidence/final-semantic-reconciliation.json'],'remaining':'None for exact accepted bodies. Operational obligations below remain separate.','blocked_by':[]},
        {'id':'G-RUNTIME','state':'FAIL','applicability':'Complete exact S2 native package and mandatory inputs.','existing_evidence':[native_ref['path'],diagnosis_ref['path'],remote_ref['path']],'remaining':'Authorized pinned compatible S4 implementation with relevant proof; new isolated exact-package prepare. Preserve mandatory complete inputs, failed attempt and partial CAS. Establish current input/membership observation without fabricated Git HEAD.','blocked_by':['B-RUNTIME']},
        {'id':'G-BINDING','state':'NOT_RUN','applicability':'Exact native candidate, independent binding decisions and governed Atlas reader publication.','existing_evidence':[native_ref['path']],'remaining':'Actual candidate_id/binding_id, both exact same-pair runtime binding decisions and authorized publication receipts. No candidate exists from the failed prepare.','blocked_by':['B-RUNTIME']},
        {'id':'G-CONSUMERS','state':'NOT_RUN','applicability':'All fourteen frozen S2-C and S2-I consumer cases.','existing_evidence':['requests/consumer-question-deck.json','oracles/ownership-v1.json','oracles/layers-addendum.json'],'remaining':'Fresh Atlas-only contexts, actual index/read traces, exact versions, bounded reads and independent evaluation; preserve consumer isolation from source/oracles.','blocked_by':['B-RUNTIME','G-BINDING']},
        {'id':'G-UPDATE','state':'NOT_RUN_EXPECTATION_VALIDATED_ONLY','applicability':'S2-U1 and compatible local-use maintenance controls.','existing_evidence':['oracles/update-final-graph-expectation.json',u1_ref['path'],'judgments/final-closure-r1/j1.json','judgments/final-closure-r1/j2.json'],'remaining':'Actual mutation, invalidation, restoration, reuse and proposer-call comparison. Bind existing frozen intent and explicitly missing concrete mutation/observable definitions before execution. Validate expected potential closure without assuming nine interpretation calls. Bind common controls for add/remove, intent/recipe, missing input/edge, authority/validity/gap, receipt refresh and unchanged-result stopping.','blocked_by':['B-RUNTIME','G-BINDING']},
        {'id':'G-RECOVERY','state':'HOLD','applicability':'S2 coherence, stale-current refusal, rollback, durable resume and independent valid scope.','existing_evidence':['evidence/final-closure-support/s4-observations-full.json','evidence/s4-discovery-r3/support/ci-summary.json'],'remaining':'Relevant compatible common-control bindings and S2 local-use proof on an actual exact candidate. S4 sample is not S2 execution.','blocked_by':['B-RUNTIME','G-BINDING']},
        {'id':'G-CI','state':'HOLD','applicability':'Required S2 final-payload remote gates; exact implementation compatibility.','existing_evidence':['evidence/ci-final-readbacks/run-43065851373.json','evidence/ci-final-readbacks/run-43077975153.json','evidence/guards-remote-plan.json','verification/guards.test.ts'],'remaining':'Actual authorized S2 payload and applicable GitHub Actions results. S4 run43065851373 failed at e3a; run43077975153 passed at7102. Neither is S2 final-payload CI. Do not transfer the different candidate verdict.','blocked_by':['B-RUNTIME','B-PUBLICATION']},
        {'id':'G-PROVENANCE','state':'LOCAL_RECORDS_RECONCILED_WITH_DECLARED_LIMITS','applicability':'Current observable requests/responses, transport corrections, source/body provenance and accounting.','existing_evidence':[usage_ref['path'],confirmation_ref['path'],'evidence/original-preservation-final.json','execution-ledger.jsonl'],'remaining':'Retain missing original activation envelopes, nonexhaustive source/support/provider totals, UNKNOWN telemetry and historical GLOBAL_UNRECONCILED. Applicable shared route/reservation/adapter guarantee remains unevidenced; current scoped bookkeeping is complete through the named receipts.','blocked_by':['B-SHARED-ACCOUNTING-GUARANTEE']},
        {'id':'G-PUBLICATION','state':'BLOCKED_AUTOMATIC_APPROVAL','applicability':'Public GitHub payload P, separate handoff seal H, leased branch update and exact readback.','existing_evidence':['evidence/archive-publication-rejection.json','evidence/remote-publication-rejection.json','evidence/final-repository-metadata.json'],'remaining':'Explicit informed authorization for the complete concrete public-disclosure package, or an authorized safer destination. Then fresh HEAD B, P descendant of B, H descendant of P, expected_sha=B/force:false, exact readback. No retry before authorization.','blocked_by':['B-PUBLICATION']},
        {'id':'G-CLOSURE','state':'INCOMPLETE_BLOCKED','applicability':'All eight local completion requirements in pinned completion.md.','existing_evidence':[matrix_ref['path'],confirmation_ref['path'],'work.md','handoff.json'],'remaining':'Operational gates above remain open. Local blocked records are prepared; the same pair may assess only the completed record corrections. Full DELIVERY_COMPLETE remains false.','blocked_by':['B-RUNTIME','B-PUBLICATION','B-SHARED-ACCOUNTING-GUARANTEE']},
    ]
    gate_ref = save(D / 'evidence/final-local-gates.json', {'schema':'genesis-s2-final-local-gates/v1','recorded_at':now(),'gates':gates,'limits':'No open item becomes N/A because the runtime or permission is absent.'})
    disclosure = '''# Genesis S2 — autorização para divulgação pública

O destino proposto é o repositório público `gustavomhss/hugr-orchestra`, branch `genesis-fresh-s2`, sob `modules/atlas/docs/design/genesis-chatgpt-results/20261111-v3-fresh/s2/`.

O pedido abrange o pacote completo de revisão que acompanha este arquivo, com todos os membros enumerados e hasheados no manifesto externo `genesis-s2-review-manifest.json`. O ZIP preserva a árvore inteira de `deliverable/`, sem exclusões. Esse manifesto e o recibo de exportação são externos para evitar autorreferência de hashes. Uma aprovação só se aplica aos bytes efetivamente apresentados; alteração material exige nova revisão do escopo.

## Conteúdo que se tornaria público

- Os 13 artefatos L1–L4, suas fontes/dependências e o índice native-package.json.
- Inventários dos 4.506 paths, árvores congeladas, trechos e cópias completas de fontes, respostas de captura e arquivos ZIP de preservação.
- Pedidos, respostas e decisões originais de autores e juízes, casos/oracles reservados à avaliação, correções, reprovações históricas e envelopes de transporte disponíveis.
- execution-ledger.jsonl, work.md, matriz de critérios, handoff.json, IDs de execução/agentes, caminhos locais do workspace, commits e estados de branches, limites de uso conhecidos e desconhecidos.
- Código e ferramentas de preparação preservados, recibos de CI, stdout/stderr, estado parcial CAS, arquivos da tentativa que falhou e diagnósticos de compatibilidade.
- As duas rejeições anteriores de publicação e a evidência posterior de que o repositório continua público.

Não há alegação de sanitização integral nem de auditoria de segredos. A revisão automática rejeitou a divulgação externa desses registros porque o pedido de retomar a sessão não autorizava explicitamente a exposição desses dados. A recusa permanece válida; este documento apenas torna o escopo concreto para decisão do usuário.

## Pergunta de autorização

Você autoriza publicar esse pacote completo, incluindo fontes, capturas e registros operacionais internos acima, nesse repositório público e nessa branch?

Essa autorização é independente da correção de runtime S4 ainda necessária. Ela não aprova merge, force push, ativação de produção ou alterações fora de S2. A publicação deverá preservar o estado INCOMPLETE_BLOCKED enquanto os gates operacionais permanecerem abertos, usar os commits separados de payload e handoff, atualização com expected_sha/force:false e releitura exata.
'''
    p = D / 'publication-approval-brief.md'
    with p.open('x') as f:
        f.write(disclosure)
    disclosure_ref = pin(p)
    append('FINAL_CLOSURE_ACTUAL_RESPONSES_RECONCILED', responses=confirmation['responses'], matrix=matrix_ref,
           recipient_completeness='COMPLETE_BOTH', closure_response_documents=2,
           semantic_artifact_response_documents_unchanged=18, new_semantic_artifact_verdicts=0,
           tokens='UNKNOWN', billing='UNKNOWN', physical_provider_attempts='UNKNOWN')
    append('S2_U1_EXPECTATION_AND_EXISTING_SPECIFICATION_BOUND', receipt=u1_ref,
           expectation_status='PASS_DECLARED_GRAPH_EXPECTATION_ONLY_BOTH_JUDGES', actual_execution='NOT_RUN', oracle_rewritten=False)
    append('FINAL_OBSERVABLE_USAGE_DELTA_PRESERVED', receipt=usage_ref,
           counts_scope='Bounded indexed logical operations; current support coordination separately recorded; not total provider usage.',
           tokens='UNKNOWN', billing='UNKNOWN', physical_provider_attempts='UNKNOWN', historical_accounting='GLOBAL_UNRECONCILED')
    append('FINAL_LOCAL_RECORDS_PREPARED', gates=gate_ref, disclosure_brief=disclosure_ref,
           canonical_work='work.md', local_handoff='handoff.json', completion_state='INCOMPLETE_BLOCKED',
           artifact_revision=None, local_record_correction_check='PENDING_SAME_PAIR_BOUNDED_CHECK',
           export='To be performed with unchanged full deliverable tree; external manifest and receipt prevent self-hash cycles.', remote_writes=0)
    ledger_ref = pin(D / 'execution-ledger.jsonl')
    ledger_rows = len((D / 'execution-ledger.jsonl').read_text().splitlines())
    content = ['# Genesis S2 — retomada consolidada', '',
      '**Estado: INCOMPLETE_BLOCKED.** Os 13 artefatos exigidos foram produzidos, corrigidos e aceitos semanticamente pelos dois juízes persistentes. A preparação nativa completa foi executada uma vez e falhou. Não existe candidato/binding S2 aceito, commit de payload, publicação selada ou entrega operacional completa.', '',
      f'Execução `{EXECUTION}`; campanha `20261111-v1`; protocolo `parallel-v3-fresh`; resultados `20261111-v3-fresh`; branch `genesis-fresh-s2`. Fonte `{BASE}`; protocolo `{PROTOCOL}`. Registro consolidado em {now()}.', '',
      '## Identidades e estado real', '',
      f'- Pacote exato: {link(pin(D / "native-package.json"))}; 332.594 bytes e 13 chaves suportadas. O campo histórico `SEMANTIC_ACCEPTED_RUNTIME_PENDING` permanece byte a byte; a falha real está registrada aqui e no recibo da operação.',
      '- Implementação realmente executada: `e3a8ab8cf56dbff1ee91272df51ffa398d882aa1`. `candidate_id=null`, `binding_id=null`, `artifact_revision=null`; nenhum SHA de commit foi inventado.',
      f'- HEAD S2 observado: `{remote["own_branch_head"]}`. HEAD S4 de descoberta: `{remote["s4_discovery"]["commit"]}`; release `20261111-v3-fresh-s4-r3`, bytes inalterados. {link(remote_ref)}.',
      '- O handoff local descreve um checkpoint bloqueado. A selagem Git com payload P e handoff H ainda não ocorreu.', '',
      '## População, evidência e preservação', '',
      '| Unidade | Paths | Famílias |', '| --- | ---: | ---: |', '| desktop-web | 532 | 30 |', '| app-session | 1.887 | 59 |', '| design-tui | 2.087 | 67 |', '| Total | 4.506 | 156 |', '',
      'Profundidades preservadas: 565 paths inspecionados, 3.893 sustentados por famílias e 48 somente por metadados. O hash do conjunto ordenado de paths é `8b70f96dcbb623bdd1cc2a48b61d51d255d9d9ce90836efc9a5cd05f1fc5a582`. Isso não afirma leitura integral de cada path.', '',
      'Os 646 registros de captura correspondem a 641 arquivos únicos. L2–L4 reutilizam as fontes capturadas; não houve nova mineração atribuída a essas camadas. Os 1.231 arquivos do snapshot inicial continuam recuperáveis com seus bytes originais, incluindo a versão inicial explicitamente preservada do recibo tardio. As falhas, tentativas invalidadas, correções, resposta tardia e estado parcial CAS permanecem no pacote.', '',
      f'Evidência: {link(draft["coverage"]["receipt"])}; {link(pin(D / "evidence/original-preservation-final.json"))}.', '',
      '## Artefatos aceitos', '', '| Chave | Bytes | SHA-256 do corpo |', '| --- | ---: | --- |']
    for a in draft['semantic_acceptance']:
        b = a['body']
        assert pin(Path(b['path']))['sha256'] == b['sha256']
        content.append(f'| {a["key"]} | {b["byte_length"]} | `{b["sha256"]}` |')
    content += ['', 'As quatro manifestações `accepted/l1.json` a `accepted/l4.json` vinculam cada corpo e ambos os pareceres reais. Uma camada só foi liberada depois do aceite integral da camada anterior. As revisões L1, a correção de i18n em L3 design-tui e o encaminhamento de retomada/crash para S1 no entry L4 preservam seus originais e reavaliações. Não resta correção obrigatória de conteúdo nesses 13 corpos.', '',
      '## Preparação nativa realmente executada', '',
      'Em 2026-11-11, de 20:48:51.158507 a 20:48:52.041873 UTC, o comando nativo prepare terminou com exit code 1. stdout ficou vazio; stderr foi:', '',
      '```text', 'native-input-unavailable: file:modules/atlas/docs/design/genesis-chatgpt-results/20261111-v3-fresh/s2/inputs/app-session-tree.json', '```', '',
      'O observador de inputs tem limite de 256.000 bytes, separado do limite de 8 MiB do leitor geral de documentos. O primeiro arquivo rejeitado possui 369.462 bytes. A árvore design-tui (390.775 bytes) e schema/tui.json (1.131.057 bytes) também excedem o limite; estes dois casos são incompatibilidades estáticas, não duas execuções adicionais.', '',
      'A operação deixou 13 arquivos parciais de CAS, preservados sem tratá-los como conhecimento aceito. Não houve retry, truncamento de entrada, omissão de fonte ou alteração fora do escopo S2. A falha anterior de movimentação do staging ocorreu antes de qualquer operação nativa; o payload temporário de 888 arquivos foi preservado e a cópia final foi verificada.', '',
      f'Recibo real: {link(native_ref)}. Diagnóstico: {link(diagnosis_ref)}. Proposta ao proprietário do runtime: [runtime-compatibility-after-native-failure.md](sandbox:{D / "requests/runtime-compatibility-after-native-failure.md"}).', '',
      '## Consumo, manutenção e CI', '',
      'Todos os 14 casos S2-C1–C5 e S2-I1D/I1A/I1U/I2D/I2A/I2U/I3D/I3A/I3U permanecem NOT_RUN. Eles exigem consumidores novos com index/read reais do Atlas, sem fontes nem oracles. Limites: rotina até 2 index + 2 read e 16.000 bytes de corpo; profundo até 6 index + 5 read e 64.000 bytes. A fronteira instrucional será registrada como tal, sem alegar sandbox técnico inexistente.', '',
      'Ambos os juízes validaram somente o conjunto esperado declarado de S2-U1: mudança em owned-serve.ts, dois consumidores diretos, nove artefatos potencialmente afetados e quatro fora do conjunto. São 32 relações build e 30 de navegação; navegação não propaga invalidação. Nove alcançáveis não implica nove novas interpretações: resultado válido e inalterado pode interromper propagação. Mutação, update, restauração, reuse e comparação de chamadas continuam NOT_RUN.', '',
      f'A vinculação do caso original e suas ausências concretas está em {link(u1_ref)}; o oracle congelado não foi reescrito.', '',
      '| Evidência de CI | Revisão | Conclusão observada | Limite |', '| --- | --- | --- | --- |',
      '| S4 run 43065851373 | e3a8ab8c… | failure | Alguns passos passaram; o resultado agregado falhou. |',
      '| S4 run 43077975153 | 7102f2e3… | success | 220 testes e 22 probes no candidato indicado. |',
      '| CI do payload final S2 | ausente | NOT_RUN | Depende da publicação autorizada e do candidato exato. |', '',
      'Há diferenças entre os candidatos: duas fontes de adapter e três bundles gerados conferidos diretamente; equivalência estática de três expressões não transforma um candidato no outro. A correspondência de 18 arquivos declarada no recibo S4 não foi toda recalculada localmente. Nenhuma dessas execuções substitui os consumidores ou gates do pacote S2. Testes de produto seguem exclusivamente a rota GitHub Actions; verificações mecânicas de arquivos não são testes de produto.', '',
      '## Juízos finais e matriz dos 50 critérios', '',
      f'Os dois pareceres cobrem os 50 IDs exatamente uma vez e confirmam o pacote completo de seis partes, SHA-256 `{PACKET}`. Ambos mantêm todos os 13 aceites de conteúdo. J2 confirmou a parte 2 de retorno incerto e a substituição integral válida da parte 5. Os originais invalidados e a incerteza do retorno continuam preservados.', '',
      f'Matriz completa com linhas normativas, obrigações locais, apontadores exatos dos grupos e complementos globais: {link(matrix_ref)}. Decisões: {link(decisions["j1"]["response"])}; {link(decisions["j2"]["response"])}.', '',
      'A interseção conservadora contém 9 PASS locais e 41 HOLD. GO-A7 e QS-3 preservam a diferença de escopo: J2 aprovou o desenho usando mecanismos existentes; J1 manteve HOLD de integração runtime. Nenhuma opinião substitui a outra. Os registros abaixo não convertem aceites de conteúdo em provas operacionais.', '',
      '| ID | Estado local | J1 / J2 | Obrigação local | Complemento global — ROOT |', '| --- | --- | --- | --- | --- |']
    for c in criteria:
        vals = ' / '.join(c['judge_decisions'][n]['status'] for n in ('j1','j2'))
        content.append(f'| {c["id"]} | {c["local_status"]} | {vals} | {c["local_obligation"]} | {c["global_complement"]["proof"]} |')
    content += ['', '## Fila completa e condições de desbloqueio', '', '| Gate | Estado | Aplicabilidade e prova restante |', '| --- | --- | --- |']
    for g in gates:
        content.append(f'| {g["id"]} | {g["state"]} | {g["applicability"]} {g["remaining"]} |')
    content += ['', f'Cada gate conserva suas evidências e dependências em {link(gate_ref)}. Nenhum item foi marcado N/A por indisponibilidade de ferramenta ou autorização.', '',
      '## Uso observável e limites', '',
      f'O ledger tem {ledger_rows} registros nesta consolidação; o snapshot imutável anterior de 79 registros continua preservado. {link(usage_ref)} relaciona os recibos posteriores e seus limites. O índice anterior de 113 envios literais aos juízes passa a 126 com os 13 do fechamento; são 6 envios invalidados, 6 substituições integrais e 4 marcas de retorno incerto, que se sobrepõem às chamadas e não são chamadas extras. As 18 respostas de revisão de artefatos e seus 34 veredictos históricos permanecem separadas das duas respostas de fechamento.', '',
      'Os 68 relays observados da sessão original são uma categoria separada. As leituras GitHub posteriores, ativações de suporte e coordenação atuais são contabilizadas no recibo por escopo; isso não é uma contagem exaustiva de todas as ferramentas nem de chamadas físicas do provedor. Envelopes originais de algumas ativações não foram encontrados; as respostas reais estão preservadas. Não se inventou o que falta, não se repetiu mineração para fabricar custos e não se converteram bytes em tokens.', '',
      '**Tokens, cobrança e tentativas físicas do provedor: UNKNOWN. Histórico da campanha: GLOBAL_UNRECONCILED, proprietário ROOT.** A garantia compartilhada de reservas/rota/adapter não foi fornecida; permanece lacuna explícita, sem transferir para ROOT obrigações operacionais próprias de S2.', '',
      '## Publicação e retomada', '',
      'A revisão automática de aprovação rejeitou duas escritas: primeiro arquivos ZIP de evidências/fontes/capturas e depois uma proposta mais estreita de registros internos. O motivo foi divulgação externa sem autorização explícita desses dados. O repositório é público; permissão técnica de push não revoga as recusas. Nenhum payload final foi enviado, nenhum PR/merge foi criado e nenhuma ativação de produção ocorreu.', '',
      f'O escopo completo a aprovar está em {link(disclosure_ref)}. O manifesto externo do ZIP final enumera cada arquivo e hash sem exclusões. O consentimento para divulgar o pacote não corrige o limite do runtime.', '',
      'Retomada executável após desbloqueio: obter e fixar release S4 compatível com entradas completas; preservar a tentativa falha e usar nova área isolada; preparar o pacote exato; obter bindings reais do mesmo par; executar os 14 consumidores e S2-U1 com os controles pertinentes; obter gates S2 no candidato correto; depois publicar P e selar H com lease e releitura quando houver autorização. Não reutilizar CAS parcial como aceito, não falsificar HEAD e não modificar o oracle congelado.', '',
      'O encerramento local permanece INCOMPLETE_BLOCKED. Integração da união, aceite do proprietário, landing e ativação são responsabilidades globais de ROOT em estados separados; sua ausência não foi usada para inventar pré-requisitos locais. O handoff local preserva identidades e pendências reais. Esta consolidação será complementada somente pelos recibos reais de conferência dos registros e exportação; não há promessa de execução em background.', '']
    old_work = D / 'work.md'
    old_bytes = old_work.read_bytes()
    backup = D / 'history/work-before-final-record-reconciliation.md'
    with backup.open('xb') as f:
        f.write(old_bytes)
    old_work.write_text('\n'.join(content))
    work_ref = pin(old_work)
    handoff = {'schema':'genesis-s2-blocked-handoff/v1','recorded_at':now(),
      'campaign':'20261111-v1','protocol_epoch':'parallel-v3-fresh','results_epoch':'20261111-v3-fresh',
      'session':'s2','execution_id':EXECUTION,'repository':'gustavomhss/hugr-orchestra','branch':'genesis-fresh-s2',
      'source_revision':BASE,'protocol_revision':PROTOCOL,'candidate_revision':'e3a8ab8cf56dbff1ee91272df51ffa398d882aa1',
      'artifact_revision':None,'observed_branch_head':remote['own_branch_head'],
      'native_package_sha256':PACKAGE,'package':{'path':PREFIX+'native-package.json','sha256':PACKAGE,'byte_length':332594},
      'work':PREFIX+'work.md','work_identity':work_ref,'ledger':PREFIX+'execution-ledger.jsonl','ledger_identity':ledger_ref,
      'judgments':[decisions[n]['response'] for n in ('j1','j2')], 'accepted_layers':[pin(D/f'accepted/l{i}.json') for i in range(1,5)],
      'criterion_matrix':matrix_ref,'local_gate_matrix':gate_ref,'completion_state':'INCOMPLETE_BLOCKED','delivery_complete':False,
      'semantic_content':{'artifacts':13,'both_judges':'PASS','scope':'Exact content only'},
      'runtime':{'state':'PREPARE_FAILED','receipt':native_ref,'candidate_id':None,'binding_id':None,'attempt_count':1,'partial_cas_files':13,'partial_cas_accepted':False},
      'consumers':draft['consumer_cases'],'update':{'case':'S2-U1','state':'NOT_RUN','expectation':'PASS_DECLARED_GRAPH_EXPECTATION_ONLY_BOTH_JUDGES','frozen_specification_binding':u1_ref},
      'local_obligations_open':[g for g in gates if g['id']!='G-LAYERS'],
      'independent_record_work':{'status':'PREPARED_FOR_BOUNDED_RECORD_CORRECTION_CHECK','same_pair_review_findings':['J1-CLOSURE-04','CLOSURE-J2-F3'],
        'completed':['Actual closure responses and exact fifty-ID matrix preserved','Post-snapshot bounded usage and unknowns reconciled','Existing S2-U1 specification and missing details explicitly bound','Concrete public-disclosure scope prepared','Canonical work and local blocked handoff created'],
        'remaining_local_delivery_mechanics':['Record any actual final record-correction responses without reopening accepted content','Export and verify the unchanged complete tree; retain external manifest and receipt']},
      'accounting':{'current_bounded_delta':usage_ref,'tokens':'UNKNOWN','billing':'UNKNOWN','physical_provider_attempts':'UNKNOWN','historical':'GLOBAL_UNRECONCILED','historical_owner':'ROOT'},
      'publication':{'state':'BLOCKED_AUTOMATIC_APPROVAL','authorized':False,'artifact_commit':None,'seal_commit':None,'remote_readback':None,
        'disclosure_brief':disclosure_ref,'scope':'Entire presented review ZIP tree, including internal source/capture/judgment/operational/history records.',
        'sequence_after_authorization':['Fresh own HEAD B','Payload P descendant of B','Separate handoff H descendant of P; artifact_revision=P','Update own branch expected_sha=B and force:false','Exact readback of H and referenced P bytes'],
        'rejections':[pin(D/'evidence/archive-publication-rejection.json'),pin(D/'evidence/remote-publication-rejection.json')]},
      'consumed_dependencies':[{'session':'S4','discovery':remote['s4_discovery'],'readback':remote_ref,'compatibility':'NOT_COMPATIBLE_FOR_COMPLETE_S2_INPUTS'}],
      'global_integration':{'owner':'ROOT','status':'NOT_REVIEWED','separate_states':['owner acceptance','union integration','landing','production activation']},
      'supersedes':None,'preservation':pin(D/'evidence/original-preservation-final.json'),
      'limits':['This local checkpoint is not a committed/sealed Git handoff.','No self handoff commit SHA is assigned.','Faithful bookkeeping does not approve the remaining runtime, consumer, update, recovery, CI or publication gates.']}
    handoff_ref = save(D / 'handoff.json', handoff)
    out = {'schema':'genesis-s2-final-record-consolidation/v1','recorded_at':now(),'work':work_ref,'handoff':handoff_ref,
           'matrix':matrix_ref,'gates':gate_ref,'ledger':ledger_ref,'ledger_rows':ledger_rows,
           'prior_work_preserved':pin(backup),'semantic_bodies_changed':0,'runtime_operations':0,'remote_writes':0,
           'completion_state':'INCOMPLETE_BLOCKED','scope':'Faithful recording only; same-pair record correction check remains separately observable.'}
    save(D / 'evidence/final-record-consolidation.json', out)
    print(json.dumps({k:out[k] for k in ('work','handoff','matrix','gates','ledger_rows','completion_state')},indent=2))


if __name__ == '__main__':
    main()
