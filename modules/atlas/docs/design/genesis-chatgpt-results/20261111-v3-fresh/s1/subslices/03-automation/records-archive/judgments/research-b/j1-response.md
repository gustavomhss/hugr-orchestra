## J1 — research-b: REQUEST_EVIDENCE

Recebidas as **7/7 partes**, encerradas por **FIM_DO_LOTE**. O parecer cobre **R8–R14**, recorte de `producers/research/body.md` a partir do byte UTF-8 **35158 até EOF**, e a evidência literal deste lote. Não usei ferramentas nem acessei arquivos.

**As distinções entre resultado, custódia, admissão, revisão e verdade semântica estão bem formuladas e parcialmente demonstradas. Faltam ramos decisivos para verificar os contratos de consulta, probes, autoridade, paginação e retomada, além da cobertura declarada.**

Não identifiquei contradição factual demonstrada que imponha `FIX-FIRST` com a evidência recebida. A decisão permanece **REQUEST_EVIDENCE**. O parecer anterior de **research-a** e os pedidos **RE-A1–RE-A5** continuam integralmente abertos.

### Resultado por critério pertinente

| Critérios | Decisão neste lote | Localização e justificativa |
|---|---|---|
| **GO-A1, CC3** — entendimento transferível; comportamento, contrato, decisão e impacto | **REQUEST_EVIDENCE** | R8–R12 explicam consequências relevantes para consumidores. Parte dessas consequências depende de fluxos ausentes: resoluções de query, verificação integral de Locate, runners, views e retomada. |
| **GO-A2, GO-A4, GO-I1** — construção cumulativa, reúso e preservação | **REQUEST_EVIDENCE** | R13–R14 mantêm a separação entre história, produção e aceite, mas não resolvem a comprovação de reúso e disposição solicitada em RE-A1. |
| **GO-A3, QS2, QS3** — aprofundamento, utilidade e simplicidade | **PASS, restrito ao recorte** | A organização separa consultas, experimentos, orçamento, custódia e publicação. A tabela R14 associa situações observáveis a ações e limites, permitindo consulta orientada por necessidade. |
| **GO-A5, GO-I2, GO-I8** — atualidade, validade, autoridade e suficiência | **PASS, restrito ao recorte** | R8 distingue stale/dirty, ausência de hits e completude; R11–R12 distinguem bytes, eventos e interpretação. Não há promoção de locator, receipt, contagem ou hash a prova de verdade. |
| **GO-A6, QS1, QS5, QS6** — mecanização delimitada, fidelidade e evidência | **REQUEST_EVIDENCE** | Várias condições estão literalmente demonstradas; outras são descritas apenas no corpo ou remetidas a E30, E32–E33 e E43–E46, não transportados. |
| **QS4, CC7** — arquitetura, persistência e disposição | **REQUEST_EVIDENCE** | E37–E40 sustentam distinções centrais de persistência. Faltam parte das proteções de filesystem, validação de cursores, fluxo completo de retenção e a disposição verificável dos testes/fontes. |
| **CC1, AC01** — população, necessidades e lacunas | **REQUEST_EVIDENCE** | R13 declara leitura substantiva de 80 implementações e disposição dos demais 50 arquivos. A tabela agrupada não permite reconciliar cada path e sua necessidade; a cobertura pedida em RE-A1 continua necessária. |
| **GO-A7, GO-I7** — Atlas existente, fronteiras e conteúdo importado | **PASS, restrito ao recorte** | R10–R14 preservam ownership externo, exigências de proveniência e tratamento de texto hostil como dado. Não se infere operação Atlas, autorização ou privilégio a partir do conteúdo. |
| **AC04** — produção efetiva e tratamento de conflito, stale e conteúdo sem autoridade | **REQUEST_EVIDENCE** | O corpo trata esses casos de modo concreto e preserva lacunas próprias. A produção sobre todas as fontes e alguns mecanismos descritos precisam dos complementos abaixo. A ausência de execução de produto não é motivo desta decisão. |

### Evidência necessária

#### RE-B1 — Consulta, busca e localização

**Localização:** R8.1–R8.2; E24–E27; `code-index/types.ts`, `code-index/query.ts`, `search.ts` e `locate.ts`.

**Pergunta exata:** quais ramos sustentam os limites de apresentação, a aplicação seletiva do dirty overlay e a verificação de todo range devolvido por Locate?

- **Esperado:** poder distinguir resultados atualizados, relações ainda armazenadas, ambiguidades e descartes de ranges.
- **Observado:** E24 demonstra stale, estados sem shard e cálculo de `coverage.complete`; E25 demonstra construção do overlay e listagem de símbolos; E27 mostra uma função de validação e parte de basis. Não aparecem todas as rotas relevantes nem a aplicação dessa validação aos candidatos.
- **Evidência necessária:** declarações de operações e limites em `types.ts`; construção de basis e branches de resolução por id/nome/posição, references/callers/callees/imports/map em `query.ts`; validação lexical de path e filtros dirty desses caminhos. Em `search.ts`, fornecer parsing de JSON, modos e corte de snippets. Em `locate.ts`, fornecer seleção/materialização/validação dos ranges, descarte, fallback lexical e composição completa de coverage/bounds.

#### RE-B2 — Liveness e fronteira de rede

**Localização:** R8.3; E28; `research-toolkit/liveness.ts`.

**Pergunta exata:** o fluxo completo confirma o atalho por captura, a classificação de resultados e as limitações atribuídas a `allowed`, DNS e redirects?

- **Esperado:** base literal para separar reachability, proveniência e política de acesso.
- **Observado:** os trechos sustentam o atalho LIVE, a transformação DEAD → LIKELY_HALLUCINATED, 2xx/429 e recusa DNS de endereços privados. Não mostram o fluxo HTTP completo nem a relação entre `check` e `allowed`.
- **Evidência necessária:** funções completas `check`, `allowed` e `probe`, com constantes, cálculo de captura recente, normalização, HEAD/GET, timeout e redirects; trecho que conecta a checagem DNS ao fetch. A intenção de `privateNetwork` para testes pode ser sustentada por comentário/contrato de teste, sem execução.

#### RE-B3 — Probes: entrada fechada, preparação, execução e retenção

**Localização:** R9; E29–E33; `probe/{types,run,snapshot,assets,runners,typecheck}.ts` e implementação de `ResearchProcess`.

**Pergunta exata:** os comandos efetivamente construídos, os snapshots e o retorno de `run` sustentam o contrato de experimento limitado descrito em R9?

- **Esperado:** verificar a união fechada, o vínculo de runners/paths, o alcance dos caps e a ausência de retenção automática.
- **Observado:** E29 demonstra defaults, plataforma, timeout, uso de scratch fixo, chamada de confine e precedência do verdict. E31 demonstra symlinks de dependências. E30, E32 e E33 não foram recebidos.
- **Evidência necessária:** união de inputs; restante de `run`, incluindo retorno — em particular o intervalo entre as linhas **65–94** — e controle de slots; seleção/cópia/digest em snapshot; validação de assets, comandos de runners e parser de typecheck; ambiente, captura, timeout e encerramento de `ResearchProcess`. Basta a fronteira local de chamada de jail/MemoryCap/AppProcess; sua eficácia externa continua fora da prova deste componente.

#### RE-B4 — Binding, orçamento e identidade de operação

**Localização:** R10–R11.1; E34–E36; `research/{binding,allowance,ledger}.ts`.

**Pergunta exata:** quais verificações locais completam a autoridade de sessão/task, a leitura retida e a identidade durável de bind/charge/operação?

- **Esperado:** sustentar a separação entre declaração de identidade, invocação nativa e acesso retido.
- **Observado:** há suporte para agent/projeto, TaskBound único, frame, comparação de binding, tool part, charge idempotente e reserva sem crédito. Faltam os demais vínculos e caminhos descritos.
- **Evidência necessária:** resolução de task/authorSession/worktree; restante da validação das duas representações de tool part; rotas de leitura retida; bind repetido/compatibilidade de allowance e tratamento de ledger inválido/interrupção; funções de hash canônico, operation/event id e definição dos tipos admitidos em `ledger.ts`. Preservar a atribuição da transação subjacente ao dono de EventV2.

#### RE-B5 — Custódia, cursor, fonte parcial e locators

**Localização:** R11; E37–E39; `research/artifacts.ts` e `research/records.ts`.

**Pergunta exata:** como o caminho completo impede substituição de bytes, uso de cursor em outro contexto e validação de locator sobre leitura incompleta?

- **Esperado:** demonstrar identidade e integridade nos limites de escrita, leitura e endereçamento.
- **Observado:** E37 sustenta evento único, comparação manifest/receipt/digest e preservação de `complete=false`; E38 sustenta escrita exclusiva, fsync e hardlink; E39 sustenta regras de quote/JSON e o limite de identidade dos blocos Locate. Não aparecem todos os controles declarados.
- **Evidência necessária:** `put`, derivação/validação de diretórios e helper de leitura `bytes`; validação de cursor/offset e `verifySource`; rotina `source` que percorre páginas integralmente; remapeamento por `lineStart` e validação de entrada dos locators. Mostrar onde a leitura preserva erros de indisponibilidade, sem readquirir fonte live.

#### RE-B6 — Records, aquisição, views e inquiry

**Localização:** R12; E39–E42; `research/records.ts` e funções correspondentes em `ledger.ts`.

**Pergunta exata:** o fluxo completo sustenta replay exato, retomada sem ação live oculta, limites/cursor das views e a escolha do dispatch atual para inquiry?

- **Esperado:** verificar os caminhos que decidem se repetir, abster-se ou reler um resultado retido.
- **Observado:** E40 demonstra CAS e reconciliação após erro; E41 demonstra recusa de readquisição quando falta outcome; E42 demonstra bloqueio após close e validação de labels Markdown. Não foram recebidos o início da aquisição durável, a recuperação integral do resultado retido, as views nem a seleção do dispatch mais recente.
- **Evidência necessária:** precondições/caps e validação de evidence/contrary/relations/findingRefs de `record`; início/publicação de `beginAcquisition` e retorno do replay; views de corpus/attempts/records e find; rotina completa de inquiry e funções `dispatch`/`closed`. Para a alegação de que check/close não exigem opened localmente, fornecer o fluxo completo dessas precondições, permitindo verificar a ausência sem depender de um recorte parcial.

#### RE-B7 — Disposição de fontes, testes e seat

**Localização:** R10.1, R13–R14; E43–E46; `seat-tools.ts` e cobertura declarada.

**Pergunta exata:** cada fonte declarada tem disposição verificável e os contratos de teste selecionados sustentam as necessidades atribuídas a seus grupos?

- **Esperado:** reconciliação por path, incluindo implementações, testes, locks, gerado e README.
- **Observado:** R13 apresenta agrupamentos e remete à cobertura; E43–E46 não foram transportados.
- **Evidência necessária:** compartilhar com **RE-A1** a mesma cobertura completa, sem criar matrizes divergentes; fornecer E43 e as expectations decisivas E44–E46, com paths exatos. Não é necessário executar os testes nem retransmitir fixtures repetitivas.

### Pontos demonstrados que devem permanecer

- **Completude limitada da query:** E24, linhas 119–130, sustenta a separação entre skips/linguagens, freshness e bounds.
- **Probe não equivale a exit 0:** E29, linhas 99–110, sustenta verdict por precedência e `expect`.
- **Custódia depende de admissão e bytes:** E37, linhas 85–112, sustenta a distinção central de R11.
- **Fonte parcial continua parcial ao terminar a paginação:** E37, linhas 134–145.
- **Reserva não devolve saldo:** E35, linhas 155–163.
- **Erro de publicação exige reconciliação:** E40, linhas 204–213 e 238–258.
- **Locator/citação não prova interpretação:** os validadores recebidos verificam localização e vínculos; o corpo preserva corretamente esse limite.
- **Retry live não é implícito:** E41, linhas 300–320, sustenta a recusa diante de outcome ausente ou sem evidência retida.

**Obrigações preservadas:** não há fechamento operacional, aceite global de research, conclusão dos 50 IDs ou binding de runtime. **AC02/03/05/06/07/08/09/10 permanecem abertos.** Os pedidos deste parecer complementam, sem substituir, **RE-A1–RE-A5**.
