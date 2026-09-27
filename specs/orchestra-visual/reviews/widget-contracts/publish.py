#!/usr/bin/env python3
"""Scoped publication of approved widget contracts; never executes product tasks."""
import argparse, hashlib, json, os, re, subprocess, sys, time, urllib.request
from pathlib import Path
ROOT=Path(__file__).resolve().parents[2]
CODE=ROOT.parents[1]
BASE='6bb07c6b33c6e16125836db45b0c56af915a475b'
REPO='gmhelmold/HuGR-Orchestra'; BRANCH='visual-migration-plan'
sys.path.insert(0,str(ROOT/'tools'))
from github_sync import desired_relations

def load(path):return json.loads(path.read_text())
def write(path,value):path.write_text(json.dumps(value,ensure_ascii=False,indent=2)+'\n')
def sha(x):return hashlib.sha256(x.encode() if isinstance(x,str) else x).hexdigest()
def git(*args):return subprocess.check_output(['git','-C',str(CODE),*args],text=True).strip()
def api(method,path,payload=None):
    if not path.startswith('/issues/') or method not in ('GET','PATCH'):raise ValueError('Only scoped existing issue reads/body updates allowed')
    request=urllib.request.Request('https://api.github.com/repos/'+REPO+path,method=method,
      data=json.dumps(payload).encode() if payload is not None else None,
      headers={'Authorization':'Bearer '+os.environ['GH_TOKEN'],'Accept':'application/vnd.github+json','X-GitHub-Api-Version':'2026-03-10','Content-Type':'application/json'})
    with urllib.request.urlopen(request,timeout=60) as response:raw=response.read()
    if method!='GET':time.sleep(1.1)
    return json.loads(raw) if raw else None

def listing(path):
    result=[]
    for page in range(1,100):
        batch=api('GET',path+f'?per_page=100&page={page}')
        if not isinstance(batch,list):raise ValueError('Relationship response not an array')
        result+=batch
        if len(batch)<100:return result
    raise ValueError('Incomplete relationship listing')

def prepare():
    marker='<!-- orchestra-widgets43:begin -->'
    block='''
<!-- orchestra-widgets43:begin -->
## Widgets fechados — contrato 4.3

**Antes de implementar um widget, abra [WIDGETS.md](WIDGETS.md).** W01 checklist/todowrite; W02 diff; W03 testes/output; W04 Browser/Files/Docs/Terminal; W05 Tasks; W06 Atividade; W07 ações; W08 atalhos das features; W09 microacabamento e custo integrado. Os IDs Wxx e casos WKxx aparecem diretamente no corpo da sua issue/WP/task.

As seções indicam fontes e campos reais, paths de implementação, callbacks e efeitos exatos, estados, limites e testes. Docs é documentação local; Criar PR… prepara draft revisável sem publicar; repetir testes exige comando/contexto compatível e confirmação. Inputs de todowrite não são prova e metadata.output não é log completo. Nenhuma omissão de binding é aprovada como capability ausente.

DAG, 38 WPs/66 tasks, piloto antecipado, fronteiras de escrita e budgets 4.2 preservados. A fixture é sintética e foi alinhada aos campos reais; produto ainda NOT_RUN. A avaliação da publicação está em [reviews/widget-contracts/PUBLICATION.json](reviews/widget-contracts/PUBLICATION.json), e os limites da revisão em [reviews/widget-contracts/REVIEW.md](reviews/widget-contracts/REVIEW.md).
<!-- orchestra-widgets43:end -->
'''
    for name in ('START-HERE.md','EXECUTE.md','README.md'):
        path=ROOT/name;text=path.read_text()
        if name=='EXECUTE.md':text=re.sub(r'^(# EXECUTE[^\n]*?)v4\.2',r'\1v4.3',text,count=1)
        if marker not in text:
            first,rest=text.split('\n',1);text=first+'\n'+block+'\n'+rest
        path.write_text(text)
    meta=load(ROOT/'GITHUB.json');meta.update(contract_revision='4.3',publication='Widget contracts closed in WIDGETS.md; current complete readback recorded in PUBLICATION.json.')
    write(ROOT/'GITHUB.json',meta)
    pub=load(ROOT/'PUBLICATION.json');pub.update(contract_revision='4.3',ticket_bodies_status='RECONCILING_4.3',widget_contract='WIDGETS.md',widget_review='reviews/widget-contracts/REVIEW.md',product_execution='NOT_RUN')
    write(ROOT/'PUBLICATION.json',pub)
    for name in ('progress.json','BUDGETS.json','reference/approved.png'):
        actual=(ROOT/name).read_bytes()
        original=subprocess.check_output(['git','-C',str(CODE),'show',BASE+':specs/orchestra-visual/'+name])
        assert actual==original,'Protected input changed '+name

def synchronize():
    plan=load(ROOT/'PLAN.json');meta=load(ROOT/'GITHUB.json');head=git('rev-parse','HEAD')
    desired=desired_relations(plan,meta);previous=load(ROOT/'publication/NATIVE-AND-TICKETS.json')
    wanted={(x['issue'],x['blocked_by']) for x in desired['dependencies']}
    old={(x['issue'],x['blocked_by']) for x in previous['dependencies']}
    assert wanted==old,'Widget publication must not change scheduling dependencies'
    rows={};updates={}
    for ident,entry in meta['issues'].items():
        num=entry['number'];row=api('GET',f'/issues/{num}');rows[num]=row
        body=row.get('body') or '';marker='<!-- orchestra-visual:'+ident+' -->';position=body.find(marker)
        assert position>=0,'Expected canonical marker missing '+str(num)
        original=subprocess.check_output(['git','-C',str(CODE),'show',BASE+':specs/orchestra-visual/issues/'+ident+'.md'],text=True)
        new=(ROOT/'issues'/(ident+'.md')).read_text()
        assert body[position:].strip() in (original.strip(),new.strip()),'Concurrent canonical issue edit '+str(num)
        prefix=body[:position].replace('v4.2','v4.3')
        prefix=re.sub(r'(https://github\.com/gmhelmold/HuGR-Orchestra/blob/)[0-9a-f]{40}(/specs/orchestra-visual/(?:issues/[^)]+|PLAN\.json))',lambda m:m[1]+head+m[2],prefix)
        newbody=prefix+new
        assert len(newbody.encode())<65500,'Issue body too large '+str(num)
        updates[num]=(newbody,sha(body))
    # Verify hierarchy/dependency identities. No relation is written or removed in this revision.
    parents=desired['parents']+[{'parent':215,'child':n} for n in (130,131,132,133)]
    for parent in sorted({r['parent'] for r in parents}):
        children={x['number'] for x in listing(f'/issues/{parent}/sub_issues')}
        assert {r['child'] for r in parents if r['parent']==parent}<=children,'Missing native parent '+str(parent)
    actual=set()
    for issue in sorted({x[0] for x in wanted}):
        actual|={(issue,x['number']) for x in listing(f'/issues/{issue}/dependencies/blocked_by')}
    assert wanted<=actual,'Missing native dependency'
    readbacks=[]
    for ident,entry in meta['issues'].items():
        num=entry['number'];new,oldhash=updates[num];current=api('GET',f'/issues/{num}')
        assert sha(current.get('body') or '')==oldhash,'Issue changed during publication '+str(num)
        if current['body']!=new:api('PATCH',f'/issues/{num}',{'body':new})
        check=api('GET',f'/issues/{num}')
        assert check['body']==new and check['state']==current['state'],'Readback/state mismatch '+str(num)
        readbacks.append({'node':ident,'issue':num,'body_sha256':sha(new),'canonical_sha256':sha((ROOT/'issues'/(ident+'.md')).read_bytes()),'readback':'PASS'})
    report={'schema_version':1,'status':'VERIFIED','kind':'widget-contract-publication-not-product','contract_revision':'4.3','code_commit':head,'run_url':os.environ['RUN_URL'],'ticket_bodies':readbacks,'native_parent_links':len(parents),'native_dependency_links':len(wanted),'fine_constraints':len(desired['fine_grained_only']),'dependencies_changed':False,'unrelated_relationships_preserved':[list(x) for x in sorted(actual-wanted)],'widget_sections':9,'product_cases':28,'product_execution':'NOT_RUN'}
    write(ROOT/'reviews/widget-contracts/PUBLICATION.json',report)
    pub=load(ROOT/'PUBLICATION.json');pub.update(contract_revision='4.3',plan_sha256=sha((ROOT/'PLAN.json').read_bytes()),nodes=len(plan['nodes']),criteria=sum(len(v) for n in plan['nodes'] for v in n['axioms'].values()),surfaces=len(load(ROOT/'SURFACES.json')['surfaces']),ticket_bodies_status='VERIFIED',native_relationships='VERIFIED',verification_run=os.environ['RUN_URL'],widget_publication='reviews/widget-contracts/PUBLICATION.json',ticket_body_sha256={str(x['issue']):x['body_sha256'] for x in readbacks},plan_and_projection_commit=head,product_execution='NOT_RUN')
    write(ROOT/'PUBLICATION.json',pub)
    previous.update(run_url=os.environ['RUN_URL'],revision='4.3',tickets=readbacks)
    write(ROOT/'publication/NATIVE-AND-TICKETS.json',previous)
    meta.update(entry_commit=head,entry_url=f'https://github.com/{REPO}/blob/{BRANCH}/specs/orchestra-visual/START-HERE.md',native_relationships_note='Read back without changes by '+os.environ['RUN_URL'],widget_contract='WIDGETS.md')
    write(ROOT/'GITHUB.json',meta)
    root=api('GET','/issues/215');text=root['body'];marker='<!-- orchestra-widgets:43 -->'
    if marker not in text:
        text=marker+'\n## Widgets especificados e vinculados — contrato 4.3\n\n'+f'Leia [WIDGETS.md](https://github.com/{REPO}/blob/{BRANCH}/specs/orchestra-visual/WIDGETS.md) para fontes, campos, handlers, comportamento, states, limites e28casos reais a executar. Os39tickets subordinados foram reconciliados com os mesmos cinco axiomas; sem novos épicos, WPs ou tasks.\n\n'+'Checklist usa todowrite confirmado; Docs é local; Tasks/Atividade compartilham fontes; testes têm parser Bun limitado e output-only honesto; Criar PR… prepara draft revisável, não publica ao clicar. Nenhuma implementação ausente pode se disfarçar de capability indisponível.\n\n'+f'[Revisão e limites](https://github.com/{REPO}/blob/{BRANCH}/specs/orchestra-visual/reviews/widget-contracts/REVIEW.md) · [Verificação da publicação](https://github.com/{REPO}/blob/{BRANCH}/specs/orchestra-visual/reviews/widget-contracts/PUBLICATION.json)\n\n'+'Primeira task continua S01-W1-T1. DAG, piloto antecipado, budgets e assets aprovados preservados. A implementação do produto continua pendente.\n\n'+text
    text=text.replace('contrato v4.2','contrato v4.3')
    fresh=api('GET','/issues/215');assert fresh['body']==root['body'],'Root edited concurrently'
    api('PATCH','/issues/215',{'body':text});assert api('GET','/issues/215')['body']==text
    print(json.dumps({'status':'VERIFIED','tickets':len(readbacks),'parents':len(parents),'dependencies':len(wanted),'root':215,'product_execution':'NOT_RUN'}))

def manifest_files():
    rows=[]
    for path in sorted(ROOT.rglob('*')):
        if path.is_file() and path!=ROOT/'MANIFEST.sha256' and '__pycache__' not in path.parts and path.suffix!='.pyc':rows.append(sha(path.read_bytes())+'  '+path.relative_to(ROOT).as_posix())
    (ROOT/'MANIFEST.sha256').write_text('\n'.join(rows)+'\n')

if __name__=='__main__':
    parser=argparse.ArgumentParser();parser.add_argument('mode',choices=['prepare','sync','manifest']);args=parser.parse_args()
    {'prepare':prepare,'sync':synchronize,'manifest':manifest_files}[args.mode]()
