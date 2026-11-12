import hashlib,json,os,plistlib,stat,sys
from pathlib import Path

def inventory(app):
 result={}
 for path in sorted(app.rglob('*')):
  name=str(path.relative_to(app));mode=path.lstat().st_mode
  if stat.S_ISLNK(mode):result[name]={'link':str(path.readlink())};continue
  if not stat.S_ISREG(mode):continue
  digest=hashlib.sha256()
  with path.open('rb') as file:
   for chunk in iter(lambda:file.read(8*1024*1024),b''):digest.update(chunk)
  result[name]={'sha256':digest.hexdigest(),'size':path.stat().st_size,'executable':bool(mode&0o111)}
 return result
zip_app,dmg_app=map(Path,sys.argv[1:3]);a=inventory(zip_app);b=inventory(dmg_app)
if a!=b:
 changed=[name for name in sorted(a.keys()|b.keys()) if a.get(name)!=b.get(name)]
 raise SystemExit('DMG/ZIP app identity differs: '+repr(changed[:30]))
with (zip_app/'Contents/Info.plist').open('rb') as file:version=plistlib.load(file)['CFBundleShortVersionString']
assert version=='0.3.6',version
record={'version':version,'zipAndDmgAppsIdentical':True,'entries':len(a),'logicalTreeSha256':hashlib.sha256(json.dumps(a,sort_keys=True,separators=(',',':')).encode()).hexdigest()}
(Path(os.environ['VALIDATION_DIR'])/'mac-installer-app-identity.json').write_text(json.dumps(record,indent=2)+'\n');print(json.dumps(record))
