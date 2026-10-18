import os
import sys

# Resolve `import billing` to the implementation under test (held-out grader).
# Identical mechanism to checks/conftest.py: default to the campaign's repo/,
# but allow the grader to point at any arm's output dir via RELAY_IMPL.
_impl = os.environ.get("RELAY_IMPL") or os.path.join(os.path.dirname(__file__), "..", "repo")
sys.path.insert(0, _impl)
