#!/usr/bin/env python3
"""One-time publication/reconciliation of PA repairs; no product task is executed."""
from __future__ import annotations
import argparse
import hashlib
import json
import os
from pathlib import Path
import subprocess
import sys
import time
import urllib.request

REPO = 'gmhelmold/HuGR-Orchestra'
BRANCH = 'visual-migration-plan'
BASE = 'a45f6e60a27d6ad1e148d7394e61e11556c4fd23'
ROOT = Path(__file__).resolve().parents[3]
# file: ROOT/reviews/parallelism-performance/repairs/publish.py
CODE = ROOT.parents[1]
sys.path.insert(0, str(ROOT/'tools'))
from effective_contract import load
from github_sync import desired_relations


def sha(text): return hashlib.sha256(text.encode() if isinstance(text,str) else text).hexdigest()
def write(path, value): path.write_text(json.dumps(value,ensure_ascii=False,indent=2)+'\n')
def git(*args): return subprocess.check_output(['git','-C',str(CODE),*args],text=True).strip()


def request(method, path, payload=None):
    if not path.startswith('/issues/') or method not in ('GET','PATCH','POST','DELETE'):
        raise ValueError('publication only touches existing issue bodies and scoped relationships')
    req=urllib.request.Request('https://api.github.com/repos/'+REPO+path,
        data=json.dumps(payload).encode() if payload is not None else None,method=method,
        headers={'Authorization':'Bearer '+os.environ['GH_TOKEN'],'Accept':'application/vnd.github+json',
                 'X-GitHub-Api-Version':'2026-03-10','Content-Type':'application/json'})
    with urllib.request.urlopen(req,timeout=60) as res:
        data=res.read()
    if method!='GET':time.sleep(1.05)
    return json.loads(data) if data else None


def listing(path):
    out=[]
    for page in range(1,100):
        part=request('GET',path+f'?per_page=100&page={page}')
        if not isinstance(part,list):raise ValueError('relationship listing not an array')
        out+=part
        if len(part)<100:return out
    raise ValueError('relationship listing incomplete')


def prepare():
    # Preserve GitHub entrypoints/navigation already published, not the stale ZIP copies.
    for name in ('EXECUTE.md','START-HERE.md','README.md'):
        p=ROOT/name;s=p.read_text();s=s.replace('v4.1','v4.2')
        s=s.replace('15 pré-requisitos de task','11 pré-requisitos de task')
        if name=='EXECUTE.md':
            old='Um coordenador escreve `progress.json`. `--jobs 4` limita RUNNING + novas seleções; excesso já em execução não é cancelado automaticamente. Cada frente usa worktree/branch própria. Benchmark reserva hardware e não disputa recursos com builds ou capturas pesadas. O seletor é read-only e não é um serviço de locks concorrentes.'
            new='Um coordenador escreve `progress.json`. `--jobs 4` limita RUNNING + novas seleções. O seletor prioriza os pré-requisitos do próximo marco do piloto, sem ignorar dependências. Cada frente usa worktree/branch própria. Somente `phase=collect` reserva o host durante amostragem; `work` e `review` não retêm a reserva inteira. Antes da coleta, `select_work.py --collect ID` precisa retornar READY_TO_RESERVE; WAIT (exit 2) não autoriza medir. O coordenador registra collect e confere processos/energia reais; ao terminar registra review. Reviews concorrentes não podem usar ferramentas locais durante coleta. O seletor é read-only, não um serviço de locks de SO.'
            s=s.replace(old,new)
        if '<!-- orchestra-pa-42:begin -->' not in s:
            s+='''\n<!-- orchestra-pa-42:begin -->
## Execução proporcional e paralela — 4.2

As correções de PA-01–PA-06 estão em [reviews/parallelism-performance/repairs/REVIEW.md](reviews/parallelism-performance/repairs/REVIEW.md). O grafo preserva os mesmos 38 WPs/66 tasks. Use `verification_tier` e `dependency_inputs` da unidade: implementar consome a entrega T1 local; a auditoria cruzada completa fica no aceite. S22-T1 fornece copy/parity cedo; o piloto S25-W0 tem prioridade e 11 pré-requisitos.

P01 usa dois manifests reais, não cinco repetições de valores estáticos. S23-T2 coleta a campanha completa; S25-T2 valida/reutiliza artefatos do mesmo candidato sem repetir o soak. P03 exige teto absoluto e proteção contra regressão. Tendência de memória é assinada, com ruído inconclusivo não aprovado. Os consumidores de tema e governança estão explicitamente na matriz de capturas.

Para coletar: task já RUNNING → `python3 tools/select_work.py --collect ID` → se READY_TO_RESERVE, registrar phase=collect e conferir processos reais → medir → registrar phase=review e liberar o host. Nenhum processo é iniciado, pausado ou morto automaticamente. Não medir durante compilação/captura concorrente. Provas e axiomas continuam obrigatórios; a reforma visual ainda não está implementada.
<!-- orchestra-pa-42:end -->
'''
        p.write_text(s)
    meta=load(ROOT/'GITHUB.json');meta['contract_revision']='4.2'
    meta['publication']='PA-01–PA-06 repaired in existing contracts; reconcile/readback is recorded in PUBLICATION.json.'
    write(ROOT/'GITHUB.json',meta)
    pub=load(ROOT/'PUBLICATION.json');pub['contract_revision']='4.2';pub['ticket_bodies_status']='RECONCILING_4.2';pub['native_relationships']='RECONCILING_4.2'
    pub['repair_review']='reviews/parallelism-performance/repairs/REVIEW.md';pub['product_execution']='NOT_RUN'
    write(ROOT/'PUBLICATION.json',pub)
    # The frozen design, brand kit and implementation progress must remain exact.
    for rel in ('reference/approved.png','SPEC.md','progress.json'):
        before=subprocess.check_output(['git','-C',str(CODE),'show',BASE+':specs/orchestra-visual/'+rel])
        assert (ROOT/rel).read_bytes()==before,'immutable product input changed '+rel


def synchronize():
    plan=load(ROOT/'PLAN.json');meta=load(ROOT/'GITHUB.json');by={n['id']:n for n in plan['nodes']}
    desired=desired_relations(plan,meta);head=git('rev-parse','HEAD')
    previous=load(ROOT/'publication/NATIVE-AND-TICKETS.json')
    old={(x['issue'],x['blocked_by']) for x in previous['dependencies']}
    wanted={(x['issue'],x['blocked_by']) for x in desired['dependencies']}
    rows={};updates={}
    for ident,entry in meta['issues'].items():
        num=entry['number'];row=request('GET','/issues/'+str(num));rows[num]=row
        marker='<!-- orchestra-visual:'+ident+' -->'
        body=row.get('body') or '';position=body.find(marker)
        if position<0:raise ValueError('ticket lacks expected canonical marker '+str(num))
        original=subprocess.check_output(['git','-C',str(CODE),'show',BASE+':specs/orchestra-visual/issues/'+ident+'.md'],text=True)
        new=(ROOT/'issues'/(ident+'.md')).read_text()
        if body[position:].strip() not in (original.strip(),new.strip()):raise ValueError('canonical ticket edited concurrently '+str(num))
        prefix=body[:position].replace('v4.1','v4.2').replace('216963161e019ed44c093da0ea151d876c6bc9c5',head)
        prefix=prefix.replace('Não considerar o checkout autossuficiente enquanto houver insumos obrigatórios ausentes.','Todos os insumos estão no checkout; consulte a verificação atual. Nenhum insumo depende do chat.')
        updates[num]=(prefix+new,sha(body))
    # Resolve all endpoint IDs by current read; don't use issue numbers as database IDs.
    for number in sorted({x for edge in old|wanted for x in edge}-set(rows)):
        rows[number]=request('GET','/issues/'+str(number))
    actual={}
    for num in sorted({x[0] for x in old|wanted}):
        actual[num]={r['number']:r['id'] for r in listing('/issues/'+str(num)+'/dependencies/blocked_by')}
    changed=[]
    for a,b in sorted(old-wanted):
        if b in actual[a]:
            request('DELETE',f'/issues/{a}/dependencies/blocked_by/{actual[a][b]}');changed.append({'remove':[a,b]})
    for a,b in sorted(wanted):
        if b not in actual.get(a,{}):
            request('POST',f'/issues/{a}/dependencies/blocked_by',{'issue_id':rows[b]['id']});changed.append({'add':[a,b]})
    readbacks=[]
    for ident,entry in meta['issues'].items():
        num=entry['number'];new,old_hash=updates[num];again=request('GET','/issues/'+str(num))
        if sha(again.get('body') or '')!=old_hash:raise ValueError('ticket changed during publication '+str(num))
        if again['body']!=new:request('PATCH','/issues/'+str(num),{'body':new})
        reread=request('GET','/issues/'+str(num))
        if reread.get('body')!=new or reread['state']!=again['state']:raise ValueError('ticket readback mismatch '+str(num))
        readbacks.append({'node':ident,'issue':num,'sha256':sha(new),'canonical_sha256':sha((ROOT/'issues'/(ident+'.md')).read_bytes()),'readback':'PASS'})
    # Parent links are unchanged; inspect, never reparent.
    parents=desired['parents']+[{'parent':215,'child':n} for n in (130,131,132,133)]
    for parent in sorted({r['parent'] for r in parents}):
        children={r['number'] for r in listing(f'/issues/{parent}/sub_issues')}
        expected={r['child'] for r in parents if r['parent']==parent}
        if not expected<=children:raise ValueError('native parent link missing '+str(parent))
    final_edges=set()
    for a in sorted({x[0] for x in old|wanted}):
        for item in listing(f'/issues/{a}/dependencies/blocked_by'):final_edges.add((a,item['number']))
    if not wanted<=final_edges or (old-wanted)&final_edges:raise ValueError('native dependency readback mismatch')
    report={'schema_version':1,'status':'VERIFIED','kind':'planning-repair-publication-not-product','code_commit':head,
        'run_url':os.environ['RUN_URL'],'contract_revision':'4.2','ticket_bodies':readbacks,
        'native_parent_links':len(parents),'native_dependency_links':len(wanted),'fine_constraints':len(desired['fine_grained_only']),
        'changed_dependencies':changed,'unrelated_links_preserved':[list(x) for x in sorted(final_edges-wanted)],'product_execution':'NOT_RUN'}
    write(ROOT/'reviews/parallelism-performance/repairs/PUBLICATION.json',report)
    pub=load(ROOT/'PUBLICATION.json');pub.update(contract_revision='4.2',plan_sha256=sha((ROOT/'PLAN.json').read_bytes()),
        criteria=sum(len(v) for n in plan['nodes'] for v in n['axioms'].values()),ticket_bodies_status='VERIFIED',
        native_relationships='VERIFIED',verification_run=os.environ['RUN_URL'],native_dependency_links=len(wanted),fine_grained_constraints=len(desired['fine_grained_only']),
        ticket_body_sha256={str(x['issue']):x['sha256'] for x in readbacks},plan_and_projection_commit=head,
        repair_report='reviews/parallelism-performance/repairs/PUBLICATION.json',product_execution='NOT_RUN')
    write(ROOT/'PUBLICATION.json',pub)
    write(ROOT/'publication/NATIVE-AND-TICKETS.json',{'schema_version':1,'status':'VERIFIED','run_url':os.environ['RUN_URL'],
        'root_epic':215,'root_relationships':[{'parent':215,'child':n} for n in (130,131,132,133)],
        'program_parent_relationships':desired['parents'],'dependencies':desired['dependencies'],'fine_grained_only':desired['fine_grained_only'],
        'tickets':readbacks,'revision':'4.2'})
    root=request('GET','/issues/215');text=root['body'];marker='<!-- orchestra-pa-repairs:42 -->'
    if marker not in text:
        prefix=marker+'\n## Correções adversariais aplicadas — contrato 4.2\n\n'
        prefix+='PA-01–PA-06 corrigidos no planejamento e tooling, preservando a hierarquia, o mock e o kit. '
        prefix+='Reserva apenas durante coleta; verificação proporcional; entradas T1 e piloto priorizado; axiomas por estágio; slope assinado; proteção contra regressão; consumidores visuais explícitos.\n\n'
        prefix+=f'[Revisão e limites](https://github.com/{REPO}/blob/{BRANCH}/specs/orchestra-visual/reviews/parallelism-performance/repairs/REVIEW.md) · [Verificação](https://github.com/{REPO}/actions/runs/{os.environ["GITHUB_RUN_ID"]})\n\n'
        prefix+='Os 39 corpos subordinados e relações foram reconciliados; não foram criados tickets nem aprovadas tasks de produto. O primeiro trabalho continua S01-W1-T1. `START-HERE.md` e `INDEX.md` continuam sendo a entrada.\n\n'
        text=prefix+text
    text=text.replace('contrato v4.1','contrato v4.2').replace('**57 dependências nativas de fechamento**',f'**{len(wanted)} dependências nativas de fechamento**').replace('**74 restrições finas/advisory**',f'**{len(desired["fine_grained_only"])} restrições finas/advisory**')
    request('PATCH','/issues/215',{'body':text})
    assert request('GET','/issues/215')['body']==text
    print(json.dumps({'status':'VERIFIED','tickets':len(readbacks),'parent_links':len(parents),'dependency_links':len(wanted),'changes':len(changed)}))


def manifest_files():
    entries=[]
    for p in sorted(ROOT.rglob('*')):
        if p.is_file() and p!=ROOT/'MANIFEST.sha256' and '__pycache__' not in p.parts and p.suffix!='.pyc':
            entries.append(sha(p.read_bytes())+'  '+p.relative_to(ROOT).as_posix())
    (ROOT/'MANIFEST.sha256').write_text('\n'.join(entries)+'\n')


if __name__=='__main__':
    ap=argparse.ArgumentParser();ap.add_argument('mode',choices=['prepare','sync','manifest']);a=ap.parse_args()
    {'prepare':prepare,'sync':synchronize,'manifest':manifest_files}[a.mode]()
