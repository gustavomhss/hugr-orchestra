from pathlib import Path
import json,base64,hashlib,re
BASE=Path("/workspace/scratch/7b5d6430f420/genesis-s2")
OUT=BASE/"corrections/l1-r2"
def sha(b): return hashlib.sha256(b).hexdigest()
def gitsha(b): return hashlib.sha1(b"blob "+str(len(b)).encode()+b"\0"+b).hexdigest()
sources=json.loads((OUT/"sources-delta.json").read_text())
for item in sources["captures"]:
    source=OUT/item["local_capture_file"]
    raw=OUT/item["connector_response_file"]
    assert not source.is_symlink() and not raw.is_symlink()
    body=source.read_bytes()
    assert len(body)==item["bytes"]==item["byte_length"]
    assert sha(body)==item["sha256"] and gitsha(body)==item["git_blob_sha"]==item["computed_git_blob_sha"]
    assert sha(raw.read_bytes())==item["connector_response_sha256"]
    response=json.loads(raw.read_text())["structuredContent"]
    assert response["sha"]==item["git_blob_sha"]
    decoded=base64.b64decode(response["content"]) if response["encoding"]=="base64" else response["content"].encode()
    assert decoded==body

quote_count=0
for filename, manifest_name in [("decisive-delta.md","excerpt-manifest.json"),
                                ("decisive-delta-desktop.md","excerpt-manifest-desktop.json")]:
    evidence=(OUT/filename).read_bytes().decode("utf-8")
    expected=json.loads((OUT/manifest_name).read_text())
    observed=[]
    for block in re.finditer(r"^Source: `([^`]+)`;.*?(?=^## |\Z)",evidence,re.M|re.S):
        path=block.group(1)
        source_lines=(OUT/"sources"/path).read_bytes().decode("utf-8").splitlines(keepends=True)
        for quote in re.finditer(r"Exact lines (\d+)–(\d+):\n\n```(?:ts|md)\n(.*?)```",block.group(0),re.S):
            start,end=int(quote.group(1)),int(quote.group(2))
            text="".join(source_lines[start-1:end])
            assert quote.group(3)==text
            observed.append((path,start,end,len(text.encode()),sha(text.encode())))
    claimed=[(x["path"],x["start_line"],x["end_line"],x["excerpt_bytes"],x["excerpt_sha256"]) for x in expected]
    assert observed==claimed
    quote_count+=len(observed)

citations={}
for unit in ["app-session","design-tui","desktop-web"]:
    old=(BASE/"deliverable/layers/l1"/unit/"l1.md").read_bytes()
    new=(OUT/unit/"l1.md").read_bytes()
    def paths(body):
        return {x.split(":",1)[0] for x in re.findall(r"`([^`\n]+:\d[^`\n]*)`",body.decode()) if "/" in x}
    removed=sorted(paths(old)-paths(new))
    assert not removed
    citations[unit]={"inherited_cited_paths_removed":removed}
assert ((BASE/"deliverable/layers/l1/app-session/l1.md").read_bytes().split(b"## Assets, localization and verification evidence",1)[1] ==
        (OUT/"app-session/l1.md").read_bytes().split(b"## Assets, localization and verification evidence",1)[1])
assert ((BASE/"deliverable/layers/l1/design-tui/l1.md").read_bytes().split(b"### Selection, local persistence and prompt admission",1)[1] ==
        (OUT/"design-tui/l1.md").read_bytes().split(b"### Selection, local persistence and prompt admission",1)[1])
for entry in json.loads((OUT/"preserved-originals.json").read_text()):
    body=Path(entry["path"]).read_bytes()
    assert len(body)==entry["bytes"] and sha(body)==entry["sha256"]
v=json.loads((OUT/"verification.json").read_text())
v.update({"final_source_roundtrip_checked":True,"quoted_excerpts_independently_reparsed_and_matched":quote_count,
          "inherited_citations":citations,"inherited_unchanged_tails_compared_as_bytes":True})
v["sections"]["desktop-web"]=[]
lines=(OUT/"desktop-web/l1.md").read_text().splitlines(keepends=True)
starts=[i for i,l in enumerate(lines) if l.startswith("## ")]
for ix,start in enumerate(starts):
    end=starts[ix+1] if ix+1<len(starts) else len(lines)
    v["sections"]["desktop-web"].append({"heading":lines[start].strip()[3:],
                                       "utf8_bytes":len("".join(lines[start:end]).encode())})
(OUT/"verification.json").write_text(json.dumps(v,indent=2)+"\n")
print(json.dumps({"source_captures":len(sources["captures"]),"verified_source_bytes":v["verified_source_bytes"],
                  "exact_excerpts":quote_count,"original_files_preserved":len(json.loads((OUT/"preserved-originals.json").read_text())),
                  "inherited_cited_paths_removed":citations,"scope_path_sha256":v["coverage_path_sha256"]},indent=2))

