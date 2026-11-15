## J2 — rodada 3b, B3 D07–D12: **FIX-FIRST**

O lote permite **PASS local dos dois DTOs de D07** e sustenta partes relevantes dos demais domínios. Ainda faltam evidências literais para fechar todas as alegações das **49 linhas** apresentadas.

**B1/B2 permanecem aceitos. Os findings de D01–D06 e o veto ao L1 integral permanecem preservados.**

### D07 — PTY records and tickets: **PASS local**

`Q032` demonstra Info, eventos de ciclo de vida e inputs de criação/atualização. `Q033` demonstra ticket e expiração como DTO.

Esse PASS cobre os **dois membros Schema**. As citações de `server-edge.md` identificam claims herdados sobre consumo de ticket, upgrade e fila; não demonstram novamente seus mecanismos. Essas remissões permanecem para o fechamento separado dos corpos, sem converter o DTO em autorização ou garantia de backpressure.

### D08 — Providers/credentials/integration: **FIX-FIRST**

**Sustentado:** distinção AISDK/Native; representação secret-bearing de Credential.Value; projeção de referência/nome em Connection; métodos e estados de tentativa; atualização do label; checks locais de ownership nas três rotas OAuth específicas.

`G57-E051/E054` e `U04` mostram a verificação nas rotas específicas de status/complete/cancel. `G57-E055` e `U04` mostram as delegações genéricas separadas. Isso não determina a política interna dessas rotas genéricas.

**Complementos obrigatórios:**

- **Q034:** request/info de Provider. **Q036:** brands de identidade. **Q039/Q040:** eventos de invalidação/refresh.
- **P19:** declarações PATCH/DELETE, payload limitado ao label, NoContent e ConflictError.
- **P24:** discovery, conexão key/OAuth e demais contratos ainda não apresentados; a intenção de compatibilidade precisa da declaração correspondente.
- **G57-E044** e ramos restantes de **H:integration.ts:** remoção de credencial, discovery, conexão e disconnect.

“Safe” fica limitado à projeção de referências exibida; não concede sanitização universal ou armazenamento seguro.

### D09 — MCP/LSP/formatting: **FIX-FIRST**

**Sustentado:** distinção básica local/remote; opções remotas; Entry reduzido; schemas de status de LSP/formatter; handlers de status; catálogo/resources/config de MCP; definições dos helpers de erro.

**Complementos obrigatórios:**

- **Q042:** união exportada de estados. Os dois membros isolados não demonstram a união alegada.
- **Q043/Q045:** eventos MCP/LSP.
- **P20/P27:** contratos de resposta e contexto Location.
- **P28:** demais contratos de tools/resources, mutations, conexão e OAuth; descrições de redaction e referências de ambiente não resolvidas.
- **H:mcp.ts:** ramos das operações restantes e **call sites dos helpers de erro**. Definir `notFound`/`invalid` não demonstra que os caminhos alegados os aplicam.

O comentário de masking sustenta intenção documentada; a ressalva contra inferir sanitização efetiva está correta.

### D10 — Config/trust global: **FIX-FIRST da tabela; bounded_claim sustentado**

Os trechos mostram captura de serviços globais, escrita/aprovação/revogação, visita às Locations abertas e `.pipe(Effect.ignore)` nas tentativas locais de reload/apply. A conclusão de que sucesso da resposta não prova convergência está sustentada.

**Complementos obrigatórios:**

- **P18:** campos do patch, substituição de listas e declaração da resposta.
- **P43:** endpoints list/approve/revoke e descrições de realpath/herança.
- **H:config.ts / H:trust.ts:** ramos de leitura/listagem atribuídos aos handlers.

Não é necessário demonstrar convergência para fechar esses claims locais.

### D11 — Capability authority/management: **FIX-FIRST**

**Sustentado:** referências como dados; receipt opaco e verificação declarada; limite simétrico de **4.096 bytes UTF-8 de JSON** em FailureDetail; aplicação de CapabilityAuthorization no factory apresentado; construção dos serviços host-owned; conexão com contexto de Location; armazenamento de authority/session/ref em mapa de tokens.

**Complementos obrigatórios:**

- **Q055–Q058:** schemas efetivos de artefatos, páginas/cursors, share/pin, refs versionadas, bindings/receipts, schedules e setup/outcomes. O comentário de Q055 não demonstra esses contratos.
- **P14:** limite 1–32 e contratos das demais mutations, headers e respostas.
- **P15/P16:** inspeção/origins, autorização, operações de schedules e exigência de key; sustentar também a delimitação declarada de create/edit.
- **G57-E035/E036/E037/E038/E039:** operações de management/binding, inspeção de operador e schedules.
- **R:capability-content-ticket.ts:** configuração efetiva de TTL e final completo de `verify`. O fragmento demonstra o retorno enquanto válido, mas não mostra o comportamento após expiração; `make(ttlMillis)` sozinho não sustenta “short-lived”.

O vínculo demonstrado pelo mapa é com os valores armazenados em `Claim`. Proveniência confiável da authority, revogação e autorização da leitura continuam fora desse PASS localizado. O código apresentado não é uma construção HMAC.

### D12 — Atlas product surface: **FIX-FIRST**

**Sustentado:** Target proposto sem autorização de execução; campos de Anchor; AtlasEmpty; parte dos resultados de review/index; abertura com contexto de projeto/Location e mapeamento de unavailable.

**Complementos obrigatórios:**

- **Q059:** declaração ou mecanismo da ordem canônica alegada; a ordem visível dos campos do Struct não demonstra sozinha canonicalização.
- **Q060:** formas de review/decision.
- **Q061:** projeções restantes, tags e `VerdictFields`.
- **Q062:** resultados de mining e uniões de resultados. O trecho exibido demonstra `state: "ok"` para index; a descrição genérica empty/present precisa ser conciliada com os tags efetivos.
- **P11:** demais endpoints ou mecanismo comum que sustente **“todos declaram ServiceUnavailable”**; apenas snapshot foi apresentado.
- **G57-E028:** callbacks de modelo escolhido para delegate/mine.

Os nomes dos resultados Atlas não constituem recibos de revisão desta campanha.

### Critérios e limites

**QS-1/QS-4/CC-3:** atendidos nas partes identificadas; pendentes para o conjunto integral das linhas. **QS-2:** utilidade local demonstrada, suficiência global pendente. **QS-5:** preservada a separação entre fonte, intenção documentada e execução. **QS-6:** complementar apenas os trechos faltantes permite reúso econômico. **CC-7:** origem e histórico permanecem explícitos.

**GO-I1/GO-I2:** decisões anteriores e findings continuam registrados. **GO-I7/GO-I8:** hashes, membership, DTOs e labels não conferem autoridade nem substituem evidência semântica.

**Veto ao L1 integral mantido.** Os complementos pedidos são locais e de fonte; não exigem testes, autenticação externa, auditoria operacional ou garantias adicionais de Core/runtime.
