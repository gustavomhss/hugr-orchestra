"""Freeze support revision metadata; does not execute product or test sources."""
import hashlib
import json
from pathlib import Path

OUT = Path('/workspace/scratch/ef5eb2eb4a70/s1-03-34269cf4-d631-41c5-a30b-85b0ec217390/producers/boundaries')
V2 = OUT / 'revisions/support-v2'
sha = lambda b: hashlib.sha256(b).hexdigest()
blob = lambda b: hashlib.sha1(b'blob ' + str(len(b)).encode() + b'\0' + b).hexdigest()

def ident(rel):
    raw = (OUT / rel).read_bytes()
    return {'path': rel, 'bytes': len(raw), 'sha256': sha(raw), 'git_blob_sha': blob(raw)}

def dump(rel, obj):
    (OUT / rel).write_text(json.dumps(obj, ensure_ascii=False, indent=2) + '\n')

request = '''Mensagens de autorização da coordenação, preservadas literalmente. Os pedidos públicos integrais de J1/J2 estão em inputs/j1-response.md e inputs/j2-response.md.

Novo J1 support final FIX-FIRST chegou. Relay preservará relay/support/j1-response.md; leia assim que existir (não oracle). D-SUP-01 autorizado corrigir suporte§2: corpo “Schema/Protocol para Core e daí para Server” atribui Protocol→Core indevidamente. README declara separadamente Schema→Core e Protocol→Server, Server expõe Core. Separe essas relações conforme fonte, sem auditoria nova de imports. Preserve suportev1/receita original e delta exato. RE-SUP01..05 pedem provas dirigidas dos104paths, histórico/2+102/4+20/1441/2236, contagens437exports/63ddl, tarball/ZIP/SCIP; geradores/config;6docs históricos;fixtures;harness. Complete boundaries primeiro, depois suplemento support separado usando reconciliação compartilhada uma vez. AguardeJ2supportantesdefecharsuplementosupport; ele não amplia barra por sugestãoopcional. Root verificará contagens/procedimentos independentemente. Trabalhoapenas seu diretório, bodies+metadataautorizadoslimitados.

J2 support final FIX-FIRST disponível ao root; relay salvará relay/support/j2-response.md. Três defeitos: SUP-F01 mesmoD-SUP01Schema/Protocol; SUP-F02§5.3omni-expect não demonstra “apenas seus spawns”/“outro teste não pode”: mede contador na janelaexpectSpawn→settle, únicaopen; qualifique como intenção/hypóteseexecuçãoafterEachouproveprecondição, sem alegarfalhareal; SUP-F03preload ORCHESTRA_CREDENTIAL_KEY_FILE usa??=, caminho temporário sósevariávelnão definida. Autorizadas essas três precisões no suporte, somenteelas salvooutraspropostas. LeiaoriginalJ2eincorporeRE-SUP01..04, semrepetirevidênciajáaceita. Rootvai verificar437exports/63ddl/archiveeentregarárecibomecânicoindependenteporpathpermitido.

Verificação independente RE-SUP-01 concluída: pode ler SOMENTE payload/receipts/independent-support-structure.json (58.492B,SHA d2938337ccfad084d4e4e6c9d6ecd08c9b26701e86d69ca760601a93e76ca3eb) e scripts/verify-support-structure.py no WD. Root confirmou437exports semroot/wildcard; ddl tables63 columns637 fks59 pks63 indexes52 uniques3 checks1;191membros tar; package/package.json literal+hash; ZIPbytes/hash; SCIPstringsASCIIcomoffsets. Cadaumdos6inputs ligadoàcapturaGit/SHA; nenhumarchivefoiextraídoparafs,executado,instaladoouqualificadosemanticamente. Inclua noSUPsuplemento um resumo determinístico e procedure pertinentes +metadata literal/tarlist pertinente; não precisa despejar437chaves/191nomessemescolha. Rootpreservarárecibointeiro.

Aprovada a correção mecânica das duas razões de coverage em arquivo v2 separado, preservando original e reconciliação já congelados; o suplemento deve mostrar erratum e hashes exatos. Novo J1 union-proposal REQUEST_EVIDENCE: RE-UNI-01 pede somente dependencies.json10–54 com C-N01-host/session,C-N02,C-N05,API-session,LLM-tool; RE-UNI-02 os campos NOT_STARTED/PREPARED_NOT_EXECUTED das missions/roster com identidade. Relay salvará original. Após support, faça pequeno suplemento union; aguarde J2 para reunir ambos. Não precisa reenviar36keys/2236/divisão555/424/462/472/323 já aceitos, nem handoffsatuais externos. Sem mudança de proposta por ora.

Os originais completos da proposta já estão disponíveis e autorizados: relay/union-proposal/j1-response.md e relay/union-proposal/j2-response.md, no mesmo WD. J2 pede as mesmas seis obrigações (RE-NAV-01), sem defeito novo; J1 também pede estados do kit. Conclua o pequeno suplemento union após congelar support. Boundary suplemento root verificado e já enfileirado após research-b; support poderá reutilizar shared-reconciliation-1 pelos hashes exatos. Preserve original AGENTS somente como captura local: root não publicará cópia nova chamada AGENTS.md no namespace; fontes de autoridade ficam vinculadas ao AGENTS do repositório, inalterado.
'''
(V2 / 'request.txt').write_text(request)

summary = json.loads((V2 / 'supplement-verification.json').read_text())
idx = json.loads((OUT / 'suplemento-support-1.index.json').read_text())
delta = json.loads((V2 / 'delta.json').read_text())
coverage_delta = json.loads((OUT / 'coverage-v2.delta.json').read_text())
assert len(delta['operations']) == 3 and len(coverage_delta['changes']) == 2
assert ident('bodies/support.md') == {'path': 'bodies/support.md', **delta['to']}
assert (V2 / 'body.md').read_bytes() == (OUT / 'bodies/support.md').read_bytes()
assert ident('recipe.json')['sha256'] == 'b55bbbda05c426500409dfb49610dc2f83e520dd6dd37721ec1cb93507687a51'
assert ident('response.md')['sha256'] == '8b4c8f014f5e4b06ee996b1015af2e1c14ef4207eb1ab965f43944793f4e9708'
assert ident('coverage.jsonl')['sha256'] == coverage_delta['base']['sha256']
assert ident('shared-reconciliation-1.md')['sha256'] == '75aa4f74aba2ddcecd58c52fd329481dffabc60271a57bf0bfbe358d0b903992'
assert ident('bodies/boundaries.md')['sha256'] == 'ca7e76aa47100f32e2076b0a5055b2cebfe3d36cfb5c0d29601125db34d7b3c6'
assert ident('union-navigation-proposal.md')['sha256'] == 'f4362077ed7eb2f0dff7bb76acd60debeaa41bd37886551977b92c02addfcb6e'
assert (OUT / 'revisions/support-v1/recipe.json').read_bytes() == (OUT / 'recipe.json').read_bytes()
assert (OUT / 'revisions/support-v1/response.md').read_bytes() == (OUT / 'response.md').read_bytes()
assert (OUT / 'revisions/support-v1/coverage.jsonl').read_bytes() == (OUT / 'coverage.jsonl').read_bytes()

extension = {
    'kind': 'actual_effective_inputs_extension',
    'artifact_key': 's1.subslice03.support',
    'base_manifest': ident('effective-inputs.json'),
    'base_disposition': ident('effective-input-disposition.md'),
    'full_input_unit_preserved': True,
    'additional_inputs': [
        {**ident('revisions/support-v2/inputs/j1-response.md'), 'purpose': 'Public FIX-FIRST and RE-SUP-01..05; read in full.'},
        {**ident('revisions/support-v2/inputs/j2-response.md'), 'purpose': 'Public FIX-FIRST and RE-SUP-01..04; read in full.'},
        {**ident('revisions/support-v2/inputs/independent-support-structure.json'), 'purpose': 'Independent structural receipt; complete bytes parsed, literal selected fields delivered.'},
        {**ident('revisions/support-v2/inputs/verify-support-structure.py'), 'purpose': 'Independent procedure read in full as source evidence; not executed by this producer.'},
    ],
    'derived_evidence_not_new_capture': [
        {**ident('revisions/support-v2/inputs/vendor-package-metadata.json'), 'derived_from': 'independent-support-structure.json tar.package_json_exact_utf8; exact member bytes verified against receipt; original tar remains actual input.'},
        {**ident('shared-reconciliation-1.md'), 'purpose': 'Reuse complete actual-input identities and individual population dispositions; corrected reasons in separate erratum.'},
        ident('shared-reconciliation-2.delta.md'),
    ],
    'history_inputs': [ident('inputs-effective/history/' + name) for name in ['a3-dossier.md', 'a4-dossier.md', 'coverage-needs-projection.json']],
    'native_input_limit_notice': '726892-byte projection remains a real full input, not replaced or reclassified by excerpt to evade a 256K input limit. No native binding/import/acceptance asserted.',
    'authority_capture_notice': 'Original AGENTS capture is local evidence only; publication must bind to unchanged repository AGENTS, without a new AGENTS.md authority file in result namespace.',
    'body_correction_scope': [op['id'] for op in delta['operations']],
    'coverage_scope': [x['path'] for x in coverage_delta['changes']],
    'semantic_status': 'PENDING_SAME_PAIR_REEVALUATION',
}
dump('effective-inputs.support-v2.json', extension)

response = f'''# Resposta support v2 / suplemento 1

Os pedidos públicos integrais de J1 e J2 foram lidos e preservados. A revisão contém somente três precisões no corpo, duas razões corrigidas em coverage v2 separado e prova literal dirigida para RE-SUP-01..05 de J1 e RE-SUP-01..04 de J2. O produtor não atribui aceite nem altera decisões.

## Deltas autorizados

1. **SUP-F01 / D-SUP-01:** Schema→Core e Protocol→Server são relações distintas no README; Server expõe serviços Core por HTTP. A correção não pretende auditar imports adicionais.
2. **SUP-F02:** `omni-expect` mantém uma expectativa `open` e mede a diferença global de spawns entre `expectSpawn` e `settle`. Exclusividade por teste permanece intenção condicionada à ausência de sobreposição e à integração correta com o runner. Não se afirma uma falha real.
3. **SUP-F03:** `ORCHESTRA_CREDENTIAL_KEY_FILE ??=` fornece o caminho temporário somente quando a variável não estava definida, conservando um valor anterior.

`delta.json` e `delta.patch` contêm exatamente essas substituições. O corpo v2 tem {delta['to']['bytes']} bytes e SHA256 `{delta['to']['sha256']}`. Os arquivos v1 estão preservados em `../support-v1/`; a receita e resposta gerais da raiz continuam registros v1.

`coverage-v2.jsonl` conserva as 128 linhas e modifica somente a razão de README e de omni-expect. `coverage-v2.delta.json` identifica linhas e hashes exatos; `shared-reconciliation-2.delta.md` aplica o erratum sobre o bloco compartilhado v1 sem alterá-lo.

## Prova literal e reutilização

O suplemento contém {summary['literal_entries']} entradas literais, referências exatas aos {summary['reused_received_count']} trechos R042–R077 reconhecidos e um mapa dos 104 paths. Cada trecho novo possui commit quando aplicável, blob, SHA256 integral, intervalo de linhas, offsets da fonte e do suplemento e hash do excerto. Há evidência nova dos 13 capability fixtures.

| Pedido | Prova entregue / reutilizada |
|---|---|
| RE-SUP-01 | Reconciliação compartilhada, 104 disposições, 24+104, 2+102/4+20, 1.441/2.236; recibo estrutural independente e procedimento literal; 437 exports, 63 tabelas, metadata do tar, ZIP e strings SCIP. |
| RE-SUP-02 | Configurações, migration, toolkit-pack, toolkit-floors e fix-node-pty; trechos anteriores conservados por offsets. |
| RE-SUP-03 | RD-CTRLPLANE, RD-SESSION, PLAN, SNAPSHOT, WAVE-2, schema-changelog, ressalvas de api.html e estabilidade histórica de migrations. |
| RE-SUP-04 | Actions/network/resource/GitHub-command/capture; 13 capability fixtures; gates/distribution/CI; packaged-skills, SDK, ripgrep, upstream factories, recording. |
| RE-SUP-05 de J1 / harness de J2 | Janela `open`, omni-effect, nonce/startTime/processes, Effect/Cause/scoped, rejection/tmpdir/tool/location, shared-schema/task-governance, flock/background/dialer. |

O bloco `shared-reconciliation-1.md`, SHA256 `75aa4f74aba2ddcecd58c52fd329481dffabc60271a57bf0bfbe358d0b903992`, é reutilizado dos bytes [9742, 131191) do suplemento boundaries. Não é novamente retranscrito no suplemento support. A recepção pelos juízes continua sendo responsabilidade da coordenação; esta entrega apenas prepara o transporte verificável.

## Verificação independente e limites

O recibo da coordenação, SHA256 `d2938337ccfad084d4e4e6c9d6ecd08c9b26701e86d69ca760601a93e76ca3eb`, confirma contagens estruturais e identidades de seis entradas. Seu status é `PASS_STRUCTURAL_FACTS_ONLY`, com `semantic_acceptance: NOT_ASSIGNED`. O suplemento conserva os trechos literais do procedimento e dos registros; não transforma o recibo em aceite semântico nem em execução dos testes. O produtor não executou o procedimento independente: leu seu código e os bytes de resultado autorizados.

A3 (177.076 bytes), A4 (155.061 bytes) e projection (726.892 bytes) permanecem inputs efetivos integrais para história e população. A identidade completa dos 104 arquivos também permanece; o tar/ZIP/SCIP não se reduzem às seleções probatórias. `effective-inputs.json` registra os grupos exatos e `effective-inputs.support-v2.json` acrescenta os pedidos públicos e o recibo/procedimento independente. Não há reclassificação para contornar 256K.

O AGENTS original é captura local; a publicação deve vincular a fonte de autoridade do repositório inalterada, sem criar nova autoridade AGENTS no namespace de resultados.

## Estado final desta entrega

Suplemento `{summary['supplement']['path']}`: {summary['supplement']['bytes']} bytes, SHA256 `{summary['supplement']['sha256']}`. Hashes dos bytes e offsets foram verificados; fontes de produto, testes, providers, Atlas e operações remotas: NOT_RUN. O corpo boundaries v2 e a proposta permanecem inalterados. Suficiência semântica e autorização de avanço: pendentes do mesmo par e da coordenação.
'''
(V2 / 'response.md').write_text(response)

recipe = {
    'kind': 'native_production_recipe_revision', 'version': 2,
    'artifact_key': 's1.subslice03.support', 'layer': 'L1', 'need': 'entry/support',
    'producer': '/root/boundaries_l1', 'execution_id': '34269cf4-d631-41c5-a30b-85b0ec217390',
    'source_revision': '1cde2ff7a71bcf7aecb5d030917b577165135d38',
    'protocol_revision': 'ee2521a5b966bd505cc95bd1c733e09e12f33531',
    'kit_revision': '70234d541a9a3539935ef16f19e33c8f2d5f30ec',
    'base_recipe': ident('revisions/support-v1/recipe.json'),
    'base_body': ident('revisions/support-v1/bodies/support.md'),
    'body': ident('bodies/support.md'),
    'authorized_operations': [op['id'] for op in delta['operations']],
    'request': ident('revisions/support-v2/request.txt'),
    'judge_public_requests': [ident('revisions/support-v2/inputs/' + x) for x in ['j1-response.md', 'j2-response.md']],
    'effective_inputs': ident('effective-inputs.json'),
    'effective_inputs_extension': ident('effective-inputs.support-v2.json'),
    'evidence': ident('suplemento-support-1.md'),
    'evidence_index': ident('suplemento-support-1.index.json'),
    'shared_reconciliation': idx['shared_reconciliation'],
    'coverage_v1': ident('coverage.jsonl'), 'coverage_v2': ident('coverage-v2.jsonl'),
    'coverage_delta': ident('coverage-v2.delta.json'),
    'shared_erratum': ident('shared-reconciliation-2.delta.md'),
    'delta': ident('revisions/support-v2/delta.json'),
    'delta_patch': ident('revisions/support-v2/delta.patch'),
    'response': ident('revisions/support-v2/response.md'),
    'verification': ident('revisions/support-v2/supplement-verification.json'),
    'assembly_records': [ident('records/' + x) for x in ['prepare_support_v2.py', 'assemble_support_supplement_1.py', 'finalize_support_v2.py']],
    'preservation_notice': 'All original v1 records remain byte-identical. Only three body substitutions and two coverage reasons changed in separate v2 records. Original shared reconciliation remains frozen. No acceptance transferred.',
    'test_runtime': 'NOT_RUN', 'semantic_status': 'PENDING_SAME_PAIR_REEVALUATION', 'usage': 'UNKNOWN',
}
dump('revisions/support-v2/recipe.json', recipe)
receipt = {
    'kind': 'producer_supplement_preparation_receipt',
    'artifact_key': 's1.subslice03.support', 'candidate_version': 2,
    'producer': '/root/boundaries_l1', 'prepared_for': ['original J1', 'original J2'],
    'delivery_status': 'PREPARED_FOR_COORDINATOR_TRANSPORT',
    'no_claim_of_judge_receipt': True,
    'public_requests': recipe['judge_public_requests'],
    'candidate': recipe['body'], 'base_candidate': recipe['base_body'],
    'supplement': recipe['evidence'], 'index': recipe['evidence_index'],
    'recipe': ident('revisions/support-v2/recipe.json'),
    'request': recipe['request'], 'response': recipe['response'],
    'delta': recipe['delta'], 'coverage_delta': recipe['coverage_delta'],
    'effective_inputs_extension': recipe['effective_inputs_extension'],
    'shared_reconciliation_reuse': recipe['shared_reconciliation'],
    'verification': summary,
    'boundary_body_unchanged': ident('bodies/boundaries.md'),
    'proposal_unchanged': ident('union-navigation-proposal.md'),
    'product_execution': 'NOT_RUN', 'semantic_status': 'PENDING_SAME_PAIR_REEVALUATION',
}
dump('suplemento-support-1.receipt.json', receipt)
print(json.dumps({k: ident(k) for k in ['bodies/support.md','coverage-v2.jsonl','suplemento-support-1.md','suplemento-support-1.index.json','suplemento-support-1.receipt.json','revisions/support-v2/recipe.json','revisions/support-v2/response.md','effective-inputs.support-v2.json']}, ensure_ascii=False))
