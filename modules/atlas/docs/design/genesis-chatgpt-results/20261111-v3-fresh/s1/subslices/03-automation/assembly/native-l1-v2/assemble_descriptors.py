"""Build provenance descriptors only. Never executes product, producer recipes, or Atlas.

Writes are restricted to this script's directory. Inputs are original full files;
the script refuses reserved-oracle paths and resolves aliases by byte identity.
"""
from pathlib import Path
from collections import Counter
from datetime import datetime, timezone
import hashlib
import json
import re

OUT = Path(__file__).resolve().parent
WD = OUT.parent
PREFIX = 'modules/atlas/docs/design/genesis-chatgpt-results/20261111-v3-fresh/s1/subslices/03-automation'
P = 'f6ffb725704cc01682847d7e175f22b6ead3894c'
H = '332a0b292123de704ec0b4b393e77e0902a00b01'
SOURCE = '1cde2ff7a71bcf7aecb5d030917b577165135d38'
PROTOCOL = 'ee2521a5b966bd505cc95bd1c733e09e12f33531'
KIT = '70234d541a9a3539935ef16f19e33c8f2d5f30ec'
EXECUTION = '34269cf4-d631-41c5-a30b-85b0ec217390'
OBSERVED = {}
FILES = {}
ARTIFACTS = []


def identity(raw):
    return {'bytes': len(raw), 'sha256': hashlib.sha256(raw).hexdigest(),
            'git_blob_sha': hashlib.sha1(b'blob ' + str(len(raw)).encode() + b'\0' + raw).hexdigest()}


def triple(value):
    return (value['sha256'], value.get('bytes', value.get('byte_length')), value['git_blob_sha'])


def local(path):
    candidate = Path(path) if Path(path).is_absolute() else WD / path
    if any(part.lower() in {'oracle', 'oracles', 'reserved'} for part in candidate.parts):
        raise ValueError('Reserved content is outside this task: ' + str(candidate))
    resolved = candidate.resolve()
    if not resolved.is_relative_to(WD):
        raise ValueError('Read outside task workspace: ' + str(candidate))
    for part in (candidate, *candidate.parents):
        if part == WD.parent:
            break
        if part.is_symlink():
            raise ValueError('Symlink not allowed: ' + str(candidate))
    return resolved


def read(path, expected=None):
    path = local(path)
    raw = path.read_bytes()
    ident = identity(raw)
    if expected is not None:
        for key, observed in ident.items():
            wanted = expected.get(key, expected.get('byte_length') if key == 'bytes' else None)
            if wanted is not None and wanted != observed:
                raise ValueError(f'Identity drift: {path}: {key}: {wanted} != {observed}')
    rel = str(path.relative_to(WD))
    if rel in OBSERVED and OBSERVED[rel] != ident:
        raise ValueError('Input changed during assembly: ' + rel)
    OBSERVED[rel] = ident
    return raw, ident


def load(path):
    return json.loads(read(path)[0])


def write(name, value):
    target = OUT / name
    if target.parent != OUT:
        raise ValueError('Write outside exclusive output directory')
    target.write_text(json.dumps(value, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')


def safe_native_path(path):
    if not isinstance(path, str) or not path or re.search(r'[\\:*?"<>|\x00-\x1f\x7f]', path):
        raise ValueError('Invalid native path: ' + repr(path))
    if any(not part or part in {'.', '..'} or part.lower() in {'.git', '.atlas'} or part.endswith(('.', ' ')) for part in path.split('/')):
        raise ValueError('Invalid native path: ' + path)


INDEX_PATH = 'publish/l1-corrections-v2b/index.json'
INDEX = load(INDEX_PATH)
PUBLISHED = {entry['path']: entry for entry in INDEX['files']}
READBACK_PATH = 'payload/receipts/l1-corrections-v2-readback.json'
READBACK = load(READBACK_PATH)
assert READBACK['payload'] == P and READBACK['seal'] == H
assert READBACK['payload_files_verified'] == len(PUBLISHED) and READBACK['git_sha_and_sizes_all_match'] is True
MAP_PATH = 'payload/receipts/shared-input-materialization.json'
SHARED_MAP = load(MAP_PATH)
SHARED = SHARED_MAP['files']


def published_binding(canonical, ident):
    if not canonical.startswith(PREFIX + '/'):
        return None
    rel = canonical[len(PREFIX) + 1:]
    item = PUBLISHED.get(rel)
    if item is None or triple(item) != triple(ident):
        return None
    snapshot = 'publish/l1-corrections-v2b/files/' + rel
    read(snapshot, ident)
    return {'commit': P, 'basis': 'Exact local bytes + immutable publication snapshot + existing connector readback receipt; no new remote read.',
            'snapshot_path': snapshot, 'index_path': INDEX_PATH, 'readback_path': READBACK_PATH}


def catalog(path, canonical, *, expected=None, commit=None, basis=None, purpose='input', aliases=()):
    safe_native_path(canonical)
    if Path(canonical).name == 'AGENTS.md' and canonical.startswith(PREFIX + '/'):
        raise ValueError('AGENTS authority must remain at its original repository path')
    _, ident = read(path, expected)
    sources = [str(local(path).relative_to(WD))]
    for alias in aliases:
        read(alias, ident)
        rel = str(local(alias).relative_to(WD))
        if rel not in sources:
            sources.append(rel)
    binding = published_binding(canonical, ident)
    if commit is None and binding is not None:
        commit = P
    if commit == P and binding is None:
        raise ValueError('Cannot claim P without exact published-snapshot membership: ' + canonical)
    if canonical in FILES:
        row = FILES[canonical]
        if triple(row) != triple(ident):
            raise ValueError('Conflicting canonical versions: ' + canonical)
        if row['origin_commit'] is not None and commit is not None and row['origin_commit'] != commit:
            raise ValueError('Conflicting canonical origin: ' + canonical)
        for source in sources:
            if source not in row['local_sources']:
                row['local_sources'].append(source)
        if purpose not in row['purposes']:
            row['purposes'].append(purpose)
        return row
    row = {'canonical_path': canonical, **ident, 'local_sources': sources,
           'origin_commit': commit, 'origin_binding_basis': basis or (binding['basis'] if binding else 'Local bytes only; no immutable commit binding claimed.'),
           'published_snapshot_binding': binding, 'purposes': [purpose], 'input_for': [], 'reference_for': [], 'body_for': []}
    FILES[canonical] = row
    return row


def shared_binding(path, expected=None):
    _, ident = read(path, expected)
    matches = [row for row in SHARED if triple(row) == triple(ident)]
    if len(matches) != 1:
        raise ValueError(f'Expected one exact shared identity match: {path}, found {len(matches)}')
    row = matches[0]
    read(row['capture_archive'], ident)
    return row


def add_input(artifact, path, canonical, *, expected=None, commit=None, category,
              role, evidence, temporal_use='preexisting_file_consumed', aliases=(), extra=None):
    row = catalog(path, canonical, expected=expected, commit=commit,
                  basis='Pinned captured identity matched against the producer manifest and full original bytes.' if commit and commit != P else None,
                  purpose='input', aliases=aliases)
    if artifact['key'] not in row['input_for']:
        row['input_for'].append(artifact['key'])
    use = {'category': category, 'role': role, 'basis': evidence, 'temporal_use': temporal_use}
    if extra:
        use.update(extra)
    if canonical in artifact['_units']:
        artifact['_units'][canonical]['uses'].append(use)
        return
    artifact['_units'][canonical] = {'input_key': 'file:' + canonical, 'canonical_path': canonical,
        'bytes': row['bytes'], 'sha256': row['sha256'], 'git_blob_sha': row['git_blob_sha'],
        'origin_commit': row['origin_commit'], 'whole_file': True, 'uses': [use]}


def add_shared(artifact, path, expected, category, role, evidence):
    binding = shared_binding(path, expected)
    add_input(artifact, path, binding['path'], expected=expected, commit=binding['commit'],
              category=category, role=role, evidence=evidence,
              aliases=[binding['capture_archive']])


def add_local(artifact, path, *, canonical_rel=None, expected=None, category,
              role, evidence, temporal_use='preexisting_file_consumed', aliases=(), extra=None):
    canonical = PREFIX + '/' + (canonical_rel or str(local(path).relative_to(WD)))
    add_input(artifact, path, canonical, expected=expected, category=category, role=role,
              evidence=evidence, temporal_use=temporal_use, aliases=aliases, extra=extra)


def reference(artifact, path, canonical=None, purpose='producer_record', expected=None, commit=None):
    canonical = canonical or PREFIX + '/' + str(local(path).relative_to(WD))
    row = catalog(path, canonical, expected=expected, commit=commit, purpose=purpose)
    use = {'artifact_key': artifact['key'], 'role': purpose}
    if use not in row['reference_for']:
        row['reference_for'].append(use)
    if row['origin_commit']:
        return {'commit': row['origin_commit'], 'path': canonical, 'sha256': row['sha256']}
    return {'payload_path': canonical, 'sha256': row['sha256']}


FREEZE = load('payload/receipts/l1-current-freeze-v2.json')
KINDS = {'s1.core.automation': ('flow', 'automation', 'v4'),
         's1.core.research': ('component', 'research', 'v2'),
         's1.core.boundaries': ('component', 'boundaries', 'v2'),
         's1.subslice03.support': ('entry', 'support', 'v2')}
for item in FREEZE['bodies']:
    key = item['key']
    need, name, version = KINDS[key]
    rel = item['body_path'][len(PREFIX) + 1:]
    raw, ident = read(rel, item)
    raw.decode('utf-8', errors='strict')
    artifact = {'key': key, 'scope': 'orchestra.s1', 'layer': 1, 'need': need, 'version': version,
                'body': {'path': rel, 'encoding': 'utf-8', 'byte_length': ident['bytes'], 'sha256': ident['sha256']},
                'observed_body_git_blob_sha': ident['git_blob_sha'],
                'body_publication': {'commit': P, 'path': item['body_path'], 'seal': H,
                                     'verification': 'Local body matched published snapshot and existing readback receipt; no new remote request.'},
                '_name': name, '_units': {}, 'selection_notes': [], 'deferred_native_fields': ['title', 'authority', 'validity', 'gaps', 'evidence', 'build_dependencies', 'navigation', 'semantic_review_refs', 'runtime_receipt_refs']}
    row = catalog(rel, item['body_path'], expected=item, commit=P, purpose='body')
    row['body_for'].append(key)
    ARTIFACTS.append(artifact)
A, R, B, S = ARTIFACTS

# Automation: preserve producer-declared semantic/contract inputs, then close the
# real v4 procedure over files read before the output was written. The final v4
# recipe JSON is a later descriptive output, not an earlier file input.
AUTO_PATH = 'producers/automation/native-input-disposition.json'
AUTO = load(AUTO_PATH)
for section in ['source_inputs', 'external_schema_inputs']:
    for number, item in enumerate(AUTO[section]):
        if not item['effective_build_input']:
            continue
        add_input(A, 'producers/automation/' + item['capture_path'], item['repository_path'],
                  expected=item, commit=item['commit'], category=item['classification'], role=item['role'],
                  evidence=f'{AUTO_PATH}#/{section}/{number}')
for number, item in enumerate(AUTO['shared_contexts']):
    if item['effective_build_input']:
        add_shared(A, 'producers/automation/' + item['path'], item, item['classification'], item['role'],
                   f'{AUTO_PATH}#/shared_contexts/{number}')
for number, item in enumerate(AUTO['producer_and_review_records']):
    if item['effective_build_input'] and item['path'] != 'recipe.json':
        add_local(A, 'producers/automation/' + item['path'], expected=item,
                  category=item['classification'], role=item['role'], evidence=f'{AUTO_PATH}#/producer_and_review_records/{number}')
AD_PATH = 'producers/automation/revisions/v4/delta.json'
AD = load(AD_PATH)
for number, item in enumerate(AD['preserved_files']):
    is_capture = item['path'] == 'captures.json'
    add_local(A, 'producers/automation/' + item['path'], expected=item,
              category='mechanical_capture_selection' if is_capture else 'mechanical_preservation_input',
              role='Actual v4 file read for source lookup/hash checks.' if is_capture else 'Actual preexisting v4 read for preservation checks; no independent product authority.',
              evidence=f'{AD_PATH}#/preserved_files/{number}; revisions/v4/apply.py main/frozen_names')
for number, item in enumerate(AD['public_request_refs']):
    judge = item['judge_id'].lower()
    add_local(A, 'producers/automation/' + item['path'], expected=item,
              canonical_rel='judgments/l1/automation-4/' + judge + '-response.md',
              category='public_correction_request_file', role='Public request file read by the v4 procedure, not a current semantic acceptance.',
              evidence=f'{AD_PATH}#/public_request_refs/{number}',
              aliases=['payload/judgments/l1/automation-4/' + judge + '-response.md'])
A['selection_notes'] = [
    'The producer disposition declares 231 live records. Its final recipe.json is explicitly retained as subsequent descriptive contract evidence, without asserting that v4 read its own output.',
    'The concrete v4 script reads captures.json and 31 other preserved files plus two public reviewer requests. These inputs are included as mechanical dependencies, even when the producer disposition classifies them as non-independent semantic provenance.',
    'The direct prior body/recipe are history/body-v3.md and history/recipe-v3.json, matched by bytes, not the current body/recipe paths.',
    'Large preexisting evidence files actually read by the v4 preservation procedure remain whole mechanical inputs. A file read after this same procedure created it is not added retroactively.',
]

# Research: all 152 audited effective file units, including the retained ancestor,
# both real proposal indexes and the prior recipe used administratively.
RESEARCH_PATH = 'producers/research/native-input-audit/native-input-disposition.json'
RESEARCH = load(RESEARCH_PATH)
for number, item in enumerate(RESEARCH['effective_file_inputs']):
    path = item.get('read_path') or item['current_retained_path']
    destination = item['canonical_destination']
    aliases = item.get('byte_identical_retained_aliases', [])
    if item['input_class'] == 'declared_shared_input':
        binding = shared_binding(path, item)
        assert binding['path'] == destination['path'] and binding['commit'] == destination['commit']
    add_input(R, path, destination['path'], expected=item, commit=destination['commit'],
              category=item['input_class'], role=item['role'], evidence=f'{RESEARCH_PATH}#/effective_file_inputs/{number}',
              aliases=aliases, extra={'producer_input_id': item['id'], 'producer_use': item['use']})
CORRECTION = RESEARCH['retained_control_records'][1]
add_local(R, CORRECTION['path'], expected=CORRECTION,
          category='retained_consumed_message_for_recipe_binding',
          role='Faithful record of the correction instruction actually consumed as a message; selected recipe_ref under transport.md.',
          evidence=RESEARCH_PATH + '#/retained_control_records/1; actual_consumed_procedures/3; principal followup',
          temporal_use='message_consumed_then_file_serialized_during_correction_not_parsed_as_preexisting_recipe',
          extra={'original_message_wire_sha256': 'UNKNOWN', 'retroactive_file_input_claim': False,
                 'native_file_key_role': 'transport binding to the consumed instruction record; not a claim of earlier file execution'})
R['selection_notes'] = [
    '152 effective whole-file units come directly from the completed producer audit. The only extra native file key is the preserved correction message chosen as recipe_ref by the transport contract.',
    'request.txt and correction-v2-request.txt are retained message records, not established pre-run executable files. The original message wire-byte hashes are UNKNOWN.',
    'The correction request was serialized after candidate bytes were computed and before body.md was written; it was not parsed to choose replacements. Its reference preserves the instruction actually used.',
    'recipe-v2.json, correction-v2.json, final responses and this later audit are outputs. They are not added as retroactive body inputs.',
    'The actual v2 correction command was inline. No retained standalone original executable script is established, and none is reconstructed here.',
]

# Boundaries/support inherited source, history, and authority selections.
BOUND_PATH = 'producers/boundaries/effective-inputs.json'
BOUND = load(BOUND_PATH)
CAPTURES = {row['path']: row for row in load('producers/boundaries/captures.json')}
for artifact in [B, S]:
    part = BOUND['per_artifact'][artifact['key']]
    for group_name in part['source_groups']:
        group = BOUND['source_groups'][group_name]
        for path in group['paths']:
            item = CAPTURES[path]
            add_input(artifact, 'producers/boundaries/' + item['capture_path'], path,
                      expected=item, commit=item['commit'], category=group_name, role=group['reason'],
                      evidence=f'{BOUND_PATH}#/source_groups/{group_name}; captures.json exact path')
    for section in ['historical_full_inputs', 'historical_bodies']:
        for number, item in enumerate(BOUND[section]):
            add_input(artifact, 'producers/boundaries/' + item['local_path'], item['source_path'],
                      expected=item, commit=item['commit'], category=section,
                      role=item.get('role', 'Inherited full body used for historical/population statements; not a transferred acceptance.'),
                      evidence=f'{BOUND_PATH}#/{section}/{number}')
    for number, item in enumerate(BOUND['guidance_and_authority_inputs']):
        add_shared(artifact, 'producers/boundaries/' + item['local_path'], item,
                   'guidance_and_authority_input', item['role'],
                   f'{BOUND_PATH}#/guidance_and_authority_inputs/{number}; exact shared-map identity')

# Literal read closure of the boundaries v2 script. The current support file is
# v2 now, so its v1 bytes must resolve to the retained support-v1 archive.
BP = 'producers/boundaries/records/prepare_boundaries_v2.py'
BD_PATH = 'producers/boundaries/revisions/boundaries-v2/delta.json'
BD = load(BD_PATH)
B_LOCAL = [
    ('producers/boundaries/revisions/boundaries-v1/bodies/boundaries.md', None, 'incremental_prior_body', 'Preexisting boundaries v1 body used for two replacements.', []),
    ('producers/boundaries/recipe.json', None, 'mechanical_preservation_input', 'Shared v1 recipe copied and hash checked.', ['producers/boundaries/revisions/boundaries-v1/recipe.json']),
    ('producers/boundaries/response.md', None, 'mechanical_preservation_input', 'Shared v1 response copied and hash checked.', ['producers/boundaries/revisions/boundaries-v1/response.md']),
    ('producers/boundaries/request.txt', None, 'mechanical_preservation_input', 'Original request preserved conditionally from the preexisting file.', ['producers/boundaries/revisions/boundaries-v1/request.txt']),
    ('producers/boundaries/request-followups.txt', None, 'mechanical_preservation_input', 'Original followups preserved conditionally from the preexisting file.', ['producers/boundaries/revisions/boundaries-v1/request-followups.txt']),
    ('producers/boundaries/records/verification.json', None, 'mechanical_preservation_input', 'Original documentary verification copied conditionally; not a new product result.', ['producers/boundaries/revisions/boundaries-v1/records/verification.json']),
    ('producers/boundaries/revisions/support-v1/bodies/support.md', None, 'mechanical_preservation_input', 'Support v1 bytes checked before boundaries v2 write; current support v2 is not this input.', []),
    ('producers/boundaries/union-navigation-proposal.md', None, 'mechanical_preservation_input', 'Preexisting navigation proposal checked for preservation; no accepted cross-package dependency.', []),
    (BP, None, 'executed_correction_procedure', 'Actual retained script used for the two authorized literal corrections.', []),
]
for path, canonical_rel, category, role, aliases in B_LOCAL:
    add_local(B, path, canonical_rel=canonical_rel, category=category, role=role,
              evidence=BP + '; ' + BD_PATH, aliases=aliases)
for number, item in enumerate(BD['v1_preserved']):
    if 'local_path' in item:
        add_local(B, 'producers/boundaries/' + item['local_path'], expected=item,
                  category='public_correction_request_file', role=item['role'],
                  evidence=f'{BD_PATH}#/v1_preserved/{number}', aliases=[item['source_path']])
B['selection_notes'] = [
    '33 source-group paths + full historical/authority inputs are retained. The mission file occurs in both guidance and navigation and is one canonical input only after byte equality.',
    'The v2 correction script is the recipe_ref. Its prior body, shared v1 recipe/response, original request/followups/verification, public requests, support v1 sentinel and navigation proposal are literal file-read dependencies.',
    'The support sentinel resolves to retained support-v1 bytes, never to current support.md v2 merely because the filename matches.',
    'The script conditionally copies request/followups/verification when their v1 copies do not yet exist. No original filesystem trace proves which branch executed, so both byte-identical retained aliases represent the same conservative required input unit.',
    'The v2 recipe JSON and supplement/effective-input manifest generated after the body are preserved as provenance, not invented pre-execution body inputs.',
]

# Support v2 retains the explicitly declared public requests and independent
# structural receipt/procedure. The correction script reads/copies those files
# before writing the body, and checks earlier files afterward as sentinels.
SUP_PATH = 'producers/boundaries/effective-inputs.support-v2.json'
SUP = load(SUP_PATH)
for number, item in enumerate(SUP['additional_inputs']):
    aliases = []
    if item['path'].endswith('j1-response.md') or item['path'].endswith('j2-response.md'):
        aliases = ['relay/support/' + Path(item['path']).name]
    elif item['path'].endswith('independent-support-structure.json'):
        aliases = ['payload/receipts/independent-support-structure.json']
    elif item['path'].endswith('verify-support-structure.py'):
        aliases = ['scripts/verify-support-structure.py']
    add_local(S, 'producers/boundaries/' + item['path'], expected=item, aliases=aliases,
              category='declared_support_v2_additional_input', role=item['purpose'],
              evidence=f'{SUP_PATH}#/additional_inputs/{number}')
SP = 'producers/boundaries/records/prepare_support_v2.py'
S_LOCAL = [
    ('producers/boundaries/revisions/support-v1/bodies/support.md', 'incremental_prior_body', 'Support v1 full body actually used for the three replacements.', []),
    ('producers/boundaries/recipe.json', 'mechanical_preservation_input', 'Shared v1 recipe copied and checked; not the later support v2 recipe output.', ['producers/boundaries/revisions/support-v1/recipe.json']),
    ('producers/boundaries/response.md', 'mechanical_preservation_input', 'Shared original v1 response copied and checked.', ['producers/boundaries/revisions/support-v1/response.md']),
    ('producers/boundaries/coverage.jsonl', 'actual_population_and_revision_input', 'Original 128-row coverage used for shared population/read-depth and read by the same v2 procedure to form the separate coverage revision.', ['producers/boundaries/revisions/support-v1/coverage.jsonl']),
    ('producers/boundaries/shared-reconciliation-1.md', 'mechanical_preservation_input', 'Preexisting reconciliation checked for preservation after the body write; not newly created in this procedure.', []),
    ('producers/boundaries/bodies/boundaries.md', 'mechanical_preservation_input', 'Previously produced boundaries v2 checked for preservation after the support body write; file sentinel only, without semantic predecessor acceptance.', ['producers/boundaries/revisions/boundaries-v2/body.md']),
    ('producers/boundaries/union-navigation-proposal.md', 'mechanical_preservation_input', 'Preexisting union proposal checked for preservation; no accepted external selection.', []),
    (SP, 'executed_correction_procedure', 'Actual retained script used for three body and two separate coverage substitutions.', []),
]
for path, category, role, aliases in S_LOCAL:
    add_local(S, path, category=category, role=role, evidence=SP + '; ' + SUP_PATH, aliases=aliases)
S['selection_notes'] = [
    'All 104 assigned support paths and eight kit routing files remain full file inputs. Distinct repository source paths are not merged just because their bytes happen to match.',
    'Full A3/A4/projection and both historical bodies remain inputs. The source AGENTS.md is referenced at its original authority path.',
    'The actual correction recipe is prepare_support_v2.py. It consumed/captured the four inputs in the v2 extension and prior version/preservation files listed here.',
    'The boundaries v2 body is an actual preservation sentinel in the support script, not a semantically accepted same-package build predecessor. No build_dependencies edge or acceptance is invented.',
    'coverage-v2.jsonl, the coverage delta, shared-reconciliation-2.delta.md, vendor-package-metadata extraction, support supplement and the final recipe/response were produced later. Their later hashing does not make them original body inputs.',
]

REF_CONFIG = [
    (A, 'producers/automation/revisions/v4/apply.py', 'producers/automation/revisions/v4/request.txt', 'producers/automation/revisions/v4/response.md', 'producers/automation/recipe.json', 'producers/automation/request.txt', 'producers/automation/response.md'),
    (R, 'producers/research/correction-v2-request.txt', 'producers/research/correction-v2-request.txt', 'producers/research/correction-v2-response.md', 'producers/research/recipe-v2.json', 'producers/research/request.txt', 'producers/research/response.md'),
    (B, BP, 'producers/boundaries/revisions/boundaries-v2/request.txt', 'producers/boundaries/revisions/boundaries-v2/response.md', 'producers/boundaries/revisions/boundaries-v2/recipe.json', 'producers/boundaries/request.txt', 'producers/boundaries/response.md'),
    (S, SP, 'producers/boundaries/revisions/support-v2/request.txt', 'producers/boundaries/revisions/support-v2/response.md', 'producers/boundaries/revisions/support-v2/recipe.json', 'producers/boundaries/request.txt', 'producers/boundaries/response.md'),
]
for artifact, recipe, request, response, posterior, initial_request, initial_response in REF_CONFIG:
    artifact['recipe_ref'] = reference(artifact, recipe, purpose='selected_effective_recipe')
    artifact['producer_request_ref'] = reference(artifact, request, purpose='current_revision_original_request_record')
    artifact['producer_response_ref'] = reference(artifact, response, purpose='current_revision_original_response')
    artifact['posterior_descriptive_recipe_ref'] = reference(artifact, posterior, purpose='subsequent_descriptive_recipe_output_not_body_input')
    artifact['initial_producer_request_ref'] = reference(artifact, initial_request, purpose='initial_original_request_record')
    artifact['initial_producer_response_ref'] = reference(artifact, initial_response, purpose='initial_original_response')
    artifact['reference_candidate_status'] = 'Recommended transport references only; no semantic review or runtime binding assigned.'
    if artifact is R:
        artifact['recipe_ref_justification'] = 'transport.md explicitly permits the request actually used. This exact retained correction record preserves the instruction consumed as a message. It is not claimed to be a preexisting executable recipe file; original wire bytes are UNKNOWN.'
        artifact['recipe_ref_alternatives'] = [{
            'reference': reference(artifact, 'inputs/SKILL.md', '.orchestra/skills/execute-genesis/SKILL.md', 'broader_preexisting_procedure_alternative', commit=PROTOCOL),
            'status': 'Broader real preexisting procedure; less specific to the two v2 corrections, so not selected.',
        }]
    else:
        artifact['recipe_ref_justification'] = 'The retained procedure actually performs the authorized literal correction and declares/checks the prior body identity. The later descriptive recipe JSON is preserved separately.'
        artifact['recipe_ref_alternatives'] = [{'reference': artifact['producer_request_ref'],
            'status': 'Preserved instruction actually used as a message; allowed request-form alternative, not selected over the available actual procedure. Wire bytes UNKNOWN.'}]
    artifact['producer_request_temporality'] = {'consumed_medium': 'principal conversation message', 'retained_file': 'Visible original instruction record, with later serialization where shown in the procedure.', 'original_wire_bytes_sha256': 'UNKNOWN'}
    units = [artifact['_units'][path] for path in sorted(artifact['_units'])]
    artifact['input_units'] = units
    artifact['input_keys'] = [unit['input_key'] for unit in units]
    artifact['source_refs'] = [{'commit': unit['origin_commit'], 'path': unit['canonical_path'],
                               'git_blob_sha': unit['git_blob_sha'], 'sha256': unit['sha256']}
                              for unit in units if unit['origin_commit'] is not None]
    recipe_path = artifact['recipe_ref'].get('path', artifact['recipe_ref'].get('payload_path'))
    assert 'file:' + recipe_path in artifact['input_keys']
    assert PREFIX + '/' + artifact['body']['path'] not in artifact['_units'], 'Self-input not allowed'
    artifact['counts'] = {'input_keys': len(units), 'source_refs': len(artifact['source_refs']),
                          'input_bytes_sum': sum(unit['bytes'] for unit in units),
                          'whole_input_files_over_256000': sum(unit['bytes'] > 256000 for unit in units),
                          'without_immutable_commit_binding': sum(unit['origin_commit'] is None for unit in units)}
    artifact['oversized_inputs'] = [{key: unit[key] for key in ['input_key', 'bytes', 'sha256', 'git_blob_sha']} for unit in units if unit['bytes'] > 256000]
    del artifact['_units']
    del artifact['_name']

# Descriptor evidence is subsequent audit material. Preserve it for review, but
# never insert it into the four body input arrays.
AUDIT_ARCHIVES = [AUTO_PATH, 'producers/automation/native-input-disposition-response.md',
                  RESEARCH_PATH, 'producers/research/native-input-audit/request.txt',
                  'producers/research/native-input-audit/before.json', 'producers/research/native-input-audit/preservation.json',
                  'producers/research/native-input-audit/response.md', BOUND_PATH, SUP_PATH,
                  'producers/boundaries/effective-input-disposition.md', AD_PATH, BD_PATH,
                  'producers/research/correction-v2.json', 'producers/boundaries/revisions/support-v2/delta.json',
                  MAP_PATH, READBACK_PATH, 'payload/receipts/l1-current-freeze-v2.json']
audit_refs = []
for path in AUDIT_ARCHIVES:
    rel = path[8:] if path.startswith('payload/') else path
    row = catalog(path, PREFIX + '/' + rel, purpose='assembly_provenance_not_new_body_input')
    audit_refs.append({'local_path': path, 'canonical_path': row['canonical_path'],
                       'sha256': row['sha256'], 'bytes': row['bytes'], 'git_blob_sha': row['git_blob_sha'],
                       'origin_commit': row['origin_commit'], 'body_input_by_virtue_of_this_audit': False})

FORMAT = 'runtime-preflight/candidate/modules/atlas/packages/adapter-io/src/genesis-native-format.ts'
NATIVE = 'runtime-preflight/candidate/modules/atlas/packages/adapter-io/src/genesis-native.ts'
CONTRACT_FILES = ['inputs/COMMON.md', 'inputs/mission.json', 'inputs/inputs.json', 'inputs/AGENTS.md',
                  'inputs/SKILL.md', 'inputs/references/transport.md', 'inputs/references/runtime.md',
                  FORMAT, NATIVE, 'scripts/materialize-context.py']
contract_identities = [{'local_path': path, **read(path)[1]} for path in CONTRACT_FILES]
transport = shared_binding('inputs/references/transport.md')
protocol_ref = {'commit': transport['commit'], 'path': transport['path'], 'sha256': transport['sha256']}


def destination_status(path, expected):
    target = local(path)
    if not target.exists():
        return {'state': 'MISSING', 'action': 'COPY_FULL_ORIGINAL_BYTES'}
    _, found = read(target)
    if triple(found) == triple(expected):
        return {'state': 'BYTE_IDENTICAL', 'action': 'KEEP_IDENTICAL', 'observed': found}
    return {'state': 'CONFLICTING_BYTES', 'action': 'DO_NOT_OVERWRITE_WITHOUT_RECONCILING_VERSION', 'observed': found}


rows = []
for canonical in sorted(FILES):
    row = FILES[canonical]
    native = destination_status('native-source/' + canonical, row)
    under_output = canonical.startswith(PREFIX + '/')
    payload_rel = canonical[len(PREFIX) + 1:] if under_output else None
    payload = destination_status('payload/' + payload_rel, row) if payload_rel else {'state': 'NOT_APPLICABLE', 'action': 'KEEP_ORIGINAL_REPOSITORY_AUTHORITY_PATH; DO_NOT_COPY_INTO_RESULTS'}
    rows.append({**row, 'source_local_path': str(WD / row['local_sources'][0]),
                 'native_destination': str(WD / 'native-source' / canonical), 'native_status': native,
                 'payload_relative_path': payload_rel,
                 'payload_destination': str(WD / 'payload' / payload_rel) if payload_rel else None,
                 'payload_status': payload, 'copy_unit': 'whole original file; no normalization, excerpts, or substitutions',
                 'input_exceeds_256000': bool(row['input_for']) and row['bytes'] > 256000})

oversized = [{'canonical_path': row['canonical_path'], 'bytes': row['bytes'], 'sha256': row['sha256'],
              'git_blob_sha': row['git_blob_sha'], 'input_for': row['input_for']} for row in rows if row['input_exceeds_256000']]
unknowns = [
    {'id': 'U-MESSAGE-WIRE', 'value': 'UNKNOWN', 'scope': 'All retained principal-message archives',
     'detail': 'Exact visible retained file bytes are observed. Original host message wire serialization was not exposed; no archival file is represented as those unavailable wire bytes.'},
    {'id': 'U-RESEARCH-SCRIPT', 'value': 'NONE_ESTABLISHED', 'scope': 'Research v2 standalone executable file',
     'detail': 'The producer attests an actual inline correction. No persistent original script file/hash is established. The consumed correction message supplies the permitted request-form recipe_ref.'},
    {'id': 'U-INITIAL-SCRIPT-INVENTORY', 'value': 'UNKNOWN', 'scope': 'Complete initial native authoring tool-call/script inventory',
     'detail': 'These descriptors bind the retained declared original inputs and actual retained final correction procedures. They do not fabricate missing initial temporary files or token-level read traces.'},
    {'id': 'U-BND-CONDITIONAL-COPY', 'value': 'BRANCH_NOT_EXPOSED', 'scope': 'Boundaries v1 request/followups/verification preservation',
     'detail': 'The retained script reads the original files only if versioned copies are absent. Both aliases are byte identical. The conservative dependency union retains each logical unit; original branch-taking telemetry is not invented.'},
    {'id': 'U-REMOTE-READ', 'value': 'NOT_REPEATED_IN_THIS_TASK', 'scope': 'Commit membership',
     'detail': 'Pins are inherited from observed capture manifests. P references additionally match exact local publication snapshot bytes and the existing connector readback receipt. This task made no network call.'},
    {'id': 'U-SEMANTIC-REVIEW', 'value': 'DEFERRED_TO_PRINCIPAL_AND_EXISTING_PAIR', 'scope': 'Four current L1 bodies and later package',
     'detail': 'No semantic_review_refs, acceptance, authority/validity decision or runtime binding is supplied by this mechanical assembly.'},
]
descriptors = {'schema': 's1-03-native-l1-input-descriptors/v1', 'execution_id': EXECUTION,
               'repository': 'gustavomhss/hugr-orchestra', 'subslice_id': 'S1-03',
               'purpose': 'Mechanical descriptors for later native-package assembly; not a native package or a semantic judgment.',
               'session': 'S1', 'scope': 'orchestra.s1', 'source_revision': SOURCE,
               'protocol_revision': PROTOCOL, 'kit_revision': KIT, 'published_payload': P, 'seal': H,
               'recommended_protocol_ref': protocol_ref, 'native_contract_files_observed': contract_identities,
               'selection_policy': [
                   'Use full original file identities. Canonical aliases require equal SHA256, byte count and recomputed Git blob; distinct original source paths remain distinct.',
                   'Separate semantic/contract inputs, actual mechanical procedure inputs, retained consumed-message bindings, and later output/provenance.',
                   'Source refs include original pinned sources and published local procedure inputs only when immutable membership has recorded evidence; they are not Atlas input versions.',
                   'No oracle contents, reserved judgments, product execution, recipe execution, prepare, publication or native store mutation.',
               ],
               'artifacts': ARTIFACTS, 'provenance_archives': audit_refs,
               'whole_inputs_exceeding_runtime_cap': oversized, 'uncertainties': unknowns,
               'not_provided': ['semantic_review_refs', 'semantic acceptance', 'native package state', 'oracle content/ref selection', 'binding approval', 'Atlas input versions/CAS identities', 'runtime receipts'],
               'materialization_plan': 'materialization-plan.json'}
plan = {'schema': 's1-03-native-materialization-plan/v1', 'execution_id': EXECUTION,
        'mode': 'PLAN_ONLY_NO_COPIES_PERFORMED', 'workspace': str(WD),
        'native_root': str(WD / 'native-source'), 'payload_root': str(WD / 'payload'),
        'output_prefix': PREFIX, 'preserve_original_authority_paths': True,
        'files': rows, 'whole_inputs_exceeding_runtime_cap': oversized,
        'summary': {'unique_destination_files': len(rows), 'input_destination_files': sum(bool(row['input_for']) for row in rows),
                    'native_statuses': dict(Counter(row['native_status']['state'] for row in rows)),
                    'payload_statuses': dict(Counter(row['payload_status']['state'] for row in rows)),
                    'input_files_over_256000': len(oversized),
                    'destination_conflicts': sum(row['native_status']['state'] == 'CONFLICTING_BYTES' or row['payload_status']['state'] == 'CONFLICTING_BYTES' for row in rows)},
        'execution_rules': ['Verify identities again immediately before copying.', 'Use byte copies without newline or Unicode normalization.',
                            'Do not truncate or split any input to satisfy a size cap.', 'Do not copy AGENTS.md into result paths.',
                            'Do not run producer scripts to materialize old bodies.', 'No prepare/publication was authorized for this task.']}
write('descriptors.json', descriptors)
write('materialization-plan.json', plan)
write('observed-identities.json', {'schema': 's1-03-observed-local-byte-identities/v1',
                                 'recorded_at_utc': datetime.now(timezone.utc).isoformat(),
                                 'files': [{'local_path': path, **OBSERVED[path]} for path in sorted(OBSERVED)],
                                 'read_restriction': 'No oracle/oracles/reserved path opened; corpus treated as data.'})
print(json.dumps({'artifacts': [{k: artifact[k] for k in ['key', 'counts', 'recipe_ref']} for artifact in ARTIFACTS],
                  'materialization': plan['summary'], 'oversized_input_files': oversized}, ensure_ascii=False, indent=2))
