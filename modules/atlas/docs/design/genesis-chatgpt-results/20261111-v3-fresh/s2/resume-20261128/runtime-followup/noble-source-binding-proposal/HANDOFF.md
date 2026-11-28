# S2 → S4: proposta para vincular os bytes instalados de `@noble/hashes`

## Estado desta entrega

Esta é uma investigação factual e uma proposta de correção, **sem decisão de admissão**. Nenhum patch foi aplicado; nenhum teste, prepare, init-store, admit, index, read ou rebuild foi executado neste subtrabalho. Nenhuma branch remota foi alterada e ninguém foi contatado fora da equipe desta tarefa.

O runtime local continua em `db9b4235022c4df32fe3bfd4faeea8adcd69abb7`. A proposta foi conferida somente por leitura, identidade de arquivos, parsing TypeScript e `git apply --check`. Esses resultados não demonstram que o teste passa ou que o defeito está corrigido em um runtime executado.

## 1. S4 consultada novamente

O registro anterior `latest-release/recheck-ref-0836.json` identifica `genesis-runtime-resume`, não `genesis-runtime-foundation-resume`. Nesta rodada, o GitHub MCP retornou:

| Consulta | Resultado observado |
| --- | --- |
| Ref `refs/heads/genesis-runtime-resume` | `e171783482d0a44974d6056cd9e144a7e33406a7`, igual à captura anterior |
| Busca `genesis-runtime` | `genesis-runtime-resume` |
| Busca `genesis-runtime-foundation` | Nenhuma branch retornada |
| Manifesto no HEAD observado | `20261128-s4-runtime-db9b423-prepare-v1` |
| Blob do manifesto | `ac4f5f46ce2044ded044e4c9a4e35220558bae22` |
| Código declarado pelo release | `db9b4235022c4df32fe3bfd4faeea8adcd69abb7` |
| Comparação db9 → HEAD observado | Cinco commits; mudanças em qualificação, documentação e evidências, sem mudança dos manifestos do kernel ou do coletor |

A releitura direta no HEAD confirmou o manifesto do kernel com blob `1799fc90de0718d074ea15e054ab3d4ea280e213` e o coletor com blob `6c4c04598588519cd7512263e8d5c28ce51c6750`, iguais aos bytes locais de db9. Não foi encontrada correção ou release posterior **na superfície consultada nesta rodada**. Isso não é uma afirmação sobre branches não consultadas.

Fontes: [ref](github/recorded-ref-query.json), [busca de branches](github/runtime-branch-search.json), [busca foundation](github/foundation-branch-search.json), [comparação](github/db9-to-release-compare.json), [manifesto integral](sources/remote/runtime-release.json). [Release no commit imutável](https://github.com/gustavomhss/hugr-orchestra/blob/e171783482d0a44974d6056cd9e144a7e33406a7/modules/atlas/docs/design/genesis-chatgpt-results/20261111-v3-fresh/s4/runtime-release.json).

## 2. Causa verificada por leitura

`packages/kernel/src/encoder.ts` importa `@noble/hashes/blake3` e `@noble/hashes/utils`. Entretanto, `packages/kernel/package.json` declara somente `@atlas/contracts`. `@noble/hashes: ^1.8.0` está no manifesto agregador `modules/atlas/package.json` e no respectivo `package-lock.json`.

`evaluationRuntimeIdentity()` captura o adapter, visita os dez pacotes Atlas obrigatórios e percorre `dependencies`, `optionalDependencies` e `peerDependencies` dos manifestos visitados. O manifesto agregador não é uma raiz desse percurso. Como o kernel omite sua dependência direta e nenhum pacote visitado a acrescenta, a identidade preparada não contém os arquivos de Noble.

A inspeção física, sem importar Atlas, encontrou `modules/atlas/node_modules/@noble/hashes` em versão `1.8.0`, com **247 arquivos regulares**. O preparado d1 tem **925 chaves** em `candidate.runtime_identity`, com **zero chaves `@noble/`**. O inventário integral, SHA-256 e tamanho de cada arquivo estão em [installed-dependency.json](installed-dependency.json).

O pacote não exporta `./package.json`. O fallback já existente no coletor resolve a entrada do pacote e sobe até seu manifesto. Essa resolução funciona para a versão instalada: a entrada `require` é `index.js`; os exports BLAKE3 e utils têm variantes CJS e ESM. O coletor coleta todo o diretório de um pacote externo, portanto a dependência declarada corretamente alcança ambas as variantes e os demais arquivos. Nenhuma execução do coletor corrigido ocorreu aqui.

Os pontos de recusa existentes são relevantes:

| Porta | Conferência no código db9 |
| --- | --- |
| `admitEvaluation` | Refaz `prepareEvaluation`; candidato diferente causa `evaluation-candidate-drift` |
| `admitEvaluationRebuildTarget` | Compara a identidade atual; divergência causa `evaluation-target-identity` |
| `ownership.index/read` compostos | `evaluationManifestRefusal` compara `candidate.runtime_identity`; divergência é apresentada como `ownership-untrusted` com evidência `evaluation-runtime-drift` |
| `prepareEvaluationUpdate` | Compara a identidade do baseline; divergência causa `evaluation-rebuild-runtime-drift` |
| `finalizeEvaluationUpdate` | Confere novamente identidade e integridade do alvo |

Um guard externo opcional não altera essas condições internas nem faz os caminhos diretos passarem pelo guard. A proposta corrige o grafo que a própria implementação usa.

## 3. Delta mínimo proposto

[minimal-dependency-proposal.patch](minimal-dependency-proposal.patch) modifica exatamente dois arquivos de db9:

1. Acrescenta `"@noble/hashes": "^1.8.0"` a `modules/atlas/packages/kernel/package.json`.
2. Acrescenta a mesma dependência ao registro `packages/kernel` de `modules/atlas/package-lock.json`.

O lock já resolve Noble `1.8.0`, com integridade `sha512-jCs9ldd7NwzpgXDIf6P3+NrHh9/sD6CQdxHyjQI+h/6rDNo88ypBxxz45UDuZHz9r3tNz7N/VInSVoVdtXEI4A==`. Não se propõe atualização de versão ou de algoritmo. A instalação e os workflows Atlas inspecionados usam `npm ci` em `modules/atlas`, por isso este é o lock pertinente; nenhum delta no `bun.lock` foi proposto.

Não é necessário adicionar um nome hardcoded a `evaluationRuntimePackages` para corrigir esta omissão: a travessia transitiva existente já cobre a dependência quando o pacote que a importa a declara. Manter a dependência apenas no agregador continuaria permitindo a mesma lacuna. Uma alteração mais geral do coletor para descobrir imports não declarados exigiria outro escopo e não é apresentada como parte deste conserto.

O manifesto do agregador permanece intacto nesta proposta para evitar uma migração de dependência desnecessária. O dono pode normalizá-lo posteriormente, com identidade e evidência próprias.

## 4. Controle focal concreto proposto

[evaluation-runtime-noble.test.ts](proposed-tests/evaluation-runtime-noble.test.ts) é um arquivo de teste proposto para `modules/atlas/packages/adapter-io/test/evaluation-runtime-noble.test.ts`. [focal-control-proposal.patch](focal-control-proposal.patch) adiciona somente esse arquivo. [candidate-proposal.patch](candidate-proposal.patch) reúne os dois manifestos e o teste, para aplicação futura pelo dono.

O controle usa a fixture existente `ownershipFixture` e as APIs reais de preparo, admissão e composição. Os reviewers e decisões contidos nele estão identificados como **dados sintéticos de CI**, sem relação com os juízes da S2. Não há mock de `node:fs`, do coletor, de candidatos ou do leitor.

O caso proposto verifica, nesta ordem:

1. A declaração da dependência no kernel, a versão instalada `1.8.0`, 247 membros Noble e os hashes físicos de manifesto, BLAKE3 e utils CJS/ESM.
2. Uma fixture mínima preparada e admitida pelas APIs reais, seguida de `index/read` compostos positivos.
3. Acrescentar somente um comentário aos dois arquivos BLAKE3 instalados, CJS e ESM. O teste exige arquivos regulares com `nlink === 1` antes de escrever.
4. Confirmar que o valor de um hash de prova permanece igual, mas os dois hashes de bytes e a identidade de runtime mudam.
5. Refazer `prepareEvaluation` e exigir outro candidato, preservando observações de fontes e os bindings das entradas da fixture.
6. Chamar `admitEvaluation` diretamente com o candidato anterior e exigir `evaluation-candidate-drift`, sem nova projeção.
7. Chamar `index/read` compostos e exigir a recusa interna `evaluation-runtime-drift`, mantendo a projeção anterior.
8. Restaurar os bytes originais em `finally`; conferir identidade original, mesmo candidato da fixture e retomada de `index/read`.

Ao concluir no CI, o teste escreverá `ownership-noble-drift-receipt.json`, com identidades completas, candidatos, arquivos antes/depois, recusas e restauração observadas. O reporter Vitest produzirá outro JSON com o resultado do caso. Esses arquivos **não existem como recibos executados nesta entrega**.

O teste deve executar sozinho em um checkout descartável instalado por `npm ci`, antes de qualquer grupo concorrente que use os mesmos arquivos. Ele não testa troca hostil durante uma chamada de hash ou falha de energia; o comentário foi escolhido para exercitar a identidade de bytes sem alterar o algoritmo. A restauração é parte do controle, não uma permissão para ignorar drift.

## 5. CI: comandos e porta reais

Comandos propostos **para o runner CI**, após aplicação e commit pelo dono, com CWD no `modules/atlas` do novo candidato:

```sh
npm ci
bun typecheck
npx --no-install vitest run packages/adapter-io/test/evaluation-runtime-noble.test.ts \
  --reporter=default --reporter=json --outputFile=ownership-noble-results.json
```

O arquivo `.github/workflows/atlas-pilot.yml` em db9 já declara `workflow_dispatch`, checkout, setup Bun/Node, `npm ci`, `bun typecheck`, Vitest e upload de `modules/atlas/ownership-*.json`. [optional-existing-ci-step-proposal.patch](optional-existing-ci-step-proposal.patch) acrescenta o comando focal como etapa própria imediatamente antes do grupo existente. Não muda o grupo, os critérios, o gatilho ou o upload. Seu uso é opcional ao dono; não foi aplicado ou disparado.

Esse workflow aceita push em `pilot-check-*` e `genesis-fresh-s4`; **um push normal em `genesis-interfaces-resume` não o dispara**. O dono deve escolher uma rota CI já autorizada para o candidato identificado. O conector disponível nesta investigação foi usado apenas para leitura; nenhuma capacidade de dispatch por POST foi presumida.

Não substituir o comando por `bun run test:ci atlas ... --runner vitest`: o validador inspecionado aceita `bun`, `node`, `pytest` ou `playwright`, e não oferece esse runner. O caminho habitual `test:ci` também usa `gh` no uploader, proibido pela skill desta campanha. Nenhum comando desse tipo foi executado.

Após alteração de código, as verificações afetadas e os guards continuam exigidos pelo repositório. A etapa existente usa, da raiz, `bun run check:guards --base origin/dev`. O dono deve registrar o SHA real dessa base. Este relatório não transforma a antiga suíte 278 em prova do novo delta, nem exige repetir testes não afetados sem motivo concreto.

## 6. Escopo da proposta S2 → S4

O protocolo fixado `ee2521a5b966bd505cc95bd1c733e09e12f33531` foi relido via GitHub MCP. `fatia-2.md` determina que uma alteração necessária fora da propriedade S2 siga como proposta ao dono, sem edição concorrente. `execute-genesis` permite adaptações/correções necessárias, mas reserva a escrita de cada branch ao principal responsável. `runtime.md` exige distinguir o código realmente executado e reavaliar bindings/provas afetados. [Fontes fixadas](source-pins.json).

Assim, a entrega concreta agora é transportar **este relatório, o patch e o controle proposto no namespace S2 da branch `genesis-interfaces-resume`**, sem integrar db9, modificar a branch S4 ou apresentar a proposta como release. A aplicação ao runtime e sua publicação como candidato comum pertencem ao dono responsável. Não foi enviado pedido a esse dono ou a terceiros por esta investigação; a publicação do pedido cabe ao principal S2.

Não foi descoberta uma obrigação adicional de S4 executar os 14 casos do domínio. O pedido é estreito: corrigir a dependência comum, qualificar as portas afetadas e disponibilizar uma revisão identificada que S2 possa consumir.

## 7. Efeito obrigatório sobre o próximo prepare S2

**Adicionar a dependência muda bytes do runtime.** O d1 anterior não se torna compatível por receber um anexo ou por conservar o mesmo corpo de conhecimento. Após o dono disponibilizar o candidato corrigido e sua evidência, a S2 deve:

1. Fixar o novo commit do runtime, o release/handoff pertinente, os dois manifestos, os arquivos instalados, as versões efetivas e os resultados CI afetados.
2. Rever os helpers e o byte-lock atualmente fixados em db9; produzir novos pins ligados aos bytes realmente usados. Uma contagem externa de 1170 não prova igualdade de arquivos ou de hashes.
3. Preservar d1, seus recibos e o parecer integral anterior. Preparar o pacote nativo exato em uma nova execução CAS-only, com plano e isolamento coerentes e saída externa nova. Os artefatos semânticos originais continuam sendo evidência preservada; isso não é nova aprovação de runtime.
4. Usar a porta existente, com CWD no `modules/atlas` do novo runtime:

```sh
bun scripts/genesis-evaluation.ts prepare <nova-raiz-isolada-S2> <plano-relativo-novo> <novo-prepared-externo.json>
```

5. Registrar o **novo candidato e o novo recibo integral**, comparando conjuntos completos de chaves e hashes, não somente contagens.
6. Reapresentar a transformação, o candidato e a evidência corrigidos aos **mesmos dois juízes persistentes**, obtendo duas decisões novas para essa versão. Não reutilizar o PASS final anterior de J1 para o candidato d1 (52/52 critérios); não converter o HOLD anterior de J2 nem substituí-lo. Este relatório não emite um terceiro voto.

`925 + 247 = 1172` é somente uma **predição aritmética prospectiva** se a instalação, os demais membros e a forma de coleta permanecerem iguais. O teste proposto usa o pacote Noble 1.8.0 atualmente fixado; somente a execução nova determinará a contagem intrínseca, os hashes e os IDs reais. Não se declara aqui candidato novo, quantidade observada nova ou travessia concluída.

## 8. Verificação efetivamente realizada

[static-validation.json](static-validation.json) registra `git apply --check` com exit 0 para os quatro patches e parsing TypeScript sem diagnósticos. Não houve typecheck, emissão compilada ou execução de teste. O arquivo do teste continua ausente do checkout do runtime; kernel, lock, coletor e workflow permanecem iguais ao HEAD db9.

[source-pins.json](source-pins.json) registra SHA Git, SHA-256, tamanho, caminho e cópia local dos bytes decisivos. As respostas GitHub integrais estão em `github/`; nenhuma captura anterior foi sobrescrita. O próprio pedido do principal permanece fora de qualquer decisão de admissão.
