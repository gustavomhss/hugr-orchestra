# Descoberta operacional Atlas para S1-04

**Conclusão:** o release publicado continua sendo R3, fixado no HEAD observado `db9b4235022c4df32fe3bfd4faeea8adcd69abb7`, e seu candidato nativo demonstrado (`e3a8ab8cf56dbff1ee91272df51ffa398d882aa1`) limita fontes a 256.000 bytes. Esse candidato não comporta a fonte S1 de 462.732 bytes. Existe código posterior que eleva o limite a 2 MiB, com controles remotos aprovados em dois commits exatos; o arquivo de descoberta e o handoff ainda não o liberam como R4, e nenhum desses controles fornece binding S1.

Neste executor, `bun --version` foi efetivamente chamado e retornou exit 127, `/bin/bash: line 1: bun: command not found`. Isso é evidência de um impedimento local de execução, não uma execução do adapter nem uma afirmação sobre todos os executores. Não executei Atlas, CI ou testes de produto; não fiz nenhuma escrita remota.

## Pins e integridade

| Objeto | Identidade observada |
| --- | --- |
| Branch consultada | `genesis-fresh-s4` |
| HEAD e commit de leitura do release | `db9b4235022c4df32fe3bfd4faeea8adcd69abb7` |
| Release | `20261111-v3-fresh-s4-r3` |
| Release Git blob | `7513fcca63664ca02094e9ed9b8fab090c20295d` |
| Release SHA-256 / tamanho | `6de0b5f7a8911eb40c7fbcf74e74210805175ee580c0c8482249c016af1c0016` / 28.282 bytes |
| Protocolo | `ee2521a5b966bd505cc95bd1c733e09e12f33531` |
| `runtime.md` SHA-256 | `c0f9c2422eea54343b006a683e788844bfc8d165c905afea8226aef7e98f0237` |
| `transport.md` SHA-256 | `02dbf78b9eb76c894d07c9e498704d2260157b7b10d5e1d159a0fd1037e73e3c` |
| Candidato nativo do release | `e3a8ab8cf56dbff1ee91272df51ffa398d882aa1` |
| Candidato dos controles comuns do release | `7102f2e3a1a9a3822bcd0ae054b36ecffe9da553` |
| Commit do aumento para 2 MiB | `9b1e129feed74236fb2ba473dac093aecacea515` |
| Checkpoint posterior com CI | `22815b6821dce26562624b4711c705c7cd786268` |

O release está em `modules/atlas/docs/design/genesis-chatgpt-results/20261111-v3-fresh/s4/runtime-release.json`. Os dois arquivos de protocolo estão em `.orchestra/skills/execute-genesis/references/`. Li o release integral, os entrypoints, limites, recibos de importação/publicação/leitura e decisões que sustentam suas capacidades. A conferência determinística de 40 arquivos capturados produziu 40 Git blobs iguais aos observados no conector; os detalhes estão em `capture-integrity.json`.

## Capacidades por candidato

| Candidato exato | Evidência que existe | Limite da conclusão |
| --- | --- | --- |
| `e3a8ab8…` | R3 marca importação nativa, binding, publicação, index e read como PROVEN para uma unidade L1A real; recibos em `283b6e5…` e `6e432471…` | Amostra de um artefato S4, não pacote S1; observer e adapter limitam fontes a 256.000 bytes; CI agregado desse candidato falhou |
| `7102f2e…` | Run 43077975153, job 130722742703: success; 220 testes, 22 mutantes recusados, guards exit 0 | Reuso, rebuild, retomada, rollback, migração e leitura concorrente são controles de fixtures sintéticas; não fornecem autoria, binding ou manutenção próprios de S1 |
| `22815b6…` | Run 43154719978: success; ZIP 13915012528 verificado; 224/224 testes, 22 mutantes, guards exit 0 | Código com limite 2 MiB e caso sintético prepare/publish/index/read aprovado; checkpoint explicitamente não libera R4 |
| `db9b423…` | Run 43343953480: success; ZIP 14001051122 verificado; 278/278 testes, 22 mutantes, guards exit 0 | HEAD posterior com mais alterações; mesmo limite 2 MiB; release continua apontando para o candidato nativo antigo |

A amostra nativa real de R3 tem candidate_id `e4e5c8b0566bf1760707b45848d69b2f07aac61868c9bb0a496b473ac1d91284` e manifest `4d1a9e51f97fe7c78c9ae9fa56779705ea425eb193aaaed01ea2adc88d607a02`. O recibo da publicação registra shape/truth/authz/ratify aprovados e `emitted:true`; index e read retornam esse manifesto e o corpo de 17.959 bytes. Esses IDs são evidência histórica, não valores para preencher o pacote S1.

### Fonte grande e dependências

Em `e3a8ab8…`, `prepareNativePackage` chama `readNativeFile(root, source_ref.path, 256000)` antes do observer. Para os 462.732 bytes declarados na tarefa, a consequência estática é `native-file-limit: packages/client/src/generated/types.ts`. Isso não foi apresentado como resultado de execução. O observer desse candidato também retorna unavailable acima do mesmo limite.

No HEAD `db9b423…`, `ownership-input.ts` exporta `ownershipInputMaxBytes = 2 * 1024 * 1024`; `genesis-native.ts` utiliza a mesma constante para source_refs e file inputs. Hashes dos arquivos observados:

- Observer: Git blob `ef317aab980f42601ce78269fcfba10649f06735`; SHA-256 `9cb3d220d5f2de83e34c0303e5e6744c83e08a22e5ffdf5f5151355d88056f36`.
- Adapter: Git blob `187610f59758e185a8889412b9058b75eb6e62ca`; SHA-256 `07c8103ef3809ff6d91e8678fa4193e397706a93f7705fc990aaa29d32d44a84`.

Nos dois ZIPs posteriores, passou o teste `Genesis native adapter prepares and serves a complete source at the shared ceiling, then detects last-byte drift`. O código desse teste usa fonte de exatamente 2.097.152 bytes, preserva BOM/Unicode/newlines, prepara, publica, consulta index/read, verifica dependência do predecessor e detecta alteração do último byte. A autoridade e os juízos desse teste são explicitamente sintéticos.

`same_package:true` é suportado no adapter publicado. O predecessor deve existir, estar antes do dependente, ter validity supported e evidência semântica preservada. São recusados ciclos, links ausentes, predecessor fora de ordem e `package_ref` externo. Todas as required keys devem existir e ser alcançáveis a partir das roots. Não há impedimento especial para session S1 ou scope orchestra.s1 no formato; a autorização desse scope continua sendo uma obrigação independente.

O `handoff.json` atual declara `R4_SOURCE_CANDIDATE_PENDING_ACTIONS_AND_INDEPENDENT_REVIEW`, candidate_revision null, e literalmente: `R3 release retained with historical pins; this checkpoint does not release R4.` Os sucessos posteriores de Actions são reais e foram lidos, mas não substituem uma atualização de release, decisão independente ou binding. Não é correto concluir que todo código Atlas ainda rejeita 462.732 bytes; é correto concluir que o candidato nativo publicado em R3 os rejeita.

## Condições para a operação própria

Preparação conserva o pacote e referências em CAS e gera identidades do kernel; não concede autoridade de publicação. O pacote precisa estar completo para a seleção declarada, com hashes/bytes exatos, receita e fontes como inputs. O protocolo também é adicionado como input vivo. Os hashes de transporte/Git não podem preencher versões do observer.

Depois de preparar, dois juízes independentes reais devem receber o candidato, transformação e execução exatos. A aprovação precisa conter todos os critérios, incluindo runtime-import-binding, contract, candidate_id e os pares result/inputs_id de cada artefato. O adapter reexecuta prepare antes de publicar e recusa mudança de candidato. PASS semântico antigo e PASS de fixture não satisfazem essa obrigação.

`publish` usa as portas existentes `readOwnership`, `composeRuntime.check` e `atlas-emit`. A raiz própria precisa de `.atlas/policy.json` derivada da autorização real para o ator e `orchestra.s1`, além dos pré-requisitos existentes de provenance/store. O ator vem de `ATLAS_ACTOR` ou Git local; a ratificação explícita usa `ATLAS_RATIFY_TOKEN`. São declarações nominais locais, não autenticação criptográfica. Os valores `/root` do recibo S4 são história da autorização S4; copiá-los não cria autorização S1. O operador principal deve usar a responsabilidade que a tarefa S1 realmente autorizou. Política ausente ou inválida nega escrita.

Isolar código, fonte, CAS, projeção e outputs; registrar ambos os roots quando forem diferentes. Uma cópia reconstruída pode ter observed_head null, mas não pode ser apresentada como checkout histórico. A associação a commits exige a captura externa. O comportamento antigo que classifica falha Git como trusted permanece um limite, não uma prova de trust ou tracking.

## Comandos exatos para futura retomada

CWD: `<pinned-code-root>/modules/atlas`, com o candidato compatível fixado e suas dependências declaradas disponíveis. Bun observado pelos releases: 1.3.14; Node: v24.22.1. Variáveis abaixo são caminhos/identidades a preencher com valores reais, não comandos já executados.

```sh
bun scripts/genesis-native.ts prepare "$S1_SOURCE_ROOT" "modules/atlas/docs/design/genesis-chatgpt-results/20261111-v3-fresh/s1/native-package.json" "$S1_PREPARED_FILE"
ATLAS_ACTOR="$S1_AUTHORIZED_ACTOR" ATLAS_RATIFY_TOKEN="$S1_AUTHORIZED_RATIFIER" bun scripts/genesis-native.ts publish "$S1_SOURCE_ROOT" "$S1_PREPARED_FILE" "$S1_BINDING_RELATIVE_PATH"
bun scripts/genesis-native.ts index "$S1_SOURCE_ROOT" "$S1_INDEX_QUERY_FILE"
bun scripts/genesis-native.ts read "$S1_SOURCE_ROOT" "$S1_READ_QUERY_FILE"
```

O arquivo prepared deve ser novo (`wx`), e seu diretório já deve existir. A aprovação é relativa à raiz da fonte; candidate/query são paths de filesystem. Index exige exatamente `{"scope":"orchestra.s1","need":"entry"}` para essa seleção. Read exige scope, maxBytes inteiro positivo e exatamente key ou need; section é opcional; histórico só pode ser solicitado com historical true explícito. O orçamento deve ser o do consumidor próprio. Exit 0 é resultado ordinário, 1 é erro, 2 é HOLD/recusa; prepare exit 0 não é publicação.

R3 não publica comando genérico `rebuild`, `resume`, `rollback` ou `migration` no `genesis-native.ts`. A evidência de manutenção é o grupo remoto de controles, e a operação de manutenção própria de S4 permanece separada no handoff. Não inventei um comando de manutenção nem reutilizei o driver específico S4 como prova S1.

## Ferramentas e impedimento local observados

O conector dispõe de leitura de runs, jobs/logs e metadados de artefatos, além de download ZIP de artefatos. Downloads reais funcionaram para os três IDs citados. As ferramentas expostas não incluem workflow_dispatch. Existem rerun de job e rerun de jobs falhos, mas não foram usados; não transportariam um novo pacote ou candidato.

O fetch genérico é somente GET. A tentativa real de GET `/repos/gustavomhss/hugr-orchestra/actions/workflows` retornou HTTP 400 INVALID_ARGUMENT, endpoint fora da allowlist. GET de Actions runs e downloads por ferramentas específicas funcionaram. O workflow atlas-pilot no HEAD tem workflow_dispatch declarado e push apenas para pilot-check-* ou genesis-fresh-s4; genesis-s1-api não corresponde. Nenhum trigger foi alterado.

O probe `bun --version` falhou com exit 127. A busca limitada de executável em `/opt/codex`, `/usr/local` e `/usr/bin` não encontrou bun/bun.exe. Os três ZIPs contêm evidência de gates e boundary gerado, sem Bun e sem node_modules. Não procurei credenciais, não usei gh e não baixei dependências fora do conector. A URL temporária de attachment retornada pelo próprio download_workflow_artifact foi usada apenas para trazer o ZIP para inspeção.

Outros erros de leitura preservados: 404 para `modules/atlas/AGENTS.md` e para a tentativa de localizar `modules/atlas/packages/adapter-io/src/gate-chain.ts` no candidato e3a8ab8. O AGENTS.md da raiz foi lido e proíbe testes locais de produto.

## Evidência local entregue

Diretório exclusivo: `/workspace/scratch/8833f71e3e94/s1-04-runtime-scout/`.

- `discovery.json`: descoberta estruturada, pins, capacidades, comandos, impedimentos e readback dos runs.
- `connector-captures.json`: 52 capturas do conector, sem substituir histórico por interpretação.
- `capture-integrity.json`: tamanhos, SHA-256 e Git blobs recalculados de 40 arquivos; todos coincidem.
- `artifact-inspection.json` e `latest-artifact-inspection.json`: inventários e resultados lidos dos ZIPs.
- `atlas-runtime-7102f2e3-gates.zip`: SHA-256 `cf4232dec016e07d63dc0b40497892e1f87dec7af812d6cd3fbc542f8816c7cd`.
- `atlas-runtime-22815b6-gates.zip`: SHA-256 `44a4b2b8fa833c1117f4498d1be71283f054200c63aacdb5ddb67ee4fdc91d9a`.
- `atlas-runtime-db9b423-gates.zip`: SHA-256 `c6df13373d71e091cf842a603e1d25b241ffca7652ea73775419ee3f01da0871`.
- `task-request.txt`, `followup-request.txt`, `completion-request.txt` e este `response.md`: pedidos e resposta visíveis preservados, sem raciocínio privado.

Este relatório não é juízo semântico, runtime-import-binding ou declaração de entrega S1. A descoberta está concluída; importação/publicação/leitura/manutenção S1 continuam dependendo das operações e provas próprias.
