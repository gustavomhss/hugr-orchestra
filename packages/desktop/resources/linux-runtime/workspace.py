import errno
import hashlib
import json
import os
from pathlib import Path
import re
import signal
import socket
import ssl
import stat
import struct
import subprocess
import sys
import tempfile
from threading import Timer
import time
import urllib.request
import uuid
from xml.etree import ElementTree


HOME = Path("/home/dock")
RUNTIME = HOME / ".orchestra-runtime"
STAGING = Path("/var/lib/orchestra-install/package.deb")
SESSION_FIELDS = ("DISPLAY", "DBUS_SESSION_BUS_ADDRESS", "XDG_RUNTIME_DIR", "XAUTHORITY",
                  "AT_SPI_BUS_ADDRESS", "ORCHESTRA_A11Y_SESSION_ID")
SESSION_BYTES = 8192
CONFIG_BYTES = 65536


class SessionError(RuntimeError):
    """Only fixed failure codes cross the command boundary, never bus/OS diagnostics."""


def session_environment(*, _runtime=RUNTIME):
    session = current_session(_runtime=_runtime)
    return {key: session[key] for key in SESSION_FIELDS if key in session}


def native_session(*, _runtime=RUNTIME, _deadline=None, _cancelled=None):
    session = current_session(_runtime=_runtime)
    environment = {key: session[key] for key in SESSION_FIELDS if key in session}
    if accessibility_bus(environment, _runtime=_runtime, _deadline=_deadline, _cancelled=_cancelled) != environment["AT_SPI_BUS_ADDRESS"]:
        raise SessionError("native-session-stale")
    # Bus calls are not an atomic observation; reject an epoch/identity change
    # while they were in flight. This does not establish any application ownership.
    if current_session(_runtime=_runtime) != session:
        raise SessionError("native-session-stale")
    result = {"sessionID": session["ORCHESTRA_A11Y_SESSION_ID"],
              "processIdentity": session["processIdentity"], "environment": environment}
    if len(json.dumps(result, separators=(",", ":")).encode()) > SESSION_BYTES:
        raise SessionError("native-session-record-invalid")
    return result


def native_scope(*, _runtime=RUNTIME, _deadline=None, _cancelled=None):
    """Workspace-user authority, not an installed-application or window identity."""
    deadline = min(time.monotonic() + 4, _deadline) if _deadline is not None else time.monotonic() + 4
    try:
        _scope_remaining(deadline, _cancelled)
        before = current_session(_runtime=_runtime)
        processes = workspace_processes(before["processIdentity"], _deadline=deadline, _cancelled=_cancelled)
        session = native_session(_runtime=_runtime, _deadline=deadline, _cancelled=_cancelled)
        if (current_session(_runtime=_runtime) != before
                or process_identity(before["processIdentity"]["pid"]) != before["processIdentity"]):
            raise SessionError("native-workspace-scope-unavailable")
        _scope_remaining(deadline, _cancelled)
        return {"session": session, "processIdentities": processes}
    except (OSError, SessionError) as error:
        raise SessionError("native-workspace-scope-unavailable") from error


def workspace_processes(supervisor, *, _deadline=None, _cancelled=None, _max_visits=1024, _max_processes=128):
    # Internal budgets may only narrow the fixed command limits. Tests exercise
    # exhaustion with real processes without spawning hundreds of interpreters.
    if (type(_max_visits) is not int or not 1 <= _max_visits <= 1024
            or type(_max_processes) is not int or not 1 <= _max_processes <= 128):
        raise SessionError("native-workspace-scope-unavailable")
    deadline = min(time.monotonic() + 4, _deadline) if _deadline is not None else time.monotonic() + 4
    identities, visits = [], 0
    try:
        validate_identity(supervisor)
        with os.scandir("/proc") as entries:
            for entry in entries:
                _scope_remaining(deadline, _cancelled)
                if not entry.name.isascii() or not entry.name.isdecimal():
                    continue
                visits += 1
                if visits > _max_visits:
                    raise SessionError("native-workspace-scope-unavailable")
                pid = int(entry.name)
                if pid == os.getpid():
                    continue
                try:
                    info = entry.stat(follow_symlinks=False)
                    if not stat.S_ISDIR(info.st_mode):
                        raise SessionError("native-workspace-scope-unavailable")
                    # Nondumpable same-user processes can have root-owned proc
                    # entries. Do not silently misclassify them as foreign UID.
                    with (Path(entry.path) / "status").open("rb") as stream:
                        uid = next((line.split()[1:] for line in stream.read(4096).splitlines()
                                    if line.startswith(b"Uid:")), [])
                    if len(uid) != 4 or any(not value.isdigit() or len(value) > 10 for value in uid):
                        raise SessionError("native-workspace-scope-unavailable")
                    if int(uid[1]) != os.getuid():
                        continue
                    identity = process_identity(pid)
                    if os.stat(entry.path, follow_symlinks=False).st_uid != os.getuid():
                        raise SessionError("native-workspace-scope-unavailable")
                except (OSError, SessionError) as error:
                    _scope_remaining(deadline, _cancelled)
                    if _process_exited(pid):
                        continue
                    raise SessionError("native-workspace-scope-unavailable") from error
                _scope_remaining(deadline, _cancelled)
                if any(identity[key] != supervisor[key] for key in ("bootID", "pidNamespace", "mountNamespace")):
                    continue
                identities.append(identity)
                if len(identities) > _max_processes:
                    raise SessionError("native-workspace-scope-unavailable")
        if supervisor not in identities or process_identity(supervisor["pid"]) != supervisor:
            raise SessionError("native-workspace-scope-unavailable")
        _scope_remaining(deadline, _cancelled)
        return sorted(identities, key=lambda identity: identity["pid"])
    except (OSError, SessionError) as error:
        raise SessionError("native-workspace-scope-unavailable") from error


def _scope_remaining(deadline, cancelled):
    remaining = deadline - time.monotonic()
    if remaining <= 0 or (cancelled is not None and cancelled()):
        raise SessionError("native-workspace-scope-unavailable")
    return remaining


def _process_exited(pid):
    # A failed identity read is not evidence of exit. Only a disappeared proc
    # directory or a bounded, correctly identified zombie/dead stat proves it.
    process = Path(f"/proc/{pid}")
    try:
        with (process / "stat").open("rb") as stream:
            data = stream.read(8193)
    except (FileNotFoundError, ProcessLookupError):
        try:
            process.stat()
        except (FileNotFoundError, ProcessLookupError):
            return True
        return False
    fields = data.rsplit(b")", 1)
    return (len(data) <= 8192 and data.startswith(f"{pid} (".encode()) and len(fields) == 2
            and fields[1].split()[:1] in ([b"Z"], [b"X"], [b"x"]))


def runtime_directories(*, _runtime=RUNTIME):
    # Internal fixture injection only. No command/environment accepts a root path.
    for directory in (_runtime.parent, _runtime, _runtime / "run"):
        try:
            info = directory.lstat()
            if (not directory.is_absolute() or directory.resolve(strict=True) != directory
                    or not stat.S_ISDIR(info.st_mode) or info.st_uid != os.getuid()
                    or info.st_mode & (0o022 if directory == _runtime.parent else 0o077)):
                raise SessionError("session-root-invalid")
        except OSError as error:
            raise SessionError("session-root-invalid") from error


def bus_socket_path(address, *, accessibility=False, _runtime=RUNTIME):
    # D-Bus/AT-SPI generate this single pathname transport (optionally with GUID).
    # Reject alternate transports, address lists, escaping and extra options.
    if not isinstance(address, str) or len(address) > 1024:
        raise SessionError("session-bus-address-invalid")
    match = re.fullmatch(r"unix:path=([^,;]+)(?:,guid=[0-9a-fA-F]{32})?", address)
    expected = _runtime / "run" / ("at-spi/bus_100" if accessibility else "session-bus")
    if match is None or match[1] != str(expected) or len(os.fsencode(expected)) >= 100:
        raise SessionError("session-bus-address-invalid")
    return expected


def probe_bus_socket(address, *, accessibility=False, clear_stale=False, _runtime=RUNTIME, _deadline=None, _cancelled=None):
    path = bus_socket_path(address, accessibility=accessibility, _runtime=_runtime)
    runtime_directories(_runtime=_runtime)
    try:
        parent = path.parent.lstat()
        if (not stat.S_ISDIR(parent.st_mode) or parent.st_uid != os.getuid()
                or parent.st_mode & 0o077 or path.parent.resolve(strict=True) != path.parent):
            raise SessionError("session-socket-invalid")
        try:
            before = path.lstat()
        except FileNotFoundError:
            before = None
        if before is not None and (not stat.S_ISSOCK(before.st_mode) or before.st_uid != os.getuid()):
            raise SessionError("session-socket-invalid")
        with socket.socket(socket.AF_UNIX, socket.SOCK_STREAM) as probe:
            probe.settimeout(min(1, _scope_remaining(_deadline, _cancelled)) if _deadline is not None else 1)
            result = probe.connect_ex(str(path))
            if result == 0:
                if clear_stale:
                    raise SessionError("session-bus-active")
                credentials = struct.unpack("3i", probe.getsockopt(socket.SOL_SOCKET, socket.SO_PEERCRED, 12))
                if credentials[1] != os.getuid():
                    raise SessionError("session-socket-invalid")
            elif result not in (errno.ENOENT, errno.ECONNREFUSED):
                raise SessionError("session-socket-probe-failed")
            elif not clear_stale:
                raise SessionError("session-socket-unavailable")
        try:
            after = path.lstat()
        except FileNotFoundError:
            if clear_stale:
                return
            raise SessionError("session-socket-unavailable")
        if before is None or (before.st_dev, before.st_ino) != (after.st_dev, after.st_ino):
            raise SessionError("session-socket-changed")
        if clear_stale:
            # Only ENOENT/ECONNREFUSED reaches here; an active or unknown endpoint
            # is never removed. Do not extend this to arbitrary paths or /tmp.
            path.unlink()
    except OSError as error:
        raise SessionError("session-socket-probe-failed") from error


def process_identity(pid):
    if type(pid) is not int or not 1 <= pid < 2**53:
        raise SessionError("native-session-identity-invalid")
    try:
        process = Path(f"/proc/{pid}")
        if process.stat().st_uid != os.getuid():
            raise SessionError("native-session-identity-unavailable")
        with (process / "stat").open() as stream:
            before = stream.read(8193)
        fields = before.rsplit(")", 1)[1].split()
        if len(before) > 8192 or not before.startswith(f"{pid} (") or fields[0] in ("Z", "X", "x"):
            raise SessionError("native-session-identity-unavailable")
        with Path("/proc/sys/kernel/random/boot_id").open() as stream:
            boot = stream.read(128).strip()
        identity = {"pid": pid, "startTicks": int(fields[19]), "bootID": boot,
                    "pidNamespace": os.readlink(process / "ns/pid"),
                    "mountNamespace": os.readlink(process / "ns/mnt")}
        validate_identity(identity)
        with (process / "stat").open() as stream:
            after = stream.read(8193)
        fields = after.rsplit(")", 1)[1].split()
        if len(after) > 8192 or fields[0] in ("Z", "X", "x") or int(fields[19]) != identity["startTicks"]:
            raise SessionError("native-session-identity-unavailable")
        return identity
    except (OSError, ValueError, IndexError) as error:
        raise SessionError("native-session-identity-unavailable") from error


def validate_identity(identity):
    if (not isinstance(identity, dict)
            or set(identity) != {"pid", "startTicks", "bootID", "pidNamespace", "mountNamespace"}
            or any(type(identity.get(key)) is not int or not 1 <= identity[key] < 2**53 for key in ("pid", "startTicks"))
            or not isinstance(identity["bootID"], str)
            or re.fullmatch(r"[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}", identity["bootID"]) is None
            or any(not isinstance(identity[key], str) or len(identity[key]) > 128
                   or re.fullmatch(prefix + r":\[[0-9]+\]", identity[key]) is None
                   for key, prefix in (("pidNamespace", "pid"), ("mountNamespace", "mnt")))):
        raise SessionError("native-session-identity-invalid")


def parse_session(data, *, _runtime=RUNTIME):
    try:
        if len(data.encode("utf-8") if isinstance(data, str) else data) > SESSION_BYTES:
            raise SessionError("native-session-record-invalid")
        session = json.loads(data)
        if not isinstance(session, dict):
            raise SessionError("native-session-record-invalid")
        for key in SESSION_FIELDS:
            if key == "XAUTHORITY" and key not in session:
                continue
            value = session.get(key)
            if not isinstance(value, str) or not 1 <= len(value) <= 1024 or any(ord(char) < 32 for char in value):
                raise SessionError("native-session-record-invalid")
        if (session["DISPLAY"] != ":100" or session["XDG_RUNTIME_DIR"] != str(_runtime / "run")
                or str(uuid.UUID(session["ORCHESTRA_A11Y_SESSION_ID"])) != session["ORCHESTRA_A11Y_SESSION_ID"]):
            raise SessionError("native-session-record-invalid")
        bus_socket_path(session["DBUS_SESSION_BUS_ADDRESS"], _runtime=_runtime)
        bus_socket_path(session["AT_SPI_BUS_ADDRESS"], accessibility=True, _runtime=_runtime)
        validate_identity(session.get("processIdentity"))
        # Never return unknown record fields, especially inherited credentials.
        return {**{key: session[key] for key in SESSION_FIELDS if key in session},
                "processIdentity": session["processIdentity"]}
    except (ValueError, TypeError, RecursionError) as error:
        raise SessionError("native-session-record-invalid") from error


def current_session(*, _runtime=RUNTIME):
    runtime_directories(_runtime=_runtime)
    try:
        with os.fdopen(os.open(_runtime / "session.json", os.O_RDONLY | os.O_NOFOLLOW | os.O_NONBLOCK), "rb") as stream:
            info = os.fstat(stream.fileno())
            if not stat.S_ISREG(info.st_mode) or info.st_uid != os.getuid() or stat.S_IMODE(info.st_mode) != 0o600:
                raise SessionError("native-session-record-invalid")
            session = parse_session(stream.read(SESSION_BYTES + 1), _runtime=_runtime)
    except FileNotFoundError as error:
        raise SessionError("native-session-record-missing") from error
    except OSError as error:
        raise SessionError("native-session-record-invalid") from error
    if process_identity(session["processIdentity"]["pid"]) != session["processIdentity"]:
        raise SessionError("native-session-stale")
    return session


def atomic_private_file(path, data, limit):
    if len(data) > limit:
        raise SessionError("session-file-too-large")
    temporary = None
    try:
        descriptor, temporary = tempfile.mkstemp(prefix=f".{path.name}.", dir=path.parent)
        with os.fdopen(descriptor, "wb") as stream:
            os.fchmod(stream.fileno(), 0o600)
            stream.write(data)
            stream.flush()
            os.fsync(stream.fileno())
        os.replace(temporary, path)
    except OSError as error:
        raise SessionError("session-file-publish-failed") from error
    finally:
        if temporary is not None:
            Path(temporary).unlink(missing_ok=True)


def session_bus_config(*, _runtime=RUNTIME):
    # Retain the distribution's standard session policy, service directories and
    # limits, including local restrictions. Never invent an allow-user="*" rule.
    source = Path("/usr/share/dbus-1/session.conf")
    try:
        with source.open("rb") as stream:
            data = stream.read(CONFIG_BYTES + 1)
        if len(data) > CONFIG_BYTES:
            raise SessionError("session-bus-config-invalid")
        config = ElementTree.fromstring(data)
        if (config.tag != "busconfig" or config.findtext("type") != "session"
                or [node.text for node in config.findall("auth")] != ["EXTERNAL"]
                or len(config.findall("listen")) != 1 or config.find("standard_session_servicedirs") is None
                or config.find("policy") is None):
            raise SessionError("session-bus-config-invalid")
        config.find("listen").text = "unix:path=" + str(_runtime / "run/session-bus")
        # Relative includes are relative to the original config, not our run dir.
        for node in (*config.findall("include"), *config.findall("includedir")):
            if node.text and node.get("selinux_root_relative") != "yes" and not Path(node.text).is_absolute():
                node.text = str(source.parent / node.text)
        result = ElementTree.tostring(config, encoding="utf-8")
        if len(result) > CONFIG_BYTES:
            raise SessionError("session-bus-config-invalid")
        return result
    except (OSError, ElementTree.ParseError) as error:
        raise SessionError("session-bus-config-invalid") from error


def accessibility_bus(environment, *, activate=False, _runtime=RUNTIME, _deadline=None, _cancelled=None):
    """Typed direct Gio only; the read path never activates/restarts a service."""
    try:
        import gi
        gi.require_version("Gio", "2.0")
        from gi.repository import Gio, GLib
    except (ImportError, ValueError) as error:
        raise SessionError("native-session-gio-unavailable") from error

    probe_bus_socket(environment["DBUS_SESSION_BUS_ADDRESS"], _runtime=_runtime, _deadline=_deadline, _cancelled=_cancelled)
    if not activate:
        probe_bus_socket(environment["AT_SPI_BUS_ADDRESS"], accessibility=True, _runtime=_runtime,
                         _deadline=_deadline, _cancelled=_cancelled)
    connections = []
    cancel = Gio.Cancellable.new()
    timer = Timer(min(5, _scope_remaining(_deadline, _cancelled)) if _deadline is not None else 5, cancel.cancel)
    timer.daemon = True

    def connect(address):
        if _deadline is not None:
            _scope_remaining(_deadline, _cancelled)
        connection = Gio.DBusConnection.new_for_address_sync(
            address, Gio.DBusConnectionFlags.AUTHENTICATION_CLIENT | Gio.DBusConnectionFlags.MESSAGE_BUS_CONNECTION,
            None, cancel)
        connection.set_exit_on_close(False)
        connections.append(connection)
        guid = address.partition(",guid=")[2]
        if guid and (connection.get_guid() or "").lower() != guid.lower():
            raise SessionError("native-session-stale")
        return connection

    def call(connection, destination, path, interface, method, signature, parameters, reply):
        if _deadline is not None:
            _scope_remaining(_deadline, _cancelled)
        return connection.call_sync(destination, path, interface, method, GLib.Variant(signature, parameters),
                                    GLib.VariantType.new(reply), Gio.DBusCallFlags.NO_AUTO_START, 2000, cancel).unpack()

    def daemon(connection, method, signature, parameters, reply):
        return call(connection, "org.freedesktop.DBus", "/org/freedesktop/DBus", "org.freedesktop.DBus",
                    method, signature, parameters, reply)

    def owner(connection, name):
        if activate and daemon(connection, "StartServiceByName", "(su)", (name, 0), "(u)")[0] not in (1, 2):
            raise SessionError("a11y-startup-failed")
        value = daemon(connection, "GetNameOwner", "(s)", (name,), "(s)")[0]
        if (not Gio.dbus_is_unique_name(value)
                or daemon(connection, "GetConnectionUnixUser", "(s)", (value,), "(u)")[0] != os.getuid()):
            raise SessionError("native-session-bus-owner-invalid")
        return value

    timer.start()
    try:
        session = connect(environment["DBUS_SESSION_BUS_ADDRESS"])
        launcher = owner(session, "org.a11y.Bus")
        if activate:
            call(session, launcher, "/org/a11y/bus", "org.freedesktop.DBus.Properties", "Set", "(ssv)",
                 ("org.a11y.Status", "IsEnabled", GLib.Variant("b", True)), "()")
        # GetAddress lazily launches a bus even with NO_AUTO_START. Readers must
        # stay on the published address/GUID when a replacement launcher is idle.
        address = (
            call(session, launcher, "/org/a11y/bus", "org.a11y.Bus", "GetAddress", "()", (), "(s)")[0]
            if activate else environment["AT_SPI_BUS_ADDRESS"]
        )
        # GNOME 2.52 ensure_a11y_bus uses $XDG_RUNTIME_DIR/at-spi/bus_$DISPLAY.
        # Reject its /tmp fallback instead of publishing an unshared address.
        probe_bus_socket(address, accessibility=True, _runtime=_runtime, _deadline=_deadline, _cancelled=_cancelled)
        accessible = connect(address)
        registry = owner(accessible, "org.a11y.atspi.Registry")
        if (daemon(session, "GetNameOwner", "(s)", ("org.a11y.Bus",), "(s)")[0] != launcher
                or daemon(accessible, "GetNameOwner", "(s)", ("org.a11y.atspi.Registry",), "(s)")[0] != registry):
            raise SessionError("native-session-bus-owner-invalid")
        return address
    except GLib.Error as error:
        raise SessionError("a11y-startup-failed" if activate else "native-session-bus-unavailable") from error
    finally:
        for connection in connections:
            try:
                connection.close_sync(cancel)
            except GLib.Error:
                pass
        timer.cancel()
        timer.join()


def applications():
    from gi.repository import Gio

    return {
        app.get_id(): app for app in Gio.AppInfo.get_all()
        if isinstance(app, Gio.DesktopAppInfo) and app.should_show() and app.get_id() and app.get_display_name()
    }


def clear_stale_display():
    # A stopped container retains /tmp. Probe both X11 socket namespaces rather
    # than trusting the old lock PID, which can name an unrelated new process.
    for address in ("/tmp/.X11-unix/X100", "\0/tmp/.X11-unix/X100"):
        with socket.socket(socket.AF_UNIX, socket.SOCK_STREAM) as probe:
            probe.settimeout(1)
            result = probe.connect_ex(address)
        if result == 0:
            raise RuntimeError("display-active")
        if result not in (errno.ENOENT, errno.ECONNREFUSED):
            raise RuntimeError("failed")
    Path("/tmp/.X100-lock").unlink(missing_ok=True)
    Path("/tmp/.X11-unix/X100").unlink(missing_ok=True)


def main():
    command = sys.argv[1]
    if command == "start":
        clear_stale_display()
        os.umask(0o077)
        RUNTIME.mkdir(mode=0o700, exist_ok=True)
        (RUNTIME / "run").mkdir(mode=0o700, exist_ok=True)
        runtime_directories()
        (RUNTIME / "run/at-spi").mkdir(mode=0o700, exist_ok=True)
        probe_bus_socket("unix:path=" + str(RUNTIME / "run/session-bus"), clear_stale=True)
        probe_bus_socket("unix:path=" + str(RUNTIME / "run/at-spi/bus_100"), accessibility=True, clear_stale=True)
        atomic_private_file(RUNTIME / "run/session-bus.conf", session_bus_config(), CONFIG_BYTES)
        (RUNTIME / "session.json").unlink(missing_ok=True)
        os.environ["XDG_RUNTIME_DIR"] = str(RUNTIME / "run")
        # A fresh certificate avoids expired persisted certificates after a long stop.
        subprocess.run([
            "openssl", "req", "-x509", "-newkey", "ec", "-pkeyopt", "ec_paramgen_curve:prime256v1", "-nodes",
            "-keyout", str(RUNTIME / "key.pem"), "-out", str(RUNTIME / "cert.pem"), "-days", "3650",
            "-subj", "/CN=localhost", "-addext", "subjectAltName=IP:127.0.0.1,DNS:localhost",
        ], check=True, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
        (RUNTIME / "password").write_text(os.environ.pop("APP_DOCK_RUNTIME_PASSWORD"))
        os.execvp("xpra", [
            "xpra", "start", ":100", "--daemon=no",
            f"--bind-ssl=0.0.0.0:14500,auth=file:filename={RUNTIME / 'password'}",
            f"--ssl-cert={RUNTIME / 'cert.pem'}", f"--ssl-key={RUNTIME / 'key.pem'}",
            "--html=on", "--mdns=no", "--printing=no", "--webcam=no", "--notifications=no",
            "--pulseaudio=no", "--speaker=disabled", "--microphone=disabled",
            f"--start-child=dbus-run-session --config-file={RUNTIME / 'run/session-bus.conf'} -- python3 /opt/orchestra/workspace.py session",
            "--exit-with-client=no", "--exit-with-children=no",
        ])
    if command == "session":
        # Record the environment of an actual Xpra child, not an independent docker exec.
        runtime_directories()
        environment = {key: os.environ[key] for key in SESSION_FIELDS[:4] if key in os.environ}
        if (environment.get("DISPLAY") != ":100" or environment.get("XDG_RUNTIME_DIR") != str(RUNTIME / "run")
                or not environment.get("DBUS_SESSION_BUS_ADDRESS")):
            raise SessionError("native-session-environment-invalid")
        environment["ORCHESTRA_A11Y_SESSION_ID"] = str(uuid.uuid4())
        environment["AT_SPI_BUS_ADDRESS"] = accessibility_bus(environment, activate=True)
        os.environ.update(environment)
        session = {**environment, "processIdentity": process_identity(os.getpid())}
        data = json.dumps(session, separators=(",", ":")).encode()
        parse_session(data)
        atomic_private_file(RUNTIME / "session.json", data, SESSION_BYTES)
        subprocess.Popen(["xterm"])
        # Xpra strips an inherited DBus address. Its child owns this session bus;
        # keep it alive when the initial terminal window is closed.
        while True:
            signal.pause()
    if command == "native-session":
        print(json.dumps(native_session(), separators=(",", ":")))
        return
    if command == "native-scope":
        print(json.dumps(native_scope(), separators=(",", ":")))
        return
    if command == "ready":
        session_environment()
        certificate = (RUNTIME / "cert.pem").read_text()
        with urllib.request.urlopen(
            "https://127.0.0.1:14500/index.html", context=ssl.create_default_context(cafile=str(RUNTIME / "cert.pem")), timeout=2,
        ) as response:
            if response.status != 200:
                raise RuntimeError("failed")
        digest = hashlib.sha256(ssl.PEM_cert_to_DER_cert(certificate)).hexdigest().upper()
        print(json.dumps({"certificate": certificate, "fingerprint": ":".join(digest[index:index + 2] for index in range(0, len(digest), 2))}))
        return
    if command == "list":
        print(json.dumps(sorted(
            [{"id": app_id, "name": app.get_display_name()} for app_id, app in applications().items()],
            key=lambda app: (app["name"].casefold(), app["id"]),
        )))
        return
    if command == "launch":
        from gi.repository import Gio

        environment = session_environment()
        os.environ.update(environment)
        app = applications().get(sys.argv[2])
        if app is None:
            raise RuntimeError("failed")
        context = Gio.AppLaunchContext()
        for key, value in environment.items():
            context.setenv(key, value)
        if not app.launch([], context):
            raise RuntimeError("failed")
        return
    if command == "prepare":
        STAGING.parent.mkdir(mode=0o700, parents=True, exist_ok=True)
        STAGING.unlink(missing_ok=True)
        return
    if command == "clean":
        STAGING.unlink(missing_ok=True)
        return
    if command == "install":
        architecture = subprocess.run(["dpkg-deb", "--field", str(STAGING), "Architecture"], capture_output=True, text=True)
        package = subprocess.run(["dpkg-deb", "--field", str(STAGING), "Package"], capture_output=True, text=True)
        if architecture.returncode or package.returncode or not package.stdout.strip() or not architecture.stdout.strip():
            raise ValueError("invalid-package")
        native = subprocess.check_output(["dpkg", "--print-architecture"], text=True).strip()
        if architecture.stdout.strip() not in (native, "all"):
            raise ValueError("architecture-mismatch")
        deadline = time.monotonic() + 210
        for args in (
            ["apt-get", "-o", "Acquire::Retries=1", "-o", "Acquire::http::Timeout=30", "-o", "Acquire::https::Timeout=30", "update"],
            ["apt-get", "install", "-y", "--no-install-recommends", str(STAGING)],
        ):
            subprocess.run(args, check=True, env={**os.environ, "DEBIAN_FRONTEND": "noninteractive"}, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, timeout=max(1, deadline - time.monotonic()))
        return
    raise RuntimeError("failed")


if __name__ == "__main__":
    try:
        main()
    except SessionError as error:
        print(str(error), file=sys.stderr)
        sys.exit(1)
    except ValueError as error:
        print(str(error) if str(error) in ("invalid-package", "architecture-mismatch") else "failed", file=sys.stderr)
        sys.exit(1)
    except Exception:
        print("failed", file=sys.stderr)
        sys.exit(1)
