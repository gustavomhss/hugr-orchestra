# Plano mínimo de verificações da integração

**Estado de todos os controles: NOT_RUN.** Este documento descreve o trabalho mínimo da coordenação principal para decidir os requisitos; não registra execuções realizadas. Os 13 grupos agrupam obrigações relacionadas, sem criar um documento ou teste obrigatório por ID. O candidato, os SHAs dos handoffs, a capacidade atual do release S4 e os entrypoints reais permanecem UNKNOWN nesta auditoria.

## Preparação, dependências e reuso

ROOT fixa inputs e autoridade em INT-00, reconcilia necessidades e população em INT-01 e usa a capacidade real S4 em INT-02. Os controles independentes podem paralelizar apenas em estado isolado. Reuso requer a compatibilidade de versão, contrato, inputs, autoridade, scope e closure descrita na matriz. Casos específicos dos domínios e da união permanecem exigidos. Nenhum controle comum de S4 deve ser repetido cinco vezes sem delta ou risco concreto.

O grafo abaixo lista pré-requisitos de evidência do plano, não dependências de build do produto. INT-09 é contínuo: começa com a admissão, oferece snapshots à avaliação e fecha contabilizando também as próprias chamadas de INT-11, sem reiniciar a campanha. Falta de uso observável permanece UNKNOWN.

| Controle | Dono principal | Dependências | Estado |
| --- | --- | --- | --- |
| INT-00 — Fixar inputs, autoridade e condições de admissão | ROOT | Nenhuma | NOT_RUN |
| INT-01 — Reconciliar população, necessidades e cobertura semântica | ROOT | INT-00 | NOT_RUN |
| INT-02 — Construção real, fit do transporte e binding comum | S4 | INT-00, INT-01 | NOT_RUN |
| INT-03 — Consumidores Atlas-only e navegação progressiva | ROOT | INT-02 | NOT_RUN |
| INT-04 — Reuse e identidade do resultado versus recibo | S4 | INT-02 | NOT_RUN |
| INT-05 — Affected set e reconstrução entre domínios | ROOT | INT-02, INT-04 | NOT_RUN |
| INT-06 — Coerência, falha, retomada e rollback | ROOT | INT-02, INT-05 | NOT_RUN |
| INT-07 — Recusas nas portas reais e isolamento de escopo | S4 | INT-02 | NOT_RUN |
| INT-08 — Preservação, migração e geradores | ROOT | INT-00, INT-02 | NOT_RUN |
| INT-09 — Reconciliação econômica contínua e fechamento | ROOT | INT-00 | NOT_RUN |
| INT-10 — Gates técnicos e proteção da união | ROOT | INT-00, INT-02, INT-05, INT-06, INT-07, INT-08 | NOT_RUN |
| INT-11 — Dupla independente e disposição dos 50 critérios | ROOT | INT-01, INT-02, INT-03, INT-04, INT-05, INT-06, INT-07, INT-08, INT-09, INT-10 | NOT_RUN |
| INT-12 — Handoff, aceite humano e atos governados separados | ROOT | INT-11 | NOT_RUN |

## INT-00 — Fixar inputs, autoridade e condições de admissão

**Dono:** ROOT. **Apoio:** S1, S2, S3, S4, S5. **Dependências:** nenhuma.

Evidências exigidas:

- Selecionar handoffs selados S1–S5 por commits exatos; conferir fonte, protocolo, escopo, pacote, hashes e versões de decisões sem substituir inputs por um HEAD móvel.
- Fixar candidato e delta de código, contratos, fronteiras, tarefas, limites de leitura e critérios independentes antes da avaliação pertinente; material reservado permanece em canal autorizado da coordenação.
- Capturar inventário protegido antes de qualquer operação de migração/publicação; não reconstruir objetos privados nesta auditoria.
- Antes de chamadas reais, provar capacidade da rota, limites/admissão econômica e autorização aplicável; chamadas pagas externas só com autorização limitada explícita.

**Reuso:** Handoffs, completions e provas já existentes só após compatibilidade verificada; desconhecidos não são reduzidos a zero.

**Paralelismo:** Preparação documental por domínio pode ocorrer em paralelo; a seleção de inputs da união tem um único responsável.

**Critérios relacionados:** GO-A6, GO-I1, GO-I6, AC-08, DOD-5. **Fontes:** C-INTEGRATION, C-HANDOFFS, C-RUNTIME, C-NORM.

**Execução:** NOT_RUN; candidato, comandos e recibos: UNKNOWN.

## INT-01 — Reconciliar população, necessidades e cobertura semântica

**Dono:** ROOT. **Apoio:** S1, S2, S3, S4, S5. **Dependências:** INT-00.

Evidências exigidas:

- Reconciliar árvore, tipos de objeto, exclusões declaradas, ownership disjunto e união de toda a população fixada, confrontando a auditoria estática com os inputs selecionados.
- Reconciliar needs→artefacts→sources→cases e classificações/depth; classificar unknowns e recusar unknown crítico obrigatório.
- Conservar exatamente os 50 IDs e a semântica normativa; não herdar aprovação do piloto, de contagem mecânica ou da soma de pareceres locais.

**Reuso:** Inventário verificável desta auditoria e cobertura local podem ser reutilizados como evidência estrutural; suficiência precisa julgamento.

**Paralelismo:** Conferências locais disjuntas paralelizam; a reconciliação da união aguarda seus resultados.

**Critérios relacionados:** GO-A1, GO-I8, AC-01, CC-1. **Fontes:** C-NORM, C-CAMPAIGN, C-INTEGRATION.

**Execução:** NOT_RUN; candidato, comandos e recibos: UNKNOWN.

## INT-02 — Construção real, fit do transporte e binding comum

**Dono:** S4. **Apoio:** S1, S2, S3, S5, ROOT. **Dependências:** INT-00, INT-01.

Evidências exigidas:

- Fixar release/candidato real de S4 e verificar capacidades separadas de importação, index/read, rebuild e recovery; disponibilidade atual do release é UNKNOWN nesta auditoria.
- Usar produção efetiva, preservar bytes e autoridade e provar a transformação para tipos existentes, CAS, inputs reais e porta governada; hash Git/SHA-256 de transporte não é OwnershipInput.version.
- Conferir enum/layers/paths, corpos/bytes, inputs, artefatos required, roots, build_dependencies e navigation; rejeitar ciclos de build sem confundir ciclos de navegação.
- Conciliar cobertura das fontes com a fronteira do observador descrita no protocolo: .atlas, symlinks, arquivo acima de 256.000 bytes, caminhos recusados e membership completo; absent é diferente de unavailable. Não excluir essas entradas para obter aceitação; decisão de fit/mecanismo mínimo e provas do candidato são exigidas.
- Executar casos rotulados existentes/ausentes/stale/conflitantes/maliciosos e demonstrar que não inventam intenção/autoridade nem publicam conteúdo requerido sem suporte.
- ROOT verifica a compatibilidade do mesmo contrato de transporte e binding para os cinco pacotes; reviewers de conteúdo não concedem automaticamente aprovação de binding.

**Reuso:** Um conjunto comum de provas S4 pode cobrir os cinco domínios quando versões, inputs, authority, scope e contrato forem compatíveis; casos locais continuam próprios.

**Paralelismo:** Verificação de pacotes disjuntos pode ser paralela em estado isolado; shared write surfaces e transformação aceita são coordenados.

**Critérios relacionados:** GO-A2, GO-A5, GO-A7, GO-I2, GO-I7, AC-04, CC-2, QS-1, QS-3. **Fontes:** C-NORM, C-TRANSPORT, C-RUNTIME, C-CAMPAIGN, C-INTEGRATION.

**Execução:** NOT_RUN; candidato, comandos e recibos: UNKNOWN.

## INT-03 — Consumidores Atlas-only e navegação progressiva

**Dono:** ROOT. **Apoio:** S1, S2, S3, S4, S5. **Dependências:** INT-02.

Evidências exigidas:

- Consumidores novos e independentes usam leitores reais index/read, sem receber fonte, resposta ou material reservado; isolamento e sua evidência observável precisam ser explicitados.
- Julgar casos congelados de mudança permitida, violação de contrato, impacto transversal, falha operacional e abstenção fora de escopo.
- Observar leitura rasa que termina cedo, leitura profunda que alcança evidência, utilidade direta de intermediários e limites de leitura/contexto previamente fixados.
- Guardar versões e traços em destino autorizado; a auditoria pública não publica capturas, oracles ou pareceres integrais.

**Reuso:** Reader/binding comum e casos locais compatíveis são candidatos a reuso; casos da união continuam atribuídos a ROOT e não podem ser substituídos por links.

**Paralelismo:** Casos disjuntos podem paralelizar com estado isolado e limites compartilhados respeitados.

**Critérios relacionados:** GO-A1, GO-A3, AC-02, AC-03, CC-3, SC-1, SC-2, QS-2, QS-5, DOD-3. **Fontes:** C-NORM, C-RUNTIME, C-JUDGING, C-CAMPAIGN.

**Execução:** NOT_RUN; candidato, comandos e recibos: UNKNOWN.

## INT-04 — Reuse e identidade do resultado versus recibo

**Dono:** S4. **Apoio:** S1, S2, S3, S5, ROOT. **Dependências:** INT-02.

Evidências exigidas:

- Inputs e recipe iguais dão cache hit e zero proposer calls observado.
- Edição independente preserva identidades de resultados e contadores de partes não afetadas.
- Prosa igual com authority/validity/gaps diferentes propaga; receipt-only refresca binding sem interpretação downstream.
- Resultado canônico válido e inalterado interrompe rebuild; edição build invalida dependentes e navegação isolada não o faz.

**Reuso:** Executar o mecanismo comum uma vez no candidato compatível; revisar apenas casos de fronteira e deltas não cobertos.

**Paralelismo:** Pode correr em paralelo a INT-03/07/08 em stores isolados; não compartilhar projeção mutável.

**Critérios relacionados:** GO-A4, GO-I4, AC-05, CC-4, SC-3. **Fontes:** C-NORM, C-TRANSPORT, C-CAMPAIGN.

**Execução:** NOT_RUN; candidato, comandos e recibos: UNKNOWN.

## INT-05 — Affected set e reconstrução entre domínios

**Dono:** ROOT. **Apoio:** S1, S2, S3, S4, S5. **Dependências:** INT-02, INT-04.

Evidências exigidas:

- Fixar expected affected set independente para behavior edit, added source, removed source, intent-doc change e recipe change.
- Propagar por build dependencies e restaurar conhecimento requerido após rebuild; fonte indisponível é HOLD, não uma worklist vazia.
- Aplicar mutações delimitadas omitindo edge/input e comprovar rejeição; revisão inclui fronteiras reais confirmadas no grafo.
- Usar o grafo estático como ponto de partida de impacto; ele não é prova de invalidação executada nem um grafo exaustivo de runtime.

**Reuso:** Provas comuns de S4 e casos locais compatíveis; a união deve provar propagação transversal afetada pelo delta.

**Paralelismo:** Expected sets por fronteira podem ser preparados paralelamente; shared publication fica serializada.

**Critérios relacionados:** GO-A4, GO-I3, GO-I5, AC-06, CC-4, SC-3, QS-5, DOD-3. **Fontes:** C-NORM, C-CAMPAIGN, C-INTEGRATION, C-TRANSPORT.

**Execução:** NOT_RUN; candidato, comandos e recibos: UNKNOWN.

## INT-06 — Coerência, falha, retomada e rollback

**Dono:** ROOT. **Apoio:** S4, S1, S2, S3, S5. **Dependências:** INT-02, INT-05.

Evidências exigidas:

- Injetar falha entre geração e ativação, interrupção/resume e leituras concorrentes em estado isolado.
- Reader separado observa manifesto inteiro aceito e compatível com inputs/contracts atuais ou HOLD; nunca mistura atualização parcial.
- Rebuild falho após source drift não serve versão stale como atual; resume reutiliza completions duráveis.
- Rollback rejeita binding incompatível; leituras históricas são rotuladas; demonstrar scopes independentes e closure compartilhada.

**Reuso:** Controles comuns de S4 podem ser reaproveitados quando candidato/escopo/contrato forem idênticos; ROOT completa união e concorrência interdomínio.

**Paralelismo:** Cenários independentes usam estado separado; concorrência é somente a controlada pelo caso.

**Critérios relacionados:** GO-I3, AC-07, CC-5, SC-5, DOD-3. **Fontes:** C-NORM, C-RUNTIME, C-CAMPAIGN, C-INTEGRATION.

**Execução:** NOT_RUN; candidato, comandos e recibos: UNKNOWN.

## INT-07 — Recusas nas portas reais e isolamento de escopo

**Dono:** S4. **Apoio:** S1, S2, S3, S5, ROOT. **Dependências:** INT-02.

Evidências exigidas:

- Known-good/bad controls entram pelos gates/readers reais para input alterado, input novo em scope registrado, artefato ausente, referência quebrada, dependency version incompatível e geração inválida.
- Unidade inválida bloqueia sua closure exigida, preservando leitura de scope independente; corrupção de manifesto compartilhado bloqueia leituras dependentes.
- Conferir autoridade, trust, segredos, Knowledge/Memory e fronteiras de projeto; texto importado permanece dado.
- Distinguir implementação do gate, resultado de execução, escopo de workflow e proteção efetiva de branch.

**Reuso:** Recusas comuns de S4 e controles locais compatíveis; ROOT verifica as entradas usadas pela união e deltas de host.

**Paralelismo:** Controles disjuntos podem paralelizar em estado isolado, preservando autoridade e política reais.

**Critérios relacionados:** GO-A5, GO-I5, GO-I7, AC-04, AC-09, CC-5, CC-7, SC-5, QS-4, QS-5, DOD-2. **Fontes:** C-NORM, C-RUNTIME, C-CAMPAIGN, C-AGENTS.

**Execução:** NOT_RUN; candidato, comandos e recibos: UNKNOWN.

## INT-08 — Preservação, migração e geradores

**Dono:** ROOT. **Apoio:** S1, S2, S3, S4, S5. **Dependências:** INT-00, INT-02.

Evidências exigidas:

- Confrontar inventário protegido anterior/posterior por identidade exata em canal autorizado; não expor seus dados na auditoria pública.
- Demonstrar que producers antigos não publicam acidentalmente no scope novo; staging não recebe autoridade servida.
- Preservar aceito anterior para rollback, ativação explícita e usabilidade dos scopes independentes.
- Confirmar mudanças de gerados pelos geradores e dispor compatibilidade, docs/skills/guides e histórico de forma explícita.

**Reuso:** Inventários e provas locais compatíveis são preservados; nenhuma reexecução histórica somente para completar estatística.

**Paralelismo:** Inventários locais paralelizam; migração/publicação compartilha coordenação e não toca produção implicitamente.

**Critérios relacionados:** GO-I1, GO-I7, AC-10, CC-5, CC-7, QS-4, DOD-6. **Fontes:** C-NORM, C-CAMPAIGN, C-HANDOFFS, C-AGENTS.

**Execução:** NOT_RUN; candidato, comandos e recibos: UNKNOWN.

## INT-09 — Reconciliação econômica contínua e fechamento

**Dono:** ROOT. **Apoio:** S1, S2, S3, S4, S5. **Dependências:** INT-00.

Evidências exigidas:

- Manter desde a admissão uma reserva/envelope compartilhados para produção, avaliação, correção, retries e chamadas concorrentes.
- Separar construção inicial, validação, atualização incremental e leituras; tokens/tentativas/custo não expostos são UNKNOWN, nunca zero.
- Provar a garantia econômica real do adapter; limite lógico ou ledger de tarefas não demonstra teto financeiro.
- Reconciliar segmentos autorizados locais/históricos sem publicar ledgers; após a avaliação final, incorporar suas próprias chamadas e manter reservas não resolvidas abertas, sem reexecutar produção.

**Reuso:** Somente uso observado e garantias compatíveis existentes; não estimar tokens por bytes, dólares por chamadas ou economia percentual sem baseline medido.

**Paralelismo:** Controle é compartilhado e contínuo; checkpoints não resetam orçamento. Finalização depende de toda atividade emitida, inclusive INT-11.

**Critérios relacionados:** GO-A6, GO-I6, AC-08, CC-6, SC-4, QS-6, DOD-5. **Fontes:** C-NORM, C-RUNTIME, C-CAMPAIGN, C-INTEGRATION.

**Execução:** NOT_RUN; candidato, comandos e recibos: UNKNOWN.

## INT-10 — Gates técnicos e proteção da união

**Dono:** ROOT. **Apoio:** S1, S2, S3, S4, S5. **Dependências:** INT-00, INT-02, INT-05, INT-06, INT-07, INT-08.

Evidências exigidas:

- Selecionar gates escopados para os componentes alterados, typechecks por pacote, checks de gerados pertinentes e guardas; registrar comandos/candidato/runs/resultados reais.
- Conforme AGENTS, testes de produto são remotos por rotas autorizadas; guards e typechecks são distintos de CI. Esta auditoria não executa nenhum deles.
- Reconciliar gates locais reutilizáveis e executar apenas faltantes/invalidados; um epic final cobre o conjunto integrado conforme regra do repositório.
- Reportar escopo do workflow e proteção efetiva da branch separadamente; ler um workflow não prova enforcement nem execução.

**Reuso:** Reaproveitar gates locais cujo candidato, escopo, inputs e contratos continuem válidos após o delta; não executar toda suíte comum cinco vezes.

**Paralelismo:** Gates independentes e escopados podem paralelizar; o epic final usa um candidato fechado.

**Critérios relacionados:** GO-A5, AC-09, SC-5, QS-4, DOD-2, DOD-4. **Fontes:** C-NORM, C-AGENTS, C-RUNTIME, C-INTEGRATION.

**Execução:** NOT_RUN; candidato, comandos e recibos: UNKNOWN.

## INT-11 — Dupla independente e disposição dos 50 critérios

**Dono:** ROOT. **Apoio:** integration/J1, integration/J2, S1, S2, S3, S4, S5. **Dependências:** INT-01, INT-02, INT-03, INT-04, INT-05, INT-06, INT-07, INT-08, INT-09, INT-10.

Evidências exigidas:

- Criar a dupla própria da integração em contextos novos e sem autoria; ambos recebem o mesmo pacote exato e cobrem todos os critérios pertinentes, sem ferramentas e sem links desacompanhados de corpos.
- Preservar decisões em destino autorizado; corrigir achados obrigatórios e reapresentar delta aos mesmos IDs. Nenhum terceiro voto remove veto.
- Consolidar evidência/veredictos dos 50 IDs, distinção local/global, docs/operator guidance, limites e uso atual; desconhecido crítico impede fechamento.
- A revisão estática pública desta auditoria é somente insumo; não se torna o par final, nem binding review ou aceite da união.
- Congelar o pacote de revisão após correções e emitir apenas projeção pública permitida; pareceres integrais privados não entram nesta entrega.

**Reuso:** Provas locais compatíveis alimentam o pacote; os pares locais e seus votos não substituem a nova dupla da união.

**Paralelismo:** Os dois juízes podem avaliar em paralelo; cada um cobre a mesma barra completa e correções voltam aos mesmos IDs.

**Critérios relacionados:** GO-A1, GO-I2, GO-I8, AC-01, AC-02, AC-04, QS-1, QS-2, QS-3, QS-5, QS-6, DOD-1, DOD-2, DOD-5, DOD-6, DOD-7. **Fontes:** C-NORM, C-JUDGING, C-COMPLETION, C-INTEGRATION.

**Execução:** NOT_RUN; candidato, comandos e recibos: UNKNOWN.

## INT-12 — Handoff, aceite humano e atos governados separados

**Dono:** ROOT. **Apoio:** owner. **Dependências:** INT-11.

Evidências exigidas:

- Selar payload imutável antes do handoff, sem SHA autorreferente; reler branch e artefatos/hashes.
- Registrar separadamente prontidão de revisão, aceite humano, landing e ativação; nenhuma etapa é inferida de documentação, teste ou parecer isolado.
- Manter falhas e obrigações abertas; só emenda explícita do dono altera contrato. Merge/deploy/ativação exigem os atos autorizados correspondentes.
- Conservar instruções de recuperação e não limpar recursos sem ownership verificado.

**Reuso:** Identidades, payloads e decisões anteriores são preservados; aceite do dono e integração governada não são reusados por inferência.

**Paralelismo:** Selagem/publicação e atos de aceitação têm sequenciamento explícito e um responsável.

**Critérios relacionados:** DOD-6, DOD-7. **Fontes:** C-NORM, C-HANDOFFS, C-COMPLETION, C-INTEGRATION.

**Execução:** NOT_RUN; candidato, comandos e recibos: UNKNOWN.

## Decisões pendentes

- SHAs dos handoffs selecionados, candidato de integração e release/capacidades S4.
- Casos privados de avaliação, limites reais de leitura/contexto e mecanismo observável de isolamento.
- Política/autoridade de publicação, proteção de branch e gates efetivamente aplicáveis ao delta.
- Garantia financeira demonstrável, reservas e limites autorizados; valores não expostos permanecem UNKNOWN.

As referências C-* resolvem no catálogo de `criteria-matrix.json` e `sources-C.json`. As descrições de limites do observador em INT-02 vêm de `transport.md` e `runtime.md` efetivamente lidos no pin do protocolo; não atribuem comportamento a um runtime-release posterior desconhecido. Os 50 IDs e seus significados continuam determinados pela fonte normativa, não por este plano.
