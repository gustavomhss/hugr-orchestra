import os, sys
_impl = os.environ.get("RELAY_IMPL") or os.path.join(os.path.dirname(__file__), "..", "repo")
sys.path.insert(0, _impl)
