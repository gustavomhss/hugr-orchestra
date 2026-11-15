# Reconciliação compartilhada 1 — fronteiras e suporte

Prova comum congelada para RE-BND-01 e futuros pedidos públicos de suporte. Não altera corpos de suporte/proposta, não cria aceite e não converte navegação em build dependency. A origem é `coverage.jsonl` v1, SHA256 `d7e73779d4d0eca6a0edd56921c612955f82a564831c9fc6bf05353c1ae0c4b9`, e os inputs históricos integrais identificados abaixo.

| População | Quantidade | Disposição |
|---|---:|---|
| Fronteiras | 24 | 14 implementações e 10 testes preparados |
| Suporte local | 104 | 9 históricos, 3 documentação, 12 package/tooling, 80 validação/fixtures/harness |
| Total deste produtor | 128 | Cada path aparece uma única vez em coverage |
| Core inteiro histórico | 1441 | Escopo do corpo herdado de entrada; não é o recorte atual |
| União S1 no kit | 2236 | Meta de união; não resultado de aceite |

## 24 disposições individuais literais

Cada fence contém uma linha original inteira do JSONL, incluindo read_depth, role, need, artifact e reason.

### POP-B022 — `coverage.jsonl` linhas 22–22

Commit: `LOCAL_CANDIDATE_OR_PROVIDED_INPUT`. Blob: `c95f8432d35a98d5a84ca8946b623a1eb5582210`. SHA256 integral: `d7e73779d4d0eca6a0edd56921c612955f82a564831c9fc6bf05353c1ae0c4b9`. Bytes fonte: 157032. Intervalo byte `[ 26046, 27457 )`, zero-based, fim exclusivo. SHA256 trecho: `6b4a88a0274ae28324f31cd4536e4edec90c816847039c58188a1c40bec55005`.

`````text
{"path":"packages/core/src/atlas.ts","commit":"1cde2ff7a71bcf7aecb5d030917b577165135d38","git_blob_sha":"f6718654785fb155e1bb1b2acb7e9985478b983b","sha256":"4a80f71532a9766f0cfaa67e4a4474ae4d49dbe30a811033ce57a1fb9c58bec4","bytes":16892,"legacy_artifact_key":"s1.core.boundaries","family":"atlas","kind":"implementation","owner":"S1-03","read_depth":"decisive_full_source_read","role":"atlas_host_port","need":"component","artifact":"s1.core.boundaries","serves_needs":["component","flow","ownership","evidence"],"disposition":"included_l1_candidate_with_stated_limits","reason":"Abre superfície pelo projeto/raiz do host, traduz indisponibilidade e prepara indexação/drafting; propõe conteúdo sem atribuir aceite do engine Atlas.","maintenance_trigger":"Reler a folha completa quando identidade, ordem, autoridade, erro ou persistência mudar; limitar engine/caller ao dono nomeado: S1-03; engine Atlas S4.","evidence":[{"id":"B01","first_line":38,"last_line":48},{"id":"B01","first_line":103,"last_line":195},{"id":"B02","first_line":208,"last_line":218},{"id":"B02","first_line":239,"last_line":280},{"id":"B02","first_line":301,"last_line":321}],"capture_path":"sources/packages/core/src/atlas.ts","execution_status":"NOT_RUN","semantic_acceptance":"PENDING_INDEPENDENT_JUDGMENT","read_depth_limit":"Leitura integral da folha de implementação, sem execução ou transferência de garantia externa."}
`````

### POP-B023 — `coverage.jsonl` linhas 23–23

Commit: `LOCAL_CANDIDATE_OR_PROVIDED_INPUT`. Blob: `c95f8432d35a98d5a84ca8946b623a1eb5582210`. SHA256 integral: `d7e73779d4d0eca6a0edd56921c612955f82a564831c9fc6bf05353c1ae0c4b9`. Bytes fonte: 157032. Intervalo byte `[ 27457, 28722 )`, zero-based, fim exclusivo. SHA256 trecho: `38980b082e8211e73cba6bc3be6f8102a9a04da719fe8caf99c2a18e21011782`.

`````text
{"path":"packages/core/src/control-plane/move-session.ts","commit":"1cde2ff7a71bcf7aecb5d030917b577165135d38","git_blob_sha":"49fe728d6956ca1555a763548e9458ea5f3938dc","sha256":"302fd923821d8f2d4124b8e4cca38485abe86c3f3c74e2f0b9bc420b56ec2518","bytes":5381,"legacy_artifact_key":"s1.core.boundaries","family":"control-plane","kind":"implementation","owner":"S1-03","read_depth":"decisive_full_source_read","role":"location_transfer","need":"component","artifact":"s1.core.boundaries","serves_needs":["component","flow","ownership","evidence"],"disposition":"included_l1_candidate_with_stated_limits","reason":"Ordena apply no destino, evento e descarte de origem; falha pós-evento e ausência de coordenação do runner são limites explícitos.","maintenance_trigger":"Reler a folha completa quando identidade, ordem, autoridade, erro ou persistência mudar; limitar engine/caller ao dono nomeado: S1-03; caller Session S1-01.","evidence":[{"id":"B03","first_line":77,"last_line":148}],"capture_path":"sources/packages/core/src/control-plane/move-session.ts","execution_status":"NOT_RUN","semantic_acceptance":"PENDING_INDEPENDENT_JUDGMENT","read_depth_limit":"Leitura integral da folha de implementação, sem execução ou transferência de garantia externa."}
`````

### POP-B024 — `coverage.jsonl` linhas 24–24

Commit: `LOCAL_CANDIDATE_OR_PROVIDED_INPUT`. Blob: `c95f8432d35a98d5a84ca8946b623a1eb5582210`. SHA256 integral: `d7e73779d4d0eca6a0edd56921c612955f82a564831c9fc6bf05353c1ae0c4b9`. Bytes fonte: 157032. Intervalo byte `[ 28722, 29962 )`, zero-based, fim exclusivo. SHA256 trecho: `e94119b048a552925713564b96459541afcafe2556a7922e5bea2935ea37a63a`.

`````text
{"path":"packages/core/src/control-plane/workspace.sql.ts","commit":"1cde2ff7a71bcf7aecb5d030917b577165135d38","git_blob_sha":"ef5195216acf535817143614ccb517ef02197c5f","sha256":"b85701f8a1ee137d04553459849e84e85e191e89641a2f779cf06140b8612cae","bytes":644,"legacy_artifact_key":"s1.core.boundaries","family":"control-plane","kind":"implementation","owner":"S1-03","read_depth":"decisive_full_source_read","role":"workspace_storage_schema","need":"component","artifact":"s1.core.boundaries","serves_needs":["component","flow","ownership","evidence"],"disposition":"included_l1_candidate_with_stated_limits","reason":"Define registro Workspace e relação de projeto; tabela não implementa warp, sync ou execução distribuída.","maintenance_trigger":"Reler a folha completa quando identidade, ordem, autoridade, erro ou persistência mudar; limitar engine/caller ao dono nomeado: S1-03; Location S1-01.","evidence":[{"id":"B04","first_line":1,"last_line":20}],"capture_path":"sources/packages/core/src/control-plane/workspace.sql.ts","execution_status":"NOT_RUN","semantic_acceptance":"PENDING_INDEPENDENT_JUDGMENT","read_depth_limit":"Leitura integral da folha de implementação, sem execução ou transferência de garantia externa."}
`````

### POP-B025 — `coverage.jsonl` linhas 25–25

Commit: `LOCAL_CANDIDATE_OR_PROVIDED_INPUT`. Blob: `c95f8432d35a98d5a84ca8946b623a1eb5582210`. SHA256 integral: `d7e73779d4d0eca6a0edd56921c612955f82a564831c9fc6bf05353c1ae0c4b9`. Bytes fonte: 157032. Intervalo byte `[ 29962, 31239 )`, zero-based, fim exclusivo. SHA256 trecho: `620547bbd4f8f616200bd60403b45f7d90211937f6ba7791a9c32da93439bc21`.

`````text
{"path":"packages/core/src/rag-studio/sql.ts","commit":"1cde2ff7a71bcf7aecb5d030917b577165135d38","git_blob_sha":"214ab3375acc34072ee74c3123501c80615bf488","sha256":"e6c3580d95d86b307624fe8c58b5790f3a07ce17ed20e5cbe851b44667c7add9","bytes":2519,"legacy_artifact_key":"s1.core.boundaries","family":"rag-studio","kind":"implementation","owner":"S1-03","read_depth":"decisive_full_source_read","role":"rag_persistence_schema","need":"component","artifact":"s1.core.boundaries","serves_needs":["component","flow","ownership","evidence"],"disposition":"included_l1_candidate_with_stated_limits","reason":"Distingue fontes/chunks/revisions/traces/pipeline; índices e ausência deliberada de FK não estabelecem retrieval ou embedding.","maintenance_trigger":"Reler a folha completa quando identidade, ordem, autoridade, erro ou persistência mudar; limitar engine/caller ao dono nomeado: S1-03; retrieval/engine S4.","evidence":[{"id":"B05","first_line":1,"last_line":36},{"id":"B05","first_line":38,"last_line":81}],"capture_path":"sources/packages/core/src/rag-studio/sql.ts","execution_status":"NOT_RUN","semantic_acceptance":"PENDING_INDEPENDENT_JUDGMENT","read_depth_limit":"Leitura integral da folha de implementação, sem execução ou transferência de garantia externa."}
`````

### POP-B026 — `coverage.jsonl` linhas 26–26

Commit: `LOCAL_CANDIDATE_OR_PROVIDED_INPUT`. Blob: `c95f8432d35a98d5a84ca8946b623a1eb5582210`. SHA256 integral: `d7e73779d4d0eca6a0edd56921c612955f82a564831c9fc6bf05353c1ae0c4b9`. Bytes fonte: 157032. Intervalo byte `[ 31239, 32522 )`, zero-based, fim exclusivo. SHA256 trecho: `f92a8e0d7eca73e649384fbecaa76c87f6418a7830a884914e289b5eafec2aaa`.

`````text
{"path":"packages/core/src/relay-commands.ts","commit":"1cde2ff7a71bcf7aecb5d030917b577165135d38","git_blob_sha":"e2858f395f7c09e0a2cfb7c5b55a96c073d33926","sha256":"d129efe12ceff333c6f6186a40cc679efcbbacb9b9164c40eea404a89de09b2c","bytes":5046,"legacy_artifact_key":"s1.core.boundaries","family":"relay","kind":"implementation","owner":"S1-03","read_depth":"decisive_full_source_read","role":"command_discovery","need":"component","artifact":"s1.core.boundaries","serves_needs":["component","flow","ownership","evidence"],"disposition":"included_l1_candidate_with_stated_limits","reason":"Lê manifests, lockfiles e pytest limitado para sugestões; classificação heurística não executa nem valida comandos.","maintenance_trigger":"Reler a folha completa quando identidade, ordem, autoridade, erro ou persistência mudar; limitar engine/caller ao dono nomeado: S1-03.","evidence":[{"id":"B06","first_line":7,"last_line":11},{"id":"B06","first_line":25,"last_line":39},{"id":"B06","first_line":75,"last_line":114}],"capture_path":"sources/packages/core/src/relay-commands.ts","execution_status":"NOT_RUN","semantic_acceptance":"PENDING_INDEPENDENT_JUDGMENT","read_depth_limit":"Leitura integral da folha de implementação, sem execução ou transferência de garantia externa."}
`````

### POP-B027 — `coverage.jsonl` linhas 27–27

Commit: `LOCAL_CANDIDATE_OR_PROVIDED_INPUT`. Blob: `c95f8432d35a98d5a84ca8946b623a1eb5582210`. SHA256 integral: `d7e73779d4d0eca6a0edd56921c612955f82a564831c9fc6bf05353c1ae0c4b9`. Bytes fonte: 157032. Intervalo byte `[ 32522, 33957 )`, zero-based, fim exclusivo. SHA256 trecho: `2affa192617113e727d586d77217e2960b99c6ab5269b984b22da71718e1e89a`.

`````text
{"path":"packages/core/src/relay-hook-install.ts","commit":"1cde2ff7a71bcf7aecb5d030917b577165135d38","git_blob_sha":"df1a8ef2e1656d4f2a9a235447c3439fa25fa0f1","sha256":"3663a7a5f1eedca77f66ce09229839aeec433440e2bd23d38fa36957d5e46833","bytes":22715,"legacy_artifact_key":"s1.core.boundaries","family":"relay","kind":"implementation","owner":"S1-03","read_depth":"decisive_full_source_read","role":"hook_install_lifecycle","need":"component","artifact":"s1.core.boundaries","serves_needs":["component","flow","ownership","evidence"],"disposition":"included_l1_candidate_with_stated_limits","reason":"Verifica snapshot/digest/grafo, arquivo e lifecycle; reparo explícito, escrita substitutiva e lock só no processo delimitam autoridade.","maintenance_trigger":"Reler a folha completa quando identidade, ordem, autoridade, erro ou persistência mudar; limitar engine/caller ao dono nomeado: S1-03; publicação pelo host.","evidence":[{"id":"B11","first_line":217,"last_line":252},{"id":"B11","first_line":300,"last_line":410},{"id":"B11","first_line":454,"last_line":474},{"id":"B12","first_line":166,"last_line":194},{"id":"B12","first_line":254,"last_line":295}],"capture_path":"sources/packages/core/src/relay-hook-install.ts","execution_status":"NOT_RUN","semantic_acceptance":"PENDING_INDEPENDENT_JUDGMENT","read_depth_limit":"Leitura integral da folha de implementação, sem execução ou transferência de garantia externa."}
`````

### POP-B028 — `coverage.jsonl` linhas 28–28

Commit: `LOCAL_CANDIDATE_OR_PROVIDED_INPUT`. Blob: `c95f8432d35a98d5a84ca8946b623a1eb5582210`. SHA256 integral: `d7e73779d4d0eca6a0edd56921c612955f82a564831c9fc6bf05353c1ae0c4b9`. Bytes fonte: 157032. Intervalo byte `[ 33957, 35175 )`, zero-based, fim exclusivo. SHA256 trecho: `889b5d76dca75fa6b3b7a391aefb7714954f7648fc09890e008e1cbe36f52e13`.

`````text
{"path":"packages/core/src/relay-hook-recovery.ts","commit":"1cde2ff7a71bcf7aecb5d030917b577165135d38","git_blob_sha":"dac90dd02db4e0382932576d7041bee5142d4067","sha256":"370b5746163de1f543102b3872c76c28331d82084984b2178d2e03127a74cea9","bytes":3787,"legacy_artifact_key":"s1.core.boundaries","family":"relay","kind":"implementation","owner":"S1-03","read_depth":"decisive_full_source_read","role":"hook_local_recovery","need":"component","artifact":"s1.core.boundaries","serves_needs":["component","flow","ownership","evidence"],"disposition":"included_l1_candidate_with_stated_limits","reason":"Recupera decisões só em implicit-local/projeto/diretório exatos; conta tentativas e não garante todos os recibos.","maintenance_trigger":"Reler a folha completa quando identidade, ordem, autoridade, erro ou persistência mudar; limitar engine/caller ao dono nomeado: S1-03; Session S1-01.","evidence":[{"id":"B13","first_line":25,"last_line":88}],"capture_path":"sources/packages/core/src/relay-hook-recovery.ts","execution_status":"NOT_RUN","semantic_acceptance":"PENDING_INDEPENDENT_JUDGMENT","read_depth_limit":"Leitura integral da folha de implementação, sem execução ou transferência de garantia externa."}
`````

### POP-B029 — `coverage.jsonl` linhas 29–29

Commit: `LOCAL_CANDIDATE_OR_PROVIDED_INPUT`. Blob: `c95f8432d35a98d5a84ca8946b623a1eb5582210`. SHA256 integral: `d7e73779d4d0eca6a0edd56921c612955f82a564831c9fc6bf05353c1ae0c4b9`. Bytes fonte: 157032. Intervalo byte `[ 35175, 36429 )`, zero-based, fim exclusivo. SHA256 trecho: `5242ef1fa8dd35603e80b0c77adcce40f699ee42e8d5bcc19b757159cc8c4ddb`.

`````text
{"path":"packages/core/src/relay-hook-shipper.ts","commit":"1cde2ff7a71bcf7aecb5d030917b577165135d38","git_blob_sha":"ab87545ec4552ec2fb5a4f2c1b586e98313ed92a","sha256":"6ce3c6f822f5fa17d8d5f2c1880e0e085365c913db24cd59a4ad2b51b0c6437c","bytes":5723,"legacy_artifact_key":"s1.core.boundaries","family":"relay","kind":"implementation","owner":"S1-03","read_depth":"decisive_full_source_read","role":"hook_receipt_shipping","need":"component","artifact":"s1.core.boundaries","serves_needs":["component","flow","ownership","evidence"],"disposition":"included_l1_candidate_with_stated_limits","reason":"Separa decisão durável de recibo, deduplica por install/ledger e absorve falhas por grupo; inFlight é local ao processo.","maintenance_trigger":"Reler a folha completa quando identidade, ordem, autoridade, erro ou persistência mudar; limitar engine/caller ao dono nomeado: S1-03.","evidence":[{"id":"B14","first_line":26,"last_line":65},{"id":"B14","first_line":67,"last_line":130}],"capture_path":"sources/packages/core/src/relay-hook-shipper.ts","execution_status":"NOT_RUN","semantic_acceptance":"PENDING_INDEPENDENT_JUDGMENT","read_depth_limit":"Leitura integral da folha de implementação, sem execução ou transferência de garantia externa."}
`````

### POP-B030 — `coverage.jsonl` linhas 30–30

Commit: `LOCAL_CANDIDATE_OR_PROVIDED_INPUT`. Blob: `c95f8432d35a98d5a84ca8946b623a1eb5582210`. SHA256 integral: `d7e73779d4d0eca6a0edd56921c612955f82a564831c9fc6bf05353c1ae0c4b9`. Bytes fonte: 157032. Intervalo byte `[ 36429, 37831 )`, zero-based, fim exclusivo. SHA256 trecho: `0fec3c8a661547ca39c3e3b9fa633f02d893427bc8980e2ed0145697d0115cdd`.

`````text
{"path":"packages/core/src/relay-workflow-binding.ts","commit":"1cde2ff7a71bcf7aecb5d030917b577165135d38","git_blob_sha":"7149e276e0c214d70c2dafad90dadff5d2c21059","sha256":"3174f65f835ea0c4ba64c6a597a2169902627b94673cbb1c54cc5e90a414e0e2","bytes":14859,"legacy_artifact_key":"s1.core.boundaries","family":"relay","kind":"implementation","owner":"S1-03","read_depth":"decisive_full_source_read","role":"workflow_publication_binding","need":"component","artifact":"s1.core.boundaries","serves_needs":["component","flow","ownership","evidence"],"disposition":"included_l1_candidate_with_stated_limits","reason":"Adquire publicação/version/skills/âncoras e revalida bytes e identidade; exige resolver/autor quando conhecimento é necessário.","maintenance_trigger":"Reler a folha completa quando identidade, ordem, autoridade, erro ou persistência mudar; limitar engine/caller ao dono nomeado: S1-03; host S1-02/API S1-04; Atlas S4.","evidence":[{"id":"B15","first_line":17,"last_line":48},{"id":"B15","first_line":50,"last_line":75},{"id":"B15","first_line":106,"last_line":147},{"id":"B16","first_line":149,"last_line":261}],"capture_path":"sources/packages/core/src/relay-workflow-binding.ts","execution_status":"NOT_RUN","semantic_acceptance":"PENDING_INDEPENDENT_JUDGMENT","read_depth_limit":"Leitura integral da folha de implementação, sem execução ou transferência de garantia externa."}
`````

### POP-B031 — `coverage.jsonl` linhas 31–31

Commit: `LOCAL_CANDIDATE_OR_PROVIDED_INPUT`. Blob: `c95f8432d35a98d5a84ca8946b623a1eb5582210`. SHA256 integral: `d7e73779d4d0eca6a0edd56921c612955f82a564831c9fc6bf05353c1ae0c4b9`. Bytes fonte: 157032. Intervalo byte `[ 37831, 39109 )`, zero-based, fim exclusivo. SHA256 trecho: `a0a7f095211e66f9a08452f4f67ec6b459a33575bed880d4e6eec9d8d330f776`.

`````text
{"path":"packages/core/src/relay-workflow-currentstep.ts","commit":"1cde2ff7a71bcf7aecb5d030917b577165135d38","git_blob_sha":"c34249dde50c821e405128a148f015775095ac62","sha256":"00b948197cb77d072629820bc844f9ddae0527561e04b4cab9922dd2460e6a22","bytes":8522,"legacy_artifact_key":"s1.core.boundaries","family":"relay","kind":"implementation","owner":"S1-03","read_depth":"decisive_full_source_read","role":"workflow_read_projection","need":"component","artifact":"s1.core.boundaries","serves_needs":["component","flow","ownership","evidence"],"disposition":"included_l1_candidate_with_stated_limits","reason":"Projeta passo atual sem mutação, confere posição/attempt/ledgerSeq e mantém conteúdo de fonte/check como não confiável.","maintenance_trigger":"Reler a folha completa quando identidade, ordem, autoridade, erro ou persistência mudar; limitar engine/caller ao dono nomeado: S1-03.","evidence":[{"id":"B17","first_line":38,"last_line":90},{"id":"B17","first_line":116,"last_line":139}],"capture_path":"sources/packages/core/src/relay-workflow-currentstep.ts","execution_status":"NOT_RUN","semantic_acceptance":"PENDING_INDEPENDENT_JUDGMENT","read_depth_limit":"Leitura integral da folha de implementação, sem execução ou transferência de garantia externa."}
`````

### POP-B032 — `coverage.jsonl` linhas 32–32

Commit: `LOCAL_CANDIDATE_OR_PROVIDED_INPUT`. Blob: `c95f8432d35a98d5a84ca8946b623a1eb5582210`. SHA256 integral: `d7e73779d4d0eca6a0edd56921c612955f82a564831c9fc6bf05353c1ae0c4b9`. Bytes fonte: 157032. Intervalo byte `[ 39109, 40401 )`, zero-based, fim exclusivo. SHA256 trecho: `cef204c2308e9376654529e8d33da9341359d06645b65e60d86c30513682efa8`.

`````text
{"path":"packages/core/src/relay-workflow-evaluator.ts","commit":"1cde2ff7a71bcf7aecb5d030917b577165135d38","git_blob_sha":"898d949b03a82453955e1100335c2150fa51a881","sha256":"eb9862b86f9aa64e34e8f52ae25ac079c6d464da9599433dd34625e620c5138c","bytes":13052,"legacy_artifact_key":"s1.core.boundaries","family":"relay","kind":"implementation","owner":"S1-03","read_depth":"decisive_full_source_read","role":"workflow_native_settlement","need":"component","artifact":"s1.core.boundaries","serves_needs":["component","flow","ownership","evidence"],"disposition":"included_l1_candidate_with_stated_limits","reason":"Exige identidade e recibo autenticado sob lock do engine; reconcilia writes sem regrading, old PASS/JSON sozinho não basta.","maintenance_trigger":"Reler a folha completa quando identidade, ordem, autoridade, erro ou persistência mudar; limitar engine/caller ao dono nomeado: S1-03; engine Relay S3.","evidence":[{"id":"B20","first_line":29,"last_line":125},{"id":"B20","first_line":130,"last_line":208}],"capture_path":"sources/packages/core/src/relay-workflow-evaluator.ts","execution_status":"NOT_RUN","semantic_acceptance":"PENDING_INDEPENDENT_JUDGMENT","read_depth_limit":"Leitura integral da folha de implementação, sem execução ou transferência de garantia externa."}
`````

### POP-B033 — `coverage.jsonl` linhas 33–33

Commit: `LOCAL_CANDIDATE_OR_PROVIDED_INPUT`. Blob: `c95f8432d35a98d5a84ca8946b623a1eb5582210`. SHA256 integral: `d7e73779d4d0eca6a0edd56921c612955f82a564831c9fc6bf05353c1ae0c4b9`. Bytes fonte: 157032. Intervalo byte `[ 40401, 41635 )`, zero-based, fim exclusivo. SHA256 trecho: `b5ff6764d14c1a4d7099c949060a962580cede3b823b6890e37cda7928f4fee5`.

`````text
{"path":"packages/core/src/relay-workflow-session.ts","commit":"1cde2ff7a71bcf7aecb5d030917b577165135d38","git_blob_sha":"fc006686eb25e96aa55cd8b93fc60994ebdd9dfd","sha256":"c5aefaf53fcd61059a68ee2b0411e587f4d125a42fae8169f8846c4d37c70221","bytes":5399,"legacy_artifact_key":"s1.core.boundaries","family":"relay","kind":"implementation","owner":"S1-03","read_depth":"decisive_full_source_read","role":"workflow_session_bridge","need":"component","artifact":"s1.core.boundaries","serves_needs":["component","flow","ownership","evidence"],"disposition":"included_l1_candidate_with_stated_limits","reason":"Liga evento de Session ao host nativo único, recusa binding múltiplo/host ausente e decide continuação por disposition.","maintenance_trigger":"Reler a folha completa quando identidade, ordem, autoridade, erro ou persistência mudar; limitar engine/caller ao dono nomeado: S1-03; Session S1-01.","evidence":[{"id":"B18","first_line":31,"last_line":96}],"capture_path":"sources/packages/core/src/relay-workflow-session.ts","execution_status":"NOT_RUN","semantic_acceptance":"PENDING_INDEPENDENT_JUDGMENT","read_depth_limit":"Leitura integral da folha de implementação, sem execução ou transferência de garantia externa."}
`````

### POP-B034 — `coverage.jsonl` linhas 34–34

Commit: `LOCAL_CANDIDATE_OR_PROVIDED_INPUT`. Blob: `c95f8432d35a98d5a84ca8946b623a1eb5582210`. SHA256 integral: `d7e73779d4d0eca6a0edd56921c612955f82a564831c9fc6bf05353c1ae0c4b9`. Bytes fonte: 157032. Intervalo byte `[ 41635, 42916 )`, zero-based, fim exclusivo. SHA256 trecho: `0a48199945576eee6e9114e6139c7e0077fb92f6a80f36c9bc1a497fb2b2e75d`.

`````text
{"path":"packages/core/src/relay-workflow-transition.ts","commit":"1cde2ff7a71bcf7aecb5d030917b577165135d38","git_blob_sha":"a200d327a4e1f9f7c3b0e7c986f6a848608f6d6b","sha256":"25e53b33dcccd86354775369126f63fcfee5fc89c324d3b7c1e00bd84b0ea28c","bytes":7385,"legacy_artifact_key":"s1.core.boundaries","family":"relay","kind":"implementation","owner":"S1-03","read_depth":"decisive_full_source_read","role":"workflow_checkpoint_fence","need":"component","artifact":"s1.core.boundaries","serves_needs":["component","flow","ownership","evidence"],"disposition":"included_l1_candidate_with_stated_limits","reason":"Persiste fence global antes do checkpoint por assistantMessageID e reconcilia settled/pending com tripla esperada.","maintenance_trigger":"Reler a folha completa quando identidade, ordem, autoridade, erro ou persistência mudar; limitar engine/caller ao dono nomeado: S1-03; engine Relay S3.","evidence":[{"id":"B19","first_line":35,"last_line":99},{"id":"B19","first_line":108,"last_line":125}],"capture_path":"sources/packages/core/src/relay-workflow-transition.ts","execution_status":"NOT_RUN","semantic_acceptance":"PENDING_INDEPENDENT_JUDGMENT","read_depth_limit":"Leitura integral da folha de implementação, sem execução ou transferência de garantia externa."}
`````

### POP-B035 — `coverage.jsonl` linhas 35–35

Commit: `LOCAL_CANDIDATE_OR_PROVIDED_INPUT`. Blob: `c95f8432d35a98d5a84ca8946b623a1eb5582210`. SHA256 integral: `d7e73779d4d0eca6a0edd56921c612955f82a564831c9fc6bf05353c1ae0c4b9`. Bytes fonte: 157032. Intervalo byte `[ 42916, 44500 )`, zero-based, fim exclusivo. SHA256 trecho: `dedbbeb5d1cbd9bc328704b8c4affa7a955bfa8dfd3d3f7345932cc14e56cb32`.

`````text
{"path":"packages/core/src/relay.ts","commit":"1cde2ff7a71bcf7aecb5d030917b577165135d38","git_blob_sha":"25fb509203f933a2e8b0f311c3fc8f9476d53e16","sha256":"446774386bf8020528bdc2138a066fd9dc4b214d3288dc069cb5da9d3cef2b2a","bytes":30225,"legacy_artifact_key":"s1.core.boundaries","family":"relay","kind":"implementation","owner":"S1-03","read_depth":"decisive_full_source_read","role":"relay_host_ports","need":"component","artifact":"s1.core.boundaries","serves_needs":["component","flow","ownership","evidence"],"disposition":"included_l1_candidate_with_stated_limits","reason":"Vincula diretórios, chave, processo/sandbox, gates e trial; aprovação calculada sem registro não se torna pass durável.","maintenance_trigger":"Reler a folha completa quando identidade, ordem, autoridade, erro ou persistência mudar; limitar engine/caller ao dono nomeado: S1-03; Relay S3; sandbox S1-02; Omni S4.","evidence":[{"id":"B07","first_line":184,"last_line":217},{"id":"B07","first_line":568,"last_line":592},{"id":"B07","first_line":611,"last_line":629},{"id":"B08","first_line":219,"last_line":264},{"id":"B08","first_line":267,"last_line":283},{"id":"B09","first_line":319,"last_line":372},{"id":"B10","first_line":374,"last_line":418},{"id":"B10","first_line":420,"last_line":481},{"id":"B10","first_line":491,"last_line":515}],"capture_path":"sources/packages/core/src/relay.ts","execution_status":"NOT_RUN","semantic_acceptance":"PENDING_INDEPENDENT_JUDGMENT","read_depth_limit":"Leitura integral da folha de implementação, sem execução ou transferência de garantia externa."}
`````

### POP-B102 — `coverage.jsonl` linhas 102–102

Commit: `LOCAL_CANDIDATE_OR_PROVIDED_INPUT`. Blob: `c95f8432d35a98d5a84ca8946b623a1eb5582210`. SHA256 integral: `d7e73779d4d0eca6a0edd56921c612955f82a564831c9fc6bf05353c1ae0c4b9`. Bytes fonte: 157032. Intervalo byte `[ 124572, 125792 )`, zero-based, fim exclusivo. SHA256 trecho: `5cd7649bb2abff1b50b5d4f119f4dfa8cad6f9d6bfdb0e17db74bda0e639cbfc`.

`````text
{"path":"packages/core/test/move-session.test.ts","commit":"1cde2ff7a71bcf7aecb5d030917b577165135d38","git_blob_sha":"187f0dd72465af96e8bcebf8242756a88b99228b","sha256":"114b271ad80fb562ccc3965a06beb22476ab6d41fbeb9e430712cc1c9cbac2fa","bytes":11019,"legacy_artifact_key":"s1.core.boundaries","family":"control-plane","kind":"test_code","owner":"S1-03","read_depth":"targeted_test_contract_read","role":"prepared_boundary_test","need":"component","artifact":"s1.core.boundaries","serves_needs":["component","flow","ownership","evidence"],"disposition":"included_l1_candidate_with_stated_limits","reason":"Cenários fonte com Git/DB para transferência, mesmo root e preservação de staged/unrelated; não executados.","maintenance_trigger":"Reler asserções e fixture junto da implementação alterada; só execução autorizada com candidato/caso identifica resultado.","evidence":[{"id":"T01","first_line":83,"last_line":117}],"capture_path":"sources/packages/core/test/move-session.test.ts","execution_status":"NOT_RUN","semantic_acceptance":"PENDING_INDEPENDENT_JUDGMENT","read_depth_limit":"Profundidade declarada do path; agrupamento ou leitura estrutural não significa revisão semântica integral nem PASS."}
`````

### POP-B107 — `coverage.jsonl` linhas 107–107

Commit: `LOCAL_CANDIDATE_OR_PROVIDED_INPUT`. Blob: `c95f8432d35a98d5a84ca8946b623a1eb5582210`. SHA256 integral: `d7e73779d4d0eca6a0edd56921c612955f82a564831c9fc6bf05353c1ae0c4b9`. Bytes fonte: 157032. Intervalo byte `[ 130581, 131766 )`, zero-based, fim exclusivo. SHA256 trecho: `952578989b42bdbe199f693edabb9a022d082bc4670a80c168fd5bb38e8d8963`.

`````text
{"path":"packages/core/test/relay-commands.test.ts","commit":"1cde2ff7a71bcf7aecb5d030917b577165135d38","git_blob_sha":"7d6e9bdf25955bd4a7451db57205638bcfdbff2b","sha256":"899dc3433d30d7e539dbb1b7b6aa38e94528ab30a8b68c508e8170a7bcbe82dd","bytes":2119,"legacy_artifact_key":"s1.core.boundaries","family":"relay","kind":"test_code","owner":"S1-03","read_depth":"full_test_source_read","role":"prepared_boundary_test","need":"component","artifact":"s1.core.boundaries","serves_needs":["component","flow","ownership","evidence"],"disposition":"included_l1_candidate_with_stated_limits","reason":"Asserções de sugestões Bun/Makefile/pytest e diretório vazio; valida intenção do detector, não qualidade do comando sugerido.","maintenance_trigger":"Reler asserções e fixture junto da implementação alterada; só execução autorizada com candidato/caso identifica resultado.","evidence":[],"capture_path":"sources/packages/core/test/relay-commands.test.ts","execution_status":"NOT_RUN","semantic_acceptance":"PENDING_INDEPENDENT_JUDGMENT","read_depth_limit":"Profundidade declarada do path; agrupamento ou leitura estrutural não significa revisão semântica integral nem PASS."}
`````

### POP-B108 — `coverage.jsonl` linhas 108–108

Commit: `LOCAL_CANDIDATE_OR_PROVIDED_INPUT`. Blob: `c95f8432d35a98d5a84ca8946b623a1eb5582210`. SHA256 integral: `d7e73779d4d0eca6a0edd56921c612955f82a564831c9fc6bf05353c1ae0c4b9`. Bytes fonte: 157032. Intervalo byte `[ 131766, 132969 )`, zero-based, fim exclusivo. SHA256 trecho: `aed12a619c2c53f13299b11fed6612bef4ee2593b0e1a21629682dd5efc814fc`.

`````text
{"path":"packages/core/test/relay-hook-install.test.ts","commit":"1cde2ff7a71bcf7aecb5d030917b577165135d38","git_blob_sha":"fb903ba67d4dcfa55bdea704d27435d930a0e823","sha256":"b6cf2cd2727906d64ab13a9ddf308a0d9bab841b233fb355da7f7088b387661f","bytes":30672,"legacy_artifact_key":"s1.core.boundaries","family":"relay","kind":"test_code","owner":"S1-03","read_depth":"targeted_test_contract_read","role":"prepared_boundary_test","need":"component","artifact":"s1.core.boundaries","serves_needs":["component","flow","ownership","evidence"],"disposition":"included_l1_candidate_with_stated_limits","reason":"Asserções de digest, regras de grafo, lifecycle, arquivos inválidos/symlink e falhas/concor­rência de escrita; sem resultado novo.","maintenance_trigger":"Reler asserções e fixture junto da implementação alterada; só execução autorizada com candidato/caso identifica resultado.","evidence":[],"capture_path":"sources/packages/core/test/relay-hook-install.test.ts","execution_status":"NOT_RUN","semantic_acceptance":"PENDING_INDEPENDENT_JUDGMENT","read_depth_limit":"Profundidade declarada do path; agrupamento ou leitura estrutural não significa revisão semântica integral nem PASS."}
`````

### POP-B109 — `coverage.jsonl` linhas 109–109

Commit: `LOCAL_CANDIDATE_OR_PROVIDED_INPUT`. Blob: `c95f8432d35a98d5a84ca8946b623a1eb5582210`. SHA256 integral: `d7e73779d4d0eca6a0edd56921c612955f82a564831c9fc6bf05353c1ae0c4b9`. Bytes fonte: 157032. Intervalo byte `[ 132969, 134190 )`, zero-based, fim exclusivo. SHA256 trecho: `ceae0bf0295b51d04152eb7352bfc3d35adfb1c5eaa6db1a9615bd8fd185cb98`.

`````text
{"path":"packages/core/test/relay-hook-recovery-startup.test.ts","commit":"1cde2ff7a71bcf7aecb5d030917b577165135d38","git_blob_sha":"d7f18c2688d8a35ac2e804777cf510242ce36168","sha256":"37188aa1f6766eee436288c0c7351f0bac0c458eec3c6a16bfe26f60f2a627df","bytes":12611,"legacy_artifact_key":"s1.core.boundaries","family":"relay","kind":"test_code","owner":"S1-03","read_depth":"targeted_test_contract_read","role":"prepared_boundary_test","need":"component","artifact":"s1.core.boundaries","serves_needs":["component","flow","ownership","evidence"],"disposition":"included_l1_candidate_with_stated_limits","reason":"Prepara startup em Location real do harness, finalizer, falha não fatal e explicit-workspace unsupported; não comprova startup atual.","maintenance_trigger":"Reler asserções e fixture junto da implementação alterada; só execução autorizada com candidato/caso identifica resultado.","evidence":[],"capture_path":"sources/packages/core/test/relay-hook-recovery-startup.test.ts","execution_status":"NOT_RUN","semantic_acceptance":"PENDING_INDEPENDENT_JUDGMENT","read_depth_limit":"Profundidade declarada do path; agrupamento ou leitura estrutural não significa revisão semântica integral nem PASS."}
`````

### POP-B110 — `coverage.jsonl` linhas 110–110

Commit: `LOCAL_CANDIDATE_OR_PROVIDED_INPUT`. Blob: `c95f8432d35a98d5a84ca8946b623a1eb5582210`. SHA256 integral: `d7e73779d4d0eca6a0edd56921c612955f82a564831c9fc6bf05353c1ae0c4b9`. Bytes fonte: 157032. Intervalo byte `[ 134190, 135439 )`, zero-based, fim exclusivo. SHA256 trecho: `41c42348824a628fa0910ff5cf3edd1b170fcf93245735811dbf03d444183878`.

`````text
{"path":"packages/core/test/relay-hook-recovery.test.ts","commit":"1cde2ff7a71bcf7aecb5d030917b577165135d38","git_blob_sha":"ec6537a5ab3a4c87acb5d18cfc008673a1a678e5","sha256":"28fb6359ae61921abd52eb9553690d5c357131edb7adfac22ba6d0e956c6d5de","bytes":13978,"legacy_artifact_key":"s1.core.boundaries","family":"relay","kind":"test_code","owner":"S1-03","read_depth":"targeted_test_contract_read","role":"prepared_boundary_test","need":"component","artifact":"s1.core.boundaries","serves_needs":["component","flow","ownership","evidence"],"disposition":"included_l1_candidate_with_stated_limits","reason":"Prepara filtro de projeto/diretório, paginação, órfãos, inFlight, falha/retry e workspace explícito; fonte de caso, não recibo.","maintenance_trigger":"Reler asserções e fixture junto da implementação alterada; só execução autorizada com candidato/caso identifica resultado.","evidence":[{"id":"T03","first_line":211,"last_line":249}],"capture_path":"sources/packages/core/test/relay-hook-recovery.test.ts","execution_status":"NOT_RUN","semantic_acceptance":"PENDING_INDEPENDENT_JUDGMENT","read_depth_limit":"Profundidade declarada do path; agrupamento ou leitura estrutural não significa revisão semântica integral nem PASS."}
`````

### POP-B111 — `coverage.jsonl` linhas 111–111

Commit: `LOCAL_CANDIDATE_OR_PROVIDED_INPUT`. Blob: `c95f8432d35a98d5a84ca8946b623a1eb5582210`. SHA256 integral: `d7e73779d4d0eca6a0edd56921c612955f82a564831c9fc6bf05353c1ae0c4b9`. Bytes fonte: 157032. Intervalo byte `[ 135439, 136636 )`, zero-based, fim exclusivo. SHA256 trecho: `23c8cbb5395962774e4f23a1f530690934b59856d9f0796bb75c599e8828fd50`.

`````text
{"path":"packages/core/test/relay-hook-session.test.ts","commit":"1cde2ff7a71bcf7aecb5d030917b577165135d38","git_blob_sha":"9bbd6f9e04e42d430d787551b0c817ae752cd4fa","sha256":"0b3d9c08be21fdb3a10dac2c9edc06fe0b03289bac0b18ce419607bb045abca7","bytes":20657,"legacy_artifact_key":"s1.core.boundaries","family":"relay","kind":"test_code","owner":"S1-03","read_depth":"targeted_test_contract_read","role":"prepared_boundary_test","need":"component","artifact":"s1.core.boundaries","serves_needs":["component","flow","ownership","evidence"],"disposition":"included_l1_candidate_with_stated_limits","reason":"Prepara block/approve nos boundaries de sessão/ferramenta e retry exato; aceitação depende da execução e identidade do caso.","maintenance_trigger":"Reler asserções e fixture junto da implementação alterada; só execução autorizada com candidato/caso identifica resultado.","evidence":[],"capture_path":"sources/packages/core/test/relay-hook-session.test.ts","execution_status":"NOT_RUN","semantic_acceptance":"PENDING_INDEPENDENT_JUDGMENT","read_depth_limit":"Profundidade declarada do path; agrupamento ou leitura estrutural não significa revisão semântica integral nem PASS."}
`````

### POP-B112 — `coverage.jsonl` linhas 112–112

Commit: `LOCAL_CANDIDATE_OR_PROVIDED_INPUT`. Blob: `c95f8432d35a98d5a84ca8946b623a1eb5582210`. SHA256 integral: `d7e73779d4d0eca6a0edd56921c612955f82a564831c9fc6bf05353c1ae0c4b9`. Bytes fonte: 157032. Intervalo byte `[ 136636, 137829 )`, zero-based, fim exclusivo. SHA256 trecho: `3f9c563b6983ec17aa164a2f3bee32136bbcd9871c2b901680719ba6d50bfe91`.

`````text
{"path":"packages/core/test/relay-hook-shipper.test.ts","commit":"1cde2ff7a71bcf7aecb5d030917b577165135d38","git_blob_sha":"4d80ef6db7a101281c5c34a26ff105ec099473b2","sha256":"37be7a11d5c201cfae2f241f66d11042332e1e6d9c572624e1090b76d1434d10","bytes":16675,"legacy_artifact_key":"s1.core.boundaries","family":"relay","kind":"test_code","owner":"S1-03","read_depth":"targeted_test_contract_read","role":"prepared_boundary_test","need":"component","artifact":"s1.core.boundaries","serves_needs":["component","flow","ownership","evidence"],"disposition":"included_l1_candidate_with_stated_limits","reason":"Prepara deferred receipt, deduplicação, inFlight e falha por install sem apagar decisões; não atesta shipping neste host.","maintenance_trigger":"Reler asserções e fixture junto da implementação alterada; só execução autorizada com candidato/caso identifica resultado.","evidence":[],"capture_path":"sources/packages/core/test/relay-hook-shipper.test.ts","execution_status":"NOT_RUN","semantic_acceptance":"PENDING_INDEPENDENT_JUDGMENT","read_depth_limit":"Profundidade declarada do path; agrupamento ou leitura estrutural não significa revisão semântica integral nem PASS."}
`````

### POP-B113 — `coverage.jsonl` linhas 113–113

Commit: `LOCAL_CANDIDATE_OR_PROVIDED_INPUT`. Blob: `c95f8432d35a98d5a84ca8946b623a1eb5582210`. SHA256 integral: `d7e73779d4d0eca6a0edd56921c612955f82a564831c9fc6bf05353c1ae0c4b9`. Bytes fonte: 157032. Intervalo byte `[ 137829, 139040 )`, zero-based, fim exclusivo. SHA256 trecho: `a3390041624a044a2b989726e39e8da5b4dd842b39da89f902c462579eb5b0ff`.

`````text
{"path":"packages/core/test/relay-workflow-binding.test.ts","commit":"1cde2ff7a71bcf7aecb5d030917b577165135d38","git_blob_sha":"6205649eb98d965768999475a475a4578b15f0e9","sha256":"7205cb7c76733f23dcec5d98b3f9fcb7413d494272627d8b1007a38ae681fc8c","bytes":35647,"legacy_artifact_key":"s1.core.boundaries","family":"relay","kind":"test_code","owner":"S1-03","read_depth":"targeted_test_contract_read","role":"prepared_boundary_test","need":"component","artifact":"s1.core.boundaries","serves_needs":["component","flow","ownership","evidence"],"disposition":"included_l1_candidate_with_stated_limits","reason":"Prepara publicação/checksum/materialização/skills/âncoras, read-only currentStep e holder; não transfere aceite de Atlas ou host.","maintenance_trigger":"Reler asserções e fixture junto da implementação alterada; só execução autorizada com candidato/caso identifica resultado.","evidence":[],"capture_path":"sources/packages/core/test/relay-workflow-binding.test.ts","execution_status":"NOT_RUN","semantic_acceptance":"PENDING_INDEPENDENT_JUDGMENT","read_depth_limit":"Profundidade declarada do path; agrupamento ou leitura estrutural não significa revisão semântica integral nem PASS."}
`````

### POP-B114 — `coverage.jsonl` linhas 114–114

Commit: `LOCAL_CANDIDATE_OR_PROVIDED_INPUT`. Blob: `c95f8432d35a98d5a84ca8946b623a1eb5582210`. SHA256 integral: `d7e73779d4d0eca6a0edd56921c612955f82a564831c9fc6bf05353c1ae0c4b9`. Bytes fonte: 157032. Intervalo byte `[ 139040, 140356 )`, zero-based, fim exclusivo. SHA256 trecho: `932811644e37f03cf88d6517d482909aee23f66dcff411398088f7b5268e48cd`.

`````text
{"path":"packages/core/test/relay-workflow-evaluator.test.ts","commit":"1cde2ff7a71bcf7aecb5d030917b577165135d38","git_blob_sha":"1bb5b9805043d297395a551d6e10a679cfb1c94e","sha256":"42c3b75989f047a24903de8aba524a56099fa228652cb48e364f517f69d299b3","bytes":17132,"legacy_artifact_key":"s1.core.boundaries","family":"relay","kind":"test_code","owner":"S1-03","read_depth":"targeted_test_contract_read","role":"prepared_boundary_test","need":"component","artifact":"s1.core.boundaries","serves_needs":["component","flow","ownership","evidence"],"disposition":"included_l1_candidate_with_stated_limits","reason":"Asserções sobre duplicate settlement, signed receipt, partial repair, old PASS, HMAC e lock; sem execução, não são qualificação do engine.","maintenance_trigger":"Reler asserções e fixture junto da implementação alterada; só execução autorizada com candidato/caso identifica resultado.","evidence":[{"id":"T02","first_line":89,"last_line":126},{"id":"T02","first_line":162,"last_line":190}],"capture_path":"sources/packages/core/test/relay-workflow-evaluator.test.ts","execution_status":"NOT_RUN","semantic_acceptance":"PENDING_INDEPENDENT_JUDGMENT","read_depth_limit":"Profundidade declarada do path; agrupamento ou leitura estrutural não significa revisão semântica integral nem PASS."}
`````

### POP-B115 — `coverage.jsonl` linhas 115–115

Commit: `LOCAL_CANDIDATE_OR_PROVIDED_INPUT`. Blob: `c95f8432d35a98d5a84ca8946b623a1eb5582210`. SHA256 integral: `d7e73779d4d0eca6a0edd56921c612955f82a564831c9fc6bf05353c1ae0c4b9`. Bytes fonte: 157032. Intervalo byte `[ 140356, 141537 )`, zero-based, fim exclusivo. SHA256 trecho: `c891480033e060c8446a91eff16d4646116d634e283f6f2b6c8dc0a43b054cc7`.

`````text
{"path":"packages/core/test/relay.test.ts","commit":"1cde2ff7a71bcf7aecb5d030917b577165135d38","git_blob_sha":"3acdc0d11e60ed2119059ac59eab60184a341795","sha256":"e54d1c70ad6dc2affe31ac1f8ea231acb5745664eb9e724f3d8df76d22e0118f","bytes":28130,"legacy_artifact_key":"s1.core.boundaries","family":"relay","kind":"test_code","owner":"S1-03","read_depth":"targeted_test_contract_read","role":"prepared_boundary_test","need":"component","artifact":"s1.core.boundaries","serves_needs":["component","flow","ownership","evidence"],"disposition":"included_l1_candidate_with_stated_limits","reason":"Asserções sobre paths/chave, ambiente/timeout, semáforo, judge config e locks; distinguir cada caso de garantia universal de plataforma.","maintenance_trigger":"Reler asserções e fixture junto da implementação alterada; só execução autorizada com candidato/caso identifica resultado.","evidence":[],"capture_path":"sources/packages/core/test/relay.test.ts","execution_status":"NOT_RUN","semantic_acceptance":"PENDING_INDEPENDENT_JUDGMENT","read_depth_limit":"Profundidade declarada do path; agrupamento ou leitura estrutural não significa revisão semântica integral nem PASS."}
`````

## Relação exata das 104 fontes locais de suporte

Esta tabela é projeção determinística de campos do mesmo JSONL, sem substituir seus bytes. Os valores de path, profundidade, role e rationale vêm das entradas originais. Ela poderá ser reutilizada no lote de suporte sem repetir o censo. Nenhuma linha afirma PASS.

| Path | Read depth / role | Rationale original |
|---|---|---|
| `docs/architecture/phase-plans/70-90-briefs/EXP-CORE.md` | `historical_plan_full_read` / `historical_context` | Card mecânico de exports no baseline histórico; confrontado com os 437 exports atuais, sem transformar a meta antiga em censo vigente. |
| `docs/architecture/phase-plans/70-90-briefs/RD-CTRLPLANE.md` | `historical_plan_full_read` / `historical_context` | Card de README/retirada de control plane legado; serve para entender intenção e localizar contratos atuais, não para provar implementação. |
| `docs/architecture/phase-plans/70-90-briefs/RD-SESSION.md` | `historical_plan_full_read` / `historical_context` | Card histórico sobre admissão/execução/persistência de Session; navega para S1-01 e conserva sua época. |
| `docs/specs/runtime-closure/ARCHIE-QUALIFICATION.md` | `historical_qualification_targeted_read` / `historical_context` | Recibos e candidatos do recorte Archie com exclusões explícitas; não repassa aprovação a dual V2, W6 ou plataformas fora do recorte. |
| `docs/specs/runtime-closure/CHECKPOINT.md` | `historical_qualification_targeted_read` / `historical_context` | Checkpoint de casos/candidatos anteriores, com CI integral/plataformas ainda limitadas; não é recibo do pin atual. |
| `docs/specs/runtime-closure/PLAN.md` | `historical_plan_targeted_read` / `historical_context` | Plano de closure CLI/WSL/SDK/Nix/OAuth, invariantes e WPs; ações e observações são intenção contextual, não resultados novos. |
| `docs/specs/runtime-closure/PRODUCER-BOUNDARY.md` | `historical_contract_full_read` / `historical_context` | Preserva exceção humana de namespace controlado e controles de produtor, excluindo adversário same-UID; não concede permissão nesta execução. |
| `docs/specs/runtime-closure/SNAPSHOT-QUALIFICATION.md` | `historical_qualification_targeted_read` / `historical_context` | Comparação datada de updater/snapshot com candidatos e limitações; medir um caminho não fecha todas as capacidades/plataformas. |
| `docs/specs/runtime-closure/WAVE-2.md` | `historical_plan_targeted_read` / `historical_context` | Cadência e owners da onda, preparação e conclusões específicas; não confundir harness preparado/falho com runtime efetivamente exercido. |
| `docs/specs/v2/api.html` | `documentation_targeted_read` / `documentation_context` | Mapa visual de rotas/contextos com discussão pendente e vocabulário immediate/deferred histórico; contrato vigente requer S1-04 e Session. |
| `docs/specs/v2/schema-changelog.md` | `documentation_targeted_read` / `documentation_context` | Registro datado de schemas/compatibilidade e direção de manutenção; cada mudança exige fonte atual, sem herdar comportamento por narrativa histórica. |
| `docs/specs/v2/todo.md` | `documentation_full_read` / `documentation_context` | Backlog e decisões de rebuild; distingue replay de evento de recuperação provider pós-crash, sem declarar toda lacuna ainda aberta hoje. |
| `packages/core/bunfig.toml` | `configuration_full_read` / `package_support` | Declara preloads de guard/controle Omni/Core; é configuração do harness, não autorização nem resultado de teste. |
| `packages/core/drizzle.config.ts` | `configuration_full_read` / `package_support` | Configura dialect/globs/output de geração SQLite; dbCredentials de tooling não define localização runtime universal. |
| `packages/core/package.json` | `manifest_structural_and_targeted_read` / `package_support` | 437 exports explícitos sem bare/wildcard, scripts e dependências; distingue folhas produtivas e helpers de teste e identifica os entry points reais. |
| `packages/core/README.md` | `documentation_full_read` / `package_support` | Entrada pública e direção Schema/Protocol→Core→Server, composição e geradores oficiais; intenção de arquitetura não prova todas as folhas. |
| `packages/core/schema.json` | `generated_json_structural_read` / `package_support` | Snapshot SQLite formato7 com ddl/IDs e 63 tabelas contado estruturalmente; manter via migration generator, não editar snapshot manualmente. |
| `packages/core/script/fix-node-pty.ts` | `maintenance_source_full_read` / `package_support` | Ajusta bit executável de spawn-helper existente fora Windows; não comprova execução de PTY ou sandbox. |
| `packages/core/script/migration.ts` | `maintenance_source_full_read` / `package_support` | Gera migration/snapshot/schema/registry com ordem e --check, sem overwrite de nome; preserva caminho oficial e história de migrations. |
| `packages/core/script/toolkit-floors.ts` | `maintenance_source_targeted_read` / `package_support` | Parser de formatos binários/download/digest e comparação de floors; inspeção estática limitada, sem qualificação de execução ou plataforma. |
| `packages/core/script/toolkit-pack.ts` | `maintenance_source_targeted_read` / `package_support` | Scaffolding/skills/pins de toolkit e recipes; TODO-PIN não resolvido permanece limite e gerador pertence aos donos de suas saídas. |
| `packages/core/test/background-job.test.ts` | `support_targeted_structure_contract_read` / `jobs` | Observações de job process-local, metadata durable=false, começo/finalização/escopo e falha prévia; não demonstra durable execution. |
| `packages/core/test/bun-test-timeout.test.ts` | `support_targeted_structure_contract_read` / `ci` | Prepara subprocesso Bun com prazo e contrato de preload; sem executar, não prova deadline real do runner. |
| `packages/core/test/distribution-bundle-boundaries.test.ts` | `support_targeted_structure_contract_read` / `distribution` | Usa cargo/logs sintéticos ORCHESTRATION-ONLY para argv/cwd/ordem/falha; não é qualificação nativa. |
| `packages/core/test/distribution-bundle-deno.test.ts` | `support_targeted_structure_contract_read` / `distribution` | Prepara admission/parser/arquivos e HTTP local para versão/checksum/aborto do bundle Deno; não prova release remota instalada. |
| `packages/core/test/distribution-bundle-execution.test.ts` | `support_targeted_structure_contract_read` / `distribution` | AppProcess real no harness e Bun fake na borda de shell; verifica protocolo/argv/logs em fonte sem transferir native PASS. |
| `packages/core/test/distribution-bundle-gates.ts` | `support_targeted_structure_contract_read` / `distribution` | Parser exige recibos de teste nativo e resultado cargo não vazio/sem ignored; texto reconhecido só vale com origem real do job. |
| `packages/core/test/distribution-bundle-workflow.test.ts` | `support_targeted_structure_contract_read` / `distribution` | Lê YAML e seletores do workflow e prepara mutation cases; não executa o próprio workflow. |
| `packages/core/test/fixture/actions-cli.ts` | `support_targeted_structure_contract_read` / `actions` | CLI de protocolo por reply.json e captura de argv/stdin; respostas são controladas, não gh/glab reais autenticados. |
| `packages/core/test/fixture/actions-http.ts` | `support_targeted_structure_contract_read` / `actions` | Compõe AppProcess, transporte e servidor de rede fixture para contrato HTTP; sem compatibilidade live-provider inferida. |
| `packages/core/test/fixture/actions-network.ts` | `support_targeted_structure_contract_read` / `actions` | Rede TLS/HTTP local de baixo nível para controlar chunks e callbacks; manutenção acompanha limites de transporte e cleanup. |
| `packages/core/test/fixture/actions-resource-runtime.ts` | `support_targeted_structure_contract_read` / `actions` | Servidor loopback de recursos/GraphQL GitLab com commits/runners/cache sintéticos; não observa conta remota. |
| `packages/core/test/fixture/actions-transport.ts` | `support_source_full_read` / `actions` | Transporte real exige raw spawn e falha nos caminhos run/runStream; prepara respostas, ambiente e tokens sintéticos. |
| `packages/core/test/fixture/board-queue.ts` | `support_targeted_structure_contract_read` / `actions` | Git real com GitHub/renderer/gates sintéticos; registro scoped-pass inserido pela fixture não é recibo CI. |
| `packages/core/test/fixture/capability-artifacts.ts` | `support_targeted_structure_contract_read` / `capability` | Compõe DB/Event/host e diretórios isolados para artefato/policy; bytes/metadados de exemplo não são artefatos publicados reais. |
| `packages/core/test/fixture/capability-channel.ts` | `support_targeted_structure_contract_read` / `capability` | Compõe canais/conexões/jobs com tokens e respostas sintéticos, mutações e falhas de fase controladas; não contata Slack/Discord. |
| `packages/core/test/fixture/capability-children.ts` | `support_targeted_structure_contract_read` / `capability` | Compõe Invocation/ToolRegistry/child storage e registra ferramenta controlada sob contexto canônico; não cria execução autônoma real aqui. |
| `packages/core/test/fixture/capability-connection-management.ts` | `support_targeted_structure_contract_read` / `capability` | Exige factory real do Store, falhando se ausente; semeadura de placement/credenciais é sintética para testar autoridade. |
| `packages/core/test/fixture/capability-connection-setup-sql.ts` | `support_targeted_structure_contract_read` / `capability` | Instrumenta SQL/reserva reais no harness e conta tentativas inclusive rollback; exige controle INSERT autorizado do próprio caso. |
| `packages/core/test/fixture/capability-connection-setup.ts` | `support_targeted_structure_contract_read` / `capability` | Usa factories reais de setup/verificação/request e provider local controlado; observa writer state/redação sem revelar credencial real. |
| `packages/core/test/fixture/capability-discovery.ts` | `support_targeted_structure_contract_read` / `capability` | Compõe catálogo/discovery/registry com schemas e seleção sintéticos; disclosure/cursores precisam dos casos executados para aceite. |
| `packages/core/test/fixture/capability-mcp.ts` | `support_targeted_structure_contract_read` / `capability` | Prepara seleção/binding/owner, endpoint autorizado e respostas MCP JSON/SSE com token sintético; recurso não escolhe endpoint livremente. |
| `packages/core/test/fixture/capability-policy.ts` | `support_targeted_structure_contract_read` / `capability` | Estabelece regras allow/deny, owner/invocation e eventos de permissão; exemplos de segredo e timestamp são dados de teste. |
| `packages/core/test/fixture/capability-process-control.ts` | `support_targeted_structure_contract_read` / `capability` | Combina registry/processo/DB/Invocation em tempdir e criança controlada; eco de variável sintética não mede vazamento de credencial real. |
| `packages/core/test/fixture/capability-schedule.ts` | `support_source_full_read` / `capability_schedule` | ToolRegistry/settlement e DB reais no fixture, SessionExecution substituído e withRunner proibido; admissão não comprova conclusão. |
| `packages/core/test/fixture/capability-service-call.ts` | `support_targeted_structure_contract_read` / `capability` | Prepara schemas, seleção e corrida de publicação/rotação/retarget/disconnect em serviço controlado; não atesta provedor externo. |
| `packages/core/test/fixture/capability-services.ts` | `support_targeted_structure_contract_read` / `capability` | Compõe services/discovery/connections e limites mutáveis de output; dados/templates isolam divulgação e retenção a testar. |
| `packages/core/test/fixture/distribution-bundle.ts` | `support_targeted_structure_contract_read` / `distribution` | Extrai passos nomeados de YAML e cria fake Bun/commands para ensaio de orquestração; manter rótulo de substituição explícito. |
| `packages/core/test/fixture/effect-flock-worker.ts` | `support_targeted_structure_contract_read` / `process` | Worker usa EffectFlock e protocolo de job/espera para concorrência preparada; não confere lock distribuído automaticamente. |
| `packages/core/test/fixture/flock-worker.ts` | `support_targeted_structure_contract_read` / `process` | Worker Flock com entrada JSON e jobs controlados; seu processo só seria criado por teste autorizado. |
| `packages/core/test/fixture/git.ts` | `support_targeted_structure_contract_read` / `actions` | Helper de repositório Git real isolado para branch/commit/remoto de teste; não altera repositório de produto nesta leitura. |
| `packages/core/test/fixture/github-command-cli.ts` | `support_targeted_structure_contract_read` / `actions` | CLI responde a rotas/argv validados de comando GitHub; não é chamada real a API remota. |
| `packages/core/test/fixture/github-command.ts` | `support_targeted_structure_contract_read` / `actions` | Reusa bindings e wire-shapes de read com comandos/workflows sintéticos; preservar decoder e protocolo juntos. |
| `packages/core/test/fixture/github-read-cli.ts` | `support_targeted_structure_contract_read` / `actions` | Subprocesso de protocolo entrega bytes brutos para decoder de produção; não é implementação alternativa do provider. |
| `packages/core/test/fixture/github-read.ts` | `support_targeted_structure_contract_read` / `actions` | Exemplos oficiais sanitizados de wire-shape e binding/repo/workflow/run; comentário exclui compatibilidade live-provider. |
| `packages/core/test/fixture/location.ts` | `support_targeted_structure_contract_read` / `harness` | Constrói Location/Project controlados a partir de Ref; não resolve projeto real nem garante identidade externa. |
| `packages/core/test/fixture/lsp-stdio-server.js` | `support_targeted_structure_contract_read` / `protocol_fixture` | Servidor mínimo Content-Length/JSON-RPC para initialize/shutdown/exit; não é language server completo. |
| `packages/core/test/fixture/lsp/fake-lsp-server.js` | `support_targeted_structure_contract_read` / `protocol_fixture` | Servidor LSP controlável para registros/diagnósticos/delays; manter correlação do protocolo e estado do fixture. |
| `packages/core/test/fixture/mcp-omni-stdio.ts` | `support_targeted_structure_contract_read` / `protocol_fixture` | Servidor MCP SDK stdio controlável com árvore de processo/stderr/falhas e recursos/prompts; não atesta compatibilidade universal MCP. |
| `packages/core/test/fixture/mcp-session-recovery.ts` | `support_source_full_read` / `protocol_fixture` | Cliente SDK fala com servidor local que expira sessão e entrega replacement; grava posts para observar retry, não serviço externo. |
| `packages/core/test/fixture/monolith-inventory.ts` | `support_targeted_structure_contract_read` / `package_fixture` | Cria workspace/pacotes/fontes sintéticos para scanner de inventário; contagem preparada não é censo do monorepo atual. |
| `packages/core/test/fixture/omni-effect.ts` | `support_source_full_read` / `process` | Reexporta Effect/ManagedRuntime/ChildProcess pela resolução real do Core, mantendo identidade de serviço entre harness e caller. |
| `packages/core/test/fixture/omni-expect.ts` | `support_source_full_read` / `process` | Controle positivo abre expectativa no próprio teste e computa apenas seus spawns; outro teste não satisfaz a declaração. |
| `packages/core/test/fixture/packaged-skills.ts` | `support_targeted_structure_contract_read` / `package_fixture` | Dados UTF-8/CRLF/vazios e bundle de fixture preservam identidade real dos módulos via specifiers AST; não gera pacote de produto aqui. |
| `packages/core/test/fixture/pinned-artifact/tool.zip` | `binary_metadata_strings_or_archive_read` / `binary_fixture` | Archive de regressão conferido por diretório e bytes do membro bin/tool; não executado, não qualifica artefato de distribuição. |
| `packages/core/test/fixture/process-tree.ts` | `support_targeted_structure_contract_read` / `process` | Árvore de descendentes com nonce e birth time por plataforma; PID isolado não é identidade suficiente para a observação. |
| `packages/core/test/fixture/ripgrep-release.ts` | `support_targeted_structure_contract_read` / `package_fixture` | Servidor release local, archives e gates explícitos de ordenação sem depender de tempo; não baixa release real nesta tarefa. |
| `packages/core/test/fixture/scip-alias/core.scip` | `binary_metadata_strings_or_archive_read` / `binary_fixture` | SCIP binário preservado; strings identificam @orchestra/core e símbolos greet/Greeter; sem decodificação semântica completa. |
| `packages/core/test/fixture/scip-alias/orchestra.scip` | `binary_metadata_strings_or_archive_read` / `binary_fixture` | SCIP binário preservado com referência orchestra e @orchestra/core; dado de regressão de alias, não índice atual aceito. |
| `packages/core/test/fixture/sdk-registry.ts` | `support_targeted_structure_contract_read` / `package_fixture` | Servidor de packuments/tarballs locais para Arborist/pacote e cópia plantada que falha se rodar; não usa registry remoto aqui. |
| `packages/core/test/fixture/tmpdir.ts` | `support_source_full_read` / `harness` | Tempdir realpath e cleanup com retries EBUSY delimitados, preservando demais falhas; isolamento de teste, não transação de produto. |
| `packages/core/test/fixture/upstream-arsenal-proof.ts` | `support_targeted_structure_contract_read` / `upstream` | Orquestra subprocesso com snapshot copiado/perturbado e verifica bytes originais; intenção de prova sem execução desta produção. |
| `packages/core/test/fixture/upstream-arsenal-registry.ts` | `support_targeted_structure_contract_read` / `upstream` | Preload instala snapshot de fonte para fresh-process e marca entrada backend; não muda fonte original do produto. |
| `packages/core/test/fixture/upstream-arsenal-runtime.ts` | `support_targeted_structure_contract_read` / `upstream` | Casos usam Arsenal real e perturbam registry missing/nonpure para recusa antes do backend; fonte não equivale a PASS. |
| `packages/core/test/fixture/windows-process-query.ts` | `support_targeted_structure_contract_read` / `process` | Broker/Node nativo, IPC e recibo de fechamento retêm controle dos helpers; implementação extensa lida por contrato/branches pertinentes. |
| `packages/core/test/fixtures/cassandra-dialer_test.go` | `support_targeted_structure_contract_read` / `process` | Casos Go de socket bloqueado/deadline/cancel/CONNECT local; o proxy srt real é reservado ao caso hospedado específico. |
| `packages/core/test/fixtures/cassandra-dialer-linux_test.go` | `support_targeted_structure_contract_read` / `process` | Caso Linux prepara Unix backlog esgotado/EAGAIN para dialer; limite de plataforma é parte da disposição. |
| `packages/core/test/fixtures/recordings/session-runner/openai-chat-streams-text.json` | `support_source_full_read` / `recording_fixture` | Interação HTTP/SSE datada de Chat Completions com chunks/texto/usage; é replay armazenado, não provider pago chamado nesta produção. |
| `packages/core/test/godfile.test.ts` | `support_targeted_structure_contract_read` / `governance` | Asserções do gate de tamanho/LOC e exceções de módulos em repos sintéticos; guard não foi executado sobre o produto atual. |
| `packages/core/test/lib/effect.ts` | `support_source_full_read` / `harness` | Executaria efeitos scoped com logging de Cause, TestClock/live e skip contabilizado; biblioteca do harness não é serviço runtime de produto. |
| `packages/core/test/lib/rejection.ts` | `support_source_full_read` / `harness` | Retorna motivo de rejeição e falha se promise resolver; evita espera nested-loop problemática comentada para Bun/Windows. |
| `packages/core/test/lib/sandbox-host.ts` | `support_source_full_read` / `process` | Consulta jail disponível e trata AppContainer separadamente dos probes Node; não converte fallback/HOLD em enforcement universal. |
| `packages/core/test/lib/tool.ts` | `support_source_full_read` / `harness` | Identidade general não Maestro e helpers de materialize/settle para testar recusa; não fornece identidade privilegiada real. |
| `packages/core/test/maestro-arsenal-package.test.ts` | `support_targeted_structure_contract_read` / `upstream` | Fonte exige pacote Arsenal montado real, sem mock de validators/handlers; examina contrato de catálogo/profile/execute, sem executá-lo. |
| `packages/core/test/maestro-arsenal.test.ts` | `support_targeted_structure_contract_read` / `upstream` | Compõe host DB/Location/registry e identidade Maestro/não-Maestro para permissões/execução; não transfere aceite do backend externo. |
| `packages/core/test/monolith-inventory-source.test.ts` | `support_targeted_structure_contract_read` / `governance` | Asserções distinguem worktree de Git blobs e fingerprint/revision/tree; arquivo legado ausente difere de input inválido. |
| `packages/core/test/monolith-inventory.test.ts` | `support_targeted_structure_contract_read` / `governance` | Casos de Bun/Cargo/assets/pins e erros de manifests para o scanner; censo não equivale a compreensão semântica do conteúdo. |
| `packages/core/test/omni.node-smoke.mjs` | `support_targeted_structure_contract_read` / `process` | Smoke de loader Omni sob Node e um spawn requer addon/supervisor prontos; comando documentado não foi executado. |
| `packages/core/test/output-quarantine.test.ts` | `support_targeted_structure_contract_read` / `governance` | Asserções preparam splits de padrões reconhecidos de segredo, tail limitado e Unicode; não demonstram redator universal de segredos. |
| `packages/core/test/preload.ts` | `support_source_full_read` / `harness` | DB em memória, herança de credenciais desligada e modelos locais/fetch desativado; manter isolamento antes de qualquer teste autorizado. |
| `packages/core/test/process/process.test.ts` | `support_targeted_structure_contract_read` / `process` | Casos de AppProcess para coleta/stream/erro/interrupção/lifetime usam harness e controles; resultados reais continuam não executados. |
| `packages/core/test/rename-guard.test.ts` | `support_targeted_structure_contract_read` / `governance` | Guard repo-wide de nomes com exceções/strings protegidas em ledger; não dá autorização para reescrever frozen research ou evidência. |
| `packages/core/test/setup-bun-cache.test.ts` | `support_targeted_structure_contract_read` / `ci` | Asserções de YAML/chaves/arquitetura e restore/save com hash fixo; GitHub é dono de hashFiles e job real continua ausente aqui. |
| `packages/core/test/shared-schema.test.ts` | `support_targeted_structure_contract_read` / `governance` | Compara identidade de schemas canônicos/Core e construção/decodificação; não revisa semanticamente toda API ou cada export. |
| `packages/core/test/task-governance.test.ts` | `support_targeted_structure_contract_read` / `governance` | Prepara TaskGovernance.allowAll/admit/settle em contexto controlado; não é permissão global para callers reais. |
| `packages/core/test/test-ci-request.test.ts` | `support_targeted_structure_contract_read` / `ci` | Valida parser/seletores/runner/OS/controle e vínculo de nonce em workflow; não dispara CI nem cria recibo observado. |
| `packages/core/test/test-ci-upload.test.ts` | `support_targeted_structure_contract_read` / `ci` | Examina base Git, parsing HTTP/run/ratelimit e paths de request em fixture; não executa gh nem envia trabalho remotamente aqui. |
| `packages/core/test/test-omni-control.test.ts` | `support_targeted_structure_contract_read` / `ci` | Exercitaria preload de controle em diretório temporário com Omni.count substituindo spawn; native lanes precisam controles próprios reais. |
| `packages/core/test/upstream-arsenal.test.ts` | `support_targeted_structure_contract_read` / `upstream` | Casos de operações de authoring/efeitos puros/autoridade no backend Arsenal; nome ou lista congelada não é prova de execução atual. |
| `packages/core/test/upstream-settlement-preservation.test.ts` | `support_targeted_structure_contract_read` / `upstream` | Casos preparados de receipt/updater e preservação de metadata; comentário explicita prepared not executed e não substitui resultado real. |
| `packages/core/test/windows-process-query.hosted.ts` | `support_targeted_structure_contract_read` / `process` | Fonte de prova hospedada exige CI, runtime Node real e lifecycle/identidade; não foi executada no host local. |
| `packages/core/tsconfig.json` | `configuration_full_read` / `package_support` | Configuração TypeScript/Bun e opções de biblioteca/checagem; não é resultado de tsgo. |
| `packages/core/vendor/hugr-lean-0.4.0-0660c2b5dc92.tgz` | `vendored_archive_metadata_and_hash_read` / `package_support` | Tarball pinado preservado, hash/bytes e package.json interno conferidos; código interno completo não recebeu aceite semântico nem foi executado. |
| `packages/core/vendor/README.md` | `documentation_full_read` / `package_support` | Proveniência/commit/tree/digest/licenças e limites de superfície do vendorizado; preservar licença e bytes sem alegar attestation upstream verificada ao vivo. |

## História integral preservada e significado do reuso

O corpo histórico boundaries contém a classificação interpretativa “legacy screen mining”. Ele é preservado como história; a correção v2 não atribui essa palavra ao comentário atual da fonte. As identidades dos históricos permanecem imutáveis. A3/A4/projection são inputs integrais efetivos; os recortes seguintes são somente evidência de leitura para os juízes.

### H-BND — `modules/atlas/docs/design/genesis-chatgpt-results/20261111-v3-fresh/s1/producers/a/bodies/boundaries.md` linhas 1–25

Commit: `a8df22ae3a140c58c63f62ce2a634c84f415c943`. Blob: `7c4b50cdc6f00552c1289c4221855d3120dd6572`. SHA256 integral: `7b20ed7cedf86c24fb1d9c3471250fcddf666f9c66e7de2dba9852df1fa17143`. Bytes fonte: 3905. Intervalo byte `[ 0, 3905 )`, zero-based, fim exclusivo. SHA256 trecho: `7b20ed7cedf86c24fb1d9c3471250fcddf666f9c66e7de2dba9852df1fa17143`.

`````text
# Core adapters to Atlas, Relay and workspace movement

Layer: **L1 — pinned factual basis**. Need: `component`. Scope: `orchestra.s1`.
Source revision: `1cde2ff7a71bcf7aecb5d030917b577165135d38`.

## Observed implementation

The Atlas adapter binds `@orchestra/atlas-boundary/surface` to one store root and trusted project ID. It runs the synchronous boundary calls in process, translating throws to `AtlasSurface.Unavailable`; this can hold the fiber while the boundary walks its tree. A non-repository root uses the active directory; a repository uses its worktree. Territory writes inject project ID on the host side. Delegate handles each interview answer separately and rejects empty replies. The legacy screen mining path caps sites at 200, runs four model calls concurrently, omits failed replies and passes the result to boundary admission; its source says candidates are staged, not promoted. This is a preexisting adapter and is not this Genesis protocol's publication/import path. [1]

The Relay adapter is Location-scoped, stores state under the global data root by project, and defers disk acquisition until needed. `verify` serializes checks, runs the external gate core and records its verdict. A pass that cannot be appended becomes `unavailable/unrecorded`; a failing verdict remains fail. Recovery only considers a run-lock directory older than process start and not held in this process; it appends a recovery note before deleting the lock. This is a conservative local observation, not proof that all other hosts are dead. Workflow-bound progressive arms refuse the generic evaluate path with `WORKFLOW_NATIVE_SETTLEMENT_REQUIRED`; transition uses the native workflow evaluator port. `trial` is separately specified as trusted command execution without grading or ledger passage. [2]

`MoveSession` resolves the destination project and refuses a different project. If moving changes between worktree roots, it captures and applies source changes before publishing `Session.Moved`, then discards the source changes. A later source-reset failure occurs after the destination and Session event may already have changed; the function has no cross-filesystem/event rollback transaction. The inspected function does not itself coordinate an active runner, so caller quiescence must be checked before changing that flow. [3]

RAG Studio's assigned Core file defines source/chunk/revision/question/trace/pipeline tables. Chunks intentionally lack a source foreign key for later orphan cleanup, and this schema has no embedding column or vector table. A declared schema is not a running retrieval engine; the retrieval/pipeline implementation belongs to its module owner. [4]

## Normative intent and gaps

Core owns these adapters and their platform services, while Atlas and Relay modules own their engines and governance semantics. Follow boundary packages for behavior beyond the adapter; do not substitute this source-only L1 for S3/S4 runtime proofs. The inventory preserves Relay workflow/hook helpers, historical runtime-closure documents and control-plane plans as distinct deeper evidence obligations. No Atlas/Relay command, session move, gate, workflow trial or database operation executed.

## Source anchors

- **1.** `packages/core/src/atlas.ts:f6718654785fb155e1bb1b2acb7e9985478b983b` — surface adapter, per-question delegate and legacy mine, lines 41–48,75–148,248–304,318–341.
- **2.** `packages/core/src/relay.ts:25fb509203f933a2e8b0f311c3fc8f9476d53e16` — gate recording, recovery and workflow boundary, lines 120–172,176–217,319–414,473–538.
- **3.** `packages/core/src/control-plane/move-session.ts:49fe728d6956ca1555a763548e9458ea5f3938dc` — project check, change transfer and event ordering, lines 77–148.
- **4.** `packages/core/src/rag-studio/sql.ts:214ab3375acc34072ee74c3123501c80615bf488` — current Core schema boundary, lines 1–81.
`````

### H-ENTRY — `modules/atlas/docs/design/genesis-chatgpt-results/20261111-v3-fresh/s1/producers/a/bodies/entry.md` linhas 1–72

Commit: `a8df22ae3a140c58c63f62ce2a634c84f415c943`. Blob: `894266bd4543763fb1ee2a4dbf0ba749a244ec48`. SHA256 integral: `6a488ca8f9717a497949b71ed41db84d995f23b90c31cc59c22c5bd86239ca6c`. Bytes fonte: 7312. Intervalo byte `[ 0, 7312 )`, zero-based, fim exclusivo. SHA256 trecho: `6a488ca8f9717a497949b71ed41db84d995f23b90c31cc59c22c5bd86239ca6c`.

`````text
# Core L1 entry, authority and complete source-family disposition

Layer: **L1 — pinned factual basis**. Need: `entry`. Scope: `orchestra.s1`.
Source revision: `1cde2ff7a71bcf7aecb5d030917b577165135d38`.

## Scope and factual entry

This is producer A's L1 factual basis for the pinned Core population, prepared for cumulative later understanding. It contains no L2–L4 acceptance claim. Core is the reusable platform/domain package consumed by server, apps, SDK and product modules. The repository README requires Schema → Core and Protocol → Server boundaries, forbids Core importing Client/Server, and declares explicit public subpaths. The captured package manifest has 437 exports, no bare `.` export and no wildcard key; this count was parsed from pinned bytes. Product behavior is exposed through those subpaths and composition ports, not an inferred all-purpose Core entry. [1,2]

Use `session-admission` for identity and accepted input, `session-execution` for active local work, `persistence` for events/database, and `context` for model-visible history. `tools`, `security`, `capability` and `configuration` identify distinct authority boundaries. `project`, `runtime`, `models`, `extensions`, `automation`, `research`, `economy` and `boundaries` describe the remaining coherent Core needs. Those names mean the stable `s1.core.*` keys. Navigation is consultation, not a hidden L1 build dependency.

## Population disposition

The frozen assigned population contains **1,441 entries**. The deterministic coverage ledger lists every path once, with original Git blob, family, kind, read status, depth, reason, need and proposed artifact. It includes **814 Core src entries**, **584 Core test entries**, and **43 other assigned entries**. These are inventory observations from the supplied pinned population, not a fresh remote census. Family counts include source, docs and validation members:

| Family | Assigned entries | L1 artifact entry |
| --- | ---: | --- |
| actions | 155 | `s1.core.automation` |
| agent | 10 | `s1.core.extensions` |
| architecture-history | 9 | `s1.core.entry` |
| atlas | 1 | `s1.core.boundaries` |
| backend-toolkit | 59 | `s1.core.research` |
| board | 38 | `s1.core.automation` |
| capability | 170 | `s1.core.capability` |
| config | 62 | `s1.core.configuration` |
| control-plane | 3 | `s1.core.boundaries` |
| database | 89 | `s1.core.persistence` |
| documentation | 3 | `s1.core.entry` |
| economy | 5 | `s1.core.economy` |
| event | 11 | `s1.core.persistence` |
| identity | 15 | `s1.core.extensions`, `s1.core.security` |
| instruction | 21 | `s1.core.extensions` |
| location | 10 | `s1.core.project` |
| package | 12 | `s1.core.entry` |
| permission | 9 | `s1.core.security` |
| plugin-host | 63 | `s1.core.extensions` |
| process | 58 | `s1.core.runtime` |
| project | 56 | `s1.core.project`, `s1.core.runtime` |
| provider | 76 | `s1.core.models` |
| rag-studio | 1 | `s1.core.boundaries` |
| relay | 19 | `s1.core.boundaries` |
| research | 71 | `s1.core.research` |
| runtime | 41 | `s1.core.runtime` |
| scheduled-task | 11 | `s1.core.automation` |
| session | 90 | `s1.core.context`, `s1.core.models`, `s1.core.persistence`, `s1.core.session-admission`, `s1.core.session-execution` |
| system-context | 11 | `s1.core.context` |
| tool | 114 | `s1.core.extensions`, `s1.core.runtime`, `s1.core.tools` |
| tool-safety | 36 | `s1.core.security` |
| util | 32 | `s1.core.runtime` |
| validation-support | 80 | `s1.core.entry` |

Decisive implementation/control-flow and normative reads back the claims actually made in the other bodies. An unread substantive implementation is explicitly classified `representative_family_boundary`, never silently converted to support or semantic acceptance. Exact operation-specific leaf behavior remains a deeper-read obligation. This bounded L1 grouping covers the entry, authority and lifecycle questions; it does not certify every line of every member.

Historical migrations retain compatibility authority under the inspected migration engine. Generated schema/export/support files remain tied to their generators and owning contracts. The vendored Copilot family remains an upstream compatibility boundary. Tests, fixture trees, assets and harnesses have grouped validation disposition; their existence proves no executed result. Runtime pins and bundled text are change-sensitive inputs even when their leaf content is not interpreted here. Historical phase plans, runtime-closure qualification documents and old V2 sketches are retained as historical/normative inputs to compare with current code, never promoted by filename to current behavior or a fresh PASS. [1,3]

## Source and authority rules

All captured repository bytes came through GitHub connector `fetch_file` at `1cde2ff7a71bcf7aecb5d030917b577165135d38` and are stored unmodified beneath `sources/`. `capture-manifest.json` binds each to commit, observed Git blob, SHA-256 and byte count. Git blob identity was independently recomputed from the bytes. `review-evidence.md` carries exact source slices and an artifact-to-excerpt map. Repository documents are normative/intent evidence only where expressly labeled; executable branches support implementation observations. Conflicts remain visible, including old Bash non-sandbox wording versus conditional confinement, binary read breadth, and per-request rejection guidance versus current rejection fan-out.

Root AGENTS says repo docs and `.orchestra/skills` are not shipped runtime instructions; needed runtime guidance belongs in prompts or shipped seat skills. Its Session rules explicitly keep execution local, context algebra Core-owned and context producers with their domains. The generated module README is useful ownership/navigation evidence but does not override current implementation. [1,3]

## Verification boundary and open work

Performed: connector capture, canonical Git-object/SHA-256/size checks, source inspection, line-anchor reconciliation, per-entry population reconciliation and artifact/excerpt binding checks. No product tests, provider calls, shell tools inside Orchestra, database migrations, external mutations, remote commits or Atlas publication were performed. The producer's local Python only processed evidence and authored this transport fragment. Hash validity is not semantic acceptance; independent judges and principal packaging are separate steps.

Unresolved limits include runtime/OS qualification, unread leaf-specific semantics, native engine/provider boundaries outside Core, historical document reconciliation beyond the cited conflicts, and the observed implementation gaps called out per body. All source-reading status remains visible. This unit is a source-supported L1 candidate, not an accepted complete S1 delivery or live Atlas publication.

## Source anchors

- **1.** `packages/core/README.md:742921238462659e1a5a314f2e0238102c6e9f3a` — public entry, architecture and generated domain inventory, lines 1–88.
- **2.** `packages/core/package.json:8ee8ebb666051c9b5ee0fcd4a54bceb3a2cb3c43` — scripts and explicit exports (437 keys parsed from captured manifest), lines 1–453.
- **3.** `AGENTS.md:ef3b523b0c00aed722582b870c1919188edc4c4f` — shipping, terminal and Session scope instructions, lines 146–154,182–192,207–217.
`````

### H-MANIFEST — `history/manifest.json` linhas 1–73

Commit: `LOCAL_CANDIDATE_OR_PROVIDED_INPUT`. Blob: `7b0c84d78080d4bee3655cbc4e9e8812c98dba65`. SHA256 integral: `05d97ef28360e32115f24dcb5bb764dc013ed2a00a14fb09d0733f767746c87a`. Bytes fonte: 3215. Intervalo byte `[ 0, 3215 )`, zero-based, fim exclusivo. SHA256 trecho: `05d97ef28360e32115f24dcb5bb764dc013ed2a00a14fb09d0733f767746c87a`.

`````text
[
  {
    "commit": "a8df22ae3a140c58c63f62ce2a634c84f415c943",
    "path": "modules/atlas/docs/design/genesis-chatgpt-results/20261111-v3-fresh/s1/producers/a/bodies/boundaries.md",
    "git_blob_sha": "7c4b50cdc6f00552c1289c4221855d3120dd6572",
    "byte_length": 3905,
    "sha256": "7b20ed7cedf86c24fb1d9c3471250fcddf666f9c66e7de2dba9852df1fa17143",
    "artifact_key": "s1.core.boundaries",
    "local_path": "history/boundaries.md",
    "handling": "byte-identical inherited body; not a new accepted version",
    "verified": true
  },
  {
    "commit": "a8df22ae3a140c58c63f62ce2a634c84f415c943",
    "path": "modules/atlas/docs/design/genesis-chatgpt-results/20261111-v3-fresh/s1/producers/a/bodies/entry.md",
    "git_blob_sha": "894266bd4543763fb1ee2a4dbf0ba749a244ec48",
    "byte_length": 7312,
    "sha256": "6a488ca8f9717a497949b71ed41db84d995f23b90c31cc59c22c5bd86239ca6c",
    "artifact_key": "s1.core.entry",
    "local_path": "history/entry.md",
    "handling": "byte-identical inherited body; not a new accepted version",
    "verified": true
  },
  {
    "commit": "a8df22ae3a140c58c63f62ce2a634c84f415c943",
    "path": "modules/atlas/docs/design/genesis-chatgpt-results/20261111-v3-fresh/s1/review-packets/l1-a3-v1-dossier.md",
    "git_blob_sha": "285e56c1680153ce75c71fd99bcf9455bde70d4d",
    "byte_length": 177076,
    "sha256": "36416073165d59eec9c7d847a26f414d855cc2a40758d548f4dd49669dccc5d4",
    "local_path": "history/a3-dossier-selected.md",
    "selection": [
      {
        "first_line": 3395,
        "last_line": 3442,
        "sha256": "f2f241c3451bf6bac571a35f266e77bb784540ae06a07a9351bcf9d1dbcac7c9",
        "bytes": 4900
      }
    ],
    "handling": "literal excerpts, original line ranges; inherited evidence, not new acceptance"
  },
  {
    "commit": "a8df22ae3a140c58c63f62ce2a634c84f415c943",
    "path": "modules/atlas/docs/design/genesis-chatgpt-results/20261111-v3-fresh/s1/review-packets/l1-a4-v1-dossier.md",
    "git_blob_sha": "6f872ea0e22097d8084fd587f585751a436f607e",
    "byte_length": 155061,
    "sha256": "83b544ac46f99b2bf3585ff4e607bcd403e49eb20dd128deb5b6a029a772ead0",
    "local_path": "history/a4-dossier-selected.md",
    "selection": [
      {
        "first_line": 2134,
        "last_line": 2202,
        "sha256": "40fec05b8e78a4219fcaaceb0c7ad9b19fab5959ae42f3c27b0091044287f542",
        "bytes": 4539
      },
      {
        "first_line": 2757,
        "last_line": 2989,
        "sha256": "3fdcba7fe96a24ef7ad6cfc3ba3f4ef6b9c3ce28a075b5555aa9fd54bab43cc4",
        "bytes": 14713
      }
    ],
    "handling": "literal excerpts, original line ranges; inherited evidence, not new acceptance"
  },
  {
    "commit": "a8df22ae3a140c58c63f62ce2a634c84f415c943",
    "path": "modules/atlas/docs/design/genesis-chatgpt-results/20261111-v3-fresh/s1/revisions/a-l1-evidence-v1/coverage-needs-projection.json",
    "git_blob_sha": "2e91d0f916dfa95a2dd0ef7ae74ff8c1bb427045",
    "byte_length": 726892,
    "sha256": "05485c4bd0ac9c76814e44537788818bbcf1fbcbfb87dd8063ce30bf1a67e0cf",
    "local_path": "history/coverage-needs-selected.json",
    "handling": "exact JSON records selected; whitespace of original projection not retained"
  }
]
`````

### H-A3-1 — `modules/atlas/docs/design/genesis-chatgpt-results/20261111-v3-fresh/s1/review-packets/l1-a3-v1-dossier.md` linhas 3395–3408

Commit: `a8df22ae3a140c58c63f62ce2a634c84f415c943`. Blob: `285e56c1680153ce75c71fd99bcf9455bde70d4d`. SHA256 integral: `36416073165d59eec9c7d847a26f414d855cc2a40758d548f4dd49669dccc5d4`. Bytes fonte: 177076. Intervalo byte `[ 172176, 173006 )`, zero-based, fim exclusivo. SHA256 trecho: `36c75c1722ab35ca398305c8800fd9f7da40154f68fa49571f9f3b0b08cbfb80`.

`````text
### AEX095

**Artifacts:** `s1.core.entry`, `s1.core.models`.

**Claim/limit supported:** The repository owner inventory places provider/vendor, utilities and data contracts under Core; this is navigation/ownership intent, not acceptance of every member.

**Authority:** `repository_normative_documentation`. **Source:** `packages/core/README.md:742921238462659e1a5a314f2e0238102c6e9f3a`, lines 54–88.

**Source commit:** `1cde2ff7a71bcf7aecb5d030917b577165135d38`; **full source SHA256:** `e74885e18e96297fd931989505937559ecbdce42c595cf8846411d4f0c4de324`; **excerpt SHA256:** `ecd892d2c5f5d48c4388e6b41bda4339921a4e300c33058212e1fd8be7e94f67` (4223 bytes).

````text
- Owner: core platform maintainer
- Public entry: explicit `exports` in package.json
- Legacy and compatibility: `packages/core/src/github-copilot` (vendored)
`````

### H-A4-1 — `modules/atlas/docs/design/genesis-chatgpt-results/20261111-v3-fresh/s1/review-packets/l1-a4-v1-dossier.md` linhas 2134–2150

Commit: `a8df22ae3a140c58c63f62ce2a634c84f415c943`. Blob: `6f872ea0e22097d8084fd587f585751a436f607e`. SHA256 integral: `83b544ac46f99b2bf3585ff4e607bcd403e49eb20dd128deb5b6a029a772ead0`. Bytes fonte: 155061. Intervalo byte `[ 107999, 109118 )`, zero-based, fim exclusivo. SHA256 trecho: `cfb42e212bfbd02862376c1cea672080dc129fbdbc4c89ed4b4e54a3e6d7dcd5`.

`````text
### AEX015

**Artifacts:** `s1.core.persistence`, `s1.core.entry`.

**Claim/limit supported:** Database path, ordered migration identity and generated schema maintenance are user-data/maintenance contracts; history cannot be discarded.

**Authority:** `repository_normative_documentation`. **Source:** `packages/core/src/database/README.md:272a4d3d363f4871b5288d8fb879b9d9b9710d65`, lines 7–38.

**Source commit:** `1cde2ff7a71bcf7aecb5d030917b577165135d38`; **full source SHA256:** `5bd3a917366391323a94bec85ace411f4d8ce1ee098a4ea062bd2f75b1fcaf83`; **excerpt SHA256:** `db62b7d84b0e3928ee3804010a04e6276f17fce37d970474f545aedc071c4191` (2079 bytes).

````text
- `database.ts` opens the database in WAL mode and picks its path. `sqlite.ts` is the driver interface, with `sqlite.bun.ts` and `sqlite.node.ts` as the two implementations.
- `migration.ts` runs the migrations listed in `migration.gen.ts`; the migration bodies are in `packages/core/src/database/migration`.
- `schema.sql.ts` holds the tables owned by this folder; other domains define their own in `sql.ts` files.

## Public entry points and consumers

`````

### H-A4-2 — `modules/atlas/docs/design/genesis-chatgpt-results/20261111-v3-fresh/s1/review-packets/l1-a4-v1-dossier.md` linhas 2180–2195

Commit: `a8df22ae3a140c58c63f62ce2a634c84f415c943`. Blob: `6f872ea0e22097d8084fd587f585751a436f607e`. SHA256 integral: `83b544ac46f99b2bf3585ff4e607bcd403e49eb20dd128deb5b6a029a772ead0`. Bytes fonte: 155061. Intervalo byte `[ 110749, 111851 )`, zero-based, fim exclusivo. SHA256 trecho: `de354275562af2a7b7f181b6aa675cfd891e787b6de3100234b3a776dfefd8e4`.

`````text
### AEX046

**Artifacts:** `s1.core.security`, `s1.core.entry`.

**Claim/limit supported:** Current terminal instructions require the sandbox-before-PTY ordering and exact environment boundary.

**Authority:** `repository_normative_documentation`. **Source:** `AGENTS.md:ef3b523b0c00aed722582b870c1919188edc4c4f`, lines 182–192.

**Source commit:** `1cde2ff7a71bcf7aecb5d030917b577165135d38`; **full source SHA256:** `07acaefb95db4b07b4e76c4255f7d6e0ecc4c7466b46fbf6ec5e5cdf6cc01b4f`; **excerpt SHA256:** `4f5b2378f8eb397a98a143b26af09bf856f0a06ad9204f8567ae8beda212ffab` (1186 bytes).

````text
## Terminal and PTY

Background: `docs/specs/terminal/`; ownership and traps: `.orchestra/skills/terminal-maintenance`.

- The agent terminal exists only in the V2 session core's bash tool (`packages/core`). The agent runs a bash command in a PTY only through `AgentTerminal.run` (`packages/core/src/tool/agent-terminal.ts`) inside the bash tool, after `ToolSafetySandbox.wrap`. Never build an agent PTY from `Pty.create` with the default environment, which inherits `process.env` and skips the sandbox.
`````

### H-A4-3 — `modules/atlas/docs/design/genesis-chatgpt-results/20261111-v3-fresh/s1/review-packets/l1-a4-v1-dossier.md` linhas 2757–2772

Commit: `a8df22ae3a140c58c63f62ce2a634c84f415c943`. Blob: `6f872ea0e22097d8084fd587f585751a436f607e`. SHA256 integral: `83b544ac46f99b2bf3585ff4e607bcd403e49eb20dd128deb5b6a029a772ead0`. Bytes fonte: 155061. Intervalo byte `[ 140347, 141341 )`, zero-based, fim exclusivo. SHA256 trecho: `d4b3458c4b570dce95ff4276e942bd603df71d3110e0d7af062c16591245c144`.

`````text
### AEX093

**Artifacts:** `s1.core.boundaries`.

**Claim/limit supported:** Move applies captured changes, then publishes Session.Moved, then discards source changes with a distinct later failure; no cross-filesystem/event rollback appears in this function.

**Authority:** `observed_implementation`. **Source:** `packages/core/src/control-plane/move-session.ts:49fe728d6956ca1555a763548e9458ea5f3938dc`, lines 83–138.

**Source commit:** `1cde2ff7a71bcf7aecb5d030917b577165135d38`; **full source SHA256:** `302fd923821d8f2d4124b8e4cca38485abe86c3f3c74e2f0b9bc420b56ec2518`; **excerpt SHA256:** `0bf7650e1460727e2eadbf9006d079aae8f164dea4c4a3e62ffdf442ea2ad790` (2427 bytes).

````text
      const source = yield* project.resolve(current.location.directory)
      const destination = yield* project.resolve(directory)
      if (current.projectID !== destination.id) {
        return yield* new DestinationProjectMismatchError({ expected: current.projectID, actual: destination.id })
      }
`````

### H-A4-4 — `modules/atlas/docs/design/genesis-chatgpt-results/20261111-v3-fresh/s1/review-packets/l1-a4-v1-dossier.md` linhas 2827–2844

Commit: `a8df22ae3a140c58c63f62ce2a634c84f415c943`. Blob: `6f872ea0e22097d8084fd587f585751a436f607e`. SHA256 integral: `83b544ac46f99b2bf3585ff4e607bcd403e49eb20dd128deb5b6a029a772ead0`. Bytes fonte: 155061. Intervalo byte `[ 143470, 144303 )`, zero-based, fim exclusivo. SHA256 trecho: `a80da331cf35e8e73a9f5eb12c90a8482d6a6a3bfb365492b2c951b45155e544`.

`````text
### AEX094

**Artifacts:** `s1.core.boundaries`.

**Claim/limit supported:** The complete remainder of the assigned RAG SQL schema shows table/column scope and the deliberate chunk-orphan cleanup boundary; it cannot prove an engine or retrieval implementation.

**Authority:** `observed_implementation`. **Source:** `packages/core/src/rag-studio/sql.ts:214ab3375acc34072ee74c3123501c80615bf488`, lines 5–81.

**Source commit:** `1cde2ff7a71bcf7aecb5d030917b577165135d38`; **full source SHA256:** `e6c3580d95d86b307624fe8c58b5790f3a07ce17ed20e5cbe851b44667c7add9`; **excerpt SHA256:** `8d6d5fd357fce5db74ab6c0c4e5668a3823304304895b2438c47622739766bdc` (2228 bytes).

````text

export const RagSourceTable = sqliteTable(
  "rag_source",
  {
    id: text().primaryKey(),
    location_id: text().notNull(),
    path: text().notNull(),
`````

### H-A4-5 — `modules/atlas/docs/design/genesis-chatgpt-results/20261111-v3-fresh/s1/review-packets/l1-a4-v1-dossier.md` linhas 2918–2932

Commit: `a8df22ae3a140c58c63f62ce2a634c84f415c943`. Blob: `6f872ea0e22097d8084fd587f585751a436f607e`. SHA256 integral: `83b544ac46f99b2bf3585ff4e607bcd403e49eb20dd128deb5b6a029a772ead0`. Bytes fonte: 155061. Intervalo byte `[ 146382, 147299 )`, zero-based, fim exclusivo. SHA256 trecho: `649bd156be8390f46474fced2164296237f7d55a12657dec7c77f9726421986d`.

`````text
### AEX095

**Artifacts:** `s1.core.entry`, `s1.core.models`.

**Claim/limit supported:** The repository owner inventory places provider/vendor, utilities and data contracts under Core; this is navigation/ownership intent, not acceptance of every member.

**Authority:** `repository_normative_documentation`. **Source:** `packages/core/README.md:742921238462659e1a5a314f2e0238102c6e9f3a`, lines 54–88.

**Source commit:** `1cde2ff7a71bcf7aecb5d030917b577165135d38`; **full source SHA256:** `e74885e18e96297fd931989505937559ecbdce42c595cf8846411d4f0c4de324`; **excerpt SHA256:** `ecd892d2c5f5d48c4388e6b41bda4339921a4e300c33058212e1fd8be7e94f67` (4223 bytes).

````text
- Owner: core platform maintainer
- Public entry: explicit `exports` in package.json
- Legacy and compatibility: `packages/core/src/github-copilot` (vendored)
- Enforced by `bun run check:boundaries`; exceptions in `script/boundary-ledger.json`.
`````

### H-A4-6 — `modules/atlas/docs/design/genesis-chatgpt-results/20261111-v3-fresh/s1/review-packets/l1-a4-v1-dossier.md` linhas 2967–2989

Commit: `a8df22ae3a140c58c63f62ce2a634c84f415c943`. Blob: `6f872ea0e22097d8084fd587f585751a436f607e`. SHA256 integral: `83b544ac46f99b2bf3585ff4e607bcd403e49eb20dd128deb5b6a029a772ead0`. Bytes fonte: 155061. Intervalo byte `[ 151283, 155060 )`, zero-based, fim exclusivo. SHA256 trecho: `98f7110b0af334f23d3cc3f03cb87f1690f495167028b82e8f9cd6a933683966`.

`````text
### AEX096

**Artifacts:** `s1.core.entry`, `s1.core.session-execution`, `s1.core.context`.

**Claim/limit supported:** The current repository instructions explicitly keep execution local and context ownership split across Core/domain/Session boundaries.

**Authority:** `repository_normative_documentation`. **Source:** `AGENTS.md:ef3b523b0c00aed722582b870c1919188edc4c4f`, lines 207–217.

**Source commit:** `1cde2ff7a71bcf7aecb5d030917b577165135d38`; **full source SHA256:** `07acaefb95db4b07b4e76c4255f7d6e0ecc4c7466b46fbf6ec5e5cdf6cc01b4f`; **excerpt SHA256:** `405cd0b08a53f053f88de7fd615712564267b65a3cfcdaafd0b86a7e177fb1c1` (3113 bytes).

````text
## V2 Session Core

- Keep durable prompt admission separate from model execution. `SessionV2.prompt(...)` admits one durable `session_input` row before scheduling advisory `SessionExecution.wake(sessionID)` unless `resume: false` requests admit-only behavior. The serialized runner promotes admitted inputs into visible user messages at safe boundaries.
- Reusing a Session ID adopts the existing Session. Reusing a prompt message ID reconciles an exact retry only when Session, prompt, and delivery mode match; conflicting reuse fails. Historical projected prompts lazily synthesize promoted inbox records during exact retry.
- Keep `SessionExecution` process-global and Session-ID based. Its local implementation owns the process-local Session coordinator and discovers placement through `SessionStore` plus `LocationServiceMap.get(session.location)` only when a drain starts; no layer should take a Session ID. V2 interruption targets the active process-local ownership chain for that Session; idle or missing interruption is a no-op.
- Keep `SessionRunner`, model resolution, tool registry, permissions, and filesystem Location-scoped. Omitted `Location.workspaceID` means implicit-local placement; explicit workspace identity remains reserved for future placement semantics.
- Preserve one explicit `llm.stream(request)` call per provider turn and reload projected history before durable continuation. Do not bridge through legacy `SessionPrompt.loop(...)` or delegate orchestration to an in-memory tool loop. The one exception is an agent whose `engine` names a registered `ExecutionHost` (today only `claude-code`): its single `ExecutionHost.stream(turn)` call is that provider turn, its internal tool calls persist as provider-executed events, Orchestra tools it invokes settle through the runner's `turn.execute`, and its `query()` always keeps the `claude_code` system prompt preset.
- Keep local Session drains process-local until clustering is implemented. `SessionRunCoordinator` joins explicit same-Session resumes, coalesces prompt wakeups, and allows different Sessions to run concurrently. Advisory wakes drain eligible durable inbox rows only; post-crash continuation recovery requires a separate explicit design before it may retry provider work. A drain has no durable identity or transcript boundary.
- Keep delivery vocabulary explicit. Prompts steer by default and promote at the next safe provider-turn boundary while the current drain requires continuation. An explicit `queue` input remains pending until the Session would otherwise become idle; promote one queued input at that boundary, then reevaluate continuation before promoting another. Promoting any new user input resets the selected agent's provider-turn allowance; a batch of steers resets it once.
- Keep EventV2 replay owner claims separate from clustered Session execution ownership.
- Keep the System Context algebra, registry, and built-ins in `packages/core/src/system-context`; keep Context Source producers with their observed domains, and keep Session History selection plus Context Epoch persistence Session-owned.
````
`````

### H-PROJ-BND-derived_population_routing — `modules/atlas/docs/design/genesis-chatgpt-results/20261111-v3-fresh/s1/revisions/a-l1-evidence-v1/coverage-needs-projection.json` linhas 17143–17170

Commit: `a8df22ae3a140c58c63f62ce2a634c84f415c943`. Blob: `2e91d0f916dfa95a2dd0ef7ae74ff8c1bb427045`. SHA256 integral: `05485c4bd0ac9c76814e44537788818bbcf1fbcbfb87dd8063ce30bf1a67e0cf`. Bytes fonte: 726892. Intervalo byte `[ 719455, 720106 )`, zero-based, fim exclusivo. SHA256 trecho: `9ab67f4c1f3e775f8c56b9c228691eba09fd1d78974ff8578c6825776d2a1112`.

`````text
      "derived_population_routing": {
        "count": 24,
        "families": [
          "atlas",
          "control-plane",
          "rag-studio",
          "relay"
        ],
        "by_depth": {
          "decisive_source_read": 4,
          "grouped_validation_inventory": 10,
          "representative_family_boundary": 10
        },
        "by_read_status": {
          "not_read": 20,
          "semantically_read_decisive_ranges": 4
        },
        "coverage_group_ids": [
          "G012",
          "G034",
          "G035",
          "G036",
          "G102",
          "G103",
          "G104",
          "G105"
        ]
      },
`````

### H-PROJ-BND-clarification_authored_in_this_revision — `modules/atlas/docs/design/genesis-chatgpt-results/20261111-v3-fresh/s1/revisions/a-l1-evidence-v1/coverage-needs-projection.json` linhas 17177–17183

Commit: `a8df22ae3a140c58c63f62ce2a634c84f415c943`. Blob: `2e91d0f916dfa95a2dd0ef7ae74ff8c1bb427045`. SHA256 integral: `05485c4bd0ac9c76814e44537788818bbcf1fbcbfb87dd8063ce30bf1a67e0cf`. Bytes fonte: 726892. Intervalo byte `[ 720232, 720948 )`, zero-based, fim exclusivo. SHA256 trecho: `467c96dc047d8abb73e56c844796268b9913e20ab51dc1398d287db8715af10a`.

`````text
      "clarification_authored_in_this_revision": {
        "need_boundary": "Adapters Core para engines externos, MoveSession e schema RAG.",
        "mandatory_followup": "Ler boundary/módulo/caller e folhas de workflow; a coordenação ativa e rollback cruzado não estão provados pelo MoveSession.",
        "blocked_dependent_claims": "Publicação Atlas, governança Relay, quiescência atômica ou retrieval real ficam bloqueados sem fontes/provas do dono correspondente.",
        "registered_dependent_artifact_keys": null,
        "note": "No L2–L4 dependent keys or new build edges are invented. These are use restrictions derived from existing bodies/gaps, not a retroactive validity change."
      }
`````

### H-PROJ-ENTRY-derived_population_routing — `modules/atlas/docs/design/genesis-chatgpt-results/20261111-v3-fresh/s1/revisions/a-l1-evidence-v1/coverage-needs-projection.json` linhas 17266–17299

Commit: `a8df22ae3a140c58c63f62ce2a634c84f415c943`. Blob: `2e91d0f916dfa95a2dd0ef7ae74ff8c1bb427045`. SHA256 integral: `05485c4bd0ac9c76814e44537788818bbcf1fbcbfb87dd8063ce30bf1a67e0cf`. Bytes fonte: 726892. Intervalo byte `[ 724811, 725670 )`, zero-based, fim exclusivo. SHA256 trecho: `32dc324b7e626414d6548b23c24386fd3b38ab45b39861101b49f68bcdcf902d`.

`````text
      "derived_population_routing": {
        "count": 104,
        "families": [
          "architecture-history",
          "documentation",
          "package",
          "validation-support"
        ],
        "by_depth": {
          "decisive_source_read": 2,
          "grouped_documentation_disposition": 12,
          "grouped_generated_contract": 1,
          "grouped_support_contract": 7,
          "grouped_validation_inventory": 80,
          "grouped_vendor_boundary": 2
        },
        "by_read_status": {
          "not_read": 102,
          "semantically_read_decisive_ranges": 2
        },
        "coverage_group_ids": [
          "G011",
          "G043",
          "G064",
          "G065",
          "G066",
          "G067",
          "G068",
          "G069",
          "G162",
          "G163",
          "G164"
        ]
      },
`````

### H-PROJ-ENTRY-clarification_authored_in_this_revision — `modules/atlas/docs/design/genesis-chatgpt-results/20261111-v3-fresh/s1/revisions/a-l1-evidence-v1/coverage-needs-projection.json` linhas 17304–17310

Commit: `a8df22ae3a140c58c63f62ce2a634c84f415c943`. Blob: `2e91d0f916dfa95a2dd0ef7ae74ff8c1bb427045`. SHA256 integral: `05485c4bd0ac9c76814e44537788818bbcf1fbcbfb87dd8063ce30bf1a67e0cf`. Bytes fonte: 726892. Intervalo byte `[ 725788, 726552 )`, zero-based, fim exclusivo. SHA256 trecho: `bed9c234230fc79b7ae501b4510ddea69df6d37dc793c942313f8aa9cb35c14b`.

`````text
      "clarification_authored_in_this_revision": {
        "need_boundary": "Entrada comum, autoridade e disposição integral do inventário.",
        "mandatory_followup": "Aceite semântico independente, L2–L4, consumo e runtime/publicação pertencem à fila real da principal; documentos e helpers não lidos não desaparecem.",
        "blocked_dependent_claims": "Nenhum dependente de camada seguinte é liberado pela contagem/hash. Esta revisão não transforma o pacote em S1 completo nem altera validity congelada.",
        "registered_dependent_artifact_keys": null,
        "note": "No L2–L4 dependent keys or new build edges are invented. These are use restrictions derived from existing bodies/gaps, not a retroactive validity change."
      }
`````

## README e autoridade I01

O README declara separadamente Schema→Core e Protocol→Server, e Server expondo serviços Core; o trecho literal permite julgar as atribuições sem auditoria nova de imports.

### COMMON-S01 — `packages/core/README.md` linhas 1–88

Commit: `1cde2ff7a71bcf7aecb5d030917b577165135d38`. Blob: `742921238462659e1a5a314f2e0238102c6e9f3a`. SHA256 integral: `e74885e18e96297fd931989505937559ecbdce42c595cf8846411d4f0c4de324`. Bytes fonte: 7777. Intervalo byte `[ 0, 7777 )`, zero-based, fim exclusivo. SHA256 trecho: `e74885e18e96297fd931989505937559ecbdce42c595cf8846411d4f0c4de324`.

`````text
# @orchestra/core

Platform and domain services for Orchestra: v2 Session admission, storage and local execution; Location-scoped capabilities; provider, tool, configuration and plugin services; and the SQLite database with its migrations. Server exposes these services over HTTP, and the CLI, desktop app and product modules compose them. See [architecture](../../docs/guides/architecture.md) for the product-level picture.

Dependencies run Schema -> Core and Protocol -> Server. Core never imports Client or Server.

## Who uses it

`packages/server` (handlers), `packages/app-shell`, `apps/cli`, `apps/desktop`, `packages/tui`, `packages/session-ui`, `packages/sdk-next`, and the `modules/maestro`, `modules/continuity` and `modules/engine-adapters` packages.

## Entry points

There is no bare `@orchestra/core` export and no wildcard: every public subpath is an explicit key in `package.json`. Add one with `bun run script/explicit-exports.ts core --write` from the repository root when a new subpath gains a consumer. Common subpaths:

- `@orchestra/core/effect/layer-node`, `@orchestra/core/effect/app-node`: service graph building blocks.
- `@orchestra/core/session/runner`: the serialized Session runner.
- `@orchestra/core/system-context`: System Context registry and built-ins.
- `@orchestra/core/backend-toolkit`: backend toolkit packs.

Where things live:

- `src/session/` (see its `README.md`): Session storage, event projection, durable input admission, history, context epochs.
- `src/location.ts`, `src/location-services.ts`, `src/location-service-map.ts`: Location identity and scoped services.
- `src/provider.ts`, `src/model.ts`, `src/tool/`, `src/config/`, `src/plugin/`: provider, model, tool, configuration and plugin services.
- `src/host.ts` and `src/host/`: `Host.Contribution`, how product modules add services to the process.
- `src/database/` (see its `README.md`): SQLite setup, generated schema, ordered TypeScript migrations in `src/database/migration/`, registered by `migration.gen.ts`.
- `src/agent/prompt/` and `src/plugin/command/`: bundled prompt and command text, kept beside their owners.

## Session execution in brief

`SessionV2.prompt(...)` admits a durable input, then schedules an advisory `SessionExecution.wake(sessionID)` unless `resume: false` (admit-only). The serialized runner promotes admitted inputs at safe provider-turn boundaries. `SessionExecution` is process-global and keyed by Session ID; `SessionRunner`, model resolution, tools, permissions and filesystem services are Location-scoped. Drains are process-local. The full rules are in the repository [AGENTS.md](../../AGENTS.md) under "V2 Session Core".

## Commands

From `packages/core`:

```sh
bun typecheck
```

Tests run on GitHub Actions from the repository root: `bun run test:ci core test/<file>.test.ts`.

## Limits

- Existing data roots (`Global.Path`), the database path and migration history are stable data contracts.
- After a change to the public Protocol or Server `HttpApi`, run `bun run generate` in `packages/client`; never edit its generated files.

<!-- module-contract:start (generated by script/module-readme.ts from script/module-architecture.json; do not edit) -->
## Module contract
- Package: `@orchestra/core` at `packages/core` (alias `core`)
- Summary: Reusable platform and domain services for the application and server layers, including the V2 Session core.
- Layer: `platform`; may depend on: `foundation`, `native`, `library`, `contract`, `extension-api`, `module:platformLibrary`
- Status: `canonical`
- Owner: core platform maintainer
- Public entry: explicit `exports` in package.json
- Legacy and compatibility: `packages/core/src/github-copilot` (vendored)
- Enforced by `bun run check:boundaries`; exceptions in `script/boundary-ledger.json`.

### Domains
- `atlas` — platform — `src/atlas.ts` — packages/core
- `session` — platform — `src/session/`, `src/session.ts`, `src/session-process.ts` — packages/core
- `agent` — platform — `src/agent/`, `src/agent.ts` — packages/core
- `system-context` — platform — `src/system-context/` — packages/core
- `tool` — platform — `src/tool/`, `src/tool-output-store.ts`, `src/mcp/`, `src/mcp.ts`, `src/lsp/`, `src/lsp.ts` — packages/core
- `tool-safety` — platform — `src/tool-safety.ts`, `src/tool-safety-*`, `src/sandbox-parents.ts`, `src/sandbox-project-config.ts` — packages/core
- `relay` — platform — `src/relay.ts`, `src/relay-*` — packages/core
- `config` — platform — `src/config/`, `src/config.ts`, `src/behavior.ts`, `src/policy.ts`, `src/flag/`, `src/tui-config-files.ts` — packages/core
- `permission` — platform — `src/permission/`, `src/permission.ts`, `src/question.ts` — packages/core
- `location` — platform — `src/location.ts`, `src/location-services.ts`, `src/location-service-map.ts`, `src/location-mutation.ts` — packages/core
- `project` — platform — `src/project/`, `src/project.ts`, `src/filesystem/`, `src/filesystem.ts`, `src/fs-util.ts`, `src/file.ts`, `src/file-mutation.ts`, `src/git.ts`, `src/git-cli.ts`, `src/vcs.ts`, `src/repository.ts`, `src/repository-cache.ts`, `src/snapshot.ts`, `src/patch.ts`, `src/pull-request.ts`, `src/guardrail.ts`, `src/workspace.ts`, `src/format.ts`, `src/format/` — packages/core
- `database` — platform — `src/database/`, `src/data-migration.sql.ts` — packages/core
- `event` — platform — `src/event/`, `src/event.ts`, `src/public-event-manifest.ts` — packages/core
- `runtime` — platform — `src/effect/`, `src/global.ts`, `src/host.ts`, `src/host/`, `src/id/`, `src/installation/`, `src/observability/`, `src/observability.ts`, `src/background-job.ts`, `src/state.ts`, `src/schema.ts`, `src/v2-schema.ts` — packages/core
- `process` — platform — `src/process.ts`, `src/child-process-common.ts`, `src/cross-spawn-command.ts`, `src/cross-spawn-spawner.ts`, `src/shell.ts`, `src/pty/`, `src/pty.ts`, `src/tcp-proxy.ts`, `src/omni.ts`, `src/omni-*`, `src/output-inspector.ts`, `src/artifact-native-windows.ts`, `src/artifact-native-windows.rs`, `src/ripgrep/`, `src/ripgrep.ts` — packages/core
- `provider` — platform — `src/provider.ts`, `src/model.ts`, `src/models-dev.ts`, `src/aisdk.ts`, `src/catalog.ts`, `src/github-copilot/`, `src/plugin/provider/`, `src/plugin/provider.ts`, `src/plugin/models-dev.ts`, `src/plugin/variant.ts` — packages/core
- `plugin-host` — platform — `src/plugin/`, `src/plugin.ts` — packages/core
- `identity` — platform — `src/claude-code-account.ts`, `src/account/`, `src/account.ts`, `src/credential/`, `src/credential.ts`, `src/oauth/`, `src/integration/`, `src/integration.ts`, `src/share/` — packages/core
- `instruction` — platform — `src/skill/`, `src/skill.ts`, `src/packaged-skills.ts`, `src/instruction-context.ts`, `src/command.ts`, `src/slash-command.ts`, `src/reference/`, `src/reference.ts` — packages/core
- `research` — platform — `src/research/`, `src/research-toolkit/` — packages/core
- `backend-toolkit` — platform — `src/backend-toolkit/`, `src/pinned-artifact.ts` — packs move to modules/backend-toolkit after the 70-C' cut
- `control-plane` — platform — `src/control-plane/` — packages/core
- `capability` — platform — `src/capability/`, `src/toolkit/` — packages/core
- `board` — platform — `src/board/` — packages/core
- `rag-studio` — platform — `src/rag-studio/` — packages/core
- `scheduled-task` — platform — `src/scheduled-task/`, `src/scheduled-task.ts` — packages/core
- `actions` — platform — `src/actions/`, `src/actions.ts` — packages/core
- `util` — platform — `src/util/`, `src/image/`, `src/image.ts`, `src/npm.ts`, `src/npm-config.ts` — packages/core
<!-- module-contract:end -->
`````

### COMMON-I01 — `provided-inputs/AGENTS.md` linhas 207–217

Commit: `1cde2ff7a71bcf7aecb5d030917b577165135d38`. Blob: `ef3b523b0c00aed722582b870c1919188edc4c4f`. SHA256 integral: `07acaefb95db4b07b4e76c4255f7d6e0ecc4c7466b46fbf6ec5e5cdf6cc01b4f`. Bytes fonte: 16501. Intervalo byte `[ 12802, 15915 )`, zero-based, fim exclusivo. SHA256 trecho: `405cd0b08a53f053f88de7fd615712564267b65a3cfcdaafd0b86a7e177fb1c1`.

`````text
## V2 Session Core

- Keep durable prompt admission separate from model execution. `SessionV2.prompt(...)` admits one durable `session_input` row before scheduling advisory `SessionExecution.wake(sessionID)` unless `resume: false` requests admit-only behavior. The serialized runner promotes admitted inputs into visible user messages at safe boundaries.
- Reusing a Session ID adopts the existing Session. Reusing a prompt message ID reconciles an exact retry only when Session, prompt, and delivery mode match; conflicting reuse fails. Historical projected prompts lazily synthesize promoted inbox records during exact retry.
- Keep `SessionExecution` process-global and Session-ID based. Its local implementation owns the process-local Session coordinator and discovers placement through `SessionStore` plus `LocationServiceMap.get(session.location)` only when a drain starts; no layer should take a Session ID. V2 interruption targets the active process-local ownership chain for that Session; idle or missing interruption is a no-op.
- Keep `SessionRunner`, model resolution, tool registry, permissions, and filesystem Location-scoped. Omitted `Location.workspaceID` means implicit-local placement; explicit workspace identity remains reserved for future placement semantics.
- Preserve one explicit `llm.stream(request)` call per provider turn and reload projected history before durable continuation. Do not bridge through legacy `SessionPrompt.loop(...)` or delegate orchestration to an in-memory tool loop. The one exception is an agent whose `engine` names a registered `ExecutionHost` (today only `claude-code`): its single `ExecutionHost.stream(turn)` call is that provider turn, its internal tool calls persist as provider-executed events, Orchestra tools it invokes settle through the runner's `turn.execute`, and its `query()` always keeps the `claude_code` system prompt preset.
- Keep local Session drains process-local until clustering is implemented. `SessionRunCoordinator` joins explicit same-Session resumes, coalesces prompt wakeups, and allows different Sessions to run concurrently. Advisory wakes drain eligible durable inbox rows only; post-crash continuation recovery requires a separate explicit design before it may retry provider work. A drain has no durable identity or transcript boundary.
- Keep delivery vocabulary explicit. Prompts steer by default and promote at the next safe provider-turn boundary while the current drain requires continuation. An explicit `queue` input remains pending until the Session would otherwise become idle; promote one queued input at that boundary, then reevaluate continuation before promoting another. Promoting any new user input resets the selected agent's provider-turn allowance; a batch of steers resets it once.
- Keep EventV2 replay owner claims separate from clustered Session execution ownership.
- Keep the System Context algebra, registry, and built-ins in `packages/core/src/system-context`; keep Context Source producers with their observed domains, and keep Session History selection plus Context Epoch persistence Session-owned.
`````

## Rotas reais do kit e limite de seleção

A proposta integral permanece em julgamento próprio, inalterada. Estes são os bytes normativos necessários à relação entre donos/keys e navegação. Versões externas continuam NOT_SELECTED.

### COMMON-K01 — `modules/atlas/docs/design/genesis-chatgpt-results/20261111-v3-fresh/s1/delegation-20261114/partition.json` linhas 11–51

Commit: `70234d541a9a3539935ef16f19e33c8f2d5f30ec`. Blob: `b834eb19daea27f173afb1dd011a19f77b491f24`. SHA256 integral: `959a3c024337c8082625082cba4fad6ceea3243690fb0850634546dc33f2684c`. Bytes fonte: 3929. Intervalo byte `[ 480, 2044 )`, zero-based, fim exclusivo. SHA256 trecho: `cf3a1bb7cc656f9f124f923520212a7758f2983959251a0e7bf83a7a4eae6fff`.

`````text
  "allocation": "Exact legacy artifact_key -> owner; sources.jsonl is exhaustive, not a prefix heuristic.",
  "primary_source_ownership": {
    "s1.core.session-admission": "S1-01",
    "s1.core.session-execution": "S1-01",
    "s1.core.persistence": "S1-01",
    "s1.core.context": "S1-01",
    "s1.core.configuration": "S1-01",
    "s1.core.project": "S1-01",
    "s1.core.models": "S1-01",
    "s1.core.economy": "S1-01",
    "s1.core.runtime": "S1-01",
    "s1.core.tools": "S1-02",
    "s1.core.security": "S1-02",
    "s1.core.extensions": "S1-02",
    "s1.core.capability": "S1-02",
    "s1.core.automation": "S1-03",
    "s1.core.research": "S1-03",
    "s1.core.boundaries": "S1-03",
    "s1.core.entry": "S1-03",
    "s1.api.boundaries": "S1-04",
    "s1.api.schema-contracts": "S1-04",
    "s1.api.session-contract": "S1-04",
    "s1.api.server-edge": "S1-04",
    "s1.api.stream-contract": "S1-04",
    "s1.api.client-projection": "S1-04",
    "s1.api.codegen": "S1-04",
    "s1.api.sdk-composition": "S1-04",
    "s1.api.surface-disposition": "S1-04",
    "s1.runtime.llm_turns.l1": "S1-05",
    "s1.runtime.llm_providers.l1": "S1-05",
    "s1.runtime.llm_recording.l1": "S1-05",
    "s1.runtime.plugin.l1": "S1-05",
    "s1.runtime.codemode.l1": "S1-05",
    "s1.runtime.codemode_openapi.l1": "S1-05",
    "s1.runtime.effect_sqlite.l1": "S1-05",
    "s1.runtime.http_recorder.l1": "S1-05",
    "s1.runtime.guides_intent.l1": "S1-05",
    "s1.runtime.maintenance_intent.l1": "S1-05"
  },
  "expected_sources": 2236,
  "expected_legacy_artifacts": 36,
`````

### COMMON-K02-1 — `modules/atlas/docs/design/genesis-chatgpt-results/20261111-v3-fresh/s1/delegation-20261114/dependencies.json` linhas 1–9

Commit: `70234d541a9a3539935ef16f19e33c8f2d5f30ec`. Blob: `a65c72a33599afec662649c8ebf86808c99e320b`. SHA256 integral: `83dfbbe0a1f585dc548643dc04f5f85eb2d4c1531d176a068582829e80375ee9`. Bytes fonte: 6445. Intervalo byte `[ 0, 641 )`, zero-based, fim exclusivo. SHA256 trecho: `6026d8a3dbf6ae17e5e2d81b6b7d11d026a7864edb8f2b76606a941bc1c8e174`.

`````text
{
  "schema": "genesis-s1-subdivision-dependencies/v1",
  "kind": "obligation-routing-not-build-graph",
  "source_revision": "1cde2ff7a71bcf7aecb5d030917b577165135d38",
  "rules": [
    "Cada source path e chave L1 histórica tem um dono primário; leitura cruzada é permitida.",
    "Roteamento de obrigação não cria automaticamente uma build_dependency. Somente vínculos semanticamente necessários e aceitos entram no pacote.",
    "Ler fontes pinadas para avançar a parte independente; não afirmar aceite de artefato alheio ainda ausente.",
    "Não converter lacuna local em complemento global apenas para declarar conclusão."
`````

### COMMON-K02-2 — `modules/atlas/docs/design/genesis-chatgpt-results/20261111-v3-fresh/s1/delegation-20261114/dependencies.json` linhas 55–98

Commit: `70234d541a9a3539935ef16f19e33c8f2d5f30ec`. Blob: `a65c72a33599afec662649c8ebf86808c99e320b`. SHA256 integral: `83dfbbe0a1f585dc548643dc04f5f85eb2d4c1531d176a068582829e80375ee9`. Bytes fonte: 6445. Intervalo byte `[ 2115, 3466 )`, zero-based, fim exclusivo. SHA256 trecho: `0b4c3783474f8376f7f4280231814e2c69137dbc43ec282b9a801cb1d4aef9c8`.

`````text
      "id": "automation-admission",
      "supplier": "S1-01",
      "consumer": "S1-03",
      "subject": "Admissão versus execução/conclusão e cancelamento em Actions/agendamento/Board."
    },
    {
      "id": "core-entry",
      "supplier": "S1-03",
      "consumer": "S1_COORDINATION",
      "subject": "Contribuição concreta à entrada/navegação geral, sem aceitar os outros grupos antecipadamente."
    },
    {
      "id": "oversized-inputs",
      "supplier": "S4",
      "consumer": [
        "S1-04",
        "S1-05"
      ],
      "subject": "Capacidade comprovada de observação de fontes grandes quando exigidas; manter os bytes e a lacuna até solução válida."
    },
    {
      "id": "runtime-and-package-closure",
      "supplier": "S4",
      "consumer": [
        "S1-01",
        "S1-02",
        "S1-03",
        "S1-04",
        "S1-05",
        "S1_COORDINATION"
      ],
      "subject": "Release e código exatos; limites cross-package e por-capacidade devem ser respeitados, sem criar novo Atlas."
    },
    {
      "id": "external-boundaries",
      "supplier": [
        "S3",
        "S4",
        "S5"
      ],
      "consumer": "S1-03",
      "subject": "Garantias do lado externo Relay/Atlas/Omni: ler fontes exatas e consumir evidência aceita quando uma alegação integrada depender dela."
    }
  ],
`````

### COMMON-K02-3 — `modules/atlas/docs/design/genesis-chatgpt-results/20261111-v3-fresh/s1/delegation-20261114/dependencies.json` linhas 160–202

Commit: `70234d541a9a3539935ef16f19e33c8f2d5f30ec`. Blob: `a65c72a33599afec662649c8ebf86808c99e320b`. SHA256 integral: `83dfbbe0a1f585dc548643dc04f5f85eb2d4c1531d176a068582829e80375ee9`. Bytes fonte: 6445. Intervalo byte `[ 4437, 6445 )`, zero-based, fim exclusivo. SHA256 trecho: `c207f5967d5b8f36290f031148d6486efa4a71f0b4856ea65915d5a298e74693`.

`````text
  "union": {
    "owner": "S1_COORDINATION",
    "owner_description": "Coordenação da conversa que preparou este kit",
    "target_branch": "genesis-fresh-s1",
    "inputs": [
      {
        "subslice_id": "S1-01",
        "branch": "genesis-s1-sessions",
        "handoff_path": "modules/atlas/docs/design/genesis-chatgpt-results/20261111-v3-fresh/s1/subslices/01-sessions/handoff.json"
      },
      {
        "subslice_id": "S1-02",
        "branch": "genesis-s1-tools",
        "handoff_path": "modules/atlas/docs/design/genesis-chatgpt-results/20261111-v3-fresh/s1/subslices/02-tools/handoff.json"
      },
      {
        "subslice_id": "S1-03",
        "branch": "genesis-s1-automation",
        "handoff_path": "modules/atlas/docs/design/genesis-chatgpt-results/20261111-v3-fresh/s1/subslices/03-automation/handoff.json"
      },
      {
        "subslice_id": "S1-04",
        "branch": "genesis-s1-api",
        "handoff_path": "modules/atlas/docs/design/genesis-chatgpt-results/20261111-v3-fresh/s1/subslices/04-api/handoff.json"
      },
      {
        "subslice_id": "S1-05",
        "branch": "genesis-s1-libraries",
        "handoff_path": "modules/atlas/docs/design/genesis-chatgpt-results/20261111-v3-fresh/s1/subslices/05-libraries/handoff.json"
      }
    ],
    "required": [
      "Reconciliar os cinco payloads e alterações de produto sem sobrescrever avanços.",
      "Conferir a união das 2236 fontes e das necessidades locais, mantendo exclusões justificadas e gaps.",
      "Selecionar corpos/receitas/dependências/roots e o índice geral do Core, com closure compatível com Atlas.",
      "Provar os fluxos cruzados relevantes de API, Session, LLM, tools, persistência, automação e bibliotecas.",
      "Reconciliar versões, aceites e bindings; obter revisão independente da união S1 e seus gates.",
      "Entregar S1 ao ROOT global sem declarar encerrada a campanha S1–S5."
    ],
    "global_owner": "ROOT",
    "global_branch": "genesis-fresh-final"
  }
}
`````
