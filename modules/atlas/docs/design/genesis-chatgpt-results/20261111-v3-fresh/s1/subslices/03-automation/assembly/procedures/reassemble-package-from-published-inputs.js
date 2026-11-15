function reconstructNativePackage(F) {
 const OUT="modules/atlas/docs/design/genesis-chatgpt-results/20261111-v3-fresh/s1/subslices/03-automation";
 const pin="191a3b3a12c60a2df70c1dbf36510303c025c5ea";
 const read=p=>JSON.parse(F[p].content), cfg=read("assembly/final-config-prepublication.json"), plan=read("artifact-plan.json");
 const gates=Object.fromEntries(read("semantic-acceptances.json").artifacts.map(a=>[a.key,a]));
 const audit=Object.fromEntries(read("assembly/native-l1-v2/descriptors.json").artifacts.map(a=>[a.key,a]));
 const inventory=read("assembly/final-input-inventory.json"), shared=read("receipts/shared-input-materialization.json").files;
 const must=(x,m)=>{if(!x)throw Error(m)}, all=new Map(), artifacts=[];
 function canonical(row) {
  const retained=row.retained_alias||row.local_path;
  const matches=inventory.local_path_translations.filter(t=>t.declared_local_input_path===row.local_path&&t.sha256===row.sha256&&t.retained_path===retained);
  must(matches.length>0,"translation missing "+retained);
  const t=matches[0];must(matches.every(x=>x.canonical_path===t.canonical_path&&x.publication_commit===t.publication_commit),"ambiguous translation "+retained);
  return {input_key:"file:"+t.canonical_path,canonical_path:t.canonical_path,bytes:t.bytes,sha256:t.sha256,git_blob_sha:row.git_blob_sha,origin_commit:t.canonical_path.startsWith(OUT+"/")?pin:t.publication_commit};
 }
 const ref=(local)=>{const rel=local.replace(/^payload\//,""),file=F[rel];must(file,"unfetched ref "+rel);return {payload_path:OUT+"/"+rel,sha256:file.sha256};};
 for(const task of plan.artifacts) {
  const key=task.key, gate=gates[key], spec=cfg.artifacts[key], units=new Map();
  must(gate.status==="PASS_SEMANTIC_CURRENT_BODY","gate "+key);
  const body=F[gate.local_body_path];must(body&&body.sha256===gate.body_sha256&&body.bytes===gate.body_bytes&&body.git_blob_sha===gate.body_git_blob_sha,"body "+key);
  const merge=u=>{const old=units.get(u.canonical_path);if(old)must(["bytes","sha256","git_blob_sha"].every(k=>old[k]===u[k]),"unit collision "+u.canonical_path);else units.set(u.canonical_path,u);const prev=all.get(u.canonical_path);if(prev)must(prev.sha256===u.sha256,"global collision");else all.set(u.canonical_path,u);};
  if(audit[key]) for(const source of audit[key].input_units) {
   let u=JSON.parse(JSON.stringify(source));const override=spec.audited_path_aliases?.[u.canonical_path];
   if(override)u=canonical({local_path:override.original_local_path,retained_alias:override.retained_local_path,sha256:u.sha256,bytes:u.bytes,git_blob_sha:u.git_blob_sha});
   else if(u.canonical_path.startsWith(OUT+"/"))u.origin_commit=pin;
   merge(u);
  }
  for(const row of spec.additional_actual_inputs||[]) merge(canonical(row));
  const arr=Array.from(units.values()),reviewrefs=[];
  for(const j of gate.judgments){must(j.status==="PASS"&&j.body_sha256===gate.body_sha256,"review gate");const p=spec.review_payload_paths[j.judge_id];must(F[p]&&F[p].sha256===j.original_response_sha256,"review original");reviewrefs.push(ref("payload/"+p));}
  const recipe=ref(spec.actual_recipe_local_path);must(arr.some(u=>u.input_key==="file:"+recipe.payload_path),"recipe input missing");
  artifacts.push({key,scope:"orchestra.s1",title:task.purpose,layer:task.layer,need:task.need,body:{path:gate.local_body_path,encoding:"utf-8",byte_length:body.bytes,sha256:body.sha256},authority:{scope:"orchestra.s1",basis:"S1-03 COMMON/mission at 70234d541a9a3539935ef16f19e33c8f2d5f30ec; current body accepted by the same two local native judges. Content authority only; no runtime or production activation authority is conferred."},validity:"supported",gaps:spec.gaps,evidence:spec.evidence,input_keys:arr.map(u=>u.input_key),source_refs:arr.map(u=>({commit:u.origin_commit,path:u.canonical_path,git_blob_sha:u.git_blob_sha,sha256:u.sha256})),recipe_ref:recipe,build_dependencies:task.required_build_predecessors.map(p=>({key:p,same_package:true})),navigation:spec.navigation||[],producer_request_ref:ref(spec.request_local_path),producer_response_ref:ref(spec.response_local_path),semantic_review_refs:reviewrefs,runtime_receipt_refs:[]});
 }
 const proto=shared.find(s=>s.path===".orchestra/skills/execute-genesis/references/transport.md");
 const pack={schema:"genesis-native-package/v1",campaign:"20261111-v1",protocol_epoch:"parallel-v3-fresh",results_epoch:"20261111-v3-fresh",session:"S1",source_revision:"1cde2ff7a71bcf7aecb5d030917b577165135d38",protocol_ref:{commit:proto.commit,path:proto.path,sha256:proto.sha256},scope:"orchestra.s1",package_state:"SEMANTICALLY_REVIEWED_RUNTIME_OPERATIONS_PENDING",contract:{criteria:cfg.native_contract_criteria,oracle_ref:{payload_path:OUT+"/oracles/consumer-maintenance-v1.json",sha256:"f1cc16fcd73e17fa1aff015e30e7facacaabf0dc2b195c0603f9f30a1f875ccb"}},required_artifact_keys:plan.artifacts.map(t=>t.key),artifacts,roots:cfg.roots,missing_required_artifact_keys:[],known_limits:cfg.known_limits};
 const seen=new Set();for(const a of artifacts){must(a.build_dependencies.every(d=>seen.has(d.key)),"dependency ordering");seen.add(a.key);must(a.input_keys.length===new Set(a.input_keys).size&&a.input_keys.length===a.source_refs.length,"input bijection");must(a.key!=="s1.core.entry","historical key");}
 must(all.size===694,"unique count");must(artifacts.reduce((n,a)=>n+a.input_keys.length,0)===979,"usage count");
 return {content:JSON.stringify(pack,null,2)+"\n",unique_inputs:all.size,input_counts:Object.fromEntries(artifacts.map(a=>[a.key,a.input_keys.length])),oversized_inputs:Array.from(all.values()).filter(u=>u.bytes>256000).map(u=>({path:u.canonical_path,bytes:u.bytes,sha256:u.sha256,git_blob_sha:u.git_blob_sha})),artifacts};
}
