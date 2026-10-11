"""`relay-api serve`: run the authoring API for one workspace on a loopback port."""
import argparse
from pathlib import Path
import sys

from .application import AuthoringApplication
from .config import ROOT, AuthoringConfig, AuthoringError
from .server import AuthoringServer


def main(argv=None):
    parser = argparse.ArgumentParser(prog="relay-api", description="Relay authoring API: workflow and hook documents, sprint compilation, publication and gate evaluation")
    parser.add_argument("command", choices=("serve",))
    parser.add_argument("--data-dir", type=Path, default=Path.home() / ".relay/authoring")
    parser.add_argument("--workspace", type=Path, default=Path.cwd())
    parser.add_argument("--relay-root", type=Path, default=ROOT)
    parser.add_argument("--relay-url")
    parser.add_argument("--port", type=int, default=8790)
    parser.add_argument("--base-path", default="/relay/")
    parser.add_argument("--host-origin", action="append", default=[])
    parser.add_argument("--skill-root", action="append", type=Path, default=[])
    args = parser.parse_args(argv)
    try:
        config = AuthoringConfig(workspace=args.workspace, data_dir=args.data_dir, base_path=args.base_path,
                                 host_origins=tuple(args.host_origin), skill_roots=tuple(args.skill_root), relay_root=args.relay_root, relay_url=args.relay_url)
        app = AuthoringApplication(config)
        app.seed_profiles()
        server = AuthoringServer(("127.0.0.1", args.port), app)
        print(f"Relay authoring API: http://127.0.0.1:{server.server_port}{config.base_path}api/v1/", flush=True)
        try:
            server.serve_forever()
        except KeyboardInterrupt:
            pass
        finally:
            server.server_close(); app.close()
        return 0
    except (AuthoringError, OSError) as error:
        print(f"relay-api: {error}", file=sys.stderr)
        return 1
