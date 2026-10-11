#!/bin/bash
# chain.sh <rundir> <provider/model> <unit> ; runs dispatch -> resume(memoryUnit) -> interim resume -> forced compaction -> continue
H=<host>
U=http://127.0.0.1:47811
export RUN=$1; MODEL=$2; UNIT=$3; SEAT=$4; D=$H/$RUN; mkdir -p $D
M=$(curl -s -m 60 -X POST $U/session -H 'content-type: application/json' -d "{\"title\":\"F3 live continuity $UNIT\"}" | python3 -c 'import json,sys;print(json.load(sys.stdin)["id"])'); echo $M > $D/maestro.sid
sed "s/T-LIVE-1/$UNIT/g" $H/attemptA/01-dispatch.txt > $D/01-dispatch.txt
[ -n "$SEAT" ] && sed -i '' "1s|$| Pass model \"$SEAT\" on the task call.|" $D/01-dispatch.txt
$H/say.sh 01-dispatch $M $MODEL $D/01-dispatch.txt > $D/01-dispatch.summary.txt 2>&1
curl -s $U/session/$M/message > $D/01-maestro.messages.json
TASK=$(python3 -c 'import json,re,sys
for m in json.load(open(sys.argv[1])):
  for p in m["parts"]:
    if p["type"]=="tool" and p["tool"]=="task":
      r=re.search(r"<task id=\"([^\"]+)\"", str(p["state"].get("output"))); print(r.group(1) if r else "")' $D/01-maestro.messages.json | tail -1)
C=$(curl -s $U/session/$M/children | python3 -c 'import json,sys;print(json.load(sys.stdin)[0]["id"])'); echo $C > $D/child.sid; echo "$TASK" > $D/task.id
echo "maestro=$M child=$C task=$TASK"
[ -z "$TASK" ] && { echo "no task id"; exit 1; }
curl -s $U/session/$C/message > $D/01-child.messages.json
cp $H/repo/.atlas/memory.jsonl $D/01-memory.jsonl
sed -e "s/T-LIVE-1/$UNIT/g" -e "s/tsk_1285e500c001fTpl47OI4XwfXI/$TASK/g" $H/attemptA/02-resume.txt > $D/02-resume.txt
[ -n "$SEAT" ] && sed -i '' "1s|$| Pass model \"$SEAT\" on the task call.|" $D/02-resume.txt
$H/say.sh 02-resume $M $MODEL $D/02-resume.txt > $D/02-resume.summary.txt 2>&1
curl -s $U/session/$C/message > $D/02-child.messages.json
sed -e "s/T-LIVE-1/$UNIT/g" -e "s/tsk_1285e500c001fTpl47OI4XwfXI/$TASK/g" $H/attemptA/03-interim.txt > $D/03-interim.txt
[ -n "$SEAT" ] && sed -i '' "1s|$| Pass model \"$SEAT\" on the task call.|" $D/03-interim.txt
$H/say.sh 03-interim $M $MODEL $D/03-interim.txt > $D/03-interim.summary.txt 2>&1
curl -s $U/session/$C/message > $D/03-child.messages.json
echo "{\"label\":\"04-compact\",\"session\":\"$C\",\"call\":\"POST /session/$C/summarize\",\"start\":\"$(date -u +%FT%TZ)\"}" >> $D/commands.jsonl
curl -s -m 1800 -X POST $U/session/$C/summarize -H 'content-type: application/json' -d "{\"providerID\":\"${MODEL%%/*}\",\"modelID\":\"${MODEL#*/}\"}" > $D/04-compact.response.json
echo "{\"label\":\"04-compact\",\"end\":\"$(date -u +%FT%TZ)\"}" >> $D/commands.jsonl
curl -s $U/session/$C/message > $D/04-child.messages.json
sed -e "s/UNIT/$UNIT/g" -e "s/TASK/$TASK/g" $H/05-continue.tpl > $D/05-continue.txt
[ -n "$SEAT" ] && sed -i '' "1s|$| Pass model \"$SEAT\" on the task call.|" $D/05-continue.txt
$H/say.sh 05-continue $M $MODEL $D/05-continue.txt > $D/05-continue.summary.txt 2>&1
curl -s $U/session/$C/message > $D/05-child.messages.json
curl -s $U/session/$M/message > $D/05-maestro.messages.json
cp $H/repo/.atlas/memory.jsonl $D/05-memory.jsonl; (cd $H/repo && git diff > $D/repo.diff)
echo done
