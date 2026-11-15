## REQUEST_EVIDENCE — automation-1, §0–3

**J2 — completude/utilidade.** Recebidas as duas partes e **FIM_DO_LOTE**. O parecer cobre o recorte declarado `[0,17553)` de `producers/automation/body.md`, SHA-256 `2ed7670affc680005840d0918489cb1ac36e1c5a4021defcc57ae44186ae7459`, e os trechos A01–A17 apresentados.

O corpo fornece uma explicação útil de identidade nativa, autoria em fases e limites de confirmação. A distinção entre **accepted**, **confirmed** e conclusão da pipeline é especialmente bem sustentada por A17. Entretanto, **as provas transportadas ainda não cobrem vários contratos centrais afirmados sobre binding/estado, parsing, escrita/readback e recuperação do ledger**. A existência de referências ao archive não permite decidir sua fidelidade sem receber os intervalos pertinentes.

Não há contradição comprovada no material recebido que determine **FIX-FIRST**.

### Avaliação por critérios pertinentes

| Critérios | Localização | Avaliação e fundamento |
| --- | --- | --- |
| GO-A1, GO-A2, QS2, QS3 | “Como usar”; §1–3 e tabelas | **Favorável no conteúdo observado.** A progressão de vínculo, leitura, proposta, envio e observação é transferível e ajuda a localizar a etapa que sustenta cada conclusão. |
| GO-A3, GO-A4, QS6 | Navegação e referências A01–A17; abertura histórica | **REQUEST_EVIDENCE.** A consulta necessária é indicada, mas faltam partes substantivas das fontes e a base literal do reúso histórico. |
| GO-A5, GO-A6, GO-I2, GO-I7, GO-I8 | Vocabulário; §1.1, §2.1 e §3.2 | **Atendidos no enquadramento observado.** O texto separa observação estática, intenção, autorização, integridade, estado remoto e suficiência semântica. Hashes e nomes de estados não são tratados como prova universal. |
| QS1, QS5, CC3 | §1–3 | **REQUEST_EVIDENCE.** Há afirmações operacionais específicas cuja base literal está incompleta, conforme os pedidos abaixo. |
| QS4, GO-I1, CC7 | Abertura; §1.1 e §3.1 | **Parcialmente sustentados.** A15–A16 demonstram aspectos de identidade e preservação da admissão. Persistência do binding, recuperação e disposição histórica exigem os trechos restantes. |
| CC1, AC01 | “204 fontes”; mapa de uso | **REQUEST_EVIDENCE.** Falta a disposição das fontes pertinentes a este recorte. A reconciliação integral das 204 pode acompanhar a revisão dos demais recortes, sem antecipar seu aceite. |
| AC04 | §1–3 | **REQUEST_EVIDENCE sem execução adicional.** O corpo aborda entrada insegura, stale, conflitos e resultado incerto; falta verificar alguns mecanismos que sustentam essas afirmações. |
| GO-A7 | Limites da produção e separação de superfícies | **Compatível com a fase.** Nenhuma operação Atlas ou de consumidor é autorizada ou comprovada pelo conteúdo. |

### Evidência necessária

**RE-AUT1-01 — População pertinente e reúso histórico**  
**Localização:** abertura, “Como usar este L1”; `coverage.jsonl`.

**Pergunta:** quais fontes individuais sustentam §0–3, e qual entendimento histórico foi preservado ou ampliado nesta produção?

**Falta:** projeção literal das disposições de cobertura pertinentes a este lote, incluindo as fontes auxiliares necessárias aos claims; identificação e intervalos do corpo histórico reutilizado, com a correspondência para o conteúdo novo. A reconciliação integral das 204 fontes pode ser fornecida uma vez para o conjunto automation.

O texto preserva corretamente a distinção entre `supported` histórico e aceite novo; não o considero prova do próprio reúso.

---

**RE-AUT1-02 — Binding, estado e leitura confiável**  
**Localização:** §1; A01–A07.

**Pergunta:** os caminhos completos sustentam a construção preguiçosa, as recusas de identidade e as garantias de leitura atribuídas aos adapters?

**Falta:**

- `actions.ts`: criação diferida dos serviços e caminho de resolução apenas sob demanda.
- `binding.ts`: canonicalização/match de remoto, resolução física, construção do subprocesso Git e criação/update com identidade imutável e revisão.
- `state.ts`: localização externa, decode estrito, leitura corrompida, controles de caminho/symlink, permissões e escrita/mutex.
- Parsers de IDs, paginação e filtros de GitHub/GitLab: intervalos que fundamentem precisão de IDs, recusas de filtros e tratamento de continuação incompleta.
- `github/catalog.ts` e `gitlab/catalog.ts`: resolução e conferência de commit/path; construção da versão GitLab com `blob_id`/`last_commit_id`; construção do slot único e tratamento de `ci_config_path`.
- `github/jobs.ts`: conferência posterior de run/tentativa e paginação; `gitlab/jobs.ts`: continuação das duas coleções.

**Já sustentado:** A02 mostra verificação das URLs brutas/efetivas antes de autenticação e releitura do binding por ID/revisão; A03 mostra cursor e capacidades qualificadas; A04 comprova acesso por repository ID e validação dos bytes GitHub; A05–A07 demonstram diferenças importantes de tentativa e tempos.

---

**RE-AUT1-03 — Limites e semântica do parser**  
**Localização:** §2.1; A08–A10.

**Pergunta:** quais ramos aplicam efetivamente os orçamentos e as regras de interpretação afirmadas?

**Falta:** constantes e aplicação dos limites de `source/document.ts`, configuração segura do YAML, tratamento de duplicatas/aliases/merges; em `source/github.ts`/`graph.ts`, construção e validação de `needs`; em `source/gitlab.ts`, resolução de `extends`, precedência de pais/filho, substituição de arrays, cópia de defaults e tratamento de referências opcionais/obrigatórias e ciclos.

A08 comprova acumulação limitada de diagnósticos e recusa de chaves sensíveis. A09–A10 comprovam algumas marcações de parcialidade e exclusão de templates ocultos. Esses intervalos ainda não demonstram o conjunto das regras descritas.

---

**RE-AUT1-04 — Autoria, congelamento e readback por fase**  
**Localização:** §2.2; A11–A14 e A31.

**Pergunta:** cada fase confere as identidades e pós-condições que a tabela atribui à implementação?

**Falta:**

- Schemas e preparação que sustentam congelamento antes do primeiro `await`, recusa de extras e delimitação do payload por operação.
- `authoring/github.ts` e `authoring/gitlab.ts`: ramos de escrita create/update, precondições de versão, conteúdo idêntico e planos de review.
- `authoring/remote.ts`: `absent`, validações de acknowledgment/readback, atribuição de projeto/ator/head e conversão de falha após escrita.
- `authoring/lint.ts`: aplicação do resultado e preservação de parcialidade.
- Os dois editores de schedule citados em A14/A31: caminhos admitidos e recusas pertinentes.

A11 sustenta base observada, digest local e detecção de branch movida; A13 mostra confirmação exata de branch GitLab; A14 mostra classificação do envio. Os trechos não demonstram ainda as pós-condições de arquivo/review da tabela.

---

**RE-AUT1-05 — Admissão, estados e recuperação do ledger**  
**Localização:** §3.1; A15–A16.

**Pergunta:** quais implementações completam o contrato de estado e preservação da identidade após falha, interrupção ou expiração?

**Falta:** intervalos de `operations.ts`, `operations/sql.ts` e `operations/storage.ts` que mostrem:

- campos admitidos e persistidos, vinculação de Location/projeto/diretório/workspace/provider/ator;
- constantes de lease, deadline, retenção e limites;
- `checkedAcknowledgement`, classificador definitivo e `finalize`;
- recuperação de `sending` uma vez por lifetime do serviço de banco;
- fechamento do Scope e espera/encerramento das fibers.

A15–A16 comprovam unicidade, conflito de intenção, CAS de `prepared` para `sending`, timeout no caminho mostrado e retenção da chave. Ainda não demonstram todos os estados e garantias descritos, em particular a ausência de payload/segredo persistido e a recuperação entre reconstruções de Location.

---

**RE-AUT1-06 — Reconciliação e acknowledgment efetivo de retry**  
**Localização:** §3.2; A17, A19 e A22.

**Pergunta:** o serviço restringe a reconciliação aos estados declarados e conserva as identidades atribuídas ao combinar observações?

**Falta:** função `reconcile` de `operations.ts` e combinação/validação dos acknowledgments; intervalos A19/A22 dos comandos de retry que fundamentem a afirmação de que o acknowledgment GitHub retorna runID sem nova tentativa e de que o caminho GitLab não fabrica tentativa.

**Já sustentado:** o roteamento genérico em A01 e o observador A17 demonstram pending sem atribuição, requisitos de dispatch/cancel/retry e inexistência de uma pós-condição genérica para os demais kinds no trecho mostrado. Não peço execução remota para corroborar isso.

### Estado do parecer

**Defeito obrigatório comprovado:** nenhum por ora. Os pedidos são lacunas probatórias identificadas, sem presumir erro no corpo.

**Sugestões opcionais:** nenhuma condicionante adicional.

A decisão permanece **REQUEST_EVIDENCE** para automation-1. As comparações introdutórias com Board e ScheduledTask serão verificadas nos respectivos recortes; este parecer não as converte em cobertura concluída. As obrigações operacionais, os 50 IDs globais e qualquer binding de runtime permanecem abertos.
