# S2 — suplemento de fontes, build e plano full13

## Resultado

**BUILD_PASS_PREPARE_HOLD.** A fonte isolada foi ampliada sem alterar os arquivos anteriores. O postinstall documentado e o typecheck do adapter terminaram com exit code 0. Não houve testes de produto, `prepare`, publicação, mudança de autoridade, escrita remota, leitura de oracle ou de pacotes de revisão. Os 12 entregáveis listados no manifesto anterior conservam seus hashes.

O recibo consolidado é `receipt.json`; as saídas completas dos comandos e suas identidades estão em `commands/`. Este suplemento conserva os recibos anteriores como registros históricos e não os reescreve.

## Reconciliação de fontes r2

| Medida | Resultado |
| --- | ---: |
| Capturas desktop-web | 193 |
| Capturas app-session | 255 |
| Capturas design-tui | 198 |
| Capturas totais | 646 |
| Arquivos únicos materializados | 641 |
| Bytes únicos | 6.450.330 |
| Capturas adicionais | 6 |
| Arquivos únicos adicionais | 5 |
| Conflitos | 0 |

Foram adicionados:

- `packages/app-shell/src/orchestra/chapters/skills-data.ts`
- `packages/app-shell/src/orchestra/chapters/skills-dialog.tsx`
- `packages/protocol/src/groups/skill.ts`
- `packages/server/src/handlers/skill.ts`
- `packages/protocol/src/groups/permission.ts`

A sexta captura, `packages/protocol/src/groups/session.ts`, é idêntica ao arquivo já materializado. Para cada nova captura, os bytes decodificados da resposta original do conector foram comparados ao arquivo canônico, ao SHA-256, tamanho e blob Git. As entradas das árvores GitHub já fixadas confirmam o vínculo ao baseline `1cde2ff7a71bcf7aecb5d030917b577165135d38`. Os seis envelopes originais foram preservados em `original-captures/`. Os manifests canônicos coincidem com o recibo da principal.

Os 640 registros e 636 arquivos do primeiro materializado foram conferidos novamente e permanecem idênticos. Evidência: `source-supplement.json`.

## Execuções locais autorizadas

| Operação | CWD | Exit | stdout | stderr |
| --- | --- | ---: | --- | --- |
| Bun `--version` | runtime Atlas S2 | 0 | `1.3.14` | vazio |
| Node `--version` | runtime Atlas S2 | 0 | `v24.22.1` | vazio |
| `node scripts/fix-scip-types.mjs` | runtime Atlas S2 | 0 | confirmou ajuste de types/exports de @c4312/scip | vazio |
| `bun run typecheck` | `runtime-code/modules/atlas/packages/adapter-io` | 0 | vazio | `$ tsc -b` |

TypeScript observado no manifesto instalado: **5.9.3**. O Bun utilizado é o executável próprio em `runtime-work/tools/bun-package/bin/bun`.

O postinstall alterou somente o package.json instalado de `@c4312/scip` conforme o script documentado; os hashes anterior e posterior estão no recibo de build. Os **406 arquivos de fonte do candidato** foram conferidos antes e depois, sem alteração. A compilação produziu os `dist` necessários, incluindo kernel, knowledge e adapter-io; exemplos com hashes estão no recibo consolidado.

Este resultado é de build/typecheck local. Não representa CI nem execução de testes. Evidência: `build-receipt-initial.json`, `commands/fix-scip-types.*` e `commands/typecheck-adapter-io.*`.

## Release S4

Foi feita **uma** leitura do arquivo de descoberta em `genesis-fresh-s4`. Ele continua em `20261111-v3-fresh-s4-r1`, com blob `6d02108e688e488f0ca86075fba37bce7f4bc6b2` e SHA-256 `47deabb52ee93e18de06c68c1c27a0ff810a4e779a5087581080e87d6756979f`, idêntico ao release anteriormente fixado em `b42d14978c8b727310369920d4bfaf86145a2b80`.

Foi mantido o candidato `e3a8ab8cf56dbff1ee91272df51ffa398d882aa1`. Não foi observada revisão compatível com os arquivos grandes. A leitura não resolveu o novo HEAD da branch; a igualdade afirmada é dos bytes do release. Evidência: `release-recheck.json` e `github/runtime-release-connector.json`.

## Três inputs impedem o full13 em r1

O prefixo de payload é:

`modules/atlas/docs/design/genesis-chatgpt-results/20261111-v3-fresh/s2`.

| Input | Bytes | Limite r1 |
| --- | ---: | ---: |
| `schema/tui.json` | 1.131.057 | 256.000 |
| `<prefixo>/inputs/app-session-tree.json` | 369.462 | 256.000 |
| `<prefixo>/inputs/design-tui-tree.json` | 390.775 | 256.000 |
| `<prefixo>/inputs/desktop-web-tree.json` | 96.767 | 256.000 |

Os três snapshots de população já constam nos input_keys do snapshot mais recente usado pelo plano. São arquivos de snapshots capturados, não observações `members:` de um checkout local. O snapshot desktop-web cabe no teto; os demais dois não. Os três arquivos grandes devem ser conservados inteiros, sem recorte, omissão ou substituição por digest.

Em r1, a fonte schema encontra a leitura explícita de 256.000 bytes; os snapshots grandes, quando observados como inputs, recebem `unavailable` do observador. O comando completo não pode prosseguir com o release atual. A correção precisa vir de uma revisão S4 explicitamente compatível e fixada. Nenhum runtime foi alterado neste trabalho.

## Inventário concreto para staging e full13

`prepare-plan.json` registra **610 caminhos conhecidos**, com o caminho absoluto esperado sob `source-root`, papéis, hashes, tamanhos, origem local e estado de staging. Desses, 596 são fontes referenciadas já verificadas; o diretório contém também as 45 fontes capturadas que não são inputs dos três artefatos atuais.

Além das fontes, os caminhos conhecidos necessários são:

| Base | Arquivos |
| --- | --- |
| Raiz da fonte | `.orchestra/skills/execute-genesis/references/transport.md` |
| Prefixo de payload | `native-package.json` |
| Prefixo de payload | `layers/l1/desktop-web/l1.md`, `layers/l1/app-session/l1.md`, `layers/l1/design-tui/l1.md` |
| Prefixo de payload | `corrections/l1-r2/producer-request.md`, `corrections/l1-r2/producer-response.md` |
| Prefixo de payload | `requests/l1-desktop-web.md`, `requests/l1-app-session.md`, `requests/l1-design-tui.md` |
| Prefixo de payload | `inputs/desktop-web-tree.json`, `inputs/app-session-tree.json`, `inputs/design-tui-tree.json` |
| Prefixo de payload, somente principal | `oracles/ownership-v1.json` |

O conteúdo do oracle não foi aberto nem verificado por este trabalhador. As referências a decisões semânticas devem ser colocadas pela principal quando existirem; não foram lidas ou inventadas. O payload ainda não foi copiado para o source root.

O snapshot do pacote usado pelo plano tem SHA-256 `70a76c24d80af669a4b13b88eb26635294ef0ad28c490fd73066eb2f1ce293ef`, **13 chaves requeridas e apenas 3 artefatos L1 presentes**. Os três L2, três L3, três L4 de domínio e `s2.l4.entry` não possuem ainda body.path, receita e referências no manifesto. O plano preserva essa ausência como `null`, em vez de inventar caminhos. Quando forem produzidos e aceitos, os caminhos exatos devem ser derivados do manifesto final.

O preparo full13 exige todos os 13 artefatos, roots coerentes, alcance de todas as chaves, dependências aceitas e ordenadas, dois pareceres semânticos preservados por artefato, todas as referências materializadas e um runtime compatível com os três inputs grandes. A sintaxe concreta está em `commands.md`. A saída proposta é `runtime-work/outputs/s2-full13-prepared-v1.json`; o futuro CAS ficará exclusivamente em `runtime-work/source-root/.atlas/cas`. Nenhum desses estados foi criado.
