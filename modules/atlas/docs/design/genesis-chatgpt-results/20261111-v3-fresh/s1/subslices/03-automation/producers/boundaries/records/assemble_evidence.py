"""Deterministic packaging of captured evidence; never imports or executes repository code."""
import hashlib, json, re, shutil, tarfile, zipfile
from collections import Counter
from pathlib import Path

ROOT = Path('/workspace/scratch/ef5eb2eb4a70/s1-03-34269cf4-d631-41c5-a30b-85b0ec217390')
OUT = ROOT / 'producers/boundaries'
SOURCE = '1cde2ff7a71bcf7aecb5d030917b577165135d38'
KIT = '70234d541a9a3539935ef16f19e33c8f2d5f30ec'
HISTORY = 'a8df22ae3a140c58c63f62ce2a634c84f415c943'

def sha(b): return hashlib.sha256(b).hexdigest()
def blob(b): return hashlib.sha1(b'blob ' + str(len(b)).encode() + b'\0' + b).hexdigest()
def dump(p, obj):
    p.write_text(json.dumps(obj, ensure_ascii=False, indent=2) + '\n')

inventory = [json.loads(x) for x in (ROOT/'inputs/sources.jsonl').read_text().splitlines()]
inventory = [x for x in inventory if x['legacy_artifact_key'] in ('s1.core.boundaries','s1.core.entry')]
assert len(inventory)==128 and len({x['path'] for x in inventory})==128
assigned = {x['path']:x for x in inventory}
captures=[]
for f in ['captures-000-031.json','captures-1.json','captures-2.json','captures-3.json','captures-kit.json']:
    captures.extend(json.loads((OUT/'records'/f).read_text()))
for c in captures:
    b=(OUT/c['capture_path']).read_bytes()
    assert len(b)==c['byte_length'] and sha(b)==c['sha256'] and blob(b)==c['git_blob_sha']
    c['role']='assigned_source' if c['path'] in assigned else 'kit_navigation_authority'
    if c['path'] in assigned:
        assert c['git_blob_sha']==assigned[c['path']]['git_blob_sha'] and c['commit']==SOURCE
assert len(captures)==136 and sum(c['role']=='assigned_source' for c in captures)==128
captures.sort(key=lambda c:(c['commit'],c['path']))
dump(OUT/'captures.json', captures)
by_path={c['path']:c for c in captures}

history_input=json.loads((ROOT/'inputs/inputs.json').read_text())
history_manifest=[]
for name in ('boundaries','entry'):
    b=(ROOT/'inputs/history/bodies'/f'{name}.md').read_bytes()
    meta=next(x['body'] for x in history_input['bodies'] if x['artifact_key']==f's1.core.{name}')
    assert blob(b)==meta['git_blob_sha'] and sha(b)==meta['sha256'] and len(b)==meta['byte_length']
    (OUT/'history'/f'{name}.md').write_bytes(b)
    history_manifest.append({**meta,'artifact_key':f's1.core.{name}','local_path':f'history/{name}.md',
       'handling':'byte-identical inherited body; not a new accepted version', 'verified':True})
for name,ranges in [('a3-dossier',[(3395,3442)]),('a4-dossier',[(2134,2202),(2757,2989)])]:
    p=ROOT/'inputs/history'/f'{name}.md';b=p.read_bytes();lines=b.splitlines(keepends=True)
    meta=next(x for x in history_input['decisive_history'] if (name=='a3-dossier' and 'a3' in x['path']) or (name=='a4-dossier' and 'a4' in x['path']))
    assert blob(b)==meta['git_blob_sha'] and len(b)==meta['byte_length']
    chunks=[f'# Reuso literal de {name}\n\nCommit histórico: `{HISTORY}`. Blob integral: `{blob(b)}`. SHA256 integral: `{sha(b)}`.\n']
    slices=[]
    for first,last in ranges:
        excerpt=b''.join(lines[first-1:last]);slices.append({'first_line':first,'last_line':last,'sha256':sha(excerpt),'bytes':len(excerpt)})
        chunks.append(f'\n## Linhas {first}–{last}\n\nSHA256 dos bytes do trecho: `{sha(excerpt)}`.\n\n`````text\n'+excerpt.decode()+('' if excerpt.endswith(b'\n') else '\n')+'`````\n')
    (OUT/'history'/f'{name}-selected.md').write_text(''.join(chunks))
    history_manifest.append({**meta,'sha256':sha(b),'local_path':f'history/{name}-selected.md','selection':slices,'handling':'literal excerpts, original line ranges; inherited evidence, not new acceptance'})
projection_path=ROOT/'inputs/history/coverage-needs-projection.json'
pb=projection_path.read_bytes();proj=json.loads(pb)
pm=next(x for x in history_input['decisive_history'] if 'coverage-needs-projection' in x['path'])
assert blob(pb)==pm['git_blob_sha'] and len(pb)==pm['byte_length']
selected=[x for x in proj['artifacts'] if x.get('original_artifact',{}).get('key') in ('s1.core.boundaries','s1.core.entry')]
assert len(selected)==2
dump(OUT/'history/coverage-needs-selected.json',{'source':{**pm,'sha256':sha(pb)},'handling':'selection of exactly two inherited records; neither semantic acceptance nor replacement of whole-Core entry','artifacts':selected})
history_manifest.append({**pm,'sha256':sha(pb),'local_path':'history/coverage-needs-selected.json','handling':'exact JSON records selected; whitespace of original projection not retained'})
dump(OUT/'history/manifest.json',history_manifest)

# Evidence spans use actual source bytes, no synthetic line annotations within excerpts.
spans=[
('B01','packages/core/src/atlas.ts',[(38,48),(103,195)],'Port Atlas, abertura por Location, identidade do host e execução limitada do indexador.'),
('B02','packages/core/src/atlas.ts',[(208,218),(239,280),(301,321)],'Drafting e legacy mine: limites de lote, validação de resposta e ausência de promoção automática.'),
('B03','packages/core/src/control-plane/move-session.ts',[(77,148)],'Ordem apply → evento → discard, mesmo projeto e dependências sem runner.'),
('B04','packages/core/src/control-plane/workspace.sql.ts',[(1,20)],'Workspace como esquema persistente; não executor distribuído.'),
('B05','packages/core/src/rag-studio/sql.ts',[(1,36),(38,81)],'Persistência de fontes/chunks/revisions/pipeline; ausência de engine na folha.'),
('B06','packages/core/src/relay-commands.ts',[(7,11),(25,39),(75,114)],'Sugestão heurística de comandos, detecção de runner e limite de busca pytest.'),
('B07','packages/core/src/relay.ts',[(184,217),(568,592),(611,629)],'Raiz por projeto e chave do ledger com validação de path/arquivo.'),
('B08','packages/core/src/relay.ts',[(219,264),(267,283)],'Execução de gate com sandbox e ambiente; git tem implementação distinta.'),
('B09','packages/core/src/relay.ts',[(319,372)],'Timestamp do host, ledger assinado e diferença entre avaliação e registro.'),
('B10','packages/core/src/relay.ts',[(374,418),(420,481),(491,515)],'Recuperação local, trust no trial e recusa do caminho genérico para workflow nativo.'),
('B11','packages/core/src/relay-hook-install.ts',[(217,252),(300,410),(454,474)],'Reparo explícito, lock só no processo, pin, leitura segura e escrita por substituição.'),
('B12','packages/core/src/relay-hook-install.ts',[(166,194),(254,295)],'Pausa/republicação e admissibilidade do grafo de hooks.'),
('B13','packages/core/src/relay-hook-recovery.ts',[(25,88)],'Recuperação só implicit-local, paginação e erros contados por tentativa.'),
('B14','packages/core/src/relay-hook-shipper.ts',[(26,65),(67,130)],'Decisão durável versus recibo, serialização e falhas locais de shipping.'),
('B15','packages/core/src/relay-workflow-binding.ts',[(17,48),(50,75),(106,147)],'Port de publicação do host, identidade pinada e revalidação de materializações.'),
('B16','packages/core/src/relay-workflow-binding.ts',[(149,261)],'Âncoras Atlas e limites verificáveis na ligação de conhecimento.'),
('B17','packages/core/src/relay-workflow-currentstep.ts',[(38,90),(116,139)],'Leitura sem avanço de estado, tripla esperada e projeção do WP atual.'),
('B18','packages/core/src/relay-workflow-session.ts',[(31,96)],'Host nativo registrado, binding durável da sessão e HOLD sem autoridade.'),
('B19','packages/core/src/relay-workflow-transition.ts',[(35,99),(108,125)],'Identidade por assistantMessageID e fence persistente antes do checkpoint individual.'),
('B20','packages/core/src/relay-workflow-evaluator.ts',[(29,125),(130,208)],'Recibo autenticado, lock do engine e reparo sem regrading; old PASS não basta.'),
('T01','packages/core/test/move-session.test.ts',[(83,117)],'Asserções fonte de move-session, não execução.'),
('T02','packages/core/test/relay-workflow-evaluator.test.ts',[(89,126),(162,190)],'Casos de replay/recibo/reparo no código de teste; NOT_RUN.'),
('T03','packages/core/test/relay-hook-recovery.test.ts',[(211,249)],'Casos de retry/observação de falha na fonte de teste; NOT_RUN.'),
('S01','packages/core/README.md',[(1,46),(48,88)],'Entrada pública, direção de dependências e regeneração oficial.'),
('S02','packages/core/package.json',[(1,22)],'Metadados/scripts e início do mapa de exports; censo estrutural abaixo.'),
('S03','packages/core/bunfig.toml',[(1,2)],'Preloads declarados do package.'),
('S04','packages/core/test/preload.ts',[(1,11)],'Isolamento declarado de DB/credenciais/modelos para testes.'),
('S05','packages/core/script/migration.ts',[(14,90),(92,134)],'Geração de migrations/snapshot/registry, ordem e --check.'),
('S06','packages/core/script/toolkit-pack.ts',[(1,29),(79,111),(251,298),(345,360)],'Scaffolding e pin de toolkits; é gerador, não garantia de disponibilidade.'),
('S07','packages/core/script/toolkit-floors.ts',[(1,28),(188,223),(319,359)],'Mensuração estática e comparação de floors; não prova runtime.'),
('S08','packages/core/vendor/README.md',[(1,43)],'Proveniência e preservação do arquivo vendorizado.'),
('S09','docs/architecture/phase-plans/70-90-briefs/EXP-CORE.md',[(1,24),(39,56)],'Card histórico mecânico de exports.'),
('S10','docs/specs/runtime-closure/PRODUCER-BOUNDARY.md',[(1,29),(55,75)],'Exceção histórica delimitada e escopo de namespace.'),
('S11','docs/specs/runtime-closure/CHECKPOINT.md',[(1,20),(39,56)],'Recibos históricos têm candidato; lacunas permanecem explícitas.'),
('S12','docs/specs/runtime-closure/ARCHIE-QUALIFICATION.md',[(1,23),(52,76)],'Qualificação histórica é recorte específico, não fechamento atual.'),
('S13','docs/specs/v2/api.html',[(906,936)],'Vocabulário histórico de entrega na especificação visual.'),
('S14','docs/specs/v2/todo.md',[(56,74)],'Backlog de recuperação provider, diferente do replay do EventV2.'),
('S15','packages/core/test/fixture/omni-expect.ts',[(1,28)],'Controle de spawn por teste, identidade de módulo compartilhada.'),
('S16','packages/core/test/fixture/actions-transport.ts',[(15,26),(55,67),(88,115)],'Processo real no fixture, respostas/credenciais sintéticas.'),
('S17','packages/core/test/fixture/board-queue.ts',[(27,49),(124,151),(333,355)],'Git real, GitHub/renderer/recibo de scoped-pass sintéticos.'),
('S18','packages/core/test/fixture/capability-schedule.ts',[(37,52),(65,89)],'Schedule fixture substitui execução e usa ToolRegistry na admissão.'),
('S19','packages/core/test/fixture/capability-connection-management.ts',[(29,41),(43,64)],'Factory real e dados privados sintéticos no fixture de conexão.'),
('S20','packages/core/test/distribution-bundle-execution.test.ts',[(13,34)],'ORCHESTRATION-ONLY não qualifica Omni nativo.'),
('S21','packages/core/test/distribution-bundle-boundaries.test.ts',[(12,23)],'Log cargo sintético que não pode virar PASS herdado.'),
('S22','packages/core/test/fixture/github-read.ts',[(19,32)],'Wire-shape derivado de exemplos não equivale a provedor ao vivo.'),
('S23','packages/core/test/fixture/process-tree.ts',[(1,21)],'Identidade de processo por nonce e birth time, não PID isolado.'),
('S24','packages/core/test/windows-process-query.hosted.ts',[(1,24)],'Fonte de prova hospedada exige CI; não foi executada aqui.'),
('S25','packages/core/test/lib/effect.ts',[(9,20),(41,60)],'Ciclo Effect scoped, clock de teste/live e skip registrado pelo runner.'),
('S26','packages/core/test/lib/sandbox-host.ts',[(1,17)],'Capacidade de jail distingue plataforma e fallback.'),
('S27','packages/core/test/upstream-settlement-preservation.test.ts',[(25,45)],'Fonte preparada de settlement; comentário não atesta execução.'),
('S28','packages/core/test/fixture/packaged-skills.ts',[(9,27),(30,53)],'Bytes e identidade dos módulos no fixture de empacotamento.'),
]
kitbase='modules/atlas/docs/design/genesis-chatgpt-results/20261111-v3-fresh/s1/delegation-20261114/'
spans.extend([
 ('K01',kitbase+'partition.json',[(1,127)],'Partição real das 36 keys históricas e 2236 fontes.'),
 ('K02',kitbase+'dependencies.json',[(1,103),(160,202)],'Roteamento de obrigações distinto de build graph e autoridade da união.'),
 ('K03',kitbase+'01-sessions/mission.json',[(1,43)],'Missão S1-01: branch, inventário, keys e prefixo reais.'),
 ('K04',kitbase+'02-tools/mission.json',[(1,38)],'Missão S1-02: branch, inventário, keys e prefixo reais.'),
 ('K05',kitbase+'03-automation/mission.json',[(1,38)],'Missão S1-03: branch, inventário, keys e prefixo reais.'),
 ('K06',kitbase+'04-api/mission.json',[(1,43)],'Missão S1-04: branch, inventário, keys e prefixo reais.'),
 ('K07',kitbase+'05-libraries/mission.json',[(1,44)],'Missão S1-05: branch, inventário, keys e prefixo reais.'),
 ('K08',kitbase+'roster.json',[(1,18),(69,129)],'Roster do kit, preparo histórico e composição de subfatias.'),
])

evidence=['# Evidência literal — BOUNDARIES-SUPPORT-L1\n\n'
 'Estágio: candidato L1; sem decisão de juiz, teste executado ou qualificação runtime. '
 'Todos os excertos B/T/S abaixo provêm dos bytes GitHub capturados no pin de fonte. '
 'T e testes/fixtures em S são código e dados observados, nunca resultado de execução. '
 'Os fences preservam os bytes do trecho; linhas são numeradas pela origem (primeira linha = 1). '
 'Hashes de excerto incluem os terminadores de linha originais. `captures.json` contém os 128 fontes atribuídos e oito arquivos do kit.\n\n'
 f'Fonte: `{SOURCE}`. Kit: `{KIT}`. Histórico: `{HISTORY}`.\n']
eindex=[]
for eid,p,ranges,claim in spans:
    c=by_path[p];b=(OUT/c['capture_path']).read_bytes();lines=b.splitlines(keepends=True)
    evidence.append(f'\n## {eid} — {claim}\n\nPath: `{p}`. [Fonte pinada]({c["source_url"]}).\n\n'
      f'Git blob: `{c["git_blob_sha"]}`. SHA256 integral: `{c["sha256"]}`. Bytes: {len(b)}.\n')
    for first,last in ranges:
        assert 1<=first<=last<=len(lines),(eid,first,last,len(lines))
        ex=b''.join(lines[first-1:last]);eindex.append({'id':eid,'path':p,'commit':c['commit'],'first_line':first,'last_line':last,'sha256':sha(ex),'byte_length':len(ex)})
        evidence.append(f'\n### Linhas {first}–{last}\n\nSHA256 do trecho: `{sha(ex)}`.\n\n`````text\n'+ex.decode()+('' if ex.endswith(b'\n') else '\n')+'`````\n')

pkg=json.loads((OUT/'sources/packages/core/package.json').read_text())
schema=json.loads((OUT/'sources/packages/core/schema.json').read_text())
archive=OUT/'sources/packages/core/vendor/hugr-lean-0.4.0-0660c2b5dc92.tgz'
with tarfile.open(archive,'r:gz') as tf:
    members=tf.getmembers();vp=tf.extractfile('package/package.json').read();vend=json.loads(vp)
with zipfile.ZipFile(OUT/'sources/packages/core/test/fixture/pinned-artifact/tool.zip') as z:
    zrows=[{'member':x.filename,'bytes':x.file_size,'sha256':sha(z.read(x))} for x in z.infolist()]
struct={'method':'Python JSON/archive metadata parsing only; no import, extraction to execution path, installation, build or test',
 'package':{'exports_count':len(pkg['exports']),'has_bare_export':'.' in pkg['exports'],'has_wildcard':any('*' in x for x in pkg['exports']),
 'selected_exports':{k:v for k,v in pkg['exports'].items() if any(x in k for x in ['atlas','relay','control-plane','rag-studio','test/fixture','test/lib'])}},
 'schema':{'version':schema['version'],'dialect':schema['dialect'],'id':schema['id'],'prevIds':schema['prevIds'],'ddl_entities':dict(Counter(x['entityType'] for x in schema['ddl']))},
 'vendor':{'archive_sha256':sha(archive.read_bytes()),'archive_bytes':archive.stat().st_size,'member_count':len(members),'package_json_sha256':sha(vp),'name':vend['name'],'version':vend['version'],'license':vend.get('license'),'engines':vend.get('engines'),'exports':vend.get('exports')},
 'zip_fixture':zrows}
dump(OUT/'records/structural-observations.json',struct)
evidence.append('\n## S29 — Observações estruturais determinísticas\n\nOs valores abaixo são derivados de bytes identificados em `captures.json`; o parser só leu JSON e diretórios de arquivos compactados. Não avaliou implementação interna nem produziu PASS.\n\n```json\n'+json.dumps(struct,ensure_ascii=False,indent=2)+'\n```\n')
ag=(ROOT/'inputs/AGENTS.md').read_bytes();agl=ag.splitlines(keepends=True);agex=b''.join(agl[206:217])
evidence.append('\n## I01 — AGENTS fornecido no kit de execução\n\nInput local obrigatório: `inputs/AGENTS.md`; não é contado como fonte atribuída nem como nova captura GitHub. '
 f'SHA256 integral `{sha(ag)}`, blob calculado `{blob(ag)}`. Linhas 207–217; SHA256 do trecho `{sha(agex)}`.\n\n`````text\n'+agex.decode()+'`````\n')
evidence.append('\n## H01 — Reuso histórico verificável\n\n`history/entry.md` permanece byte-idêntico ao corpo inteiro Core `s1.core.entry`; a nova chave local é `s1.subslice03.support`. '
 'O histórico de fronteiras e os excertos A3/A4 são entradas de comparação, sem reautoria de decisões. `history/manifest.json` conserva commits, blobs, SHA256, byte lengths e intervalos selecionados. '
 'A projeção herdada distinguia leitura decisiva de censo: `history/coverage-needs-selected.json` retém exatamente os registros de fronteiras e entrada.\n')
(OUT/'evidence.md').write_text(''.join(evidence))
dump(OUT/'records/evidence-index.json',eindex)
print(json.dumps({'captures':len(captures),'assigned_sources':len(inventory),'assigned_bytes':sum(c['byte_length'] for c in captures if c['role']=='assigned_source'),'evidence_ranges':len(eindex),'evidence_bytes':(OUT/'evidence.md').stat().st_size,'package_exports':len(pkg['exports']),'schema_tables':struct['schema']['ddl_entities']['tables'],'history_entry_sha256':sha((OUT/'history/entry.md').read_bytes())}))
