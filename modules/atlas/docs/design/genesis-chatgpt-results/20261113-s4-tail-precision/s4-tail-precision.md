# Manutenção cumulativa de S4

Scope `atlas-continuity-rag-genesis`; procedimento futuro. Predecessores aceitos em `c4a2992369f2309cbb5ffb8f166abbd7c3b81a4c`. `P` é `modules/atlas/docs/design/genesis-chatgpt-results/20261111-v3-fresh/s4`.

## Delimitar a mudança e preservar a revisão

Registre necessidade, fonte/receita, efeito, critérios e controle. Fixe corpus/runtime/release separadamente; preserve pins, inclusive R2 da L2. Guarde pedido, resposta integral, corpos, fontes, manifestos, decisões, correções e recibos originais. Corrija em revisão nova, preservando o julgado.

Separe autoria, aceite semântico, binding e autorização. `supported` descreve sustentação, não concede publicação. Binding anterior não vale. Base: `S4:L2:genesis-governance`, “Finalidade e compromissos separados” e “Ler recibos sem transportar autoridade entre revisões”.

## Escolher a fonte que governa o comportamento

| Mudança | Ponto de manutenção documentado |
| --- | --- |
| Identidade e vínculos de ownership | `modules/atlas/packages/kernel/src/canonical.ts`; `packages/knowledge/src/ownership/shape.ts`, `read.ts`, `update-plan.ts` dentro de Atlas. |
| Observação e reconstrução | `modules/atlas/packages/adapter-io/src/ownership-input.ts` e `ownership-rebuild.ts`; preserve present/absent/unavailable. |
| Autoridade e ativação | `modules/atlas/packages/adapter-io/src/compose.ts`, `policy.ts`, `read-access.ts`, `governed-emit.ts` e `store.ts`, em conjunto. |
| Transporte nativo | `modules/atlas/scripts/genesis-native.ts` e `packages/adapter-io/src/genesis-native*.ts` dentro de Atlas. O piloto histórico continua com seu contrato próprio. |
| Integração Atlas no host | `packages/core/src/atlas.ts` e `packages/server/src/handlers/atlas.ts`; chamadas de modelo desse percurso não herdam automaticamente Session/Continuity. |
| Sessão e RAG | Percurso e localizadores de `S4:L2:continuity-rag-operations`, especialmente “Diagnóstico e percurso de manutenção”. |

Edite a fonte e regenere pela rota autorizada. Gerador: `modules/atlas/boundary/script/build.ts`; em `modules/atlas/boundary`, o comando é `bun run generate`. Entradas relativas a `modules/atlas/packages/`: `surface` vem de `adapter-io/src/surface/index.ts`, `mine` de `cli/src/surface-mine.ts`, `native-header` de `adapter-io/src/native-header.ts`, `context` de `adapter-io/src/context-log.ts`. Compare outputs reais, sem editar bundles manualmente. Fontes: `S4:L1:atlas-host-genesis`, “The generated boundary is a host package with traceable owners”; `S4:L2:atlas-system`, “Fronteira externa e pontos de manutenção”.

## Diagnosticar Continuity e RAG sem perder fronteiras

Session normal fornece compactação, `transform` identidade e `afterStep` vazio. Continuity substitui por Location, sem instalação global comprovada. Runner hospedado não tem o percurso completo; chamadas externas não ganham hooks de Session. Identifique a porta.

Masking modifica a cópia enviada ao modelo. Exige recuperação disponível, economia estimada e archive-before-mask. Na cauda normal, conte mensagens de papel `assistant`, não mensagens totais nem turnos de usuário: se houver menos de cinco mensagens de assistente, não há candidatos. Havendo cinco ou mais, o corte é o índice da quinta mensagem de assistente a partir do final; somente mensagens estritamente anteriores a essa mensagem entram na seleção. A mensagem de corte e tudo que vem depois dela ficam fora da seleção normal. Assim, os cinco passos finais de assistente — e as mensagens intercaladas posteriores ao corte — permanecem sem masking por essa regra. Um turno autônomo longo também conta por mensagens de assistente, não por turnos de usuário. No masking urgente, o corte é a última mensagem da sequência: somente mensagens anteriores a ela são consideradas, portanto a mensagem mais recente inteira é excluída. Em ambos os modos, só podem ser candidatos resultados de ferramenta com chamada correspondente; resultados executados pelo provider, ferramentas protegidas e resultados já mascarados são excluídos. As ferramentas protegidas são `skill`, `todowrite`, `todoread`, `context_recall`, `task`, `maestro_request_review` (`modules/continuity/src/masking-rules.ts`). A elegibilidade temporal não garante que todo resultado anterior será mascarado: a seleção também exige economia positiva estimada. Erros preservam as vinte linhas iniciais; se o erro tiver até vinte linhas, o texto inteiro permanece verbatim. Isso não prova recuperação universal.

No RAG, diagnostique a sequência carregar → `memoryStore` → salvar por requisição em `packages/server/src/handlers/rag-studio-session.ts`. `packages/core/src/rag-studio/sql.ts` persiste caminho/hash/status da fonte e texto/offsets dos chunks: não trate ambos como texto congelado da fonte. `noteBytes` com leitura bem-sucedida e bytes diferentes marca releitura necessária sem refazer chunks; leitura falha pode preservar metadados e chunks antigos. Reparse e rechunk são etapas diferentes. Em `packages/server/src/handlers/rag-studio.ts`, extração precede admissão; `allowExternal` ausente nega por padrão, sem provar ausência de leitura anterior nem contenção por realpath.

Na configuração, separe corpus corrente, snapshot/membership e pipeline; nomes de parser/tokenizer e coerções Number/String não validam implementações alternativas. Respeite as condições de comparação; flags falsas não provam equivalência. Fonte: `S4:L2:continuity-rag-operations`, seções de “Session define quais hooks existem” a “Comparação exige uma mudança isolada”.

S4-MAINT-HELDOUT-01 prospectivo altera só search.ts:17. Comparação lowercased preserva bytes/spans e gates de elegibilidade. Antes de release, revise caixa diferente/exata em busca, owners/lights, K/dropped/retrievalOptional e citação literal. A52/A74/A62/A78 não foram emendados; não aprovar equivalência por hashes. Diagnóstico/prova não acompanham automaticamente a busca: ver C, “Diagnóstico e percurso de manutenção”, e B, “2. HTTP RAG → Store por requisição → SQLite”. Driver/manutenção continuam NOT_RUN.

## Interpretar affected e trabalho preciso

Capture bytes/versões kernel/ordem/declarações reais. SHA-256/Git blob não substituem `OwnershipInput.version`. Indisponível exige HOLD, não ausência ou conjunto vazio. `affected` é fechamento conservador; trabalho preciso pode diminuir após comparar inputs/resultados predecessores. Navegação não é build.

Resultado inclui corpo, autoridade, validade, gaps e evidência; mudar autoridade pode propagar mesmo com prosa igual. Reavaliar sob receita/inputs atuais pode renovar receipt/vínculos e validar o mesmo resultado completo. A propagação então pode parar se inputs próprios, contrato e demais deps do sucessor seguem válidos; Markdown igual não basta. Unidades independentes preservam resultados/receipts somente enquanto seus próprios vínculos seguem válidos; fonte compartilhada declarada continua relevante. Fonte: `S4:L3:system-flows`, “Mudanças propagam por resultados e vínculos”; `S4:L2:atlas-system`, “Como mudanças de fonte orientam a revisão”.

## Preparar outputs aceitos e reconstruir candidato privado

Preserve originais e obtenha dois julgamentos semânticos da revisão. Prepare o pacote completo; dois juízes reais distintos devem vincular candidato, contrato, critérios e todos os pares result/input. Conteúdo não substitui binding; fonte/receita/refs/implementação alterados exigem reconferir candidato.

Use `P/runtime/maintenance-operation.mjs` pela porta `rebuildOwnershipUpdate`. Antes da primeira publicação, todas as entries devem declarar o driver e o protocolo como inputs `file:` e ordenar lexicograficamente os input_keys. O driver exige mesmo scope, roots, sequência de keys, layout/metadados, contrato e ordem das dependências; não faz migração de topologia ou membership. A versão da receita deriva da observação real do driver, não do hash de transporte. Bytes antigos do driver podem diferir e acionar reconstrução normal.

`run` devolve o output nativo já aceito e carregado do CAS, sem produzir texto ou chamar modelo. `evaluate` entrega as duas reviews persistidas somente se scope, result, arrays exatos e `id({inputs,dependencies})` coincidirem com o target. O motor decide reúso e execução precisa. Um target diferente sem input observável que provoque reconstrução pode terminar HOLD por divergência; não force callbacks para contornar o planner. Preserve JSON completo: `affected`, `calls`, candidato, capturas, avaliações e resultados. Callbacks não são tentativas de modelo. Fonte: driver e `P/producers/maintenance-driver/usage.md`, “Pré-condições do pacote” e “Composição efetiva”.

## Ativar e verificar pela porta servida

`rebuild` devolve candidato privado. Para ativar, use a publicação governada correspondente, com baseline publicado ainda correto, CAS/projeção/política isolados e autoridade efetiva. Política, ator e ratificação continuam independentes do binding; não copie autoridade de fixture ou de produção. A porta refaz validação e passa por `composeRuntime.check` e `atlas-emit`.

Abra outro leitor sobre o mesmo estado publicado. Use `ownership.index/read` via CLI; confirme manifesto/result/receipt e corpo ou H2 solicitada, preservando HOLD e histórico explícito. CAS durável sem carrier publicado não é consumo corrente; raw Markdown não substitui a leitura Atlas. Compare efeito e intenção; registre independentes preservados. Fonte: `S4:L1:native-runtime-delta`, “Binding separado e publicação governada” e “Consumo e manutenção pela porta real”; `S4:L3:system-flows`, “Após falha, separar recuperação de nova publicação”.

## Classificar evidência e encerrar o registro

`bun typecheck` em `modules/atlas` verifica tipos; testes seguem rota remota autorizada, gates/gerados próprios. CI 43094387837, candidato `1b5a4801acfae03969f78ee766ca6f0b7d0f9013`: 220 casos, 22 mutantes rejeitados, 18 paridades, guards com dois WARN de tamanho. Não prova manutenção nem aceite/publicação. Driver: revisão estática/parsing CI; operação NOT_RUN, execução futura exige recibos externos. Modelo/tokens/custos/tentativas físicas não expostos: UNKNOWN; reúso não prova zero IO/custo. Fonte: `P/producers/ci-c1/receipt.json`; `S4:L3:system-flows`, “Manutenção e alcance da evidência”.

---

## Diff factual desta revisão prospectiva

Somente o parágrafo de masking em “Diagnosticar Continuity e RAG sem perder fronteiras” foi ampliado. O restante do corpo foi preservado.

- A frase “cinco passos de assistente da cauda normal” agora explicita que são cinco mensagens `assistant`; com menos de cinco, `candidates` retorna vazio.
- O limite é o índice da quinta mensagem `assistant` a partir do fim. A seleção usa `messages.slice(0, cutoff)`, portanto exclui a própria mensagem de corte e tudo que vem depois.
- O modo urgente usa `messages.length - 1` como corte e, pelo mesmo `slice(0, cutoff)`, exclui a última mensagem inteira.
- Ambos os modos filtram `tool-result` sem chamada correspondente, `providerExecuted`, nomes em `PROTECTED` e IDs já mascarados. A seleção ainda requer economia estimada positiva.
- A estratégia só tenta masking quando a ferramenta `context_recall` está disponível; no fluxo normal, só quando a estimativa excede o limite. O percurso urgente é fallback quando a seleção normal não basta ou quando a compactação é forçada.
- Resultados de erro preservam as primeiras 20 linhas; erros com até 20 linhas permanecem integralmente verbatim.

### Fontes primárias lidas no pin

Pin de leitura: `1cde2ff7a71bcf7aecb5d030917b577165135d38`.

- `modules/continuity/src/masking-rules.ts`: linhas 7–8 (`TAIL_STEPS = 5`) e 14 (`PROTECTED`).
- `modules/continuity/src/masking-rules.ts`: linha 11 (`ERROR_LINES = 20`); `modules/continuity/src/v2/masking.ts`: linhas 75–78 (erro curto integral; erro longo com as 20 linhas iniciais verbatim).
- `modules/continuity/src/v2/masking.ts`: linhas 21–30 (definição e corte normal); 32–35 (corte urgente); 124–141 (filtro, vínculo da chamada e economia positiva).
- `modules/continuity/src/v2/strategy.ts`: linhas 165–181 (recall, limite, seleção normal e fallback urgente); 282–294 (transformação da cópia da requisição).
- `modules/continuity/test/v2-strategy.test.ts`: linhas 36–38 (fixture documenta oito passos e preservação do mais recente cinco); 172–176 (teste urgente: preserva a mensagem mais recente).

### Limites da afirmação

Esta é uma leitura estática do código e dos testes existentes no pin. Não executei masking, compactação, provider, archive, recuperação nem manutenção; não observei uma sessão em execução. A descrição não afirma que os cinco passos foram efetivamente preservados numa execução, que todos os outputs antigos são recuperáveis, nem que ocorreu aceite, consumo ou maintenance. Esta revisão documental é prospectiva e não substitui o corpo anteriormente julgado nem reabre quota de correção antiga.
