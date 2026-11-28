#!/usr/bin/env python3
"""Replay authorized per-case Atlas reader calls; records traces, not consumer judgments."""
import argparse
import hashlib
import json
import os
from pathlib import Path
import re
import subprocess
import time
import base64

CANDIDATE = 'ade18f60d8b143fc90fae24bc5c6cd1c14d1e56756800f14b65d19f7eacdf542'
MANIFEST = '5cbb56e97ad62901f5ec673d6bbf2559201cc54bc6f7faa33af92c4f825c7bbf'
GENERATION = '146c26228238c2ff0f4b274c1b0cc43b573df54b2529fcb68859820950f805ac'
PLAN = 'da5f06f6a2978cb641263900027b9d4770a607c22c6b422e04cb3490db817585'
OBLIGATIONS = '4c76c66cedd2f82c650e6aaee4d486cbd530091f98c90d137fbff11693900059'
RUNTIME = '9b0188b2be5ea69638dff8a44e3e931b4d6d8b10'
SCOPE = 'orchestra.interfaces'
PREFIX = 'modules/atlas/docs/design/genesis-chatgpt-results/20261111-v3-fresh/s2/resume-20261128/evaluation-v2'


def require(condition, message):
    if not condition:
        raise ValueError(message)


def digest(data):
    return hashlib.sha256(data).hexdigest()


def write(path, data):
    with path.open('xb') as stream:
        stream.write(data)


def encoded(value):
    return (json.dumps(value, ensure_ascii=False, indent=2) + '\n').encode()


def ledgers(root):
    return {p.name: p.read_bytes() for p in sorted((root / '.atlas').glob('evaluation-budget-*.json'))}


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--runtime', required=True, type=Path)
    parser.add_argument('--source', required=True, type=Path)
    parser.add_argument('--prepared', required=True, type=Path)
    parser.add_argument('--admission', required=True, type=Path)
    parser.add_argument('--routing', required=True, type=Path)
    parser.add_argument('--output', required=True, type=Path)
    parser.add_argument('--phase', choices=('initial', 'followup', 'recheck'), default='initial')
    parser.add_argument('--wait-followup', action='store_true')
    args = parser.parse_args()
    require(os.environ.get('GITHUB_ACTIONS') == 'true' and os.environ.get('GITHUB_EVENT_NAME') == 'workflow_dispatch'
            and os.environ.get('GITHUB_REPOSITORY') == 'gustavomhss/hugr-orchestra'
            and os.environ.get('GITHUB_REF') == 'refs/heads/genesis-interfaces-resume'
            and os.environ.get('RUN_CONSUMER_ROUTES') == 'true', 'explicit hosted dispatch required')
    runner = Path(os.environ['RUNNER_TEMP']).resolve()
    base = runner / 'genesis-s2-46158062855-1'
    runtime = args.runtime.resolve(strict=True)
    root = args.source.resolve(strict=True)
    prepared_path = args.prepared.resolve(strict=True)
    admission = args.admission.resolve(strict=True)
    out = args.output.absolute()
    require((runtime, root, prepared_path, admission, out) == (base / 'runtime', base / 'evidence/run/corpus', base / 'evidence/run/prepared.json', base / 'evidence/admission', base / 'evidence/consumer-routes'), 'unexpected isolated paths')
    require(subprocess.check_output(['git', '-C', str(runtime), 'rev-parse', 'HEAD'], text=True).strip() == RUNTIME, 'runtime mismatch')
    raw = prepared_path.read_bytes()
    require(digest(raw) == '9570cd95aed8803e3198dd897f0c8845e84aa88d7c3d6cd7b9b107c6ec0accbd', 'prepared bytes differ')
    prepared = json.loads(raw)
    candidate = prepared['candidate']
    require(prepared['candidate_id'] == CANDIDATE and candidate['repo_root'] == str(root)
            and candidate['evaluation'] == {'phase': 'evaluation', 'evaluationPlan': PLAN, 'obligationSet': OBLIGATIONS}, 'candidate identity mismatch')
    summary = json.loads((admission / 'summary.json').read_bytes())
    require(summary['state'] == 'EVALUATION_ADMITTED' and summary['candidate_id'] == CANDIDATE
            and summary['generation'] == GENERATION and summary['ownership'] == MANIFEST
            and summary['binding_sha256'] == 'ffa478f4dca541fd6eb829b99c0ec69909e562a81cff1d2c6a79b67c0c208430', 'replayed admission differs from original run')
    emission = json.loads((admission / 'admit.stdout.json').read_bytes())
    require(emission['ownership'] == MANIFEST and emission['emission']['ok'] is True and emission['emission']['data']['emitted'] is True, 'actual admission emission missing')
    marker = json.loads((root / '.atlas/evaluation-store.json').read_bytes())
    require(all(marker.get(k) == v for k, v in {'root': str(root), 'evaluationPlan': PLAN, 'obligationSet': OBLIGATIONS, 'evaluationCandidate': CANDIDATE, 'generation': GENERATION, 'scope': SCOPE}.items()), 'marker differs')
    original_policy = json.loads((root / '.atlas/evaluation-policy.json').read_bytes())
    require(original_policy['operations'] == ['admit'] and original_policy['consumer'] is None, 'admission policy mismatch')
    if args.phase in ('initial', 'recheck') and not args.wait_followup:
        require(not ledgers(root), 'fresh per-case ledgers required')
    plan = json.loads((root / PREFIX / 'evaluation-plan.json').read_bytes())
    modes = plan['consumer_modes']
    require(len(plan['consumer_ids']) == 14 and set(plan['consumer_ids']) == set(modes), 'unexpected frozen plan cases')
    repository = Path(os.environ['GITHUB_WORKSPACE']).resolve(strict=True)
    require(subprocess.check_output(['git', '-C', str(repository), 'rev-parse', 'HEAD'], text=True).strip() == os.environ['GITHUB_SHA'], 'checkout head differs')
    routing_path = args.routing.resolve(strict=True)
    relative = routing_path.relative_to(repository).as_posix()
    expected_routing = 'consumer-recheck.json' if args.phase == 'recheck' else 'consumer-routing.json'
    require(relative == 'script/genesis-s2/' + expected_routing, 'unexpected routing location')
    routing_bytes = routing_path.read_bytes()
    require(routing_bytes == subprocess.check_output(['git', '-C', str(repository), 'show', 'HEAD:' + relative]), 'routing differs from committed source')
    routing_hash = digest(routing_bytes)
    if args.wait_followup:
        require(args.phase == 'followup' and (out / 'initial/summary.json').is_file(), 'initial wave not complete')
        attempts = []
        accepted = None
        for number in range(1, 21):
            result = subprocess.run(['gh', 'api', 'repos/gustavomhss/hugr-orchestra/contents/script/genesis-s2/consumer-followup.json?ref=genesis-interfaces-resume'], capture_output=True, check=False)
            record = {'attempt': number, 'exit_code': result.returncode, 'response_sha256': digest(result.stdout), 'accepted': False}
            if result.returncode == 0:
                try:
                    response = json.loads(result.stdout)
                    raw = base64.b64decode(response['content'], validate=False)
                    require(len(raw) <= 100000, 'followup too large')
                    proposed = json.loads(raw)
                    if proposed.get('schema') == 'genesis-s2-consumer-followup/v1' and proposed.get('candidate_id') == CANDIDATE and proposed.get('initial_route_sha256') == routing_hash and str(proposed.get('run_id')) == os.environ['GITHUB_RUN_ID']:
                        accepted = raw
                        record['accepted'] = True
                        record['git_blob'] = response.get('sha')
                except (ValueError, KeyError, TypeError):
                    pass
            attempts.append(record)
            if accepted is not None:
                break
            if number < 20:
                time.sleep(20)
        write(out / 'followup-poll.json', encoded({'attempts': attempts, 'accepted': accepted is not None, 'initial_route_sha256': routing_hash, 'run_id': os.environ['GITHUB_RUN_ID']}))
        if accepted is None:
            return
        write(out / 'followup-routing.json', accepted)
        return
    if args.phase in ('initial', 'recheck'):
        route_data = routing_bytes
    else:
        require((out / 'initial/summary.json').is_file(), 'initial wave incomplete')
        if not (out / 'followup-routing.json').is_file():
            return
        route_data = (out / 'followup-routing.json').read_bytes()
    routing = json.loads(route_data)
    if args.phase == 'initial':
        require(set(routing) == {'schema', 'candidate_id', 'cases'} and routing['schema'] == 'genesis-s2-consumer-routing/v1' and routing['candidate_id'] == CANDIDATE, 'routing schema/candidate mismatch')
    elif args.phase == 'recheck':
        require(set(routing) == {'schema', 'candidate_id', 'prior_run', 'prior_checkpoint_sha256', 'cases'}
                and routing['schema'] == 'genesis-s2-consumer-recheck/v1' and routing['candidate_id'] == CANDIDATE
                and routing['prior_run'] == 46165708773, 'recheck routing identity mismatch')
        prior = repository / PREFIX / '../runtime-followup/consumers-run-46165708773/checkpoint.json'
        require(digest(prior.read_bytes()) == routing['prior_checkpoint_sha256'], 'prior attempt drift')
        require(len(routing['cases']) == 1 and routing['cases'][0]['id'] == 'S2-I2U', 'recheck must be limited to S2-I2U')
    else:
        require(set(routing) == {'schema', 'candidate_id', 'initial_route_sha256', 'run_id', 'cases'} and routing['schema'] == 'genesis-s2-consumer-followup/v1' and routing['candidate_id'] == CANDIDATE and routing['initial_route_sha256'] == routing_hash and str(routing['run_id']) == os.environ['GITHUB_RUN_ID'], 'followup binding mismatch')
    cases = routing['cases']
    require(isinstance(cases, list) and len({case['id'] for case in cases}) == len(cases) and {case['id'] for case in cases} <= set(plan['consumer_ids']) and (args.phase != 'initial' or len(cases) == 14), 'routing cases mismatch')
    for case in cases:
        require(set(case) == {'id', 'mode', 'calls'} and case['mode'] == modes[case['id']] and isinstance(case['calls'], list) and 1 <= len(case['calls']) <= 12, 'case mode/calls mismatch')
        for call in case['calls']:
            require(set(call) == {'operation', 'query'} and call['operation'] in ('index', 'read') and isinstance(call['query'], dict), 'invalid call')
            query = call['query']
            require(query.get('scope') == SCOPE, 'invalid scope')
            if call['operation'] == 'index':
                require(set(query) == {'scope', 'need'} and query['need'] in ('entry', 'ownership', 'maintenance', 'operational', 'flow', 'evidence', 'component'), 'invalid index query')
            else:
                require(set(query) <= {'scope', 'need', 'key', 'section', 'maxBytes', 'historical'} and ('need' in query) != ('key' in query)
                        and type(query.get('maxBytes')) is int and 1 <= query['maxBytes'] <= 9007199254740991, 'invalid read query')
                require('need' not in query or query['need'] in ('entry', 'ownership', 'maintenance', 'operational', 'flow', 'evidence', 'component'), 'invalid read need')
                require('historical' not in query or query['historical'] is True, 'invalid historical')
    if args.phase in ('initial', 'recheck'):
        out.mkdir()
    wave = out / args.phase
    wave.mkdir()
    write(wave / 'routing.json', route_data)
    write(wave / 'source.json', encoded({'candidate_id': CANDIDATE, 'runtime': RUNTIME, 'original_admission_run': 46162067144, 'original_manifest': MANIFEST, 'generation': GENERATION, 'replay_run': os.environ['GITHUB_RUN_ID'], 'replay_attempt': os.environ['GITHUB_RUN_ATTEMPT'], 'commit': os.environ['GITHUB_SHA'], 'routing_sha256': digest(route_data), 'initial_route_sha256': routing_hash, 'phase': args.phase, 'actor': '/root', 'actor_limit': 'nominal operator, not independent consumer identity', 'claim': 'literal routed CLI traces only; no consumer or judge decision'}))
    policy_path = root / '.atlas/evaluation-policy.json'
    original_policy_bytes = policy_path.read_bytes()
    traces = []
    try:
        for case in cases:
            case_out = wave / case['id']
            case_out.mkdir()
            before_case = ledgers(root)
            if args.phase in ('initial', 'recheck'):
                require(all(json.loads(raw)['consumer'] != case['id'] for raw in before_case.values()), 'case ledger already exists')
            policy = {**original_policy, 'actor': '/root', 'operations': ['index', 'read'], 'consumer': {'id': case['id'], 'mode': case['mode']}}
            policy_path.write_bytes(encoded(policy))
            require(json.loads(policy_path.read_bytes()) == policy, 'policy write mismatch')
            write(case_out / 'policy.json', policy_path.read_bytes())
            write(case_out / 'bounds.json', encoded(plan['read_limits'][case['mode']]))
            for number, call in enumerate(case['calls'], 1):
                stem = f'{number:02d}-{call["operation"]}'
                query_path = case_out / (stem + '.query.json')
                write(query_path, encoded(call['query']))
                before = ledgers(root)
                env = os.environ.copy()
                env['ATLAS_ACTOR'] = '/root'
                env.pop('ATLAS_RATIFY_TOKEN', None)
                argv = ['bun', 'scripts/genesis-evaluation.ts', call['operation'], str(root), str(query_path)]
                result = subprocess.run(argv, cwd=runtime / 'modules/atlas', env=env, stdin=subprocess.DEVNULL, capture_output=True, check=False)
                write(case_out / (stem + '.stdout.json'), result.stdout)
                write(case_out / (stem + '.stderr.txt'), result.stderr)
                after = ledgers(root)
                require(set(before) <= set(after), 'budget ledger removed')
                changes = {name for name in after if before.get(name) != after[name]}
                for name in changes:
                    budget = json.loads(after[name])
                    require(budget['candidate'] == CANDIDATE and budget['generation'] == GENERATION and budget['consumer'] == case['id'] and budget['mode'] == case['mode'], 'budget isolation mismatch')
                require(len(changes) <= 1, 'multiple ledgers changed')
                for name in changes:
                    write(case_out / (stem + '.' + name), after[name])
                write(case_out / (stem + '.budgets-before.json'), encoded({name: json.loads(raw) for name, raw in before.items()}))
                write(case_out / (stem + '.budgets-after.json'), encoded({name: json.loads(raw) for name, raw in after.items()}))
                receipt = {'argv': argv, 'actor': '/root', 'exit_code': result.returncode, 'query_sha256': digest(query_path.read_bytes()), 'stdout_sha256': digest(result.stdout), 'stderr_sha256': digest(result.stderr), 'changed_budget_files': {name: digest(after[name]) for name in sorted(changes)}}
                write(case_out / (stem + '.receipt.json'), encoded(receipt))
                traces.append({'case': case['id'], 'operation': call['operation'], 'exit_code': result.returncode, 'receipt_sha256': digest(encoded(receipt))})
            final = ledgers(root)
            matching = [name for name, raw in final.items() if json.loads(raw)['consumer'] == case['id']]
            require(len(matching) <= 1 and all(before_case[name] == final[name] for name in before_case if json.loads(before_case[name])['consumer'] != case['id']), 'case modified another budget')
            write(case_out / 'case-ledger.json', encoded({'ledger_files': matching, 'ledgers': {name: json.loads(final[name]) for name in matching}, 'status': 'ROUTED_TOOL_CALLS_ONLY', 'consumer_decision': 'NOT_RECORDED'}))
        write(wave / 'summary.json', encoded({'state': 'ROUTED_CLI_TRACES', 'candidate_id': CANDIDATE, 'manifest': MANIFEST, 'cases': len(cases), 'calls': traces, 'consumer_decisions': 'NOT_RUN', 'judgments': 'NOT_RUN', 'S2-U1': 'NOT_RUN'}))
    finally:
        policy_path.write_bytes(original_policy_bytes)
        write(wave / 'final-budget-ledgers.json', encoded({name: json.loads(raw) for name, raw in ledgers(root).items()}))
        write(wave / 'restored-admit-policy.json', policy_path.read_bytes())


if __name__ == '__main__':
    main()
