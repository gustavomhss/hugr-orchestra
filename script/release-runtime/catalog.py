import base64,hashlib,json,os
from pathlib import Path
root=Path(os.environ['VALIDATION_DIR']);files=[]
for directory in ['cli','desktop','feed']:
 for file in sorted((root/directory).rglob('*')):
  if file.is_dir():continue
  assert file.is_file() and not file.is_symlink(),file
  digest=hashlib.sha256()
  with file.open('rb') as source:
   for chunk in iter(lambda:source.read(8*1024*1024),b''):digest.update(chunk)
  files.append({'path':str(file.relative_to(root)),'size':file.stat().st_size,'sha256':digest.hexdigest()})
for directory,target in [('cli','cli'),('feed','desktop')]:
 names=set()
 for row in (root/directory/'SHA256SUMS').read_text().splitlines():
  expected,name=row.split(None,1);name=name.strip();assert '/' not in name and name not in names;names.add(name)
  assert any(f['path']==f'{target}/{name}' and f['sha256']==expected for f in files),name
 assert names=={Path(f['path']).name for f in files if f['path'].startswith(target+'/') and (f['path'].endswith('.tar.gz') if target=='cli' else not f['path'].endswith('.blockmap'))},names
for name in ['latest.yml','latest-mac.yml','latest-linux.yml']:
 lines=(root/'feed'/name).read_text().splitlines();assert [line for line in lines if line.startswith('version:')]==['version: 0.3.6']
 entries=[]
 for line in lines:
  if line.startswith('  - url: '):entries.append({'url':line.removeprefix('  - url: ')})
  elif line.startswith('    sha512: '):entries[-1]['sha512']=line.removeprefix('    sha512: ')
  elif line.startswith('    size: '):entries[-1]['size']=int(line.removeprefix('    size: '))
 assert entries,name
 for entry in entries:
  assert '/' not in entry['url'];payload=root/'desktop'/entry['url'];digest=hashlib.sha512()
  with payload.open('rb') as source:
   for chunk in iter(lambda:source.read(8*1024*1024),b''):digest.update(chunk)
  assert payload.stat().st_size==entry['size'] and base64.b64encode(digest.digest()).decode()==entry['sha512'],entry['url']
(root/'CATALOG.json').write_text(json.dumps({'version':'0.3.6','sourceSha':os.environ['SOURCE_SHA'],'files':files},indent=2)+'\n')
fixture=root/'native-fixture';fixture.mkdir();(fixture/'release-probe.ts').write_text('export function releaseProbe(value: string): string { return value.toUpperCase() }\n')
