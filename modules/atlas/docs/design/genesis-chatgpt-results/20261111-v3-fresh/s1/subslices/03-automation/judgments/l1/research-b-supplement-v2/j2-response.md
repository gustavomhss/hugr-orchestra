## J2 — FIX-FIRST para `research-b` v2, R8–R14

**Candidato:** `producers/research/body.md`, 63.501 bytes, SHA256 `d2def4b82495605b491e0d5494b1511e1b68c47dcffa84af87c8d35705468661`.

Considerei o suplemento integral e as três correções de transporte registradas. **Os pedidos de evidência foram atendidos, mas o caminho completo de `code_locate` revela uma qualificação obrigatória no limite de buscas descrito em R8.**

### Achado obrigatório — RB-J2-F01

**Critérios:** QS1, GO-A6, CC3.  
**Localização:** corpo **R8, `code_locate`**; suplemento **RB-S005, `locate.ts` 56–79 e 187–199**; teste **RB-S032, 98–114**.

| Elemento | Constatação |
|---|---|
| **Esperado** | O limite informado deve corresponder ao número de consultas internas nos ramos documentados, incluindo a sondagem inicial do índice quando ela ocorre. |
| **Observado** | A formulação genérica de **32 buscas** não cobre o ramo em que `sources.query` existe, mas a consulta inicial de `ranks()` falha com `index_unavailable` ou `index_building`. Essa consulta já ocorreu; `ranks()` devolve `undefined`, `query` fica ausente e a seleção passa a permitir **32 listas lexicais**, sem descontar a sondagem consumida. |
| **Contraprova estática** | Com `sources.query` presente e indisponível, mais 16 termos distintos, há **1 chamada de `query` para `map` + 32 chamadas lexicais = 33 consultas internas**. O teste de teto fornecido cobre o caminho com índice utilizável; o teste de fallback mostrado usa `query: undefined`, que não realiza a sondagem inicial. |
| **Correção necessária** | Qualificar o limite em R8 e registrar esse ramo de fallback, distinguindo as listas selecionadas da sondagem inicial. Não afirmar teto absoluto de 32 chamadas internas para todos os caminhos. Esta correção é documental; não exige alterar o produto nem executar testes nesta fase. |

### Pedidos anteriores

| Pedido J2 | Estado da evidência | Fundamento |
|---|---|---|
| **RE-B-01** | **Resolvido** | RB-S001–003 fornecem uniões, coordenadas, limites, normalização, escopo, abertura dos shards, ordenação do manifesto e operações de query. A correção v2 de “mais novo retido” para **primeiro retido presente na ordem do manifesto** está sustentada por `previous.find`, `retain` e `touch`. |
| **RE-B-02** | **Resolvido** | RB-S004–006 completam parsing e paginação de search, seleção e verificação de locate, fallback e liveness. A separação entre frescor de captura, alcance HTTP, helper de domínio e resolução DNS permanece apoiada. O achado RB-J2-F01 resulta dessa evidência adicional. |
| **RE-B-03** | **Resolvido** | RB-S007–013 sustentam os runners fechados, snapshot com links de dependências, seleção de assets, argv, diagnósticos, limites de processo e semáforos. O corpo conserva a diferença entre parâmetros/flags locais e eficácia externa de isolamento ou memória. |
| **RE-B-04** | **Resolvido** | RB-S014–017 mostram binding nativo, duas representações de tool part, allowance persistida, compatibilidade antiga, cobrança idempotente, ausência de crédito de bytes, diretórios e validação dos artefatos. |
| **RE-B-05** | **Resolvido** | RB-S016–019 completam leitura de páginas, locators, mutações e CAS, captura, tentativas, replay sem reacquisição, views, inquiry e declarações de ferramentas. Permanecem distinguidos custódia, admissão, disponibilidade dos bytes e verdade da proposição. |
| **RE-B-06** | **Resolvido** | A projeção compartilhada das 130 fontes e RB7 fornecem a reconciliação e as expectativas decisivas E44–E46. As asserções continuam identificadas como contratos preparados e **NOT_RUN** nesta produção. |

**Não há outro pedido de evidência pendente para este lote.** A correção obrigatória é a qualificação de R8 indicada acima.

O **PASS de `research-a` v2, R0–R7, permanece preservado**. Este parecer não altera os demais lotes nem encerra binding, uso efetivo de Atlas, consumidores, manutenção executada ou qualificação de runtime.