"""Literal small-branch projections for tool-free judges; full archive stays intact."""
import hashlib,json
from pathlib import Path
OUT=Path('/workspace/scratch/ef5eb2eb4a70/s1-03-34269cf4-d631-41c5-a30b-85b0ec217390/producers/boundaries')
caps={x['path']:x for x in json.loads((OUT/'captures.json').read_text())}
index=json.loads((OUT/'records/evidence-index.json').read_text())
by_id={x['id']:x['path'] for x in index}
sha=lambda b:hashlib.sha256(b).hexdigest()
selection={
'bodies/boundaries.md':[
 ('B01',38,48),('B01',109,125),('B01',132,148),
 ('B02',259,280),('B02',301,312),
 ('B03',87,111),('B03',113,148),
 ('B04',7,20),('B05',1,11),('B05',72,81),
 ('B06',7,11),('B06',84,98),
 ('B08',219,239),('B08',247,264),('B08',267,283),
 ('B09',335,372),('B10',374,389),('B10',420,433),('B10',491,501),
 ('B11',219,239),('B11',300,302),('B11',314,335),('B11',454,474),
 ('B12',254,273),('B12',283,295),
 ('B13',34,47),('B13',50,64),
 ('B14',39,54),('B14',101,120),
 ('B15',50,61),('B15',129,147),('B16',223,256),
 ('B17',38,48),('B17',69,90),
 ('B18',51,68),('B18',82,96),
 ('B19',67,91),
 ('B20',50,70),('B20',106,125),('B20',133,149),('B20',170,193),
],
'bodies/support.md':[
 ('S01',1,27),('S01',48,62),('S02',1,22),('S03',1,2),('S04',4,11),
 ('S05',37,58),('S05',71,88),
 ('S06',1,15),('S06',345,360),('S07',1,17),
 ('S08',1,22),('S08',28,43),
 ('S09',49,56),('S10',1,21),('S11',39,56),('S12',52,76),
 ('S13',919,925),('S14',56,74),
 ('S15',1,7),('S15',13,27),
 ('S16',55,67),('S17',27,38),('S17',132,147),('S17',333,351),
 ('S18',37,52),('S18',72,85),('S19',34,41),
 ('S20',13,26),('S21',13,23),('S22',27,32),
 ('S23',1,9),('S24',9,23),('S25',41,60),('S26',5,17),('S27',29,40),('S28',9,18),
],
'union-navigation-proposal.md':[
 ('K01',11,51),('K02',1,9),('K02',55,98),('K02',160,202),('K08',69,129),
],
}
out=['# Evidência para revisão sem ferramentas\n\n'
 'Projeção literal de branches/condições/erros decisivos, delimitada por corpo. '
 'Não substitui `evidence.md` integral nem `sources/`; fixtures extensas são representadas por contratos concretos e `coverage.jsonl` mantém a disposição dos 128 paths. '
 'Os juízes podem responder REQUEST_EVIDENCE nomeando path/linhas/claim faltante. '
 'Não há teste executado ou aceite pré-atribuído.\n\n'
 'Índice pai: `records/evidence-index.json`. Cada entrada R abaixo é um subintervalo literal contido em um intervalo do índice pai. '
 'O subintervalo tem SHA256 próprio em `records/evidence-review-index.json`; o SHA256 integral e Git blob identificam a fonte. '
 'Os fences não acrescentam números de linha aos bytes citados.\n']
review=[];count=0;section_bytes={}
for body,entries in selection.items():
    startlen=len(''.join(out).encode())
    out.append(f'\n# Necessidade de revisão: `{body}`\n\nCorpo deve ser lido integralmente; os trechos abaixo sustentam ramos decisivos e limites.\n')
    for eid,first,last in entries:
        p=by_id[eid];c=caps[p]
        parent=next((x for x in index if x['id']==eid and x['first_line']<=first and last<=x['last_line']),None)
        assert parent,(eid,first,last)
        b=(OUT/c['capture_path']).read_bytes();lines=b.splitlines(keepends=True);ex=b''.join(lines[first-1:last])
        count+=1;rid=f'R{count:03d}'
        out.append(f'\n## {rid} ← {eid} — `{p}` {first}–{last}\n\n'
         f'Commit `{c["commit"]}`; blob `{c["git_blob_sha"]}`; SHA256 fonte `{c["sha256"]}`. '
         f'Pai {eid} {parent["first_line"]}–{parent["last_line"]}; SHA256 trecho `{sha(ex)}`.\n\n'
         '`````text\n'+ex.decode()+('' if ex.endswith(b'\n') else '\n')+'`````\n')
        review.append({'id':rid,'body':body,'parent_evidence_id':eid,'path':p,'commit':c['commit'],'git_blob_sha':c['git_blob_sha'],'source_sha256':c['sha256'],'first_line':first,'last_line':last,'sha256':sha(ex),'byte_length':len(ex),'parent_first_line':parent['first_line'],'parent_last_line':parent['last_line'],'parent_excerpt_sha256':parent['sha256']})
    if body=='bodies/support.md':
        root=OUT.parents[1]
        b=(root/'inputs/AGENTS.md').read_bytes();ex=b''.join(b.splitlines(keepends=True)[206:217])
        out.append('\n## I01 — confronto de autoridade documental\n\nInput obrigatório fornecido, não nova captura GitHub. AGENTS.md linhas 207–217; '
           f'SHA256 fonte `{sha(b)}`; trecho `{sha(ex)}`.\n\n`````text\n'+ex.decode()+'`````\n')
        facts=json.loads((OUT/'records/structural-observations.json').read_text())
        out.append('\n## S29 — identidade de observações estruturais\n\n'
          'Estes valores são resultados de parsing/hash determinísticos, **não excertos literais e não PASS**. '
          'Para conferir o manifesto completo, solicitar `packages/core/package.json`; a fonte está integral no arquivo capturado. '
          'Para arquivo vendorizado, pedir README e metadata do membro; o código interno não foi declarado integralmente entendido.\n\n'
          f'- Exports contados: {facts["package"]["exports_count"]}; bare: {facts["package"]["has_bare_export"]}; wildcard: {facts["package"]["has_wildcard"]}.\n'
          f'- Snapshot SQLite: {facts["schema"]["ddl_entities"]["tables"]} entidades tables na lista ddl.\n'
          f'- Tarball: {facts["vendor"]["archive_bytes"]} bytes, SHA256 `{facts["vendor"]["archive_sha256"]}`.\n'
          '- Corpo histórico s1.core.entry: 7.312 bytes, SHA256 `6a488ca8f9717a497949b71ed41db84d995f23b90c31cc59c22c5bd86239ca6c`, preservado em `history/entry.md`.\n')
    section_bytes[body]=len(''.join(out).encode())-startlen
(OUT/'evidence-review.md').write_text(''.join(out))
(OUT/'records/evidence-review-index.json').write_text(json.dumps(review,ensure_ascii=False,indent=2)+'\n')
print(json.dumps({'review_bytes':(OUT/'evidence-review.md').stat().st_size,'literal_ranges':len(review),'section_bytes':section_bytes}))
