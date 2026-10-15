"""Read repository and machine skill catalogs and retain explicit Markdown uploads."""
from __future__ import annotations

import hashlib
import os
from pathlib import Path
import re
import threading

from .config import AuthoringError

LIMIT = 2 * 1024 * 1024


class Skills:
    def __init__(self, workspace: Path, data_dir: Path, extra_roots=()):
        self.workspace = Path(workspace)
        self.uploads = Path(data_dir) / "skills"
        self.extra_roots = tuple(Path(root).expanduser().resolve() for root in extra_roots)
        self.lock = threading.RLock()
        self.entries = {}

    def refresh(self):
        home = Path.home()
        # The host passes its own skill directories as extra roots.
        roots = [(self.workspace / name, "repo") for name in (".claude/skills", ".agents/skills", ".codex/skills")]
        roots += [(home / name, "machine") for name in (".claude/skills", ".agents/skills", ".codex/skills")]
        roots += [(root, "machine") for root in self.extra_roots]
        entries, seen = {}, set()

        def record(path, origin, uploaded=False):
            canonical = path.resolve()
            if canonical in seen:
                return
            seen.add(canonical)
            if path.stat().st_size > LIMIT:
                return
            content = path.read_bytes()
            text = content.decode("utf-8")
            if not text.strip() or "\0" in text:
                return
            key = ("upload-" if uploaded else "skill-") + hashlib.sha256(str(canonical).encode()).hexdigest()[:24]
            name = path.name.split("--", 1)[-1] if uploaded else path.parent.name
            entries[key] = {"id": key, "name": name, "origin": origin, "path": str(canonical), "sha256": hashlib.sha256(content).hexdigest()}

        for root, origin in roots:
            if not root.exists():
                continue
            visited = set()
            for directory, dirs, files in os.walk(root, followlinks=True):
                canonical = Path(directory).resolve()
                if canonical in visited:
                    dirs[:] = []
                    continue
                visited.add(canonical)
                dirs[:] = sorted(d for d in dirs if d not in ("node_modules", ".git", "__pycache__"))
                if "SKILL.md" in files:
                    record(Path(directory) / "SKILL.md", origin)
        if self.uploads.exists():
            for path in sorted(self.uploads.glob("*.md")):
                record(path, "uploaded", True)
        with self.lock:
            self.entries = entries
        return self.list()

    def list(self):
        with self.lock:
            return sorted((dict(item) for item in self.entries.values()), key=lambda item: (item["origin"], item["name"].casefold()))

    def resolve(self, identifier):
        if not isinstance(identifier, str):
            raise AuthoringError("Choose a single skill")
        with self.lock:
            entry = self.entries.get(identifier)
        if entry is None:
            raise AuthoringError("Skill unavailable", 404, "skill-unavailable")
        try:
            content = Path(entry["path"]).read_bytes()
            text = content.decode("utf-8")
        except (OSError, UnicodeError) as error:
            raise AuthoringError("Could not load the skill", 409, "skill-unavailable") from error
        if len(content) > LIMIT or not text.strip() or "\0" in text:
            raise AuthoringError("The skill is empty, invalid or over the size limit")
        return {**entry, "sha256": hashlib.sha256(content).hexdigest(), "content": text}

    def upload(self, filename, content):
        if not isinstance(filename, str) or not re.fullmatch(r"[^/\\\0]{1,200}\.md", filename, re.I):
            raise AuthoringError("Attach a .md file")
        if not isinstance(content, str) or not content.strip() or "\0" in content or len(content.encode()) > LIMIT:
            raise AuthoringError("The .md file is invalid, empty or larger than 2 MiB")
        digest = hashlib.sha256(content.encode("utf-8")).hexdigest()
        self.uploads.mkdir(parents=True, exist_ok=True)
        path = self.uploads / (digest[:24] + "--" + filename)
        with self.lock:
            if not path.exists():
                with path.open("x", encoding="utf-8", newline="") as target:
                    target.write(content)
        self.refresh()
        return next(entry for entry in self.list() if entry["path"] == str(path.resolve()))
