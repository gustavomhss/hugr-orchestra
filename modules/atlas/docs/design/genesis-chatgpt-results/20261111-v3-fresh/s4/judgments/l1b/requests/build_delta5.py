from pathlib import Path
import json,hashlib
root=Path('/workspace/scratch/aff930d22ec7/s4');out=root/'review-packets/l1b';prod=root/'producers/l1b'
sha=lambda b:hashlib.sha256(b).hexdigest()
compact=lambda v:json.dumps(v,ensure_ascii=False,separators=(',',':'))
mfile=out/'manifest.json';m=json.loads(mfile.read_text());rep=m['supplements'][0]
for judge in m['recipients']:m['delivery'].append({'part':'4-body-replacement','recipient':judge,'message_id':'UNKNOWN','tool':'collaboration.send_message','tool_return':'empty success','payload_file':Path(rep['path']).name,'byte_length':rep['byte_length'],'sha256':rep['sha256'],'saved_before_send':True})
arts=json.loads((prod/'artifacts-v2.json').read_text())
origin_prefix='modules/atlas/docs/design/genesis-chatgpt-results/20261111-v3-fresh/s4/'
def local(path):
 if path.startswith(origin_prefix):return root/path[len(origin_prefix):]
 if path.startswith('.orchestra/skills/execute-genesis/'):return root/'producers/l1a/protocol-source'/Path(path).name
 return root/'source'/path
summary={'protocol_identity_note':'Hash checks use producers/l1a/protocol-source exact captures; s4/protocol reading copies have an added newline and were not used for source identity.', 'schema':'s4-l1b-courier-metadata-v2-measurements/v1','artifacts_v2_sha256':sha((prod/'artifacts-v2.json').read_bytes()),'artifacts_v2_byte_length':(prod/'artifacts-v2.json').stat().st_size,'coverage_v1_sha256':sha((prod/'coverage.json').read_bytes()),'coverage_v1_count':len(json.loads((prod/'coverage.json').read_text())['entries']),'artifacts':[],'limitation':'Static reads of captured origins and payload files only; no same-path runtime materialization, observer invocation, binding or publication was performed by this courier.'}
for a in arts:
 sizes=[local(k.removeprefix('file:')).stat().st_size for k in a['input_keys']]
 refs_ok=0
 for ref in a['source_refs']:
  raw=local(ref['path']).read_bytes();assert sha(raw)==ref['sha256'];assert hashlib.sha1(b'blob '+str(len(raw)).encode()+b'\0'+raw).hexdigest()==ref['git_blob_sha'];assert 'file:'+ref['path'] in a['input_keys'];refs_ok+=1
 body=(root/a['body']['path']).read_bytes();assert sha(body)==a['body']['sha256']
 summary['artifacts'].append({'key':a['key'],'input_count':len(a['input_keys']),'source_ref_count':len(a['source_refs']),'verified_source_ref_bytes_and_same_input_path':refs_ok,'max_declared_input_bytes':max(sizes),'all_inputs_at_most_256000_bytes':all(n<=256000 for n in sizes),'recipe_ref':a['recipe_ref'],'body_sha256':sha(body),'body_byte_length':len(body),'build_dependencies':a['build_dependencies']})
s='S4 L1B — lote adicional 5: delta de metadados v2. O principal solicitou esta extensão após os quatro lotes originais. O plano abaixo é integral; os dois JSONs são integralmente preservados em serialização compacta. Os quatro corpos e coverage v1 continuam com as identidades já transportadas. Nenhum parecer ou binding é afirmado pelo transportador. Aguarde encerramento do principal.\n\n<<<BEGIN EXACT BODY: observation-plan.md>>>\n'+(prod/'observation-plan.md').read_text()+'<<<END EXACT BODY: observation-plan.md>>>\n'
for name in ['metadata-v2/correction-receipt.json','metadata-v2/recipe.json']:
 raw=(prod/name).read_bytes();s+=f'\n<<<COMPLETE JSON DATA, MINIFIED: {name}; original bytes={len(raw)} sha256={sha(raw)}>>>\n'+compact(json.loads(raw))+'\n<<<END COMPLETE JSON DATA>>>\n'
s+='\n<<<DETERMINISTIC METADATA V2 MEASUREMENTS>>>\n'+compact(summary)+'\n<<<END METADATA V2 MEASUREMENTS>>>\n'
b=s.encode();assert len(b)<=36500;f=out/'request-part-5.txt';f.write_bytes(b);(out/'measurements-v2.json').write_text(json.dumps(summary,ensure_ascii=False,indent=2)+'\n')
m['parts'].append({'number':5,'path':str(f),'byte_length':len(b),'sha256':sha(b),'body_path':str(prod/'observation-plan.md'),'body_byte_length':(prod/'observation-plan.md').stat().st_size,'body_sha256':sha((prod/'observation-plan.md').read_bytes()),'source_excerpts':[]});mfile.write_text(json.dumps(m,ensure_ascii=False,indent=2)+'\n')
print(compact(m['parts'][-1]));print(s[s.index('<<<COMPLETE JSON DATA'):])
