## FIX-FIRST — support

**J2 — completude/utilidade.** Recebidas as três partes e **FIM_DO_LOTE**. Parecer sobre `producers/boundaries/bodies/support.md`, SHA-256 `3a4ef5ee6925eb3c80404181f00a0e4e012750459f2dbb1ab11076b69449d684`, e R042–R077/I01/S29.

O corpo distingue adequadamente suporte, implementação, fixtures, histórico e execução. Há, porém, **três formulações que precisam de correção ou qualificação**, além de evidências ainda ausentes. O resultado não é aceite dos 104 paths nem da união.

### Correções obrigatórias

| ID / critérios | Localização | Esperado | Observado | Correção necessária |
|---|---|---|---|---|
| **SUP-F01 — QS1/QS4, CC3** | §2, primeiro parágrafo; R042 | Reproduzir fielmente as relações declaradas pelo README, sem acrescentar uma aresta. | O corpo diz “Schema/Protocol para Core e daí para Server”. R042 declara **“Schema -> Core and Protocol -> Server”**. | Separar as relações documentadas: Schema→Core e Protocol→Server; mencionar a exposição dos serviços Core pelo Server conforme o README. Não atribuir Protocol→Core a essa fonte. |
| **SUP-F02 — QS1/QS5, GO-A6/GO-I8** | §5.3, `omni-expect.ts`; R060–R061 | Distinguir a intenção de isolamento por teste do mecanismo efetivamente mostrado e de suas pré-condições. | O corpo afirma que compara “apenas seus spawns” e que outro teste “não pode” satisfazer a expectativa. R061 mede a diferença de um contador de spawns e mantém uma única expectativa `open`; não mostra atribuição de cada spawn ao teste nem exclusão de sobreposição. A garantia forte aparece no comentário R060. | Descrever a contagem na janela `expectSpawn`→`settle`. Qualificar a exclusividade com as pré-condições de execução/`afterEach` e sua fonte, ou apresentá-la como intenção do harness. Não afirmar que houve falha real; o problema é a garantia documental sem demonstração suficiente. |
| **SUP-F03 — QS1** | §2, parágrafo do preload; R046 | Preservar a condição da atribuição da chave. | O corpo diz que o preload aponta a chave para arquivo temporário; o código usa **`ORCHESTRA_CREDENTIAL_KEY_FILE ??=`**, preservando valor previamente definido. | Informar que o preload fornece um caminho temporário **quando a variável ainda não está definida**. |

### Critérios restantes

- **GO-A1/A2, QS2/3:** estrutura e explicação úteis; agrupamento não é apresentado como revisão integral de cada implementação importada.
- **GO-A5/A7, GO-I2/I7:** limites de temporalidade, autoridade e operação bem preservados fora dos pontos acima.
- **GO-A3/A4, QS1/4/5/6, GO-I1/I8, CC1/3/7, AC01/04:** continuam dependentes das correções e das evidências seguintes.

### Evidência exata ainda necessária

**RE-SUP-01 — Disposição, resultados estruturais e reúso**

**Pergunta:** a população e suas profundidades sustentam as contagens e o tratamento declarado para todos os 104 paths?

**Falta:** 104 entradas pertinentes de `coverage.jsonl`, reconciliação **9/3/12/80**, e identidade da relação com as 24 fronteiras; H01/manifesto e projeção histórica que sustentem **2/102**, **4/20**, escopos de **1.441/2.236** e preservação do corpo herdado. Para S29, fornecer o registro estrutural ligado aos inputs exatos: contagem/seleção de exports, entidades `ddl`, metadata do membro `package/package.json` do tarball e exame declarado dos archives/binários. Não peço interpretação semântica integral do tarball.

**RE-SUP-02 — Geradores e manutenção**

**Pergunta:** quais ramos implementados sustentam os comportamentos descritos além dos comentários de uso?

**Falta:** `drizzle.config.ts` e trechos de configuração relevantes; `toolkit-pack.ts` nos ramos de geração, bump e pin não resolvido/removido; `toolkit-floors.ts` nos parsers e casos não mensurados que fundamentam os limites relatados; `fix-node-pty.ts` integral. R047–R048 já sustentam a maior parte do fluxo de migration/check descrito.

**RE-SUP-03 — Documentação histórica**

**Pergunta:** quais intervalos sustentam as descrições e exclusões dos documentos ainda só referenciados?

**Falta:** trechos pertinentes de `RD-CTRLPLANE`, `RD-SESSION`, `PLAN.md`, `SNAPSHOT-QUALIFICATION.md`, `WAVE-2.md`, `schema-changelog.md` e indicação “Needs team discussion” de `api.html`; contexto histórico fornecido sobre estabilidade de migrations e orientação de geradores, quando usado como autoridade no corpo.

R054–R059/I01 já sustentam a diferença 300-versus-manifesto atual, a natureza histórica da exceção e qualificações, a divergência de vocabulário de prompt e o backlog de recuperação. Não solicito revalidar os runs históricos externamente.

**RE-SUP-04 — Contratos específicos dos helpers e fixtures**

**Pergunta:** os arquivos com leitura dirigida demonstram os mecanismos específicos que o texto lhes atribui?

**Falta:** intervalos decisivos, associados aos paths individuais, para:

- captura de argv/stdin/bytes/ambiente em Actions e funcionamento dos servidores locais;
- treze fixtures capability, especialmente tracing SQL/reserva/rollback e serviços/bindings/seleção;
- identidade real em `omni-effect`, verificações executáveis de nonce/startTime em `process-tree`, `rejection`, cleanup EBUSY de `tmpdir` e protocolos de flock/background/dialer citados;
- AST de packaged-skills, módulo proibido de `sdk-registry`, gates de `ripgrep-release`, fixtures upstream/Arsenal e recording HTTP/SSE datado;
- execução scoped/Cause de `lib/effect`, identidade de caller de `lib/tool`, comparações canônicas e `task-governance`.

Pode ser uma projeção dirigida por claim; **não exijo revisão exaustiva das implementações externas que esses helpers importam**. Já estão demonstrados o raw spawner de R062, pass sintético/renderer do Board, ausência de runner no fixture schedule, factory real de Store e natureza sintética dos casos distribution.

### Atualização cruzada

A parcela **S01/README de RE-BND-01** está suprida por R042–R043. Cobertura, histórico, testes de fronteira e proposta de navegação permanecem pendentes.

**Estado:** **FIX-FIRST**, com os pedidos probatórios acima abertos. As correções não exigem execução de testes ou produto; a decisão não altera os pareceres anteriores nem fecha obrigações operacionais.