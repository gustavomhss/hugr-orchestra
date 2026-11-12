import hashlib,json,os,subprocess
from pathlib import Path
root=Path(os.environ['VALIDATION_DIR']);payload=root/'cli-unpacked';payload.mkdir()
subprocess.run(['tar','-xzf',str(root/'cli/orchestra-0.3.6-darwin-x64-baseline.tar.gz'),'-C',str(payload)],check=True)
descriptor=json.loads((payload/'distribution.json').read_text());assert descriptor['version']=='0.3.6'
for entry in descriptor['files']:
 path=payload/entry['path'];assert path.resolve().is_relative_to(payload.resolve()) and path.is_file() and not path.is_symlink()
 assert hashlib.sha256(path.read_bytes()).hexdigest()==entry['sha256'];path.chmod(0o755 if entry['executable'] else 0o644)
profile=root/'cli-profile';profile.mkdir();env={key:os.environ[key] for key in ['HOME','USER','LOGNAME','PATH'] if key in os.environ}
for key in ['XDG_DATA_HOME','XDG_CONFIG_HOME','XDG_CACHE_HOME','XDG_STATE_HOME','TMPDIR']:
 directory=profile/key;directory.mkdir();env[key]=str(directory)
env.update(ORCHESTRA_DB=':memory:',ORCHESTRA_INHERIT_CREDENTIALS='0',ORCHESTRA_CONFIG_DIR=env['XDG_CONFIG_HOME'],ORCHESTRA_CREDENTIAL_KEY_FILE=str(profile/'credential.key'),LANG='C',LC_ALL='C')
version=subprocess.run([str(payload/'bin/orchestra'),'--version'],env=env,cwd=root/'native-fixture',capture_output=True,text=True,timeout=60);assert version.returncode==0 and version.stdout.strip()=='0.3.6'
proofs={name:json.loads((root/(name+'.json')).read_text()) for name in ['packaged-resources','packaged-runtime','packaged-session-checks','packaged-native-search','mac-installer-app-identity']}
assert proofs['packaged-runtime']['health']['version']=='0.3.6' and proofs['packaged-runtime']['ui']['ready'] and not proofs['packaged-runtime']['exceptions']
receipt={'schemaVersion':1,'version':'0.3.6','sourceSha':os.environ['SOURCE_SHA'],'cliRunId':43127897738,'desktopRunId':43127897841,'qualificationRunId':43128455889,'fullRunId':43127893569,'runtimeRunId':int(os.environ['GITHUB_RUN_ID']),'validation':{'result':'pass','appVersion':proofs['packaged-resources']['appVersion'],'cliVersion':version.stdout.strip(),'environment':'macos-15-intel, fresh isolated profile, existing artifacts, no source build','proofs':proofs},'files':json.loads((root/'CATALOG.json').read_text())['files']}
(root/'VALIDATION.json').write_text(json.dumps(receipt,indent=2)+'\n')
