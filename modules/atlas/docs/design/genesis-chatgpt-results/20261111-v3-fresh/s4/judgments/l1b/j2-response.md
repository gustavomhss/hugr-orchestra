## WP-L1B — PASS semântico

**Juiz persistente:** `parallel-v3-fresh/S4/J2`  
**Execução:** `a2095d5a-1464-4c38-a222-6376974fc9c9`  
**Fonte:** `1cde2ff7a71bcf7aecb5d030917b577165135d38`  
**Protocolo:** `ee2521a5b966bd505cc95bd1c733e09e12f33531`  
**Oracle:** `94f980004f3ca5f88b59d24578848a6c84cc51faafa75c343b0c9451c5d5e15d`

**PASS para as quatro unidades L1 e para a correção semântica de inputs descrita em metadata-v2.** O conjunto preserva a população atribuída, explica mecanismos relevantes com utilidade de manutenção e distingue cobertura censitária, profundidade de leitura, evidência histórica e comportamento executado. Não identifiquei defeito obrigatório remanescente neste escopo estático.

Este parecer usa a **reposição integral de `coverage-governance.md`**, que substituiu a cópia com duplicação de transporte. O erro de transporte não foi tratado como alteração do candidato.

### Identidades julgadas

| Unidade | Bytes UTF-8 | SHA-256 do corpo | Decisão |
|---|---:|---|---|
| `S4:L1:atlas-engine` | 17.987 | `c0d39faabe422adcfb5a6b4e67b0d105931d90661b695fbcaa7571187b4f103e` | PASS |
| `S4:L1:atlas-host-genesis` | 17.595 | `97b3adc25e1a8754ebdbab0b27040403893e90d410df08a5c8f90520e3a0156d` | PASS |
| `S4:L1:continuity-rag` | 17.429 | `2a286b2570b9967c1e78ee14b671f333957a6a54c97427dc24feaec7ccab5b38` | PASS |
| `S4:L1:coverage-governance` | 17.988 | `201b5cc97ba7ae5b1148b98377a174ba3d00c8f4d9d521b4fadc6c1d69a03381` | PASS |

**Metadata-v2:** `6a1e451387b25dfec778f326bbdcd61fbbc95e90e819cfba7ce70da43493a058` — **PASS no escopo semântico da correção**.  
**Manifesto de transporte:** `5055ed46acc3bb5c5a6f605ed902ee6524adca095795f0f6c5af33c456f20d44`.

Os quatro corpos respeitam o limite informado de 18.000 bytes. As verificações de bytes, hashes, Git blobs e correspondência entre referências e inputs foram fornecidas pelo principal e pelo courier; este juiz não as reexecutou.

### Critérios obrigatórios

| Critério | Decisão | Evidência | Motivo |
|---|---|---|---|
| **AC-01** | PASS | Quatro corpos; `coverage-summary.md`; fechamento do principal; `observation-plan.md` | O escopo L1 atribuído está representado sem confundir preservação dos 2.220 paths com entendimento integral de todos os arquivos. As lacunas de profundidade permanecem explícitas. |
| **QS-1** | PASS | Trechos decisivos dos lotes 1–4 e mecanismos correspondentes nos corpos | As explicações preservam distinções relevantes: identidade e metadados laterais; modelos de referência e portas alcançadas; staging e publicação; histórico e corrente; revisão e autoridade. Os trechos fornecidos sustentam as afirmações centrais avaliadas. |
| **QS-2** | PASS | Tabelas e seções de manutenção; achados de Continuity/RAG; mapeamento do boundary | O conteúdo orienta mudanças concretas. Identifica acoplamentos que um mantenedor precisa preservar, incluindo canonicalização, observação, provenance, re-proof, archive/export, revisão/K/spans e a divergência das chaves de trace entre `ask` e proof. |
| **CC-1** | PASS | População, classes e profundidades; correspondência dos 41 grupos em `observation-plan.md` | Código, testes, fixtures, gerados, documentos, automação e história permanecem classificados. Grupos sem fonte semântica direta não recebem alegações individuais de comportamento por mera presença no inventário. |
| **CC-3** | PASS | Propósito, contratos, comportamento, impacto e manutenção nas quatro unidades | Cada unidade desenvolve sua finalidade e seus mecanismos relevantes. O conteúdo fornece explicação operacionalmente útil, com limites ligados às afirmações que restringem. |
| **CC-7** | PASS | Origem/profundidade na cobertura; rotas de geradores; arquivos históricos; correspondência por grupo em metadata-v2 | O pacote permite distinguir a origem de uma afirmação e o nível de leitura realizado. Mantém rotas úteis para aprofundamento sem promover mocks, arquivos antigos ou resultados gerados a evidência corrente. |
| **GO-I2** | PASS | Rótulos de observação/intenção/inferência; conflitos documentais de Continuity/RAG; limites de modelos e workflows | Divergências entre documentação e implementação são preservadas. Exemplos materiais incluem persistência de Continuity, entrada pública de RAG, status históricos de testes e superfícies atuais do handler. |
| **GO-I5** | PASS | “Observer limits are not scope limits”; observer tri-state; plano v2; falhas de archive/Store | Os oito paths limitados continuam preservados. Recusa de observação não vira ausência, exclusão da população ou certificado de atualidade. Falhas e resultados vazios recebem limites interpretativos explícitos. |
| **GO-I7** | PASS | Política/proveniência/ratificação; conteúdo histórico de recall; automação e revisões antigas; plano v2 | Prosa, nomes declarados, dados importados, schemas e receipts históricos não concedem autoridade. Re-proof, policy e portas governadas continuam separados da aceitação semântica. |
| **GO-I8** | PASS | Declarações de escopo; coverage summary; seções de testes, gerados e workflow | Hashes, contagens, formatos, fontes de testes e configuração de CI não são apresentados como suficiência semântica ou execução bem-sucedida. O pacote mantém essa distinção também na correção de metadados. |

### Resposta aos sete casos do oracle

| Caso | Decisão | Evidência e conclusão |
|---|---|---|
| **1. População exata e profundidade justificada** | PASS | O principal informou a conferência integral da população atribuída e do digest de paths; o courier confirmou 2.220 linhas únicas e correspondência de bytes/Git blobs. Os corpos e o plano mantêm fixtures, gerados e história, com classes e profundidades distintas. Os agrupamentos temáticos dos corpos não são apresentados como substitutos da composição por origem do oracle. |
| **2. RAG: admissão, Location, lexical/embedding e K** | PASS | `continuity-rag.md`, seções de admissão e revisão, preserva recusa de caminhos do projeto, admissão de documentos externos condicionada ao callback de permissão, lexical ativo, embedding desativado e K como parâmetro relevante da revisão/pipeline e dos proofs. Não atribui isso a uma execução do produto. |
| **3. Re-admissão e separação dos proofs** | PASS | O corpo distingue mesmos bytes de conteúdo alterado: identidade/status preservados no primeiro caso; identidade mantida e estado `not_yet_read` no segundo. Leitura/revisão não é tratada como retrieval, citação ou resposta de modelo. A divergência `record(revisionId, …)` versus `trace(questionId)` fica expressa, corroborada pelos trechos e testes com traces inseridos manualmente. |
| **4. Continuity: recuperação antes de máscara e defaults** | PASS | O corpo mantém archive antes da máscara, exigência de `context_recall`, ferramentas protegidas, janela normal de cinco passos, descarte de resumo obsoleto e defaults 0,4/0,7/3. Esses valores são descritos como código/configuração resolvida, sem atribuição ao usuário. |
| **5. Semântica, policy, ratify e provenance** | PASS | `atlas-host-genesis.md` distingue `trusted`, `tracked-staging` e `tracked-provable`; exige re-proof para a projeção provable e registra explicitamente que erro de Git é classificado como trusted. Actor/ratifier são declarações locais, não autenticação. Semântica não substitui essas portas. |
| **6. Gerados e história** | PASS | O mapeamento do boundary aponta fontes e gerador; mocks de UI mantêm origem histórica e ações simuladas; snapshots e arquivos gerados não ganham uma alegação de paridade executada. Receipts antigos não são reutilizados como novos votos. |
| **7. Genesis legado e evidência de execução** | PASS | Mining/staging, checkpoints, julgamento amostral e patches do workflow são descritos como mecanismos específicos. Não equivalem à entrega de um pacote Genesis nativo. Modelos permanecem sob configuração do operador; schemas e fontes de testes não são tratados como execução. |

### Julgamento específico de metadata-v2

**PASS.** A correção resolve a incompatibilidade declarada de v1 sem reduzir a população ou fabricar observações.

A justificativa de dependência passa a ser concreta: arquivos selecionados sustentam afirmações de comportamento, contrato ou geração; classificação censitária, por si só, não cria uma dependência semântica direta. O plano conserva os 41 grupos e explica quais contribuem com fontes diretas e quais permanecem como população/origem histórica.

O snapshot compacto recebe uma identidade própria e sustenta **afirmações sobre a captura fixa**, incluindo contagens e estrutura dos três logs históricos. Ele não é apresentado como versão observada dos arquivos `.atlas`, como leitura corrente desses arquivos ou como prova de atualidade dos gerados. Essa distinção torna a derivação aceitável para os corpos estáticos inalterados.

A correspondência informada pelo principal mantém cada `source_refs.path` como `file:<mesmo path>`, com hashes da origem, e todos os inputs declarados ficam dentro do limite; o maior tem 177.641 bytes. A materialização multipin é declarada, com `observed_head = null`, sem inventar um checkout único. O plano também exige recaptura e revisão quando mudam a revisão de origem, a população atribuída, a classificação ou uma contagem histórica alegada.

O parecer sobre essa correção se apoia no plano integral, recipe, recibo, projeções fornecidas e verificações independentes do principal. **Não é um parecer de runtime binding.**

### Findings e limites

**Findings obrigatórios:** nenhum remanescente para WP-L1B e metadata-v2 neste escopo.

**Sugestões opcionais:** nenhuma necessária para aceitação. Qualquer alteração posterior exige nova identificação dos bytes e nova medição; `atlas-engine` e `coverage-governance` têm apenas 13 e 12 bytes de margem, respectivamente.

L1A permanece cobertura anterior, com seu corpo e seu PASS restritos ao escopo já julgado. **WP-R0 não foi avaliado neste parecer.** Nenhuma execução, publicação, leitura por consumidor ou conclusão de S4 decorre deste PASS.