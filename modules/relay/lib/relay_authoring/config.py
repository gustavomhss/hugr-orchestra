"""Host-supplied configuration; no dependency on Orchestra globals or checkout paths."""
from __future__ import annotations

from dataclasses import dataclass
import getpass
import hashlib
from pathlib import Path
import re
from urllib.parse import urlsplit

ROOT = Path(__file__).resolve().parents[2]


class AuthoringError(ValueError):
    def __init__(self, message: str, status: int = 400, code: str = "invalid-request"):
        super().__init__(message)
        self.status, self.code = status, code


def normalize_base_path(value: str) -> str:
    value = value.rstrip("/") + "/"
    if not re.fullmatch(r"/(?:[A-Za-z0-9._~-]+/)*", value) or any(p in (".", "..") for p in value.split("/")):
        raise AuthoringError("base_path must be a confined root-relative URL prefix")
    return value


def normalize_origin(value: str) -> str:
    parsed = urlsplit(value)
    if parsed.scheme not in ("http", "https") or not parsed.netloc or parsed.username or parsed.password or parsed.query or parsed.fragment or parsed.path not in ("", "/"):
        raise AuthoringError("Host origin must be an HTTP(S) origin without a path")
    return f"{parsed.scheme}://{parsed.netloc}"


@dataclass(frozen=True)
class Principal:
    """Identity projection only. The Orchestra host owns authentication."""
    id: str
    name: str
    email: str = ""


@dataclass(frozen=True)
class AuthoringConfig:
    workspace: Path
    data_dir: Path
    base_path: str = "/relay/"
    host_origins: tuple[str, ...] = ()
    skill_roots: tuple[Path, ...] = ()
    relay_root: Path = ROOT
    relay_url: str | None = None
    principal: Principal | None = None

    def __post_init__(self):
        for name in ("workspace", "data_dir", "relay_root"):
            object.__setattr__(self, name, Path(getattr(self, name)).expanduser().resolve())
        if not self.workspace.is_dir():
            raise AuthoringError("Workspace directory does not exist")
        object.__setattr__(self, "base_path", normalize_base_path(self.base_path))
        object.__setattr__(self, "host_origins", tuple(normalize_origin(o) for o in self.host_origins))
        if self.relay_url:
            parsed = urlsplit(self.relay_url)
            if parsed.scheme not in ("http", "https") or not parsed.netloc:
                raise AuthoringError("relay_url must be an HTTP(S) daemon URL")
        if self.principal is None:
            name = getpass.getuser()
            object.__setattr__(self, "principal", Principal("local-" + hashlib.sha256(name.encode()).hexdigest()[:16], name))

    @property
    def workspace_id(self):
        return hashlib.sha256(str(self.workspace).encode()).hexdigest()[:24]
