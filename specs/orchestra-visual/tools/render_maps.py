"""Render read-only projections of PLAN/SURFACES; use --check to detect drift."""
import argparse,json,sys
from pathlib import Path
from effective_contract import load
ROOT=Path(__file__).resolve().parents[1]

def render(root=ROOT):
    p=load(root/'PLAN.json');s=load(root/'SURFACES.json');lines=[f"# MAP — projeção canônica v{p.get('contract_revision', 'desconhecido')}",'','Fonte: SURFACES.json. Não editar esta tabela; alterar o canônico e regenerar. Nenhum registro prova execução do produto.','','| ID | Owner | Disposition | Classe | Path |','|---|---|---|---|---|']
    for row in s['surfaces']:lines.append('| '+' | '.join(str(row.get(k,'')) for k in ['id','owner','disposition','inventory_class','path'])+' |')
    own=[f"# OWNERSHIP — projeção canônica v{p.get('contract_revision', 'desconhecido')}",'','Fonte única: PLAN.json. Cada task herda seu write scope explicitamente; grants de codegen são condicionais a lease serial.','','Um coordenador mantém progress.json. --jobs limita RUNNING + novas alocações. Benchmark reserva o host; nenhum processo é cancelado automaticamente.','','Use worktrees de execução isoladas; capture baseline antes de escrever. Não resetar/limpar o checkout pessoal. Integrações podem importar commits de lanes somente com recibos íntegros e atribuição de paths verificada.','','Mudança de código do produto não invalida a fotografia histórica S01. Mudança de contrato/cobertura efetiva invalida as provas pertinentes. --affected-by é triagem de impacto, não comando de reinício global.']
    for n in p['nodes']:
        if n['kind']!='subissue':continue
        own+=['',f'## {n["id"]} — {n["title"]}','Escrita:']+['- `'+x+'`' for x in n['write_paths']]
        if n.get('exclude_paths'):own+=['Exclusões:']+['- `'+x+'`' for x in n['exclude_paths']]
    own+=['','## Grants compartilhados serializados']
    for x in p['shared_write_leases']:own += ['- '+x['lock']+': '+', '.join(x['tasks'])+'; status '+x['status']]+['  - `'+v+'`' for v in x['paths']]
    return {'MAP.md':'\n'.join(lines)+'\n','OWNERSHIP.md':'\n'.join(own)+'\n'}

def main():
    p=argparse.ArgumentParser();p.add_argument('--check',action='store_true');a=p.parse_args();mismatch=[]
    for name,text in render().items():
        path=ROOT/name
        if a.check:
            if not path.exists() or path.read_text()!=text:mismatch.append(name)
        else:path.write_text(text)
    print(json.dumps({'status':'FAIL' if mismatch else 'PASS','mismatches':mismatch}));return bool(mismatch)
if __name__=='__main__':sys.exit(main())
