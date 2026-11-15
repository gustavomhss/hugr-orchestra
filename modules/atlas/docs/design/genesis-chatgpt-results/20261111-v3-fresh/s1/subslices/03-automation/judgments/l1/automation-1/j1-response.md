## J1 — automation-1: REQUEST_EVIDENCE

Recebidas as **2/2 partes**, a correção exclusiva de transporte da linha **“Arquivo GitLab”** e o marcador **FIM_DO_LOTE**. Julguei a linha recomposta conforme a correção, sem atribuir ao candidato a quebra introduzida pelo relay.

O parecer cobre **§0–3**, bytes UTF-8 **[0,17553)** de `producers/automation/body.md`, e a evidência literal recebida. Não usei ferramentas nem acessei arquivos.

**O recorte explica adequadamente diferenças de autoridade, identidade e confirmação. Há suporte direto para aspectos importantes de binding, cursor, CAS e readback. Entretanto, a seleção literal não contém os fluxos necessários para verificar boa parte dos contratos de parsing, autoria, leitura e recuperação descritos.** A decisão é **REQUEST_EVIDENCE**; não há, por ora, contradição factual demonstrada que imponha `FIX-FIRST`.

### Resultado por critério pertinente

| Critérios | Decisão neste lote | Localização e justificativa |
|---|---|---|
| **GO-A1, CC3** — entendimento transferível, comportamento e consequências | **REQUEST_EVIDENCE** | §1–3 ligam precondições, fases e estados a consequências concretas. Faltam os ramos completos de vários contratos que sustentam essas orientações. |
| **GO-A2, GO-A4, GO-I1** — construção cumulativa, reúso e preservação | **REQUEST_EVIDENCE** | §0 declara herança e preservação sem promover `supported` a aceite. O conteúdo histórico e sua disposição não foram fornecidos para verificar a continuidade substantiva. |
| **GO-A3, QS2, QS3** — consulta, utilidade e simplicidade | **PASS, restrito ao recorte** | A navegação por objetivo, a comparação entre providers e as tabelas de fases/estados tornam localizáveis as decisões relevantes. A sequência intenção → envio → observação ajuda a evitar conclusões indevidas. |
| **GO-A5, GO-I2, GO-I8** — atualidade, validade, autoridade e suficiência | **PASS, restrito ao recorte** | O texto distingue commit, hash local, versão nativa, acknowledgment e pós-condição; não equipara fonte válida, lint aceito ou dispatch confirmado a execução bem-sucedida. |
| **GO-A6, QS1, QS5, QS6** — verificação delimitada, fidelidade e evidência | **REQUEST_EVIDENCE** | Os trechos demonstram condições importantes, mas não bastam para aceitar as declarações completas sobre validação, paginação, mutações, classificadores e recuperação. |
| **QS4, CC7** — arquitetura, persistência e disposição | **REQUEST_EVIDENCE** | A separação entre fachada, binding, estado e ledger está clara. A persistência de state, o tratamento de corrupção e o lifetime da recuperação precisam dos fluxos indicados abaixo. |
| **CC1, AC01** — população e necessidades reconciliadas | **REQUEST_EVIDENCE** | Há referência às 204 fontes, mas falta a disposição individual pertinente a §0–3. As parcelas Board/agendamento serão avaliadas nos lotes correspondentes. |
| **GO-A7, GO-I7** — Atlas existente, fronteiras e governança | **PASS, restrito ao recorte** | O corpo não cria Atlas paralelo nem deduz autorização do conteúdo. Distingue política local de configuração do provider e não transfere automaticamente garantias de Actions ao Board. A comprovação dessa comparação entre componentes permanece vinculada aos lotes próprios. |
| **AC04** — produção sobre fontes; conflito, stale e conteúdo sem autoridade | **REQUEST_EVIDENCE** | Binding stale, cursor divergente, branch movida, readback insuficiente e YAML perigoso recebem tratamento explícito. Falta completar o suporte literal e a reconciliação da produção declarada. |

### Pedidos obrigatórios de evidência

#### RE-AUT1-01 — Herança e disposição do recorte

**Localização:** §0; histórico em `a8df22ae3a140c58c63f62ce2a634c84f415c943`; `coverage.jsonl`.

**Pergunta exata:** quais entendimentos e lacunas do corpo histórico foram preservados, aprofundados ou corrigidos por §0–3, e quais fontes individuais sustentam cada necessidade desse recorte?

- **Esperado:** reúso substantivo rastreável e disposição por fonte.
- **Observado:** declaração de herança, identidade do baseline e referência a arquivos de cobertura, sem seus conteúdos literais.
- **Evidência necessária:** corpo histórico ou intervalos decisivos, respectivas lacunas registradas e entradas de cobertura de §0–3. A reconciliação integral das 204 fontes pode acompanhar os demais lotes; não exijo aqui seu conteúdo substantivo fora do recorte.

#### RE-AUT1-02 — Fachada, binding e state

**Localização:** §1.1; A01–A03; `actions.ts`, `actions/binding.ts`, `actions/state.ts`.

**Pergunta exata:** quais fluxos completos sustentam construção preguiçosa, identidade imutável, revisão, validação de remotos e falha explícita de estado corrompido?

- **Esperado:** observar a ordem entre validação local, resolução de autenticação e uso da identidade confiável, além dos limites de persistência.
- **Observado:** A02 demonstra validação de URLs brutas/efetivas antes de `resolve` e releitura por ID/revisão. Os trechos de state mostram apenas parte dos validadores de path/provider.
- **Evidência necessária:** construção e aquisição dos serviços na fachada; canonicalização/matching de remotos, ambiente/limites do subprocesso Git, create/update/policy de binding; leitura, validação, mutex, permissões e publicação de state, incluindo caminhos de corrupção e symlink. As verificações não mostradas de capacidades/negações podem ser fornecidas nos lotes que já contenham A18/A20/A27, com vínculo explícito a este pedido.

#### RE-AUT1-03 — Identidade das leituras e diferenças entre providers

**Localização:** §1.2; A03–A07; parsers de identidade, catálogo/fonte, runs/jobs e paginação de GitHub/GitLab.

**Pergunta exata:** os adapters sustentam todas as diferenças da tabela, inclusive identidade de fonte, tentativa, filtros representáveis e completude de página?

- **Esperado:** poder verificar o que cada provider prova, sem generalizar garantias de um adapter para o outro.
- **Observado:** há suporte para vínculo do cursor, lookup GitHub por repository ID, hash/UTF-8 de fonte GitHub, preservação de `run_attempt`, ausência de tentativa fabricada GitLab e separação jobs/bridges. Faltam as validações e percursos que completam esses contratos.
- **Evidência necessária:** parsers de IDs/commits e regras de paginação; fluxo de leitura de fonte dos dois providers, incluindo SHA solicitado/resolvido, path e versões; criação do slot GitLab e uso de `ci_config_path`; verificação de run/tentativa nas páginas de jobs; tradução/recusa de filtros e gates por `/metadata`. Para a ressalva sobre comparação de SHA no GitLab, fornecer o fluxo de resolução relevante completo.

#### RE-AUT1-04 — Parser e projeção do grafo

**Localização:** §2.1; A08–A10; `actions/source/document.ts`, `graph.ts`, `github.ts` e `gitlab.ts`.

**Pergunta exata:** quais limites e regras efetivamente implementados sustentam a projeção local e seus estados `complete`, `partial` e `unresolved`?

- **Esperado:** verificar orçamento de parsing, rejeição de estruturas perigosas e semântica de dependências/herança.
- **Observado:** A08 demonstra orçamento de diagnósticos e uma recusa de chaves perigosas. A09 demonstra parcialidades de matrix/reusable; A10 mostra exclusão de templates ocultos e parte do tratamento de defaults. Isso ainda não demonstra o restante das regras descritas.
- **Evidência necessária:** constantes e aplicação dos limites, configuração do parser/schema, duplicatas/aliases/merges e validação das estruturas; construção/validação de `needs` e ciclos; resolução de `extends`, ordem de precedência, substituição de arrays e aplicação integral de defaults; tratamento de includes/references, optional needs, regras e demais parcialidades citadas.

#### RE-AUT1-05 — Autoria e confirmação de cada fase

**Localização:** §2.2; A11–A14 e parcela pertinente de A31; `actions/authoring/*`.

**Pergunta exata:** como cada fase congela sua entrada, valida precondições e qualifica o retorno/readback sem produzir retry ou rollback implícito?

- **Esperado:** suporte literal para os contratos de branch, arquivo e review e para a separação entre draft digest e versão nativa.
- **Observado:** A11 sustenta default branch observada, draft digest e recusa de branch movida. A12/A13 demonstram algumas precondições e confirmação de nova branch GitLab. A14 demonstra envio/classificação de status e parâmetros do lint. Os ramos centrais de escrita/readback de arquivo e review não aparecem.
- **Evidência necessária:** schemas/snapshot das entradas; branches de create/update de arquivo e suas verificações de retorno/readback em ambos os providers; prova qualificada de ausência, tratamento de texto idêntico e versões nativas; criação e validação de PR/MR; tratamento posterior ao envio e proteção dos erros contra reflexão de payload. Fornecer também a composição do resultado de lint e os dois editores de schedule citados, nos respectivos lotes se já previstos.

#### RE-AUT1-06 — Ledger, lifecycle e reconciliação

**Localização:** §3; A15–A17; `actions/operations.ts`, `operations/sql.ts`, `operations/storage.ts`, `readback.ts` e acknowledgments de retry referidos em A19/A22.

**Pergunta exata:** os fluxos completos sustentam unicidade, ausência de payload persistido, lease/deadline, recuperação única por banco e promoção somente por observação atribuída?

- **Esperado:** verificar o que impede novo envio, o que conserva incerteza e o que permite confirmação.
- **Observado:** A15 demonstra conflito de admissão e índice único; A16 demonstra CAS, amostragem de tempo sob transação e retenção da chave; A17 demonstra regras de observação por run. Faltam parte do schema persistido, finalização/classificação, recuperação e composição das observações.
- **Evidência necessária:** construção/normalização da intenção e schema do acknowledgment; campos persistidos e constantes de lease/deadline/limites; `unavailable`, `checkedAcknowledgement`, `definitive`, `finalize`, fechamento de Scope e recuperação de `sending`; método `reconcile`, merge/proibição de troca de IDs e início de `readback.ts` anterior à linha 14. Para a conclusão sobre retry sem nova tentativa, fornecer os acknowledgments concretos de A19/A22.

### Pontos já sustentados

- **Identidade confiável de binding:** A02, linhas 67–75, usa ID/revisão e o registro retido.
- **Cursor pertence a uma seleção específica:** A03, linhas 24–37, vincula binding, revisão, provider, host, projeto, escopo e filtros.
- **Hash GitHub confere bytes, não verdade da definição:** A04 sustenta a verificação descrita; o corpo conserva seu limite.
- **Draft hash não é versão otimista nativa:** A11, linhas 58–72, explicita essa distinção e detecta branch movida.
- **CAS precede o envio:** A16, linhas 138–165, sustenta o controle local e o timeout do trabalho reivindicado.
- **Retenção não libera a chave para reenvio:** A16/storage, linhas 88–99.
- **Dispatch sem atribuição permanece pending:** A17, linhas 14–35, não procura um run aproximado.
- **Confirmar dispatch não exige pipeline concluída:** o ramo `workflow.dispatch` recebido confirma identidade/ref/commit/evento sem exigir conclusão, coerente com §3.2.

Não há sugestão opcional condicionando a decisão. Os complementos solicitados são de leitura e evidência estática, sem exigência de execução de produto nesta fase.

**Continuam preservados:** os pareceres e pedidos anteriores de research; AC02/03/05/06/07/08/09/10; os 50 IDs globais; os demais lotes; e a separação entre suficiência semântica e binding de runtime.
