# Rodada 2 — invariantes Atlas e execução governada

Agente `sol_lamport`, modelo `gpt-6.1-sol`, lente de concorrência, persistência e prova. Snapshot `e70717ac937f26d38dbf9235860597f86447fa09`. Cinco novos achados: um P1 e quatro P2, todos por análise estática, revisados pelo lead. Não houve teste, fault injection ou prova formal executados.

## L4 — P1: replay aplica campos de projeção não autenticados pela prova

**Confiança muito alta. Alcance:** composição Atlas usada por Own, CLI e MCP.

[`knowledge-replay.ts:3`](../../modules/atlas/packages/adapter-io/src/knowledge-replay.ts#L3) declara que log commitado é alegação não confiável. Linhas 53–58 reprovam o fact CAS, mas linhas 103–106 aplicam e.row inteira por nodeKey. [`reverify-store.ts:579`](../../modules/atlas/packages/adapter-io/src/reverify-store.ts#L579) checa tier, anchor, documento e fact.claimNorm contra witness; não vincula node.claims nem rederiva nodeKey. O log só exige estrutura e igualdade de dois nodeKeys ambos controlados pela mesma linha.

**Sequência:** manter fact proven e witness verdadeiro; alterar row.claims para outra prosa e recalcular hash da linha; replay reprova o fact verdadeiro e aplica a row alterada. Também pode trocar nodeKey e atingir outro slot sem os gates usuais do incumbent.

**Caminho de produção:** surface/index.ts:184–187 chama composeRuntime; [`compose.ts:261`](../../modules/atlas/packages/adapter-io/src/compose.ts#L261) usa replay com reverifyStore real; linha 519 cria Own sobre o store. [`pack-shape.ts:96`](../../modules/atlas/packages/adapter-io/src/pack-shape.ts#L96) e own-source.ts:282 servem node.claims. CLI/MCP inicializam a mesma composição.

**Impacto:** prosa não provada entra no contexto apresentado como conhecimento derivado de prova; row pode substituir slot de outra identidade. O atacante fornece log de repositório, que o contrato já considera não confiável, sem precisar assumir identidade do host.

**Limites confirmados na revisão fria:** aplicação direta exige população local trusted, fact que reprova no índice atual e seat permitido no row.scope; política ausente/malformada não concede scopes automaticamente. O fact continua no tier minerado T2. Claims adulteradas podem ser servidas no papel/advisory de Own, mas não viram automaticamente T0/T1 nem aprovação de execução. O teste deve selecionar anchor consultado e texto dentro do orçamento para não confundir seleção com proteção.

**Correção/teste:** reconstruir projeção pelos campos autenticados/reprovados, validando identidade, claims acumuladas e carriers. Testar composição real com fact válido e alteração isolada de claims/nodeKey, hash correto no log, exigindo recusa/staging e ausência de prosa adulterada. Callback sintético de reprova não verifica esse vínculo.

## L5 — P2: log pós-commit pode inverter a ordem e fazer replay regredir estado

**Confiança alta. Alcance:** escritores Atlas concorrentes, incluindo processos distintos.

[`knowledge-log.ts:104`](../../modules/atlas/packages/adapter-io/src/knowledge-log.ts#L104) commita projeção antes de obter timestamp e registrar rows na linha 112. O vencedor de log é escolhido por (at, contentHash) em linhas 123–124.

**Interleaving:** A publica G1 e é suspenso antes de timestamp/log; B lê G1, publica G2 e registra; A retoma e registra G1 com horário posterior. Ambos tiveram commit válido. readKnowledge escolhe G1 e replay pode substituir G2 pela geração antiga no próximo boot. Não exige relógios desalinhados; a ordem pós-commit não representa a ordem linearizada do sidecar. Empate de milissegundo desempata por hash, também sem causalidade.

**Impacto:** claims, links ou carriers publicados podem regredir. Para versões ainda reprováveis, a regressão entra na projeção; nos demais casos pode reaparecer como candidato antigo.

**Correção/teste:** vincular registro exportável à ordem causal do commit e distinguir recuperação de clone de substituição de estado local mais novo. Dois escritores reais com barreira entre commit/log de A devem preservar G2 no reboot; cobrir empate temporal.

## L6 — P2: objeto CAS parcial não é reparado por retry e pode quebrar boot

**Confiança alta. Alcance:** escrita interrompida/falha de I/O no Atlas.

[`store.ts:223`](../../modules/atlas/packages/adapter-io/src/store.ts#L223) escreve diretamente no nome definitivo e, se ele existe, retorna hash esperado sem verificar bytes. O leitor recusa conteúdo parcial. [`sidecar-commit.ts:339`](../../modules/atlas/packages/adapter-io/src/sidecar-commit.ts#L339) verifica sentinel do put, não a leitura do objeto publicado.

**Sequência:** A cria endereço H e falha durante escrita; B repete put correto, vê exists e retorna H sem reparar; publicação pode apontar para bytes ilegíveis. Em recuperação, knowledge-replay.ts:84–86 tenta restaurar o blob correto e considera put==hash como sucesso; o arquivo parcial permanece. A leitura seguinte pode retornar undefined e fact.seal em linhas 54–55 causar exceção no boot.

**Impacto:** retry normal não recupera o objeto, e log com esse hash pode interromper a composição. Re-hash na leitura evita servir bytes erradas, mas não assegura recuperação/publicação íntegra.

**Correção/teste:** publicação atômica de objeto completo, validação do existente em dedup e reparo/recusa seguros; confirmar leitura após restore. Testar arquivo parcial sob H, blob correto no log, novo put e boot real, exigindo reparo ou recusa clara sem projeção pendurada/TypeError.

## L7 — P2: caminho governed aceita aprovação sobre contexto já alterado

**Confiança alta. Alcance:** execução governada por reservation, diferente de authorizationID.

[`reservation.ts:64`](../../modules/maestro/coordination/src/v2/governance/reservation.ts#L64) verifica recordApproval, hashes e apresentação/transcript, mas não chama contextIsCurrent. O consumo em linhas 169–198 só reconcilia reservation/receipt. Em contraste, [`dispatch.ts:104`](../../modules/maestro/coordination/src/v2/governance/dispatch.ts#L104) exige atualidade para authorizationID, inclusive no primeiro turno.

**Sequência serial:** contexto limpo A é validado/revisado/apresentado/aprovado; outro ator muda arquivos ou HEAD para B sem nova mensagem; task usa governed com hashes de A; aprovação de transcript permanece válida e reserva/consumo permitem começar sobre B.

**Impacto:** contextHash prova concordância entre registros antigos, mas não a condição atual da execução governada. Não é bypass universal de permissões.

**Correção/teste:** verificar contexto também na reserva governed e no consumo antes da primeira execução, aproveitando o mecanismo existente do dispatch. Testar alteração de arquivo/HEAD após aprovação e após reserva, exigindo hold e zero provider calls.

## L8 — P2: rebind de arm concorre com resume do antigo holder

**Confiança alta na janela estática. Alcance:** resume independente concorrente com transferência.

[`workflow/host.ts:242`](../../modules/maestro/coordination/src/v2/workflow/host.ts#L242) lê ranProviderTurn e depois transfere o arm em linha 247, sem exclusividade sobre o antigo Session owner. A função consulta active e histórico em linhas 258–267. [`arm/create.ts:118`](../../modules/relay/src/arm/create.ts#L118) trava o arm e verifica arquivos, mas não coordena o início de um provider turn.

**Interleaving:** B observa A idle/sem turno e pausa; resume(A) inicia e passa currentStep ainda válido; B faz rebind para C; A continua com workflow capturado e executa ferramentas. Provider start ainda não criou ledger que impediria rebind. [`relay-workflow-currentstep.ts:31`](../../packages/core/src/relay-workflow-currentstep.ts#L31) é verificação pontual, e runner captura workflow antes dos efeitos. Settlement posterior pode recusar depois de ferramentas produzirem efeitos.

**Impacto:** transferência aceita como filho que nunca executou pode deixar holder antigo e novo produzindo trabalho sob o contrato.

**Correção/teste:** adquirir exclusividade do antigo owner cobrindo leitura e transferência e impedir novos resumes; para processos distintos, fencing durável observado antes dos efeitos. Testar barreira após ranProviderTurn=false, resume antigo passando currentStep e posterior rebind; exigir recusa da transferência ou impedimento dos efeitos antigos.

## Cobertura e limites

| Área | Invariantes/caminhos lidos | Limites |
| --- | --- | --- |
| Aprovação/reservation/dispatch/evidence | Hashes, Session/project/caller, apresentação/transcript, receipt | Atualidade não é uniforme entre caminhos; sem execução |
| Workflow | Arm/host/settlement/review, holder/currentStep/rebind, tree/diff | Sem todos os interleavings ou processos distribuídos |
| Arsenal | Locks, state, profile/ledger/preflight | Lock abandonado já declarado em HOST-BINDINGS, não contado |
| Atlas CAS/sidecar/log/replay | Fontes e consumidores de produção, identidade/projeção/convergência | Sem fault injection ou todos os formatos/families |
| Atlas memória/kernel/persist/index/retrieval | Owner/root, refs/propostas/decisões, fold e consumidores amostrados | Leitura parcial; modelos puros sem caller não tratados como produção |
| Boundary gerada | Rotas/exports | Sem rebuild/check de geração |

Proteções presentes nos caminhos lidos: reservation determinística, replay confere binding, receipt idempotente, review compara tree/diff atual, sidecar reexecuta decisão em disputa e CAS revalida hash ao ler. Não cobrem os desvios listados. X3 sobre locks FileMutation entre Locations foi confirmado como contraditório e consta separadamente, sem duplicação. Limites declarados de identidade CLI/MCP ou concorrência não foram vendidos como descoberta.
