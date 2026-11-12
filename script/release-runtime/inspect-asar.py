import json,struct,sys,os
from pathlib import Path
app=Path(sys.argv[1]);asar=app/'Contents/Resources/app.asar'
with asar.open('rb') as f:
 prefix=f.read(16);header_size=struct.unpack_from('<I',prefix,4)[0];json_size=struct.unpack_from('<I',prefix,12)[0]
 header=json.loads(f.read(json_size))
files={}
def walk(tree,root=''):
 for name,node in tree.get('files',{}).items():
  key=f'{root}/{name}'.lstrip('/')
  if 'files' in node:walk(node,key)
  else:files[key]=node
walk(header)
def readfile(name):
 node=files[name]
 if node.get('unpacked'):return Path(str(asar)+'.unpacked',name).read_bytes()
 with asar.open('rb') as f:f.seek(8+header_size+int(node['offset']));return f.read(node['size'])
package=json.loads(readfile('package.json'))
maps=[p for p in files if p.endswith(('.js.map','.mjs.map','.cjs.map','.css.map'))]
resources=app/'Contents/Resources'
physical=[str(p.relative_to(resources)) for p in resources.rglob('*') if p.is_file()]
result={'appVersion':package['version'],'asarBytes':asar.stat().st_size,'asarFileCount':len(files),'excludedDebugMapCount':len(maps),'typescriptFiles':sum(p.endswith('.ts') for p in files),'nativeFiles':sum(p.endswith('.node') for p in files)+sum(p.endswith('.node') for p in physical),'wasmFiles':sum(p.endswith('.wasm') for p in files)+sum(p.endswith('.wasm') for p in physical),'localeResources':sum('.lproj/' in str(p) or p.suffix=='.pak' for p in app.rglob('*') if p.is_file()),'omniResources':[p for p in physical if p.startswith('omni/')],'cliManifests':[p for p in physical if p.startswith('cli/') and p.endswith('.json')],'playbookFiles':sum(p.startswith('playbooks/') for p in physical)}
assert result['appVersion']=='0.3.7',result
assert not maps,maps[:10]
assert all(result[key]>0 for key in ['typescriptFiles','nativeFiles','wasmFiles','localeResources','playbookFiles']),result
assert {'omni/hugr_omni.node','omni/hugr-omni-supervisor'}<=set(result['omniResources']),result
assert 'cli/manifest.json' in result['cliManifests'],result
out=Path(os.environ['VALIDATION_DIR'])/'packaged-resources.json';out.write_text(json.dumps(result,indent=2)+'\n')
(Path(os.environ['VALIDATION_DIR'])/'asar-inventory.json').write_text(json.dumps(sorted(files),indent=2)+'\n')
print(json.dumps(result,indent=2))
