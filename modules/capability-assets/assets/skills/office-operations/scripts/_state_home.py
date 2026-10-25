"""Resolve the state directory for the Google Workspace helper scripts.

Credentials (OAuth client secret, token, pending auth session) live outside the
skill directory and outside any repository. Override the location with
ORCHESTRA_GOOGLE_HOME; the default is ~/.config/orchestra/google.
"""

from __future__ import annotations

import os
from pathlib import Path


def get_state_home() -> Path:
    val = os.environ.get("ORCHESTRA_GOOGLE_HOME", "").strip()
    return Path(val) if val else Path.home() / ".config" / "orchestra" / "google"


def display_state_home() -> str:
    home = get_state_home()
    try:
        return "~/" + home.relative_to(Path.home()).as_posix()
    except ValueError:
        return str(home)
