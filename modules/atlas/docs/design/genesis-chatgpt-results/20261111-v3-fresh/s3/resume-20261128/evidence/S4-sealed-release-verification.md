# S4 selado — verificação mecânica para reutilização S3

Resultado: **REFERENCES_VERIFIED**, 14 arquivos recuperados pelo conector GitHub, 106 comparações mecânicas satisfeitas e nenhuma divergência de referência. Esta é uma verificação de custódia/identidade, **não um parecer semântico, terceiro voto ou execução de produto/testes**. O resultado completo está em `verification.json`; os bytes originais estão em `files/`, as respostas de metadados em `metadata/` e a captura integral do conector em `connector-captures.json`.

## Cadeia confirmada

| Papel | Identidade |
| --- | --- |
| Selo H | `e171783482d0a44974d6056cd9e144a7e33406a7` |
| Pai de H / payload P | `da9800f55f31926f33c41a5ca2fd88bf26fcaccc` |
| Pai de P / harness | `09a4c4afc7aab2f9a153eb059d13df0ecf15595c` |
| Runtime executado | `db9b4235022c4df32fe3bfd4faeea8adcd69abb7` |
| Tree do runtime | `3c93c4636c1e4c4b704f8be9314e22b2149e5609` |
| Actions | run `46114652347`, `completed/success`, branch `genesis-runtime-resume`, HEAD do harness acima |
| Release SHA256 | `2922f769ea2b533d06748a4c10471b19deba3fd0c41b8f1bf7930512eaa75af1` |
| Handoff SHA256 medido | `9c66610362fcb806314c3f89958087ab7a2561e87573824d04d3c860ea6bffbf` |
| Aceite SHA256 | `ad16053eb6349988cfdfb208d68c20f66f072435a555ece7de7049455bf5f984` |

Os commits/pais/trees e o resultado Actions foram consultados diretamente por endpoints GitHub somente leitura. O summary publicado também identifica exatamente o runtime, seu tree, harness e run. Os blobs Git foram recalculados sobre todos os arquivos capturados e comparados ao objeto retornado pelo conector; SHA256 e tamanhos foram comparados às referências do mesmo commit. As cópias locais inicialmente fornecidas de release/handoff são idênticas às capturas remotas. O handoff não possui um SHA autorreferente: seu SHA acima foi medido, e seu vínculo é o arquivo no selo H e seu blob Git.

## Aceites preservados, sem novo julgamento

As respostas finais de `/root/s4_release_j1` e `/root/s4_release_j2` registram PASS individual em Q01–Q07, zero findings obrigatórios abertos e o mesmo release SHA256/runtime/harness/candidates S1-03/S2. Seus SHA256 são, respectivamente:

- `4d07f38e25d7143c9fa19fc26339bd70d119d94f9cac6e46d0a95e78b990e245`.
- `92d9894019ded32e9c23a9d8b8268bb4c2c525f042b387af7664a81d3c0bd187`.

O manifesto anterior, o README, a reavaliação integral de J1, o parecer base de J2 e o HOLD inicial de J1 também foram recuperados e conferidos. A troca literal exclusivamente de `path_resolution` reproduz exatamente os bytes do release final. O pacote final contém o manifesto anterior e o README integrais; suas três partes e o pedido compartilhado de correção têm os hashes declarados. Esses trechos foram extraídos do pacote final publicado, sem afirmar que cada blob Git dos arquivos individuais foi consultado separadamente.

O HOLD original `J1-NO-TOOLS-01` continua presente. O aceite S4 conta a reavaliação posterior pelo mesmo J1 e as duas decisões finais; esta auditoria apenas confirmou esses registros. `host_message_id` é UNKNOWN, a identidade é o handle canônico declarado e a restrição de ferramentas é instrucional. Não há autenticação criptográfica nem comprovação técnica de ferramentas desabilitadas.

## Reutilização S3 e limites que permanecem

S3 pode fixar este release/runtime para sua operação isolada autorizada e reutilizar a evidência comum compatível já delimitada. O release qualifica prepare dos pacotes S1-03/S2 e controles comuns; não fornece o candidate, binding, policy, publicação, index/read, consumidores ou manutenção de S3. Seus candidatos são vinculados às raízes originais e não podem ser transplantados.

S3 deve conservar seu checkout SOURCE completo, a árvore integral de protocolo para membership, preparar seleção11 própria, obter os dois bindings reais e passar pelos gates de publicação com autoridade isolada real. Nenhum novo bloqueio de pin/aceite do release foi encontrado. Permanecem as limitações declaradas: archives históricos dos controles comuns expirados, SHA histórico de `origin/dev` desconhecido, diferença Node 24.22.2/24.22.3, autenticação não criptográfica e ausência de execução S3 pelo release. Os oracles/receitas de manutenção S3 continuam obrigação separada.

Fontes: [release em P](https://github.com/gustavomhss/hugr-orchestra/blob/da9800f55f31926f33c41a5ca2fd88bf26fcaccc/modules/atlas/docs/design/genesis-chatgpt-results/20261111-v3-fresh/s4/runtime-release.json), [handoff em H](https://github.com/gustavomhss/hugr-orchestra/blob/e171783482d0a44974d6056cd9e144a7e33406a7/modules/atlas/docs/design/genesis-chatgpt-results/20261111-v3-fresh/resume-20261128/runtime-qualification/handoff.json), [aceite em P](https://github.com/gustavomhss/hugr-orchestra/blob/da9800f55f31926f33c41a5ca2fd88bf26fcaccc/modules/atlas/docs/design/genesis-chatgpt-results/20261111-v3-fresh/resume-20261128/runtime-qualification/judgments/acceptance.json), [run de qualificação](https://github.com/gustavomhss/hugr-orchestra/actions/runs/46114652347).
