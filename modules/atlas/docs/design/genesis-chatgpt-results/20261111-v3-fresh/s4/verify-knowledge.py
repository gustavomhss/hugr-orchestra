"""Verify preserved S4 knowledge bytes and review bindings; no Atlas operation."""
import argparse
import hashlib
import json
from pathlib import Path

PREFIX = Path('modules/atlas/docs/design/genesis-chatgpt-results/20261111-v3-fresh/s4')
EXPECTED = {
    'judgments/l4-root/responses/j1-canonical-r2.json': '5090541410eee055861100506801e8229ca6a91068fc47596d75f4a0a34b02ba',
    'judgments/l4-root/responses/j2-canonical-r1.json': 'ceb6f47245ff6736c60fcb822b82bc4def418db8d4bf86358235427fb1a3cd4d',
    'judgments/l4-root/responses/j2-canonical-addendum.json': '321eec139f52ccfa82c422e1656220d334929c63b2a4027fb4c97d864c1b7f1f',
    'judgments/l4-root/requests/part-05.txt': 'eeaba5496df38e1900dd4cc980161805c8efb712348e3a2b5220222aee89cb0f',
    'oracles/l4.json': 'ff39d9608b31a0d74abac2c66482a5c8489547efd0147d4801043efb93c9e6ce',
    'producers/l4a/artifacts.json': 'cd82ecc75c046243ae93343ee393bcfe71b17edc4b379e38337f1eb6fbc3ae1d',
    'producers/l4b/artifacts.json': '6dd07f3e90aa93123a3b60495f547d4fd72ddd7f5f194a8e453e0f7e59bdfdd5',
}

def sha(raw):
    return hashlib.sha256(raw).hexdigest()

def read_json(path):
    return json.loads(path.read_bytes())

def require(condition, message):
    if not condition:
        raise ValueError(message)

def verify(repository, base_package, historical_driver):
    root = repository / PREFIX
    package_raw = (root / 'native-package.json').read_bytes()
    package = json.loads(package_raw)
    base_raw = base_package.read_bytes()
    require(sha(base_raw) == '00e479d28eb3830c09722d4ad8629d751802d18ac84f9dfd85d93163c4952c92', 'unexpected predecessor package')
    require(package['artifacts'][:11] == json.loads(base_raw)['artifacts'], 'original eleven objects changed')
    artifacts = package['artifacts']
    keys = [a['key'] for a in artifacts]
    require(len(keys) == len(set(keys)) == 15, 'need exactly fifteen unique artifact keys')
    require(len(package['required_artifact_keys']) == 15 and set(keys) == set(package['required_artifact_keys']), 'required membership mismatch')
    require(package['missing_required_artifact_keys'] == [], 'missing artifacts')
    require(package['package_state'] == 'IN_PROGRESS', 'operational completion must remain open')
    positions = {key: i for i, key in enumerate(keys)}
    edges = 0
    references = set()
    bodies = []
    for artifact in artifacts:
        relative = Path(artifact['body']['path'])
        require(not relative.is_absolute() and '..' not in relative.parts, 'unsafe body path')
        path = root / relative
        require(not path.is_symlink(), 'symlink body')
        raw = path.read_bytes()
        require(len(raw) == artifact['body']['byte_length'] and sha(raw) == artifact['body']['sha256'], 'body identity mismatch: ' + artifact['key'])
        bodies.append({'key': artifact['key'], 'byte_length': len(raw), 'sha256': sha(raw)})
        for dependency in artifact['build_dependencies']:
            require(dependency.get('same_package') is True and positions[dependency['key']] < positions[artifact['key']], 'invalid dependency order')
            edges += 1
        for target in artifact['navigation']:
            require((target if isinstance(target, str) else target['key']) in positions, 'unresolved navigation')
        require(len(artifact['semantic_review_refs']) >= 2, 'missing semantic reviewers')
        for ref in artifact['semantic_review_refs']:
            require(sha((repository / ref['payload_path']).read_bytes()) == ref['sha256'], 'review byte mismatch')
            references.add(ref['payload_path'])
    require(edges == 37, 'unexpected dependency edge count')
    require(len(package['roots']) == 7, 'need seven roots')
    for need, key in package['roots'].items():
        require(artifacts[positions[key]]['need'] == need, 'root need mismatch')
    for relative, expected in EXPECTED.items():
        require(sha((root / relative).read_bytes()) == expected, 'historical evidence mismatch: ' + relative)
    driver = historical_driver.read_bytes()
    require(sha(driver) == 'a6a579e6a3978daa9a67f01bce06fda56172334b0e34323e787cba4d5ab9f27f', 'historical driver mismatch')
    lines = driver.decode().splitlines(keepends=True)
    require(''.join(lines[37:40] + lines[142:152]) in (root / 'judgments/l4-root/requests/part-05.txt').read_text(), 'supplement literal mismatch')
    response = read_json(root / 'judgments/l4-root/responses/j1-canonical-r2.json')
    require(response['agent_id'] == '/root/local_j1' and response['review_execution_id'] == '0a451b91-c4e7-4573-9958-fed60817f299', 'wrong historical reviewer/run')
    require(response['verdict'] == 'PASS' and not response['mandatory_findings'], 'unresolved semantic judgment')
    require(len(response['criteria']) == 15 and all(x['verdict'] == 'PASS' for x in response['criteria']), 'criteria incomplete')
    require(len(response['oracle_cases']) == 6 and all(x['verdict'] == 'PASS' for x in response['oracle_cases']), 'oracle cases incomplete')
    require(all(x['status'] == 'RESOLVED' and x['body_change_required'] is False for x in response['primary_corrections']), 'unresolved J1 finding')
    require({x['id'] for x in response['primary_corrections']} == {'J1-E01', 'J1-E02', 'J1-E03'}, 'finding set mismatch')
    acceptance = read_json(root / 'l4-acceptance.json')
    require(acceptance['composed_manifest']['sha256'] == sha(package_raw), 'acceptance references another composition')
    require(acceptance['judge_count'] == 2 and acceptance['body_changes'] == 0, 'acceptance scope mismatch')
    require(len(acceptance['composed_metadata_status_reconciliation']) == 5, 'status delta coverage mismatch')
    require(acceptance['runtime_binding_publication_consumer'] == 'NOT_CLAIMED_BY_SEMANTIC_ACCEPTANCE', 'semantic/runtime conflation')
    for expected in response['identities']['bodies']:
        body = artifacts[positions[expected['key']]]['body']
        require(body['sha256'] == expected['sha256'] and body['byte_length'] == expected['bytes'], 'review targets other body')
    original_l4 = read_json(root / 'producers/l4a/artifacts.json')['artifacts'] + read_json(root / 'producers/l4b/artifacts.json')['artifacts']
    for original in original_l4:
        composed = artifacts[positions[original['key']]]
        for key, value in original.items():
            if key not in ('semantic_review_refs', 'gaps'):
                require(composed[key] == value, 'unauthorized metadata change: ' + key)
        require(len(composed['gaps']) == len(original['gaps']), 'gap removed')
        require(sum(a != b for a, b in zip(composed['gaps'], original['gaps'])) == 1, 'unexpected gap changes')
    return {'schema': 's4-knowledge-integrity/v1', 'state': 'PASS', 'package_sha256': sha(package_raw), 'package_bytes': len(package_raw), 'artifacts': bodies, 'artifact_count': 15, 'unchanged_predecessor_objects': 11, 'build_edges': edges, 'roots': 7, 'review_files': len(references), 'historical_j1': 'PASS', 'historical_j2': 'PASS_REUSED_EXACT_BYTES', 'supplement_driver_literal': 'MATCH', 'runtime_execution': 'NOT_RUN_BY_THIS_VERIFIER', 'native_host_message_envelope': 'NOT_LOCATED'}

if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('--repository', type=Path, required=True)
    parser.add_argument('--base-package', type=Path, required=True)
    parser.add_argument('--historical-driver', type=Path, required=True)
    parser.add_argument('--output', type=Path, required=True)
    args = parser.parse_args()
    receipt = verify(args.repository, args.base_package, args.historical_driver)
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(receipt, ensure_ascii=False, indent=2) + '\n')
    print('GENESIS_KNOWLEDGE_INTEGRITY_JSON=' + json.dumps(receipt, ensure_ascii=False, sort_keys=True))
