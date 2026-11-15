## J1 — boundaries: REQUEST_EVIDENCE

Recebidas **3/3 partes**, a correção de transporte das duas linhas de R012 e **FIM_DO_LOTE**. Parecer sobre o corpo integral declarado de `producers/boundaries/bodies/boundaries.md`, **22.938 bytes**, e a evidência literal recebida. Sem ferramentas.

**O corpo preserva adequadamente as fronteiras entre adaptador Core, engine externo, persistência, decisão e recibo.** Há suporte direto para limites importantes de move, recuperação local, shipping e settlement. Permanecem lacunas de evidência em partes substantivas das quatorze implementações e na reconciliação histórica/populacional. Nenhum defeito factual conclusivamente demonstrado impõe `FIX-FIRST` neste momento.

### Critérios

| Decisão | Critérios | Fundamentação |
|---|---|---|
| **PASS restrito ao corpo observado** | GO-A3; QS2–QS3 | A divisão por responsabilidade permite localizar contratos e limites sem confundir domínio Core com engine. |
| **PASS restrito ao corpo observado** | GO-A5; GO-I2, GO-I7–I8; GO-A7 | Hash, schema, checkpoint, decisão e recibo recebem autoridades distintas; as limitações de Atlas/Relay/RAG e da composição externa permanecem explícitas. |
| **REQUEST_EVIDENCE** | GO-A1–A2, GO-A4, GO-A6; QS1, QS4–QS6; CC1, CC3, CC7; GO-I1; AC01, AC04 | Dependem dos complementos abaixo. A falta de execução operacional não fundamenta esta decisão. |

### Evidência obrigatória ainda ausente

#### RE-BND-01 — População, herança e navegação

**Localização:** abertura, §1 e §7; cobertura, histórico boundaries/entry, manifest histórico, README/S01 e I01.

**Pergunta:** como as **24 fontes**, os entendimentos herdados e os vínculos externos declarados se reconciliam sem promover navegação a dependência aceita?

- **Esperado:** disposição das 14 implementações e dez testes; reúso rastreável; identidade preservada da entrada histórica.
- **Observado:** referências a arquivos não transportados; a projeção cita cobertura conjunta de 128 paths, compatível com a divisão declarada, mas sem mostrar sua composição.
- **Necessário:** entradas das 24 fontes e sua relação com as 104 de suporte; corpo histórico/intervalos decisivos e manifest; contratos selecionados dos dez testes; trechos de README/I01 usados; proposta de navegação quando for julgada. Evidência prevista no lote de suporte pode satisfazer as parcelas comuns, sem duplicação.

#### RE-BND-02 — Atlas e detecção de comandos

**Localização:** §2–§3.1; B01–B02/B06; `atlas.ts` e `relay-commands.ts`.

**Pergunta:** quais fluxos completam a seleção de raiz/indexador, delegação/mining e limites das sugestões de comandos?

- **Esperado:** distinguir comportamento executado pelo adaptador, intenção de comentários e inferência.
- **Observado:** R001–R005 sustentam wrappers, injeção de projectID, fallback sem store e a checagem explícita de `answer`. R011–R012 mostram intenção de detecção e prioridade dos runners.
- **Necessário:** seleção da raiz; `atlas.ts` **152–195**, **208–258** e **313–347**; detecção/classificação dos manifests e percurso pytest com limite/erros.

**Esclarecimento específico:** §2 atribui ao comentário de `mineWith` uma distinção entre “fluxo legado de tela” e “publicação Genesis”. R005 nomeia o fluxo como “Genesis mining from the screen” e diz que nada é promovido. Fornecer o trecho que sustenta aquela distinção textual ou qualificá-la como interpretação do autor, preservando a separação já correta entre staging e promoção.

#### RE-BND-03 — Relay: chave, execução, registro e recuperação

**Localização:** §3; B07–B10; `relay.ts`.

**Pergunta:** quais ramos sustentam continuidade da chave, timestamp do host, limites de execução e recuperação local?

- **Esperado:** comprovar os controles locais sem atribuir ao Core garantias internas do engine.
- **Observado:** há suporte para sandbox do gate, redaction limitada, helper Git distinto, pass sem recibo recusado e seleção temporal/local de locks.
- **Necessário:** B07 sobre paths, validação/criação concorrente da chave e recusa de chave inválida; `record` e capacidade do semáforo; partes omitidas do lançamento/limites de processo; `relay.ts` **390–418** para ordem registro→remoção do lock; **434–481** para trial/check e suas diferenças de registro/sanitização.

#### RE-BND-04 — Instalação, shipping e recovery de hooks

**Localização:** §4; B11–B14; `relay-hook-install.ts`, `relay-hook-shipper.ts`, `relay-hook-recovery.ts`.

**Pergunta:** o lifecycle completo preserva pins/identidade e distingue tentativa, decisão e recibo conforme descrito?

- **Esperado:** verificar install/update/pause/republish/remove, leitura segura, reparo e deduplicação de shipping.
- **Observado:** pin/schema/digest, vários checks de grafo, escrita temporária e mutex local estão demonstrados; shipping absorve falhas por grupo e recovery restringe placement.
- **Necessário:** operações de install/update/pause/republish/remove em **1–215**; conclusão do reparo **240–252**; trecho do grafo **274–282** e leitura/parse em **337–410**; ordenação dos eventos, construção do recibo, stamp do cache e gestão de `inFlight`; conclusão do loop recovery com contagem/erros. Não é necessário repetir os checks já recebidos.

#### RE-BND-05 — Binding, current step e settlement nativo

**Localização:** §5; B15–B20; `relay-workflow-*`.

**Pergunta:** como a cadeia completa liga publicação e materialização ao checkpoint, ao recibo autenticado e à disposition permitida?

- **Esperado:** verificar identidade, revalidação e limites de reúso/reparo sem novo grading.
- **Observado:** estão demonstrados pin da versão, comparação de skills/materialização/conhecimento, verificações de anchors, multiplicidade de binding, fence antes do checkpoint e partes substanciais da autenticação/reparo.
- **Necessário:** aquisição/materialização e checks de aceitação em `binding.ts` **62–128**; referências globais/WP e resolver em **149–222**; restante de `currentstep.read`/projeção, incluindo holder, pending e conteúdo não expandido; registro/finalizer do host e reconcile; início de transition **35–66**, leitura/escrita/limpeza do checkpoint; evaluator **29–49**, **71–105** e **150–169**, além dos helpers de identidade/disposition pertinentes.

Esses intervalos devem mostrar a origem e validação do recibo, não apenas seu schema ou comentário.

#### RE-BND-06 — Move e persistência RAG

**Localização:** §6; B03–B05/T01; `control-plane/move-session.ts`, `workspace.sql.ts`, `rag-studio/sql.ts`.

**Pergunta:** quais precondições delimitam a transferência e quais definições efetivas sustentam os limites atribuídos ao schema RAG?

- **Esperado:** verificar origem/destino/projeto e o alcance da preservação; comprovar as tabelas/índices descritos.
- **Observado:** R006–R007 demonstram aplicação→evento→discard e erro posterior possível; workspace aparece como persistência. Sobre RAG, foram recebidos principalmente comentários e fragmentos.
- **Necessário:** precondições de move anteriores à linha **87**, e contratos de teste pertinentes à preservação por path/index; `rag-studio/sql.ts` **1–81 integral**, para conferir tabelas, ausência de FK/embedding e caráter não único do índice location/path. Não se exige fonte externa para qualificar um engine que o corpo explicitamente não qualifica.

### Pontos sustentados que devem permanecer

- Move pode deixar destino/evento alterados antes de falhar no descarte da origem.
- Gate aprovado sem registro correspondente resulta em `unavailable/unrecorded`.
- Shipping pode absorver falhas; zero erros reportados não demonstra todos os recibos.
- Recuperação de hooks é delimitada ao placement implicit-local observado.
- Versão pinada, materialização, anchors, fence e recibo autenticado têm funções distintas.
- A ausência de retrieval nesta folha SQL não autoriza concluir ausência de retrieval no produto inteiro.

**Continuidade:** pareceres anteriores preservados. Nenhum aceite externo, fechamento global, binding ou resultado de runtime decorre deste parecer.