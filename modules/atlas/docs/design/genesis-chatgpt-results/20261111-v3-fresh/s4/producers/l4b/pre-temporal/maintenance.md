# Manutenção cumulativa de S4

Scope `atlas-continuity-rag-genesis`; procedimento futuro. Predecessores aceitos em `c4a2992369f2309cbb5ffb8f166abbd7c3b81a4c`. `P` é `modules/atlas/docs/design/genesis-chatgpt-results/20261111-v3-fresh/s4`.

## Delimitar a mudança e preservar a revisão

Antes de produzir, registre necessidade, fonte/receita a mudar, efeito, critérios e unidade de controle. Fixe corpus, runtime e release pertinente separadamente; preserve pins herdados, inclusive o R2 usado pela L2. Guarde pedido, resposta integral, corpos, fontes, manifestos, decisões, correções e recibos originais. Correção gera revisão nova sem substituir o arquivo julgado.

Separe autoria, aceite semântico, binding e autorização. `supported` descreve sustentação, não concede publicação. Não reutilize binding anterior. Base: `S4:L2:genesis-governance`, “Finalidade e compromissos separados” e “Ler recibos sem transportar autoridade entre revisões”.

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

Session normal já fornece compactação; por padrão `transform` é identidade e `afterStep` não faz trabalho. Continuity substitui comportamento por Location, sem instalação global comprovada. Runner hospedado não tem o mesmo percurso completo; chamadas fora de Session não ganham seus hooks. Identifique a porta do turno.

Masking modifica a cópia enviada ao modelo. Exige recuperação disponível, economia estimada e archive-before-mask. Preserve os cinco passos de assistente da cauda normal; no urgente, exclua a mensagem mais recente. Resultados executados pelo provider ficam fora; erros mantêm vinte linhas iniciais ou o erro curto inteiro. As ferramentas protegidas são `skill`, `todowrite`, `todoread`, `context_recall`, `task`, `maestro_request_review` (`modules/continuity/src/masking-rules.ts`). Isso não prova recuperação universal.

No RAG, diagnostique a sequência carregar → `memoryStore` → salvar por requisição em `packages/server/src/handlers/rag-studio-session.ts`. `packages/core/src/rag-studio/sql.ts` persiste caminho/hash/status da fonte e texto/offsets dos chunks: não trate ambos como texto congelado da fonte. `noteBytes` com leitura bem-sucedida e bytes diferentes marca releitura necessária sem refazer chunks; leitura falha pode preservar metadados e chunks antigos. Reparse e rechunk são etapas diferentes. Em `packages/server/src/handlers/rag-studio.ts`, extração precede admissão; `allowExternal` ausente nega por padrão, sem provar ausência de leitura anterior nem contenção por realpath.

Na configuração, separe corpus corrente, snapshot/membership e pipeline; nomes de parser/tokenizer e coerções Number/String não validam implementações alternativas. Respeite as condições de comparação; flags falsas não provam equivalência. Fonte: `S4:L2:continuity-rag-operations`, seções de “Session define quais hooks existem” a “Comparação exige uma mudança isolada”.

## Interpretar affected e trabalho preciso

Capture inputs reais: bytes, versões de kernel, ordem e declarações. SHA-256/Git blob não substituem `OwnershipInput.version`. Indisponível exige HOLD; não significa ausência comprovada ou conjunto vazio. `affected` é o fechamento conservador de build; o trabalho preciso pode ser menor após comparar inputs e resultados de predecessores. Links de navegação não são arestas de build.

Preserve o resultado completo: corpo, autoridade, validade, gaps e evidência. Alterar autoridade com a mesma prosa muda o resultado e pode propagar. Já uma nova avaliação, sob receita/inputs atuais, pode renovar receipt e vínculos e validar exatamente o mesmo resultado completo. Nesse caso, a propagação por resultado pode parar, desde que os inputs próprios, contrato e demais dependências do sucessor continuem válidos. Não basta igualdade de Markdown. Unidades independentes preservam resultados/receipts somente enquanto seus próprios vínculos seguem válidos; fonte compartilhada declarada continua relevante. Fonte: `S4:L3:system-flows`, “Mudanças propagam por resultados e vínculos”; `S4:L2:atlas-system`, “Como mudanças de fonte orientam a revisão”.

## Preparar outputs aceitos e reconstruir candidato privado

Produza a revisão e obtenha os dois julgamentos semânticos pertinentes, preservando originais. Prepare o pacote completo; obtenha dos dois juízes reais distintos o binding do candidato, contrato, critérios e todos os pares result/input. Decisão sobre conteúdo não substitui binding; mudança de fonte, receita, refs ou implementação exige conferir novamente o candidato.

Use `P/runtime/maintenance-operation.mjs` pela porta `rebuildOwnershipUpdate`. Antes da primeira publicação, todas as entries devem declarar o driver e o protocolo como inputs `file:` e ordenar lexicograficamente os input_keys. O driver exige mesmo scope, roots, sequência de keys, layout/metadados, contrato e ordem das dependências; não faz migração de topologia ou membership. A versão da receita deriva da observação real do driver, não do hash de transporte. Bytes antigos do driver podem diferir e acionar reconstrução normal.

`run` devolve o output nativo já aceito e carregado do CAS, sem produzir texto ou chamar modelo. `evaluate` entrega as duas reviews persistidas somente se scope, result, arrays exatos e `id({inputs,dependencies})` coincidirem com o target. O motor decide reúso e execução precisa. Um target diferente sem input observável que provoque reconstrução pode terminar HOLD por divergência; não force callbacks para contornar o planner. Preserve JSON completo: `affected`, `calls`, candidato, capturas, avaliações e resultados. Callbacks não são tentativas de modelo. Fonte: driver e `P/producers/maintenance-driver/usage.md`, “Pré-condições do pacote” e “Composição efetiva”.

## Ativar e verificar pela porta servida

`rebuild` devolve candidato privado. Para ativar, use a publicação governada correspondente, com baseline publicado ainda correto, CAS/projeção/política isolados e autoridade efetiva. Política, ator e ratificação continuam independentes do binding; não copie autoridade de fixture ou de produção. A porta refaz validação e passa por `composeRuntime.check` e `atlas-emit`.

Abra outro leitor sobre o mesmo estado publicado. Use `ownership.index/read` via CLI; confirme manifesto/result/receipt e corpo ou H2 solicitada, preservando HOLD e histórico explícito. CAS durável sem carrier publicado não é consumo corrente; raw Markdown não substitui a leitura Atlas. Compare efeito e intenção; registre independentes preservados. Fonte: `S4:L1:native-runtime-delta`, “Binding separado e publicação governada” e “Consumo e manutenção pela porta real”; `S4:L3:system-flows`, “Após falha, separar recuperação de nova publicação”.

## Classificar evidência e encerrar o registro

`bun typecheck`, no CWD `modules/atlas`, é verificação de tipos; testes do produto seguem a rota remota autorizada, com gates e gerados próprios. A CI 43094387837 do candidato `1b5a4801acfae03969f78ee766ca6f0b7d0f9013` registra 220 casos, 22 controles mutantes rejeitados, 18 outputs em paridade e guards com dois WARN de tamanho. Isso não executa a manutenção nem concede aceite/publicação. Driver: revisão estática e parsing CI; operação própria NOT_RUN. Registre a operação futura separadamente. Custos, modelo, tokens e tentativas físicas não expostos ficam UNKNOWN; reúso não demonstra zero IO ou custo. Fonte: `P/producers/ci-c1/receipt.json`; `S4:L3:system-flows`, “Manutenção e alcance da evidência”.
