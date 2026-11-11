from pathlib import Path
import json,hashlib,collections
root=Path('/workspace/scratch/aff930d22ec7/s4')
out=root/'review-packets/l1b'; prod=root/'producers/l1b'; src=root/'source'
sha=lambda b:hashlib.sha256(b).hexdigest()
names=['atlas-engine.md','atlas-host-genesis.md','continuity-rag.md','coverage-governance.md']
expected=['c0d39faabe422adcfb5a6b4e67b0d105931d90661b695fbcaa7571187b4f103e','97b3adc25e1a8754ebdbab0b27040403893e90d410df08a5c8f90520e3a0156d','2a286b2570b9967c1e78ee14b671f333957a6a54c97427dc24feaec7ccab5b38','201b5cc97ba7ae5b1148b98377a174ba3d00c8f4d9d521b4fadc6c1d69a03381']
pkg='modules/atlas/packages/'
selections=[
[(pkg+'kernel/src/canonical.ts',[(35,96),(104,115)]),(pkg+'grounding/src/gate.ts',[(68,77)]),(pkg+'knowledge/src/lifecycle/status.ts',[(74,77)]),(pkg+'knowledge/src/ownership/read.ts',[(36,69),(83,95)]),(pkg+'index/src/depgraph.ts',[(46,94)]),(pkg+'memory/src/inject.ts',[(85,96),(115,141)]),('modules/atlas/harness/gates/reference-model-guard.mjs',[(194,213),(225,236)])],
[(pkg+'adapter-io/src/store-provenance.ts',[(94,104),(127,155)]),(pkg+'adapter-io/src/policy.ts',[(74,105)]),(pkg+'adapter-io/src/ownership-access.ts',[(18,48)]),(pkg+'adapter-io/src/ownership-input.ts',[(134,170)]),(pkg+'adapter-io/src/governed-emit.ts',[(354,378)]),(pkg+'genesis/src/extract.ts',[(168,216)]),(pkg+'tools/src/handler.ts',[(35,62)]),('modules/atlas/boundary/script/build.ts',[(11,28)])],
[('modules/continuity/src/v2/strategy.ts',[(20,44),(82,94),(183,202)]),('modules/continuity/src/v2/archive.ts',[(139,154),(184,215)]),(pkg+'adapter-io/src/context-log.ts',[(55,98)]),(pkg+'adapter-io/src/repo-visibility.ts',[(17,47)]),('modules/rag-studio/src/search.ts',[(1,25)]),('modules/rag-studio/src/ask.ts',[(9,40)]),('modules/rag-studio/src/proof.ts',[(4,33)]),('modules/rag-studio/src/trace.ts',[(1,6)]),('modules/rag-studio/test/proof.test.ts',[(57,71)])],
[('script/atlas-genesis/checkpoint-continuation-policy.mjs',[(4,22)]),('script/atlas-genesis/judge.mjs',[(24,40)]),('.github/workflows/atlas-genesis.yml',[(1323,1338),(1396,1410),(1552,1568)]),('specs/atlas-ui/mock/README.md',[(1,31)])]
]
arts=json.loads((prod/'artifacts.json').read_text())
cov=json.loads((prod/'coverage.json').read_text())
checks=[]
for e in cov['entries']:
 b=(src/e['path']).read_bytes(); checks.append(len(b)==e['byte_length'] and sha(b)==e['sha256'] and hashlib.sha1(b'blob '+str(len(b)).encode()+b'\0'+b).hexdigest()==e['git_blob_sha'])
register=json.loads((prod/'citation-register.json').read_text())
citation_ranges=0
for entries in register.values():
 for e in entries:
  citation_file=src/e['path']
  if not citation_file.exists() and e['path'].startswith('.orchestra/skills/execute-genesis/'):
   citation_file=root/'protocol'/Path(e['path']).name
  lines=citation_file.read_text().splitlines()
  for lo,hi in e['ranges']:
   assert 1<=lo<=hi<=len(lines),(e,lo,hi,len(lines))
   citation_ranges+=1
metadata={'schema':'s4-l1b-courier-measurements/v1','source_revision':'1cde2ff7a71bcf7aecb5d030917b577165135d38','protocol_revision':'ee2521a5b966bd505cc95bd1c733e09e12f33531','measured_files':{},'coverage_measurement':{'rows':len(checks),'unique_paths':len({e['path'] for e in cov['entries']}),'raw_byte_length_sha256_git_blob_matches':sum(checks),'path_set_sha256':sha(('\n'.join(sorted(e['path'] for e in cov['entries']))+'\n').encode()),'classification_counts':dict(sorted(collections.Counter(e['classification'] for e in cov['entries']).items())),'depth_counts':dict(sorted(collections.Counter(e['depth'] for e in cov['entries']).items()))},'citation_range_measurement':{'register_entries':sum(map(len,register.values())),'ranges_checked':citation_ranges,'out_of_bounds':0,'producer_citation_receipt':'ABSENT'},'artifact_metadata_projection':[],'limitations':'Measurements concern bytes, declared rows and line bounds only; no product execution, semantic verdict or new authority.'}
for name in names+['artifacts.json','coverage.json','coverage-summary.md','delivery-receipt.json','citation-register.json']:
 b=(prod/name).read_bytes();metadata['measured_files'][name]={'byte_length':len(b),'sha256':sha(b)}
for a in arts:
 metadata['artifact_metadata_projection'].append({k:a[k] for k in ['key','scope','layer','need','validity','build_dependencies','semantic_review_refs','runtime_receipt_refs'] }|{'input_key_count':len(a['input_keys']),'source_ref_count':len(a['source_refs']),'producer_request_ref':a['producer_request_ref'],'producer_response_ref':a['producer_response_ref']})
(out/'measurements.json').write_text(json.dumps(metadata,ensure_ascii=False,indent=2)+'\n')
manifest={'schema':'s4-l1b-review-transport/v1','source_revision':metadata['source_revision'],'protocol_revision':metadata['protocol_revision'],'execution_id':'a2095d5a-1464-4c38-a222-6376974fc9c9','recipients':['/root/judge_j1','/root/judge_j2'],'parts':[],'delivery':[]}
for i,(name,sel,bodyhash) in enumerate(zip(names,selections,expected),1):
 body=(prod/name).read_bytes(); assert sha(body)==bodyhash
 s=f'S4 L1B — lote literal {i}/4. Dados para os dois juízes persistentes; nenhum parecer do transportador. Oracle e encerramento serão fornecidos pelo principal. Não use ferramentas.\nFonte dos trechos: gustavomhss/hugr-orchestra@1cde2ff7a71bcf7aecb5d030917b577165135d38.\n\n<<<BEGIN EXACT BODY: {name}>>>\n'+body.decode()+f'<<<END EXACT BODY: {name}>>>\n\nTRECHOS LITERAIS DA FONTE\n'
 refs=[]
 for path,ranges in sel:
  raw=(src/path).read_bytes();lines=raw.decode().splitlines(keepends=True)
  for lo,hi in ranges:
   assert hi<=len(lines)
   excerpt=''.join(lines[lo-1:hi]);s+=f'\n<<<SOURCE {path}:L{lo}-L{hi}>>>\n'+excerpt+f'<<<END SOURCE>>>\n'
   refs.append({'path':path,'lines':[lo,hi],'file_sha256':sha(raw),'excerpt_sha256':sha(excerpt.encode()),'excerpt_byte_length':len(excerpt.encode())})
 if i==4:
  for extra in ['coverage-summary.md','delivery-receipt.json']:
   s+=f'\n<<<BEGIN EXACT FILE: {extra}>>>\n'+(prod/extra).read_text()+f'<<<END EXACT FILE: {extra}>>>\n'
  transport_metadata={k:v for k,v in metadata.items() if k!='artifact_metadata_projection'}
  transport_metadata['coverage_measurement']={k:v for k,v in metadata['coverage_measurement'].items() if k not in ['classification_counts','depth_counts']}
  transport_metadata['artifact_metadata_projection']=[{k:v for k,v in a.items() if k not in ['producer_request_ref','producer_response_ref','scope','layer','need','validity']} for a in metadata['artifact_metadata_projection']]
  s+='\n<<<COURIER BYTE AND COVERAGE MEASUREMENTS>>>\n'+json.dumps(transport_metadata,ensure_ascii=False,separators=(',',':'))+'\n<<<END COURIER MEASUREMENTS>>>\n'
 b=s.encode();file=out/f'request-part-{i}.txt';file.write_bytes(b)
 manifest['parts'].append({'number':i,'path':str(file),'byte_length':len(b),'sha256':sha(b),'body_path':str(prod/name),'body_byte_length':len(body),'body_sha256':bodyhash,'source_excerpts':refs})
 assert len(b)<=36500,(i,len(b))
(out/'manifest.json').write_text(json.dumps(manifest,ensure_ascii=False,indent=2)+'\n')
print(json.dumps([{k:p[k] for k in ['number','path','byte_length','sha256']} for p in manifest['parts']],indent=2))
