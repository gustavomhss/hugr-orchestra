# S2 — materialização independente do runtime

## Resultado

Estado: **MATERIALIZED_PREPARE_HOLD**. A fonte S2 e a implementação do runtime r1 estão materializadas em diretórios próprios, com verificações de bytes. Nenhum build, teste de produto, `prepare`, publicação, parecer semântico ou review de binding foi executado por este trabalho. Não houve escrita remota nem leitura do oracle reservado.

Execução: `46d09d97-39a9-482a-a290-646ba1d94c99`. O recibo consolidado está em `receipt.json`; a evidência detalhada está nos manifests citados abaixo.

## Pins conferidos

| Objeto | Identidade |
| --- | --- |
| Repositório | `gustavomhss/hugr-orchestra` |
| Fonte S2 | `1cde2ff7a71bcf7aecb5d030917b577165135d38` |
| Protocolo | `ee2521a5b966bd505cc95bd1c733e09e12f33531` |
| Release S4 | `b42d14978c8b727310369920d4bfaf86145a2b80` |
| Release ID | `20261111-v3-fresh-s4-r1` |
| Candidato de código | `e3a8ab8cf56dbff1ee91272df51ffa398d882aa1` |
| Blob do release | `6d02108e688e488f0ca86075fba37bce7f4bc6b2` |
| SHA-256 do release | `47deabb52ee93e18de06c68c1c27a0ff810a4e779a5087581080e87d6756979f` |
| SHA-256 de transport.md | `02dbf78b9eb76c894d07c9e498704d2260157b7b10d5e1d159a0fd1037e73e3c` |

A releitura de `genesis-fresh-s4` ao concluir a materialização devolveu o mesmo blob e os mesmos bytes de r1. Não foi adotada outra versão durante o trabalho. Foram preservadas as respostas do conector, inclusive a tentativa inicial de árvore recursiva integral que retornou `Transport closed`; a verificação utilizou depois árvores menores completas, com `truncated:false`.

O release fixa apenas `prepare` como capacidade comprovada em sua amostra S4. Binding, publicação, index e read constam como `NOT_RUN` no próprio release. Estes estados não são provas de execução S2. Fontes: [release r1](https://github.com/gustavomhss/hugr-orchestra/blob/b42d14978c8b727310369920d4bfaf86145a2b80/modules/atlas/docs/design/genesis-chatgpt-results/20261111-v3-fresh/s4/runtime-release.json) e `github/runtime-release-connector.json`.

## Fonte isolada

Diretório: `source-root/`.

| Produtor | Registros conferidos |
| --- | ---: |
| desktop-web | 193: 148 registros principais e 45 capturas não usadas como inspeção direta |
| app-session | 251 |
| design-tui | 196 |
| Total | 640 |
| Arquivos únicos | 636 |
| Bytes únicos | 6.428.924 |
| Conflitos | 0 |

Cada captura foi conferida contra seu SHA-256, tamanho, hash Git de blob e entrada da árvore GitHub do baseline. As quatro repetições são cópias idênticas: duas ocorrências adicionais de `AGENTS.md`, uma de `packages/app-shell/AGENTS.md` e uma de `script/module-readme.ts`. Nenhuma captura foi descartada para tornar o pacote executável.

A ligação das árvores ao commit foi conferida pela serialização de objetos Git em 31 raízes/subárvores. A árvore raiz do baseline calculada é `a522a53e5f046f1758151b0f558531bbded04592`; a do candidato é `9fb1964f17f7fce054455ae485b6b00848217ff6`, ambas iguais aos ponteiros dos respectivos commits obtidos pelo conector. Evidência: `source-materialization.json` e `tree-linkage-verification.json`.

Esta fonte é uma reconstrução verificável, sem `.git`, HEAD, tracking ou histórico locais. Não há `.atlas`, CAS ou projeção nela. Não contém symlinks. Observação `members:` dependente de Git não está pronta; o pacote inspecionado usa inputs `file:`.

## Implementação e dependências

Diretório do código: `runtime-code/modules/atlas/`. Foram copiados **406 arquivos exatos** do candidato. Todos conferem com os blobs do conector; não houve mismatch de cache. A seleção inclui `src`, manifests e tsconfigs dos pacotes Atlas, o entrypoint e o postinstall necessário. Cinco arquivos de teste que vivem dentro de `src` foram preservados como parte desses bytes; não foram executados. Não foram reutilizados `dist`, builds, CAS, store ou projeção S4. Evidência: `runtime-materialization.json`.

As **152 dependências externas presentes no ambiente S4** foram restauradas em diretório S2 a partir de tarballs já existentes no cache npm. Cada SHA-512 foi comparado ao `package-lock.json` verificado no candidato: blob `52385ecfa7a9ee21c5ce3918790029687cddfcd0`, SHA-256 `b3c505a0227808e04acf49138a1acccfd3e1a0e9b5476a5f9748fccd84e1a06f`. Foram materializados 6.287 arquivos, sem rede e sem executar scripts de pacote. Os 23 registros de lock não presentes no cache instalado são opcionais de plataformas/arquiteturas. Todos os links de workspace e de binários resolvem dentro da área de código S2. Evidência: `dependency-materialization.json`.

Versões observadas: Bun **1.3.14**, Node **v24.22.1** e TypeScript **5.9.3**. O Bun isolado está em `tools/bun-package/bin/bun`, SHA-256 `9fd36f87e4b90b07632b987a2e4ec81ca15a62c81bf983190cea6d715be2ad74`, idêntico em bytes ao executável usado no cache S4. Sua restauração verificou o tarball contra o lock local preservado das ferramentas S4; o release GitHub fixa a versão, não esse digest de binário. Esta distinção está no recibo.

Antes do build futuro, falta executar o postinstall já versionado `scripts/fix-scip-types.mjs` nesta cópia; ele ajusta `types/exports` do pacote `@c4312/scip`. O build futuro deve partir do projeto `packages/adapter-io` e suas referências. A seleção não é um checkout completo para executar a suíte global.

## Pacote: observações originais e situação mais recente

O snapshot original foi preservado byte a byte em `inspection/native-package-original.json`, conferido com a cópia histórica indicada pela principal:

`d0bf942164e6b69c3cd89e9d4a0808a5f4ddcbb450d6c40045b2d0952c9aa0cd`.

Nele, `evidence` continha objetos, enquanto r1 exige `string[]`, e os três `recipe_ref` não estavam em `input_keys`. Esses eram achados de inspeção estática, sem execução do validador. A principal os corrigiu.

O snapshot posterior, preservado em `inspection/native-package-current.json`, tem SHA-256:

`9dacfc3c7837655b1de7b16adf953465c481e207ddc8df8afda74baea342f8ff`.

Nesse snapshot, as evidências são strings e as três receitas são inputs. O pacote permanece `IN_PROGRESS`: **13 chaves requeridas, 3 artefatos presentes e 10 ausentes**, incluindo `s2.l4.entry`; `roots={}`; os três artefatos estão `blocked` e não contêm referências a pareceres semânticos. Esses campos são coerentes com trabalho pendente, mas impedem tratar o pacote principal como seleção completa aceita para r1. O oracle foi identificado apenas pela referência já presente no pacote; seu conteúdo não foi aberto. Evidência: `package-structure-audit.json`.

## Limite real de schema/tui.json

O arquivo preservado tem **1.131.057 bytes**, blob `9250e2ec0c6e433ade0d5a172e8156087022f217` e SHA-256 `16c4dd2d51f4b32b397cb9effa31cfc9c48dd7aa546f28b149f106e64d01d0e2`.

O candidato r1 usa `readNativeFile(root, source.path, 256000)` para cada `source_ref`, além da leitura dos inputs com o mesmo teto. O observador também retorna `unavailable` acima de 256.000 bytes. A recusa prevista na passagem de fonte é `native-file-limit: schema/tui.json`. Não existe flag/configuração de aumento no entrypoint observado. Alterar apenas o teto padrão de 8 MiB de corpos/referências não resolve os limites explícitos de fonte e observação. Esta é conclusão estática do código, não erro obtido por executar o pacote. Fontes: [adapter](https://github.com/gustavomhss/hugr-orchestra/blob/e3a8ab8cf56dbff1ee91272df51ffa398d882aa1/modules/atlas/packages/adapter-io/src/genesis-native.ts), [observador](https://github.com/gustavomhss/hugr-orchestra/blob/e3a8ab8cf56dbff1ee91272df51ffa398d882aa1/modules/atlas/packages/adapter-io/src/ownership-input.ts) e manifests locais.

Uso compatível com r1 só pode alcançar seleções completas já aceitas que não incluam esse input. Uma futura preparação independente de artefatos desktop-web/app-session pode conservar todos os inputs desses artefatos, deixando design-tui e a entrega S2 explicitamente pendentes. Este trabalho não criou essas seleções nem alterou a população principal.

Feedback mínimo para S4: publicar revisão explícita que trate a mesma fronteira de tamanho no observador e nas leituras de fonte do adapter, preservando os bytes originais, a identidade kernel, os checks de corrida e a distinção `absent/unavailable`. Essa revisão precisa de sua própria prova/gate em Actions e novos bindings dos candidatos afetados. Recortar o schema, trocar seu input por um digest ou remover sua referência não é uso equivalente do candidato atual. Nenhum runtime foi editado aqui.

## Próxima operação e isolamento

A sintaxe real é:

`bun scripts/genesis-native.ts prepare <isolated-source-root> <native-package-path-relative-to-source-root> <new-output-path>`

O CWD é `modules/atlas`. O código e a fonte podem estar em diretórios diferentes. `prepare` preserva referências, observa inputs e escreve CAS sob `source-root/.atlas/cas`; não publica conhecimento. A saída é exclusiva (`wx`), e seu diretório precisa existir. O runtime não confirma sozinho a associação histórica dos refs a commits; este vínculo depende da evidência externa preservada.

O pacote aceito, corpos e todas as referências devem ser materializados no source root antes de executar. A referência de protocolo exata está disponível em `support/transport.md`. O oracle reservado deve ser colocado somente pelo principal autorizado, sem repassá-lo ao produtor. Nenhum payload pendente foi preparado ou ativado.

Os comandos propostos, ainda não executados, constam em `commands.md`. Testes de produto continuam exclusivos de GitHub Actions. Esta entrega conclui a infraestrutura independente solicitada, não a aceitação semântica nem a entrega final S2.
