# Staging final e operação native prepare

O utilitário `stage_final_native.py` prepara somente arquivos e um plano. Nunca chama Bun, runtime, Git, testes, rede, publicação ou alteração de autoridade. A operação real permanece reservada à principal após aceitação dos 13 artefatos.

## Uso

Diretório de trabalho: `/workspace/scratch/7b5d6430f420/genesis-s2`.

```bash
python assembly-tools/stage_final_native.py --inspect-current --report-dir assembly-tools/inventario-novo
python assembly-tools/stage_final_native.py --report-dir assembly-tools/plano-final-novo
python assembly-tools/stage_final_native.py --apply
```

A primeira forma inspeciona o pacote real ainda incompleto. A segunda exige as condições finais, mas continua somente leitura. A terceira materializa e sela arquivos após conferir essas condições. Cada diretório de relatório deve ser novo. Nenhuma dessas formas executa prepare. O inventário desta entrega foi gerado apenas com a primeira forma.

O padrão de source-root é `runtime-work/source-root`. `--source-root` permite outra raiz isolada dentro de `runtime-work`, previamente materializada, sem Git nem CAS. Um payload já selado nunca é sobrescrito. `--origin-map mapa.json` aceita um objeto JSON de rótulo histórico exato para arquivo capturado relativo ao workspace; não autoriza ler fora dele nem dispensar um hash declarado.

## Condições e arquivos preservados

A principal deve finalizar exatamente esta representação, sem IDs runtime inventados:

```json
{"entry":"s2.l4.entry"}
```

O artefato real deve ter `need: "entry"` e `layer: 4`. O parser fixado aceita raízes por necessidade e percorre `navigation` e `build_dependencies`. O utilitário confirma que os 13 nomes exigidos estão presentes e alcançáveis, que todos são `supported`, possuem ao menos duas referências reais de decisão e que seus predecessores de build existem antes dos dependentes. Ele não altera raízes, links, decisões, aceitação ou conteúdo. A contagem de referências não autentica os juízes; a aceitação continua sendo a registrada pela principal.

O prefixo de payload é:

`modules/atlas/docs/design/genesis-chatgpt-results/20261111-v3-fresh/s2/`

São copiados o pacote final, corpos, fontes, recipes, requests/responses, decisões, referências explícitas de evidência, manifests aceitos e dependências transitivas de arquivo. Os caminhos nativos permanecem exatos. Capturas de fonte são reconciliadas com os manifests canônicos e seus SHA256/Git blob SHA. Os 641 originais já materializados são inventariados, verificados e preservados; fontes novas precisam de reconciliação canônica pela principal antes de staging.

Referências históricas locais são preservadas por hash sob `staged-provenance/<sha256>/<nome>`, com rótulo original e destino no `resolution_map` do plano. Nenhum corpo é reescrito. Os 13 arquivos de protocolo retidos são conferidos contra o inventário de retomada; o transport consumido pelo runtime também é conferido contra a referência nativa fixada. Isso preserva os recibos existentes sem inventar um checkout ou observação Git atual.

JSON com referências tipadas, evidência JSON codificada, manifests de fonte e hashes de corpo/decisão é seguido transitivamente. Código-fonte, envelopes originais de connector e pacotes auxiliares de request são dados opacos. Uma menção em prosa ou entrada de população em árvore Git não vira uma captura de fonte fictícia. Caminhos de arquivos efetivamente declarados ausentes ou com hash divergente bloqueiam staging e são listados, incluindo pedidos de captura pública adicional.

`--apply` verifica novamente todas as leituras, preserva tentativas falhas, escreve sem sobrescrever originais e sela o payload com permissões somente leitura. Gera `runtime-work/final-staging/<SHA256-do-pacote>/stage-plan.json` e `sealed.json`. Essas permissões e hashes detectam/preservam imutabilidade operacional; não são um mecanismo contra outro processo privilegiado. O diretório de operação fica separado do payload para os futuros recibos.

## Comando real de prepare

O plano final contém um `prepare-request.json` com `cwd`, vetor `argv`, saída, logs e caminho de recibo exatos. O SHA do pacote **final** determina o diretório de operação. No diretório:

`/workspace/scratch/7b5d6430f420/genesis-s2/runtime-work/runtime-code/modules/atlas`

a operação documentada é:

```text
/workspace/scratch/7b5d6430f420/genesis-s2/runtime-work/tools/bun-package/bin/bun scripts/genesis-native.ts prepare /workspace/scratch/7b5d6430f420/genesis-s2/runtime-work/source-root modules/atlas/docs/design/genesis-chatgpt-results/20261111-v3-fresh/s2/native-package.json /workspace/scratch/7b5d6430f420/genesis-s2/runtime-work/final-staging/<SHA256-do-pacote-final>/prepared.json
```

O marcador acima é substituído pelo valor exato de `prepare_request.argv` do plano final; o inventário atual não é autorização para executar seu comando.

Antes da execução autorizada, conferir o selo e os hashes do pacote/arquivos, a implementação candidata, o executável Bun, ausência de CAS anterior e inexistência do arquivo de saída. O diretório de saída deve existir. Registrar a autorização concreta, comando, cwd, versões, horários, stdout/stderr integrais, código de saída, hashes de cada log, estado de CAS antes/depois e hash da saída se existir. Preencher `candidate_id` somente a partir da saída real bem-sucedida. O template de recibo desta entrega mantém campos de execução nulos.

O CLI chama `prepareNativePackage` **antes** de validar/criar o arquivo de saída. A preparação valida o pacote, abre o DiskStore em `.atlas/cas`, preserva referências, lê/observa entradas e armazena resultados/candidato. Apenas depois escreve a saída JSON com exclusividade (`wx`) e imprime o resultado JSON no stdout. Falhas podem deixar CAS parcial ou completo; inclusive uma falha tardia por saída existente/diretório inexistente pode ocorrer após a criação do candidato. Registrar erro real, saída parcial e estado; não apagar CAS, repetir automaticamente ou chamar falha de prepare completo. Em erro tratado, o CLI imprime JSON de erro no stderr e termina com código 1. Um processo encerrado externamente pode produzir outra condição de saída.

## Limite atual confirmado

O release r1/candidato `e3a8ab8cf56dbff1ee91272df51ffa398d882aa1` lê fontes e entradas `file:` com teto explícito de **256000 bytes**. A configuração não possui override nesta operação. Os seguintes arquivos devem permanecer íntegros e impedem compatibilidade com esse limite:

| Caminho | Bytes |
|---|---:|
| `schema/tui.json` | 1131057 |
| `<prefixo>/inputs/app-session-tree.json` | 369462 |
| `<prefixo>/inputs/design-tui-tree.json` | 390775 |

O tree desktop tem 96767 bytes. O teto padrão de 8 MiB para pacote/corpo/referências não substitui o teto explícito das fontes/entradas. O utilitário reporta `HOLD_KNOWN_R1_INPUT_LIMIT`, mantém todos os bytes e permite apenas staging; não altera runtime, cap ou fontes. Uma execução futura do r1 pode demonstrar a recusa, mas não deve ser descrita como preparação compatível. Qualquer solução exige um release compatível autorizado ou tratamento pela fatia responsável; esta entrega não o inventa.

Referências de implementação: `scripts/genesis-native.ts`, `packages/adapter-io/src/genesis-native-format.ts`, `genesis-native.ts`, `genesis-native-io.ts` e `ownership-input.ts` no runtime materializado. Seus hashes ficam no plano.
