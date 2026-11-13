from pathlib import Path
import json,hashlib
p=Path(__file__).resolve().parent
for name,x in json.loads((p/'pins.json').read_bytes()).items():
 b=(p/name).read_bytes();assert len(b)==x['bytes'] and hashlib.sha256(b).hexdigest()==x['sha256'],name
print('Frozen source pins verified')
