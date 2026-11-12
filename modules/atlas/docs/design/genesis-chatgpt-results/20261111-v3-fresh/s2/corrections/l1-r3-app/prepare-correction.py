from pathlib import Path
import base64, difflib, hashlib, json, re, shutil

BASE=Path("/workspace/scratch/7b5d6430f420/genesis-s2")
OUT=BASE/"corrections/l1-r3-app"
CANON=BASE/"deliverable/layers/l1/app-session"
PRODUCER=BASE/"producers/app-session"
PIN="1cde2ff7a71bcf7aecb5d030917b577165135d38"
EXECUTION="46d09d97-39a9-482a-a290-646ba1d94c99"
EXPECTED="0cacdbe33f21ceda94bddd725588a45ba10ac4945195d4f9b9794e2b0c1cc0bc"
def sha(b): return hashlib.sha256(b).hexdigest()
def gitsha(b): return hashlib.sha1(b"blob "+str(len(b)).encode()+b"\0"+b).hexdigest()
def write(path,text):
    path.parent.mkdir(parents=True,exist_ok=True)
    path.write_bytes(text.encode("utf-8"))

original=(CANON/"l1.md").read_bytes()
assert sha(original)==EXPECTED
original_text=original.decode("utf-8")
preserved=[]
for unit in ["app-session","design-tui","desktop-web"]:
    for name in ["l1.md","coverage.json","sources.json","decisive-evidence.md"]:
        p=BASE/"deliverable/layers/l1"/unit/name
        b=p.read_bytes()
        preserved.append({"path":str(p),"bytes":len(b),"sha256":sha(b)})
write(OUT/"preserved-originals.json",json.dumps(preserved,indent=2)+"\n")

authority="""App-shell's local AGENTS fixes the priority order as **stability, simplicity, performance**. Before changing session or timeline code, it requires recording a production benchmark baseline and comparing it after the change. Session UI's local AGENTS separately requires i18n keys for production-visible copy, preserves existing English text byte-for-byte during migration and forbids changing English text or keys to facilitate translation. These are attributed maintenance obligations; this L1 correction records them without modifying product code or executing a benchmark. (`A/AGENTS.md:1–4`; `S/AGENTS.md:1–7`.)

"""
transport="""The generated Client has its own runtime dependency rule: root AGENTS permits Client dependencies on Schema and Protocol and forbids dependencies on Core or Server at runtime. This Client prohibition is distinct from the explicitly permitted `platform:browserSafe` Core-helper exception for the UI layer described above; that UI exception does not authorize a Client runtime dependency. After a public Protocol or Server `HttpApi` change, root AGENTS requires `bun run generate` from `packages/client`; raw `packages/client/src/generated` and `packages/client/src/generated-effect` files must never be hand-edited. These are prescribed change requirements; no Client generation or product change was performed here. (`AGENTS.md:1–2`.)

"""
benchmark="""The local benchmark condition remains specific and mandatory for app-shell session or timeline changes: record a **production benchmark baseline before the change** and **compare it after the change**. The performance directory's normal-run exclusion and the diagnostic interpretation above do not remove that prescribed condition. This documentation correction changes no session/timeline product code and executes no benchmark or product test. (`A/AGENTS.md:1–4`.)

"""
old_retry="Core checks an existing ID, rejects a different equivalent payload, publishes the admission event, requires a durable aggregate sequence and finds the projected record before returning."
new_retry="Core returns the previous admission when an existing ID has an equivalent session, encoded prompt and delivery; non-equivalent reuse rejects with `LifecycleConflict`. When it creates a new admission, Core publishes the admission event, requires a durable aggregate sequence and finds the projected record before returning."
ops=[
 {"id":"authority-normative-disposition","kind":"insertion","anchor":"The eight historical proposals are evidence of earlier intent:","old":"","new":authority,
  "section":"Authority, composition and identity","public_findings":["J1-AS-01","J2-F1/F2"]},
 {"id":"client-generated-runtime-boundary","kind":"insertion","anchor":"The app adapter wraps the generated client and maps wire results into app view contracts.","old":"","new":transport,
  "section":"Transport, stream health and canonical recovery","public_findings":["J1-AS-01","J2-F1/F2"]},
 {"id":"retry-equivalence-correction","kind":"replacement","anchor":old_retry,"old":old_retry,"new":new_retry,
  "section":"Prompt admission and draft ownership","public_findings":["J1-AS-02"]},
 {"id":"benchmark-prescription-versus-execution","kind":"insertion","anchor":"The packet's limit is explicit:","old":"","new":benchmark,
  "section":"Assets, localization and verification evidence","public_findings":["J1-AS-01","J2-F1/F2"]}
]
revised=original_text
for op in ops:
    assert revised.count(op["anchor"])==1
    if op["kind"]=="insertion":
        revised=revised.replace(op["anchor"],op["new"]+op["anchor"],1)
    else:
        revised=revised.replace(op["old"],op["new"],1)
assert old_retry not in revised
write(OUT/"l1.md",revised)
write(OUT/"l1.diff","".join(difflib.unified_diff(original_text.splitlines(keepends=True),revised.splitlines(keepends=True),
      fromfile="canonical-r2/app-session/l1.md",tofile="correction-r3/app-session/l1.md")))

# Record exact change spans and identical remainder segments, using byte offsets.
old_bytes=original
new_bytes=revised.encode()
equal_segments=[]; unequal_segments=[]
old_cursor=0; new_cursor=0
for op in ops:
    start=len(original_text[:original_text.index(op["anchor"])].encode())
    end=start+len(op["old"].encode())
    unchanged=old_bytes[old_cursor:start]
    new_end=new_cursor+len(unchanged)
    assert new_bytes[new_cursor:new_end]==unchanged
    equal_segments.append({"kind":"equal","original_byte_start":old_cursor,"original_byte_end":start,
                           "revised_byte_start":new_cursor,"revised_byte_end":new_end,
                           "original_bytes":len(unchanged),"revised_bytes":len(unchanged),"sha256":sha(unchanged)})
    new_cursor=new_end
    replacement=op["new"].encode()
    new_end=new_cursor+len(replacement)
    assert old_bytes[start:end]==op["old"].encode() and new_bytes[new_cursor:new_end]==replacement
    unequal_segments.append({"kind":op["kind"],"operation_id":op["id"],"original_byte_start":start,"original_byte_end":end,
                             "revised_byte_start":new_cursor,"revised_byte_end":new_end,
                             "original_bytes":end-start,"revised_bytes":len(replacement),
                             "original_sha256":sha(old_bytes[start:end]),"revised_sha256":sha(replacement)})
    old_cursor=end;new_cursor=new_end
unchanged=old_bytes[old_cursor:]
assert new_bytes[new_cursor:]==unchanged
equal_segments.append({"kind":"equal","original_byte_start":old_cursor,"original_byte_end":len(old_bytes),
                       "revised_byte_start":new_cursor,"revised_byte_end":len(new_bytes),
                       "original_bytes":len(unchanged),"revised_bytes":len(unchanged),"sha256":sha(unchanged)})
for op in ops:
    op["old_byte_length"]=len(op["old"].encode())
    op["new_byte_length"]=len(op["new"].encode())
    op["old_sha256"]=sha(op["old"].encode())
    op["new_sha256"]=sha(op["new"].encode())
write(OUT/"changed-spans.json",json.dumps({"source_body_sha256":EXPECTED,"operations":ops,
      "equal_remainder_segments":equal_segments,"byte_diff_segments":unequal_segments},indent=2)+"\n")
restored=revised
for op in reversed(ops):
    if op["kind"]=="insertion":
        assert restored.count(op["new"]+op["anchor"])==1
        restored=restored.replace(op["new"]+op["anchor"],op["anchor"],1)
    else:
        assert restored.count(op["new"])==1
        restored=restored.replace(op["new"],op["old"],1)
assert restored.encode()==original

# Reuse three already-captured normative files and preserve full original connector batch bytes.
source_index=json.loads((CANON/"sources.json").read_bytes())
entries={x["path"]:x for val in source_index.values() if isinstance(val,list) for x in val
         if isinstance(x,dict) and "git_blob_sha" in x}
coverage=json.loads((CANON/"coverage.json").read_bytes())
assigned={x["path"]:x for x in coverage["entries"]}
normative_paths=["packages/app-shell/AGENTS.md","packages/session-ui/AGENTS.md","AGENTS.md"]
captures=[]
for path in normative_paths:
    old=entries[path]
    source=PRODUCER/old["local_capture_file"]
    raw=PRODUCER/old["connector_response_file"]
    data=json.loads(raw.read_bytes())
    matches=[(i,x) for i,x in enumerate(data) if x.get("path")==path]
    assert len(matches)==1
    position,item=matches[0]
    response=item["value"]; s=response["structuredContent"]
    decoded=base64.b64decode(s["content"]) if s["encoding"]=="base64" else s["content"].encode()
    b=source.read_bytes()
    assert decoded==b and len(b)==old["byte_length"]
    assert sha(b)==old["sha256"] and gitsha(b)==old["git_blob_sha"]==s["sha"]
    assert f"/blob/{PIN}/" in s["display_url"] and old["commit"]==PIN
    target=OUT/"sources"/path;target.parent.mkdir(parents=True,exist_ok=True);target.write_bytes(b)
    newraw=OUT/"original-responses"/("reused-"+raw.name);newraw.parent.mkdir(parents=True,exist_ok=True);newraw.write_bytes(raw.read_bytes())
    if path in assigned:
        assert assigned[path]["sha"]==gitsha(b) and assigned[path]["size"]==len(b)
        assert assigned[path]["evidence_depth"]=="inspected"
    captures.append({
      "path":path,"bytes":len(b),"byte_length":len(b),"sha256":sha(b),"git_blob_sha":gitsha(b),
      "pin":PIN,"commit":PIN,"local_capture_file":target.relative_to(OUT).as_posix(),
      "connector_response_file":newraw.relative_to(OUT).as_posix(),
      "connector_response_pointer":{"array_index":position,"value_key":"value"},
      "connector_response_bytes":newraw.stat().st_size,"connector_response_sha256":sha(newraw.read_bytes()),
      "original_source_file":str(source),"original_connector_response_file":str(raw),
      "acquisition":"reuse existing exact connector capture; source and response roundtrip plus SHA256/Git blob verified",
      "new_unique_capture":False,"assigned_population_member":path in assigned,
      "incorporation":"retain existing canonical source record; add normative excerpt/read-span provenance only",
      "read_ranges":[[1,4]] if path.startswith("packages/app-shell") else [[1,7]] if path.startswith("packages/session-ui") else [[1,2]]
    })
core=entries["packages/core/src/session/input.ts"]
core_bytes=(PRODUCER/core["local_capture_file"]).read_bytes()
assert len(core_bytes)==core["byte_length"] and sha(core_bytes)==core["sha256"] and gitsha(core_bytes)==core["git_blob_sha"]
existing_evidence=(CANON/"decisive-evidence.md").read_bytes()
e15=existing_evidence.decode().split("## E15 — Core admission and retry equivalence\n",1)[1].split("\n## E16",1)[0]
assert "if (!equivalent(existing, input))" in e15 and "return existing" in e15 and "JSON.stringify(encodePrompt(input.prompt))" in e15
manifest={
 "schema":"genesis-s2-l1-correction-sources/v1","execution_id":EXECUTION,
 "revision":"l1-r3-app","repository":"gustavomhss/hugr-orchestra","pin":PIN,
 "canonical_r2_body":{"path":str(CANON/"l1.md"),"bytes":len(original),"sha256":EXPECTED},
 "captures":captures,
 "existing_evidence_reused":[{
   "path":"packages/core/src/session/input.ts","bytes":len(core_bytes),"sha256":sha(core_bytes),"git_blob_sha":gitsha(core_bytes),
   "pin":PIN,"canonical_source_index":str(CANON/"sources.json"),
   "canonical_decisive_evidence_file":str(CANON/"decisive-evidence.md"),
   "canonical_decisive_evidence_sha256":sha(existing_evidence),"section":"E15 — Core admission and retry equivalence",
   "verified_ranges":[[59,62],[291,316]],"new_unique_capture":False,
   "note":"The correction uses the already-preserved E15 support; no additional source or test is introduced for retry equivalence."
 }],
 "counts":{"new_unique_sources":0,"new_assigned_paths":0,"assigned_depth_changes":0,
           "canonical_unique_sources":255,"assigned_source_captures":238,"boundary_source_captures":17,
           "assigned_population":1887,"inspected":234,"family_supported":1623,"metadata_only":30},
 "limits":["Three normative captures are reused, not appended as new unique sources.",
           "No source generation, benchmark or product test was performed."]
}
write(OUT/"sources-delta.json",json.dumps(manifest,indent=2)+"\n")

witnesses=[
 ("R3-N01 — App-shell priorities and benchmark condition","packages/app-shell/AGENTS.md",1,4,
  "Prescribed priority order and before/after production-benchmark condition for session or timeline changes. This is authority, not an executed benchmark."),
 ("R3-N02 — Session UI local authority","packages/session-ui/AGENTS.md",1,7,
  "Local localization obligations. This file does not supply the app-shell benchmark condition or a Client dependency exception."),
 ("R3-N03 — Generated Client and runtime dependencies","AGENTS.md",1,2,
  "Root requires regeneration after a public Protocol/Server HttpApi change, forbids direct generated-file editing, and forbids Client runtime dependencies on Core/Server. Existing E01 supplies the distinct UI browserSafe exception.")
]
decisive=[
 "# Decisive delta — app-session L1 r3","",
 f"Execution: `{EXECUTION}`. Source pin: `{PIN}`. Canonical r2 body: `{EXPECTED}`.","",
 "These are exact normative witnesses from existing connector captures. Their status is prescribed maintenance authority; no product change, generation, benchmark or test execution is inferred. Existing r2 evidence, including E01 and E15, remains unchanged.",""
]
excerpt_manifest=[]
for title,path,start,end,note in witnesses:
    entry=next(x for x in captures if x["path"]==path)
    lines=(OUT/"sources"/path).read_bytes().decode().splitlines(keepends=True)
    text="".join(lines[start-1:end])
    decisive += [f"## {title}","",note,"",
       f"Source: `{path}`; commit `{PIN}`; Git blob `{entry['git_blob_sha']}`; SHA-256 `{entry['sha256']}`.",
       "",f"Exact lines {start}–{end}:","","```md\n"+text+("" if text.endswith("\n") else "\n")+"```",""]
    excerpt_manifest.append({"path":path,"start_line":start,"end_line":end,"bytes":len(text.encode()),"sha256":sha(text.encode())})
decisive += ["## Existing retry witness retained","",
 "The revised admission sentence uses the unchanged canonical `E15 — Core admission and retry equivalence`: `packages/core/src/session/input.ts:59–62` returns the existing admission after its equivalence guard; `291–302` compares delivery, session and encoded prompt; `304–316` adds promptContext and timeCreated for projection equivalence. No new source or test is required for this correction. Its exact source/evidence hashes are bound in `sources-delta.json`.",""]
write(OUT/"decisive-delta.md","\n".join(decisive)+"\n")
write(OUT/"excerpt-manifest.json",json.dumps(excerpt_manifest,indent=2)+"\n")

families={x["id"]:x for x in coverage["families"]}
updates=[]
def family(fid,changes):
    updates.append({"family_id":fid,"updates":changes})
family("authority",{
 "representative_source_paths":list(dict.fromkeys(families["authority"]["representative_source_paths"]+["packages/session-ui/AGENTS.md","AGENTS.md"])),
 "source_implications":families["authority"]["source_implications"]+" App-shell AGENTS explicitly prioritizes stability, simplicity and performance in that order, and requires a production benchmark baseline before changing session/timeline code plus comparison after the change. Session UI AGENTS separately supplies its localization obligations.",
 "consumer_implications":families["authority"]["consumer_implications"]+" That UI browserSafe exception is distinct from root AGENTS' prohibition on Client runtime dependencies on Core or Server; Client may depend on Schema and Protocol.",
 "maintenance_implications":families["authority"]["maintenance_implications"]+" Public Protocol or Server HttpApi changes require bun run generate from packages/client; raw Client src/generated and src/generated-effect files must not be hand-edited. These rules and the conditional benchmark obligation are prescribed authority, not executions performed by this L1 correction."
})
family("transport",{
 "representative_source_paths":list(dict.fromkeys(families["transport"]["representative_source_paths"]+["AGENTS.md"])),
 "maintenance_implications":families["transport"]["maintenance_implications"]+" Keep the generated Client's runtime dependencies on Schema/Protocol and never Core/Server, independently of the UI browserSafe-helper allowance. After a public Protocol or Server HttpApi change, run generation from packages/client and never hand-edit src/generated or src/generated-effect. This correction records that requirement and does not run generation.",
 "limits":families["transport"]["limits"]+" The Client dependency/generation rules are prescribed maintenance constraints; no generator, dependency checker or product code ran here."
})
family("timeline",{
 "representative_source_paths":list(dict.fromkeys(families["timeline"]["representative_source_paths"]+["packages/app-shell/AGENTS.md"])),
 "maintenance_implications":families["timeline"]["maintenance_implications"]+" App-shell AGENTS requires a production benchmark baseline before changing session or timeline code and comparison after the change, with stability, simplicity and performance prioritized in that order. This documentation correction changes no product code and performs no benchmark."
})
family("benchmarks",{
 "representative_source_paths":list(dict.fromkeys(families["benchmarks"]["representative_source_paths"]+["packages/app-shell/AGENTS.md"])),
 "source_implications":families["benchmarks"]["source_implications"]+" App-shell AGENTS nevertheless prescribes recording a production benchmark baseline before changing session or timeline code and comparing it after the change.",
 "consumer_implications":"Maintainers invoke the benchmark production-build harness explicitly to satisfy the before/after condition for app-shell session or timeline changes; normal Playwright exclusion does not remove that requirement. The obligation is recorded, not executed, in this L1 correction.",
 "maintenance_implications":families["benchmarks"]["maintenance_implications"]+" Preserve the mandatory before/after benchmark condition for session/timeline code changes and the app-shell priority order stability, simplicity, performance.",
 "limits":families["benchmarks"]["limits"]+" The prescribed benchmark condition is not evidence of collected measurements or performance acceptance."
})
family_delta={"schema":"genesis-s2-l1-family-delta/v1","execution_id":EXECUTION,"revision":"l1-r3-app","unit":"app-session",
 "updates":updates,
 "scope_note":"Only semantic fields of the four existing families are updated; IDs, assigned entries, counts, classifications and evidence depths remain unchanged. No other unit is changed."}
write(OUT/"family-delta.json",json.dumps(family_delta,indent=2)+"\n")

# Mechanical checks: exact normative quotations, unchanged remainder and counts.
rendered=(OUT/"decisive-delta.md").read_bytes().decode()
observed=[]
for q in re.finditer(r"^Source: `([^`]+)`;[^\n]*\n\nExact lines (\d+)–(\d+):\n\n```md\n(.*?)```",rendered,re.M|re.S):
    path=q.group(1)
    lines=(OUT/"sources"/path).read_bytes().decode().splitlines(keepends=True)
    start,end=int(q.group(2)),int(q.group(3))
    span="".join(lines[start-1:end])
    assert q.group(4)==span
    observed.append({"path":path,"start_line":start,"end_line":end,"bytes":len(span.encode()),"sha256":sha(span.encode())})
assert observed==excerpt_manifest
def section(data,heading):
    return data.split(("## "+heading+"\n").encode(),1)[1].split(b"\n## ",1)[0]
assert section(original,"Skills catalog, editing and ownership")==section(new_bytes,"Skills catalog, editing and ownership")
# All original paragraphs except the single corrected admission paragraph remain exact.
original_paras=original_text.split("\n\n")
revised_paras=revised.split("\n\n")
changed_original_paras=[p for p in original_paras if p not in revised_paras]
assert len(changed_original_paras)==1 and old_retry in changed_original_paras[0]
def citation_paths(s):
    return {m.split(":",1)[0] for m in re.findall(r"`([^`\n]+:\d[^`\n]*)`",s) if "/" in m}
assert not citation_paths(original_text)-citation_paths(revised)
allpaths=[]
for unit in ["app-session","design-tui","desktop-web"]:
    c=json.loads((BASE/"deliverable/layers/l1"/unit/"coverage.json").read_bytes())
    allpaths.extend(x["path"] for x in c["entries"])
assert len(allpaths)==4506==len(set(allpaths))
scope_hash=sha(("\n".join(sorted(allpaths))+"\n").encode())
assert scope_hash=="8b70f96dcbb623bdd1cc2a48b61d51d255d9d9ce90836efc9a5cd05f1fc5a582"
for entry in preserved:
    b=Path(entry["path"]).read_bytes()
    assert len(b)==entry["bytes"] and sha(b)==entry["sha256"]
sections=[]
lines=revised.splitlines(keepends=True)
starts=[i for i,line in enumerate(lines) if line.startswith("## ")]
for ix,start in enumerate(starts):
    end=starts[ix+1] if ix+1<len(starts) else len(lines)
    sections.append({"heading":lines[start].strip()[3:],"bytes":len("".join(lines[start:end]).encode())})
verification={
 "execution_id":EXECUTION,"revision":"l1-r3-app","status":"producer correction ready; semantic judgment pending",
 "semantic_verdict":None,"source_pin":PIN,
 "canonical_r2_body":{"path":str(CANON/"l1.md"),"bytes":len(original),"sha256":EXPECTED},
 "revised_body":{"path":str(OUT/"l1.md"),"bytes":len(new_bytes),"sha256":sha(new_bytes)},
 "change_operations":4,"inserted_normative_paragraphs":3,"corrected_existing_paragraphs":1,
 "all_other_original_paragraphs_preserved_exactly":True,"reversing_four_changes_reproduces_original_bytes":True,
 "equal_remainder_byte_segments":len(equal_segments),"equal_remainder_verified_bytes":sum(x["original_bytes"] for x in equal_segments),
 "skills_section_byte_identical":True,"inherited_cited_paths_removed":[],
 "canonical_files_preserved":len(preserved),"other_unit_body_hashes":{
   x["path"].split("/layers/l1/")[1].split("/")[0]:x["sha256"] for x in preserved if x["path"].endswith("/l1.md") and "/app-session/" not in x["path"]},
 "normative_capture_count":3,"normative_capture_bytes":sum(x["bytes"] for x in captures),
 "new_unique_source_captures":0,"source_hash_and_response_roundtrip_verified":True,"exact_normative_excerpts":len(excerpt_manifest),
 "existing_E15_binding_verified":True,"new_assigned_paths":0,"depth_changes":0,
 "app_session_population":1887,"app_session_unique_sources":255,"app_session_depth":{"inspected":234,"family_supported":1623,"metadata_only":30},
 "all_units_population":4506,"all_units_unique_paths":4506,"all_units_path_sha256":scope_hash,
 "sections":sections,"product_tests":0,"benchmarks":0,"generation_runs":0,"product_edits":0,"remote_writes":0,
 "oracles_or_judge_packets_accessed":False,"later_layers":"L2-L4 remain blocked pending complete L1 judgment"
}
write(OUT/"verification.json",json.dumps(verification,indent=2)+"\n")
print(json.dumps({k:verification[k] for k in ["revised_body","change_operations","skills_section_byte_identical","canonical_files_preserved","normative_capture_count","new_unique_source_captures","all_units_population","all_units_path_sha256"]},indent=2))

