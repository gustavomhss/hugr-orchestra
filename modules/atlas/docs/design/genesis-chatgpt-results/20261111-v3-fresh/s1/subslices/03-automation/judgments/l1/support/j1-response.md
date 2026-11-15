## J1 — support: FIX-FIRST, com pedidos de evidência pendentes

Recebidas **3/3 partes** e **FIM_DO_LOTE**. Parecer sobre o corpo integral declarado de `producers/boundaries/bodies/support.md`, **22.388 bytes**, e evidência literal recebida. Sem ferramentas.

Há **uma correção obrigatória de fidelidade arquitetural**. Os demais pontos abaixo permanecem `REQUEST_EVIDENCE`; não exigem execução de produto.

### Defeito obrigatório — D-SUP-01

**Localização:** §2, primeiro parágrafo; confronto com **R042/S01, `packages/core/README.md`**.

- **Esperado:** preservar as relações de dependência efetivamente declaradas pela fonte.
- **Observado:** o corpo diz que a direção declarada vai de **“Schema/Protocol para Core e daí para Server”**. O README declara separadamente **`Schema -> Core`** e **`Protocol -> Server`**, além de informar que Server expõe os serviços Core. A redação candidata introduz uma relação **Protocol → Core** que esse trecho não declara.
- **Correção necessária:** apresentar separadamente as relações declaradas e o consumo de Core por Server. Se houver intenção de afirmar também Protocol → Core, fornecer sua fonte própria e identificá-la como observação adicional; não atribuí-la ao README recebido.

Essa correção não demanda auditoria de imports de todo o monorepo.

### Critérios

| Decisão | Critérios | Fundamentação |
|---|---|---|
| **FIX-FIRST** | QS1, QS4, CC3 | D-SUP-01 altera a atribuição de uma relação arquitetural. |
| **REQUEST_EVIDENCE** | GO-A1–A2, GO-A4, GO-A6; QS5–QS6; CC1, CC7; GO-I1; AC01, AC04 | Reconciliação, observações estruturais e parcelas dos contratos descritos ainda precisam dos complementos abaixo. |
| **PASS restrito aos aspectos observados** | GO-A3, GO-A5, GO-A7; QS2–QS3; GO-I2, GO-I7–I8 | O corpo distingue suporte de implementação, fixture de resultado, história de autoridade atual e nova entrada local de união aceita. A exceção humana histórica não é aplicada como permissão desta execução. |

### Pedidos obrigatórios de evidência

#### RE-SUP-01 — Cobertura, herança e resultados estruturais

**Localização:** abertura, §1, §2, §3.1, §3.3 e §6; H01/S29 e registros referidos.

**Pergunta:** como as contagens e disposições declaradas se vinculam aos inputs exatos e à profundidade de leitura?

- **Esperado:** reconciliação verificável dos 104 paths e dos resultados mecanizados, sem exigir revisão semântica do conteúdo interno não reivindicado.
- **Observado:** tabela de famílias, valores S29 e referências a registros, sem seus conteúdos.
- **Necessário:** cobertura dos 104 paths, compartilhada com RE-BND-01; histórico de entrada/manifest e projeção **2+102 / 4+20**; trechos do inventário/kit que sustentam **1.441 / 2.236**; resultado e procedimento determinístico conferidos pela principal para **437 exports**, ausência de raiz/wildcard e **63 entidades na lista ddl**. Para o tarball, metadata literal de `package/package.json` e listagem pertinente; para ZIP/SCIP, registros do exame efetivamente realizado. Não se pede o código interno integral do archive.

#### RE-SUP-02 — Geradores, configuração e manutenção

**Localização:** §2–§3; S02–S07; `tsconfig.json`, `drizzle.config.ts`, `script/{migration,toolkit-pack,toolkit-floors,fix-node-pty}.ts`.

**Pergunta:** quais ramos implementam os comportamentos de geração e limites descritos como observações?

- **Esperado:** identificar inputs, saídas oficiais e condições que impedem tratar geração incompleta como qualificação.
- **Observado:** migration possui suporte direto relevante. Sobre toolkit-pack/floors foram recebidos sobretudo comentários de contrato e tipos/helpers.
- **Necessário:** configurações citadas; seleção/ordenação de inputs e migrations; geração de skills/recipes e tratamento efetivo de pins não resolvidos; download/verificação e branches pertinentes dos parsers de floors, inclusive modalidades não mensuradas; corpo de `fix-node-pty.ts`. Os comandos existentes nos comentários continuam sendo dados, sem autorização de execução.

#### RE-SUP-03 — Disposição da documentação histórica

**Localização:** §4; S09–S14; cards e runtime-closure.

**Pergunta:** quais passagens sustentam os propósitos, candidatos e exclusões atribuídos aos documentos ainda não mostrados?

- **Esperado:** manter história útil sem converter plano, resultado antigo ou backlog em afirmação atual.
- **Observado:** EXP-CORE, PRODUCER-BOUNDARY, CHECKPOINT, ARCHIE, exemplo visual de API e backlog possuem trechos decisivos. Faltam os demais documentos da tabela.
- **Necessário:** passagens pertinentes de **RD-CTRLPLANE, RD-SESSION, PLAN, SNAPSHOT-QUALIFICATION, WAVE-2 e schema-changelog**, com datas/candidatos e alcance necessários à descrição. A comparação `immediate/deferred` versus a orientação `steer/queue` já está sustentada por R058 e I01; não precisa ser repetida.

#### RE-SUP-04 — Fixtures de Actions, capability e distribuição

**Localização:** §5.1, §5.2 e §5.4; S16–S22/S27–S29.

**Pergunta:** quais contratos distinguem componentes reais, substitutos e resultados sintéticos nos grupos descritos?

- **Esperado:** sustentar os limites específicos de cada grupo, conservando disposição individual sem impor leitura integral indevidamente.
- **Observado:** transporte via raw spawner, Board com Git real/GitHub e renderer substituídos, scoped pass sintético, SessionExecution substituída e outputs de distribuição sintéticos estão demonstrados.
- **Necessário:** intervalos decisivos das demais fixtures de rede/resource-runtime/github-command e capability; tracing SQL/reserva/rollback mencionado; casos de seleção/recibos/admission/deno e controles citados; reescrita AST de packaged-skills, registry plantado, gates ripgrep, factories upstream e metadata da gravação HTTP/SSE. Cada grupo deve apontar aos paths correspondentes na cobertura.

#### RE-SUP-05 — Controles de processo e harness compartilhado

**Localização:** §5.3 e §5.5; S15/S23–S26.

**Pergunta:** quais implementações e precondições sustentam atribuição por teste, identidade de processo e os limites dos helpers?

- **Esperado:** distinguir intenção declarada do controle efetivamente demonstrado.
- **Observado:** `omni-expect` calcula diferença entre snapshots de um contador e mantém uma expectativa aberta; process-tree foi apresentado principalmente por comentário. Variantes skip e sandbox-host têm suporte direto.
- **Necessário:** integração de `expectSpawn/settle` com o runner que sustenta a exclusão de spawns de outro teste, incluindo a precondição de não sobreposição se necessária; checks efetivos de nonce/startTime; identidade em omni-effect; escopo/Cause de `lib/effect`; contratos de rejection/tmpdir/tool/location, shared-schema e task-governance citados. Fornecer as disposições pertinentes de flock, processo, dialer e background.

### Reúso entre lotes

**R042–R043 e I01 satisfazem a parcela de RE-BND-01 relativa ao conteúdo declarado do README e ao contexto documental de Session.** Isso não encerra a cobertura/história de boundaries nem seleciona versões aceitas dos donos externos.

**Continuidade:** D-SUP-01 precisa de correção no candidato e identidade atualizada para revisão. Os pedidos anteriores e as obrigações operacionais permanecem abertos; nenhum resultado de fixture ou recibo histórico foi promovido a execução atual.