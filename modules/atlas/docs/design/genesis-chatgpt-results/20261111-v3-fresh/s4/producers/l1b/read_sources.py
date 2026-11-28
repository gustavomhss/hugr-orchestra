from pathlib import Path
import json, re, sys

root = Path('/workspace/scratch/aff930d22ec7/s4/source')
out = Path('/workspace/scratch/aff930d22ec7/s4/producers/l1b/inspection-log.json')
log = json.loads(out.read_text()) if out.exists() else []
code_only = len(sys.argv) > 2 and sys.argv[2] == 'code'
for path, ranges in json.loads(sys.argv[1]).items():
    assert not path.startswith('/') and '..' not in Path(path).parts
    lines = (root / path).read_text().splitlines()
    print('\nFILE', path)
    actual = []
    for first, last in ranges:
        last = min(last, len(lines))
        actual.append([first, last])
        for n in range(first, last + 1):
            if code_only and (not lines[n-1].strip() or re.match(r'^\s*(//|/\*|\*)', lines[n-1])):
                continue
            print(f'{n:4} {lines[n-1]}')
    log.append({'path': path, 'ranges': actual, 'reader': '/root/producer_l1a', 'mode': 'code-lines-inspected' if code_only else 'source-excerpt-inspection'})
out.write_text(json.dumps(log, indent=2) + '\n')
