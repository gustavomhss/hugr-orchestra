import json,sys,os
D=sys.argv[1]
ids=[json.loads(l)["id"] for l in open(os.path.join(D,"05-memory.jsonl" if os.path.exists(os.path.join(D,"05-memory.jsonl")) else "memory.jsonl")) if l.strip()]
final=json.load(open(sorted(f for f in [os.path.join(D,x) for x in os.listdir(D)] if f.endswith("-child.messages.json"))[-1]))
print("child messages:",len(final))
adm={}
for m in final:
  i=m["info"]
  for p in m["parts"]:
    md=p.get("metadata") or {}
    if p["type"]=="tool":
      st=p["state"]; r=(st.get("metadata") or {}).get("atlasMemory")
      if p["tool"].startswith("atlas_memory"):
        print("TOOL",i["id"],p["tool"],st["status"],"outcome=",r and r.get("outcome"),"ref=",r and (r.get("ref") or {}).get("eventId"),"reconciled=",r and r.get("reconciled"),"refusal=",r and (r.get("refusal") or {}).get("refusal"), "inLog=", r and (r.get("ref") or {}).get("eventId") in ids, "taskId=",(st.get("input") or {}).get("entry",{}).get("taskId") if isinstance((st.get("input") or {}).get("entry"),dict) else None)
    if md.get("atlasResume"):
      a=md["atlasResume"]; k=json.dumps(a["key"],sort_keys=True); adm.setdefault(k,[]).append((a["residency"],i["id"]))
      print("ADMISSION msg",i["id"],"residency",a["residency"],"key",a["key"]["logicalResumeID"],a["key"]["kind"],a["key"]["id"],"verdict",a["verdict"], "text==part", a["text"]==p["text"])
for k,v in adm.items(): print("per-key:",json.loads(k)["logicalResumeID"],v)
print("restored present:", any(r=="restored" for v in adm.values() for r,_ in v))
