# Genesis: produção cumulativa, autoridade e uso

L1 aceitos no payload `8a041ca66982dcc2b89aaed46ebe347cb3de57db`: O=`S4:L1:ownership-boundaries`; H=`S4:L1:atlas-host-genesis`; C=`S4:L1:coverage-governance`; N=`S4:L1:native-runtime-delta`. CI=`runtime/ci-r2b/receipt.json`; Release=`runtime-release.json`, no payload S4. Constatação L1, inferência, intenção e execução registrada permanecem distintas.

## Finalidade e compromissos separados

Genesis conserva conhecimento, bases e decisões para compreensão, revisão e consumo. A progressão depende de predecessores aceitos; esta L2 explica relações sem alegar compreensão total. O pacote é transporte; o resultado Atlas inclui autoridade, validade, gaps e evidência. [O § Scope and purpose; O § Native transport versus served knowledge]

Há três compromissos: suficiência semântica; transformação exata de inputs/resultados/contrato; autorização para publicar e servir. O primeiro não fornece os seguintes. **Inferência:** corrigir a transformação pede novo binding mesmo com texto aceito; binding não elimina recusa de política/provenance. [N § Necessidade e responsabilidade; N § Binding separado e publicação governada]

## Cobertura não é uma lista indiscriminada de inputs

O censo preserva 2.220 caminhos, com origem, identidade e profundidade. Executáveis, testes/fixtures, gerados, design e arquivos históricos têm papéis diferentes; classificação completa não prova compreensão de cada ramo. Oito caminhos esbarram no observador, incluindo `.atlas`, fixtures e gerados grandes: isso é indisponibilidade, não ausência ou licença para apagar cobertura. [C § Population is complete; semantic depth is deliberately explicit; C § Observer limits are not scope limits]

Vincular fontes às afirmações exige distinguir origem, gerador e paridade; preview com ações simuladas não atesta publicação. Evidência histórica condensada continua derivada: observar seus bytes não observa retroativamente a origem. **Inferência:** profundidade por origem permite explicar sem tornar todo o arquivo de campanha input vivo de cada resultado. [C § Generated UI, design, skills and archives have different authority; O § How current inputs are observed]

O limite de input vivo é 256.000 bytes, com exclusão de `.git`, `.atlas` e symlinks. O limite maior de transporte não revoga esse contrato. `members:` registra composição de caminhos; `file:` registra bytes. Quando a comparação necessária é indisponível, preservar a lacuna/HOLD; uma lista vazia só vale quando a observação efetivamente a sustenta. [O § How current inputs are observed; N § Limites e estado da evidência]

## Dependências que tornam as camadas auditáveis

Dependência semântica nomeia o predecessor que afeta o resultado; `same_package:true` liga à chave aceita neste pacote. Navegação oferece consulta. O receipt incorpora resultados completos e inputs observados. **Inferência:** mudar autoridade ou gap pode exigir revisão do dependente com prosa idêntica; referência de leitura não justifica inventar aresta de build. [O § What each identity means; N § Validação que precede autoridade]

O rebuild confere receita/versionamento, contrato, declaração de inputs e predecessores, membership e observações antes/depois do trabalho. Pode evitar chamadas quando os vínculos precisos não mudam, mas devolve candidato, sem ativação automática. Uma receita executável registrada não concede por si só autoridade para executá-la ou publicar sua saída. [H § Ownership publication, observation and rebuild]

## Da produção nativa à porta de consumo

O adapter novo valida formato/bytes, scope, roots alcançáveis e dependências anteriores sem ciclos. Source ref exige `file:` no mesmo path; receita/protocolo vinculam a preparação. SHA-256 e Git blob conferem bytes; versões de inputs e IDs CAS vêm do runtime. Pertencimento do blob ao commit exige captura externa. [N § Transformação e identidades; N § Validação que precede autoridade]

`prepare` grava CAS e candidato exclusivo, sem ativar projeção. Dois juízes reais distintos vinculam candidato, contrato, critérios e pares result/input; o adapter não deduz PASS de prosa nem autentica identidades fornecidas. `publish` prepara novamente: mudança no candidato exige novo binding. Depois passa por `check`/`atlas-emit`; política, ator, ratificação e provenance continuam controles próprios. [N § Binding separado e publicação governada]

O consumo usa `ownership.index/read`, scope/seleção exatos, orçamento e seção opcional. Abrir Markdown não comprova consumo Atlas. HOLD, erro e preparação têm significados distintos; histórico é solicitado e rotulado explicitamente. [N § Consumo e manutenção pela porta real]

## Rotas históricas têm outra finalidade

O `ownership-pilot.ts` fixa corpus, scope `session-input` e reviewers de uma campanha anterior. Reutilizar esses nomes ou aceitações para outra execução não transforma o piloto em importer genérico. Já mineração candidata passa por staging; admissão mecânica e limite de extração não são revisão semântica nem ratificação. [O § Historical pilot: useful precedent, bounded entry point; H § Candidate Genesis: bounded extraction is not publication or semantic understanding]

A automação `script/atlas-genesis` vincula checkpoints a fonte, run, índice, orçamento e configuração. Seu juiz amostral avalia candidatos daquela pipeline; não equivale ao par independente desta produção. O workflow envia patch para posterior PR: upload não significa merge ou ativação. [C § Legacy Genesis automation: fixed inputs, bounded continuation, sampled judgment; C § Workflow publication is a separate operation with a concrete output]

## Ler recibos sem transportar autoridade entre revisões

Release registra prepare/binding/publicação/index/read de **um** artefato L1A isolado. Seus pins/limites são daquela amostra; campos antigos de andamento não substituem o manifesto L2, que declara L1 completa aceita. O registro não publica estas sínteses nem comprova consumidor independente do pacote completo. [Release: entrypoints, capabilities, known_limits]

O recibo CI posterior identifica candidato `7102f2e3a1a9a3822bcd0ae054b36ecffe9da553`, run `43077975153`, 220 testes aprovados, 22 controles de mutação e 18 gerados correspondentes. Preserva dois WARN de arquivos grandes e declara superado o controle anterior que media duas leituras juntas: NR1-04 exige intervalo da chamada main sobreposto à ativação pós-barreira. Isso sustenta aquele controle delimitado; não comprova queda arbitrária, perda de energia, concorrência universal ou autoridade de campanha das fixtures. [CI: tests, recovery, generated_parity, guards, limits; N § Delta R1 e controles de recuperação]

## Manutenção e limites da explicação

| Questão | Path de partida já documentado |
|---|---|
| Formato, vínculo ou recusa nativa | `modules/atlas/scripts/genesis-native.ts`; `modules/atlas/packages/adapter-io/src/genesis-native-format.ts`, `genesis-native-io.ts` e `genesis-native-binding.ts` |
| Receita afetada ou observação incerta | `modules/atlas/packages/adapter-io/src/ownership-rebuild.ts` e `ownership-input.ts` |
| Continuação ou saída da pipeline histórica | `script/atlas-genesis/checkpoint.mjs`, `checkpoint-continuation-policy.mjs`, `publish-plan.mjs`; `.github/workflows/atlas-genesis.yml` |

Pontos de partida documentados em [H § Maintenance and remaining uncertainty; N § Consumo e manutenção pela porta real; C § What a maintainer can safely conclude].

Permanecem lacunas de ramos pouco examinados, histórico por origem, autenticação externa, migração e composição entre scopes/pacotes. Sem teste/build/runtime nesta produção; `supported` não fornece aceite, binding ou publicação desta L2.
