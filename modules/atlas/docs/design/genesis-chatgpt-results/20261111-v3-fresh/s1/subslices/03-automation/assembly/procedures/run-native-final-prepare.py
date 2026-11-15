"""Run the released native adapter once against the full selected S1-03 package.

This is a runtime operation, not a product test, importer, reader or store replacement.
No failure is converted into an approval or an Atlas-generated version.
"""
from pathlib import Path
from datetime import datetime,timezone
import hashlib,json,subprocess
W=Path(__file__).resolve().parents[1];P=W/'payload';N=W/'native-source'
OUT='modules/atlas/docs/design/genesis-chatgpt-results/20261111-v3-fresh/s1/subslices/03-automation'
H=lambda b:hashlib.sha256(b).hexdigest()
G=lambda b:hashlib.sha1(b'blob '+str(len(b)).encode()+b'\0'+b).hexdigest()
receipt=P/'receipts/native-prepare-final.json';assert not receipt.exists(),'A new attempt needs a linked receipt; do not overwrite an actual runtime result.'
assembly=json.loads((P/'receipts/native-package-assembly.json').read_text());assert not assembly['inventory_only'] and assembly['artifact_count']==12
package=(P/'native-package.json').read_bytes();assert H(package)==assembly['package_sha256']
assert (N/OUT/'native-package.json').read_bytes()==package
runtime=W/'runtime-preflight/candidate';captures=[json.loads(line) for line in (P/'receipts/runtime-preflight/source-captures.jsonl').read_text().splitlines()]
for u in captures:
 b=(runtime/u['path']).read_bytes()
 assert len(b)==u['byte_length'] and H(b)==u['sha256'] and G(b)==u['git_blob_sha'],u['path']
directory=W/'runtime-final';directory.mkdir(exist_ok=True);candidate=directory/'selection-prepared.json';assert not candidate.exists()
command=[str(W/'runtime-preflight/bun-runtime/node_modules/.bin/bun'),'scripts/genesis-native.ts','prepare',str(N),OUT+'/native-package.json',str(candidate)]
cwd=runtime/'modules/atlas';started=datetime.now(timezone.utc).isoformat()
timeout=False
try:
 result=subprocess.run(command,cwd=cwd,capture_output=True,timeout=60);code=result.returncode;stdout=result.stdout;stderr=result.stderr
except subprocess.TimeoutExpired as error:
 timeout=True;code=None;stdout=error.stdout or b'';stderr=error.stderr or b''
ended=datetime.now(timezone.utc).isoformat()
for name,raw in [('native-prepare-final.stdout',stdout),('native-prepare-final.stderr',stderr)]: (P/'receipts'/name).write_bytes(raw)
observed_error=None
try:
 parsed=json.loads(stderr)
 if isinstance(parsed,dict):observed_error=parsed.get('error')
except (ValueError,UnicodeDecodeError):pass
head=subprocess.run(['git','-C',str(N),'rev-parse','HEAD'],capture_output=True,timeout=10)
record={'schema':'s1-03-full-selection-native-prepare/v1','started_utc':started,'ended_utc':ended,'command':command,'cwd':str(cwd),'candidate_revision':'e3a8ab8cf56dbff1ee91272df51ffa398d882aa1','release_revision':'db9b4235022c4df32fe3bfd4faeea8adcd69abb7','source_root':str(N),'observed_source_git_head':head.stdout.decode().strip() if head.returncode==0 else None,'source_git_head_command_exit':head.returncode,'source_payload_commit':assembly['source_payload_commit'],'package_path':OUT+'/native-package.json','package_sha256':H(package),'package_bytes':len(package),'artifact_count':assembly['artifact_count'],'unique_input_count':assembly['unique_input_count'],'all_399_runtime_source_files_match_frozen_candidate':len(captures)==399,'runtime_source_file_checks':len(captures),'no_product_policy_guard_or_source_limit_patch_applied':True,'exit_code':code,'timeout':timeout,'stdout_bytes':len(stdout),'stdout_sha256':H(stdout),'stderr_bytes':len(stderr),'stderr_sha256':H(stderr),'stdout_file':'receipts/native-prepare-final.stdout','stderr_file':'receipts/native-prepare-final.stderr','observed_error':observed_error,'prepared_file':str(candidate),'prepared_file_exists':candidate.is_file(),'state':'PREPARED' if code==0 and candidate.is_file() else 'NOT_COMPLETED_TIMEOUT' if timeout else 'BLOCKED_ACTUAL_PREPARE','semantic_acceptance_is_not_runtime_binding':True,'publication_attempted_by_this_command':False,'inputs_not_removed_or_split':True}
if candidate.is_file():
 raw=candidate.read_bytes();record['prepared_bytes']=len(raw);record['prepared_sha256']=H(raw)
receipt.write_text(json.dumps(record,ensure_ascii=False,indent=2)+'\n')
print(json.dumps({k:record[k] for k in ['state','exit_code','observed_error','prepared_file_exists','artifact_count','unique_input_count']},ensure_ascii=False))
