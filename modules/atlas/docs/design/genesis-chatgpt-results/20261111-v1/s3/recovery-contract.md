# S3 — contrato preparado de ativação, recuperação e rollback

Campanha `20261111-v1`; fonte `1cde2ff7a71bcf7aecb5d030917b577165135d38`; protocolo `2689c516d63488be37de678cc853dd4556fd5c13`; prompt `cb26a0a16f5f4212553aaecb03a0dfcc1a5f098e`.

**Estado: preparação verificada; execução dos cenários NOT_RUN; AC-07 INDETERMINATE.** O alcance solicitado continua sendo Orchestra inteiro. Não existe ainda um inventário S1 consumido que permita fixar seu denominador, nem candidato S2 aceito consumido. Treze cenários preparados não são treze domínios cobertos. Este documento registra o contrato local proposto, sem se atribuir a aceitação das interfaces compartilhadas.

## 1. Unidade de coerência e autoridade

A unidade verificável é uma consulta de um scope/need ou key com sua closure obrigatória, resolvida em um manifesto aceito de versões exatas. Uma resposta READY deve ligar manifesto, artifact, receipt, result, body, inputs e required dependencies coerentes. Consultas sucessivas durante uma troca podem observar gerações diferentes; isso não autoriza misturar gerações dentro de uma resposta. A API inspecionada não promete transação atômica entre todos os scopes do repositório.

S1 precisa fornecer o inventário, os roots obrigatórios, as fronteiras compartilhadas e o controle independente. S2 precisa fornecer outputs reais, receitas, reviews, manifestos e o candidato executável. O loop que verifica roots declarados não demonstra que os roots obrigatórios do Orchestra inteiro foram declarados.

Fonte observada, intenção autorizada, interpretação, gaps e histórico permanecem campos distintos. Compatibilidade vem de fonte, inputs, membership, receita, contrato e required results; posição numérica, data ou ordem de commits não concede atualidade. A falta de um input obrigatório é HOLD, nunca um conjunto vazio bem-sucedido.

## 2. Portas existentes e escrita permitida

O caminho de composição pública é `composeRuntime(...).check` seguido de `runtime.handler.handle("atlas-emit", { node, at, ... })`, respeitando política/ator/ratificação do alvo. Dentro dele, `createGovernedEmit` valida a attachment de ownership e usa `store.commitProjection`. A decisão é recalculada contra a projeção atual quando há contenção.

`store.put` conserva objetos no CAS, mas não concede autoridade nem seleciona a geração servida. `persistProjection` é uma escrita incondicional e não é uma porta de publicação ou rollback para esta campanha. O reader exigido é `runtime.ownership.read` e o índice é `runtime.ownership.index`. Ler bytes diretamente do CAS não substitui essas superfícies.

O callback de `commitProjection` deve permanecer puro. Pausas, produção, reservas e logging durável para um caso não entram nesse callback repetível. O executor deve observar a fronteira real entre completion durável e chamada à porta governada. Somente recursos próprios de um alvo isolado podem receber mutações de falha.

O piloto atual oferece `prepare`, `publish`, `read` e `index`, com produção e reviews específicos de `session-input`. Não é o importador geral desta campanha. Seus reviewers históricos, policy ou tokens não podem ser fabricados para liberar o novo candidato.

## 3. Estados exigidos e evidência de transição

| Estado | Evidência necessária | Leitura atual permitida |
| --- | --- | --- |
| Produção admitida | Identidade e reserva S1 antes do pedido | Geração anterior ainda válida ou HOLD |
| Resposta durável; avaliação pendente/incerta | Bytes originais, hash, input/recipe binding e recibo original | Nenhum novo conteúdo publicado |
| Artefato completo; geração incompleta | Body/result/reviews/receipt/artifact selecionados duravelmente | Geração anterior válida ou HOLD |
| Candidato completo aceito | Manifesto fechado e ambos os pareceres aplicáveis | Ainda não é ativação |
| Ativado em alvo isolado | Retorno da porta, seleção de projeção e readback de outro processo | Uma closure íntegra e atual ou HOLD |
| Fonte incompatível / rebuild falho | Drift observado e retorno/terminação real do rebuild | HOLD da closure afetada |
| Histórico explícito | Pedido `historical:true` e resposta efetiva com esse rótulo | Nunca autoridade de leitura atual |
| Interrupção de resultado incerto | Processo/sinal/saída e reserva sem liquidação comprovada | HOLD ou geração anterior válida; nenhum retry implícito |

Um arquivo de checkpoint não demonstra nenhuma transição por si só. A execução futura precisa parar um processo real, abrir outro, selecionar trabalho persistido, medir as invocações e consultar a porta de leitura.

## 4. Retomada durável: lacuna concreta do baseline

`rebuildOwnershipUpdate` persiste objetos e manifestos parciais, porém mantém `candidateArtifacts`, `newResults` e `calls` em memória. A requisição não recebe uma seleção de completions/cursor/reserva para restore. Seu HOLD não fornece a seleção de progresso concluído.

Reiniciar do manifesto antigo pode executar recipes já concluídas. Usar automaticamente um manifesto parcial também não basta: depois de mudar A e antes de reconstruir B dependente, B ainda pode apontar para o result antigo de A. O planner valida entradas em histórico e o reader mantém a checagem de required results, de modo que a mistura pode receber `ownership-dependency-changed`.

O contrato integrado S2/S5 deve tornar endereçável e revalidável o trabalho completo sem tratar o manifesto parcial como aceito. Deve distinguir resposta pronta com avaliação incerta, artefato revisado com dependentes pendentes e candidato aceito sem ativação. Deve preservar reservas S1. Não se propõe outro store nem se reaproveita o checkpoint legado como se já tivesse esse binding.

## 5. Rollback e histórico

O attachment valida todos os roots contra os inputs atuais antes da emissão. Essa compatibilidade é necessária, mas ainda falta provar que a escrita efetivamente seleciona o manifesto solicitado.

O achado `S3-F01` é uma derivação estática: na sequência carrier A → B → A, o conjunto CAS retém A; `upsert` usa essa presença para DEDUP, enquanto o emit pode anunciar `emitted:true` mantendo B. Na perna promovida, a atualização do recibo também precisa ser conferida contra o representante da linha. Não houve reprodução em runtime.

A proposta `proposals/rollback-activation-refusal.patch` recusa no emit governado quando o `current.contentHash` resultante não corresponde ao solicitado. Ela impede anunciar uma ativação não aplicada e não altera DEDUP. **Não implementa rollback compatível.** A restauração efetiva ainda exige contrato de reativação revisado e aplicação serial por S5. A proposta está NOT_APPLIED/NOT_RUN; `git apply --check` só verificou formato/contexto contra o baseline.

`historical:true` pula a comparação de inputs atuais, mas mantém integridade, shapes, reviews, contratos e dependências. A seleção pública continua partindo do carrier atualmente publicado. É possível expressar leitura histórica dessa geração após drift; seleção arbitrária de um manifesto anterior não foi estabelecida. O rótulo precisa aparecer na saída real consumida.

## 6. População de cenários preparada

| Grupo | Casos | Observação que decidirá |
| --- | --- | --- |
| Ativação | S3-ACT-01..03 | Interrupção antes de emit; leitor separado durante troca; recusa de candidato incompleto |
| Retomada | S3-RESUME-01..02 | Resposta durável/avaliação incerta; artefato completo/dependente interrompido; zero nova produção do trabalho concluído |
| Drift e rebuild | S3-REBUILD-FAIL-01 | Rebuild falho com HOLD afetado, controle independente válido e histórico rotulado |
| Rollback/readers | Sete casos em `cases/readers.json` | Rollback compatível/incompatível; histórico e negativas; corrupção local/compartilhada; untrusted |

Todas as entradas de execução permanecem NOT_RUN. Scope, manifesto, candidate SHA, limite de leitura e controle independente serão vinculados aos handoffs exatos. Não se preenchem com fixtures aceitas inventadas.

Para cada processo, coletar PID/identidade observável, início/fim, sinal ou exit code, stdout/stderr, fonte/inputs antes/depois, completion/attempt/reserva, manifesto selecionado e resposta completa do reader. Cada leitura READY deve corresponder integralmente a um manifesto permitido e ainda válido; uma recusa deve registrar o motivo efetivamente retornado. A confirmação final deve observar a geração solicitada, e não apenas `emitted:true`.

## 7. Isolamento e corrupção

Corrupção local deve bloquear a closure que exige o objeto. O controle independente só vale se não compartilha o input, artifact ou autoridade que o caso declarou local. Corrupção do manifesto/autoridade compartilhados bloqueia todas as leituras dependentes.

O store pode recuar fisicamente para uma geração de projeção legível anterior. Esse mecanismo não autoriza fallback stale: o reader composto ainda deve comparar inputs atuais. O caso de drift e rebuild falho mede isso. Histórico não autoriza servir sidecar untrusted.

O escopo dos controles de interrupção é falha de processo. Não foi demonstrada durabilidade contra perda de energia; fsync parcial ou nomes de funções não devem ampliar a afirmação.

## 8. Economia, preservação e juízo

Os trabalhos desta entrega são preparação anterior ao envelope, explicitamente permitida pelos contratos. Nenhuma produção/revisão de artefato da campanha foi admitida sem alocação S1. O ledger registra as tarefas nativas reais e seus outputs, com tokens, tentativas físicas e cobrança UNKNOWN. Desconhecido não é zero.

G3-01/02/03 históricos permanecem com seus alcances originais. A fila M1 não foi reiniciada. J1/R3, a requisição original sem resposta, uso físico desconhecido, old-producer indeterminado e AC-03/AC-10 abertos não são liquidados por estes documentos. Os artefatos originais não foram alterados; a branch só recebe o prefixo S3.

Os dois juízos vinculantes pertencem a S5 e devem avaliar a mesma revisão integrada e evidências. Relatórios destes autores não contam como votos. O pacote para S5 explicita a falta de execução, em vez de pedir que uma revisão transforme preparação em recuperação demonstrada.

## 9. Critérios e condição de fechamento

Aplicam-se GO-A1..7, GO-I1..8 e QS-1..6. S3 responde por G3/AC-07 e fornece evidência para AC-03/09/10, CC-5, SC-3/5 e DoD correspondente. O catálogo em `criteria.json` conserva as linhas e os estados de execução.

DoD local exige todos os cenários aplicáveis ao inventário, observações de leitores separados, publicação governada, interrupção/restore real sem repetição indevida, recusa de stale/incompatível, histórico rotulado e dois juízos aplicáveis. Preparação não satisfaz esse DoD.

O próximo trabalho dependente começa pela validação dos commits S1/S2, não por preencher campos desconhecidos. S5 integra arquivos compartilhados serialmente e devolve candidate SHA; somente as provas afetadas são renovadas. A falta desses pré-requisitos é um bloqueio material, não autorização para substituir produtor, inventário, quota, autoridade ou juiz.
