"""Record source baseline without copying secrets or modifying the checkout."""
import argparse,json,sys
from pathlib import Path
from source_proof import snapshot

def main():
    p=argparse.ArgumentParser(description=__doc__);p.add_argument('--repo',type=Path,required=True);p.add_argument('--out',type=Path,required=True);a=p.parse_args()
    try:
        result=snapshot(a.repo);a.out.parent.mkdir(parents=True,exist_ok=True)
        with a.out.open('x',encoding='utf-8') as f:json.dump(result,f,ensure_ascii=False,indent=2);f.write('\n')
        print(json.dumps({'status':'BASELINE_CAPTURED_NOT_APPROVAL','head':result['head'],'preexisting_dirty_count':len(result['dirty'])}));return 0
    except Exception as e:print(json.dumps({'status':'FAIL','errors':[str(e)]}));return 1
if __name__=='__main__':sys.exit(main())
