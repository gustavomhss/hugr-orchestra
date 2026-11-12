from pathlib import Path
import base64, json, hashlib, difflib

BASE=Path("/workspace/scratch/7b5d6430f420/genesis-s2")
OUT=BASE/"corrections/l1-r2"
PIN="1cde2ff7a71bcf7aecb5d030917b577165135d38"
def sha(b): return hashlib.sha256(b).hexdigest()
def gitsha(b): return hashlib.sha1(b"blob "+str(len(b)).encode()+b"\0"+b).hexdigest()
def write(p,t):
    p.parent.mkdir(parents=True,exist_ok=True)
    p.write_text(t,encoding="utf-8",newline="")
source_index=json.loads((BASE/"producers/desktop-web/sources.json").read_text())
entries={x["path"]:x for key in ["sources","captured_not_directly_inspected"]
         for x in source_index.get(key,[]) if isinstance(x,dict) and "path" in x}
paths=["apps/desktop/src/main/owned-serve.ts","apps/desktop/src/main/index.ts",
       ".orchestra/skills/desktop-startup-maintenance/SKILL.md","apps/desktop/src/main/native-translations.ts",
       "apps/desktop/src/preload/index.ts"]
manifest=json.loads((OUT/"sources-delta.json").read_text())
manifest["captures"]=[x for x in manifest["captures"] if not any(y["unit"]=="desktop-web" for y in x["incorporation"])]
coverage=json.loads((BASE/"deliverable/layers/l1/desktop-web/coverage.json").read_text())
cov={x["path"]:x for x in coverage["entries"]}
for path in paths:
    entry=entries[path]
    raw=BASE/"producers/desktop-web"/entry["connector_response_file"]
    body=(BASE/"producers/desktop-web"/entry["local_capture_file"]).read_bytes()
    assert len(body)==entry["byte_length"] and sha(body)==entry["sha256"] and gitsha(body)==entry["git_blob_sha"]
    response=json.loads(raw.read_text()); s=response["structuredContent"]
    captured=base64.b64decode(s["content"]) if s["encoding"]=="base64" else s["content"].encode()
    assert captured==body and s["sha"]==gitsha(body) and f"/blob/{PIN}/" in s["display_url"]
    assert cov[path]["sha"]==gitsha(body) and cov[path]["size"]==len(body)
    newraw=OUT/"original-responses"/("reused-"+path.replace("/","__")+".json")
    newraw.write_bytes(raw.read_bytes())
    target=OUT/"sources"/path
    target.parent.mkdir(parents=True,exist_ok=True); target.write_bytes(body)
    manifest["captures"].append({
       "path":path,"bytes":len(body),"byte_length":len(body),"sha256":sha(body),"git_blob_sha":s["sha"],
       "computed_git_blob_sha":gitsha(body),"git_blob_verified":True,"pin":PIN,"commit":PIN,
       "local_capture_file":target.relative_to(OUT).as_posix(),
       "connector_response_file":newraw.relative_to(OUT).as_posix(),
       "connector_response_bytes":newraw.stat().st_size,"connector_response_sha256":sha(newraw.read_bytes()),
       "connector_request":{"tool":"github_fetch_file","repository_full_name":"gustavomhss/hugr-orchestra",
                            "ref":PIN,"path":path,"encoding":s["encoding"]},
       "acquisition":"reused exact producer capture; original response/source/SHA256/Git blob reverified",
       "line_count":len(body.decode().splitlines()),
       "reused_response_original":str(raw),
       "reused_source_original":str(BASE/"producers/desktop-web"/entry["local_capture_file"]),
       "incorporation":[{"unit":"desktop-web","source_index_action":"retain-existing-capture-no-double-count",
                        "assigned_population_member":True,"coverage_action":"preserve-existing-inspected-entry",
                        "previous_evidence_depth":cov[path].get("evidence_depth",cov[path].get("evidence-depth"))}]
    })
manifest["per_unit_reconciliation"]["desktop-web"]={
    "original_captures":source_index["verified_capture_count"],"unique_added_captures":0,
    "revised_captures":source_index["verified_capture_count"],"assigned_paths":532,
    "new_unique_paths":[],"additional_unique_source_bytes":0,
    "coverage_action":"preserve original ledger byte-for-byte; exact extra spans are carried by the delta"
}
write(OUT/"sources-delta.json",json.dumps(manifest,indent=2)+"\n")

original=(BASE/"deliverable/layers/l1/desktop-web/l1.md").read_text()
old="Its normal branch resolves a bundled CLI and launch environment together, then calls `startOwnedServe` with a cwd under desktop user data."
new="Its normal branch creates `join(app.getPath(\"userData\"), \"global\")` recursively and passes that exact directory as `cwd` to `startOwnedServe`, after resolving the bundled CLI and launch environment together. The maintenance skill separately prescribes `userData/global` and warns against home or another large folder; its reported startup cost is historical, not a measurement from this work."
assert original.count(old)==1
revised=original.replace(old,new,1)
old_cite="(`M/index.ts:320–338,431–475`; `R/index.tsx:367–388`.)"
new_cite="(`M/index.ts:320–338,431–475`; `.orchestra/skills/desktop-startup-maintenance/SKILL.md:18–21`; `R/index.tsx:367–388`.)"
assert revised.count(old_cite)==1
revised=revised.replace(old_cite,new_cite,1)
write(OUT/"desktop-web/l1.md",revised)
write(OUT/"desktop-web/l1.diff","".join(difflib.unified_diff(original.splitlines(keepends=True),revised.splitlines(keepends=True),
      fromfile="original/desktop-web/l1.md",tofile="correction/desktop-web/l1.md")))

excerpts=[
 ("desktop-readiness-cap","apps/desktop/src/main/owned-serve.ts",[(15,25)],
  "The readiness ceiling is 120,000ms; the comment's scan timing is historical rationale."),
 ("desktop-readiness-race","apps/desktop/src/main/owned-serve.ts",[(94,102),(130,141)],
  "Health races first exit and deadline; sidecarMode and authenticated response.ok predicate are exact code."),
 ("desktop-cwd-and-readiness-publication","apps/desktop/src/main/index.ts",[(431,466),(467,475)],
  "Main creates userData/global and supplies it as cwd; health is awaited before serverReady publication."),
 ("desktop-cwd-maintenance","."+ "orchestra/skills/desktop-startup-maintenance/SKILL.md",[(18,21)],
  "Maintenance rule for cwd, separated from its historical measured rationale."),
 ("desktop-native-typed-bridge","apps/desktop/src/main/native-translations.ts",[(1,24)],
  "Typed bundle/key imports, English initial bundle, equality check and nativeT delegation."),
 ("desktop-preload-named-api","apps/desktop/src/preload/index.ts",[(1,4),(24,48),(64,66),(159,164),(243,254)],
  "The preload builds a named ElectronAPI object and exposes that object as window.api through contextBridge; representative named calls are shown, not a blanket IPC admission guarantee.")
]
evidence=["# Decisive desktop delta — S2 L1 correction","",
 "Execution: `46d09d97-39a9-482a-a290-646ba1d94c99`. Pin: `"+PIN+"`. Public scope extension: exact cwd wording plus additional readiness and native-translation excerpts.","",
 "This correction changes one desktop L1 paragraph. All original static discrepancies and other claims are preserved. These are reverified source excerpts, not new runtime measurements, test results or a producer verdict. Five previously captured files are reused without increasing the canonical source count.",""]
em=[]
for ident,path,ranges,note in excerpts:
    entry=next(x for x in manifest["captures"] if x["path"]==path)
    lines=(OUT/"sources"/path).read_bytes().decode("utf-8").splitlines(keepends=True)
    evidence += [f"## {ident}","",note,"",f"Source: `{path}`; commit `{PIN}`; Git blob `{entry['git_blob_sha']}`; SHA-256 `{entry['sha256']}`.",""]
    for start,end in ranges:
        span="".join(lines[start-1:end]);assert span
        lang="md" if path.endswith(".md") else "ts"
        evidence += [f"Exact lines {start}–{end}:","",f"```{lang}\n"+span+("" if span.endswith("\n") else "\n")+"```",""]
        em.append({"id":ident,"path":path,"start_line":start,"end_line":end,
                   "excerpt_bytes":len(span.encode()),"excerpt_sha256":sha(span.encode())})
write(OUT/"decisive-delta-desktop.md","\n".join(evidence)+"\n")
write(OUT/"excerpt-manifest-desktop.json",json.dumps(em,indent=2)+"\n")

verification=json.loads((OUT/"verification.json").read_text())
verification["source_capture_count"]=len(manifest["captures"])
verification["reused_exact_file_captures"]=6
verification["verified_source_bytes"]=sum(x["bytes"] for x in manifest["captures"])
verification["desktop_excerpt_count"]=len(em)
verification["desktop_single_paragraph_change"]=True
# Reversing only the two authorized replacements reproduces every original byte.
assert revised.replace(new,old,1).replace(new_cite,old_cite,1)==original
verification["desktop_original_reproduced_by_reversing_two_replacements"]=True
verification["artifacts"]=[x for x in verification["artifacts"] if "/desktop-web/" not in x["path"]]
verification["artifacts"].append({"path":str(OUT/"desktop-web/l1.md"),"bytes":len(revised.encode()),"sha256":sha(revised.encode())})
for item in json.loads((OUT/"preserved-originals.json").read_text()):
    b=Path(item["path"]).read_bytes();assert len(b)==item["bytes"] and sha(b)==item["sha256"]
write(OUT/"verification.json",json.dumps(verification,indent=2)+"\n")
print(json.dumps({"desktop_source_count":source_index["verified_capture_count"],"delta_source_count":len(manifest["captures"]),
                  "desktop_l1":verification["artifacts"][-1],"desktop_excerpt_count":len(em)},indent=2))

