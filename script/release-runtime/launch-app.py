import json,os,socket,subprocess,sys
from pathlib import Path
root=Path(os.environ['VALIDATION_DIR']);base=root/'runtime-desktop';app=Path(sys.argv[1])
for name in ['config','tmp']:(base/name).mkdir(parents=True,exist_ok=True)
with socket.socket() as probe:assert probe.connect_ex(('127.0.0.1',9236))!=0,'Validation CDP port already in use'
env={key:os.environ[key] for key in ['HOME','USER','LOGNAME','__CF_USER_TEXT_ENCODING'] if key in os.environ}
env.update(PATH='/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin',LANG='C',LC_ALL='C',LC_CTYPE='C',SHELL='/usr/bin/false',TMPDIR=str(base/'tmp'),ORCHESTRA_TEST_ONBOARDING='1',ORCHESTRA_INHERIT_CREDENTIALS='0',ORCHESTRA_CONFIG_DIR=str(base/'config'),ORCHESTRA_CREDENTIAL_KEY_FILE=str(base/'credential.key'),ORCHESTRA_DISABLE_AUTOUPDATE='1',NO_COLOR='1')
binaries=[file for file in (app/'Contents/MacOS').iterdir() if file.is_file()];assert len(binaries)==1,binaries
with (base/'app.log').open('wb') as log:
 proc=subprocess.Popen([str(binaries[0]),'--remote-debugging-port=9236','--remote-debugging-address=127.0.0.1'],cwd=root/'native-fixture',env=env,stdout=log,stderr=subprocess.STDOUT,start_new_session=True)
record={'pid':proc.pid,'appPath':str(app),'profile':'ORCHESTRA_TEST_ONBOARDING isolates XDG/userData/sessionData; fresh credential key; credential inheritance off','shellProbe':'disabled to avoid loading owner shell profile','cdp':'127.0.0.1:9236'}
(root/'app-launch.json').write_text(json.dumps(record,indent=2)+'\n');print(json.dumps(record))
