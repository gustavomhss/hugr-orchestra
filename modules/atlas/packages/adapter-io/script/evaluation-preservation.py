"""Read-only preservation observations. Generic paths only; no campaign payloads.
Point-in-time evidence, not atomic protection against concurrent hostile writers.
"""
import hashlib
import os
import stat
from pathlib import Path

def snapshot(root):
    root = Path(root)
    result = {}
    def record(path):
        st = path.lstat()
        row = {'mode': st.st_mode, 'inode': st.st_ino, 'dev': st.st_dev}
        if stat.S_ISREG(st.st_mode):
            row.update(bytes=st.st_size, sha256=hashlib.sha256(path.read_bytes()).hexdigest())
        elif stat.S_ISLNK(st.st_mode):
            row['target'] = os.readlink(path)
        elif not stat.S_ISDIR(st.st_mode):
            raise RuntimeError('PRESERVATION_UNEXPECTED_TYPE')
        result[str(path.relative_to(root))] = row
    if not stat.S_ISDIR(root.lstat().st_mode):
        raise RuntimeError('PRESERVATION_ROOT_NOT_DIRECTORY')
    record(root)
    def fail(error):
        raise error
    for directory, dirs, files in os.walk(root, followlinks=False, onerror=fail):
        for name in dirs + files:
            record(Path(directory) / name)
    return result

def record_after(result, label, root, before):
    """The runner's actual failure-routing path, also tested with synthetic trees."""
    try:
        after = snapshot(root)
    except Exception as error:
        result['cleanup_errors'].append(label + '_PRESERVATION_UNKNOWN:' + type(error).__name__)
        return None
    if after != before:
        result['cleanup_errors'].append(label + '_CHANGED')
    return after
