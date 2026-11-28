# Pacote nativo comum das cinco fatias

## Finalidade e autoridade

Conservar a produção real de cada sessão em um formato comum, para juízo, transporte por
Git e adaptação às portas existentes do Atlas. Este é um contrato de campanha, **não** um
novo tipo de produção Atlas, store ou mecanismo que já importa conhecimento.

Arquivo fixo: `modules/atlas/docs/design/genesis-chatgpt-results/20261111-v3-fresh/sN/native-package.json`.
A orquestradora atualiza o pacote; produtores escrevem corpos em caminhos próprios. Manter
versões julgadas imutáveis por commit/hash e usar [handoffs.md](handoffs.md) para a selagem.
S4 implementa o adapter comum e anuncia capacidades em `s4/runtime-release.json`.

## Regras pequenas, necessárias desde o primeiro WP

- `scope` e `key` são estáveis. Cada chave identifica um artefato; revisão não cria alias
  conflitante. Corpo, autoridade, validade, gaps e evidência compõem sua identidade útil.
- `layer` é número **1, 2, 3 ou 4**. `need` pertence ao enum Atlas: `entry`, `ownership`,
  `maintenance`, `operational`, `flow`, `evidence`, `component`. Não inventar novos needs.
- `body.path` é relativo à pasta de `native-package.json`; sem absoluto, `..` ou symlink.
  `source_refs.path` é relativo à raiz do repositório de fonte. Não confundir essas bases.
  Usar nomes de arquivo portáveis; a chave semântica não precisa virar literalmente o filename.
- Guardar bytes UTF-8 exatos; calcular `byte_length` e SHA-256 sobre esses bytes, sem
  normalizar Unicode/newlines depois da revisão. Mudança de bytes exige novo binding.
- `validity` usa `supported` ou `blocked`; lacuna crítica conserva `blocked` até resolução.
  Separar observação, intenção autorizada, interpretação e lacuna no corpo e na autoridade.
- `input_keys` declara fontes, receita/contrato e membership relevantes. `source_refs`
  conserva as fontes capturadas; nenhuma chave substitui a verificação real do input.
- `build_dependencies` liga predecessores que afetam o resultado; `navigation` contém
  referências de consulta. Não transformar navegação em dependência nem omitir dependência.
- `roots` associa necessidades às chaves de entrada disponíveis no scope. Durante produção
  pode estar incompleto; a seleção exigida deve estar completa antes de publicar/aceitar.
- Parecer semântico é evidência preservada. Importação/binding/publicação recebem provas
  separadas; não copiar um PASS de conteúdo como aprovação de uma transformação não vista.

Uma referência é `{ "commit": "<SHA40>", "path": "<caminho>", "sha256": "<hash>" }`.
Para arquivo do mesmo payload ainda sem commit, usar `{ "payload_path": "<caminho completo
no repo>", "sha256": "<hash>" }`; a selagem fixa seu commit depois. Não inventar SHA próprio.
Referências a respostas/pedidos guardam conteúdo visível original, sem raciocínio privado.

## Formato único

Exemplo estrutural, não pacote executado: preencher todos os valores reais antes de
submeter a unidade. `null` indica informação ainda não observada e impede alegar completude.
O pacote pode crescer por WPs; declarar seus artefatos obrigatórios e lacunas, sem esperar
inventário semântico perfeito do domínio para começar uma primeira unidade bem definida.

```json
{
  "schema": "genesis-native-package/v1",
  "campaign": "20261111-v1",
  "protocol_epoch": "parallel-v3-fresh",
  "results_epoch": "20261111-v3-fresh",
  "session": "S1",
  "source_revision": "1cde2ff7a71bcf7aecb5d030917b577165135d38",
  "protocol_ref": null,
  "scope": "<scope do dominio>",
  "package_state": "IN_PROGRESS",
  "contract": {
    "criteria": ["<criterio publico aplicavel>"],
    "oracle_ref": null
  },
  "required_artifact_keys": ["<chave exigida>"],
  "artifacts": [
    {
      "key": "<chave estavel e unica>",
      "scope": "<mesmo scope do pacote>",
      "title": "<titulo util>",
      "layer": 1,
      "need": "evidence",
      "body": {
        "path": "bodies/<slug-seguro>.md",
        "encoding": "utf-8",
        "byte_length": null,
        "sha256": "<hash real dos bytes>"
      },
      "authority": {"scope": "<scope>", "basis": "<base atribuida e verificavel>"},
      "validity": "blocked",
      "gaps": ["<lacuna real>"],
      "evidence": ["<referencia exata de evidencia>"],
      "input_keys": ["file:<caminho relativo da fonte>"],
      "source_refs": [
        {
          "commit": "<SHA40 da fonte efetiva>",
          "path": "<caminho relativo no repo>",
          "git_blob_sha": "<objeto observado>",
          "sha256": "<hash dos bytes capturados>"
        }
      ],
      "recipe_ref": null,
      "build_dependencies": [],
      "navigation": [],
      "producer_request_ref": null,
      "producer_response_ref": null,
      "semantic_review_refs": [],
      "runtime_receipt_refs": []
    }
  ],
  "roots": {},
  "missing_required_artifact_keys": ["<chave exigida>"],
  "known_limits": []
}
```

`package_state` é coordenação de transporte, não validade servida pelo Atlas. A unidade
pronta tem corpo, fonte, contrato, receita, autoria e dependências preenchidos; o pacote
completo não mantém artefatos obrigatórios ausentes. `oracle_ref` identifica o oracle
congelado antes da produção avaliada; seu conteúdo não entra no contexto do produtor.

Cada dependência de build contém `key` e `package_ref` exato do predecessor aceito.
Para predecessor neste mesmo pacote, usar `{ "key": "<chave>", "same_package": true }`;
a chave deve existir, estar aceita e preceder seu dependente. Rejeitar ciclos de build.
`recipe_ref` vincula o pedido/receita efetivamente usado, incluindo versão e critérios;
modelo/ID real e resposta original ficam nos respectivos recibos, sem supor telemetria.

## Adaptação determinística aos tipos existentes

| Transporte | Objeto/obrigação real |
| --- | --- |
| Corpo verificado em bytes | `OwnershipBody {kind, version:1, bytes:number[]}`. |
| Autoridade, validade, gaps, evidência | `OwnershipResult`, referenciando o hash CAS do corpo. |
| Critérios aplicáveis | `OwnershipContract`, persistido e identificado pelo runtime. |
| Inputs e predecessores observados | `OwnershipReceipt.inputs` e `dependencies {key,result}`. |
| Juízos de binding válidos | `OwnershipReview` com reviewer, contract, inputs, result e provenance reais. |
| Metadados e vínculos calculados | `OwnershipArtifact`, com hashes reais de result/receipt. |
| Artefatos e roots do scope | `OwnershipManifest`, sem seleção parcial apresentada como completa. |

`result`, `receipt`, `artifact`, `manifest` e versões observadas dos inputs são gerados
pelo runtime real. Não preenchê-los com SHA-256 de transporte nem com respostas inventadas.
`OwnershipReview.verdict` é `pass` ou `hold`, mas não basta converter a grafia de um parecer:
a revisão precisa cobrir o contrato, inputs, resultado e transformação exatos pertinentes.
As fontes atuais são [tipos](https://github.com/gustavomhss/hugr-orchestra/blob/1cde2ff7a71bcf7aecb5d030917b577165135d38/modules/atlas/packages/knowledge/src/ownership/types.ts), blob `05cb2ae05d296764ce2e786d07b28b36d7428cb7`.

## Inputs: evidência capturada não é versão do runtime

O observador atual aceita `file:<path>` e `members:<directory>`. Sua versão é calculada
por `id(...)` do kernel sobre bytes ou membership; não é SHA-256 nem blob Git. S4 deve
observar a cópia real e conferir seu vínculo com a fonte capturada, sem inventar observações.

O caminho atual recusa `.git`, `.atlas`, caminhos absolutos, `.`/`..`, symlinks e leitura de
arquivo acima de 256.000 bytes. Membership exige consulta Git completa, sem erro/truncamento,
e considera também arquivos não ignorados. `absent` difere de `unavailable`: uma falha de
leitura ou um formato recusado não demonstra remoção. Preservar a lacuna e tratar a fronteira
necessária com o mecanismo mínimo justificado; não remover a fonte do escopo para passar.
Fonte: [ownership-input.ts](https://github.com/gustavomhss/hugr-orchestra/blob/1cde2ff7a71bcf7aecb5d030917b577165135d38/modules/atlas/packages/adapter-io/src/ownership-input.ts), blob `c6afd6a35071a2487a1168cea5ed1ad26379c376`.

Antes de aceitar um pacote, conferir unicidade, enum/layers, paths, bytes/hashes, inputs,
dependências, criteria e pareceres. Isso verifica forma e binding; os dois juízes decidem
suficiência semântica, e os leitores/consumidores reais comprovam uso conforme [runtime.md](runtime.md).

