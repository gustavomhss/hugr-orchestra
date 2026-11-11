## Parecer J2 — L1-A v1

**Veredito: REQUEST_EVIDENCE**, limitado à afirmação de que **escritas novas usam o ID canônico `backend`**. Não identifiquei contradição demonstrada no corpo. O complemento resolve a questão de composição de permissões de R2; permanece uma lacuna delimitada de prova em R1.

Avaliação independente do corpo SHA-256 `75b4438d79ebd9667db94f03a6fea884329cd5c72e2c69f649eff1047e7b1918`, com base exclusivamente no material fornecido. Nenhuma ferramenta, consulta, edição ou execução foi realizada.

### Critérios obrigatórios

| Critério | Status | Localização e motivo |
|---|---|---|
| **C1 / QS1 — fidelidade, autoridade e fonte exata** | **REQUEST_EVIDENCE** | Cabeçalho, convenção de evidência e §2. Repo, commit, unidade e proveniência estão explícitos; o texto distingue código, intenção e interpretação. Os recortes sustentam os limites decisivos apresentados. Contudo, a definição isolada de `canonicalMemberId` demonstra a conversão do alias, sem demonstrar que os pontos de escrita efetivamente usam o resultado canônico. Pedido delimitado abaixo. |
| **C2 / CC1 — cobertura e classificação sem exclusões** | **PASS** | §7 e reconciliação fornecida. As classes de Maestro somam 325 paths; as associadas somam 99; total de 424. A conferência contra a população congelada foi expressamente informada como sem faltas, extras ou duplicatas. Histórico, fixtures, assets e conteúdo gerado permanecem classificados. Este PASS cobre **L1-A**; não fecha sozinho os 4.553 paths de S3. |
| **C3 / CC2–3 / GO-A1–3 — utilidade e progressão** | **PASS** | §§1–7. O corpo fornece donos, portas, disponibilidade, autoridade, packaging e falhas concretas. Permite localizar o contrato adequado antes de aprofundá-lo. O encaminhamento L2→L3→L4 é específico: contratos locais, relações com Core/Relay/Atlas/adapters e, depois, manutenção e diagnóstico. Nenhuma camada posterior é apresentada como concluída. |
| **C4 / GO-I1,2,7 / QS4 — preservação, identidade, fronteiras e gerados** | **PASS** | §§1–2, 5–7. Preserva a distinção entre ID e label sem reproduzir o literal legado; separa código distribuído de conteúdo de manutenção; explicita o módulo virtual, árvores embutidas e READMEs com blocos gerados. As fronteiras do host, Core e Arsenal são mantidas. Divergências documentais e compatibilidades permanecem visíveis, sem reescrever a intenção histórica como comportamento atual. A prova operacional da escrita canônica fica pendente em C1/R1. |
| **C5 / GO-I8 / QS5–6 — honestidade da evidência e economia** | **PASS** | Abertura, convenção de evidência, §§6–7 e dados de entrega. O texto separa 73 paths internos inspecionados, sete fontes de fronteira e a população inventariada. Não converte testes lidos, documentação, hashes ou conferência de bytes em execução. Os 19.752 bytes declarados respeitam o limite de 20.000. As lacunas registradas são úteis para decisões posteriores. |

### Obrigações do oracle congelado

| Obrigação | Status | Fundamentação |
|---|---|---|
| **R1 — Maestro fixo, backend estável, label configurável, alias de leitura e escrita canônica** | **REQUEST_EVIDENCE** | A regra de nome fixo e a distinção ID/label estão sustentadas por `AGENTS.md`; o helper fornecido demonstra a normalização do alias legado para `backend`; o literal não foi reproduzido. Falta o trecho que demonstra o uso do ID canônico no caminho de escrita afirmado pelo §2. |
| **R2 — direct/review, grants, governança e limites do conductor** | **PASS** | O complemento mostra `review` e `direct` iniciando em `* : deny`, com permissões explícitas posteriores. `seatProfile` adiciona grants declarados; `floor` os aplica após config; `visibility` acrescenta restrições; a avaliação usa a última regra compatível, e CallerGate avalia `task` pelo próprio profile. Isso sustenta a leitura do corpo: carregar uma skill não cria por si só poderes de edição, shell, delegação ou publicação. O texto também preserva a distinção entre charter do conductor e microedições medidas, e não trata planos ou grants como autoaprovação. |
| **R3 — conhecimento distribuído, árvores embutidas e ausência de prova de runtime por docs** | **PASS** | §5 corresponde à fronteira explícita de `AGENTS.md`: prompts e skills distribuídas carregam conhecimento necessário em runtime; manutenção e ownership permanecem no repositório. Os recortes de `seat-skill-root.ts` e `build.ts` sustentam o caminho embutido. O conflito documental é preservado, e o corpo nega expressamente ter executado o binário ou build distribuído. |

### Pedido único de evidência

**Localização:** §2, frase: “O antigo ID de backend deriva de `BACKEND_DEFAULT_LABEL` e é canonicalizado para `backend` na leitura; **escritas novas usam o ID canônico**.”

- **Esperado:** um ponto de escrita do pin que persista ou emita o ID canônico, mostrando a normalização do alias ou a construção obrigatória a partir da identidade canônica.
- **Observado:** foi fornecida a função `canonicalMemberId`; os trechos de composição de profiles e agentes não mostram o caminho de escrita que sustenta essa afirmação geral.
- **Resolução:** fornecer o trecho exato do writer e, se a normalização ocorrer antes dele, a chamada correspondente. Se existirem famílias de escrita distintas relevantes à frase, delimitar quais estão cobertas. Alternativamente, restringir a afirmação ao comportamento comprovado pelos trechos disponíveis.

**Pergunta delimitada:** qual trecho do commit `1cde2ff7a71bcf7aecb5d030917b577165135d38` demonstra que uma entrada com o alias histórico resulta em **nova escrita com `backend`**, e qual é o escopo desse caminho de escrita?

Não há correção substantiva adicional exigida neste parecer. Os PASS acima são de **revisão estática L1-A** e não aprovam runtime, L2–L4, Atlas, CI ou consumidores.
