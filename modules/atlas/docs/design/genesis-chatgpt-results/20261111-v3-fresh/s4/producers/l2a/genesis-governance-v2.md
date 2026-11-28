# Genesis: produção cumulativa, autoridade e uso

L1 aceitos no payload `8a041ca66982dcc2b89aaed46ebe347cb3de57db`: O=`S4:L1:ownership-boundaries`; H=`S4:L1:atlas-host-genesis`; C=`S4:L1:coverage-governance`; N=`S4:L1:native-runtime-delta`. CI=`runtime/ci-r2b/receipt.json`; Release=`runtime-release.json`, no payload S4. Constatação L1, inferência, intenção e execução registrada permanecem distintas.

## Finalidade e compromissos separados

Genesis conserva conhecimento, bases e decisões para revisão e consumo, com progressão por predecessores aceitos. O pacote transporta; o resultado Atlas inclui autoridade, validade, gaps e evidência. [O § Scope and purpose; O § Native transport versus served knowledge]

Suficiência semântica, transformação exata e autorização para publicar são compromissos distintos. **Inferência:** corrigir a transformação pede novo binding mesmo com texto aceito; binding não elimina recusa de política/provenance. [N § Necessidade e responsabilidade; N § Binding separado e publicação governada]

## Cobertura não é uma lista indiscriminada de inputs

O censo preserva 2.220 caminhos com origem, identidade e profundidade. Executáveis, testes, gerados, design e histórico têm papéis distintos; classificar não prova compreender cada ramo. Oito caminhos esbarram no observador, incluindo `.atlas` e gerados grandes: indisponibilidade não é ausência nem reduz a cobertura. [C § Population is complete; semantic depth is deliberately explicit; C § Observer limits are not scope limits]

Origem, gerador e paridade sustentam afirmações diferentes; preview simulado não atesta publicação. Observar um resumo histórico não observa retroativamente sua origem. **Inferência:** profundidade por origem não exige todo o arquivo de campanha como input vivo. [C § Generated UI, design, skills and archives have different authority; O § How current inputs are observed]

Inputs vivos limitam-se a 256.000 bytes e excluem `.git`, `.atlas` e symlinks; o transporte maior não revoga isso. `members:` registra caminhos; `file:`, bytes. Comparação indisponível preserva lacuna/HOLD; vazio só vale com observação que o sustente. [O § How current inputs are observed; N § Limites e estado da evidência]

## Dependências que tornam as camadas auditáveis

Dependência semântica nomeia quem afeta o resultado; `same_package:true` liga à chave aceita neste pacote. Navegação é consulta. O receipt incorpora resultados completos e inputs observados. **Inferência:** mudar autoridade/gap pode exigir revisão com prosa idêntica; consulta não cria aresta de build. [O § What each identity means; N § Validação que precede autoridade]

Rebuild confere receita/versão, contrato, inputs, predecessores, membership e observações antes/depois. Vínculos inalterados podem evitar chamadas; a saída é candidata, sem ativação automática. Registrar receita executável não autoriza executá-la ou publicar. [H § Ownership publication, observation and rebuild]

## Da produção nativa à porta de consumo

O adapter valida formato/bytes, scope, roots e dependências anteriores sem ciclos. Source ref exige `file:` no mesmo path; receita/protocolo vinculam prepare. Hashes conferem bytes; versões de inputs e IDs CAS vêm do runtime. Pertencimento ao commit exige captura externa. [N § Transformação e identidades; N § Validação que precede autoridade]

`prepare` grava CAS e candidato sem ativar projeção. Dois juízes reais distintos vinculam candidato, contrato, critérios e result/input; o adapter não deduz PASS de prosa nem autentica IDs. `publish` prepara novamente: candidato alterado exige novo binding. `check`/`atlas-emit` mantêm política, ator, ratificação e provenance. [N § Binding separado e publicação governada]

Consumo usa `ownership.index/read`, scope/seleção exatos, orçamento e seção opcional. Markdown aberto não comprova essa leitura. HOLD, erro e preparação diferem; histórico é solicitado e rotulado. [N § Consumo e manutenção pela porta real]

## Rotas históricas têm outra finalidade

`ownership-pilot.ts` fixa corpus, scope `session-input` e reviewers históricos; reaproveitar nomes/aceites não o torna importer genérico. Mineração candidata passa por staging; admissão mecânica e limite de extração não são revisão semântica nem ratificação. [O § Historical pilot: useful precedent, bounded entry point; H § Candidate Genesis: bounded extraction is not publication or semantic understanding]

Em `script/atlas-genesis`, checkpoints fixam fonte/run/índice/orçamento/configuração. Seu juiz amostral não equivale ao par independente desta produção. O workflow envia patch para PR; upload não é merge ou ativação. [C § Legacy Genesis automation: fixed inputs, bounded continuation, sampled judgment; C § Workflow publication is a separate operation with a concrete output]

## Uso, tentativas e economia honesta

A política histórica fixa pool de oito e auth por subscription; o workflow prevê até três requests paralelos e uma repetição de resposta malformada. São regras documentadas, não contagens desta execução. Fila e tentativas expostas registram trabalho lógico visível. [C § Legacy Genesis automation: fixed inputs, bounded continuation, sampled judgment]

NR1-01 conta callbacks de autoria sintética; o digest de resposta identifica bytes. Nenhum é telemetria de modelo. **Inferência operacional:** bytes UTF-8, chamadas lógicas e reuso não revelam tokens, modelo, preço, cobrança ou tentativas físicas ocultas. Valores não expostos ficam `UNKNOWN`, nunca zero ou estimativa apresentada como medida. Orçamento/configuração de subscription não dá garantia financeira. Limitar trabalho pela fila/orçamento e preservar tentativas/resultados visíveis ajuda a operar; não autoriza prometer custo, gratuidade ou economia monetária. [N § Delta R1 e controles de recuperação; N § Binding separado e publicação governada]

## Ler recibos sem transportar autoridade entre revisões

Release registra prepare/binding/publicação/index/read de **um** L1A isolado. Pins/limites são daquela amostra; andamento antigo não substitui o manifesto L2 com L1 completa aceita. Não publica estas sínteses nem comprova consumidor independente do pacote completo. [Release: entrypoints, capabilities, known_limits]

O CI posterior identifica candidato `7102f2e3a1a9a3822bcd0ae054b36ecffe9da553`, run `43077975153`, 220 testes aprovados, 22 controles de mutação, 18 gerados correspondentes e dois WARN de arquivos grandes. Supera a medição anterior de duas leituras: NR1-04 exige intervalo da chamada main sobreposto à ativação pós-barreira. O controle delimitado não prova queda arbitrária, perda de energia, concorrência universal ou autoridade das fixtures. [CI: tests, recovery, generated_parity, guards, limits; N § Delta R1 e controles de recuperação]

## Manutenção e limites da explicação

| Questão | Path de partida já documentado |
|---|---|
| Formato, vínculo ou recusa nativa | `modules/atlas/scripts/genesis-native.ts`; `modules/atlas/packages/adapter-io/src/genesis-native-format.ts`, `genesis-native-io.ts` e `genesis-native-binding.ts` |
| Receita afetada ou observação incerta | `modules/atlas/packages/adapter-io/src/ownership-rebuild.ts` e `ownership-input.ts` |
| Continuação ou saída da pipeline histórica | `script/atlas-genesis/checkpoint.mjs`, `checkpoint-continuation-policy.mjs`, `publish-plan.mjs`; `.github/workflows/atlas-genesis.yml` |

Paths documentados em [H § Maintenance and remaining uncertainty; N § Consumo e manutenção pela porta real; C § What a maintainer can safely conclude].

Persistem lacunas de ramos/histórico, autenticação externa, migração e composição entre scopes/pacotes. Sem teste/build/runtime nesta produção; `supported` não fornece aceite, binding ou publicação L2.
