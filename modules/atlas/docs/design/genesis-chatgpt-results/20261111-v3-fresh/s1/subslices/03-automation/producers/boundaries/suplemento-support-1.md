# Suplemento support 1 — correções e RE-SUP-01..05

Produtor original `/root/boundaries_l1`; pedidos públicos J1/J2 lidos integralmente e preservados. Nenhum oracle ou outro parecer reservado foi consultado. Estado: resposta a FIX-FIRST/REQUEST_EVIDENCE, com três precisões autorizadas; nenhuma decisão de aceite atribuída pelo produtor.

Corpo v1 `3a4ef5ee6925eb3c80404181f00a0e4e012750459f2dbb1ab11076b69449d684` (22388 bytes); corpo v2 `498a0454418a14977b9b2f4c4f515711d941b6d4bbece13f1baaa8feaa76d378` (23025 bytes). Original, receita, resposta e coverage v1 estão preservados em `revisions/support-v1/`.

## SUP-F01/D-SUP-01 — delta literal autorizado

Anterior:

`````text
A direção declarada vai de Schema/Protocol para Core e daí para Server; Core não deve importar Client/Server.
`````

Novo:

`````text
A fonte declara separadamente `Schema → Core` e `Protocol → Server`; também informa que Server expõe os serviços Core por HTTP. Core não deve importar Client/Server.
`````

## SUP-F03 — delta literal autorizado

Anterior:

`````text
aponta a chave de testes para arquivo temporário
`````

Novo:

`````text
fornece um caminho temporário para a chave de testes quando `ORCHESTRA_CREDENTIAL_KEY_FILE` ainda não está definida (`??=` preserva um valor previamente definido)
`````

## SUP-F02 — delta literal autorizado

Anterior:

`````text
`omni-expect.ts` registra snapshot de contagem no próprio teste e compara apenas seus spawns quando o teste termina. Outro teste não pode satisfazer a expectativa aberta; caso filtrado/skipped que não abriu expectativa não declara controle.
`````

Novo:

`````text
`omni-expect.ts` mantém uma única expectativa `open` e calcula a diferença do contador `Omni.snapshot().spawns` na janela entre `expectSpawn` e `settle`. O comentário declara a intenção de atribuir os spawns ao teste e descreve liquidação por `afterEach`; a folha isolada não demonstra atribuição individual de cada spawn nem exclusão de sobreposição. Interpretar a diferença como contagem exclusiva de um teste exige que essa janela não contenha spawns de outros testes ou trabalhos e que a integração ao runner delimite a janela corretamente. Caso filtrado/skipped que não chamou `expectSpawn` não abriu expectativa. Essa qualificação não afirma que tenha ocorrido uma falha real.
`````

## Erratum compartilhado de duas razões de coverage

O original e o bloco compartilhado já congelado permanecem intactos. Só README e omni-expect recebem nova razão, em arquivo v2 separado.

### SUP-COVERAGE-ERRATUM — `shared-reconciliation-2.delta.md` 1–37

Commit `LOCAL_OR_INDEPENDENT_RECORD`; blob `2c72c406a9c44cbd32e2563f15cc3f08d589a4ce`; SHA256 integral `d2a6755fbb6f1aa41ab93be1ac42478de9bed062330489eff68ca34fb4b0b48a`. Bytes fonte 1966; recorte [0, 1966); SHA256 trecho `d2a6755fbb6f1aa41ab93be1ac42478de9bed062330489eff68ca34fb4b0b48a`.

`````text
# Erratum compartilhado — duas razões de coverage

Autorizado pela principal para alinhar exclusivamente SUP-F01/D-SUP-01 e SUP-F02. `coverage.jsonl` v1 e `shared-reconciliation-1.md` permanecem byte-idênticos; use `coverage-v2.jsonl` para estas duas razões corrigidas. Contagens, paths, hashes das fontes, profundidades e estados não mudam. Não há novo aceite.

v1 SHA256 `d7e73779d4d0eca6a0edd56921c612955f82a564831c9fc6bf05353c1ae0c4b9`; v2 SHA256 `d1ed0705d256b1578a0debce284c3a2c4dd3bd2e00bf9f8f60e047b097d5bf74`. Exatamente duas linhas modificadas.

## SUP-F01/D-SUP-01 — `packages/core/README.md`

Razão anterior (literal):

`````text
Entrada pública e direção Schema/Protocol→Core→Server, composição e geradores oficiais; intenção de arquitetura não prova todas as folhas.
`````

Razão corrigida (literal):

`````text
Entrada pública: Schema→Core e Protocol→Server são relações separadas; Server expõe serviços Core por HTTP. Composição e geradores oficiais são declarados; intenção de arquitetura não prova todas as folhas.
`````

Linha 16, SHA256 da linha v1 `60bec29f8994fbfa5b8def81c75bbe31d1c37d692beec4c7c230674407ba6579`, linha v2 `9e68bdedf893a3bb659e225f1cba4f871d2b9a4d5d006aa2e14735f61d6fa167`.

## SUP-F02 — `packages/core/test/fixture/omni-expect.ts`

Razão anterior (literal):

`````text
Controle positivo abre expectativa no próprio teste e computa apenas seus spawns; outro teste não satisfaz a declaração.
`````

Razão corrigida (literal):

`````text
Mantém uma expectativa open e mede diferença do contador de spawns na janela expectSpawn→settle. Exclusividade por teste é intenção do comentário e exige ausência de sobreposição/integração correta com runner, não demonstradas só por esta folha.
`````

Linha 77, SHA256 da linha v1 `04ce87f24436a300e75936ae56404b47c77eb2299950b7db068cc65d6e01fc30`, linha v2 `13dd2bc2e03bb8374d6778d8c7b26139b742de825e9208c985c2dd2718a28be0`.
`````

## Plano de reuso do que J1/J2 já receberam

R042–R077, I01 e S29 foram reconhecidos nos pedidos públicos. Os ramos abaixo complementam esses recortes. O comentário de omni-expect é intenção; a correção escolhe a descrição limitada da janela, não tenta provar exclusividade com uma integração de runner não exibida. Não se afirma falha real.

| R | Fonte / linhas | Offset na fonte | SHA256 trecho | Offset em evidence-review.md |
|---|---|---|---|---|
| R042 | `packages/core/README.md` 1–27 | [0, 2131) | `1d4c069166cb530621c4bf35ad166fe05996dcb54e58431a8e36d6f26e0fbe5e` | [58874, 61005) |
| R043 | `packages/core/README.md` 48–62 | [3086, 4053) | `83c0452c7a83b6ec2e2462325060ad5d5bb582a114c32716f6ff6f4a2466a0c6` | [61358, 62325) |
| R044 | `packages/core/package.json` 1–22 | [0, 776) | `63b49e189893202b209c0c4406a32483d1b641a7a12c888378d0f6bfb4eae4e3` | [62679, 63455) |
| R045 | `packages/core/bunfig.toml` 1–2 | [0, 106) | `bc68812446e4beefbffc44973ea98521f9d95ea9096849ff2d2ac30fa1ad4ca2` | [63806, 63912) |
| R046 | `packages/core/test/preload.ts` 4–11 | [45, 660) | `87f85c05405dccc8eff327b7b22ef016f6e597f5b9124e22d71eeccb4aa3b4e6` | [64269, 64884) |
| R047 | `packages/core/script/migration.ts` 37–58 | [1068, 2128) | `67cb9b784dbea632e49e95e4ba23e162219e18fb6acb1477b6125e56d2cb2df4` | [65247, 66307) |
| R048 | `packages/core/script/migration.ts` 71–88 | [2528, 3434) | `5e5fe1d38508707f85bc88b608df7ddb8b456af9a1c0dfd22bdcd391816bd8a3` | [66670, 67576) |
| R049 | `packages/core/script/toolkit-pack.ts` 1–15 | [0, 1400) | `b8ae9793c3d04bbe4f6908fa3200793f6a0d9175596873ec1e52ede789f9b839` | [67940, 69340) |
| R050 | `packages/core/script/toolkit-pack.ts` 345–360 | [15585, 16119) | `f8498e7a54b8f6da483e9c3af1e03b3a8fa9b741f54b1abfb73a63eea2bd625f` | [69710, 70244) |
| R051 | `packages/core/script/toolkit-floors.ts` 1–17 | [0, 1457) | `adb80283ddc6d935d68fab9068e5198a146a636ec3e2e40fd3d03db77c408fe7` | [70610, 72067) |
| R052 | `packages/core/vendor/README.md` 1–22 | [0, 1599) | `608743a6ac169ad6040bc2f399e0d6af6d6c993369c79539cbb952855d4f5e85` | [72425, 74024) |
| R053 | `packages/core/vendor/README.md` 28–43 | [1916, 2871) | `d3e91ac5fc12cc7425b959e7e86281a89448f3ecc0174f639b3fd8a439bfb6f1` | [74383, 75338) |
| R054 | `docs/architecture/phase-plans/70-90-briefs/EXP-CORE.md` 49–56 | [2818, 3715) | `e9d2b43a633e3a27ce97ea428a1a5ae68fe353b655c0809cbd53e840bc8a39c6` | [75722, 76619) |
| R055 | `docs/specs/runtime-closure/PRODUCER-BOUNDARY.md` 1–21 | [0, 1143) | `3e7b36ff1a1b15b4d81a0d0aeadcea70bc205a8223db4afe4bd55870930a9829` | [76994, 78137) |
| R056 | `docs/specs/runtime-closure/CHECKPOINT.md` 39–56 | [6056, 8092) | `f9825b4497f2fd8dbb3cf2ae042c83fb35c67d7dd7d57a83ee57eefc6fc066ea` | [78507, 80543) |
| R057 | `docs/specs/runtime-closure/ARCHIE-QUALIFICATION.md` 52–76 | [4385, 8788) | `b38dc0822be2732f0e0947a3b37258248eac6e4cd4492566ab0ffe08bc1cddc0` | [80923, 85326) |
| R058 | `docs/specs/v2/api.html` 919–925 | [35002, 35349) | `0dc9b2d572db698486503d79f5c06985f9d6cd813451701b9de6557eeb7a7cd9` | [85682, 86029) |
| R059 | `docs/specs/v2/todo.md` 56–74 | [2789, 3767) | `aae64b83c19d85d938b0bfd00c1afdbbc90859dd2a0f3eb72dbb0e8eabd39097` | [86380, 87358) |
| R060 | `packages/core/test/fixture/omni-expect.ts` 1–7 | [0, 639) | `b74576f4f2676cf6f3e92342cb80aded095a63df731fbdbde448f68a18035221` | [87726, 88365) |
| R061 | `packages/core/test/fixture/omni-expect.ts` 13–27 | [788, 1374) | `07c0e7573fde3edd8b0f03142f5cf065ba60f5bdc3adb0a5e2e9602b60e5fc0b` | [88735, 89321) |
| R062 | `packages/core/test/fixture/actions-transport.ts` 55–67 | [2999, 3736) | `ca8fd0d63f34a480badc8b39a7f33da1823a2d982f37e3b4cea4dc97cee1adef` | [89698, 90435) |
| R063 | `packages/core/test/fixture/board-queue.ts` 27–38 | [1343, 2029) | `16e67e208d307b0382d06b62515be67dcf872fa1dc67a61db8f397eb86d8d2e5` | [90806, 91492) |
| R064 | `packages/core/test/fixture/board-queue.ts` 132–147 | [7673, 8395) | `e16afd0b04ffa9d1aa18af13f38b9cb52590e30df08456f40e2c03b56381ba27` | [91867, 92589) |
| R065 | `packages/core/test/fixture/board-queue.ts` 333–351 | [17127, 17881) | `0eabf0e1481d7703a3b65df865b537f9dab38a9fe0b45fb5b8be0e45d8c23531` | [92964, 93718) |
| R066 | `packages/core/test/fixture/capability-schedule.ts` 37–52 | [2029, 3259) | `5fb24b30119eb80629e0d98c9b731843b96209af31b78739500f7640d98220ce` | [94097, 95327) |
| R067 | `packages/core/test/fixture/capability-schedule.ts` 72–85 | [4517, 5794) | `8e976db28ec43fe70fd733a7687388658232dde9f4751da039e4fcea9ea3276d` | [95706, 96983) |
| R068 | `packages/core/test/fixture/capability-connection-management.ts` 34–41 | [1881, 2440) | `1281e9e410eb39c570436ee31fb0a9b2f96476523a4309d1c5688b01e5de66ab` | [97375, 97934) |
| R069 | `packages/core/test/distribution-bundle-execution.test.ts` 13–26 | [574, 1445) | `a3f4f2c76131279922f02cca875c11730dd7e2f72b21d319ed68f928ebc7e73d` | [98320, 99191) |
| R070 | `packages/core/test/distribution-bundle-boundaries.test.ts` 13–23 | [596, 1085) | `9b5992aeb4b74a766d3bb2c256533406908f4814b4a5b8bd90df849f46c495b7` | [99578, 100067) |
| R071 | `packages/core/test/fixture/github-read.ts` 27–32 | [1488, 1998) | `64d9962c1a649ca65d5e1ae2ac5e4ccde443c9b7bf87c67ad579fef6aa8d6069` | [100438, 100948) |
| R072 | `packages/core/test/fixture/process-tree.ts` 1–9 | [0, 784) | `cf8d286443d0466cc35041dea6b46696d89322844e95f3dc5820f06c29ab0b40` | [101317, 102101) |
| R073 | `packages/core/test/windows-process-query.hosted.ts` 9–23 | [447, 1406) | `a4fb28ac7cd5a25c9a8c5400c34f793dcce28f981a308c1341c7077f53f8e1ae` | [102479, 103438) |
| R074 | `packages/core/test/lib/effect.ts` 41–60 | [1909, 2864) | `b4fb05ecf3b4ddb316c7c7f3e7eb65ceae8273045b4245d4fb43417273a3087e` | [103800, 104755) |
| R075 | `packages/core/test/lib/sandbox-host.ts` 5–17 | [180, 1023) | `706009731422d25b3a422649b0611340fe32aa14472a8b40a3412b7ad12eb077` | [105121, 105964) |
| R076 | `packages/core/test/upstream-settlement-preservation.test.ts` 29–40 | [1383, 2065) | `771a340bd67f929022ccd306ffe56272d3e6b6ea03bdd982c29c356168071b35` | [106353, 107035) |
| R077 | `packages/core/test/fixture/packaged-skills.ts` 9–18 | [240, 713) | `fc8119756b4ce970c44d0e984bc54558ad88b42079654a18c2d6dc2270fe8dce` | [107408, 107881) |

## RE-SUP-01 — População/herança reutilizadas e fatos estruturais independentes

O bloco `shared-reconciliation-1.md` deve ser transportado uma única vez no lote boundaries; é reutilizado aqui sem duplicação. SHA256 `75aa4f74aba2ddcecd58c52fd329481dffabc60271a57bf0bfbe358d0b903992`, 121449 bytes. Está integralmente em `suplemento-boundaries-1.md` nos bytes [9742, 131191). A principal deve manter esse bloco no contexto do par para este reuso; a referência não afirma entrega já concluída pelo produtor.

Esse bloco fornece as 24 linhas originais completas e a projeção individual dos 104 paths (path/read_depth/role/rationale), com identidade do JSONL, composição 9/3/12/80, históricos boundaries/entry/manifest, 1441/2236, e os campos literais 2+102/4+20 da projeção original. O erratum acima substitui somente duas razões; `coverage-v2.jsonl` conserva 128 linhas e todos os outros bytes de linha. Os 104 continuam no artefato `s1.subslice03.support`, need `entry`; os 24 continuam em `s1.core.boundaries`, need `component`.

### Verificação independente da principal

O recibo tem 58.492 bytes, SHA256 `d2938337ccfad084d4e4e6c9d6ecd08c9b26701e86d69ca760601a93e76ca3eb`. Ele liga seis inputs aos blobs/SHA/bytes capturados. Confirmou 437 exports sem raiz/wildcard; 63 tables, 637 columns, 59 fks, 63 pks, 52 indexes, 3 uniques e 1 check; 191 membros no tar. O escopo do resultado é estrutural; o próprio recibo mantém semantic_acceptance NOT_ASSIGNED e product_execution NOT_RUN. O procedimento foi lido, não reexecutado por este produtor.

### MECH-PROCEDURE — `scripts/verify-support-structure.py` 1–43

Commit `LOCAL_OR_INDEPENDENT_RECORD`; blob `7784f7f6038805961f963653f4015accae642d18`; SHA256 integral `ce242e9fe2d969baf176a4c1d101342e265d5c0857dd8d8fcbbc70a82cd2bb52`. Bytes fonte 3713; recorte [0, 3713); SHA256 trecho `ce242e9fe2d969baf176a4c1d101342e265d5c0857dd8d8fcbbc70a82cd2bb52`.

`````text
from pathlib import Path
from collections import Counter
import hashlib,json,sys,io,tarfile,zipfile,re

root=Path(sys.argv[1]);manifest=Path(sys.argv[2]);output=Path(sys.argv[3])
captures={x['path']:x for x in map(json.loads,manifest.read_text().splitlines())}
sources=[]
def load(path):
    b=(root/path).read_bytes();c=captures[path]
    assert hashlib.sha256(b).hexdigest()==c['sha256']
    assert hashlib.sha1(b'blob '+str(len(b)).encode()+b'\0'+b).hexdigest()==c['git_blob_sha']
    assert len(b)==c['byte_length']
    sources.append({k:c[k] for k in ['path','commit','git_blob_sha','sha256','byte_length']})
    return b
pkg=json.loads(load('packages/core/package.json'));exports=pkg['exports']
schema=json.loads(load('packages/core/schema.json'));counts=dict(Counter(x['entityType'] for x in schema['ddl']))
tb=load('packages/core/vendor/hugr-lean-0.4.0-0660c2b5dc92.tgz')
with tarfile.open(fileobj=io.BytesIO(tb),mode='r:gz') as tar:
    members=[{'name':m.name,'size':m.size,'type':m.type.decode('ascii','backslashreplace')} for m in tar.getmembers()]
    package_json=tar.extractfile('package/package.json').read()
    meta=json.loads(package_json)
zb=load('packages/core/test/fixture/pinned-artifact/tool.zip')
with zipfile.ZipFile(io.BytesIO(zb)) as z:
    zipped=[{'member':v.filename,'bytes':len(z.read(v)),'sha256':hashlib.sha256(z.read(v)).hexdigest(),'hex':z.read(v).hex()} for v in z.infolist()]
scip=[]
for name in ['core','orchestra']:
    path='packages/core/test/fixture/scip-alias/'+name+'.scip';b=load(path)
    scip.append({'path':path,'ascii_printable_strings_min_length':4,'strings':[{'byte_start':m.start(),'byte_end_exclusive':m.end(),'text':m.group().decode('ascii')} for m in re.finditer(rb'[ -~]{4,}',b)],'semantic_protocol_decode':False})
result={
 'schema':'s1-03-independent-support-structure/v1',
 'method':'Python stdlib only: exact captured bytes and source hashes checked; JSON parse, Counter(entityType) over ddl list, tar member metadata/read package.json in memory, ZIP member bytes, ASCII printable SCIP strings with byte offsets. No archive extraction to filesystem, import, install, build, test, generator or binary execution.',
 'sources':sources,
 'package':{'name':pkg['name'],'version':pkg['version'],'exports_count':len(exports),'has_bare_export':'.' in exports,'has_wildcard':any('*' in k for k in exports),'exports_keys':list(exports)},
 'schema_snapshot':{'version':schema['version'],'dialect':schema['dialect'],'id':schema['id'],'prevIds':schema['prevIds'],'ddl_total':len(schema['ddl']),'ddl_entities':counts},
 'tar':{'member_count':len(members),'members':members,'package_json_exact_utf8':package_json.decode(),'package_json_bytes':len(package_json),'package_json_sha256':hashlib.sha256(package_json).hexdigest(),'package_name':meta['name'],'package_version':meta['version']},
 'zip_fixture':zipped,'scip_fixtures':scip,
 'status':'PASS_STRUCTURAL_FACTS_ONLY','semantic_acceptance':'NOT_ASSIGNED','product_execution':'NOT_RUN'}
assert result['package']['exports_count']==437
assert not result['package']['has_bare_export'] and not result['package']['has_wildcard']
assert counts=={'tables':63,'columns':637,'fks':59,'pks':63,'indexes':52,'uniques':3,'checks':1}
assert len(members)==191 and hashlib.sha256(package_json).hexdigest()=='eb1e4264a0ddc9a050fe30490415dc020f33d2bb7a3de73e768943ef499851fa'
output.parent.mkdir(parents=True,exist_ok=True);output.write_text(json.dumps(result,ensure_ascii=False,indent=2)+'\n')
print(json.dumps({'output':str(output),'bytes':output.stat().st_size,'sha256':hashlib.sha256(output.read_bytes()).hexdigest(),'exports':len(exports),'ddl':counts,'tar_members':len(members),'status':result['status']},ensure_ascii=False))
`````

### MECH-RECEIPT-1 — `payload/receipts/independent-support-structure.json` 3–3

Commit `LOCAL_OR_INDEPENDENT_RECORD`; blob `d96d7c7dd3efd4691a3c325518e9ee6c3845c348`; SHA256 integral `d2938337ccfad084d4e4e6c9d6ecd08c9b26701e86d69ca760601a93e76ca3eb`. Bytes fonte 58492; recorte [68, 397); SHA256 trecho `c85e039d382c84cdd159797e00c15003a8e3c426422211ecf91923f9720b6c7d`.

`````text
"Python stdlib only: exact captured bytes and source hashes checked; JSON parse, Counter(entityType) over ddl list, tar member metadata/read package.json in memory, ZIP member bytes, ASCII printable SCIP strings with byte offsets. No archive extraction to filesystem, import, install, build, test, generator or binary execution."
`````

### MECH-RECEIPT-2 — `payload/receipts/independent-support-structure.json` 4–47

Commit `LOCAL_OR_INDEPENDENT_RECORD`; blob `d96d7c7dd3efd4691a3c325518e9ee6c3845c348`; SHA256 integral `d2938337ccfad084d4e4e6c9d6ecd08c9b26701e86d69ca760601a93e76ca3eb`. Bytes fonte 58492; recorte [412, 2276); SHA256 trecho `9beeaed263f678155ccc3cf9ba983b544e860aacf52fa91c7a3578536b683fe9`.

`````text
[
    {
      "path": "packages/core/package.json",
      "commit": "1cde2ff7a71bcf7aecb5d030917b577165135d38",
      "git_blob_sha": "8ee8ebb666051c9b5ee0fcd4a54bceb3a2cb3c43",
      "sha256": "1c58faa263c2bb931b9789722342645e94cb30f0b91613b9093aa2ed422c8385",
      "byte_length": 31912
    },
    {
      "path": "packages/core/schema.json",
      "commit": "1cde2ff7a71bcf7aecb5d030917b577165135d38",
      "git_blob_sha": "31e3169da5ae7c3f15108cdbc773cc5ec9111bd5",
      "sha256": "2655ceef23cb605ebb16630396831df540e104c362bbc168061b7ecfd9ef2fe5",
      "byte_length": 202139
    },
    {
      "path": "packages/core/vendor/hugr-lean-0.4.0-0660c2b5dc92.tgz",
      "commit": "1cde2ff7a71bcf7aecb5d030917b577165135d38",
      "git_blob_sha": "62cbd7c7df2ae07cdd3b623d4d3d6ee3fe3134ab",
      "sha256": "5ff983c58aa056d82059d5edd5b428478dda50a7683a201b7d844949aa1712a3",
      "byte_length": 205370
    },
    {
      "path": "packages/core/test/fixture/pinned-artifact/tool.zip",
      "commit": "1cde2ff7a71bcf7aecb5d030917b577165135d38",
      "git_blob_sha": "41208db9a073ce776d126fcc6db9376533efb50a",
      "sha256": "4b6fcf6a45c68b0620f6c5c3b25d66dbbe37d7e653d817aa1c098c26600c9f2b",
      "byte_length": 136
    },
    {
      "path": "packages/core/test/fixture/scip-alias/core.scip",
      "commit": "1cde2ff7a71bcf7aecb5d030917b577165135d38",
      "git_blob_sha": "3fc1467571db2fdd0320695f8fcfd4671cda8e31",
      "sha256": "1204e841efb9f7ee9e609b4224f65fdd0067c02d7ee28bd12c571a3b32757d66",
      "byte_length": 1447
    },
    {
      "path": "packages/core/test/fixture/scip-alias/orchestra.scip",
      "commit": "1cde2ff7a71bcf7aecb5d030917b577165135d38",
      "git_blob_sha": "e004123513137fe7c73803dc3535606d84cccb7e",
      "sha256": "a173da17ce68aee1f5026a4d70e6288ef0eae1d19cbc00dd1f856d02258e26bc",
      "byte_length": 3850
    }
  ]
`````

### MECH-RECEIPT-3 — `payload/receipts/independent-support-structure.json` 494–511

Commit `LOCAL_OR_INDEPENDENT_RECORD`; blob `d96d7c7dd3efd4691a3c325518e9ee6c3845c348`; SHA256 integral `d2938337ccfad084d4e4e6c9d6ecd08c9b26701e86d69ca760601a93e76ca3eb`. Bytes fonte 58492; recorte [16227, 16581); SHA256 trecho `d9e572ec392de451b5fae0b99ecff97168066c9f5eaa4c37aa254e9c3922822b`.

`````text
{
    "version": "7",
    "dialect": "sqlite",
    "id": "e6e8468f-7bbe-4c35-aef1-3303e28aaf44",
    "prevIds": [
      "71037a02-42ad-482f-b987-e20674ec0701"
    ],
    "ddl_total": 878,
    "ddl_entities": {
      "tables": 63,
      "columns": 637,
      "fks": 59,
      "pks": 63,
      "indexes": 52,
      "uniques": 3,
      "checks": 1
    }
  }
`````

### MECH-RECEIPT-4 — `payload/receipts/independent-support-structure.json` 1477–1484

Commit `LOCAL_OR_INDEPENDENT_RECORD`; blob `d96d7c7dd3efd4691a3c325518e9ee6c3845c348`; SHA256 integral `d2938337ccfad084d4e4e6c9d6ecd08c9b26701e86d69ca760601a93e76ca3eb`. Bytes fonte 58492; recorte [41619, 41827); SHA256 trecho `da91f26dd3e27af06818e01fe3573832c6a88c16f0fcfe89838cb05ec6fa4153`.

`````text
[
    {
      "member": "bin/tool",
      "bytes": 22,
      "sha256": "25eda55137747802ce9a30f1ce9a86b1c75e8a43797a2284eed853f1d4f7243e",
      "hex": "23212f62696e2f73680a6563686f207a69707065640a"
    }
  ]
`````

### MECH-RECEIPT-5 — `payload/receipts/independent-support-structure.json` 2026–2026

Commit `LOCAL_OR_INDEPENDENT_RECORD`; blob `d96d7c7dd3efd4691a3c325518e9ee6c3845c348`; SHA256 integral `d2938337ccfad084d4e4e6c9d6ecd08c9b26701e86d69ca760601a93e76ca3eb`. Bytes fonte 58492; recorte [58386, 58414); SHA256 trecho `6a32633ff0656c6ddd67c05770350a88981d41db2bd33859e06d2cd37da5d4d4`.

`````text
"PASS_STRUCTURAL_FACTS_ONLY"
`````

### MECH-RECEIPT-6 — `payload/receipts/independent-support-structure.json` 2027–2027

Commit `LOCAL_OR_INDEPENDENT_RECORD`; blob `d96d7c7dd3efd4691a3c325518e9ee6c3845c348`; SHA256 integral `d2938337ccfad084d4e4e6c9d6ecd08c9b26701e86d69ca760601a93e76ca3eb`. Bytes fonte 58492; recorte [58441, 58455); SHA256 trecho `222bf2e8f1614e4f17bd7f257c75d4b36a92371df128849559bbc9bd903ce9dd`.

`````text
"NOT_ASSIGNED"
`````

### MECH-RECEIPT-7 — `payload/receipts/independent-support-structure.json` 2028–2028

Commit `LOCAL_OR_INDEPENDENT_RECORD`; blob `d96d7c7dd3efd4691a3c325518e9ee6c3845c348`; SHA256 integral `d2938337ccfad084d4e4e6c9d6ecd08c9b26701e86d69ca760601a93e76ca3eb`. Bytes fonte 58492; recorte [58480, 58489); SHA256 trecho `685a776931a76735cbc38157245411d368b7cc7c5f63f24f6acab775f2d607ab`.

`````text
"NOT_RUN"
`````

### MECH-PACKAGE-COUNTS — `payload/receipts/independent-support-structure.json` 48–54

Commit `LOCAL_OR_INDEPENDENT_RECORD`; blob `d96d7c7dd3efd4691a3c325518e9ee6c3845c348`; SHA256 integral `d2938337ccfad084d4e4e6c9d6ecd08c9b26701e86d69ca760601a93e76ca3eb`. Bytes fonte 58492; recorte [2291, 2437); SHA256 trecho `b6c971c8d036fbaa64558eaf8ec63da0e3ae65cb6abcf02fd6ee2a62ac549e05`.

`````text
{
    "name": "@orchestra/core",
    "version": "1.18.27",
    "exports_count": 437,
    "has_bare_export": false,
    "has_wildcard": false,
    
`````

### MECH-EXPORT-12 — `payload/receipts/independent-support-structure.json` 67–67

Commit `LOCAL_OR_INDEPENDENT_RECORD`; blob `d96d7c7dd3efd4691a3c325518e9ee6c3845c348`; SHA256 integral `d2938337ccfad084d4e4e6c9d6ecd08c9b26701e86d69ca760601a93e76ca3eb`. Bytes fonte 58492; recorte [2765, 2774); SHA256 trecho `566b42bf88aebb52d14a22b7be1e8cbc07b5d89be926255430fd8ade85149669`.

`````text
"./atlas"
`````

### MECH-EXPORT-97 — `payload/receipts/independent-support-structure.json` 152–152

Commit `LOCAL_OR_INDEPENDENT_RECORD`; blob `d96d7c7dd3efd4691a3c325518e9ee6c3845c348`; SHA256 integral `d2938337ccfad084d4e4e6c9d6ecd08c9b26701e86d69ca760601a93e76ca3eb`. Bytes fonte 58492; recorte [5889, 5919); SHA256 trecho `a92d57ad45933b5696d943f640045483c760fe796a77833228bfa58dc3ccce71`.

`````text
"./control-plane/move-session"
`````

### MECH-EXPORT-255 — `payload/receipts/independent-support-structure.json` 310–310

Commit `LOCAL_OR_INDEPENDENT_RECORD`; blob `d96d7c7dd3efd4691a3c325518e9ee6c3845c348`; SHA256 integral `d2938337ccfad084d4e4e6c9d6ecd08c9b26701e86d69ca760601a93e76ca3eb`. Bytes fonte 58492; recorte [11016, 11044); SHA256 trecho `700b1acd8b86f2e133571b12bc26801cf35d3a4befc7ca7ee97a239636bb3046`.

`````text
"./test/fixture/omni-expect"
`````

### MECH-EXPORT-256 — `payload/receipts/independent-support-structure.json` 311–311

Commit `LOCAL_OR_INDEPENDENT_RECORD`; blob `d96d7c7dd3efd4691a3c325518e9ee6c3845c348`; SHA256 integral `d2938337ccfad084d4e4e6c9d6ecd08c9b26701e86d69ca760601a93e76ca3eb`. Bytes fonte 58492; recorte [11052, 11071); SHA256 trecho `0e7760097df773d0f59eab0249d168ba644980003d4268690661656860f23693`.

`````text
"./test/lib/effect"
`````

### MECH-EXPORT-280 — `payload/receipts/independent-support-structure.json` 335–335

Commit `LOCAL_OR_INDEPENDENT_RECORD`; blob `d96d7c7dd3efd4691a3c325518e9ee6c3845c348`; SHA256 integral `d2938337ccfad084d4e4e6c9d6ecd08c9b26701e86d69ca760601a93e76ca3eb`. Bytes fonte 58492; recorte [11689, 11707); SHA256 trecho `b78925566634f6b1fc04211e36b1752be948cc84f2e3a6b18857ec1f3d81c683`.

`````text
"./rag-studio/sql"
`````

### MECH-EXPORT-283 — `payload/receipts/independent-support-structure.json` 338–338

Commit `LOCAL_OR_INDEPENDENT_RECORD`; blob `d96d7c7dd3efd4691a3c325518e9ee6c3845c348`; SHA256 integral `d2938337ccfad084d4e4e6c9d6ecd08c9b26701e86d69ca760601a93e76ca3eb`. Bytes fonte 58492; recorte [11766, 11775); SHA256 trecho `9da5a00e132467d5e4745a9bfc7381b6e9ff0777662fa09f566fd4633ef014bc`.

`````text
"./relay"
`````

### MECH-TAR-PACKAGE-JSON — `packages/core/vendor/hugr-lean-0.4.0-0660c2b5dc92.tgz!package/package.json` 1–83

Commit `1cde2ff7a71bcf7aecb5d030917b577165135d38`; blob `475fe00141815b216de7381815f39a7444bd670d`; SHA256 integral `eb1e4264a0ddc9a050fe30490415dc020f33d2bb7a3de73e768943ef499851fa`. Bytes fonte 2070; recorte [0, 2070); SHA256 trecho `eb1e4264a0ddc9a050fe30490415dc020f33d2bb7a3de73e768943ef499851fa`.

`````text
{
  "name": "hugr-lean",
  "version": "0.4.0",
  "description": "OpenCode plugin that summarizes large tool outputs before they reach the model, keeps failures whole and stores every original for exact recall",
  "keywords": [
    "opencode",
    "opencode-plugin",
    "plugin",
    "coding-agent",
    "llm",
    "context",
    "tokens",
    "tool-output",
    "summarize",
    "compression"
  ],
  "homepage": "https://github.com/gustavomhss/HuGR-Lean#readme",
  "bugs": {
    "url": "https://github.com/gustavomhss/HuGR-Lean/issues"
  },
  "repository": {
    "type": "git",
    "url": "git+https://github.com/gustavomhss/HuGR-Lean.git"
  },
  "license": "MIT",
  "type": "module",
  "engines": {
    "node": ">=22"
  },
  "files": [
    "dist",
    "README.md",
    "LICENSE",
    "NOTICE",
    "CHANGELOG.md",
    "SECURITY.md",
    "licenses",
    "docs/BENCHMARK_REAL.md",
    "fixtures/**/SOURCES.md"
  ],
  "exports": {
    ".": {
      "types": "./dist/index.d.ts",
      "import": "./dist/index.js"
    },
    "./server": {
      "types": "./dist/index.d.ts",
      "import": "./dist/index.js"
    },
    "./core": {
      "types": "./dist/core/index.d.ts",
      "import": "./dist/core/index.js"
    },
    "./raw": {
      "types": "./dist/raw/index.d.ts",
      "import": "./dist/raw/index.js"
    }
  },
  "bin": {
    "hugr-lean": "dist/cli/index.js"
  },
  "publishConfig": {
    "access": "public",
    "provenance": true
  },
  "scripts": {
    "build": "node scripts/build.mjs",
    "typecheck": "tsc --noEmit",
    "test": "tsx --test tests/*.test.ts",
    "structure": "node scripts/check-structure.mjs",
    "smoke": "node scripts/package-smoke.mjs",
    "benchmark": "node scripts/benchmark.mjs",
    "benchmark:real": "node scripts/real-world/run.mjs",
    "benchmark:real:host": "node scripts/real-world/host.mjs",
    "check": "npm run structure && npm run typecheck && npm test && npm run build",
    "prepack": "npm run build"
  },
  "devDependencies": {
    "@types/node": "^22.0.0",
    "tsx": "^4.20.0",
    "typescript": "^5.9.0"
  }
}
`````

### MECH-TAR-MEMBER-10 — `payload/receipts/independent-support-structure.json` 565–569

Commit `LOCAL_OR_INDEPENDENT_RECORD`; blob `d96d7c7dd3efd4691a3c325518e9ee6c3845c348`; SHA256 integral `d2938337ccfad084d4e4e6c9d6ecd08c9b26701e86d69ca760601a93e76ca3eb`. Bytes fonte 58492; recorte [18040, 18126); SHA256 trecho `4d35ea469d31e8f3956a25044cebcb24729ee2f1bba814c2b940effdb4a71820`.

`````text
{
        "name": "package/LICENSE",
        "size": 1066,
        "type": "0"
      }
`````

### MECH-TAR-MEMBER-11 — `payload/receipts/independent-support-structure.json` 570–574

Commit `LOCAL_OR_INDEPENDENT_RECORD`; blob `d96d7c7dd3efd4691a3c325518e9ee6c3845c348`; SHA256 integral `d2938337ccfad084d4e4e6c9d6ecd08c9b26701e86d69ca760601a93e76ca3eb`. Bytes fonte 58492; recorte [18134, 18219); SHA256 trecho `535239c0d2cf61549b216b9127682a045ad08823fcfc4d431abc8ad6967e3747`.

`````text
{
        "name": "package/NOTICE",
        "size": 2563,
        "type": "0"
      }
`````

### MECH-TAR-MEMBER-74 — `payload/receipts/independent-support-structure.json` 885–889

Commit `LOCAL_OR_INDEPENDENT_RECORD`; blob `d96d7c7dd3efd4691a3c325518e9ee6c3845c348`; SHA256 integral `d2938337ccfad084d4e4e6c9d6ecd08c9b26701e86d69ca760601a93e76ca3eb`. Bytes fonte 58492; recorte [25252, 25343); SHA256 trecho `5726bece13635057441358008cb822bb003a76e386f4f3215631acabb6b9669b`.

`````text
{
        "name": "package/package.json",
        "size": 2070,
        "type": "0"
      }
`````

### MECH-TAR-MEMBER-190 — `payload/receipts/independent-support-structure.json` 1465–1469

Commit `LOCAL_OR_INDEPENDENT_RECORD`; blob `d96d7c7dd3efd4691a3c325518e9ee6c3845c348`; SHA256 integral `d2938337ccfad084d4e4e6c9d6ecd08c9b26701e86d69ca760601a93e76ca3eb`. Bytes fonte 58492; recorte [38911, 39010); SHA256 trecho `0755b98ca00a706e013294337e3847634d56a783a1a8905ba94a577728d96340`.

`````text
{
        "name": "package/licenses/TRS-MIT.txt",
        "size": 1065,
        "type": "0"
      }
`````

SCIP `packages/core/test/fixture/scip-alias/core.scip`: strings ASCII apenas; nenhum decode semântico do protocolo. Os offsets abaixo referem-se ao binário capturado.

### MECH-SCIP-0-0 — `payload/receipts/independent-support-structure.json` 1490–1494

Commit `LOCAL_OR_INDEPENDENT_RECORD`; blob `d96d7c7dd3efd4691a3c325518e9ee6c3845c348`; SHA256 integral `d2938337ccfad084d4e4e6c9d6ecd08c9b26701e86d69ca760601a93e76ca3eb`. Bytes fonte 58492; recorte [41995, 42105); SHA256 trecho `727e67a7ad791b0f633e4ef3cdcfecc6d512d65db03f49abd0c947f81857288f`.

`````text
{
          "byte_start": 7,
          "byte_end_exclusive": 22,
          "text": "scip-typescript"
        }
`````

### MECH-SCIP-0-4 — `payload/receipts/independent-support-structure.json` 1510–1514

Commit `LOCAL_OR_INDEPENDENT_RECORD`; blob `d96d7c7dd3efd4691a3c325518e9ee6c3845c348`; SHA256 integral `d2938337ccfad084d4e4e6c9d6ecd08c9b26701e86d69ca760601a93e76ca3eb`. Bytes fonte 58492; recorte [42614, 42770); SHA256 trecho `8cc0785bb352f7e8685e9d8e56c76b9328fd511f2aeb471930c5e724ca06622a`.

`````text
{
          "byte_start": 219,
          "byte_end_exclusive": 277,
          "text": "9scip-typescript npm @orchestra/core 1.0.0 src/`greet.ts`/"
        }
`````

### MECH-SCIP-0-5 — `payload/receipts/independent-support-structure.json` 1515–1519

Commit `LOCAL_OR_INDEPENDENT_RECORD`; blob `d96d7c7dd3efd4691a3c325518e9ee6c3845c348`; SHA256 integral `d2938337ccfad084d4e4e6c9d6ecd08c9b26701e86d69ca760601a93e76ca3eb`. Bytes fonte 58492; recorte [42780, 42944); SHA256 trecho `044fe606d6af1237c8e4515c6dca344d3f0bdbb6f74d556a0fcfd063b56a4925`.

`````text
{
          "byte_start": 293,
          "byte_end_exclusive": 359,
          "text": "Ascip-typescript npm @orchestra/core 1.0.0 src/`greet.ts`/Greeter#"
        }
`````

### MECH-SCIP-0-6 — `payload/receipts/independent-support-structure.json` 1520–1524

Commit `LOCAL_OR_INDEPENDENT_RECORD`; blob `d96d7c7dd3efd4691a3c325518e9ee6c3845c348`; SHA256 integral `d2938337ccfad084d4e4e6c9d6ecd08c9b26701e86d69ca760601a93e76ca3eb`. Bytes fonte 58492; recorte [42954, 43126); SHA256 trecho `765711144183c39b510f3ab0c115759a081cae7aaa83dbdca31f934443f42f93`.

`````text
{
          "byte_start": 375,
          "byte_end_exclusive": 449,
          "text": "Iscip-typescript npm @orchestra/core 1.0.0 src/`greet.ts`/Greeter#greet()."
        }
`````

### MECH-SCIP-0-7 — `payload/receipts/independent-support-structure.json` 1525–1529

Commit `LOCAL_OR_INDEPENDENT_RECORD`; blob `d96d7c7dd3efd4691a3c325518e9ee6c3845c348`; SHA256 integral `d2938337ccfad084d4e4e6c9d6ecd08c9b26701e86d69ca760601a93e76ca3eb`. Bytes fonte 58492; recorte [43136, 43314); SHA256 trecho `eeb6bb8c3947ddc8195546a8d763431b48eb2580f100a6927544c5434bf956ab`.

`````text
{
          "byte_start": 459,
          "byte_end_exclusive": 539,
          "text": "Oscip-typescript npm @orchestra/core 1.0.0 src/`greet.ts`/Greeter#greet().(name)"
        }
`````

SCIP `packages/core/test/fixture/scip-alias/orchestra.scip`: strings ASCII apenas; nenhum decode semântico do protocolo. Os offsets abaixo referem-se ao binário capturado.

### MECH-SCIP-1-0 — `payload/receipts/independent-support-structure.json` 1642–1646

Commit `LOCAL_OR_INDEPENDENT_RECORD`; blob `d96d7c7dd3efd4691a3c325518e9ee6c3845c348`; SHA256 integral `d2938337ccfad084d4e4e6c9d6ecd08c9b26701e86d69ca760601a93e76ca3eb`. Bytes fonte 58492; recorte [46632, 46742); SHA256 trecho `727e67a7ad791b0f633e4ef3cdcfecc6d512d65db03f49abd0c947f81857288f`.

`````text
{
          "byte_start": 7,
          "byte_end_exclusive": 22,
          "text": "scip-typescript"
        }
`````

### MECH-SCIP-1-12 — `payload/receipts/independent-support-structure.json` 1702–1706

Commit `LOCAL_OR_INDEPENDENT_RECORD`; blob `d96d7c7dd3efd4691a3c325518e9ee6c3845c348`; SHA256 integral `d2938337ccfad084d4e4e6c9d6ecd08c9b26701e86d69ca760601a93e76ca3eb`. Bytes fonte 58492; recorte [48420, 48529); SHA256 trecho `d5547df43296bddb6f0e17d0d9424dfccb95e06815e15f9b8d04c9f88534abf6`.

`````text
{
          "byte_start": 570,
          "byte_end_exclusive": 581,
          "text": "src/main.ts"
        }
`````

### MECH-SCIP-1-16 — `payload/receipts/independent-support-structure.json` 1722–1726

Commit `LOCAL_OR_INDEPENDENT_RECORD`; blob `d96d7c7dd3efd4691a3c325518e9ee6c3845c348`; SHA256 integral `d2938337ccfad084d4e4e6c9d6ecd08c9b26701e86d69ca760601a93e76ca3eb`. Bytes fonte 58492; recorte [49035, 49199); SHA256 trecho `7a146851edc5450b8f855e55b28d3c72b9897de6b744a4ed0aa78b4da03e41aa`.

`````text
{
          "byte_start": 793,
          "byte_end_exclusive": 859,
          "text": "Ascip-typescript npm @orchestra/core 1.0.0 src/`greet.ts`/greet()."
        }
`````

### MECH-SCIP-1-17 — `payload/receipts/independent-support-structure.json` 1727–1731

Commit `LOCAL_OR_INDEPENDENT_RECORD`; blob `d96d7c7dd3efd4691a3c325518e9ee6c3845c348`; SHA256 integral `d2938337ccfad084d4e4e6c9d6ecd08c9b26701e86d69ca760601a93e76ca3eb`. Bytes fonte 58492; recorte [49209, 49373); SHA256 trecho `da7135d2a79aeae58e57c90054f6e432ecdf268a503b23ddda8d768626a84739`.

`````text
{
          "byte_start": 867,
          "byte_end_exclusive": 933,
          "text": "Ascip-typescript npm @orchestra/core 1.0.0 src/`greet.ts`/Greeter#"
        }
`````

### MECH-SCIP-1-18 — `payload/receipts/independent-support-structure.json` 1732–1736

Commit `LOCAL_OR_INDEPENDENT_RECORD`; blob `d96d7c7dd3efd4691a3c325518e9ee6c3845c348`; SHA256 integral `d2938337ccfad084d4e4e6c9d6ecd08c9b26701e86d69ca760601a93e76ca3eb`. Bytes fonte 58492; recorte [49383, 49539); SHA256 trecho `6374a49eb049c92e00acb92ee32d2d03ccf3028934e6d941f053c48e88709640`.

`````text
{
          "byte_start": 941,
          "byte_end_exclusive": 999,
          "text": "9scip-typescript npm @orchestra/core 1.0.0 src/`greet.ts`/"
        }
`````

## RE-SUP-02 — Geradores/configuração: implementação e limites, sem execução


### CFG-TS-1 — `packages/core/tsconfig.json` 1–8

Commit `1cde2ff7a71bcf7aecb5d030917b577165135d38`; blob `636b03034ffbcd5ea02d8f1f7d450a7bb359a236`; SHA256 integral `dd131865c7f2df85b08afdbcf4b8bef3695febe658d56ee4c156e83b95cabc6a`. Bytes fonte 234; recorte [0, 234); SHA256 trecho `dd131865c7f2df85b08afdbcf4b8bef3695febe658d56ee4c156e83b95cabc6a`.

`````text
{
  "$schema": "https://json.schemastore.org/tsconfig",
  "extends": "@tsconfig/bun/tsconfig.json",
  "compilerOptions": {
    "lib": ["ESNext", "DOM", "DOM.Iterable", "DOM.AsyncIterable"],
    "noUncheckedIndexedAccess": false
  }
}
`````

### CFG-DRIZZLE-1 — `packages/core/drizzle.config.ts` 1–10

Commit `1cde2ff7a71bcf7aecb5d030917b577165135d38`; blob `f574118fbf1656f8f00e5f2612f38f2fdb69587e`; SHA256 integral `d40ef20b1a875f46b172b7d2a04994f3b41c88c3d38bc4aedd1af63e775cd1ed`. Bytes fonte 256; recorte [0, 256); SHA256 trecho `d40ef20b1a875f46b172b7d2a04994f3b41c88c3d38bc4aedd1af63e775cd1ed`.

`````text
import { defineConfig } from "drizzle-kit"

export default defineConfig({
  dialect: "sqlite",
  schema: ["./src/**/*.sql.ts", "./src/**/sql.ts"],
  out: "./migration",
  dbCredentials: {
    url: "/home/thdxr/.local/share/orchestra/orchestra.db",
  },
})
`````

### GEN-PTY-1 — `packages/core/script/fix-node-pty.ts` 1–28

Commit `1cde2ff7a71bcf7aecb5d030917b577165135d38`; blob `93641adbdf3c873a088ab145279f75acacf3e872`; SHA256 integral `f5488e74cf12b343852847769d85860f8e24ee2bbb3e34e62deb4fef1a0576ad`. Bytes fonte 986; recorte [0, 986); SHA256 trecho `f5488e74cf12b343852847769d85860f8e24ee2bbb3e34e62deb4fef1a0576ad`.

`````text
#!/usr/bin/env bun

import fs from "fs/promises"
import path from "path"
import { fileURLToPath } from "url"

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const dir = path.resolve(__dirname, "..")

if (process.platform !== "win32") {
  const root = path.join(dir, "node_modules", "node-pty", "prebuilds")
  const dirs = await fs.readdir(root, { withFileTypes: true }).catch(() => [])
  const files = dirs.filter((x) => x.isDirectory()).map((x) => path.join(root, x.name, "spawn-helper"))
  const result = await Promise.all(
    files.map(async (file) => {
      const stat = await fs.stat(file).catch(() => undefined)
      if (!stat) return
      if ((stat.mode & 0o111) === 0o111) return
      await fs.chmod(file, stat.mode | 0o755)
      return file
    }),
  )
  const fixed = result.filter(Boolean)
  if (fixed.length) {
    console.log(`fixed node-pty permissions for ${fixed.length} helper${fixed.length === 1 ? "" : "s"}`)
  }
}
`````

### GEN-MIG-1 — `packages/core/script/migration.ts` 1–36

Commit `1cde2ff7a71bcf7aecb5d030917b577165135d38`; blob `e0d10349f7352be10dda179324fc39a7dbbe1ba7`; SHA256 integral `256a4dd869d0d482986e8ff44b02a377053389eeee034f944deca2deeaaddcc7`. Bytes fonte 6720; recorte [0, 1068); SHA256 trecho `bda65331c758c0c4b0325ee674455993b38242bc5ee49e533f89eee2a039e6da`.

`````text
#!/usr/bin/env bun

import { $ } from "bun"
import fs from "fs/promises"
import os from "os"
import path from "path"
import { pathToFileURL } from "url"
import { parseArgs } from "util"

const root = path.resolve(import.meta.dirname, "../../..")
const snapshot = path.join(root, "packages/core/schema.json")
const tsDir = path.join(root, "packages/core/src/database/migration")
const registry = path.join(root, "packages/core/src/database/migration.gen.ts")
const schema = path.join(root, "packages/core/src/database/schema.gen.ts")
const args = parseArgs({
  args: process.argv.slice(2),
  options: {
    check: { type: "boolean" },
    name: { type: "string" },
  },
})

if (args.values.check) {
  await check()
  process.exit(0)
}

await generate()

async function generate() {
  const temporary = await fs.mkdtemp(path.join(os.tmpdir(), "orchestra-core-migration-"))
  const incremental = path.join(temporary, "incremental")
  const full = path.join(temporary, "full")
  try {
    await fs.mkdir(incremental)
    await fs.mkdir(path.join(incremental, "baseline"))
`````

### GEN-MIG-2 — `packages/core/script/migration.ts` 59–70

Commit `1cde2ff7a71bcf7aecb5d030917b577165135d38`; blob `e0d10349f7352be10dda179324fc39a7dbbe1ba7`; SHA256 integral `256a4dd869d0d482986e8ff44b02a377053389eeee034f944deca2deeaaddcc7`. Bytes fonte 6720; recorte [2128, 2528); SHA256 trecho `0bda64a09c2debaa5a157036d6247e8908576fc0f8d49a8b24e01bf8356d50ce`.

`````text
  } finally {
    await fs.rm(temporary, { recursive: true, force: true })
  }
}

async function check() {
  const temporary = await fs.mkdtemp(path.join(os.tmpdir(), "orchestra-core-migration-check-"))
  const incremental = path.join(temporary, "incremental")
  const full = path.join(temporary, "full")
  try {
    await fs.mkdir(incremental)
    await fs.mkdir(path.join(incremental, "baseline"))
`````

### GEN-MIG-3 — `packages/core/script/migration.ts` 89–126

Commit `1cde2ff7a71bcf7aecb5d030917b577165135d38`; blob `e0d10349f7352be10dda179324fc39a7dbbe1ba7`; SHA256 integral `256a4dd869d0d482986e8ff44b02a377053389eeee034f944deca2deeaaddcc7`. Bytes fonte 6720; recorte [3434, 4755); SHA256 trecho `6beadc83d9d2e0c5d4f8139b5a169d74cdf0fae616d46064b98a0cfe609a2205`.

`````text
  } finally {
    await fs.rm(temporary, { recursive: true, force: true })
  }
}

async function drizzle(temporary: string, output: string, name?: string) {
  const config = path.join(temporary, `${path.basename(output)}.config.ts`)
  await Bun.write(
    config,
    `import config from ${JSON.stringify(pathToFileURL(path.join(root, "packages/core/drizzle.config.ts")).href)}

export default { ...config, out: ${JSON.stringify(output)} }
`,
  )
  await $`bun drizzle-kit generate --config ${config} ${name ? ["--name", name] : []}`.cwd(
    path.join(root, "packages/core"),
  )
}

async function generatedMigrations(directory: string) {
  return (await Array.fromAsync(new Bun.Glob("*/migration.sql").scan({ cwd: directory })))
    .map((file) => file.split("/")[0])
    .filter((name): name is string => name !== undefined)
    .sort()
}

async function generatedSql(directory: string) {
  const generated = await generatedMigrations(directory)
  if (generated.length !== 1) throw new Error(`Expected one full schema migration, found ${generated.length}.`)
  return Bun.file(path.join(directory, generated[0]!, "migration.sql")).text()
}

async function typescriptMigrations() {
  return (await Array.fromAsync(new Bun.Glob("*.ts").scan({ cwd: tsDir })))
    .map((file) => path.basename(file, ".ts"))
    .sort()
}

`````

### GEN-MIG-4 — `packages/core/script/migration.ts` 171–196

Commit `1cde2ff7a71bcf7aecb5d030917b577165135d38`; blob `e0d10349f7352be10dda179324fc39a7dbbe1ba7`; SHA256 integral `256a4dd869d0d482986e8ff44b02a377053389eeee034f944deca2deeaaddcc7`. Bytes fonte 6720; recorte [5906, 6720); SHA256 trecho `82e2483bc835dcb21980dc8f8b047a88aed9b25632c73ca0d74c057b262360f1`.

`````text
function escapeTemplate(line: string) {
  return line.replaceAll("\\", "\\\\").replaceAll("`", "\\`").replaceAll("${", "\\${")
}

async function formatTypescript(input: string) {
  const prettier = await import("prettier")
  const typescript = await import("prettier/plugins/typescript")
  const estree = await import("prettier/plugins/estree")
  return prettier.format(input, {
    parser: "typescript",
    plugins: [typescript.default, estree.default],
    semi: false,
    printWidth: 120,
  })
}

function renderRegistry(names: string[]) {
  return `import type { DatabaseMigration } from "./migration"

export const migrations = (
  await Promise.all([
${names.map((name) => `    import("./migration/${name}"),`).join("\n")}
  ])
).map((module) => module.default) satisfies DatabaseMigration.Migration[]
`
}
`````

### GEN-PACK-1 — `packages/core/script/toolkit-pack.ts` 26–149

Commit `1cde2ff7a71bcf7aecb5d030917b577165135d38`; blob `c77e95e4fa8228bea806a29f66ed4d28c6abeac3`; SHA256 integral `cc01627f1823cd53a45f3d4a1b87fbef9de1349440dec721ccc1dd036286a308`. Bytes fonte 16119; recorte [1731, 7554); SHA256 trecho `dfa49d08dd5689b774f7d2ac77fcefd423617c95408b91958ae84fd98201db15`.

`````text
const PACKS = path.join(import.meta.dir, "../src/backend-toolkit/packs")
const RECIPES = path.join(import.meta.dir, "../../../modules/specialists/backend/skills/backend-codegen")
const SKILLS = (await readdir(path.resolve(import.meta.dir, "../../../modules/specialists/backend/skills"), { withFileTypes: true }))
  .filter((entry) => entry.isDirectory()).map((entry) => entry.name).toSorted()
if (SKILLS.length === 0) throw new Error("No packaged backend entry skills")
await Promise.all(SKILLS.map(async (name) => {
  if (!/^backend-[a-z]+(?:-[a-z]+)*$/.test(name)) throw new Error(`Invalid backend entry skill directory: ${name}`)
  const skill = matter(await readFile(path.resolve(import.meta.dir, "../../../modules/specialists/backend/skills", name, "SKILL.md"), "utf8"))
  if (skill.data.name !== name) throw new Error(`Backend entry skill name mismatch: ${name}`)
}))

const args = parseArgs({
  args: process.argv.slice(2),
  allowPositionals: true,
  options: {
    kind: { type: "string" },
    upstream: { type: "string" },
    version: { type: "string" },
    asset: { type: "string", multiple: true },
    role: { type: "string" },
    input: { type: "string" },
    skill: { type: "string", multiple: true },
    group: { type: "string" },
  },
})
const [command, id, bumped] = args.positionals

const valid =
  command === "skills" ||
  (id && command === "add" && args.values.kind && args.values.upstream && args.values.version && args.values.group) ||
  (id && command === "bump" && bumped)
if (!valid) {
  console.error("usage: see the header of script/toolkit-pack.ts")
  process.exit(1)
}
(args.values.skill ?? []).forEach((skill) => {
  if (!SKILLS.includes(skill)) throw new Error(`Unknown backend entry skill: ${skill}`)
})
await writeFile(path.resolve(import.meta.dir, "../src/backend-toolkit/entry-skills.gen.ts"), [
  "// Generated from modules/specialists/backend/skills by script/toolkit-pack.ts skills.",
  "export const ENTRY_SKILLS = [",
  ...SKILLS.map((skill) => `  ${JSON.stringify(skill)},`),
  "] as const",
  "",
].join("\n"))
if (command === "skills") process.exit(0)
if (command === "add") await add(id)
if (command === "bump") await bump(id, bumped!)

async function add(id: string) {
  const kind = args.values.kind!
  const upstream = args.values.upstream!
  const version = args.values.version!
  const fit = {
    role: args.values.role ?? "generator",
    input: args.values.input ?? "TODO-PIN",
    skills: args.values.skill ?? [],
  }
  const body = await template(id, kind, upstream, version)
  await writeFile(
    path.join(PACKS, `${id}.ts`),
    [
      `import type { Pack } from "../manifest"`,
      ...(kind === "npm" ? [`import lock from "./${id}.package-lock.json"`] : []),
      "",
      `const VERSION = "${version}"`,
      "",
      "export default {",
      `  id: "${id}",`,
      "  version: VERSION,",
      body,
      `  fit: { role: ${JSON.stringify(fit.role)}, input: ${JSON.stringify(fit.input)}, skills: ${JSON.stringify(fit.skills)} },`,
      "} as const satisfies Pack",
      "",
    ].join("\n"),
  )
  const group = args.values.group!
  if (!(await Bun.file(path.join(RECIPES, group, "SKILL.md")).exists())) throw new Error(`Unknown codegen group: ${group}`)
  await mkdir(path.join(RECIPES, group, id), { recursive: true })
  await writeFile(path.join(RECIPES, group, id, "SKILL.md"), recipe(id, version, group, fit))
  const name = id.replace(/-([a-z0-9])/g, (_, letter: string) => letter.toUpperCase())
  const barrel = await readFile(path.join(PACKS, "index.ts"), "utf8")
  const imports = [...barrel.matchAll(/^import .*$/gm)].map((match) => match[0])
  await writeFile(
    path.join(PACKS, "index.ts"),
    barrel
      .replace(imports.join("\n"), [...imports, `import ${name} from "./${id}"`].toSorted().join("\n"))
      .replace(/\n}\n*$/, `\n  [${name}.id]: ${name},\n}\n`),
  )
  console.log(`wrote packs/${id}.ts, backend-codegen/${group}/${id}/SKILL.md and the barrel entry; fill every TODO-PIN`)
}

async function bump(id: string, version: string) {
  const file = path.join(PACKS, `${id}.ts`)
  const pack: Pack = (await import(file)).default
  const old = pack.version
  const text = (await readFile(file, "utf8")).replaceAll(`"${old}"`, `"${version}"`)
  const pins = "targets" in pack ? Object.values(pack.targets).map((pin) => pin.artifact) : []
  const filled = await Promise.all(
    pins.map(async (artifact) => ({
      from: artifact.integrity,
      to: await digest(artifact.url.replaceAll(old, version), version),
    })),
  )
  const npm = !("targets" in pack) && pack.install.kind === "npm"
  // A pin this script cannot refresh is cleared, so the old digest can never pass for the new version.
  const next = filled.length
    ? filled.reduce((current, pin) => current.replaceAll(pin.from, pin.to), text)
    : npm
      ? text
      : `// TODO-PIN: refresh every pin for ${version}.\n` +
        text.replace(/"sha(256|512)-[A-Za-z0-9+/=]+"/g, '"sha256-TODO-PIN"')
  await writeFile(file, next)
  if (npm) await lock(id, packageName(pack), version)
  const card = [...new Bun.Glob(`*/${id}/SKILL.md`).scanSync(RECIPES)].map((match) => path.join(RECIPES, match))[0]
  if (card && pack.fit.skills.length)
    await writeFile(card, (await readFile(card, "utf8")).replaceAll(`\`${old}\``, `\`${version}\``))
  console.log(`bumped ${id} ${old} -> ${version}; review the diff and fill any TODO-PIN`)
  // The recorded host floor (F5.4) belongs to the bytes just pinned, so it is measured again unless a pin is still open.
  if (!next.includes("TODO-PIN")) {
    const floors = await $`bun ${path.join(import.meta.dir, "toolkit-floors.ts")} --engine ${id} --check`.nothrow()
    if (floors.exitCode) console.error(`update ${id}'s \`floor\` to the measurement above (bun script/toolkit-floors.ts --engine ${id})`)
  }
}
`````

### GEN-PACK-2 — `packages/core/script/toolkit-pack.ts` 151–246

Commit `1cde2ff7a71bcf7aecb5d030917b577165135d38`; blob `c77e95e4fa8228bea806a29f66ed4d28c6abeac3`; SHA256 integral `cc01627f1823cd53a45f3d4a1b87fbef9de1349440dec721ccc1dd036286a308`. Bytes fonte 16119; recorte [7555, 11966); SHA256 trecho `2b09d53dab923175fbed77220b494bb04b59c237b6c67e56bb9b2c5d6a3648fa`.

`````text
async function template(id: string, kind: string, upstream: string, version: string) {
  const at = (text: string) => text.replaceAll(version, "${VERSION}")
  if (kind === "binary") {
    const release = await github(upstream, version)
    const globs = new Map((args.values.asset ?? []).map((pair) => pair.split("=", 2) as [string, string]))
    const repo = (await fetch(`https://api.github.com/repos/${upstream}`, { headers: auth() }).then((response) =>
      response.json(),
    )) as { license?: { spdx_id?: string } }
    const targets = TARGETS.map((target) => {
      const glob = globs.get(target)
      const asset = glob ? release.assets.find((item) => new Bun.Glob(glob).match(item.name)) : undefined
      const exe = target === "win32-x64" ? `${id}.exe` : id
      const format = asset?.name.endsWith(".zip")
        ? "zip"
        : /\.(tar\.gz|tgz)$/.test(asset?.name ?? "")
          ? "tar.gz"
          : "raw"
      return [
        `    "${target}": {`,
        "      artifact: {",
        `        url: \`${asset ? at(asset.browser_download_url) : "https://github.com/TODO-PIN"}\`,`,
        `        integrity: "${asset?.digest ? sri(asset.digest) : "sha256-TODO-PIN"}",`,
        `        format: "${format}",`,
        `        entries: [{ from: "${format === "raw" ? (asset?.name ?? exe) : exe}", to: "${exe}", executable: true }],`,
        "      },",
        `      executable: "${exe}",`,
        "    },",
      ].join("\n")
    })
    return [
      `  license: "${repo.license?.spdx_id ?? "TODO-PIN"}",`,
      `  upstream: "${upstream}",`,
      "  // Asset digests from the GitHub release API; check each entry layout against a downloaded sample.",
      "  targets: {",
      ...targets,
      "  },",
    ].join("\n")
  }
  if (kind === "npm") {
    const meta = (await fetch(`https://registry.npmjs.org/${upstream}/${version}`).then((response) =>
      response.json(),
    )) as NpmVersion
    const bin = typeof meta.bin === "string" ? meta.bin : Object.values(meta.bin ?? {})[0]
    await lock(id, upstream, version)
    return [
      `  license: "${meta.license ?? "TODO-PIN"}",`,
      `  upstream: "${meta.repository?.url?.match(/github\.com[/:]([^/]+\/[^/.]+)/)?.[1] ?? "TODO-PIN"}",`,
      '  runtime: "node",',
      "  install: {",
      '    kind: "npm",',
      `    packageJson: JSON.stringify({ name: "backend-toolkit-${id}", private: true, dependencies: { "${upstream}": VERSION } }, null, 2) + "\\n",`,
      '    lock: JSON.stringify(lock, null, 2) + "\\n",',
      "  },",
      `  launch: ["{install}/node_modules/${upstream}/${String(bin ?? "TODO-PIN").replace(/^\.\//, "")}"],`,
    ].join("\n")
  }
  const install = {
    pip: [
      '  runtime: "python",',
      `  install: { kind: "pip", requirements: \`${upstream}==\${VERSION} --hash=sha256:TODO-PIN\\n\` },`,
      '  launch: ["-m", "TODO-PIN"],',
      '  env: { PYTHONPATH: "{install}", PYTHONSAFEPATH: "1", PYTHONNOUSERSITE: "1" },',
    ],
    jar: [
      '  runtime: "java",',
      "  install: {",
      '    kind: "jar",',
      `    artifact: { url: \`https://repo1.maven.org/maven2/TODO-PIN/\${VERSION}/${id}-\${VERSION}.jar\`, integrity: "sha256-TODO-PIN", format: "raw", entries: [{ from: \`${id}-\${VERSION}.jar\`, to: "${id}.jar" }] },`,
      "  },",
      `  launch: ["-jar", "{install}/${id}.jar"],`,
    ],
    "go-source": [
      '  runtime: "go",',
      "  install: {",
      '    kind: "source",',
      `    artifact: { url: \`https://proxy.golang.org/github.com/${upstream.toLowerCase()}/@v/v\${VERSION}.zip\`, integrity: "sha256-TODO-PIN", format: "zip", entries: [{ from: "TODO-PIN", to: "src/TODO-PIN" }] },`,
      `    build: "go",`,
      '    path: "./cmd/TODO-PIN",',
      `    binary: "${id}",`,
      "  },",
      "  launch: [],",
    ],
    "cargo-source": [
      '  runtime: "rust",',
      "  install: {",
      '    kind: "source",',
      `    artifact: { url: \`https://static.crates.io/crates/${id}/${id}-\${VERSION}.crate\`, integrity: "sha256-TODO-PIN", format: "tar.gz", entries: [{ from: "TODO-PIN", to: "src/TODO-PIN" }] },`,
      `    build: "cargo",`,
      '    path: ".",',
      `    binary: "${id}",`,
      "  },",
      "  launch: [],",
    ],
  }[kind]
  if (!install) throw new Error(`unknown kind ${kind}`)
  return ['  license: "TODO-PIN",', `  upstream: "${kind === "pip" ? "TODO-PIN" : upstream}",`, ...install].join("\n")
`````

### GEN-PACK-3 — `packages/core/script/toolkit-pack.ts` 249–342

Commit `1cde2ff7a71bcf7aecb5d030917b577165135d38`; blob `c77e95e4fa8228bea806a29f66ed4d28c6abeac3`; SHA256 integral `cc01627f1823cd53a45f3d4a1b87fbef9de1349440dec721ccc1dd036286a308`. Bytes fonte 16119; recorte [11969, 15582); SHA256 trecho `df62580a283036252c19c970cf58d59c33647d734acf4eb0a532eed984be4070`.

`````text
/** The SRI digest of one pinned download, from its GitHub release or the npm registry; TODO-PIN for any other host. */
async function digest(url: string, version: string) {
  const parsed = new URL(url)
  const release = parsed.pathname.match(/^\/([^/]+\/[^/]+)\/releases\/download\/[^/]+\/(.+)$/)
  if (parsed.hostname === "github.com" && release) {
    const asset = (await github(release[1], version)).assets.find(
      (item) => item.name === decodeURIComponent(release[2]),
    )
    return asset?.digest ? sri(asset.digest) : "sha256-TODO-PIN"
  }
  const tarball = parsed.pathname.match(/^\/((?:@[^/]+\/)?[^/]+)\/-\//)
  if (parsed.hostname === "registry.npmjs.org" && tarball) {
    const meta = (await fetch(`https://registry.npmjs.org/${tarball[1]}/${version}`).then((response) =>
      response.json(),
    )) as NpmVersion
    return meta.dist?.integrity ?? "sha256-TODO-PIN"
  }
  return "sha256-TODO-PIN"
}

async function github(repo: string, version: string) {
  const tagged = await fetch(`https://api.github.com/repos/${repo}/releases/tags/v${version}`, { headers: auth() })
  if (tagged.ok) return (await tagged.json()) as Release
  const bare = await fetch(`https://api.github.com/repos/${repo}/releases/tags/${version}`, { headers: auth() })
  if (bare.ok) return (await bare.json()) as Release
  return { assets: [] } satisfies Release
}

/** The engine's lock, written by npm from the exact package.json the pack installs. */
async function lock(id: string, name: string, version: string) {
  const dir = await mkdtemp(path.join(os.tmpdir(), "toolkit-pack-"))
  const manifest = JSON.stringify(
    { name: `backend-toolkit-${id}`, private: true, dependencies: { [name]: version } },
    null,
    2,
  )
  await writeFile(path.join(dir, "package.json"), manifest + "\n")
  const result = await $`npm install --package-lock-only --ignore-scripts --no-audit --no-fund`
    .cwd(dir)
    .nothrow()
    .quiet()
  const text =
    result.exitCode === 0
      ? await readFile(path.join(dir, "package-lock.json"), "utf8")
      : '{ "TODO-PIN": "npm failed" }\n'
  await writeFile(path.join(PACKS, `${id}.package-lock.json`), text)
  await rm(dir, { recursive: true, force: true })
}

function packageName(pack: Pack) {
  if ("targets" in pack || pack.install.kind !== "npm") return pack.id
  return Object.keys(JSON.parse(pack.install.packageJson).dependencies)[0]
}

function recipe(id: string, version: string, group: string, fit: { role: string; input: string }) {
  return [
    "---",
    `name: backend-codegen-${group}-${id}`,
    `description: "${id}: ${fit.role}; input: ${fit.input}."`,
    `when: "TODO-PIN: the packet assigns this engine's artifacts."`,
    `not-when: "TODO-PIN"`,
    "---",
    "",
    `# ${id}`,
    "",
    "## Applicability",
    "",
    `TODO-PIN: when the packet assigns this engine's artifacts. The engine is ${id} \`${version}\`, provided by the host and run only as \`"$BACKEND_TOOLKIT_BIN/${id}"\`.`,
    "",
    "## Non-trigger",
    "",
    "- TODO-PIN",
    "",
    "## Inputs",
    "",
    "- TODO-PIN",
    "",
    "## Steps",
    "",
    "1. TODO-PIN:",
    "   ```sh",
    `   "$BACKEND_TOOLKIT_BIN/${id}" <args>`,
    "   ```",
    "",
    "## Tools and outputs",
    "",
    "- The host fetches the engine on first use; the seat's shell has no network. Never install, download or substitute it.",
    "- When the shell output reports `toolkit-not-ready:...` or `unsupported-target:...`, stop and return a `tool` blocker whose code is that text verbatim.",
    "",
    "## Limits and checks",
    "",
    "- TODO-PIN",
    "",
  ].join("\n")
`````

### GEN-FLOOR-1 — `packages/core/script/toolkit-floors.ts` 35–119

Commit `1cde2ff7a71bcf7aecb5d030917b577165135d38`; blob `bcb3e1f747870448172525b1b402ca3310ecf2f0`; SHA256 integral `fe962720c76ab7cc5a84c98cd373f73ec5baaf6f951b111df87d7883e2b8b424`. Bytes fonte 18151; recorte [2202, 6477); SHA256 trecho `f2949c75bea1c528749334172756e83b669f1d69358b94ff8082bd8f7c5791af`.

`````text
/** Win32 functions that a binary imports unconditionally, with the Windows 10 build that introduced each. */
const NEWER_WINDOWS: Readonly<Record<string, string>> = {
  SetThreadDescription: "10.0.14393",
  GetThreadDescription: "10.0.14393",
  CreatePseudoConsole: "10.0.17763",
  ResizePseudoConsole: "10.0.17763",
  ClosePseudoConsole: "10.0.17763",
}

const higher = (a: string | undefined, b: string | undefined) => (!a || (b && compareVersions(b, a) > 0) ? b : a)

export function scan(file: string, bytes: Buffer): Finding | undefined {
  if (bytes.length < 64) return
  if (bytes.readUInt32BE(0) === 0x7f454c46) return elf(file, bytes)
  const magic = bytes.readUInt32LE(0)
  if (magic === 0xfeedfacf) return macho(file, [bytes])
  // Java class files share the fat magic; a fat header's slices are real Mach-O images.
  if (bytes.readUInt32BE(0) === 0xcafebabe && bytes.readUInt32BE(4) < 16) {
    const slices = Array.from({ length: bytes.readUInt32BE(4) }, (_, index) => {
      const offset = bytes.readUInt32BE(16 + index * 20)
      const size = bytes.readUInt32BE(20 + index * 20)
      return bytes.subarray(offset, offset + size)
    })
    return slices.every((slice) => slice.length > 32 && slice.readUInt32LE(0) === 0xfeedfacf) ? macho(file, slices) : undefined
  }
  if (bytes.readUInt16LE(0) === 0x5a4d) return pe(file, bytes)
}

function version(value: string, prefix: string) {
  return value.startsWith(prefix) ? value.slice(prefix.length) : undefined
}

function elf(file: string, bytes: Buffer): Finding | undefined {
  // The toolkit targets are all 64-bit little-endian.
  if (bytes[4] !== 2 || bytes[5] !== 1) return
  const strings = (offset: number) => bytes.toString("utf8", offset, bytes.indexOf(0, offset))
  const phoff = Number(bytes.readBigUInt64LE(0x20))
  const interpreter = Array.from({ length: bytes.readUInt16LE(0x38) }, (_, index) => phoff + index * bytes.readUInt16LE(0x36))
    .filter((offset) => bytes.readUInt32LE(offset) === 3)
    .map((offset) => strings(Number(bytes.readBigUInt64LE(offset + 8))))[0]
  const shoff = Number(bytes.readBigUInt64LE(0x28))
  const sections = Array.from({ length: bytes.readUInt16LE(0x3c) }, (_, index) => {
    const offset = shoff + index * bytes.readUInt16LE(0x3a)
    return {
      type: bytes.readUInt32LE(offset + 4),
      offset: Number(bytes.readBigUInt64LE(offset + 0x18)),
      size: Number(bytes.readBigUInt64LE(offset + 0x20)),
      link: bytes.readUInt32LE(offset + 0x28),
      info: bytes.readUInt32LE(offset + 0x2c),
    }
  })
  const highest: Record<string, string | undefined> = {}
  for (const section of sections.filter((item) => item.type === 0x6ffffffe)) {
    const names = sections[section.link]?.offset ?? 0
    let need = section.offset
    for (let index = 0; index < section.info; index++) {
      const count = bytes.readUInt16LE(need + 2)
      let aux = need + bytes.readUInt32LE(need + 8)
      for (let item = 0; item < count; item++) {
        const name = strings(names + bytes.readUInt32LE(aux + 8))
        const key = name.split("_")[0]
        const number = name.split("_").slice(1).join("_")
        // GLIBC_PRIVATE and the like are not versions.
        if (/^\d/.test(number)) highest[key] = higher(highest[key], number)
        aux += bytes.readUInt32LE(aux + 12)
      }
      need += bytes.readUInt32LE(need + 12)
    }
  }
  const needed = sections
    .filter((item) => item.type === 6)
    .flatMap((dynamic) =>
      Array.from({ length: dynamic.size / 16 }, (_, index) => dynamic.offset + index * 16)
        .filter((offset) => bytes.readBigUInt64LE(offset) === 1n)
        .map((offset) => strings((sections[dynamic.link]?.offset ?? 0) + Number(bytes.readBigUInt64LE(offset + 8)))),
    )
  const notes = [
    ...(interpreter?.includes("musl") ? ["musl"] : []),
    ...(!interpreter && !needed.length ? ["static"] : []),
    ...(highest.GLIBCXX ? [`GLIBCXX ${highest.GLIBCXX}`] : []),
    ...(highest.CXXABI ? [`CXXABI ${highest.CXXABI}`] : []),
    ...(highest.GCC ? [`GCC ${highest.GCC}`] : []),
    ...(needed.some((name) => name.startsWith("libstdc++")) ? [] : highest.GLIBCXX ? ["libstdc++ symbols without libstdc++.so"] : []),
  ]
  return { file, format: "elf", needs: highest.GLIBC ? { glibc: highest.GLIBC } : {}, notes }
`````

### GEN-FLOOR-2 — `packages/core/script/toolkit-floors.ts` 122–186

Commit `1cde2ff7a71bcf7aecb5d030917b577165135d38`; blob `bcb3e1f747870448172525b1b402ca3310ecf2f0`; SHA256 integral `fe962720c76ab7cc5a84c98cd373f73ec5baaf6f951b111df87d7883e2b8b424`. Bytes fonte 18151; recorte [6480, 9918); SHA256 trecho `3fe53f5afb8d140fd28811b0ef9f55d875e686310126224d0dfbe85c2d5bafcd`.

`````text
function macho(file: string, slices: ReadonlyArray<Buffer>): Finding {
  const found = slices.map((slice) => {
    const arch = slice.readUInt32LE(4) === 0x0100000c ? "arm64" : slice.readUInt32LE(4) === 0x01000007 ? "x86_64" : "other"
    let offset = 32
    let minos: string | undefined
    for (let command = 0; command < slice.readUInt32LE(16); command++) {
      const kind = slice.readUInt32LE(offset)
      // LC_BUILD_VERSION: platform 1 is macOS; LC_VERSION_MIN_MACOSX carries the version alone.
      if (kind === 0x32 && slice.readUInt32LE(offset + 8) === 1) minos = packed(slice.readUInt32LE(offset + 12))
      if (kind === 0x24) minos = packed(slice.readUInt32LE(offset + 8))
      offset += slice.readUInt32LE(offset + 4)
    }
    return { arch, minos }
  })
  const highest = found.reduce<string | undefined>((all, item) => higher(all, item.minos), undefined)
  return {
    file,
    format: "macho",
    needs: highest ? { macos: highest } : {},
    notes: found.map((item) => `${item.arch} ${item.minos ?? "no-version"}`),
  }
}

// X.Y.Z packed as xxxx.yy.zz
const packed = (value: number) => `${value >> 16}.${(value >> 8) & 0xff}`

function pe(file: string, bytes: Buffer): Finding | undefined {
  const header = bytes.readUInt32LE(0x3c)
  if (header + 0x100 > bytes.length || bytes.readUInt32LE(header) !== 0x4550) return
  const optional = header + 24
  const plus = bytes.readUInt16LE(optional) === 0x20b
  const sections = Array.from({ length: bytes.readUInt16LE(header + 6) }, (_, index) => {
    const offset = optional + bytes.readUInt16LE(header + 20) + index * 40
    return { rva: bytes.readUInt32LE(offset + 12), size: Math.max(bytes.readUInt32LE(offset + 8), bytes.readUInt32LE(offset + 16)), raw: bytes.readUInt32LE(offset + 20) }
  })
  const at = (rva: number) => {
    const section = sections.find((item) => rva >= item.rva && rva < item.rva + item.size)
    return section ? rva - section.rva + section.raw : -1
  }
  const imports = bytes.readUInt32LE(optional + (plus ? 120 : 104))
  const names: string[] = []
  for (let descriptor = at(imports); descriptor > 0 && bytes.readUInt32LE(descriptor + 12) !== 0; descriptor += 20) {
    for (
      let thunk = at(bytes.readUInt32LE(descriptor) || bytes.readUInt32LE(descriptor + 16));
      thunk > 0 && Number(plus ? bytes.readBigUInt64LE(thunk) : bytes.readUInt32LE(thunk)) !== 0;
      thunk += plus ? 8 : 4
    ) {
      const value = Number(plus ? bytes.readBigUInt64LE(thunk) : bytes.readUInt32LE(thunk))
      const hint = plus ? value < 2 ** 63 : value < 2 ** 31
      if (hint) names.push(bytes.toString("latin1", at(value) + 2, bytes.indexOf(0, at(value) + 2)))
    }
  }
  const newer = names.filter((name) => name in NEWER_WINDOWS)
  const os = `${bytes.readUInt16LE(optional + 40)}.${bytes.readUInt16LE(optional + 42)}`
  const subsystem = `${bytes.readUInt16LE(optional + 48)}.${bytes.readUInt16LE(optional + 50)}`
  // A PE stamped 10.0 declares Windows 10 itself; older stamps (6.x) say nothing, since toolchains default to them.
  const stamped = compareVersions(os, "10.0") >= 0 || compareVersions(subsystem, "10.0") >= 0 ? "10.0" : undefined
  const windows = newer.reduce<string | undefined>((all, name) => higher(all, NEWER_WINDOWS[name]), stamped)
  return {
    file,
    format: "pe",
    needs: windows ? { windows } : {},
    notes: [`os ${os}`, `subsystem ${subsystem}`, ...newer.map((name) => `imports ${name}`)],
  }
}
`````

### GEN-FLOOR-3 — `packages/core/script/toolkit-floors.ts` 202–258

Commit `1cde2ff7a71bcf7aecb5d030917b577165135d38`; blob `bcb3e1f747870448172525b1b402ca3310ecf2f0`; SHA256 integral `fe962720c76ab7cc5a84c98cd373f73ec5baaf6f951b111df87d7883e2b8b424`. Bytes fonte 18151; recorte [10402, 13179); SHA256 trecho `241702198881e36194c81b6d956e182b3dc5b33c3f1e26f123fc8cac4c707782`.

`````text
async function walk(directory: string): Promise<string[]> {
  const info = await stat(directory).catch(() => undefined)
  if (!info) return []
  if (!info.isDirectory()) return [directory]
  const entries = await readdir(directory, { withFileTypes: true })
  return (
    await Promise.all(
      entries.filter((entry) => !entry.isSymbolicLink()).map((entry) => walk(path.join(directory, entry.name))),
    )
  ).flat()
}

// What the host never runs: fixtures under `testdata` (the Go tree ships dozens of foreign ELF, Mach-O and PE samples),
// linkable objects (`.syso`, `.o`, `.obj`) and, on a target, the binaries of the other operating systems (pip's Windows
// launchers sit in every Python tree).
const FORMAT: Record<string, Finding["format"]> = { darwin: "macho", linux: "elf", win32: "pe" }

async function findings(root: string, from: ReadonlyArray<string>, target: TargetId) {
  const files = (await Promise.all(from.map((item) => walk(path.join(root, item)))))
    .flat()
    .filter((file) => !/(^|\/)testdata\/|\.(syso|o|obj)$/.test(file))
  return (
    await Promise.all(
      files.map(async (file) => {
        const bytes = await readFile(file)
        return scan(path.relative(root, file), bytes)
      }),
    )
  ).filter((item): item is Finding => item?.format === FORMAT[target.split("-")[0]!])
}

async function download(url: string, integrity: string, cache: string) {
  const file = path.join(cache, createHash("sha256").update(url).digest("hex") + path.extname(new URL(url).pathname))
  const cached = await Bun.file(file).exists()
  const body = cached ? Buffer.from(await Bun.file(file).arrayBuffer()) : Buffer.from(await (await fetch(url)).arrayBuffer())
  const [algorithm, expected] = integrity.split("-", 2) as [string, string]
  if (createHash(algorithm).update(body).digest("base64") !== expected) throw new Error(`integrity mismatch: ${url}`)
  if (!cached) await writeFile(file, body)
  return file
}

async function unpack(file: string, url: string, format: PinnedArtifact.Artifact["format"], directory: string) {
  await mkdir(directory, { recursive: true })
  if (format === "raw") await copyFile(file, path.join(directory, path.basename(new URL(url).pathname)))
  else if (format === "zip") await $`unzip -q -o ${file} -d ${directory}`.quiet()
  else await $`tar -xzf ${file} -C ${directory}`.quiet()
}

async function artifact(item: PinnedArtifact.Artifact, cache: string, target: TargetId) {
  const directory = await mkdtemp(path.join(cache, "unpack-"))
  try {
    await unpack(await download(item.url, item.integrity, cache), item.url, item.format, directory)
    return await findings(directory, item.entries.map((entry) => entry.from), target)
  } finally {
    await rm(directory, { recursive: true, force: true })
  }
}
`````

### GEN-FLOOR-4 — `packages/core/script/toolkit-floors.ts` 268–317

Commit `1cde2ff7a71bcf7aecb5d030917b577165135d38`; blob `bcb3e1f747870448172525b1b402ca3310ecf2f0`; SHA256 integral `fe962720c76ab7cc5a84c98cd373f73ec5baaf6f951b111df87d7883e2b8b424`. Bytes fonte 18151; recorte [13486, 16116); SHA256 trecho `2d460b761f03f137fbe9a5e46b45cdd4e28ba6a84c88ddb49ceafde5360b26e3`.

`````text
/** The npm lock's packages that install only on this target (an `os`/`cpu` constraint), e.g. esbuild's binary. */
async function npmNative(lock: { packages: Record<string, { resolved?: string; integrity?: string; os?: string[]; cpu?: string[]; [key: string]: unknown }> }, target: TargetId, cache: string) {
  const platform = NODE_PLATFORM[target]
  const packages = Object.values(lock.packages).filter(
    (item) => item.os?.includes(platform.os) && item.cpu?.includes(platform.cpu) && item.resolved && item.integrity,
  )
  return (await Promise.all(packages.map((item) => artifact({ url: item.resolved!, integrity: item.integrity! as PinnedArtifact.Artifact["integrity"], format: "tar.gz", entries: [{ from: "package", to: "package" }] }, cache, target)))).flat()
}

const WHEEL_TAG: Record<TargetId, RegExp> = {
  "darwin-arm64": /macosx_\d+_\d+_arm64\.whl$/,
  "darwin-x64": /macosx_\d+_\d+_x86_64\.whl$/,
  "linux-arm64": /manylinux\w*_aarch64.*\.whl$/,
  "linux-x64": /manylinux\w*_x86_64.*\.whl$/,
  "win32-x64": /win_amd64\.whl$/,
}

/** The compiled wheels pip would pick on this target; PyPI's file index resolves each pinned filename to its URL. */
async function wheels(target: TargetId, cache: string) {
  const picked = Object.entries(WHEELS).flatMap(([pin, files]) =>
    Object.entries(files)
      .filter(([name]) => WHEEL_TAG[target].test(name))
      .map(([name, hex]) => ({ pin, name, hex })),
  )
  return (
    await Promise.all(
      picked.map(async (wheel) => {
        const [name, version] = wheel.pin.split("==") as [string, string]
        const index = (await (await fetch(`https://pypi.org/pypi/${name}/${version}/json`)).json()) as {
          urls: { filename: string; url: string }[]
        }
        const url = index.urls.find((item) => item.filename === wheel.name)?.url
        if (!url) throw new Error(`wheel not on PyPI: ${wheel.name}`)
        const found = await artifact(
          { url, integrity: `sha256-${Buffer.from(wheel.hex, "hex").toString("base64")}`, format: "zip", entries: [{ from: ".", to: "." }] },
          cache,
          target,
        )
        return found.map((item) => ({ ...item, file: `${wheel.name}:${item.file}`, notes: [...item.notes, `tag ${wheel.name.split("-").slice(4).join("-")}`] }))
      }),
    )
  ).flat()
}

export async function measure(item: Engine | Runtime, target: TargetId, cache: string) {
  if ("targets" in item) return artifact(item.targets[target].artifact, cache, target)
  if (item.id === "orval") return npmNative(orvalLock, target, cache)
  if (item.id === "datamodel-codegen") return wheels(target, cache)
  return []
}
`````

### GEN-FLOOR-5 — `packages/core/script/toolkit-floors.ts` 319–351

Commit `1cde2ff7a71bcf7aecb5d030917b577165135d38`; blob `bcb3e1f747870448172525b1b402ca3310ecf2f0`; SHA256 integral `fe962720c76ab7cc5a84c98cd373f73ec5baaf6f951b111df87d7883e2b8b424`. Bytes fonte 18151; recorte [16117, 17801); SHA256 trecho `42dfee45a76a004b20721c293a0e3385f643d185d5c10e8d3d39791208757e8c`.

`````text
if (import.meta.main) {
  const args = parseArgs({
    args: process.argv.slice(2),
    options: {
      engine: { type: "string", multiple: true },
      runtime: { type: "string", multiple: true },
      target: { type: "string", multiple: true },
      json: { type: "boolean" },
      files: { type: "boolean" },
      check: { type: "boolean" },
      cache: { type: "string" },
    },
  })
  const cache = args.values.cache ?? path.join(os.tmpdir(), "toolkit-floors")
  await mkdir(cache, { recursive: true })
  const targets = (args.values.target ?? TARGETS) as TargetId[]
  const all = !args.values.engine && !args.values.runtime
  const items: ReadonlyArray<Engine | Runtime> = [
    ...Object.values(ENGINES).filter((engine) => all || args.values.engine?.includes(engine.id)),
    ...Object.values(RUNTIMES).filter((runtime) => all || args.values.runtime?.includes(runtime.id)),
  ]
  // One at a time: the Rust and Java archives are hundreds of megabytes each.
  const rows = []
  for (const item of items)
    for (const target of targets) {
      const found = await measure(item, target, cache)
      rows.push({ id: item.id, target, ...reduce(found), files: found.length, notes: [...new Set(found.flatMap((entry) => entry.notes))], detail: args.values.files ? found : undefined })
    }
  const stale = rows.filter((row, index) => JSON.stringify(row.floor) !== JSON.stringify(items[Math.floor(index / targets.length)]?.floor?.[row.target] ?? {}))
  if (args.values.check) {
    stale.forEach((row) => console.error(`floor differs: ${row.id} ${row.target} measured ${JSON.stringify(row.floor)} (${JSON.stringify(row.setBy)})`))
    if (stale.length) process.exit(1)
  }
`````

## RE-SUP-03 — História adicional: época, intenção, candidatos e exclusões


### DOC-CTRL-1 — `docs/architecture/phase-plans/70-90-briefs/RD-CTRLPLANE.md` 1–17

Commit `1cde2ff7a71bcf7aecb5d030917b577165135d38`; blob `625853ed9615189b409a97273669805e00947232`; SHA256 integral `77f9eb4b14e96df443482f44c197cd5ddd384be54833426f81d22a28a87491dd`. Bytes fonte 4696; recorte [0, 1195); SHA256 trecho `abedee361f82e20810df6baca618e6ccfb58fa08ef62bccc8dc25a3a55d98989`.

`````text
# Card RD-CTRLPLANE

You execute one mechanical card. Do exactly the steps below, in order. Do not research, improve, reformat or fix anything else.

The file does not exist yet. Write it with exactly the content given; do not add, drop or reword facts.

- Worktree (already created for you): `/Users/gustavoschneiter/Documents/HuGR/_worktrees/ms-rd-ctrlplane`
- Branch (already checked out): `ms-rd-ctrlplane`
- BASE commit: `7181942eaa733b9cc3f4ff6aef79231d0d1c2f93`
- Remote: `fork`

## Hard rules

1. Work only inside the worktree. Never write, create or delete anything outside it.
2. Never run `bun install`, `bun typecheck`, `bun test`, `bun run test:ci`, `turbo`, `tsgo`, `tsc`, `bunx`, or any build.
3. Allowed commands: `git status|diff|grep|add|commit|push`, `node -e` one-liners, `python3 -` when a step gives the script, the `bun run script/<tool>.ts` commands below, and `bun run check:boundaries --no-stale --json --scope ...` (through the `SCOPED` helper).
4. Edit only the owned files listed below. Never edit `script/boundary-ledger.json`, `script/module-architecture.json`, any other `package.json`, `.github/**`, `turbo.json`, `nix/**`, `bun.lock`, or generated directories.
`````

### DOC-CTRL-2 — `docs/architecture/phase-plans/70-90-briefs/RD-CTRLPLANE.md` 36–77

Commit `1cde2ff7a71bcf7aecb5d030917b577165135d38`; blob `625853ed9615189b409a97273669805e00947232`; SHA256 integral `77f9eb4b14e96df443482f44c197cd5ddd384be54833426f81d22a28a87491dd`. Bytes fonte 4696; recorte [2450, 3644); SHA256 trecho `e915df82deb12c915958ab6f3e306838b9dbc04a268c80c685f3f76ce6695bce`.

`````text

## Steps

1. Create the file with this exact content (the quoted heredoc writes it byte for byte):

```bash
cat > 'removed-v1/src/control-plane/README.md' <<'README_EOF'
# Control plane domain

## Purpose and ownership

- Workspace control plane: `adapters/`, `workspace.ts`, `workspace-adapter-runtime.ts`, `workspace-context.ts`, `types.ts`, `util.ts`, and `dev/` with its own README (`removed-v1/src/control-plane/dev/README.md`).
- Kind: platform-legacy.
- Target: `packages/core/src/control-plane` (it already holds `packages/core/src/control-plane/move-session.ts` and `packages/core/src/control-plane/workspace.sql.ts`) plus server handlers.

## Public entry points and consumers

- Consumers: server, effect, plugin and project.

## Dependencies and boundaries

- Platform-legacy: may not import product domains (rule R11).

## Assets, schemas and generated files

- None.

## Persistence, identity and lifetime

- Process-global move service.
- The `packages/core/src/control-plane/workspace.sql.ts` table is core-owned; never move a `*.sql.ts` file.

## Commands

- `bun run test:ci orchestra test/control-plane/<file>`

## Contracts and verification limits

- None.
README_EOF
```

`````

### DOC-SESSION-1 — `docs/architecture/phase-plans/70-90-briefs/RD-SESSION.md` 1–17

Commit `1cde2ff7a71bcf7aecb5d030917b577165135d38`; blob `c968edcfd847e3d32415fd79613562c4d2934d01`; SHA256 integral `38c0f501d80c5ab015ff3f902ed003951f9a70872f98d09d2fdffa5f6a641a21`. Bytes fonte 4871; recorte [0, 1189); SHA256 trecho `8e32b2c9fe0a10d29f751efd59a7dcc8de185d4a9be07a93ba825d6abbc79432`.

`````text
# Card RD-SESSION

You execute one mechanical card. Do exactly the steps below, in order. Do not research, improve, reformat or fix anything else.

The file does not exist yet. Write it with exactly the content given; do not add, drop or reword facts.

- Worktree (already created for you): `/Users/gustavoschneiter/Documents/HuGR/_worktrees/ms-rd-session`
- Branch (already checked out): `ms-rd-session`
- BASE commit: `7181942eaa733b9cc3f4ff6aef79231d0d1c2f93`
- Remote: `fork`

## Hard rules

1. Work only inside the worktree. Never write, create or delete anything outside it.
2. Never run `bun install`, `bun typecheck`, `bun test`, `bun run test:ci`, `turbo`, `tsgo`, `tsc`, `bunx`, or any build.
3. Allowed commands: `git status|diff|grep|add|commit|push`, `node -e` one-liners, `python3 -` when a step gives the script, the `bun run script/<tool>.ts` commands below, and `bun run check:boundaries --no-stale --json --scope ...` (through the `SCOPED` helper).
4. Edit only the owned files listed below. Never edit `script/boundary-ledger.json`, `script/module-architecture.json`, any other `package.json`, `.github/**`, `turbo.json`, `nix/**`, `bun.lock`, or generated directories.
`````

### DOC-SESSION-2 — `docs/architecture/phase-plans/70-90-briefs/RD-SESSION.md` 36–79

Commit `1cde2ff7a71bcf7aecb5d030917b577165135d38`; blob `c968edcfd847e3d32415fd79613562c4d2934d01`; SHA256 integral `38c0f501d80c5ab015ff3f902ed003951f9a70872f98d09d2fdffa5f6a641a21`. Bytes fonte 4871; recorte [2439, 4037); SHA256 trecho `29bdd530cb48e93817d453a9bd9817352b01843c9c52fcc55f9330bf82d2f4a5`.

`````text

## Steps

1. Create the file with this exact content (the quoted heredoc writes it byte for byte):

```bash
cat > 'packages/core/src/session/README.md' <<'README_EOF'
# Core Session domain

## Purpose and ownership

- V2 Session core: the `packages/core/src/session.ts` facade, `packages/core/src/session/input.ts` (admission and retry identity), the projector, `packages/core/src/session/execution` (the process-global coordinator, `local.ts`) and `packages/core/src/session/runner` (the Location-scoped runner, exported as `@orchestra/core/session/runner`).

## Public entry points and consumers

- Consumers: server, removed-v1, apps/cli and sdk-next; other packages should import the entries.

## Dependencies and boundaries

- Follow AGENTS.md, "V2 Session Core": durable admission before an advisory wake, one `llm.stream` call per provider turn, no `SessionPrompt.loop` bridge, steer versus queue delivery. Read it there; it is not copied here.

## Assets, schemas and generated files

- None.

## Persistence, identity and lifetime

- `session_input` rows and events are durable user data.

## Commands

- `bun run test:ci core test/session-create.test.ts`

## Contracts and verification limits

- Path-pinned: `packages/core/src/session.ts`, `packages/core/src/session/runner/model.ts`, `packages/core/src/session/runner/llm.ts`, `packages/core/src/session/execution/local.ts`.
README_EOF
```

## Commit and push

```bash
git add 'packages/core/src/session/README.md'
git commit -m "docs(core): add core-session domain README" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
`````

### DOC-PLAN-1 — `docs/specs/runtime-closure/PLAN.md` 1–40

Commit `1cde2ff7a71bcf7aecb5d030917b577165135d38`; blob `86273b3eb5ae3d1720767210005ec41594a3cca9`; SHA256 integral `ba6332039082f1d1d2a5a4614774996e348a691b9fcf15313188be4963e9e7e5`. Bytes fonte 20380; recorte [0, 4609); SHA256 trecho `79afe75a1a2fae5bf81a9b1e9fae6f461e9e8e20fe60167baa5fd8b6d423bbdf`.

`````text
# Runtime distribution and integration closure

Baseline: `fork/dev` at `2d5d5d2f81770207a346aa14394fc4e6eedd6b39` (rename milestone #92).

## Demand and stopping rule

Ship owned Orchestra CLI artifacts in the desktop and WSL; remove unowned SDK/release registry dependencies; prove real Nix builds; make OAuth authorization identify Orchestra. Every work package must satisfy its named acceptance items, preserve the invariants below and provide current Actions evidence. One integrated milestone PR and merge close this work.

Owner clarification: **“nao, tem que aparecer orchestra”**. Own OAuth registrations and provider approval are completion requirements. Configurable IDs or mocked consent screens alone do not satisfy that item. Missing operational access is a named blocker, not a silently deferred requirement.

Cadence correction from the owner: **“vamos rapido, sem suites de teste pesadas rodando a cada wp, cada agent testa so o que mexeu, PR so no final do milestone ok?”** Each WP runs only its changed-file/changed-behavior checks. Cross-target builds, complete package suites, full matrices and the single milestone PR wait for integration/closure. Batch controls where they answer the same changed behavior; do not repeat full work for every edit.

Product architecture steering: the owner decided to transfer decomposition, planning, tasks and WPs from Maestro to a new team member, **Archie**, which another front is building. The owner renamed the proposed planner from Wallie to Archie; older snapshots use the former name. Maestro owns orchestration, organization and decisions, with further decision/orchestration capabilities planned later. Existing runtime snapshots must distinguish the current installed contract from this owner-directed transition. This implementation wave's own engineering plan is not the product's future Maestro capability charter; roster/prompt migrations require coordination with the Archie owner and current executable gates. Stable member IDs and charters must come from that front's frozen interface, not be guessed from display names.

## Recovered implementation facts

These observations describe the frozen baseline, before the implementation wave; current closure status is tracked by acceptance evidence.

- Desktop still installs upstream CLI packages and expects a Rust service-password command its owned V2 CLI does not implement.
- The owned V2 CLI builder emits a differently named executable and its entrypoint reports `local` even in compiled builds.
- WSL installation is disabled; its foreground startup arguments/password convention belong to the other runtime.
- Core serves bundled public SDK modules, but npm dependency resolution and warm caches can still fetch/expose registry SDK copies.
- Release version bumps fetch an unowned npm package name.
- Nix hashes cover installed dependency output, not lockfile bytes; evaluation alone cannot establish a working build.
- OAuth app IDs and some provider attribution fields remain third-party identities. A new app requires real registration/entitlement, not a locally invented ID.

These are source observations, not measured red-test results. The baseline acceptance runs below must record actual failures before implementations are graded.

## Invariants

1. Client runtime never imports Core or Server; existing Schema/Core/Protocol/Server direction remains intact.
2. V2 prompt admission, process-global Session execution and Location-scoped runners remain unchanged.
3. No upstream executable/installer or unowned SDK package is a runtime fallback.
4. Declared public SDK imports use bundled objects; unknown/deep imports cannot execute a planted registry copy. Ordinary plugin dependencies still work.
5. Copilot, xAI, DigitalOcean and other changed OAuth flows must display Orchestra through real registered identities. No fabricated client IDs, insecure TLS or hidden third-party fallback.
6. Keep OpenCode Zen/Go as ordinary providers; every provider request, Codex included, presents Orchestra's own client identity.
7. Artifact target, version and bytes are explicit and verified; caches cannot silently reuse another executable.
8. Test data, daemons and credentials are isolated. Do not restart the running app/server or use its data roots for smoke tests.
9. Tests run on Actions; local package typecheck/godfile only. Stage by exact paths. No hook bypass, force push, shared git-config edits or bulk cleanup.
10. Visual/Relay branches remain owned by their peer. Any necessary new user-facing copy goes through the shared i18n rules and visual coordination.
`````

### DOC-PLAN-2 — `docs/specs/runtime-closure/PLAN.md` 115–167

Commit `1cde2ff7a71bcf7aecb5d030917b577165135d38`; blob `86273b3eb5ae3d1720767210005ec41594a3cca9`; SHA256 integral `ba6332039082f1d1d2a5a4614774996e348a691b9fcf15313188be4963e9e7e5`. Bytes fonte 20380; recorte [10466, 20380); SHA256 trecho `7abd8fcd11f006342278086234d02560712e74b2ffb6de17d12b9568d83e46ef`.

`````text
| A01 | Release/preview versions derive from owned source/explicit overrides with registry networking disabled; invalid bump inputs fail. | W1 |
| A02 | Owned compiled V2 CLI has correct name/version and real service/serve commands on supported targets. | W2 |
| A03 | Native desktop stages/verifies owned artifacts, starts its isolated service and includes artifacts in every channel; fresh dev bootstrap works. | W3 |
| A04 | WSL selects guest architecture, installs/updates owned bytes atomically without upstream download, and reaches authenticated health. | W4 |
| A05 | Real npm resolver installs ordinary dependencies but performs zero external SDK fetches for direct/transitive/alias/peer/optional cases, including warm caches. | W5 |
| A06 | Prepared external plugin/custom-tool footprints use bundled public/alias SDK identities under Bun, Node, compiled binary and OpenTUI. Unknown/deep canonical SDK imports cannot execute registry copies; foreign SDK trees or unprovable footprints fail admission intact. | W5 |
| A07 | Each OAuth authorize/poll/refresh path uses its owned configured registration; missing registration produces a named setup blocker. | W6 |
| A08 | Real login/consent identifies Orchestra and entitled inference remains usable; refresh/re-login verified without leaking credentials. **Human/operational evidence required.** | W6 + owner |
| A09 | Attribution probes record tiny redacted requests and preserve compatibility/plan entitlement; unprobed identities stay explicitly unresolved. | W6 |
| A10 | Nix dependency hashes are regenerated/deterministic on all four declared platforms; wrong hashes fail. | W7 |
| A11 | Real Nix CLI and desktop builds/install checks pass, with matching Electron/platform artifacts; evaluation-only/skips cannot satisfy this item. | W7 |
| A12 | Integrated seam checks, independent reviews/mutation probes and full applicable exact-head epic CI pass; manifest and generated sources correspond. | Lead |

Baseline evidence lives with the named test runs. Already-green items are existing capability evidence, not proof of newly implemented work; the delta still requires a targeted failing counterexample.

## Exact verification matrix

- Native distribution targets: Darwin x64-baseline/arm64, Windows x64-baseline/arm64, Linux x64-baseline/arm64. Each must compile to the expected executable format/architecture and version. Native executable smoke/service checks run on matching OS/CPU runners; an unavailable required runner is an infrastructure blocker, not a skip counted as proof. Builder support for existing musl variants must not regress.
- Desktop channels: dev, beta, prod. Each package configuration includes the same owned manifest/native executable outside app.asar; Windows channels additionally include both Linux guest artifacts. A clean bootstrap must install/find Electron, build its own artifacts, launch the desktop process in isolated app data and prove its server is ready through the real integration path.
- WSL guests: supported Bash/coreutils Linux guests on x64 and arm64. Tests cover new installation, update, existing foreign executable, wrong digest/architecture, interrupted copy, version mismatch, symlink/traversal rejection, cancellation and unhealthy startup. Failure preserves the previously installed executable. A protected API request with the guest credential succeeds and a wrong credential is rejected; mere open port/HTTP 200 is insufficient. Real Windows/WSL transport evidence is required in addition to Linux transfer/script tests.
- Artifact provenance: manifest SHA matches the actually staged bytes after signing; compiled `--version` matches manifest and server registration. Reused staged caches are checked again. Missing/malformed descriptors, duplicate targets and altered cached executables fail or are replaced atomically from verified owned bytes; no network fallback.
- Resolver forms: direct, transitive at two depths, alias, peer, optional, and multiple requested SDK ranges, each cold and warm. Include existing package locks, permissive/planted SDK exports and bundled nested SDK copies. Unsupported SDK versions produce a local named error rather than registry fallback. Ordinary dependency metadata/tarball fetch and execution provide the positive control for zero SDK requests. Canonical public and alias imports must not execute planted bytes; arbitrary code explicitly bundled by a selected third-party plugin is not claimed to be a sandboxed program.
- SDK authority: exactly the seven exports in the plugin manifest (root, tool, tui, effect, effect/integration, effect/plugin, promise). Exercise prepared external ESM imports and supported require paths under Bun, Node desktop bundle and compiled Bun; OpenTUI covers its UI entrypoint and mixed imports after admission. Unknown canonical SDK spellings delegate to closed bridge exports and cannot execute registry bytes. Bun's `.js` export retry and `package.json` exception may reach owned bridge code/metadata only. Foreign permissive/extensionless/native SDK targets are rejected before evaluation without deleting user work. Type-only exports are verified as such instead of receiving fake runtime identity checks. This guarantee covers the admitted footprint, not deliberate escapes or later mutation by selected plugin code.
- OAuth registrations: Copilot, xAI, DigitalOcean, plus OpenAI/Codex if its visible app identity also needs replacement. Official issuer/grant/callback/scope requirements remain provider-owned. Verify ID propagation for authorization, device polling, token exchange and refresh/re-login, no fallback to known third-party app IDs, and preservation of account/model/plan entitlement. The actual consent page/registered-app record must say Orchestra; this operational/human item never becomes green from a configured string or local mock.
- Attribution probes: one request per configured provider/variant, no project code/transcript/tools, output limit at most 16 tokens, no automatic retry. Compare existing versus proposed identity using the same model/account. Results store only provider/model, identity variant, HTTP/error classification and minimal usage; token/refresh/password/authorization values never enter logs/artifacts. Unsupported or missing credentials are named unresolved evidence and block closure of that provider item.
- Nix systems: `x86_64-linux`, `aarch64-linux`, `x86_64-darwin`, `aarch64-darwin`. The fake-hash updater must produce the resolver's hash-mismatch result; unrelated acquisition/build failures are not hashes. Two independent clean dependency-output builds produce the same recursive hash per platform. Deliberately wrong hashes fail actual builds. CLI and desktop both build/install, CLI version/help execute, and installed desktop/server smoke runs on matching OS with the configured Electron version.
- Required seams: W1 version → W2 compiled version → W3 signed manifest/cache → W4 copied guest/version/auth; W5 actual resolver → runtime module identity on every supported import path; final W1–W6 dependency inputs → W7 hashes/builds. These require real integration checks, not only per-package unit results.
- Final evidence: independent author/reviewer contexts, measured red baseline/counterexample and green result, exact file manifest, generator correspondence, local package typechecks/godfile and full applicable exact-head Actions. No missing required item or skipped required check is a pass. Final merge must have the validated tree; an operational blocker keeps this milestone open.

## Work packages and conflict map

| WP | Responsibility / write ownership | Dependencies |
|---|---|---|
| W1 | `packages/script/src/index.ts`, version tests; owned release metadata only | none |
| W2 | `packages/cli/script/**`, `packages/cli/bin/**`, `packages/cli/src/index.ts`, CLI build/runtime tests | W1 version contract |
| W3 | Desktop native scripts/staging, `cli-artifacts.ts`, `background-cli.ts`, Electron bootstrap and packaging tests/config | W2 artifact contract |
| W4 | Desktop `src/main/wsl/**`, WSL tests; consumes shared reader without editing it | W2/W3 contract |
| W5 | Core npm/SDK install/resolution and tests; SDK/OpenTUI integration files by explicit lead assignment | npm seam freeze |
| W6 | Provider/OAuth identities, registration/probe harness and tests; source maps/config list frozen before edits | owner registrations/access |
| W7 | `nix/**`, hash tooling and real-build CI; no desktop/script package edits | final manifests/artifacts/dependencies |
| Lead | root/package manifests, shared lockfile, rename ledger, acceptance anchor, CI integration, final evidence and merge | all |

The first six execution fronts are disjoint or contract-bound. W7 can prepare tooling in parallel but final hash/build capture follows final dependency inputs. Shared files never get concurrent writers. Default maximum six nontrivial execution agents, plus short cold reviews as slots free; heavy builds/tests stay on Actions.

## Verification and landing

1. Author concrete baseline failures for assigned acceptance items and run them on Actions.
2. Obtain independent cold acceptance-suite critique before implementation; reconcile two consecutive rounds with no missing items.
3. Compile against frozen seams; push the first useful commit for resumability.
4. Each agent returns SHA, exact file set, actual gate URLs/results, mutation before/after and blockers. No self-reported pass substitutes for evidence.
5. Lead reads all gate changes first, reviews full file manifest and independently verifies controls/results before integrating.
6. Regenerate public SDK/Client only through their generators when public APIs change. Recompute Nix hashes after final dependency inputs.
7. One final milestone PR/epic CI; merge only the exact validated head. A08 operational blockers remain blockers until real evidence is supplied.
`````

### DOC-SNAPSHOT-1 — `docs/specs/runtime-closure/SNAPSHOT-QUALIFICATION.md` 1–31

Commit `1cde2ff7a71bcf7aecb5d030917b577165135d38`; blob `b19b43d4bfbefac2ba49d564d98963af7b454d86`; SHA256 integral `06b5881efcaa1bb749bfb3062038877e6205ac96de85c79a20e2a3aaa43cbd05`. Bytes fonte 8185; recorte [0, 2373); SHA256 trecho `fcc933b8c441d89792fb63e10db23af46f64d99c14d63067e97a04a8e3e0b2d8`.

`````text
# Task observation snapshot qualification — 2026-10-09

## Source identity

- Reviewed candidate: `5c6426d8f5bb0a473d15447dece6e205be7cc32c`.
- Composed source and successful prior Nix-request ancestry: `f48ed761aa23702ecea589628fd8a5c3929f6fa9`.
- Qualification base including the Windows compiler-acquisition repair: `905facae5508054e98f617f9345de8a3eaae9222`, tree `949c4cc0fa2ef4a4b861db1b92753a71e0a601ff`.
- Production updater blob: `9a863008a73a6f54ef8b67c5f69e48f19342f1d2`.
- Native workflow blob: `2cd60aac24191ef0e93f5cc49b0f52818ea11d6f`.

The candidate changes only the updater's representation at comparison time: `current(match.state)` supplies the current plain snapshot inside `produce`. Strict equality, stored ownership/placement/author facts, failure precedence and private receipt guards remain. The observation replaces only retained `metadata.workResult`.

## Measured first rejection

The previous actual runs failed on both operating systems: Core [37981431526](https://github.com/gustavomhss/hugr-orchestra/actions/runs/37981431526) reported 73 passed / 8 failed across its selected files; Orchestra [37981431470](https://github.com/gustavomhss/hugr-orchestra/actions/runs/37981431470) reported 88 passed / 2 failed. The eight Core failures were real eligible/restored host observations, including the live side of the fresh replay oracle. The two Orchestra failures were actual completed-native/dual Task delivery cases.

Temporary integrator instrumentation ran the unchanged real Core fixture and assertions through the actual database-backed projector and updater:

```sh
bun run test:ci core test/upstream-settlement-preservation.test.ts --os both --timeout 120000
```

Diagnostic [37988400717](https://github.com/gustavomhss/hugr-orchestra/actions/runs/37988400717), head `18262711b544b006587ff07ba0e67191d2336679`, parent `f48ed761aa23702ecea589628fd8a5c3929f6fa9`: **24 passed / 0 failed / 251 assertions on each OS**, launcher exit 0. Linux job `114016065848`; Windows job `114016065380`.

For eligible native, legacy and dual authors, restored original/author/workspace facts, and live plus fresh replay:

| Measured value | Result on Linux and Windows |
|---|---|
| Database validation / observation present | true / true |
| Strict draft input versus validated input | false |
| Strict snapshot input versus validated input | true |
`````

### DOC-SNAPSHOT-2 — `docs/specs/runtime-closure/SNAPSHOT-QUALIFICATION.md` 57–87

Commit `1cde2ff7a71bcf7aecb5d030917b577165135d38`; blob `b19b43d4bfbefac2ba49d564d98963af7b454d86`; SHA256 integral `06b5881efcaa1bb749bfb3062038877e6205ac96de85c79a20e2a3aaa43cbd05`. Bytes fonte 8185; recorte [4916, 8185); SHA256 trecho `5bacdd220b6f98aa0136d57f5ba70d551103ec67ec578370ba94d0f3c967fdad`.

`````text
```

## Windows x64 native repair

Native [37984603006](https://github.com/gustavomhss/hugr-orchestra/actions/runs/37984603006), attempt 2, head `e2ec5a868f983da025e5eb3611589e1b39b2f986`: models, Linux x64/ARM64, Darwin Intel/ARM64 and Windows ARM64 producer/consumer succeeded. Windows x64 job `114008171552` failed in CLI build, before exporter or consumer qualification:

```text
error: Failed to extract executable for 'bun-windows-x64-baseline-v1.3.14'. The download may be incomplete.
```

The repair acquires the official `bun-v1.3.14/bun-windows-x64-baseline.zip`, release asset `418774449`, verifies SHA-256 `538f9c846355d9e847b2671bc00c47da4229a0befb24df3282b739770f3b475f`, extracts it and requires actual version `1.3.14` before placing that compiler on PATH. Bun's tagged `CompileTarget.zig` uses its current executable for a matching default target, avoiding the nondefault extraction path. The CLI still explicitly requests the baseline target; native host, exact version, exporter and consumer checks remain.

```sh
gh workflow run 379787522 --repo gustavomhss/hugr-orchestra --ref runtime-closure -f windows_x64_only=true
```

Failed-lane-only dispatch [37988853607](https://github.com/gustavomhss/hugr-orchestra/actions/runs/37988853607), head qualification base: **success**, `gh run watch --exit-status` exit 0. Windows job `114017634907` executed verified baseline acquisition, matching native host, frozen/ignore-scripts installation, real model snapshot, actual CLI build, exporter/resource verification, compiled version, isolated daemon health, wrong-password and unauthenticated rejection, cleanup, report readback and upload. The actual report was independently downloaded:

```json
{"target":"windows-x64-baseline","version":"1.18.27","sha256":"f7071ab0f2a9ac16208bcce1b429fb754f3703197b8ffda9753b7e1bdc406742","healthy":true,"wrongPasswordRejected":true,"unauthenticatedRejected":true}
```

Report artifact `11644950455`, archive SHA-256 `d15c3726ea51f08f0d74c8898547a08354dc1aad2e5e76fc4d5fdc2141d1e245`, is bound by GitHub artifact metadata to that exact run/head. This explicit dispatch does not claim to qualify skipped lanes; their previous successful lane evidence remains separately identified. The default full matrix remains enabled. Independent static approval `ses_ede10b10bffeZj7Sr8S8b57wwj` covers the exact workflow delta and pinned publisher asset.

## Nix and operational boundaries

Nix [37981869304](https://github.com/gustavomhss/hugr-orchestra/actions/runs/37981869304) successfully measured four native dependency outputs and completion controls on the earlier `9c76824c5ce27849f42685dc3579e3201e6103af` request. Its ancestry is preserved and `ready: false` remains. No candidate hashes were applied.

The updater changed from `3f4db93e7a` to the production blob above. All-package dependency input fingerprinting therefore requires a fresh four-platform measurement against the next qualified freeze, even if a resulting NAR happens to match. Relay remains the sole Nix capture/hash writer. Measurement success is not distribution/consumer acceptance.

OAuth, credentials, model inference, launcher and real Maestro pilot were not exercised by these checks. Desktop, WSL and remaining milestone acceptance stay open.
`````

### DOC-WAVE-1 — `docs/specs/runtime-closure/WAVE-2.md` 1–25

Commit `1cde2ff7a71bcf7aecb5d030917b577165135d38`; blob `c571d622e67407701d88df24bf5bc5fc9cf11c6f`; SHA256 integral `28fc27dc7b408259343ef7a6b9cd90f426d8d776808ea936a2e5576102fc5737`. Bytes fonte 13221; recorte [0, 3452); SHA256 trecho `224ea1a0ddddee4731a3453bfe1d582e7bcc47a9e1e734d193e21cc2b57cd94b`.

`````text
# Closure wave 2

Baseline: `696018ded7740e9725447475c044f50aa160c074`. This is an integration checkpoint, not the final producer/dependency freeze. The owner requests parallel closure without debt or silent deferrals; focused work-package checks remain the cadence.

## Frozen ownership and contracts

| Work package | Isolated branch | Write ownership | Contract |
|---|---|---|---|
| Private OAuth files | `closure-private` | New Core private-file helper/oracle, Core `auth/siwc-host.ts` and its tests, Orchestra Auth store and three OAuth/Auth tests | POSIX mode `0600`; Windows native protected DACL grants the current owner and privileged SYSTEM/Administrators only. Apply protection before publishing temporary files; actual OS oracle replaces meaningless Windows POSIX-mode assertions. No skipped Windows persistence/concurrency tests. |
| Owned CLI schema | `closure-schema-fix` | New `packages/cli/script/schema.ts`, focused schema test and optional CLI schema helper | Emit JSON Schema from authoritative Core `Config.Info`; legacy Orchestra generator retains `ConfigV1.Info`. Do not replace the unrelated Core database schema snapshot. |
| Artifact producer | `closure-producer` | CLI export script/helper/target contract and focused tests; CLI builder only if needed for shared target declarations | Export regular raw owned binaries into a schema-1 directory consumed by `ORCHESTRA_CLI_PREBUILT_DIR`, with target-specific filenames, captured version and SHA-256. Preserve source outputs; reject malformed/conflicting/overlapping inputs; no registry/compiler fallback. Native execution/build proof remains a distinct matching-runner check. |
| Nix derivations | peer `nix-closure` | `nix/**` only | Measured Nix-local Bun `1.3.14` and Electron `42.3.3` derivations; preserve shared `flake.lock` and Intel Darwin support. No guessed hashes or version-check bypass. |
| Integration | `runtime-closure` | Shared manifests/lockfile/generators, evidence, native workflow orchestration | Reconcile published seat/capability baseline, review each whole diff and measured controls, then publish the clean producer revision. |

These execution slices are disjoint. Root/package manifests, lockfile, Nix files, public generated outputs, roster/seats and shared lifecycle files are not author-agent write sites. Merge order: private files, schema, producer; shared generators and final native/Nix capture follow integrated inputs. No work package opens a PR; the milestone has one final PR.

## Evidence already requiring repair

- Combined Core [37781640526](https://github.com/gustavomhss/hugr-orchestra/actions/runs/37781640526): Linux passed; Windows failed host-ID POSIX-mode assertion (`Expected: 384`, `Received: 438`).
- Combined Orchestra [37781639208](https://github.com/gustavomhss/hugr-orchestra/actions/runs/37781639208): Linux passed; Windows failed five OAuth/Auth POSIX-mode assertions. Relay HTTP/OpenAPI/SDK checks passed on both.
- Combined Client [37781639701](https://github.com/gustavomhss/hugr-orchestra/actions/runs/37781639701): 17 tests passed per OS.
- Combined generators produced no diff at this baseline. Core, Orchestra, Server, App, Desktop, SDK and Client typechecks passed; one overloaded Orchestra invocation timed out before a successful retry.

The Windows failures do not establish a safe DACL. The private-file work must prove the native protection and keep the actual persistence/refresh/CAS cases executing.

`````

### DOC-WAVE-2 — `docs/specs/runtime-closure/WAVE-2.md` 44–73

Commit `1cde2ff7a71bcf7aecb5d030917b577165135d38`; blob `c571d622e67407701d88df24bf5bc5fc9cf11c6f`; SHA256 integral `28fc27dc7b408259343ef7a6b9cd90f426d8d776808ea936a2e5576102fc5737`. Bytes fonte 13221; recorte [6786, 13221); SHA256 trecho `3721d1e1bbe109b3ef655d3075713d3a9179845927e7cad2151123f3d145cc6f`.

`````text
- Relay checkpoint `937cf2b1de` is integrated in published runtime checkpoint `ccf4e62bf5`. Tool-registry composition preserves both external SDK admission and registry-backed seat support. Supported SDK and Client generators produced no additional working-tree diff beyond the composed output.
- Exact nullable OpenAPI/SDK evidence [37868767689](https://github.com/gustavomhss/hugr-orchestra/actions/runs/37868767689) covers the peer's unchanged nullable transition envelopes; the combined SDK also retains OAuth `metadata`. The owner explicitly answered **“Autorizar 16601 LOC”** for its three additional generated lines beyond the peer's approved 16598. Client's existing 6646-LOC authorization remains unchanged.
- Native harness run [37872385330](https://github.com/gustavomhss/hugr-orchestra/actions/runs/37872385330), source `4b0fcf043d`, exposed Bun 1.3.14's optional `--config` argument: the path must use `--config=PATH`. A spaced path can become the executed entrypoint, so successful job statuses from that invocation do not establish native test execution. Workflow and exporter-subprocess argv are being corrected together; the unchanged native selectors will run in one new batch.
- W6 exact write ownership was acknowledged to the Relay integrator. Archie confirmed `PlanSource` upstream/provenance ownership; binding Plan/Task changes must wait for its frozen versioned attribution contract before changing upstream enums or provenance. Peer ACKs are not human authority or permission waivers.
- The human-generated SDK ceiling correction passed the actual godfile guard after its 16601-versus-16598 failure. Combined Core, Schema, Orchestra, Client and SDK package typechecks passed. Existing provider/auth/native-independent suites were not repeated.
- Corrected harness source `5513f97398` ran real named tests in [37873704892](https://github.com/gustavomhss/hugr-orchestra/actions/runs/37873704892). Required native closure remains blocked: Darwin's metadata gate incorrectly requires an undocumented `Mounted` field; Linux reaches normal publication/export assertions before a borrowed-libc-memory ownership crash. The gate and ownership fixes are separate from the authorized namespace boundary. Successful individual assertions before the crash are not a completed lane.

## Producer matching-host completion

Producer/native candidate `374da1e154acc7d5df4c7d84bd69fd0aa1b8d494` repairs both measured failures. Linux directory names use a non-owning `toArrayBuffer` view of libc-owned `dirent` memory, decoded synchronously before the next `readdir`/`closedir`. Darwin admission uses the live nonempty `MountPoint` rather than an undocumented `Mounted` field; exact root equality, APFS qualification and SDK checks remain required. Independent reviews approved each narrow correction.

[37875718504](https://github.com/gustavomhss/hugr-orchestra/actions/runs/37875718504) completed all six actual hosted lanes: 28 tests each on Darwin Intel/ARM, 27 each on native musl x64/ARM and glibc-with-foreign-musl x64/ARM. The lead verified named admission, actual exporter-subprocess and retained POSIX limitation tests executed in every lane. The earlier spaced-config job statuses are not reused as evidence.

This closes the producer's native exporter/ABI handoff checks. It does not certify full compiled CLI/Desktop products, Windows/WSL guest transport, final SDK authority matrix, Nix dependency hashes/builds or operational OAuth consent. Those acceptance items remain explicit.

## Prepared SDK runtime matrix

The new focused matrix uses one real loopback-registry `Npm.install` with canonical and alias bridges, ordinary dependency fetch/execution controls and zero SDK registry requests. Prepared workers check all seven public exports under Bun, a Node ESM bundle, compiled Bun and real OpenTUI. Runtime exports require nonempty exact key sets and object identity through external ESM and supported `require`; integration is explicitly runtime-empty, with public type fields checked by package typecheck. Unknown/deep imports reject; accepted Bun `.js` retries and `package.json` exceptions may expose only owned modules/metadata.

[37876355764](https://github.com/gustavomhss/hugr-orchestra/actions/runs/37876355764) reproduced a real Node admission failure on both OSes: Bun-only `import.meta.dir` was undefined. Candidate `22addae2df` uses the existing `fileURLToPath(import.meta.url)` to obtain a portable module directory, preserving optional physical-host authority and foreign-footprint checks. Independent review approved the one-line correction and the matrix.

[37877015907](https://github.com/gustavomhss/hugr-orchestra/actions/runs/37877015907) passed the one matrix test with 40 parent assertions on each of Linux and Windows. Each run includes a counted real Bun registration mutation: external identity comparison rejects a fresh registered `tool` function while expected bundled objects remain unchanged. The mutation is not a separate rerun or a changed oracle. Normal workers cover canonical/alias ESM and `require`; the registration control specifically calibrates the Bun comparison, not every runtime independently.

Combined Core and Orchestra package typechecks passed, including the integration public-type field references. The earlier resolver and production-footprint suites were not rerun. Final exact-head milestone CI and full product/operational proofs remain separate acceptance items.

## Owner-directed implementation-first cadence

The owner now directs: **“Ja ta planejado o que falta fazer pra terminar? Se sim executa com o maximo de paralelizacao, deixa pra testar quando tiver tudo pronto, ok?”** This supersedes per-work-package typecheck/test/mutation/CI scheduling for the remaining wave. Authors implement disjoint slices and prepare runnable checks; validation runs once the combined implementation is ready. Existing source-bound evidence is reused. Required gates and operational requirements are unchanged.

Active ownership: Archie upstream attribution/schema/V3 and host verifier; Relay Schema binding, Core workflow, Orchestra lifecycle; Nix `nix/**`, `flake.nix` and its existing workflow; runtime native-product workflows/proofs, WSL proof and credential placement. Relay remains the sole shared `maestro-event.ts` integrator. Native and WSL harness drafts are preparation, not passing product evidence; neither is dispatched during this phase.
`````

### DOC-CHANGE-1 — `docs/specs/v2/schema-changelog.md` 1–84

Commit `1cde2ff7a71bcf7aecb5d030917b577165135d38`; blob `f5aa069b716e6a27eac6f3f519b94cb4eb542854`; SHA256 integral `94f7880e7ad15e52955bf5be0ab27d24349ca02672a9ae46161d463250d698dd`. Bytes fonte 40164; recorte [0, 5834); SHA256 trecho `151c1d603b408d169413f878b201774c18b38e821f7c59d774721e968bcf82cc`.

`````text
# V2 Schema Changelog

## 2026-06-26: Add Finite Session History

- Add `GET /api/session/:sessionID/history` and generated Promise, Effect, and legacy JavaScript client methods.
- Page public durable Session events after an optional exclusive aggregate sequence, with an explicit `hasMore` exhaustion signal.
- Keep aggregate gaps legal, cap pages at 100 events, and preserve the existing durable replay-and-tail `sessions.events()` stream unchanged.
- Add no migration or durable-event version; this is a finite read API over the existing event manifest.

## 2026-06-22: Simplify Session Input Promotion

- Keep `session.next.prompt.admitted.1` as the durable, client-visible record of pending Session input.
- Replace `session.next.prompt.promoted.1` with the existing `session.next.prompted.1` event when input becomes model-visible.
- Preserve the prompt endpoint, admission receipt, idempotency, steer/queue ordering, and atomic user-message projection.
- Reset experimental V2 events, projections, inputs, Context Epochs, and synchronized workspace state while preserving canonical V1 `session`, `message`, and `part` rows.

## 2026-06-22: Reset Unpublished Compaction Event

- Replace the unpublished `session.next.compaction.ended.1` payload with the current checkpoint payload and remove its legacy decoder.
- Reset experimental events, sequences, Session inputs, projected Session messages, Context Epochs, synchronized workspace rows, and Session workspace links.
- Preserve canonical V1 `session`, `message`, and `part` rows.

## 2026-06-22: Make Session Interruption Process-Local

- Remove the unprojected `session.next.interrupt.requested.1` event from the experimental durable Session event union and generated SDK.
- No canonical V1 data requires migration; experimental V2 event history containing the retired event is disposable.

## 2026-06-05: Execute Automatic Session Compaction

- Trigger automatic compaction before provider turns using the complete estimated request and absolute model-aware headroom.
- Preserve the existing structured summary contract and update prior summaries with newly compacted history.
- Store token-bounded recent history as plain serialized text inside the checkpoint instead of replaying provider-native messages.
- Keep compaction starts durable and progress deltas live-only; activate history cutover only from a durable completed summary.
- Store the completed event with the current checkpoint payload containing stable message identity, reason, summary, and recent context.
- Reload the replacement Context Epoch and continue the original pending turn after compaction.
- Preserve full durable history; compaction changes only the active model representation.
- Defer provider-overflow recovery, explicit manual compaction, and deterministic old tool-result pruning.

Record V2 database, durable-event, projected-message, HTTP, and generated SDK schema changes here. Each entry states why the contract changed and whether consumers or stored data need compatibility handling. Commit messages for schema-affecting changes should include the same summary.

This document covers meaningful contract changes introduced on the `feat/orchestra-embedded-api` branch since its divergence from `origin/dev`. Mechanical file moves and internal refactors are omitted unless they changed stored data, replay behavior, public HTTP or SDK shapes, or model-facing tool contracts.

## 2026-06-04 Event-Sourced Session Input Cutover

Affected schema:

- `session_input`, `session_message`, `event`, `event_sequence`, and disposable workspace beta storage.
- New synchronized `session.next.prompt.admitted.1` and `session.next.prompt.promoted.1` events.
- Experimental `SessionV2.prompt(...)`, HTTP, and generated SDK admission receipt.

Change:

- Replace inbox-local admission sequence with event-sourced prompt admission and promotion sequences.
- Give projected Session messages stable `msg_*` resource IDs distinct from `evt_*` creator event IDs.
- Give every event that creates a projected transcript resource an explicit `msg_*` resource ID. Assistant steps propagate one `assistantMessageID` through assistant-owned events.
- Reset incompatible unreleased beta event history, derived Session projections, workspace rows, and Session workspace links.

Compatibility:

- The reset preserves canonical V1 `session`, `message`, and `part` rows.
- Existing synchronized workspaces are disposable beta state and are removed by the reset.
- Before starting the new build, discard adapter-managed external workspace resources created by unreleased builds. The SQL migration cannot remove external resources through runtime adapters, and rediscovering retained resources after startup can replay incompatible beta history.
- Exact prompt retries reconcile one stable `msg_*` identity when Session, prompt, and delivery mode match.

## Earlier Branch History

### Replayable Session Event Refinement And Cursor Stream

Affected schema:

- Existing synchronized `session.next.*` event family in `packages/core/src/session/event.ts`.
- Existing projected V2 Session-message union in `packages/core/src/session/message.ts`.
- New explicit durable-event union and internal replay cursor returned by `sessions.events({ sessionID, after? })`.

Change:

- Keep the existing Session lifecycle event family and projected-message union rather than introducing them in this branch.
- Stop synchronizing text deltas, reasoning deltas, and tool-input deltas; keep them explicitly ephemeral.
- Add an explicit durable-event union for replay-safe consumers.
- Add replay-and-tail aggregate cursors backed by durable Session-event sequence.
- Encode synchronized event payloads before writing JSON storage and decode them while replaying so schema transforms remain explicit at the durable boundary.

Reason:

`````

### DOC-MIG-HISTORY-1 — `modules/atlas/docs/design/genesis-chatgpt-results/20261111-v3-fresh/s1/review-packets/l1-a4-v1-dossier.md` 2151–2177

Commit `a8df22ae3a140c58c63f62ce2a634c84f415c943`; blob `6f872ea0e22097d8084fd587f585751a436f607e`; SHA256 integral `83b544ac46f99b2bf3585ff4e607bcd403e49eb20dd128deb5b6a029a772ead0`. Bytes fonte 155061; recorte [109118, 110747); SHA256 trecho `f4d12da087a7b6d745929a4f20016d7dabaf8da770f422057430e702f8909ca3`.

`````text
- Core exports `./database/database`, `./database/migration`, `./database/migration.gen`, `./database/sqlite`, `./database/sqlite.bun` and one export per migration file.
- Consumers: every core domain with tables, the server, the CLI database commands, and `modules/maestro/coordination` and `modules/continuity`, which build on the `Database` service.

## Dependencies and boundaries

- None beyond the core layer rules.

## Assets, schemas and generated files

- `migration.gen.ts` and `schema.gen.ts` are generated by `bun run migration` in `packages/core`; `bun run migration --check` verifies them against `packages/core/schema.json`.
- `packages/core/drizzle.config.ts` globs `./src/**/*.sql.ts` and `./src/**/sql.ts`, so never move `packages/core/src/account/sql.ts`, `packages/core/src/credential/sql.ts`, `packages/core/src/share/sql.ts`, `packages/core/src/control-plane/workspace.sql.ts` or `packages/core/src/data-migration.sql.ts`.

## Persistence, identity and lifetime

- The database is `orchestra.db` under the XDG data path, or the file named by `ORCHESTRA_DB` (a relative name resolves under the data path; `:memory:` is allowed).
- The data path, `ORCHESTRA_DB`, and migration identity and order are user-data contracts: never rename or reorder a shipped migration.

## Commands

- `bun run test:ci core test/database-migration.test.ts test/database-sqlite.test.ts`
- `bun typecheck` from `packages/core`.

## Contracts and verification limits

- The generated files are path-pinned.
- The migration tests cover the real migrations on a scratch database; they do not exercise a user's existing database.
````
`````

### DOC-API-DISCUSSION-1 — `docs/specs/v2/api.html` 1021–1029

Commit `1cde2ff7a71bcf7aecb5d030917b577165135d38`; blob `5801d1746e78c3ab79ec4ab8584610fcd5dd7a2c`; SHA256 integral `de6f923e2e9d31cec28e133cfce8612b9523f0924bffd2f3d30a66201f036c7c`. Bytes fonte 45354; recorte [40504, 41062); SHA256 trecho `ef52f7b59e4425f0c3c48d4d56928fc5b0c5e4b80f2f3361fcca28a47f0cbfd8`.

`````text
                <td class="operation"><code>workspace.status</code></td>
                <td class="body"><code>{}</code></td>
                <td><span class="context-tag server">server</span></td>
                <td class="route"><code>GET /api/workspace/status</code></td>
                <td>Connection/lifecycle status for all workspaces. Needs team discussion.</td>
              </tr>
              <tr class="question-row">
                <td class="operation"><code>workspace.sync</code></td>
                <td class="body"><code>{}</code></td>
`````

### DOC-API-DISCUSSION-2 — `docs/specs/v2/api.html` 1028–1036

Commit `1cde2ff7a71bcf7aecb5d030917b577165135d38`; blob `5801d1746e78c3ab79ec4ab8584610fcd5dd7a2c`; SHA256 integral `de6f923e2e9d31cec28e133cfce8612b9523f0924bffd2f3d30a66201f036c7c`. Bytes fonte 45354; recorte [40937, 41444); SHA256 trecho `9c81f5b16c6b80d036a9a07e4ca839b32e18a068eedc84a088a021d63d97033f`.

`````text
                <td class="operation"><code>workspace.sync</code></td>
                <td class="body"><code>{}</code></td>
                <td><span class="context-tag server">server</span></td>
                <td class="route"><code>POST /api/workspace/sync</code></td>
                <td>Sync workspace metadata from adapters. Needs team discussion.</td>
              </tr>
              <tr>
                <td class="operation"><code>workspace.update</code></td>
                <td class="body">
`````

### DOC-API-DISCUSSION-3 — `docs/specs/v2/api.html` 1049–1057

Commit `1cde2ff7a71bcf7aecb5d030917b577165135d38`; blob `5801d1746e78c3ab79ec4ab8584610fcd5dd7a2c`; SHA256 integral `de6f923e2e9d31cec28e133cfce8612b9523f0924bffd2f3d30a66201f036c7c`. Bytes fonte 45354; recorte [42054, 42498); SHA256 trecho `6dc7d49366cd3a37d0aefb0f32070492a44b2a2f22368758b01c75388642ab84`.

`````text
                  <code>{ workspaceID?: WorkspaceID sessionID: SessionID copyChanges: boolean }</code>
                </td>
                <td><span class="context-tag server">server</span></td>
                <td class="route"><code>POST /api/workspace/warp</code></td>
                <td>Move a session into or out of a workspace. Needs team discussion.</td>
              </tr>
            </tbody>
          </table>
        </article>
`````

## RE-SUP-04 — Actions, capability, distribuição, packaging e upstream: contratos dirigidos

Todos os paths abaixo constam da relação individual de suporte. As treze fixtures capability estão identificadas separadamente; as implementações externas importadas não recebem aceite por essa leitura. Casos CI/distribution e fixtures de provider permanecem NOT_RUN.

### FX-ACTIONS-CLI-1 — `packages/core/test/fixture/actions-cli.ts` 1–64

Commit `1cde2ff7a71bcf7aecb5d030917b577165135d38`; blob `f470b8b071d1f8c322e4f4042a5f4648ae48afc5`; SHA256 integral `3deecb19945da56cafdc494ed6c47e7ebe045541fbc2a16cd61616e91144cb60`. Bytes fonte 3139; recorte [0, 3139); SHA256 trecho `3deecb19945da56cafdc494ed6c47e7ebe045541fbc2a16cd61616e91144cb60`.

`````text
// Subprocess protocol fixture, not a provider compatibility oracle.
import fs from "node:fs/promises"
import path from "node:path"
import { createHash } from "node:crypto"

const root = process.argv[2]
const name = process.argv[3]
const argv = process.argv.slice(4)
const reply = JSON.parse(await fs.readFile(path.join(root, "reply.json"), "utf8"))
const selected = reply.routes?.[argv.at(-1) ?? ""] ?? reply
if (argv[0] === "version") {
  process.stdout.write(reply.version ?? "glab 1.118.0 (570955d42)\n")
  process.exit(0)
}
if (argv[0] === "config") {
  await fs.appendFile(path.join(root, "config-calls.jsonl"), JSON.stringify({ argv }) + "\n")
  if (reply.configCode) { process.stderr.write("synthetic-credential diagnostic"); process.exit(reply.configCode) }
  process.stdout.write((reply.settings?.[argv[2]] ?? "") + (reply.settings?.[argv[2]] ? "\n" : ""))
  process.exit(0)
}
if (name === "glab") { process.stderr.write("GitLab fixture forbids API/auth network helpers"); process.exit(90) }
await fs.writeFile(path.join(root, "ready"), String(process.pid))

if (argv.includes("--help")) {
  process.stdout.write(reply.help ?? "--form Add multipart form field; use file=@- to read stdin\n")
  process.exitCode = reply.helpCode ?? 0
} else {
  const hash = createHash("sha256")
  const captured: Buffer[] = []
  const input = { size: 0, chunks: 0 }
  for await (const chunk of process.stdin) {
    const bytes = Buffer.from(chunk)
    hash.update(bytes)
    if (input.size < 64 * 1024) captured.push(bytes.subarray(0, 64 * 1024 - input.size))
    input.size += bytes.length
    input.chunks++
  }
  await fs.appendFile(path.join(root, "calls.jsonl"), JSON.stringify({
    argv, stdin: Buffer.concat(captured).toString("base64"), size: input.size,
    digest: hash.digest("hex"), chunks: input.chunks, cwd: process.cwd(),
    env: Object.fromEntries(["GH_PROMPT_DISABLED", "GLAB_NO_PROMPT", "NO_COLOR", "GH_NO_UPDATE_NOTIFIER",
      "GLAB_CHECK_UPDATE", "GLAB_DEBUG_HTTP", "GH_DEBUG", "GITLAB_API_HOST", "GLAB_API_PROTOCOL", "GITLAB_SUBFOLDER"]
      .map((key) => [key, process.env[key]])),
  }) + "\n")
  const write = (stream: NodeJS.WriteStream, data: string | Buffer) => new Promise<void>((resolve, reject) => {
    stream.write(data, (error) => error ? reject(error) : resolve())
  })
  await Promise.all([
    (async () => {
      if (selected.binary) await write(process.stdout, Buffer.from(selected.binary, "base64"))
      if (selected.stdout) await write(process.stdout, selected.stdout)
      const block = Buffer.from(Array.from({ length: 16 * 1024 }, (_, index) => index % 256))
      for (let index = 0; index < (selected.blocks ?? 0); index++) await write(process.stdout, block)
      if (selected.padding) await write(process.stdout, " ".repeat(selected.padding))
    })(),
    write(process.stderr, selected.stderr ?? ""),
  ])
  if (selected.stdoutEOF) {
    await new Promise<void>((resolve) => process.stdout.end(resolve))
    await fs.writeFile(path.join(root, "stdout-eof"), "closed")
  }
  if (selected.hold) await new Promise(() => setInterval(() => {}, 60_000))
  process.exitCode = selected.code ?? 0
}
`````

### FX-ACTIONS-HTTP-1 — `packages/core/test/fixture/actions-http.ts` 1–51

Commit `1cde2ff7a71bcf7aecb5d030917b577165135d38`; blob `ce1172f936f0b6bcaf9ed48a52def5f88a4e97e3`; SHA256 integral `02e751faa9d50a920cfa59dcb4002daa6a6ced4ae7704885dc33ab72ad115e2a`. Bytes fonte 3115; recorte [0, 3115); SHA256 trecho `02e751faa9d50a920cfa59dcb4002daa6a6ced4ae7704885dc33ab72ad115e2a`.

`````text
export * as ActionsHttpFixture from "./actions-http"

import fs from "node:fs/promises"
import path from "node:path"
import { Effect, Stream } from "effect"
import { ChildProcess } from "effect/unstable/process"
import { AppProcess } from "../../src/process"
import { ActionsTransport } from "../../src/actions/transport"
import { ActionsNetworkFixture } from "./actions-network"
import { ActionsTransportFixture } from "./actions-transport"

export const make = Effect.fnUntraced(function* (mutual = false) {
  const network = yield* ActionsNetworkFixture.make(mutual)
  const executable = yield* network.install()
  const original = { PATH: process.env.PATH, Path: process.env.Path }
  yield* Effect.acquireRelease(Effect.sync(() => {
    process.env.PATH = `${path.dirname(executable)}${path.delimiter}${original.PATH ?? original.Path ?? ""}`
    if (process.platform === "win32") process.env.Path = process.env.PATH
  }), () => Effect.sync(() => {
    Object.entries(original).forEach(([key, value]) => value === undefined ? delete process.env[key] : process.env[key] = value)
  }))
  const config = path.join(network.root, "config")
  yield* Effect.promise(() => fs.mkdir(config, { mode: 0o700 }))
  const configure = (values: Record<string, string | undefined>) => Effect.promise(() => fs.writeFile(path.join(config, "config.yml"), JSON.stringify({ hosts: {
    [network.provider.hostname]: { token: "synthetic-provider", ca_cert: path.join(network.root, "cert.pem"), ...values },
  } }), { mode: 0o600 }))
  yield* configure({})
  const proc = yield* AppProcess.Service
  const observed: string[][] = []
  const state = { beforeLastRead: undefined as (() => Promise<void>) | undefined }
  const service = yield* ActionsTransport.make({ directory: network.root }).pipe(Effect.provideService(AppProcess.Service, {
    ...proc,
    spawn: (command) => {
      if (command._tag !== "StandardCommand" || !command.command.toLowerCase().includes("glab")) return proc.spawn(command)
      observed.push([...command.args])
      if (command.args[0] !== "version" && !(command.args[0] === "config" && command.args[1] === "get"))
        return Effect.die("GitLab fixture forbids API/auth network helpers")
      return proc.spawn(ChildProcess.make(executable, command.args, { ...command.options, env: {
        ...command.options.env, GLAB_CONFIG_DIR: config,
        GITLAB_TOKEN: "", GITLAB_ACCESS_TOKEN: "", OAUTH_TOKEN: "", CI_JOB_TOKEN: "", JOB_TOKEN: "", GLAB_IS_OAUTH2: "", GLAB_USE_KEYRING: "false",
      } })).pipe(Effect.tap((handle) => command.args[2] === "client_key" && state.beforeLastRead
        ? handle.exitCode.pipe(Effect.andThen(Effect.promise(() => state.beforeLastRead?.() ?? Promise.resolve()))) : Effect.void))
    },
    run: () => Effect.die("Credential settings must use bounded inherited capture"),
    runStream: () => Stream.die("Credential settings must not use a line-decoding helper"),
  }))
  return {
    ...network, service, configure, observed, state, config, serverState: network.state,
    binding: () => ActionsTransportFixture.binding(network.root, network.provider),
  }
})
`````

### FX-ACTIONS-NET-1 — `packages/core/test/fixture/actions-network.ts` 16–34

Commit `1cde2ff7a71bcf7aecb5d030917b577165135d38`; blob `2514f128a087fc20f2913dac2b5954f8e048e8b2`; SHA256 integral `00e06a4b4a34d48946dbc5225f5444f479903d0afe52f71d6ba284dd34938905`. Bytes fonte 9034; recorte [616, 1538); SHA256 trecho `60e6b0c542638645faab550f30ec2741dc38028989b81d782a94ca041b78808f`.

`````text
export class Request extends EventEmitter<{ data: [Buffer]; end: [] }> {
  constructor(readonly method: string, readonly url: string, readonly headers: Record<string, string>, readonly socket: TLSSocket) { super() }
}
export class Response {
  constructor(readonly socket: TLSSocket) {}
  writeHead(status: number, headers: Record<string, string>) {
    this.socket.write(`HTTP/1.1 ${status} Status\r\nConnection: close\r\nTransfer-Encoding: chunked\r\n${Object.entries(headers).map(([key, value]) => `${key}: ${value}\r\n`).join("")}\r\n`)
  }
  write(body: string | Buffer) {
    const bytes = Buffer.from(body)
    if (bytes.length) this.socket.write(Buffer.concat([Buffer.from(`${bytes.length.toString(16)}\r\n`), bytes, Buffer.from("\r\n")]))
  }
  end(body?: string | Buffer) {
    if (body) this.write(body)
    this.socket.end("0\r\n\r\n")
  }
}

export const make = Effect.fnUntraced(function* (mutual = false) {
`````

### FX-ACTIONS-NET-2 — `packages/core/test/fixture/actions-network.ts` 34–96

Commit `1cde2ff7a71bcf7aecb5d030917b577165135d38`; blob `2514f128a087fc20f2913dac2b5954f8e048e8b2`; SHA256 integral `00e06a4b4a34d48946dbc5225f5444f479903d0afe52f71d6ba284dd34938905`. Bytes fonte 9034; recorte [1471, 5734); SHA256 trecho `39a3da959cb3cb8e4844b4ae059f168ef69b0c3022e976328be8a0376d84f0da`.

`````text
export const make = Effect.fnUntraced(function* (mutual = false) {
  const proc = yield* AppProcess.Service
  const root = yield* Effect.acquireRelease(Effect.promise(() => fs.mkdtemp(path.join(os.tmpdir(), "actions-network-"))),
    (root) => Effect.promise(() => fs.rm(root, { recursive: true, force: true })))
  const run = (executable: string, args: string[]) => proc.run(ChildProcess.make(executable, args, { cwd: root, extendEnv: true, stdin: "ignore" }),
    { maxOutputBytes: 32 * 1024, maxErrorBytes: 32 * 1024, timeout: "30 seconds" }).pipe(Effect.flatMap(AppProcess.requireSuccess))
  yield* run(process.platform === "win32" ? "C:\\Program Files\\Git\\usr\\bin\\openssl.exe" : "/usr/bin/openssl", [
    "req", "-x509", "-newkey", "rsa:2048", "-nodes", "-keyout", "key.pem", "-out", "cert.pem", "-days", "1",
    "-subj", "/CN=provider.fixture", "-addext", "subjectAltName=DNS:provider.fixture,DNS:localhost,IP:127.0.0.1",
  ])
  const requests: { path: string; method: string; headers: Record<string, string>; size: number; chunks: number; prefix: Buffer; digest?: string; authorized: boolean }[] = []
  const sockets = new Set<TLSSocket>()
  const pending = new Set<Socket>()
  const state = {
    username: "fixture-user", tokenAccounts: {} as Record<string, string>,
    handler: undefined as ((request: Request, response: Response) => void) | undefined,
    onRequest: undefined as (() => void) | undefined,
  }
  const server = yield* Effect.acquireRelease(Effect.promise(async () => createServer({
    key: await fs.readFile(path.join(root, "key.pem")), cert: await fs.readFile(path.join(root, "cert.pem")),
    ca: await fs.readFile(path.join(root, "cert.pem")), requestCert: mutual, rejectUnauthorized: mutual,
  }, (socket) => {
    sockets.add(socket)
    socket.on("close", () => sockets.delete(socket))
    socket.on("error", () => socket.destroy())
    const input = { buffer: Buffer.alloc(0), request: undefined as Request | undefined, chunked: false, remaining: 0, delimiter: false, ended: false }
    const emit = (bytes: Buffer) => input.request?.emit("data", bytes)
    socket.on("data", (bytes: Buffer) => {
      input.buffer = Buffer.concat([input.buffer, bytes])
      if (!input.request) {
        const end = input.buffer.indexOf("\r\n\r\n")
        if (end < 0) { if (input.buffer.length > 64 * 1024) socket.destroy(); return }
        const lines = input.buffer.subarray(0, end).toString().split("\r\n")
        const [method, url] = lines[0].split(" ")
        const headers = Object.fromEntries(lines.slice(1).map((line) => {
          const at = line.indexOf(":"); return [line.slice(0, at).toLowerCase(), line.slice(at + 1).trim()]
        }))
        input.buffer = input.buffer.subarray(end + 4)
        input.request = new Request(method, url, headers, socket)
        input.chunked = headers["transfer-encoding"] === "chunked"
        input.remaining = Number(headers["content-length"] ?? 0)
        const observed = { path: url, method, headers, size: 0, chunks: 0, prefix: Buffer.alloc(0), digest: undefined as string | undefined, authorized: socket.authorized }
        requests.push(observed)
        const hash = createHash("sha256")
        input.request.on("data", (chunk) => {
          hash.update(chunk); observed.size += chunk.length; observed.chunks++
          if (observed.prefix.length < 64 * 1024) observed.prefix = Buffer.concat([observed.prefix, chunk.subarray(0, 64 * 1024 - observed.prefix.length)])
        })
        input.request.on("end", () => { observed.digest = hash.digest("hex") })
        const response = new Response(socket)
        state.onRequest?.()
        if (state.handler) state.handler(input.request, response)
        if (!state.handler) {
          const respond = () => {
            response.writeHead(200, { "Content-Type": "application/json" })
            const token = headers["private-token"] ?? headers["job-token"] ?? headers.authorization ?? ""
            response.end(JSON.stringify({ id: 913, username: state.tokenAccounts[token] ?? state.username, path_with_namespace: "acme/nested/widget" }))
          }
          if (method === "GET") respond()
          if (method !== "GET") input.request.once("end", respond)
        }
      }
      while (!input.ended) {
`````

### FX-ACTIONS-NET-3 — `packages/core/test/fixture/actions-network.ts` 113–147

Commit `1cde2ff7a71bcf7aecb5d030917b577165135d38`; blob `2514f128a087fc20f2913dac2b5954f8e048e8b2`; SHA256 integral `00e06a4b4a34d48946dbc5225f5444f479903d0afe52f71d6ba284dd34938905`. Bytes fonte 9034; recorte [6602, 9034); SHA256 trecho `411fa8a056d658d8251a1f5986d9d198001b588fdd32cafc2823ff679adcea01`.

`````text
        if (input.chunked && !input.remaining) input.delimiter = true
      }
    })
  })), (server) => Effect.promise(() => new Promise<void>((resolve) => {
    pending.forEach((socket) => socket.destroy())
    sockets.forEach((socket) => socket.destroy())
    server.close(() => resolve())
  })))
  server.on("connection", (socket) => { pending.add(socket); socket.on("close", () => pending.delete(socket)) })
  server.on("tlsClientError", (_error, socket) => socket.destroy())
  yield* Effect.promise(() => new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve)))
  const address = server.address()
  if (!address || typeof address === "string") return yield* Effect.die("Fixture TLS server has no address")
  return {
    root, requests, run, state, sockets,
    provider: { kind: "gitlab", hostname: `127.0.0.1:${address.port}`, apiOrigin: `https://127.0.0.1:${address.port}` } as const,
    install: () => Effect.gen(function* () {
      const windows = process.platform === "win32"
      if (process.arch !== "x64" || (!windows && process.platform !== "linux")) return yield* Effect.die("Real glab qualification requires Linux/Windows x64 CI")
      const asset = windows ? "glab_1.118.0_windows_amd64.zip" : "glab_1.118.0_linux_amd64.tar.gz"
      const bytes = yield* Effect.promise(async () => {
        const response = await fetch(`https://gitlab.com/gitlab-org/cli/-/releases/v1.118.0/downloads/${asset}`, { signal: AbortSignal.timeout(60_000) })
        if (!response.ok) throw new Error(`glab fixture download failed: HTTP ${response.status}`)
        return Buffer.from(await response.arrayBuffer())
      })
      const expected = windows ? "f9e843edb625a6f78686d8f421f1e80f98f76fe993b75263c1aa9f428c8a32ff" : "f3782ddb62b6ab20d0031699ea7b43f345dc6f63e991883660e21343b9524931"
      if (createHash("sha256").update(bytes).digest("hex") !== expected) return yield* Effect.die("glab fixture release digest mismatch")
      yield* Effect.promise(() => fs.writeFile(path.join(root, asset), bytes))
      yield* run(windows ? path.join(process.env.SystemRoot ?? "C:\\Windows", "System32", "tar.exe") : "/usr/bin/tar", ["-xf", asset, "-C", root])
      const executable = path.join(root, "bin", windows ? "glab.exe" : "glab")
      if (!(yield* Effect.promise(() => Bun.file(executable).exists()))) return yield* Effect.die("glab release fixture executable missing")
      return executable
    }),
  }
})
`````

### FX-ACTIONS-RESOURCE-1 — `packages/core/test/fixture/actions-resource-runtime.ts` 10–88

Commit `1cde2ff7a71bcf7aecb5d030917b577165135d38`; blob `f9b781998239981f66931ce0553a00de6df5a931`; SHA256 integral `b0eb11329f6c23392d375911208cc0af81184a04b79da4b038c1ad065af84367`. Bytes fonte 11279; recorte [429, 8378); SHA256 trecho `7762e9306fa99d753eee5fe7aa1f5ae8afe8eed9ccbeead8a89030e15cf02c37`.

`````text
export const commit = "a".repeat(40)
export const blob = "b".repeat(40)
export const githubRunner = { id: 71, name: "build-linux", os: "linux", status: "online", busy: false,
  labels: [{ name: "self-hosted", type: "read-only" }, { name: "Linux", type: "read-only" }, { name: "X64", type: "read-only" }, { name: "build", type: "custom" }] }
export const gitlabRunner = { id: 71, description: "build-linux", runner_type: "project_type", status: "online", paused: false,
  job_execution_status: "idle", tag_list: ["linux", "x64", "build"], locked: false, projects: [{ id: 9347 }] }
export const schedule = { id: 13, description: "Nightly", cron: "17 2 * * *", cron_timezone: "UTC", ref: "refs/heads/dev", active: true,
  updated_at: "2026-10-13T00:00:00Z", owner: { id: 913, username: "fixture-user" }, inputs: [], variables: [] }
export const cache = { id: 87, key: "deps-lock", ref: "refs/heads/dev", version: "native-cache-version", size_in_bytes: 456,
  created_at: "2026-10-12T00:00:00Z", last_accessed_at: "2026-10-13T00:00:00Z" }
export type Observed = { readonly method: string; readonly path: string; readonly query: Readonly<Record<string, string>>; readonly body: ActionsContract.Json }
export type Reply = { readonly status?: number; readonly headers?: Readonly<Record<string, string>>; readonly data?: ActionsContract.Json; readonly reset?: boolean }

export const make = Effect.fnUntraced(function* (provider: Actions.ProviderKind = "github") {
  const requests: Observed[] = []
  const state = { handler: undefined as ((request: Observed) => Reply | Promise<Reply> | undefined) | undefined,
    ownerProjectID: "9347", metadataVersion: "18.1.0", username: "fixture-user", source: "name: Nightly\non:\n  push:\n  schedule:\n    - cron: '17 2 * * *' # keep cron comment\njobs:\n  test:\n    runs-on: ubuntu-latest\n    steps:\n      - run: echo ok # keep job comment\n" }
  const native = (observed: Observed): Reply => {
    if (observed.path === "user") return { data: { id: 913, login: state.username, username: state.username } }
    if (observed.path === "metadata") return { data: { version: state.metadataVersion } }
    if (observed.path === "repositories/9347") return { data: { id: 9347, full_name: "acme/widget", default_branch: "dev", private: true,
      permissions: { push: true, admin: true }, archived: false }, headers: { "x-oauth-scopes": "repo, workflow" } }
    if (observed.path === "projects/9347") return { data: { id: 9347, path_with_namespace: "acme/widget", name: "widget", default_branch: "dev",
      ci_config_path: null, jobs_enabled: true, archived: false, permissions: { project_access: { access_level: 40 }, group_access: null } } }
    if (observed.path.includes("/commits/")) return { data: { sha: commit, id: commit } }
    if (observed.path === "repositories/9347/actions/runners") return { data: { total_count: 1, runners: [githubRunner] } }
    if (observed.path === "repositories/9347/actions/runners/71") return observed.method === "DELETE" ? { status: 204 } : { data: githubRunner }
    if (observed.path === "repositories/9347/actions/runners/71/labels") return { data: { labels: [{ name: "gpu", type: "custom" }] } }
    if (observed.path === "projects/9347/runners") return { data: [gitlabRunner], headers: { "x-next-page": "", "x-total": "1" } }
    if (observed.path === "runners/71") return { data: gitlabRunner }
    if (observed.path === "api/graphql") return { data: Schema.is(Schema.Struct({ kind: Schema.Literal("cacheClear") }))(observed.body)
      ? { data: { runnerCacheClear: { errors: [] } } } : { data: { runner: { id: "gid://gitlab/Ci::Runner/71", runnerType: "PROJECT_TYPE",
        ownerProject: { id: `gid://gitlab/Project/${state.ownerProjectID}` }, tagList: gitlabRunner.tag_list } } } }
    if (observed.path === "repositories/9347/actions/caches") return { data: { total_count: 1, actions_caches: [cache] } }
    if (observed.path === "repositories/9347/actions/caches/87") return { status: 204 }
    if (observed.path === "repositories/9347/actions/cache/usage") return { data: { full_name: "acme/widget", active_caches_size_in_bytes: 456, active_caches_count: 1 } }
    if (observed.path === "projects/9347/pipeline_schedules") return observed.method === "GET" ? { data: [schedule], headers: { "x-next-page": "", "x-total": "1" } } : { data: schedule, status: 201 }
    if (observed.path === "projects/9347/pipeline_schedules/13") return { data: schedule }
    if (observed.path === "repositories/9347/actions/workflows/24") return { data: { id: 24, path: ".github/workflows/nightly.yml", name: "Nightly", state: "active" } }
    if (observed.path === "repositories/9347/contents/.github/workflows")
      return { data: [{ type: "file", name: "nightly.yml", path: ".github/workflows/nightly.yml", sha: blob }] }
    if (observed.path === "fixture/workflows") return { data: { items: [{ id: "24", bindingID: binding.id, name: "Nightly", path: ".github/workflows/nightly.yml", state: "active", dispatchable: false }], capturedAt: Date.now() } }
    if (observed.path === "fixture/source") return { data: { bindingID: binding.id, path: observed.query.path,
      ref: observed.query.ref, commit, version: blob, text: state.source, editable: true } }
    return { status: 404, data: { message: "Unknown fixture endpoint" } }
  }
  const server = yield* Effect.acquireRelease(Effect.promise(() => new Promise<ReturnType<typeof createServer>>((resolve, reject) => {
    const handle = createServer((request, response) => {
      const chunks: Buffer[] = []
      request.on("data", (chunk: Buffer) => chunks.push(chunk))
      request.once("end", () => {
        const address = new URL(request.url ?? "/", "http://localhost")
        const body = Schema.decodeUnknownOption(Schema.fromJsonString(Schema.Json))(Buffer.concat(chunks).toString() || "null")
        const observed = { method: request.method ?? "GET", path: address.pathname.replace(/^\//, ""), query: Object.fromEntries(address.searchParams), body: Option.isSome(body) ? body.value : null }
        requests.push(observed)
        void Promise.resolve(state.handler?.(observed) ?? native(observed)).then((reply) => {
          if (reply.reset) { request.socket.destroy(); return }
          response.writeHead(reply.status ?? 200, { "content-type": "application/json", ...reply.headers })
          response.end(reply.data === undefined ? "" : JSON.stringify(reply.data))
        }, () => request.socket.destroy())
      })
    })
    handle.once("error", reject)
    handle.listen(0, "127.0.0.1", () => resolve(handle))
  })), (handle) => Effect.promise(() => new Promise<void>((resolve) => { handle.closeAllConnections(); handle.close(() => resolve()) })))
  const address = server.address()
  if (!address || typeof address === "string") return yield* Effect.die("Resource fixture listener did not allocate a TCP port")
  const binding = Actions.Binding.make({ id: Actions.BindingID.make("ab_resource-fixture"), revision: 1, projectID: "9347", projectPath: "acme/widget",
    account: "fixture-user", directory: "/fixture", remote: "origin", provider: provider === "github"
      ? { kind: "github", hostname: "github.com", apiOrigin: "https://api.github.com" }
      : { kind: "gitlab", hostname: "gitlab.com", apiOrigin: "https://gitlab.com/api/v4", version: "99.0.0" } })
  const send: ActionsContract.Transport["request"] = (_binding, input) => Effect.tryPromise({
    try: async (signal) => {
      const url = new URL(input.path, `http://127.0.0.1:${address.port}/`)
      Object.entries(input.query ?? {}).forEach(([key, value]) => url.searchParams.set(key, String(value)))
      // A transport fixture must not replay DELETE after the peer consumed it.
      // Bun fetch retries reusable idempotent connections; a fresh raw request does not.
      return new Promise<ActionsContract.Response>((resolve, reject) => {
        const sent = request(url, { method: input.method, signal, agent: false,
`````

### FX-ACTIONS-RESOURCE-2 — `packages/core/test/fixture/actions-resource-runtime.ts` 118–121

Commit `1cde2ff7a71bcf7aecb5d030917b577165135d38`; blob `f9b781998239981f66931ce0553a00de6df5a931`; SHA256 integral `b0eb11329f6c23392d375911208cc0af81184a04b79da4b038c1ad065af84367`. Bytes fonte 11279; recorte [10840, 11279); SHA256 trecho `fe95e6a1b69e93449c7d2db89c37df60949b7f2108adba6f644e9843606d90bc`.

`````text
export function intent(binding: Actions.Binding, kind: Actions.OperationKind, resourceKind: Actions.ResourceKind, resourceID?: string, expected?: Actions.OperationExpected): Actions.OperationIntent {
  return { clientID: "resource-fixture", binding: { id: binding.id, revision: binding.revision }, kind,
    target: { resourceKind, ...(resourceID === undefined ? {} : { resourceID }) }, ...(expected === undefined ? {} : { expected }) }
}
`````

### FX-ACTIONS-CAPTURE-1 — `packages/core/test/fixture/actions-transport.ts` 88–115

Commit `1cde2ff7a71bcf7aecb5d030917b577165135d38`; blob `b8eb249ded98ce2d8fa3aa32922dd645bf724f8a`; SHA256 integral `5b475ea84f3f0f8af22f5df1b747168b7338b2c40581dfa77d674bf2d935584f`. Bytes fonte 6333; recorte [4927, 6330); SHA256 trecho `0e77ace55d17706949baccdb7e522181919e953465fcd2cfdd54652608ab2704`.

`````text
  const reply = (value: Reply) => Effect.promise(() => {
    current.reply = value
    return fs.writeFile(path.join(root, "reply.json"), JSON.stringify({ ...value,
      settings: { token: "synthetic-provider", ca_cert: path.join(network.root, "cert.pem"), ...value.settings },
    }))
  })
  yield* reply(initial)
  return {
    root, service, handles, commands, reply, network,
    stopped: (index = 0) => Effect.promise(async () => {
      // TestClock wakes the watchdog, but does not wait for the OS exit callback.
      const deadline = Date.now() + 2000
      while (Date.now() < deadline && await Effect.runPromise(handles[index].isRunning)) await Bun.sleep(10)
    }),
    binding: (provider = github) => binding(root, provider === gitlab ? network.provider : provider),
    ready: (file = "ready") => Effect.promise(async () => {
      const deadline = Date.now() + 10_000
      while (Date.now() < deadline) {
        if (await Bun.file(path.join(root, file)).exists()) return
        await Bun.sleep(10)
      }
      throw new Error("Subprocess fixture never became ready")
    }),
    calls: () => Effect.promise(async () => (await fs.readFile(path.join(root, "calls.jsonl"), "utf8"))
      .trim().split("\n").map((line) => JSON.parse(line) as {
        argv: string[]; stdin: string; size: number; digest: string; chunks: number; env: Record<string, string>; cwd: string
      })),
  }
`````

### FX-GH-COMMAND-1 — `packages/core/test/fixture/github-command.ts` 52–126

Commit `1cde2ff7a71bcf7aecb5d030917b577165135d38`; blob `a09ca7239ea60005d46effc61ed058056eb3a422`; SHA256 integral `57fa89f7be52b60e3e8522f91652671e571985dbeb70d274911b17bad3da6ca3`. Bytes fonte 7635; recorte [1677, 7635); SHA256 trecho `54301eb9fe45779e0da5b3e7c1360ebde729438e19732cc7e86f3cfb2b275049`.

`````text
export const content = (text: string) => ({ ...GitHubReadFixture.content, path: pathName,
  sha: createHash("sha1").update(`blob ${Buffer.byteLength(text)}\0`).update(text).digest("hex"),
  size: Buffer.byteLength(text), content: Buffer.from(text).toString("base64") })
export const run = { ...GitHubReadFixture.run, conclusion: "failure" }
export const job = { ...GitHubReadFixture.job, run_attempt: run.run_attempt }
export const reply = GitHubReadFixture.response
export const key = (request: ActionsContract.Request) => `${request.method} ${GitHubReadFixture.key(request)}`
export const intent = (kind: Actions.OperationKind = "workflow.dispatch", target: Actions.OperationTarget = { workflowID: "161335", ref: "release" }, expected: Actions.OperationExpected = {}) =>
  Actions.OperationIntent.make({ clientID: "command-owner", binding: { id: binding.id, revision: binding.revision }, kind, target, expected })
export const dispatch = { provider: "github", ref: "release", inputs: { message: "native fixture" } } as const

export function recorded() {
  const routes: Record<string, ActionsContract.Response | ActionsError> = {
    [`GET ${root}`]: reply(GitHubReadFixture.repo, { "x-oauth-scopes": "repo", "x-github-api-version-selected": "2026-03-10" }),
    "GET user": reply({ id: 1, login: binding.account }),
    [`GET ${root}/actions/workflows/161335`]: reply(GitHubReadFixture.workflow, { etag: '"workflow-v1"' }),
    [`GET ${root}/commits/main`]: reply({ sha: GitHubReadFixture.sha }),
    [`GET ${root}/commits/release`]: reply({ sha: commit }),
    [`GET ${root}/commits/${run.head_sha}`]: reply({ sha: run.head_sha }),
    [`GET ${root}/contents/${pathName}?ref=${GitHubReadFixture.sha}`]: reply(content(text)),
    [`GET ${root}/contents/${pathName}?ref=${commit}`]: reply(content(text)),
    [`GET ${root}/environments/prod`]: reply({ id: 41, name: "prod" }),
    [`POST ${root}/actions/workflows/161335/dispatches`]: reply({ workflow_run_id: 9101,
      run_url: `https://api.github.com/${root}/actions/runs/9101`, html_url: "https://github.com/acme/renamed/actions/runs/9101" }),
    [`PUT ${root}/actions/workflows/161335/enable`]: { status: 204, headers: {}, data: null },
    [`PUT ${root}/actions/workflows/161335/disable`]: { status: 204, headers: {}, data: null },
    [`GET ${root}/actions/runs/30433642`]: reply(run, { etag: '"run-v1"' }),
    [`POST ${root}/actions/runs/30433642/rerun`]: { status: 201, headers: {}, data: null },
    [`POST ${root}/actions/runs/30433642/rerun-failed-jobs`]: { status: 204, headers: {}, data: null },
    [`POST ${root}/actions/runs/30433642/cancel`]: { status: 202, headers: {}, data: null },
    [`POST ${root}/actions/runs/30433642/force-cancel`]: { status: 202, headers: {}, data: null },
    [`DELETE ${root}/actions/runs/30433642`]: { status: 204, headers: {}, data: null },
    [`POST ${root}/actions/runs/30433642/approve`]: { status: 201, headers: {}, data: null },
    [`GET ${root}/actions/jobs/399444496`]: reply(job, { etag: '"job-v1"' }),
    [`POST ${root}/actions/jobs/399444496/rerun`]: { status: 201, headers: {}, data: null },
  }
  const calls: ActionsContract.Request[] = []
  const state: { after?: (request: ActionsContract.Request) => void } = {}
  const transport: ActionsContract.Transport = {
    resolve: () => Effect.die("Command must not resolve a mutable repository path"),
    request: (_, request) => Effect.suspend(() => {
      calls.push(request)
      const response = routes[key(request)]
      if (!response) return Effect.die(`Unrecorded command request: ${key(request)}`)
      state.after?.(request)
      return response instanceof ActionsError ? Effect.fail(response) : Effect.succeed(response)
    }), bytes: () => Stream.die("Unexpected transfer"), upload: () => Effect.die("Unexpected upload"),
  }
  const reader = ActionsGitHubRead.make({ transport })
  return { routes, calls, state, transport, reader, commands: ActionsGitHubCommands.make({ transport, reader }),
    writes: () => calls.filter((request) => request.method !== "GET") }
}

// Real W1 inherited spawner/capture/decoder. Provider and gh replies remain synthetic.
export const subprocess = Effect.fnUntraced(function* () {
  const root = yield* Effect.acquireRelease(Effect.promise(() => fs.mkdtemp(path.join(os.tmpdir(), "github-command-"))),
    (root) => Effect.promise(() => fs.rm(root, { recursive: true, force: true })))
  const proc = yield* AppProcess.Service
  const requests: ActionsContract.Request[] = []
  const request = Effect.fnUntraced(function* (binding: Actions.Binding, input: ActionsContract.Request) {
    requests.push(input)
    const endpoint = yield* ActionsCli.endpoint(binding.provider, input)
    const body = input.body === undefined ? Stream.empty : Stream.make(new TextEncoder().encode(JSON.stringify(input.body)))
    const command = ActionsCli.command(root, binding.provider, process.execPath,
      [path.resolve(import.meta.dirname, "github-command-cli.ts"), root, ...ActionsCli.args(binding.provider, input, endpoint, true)], input.body === undefined ? "ignore" : "pipe")
    return yield* ActionsProcess.capture(proc, binding.provider, command, body).pipe(Effect.flatMap((result) => ActionsResponse.parse(binding.provider, result)))
  })
  const transport: ActionsContract.Transport = { request, resolve: () => Effect.die("Unexpected mutable resolve"),
    bytes: () => Stream.die("Unexpected bytes"), upload: () => Effect.die("Unexpected upload") }
  const reader = ActionsGitHubRead.make({ transport })
  return { root, requests, commands: ActionsGitHubCommands.make({ transport, reader }),
    reply: (routes: Record<string, { status?: number; data?: ActionsContract.Json; raw?: string; headers?: Readonly<Record<string, string>>; code?: number }>) =>
      Effect.promise(() => Bun.write(path.join(root, "routes.json"), JSON.stringify(routes))),
    calls: () => Effect.promise(() => Bun.file(path.join(root, "calls.jsonl")).text()) }
})
`````

### FX-GH-CLI-1 — `packages/core/test/fixture/github-command-cli.ts` 1–16

Commit `1cde2ff7a71bcf7aecb5d030917b577165135d38`; blob `55deea5d4c2d1d1c3268e024966d2941cbc49bf6`; SHA256 integral `bdbc66639f1d6b42950930872773b92c2f74a4fedb6e77cb9411489cd235e506`. Bytes fonte 1178; recorte [0, 1178); SHA256 trecho `bdbc66639f1d6b42950930872773b92c2f74a4fedb6e77cb9411489cd235e506`.

`````text
import fs from "node:fs/promises"
import path from "node:path"
import { Schema } from "effect"

const args = process.argv.slice(3)
const routes = Schema.decodeUnknownSync(Schema.Record(Schema.String, Schema.Struct({
  status: Schema.optionalKey(Schema.Int), code: Schema.optionalKey(Schema.Int), raw: Schema.optionalKey(Schema.String),
  data: Schema.optionalKey(Schema.Json), headers: Schema.optionalKey(Schema.Record(Schema.String, Schema.String)),
})))(await Bun.file(path.join(process.argv[2], "routes.json")).json())
const selected = routes[`${args[args.indexOf("--method") + 1]} ${args.at(-1)}`]
if (!selected) throw new Error("Unrecorded native command route")
const stdin = await new Response(Bun.stdin.stream()).text()
await fs.appendFile(path.join(process.argv[2], "calls.jsonl"), JSON.stringify({ args, stdin }) + "\n")
process.stdout.write(`HTTP/2.0 ${selected.status ?? 200} Status\r\nContent-Type: application/json\r\n${Object.entries(selected.headers ?? {}).map(([key, value]) => `${key}: ${value}\r\n`).join("")}\r\n`)
process.stdout.write(selected.raw ?? (selected.data === undefined ? "" : JSON.stringify(selected.data)))
process.exitCode = selected.code ?? 0
`````

### FX-GH-READCLI-1 — `packages/core/test/fixture/github-read-cli.ts` 1–15

Commit `1cde2ff7a71bcf7aecb5d030917b577165135d38`; blob `98319cced55abb5dc907d5c8739aa2959522a9fa`; SHA256 integral `997ee1c547a3d457d21663ced05b9f4c74170113946c3b7329af5789d5395798`. Bytes fonte 1078; recorte [0, 1078); SHA256 trecho `997ee1c547a3d457d21663ced05b9f4c74170113946c3b7329af5789d5395798`.

`````text
// Protocol fixture only. W1 production capture/decoder handles these raw bytes.
import path from "node:path"
import { Schema } from "effect"

const routes = Schema.decodeUnknownSync(Schema.Record(Schema.String, Schema.Struct({
  status: Schema.optionalKey(Schema.Int), code: Schema.optionalKey(Schema.Int), padding: Schema.optionalKey(Schema.Int),
  raw: Schema.optionalKey(Schema.String), data: Schema.optionalKey(Schema.Json),
  headers: Schema.optionalKey(Schema.Record(Schema.String, Schema.String)),
})))(await Bun.file(path.join(process.argv[2], "routes.json")).json())
const route = routes[process.argv.at(-1) ?? ""]
if (!route) throw new Error(`Unrecorded subprocess route: ${process.argv.at(-1)}`)
process.stdout.write(`HTTP/2.0 ${route.status ?? 200} Status\r\nContent-Type: application/json\r\n${Object.entries(route.headers ?? {}).map(([key, value]) => `${key}: ${value}\r\n`).join("")}\r\n`)
process.stdout.write(route.raw ?? JSON.stringify(route.data ?? null))
if (route.padding) process.stdout.write(" ".repeat(route.padding))
process.exitCode = route.code ?? 0
`````

### FX-GIT-1 — `packages/core/test/fixture/git.ts` 1–49

Commit `1cde2ff7a71bcf7aecb5d030917b577165135d38`; blob `e9242b2c69f100fbce39f067eb2fc58789f8324f`; SHA256 integral `bd0fc4f57f9a71f7fe2c83a6a42af1b55a2b1aff10bd02a4264c3d9837b1c808`. Bytes fonte 1838; recorte [0, 1838); SHA256 trecho `bd0fc4f57f9a71f7fe2c83a6a42af1b55a2b1aff10bd02a4264c3d9837b1c808`.

`````text
import { execFile } from "child_process"
import fs from "fs/promises"
import path from "path"
import { promisify } from "util"
import { pathToFileURL } from "url"
import { Repository } from "@orchestra/core/repository"

const exec = promisify(execFile)

export async function gitRemote(root: string) {
  const origin = path.join(root, "origin.git")
  const source = path.join(root, "source")
  await git(root, "init", "--bare", origin)
  await git(root, "init", source)
  await git(source, "config", "user.email", "test@example.com")
  await git(source, "config", "user.name", "Test")
  await fs.writeFile(path.join(source, "README.md"), "one\n")
  await git(source, "add", "README.md")
  await git(source, "commit", "-m", "initial")
  await git(source, "branch", "-M", "main")
  await git(source, "remote", "add", "origin", pathToFileURL(origin).href)
  await git(source, "push", "-u", "origin", "main")
  await git(root, "--git-dir", origin, "symbolic-ref", "HEAD", "refs/heads/main")
  return {
    root,
    source,
    remote: pathToFileURL(origin).href,
    reference: { ...Repository.parseRemote("owner/repo"), remote: pathToFileURL(origin).href },
  }
}

export async function commit(source: string, content: string, message: string) {
  await fs.writeFile(path.join(source, "README.md"), content)
  await git(source, "add", "README.md")
  await git(source, "commit", "-m", message)
  await git(source, "push")
}

export async function branch(source: string, name: string, content: string) {
  await git(source, "checkout", "-b", name)
  await fs.writeFile(path.join(source, "README.md"), content)
  await git(source, "add", "README.md")
  await git(source, "commit", "-m", name)
  await git(source, "push", "-u", "origin", name)
}

export async function git(cwd: string, ...args: string[]) {
  await exec("git", args, { cwd })
}
`````

### FX-CAP-ARTIFACTS-1 — `packages/core/test/fixture/capability-artifacts.ts` 27–72

Commit `1cde2ff7a71bcf7aecb5d030917b577165135d38`; blob `91e8f3115d0c8d526e3f13900dcc9519f0a0e7ee`; SHA256 integral `12a6c7dba29bc2262fbe5bb7ed2281b760f014c4692f98befa58769d76bee2c9`. Bytes fonte 3986; recorte [1356, 3986); SHA256 trecho `2feec2ab495e00810c0f86e26804ebec40ea5774c7ca410ecc471a7c220b1d42`.

`````text
export const host = Layer.unwrap(Effect.acquireRelease(
  Effect.promise(() => tmpdir()), (tmp) => Effect.promise(() => tmp[Symbol.asyncDispose]()),
).pipe(Effect.map((tmp) => Layer.mergeAll(
  Layer.succeed(Location.Service, location({ directory: AbsolutePath.make(tmp.path) })),
  Global.layerWith({
    data: join(tmp.path, "data"), config: join(tmp.path, "config"), state: join(tmp.path, "state"),
    cache: join(tmp.path, "cache"), tmp: join(tmp.path, "tmp"), home: tmp.path,
    bin: join(tmp.path, "bin"), log: join(tmp.path, "log"), repos: join(tmp.path, "repos"),
  }),
))))
export const it = testEffect(AppNodeBuilder.build(LayerNode.group([
  Database.node, EventV2.node, SessionProjector.node, SessionStore.node, PermissionV2.node,
  AgentV2.node, Location.node, PermissionSaved.node, FSUtil.node, Global.node,
]), [
  [Database.node, Layer.unwrap(Effect.map(Location.Service,
    (placement) => Database.layerFromPath(join(placement.directory, "artifacts.sqlite")),
  )).pipe(Layer.provide(host))], [Location.node, host], [Global.node, host],
]))
export const allow: PermissionV2.Ruleset = [{ action: "artifact.*", resource: "*", effect: "allow" }]
export const input: CapabilityArtifacts.Input = {
  data: new TextEncoder().encode("durable ✓"), mime: "text/plain", kind: "document", verification: "observed",
  metadata: { secret: "host-private", title: "unicode ✓" },
}

export function fixture(options: Parameters<typeof CapabilityPolicyFixture.fixture>[0] = {}) {
  return Effect.gen(function* () {
    const f = yield* CapabilityPolicyFixture.fixture(options)
    const placement = yield* Location.Service
    yield* f.database.db.update(SessionTable).set({ directory: placement.directory })
      .where(eq(SessionTable.id, f.context.sessionID)).run()
    yield* CapabilityPolicyFixture.setRules(allow)
    const binding: CapabilityInvocation.HostInput = {
      ...f.binding, owner: { ...f.binding.owner, location: { directory: placement.directory } }, effectiveRules: allow,
    }
    return { ...f, binding, root: join(placement.directory, "artifacts") }
  })
}

export function expectCode(error: unknown, code: CapabilityArtifacts.Failure["code"] | Capability.Failure["code"]) {
  expect(error instanceof CapabilityArtifacts.Failure || error instanceof Capability.Failure).toBe(true)
  if (!(error instanceof CapabilityArtifacts.Failure) && !(error instanceof Capability.Failure))
    throw new Error("Expected typed artifact failure")
  expect(error.code).toBe(code)
  expect(JSON.stringify(error)).not.toContain("host-private")
  expect(JSON.stringify(error)).not.toContain("orchestra-core-test-")
}
`````

### FX-CAP-CHANNEL-1 — `packages/core/test/fixture/capability-channel.ts` 35–82

Commit `1cde2ff7a71bcf7aecb5d030917b577165135d38`; blob `7bdefc9462c7d62d587ee8c08fe12b81f437cc46`; SHA256 integral `da12b0163754f1a2343a1688bf6aeb5e656eff77fb3d30afa6749d59e7019a13`. Bytes fonte 31357; recorte [2016, 5657); SHA256 trecho `25ae5d93566a5827f11dd73678851ee88442540127101d54d7f4077c4d1e50b5`.

`````text
export const it = testEffect(Layer.unwrap(Effect.gen(function* () {
  const tmp = yield* Effect.acquireRelease(Effect.promise(() => tmpdir()),
    (tmp) => Effect.promise(() => tmp[Symbol.asyncDispose]()))
  return AppNodeBuilder.build(LayerNode.group([
    Database.node, EventV2.node, SessionProjector.node, SessionStore.node, PermissionV2.node,
    PermissionSaved.node, AgentV2.node, Location.node, FSUtil.node, Global.node, Credential.node,
  ]), [
    [Database.node, Database.layerFromPath(join(tmp.path, "channels.sqlite"))],
    [Location.node, Layer.succeed(Location.Service, Location.Service.of(CapabilityPolicyFixture.placement))],
    [Global.node, Global.layerWith({ data: tmp.path, home: tmp.path })],
    [Credential.node, Credential.layerFrom(undefined)],
  ])
})))
export const rules: PermissionV2.Ruleset = [{ action: "*", resource: "*", effect: "allow" }]
export const token = "fixture-selected-secret"
export const newerToken = "fixture-newer-secret"
export type Name = "channel_read" | "channel_send" | "channel_update"
export type Transaction = Parameters<Parameters<Database.Interface["db"]["transaction"]>[0]>[0]
export type StoredMessage = { id: string; text: string; threadID?: string; replyTo?: string; ownEmoji: string[]; broadcast?: boolean;
  type?: number; reference?: { type?: number; messageID?: string; channelID?: string; guildID?: string } }
export const Body = Schema.Struct({ text: Schema.optionalKey(Schema.String), content: Schema.optionalKey(Schema.String),
  channel: Schema.optionalKey(Schema.String), ts: Schema.optionalKey(Schema.String), timestamp: Schema.optionalKey(Schema.String),
  name: Schema.optionalKey(Schema.String), thread_ts: Schema.optionalKey(Schema.String),
  message_reference: Schema.optionalKey(Schema.Struct({ message_id: Schema.String, channel_id: Schema.String, fail_if_not_exists: Schema.Boolean })),
})

export function fixture(provider: "slack" | "discord", options: {
  root?: Name; boundThread?: boolean; credential?: Credential.Value; endpoint?: string; quota?: number; timeoutMs?: number; maxResponseBytes?: number; acceptedID?: string
} = {}) {
  return Effect.gen(function* () {
    const f = yield* CapabilityPolicyFixture.fixture({ name: options.root ?? "channel_send" })
    yield* CapabilityPolicyFixture.setRules(rules)
    const binding = { ...f.binding, rootToolName: options.root ?? "channel_send", effectiveRules: rules }
    const credentials = yield* Credential.Service
    const integrationID = Integration.ID.make(`fixture-${provider}`)
    const selected = yield* credentials.create({ integrationID, value: options.credential ?? { type: "key", key: token }, label: "selected" })
    yield* credentials.create({ integrationID, value: { type: "key", key: newerToken }, label: "newer same endpoint" })
    const connections = yield* CapabilityConnections.make
    const jobs = yield* CapabilityJobs.make
    const global = yield* Global.Service
    const artifacts = yield* CapabilityArtifacts.make({ root: join(global.data, "evidence"), quota: options.quota })
    const connection = yield* connections.create({ provider, integrationID, credentialID: selected.id,
      subjectID: provider === "slack" ? "U1" : "99", endpoint: options.endpoint ?? (provider === "slack" ? "https://slack.com/api" : "https://discord.com/api/v10"),
      scopeHash: "a".repeat(64) })
    const channelID = provider === "slack" ? "C1" : "10"
    const threadID = provider === "slack" ? "100.000001" : "20"
    const messageID = provider === "slack" ? "101.000001" : "101"
    const target = yield* connections.createTarget(connection, { environment: "fixture", resource: {
`````

### FX-CAP-CHANNEL-2 — `packages/core/test/fixture/capability-channel.ts` 235–259

Commit `1cde2ff7a71bcf7aecb5d030917b577165135d38`; blob `7bdefc9462c7d62d587ee8c08fe12b81f437cc46`; SHA256 integral `da12b0163754f1a2343a1688bf6aeb5e656eff77fb3d30afa6749d59e7019a13`. Bytes fonte 31357; recorte [19020, 20961); SHA256 trecho `158505e28d8299872921db7f017600ce1f1343fdb8a28d8d7a99776c5738523b`.

`````text
        const parts = url.pathname.split("/")
        const routeChannel = parts[4] ?? ""
        const exact = parts[6]
        if (exact) {
          const message = messages.get(exact)
          return message ? json(wire(message, routeChannel)) : json({ code: state.ambiguousMissing ? 10003 : 10008, message: "Unknown Message" }, 404)
        }
        const page = (state.emptyHistory ? [] : [...messages.values()]).filter((message) => !url.searchParams.has("before") || BigInt(message.id) < BigInt(url.searchParams.get("before") ?? "0"))
          .sort((left, right) => Number(BigInt(right.id) - BigInt(left.id))).slice(0, Number(url.searchParams.get("limit") ?? 20))
        return json(page.map((message) => wire(message, routeChannel)))
      },
    })), (server) => Effect.promise(() => server.stop(true)))
    const agents = yield* AgentV2.Service
    const makeOptions = { connections, jobs, artifacts, fixtureOrigin: `http://127.0.0.1:${server.port}`,
      timeoutMs: options.timeoutMs, maxResponseBytes: options.maxResponseBytes }
    const channels = yield* CapabilityChannels.make(makeOptions)
    const run = <A, E, R>(effect: Effect.Effect<A, E, R>) => CapabilityInvocation.withContext(binding, effect)
    const call = (input: Schema.Json, name: Name = options.root ?? "channel_send") => run(Tool.settle(channels.tools[name],
      { type: "tool-call", id: f.context.toolCallID, name, input }, f.context))
    const output = (input: Schema.Json, name?: Name) => call(input, name).pipe(Effect.flatMap((output) => Schema.decodeUnknownEffect(Output)(output.structured)))
    return { ...f, binding, provider, channels, credentials, selected, connections, jobs, artifacts, connection, target, bind,
      channelID, threadID, messageID, messages, requests, state, remotePermissions, submittedStates, submittingIDs, acknowledgedIDs,
      received, preflightEntered, releasePreflight, makeOptions, run, call, output }
  })
}
`````

### FX-CAP-CHANNEL-3 — `packages/core/test/fixture/capability-channel.ts` 299–337

Commit `1cde2ff7a71bcf7aecb5d030917b577165135d38`; blob `7bdefc9462c7d62d587ee8c08fe12b81f437cc46`; SHA256 integral `da12b0163754f1a2343a1688bf6aeb5e656eff77fb3d30afa6749d59e7019a13`. Bytes fonte 31357; recorte [23617, 26318); SHA256 trecho `4213fac107ce8f279ecbfdc238f72e288136ea2a02e1c78ea0c16a380f015a43`.

`````text
    const originalTransaction: typeof f.database.db.transaction = (use, options) => f.database.db.transaction((tx) => Effect.gen(function* () {
      const result = yield* use(tx)
      if (originals.length) return result
      if (phase === "rpc" && (yield* row(tx))?.state === "submitting") return yield* failOriginal(tx)
      if (phase === "retention") {
        const artifacts = yield* tx.select().from(CapabilityArtifactTable).where(
          sql`json_extract(${CapabilityArtifactTable.producer}, '$.sessionID') = ${f.context.sessionID}`,
        ).all().pipe(Effect.orDie)
        if (artifacts.length) {
          expect(artifacts).toHaveLength(1)
          expect((yield* row(tx))?.state).toBe("submitted")
          return yield* failOriginal(tx)
        }
      }
      return result
    }), options)
    const originalDB = new Proxy(f.database.db, { get: (db, key) => key === "transaction"
      ? originalTransaction : Reflect.get(db, key, db) })
    const observerTransaction: typeof f.database.db.transaction = (use, options) => f.database.db.transaction((tx) => Effect.gen(function* () {
      const result = yield* use(tx)
      const current = yield* row(tx)
      if (observers.length || !current || current.state !== (phase === "rpc" ? "unknown" : "completed")) return result
      // Actual Jobs provenance, CAS and SQL update finish before the second fault rolls this writer back.
      observerWrites.push(current)
      const cause = yield* sqlCause(tx)
      const observer = Cause.fromReasons<never>([...cause.reasons.map((reason) => Cause.isFailReason(reason)
        ? Cause.makeDieReason(reason.error).annotate(annotations(markers.observer)) : reason), ...repeated])
      observers.push(observer)
      return yield* Effect.failCause(observer)
    }), options)
    const observerDB = new Proxy(f.database.db, { get: (db, key) => key === "transaction"
      ? observerTransaction : Reflect.get(db, key, db) })
    const jobs = yield* CapabilityJobs.make.pipe(Effect.provideService(Database.Service, { ...f.database, db: observerDB }))
    const connections = phase === "rpc" && !expectedFailure ? yield* CapabilityConnections.make.pipe(
      Effect.provideService(Database.Service, { ...f.database, db: originalDB })) : f.connections
    const artifacts = phase === "retention" && !expectedFailure ? yield* CapabilityArtifacts.make({ root: join(global.data, "evidence") }).pipe(
      Effect.provideService(Database.Service, { ...f.database, db: originalDB })) : f.artifacts
    const channels = yield* CapabilityChannels.make({ ...f.makeOptions, connections, jobs, artifacts })
    const tracer = Tracer.make({ span: (options) => new class extends Tracer.NativeSpan {
`````

### FX-CAP-CHILDREN-1 — `packages/core/test/fixture/capability-children.ts` 30–81

Commit `1cde2ff7a71bcf7aecb5d030917b577165135d38`; blob `86238caac536d27b1ae3577d80b82af821c7aadd`; SHA256 integral `cd85794727725bd1b88fd7e0723547a773e2d80b280dac2fa9c21d9dd7152dd1`. Bytes fonte 4625; recorte [1579, 4625); SHA256 trecho `daa37af225fd3f39d860e02c51f26543cf9d487e18d1d3f97ef6d3bce6f669b4`.

`````text
export const layer = Layer.unwrap(Effect.gen(function* () {
  const tmp = yield* Effect.acquireRelease(Effect.promise(() => tmpdir()),
    (tmp) => Effect.promise(() => tmp[Symbol.asyncDispose]()))
  return AppNodeBuilder.build(LayerNode.group([
    Database.node, EventV2.node, SessionProjector.node, SessionStore.node, PermissionV2.node,
    AgentV2.node, Location.node, PermissionSaved.node, ToolRegistry.nativeNode, Global.node, FSUtil.node,
  ]), [
    [Location.node, Layer.succeed(Location.Service, CapabilityPolicyFixture.placement)],
    [Global.node, Global.layerWith({ data: join(tmp.path, "data"), home: tmp.path })],
    [ToolOutputStore.node, ToolOutputStore.nodeWithoutConfig],
  ])
}))

export const fixture = Effect.gen(function* () {
  const f = yield* CapabilityPolicyFixture.fixture()
  yield* f.events.publish(SessionEvent.Tool.Called, {
    sessionID: f.context.sessionID, assistantMessageID: f.context.assistantMessageID,
    callID: f.context.toolCallID, tool: f.binding.rootToolName, input: {},
    timestamp: CapabilityPolicyFixture.timestamp, provider: { executed: false },
  })
  const registry = yield* ToolRegistry.Service
  const children = yield* CapabilityChildren.make
  const seen = yield* Ref.make<Tool.Context[]>([])
  yield* registry.register({ leaf: Tool.make({
    description: "Authorized canonical child", input: Schema.Struct({ text: Schema.String }), output: Schema.String,
    execute: (input, context) => Effect.gen(function* () {
      const permit = yield* f.policy.authorize(context, CapabilityPolicyFixture.input)
      yield* f.policy.commit(permit, () => f.target)
      yield* Ref.update(seen, (seen) => [...seen, context])
      return input.text
    }).pipe(Effect.mapError((error) => new Tool.Failure({ message: "Child denied", error }))),
  }) })
  const materialization = yield* registry.materialize(undefined, { advertisedNames: [] })
  const rows = () => f.database.db.select().from(CapabilityChildTable)
    .where(eq(CapabilityChildTable.session_id, f.context.sessionID)).all().pipe(Effect.orDie)
  return { ...f, registry, children, seen, materialization, rows }
})

export function proof(invocation: Capability.InvocationRef, ordinal = 1, toolName = "leaf", input: Schema.Json = { text: "ok" }) {
  return { callID: CapabilityInvocation.childID(invocation, ordinal), parentCallID: invocation.callID,
    ordinal, toolName, requestHash: CapabilityVendorSchema.hash({ name: toolName, input }) }
}

export function admit(f: Effect.Success<typeof fixture>, proof: CapabilityInvocation.ChildProof, depth = 1) {
  return f.database.db.insert(CapabilityChildTable).values({
    id: proof.callID, session_id: f.context.sessionID, agent_id: f.context.agent,
    assistant_message_id: f.context.assistantMessageID,
    root_call_id: f.context.toolCallID, root_tool_name: f.binding.rootToolName,
    parent_call_id: proof.parentCallID, ordinal: proof.ordinal, depth,
    tool_name: proof.toolName, request_hash: proof.requestHash, state: "running",
  }).returning().get().pipe(Effect.orDie)
}
`````

### FX-CAP-MANAGEMENT-1 — `packages/core/test/fixture/capability-connection-management.ts` 43–80

Commit `1cde2ff7a71bcf7aecb5d030917b577165135d38`; blob `5aaaf333f8c639ab10eaa9df57f5cecde6279687`; SHA256 integral `0cd350dfa0921677665e1dadd81b907de0704305ca0174e5b9c5c419910caffa`. Bytes fonte 9717; recorte [2441, 5246); SHA256 trecho `74414cb65aca04cf2a4fb2bd8320ab124be2c11c5df8003792b0e1305734468b`.

`````text
export function fixture(options: { scope?: CapabilityOperatorContract.GrantScope; principal?: string } = {}) {
  return Effect.gen(function* () {
    const database = yield* Database.Service
    const makeStore = yield* storeFactory
    const store = yield* makeStore
    const operators = yield* CapabilityOperator.make({ principal: options.principal ?? `management-${randomUUID()}`,
      scope: options.scope ?? { placements: "instance", actions: ["*"] } })
    const management = yield* CapabilityConnectionManagement.make({ operators, store })
    const credentialID = Credential.ID.create()
    const integrationID = Integration.ID.make("management")
    yield* database.db.insert(ProjectTable).values({ id: placement.projectID,
      worktree: placement.location.directory, sandboxes: [] }).onConflictDoNothing().run()
    yield* database.db.insert(CredentialTable).values({ id: credentialID, integration_id: integrationID,
      label: secret, value: { type: "key", key: secret } }).run()
    const connection = (owner = placement) => Effect.gen(function* () {
      const ref: Capability.ConnectionRef = { id: Capability.ConnectionID.create(), provider: "fixture", generation: 0 }
      yield* database.db.insert(CapabilityConnectionTable).values({ id: ref.id, provider: ref.provider,
        generation: ref.generation, project_id: owner.projectID, directory: owner.location.directory,
        workspace_id: owner.location.workspaceID, integration_id: integrationID, credential_id: credentialID,
        endpoint: `https://example.invalid/${secret}`, subject_id: secret, scope_hash: "a".repeat(64), state: "active" }).run()
      return ref
    })
    const target = (parent: Capability.ConnectionRef) => Effect.gen(function* () {
      const ref: Capability.TargetRef = { id: Capability.TargetID.create(), connectionID: parent.id,
        environment: "test", generation: 0 }
      yield* database.db.insert(CapabilityTargetTable).values({ id: ref.id, connection_id: ref.connectionID,
        environment: ref.environment, generation: ref.generation, resource: { secret } }).run()
      return ref
    })
    const sessionID = SessionID.create()
    yield* database.db.insert(SessionTable).values({ id: sessionID, project_id: placement.projectID,
      directory: placement.location.directory, slug: "management", title: "management", version: "test", agent: "persisted-actor" }).run()
    const parent = yield* connection()
    const child = yield* target(parent)
    const run = <A, E, R>(effect: Effect.Effect<A, E, R>, key = "key", authority = operators.configured) =>
      operators.withRequest(authority, { requestID: randomUUID(), idempotencyKey: key }, effect)
    return { database, store, operators, management, credentialID, parent, child, sessionID, connection, target, run }
  })
`````

### FX-CAP-MANAGEMENT-2 — `packages/core/test/fixture/capability-connection-management.ts` 108–147

Commit `1cde2ff7a71bcf7aecb5d030917b577165135d38`; blob `5aaaf333f8c639ab10eaa9df57f5cecde6279687`; SHA256 integral `0cd350dfa0921677665e1dadd81b907de0704305ca0174e5b9c5c419910caffa`. Bytes fonte 9717; recorte [6252, 8879); SHA256 trecho `7027c2eb648fd538f919b009a89b1059e30b42f55f28abfcde3e4c4b2cf660c4`.

`````text
/** Hold the real immediate writer exactly after Management captures parent/actor, before ledger
 * admission. The named-effect Tracer starts SQL work synchronously; no authority method is replaced. */
export function writerCheckpoint(database: Database.Interface,
  change: (tx: CapabilityConnectionStoreContract.Transaction) => Effect.Effect<void, CapabilityConnectionStoreContract.Error>) {
  return Effect.gen(function* () {
    const scope = yield* Effect.scope
    const entered = yield* Deferred.make<void>()
    const locked = yield* Deferred.make<void>()
    const release = yield* Deferred.make<void>()
    const state: { writer?: Fiber.Fiber<void, CapabilityConnectionStoreContract.Error>; pending?: Fiber.Fiber<unknown, unknown>;
      notification?: Fiber.Fiber<void>; starts: number } = { starts: 0 }
    const tracer = Tracer.make({ span: (options) => {
      if (options.name === "CapabilityConnectionManagement.commit" && !state.writer) {
        state.starts++
        state.writer = Effect.runFork(database.db.transaction((tx) => Effect.gen(function* () {
          if (!database.inTransaction) return yield* Effect.die("Missing real SQL transaction identity")
          expect(yield* database.inTransaction).toBe(true)
          yield* change(tx)
          yield* Deferred.succeed(locked, undefined)
          yield* Deferred.await(release)
        }), { behavior: "immediate" })).pipe(Fiber.runIn(scope))
        // Notify only after storing the writer handle; Deferred completion can resume the case inline.
        state.notification = Effect.runFork(Deferred.await(locked).pipe(Effect.andThen(Deferred.succeed(entered, undefined)),
          Effect.asVoid)).pipe(Fiber.runIn(scope))
      }
      return new Tracer.NativeSpan(options)
    } })
    const start = <A, E, R>(effect: Effect.Effect<A, E, R>) => effect.pipe(Effect.withTracer(tracer), Effect.forkChild,
      Effect.map((pending) => { state.pending = pending; return pending }))
    // Cases install this before timeout, so scope teardown never first interrupts a SQL waiter
    // while the immediate writer is still waiting uninterruptibly for its release signal.
    const cleanup = Effect.gen(function* () {
      yield* Deferred.succeed(release, undefined)
      if (state.writer) yield* Fiber.await(state.writer)
      if (state.pending) yield* Fiber.interrupt(state.pending)
      if (state.notification) yield* Fiber.interrupt(state.notification)
    })
    const protect = <A, E, R>(effect: Effect.Effect<A, E, R>) => effect.pipe(Effect.ensuring(cleanup))
    return { state, entered, release, tracer, start, cleanup, protect }
  })
`````

### FX-CAP-SQL-1 — `packages/core/test/fixture/capability-connection-setup-sql.ts` 13–58

Commit `1cde2ff7a71bcf7aecb5d030917b577165135d38`; blob `fdfe9c1915a17bd90cfb10d7ce93c0bb02cc484a`; SHA256 integral `68596f9468d4e9db9cc6fccb48e44cd9fa69d806c01637e526c6e2c193401ee4`. Bytes fonte 2945; recorte [607, 2945); SHA256 trecho `1aba5c13191906d56b6a02f4cdc8fb038025022d9ed1569d535da45a17015664`.

`````text
// Database.layerFromPath hides its SQL client and Drizzle reserve has no span. Assemble the actual
// adapter/factory/migrations explicitly, adding only a span around the unchanged acquisition effect.
const sql = Layer.effect(SqlClient, Effect.gen(function* () {
  const client = yield* SqlClient
  return Object.assign(client, { reserve: client.reserve.pipe(Effect.withSpan("setup-test.sql.reserve")) })
})).pipe(Layer.provideMerge(Layer.unwrap(Effect.promise(async () => {
  const { layer } = await import("../../src/database/sqlite.bun")
  return layer({ filename: ":memory:" })
}))))
const database = Layer.effect(Database.Service, Effect.gen(function* () {
  const db = yield* EffectDrizzleSqlite.makeWithDefaults()
  const client = yield* SqlClient
  yield* db.run("PRAGMA foreign_keys = ON")
  yield* DatabaseMigration.apply(db)
  return { db, storageID: randomUUID(), inTransaction: Effect.serviceOption(client.transactionService).pipe(Effect.map(Option.isSome)) }
})).pipe(Layer.provide(sql))

export const layer = AppNodeBuilder.build(LayerNode.group([Database.node, EventV2.node]), [[Database.node, database]])

/** Counts real SQL attempts, including rolled-back ones. Callers must run an authorized INSERT control. */
export function trace(delegate?: Tracer.Tracer, onReserve?: () => void) {
  const credentialAttempts: string[] = []
  const reservations: { completed: boolean }[] = []
  const tracer = Tracer.make({ span: (options) => {
    const span = delegate ? delegate.span(options) : new Tracer.NativeSpan(options)
    const attribute = span.attribute.bind(span)
    const end = span.end.bind(span)
    const reservation = options.name === "setup-test.sql.reserve" ? { completed: false } : undefined
    if (reservation) {
      reservations.push(reservation)
      onReserve?.()
    }
    return Object.assign(span, {
      attribute(key: string, value: unknown) {
        if (key === "db.query.text" && typeof value === "string" && value.toLowerCase().startsWith('insert into "credential" '))
          credentialAttempts.push(value)
        attribute(key, value)
      },
      end(time: bigint, exit: Exit.Exit<unknown, unknown>) {
        if (reservation && Exit.isSuccess(exit)) reservation.completed = true
        end(time, exit)
      },
    })
  } })
  return { credentialAttempts, reservations, tracer }
}
`````

### FX-CAP-SETUP-1 — `packages/core/test/fixture/capability-connection-setup.ts` 19–64

Commit `1cde2ff7a71bcf7aecb5d030917b577165135d38`; blob `0a9213aea46d845b07b6e827771cc0bae179db2f`; SHA256 integral `0921361f18e9448d5c10052c79cee9404d8f9ddc6822319383a996a3b40b1acf`. Bytes fonte 8323; recorte [1144, 4921); SHA256 trecho `17b4730fbb277c240c0fea782947544ba1432393bb9f5be82454434df0668f85`.

`````text
export const layer = CapabilityConnectionManagementFixture.layer
export const placement = CapabilityConnectionManagementFixture.placement
export const input: CapabilitySetup.Input = { provider: "slack", key: "setup-fixture-private-key", label: "user-owned account label" }

/** Actual dependency factories only. Missing modules/reconcile fail; no substitute or skip. */
export function fixture(options: { maxReceipts?: number; response?: (request: Request) => Response | Promise<Response> } = {}) {
  return Effect.gen(function* () {
    const database = yield* Database.Service
    const { CapabilityRequest }: { CapabilityRequest: {
      make: (options: { operators: CapabilityOperatorContract.Interface; maxReceipts?: number }) =>
        Effect.Effect<CapabilityConnectionSetupContract.Options["ledger"], CapabilityConnectionStoreContract.Error, Database.Service>
    } } = yield* Effect.promise(() => import(new URL("../../src/capability/operator/request.ts", import.meta.url).href))
    const { CapabilityConnectionVerification }: { CapabilityConnectionVerification: {
      make: (options: { fixtureOrigin: string }) => Effect.Effect<CapabilityConnectionSetupContract.Verifier, CapabilityConnectionStoreContract.Error>
    } } = yield* Effect.promise(() => import(new URL("../../src/capability/connection/verify.ts", import.meta.url).href))
    const operators = yield* CapabilityOperator.make({ principal: `setup-${randomUUID()}`, scope: { placements: "instance", actions: ["*"] } })
    const ledger = yield* CapabilityRequest.make({ operators, maxReceipts: options.maxReceipts })
    if (typeof ledger.reconcile !== "function") return yield* Effect.die("Actual ledger reconciliation dependency is pending")
    const seen: { path: string; authorization: string | null }[] = []
    const server = yield* Effect.acquireRelease(Effect.sync(() => Bun.serve({ hostname: "127.0.0.1", port: 0,
      fetch(request) {
        seen.push({ path: new URL(request.url).pathname, authorization: request.headers.get("authorization") })
        return options.response ? options.response(request) : Response.json(new URL(request.url).pathname === "/api/auth.test"
          ? { ok: true, team_id: "T123", user_id: "U456", bot_id: "B789", secret: input.key }
          : { id: "123456789012345678", bot: true, secret: input.key })
      },
    })), (server) => Effect.promise(() => server.stop(true)))
    const actual = yield* CapabilityConnectionVerification.make({ fixtureOrigin: server.url.origin })
    const writerStates: boolean[] = []
    const verifier: CapabilityConnectionSetupContract.Verifier = { verify: (value) => Effect.gen(function* () {
      if (!database.inTransaction) return yield* Effect.die("Missing real SQL transaction identity")
      writerStates.push(yield* database.inTransaction)
      expect(writerStates[writerStates.length - 1]).toBe(false)
      return yield* actual.verify(value)
    }) }
    const setup = yield* CapabilityConnectionSetup.make({ operators, ledger, verifier })
    yield* database.db.insert(ProjectTable).values({ id: placement.projectID,
      worktree: placement.location.directory, sandboxes: [] }).onConflictDoNothing().run()
    const run = <A, E, R>(effect: Effect.Effect<A, E, R>, key: string = randomUUID(), authority = operators.configured) =>
      operators.withRequest(authority, { requestID: randomUUID(), idempotencyKey: key }, effect)
    const rows = Effect.gen(function* () {
      return { credentials: yield* database.db.select().from(CredentialTable),
        connections: yield* database.db.select().from(CapabilityConnectionTable),
        receipts: yield* database.db.select().from(CapabilityRequestTable) }
    })
    return { database, operators, ledger, verifier, setup, seen, writerStates, run, rows }
`````

### FX-CAP-SETUP-2 — `packages/core/test/fixture/capability-connection-setup.ts` 117–125

Commit `1cde2ff7a71bcf7aecb5d030917b577165135d38`; blob `0a9213aea46d845b07b6e827771cc0bae179db2f`; SHA256 integral `0921361f18e9448d5c10052c79cee9404d8f9ddc6822319383a996a3b40b1acf`. Bytes fonte 8323; recorte [7544, 8323); SHA256 trecho `7021223a1ef43c979a36a17fd3b7d3c6bc4aa4cc89d88f78aa6e1845a4c08686`.

`````text
/** Reuse the real writer holder; map only the selected setup span to its admission checkpoint. */
export function checkpoint(database: Database.Interface, span: "reconcile" | "commit",
  change: (tx: CapabilityConnectionStoreContract.Transaction) => Effect.Effect<void, CapabilityConnectionStoreContract.Error>) {
  return CapabilityConnectionManagementFixture.writerCheckpoint(database, change).pipe(Effect.map((hold) => {
    const tracer = Tracer.make({ span: (options) => hold.tracer.span({ ...options,
      name: options.name === `CapabilityConnectionSetup.${span}` ? "CapabilityConnectionManagement.commit" : options.name }) })
    return { ...hold, tracer, start: <A, E, R>(effect: Effect.Effect<A, E, R>) => hold.start(effect.pipe(Effect.withTracer(tracer))) }
  }))
}
`````

### FX-CAP-DISCOVERY-1 — `packages/core/test/fixture/capability-discovery.ts` 46–96

Commit `1cde2ff7a71bcf7aecb5d030917b577165135d38`; blob `eb8982feb684bfc9bff8c0a8fda6eeb6fb652258`; SHA256 integral `3f6500c14d20eb9dfa72fe2d4e8237c8d099e79420a5a0e039fde3f261044f85`. Bytes fonte 9915; recorte [2733, 6458); SHA256 trecho `101c456de6c3159c3db9ae5318195191ddc4e71c73560f3e13e3e2ed50108a3c`.

`````text
export const allow: PermissionV2.Ruleset = [{ action: CapabilityDiscovery.disclosureAction, resource: "*", effect: "allow" }]
export const request = { provider: "example", query: "", limit: 1 }
export const secret = "selected-provider-secret"
export const leaf = () => Tool.make({
  description: "Canonical platform dispatch fixture", input: Schema.Json, output: Schema.Json,
  execute: (input) => Effect.succeed(input),
})
export const tools: CapabilityDiscovery.VendorTool[] = [
  { name: "list_projects", summary: "List projects", inputSchema: { type: "object", additionalProperties: false },
    outputSchema: { type: "array", items: { type: "string" } } },
  { name: "get_project", summary: "Get project", inputSchema: { type: "object", properties: { id: { type: "string" } }, required: ["id"] } },
  { name: "create_project", summary: "Create project", inputSchema: { type: "object" } },
]

export function fixture(options: Omit<CapabilityDiscovery.Options, "source"> = {}) {
  return Effect.gen(function* () {
    const f = yield* CapabilityPolicyFixture.fixture()
    yield* CapabilityPolicyFixture.setRules(allow)
    const binding = { ...f.binding, effectiveRules: allow }
    const connections = yield* CapabilityConnections.make
    const credentials = yield* Credential.Service
    const registry = yield* ToolRegistry.Service
    const applications = yield* ApplicationTools.Service
    yield* registry.register({ platform_example: leaf() })
    const materialization = yield* registry.materialize(allow, { advertisedNames: [] })
    const integrationID = Integration.ID.make("discovery-test")
    const credential = yield* credentials.create({ integrationID, value: { type: "key", key: secret } })
    const connection = yield* connections.create({ provider: "example", integrationID, credentialID: credential.id,
      endpoint: "https://api.example.test/mcp", scopeHash: "a".repeat(64), subjectID: "selected-subject" })
    const target = yield* connections.createTarget(connection, { environment: "test", resource: { project: "selected" } })
    const bind = { target, sessionID: f.context.sessionID, agentID: f.context.agent, actions: [CapabilityDiscovery.disclosureAction] }
    yield* connections.bind(bind)
    const list = yield* Ref.make<Omit<CapabilityDiscovery.VendorList, "byteLength">>({ tools, catalogGeneration: 1, coverage: "complete" })
    const calls = yield* Ref.make<CapabilityDiscovery.Selection[]>([])
    const transport = yield* Ref.make<Effect.Effect<void, Capability.Failure>>(Effect.void)
    // Deterministic host transport boundary only. Real policy, Connection, root and registry remain live.
    const source: CapabilityDiscovery.CatalogSource = { listTools: (selection) => Effect.gen(function* () {
      yield* Ref.update(calls, (calls) => [...calls, selection])
      yield* Ref.get(transport).pipe(Effect.flatten)
      const value = yield* Ref.get(list)
      return { ...value, byteLength: Buffer.byteLength(JSON.stringify(value)) }
    }) }
    const clock = { time: 1000 }
    const discovery = yield* CapabilityDiscovery.make({ source, now: () => clock.time, ttlMillis: 100, ...options })
    const run = <A, E, R>(effect: Effect.Effect<A, E, R>) => CapabilityInvocation.withContext(binding, effect)
    const find = (input: CapabilityDiscovery.FindInput = request, m = materialization) => run(discovery.find(f.context, input, m))
    const describe = (ref: Capability.DescriptorRef, m = materialization) => run(discovery.describe(f.context, ref, m))
    return { ...f, binding, connections, credentials, credential, connection, target, bind, registry, applications,
      materialization, list, calls, transport, source, clock, discovery, run, find, describe }
  })
}
`````

### FX-CAP-DISCOVERY-2 — `packages/core/test/fixture/capability-discovery.ts` 120–151

Commit `1cde2ff7a71bcf7aecb5d030917b577165135d38`; blob `eb8982feb684bfc9bff8c0a8fda6eeb6fb652258`; SHA256 integral `3f6500c14d20eb9dfa72fe2d4e8237c8d099e79420a5a0e039fde3f261044f85`. Bytes fonte 9915; recorte [7239, 9541); SHA256 trecho `9a888736784f662ec7c85fbc8ec763478c594490a92cac0a4a21637f8db99c6b`.

`````text
export function publicationFixture(options: { maxEntries?: number; storeEntries?: number } = {}) {
  return Effect.gen(function* () {
    const f = yield* fixture()
    const real = yield* CapabilityDescriptors.make({ maxEntries: options.storeEntries ?? 8, ttlMillis: 100, now: () => f.clock.time })
    const batches = yield* Ref.make(0)
    const issued = yield* Ref.make<readonly CapabilityDescriptors.DescriptorRecord[]>([])
    const removed = yield* Ref.make<readonly Capability.DescriptorRef[]>([])
    const afterBatch = yield* Ref.make<Effect.Effect<void>>(Effect.void)
    // Fault scheduling at the host Store boundary; admission/removal/read all use the real shared store.
    const store: CapabilityDescriptors.Store = { ...real,
      issueBatch: (inputs) => Effect.gen(function* () {
        yield* Ref.update(batches, (n) => n + 1)
        const records = yield* real.issueBatch(inputs)
        yield* Ref.update(issued, (previous) => [...previous, ...records])
        yield* Ref.get(afterBatch).pipe(Effect.flatten)
        return records
      }),
      remove: (ref) => real.remove(ref).pipe(Effect.andThen(Ref.update(removed, (previous) => [...previous, ref]))),
    }
    const discovery = yield* CapabilityDiscovery.make({ source: f.source, descriptors: store,
      maxEntries: options.maxEntries ?? 8, now: () => f.clock.time, ttlMillis: 100 })
    const find = (input: CapabilityDiscovery.FindInput = { ...request, limit: 2 }, materialization = f.materialization) =>
      f.run(discovery.find(f.context, input, materialization))
    const canonicalIdentity = f.registry.currentRegistrationIdentity("platform_example")
    if (!canonicalIdentity) return yield* Effect.die("PUBLICATION_CANONICAL_REGISTRATION_MISSING")
    const validator = yield* CapabilityVendorSchema.compile(true)
    const input: CapabilityDescriptors.IssueInput = { owner: f.binding.owner,
      connectionID: f.connection.id, targetID: f.target.id, connectionGeneration: f.connection.generation,
      targetGeneration: f.target.generation, canonicalName: "platform_example", canonicalIdentity,
      inputSchema: true, schemaHash: validator.schemaHash, catalogGeneration: 1, operationID: "unrelated" }
    return { ...f, real, store, discovery, find, batches, issued, removed, afterBatch, input }
  })
`````

### FX-CAP-MCP-1 — `packages/core/test/fixture/capability-mcp.ts` 11–25

Commit `1cde2ff7a71bcf7aecb5d030917b577165135d38`; blob `b61e06298038e722d48a1dbb3a7154c3292da880`; SHA256 integral `3595975f98b05402fe49803a9b2f646ea0c289fd60781a2c13135f5706555eb2`. Bytes fonte 7137; recorte [528, 1877); SHA256 trecho `820c340555770a63aacce7993126bce96bddc236fbf5b9dbdcfd8b4036bc21b1`.

`````text
export const token = "fixture-selected-secret"
export const endpoint = "https://mcp.cloudflare.com/approved/mcp?account=one&codemode=false"
export const owner = Schema.decodeUnknownSync(Capability.Owner)({ projectID: "project-fixture", location: { directory: "/fixture" },
  sessionID: "ses_fixture", agentID: "backend" })
export const base: CapabilityDiscovery.Selection = {
  connection: { id: Capability.ConnectionID.create(), provider: "cloudflare", generation: 1 },
  target: { id: Capability.TargetID.create(), connectionID: Capability.ConnectionID.create(), generation: 2, environment: "fixture" },
  resource: { account: "one", endpoint: "https://untrusted.invalid" }, endpoint, owner,
  credentialID: Credential.ID.create(), credential: { type: "key", key: token, metadata: { authorization: "ignored" } },
}
export const selected = { ...base, target: { ...base.target, connectionID: base.connection.id } }
export const tool = { name: "mutate", description: "Preserve description €", inputSchema: {
  type: "object", properties: { value: { type: "string" } }, additionalProperties: false,
}, outputSchema: { type: "object", properties: { changed: { type: "boolean" } } } } satisfies Schema.JsonObject
export const result = { content: [{ type: "text", text: "done €" }], structuredContent: { changed: true } } satisfies Schema.JsonObject
`````

### FX-CAP-MCP-2 — `packages/core/test/fixture/capability-mcp.ts` 38–96

Commit `1cde2ff7a71bcf7aecb5d030917b577165135d38`; blob `b61e06298038e722d48a1dbb3a7154c3292da880`; SHA256 integral `3595975f98b05402fe49803a9b2f646ea0c289fd60781a2c13135f5706555eb2`. Bytes fonte 7137; recorte [2613, 6520); SHA256 trecho `bf4fd28fe9b5bbde553a8b8853be540411206ad29894e71e067ad21ca6cb5e13`.

`````text
export function fixture(mode: "json" | "sse" = "json") {
  return Effect.acquireRelease(Effect.sync(() => {
    const state: Fixture = { requests: [], bytes: 0, initializeCount: 0, closed: 0, cancelled: 0, commits: 0,
      mode, chunks: false, version: "2025-11-25", tools: [tool], paginate: false, traffic: [], origin: "",
      transport: (options = {}) => CapabilityMcp.make({ fixtureOrigin: state.origin, ...options }),
      disconnect: () => server.stop(true),
      send: (body, session) => {
        const text = state.mode === "json" ? JSON.stringify(body) : "\uFEFF: keepalive\r\nid: prime\r\ndata:\r\n\r\n" +
          [...state.traffic, body].map((value) => "event: message\r\n" + JSON.stringify(value, null, 2)
            .split("\n").map((line) => `data: ${line}\r\n`).join("") + "\r\n").join("")
        const bytes = new TextEncoder().encode(text)
        state.bytes += bytes.byteLength
        const headers = { "content-type": state.mode === "json" ? "application/json" : "text/event-stream",
          ...(session === undefined ? {} : { "mcp-session-id": session }) }
        if (!state.chunks) return new Response(bytes, { headers })
        const position = { offset: 0, cancelled: false }
        return new Response(new ReadableStream<Uint8Array>({
          async pull(controller) {
            await Bun.sleep(1)
            if (position.cancelled) return
            if (position.offset === bytes.length) { controller.close(); return }
            // Splits CRLF, BOM, UTF-8 characters and JSON field names across actual HTTP chunks.
            controller.enqueue(bytes.subarray(position.offset, position.offset + 7))
            position.offset = Math.min(bytes.length, position.offset + 7)
          }, cancel() { position.cancelled = true; state.cancelled++ },
        }), { headers })
      },
    }
    const server = Bun.serve({ hostname: "127.0.0.1", port: 0, async fetch(request) {
      const recorded: RecordRequest = { method: request.method, url: request.url, headers: request.headers,
        body: request.method === "DELETE" ? {} : Schema.decodeUnknownSync(Schema.Record(Schema.String, Schema.Json))(await request.json()) }
      state.requests.push(recorded)
      const overridden = await state.override?.(recorded)
      if (overridden !== undefined) return overridden
      if (request.method === "DELETE") { state.closed++; return new Response(null, { status: 204 }) }
      const body = recorded.body
      if (body.method === "initialize") {
        state.initializeCount++
        return state.send({ jsonrpc: "2.0", id: body.id, result: { protocolVersion: state.version, capabilities: { tools: { listChanged: true } },
          serverInfo: { name: "fixture", version: "1" } } }, `session-${state.initializeCount}`)
      }
      if (body.method === "notifications/initialized" || body.method === undefined) return new Response(null, { status: 202 })
      if (body.method === "tools/list") {
        const next = body.params !== null && typeof body.params === "object" && "cursor" in body.params
        return state.send({ jsonrpc: "2.0", id: body.id, result: { tools: state.paginate ? state.tools.slice(next ? 1 : 0, next ? undefined : 1) : state.tools,
          ...(state.paginate && !next ? { nextCursor: "opaque +/?=cursor" } : {}) } })
      }
      if (body.method === "tools/call") { state.commits++; return state.send({ jsonrpc: "2.0", id: body.id, result }) }
      return new Response(null, { status: 400 })
    } })
    state.origin = server.url.origin
    return { state, server }
  }), (value) => Effect.promise(() => value.server.stop(true))).pipe(Effect.map((value) => value.state))
}

export function connection(f: Fixture): Connection {
  return { endpoint: f.origin + "/approved/mcp?account=one&codemode=false", authorization: `Bearer ${token}`,
    lifetime: new AbortController(), tasks: new Set(), closed: false, dead: false }
}
`````

### FX-CAP-POLICY-1 — `packages/core/test/fixture/capability-policy.ts` 30–39

Commit `1cde2ff7a71bcf7aecb5d030917b577165135d38`; blob `419350085a348fec5b9aa4d7e1a4d58eccecfe36`; SHA256 integral `867795737d699edba38e7631a4347db3f2721a8421f8deae9adc10119c78ec69`. Bytes fonte 7802; recorte [1575, 2372); SHA256 trecho `8a67e6402d8a152da07ebbbab0731a76dd020e1153d3167d68079862a6e237ec`.

`````text
export const placement = location({ directory: AbsolutePath.make("/project") })
export const layer = AppNodeBuilder.build(LayerNode.group([
  Database.node, EventV2.node, SessionProjector.node, SessionStore.node, PermissionV2.node, AgentV2.node, Location.node,
  PermissionSaved.node,
]), [[Location.node, Layer.succeed(Location.Service, Location.Service.of(placement))]])
export const allow: PermissionV2.Ruleset = [{ action: "read", resource: "*", effect: "allow" }]
export const deny: PermissionV2.Ruleset = [{ action: "read", resource: "*", effect: "deny" }]
export const input = { action: "read", resources: ["src/index.ts"] }
export const timestamp = DateTime.makeUnsafe(1)
export const secrets = ["secret provider feedback", "secret-resource", "secret-rule", "secret-call", "secret-agent"]
`````

### FX-CAP-POLICY-2 — `packages/core/test/fixture/capability-policy.ts` 50–95

Commit `1cde2ff7a71bcf7aecb5d030917b577165135d38`; blob `419350085a348fec5b9aa4d7e1a4d58eccecfe36`; SHA256 integral `867795737d699edba38e7631a4347db3f2721a8421f8deae9adc10119c78ec69`. Bytes fonte 7802; recorte [2684, 5184); SHA256 trecho `7e3a26a7e7edab73859458a0515c73ff123966a58ba8661bc4b9c4410f49a0bd`.

`````text
export function fixture(options: { message?: boolean; part?: boolean; agent?: string; name?: string } = {}) {
  return Effect.gen(function* () {
    const database = yield* Database.Service
    const events = yield* EventV2.Service
    const permissions = yield* PermissionV2.Service
    const context: Tool.Context = {
      sessionID: SessionV2.ID.create(), agent: AgentV2.ID.make("test"),
      assistantMessageID: SessionMessage.ID.create(), toolCallID: "root-call",
    }
    yield* database.db.insert(ProjectTable).values({
      id: Project.ID.global, worktree: placement.directory, sandboxes: [],
    }).onConflictDoNothing().run().pipe(Effect.orDie)
    yield* database.db.insert(SessionTable).values({
      id: context.sessionID, project_id: Project.ID.global, directory: placement.directory,
      slug: "policy", title: "policy", version: "test", agent: "test",
    }).run().pipe(Effect.orDie)
    if (options.message !== false) {
      yield* events.publish(SessionEvent.Step.Started, {
        ...context, timestamp, agent: options.agent ?? "test",
        model: { id: Model.ID.make("model"), providerID: Provider.ID.make("provider") },
      })
      if (options.part !== false) yield* events.publish(SessionEvent.Tool.Input.Started, {
        sessionID: context.sessionID, assistantMessageID: context.assistantMessageID,
        callID: context.toolCallID, name: options.name ?? "service_call", timestamp,
      })
    }
    yield* setRules(allow)
    const binding: CapabilityInvocation.HostInput = {
      issuer: "core", owner: {
        projectID: placement.project.id, location: { directory: placement.directory },
        sessionID: context.sessionID, agentID: context.agent,
      }, invocation: {
        sessionID: context.sessionID, agentID: context.agent,
        assistantMessageID: context.assistantMessageID, callID: context.toolCallID,
      }, rootToolName: "service_call", effectiveRules: allow.map((rule) => ({ ...rule })), nativeDenyFloor: [],
    }
    const policy = yield* CapabilityPolicy.make
    // Authorization sentinel only: this fixture does not dispatch a native adapter.
    const effects = yield* Ref.make(0)
    const target = Ref.update(effects, (n) => n + 1)
    const run = (host = binding, supplied = context, request = input) => CapabilityInvocation.withContext(
      host, policy.assert(supplied, request).pipe(Effect.andThen(target)),
    )
    return { context, binding, policy, run, target, events, permissions, database, effects }
  })
}
`````

### FX-CAP-POLICY-3 — `packages/core/test/fixture/capability-policy.ts` 97–130

Commit `1cde2ff7a71bcf7aecb5d030917b577165135d38`; blob `419350085a348fec5b9aa4d7e1a4d58eccecfe36`; SHA256 integral `867795737d699edba38e7631a4347db3f2721a8421f8deae9adc10119c78ec69`. Bytes fonte 7802; recorte [5185, 6858); SHA256 trecho `ce6fedb133caadb36efb9a3cf668765325af09b9f678a8d68fcfbea9cd36452d`.

`````text
export function observeAsked(context: Tool.Context) {
  return Effect.gen(function* () {
    const events = yield* EventV2.Service
    const count = yield* Ref.make(0)
    const first = yield* Deferred.make<PermissionV2.Request>()
    const repeated = yield* Deferred.make<void>()
    const unsubscribe = yield* events.listen((event) => Effect.gen(function* () {
      if (event.type !== PermissionV2.Event.Asked.type) return
      const request = Schema.decodeUnknownSync(PermissionV2.Request)(event.data)
      if (request.sessionID !== context.sessionID || request.source?.type !== "tool" ||
        request.source.messageID !== context.assistantMessageID || request.source.callID !== context.toolCallID) return
      const n = yield* Ref.updateAndGet(count, (n) => n + 1)
      yield* Deferred.succeed(first, request)
      if (n > 1) yield* Deferred.succeed(repeated, undefined)
    }))
    yield* Effect.addFinalizer(() => unsubscribe)
    return { count, first, repeated, unsubscribe }
  })
}

export function queued<E>(context: Tool.Context, effect: Effect.Effect<void, E>) {
  return Effect.gen(function* () {
    const observation = yield* observeAsked(context)
    const fiber = yield* effect.pipe(Effect.result, Effect.forkChild)
    const request = yield* Effect.raceFirst(Deferred.await(observation.first), Fiber.join(fiber).pipe(
      Effect.andThen(Effect.fail(new Error("POLICY_BYPASSED_PERMISSION_QUEUE"))),
    ))
    const join = Effect.raceFirst(Fiber.join(fiber), Deferred.await(observation.repeated).pipe(
      Effect.andThen(Effect.fail(new Error("POLICY_QUEUED_SECOND_APPROVAL"))),
    ))
    return { fiber, request, observation, join }
  })
}

`````

### FX-CAP-PROCESS-1 — `packages/core/test/fixture/capability-process-control.ts` 43–96

Commit `1cde2ff7a71bcf7aecb5d030917b577165135d38`; blob `93f92885438e5194ff888144be00e643187914f8`; SHA256 integral `1bd414b7d8542994a5aa43399afed45704eaa8a3fa9c9c5be5f09ae170485fa0`. Bytes fonte 7279; recorte [2377, 6815); SHA256 trecho `0444c9bc27f6162fcf718a83f61e0530d0d742cd23074224d6141c1688b712b5`.

`````text
export const tmp = await tmpdir()
const placement = location(Location.Ref.make({ directory: AbsolutePath.make(tmp.path) }))
export const layer = AppNodeBuilder.build(LayerNode.group([Database.node, EventV2.node, SessionProjector.node,
  SessionStore.node, PermissionV2.node, PermissionSaved.node, AgentV2.node, Location.node, FSUtil.node, Global.node,
  LocationMutation.node, AppProcess.node, CapabilityProcessRegistry.node, ToolRegistry.node]), [
  [Database.node, Database.layerFromPath(join(tmp.path, "process.sqlite"))],
  [Location.node, Layer.succeed(Location.Service, Location.Service.of(placement))],
  [Global.node, Global.layerWith({ data: tmp.path, home: tmp.path })],
])
export const allow: PermissionV2.Ruleset = [{ action: "*", resource: "*", effect: "allow" }]
export const child = (script: string) => [process.execPath, "-e", script]
export const echo = child(`process.stdout.write("key:" + process.env.CUSTOM_API_KEY + "\\n"); process.stdin.on("data", (d) => process.stdout.write("got:" + d)); process.stdin.on("end", () => process.exit(3))`)

export const setup = Effect.gen(function* () {
  const database = yield* Database.Service
  const events = yield* EventV2.Service
  const registry = yield* ToolRegistry.Service
  const tools = yield* Tools.Service
  const jobs = yield* CapabilityJobs.make
  const leaf = yield* CapabilityProcessControl.make({ jobs })
  yield* tools.register(leaf.tools)
  yield* database.db.insert(ProjectTable).values({ id: Project.ID.global, worktree: placement.directory, sandboxes: [] })
    .onConflictDoNothing().run().pipe(Effect.orDie)
  yield* CapabilityPolicyFixture.setRules(allow)
  const session = (options: { parentID?: SessionV2.ID } = {}) => Effect.gen(function* () {
    const context = { sessionID: SessionV2.ID.create(), agent: AgentV2.ID.make("test"), assistantMessageID: SessionMessage.ID.create() }
    yield* database.db.insert(SessionTable).values({ id: context.sessionID, project_id: Project.ID.global, directory: placement.directory,
      slug: "p", title: "p", version: "test", agent: "test", parent_id: options.parentID }).run().pipe(Effect.orDie)
    yield* events.publish(SessionEvent.Step.Started, { ...context, timestamp: DateTime.makeUnsafe(1), agent: "test",
      model: { id: Model.ID.make("model"), providerID: Provider.ID.make("provider") } })
    const counter = { n: 0 }
    const bound = <A, E>(input: Schema.Json, run: (call: { toolCallID: string; input: Schema.Json }) => Effect.Effect<A, E>) =>
      Effect.gen(function* () {
        const toolCallID = `call-${++counter.n}`
        yield* events.publish(SessionEvent.Tool.Input.Started, { sessionID: context.sessionID,
          assistantMessageID: context.assistantMessageID, callID: toolCallID, name: "process_control", timestamp: DateTime.makeUnsafe(1) })
        const owner = { projectID: placement.project.id, location: { directory: placement.directory },
          sessionID: context.sessionID, agentID: context.agent }
        return yield* CapabilityInvocation.withContext({ issuer: "core", owner, invocation: { sessionID: context.sessionID,
          agentID: context.agent, assistantMessageID: context.assistantMessageID, callID: toolCallID },
        rootToolName: "process_control", effectiveRules: allow, nativeDenyFloor: [] }, run({ toolCallID, input }))
      })
    const call = (input: Schema.Json) => bound(input, (next) => Tool.settle(leaf.tools.process_control,
      { type: "tool-call", id: next.toolCallID, name: "process_control", input }, { ...context, toolCallID: next.toolCallID }))
    // Through ToolRegistry: ToolSafety.before, askBefore and hooks run exactly as for a model call.
    const settle = (input: Schema.Json) => bound(input, (next) => registry.materialize(allow).pipe(Effect.flatMap((tools) =>
      tools.settle({ ...context, call: { type: "tool-call", id: next.toolCallID, name: "process_control", input } }))))
    const output = (input: Schema.Json) => call(input).pipe(
      Effect.flatMap((result) => Schema.decodeUnknownEffect(CapabilityProcessContract.Output)(result.structured)))
    const failure = (input: Schema.Json) => call(input).pipe(Effect.flip, Effect.map((error) => error.message))
    return { context, call, settle, output, failure }
  })
  const rows = (sessionID: string) => database.db.select().from(CapabilityJobTable).all()
    .pipe(Effect.orDie, Effect.map((all) => all.filter((row) => row.owner.sessionID === sessionID)))
`````

### FX-CAP-SCHEDULE-1 — `packages/core/test/fixture/capability-schedule.ts` 53–71

Commit `1cde2ff7a71bcf7aecb5d030917b577165135d38`; blob `bd376bd299100cca1f8ebda844518ec0190d8652`; SHA256 integral `68302e3706d5ed9895422a5e620167b8d2e3ee1a8546320fb4449d12141a9855`. Bytes fonte 6481; recorte [3259, 4517); SHA256 trecho `121718e1ec88b1c6b5b41f86d1cf0d7610d5960bb9774a360cc726b8c9c0db1a`.

`````text
export const allow: PermissionV2.Ruleset = [{ action: "*", resource: "*", effect: "allow" }]

export const setup = Effect.gen(function* () {
  const database = yield* Database.Service
  const events = yield* EventV2.Service
  const registry = yield* ToolRegistry.Service
  const tools = yield* Tools.Service
  const leaf = yield* CapabilitySchedule.make()
  yield* tools.register(leaf.tools)
  yield* database.db.insert(ProjectTable).values({ id: Project.ID.global, worktree: placement.directory, sandboxes: [] })
    .onConflictDoNothing().run().pipe(Effect.orDie)
  yield* CapabilityPolicyFixture.setRules(allow)
  const session = Effect.gen(function* () {
    const context = { sessionID: SessionV2.ID.create(), agent: AgentV2.ID.make("test"), assistantMessageID: SessionMessage.ID.create() }
    yield* database.db.insert(SessionTable).values({ id: context.sessionID, project_id: Project.ID.global,
      directory: placement.directory, slug: "s", title: "s", version: "test", agent: "test" }).run().pipe(Effect.orDie)
    yield* events.publish(SessionEvent.Step.Started, { ...context, timestamp: DateTime.makeUnsafe(1), agent: "test",
      model: { id: Model.ID.make("model"), providerID: Provider.ID.make("provider") } })
    const counter = { n: 0 }
`````

### FX-CAP-SCHEDULE-2 — `packages/core/test/fixture/capability-schedule.ts` 86–96

Commit `1cde2ff7a71bcf7aecb5d030917b577165135d38`; blob `bd376bd299100cca1f8ebda844518ec0190d8652`; SHA256 integral `68302e3706d5ed9895422a5e620167b8d2e3ee1a8546320fb4449d12141a9855`. Bytes fonte 6481; recorte [5794, 6481); SHA256 trecho `242621e4596e477b25676e491d17ef1efa23413f5f5982cb55f7d50054d6adeb`.

`````text
    })
    const output = (input: Schema.Json, callID?: string) => call(input, callID).pipe(Effect.flatMap((settled) =>
      settled.result.type === "error" ? Effect.die(new Error(String(settled.result.value)))
        : Schema.decodeUnknownEffect(CapabilityScheduleContract.Output)(settled.output?.structured)))
    const failure = (input: Schema.Json) => call(input).pipe(Effect.map((settled) =>
      settled.result.type === "error" ? String(settled.result.value) : "unexpected success"))
    return { context, output, failure, last: () => `call-${counter.n}` }
  })
  const rows = database.db.select().from(ScheduledTaskTable).all().pipe(Effect.orDie)
  return { session, rows }
})
`````

### FX-CAP-CALL-1 — `packages/core/test/fixture/capability-service-call.ts` 52–87

Commit `1cde2ff7a71bcf7aecb5d030917b577165135d38`; blob `01444aad2d0106bfd27e29ba147653a517afa9e5`; SHA256 integral `58cdb067390d3702c35bceb514c0fd13315811fe572534eed6bafa251f00e285`. Bytes fonte 24581; recorte [3308, 6191); SHA256 trecho `20c3e1d6852a738bb5ab11c2225eaab73136077d973c2cba1bd9a4c8350aa68d`.

`````text
export const fixture = (options: { rootName?: string; resource?: Schema.Json; oauth?: boolean; timeout?: number;
  tool?: Schema.JsonObject; artifactFault?: Cause.Cause<SqlError> } = {}) =>
  Effect.gen(function* () {
    const rootName = options.rootName ?? "platform_cloudflare"
    const f = yield* CapabilityPolicyFixture.fixture({ name: rootName })
    yield* CapabilityPolicyFixture.setRules(rules)
    const binding = { ...f.binding, rootToolName: rootName, effectiveRules: rules }
    yield* f.events.publish(SessionEvent.Tool.Called, { sessionID: f.context.sessionID,
      assistantMessageID: f.context.assistantMessageID, callID: f.context.toolCallID, tool: rootName, input: {},
      timestamp: CapabilityPolicyFixture.timestamp, provider: { executed: false } })
    const called = yield* Deferred.make<void>()
    const state: State = { mode: "json", tools: [options.tool ?? { name: "mutate", description: "Selected mutation", inputSchema, outputSchema }],
      result: { content: [{ type: "text", text: "done" }], structuredContent: { changed: true } },
      time: 1000, excluded: false, lists: 0, calls: [], requests: [], response: "normal", called, errors: [] }
    const server = yield* Effect.acquireRelease(Effect.sync(() => Bun.serve({ hostname: "127.0.0.1", port: 0,
      async fetch(request) {
        const body = request.method === "DELETE" ? {} : Schema.decodeUnknownSync(Schema.Record(Schema.String, Schema.Json))(await request.json())
        const recorded = { body, headers: request.headers, method: request.method }
        state.requests.push(recorded)
        const send = (result: Schema.Json, session?: string) => {
          const envelope = JSON.stringify({ jsonrpc: "2.0", id: body.id, result })
          return new Response(state.mode === "json" ? envelope : `: prime\r\n\r\ndata: ${envelope}\r\n\r\n`, { headers: {
            "content-type": state.mode === "json" ? "application/json" : "text/event-stream",
            ...(session ? { "mcp-session-id": session } : {}),
          } })
        }
        if (request.method === "DELETE") return new Response(null, { status: 204 })
        if (body.method === "initialize") return send({ protocolVersion: "2025-11-25", capabilities: { tools: {} },
          serverInfo: { name: "fixture", version: "1" } }, `private-session-${state.requests.length}`)
        if (body.method === "notifications/initialized") return new Response(null, { status: 202 })
        if (body.method === "tools/list") { state.lists++; await state.beforeList?.(state.lists); return send({ tools: state.tools }) }
        if (body.method !== "tools/call") return new Response(null, { status: 400 })
        state.calls.push(recorded)
        state.beforeCall?.()
        if (state.response !== "hold") {
          const response = state.response === "loss" ? new Response("lost", { status: 503 }) : send(state.result)
`````

### FX-CAP-CALL-2 — `packages/core/test/fixture/capability-service-call.ts` 118–153

Commit `1cde2ff7a71bcf7aecb5d030917b577165135d38`; blob `01444aad2d0106bfd27e29ba147653a517afa9e5`; SHA256 integral `58cdb067390d3702c35bceb514c0fd13315811fe572534eed6bafa251f00e285`. Bytes fonte 24581; recorte [8201, 11241); SHA256 trecho `7253aa0d467d4a6a7860eb2f9a36afd515e30b335148bba33918e058a5abefb0`.

`````text
    const transport = CapabilityMcp.make({ fixtureOrigin: server.url.origin, timeoutMs: options.timeout ?? 10000 })
    const filterCatalog = (_: string, list: CapabilityDiscovery.VendorList): CapabilityDiscovery.VendorList => ({ ...list,
      tools: state.excluded ? list.tools.filter((tool) => tool.name !== "mutate") : list.tools })
    const discovery = yield* CapabilityDiscovery.make({ source: { listTools: (selection) => transport.listTools(selection).pipe(
      Effect.map((list) => filterCatalog(selection.connection.provider, list))) }, now: () => state.time })
    const jobs = yield* CapabilityJobs.make
    const global = yield* Global.Service
    const fs = yield* FSUtil.Service
    const artifactRoot = join(global.data, "service-artifacts", f.context.sessionID)
    const writerProof = { completed: 0 }
    const fault = options.artifactFault
    const optionsResource = options.resource ?? { arguments: { account: "bound-account", zero: 0, flag: false, nil: null } }
    const transaction: typeof f.database.db.transaction = (use, options) => f.database.db.transaction((tx) => Effect.gen(function* () {
      if (!fault) return yield* use(tx)
      // Native publication supplied the real writer after its actual approvals. Verify complete selected proof before injecting a platform fault.
      const binding = yield* f.policy.binding(f.context).pipe(Effect.exit)
      if (Exit.isFailure(binding)) return yield* CapabilityServiceProjection.fatal(binding.cause)
      const resolution = { connection, target, credentialID: selected.id, endpoint: "https://mcp.cloudflare.com/mcp?codemode=false",
        resource: optionsResource }
      const checked = yield* checkSelection(tx, f.context, binding.value.owner, { action: "service_call",
        resources: ["cloudflare", connection.id, target.id, "cloudflare:mutate"],
        selection: { resolution, credentialHash: CapabilityArtifacts.selectionCredentialHash(selected.value) },
      }, Option.some(credentials)).pipe(Effect.exit)
      if (Exit.isFailure(checked)) return yield* CapabilityServiceProjection.fatal(checked.cause)
      writerProof.completed++
      return yield* Effect.failCause(fault)
    }), options)
    const artifactDatabase = new Proxy(f.database.db, { get: (db, key) => key === "transaction" ? transaction : Reflect.get(db, key, db) })
    const artifacts = yield* CapabilityArtifacts.make({ root: artifactRoot }).pipe(
      Effect.provideService(Database.Service, { ...f.database, db: artifactDatabase }))
    const execute = yield* CapabilityServiceExecution.make({ transport, discovery, connections, jobs, artifacts, filterCatalog })
    const registry = yield* ToolRegistry.Service
    const platform = Tool.make({ description: "Actual canonical platform fixture", input: CapabilityServiceSchema.CallInput,
      output: CapabilityServiceSchema.CallOutput,
      execute: (input, context) => execute(state.provider ?? "cloudflare", state.supplied ?? input, state.context ?? context)
        .pipe(Effect.exit, Effect.flatMap((exit) => {
`````

### FX-CAP-CALL-3 — `packages/core/test/fixture/capability-service-call.ts` 187–212

Commit `1cde2ff7a71bcf7aecb5d030917b577165135d38`; blob `01444aad2d0106bfd27e29ba147653a517afa9e5`; SHA256 integral `58cdb067390d3702c35bceb514c0fd13315811fe572534eed6bafa251f00e285`. Bytes fonte 24581; recorte [13722, 15656); SHA256 trecho `e22578fb6df18fa7e558a00ec7785d45810b6c7040b07740fbd8bfc39466d6b4`.

`````text
export function publicationRace(mode: "retarget" | "rotate" | "disconnect") {
  return Effect.gen(function* () {
    const f = yield* fixture()
    f.state.result = { content: [], structuredContent: { changed: true, value: "PRIVATE-ARTIFACT-RESPONSE".repeat(500) } }
    yield* CapabilityPolicyFixture.setRules([...rules, { action: "artifact.write", resource: "*", effect: "ask" }])
    const asked = yield* CapabilityPolicyFixture.observeAsked(f.context)
    const fiber = yield* f.call().pipe(Effect.forkChild)
    const request = yield* Effect.raceFirst(Deferred.await(asked.first), Fiber.join(fiber).pipe(Effect.andThen(Effect.die("SKIPPED_ARTIFACT_APPROVAL"))))
    expect(request.action).toBe("artifact.write")
    expect((yield* f.rows())[0]).toMatchObject({ state: "completed", observation: { data: { remoteOutcome: "completed", materialization: "pending" } } })
    if (mode === "retarget") yield* f.connections.retargetTarget(f.target, { environment: "changed", resource: {} })
    if (mode === "rotate") yield* f.credentials.update(f.selected.id, { value: { type: "key", key: "rotated-after-ACK" } })
    if (mode === "disconnect") yield* f.connections.disconnect(f.connection)
    yield* CapabilityPolicyFixture.setRules(rules)
    yield* f.permissions.reply({ requestID: request.id, reply: "once" })
    const result = f.output(yield* Fiber.join(fiber))
    expect(result.result.status).toBe("partial")
    expect(result.data).toBeUndefined()
    if (result.result.status === "partial") expect(result.result.artifactRefs).toEqual([])
    expect(JSON.stringify(result)).not.toContain("PRIVATE-ARTIFACT-RESPONSE")
    expect(yield* f.artifactRows()).toEqual([])
    expect(yield* f.fs.exists(f.artifactRoot)).toBe(false)
    expect((yield* f.rows())[0]).toMatchObject({ state: "completed", observation: { data: { remoteOutcome: "completed", materialization: "failed" } } })
    expect(f.state.calls).toHaveLength(1)
  })
}
`````

### FX-CAP-SERVICES-1 — `packages/core/test/fixture/capability-services.ts` 42–60

Commit `1cde2ff7a71bcf7aecb5d030917b577165135d38`; blob `5adb23a13279f415e17d29c1e08b879e6bba0c97`; SHA256 integral `835a29cce718eba056da1c83c062240eff62de98bdfc5c8d6ad094cf4a4bd32c`. Bytes fonte 10634; recorte [2495, 3817); SHA256 trecho `a073b1f44d0de871206ed39d1a1b6f87c7841f941d9f8d3f4432e5c1127fd49f`.

`````text
export class OutputLimits extends Context.Service<OutputLimits, Ref.Ref<{ max_bytes: number; max_lines: number }>>()
  ("@orchestra/test/CapabilityServices/OutputLimits") {}

export const layer = Layer.unwrap(Effect.gen(function* () {
  const tmp = yield* Effect.acquireRelease(Effect.promise(() => tmpdir()),
    (tmp) => Effect.promise(() => tmp[Symbol.asyncDispose]()))
  const limits = yield* Ref.make({ max_bytes: ToolOutputStore.MAX_BYTES, max_lines: ToolOutputStore.MAX_LINES })
  return Layer.merge(AppNodeBuilder.build(LayerNode.group([
    Database.node, EventV2.node, SessionProjector.node, SessionStore.node, PermissionV2.node, AgentV2.node,
    Location.node, PermissionSaved.node, ToolRegistry.nativeNode, Global.node, FSUtil.node, Credential.node, ToolOutputStore.node,
  ]), [
    [Location.node, Layer.succeed(Location.Service, CapabilityPolicyFixture.placement)],
    [Global.node, Global.layerWith({ data: join(tmp.path, "data"), home: tmp.path })],
    [Credential.node, Credential.layerFrom(undefined)],
    [Config.node, Layer.succeed(Config.Service, Config.Service.of({ entries: () => Ref.get(limits).pipe(Effect.map((limits) => [
      new Config.Document({ type: "document", info: { tool_output: new ConfigToolOutput.Info(limits) } }),
    ])) }))],
  ]), Layer.succeed(OutputLimits, limits))
}))
`````

### FX-CAP-SERVICES-2 — `packages/core/test/fixture/capability-services.ts` 79–147

Commit `1cde2ff7a71bcf7aecb5d030917b577165135d38`; blob `5adb23a13279f415e17d29c1e08b879e6bba0c97`; SHA256 integral `835a29cce718eba056da1c83c062240eff62de98bdfc5c8d6ad094cf4a4bd32c`. Bytes fonte 10634; recorte [4920, 10417); SHA256 trecho `72e86c5eacd08e06255fbf6d0c1d4dc2ec688416c12bd80ce905196c8193f1fe`.

`````text
export function fixture(options: { name?: string; clock?: { time: number }; descriptors?: CapabilityDescriptors.Store } = {}) {
  return Effect.gen(function* () {
    const f = yield* CapabilityPolicyFixture.fixture(options)
    yield* CapabilityPolicyFixture.setRules(allow)
    const binding = { ...f.binding, rootToolName: options.name ?? "service_call", effectiveRules: allow }
    yield* f.events.publish(SessionEvent.Tool.Called, {
      sessionID: f.context.sessionID, assistantMessageID: f.context.assistantMessageID,
      callID: f.context.toolCallID, tool: binding.rootToolName, input: {},
      timestamp: CapabilityPolicyFixture.timestamp, provider: { executed: false },
    })
    const registry = yield* ToolRegistry.Service
    const connections = yield* CapabilityConnections.make
    const credentials = yield* Credential.Service
    const integrationID = Integration.ID.make("service-fixture")
    const credential = yield* credentials.create({ integrationID, value: { type: "key", key: secret } })
    const connection = yield* connections.create({ provider: request.provider, integrationID, credentialID: credential.id,
      endpoint: "https://service.example.test/mcp", scopeHash: "a".repeat(64), subjectID: "fixture" })
    const target = yield* connections.createTarget(connection, { environment: "test", resource: { project: "selected" } })
    yield* connections.bind({ target, sessionID: f.context.sessionID, agentID: f.context.agent, actions: ["service_discover", "service_call"] })
    const calls = yield* Ref.make<CapabilityDiscovery.Selection[]>([])
    const credentialReads = yield* Ref.make(0)
    const list = yield* Ref.make<CapabilityDiscovery.VendorList>({ tools, catalogGeneration: 1, coverage: "complete", byteLength: 1024 })
    const clock = options.clock ?? { time: 1000 }
    const discovery = yield* CapabilityDiscovery.make({ ttlMillis: 100, now: () => clock.time, descriptors: options.descriptors,
      source: { listTools: (selection) => Effect.gen(function* () {
        yield* Ref.update(calls, (calls) => [...calls, selection])
        return CapabilityServiceProviders.filterCatalog(selection.connection.provider, yield* Ref.get(list))
      }) },
    }).pipe(Effect.provideService(Credential.Service, Credential.Service.of({ ...credentials,
      get: (id) => Ref.update(credentialReads, (n) => n + 1).pipe(Effect.andThen(credentials.get(id))),
    })))
    const seen = yield* Ref.make<readonly Readonly<{
      provider: string; context: Tool.Context; binding: CapabilityInvocation.Binding; hook?: string; captured?: ToolRegistry.Materialization
    }>[]>([])
    const response = yield* Ref.make(output)
    const behavior = yield* Ref.make<Effect.Effect<void, Capability.Failure | CapabilityArtifacts.Failure>>(Effect.void)
    // Only execution dependency is a fixture leaf. Discovery, SQL child admission, policy and safety remain real.
    const execute: CapabilityServiceContract.Execute = (provider, input, context) => Effect.gen(function* () {
      const binding = yield* f.policy.binding(context)
      const captured = yield* ToolRegistry.captured
      if (!captured) return yield* new Capability.Failure({ code: "invocation_binding_missing", message: "Missing captured fixture" })
      const description = yield* discovery.describe(context, input.descriptor, captured)
      const validator = yield* CapabilityVendorSchema.compile(description.inputSchema, description.outputSchema)
      if (!validator.validateInput(input.input).valid)
        return yield* new Capability.Failure({ code: "unsupported_schema", message: "Invalid fixture input" })
      const permit = yield* f.policy.authorize(context, { action: "service_call", resources: ["service_call", provider,
        input.descriptor.connectionID, input.descriptor.targetID, `${provider}:${description.name}`] })
      yield* Ref.get(behavior).pipe(Effect.flatten)
      yield* f.policy.commit(permit, () => f.target).pipe(Effect.catchTag("SqlError", Effect.die))
      const hook = yield* ToolSafety.HookedCall
      yield* Ref.update(seen, (seen) => [...seen, { provider, context, binding, hook, captured }])
      return yield* Ref.get(response)
    })
    const services = yield* CapabilityServices.make({ discovery, execute })
    yield* registry.register(services.tools)
    const materialization = yield* registry.materialize(undefined, { advertisedNames: ["service_find", "service_describe", "service_call"] })
    const run = <A, E, R>(effect: Effect.Effect<A, E, R>, host = binding) => CapabilityInvocation.withContext(host, effect)
    const find = (m = materialization) => run(discovery.find(f.context, request, m))
    const locate = (ref: Capability.DescriptorRef, m = materialization) => run(discovery.locate(f.context, ref, m))
    const settle = (name: string, input: Schema.Json, host = binding, m = materialization) => run(m.settle({
      sessionID: f.context.sessionID, agent: f.context.agent, assistantMessageID: f.context.assistantMessageID,
      call: { type: "tool-call", id: f.context.toolCallID, name, input },
    }), host)
    const rows = () => f.database.db.select().from(CapabilityChildTable)
      .where(eq(CapabilityChildTable.session_id, f.context.sessionID)).all().pipe(Effect.orDie)
    return { ...f, binding, registry, connections, credentials, credential, connection, target, calls, credentialReads, list, clock,
      discovery, seen, response, behavior, services, materialization, run, find, locate, settle, rows }
  })
}
`````

### DIST-GATES-1 — `packages/core/test/distribution-bundle-gates.ts` 1–31

Commit `1cde2ff7a71bcf7aecb5d030917b577165135d38`; blob `7e454200e9bed37746cb2e685f25b4aeefdd9512`; SHA256 integral `d0faddffdfb072c5bab805f7dbfaf7598189e0a9a0c0d2874abe6675a9b9acdb`. Bytes fonte 2200; recorte [0, 2200); SHA256 trecho `d0faddffdfb072c5bab805f7dbfaf7598189e0a9a0c0d2874abe6675a9b9acdb`.

`````text
// Closed cargo/libtest output contract, not source/prose detection. Fake cargo controls
// exercise orchestration only; qualification requires the native job's real cargo log.
export const nativeJobTest = "windows::tests::job_lifetime::native_job_closes_before_stopped_and_release"

export function requireNativeJobReceipts(output: string) {
  const lines = output.replaceAll("\r\n", "\n").trimEnd().split("\n")
  const prefix = `test ${nativeJobTest} ... `
  const tests = lines.filter((line) => line.startsWith(prefix))
  if (tests.length !== 1) throw new Error("BUNDLE_NATIVE_JOB_TEST_MISSING")
  const start = lines.findIndex((line) => line.startsWith(prefix))
  const end = lines.findIndex((line, index) => index > start && (line.startsWith("test ") || line.startsWith("test result:")))
  const summary = lines.find((line, index) => index > start && line.startsWith("test result:"))
  if (end < 0 || !summary) throw new Error("BUNDLE_NATIVE_JOB_RESULT_INVALID")
  const normalized = lines.slice(start, end).map((line) => line.startsWith(prefix) ? line.slice(prefix.length) : line)
  const receipts = [
    ...["stop", "natural", "descendant", "unknown"].map((name) => `native Job lifetime control: ${name} passed`),
    "native Job mutation control: original owned handle stayed valid; OS oracle rejected it",
  ]
  receipts.forEach((receipt) => {
    if (normalized.filter((line) => line === receipt).length !== 1) throw new Error(`BUNDLE_NATIVE_JOB_RECEIPT_MISSING: ${receipt}`)
  })
  if (normalized.filter((line) => line === "ok").length !== 1 ||
      !/^test result: ok\. [1-9]\d* passed; 0 failed; 0 ignored; 0 measured; \d+ filtered out; finished in [\d.]+s$/.test(summary) ||
      lines.some((line) => /^test result: (?!ok\..*; 0 failed;)/.test(line)))
    throw new Error("BUNDLE_NATIVE_JOB_RESULT_INVALID")
  const positions = receipts.map((receipt) => normalized.indexOf(receipt))
  if (positions.some((position, index) => index > 0 && position <= positions[index - 1]) ||
      normalized.indexOf("ok") <= positions[positions.length - 1]) throw new Error("BUNDLE_NATIVE_JOB_RECEIPT_ORDER")
}

if (import.meta.main) requireNativeJobReceipts(await Bun.file(process.argv[2]).text())
`````

### DIST-DENO-1 — `packages/core/test/distribution-bundle-deno.test.ts` 12–64

Commit `1cde2ff7a71bcf7aecb5d030917b577165135d38`; blob `6ce00d3283fd0da58c3dcfb455655e33536eeea4`; SHA256 integral `79ce4546acce744631a635e4a0d237268aa7362de79778e9aa9dfb8a20e8800e`. Bytes fonte 11168; recorte [583, 4224); SHA256 trecho `caae9fd1de9d7fbd44579d272dbf47405abbce3ae7d3db3235151bb431bfa34a`.

`````text
const box = () => Effect.gen(function* () {
  if (process.env.RUNNER_ENVIRONMENT !== "github-hosted" || !process.env.RUNNER_TEMP) throw new Error("DENO_CONTROLS_HOSTED_ONLY")
  const root = yield* Effect.promise(() => realpath(path.resolve(import.meta.dirname, "../../..")))
  const parent = process.env.RUNNER_TEMP
  const temp = yield* Effect.acquireRelease(Effect.promise(() => mkdtemp(path.join(parent, "deno-controls-"))),
    (temp) => Effect.promise(() => rm(temp, { recursive: true, force: true })))
  const envFile = path.join(temp, "github-env")
  yield* Effect.promise(() => writeFile(envFile, "existing environment\n"))
  const row = { package: "cli", platform: process.platform, cpu: process.arch === "x64" ? "X64" : "ARM64",
    host: process.platform === "win32" ? "windows-latest" : "ubuntu-latest" }
  return { root, temp, envFile, env: { ...process.env, GITHUB_WORKSPACE: root, RUNNER_TEMP: temp, GITHUB_ENV: envFile,
    ROW: JSON.stringify(row), RUNNER_OS: process.platform === "win32" ? "Windows" : "Linux", RUNNER_ARCH: row.cpu }, row }
})

it.live("Deno setup admits actual hosted row and regular single-link environment without writes", () => Effect.gen(function* () {
  const owned = yield* box()
  expect(yield* Effect.promise(() => admitDistributionDeno(owned.env))).toMatchObject({ checkout: owned.root, temp: owned.temp, githubEnv: owned.envFile })
  expect(yield* Effect.promise(() => readFile(owned.envFile, "utf8"))).toBe("existing environment\n")
  expect(yield* Effect.promise(() => readdir(owned.temp))).toEqual(["github-env"])
}))

const hosts = [
  ["wrong hosted environment", { RUNNER_ENVIRONMENT: "self-hosted" }, "DENO_OWNED_HOSTED_SETUP_REQUIRED"],
  ["wrong runner OS", { RUNNER_OS: "unsupported" }, "DENO_NATIVE_HOST_MISMATCH"],
  ["wrong runner CPU", { RUNNER_ARCH: "unsupported" }, "DENO_NATIVE_HOST_MISMATCH"],
  ["missing row", { ROW: "null" }, "DENO_NATIVE_HOST_MISMATCH"],
] as const
hosts.forEach(([name, env, diagnostic]) => it.live(`Deno actual admission rejects ${name} before writes`, () => Effect.gen(function* () {
  const owned = yield* box()
  yield* Effect.promise(() => rejectDenoSetup({ ...owned.env, ...env }, diagnostic))
  expect(yield* Effect.promise(() => readFile(owned.envFile, "utf8"))).toBe("existing environment\n")
  expect(yield* Effect.promise(() => readdir(owned.temp))).toEqual(["github-env"])
})))

for (const field of ["platform", "cpu", "host", "package"]) it.live(`Deno actual admission rejects wrong row ${field}`, () => Effect.gen(function* () {
  const owned = yield* box()
  yield* Effect.promise(() => rejectDenoSetup({ ...owned.env, ROW: JSON.stringify({ ...owned.row, [field]: "unsupported" }) }, "DENO_NATIVE_HOST_MISMATCH"))
  expect(yield* Effect.promise(() => readFile(owned.envFile, "utf8"))).toBe("existing environment\n")
}))

for (const defect of ["wrong checkout", "relative temp", "outside environment", "missing environment", "directory environment", "hardlink environment", "symlink environment", "symlink temp"]) {
  it.live(`Deno actual filesystem admission rejects ${defect}`, () => Effect.gen(function* () {
    const owned = yield* box()
    const changed = { ...owned.env }
    const target = path.join(owned.temp, "control")
    yield* Effect.promise(async () => {
      if (defect === "wrong checkout") changed.GITHUB_WORKSPACE = owned.temp
      if (defect === "relative temp") changed.RUNNER_TEMP = path.relative(process.cwd(), owned.temp)
      if (defect === "outside environment") {
        await mkdir(target)
        changed.RUNNER_TEMP = target
      }
      if (defect === "missing environment") changed.GITHUB_ENV = target
`````

### DIST-DENO-2 — `packages/core/test/distribution-bundle-deno.test.ts` 79–115

Commit `1cde2ff7a71bcf7aecb5d030917b577165135d38`; blob `6ce00d3283fd0da58c3dcfb455655e33536eeea4`; SHA256 integral `79ce4546acce744631a635e4a0d237268aa7362de79778e9aa9dfb8a20e8800e`. Bytes fonte 11168; recorte [5284, 7047); SHA256 trecho `ee7115625658876b827863379a02a6771f22d1b216e0332055c06479adfd2145`.

`````text
  const bytes = new TextEncoder().encode("digest control")
  const digest = createHash("sha256").update(bytes).digest("hex")
  const server = yield* Effect.acquireRelease(Effect.promise(async () => {
    const server = createServer((request, response) => {
      state.sockets.add(request.socket)
      request.socket.once("close", () => {
        state.sockets.delete(request.socket)
        // Observe the real connection, not a ReadableStream cancellation callback.
        if (!response.writableFinished) state.transportClosed = true
      })
      response.once("finish", () => { state.responseFinished = true })
      const route = new URL(request.url ?? "/", "http://127.0.0.1").pathname
      if (route === "/ok") return response.end(bytes)
      if (route === "/http-error") { response.statusCode = 503; return response.end("unavailable") }
      if (route === "/empty") return response.end()
      if (route === "/length") {
        response.setHeader("content-length", String(distributionDenoMaxBytes + 1))
        response.flushHeaders()
        response.write(bytes)
        return // Deliberately unfinished: the client must close this transport.
      }
      response.flushHeaders()
      const chunk = Buffer.alloc(8 * 1024 * 1024)
      const pump = () => {
        while (!response.destroyed && state.chunks < 64) {
          state.chunks++
          if (!response.write(chunk)) { response.once("drain", pump); return }
        }
        // Never end the response: draining buffered bytes is not a cancellation oracle.
      }
      pump()
    })
    await new Promise<void>((resolve, reject) => {
      server.once("error", reject)
      server.listen(0, "127.0.0.1", () => { server.off("error", reject); resolve() })
    })
    return server
`````

### DIST-DENO-3 — `packages/core/test/distribution-bundle-deno.test.ts` 121–176

Commit `1cde2ff7a71bcf7aecb5d030917b577165135d38`; blob `6ce00d3283fd0da58c3dcfb455655e33536eeea4`; SHA256 integral `79ce4546acce744631a635e4a0d237268aa7362de79778e9aa9dfb8a20e8800e`. Bytes fonte 11168; recorte [7251, 10557); SHA256 trecho `35dd71e405e2bedb3829d00f3f8a8a0d8e4e507146110b578eca9b7216c6923a`.

`````text
  if (!address || typeof address === "string") throw new Error("DENO_HTTP_FIXTURE_ADDRESS_MISSING")
  return { state, bytes, digest, url: `http://127.0.0.1:${address.port}` }
})

it.live("Deno actual streaming download returns bytes only after digest positive control", () => Effect.gen(function* () {
  yield* box()
  const server = yield* http()
  const result = yield* Effect.promise(() => downloadDistributionDeno(`${server.url}/ok`, server.digest))
  expect(result.bytes).toEqual(Buffer.from(server.bytes))
  expect(result.sha256).toBe(server.digest)
  expect(server.state.responseFinished, "DENO_HTTP_POSITIVE_RESPONSE_INCOMPLETE").toBe(true)
  expect(server.state.transportClosed).toBe(false)
}))

it.live("Deno HTTP cancellation oracle rejects a live response and observes actual fetch abort", () => Effect.gen(function* () {
  yield* box()
  const server = yield* http()
  const controller = yield* Effect.acquireRelease(Effect.sync(() => new AbortController()),
    (controller) => Effect.sync(() => controller.abort()))
  const response = yield* Effect.promise(() => fetch(`${server.url}/length`, { signal: controller.signal }))
  expect(response.headers.get("content-length")).toBe(String(distributionDenoMaxBytes + 1))
  const live = yield* Effect.exit(Effect.promise(() => requireTransportClosed(server.state, "length", 50)))
  expect(live._tag === "Failure" && Cause.pretty(live.cause).includes("DENO_OVERFLOW_HTTP_LENGTH_NOT_CANCELLED")).toBe(true)
  controller.abort()
  yield* Effect.promise(async () => { await response.body?.cancel().catch(() => {}) })
  yield* Effect.promise(() => requireTransportClosed(server.state, "length"))
}))

for (const [route, diagnostic] of [["http-error", "DENO_UPSTREAM_DOWNLOAD_FAILED: HTTP 503"], ["empty", "DENO_DOWNLOAD_SIZE_MISMATCH"],
  ["length", "DENO_DOWNLOAD_CONTENT_LENGTH_LIMIT"], ["ok", "DENO_UPSTREAM_DIGEST_MISMATCH"], ["stream", "DENO_DOWNLOAD_STREAM_LIMIT"]]) {
  it.live(`Deno actual HTTP rejects ${route} with ${diagnostic}`, () => Effect.gen(function* () {
    const owned = yield* box()
    const server = yield* http()
    yield* Effect.promise(async () => {
      const error = await downloadDistributionDeno(`${server.url}/${route}`, "0".repeat(64)).then(() => undefined, (error: unknown) => error)
      if (!(error instanceof Error)) throw new Error("DENO_DOWNLOAD_NAMED_ERROR_MISSING")
      if (route === "length" || route === "stream") { expect(error.message).toBe(diagnostic); return }
      expect(error.message).toContain(diagnostic)
    })
    if (route === "length" || route === "stream") {
      yield* Effect.promise(() => requireTransportClosed(server.state, route))
    }
    if (route === "stream") {
      expect(server.state.chunks).toBeGreaterThan(16)
    }
    expect(yield* Effect.promise(() => readdir(owned.temp))).toEqual(["github-env"])
  }))
}

test("Deno actual runtime version parser rejects wrong/empty/comment-only version", () => {
  requireDistributionDenoVersion(`deno ${distributionDenoVersion} (stable, release, x86_64-unknown-linux-gnu)\nv8 14\ntypescript 6\n`)
  for (const output of ["", "# deno 2.9.7", "deno 2.9.70", "deno 2.9.6", "deno 2.9.7-canary", "warning\ndeno 2.9.7"]) {
    expect(() => requireDistributionDenoVersion(output), output).toThrow("DENO_RUNTIME_VERSION_MISMATCH")
  }
})

`````

### DIST-WORKFLOW-1 — `packages/core/test/distribution-bundle-workflow.test.ts` 1–40

Commit `1cde2ff7a71bcf7aecb5d030917b577165135d38`; blob `3e95940d6d99808919981d35d455ed5b6d457b30`; SHA256 integral `1089bdac6f924958c7e9dd93a3041a380ad61be6004880b42229bc70dc73d539`. Bytes fonte 23702; recorte [0, 3306); SHA256 trecho `8f497dcecd2f3fba4e237bc239f0d9cd3d65ccf185fab999877e0aff7cc020d3`.

`````text
import { YAML } from "bun"
import { expect, test } from "bun:test"
import { statSync } from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"
import { Schema } from "effect"
import { preloadsControl } from "../../../script/test-ci-request"

const root = fileURLToPath(new URL("../../../", import.meta.url))
const Step = Schema.Struct({
  name: Schema.optional(Schema.String), run: Schema.optional(Schema.String), uses: Schema.optional(Schema.String),
  if: Schema.optional(Schema.String), shell: Schema.optional(Schema.String), "working-directory": Schema.optional(Schema.String),
  "continue-on-error": Schema.optional(Schema.Boolean), env: Schema.optional(Schema.Record(Schema.String, Schema.String)),
  with: Schema.optional(Schema.Record(Schema.String, Schema.Unknown)),
})
const Row = Schema.Struct({ lane: Schema.optional(Schema.String), package: Schema.String, host: Schema.String, cpu: Schema.String, platform: Schema.String,
  files: Schema.optional(Schema.Array(Schema.String)) })
const Job = Schema.Struct({ name: Schema.optional(Schema.String), "runs-on": Schema.String, "timeout-minutes": Schema.Number,
  defaults: Schema.optional(Schema.Struct({ run: Schema.Struct({ shell: Schema.String }) })),
  "continue-on-error": Schema.optional(Schema.Boolean), if: Schema.optional(Schema.String),
  env: Schema.optional(Schema.Record(Schema.String, Schema.String)), steps: Schema.Array(Step),
  strategy: Schema.optional(Schema.Struct({ "fail-fast": Schema.Boolean, "max-parallel": Schema.Number,
    matrix: Schema.StructWithRest(Schema.Struct({ include: Schema.optional(Schema.Array(Row)) }), [Schema.Record(Schema.String, Schema.Unknown)]) })) })
const Workflow = Schema.Struct({ name: Schema.String, on: Schema.Record(Schema.String, Schema.Unknown),
  permissions: Schema.Record(Schema.String, Schema.String), defaults: Schema.Struct({ run: Schema.Struct({ shell: Schema.String }) }),
  env: Schema.Record(Schema.String, Schema.String), jobs: Schema.Record(Schema.String, Job) })
const source = YAML.parse(await Bun.file(path.join(root, ".github/workflows/distribution-bundle.yml")).text())
const selector = await Bun.file(path.join(root, "apps/cli/script/test.ts")).text()
const distribution = [...new Bun.Glob("test/distribution-*.test.ts").scanSync({ cwd: path.join(root, "apps/cli") })].map((file) => `./${file.replaceAll("\\", "/")}`)
const checkout = "actions/checkout@34e114876b0b11c390a56381ad16ebd13914f8d5"
const upload = "actions/upload-artifact@ea165f8d65b6e75b540449e92b4886f43607fa02"

test("real bundle source passes structural coverage and generic CLI discovery checks", async () => {
  inspect(source)
  check(preloadsControl(Schema.decodeUnknownSync(Schema.Struct({ test: Schema.Struct({ preload: Schema.Array(Schema.String) }) }))(Bun.TOML.parse(await Bun.file(path.join(root, "packages/core/bunfig.toml")).text()))), "BUNDLE_CORE_PRELOAD")
  check(preloadsControl(Schema.decodeUnknownSync(Schema.Struct({ test: Schema.Struct({ preload: Schema.Array(Schema.String) }) }))(Bun.TOML.parse(await Bun.file(path.join(root, "apps/desktop/bunfig.toml")).text()))), "BUNDLE_DESKTOP_PRELOAD")
  for (const platform of ["linux", "win32", "darwin"]) {
    for (const exitCode of [0, 17]) {
      const calls: string[][] = []
      const exits: number[] = []
`````

### DIST-WORKFLOW-2 — `packages/core/test/distribution-bundle-workflow.test.ts` 75–115

Commit `1cde2ff7a71bcf7aecb5d030917b577165135d38`; blob `3e95940d6d99808919981d35d455ed5b6d457b30`; SHA256 integral `1089bdac6f924958c7e9dd93a3041a380ad61be6004880b42229bc70dc73d539`. Bytes fonte 23702; recorte [6885, 11718); SHA256 trecho `b7e6bcf06e8b3471d1807591f39e9f0c40959f96a18ed7f0d3af7c984f9dbb00`.

`````text
    ["BUNDLE_ARTIFACT_NAME", (value) => patchStep(value, undefined, (step) => step.uses === upload ? { ...step, with: { ...step.with, name: "distribution-${{ matrix.package }}-${{ matrix.host }}-${{ github.run_attempt }}" } } : step)],
    ["BUNDLE_FILES", (value) => patchRows(value, (row) => ({ ...row, files: undefined }))],
    ["BUNDLE_FILES", (value) => patchRows(value, (row) => ({ ...row, files: [] }))],
    ["BUNDLE_FILES_REPEATED", (value) => patchRows(value, (row) => ({ ...row, files: [...(row.files ?? []), ...(row.files?.slice(0, 1) ?? [])] }))],
    ["BUNDLE_FILES_OVERLAP", (value) => patchRows(value, (row) => row.lane === "regression" && row.package === "cli" && row.platform === "linux" ? { ...row, files: [...(row.files ?? []), "./test/distribution-musl.test.ts"] } : row)],
    ["BUNDLE_FILES_OVERLAP", (value) => patchRows(value, (row) => row.lane === "musl" ? { ...row, files: [...(row.files ?? []), "./test/packaged-skills-build.test.ts"] } : row)],
    ["BUNDLE_EXACT_FILES", (value) => patchRows(value, (row) => row.lane === "musl" ? { ...row, files: [...(row.files ?? []), "./test/artifact-native-lane.test.ts"] } : row)],
    ["BUNDLE_EXACT_FILES", (value) => patchRows(value, (row) => row.package === "core" ? { ...row, files: row.files?.filter((file) => !file.endsWith("ripgrep-binary.test.ts")) } : row)],
    ["BUNDLE_NATIVE_PROOF", (value) => patchRows(value, (row) => ({ ...row, files: row.files?.filter((file) => !file.endsWith("distribution-native.test.ts")) }))],
    ["BUNDLE_WINDOWS_PROOF", (value) => patchRows(value, (row) => ({ ...row, files: row.files?.filter((file) => !file.endsWith("distribution-windows.test.ts")) }))],
    ["BUNDLE_MUSL_PROOF", (value) => patchRows(value, (row) => row.lane === "musl" ? { ...row, files: ["./test/artifact-native-lane.test.ts"] } : row)],
    ["BUNDLE_DENO", (value) => patchStep(value, "Install native Deno", () => undefined)],
    ["BUNDLE_DENO", (value) => patchStep(value, "Install native Deno", (step) => ({ ...step, if: "matrix.lane == 'regression' && matrix.package == 'cli'" }))],
    ["BUNDLE_NATIVE_JOB", (value) => patchStep(value, "Prove native Windows Job handle closure", () => undefined)],
    ["BUNDLE_NATIVE_POSIX", (value) => patchStep(value, "Prove native POSIX ABI", () => undefined)],
    ["BUNDLE_NATIVE_POSIX", (value) => patchStep(value, "Prove native POSIX ABI", (step) => ({ ...step, if: "matrix.platform == 'linux'" }))],
    ["BUNDLE_NATIVE_POSIX", (value) => patchStep(value, "Prove native POSIX ABI", (step) => ({ ...step, run: step.run?.replace("-t POSIX", "-t unobserved") }))],
    ["BUNDLE_NATIVE_POSIX", (value) => patchStep(value, "Prove native POSIX ABI", (step) => ({ ...step, run: step.run?.replace("export ORCHESTRA_ARTIFACT_DARWIN_SDK", "export UNOBSERVED_SDK") }))],
    ["BUNDLE_SOURCE_ABI", (value) => patchStep(value, "Prove source ABI producers", () => undefined)],
    ["BUNDLE_SOURCE_ABI", (value) => patchStep(value, "Prove source ABI producers", (step) => ({ ...step, if: "matrix.package == 'cli' && matrix.host == 'ubuntu-latest'" }))],
    ["BUNDLE_DESKTOP_ABI", (value) => patchStep(value, "Prove Desktop ABI consumer", () => undefined)],
    ["BUNDLE_SCHEMA_ELF", (value) => patchStep(value, "Prove Schema ELF ABI", () => undefined)],
    ["BUNDLE_PARSER_ABI", (value) => patchStep(value, "Prove packaged parser ABI", () => undefined)],
    ["BUNDLE_CONTROL", (value) => patchStep(value, "Require nonce-bound positive control", () => undefined)],
  ]
  mutations.forEach(([name, mutate]) => expect(() => inspect(mutate(Schema.decodeUnknownSync(Workflow)(source))), name).toThrow(name))
})

test("root discovery coverage rejects omissions in both directions and accepts row/file reordering", () => {
  expect(() => inspect(source, [])).toThrow("BUNDLE_DISTRIBUTION_DISCOVERY_EMPTY")
  expect(() => inspect(source, [...distribution, "./test/distribution-new.test.ts"])).toThrow("BUNDLE_UNREACHED: ./test/distribution-new.test.ts")
  expect(() => inspect(source, distribution.filter((file) => file !== "./test/distribution-musl.test.ts"))).toThrow("BUNDLE_UNDISCOVERED: ./test/distribution-musl.test.ts")
  inspect(patchMatrix(Schema.decodeUnknownSync(Workflow)(source), (rows) => rows.toReversed().map((row) => ({ ...row, files: row.files?.toReversed() }))))
})

function inspect(input: unknown, discovered = distribution) {
  const value = Schema.decodeUnknownSync(Workflow)(input)
  check(value.name === "distribution-bundle" && Object.keys(value.on).toSorted().join() === "push,workflow_call,workflow_dispatch", "BUNDLE_TRIGGERS")
  // Neither trigger takes inputs or secrets: no hosted-model calls in CI (owner, 2026-10-27).
  check(value.on.workflow_dispatch === null && value.on.workflow_call === null, "BUNDLE_TRIGGERS")
  expect(value.on.push).toEqual({ branches: ["distribution-bundle"] })
`````

### CI-REQUEST-1 — `packages/core/test/test-ci-request.test.ts` 152–182

Commit `1cde2ff7a71bcf7aecb5d030917b577165135d38`; blob `bb26003da8bc849ecd562789cc8847469297e49f`; SHA256 integral `2295faed2168e2f3063797b95c0ab1f1304c0253efc4570e2946af5a40237bbb`. Bytes fonte 21226; recorte [9533, 11679); SHA256 trecho `62fbe827fb441e7dca7b284e7add52106a478763fc3a5d7b457cff25a27db5dd`.

`````text
test("selection rejects empty, partially ignored and extra files; accepts exact files", () => {
  expect(() => validateSelection([spec], [spec])).not.toThrow()
  expect(() => validateSelection([], [])).toThrow("nonempty")
  expect(() => validateSelection([spec], [])).toThrow(`empty selection: ${spec}`)
  expect(() => validateSelection([spec, benchmark], [spec])).toThrow(`empty selection: ${benchmark}`)
  expect(() => validateSelection([spec], [spec, benchmark])).toThrow(`unexpected selection: ${benchmark}`)
})

for (const flag of ["--os", "--runner", "--config", "--benchmark-renderer"])
  test(`${flag} rejects missing and repeated values`, () => {
    expect(() => parseOptions(["app", flag])).toThrow(`${flag} needs a value`)
    expect(() => parseOptions(["app", flag, "--help"])).toThrow(`${flag} needs a value`)
    expect(() => parseOptions(["app", flag, "value", flag, "value"])).toThrow(`${flag} repeated`)
  })

for (const [argv, reason] of [
  [["--os", "unknown"], "--os must be"], [["--runner", "shell"], "--runner must be"],
  [["--config", config], "--config requires"], [["--runner", "playwright", "-t", "filter"], "only named"],
] as const)
  test(`invalid CLI ${argv.join(" ")}`, () => expect(() => parseOptions(["app", ...argv])).toThrow(reason))

for (const [patch, reason] of [
  [{ package: "../app" }, "valid package"], [{ package: "relay" }, "cannot run"],
  [{ runner: "shell" }, "cannot run"], [{ runner: 0 }, "cannot run"], [{ config: undefined }, "config must be"],
  [{ config: "playwright.config.ts" }, "config must be"], [{ args: [] }, "nonempty"],
  [{ args: [spec, spec] }, "repeated"], [{ args: ["e2e/missing.spec.ts"] }, "spec missing"],
  [{ args: ["e2e/../regression/x.spec.ts"] }, "invalid spec path"], [{ args: ["/tmp/x.spec.ts"] }, "invalid spec path"],
  [{ args: ["e2e/**/*.spec.ts"] }, "invalid spec path"], [{ args: ["--pass-with-no-tests"] }, "invalid spec path"],
  [{ args: [benchmark] }, "invalid spec path"], [{ args: [42] }, "string array"],
] as const)
  test(`invalid request ${JSON.stringify(patch)}`, () => expect(() => validateRequest({ ...valid, ...patch }, isFile)).toThrow(reason))
`````

### CI-REQUEST-2 — `packages/core/test/test-ci-request.test.ts` 212–236

Commit `1cde2ff7a71bcf7aecb5d030917b577165135d38`; blob `bb26003da8bc849ecd562789cc8847469297e49f`; SHA256 integral `2295faed2168e2f3063797b95c0ab1f1304c0253efc4570e2946af5a40237bbb`. Bytes fonte 21226; recorte [13949, 16091); SHA256 trecho `bf78432f02e2dccebe8cfb97ca8d06683312b6217a0a5dc91f2668243791ea0a`.

`````text
test("report requires exact OS matrix jobs; missing, repeated and extra hosts fail", () => {
  const jobs = ["ubuntu-24.04", "windows-latest", "macos-14"].map((host) => ({ name: `test (${host})` }))
  expect(requireTestJobs("all", [...jobs, { name: "cleanup" }])).toEqual(jobs)
  for (const [os, indices] of [["linux", [0]], ["windows", [1]], ["macos", [2]], ["both", [0, 1]]] as const)
    expect(requireTestJobs(os, indices.map((index) => jobs[index]!))).toHaveLength(indices.length)
  expect(() => requireTestJobs("linux", [])).toThrow("test (ubuntu-24.04): missing or repeated")
  expect(() => requireTestJobs("linux", undefined as unknown as { name: string }[])).toThrow("missing matrix jobs")
  expect(() => requireTestJobs("all", jobs.slice(0, 2))).toThrow("test (macos-14): missing or repeated")
  expect(() => requireTestJobs("linux", [jobs[0]!, jobs[0]!])).toThrow("repeated")
  expect(() => requireTestJobs("linux", jobs)).toThrow("test (windows-latest): unexpected")
})

test("successful report requires step metadata, step log, endgroup and nonempty output", () => {
  const job = { name: "test (ubuntu-24.04)", conclusion: "success", steps: [{ name: "Run tests", conclusion: "success" }] }
  const log = (text: string) => `test (ubuntu-24.04)\tRun tests\t2026-10-09T00:00:00Z ${text}`
  expect(reportLines(job, [log("##[endgroup]"), log("\u001b[32m1 pass\u001b[0m")].join("\n"))).toEqual(["1 pass"])
  expect(reportLines(job, [log("##[endgroup]"), log("1 pass")].join("\r\n"))).toEqual(["1 pass"])
  expect(() => reportLines(job, " \n")).toThrow(`${job.name}: empty job log`)
  expect(() => reportLines({ ...job, steps: [] }, log("1 pass"))).toThrow("missing successful Run tests step")
  expect(() => reportLines({ ...job, steps: [{ name: "Run tests", conclusion: "skipped" }] }, log("1 pass"))).toThrow("missing successful Run tests step")
  expect(() => reportLines(job, "test\tSetup Bun\tinstall failed")).toThrow("missing Run tests log")
  expect(() => reportLines(job, log("1 pass"))).toThrow("missing Run tests endgroup marker")
  expect(() => reportLines(job, log("##[endgroup]"))).toThrow("empty Run tests output")
})

`````

### CI-REQUEST-3 — `packages/core/test/test-ci-request.test.ts` 265–295

Commit `1cde2ff7a71bcf7aecb5d030917b577165135d38`; blob `bb26003da8bc849ecd562789cc8847469297e49f`; SHA256 integral `2295faed2168e2f3063797b95c0ab1f1304c0253efc4570e2946af5a40237bbb`. Bytes fonte 21226; recorte [17949, 21226); SHA256 trecho `0185a8b68f59d80b9e8fa323fd4baaa141924d1a99d77f9ed89292c829083454`.

`````text
test("controlVerdict accepts exactly one verdict line carrying this job's nonce, nothing else", () => {
  const job = { name: "test (ubuntu-24.04)" }
  const nonce = "0123456789abcdef0123456789abcdef"
  const row = (step: string, text: string) => `test (ubuntu-24.04)\t${step}\t2026-10-12T03:10:05.9742438Z ${text}`
  const nonceRow = row("Omni control nonce", `omni control nonce: ${nonce}`)
  const header = row("Omni control nonce", 'echo "omni control nonce: $nonce"')
  const verdict = row("Run tests", `omni positive control [${nonce}]: pass (declared: 1 test(s) in a.test.ts); 3 omni spawn(s), 0 delegated.`)
  const thrown = row("Run tests", `error: omni positive control [${nonce}]: FAIL (suite: every run must spawn through omni). no omni spawn.`)
  const fake = row("Run tests", "omni positive control: pass (suite: every run must spawn through omni); 9 omni spawn(s), 0 delegated.")
  const otherNonce = row("Run tests", "omni positive control [ffffffffffffffffffffffffffffffff]: pass (suite: ...)")
  const frame = row("Run tests", " 70 |   if (problem) throw new Error(`${tag}: FAIL (${reason}). ${problem}`)")
  expect(controlVerdict(job, [header, nonceRow, fake, otherNonce, frame, verdict].join("\n")))
    .toBe("omni positive control: pass (declared: 1 test(s) in a.test.ts); 3 omni spawn(s), 0 delegated.")
  // Only "pass" and "not applicable" count: a FAIL or an "off" (legacy rollback, nothing checked) verdict is rejected.
  expect(() => controlVerdict(job, [nonceRow, thrown].join("\r\n")))
    .toThrow("did not pass: omni positive control: FAIL (suite: every run must spawn through omni). no omni spawn.")
  const off = row("Run tests", `omni positive control [${nonce}]: off (legacy rollback); nothing checked.`)
  expect(() => controlVerdict(job, [nonceRow, off].join("\n"))).toThrow("did not pass: omni positive control: off (legacy rollback)")
  const passing = row("Run tests", `omni positive control [${nonce}]: passing (suite: ...)`)
  expect(() => controlVerdict(job, [nonceRow, passing].join("\n"))).toThrow("did not pass")
  // Interleaved output on the verdict's line still yields the verdict.
  const interleaved = row("Run tests", `(pass) a [1ms]omni positive control [${nonce}]: not applicable (focused: no declaring test ran); nothing.`)
  expect(controlVerdict(job, [nonceRow, interleaved].join("\n"))).toBe("omni positive control: not applicable (focused: no declaring test ran); nothing.")
  // Step attribution can read UNKNOWN STEP; the nonce still counts unless it was printed by the tests.
  expect(controlVerdict(job, [row("UNKNOWN STEP", `omni control nonce: ${nonce}`), verdict].join("\n"))).toContain("pass")
  expect(() => controlVerdict(job, [nonceRow, fake].join("\n"))).toThrow("expected one omni positive control verdict for this run's nonce, found 0")
  expect(() => controlVerdict(job, [nonceRow, verdict, verdict].join("\n"))).toThrow("found 2")
  expect(() => controlVerdict(job, [verdict].join("\n"))).toThrow("expected one omni control nonce, found 0")
  expect(() => controlVerdict(job, [row("Run tests", `omni control nonce: ${nonce}`), verdict].join("\n"))).toThrow("found 0")
  expect(() => controlVerdict(job, [nonceRow, nonceRow, verdict].join("\n"))).toThrow("expected one omni control nonce, found 2")
})
`````

### CI-UPLOAD-1 — `packages/core/test/test-ci-upload.test.ts` 79–123

Commit `1cde2ff7a71bcf7aecb5d030917b577165135d38`; blob `b6b678f6d3281ac88d5a58f644d2535c07b4a031`; SHA256 integral `c0f7b483ea9209b9efc53bc68c32dffc6f59b352b50e45ce6716e676291165f8`. Bytes fonte 7579; recorte [3232, 5524); SHA256 trecho `15e5aaa1b8008e70570a8bd0edf65a45188e645bff0373c9b9c8e3fc15eddf78`.

`````text
// What `gh api --include` prints: the status line, CRLF-terminated headers, a blank line, then the body.
const output = (status: string, headers: Record<string, string>, body: string) =>
  `HTTP/2.0 ${status}\n${Object.entries({ "Content-Type": "application/json; charset=utf-8", ...headers })
    .map((entry) => `${entry[0]}: ${entry[1]}\r\n`)
    .join("")}\r\n${body}`

const secondary = JSON.stringify({ message: "You have exceeded a secondary rate limit. Please wait a few minutes." })

describe("test:ci rate limit", () => {
  test("reads the status, headers and body gh prints", () => {
    const response = parseResponse(output("201 Created", { "X-Ratelimit-Remaining": "4999" }, '{"sha":"abc"}'))
    expect(response.status).toBe(201)
    expect(response.headers.get("x-ratelimit-remaining")).toBe("4999")
    expect(JSON.parse(response.body)).toEqual({ sha: "abc" })
    expect(parseResponse(output("204 No Content", {}, "")).body).toBe("")
    expect(parseResponse("").status).toBe(0)
  })

  test("honours Retry-After", () => {
    expect(rateLimitDelay(parseResponse(output("403 Forbidden", { "Retry-After": "60" }, secondary)), 0)).toBe(60_000)
    expect(rateLimitDelay(parseResponse(output("429 Too Many Requests", { "Retry-After": "5" }, "{}")), 3)).toBe(5_000)
  })

  test("waits for the reset when no requests remain", () => {
    const response = output(
      "429 Too Many Requests",
      { "X-Ratelimit-Remaining": "0", "X-Ratelimit-Reset": "1030" },
      "{}",
    )
    expect(rateLimitDelay(parseResponse(response), 0, 1_000_000)).toBe(30_000)
  })

  test("backs off from a minute when GitHub gives no hint", () => {
    const response = parseResponse(output("403 Forbidden", {}, secondary))
    expect([0, 1, 2].map((attempt) => rateLimitDelay(response, attempt))).toEqual([60_000, 120_000, 240_000])
  })

  test("does not retry other failures", () => {
    const forbidden = JSON.stringify({ message: "Resource not accessible by integration" })
    expect(
      rateLimitDelay(parseResponse(output("403 Forbidden", { "Retry-After": "60" }, forbidden)), 0),
    ).toBeUndefined()
    expect(rateLimitDelay(parseResponse(output("422 Unprocessable Entity", {}, "{}")), 0)).toBeUndefined()
    expect(rateLimitDelay(parseResponse(""), 0)).toBeUndefined()
  })
`````

### CI-UPLOAD-2 — `packages/core/test/test-ci-upload.test.ts` 164–183

Commit `1cde2ff7a71bcf7aecb5d030917b577165135d38`; blob `b6b678f6d3281ac88d5a58f644d2535c07b4a031`; SHA256 integral `c0f7b483ea9209b9efc53bc68c32dffc6f59b352b50e45ce6716e676291165f8`. Bytes fonte 7579; recorte [6999, 7579); SHA256 trecho `b7615d3575458ea52892b74106c3df3ff253de83877e56a0325f06dac7b980c2`.

`````text
          "packages\\orchestra\\a.test.ts",
          ".\\a.test.ts",
        ],
        isFile,
      ),
    ).toEqual([
      "./a.test.ts",
      "./test/cli/run/permission.shared.test.ts",
      "./test/cli/tui/editor-context.test.tsx",
      "./a.test.ts",
      "./a.test.ts",
    ])
  })

  test("passes directories and filters through unchanged", () => {
    expect(
      testPaths("orchestra", ["test/cli", "permission", "packages/orchestra/test/cli", "*.test.ts", "--bail"], isFile),
    ).toEqual(["test/cli", "permission", "test/cli", "*.test.ts", "--bail"])
  })
})
`````

### CI-CACHE-1 — `packages/core/test/setup-bun-cache.test.ts` 28–64

Commit `1cde2ff7a71bcf7aecb5d030917b577165135d38`; blob `6497623ffb392b7b00eb4875ebf9f92080d50b45`; SHA256 integral `e6d0ca2d91d73b5dbe442317286c6914f946537d3dc03347bc2745d96293853a`. Bytes fonte 11241; recorte [1219, 3395); SHA256 trecho `e53dc989432ec5055d849c9ed97cf379b3c18a4fc82dc784a6bb7fa89f9d217e`.

`````text
describe("setup-bun cache architecture repair", () => {
  it.live("real YAML Bash outputs isolate architectures and restore/save share those outputs", () =>
    Effect.gen(function* () {
      expectSpawn(import.meta.path)
      const steps = yield* Effect.promise(loadSteps)
      const keys = requireStep(steps, "id", "keys")
      expect(keys.shell).toBe("bash")
      const bunRestore = requireStep(steps, "id", "bun-cache")
      const modulesRestore = requireStep(steps, "id", "modules-cache")
      const bunSave = requireStep(steps, "name", "Save Bun dependencies")
      const modulesSave = requireStep(steps, "name", "Save node_modules")
      ;[bunRestore, modulesRestore].forEach((step) => {
        expect(text(step.uses, "CACHE_RESTORE_USES_MISSING")).toStartWith("actions/cache/restore@")
        expect(steps.indexOf(keys)).toBeLessThan(steps.indexOf(step))
      })
      ;[bunSave, modulesSave].forEach((step) =>
        expect(text(step.uses, "CACHE_SAVE_USES_MISSING")).toStartWith("actions/cache/save@"),
      )
      expect(bunRestore.with?.key).toBe("${{ steps.keys.outputs.bun }}")
      expect(bunSave.with?.key).toBe(bunRestore.with?.key)
      expect(modulesRestore.with?.key).toBe("${{ steps.keys.outputs.modules }}")
      expect(modulesSave.with?.key).toBe(modulesRestore.with?.key)
      expect(modulesRestore.with?.["restore-keys"]).toBeUndefined()
      expect(modulesSave.with?.path).toBe(modulesRestore.with?.path)
      const paths = text(modulesRestore.with?.path, "CACHE_MODULE_PATHS_MISSING").trim().split(/\r?\n/)
      ;["packages/*/node_modules", "packages/*/*/node_modules", "modules/*/node_modules", "modules/*/*/node_modules", "tooling/*/node_modules"]
        .forEach((pattern) => expect(paths).toContain(pattern))

      const rows = yield* Effect.all(
        runners.map((runner) => runEmitter(text(keys.run, "CACHE_KEY_SCRIPT_MISSING"), runner)),
        { concurrency: 1 },
      )
      expect(architectureCollisions(rows)).toEqual([])
      rows.forEach((row) => {
        expect(row.outputs).toEqual({
          bun: `${row.os}-${row.arch}-bun-v3-${hash}`,
          modules: `${row.os}-${row.arch}-modules-v4-${hash}`,
`````

### CI-CACHE-2 — `packages/core/test/setup-bun-cache.test.ts` 86–105

Commit `1cde2ff7a71bcf7aecb5d030917b577165135d38`; blob `6497623ffb392b7b00eb4875ebf9f92080d50b45`; SHA256 integral `e6d0ca2d91d73b5dbe442317286c6914f946537d3dc03347bc2745d96293853a`. Bytes fonte 11241; recorte [4135, 5432); SHA256 trecho `95fb24bf3aad962b63dda06cee305f7ac961d50119c1f9bca5e6b5b15332c87e`.

`````text
      // Original emitter is the regression control, executed by the same Bash path as the parsed action.
      const legacy = `echo "bun=\${{ runner.os }}-bun-v2-\${{ hashFiles('bun.lock') }}" >> "$GITHUB_OUTPUT"
echo "modules=\${{ runner.os }}-modules-v1-\${{ hashFiles('bun.lock', 'patches/**', 'package.json') }}" >> "$GITHUB_OUTPUT"`
      const rows = yield* Effect.all(runners.map((runner) => runEmitter(legacy, runner)), { concurrency: 1 })
      expect(architectureCollisions(rows)).toEqual([
        "CACHE_ARCH_COLLISION bun: Linux/X64 and Linux/ARM64",
        "CACHE_ARCH_COLLISION modules: Linux/X64 and Linux/ARM64",
        "CACHE_ARCH_COLLISION bun: macOS/X64 and macOS/ARM64",
        "CACHE_ARCH_COLLISION modules: macOS/X64 and macOS/ARM64",
        "CACHE_ARCH_COLLISION bun: Windows/X64 and Windows/ARM64",
        "CACHE_ARCH_COLLISION modules: Windows/X64 and Windows/ARM64",
      ])
    }),
  )

  test("extraction and controlled expressions fail closed with named failures", () => {
    const runner = { os: "Linux", arch: "ARM64" }
    expect(() => requireStep([], "id", "keys")).toThrow("CACHE_STEP_MISSING_OR_DUPLICATE: id=keys")
    expect(() => requireStep([{ id: "keys" }, { id: "keys" }], "id", "keys")).toThrow(
      "CACHE_STEP_MISSING_OR_DUPLICATE: id=keys",
`````

### CI-CONTROL-1 — `packages/core/test/test-omni-control.test.ts` 26–70

Commit `1cde2ff7a71bcf7aecb5d030917b577165135d38`; blob `6aa22b6b07807a4f9fd3fca3a16da10fe7519c05`; SHA256 integral `554f811655d221d7c8e7e7348c37d437cff9c498046bafd8deebdd257dd52ef5`. Bytes fonte 22771; recorte [1815, 4767); SHA256 trecho `aeba29b6202176cc2ad6901412c5dd845df20f18054cd2a171d94c8af1988595`.

`````text
async function control(files: Record<string, string>, env: Record<string, string | undefined>, args: string[] = []) {
  const dir = await mkdtemp(path.join(tmpdir(), "omni-control-"))
  try {
    await Bun.write(path.join(dir, "bunfig.toml"),
      `[test]\npreload = [${JSON.stringify(path.join(root, "script/test-omni-control.ts"))}]\n`)
    await Promise.all(Object.entries(files).map(([name, body]) => Bun.write(path.join(dir, name), body)))
    // This run's own preload marked it as the outermost run; the child must be an outermost run of its own.
    const childEnv: Record<string, string | undefined> = { ...process.env, ORCHESTRA_OMNI_CONTROL_RUN: undefined,
      ORCHESTRA_OMNI_CONTROL: undefined, ORCHESTRA_OMNI_CONTROL_NONCE: undefined, ORCHESTRA_EXPERIMENTAL_OMNI_SPAWNER: "1", ...env }
    const result = Bun.spawnSync([process.execPath, "test", ...Object.keys(files).map((file) => `./${file}`), ...args], {
      cwd: dir, env: Object.fromEntries(Object.entries(childEnv).filter((entry): entry is [string, string] => entry[1] !== undefined)),
    })
    return { code: result.exitCode, output: `${result.stdout.toString()}\n${result.stderr.toString()}` }
  } finally {
    await rm(dir, { recursive: true, force: true })
  }
}

const declared = { ORCHESTRA_OMNI_CONTROL: "declared" }

test("declared: a run in which no declaring test ran and nothing spawned is not applicable and passes", async () => {
  const run = await control({ "plain.test.ts": plain }, declared)
  expect(run.output).toContain("omni positive control: not applicable (focused: no declaring test ran)")
  expect(run.code).toBe(0)
}, 60_000)

test("declared: a declaring test that made no omni spawn fails the run and names its file", async () => {
  const run = await control({ "silent.test.ts": silent, "plain.test.ts": plain }, declared)
  // The path is relative to the run's cwd; Windows may spell the temp directory in its short 8.3 form.
  expect(run.output).toMatch(/omni positive control: FAIL \(declared: 1 test\(s\) in [^)]*silent\.test\.ts\)\. [^\n]*silent\.test\.ts: 1 of 1 declaring test\(s\) made no omni spawn of their own/)
  expect(run.code).not.toBe(0)
}, 60_000)

test("declared: another file's spawn does not satisfy a declaring test that made none", async () => {
  // Named files run in the given order: the other file's spawn is counted before the declaring test starts.
  const run = await control({ "other.test.ts": other, "silent.test.ts": silent }, declared)
  expect(run.output).toMatch(/silent\.test\.ts: 1 of 1 declaring test\(s\) made no omni spawn of their own/)
  expect(run.code).not.toBe(0)
}, 60_000)

test("declared: a declaring test that spawned passes", async () => {
  const run = await control({ "spawning.test.ts": spawning }, declared)
  expect(run.output).toMatch(/omni positive control: pass \(declared: 1 test\(s\) in [^)]*spawning\.test\.ts\); 1 omni spawn\(s\), 0 delegated\./)
  expect(run.code).toBe(0)
}, 60_000)
`````

### PKG-SKILLS-1 — `packages/core/test/fixture/packaged-skills.ts` 30–82

Commit `1cde2ff7a71bcf7aecb5d030917b577165135d38`; blob `e69c2361d0a4dec7e900e48ed8e5eeadb75aea1f`; SHA256 integral `3ee1d07bc4a68bcf9c0591def412f90904c8c0fb25216c07c9610c2a7b3177a3`. Bytes fonte 4720; recorte [979, 3613); SHA256 trecho `8a0b5ebefd3d6f05efa1e03f110c3d819272c0e24f338b5ac8d1c3c22751ffa1`.

`````text
export async function bundle(entry: string, payload: unknown, outfile: string) {
  const packaged = path.resolve(import.meta.dirname, "../../src/packaged-skills.ts")
  const result = await Bun.build({
    entrypoints: [entry],
    target: "bun",
    format: "esm",
    minify: true,
    define: { ORCHESTRA_PACKAGED_SKILLS: JSON.stringify(payload) },
    plugins: [{
      name: "preserve-real-service-identities",
      setup(build) {
        // Bun can retain the original external specifier despite onResolve returning an absolute path.
        // Rewrite only AST module specifiers, sharing the host's real modules without copying implementations.
        build.onLoad({ filter: /\.ts$/ }, async (args) => {
          if (args.path !== entry && args.path !== packaged) return
          const text = await Bun.file(args.path).text()
          const source = ts.createSourceFile(args.path, text, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS)
          const edits = source.statements.flatMap((statement) => {
            if (!ts.isImportDeclaration(statement) && !ts.isExportDeclaration(statement)) return []
            const specifier = statement.moduleSpecifier
            if (!specifier || !ts.isStringLiteral(specifier) || isBuiltin(specifier.text)) return []
            const resolved = Bun.resolveSync(specifier.text, path.dirname(args.path))
            // Keep entry/self namespace exports and packaged-skills inside this build's define boundary.
            if (resolved === entry || resolved === packaged) return []
            return [{
              start: specifier.getStart(source),
              end: specifier.getEnd(),
              value: JSON.stringify(pathToFileURL(resolved).href),
            }]
          })
          return {
            contents: edits.toReversed().reduce(
              (contents, edit) => contents.slice(0, edit.start) + edit.value + contents.slice(edit.end),
              text,
            ),
            loader: "ts",
          }
        })
        build.onResolve({ filter: /.*/ }, (args) => {
          if (args.path === entry) return
          if (isBuiltin(args.path) || args.path.startsWith("file:")) return { path: args.path, external: true }
          const resolved = Bun.resolveSync(args.path, args.resolveDir)
          if (resolved === entry || resolved === packaged) return { path: resolved }
          throw new Error(`External module specifier was not rewritten: ${args.path}`)
        })
      },
    }],
  })
  expect(result.success, JSON.stringify(result.logs)).toBe(true)
  expect(result.outputs).toHaveLength(1)
  await Bun.write(outfile, result.outputs[0])
}

`````

### PKG-SDK-1 — `packages/core/test/fixture/sdk-registry.ts` 1–75

Commit `1cde2ff7a71bcf7aecb5d030917b577165135d38`; blob `da67e07241321d2eed35dfd3786b17939cf21802`; SHA256 integral `3bbbc19a42bf97a83e39e19243f435ea1665c94f1a01b495508c5b0510ea7b40`. Bytes fonte 3421; recorte [0, 3421); SHA256 trecho `3bbbc19a42bf97a83e39e19243f435ea1665c94f1a01b495508c5b0510ea7b40`.

`````text
import path from "node:path"
import { mkdir, readFile } from "node:fs/promises"
import { createHash } from "node:crypto"
import sdk from "../../../plugin/package.json"

export const planted = 'throw new Error("planted SDK copy ran"); export const tool = () => {}; export const marker = true\n'

// Real HTTP packuments and npm tarballs, consumed by the installed Arborist/pacote.
export async function registry(root: string) {
  const packages = new Map<string, { manifest: Record<string, unknown>; bytes: Buffer }>()
  const hits: string[] = []
  const held = new Map<string, { entered: () => void; wait: Promise<void> }>()
  const server = Bun.serve({
    hostname: "127.0.0.1",
    port: 0,
    async fetch(request) {
      const name = decodeURIComponent(new URL(request.url).pathname.slice(1))
      hits.push(name)
      const gate = held.get(name)
      if (gate) {
        gate.entered()
        await gate.wait
      }
      const archive = name.startsWith("tarballs/")
      const item = packages.get(archive ? name.slice("tarballs/".length, -4) : name)
      if (!item) return new Response("fixture package missing", { status: 404 })
      if (archive) return new Response(Uint8Array.from(item.bytes))
      return Response.json({
        name,
        "dist-tags": { latest: item.manifest.version },
        versions: { [String(item.manifest.version)]: item.manifest },
      })
    },
  })
  const url = `http://127.0.0.1:${server.port}`
  return {
    url,
    hits,
    hold(name: string) {
      const entered = Promise.withResolvers<void>()
      const released = Promise.withResolvers<void>()
      held.set(name, { entered: () => entered.resolve(), wait: released.promise })
      return { entered: entered.promise, release: () => { held.delete(name); released.resolve() } }
    },
    async publish(name: string, manifest: Record<string, unknown> = {}, files: Record<string, string> = {}) {
      const directory = path.join(root, "archives", name)
      await mkdir(path.join(directory, "package"), { recursive: true })
      const pkg = { name, version: sdk.version, type: "module", main: "index.js", ...manifest }
      await Promise.all(Object.entries({ "package.json": JSON.stringify(pkg), "index.js": "export const ordinary = 42\n", ...files })
        .map(([file, body]) => Bun.write(path.join(directory, "package", file), body)))
      const tar = Bun.spawnSync(["tar", "-czf", "package.tgz", "package"], { cwd: directory })
      if (tar.exitCode !== 0) throw new Error(`fixture tar failed: ${tar.stderr.toString()}`)
      const bytes = await readFile(path.join(directory, "package.tgz"))
      packages.set(name, {
        bytes,
        manifest: { ...pkg, dist: {
          tarball: `${url}/tarballs/${encodeURIComponent(name)}.tgz`,
          integrity: `sha512-${createHash("sha512").update(bytes).digest("base64")}`,
        } },
      })
    },
    async config(directory: string) {
      await Bun.write(path.join(directory, "empty.npmrc"), "")
      await Bun.write(path.join(directory, ".npmrc"), [
        `registry=${url}/`, `@orchestra:registry=${url}/`,
        `cache=${path.join(root, "npm-cache").replaceAll("\\", "/")}`,
        `userconfig=${path.join(directory, "empty.npmrc").replaceAll("\\", "/")}`,
        "audit=false", "fund=false", "fetch-retries=0",
      ].join("\n"))
    },
    async [Symbol.asyncDispose]() { await server.stop(true) },
  }
}

export { sdk }
`````

### PKG-RG-1 — `packages/core/test/fixture/ripgrep-release.ts` 14–36

Commit `1cde2ff7a71bcf7aecb5d030917b577165135d38`; blob `4dca048a5b4e9e9b61e44d5d04580520f771b3bc`; SHA256 integral `49f09f732139b41ff81105da76dcee4bac4bdb3fcc7fa78a163dd489fc387f3f`. Bytes fonte 4415; recorte [591, 1706); SHA256 trecho `5391a40015d5bf5a9610f947e55aa88956af6c6c44c195508d130c0651c4a0ac`.

`````text
/** A gate a test opens when it chooses, so ordering never depends on how long something takes. */
export const gate = () => {
  const state: { open?: () => void } = {}
  const promise = new Promise<void>((resolve) => (state.open = resolve))
  return { promise, open: () => state.open?.() }
}

/** Waits, in real time and whatever clock the test runs on, until `ready` holds. */
export const until = (ready: () => boolean) =>
  Effect.promise(async () => {
    for (let tries = 0; tries < 2_000 && !ready(); tries++) await Bun.sleep(5)
    if (!ready()) throw new Error("condition never held")
  })

/** A release server whose handler sees the 1-based request number; `requests` counts every request it got. */
export const serve = (handler: (request: number) => Response | Promise<Response>) =>
  Effect.acquireRelease(
    Effect.sync(() => {
      const counter = { requests: 0 }
      const server = Bun.serve({ port: 0, fetch: () => handler(++counter.requests) })
      return { counter, server, url: new URL("/archive", server.url).href }
    }),
    (input) => Effect.promise(() => input.server.stop(true)),
`````

### PKG-RG-2 — `packages/core/test/fixture/ripgrep-release.ts` 42–95

Commit `1cde2ff7a71bcf7aecb5d030917b577165135d38`; blob `4dca048a5b4e9e9b61e44d5d04580520f771b3bc`; SHA256 integral `49f09f732139b41ff81105da76dcee4bac4bdb3fcc7fa78a163dd489fc387f3f`. Bytes fonte 4415; recorte [1852, 4061); SHA256 trecho `ba41f60739a6febe8bb391eb7a4812b094c3881b612025939208eaa3502cb2a6`.

`````text
).pipe(Effect.map((tmp) => tmp.path))

/**
 * A real archive in this platform's release format holding ROOT/rg (rg.exe on Windows): by default a copy of the
 * real `rg` on PATH, which CI provisions, so the installed copy passes the `rg --version` check.
 */
export const archive = Effect.fnUntraced(function* (dir: string, content?: string) {
  const source = path.join(dir, "source")
  yield* Effect.promise(() => fs.mkdir(path.join(source, ROOT), { recursive: true }))
  const real = Bun.which(executable)
  if (content === undefined && !real) throw new Error(`these tests copy the ${executable} on PATH, and there is none`)
  const bytes = content === undefined ? yield* Effect.promise(() => Bun.file(real!).bytes()) : Buffer.from(content)
  yield* Effect.promise(() => fs.writeFile(path.join(source, ROOT, executable), bytes))
  const extension = process.platform === "win32" ? ("zip" as const) : ("tar.gz" as const)
  const file = path.join(dir, `archive.${extension}`)
  // Windows releases are zips, which the System32 bsdtar writes from the name; elsewhere a gzipped tarball.
  yield* Effect.promise(() =>
    process.platform === "win32"
      ? Bun.$`${path.join(process.env.SystemRoot ?? "C:\\Windows", "System32", "tar.exe")} -a -cf ${file} ${ROOT}`
          .cwd(source)
          .quiet()
      : Bun.$`tar -czf ${file} ${ROOT}`.cwd(source).quiet(),
  )
  const archived = yield* Effect.promise(() => Bun.file(file).bytes())
  return {
    bytes: archived,
    executable: bytes,
    release: (url: string) => ({
      url,
      extension,
      root: ROOT,
      sha256: createHash("sha256").update(archived).digest("hex"),
    }),
  }
})

export const placeholder = (url: string): RipgrepBinary.Release => ({
  url,
  sha256: "0".repeat(64),
  extension: "tar.gz",
  root: ROOT,
})

export const options = (directory: string, release: RipgrepBinary.Release): Partial<RipgrepBinary.Options> => ({
  system: () => undefined,
  directory,
  release,
  // CI sets ORCHESTRA_DISABLE_RIPGREP_DOWNLOAD; these tests download only from their local server.
  download: true,
  connectTimeout: "2 seconds",
  attemptTimeout: "10 seconds",
  attempts: 3,
  retryDelay: "10 millis",
  wait: "1 minute",
`````

### UP-PROOF-1 — `packages/core/test/fixture/upstream-arsenal-proof.ts` 5–73

Commit `1cde2ff7a71bcf7aecb5d030917b577165135d38`; blob `71fe273472282ecb9837d848dbdd8ebdceca5811`; SHA256 integral `d729374b9d708bef0d3855fc3052dc5b3b3c865e2ef497d8dabd03103086ca1d`. Bytes fonte 2657; recorte [98, 2657); SHA256 trecho `1e550cee5cdf7b48441cd34891532c68e56b36d52bc6652fb739aa113e41af68`.

`````text
export async function upstreamDriftProof(mode: "missing" | "nonpure", boundary: "catalog" | "describe" | "execute") {
  const root = path.resolve(import.meta.dirname, "../..")
  const originals = await Promise.all(
    [
      path.join(root, "src/tool/maestro-arsenal.ts"),
      path.join(root, "src/tool/upstream-arsenal.ts"),
      path.resolve(root, "../../modules/maestro/arsenal/src/registry.ts"),
    ].map(async (file) => ({ file, bytes: await Bun.file(file).text() })),
  )
  // Package-local artifacts preserve dependency resolution on isolated Linux and hoisted Windows installs.
  await using artifacts = {
    path: await fs.mkdtemp(path.join(root, ".upstream-arsenal-proof-")),
    async [Symbol.asyncDispose]() {
      await fs.rm(this.path, { recursive: true, force: true, maxRetries: 30, retryDelay: 100 })
    },
  }
  const snapshot = path.join(artifacts.path, "package")
  const marker = path.join(artifacts.path, "operation-entered")
  const config = path.join(artifacts.path, "bunfig.toml")
  await Bun.write(
    config,
    "[test]\npreload = " +
      JSON.stringify([
        path.resolve(root, "../../script/test-guard.ts"),
        path.join(root, "test/fixture/upstream-arsenal-registry.ts"),
        path.join(root, "test/preload.ts"),
      ]) +
      "\n",
  )
  const child = Bun.spawn(
    [
      process.execPath,
      "test",
      `--config=${config}`,
      "./test/fixture/upstream-arsenal-runtime.ts",
      "--timeout",
      "60000",
    ],
    {
      cwd: root,
      stdout: "pipe",
      stderr: "pipe",
      timeout: 90000,
      env: {
        ...process.env,
        ORCHESTRA_UPSTREAM_SNAPSHOT: snapshot,
        ORCHESTRA_UPSTREAM_OPERATION_MARKER: marker,
        ORCHESTRA_UPSTREAM_DRIFT: mode,
        ORCHESTRA_UPSTREAM_BOUNDARY: boundary,
      },
    },
  )
  const [stdout, stderr, exit] = await Promise.all([
    new Response(child.stdout).text(),
    new Response(child.stderr).text(),
    child.exited,
  ])
  const diagnostics = `actual ${boundary} / ${mode} registry drift\n${stdout}\n${stderr}`
  expect(child.signalCode, diagnostics).toBeNull()
  expect(exit, diagnostics).toBe(0)
  expect(stderr, diagnostics).toMatch(/\b1 pass\b/)
  expect(stderr, diagnostics).not.toMatch(/\b[1-9]\d* skip\b/)
  expect(stdout, diagnostics).toContain(
    JSON.stringify({
      upstreamDrift: { mode, boundary, realBackendControl: true, backendEnteredAfterDenial: false },
    }),
  )
  for (const original of originals) expect(await Bun.file(original.file).text(), original.file).toBe(original.bytes)
}
`````

### UP-REGISTRY-1 — `packages/core/test/fixture/upstream-arsenal-registry.ts` 7–49

Commit `1cde2ff7a71bcf7aecb5d030917b577165135d38`; blob `b8929709e7823441736293b52685a3306ffe93b1`; SHA256 integral `2d5ed9f7379415020521ff6e4327d2cb26d4556aec7fcb3e7352552f906f1c9c`. Bytes fonte 2475; recorte [260, 2475); SHA256 trecho `ecab5ef3e6cf73c5e1f1d0fcc6d08a297528947a2e66f5bc13ecacd0266b57b3`.

`````text
const snapshot = process.env.ORCHESTRA_UPSTREAM_SNAPSHOT
const marker = process.env.ORCHESTRA_UPSTREAM_OPERATION_MARKER
const mode = process.env.ORCHESTRA_UPSTREAM_DRIFT
if (!snapshot || !marker) throw new Error("UPSTREAM_DRIFT_FIXTURE_PLACEMENT_MISSING")
if (mode !== "missing" && mode !== "nonpure") throw new Error("UPSTREAM_DRIFT_FIXTURE_MODE_INVALID")

const source = path.resolve(import.meta.dirname, "../../../../modules/maestro/arsenal/src")
await fs.cp(source, path.join(snapshot, "src"), { recursive: true })
const file = path.join(snapshot, "src/registry.ts")
const original = await Bun.file(file).text()
const newline = original.includes("\r\n") ? "\r\n" : "\n"
const targets = original.split(newline).filter((line) => line.startsWith('  ["conflict-map",'))
if (targets.length !== 1 || !targets[0].endsWith(", []],"))
  throw new Error("UPSTREAM_DRIFT_FIXTURE_DESCRIPTOR_TARGET_MISSING_OR_DUPLICATED")
const target = targets[0] + newline
if (original.split(target).length !== 2)
  throw new Error("UPSTREAM_DRIFT_FIXTURE_DESCRIPTOR_TARGET_MISSING_OR_DUPLICATED")
const changed = original.replace(
  target,
  mode === "missing" ? "" : targets[0].replace(/, \[\]\],$/, ', ["read"]],') + newline,
)
const entry =
  "export async function execute(name: string, args: unknown, context?: ArsenalContext): Promise<ToolTextResult> {"
if (changed.split(entry).length !== 2) throw new Error("UPSTREAM_DRIFT_FIXTURE_EXECUTE_TARGET_MISSING_OR_DUPLICATED")
// This observes entry into the real backend, before its validation or handler dispatch.
await Bun.write(
  file,
  changed.replace(entry, `${entry}${newline}  await Bun.write(${JSON.stringify(marker)}, "entered")`),
)
if ((await Bun.file(path.join(source, "registry.ts")).text()) !== original)
  throw new Error("UPSTREAM_DRIFT_FIXTURE_LIVE_SOURCE_CHANGED")

const registry = await Bun.file(file).text()
plugin({
  name: "upstream-arsenal-package-source-snapshot",
  setup(build) {
    // Load copied, narrowly changed bytes at the actual package registry path; all other modules stay real.
    build.onLoad({ filter: /[\\/]modules[\\/]maestro[\\/]arsenal[\\/]src[\\/]registry\.ts$/ }, () => ({
      loader: "ts",
      contents: registry,
    }))
  },
})
`````

### UP-RUNTIME-1 — `packages/core/test/fixture/upstream-arsenal-runtime.ts` 16–79

Commit `1cde2ff7a71bcf7aecb5d030917b577165135d38`; blob `6dd1d01ea7cfaea8304af6bd709b43110e18623b`; SHA256 integral `9a699ab41e52ca3a77856441621e663ac8fc57a679a3dabac4f8760a0f4211a1`. Bytes fonte 3542; recorte [797, 3542); SHA256 trecho `fd37fe2ab669242cbff747d57226908c7a7d3dacf18e04a10ebba383b43bca6c`.

`````text
test(`actual ${boundary} rejects ${mode} registry drift before backend entry`, async () => {
  const context = { sessionID: "ses_upstream_drift", agent: "archie" }
  const host = {
    directory,
    stateDirectory: directory,
    projectID: "upstream-drift",
    nativeMaestro: true,
    nativeUpstream: true,
    ask: () => Effect.void,
    authorize: () => Effect.void,
    outputBudget: () => Effect.succeed({ maxLines: 2000, maxBytes: 50 * 1024 }),
  }
  const handlers = MaestroArsenal.makeHandlers(() => Effect.succeed(host))
  const descriptors = await Arsenal.list()
  expect(descriptors.filter((item) => item.name === "conflict-map")).toHaveLength(mode === "missing" ? 0 : 1)
  if (mode === "nonpure") expect(await Arsenal.describe("conflict-map")).toMatchObject({ effects: ["read"] })
  if (mode === "missing") await expect(Arsenal.describe("conflict-map")).rejects.toThrow("unknown tool: conflict-map")

  // Positive control uses the actual handlers and registry entry instrumented by the source snapshot.
  await Effect.runPromise(handlers.describe({ name: "sliceability" }, context))
  const control = await Effect.runPromise(
    handlers.execute(
      {
        name: "sliceability",
        arguments: { symbols: ["only"], edges: [], k: 1 },
      },
      context,
    ),
  )
  const result = Schema.decodeUnknownSync(
    Schema.fromJsonString(
      Schema.Struct({
        content: Schema.Array(Schema.Struct({ text: Schema.String })),
      }),
    ),
  )(control)
  expect(Schema.decodeUnknownSync(Schema.UnknownFromJsonString)(result.content[0].text)).toMatchObject({
    verdict: "SLICEABLE",
  })
  expect(await Bun.file(marker).text()).toBe("entered")
  await fs.unlink(marker)

  // An exact receipt for the drifted descriptor must not bypass current upstream purity checks.
  if (mode === "nonpure" && boundary === "execute")
    await Effect.runPromise(handlers.describe({ name: "conflict-map" }, context))
  host.nativeMaestro = false
  const response = await Effect.runPromise(
    (boundary === "catalog"
      ? handlers.catalog({ group: "pure", offset: 10, limit: 1 }, context)
      : boundary === "describe"
        ? handlers.describe({ name: "conflict-map" }, context)
        : handlers.execute({ name: "conflict-map", arguments: { wps: [{ id: "only" }] } }, context)
    ).pipe(Effect.result),
  )
  const entered = await Bun.file(marker).exists()
  console.log(
    JSON.stringify({ upstreamDrift: { mode, boundary, realBackendControl: true, backendEnteredAfterDenial: entered } }),
  )
  expect(response).toMatchObject({
    _tag: "Failure",
    failure: { message: `UPSTREAM_AUTHORING_DESCRIPTOR_${mode === "missing" ? "MISSING" : "NOT_PURE"}: conflict-map` },
  })
  expect(entered).toBe(false)
})
`````

### UP-PACKAGE-1 — `packages/core/test/maestro-arsenal-package.test.ts` 1–15

Commit `1cde2ff7a71bcf7aecb5d030917b577165135d38`; blob `5bf1d485083c3f565d5bb68a5c96f2541a88cd58`; SHA256 integral `dffb0186308dcae05d6e13405a55ed662b0ef0b74c252411f81cf1f063ee88e3`. Bytes fonte 8412; recorte [0, 773); SHA256 trecho `6a366082d7f56d8fdda6119223ef1c7a0a8756d60dc14119ed59a25597323b17`.

`````text
// Requires the actual assembled @orchestra/maestro-arsenal package. Never mock its validator/handlers.
import { expect } from "bun:test"
import { Effect, Schema } from "effect"
import { realpath } from "node:fs/promises"
import { FSUtil } from "@orchestra/core/fs-util"
import { Global } from "@orchestra/core/global"
import { Location } from "@orchestra/core/location"
import { MaestroArsenal } from "@orchestra/core/tool/maestro-arsenal"
import { ToolRegistry } from "@orchestra/core/tool/registry"
import { testEffect } from "./lib/effect"
import { executeTool, settleTool, toolIdentity } from "./lib/tool"
import { hostLayer, maestro, sessionID, setup } from "./maestro-arsenal.test"

const it = testEffect(hostLayer)
const call = (name: string, input: unknown) => ({
`````

### UP-PACKAGE-2 — `packages/core/test/maestro-arsenal-package.test.ts` 95–117

Commit `1cde2ff7a71bcf7aecb5d030917b577165135d38`; blob `5bf1d485083c3f565d5bb68a5c96f2541a88cd58`; SHA256 integral `dffb0186308dcae05d6e13405a55ed662b0ef0b74c252411f81cf1f063ee88e3`. Bytes fonte 8412; recorte [4827, 6120); SHA256 trecho `5e71515ba71fb24dd624894e78cd44ac4f110f93dd77d92dd1da34ee887aaa0c`.

`````text
    })
    const registry = yield* ToolRegistry.Service
    const filesystem = yield* FSUtil.Service
    const location = yield* Location.Service
    const global = yield* Global.Service
    const directory = MaestroArsenal.stateDirectory(global.data, location.project.id)
    const description = yield* settleTool(registry, call(MaestroArsenal.names.describe, { name: "profile" }))
    expect(description.output?.structured).toBeString()
    expect(yield* filesystem.readDirectory(directory)).toEqual([])
    const input = { name: "profile", arguments: { action: "set", patch: { scrutiny: "strict" } } }
    expect(yield* executeTool(registry, call(MaestroArsenal.names.execute, input))).toMatchObject({ type: "error" })
    expect(yield* filesystem.readDirectory(directory)).toEqual([])
    yield* agents.transform((editor) =>
      editor.update(maestro, (agent) => {
        agent.permissions = [{ action: "*", resource: "*", effect: "allow" }]
      }),
    )
    expect(yield* executeTool(registry, call(MaestroArsenal.names.execute, input))).toMatchObject({ type: "text" })
    expect((yield* filesystem.readDirectory(directory)).length).toBeGreaterThan(0)
  }),
)

it.live("Arsenal package conformance: a handler refusal returns its static code, not an opaque execution_failed", () =>
`````

### UP-HOST-1 — `packages/core/test/maestro-arsenal.test.ts` 36–71

Commit `1cde2ff7a71bcf7aecb5d030917b577165135d38`; blob `611d531dcf64de3bbb4dcdcd1e52ee71a183bc0f`; SHA256 integral `cfa36ea94fce99435a30f2343bf7ebbf5849966b7ea2c159e58f59a147123512`. Bytes fonte 16594; recorte [1716, 2750); SHA256 trecho `be3693114240786a699d6208e8590ec05e97046b92bff0a356d4da60d90ad9e2`.

`````text
export const hostLayer = AppNodeBuilder.build(
  LayerNode.group([
    FSUtil.node,
    Global.node,
    Location.node,
    Database.node,
    EventV2.node,
    AgentV2.node,
    SessionStore.node,
    PermissionSaved.node,
    PermissionV2.node,
    ToolRegistry.node,
    ToolRegistry.toolsNode,
    ToolOutputStore.node,
    LocationMutation.node,
  ]),
  [
    [Location.node, tempLocationLayer],
    [Global.node, data],
    [ToolOutputStore.node, ToolOutputStore.nodeWithoutConfig],
  ],
)

export const sessionID = SessionV2.ID.make("ses_arsenal_native")
export const maestro = AgentV2.ID.make("maestro")
export const setup = Effect.fn("ArsenalTest.setup")(function* (rules: PermissionV2.Ruleset) {
  const database = yield* Database.Service
  const location = yield* Location.Service
  yield* database.db
    .insert(ProjectTable)
    .values({ id: location.project.id, worktree: location.directory, sandboxes: [] })
    .onConflictDoNothing()
    .run()
    .pipe(Effect.orDie)
  yield* database.db
    .insert(SessionTable)
`````

### UP-HOST-2 — `packages/core/test/maestro-arsenal.test.ts` 96–148

Commit `1cde2ff7a71bcf7aecb5d030917b577165135d38`; blob `611d531dcf64de3bbb4dcdcd1e52ee71a183bc0f`; SHA256 integral `cfa36ea94fce99435a30f2343bf7ebbf5849966b7ea2c159e58f59a147123512`. Bytes fonte 16594; recorte [3293, 5951); SHA256 trecho `0140722983c96f9a7ebc09a01d1965d4364501aee81c30ed12e51e69f376e0cd`.

`````text
  it.live("registers canonical tools within the real Tools scope and rejects non-Maestro invocations", () =>
    Effect.gen(function* () {
      const agents = yield* setup([{ action: "*", resource: "*", effect: "allow" }])
      const registry = yield* ToolRegistry.Service
      const scope = yield* Scope.make()
      yield* MaestroArsenal.registerScoped({
        nativeMaestro: (id) => agents.get(id).pipe(Effect.map((agent) => agent?.id === maestro)),
      }).pipe(Scope.provide(scope))
      expect((yield* toolDefinitions(registry)).map((definition) => definition.name).sort()).toEqual(
        Object.values(MaestroArsenal.names).sort(),
      )
      expect(
        yield* executeTool(registry, {
          sessionID,
          ...toolIdentity,
          call: { type: "tool-call", id: "identity", name: MaestroArsenal.names.catalog, input: {} },
        }),
      ).toEqual({ type: "error", value: "Maestro Arsenal requires native Maestro identity." })
      yield* Scope.close(scope, Exit.void)
      expect(yield* toolDefinitions(registry)).toEqual([])
      expect(
        yield* executeTool(registry, {
          sessionID,
          ...toolIdentity,
          call: { type: "tool-call", id: "closed", name: MaestroArsenal.names.catalog, input: {} },
        }),
      ).toEqual({ type: "error", value: `Unknown tool: ${MaestroArsenal.names.catalog}` })
    }),
  )

  it.live("an upstream host flag cannot authorize the old upstream ID at any authoring boundary", () =>
    Effect.gen(function* () {
      const location = yield* Location.Service
      const global = yield* Global.Service
      const handlers = MaestroArsenal.makeHandlers(() => Effect.succeed({
        directory: location.directory,
        stateDirectory: MaestroArsenal.stateDirectory(global.data, location.project.id),
        projectID: location.project.id,
        nativeMaestro: false,
        nativeUpstream: true,
        ask: () => Effect.fail(new Tool.Failure({ message: "Unexpected permission request." })),
        authorize: () => Effect.fail(new Tool.Failure({ message: "Unexpected effect request." })),
        outputBudget: () => Effect.succeed({ maxLines: 1000, maxBytes: 32 * 1024 }),
      }))
      const context = { sessionID, agent: AgentV2.ID.make("walt") }
      yield* Effect.forEach([
        handlers.catalog({}, context),
        handlers.describe({ name: "conflict-map" }, context),
        handlers.execute({ name: "conflict-map", arguments: {} }, context),
      ], (effect) => Effect.gen(function* () {
        expect((yield* effect.pipe(Effect.flip)).message).toBe("Maestro Arsenal requires native Maestro identity.")
      }))
    }),
`````

### UP-OPS-1 — `packages/core/test/upstream-arsenal.test.ts` 89–120

Commit `1cde2ff7a71bcf7aecb5d030917b577165135d38`; blob `917bbd9fdfbda0fd15b66d6e7662b114871c2f06`; SHA256 integral `2612d4ab63959417a3a505d2123dc557d7f6ddcc9bdd5c8f506eef6a8e4a106f`. Bytes fonte 22842; recorte [3330, 4844); SHA256 trecho `ffcee2778fa99310f3d62997bc630d4c775aded7f2458c6657893d01dcd50bdf`.

`````text
describe("Upstream Arsenal authoring access", () => {
  it.live("exports exactly the frozen authoring IDs, all present and pure in the actual Arsenal registry", () =>
    Effect.gen(function* () {
      const { Arsenal } = yield* Effect.promise(() => import("@orchestra/maestro-arsenal"))
      expect(UPSTREAM_AUTHORING_OPERATIONS).toEqual([
        "anchor-gen",
        "conflict-map",
        "context-packer",
        "contract-freezer",
        "enrich-plan",
        "plan-check",
        "plan-compiler",
        "plan-to-briefs",
        "plan-to-dag",
        "plan-to-gates",
        "plan-to-policy",
        "seam-checker",
        "sliceability",
      ])
      expect(Object.isFrozen(UPSTREAM_AUTHORING_OPERATIONS)).toBe(true)
      expect(MaestroArsenal.UPSTREAM_AUTHORING_OPERATIONS).toBe(UPSTREAM_AUTHORING_OPERATIONS)
      const descriptors = yield* Effect.promise(() => Arsenal.list())
      const selected = yield* Effect.fromResult(UpstreamArsenal.catalog(descriptors))
      expect(selected.map((item) => item.name)).toEqual([...UPSTREAM_AUTHORING_OPERATIONS])
      yield* Effect.forEach(selected, (item) =>
        Effect.gen(function* () {
          expect(item).toEqual(yield* Effect.promise(() => Arsenal.describe(item.name)))
          expect(item.effects).toEqual([])
        }),
      )
      // Positive controls: the real registry has excluded pure and effectful capabilities.
      expect(yield* Effect.promise(() => Arsenal.describe("stub-gen"))).toMatchObject({ effects: [] })
`````

### UP-SETTLE-1 — `packages/core/test/upstream-settlement-preservation.test.ts` 165–215

Commit `1cde2ff7a71bcf7aecb5d030917b577165135d38`; blob `12fee3da08fdac660d5952099920599509a25ffc`; SHA256 integral `caaa5e5990d40c1964578ce79e5795d62bb87f20f177627c27aa24b10b505c41`. Bytes fonte 46125; recorte [10903, 14265); SHA256 trecho `baea2e4b98da217960e038c8ea5070af530da382ea361d1fbf5448b48dda2536`.

`````text
    expect(before.state.status).toBe("completed")
    const offered = { ...f.retainedMetadata, concurrent: "stale caller value", workResult: f.result }
    for (const metadata of [
      { ...offered, parentSessionId: "ses_forged" },
      { ...offered, sessionId: "ses_forged" },
      { ...offered, workResult: { ...f.result, taskId: "tsk_forged" } },
      { ...offered, workResult: { ...f.result, card: { messageID: "msg_missing" },
        author: { ...f.result.author, messageID: "msg_missing" } } },
      { ...offered, workResult: { ...f.result, card: { messageID: f.parentMessageID },
        author: { ...f.result.author, messageID: f.parentMessageID } } },
      { ...offered, workResult: { ...f.result, author: { ...f.result.author, memberId: "maestro" } } },
      { ...offered, workResult: { ...f.result, card: null } },
      { ...offered, workResult: { ...f.result, author: "caller-authored" } },
      { ...offered, workResult: { ...f.result, terminal: null } },
      { ...offered, workResult: { ...f.result, terminal: { reason: "ended" } } },
      { ...offered, upstreamSettlement: { forged: true } },
    ]) {
      yield* f.offer(metadata)
      expect(yield* f.read()).toEqual(before)
    }
    for (const hostDetail of ["", 0, false, null, {}, []]) {
      yield* f.offer({ ...offered, workResult: { ...f.result, terminal: { reason: "failed", hostDetail } } })
      expect(yield* f.read()).toEqual(before)
    }
    yield* f.offer(offered, { callID: "forged-call" })
    expect(yield* f.read()).toEqual(before)
    yield* f.offer(offered, {}, Location.Ref.make({ directory: AbsolutePath.make("/other-project") }))
    expect(yield* f.read()).toEqual(before)
    yield* f.database.db.update(SessionTable).set({ parent_id: null }).where(eq(SessionTable.id, f.childID)).run()
    yield* f.offer(offered)
    expect(yield* f.read()).toEqual(before)
    yield* f.database.db.update(SessionTable).set({ parent_id: f.parentID }).where(eq(SessionTable.id, f.childID)).run()
    const foreignProjectID = Project.ID.make(`foreign-observation-${view}`)
    yield* f.database.db.insert(ProjectTable).values({ id: foreignProjectID, worktree: AbsolutePath.make("/other-project"), sandboxes: [] }).run()
    for (const patch of [{ project_id: foreignProjectID }, { directory: "/other-project" }, { agent: "maestro" }]) {
      yield* f.database.db.update(SessionTable).set(patch).where(eq(SessionTable.id, f.childID)).run()
      yield* f.offer(offered)
      expect(yield* f.read()).toEqual(before)
      yield* f.database.db.update(SessionTable).set({ project_id: f.projectID, directory: "/project", agent: "archie" })
        .where(eq(SessionTable.id, f.childID)).run()
    }
    const reasonOnly = { ...f.result, terminal: { reason: "failed" } }
    yield* f.offer({ ...offered, workResult: reasonOnly })
    expect((yield* f.read()).state.structured.metadata).toMatchObject({ workResult: reasonOnly })
    yield* f.offer(offered)
    const observed = yield* f.read()
    expect(observed).toEqual({ ...before, state: { ...before.state,
      structured: { ...before.state.structured, metadata: { ...f.retainedMetadata, workResult: f.result } } } })
    expect(observed.state.status).toBe("completed")
    expect(observed.state.input).toEqual(f.selectedInput)
    expect(observed.state.structured.metadata).not.toHaveProperty("upstreamSettlement")
`````

### FX-RECORDING-1 — `packages/core/test/fixtures/recordings/session-runner/openai-chat-streams-text.json` 1–27

Commit `1cde2ff7a71bcf7aecb5d030917b577165135d38`; blob `bad659f93ef05ea94ce67036e5dd6944a2591d39`; SHA256 integral `3d19ba51f0855ca232aefd372c0c045ea6db01bbbb6474957700cd623f5011f8`. Bytes fonte 2872; recorte [0, 2872); SHA256 trecho `3d19ba51f0855ca232aefd372c0c045ea6db01bbbb6474957700cd623f5011f8`.

`````text
{
  "version": 1,
  "metadata": {
    "name": "session-runner/openai-chat-streams-text",
    "recordedAt": "2026-06-02T19:52:25.084Z"
  },
  "interactions": [
    {
      "transport": "http",
      "request": {
        "method": "POST",
        "url": "https://api.openai.com/v1/chat/completions",
        "headers": {
          "content-type": "application/json"
        },
        "body": "{\"model\":\"gpt-4o-mini\",\"messages\":[{\"role\":\"user\",\"content\":\"Say hello in one short sentence.\"}],\"stream\":true,\"stream_options\":{\"include_usage\":true},\"max_tokens\":20,\"temperature\":0}"
      },
      "response": {
        "status": 200,
        "headers": {
          "content-type": "text/event-stream; charset=utf-8"
        },
        "body": "data: {\"id\":\"chatcmpl-DmPRwO9SjY0GJZ3TFFe1Be72wysEG\",\"object\":\"chat.completion.chunk\",\"created\":1780429944,\"model\":\"gpt-4o-mini-2024-07-18\",\"service_tier\":\"default\",\"system_fingerprint\":\"fp_40bf7dabb5\",\"choices\":[{\"index\":0,\"delta\":{\"role\":\"assistant\",\"content\":\"\",\"refusal\":null},\"logprobs\":null,\"finish_reason\":null}],\"usage\":null,\"obfuscation\":\"f3yrdno80\"}\n\ndata: {\"id\":\"chatcmpl-DmPRwO9SjY0GJZ3TFFe1Be72wysEG\",\"object\":\"chat.completion.chunk\",\"created\":1780429944,\"model\":\"gpt-4o-mini-2024-07-18\",\"service_tier\":\"default\",\"system_fingerprint\":\"fp_40bf7dabb5\",\"choices\":[{\"index\":0,\"delta\":{\"content\":\"Hello\"},\"logprobs\":null,\"finish_reason\":null}],\"usage\":null,\"obfuscation\":\"fDsGzJ\"}\n\ndata: {\"id\":\"chatcmpl-DmPRwO9SjY0GJZ3TFFe1Be72wysEG\",\"object\":\"chat.completion.chunk\",\"created\":1780429944,\"model\":\"gpt-4o-mini-2024-07-18\",\"service_tier\":\"default\",\"system_fingerprint\":\"fp_40bf7dabb5\",\"choices\":[{\"index\":0,\"delta\":{\"content\":\"!\"},\"logprobs\":null,\"finish_reason\":null}],\"usage\":null,\"obfuscation\":\"RqaP5kpPNU\"}\n\ndata: {\"id\":\"chatcmpl-DmPRwO9SjY0GJZ3TFFe1Be72wysEG\",\"object\":\"chat.completion.chunk\",\"created\":1780429944,\"model\":\"gpt-4o-mini-2024-07-18\",\"service_tier\":\"default\",\"system_fingerprint\":\"fp_40bf7dabb5\",\"choices\":[{\"index\":0,\"delta\":{},\"logprobs\":null,\"finish_reason\":\"stop\"}],\"usage\":null,\"obfuscation\":\"B19l5\"}\n\ndata: {\"id\":\"chatcmpl-DmPRwO9SjY0GJZ3TFFe1Be72wysEG\",\"object\":\"chat.completion.chunk\",\"created\":1780429944,\"model\":\"gpt-4o-mini-2024-07-18\",\"service_tier\":\"default\",\"system_fingerprint\":\"fp_40bf7dabb5\",\"choices\":[],\"usage\":{\"prompt_tokens\":22,\"completion_tokens\":2,\"total_tokens\":24,\"prompt_tokens_details\":{\"cached_tokens\":0,\"audio_tokens\":0},\"completion_tokens_details\":{\"reasoning_tokens\":0,\"audio_tokens\":0,\"accepted_prediction_tokens\":0,\"rejected_prediction_tokens\":0}},\"obfuscation\":\"kbiJobM55YE\"}\n\ndata: [DONE]\n\n"
      }
    }
  ]
}
`````

## RE-SUP-05 — Processo e harness: mecanismos/precondições, não resultados executados

Este bloco atende também à lista de helpers de RE-SUP-04 de J2. SUP-F02 foi resolvido por qualificação: nenhuma promessa de exclusividade é inferida do contador. O comentário afterEach permanece intenção até prova de integração do runner; não foi necessário expandir o escopo a uma auditoria de runner.

### HAR-OPEN-1 — `packages/core/test/fixture/omni-expect.ts` 8–12

Commit `1cde2ff7a71bcf7aecb5d030917b577165135d38`; blob `067fbf7a21e008caacfab46a2eaeb878ac7bcaac`; SHA256 integral `33272d6488f070f4ca10fbaa5e9c113e4ed9eabd4c2d148dbd2321b6dc4d4ab9`. Bytes fonte 1376; recorte [639, 788); SHA256 trecho `b31bdad2216077fba14ad2c6a6397947eb09f240eede3415d95038f984847126`.

`````text
import { Omni } from "../../src/omni"

let open: { file: string; start: number } | undefined
const settled: { file: string; spawns: number }[] = []

`````

### HAR-IDENTITY-1 — `packages/core/test/fixture/omni-effect.ts` 1–3

Commit `1cde2ff7a71bcf7aecb5d030917b577165135d38`; blob `3d1b4f7b1e372d63d9b7d042a8063bba6233e2f3`; SHA256 integral `0147e533beb7950107884df539b6b4025449e5be6a64b6cb046df54ef402b4d7`. Bytes fonte 211; recorte [0, 211); SHA256 trecho `0147e533beb7950107884df539b6b4025449e5be6a64b6cb046df54ef402b4d7`.

`````text
// Resolve the campaign's Effect from its real Core caller in both isolated and hoisted dependency layouts.
export { Effect, ManagedRuntime } from "effect"
export { ChildProcess } from "effect/unstable/process"
`````

### PROC-NONCE-1 — `packages/core/test/fixture/process-tree.ts` 23–95

Commit `1cde2ff7a71bcf7aecb5d030917b577165135d38`; blob `5e4121f21d19e2eacf9441ca57288ad0fb9a125d`; SHA256 integral `0faac770f6bea7ac1e47d43b2b900eaa4d4f5e0effa209f3d0237d34ba2ac5e8`. Bytes fonte 14087; recorte [1480, 5110); SHA256 trecho `4e1fab07cbf63361abbbda6f088bc0f8159e3c1085166cc8a2647838d353ebce`.

`````text
function startTimes(pids, helper) {
  const cp = process.getBuiltinModule("node:child_process")
  const fs = process.getBuiltinModule("node:fs")
  const result = {}
  if (!pids.length) return result
  if (process.platform === "win32") {
    try {
      const settings = JSON.parse(fs.readFileSync(helper + '.config', 'utf8'))
      const out = cp.spawnSync(settings.node, ['--experimental-strip-types', helper, JSON.stringify(pids)],
        {encoding: 'utf8', windowsHide: true, timeout: 15000, killSignal: 'SIGKILL'})
      if (out.error || out.status !== 0 || !out.stdout?.trim()) throw Error(String(out.error ?? out.stderr ?? 'empty identity reply'))
      const births = JSON.parse(out.stdout)
      if (!births || typeof births !== 'object' || Array.isArray(births)) throw Error('malformed identity reply')
      for (const pid of pids) {
        if (births[pid] === undefined) continue // A successful complete inventory can prove the process exited.
        if (typeof births[pid] !== 'string' || !/^\\d+$/.test(births[pid])) throw Error('invalid creation time for PID ' + pid)
        result[pid] = births[pid]
      }
      return result
    } catch (error) { throw Error('fixture birth query failed: ' + String(error)) }
  }
  if (process.platform === "linux") {
    for (const pid of pids) {
      try {
        const stat = fs.readFileSync("/proc/" + pid + "/stat", "utf8")
        const birth = stat.slice(stat.lastIndexOf(")") + 2).split(" ")[19]
        if (!/^\\d+$/.test(birth ?? '')) throw Error('invalid procfs creation time for PID ' + pid)
        result[pid] = birth
      } catch (error) {
        if (error.code === 'ENOENT') continue
        throw Error('fixture birth query failed: ' + String(error))
      }
    }
    return result
  }
  const out = cp.spawnSync("ps", ["-o", "pid=,lstart=", "-p", pids.join(",")],
    { encoding: "utf8", timeout: 10000, killSignal: 'SIGKILL', env: { ...process.env, TZ: "UTC", LC_ALL: "C" } })
  // ps exits 1 without diagnostics when all requested PIDs have exited; every other failure is named.
  if (out.error || out.status !== 0 && !(out.status === 1 && !out.stderr?.trim()))
    throw Error('fixture birth query failed: ' + String(out.error ?? out.stderr))
  for (const line of (out.stdout || "").split("\\n")) {
    if (!line.trim()) continue
    const match = line.trim().match(/^(\\d+)\\s+(.+)$/)
    if (!match) throw Error('fixture birth query failed: malformed ps creation-time row ' + line)
    result[match[1]] = "UTC:" + match[2].trim()
  }
  return result
}
`

const BODY = `${START_TIMES}
const fs = process.getBuiltinModule("node:fs")
const path = process.getBuiltinModule("node:path")
const [nonce, depth, dir] = process.argv.slice(-3)
const file = path.join(dir, process.pid + ".json")
const startTime = startTimes([process.pid], path.join(dir, 'identity.mjs'))[process.pid]
if (typeof startTime !== 'string' || !startTime) throw Error('fixture birth identity missing creation time for PID ' + process.pid)
fs.writeFileSync(file + ".tmp", JSON.stringify({ pid: process.pid, nonce, startTime }))
fs.renameSync(file + ".tmp", file)
setInterval(() => {}, 1 << 30)
if (Number(depth) === 0) console.log("ready " + nonce)
else {
  const child = process.getBuiltinModule("node:child_process").spawn(
    process.execPath,
    ["-e", "const S = " + JSON.stringify(S) + "; eval(S)", nonce, String(Number(depth) - 1), dir],
    { stdio: ["ignore", "pipe", "inherit"], windowsHide: true },
  )
  child.stdout.pipe(process.stdout)
}
`

const startTimes = new Function("pids", "helper", `${START_TIMES}\nreturn startTimes(pids, helper)`) as (
  pids: number[],
`````

### PROC-NONCE-2 — `packages/core/test/fixture/process-tree.ts` 144–218

Commit `1cde2ff7a71bcf7aecb5d030917b577165135d38`; blob `5e4121f21d19e2eacf9441ca57288ad0fb9a125d`; SHA256 integral `0faac770f6bea7ac1e47d43b2b900eaa4d4f5e0effa209f3d0237d34ba2ac5e8`. Bytes fonte 14087; recorte [8715, 12152); SHA256 trecho `c9c1913e359daa67d3cfa27772e3a9950d14ce564e5daee7b36daa59cc7edf85`.

`````text
export function tree(depth = 2) {
  const nonce = `omni-tree-${randomUUID()}`
  const dir = path.join(os.tmpdir(), nonce)
  mkdirSync(dir)
  if (process.platform === "win32") {
    writeFileSync(path.join(dir, "identity.mjs"), WINDOWS_READER)
    writeFileSync(path.join(dir, "identity.mjs.config"), JSON.stringify({ node: WindowsProcessQuery.nodeExecutable(),
      decoder: new URL("../../../../native/omni/campaign/windows-inventory.ts", import.meta.url).href }))
  }
  return {
    nonce,
    size: depth + 1,
    ready: `ready ${nonce}`,
    command: process.execPath,
    args: ["-e", `const S = ${JSON.stringify(BODY)}; eval(S)`, nonce, String(depth), dir],
  }
}

function records(nonce: string): Entry[] {
  const dir = path.join(os.tmpdir(), nonce)
  return readdirSync(dir)
    .filter((file) => file.endsWith(".json"))
    .map((file) => {
      const record = JSON.parse(readFileSync(path.join(dir, file), "utf8")) as Entry
      if (record.nonce !== nonce || !Number.isSafeInteger(record.pid) || record.pid <= 0 ||
        typeof record.startTime !== "string" || !record.startTime)
        throw new Error(`fixture birth identity missing creation time or invalid record: ${path.join(dir, file)}: ${JSON.stringify(record)}`)
      return record
    })
}

function signalable(pid: number) {
  try {
    process.kill(pid, 0)
    return true
  } catch (error) {
    return (error as { code?: string }).code === "EPERM"
  }
}

/** How many processes retain their recorded identity: Windows uses complete CIM, Unix signal 0 plus birth query. */
export async function alive(nonce: string) {
  // Bun's Windows signal-0 result can miss a live child; the authoritative CIM snapshot decides there.
  const running = process.platform === "win32" ? records(nonce) : records(nonce).filter((record) => signalable(record.pid))
  if (running.length === 0) return 0
  const now = process.platform === "win32"
    ? JSON.parse(await windowsQuery(nonce, running.map((record) => record.pid))) as Record<string, string>
    : startTimes(running.map((record) => record.pid), path.join(os.tmpdir(), nonce, "identity.mjs"))
  return running.filter((record) => now[record.pid] === record.startTime).length
}

/** Polls alive() until it reaches 0 or the deadline passes; returns the last count. Bounds a death, never a latency. */
export async function gone(nonce: string, timeoutMs = 20_000) {
  const deadline = Date.now() + timeoutMs
  for (;;) {
    // alive() reading 0 is confirmed by the command-line sweep: under Bun on Windows signal 0 was seen to miss live
    // processes, and a missed process must never pass as gone.
    const recorded = await alive(nonce)
    const count = recorded === 0 ? (await sweep(nonce)).length : recorded
    if (count === 0 || Date.now() > deadline) return count
    await new Promise((resolve) => setTimeout(resolve, recorded === 0 ? 500 : 100))
  }
}

/** Kills whatever is left of the tree (test cleanup; never an assertion). */
export async function reap(nonce: string) {
  const now = process.platform === "win32"
    ? JSON.parse(await windowsQuery(nonce, records(nonce).map((record) => record.pid))) as Record<string, string>
    : startTimes(records(nonce).map((record) => record.pid), path.join(os.tmpdir(), nonce, "identity.mjs"))
  for (const record of records(nonce)) {
    if (now[record.pid] !== record.startTime) continue
    try {
      process.kill(record.pid, "SIGKILL")
    } catch {}
  }
`````

### PROC-WINDOWS-1 — `packages/core/test/fixture/windows-process-query.ts` 78–118

Commit `1cde2ff7a71bcf7aecb5d030917b577165135d38`; blob `f24e303349266553e9c3ba3c40f16ac7daab078a`; SHA256 integral `8293cc5be741860c8966a21da8418feb3beb96a24e334bf5d957c77c054a1b75`. Bytes fonte 17877; recorte [5898, 8469); SHA256 trecho `82b31a50ffff56008ca7e50d68c69aa4ba7743c32c672b3408860b24cd7dc927`.

`````text
/** Resolve a candidate without spawning; invoke must attest its runtime, not trust its filename. */
export function nodeExecutable(): string {
  const explicit = process.env.OMNI_CAMPAIGN_NODE
  if (explicit && !path.isAbsolute(explicit)) throw new Error("OMNI_CAMPAIGN_NODE must be an absolute native Node path")
  const native = !process.versions.bun && process.release.name === "node" && Boolean(process.versions.node)
  const search = Object.entries(process.env).find(([key]) => key.toLowerCase() === "path")?.[1] ?? ""
  const candidates = explicit ? [explicit] : native ? [process.execPath] : search.split(path.delimiter)
    .filter(Boolean).map((dir) => path.resolve(dir.replace(/^"|"$/g, ""), process.platform === "win32" ? "node.exe" : "node"))
  const bun = process.versions.bun ? realpathSync(process.execPath) : undefined
  const errors: unknown[] = []
  for (const candidate of candidates) {
    try {
      const resolved = realpathSync(candidate)
      if (resolved === bun || !statSync(resolved).isFile()) throw new Error("not a native Node executable")
      accessSync(resolved, constants.X_OK)
      return resolved
    } catch (error) { errors.push(error) }
  }
  throw new AggregateError(errors, "native Node executable unavailable")
}

/** Own the helper until OS exit AND stdio close; a failed join retains its files for diagnosis.
 * ownedQuery runs PowerShell under the broker, gates census on source admission,
 * and publishes <source>.result only after query OS/stdio close. Source must not
 * spawn an unowned query itself; its death/timeout joins this exact query handle.
 */
export async function invoke(source: string, decoder: string, request: readonly number[] | { nonce: string }, deadlineMs = 15000, ownedQuery?: string): Promise<string> {
  if (!Number.isFinite(deadlineMs) || deadlineMs <= 0) throw new Error("Windows process query requires a positive deadline")
  const started = performance.now()
  const deadline = started + deadlineMs
  const node = nodeExecutable()
  const dir = mkdtempSync(path.join(os.tmpdir(), "omni-windows-query-"))
  const file = path.join(dir, "query.mjs")
  const nonce = randomUUID()
  const state = { closed: true, failure: undefined as unknown }
  try {
    writeFileSync(file, source)
    writeFileSync(file + ".config", JSON.stringify({ node, decoder, ownedQuery }))
    writeFileSync(path.join(dir, "broker.mjs"), BROKER)
    writeFileSync(path.join(dir, "launcher.mjs"), LAUNCHER)
    if (performance.now() >= deadline) throw new Error("Windows process query deadline expired before startup")
`````

### PROC-WINDOWS-2 — `packages/core/test/fixture/windows-process-query.ts` 184–221

Commit `1cde2ff7a71bcf7aecb5d030917b577165135d38`; blob `f24e303349266553e9c3ba3c40f16ac7daab078a`; SHA256 integral `8293cc5be741860c8966a21da8418feb3beb96a24e334bf5d957c77c054a1b75`. Bytes fonte 17877; recorte [12862, 15550); SHA256 trecho `4ce6a8717b232e5cc11438885c1b41430919dc72e2e22fd5790a8f82e77cb15d`.

`````text
          const reply = message as Record<string, unknown>
          const source = reply.source as typeof output.source
          if (reply.nonce !== nonce) throw new Error("control nonce mismatch")
          if (!output.attested && reply.type === "attested" && reply.bun === false && reply.release === "node" && typeof reply.version === "string" && /^\d+\.\d+\.\d+/.test(reply.version)) {
            output.attested = true
            phaseMs.attested = performance.now() - started
            if (!output.error && performance.now() < deadline) child.stdin!.write("RUN\n")
            if (output.error || performance.now() >= deadline) child.stdin!.end()
            return
          }
          if (output.attested && !output.source && !output.complete && reply.type === "not-admitted") {
            output.complete = true; phaseMs.completed = performance.now() - started; return
          }
          if (output.attested && !output.source && !output.complete && reply.type === "admitted" && source && Number.isSafeInteger(source.pid) && source.pid > 0 && source.file === file && source.nonce === nonce) {
            if (ownedQuery !== undefined) {
              if (typeof reply.queryPID !== "number" || !Number.isSafeInteger(reply.queryPID) || reply.queryPID <= 0)
                throw new Error("owned Windows query admission missing PID")
              query.pid = reply.queryPID
            }
            output.source = source
            phaseMs.admitted = performance.now() - started
            if (!output.error && performance.now() < deadline) child.stdin!.write("SOURCE\n")
            if (output.error || performance.now() >= deadline) child.stdin!.end()
            return
          }
          if (output.source && !output.complete && reply.type === "completed" && reply.pid === output.source.pid && reply.osClosed === true && reply.stdioClosed === true && (reply.code === null || Number.isInteger(reply.code)) && (reply.signal === null || typeof reply.signal === "string")) {
            if (ownedQuery !== undefined) {
              if (reply.queryPID !== query.pid || reply.queryOSClosed !== true || reply.queryStdioClosed !== true)
                throw new Error("owned Windows query OS/stdio close missing")
              query.osClosed = true
              query.stdioClosed = true
            }
            output.complete = true; phaseMs.completed = performance.now() - started; return
          }
          throw new Error("invalid control order or runtime identity")
        } catch (error) { fail(new Error("Windows process query native Node attestation/control invalid", { cause: error })) }
      })
      child.stderr!.on("data", (chunk: Buffer) => {
`````

### HAR-EFFECT-1 — `packages/core/test/lib/effect.ts` 1–40

Commit `1cde2ff7a71bcf7aecb5d030917b577165135d38`; blob `4e9a5c195d29d621f96f326041fa1d8a52be7147`; SHA256 integral `835060b44a2229edd851c34a7f648f062d54aea2babb4f1e3e63197a48402d6f`. Bytes fonte 2864; recorte [0, 1909); SHA256 trecho `85fdef3ad079e1a5ceb3f0fe619d5105372247df4188d9f819aec6ed14e04799`.

`````text
import { test, type TestOptions } from "bun:test"
import { Cause, Effect, Exit, Layer } from "effect"
import type * as Scope from "effect/Scope"
import * as TestClock from "effect/testing/TestClock"
import * as TestConsole from "effect/testing/TestConsole"

type Body<A, E, R> = Effect.Effect<A, E, R> | (() => Effect.Effect<A, E, R>)

const body = <A, E, R>(value: Body<A, E, R>) => Effect.suspend(() => (typeof value === "function" ? value() : value))

const run = <A, E, R, E2>(value: Body<A, E, R | Scope.Scope>, layer: Layer.Layer<R, E2>) =>
  Effect.gen(function* () {
    const exit = yield* body(value).pipe(Effect.scoped, Effect.provide(layer), Effect.exit)
    if (Exit.isFailure(exit)) {
      for (const err of Cause.prettyErrors(exit.cause)) {
        yield* Effect.logError(err)
      }
    }
    return yield* exit
  }).pipe(Effect.runPromise)

const make = <R, E>(testLayer: Layer.Layer<R, E>, liveLayer: Layer.Layer<R, E>) => {
  const effect = <A, E2>(name: string, value: Body<A, E2, R | Scope.Scope>, opts?: number | TestOptions) =>
    test(name, () => run(value, testLayer), opts)

  effect.only = <A, E2>(name: string, value: Body<A, E2, R | Scope.Scope>, opts?: number | TestOptions) =>
    test.only(name, () => run(value, testLayer), opts)

  effect.skip = <A, E2>(name: string, value: Body<A, E2, R | Scope.Scope>, opts?: number | TestOptions) =>
    test.skip(name, () => run(value, testLayer), opts)

  const live = <A, E2>(name: string, value: Body<A, E2, R | Scope.Scope>, opts?: number | TestOptions) =>
    test(name, () => run(value, liveLayer), opts)

  live.only = <A, E2>(name: string, value: Body<A, E2, R | Scope.Scope>, opts?: number | TestOptions) =>
    test.only(name, () => run(value, liveLayer), opts)

  live.skip = <A, E2>(name: string, value: Body<A, E2, R | Scope.Scope>, opts?: number | TestOptions) =>
    test.skip(name, () => run(value, liveLayer), opts)

`````

### HAR-REJECTION-1 — `packages/core/test/lib/rejection.ts` 1–19

Commit `1cde2ff7a71bcf7aecb5d030917b577165135d38`; blob `1687c3e363bab431a4e9e9b0a12f901f9bec1c49`; SHA256 integral `24f7689ecaa3d5164dbb24e158d08fd4e8de8005e2cdbad9f5014d8a1c4da951`. Bytes fonte 740; recorte [0, 740); SHA256 trecho `24f7689ecaa3d5164dbb24e158d08fd4e8de8005e2cdbad9f5014d8a1c4da951`.

`````text
// expect(promise).rejects waits in a nested event loop, and on Windows Bun 1.3.14 can spin there forever when the
// promise needs a timer to settle. Awaiting these instead keeps each assertion and its failure meaning.

// The rejection reason; a promise that resolves fails the test instead.
export function rejection(promise: unknown) {
  return Promise.resolve(promise).then(
    (value) => {
      throw new Error("Expected promise to reject", { cause: value })
    },
    (error: unknown) => error,
  )
}

// Outside .rejects, toThrow only accepts a function, so this hands it one that throws the rejection reason.
export function rethrow(promise: unknown) {
  return rejection(promise).then((error) => () => {
    throw error
  })
}
`````

### HAR-TMP-1 — `packages/core/test/fixture/tmpdir.ts` 1–43

Commit `1cde2ff7a71bcf7aecb5d030917b577165135d38`; blob `f15d9766a2cd72f9bd0164308c3fe25c0900b289`; SHA256 integral `538b6d77e4bcbe10bdd342d7b20b37c9130d371eff304513039fc211fd7d26fe`. Bytes fonte 1725; recorte [0, 1725); SHA256 trecho `538b6d77e4bcbe10bdd342d7b20b37c9130d371eff304513039fc211fd7d26fe`.

`````text
import fs from "fs/promises"
import { tmpdir as osTmpdir } from "os"
import path from "path"

export const tmpdir = async () => {
  const dir = await fs.realpath(await fs.mkdtemp(path.join(osTmpdir(), "orchestra-core-test-")))
  return {
    path: dir,
    async [Symbol.asyncDispose]() {
      await remove(dir)
    },
  }
}

async function remove(dir: string, retries = 30): Promise<void> {
  try {
    await fs.rm(dir, { recursive: true, force: true })
  } catch (error) {
    if (retries === 0 || !error || typeof error !== "object" || !("code" in error) || error.code !== "EBUSY")
      throw error
    Bun.gc(true)
    await Bun.sleep(100)
    return remove(dir, retries - 1)
  }
}

/**
 * Removes a fixture root holding executables the test just ran. On GitHub's Windows runners, provjobd.exe<n> (started
 * from %TEMP% by GitHub's hosted-compute-agent, outside the test's process tree) opens each newly run image for a moment
 * after its process exits, so deleting it fails with EBUSY. Restart Manager named it as the only holder in all 11 holds
 * caught (10 in 1,704 runs of a fresh node.exe copy, 1 in a whole core run); each released within 152 ms. Only EBUSY is
 * retried, for at most 5 s: any other failure, or a holder that outlasts the bound, still fails the test.
 */
export async function removeExecuted(dir: string) {
  const deadline = performance.now() + 5_000
  for (;;) {
    const error = await fs.rm(dir, { recursive: true, force: true }).then(() => undefined, (error: unknown) => error)
    if (error === undefined) return
    if (performance.now() >= deadline || !error || typeof error !== "object" || !("code" in error) || error.code !== "EBUSY")
      throw error
    await Bun.sleep(25)
  }
}
`````

### HAR-TOOL-1 — `packages/core/test/lib/tool.ts` 1–21

Commit `1cde2ff7a71bcf7aecb5d030917b577165135d38`; blob `0d46e1c34bcf90b8841cdcd70c49b698de4713b4`; SHA256 integral `1b395b0c47a1091cee4a9a419f38fa76c12198b9761dcb2c678f38e3765a923d`. Bytes fonte 1038; recorte [0, 1038); SHA256 trecho `1b395b0c47a1091cee4a9a419f38fa76c12198b9761dcb2c678f38e3765a923d`.

`````text
import { AgentV2 } from "@orchestra/core/agent"
import { SessionMessage } from "@orchestra/core/session/message"
import { ToolRegistry } from "@orchestra/core/tool/registry"
import { Effect } from "effect"

// A caller that is not Maestro: the Maestro Arsenal tests rely on this identity being refused.
export const toolIdentity = {
  agent: AgentV2.ID.make("general"),
  assistantMessageID: SessionMessage.ID.make("msg_tool_test"),
}

export const toolDefinitions = (
  registry: ToolRegistry.Interface,
  permissions?: Parameters<typeof registry.materialize>[0],
) => registry.materialize(permissions).pipe(Effect.map((materialized) => materialized.definitions))

export const settleTool = (registry: ToolRegistry.Interface, input: ToolRegistry.ExecuteInput) =>
  registry.materialize().pipe(Effect.flatMap((materialized) => materialized.settle(input)))

export const executeTool = (registry: ToolRegistry.Interface, input: ToolRegistry.ExecuteInput) =>
  settleTool(registry, input).pipe(Effect.map((settlement) => settlement.result))
`````

### HAR-LOCATION-1 — `packages/core/test/fixture/location.ts` 1–26

Commit `1cde2ff7a71bcf7aecb5d030917b577165135d38`; blob `b0ae64263ca047a557c4668ac083fbcbdbbe0fb3`; SHA256 integral `14f72e558218a270b4e4f555028371947f306641404a4d7af3b092bd35f39a7e`. Bytes fonte 950; recorte [0, 950); SHA256 trecho `14f72e558218a270b4e4f555028371947f306641404a4d7af3b092bd35f39a7e`.

`````text
import { Location } from "@orchestra/core/location"
import { Project } from "@orchestra/core/project"
import { AbsolutePath } from "@orchestra/core/schema"
import { Effect, Layer } from "effect"
import { tmpdir } from "./tmpdir"

export function location(ref: Location.Ref, input: { projectDirectory?: AbsolutePath; vcs?: Project.Vcs } = {}) {
  return {
    directory: ref.directory,
    workspaceID: ref.workspaceID,
    project: { id: Project.ID.global, directory: input.projectDirectory ?? ref.directory },
    vcs: input.vcs,
  } satisfies Location.Interface
}

export const tempLocationLayer = Layer.unwrap(
  Effect.acquireRelease(
    Effect.promise(() => tmpdir()),
    (tmp) => Effect.promise(() => tmp[Symbol.asyncDispose]()),
  ).pipe(
    Effect.map((tmp) => {
      const ref = Location.Ref.make({ directory: AbsolutePath.make(tmp.path) })
      return Layer.succeed(Location.Service, Location.Service.of(location(ref)))
    }),
  ),
)
`````

### HAR-SHARED-1 — `packages/core/test/shared-schema.test.ts` 33–59

Commit `1cde2ff7a71bcf7aecb5d030917b577165135d38`; blob `3e7344d564d90c3574363eb35f423607a771813e`; SHA256 integral `90eb879e84c7986773af24ab71a9c19d896a367401c5ecc2f514326b3bbde1b9`. Bytes fonte 9251; recorte [1730, 2376); SHA256 trecho `c8079cf5f02586be7b1d2d04d95d3c71c687b98b2fb549d9aa5badffceced47a`.

`````text
test("Core reuses the canonical shared schemas", async () => {
  const [
    coreCommand,
    coreConnection,
    coreCredential,
    coreFileSystem,
    coreIntegration,
    coreLocation,
    coreLLM,
    corePermission,
    coreProjectCopy,
    corePty,
    coreProject,
    coreReference,
    coreSessionInput,
    coreSessionMessage,
    coreSessionTodo,
    corePrompt,
    coreSkill,
    coreV2Schema,
    coreSchema,
    coreWorkspace,
  ] = await Promise.all([
    import("@orchestra/core/command"),
    import("@orchestra/core/integration/connection"),
    import("@orchestra/core/credential"),
    import("@orchestra/core/filesystem"),
`````

### HAR-SHARED-2 — `packages/core/test/shared-schema.test.ts` 167–202

Commit `1cde2ff7a71bcf7aecb5d030917b577165135d38`; blob `3e7344d564d90c3574363eb35f423607a771813e`; SHA256 integral `90eb879e84c7986773af24ab71a9c19d896a367401c5ecc2f514326b3bbde1b9`. Bytes fonte 9251; recorte [7377, 9251); SHA256 trecho `9c52e14395f2df3dcf7fee507c19494f7022827c390d60c4dd0f90533d88014f`.

`````text
    [coreSkill.DirectorySource, Skill.DirectorySource],
    [coreSkill.UrlSource, Skill.UrlSource],
    [coreSkill.EmbeddedSource, Skill.EmbeddedSource],
    [coreSkill.Source, Skill.Source],
    [coreSkill.Info, Skill.Info],
    [coreV2Schema.DateTimeUtcFromMillis, DateTimeUtcFromMillis],
    [coreSchema.optional, optional],
    [coreSchema.statics, statics],
    [coreWorkspace.ID, Workspace.ID],
  ]
  for (const [core, shared] of schemas) expect(core).toBe(shared)

  expect(Agent.Info.empty(Agent.ID.make("test"))).toEqual(AgentV2.Info.empty(AgentV2.ID.make("test")))
  expect(Model.Info.empty(Provider.ID.make("test"), Model.ID.make("model"))).toEqual(
    ModelV2.Info.empty(ProviderV2.ID.make("test"), ModelV2.ID.make("model")),
  )
  expect(Provider.Info.empty(Provider.ID.make("test"))).toEqual(ProviderV2.Info.empty(ProviderV2.ID.make("test")))
  expect(Skill.Source.key(Skill.DirectorySource.make({ type: "directory", path: AbsolutePath.make("/tmp") }))).toBe(
    "directory:/tmp",
  )
})

test("shared record schemas construct and decode plain objects", () => {
  const made = Prompt.make({ text: "hello" })
  const decoded = Schema.decodeUnknownSync(Prompt)({ text: "hello" })
  const content = Schema.decodeUnknownSync(SessionMessage.AssistantText)({ type: "text", id: "part_1", text: "hi" })

  expect(Object.getPrototypeOf(made)).toBe(Object.prototype)
  expect(Object.getPrototypeOf(decoded)).toBe(Object.prototype)
  expect(Object.getPrototypeOf(content)).toBe(Object.prototype)
  expect(Prompt.ast.annotations?.identifier).toBe("Prompt")
  expect(SessionMessage.AssistantText.ast.annotations?.identifier).toBe("Session.Message.Assistant.Text")
  expect(Prompt.equivalence(Prompt.make({ text: "hello" }), decoded)).toBe(true)
  expect(Prompt.fromUserMessage({ text: "hello" })).toEqual(made)
  expect(Workspace.ID.ascending("")).toStartWith("wrk_")
})
`````

### HAR-GOVERNANCE-1 — `packages/core/test/task-governance.test.ts` 1–63

Commit `1cde2ff7a71bcf7aecb5d030917b577165135d38`; blob `b40ac84ae3fa542fa23871cfa5d93b332faeb549`; SHA256 integral `6276912b7745c424961d08da63926088cda560526e944d388b0d4464cb19e3da`. Bytes fonte 2372; recorte [0, 2372); SHA256 trecho `6276912b7745c424961d08da63926088cda560526e944d388b0d4464cb19e3da`.

`````text
import { describe, expect } from "bun:test"
import { AgentV2 } from "@orchestra/core/agent"
import { AppNodeBuilder } from "@orchestra/core/effect/app-node-builder"
import { ProjectV2 } from "@orchestra/core/project"
import { SessionMessage } from "@orchestra/core/session/message"
import { SessionSchema } from "@orchestra/core/session/schema"
import { TaskGovernance } from "@orchestra/core/tool/task-governance"
import { Effect, Schema } from "effect"
import { testEffect } from "./lib/effect"

const it = testEffect(AppNodeBuilder.build(TaskGovernance.node))

const session = Schema.decodeUnknownSync(SessionSchema.Info)({
  id: "ses_governance",
  projectID: ProjectV2.ID.global,
  cost: 0,
  tokens: { input: 0, output: 0, reasoning: 0, cache: { read: 0, write: 0 } },
  time: { created: 0, updated: 0 },
  title: "governance",
  location: { directory: "/governance" },
})

const reply = Schema.decodeUnknownSync(SessionMessage.Assistant)({
  id: "msg_governance",
  type: "assistant",
  agent: "worker",
  model: { providerID: "provider", id: "model" },
  content: [
    { type: "text", id: "first", text: "first line" },
    { type: "reasoning", id: "thought", text: "hidden reasoning" },
    { type: "text", id: "second", text: "second line" },
  ],
  finish: "stop",
  time: { created: 0, completed: 1 },
})

const context = {
  sessionID: session.id,
  agent: AgentV2.ID.make("caller"),
  assistantMessageID: SessionMessage.ID.make("msg_caller"),
  toolCallID: "call",
}

describe("TaskGovernance.allowAll", () => {
  it.effect("is the Location default and leaves Task unchanged", () => Effect.gen(function* () {
    const governance = yield* TaskGovernance.Service
    expect(governance).toBe(TaskGovernance.allowAll)
    expect(governance.input).toEqual({})
    expect(yield* governance.admit({
      parent: session,
      target: AgentV2.Info.empty(AgentV2.ID.make("worker")),
      input: { description: "d", prompt: "p", subagent_type: "worker" },
      context,
    })).toEqual({})
    yield* governance.beforeTurn(session)
  }))

  it.effect("settles a reply as its text parts joined by newlines", () => Effect.gen(function* () {
    const governance = yield* TaskGovernance.Service
    const settled = yield* governance.settle({ child: session, reply, admission: {}, context })
    expect(settled).toEqual({ text: "first line\nsecond line" })
  }))
})
`````

### PROC-FLOCK-1 — `packages/core/test/fixture/flock-worker.ts` 23–72

Commit `1cde2ff7a71bcf7aecb5d030917b577165135d38`; blob `4d375f38b74b2b0fb04c1c529eb810b899146be5`; SHA256 integral `6f40dcfa93a97db5830c3361ca750bcf6f1adae81892a56000a528821d1e623c`. Bytes fonte 1424; recorte [386, 1424); SHA256 trecho `9970c19f95228a8c473049b52de13490e0bda6b460ef80a5dcd60620ea2999e5`.

`````text
function input() {
  const raw = process.argv[2]
  if (!raw) {
    throw new Error("Missing flock worker input")
  }

  return JSON.parse(raw) as Msg
}

async function job(input: Msg) {
  if (input.ready) {
    await fs.writeFile(input.ready, String(process.pid))
  }

  if (input.active) {
    await fs.writeFile(input.active, String(process.pid), { flag: "wx" })
  }

  try {
    if (input.holdMs && input.holdMs > 0) {
      await sleep(input.holdMs)
    }

    if (input.done) {
      await fs.appendFile(input.done, "1\n")
    }
  } finally {
    if (input.active) {
      await fs.rm(input.active, { force: true })
    }
  }
}

async function main() {
  const msg = input()

  await Flock.withLock(msg.key, () => job(msg), {
    dir: msg.dir,
    staleMs: msg.staleMs,
    timeoutMs: msg.timeoutMs,
    baseDelayMs: msg.baseDelayMs,
    maxDelayMs: msg.maxDelayMs,
  })
}

await main().catch((err) => {
  const text = err instanceof Error ? (err.stack ?? err.message) : String(err)
  process.stderr.write(text)
  process.exit(1)
})
`````

### PROC-EFLOCK-1 — `packages/core/test/fixture/effect-flock-worker.ts` 24–60

Commit `1cde2ff7a71bcf7aecb5d030917b577165135d38`; blob `e84508a69063d4c8da035df05175db38ee46967f`; SHA256 integral `e3528623c9e447f8e441df7a88dc31eff7d1066d52325cb580e808181b1c7f3c`. Bytes fonte 1569; recorte [561, 1569); SHA256 trecho `fe6f83f554232ce536c63d328f7584f49a4b300f9ed65c21b1a4b87309fd545f`.

`````text
  home: os.homedir(),
  data: os.tmpdir(),
  cache: os.tmpdir(),
  config: os.tmpdir(),
  state: os.tmpdir(),
  bin: os.tmpdir(),
  log: os.tmpdir(),
})

const testLayer = AppNodeBuilder.build(EffectFlock.node, [[Global.node, testGlobal]])

async function job() {
  if (msg.ready) await fs.writeFile(msg.ready, String(process.pid))
  if (msg.active) await fs.writeFile(msg.active, String(process.pid), { flag: "wx" })

  try {
    if (msg.holdMs && msg.holdMs > 0) await sleep(msg.holdMs)
    if (msg.done) await fs.appendFile(msg.done, "1\n")
  } finally {
    if (msg.active) await fs.rm(msg.active, { force: true })
  }
}

await Effect.runPromise(
  Effect.gen(function* () {
    const flock = yield* EffectFlock.Service
    yield* flock.withLock(
      Effect.promise(() => job()),
      msg.key,
      msg.dir,
    )
  }).pipe(Effect.provide(testLayer)),
).catch((err) => {
  const text = err instanceof Error ? (err.stack ?? err.message) : String(err)
  process.stderr.write(text)
  process.exit(1)
})
`````

### PROC-BACKGROUND-1 — `packages/core/test/background-job.test.ts` 1–104

Commit `1cde2ff7a71bcf7aecb5d030917b577165135d38`; blob `ffe7f371cc6f3144ac80ec83ddcab1f0e9c1f09e`; SHA256 integral `080927c6b18aa9be31431b94349ef1245a30d388b271d19dbcf4f6e6bfbe6440`. Bytes fonte 6168; recorte [0, 3869); SHA256 trecho `6a0c3f91f744095a62c026eaebe611a1c93a9c4f4b19208b7dfe32054913d214`.

`````text
import { describe, expect } from "bun:test"
import { BackgroundJob } from "@orchestra/core/background-job"
import { LayerNode } from "@orchestra/core/effect/layer-node"
import { Deferred, Effect, Exit, Scope } from "effect"
import { it } from "./lib/effect"

const jobsLayer = LayerNode.compile(BackgroundJob.node)

describe("BackgroundJob", () => {
  it.live("tracks process-local work through explicit observation", () =>
    Effect.gen(function* () {
      const jobs = yield* BackgroundJob.Service
      const latch = yield* Deferred.make<void>()
      const job = yield* jobs.start({
        type: "test",
        metadata: { durable: false },
        run: Deferred.await(latch).pipe(Effect.as("done")),
      })

      expect(job).toMatchObject({ type: "test", status: "running", metadata: { durable: false } })
      expect(yield* jobs.wait({ id: job.id, timeout: 0 })).toMatchObject({
        timedOut: true,
        info: { status: "running" },
      })

      yield* Deferred.succeed(latch, undefined)
      expect(yield* jobs.wait({ id: job.id })).toMatchObject({
        timedOut: false,
        info: { status: "completed", output: "done" },
      })
    }).pipe(Effect.provide(jobsLayer)),
  )

  it.live("publishes jobs before starting immediately settling work", () =>
    Effect.gen(function* () {
      const jobs = yield* BackgroundJob.Service

      yield* Effect.forEach(Array.from({ length: 100 }), (_, index) => {
        const id = `job_immediate_start_${index}`
        return Effect.gen(function* () {
          const job = yield* jobs.start({
            id,
            type: "test",
            run: jobs
              .get(id)
              .pipe(
                Effect.flatMap((info) =>
                  info?.status === "running"
                    ? Effect.succeed(`done-${index}`)
                    : Effect.fail("job started before publish"),
                ),
              ),
          })

          expect(yield* jobs.wait({ id: job.id })).toMatchObject({
            timedOut: false,
            info: { status: "completed", output: `done-${index}` },
          })
        })
      })
    }).pipe(Effect.provide(jobsLayer)),
  )

  it.live("increments pending work before starting immediately settling extensions", () =>
    Effect.gen(function* () {
      const jobs = yield* BackgroundJob.Service

      yield* Effect.forEach(Array.from({ length: 100 }), (_, index) =>
        Effect.gen(function* () {
          const first = yield* Deferred.make<void>()
          const job = yield* jobs.start({
            type: "test",
            run: Deferred.await(first).pipe(Effect.as(`first-${index}`)),
          })

          expect(yield* jobs.extend({ id: job.id, run: Effect.succeed(`second-${index}`) })).toBe(true)
          expect((yield* jobs.get(job.id))?.status).toBe("running")

          yield* Deferred.succeed(first, undefined)
          expect(yield* jobs.wait({ id: job.id })).toMatchObject({
            timedOut: false,
            info: { status: "completed", output: `second-${index}` },
          })
        }),
      )
    }).pipe(Effect.provide(jobsLayer)),
  )

  it.live("interrupts live work without promising settlement after the owning process-local scope closes", () =>
    Effect.gen(function* () {
      const scope = yield* Scope.make()
      const interrupted = yield* Deferred.make<void>()
      const jobs = yield* BackgroundJob.make.pipe(Scope.provide(scope))
      const job = yield* jobs.start({
        type: "test",
        run: Effect.never.pipe(Effect.ensuring(Deferred.succeed(interrupted, undefined))),
      })

      yield* Scope.close(scope, Exit.void)

      yield* Deferred.await(interrupted).pipe(Effect.timeout("1 second"))
      // The abandoned in-memory registry is not a durable observation channel.
      expect((yield* jobs.get(job.id))?.status).toBe("running")
    }),
`````

### PROC-APP-1 — `packages/core/test/process/process.test.ts` 31–85

Commit `1cde2ff7a71bcf7aecb5d030917b577165135d38`; blob `8eb6563adcd0b92f4a86f9fbbb2a1392119443d7`; SHA256 integral `4029c018eb9ffbd7c6135dbc0e81c73f9115ba3ae31a33ce02def7b942e78d65`. Bytes fonte 14753; recorte [1069, 3374); SHA256 trecho `aa84fedc00ba9e016495dfba2853e653ba8baf8cafb3705ecc8d5be0bbe0dd61`.

`````text
describe("AppProcess", () => {
  describe("run", () => {
    it.effect(
      "captures stdout and exit code zero",
      Effect.gen(function* () {
        const svc = yield* AppProcess.Service
        const result = yield* svc.run(cmd("-e", "process.stdout.write('hi\\n')"))
        expect(result.exitCode).toBe(0)
        expect(result.stdout.toString("utf8")).toBe("hi\n")
        expect(result.stdoutTruncated).toBe(false)
        expect(result.stderrTruncated).toBe(false)
      }),
    )

    it.effect(
      "captures both output streams while preserving each stream's order",
      Effect.gen(function* () {
        const svc = yield* AppProcess.Service
        const script = [
          'process.stdout.write("out 1\\n")',
          'setTimeout(() => process.stderr.write("err 1\\n"), 10)',
          'setTimeout(() => process.stdout.write("out 2\\n"), 20)',
        ].join(";")
        const result = yield* svc.run(cmd("-e", script), { combineOutput: true })
        // Separate OS pipes do not define a total order between stdout and stderr reads.
        const lines = result.output?.toString("utf8").split("\n")
        expect(lines?.at(-1)).toBe("")
        expect(lines?.slice(0, -1).toSorted()).toEqual(["err 1", "out 1", "out 2"])
        expect(lines?.filter((line) => line.startsWith("out "))).toEqual(["out 1", "out 2"])
        expect(result.stdout.toString("utf8")).toBe("")
        expect(result.stderr.toString("utf8")).toBe("")
      }),
    )

    it.effect(
      "non-zero exit returns RunResult; caller can require success",
      Effect.gen(function* () {
        const svc = yield* AppProcess.Service
        const result = yield* svc.run(cmd("-e", "process.exit(1)"))
        expect(result.exitCode).toBe(1)
      }),
    )

    it.effect(
      "requireSuccess fails on non-zero exit",
      Effect.gen(function* () {
        const svc = yield* AppProcess.Service
        const exit = yield* Effect.exit(
          svc.run(cmd("-e", "process.exit(1)")).pipe(Effect.flatMap(AppProcess.requireSuccess)),
        )
        expect(Exit.isFailure(exit)).toBe(true)
        if (Exit.isFailure(exit)) {
          const reason = exit.cause.reasons[0]
          if (reason && reason._tag === "Fail") {
            expect(reason.error).toBeInstanceOf(AppProcess.AppProcessError)
`````

### PROC-APP-2 — `packages/core/test/process/process.test.ts` 235–274

Commit `1cde2ff7a71bcf7aecb5d030917b577165135d38`; blob `8eb6563adcd0b92f4a86f9fbbb2a1392119443d7`; SHA256 integral `4029c018eb9ffbd7c6135dbc0e81c73f9115ba3ae31a33ce02def7b942e78d65`. Bytes fonte 14753; recorte [9716, 11082); SHA256 trecho `b3587a2b537e1ce60a3eb3203850d25ae524a680a17258a458940e531e9787ba`.

`````text
      }),
    )

    it.effect(
      "feeds a Uint8Array to stdin",
      Effect.gen(function* () {
        const svc = yield* AppProcess.Service
        const bytes = new TextEncoder().encode("bytes")
        const result = yield* svc.run(cmd("-e", echoStdin), { stdin: bytes })
        expect(result.exitCode).toBe(0)
        expect(result.stdout.toString("utf8")).toBe("bytes")
      }),
    )

    it.effect(
      "feeds a Stream of Uint8Array chunks to stdin",
      Effect.gen(function* () {
        const svc = yield* AppProcess.Service
        const enc = new TextEncoder()
        const stream = Stream.fromIterable([enc.encode("one"), enc.encode("-two"), enc.encode("-three")])
        const result = yield* svc.run(cmd("-e", echoStdin), { stdin: stream })
        expect(result.exitCode).toBe(0)
        expect(result.stdout.toString("utf8")).toBe("one-two-three")
      }),
    )

    it.effect(
      "completes correctly with empty input",
      Effect.gen(function* () {
        const svc = yield* AppProcess.Service
        const result = yield* svc.run(cmd("-e", echoStdin), { stdin: "" })
        expect(result.exitCode).toBe(0)
        expect(result.stdout.toString("utf8")).toBe("")
      }),
    )

    it.effect(
      "carries existing Command options like env",
      Effect.gen(function* () {
        const svc = yield* AppProcess.Service
`````

### PROC-DIALER-1 — `packages/core/test/fixtures/cassandra-dialer_test.go` 207–257

Commit `1cde2ff7a71bcf7aecb5d030917b577165135d38`; blob `4b96c06c405b7f1a889206f04a3cd189e7bedc67`; SHA256 integral `c231e17601f43fcbba1241f6359dab0efaf63478ee5324baa9ba0035f51dae55`. Bytes fonte 14804; recorte [7097, 8884); SHA256 trecho `018998e313c83d3fd95667081e456406c4f1473018c984bfa30745940e25ad4a`.

`````text
func within(t *testing.T, what string, result chan error) error {
	t.Helper()
	select {
	case err := <-result:
		return err
	case <-time.After(2 * time.Second):
		t.Fatalf("%s did not return promptly", what)
		return nil
	}
}

// Go connections cannot return a context error, so a driver abandons a blocked call by closing or by moving the deadline.
func TestOrchestraInflightReadCancel(t *testing.T) {
	conn, peer := stalledPair(t)
	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()
	stop := context.AfterFunc(ctx, func() { conn.Close() })
	defer stop()
	read := make(chan error, 1)
	go func() { _, err := conn.Read(make([]byte, 1)); read <- err }()
	select {
	case err := <-read:
		t.Fatal("read returned before cancellation", err)
	case <-time.After(100 * time.Millisecond):
	}
	cancel()
	if err := within(t, "canceled read", read); !errors.Is(err, net.ErrClosed) || !errors.Is(ctx.Err(), context.Canceled) {
		t.Fatal("canceled read did not report a closed conn", err)
	}
	if _, err := conn.Write([]byte("x")); !errors.Is(err, net.ErrClosed) {
		t.Fatal("conn stayed writable after cancellation", err)
	}
	peer.SetReadDeadline(time.Now().Add(2 * time.Second))
	if _, err := peer.Read(make([]byte, 1)); err != io.EOF {
		t.Fatal("peer did not observe the closed Unix socket", err)
	}
}

func TestOrchestraInflightReadDeadlineMove(t *testing.T) {
	conn, _ := stalledPair(t)
	read := make(chan error, 1)
	go func() { _, err := conn.Read(make([]byte, 1)); read <- err }()
	time.Sleep(100 * time.Millisecond)
	if err := conn.SetReadDeadline(time.Unix(1, 0)); err != nil {
		t.Fatal(err)
	}
	if err, ok := within(t, "read after deadline moved", read).(net.Error); !ok || !err.Timeout() {
		t.Fatal("moved deadline did not wake the blocked read with a timeout")
	}
}

`````

### PROC-DIALER-2 — `packages/core/test/fixtures/cassandra-dialer_test.go` 269–302

Commit `1cde2ff7a71bcf7aecb5d030917b577165135d38`; blob `4b96c06c405b7f1a889206f04a3cd189e7bedc67`; SHA256 integral `c231e17601f43fcbba1241f6359dab0efaf63478ee5324baa9ba0035f51dae55`. Bytes fonte 14804; recorte [9148, 10258); SHA256 trecho `0df334363d3458c4600af583553012fe672771a6c3521608321d1bc1bf31aa90`.

`````text
func TestOrchestraInflightWriteDeadline(t *testing.T) {
	conn, _ := stalledPair(t)
	if err := conn.SetWriteDeadline(time.Now().Add(300 * time.Millisecond)); err != nil {
		t.Fatal(err)
	}
	started := time.Now()
	write := make(chan error, 1)
	go fill(conn, write)
	err := within(t, "write against a silent peer", write)
	if timeout, ok := err.(net.Error); !ok || !timeout.Timeout() || !errors.Is(err, os.ErrDeadlineExceeded) {
		t.Fatal("write deadline did not produce a timeout", err)
	}
	if time.Since(started) < 250*time.Millisecond {
		t.Fatal("write failed before its deadline, so the buffer was never the blocker", err)
	}
}

func TestOrchestraInflightWriteCancel(t *testing.T) {
	conn, _ := stalledPair(t)
	write := make(chan error, 1)
	go fill(conn, write)
	select {
	case err := <-write:
		t.Fatal("write returned without a deadline or cancellation", err)
	case <-time.After(300 * time.Millisecond):
	}
	if err := conn.Close(); err != nil {
		t.Fatal(err)
	}
	if err := within(t, "canceled write", write); !errors.Is(err, net.ErrClosed) {
		t.Fatal("close did not cancel the blocked write", err)
	}
}

`````

### PROC-DIALER-3 — `packages/core/test/fixtures/cassandra-dialer_test.go` 330–360

Commit `1cde2ff7a71bcf7aecb5d030917b577165135d38`; blob `4b96c06c405b7f1a889206f04a3cd189e7bedc67`; SHA256 integral `c231e17601f43fcbba1241f6359dab0efaf63478ee5324baa9ba0035f51dae55`. Bytes fonte 14804; recorte [11980, 12993); SHA256 trecho `2f4b86e212aa96d22e3b5e9253bfcd0148901953eb982aeb0c68b6515d8db3c9`.

`````text
// A local CONNECT peer stands in for the sandbox proxy; the real srt proxy is exercised by the hosted Linux proof.
func TestOrchestraTunnel(t *testing.T) {
	listener, err := net.Listen("tcp", "127.0.0.1:0")
	if err != nil {
		t.Fatal(err)
	}
	defer listener.Close()
	requests := make(chan string, 8)
	go func() {
		for {
			conn, err := listener.Accept()
			if err != nil {
				return
			}
			go func() {
				defer conn.Close()
				header := make([]byte, 0, 256)
				next := make([]byte, 1)
				for !strings.HasSuffix(string(header), "\r\n\r\n") {
					if _, err := io.ReadFull(conn, next); err != nil {
						return
					}
					header = append(header, next[0])
				}
				requests <- string(header)
				switch {
				case strings.HasPrefix(string(header), "CONNECT 127.0.0.1:9042 "):
					io.WriteString(conn, "HTTP/1.1 200 Connection Established\r\n\r\n")
					io.Copy(conn, conn)
				case strings.HasPrefix(string(header), "CONNECT 127.0.0.1:9043 "):
					io.WriteString(conn, "HTTP/1.1 403 Forbidden\r\n\r\n")
`````

### PROC-DIALER-LINUX-1 — `packages/core/test/fixtures/cassandra-dialer-linux_test.go` 1–88

Commit `1cde2ff7a71bcf7aecb5d030917b577165135d38`; blob `81f9a09b8b8840718e48148fbcfefb29f83975db`; SHA256 integral `eef3a4a276b942ae3ead0c28ae0f3bf7ecb6cd020b374874331607b04fe5a4b5`. Bytes fonte 2358; recorte [0, 2358); SHA256 trecho `eef3a4a276b942ae3ead0c28ae0f3bf7ecb6cd020b374874331607b04fe5a4b5`.

`````text
//go:build linux

package main

import (
	"context"
	"encoding/hex"
	"errors"
	"net"
	"os"
	"syscall"
	"testing"
	"time"
)

// A Unix listener with backlog 0 and one unaccepted client refuses further connects; Linux reports that as EAGAIN.
func TestOrchestraDialFullBacklog(t *testing.T) {
	dir, err := os.MkdirTemp("", "odb")
	if err != nil {
		t.Fatal(err)
	}
	defer os.RemoveAll(dir)
	socket := dir + "/s"
	fd, err := syscall.Socket(syscall.AF_UNIX, syscall.SOCK_STREAM|syscall.SOCK_CLOEXEC, 0)
	if err != nil {
		t.Fatal(err)
	}
	defer syscall.Close(fd)
	if err := syscall.Bind(fd, &syscall.SockaddrUnix{Name: socket}); err != nil {
		t.Fatal(err)
	}
	if err := syscall.Listen(fd, 0); err != nil {
		t.Fatal(err)
	}
	d, err := newOrchestraGeneratorDialer("9042:"+hex.EncodeToString([]byte(socket)), time.Second)
	if err != nil {
		t.Fatal(err)
	}
	var queued []net.Conn
	defer func() {
		for _, conn := range queued {
			conn.Close()
		}
	}()
	// Nobody accepts, so the backlog fills; the first refused dial proves it is full.
	var refused error
	for i := 0; i < 64 && refused == nil; i++ {
		conn, err := d.DialContext(context.Background(), "tcp", "127.0.0.1:9042")
		if err != nil {
			refused = err
			break
		}
		queued = append(queued, conn)
	}
	if refused == nil {
		t.Skip("kernel never filled the Unix backlog")
	}
	fds := func() int {
		entries, err := os.ReadDir("/proc/self/fd")
		if err != nil {
			t.Fatal(err)
		}
		return len(entries)
	}
	before := fds()
	for i := 0; i < 20; i++ {
		ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
		started := time.Now()
		conn, err := d.DialContext(ctx, "tcp", "127.0.0.1:9042")
		if conn != nil {
			conn.Close()
			t.Fatal("dial succeeded against a full backlog")
		}
		if err == nil || time.Since(started) > time.Second {
			t.Fatalf("dial against a full backlog was not refused promptly: %v after %v", err, time.Since(started))
		}
		cancel()
	}
	// A canceled context still wins over the refusal.
	ctx, cancel := context.WithCancel(context.Background())
	cancel()
	if conn, err := d.DialContext(ctx, "tcp", "127.0.0.1:9042"); conn != nil || !errors.Is(err, context.Canceled) {
		t.Fatal("canceled dial against a full backlog lost its cause", err)
	}
	if after := fds(); after > before {
		t.Fatalf("failed dials leaked descriptors: %d before, %d after", before, after)
	}
}
`````

## Encerramento probatório e inputs

A evidência nova complementa os trechos reconhecidos, com identificação por path no índice. A população é a mesma 104+24, sem recontagem inflacionada por auxiliares. Os três deltas e duas razões estão isolados; histórico e proposta não foram reescritos. Inputs históricos integrais A3/A4/projection permanecem efetivos conforme `effective-inputs.json`; o arquivo 726.892 bytes não foi recortado/reclassificado para contornar limite nativo. O recibo independente e seu procedimento são novas entradas probatórias desta revisão. Status estrutural do recibo não promove suficiência semântica, operação ou união. A decisão é do mesmo par.
