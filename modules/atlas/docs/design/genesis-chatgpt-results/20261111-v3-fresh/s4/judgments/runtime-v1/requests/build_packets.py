import pathlib,json,hashlib,collections
R=pathlib.Path('/workspace/scratch/aff930d22ec7/s4')
C=R/'candidate'
B=C/'modules/atlas/docs/design/genesis-chatgpt-results/20261111-v3-fresh/s4'
O=R/'review-packets/runtime-v1'
sha=lambda b:hashlib.sha256(b).hexdigest()
def record(p):
 b=p.read_bytes(); return {'path':str(p),'bytes':len(b),'sha256':sha(b),'lines':len(b.splitlines())}
def js(obj): return json.dumps(obj,ensure_ascii=False,indent=2)+'\n'
def literal(p):
 b=p.read_bytes(); t=b.decode('utf-8'); m=record(p)
 return f"\n===== BEGIN LITERAL FILE: {p} =====\nSource lines: 1-{m['lines']}; bytes: {m['bytes']}; SHA256: {m['sha256']}. The next {m['bytes']} UTF-8 bytes are the exact file.\n"+t+'\n'+f"===== END LITERAL FILE: {p} =====\n"
def cas(h): return C/'.atlas/cas'/h[:2]/h
candidate_path=R/'runtime-state/l1a-prepared-v1.json'; candidate=json.loads(candidate_path.read_text()); cand=candidate['candidate']
package_path=B/'runtime-sample/native-package.json'; package=json.loads(package_path.read_text()); original=R/'producers/l1a/body.md'; transported=B/'runtime-sample/body.md'
entry=cand['entries'][0]; result_path=cas(entry['artifact']['result']); result=json.loads(result_path.read_text()); body_path=cas(result['body']); body=json.loads(body_path.read_text()); decoded=bytes(body['bytes']); orig=original.read_bytes(); transport_body=transported.read_bytes()
raw_transport_path=cas(cand['transport']['body']); raw_transport=json.loads(raw_transport_path.read_text()); raw_transport_bytes=bytes(raw_transport['bytes'])
paths={
 'adapter':C/'modules/atlas/packages/adapter-io/src/genesis-native.ts',
 'format':C/'modules/atlas/packages/adapter-io/src/genesis-native-format.ts',
 'io':C/'modules/atlas/packages/adapter-io/src/genesis-native-io.ts',
 'binding':C/'modules/atlas/packages/adapter-io/src/genesis-native-binding.ts'
}
proof={
 'schema':'review-courier-byte-measurements/v1',
 'role':'Transport measurements only; no semantic or runtime-binding verdict.',
 'method':'Python pathlib.read_bytes; json.loads for CAS objects; bytes(body["bytes"]); hashlib.sha256; exact byte equality.',
 'candidate':record(candidate_path),
 'candidate_receipt_copy':record(B/'runtime/l1a-prepared-v1.json'),
 'candidate_copies_byte_equal':candidate_path.read_bytes()==(B/'runtime/l1a-prepared-v1.json').read_bytes(),
 'candidate_id_as_recorded':candidate['candidate_id'],
 'result_cas':{'id_as_recorded':entry['artifact']['result'],**record(result_path)},
 'body_cas':{'id_as_recorded':result['body'],**record(body_path),'kind':body['kind'],'version':body['version']},
 'decoded_body':{'bytes':len(decoded),'sha256':sha(decoded),'equals_original_reviewed_body':decoded==orig,'equals_native_package_body_file':decoded==transport_body,'matches_declared_byte_length':len(decoded)==package['artifacts'][0]['body']['byte_length'],'matches_declared_sha256':sha(decoded)==package['artifacts'][0]['body']['sha256']},
 'original_reviewed_body':record(original),
 'native_package_body_file':record(transported),
 'semantic_field_equality':{k:result[k]==package['artifacts'][0][k] for k in ('authority','validity','gaps','evidence')},
 'transport':{**record(package_path),'declared_sha256_matches':sha(package_path.read_bytes())==cand['transport']['sha256'],'cas_body':cand['transport']['body'],'cas_object':record(raw_transport_path),'decoded_bytes_equal_package_file':raw_transport_bytes==package_path.read_bytes()},
 'implementation':[{ 'slot':slot,**record(p),'equals_candidate_implementation_sha256':sha(p.read_bytes())==cand['implementation'][slot]} for slot,p in paths.items()],
 'input_keys_count':len(package['artifacts'][0]['input_keys']),
 'prepared_entry_inputs_count':len(entry['inputs']),
 'prepared_observation_count':len(cand['observations']),
 'limits':['Kernel IDs are quoted from the existing candidate/CAS references, not recomputed by this courier.','No oracle body was opened. Oracle reference metadata inside authorized candidate and mapping records is retained unchanged.','Reviewed L1A body is not retransmitted; decoded CAS bytes were compared directly to the original reviewed file.','No preparation, product test, binding, publication, index or read was executed by this courier.']
}
(O/'measurements.json').write_text(js(proof))
ci_path=B/'runtime/ci-v1/ownership-runtime-results.json'; ci=json.loads(ci_path.read_text()); mutpath=B/'runtime/ci-v1/ownership-mutation-receipts.json'; muts=json.loads(mutpath.read_text()); receipt=json.loads((B/'runtime/ci-v1/receipt.json').read_text())
ci_summary={
 'schema':'review-courier-ci-projection/v1',
 'source':record(ci_path),
 'method':'Exact top-level reported counters plus deterministic counts of testResults/assertionResults; exact fullName/status/failureMessages for the genesis-native suite. No rerun.',
 'reported':{k:v for k,v in ci.items() if k!='testResults'},
 'listed_test_result_records':len(ci['testResults']),
 'listed_assertions':sum(len(x['assertionResults']) for x in ci['testResults']),
 'listed_assertion_status_counts':dict(sorted(collections.Counter(a['status'] for s in ci['testResults'] for a in s['assertionResults']).items())),
 'genesis_native_suite':[{k:s[k] for k in ('name','status','message')}|{'assertionResults':[{k:a[k] for k in ('fullName','status','failureMessages')} for a in s['assertionResults']]} for s in ci['testResults'] if s['name'].endswith('/genesis-native.test.ts')],
 'mutation_count':len(muts),
 'mutation_exit_code_counts':dict(sorted(collections.Counter(str(m['exitCode']) for m in muts).items())),
 'receipt_referenced_files':[{'path':x['path'],'bytes_observed':(B/'runtime/ci-v1'/x['path']).stat().st_size,'sha256_observed':sha((B/'runtime/ci-v1'/x['path']).read_bytes()),'bytes_match':(B/'runtime/ci-v1'/x['path']).stat().st_size==x['bytes'],'sha256_match':sha((B/'runtime/ci-v1'/x['path']).read_bytes())==x['sha256']} for x in receipt['files']],
 'limits':['The global run conclusion remains failure as recorded.','These test names and statuses are test evidence, not actual campaign binding/publication/read decisions.','The 101448-byte job output is measured but not included.']
}
(O/'ci-summary.json').write_text(js(ci_summary))
header='WP-R0 V1 — literal review transport only. Separate from L1B and from any R1 work.\nExecution: a2095d5a-1464-4c38-a222-6376974fc9c9. Candidate source is the existing s4/candidate V1 files.\nNo verdict is requested by this courier. Hold this material for the principal\'s separate R0 closing request and oracle. No semantic judgment is automatically converted into runtime binding.\nThe same saved part is sent to /root/judge_j1 and /root/judge_j2. File bodies below are integral unless explicitly labeled a deterministic projection.\n'
part_files=[
 [paths['format'],paths['io'],paths['binding']],
 [paths['adapter'],C/'modules/atlas/scripts/genesis-native.ts',C/'modules/atlas/docs/design/genesis-native-runtime.md'],
 [candidate_path,package_path,result_path,cas(cand['contract']),B/'runtime/object-mapping-v1.json',O/'measurements.json'],
 [B/'runtime/prepare-receipt-v1.json',B/'runtime/typecheck-v1.json',B/'runtime/ci-v1/receipt.json',B/'runtime/ci-v1/ownership-guards.json',B/'runtime/ci-v1/ownership-mutation-receipts.json',O/'ci-summary.json']
]
manifest={'schema':'literal-review-transport-manifest/v1','work_package':'WP-R0','version':'V1','execution_id':'a2095d5a-1464-4c38-a222-6376974fc9c9','recipients':['/root/judge_j1','/root/judge_j2'],'parts':[],'deliveries':[],'status':'saved_before_send','verdict':'NOT_ISSUED_BY_COURIER','limits':['No oracle bodies read.','No message IDs or payload echoes available unless a later tool result exposes them.']}
for n,files in enumerate(part_files,1):
 content=header+f'Part {n}/4.\n'
 if n==3: content+='The existing L1A body is represented by exact hash/byte comparison evidence below; its prose is not repeated. Reference metadata for reserved evidence is retained but its content was not read by this courier.\n'
 if n==4: content+='The CI summary is explicitly a deterministic projection of the recorded test JSON. All other files in this part are integral. The overall CI failure remains visible.\n'
 content+=''.join(literal(p) for p in files)
 out=O/f'request-part-{n}.txt'; out.write_text(content)
 assert out.stat().st_size<=36000,(n,out.stat().st_size)
 manifest['parts'].append({'part':n,**record(out),'saved_before_send':True,'files':[record(p) for p in files]})
(O/'manifest.json').write_text(js(manifest))
print(js({'parts':[{'part':x['part'],'bytes':x['bytes'],'sha256':x['sha256']} for x in manifest['parts']],'proof_body':proof['decoded_body'],'implementation_matches':[x['equals_candidate_implementation_sha256'] for x in proof['implementation']],'ci_counts':ci_summary['listed_assertion_status_counts']}))
