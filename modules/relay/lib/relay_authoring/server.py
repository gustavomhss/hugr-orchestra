"""HTTP host for the versioned authoring API (`<base>api/v1/`); no Orchestra imports."""
from __future__ import annotations

from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
import json
import queue
from urllib.parse import parse_qs, unquote, urlsplit

from .config import AuthoringError
from .graph import loads
from .runs import HOST


class AuthoringServer(ThreadingHTTPServer):
    daemon_threads = True
    def __init__(self, address, application):
        self.application = application
        super().__init__(address, Handler)


class Handler(BaseHTTPRequestHandler):
    protocol_version = "HTTP/1.1"

    @property
    def app(self):
        return self.server.application

    def handle(self):
        try:
            super().handle()
        except (BrokenPipeError, ConnectionResetError):
            pass

    def send(self, body, status=200):
        payload = json.dumps(body, ensure_ascii=False, allow_nan=False).encode()
        self.send_response(status)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(payload)))
        self.send_header("Cache-Control", "no-store")
        self.send_header("X-Content-Type-Options", "nosniff")
        self.end_headers()
        self.wfile.write(payload)

    def _context(self):
        parsed = urlsplit(self.path)
        path = unquote(parsed.path)
        base = self.app.config.base_path
        if not path.startswith(base):
            raise AuthoringError("Route not found", 404, "not-found")
        self.query = parse_qs(parsed.query)
        host = self.headers.get("Host", "")
        allowed_hosts = {f"127.0.0.1:{self.server.server_port}", f"localhost:{self.server.server_port}"}
        allowed_hosts.update(urlsplit(origin).netloc for origin in self.app.config.host_origins)
        if host not in allowed_hosts:
            raise AuthoringError("Unexpected host", 403, "host-refused")
        self.origin = "http://" + host
        return path[len(base):]

    def _body(self):
        origin = self.headers.get("Origin")
        if origin and origin not in {self.origin, *self.app.config.host_origins}:
            raise AuthoringError("Origin is not an authorized host", 403, "origin-refused")
        length = int(self.headers.get("Content-Length", "0"))
        if length < 0 or length > 16*1024*1024:
            raise AuthoringError("Request body too large", 413, "body-too-large")
        body = loads(self.rfile.read(length) or b"{}")
        if not isinstance(body, dict):
            raise AuthoringError("Request body must be an object")
        return body

    def do_GET(self):
        self.dispatch("GET")

    def do_POST(self):
        self.dispatch("POST")

    def do_PATCH(self):
        self.dispatch("PATCH")

    def do_PUT(self):
        self.dispatch("PUT")

    def do_DELETE(self):
        self.dispatch("DELETE")

    def dispatch(self, method):
        try:
            route = self._context()
            body = {} if method == "GET" else self._body()
            if method == "GET" and route == "healthz":
                return self.send({"status": "ok", "service": "relay-authoring"})
            if route.startswith("api/v1/"):
                return self.api(method, route[7:], body)
            raise AuthoringError("Route not found", 404, "not-found")
        except AuthoringError as error:
            self.send({"message": str(error), "code": error.code}, error.status)
        except (ValueError, KeyError, TypeError) as error:
            self.send({"message": str(error), "code": "invalid-request"}, 400)
        except OSError as error:
            self.send({"message": str(error), "code": "storage-error"}, 500)

    def stream(self):
        events = self.app.runner.events
        channel = events.subscribe(HOST)
        self.send_response(200); self.send_header("Content-Type", "text/event-stream"); self.send_header("Cache-Control", "no-cache"); self.end_headers()
        try:
            self.wfile.write(b": relay authoring connected\n\n"); self.wfile.flush()
            while True:
                try:
                    message = channel.get(timeout=10)
                    if message is None:
                        break
                    self.wfile.write(("data: " + json.dumps(message, ensure_ascii=False) + "\n\n").encode())
                except queue.Empty:
                    self.wfile.write(b": heartbeat\n\n")
                self.wfile.flush()
        except (BrokenPipeError, ConnectionResetError):
            pass
        finally:
            events.unsubscribe(HOST, channel)

    def api(self, method, route, body):
        app = self.app
        parts = route.strip("/").split("/")
        identifier = parts[1] if len(parts) > 1 else None
        if method == "GET" and route == "bootstrap":
            return self.send(app.capabilities())
        if method == "GET" and route == "node-types":
            return self.send(app.node_types())
        if method == "GET" and route == "events":
            return self.stream()
        if parts[0] == "documents":
            if method == "GET" and len(parts) == 3 and parts[2] == "export":
                return self.send(app.export(identifier))
            if method == "GET" and len(parts) == 3 and parts[2] == "sprint":
                return self.send(app.sprint(identifier))
            if method == "GET" and len(parts) <= 2:
                return self.send(app.document(identifier) if identifier else {"items": app.documents()})
            if method == "POST" and len(parts) == 3 and parts[2] == "publish":
                return self.send(app.publish(identifier, body.get("versionId"), body.get("expectedChecksum")))
            if method == "POST" and len(parts) == 3 and parts[2] == "unpublish":
                return self.send(app.unpublish(identifier, body.get("expectedChecksum")))
            if (len(parts) == 1 and method == "POST") or (len(parts) == 2 and method in ("PATCH", "PUT")):
                return self.send(app.save(body, identifier, force=self.query.get("force") == ["true"]), 200 if identifier else 201)
            if method == "DELETE" and identifier and len(parts) == 2:
                app.store.delete(identifier); return self.send({"deleted": True})
        if parts[0] == "scopes":
            if method == "GET" and len(parts) == 1:
                return self.send({"items": app.store.scopes()})
            if (method == "POST" and len(parts) == 1) or (method in ("PATCH", "PUT") and len(parts) == 2):
                return self.send(app.store.save_scope(body, identifier))
            if method == "DELETE" and identifier and len(parts) == 2:
                app.store.delete_scope(identifier); return self.send({"deleted": True})
        if route == "skills" and method == "GET":
            return self.send({"items": app.skills.list()})
        if route == "skills/refresh" and method == "POST":
            return self.send({"items": app.skills.refresh()})
        if route == "skills/upload" and method == "POST":
            return self.send(app.skills.upload(body.get("filename"), body.get("content")), 201)
        if parts[0] == "executions":
            if method == "GET" and len(parts) == 3 and parts[2] == "audit":
                return self.send(app.audit(identifier))
            if method == "GET" and len(parts) <= 2:
                return self.send(app.store.execution(identifier) if identifier else {"items": app.store.executions(self.query.get("documentId", [None])[0])})
            if method == "POST" and identifier and len(parts) == 3 and parts[2] == "retry":
                return self.send({"executionId": app.retry(identifier)["id"]}, 202)
            if method == "POST" and len(parts) == 1:
                return self.send({"executionId": app.start(body["documentId"], body.get("destination"))["id"]}, 202)
        raise AuthoringError("This API operation is not supported", 404, "not-found")
