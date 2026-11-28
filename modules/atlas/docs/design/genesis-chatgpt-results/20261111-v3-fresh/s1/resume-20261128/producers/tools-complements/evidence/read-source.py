from pathlib import Path
import hashlib
import json
import sys

root = Path('/workspace/scratch/dd08f46a3e40/agents/produce_tools')
for spec in sys.argv[1:]:
    path, _, span = spec.partition(':')
    raw = (root / 'sources' / path).read_bytes()
    lines = raw.decode('utf-8').splitlines()
    start, end = map(int, span.split('-')) if span else (1, len(lines))
    end = min(end, len(lines))
    print(f'\nSOURCE {path} lines {start}-{end}/{len(lines)}')
    for number in range(start, end + 1):
        print(f'{number}: {lines[number - 1]}')
    with (root / 'evidence' / 'reading-log.jsonl').open('a') as log:
        log.write(json.dumps({'path': path, 'start_line': start, 'end_line': end,
            'total_lines': len(lines), 'sha256': hashlib.sha256(raw).hexdigest(),
            'status': 'source_ranges_output_for_semantic_read_not_execution'}) + '\n')
