#!/usr/bin/env python3
"""PREPARED ONLY: execute explicitly against an identified compiled release artifact.

No source imports, dependency installation, browser, real credentials or live provider.
Config/API references are frozen at 3e255c8f030b3e7202a9ac89050d695464f0cddf:
core/config.ts, config/{provider,agent}.ts, schema/{provider,model,permission}.ts,
protocol/groups/session.ts, core/tool/read.ts, core/plugin/provider/openai-compatible.ts.
"""
import argparse
import base64
import hashlib
import http.server
import json
import os
from pathlib import Path
import secrets
import socket
import subprocess
import sys
import tempfile
import threading
import time
import traceback
import urllib.error
import urllib.request

SOURCE = '3e255c8f030b3e7202a9ac89050d695464f0cddf'
PROVIDER = 'runtime_validation'
MODEL = 'runtime-model'
AGENT = 'runtime_validation'
DUMMY = 'orchestra-runtime-dummy-not-a-real-credential'
FIXTURE = 'ISOLATED_RUNTIME_READ_SENTINEL_037'
FIRST = 'RUNTIME_FIRST_037'
SECOND = 'RUNTIME_SECOND_037'
REPLACEMENT = 'RUNTIME_REPLACEMENT_037'
STOP = 'RUNTIME_STOP_037'
ANSWER_FIRST = 'runtime-first-answer-037'
ANSWER_SECOND = 'runtime-second-answer-037'
ANSWER_REPLACEMENT = 'runtime-replacement-answer-037'


class QualificationError(Exception):
    def __init__(self, category, message):
        super().__init__(message)
        self.category = category


def require(condition, message, category='product'):
    if not condition:
        raise QualificationError(category, message)


def canonical(value):
    return json.dumps(value, sort_keys=True, separators=(',', ':'))


def content_text(value):
    if isinstance(value, str):
        return value
    if isinstance(value, list):
        return '\n'.join(content_text(item) for item in value)
    if isinstance(value, dict):
        return str(value.get('text', value.get('content', '')))
    return ''


class ProviderState:
    def __init__(self):
        self.requests = []
        self.errors = []
        self.error_categories = []
        self.lock = threading.Lock()
        self.stop_entered = threading.Event()
        self.stop_release = threading.Event()
        self.read_confirmed = False

    def observe(self, request):
        with self.lock:
            self.requests.append(request)
            require(len(self.requests) <= 32, 'Unexpected provider request loop')

    def record_error(self, error):
        with self.lock:
            self.errors.append(str(error))
            self.error_categories.append(getattr(error, 'category', 'setup'))

    def snapshot(self):
        with self.lock:
            return list(self.requests)


class ProviderHandler(http.server.BaseHTTPRequestHandler):
    protocol_version = 'HTTP/1.1'

    def log_message(self, *_):
        pass

    def do_POST(self):
        state = self.server.state
        try:
            require(self.path == '/v1/chat/completions', 'Unexpected provider URL: ' + self.path, 'setup')
            require(self.headers.get('authorization') == 'Bearer ' + DUMMY, 'Dummy provider credential missing', 'setup')
            size = int(self.headers.get('content-length', '0'))
            require(0 < size < 4_000_000, 'Invalid provider body size', 'setup')
            body = json.loads(self.rfile.read(size))
            require(body.get('model') == MODEL, 'Unexpected provider model', 'setup')
            messages = body.get('messages')
            require(isinstance(messages, list), 'Chat messages missing', 'setup')
            state.observe(body)
            users = [i for i, item in enumerate(messages) if item.get('role') == 'user']
            last_user = users[-1] if users else -1
            text = content_text(messages[last_user].get('content')) if last_user >= 0 else ''
            tool = None
            title = bool(messages and messages[0].get('role') == 'system'
                         and content_text(messages[0].get('content')).startswith('You are a title generator.'))
            if title:
                require(body.get('tools', []) == [], 'Title request unexpectedly advertised tools', 'setup')
                answer = 'Runtime qualification'
            elif FIRST in text:
                results = [item for item in messages[last_user + 1:] if item.get('role') == 'tool']
                if results:
                    require(FIXTURE in canonical(results), 'Real read result did not reach next provider turn')
                    state.read_confirmed = True
                    answer = ANSWER_FIRST
                else:
                    names = [item.get('function', {}).get('name') for item in body.get('tools', [])]
                    require('read' in names, 'Actual read tool was not advertised')
                    tool = {'index': 0, 'id': 'call_runtime_read_037', 'type': 'function',
                            'function': {'name': 'read', 'arguments': json.dumps({'path': 'validation.txt'})}}
                    answer = None
            elif SECOND in text:
                require(ANSWER_FIRST in canonical(messages), 'Second turn omitted first projected assistant history')
                answer = ANSWER_SECOND
            elif REPLACEMENT in text:
                require(ANSWER_FIRST in canonical(messages), 'Replacement omitted retained first turn')
                require(SECOND not in canonical(messages) and ANSWER_SECOND not in canonical(messages),
                        'Replacement lowered reverted history to provider')
                answer = ANSWER_REPLACEMENT
            elif STOP in text:
                answer = None
            else:
                # Optional built-in title generation is tool-less and has independent prompt text.
                answer = 'Runtime qualification'
            if body.get('stream') is not True:
                require(tool is None and (title or STOP not in text), 'Qualification turn unexpectedly requested nonstream generation', 'setup')
                data = json.dumps({'id': 'runtime-generate', 'object': 'chat.completion', 'created': int(time.time()),
                                   'model': MODEL, 'choices': [{'index': 0, 'message': {'role': 'assistant', 'content': answer},
                                                               'finish_reason': 'stop'}],
                                   'usage': {'prompt_tokens': 100, 'completion_tokens': 10, 'total_tokens': 110}}).encode()
                self.send_response(200)
                self.send_header('content-type', 'application/json')
                self.send_header('content-length', str(len(data)))
                self.end_headers()
                self.wfile.write(data)
                return
            self.send_response(200)
            self.send_header('content-type', 'text/event-stream')
            self.send_header('cache-control', 'no-cache')
            self.send_header('connection', 'close')
            self.end_headers()
            self.close_connection = True
            def chunk(delta, finish=None, usage=None):
                payload = {'id': 'runtime-chat', 'object': 'chat.completion.chunk', 'created': int(time.time()),
                           'model': MODEL, 'choices': [{'index': 0, 'delta': delta, 'finish_reason': finish}]}
                if usage:
                    payload['usage'] = usage
                self.wfile.write(('data: ' + json.dumps(payload) + '\n\n').encode())
                self.wfile.flush()
            chunk({'role': 'assistant', 'content': ''})
            if not title and STOP in text:
                state.stop_entered.set()
                require(state.stop_release.wait(60), 'Stop fixture was not released', 'setup')
                return  # Deliberately unfinished stream: only the real interrupt cancels this turn.
            if tool:
                chunk({'tool_calls': [tool]})
            else:
                chunk({'content': answer})
            chunk({}, 'tool_calls' if tool else 'stop',
                  {'prompt_tokens': 100, 'completion_tokens': 10, 'total_tokens': 110})
            self.wfile.write(b'data: [DONE]\n\n')
            self.wfile.flush()
        except (BrokenPipeError, ConnectionResetError):
            pass  # A cancelled real CLI request owns the peer socket.
        except Exception as error:
            state.record_error(error)
            self.close_connection = True
            try:
                self.send_error(500, 'Runtime qualification provider refused request')
            except (BrokenPipeError, ConnectionResetError):
                pass


def free_port():
    with socket.socket() as probe:
        probe.bind(('127.0.0.1', 0))
        return probe.getsockname()[1]


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--binary', type=Path, required=True)
    parser.add_argument('--version', required=True)
    parser.add_argument('--source', required=True)
    parser.add_argument('--expected-sha256', required=True)
    parser.add_argument('--evidence', type=Path, required=True)
    parser.add_argument('--allow-no-os-network-sandbox', action='store_true',
                        help='Explicitly accept and record lack of OS egress enforcement on non-macOS hosts')
    args = parser.parse_args()
    result = {'status': 'failed', 'version': args.version, 'source': args.source,
              'binary': str(args.binary.resolve()), 'checks': {}, 'limitations': [],
              'preparedFromSource': SOURCE}
    proc = None
    logs = []
    mock = None
    state = ProviderState()
    phase = 'artifact-setup'
    owned = None
    evidence = args.evidence.expanduser().resolve()
    evidence.parent.mkdir(parents=True, exist_ok=True)
    try:
        require(args.source == SOURCE, 'Source argument differs from schema-verified frozen source', 'setup')
        binary = args.binary.expanduser().resolve(strict=True)
        require(binary.is_file() and os.access(binary, os.X_OK), 'Binary is not executable', 'setup')
        digest = hashlib.file_digest(binary.open('rb'), 'sha256').hexdigest()
        result['binarySha256'] = digest
        require(digest == args.expected_sha256.lower(), 'Binary hash differs from supplied artifact identity', 'setup')
        owned = Path(tempfile.mkdtemp(prefix='runtime-session-', dir=evidence.parent))
        result['isolatedRoot'] = str(owned)
        for name in ['home', 'tmp', 'config', 'data', 'cache', 'state', 'workspace']:
            (owned / name).mkdir(mode=0o700)
        workspace = owned / 'workspace'
        (workspace / 'validation.txt').write_text(FIXTURE + '\n')
        env = {'PATH': '/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin', 'HOME': str(owned / 'home'),
               'USER': 'orchestra-runtime-validation', 'LOGNAME': 'orchestra-runtime-validation',
               'LANG': 'C', 'LC_ALL': 'C', 'LC_CTYPE': 'C', 'SHELL': '/bin/sh', 'NO_COLOR': '1',
               'TMPDIR': str(owned / 'tmp'), 'XDG_CONFIG_HOME': str(owned / 'config'),
               'XDG_DATA_HOME': str(owned / 'data'), 'XDG_CACHE_HOME': str(owned / 'cache'),
               'XDG_STATE_HOME': str(owned / 'state'), 'ORCHESTRA_CONFIG_DIR': str(owned / 'config'),
               'ORCHESTRA_TEST_HOME': str(owned / 'home'), 'ORCHESTRA_DB': str(owned / 'data' / 'orchestra.db'),
               'ORCHESTRA_CREDENTIAL_KEY_FILE': str(owned / 'credential.key'), 'ORCHESTRA_INHERIT_CREDENTIALS': '0',
               'ORCHESTRA_DISABLE_AUTOUPDATE': '1', 'ORCHESTRA_DISABLE_MODELS_FETCH': '1',
               'ORCHESTRA_DISABLE_AUTOCOMPACT': '1', 'ORCHESTRA_DISABLE_TERMINAL_TITLE': '1',
               'ORCHESTRA_DISABLE_FFF': '1', 'ORCHESTRA_EXPERIMENTAL_DISABLE_FILEWATCHER': '1'}
        for command in [['git', 'init', '-q'], ['git', 'add', 'validation.txt'],
                        ['git', '-c', 'user.name=Runtime Qualification', '-c', 'user.email=runtime@example.invalid',
                         'commit', '-q', '-m', 'isolated runtime fixture']]:
            subprocess.run(command, cwd=workspace, env=env, check=True, timeout=15, capture_output=True)
        mock = http.server.ThreadingHTTPServer(('127.0.0.1', 0), ProviderHandler)
        mock.daemon_threads = True
        mock.state = state
        threading.Thread(target=mock.serve_forever, daemon=True).start()
        provider_url = 'http://127.0.0.1:' + str(mock.server_address[1]) + '/v1'
        rules = [{'action': '*', 'resource': '*', 'effect': 'deny'},
                 {'action': 'read', 'resource': '*', 'effect': 'allow'}]
        config = {'model': PROVIDER + '/' + MODEL, 'default_agent': AGENT, 'permissions': rules,
                  'snapshots': True, 'plugins': [], 'lsp': False,
                  'agents': {AGENT: {'name': 'Runtime validation', 'mode': 'primary', 'engine': 'orchestra',
                                    'system': 'Use only the requested read tool, then answer. No external services.',
                                    'model': PROVIDER + '/' + MODEL, 'steps': 8, 'permissions': rules}},
                  'providers': {PROVIDER: {'name': 'Isolated loopback runtime fixture',
                                          'api': {'type': 'aisdk', 'package': '@ai-sdk/openai-compatible',
                                                  'url': provider_url, 'settings': {'apiKey': DUMMY}},
                                          'models': {MODEL: {'api': {'id': MODEL},
                                                             'capabilities': {'tools': True, 'input': ['text'], 'output': ['text']},
                                                             'limit': {'context': 128000, 'output': 4096}}}}}}
        # Global user config, never an untrusted project configuration.
        (owned / 'config' / 'orchestra.json').write_text(json.dumps(config, indent=2) + '\n')
        sandbox = Path('/usr/bin/sandbox-exec')
        wrapper = []
        if sys.platform == 'darwin' and sandbox.exists():
            profile = owned / 'loopback.sb'
            profile.write_text('(version 1)\n(allow default)\n(deny network*)\n'
                               '(allow network-outbound (remote ip "localhost:*"))\n'
                               '(allow network-inbound (local ip "localhost:*"))\n'
                               '(allow network-bind (local ip "localhost:*"))\n')
            wrapper = [str(sandbox), '-f', str(profile)]
            result['networkIsolation'] = 'macOS seatbelt denies network except loopback'
        else:
            require(args.allow_no_os_network_sandbox, 'OS egress sandbox unavailable; explicit override required', 'setup')
            result['networkIsolation'] = 'configured loopback provider; no OS egress enforcement'
            result['limitations'].append('No OS egress enforcement; model fetch and update disabled, environment sanitized')
        version_run = subprocess.run(wrapper + [str(binary), '--version'], cwd=workspace, env=env,
                                     capture_output=True, text=True, timeout=30)
        require(version_run.returncode == 0, 'Artifact --version failed: ' + version_run.stderr[-1000:], 'setup')
        require(args.version in version_run.stdout.split(), 'Artifact version mismatch: ' + version_run.stdout, 'setup')
        result['checks']['artifactVersionAndHash'] = 'pass'
        password = secrets.token_urlsafe(24)
        env.update(ORCHESTRA_SERVER_PASSWORD=password, ORCHESTRA_SERVER_USERNAME='orchestra')
        port = free_port()
        base_url = 'http://127.0.0.1:' + str(port)
        authorization = 'Basic ' + base64.b64encode(('orchestra:' + password).encode()).decode()
        opener = urllib.request.build_opener(urllib.request.ProxyHandler({}))

        def request(path, body=None, method=None, timeout=10, expected=200):
            data = None if body is None else json.dumps(body).encode()
            req = urllib.request.Request(base_url + path, data=data, method=method,
                                         headers={'authorization': authorization, 'content-type': 'application/json'})
            try:
                with opener.open(req, timeout=timeout) as response:
                    status, raw = response.status, response.read()
            except urllib.error.HTTPError as error:
                status, raw = error.code, error.read()
            require(status == expected or (expected == 200 and status == 204),
                    'API ' + str(method or ('POST' if body is not None else 'GET')) + ' ' + path +
                    ' returned ' + str(status) + ': ' + raw.decode(errors='replace')[:1500])
            return json.loads(raw) if raw else None

        def start(index):
            nonlocal proc
            log = (owned / ('serve-' + str(index) + '.log')).open('wb')
            logs.append(log)
            proc = subprocess.Popen(wrapper + [str(binary), 'serve', '--hostname', '127.0.0.1', '--port', str(port)],
                                    cwd=workspace, env=env, stdout=log, stderr=subprocess.STDOUT, start_new_session=True)
            deadline = time.monotonic() + 60
            while time.monotonic() < deadline:
                require(proc.poll() is None, 'Serve exited; see ' + str(log.name), 'setup')
                try:
                    health = request('/api/health', timeout=2)
                    require(health.get('healthy') and health.get('version') == args.version,
                            'Health version/healthy mismatch', 'setup')
                    result.setdefault('startupPids', []).append(proc.pid)
                    return
                except (urllib.error.URLError, ConnectionError, TimeoutError):
                    time.sleep(0.2)
            raise QualificationError('setup', 'Serve health deadline exceeded')

        def initialize_location(index):
            from urllib.parse import urlencode
            # The public Location route boots the same full Location graph used
            # by prompt hooks. Its cold work has its own measured, failing bound;
            # prompt and retry request deadlines remain unchanged at 10 seconds.
            measurement = {'serverStart': index, 'source': args.source,
                           'binarySha256': digest, 'timeoutSeconds': 60,
                           'profile': {'home': env['HOME'], 'config': env['ORCHESTRA_CONFIG_DIR'],
                                       'data': env['XDG_DATA_HOME'], 'cache': env['XDG_CACHE_HOME'],
                                       'workspace': str(workspace)},
                           'status': 'failed', 'startedUnixTime': time.time()}
            result.setdefault('locationInitialization', []).append(measurement)
            started = time.monotonic()
            try:
                location = request('/api/location?' + urlencode({'location[directory]': str(workspace)}), timeout=60)
                require(isinstance(location, dict), 'Location initializer did not return Location.Info', 'setup')
                require(isinstance(location.get('directory'), str)
                        and Path(location['directory']).resolve() == workspace.resolve(),
                        'Location initializer resolved another workspace', 'setup')
                project = location.get('project', {})
                require(isinstance(project.get('directory'), str)
                        and Path(project['directory']).resolve() == workspace.resolve()
                        and isinstance(project.get('id'), str) and bool(project['id']),
                        'Location initializer resolved another project', 'setup')
                require(location.get('workspaceID') is None,
                        'Location initializer added an unexpected explicit workspace identity', 'setup')
                measurement.update(status='pass', location=location)
            except Exception as error:
                measurement['error'] = str(error)
                raise QualificationError('setup', 'Location initialization was not established: ' + str(error)) from error
            finally:
                measurement['elapsedSeconds'] = round(time.monotonic() - started, 3)

        def stop():
            nonlocal proc
            if proc is not None:
                proc.terminate()
                try:
                    proc.wait(timeout=15)
                except subprocess.TimeoutExpired:
                    proc.kill()
                    proc.wait(timeout=5)
                    proc = None
                    raise QualificationError('product', 'Owned serve did not stop within 15 seconds')
                proc = None

        def context(sid):
            return request('/api/session/' + sid + '/context')['data']

        def session(sid):
            return request('/api/session/' + sid)['data']

        def admission_event(sid, admitted):
            # Verified public history envelope: SessionEvent.PromptAdmitted with
            # data.timestamp and durable.seq, matching SessionInput.Admitted.
            seq = admitted['admittedSeq']
            require(isinstance(seq, int) and seq > 0, 'Admission sequence must follow Session creation')
            require('timeCreated' in admitted, 'Admission response omitted persisted creation time')
            page = request('/api/session/' + sid + '/history?after=' + str(seq - 1) + '&limit=1')
            events = page['data']
            require(len(events) == 1, 'Persisted admission event missing before retry')
            event = events[0]
            require(event.get('type') == 'session.next.prompt.admitted'
                    and event.get('durable', {}).get('aggregateID') == sid
                    and event.get('durable', {}).get('seq') == seq,
                    'Persisted admission event identity differs before retry')
            data = event.get('data', {})
            require(data.get('messageID') == admitted['id'] and data.get('sessionID') == sid
                    and data.get('timestamp') == admitted['timeCreated']
                    and data.get('prompt') == admitted['prompt'] and data.get('delivery') == admitted['delivery'],
                    'Persisted admission payload differs before retry')
            return event

        def create():
            return request('/api/session', {'agent': AGENT, 'model': {'providerID': PROVIDER, 'id': MODEL},
                                            'location': {'directory': str(workspace)}})['data']['id']

        def prompt(sid, text, mid, resume=True):
            return request('/api/session/' + sid + '/prompt',
                           {'id': mid, 'prompt': {'text': text}, 'resume': resume})['data']

        def wait_answer(sid, answer):
            deadline = time.monotonic() + 45
            while time.monotonic() < deadline:
                require(not state.errors, 'Provider validation error: ' + '; '.join(state.errors),
                        'setup' if 'setup' in state.error_categories else 'product')
                require(proc.poll() is None, 'Owned server exited during provider turn')
                messages = context(sid)
                assistants = [item for item in messages if item.get('type') == 'assistant']
                require(not any(item.get('error') for item in assistants), 'Projected provider error: ' + canonical(assistants))
                if answer in canonical(messages) and sid not in request('/api/session/active')['data']:
                    return messages
                time.sleep(0.1)
            raise QualificationError('product', 'Projected answer/idle deadline exceeded: ' + answer)

        phase = 'server-startup'
        start(1)
        phase = 'cold-location-initialization'
        initialize_location(1)
        result['checks']['coldLocationInitialization'] = 'pass'
        phase = 'actual-provider-and-tool'
        sid = create()
        result['sessionID'] = sid
        prompt(sid, FIRST, 'msg_runtime_first_037')
        first_context = wait_answer(sid, ANSWER_FIRST)
        require(state.read_confirmed, 'No actual read result returned through provider adapter')
        tools = [part for item in first_context if item.get('type') == 'assistant'
                 for part in item.get('content', []) if part.get('type') == 'tool']
        require(any(part.get('name') == 'read' and part.get('state', {}).get('status') == 'completed'
                    and FIXTURE in canonical(part) for part in tools), 'Completed real read missing from projected transcript')
        require((workspace / 'validation.txt').read_text() == FIXTURE + '\n', 'Read fixture unexpectedly mutated')
        result['checks']['actualStreamingProviderTurnAndReadTool'] = 'pass'
        phase = 'second-turn-history'
        prompt(sid, SECOND, 'msg_runtime_second_037')
        second_context = wait_answer(sid, ANSWER_SECOND)
        require(FIRST in canonical(second_context) and SECOND in canonical(second_context), 'Two turns not projected')
        result['checks']['secondTurnReloadedProjectedHistory'] = 'pass'
        phase = 'staged-undo-conflict'
        request('/api/session/' + sid + '/revert/stage', {'messageID': 'msg_runtime_second_037', 'files': False})
        before = context(sid)
        staged = session(sid).get('revert')
        require(staged and staged.get('messageID') == 'msg_runtime_second_037', 'Staged undo marker missing')
        other = create()
        conflict_payload = {'id': 'msg_runtime_owned_elsewhere_037', 'prompt': {'text': 'Admission only; do not execute'}, 'resume': False}
        admitted_other = request('/api/session/' + other + '/prompt', conflict_payload)['data']
        request('/api/session/' + sid + '/prompt',
                {'id': conflict_payload['id'], 'prompt': {'text': REPLACEMENT}, 'resume': False}, expected=409)
        require(context(sid) == before and session(sid).get('revert') == staged,
                'Rejected conflicting ID changed history or staged marker')
        result['checks']['crossSessionConflictPreservesUndoAndHistory'] = 'pass'
        phase = 'atomic-replacement-admission'
        replacement = prompt(sid, REPLACEMENT, 'msg_runtime_replacement_037', resume=False)
        cut = context(sid)
        require(not session(sid).get('revert'), 'Accepted replacement did not clear staged marker')
        require(SECOND not in canonical(cut) and ANSWER_SECOND not in canonical(cut), 'Reverted second turn retained after replacement')
        require(FIRST in canonical(cut) and ANSWER_FIRST in canonical(cut), 'Retained first turn was lost')
        require(not any(item.get('id') == replacement['id'] for item in cut), 'Admit-only replacement unexpectedly projected')
        require(sid not in request('/api/session/active')['data'] and other not in request('/api/session/active')['data'],
                'Admit-only input unexpectedly started execution')
        result['checks']['freshReplacementCutsAndDurablyAdmitsWithoutExecution'] = 'pass'
        phase = 'restart-durable-retry'
        request('/api/session/' + sid + '/rename', {'title': 'Release artifact runtime validation'})
        replacement_event = admission_event(sid, replacement)
        other_event = admission_event(other, admitted_other)
        stop()
        start(2)
        phase = 'restart-location-initialization'
        initialize_location(2)
        result['checks']['restartLocationInitialization'] = 'pass'
        phase = 'restart-durable-retry'
        require(session(sid)['title'] == 'Release artifact runtime validation', 'Session title did not survive restart')
        # Inspect BOTH persisted admission events before issuing either retry.
        # A lost row recreated at the same next sequence cannot satisfy this gate.
        require(admission_event(sid, replacement) == replacement_event,
                'Replacement admission event did not survive restart before retry')
        require(admission_event(other, admitted_other) == other_event,
                'Other admission event did not survive restart before retry')
        result['checks']['durableAdmissionEventsSurviveBeforeAnyRetry'] = 'pass'
        result['restartAdmissionIdentity'] = {
            'replacement': {'eventID': replacement_event['id'], 'admittedSeq': replacement['admittedSeq'],
                            'timeCreated': replacement['timeCreated']},
            'other': {'eventID': other_event['id'], 'admittedSeq': admitted_other['admittedSeq'],
                      'timeCreated': admitted_other['timeCreated']},
        }
        retry = prompt(sid, REPLACEMENT, replacement['id'])
        require(retry['id'] == replacement['id'] and retry['admittedSeq'] == replacement['admittedSeq']
                and retry['timeCreated'] == replacement['timeCreated'],
                'Exact replacement retry changed durable identity or persisted creation time')
        replacement_context = wait_answer(sid, ANSWER_REPLACEMENT)
        require(SECOND not in canonical(replacement_context), 'Reverted history returned after restart')
        other_retry = request('/api/session/' + other + '/prompt', conflict_payload)['data']
        require(other_retry['id'] == admitted_other['id'] and other_retry['admittedSeq'] == admitted_other['admittedSeq']
                and other_retry['timeCreated'] == admitted_other['timeCreated'],
                'Other admit-only exact retry changed durable identity or persisted creation time')
        require(other not in request('/api/session/active')['data'], 'Admit-only retry started execution')
        result['checks']['restartAndExactRetryPreserveAdmissionAndHistory'] = 'pass'
        phase = 'active-interruption'
        prompt(sid, STOP, 'msg_runtime_stop_037')
        require(state.stop_entered.wait(15), 'Real provider did not enter held stream')
        require(sid in request('/api/session/active')['data'], 'Held provider stream not active')
        started = time.monotonic()
        request('/api/session/' + sid + '/interrupt', {}, timeout=10)
        deadline = time.monotonic() + 10
        while sid in request('/api/session/active')['data'] and time.monotonic() < deadline:
            time.sleep(0.1)
        require(sid not in request('/api/session/active')['data'], 'Interrupt did not release active provider drain')
        result['interruptSeconds'] = round(time.monotonic() - started, 3)
        state.stop_release.set()
        result['checks']['actualActiveProviderInterruption'] = 'pass'
        phase = 'session-deletion'
        request('/api/session/' + sid, method='DELETE')
        request('/api/session/' + sid, expected=404)
        require(sid not in request('/api/session/active')['data'], 'Deleted Session remains active')
        request('/api/session/' + other, method='DELETE')
        request('/api/session/' + other, expected=404)
        result['checks']['sessionDeletionAndNotFound'] = 'pass'
        result['limitations'].extend([
            'Transcript undo exercised; filesystem undo not claimed (stage files=false; benign read only)',
            'Descendant cancellation/deletion not claimed: public create has no parentID; this lane does not delegate through governed Task',
            'Only compiled CLI, loopback OpenAI-compatible adapter and dummy credentials; no live provider/OAuth/desktop claims',
            'Source identity is supplied and tied to expected binary SHA256; CLI does not independently attest its Git commit',
        ])
        require(not state.errors, 'Provider recorded error: ' + '; '.join(state.errors),
                'setup' if 'setup' in state.error_categories else 'product')
        stop()
        result['status'] = 'pass'
    except Exception as error:
        result['failure'] = {'phase': phase, 'category': getattr(error, 'category', 'setup' if phase == 'artifact-setup' else 'product'),
                             'message': str(error), 'traceback': traceback.format_exc()}
    finally:
        state.stop_release.set()
        if proc is not None:
            proc.terminate()
            try:
                proc.wait(timeout=15)
            except subprocess.TimeoutExpired:
                proc.kill()
                proc.wait(timeout=5)
                result['status'] = 'failed'
                result.setdefault('failure', {'phase': 'cleanup', 'category': 'product', 'message': 'Owned server required forced termination'})
        if mock is not None:
            mock.shutdown()
            mock.server_close()
        for log in logs:
            log.close()
        if owned is not None:
            (owned / 'provider-requests.json').write_text(json.dumps(state.snapshot(), indent=2) + '\n')
            result['providerRequestsPath'] = str(owned / 'provider-requests.json')
        result['providerRequestCount'] = len(state.snapshot())
        result['providerErrors'] = list(state.errors)
        result['providerErrorCategories'] = list(state.error_categories)
        evidence.write_text(json.dumps(result, indent=2) + '\n')
        print(json.dumps({key: result.get(key) for key in ['status', 'source', 'binarySha256', 'checks', 'failure']}))
    return 0 if result['status'] == 'pass' else 1


if __name__ == '__main__':
    raise SystemExit(main())
