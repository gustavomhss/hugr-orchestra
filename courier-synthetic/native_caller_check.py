"""Synthetic native-caller evidence checker; bytes in, bytes out, never ACKs."""
from __future__ import annotations

import hashlib
import json
from typing import Any


def sha256(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def _tuple_matches(value: Any, expected: dict[str, Any]) -> bool:
    if not isinstance(value, dict):
        return False
    for key in ("case", "sequence", "offset", "grant_sha256"):
        if type(value.get(key)) is not type(expected[key]) or value.get(key) != expected[key]:
            return False
    return True


def verify_capture(
    *,
    descriptor: dict[str, Any],
    release: dict[str, Any],
    attempt: dict[str, Any],
    grant_bytes: bytes,
    fragments: list[dict[str, Any]],
    terminal: dict[str, Any] | None,
    terminal_binding: dict[str, Any] | None,
    complete: bool,
) -> dict[str, Any]:
    """Verify one observed stdout byte stream against raw grant and terminal evidence.

    Each fragment is {"offset": absolute_byte_offset, "data": bytes}. The terminal
    binding is the caller-observed terminal tuple; the supervisor's terminal.json
    itself intentionally contains only state/returncode/chunk metadata.
    """
    failure = {"advance": None, "ack_allowed": False, "chunk_verified": False}
    try:
        if complete is not True or terminal is None or terminal_binding is None:
            return failure
        if not isinstance(grant_bytes, bytes) or not isinstance(fragments, list) or not fragments:
            return failure

        expected = {
            "case": descriptor["case"],
            "sequence": descriptor["sequence"],
            "offset": descriptor["offset"],
            "grant_sha256": sha256(grant_bytes),
        }
        if type(expected["sequence"]) is not int or type(expected["offset"]) is not int:
            return failure
        if expected["sequence"] < 1 or expected["offset"] < 0:
            return failure
        if not all(_tuple_matches(item, expected) for item in (descriptor, release, attempt, terminal_binding)):
            return failure

        # Parse for semantic fields only. The grant digest above is over its exact
        # original bytes; JSON is never re-serialized to manufacture a digest.
        grant = json.loads(grant_bytes.decode("utf-8", errors="strict"))
        if not isinstance(grant, dict):
            return failure
        if grant.get("case") != expected["case"] or type(grant.get("sequence")) is not int or grant["sequence"] != expected["sequence"]:
            return failure
        if type(grant.get("response_bytes")) is not int or grant["response_bytes"] < 0:
            return failure
        response_sha = grant.get("response_sha256")
        if not isinstance(response_sha, str) or len(response_sha) != 64:
            return failure

        cursor = expected["offset"]
        payload_parts: list[bytes] = []
        for fragment in fragments:
            if not isinstance(fragment, dict):
                return failure
            data = fragment.get("data")
            offset = fragment.get("offset")
            if not isinstance(data, bytes) or not data or type(offset) is not int or offset != cursor:
                return failure
            payload_parts.append(data)
            cursor += len(data)
        payload = b"".join(payload_parts)
        if sha256(payload) != terminal["chunk"]["chunk_sha256"]:
            return failure
        if terminal.get("stdout_sha256") != sha256(payload):
            return failure

        if terminal.get("state") != "CHILD_EXIT0_CHUNK_DURABLE":
            return failure
        if type(terminal.get("direct_child_returncode")) is not int or terminal["direct_child_returncode"] != 0:
            return failure
        chunk = terminal["chunk"]
        if not isinstance(chunk, dict):
            return failure
        checks = {
            "start": expected["offset"],
            "end_exclusive": cursor,
            "total_bytes": grant["response_bytes"],
            "response_sha256": response_sha,
            "chunk_sha256": sha256(payload),
        }
        if any(type(chunk.get(k)) is not type(v) or chunk.get(k) != v for k, v in checks.items()):
            return failure
        if cursor > grant["response_bytes"]:
            return failure
        if cursor == 0 or cursor > grant["response_bytes"]:
            return failure
        return {"advance": cursor, "ack_allowed": False, "chunk_verified": True}
    except (AssertionError, KeyError, TypeError, ValueError, UnicodeError, AttributeError):
        return failure
