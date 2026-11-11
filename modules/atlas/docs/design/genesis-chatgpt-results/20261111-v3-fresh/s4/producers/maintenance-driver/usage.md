# S4 maintenance-operation — uso e limites

Estado desta entrega: **produção e revisão estática apenas; execução operacional NOT_RUN**. O arquivo é um reproducer da campanha S4, não uma porta pública nova. O runtime previsto pelo principal é `7102f2e3a1a9a3822bcd0ae054b36ecffe9da553`; esta entrega não verificou esse commit remotamente nem executou seu produto. Os bytes locais consultados constam de `source-observations.json`.

## Invocação

O principal deve persistir o script, com os mesmos bytes, em:

```text
modules/atlas/docs/design/genesis-chatgpt-results/20261111-v3-fresh/s4/runtime/maintenance-operation.mjs
```

O mesmo caminho relativo deve existir no corpus e estar vinculado como input de **todas** as entries antes da primeira publicação. O script executado pode estar fora do corpus, desde que seus bytes coincidam com esse input; ambos são lidos e reobservados. Não há escrita automática dessa cópia, configuração de política, instalação ou preparação de autoridade.

São exatamente seis argumentos posicionais:

```text
bun maintenance-operation.mjs <mode> <runtimeAtlasRoot> <corpusRoot> <baselineManifest> <preparedTargetJsonPath> <bindingPath>
```

| Argumento | Conteúdo exigido |
|---|---|
| `mode` | `rebuild` ou `publish`. |
| `runtimeAtlasRoot` | Diretório real `modules/atlas` do runtime escolhido pelo principal, com dependências e resolução TS disponíveis para Bun. As portas são importadas desse diretório. |
| `corpusRoot` | Raiz real do repositório/corpus. Seu CAS existente é `.atlas/cas`. |
| `baselineManifest` | Hash de 64 hex minúsculos do manifesto anterior no CAS desse corpus. Não é um `candidate_id`. |
| `preparedTargetJsonPath` | Documento `genesis-native-prepared/v1` completo. Caminho absoluto ou relativo ao corpus; caminhos relativos seguem `nativePath`. |
| `bindingPath` | Caminho relativo ao corpus para `genesis-native-binding-approval/v1`, com as duas decisões reais exatas. |

Exemplo de formato, com variáveis que o operador deve preencher com os valores reais:

```bash
bun "$S4_DRIVER_PATH" rebuild "$S4_RUNTIME_ATLAS" "$S4_CORPUS" "$S4_BASELINE_MANIFEST" "$S4_PREPARED_TARGET_JSON" "$S4_BINDING_PATH"
bun "$S4_DRIVER_PATH" publish "$S4_RUNTIME_ATLAS" "$S4_CORPUS" "$S4_BASELINE_MANIFEST" "$S4_PREPARED_TARGET_JSON" "$S4_BINDING_PATH"
```

Estes exemplos não foram executados. O script não escolhe alteração de domínio, corpo, outputs, baseline ou decisões. O binding de execução não é substituído por uma aprovação semântica anterior. A primeira publicação precisa ocorrer fora desta operação: `publish` exige que o baseline informado ainda seja o manifesto publicado para o scope.

## Pré-condições do pacote

- O prepared deve rederivar exatamente por `prepareNativePackage(corpusRoot, candidate.transport.path)`: mesmo `candidate_id`, mesmo `id(candidate)` e mesmo JSON do candidate. Isso inclui root, HEAD observado, transporte, inputs e implementação nativa capturada.
- O baseline e o target devem ter a mesma sequência de keys, scope, roots, títulos, layers, needs, navigation, contrato, keys dos inputs e sequência de dependências de build. Resultados e versões dos inputs podem mudar. Diferenças estruturais geram recusa explícita; não são aplicadas implicitamente pelo driver.
- Os arrays de inputs do target e do baseline devem ter a mesma ordem lexicográfica usada pelo rebuild. Inclua explicitamente o protocolo nessa ordem antes de preparar: o importador acrescenta o protocolo ao final somente se ele estiver ausente. O driver não ordena ou reescreve receipts existentes.
- Cada entry deve vincular `file:modules/atlas/docs/design/genesis-chatgpt-results/20261111-v3-fresh/s4/runtime/maintenance-operation.mjs`. A versão nova deve ser a observação real dos bytes executados; a versão antiga pode divergir e acionar rebuild normal.
- Este reproducer aceita apenas `file:`. Todos esses inputs são obrigatórios. `members:`, outros tipos, adição/remoção de keys e mudança de topologia são recusados. `listMembers` sempre recusa se for chamado; não devolve lista vazia artificial.
- Os dois reviewers e todas as decisões/criteria/entries devem passar por `validateNativeBinding`. Requests e responses devem existir nos caminhos declarados, ser não vazios e ter os hashes declarados. O script não autentica pessoas a partir de strings nem interpreta a prosa para inventar um verdict; a associação entre resposta original e decisão estruturada continua sendo responsabilidade do operador autorizado.

As verificações de paths, symlinks, tipos de arquivo e tetos de leitura usam `nativeRoot`, `nativePath` e `readNativeFile`. Capturas de inputs e do script têm teto de 256.000 bytes; os demais documentos mantêm o teto nativo. O runtime selecionado deve permanecer o runtime fixado externamente pelo principal: o script não executa checkout, não certifica seu commit Git e não constitui atestação de todos os seus módulos transitivos.

## Composição efetiva

O script abre somente o CAS existente. Reprepara o transporte, carrega resultados/corpos por suas identidades e verifica os shapes e o round-trip UTF-8, inclusive BOM e bytes Unicode. Preserva `authorityBasis`, `validity`, `gaps` e `evidence` explicitamente; um resultado bloqueado não é promovido para supported.

O binding, o documento prepared e os requests/responses literais ficam preservados como `ownership-body` no CAS. A adaptação usa o tipo existente `OwnershipReview`, como o trecho de materialização do importador. Seu provenance identifica decisão, tipo de ID, candidate, binding, request, response e versão da recipe, e declara que o registro não é a prosa original. `verdict: "pass"` é somente a tradução dos `PASS` já validados pelo binding; nenhuma decisão é produzida aqui. `publishNativePackage` não é chamado.

O registry cobre todas as entries. Seus `declaredInputs` vêm dos bindings reais; `required` contém apenas as dependências de build na ordem real. A primeira captura de cada arquivo retém os bytes em memória, confere seu kernel `id` com observações reais antes e depois da leitura e nunca os substitui. Toda chamada posterior de `observe` lê novamente o host. `readCapturedBytes` entrega cópias dos bytes retidos, sem reler o caminho.

`run` só confere captura e dependências resolvidas e retorna o output carregado do CAS. Não abre arquivos vivos, não chama modelos e não produz texto novo. `evaluate` só entrega as duas referências reais de review se scope, result, arrays exatos e `id({inputs,dependencies})` coincidirem com o target. O `rebuildOwnershipUpdate` existente continua dono de planejamento, fechamento afetado, execução precisa, reúso, avaliação e candidato privado.

Após o rebuild, o driver compara todas as entries com o target e usa `readOwnership` com observações atuais para validar cada uma. Isso também cobre o caminho sem calls. Se o target pedir um resultado diferente sem mudança observável que faça a recipe executar, a saída é HOLD por divergência; o script não ativa diretamente o target nem força uma chamada para contornar o planner.

Reobservações adicionais verificam o arquivo executado, o prepared, o binding, os requests/responses e uma nova derivação integral do transporte antes e depois do rebuild e junto à ativação. O guard não substitui as reobservações internas do rebuild nem a porta `ownershipInput` do handler.

## Saída e efeitos

Há um único documento JSON completo em stdout. Não há log próprio, arquivo de respostas ou recibo operacional escrito pelo script fora do CAS. O operador pode capturar stdout pelos mecanismos da campanha. Os efeitos da publicação governada permanecem os do produto: projeção, CAS e eventuais registros nativos de `withKnowledgeLog`; o driver não desativa, redireciona ou altera esses mecanismos.

Em `rebuild`, o resultado é `kind: "candidate"` com `private_manifest`, `affected`, `calls`, `manifest_changed`, identidades `before`/`after` por key e metadados das capturas. Há também logs JSON dos callbacks que retornaram outputs e das avaliações. A projeção não é ativada. Um baseline histórico aceito pelo CAS é suficiente para essa reconstrução privada; isso, sozinho, não comprova que ele estava publicado.

Em `publish`, a mesma reconstrução é obrigatória. O driver deriva grounding real, compõe `composeRuntime(corpusRoot)`, verifica a seleção histórica do baseline publicado e chama `runtime.check` e `handler.handle("atlas-emit", {node,at})`. A seleção histórica serve apenas para conferir o baseline apesar do drift; a validação do candidato usa currentness real. A seleção do baseline é conferida novamente imediatamente antes da tentativa de emissão.

Policy, ator, ratify, trust e regras de ocupação são os da composição nativa. O script não escreve variáveis de ambiente, não fornece tokens no payload, não introduz seams de testes e não cria aprovação. Preserva `check` e `emission` integrais. Só `emission.ok === true` junto de `emission.data.emitted === true` permite seguir para readback; recusa, ausência de discriminante ou erro permanecem HOLD. O campo `emitted` preserva o boolean real ou registra `UNKNOWN`.

Depois de uma emissão positiva, reabre o runtime e consulta index das raízes e leitura atual de todas as entries. `readbacks` contém uma projeção explicitamente menor das leituras: identidades, indicador histórico, tamanho e SHA-256 do corpo. Os corpos completos permanecem no CAS. Recusas de leitura permanecem integrais. `published_manifest_matches_candidate` informa somente a observação do manifesto desejado; não transforma no-op em prova de uma nova ativação. `manifest_changed` distingue igualdade e troca em relação ao baseline.

Exit code `0` significa candidato privado concluído, ou emissão explicitamente positiva com readback coincidente. Exit code `1` significa recusa, erro ou readback sem correspondência completa. Esses códigos não são veredictos semânticos nem aceitação global de S4. Se ocorrer erro depois de chamar o handler, `activation_attempted: true` e o retorno já obtido permanecem no JSON; não se afirma ausência de efeitos.

## Limites da observação

As capturas, guards e gates detectam os drifts que observam. Não são um lock de todo o filesystem, uma transação sobre todos os arquivos ou um fence de época de produtores. A ativação conserva a atomicidade, os retries, a validação de incumbentes e as recusas já existentes no produto. A igualdade com o baseline é reobservada antes da emissão, sem prometer compare-and-swap adicional sobre esse argumento.

`calls` mede callbacks de importação determinística feitos pelo executor. `recipe_returns` e `evaluations` são registros locais desses callbacks; não são chamadas de modelo. As verificações completas e as rederivações de transporte continuam lendo arquivos e CAS, inclusive em no-op. Não há promessa de zero IO, zero custo total ou medição monetária. Campos de modelo e tokens não expostos ficam `UNKNOWN`.

Nenhuma entrada real, manifesto, alteração de domínio, resposta de juiz, publicação ou leitura operacional foi inventada ou executada na produção desta entrega. O único comando de validação do script foi parsing estático com `node --check`, sem avaliar imports ou executar seu corpo. Testes, build, typecheck, guard de produto e runtime permanecem NOT_RUN nesta entrega por instrução explícita do WP.

## Fontes

As localizações, hashes, tamanhos, ranges lidos e correlações com os trechos usados estão registrados em `source-observations.json`. As portas determinantes são `ownership-rebuild.ts`, `ownership-input.ts`, `ownership/update-plan.ts`, `ownership/read.ts`, `genesis-native*.ts`, `compose.ts`, `ownership-access.ts`, `canonical.ts` e os retornos reais de `tools/handler.ts`/`adapter-io/governed-emit.ts`. `tools/emit.ts` declara um modelo de referência: seu `createEmit` não é usado pelo script.
