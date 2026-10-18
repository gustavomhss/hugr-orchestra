import os
import sys

# Resolve `import billing` to the implementation under test.
# Default: the campaign's repo/ (the Runner edits it). The grader can point at any
# arm's output dir via RELAY_IMPL (so M / R / D outputs are graded by the same checks).
_impl = os.environ.get("RELAY_IMPL") or os.path.join(os.path.dirname(__file__), "..", "repo")
sys.path.insert(0, _impl)
