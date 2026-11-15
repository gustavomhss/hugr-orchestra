## J2 — rodada 4a, B3 v4 D01–D12: **PASS da disposição DOMAIN-LEVEL**

**Aceito a redução apresentada para D01–D12, incluindo o complemento D09 recebido nesta rodada.** A forma atual atende, neste recorte, à necessidade de identificar papel, contrato público e fronteira local de delegação por domínio, com membership explícito, evidência decisiva, lacunas condicionais e dependentes bloqueados.

O PASS incide **somente sobre os bounded_claims atuais de D01–D12** do corpo identificado pelo SHA256 `36339a1329421f80d15e37b40ce26edd6e1c793a0ac1b5056471e4df2bfed57c`. Não aprova as antigas tabelas detalhadas nem o corpo integral ainda não apresentado.

### Decisões por domínio

| Domínio | Decisão e fundamento |
|---|---|
| **D01 — Actions** | **PASS.** Binding/revisão, identidade preparada e input de execução aparecem separados; o protocolo e os helpers apresentados sustentam a fronteira de comando, referência e projeção de erro. Autorização do provedor, atomicidade e efeito remoto permanecem dependências explícitas. |
| **D02 — Agent/behavior/skill/prompt** | **PASS.** Os trechos sustentam configuração, revisão, substituição de behaviors, reminders como propósito declarado e delegações locais com tratamento de nome/conflito/erro. Não se infere execução de modelo/tool ou política efetiva. |
| **D03 — Permission/question** | **PASS.** Formas públicas e separação de contexto estão identificadas. Os checks de existência e `sessionID`, com os erros correspondentes, demonstram a fronteira local retida. Invariantes de política, persistência e concorrência continuam bloqueados. |
| **D04 — Projeções de Session** | **PASS.** Os schemas e eventos sustentam representação/notificação e os campos String de todo. O detalhe de timestamps retirado não é necessário ao bounded_claim atual. Efeitos e cálculos ficam atribuídos aos serviços proprietários. |
| **D05 — Project/workspace/copy** | **PASS.** Identidade, contexto e delegações essenciais estão mostrados, particularmente a origem de `projectID` e `sourceDirectory` em copy creation. Não se concede autoridade de filesystem ou garantia de isolamento/lifecycle. |
| **D06 — Files/reference/Git/PR** | **PASS no nível de domínio.** DTOs, contrato de consulta, catálogo, chamadas aos serviços e projeção do erro de PR sustentam o papel e a fronteira pública descritos. Isso não revalida especificações completas de endpoints ou schemas retiradas. |
| **D07 — PTY** | **PASS preservado.** Os dois membros continuam sustentados como DTOs de processo/eventos/inputs/ticket. As remissões a consumo de ticket, upgrade e filas permanecem vinculadas ao fechamento separado dos corpos correspondentes. |
| **D08 — Providers/integration** | **PASS.** Shapes de segredo e referência permanecem distintos; as rotas específicas de tentativa mostram o check de ownership, enquanto as genéricas mostram suas delegações próprias. Não há inferência de sucesso de autenticação ou segurança de armazenamento. |
| **D09 — MCP/LSP/formatting** | **PASS após o complemento.** `mcp.remove` chama `notFound` para `Mcp.NotFoundError` e `invalid` para `Mcp.ConfigError`; `mcp.auth.start` demonstra os caminhos NotFound/AuthError. Os helpers mostram as projeções públicas. A lacuna dos **call sites retidos** está agora resolvida por fonte. |
| **D10 — Config/trust global** | **PASS.** Captura dos serviços globais, alterações, visita às Locations e tratamento local com `Effect.ignore` sustentam o bounded_claim e sua ressalva de não convergência. |
| **D11 — Capability** | **PASS no nível de domínio.** Referências, resultados, limite simétrico de FailureDetail, middleware, facades e delegação contextual estão sustentados. O token conserva os valores de Claim no mapa. Os claims retirados de TTL “short-lived” e comportamento completo de expiração não recebem aceite por esta redução. |
| **D12 — Atlas** | **PASS após a precisão das uniões.** Os novos literais sustentam as alternativas de resultado e distinguem `"empty"`, `"ok"` e `"missing"` onde apresentados. “Present” fica corretamente delimitado como descrição de resultado não vazio. Abertura contextual e mapeamento de unavailable estão mostrados; labels continuam sem autoridade de revisão ou execução. |

### Disposição dos findings anteriores

A retirada das especificidades locais é admissível **porque o corpo promovido passa a afirmar somente a disposição de domínio prevista no critério apresentado**, preservando membros e necessidades.

Os findings correspondentes às antigas tabelas devem permanecer associados a **`RETIRED_EXTRA_CLAIM`**:

- **Não estão resolvidos por fonte.**
- Não recebem PASS retroativo.
- Seu eventual reúso como alegação atual exigirá a evidência antes apontada.

Isso é distinto dos complementos efetivos desta rodada: os **call sites de D09** e a **precisão dos resultados de D12** receberam sustentação literal adicional.

### Critérios e limites do aceite

**QS-1/QS-2/QS-4/CC-3:** atendidos para a disposição atual dos doze domínios, com a profundidade limitada ao contrato e à fronteira local. **QS-5:** a leitura integral mencionada continua sendo registro histórico B-v3; este parecer não atesta nova leitura integral, testes ou execução. **QS-6:** o reaproveitamento dos intervalos já apresentados é suficiente para os claims atuais. **CC-7:** conteúdo histórico, claims promovidos e especificidades retiradas permanecem diferenciados.

**GO-I1/GO-I2:** preservam-se as decisões e lacunas históricas, sem reclassificá-las como evidência obtida. **GO-I7/GO-I8:** dados, labels e hashes não conferem autoridade nem substituem suficiência semântica. A preservação física e as identidades de arquivos são dados declarados pela principal; não foram verificadas por este juiz.

**Nenhuma lacuna obrigatória dos bounded_claims atuais de D01–D12 permanece neste recorte após o complemento D09. B1/B2 seguem aceitos. O veto ao L1 integral permanece:** faltam D13–D24 e o fechamento dos corpos/reúso.

