// Read-only mapping audit. Imports only the pure kernel identity function, never prepare/publish/store.
import { readFileSync, writeFileSync, lstatSync, realpathSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { createHash } from 'node:crypto'
import { execFileSync } from 'node:child_process'
import { isDeepStrictEqual } from 'node:util'

const workspace = '/workspace/scratch/5cfbb6c803f1'
const corpus = `${workspace}/s2-corpus`
const runtime = `${workspace}/s2-runtime`
const preparedPath = `${workspace}/s2-execution/prepare-01/prepared.json`
const packagePath = 'modules/atlas/docs/design/genesis-chatgpt-results/20261111-v3-fresh/s2/native-package.json'
const corpusPin = 'bb2a931301d541692b11e5a7f1eab234cd9ed2fd'
const runtimePin = 'db9b4235022c4df32fe3bfd4faeea8adcd69abb7'
const packageHash = '9356cefcb4a1db413e67869a855fd082536476fb18ff7784dde39f051e9b407b'
const out = dirname(fileURLToPath(import.meta.url))
const kernelPath = 'modules/atlas/packages/kernel/dist/src/canonical.js'
const { id } = await import(pathToFileURL(join(runtime, kernelPath)).href)
const sha256 = bytes => createHash('sha256').update(bytes).digest('hex')
const blobSha = bytes => createHash('sha1').update(`blob ${bytes.length}\0`).update(bytes).digest('hex')
const bytes = path => readFileSync(path)
const json = path => JSON.parse(bytes(path).toString('utf8'))
const git = (repo, ...args) => execFileSync('git', ['-C', repo, ...args], {env:{...process.env,GIT_OPTIONAL_LOCKS:'0',GIT_NO_LAZY_FETCH:'1',GIT_TERMINAL_PROMPT:'0'}})
const preparedBytes = bytes(preparedPath)
const prepared = JSON.parse(preparedBytes.toString('utf8'))
const candidate = prepared.candidate
const packageBytes = bytes(join(corpus, packagePath))
const pack = JSON.parse(packageBytes.toString('utf8'))
const divergences = []
const comparisonCounts = {}
let comparisonCount = 0
function check(path, actual, expected, group = path.split('.')[0]) {
  comparisonCount += 1
  comparisonCounts[group] = (comparisonCounts[group] ?? 0) + 1
  if (!isDeepStrictEqual(actual, expected)) divergences.push({path,actual,expected})
}
function fields(path, value, expected) {
  check(`${path}.[field_names]`, Object.keys(value).sort(), Object.keys(expected).sort())
  for (const key of Object.keys(expected)) check(`${path}.${key}`, value[key], expected[key])
}
const casRecords = new Map()
function cas(address, purpose) {
  if (!/^[0-9a-f]{64}$/.test(address)) {
    divergences.push({path:`CAS.${purpose}`,actual:address,expected:'64 lowercase hexadecimal address'})
    return null
  }
  if (casRecords.has(address)) {
    const known = casRecords.get(address)
    known.purposes.push(purpose)
    return known.value
  }
  const path = join(corpus,'.atlas','cas',address.slice(0,2),address)
  try {
    const st = lstatSync(path)
    check(`CAS.${address}.regular_non_symlink`, st.isFile() && !st.isSymbolicLink(), true, 'CAS')
    check(`CAS.${address}.resolved_path`, realpathSync(path), path, 'CAS')
    const raw = bytes(path)
    const value = JSON.parse(raw.toString('utf8'))
    check(`CAS.${address}.id`, String(id(value)), address, 'CAS')
    casRecords.set(address,{path,byte_length:raw.length,sha256:sha256(raw),value,purposes:[purpose]})
    return value
  } catch(error) {
    divergences.push({path:`CAS.${purpose}`,actual:String(error),expected:'Readable valid JSON CAS object at the named address'})
    return null
  }
}
const fileCache = new Map()
function file(relative) {
  if (fileCache.has(relative)) return fileCache.get(relative)
  const path = join(corpus, relative)
  const raw = bytes(path)
  const record = {relative,raw,byte_length:raw.length,sha256:sha256(raw),git_blob_sha:blobSha(raw)}
  fileCache.set(relative,record)
  return record
}
function bodyFromFile(relative) {
  return {kind:'ownership-body',version:1,bytes:Array.from(file(relative).raw)}
}
function referencePath(ref) {return ref.payload_path ?? ref.path}
function referenceKey(ref) {return 'payload_path' in ref ? JSON.stringify(['payload',ref.payload_path,ref.sha256]) : JSON.stringify(['commit',ref.commit,ref.path,ref.sha256])}
const corpusHeadBefore = git(corpus,'rev-parse','HEAD').toString().trim()
const runtimeHead = git(runtime,'rev-parse','HEAD').toString().trim()
check('repository.corpus_head',corpusHeadBefore,corpusPin)
check('repository.runtime_head',runtimeHead,runtimePin)
check('package.sha256',sha256(packageBytes),packageHash)
check('prepared.fields',Object.keys(prepared).sort(),['schema','candidate_id','candidate'].sort())
check('prepared.schema',prepared.schema,'genesis-native-prepared/v1')
check('prepared.candidate_id_recalculated',prepared.candidate_id,String(id(candidate)))
check('prepared.candidate_cas_exact',cas(prepared.candidate_id,'prepared candidate'),candidate)

const expectedImplementation = {}
const implementationCode = []
for (const [key,name] of Object.entries({adapter:'genesis-native.ts',format:'genesis-native-format.ts',io:'genesis-native-io.ts',binding:'genesis-native-binding.ts'})) {
  const path = `modules/atlas/packages/adapter-io/src/${name}`
  const raw = bytes(join(runtime,path))
  const pinned = git(runtime,'show',`${runtimePin}:${path}`)
  check(`implementation.${key}.working_bytes_equal_db9`,raw,pinned,'implementation')
  expectedImplementation[key] = sha256(pinned)
  implementationCode.push({role:key,path,source_revision:runtimePin,byte_length:raw.length,sha256:sha256(raw),git_blob_sha:blobSha(raw)})
}
const expectedCriteria = [...new Set([...pack.contract.criteria,'runtime-import-binding'])]
const expectedContract = {kind:'ownership-contract',version:1,criteria:expectedCriteria}
const contractId = String(id(expectedContract))
fields('contract',cas(candidate.contract,'contract'),expectedContract)
check('contract.id',candidate.contract,contractId)
const transportBody = bodyFromFile(packagePath)
const expectedTransport = {path:packagePath,sha256:sha256(packageBytes),body:String(id(transportBody))}
fields('transport',candidate.transport,expectedTransport)
check('transport.CAS_body_exact',cas(candidate.transport.body,'native package bytes'),transportBody)

const expectedReferences = new Map()
const preservedReferenceUses = []
function preserve(ref, role, artifact) {
  const relative = referencePath(ref)
  const captured = file(relative)
  check(`reference_source.${role}.${artifact ?? 'package'}.${relative}.sha256`,captured.sha256,ref.sha256,'reference_source')
  const body = bodyFromFile(relative)
  const address = String(id(body))
  expectedReferences.set(referenceKey(ref),{reference:ref,body:address})
  preservedReferenceUses.push({role,artifact:artifact ?? null,path:relative,reference_key:referenceKey(ref),body:address})
}
preserve(pack.protocol_ref,'protocol_ref')
preserve(pack.contract.oracle_ref,'contract.oracle_ref')
const expectedObservations = new Map()
const inputCache = new Map()
function input(key) {
  if (inputCache.has(key)) return inputCache.get(key)
  if (!key.startsWith('file:')) throw new Error('Non-file input needs actual observer evidence: '+key)
  const content = file(key.slice(5))
  const version = String(id({kind:'ownership-source',version:1,bytes:Array.from(content.raw)}))
  const value = {key,version}
  inputCache.set(key,value)
  return value
}
const expectedEntries = []
const entryRecords = []
for (let n=0;n<pack.artifacts.length;n++) {
  const artifact = pack.artifacts[n]
  const entry = candidate.entries[n]
  const key = artifact.key
  for (const name of ['recipe_ref','producer_request_ref','producer_response_ref']) preserve(artifact[name],name,key)
  for (const name of ['semantic_review_refs','runtime_receipt_refs']) for (const ref of artifact[name]) preserve(ref,name,key)
  for (const ref of artifact.source_refs) {
    const source = file(ref.path)
    check(`source.${key}.${ref.path}.sha256`,source.sha256,ref.sha256,'source')
    check(`source.${key}.${ref.path}.git_blob_sha`,source.git_blob_sha,ref.git_blob_sha,'source')
  }
  const inputKeys = [...new Set([...artifact.input_keys,`file:${referencePath(pack.protocol_ref)}`])]
  const inputs = inputKeys.map(key=>input(key))
  for (const observed of inputs) expectedObservations.set(observed.key,{...observed,sha256:file(observed.key.slice(5)).sha256})
  const bodyPath = join(dirname(packagePath),artifact.body.path)
  const rawBody = file(bodyPath)
  check(`entry.${key}.body.byte_length`,rawBody.byte_length,artifact.body.byte_length,'entry')
  check(`entry.${key}.body.sha256`,rawBody.sha256,artifact.body.sha256,'entry')
  const body = bodyFromFile(bodyPath)
  const expectedResult = {kind:'ownership-result',version:1,body:String(id(body)),authority:artifact.authority,validity:artifact.validity,gaps:artifact.gaps,evidence:artifact.evidence}
  const resultId = String(id(expectedResult))
  const actualResult = cas(entry.artifact.result,`${key}:result`)
  fields(`entry.${key}.result`,actualResult,expectedResult)
  check(`entry.${key}.result.body.CAS_exact`,cas(actualResult.body,`${key}:body`),body,'entry')
  const dependencies = artifact.build_dependencies.map(dependency=>({key:dependency.key,result:expectedEntries.find(e=>e.key===dependency.key)?.artifact.result}))
  const expectedArtifact = {kind:'ownership-artifact',version:1,key,scope:pack.scope,title:artifact.title,layer:artifact.layer,need:artifact.need,result:resultId,navigation:artifact.navigation}
  const expectedEntry = {key,artifact:expectedArtifact,inputs,dependencies,inputs_id:String(id({inputs,dependencies}))}
  check(`entry.${key}.field_names`,Object.keys(entry).sort(),Object.keys(expectedEntry).sort(),'entry')
  check(`entry.${key}.key`,entry.key,key,'entry')
  fields(`entry.${key}.artifact`,entry.artifact,expectedArtifact)
  check(`entry.${key}.input_keys_order`,entry.inputs.map(i=>i.key),inputKeys,'entry')
  check(`entry.${key}.input_membership`,[...new Set(entry.inputs.map(i=>i.key))].sort(),[...inputKeys].sort(),'entry')
  check(`entry.${key}.inputs_exact`,entry.inputs,inputs,'entry')
  check(`entry.${key}.dependencies_exact_order_and_ids`,entry.dependencies,dependencies,'entry')
  check(`entry.${key}.inputs_id`,entry.inputs_id,expectedEntry.inputs_id,'entry')
  expectedEntries.push(expectedEntry)
  entryRecords.push({key,input_count:inputs.length,dependency_count:dependencies.length,navigation_count:artifact.navigation.length,result_id:resultId,inputs_id:expectedEntry.inputs_id,body_sha256:rawBody.sha256,body_cas:expectedResult.body})
}
check('entries.exact_complete_array',candidate.entries,expectedEntries)
check('entries.order_equals_package_artifacts',candidate.entries.map(e=>e.key),pack.artifacts.map(a=>a.key))
check('entries.count',candidate.entries.length,13)
const expectedReferenceArray = [...expectedReferences.values()]
check('references.exact_order_content_and_dedup',candidate.references,expectedReferenceArray)
check('references.count',candidate.references.length,40)
check('references.unique_keys',new Set(candidate.references.map(r=>referenceKey(r.reference))).size,candidate.references.length)
for (const reference of candidate.references) check(`references.CAS.${referenceKey(reference.reference)}`,cas(reference.body,`reference:${referencePath(reference.reference)}`),bodyFromFile(referencePath(reference.reference)),'references')
const expectedObservationArray = [...expectedObservations.values()]
check('observations.exact_first_seen_order_and_versions',candidate.observations,expectedObservationArray)
check('observations.count',candidate.observations.length,626)
check('observations.unique_keys',new Set(candidate.observations.map(o=>o.key)).size,candidate.observations.length)
for (let i=0;i<expectedObservationArray.length;i++) fields(`observations.${i}`,candidate.observations[i],expectedObservationArray[i])
check('required_artifact_keys.exact_package_order',candidate.required_artifact_keys,pack.required_artifact_keys)
check('required_artifact_keys.membership_equals_entries',[...new Set(candidate.required_artifact_keys)].sort(),candidate.entries.map(e=>e.key).sort())
check('required_artifact_keys.no_duplicates',new Set(candidate.required_artifact_keys).size,candidate.required_artifact_keys.length)
const expectedCandidate = {
  kind:'genesis-native-candidate',version:1,repo_root:realpathSync(corpus),observed_head:corpusPin,
  source_revision:pack.source_revision,scope:pack.scope,session:pack.session,
  reference_commit_verification:'external-capture-evidence-required',
  transport:expectedTransport,implementation:expectedImplementation,
  contract:contractId,criteria:expectedCriteria,references:expectedReferenceArray,observations:expectedObservationArray,
  entries:expectedEntries,roots:pack.roots,required_artifact_keys:pack.required_artifact_keys,
}
fields('candidate',candidate,expectedCandidate)
check('candidate.expected_id',prepared.candidate_id,String(id(expectedCandidate)))
check('candidate.exact_full_structure',candidate,expectedCandidate)
check('candidate.dependency_edge_count',candidate.entries.reduce((n,e)=>n+e.dependencies.length,0),32)
check('candidate.navigation_edge_count',candidate.entries.reduce((n,e)=>n+e.artifact.navigation.length,0),30)
const corpusHeadAfter = git(corpus,'rev-parse','HEAD').toString().trim()
check('repository.corpus_head_unchanged',corpusHeadAfter,corpusHeadBefore)
check('prepared.bytes_unchanged',sha256(bytes(preparedPath)),sha256(preparedBytes))
check('package.bytes_unchanged',sha256(bytes(join(corpus,packagePath))),sha256(packageBytes))
const kernelCode = ['modules/atlas/packages/kernel/src/canonical.ts','modules/atlas/packages/kernel/src/encoder.ts',kernelPath,'modules/atlas/packages/kernel/dist/src/encoder.js'].map(path=>({path,sha256:sha256(bytes(join(runtime,path)))}))
const report = {
  schema:'genesis-s2-independent-mapping-check/v1',recorded_at:new Date().toISOString(),
  operation:'Read-only checksum and structural reconciliation of an existing prepared candidate against exact package/files/CAS and pinned adapter code.',
  command:'node independent-mapping-check.mjs',
  method:['Inspected native prepare and format mapping at db9b423; did not import or invoke prepareNativePackage, publishNativePackage, runtime/store mutation, policy, tests or CI.',
    'Imported only the existing pure kernel id function from its built canonical module; recorded source and built module hashes. No alternate hash primitive was substituted for Atlas IDs.',
    'Reconciled package input union with protocol using first-seen order per entry and global Map insertion order; compared every key/version/hash and complete arrays.',
    'Reconciled every field of all 13 entries, metadata-preserving CAS results/bodies, 32 ordered build dependencies by predecessor result ID, 30 navigation edges, 40 deduplicated references and candidate header/implementation.',
    'Compared required-key membership and preserved order independently; required-key order need not equal artifact traversal order.',
    'Read CAS objects directly solely for checksum/structural evidence. This is not Atlas reader or consumer evidence.'],
  status:divergences.length===0?'CONSISTENT_MAPPING_ONLY':'MAPPING_DIVERGENCE',
  judge_verdict:null,comparison_count:comparisonCount,comparison_counts:comparisonCounts,divergences,
  prepared:{path:preparedPath,sha256:sha256(preparedBytes),byte_length:preparedBytes.length,candidate_id:prepared.candidate_id},
  package:{path:packagePath,sha256:sha256(packageBytes),byte_length:packageBytes.length},
  corpus:{path:corpus,head_before:corpusHeadBefore,head_after:corpusHeadAfter},runtime:{path:runtime,head:runtimeHead,implementation:implementationCode,kernel_identity_code:kernelCode},
  counts:{entries:expectedEntries.length,entry_input_bindings:expectedEntries.reduce((n,e)=>n+e.inputs.length,0),observations:expectedObservationArray.length,reference_uses:preservedReferenceUses.length,deduplicated_references:expectedReferenceArray.length,build_dependencies:expectedEntries.reduce((n,e)=>n+e.dependencies.length,0),navigation_edges:expectedEntries.reduce((n,e)=>n+e.artifact.navigation.length,0),cas_objects_read:casRecords.size,corpus_files_read:fileCache.size},
  entry_records:entryRecords,
  required_keys:{package_order:pack.required_artifact_keys,candidate_order:candidate.required_artifact_keys,entry_order:candidate.entries.map(e=>e.key),required_order_equals_entry_order:isDeepStrictEqual(candidate.required_artifact_keys,candidate.entries.map(e=>e.key)),order_difference_is_not_failure:'Adapter preserves required_artifact_keys from package and entries from artifacts independently.'},
  references:expectedReferenceArray,
  cas_reads:[...casRecords.entries()].map(([address,record])=>({address,path:record.path,byte_length:record.byte_length,sha256:record.sha256,purposes:record.purposes})),
  external_capture_dependencies:[
    {fields:['source_revision','references[*].reference.commit','source_refs commit provenance'],limit:'Candidate self-declares external-capture-evidence-required. Byte/ID agreement alone does not prove Git provenance. The separate source-preflight pins files to source/protocol Git trees; this mapping audit does not replace that receipt.'},
    {fields:['authority','validity','gaps','evidence','semantic_review_refs','producer_request_ref','producer_response_ref'],limit:'Exact metadata and referenced bytes are preserved; truth, sufficiency, independence and historical authorship remain judgments/capture provenance obligations.'},
    {fields:['observed_head','repo_root','implementation','observations'],limit:'Compared with current files and pinned implementation. Actual execution argv, elapsed time, stderr, exit code and environment are external execution receipt evidence. This audit is not a historical replay or independent runtime run.'},
    {fields:['contract','criteria','candidate_id','references[*].body','entries[*].artifact.result'],limit:'Checksums/structure only. No approval, policy capability, governed publication, index/read, consumer result, maintenance or CI PASS is implied.'},
  ],
  prohibited_read_check:{new_J1_J2_judgments_read:false},
  limits:['No new judge verdict issued. No oracle/consumer result was evaluated.','No CAS, corpus, .git, runtime source, policy or prepared candidate was modified; the only writes are this audit script and report.','Pure id implementation is reused for canonical identities; field mapping is checked independently without invoking the adapter.','Checksums bind exact observable bytes; they do not certify runtime correctness universally or semantic completeness.'],
}
writeFileSync(join(out,'independent-mapping-check.json'),JSON.stringify(report,null,2)+'\n')
console.log(JSON.stringify({status:report.status,comparison_count:comparisonCount,counts:report.counts,divergences,required_order_equals_entry_order:report.required_keys.required_order_equals_entry_order,report_sha256:sha256(bytes(join(out,'independent-mapping-check.json')))},null,2))
