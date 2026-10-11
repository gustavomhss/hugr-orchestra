#!/bin/bash
# say.sh <label> <sessionID> <modelID> <textfile> [agent]
H=<host>
U=http://127.0.0.1:47811
body=$(python3 -c 'import json,sys; d={"model":{"providerID":sys.argv[1].split("/")[0],"modelID":sys.argv[1].split("/",1)[1]},"parts":[{"type":"text","text":open(sys.argv[2]).read()}]}
if len(sys.argv)>3: d["agent"]=sys.argv[3]
print(json.dumps(d))' "$3" "$4" ${5:-})
echo "{\"label\":\"$1\",\"session\":\"$2\",\"model\":\"$3\",\"agent\":\"${5:-default}\",\"start\":\"$(date -u +%FT%TZ)\"}" >> $H/$RUN/commands.jsonl
curl -s -m 3000 -X POST $U/session/$2/message -H 'content-type: application/json' -d "$body" > $H/$RUN/$1.response.json
echo "{\"label\":\"$1\",\"end\":\"$(date -u +%FT%TZ)\"}" >> $H/$RUN/commands.jsonl
python3 - "$H/$RUN/$1.response.json" <<'PY'
import json,sys
d=json.load(open(sys.argv[1])); i=d.get("info",d)
print("agent",i.get("agent"),"model",i.get("modelID"),"error",str(i.get("error"))[:400])
for p in d.get("parts",[]):
  if p["type"]=="text": print("TEXT:",p["text"][:1500])
  if p["type"]=="tool": print("TOOL:",p["tool"],p["state"]["status"],json.dumps(p["state"].get("input"))[:300])
PY
