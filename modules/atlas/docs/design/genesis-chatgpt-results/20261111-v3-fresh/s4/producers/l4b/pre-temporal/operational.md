# Operação governada de S4

Scope `atlas-continuity-rag-genesis`. Operação própria do driver NOT_RUN. `P` significa `modules/atlas/docs/design/genesis-chatgpt-results/20261111-v3-fresh/s4`. Fixe as variáveis em caminhos/identidades reais.

## Fixar ambiente, corpus e autoridade

Fixe `S4_RUNTIME_ATLAS` em `modules/atlas` do runtime com dependências, `S4_CORPUS` na raiz isolada servida e `S4_CONTROL` em diretório existente fora das fontes observadas. Registre bytes/pin e release pertinente, preservando pins herdados. Sem checkout, HEAD pode ser `null`; não use o baseline como HEAD fictício.

CAS (`$S4_CORPUS/.atlas/cas`), projeção e política pertencem ao estado isolado autorizado. `ATLAS_ACTOR` e `ATLAS_RATIFY_TOKEN` declaram papéis locais; não autenticam pessoas nem são segredo. Use identidade efetiva e autorização da execução. Binding não cria política/ratificador; política ausente não autoriza escrita. Provenance `tracked-staging` recusa leitura protegida; `tracked-provable` exige re-proof e não permite escrita. Não abra store bruto para contornar recusa. Fontes: `S4:L1:atlas-host-genesis`, “Identity, policy and provenance: distinct controls with explicit limits”; `S4:L1:native-runtime-delta`, “Binding separado e publicação governada”.

## Preparar e vincular o candidato exato

`S4_PACKAGE` é relativo ao corpus; `S4_CANDIDATE` é arquivo absoluto novo em `S4_CONTROL`:

```sh
cd "$S4_RUNTIME_ATLAS"
bun scripts/genesis-native.ts prepare "$S4_CORPUS" "$S4_PACKAGE" "$S4_CANDIDATE"
bun scripts/genesis-native.ts publish "$S4_CORPUS" "$S4_CANDIDATE" "$S4_APPROVAL"
```

Publique somente após binding. Prepare persiste objetos/candidato sem ativar projeção; cria arquivo com `wx`, sem sobrescrita, em diretório existente. Candidato/query são resolvidos pelo CWD da CLI; use absolutos. `S4_APPROVAL` é relativo ao corpus.

Preserve candidato, pedido e respostas originais dos dois juízes reais distintos. O approval `genesis-native-binding-approval/v1` cobre `candidate_id`, contrato, todos os critérios e todos os pares result/input, com propósito `runtime-import-binding`. IDs não autenticam pessoas. Sem message ID exposto, `response-sha256` identifica bytes da resposta, não telemetria. Aceite semântico não vira binding. Publish re-prepara e exige igualdade; drift exige rever preparação e decisões. A validação segue pelo leitor de ownership, grounding, `composeRuntime.check` e `atlas-emit`.

Fontes: `modules/atlas/scripts/genesis-native.ts`; `S4:L2:genesis-governance`, “Da produção nativa à porta de consumo”.

## Consultar índice e corpo

Grave queries JSON nos arquivos de controle e use:

```sh
cd "$S4_RUNTIME_ATLAS"
bun scripts/genesis-native.ts index "$S4_CORPUS" "$S4_INDEX_QUERY"
bun scripts/genesis-native.ts read "$S4_CORPUS" "$S4_READ_QUERY"
```

Índice, exatamente scope e need:

```json
{"scope":"atlas-continuity-rag-genesis","need":"entry"}
```

Root inicial:

```json
{"scope":"atlas-continuity-rag-genesis","need":"entry","maxBytes":5000}
```

H2 aceita:

```json
{"scope":"atlas-continuity-rag-genesis","key":"S4:L3:system-flows","section":"Mudanças propagam por resultados e vínculos","maxBytes":6000}
```

`read` aceita somente scope, exatamente um de key/need, maxBytes inteiro positivo seguro, section opcional e historical opcional exclusivamente `true`. Corrente omite historical; `false` é recusado. Need pertence ao enum; key/section são NFC não vazios. Use H2 exata do índice. Limite insuficiente gera HOLD, não truncamento útil.

Índice: seções, bytes, `bodiesReturned:false`, `bodyBytesVerified:true`; não implica zero IO no servidor. Ready de read inclui manifesto, artefato, resultado, receipt, corpo, autoridade/validade/gaps/evidência e indicação histórica. Guarde JSON completo e confira identidades; CAS isoladamente não basta. Fontes: `S4:L1:ownership-boundaries`, “Native transport versus served knowledge”; `S4:L2:atlas-system`, “O percurso até uma leitura utilizável”; `genesis-native-format.ts`, `validateNativeReadQuery`.

O protocolo desta execução limita a 2 index, 12 read, 62000 bytes de corpo retornados no total, 6000 na leitura rasa e maxBytes até 18000 por read. Comece pelo scope/entry; pare quando suficiente. Tarefa profunda pode percorrer keys/H2 dos onze intermediários quando necessários, sem duplicar corpos ou impor leitura total. Bytes não medem IO, tokens ou dinheiro. Fonte: manifesto, `public_read_protocol`.

## Saídas e códigos de saída

| Porta | Saída e exit |
| --- | --- |
| CLI prepare | JSON do prepared; exit 0 prova preparação, não publicação. |
| CLI publish | JSON completo; exit 2 para HOLD, emission recusada ou `emitted` diferente de true. Exit 0 ainda exige leitura para demonstrar consumo. |
| CLI index/read | JSON da porta; exit 2 para HOLD. |
| Erro de entrada/execução da CLI | JSON `{kind:"error",error:...}` em stderr; exit 1. |
| Driver rebuild | JSON `kind:candidate`, `stage:private-candidate`; exit 0 não ativa. |
| Driver publish | `kind:publication-attempt`; exit 0 exige emissão positiva e readback do manifesto candidato. HOLD/erro/divergência usam exit 1. |

Guarde stdout/stderr, check/emission/readback. `activation_attempted` distingue tentativa; erro posterior não exclui efeitos. No-op não prova ativação nova. Fontes: CLI e `P/runtime/maintenance-operation.mjs`; usage, “Saída e efeitos”.

## Manutenção pelo driver

`S4_DRIVER`: bytes autorizados de `P/runtime/maintenance-operation.mjs`; `S4_BASELINE`: ID kernel/CAS de 64 hex do manifesto; `S4_TARGET`: prepared atualizado; `S4_BINDING`: approval relativo ao corpus. Exatamente seis argumentos, incluindo modo:

```sh
bun "$S4_DRIVER" rebuild "$S4_RUNTIME_ATLAS" "$S4_CORPUS" "$S4_BASELINE" "$S4_TARGET" "$S4_BINDING"
bun "$S4_DRIVER" publish "$S4_RUNTIME_ATLAS" "$S4_CORPUS" "$S4_BASELINE" "$S4_TARGET" "$S4_BINDING"
```

Target é absoluto ou relativo ao corpus, não ao CWD. Baseline não é candidate_id. Primeira publicação: porta nativa. Driver publish exige baseline ainda selecionado como publicado; rebuild aceita baseline CAS sem certificar publicação.

Antes da primeira publicação, inclua em todas as entries o input `file:` do driver no path completo acima e o protocolo explícito, na ordem lexicográfica dos input_keys. Cópia no corpus e driver executado devem coincidir; o script não a instala. Preserve scope, roots, sequência de keys, títulos/layers/needs/navigation, contrato, keys de inputs e ordem das dependências entre baseline e target. Apenas `file:` é aceito e todos são obrigatórios; `members:`, adição/remoção de keys ou mudança de topologia exigem outro procedimento. Inputs vivos têm teto de 256000 bytes, sem `.git`, `.atlas` ou symlinks; não apague entradas da cobertura para satisfazer esse limite.

Registry usa versão observada do driver, inputs e dependências reais. Captura retém bytes verificados antes/depois; reobservação relê o host. `run` retorna output nativo aceito do CAS; `evaluate` retorna as duas reviews reais somente com scope, result, arrays ordenados e `id({inputs,dependencies})` exatos. Não são modelos ou novos juízos. `rebuildOwnershipUpdate` decide affected/reúso/trabalho preciso; o driver compara candidato e target, valida todas as entries e recusa divergência. Publish reconstrói novamente, revalida baseline e usa check/emit governados; após emissão positiva reabre runtime e faz index/read correntes. Preserve os recibos completos. Fontes: driver e usage, “Pré-condições do pacote” e “Composição efetiva”.

## Drift, retomada e histórico

Indisponível é incerteza, não ausência; corrija acesso/estabilidade. Após drift, current pode ficar HOLD com objetos antigos íntegros. Consulta ao passado exige `"historical":true` preservado na resposta, sem restaurar validade corrente. Markdown direto não substitui consumo recusado.

CAS/candidato duráveis permitem retomar sem repetir autoria; prepare/binding/guards atuais seguem necessários. Se a ativação falhar, um leitor separado deve observar HOLD ou a seleção antiga ainda válida; após drift, não sirva stale como corrente. Confira manifesto selecionado antes de repetir publish; transporte/approval antigos não substituem candidato novo. Rollback compatível é nova decisão governada com inputs e autoridade válidos; não há banimento cronológico universal de produtor nem transferência de aprovação anterior.

Atomicidade/retries são os existentes. Driver não cria lock global, transação de todo filesystem, fence de época ou compare-and-swap adicional sobre baseline. Leitor sobreposto nos testes não prova recuperação universal. Fonte: `S4:L3:system-flows`, “Após falha, separar recuperação de nova publicação”; `S4:L1:native-runtime-delta`, “Delta R1 e controles de recuperação”.

## Registrar o alcance da prova

CI 43094387837, candidato `1b5a4801acfae03969f78ee766ca6f0b7d0f9013`: 220 casos, 22 mutações rejeitadas, 18 paridades e guards com dois WARN de tamanho. Parsing `node --check` não executou imports/corpo; operação própria NOT_RUN. Tipos, testes, gates, aceite, binding e operação têm evidências distintas. `calls` conta callbacks; modelo/tokens/custos/tentativas físicas não expostos: UNKNOWN. Fonte: `P/producers/ci-c1/receipt.json`; L3, “Manutenção e alcance da evidência”.
