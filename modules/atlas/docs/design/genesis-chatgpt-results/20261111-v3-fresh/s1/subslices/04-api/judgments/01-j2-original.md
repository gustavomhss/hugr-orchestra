## J2 — decisão do lote DELTA B1/B2: **FIX-FIRST**

Reavaliação de regressão B-v3 da execução `94f1e157-8c44-4e6e-a4af-7690a8845ecf`. Os PASS abaixo se limitam aos deltas apresentados. **B2.active-history ainda tem lacunas de evidência; B3 e a liberação completa de L1 permanecem pendentes.**

| Item | Decisão | Evidência e limite |
|---|---|---|
| **B1 — limite do diagnóstico** | **PASS do delta** | `middleware/schema-error.ts` confirma prefixo de até 1.024 unidades de comprimento de string JavaScript, seguido pelo sufixo com a quantidade omitida. O parágrafo corrigido reconhece que o resumo completo pode ultrapassar 1.024 e restringe a afirmação ao mapeamento tipado apresentado. `kind`, log e `InvalidRequestError` estão sustentados. |
| **B2.active-history** | **FIX-FIRST** | A anotação de `active` sustenta o significado declarado: drains foreground pertencentes ao processo. `SessionActive` sustenta `{type: "running"}`, mas o trecho não mostra o envelope que mapeia IDs de sessão. `SessionHistoryQuery`, `PositiveInt` e `NonNegativeInt` sustentam `limit` inteiro de 1–100 e `after` inteiro não negativo. **Não demonstram default 50, exclusividade de `after`, retorno de eventos duráveis ou `hasMore`.** |
| **B2.cross-session** | **PASS do delta** | `SessionStore.message` fornece a sessão proprietária da linha; `V2Session.message` retorna a mensagem somente quando `stored?.sessionID === input.sessionID`. O handler converte ausência — inclusive divergência de sessão — em `MessageNotFoundError` e sucesso em `{data: message}`. Isso sustenta a rejeição descrita, sem provar garantias transacionais ou de execução do Core. |
| **B2.production-sse** | **PASS do delta de alocação em produção** | `EventHandler` cria `frame = eventFrames()` fora do callback de cada assinatura e passa essa mesma função a `eventStream(events, frame)`. O `WeakMap` fica compartilhado nesse handler e usa identidade do objeto como chave. O trecho também mostra a obtenção de `allBounded` antes da composição do frame inicial, capacidade declarada, heartbeat e headers. O PASS não mede desempenho nem certifica ausência de perdas, comportamento de proxies ou a implementação interna de `allBounded`. |
| **B2.generated-runtime** | **PASS dos ramos apresentados** | O ramo binário contém diretamente `await response.arrayBuffer()`, coerente com a ressalva sobre ausência do tratamento de erro do leitor JSON. O `finally` tenta cancelar o reader, absorve erro de cancelamento e chama `releaseLock()`. Os demais claims do parser/codec são apoio histórico declarado, **não foram novamente demonstrados neste lote**. |

### Evidência específica necessária para fechar `B2.active-history`

Fornecer os trechos de fonte que mostrem:

1. O schema de resposta de `active` com o mapeamento de IDs de sessão.
2. A aplicação de `limit ?? 50`, ou equivalente.
3. O filtro exclusivo da sequência, equivalente a `sequence > after`.
4. O caminho de leitura do armazenamento durável e a construção da resposta com `hasMore`.

São pedidos de **evidência de fonte**; não solicito execução de testes para esses claims.

### Critérios aplicáveis

| Critérios | Resultado neste lote |
|---|---|
| **QS-1, QS-4, CC-3** | Sustentados nos deltas aprovados; pendentes nos claims de `active-history` identificados acima. |
| **QS-2** | As correções têm utilidade localizada para L1; não estabelecem suficiência do pacote completo. |
| **QS-5** | Preservada a distinção entre leitura de fonte, evidência de testes e execução. Nenhum resultado de execução é concedido. |
| **QS-6** | Reúso histórico aceito como estratégia econômica; não equivale a novo PASS dos corpos completos ainda não apresentados. |
| **CC-7** | Código gerado e histórico B-v2/B-v3 estão explicitamente identificados. A revisão integral dos corpos permanece pendente. |
| **GO-I1, GO-I2** | Preservados os dois pareceres B-v2 `FIX-FIRST` e a união dos findings. O partial PASS histórico de J2 não elimina B3 de J1. |
| **GO-I7, GO-I8** | Identidade, hashes e recalculações são dados declarados do pacote. Não concedem autoridade, prova semântica de suficiência ou binding externo. |

**Veto agregado mantido.** Este parecer não libera L1, Atlas, consumidor, CI ou entrega. **CC-1/B3** aguardam o lote completo e a triagem semântica dos 190 módulos.
