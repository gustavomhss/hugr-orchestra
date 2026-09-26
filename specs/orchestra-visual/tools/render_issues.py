#!/usr/bin/env python3
"""Render readable issue projections. PLAN.json remains the source of truth."""
import argparse
import json
import sys
from validate_plan import ROOT, validate


def render(plan):
    errors=validate(plan)
    if errors:raise ValueError('; '.join(errors))
    by={n['id']:n for n in plan['nodes']};result={}
    for node in plan['nodes']:
        if node['kind'] not in ('epic','issue','subissue'):continue
        selected=[node]
        def add(ident):
            for child in by[ident]['children']:
                if by[child]['kind'] in ('wp','task'):
                    selected.append(by[child]);add(child)
        add(node['id'])
        lines=[f"<!-- orchestra-visual:{node['id']} -->",f"# {node['id']} — {node['title']}",
               f"Contrato canônico v{plan.get('contract_revision', 'desconhecido')}; gerado de PLAN.json. Não editar esta projeção isoladamente."]
        for n in selected:
            lines += [f"\n## {n['id']} — {n['title']}",f"Pai: {n.get('parent') or 'programa'}. Dependências: {', '.join(n.get('depends_on',[])) or 'nenhuma'}."]
            if n.get('children'): lines += ['Filhos: '+', '.join(n['children'])+'.']
            for key in ('write_paths','exclude_paths','read_paths','resource_locks','steps','cases'):
                if n.get(key):lines += ['\n### '+key+'\n'+'\n'.join('- '+s for s in n[key])]
            if n.get('external_requires'):lines += ['\nPré-requisitos externos: `'+json.dumps(n['external_requires'],ensure_ascii=False)+'`']
            if n.get('evidence_requirements'):lines += ['\nCategorias de prova: `'+json.dumps(n['evidence_requirements'],ensure_ascii=False)+'`']
            for key,values in n['axioms'].items():
                lines += ['\n### '+key+'\n'+'\n'.join('- **'+cid+'** — '+text for cid,text in zip(n['criterion_ids'][key],values))]
        result[node['id']]='\n'.join(lines)+'\n'
    return result


def main():
    parser=argparse.ArgumentParser(description=__doc__);parser.add_argument('--check',action='store_true');args=parser.parse_args()
    try:
        values=render(json.loads((ROOT/'PLAN.json').read_text()));bad=[]
        for ident,text in values.items():
            path=ROOT/'issues'/(ident+'.md')
            if args.check:
                if not path.is_file() or path.read_text()!=text:bad.append(ident)
            else:
                path.parent.mkdir(parents=True,exist_ok=True);path.write_text(text,encoding='utf-8')
        print(json.dumps({'kind':'issue-projection-check','status':'FAIL' if bad else 'PASS','mismatches':bad,'count':len(values)}))
        return int(bool(bad))
    except (OSError,ValueError,KeyError) as exc:
        print(json.dumps({'status':'FAIL','error':str(exc)}));return 1

if __name__=='__main__':sys.exit(main())
