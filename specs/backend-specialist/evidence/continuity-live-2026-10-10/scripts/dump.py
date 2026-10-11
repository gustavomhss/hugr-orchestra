import json,sys
for m in json.load(open(sys.argv[1])):
  i=m["info"]; print("MSG",i["role"],i["id"],i.get("agent"), "summary" if i.get("summary") else "")
  for p in m["parts"]:
    md=p.get("metadata") or {}
    if p["type"]=="tool": print("  tool",p["tool"],p["state"]["status"], (p["state"].get("metadata") or {}).get("atlasMemory",{}).get("outcome"))
    elif p["type"]=="text": print("  text syn=%s adm=%s"%(p.get("synthetic"), json.dumps(md.get("atlasResume",{}).get("residency")) if md.get("atlasResume") else None), p["text"][:200].replace("\n"," "))
    else: print("  ",p["type"])
