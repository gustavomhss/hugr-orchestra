#!/usr/bin/env python3
"""Extract the seven historical bodies from preserved prompts without rewriting bytes."""
import hashlib
import json
from pathlib import Path
import re
import sys

root = Path(sys.argv[1]).resolve()
expected = {
    's1.l2.runtime-ownership': '8da484ba0a8f30f0a0da90c02b00650f9b48ed54294dcb0224533c36115cc9f0',
    's1.l3.session-provider-flow': 'dd650372006f3ec161f50618ff92c409eef368bd34b7ea401b80d2ce416b9e2a',
    's1.l3.persistence-evidence-failures': 'de4c070a6c99b11cbe5e8a85403769fd388da53215233a02774c3a1869e4f3a2',
    's1.l3.ownership-impact-map': '3548f7f3689e5ffcbf2eeeb62bf86f56d03cfffe091072c86efcbb1abc88eda4',
    's1.l4.ownership-entry': 'aac50370d83ee11af40206d6ee1cc542d1868a45397e1849b0c0c896c5e67a7b',
    's1.l4.safe-change': '64ccbc99fbbe86d975563f429117198ed662e126c63502965c6cb5f2399f25a0',
    's1.l4.diagnosis-maintenance': '8ab87cd4bbebb0cb902e3b59657237a6b42b015f0376fa921385bd6d13f9e493',
}
records = []
for prompt in sorted((root / 'prompts').glob('s1-impact-*-prompt.txt')):
    data = prompt.read_bytes()
    for match in re.finditer(rb'<atribuido key="([^"]+)" sha256="([^"]+)">\n(.*?)\n</atribuido>', data, re.S):
        key, declared, body = match.groups()
        key, declared = key.decode(), declared.decode()
        actual = hashlib.sha256(body).hexdigest()
        if expected.get(key) != declared or actual != declared:
            raise SystemExit('Historical body mismatch: ' + key)
        destination = root / 'bodies' / (key + '.md')
        if not destination.exists() or destination.read_bytes() != body:
            raise SystemExit('Recovered body differs: ' + key)
        records.append({'key':key,'sha256':actual,'byte_length':len(body),'prompt':prompt.name,'prompt_sha256':hashlib.sha256(data).hexdigest()})
if len(records) != len(expected) or {row['key'] for row in records} != set(expected):
    raise SystemExit('Historical body membership mismatch')
print(json.dumps({'state':'PASS_BYTES_ONLY','count':len(records),'bodies':records},indent=2))
