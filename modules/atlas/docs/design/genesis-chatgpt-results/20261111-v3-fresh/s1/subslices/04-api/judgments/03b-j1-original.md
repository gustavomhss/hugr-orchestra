## Parecer — rodada 3b, B3 D07–D12

**FIX-FIRST para o lote integral de 49 paths.** D07 tem evidência suficiente para seus dois propósitos locais. D08–D12 apresentam suportes importantes, mas ainda faltam trechos para aceitar todos os claims exatos das tabelas.

**Preservo os PASS de B1/B2, o FIX-FIRST de D01–D06 e o veto à liberação integral.** Nenhuma pendência abaixo exige teste ou auditoria operacional fora do escopo declarado.

### Decisão por domínio

| Domínio | Decisão | Fundamento |
|---|---|---|
| **D07 — PTY records and tickets** | **PASS local** | Q032 mostra Info, eventos de lifecycle e inputs de criação/atualização. Q033 mostra ticket e expiração positiva. Isso sustenta os dois propósitos de DTO. As citações de `server-edge.md` continuam como contexto herdado: este PASS não revalida consumo de ticket, raw upgrade ou fila, que dependem do fechamento dos corpos correspondentes. |
| **D08 — Providers/credentials/integration** | **FIX-FIRST** | A distinção estrutural entre credenciais com segredo e projeções de referência está demonstrada. Também estão demonstrados os caminhos de ownership para OAuth por integração e os caminhos genéricos separados de status/complete/cancel. Faltam outros contratos e operações enumerados na tabela. |
| **D09 — MCP/LSP/formatting** | **FIX-FIRST** | Configuração MCP local/remota, Entry reduzido, schemas de status LSP/formatter e suas delegações estão sustentados. A cobertura de eventos, grupos Protocol e operações MCP ainda é parcial. Os helpers de erro, isoladamente, não demonstram sua aplicação aos caminhos alegados. |
| **D10 — Global configuration/trust** | **FIX-FIRST** | A captura de serviços globais, a escrita/aprovação/revogação e as visitas às Locations com `Effect.ignore` estão demonstradas. A ressalva contra inferir convergência é adequada. Faltam os contratos Protocol completos alegados e os caminhos de leitura. |
| **D11 — Capability authority/management** | **FIX-FIRST** | A separação declarada entre referência e autoridade, o recibo opaco, a validação simétrica de FailureDetail, as factories do host e o armazenamento do token estão sustentados. A maior parte dos contratos de management e alguns limites do ticket ainda não foram apresentados. |
| **D12 — Atlas product surface** | **FIX-FIRST** | Target/Anchor como dados, abertura de Atlas com contexto e mapeamento de indisponibilidade estão demonstrados. Faltam contratos de review/setup, callbacks e suporte ao quantificador “todos os endpoints”. A extensão de “empty/present” a setup também precisa ser delimitada. |

### Lacunas obrigatórias precisas

#### D08 — Providers, credentials and integration

- **P19:** apresentar PATCH/DELETE, payload restrito a label, NoContent e ConflictError.
- **P24:** complementar discovery, connect por key/OAuth e os contratos de polling/completion/cancel ainda não mostrados. Para “preservam compatibilidade”, apresentar a declaração histórica pertinente ou restringir o claim à existência das rotas por `integrationID`.
- **Q036, Q039 e Q040:** faltam os trechos de brands e dos eventos de invalidação/refresh.
- **Q034:** AISDK/Native está demonstrado; faltam as formas request/info também afirmadas.
- **G57-E044:** falta a remoção de credencial. O update de label já está sustentado por G57-E043.
- **Handler de integration:** faltam discovery, conexão key/OAuth e disconnect. Os caminhos de tentativa fornecidos por G57-E051/E054/E055 e U04 já sustentam a distinção entre rotas com comparação de ownership e delegações genéricas.

**Não exijo acrescentar ownership aos caminhos genéricos:** o gap correspondente foi explicitamente preservado.

#### D09 — MCP, LSP and formatting

- **P20 e P27:** faltam os endpoints e suas respostas por Location.
- **P28:** o trecho demonstra apenas `mcp.config`; faltam discovery/status/resources/tools, mutations, conexão/OAuth e as descrições sobre redaction e referências de ambiente não resolvidas.
- **Q042:** mostrar a declaração da união de estados. Os trechos atuais apresentam dois estados, a intenção documental de debug e o Entry reduzido.
- **Q043 e Q045:** faltam as declarações dos eventos MCP e LSP.
- **G57-E061/E064:** complementar as chamadas de mutation/conexão/OAuth e os pontos em que os helpers de erro são aplicados.

O comentário sobre masking sustenta uma intenção documentada, sem demonstrar sanitização universal; a ressalva do bounded claim está correta.

#### D10 — Global configuration and project trust

- **P18:** falta o contrato de patch dos campos enumerados, a declaração de substituição das listas e a resposta NoContent.
- **P43:** faltam os endpoints list/approve/revoke e as descrições de realpath/herança. O comentário de escopo global e `DirectoryPayload` não demonstram sozinhos todo esse conteúdo.
- **G57-E041 e G57-E123:** apresentar os caminhos de leitura de config e trust afirmados nas tabelas.

As escritas globais e os loops de reload/apply com falhas ignoradas já estão suficientemente demonstrados para análise de fonte.

#### D11 — Capability authority and management

- **P14:** faltam paginação 1–32, contratos de binding/target e aplicação da exigência de key às demais mutations alegadas. Connect e aplicação de `CapabilityAuthorization` ao grupo estão demonstrados.
- **P15 e P16:** faltam os contratos completos alegados de operator e schedules, incluindo campos de inspeção, origens, authorization, ações e idempotency-key. A exclusão de create/edit desse grupo deve ser sustentada pela superfície declarada ou por descrição explícita.
- **Q055:** o comentário sobre projeção não mostra metadata, cursor/page bounds ou inputs share/pin.
- **Q056, Q057 e Q058:** faltam os trechos dos contratos enumerados.
- **G57-E035/E036/E037/E038/E039:** faltam os adapters de binding/management, inspeção do operator e operações de schedules. O setup/connect com contexto de Location já está demonstrado.
- **Content ticket:** apresentar a configuração de TTL que fundamenta “short-lived”, o começo da emissão que estabelece `now` e o restante de `verify` após a condição de validade. O trecho atual demonstra a devolução do claim enquanto não expirado, mas não mostra o comportamento do ramo expirado.

Não há finding sobre suposto HMAC: o claim atual descreve corretamente um token aleatório opaco em mapa local. Também não converto o comentário sobre revogação pela Core em prova dessa revogação.

#### D12 — Atlas product surface

- **P11:** um endpoint com `ServiceUnavailableError` não sustenta “todos”. Apresentar a superfície declarada de draft/emit/review/decisões/setup/index/mine e a associação de erro aos endpoints correspondentes.
- **Q059:** falta a declaração que estabelece a qualificação **canônica** da ordem dos campos. A ordem visível no `Schema.Struct` demonstra a declaração dos campos, sem demonstrar por si uma regra de canonicalização.
- **Q060:** faltam as formas de review/decision.
- **Q061:** faltam a projeção `present` e os `VerdictFields` mencionados pelas uniões.
- **Q062:** falta o resultado de mining e a composição dos resultados de setup. `AtlasIndexOk` usa `state: "ok"`; esse trecho não basta para estender “empty/present” a setup. Apresentar as uniões correspondentes ou ajustar essa qualificação.
- **G57-E028:** faltam os callbacks de modelo para delegate/mine. A abertura com contexto e o mapeamento de indisponibilidade já estão sustentados.

### Critérios e limites

**QS-1/2/4 e CC-3:** o aceite integral continua bloqueado pelas lacunas identificadas. Os trechos mínimos decisivos são suficientes para correção; não é necessário repetir material já aceito.

**QS-5:** preservada a distinção entre declaração, implementação local e execução. Não concedo autenticação efetiva, segurança de armazenamento, convergência, efeitos externos ou autoridade de review.

**QS-6 e CC-7:** o reúso histórico está identificado; isso permite aproveitar a evidência apresentada, mas não aceitar automaticamente os membros representados apenas por referências.

**GO-I1/2/7/8:** decisões anteriores permanecem registradas; PASS local e pendências coexistem explicitamente. Membership, hashes, comentários e nomes de tipos não substituem suficiência semântica nem concedem autoridade.

**B3 e o L1 integral permanecem abertos.**
