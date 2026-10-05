#!/bin/bash
set -euo pipefail
# Read source on fd 3 so --exec preserves the caller's raw stdin/stdout/stderr.
exec /usr/bin/python3 /dev/fd/3 "$@" 3<<'PY'
import contextlib
import ctypes
import fcntl
import json
import os
import secrets
import signal
import stat
import subprocess
import sys
import time
import uuid
from pathlib import Path
from gi.repository import GLib

os.close(3)
root = Path('/session')
home = Path('/home/proof')
script = '/usr/local/bin/orchestra-a11y-session'
environment = {
    'PATH': '/opt/vscode/bin:/usr/local/bin:/usr/bin:/bin',
    'HOME': str(home), 'USER': 'proof', 'LOGNAME': 'proof', 'LANG': 'C.UTF-8',
    'DISPLAY': ':91', 'XAUTHORITY': '/session/Xauthority',
    'XDG_RUNTIME_DIR': '/session/runtime', 'XDG_CONFIG_HOME': '/home/proof/.config',
    'XDG_CACHE_HOME': '/home/proof/.cache', 'XDG_DATA_HOME': '/home/proof/.local/share',
    'GDK_BACKEND': 'x11', 'GTK_A11Y': 'atspi', 'GSETTINGS_BACKEND': 'memory',
    'QT_QPA_PLATFORM': 'xcb', 'QT_LINUX_ACCESSIBILITY_ALWAYS_ON': '1',
}

def publish(name, value):
    temporary = root / (name + '.tmp')
    temporary.write_text(json.dumps(value, indent=2) + '\n')
    temporary.replace(root / name)

def child_pids(pid):
    with contextlib.suppress(FileNotFoundError, ProcessLookupError):
        return [int(value) for value in Path(f'/proc/{pid}/task/{pid}/children').read_text().split()]
    return []

def descendants(pid):
    pending = child_pids(pid)
    result = []
    while pending:
        child = pending.pop()
        result.append(child)
        if len(result) > 1024:
            raise RuntimeError('owned-process-limit')
        pending.extend(child_pids(child))
    return result

def identity(pid):
    fields = Path(f'/proc/{pid}/stat').read_text().rsplit(')', 1)[1].split()
    return {'pid': pid, 'startTicks': int(fields[19]),
            'bootID': Path('/proc/sys/kernel/random/boot_id').read_text().strip(),
            'pidNamespace': os.readlink(f'/proc/{pid}/ns/pid'),
            'mountNamespace': os.readlink(f'/proc/{pid}/ns/mnt'),
            'executable': os.readlink(f'/proc/{pid}/exe')}

def bus_call(address, destination, path, method, *args):
    return GLib.Variant.parse(None, subprocess.check_output([
        'gdbus', 'call', '--address', address, '--timeout', '3',
        '--dest', destination, '--object-path', path, '--method', method, *args,
    ], text=True, timeout=5), None, None).unpack()

def wait_owner(address, name):
    deadline = time.monotonic() + 10
    while not bus_call(address, 'org.freedesktop.DBus', '/org/freedesktop/DBus',
                       'org.freedesktop.DBus.NameHasOwner', name)[0]:
        if time.monotonic() >= deadline:
            raise RuntimeError(f'bus-owner-timeout: {name}')
        time.sleep(0.1)

def interrupted(signum, frame):
    raise SystemExit(128 + signum)

if os.getuid() != 1000 or os.getgid() != 1000:
    raise SystemExit('session requires guest UID/GID 1000:1000')
os.umask(0o077)

if sys.argv[1:2] == ['--exec']:
    if len(sys.argv) < 3:
        raise SystemExit('usage: orchestra-a11y-session --exec COMMAND [ARG...]')
    saved = json.loads((root / 'environment.json').read_text())
    if saved['HOME'] != str(home) or not saved['DBUS_SESSION_BUS_ADDRESS'].startswith('unix:path=/session/session-bus,'):
        raise SystemExit('invalid-session-environment')
    os.execvpe(sys.argv[2], sys.argv[2:], saved)

signal.signal(signal.SIGTERM, interrupted)
signal.signal(signal.SIGINT, interrupted)
signal.signal(signal.SIGHUP, interrupted)

if not sys.argv[1:]:
    # A subreaper also owns detached descendants (for example Electron crashpad).
    if ctypes.CDLL(None, use_errno=True).prctl(36, 1, 0, 0, 0) != 0:
        raise OSError(ctypes.get_errno(), 'PR_SET_CHILD_SUBREAPER')
    with (root / '.lock').open('w') as lock:
        fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
        if (root / 'session-bus').exists():
            raise SystemExit('session-socket-exists: use a stopped, fresh session volume')
        (root / 'runtime').mkdir(mode=0o700, exist_ok=True)
        (root / 'logs').mkdir(mode=0o700, exist_ok=True)
        (root / 'environment.json').unlink(missing_ok=True)
        (root / 'apps.json').unlink(missing_ok=True)
        (root / 'dbus.conf').write_text('''<busconfig>
  <type>session</type><listen>unix:path=/session/session-bus</listen><auth>EXTERNAL</auth>
  <standard_session_servicedirs/>
  <policy context="default">
    <allow send_destination="*" eavesdrop="true"/><allow eavesdrop="true"/><allow own="*"/>
  </policy>
</busconfig>\n''')
        environment['ORCHESTRA_A11Y_SESSION_ID'] = str(uuid.uuid4())
        child = subprocess.Popen(['dbus-run-session', '--config-file=/session/dbus.conf',
                                  '--', script, '--inside'], env=environment, start_new_session=True)
        try:
            raise SystemExit(child.wait())
        finally:
            # Only this launch's process group/tree is signalled, never a UID-wide kill.
            for signum in (signal.SIGTERM, signal.SIGINT, signal.SIGHUP):
                signal.signal(signum, signal.SIG_IGN)
            (root / 'environment.json').unlink(missing_ok=True)
            with contextlib.suppress(ProcessLookupError):
                os.killpg(child.pid, signal.SIGTERM)
            try:
                child.wait(timeout=5)
            except subprocess.TimeoutExpired:
                with contextlib.suppress(ProcessLookupError):
                    os.killpg(child.pid, signal.SIGKILL)
                child.wait(timeout=2)
            with contextlib.suppress(ProcessLookupError):
                os.killpg(child.pid, signal.SIGKILL)
            deadline = time.monotonic() + 2
            while descendants(os.getpid()):
                for pid in reversed(descendants(os.getpid())):
                    with contextlib.suppress(ProcessLookupError):
                        os.kill(pid, signal.SIGKILL)
                with contextlib.suppress(ChildProcessError):
                    while os.waitpid(-1, os.WNOHANG)[0]:
                        pass
                if time.monotonic() >= deadline:
                    raise RuntimeError('owned-process-cleanup-timeout')
                time.sleep(0.05)
            # Keep launch/version/log receipts, but do not leave usable bus addresses.
            for socket in (root / 'session-bus', root / 'runtime/at-spi/bus_91'):
                if socket.exists() and stat.S_ISSOCK(socket.lstat().st_mode):
                    socket.unlink()

if sys.argv[1:] != ['--inside'] or not os.environ.get('DBUS_SESSION_BUS_ADDRESS', '').startswith('unix:path=/session/session-bus,'):
    raise SystemExit('invalid-session-launch')
environment = dict(os.environ)
processes = []

def launch(name, argv):
    with (root / 'logs' / (name + '.log')).open('w') as log:
        process = subprocess.Popen(argv, stdout=log, stderr=subprocess.STDOUT, env=environment)
    processes.append(process)
    return process

try:
    subprocess.run(['xauth', '-f', environment['XAUTHORITY'], 'add', ':91',
                    'MIT-MAGIC-COOKIE-1', secrets.token_hex(16)], check=True, timeout=5)
    display = launch('xvfb', ['Xvfb', ':91', '-noreset', '-screen', '0', '1280x900x24',
                              '-nolisten', 'tcp', '-auth', environment['XAUTHORITY']])
    deadline = time.monotonic() + 30
    while True:
        try:
            ready = subprocess.run(['xdpyinfo'], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL,
                                   env=environment, timeout=3).returncode == 0
        except subprocess.TimeoutExpired:
            ready = False
        if ready:
            break
        if display.poll() is not None or time.monotonic() >= deadline:
            raise RuntimeError('display-startup-failed: /session/logs/xvfb.log')
        time.sleep(0.1)
    launcher = launch('at-spi-launcher', ['/usr/libexec/at-spi-bus-launcher', '--launch-immediately', '--a11y=1'])
    wait_owner(environment['DBUS_SESSION_BUS_ADDRESS'], 'org.a11y.Bus')
    address = bus_call(environment['DBUS_SESSION_BUS_ADDRESS'], 'org.a11y.Bus',
                       '/org/a11y/bus', 'org.a11y.Bus.GetAddress')[0]
    if not address.startswith('unix:path=/session/runtime/at-spi/bus_91,'):
        raise RuntimeError(f'unshared-accessibility-address: {address}')
    environment['AT_SPI_BUS_ADDRESS'] = address
    registry = launch('at-spi-registry', ['/usr/libexec/at-spi2-registryd'])
    wait_owner(address, 'org.a11y.atspi.Registry')
    # Qt5 needs the address before bridge activation; Xvfb must retain this atom.
    subprocess.run(['xprop', '-root', '-f', 'AT_SPI_BUS', '8s', '-set', 'AT_SPI_BUS', address],
                   env=environment, check=True, timeout=3)
    profile = home / 'vscode-profile/User'
    profile.mkdir(parents=True, exist_ok=True)
    settings = profile / 'settings.json'
    if not settings.exists():
        settings.write_text(json.dumps({'editor.accessibilitySupport': 'on',
            'telemetry.telemetryLevel': 'off', 'update.mode': 'none',
            'workbench.startupEditor': 'none', 'security.workspace.trust.enabled': False}, indent=2) + '\n')
    applications = {}
    flags = ['--force-renderer-accessibility', '--no-sandbox', '--disable-gpu',
             '--disable-dev-shm-usage', '--disable-extensions', '--disable-workspace-trust',
             '--skip-welcome', '--skip-release-notes', '--new-window',
             '--user-data-dir=/home/proof/vscode-profile', '--extensions-dir=/home/proof/vscode-extensions']
    for name, argv in {'mousepad': ['mousepad', '--disable-server'],
                       'featherpad': ['featherpad', '--standalone'],
                       'vscode': ['/opt/vscode/code', *flags]}.items():
        file = home / (name + '.txt')
        if not file.exists():
            file.write_text(f'{name} W0 initial input\n')
        process = launch(name, [*argv, str(file)])
        applications[name] = {'appID': name, 'launchEpoch': str(uuid.uuid4()),
                              'file': str(file), 'argv': process.args, 'process': process}
    time.sleep(1)
    for app in applications.values():
        process = app.pop('process')
        if process.poll() is not None:
            raise RuntimeError(f'app-exited-at-launch: {app["appID"]}; inspect /session/logs')
        app.update(identity(process.pid))
        app['processIdentities'] = [identity(process.pid)]
        for pid in descendants(process.pid):
            with contextlib.suppress(FileNotFoundError, ProcessLookupError):
                app['processIdentities'].append(identity(pid))
    publish('versions.json', json.loads(Path('/opt/orchestra-a11y/versions.json').read_text()))
    publish('apps.json', {'v': 1, 'sessionID': environment['ORCHESTRA_A11Y_SESSION_ID'],
                         'status': 'launched-not-semantically-verified', 'nonAtomic': True,
                         'apps': applications, 'vscodeTestFlags': flags})
    publish('environment.json', environment)
    print('W0 session launched; /session/environment.json and /session/apps.json published', flush=True)
    # App exit is allowed for W0 restart/removal probes; no automatic relaunch.
    while all(process.poll() is None for process in (display, launcher, registry)):
        time.sleep(0.25)
    raise RuntimeError('session-infrastructure-exited: inspect /session/logs')
finally:
    for process in reversed(processes):
        with contextlib.suppress(ProcessLookupError):
            process.terminate()
PY
