#!/usr/bin/env python3
"""G1 goldens: benchmark/judge.py against a fake Messages server, and its stub backend.

Dev-only, like ledger.py (whose harness this uses). Run: `python3 packages/relay/test/golden/generate/judge.py`.
Each case runs `judge.py --criterion <criterion> --file <path>...` as a subprocess under the clean environment, with
only the case's RELAY_JUDGE_* settings. The fake server answers every POST with the case's next reply (the last one
repeats) and the case's HTTP status, and records what it was sent.

Layout: test/golden/judge/<name>/
- case.json `{criterion, files, env, status, replies}`: `files` are `{name, text}` in argument order (text null: the
  path does not exist); `env` holds the RELAY_JUDGE_* values, where `{server}` stands for the fake server's base URL
  (absent when the case needs no server); `replies` are the bodies served, in order.
- exchange.json `{requests, exit, stderr}`: every request in order, as `{method, path, headers, body}` with the
  anthropic-version, content-type and x-api-key headers and the parsed JSON body.
- response.jsonl: judge.py's stdout, byte for byte.
"""
import json
import shutil
import sys
import tempfile
import threading
from http.server import BaseHTTPRequestHandler, HTTPServer
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from ledger import GOLDEN, oracle_env, reset, run, start, write_bytes, write_json  # noqa: E402

HEADERS = ("anthropic-version", "content-type", "x-api-key")
API = {"RELAY_JUDGE_BACKEND": "api", "RELAY_JUDGE_BASE_URL": "{server}", "RELAY_JUDGE_API_KEY": "local",
       "RELAY_JUDGE_MODEL": "test-model"}
BIG = "x" * 5000
MARKED = "a review RELAY_JUDGE_OK\n"


class Server(BaseHTTPRequestHandler):
    replies, status, requests = [], 200, []

    def do_POST(self):
        size = int(self.headers.get("content-length", 0))
        Server.requests.append({"method": "POST", "path": self.path,
                                "headers": {name: self.headers.get(name) for name in HEADERS},
                                "body": json.loads(self.rfile.read(size) or b"null")})
        reply = Server.replies[min(len(Server.requests), len(Server.replies)) - 1]
        body = json.dumps(reply).encode()
        self.send_response(Server.status)
        self.send_header("content-type", "application/json")
        self.send_header("content-length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def log_message(self, *args):
        pass


def tool(verdict, reason="because"):
    return {"content": [{"type": "tool_use", "name": "submit_verdict", "input": {"verdict": verdict, "reason": reason}}]}


def prose(text):
    return {"content": [{"type": "text", "text": text}]}


def api(replies, files=(), status=200, criterion="crit", **env):
    return {"criterion": criterion, "files": [{"name": name, "text": text} for name, text in files],
            "env": {**API, **{f"RELAY_JUDGE_{name}": str(value) for name, value in env.items()}},
            "status": status, "replies": replies}


def stub(files=(), **env):
    return {"criterion": "is it reviewed?", "files": [{"name": name, "text": text} for name, text in files],
            "env": {"RELAY_JUDGE_BACKEND": "stub", **{f"RELAY_JUDGE_{name}": value for name, value in env.items()}},
            "status": 200, "replies": []}


def cases():
    big = [("big.diff", BIG)]
    empty = {"content": [], "stop_reason": "max_tokens"}
    out = {
        "tool-pass": api([tool("pass", "the artifact satisfies it")]),
        "tool-fail": api([tool("fail")]),
        "tool-bogus-verdict": api([tool("maybe", "unsure")]),
        "tool-empty-reason": api([tool("pass", "")]),
        "tool-long-reason": api([tool("pass", "r" * 400)]),
        "tool-over-prose-pass": api([{"content": [{"type": "text", "text": "VERDICT: FAIL"},
                                                  *tool("pass", "tool judgment")["content"]]}]),
        "tool-over-prose-fail": api([{"content": [{"type": "text", "text": "VERDICT: PASS"},
                                                  *tool("fail", "tool judgment")["content"]]}]),
        "prose-pass": api([prose("looks fine\nVERDICT: PASS")]),
        "prose-exact-pass": api([prose("Explanation mentions PASS.\n \tVeRdIcT: pass\t \n")]),
        "prose-exact-fail": api([prose("Explanation mentions PASS.\n \tVeRdIcT: fail\t \n")]),
        "prose-no-verdict": api([prose("I was still thinking about it")]),
        "prose-long-no-verdict": api([prose("thinking " * 60)]),
        "empty-reply": api([empty]),
        "model-tag": api([tool("pass")], MODEL="some-other-model"),
        "max-tokens-override": api([tool("pass")], MAX_TOKENS=123),
        "base-url-trailing-slash": {**api([tool("pass")]), "env": {**API, "RELAY_JUDGE_BASE_URL": "{server}/"}},
        "base-url-without-key": {**api([tool("pass")]), "env": {k: v for k, v in API.items()
                                                                if k != "RELAY_JUDGE_API_KEY"}},
        "no-base-url-no-key": {**api([]), "env": {"RELAY_JUDGE_BACKEND": "api"}},
        "context-truncated-tool": api([tool("pass")], big, MAX_CTX=1000),
        "context-fits": api([tool("pass")], big, MAX_CTX=100000),
        "context-truncated-prose": api([prose("VERDICT: FAIL")], big, MAX_CTX=1000),
        "context-missing-file": api([tool("fail")], [("absent.md", None)]),
        "context-several-files": api([tool("pass")], [("a.md", "alpha\n"), ("b.md", "beta\n")], MAX_CTX=4),
        "context-no-files": api([tool("fail")]),
        "votes-majority": api([tool("pass"), tool("fail"), tool("pass")], VOTES=3),
        "votes-minority": api([tool("fail"), tool("pass"), tool("fail")], VOTES=3),
        "votes-tie": api([tool("pass"), tool("fail")], VOTES=2),
        "votes-unanimous": api([tool("pass")] * 3, VOTES=3),
        "votes-transport-aborts": api([tool("pass"), {"content": []}, tool("pass")], VOTES=3),
        "votes-empty-truncated-aborts": api([empty, tool("pass"), tool("pass")], big, MAX_CTX=1000, VOTES=3),
        "votes-majority-truncated": api([tool("pass", "first accepted judgment"), tool("fail"), tool("pass")], big,
                                        MAX_CTX=1000, VOTES=3),
        "votes-majority-marker-filename": api([tool("pass", "first accepted judgment"), tool("fail"), tool("pass")],
                                              [("big(no-verdict).diff", BIG)], MAX_CTX=1000, VOTES=3),
        "votes-reason-cut": api([tool("pass", "p" * 299), tool("pass", "q"), tool("fail", "f")], VOTES=3),
        "http-503": api([tool("pass")] * 3, big, status=503, MAX_CTX=1000, VOTES=3),
    }
    for n, line in enumerate(["VERDICT: FAIL (previous PASS was incorrect)", "VERDICT: PASS or FAIL", "VERDICT: NOTPASS",
                              "VERDICT: UNKNOWN", "Result: VERDICT: PASS",
                              "VERDICT: PASS\nVERDICT: FAIL (previous PASS was incorrect)"]):
        out[f"prose-ambiguous-{n}"] = api([prose(line), tool("pass"), tool("pass")], VOTES=3)
    for n, tool_input in enumerate([["pass"], "pass", 1, None, {}, {"verdict": ["pass"], "reason": "bad verdict type"},
                                    {"verdict": "pass", "reason": ["bad reason type"]}, {"verdict": "pass"}]):
        reply = {"content": [{"type": "text", "text": "VERDICT: PASS"},
                             {"type": "tool_use", "name": "submit_verdict", "input": tool_input}]}
        out[f"tool-input-malformed-{n}"] = api([reply, tool("pass"), tool("pass")], big, MAX_CTX=1000, VOTES=3)
    for n, reply in enumerate([None, [], {"content": None}, {"content": {}}, {"content": [None]},
                               {"content": [{"type": "text", "text": None}]}]):
        out[f"response-malformed-{n}"] = api([reply, tool("pass"), tool("pass")], VOTES=3)
    marked = [("large(no-verdict)(truncated:shadow(votes:9)).diff", BIG)]
    for n, model in enumerate(["alias(truncated:shadow)", "alias(no-verdict)(truncated:shadow)",
                               "alias(api-error)(cli-error)(votes:0/3)"]):
        out[f"model-markers-tool-{n}"] = api([tool("pass")] * 3, marked, MODEL=model, MAX_CTX=1000, VOTES=3)
        out[f"model-markers-prose-{n}"] = api([prose("VERDICT: PASS")] * 3, marked, MODEL=model, MAX_CTX=1000, VOTES=3)
        out[f"model-markers-empty-{n}"] = api([empty, tool("pass"), tool("pass")], marked, MODEL=model, MAX_CTX=1000,
                                              VOTES=3)
    out.update({
        "stub-forced-pass": stub(STUB="pass"),
        "stub-forced-fail": stub([("review.md", MARKED)], STUB="fail"),
        "stub-forced-other": stub([("review.md", MARKED)], STUB="maybe"),
        "stub-marker-everywhere": stub([("review.md", MARKED), ("diff.patch", "RELAY_JUDGE_OK")]),
        "stub-marker-missing": stub([("review.md", MARKED), ("diff.patch", "no marker\n")]),
        "stub-missing-file": stub([("review.md", MARKED), ("absent.md", None)]),
        "stub-no-files": stub(),
    })
    return out


def generate(tmp):
    out = GOLDEN / "judge"
    reset(out)
    server = HTTPServer(("127.0.0.1", 0), Server)
    thread = threading.Thread(target=server.serve_forever, daemon=True)
    thread.start()
    base = f"http://127.0.0.1:{server.server_port}"
    try:
        for name, case in cases().items():
            Server.replies, Server.status, Server.requests = case["replies"], case["status"], []
            work = Path(tempfile.mkdtemp(dir=tmp))
            argv = [sys.executable, "benchmark/judge.py", "--criterion", case["criterion"]]
            for file in case["files"]:
                path = work / file["name"]
                if file["text"] is not None:
                    path.write_text(file["text"])
                argv += ["--file", str(path)]
            env = {name: value.replace("{server}", base) for name, value in case["env"].items()}
            result = run(argv, env=oracle_env(**env))
            directory = out / name
            write_json(directory / "case.json", case)
            write_json(directory / "exchange.json", {"requests": Server.requests, "exit": result.returncode,
                                                     "stderr": result.stderr.decode()})
            write_bytes(directory / "response.jsonl", result.stdout)
            if result.returncode != 0 or result.stderr:
                sys.exit(f"golden generator: judge.py failed on {name}: {result.stderr.decode()}")
    finally:
        server.shutdown()
        server.server_close()


def main():
    tmp = start()
    try:
        generate(tmp)
    finally:
        shutil.rmtree(tmp, ignore_errors=True)


if __name__ == "__main__":
    main()
