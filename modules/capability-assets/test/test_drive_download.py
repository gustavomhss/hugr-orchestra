"""Real Drive discovery client and downloader against a loopback HTTP fixture.

No OAuth, Google endpoint, gws or child process participates. Only the asset's
service constructor and a delegating downloader constructor observer are replaced.
Known DOS-device vectors also trap their exact FileIO target on Windows before OS access.
"""

import argparse
import errno
import importlib.util
import json
import os
import re
import stat
import threading
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from types import SimpleNamespace
from urllib.parse import parse_qs, urlsplit

import pytest


ASSET = (
    Path(__file__).resolve().parents[1]
    / "assets/skills/office-operations/scripts/google_api.py"
)
PAYLOAD = b"\x00\xfforiginal binary bytes\r\n\x80"
FIRST_CHUNK = b"first real SDK chunk\x00\xff"


def assert_no_success_json(stdout):
    assert re.search(r'"status"\s*:\s*"downloaded"', stdout) is None


@pytest.fixture
def drive(tmp_path, monkeypatch, request):
    home = tmp_path / "home"
    work = tmp_path / "work"
    home.mkdir()
    work.mkdir()
    monkeypatch.setenv("HOME", str(home))
    monkeypatch.setenv("USERPROFILE", str(home))
    monkeypatch.setenv("APPDATA", str(home / "appdata"))
    monkeypatch.setenv("ORCHESTRA_GOOGLE_HOME", str(home / "google"))
    monkeypatch.setenv("XDG_CONFIG_HOME", str(home / "config"))
    monkeypatch.delenv("GOOGLE_APPLICATION_CREDENTIALS", raising=False)
    monkeypatch.syspath_prepend(str(ASSET.parent))
    monkeypatch.chdir(work)
    spec = importlib.util.spec_from_file_location("drive_download_asset", ASSET)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    assert module.STATE_HOME == home / "google"
    assert module.TOKEN_PATH.parent == home / "google"

    import httplib2
    from googleapiclient import discovery, http

    state = SimpleNamespace(
        metadata={"id": "file_123", "name": "report.bin", "mimeType": "application/octet-stream"},
        requests=[],
        unexpected=[],
        handles=[],
        downloaders=[],
        payload=PAYLOAD,
        partial_failure=False,
        constructor_failure=False,
    )

    class Handler(BaseHTTPRequestHandler):
        def log_message(self, *_args):
            pass

        def reply(self, status, content, content_type, content_range=None):
            self.send_response(status)
            self.send_header("Content-Type", content_type)
            self.send_header("Content-Length", str(len(content)))
            self.send_header("Connection", "close")
            if content_range:
                self.send_header("Content-Range", content_range)
            self.end_headers()
            self.wfile.write(content)

        def do_GET(self):
            url = urlsplit(self.path)
            query = parse_qs(url.query)
            kind = (
                "export" if url.path.endswith("/export")
                else "media" if query.get("alt") == ["media"]
                else "metadata"
            )
            state.requests.append({
                "kind": kind,
                "path": url.path,
                "query": query,
                "range": self.headers.get("Range"),
                "authorization": self.headers.get("Authorization"),
            })
            if not url.path.startswith("/drive/v3/files/"):
                state.unexpected.append(self.path)
                return self.reply(400, b"unsupported fixture operation", "text/plain")
            if kind == "metadata":
                return self.reply(200, json.dumps(state.metadata).encode(), "application/json")
            transfers = [item for item in state.requests if item["kind"] != "metadata"]
            if state.partial_failure:
                if len(transfers) == 1:
                    return self.reply(
                        206, FIRST_CHUNK, "application/octet-stream",
                        f"bytes 0-{len(FIRST_CHUNK) - 1}/{len(FIRST_CHUNK) + 9}",
                    )
                return self.reply(
                    503, b'{"error":{"code":503,"message":"fixture transfer failed"}}',
                    "application/json",
                )
            self.reply(200, state.payload, "application/octet-stream")

    server = ThreadingHTTPServer(("127.0.0.1", 0), Handler)
    thread = threading.Thread(target=server.serve_forever, kwargs={"poll_interval": 0.01}, daemon=True)
    thread.start()
    transport = httplib2.Http(timeout=5, proxy_info=None)

    def cleanup():
        # Retain handles until assertions inspect .closed; GC must not hide a leak.
        for handle in state.handles:
            if not handle.closed:
                handle.close()
        transport.close()
        server.shutdown()
        server.server_close()
        thread.join(timeout=5)
        assert not thread.is_alive()
        assert not state.unexpected
        assert all(item["authorization"] is None for item in state.requests)

    request.addfinalizer(cleanup)
    service = discovery.build(
        "drive", "v3", http=transport, static_discovery=True, cache_discovery=False,
        client_options={"api_endpoint": f"http://127.0.0.1:{server.server_port}/drive/v3/"},
    )
    assert isinstance(service, discovery.Resource)

    def build_service(api, version):
        assert (api, version) == ("drive", "v3")
        return service

    real_downloader = http.MediaIoBaseDownload

    def observe_downloader(handle, request, *args, **kwargs):
        state.handles.append(handle)
        downloader = real_downloader(handle, request, *args, **kwargs)
        state.downloaders.append(downloader)
        if state.constructor_failure:
            raise RuntimeError("fixture downloader construction failed")
        return downloader

    monkeypatch.setattr(module, "build_service", build_service)
    monkeypatch.setattr(http, "MediaIoBaseDownload", observe_downloader)

    def arguments():
        return argparse.Namespace(file_id="file_123", output=None, export_mime=None)

    # Capture only the operation outcome, so preservation assertions still run
    # when the vulnerable implementation returns success after changing a sentinel.
    def attempt(args):
        try:
            module.drive_download(args)
        except (Exception, SystemExit) as error:
            return error
        return None

    return SimpleNamespace(
        module=module, state=state, work=work, home=home, root=tmp_path,
        arguments=arguments, attempt=attempt,
    )


@pytest.mark.parametrize("export_mime", [None, "text/plain"])
def test_binary_default_uses_actual_sdk_and_closes_handle(drive, capsys, export_mime):
    args = drive.arguments()
    args.export_mime = export_mime
    drive.module.drive_download(args)
    result = json.loads(capsys.readouterr().out)
    assert result == {
        "status": "downloaded", "id": "file_123", "name": "report.bin",
        "path": str(drive.work / "report.bin"), "mimeType": "application/octet-stream",
    }
    assert (drive.work / "report.bin").read_bytes() == PAYLOAD
    assert [item["kind"] for item in drive.state.requests] == ["metadata", "media"]
    assert drive.state.requests[0]["query"]["fields"] == ["id, name, mimeType"]
    assert drive.state.requests[1]["range"].startswith("bytes=0-")
    assert len(drive.state.downloaders) == 1
    assert drive.state.handles[0].closed


@pytest.mark.parametrize("mime,expected_mime,suffix", [
    ("application/vnd.google-apps.document", "application/pdf", ".pdf"),
    ("application/vnd.google-apps.spreadsheet", "text/csv", ".csv"),
    ("application/vnd.google-apps.presentation", "application/pdf", ".pdf"),
    ("application/vnd.google-apps.drawing", "image/png", ".png"),
])
def test_all_native_exports_preserve_the_default_map(drive, capsys, mime, expected_mime, suffix):
    drive.state.metadata.update(name="Meeting notes", mimeType=mime)
    drive.module.drive_download(drive.arguments())
    result = json.loads(capsys.readouterr().out)
    assert result["path"] == str(drive.work / f"Meeting notes{suffix}")
    assert Path(result["path"]).read_bytes() == PAYLOAD
    assert drive.state.requests[-1]["kind"] == "export"
    assert drive.state.requests[-1]["query"]["mimeType"] == [expected_mime]
    assert drive.state.handles[0].closed


@pytest.mark.parametrize("name,custom_mime,expected_name,expected_mime", [
    ("notes.existing", None, "notes.existing", "application/pdf"),
    ("notes", "text/plain", "notes.pdf", "text/plain"),
    ("notes.existing", "text/markdown", "notes.existing", "text/markdown"),
])
def test_native_suffix_and_custom_export_mime_stay_independent(
    drive, capsys, name, custom_mime, expected_name, expected_mime,
):
    drive.state.metadata.update(name=name, mimeType="application/vnd.google-apps.document")
    args = drive.arguments()
    args.export_mime = custom_mime
    drive.module.drive_download(args)
    assert json.loads(capsys.readouterr().out)["path"] == str(drive.work / expected_name)
    assert (drive.work / expected_name).read_bytes() == PAYLOAD
    assert drive.state.requests[-1]["query"]["mimeType"] == [expected_mime]


@pytest.mark.parametrize("kind", ["relative", "absolute", "tilde"])
def test_explicit_output_keeps_parents_tilde_no_extension_and_intentional_overwrite(drive, capsys, kind):
    drive.state.metadata.update(name="../../untrusted remote name", mimeType="application/vnd.google-apps.document")
    output, destination = {
        "relative": ("chosen/nested/output", drive.work / "chosen/nested/output"),
        "absolute": (str(drive.root / "chosen/nested/output"), drive.root / "chosen/nested/output"),
        "tilde": ("~/chosen/nested/output", drive.home / "chosen/nested/output"),
    }[kind]
    assert not destination.parent.exists()
    args = drive.arguments()
    args.output = output
    drive.module.drive_download(args)
    first = json.loads(capsys.readouterr().out)
    assert first["path"] == str(Path(output).expanduser())
    assert destination.read_bytes() == PAYLOAD
    assert not destination.suffix
    destination.write_bytes(b"caller intentionally replaces these bytes")
    if os.name != "nt":
        destination.chmod(0o640)
    drive.module.drive_download(args)
    assert json.loads(capsys.readouterr().out)["status"] == "downloaded"
    assert destination.read_bytes() == PAYLOAD
    if os.name != "nt":
        assert stat.S_IMODE(destination.stat().st_mode) == 0o640


def test_missing_remote_name_uses_valid_file_id(drive, capsys):
    del drive.state.metadata["name"]
    drive.module.drive_download(drive.arguments())
    assert json.loads(capsys.readouterr().out)["path"] == str(drive.work / "file_123")
    assert (drive.work / "file_123").read_bytes() == PAYLOAD


@pytest.mark.parametrize("name", ["COM10.txt", ".notes", "reunião_日本.bin"])
def test_portable_leaf_controls_are_not_silently_renamed(drive, capsys, name):
    drive.state.metadata["name"] = name
    drive.module.drive_download(drive.arguments())
    assert json.loads(capsys.readouterr().out)["path"] == str(drive.work / name)
    assert (drive.work / name).read_bytes() == PAYLOAD


def test_new_default_file_is_private_where_posix_modes_are_supported(drive, capsys):
    previous_umask = os.umask(0) if os.name != "nt" else None
    try:
        drive.module.drive_download(drive.arguments())
    finally:
        if previous_umask is not None:
            os.umask(previous_umask)
    capsys.readouterr()
    target = drive.work / "report.bin"
    assert target.read_bytes() == PAYLOAD
    if os.name != "nt":
        assert stat.S_IMODE(target.stat().st_mode) == 0o600


@pytest.mark.parametrize("kind", ["parent", "native-absolute"])
def test_default_escape_preserves_real_cwd_and_outside_sentinels(drive, capsys, kind):
    inside = drive.work / "keep.bin"
    outside = drive.root / "outside.bin"
    inside.write_bytes(b"inside sentinel")
    outside.write_bytes(b"outside sentinel")
    drive.state.metadata["name"] = "../outside.bin" if kind == "parent" else str(outside)
    before = set(drive.root.rglob("*"))
    error = drive.attempt(drive.arguments())
    assert outside.read_bytes() == b"outside sentinel"
    assert inside.read_bytes() == b"inside sentinel"
    assert set(drive.root.rglob("*")) == before
    assert error is not None
    output = capsys.readouterr()
    assert "--output" in f"{error}\n{output.err}\n{output.out}"
    assert_no_success_json(output.out)
    assert [item["kind"] for item in drive.state.requests] == ["metadata"]
    assert not drive.state.handles


@pytest.mark.parametrize("style", ["posix-absolute", "windows-absolute", "windows-rooted"])
def test_default_refuses_absolute_forms_on_both_operating_systems(drive, capsys, style):
    outside = drive.root / "outside.bin"
    inside = drive.work / "keep.bin"
    outside.write_bytes(b"outside sentinel")
    inside.write_bytes(b"inside sentinel")
    posix = outside.as_posix()
    if outside.drive:
        posix = posix[len(outside.drive):]
    drive.state.metadata["name"] = {
        "posix-absolute": posix,
        "windows-absolute": str(outside) if os.name == "nt" else "C:\\untrusted\\outside.bin",
        "windows-rooted": posix.replace("/", "\\") if os.name == "nt" else "\\untrusted\\outside.bin",
    }[style]
    before = set(drive.root.rglob("*"))
    error = drive.attempt(drive.arguments())
    assert outside.read_bytes() == b"outside sentinel"
    assert inside.read_bytes() == b"inside sentinel"
    assert set(drive.root.rglob("*")) == before
    assert error is not None
    output = capsys.readouterr()
    assert "--output" in f"{error}\n{output.err}\n{output.out}"
    assert_no_success_json(output.out)
    assert [item["kind"] for item in drive.state.requests] == ["metadata"]
    assert not drive.state.handles


@pytest.mark.parametrize("name", [
    "", ".", "..", "new-parent/file.bin", "new-parent\\file.bin", "C:relative.bin",
    "part:name.bin", "bad<name.bin", "bad>name.bin", 'bad"name.bin', "bad|name.bin",
    "bad?name.bin", "bad*name.bin", "control\x00name.bin", "control\nname.bin",
    "control\rname.bin", "control\x1fname.bin", "control\x7fname.bin", "trailing.", "trailing ",
    "NUL", "nul.pdf", "CoM1.txt", "lPt9.log", "AUX", "con.txt", "PRN.dat",
    None, 17, ["not a filename"],
])
def test_default_refuses_portable_name_policy_before_filesystem_or_media(drive, capsys, monkeypatch, name):
    drive.state.metadata["name"] = name
    inside = drive.work / "keep.bin"
    outside = drive.root / "outside.bin"
    inside.write_bytes(b"inside sentinel")
    outside.write_bytes(b"outside sentinel")
    attempts = []
    if os.name == "nt" and name in ("NUL", "nul.pdf", "CoM1.txt", "lPt9.log", "AUX", "con.txt", "PRN.dat"):
        import io

        file_io = io.FileIO
        expected = os.path.normcase(os.path.abspath(drive.work / name))

        # This is the one known target from this test vector, not a filename policy.
        # The vulnerable baseline must fail without opening a Windows DOS device.
        def trap_file_open(file, *args, **kwargs):
            if isinstance(file, (str, bytes, os.PathLike)):
                target = os.path.normcase(os.path.abspath(os.fsdecode(file)))
                if target == expected:
                    attempts.append(target)
                    raise OSError("fixture blocked DOS device open before OS access")
            return file_io(file, *args, **kwargs)

        monkeypatch.setattr(io, "FileIO", trap_file_open)
    before = set(drive.root.rglob("*"))
    error = drive.attempt(drive.arguments())
    assert inside.read_bytes() == b"inside sentinel"
    assert outside.read_bytes() == b"outside sentinel"
    assert set(drive.root.rglob("*")) == before
    assert attempts == []
    assert error is not None
    output = capsys.readouterr()
    assert "--output" in f"{error}\n{output.err}\n{output.out}"
    assert_no_success_json(output.out)
    assert [item["kind"] for item in drive.state.requests] == ["metadata"]
    assert not drive.state.handles


def test_invalid_remote_names_get_fixed_guidance_without_hostile_interpolation(drive, capsys):
    messages = []
    for name in ["untrusted\nalpha.bin", "untrusted\\beta.bin"]:
        drive.state.metadata["name"] = name
        error = drive.attempt(drive.arguments())
        assert error is not None
        output = capsys.readouterr()
        messages.append(f"{error}\n{output.err}\n{output.out}")
        assert_no_success_json(output.out)
    assert messages[0] == messages[1]
    assert "--output" in messages[0]
    assert "untrusted" not in messages[0]
    assert not drive.state.handles


def test_missing_name_fallback_must_also_be_a_portable_leaf(drive, capsys):
    del drive.state.metadata["name"]
    args = drive.arguments()
    args.file_id = "../fallback-escape.bin"
    before = set(drive.root.rglob("*"))
    error = drive.attempt(args)
    assert set(drive.root.rglob("*")) == before
    assert error is not None
    output = capsys.readouterr()
    assert "--output" in f"{error}\n{output.err}\n{output.out}"
    assert_no_success_json(output.out)
    assert not drive.state.handles


def test_existing_default_file_is_not_overwritten(drive, capsys):
    target = drive.work / "report.bin"
    outside = drive.root / "outside.bin"
    target.write_bytes(b"existing destination sentinel")
    outside.write_bytes(b"outside sentinel")
    error = drive.attempt(drive.arguments())
    assert target.read_bytes() == b"existing destination sentinel"
    assert outside.read_bytes() == b"outside sentinel"
    assert error is not None
    assert_no_success_json(capsys.readouterr().out)
    assert not drive.state.handles


@pytest.mark.parametrize("kind", ["symlink", "hardlink"])
def test_existing_default_links_preserve_both_real_sentinels(drive, capsys, kind):
    target = drive.root / "outside.bin"
    inside = drive.work / "keep.bin"
    link = drive.work / "report.bin"
    target.write_bytes(b"linked outside sentinel")
    inside.write_bytes(b"inside sentinel")
    if kind == "hardlink":
        os.link(target, link)
    else:
        try:
            link.symlink_to(target)
        except OSError as error:
            if os.name == "nt" and (
                getattr(error, "winerror", None) in {1, 5, 50, 1314}
                or error.errno in {errno.EACCES, errno.EPERM, errno.ENOTSUP}
            ):
                pytest.skip(f"Windows symlink unsupported: winerror={getattr(error, 'winerror', None)}, errno={error.errno}")
            raise
    assert os.path.samefile(link, target)
    error = drive.attempt(drive.arguments())
    assert target.read_bytes() == b"linked outside sentinel"
    assert inside.read_bytes() == b"inside sentinel"
    assert os.path.samefile(link, target)
    if kind == "symlink":
        assert link.is_symlink()
    assert error is not None
    assert_no_success_json(capsys.readouterr().out)
    assert not drive.state.handles


def test_existing_default_directory_is_preserved(drive, capsys):
    target = drive.work / "report.bin"
    outside = drive.root / "outside.bin"
    target.mkdir()
    (target / "keep.bin").write_bytes(b"directory sentinel")
    outside.write_bytes(b"outside sentinel")
    error = drive.attempt(drive.arguments())
    assert (target / "keep.bin").read_bytes() == b"directory sentinel"
    assert outside.read_bytes() == b"outside sentinel"
    assert error is not None
    assert_no_success_json(capsys.readouterr().out)
    assert not drive.state.handles


def test_downloader_construction_failure_closes_the_actual_file_handle(drive, capsys):
    drive.state.constructor_failure = True
    with pytest.raises(RuntimeError, match="fixture downloader construction failed"):
        drive.module.drive_download(drive.arguments())
    assert len(drive.state.downloaders) == 1
    assert len(drive.state.handles) == 1
    assert drive.state.handles[0].closed
    assert (drive.work / "report.bin").read_bytes() == b""
    assert_no_success_json(capsys.readouterr().out)
    assert [item["kind"] for item in drive.state.requests] == ["metadata"]


def test_real_partial_http_failure_keeps_written_chunk_and_closes_handle(drive, capsys):
    from googleapiclient.errors import HttpError

    drive.state.partial_failure = True
    with pytest.raises(HttpError) as raised:
        drive.module.drive_download(drive.arguments())
    assert raised.value.resp.status == 503
    transfers = [item for item in drive.state.requests if item["kind"] == "media"]
    assert len(transfers) == 2
    assert transfers[0]["range"].startswith("bytes=0-")
    assert transfers[1]["range"].startswith(f"bytes={len(FIRST_CHUNK)}-")
    assert (drive.work / "report.bin").read_bytes() == FIRST_CHUNK
    assert len(drive.state.handles) == 1
    assert drive.state.handles[0].closed
    assert_no_success_json(capsys.readouterr().out)
