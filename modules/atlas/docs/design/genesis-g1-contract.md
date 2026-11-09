# G1 — host admission economy (reservation, settlement, concurrency) acceptance contract

Status: **PREPARATION; NOT A DISPATCH OR SPEND AUTHORIZATION.**
Decisão do Astra (GPT-6 Astra, browser, 2026-11-09), extraída verbatim e frio-verificada pelo lead
contra git/gh. Snapshot lido: `snapshot-genesis-20261109` @ `02b732601442b2ae2ec204eb0137a09654f8290b`.
Implementação segue esta decisão literalmente; divergências exigem nova decisão do Astra.
F1 permanece fechada pelo seu PASS (sem reabertura).

## 1. Semântica — DECIDIDA

### 1.1. Unidade de admissão e autoridade
Três identidades distintas:
- **Envelope:** autorização imutável, identificada por `envelopeId`, referência da aprovação, identidade da autoridade de armazenamento e digest da política. Contém escopo, provider/modelo, rota/transporte permitidos, estágios, limites por unidade, política de retry e máximo em voo.
- **Pedido lógico:** uma operação de produção, avaliação ou atualização identificada pelo host. Reentrar na mesma operação conserva sua identidade; restart não cria outro pedido.
- **Tentativa física:** cada encaminhamento do host ao transporte controlado, identificado por `(envelopeId, logicalRequestId, attemptOrdinal)`. Um retry tem identidade própria e referência ao predecessor.

O envelope é comum a produtor, avaliador, retries e concorrentes. Estágio e sessão são atributos de atribuição, não novos saldos. "Tentativa física" não será um rótulo para uma chamada lógica opaca. O transporte admitido precisa assegurar que cada novo envio controlável passe pelo guard. Retries ou redirects ocultos abaixo dele tornam a rota incapaz da garantia pretendida. Tentativas internas do provider que não sejam observáveis permanecem explicitamente desconhecidas; não são reconstruídas como uma tentativa só. Fontes: `genesis-ownership-plan.md:125`, `genesis-economy-control-contract.md:39`, `genesis-global-completion-plan.md:117`.

### 1.2. Unidades e bounds
O envelope declara suas dimensões; nenhuma conversão é implícita:
- `attempts`: reserva de uma posição por tentativa;
- `outputTokens`: bound inclusivo, somente quando a rota demonstra o limite nativo correspondente;
- `inputTokens` ou outra dimensão: somente quando houver um bound conservador justificável pelo contrato de capacidade;
- moeda: fora de F2 enquanto não houver contrato verificado de preço e de todas as dimensões cobradas.

Bytes de entrada continuam bytes. Call count continua call count. Não há conversão estimada promovida a limite duro. Nenhum valor numérico real fica aprovado por este desenho. Fontes: `genesis-ownership-plan.md:175,202`, `genesis-economy-control-contract.md:63`.

O bound será validado nos **bytes finais encaminhados**. Para o fixture Responses, `max_output_tokens` precisa ser um inteiro positivo, finito, suportado pela capability e igual ao valor admitido. O fingerprint inclui digest do body final, inputs, provider/modelo, endpoint, protocolo/transporte, configuração economicamente relevante, identidade da conta, bound e política. Segredos não entram em diagnóstico aberto. Essa checagem precisa ocorrer depois dos overlays: o lowering atual escreve `max_output_tokens`, mas `http.body` é mesclado posteriormente e a denylist atual não contém esse campo. Além disso, `prepare` e `generate/stream` compilam separadamente. Fontes: `openai-responses.ts:491`, `transport/http.ts:31,73`, `client.ts:361`.

### 1.3. Invariante contábil
Para cada dimensão admitida `d`:
`ocupado_d = Σ tentativas liquidadas usoConfirmado_{a,d} + Σ tentativas não liquidadas reserva_{a,d}`
Uma nova reserva `R` só é admitida se, na mesma transação:
`ocupado_d + R_d ≤ limite_d` para toda dimensão d, e
`tentativasPossivelmenteEmVoo + 1 ≤ máximoEmVoo` (slots).
Não há dupla contagem de reserva e uso confirmado da mesma tentativa. Para `attempts`, uma tentativa possivelmente encaminhada continua ocupando uma posição; isso não equivale a afirmar que o provider efetivamente a recebeu.
Escolha de simplicidade: F2 mantém o vetor inteiro reservado enquanto faltar evidência suficiente para liquidar alguma dimensão prometida. Pode registrar medições parciais como evidência, mas não libera saldo a partir delas. Não haverá liquidação parcial por dimensão nesta fase. A distinção entre uso confirmado e obrigação ainda reservada concretiza a retenção exigida para timeout, interrupção e ausência de usage terminal. Fonte: `genesis-economy-control-contract.md:51`.

### 1.4. Reserva e concessão de encaminhamento
A operação `reserve` terá esta sequência indivisível:
1. Validar envelope, rota, capability, estágio, identidade e request final imutável.
2. Abrir uma transação própria de nível externo, com decisão serializada.
3. Conferir a chave: inexistente → pode seguir para admissão; existente e idêntica → devolver o estado existente, **sem** novo grant; existente e divergente → recusa tipada por conflito.
4. Conferir saldo, slots em voo e elegibilidade do retry, considerando todas as reservas retidas.
5. Persistir a tentativa, sua identidade completa, o bound e a intenção de encaminhamento.
6. Confirmar o COMMIT.
7. Somente o criador que recebeu essa confirmação obtém um grant consumível uma vez pelo adapter; o encaminhamento ocorre fora da transação.

Falha ou ambiguidade no acknowledgement significa zero encaminhamentos novos. Se o COMMIT aconteceu, mas seu acknowledgement se perdeu, a reserva poderá aparecer na recuperação. Repetir a chave reconcilia esse registro; não obtém outra permissão de envio. Não haverá liberação automática por `finally`, morte do dono, expiração de lease ou timeout. Um crash depois do COMMIT e antes do envio pode deixar capacidade conservadoramente ocupada. F2 aceita essa perda de disponibilidade; não promete exactly-once entre banco local e provider remoto. Fontes: `genesis-economy-control-contract.md:41,54`.

### 1.5. Retry e concorrência
A escolha é manter o executor padrão e instrumentar seu `HttpClient` por execução scoped. O código atual faz o encaminhamento em `http.execute(request)` e reaplica esse efeito dentro de `retryStatusFailures`; portanto o guard será reencontrado por cada retry. A política scoped permite somente a interseção entre: retries autorizados pelo envelope; retries que o executor existente já faria; saldo e slots disponíveis para outra reserva. O retry nunca reutiliza nem apaga a reserva anterior. A autorização de retries não decorre apenas de `error.retryable`. Transporte interrompido ou stream parcialmente consumido não ganha um novo retry automático. Slot em voo e saldo econômico são estados distintos. Uma evidência terminal suficiente pode liberar o slot mesmo sem usage, mantendo a reserva econômica. Cancelamento local não prova término remoto. Um HTTP de erro intermediado por gateway também não prova, sozinho, que trabalho upstream terminou. A exclusão precisa funcionar entre instâncias/processos usando o mesmo ledger. O coordenador de sessões atual serializa por chave com um Map local; ele não substitui a autoridade econômica compartilhada. Fontes: `executor.ts:353,370`, `errors.ts:122`, `executor.test.ts:428`, `run-coordinator.ts:10,42`.

### 1.6. Liquidação
`settle` é uma transação idempotente que exige: identidade da tentativa e vínculo com seu stream/resposta; evidência terminal suficiente; usage completo para as dimensões prometidas; números válidos e consistentes; preservação do payload de evidência e de sua proveniência.
A resposta HTTP inicial não liquida nada: o executor retorna respostas <400 antes do consumo do stream. Também não basta chamar `LLMResponse.usage`: o reducer pode conservar usage anterior quando o terminal não o traz, e o helper de total pode produzir input + 0 quando output é desconhecido. O fechamento econômico observará a evidência terminal, não esses fallbacks isoladamente. Regras adicionais decididas:
- Liquidação idêntica repetida: nenhum novo débito ou crédito.
- Liquidação conflitante: recusa, sem reescrever a evidência anterior.
- Falha no COMMIT de liquidação: reserva continua ocupada até reconciliação.
- Uso confirmado acima do bound: registrar o valor integral e bloquear novas admissões no envelope por quebra de capacidade; nunca truncar para aparentar conformidade.
- Rejeição semântica do resultado não reembolsa uso físico.
- `inputTokens` inclui cache e `outputTokens` inclui reasoning; subconjuntos não serão somados novamente. Essa é a semântica canônica atual. Fontes: `executor.ts:281`, `transport/http.ts:130`, `events.ts:386,628,10`, `protocols/shared.ts:51`.

## 2. Superfície de implementação — DECIDIDA

### 2.1. Autoridade no host
Escolha: `packages/core`, reutilizando `Database.Service`, o banco e o mecanismo de migração existentes. O core já depende de `@orchestra/llm`; o adapter Atlas, atualmente, não tem essa dependência. Fontes: `packages/core/package.json:531`, `adapter-io/package.json:14`.
- `packages/core/src/economy/admission.ts`: Tipos do envelope, identidade, reserva, liquidação, recuperação e recusas tipadas.
- `packages/core/src/economy/sql.ts`: Relações de envelope e tentativas, unicidade, estado/evidência de liquidação e identidade da autoridade.
- `packages/core/src/economy/executor.ts`: Composição scoped do guard físico com `RequestExecutor.layer` e consumo dos eventos canônicos para fechamento.
- Migração no mecanismo existente do core. `packages/core/test/economy/admission.test.ts` + `executor.test.ts`.
A transação seguirá o padrão disponível no checkpoint — inclusive a checagem de identidade existente e `behavior: "immediate"` — sem usar `ProjectCheckpoint.save` como se já fosse um ledger. Não haverá cascade que apague obrigações econômicas ao excluir sessão/projeto. O CAS do kernel continua sendo identidade de conteúdo (`put`/`get`, implementação base Map). Ele não fornece a transação de saldo. A projeção de conhecimento também não será convertida em ledger.

### 2.2. Integração scoped e erros
O guard envolverá o delegate físico fornecido a `RequestExecutor.layer`. O host manterá contexto de tentativa por dispatch, nunca uma variável global `currentAttempt`. A recusa econômica terá um canal tipado no host, preservado ao atravessar o executor. Isso é necessário porque `toHttpError` converte erros desconhecidos do `HttpClient` em `TransportReason` genérico. Não se pode depender de um erro custom atravessar essa camada intacto. F2 inicial cobre HTTP com transporte controlado e Responses no fixture de capacidade. WebSocket, subprocesso opaco e outros hosts são recusados como não cobertos antes de open/send. Fontes: `executor.ts:307`, `websocket.ts:253`, `session/runner/llm.ts:427`.

### 2.3. Relação com F1 e lane
F1 permanece com sua unidade de decisão atual. Logo, F2 não inventa uma chamada para "validar o cache". Contabilidade fica no registro de execução, sem alterar `OwnershipResult` e provocar propagação artificial. A lane precisa contemplar explicitamente os novos testes e typecheck do core: hoje seus filtros e comandos estão voltados a `modules/atlas`, enquanto o core tem runner Bun próprio. Um verde da lane inalterada não provará F2. Fontes: `ownership-rebuild.ts:213,233,247,262`, `genesis-g2.2-contract.md:99`, `atlas-pilot.yml:8,24`, `packages/core/package.json:12`.

## 3. Linha vermelha — DECIDIDA

### 3.1. Harness e regra de evidência
Os testes de encaminhamento usarão `LLMClient` + protocolo real + `RequestExecutor.layer` + guard econômico + `HttpClient` sintético. O contador fica dentro do delegate físico, como no harness atual do executor; não será o campo `calls` devolvido pelo componente sob teste. Persistência/concorrência usarão o adapter real sobre banco de fixture, com instâncias independentes e barreiras determinísticas. Restart precisa reconstruir estado sem conservar o Map ou contexto do processo anterior. Cada negativo deve identificar o motivo correto. No teste de saldo, slots não podem ser o recurso escasso; no teste de slots, saldo deve sobrar. Fonte: `executor.test.ts:41`, `genesis-economy-control-contract.md:56`.

### 3.2. Testes novos: nomes e asserções exatas

| Nome | Asserção |
|---|---|
| EA-01 valid-request-reserves-forwards-settles | Request válido produz uma reserva recuperável antes de um forward; usage terminal válido liquida a tentativa correta; spent + held e saldo final são exatos. |
| EA-02 reserve-commit-before-forward | Com COMMIT/ack suspenso, forwards = 0. Depois do ack, o delegate físico encontra a reserva por outro leitor antes de observar exatamente um envio. |
| EA-03 failed-or-lost-reserve-ack | Falha antes do COMMIT e perda do ack após COMMIT dão zero forwards. No segundo subcaso, reabrir encontra a reserva; repetir a chave não envia. |
| EA-04 ambient-transaction-is-not-durable-ack | Admissão dentro de transação externa é recusada antes do forward. Rollback externo não pode deixar chamada física sem reserva. |
| EA-05 final-native-bound-required | Bound final ausente, zero, negativo, fracionário, não finito ou incompatível recusa com motivo de bound/capability; zero forwards. Fixture válido com bound suportado encaminha. |
| EA-06 sealed-request-identity-cannot-drift | maxTokens=8 com overlay final max_output_tokens=80 não encaminha sob reserva de oito. Mudar body/modelo/endpoint/capability depois da captura também não encaminha a operação divergente. |
| EA-07 incapable-route-or-guarantee-refuses | WebSocket, comando opaco, transporte com redispatch oculto e pedido de hard-currency sem preço verificado dão recusa específica e zero open/send/forward. |
| EA-08 status-retry-reserves-every-attempt | 503 → 200 gera duas tentativas e duas reservas anteriores aos respectivos forwards. Usage da segunda liquida só a segunda; a primeira permanece reservada sem evidência de usage. |
| EA-09 retry-needs-policy-and-shared-allowance | Dois subcasos independentes: retry proibido com saldo suficiente; retry permitido sem saldo para outra reserva. Ambos param em um forward, pelos respectivos motivos. |
| EA-10 uncertain-transport-does-not-auto-retry | Falha após possível envio e stream truncado após 200 conservam uma tentativa held, sem redispatch automático. |
| EA-11 concurrent-last-allowance | Duas instâncias/processos, saldo 10 e reservas 6, slots suficientes: exatamente uma admissão e um forward; o perdedor recusa por saldo. |
| EA-12 uncertain-inflight-slot-is-retained | Saldo amplo, máximo em voo 1: cancelar localmente A não permite B. Evidência terminal suficiente de A libera o slot, mantendo seu bound econômico se usage faltar. |
| EA-13 same-key-is-not-another-forward-grant | Chamadas concorrentes e repetição após restart com chave/identidade idênticas produzem uma reserva e no máximo um forward total. O retorno existente não concede novo envio. |
| EA-14 conflicting-admission-key-refuses | Alterar separadamente body, inputs, provider/modelo, rota, bound ou política sob a mesma chave retorna conflito e não modifica a reserva anterior. |
| EA-15 headers-or-incomplete-usage-do-not-settle | Headers 200, terminal sem usage, input conhecido/output ausente e usage intermediário sem fechamento terminal mantêm o bound. Nenhum caso usa zero ou fallback como liquidação. |
| EA-16 invalid-usage-retains-obligation | Usage negativo, não finito, fracionário ou com subconjunto impossível é recusado como evidência; não libera saldo. |
| EA-17 out-of-order-usage-matches-its-attempt | A e B concorrentes terminam em ordem invertida. Cada usage altera somente sua tentativa, incluindo a associação com a reserva original de um retry. |
| EA-18 settlement-is-idempotent-and-conflict-aware | Repetir liquidação idêntica não altera totais; repetir com payload conflitante recusa sem novo crédito. |
| EA-19 inclusive-usage-is-counted-once | Input 10/cache 4 e output 8/reasoning 3 debitam input 10 e output 8, preservando o breakdown; nunca 14 e 11. |
| EA-20 reported-overrun-is-not-clamped | Reserva 10, uso confirmado 12: persistir 12, registrar quebra de capacidade e impedir nova admissão; nunca apresentar gasto 10. |
| EA-21 settlement-write-failure-reconciles | Falha antes do COMMIT conserva hold; perda de ack após COMMIT reconcilia liquidação existente. Nenhum subcaso duplica crédito nem chama o provider novamente. |
| EA-22 crash-cutpoints-preserve-held-work | Interrupções após reserva/antes de forward, após forward/antes de terminal e após terminal/antes da liquidação recuperam obrigação conservadora, sem replay automático. |
| EA-23 stages-and-restarts-share-one-envelope | Producer ocupa o último bound; evaluator, update, retry e novo processo encontram o mesmo saldo ocupado, sem bootstrap de allowance novo. |
| EA-24 missing-or-corrupt-authority-fails-closed | Ledger esperado ausente, ilegível, corrupto ou com identidade divergente dá HOLD, zero forwards e nenhuma recuperação para orçamento vazio. |
| EA-25 storage-retry-never-repeats-network | Uma primeira transação sem commit seguida de nova admissão válida produz só um forward, após o commit vencedor. Nenhum callback transacional executa rede. |
| EA-26 semantic-rejection-does-not-refund-usage | Provider conclui e uso é registrado; avaliação recusa o conteúdo. O resultado semântico fica recusado, mas o débito/hold econômico permanece. |
| EA-27 completed-key-reuses-durable-response | Reabrir pedido liquidado com resposta durável devolve a referência existente sem reserva/forward. Se a resposta não estiver recuperável, retorna HOLD sem reenviar. |
| EA-28 admission-refusal-remains-typed | Recusa de saldo/capability/storage atravessa a integração como recusa econômica identificável; não vira resposta vazia válida ou abstention do modelo. |
| EA-29 owner-deletion-does-not-erase-obligations | Excluir a sessão/projeto de origem não remove spent/held nem permite recriar saldo para o mesmo envelope. |

### 3.3. Mutações mínimas obrigatórias

| Mutação | Oracle que precisa rejeitá-la |
|---|---|
| forward-before-reserve-commit | EA-02 |
| accept-failed-reserve-ack | EA-03 |
| accept-savepoint-as-commit | EA-04 |
| check-canonical-cap-only | EA-05/06 |
| bypass-route-capability | EA-07 |
| reserve-outer-execute-only | EA-08 |
| ignore-scoped-retry-policy | EA-09, subcaso com saldo suficiente |
| check-balance-outside-transaction | EA-11 |
| release-inflight-on-local-cancel | EA-12 |
| duplicate-key-returns-forward-grant | EA-13 |
| ignore-admission-fingerprint | EA-14 |
| missing-terminal-usage-is-zero | EA-15 |
| settle-latest-request-instead-of-attempt | EA-17 |
| apply-settlement-credit-twice | EA-18 |
| add-reasoning-to-inclusive-output | EA-19 |
| clamp-actual-usage-to-reservation | EA-20 |
| refund-on-settlement-write-failure | EA-21 |
| discard-held-on-reopen | EA-22/23 |
| fallback-to-empty-economic-ledger | EA-24 |
| refund-on-semantic-refusal | EA-26 (total 22 controles: EA-10/16/25/27/28/29 têm oracles nomeados sem mutação separada dedicada) |

## 4. TOCTOU e recuperação — DECIDIDA

### 4.1. Request, saldo e encaminhamento têm pontos distintos
Request: capturar uma cópia imutável dos bytes finais; fingerprint, reserva e delegate referenciam essa mesma cópia. Validar um preview e depois recompilar não fecha a janela. Saldo: leitura, decisão e inserção pertencem à mesma transação. Um mutex por processo, append indivisível ou CAS de conteúdo não basta para essa propriedade. Encaminhamento: só depois do COMMIT; nunca dentro de callback reexecutável. Fontes: `client.ts:361`, `durable-log.ts:12`, `kernel/src/store.ts:17`, `adapter-io/src/store.ts:123`.

### 4.2. Transação ambiente é uma recusa explícita
F2 recusará `reserve` em contexto transacional ambiente. O driver atual usa savepoint quando já existe transação e, nesse caso, sucesso interno executa RELEASE SAVEPOINT, não COMMIT externo. `Database.Service` já expõe a detecção desse contexto. Fontes: `session.ts:123,165`, `database.ts:44`.

### 4.3. Modelo de falha delimitado
F2 provará retenção após interrupção e reinício de processos sobre a mesma autoridade de armazenamento íntegra. A configuração atual usa WAL e `synchronous=NORMAL`; este desenho não a apresentará como prova de tolerância a perda de energia. Não haverá fallback econômico para snapshot anterior ou estado vazio. Limite explícito: um clone integral ou rollback silencioso de banco para uma versão válida não pode ser detectado universalmente usando apenas aquele banco local. F2 não promete essa proteção, nem coordenação entre bancos independentes. Mudança de autoridade, restauração de backup ou perda da continuidade exige reconciliação; não equivale a novo bootstrap do mesmo envelope. Fontes: `database.ts:35`, `sidecar.ts:353`.

### 4.4. Terminalidade, uso e validade semântica não se substituem
O ledger preserva separadamente: intenção durável de envio; observação de encaminhamento/resposta; término remoto estabelecido; usage confirmado ou desconhecido; resultado semântico aceito ou recusado. Nenhum desses estados será inferido de outro sem a evidência definida. Em particular, `meter()` hoje completa campos ausentes com zero; essa função de relatório não será usada como fonte de liquidação econômica. Fontes: `persist/src/metering.ts:21,30`.

## 5. Contraexemplos — DECIDIDA
Estes são os menores padrões que o contrato deve excluir; não constituem reabertura do PASS de F1.
1. **Uma reserva, dois envios.** Uma chamada lógica recebe 503 → 200; wrapper externo conta uma tentativa, mas o executor encaminha duas. A reserva deve estar abaixo do retry. EA-08.
2. **Saldo 10, duas reservas 6.** A e B leem o saldo antes de qualquer gravação; ambos encaminham. Persistir os dois registros depois não corrige a admissão excedida. EA-11.
3. **Savepoint tratado como durabilidade.** Transação externa abre; reserva interna retorna; provider recebe; transação externa faz rollback. Resta gasto sem reserva. EA-04.
4. **Cap oito, body oitenta.** generation.maxTokens=8, mas overlay final manda max_output_tokens=80. Checar apenas o request canônico deixa a reserva incompatível com o envio. EA-06.
5. **Headers 200 tratados como consumo zero.** Chegam headers e um chunk; o consumidor cancela. Liberar a reserva no retorno de `execute` permite gastar novamente enquanto o trabalho remoto pode continuar. EA-12/15.
6. **Uso parcial promovido a total.** Input é 10, output está ausente; fallback fornece total 10. Liquidar como se output fosse zero devolve saldo sem evidência. EA-15.
7. **Registro idempotente, envio duplicado.** Depois de restart, `reserve(key)` encontra o registro e devolve novamente `allowed:true`; o chamador envia outra vez. Idempotência precisa alcançar a concessão de envio. EA-13.
8. **Usage de B liquida A.** Duas chamadas concorrentes usam uma variável global "tentativa atual"; B substitui A antes de chegar o terminal de A. Um bound é liberado enquanto a obrigação correspondente continua desconhecida. EA-17.
9. **Refund anterior ao COMMIT de liquidação.** Usage chega; memória libera saldo; persistência falha; outra chamada usa o crédito. Após restart reaparece a reserva anterior. EA-21.
10. **Recuperação ressuscita allowance.** Estado mais recente contém uma reserva; recuperação escolhe estado anterior legível sem ela. Esse fallback é útil para outra finalidade, mas incorreto para liberar orçamento. EA-24.
11. **Reasoning contado duas vezes.** Output 8 já contém reasoning 3; contabilizar 11 falsifica a medição. O análogo vale para cache dentro de input. EA-19.
12. **costCap numérico confundido com garantia.** O comando recebe `costCap`, mas não oferece preço ou observação suficiente das chamadas físicas; ainda assim a rota é declarada monetariamente limitada. EA-07.
13. **HTTP protegido, WebSocket livre.** O guard cobre `RequestExecutor`, mas outra rota usa `open/sendText` diretamente. EA-07.
14. **Conteúdo recusado vira chamada gratuita.** A receita já consumiu provider; `evaluate` devolve HOLD e a integração reembolsa o gasto. Aceitação semântica e consumo físico não são a mesma decisão. EA-26.

Escopo da decisão: mecânica sintética de admissão, tentativa, concorrência, liquidação e recuperação no seam definido. Não fecha AC-08 global, não reconcilia retroativamente uso físico desconhecido, não certifica preço/capacidade de provider real e não autoriza spend, runtime, ativação ou publicação. O inventário histórico permanece evidência histórica — explicitamente não é um spending ledger — e a conformance real continua uma fronteira separada. Fontes: `genesis-global-completion-plan.md:141`, `genesis-economy-control-contract.md:73`.
