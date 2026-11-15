## Parecer — rodada 4a, B3 v4 D01–D12

**A redução explícita para disposição de domínio é aceitável para a necessidade B3 apresentada.** Ela preserva os membros, identifica propósito/contrato/delegação e mantém os comportamentos dependentes bloqueados. Não é necessário sustentar novamente especificidades que deixaram de ser claims atuais.

**Decisão deste lote: FIX-FIRST residual em D06; PASS limitado nos outros onze domínios.** Incluí o complemento de D09 recebido durante esta rodada. B1/B2 permanecem aceitos; D13–D24, reúso e fechamento integral continuam pendentes.

### Decisões sobre os claims atuais

| Domínio | Decisão | Evidência determinante e alcance |
|---|---|---|
| **D01** | **PASS** | Binding/revisão, identidade de preparação e input de execução aparecem separados nos schemas. Endpoint de comando, erro público, `prepare`, `bindingRef` e projeção de erro sustentam o papel e a delegação do domínio. Não concedo autorização do provedor ou efeito remoto. |
| **D02** | **PASS** | Inputs de revisão/substituição, reminders, escrita com contexto de Location, validação de nome, conflito e delegações de catálogo/skill sustentam o claim reduzido. Execução de turnos e política efetiva permanecem externas. |
| **D03** | **PASS** | Formas request/reply/saved, distinção visível de placement e verificações locais de existência/`sessionID` sustentam o domínio. Não se estende a todas as invariantes de lifecycle. |
| **D04** | **PASS** | Os trechos demonstram registros/notificações e os campos String de todo. A especificidade anterior sobre timestamps foi retirada, sem ser declarada comprovada. |
| **D05** | **PASS** | Identidades/shapes, query de Location, catálogo de projeto e chamadas de registro/init/copy sustentam a disposição. A origem de `projectID` e `sourceDirectory` na criação está explícita. |
| **D06** | **FIX-FIRST residual** | Shapes, query de diff, delegações e projeção do erro de PR estão demonstrados. Falta sustentar a atribuição específica de **error shapes ao Protocol** ainda retida no bounded claim. |
| **D07** | **PASS preservado** | Os dois propósitos de DTO permanecem sustentados. A remissão aos corpos de server-edge/stream não concede aceite antecipado às respectivas fronteiras de implementação. |
| **D08** | **PASS** | Distinção entre credenciais e referências, métodos/status de tentativa e caminhos com/sem comparação de ownership estão demonstrados. Não concedo política aos caminhos genéricos. |
| **D09** | **PASS com o complemento** | `mcp.remove` aplica os mapeamentos de NotFound/ConfigError; `mcp.auth.start` aplica NotFound/AuthError. Os helpers apresentados completam a ligação entre delegação e erro público. Isso resolve por fonte o finding retido sobre seus call sites. |
| **D10** | **PASS** | Serviços globais, atualização/aprovação/revogação e loops por Location com `Effect.ignore` sustentam o claim reduzido e sua ressalva sobre convergência. |
| **D11** | **PASS** | Referência/autoridade, recibo, FailureDetail, factories do host, composição das facades e encaminhamento de contexto sustentam o limite local. O token armazena autoridade/sessão/revisão em mapa aleatório local. Não concedo correção de enforcement de request/placement, revogação ou idempotência. |
| **D12** | **PASS com a precisão anexada** | As uniões adicionais sustentam resultados vazios e não vazios de snapshot/review/index/mine. A precisão distingue “present” descritivo dos discriminantes efetivos `ok` e `missing`. A abertura contextual e o mapeamento de indisponibilidade já estavam demonstrados. |

### Única correção obrigatória restante neste lote: D06

O bounded claim conserva:

> Protocol declares query/input/error shapes

**P44:L41–48** demonstra query e resposta de diff. **G57-E078:L30–40** demonstra a construção do erro no handler, mas os trechos apresentados não identificam sua declaração ou origem no Protocol.

Basta uma das seguintes correções:

- Apresentar o trecho do endpoint/erro Protocol pertinente, com a ligação ao `PullRequestError` usado pelo handler; ou
- Restringir a frase atual ao suporte já disponível, por exemplo: **“Protocol declares the VCS diff query and response shapes; Server delegates reference/Git/PR work to Location services and projects the PR host error.”**

Não solicito a reposição da antiga tabela de D06 nem evidência operacional de Git/PR.

### Tratamento do histórico e critérios

Os findings das especificidades retiradas ficam como **`RETIRED_EXTRA_CLAIM`**, não como resolvidos por fonte. Se essas especificidades voltarem a sustentar um claim atual ou dependente, sua exigência de evidência retorna. A precisão de D12 e o complemento de D09 têm suporte novo; a retirada de outras cláusulas tem tratamento distinto.

**QS-1/2/4 e CC-3** estão satisfeitos no alcance dos onze PASS; a atribuição de D06 permanece pendente. **QS-5** continua respeitado, sem converter fonte em teste ou execução. **QS-6 e CC-7** permitem o reúso explícito dos literais já recebidos, mantendo “now” e “was read in full” como registros históricos, sem alegar releitura atual.

Para **GO-I1/2/7/8**, preservo os pareceres anteriores e a disposição dos claims retirados. Membership e hashes identificam o material; não fundamentam os PASS sem os respectivos literais.

**Não há liberação do L1 integral nesta rodada.**

