from pathlib import Path
import sys,json
base=Path('/workspace/scratch/aff930d22ec7/s4')
out=base/'producers/l1-boundary/inspection-register.json'
log=json.loads(out.read_text())
for path,ranges in json.loads(sys.argv[1]).items():
    source=base/'boundary-source'/path
    area='external-boundary'
    if not source.exists():source=base/'source'/path;area='assigned-domain'
    lines=source.read_text().splitlines()
    if not ranges:ranges=[[1,len(lines)]]
    print('\nFILE',path)
    for start,end in ranges:
        assert 1<=start<=end<=len(lines),(path,start,end,len(lines))
        for n in range(start,end+1):print(f'{n:4} {lines[n-1]}')
    log.append({'path':path,'area':area,'ranges':ranges,'method':'static source read; no execution'})
out.write_text(json.dumps(log,indent=2)+'\n')
