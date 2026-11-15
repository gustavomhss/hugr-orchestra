## J1 — union-proposal: REQUEST_EVIDENCE

Recebida a parte integral e **FIM_DO_LOTE**. Parecer sobre `producers/boundaries/union-navigation-proposal.md`, **14.671 bytes**, e evidência literal recebida. Sem ferramentas.

**A proposta apresenta navegação concreta, mantém versões externas `NOT_SELECTED` e distingue roteamento de obrigações de dependência de build.** As 36 keys, os cinco donos, branches, quantidades e paths contratuais de handoff estão sustentados pelos trechos recebidos. Restam duas verificações específicas de atribuição ao kit e as pendências históricas compartilhadas. Não identifiquei defeito obrigatório novo.

### Critérios

| Decisão | Critérios | Fundamentação |
|---|---|---|
| **PASS para a função de proposta** | GO-A1, GO-A3; QS2–QS3 | Diretório de donos, tabela por necessidade e cross-flows fornecem rotas concretas de consulta. |
| **PASS para a função de proposta** | GO-A5, GO-A7; GO-I2, GO-I7–I8; QS4 | Distingue fonte pinada, branch, versão aceita, parecer, predecessor e binding; não cria schema de produto nem Atlas paralelo. |
| **REQUEST_EVIDENCE** | GO-A2, GO-A4, GO-A6; QS1, QS5–QS6; CC1, CC3, CC7; GO-I1; AC01, AC04 | A atribuição de algumas obrigações e estados históricos ao kit ainda precisa dos intervalos abaixo; herança/cobertura seguem os pedidos compartilhados. |

### Evidência obrigatória ainda ausente

#### RE-UNI-01 — Obrigações citadas nos cross-flows

**Localização:** tabela §2, §3.3 e §3.4; `dependencies.json`, particularmente o intervalo **10–54**, omitido entre R079 e R080.

**Pergunta:** o kit atribui exatamente aos donos indicados as obrigações **`C-N01-host`, `C-N01-session`, `C-N02`, `C-N05`, `API-session` e `LLM-tool`**?

- **Esperado:** identificação literal de supplier, consumer e subject, permitindo distinguir observação do kit de recomendação editorial.
- **Observado:** as obrigações são nomeadas no corpo, mas não aparecem nos trechos recebidos. `automation-admission`, `core-entry`, `runtime-and-package-closure` e `external-boundaries` já estão demonstradas.
- **Necessário:** intervalo literal que contém aquelas seis obrigações, incluindo seus campos de roteamento. Não é necessário repetir o restante de `dependencies.json`.

#### RE-UNI-02 — Estados históricos e identidade das missions

**Localização:** abertura, referência a K01–K08 e links das cinco missions.

**Pergunta:** quais arquivos do kit contêm os estados **`NOT_STARTED`/`PREPARED_NOT_EXECUTED`** mencionados, e quais são suas identidades capturadas?

- **Esperado:** atribuir cada estado ao arquivo e momento históricos corretos.
- **Observado:** roster/partition comprovam os caminhos e a divisão, mas os campos de estado não foram transportados.
- **Necessário:** somente os campos/intervalos pertinentes das missions ou roster que contenham esses estados, acompanhados da identidade da fonte. Não peço os cinco documentos completos nem consulta ao progresso atual de outras sessões.

### Pendências compartilhadas e itens agora atendidos

- **RE-BND-01:** a proposta concreta de navegação foi recebida. Permanecem os componentes históricos/populacionais daquele pedido.
- **RE-SUP-01:** R078 e R082 sustentam **36 keys históricas, 2.236 paths e a distribuição 555/424/462/472/323**. Esses números não precisam ser reenviados. A preservação do corpo histórico, a contagem histórica de Core e a cobertura individual permanecem com seus pedidos próprios.
- **§3.1–§3.3:** as remissões a observações locais conservam as pendências de evidência dos corpos de automação, boundaries e support. Esta proposta não lhes concede aceite por referência.
- **D-SUP-01:** permanece restrito ao corpo support; nenhum texto desta proposta o corrige ou substitui.

**Continuidade:** este julgamento não exige handoffs atuais, L2–L4, consumo ou publicação nesta fase preparatória. Também não seleciona versões, cria dependências de build ou aceita a união.