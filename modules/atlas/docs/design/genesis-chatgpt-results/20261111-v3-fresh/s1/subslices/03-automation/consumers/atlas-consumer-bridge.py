"""Quota wrapper around the released Atlas CLI; never implements an Atlas reader."""
from pathlib import Path
from datetime import datetime, timezone
import hashlib
import json
import subprocess
import sys

W = Path(__file__).resolve().parents[1]
P = W / 'payload'
PUBLIC = json.loads((P / 'consumers/public-cases.json').read_text())
LIMITS = PUBLIC['limits']
CASES = {row['id'] for row in PUBLIC['cases']}
if len(sys.argv) != 4:
    raise SystemExit('usage: atlas-consumer-bridge.py CASE index|read QUERY_JSON')
case_id, mode, encoded = sys.argv[1:]
if case_id not in CASES or mode not in {'index', 'read'}:
    raise SystemExit('unknown frozen case or forbidden operation')
query = json.loads(encoded)
if not isinstance(query, dict) or query.get('scope') != 'orchestra.s1':
    raise SystemExit('query must address orchestra.s1')
allowed = {'scope', 'need'} if mode == 'index' else {'scope', 'need', 'key', 'maxBytes', 'section', 'historical'}
if set(query) - allowed:
    raise SystemExit('unexpected query fields; official CLI validates all remaining semantics')

# A final whole-selection attempt precedes consumption, even when it is blocked.
preparation_path = P / 'receipts/native-prepare-final.json'
preparation = json.loads(preparation_path.read_text())
directory = P / 'consumers' / case_id / 'bridge'
directory.mkdir(parents=True, exist_ok=True)
prior = [json.loads(path.read_text()) for path in sorted(directory.glob('call-*.json'))]
calls = sum(row['mode'] == mode for row in prior)
limit = LIMITS['max_index_calls_per_case' if mode == 'index' else 'max_read_calls_per_case']
if calls >= limit:
    raise SystemExit(f'quota exhausted: {mode}')
remaining = LIMITS['max_returned_utf8_bytes_per_case'] - sum(row['returned_utf8_bytes'] for row in prior)
if remaining < 1024:
    raise SystemExit('returned-byte quota exhausted')
if mode == 'read':
    bound = query.get('maxBytes')
    if not isinstance(bound, int) or isinstance(bound, bool) or not 1 <= bound <= remaining:
        raise SystemExit('read maxBytes must be positive and fit the remaining case budget')
number = len(prior) + 1
query_path = directory / f'query-{number:02}.json'
query_bytes = (json.dumps(query, ensure_ascii=False, indent=2) + '\n').encode()
query_path.write_bytes(query_bytes)
command = [str(W / 'runtime-preflight/bun-runtime/node_modules/.bin/bun'),
           'scripts/genesis-native.ts', mode, str(W / 'native-source'), str(query_path)]
cwd = W / 'runtime-preflight/candidate/modules/atlas'
started = datetime.now(timezone.utc).isoformat()
completed = subprocess.run(command, cwd=cwd, capture_output=True, timeout=60)
stdout = completed.stdout.decode('utf-8', errors='strict')
stderr = completed.stderr.decode('utf-8', errors='strict')
(directory / f'call-{number:02}.stdout').write_bytes(completed.stdout)
(directory / f'call-{number:02}.stderr').write_bytes(completed.stderr)
forward = {
    'case_id': case_id, 'call': number, 'operation': mode,
    'query': query, 'exit_code': completed.returncode,
    'stdout': stdout, 'stderr': stderr,
}
forward_bytes = (json.dumps(forward, ensure_ascii=False, indent=2) + '\n').encode()
within_budget = len(forward_bytes) <= remaining
if not within_budget:
    forward = {
        'case_id': case_id, 'call': number, 'operation': mode,
        'bridge_state': 'RESPONSE_NOT_FORWARDED_CASE_BYTE_LIMIT',
        'actual_response_utf8_bytes': len(forward_bytes),
        'remaining_utf8_bytes': remaining,
        'notice': 'The runtime response is preserved verbatim in the receipt; no content was truncated or substituted as an Atlas answer.',
    }
    forward_bytes = (json.dumps(forward, ensure_ascii=False, indent=2) + '\n').encode()
    if len(forward_bytes) > remaining:
        raise RuntimeError('bridge metadata exceeds reserved budget; no response forwarded')
forward_path = directory / f'forward-{number:02}.json'
forward_path.write_bytes(forward_bytes)
receipt = {
    'schema': 's1-03-real-atlas-consumer-bridge/v1',
    'case_id': case_id, 'call': number, 'mode': mode, 'query': query,
    'command': command, 'cwd': str(cwd), 'started_utc': started,
    'candidate_revision': 'e3a8ab8cf56dbff1ee91272df51ffa398d882aa1',
    'source_root': str(W / 'native-source'),
    'source_access_granted_to_consumer': False,
    'oracle_access_granted_to_consumer': False,
    'isolation': 'fresh context plus faithful principal bridge; not a filesystem sandbox',
    'preparation_receipt_sha256': hashlib.sha256(preparation_path.read_bytes()).hexdigest(),
    'prepared_file_exists': preparation['prepared_file_exists'],
    'exit_code': completed.returncode, 'stdout': stdout, 'stderr': stderr,
    'query_sha256': hashlib.sha256(query_bytes).hexdigest(),
    'runtime_stdout_bytes': len(completed.stdout), 'runtime_stderr_bytes': len(completed.stderr),
    'forwarded_runtime_response': within_budget,
    'returned_utf8_bytes': len(forward_bytes),
    'forward_sha256': hashlib.sha256(forward_bytes).hexdigest(),
    'case_returned_utf8_bytes_total': LIMITS['max_returned_utf8_bytes_per_case'] - remaining + len(forward_bytes),
    'not_a_domain_case_pass': True,
}
(directory / f'call-{number:02}.json').write_text(json.dumps(receipt, ensure_ascii=False, indent=2) + '\n')
sys.stdout.write(forward_bytes.decode())
